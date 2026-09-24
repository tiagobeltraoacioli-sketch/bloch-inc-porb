"""Bounded manual smoke checks against a local Bloch Space Pages preview."""
import json
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790"


def get(route, **params):
    request = Request(f"{base}/api/{route}?{urlencode(params)}", headers={"User-Agent": "BlochSpaceSmoke/1.0"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code != 503 or attempt == 2:
                raise
            time.sleep(1)


for network in ("bitcoin", "ethereum", "bloch"):
    overview = get("overview", network=network)
    if network == "bitcoin":
        block_query = str(overview["head"]["height"])
        block = get("block", network=network, query=block_query)
        txid = block["transaction_ids"][0]
        address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
    elif network == "ethereum":
        block_query = str(int(overview["head"]["number"], 16))
        block = get("block", network=network, query=block_query)
        txid = block["transaction_ids"][0]
        address = "0x0000000000000000000000000000000000000000"
    else:
        block_query = str(overview["head"]["slot"])
        block = get("block", network=network, query=block_query)
        txid = overview["recent_transactions"][0]["txid"]
        address = overview["holders"]["holders"][0]["script_hash"]
    transaction = get("tx", network=network, query=txid)
    wallet = get("address", network=network, query=address, asset={"bitcoin": "BTC", "ethereum": "ETH", "bloch": "BLCH"}[network])
    assert transaction["transaction"]
    if network == "bitcoin" and not transaction["facts"]["coinbase"]:
        assert transaction["facts"]["virtual_size_vb"] == (transaction["transaction"]["weight"] + 3) // 4
        assert transaction["facts"]["fee_rate_sat_vb"] is not None
        if transaction["facts"]["head_height"] is not None and transaction["transaction"]["status"]["confirmed"]:
            assert transaction["facts"]["confirmations"] == transaction["facts"]["head_height"] - transaction["transaction"]["status"]["block_height"] + 1
    if network == "ethereum" and transaction["receipt"]:
        receipt = transaction["receipt"]
        assert transaction["gas_fee_wei"] == str(int(receipt["gasUsed"], 16) * int(receipt["effectiveGasPrice"], 16))
    if network == "bloch":
        position = transaction["position"]
        assert position["indexed_depth_blocks"] == transaction["transaction"]["as_of_height"] - transaction["transaction"]["height"] + 1
        assert position["comparison_scope"] in ("matched_indexer_tip", "separate_indexer_snapshots", "transaction_snapshot_only")
    assert wallet["wallet"]["balance"]["base_units"].isdigit()
    print(network, "head", block_query, "tx", txid[:14], "balance", wallet["wallet"]["balance"]["base_units"][:18])
