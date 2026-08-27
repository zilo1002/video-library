const CONFIG={
DB_NAME:'VideoLibraryDB',
DB_VERSION:3,
STORE:'library',
DB_KEY:'videoLib_v1',
CAT_KEY:'videoLib_cats_v1',
VIEW_KEY:'videoLib_view_v1',
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
view:'grid'
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
const r=
db.transaction(
CONFIG.STORE,
'readonly'
)
.objectStore(CONFIG.STORE)
.get(key);

r.onsuccess=()=>{
res(r.result);
};

r.onerror=()=>{
rej(r.error);
};
})
);
},

set(key,value){
return this.open().then(
db=>new Promise((res,rej)=>{
const tx=
db.transaction(
CONFIG.STORE,
'readwrite'
);

tx.objectStore(CONFIG.STORE)
.put(value,key);

tx.oncomplete=()=>{
res();
};

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
}
};

function escapeHtml(s=''){
const d=document.createElement('div');

d.textContent=String(s);

return d.innerHTML;
}

function formatSize(n=0){

n=Number(n)||0;

if(n<1024){
return n+' B';
}

if(n<1048576){
return(
n/1024
).toFixed(1)+' KB';
}

if(n<1073741824){
return(
n/1048576
).toFixed(2)+' MB';
}

return(
n/1073741824
).toFixed(2)+' GB';
}

function formatDate(ts){

const d=new Date(ts);

if(Number.isNaN(d.getTime())){
return '未知日期';
}

return `${
d.getMonth()+1
}/${
d.getDate()
} ${
String(
d.getHours()
).padStart(2,'0')
}:${
String(
d.getMinutes()
).padStart(2,'0')
}`;
}

function formatFullDate(ts){

const d=new Date(ts);

if(Number.isNaN(d.getTime())){
return '未知日期';
}

return d.toLocaleString();
}

function icon(c){
return CONFIG.ICONS[c]||'🏷️';
}

function normalizeTags(tags){

if(Array.isArray(tags)){
return[
...new Set(
tags
.map(x=>String(x).trim())
.filter(Boolean)
)
];
}

if(typeof tags==='string'){
return[
...new Set(
tags
.split(/[,，、]/)
.map(x=>x.trim())
.filter(Boolean)
)
];
}

return[];
}

function tagsToText(tags){
return normalizeTags(tags).join('、');
}

function toast(msg,type='success'){

const t=
document.getElementById('toast');

if(!t)return;

t.textContent=msg;

t.className=
`toast ${type} show`;

clearTimeout(toast.timer);

toast.timer=setTimeout(()=>{
t.classList.remove('show');
},3000);
}

function openModal(id){
document
.getElementById(id)
?.classList.add('active');
}

function closeModal(id){

const el=
document.getElementById(id);

if(!el)return;

el.classList.remove('active');

if(id==='playerModal'){

const v=
document.getElementById(
'playerVideo'
);

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
type:
v.type||
'video/mp4'
}
);
}

if(v.buffer instanceof ArrayBuffer){

return new Blob(
[v.buffer],
{
type:
v.type||
'video/mp4'
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

const u=
state.objectUrls.get(id);

if(u){

URL.revokeObjectURL(u);

state.objectUrls.delete(id);
}
}

function loadView(){

try{

const saved=
localStorage.getItem(
CONFIG.VIEW_KEY
);

if(
saved==='grid'||
saved==='timeline'||
saved==='tags'
){

state.view=saved;

}

}catch{}

}

function saveView(){

try{

localStorage.setItem(
CONFIG.VIEW_KEY,
state.view
);

}catch{}
}

function setView(view){

if(
!['grid','timeline','tags']
.includes(view)
){
return;
}

state.view=view;

saveView();

document
.querySelectorAll('.view-btn')
.forEach(btn=>{

btn.classList.toggle(
'active',
btn.dataset.view===view
);
});

renderVideos();
}

function loadData(){

return (async()=>{

try{

const c=
localStorage.getItem(
CONFIG.CAT_KEY
);

state.cats=
c
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

const d=
await IDB.get(
CONFIG.DB_KEY
);

state.data=
d&&
Array.isArray(d.videos)
?d
:{videos:[]};

state.data.videos.forEach(v=>{

if(!v.type){
v.type='video/mp4';
}

if(!v.size){

const b=asBlob(v);

if(b){
v.size=b.size;
}
}

v.tags=normalizeTags(
v.tags
);

});

renderCats();

renderVideos();

updateStorage();

updateBatchBar();

}catch(e){

console.error(e);

state.data={
videos:[]
};

renderCats();

renderVideos();

toast(
'视频库加载失败：'+
e.message,
'error'
);

}

})();

}

function saveCats(){

try{

localStorage.setItem(
CONFIG.CAT_KEY,
JSON.stringify(state.cats)
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

async function saveVideos(){

try{

await IDB.set(
CONFIG.DB_KEY,
state.data
);

await updateStorage();

return true;

}catch(e){

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
`视频占用 ${
formatSize(used)
} · ${
state.data.videos.length
} 个`;
}

try{

const q=
await navigator
.storage
?.estimate?.();

const quota=
q?.quota||0;

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
(v.category||'未分类')===c
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
?
'<button class="cat-del-btn" title="删除分类">−</button>'
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

renderVideos();

updateBatchBar();

closeSidebar();

}

function getCurrentVideos(){

return state.currentCat==='全部'
?state.data.videos
:state.data.videos.filter(
v=>
(v.category||'未分类')===
state.currentCat
);

}

function getSortedVideos(){

return[
...getCurrentVideos()
].sort(
(a,b)=>
Number(b.createdAt||0)-
Number(a.createdAt||0)
);

}

function createTagElement(tag){

const span=
document.createElement('span');

span.className='video-tag';

span.textContent=
'#'+tag;

return span;
}

function renderTags(tags){

const arr=
normalizeTags(tags);

if(!arr.length){
return '';
}

return`
<div class="video-tags">
${
arr.map(tag=>
`<span class="video-tag">
#${escapeHtml(tag)}
</span>`
).join('')
}
</div>
`;

}

function renderVideoCard(v){

const card=
document.createElement('div');

card.className=
'video-card';

const src=
videoUrl(v);

const thumb=
v.thumbnail||'';

const checked=
state.selectedIds.has(v.id);

card.innerHTML=`

<div class="video-thumb">

${
thumb
?
`<img
src="${escapeHtml(thumb)}"
alt="视频缩略图"
>`
:
(
src
?
'<video muted playsinline preload="metadata"></video>'
:
'<div class="thumb-placeholder">🎬</div>'
)
}

<div class="play-icon">
▶
</div>

<button
class="delete-btn"
title="删除视频"
>
×
</button>

<label
class="video-select"
title="选择视频"
>
<input
type="checkbox"
${checked?'checked':''}
>
</label>

</div>

<div class="video-info">

<div
class="v-title"
title="${escapeHtml(v.name)}"
>
${escapeHtml(v.name)}
</div>

<div class="v-meta">
<span>${formatSize(v.size)}</span>
<span>${formatDate(v.createdAt)}</span>
</div>

<span class="v-cat">
${escapeHtml(v.category||'未分类')}
</span>

${renderTags(v.tags)}

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

const checkbox=
card.querySelector(
'.video-select input'
);

checkbox?.addEventListener(
'click',
e=>{
e.stopPropagation();
}
);

checkbox?.addEventListener(
'change',
e=>{

e.stopPropagation();

if(e.target.checked){

state.selectedIds.add(v.id);

}else{

state.selectedIds.delete(v.id);

}

updateBatchBar();

renderVideos();

}
);

card.addEventListener(
'click',
e=>{

if(
e.target.closest('.delete-btn')||
e.target.closest('.video-select')
){

return;
}

playVideo(v);

}
);

card.querySelector(
'.delete-btn'
)?.addEventListener(
'click',
e=>{

e.stopPropagation();

deleteVideo(v.id);

}
);

return card;

}

function renderGrid(videos){

const grid=
document.createElement('div');

grid.className=
'video-grid';

videos.forEach(v=>{

grid.appendChild(
renderVideoCard(v)
);

});

return grid;

}

function renderTimeline(videos){

const wrap=
document.createElement('div');

wrap.className=
'timeline-view';

let lastDate='';

videos.forEach(v=>{

const d=
new Date(v.createdAt);

const dateKey=
Number.isNaN(d.getTime())
?'未知日期'
:
`${d.getFullYear()}-${String(
d.getMonth()+1
).padStart(2,'0')}-${String(
d.getDate()
).padStart(2,'0')}`;

if(dateKey!==lastDate){

const group=
document.createElement('div');

group.className=
'timeline-date';

group.innerHTML=`
<div class="timeline-dot"></div>
<div class="timeline-date-text">
${escapeHtml(dateKey)}
</div>
`;

wrap.appendChild(group);

lastDate=dateKey;
}

const item=
document.createElement('div');

item.className=
'timeline-item';

const card=
renderVideoCard(v);

item.appendChild(card);

wrap.appendChild(item);

});

return wrap;

}

function renderTagGroups(videos){

const wrap=
document.createElement('div');

wrap.className=
'tag-groups-view';

const groups=
new Map();

videos.forEach(v=>{

const tags=
normalizeTags(v.tags);

if(!tags.length){

if(!groups.has('无标签')){
groups.set('无标签',[]);
}

groups.get('无标签').push(v);

return;
}

tags.forEach(tag=>{

if(!groups.has(tag)){
groups.set(tag,[]);
}

groups.get(tag).push(v);

});

});

const sortedGroups=
[...groups.entries()]
.sort(
(a,b)=>
b[1].length-a[1].length||
a[0].localeCompare(
b[0],
'zh-CN'
)
);

sortedGroups.forEach(
([tag,items])=>{

const section=
document.createElement('section');

section.className=
'tag-group';

const header=
document.createElement('div');

header.className=
'tag-group-header';

header.innerHTML=`
<div>
<span class="tag-group-title">
${
tag==='无标签'
?'📁 无标签'
:'#'+escapeHtml(tag)
}
</span>

<span class="tag-group-count">
${items.length}
</span>
</div>
`;

section.appendChild(header);

section.appendChild(
renderGrid(items)
);

wrap.appendChild(section);

});

return wrap;

}

function renderVideos(){

const box=
document.getElementById(
'content'
);

if(!box)return;

const vs=
getSortedVideos();

if(!vs.length){

box.innerHTML=`
<div class="empty-state">

<div class="empty-icon">
🎬
</div>

<h3>
暂无视频
</h3>

<p>
点击右上角「上传视频」添加视频
</p>

</div>
`;

updateBatchBar();

return;
}

let view;

if(state.view==='timeline'){

view=
renderTimeline(vs);

}else if(state.view==='tags'){

view=
renderTagGroups(vs);

}else{

view=
renderGrid(vs);

}

box.replaceChildren(view);

updateBatchBar();

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
`${
v.category||'未分类'
} · ${
formatSize(v.size)
} · ${
formatFullDate(v.createdAt)
}`;

const tagBox=
document.getElementById(
'playerTags'
);

if(tagBox){

tagBox.innerHTML=
renderTags(v.tags);
}

openModal('playerModal');

video.play().catch(()=>{});

}

function downloadVideo(v){

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
document.createElement('a');

a.href=u;

a.download=
v.name||
'video.mp4';

document.body.appendChild(a);

a.click();

a.remove();

setTimeout(()=>{
URL.revokeObjectURL(u);
},1500);

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

const b=asBlob(v);

if(!b)continue;

const u=
URL.createObjectURL(b);

const a=
document.createElement('a');

a.href=u;

a.download=
v.name||
'video.mp4';

document.body.appendChild(a);

a.click();

a.remove();

success++;

await new Promise(
resolve=>
setTimeout(resolve,180)
);

setTimeout(()=>{
URL.revokeObjectURL(u);
},1500);

}

toast(
`已开始下载 ${success} 个视频`
);

state.selectedIds.clear();

renderVideos();

updateBatchBar();

}

async function deleteVideo(id){

if(
!confirm(
'确定删除这个视频？'
)
){
return;
}

const old=
state.data.videos;

state.data.videos=
old.filter(
v=>v.id!==id
);

if(
await saveVideos()
){

revoke(id);

state.selectedIds.delete(id);

renderCats();

renderVideos();

updateBatchBar();

toast(
'视频已删除'
);

}else{

state.data.videos=old;

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
v=>
!state.selectedIds.has(v.id)
);

if(
await saveVideos()
){

ids.forEach(id=>revoke(id));

state.selectedIds.clear();

renderCats();

renderVideos();

updateBatchBar();

toast(
`已删除 ${count} 个视频`
);

}else{

state.data.videos=
oldVideos;

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
v=>
state.selectedIds.delete(v.id)
);

}else{

videos.forEach(
v=>
state.selectedIds.add(v.id)
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

bar.id=
'batchActionBar';

bar.innerHTML=`

<span
id="batchCount"
></span>

<button
id="batchSelectAll"
class="btn btn-secondary"
>
全选
</button>

<button
id="batchDownload"
class="btn btn-primary"
>
⬇ 下载
</button>

<button
id="batchDelete"
class="btn btn-secondary"
>
删除
</button>

<button
id="batchClear"
class="btn btn-secondary"
>
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

const topCount=
document.getElementById(
'selectedCount'
);

if(topCount){
topCount.textContent=
'已选择 0 个';
}

return;

}

bar.style.display='flex';

const batchCount=
document.getElementById(
'batchCount'
);

if(batchCount){

batchCount.textContent=
`已选 ${selectedCount} 个`;
}

const topCount=
document.getElementById(
'selectedCount'
);

if(topCount){

topCount.textContent=
`已选择 ${selectedCount} 个`;
}

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

/* ==================================================
   上传相关
   ================================================== */

function isDuplicateVideo(file){

if(!file)return false;

return state.data.videos.some(v=>{

const sameName=
String(v.name||'')
.trim()
.toLowerCase()
===
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

wrap.id=
'duplicateOption';

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
"
>
按「文件名 + 文件大小」判断重复视频
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
if(
state.selectedFiles.length
){
refreshSelectedFilesDisplay();
}
}
);

}

function refreshSelectedFilesDisplay(){

const files=[
...state.selectedFiles
];

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
(sum,f)=>
sum+f.size,
0
);

if(files.length===1){

nameEl.textContent=
`${files[0].name} · ${
formatSize(files[0].size)
}`;

}else{

nameEl.textContent=
`已选择 ${files.length} 个视频 · 总计 ${
formatSize(totalSize)
}`;

}

btn.disabled=false;

btn.textContent=
files.length>1
?`上传 ${files.length} 个视频`
:'上传';

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
.map(
c=>`
<option value="${escapeHtml(c)}">
${escapeHtml(c)}
</option>
`
)
.join('');

}

state.selectedFiles=[];

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

const tagsInput=
document.getElementById(
'uploadTags'
);

if(tagsInput){

tagsInput.value='';

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

const duplicateCheckbox=
document.getElementById(
'skipUploadedVideos'
);

if(duplicateCheckbox){

duplicateCheckbox.checked=true;

}

openModal(
'uploadModal'
);

}

function handleFiles(fileList){

if(
!fileList||
!fileList.length
)return;

const files=[
...fileList
];

const valid=[];

let duplicateCount=0;

const skipDuplicate=
getSkipDuplicateSetting();

for(
const file of files
){

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
file.size>
CONFIG.MAX_FILE_SIZE
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

if(
duplicateCount>0
){

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

state.selectedFiles=
valid;

refreshSelectedFilesDisplay();

}

function handleFile(file){

if(!file)return;

handleFiles([file]);

}

async function checkSpace(n){

try{

const e=
await navigator
.storage
?.estimate?.();

if(e?.quota){

const available=
e.quota-
(e.usage||0);

if(
n+
CONFIG.STORAGE_RESERVE>
available
){

toast(
`可用空间不足：约剩 ${
formatSize(
Math.max(
0,
available
)
)
}`,
'error'
);

return false;

}

}

}catch{}

return true;

}

function createThumbnail(file){

return new Promise(
resolve=>{

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

v.onerror=()=>{
finish('');
};

v.src=u;

setTimeout(
()=>{
finish('');
},
5000
);

}
);

}

async function doUpload(){

const files=[
...state.selectedFiles
];

if(!files.length)return;

const btn=
document.getElementById(
'uploadConfirmBtn'
);

btn.disabled=true;

try{

/*
==================================================
再次检查重复视频
==================================================

上传窗口打开后，视频库可能已经发生变化。

因此真正保存前再次检查一次。

重复判断：

文件名 + 文件大小

==================================================
*/

const skipDuplicate=
getSkipDuplicateSetting();

const uploadFiles=[];

let duplicateCount=0;

for(
const file of files
){

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
(sum,f)=>
sum+f.size,
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

const tagsInput=
document.getElementById(
'uploadTags'
);

const selectedTags=
normalizeTags(
tagsInput?.value||''
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
?`生成缩略图 ${
i+1
}/${
uploadFiles.length
}…`
:'生成缩略图…';

const thumbnail=
await createThumbnail(file);

btn.textContent=
uploadFiles.length>1
?`保存 ${
i+1
}/${
uploadFiles.length
}…`
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
Date.now()
.toString(36)+
Math.random()
.toString(36)
.slice(2,10),

name:file.name,

category:
selectedCategory,

tags:[
...selectedTags
],

blob,

size:file.size,

type:
file.type||
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

renderCats();

renderVideos();

updateStorage();

updateBatchBar();

closeModal(
'uploadModal'
);

if(duplicateCount){

toast(
`成功上传 ${
newVideos.length
} 个视频，已跳过 ${
duplicateCount
} 个重复视频`
);

}else{

toast(
uploadFiles.length>1
?`成功上传 ${
uploadFiles.length
} 个视频，原 MP4 已保存`
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


/* ==================================================
   备份 / 恢复
   ================================================== */

function dataURLToBlob(s){

const [
head,
body
]=s.split(
',',
2
);

if(!body){

throw new Error(
'备份数据损坏'
);

}

const mime=
(
head.match(
/data:([^;]+)/
)||[]
)[1]||
'application/octet-stream';

const bin=
atob(body);

const a=
new Uint8Array(
bin.length
);

for(
let i=0;
i<bin.length;
i++
){

a[i]=
bin.charCodeAt(i);

}

return new Blob(
[a],
{
type:mime
}
);

}

function blobToDataURL(b){

return new Promise(
(res,rej)=>{

const r=
new FileReader();

r.onload=()=>{
res(r.result);
};

r.onerror=()=>{
rej(r.error);
};

r.readAsDataURL(b);

}
);

}

async function exportBackup(){

if(
!state.data.videos.length
){

return toast(
'暂无视频可备份',
'error'
);

}

const btn=
document.getElementById(
'exportBtn'
);

btn.disabled=true;

btn.textContent=
'⏳ 生成中…';

try{

const videos=[];

for(
const v of state.data.videos
){

const b=
asBlob(v);

if(!b)continue;

videos.push({

id:v.id,

name:v.name,

category:v.category,

tags:
normalizeTags(v.tags),

data:
await blobToDataURL(b),

size:b.size,

type:
v.type||
b.type,

createdAt:
v.createdAt,

thumbnail:
v.thumbnail||
''

});

}

const payload={

version:4,

exportedAt:
Date.now(),

categories:
state.cats,

videos

};

const blob=
new Blob(
[
JSON.stringify(
payload
)
],
{
type:'application/json'
}
);

const u=
URL.createObjectURL(
blob
);

const a=
document.createElement(
'a'
);

a.href=u;

a.download=
`video-backup-${
new Date()
.toISOString()
.slice(0,10)
}.json`;

document.body.appendChild(a);

a.click();

a.remove();

setTimeout(
()=>{
URL.revokeObjectURL(u);
},
1000
);

toast(
'备份已导出'
);

}catch(e){

toast(
'导出失败：'+
e.message,
'error'
);

}finally{

btn.disabled=false;

btn.textContent=
'📥 导出备份';

}

}

function openImport(){

state.importData=null;

document.getElementById(
'importFileName'
).textContent='';

document.getElementById(
'importConfirmBtn'
).disabled=true;

openModal(
'importModal'
);

}

function handleImport(file){

if(!file)return;

if(
!/\.json$/i.test(
file.name
)
){

return toast(
'请选择 JSON 备份文件',
'error'
);

}

const r=
new FileReader();

r.onload=()=>{

try{

const o=
JSON.parse(
r.result
);

if(
!Array.isArray(o.videos)||
!Array.isArray(o.categories)
){

throw new Error(
'备份格式不正确'
);

}

state.importData=o;

document.getElementById(
'importFileName'
).textContent=
`${file.name} · ${
o.videos.length
} 个视频`;

document.getElementById(
'importConfirmBtn'
).disabled=false;

}catch(e){

toast(
'无效的备份文件：'+
e.message,
'error'
);

}

};

r.onerror=()=>{

toast(
'文件读取失败',
'error'
);

};

r.readAsText(file);

}

async function doImport(){

const o=
state.importData;

if(!o)return;

if(
!confirm(
`确定恢复备份？这将覆盖当前所有数据（${
o.videos.length
} 个视频）。`
)
){

return;

}

const btn=
document.getElementById(
'importConfirmBtn'
);

btn.disabled=true;

btn.textContent=
'恢复中…';

try{

const videos=[];

for(
let i=0;
i<o.videos.length;
i++
){

const v=
o.videos[i];

btn.textContent=
o.videos.length>1
?`恢复 ${
i+1
}/${
o.videos.length
}…`
:'恢复中…';

const b=
dataURLToBlob(
v.data
);

videos.push({

id:v.id,

name:v.name,

category:
o.categories.includes(
v.category
)
?v.category
:'未分类',

tags:
normalizeTags(
v.tags
),

blob:b,

size:b.size,

type:
v.type||
b.type||
'video/mp4',

createdAt:
Number(v.createdAt)||
Date.now(),

thumbnail:
v.thumbnail||
''

});

}

const cats=[
...new Set(
o.categories.filter(
c=>
typeof c==='string'&&
c.trim()
)
)
];

if(
!cats.includes('全部')
){

cats.unshift('全部');

}

if(
!cats.includes('未分类')
){

cats.splice(
1,
0,
'未分类'
);

}

await IDB.set(
CONFIG.DB_KEY,
{
videos
}
);

state.objectUrls.forEach(
u=>
URL.revokeObjectURL(u)
);

state.objectUrls.clear();

state.data={
videos
};

state.cats=cats;

saveCats();

state.currentCat='全部';

state.selectedIds.clear();

document.getElementById(
'pageTitle'
).textContent=
'全部视频';

renderCats();

renderVideos();

updateStorage();

updateBatchBar();

closeModal(
'importModal'
);

toast(
'备份恢复成功'
);

}catch(e){

toast(
'恢复失败：'+
e.message,
'error'
);

}finally{

btn.textContent='恢复';

btn.disabled=
!state.importData;

}

}

/* ==================================================
   分类管理
   ================================================== */

function openAddCat(){

document.getElementById(
'newCatName'
).value='';

openModal('catModal');

setTimeout(()=>{
document.getElementById(
'newCatName'
)?.focus();
},100);
}

function addCat(){

const i=
document.getElementById(
'newCatName'
);

const n=
i.value.trim();

if(!n){

return toast(
'请输入分类名称',
'error'
);
}

if(state.cats.includes(n)){

return toast(
'分类已存在',
'error'
);
}

state.cats.push(n);

if(saveCats()){

renderCats();

closeModal('catModal');

toast('分类添加成功');
}
}

async function deleteCat(c){

if(
c==='全部'||
c==='未分类'
){
return;
}

const count=
state.data.videos.filter(
v=>v.category===c
).length;

if(
!confirm(
count
?`确定删除分类「${c}」？${count} 个视频将移至「未分类」。`
:`确定删除空分类「${c}」？`
)
){
return;
}

const cats=[
...state.cats
];

const videos=
state.data.videos.map(
v=>({...v})
);

state.cats=
state.cats.filter(
x=>x!==c
);

state.data.videos.forEach(v=>{

if(v.category===c){
v.category='未分类';
}
});

if(
state.currentCat===c
){
state.currentCat='全部';
}

if(
!(
saveCats()&&
await saveVideos()
)
){

state.cats=cats;

state.data.videos=
videos;

return;
}

state.selectedIds.clear();

document.getElementById(
'pageTitle'
).textContent=
state.currentCat==='全部'
?'全部视频'
:state.currentCat;

renderCats();
renderVideos();
updateBatchBar();

toast('分类已删除');
}

function openCatManage(){

const b=
document.getElementById(
'catManageBody'
);

b.innerHTML='';

const cats=
state.cats.filter(
c=>
c!=='全部'&&
c!=='未分类'
);

if(!cats.length){

b.innerHTML=
'<div class="manage-empty">暂无可管理的自定义分类</div>';

openModal(
'catManageModal'
);

return;
}

cats.forEach(c=>{

const item=
document.createElement('div');

item.className=
'cat-manage-item';

item.innerHTML=`

<div class="cat-left">

<span>
${icon(c)}
</span>

<input
value="${escapeHtml(c)}"
maxlength="30"
>

</div>

<div class="cat-actions">

<button title="删除">
🗑
</button>

</div>
`;

const input=
item.querySelector('input');

input.addEventListener(
'change',
()=>{
renameCat(
c,
input.value.trim(),
input
);
}
);

item.querySelector(
'button'
).addEventListener(
'click',
()=>{
deleteCat(c);
}
);

b.appendChild(item);
});

openModal(
'catManageModal'
);
}

async function renameCat(
oldName,
newName,
input
){

if(
!newName||
newName===oldName
){

input.value=oldName;

return;
}

if(state.cats.includes(newName)){

toast(
'分类名称已存在',
'error'
);

input.value=oldName;

return;
}

const idx=
state.cats.indexOf(oldName);

const oldVideos=
state.data.videos.map(
v=>({...v})
);

state.cats[idx]=newName;

state.data.videos.forEach(v=>{

if(v.category===oldName){
v.category=newName;
}
});

if(
state.currentCat===oldName
){
state.currentCat=newName;
}

if(
!(
saveCats()&&
await saveVideos()
)
){

state.cats[idx]=oldName;

state.data.videos=
oldVideos;

input.value=oldName;

return;
}

document.getElementById(
'pageTitle'
).textContent=
state.currentCat==='全部'
?'全部视频'
:state.currentCat;

renderCats();
renderVideos();
updateBatchBar();

openCatManage();

toast('重命名成功');
}

/* ==================================================
   多选上传 / 批量操作样式
   ================================================== */

function injectMultiUploadStyle(){

if(
document.getElementById(
'multiUploadStyle'
)
)return;

const style=
document.createElement('style');

style.id=
'multiUploadStyle';

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

padding:
7px 8px!important;

font-size:
11px!important;
}

#batchCount{

font-size:
11px!important;
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

const input=
document.getElementById(
'fileInput'
);

if(!input)return;

input.multiple=true;

input.setAttribute(
'accept',
'video/mp4,video/*'
);
}

function bind(){

const on=(id,e,fn)=>{
document.getElementById(id)
?.addEventListener(e,fn);
};

on(
'uploadBtnMain',
'click',
openUpload
);

on(
'addCatBtn',
'click',
openAddCat
);

on(
'addCatConfirmBtn',
'click',
addCat
);

on(
'uploadConfirmBtn',
'click',
doUpload
);

on(
'catManageBtn',
'click',
openCatManage
);

on(
'exportBtn',
'click',
exportBackup
);

on(
'importBtn',
'click',
openImport
);

on(
'menuBtn',
'click',
toggleSidebar
);

on(
'sidebarOverlay',
'click',
closeSidebar
);

on(
'importConfirmBtn',
'click',
doImport
);

on(
'playerDownloadBtn',
'click',
()=>{
const v=
state.data.videos.find(
x=>
x.id===
state.currentPlayerId
);

if(v){
downloadVideo(v);
}
}
);

on(
'fileInput',
'change',
e=>{

handleFiles(
e.target.files
);

e.target.value='';
}
);

on(
'importInput',
'change',
e=>{

handleImport(
e.target.files[0]
);

e.target.value='';
}
);

document
.querySelectorAll(
'[data-close]'
)
.forEach(b=>{

b.addEventListener(
'click',
()=>{
closeModal(
b.dataset.close
);
}
);
});

document
.querySelectorAll(
'.modal-overlay'
)
.forEach(o=>{

o.addEventListener(
'click',
e=>{

if(e.target===o){
closeModal(o.id);
}
}
);
});

const drop=(
id,
input,
handler
)=>{

const d=
document.getElementById(id);

if(!d)return;

d.addEventListener(
'click',
()=>{

document.getElementById(
input
)?.click();
}
);

d.addEventListener(
'dragover',
e=>{

e.preventDefault();

d.classList.add(
'dragover'
);
}
);

d.addEventListener(
'dragleave',
()=>{

d.classList.remove(
'dragover'
);
}
);

d.addEventListener(
'drop',
e=>{

e.preventDefault();

d.classList.remove(
'dragover'
);

if(
e.dataTransfer?.files?.length
){

handler(
e.dataTransfer.files
);
}
}
);
};

drop(
'fileDrop',
'fileInput',
handleFiles
);

drop(
'importDrop',
'importInput',
files=>{
handleImport(
files[0]
);
}
);

on(
'newCatName',
'keydown',
e=>{

if(e.key==='Enter'){
addCat();
}
}
);

document.addEventListener(
'keydown',
e=>{

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
}
);

window.addEventListener(
'beforeunload',
()=>{
state.objectUrls.forEach(
u=>URL.revokeObjectURL(u)
);
}
);
}