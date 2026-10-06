import { randomBytes } from 'node:crypto';

// Ephemeral browser presence, independent of accounts and remembered logins.
export function createPresence({clock=Date.now, ttl=120000, limit=10000}={}) {
  const visitors=new Map();
  return (req,res,send,origin) => {
    if (!['GET','POST'].includes(req.method)) return send(405,JSON.stringify({error:'Method not allowed.'}));
    const now=clock();
    for(const [id,lastSeen] of visitors)if(now-lastSeen>=ttl)visitors.delete(id);
    if(req.method==='POST') {
      if(req.headers.origin!==origin || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin')) {
        return send(403,JSON.stringify({error:'Same-origin request required.'}));
      }
      let id=req.headers.cookie?.match(/(?:^|;\s*)graal_presence=([a-f0-9]{48})(?:;|$)/)?.[1];
      if(!visitors.has(id)&&visitors.size>=limit)return send(429,JSON.stringify({error:'Presence unavailable.'}));
      if(!id) {
        id=randomBytes(24).toString('hex');
        res.setHeader('Set-Cookie',`graal_presence=${id}; Path=/api/presence; HttpOnly; SameSite=Strict${origin.startsWith('https:')?'; Secure':''}`);
      }
      visitors.set(id,now);
    }
    return send(200,JSON.stringify({browsers:visitors.size}));
  };
}
