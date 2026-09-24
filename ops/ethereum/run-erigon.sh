#!/usr/bin/env bash
set -euo pipefail

# Run only on the dedicated Graphus Ethereum host. The image digest pins v3.6.1.
if sudo docker container inspect graphus-erigon >/dev/null 2>&1; then
  echo 'graphus-erigon already exists; inspect it instead of replacing its state' >&2
  exit 1
fi

sudo install -d -o 1000 -g 1000 -m 0700 /var/lib/graphus/ethereum
sudo docker run -d \
  --name graphus-erigon \
  --restart unless-stopped \
  --cpus 16 \
  --memory 48g \
  --network host \
  --volume /var/lib/graphus/ethereum:/var/lib/erigon \
  erigontech/erigon@sha256:8cd3fbcbb35d8b16768225ff7494a0672b7b06c9bf13d466850aabb920ac0de7 \
  --chain=mainnet \
  --datadir=/var/lib/erigon \
  --http \
  --http.addr=127.0.0.1 \
  --http.api=eth,net,web3 \
  --authrpc.addr=127.0.0.1 \
  --private.api.addr=127.0.0.1:9090 \
  --torrent.download.rate=64mb
