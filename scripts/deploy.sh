#!/usr/bin/env sh
set -eu

IMAGE="${1:?Usage: deploy.sh IMAGE [CONTAINER_NAME] [HOST_PORT]}"
CONTAINER_NAME="${2:-autodeploy}"
HOST_PORT="${3:-3000}"
MAX_ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-30}"
PREVIOUS_IMAGE=""

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  PREVIOUS_IMAGE="$(docker container inspect --format '{{.Config.Image}}' "$CONTAINER_NAME")"
fi

echo "Pulling release image: $IMAGE"
docker pull "$IMAGE"

start_container() {
  image="$1"
  version="$2"

  docker run --detach \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --publish "${HOST_PORT}:3000" \
    --env NODE_ENV=production \
    --env PORT=3000 \
    --env "APP_VERSION=$version" \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    "$image"
}

wait_until_healthy() {
  attempt=1
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    status="$(docker container inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || true)"

    if [ "$status" = "healthy" ]; then
      return 0
    fi

    if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
      return 1
    fi

    sleep 2
    attempt=$((attempt + 1))
  done

  return 1
}

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Stopping current container"
  docker stop --time 20 "$CONTAINER_NAME"
  docker rm "$CONTAINER_NAME"
fi

echo "Starting candidate release"
CANDIDATE_STARTED=false
if start_container "$IMAGE" "${IMAGE##*:}"; then
  CANDIDATE_STARTED=true
fi

if [ "$CANDIDATE_STARTED" = "true" ] && wait_until_healthy; then
  echo "Deployment succeeded: $IMAGE is healthy"
  exit 0
fi

echo "Deployment failed health checks" >&2
if [ "$CANDIDATE_STARTED" = "true" ]; then
  docker logs "$CONTAINER_NAME" >&2 || true
fi
docker rm --force "$CONTAINER_NAME" >/dev/null 2>&1 || true

if [ -n "$PREVIOUS_IMAGE" ]; then
  echo "Rolling back to $PREVIOUS_IMAGE" >&2
  if start_container "$PREVIOUS_IMAGE" "rollback" && wait_until_healthy; then
    echo "Rollback succeeded" >&2
  else
    echo "Rollback container is not healthy" >&2
    docker logs "$CONTAINER_NAME" >&2 || true
  fi
else
  echo "No previous image is available for rollback" >&2
fi

exit 1
