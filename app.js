// ==================== 配置 ====================
const CONFIG = {
    DB_KEY: 'videoLib_v1',
    CAT_KEY: 'videoLib_cats_v1',
    DEFAULT_CATS: ['全部', '未分类', '教程', '电影', '音乐', '其他'],
    MAX_STORAGE: 5 * 1024 * 1024,
    ICONS: {
        '全部': '📁', '未分类': '📄', '教程': '📚',
        '电影': '🎬', '音乐': '🎵', '其他': '📦'
    }
};

// ==================== 状态 ====================
const state = {
    data: { videos: [] },
    cats: [],
    currentCat: '全部',
    selectedFile: null,
    importData: null
};

// ==================== 数据层 ====================
function loadData() {
    try {
        const raw = localStorage.getItem(CONFIG.DB_KEY);
        if (raw) state.data = JSON.parse(raw);
        const rawCats = localStorage.getItem(CONFIG.CAT_KEY);
        if (rawCats) state.cats = JSON.parse(rawCats);
        else state.cats = [...CONFIG.DEFAULT_CATS];
    } catch (e) {
        state.cats = [...CONFIG.DEFAULT_CATS];
    }
}

function saveData() {
    localStorage.setItem(CONFIG.DB_KEY, JSON.stringify(state.data));
    localStorage.setItem(CONFIG.CAT_KEY, JSON.stringify(state.cats));
    updateStorageBar();
}

function updateStorageBar() {
    const used = new Blob([JSON.stringify(localStorage)]).size;
    const pct = Math.min((used / CONFIG.MAX_STORAGE) * 100, 100);
    const fill = document.getElementById('storageFill');
    const text = document.getElementById('storageText');
    fill.style.width = pct + '%';
    fill.style.background = pct > 90 ? '#ff6b6b' : pct > 70 ? '#ffd93d' : '#4ecdc4';
    text.textContent = `已用 ${(used / 1024 / 1024).toFixed(2)} / 5 MB`;
}

// ==================== 分类 ====================
function getCatIcon(cat) {
    return CONFIG.ICONS[cat] || '🏷️';
}

function renderCats() {
    const list = document.getElementById('catList');
    list.innerHTML = '';
    state.cats.forEach(cat => {
        const count = cat === '全部'
            ? state.data.videos.length
            : state.data.videos.filter(v => v.category === cat).length;
        const div = document.createElement('div');
        div.className = 'cat-item' + (cat === state.currentCat ? ' active' : '');
        div.innerHTML = `
            <span class="cat-icon">${getCatIcon(cat)}</span>
            <span class="cat-name">${cat}</span>
            <span class="cat-count">${count}</span>
        `;
        div.addEventListener('click', () => switchCat(cat));
        if (cat !== '全部' && cat !== '未分类') {
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openCatManage();
            });
        }
        list.appendChild(div);
    });
}

function switchCat(cat) {
    state.currentCat = cat;
    document.getElementById('pageTitle').textContent = cat === '全部' ? '全部视频' : cat;
    renderCats();
    renderVideos();
}

function openAddCat() {
    document.getElementById('newCatName').value = '';
    openModal('catModal');
    setTimeout(() => document.getElementById('newCatName').focus(), 100);
}

function doAddCat() {
    const name = document.getElementById('newCatName').value.trim();
    if (!name) return showToast('请输入分类名称', 'error');
    if (state.cats.includes(name)) return showToast('分类已存在', 'error');
    state.cats.push(name);
    saveData();
    renderCats();
    closeModal('catModal');
    showToast('分类添加成功');
}

function openCatManage() {
    const body = document.getElementById('catManageBody');
    body.innerHTML = '';
    state.cats.filter(c => c !== '全部' && c !== '未分类').forEach(cat => {
        const item = document.createElement('div');
        item.className = 'cat-manage-item';
        item.innerHTML = `
            <div class="cat-left">
                <span>${getCatIcon(cat)}</span>
                <input type="text" value="${cat}" data-old="${cat}">
            </div>
            <div class="cat-actions">
                <button class="btn-del" data-cat="${cat}" title="删除">🗑</button>
            </div>
        `;
        const input = item.querySelector('input');
        input.addEventListener('change', () => renameCat(cat, input.value.trim()));
        input.addEventListener('blur', () => {
            if (!input.value.trim()) input.value = cat;
        });
        item.querySelector('.btn-del').addEventListener('click', () => deleteCat(cat));
        body.appendChild(item);
    });
    openModal('catManageModal');
}

function renameCat(oldName, newName) {
    if (!newName || newName === oldName) return;
    if (state.cats.includes(newName)) {
        showToast('分类名称已存在', 'error');
        return;
    }
    const idx = state.cats.indexOf(oldName);
    if (idx > -1) state.cats[idx] = newName;
    state.data.videos.forEach(v => {
        if (v.category === oldName) v.category = newName;
    });
    if (state.currentCat === oldName) state.currentCat = newName;
    saveData();
    renderCats();
    renderVideos();
    showToast('重命名成功');
}

function deleteCat(cat) {
    if (!confirm(`确定删除分类「${cat}」？该分类下的视频将移至「未分类」。`)) return;
    state.cats = state.cats.filter(c => c !== cat);
    state.data.videos.forEach(v => {
        if (v.category === cat) v.category = '未分类';
    });
    if (state.currentCat === cat) {
        state.currentCat = '全部';
        document.getElementById('pageTitle').textContent = '全部视频';
    }
    saveData();
    renderCats();
    renderVideos();
    openCatManage();
    showToast('分类已删除');
}

// ==================== 视频 ====================
function renderVideos() {
    const container = document.getElementById('content');
    const videos = state.currentCat === '全部'
        ? state.data.videos
        : state.data.videos.filter(v => v.category === state.currentCat);

    if (videos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎬</div>
                <h3>暂无视频</h3>
                <p>点击右上角「上传视频」添加你的第一个视频</p>
            </div>`;
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'video-grid';
    videos.slice().reverse().forEach(v => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.innerHTML = `
            <div class="video-thumb">
                <video src="${v.data}" preload="metadata" muted></video>
                <div class="play-icon">▶</div>
                <button class="delete-btn" data-id="${v.id}" title="删除">×</button>
            </div>
            <div class="video-info">
                <div class="v-title" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</div>
                <div class="v-meta">
                    <span>${formatSize(v.size)}</span>
                    <span>${formatDate(v.createdAt)}</span>
                </div>
                <span class="v-cat">${v.category}</span>
            </div>
        `;
        card.addEventListener('click', () => playVideo(v));
        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteVideo(v.id);
        });
        grid.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(grid);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
}

function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function playVideo(v) {
    document.getElementById('playerVideo').src = v.data;
    document.getElementById('playerTitle').textContent = v.name;
    document.getElementById('playerMeta').textContent =
        `${v.category} · ${formatSize(v.size)} · ${new Date(v.createdAt).toLocaleString()}`;
    openModal('playerModal');
    document.getElementById('playerVideo').play();
}

function deleteVideo(id) {
    if (!confirm('确定删除这个视频？')) return;
    state.data.videos = state.data.videos.filter(v => v.id !== id);
    saveData();
    renderCats();
    renderVideos();
    showToast('视频已删除');
}

// ==================== 上传 ====================
function openUpload() {
    const sel = document.getElementById('uploadCat');
    sel.innerHTML = state.cats
        .filter(c => c !== '全部')
        .map(c => `<option value="${c}">${c}</option>`)
        .join('');
    state.selectedFile = null;
    document.getElementById('fileName').textContent = '';
    document.getElementById('uploadConfirmBtn').disabled = true;
    openModal('uploadModal');
}

function handleFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
        showToast('请选择视频文件', 'error');
        return;
    }
    state.selectedFile = file;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('uploadConfirmBtn').disabled = false;
}

function doUpload() {
    if (!state.selectedFile) return;
    const cat = document.getElementById('uploadCat').value;
    const reader = new FileReader();
    reader.onload = () => {
        const video = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: state.selectedFile.name,
            category: cat,
            data: reader.result,
            size: state.selectedFile.size,
            type: state.selectedFile.type,
            createdAt: Date.now()
        };
        state.data.videos.push(video);
        saveData();
        renderCats();
        renderVideos();
        closeModal('uploadModal');
        showToast('上传成功！');
    };
    reader.readAsDataURL(state.selectedFile);
}

// ==================== 备份 ====================
function exportBackup() {
    const payload = {
        version: 1,
        exportedAt: Date.now(),
        categories: state.cats,
        videos: state.data.videos
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('备份已导出');
}

function openImport() {
    state.importData = null;
    document.getElementById('importFileName').textContent = '';
    document.getElementById('importConfirmBtn').disabled = true;
    openModal('importModal');
}

function handleImportSelect(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const obj = JSON.parse(reader.result);
            if (!obj.videos || !Array.isArray(obj.videos)) throw new Error('格式错误');
            state.importData = obj;
            document.getElementById('importFileName').textContent =
                `${file.name} (${obj.videos.length} 个视频)`;
            document.getElementById('importConfirmBtn').disabled = false;
        } catch (err) {
            showToast('无效的备份文件', 'error');
        }
    };
    reader.readAsText(file);
}

function doImport() {
    if (!state.importData) return;
    if (!confirm(`确定恢复备份？这将覆盖当前所有数据（${state.importData.videos.length} 个视频）。`)) return;
    state.data.videos = state.importData.videos;
    if (state.importData.categories && Array.isArray(state.importData.categories)) {
        state.cats = state.importData.categories;
    }
    saveData();
    state.currentCat = '全部';
    document.getElementById('pageTitle').textContent = '全部视频';
    renderCats();
    renderVideos();
    closeModal('importModal');
    showToast('备份恢复成功！');
}

// ==================== 模态框 ====================
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'playerModal') {
        const v = document.getElementById('playerVideo');
        v.pause();
        v.src = '';
    }
}

// ==================== 提示 ====================
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + type;
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => t.classList.remove('show'), 2800);
}

// ==================== 事件绑定 ====================
function bindEvents() {
    // 上传
    document.getElementById('uploadBtnMain').addEventListener('click', openUpload);
    document.getElementById('addCatBtn').addEventListener('click', openAddCat);
    document.getElementById('addCatConfirmBtn').addEventListener('click', doAddCat);
    document.getElementById('uploadConfirmBtn').addEventListener('click', doUpload);
    document.getElementById('exportBtn').addEventListener('click', exportBackup);
    document.getElementById('importBtn').addEventListener('click', openImport);
    document.getElementById('importConfirmBtn').addEventListener('click', doImport);

    // 文件选择
    document.getElementById('fileInput').addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });
    document.getElementById('importInput').addEventListener('change', (e) => {
        handleImportSelect(e.target.files[0]);
    });

    // 点击关闭按钮
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // 点击遮罩关闭
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });

    // 拖拽上传
    const fileDrop = document.getElementById('fileDrop');
    fileDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDrop.classList.add('dragover');
    });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDrop.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('video/')) {
            handleFileSelect(file);
        } else {
            showToast('请拖拽视频文件', 'error');
        }
    });
    fileDrop.addEventListener('click', () => document.getElementById('fileInput').click());

    // 导入拖拽
    const importDrop = document.getElementById('importDrop');
    importDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        importDrop.classList.add('dragover');
    });
    importDrop.addEventListener('dragleave', () => importDrop.classList.remove('dragover'));
    importDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        importDrop.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.json')) {
            handleImportSelect(file);
        } else {
            showToast('请拖拽 JSON 备份文件', 'error');
        }
    });
    importDrop.addEventListener('click', () => document.getElementById('importInput').click());

    // 键盘
    document.getElementById('newCatName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doAddCat();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            ['uploadModal', 'playerModal', 'catModal', 'importModal', 'catManageModal']
                .forEach(id => closeModal(id));
        }
    });
}

// ==================== 初始化 ====================
function init() {
    loadData();
    bindEvents();
    renderCats();
    renderVideos();
    updateStorageBar();
}

document.addEventListener('DOMContentLoaded', init);
