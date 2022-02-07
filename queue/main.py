from mgz.summary import Summary
import json
import sys
from datetime import datetime, timedelta
from io import BytesIO
import zipfile
import requests
from google.cloud import storage
import os


# 2918752


def pick(obj, keys):
    output = {}
    for key, value in obj.items():
        if key in keys:
            output[key] = value
    return output


def json_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, timedelta):
        return int(obj.total_seconds())
    raise TypeError("Type %s not serializable" % type(obj))


class GoogleCloudStorage:
    def __init__(self, bucket_name="aoe2-recording"):
        self.client = storage.Client()
        self.bucket = self.client.bucket(bucket_name)

    def write(self, name, content):
        blob = self.bucket.blob(name)
        blob.upload_from_file(content)

    def read(self, name):
        blob = self.bucket.blob(name)
        return BytesIO(blob.download_as_bytes())

    def exists(self, name):
        return storage.Blob(bucket=self.bucket, name=name).exists()


def read_zip(content):
    with zipfile.ZipFile(content, "r") as zip_ref:
        for file in zip_ref.filelist:
            if file.filename.endswith(".aoe2record"):
                data = zip_ref.read(file.filename)
                bytes_io = BytesIO(data)
                return bytes_io


def download_recording(match_id, player_ids):
    profile_id = player_ids.pop()
    response = requests.get(
        f"https://aoe.ms/replay/?gameId={match_id}&profileId={profile_id}"
    )
    if response.ok == False:
        download_recording(match_id, player_ids)
    else:
        return read_zip(BytesIO(response.content))


def extract_api(match, item=None):
    if item is None:
        item = {}
    if "players" not in item:
        item["players"] = {}
    item.update(
        pick(
            match,
            [
                "match_id",
                "ranked",
                "speed",
                "server",
                "started",
                "finished",
                "rating_type",
                "game_type",
                "leaderboard_id",
            ],
        )
    )
    item["started"] = datetime.fromtimestamp(item["started"])
    item["finished"] = datetime.fromtimestamp(item["finished"])
    item["duration_real"] = item["finished"] - item["started"]
    for player in match["players"]:
        data = pick(player, ["name", "profile_id", "country"])
        if item["players"].get(player["profile_id"]):
            item["players"][player["profile_id"]].update(data)
        else:
            item["players"][player["profile_id"]] = data
    return item


def extract_aoe2record(recording, item=None):
    if item is None:
        item = {}
    if "players" not in item:
        item["players"] = {}
    summary = Summary(recording)
    platform = summary.get_platform()
    map_ = summary.get_map()
    item["uuid"] = platform["platform_match_id"]
    item["map"] = {"id": map_["id"], "name": map_["name"]}
    item["duration_in_game"] = timedelta(seconds=int(summary.get_duration() / 1000))

    players = summary.get_players()

    teams = {}
    index = 0
    for team in summary.get_teams():
        index += 1
        for player_id in list(team):
            teams[player_id] = index
    for player in players:
        user_id = player.get("user_id")
        civilization_id = player.get("civilization")
        data = {
            "team": teams[player.get("number")],
            "name": player.get("name"),
            "winner": player.get("winner"),
            "color_id": player.get("color_id"),
            "civilization": {
                "id": civilization_id,
            },
        }
        if item["players"].get(user_id) is not None:
            item["players"][user_id].update(data)
        else:
            item["players"][user_id] = data
    return item


class RecordingNotFoundError(Exception):
    pass


def match_for_player(profile_id, count=1, start=0):
    # 1. fetch last N matches for profile_id
    response = requests.get(
        f"https://aoe2.net/api/player/matches?game=aoe2de&profile_id={profile_id}&count={count}&start={start}"
    )
    if response.ok:
        # 2. which games have been already process? TODO
        # 3. trigger /download function for un-process matches
        matches = response.json()
        for match in matches:
            # TODO go throug pub/sub
            download(match["match_id"])


def download(match_id):
    storage = GoogleCloudStorage()
    if not storage.exists(match_id):
        sys.stdout.write(f"download match_id={match_id}\n")
        # 1. fetch https://aoe2.net/api/match?match_id=match_id
        response = requests.get(
            f"https://aoe2.net/api/match?game=aoe2de&match_id={match_id}"
        )
        if response.ok:
            match = response.json()
            player_ids = [player["profile_id"] for player in match["players"]]
            # 2. fetch recursively until successful: https://aoe.ms/replay/?gameId={match_id}&profileId={profile_id}
            recording = download_recording(match_id, player_ids)
            if recording:
                # 4. save aoe2record on google cloud storage
                storage.write(match_id, recording)
            else:
                # raise RecordingNotFoundError(f"recording not found for {match_id}")
                pass
    # 5. pass along to /parse function
    parse(match_id)


def parse(match_id):
    sys.stdout.write(f"parse match_id={match_id}\n")
    # 1. fetch https://aoe2.net/api/match?match_id=match_id
    response = get_match(match_id=match_id)
    if response.ok:
        match = response.json()
        item = extract_api(match)
        # 2. load aoe2record from google cloud
        storage = GoogleCloudStorage()
        if storage.exists(match_id):
            recording = storage.read(match_id)
            # 3. parse it with mgz
            item.update(extract_aoe2record(recording, item))
        # 4. save data to backend TODO
        return item
        # requests.post(f"api/{match_id}", data=item)


def get_match(**kwargs):
    params = {"game": "aoe2de"}
    params.update(kwargs)
    return requests.get(f"https://aoe2.net/api/match", params=params)


def get_strings(**kwargs):
    params = {"game": "aoe2de", "language": "en"}
    params.update(kwargs)
    return requests.get(f"https://aoe2.net/api/strings", params=params)


def from_files(directory):
    response = get_strings()
    output = {
        "matches": [],
        "civilizations": {
            civ["id"]: {"name": civ["string"]} for civ in response.json()["civ"]
        },
    }
    files = os.listdir(directory)
    for file in files:
        with open(os.path.join(directory, file), "rb") as recording:
            try:
                match = extract_aoe2record(recording)
                response = get_match(uuid=match["uuid"])
                match.update(extract_api(response.json(), match))
                requests.post(
                    f"http://localhost:3000/api/{match['match_id']}",
                    data=json.dumps(match, default=json_serializer),
                )
                output["matches"].append(match)
            except Exception as exception:
                sys.stderr.write(f"failed to parse {file} {exception}")
    return output


def from_publisher(event, context):
    print(event)
    print(context)


if __name__ == "__main__":
    output = {}
    if sys.argv[1] == "api":
        output = match_for_player(sys.argv[2])
    elif sys.argv[1] == "file":
        output = from_files(sys.argv[2])
    print(json.dumps(output, default=json_serializer))
