const CONFIG={
DB_NAME:'VideoLibraryDB',
DB_VERSION:3,
STORE:'library',
DB_KEY:'videoLib_v1',
CAT_KEY:'videoLib_cats_v1',
DEFAULT_CATS:['全部','未分类','教程','电影','音乐','其他'],
ICONS:{
'全部':'📁',
'未分类':'📄',
'教程':'📚',
'电影':'🎬',
'音乐':'🎵',
'其他':'📦'
},
MAX_FILE_SIZE:2*1024*1024*1024,
STORAGE_RESERVE:10*1024*1024
};
const state={
data:{videos:[]},
cats:[...CONFIG.DEFAULT_CATS],
currentCat:'全部',
selectedFiles:[],
importData:null,
objectUrls:new Map(),
currentPlayerId:null,
selectedIds:new Set(),
batchMode:false,
hideUploadedDuplicates:false,
viewMode:'grid',
currentTag:'全部',
selectedTags:new Set()
};
const IDB={
db:null,
open(){
return new Promise((resolve,reject)=>{
if(this.db)return resolve(this.db);
const r=indexedDB.open(CONFIG.DB_NAME,CONFIG.DB_VERSION);
r.onupgradeneeded=e=>{
const db=e.target.result;
if(!db.objectStoreNames.contains(CONFIG.STORE)){
db.createObjectStore(CONFIG.STORE);
}
};
r.onsuccess=e=>{
this.db=e.target.result;
this.db.onversionchange=()=>{
this.db.close();
this.db=null;
};
resolve(this.db);
};
r.onerror=()=>{
reject(r.error||new Error('IndexedDB 打开失败'));
};
});
},
get(key){
return this.open().then(db=>new Promise((res,rej)=>{
const r=db.transaction(CONFIG.STORE,'readonly')
.objectStore(CONFIG.STORE)
.get(key);
r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
}));
},
set(key,value){
return this.open().then(db=>new Promise((res,rej)=>{
const tx=db.transaction(CONFIG.STORE,'readwrite');
tx.objectStore(CONFIG.STORE).put(value,key);
tx.oncomplete=()=>res();
tx.onerror=()=>{
rej(tx.error||new Error('IndexedDB 写入失败'));
};
tx.onabort=()=>{
rej(tx.error||new Error('IndexedDB 写入中止'));
};
}));
}
};
function escapeHtml(s=''){
const d=document.createElement('div');
d.textContent=String(s);
return d.innerHTML;
}
function formatSize(n=0){
if(n<1024)return n+' B';
if(n<1048576)return(n/1024).toFixed(1)+' KB';
if(n<1073741824)return(n/1048576).toFixed(2)+' MB';
return(n/1073741824).toFixed(2)+' GB';
}
function formatDate(ts){
const d=new Date(ts);
return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatFullDate(ts){
return new Date(ts).toLocaleString();
}
function icon(c){
return CONFIG.ICONS[c]||'🏷️';
}
function toast(msg,type='success'){
const t=document.getElementById('toast');
if(!t)return;
t.textContent=msg;
t.className=`toast ${type} show`;
clearTimeout(toast.timer);
toast.timer=setTimeout(()=>{
t.classList.remove('show');
},3000);
}
function openModal(id){
document.getElementById(id)?.classList.add('active');
}
function closeModal(id){
const el=document.getElementById(id);
if(!el)return;
el.classList.remove('active');
if(id==='playerModal'){
const v=document.getElementById('playerVideo');
if(v){
v.pause();
v.removeAttribute('src');
v.load();
}
state.currentPlayerId=null;
}
}
function closeSidebar(){
document.getElementById('sidebar')?.classList.remove('open');
document.getElementById('sidebarOverlay')?.classList.remove('active');
}
function toggleSidebar(){
document.getElementById('sidebar')?.classList.toggle('open');
document.getElementById('sidebarOverlay')?.classList.toggle('active');
}
function asBlob(v){
if(!v)return null;
try{
if(v.blob instanceof Blob)return v.blob;
if(v.blob){
return new Blob([v.blob],{type:v.type||'video/mp4'});
}
if(v.buffer instanceof ArrayBuffer){
return new Blob([v.buffer],{type:v.type||'video/mp4'});
}
if(typeof v.data==='string'&&v.data.startsWith('data:')){
return dataURLToBlob(v.data);
}
}catch(e){
console.error(e);
}
return null;
}
function videoUrl(v){
const b=asBlob(v);
if(!b)return '';
if(!state.objectUrls.has(v.id)){
state.objectUrls.set(v.id,URL.createObjectURL(b));
}
return state.objectUrls.get(v.id);
}
function revoke(id){
const u=state.objectUrls.get(id);
if(u){
URL.revokeObjectURL(u);
state.objectUrls.delete(id);
}
}
function normalizeTags(tags){
if(!Array.isArray(tags))return [];
return [...new Set(
tags
.map(t=>String(t).trim())
.filter(Boolean)
)];
}
function getAllTags(){
const tags=new Set();
state.data.videos.forEach(v=>{
normalizeTags(v.tags).forEach(t=>tags.add(t));
});
return [...tags].sort((a,b)=>a.localeCompare(b,'zh-CN'));
}
function getCategoryTags(category){
const tags=new Set();
state.data.videos.forEach(v=>{
const cat=v.category||'未分类';
if(category==='全部'||cat===category){
normalizeTags(v.tags).forEach(t=>tags.add(t));
}
});
return [...tags].sort((a,b)=>a.localeCompare(b,'zh-CN'));
}
function videoMatchesTag(v){
if(state.currentTag==='全部')return true;
return normalizeTags(v.tags).includes(state.currentTag);
}
function getCurrentVideos(){
let videos=state.currentCat==='全部'
?state.data.videos
:state.data.videos.filter(
v=>(v.category||'未分类')===state.currentCat
);
if(state.currentTag!=='全部'){
videos=videos.filter(videoMatchesTag);
}
return videos;
}
async function loadData(){
try{
const c=localStorage.getItem(CONFIG.CAT_KEY);
state.cats=c
?JSON.parse(c)
:[...CONFIG.DEFAULT_CATS];
if(
!Array.isArray(state.cats)||
!state.cats.includes('全部')||
!state.cats.includes('未分类')
){
state.cats=[...CONFIG.DEFAULT_CATS];
}
}catch{
state.cats=[...CONFIG.DEFAULT_CATS];
}
try{
const d=await IDB.get(CONFIG.DB_KEY);
state.data=
d&&Array.isArray(d.videos)
?d
:{videos:[]};
repairLegacyData();
renderCats();
renderFilterBar();
renderVideos();
updateStorage();
updateBatchBar();
}catch(e){
console.error(e);
state.data={videos:[]};
renderCats();
renderFilterBar();
renderVideos();
toast('视频库加载失败：'+e.message,'error');
}
}
function saveCats(){
try{
localStorage.setItem(
CONFIG.CAT_KEY,
JSON.stringify(state.cats)
);
return true;
}catch{
toast('分类保存失败','error');
return false;
}
}
async function saveVideos(){
try{
await IDB.set(CONFIG.DB_KEY,state.data);
await updateStorage();
return true;
}catch(e){
toast('视频保存失败：'+e.message,'error');
return false;
}
}
async function updateStorage(){
let used=0;
for(const v of state.data.videos){
const b=asBlob(v);
used+=b?b.size:Number(v.size)||0;
}
const text=document.getElementById('storageText');
if(text){
text.textContent=
`视频占用 ${formatSize(used)} · ${state.data.videos.length} 个`;
}
try{
const q=await navigator.storage?.estimate?.();
const quota=q?.quota||0;
const fill=document.getElementById('storageFill');
if(fill){
const den=
quota||
Math.max(50*1048576,used*2);
fill.style.width=
Math.min(100,used/den*100)+'%';
fill.classList.toggle(
'warning',
!!quota&&used/quota>.7
);
fill.classList.toggle(
'danger',
!!quota&&used/quota>.9
);
}
}catch{}
}
function renderCats(){
const list=document.getElementById('catList');
if(!list)return;
list.innerHTML='';
state.cats.forEach(c=>{
const count=
c==='全部'
?state.data.videos.length
:state.data.videos.filter(
v=>(v.category||'未分类')===c
).length;
const d=document.createElement('div');
d.className=
'cat-item'+
(c===state.currentCat?' active':'');
d.innerHTML=`
<span class="cat-icon">${icon(c)}</span>
<span class="cat-name">${escapeHtml(c)}</span>
<span class="cat-count">${count}</span>
${
c!=='全部'&&c!=='未分类'
?'<button class="cat-del-btn" title="删除分类">−</button>'
:''
}
`;
d.addEventListener('click',e=>{
if(!e.target.closest('.cat-del-btn')){
switchCat(c);
}
});
d.querySelector('.cat-del-btn')
?.addEventListener('click',e=>{
e.stopPropagation();
deleteCat(c);
});
list.appendChild(d);
});
}
function switchCat(c){
state.currentCat=c;
state.currentTag='全部';
state.selectedTags.clear();
state.selectedIds.clear();
const title=document.getElementById('pageTitle');
if(title){
title.textContent=
c==='全部'?'全部视频':c;
}
renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();
closeSidebar();
}
function injectBaseStyle(){
if(document.getElementById('videoLibraryDynamicStyle'))return;
const style=document.createElement('style');
style.id='videoLibraryDynamicStyle';
style.textContent=`
.video-library-tools{
display:flex;
align-items:center;
gap:8px;
flex-wrap:wrap;
margin-bottom:16px;
}
.video-view-switch{
display:flex;
gap:4px;
padding:4px;
background:rgba(255,255,255,.05);
border:1px solid rgba(255,255,255,.08);
border-radius:10px;
}
.video-view-btn{
border:0;
background:transparent;
color:#aaa;
padding:7px 10px;
border-radius:7px;
cursor:pointer;
font-size:12px;
}
.video-view-btn.active{
background:rgba(255,255,255,.12);
color:#fff;
}
.video-tag-filter{
display:flex;
gap:6px;
align-items:center;
flex-wrap:wrap;
}
.video-tag-chip{
border:1px solid rgba(255,255,255,.12);
background:rgba(255,255,255,.04);
color:#aaa;
padding:6px 10px;
border-radius:999px;
font-size:12px;
cursor:pointer;
}
.video-tag-chip.active{
background:rgba(255,255,255,.14);
color:#fff;
border-color:rgba(255,255,255,.28);
}
.video-tags{
display:flex;
flex-wrap:wrap;
gap:5px;
margin-top:7px;
}
.video-tag{
display:inline-flex;
align-items:center;
padding:3px 7px;
border-radius:999px;
background:rgba(255,255,255,.07);
color:#aaa;
font-size:10px;
}
.video-tag::before{
content:'#';
opacity:.65;
margin-right:2px;
}
.video-timeline{
display:flex;
flex-direction:column;
gap:0;
}
.timeline-item{
display:grid;
grid-template-columns:100px 24px minmax(0,1fr);
gap:12px;
min-height:120px;
}
.timeline-date{
text-align:right;
padding-top:10px;
font-size:12px;
color:#888;
}
.timeline-line{
position:relative;
display:flex;
justify-content:center;
}
.timeline-line::before{
content:'';
position:absolute;
top:0;
bottom:-20px;
width:1px;
background:rgba(255,255,255,.12);
}
.timeline-dot{
position:relative;
z-index:2;
margin-top:13px;
width:9px;
height:9px;
border-radius:50%;
background:#aaa;
box-shadow:0 0 0 4px rgba(255,255,255,.05);
}
.timeline-card{
display:grid;
grid-template-columns:150px minmax(0,1fr);
gap:14px;
padding:10px 0 25px;
min-width:0;
}
.timeline-thumb{
width:150px;
height:90px;
border-radius:9px;
overflow:hidden;
background:#151515;
position:relative;
cursor:pointer;
}
.timeline-thumb img,
.timeline-thumb video{
width:100%;
height:100%;
object-fit:cover;
}
.timeline-content{
min-width:0;
}
.timeline-title{
font-size:14px;
font-weight:600;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
cursor:pointer;
}
.timeline-meta{
font-size:11px;
color:#777;
margin-top:6px;
}
.tag-view{
display:flex;
flex-direction:column;
gap:18px;
}
.tag-group{
border:1px solid rgba(255,255,255,.08);
border-radius:12px;
padding:14px;
background:rgba(255,255,255,.02);
}
.tag-group-title{
display:flex;
align-items:center;
gap:7px;
margin-bottom:12px;
font-size:14px;
font-weight:600;
}
.tag-group-count{
font-size:11px;
color:#777;
font-weight:400;
}
.tag-group-videos{
display:grid;
grid-template-columns:repeat(auto-fill,minmax(170px,1fr));
gap:12px;
}
.untagged-label{
color:#888;
}
.tag-editor{
display:flex;
flex-wrap:wrap;
gap:7px;
margin-top:8px;
}
.tag-editor input{
min-width:150px;
flex:1;
background:#151515;
border:1px solid #333;
border-radius:7px;
padding:7px 9px;
color:#fff;
outline:none;
}
.tag-editor button{
border:1px solid #333;
background:#202020;
color:#ddd;
border-radius:7px;
padding:7px 10px;
cursor:pointer;
}
.upload-tags{
margin-top:10px;
}
.upload-tags-label{
display:block;
font-size:12px;
color:#aaa;
margin-bottom:7px;
}
.upload-tag-input-row{
display:flex;
gap:7px;
}
.upload-tag-input-row input{
flex:1;
min-width:0;
}
.upload-tag-list{
display:flex;
flex-wrap:wrap;
gap:5px;
margin-top:7px;
}
.upload-tag-remove{
border:0;
background:rgba(255,255,255,.07);
color:#bbb;
padding:4px 8px;
border-radius:999px;
cursor:pointer;
font-size:11px;
}
@media(max-width:600px){
.timeline-item{
grid-template-columns:62px 18px minmax(0,1fr);
gap:7px;
}
.timeline-date{
font-size:10px;
}
.timeline-card{
grid-template-columns:95px minmax(0,1fr);
gap:9px;
}
.timeline-thumb{
width:95px;
height:70px;
}
.tag-group-videos{
grid-template-columns:repeat(2,minmax(0,1fr));
gap:8px;
}
.video-library-tools{
gap:6px;
}
.video-view-btn{
padding:6px 8px;
font-size:11px;
}
}
`;
document.head.appendChild(style);
}
function renderFilterBar(){
injectBaseStyle();
let bar=document.getElementById('videoLibraryTools');
if(!bar){
const content=document.getElementById('content');
if(!content)return;
bar=document.createElement('div');
bar.id='videoLibraryTools';
bar.className='video-library-tools';
content.parentNode.insertBefore(bar,content);
}
bar.innerHTML='';
const viewSwitch=document.createElement('div');
viewSwitch.className='video-view-switch';
const modes=[
['grid','▦ 网格'],
['timeline','◷ 时间轴'],
['tags','🏷 标签']
];
modes.forEach(([mode,label])=>{
const btn=document.createElement('button');
btn.className=
'video-view-btn'+
(state.viewMode===mode?' active':'');
btn.textContent=label;
btn.addEventListener('click',()=>{
state.viewMode=mode;
renderFilterBar();
renderVideos();
});
viewSwitch.appendChild(btn);
});
bar.appendChild(viewSwitch);
const tags=getCategoryTags(state.currentCat);
if(tags.length){
const tagFilter=document.createElement('div');
tagFilter.className='video-tag-filter';
const label=document.createElement('span');
label.style.cssText='font-size:11px;color:#777';
label.textContent='标签';
tagFilter.appendChild(label);
const all=document.createElement('button');
all.className=
'video-tag-chip'+
(state.currentTag==='全部'?' active':'');
all.textContent='全部';
all.addEventListener('click',()=>{
state.currentTag='全部';
renderFilterBar();
renderVideos();
});
tagFilter.appendChild(all);
tags.forEach(tag=>{
const btn=document.createElement('button');
btn.className=
'video-tag-chip'+
(state.currentTag===tag?' active':'');
btn.textContent='#'+tag;
btn.addEventListener('click',()=>{
state.currentTag=tag;
renderFilterBar();
renderVideos();
});
tagFilter.appendChild(btn);
});
bar.appendChild(tagFilter);
}
}
function renderVideos(){
const box=document.getElementById('content');
if(!box)return;
const vs=getCurrentVideos();
box.innerHTML='';
if(!vs.length){
box.innerHTML=`
<div class="empty-state">
<div class="empty-icon">🎬</div>
<h3>暂无视频</h3>
<p>${
state.currentTag!=='全部'
?'当前标签下没有视频'
:'点击右上角「上传视频」添加视频'
}</p>
</div>
`;
updateBatchBar();
return;
}
if(state.viewMode==='timeline'){
renderTimeline(vs,box);
}else if(state.viewMode==='tags'){
renderTagView(vs,box);
}else{
renderGrid(vs,box);
}
updateBatchBar();
}
function renderGrid(vs,box){
const grid=document.createElement('div');
grid.className='video-grid';
vs.slice().reverse().forEach(v=>{
const card=document.createElement('div');
card.className='video-card';
const src=videoUrl(v);
const thumb=v.thumbnail||'';
const checked=state.selectedIds.has(v.id);
card.innerHTML=`
<div class="video-thumb">
${
thumb
?`<img src="${escapeHtml(thumb)}" alt="视频缩略图">`
:
(
src
?'<video muted playsinline preload="metadata"></video>'
:'<div class="thumb-placeholder">🎬</div>'
)
}
<div class="play-icon">▶</div>
<button class="delete-btn" title="删除视频">×</button>
<label class="video-select" title="选择视频"
style="
position:absolute;
top:8px;
left:8px;
z-index:4;
width:30px;
height:30px;
border-radius:8px;
background:rgba(0,0,0,.65);
display:flex;
align-items:center;
justify-content:center;
cursor:pointer;
">
<input type="checkbox"
${checked?'checked':''}
style="width:18px;height:18px;cursor:pointer">
</label>
</div>
<div class="video-info">
<div class="v-title" title="${escapeHtml(v.name)}">
${escapeHtml(v.name)}
</div>
<div class="v-meta">
<span>${formatSize(v.size)}</span>
<span>${formatDate(v.createdAt)}</span>
</div>
<span class="v-cat">
${escapeHtml(v.category||'未分类')}
</span>
<div class="video-tags">
${normalizeTags(v.tags).map(t=>
`<span class="video-tag">${escapeHtml(t)}</span>`
).join('')}
</div>
</div>
`;
const vid=card.querySelector('.video-thumb video');
if(vid&&src){
vid.src=src;
vid.addEventListener('loadedmetadata',()=>{
try{
vid.currentTime=Math.min(.1,vid.duration||0);
}catch{}
});
}
const checkbox=card.querySelector('.video-select input');
checkbox.addEventListener('click',e=>e.stopPropagation());
checkbox.addEventListener('change',e=>{
e.stopPropagation();
if(e.target.checked){
state.selectedIds.add(v.id);
}else{
state.selectedIds.delete(v.id);
}
updateBatchBar();
renderVideos();
});
card.addEventListener('click',e=>{
if(
e.target.closest('.delete-btn')||
e.target.closest('.video-select')
){
return;
}
playVideo(v);
});
card.querySelector('.delete-btn').addEventListener('click',e=>{
e.stopPropagation();
deleteVideo(v.id);
});
grid.appendChild(card);
});
box.appendChild(grid);
}
function renderTimeline(vs,box){
const timeline=document.createElement('div');
timeline.className='video-timeline';
const sorted=vs.slice().sort(
(a,b)=>(b.createdAt||0)-(a.createdAt||0)
);
let lastDate='';
sorted.forEach(v=>{
const date=new Date(v.createdAt);
const dateKey=
`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
const item=document.createElement('div');
item.className='timeline-item';
const dateLabel=
dateKey===lastDate
?''
:`${date.getMonth()+1}月${date.getDate()}日`;
lastDate=dateKey;
const src=videoUrl(v);
const thumb=v.thumbnail||'';
item.innerHTML=`
<div class="timeline-date">${dateLabel}</div>
<div class="timeline-line">
<div class="timeline-dot"></div>
</div>
<div class="timeline-card">
<div class="timeline-thumb">
${
thumb
?`<img src="${escapeHtml(thumb)}" alt="">`
:
src
?'<video muted playsinline preload="metadata"></video>'
:'<div class="thumb-placeholder">🎬</div>'
}
</div>
<div class="timeline-content">
<div class="timeline-title">
${escapeHtml(v.name)}
</div>
<div class="timeline-meta">
${escapeHtml(v.category||'未分类')}
 · ${formatSize(v.size)}
 · ${formatFullDate(v.createdAt)}
</div>
<div class="video-tags">
${normalizeTags(v.tags).map(t=>
`<span class="video-tag">${escapeHtml(t)}</span>`
).join('')}
</div>
</div>
</div>
`;
const vid=item.querySelector('.timeline-thumb video');
if(vid&&src){
vid.src=src;
vid.addEventListener('loadedmetadata',()=>{
try{
vid.currentTime=Math.min(.1,vid.duration||0);
}catch{}
});
}
item.querySelector('.timeline-thumb').addEventListener(
'click',
()=>playVideo(v)
);
item.querySelector('.timeline-title').addEventListener(
'click',
()=>playVideo(v)
);
timeline.appendChild(item);
});
box.appendChild(timeline);
}
function renderTagView(vs,box){
const wrapper=document.createElement('div');
wrapper.className='tag-view';
const groups=new Map();
vs.forEach(v=>{
const tags=normalizeTags(v.tags);
if(!tags.length){
if(!groups.has('__untagged__')){
groups.set('__untagged__',[]);
}
groups.get('__untagged__').push(v);
}else{
tags.forEach(tag=>{
if(!groups.has(tag)){
groups.set(tag,[]);
}
groups.get(tag).push(v);
});
}
});
const ordered=[...groups.keys()].sort((a,b)=>{
if(a==='__untagged__')return 1;
if(b==='__untagged__')return -1;
return a.localeCompare(b,'zh-CN');
});
ordered.forEach(tag=>{
const group=document.createElement('div');
group.className='tag-group';
const title=
tag==='__untagged__'
?'未添加标签'
:'#'+tag;
group.innerHTML=`
<div class="tag-group-title">
<span>${escapeHtml(title)}</span>
<span class="tag-group-count">
${groups.get(tag).length} 个
</span>
</div>
`;
const videos=document.createElement('div');
videos.className='tag-group-videos';
groups.get(tag).forEach(v=>{
videos.appendChild(createMiniCard(v));
});
group.appendChild(videos);
wrapper.appendChild(group);
});
box.appendChild(wrapper);
}
function createMiniCard(v){
const card=document.createElement('div');
card.className='video-card';
const src=videoUrl(v);
const thumb=v.thumbnail||'';
card.innerHTML=`
<div class="video-thumb">
${
thumb
?`<img src="${escapeHtml(thumb)}" alt="">`
:
src
?'<video muted playsinline preload="metadata"></video>'
:'<div class="thumb-placeholder">🎬</div>'
}
<div class="play-icon">▶</div>
</div>
<div class="video-info">
<div class="v-title" title="${escapeHtml(v.name)}">
${escapeHtml(v.name)}
</div>
<div class="v-meta">
<span>${formatSize(v.size)}</span>
<span>${formatDate(v.createdAt)}</span>
</div>
</div>
`;
const vid=card.querySelector('video');
if(vid&&src){
vid.src=src;
vid.addEventListener('loadedmetadata',()=>{
try{
vid.currentTime=Math.min(.1,vid.duration||0);
}catch{}
});
}
card.addEventListener('click',()=>playVideo(v));
return card;
}
function playVideo(v){
const src=videoUrl(v);
if(!src){
return toast('视频文件数据不存在','error');
}
const video=document.getElementById('playerVideo');
state.currentPlayerId=v.id;
video.onerror=()=>{
toast(
'这个 MP4 无法由当前浏览器解码。文件本身未被修改。',
'error'
);
};
video.src=src;
video.load();
document.getElementById('playerTitle').textContent=v.name;
document.getElementById('playerMeta').textContent=
`${v.category||'未分类'} · ${formatSize(v.size)} · ${new Date(v.createdAt).toLocaleString()}`;
openModal('playerModal');
video.play().catch(()=>{});
}
function downloadVideo(v){
const b=asBlob(v);
if(!b){
return toast('找不到原视频文件','error');
}
const u=URL.createObjectURL(b);
const a=document.createElement('a');
a.href=u;
a.download=v.name||'video.mp4';
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(()=>{
URL.revokeObjectURL(u);
},1500);
}
async function downloadSelectedVideos(){
const ids=[...state.selectedIds];
if(!ids.length){
return toast('请先选择视频','error');
}
const videos=state.data.videos.filter(
v=>ids.includes(v.id)
);
if(videos.length===1){
downloadVideo(videos[0]);
return;
}
let success=0;
for(const v of videos){
const b=asBlob(v);
if(!b)continue;
const u=URL.createObjectURL(b);
const a=document.createElement('a');
a.href=u;
a.download=v.name||'video.mp4';
document.body.appendChild(a);
a.click();
a.remove();
success++;
await new Promise(resolve=>setTimeout(resolve,180));
setTimeout(()=>{
URL.revokeObjectURL(u);
},1500);
}
toast(`已开始下载 ${success} 个视频`);
state.selectedIds.clear();
renderVideos();
updateBatchBar();
}
async function deleteVideo(id){
if(!confirm('确定删除这个视频？'))return;
const old=state.data.videos;
state.data.videos=old.filter(v=>v.id!==id);
if(await saveVideos()){
revoke(id);
state.selectedIds.delete(id);
renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();
toast('视频已删除');
}else{
state.data.videos=old;
}
}
async function deleteSelectedVideos(){
const ids=[...state.selectedIds];
if(!ids.length){
return toast('请先选择视频','error');
}
const count=ids.length;
if(!confirm(`确定删除选中的 ${count} 个视频？`)){
return;
}
const oldVideos=state.data.videos;
state.data.videos=oldVideos.filter(
v=>!state.selectedIds.has(v.id)
);
if(await saveVideos()){
ids.forEach(id=>revoke(id));
state.selectedIds.clear();
renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();
toast(`已删除 ${count} 个视频`);
}else{
state.data.videos=oldVideos;
}
}
function selectAllCurrent(){
const videos=getCurrentVideos();
if(!videos.length)return;
const allSelected=videos.every(
v=>state.selectedIds.has(v.id)
);
if(allSelected){
videos.forEach(
v=>state.selectedIds.delete(v.id)
);
}else{
videos.forEach(
v=>state.selectedIds.add(v.id)
);
}
renderVideos();
updateBatchBar();
}
function clearSelection(){
state.selectedIds.clear();
renderVideos();
updateBatchBar();
}
function updateBatchBar(){
let bar=document.getElementById('batchActionBar');
const selectedCount=state.selectedIds.size;
const currentVideos=getCurrentVideos();
if(!bar){
bar=document.createElement('div');
bar.id='batchActionBar';
bar.style.cssText=`
position:fixed;
left:50%;
bottom:22px;
transform:translateX(-50%);
z-index:90;
display:none;
align-items:center;
gap:8px;
padding:10px 12px;
background:#242424;
border:1px solid #444;
border-radius:12px;
box-shadow:0 8px 30px rgba(0,0,0,.45);
max-width:calc(100vw - 24px);
`;
bar.innerHTML=`
<span id="batchCount"
style="
font-size:13px;
color:#e0e0e0;
white-space:nowrap;
margin-right:4px;
"></span>
<button id="batchSelectAll"
class="btn btn-secondary"
style="padding:7px 10px;font-size:12px">
全选
</button>
<button id="batchDownload"
class="btn btn-primary"
style="padding:7px 10px;font-size:12px">
⬇ 下载
</button>
<button id="batchDelete"
class="btn btn-secondary"
style="
padding:7px 10px;
font-size:12px;
color:#ff6b6b;
">
删除
</button>
<button id="batchClear"
class="btn btn-secondary"
style="padding:7px 10px;font-size:12px">
取消
</button>
`;
document.body.appendChild(bar);
document.getElementById('batchSelectAll')
.addEventListener('click',selectAllCurrent);
document.getElementById('batchDownload')
.addEventListener('click',downloadSelectedVideos);
document.getElementById('batchDelete')
.addEventListener('click',deleteSelectedVideos);
document.getElementById('batchClear')
.addEventListener('click',clearSelection);
}
if(!selectedCount){
bar.style.display='none';
return;
}
bar.style.display='flex';
document.getElementById('batchCount').textContent=
`已选 ${selectedCount} 个`;
const allSelected=
currentVideos.length>0&&
currentVideos.every(
v=>state.selectedIds.has(v.id)
);
document.getElementById('batchSelectAll').textContent=
allSelected?'取消全选':'全选';
}
function isDuplicateVideo(file){
if(!file)return false;
return state.data.videos.some(v=>{
const sameName=
String(v.name||'').trim().toLowerCase()===
String(file.name||'').trim().toLowerCase();
const sameSize=
Number(v.size||0)===Number(file.size||0);
return sameName&&sameSize;
});
}
function getSkipDuplicateSetting(){
const checkbox=document.getElementById(
'skipUploadedVideos'
);
return checkbox?checkbox.checked:true;
}
function injectDuplicateOption(){
if(document.getElementById('skipUploadedVideos'))return;
const fileDrop=document.getElementById('fileDrop');
if(!fileDrop)return;
const wrap=document.createElement('label');
wrap.id='duplicateOption';
wrap.style.cssText=`
display:flex;
align-items:center;
gap:8px;
margin-top:12px;
padding:10px 12px;
border-radius:10px;
background:rgba(255,255,255,.04);
border:1px solid rgba(255,255,255,.08);
cursor:pointer;
font-size:13px;
line-height:1.4;
color:#d8d8d8;
`;
wrap.innerHTML=`
<input
id="skipUploadedVideos"
type="checkbox"
checked
style="
width:17px;
height:17px;
margin:0;
cursor:pointer;
flex:none;
"
>
<span>
已上传的视频不显示
<small
style="
display:block;
margin-top:2px;
font-size:11px;
opacity:.6;
">
按「文件名 + 文件大小」判断重复视频
</small>
</span>
`;
fileDrop.insertAdjacentElement('afterend',wrap);
const checkbox=document.getElementById('skipUploadedVideos');
checkbox?.addEventListener('change',()=>{
if(state.selectedFiles.length){
refreshSelectedFilesDisplay();
}
});
}
function refreshSelectedFilesDisplay(){
const files=[...state.selectedFiles];
const nameEl=document.getElementById('fileName');
const btn=document.getElementById('uploadConfirmBtn');
if(!nameEl||!btn)return;
if(!files.length){
nameEl.textContent='';
btn.disabled=true;
btn.textContent='上传';
return;
}
const totalSize=files.reduce(
(sum,f)=>sum+f.size,0
);
if(files.length===1){
nameEl.textContent=
`${files[0].name} · ${formatSize(files[0].size)}`;
}else{
nameEl.textContent=
`已选择 ${files.length} 个视频 · 总计 ${formatSize(totalSize)}`;
}
btn.disabled=false;
btn.textContent=
files.length>1
?`上传 ${files.length} 个视频`
:'上传';
}
function createUploadTagEditor(){
if(document.getElementById('uploadTags'))return;
const select=document.getElementById('uploadCat');
if(!select)return;
const group=document.createElement('div');
group.className='upload-tags';
group.id='uploadTags';
group.innerHTML=`
<label class="upload-tags-label">添加标签</label>
<div class="upload-tag-input-row">
<input
type="text"
id="uploadTagInput"
maxlength="20"
placeholder="例如：重点、灵感、待整理"
>
<button
type="button"
id="uploadTagAddBtn">
添加
</button>
</div>
<div
class="upload-tag-list"
id="uploadTagList">
</div>
`;
select.closest('.form-group')?.insertAdjacentElement(
'afterend',
group
);
document.getElementById('uploadTagAddBtn')
?.addEventListener('click',addUploadTag);
document.getElementById('uploadTagInput')
?.addEventListener('keydown',e=>{
if(e.key==='Enter'){
e.preventDefault();
addUploadTag();
}
});
}
function addUploadTag(){
const input=document.getElementById('uploadTagInput');
if(!input)return;
const tag=input.value.trim();
if(!tag)return;
if(!state.uploadTags)state.uploadTags=[];
if(state.uploadTags.includes(tag)){
input.value='';
return;
}
state.uploadTags.push(tag);
input.value='';
renderUploadTags();
}
function renderUploadTags(){
const box=document.getElementById('uploadTagList');
if(!box)return;
box.innerHTML='';
(state.uploadTags||[]).forEach(tag=>{
const btn=document.createElement('button');
btn.type='button';
btn.className='upload-tag-remove';
btn.textContent=`#${tag} ×`;
btn.addEventListener('click',()=>{
state.uploadTags=
state.uploadTags.filter(t=>t!==tag);
renderUploadTags();
});
box.appendChild(btn);
});
}
function openUpload(){
const s=document.getElementById('uploadCat');
if(s){
s.innerHTML=
state.cats
.filter(c=>c!=='全部')
.map(c=>`
<option value="${escapeHtml(c)}">
${escapeHtml(c)}
</option>
`)
.join('');
}
state.selectedFiles=[];
state.uploadTags=[];
const fileInput=document.getElementById('fileInput');
if(fileInput){
fileInput.multiple=true;
fileInput.setAttribute(
'accept',
'video/mp4,video/*'
);
}
const nameEl=document.getElementById('fileName');
if(nameEl)nameEl.textContent='';
const btn=document.getElementById('uploadConfirmBtn');
if(btn){
btn.disabled=true;
btn.textContent='上传';
}
injectDuplicateOption();
createUploadTagEditor();
renderUploadTags();
const duplicateCheckbox=
document.getElementById('skipUploadedVideos');
if(duplicateCheckbox){
duplicateCheckbox.checked=true;
}
openModal('uploadModal');
}
function handleFiles(fileList){
if(!fileList||!fileList.length)return;
const files=[...fileList];
const valid=[];
let duplicateCount=0;
const skipDuplicate=getSkipDuplicateSetting();
for(const file of files){
if(
!file.type.startsWith('video/')&&
!/\.mp4$/i.test(file.name)
){
toast(`${file.name} 不是有效的视频文件`,'error');
continue;
}
if(file.size>CONFIG.MAX_FILE_SIZE){
toast(`${file.name} 超过 2GB，暂不建议导入`,'error');
continue;
}
if(skipDuplicate&&isDuplicateVideo(file)){
duplicateCount++;
continue;
}
valid.push(file);
}
if(duplicateCount>0){
if(valid.length){
toast(`已过滤 ${duplicateCount} 个已上传视频`,'error');
}else{
toast(
`选择的视频都已上传，共过滤 ${duplicateCount} 个`,
'error'
);
}
}
if(!valid.length){
state.selectedFiles=[];
const nameEl=document.getElementById('fileName');
const btn=document.getElementById('uploadConfirmBtn');
if(nameEl){
nameEl.textContent=
duplicateCount
?`已过滤 ${duplicateCount} 个重复视频`
:'';
}
if(btn){
btn.disabled=true;
btn.textContent='上传';
}
return;
}
state.selectedFiles=valid;
refreshSelectedFilesDisplay();
}
function handleFile(file){
if(!file)return;
handleFiles([file]);
}
async function checkSpace(n){
try{
const e=await navigator.storage?.estimate?.();
if(e?.quota){
const available=e.quota-(e.usage||0);
if(n+CONFIG.STORAGE_RESERVE>available){
toast(
`可用空间不足：约剩 ${formatSize(Math.max(0,available))}`,
'error'
);
return false;
}
}
}catch{}
return true;
}
function createThumbnail(file){
return new Promise(resolve=>{
const u=URL.createObjectURL(file);
const v=document.createElement('video');
v.muted=true;
v.playsInline=true;
v.preload='metadata';
let done=false;
const finish=x=>{
if(done)return;
done=true;
URL.revokeObjectURL(u);
resolve(x||'');
};
v.onloadeddata=()=>{
try{
v.currentTime=
Math.min(
.15,
Math.max(0,(v.duration||.15)/10)
);
}catch{}
};
v.onseeked=()=>{
try{
const c=document.createElement('canvas');
const w=Math.min(640,v.videoWidth||640);
const h=Math.max(
1,
Math.round(
w*(v.videoHeight||360)/
(v.videoWidth||640)
)
);
c.width=w;
c.height=h;
const ctx=c.getContext('2d');
ctx.drawImage(v,0,0,w,h);
finish(c.toDataURL('image/jpeg',.72));
}catch{
finish('');
}
};
v.onerror=()=>finish('');
v.src=u;
setTimeout(()=>finish(''),5000);
});
}
async function doUpload(){
const files=[...state.selectedFiles];
if(!files.length)return;
const btn=document.getElementById('uploadConfirmBtn');
btn.disabled=true;
try{
const skipDuplicate=getSkipDuplicateSetting();
const uploadFiles=[];
let duplicateCount=0;
for(const file of files){
if(skipDuplicate&&isDuplicateVideo(file)){
duplicateCount++;
continue;
}
uploadFiles.push(file);
}
if(!uploadFiles.length){
state.selectedFiles=[];
btn.textContent='上传';
btn.disabled=true;
toast(
duplicateCount
?`没有需要上传的视频，已跳过 ${duplicateCount} 个重复视频`
:'没有需要上传的视频',
'error'
);
return;
}
const totalSize=uploadFiles.reduce(
(sum,f)=>sum+f.size,0
);
btn.textContent='检查空间…';
if(!(await checkSpace(totalSize))){
btn.disabled=false;
return;
}
const selectedCategory=
document.getElementById('uploadCat')?.value||'未分类';
const uploadTags=normalizeTags(state.uploadTags||[]);
const newVideos=[];
for(
let i=0;
i<uploadFiles.length;
i++
){
const file=uploadFiles[i];
btn.textContent=
uploadFiles.length>1
?`生成缩略图 ${i+1}/${uploadFiles.length}…`
:'生成缩略图…';
const thumbnail=await createThumbnail(file);
btn.textContent=
uploadFiles.length>1
?`保存 ${i+1}/${uploadFiles.length}…`
:'保存原文件…';
const blob=file.slice(
0,
file.size,
file.type||'video/mp4'
);
const v={
id:
Date.now().toString(36)+
Math.random().toString(36).slice(2,10),
name:file.name,
category:selectedCategory,
tags:[...uploadTags],
blob,
size:file.size,
type:file.type||'video/mp4',
createdAt:Date.now()+i,
thumbnail
};
newVideos.push(v);
}
const data={
videos:[
...state.data.videos,
...newVideos
]
};
await IDB.set(CONFIG.DB_KEY,data);
state.data=data;
state.selectedFiles=[];
state.uploadTags=[];
renderCats();
renderFilterBar();
renderVideos();
updateStorage();
updateBatchBar();
closeModal('uploadModal');
if(duplicateCount){
toast(
`成功上传 ${newVideos.length} 个视频，已跳过 ${duplicateCount} 个重复视频`
);
}else{
toast(
uploadFiles.length>1
?`成功上传 ${uploadFiles.length} 个视频，原 MP4 已保存`
:'上传成功，原 MP4 已保存'
);
}
}catch(e){
console.error(e);
toast(
'保存失败：'+
(
e.name==='QuotaExceededError'
?'浏览器存储空间不足'
:e.message
),
'error'
);
}finally{
btn.textContent='上传';
btn.disabled=state.selectedFiles.length===0;
}
}
function dataURLToBlob(s){
const [head,body]=s.split(',',2);
if(!body){
throw new Error('备份数据损坏');
}
const mime=
(head.match(/data:([^;]+)/)||[])[1]||
'application/octet-stream';
const bin=atob(body);
const a=new Uint8Array(bin.length);
for(
let i=0;
i<bin.length;
i++
){
a[i]=bin.charCodeAt(i);
}
return new Blob([a],{type:mime});
}
function blobToDataURL(b){
return new Promise((res,rej)=>{
const r=new FileReader();
r.onload=()=>res(r.result);
r.onerror=()=>rej(r.error);
r.readAsDataURL(b);
});
}
async function exportBackup(){
if(!state.data.videos.length){
return toast('暂无视频可备份','error');
}
const btn=document.getElementById('exportBtn');
btn.disabled=true;
btn.textContent='⏳ 生成中…';
try{
const videos=[];
for(const v of state.data.videos){
const b=asBlob(v);
if(!b)continue;
videos.push({
id:v.id,
name:v.name,
category:v.category,
tags:normalizeTags(v.tags),
data:await blobToDataURL(b),
size:b.size,
type:v.type||b.type,
createdAt:v.createdAt,
thumbnail:v.thumbnail||''
});
}
const payload={
version:4,
exportedAt:Date.now(),
categories:state.cats,
videos
};
const blob=new Blob(
[JSON.stringify(payload)
],
{type:'application/json'}
);
const u=URL.createObjectURL(blob);
const a=document.createElement('a');
a.href=u;
a.download=
`video-backup-${new Date().toISOString().slice(0,10)}.json`;
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(()=>{
URL.revokeObjectURL(u);
},1000);
toast('备份已导出');
}catch(e){
toast('导出失败：'+e.message,'error');
}finally{
btn.disabled=false;
btn.textContent='📥 导出备份';
}
}
function openImport(){
state.importData=null;
document.getElementById('importFileName').textContent='';
document.getElementById('importConfirmBtn').disabled=true;
openModal('importModal');
}
function handleImport(file){
if(!file)return;
if(!/\.json$/i.test(file.name)){
return toast('请选择 JSON 备份文件','error');
}
const r=new FileReader();
r.onload=()=>{
try{
const o=JSON.parse(r.result);
if(
!Array.isArray(o.videos)||
!Array.isArray(o.categories)
){
throw new Error('备份格式不正确');
}
state.importData=o;
document.getElementById('importFileName').textContent=
`${file.name} · ${o.videos.length} 个视频`;
document.getElementById('importConfirmBtn').disabled=false;
}catch(e){
toast('无效的备份文件：'+e.message,'error');
}
};
r.onerror=()=>{
toast('文件读取失败','error');
};
r.readAsText(file);
}
async function doImport(){
const o=state.importData;
if(!o)return;
if(!confirm(
`确定恢复备份？这将覆盖当前所有数据（${o.videos.length} 个视频）。`
)){
return;
}
const btn=document.getElementById('importConfirmBtn');
btn.disabled=true;
btn.textContent='恢复中…';
try{
const videos=[];
for(
let i=0;
i<o.videos.length;
i++
){
const v=o.videos[i];
btn.textContent=
o.videos.length>1
?`恢复 ${i+1}/${o.videos.length}…`
:'恢复中…';
const b=dataURLToBlob(v.data);
videos.push({
id:v.id,
name:v.name,
category:
o.categories.includes(v.category)
?v.category
:'未分类',
tags:normalizeTags(v.tags),
blob:b,
size:b.size,
type:v.type||b.type||'video/mp4',
createdAt:Number(v.createdAt)||Date.now(),
thumbnail:v.thumbnail||''
});
}
const cats=[
...new Set(
o.categories.filter(
c=>typeof c==='string'&&c.trim()
)
)
];
if(!cats.includes('全部')){
cats.unshift('全部');
}
if(!cats.includes('未分类')){
cats.splice(1,0,'未分类');
}
await IDB.set(CONFIG.DB_KEY,{videos});
state.objectUrls.forEach(
u=>URL.revokeObjectURL(u)
);
state.objectUrls.clear();
state.data={videos};
state.cats=cats;
saveCats();
state.currentCat='全部';
state.currentTag='全部';
state.selectedIds.clear();
document.getElementById('pageTitle').textContent='全部视频';
renderCats();
renderFilterBar();
renderVideos();
updateStorage();
updateBatchBar();
closeModal('importModal');
toast('备份恢复成功');
}catch(e){
toast('恢复失败：'+e.message,'error');
}finally{
btn.textContent='恢复';
btn.disabled=!state.importData;
}
}
function openAddCat(){
document.getElementById('newCatName').value='';
openModal('catModal');
setTimeout(()=>{
document.getElementById('newCatName')?.focus();
},100);
}
function addCat(){
const i=document.getElementById('newCatName');
const n=i.value.trim();
if(!n){
return toast('请输入分类名称','error');
}
if(state.cats.includes(n)){
return toast('分类已存在','error');
}
state.cats.push(n);
if(saveCats()){
renderCats();
closeModal('catModal');
toast('分类添加成功');
}
}
async function deleteCat(c){
if(c==='全部'||c==='未分类'){
return;
}
const count=state.data.videos.filter(
v=>v.category===c
).length;
if(!confirm(
count
?`确定删除分类「${c}」？${count} 个视频将移至「未分类」。`
:`确定删除空分类「${c}」？`
)){
return;
}
const cats=[...state.cats];
const videos=state.data.videos.map(v=>({...v}));
state.cats=state.cats.filter(x=>x!==c);
state.data.videos.forEach(v=>{
if(v.category===c){
v.category='未分类';
}
});
if(state.currentCat===c){
state.currentCat='全部';
}
if(!(saveCats()&&await saveVideos())){
state.cats=cats;
state.data.videos=videos;
return;
}
state.selectedIds.clear();
state.currentTag='全部';
document.getElementById('pageTitle').textContent=
state.currentCat==='全部'
?'全部视频'
:state.currentCat;
renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();
toast('分类已删除');
}
function openCatManage(){
const b=document.getElementById('catManageBody');
b.innerHTML='';
const cats=state.cats.filter(
c=>c!=='全部'&&c!=='未分类'
);
if(!cats.length){
b.innerHTML=
'<div class="manage-empty">暂无可管理的自定义分类</div>';
openModal('catManageModal');
return;
}
cats.forEach(c=>{
const item=document.createElement('div');
item.className='cat-manage-item';
item.innerHTML=`
<div class="cat-left">
<span>${icon(c)}</span>
<input
value="${escapeHtml(c)}"
maxlength="30"
>
</div>
<div class="cat-actions">
<button title="删除">🗑</button>
</div>
`;
const input=item.querySelector('input');
input.addEventListener('change',()=>{
renameCat(c,input.value.trim(),input);
});
item.querySelector('button').addEventListener(
'click',
()=>{
deleteCat(c);
}
);
b.appendChild(item);
});
openModal('catManageModal');
}
async function renameCat(oldName,newName,input){
if(!newName||newName===oldName){
input.value=oldName;
return;
}
if(state.cats.includes(newName)){
toast('分类名称已存在','error');
input.value=oldName;
return;
}
const idx=state.cats.indexOf(oldName);
const oldVideos=state.data.videos.map(v=>({...v}));
state.cats[idx]=newName;
state.data.videos.forEach(v=>{
if(v.category===oldName){
v.category=newName;
}
});
if(state.currentCat===oldName){
state.currentCat=newName;
}
if(!(saveCats()&&await saveVideos())){
state.cats[idx]=oldName;
state.data.videos=oldVideos;
input.value=oldName;
return;
}
document.getElementById('pageTitle').textContent=
state.currentCat==='全部'
?'全部视频'
:state.currentCat;
renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();
openCatManage();
toast('重命名成功');
}
function injectMultiUploadStyle(){
if(document.getElementById('multiUploadStyle'))return;
const style=document.createElement('style');
style.id='multiUploadStyle';
style.textContent=`
#fileName{
white-space:pre-line;
}
#batchActionBar button{
white-space:nowrap;
}
#duplicateOption{
box-sizing:border-box;
}
#duplicateOption input{
accent-color:currentColor;
}
@media(max-width:560px){
#batchActionBar{
bottom:12px!important;
padding:8px!important;
gap:5px!important;
}
#batchActionBar button{
padding:7px 8px!important;
font-size:11px!important;
}
#batchCount{
font-size:11px!important;
}
.video-select{
display:flex!important;
}
#duplicateOption{
margin-left:0!important;
margin-right:0!important;
font-size:12px!important;
}
#duplicateOption small{
font-size:10px!important;
}
}
`;
document.head.appendChild(style);
}
function setupMultipleFileInput(){
const input=document.getElementById('fileInput');
if(!input)return;
input.multiple=true;
input.setAttribute('accept','video/mp4,video/*');
}
function bind(){
const on=(id,e,fn)=>{
document.getElementById(id)?.addEventListener(e,fn);
};
on('uploadBtnMain','click',openUpload);
on('addCatBtn','click',openAddCat);
on('addCatConfirmBtn','click',addCat);
on('uploadConfirmBtn','click',doUpload);
on('catManageBtn','click',openCatManage);
on('exportBtn','click',exportBackup);
on('importBtn','click',openImport);
on('menuBtn','click',toggleSidebar);
on('sidebarOverlay','click',closeSidebar);
on('importConfirmBtn','click',doImport);
on('playerDownloadBtn','click',()=>{
const v=state.data.videos.find(
x=>x.id===state.currentPlayerId
);
if(v){
downloadVideo(v);
}
});
on('fileInput','change',e=>{
handleFiles(e.target.files);
e.target.value='';
});
on('importInput','change',e=>{
handleImport(e.target.files[0]);
e.target.value='';
});
document.querySelectorAll('[data-close]').forEach(b=>{
b.addEventListener('click',()=>{
closeModal(b.dataset.close);
});
});
document.querySelectorAll('.modal-overlay').forEach(o=>{
o.addEventListener('click',e=>{
if(e.target===o){
closeModal(o.id);
}
});
});
const drop=(id,input,handler)=>{
const d=document.getElementById(id);
if(!d)return;
d.addEventListener('click',()=>{
document.getElementById(input)?.click();
});
d.addEventListener('dragover',e=>{
e.preventDefault();
d.classList.add('dragover');
});
d.addEventListener('dragleave',()=>{
d.classList.remove('dragover');
});
d.addEventListener('drop',e=>{
e.preventDefault();
d.classList.remove('dragover');
if(e.dataTransfer?.files?.length){
handler(e.dataTransfer.files);
}
});
};
drop('fileDrop','fileInput',handleFiles);
drop('importDrop','importInput',files=>{
handleImport(files[0]);
});
on('newCatName','keydown',e=>{
if(e.key==='Enter'){
addCat();
}
});
document.addEventListener('keydown',e=>{
if(e.key==='Escape'){
[
'uploadModal',
'playerModal',
'catModal',
'importModal',
'catManageModal'
].forEach(closeModal);
closeSidebar();
}
});
window.addEventListener('beforeunload',()=>{
state.objectUrls.forEach(
u=>URL.revokeObjectURL(u)
);
});
}
function prepareUploadModal(){
const fileInput=document.getElementById('fileInput');
if(fileInput){
fileInput.multiple=true;
fileInput.setAttribute(
'accept',
'video/mp4,video/*'
);
}
const drop=document.getElementById('fileDrop');
if(drop){
const hint=drop.querySelector('.drop-hint');
if(hint){
hint.textContent=
'可一次选择多个视频，原始文件直接保存，不转码、不压缩';
}
}
injectDuplicateOption();
createUploadTagEditor();
}
function createBatchSelectionHelp(){
const content=document.getElementById('content');
if(!content)return;
}
function repairLegacyData(){
if(!Array.isArray(state.data.videos)){
state.data.videos=[];
}
state.data.videos=
state.data.videos.filter(
v=>v&&typeof v==='object'
);
state.data.videos.forEach(v=>{
if(!v.id){
v.id=
Date.now().toString(36)+
Math.random().toString(36).slice(2,8);
}
if(!v.name){
v.name='未命名视频.mp4';
}
if(!v.category){
v.category='未分类';
}
if(!v.type){
v.type='video/mp4';
}
if(!v.createdAt){
v.createdAt=Date.now();
}
v.tags=normalizeTags(v.tags);
if(!v.size){
const b=asBlob(v);
if(b){
v.size=b.size;
}
}
});
}
function cleanupSelection(){
const validIds=new Set(
state.data.videos.map(v=>v.id)
);
state.selectedIds=new Set(
[...state.selectedIds].filter(
id=>validIds.has(id)
)
);
}
function initBatchBar(){
updateBatchBar();
}
document.addEventListener(
'DOMContentLoaded',
async()=>{
bind();
injectBaseStyle();
injectMultiUploadStyle();
setupMultipleFileInput();
prepareUploadModal();
createBatchSelectionHelp();
await loadData();
repairLegacyData();
cleanupSelection();
renderCats();
renderFilterBar();
renderVideos();
initBatchBar();
}
);