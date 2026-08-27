// ==================== 配置 ====================
const CONFIG = {
    DB_NAME: 'VideoLibraryDB',
    DB_VERSION: 1,
    STORE: 'library',
    DB_KEY: 'videoLib_v1',
    CAT_KEY: 'videoLib_cats_v1',
    DEFAULT_CATS: ['全部', '未分类', '教程', '电影', '音乐', '其他'],
    ICONS: {'全部':'📁','未分类':'📄','教程':'📚','电影':'🎬','音乐':'🎵','其他':'📦'},
    MAX_FILE_SIZE: 1024 * 1024 * 1024
};

// ==================== IndexedDB ====================
const IDB = {
    db: null,
    open() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);
            const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(CONFIG.STORE)) db.createObjectStore(CONFIG.STORE);
            };
            req.onsuccess = e => {
                this.db = e.target.result;
                this.db.onversionchange = () => this.db.close();
                resolve(this.db);
            };
            req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
        });
    },
    async get(key) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONFIG.STORE, 'readonly');
            const req = tx.objectStore(CONFIG.STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async set(key, value) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONFIG.STORE, 'readwrite');
            tx.objectStore(CONFIG.STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB 写入失败'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 写入被中止'));
        });
    }
};

const state = {
    data: { videos: [] },
    cats: [...CONFIG.DEFAULT_CATS],
    currentCat: '全部',
    selectedFile: null,
    importData: null,
    objectUrls: new Map()
};

// ==================== 工具 ====================
function escapeHtml(str = '') {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}
function formatSize(bytes = 0) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function getCatIcon(cat) { return CONFIG.ICONS[cat] || '🏷️'; }
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast ${type} show`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => t.classList.remove('show'), 3000);
}
function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    if (id === 'playerModal') {
        const v = document.getElementById('playerVideo');
        if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    }
}
function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
}
function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebarOverlay')?.classList.toggle('active');
}
function getVideoUrl(v) {
    if (!v) return '';
    if (v.blob instanceof Blob) {
        if (!state.objectUrls.has(v.id)) state.objectUrls.set(v.id, URL.createObjectURL(v.blob));
        return state.objectUrls.get(v.id);
    }
    return typeof v.data === 'string' ? v.data : '';
}
function revokeVideoUrl(id) {
    const url = state.objectUrls.get(id);
    if (url) { URL.revokeObjectURL(url); state.objectUrls.delete(id); }
}

// ==================== 数据 ====================
async function loadData() {
    try {
        const rawCats = localStorage.getItem(CONFIG.CAT_KEY);
        state.cats = rawCats ? JSON.parse(rawCats) : [...CONFIG.DEFAULT_CATS];
        if (!Array.isArray(state.cats) || !state.cats.includes('全部') || !state.cats.includes('未分类')) state.cats = [...CONFIG.DEFAULT_CATS];
    } catch { state.cats = [...CONFIG.DEFAULT_CATS]; }

    try {
        const data = await IDB.get(CONFIG.DB_KEY);
        state.data = data && Array.isArray(data.videos) ? data : { videos: [] };
        // 兼容旧版本：旧数据仍可能是 Base64 data 字段，保持可播放；新上传统一使用 Blob。
        renderCats();
        renderVideos();
        updateStorageBar();
    } catch (e) {
        console.error(e);
        state.data = { videos: [] };
        renderCats(); renderVideos(); updateStorageBar();
        showToast('视频库加载失败：' + e.message, 'error');
    }
}
function saveCats() {
    try { localStorage.setItem(CONFIG.CAT_KEY, JSON.stringify(state.cats)); return true; }
    catch (e) { showToast('分类保存失败', 'error'); return false; }
}
async function saveVideos() {
    try { await IDB.set(CONFIG.DB_KEY, state.data); updateStorageBar(); return true; }
    catch (e) { showToast('视频保存失败：' + e.message, 'error'); return false; }
}
async function updateStorageBar() {
    const videos = state.data.videos || [];
    let used = 0;
    videos.forEach(v => {
        if (v.blob instanceof Blob) used += v.blob.size;
        else if (typeof v.data === 'string' && v.data.startsWith('data:')) used += Math.max(0, Math.round((v.data.length - (v.data.indexOf(',') + 1)) * 0.75));
        else used += Number(v.size) || 0;
    });
    const fill = document.getElementById('storageFill');
    const text = document.getElementById('storageText');
    if (text) text.textContent = `视频占用 ${formatSize(used)} · ${videos.length} 个`;

    let quota = 0;
    try {
        if (navigator.storage?.estimate) {
            const estimate = await navigator.storage.estimate();
            quota = estimate.quota || 0;
        }
    } catch {}
    if (fill) {
        const denominator = quota > 0 ? quota : Math.max(50 * 1024 * 1024, used * 2);
        fill.style.width = `${Math.min(used / denominator * 100, 100)}%`;
        fill.classList.toggle('warning', quota > 0 && used / quota > 0.7);
        fill.classList.toggle('danger', quota > 0 && used / quota > 0.9);
    }
}

// ==================== 分类 ====================
function renderCats() {
    const list = document.getElementById('catList');
    if (!list) return;
    list.innerHTML = '';
    state.cats.forEach(cat => {
        const count = cat === '全部' ? state.data.videos.length : state.data.videos.filter(v => v.category === cat).length;
        const div = document.createElement('div');
        div.className = `cat-item${cat === state.currentCat ? ' active' : ''}`;
        div.innerHTML = `<span class="cat-icon">${getCatIcon(cat)}</span><span class="cat-name">${escapeHtml(cat)}</span><span class="cat-count">${count}</span>${cat !== '全部' && cat !== '未分类' ? '<button class="cat-del-btn" title="删除分类" aria-label="删除分类">−</button>' : ''}`;
        div.addEventListener('click', e => { if (!e.target.closest('.cat-del-btn')) switchCat(cat); });
        const del = div.querySelector('.cat-del-btn');
        if (del) del.addEventListener('click', e => { e.stopPropagation(); deleteCat(cat); });
        list.appendChild(div);
    });
}
function switchCat(cat) {
    state.currentCat = cat;
    document.getElementById('pageTitle').textContent = cat === '全部' ? '全部视频' : cat;
    renderCats(); renderVideos(); closeSidebar();
}
function openAddCat() {
    const input = document.getElementById('newCatName');
    if (input) input.value = '';
    openModal('catModal'); setTimeout(() => input?.focus(), 100);
}
function doAddCat() {
    const input = document.getElementById('newCatName');
    const name = input?.value.trim() || '';
    if (!name) return showToast('请输入分类名称', 'error');
    if (state.cats.includes(name)) return showToast('分类已存在', 'error');
    state.cats.push(name);
    if (!saveCats()) { state.cats.pop(); return; }
    renderCats(); closeModal('catModal'); showToast('分类添加成功');
}
async function deleteCat(cat) {
    if (cat === '全部' || cat === '未分类') return;
    const count = state.data.videos.filter(v => v.category === cat).length;
    const msg = count ? `确定删除分类「${cat}」？该分类下的 ${count} 个视频将移至「未分类」。` : `确定删除空分类「${cat}」？`;
    if (!confirm(msg)) return;
    const oldCats = [...state.cats];
    const oldData = state.data.videos.map(v => ({...v}));
    state.cats = state.cats.filter(c => c !== cat);
    state.data.videos.forEach(v => { if (v.category === cat) v.category = '未分类'; });
    if (state.currentCat === cat) state.currentCat = '全部';
    const ok = saveCats() && await saveVideos();
    if (!ok) { state.cats = oldCats; state.data.videos = oldData; return; }
    document.getElementById('pageTitle').textContent = state.currentCat === '全部' ? '全部视频' : state.currentCat;
    renderCats(); renderVideos(); showToast('分类已删除');
}
function openCatManage() {
    const body = document.getElementById('catManageBody');
    if (!body) return;
    body.innerHTML = '';
    const cats = state.cats.filter(c => c !== '全部' && c !== '未分类');
    if (!cats.length) { body.innerHTML = '<div class="manage-empty">暂无可管理的自定义分类</div>'; openModal('catManageModal'); return; }
    cats.forEach(cat => {
        const item = document.createElement('div'); item.className = 'cat-manage-item';
        item.innerHTML = `<div class="cat-left"><span>${getCatIcon(cat)}</span><input type="text" maxlength="30" value="${escapeHtml(cat)}" aria-label="分类名称"></div><div class="cat-actions"><button class="btn-del" title="删除" aria-label="删除">🗑</button></div>`;
        const input = item.querySelector('input');
        input.addEventListener('change', () => renameCat(cat, input.value.trim(), input));
        input.addEventListener('blur', () => { if (!input.value.trim()) input.value = cat; });
        item.querySelector('.btn-del').addEventListener('click', () => deleteCat(cat));
        body.appendChild(item);
    });
    openModal('catManageModal');
}
async function renameCat(oldName, newName, input) {
    if (!newName || newName === oldName) { if (input) input.value = oldName; return; }
    if (state.cats.includes(newName)) { showToast('分类名称已存在', 'error'); if (input) input.value = oldName; return; }
    const idx = state.cats.indexOf(oldName);
    if (idx < 0) return;
    state.cats[idx] = newName;
    state.data.videos.forEach(v => { if (v.category === oldName) v.category = newName; });
    if (state.currentCat === oldName) state.currentCat = newName;
    const ok = saveCats() && await saveVideos();
    if (!ok) { state.cats[idx] = oldName; state.data.videos.forEach(v => { if (v.category === newName) v.category = oldName; }); if (state.currentCat === newName) state.currentCat = oldName; if (input) input.value = oldName; return; }
    document.getElementById('pageTitle').textContent = state.currentCat === '全部' ? '全部视频' : state.currentCat;
    renderCats(); renderVideos(); openCatManage(); showToast('重命名成功');
}

// ==================== 视频 ====================
function renderVideos() {
    const container = document.getElementById('content');
    if (!container) return;
    const videos = state.currentCat === '全部' ? state.data.videos : state.data.videos.filter(v => v.category === state.currentCat);
    if (!videos.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎬</div><h3>暂无视频</h3><p>点击右上角「上传视频」添加你的第一个视频</p></div>`;
        return;
    }
    const grid = document.createElement('div'); grid.className = 'video-grid';
    videos.slice().reverse().forEach(v => {
        const card = document.createElement('div'); card.className = 'video-card';
        const src = getVideoUrl(v);
        card.innerHTML = `<div class="video-thumb"><video preload="metadata" muted playsinline></video><div class="play-icon">▶</div><button class="delete-btn" title="删除视频" aria-label="删除视频">×</button></div><div class="video-info"><div class="v-title" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</div><div class="v-meta"><span>${formatSize(v.size)}</span><span>${formatDate(v.createdAt)}</span></div><span class="v-cat">${escapeHtml(v.category || '未分类')}</span></div>`;
        const thumb = card.querySelector('video');
        if (src) thumb.src = src;
        card.addEventListener('click', () => playVideo(v));
        card.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); deleteVideo(v.id); });
        grid.appendChild(card);
    });
    container.replaceChildren(grid);
}
function playVideo(v) {
    const video = document.getElementById('playerVideo');
    const title = document.getElementById('playerTitle');
    const meta = document.getElementById('playerMeta');
    if (!video || !title || !meta) return;
    const src = getVideoUrl(v);
    if (!src) return showToast('视频数据不存在', 'error');
    video.onerror = () => { closeModal('playerModal'); showToast('视频加载失败，格式可能不受浏览器支持', 'error'); };
    video.src = src; title.textContent = v.name; meta.textContent = `${v.category || '未分类'} · ${formatSize(v.size)} · ${new Date(v.createdAt).toLocaleString()}`;
    openModal('playerModal');
    video.play().catch(() => {});
}
async function deleteVideo(id) {
    if (!confirm('确定删除这个视频？')) return;
    const old = state.data.videos;
    const target = old.find(v => v.id === id);
    state.data.videos = old.filter(v => v.id !== id);
    const ok = await saveVideos();
    if (!ok) { state.data.videos = old; return; }
    revokeVideoUrl(id); renderCats(); renderVideos(); showToast('视频已删除');
}

// ==================== 上传 ====================
function openUpload() {
    const sel = document.getElementById('uploadCat');
    if (sel) sel.innerHTML = state.cats.filter(c => c !== '全部').map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    state.selectedFile = null;
    document.getElementById('fileName').textContent = '';
    const btn = document.getElementById('uploadConfirmBtn'); if (btn) { btn.disabled = true; btn.textContent = '上传'; }
    openModal('uploadModal');
}
function handleFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('video/')) return showToast('请选择视频文件', 'error');
    if (file.size > CONFIG.MAX_FILE_SIZE) return showToast('单个视频超过 1GB，不建议直接导入', 'error');
    state.selectedFile = file;
    document.getElementById('fileName').textContent = `${file.name} · ${formatSize(file.size)}`;
    document.getElementById('uploadConfirmBtn').disabled = false;
}
async function doUpload() {
    const file = state.selectedFile;
    if (!file) return;
    const cat = document.getElementById('uploadCat')?.value || '未分类';
    const btn = document.getElementById('uploadConfirmBtn');
    btn.disabled = true; btn.textContent = '保存中…';
    try {
        const video = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,8), name: file.name, category: cat, blob: file, size: file.size, type: file.type, createdAt: Date.now() };
        const newData = { videos: [...state.data.videos, video] };
        await IDB.set(CONFIG.DB_KEY, newData);
        state.data = newData;
        renderCats(); renderVideos(); updateStorageBar(); closeModal('uploadModal'); showToast('上传成功！');
        state.selectedFile = null;
    } catch (e) {
        console.error(e); showToast('保存失败：' + (e.message || '存储空间不足'), 'error');
    } finally { btn.textContent = '上传'; btn.disabled = !state.selectedFile; }
}

// ==================== 备份 ====================
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
        reader.readAsDataURL(blob);
    });
}
async function exportBackup() {
    if (!state.data.videos.length) return showToast('暂无视频可备份', 'error');
    const btn = document.getElementById('exportBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中…'; }
    try {
        const videos = [];
        for (const v of state.data.videos) {
            const data = v.blob instanceof Blob ? await blobToDataURL(v.blob) : v.data;
            videos.push({ id:v.id, name:v.name, category:v.category, data, size:v.size, type:v.type, createdAt:v.createdAt });
        }
        const payload = { version: 2, exportedAt: Date.now(), categories: state.cats, videos };
        const blob = new Blob([JSON.stringify(payload)], {type:'application/json'});
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `video-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('备份已导出');
    } catch (e) { showToast('导出失败：' + e.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '📥 导出备份'; } }
}
function openImport() {
    state.importData = null; document.getElementById('importFileName').textContent = ''; document.getElementById('importConfirmBtn').disabled = true; openModal('importModal');
}
function handleImportSelect(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) return showToast('请选择 JSON 备份文件', 'error');
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const obj = JSON.parse(reader.result);
            if (!Array.isArray(obj.videos) || !Array.isArray(obj.categories)) throw new Error('缺少 videos 或 categories 数组');
            obj.videos.forEach((v,i) => { if (!v.id || !v.name || !v.data) throw new Error(`第 ${i+1} 个视频数据不完整`); });
            state.importData = obj; document.getElementById('importFileName').textContent = `${file.name} · ${obj.videos.length} 个视频 · ${obj.categories.length} 个分类`; document.getElementById('importConfirmBtn').disabled = false;
        } catch (e) { state.importData = null; document.getElementById('importConfirmBtn').disabled = true; showToast('无效的备份文件：' + e.message, 'error'); }
    };
    reader.onerror = () => showToast('文件读取失败', 'error'); reader.readAsText(file);
}
async function doImport() {
    const obj = state.importData; if (!obj) return;
    if (!confirm(`确定恢复备份？这将覆盖当前所有数据（${obj.videos.length} 个视频）。`)) return;
    const btn = document.getElementById('importConfirmBtn'); btn.disabled = true; btn.textContent = '恢复中…';
    try {
        const videos = obj.videos.map(v => ({ id:v.id, name:v.name, category:obj.categories.includes(v.category) ? v.category : '未分类', data:v.data, size:Number(v.size)||0, type:v.type||'video/*', createdAt:Number(v.createdAt)||Date.now() }));
        // 备份格式保持可移植，恢复后 Blob 化，避免后续播放继续依赖巨大的 Base64 字符串。
        const converted = [];
        for (const v of videos) {
            const blob = dataURLToBlob(v.data);
            converted.push({...v, blob});
            delete converted[converted.length-1].data;
        }
        const cats = [...new Set(obj.categories.filter(c => typeof c === 'string' && c.trim()))];
        if (!cats.includes('全部')) cats.unshift('全部');
        if (!cats.includes('未分类')) cats.splice(1,0,'未分类');
        const newData = {videos:converted}; await IDB.set(CONFIG.DB_KEY,newData); state.data=newData; state.cats=cats; saveCats(); state.currentCat='全部';
        state.objectUrls.forEach(url => URL.revokeObjectURL(url)); state.objectUrls.clear();
        document.getElementById('pageTitle').textContent='全部视频'; renderCats(); renderVideos(); updateStorageBar(); closeModal('importModal'); showToast('备份恢复成功！');
    } catch(e) { showToast('恢复失败：' + e.message, 'error'); }
    finally { btn.textContent='恢复'; btn.disabled=!state.importData; }
}
function dataURLToBlob(dataUrl) {
    if (!dataUrl.startsWith('data:')) throw new Error('备份中的视频数据格式错误');
    const [head, body] = dataUrl.split(',',2); const mime = (head.match(/data:([^;]+)/)||[])[1] || 'application/octet-stream';
    const binary = atob(body); const chunk=1024*1024; const parts=[];
    for(let i=0;i<binary.length;i+=chunk){ const slice=binary.slice(i,Math.min(i+chunk,binary.length)); const arr=new Uint8Array(slice.length); for(let j=0;j<slice.length;j++) arr[j]=slice.charCodeAt(j); parts.push(arr); }
    return new Blob(parts,{type:mime});
}

// ==================== 事件 ====================
function bindEvents() {
    const on=(id,ev,fn)=>document.getElementById(id)?.addEventListener(ev,fn);
    on('uploadBtnMain','click',openUpload); on('addCatBtn','click',openAddCat); on('addCatConfirmBtn','click',doAddCat); on('uploadConfirmBtn','click',doUpload); on('catManageBtn','click',openCatManage); on('exportBtn','click',exportBackup); on('importBtn','click',openImport);
    on('menuBtn','click',toggleSidebar); on('sidebarOverlay','click',closeSidebar); on('importConfirmBtn','click',doImport);
    on('fileInput','change',e=>handleFileSelect(e.target.files[0])); on('importInput','change',e=>handleImportSelect(e.target.files[0]));
    document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
    document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeModal(o.id)}));
    const drop=(id,handler,valid,msg)=>{ const el=document.getElementById(id); if(!el)return; el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('dragover')}); el.addEventListener('dragleave',()=>el.classList.remove('dragover')); el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('dragover');const f=e.dataTransfer.files[0]; if(valid(f))handler(f);else showToast(msg,'error')}); el.addEventListener('click',()=>handler(null)); };
    // 点击 drop 区通过 input 打开；拖拽则直接处理。
    const fileDrop=document.getElementById('fileDrop'); fileDrop?.addEventListener('click',()=>document.getElementById('fileInput')?.click());
    fileDrop?.addEventListener('dragover',e=>{e.preventDefault();fileDrop.classList.add('dragover')}); fileDrop?.addEventListener('dragleave',()=>fileDrop.classList.remove('dragover')); fileDrop?.addEventListener('drop',e=>{e.preventDefault();fileDrop.classList.remove('dragover');handleFileSelect(e.dataTransfer.files[0])});
    const importDrop=document.getElementById('importDrop'); importDrop?.addEventListener('click',()=>document.getElementById('importInput')?.click()); importDrop?.addEventListener('dragover',e=>{e.preventDefault();importDrop.classList.add('dragover')}); importDrop?.addEventListener('dragleave',()=>importDrop.classList.remove('dragover')); importDrop?.addEventListener('drop',e=>{e.preventDefault();importDrop.classList.remove('dragover');handleImportSelect(e.dataTransfer.files[0])});
    on('newCatName','keydown',e=>{if(e.key==='Enter')doAddCat()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){['uploadModal','playerModal','catModal','importModal','catManageModal'].forEach(closeModal);closeSidebar()}});
    window.addEventListener('beforeunload',()=>state.objectUrls.forEach(url=>URL.revokeObjectURL(url)));
}
function init(){bindEvents();loadData();}
document.addEventListener('DOMContentLoaded',init);