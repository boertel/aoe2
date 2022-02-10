#!/bin/bash


BUCKET_CODE="aoe2-function-code"

function upload {
    zip queue.zip main.py requirements.txt && gcloud alpha storage cp queue.zip "gs://$BUCKET_CODE"
}

function deploy {
    NAME="$1"
    gcloud functions deploy "$NAME" \
        --region=us-central1 \
        --source=gs://$BUCKET_CODE/queue.zip \
        --trigger-topic="$NAME" \
        --runtime=python39 \
        --set-build-env-vars=GOOGLE_FUNCTION_SOURCE=main.py \
        --set-env-vars=GOOGLE_PUBSUB_PROJECT_ID=aoe2-340322 \
        --entry-point="$NAME"
}

upload

if [[ -z "$1" ]]; then
    deploy "match_for_player" &
    deploy "download" &
    deploy "parse" &
else
    deploy "$1"
fi

wait

# gcloud pubsub topics create
# gcloud pubsub topics publish aoe2-recording  --attribute=profile_id=2918752
