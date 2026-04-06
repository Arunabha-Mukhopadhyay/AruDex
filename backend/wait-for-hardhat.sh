#!/bin/sh
# wait-for-hardhat.sh
# Usage: wait-for-hardhat.sh host:port [timeout]

set -e

HOST_PORT="$1"
TIMEOUT="${2:-60}"

for i in $(seq 1 "$TIMEOUT"); do
  nc -z $(echo "$HOST_PORT" | cut -d: -f1) $(echo "$HOST_PORT" | cut -d: -f2) && exit 0
  echo "Waiting for hardhat node at $HOST_PORT... ($i/$TIMEOUT)"
  sleep 1
done

echo "Timeout waiting for hardhat node at $HOST_PORT"
exit 1
