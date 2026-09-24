"""Provision the explicitly named portal owner without exposing secrets in CLI logs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.data' / 'porb-portal'

def private_file(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(content)
    os.chmod(path, 0o600)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    parser.add_argument('--domain', default='rednblue.space')
    parser.add_argument('--project', default='rednblue-space')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--migrate-password-hash', action='store_true', help='Explicitly replace the original bootstrap password hash during initial runtime setup.')
    args = parser.parse_args()
    email = args.email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254:
        parser.error('A valid explicitly authorized owner email is required.')
    LOCAL.mkdir(parents=True, exist_ok=True, mode=0o700)
    state_file = LOCAL / 'bootstrap.json'
    if state_file.exists():
        state = json.loads(state_file.read_text())
        if state['email'] != email or state['domain'] != args.domain:
            raise SystemExit('Existing bootstrap belongs to another owner or domain.')
    else:
        state = dict(email=email, domain=args.domain, password=secrets.token_urlsafe(24), pepper=secrets.token_hex(32), salt=secrets.token_hex(32), recovery=secrets.token_hex(32), user_id=str(uuid.uuid4()), tenant_id=str(uuid.uuid4()), created_at=int(time.time()*1000))
        private_file(state_file, json.dumps(state))
    node = os.environ.get('PORB_NODE_BIN', 'node')
    hash_script = "import {passwordHash} from './portal/security.js'; let raw=''; for await(const chunk of process.stdin)raw+=chunk; const s=JSON.parse(raw); console.log(await passwordHash(s.password,s.salt,s.pepper));"
    password_hash = subprocess.run([node, '--input-type=module', '-e', hash_script], input=json.dumps({k:state[k] for k in ['password','salt','pepper']}), capture_output=True, text=True, check=True, cwd=ROOT).stdout.strip()
    if not re.fullmatch('[0-9a-f]{128}', password_hash):
        raise SystemExit('Password hashing failed.')
    recovery_hash = hashlib.sha256(state['recovery'].encode()).hexdigest()
    quote = lambda value: "'" + str(value).replace("'", "''") + "'"
    sql = '\n'.join([
        f"INSERT INTO tenants(id,name,sector,created_at) VALUES({quote(state['tenant_id'])},'Bloch Inc','market',{state['created_at']}) ON CONFLICT(id) DO NOTHING;",
        f"INSERT INTO users(id,email,password_hash,salt,recovery_hash,created_at) VALUES({quote(state['user_id'])},{quote(email)},{quote(password_hash)},{quote(state['salt'])},{quote(recovery_hash)},{state['created_at']}) ON CONFLICT(id) DO NOTHING;",
        f"INSERT INTO memberships(tenant_id,user_id,role) VALUES({quote(state['tenant_id'])},{quote(state['user_id'])},'owner') ON CONFLICT(tenant_id,user_id) DO NOTHING;",
    ])
    if args.migrate_password_hash:
        sql += f"\nUPDATE users SET password_hash={quote(password_hash)} WHERE id={quote(state['user_id'])} AND email={quote(email)};\nDELETE FROM sessions WHERE user_id={quote(state['user_id'])};"
    private_file(LOCAL / 'master-access.txt', f"Portal: https://{args.domain}/portal/\nEmail: {email}\nPassword: {state['password']}\nRecovery code: {state['recovery']}\n")
    if not args.apply:
        print('Prepared private owner credentials. Pass --apply to configure the portal service.')
        return
    node = os.environ.get('PORB_NODE_BIN', 'node')
    wrangler = os.environ.get('PORB_WRANGLER_JS')
    command = [node, wrangler] if wrangler else ['wrangler']
    subprocess.run(command+['pages','secret','put','PORB_AUTH_PEPPER','--project-name',args.project], input=state['pepper']+'\n', text=True, check=True, cwd=ROOT/'site')
    fd, sql_path = tempfile.mkstemp(prefix='porb-owner-', suffix='.sql')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(sql)
        subprocess.run(command+['d1','execute','bi-porb-portal','--remote','--file',sql_path], check=True, cwd=ROOT/'site')
    finally:
        os.unlink(sql_path)
    print('Owner provisioned. Credentials saved with owner-only file permissions in .data/porb-portal/master-access.txt.')

if __name__ == '__main__':
    main()
