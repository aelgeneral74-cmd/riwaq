import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {TOOLS,download} from './convert.js';
const C=window.RIWAQ;
const sb=createClient(C.SUPABASE_URL,C.SUPABASE_KEY);
const $=(s,r=document)=>r.querySelector(s);
const app=$('#app');
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KIND={summary:['ملخص','s'],question:['سؤال','q'],reference:['مرجع','r']};
let me=null,session=null,unread=0;

function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}
function ago(d){const s=(Date.now()-new Date(d))/1000;if(s<60)return'الآن';if(s<3600)return Math.floor(s/60)+' د';if(s<86400)return Math.floor(s/3600)+' س';return Math.floor(s/86400)+' يوم'}
function badge(p){
  if(!p)return'';
  return (p.verified?'<span class="chk" title="حساب موثق">✔</span>':'')+(p.title?` <span class="ttl" style="background:${esc(p.title_color||'#0f766e')}">${esc(p.title)}</span>`:'');
}
function name(p){return `<a href="#/member/${p.id}">${esc(p.full_name||'عضو')}</a> ${badge(p)}`}

async function init(){
  const {data}=await sb.auth.getSession();session=data.session;
  sb.auth.onAuthStateChange((_e,s)=>{const was=!!session;session=s;if(!!s!==was)boot()});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  window.addEventListener('hashchange',route);
  boot();
}
async function boot(){
  if(!session){me=null;return authView()}
  const {data}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
  me=data;
  if(!me)return authView();
  await countUnread();
  route();
  sb.channel('notifs').on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+me.id},p=>{unread++;updDot();toast(p.new.text)}).subscribe();
}
async function countUnread(){const {count}=await sb.from('notifications').select('*',{count:'exact',head:true}).eq('read',false);unread=count||0}
function updDot(){const d=$('#dot');if(d){d.textContent=unread;d.style.display=unread?'block':'none'}}

function shell(inner,title='رواق'){
  app.innerHTML=`<div class="top"><h1><a href="#/" style="color:inherit">رواق</a></h1>
   <a href="#/tools">أدوات</a>
   <a href="#/notifs">🔔<span class="dot" id="dot" style="display:none"></span></a>
   <a href="#/profile">حسابي</a>${me&&me.role==='admin'?'<a href="#/admin">إدارة</a>':''}</div>
   <main>${inner}</main>`;
  updDot();
}

/* ---------- auth ---------- */
function authView(mode='in'){
  const up=mode==='up';
  app.innerHTML=`<div class="auth"><h2>رواق</h2><p class="sub">مجتمع طلبة الدراسات العليا: ملخصات، أسئلة، ومراجع</p>
  <div class="card"><form id="f">
  ${up?`<label>الاسم الكامل</label><input name="full_name" required>
  <label>الجامعة</label><input name="university">
  <label>التخصص</label><input name="specialty">`:''}
  <label>البريد الإلكتروني</label><input name="email" type="email" required dir="ltr" autocomplete="email">
  <label>كلمة المرور</label><input name="password" type="password" minlength="6" required dir="ltr" autocomplete="${up?'new-password':'current-password'}">
  <div class="err" id="err"></div>
  <button class="btn" style="width:100%">${up?'إنشاء حساب':'دخول'}</button></form></div>
  <p style="text-align:center"><a href="#" id="sw">${up?'لدي حساب بالفعل':'ليس لديك حساب؟ سجّل الآن'}</a></p></div>`;
  $('#sw').onclick=(e)=>{e.preventDefault();authView(up?'in':'up')};
  $('#f').onsubmit=async(e)=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.target));$('#err').textContent='';
    const btn=e.target.querySelector('button');btn.disabled=true;
    let r;
    if(up)r=await sb.auth.signUp({email:f.email,password:f.password,options:{data:{full_name:f.full_name,university:f.university,specialty:f.specialty}}});
    else r=await sb.auth.signInWithPassword({email:f.email,password:f.password});
    btn.disabled=false;
    if(r.error){$('#err').textContent=r.error.message.includes('Invalid login')?'البريد أو كلمة المرور غير صحيحة':r.error.message;return}
    if(up&&!r.data.session){$('#err').textContent='تم إنشاء الحساب. تحقق من بريدك لتأكيده ثم سجّل الدخول.'}
  };
}

/* ---------- router ---------- */
function route(){
  if(!me)return;
  const h=location.hash.slice(1)||'/';const [,a,b]=h.split('/');
  window.scrollTo(0,0);
  if(a==='post')return postView(b);
  if(a==='new')return newView(b);
  if(a==='tools')return toolsView();
  if(a==='profile')return profileView();
  if(a==='member')return memberView(b);
  if(a==='notifs')return notifsView();
  if(a==='admin')return me.role==='admin'?adminView():feedView();
  feedView();
}

/* ---------- feed ---------- */
let feedState={kind:'all',q:'',subject:''};
async function feedView(){
  shell(`<div class="tabs" id="tabs"></div>
  <div class="row"><input id="q" placeholder="ابحث في العناوين والمحتوى" style="flex:2;min-width:160px" value="${esc(feedState.q)}">
  <input id="sub" placeholder="المادة / التخصص" style="flex:1;min-width:120px" value="${esc(feedState.subject)}"></div>
  <div id="list"><div class="empty">جاري التحميل...</div></div>
  <button class="fab" onclick="location.hash='#/new'" aria-label="منشور جديد">+</button>`);
  const tabs=[['all','الكل'],['summary','ملخصات'],['question','أسئلة'],['reference','مراجع']];
  $('#tabs').innerHTML=tabs.map(([k,t])=>`<button class="tab ${feedState.kind===k?'on':''}" data-k="${k}">${t}</button>`).join('');
  $('#tabs').onclick=(e)=>{const k=e.target.dataset.k;if(k){feedState.kind=k;feedView()}};
  let t;const go=()=>{feedState.q=$('#q').value;feedState.subject=$('#sub').value;clearTimeout(t);t=setTimeout(loadFeed,300)};
  $('#q').oninput=go;$('#sub').oninput=go;
  loadFeed();
}
async function loadFeed(){
  let q=sb.from('posts').select('*,author:profiles(id,full_name,verified,title,title_color),comments(count)').order('created_at',{ascending:false}).limit(60);
  if(feedState.kind!=='all')q=q.eq('kind',feedState.kind);
  if(feedState.subject.trim())q=q.ilike('subject','%'+feedState.subject.trim().replace(/[%,]/g,'')+'%');
  const s=feedState.q.trim().replace(/[%,()]/g,'');
  if(s)q=q.or(`title.ilike.%${s}%,body.ilike.%${s}%`);
  const {data,error}=await q;
  const el=$('#list');if(!el)return;
  if(error)return el.innerHTML='<div class="empty">تعذر التحميل</div>';
  if(!data.length)return el.innerHTML='<div class="empty">لا يوجد منشورات بعد. كن أول من ينشر.</div>';
  el.innerHTML=data.map(p=>{const [kt,kc]=KIND[p.kind];return `<a href="#/post/${p.id}" style="color:inherit"><div class="card">
   <div class="meta"><span class="chip ${kc}">${kt}</span>${p.subject?`<span class="chip">${esc(p.subject)}</span>`:''}${p.solved?'<span class="chip s">تم الحل</span>':''}</div>
   <h3>${esc(p.title)}</h3>
   <div class="body" style="color:var(--mute);max-height:3.2em;overflow:hidden">${esc(p.body)}</div>
   <div class="meta" style="margin-top:6px">${esc(p.author?.full_name||'')} ${badge(p.author)} · ${ago(p.created_at)} · 💬 ${p.comments?.[0]?.count||0}${p.file_url?' · 📎':''}</div></div></a>`}).join('');
}

/* ---------- new post ---------- */
function newView(kind){
  shell(`<h2 class="sec">منشور جديد</h2><div class="card"><form id="f">
  <label>النوع</label><select name="kind"><option value="summary">ملخص</option><option value="question">سؤال</option><option value="reference">مرجع</option></select>
  <label>العنوان</label><input name="title" required maxlength="140">
  <label>المادة / التخصص</label><input name="subject" maxlength="60">
  <label>الوصف</label><textarea name="body"></textarea>
  <label>ملف مرفق (اختياري، حتى 25 ميجا)</label><input type="file" name="file">
  <div class="err" id="err"></div><button class="btn">نشر</button></form></div>`);
  if(kind)$('[name=kind]').value=kind;
  $('#f').onsubmit=async(e)=>{
    e.preventDefault();const fd=new FormData(e.target);const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='جاري النشر...';
    let file_url=null,file_name=null;const file=fd.get('file');
    if(file&&file.size){
      if(file.size>25*1024*1024){$('#err').textContent='حجم الملف أكبر من 25 ميجا';btn.disabled=false;btn.textContent='نشر';return}
      const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').slice(0,8)||'bin';
      const path=`${me.id}/${Date.now()}.${ext}`;
      const up=await sb.storage.from('files').upload(path,file);
      if(up.error){$('#err').textContent='تعذر رفع الملف: '+up.error.message;btn.disabled=false;btn.textContent='نشر';return}
      file_url=sb.storage.from('files').getPublicUrl(path).data.publicUrl;file_name=file.name;
    }
    const {data,error}=await sb.from('posts').insert({user_id:me.id,kind:fd.get('kind'),title:fd.get('title').trim(),subject:fd.get('subject').trim(),body:fd.get('body').trim(),file_url,file_name}).select().single();
    if(error){$('#err').textContent=me.suspended?'حسابك موقوف':error.message;btn.disabled=false;btn.textContent='نشر';return}
    toast('تم النشر');location.hash='#/post/'+data.id;
  };
}

/* ---------- post ---------- */
async function postView(id){
  shell('<div class="empty">جاري التحميل...</div>');
  const [{data:p},{data:cs},{count:vc},{data:mv}]=await Promise.all([
    sb.from('posts').select('*,author:profiles(id,full_name,verified,title,title_color)').eq('id',id).single(),
    sb.from('comments').select('*,author:profiles(id,full_name,verified,title,title_color)').eq('post_id',id).order('created_at'),
    sb.from('votes').select('*',{count:'exact',head:true}).eq('post_id',id),
    sb.from('votes').select('post_id').eq('post_id',id).eq('user_id',me.id)]);
  if(!p)return shell('<div class="empty">المنشور غير موجود</div>');
  const [kt,kc]=KIND[p.kind];const mine=p.user_id===me.id,admin=me.role==='admin';
  const voted=!!(mv&&mv.length);
  shell(`<div class="card"><div class="meta"><span class="chip ${kc}">${kt}</span>${p.subject?`<span class="chip">${esc(p.subject)}</span>`:''}${p.solved?'<span class="chip s">تم الحل</span>':''}</div>
  <h3 style="font-size:20px;margin-top:6px">${esc(p.title)}</h3>
  <div class="meta">${name(p.author)} · ${ago(p.created_at)}</div>
  <div class="body" style="margin:12px 0">${esc(p.body)}</div>
  ${p.file_url?`<a class="btn alt sm" href="${esc(p.file_url)}" target="_blank" rel="noopener">📎 ${esc(p.file_name||'تحميل الملف')}</a>`:''}
  <div class="row" style="margin-top:12px"><button class="btn alt sm" id="vote">${voted?'✓ مفيد':'👍 مفيد'} (${vc||0})</button>
  ${(mine||admin)?'<button class="btn red sm" id="del">حذف</button>':''}
  ${(mine&&p.kind==='question')?`<button class="btn alt sm" id="solve">${p.solved?'إلغاء تم الحل':'تم الحل'}</button>`:''}</div></div>
  <h2 class="sec">${p.kind==='question'?'الإجابات والردود':'التعليقات'} (${cs.length})</h2>
  <div class="card">${cs.map(c=>`<div class="cmt ${c.is_answer?'ans':''}">
   <div class="meta">${name(c.author)} · ${ago(c.created_at)} ${c.is_answer?'· <b style="color:#116b45">أفضل إجابة</b>':''}</div>
   <div class="body">${esc(c.body)}</div>
   <div class="row" style="margin-top:4px">${(mine&&p.kind==='question'&&c.user_id!==me.id)?`<button class="btn alt sm" data-ans="${c.id}" data-v="${c.is_answer}">${c.is_answer?'إلغاء التحديد':'أفضل إجابة'}</button>`:''}
   ${(c.user_id===me.id||admin)?`<button class="btn alt sm" data-del="${c.id}">حذف</button>`:''}</div></div>`).join('')||'<div class="empty" style="padding:14px">لا ردود بعد</div>'}
   <form id="cf" style="margin-top:10px"><textarea name="b" required placeholder="اكتب ردك" style="min-height:70px"></textarea><button class="btn sm">إرسال</button></form></div>`);
  $('#vote').onclick=async()=>{voted?await sb.from('votes').delete().eq('post_id',id).eq('user_id',me.id):await sb.from('votes').insert({post_id:+id,user_id:me.id});postView(id)};
  if($('#del'))$('#del').onclick=async()=>{if(confirm('حذف المنشور؟')){await sb.from('posts').delete().eq('id',id);location.hash='#/'}};
  if($('#solve'))$('#solve').onclick=async()=>{await sb.from('posts').update({solved:!p.solved}).eq('id',id);postView(id)};
  app.querySelectorAll('[data-ans]').forEach(b=>b.onclick=async()=>{await sb.from('comments').update({is_answer:b.dataset.v!=='true'}).eq('id',b.dataset.ans);if(b.dataset.v!=='true')await sb.from('posts').update({solved:true}).eq('id',id);postView(id)});
  app.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('حذف الرد؟')){await sb.from('comments').delete().eq('id',b.dataset.del);postView(id)}});
  $('#cf').onsubmit=async(e)=>{e.preventDefault();const body=e.target.b.value.trim();if(!body)return;const {error}=await sb.from('comments').insert({post_id:+id,user_id:me.id,body});if(error)return toast(me.suspended?'حسابك موقوف':'تعذر الإرسال');postView(id)};
}

/* ---------- tools ---------- */
function toolsView(){
  shell(`<h2 class="sec">أدوات التحويل</h2><p class="meta">التحويل يتم على جهازك ولا يُرفع الملف لأي مكان.</p>
  <div class="tabs" id="tt">${TOOLS.map((t,i)=>`<button class="tab ${i?'':'on'}" data-i="${i}">${t.name}</button>`).join('')}</div>
  <div class="card"><div class="drop"><input type="file" id="tf" ${TOOLS[0].multiple?'multiple':''} accept="${TOOLS[0].accept}"></div>
  <div id="tmsg" class="meta" style="margin:10px 0"></div><button class="btn" id="go">حوّل</button></div>
  <p class="meta">ملاحظة: تحويل PDF إلى Word ينقل النص فقط. وتحويل Word إلى Excel أدق مع الملفات التي فيها جداول.</p>`);
  let cur=0;
  $('#tt').onclick=(e)=>{const i=e.target.dataset.i;if(i==null)return;cur=+i;app.querySelectorAll('#tt .tab').forEach((b,j)=>b.classList.toggle('on',j===cur));const f=$('#tf');f.value='';f.accept=TOOLS[cur].accept;f.multiple=!!TOOLS[cur].multiple;$('#tmsg').textContent=''};
  $('#go').onclick=async()=>{
    const files=[...$('#tf').files];if(!files.length)return toast('اختر ملفًا أولًا');
    $('#tmsg').textContent='جاري التحويل...';$('#go').disabled=true;
    try{const r=await TOOLS[cur].run(files);if(r.blob)download(r.blob,r.name);$('#tmsg').textContent=(r.blob?'تم التحويل. ':'')+(r.note||'')}
    catch(err){$('#tmsg').textContent='تعذر التحويل: '+(err.message||'ملف غير مدعوم')}
    $('#go').disabled=false;
  };
}

/* ---------- notifications ---------- */
async function notifsView(){
  shell('<h2 class="sec">الإشعارات</h2><div id="nl"><div class="empty">...</div></div><div class="card" id="pushbox"></div>');
  pushBox();
  const {data}=await sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(50);
  $('#nl').innerHTML=(data||[]).map(n=>`<a href="#/post/${n.post_id}" style="color:inherit"><div class="card" style="${n.read?'':'border-color:var(--gold)'}">${esc(n.text)}<div class="meta">${ago(n.created_at)}</div></div></a>`).join('')||'<div class="empty">لا إشعارات</div>';
  await sb.from('notifications').update({read:true}).eq('read',false);unread=0;updDot();
}
function b64(s){const p='='.repeat((4-s.length%4)%4);const r=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...r].map(c=>c.charCodeAt(0)))}
async function pushBox(){
  const el=$('#pushbox');if(!el)return;
  if(!('serviceWorker' in navigator)||!('PushManager' in window)){el.innerHTML='<div class="meta">المتصفح لا يدعم إشعارات الدفع. على الآيفون ثبّت التطبيق على الشاشة الرئيسية أولًا (مشاركة ثم إضافة إلى الشاشة الرئيسية).</div>';return}
  const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();
  el.innerHTML=sub?'<div class="row"><span>إشعارات الهاتف مفعّلة</span><button class="btn alt sm" id="poff">إيقاف</button></div>':'<div class="row"><span>فعّل إشعارات الهاتف لتعرف بكل جديد</span><button class="btn sm" id="pon">تفعيل</button></div>';
  if($('#pon'))$('#pon').onclick=async()=>{
    const perm=await Notification.requestPermission();if(perm!=='granted')return toast('لم يتم السماح بالإشعارات');
    try{const s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(C.VAPID_PUBLIC)});
      const j=s.toJSON();await sb.from('push_subs').upsert({endpoint:j.endpoint,user_id:me.id,sub:j});toast('تم التفعيل');pushBox()}catch(e){toast('تعذر التفعيل')}};
  if($('#poff'))$('#poff').onclick=async()=>{await sb.from('push_subs').delete().eq('endpoint',sub.endpoint);await sub.unsubscribe();pushBox()};
}

/* ---------- profile ---------- */
async function profileView(){
  shell(`<div class="card"><h3>${esc(me.full_name)} ${badge(me)}</h3><div class="meta">${esc(me.email)}</div>
  ${me.verified?'':'<div class="meta" style="margin-top:6px">حسابك غير موثق بعد. يمنح المشرف علامة التوثيق للأعضاء المعروفين.</div>'}</div>
  <div class="card"><form id="f"><label>الاسم</label><input name="full_name" value="${esc(me.full_name)}" required>
  <label>الجامعة</label><input name="university" value="${esc(me.university)}"><label>التخصص</label><input name="specialty" value="${esc(me.specialty)}">
  <label>نبذة</label><textarea name="bio">${esc(me.bio)}</textarea><button class="btn">حفظ</button></form></div>
  <div class="card" id="pushbox"></div><button class="btn alt" id="out">تسجيل الخروج</button>`);
  pushBox();
  $('#f').onsubmit=async(e)=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const {error}=await sb.from('profiles').update(f).eq('id',me.id);if(error)return toast('تعذر الحفظ');Object.assign(me,f);toast('تم الحفظ')};
  $('#out').onclick=()=>sb.auth.signOut();
}
async function memberView(id){
  shell('<div class="empty">...</div>');
  const [{data:p},{data:ps}]=await Promise.all([sb.from('profiles').select('*').eq('id',id).single(),sb.from('posts').select('id,title,kind,created_at').eq('user_id',id).order('created_at',{ascending:false}).limit(30)]);
  if(!p)return shell('<div class="empty">غير موجود</div>');
  shell(`<div class="card"><h3>${esc(p.full_name)} ${badge(p)}</h3><div class="meta">${esc(p.university||'')} ${p.specialty?'· '+esc(p.specialty):''}</div><div class="body" style="margin-top:8px">${esc(p.bio||'')}</div></div>
  <h2 class="sec">منشوراته</h2>${(ps||[]).map(x=>`<a href="#/post/${x.id}" style="color:inherit"><div class="card"><span class="chip ${KIND[x.kind][1]}">${KIND[x.kind][0]}</span> ${esc(x.title)}<div class="meta">${ago(x.created_at)}</div></div></a>`).join('')||'<div class="empty">لا منشورات</div>'}`);
}

/* ---------- admin ---------- */
let adm={q:'',sort:'score'};
async function adminView(){
  shell('<div class="empty">جاري التحميل...</div>');
  const [{data:users},{data:titles}]=await Promise.all([sb.from('activity').select('*'),sb.from('titles').select('*').order('id')]);
  const score=(u)=>u.posts*3+u.comments+u.answers*3;
  const st={total:users.length,ver:users.filter(u=>u.verified).length,sus:users.filter(u=>u.suspended).length,posts:users.reduce((a,u)=>a+u.posts,0)};
  const list=users.filter(u=>!adm.q||(u.full_name+u.email).toLowerCase().includes(adm.q.toLowerCase())).sort((a,b)=>adm.sort==='new'?new Date(b.created_at)-new Date(a.created_at):score(b)-score(a));
  shell(`<h2 class="sec">لوحة الإدارة</h2>
  <div class="stat"><div><b>${st.total}</b>أعضاء</div><div><b>${st.ver}</b>موثقون</div><div><b>${st.posts}</b>منشورات</div><div><b>${st.sus}</b>موقوفون</div></div>
  <div class="row"><input id="aq" placeholder="بحث بالاسم أو البريد" value="${esc(adm.q)}" style="flex:2">
  <select id="as" style="flex:1"><option value="score" ${adm.sort==='score'?'selected':''}>الأكثر نشاطًا</option><option value="new" ${adm.sort==='new'?'selected':''}>الأحدث</option></select></div>
  <div class="card scroll"><table><thead><tr><th>العضو</th><th>نشاط</th><th>اللقب</th><th>إجراءات</th></tr></thead><tbody>
  ${list.map(u=>`<tr><td><a href="#/member/${u.id}">${esc(u.full_name||'-')}</a> ${badge(u)}<div class="meta" dir="ltr" style="justify-content:flex-end">${esc(u.email||'')}</div>${u.suspended?'<span class="chip q">موقوف</span>':''}${u.role==='admin'?' <span class="chip">مشرف</span>':''}</td>
   <td>${u.posts} منشور<br>${u.comments} رد<br>${u.answers} إجابة</td>
   <td><select data-t="${u.id}"><option value="">بدون</option>${titles.map(t=>`<option value="${t.id}" ${t.name===u.title?'selected':''}>${esc(t.name)}</option>`).join('')}</select></td>
   <td><div class="row"><button class="btn sm ${u.verified?'alt':''}" data-v="${u.id}" data-val="${u.verified}">${u.verified?'إلغاء التوثيق':'توثيق'}</button>
   ${u.id!==me.id?`<button class="btn sm alt" data-s="${u.id}" data-val="${u.suspended}">${u.suspended?'رفع الإيقاف':'إيقاف'}</button><button class="btn sm alt" data-r="${u.id}" data-val="${u.role}">${u.role==='admin'?'سحب الإشراف':'مشرف'}</button>`:''}</div></td></tr>`).join('')}
  </tbody></table></div>
  <h2 class="sec">الألقاب</h2><div class="card">
  ${titles.map(t=>`<div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="ttl" style="background:${esc(t.color)}">${esc(t.name)}</span><button class="btn sm alt" data-dt="${t.id}">حذف</button></div>`).join('')}
  <form id="tf" class="row" style="margin-top:10px"><input name="name" placeholder="لقب جديد" required style="flex:2"><input type="color" name="color" value="#0f766e" style="flex:0 0 52px;padding:2px"><button class="btn sm">إضافة</button></form></div>`);
  $('#aq').oninput=(e)=>{adm.q=e.target.value;clearTimeout(window._t);window._t=setTimeout(adminView,400)};
  $('#as').onchange=(e)=>{adm.sort=e.target.value;adminView()};
  const upd=async(id,patch)=>{const {error}=await sb.from('profiles').update(patch).eq('id',id);if(error)toast('تعذر التنفيذ');adminView()};
  app.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>upd(b.dataset.v,{verified:b.dataset.val!=='true'}));
  app.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>upd(b.dataset.s,{suspended:b.dataset.val!=='true'}));
  app.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{if(confirm('تغيير صلاحية الإشراف؟'))upd(b.dataset.r,{role:b.dataset.val==='admin'?'member':'admin'})});
  app.querySelectorAll('[data-t]').forEach(s=>s.onchange=()=>{const t=titles.find(x=>x.id==s.value);upd(s.dataset.t,{title:t?t.name:'',title_color:t?t.color:'#0f766e'})});
  app.querySelectorAll('[data-dt]').forEach(b=>b.onclick=async()=>{await sb.from('titles').delete().eq('id',b.dataset.dt);adminView()});
  $('#tf').onsubmit=async(e)=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));await sb.from('titles').insert(f);adminView()};
}
init();
