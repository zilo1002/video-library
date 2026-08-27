const CONFIG={
DB_NAME:'VideoLibraryDB',
DB_VERSION:2,
STORE:'library',
DB_KEY:'videoLib_v1',
CAT_KEY:'videoLib_cats_v1',

DEFAULT_CATS:[
'全部',
'未分类',
'教程',
'电影',
'音乐',
'其他'
],

ICONS:{
'全部':'📁',
'未分类':'📄',
'教程':'📚',
'电影':'🎬',
'音乐':'🎵',
'其他':'📦'
},

MAX_FILE_SIZE:2*1024*1024*1024,
STORAGE_RESERVE:10*1024*1024,

VIDEO_TYPE:'video/mp4',
VIDEO_EXTENSION:'.mp4'
};


const state={
data:{videos:[]},
cats:[...CONFIG.DEFAULT_CATS],
currentCat:'全部',
selectedFile:null,
importData:null,
objectUrls:new Map(),
currentPlayerId:null
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
};

resolve(this.db);

};

r.onerror=()=>{
reject(
r.error||new Error('IndexedDB 打开失败')
);
};

});

},

get(key){

return this.open().then(db=>

new Promise((res,rej)=>{

const r=db
.transaction(CONFIG.STORE,'readonly')
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

return this.open().then(db=>

new Promise((res,rej)=>{

const tx=db.transaction(
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

if(n<1024)
return n+' B';

if(n<1048576)
return (n/1024).toFixed(1)+' KB';

if(n<1073741824)
return (n/1048576).toFixed(2)+' MB';

return (n/1073741824).toFixed(2)+' GB';

}


function formatDate(ts){

const d=new Date(ts);

return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;

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

toast.timer=setTimeout(
()=>{
t.classList.remove('show');
},
3000
);

}


function openModal(id){

document
.getElementById(id)
?.classList.add('active');

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

if(v.blob instanceof Blob)
return v.blob;

if(v.blob)
return new Blob(
[v.blob],
{
type:v.type||CONFIG.VIDEO_TYPE
}
);

if(v.buffer instanceof ArrayBuffer)
return new Blob(
[v.buffer],
{
type:v.type||CONFIG.VIDEO_TYPE
}
);

if(
typeof v.data==='string' &&
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


async function loadData(){

try{

const c=localStorage.getItem(
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


state.data.videos.forEach(v=>{

if(!v.type)
v.type=CONFIG.VIDEO_TYPE;

if(!v.size){

const b=asBlob(v);

if(b)
v.size=b.size;

}

});


renderCats();
renderVideos();
updateStorage();

}catch(e){

console.error(e);

state.data={videos:[]};

renderCats();
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
'视频保存失败：'+e.message,
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


document.getElementById(
'storageText'
).textContent=
`视频占用 ${formatSize(used)} · ${state.data.videos.length} 个`;


try{

const q=
await navigator.storage?.estimate?.();

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
quota&&used/quota>.7
);

fill.classList.toggle(
'danger',
quota&&used/quota>.9
);

}

}catch{}

}


function renderCats(){

const list=
document.getElementById('catList');

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
c!=='全部'&&c!=='未分类'
?
'<button class="cat-del-btn" title="删除分类">−</button>'
:''
}

`;


d.addEventListener(
'click',
e=>{

if(
!e.target.closest('.cat-del-btn')
){

switchCat(c);

}

});


d.querySelector(
'.cat-del-btn'
)?.addEventListener(
'click',
e=>{

e.stopPropagation();

deleteCat(c);

});


list.appendChild(d);

});

}


function switchCat(c){

state.currentCat=c;

document.getElementById(
'pageTitle'
).textContent=
c==='全部'
?'全部视频'
:c;

renderCats();
renderVideos();
closeSidebar();

}


function renderVideos(){

const box=
document.getElementById('content');


const vs=
state.currentCat==='全部'
?state.data.videos
:state.data.videos.filter(
v=>(v.category||'未分类')===state.currentCat
);


if(!vs.length){

box.innerHTML=`

<div class="empty-state">

<div class="empty-icon">🎬</div>

<h3>暂无视频</h3>

<p>
点击右上角「上传视频」添加 MP4 视频
</p>

</div>

`;

return;

}


const grid=document.createElement('div');

grid.className='video-grid';


vs.slice().reverse().forEach(v=>{

const card=
document.createElement('div');

card.className='video-card';


const src=videoUrl(v);

const thumb=v.thumbnail||'';


card.innerHTML=`

<div class="video-thumb">

${
thumb
?
`<img src="${thumb}" alt="视频缩略图">`
:
(
src
?
'<video muted playsinline preload="metadata"></video>'
:
'<div class="thumb-placeholder">🎬</div>'
)
}

<div class="play-icon">▶</div>

<button
class="delete-btn"
title="删除视频"
>
×
</button>

</div>


<div class="video-info">

<div
class="v-title"
title="${escapeHtml(v.name)}"
>
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

});

}


card.addEventListener(
'click',
()=>playVideo(v)
);


card.querySelector(
'.delete-btn'
).addEventListener(
'click',
e=>{

e.stopPropagation();

deleteVideo(v.id);

});


grid.appendChild(card);

});


box.replaceChildren(grid);

}


function playVideo(v){

const src=videoUrl(v);

if(!src){

toast(
'视频文件数据不存在',
'error'
);

return;

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


video.play().catch(
()=>{}
);

}


function downloadVideo(v){

const b=asBlob(v);

if(!b){

toast(
'找不到原视频文件',
'error'
);

return;

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


async function deleteVideo(id){

if(
!confirm('确定删除这个视频？')
)return;


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

renderCats();
renderVideos();

toast('视频已删除');

}else{

state.data.videos=old;

}

}


function openUpload(){

const s=
document.getElementById(
'uploadCat'
);


s.innerHTML=
state.cats
.filter(c=>c!=='全部')
.map(
c=>`
<option value="${escapeHtml(c)}">
${escapeHtml(c)}
</option>
`
)
.join('');


state.selectedFile=null;


document.getElementById(
'fileName'
).textContent='';


document.getElementById(
'uploadConfirmBtn'
).disabled=true;


openModal('uploadModal');

}


function isMp4File(file){

if(!file)return false;


const name=
String(file.name||'')
.toLowerCase();


const type=
String(file.type||'')
.toLowerCase();


return (
name.endsWith('.mp4') &&
(
!type||
type==='video/mp4'
)
);

}


function handleFile(file){

if(!file)return;


if(!isMp4File(file)){

return toast(
'只支持 .mp4 视频文件',
'error'
);

}


if(
file.size>CONFIG.MAX_FILE_SIZE
){

return toast(
'单个 MP4 超过 2GB，暂不建议导入',
'error'
);

}


state.selectedFile=file;


document.getElementById(
'fileName'
).textContent=
`${file.name} · ${formatSize(file.size)}`;


document.getElementById(
'uploadConfirmBtn'
).disabled=false;

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


c.getContext('2d')
.drawImage(
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

});
}


async function doUpload(){

const file=
state.selectedFile;


if(!file)return;


const btn=
document.getElementById(
'uploadConfirmBtn'
);


btn.disabled=true;

btn.textContent=
'检查空间…';


try{

if(
!(await checkSpace(file.size))
){

btn.disabled=false;

return;

}


btn.textContent=
'生成缩略图…';


const thumbnail=
await createThumbnail(file);


btn.textContent=
'保存原文件…';


const blob=
file.slice(
0,
file.size,
CONFIG.VIDEO_TYPE
);


const v={

id:
Date.now().toString(36)+
Math.random().toString(36).slice(2,8),

name:file.name,

category:
document.getElementById(
'uploadCat'
).value||
'未分类',

blob,

size:file.size,

type:CONFIG.VIDEO_TYPE,

createdAt:Date.now(),

thumbnail

};


const data={

videos:[
...state.data.videos,
v
]

};


await IDB.set(
CONFIG.DB_KEY,
data
);


state.data=data;


renderCats();
renderVideos();
updateStorage();


closeModal(
'uploadModal'
);


state.selectedFile=null;


toast(
'上传成功，原 MP4 已保存'
);


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
!state.selectedFile;

}

}


function dataURLToBlob(s){

const [
head,
body
]=s.split(',',2);


if(!body)
throw new Error(
'备份数据损坏'
);


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

});
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

const b=asBlob(v);

if(!b)continue;


videos.push({

id:v.id,

name:v.name,

category:v.category,

data:
await blobToDataURL(b),

size:b.size,

type:CONFIG.VIDEO_TYPE,

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


const blob=
new Blob(
[
JSON.stringify(payload)
],
{
type:'application/json'
}
);


const u=
URL.createObjectURL(blob);


const a=
document.createElement('a');


a.href=u;

a.download=
`video-backup-${new Date().toISOString().slice(0,10)}.json`;


document.body.appendChild(a);

a.click();

a.remove();


setTimeout(
()=>{
URL.revokeObjectURL(u);
},
1000
);


toast('备份已导出');


}catch(e){

toast(
'导出失败：'+e.message,
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
!/\.json$/i.test(file.name)
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
JSON.parse(r.result);


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
`${file.name} · ${o.videos.length} 个视频`;


document.getElementById(
'importConfirmBtn'
).disabled=false;


}catch(e){

toast(
'无效的备份文件：'+e.message,
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
`确定恢复备份？这将覆盖当前所有数据（${o.videos.length} 个视频）。`
)
)return;


const btn=
document.getElementById(
'importConfirmBtn'
);


btn.disabled=true;

btn.textContent=
'恢复中…';


try{

const videos=
o.videos.map(v=>{

const b=
dataURLToBlob(v.data);


return{

id:v.id,

name:v.name,

category:
o.categories.includes(v.category)
?v.category
:'未分类',

blob:b,

size:b.size,

type:CONFIG.VIDEO_TYPE,

createdAt:
Number(v.createdAt)||
Date.now(),

thumbnail:
v.thumbnail||''

};

});


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
u=>{
URL.revokeObjectURL(u);
}
);


state.objectUrls.clear();


state.data={
videos
};


state.cats=cats;


saveCats();


state.currentCat='全部';


document.getElementById(
'pageTitle'
).textContent=
'全部视频';


renderCats();
renderVideos();
updateStorage();


closeModal(
'importModal'
);


toast(
'备份恢复成功'
);


}catch(e){

toast(
'恢复失败：'+e.message,
'error'
);

}finally{

btn.textContent='恢复';

btn.disabled=
!state.importData;

}

}


function openAddCat(){

document.getElementById(
'newCatName'
).value='';


openModal('catModal');


setTimeout(
()=>{
document
.getElementById('newCatName')
.focus();
},
100
);

}


function addCat(){

const i=
document.getElementById(
'newCatName'
);


const n=
i.value.trim();


if(!n)
return toast(
'请输入分类名称',
'error'
);


if(
state.cats.includes(n)
)
return toast(
'分类已存在',
'error'
);


state.cats.push(n);


if(saveCats()){

renderCats();

closeModal(
'catModal'
);

toast(
'分类添加成功'
);

}

}


async function deleteCat(c){

if(
c==='全部'||
c==='未分类'
)return;


const count=
state.data.videos.filter(
v=>v.category===c
).length;


if(
!confirm(
count
?
`确定删除分类「${c}」？${count} 个视频将移至「未分类」。`
:
`确定删除空分类「${c}」？`
)
)return;


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


state.data.videos.forEach(
v=>{

if(v.category===c)
v.category='未分类';

}
);


if(
state.currentCat===c
)
state.currentCat='全部';


if(
!(
saveCats()&&
await saveVideos()
)
){

state.cats=cats;

state.data.videos=videos;

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


toast(
'分类已删除'
);

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

return openModal(
'catManageModal'
);

}


cats.forEach(c=>{

const item=
document.createElement('div');


item.className=
'cat-manage-item';


item.innerHTML=`

<div class="cat-left">

<span>${icon(c)}</span>

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
()=>renameCat(
c,
input.value.trim(),
input
)
);


item.querySelector(
'button'
).addEventListener(
'click',
()=>deleteCat(c)
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


if(
state.cats.includes(newName)
){

toast(
'分类名称已存在',
'error'
);

input.value=oldName;

return;

}


const idx=
state.cats.indexOf(
oldName
);


const oldVideos=
state.data.videos.map(
v=>({...v})
);


state.cats[idx]=newName;


state.data.videos.forEach(
v=>{

if(
v.category===oldName
)
v.category=newName;

}
);


if(
state.currentCat===oldName
)
state.currentCat=newName;


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


openCatManage();


toast(
'重命名成功'
);

}


function bind(){

const on=(
id,
e,
fn
)=>
document
.getElementById(id)
?.addEventListener(
e,
fn
);


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
x=>x.id===
state.currentPlayerId
);

if(v)
downloadVideo(v);

}
);


on(
'fileInput',
'change',
e=>{

handleFile(
e.target.files[0]
);

}
);


on(
'importInput',
'change',
e=>{

handleImport(
e.target.files[0]
);

}
);


document
.querySelectorAll(
'[data-close]'
)
.forEach(
b=>{

b.addEventListener(
'click',
()=>closeModal(
b.dataset.close
)
);

}
);


document
.querySelectorAll(
'.modal-overlay'
)
.forEach(
o=>{

o.addEventListener(
'click',
e=>{

if(e.target===o)
closeModal(o.id);

}
);

}
);


const drop=(
id,
input,
handler
)=>{

const d=
document.getElementById(id);


d?.addEventListener(
'click',
()=>{

document
.getElementById(input)
?.click();

}
);


d?.addEventListener(
'dragover',
e=>{

e.preventDefault();

d.classList.add(
'dragover'
);

}
);


d?.addEventListener(
'dragleave',
()=>{

d.classList.remove(
'dragover'
);

}
);


d?.addEventListener(
'drop',
e=>{

e.preventDefault();

d.classList.remove(
'dragover'
);

handler(
e.dataTransfer.files[0]
);

}
);

};


drop(
'fileDrop',
'fileInput',
handleFile
);


drop(
'importDrop',
'importInput',
handleImport
);


on(
'newCatName',
'keydown',
e=>{

if(e.key==='Enter')
addCat();

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
]
.forEach(closeModal);

closeSidebar();

}

}
);


window.addEventListener(
'beforeunload',
()=>{

state.objectUrls.forEach(
u=>{
URL.revokeObjectURL(u);
}
);

}
);

}


document.addEventListener(
'DOMContentLoaded',
()=>{

bind();
loadData();

}
);