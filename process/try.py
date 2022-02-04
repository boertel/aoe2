from mgz.summary import Summary
import sys
import json
from pprint import pprint
from datetime import datetime, timedelta
from os.path import exists
from io import BytesIO
import zipfile
import requests


# 2918752
profile_id = sys.argv[1]

count = 10
try:
    count = int(sys.argv[2])
except:
    pass

start = 0
try:
    start = int(sys.argv[3])
except:
    pass


response = requests.get(
    f"https://aoe2.net/api/player/matches?game=aoe2de&profile_id={profile_id}&count={count}&start={start}"
)


def pick(obj, keys):
    output = {}
    for key, value in obj.items():
        if key in keys:
            output[key] = value
    return output


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""

    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, timedelta):
        return int(obj.total_seconds())
    raise TypeError("Type %s not serializable" % type(obj))


def download_recording(match_id, player_ids):
    recording = f"./recording/AgeIIDE_Replay_{match_id}.aoe2record"
    if not exists(recording):
        profile_id = player_ids.pop()
        response = requests.get(
            f"https://aoe.ms/replay/?gameId={match_id}&profileId={profile_id}"
        )
        if response.ok == False:
            download_recording(match_id, player_ids)
        else:
            with zipfile.ZipFile(BytesIO(response.content), "r") as zip_ref:
                zip_ref.extractall("./recording")

    return recording


output = []
matches = response.json()
for match in matches:
    match_id = match["match_id"]
    item = pick(
        match,
        [
            "match_id",
            "ranked",
            "speed",
            "server",
            "started",
            "finished",
        ],
    )
    item["started"] = datetime.fromtimestamp(item["started"])
    item["finished"] = datetime.fromtimestamp(item["finished"])
    item["duration_real"] = item["finished"] - item["started"]
    item["players"] = {
        player["profile_id"]: pick(player, ["name", "profile_id", "country"])
        for player in match["players"]
    }

    try:
        recording = download_recording(match_id, list(item["players"].keys()))

        # TODO should read name from zip
        with open(recording, "rb") as data:
            summary = Summary(data)
            civilizations = {}
            if hasattr(summary, "reference"):
                civilizations = summary.reference["civilizations"]
            map_ = summary.get_map()
            item["map"] = {"id": map_["id"], "name": map_["name"]}
            players = summary.get_players()
            item["duration_in_game"] = timedelta(
                seconds=int(summary.get_duration() / 1000)
            )

            teams = {}
            index = 0
            for team in summary.get_teams():
                index += 1
                for player_id in list(team):
                    teams[player_id] = index
            for player in players:
                user_id = player.get("user_id")
                civilization_id = player.get("civilization")
                item["players"][user_id].update(
                    {
                        "team": teams[player.get("number")],
                        "name": player.get("name"),
                        "winner": player.get("winner"),
                        "color_id": player.get("color_id"),
                        "civilization": {
                            "id": civilization_id,
                            "name": civilizations.get(
                                str(civilization_id), {"name": ""}
                            )["name"],
                        },
                    }
                )
        output.append(item)
    except Exception as exception:
        sys.stderr.write(f"failed to treat {match_id}: {exception}\n")

print(json.dumps(output, indent=4, sort_keys=True, default=json_serial))
