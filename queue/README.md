poetry export -f requirements.txt --output requirements.txt --without-hashes

cd queue/ && zip queue.zip main.py requirements.txt
gcloud alpha storage cp queue.zip gs://aoe2-function-code
gcloud functions deploy match_for_player \
 --region=us-central1 \
 --source gs://aoe2-function-code/queue.zip \
 --set-build-env-vars=GOOGLE_FUNCTION_SOURCE=main.py \
 --entry-point match_for_player

gcloud functions deploy download --region=us-central1 --source gs://aoe2-function-code/queue.zip --set-build-env-vars=GOOGLE_FUNCTION_SOURCE=main.py --entry-point download --trigger-topic=download --runtime=python39 --set-env-vars=GOOGLE_PUBSUB_PROJECT_ID=aoe2-340322

gcloud pubsub topics publish match_for_player --attribute=profile_id=2918752
