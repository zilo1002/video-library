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

// ==================== IndexedDB ====================
const IDB = {
    DB_NAME: 'VideoLibraryDB',
    STORE: 'library',
    VERSION: 1,
    db: null,
    
    open() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);
            const req = indexedDB.open(this.DB_NAME, this.VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE)) {
                    db.createObjectStore(this.STORE);
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            req.onerror = () => reject(req.error);
        });
    },
    
    async get(key) {
        try {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE, 'readonly');
                const store = tx.objectStore(this.STORE);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            // fallback
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }
    },
    
    async set(key, value) {
        try {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE, 'readwrite');
                const store = tx.objectStore(this.STORE);
                const req = store.put(value, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            // fallback
            localStorage.setItem(key, JSON.stringify(value));
        }
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

// ==================== 工具函数 ====================
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

function getCatIcon(cat) {
    return CONFIG.ICONS[cat] || '🏷️';
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast ' + type;
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => t.classList.remove('show'), 3000);
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    if (id === 'playerModal') {
        const v = document.getElementById('playerVideo');
        if (v) {
            v.pause();
            v.src = '';
            v.oncanplay = null;
            v.onerror = null;
        }
    }
}

// ==================== 数据层 ====================
function loadData() {
    // 分类从 localStorage 加载
    try {
        const rawCats = localStorage.getItem(CONFIG.CAT_KEY);
        if (rawCats) state.cats = JSON.parse(rawCats);
        else state.cats = [...CONFIG.DEFAULT_CATS];
    } catch (e) {
        state.cats = [...CONFIG.DEFAULT_CATS];
    }
    
    // 视频数据从 IndexedDB 异步加载
    IDB.get(CONFIG.DB_KEY).then(data => {
        if (data && Array.isArray(data.videos)) {
            state.data = data;
        } else {
            state.data = { videos: [] };
        }
        renderCats();
        renderVideos();
        updateStorageBar();
    }).catch(e => {
        console.error('视频数据加载失败:', e);
        state.data = { videos: [] };
        renderCats();
        renderVideos();
        updateStorageBar();
    });
}

function saveCats() {
    try {
        localStorage.setItem(CONFIG.CAT_KEY, JSON.stringify(state.cats));
        return true;
    } catch (e) {
        showToast('分类保存失败', 'error');
        return false;
    }
}

function saveVideos() {
    return IDB.set(CONFIG.DB_KEY, state.data).then(() => {
        updateStorageBar();
        return true;
    }).catch(e => {
        showToast('视频保存失败：' + e.message, 'error');
        return false;
    });
}

function updateStorageBar() {
    let used = 0;
    if (state.data.videos) {
        state.data.videos.forEach(v => {
            if (v.data) used += v.data.length * 2; // UTF-16
        });
    }
    const mb = (used / 1024 / 1024).toFixed(2);
    const fill = document.getElementById('storageFill');
    const text = document.getElementById('storageText');
    if (fill) fill.style.width = Math.min((used / 1024 / 1024 / 50) * 100, 100) + '%';
    if (text) text.textContent = `视频占用 ${mb} MB · ${state.data.videos.length} 个`;
    if (fill) {
        const pct = used / 1024 / 1024;
        fill.style.background = pct > 40 ? '#ff6b6b' : pct > 20 ? '#ffd93d' : '#4ecdc4';
    }
}

// ==================== 分类 ====================
function renderCats() {
    const list = document.getElementById('catList');
    if (!list) return;
    list.innerHTML = '';
    state.cats.forEach(cat => {
        const count = cat === '全部'
            ? state.data.videos.length
            : state.data.videos.filter(v => v.category === cat).length;
        const div = document.createElement('div');
        div.className = 'cat-item' + (cat === state.currentCat ? ' active' : '');
        const deletable = cat !== '全部' && cat !== '未分类';
        div.innerHTML = `
            <span class="cat-icon">${getCatIcon(cat)}</span>
            <span class="cat-name">${escapeHtml(cat)}</span>
            <span class="cat-count">${count}</span>
            ${deletable ? `<button class="cat-del-btn" title="删除分类">−</button>` : ''}
        `;
        div.addEventListener('click', (e) => {
            if (e.target.closest('.cat-del-btn')) return;
            switchCat(cat);
        });
        if (deletable) {
            div.querySelector('.cat-del-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCat(cat);
            });
        }
        list.appendChild(div);
    });
}

function switchCat(cat) {
    state.currentCat = cat;
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = cat === '全部' ? '全部视频' : cat;
    renderCats();
    renderVideos();
}

function openAddCat() {
    const input = document.getElementById('newCatName');
    if (input) input.value = '';
    openModal('catModal');
    setTimeout(() => {
        const el = document.getElementById('newCatName');
        if (el) el.focus();
    }, 100);
}

function doAddCat() {
    const input = document.getElementById('newCatName');
    const name = input ? input.value.trim() : '';
    if (!name) return showToast('请输入分类名称', 'error');
    if (state.cats.includes(name)) return showToast('分类已存在', 'error');
    state.cats.push(name);
    if (saveCats()) {
        renderCats();
        closeModal('catModal');
        showToast('分类添加成功');
    } else {
        state.cats.pop();
    }
}

function deleteCat(cat) {
    const catVideos = state.data.videos.filter(v => v.category === cat).length;
    const msg = catVideos > 0
        ? `确定删除分类「${cat}」？该分类下的 ${catVideos} 个视频将移至「未分类」。`
        : `确定删除空分类「${cat}」？`;
    if (!confirm(msg)) return;
    state.cats = state.cats.filter(c => c !== cat);
    state.data.videos.forEach(v => {
        if (v.category === cat) v.category = '未分类';
    });
    if (state.currentCat === cat) {
        state.currentCat = '全部';
        const title = document.getElementById('pageTitle');
        if (title) title.textContent = '全部视频';
    }
    
    Promise.all([saveCats(), saveVideos()]).then(() => {
        renderCats();
        renderVideos();
        showToast('分类已删除');
    }).catch(() => {
        showToast('删除失败', 'error');
    });
}

function openCatManage() {
    const body = document.getElementById('catManageBody');
    if (!body) return;
    body.innerHTML = '';
    state.cats.filter(c => c !== '全部' && c !== '未分类').forEach(cat => {
        const item = document.createElement('div');
        item.className = 'cat-manage-item';
        item.innerHTML = `
            <div class="cat-left">
                <span>${getCatIcon(cat)}</span>
                <input type="text" value="${escapeHtml(cat)}" data-old="${escapeHtml(cat)}">
            </div>
            <div class="cat-actions">
                <button class="btn-del" title="删除">🗑</button>
            </div>
        `;
        const input = item.querySelector('input');
        input.addEventListener('change', () => {
            const newName = input.value.trim();
            if (newName && newName !== cat) renameCat(cat, newName);
        });
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
    
    Promise.all([saveCats(), saveVideos()]).then(() => {
        renderCats();
        renderVideos();
        showToast('重命名成功');
    }).catch(() => {
        showToast('重命名失败', 'error');
    });
}

// ==================== 视频 ====================
function renderVideos() {
    const container = document.getElementById('content');
    if (!container) return;
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
                <button class="delete-btn" title="删除视频">×</button>
            </div>
            <div class="video-info">
                <div class="v-title" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</div>
                <div class="v-meta">
                    <span>${formatSize(v.size)}</span>
                    <span>${formatDate(v.createdAt)}</span>
                </div>
                <span class="v-cat">${escapeHtml(v.category)}</span>
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

function playVideo(v) {
    const video = document.getElementById('playerVideo');
    const title = document.getElementById('playerTitle');
    const meta = document.getElementById('playerMeta');
    if (!video || !title || !meta) return;
    
    video.src = v.data;
    title.textContent = v.name;
    meta.textContent = `${v.category} · ${formatSize(v.size)} · ${new Date(v.createdAt).toLocaleString()}`;

    video.oncanplay = () => {
        openModal('playerModal');
        video.play().catch(() => {});
    };

    video.onerror = () => {
        showToast('视频加载失败，格式可能不受支持', 'error');
        closeModal('playerModal');
    };

    if (video.readyState >= 2) {
        openModal('playerModal');
        video.play().catch(() => {});
    }
}

function deleteVideo(id) {
    if (!confirm('确定删除这个视频？')) return;
    const newVideos = state.data.videos.filter(v => v.id !== id);
    const prevVideos = state.data.videos;
    state.data.videos = newVideos;
    
    saveVideos().then(ok => {
        if (ok) {
            renderCats();
            renderVideos();
            showToast('视频已删除');
        } else {
            state.data.videos = prevVideos;
        }
    });
}

// ==================== 上传 ====================
function openUpload() {
    const sel = document.getElementById('uploadCat');
    if (sel) {
        sel.innerHTML = state.cats
            .filter(c => c !== '全部')
            .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
            .join('');
    }
    state.selectedFile = null;
    const fileName = document.getElementById('fileName');
    const btn = document.getElementById('uploadConfirmBtn');
    if (fileName) fileName.textContent = '';
    if (btn) btn.disabled = true;
    openModal('uploadModal');
}

function handleFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
        showToast('请选择视频文件', 'error');
        return;
    }
    state.selectedFile = file;
    const fileName = document.getElementById('fileName');
    const btn = document.getElementById('uploadConfirmBtn');
    if (fileName) fileName.textContent = file.name;
    if (btn) btn.disabled = false;
}

function doUpload() {
    if (!state.selectedFile) return;
    const cat = document.getElementById('uploadCat')?.value || '未分类';
    const btn = document.getElementById('uploadConfirmBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '上传中...';
    }

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
        
        const newData = { videos: [...state.data.videos, video] };
        
        IDB.set(CONFIG.DB_KEY, newData).then(() => {
            state.data.videos.push(video);
            renderCats();
            renderVideos();
            closeModal('uploadModal');
            showToast('上传成功！');
            updateStorageBar();
            if (btn) {
                btn.textContent = '上传';
                btn.disabled = false;
            }
            state.selectedFile = null;
        }).catch(e => {
            showToast('保存失败：' + e.message, 'error');
            if (btn) {
                btn.textContent = '上传';
                btn.disabled = false;
            }
        });
    };
    reader.onerror = () => {
        showToast('文件读取失败', 'error');
        if (btn) {
            btn.textContent = '上传';
            btn.disabled = false;
        }
    };
    reader.readAsDataURL(state.selectedFile);
}

// ==================== 备份 ====================
function exportBackup() {
    try {
        const payload = {
            version: 1,
            exportedAt: Date.now(),
            categories: state.cats,
            videos: state.data.videos
        };
        const json = JSON.stringify(payload);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `video-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (a.parentNode) document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 200);
        showToast('备份已导出');
    } catch (err) {
        showToast('导出失败：' + err.message, 'error');
    }
}

function openImport() {
    state.importData = null;
    const fileName = document.getElementById('importFileName');
    const btn = document.getElementById('importConfirmBtn');
    if (fileName) fileName.textContent = '';
    if (btn) btn.disabled = true;
    openModal('importModal');
}

function handleImportSelect(file) {
    if (!file) return;
    if (!file.name.endsWith('.json')) {
        showToast('请选择 JSON 备份文件', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const obj = JSON.parse(reader.result);
            if (!obj.videos || !Array.isArray(obj.videos)) throw new Error('格式错误：缺少 videos 数组');
            if (!obj.categories || !Array.isArray(obj.categories)) throw new Error('格式错误：缺少 categories 数组');
            state.importData = obj;
            const fileName = document.getElementById('importFileName');
            const btn = document.getElementById('importConfirmBtn');
            if (fileName) fileName.textContent = `${file.name} (${obj.videos.length} 个视频, ${obj.categories.length} 个分类)`;
            if (btn) btn.disabled = false;
        } catch (err) {
            showToast('无效的备份文件：' + err.message, 'error');
            state.importData = null;
            const btn = document.getElementById('importConfirmBtn');
            if (btn) btn.disabled = true;
        }
    };
    reader.onerror = () => showToast('文件读取失败', 'error');
    reader.readAsText(file);
}

function doImport() {
    if (!state.importData) return;
    const vCount = state.importData.videos.length;
    if (!confirm(`确定恢复备份？这将覆盖当前所有数据（${vCount} 个视频）。`)) return;
    
    const newData = { videos: state.importData.videos };
    
    IDB.set(CONFIG.DB_KEY, newData).then(() => {
        state.data = newData;
        state.cats = state.importData.categories;
        saveCats();
        state.currentCat = '全部';
        const title = document.getElementById('pageTitle');
        if (title) title.textContent = '全部视频';
        renderCats();
        renderVideos();
        closeModal('importModal');
        showToast('备份恢复成功！');
        updateStorageBar();
    }).catch(err => {
        showToast('恢复失败：' + err.message, 'error');
    });
}

// ==================== 事件绑定 ====================
function bindEvents() {
    const on = (id, ev, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev, fn);
    };

    on('uploadBtnMain', 'click', openUpload);
    on('addCatBtn', 'click', openAddCat);
    on('addCatConfirmBtn', 'click', doAddCat);
    on('uploadConfirmBtn', 'click', doUpload);
    on('exportBtn', 'click', exportBackup);
    on('importBtn', 'click', openImport);
    on('importConfirmBtn', 'click', doImport);

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });
    
    const importInput = document.getElementById('importInput');
    if (importInput) importInput.addEventListener('change', (e) => {
        handleImportSelect(e.target.files[0]);
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });

    const fileDrop = document.getElementById('fileDrop');
    if (fileDrop) {
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
        fileDrop.addEventListener('click', () => {
            const input = document.getElementById('fileInput');
            if (input) input.click();
        });
    }

    const importDrop = document.getElementById('importDrop');
    if (importDrop) {
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
        importDrop.addEventListener('click', () => {
            const input = document.getElementById('importInput');
            if (input) input.click();
        });
    }

    const newCatName = document.getElementById('newCatName');
    if (newCatName) {
        newCatName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doAddCat();
        });
    }
    
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
