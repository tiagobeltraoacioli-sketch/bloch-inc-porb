export function onRequestGet({request,next}) {
  const url=new URL(request.url);
  if(!url.search)return Response.redirect(new URL('/app/',url),302);
  return next();
}
