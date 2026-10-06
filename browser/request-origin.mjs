export function configuredOrigin(value){
  if(!value)return null;
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin, without a path.');
  return url.origin;
}

export function requestOrigin(req,publicOrigin){
  const incoming=new URL(`${req.socket.encrypted?'https':'http'}://${req.headers.host}`);
  if(publicOrigin&&incoming.host===new URL(publicOrigin).host)return publicOrigin;
  if(publicOrigin&&!['localhost','127.0.0.1','[::1]'].includes(incoming.hostname))throw new Error('Unexpected host');
  // Local access remains available while the tunnel serves the configured HTTPS
  // origin. Arbitrary forwarding headers never control generated asset URLs.
  return incoming.origin;
}
