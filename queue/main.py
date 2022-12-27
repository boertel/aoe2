from mgz.summary import Summary
from mgz import header, fast

import pprint
from functools import wraps
import json
import sys
from datetime import datetime, timedelta
from io import BytesIO
import zipfile
import requests
from google.cloud import storage, pubsub_v1
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
        data = pick(
            player, ["name", "profile_id", "country", "rating", "rating_change"]
        )
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
            "color": player.get("color_id"),
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


project_id = os.environ["GOOGLE_PUBSUB_PROJECT_ID"]
topic_id = "aoe2-recording"
publisher = pubsub_v1.PublisherClient()


API_DOMAIN = os.environ["API_DOMAIN"]


def create_delay(topic_id):
    def delay(*args, **kwargs):
        attributes = kwargs
        topic_path = publisher.topic_path(project_id, topic_id)
        print(topic_path, attributes)
        future = publisher.publish(topic_path, b"", **attributes)
        print(future.result())

    return delay


def task():
    def decorator(func):
        func.delay = create_delay(func.__name__)
        func.run = func

        @wraps(func)
        def wrapper(event={}, context=None):
            kwargs = {"event": event, "context": context}
            if "attributes" in event:
                kwargs.update(event["attributes"])
            print(f"calling {func.__name__} with kwargs={kwargs}")
            func(**kwargs)

        # TODO register cloud function
        return wrapper

    return decorator


# 1. sync aoe2.net with aoe2.up.railway
# 2. trigger download for match with a ao2.up.railway id
# 3. trigger parse


def parse_strings(response):
    strings = response.json()
    maps = {}
    for map_type in strings["map_type"]:
        maps[map_type["id"]] = {
            "id": map_type["id"],
            "name": map_type["string"],
        }
    civilizations = {}
    for civ in strings["civ"]:
        civilizations[civ["id"]] = {
            "id": civ["id"],
            "name": civ["string"],
        }

    return maps, civilizations


@task()
def match_for_player(profile_id=None, start=0, count=20, **kwargs):
    print(f"match_for_player player_id={profile_id}")
    if profile_id is None:
        return
    # 1. fetch last N matches for profile_id
    strings = requests.get(f"https://aoe2.net/api/strings?game=aoe2de&language=en")

    maps, civilizations = parse_strings(strings)

    response = requests.get(
        f"https://aoe2.net/api/player/matches?game=aoe2de&profile_id={profile_id}&count={count}&start={start}",
        timeout=10,
    )
    if response.ok:
        # 3. trigger /download function for un-process matches
        matches = response.json()[0:1]
        for match in matches:
            match["map"] = maps.get(match["map_type"])
            for player in match["players"]:
                player["civilization"] = civilizations.get(player["civ"])

        bulk = requests.post(f"{API_DOMAIN}/api/matches", json=matches, timeout=10)
        for match in bulk.json():
            download.run(match_id=match["id"])


def update_match_status(match_id, status):
    return requests.patch(
        f"{API_DOMAIN}/api/matches/{match_id}",
        json={"status": status},
        timeout=10,
    )


@task()
def download(match_id=None, **kwargs):
    print(f"download match_id={match_id}")

    if match_id is None:
        return

    response = update_match_status(match_id, "DownloadStarted")
    match = response.json()

    if match["status"] != "Fetched":
        # match has already been process, let's bail
        # return
        pass

    storage = GoogleCloudStorage()
    if not storage.exists(match_id):
        player_ids = [player["playerId"] for player in match["players"]]
        # 1. fetch recursively until successful: https://aoe.ms/replay/?gameId={match_id}&profileId={profile_id}
        recording = download_recording(match_id, player_ids)
        if recording:
            # 2. save aoe2record on google cloud storage
            storage.write(match_id, recording)
            update_match_status(match_id, "DownloadEnded")
        else:
            update_match_status(match_id, "DownloadFailed")

    # 5. pass along to /parse function
    # parse.run(match_id=match_id)


@task()
def parse(match_id=None, **kwargs):
    print(f"parse match_id={match_id}")
    # 1. fetch match
    response = update_match_status(match_id, "ParseStarted")
    if response.ok:
        item = {}
        # item = extract_api(match)
        # 2. load aoe2record from google cloud
        storage = GoogleCloudStorage()
        try:
            if storage.exists(match_id):
                recording = storage.read(match_id)
                # 3. parse it with mgz
                item.update(extract_aoe2record(recording, item))
        except Exception:
            update_match_status(match_id, "ParseFailed")
            print("failed to load from google storage")
        # 4. save data to backend
        print(item)

        # requests.post(
        #    f"{API_DOMAIN}/api/match/{match_id}",
        #    data=json.dumps(item, default=json_serializer),
        #    timeout=10,
        # )
        update_match_status(match_id, "ParseEnded")
        return item


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
    files = os.listdir(directory)
    for file in files:
        with open(os.path.join(directory, file), "rb") as recording:
            try:
                match = extract_aoe2record(recording)
                response = get_match(uuid=match["uuid"])
                match.update(extract_api(response.json(), match))
                requests.post(
                    f"{API_DOMAIN}/api/match/{match['match_id']}",
                    data=json.dumps(match, default=json_serializer),
                )
            except Exception as exception:
                sys.stderr.write(f"failed to parse {file} {exception}")


if __name__ == "__main__":
    # call `.run` to run function locally
    if sys.argv[1] == "match_for_player":
        match_for_player.run(profile_id=sys.argv[2])
    elif sys.argv[1] == "download":
        download.delay(match_id=sys.argv[2])
    elif sys.argv[1] == "parse":
        parse.run(match_id=sys.argv[2])
    elif sys.argv[1] == "import":
        from_files(sys.argv[2])
