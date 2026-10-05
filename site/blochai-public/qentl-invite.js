// Earlier Qentl invitations link to https://qentl.ai/#invite=<token>. The
// fragment never leaves the browser; forward it to the workspace unchanged.
if(location.origin==='https://qentl.ai'&&/^#invite=[a-f0-9]{64}$/.test(location.hash))location.replace('/workspace'+location.hash);
