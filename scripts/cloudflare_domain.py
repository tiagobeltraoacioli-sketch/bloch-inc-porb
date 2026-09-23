"""Attach the requested apex domain using the existing Wrangler OAuth session."""

import json
import os
import subprocess
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API = "https://api.cloudflare.com/client/v4"
DOMAIN = os.environ.get("PAGES_DOMAIN", "aml-blochinc.xyz")
PROJECT = os.environ.get("PAGES_PROJECT", "aml-blochinc")


def api(token, method, path, body=None):
    payload = None if body is None else json.dumps(body).encode()
    request = Request(API + path, data=payload, method=method)
    request.add_header("Authorization", "Bearer " + token)
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def main():
    node = os.environ.get("PORB_NODE_BIN")
    wrangler_js = os.environ.get("PORB_WRANGLER_JS")
    command = [node, wrangler_js] if node and wrangler_js else ["wrangler"]
    result = subprocess.run(command + ["auth", "token", "--json"], capture_output=True, text=True, check=True)
    token = json.loads(result.stdout)["token"]
    zones = api(token, "GET", "/zones?name=" + DOMAIN)
    candidates = zones.get("result") or []
    if not candidates:
        print("Domain is not a Cloudflare zone in this account; attach in dashboard after DNS setup.")
        return 2
    zone = candidates[0]
    account = zone["account"]["id"]
    print(f"Zone {DOMAIN}: {zone['status']}; account {account}")
    try:
        dns = api(token, "GET", f"/zones/{zone['id']}/dns_records?name={DOMAIN}")
        print("Apex DNS records:", [(item.get("type"), item.get("content"), item.get("proxied")) for item in dns.get("result") or []])
    except HTTPError as error:
        if error.code != 403:
            raise
        print("DNS records cannot be read with this Pages-scoped credential (HTTP 403).")
    path = f"/accounts/{account}/pages/projects/{PROJECT}/domains"
    current = api(token, "GET", path)
    attached = next((item for item in current.get("result") or [] if item.get("name") == DOMAIN), None)
    if attached:
        print("Custom domain already attached to Pages project:", attached.get("status"))
        return 0
    if "--attach" not in sys.argv:
        print("Preflight only; pass --attach to add the custom domain.")
        return 0
    added = api(token, "POST", path, {"name": DOMAIN})
    if not added.get("success"):
        print("Cloudflare did not accept the domain:", added.get("errors"))
        return 1
    print("Pages custom domain created:", added["result"].get("name"), added["result"].get("status"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
