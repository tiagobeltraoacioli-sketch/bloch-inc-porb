"""Verify real deployed workflows using an external owner credential file; print no secrets."""
import argparse
import http.cookiejar
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPCookieProcessor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", type=Path, required=True)
    parser.add_argument("--collect", action="store_true")
    args = parser.parse_args()
    origin = "https://rednblue.space"
    owner = json.loads(args.credentials.read_text())
    opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [("User-Agent", "BI-PoRB-Unified-Release-Check/1.1")]
    report = {"origin": origin, "collections": [], "checks": []}

    def call(path, method="GET", body=None, key=None, expected=(200,)):
        headers = {"Accept": "application/json", "User-Agent": "BI-PoRB-Unified-Release-Check/1.1"}
        if method != "GET":
            headers.update({"Content-Type": "application/json", "Origin": origin, "X-Porb-Action": "1"})
        if key:
            headers["Authorization"] = "Bearer " + key
        request = Request(origin + "/api/porb" + path, method=method, headers=headers,
                          data=None if body is None else json.dumps(body).encode())
        try:
            response = opener.open(request, timeout=120)
        except HTTPError as error:
            response = error
        data = json.load(response)
        if response.status not in expected:
            raise RuntimeError(f"{method} {path.split('?')[0]}: HTTP {response.status}: {data.get('error', 'unknown error')}")
        assert response.headers.get("X-Request-Id") and response.headers.get("X-Porb-Api-Version") == "1.1"
        return data

    call("/v1/cases", expected=(401,))
    call("/auth/login", "POST", {"email": owner["email"], "password": owner["password"]})
    key = case = watch = None
    try:
        session = call("/auth/session")
        assert session["organization"]["role"] == "owner"
        print("Existing owner login verified; account credentials unchanged.", flush=True)
        for module in ("map", "constellation", "oculum", "analytics", "app", "catalog"):
            response = opener.open(origin + "/graphus/" + module, timeout=30)
            assert "/graphus/" in response.url and response.headers.get("X-Frame-Options") == "SAMEORIGIN"
            assert "module-shell.js" in response.read().decode()
        print("All six unified Graphus pages verified behind the owner session.", flush=True)
        key = call("/keys", "POST", {"label": "Unified release verification (revoked after check)", "days": 1,
                   "scopes": ["data:read", "analyses:read", "analyses:write", "scores:read", "cases:read", "cases:write", "watchlists:read", "watchlists:write"],
                   "password": owner["password"]}, expected=(201,))
        catalog = call("/v1/graphus/system/map", key=key["key"])
        assert len(catalog["modules"]) >= 40
        print("Scoped partner key and System Map registry gateway verified.", flush=True)
        if args.collect:
            for asset in ("BTC", "ETH", "BLCH"):
                run = call("/v1/analyses", "POST", {"asset": asset, "pages": 1}, key=key["key"], expected=(201,))
                assert run["graph"]["nodes"] and run["graph"]["edges"]
                record = {field: run[field] for field in ("id", "asset", "wallets", "records", "digest", "created_at")}
                report["collections"].append(record)
                print(f"Real {asset}: {run['wallets']} references, {run['records']} records; anchored source stored.", flush=True)
        runs = call("/v1/analyses", key=key["key"])["analyses"]
        assert runs
        saved = None
        for summary in runs:
            current = call("/v1/analyses/" + summary["id"], key=key["key"])
            if saved is None and current["asset"] == "ETH" and current["scores"]["rows"]:
                saved = current
        assert saved
        row = saved["scores"]["rows"][0]
        results = call("/v1/references?" + urlencode({"asset": saved["asset"], "reference": row["address"]}), key=key["key"])
        assert any(item["id"] == saved["id"] for item in results["items"])
        assert results["index"]["indexed"] == results["index"]["retained"]
        print(f"Indexed {len(runs)} retained real analyses; exact address lookup verified.", flush=True)
        case = call("/v1/cases", "POST", {"title": "Release verification — temporary source evidence"}, key=key["key"], expected=(201,))
        packet = call(f"/v1/cases/{case['id']}/evidence", "POST", {"analysis_id": saved["id"], "node_id": row["id"]}, key=key["key"], expected=(201,))
        assert len(packet["digest"]) == 64 and packet["snapshot"]["score"]["id"] == row["id"]
        exported = call(f"/v1/cases/{case['id']}/export", key=key["key"])
        assert exported["evidence"][0]["snapshot"] == packet["snapshot"]
        call(f"/v1/cases/{case['id']}/status", "POST", {"status": "closed"}, key=key["key"])
        print("Investigation, source evidence snapshot, export and close workflow verified.", flush=True)
        watched = call("/v1/watchlists", "POST", {"asset": saved["asset"], "reference": row["address"]}, key=key["key"], expected=(200, 201))
        # Do not delete or change review state for a pre-existing user watch.
        if not watched.get("duplicate"):
            watch = watched
            first = call("/v1/watchlists/evaluate", "POST", {"analysis_id": saved["id"]}, key=key["key"])
            second = call("/v1/watchlists/evaluate", "POST", {"analysis_id": saved["id"]}, key=key["key"])
            assert first["observations_created"] >= 1 and second["observations_created"] == 0
            inbox = call("/v1/observations", key=key["key"])
            event = next(item for item in inbox["items"] if item["watch_id"] == watch["id"])
            call(f"/v1/observations/{event['id']}/review", "POST", {}, key=key["key"])
            print("Real reference watch, idempotent evaluation and review verified.", flush=True)
        report["checks"] = ["existing owner access", "six gated Graphus modules", "scoped gateway", "legacy reference indexing", "real evidence export", "watch evaluation"]
    finally:
        cleanup_errors = []
        for path in ([f"/v1/watchlists/{watch['id']}"] if watch else []) + ([f"/v1/cases/{case['id']}"] if case else []):
            try:
                call(path, "DELETE", {})
            except Exception as error:
                cleanup_errors.append(str(error))
        if key:
            call("/keys/" + key["id"], "DELETE", {"password": owner["password"]})
            call("/v1/model", key=key["key"], expected=(401,))
        call("/auth/logout", "POST", {})
        if cleanup_errors:
            raise RuntimeError("Temporary verification records need cleanup: " + "; ".join(cleanup_errors))
        print("Temporary case/watch removed, verification key revoked, session signed out.", flush=True)
    output = Path(__file__).resolve().parents[1] / ".data/unified-live-verification.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print("Real-data verification completed; no credentials were printed.", flush=True)


if __name__ == "__main__":
    main()
