"""Offline native-ETH movement parser for finalized RPC fixtures."""

import re

from .normalization import Movement

HEX64 = re.compile(r"0x[0-9a-fA-F]{64}\Z")
ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}\Z")
HEX_NUMBER = re.compile(r"0x[0-9a-fA-F]+\Z")
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
ZERO_ADDRESS = "0x" + "0" * 40
TOKEN_CONTRACTS = {
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "usdt",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "usdc",
}


def native_value_movement(block, tx, receipt, *, source_id="ethereum-rpc"):
    """Return a native transfer only when the transaction succeeded in the given block."""
    block_hash = block.get("hash", "")
    tx_hash = tx.get("hash", "")
    sender = tx.get("from", "")
    destination = tx.get("to")
    if not HEX64.fullmatch(block_hash) or not HEX64.fullmatch(tx_hash):
        raise ValueError("invalid block or transaction hash")
    if not ADDRESS.fullmatch(sender) or (destination is not None and not ADDRESS.fullmatch(destination)):
        raise ValueError("invalid account address")
    if receipt.get("transactionHash", "").lower() != tx_hash.lower() or receipt.get("blockHash", "").lower() != block_hash.lower():
        raise ValueError("receipt does not belong to transaction and block")
    if not all(HEX_NUMBER.fullmatch(str(value)) for value in (block.get("number"), tx.get("transactionIndex"), tx.get("value"))):
        raise ValueError("invalid Ethereum quantity")
    if receipt.get("status") not in ("0x0", "0x1"):
        raise ValueError("receipt success status required")
    if receipt["status"] == "0x0" or destination is None or int(tx["value"], 16) == 0:
        return None
    return Movement(
        "ethereum", "mainnet", "eth", tx_hash.lower(), int(tx["transactionIndex"], 16),
        block_hash.lower(), int(block["number"], 16), "finalized", int(tx["value"], 16),
        destination.lower(), sender.lower(), "direct", source_id,
    )


def erc20_transfers(block, receipt, *, source_id="ethereum-rpc"):
    """Parse successful USDT/USDC Transfer logs from a known finalized block."""
    block_hash = block.get("hash", "")
    tx_hash = receipt.get("transactionHash", "")
    if not HEX64.fullmatch(block_hash) or not HEX64.fullmatch(tx_hash) or receipt.get("blockHash", "").lower() != block_hash.lower() or receipt.get("status") != "0x1" or not HEX_NUMBER.fullmatch(str(block.get("number"))):
        raise ValueError("successful receipt from finalized block required")
    if not isinstance(receipt.get("logs"), list):
        raise ValueError("receipt logs required")
    movements = []
    for log in receipt["logs"]:
        contract = str(log.get("address", "")).lower()
        if contract not in TOKEN_CONTRACTS:
            continue
        topics = log.get("topics")
        if not isinstance(topics, list) or not topics or str(topics[0]).lower() != TRANSFER_TOPIC:
            continue
        if log.get("removed") is True or log.get("blockHash", "").lower() != block_hash.lower() or log.get("transactionHash", "").lower() != tx_hash.lower():
            raise ValueError("removed or mismatched token log")
        if len(topics) != 3 or not all(re.fullmatch(r"0x[0-9a-fA-F]{64}", str(topic)) for topic in topics) or not re.fullmatch(r"0x[0-9a-fA-F]{64}", str(log.get("data"))) or not HEX_NUMBER.fullmatch(str(log.get("logIndex"))):
            raise ValueError("invalid ERC-20 Transfer encoding")
        if not all(str(topic)[2:26] == "0" * 24 for topic in topics[1:]):
            raise ValueError("invalid indexed address padding")
        sender = "0x" + topics[1][-40:].lower()
        destination = "0x" + topics[2][-40:].lower()
        amount = int(log["data"], 16)
        if sender == ZERO_ADDRESS or destination == ZERO_ADDRESS or amount == 0:
            continue  # Mint, burn, and zero-value events need separate event types.
        movements.append(Movement(
            "ethereum", "mainnet", "erc20:" + contract, tx_hash.lower(), int(log["logIndex"], 16),
            block_hash.lower(), int(block["number"], 16), "finalized", amount,
            destination, sender, "direct", source_id,
        ))
    return movements
