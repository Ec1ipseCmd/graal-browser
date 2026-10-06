(() => {
  const database='graal-browser-login-v1', store='login';
  const aad=new TextEncoder().encode('graal-browser-login-v1');
  const valid=value=>value && typeof value.username==='string' && value.username.length>0 && value.username.length<=256 &&
    typeof value.password==='string' && value.password.length>0 && value.password.length<=1024 &&
    typeof value.nickname==='string' && value.nickname.length<=256;
  // Only ciphertext and a non-extractable CryptoKey enter IndexedDB. A fresh key
  // per save lets both be committed atomically, including concurrent browser tabs.
  function transaction(mode,operation) {
    return new Promise((resolve,reject)=>{
      let db,tx,finished=false;
      const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);db?.close();error?reject(error):resolve(value);};
      const timer=setTimeout(()=>{tx?.abort();finish(new Error('Browser login storage timed out'));},5000);
      try {
        const open=indexedDB.open(database,1);
        open.onupgradeneeded=()=>open.result.createObjectStore(store);
        open.onerror=()=>finish(new Error('Browser login storage unavailable'));
        open.onblocked=()=>finish(new Error('Browser login storage blocked'));
        open.onsuccess=()=>{
          db=open.result;if(finished){db.close();return;}
          db.onversionchange=()=>db.close();
          try {
            tx=db.transaction(store,mode);
            const request=operation(tx.objectStore(store));
            tx.oncomplete=()=>finish(null,request.result);
            tx.onabort=tx.onerror=()=>finish(new Error('Browser login storage failed'));
          }catch(error){finish(error);}
        };
      }catch(error){finish(error);}
    });
  }
  async function load() {
    const record=await transaction('readonly',s=>s.get('current'));
    if(!record)return null;
    if(record.version!==1 || record.key?.extractable!==false || record.key.algorithm?.name!=='AES-GCM' || record.iv?.byteLength!==12 || record.data?.byteLength>8192)throw new Error('Invalid remembered login');
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:aad},record.key,record.data);
    const value=JSON.parse(new TextDecoder().decode(plain));
    if(!valid(value))throw new Error('Invalid remembered login');
    return value;
  }
  async function save(value) {
    if(!valid(value))throw new Error('Invalid login');
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,new TextEncoder().encode(JSON.stringify(value)));
    await transaction('readwrite',s=>s.put({version:1,key,iv,data},'current'));
  }
  window.graalBrowserLogin={load,save,forget:()=>transaction('readwrite',s=>s.delete('current'))};
})();
