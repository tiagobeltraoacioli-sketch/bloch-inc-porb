"""Verify deployed Qentl brand pages and static assets over verified HTTPS."""
import hashlib,json
from pathlib import Path
import urllib.error,urllib.request

root=Path(__file__).resolve().parents[1]
report=[]
for host in ('qentl.com','qentl.ai','blochai.xyz'):
    checks=[]
    for asset in ('','blochai-public.css','bloch-symbol.svg','bloch-inc-logo-dark.png'):
        url='https://'+host+'/'+asset
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'Qentl-release-verification'})
            with urllib.request.urlopen(request,timeout=15) as response:
                data=response.read(2_000_000);expected=(root/'site/blochai-public'/(asset or 'index.html')).read_bytes()
                valid=data==expected if asset else all(value in data for value in [b'Qentl',b'Quantum Entanglement',b'by Bloch Inc.',b'https://qentl.com/',b'https://qentl.ai/',b'14B'])
                checks.append({'asset':asset or 'index.html','status':response.status,'content_verified':valid,'sha256':hashlib.sha256(data).hexdigest(),'csp':response.headers.get('content-security-policy') if not asset else None})
        except Exception as exc:checks.append({'asset':asset or 'index.html','error':str(exc)[:180]})
    report.append({'domain':host,'passed':all(item.get('content_verified',False) for item in checks),'checks':checks})
output=root/'.data/qentl-release-verification.json';output.parent.mkdir(exist_ok=True);output.write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
raise SystemExit(0 if all(item['passed'] for item in report) else 1)
