"""Offline Esplora-format Bitcoin output parser; no sender ownership inference."""

import hashlib
import re

from .normalization import bitcoin_output

HEX64 = re.compile(r"[0-9a-fA-F]{64}\Z")
SCRIPT = re.compile(r"[0-9a-fA-F]{2,10000}\Z")
ADDRESS = re.compile(r"[A-Za-z0-9]{14,90}\Z")


def confirmed_outputs(tx, *, source_id="bitcoin-esplora"):
    txid = tx.get("txid", "")
    status = tx.get("status") or {}
    block_hash = status.get("block_hash", "")
    height = status.get("block_height")
    if not HEX64.fullmatch(txid) or not HEX64.fullmatch(block_hash) or status.get("confirmed") is not True or type(height) is not int or height < 1:
        raise ValueError("confirmed Bitcoin transaction and block required")
    if not isinstance(tx.get("vout"), list):
        raise ValueError("Bitcoin outputs required")
    movements = []
    for index, output in enumerate(tx["vout"]):
        value = output.get("value")
        address = output.get("scriptpubkey_address")
        script = output.get("scriptpubkey", "")
        if type(value) is not int or value < 0 or not SCRIPT.fullmatch(script):
            raise ValueError("invalid output value or script")
        if address is not None and not ADDRESS.fullmatch(address):
            raise ValueError("invalid output address")
        if value == 0:
            continue
        destination = address or "script:" + hashlib.sha256(bytes.fromhex(script)).hexdigest()
        movements.append(bitcoin_output(network="mainnet", tx_id=txid.lower(), vout=index, block_hash=block_hash.lower(), height=height, value_sats=value, destination=destination, source_id=source_id))
    return movements
