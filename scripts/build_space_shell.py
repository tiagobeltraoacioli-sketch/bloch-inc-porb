"""Keep every Bloch Space page on the same static, accessible navigation shell."""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'space/public'

def render(path):
    text = path.read_text()
    for name in ('header', 'footer'):
        source = (ROOT / f'space/ui/{name}.html').read_text().strip()
        marker = f'<!-- SPACE {name.upper()} START -->'
        pattern = rf'{marker}.*?<!-- SPACE {name.upper()} END -->' if marker in text else rf'<{name}\b.*?</{name}>'
        if re.search(pattern, text, re.S):
            text = re.sub(pattern, lambda _: source, text, count=1, flags=re.S)
        else:
            text = text.replace('</body>', source + '\n</body>')
    text = re.sub(r'data-theme="[^"]+"', 'data-theme="dark"', text, count=1)
    text = re.sub(r'(<meta name="theme-color" content=")[^"]+', r'\g<1>#081210', text)
    # Keep detailed legacy component states, then override common theme tokens.
    text = re.sub(r'<link[^>]+href="/assets/light.css"[^>]*>', '', text)
    text = re.sub(r'<(?:script|link)[^>]+(?:src|href)="/assets/space-(?:shell.js|design.css)"[^>]*>(?:</script>)?', '', text)
    if 'src="/assets/pwa.js"' not in text:
        text = text.replace('</head>', '<link rel="manifest" href="/manifest.webmanifest"><script src="/assets/pwa.js" type="module"></script></head>')
    text = text.replace('</head>', '<link rel="stylesheet" href="/assets/light.css"><link rel="stylesheet" href="/assets/space-design.css"><script src="/assets/space-shell.js"></script></head>')
    relative = path.relative_to(PUBLIC).as_posix()
    page = 'explorer' if relative == 'index.html' else 'analytics' if '/analytics/' in relative else {'app':'workspace','graph':'graph','account':'account','downloads':'downloads'}.get(relative.split('/')[0], 'overview')
    body = re.search(r'<body\b([^>]*)>', text).group(1)
    body = re.sub(r'\sdata-space-page="[^"]*"', '', body)
    if 'class="' in body:
        body = re.sub(r'class="([^"]*)"', lambda m: 'class="'+' '.join(dict.fromkeys(m.group(1).split()+['space-product']))+'"', body)
    else:
        body += ' class="space-product"'
    text = re.sub(r'<body\b[^>]*>', f'<body{body} data-space-page="{page}">', text, count=1)
    if 'class="skip"' not in text:
        text = text.replace('<main', '<a class="skip" href="#space-main">Skip to content</a><main', 1)
        text = text.replace('<main', '<main id="space-main"', 1)
    skip = re.search(r'<a class="skip"[^>]*>.*?</a>', text).group(0)
    text = text.replace(skip, '', 1)
    text = re.sub(r'(<body\b[^>]*>)', lambda m: m.group(0) + skip, text, count=1)
    return re.sub(r'[ \t]+$', '', text, flags=re.M)

parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
changed = []
for path in sorted(PUBLIC.rglob('*.html')):
    text = render(path)
    if text != path.read_text():
        changed.append(str(path.relative_to(ROOT)))
        if not args.check:
            path.write_text(text)
if args.check and changed:
    raise SystemExit('Outdated Space shell: '+', '.join(changed))
print(f'Space shell: {len(list(PUBLIC.rglob("*.html")))} pages; {len(changed)} updated' if not args.check else 'Space shell is consistent.')
