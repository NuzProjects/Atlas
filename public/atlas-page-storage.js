(function(root) {
  function initialize(target) {
    if(root.__atlasPageStorage)return;
    root.__atlasPageStorage=true;
    const prefix='atlas_'+root.AtlasProxyOrigin.hash(new URL(target).origin).slice(0,32)+'_';
    for(const name of ['localStorage','sessionStorage']) {
      try {
        const storage=root[name];
        const keys=()=>Object.keys(storage).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length));
        const methods={
          getItem:key=>storage.getItem(prefix+key),
          setItem:(key,value)=>storage.setItem(prefix+key,String(value)),
          removeItem:key=>storage.removeItem(prefix+key),
          clear:()=>keys().forEach(key=>storage.removeItem(prefix+key)),
          key:index=>keys()[Number(index)] ?? null
        };
        const view=new Proxy(storage,{
          get:(_object,key)=>key==='length'?keys().length:key in methods?methods[key]:typeof key==='symbol'?undefined:methods.getItem(key),
          set:(_object,key,value)=>{methods.setItem(key,value);return true;},
          deleteProperty:(_object,key)=>{methods.removeItem(key);return true;},
          ownKeys:keys,
          getOwnPropertyDescriptor:(_object,key)=>keys().includes(key)?{configurable:true,enumerable:true,writable:true,value:methods.getItem(key)}:undefined
        });
        Object.defineProperty(root,name,{configurable:true,get:()=>view});
      } catch {}
    }
    try {
      const native=Object.getOwnPropertyDescriptor(root.Document.prototype,'cookie');
      Object.defineProperty(root.document,'cookie',{
        configurable:true,
        get:()=>native.get.call(root.document).split(';').map(value=>value.trim()).filter(value=>value.startsWith(prefix)).map(value=>value.slice(prefix.length)).join('; '),
        set:value=>native.set.call(root.document,prefix+String(value).replace(/;\s*(?:Domain|Path)=[^;]*/ig,'')+'; Path=/')
      });
    } catch {}
    try {
      const factory=root.indexedDB;
      const methods={open:(name,...args)=>factory.open(prefix+name,...args),deleteDatabase:name=>factory.deleteDatabase(prefix+name),
        databases:async()=> (await factory.databases()).filter(db=>db.name?.startsWith(prefix)).map(db=>({...db,name:db.name.slice(prefix.length)}))};
      Object.defineProperty(root,'indexedDB',{configurable:true,value:new Proxy(factory,{get:(object,key)=>key in methods?methods[key]:typeof object[key]==='function'?object[key].bind(object):object[key]})});
    } catch {}
  }
  root.AtlasPageStorage={initialize};
})(globalThis);
