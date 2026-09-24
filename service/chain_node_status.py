"""Read-only status of the dedicated Bitcoin and Ethereum Graphus nodes."""

import argparse
import json
import re
import shlex
import subprocess
from datetime import datetime, timezone


SSH = ("ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8")
def _remote(host, *arguments):
    return SSH + (host, shlex.join(arguments))


BTC_INFO = _remote("bloch-dex", "sudo", "-n", "-u", "graphusbtc",
                  "/opt/graphus-bitcoin/31.1/bin/bitcoin-cli",
                  "-conf=/etc/graphus-bitcoin/bitcoin.conf",
                  "-datadir=/var/lib/graphus-bitcoin", "getblockchaininfo")
ETH_SYNC = _remote("bloch-bridge", "curl", "-fsS", "--max-time", "8",
                  "-H", "Content-Type: application/json", "--data",
                  '{"jsonrpc":"2.0","id":1,"method":"eth_syncing","params":[]}',
                  "http://127.0.0.1:8545")
ETH_LOGS = _remote("bloch-bridge", "sudo", "-n", "docker", "logs", "--tail", "80",
                  "graphus-erigon")
ETH_DISK = _remote("bloch-bridge", "df", "-B1", "--output=size,used,avail,pcent",
                  "/var/lib/graphus/ethereum")
ARTIFACT_PROBE = """import json, os, stat, sys
result = {}
for name, path in zip(sys.argv[1::2], sys.argv[2::2]):
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        result[name] = {"state": "not_built"}
        continue
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
        result[name] = {"state": "invalid_file"}
    else:
        result[name] = {"state": "private_file_present", "size_bytes": info.st_size,
                        "review_required": True}
print(json.dumps(result))"""
BTC_ARTIFACT = _remote("bloch-dex", "sudo", "-n", "-u", "graphusbtc", "python3", "-B",
                       "-c", ARTIFACT_PROBE, "BTC",
                       "/var/lib/graphus-bitcoin/rankings/bitcoin-top64-scripts.json")
ETH_ARTIFACTS = _remote("bloch-bridge", "sudo", "-n", "-u", "graphusidx", "python3", "-B",
                        "-c", ARTIFACT_PROBE, "USDT", "/var/lib/graphus-token-index/USDT-top64.json",
                        "USDC", "/var/lib/graphus-token-index/USDC-top64.json")
def _run(command):
    return subprocess.run(command, capture_output=True, text=True, timeout=20, check=True)


def _bitcoin(raw):
    info = json.loads(raw)
    blocks, headers = info.get("blocks"), info.get("headers")
    progress = info.get("verificationprogress")
    if (info.get("chain") != "main" or type(blocks) is not int or blocks < 0
            or type(headers) is not int or headers < blocks
            or type(progress) not in (int, float) or not 0 <= progress <= 1
            or type(info.get("initialblockdownload")) is not bool):
        raise ValueError("invalid Bitcoin node status")
    return {"state": "syncing" if info["initialblockdownload"] else "node_validated",
            "blocks": blocks, "headers": headers,
            "verification_progress": progress,
            "initial_block_download": info["initialblockdownload"],
            "snapshot_sync_gate_open": not info["initialblockdownload"]}


def _ethereum(raw, logs, disk):
    payload = json.loads(raw)
    result = payload.get("result")
    if payload.get("error") or result is None:
        raise ValueError("invalid Ethereum sync response")
    if result is False:
        status = {"state": "rpc_synced", "execution_syncing": False,
                  "token_scan_sync_gate_open": True}
    elif isinstance(result, dict):
        current, highest = result.get("currentBlock"), result.get("highestBlock")
        if not all(isinstance(value, str) and re.fullmatch(r"0x[0-9a-fA-F]+", value)
                   for value in (current, highest)):
            raise ValueError("invalid Ethereum sync heights")
        status = {"state": "syncing", "execution_syncing": True,
                  "current_block": int(current, 16), "highest_block": int(highest, 16),
                  "token_scan_sync_gate_open": False}
    else:
        raise ValueError("invalid Ethereum sync state")
    if status["execution_syncing"]:
        for line in reversed(logs.splitlines()):
            if "Syncing snapshots" not in line:
                continue
            percent = re.search(r"data=(\d+(?:\.\d+)?)%", line)
            eta = re.search(r"eta=([^ ]+)", line)
            if percent and 0 <= float(percent.group(1)) <= 100:
                status["snapshot_download_percent"] = float(percent.group(1))
                if eta:
                    status["snapshot_downloader_eta"] = eta.group(1)
                break
    lines = [line.split() for line in disk.splitlines() if line.strip()]
    if len(lines) < 2 or len(lines[-1]) != 4:
        raise ValueError("invalid Ethereum disk status")
    size, used, available = map(int, lines[-1][:3])
    if size <= 0 or min(used, available) < 0 or used + available > size:
        raise ValueError("invalid Ethereum disk capacity")
    status["disk_used_bytes"] = used
    status["disk_available_bytes"] = available
    status["disk_used_percent"] = round(used / size * 100, 2)
    return status


def _artifacts(raw, expected):
    payload = json.loads(raw)
    if not isinstance(payload, dict) or set(payload) != set(expected):
        raise ValueError("invalid private artifact status")
    for value in payload.values():
        if not isinstance(value, dict) or value.get("state") not in (
                "not_built", "invalid_file", "private_file_present"):
            raise ValueError("invalid private artifact state")
        if value["state"] == "private_file_present" and (
                type(value.get("size_bytes")) is not int or value["size_bytes"] < 0
                or value.get("review_required") is not True):
            raise ValueError("invalid private artifact file")
    return payload


def collect(run=_run, now=None):
    """Keep node errors separate; no private RPC endpoint or identifier is emitted."""
    observed = now or datetime.now(timezone.utc)
    output = {"observed_at": observed.astimezone(timezone.utc).isoformat()
              .replace("+00:00", "Z"), "source": "dedicated_graphus_nodes",
              "ranking_publication_ready": False}
    try:
        output["bitcoin"] = _bitcoin(run(BTC_INFO).stdout)
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError):
        output["bitcoin"] = {"state": "unavailable", "snapshot_sync_gate_open": False}
    try:
        sync = run(ETH_SYNC).stdout
        log_result = run(ETH_LOGS)
        disk = run(ETH_DISK).stdout
        output["ethereum"] = _ethereum(sync, log_result.stdout + log_result.stderr, disk)
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError):
        output["ethereum"] = {"state": "unavailable", "token_scan_sync_gate_open": False}
    output["private_artifacts"] = {}
    for command, names in ((BTC_ARTIFACT, ("BTC",)), (ETH_ARTIFACTS, ("USDT", "USDC"))):
        try:
            output["private_artifacts"].update(_artifacts(run(command).stdout, names))
        except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError):
            output["private_artifacts"].update({name: {"state": "unavailable"} for name in names})
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    print(json.dumps(collect(), sort_keys=True))


if __name__ == "__main__":
    main()
