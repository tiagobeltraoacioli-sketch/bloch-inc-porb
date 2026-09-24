"""Create one private Bitcoin UTXO script ranking after full node validation."""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .bitcoin_utxo_ranking import rank_snapshot


CONVERTER_SHA256 = "532bb3ce8c84d1448b930b7f9195e97ce604da713c5d5e58c00ceff27490e9b9"
MIN_FREE_BYTES = 500_000_000_000


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cli(binary, conf, datadir, *arguments):
    result = subprocess.run([str(binary), f"-conf={conf}", f"-datadir={datadir}",
                             *arguments], check=True, capture_output=True,
                            text=True, timeout=None)
    return result.stdout.strip()


def build_once(*, workdir, cli, conf, datadir, converter, check_only=False):
    """Return a status; a complete private ranking is written at most once."""
    workdir = Path(workdir)
    workdir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(workdir, 0o700)
    output = workdir / "bitcoin-top64-scripts.json"
    if output.exists():
        return {"status": "already_built", "path": str(output)}
    info = json.loads(_cli(cli, conf, datadir, "getblockchaininfo"))
    if info.get("chain") != "main" or info.get("initialblockdownload") is not False:
        return {"status": "waiting_for_full_validation",
                "blocks": info.get("blocks"), "headers": info.get("headers")}
    if check_only:
        return {"status": "ready_to_build", "blocks": info["blocks"]}
    free = shutil.disk_usage(workdir).free
    if free < MIN_FREE_BYTES:
        return {"status": "insufficient_free_space", "free_bytes": free,
                "required_bytes": MIN_FREE_BYTES}
    if _sha256(converter) != CONVERTER_SHA256:
        raise ValueError("Bitcoin Core 31.1 converter checksum mismatch")
    with tempfile.TemporaryDirectory(prefix="bitcoin-utxo-", dir=workdir) as temp:
        root = Path(temp)
        snapshot = root / "utxos.dat"
        sqlite = root / "utxos.sqlite"
        metadata = json.loads(_cli(cli, conf, datadir, "-rpcclienttimeout=0",
                                   "dumptxoutset", str(snapshot), "latest"))
        (root / "dump.json").write_text(json.dumps(metadata))
        post_info = json.loads(_cli(cli, conf, datadir, "getblockchaininfo"))
        (root / "chain.json").write_text(json.dumps(post_info))
        if _cli(cli, conf, datadir, "getblockhash", str(metadata["base_height"])) != metadata["base_hash"]:
            raise ValueError("snapshot base block is no longer canonical")
        subprocess.run(["python3", str(converter), str(snapshot), str(sqlite)],
                       check=True, timeout=None)
        ranking = rank_snapshot(sqlite, snapshot, root / "dump.json",
                                root / "chain.json", cli=cli, conf=conf,
                                datadir=datadir)
        ranking["snapshot_sha256"] = _sha256(snapshot)
        ranking["converter_sha256"] = CONVERTER_SHA256
        ranking["generated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        ranking["publication_status"] = "private_pending_review"
        temporary_output = workdir / ".bitcoin-top64-scripts.json.tmp"
        temporary_output.write_text(json.dumps(ranking, sort_keys=True) + "\n")
        os.chmod(temporary_output, 0o600)
        os.replace(temporary_output, output)
    return {"status": "built_private", "path": str(output),
            "base_hash": ranking["base_hash"], "base_height": ranking["base_height"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--bitcoin-cli", type=Path, required=True)
    parser.add_argument("--bitcoin-conf", type=Path, required=True)
    parser.add_argument("--bitcoin-datadir", type=Path, required=True)
    parser.add_argument("--converter", type=Path, required=True)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    print(json.dumps(build_once(workdir=args.workdir, cli=args.bitcoin_cli,
                                conf=args.bitcoin_conf, datadir=args.bitcoin_datadir,
                                converter=args.converter, check_only=args.check_only),
                     sort_keys=True))


if __name__ == "__main__":
    main()
