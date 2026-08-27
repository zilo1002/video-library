const CONFIG={
DB_NAME:'VideoLibraryDB',
DB_VERSION:4,
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
uploadTags:[],
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
return this.open().then(db=>new Promise((resolve,reject)=>{
const tx=db.transaction(CONFIG.STORE,'readonly');
const store=tx.objectStore(CONFIG.STORE);
const r=store.get(key);

r.onsuccess=()=>resolve(r.result);
r.onerror=()=>reject(r.error||new Error('IndexedDB 读取失败'));
}));
},

set(key,value){
return this.open().then(db=>new Promise((resolve,reject)=>{
const tx=db.transaction(CONFIG.STORE,'readwrite');
const store=tx.objectStore(CONFIG.STORE);

let request;

try{
request=store.put(value,key);
}catch(e){
reject(e);
return;
}

request.onerror=()=>{
reject(request.error||new Error('IndexedDB 写入失败'));
};

tx.oncomplete=()=>{
resolve();
};

tx.onerror=()=>{
reject(tx.error||request.error||new Error('IndexedDB 写入失败'));
};

tx.onabort=()=>{
reject(
tx.error||
request.error||
new Error('IndexedDB 写入中止')
);
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

if(v.blob instanceof Blob){
return v.blob;
}

if(v.blob){
return new Blob(
[v.blob],
{type:v.type||'video/mp4'}
);
}

if(v.buffer instanceof ArrayBuffer){
return new Blob(
[v.buffer],
{type:v.type||'video/mp4'}
);
}

if(typeof v.data==='string'&&v.data.startsWith('data:')){
return dataURLToBlob(v.data);
}

}catch(e){
console.error('Blob 转换失败:',e);
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
normalizeTags(v.tags).forEach(t=>{
tags.add(t);
});
});

return [...tags].sort(
(a,b)=>a.localeCompare(b,'zh-CN')
);
}

function getCategoryTags(category){
const tags=new Set();

state.data.videos.forEach(v=>{
const cat=v.category||'未分类';

if(category==='全部'||cat===category){
normalizeTags(v.tags).forEach(t=>{
tags.add(t);
});
}
});

return [...tags].sort(
(a,b)=>a.localeCompare(b,'zh-CN')
);
}

function videoMatchesTag(v){
if(state.currentTag==='全部')return true;

return normalizeTags(v.tags)
.includes(state.currentTag);
}

function getCurrentVideos(){
let videos=
state.currentCat==='全部'
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

toast(
'视频库加载失败：'+e.message,
'error'
);
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

await IDB.set(
CONFIG.DB_KEY,
state.data
);

await updateStorage();

return true;

}catch(e){

console.error('保存视频失败:',e);

toast(
'视频保存失败：'+e.message,
'error'
);

return false;
}
}

async function updateStorage(){
let used=0;

for(const v of state.data.videos){

const b=asBlob(v);

used+=
b
?b.size
:Number(v.size)||0;
}

const text=document.getElementById('storageText');

if(text){
text.textContent=
`视频占用 ${formatSize(used)} · ${state.data.videos.length} 个`;
}

try{

const q=
await navigator.storage?.estimate?.();

const quota=q?.quota||0;

const fill=
document.getElementById('storageFill');

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

if(
!e.target.closest('.cat-del-btn')
){
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

const title=
document.getElementById('pageTitle');

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

if(
document.getElementById(
'videoLibraryDynamicStyle'
)
)return;

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
grid-template-columns:
repeat(
auto-fill,
minmax(170px,1fr)
);
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

.batch-edit-section{
margin-top:10px;
}

.batch-edit-row{
display:flex;
gap:8px;
align-items:center;
flex-wrap:wrap;
}

.batch-edit-row select,
.batch-edit-row input{
min-height:38px;
box-sizing:border-box;
background:#151515;
border:1px solid #333;
border-radius:8px;
color:#fff;
padding:7px 9px;
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
padding:5px 8px;
border-radius:999px;
background:#202020;
border:1px solid #333;
color:#ccc;
font-size:11px;
cursor:pointer;
}

.batch-tag-chip.active{
border-color:#777;
background:#303030;
color:#fff;
}

.video-edit-btn{
position:absolute;
right:8px;
bottom:8px;
z-index:5;
border:1px solid rgba(255,255,255,.15);
background:rgba(0,0,0,.7);
color:#fff;
border-radius:7px;
padding:5px 8px;
font-size:11px;
cursor:pointer;
}

.video-select{
position:absolute;
top:8px;
left:8px;
z-index:6;
width:30px;
height:30px;
border-radius:8px;
background:rgba(0,0,0,.65);
display:flex;
align-items:center;
justify-content:center;
cursor:pointer;
}

.video-select input{
width:18px;
height:18px;
cursor:pointer;
margin:0;
}

#batchActionBar{
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
}

#batchActionBar button{
white-space:nowrap;
}

.batch-edit-btn{
padding:7px 10px;
font-size:12px;
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
bottom:12px;
padding:8px;
gap:5px;
}

#batchActionBar button{
padding:7px 8px;
font-size:11px;
}

#batchActionBar #batchCount{
font-size:11px;
}

.video-select{
display:flex;
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
document.getElementById('content');

if(!content)return;

bar=document.createElement('div');

bar.id='videoLibraryTools';
bar.className='video-library-tools';

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
document.createElement('button');

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

bar.appendChild(viewSwitch);

const tags=
getCategoryTags(
state.currentCat
);

if(tags.length){

const tagFilter=
document.createElement('div');

tagFilter.className=
'video-tag-filter';

const label=
document.createElement('span');

label.style.cssText=
'font-size:11px;color:#777';

label.textContent='标签';

tagFilter.appendChild(label);

const all=
document.createElement('button');

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
document.createElement('button');

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

bar.appendChild(tagFilter);
}
}

function renderVideos(){

const box=
document.getElementById('content');

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

function toggleVideoSelection(id,checked){

if(checked){
state.selectedIds.add(id);
}else{
state.selectedIds.delete(id);
}

updateBatchBar();
}

function createVideoSelect(v){

const label=
document.createElement('label');

label.className='video-select';
label.title='选择视频';

const input=
document.createElement('input');

input.type='checkbox';
input.checked=
state.selectedIds.has(v.id);

input.addEventListener(
'click',
e=>e.stopPropagation()
);

input.addEventListener(
'change',
e=>{

e.stopPropagation();

toggleVideoSelection(
v.id,
e.target.checked
);

renderVideos();
updateBatchBar();

}
);

label.appendChild(input);

return label;
}

async function updateVideoMetadata(
id,
category,
tags
){

const v=
state.data.videos.find(
x=>x.id===id
);

if(!v)return false;

const oldCategory=
v.category||'未分类';

const oldTags=
normalizeTags(v.tags);

v.category=
category||'未分类';

v.tags=
normalizeTags(tags);

if(await saveVideos()){

renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();

return true;
}

v.category=oldCategory;
v.tags=oldTags;

return false;
}

function openVideoEdit(v){

const existing=
document.getElementById(
'videoEditModal'
);

if(existing){
existing.remove();
}

const modal=
document.createElement('div');

modal.className='modal-overlay';
modal.id='videoEditModal';

const modalBox=
document.createElement('div');

modalBox.className='modal modal-sm';

const categories=
state.cats
.filter(c=>c!=='全部')
.map(c=>`
<option value="${escapeHtml(c)}"
${
(v.category||'未分类')===c
?'selected'
:''
}>
${escapeHtml(c)}
</option>
`)
.join('');

modalBox.innerHTML=`
<div class="modal-header">
<h3>✏️ 编辑视频</h3>
<button
class="modal-close"
type="button"
aria-label="关闭">
×
</button>
</div>

<div class="modal-body">

<div class="form-group">

<label>视频</label>

<div style="
font-size:13px;
color:#aaa;
word-break:break-all;
">
${escapeHtml(v.name)}
</div>

</div>

<div class="form-group">

<label for="editVideoCategory">
分类
</label>

<select id="editVideoCategory">
${categories}
</select>

</div>

<div class="form-group">

<label>标签</label>

<div class="tag-editor">

<input
id="editVideoTagInput"
type="text"
maxlength="20"
placeholder="输入标签后添加"
>

<button
type="button"
id="editVideoTagAdd">
添加
</button>

</div>

<div
class="upload-tag-list"
id="editVideoTagList">
</div>

</div>

</div>

<div class="modal-footer">

<button
class="btn btn-secondary"
type="button"
id="editVideoCancel">
取消
</button>

<button
class="btn btn-primary"
type="button"
id="editVideoSave">
保存
</button>

</div>
`;

modal.appendChild(modalBox);
document.body.appendChild(modal);

let tags=
normalizeTags(v.tags);

const tagList=
modal.querySelector(
'#editVideoTagList'
);

const renderEditTags=()=>{

tagList.innerHTML='';

tags.forEach(tag=>{

const btn=
document.createElement('button');

btn.type='button';
btn.className=
'upload-tag-remove';

btn.textContent=
`#${tag} ×`;

btn.addEventListener(
'click',
()=>{
tags=
tags.filter(
x=>x!==tag
);

renderEditTags();
}
);

tagList.appendChild(btn);

});
};

const addTag=()=>{

const input=
modal.querySelector(
'#editVideoTagInput'
);

const tag=
input.value.trim();

if(!tag)return;

if(!tags.includes(tag)){
tags.push(tag);
}

input.value='';

renderEditTags();
};

modal.querySelector(
'#editVideoTagAdd'
).addEventListener(
'click',
addTag
);

modal.querySelector(
'#editVideoTagInput'
).addEventListener(
'keydown',
e=>{

if(e.key==='Enter'){

e.preventDefault();

addTag();

}

}
);

modal.querySelector(
'#editVideoCancel'
).addEventListener(
'click',
()=>{
modal.remove();
}
);

modal.querySelector(
'.modal-close'
).addEventListener(
'click',
()=>{
modal.remove();
}
);

modal.addEventListener(
'click',
e=>{
if(e.target===modal){
modal.remove();
}
}
);

modal.querySelector(
'#editVideoSave'
).addEventListener(
'click',
async()=>{

const btn=
modal.querySelector(
'#editVideoSave'
);

const category=
modal.querySelector(
'#editVideoCategory'
).value||'未分类';

btn.disabled=true;
btn.textContent='保存中…';

if(
await updateVideoMetadata(
v.id,
category,
tags
)
){

modal.remove();

toast('视频信息已更新');

}else{

btn.disabled=false;
btn.textContent='保存';

}

}
);

renderEditTags();

openModal('videoEditModal');
}

function addVideoEditButton(card,v){

const btn=
document.createElement('button');

btn.type='button';
btn.className='video-edit-btn';
btn.title='编辑分类和标签';
btn.textContent='编辑';

btn.addEventListener(
'click',
e=>{

e.stopPropagation();

openVideoEdit(v);

}
);

card.querySelector(
'.video-thumb'
)?.appendChild(btn);

return btn;
}

function renderGrid(vs,box){

const grid=document.createElement('div');

grid.className='video-grid';

vs.slice().reverse().forEach(v=>{

const card=document.createElement('div');

card.className='video-card';

const src=videoUrl(v);

const thumb=v.thumbnail||'';

const checked=
state.selectedIds.has(v.id);

card.innerHTML=`
<div class="video-thumb">

${
thumb
?`<img
src="${escapeHtml(thumb)}"
alt="视频缩略图">`
:
(
src
?'<video muted playsinline preload="metadata"></video>'
:'<div class="thumb-placeholder">🎬</div>'
)
}

<div class="play-icon">▶</div>

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
${escapeHtml(v.category||'未分类')}
</span>

<div class="video-tags">
${normalizeTags(v.tags).map(t=>
`<span class="video-tag">
${escapeHtml(t)}
</span>`
).join('')}
</div>

</div>
`;

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

const select=
createVideoSelect(v);

if(checked){
select.classList.add('checked');
}

card.querySelector(
'.video-thumb'
)?.appendChild(select);

addVideoEditButton(card,v);

const checkbox=
select.querySelector('input');

checkbox.addEventListener(
'change',
()=>{
select.classList.toggle(
'checked',
checkbox.checked
);
}
);

card.addEventListener(
'click',
e=>{

if(
e.target.closest('.delete-btn')||
e.target.closest('.video-select')||
e.target.closest('.video-edit-btn')
){
return;
}

playVideo(v);

}
);

card.querySelector(
'.delete-btn'
).addEventListener(
'click',
e=>{
e.stopPropagation();
deleteVideo(v.id);
}
);

grid.appendChild(card);

});

box.appendChild(grid);
}

function renderTimeline(vs,box){

const timeline=
document.createElement('div');

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
document.createElement('div');

item.className=
'timeline-item';

const dateLabel=
dateKey===lastDate
?''
:`${date.getMonth()+1}月${date.getDate()}日`;

lastDate=dateKey;

const src=videoUrl(v);

const thumb=v.thumbnail||'';

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
?`<img
src="${escapeHtml(thumb)}"
alt="">`
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
`<span class="video-tag">
${escapeHtml(t)}
</span>`
).join('')}
</div>

</div>

</div>
`;

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

const select=
createVideoSelect(v);

item.querySelector(
'.timeline-thumb'
)?.appendChild(select);

addVideoEditButton(
item.querySelector('.timeline-card'),
v
);

item.querySelector(
'.timeline-thumb'
).addEventListener(
'click',
e=>{
if(e.target.closest('.video-select'))return;
playVideo(v);
}
);

item.querySelector(
'.timeline-title'
).addEventListener(
'click',
()=>playVideo(v)
);

timeline.appendChild(item);

});

box.appendChild(timeline);
}

function renderTagView(vs,box){

const wrapper=
document.createElement('div');

wrapper.className='tag-view';

const groups=new Map();

vs.forEach(v=>{

const tags=
normalizeTags(v.tags);

if(!tags.length){

if(!groups.has('__untagged__')){
groups.set(
'__untagged__',
[]
);
}

groups.get(
'__untagged__'
).push(v);

}else{

tags.forEach(tag=>{

if(!groups.has(tag)){
groups.set(tag,[]);
}

groups.get(tag).push(v);

});

}

});

const ordered=
[...groups.keys()].sort(
(a,b)=>{

if(a==='__untagged__')return 1;

if(b==='__untagged__')return -1;

return a.localeCompare(
b,
'zh-CN'
);

}
);

ordered.forEach(tag=>{

const group=
document.createElement('div');

group.className='tag-group';

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
document.createElement('div');

videos.className=
'tag-group-videos';

groups.get(tag).forEach(v=>{

videos.appendChild(
createMiniCard(v)
);

});

group.appendChild(videos);

wrapper.appendChild(group);

});

box.appendChild(wrapper);
}

function createMiniCard(v){

const card=
document.createElement('div');

card.className='video-card';

const src=videoUrl(v);

const thumb=v.thumbnail||'';

card.innerHTML=`
<div class="video-thumb">

${
thumb
?`<img
src="${escapeHtml(thumb)}"
alt="">`
:
src
?'<video muted playsinline preload="metadata"></video>'
:'<div class="thumb-placeholder">🎬</div>'
}

<div class="play-icon">▶</div>

</div>

<div class="video-info">

<div
class="v-title"
title="${escapeHtml(v.name)}">
${escapeHtml(v.name)}
</div>

<div class="v-meta">

<span>
${formatSize(v.size)}
</span>

<span>
${formatDate(v.createdAt)}
</span>

</div>

<span class="v-cat">
${escapeHtml(v.category||'未分类')}
</span>

<div class="video-tags">

${normalizeTags(v.tags).map(t=>
`<span class="video-tag">
${escapeHtml(t)}
</span>`
).join('')}

</div>

</div>
`;

const vid=
card.querySelector('video');

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

addVideoEditButton(card,v);

card.addEventListener(
'click',
e=>{

if(
e.target.closest('.video-edit-btn')
)return;

playVideo(v);

}
);

return card;
}

function playVideo(v){

const src=videoUrl(v);

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

state.currentPlayerId=v.id;

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
).textContent=v.name;

document.getElementById(
'playerMeta'
).textContent=
`${v.category||'未分类'} · ${formatSize(v.size)} · ${new Date(v.createdAt).toLocaleString()}`;

openModal('playerModal');

video.play().catch(()=>{});
}

function downloadVideo(v){

const b=asBlob(v);

if(!b){
return toast(
'找不到原视频文件',
'error'
);
}

const u=
URL.createObjectURL(b);

const a=
document.createElement('a');

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

const ids=
[...state.selectedIds];

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

downloadVideo(videos[0]);

return;
}

let success=0;

for(const v of videos){

const b=asBlob(v);

if(!b)continue;

const u=
URL.createObjectURL(b);

const a=
document.createElement('a');

a.href=u;

a.download=
v.name||'video.mp4';

document.body.appendChild(a);

a.click();

a.remove();

success++;

await new Promise(
resolve=>setTimeout(
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

async function deleteVideo(id){

if(!confirm(
'确定删除这个视频？'
))return;

const old=
state.data.videos;

state.data.videos=
old.filter(
v=>v.id!==id
);

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

const ids=
[...state.selectedIds];

if(!ids.length){

return toast(
'请先选择视频',
'error'
);

}

const count=ids.length;

if(!confirm(
`确定删除选中的 ${count} 个视频？`
)){
return;
}

const oldVideos=
state.data.videos;

state.data.videos=
oldVideos.filter(
v=>!state.selectedIds.has(v.id)
);

if(await saveVideos()){

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

}else{

state.data.videos=oldVideos;

}
}

function selectAllCurrent(){

const videos=
getCurrentVideos();

if(!videos.length)return;

const allSelected=
videos.every(
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

function createBatchEditModal(){

const existing=
document.getElementById(
'batchEditModal'
);

if(existing){
existing.remove();
}

const modal=
document.createElement('div');

modal.className=
'modal-overlay';

modal.id='batchEditModal';

const box=
document.createElement('div');

box.className=
'modal modal-sm';

const categories=
state.cats
.filter(c=>c!=='全部')
.map(c=>
`<option value="${escapeHtml(c)}">
${escapeHtml(c)}
</option>`
)
.join('');

box.innerHTML=`
<div class="modal-header">

<h3>
✏️ 批量编辑
</h3>

<button
class="modal-close"
type="button"
id="batchEditClose">
×
</button>

</div>

<div class="modal-body">

<div style="
font-size:13px;
color:#aaa;
margin-bottom:14px;
">
已选择
<strong
id="batchEditCount"
style="color:#fff">
0
</strong>
个视频
</div>

<div class="form-group">

<label>
统一修改分类
</label>

<select id="batchEditCategory">
<option value="">
不修改分类
</option>

${categories}

</select>

</div>

<div class="form-group">

<label>
标签操作
</label>

<select id="batchTagAction">

<option value="none">
不修改标签
</option>

<option value="add">
加入标签
</option>

<option value="replace">
替换为这些标签
</option>

<option value="remove">
移除标签
</option>

<option value="clear">
清空全部标签
</option>

</select>

</div>

<div class="form-group">

<label>
标签
</label>

<div class="tag-editor">

<input
id="batchTagInput"
type="text"
maxlength="20"
placeholder="输入标签后添加"
>

<button
type="button"
id="batchTagAdd">
添加
</button>

</div>

<div
class="batch-tag-list"
id="batchTagList">
</div>

</div>

</div>

<div class="modal-footer">

<button
class="btn btn-secondary"
type="button"
id="batchEditCancel">
取消
</button>

<button
class="btn btn-primary"
type="button"
id="batchEditSave">
应用修改
</button>

</div>
`;

modal.appendChild(box);

document.body.appendChild(modal);

const ids=
[...state.selectedIds];

const countEl=
modal.querySelector(
'#batchEditCount'
);

countEl.textContent=
ids.length;

let tags=[];

const list=
modal.querySelector(
'#batchTagList'
);

function renderBatchTags(){

list.innerHTML='';

tags.forEach(tag=>{

const chip=
document.createElement('button');

chip.type='button';

chip.className=
'batch-tag-chip active';

chip.textContent=
`#${tag} ×`;

chip.addEventListener(
'click',
()=>{
tags=
tags.filter(
x=>x!==tag
);

renderBatchTags();
}
);

list.appendChild(chip);

});

}

function addBatchTag(){

const input=
modal.querySelector(
'#batchTagInput'
);

const tag=
input.value.trim();

if(!tag)return;

if(!tags.includes(tag)){
tags.push(tag);
}

input.value='';

renderBatchTags();
}

modal.querySelector(
'#batchTagAdd'
).addEventListener(
'click',
addBatchTag
);

modal.querySelector(
'#batchTagInput'
).addEventListener(
'keydown',
e=>{

if(e.key==='Enter'){

e.preventDefault();

addBatchTag();

}

}
);

const close=()=>{
modal.remove();
};

modal.querySelector(
'#batchEditClose'
).addEventListener(
'click',
close
);

modal.querySelector(
'#batchEditCancel'
).addEventListener(
'click',
close
);

modal.addEventListener(
'click',
e=>{
if(e.target===modal){
close();
}
}
);

modal.querySelector(
'#batchEditSave'
).addEventListener(
'click',
async()=>{

const saveBtn=
modal.querySelector(
'#batchEditSave'
);

const category=
modal.querySelector(
'#batchEditCategory'
).value;

const action=
modal.querySelector(
'#batchTagAction'
).value;

saveBtn.disabled=true;

saveBtn.textContent=
'保存中…';

const selected=
state.data.videos.filter(
v=>ids.includes(v.id)
);

const snapshots=
selected.map(v=>({
id:v.id,
category:v.category,
tags:normalizeTags(v.tags)
}));

try{

selected.forEach(v=>{

if(category){
v.category=category;
}

if(action==='add'){

v.tags=
normalizeTags([
...normalizeTags(v.tags),
...tags
]);

}else if(action==='replace'){

v.tags=
normalizeTags(tags);

}else if(action==='remove'){

v.tags=
normalizeTags(v.tags)
.filter(
t=>!tags.includes(t)
);

}else if(action==='clear'){

v.tags=[];

}

});

if(!(await saveVideos())){

snapshots.forEach(s=>{

const v=
state.data.videos.find(
x=>x.id===s.id
);

if(v){

v.category=s.category;
v.tags=s.tags;

}

});

saveBtn.disabled=false;

saveBtn.textContent=
'应用修改';

return;
}

renderCats();

renderFilterBar();

renderVideos();

updateBatchBar();

close();

toast(
`已修改 ${selected.length} 个视频`
);

}catch(e){

console.error(e);

snapshots.forEach(s=>{

const v=
state.data.videos.find(
x=>x.id===s.id
);

if(v){

v.category=s.category;
v.tags=s.tags;

}

});

saveBtn.disabled=false;

saveBtn.textContent=
'应用修改';

toast(
'批量修改失败：'+e.message,
'error'
);

}

}
);

renderBatchTags();

openModal('batchEditModal');
}

function updateBatchBar(){

let bar=
document.getElementById(
'batchActionBar'
);

const selectedCount=
state.selectedIds.size;

const currentVideos=
getCurrentVideos();

if(!bar){

bar=
document.createElement('div');

bar.id='batchActionBar';

bar.innerHTML=`

<span
id="batchCount">
</span>

<button
id="batchSelectAll"
class="btn btn-secondary batch-edit-btn">
全选
</button>

<button
id="batchEdit"
class="btn btn-secondary batch-edit-btn">
✏️ 编辑
</button>

<button
id="batchDownload"
class="btn btn-primary batch-edit-btn">
⬇ 下载
</button>

<button
id="batchDelete"
class="btn btn-secondary batch-edit-btn"
style="color:#ff6b6b">
删除
</button>

<button
id="batchClear"
class="btn btn-secondary batch-edit-btn">
取消
</button>
`;

document.body.appendChild(bar);

document.getElementById(
'batchSelectAll'
).addEventListener(
'click',
selectAllCurrent
);

document.getElementById(
'batchEdit'
).addEventListener(
'click',
createBatchEditModal
);

document.getElementById(
'batchDownload'
).addEventListener(
'click',
downloadSelectedVideos
);

document.getElementById(
'batchDelete'
).addEventListener(
'click',
deleteSelectedVideos
);

document.getElementById(
'batchClear'
).addEventListener(
'click',
clearSelection
);

}

if(!selectedCount){

bar.style.display='none';

return;
}

bar.style.display='flex';

document.getElementById(
'batchCount'
).textContent=
`已选 ${selectedCount} 个`;

const allSelected=
currentVideos.length>0&&
currentVideos.every(
v=>state.selectedIds.has(v.id)
);

document.getElementById(
'batchSelectAll'
).textContent=
allSelected
?'取消全选'
:'全选';
}

function isDuplicateVideo(file){

if(!file)return false;

return state.data.videos.some(v=>{

const sameName=
String(v.name||'')
.trim()
.toLowerCase()===
String(file.name||'')
.trim()
.toLowerCase();

const sameSize=
Number(v.size||0)===
Number(file.size||0);

return sameName&&sameSize;

});
}

function getSkipDuplicateSetting(){

const checkbox=
document.getElementById(
'skipUploadedVideos'
);

return checkbox
?checkbox.checked
:true;
}

function injectDuplicateOption(){

if(
document.getElementById(
'skipUploadedVideos'
)
)return;

const fileDrop=
document.getElementById(
'fileDrop'
);

if(!fileDrop)return;

const wrap=
document.createElement('label');

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
">

<span>

已上传的视频不显示

<small
style="
display:block;
margin-top:2px;
font-size:11px;
opacity:.6;
">

按「文件名 + 文件大小」
判断重复视频

</small>

</span>
`;

fileDrop.insertAdjacentElement(
'afterend',
wrap
);

const checkbox=
document.getElementById(
'skipUploadedVideos'
);

checkbox?.addEventListener(
'change',
()=>{

if(state.selectedFiles.length){
refreshSelectedFilesDisplay();
}

}
);
}

function refreshSelectedFilesDisplay(){

const files=
[...state.selectedFiles];

const nameEl=
document.getElementById(
'fileName'
);

const btn=
document.getElementById(
'uploadConfirmBtn'
);

if(!nameEl||!btn)return;

if(!files.length){

nameEl.textContent='';

btn.disabled=true;

btn.textContent='上传';

return;
}

const totalSize=
files.reduce(
(sum,f)=>sum+f.size,
0
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

if(
document.getElementById(
'uploadTags'
)
)return;

const select=
document.getElementById(
'uploadCat'
);

if(!select)return;

const group=
document.createElement('div');

group.className='upload-tags';

group.id='uploadTags';

group.innerHTML=`

<label class="upload-tags-label">
添加标签
</label>

<div class="upload-tag-input-row">

<input
type="text"
id="uploadTagInput"
maxlength="20"
placeholder="例如：重点、灵感、待整理">

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

select.closest(
'.form-group'
)?.insertAdjacentElement(
'afterend',
group
);

document.getElementById(
'uploadTagAddBtn'
)?.addEventListener(
'click',
addUploadTag
);

document.getElementById(
'uploadTagInput'
)?.addEventListener(
'keydown',
e=>{

if(e.key==='Enter'){

e.preventDefault();

addUploadTag();

}

}
);
}

function addUploadTag(){

const input=
document.getElementById(
'uploadTagInput'
);

if(!input)return;

const tag=
input.value.trim();

if(!tag)return;

if(!state.uploadTags){
state.uploadTags=[];
}

if(
state.uploadTags.includes(tag)
){

input.value='';

return;
}

state.uploadTags.push(tag);

input.value='';

renderUploadTags();
}

function renderUploadTags(){

const box=
document.getElementById(
'uploadTagList'
);

if(!box)return;

box.innerHTML='';

(state.uploadTags||[])
.forEach(tag=>{

const btn=
document.createElement('button');

btn.type='button';

btn.className=
'upload-tag-remove';

btn.textContent=
`#${tag} ×`;

btn.addEventListener(
'click',
()=>{

state.uploadTags=
state.uploadTags.filter(
t=>t!==tag
);

renderUploadTags();

}
);

box.appendChild(btn);

});
}

function openUpload(){

const s=
document.getElementById(
'uploadCat'
);

if(s){

s.innerHTML=
state.cats
.filter(
c=>c!=='全部'
)
.map(c=>`

<option
value="${escapeHtml(c)}">
${escapeHtml(c)}
</option>

`)
.join('');

}

state.selectedFiles=[];

state.uploadTags=[];

const fileInput=
document.getElementById(
'fileInput'
);

if(fileInput){

fileInput.multiple=true;

fileInput.setAttribute(
'accept',
'video/mp4,video/*'
);

}

const nameEl=
document.getElementById(
'fileName'
);

if(nameEl){
nameEl.textContent='';
}

const btn=
document.getElementById(
'uploadConfirmBtn'
);

if(btn){

btn.disabled=true;

btn.textContent='上传';

}

injectDuplicateOption();

createUploadTagEditor();

renderUploadTags();

const duplicateCheckbox=
document.getElementById(
'skipUploadedVideos'
);

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

const skipDuplicate=
getSkipDuplicateSetting();

for(const file of files){

if(
!file.type.startsWith('video/')&&
!/\.mp4$/i.test(file.name)
){

toast(
`${file.name} 不是有效的视频文件`,
'error'
);

continue;
}

if(
file.size>CONFIG.MAX_FILE_SIZE
){

toast(
`${file.name} 超过 2GB，暂不建议导入`,
'error'
);

continue;
}

if(
skipDuplicate&&
isDuplicateVideo(file)
){

duplicateCount++;

continue;
}

valid.push(file);

}

if(duplicateCount>0){

if(valid.length){

toast(
`已过滤 ${duplicateCount} 个已上传视频`,
'error'
);

}else{

toast(
`选择的视频都已上传，共过滤 ${duplicateCount} 个`,
'error'
);

}

}

if(!valid.length){

state.selectedFiles=[];

const nameEl=
document.getElementById(
'fileName'
);

const btn=
document.getElementById(
'uploadConfirmBtn'
);

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

const e=
await navigator.storage?.estimate?.();

if(e?.quota){

const available=
e.quota-(e.usage||0);

if(
n+CONFIG.STORAGE_RESERVE>
available
){

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

async function createThumbnail(file){

return new Promise(resolve=>{

const u=
URL.createObjectURL(file);

const v=
document.createElement('video');

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
Math.max(
0,
(v.duration||.15)/10
)
);

}catch{}

};

v.onseeked=()=>{

try{

const c=
document.createElement('canvas');

const w=
Math.min(
640,
v.videoWidth||640
);

const h=
Math.max(
1,
Math.round(
w*
(v.videoHeight||360)/
(v.videoWidth||640)
)
);

c.width=w;

c.height=h;

const ctx=
c.getContext('2d');

ctx.drawImage(
v,
0,
0,
w,
h
);

finish(
c.toDataURL(
'image/jpeg',
.72
)
);

}catch{

finish('');

}

};

v.onerror=()=>finish('');

v.src=u;

setTimeout(
()=>finish(''),
5000
);

});
}

async function doUpload(){

const files=
[...state.selectedFiles];

if(!files.length)return;

const btn=
document.getElementById(
'uploadConfirmBtn'
);

btn.disabled=true;

try{

const skipDuplicate=
getSkipDuplicateSetting();

const uploadFiles=[];

let duplicateCount=0;

for(const file of files){

if(
skipDuplicate&&
isDuplicateVideo(file)
){

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

const totalSize=
uploadFiles.reduce(
(sum,f)=>sum+f.size,
0
);

btn.textContent=
'检查空间…';

if(
!(await checkSpace(totalSize))
){

btn.disabled=false;

return;
}

const selectedCategory=
document.getElementById(
'uploadCat'
)?.value||
'未分类';

const uploadTags=
normalizeTags(
state.uploadTags||[]
);

const newVideos=[];

for(
let i=0;
i<uploadFiles.length;
i++
){

const file=
uploadFiles[i];

btn.textContent=
uploadFiles.length>1
?`生成缩略图 ${i+1}/${uploadFiles.length}…`
:'生成缩略图…';

const thumbnail=
await createThumbnail(file);

btn.textContent=
uploadFiles.length>1
?`保存 ${i+1}/${uploadFiles.length}…`
:'保存原文件…';

const blob=
file.slice(
0,
file.size,
file.type||
'video/mp4'
);

const v={

id:
Date.now().toString(36)+
Math.random()
.toString(36)
.slice(2,10),

name:file.name,

category:selectedCategory,

tags:[...uploadTags],

blob,

size:file.size,

type:file.type||
'video/mp4',

createdAt:
Date.now()+i,

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

await IDB.set(
CONFIG.DB_KEY,
data
);

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

btn.disabled=
state.selectedFiles.length===0;

}
}

function deleteCat(name){

if(
name==='全部'||
name==='未分类'
){
return;
}

const count=
state.data.videos.filter(
v=>(v.category||'未分类')===name
).length;

const message=
count
?`删除分类「${name}」后，${count} 个视频会移动到「未分类」，确定继续吗？`
:`确定删除分类「${name}」吗？`;

if(!confirm(message)){
return;
}

state.data.videos.forEach(v=>{

if(
(v.category||'未分类')===name
){
v.category='未分类';
}

});

state.cats=
state.cats.filter(
c=>c!==name
);

if(
state.currentCat===name
){
state.currentCat='全部';

const title=
document.getElementById(
'pageTitle'
);

if(title){
title.textContent='全部视频';
}
}

saveCats();

saveVideos().then(ok=>{

if(!ok)return;

renderCats();
renderFilterBar();
renderVideos();
populateUploadCategories();

toast(
`已删除分类「${name}」`
);

});
}

function openCategoryManager(){

const body=
document.getElementById(
'catManageBody'
);

if(!body)return;

body.innerHTML='';

const list=
document.createElement('div');

list.style.cssText=`
display:flex;
flex-direction:column;
gap:8px;
`;

state.cats
.filter(c=>c!=='全部')
.forEach(category=>{

const row=
document.createElement('div');

row.style.cssText=`
display:flex;
align-items:center;
justify-content:space-between;
gap:10px;
padding:10px 12px;
border:1px solid rgba(255,255,255,.08);
border-radius:9px;
background:rgba(255,255,255,.03);
`;

const left=
document.createElement('div');

left.style.cssText=`
display:flex;
align-items:center;
gap:8px;
min-width:0;
`;

left.innerHTML=`
<span>${icon(category)}</span>
<span style="
overflow:hidden;
text-overflow:ellipsis;
white-space:nowrap;
">
${escapeHtml(category)}
</span>
`;

row.appendChild(left);

if(
category!=='未分类'
){

const del=
document.createElement('button');

del.type='button';
del.className='btn btn-secondary';

del.style.cssText=`
padding:6px 9px;
font-size:11px;
`;

del.textContent='删除';

del.addEventListener(
'click',
()=>{

deleteCat(category);

openCategoryManager();

}
);

row.appendChild(del);

}

list.appendChild(row);

});

body.appendChild(list);

openModal('catManageModal');
}

function setupBackup(){

document.getElementById(
'exportBtn'
)?.addEventListener(
'click',
exportBackup
);

document.getElementById(
'importBtn'
)?.addEventListener(
'click',
()=>{

resetImportModal();

openModal('importModal');

}
);

const drop=
document.getElementById(
'importDrop'
);

const input=
document.getElementById(
'importInput'
);

if(drop&&input){

drop.addEventListener(
'click',
()=>{
input.click();
}
);

drop.addEventListener(
'dragover',
e=>{
e.preventDefault();
drop.classList.add('dragover');
}
);

drop.addEventListener(
'dragleave',
()=>{
drop.classList.remove('dragover');
}
);

drop.addEventListener(
'drop',
e=>{

e.preventDefault();

drop.classList.remove(
'dragover'
);

const file=
e.dataTransfer.files?.[0];

if(file){
handleImportFile(file);
}

}
);

input.addEventListener(
'change',
e=>{

const file=
e.target.files?.[0];

if(file){
handleImportFile(file);
}

}
);

}

document.getElementById(
'importConfirmBtn'
)?.addEventListener(
'click',
importBackup
);

}

function resetImportModal(){

state.importData=null;

const input=
document.getElementById(
'importInput'
);

if(input){
input.value='';
}

const name=
document.getElementById(
'importFileName'
);

if(name){
name.textContent='';
}

const btn=
document.getElementById(
'importConfirmBtn'
);

if(btn){

btn.disabled=true;
btn.textContent='恢复';

}

}

async function handleImportFile(file){

if(
!file.name.toLowerCase().endsWith(
'.json'
)&&
file.type!=='application/json'
){

toast(
'请选择 JSON 备份文件',
'error'
);

return;
}

try{

const text=
await file.text();

const data=
JSON.parse(text);

if(
!data||
typeof data!=='object'
){

throw new Error(
'备份格式无效'
);

}

if(
!Array.isArray(data.videos)
){

throw new Error(
'备份中没有视频数据'
);

}

state.importData={
videos:data.videos,
cats:
Array.isArray(data.cats)
?data.cats
:null
};

const name=
document.getElementById(
'importFileName'
);

if(name){

name.textContent=
`${file.name} · ${data.videos.length} 个视频`;

}

const btn=
document.getElementById(
'importConfirmBtn'
);

if(btn){
btn.disabled=false;
}

}catch(e){

console.error(e);

state.importData=null;

toast(
'读取备份失败：'+e.message,
'error'
);

}
}

async function exportBackup(){

try{

const videos=
state.data.videos.map(v=>{

const blob=
asBlob(v);

return{
id:v.id,
name:v.name,
category:v.category||'未分类',
tags:normalizeTags(v.tags),
size:v.size||blob?.size||0,
type:v.type||blob?.type||'video/mp4',
createdAt:v.createdAt||v.date||Date.now(),
data:blob
?null
:''
};

});

const payload={
version:2,
exportedAt:Date.now(),
cats:[...state.cats],
videos
};

const serialized=[];

for(
const item of payload.videos
){

const original=
state.data.videos.find(
v=>v.id===item.id
);

const blob=
original
?asBlob(original)
:null;

let data='';

if(blob){

data=
await blobToDataURL(blob);

}

serialized.push({
...item,
data
});

}

const finalPayload={
...payload,
videos:serialized
};

const json=
JSON.stringify(
finalPayload
);

const blob=
new Blob(
[json],
{type:'application/json'}
);

const url=
URL.createObjectURL(blob);

const a=
document.createElement('a');

a.href=url;

a.download=
`video-library-backup-${formatFileDate(
Date.now()
)}.json`;

document.body.appendChild(a);

a.click();

a.remove();

setTimeout(
()=>{
URL.revokeObjectURL(url);
},
1000
);

toast(
`备份已导出，共 ${state.data.videos.length} 个视频`
);

}catch(e){

console.error(e);

toast(
'导出失败：'+e.message,
'error'
);

}
}

function formatFileDate(ts){

const d=new Date(ts);

const y=d.getFullYear();
const m=String(
d.getMonth()+1
).padStart(2,'0');

const day=String(
d.getDate()
).padStart(2,'0');

const h=String(
d.getHours()
).padStart(2,'0');

const min=String(
d.getMinutes()
).padStart(2,'0');

return `${y}${m}${day}-${h}${min}`;
}

function blobToDataURL(blob){

return new Promise(
(resolve,reject)=>{

const reader=
new FileReader();

reader.onload=()=>{
resolve(
reader.result
);
};

reader.onerror=()=>{
reject(
reader.error||
new Error(
'文件读取失败'
)
);
};

reader.readAsDataURL(blob);

}
);
}

function dataURLToBlob(dataURL){

try{

const parts=
dataURL.split(',');

if(parts.length<2){
return null;
}

const meta=parts[0];

const data=parts
.slice(1)
.join(',');

const mime=
meta.match(
/data:([^;]+)/
)?.[1]||
'application/octet-stream';

const binary=
atob(data);

const bytes=
new Uint8Array(
binary.length
);

for(
let i=0;
i<binary.length;
i++
){
bytes[i]=
binary.charCodeAt(i);
}

return new Blob(
[bytes],
{type:mime}
);

}catch(e){

console.error(
'DataURL 转 Blob 失败:',
e
);

return null;
}

}

async function importBackup(){

const data=
state.importData;

if(!data)return;

const btn=
document.getElementById(
'importConfirmBtn'
);

if(btn){

btn.disabled=true;
btn.textContent='恢复中…';

}

try{

const videos=[];

for(
const raw of data.videos
){

if(
!raw||
typeof raw!=='object'
)continue;

let blob=null;

if(
typeof raw.data==='string'&&
raw.data.startsWith('data:')
){

blob=dataURLToBlob(
raw.data
);

}

if(!blob&&raw.blob){

blob=asBlob(raw);

}

if(
!blob&&
typeof raw.size==='number'&&
raw.size>0
){

console.warn(
'备份视频缺少实际文件:',
raw.name
);

}

videos.push({

id:
raw.id||
(
crypto.randomUUID
?crypto.randomUUID()
:`${Date.now()}_${Math.random()}`
),

name:
raw.name||
'未命名视频',

category:
raw.category||
'未分类',

tags:
normalizeTags(raw.tags),

size:
blob?.size||
Number(raw.size)||
0,

type:
blob?.type||
raw.type||
'video/mp4',

blob,

createdAt:
Number(raw.createdAt)||
Date.now()

});

}

const cats=
Array.isArray(data.cats)
?data.cats
:null;

if(cats){

const normalized=[
...new Set(
cats
.map(c=>String(c).trim())
.filter(Boolean)
)
];

if(!normalized.includes('全部')){
normalized.unshift('全部');
}

if(!normalized.includes('未分类')){
normalized.push('未分类');
}

state.cats=normalized;

saveCats();

}

state.data={
videos
};

state.objectUrls.forEach(
url=>URL.revokeObjectURL(url)
);

state.objectUrls.clear();

state.selectedIds.clear();

if(
!await saveVideos()
){

return;
}

state.currentCat='全部';
state.currentTag='全部';
state.selectedTags.clear();

const title=
document.getElementById(
'pageTitle'
);

if(title){
title.textContent='全部视频';
}

closeModal('importModal');

renderCats();
renderFilterBar();
renderVideos();
updateBatchBar();
populateUploadCategories();

toast(
`恢复完成，共 ${videos.length} 个视频`
);

state.importData=null;

}catch(e){

console.error(e);

toast(
'恢复失败：'+e.message,
'error'
);

}finally{

if(btn){

btn.disabled=
!state.importData;

btn.textContent='恢复';

}

}
}

function repairLegacyData(){

let changed=false;

if(
!Array.isArray(
state.data.videos
)
){

state.data.videos=[];

changed=true;

}

state.data.videos=
state.data.videos.map(v=>{

const item={
...v
};

if(
!item.id
){

item.id=
crypto.randomUUID
?crypto.randomUUID()
:`${Date.now()}_${Math.random()}`;

changed=true;

}

if(
!item.name
){

item.name='未命名视频';

changed=true;

}

if(
!item.category||
!state.cats.includes(
item.category
)
){

item.category='未分类';

changed=true;

}

const tags=
normalizeTags(item.tags);

if(
JSON.stringify(tags)!==
JSON.stringify(
item.tags||[]
)
){

item.tags=tags;

changed=true;

}

if(
!item.createdAt
){

item.createdAt=
item.date||
Date.now();

changed=true;

}

return item;

});

if(changed){

IDB.set(
CONFIG.DB_KEY,
state.data
).catch(
console.error
);

}
}

function cleanupObjectUrls(){

state.objectUrls.forEach(
url=>{
URL.revokeObjectURL(url);
}
);

state.objectUrls.clear();
}

function setupPageEvents(){

document.addEventListener(
'visibilitychange',
()=>{

if(
document.visibilityState==='hidden'
){

cleanupObjectUrls();

}

}
);

window.addEventListener(
'beforeunload',
cleanupObjectUrls
);

}

async function init(){

injectBaseStyle();

setupSidebar();

setupSelectionToolbar();

setupUpload();

setupModals();

setupAddCategory();

setupBackup();

setupPageEvents();

await loadData();

}

if(
document.readyState==='loading'
){

document.addEventListener(
'DOMContentLoaded',
init,
{once:true}
);

}else{

init();

}