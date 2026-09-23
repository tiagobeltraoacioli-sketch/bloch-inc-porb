"""Offline Solana token balance observations; deltas are not transfer claims."""

import re
from dataclasses import dataclass
from typing import Optional

BASE58 = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,88}\Z")
AMOUNT = re.compile(r"[0-9]{1,39}\Z")


@dataclass(frozen=True)
class TokenBalanceDelta:
    signature: str
    slot: int
    account_index: int
    mint: str
    owner: Optional[str]
    program_id: Optional[str]
    delta_base_units: int
    account_created_or_closed: bool
    source_id: str
    classification: str = "balance_observation_not_transfer"


def token_balance_deltas(response, *, source_id="solana-rpc"):
    """Compare pre/post token balances without pairing senders and receivers."""
    slot = response.get("slot")
    meta = response.get("meta")
    tx = response.get("transaction") or {}
    signatures = tx.get("signatures") or []
    if type(slot) is not int or slot < 1 or not isinstance(meta, dict) or meta.get("err") is not None or not signatures or not BASE58.fullmatch(signatures[0]):
        raise ValueError("successful confirmed Solana transaction required")
    pre = meta.get("preTokenBalances")
    post = meta.get("postTokenBalances")
    if not isinstance(pre, list) or not isinstance(post, list):
        raise ValueError("token balance metadata required")

    def index(rows):
        result = {}
        for row in rows:
            account_index = row.get("accountIndex")
            mint = row.get("mint", "")
            owner = row.get("owner")
            program = row.get("programId")
            amount = (row.get("uiTokenAmount") or {}).get("amount")
            if type(account_index) is not int or account_index < 0 or not BASE58.fullmatch(mint) or (owner is not None and not BASE58.fullmatch(owner)) or (program is not None and not BASE58.fullmatch(program)) or not isinstance(amount, str) or not AMOUNT.fullmatch(amount):
                raise ValueError("invalid token balance row")
            key = (account_index, mint)
            if key in result:
                raise ValueError("duplicate token balance key")
            result[key] = (int(amount), owner, program)
        return result

    before, after = index(pre), index(post)
    observations = []
    for account_index, mint in sorted(before.keys() | after.keys()):
        previous = before.get((account_index, mint))
        current = after.get((account_index, mint))
        if previous and current and (previous[1:] != current[1:]):
            raise ValueError("token owner or program changed within balance record")
        old = previous[0] if previous else 0
        new = current[0] if current else 0
        if old == new:
            continue
        owner, program = (current or previous)[1:]
        observations.append(TokenBalanceDelta(signatures[0], slot, account_index, mint, owner, program, new - old, previous is None or current is None, source_id))
    return observations
