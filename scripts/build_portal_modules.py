"""Mount the repository's Graphus UI in the authenticated portal (no copied backend/secrets)."""
from pathlib import Path
import shutil
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "graphus"
TARGET = ROOT / "site" / "graphus"
PAGES = ("app", "map", "constellation", "oculum", "analytics", "catalog", "daas")


def adapted(text):
    return (re.sub(r"/api/(?!porb/)", "/api/porb/v1/graphus/", text)
            .replace("https://rednblue.space/portal/", "/portal/")
            .replace("https://rednblue.space/developers/", "/developers/")
            .replace("https://bloch.space/", "/portal/?view=science")
            .replace('href="/"', 'href="/graphus/app.html"')
            .replace("'account.html'", "'/portal/?view=cases'")
            .replace("`account.html?wallet=${encodeURIComponent(wallet.address)}`", "'/portal/?view=cases'"))


def main():
    TARGET.mkdir(parents=True, exist_ok=True)
    assets = TARGET / "assets"
    assets.mkdir(exist_ok=True)
    for source in (SOURCE / "assets").rglob("*"):
        if not source.is_file() or source.name in ("account.js", "account.css"):
            continue
        target = assets / source.relative_to(SOURCE / "assets")
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix in (".js", ".css", ".json"):
            target.write_text(adapted(source.read_text()))
        else:
            shutil.copy2(source, target)
    for page in PAGES:
        text = adapted((SOURCE / (page + ".html")).read_text())
        text = text.replace("</head>", '<link rel="stylesheet" href="/portal/modules.css"><script src="/portal/module-shell.js" defer></script></head>')
        (TARGET / (page + ".html")).write_text(text)
    print(f"Mounted {len(PAGES)} Graphus modules at {TARGET}; source adapters use the private API gateway.")


if __name__ == "__main__":
    main()
