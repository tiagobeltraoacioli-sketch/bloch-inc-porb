"""Mount the public Graphus and Space tools behind the portal's scoped source gateway."""
from pathlib import Path
import shutil
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "graphus"
TARGET = ROOT / "site" / "graphus"
PAGES = ("app", "map", "constellation", "oculum", "analytics", "catalog", "daas")
SHELL = '<link rel="stylesheet" href="/portal/modules.css"><script src="/portal/module-shell.js" defer></script>'
SPACE_PAGES = ("index.html", "app/index.html", "graph/index.html", *(
    name + suffix for name in ("bitcoin", "ethereum", "bloch") for suffix in ("/index.html", "/analytics/index.html")))


def adapted(text):
    return (re.sub(r"/api/(?!porb/)", "/api/porb/v1/graphus/", text)
            .replace("https://rednblue.space/portal/", "/portal/")
            .replace("https://rednblue.space/developers/", "/developers/")
            .replace("https://bloch.space/?", "/space/?")
            .replace("https://bloch.space/", "/space/app/")
            .replace('href="/"', 'href="/graphus/app.html"')
            .replace("'account.html'", "'/portal/?view=cases'")
            .replace("`account.html?wallet=${encodeURIComponent(wallet.address)}`", "'/portal/?view=cases'"))


def adapted_space(text):
    # Rewrite only the mounted UI. Its public source and public APIs stay intact.
    text = re.sub(r'/api/(?!porb/)', '/api/porb/v1/space/', text)
    text = text.replace("'https://bloch.space'", "location.origin")
    text = re.sub(r'([\"\'`])/(assets|app|graph|bitcoin|ethereum|bloch)(?=/)', r'\1/space/\2', text)
    text = re.sub(r'([\"\'`])/\?', r'\1/space/?', text)
    text = text.replace('href="/"', 'href="/space/app/"')
    text = text.replace('https://rednblue.space/portal/', '/portal/')
    text = text.replace('/account/', '/portal/?view=access')
    text = text.replace('/downloads/', 'https://bloch.space/downloads/')
    text = re.sub(r'https://bloch-graphus.xyz/(app|map|constellation|oculum|analytics|catalog|daas)(?:\.html)?', r'/graphus/\1.html', text)
    text = re.sub(r'<link[^>]+rel="manifest"[^>]*>', '', text)
    text = re.sub(r'<script[^>]+src="/space/assets/pwa.js"[^>]*></script>', '', text)
    text = re.sub(r'<button[^>]+id="install-app"[^>]*>.*?</button>', '', text)
    return text


def mount_space():
    source = ROOT / "space" / "public"
    target = ROOT / "site" / "space"
    for file in (source / "assets").iterdir():
        if not file.is_file() or file.name in ("account.js", "account.css", "pwa.js"):
            continue
        output = target / "assets" / file.name
        output.parent.mkdir(parents=True, exist_ok=True)
        if file.suffix in (".js", ".css", ".json"):
            output.write_text(adapted_space(file.read_text()))
        else:
            shutil.copy2(file, output)
    for page in SPACE_PAGES:
        output = target / page
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(adapted_space((source / page).read_text()).replace('</head>', SHELL + '</head>'))
    print(f"Mounted {len(SPACE_PAGES)} Space pages at {target}; no account service, offline cache or install worker is copied.")


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
        text = text.replace("</head>", SHELL + '</head>')
        (TARGET / (page + ".html")).write_text(text)
    print(f"Mounted {len(PAGES)} Graphus modules at {TARGET}; source adapters use the private API gateway.")
    mount_space()


if __name__ == "__main__":
    main()
