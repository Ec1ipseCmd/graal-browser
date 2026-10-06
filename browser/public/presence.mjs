// Heartbeats count browser profiles with this page open, not authenticated players.
export function startPresence(element) {
  let timer,request,stopped=false;
  async function update() {
    if(stopped||request)return;
    clearTimeout(timer);
    request=new AbortController();
    const timeout=setTimeout(()=>request?.abort(),8000);
    try {
      const response=await fetch('/api/presence',{method:'POST',credentials:'same-origin',cache:'no-store',signal:request.signal});
      if(!response.ok)throw new Error('Presence unavailable');
      const {browsers}=await response.json();
      if(!Number.isSafeInteger(browsers)||browsers<0)throw new Error('Invalid count');
      element.textContent=`${browsers} browser${browsers===1?'':'s'} online`;
    } catch {
      if(!stopped)element.textContent='Online count unavailable';
    } finally {
      clearTimeout(timeout);request=null;
      if(!stopped)timer=setTimeout(update,20000);
    }
  }
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);request?.abort();});
  window.addEventListener('pageshow',()=>{if(stopped){stopped=false;update();}});
  window.addEventListener('online',update);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  update();
}
