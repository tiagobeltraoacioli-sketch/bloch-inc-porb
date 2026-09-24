"""Verify the deployed portal using local owner credentials, without printing secrets."""
import argparse
import http.cookiejar
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPCookieProcessor

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--origin', default='https://rednblue-space.pages.dev')
    parser.add_argument('--collect', action='store_true')
    parser.add_argument('--resume', action='store_true', help='Reuse existing asset collections while completing missing ones.')
    args=parser.parse_args()
    if args.origin not in ['https://rednblue-space.pages.dev','https://rednblue.space']:
        raise SystemExit('Only the two configured portal origins are allowed.')
    state=json.loads((ROOT/'.data/porb-portal/bootstrap.json').read_text())
    opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(path, method='GET', body=None, key=None, expected=200):
        headers={'Accept':'application/json','User-Agent':'BI-PoRB-Deployment-Check/1.0'}
        if method!='GET':
            headers.update({'Content-Type':'application/json','Origin':args.origin,'X-Porb-Action':'1'})
        if key:
            headers['Authorization']='Bearer '+key
        req=Request(args.origin+'/api/porb'+path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
        try:
            response=opener.open(req, timeout=120)
        except HTTPError as error:
            response=error
        data=json.load(response)
        if response.status!=expected:
            raise RuntimeError(f'{method} {path}: HTTP {response.status}, {data.get("error",str(data)[:300])}')
        return data
    call('/v1/analyses', expected=401)
    call('/auth/login','POST',{'email':state['email'],'password':state['password']})
    session=call('/auth/session')
    assert session['user']['email']==state['email'] and session['organization']['role']=='owner'
    print('Owner login and organization access verified.', flush=True)
    summary=call('/v1/overview')
    print('Network sources:', [(n['network'],n['status']) for n in summary['networks']], flush=True)
    results=[]
    failures=[]
    existing={r['asset']:r for r in call('/v1/analyses')['analyses']} if args.resume else {}
    if args.collect:
        for asset in ['BTC','ETH','BLCH','USDT','USDC']:
            try:
                result=call('/v1/analyses/'+existing[asset]['id']) if asset in existing else call('/v1/analyses','POST',{'asset':asset,'pages':2},expected=201)
                reread=call('/v1/analyses/'+result['id'])
                assert reread==result
                record={key:result[key] for key in ['id','asset','wallets','records','pages','red_median','blue_median','created_at','digest']}
                results.append(record)
                print(json.dumps(record),flush=True)
            except RuntimeError as error:
                failures.append(str(error))
                print('Collection unavailable:',asset,str(error),flush=True)
    for network in ['bitcoin','ethereum','bloch']:
        try:
            result=call('/v1/science?network='+network)
            print('Time series:', network, 'observations=',result['analysis']['statistics']['n'],'evaluation=',result['analysis']['validation']['available'],flush=True)
        except RuntimeError as error:
            failures.append(str(error))
            print('Time series unavailable:',network,str(error),flush=True)
    key=call('/keys','POST',{'label':'Deployment verification (revoked)','days':1,'scopes':['analyses:read','scores:read'],'password':state['password']},expected=201)
    try:
        call('/v1/model',key=key['key'])
        call('/v1/overview',key=key['key'],expected=403)
    finally:
        call('/keys/'+key['id'],'DELETE',{'password':state['password']})
    call('/v1/model',key=key['key'],expected=401)
    call('/auth/logout','POST',{})
    assert call('/auth/session')['authenticated'] is False
    report=ROOT/'.data/porb-portal/live-verification.json'
    report.write_text(json.dumps({'origin':args.origin,'sources':summary,'collections':results,'failures':failures,'key_revoked':True},indent=2))
    print('Verified: authentication, saved-analysis access, scoped API access and revocation. Source failures: '+str(len(failures))+'. No secrets printed.',flush=True)
    if failures:
        raise SystemExit(1)

if __name__=='__main__':
    main()
