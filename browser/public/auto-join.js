(() => {
  const key = 'kingdoms.autoJoin.v1';
  const layout = 'worlds-701500-55e809df';
  const notify = text => parent.postMessage({source:'kingdoms-client',autoJoin:text},location.origin);
  const enabled = () => { try { return localStorage.getItem(key)==='true'; } catch { return false; } };
  // The named-control registry and native methods are used only for the exact
  // framework/WASM pair validated by the server. No coordinate-based clicks.
  function driver(m) {
    if(m?.kingdomsKeyLayout!==layout)return null;
    const word = address => {
      if(!Number.isInteger(address)||address<4||address%4||address+4>m.HEAPU8.length)throw new Error('Invalid control pointer');
      return m.HEAPU32[address/4];
    };
    function name(object) {
      const pointer=word(object+4),length=pointer?word(pointer):0;
      if(!length||length>160||pointer+8+length>m.HEAPU8.length)return '';
      const bytes=m.HEAPU8.slice(pointer+8,pointer+8+length);
      for(let i=0;i<bytes.length;i++)bytes[i]^=m.HEAPU8[12863869+i%3];
      return new TextDecoder().decode(bytes);
    }
    function controls() {
      const root=word(12731960);if(!root)return new Map();
      const map=word(root+60);if(!map)return new Map();
      const buckets=word(map+4),count=word(map+16);
      if(!count||count>65536||!buckets)throw new Error('Unsupported control registry');
      const result=new Map(),seen=new Set();
      for(let i=0;i<count;i++) {
        let node=word(buckets+i*4);
        while(node) {
          if(seen.has(node)||seen.size>20000)throw new Error('Invalid control registry');
          seen.add(node);const object=word(node);
          if(object)result.set(name(object),object);
          node=word(node+4);
        }
      }
      return result;
    }
    function call(index,object,text,argument) {
      const bytes=new TextEncoder().encode(text+'\0');
      const raw=m.asm.malloc(bytes.length),string=m.asm.malloc(4);
      if(!raw||!string){if(raw)m.asm.free(raw);if(string)m.asm.free(string);throw new Error('Allocation failed');}
      m.HEAPU32[string/4]=0;
      let parameters=0;
      try {
        m.HEAPU8.set(bytes,raw);m.dynCall_iii(13612,string,raw);
        if(argument===undefined)m.dynCall_vii(index,object,string);
        else {
          const menu=typeof argument==='object';
          const value=new TextEncoder().encode((menu?argument.text:argument)+'\0');
          parameters=m.asm.malloc(value.length+16);if(!parameters)throw new Error('Allocation failed');
          if(menu) {
            m.HEAPU32.set([argument.id,parameters+16,argument.index],parameters/4);
            m.HEAPU8.set([105,115,105,0],parameters+12); // native varargs "isi"
          } else {
            m.HEAPU32[parameters/4]=parameters+16;
            m.HEAPU8.set([115,0],parameters+12); // native varargs "s"
          }
          m.HEAPU8.set(value,parameters+16);
          m.dynCall_viiii(index,object,string,parameters+12,parameters);
        }
      } finally {if(parameters)m.asm.free(parameters);m.dynCall_vi(13587,string);m.asm.free(string);m.asm.free(raw);}
    }
    return {controls,action:(object,event='onAction')=>call(13951,object,event),setText:(object,text)=>call(61874,object,text),
      playerList:(object,listWindow)=>{
        // Read the real GUI visibility, including changes made through menus.
        // The validated build uses byte 197 and native setVisible at slot 61378.
        if(listWindow) {
          word(listWindow+196); // bounds/alignment validation before reading
          const visible=m.HEAPU8[listWindow+197];
          if(visible!==0&&visible!==1)throw new Error('Invalid window visibility');
          if(visible) {m.dynCall_vii(61378,listWindow,0);return;}
        }
        // Verified Start menu selection: item ID 13, label, row 0.
        call(13944,object,'onselect',{id:13,text:'Playerlist F7',index:0});
      },
      join:object=>{call(61874,object,'graal2002');call(13944,object,'onAction','graal2002');}};
  }
  // At most one login submission and one server selection per page load. Never
  // retry passwords or reconnect after logout, disconnection, or a failed login.
  function controller({getDriver,hasLogin,report,clock=Date.now}) {
    const deadline=clock()+120000;
    let submitted=false,finished=false;
    return {
      stop(){finished=true;},
      tick(){
        if(finished)return true;
        if(clock()>deadline){finished=true;report('Auto join stopped. Continue in the client or reload to retry.');return true;}
        try {
          const native=getDriver();if(!native)return false;
          const controls=native.controls(),direct=controls.get('Serverlist_ServerDirectConnect');
          if(direct){finished=true;native.join(direct);report('Kingdoms requested');return true;}
          const start=controls.get('StartConnectButton');
          if(start&&!submitted){
            submitted=true;
            if(!hasLogin()){report('Sign in and save your login once; auto join will select Kingdoms after sign-in.');return false;}
            native.action(start);report('Signing in with this browser’s saved login…');
          }
          return false;
        } catch {finished=true;report('Auto join is unavailable for this client. Please continue manually.');return true;}
      },
    };
  }
  window.kingdomsAutoJoin={driver,controller};
  let running,timer;
  if(enabled()) {
    running=controller({
      getDriver:()=>{
        const m=window.unityInstance?.Module;
        if(!m||document.getElementById('imageContainer')?.style.display!=='none')return null;
        if(m.kingdomsKeyLayout!==layout)throw new Error('Unsupported build');
        return driver(m);
      },
      hasLogin:()=>window.kingdomsNativeLogin?.hasSavedLogin()===true,
      report:notify,
    });
    timer=setInterval(()=>{if(!enabled()){running.stop();clearInterval(timer);return;}if(running.tick())clearInterval(timer);},500);
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='kingdoms-launcher')return;
    if(event.data.autoJoin===false){running?.stop();clearInterval(timer);notify('Auto join disabled');}
    else if(event.data.autoJoin===true)notify('Auto join enabled for the next reload');
  });
  window.addEventListener('pagehide',()=>{running?.stop();clearInterval(timer);});
})();
