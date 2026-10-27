#!/usr/bin/env sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root: sudo ./scripts/setup-server.sh <deploy-user>" >&2
  exit 1
fi

DEPLOY_USER="${1:?Usage: setup-server.sh DEPLOY_USER}"

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "User does not exist: $DEPLOY_USER" >&2
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install --yes docker.io ca-certificates curl
systemctl enable --now docker
usermod --append --groups docker "$DEPLOY_USER"

echo "Docker is ready. Sign out and back in as $DEPLOY_USER before deploying."
docker --version
