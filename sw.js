const CACHE='riwaq-v1';
const ASSETS=['./','index.html','style.css','app.js','convert.js','config.js','icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));
});
self.addEventListener('push',e=>{
  let d={title:'رواق',body:'يوجد جديد في المجتمع'};
  try{d=e.data.json()}catch(_){}
  e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'icon.svg',badge:'icon.svg',dir:'rtl',lang:'ar',data:{post:d.post_id}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const p=e.notification.data&&e.notification.data.post;
  const url=self.registration.scope+(p?'#/post/'+p:'');
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c){c.navigate(url);return c.focus()}}return clients.openWindow(url)}));
});
