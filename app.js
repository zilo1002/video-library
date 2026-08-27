const CONFIG={
DB_NAME:'VideoLibraryDB',
DB_VERSION:4,
STORE:'library',
VIDEO_STORE:'videos',
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
selectedTags:new Set(),
uploadTags:[]
};

const IDB={
db:null,

open(){
return new Promise((resolve,reject)=>{
if(this.db)return resolve(this.db);

const r=indexedDB.open(
CONFIG.DB_NAME,
CONFIG.DB_VERSION
);

r.onupgradeneeded=e=>{
const db=e.target.result;

if(!db.objectStoreNames.contains(CONFIG.STORE)){
db.createObjectStore(CONFIG.STORE);
}

if(!db.objectStoreNames.contains(CONFIG.VIDEO_STORE)){
const store=db.createObjectStore(
CONFIG.VIDEO_STORE,
{keyPath:'id'}
);

store.createIndex(
'createdAt',
'createdAt',
{unique:false}
);

store.createIndex(
'category',
'category',
{unique:false}
);
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
reject(
r.error||
new Error('IndexedDB 打开失败')
);
};
});
},

get(key){
return this.open().then(
db=>new Promise((res,rej)=>{
const r=db
.transaction(CONFIG.STORE,'readonly')
.objectStore(CONFIG.STORE)
.get(key);

r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
})
);
},

set(key,value){
return this.open().then(
db=>new Promise((res,rej)=>{
const tx=db.transaction(
CONFIG.STORE,
'readwrite'
);

tx.objectStore(CONFIG.STORE)
.put(value,key);

tx.oncomplete=()=>res();

tx.onerror=()=>{
rej(
tx.error||
new Error('IndexedDB 写入失败')
);
};

tx.onabort=()=>{
rej(
tx.error||
new Error('IndexedDB 写入中止')
);
};
})
);
},

getVideos(){
return this.open().then(
db=>new Promise((res,rej)=>{
const tx=db.transaction(
CONFIG.VIDEO_STORE,
'readonly'
);

const store=tx.objectStore(
CONFIG.VIDEO_STORE
);

const r=store.getAll();

r.onsuccess=()=>{
res(
Array.isArray(r.result)
?r.result
:[]
);
};

r.onerror=()=>{
rej(
r.error||
new Error('视频读取失败')
);
};
})
);
},

getVideo(id){
return this.open().then(
db=>new Promise((res,rej)=>{
const r=db
.transaction(
CONFIG.VIDEO_STORE,
'readonly'
)
.objectStore(CONFIG.VIDEO_STORE)
.get(id);

r.onsuccess=()=>res(r.result);
r.onerror=()=>rej(r.error);
})
);
},

putVideo(video){
return this.open().then(
db=>new Promise((res,rej)=>{
const tx=db.transaction(
CONFIG.VIDEO_STORE,
'readwrite'
);

tx.objectStore(
CONFIG.VIDEO_STORE
).put(video);

tx.oncomplete=()=>res();

tx.onerror=()=>{
rej(
tx.error||
new Error('视频保存失败')
);
};

tx.onabort=()=>{
rej(
tx.error||
new Error('视频保存中止')
);
};
})
);
},

putVideos(videos){
if(!Array.isArray(videos)||!videos.length){
return Promise.resolve();
}

return this.open().then(
db=>new Promise((res,rej)=>{
const tx=db.transaction(
CONFIG.VIDEO_STORE,
'readwrite'
);

const store=tx.objectStore(
CONFIG.VIDEO_STORE
);

for(const video of videos){
store.put(video);
}

tx.oncomplete=()=>res();

tx.onerror=()=>{
rej(
tx.error||
new Error('批量视频保存失败')
);
};

tx.onabort=()=>{
rej(
tx.error||
new Error('批量视频保存中止')
);
};
})
);
},

deleteVideo(id){
return this.open().then(
db=>new Promise((res,rej)=>{
const tx=db.transaction(
CONFIG.VIDEO_STORE,
'readwrite'
);

tx.objectStore(
CONFIG.VIDEO_STORE
).delete(id);

tx.oncomplete=()=>res();

tx.onerror=()=>{
rej(
tx.error||
new Error('视频删除失败')
);
};
})
);
},

deleteVideos(ids){
if(!Array.isArray(ids)||!ids.length){
return Promise.resolve();
}

return this.open().then(
db=>new Promise((res,rej)=>{
const tx=db.transaction(
CONFIG.VIDEO_STORE,
'readwrite'
);

const store=tx.objectStore(
CONFIG.VIDEO_STORE
);

ids.forEach(id=>{
store.delete(id);
});

tx.oncomplete=()=>res();

tx.onerror=()=>{
rej(
tx.error||
new Error('批量删除失败')
);
};

tx.onabort=()=>{
rej(
tx.error||
new Error('批量删除中止')
);
};
})
);
}
};

function escapeHtml(s=''){
const d=document.createElement('div');
d.textContent=String(s);
return d.innerHTML;
}

function formatSize(n=0){
if(n<1024){
return n+' B';
}

if(n<1048576){
return(n/1024).toFixed(1)+' KB';
}

if(n<1073741824){
return(n/1048576).toFixed(2)+' MB';
}

return(n/1073741824).toFixed(2)+' GB';
}

function formatDate(ts){
const d=new Date(ts);

return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(
d.getMinutes()
).padStart(2,'0')}`;
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
document
.getElementById('sidebar')
?.classList.remove('open');

document
.getElementById('sidebarOverlay')
?.classList.remove('active');
}

function toggleSidebar(){
document
.getElementById('sidebar')
?.classList.toggle('open');

document
.getElementById('sidebarOverlay')
?.classList.toggle('active');
}

function asBlob(v){
if(!v)return null;

try{

if(v.blob instanceof Blob){
return v.blob;
}

if(v.blob){
return new Blob(
[v.blob],
{
type:v.type||'video/mp4'
}
);
}

if(v.buffer instanceof ArrayBuffer){
return new Blob(
[v.buffer],
{
type:v.type||'video/mp4'
}
);
}

if(
typeof v.data==='string'&&
v.data.startsWith('data:')
){
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
state.objectUrls.set(
v.id,
URL.createObjectURL(b)
);
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
if(!Array.isArray(tags)){
return [];
}

return[
...new Set(
tags
.map(t=>String(t).trim())
.filter(Boolean)
)
];
}

function getAllTags(){
const tags=new Set();

state.data.videos.forEach(v=>{
normalizeTags(v.tags).forEach(t=>{
tags.add(t);
});
});

return[
...tags
].sort(
(a,b)=>a.localeCompare(
b,
'zh-CN'
)
);
}

function getCategoryTags(category){
const tags=new Set();

state.data.videos.forEach(v=>{
const cat=v.category||'未分类';

if(
category==='全部'||
cat===category
){
normalizeTags(v.tags).forEach(t=>{
tags.add(t);
});
}
});

return[
...tags
].sort(
(a,b)=>a.localeCompare(
b,
'zh-CN'
)
);
}

function videoMatchesTag(v){
if(state.currentTag==='全部'){
return true;
}

return normalizeTags(v.tags)
.includes(state.currentTag);
}

function getCurrentVideos(){
let videos=
state.currentCat==='全部'
?state.data.videos
:state.data.videos.filter(
v=>
(v.category||'未分类')===
state.currentCat
);

if(state.currentTag!=='全部'){
videos=videos.filter(
videoMatchesTag
);
}

return videos;
}

function normalizeVideo(v){
if(!v||typeof v!=='object'){
return null;
}

if(!v.id){
v.id=
Date.now().toString(36)+
Math.random()
.toString(36)
.slice(2,10);
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

return v;
}

function repairLegacyData(){
if(!Array.isArray(
state.data.videos
)){
state.data.videos=[];
}

state.data.videos=
state.data.videos
.map(normalizeVideo)
.filter(Boolean);
}

async function migrateLegacyVideos(){
const oldData=await IDB.get(
CONFIG.DB_KEY
);

if(
!oldData||
!Array.isArray(
oldData.videos
)||
!oldData.videos.length
){
return [];
}

let existing=[];

try{
existing=await IDB.getVideos();
}catch(e){
console.warn(
'读取新视频存储失败',
e
);
}

if(existing.length){
return existing;
}

const legacyVideos=
oldData.videos
.map(normalizeVideo)
.filter(Boolean);

if(!legacyVideos.length){
return [];
}

toast(
`正在迁移 ${legacyVideos.length} 个旧视频…`
);

let success=0;

for(const video of legacyVideos){
try{
await IDB.putVideo(video);
success++;
}catch(e){
console.error(
'迁移视频失败',
video.id,
e
);
}
}

try{
await IDB.set(
CONFIG.DB_KEY,
{
version:4,
migrated:true
}
);
}catch{}

toast(
success===legacyVideos.length
?`已迁移 ${success} 个视频`
:`已迁移 ${success}/${legacyVideos.length} 个视频`,
success===legacyVideos.length
?'success'
:'error'
);

return await IDB.getVideos();
}

async function loadData(){
try{

const c=
localStorage.getItem(
CONFIG.CAT_KEY
);

state.cats=c
?JSON.parse(c)
:[...CONFIG.DEFAULT_CATS];

if(
!Array.isArray(state.cats)||
!state.cats.includes('全部')||
!state.cats.includes('未分类')
){
state.cats=[
...CONFIG.DEFAULT_CATS
];
}

}catch{
state.cats=[
...CONFIG.DEFAULT_CATS
];
}

try{

let videos=[];

try{
videos=await IDB.getVideos();
}catch(e){
console.warn(
'新视频存储读取失败',
e
);
}

if(!videos.length){
videos=await migrateLegacyVideos();
}

state.data={
videos:Array.isArray(videos)
?videos
:[]
};

repairLegacyData();

renderCats();
renderFilterBar();
renderVideos();
updateStorage();
updateBatchBar();

}catch(e){

console.error(e);

state.data={
videos:[]
};

renderCats();
renderFilterBar();
renderVideos();

toast(
'视频库加载失败：'+
e.message,
'error'
);
}
}

function saveCats(){
try{

localStorage.setItem(
CONFIG.CAT_KEY,
JSON.stringify(
state.cats
)
);

return true;

}catch{

toast(
'分类保存失败',
'error'
);

return false;
}
}

async function saveVideo(video){
try{

const normalized=
normalizeVideo(
video
);

if(!normalized){
throw new Error(
'视频数据无效'
);
}

await IDB.putVideo(
normalized
);

const index=
state.data.videos.findIndex(
v=>v.id===normalized.id
);

if(index>=0){
state.data.videos[index]=
normalized;
}else{
state.data.videos.push(
normalized
);
}

await updateStorage();

return true;

}catch(e){

console.error(e);

toast(
'视频保存失败：'+
e.message,
'error'
);

return false;
}
}

async function saveVideos(){
try{

await IDB.putVideos(
state.data.videos
);

await updateStorage();

return true;

}catch(e){

console.error(e);

toast(
'视频保存失败：'+
e.message,
'error'
);

return false;
}
}

async function updateStorage(){
let used=0;

for(
const v of state.data.videos
){
const b=asBlob(v);

used+=
b
?b.size
:Number(v.size)||0;
}

const text=
document.getElementById(
'storageText'
);

if(text){
text.textContent=
`视频占用 ${formatSize(
used
)} · ${
state.data.videos.length
} 个`;
}

try{

const q=
await navigator
.storage
?.estimate?.();

const quota=q?.quota||0;

const fill=
document.getElementById(
'storageFill'
);

if(fill){

const den=
quota||
Math.max(
50*1048576,
used*2
);

fill.style.width=
Math.min(
100,
used/den*100
)+'%';

fill.classList.toggle(
'warning',
!!quota&&
used/quota>.7
);

fill.classList.toggle(
'danger',
!!quota&&
used/quota>.9
);
}

}catch{}
}

function renderCats(){
const list=
document.getElementById(
'catList'
);

if(!list)return;

list.innerHTML='';

state.cats.forEach(c=>{

const count=
c==='全部'
?state.data.videos.length
:state.data.videos.filter(
v=>
(v.category||
'未分类')===c
).length;

const d=
document.createElement('div');

d.className=
'cat-item'+
(
c===state.currentCat
?' active'
:''
);

d.innerHTML=`
<span class="cat-icon">
${icon(c)}
</span>

<span class="cat-name">
${escapeHtml(c)}
</span>

<span class="cat-count">
${count}
</span>

${
c!=='全部'&&
c!=='未分类'
?`
<button
class="cat-del-btn"
title="删除分类">
−
</button>
`
:''
}
`;

d.addEventListener(
'click',
e=>{
if(
!e.target.closest(
'.cat-del-btn'
)
){
switchCat(c);
}
}
);

d.querySelector(
'.cat-del-btn'
)?.addEventListener(
'click',
e=>{
e.stopPropagation();
deleteCat(c);
}
);

list.appendChild(d);
});
}

function switchCat(c){
state.currentCat=c;
state.currentTag='全部';
state.selectedTags.clear();
state.selectedIds.clear();

const title=
document.getElementById(
'pageTitle'
);

if(title){
title.textContent=
c==='全部'
?'全部视频'
:c;
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

/* =========================
   视频选择框
========================= */

.video-select{
position:absolute;
top:8px;
left:8px;
z-index:8;
width:30px;
height:30px;
border-radius:8px;
background:rgba(0,0,0,.68);
display:flex;
align-items:center;
justify-content:center;
cursor:pointer;
box-sizing:border-box;
}

.video-select input{
width:17px;
height:17px;
margin:0;
cursor:pointer;
}

.video-card.selected{
outline:2px solid rgba(255,255,255,.65);
outline-offset:1px;
}

.video-card.selected .video-thumb{
box-shadow:
inset 0 0 0 2px rgba(255,255,255,.35);
}

/* =========================
   视频编辑按钮
========================= */

.video-edit-btn{
position:absolute;
right:8px;
top:8px;
z-index:8;
width:30px;
height:30px;
padding:0;
border:0;
border-radius:8px;
background:rgba(0,0,0,.68);
color:#fff;
cursor:pointer;
font-size:14px;
}

.video-edit-btn:hover{
background:rgba(0,0,0,.85);
}

.video-edit-panel{
display:none;
position:absolute;
left:8px;
right:8px;
bottom:8px;
z-index:12;
padding:10px;
border-radius:10px;
background:rgba(20,20,20,.97);
border:1px solid rgba(255,255,255,.14);
box-shadow:0 8px 30px rgba(0,0,0,.45);
}

.video-edit-panel.show{
display:block;
}

.video-edit-row{
display:flex;
gap:6px;
align-items:center;
}

.video-edit-row select,
.video-edit-row input{
flex:1;
min-width:0;
height:32px;
box-sizing:border-box;
background:#181818;
border:1px solid #3a3a3a;
border-radius:7px;
color:#fff;
padding:0 8px;
outline:none;
font-size:12px;
}

.video-edit-actions{
display:flex;
gap:6px;
margin-top:7px;
}

.video-edit-actions button{
flex:1;
border:1px solid #3a3a3a;
background:#242424;
color:#ddd;
border-radius:7px;
padding:6px 8px;
font-size:11px;
cursor:pointer;
}

/* =========================
   时间轴
========================= */

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
position:relative;
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

.timeline-select{
position:absolute;
top:16px;
left:8px;
z-index:9;
width:28px;
height:28px;
display:flex;
align-items:center;
justify-content:center;
border-radius:7px;
background:rgba(0,0,0,.7);
}

.timeline-select input{
width:16px;
height:16px;
margin:0;
}

/* =========================
   标签视图
========================= */

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
grid-template-columns:
repeat(auto-fill,minmax(170px,1fr));
gap:12px;
}

/* =========================
   批量操作栏
========================= */

#batchActionBar{
position:fixed;
left:50%;
bottom:22px;
transform:translateX(-50%);
z-index:100;
display:none;
align-items:center;
gap:7px;
padding:10px 12px;
background:#242424;
border:1px solid #444;
border-radius:12px;
box-shadow:0 8px 30px rgba(0,0,0,.45);
max-width:calc(100vw - 24px);
box-sizing:border-box;
}

#batchActionBar button{
white-space:nowrap;
}

#batchCount{
font-size:13px;
color:#e0e0e0;
white-space:nowrap;
margin-right:3px;
}

.batch-more-btn{
border:1px solid #444;
background:#303030;
color:#ddd;
border-radius:7px;
padding:7px 9px;
font-size:11px;
cursor:pointer;
}

.batch-more-panel{
position:absolute;
bottom:calc(100% + 8px);
right:0;
display:none;
min-width:180px;
padding:7px;
background:#242424;
border:1px solid #444;
border-radius:10px;
box-shadow:0 8px 30px rgba(0,0,0,.45);
}

.batch-more-panel.show{
display:block;
}

.batch-more-panel button{
display:block;
width:100%;
text-align:left;
border:0;
background:transparent;
color:#ddd;
padding:9px;
border-radius:7px;
cursor:pointer;
font-size:12px;
}

.batch-more-panel button:hover{
background:rgba(255,255,255,.08);
}

/* =========================
   批量编辑弹窗
========================= */

.batch-edit-group{
margin-bottom:14px;
}

.batch-edit-label{
display:block;
font-size:12px;
color:#aaa;
margin-bottom:7px;
}

.batch-edit-group select,
.batch-edit-group input{
width:100%;
box-sizing:border-box;
height:38px;
background:#151515;
border:1px solid #383838;
border-radius:8px;
color:#fff;
padding:0 10px;
outline:none;
}

.batch-edit-help{
font-size:10px;
color:#777;
margin-top:5px;
line-height:1.5;
}

/* =========================
   标签编辑器
========================= */

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

.untagged-label{
color:#888;
}

/* =========================
   上传标签
========================= */

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
grid-template-columns:
repeat(2,minmax(0,1fr));
gap:8px;
}

.video-library-tools{
gap:6px;
}

.video-view-btn{
padding:6px 8px;
font-size:11px;
}

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

.timeline-select{
display:flex!important;
}

.video-edit-panel{
left:5px;
right:5px;
bottom:5px;
}

}
`;

document.head.appendChild(style);
}

function renderFilterBar(){
injectBaseStyle();

let bar=
document.getElementById(
'videoLibraryTools'
);

if(!bar){

const content=
document.getElementById(
'content'
);

if(!content)return;

bar=document.createElement('div');

bar.id=
'videoLibraryTools';

bar.className=
'video-library-tools';

content.parentNode.insertBefore(
bar,
content
);
}

bar.innerHTML='';

const viewSwitch=
document.createElement('div');

viewSwitch.className=
'video-view-switch';

const modes=[
['grid','▦ 网格'],
['timeline','◷ 时间轴'],
['tags','🏷 标签']
];

modes.forEach(
([mode,label])=>{

const btn=
document.createElement(
'button'
);

btn.className=
'video-view-btn'+
(
state.viewMode===mode
?' active'
:''
);

btn.textContent=label;

btn.addEventListener(
'click',
()=>{

state.viewMode=mode;

renderFilterBar();
renderVideos();

}
);

viewSwitch.appendChild(btn);

}
);

bar.appendChild(
viewSwitch
);

const tags=
getCategoryTags(
state.currentCat
);

if(tags.length){

const tagFilter=
document.createElement(
'div'
);

tagFilter.className=
'video-tag-filter';

const label=
document.createElement(
'span'
);

label.style.cssText=
'font-size:11px;color:#777';

label.textContent='标签';

tagFilter.appendChild(
label
);

const all=
document.createElement(
'button'
);

all.className=
'video-tag-chip'+
(
state.currentTag==='全部'
?' active'
:''
);

all.textContent='全部';

all.addEventListener(
'click',
()=>{

state.currentTag='全部';

renderFilterBar();
renderVideos();

}
);

tagFilter.appendChild(all);

tags.forEach(tag=>{

const btn=
document.createElement(
'button'
);

btn.className=
'video-tag-chip'+
(
state.currentTag===tag
?' active'
:''
);

btn.textContent='#'+tag;

btn.addEventListener(
'click',
()=>{

state.currentTag=tag;

renderFilterBar();
renderVideos();

}
);

tagFilter.appendChild(btn);

});

bar.appendChild(
tagFilter
);
}
}

function renderVideos(){
const box=
document.getElementById(
'content'
);

if(!box)return;

cleanupSelection();

const vs=
getCurrentVideos();

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

renderTimeline(
vs,
box
);

}else if(
state.viewMode==='tags'
){

renderTagView(
vs,
box
);

}else{

renderGrid(
vs,
box
);

}

updateBatchBar();
}

function createSelectCheckbox(v,extraClass=''){
const label=
document.createElement('label');

label.className=
`video-select ${extraClass}`;

label.title='选择视频';

const input=
document.createElement(
'input'
);

input.type='checkbox';

input.checked=
state.selectedIds.has(
v.id
);

input.addEventListener(
'click',
e=>{
e.stopPropagation();
}
);

input.addEventListener(
'change',
e=>{

e.stopPropagation();

if(e.target.checked){

state.selectedIds.add(
v.id
);

}else{

state.selectedIds.delete(
v.id
);

}

updateBatchBar();

updateSelectionVisuals();

}
);

label.appendChild(
input
);

return label;
}

function updateSelectionVisuals(){

document
.querySelectorAll(
'[data-video-id]'
)
.forEach(el=>{

const id=
el.dataset.videoId;

el.classList.toggle(
'selected',
state.selectedIds.has(
id
)
);

const checkbox=
el.querySelector(
'input[type="checkbox"]'
);

if(checkbox){
checkbox.checked=
state.selectedIds.has(
id
);
}

});
}

function createEditButton(v){
const btn=
document.createElement(
'button'
);

btn.className=
'video-edit-btn';

btn.type='button';

btn.title='编辑分类和标签';

btn.textContent='✎';

btn.addEventListener(
'click',
e=>{

e.stopPropagation();

openVideoEditor(
v,
btn.closest(
'[data-video-id]'
)
);

}
);

return btn;
}

function createVideoEditPanel(v){
const panel=
document.createElement(
'div'
);

panel.className=
'video-edit-panel';

panel.innerHTML=`
<div class="video-edit-row">

<select class="edit-category">
${state.cats
.filter(c=>c!=='全部')
.map(c=>`
<option value="${escapeHtml(c)}"
${(
v.category||'未分类'
)===c?'selected':''}>
${escapeHtml(c)}
</option>
`)
.join('')}
</select>

</div>

<div
class="video-tags"
data-edit-tags>
${normalizeTags(v.tags)
.map(tag=>`
<span
class="video-tag"
data-tag="${escapeHtml(tag)}">
${escapeHtml(tag)}
<button
type="button"
class="remove-inline-tag"
style="
border:0;
background:none;
color:#aaa;
margin-left:3px;
padding:0;
cursor:pointer;
">
×
</button>
</span>
`)
.join('')}
</div>

<div class="tag-editor">

<input
class="edit-tag-input"
maxlength="20"
placeholder="添加标签">

<button
type="button"
class="edit-add-tag">
添加
</button>

</div>

<div class="video-edit-actions">

<button
type="button"
class="edit-save">
保存
</button>

<button
type="button"
class="edit-cancel">
取消
</button>

</div>
`;

const tagBox=
panel.querySelector(
'[data-edit-tags]'
);

panel
.querySelector(
'.edit-add-tag'
)
.addEventListener(
'click',
()=>{

const input=
panel.querySelector(
'.edit-tag-input'
);

const tag=
input.value.trim();

if(!tag)return;

const current=
getPanelTags(panel);

if(!current.includes(tag)){
current.push(tag);
}

setPanelTags(
panel,
current
);

input.value='';

}
);

panel
.querySelector(
'.edit-tag-input'
)
.addEventListener(
'keydown',
e=>{

if(e.key==='Enter'){

e.preventDefault();

panel
.querySelector(
'.edit-add-tag'
)
.click();

}

}
);

panel
.querySelector(
'.edit-save'
)
.addEventListener(
'click',
async e=>{

e.stopPropagation();

const category=
panel.querySelector(
'.edit-category'
).value;

const tags=
getPanelTags(panel);

await updateVideoMeta(
v.id,
category,
tags
);

}
);

panel
.querySelector(
'.edit-cancel'
)
.addEventListener(
'click',
e=>{

e.stopPropagation();

panel.classList.remove(
'show'
);

}
);

return panel;
}

function getPanelTags(panel){
return[
...panel.querySelectorAll(
'[data-edit-tags] [data-tag]'
)
]
.map(el=>
el.dataset.tag
)
.filter(Boolean);
}

function setPanelTags(panel,tags){

const box=
panel.querySelector(
'[data-edit-tags]'
);

if(!box)return;

box.innerHTML='';

normalizeTags(tags)
.forEach(tag=>{

const span=
document.createElement(
'span'
);

span.className=
'video-tag';

span.dataset.tag=
tag;

span.innerHTML=
`${escapeHtml(tag)}
<button
type="button"
class="remove-inline-tag"
style="
border:0;
background:none;
color:#aaa;
margin-left:3px;
padding:0;
cursor:pointer;
">
×
</button>`;

span
.querySelector(
'.remove-inline-tag'
)
.addEventListener(
'click',
e=>{

e.stopPropagation();

span.remove();

}
);

box.appendChild(
span
);

});
}

function openVideoEditor(v,card){

if(!card)return;

let panel=
card.querySelector(
'.video-edit-panel'
);

if(!panel){

panel=
createVideoEditPanel(v);

card.appendChild(
panel
);

setPanelTags(
panel,
normalizeTags(v.tags)
);

}

document
.querySelectorAll(
'.video-edit-panel.show'
)
.forEach(p=>{
if(p!==panel){
p.classList.remove(
'show'
);
}
});

panel.classList.toggle(
'show'
);
}

async function updateVideoMeta(
id,
category,
tags
){

const video=
state.data.videos.find(
v=>v.id===id
);

if(!video)return;

const oldCategory=
video.category;

const oldTags=
normalizeTags(video.tags);

video.category=
category||'未分类';

video.tags=
normalizeTags(tags);

if(await saveVideo(video)){

renderCats();
renderFilterBar();
renderVideos();

toast('视频信息已更新');

}else{

video.category=
oldCategory;

video.tags=
oldTags;

}
}

function renderGrid(vs,box){

const grid=
document.createElement(
'div'
);

grid.className=
'video-grid';

vs.slice()
.reverse()
.forEach(v=>{

const card=
document.createElement(
'div'
);

card.className=
'video-card';

card.dataset.videoId=
v.id;

if(
state.selectedIds.has(
v.id
)
){
card.classList.add(
'selected'
);
}

const src=
videoUrl(v);

const thumb=
v.thumbnail||'';

card.innerHTML=`
<div class="video-thumb">

${
thumb
?`
<img
src="${escapeHtml(thumb)}"
alt="视频缩略图">
`
:
(
src
?`
<video
muted
playsinline
preload="metadata">
</video>
`
:
`
<div class="thumb-placeholder">
🎬
</div>
`
)
}

<div class="play-icon">
▶
</div>

<button
class="delete-btn"
title="删除视频">
×
</button>

</div>

<div class="video-info">

<div
class="v-title"
title="${escapeHtml(v.name)}">
${escapeHtml(v.name)}
</div>

<div class="v-meta">
<span>${formatSize(v.size)}</span>
<span>${formatDate(v.createdAt)}</span>
</div>

<span class="v-cat">
${escapeHtml(
v.category||'未分类'
)}
</span>

<div class="video-tags">
${normalizeTags(v.tags)
.map(t=>`
<span class="video-tag">
${escapeHtml(t)}
</span>
`)
.join('')}
</div>

</div>
`;

const thumbBox=
card.querySelector(
'.video-thumb'
);

thumbBox.prepend(
createSelectCheckbox(v)
);

thumbBox.appendChild(
createEditButton(v)
);

thumbBox.appendChild(
createVideoEditPanel(v)
);

const vid=
card.querySelector(
'.video-thumb video'
);

if(vid&&src){

vid.src=src;

vid.addEventListener(
'loadedmetadata',
()=>{

try{

vid.currentTime=
Math.min(
.1,
vid.duration||0
);

}catch{}

}
);

}

const checkbox=
card.querySelector(
'.video-select input'
);

checkbox?.addEventListener(
'change',
e=>{

e.stopPropagation();

}
);

card
.querySelector(
'.delete-btn'
)
.addEventListener(
'click',
e=>{

e.stopPropagation();

deleteVideo(v.id);

}
);

card.addEventListener(
'click',
e=>{

if(
e.target.closest(
'.delete-btn'
)||
e.target.closest(
'.video-select'
)||
e.target.closest(
'.video-edit-btn'
)||
e.target.closest(
'.video-edit-panel'
)
){
return;
}

playVideo(v);

}
);

grid.appendChild(
card
);

}
);

box.appendChild(
grid
);
}

function renderTimeline(vs,box){

const timeline=
document.createElement(
'div'
);

timeline.className=
'video-timeline';

const sorted=
vs.slice().sort(
(a,b)=>
(b.createdAt||0)-
(a.createdAt||0)
);

let lastDate='';

sorted.forEach(v=>{

const date=
new Date(v.createdAt);

const dateKey=
`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;

const item=
document.createElement(
'div'
);

item.className=
'timeline-item';

item.dataset.videoId=
v.id;

const dateLabel=
dateKey===lastDate
?''
:`${date.getMonth()+1}月${date.getDate()}日`;

lastDate=dateKey;

const src=
videoUrl(v);

const thumb=
v.thumbnail||'';

item.innerHTML=`
<div class="timeline-date">
${dateLabel}
</div>

<div class="timeline-line">
<div class="timeline-dot"></div>
</div>

<div class="timeline-card">

<div class="timeline-thumb">

${
thumb
?`
<img
src="${escapeHtml(thumb)}"
alt="">
`
:
src
?`
<video
muted
playsinline
preload="metadata">
</video>
`
:`
<div class="thumb-placeholder">
🎬
</div>
`
}

</div>

<div class="timeline-content">

<div class="timeline-title">
${escapeHtml(v.name)}
</div>

<div class="timeline-meta">
${escapeHtml(
v.category||'未分类'
)}
 · ${formatSize(v.size)}
 · ${formatFullDate(v.createdAt)}
</div>

<div class="video-tags">
${normalizeTags(v.tags)
.map(t=>`
<span class="video-tag">
${escapeHtml(t)}
</span>
`)
.join('')}
</div>

</div>

</div>
`;

const card=
item.querySelector(
'.timeline-card'
);

const thumbBox=
item.querySelector(
'.timeline-thumb'
);

const select=
createSelectCheckbox(
v,
'timeline-select'
);

thumbBox.appendChild(
select
);

card.appendChild(
createEditButton(v)
);

card.appendChild(
createVideoEditPanel(v)
);

const vid=
item.querySelector(
'.timeline-thumb video'
);

if(vid&&src){

vid.src=src;

vid.addEventListener(
'loadedmetadata',
()=>{

try{

vid.currentTime=
Math.min(
.1,
vid.duration||0
);

}catch{}

}
);

}

item
.querySelector(
'.timeline-thumb'
)
.addEventListener(
'click',
e=>{

if(
e.target.closest(
'.timeline-select'
)||
e.target.closest(
'.video-edit-btn'
)
)return;

playVideo(v);

}
);

item
.querySelector(
'.timeline-title'
)
.addEventListener(
'click',
()=>playVideo(v)
);

timeline.appendChild(
item
);

});

box.appendChild(
timeline
);
}

function renderTagView(vs,box){

const wrapper=
document.createElement(
'div'
);

wrapper.className=
'tag-view';

const groups=
new Map();

vs.forEach(v=>{

const tags=
normalizeTags(v.tags);

if(!tags.length){

if(!groups.has(
'__untagged__'
)){
groups.set(
'__untagged__',
[]
);
}

groups
.get('__untagged__')
.push(v);

}else{

tags.forEach(tag=>{

if(!groups.has(tag)){
groups.set(tag,[]);
}

groups
.get(tag)
.push(v);

});

}

});

const ordered=
[...groups.keys()]
.sort((a,b)=>{

if(
a==='__untagged__'
)return 1;

if(
b==='__untagged__'
)return -1;

return a.localeCompare(
b,
'zh-CN'
);

});

ordered.forEach(tag=>{

const group=
document.createElement(
'div'
);

group.className=
'tag-group';

const title=
tag==='__untagged__'
?'未添加标签'
:'#'+tag;

group.innerHTML=`
<div class="tag-group-title">

<span>
${escapeHtml(title)}
</span>

<span class="tag-group-count">
${groups.get(tag).length} 个
</span>

</div>
`;

const videos=
document.createElement(
'div'
);

videos.className=
'tag-group-videos';

groups
.get(tag)
.forEach(v=>{

videos.appendChild(
createMiniCard(v)
);

});

group.appendChild(
videos
);

wrapper.appendChild(
group
);

});

box.appendChild(
wrapper
);
}

function createMiniCard(v){

const card=
document.createElement(
'div'
);

card.className=
'video-card';

card.dataset.videoId=
v.id;

if(
state.selectedIds.has(
v.id
)
){
card.classList.add(
'selected'
);
}

const src=
videoUrl(v);

const thumb=
v.thumbnail||'';

card.innerHTML=`
<div class="video-thumb">

${
thumb
?`
<img
src="${escapeHtml(thumb)}"
alt="">
`
:
src
?`
<video
muted
playsinline
preload="metadata">
</video>
`
:`
<div class="thumb-placeholder">
🎬
</div>
`
}

<div class="play-icon">
▶
</div>

</div>

<div class="video-info">

<div
class="v-title"
title="${escapeHtml(v.name)}">
${escapeHtml(v.name)}
</div>

<div class="v-meta">
<span>${formatSize(v.size)}</span>
<span>${formatDate(v.createdAt)}</span>
</div>

<span class="v-cat">
${escapeHtml(
v.category||'未分类'
)}
</span>

<div class="video-tags">
${normalizeTags(v.tags)
.map(t=>`
<span class="video-tag">
${escapeHtml(t)}
</span>
`)
.join('')}
</div>

</div>
`;

const thumbBox=
card.querySelector(
'.video-thumb'
);

thumbBox.prepend(
createSelectCheckbox(v)
);

thumbBox.appendChild(
createEditButton(v)
);

thumbBox.appendChild(
createVideoEditPanel(v)
);

const vid=
card.querySelector(
'video'
);

if(vid&&src){

vid.src=src;

vid.addEventListener(
'loadedmetadata',
()=>{

try{

vid.currentTime=
Math.min(
.1,
vid.duration||0
);

}catch{}

}
);

}

card.addEventListener(
'click',
e=>{

if(
e.target.closest(
'.video-select'
)||
e.target.closest(
'.video-edit-btn'
)||
e.target.closest(
'.video-edit-panel'
)
){
return;
}

playVideo(v);

}
);

return card;
}

function playVideo(v){

const src=
videoUrl(v);

if(!src){

return toast(
'视频文件数据不存在',
'error'
);

}

const video=
document.getElementById(
'playerVideo'
);

state.currentPlayerId=
v.id;

video.onerror=()=>{

toast(
'这个 MP4 无法由当前浏览器解码。文件本身未被修改。',
'error'
);

};

video.src=src;
video.load();

document.getElementById(
'playerTitle'
).textContent=
v.name;

document.getElementById(
'playerMeta'
).textContent=
`${v.category||'未分类'} · ${
formatSize(v.size)
} · ${
new Date(
v.createdAt
).toLocaleString()
}`;

openModal(
'playerModal'
);

video
.play()
.catch(()=>{});

}

async function deleteVideo(id){

if(
!confirm(
'确定删除这个视频？'
)
)return;

const old=
state.data.videos;

state.data.videos=
old.filter(
v=>v.id!==id
);

try{

await IDB.deleteVideo(id);

revoke(id);

state.selectedIds.delete(id);

renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();

toast(
'视频已删除'
);

}catch(e){

state.data.videos=
old;

toast(
'删除失败：'+e.message,
'error'
);

}

}

async function deleteSelectedVideos(){

const ids=[
...state.selectedIds
];

if(!ids.length){

return toast(
'请先选择视频',
'error'
);

}

const count=ids.length;

if(
!confirm(
`确定删除选中的 ${count} 个视频？`
)
){
return;
}

const oldVideos=
state.data.videos;

state.data.videos=
oldVideos.filter(
v=>!state.selectedIds.has(v.id)
);

try{

await IDB.deleteVideos(
ids
);

ids.forEach(
id=>revoke(id)
);

state.selectedIds.clear();

renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();

toast(
`已删除 ${count} 个视频`
);

}catch(e){

state.data.videos=
oldVideos;

toast(
'批量删除失败：'+
e.message,
'error'
);

}

}

function selectAllCurrent(){

const videos=
getCurrentVideos();

if(!videos.length){
return;
}

const allSelected=
videos.every(
v=>
state.selectedIds.has(
v.id
)
);

if(allSelected){

videos.forEach(
v=>
state.selectedIds.delete(
v.id
)
);

}else{

videos.forEach(
v=>
state.selectedIds.add(
v.id
)
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

function createBatchModal(){

if(
document.getElementById(
'batchEditModal'
)
){
return;
}

const modal=
document.createElement(
'div'
);

modal.id=
'batchEditModal';

modal.className=
'modal-overlay';

modal.innerHTML=`
<div class="modal">

<div class="modal-header">

<h3 id="batchEditTitle">
批量编辑
</h3>

<button
class="modal-close"
data-batch-close>
×
</button>

</div>

<div class="modal-body">

<div class="batch-edit-group">

<label class="batch-edit-label">
分类
</label>

<select
id="batchCategory">
<option value="">
不修改分类
</option>

${state.cats
.filter(c=>c!=='全部')
.map(c=>`
<option value="${escapeHtml(c)}">
${escapeHtml(c)}
</option>
`)
.join('')}

</select>

</div>

<div class="batch-edit-group">

<label class="batch-edit-label">
添加标签
</label>

<input
id="batchAddTag"
maxlength="20"
placeholder="例如：重点">

<div class="batch-edit-help">
填写后会给所有选中视频添加这个标签。
</div>

</div>

<div class="batch-edit-group">

<label class="batch-edit-label">
删除标签
</label>

<input
id="batchRemoveTag"
maxlength="20"
placeholder="例如：待整理">

<div class="batch-edit-help">
填写后会从所有选中视频中删除这个标签。
</div>

</div>

</div>

<div class="modal-footer">

<button
class="btn btn-secondary"
data-batch-close>
取消
</button>

<button
class="btn btn-primary"
id="batchEditConfirm">
保存修改
</button>

</div>

</div>
`;

document.body.appendChild(
modal
);

modal
.querySelectorAll(
'[data-batch-close]'
)
.forEach(btn=>{

btn.addEventListener(
'click',
()=>{

modal.classList.remove(
'active'
);

}
);

});

modal.addEventListener(
'click',
e=>{

if(e.target===modal){
modal.classList.remove(
'active'
);
}

});

modal
.querySelector(
'#batchEditConfirm'
)
.addEventListener(
'click',
applyBatchEdit
);

}

function openBatchEdit(){

if(!state.selectedIds.size){

return toast(
'请先选择视频',
'error'
);

}

createBatchModal();

const modal=
document.getElementById(
'batchEditModal'
);

const select=
document.getElementById(
'batchCategory'
);

select.innerHTML=`
<option value="">
不修改分类
</option>

${state.cats
.filter(c=>c!=='全部')
.map(c=>`
<option value="${escapeHtml(c)}">
${escapeHtml(c)}
</option>
`)
.join('')}
`;

document.getElementById(
'batchAddTag'
).value='';

document.getElementById(
'batchRemoveTag'
).value='';

document.getElementById(
'batchEditTitle'
).textContent=
`批量编辑（已选 ${state.selectedIds.size} 个）`;

modal.classList.add(
'active'
);
}

async function applyBatchEdit(){

const category=
document.getElementById(
'batchCategory'
).value;

const addTag=
document.getElementById(
'batchAddTag'
).value.trim();

const removeTag=
document.getElementById(
'batchRemoveTag'
).value.trim();

if(
!category&&
!addTag&&
!removeTag
){

return toast(
'没有需要修改的内容',
'error'
);

}

const ids=[
...state.selectedIds
];

const oldVideos=
state.data.videos.map(
v=>({
...v,
tags:normalizeTags(
v.tags
)
})
);

const changed=[];

state.data.videos.forEach(v=>{

if(!ids.includes(v.id)){
return;
}

if(category){
v.category=category;
}

let tags=
normalizeTags(v.tags);

if(addTag&&!tags.includes(addTag)){
tags.push(addTag);
}

if(removeTag){

tags=
tags.filter(
t=>t!==removeTag
);

}

v.tags=
normalizeTags(tags);

changed.push(v);

});

try{

for(const video of changed){

await IDB.putVideo(
video
);

}

document
.getElementById(
'batchEditModal'
)
.classList.remove(
'active'
);

renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();

toast(
`已修改 ${changed.length} 个视频`
);

}catch(e){

state.data.videos=
oldVideos;

toast(
'批量修改失败：'+
e.message,
'error'
);

}

}

async function downloadVideo(v){

const b=
asBlob(v);

if(!b){

return toast(
'找不到原视频文件',
'error'
);

}

const u=
URL.createObjectURL(b);

const a=
document.createElement(
'a'
);

a.href=u;
a.download=
v.name||'video.mp4';

document.body.appendChild(a);

a.click();

a.remove();

setTimeout(
()=>{
URL.revokeObjectURL(u);
},
1500
);

}

async function downloadSelectedVideos(){

const ids=[
...state.selectedIds
];

if(!ids.length){

return toast(
'请先选择视频',
'error'
);

}

const videos=
state.data.videos.filter(
v=>ids.includes(v.id)
);

if(videos.length===1){

downloadVideo(
videos[0]
);

return;
}

let success=0;

for(const v of videos){

const b=
asBlob(v);

if(!b)continue;

const u=
URL.createObjectURL(b);

const a=
document.createElement(
'a'
);

a.href=u;
a.download=
v.name||'video.mp4';

document.body.appendChild(a);

a.click();
a.remove();

success++;

await new Promise(
resolve=>
setTimeout(
resolve,
180
)
);

setTimeout(
()=>{
URL.revokeObjectURL(u);
},
1500
);

}

toast(
`已开始下载 ${success} 个视频`
);

state.selectedIds.clear();

renderVideos();
updateBatchBar();
}

function updateBatchBar(){

let bar=
document.getElementById(
'batchActionBar'
);

if(!bar){

bar=
document.createElement(
'div'
);

bar.id=
'batchActionBar';

bar.innerHTML=`

<span id="batchCount"></span>

<button
id="batchSelectAll"
class="btn btn-secondary"
style="
padding:7px 10px;
font-size:12px;
">
全选
</button>

<button
id="batchEdit"
class="btn btn-secondary"
style="
padding:7px 10px;
font-size:12px;
">
编辑
</button>

<button
id="batchDownload"
class="btn btn-primary"
style="
padding:7px 10px;
font-size:12px;
">
⬇ 下载
</button>

<button
id="batchDelete"
class="btn btn-secondary"
style="
padding:7px 10px;
font-size:12px;
color:#ff6b6b;
">
删除
</button>

<button>

<button
id="batchClear"
class="btn btn-secondary"
style="
padding:7px 10px;
font-size:12px;
">
取消
</button>
`;

document.body.appendChild(
bar
);

document
.getElementById(
'batchSelectAll'
)
.addEventListener(
'click',
selectAllCurrent
);

document
.getElementById(
'batchEdit'
)
.addEventListener(
'click',
openBatchEdit
);

document
.getElementById(
'batchDownload'
)
.addEventListener(
'click',
downloadSelectedVideos
);

document
.getElementById(
'batchDelete'
)
.addEventListener(
'click',
deleteSelectedVideos
);

document
.getElementById(
'batchClear'
)
.addEventListener(
'click',
clearSelection
);

}

const selectedCount=
state.selectedIds.size;

const currentVideos=
getCurrentVideos();

if(!selectedCount){

bar.style.display='none';

return;
}

bar.style.display='flex';

document
.getElementById(
'batchCount'
)
.textContent=
`已选 ${selectedCount} 个`;

const allSelected=
currentVideos.length>0&&
currentVideos.every(
v=>
state.selectedIds.has(
v.id
)
);

document
.getElementById(
'batchSelectAll'
)
.textContent=
allSelected
?'取消全选'
:'全选';
}

function createVideoManagePanel(){
const old=document.getElementById('videoManagePanel');
if(old)old.remove();

const panel=document.createElement('div');
panel.id='videoManagePanel';
panel.className='video-manage-panel';
panel.innerHTML=`
<div class="video-manage-head">
<div>
<strong>批量管理</strong>
<span id="manageSelectedCount">已选 0 个</span>
</div>
<button type="button" id="manageCloseBtn">×</button>
</div>

<div class="video-manage-section">
<div class="video-manage-label">修改分类</div>
<select id="batchCategorySelect">
<option value="">选择分类</option>
</select>
<button type="button" id="batchCategoryApply" class="btn btn-secondary">
应用分类
</button>
</div>

<div class="video-manage-section">
<div class="video-manage-label">标签</div>
<div class="batch-tag-row">
<input
type="text"
id="batchTagInput"
maxlength="20"
placeholder="输入标签后添加"
>
<button type="button" id="batchTagAddBtn" class="btn btn-secondary">
添加
</button>
</div>
<div id="batchTagList" class="batch-tag-list"></div>
</div>

<div class="video-manage-actions">
<button type="button" id="batchDeleteManageBtn" class="btn btn-secondary danger">
删除选中
</button>
<button type="button" id="batchClearManageBtn" class="btn btn-secondary">
取消选择
</button>
</div>
`;
document.body.appendChild(panel);

const categorySelect=
document.getElementById('batchCategorySelect');

if(categorySelect){
categorySelect.innerHTML=`
<option value="">选择分类</option>
${
state.cats
.filter(c=>c!=='全部')
.map(c=>
`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
)
.join('')
}
`;
}

document.getElementById('manageCloseBtn')
?.addEventListener('click',()=>{
panel.classList.remove('show');
});

document.getElementById('batchCategoryApply')
?.addEventListener('click',applyBatchCategory);

document.getElementById('batchTagAddBtn')
?.addEventListener('click',addBatchTag);

document.getElementById('batchTagInput')
?.addEventListener('keydown',e=>{
if(e.key==='Enter'){
e.preventDefault();
addBatchTag();
}
});

document.getElementById('batchDeleteManageBtn')
?.addEventListener('click',deleteSelectedVideos);

document.getElementById('batchClearManageBtn')
?.addEventListener('click',clearSelection);

renderBatchTagList();
updateVideoManagePanel();
}

function injectVideoManageStyle(){
if(document.getElementById('videoManageStyle'))return;

const style=document.createElement('style');
style.id='videoManageStyle';

style.textContent=`
.video-manage-panel{
position:fixed;
right:18px;
bottom:86px;
z-index:95;
width:min(360px,calc(100vw - 28px));
padding:15px;
background:#202020;
border:1px solid #444;
border-radius:14px;
box-shadow:0 14px 45px rgba(0,0,0,.55);
display:none;
color:#eee;
}

.video-manage-panel.show{
display:block;
}

.video-manage-head{
display:flex;
align-items:center;
justify-content:space-between;
margin-bottom:14px;
}

.video-manage-head strong{
font-size:14px;
}

.video-manage-head span{
margin-left:8px;
font-size:11px;
color:#888;
}

.video-manage-head button{
border:0;
background:transparent;
color:#aaa;
font-size:22px;
cursor:pointer;
line-height:1;
}

.video-manage-section{
padding:12px 0;
border-top:1px solid rgba(255,255,255,.07);
}

.video-manage-label{
font-size:12px;
color:#aaa;
margin-bottom:8px;
}

.video-manage-section select,
.batch-tag-row input{
box-sizing:border-box;
width:100%;
background:#151515;
border:1px solid #383838;
border-radius:8px;
padding:8px 10px;
color:#eee;
outline:none;
}

.video-manage-section select{
margin-bottom:7px;
}

.batch-tag-row{
display:flex;
gap:7px;
}

.batch-tag-row input{
min-width:0;
flex:1;
}

.batch-tag-list{
display:flex;
flex-wrap:wrap;
gap:6px;
margin-top:8px;
}

.batch-tag-chip{
display:inline-flex;
align-items:center;
gap:4px;
border:1px solid rgba(255,255,255,.1);
background:rgba(255,255,255,.06);
color:#ccc;
border-radius:999px;
padding:5px 8px;
font-size:11px;
}

.batch-tag-chip button{
border:0;
background:transparent;
color:#aaa;
padding:0;
cursor:pointer;
font-size:13px;
line-height:1;
}

.video-manage-actions{
display:flex;
gap:7px;
padding-top:12px;
border-top:1px solid rgba(255,255,255,.07);
}

.video-manage-actions button{
flex:1;
}

.video-manage-actions .danger{
color:#ff7777;
}

.batch-tag-row button,
.video-manage-section > button{
flex:none;
white-space:nowrap;
}

@media(max-width:560px){
.video-manage-panel{
right:10px;
bottom:72px;
width:calc(100vw - 20px);
}
}
`;

document.head.appendChild(style);
}

function updateVideoManagePanel(){
const panel=document.getElementById('videoManagePanel');
if(!panel)return;

const count=state.selectedIds.size;

const countEl=
document.getElementById('manageSelectedCount');

if(countEl){
countEl.textContent=`已选 ${count} 个`;
}

if(!count){
panel.classList.remove('show');
return;
}

panel.classList.add('show');

const select=
document.getElementById('batchCategorySelect');

if(select){
select.innerHTML=`
<option value="">选择分类</option>
${
state.cats
.filter(c=>c!=='全部')
.map(c=>
`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
)
.join('')
}
`;

select.value='';
}

renderBatchTagList();
}

function renderBatchTagList(){
const box=document.getElementById('batchTagList');
if(!box)return;

box.innerHTML='';

const tags=new Set();

state.data.videos
.filter(v=>state.selectedIds.has(v.id))
.forEach(v=>{
normalizeTags(v.tags).forEach(tag=>tags.add(tag));
});

[...tags]
.sort((a,b)=>a.localeCompare(b,'zh-CN'))
.forEach(tag=>{
const chip=document.createElement('span');
chip.className='batch-tag-chip';

const text=document.createElement('span');
text.textContent='#'+tag;

const btn=document.createElement('button');
btn.type='button';
btn.textContent='×';
btn.title='从选中视频中移除此标签';

btn.addEventListener('click',()=>{
removeBatchTag(tag);
});

chip.appendChild(text);
chip.appendChild(btn);
box.appendChild(chip);
});
}

function addBatchTag(){
const input=document.getElementById('batchTagInput');
if(!input)return;

const tag=input.value.trim();

if(!tag){
return toast('请输入标签','error');
}

const ids=[...state.selectedIds];

if(!ids.length){
return toast('请先选择视频','error');
}

const oldVideos=state.data.videos.map(v=>({
...v,
tags:normalizeTags(v.tags)
}));

state.data.videos.forEach(v=>{
if(state.selectedIds.has(v.id)){
const tags=normalizeTags(v.tags);

if(!tags.includes(tag)){
tags.push(tag);
}

v.tags=tags;
}
});

saveVideos().then(success=>{
if(!success){
state.data.videos=oldVideos;
return;
}

input.value='';
renderFilterBar();
renderVideos();
updateVideoManagePanel();
toast(`已为 ${ids.length} 个视频添加标签 #${tag}`);
});
}

function removeBatchTag(tag){
const ids=[...state.selectedIds];

if(!ids.length)return;

const oldVideos=state.data.videos.map(v=>({
...v,
tags:normalizeTags(v.tags)
}));

state.data.videos.forEach(v=>{
if(state.selectedIds.has(v.id)){
v.tags=normalizeTags(v.tags)
.filter(t=>t!==tag);
}
});

saveVideos().then(success=>{
if(!success){
state.data.videos=oldVideos;
return;
}

renderFilterBar();
renderVideos();
updateVideoManagePanel();
toast(`已从选中视频移除标签 #${tag}`);
});
}

async function applyBatchCategory(){
const select=document.getElementById('batchCategorySelect');

if(!select)return;

const category=select.value;

if(!category){
return toast('请选择分类','error');
}

const ids=[...state.selectedIds];

if(!ids.length){
return toast('请先选择视频','error');
}

if(!state.cats.includes(category)){
return toast('分类不存在','error');
}

const oldVideos=state.data.videos.map(v=>({
...v,
tags:normalizeTags(v.tags)
}));

state.data.videos.forEach(v=>{
if(state.selectedIds.has(v.id)){
v.category=category;
}
});

if(!(await saveVideos())){
state.data.videos=oldVideos;
return;
}

renderCats();
renderFilterBar();
renderVideos();
updateVideoManagePanel();

toast(`已将 ${ids.length} 个视频移动到「${category}」`);
}

function createSingleVideoEditor(v){
const modalId='videoEditModal';

let modal=document.getElementById(modalId);

if(!modal){
modal=document.createElement('div');
modal.id=modalId;
modal.className='modal-overlay';

modal.innerHTML=`
<div class="modal">
<div class="modal-header">
<h3>编辑视频</h3>
<button
type="button"
class="modal-close"
data-close="videoEditModal">
×
</button>
</div>

<div class="modal-body">
<div class="edit-video-name" id="editVideoName"></div>

<div class="form-group">
<label>分类</label>
<select id="editVideoCategory"></select>
</div>

<div class="form-group">
<label>标签</label>

<div class="edit-tag-input-row">
<input
type="text"
id="editVideoTagInput"
maxlength="20"
placeholder="输入标签"
>
<button
type="button"
id="editVideoTagAdd">
添加
</button>
</div>

<div
id="editVideoTagList"
class="edit-video-tag-list">
</div>
</div>
</div>

<div class="modal-footer">
<button
type="button"
class="btn btn-secondary"
data-close="videoEditModal">
取消
</button>

<button
type="button"
class="btn btn-primary"
id="editVideoSaveBtn">
保存修改
</button>
</div>
</div>
`;

document.body.appendChild(modal);

modal.addEventListener('click',e=>{
if(e.target===modal){
closeModal(modalId);
}
});

modal.querySelectorAll('[data-close]').forEach(btn=>{
btn.addEventListener('click',()=>{
closeModal(btn.dataset.close);
});
});

document.getElementById('editVideoTagAdd')
?.addEventListener('click',()=>{
addSingleEditTag();
});

document.getElementById('editVideoTagInput')
?.addEventListener('keydown',e=>{
if(e.key==='Enter'){
e.preventDefault();
addSingleEditTag();
}
});

document.getElementById('editVideoSaveBtn')
?.addEventListener('click',saveSingleVideoEdit);
}

state.editingVideoId=v.id;
state.editingTags=normalizeTags(v.tags);

const nameEl=
document.getElementById('editVideoName');

if(nameEl){
nameEl.textContent=v.name;
}

const select=
document.getElementById('editVideoCategory');

if(select){
select.innerHTML=
state.cats
.filter(c=>c!=='全部')
.map(c=>
`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
)
.join('');

select.value=
state.cats.includes(v.category)
?v.category
:'未分类';
}

renderSingleEditTags();

openModal(modalId);
}

function renderSingleEditTags(){
const box=document.getElementById('editVideoTagList');
if(!box)return;

box.innerHTML='';

(state.editingTags||[]).forEach(tag=>{
const chip=document.createElement('button');

chip.type='button';
chip.className='edit-video-tag';

chip.textContent=`#${tag} ×`;

chip.addEventListener('click',()=>{
state.editingTags=
(state.editingTags||[])
.filter(t=>t!==tag);

renderSingleEditTags();
});

box.appendChild(chip);
});
}

function addSingleEditTag(){
const input=document.getElementById('editVideoTagInput');

if(!input)return;

const tag=input.value.trim();

if(!tag)return;

if(!state.editingTags){
state.editingTags=[];
}

if(state.editingTags.includes(tag)){
input.value='';
return;
}

state.editingTags.push(tag);
input.value='';

renderSingleEditTags();
}

async function saveSingleVideoEdit(){
const id=state.editingVideoId;

if(!id)return;

const v=state.data.videos.find(x=>x.id===id);

if(!v){
return toast('视频不存在','error');
}

const select=
document.getElementById('editVideoCategory');

const category=
select?.value||'未分类';

const oldCategory=v.category;
const oldTags=normalizeTags(v.tags);

v.category=category;
v.tags=normalizeTags(state.editingTags||[]);

if(!(await saveVideos())){
v.category=oldCategory;
v.tags=oldTags;
return;
}

renderCats();
renderFilterBar();
renderVideos();
updateVideoManagePanel();

closeModal('videoEditModal');

toast('视频信息已更新');
}

function injectSingleEditStyle(){
if(document.getElementById('singleVideoEditStyle'))return;

const style=document.createElement('style');
style.id='singleVideoEditStyle';

style.textContent=`
.edit-video-name{
font-size:13px;
font-weight:600;
line-height:1.5;
margin-bottom:16px;
word-break:break-all;
color:#ddd;
}

.edit-tag-input-row{
display:flex;
gap:7px;
}

.edit-tag-input-row input{
flex:1;
min-width:0;
background:#151515;
border:1px solid #383838;
border-radius:8px;
padding:8px 10px;
color:#eee;
outline:none;
}

.edit-tag-input-row button{
border:1px solid #383838;
background:#222;
color:#ddd;
border-radius:8px;
padding:8px 12px;
cursor:pointer;
}

.edit-video-tag-list{
display:flex;
flex-wrap:wrap;
gap:6px;
margin-top:9px;
}

.edit-video-tag{
border:1px solid rgba(255,255,255,.1);
background:rgba(255,255,255,.06);
color:#ccc;
border-radius:999px;
padding:5px 8px;
font-size:11px;
cursor:pointer;
}

#videoEditModal .form-group{
margin-bottom:16px;
}

#videoEditModal select{
box-sizing:border-box;
width:100%;
background:#151515;
border:1px solid #383838;
border-radius:8px;
padding:9px 10px;
color:#eee;
outline:none;
}
`;

document.head.appendChild(style);
}
