/* ═══════════════════════════════════════════════════════════════
   Tool Hub — app.js
   IndexedDB + full CRUD + export/import + PWA service worker reg
═══════════════════════════════════════════════════════════════ */

'use strict';

// ── SERVICE WORKER ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Update available — reload to apply', 'info', 5000);
          }
        });
      });
    }).catch(err => console.warn('SW registration failed:', err));
  });
}

// ── INDEXEDDB ────────────────────────────────────────────────
const DB_NAME    = 'ToolHubDB';
const DB_VERSION = 1;
const STORE      = 'tools';
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const store = d.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = e => reject(e.target.error);
  });
}

function dbGet(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('createdAt').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbPut(tool) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(tool);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── STATE ────────────────────────────────────────────────────
let allTools       = [];
let activeToolId   = null;   // tool targeted by context menu
let pendingNewIcon = null;   // base64 string for add/edit sheet
let editMode       = false;  // sheet is in "edit" mode (update HTML)

// ── DOM REFS ─────────────────────────────────────────────────
const hub            = document.getElementById('hub');
const viewer         = document.getElementById('viewer');
const toolGrid       = document.getElementById('toolGrid');
const emptyState     = document.getElementById('emptyState');
const noResults      = document.getElementById('noResults');
const searchInput    = document.getElementById('searchInput');
const searchClear    = document.getElementById('searchClear');
const addBtn         = document.getElementById('addBtn');
const toolFrame      = document.getElementById('toolFrame');
const toolLoader     = document.getElementById('toolLoader');
// menu
const menuBtn        = document.getElementById('menuBtn');
const menuDropdown   = document.getElementById('menuDropdown');
const menuOverlay    = document.getElementById('menuOverlay');
const exportBtn      = document.getElementById('exportBtn');
const importBtn      = document.getElementById('importBtn');
const importInput    = document.getElementById('importInput');
// sheet
const addSheet       = document.getElementById('addSheet');
const sheetOverlay   = document.getElementById('sheetOverlay');
const sheetTitle     = document.getElementById('sheetTitle');
const toolNameInput  = document.getElementById('toolNameInput');
const htmlPickLabel  = document.getElementById('htmlPickLabel');
const htmlPickText   = document.getElementById('htmlPickText');
const htmlFileInput  = document.getElementById('htmlFileInput');
const htmlRequired   = document.getElementById('htmlRequired');
const iconFileInput  = document.getElementById('iconFileInput');
const iconPreview    = document.getElementById('iconPreview');
const iconPlaceholder= document.getElementById('iconPlaceholder');
const clearIconBtn   = document.getElementById('clearIconBtn');
const cancelSheetBtn = document.getElementById('cancelSheetBtn');
const saveToolBtn    = document.getElementById('saveToolBtn');
// context menu
const toolMenu       = document.getElementById('toolMenu');
const toolMenuOverlay= document.getElementById('toolMenuOverlay');
const ctxOpenTab     = document.getElementById('ctxOpenTab');
const ctxRename      = document.getElementById('ctxRename');
const ctxUpdateHtml  = document.getElementById('ctxUpdateHtml');
const ctxChangeIcon  = document.getElementById('ctxChangeIcon');
const ctxDelete      = document.getElementById('ctxDelete');
// dialogs
const renameDialog   = document.getElementById('renameDialog');
const renameInput    = document.getElementById('renameInput');
const cancelRenameBtn= document.getElementById('cancelRenameBtn');
const confirmRenameBtn=document.getElementById('confirmRenameBtn');
const deleteDialog   = document.getElementById('deleteDialog');
const deleteDialogBody=document.getElementById('deleteDialogBody');
const cancelDeleteBtn= document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn=document.getElementById('confirmDeleteBtn');
// hidden inputs for context actions
const updateHtmlInput= document.getElementById('updateHtmlInput');
const changeIconInput= document.getElementById('changeIconInput');
// toast
const toast          = document.getElementById('toast');

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  try {
    db = await openDB();
    allTools = await dbGetAll();
    renderGrid(allTools);
  } catch (err) {
    console.error('DB open failed:', err);
    showToast('Could not open storage', 'error');
  }
}

// ── RENDERING ────────────────────────────────────────────────
function renderGrid(tools) {
  toolGrid.innerHTML = '';
  const query = searchInput.value.trim().toLowerCase();

  emptyState.classList.toggle('hidden', allTools.length > 0 || query.length > 0);
  noResults.classList.toggle('hidden',  !(tools.length === 0 && query.length > 0));

  tools.forEach((tool, i) => {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.dataset.id = tool.id;
    card.style.animationDelay = `${i * 30}ms`;

    // icon
    const iconWrap = document.createElement('div');
    iconWrap.className = 'tool-icon-wrap';
    if (tool.icon) {
      const img = document.createElement('img');
      img.className = 'tool-icon-img';
      img.src  = tool.icon;
      img.alt  = tool.name;
      iconWrap.appendChild(img);
    } else {
      const svg = defaultIconSVG();
      iconWrap.appendChild(svg);
    }

    // name
    const name = document.createElement('div');
    name.className = 'tool-name';
    name.textContent = tool.name;

    // date
    const date = document.createElement('div');
    date.className = 'tool-date';
    date.textContent = formatDate(tool.createdAt);

    // menu button
    const menuBtnEl = document.createElement('button');
    menuBtnEl.className = 'card-menu-btn';
    menuBtnEl.setAttribute('aria-label', 'Tool options');
    menuBtnEl.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;
    menuBtnEl.addEventListener('click', e => {
      e.stopPropagation();
      openToolMenu(tool.id, menuBtnEl);
    });

    card.appendChild(iconWrap);
    card.appendChild(name);
    card.appendChild(date);
    card.appendChild(menuBtnEl);

    card.addEventListener('click', () => launchTool(tool.id));
    toolGrid.appendChild(card);
  });
}

function defaultIconSVG() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.classList.add('tool-icon-default');
  svg.innerHTML = `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`;
  return svg;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)         return 'just now';
  if (diff < 3600000)       return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000)      return `${Math.floor(diff/3600000)}h ago`;
  if (diff < 604800000)     return `${Math.floor(diff/86400000)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function filterTools(query) {
  if (!query) return allTools;
  return allTools.filter(t => t.name.toLowerCase().includes(query));
}

// ── SEARCH ───────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  searchClear.classList.toggle('visible', q.length > 0);
  renderGrid(filterTools(q));
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  renderGrid(allTools);
  searchInput.focus();
});

// ── LOADER ───────────────────────────────────────────────────
let launchToken   = 0;
let loaderTimeout = null;

function showLoader() {
  toolLoader.classList.add('visible');
  toolLoader.setAttribute('aria-hidden', 'false');
}

function hideLoader() {
  toolLoader.classList.remove('visible');
  toolLoader.setAttribute('aria-hidden', 'true');
}

// ── LAUNCH TOOL ──────────────────────────────────────────────
async function launchTool(id) {
  try {
    const tool = await dbGet(id);
    if (!tool) return;

    // Increment token — any prior pending load is now stale
    const token = ++launchToken;

    // Clear any pending hide timer from a previous launch
    clearTimeout(loaderTimeout);

    // Show loader immediately before any async work
    showLoader();

    viewer.classList.add('active');
    hub.classList.add('slide-out');
    history.pushState({ toolOpen: true }, '');

    const startTime = Date.now();

    // Set onload before assigning srcdoc
    toolFrame.onload = () => {
      // Ignore stale load events
      if (token !== launchToken) return;

      const elapsed   = Date.now() - startTime;
      const remaining = Math.max(0, 500 - elapsed);

      loaderTimeout = setTimeout(() => {
        if (token !== launchToken) return;
        hideLoader();
      }, remaining);
    };

    toolFrame.srcdoc = tool.html;
  } catch (err) {
    hideLoader();
    showToast('Could not open tool', 'error');
  }
}

function closeTool() {
  // Invalidate any in-flight launch
  launchToken++;
  clearTimeout(loaderTimeout);
  hideLoader();

  viewer.classList.remove('active');
  hub.classList.remove('slide-out');
  toolFrame.onload  = null;
  toolFrame.srcdoc  = '';
}

window.addEventListener('popstate', e => {
  if (viewer.classList.contains('active')) {
    closeTool();
  }
});

// ── ADD TOOL SHEET ────────────────────────────────────────────
let pendingHtmlContent = null;

addBtn.addEventListener('click', () => openAddSheet());

function openAddSheet(mode = 'add', toolId = null) {
  editMode = mode !== 'add';
  activeToolId = toolId;

  // reset form
  toolNameInput.value = '';
  htmlFileInput.value = '';
  htmlPickText.textContent = 'Choose .html file';
  htmlPickLabel.classList.remove('has-file');
  pendingHtmlContent  = null;
  pendingNewIcon      = null;
  iconPreview.src     = '';
  iconPreview.classList.add('hidden');
  iconPlaceholder.style.display = 'flex';
  clearIconBtn.style.display    = 'none';

  if (editMode) {
    sheetTitle.textContent = 'Edit Tool';
    htmlRequired.style.display = 'none';
    saveToolBtn.textContent    = 'Save Changes';
    // pre-fill name
    dbGet(toolId).then(tool => {
      if (tool) {
        toolNameInput.value = tool.name;
        if (tool.icon) {
          iconPreview.src = tool.icon;
          iconPreview.classList.remove('hidden');
          iconPlaceholder.style.display = 'none';
          clearIconBtn.style.display    = 'inline-flex';
          pendingNewIcon = tool.icon;
        }
      }
    });
  } else {
    sheetTitle.textContent = 'Add Tool';
    htmlRequired.style.display = 'inline';
    saveToolBtn.textContent    = 'Save Tool';
  }

  addSheet.classList.remove('hidden');
  sheetOverlay.classList.remove('hidden');
  setTimeout(() => toolNameInput.focus(), 300);
}

function closeAddSheet() {
  addSheet.classList.add('hidden');
  sheetOverlay.classList.add('hidden');
}

cancelSheetBtn.addEventListener('click', closeAddSheet);
sheetOverlay.addEventListener('click', closeAddSheet);

// HTML file pick
htmlFileInput.addEventListener('change', () => {
  const file = htmlFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    pendingHtmlContent = e.target.result;
    htmlPickText.textContent = file.name;
    htmlPickLabel.classList.add('has-file');
    if (!toolNameInput.value.trim()) {
      toolNameInput.value = file.name.replace(/\.html?$/i, '');
    }
  };
  reader.readAsText(file);
});

// Icon pick (in sheet)
iconFileInput.addEventListener('change', () => {
  const file = iconFileInput.files[0];
  if (!file) return;
  readFileAsDataURL(file).then(data => {
    pendingNewIcon = data;
    iconPreview.src = data;
    iconPreview.classList.remove('hidden');
    iconPlaceholder.style.display = 'none';
    clearIconBtn.style.display = 'inline-flex';
  });
});

clearIconBtn.addEventListener('click', () => {
  pendingNewIcon = null;
  iconPreview.src = '';
  iconPreview.classList.add('hidden');
  iconPlaceholder.style.display = 'flex';
  clearIconBtn.style.display = 'none';
  iconFileInput.value = '';
});

// Save
saveToolBtn.addEventListener('click', async () => {
  const name = toolNameInput.value.trim();
  if (!name) { showToast('Please enter a tool name', 'error'); return; }

  if (!editMode) {
    // ADD
    if (!pendingHtmlContent) { showToast('Please choose an HTML file', 'error'); return; }
    const tool = {
      id:        crypto.randomUUID(),
      name,
      icon:      pendingNewIcon || null,
      html:      pendingHtmlContent,
      createdAt: Date.now()
    };
    try {
      await dbPut(tool);
      allTools.push(tool);
      renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
      closeAddSheet();
      showToast(`"${name}" added`, 'success');
    } catch (err) {
      showToast('Failed to save tool', 'error');
    }
  } else {
    // EDIT (name + icon only — html updated separately)
    try {
      const tool = await dbGet(activeToolId);
      if (!tool) return;
      tool.name = name;
      tool.icon = pendingNewIcon;
      if (pendingHtmlContent) tool.html = pendingHtmlContent;
      await dbPut(tool);
      const idx = allTools.findIndex(t => t.id === activeToolId);
      if (idx > -1) allTools[idx] = tool;
      renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
      closeAddSheet();
      showToast('Changes saved', 'success');
    } catch (err) {
      showToast('Failed to save changes', 'error');
    }
  }
});

// ── HEADER MENU ───────────────────────────────────────────────
menuBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = !menuDropdown.classList.contains('hidden');
  if (open) { closeMenu(); }
  else      { menuDropdown.classList.remove('hidden'); menuOverlay.classList.remove('hidden'); }
});
function closeMenu() { menuDropdown.classList.add('hidden'); menuOverlay.classList.add('hidden'); }
menuOverlay.addEventListener('click', closeMenu);
document.addEventListener('click', e => {
  if (!menuDropdown.classList.contains('hidden') && !menuDropdown.contains(e.target)) closeMenu();
});

// ── TOOL CONTEXT MENU ─────────────────────────────────────────
function openToolMenu(id, anchor) {
  activeToolId = id;
  toolMenu.classList.remove('hidden');
  toolMenuOverlay.classList.remove('hidden');

  // position near anchor
  const rect = anchor.getBoundingClientRect();
  const menuW = 210, menuH = 234;
  let top  = rect.bottom + 4;
  let left = rect.left - menuW + rect.width;
  if (top + menuH > window.innerHeight - 12) top = rect.top - menuH - 4;
  if (left < 8) left = 8;
  toolMenu.style.top  = `${top}px`;
  toolMenu.style.left = `${left}px`;
}
function closeToolMenu() {
  toolMenu.classList.add('hidden');
  toolMenuOverlay.classList.add('hidden');
}
toolMenuOverlay.addEventListener('click', closeToolMenu);

// ── OPEN IN NEW TAB ───────────────────────────────────────────
async function openToolInNewTab(id) {
  try {
    const tool = await dbGet(id);
    if (!tool) return;
    const blob = new Blob([tool.html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const tab  = window.open(url, '_blank');
    // Revoke the object URL once the new tab has had time to load
    if (tab) {
      const revoke = () => URL.revokeObjectURL(url);
      tab.addEventListener('load', revoke, { once: true });
      // Fallback: revoke after 30 s in case the load event is not catchable
      setTimeout(revoke, 30000);
    } else {
      // window.open was blocked; revoke immediately
      URL.revokeObjectURL(url);
      showToast('Pop-up blocked — allow pop-ups and try again', 'error', 4000);
    }
  } catch (err) {
    showToast('Could not open tool', 'error');
  }
}

ctxOpenTab.addEventListener('click', () => {
  closeToolMenu();
  openToolInNewTab(activeToolId);
});

ctxRename.addEventListener('click', () => {
  closeToolMenu();
  dbGet(activeToolId).then(tool => {
    if (!tool) return;
    renameInput.value = tool.name;
    renameDialog.classList.remove('hidden');
    setTimeout(() => { renameInput.focus(); renameInput.select(); }, 50);
  });
});

ctxUpdateHtml.addEventListener('click', () => {
  closeToolMenu();
  updateHtmlInput.value = '';
  updateHtmlInput.click();
});

ctxChangeIcon.addEventListener('click', () => {
  closeToolMenu();
  changeIconInput.value = '';
  changeIconInput.click();
});

ctxDelete.addEventListener('click', () => {
  closeToolMenu();
  dbGet(activeToolId).then(tool => {
    if (!tool) return;
    deleteDialogBody.textContent = `"${tool.name}" will be permanently deleted.`;
    deleteDialog.classList.remove('hidden');
  });
});

// ── UPDATE HTML ───────────────────────────────────────────────
updateHtmlInput.addEventListener('change', () => {
  const file = updateHtmlInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const tool = await dbGet(activeToolId);
      if (!tool) return;
      tool.html = e.target.result;
      await dbPut(tool);
      const idx = allTools.findIndex(t => t.id === activeToolId);
      if (idx > -1) allTools[idx] = tool;
      showToast(`"${tool.name}" updated`, 'success');
    } catch (err) {
      showToast('Update failed', 'error');
    }
  };
  reader.readAsText(file);
});

// ── CHANGE ICON ───────────────────────────────────────────────
changeIconInput.addEventListener('change', () => {
  const file = changeIconInput.files[0];
  if (!file) return;
  readFileAsDataURL(file).then(async data => {
    try {
      const tool = await dbGet(activeToolId);
      if (!tool) return;
      tool.icon = data;
      await dbPut(tool);
      const idx = allTools.findIndex(t => t.id === activeToolId);
      if (idx > -1) allTools[idx] = tool;
      renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
      showToast('Icon updated', 'success');
    } catch (err) {
      showToast('Icon update failed', 'error');
    }
  });
});

// ── RENAME ────────────────────────────────────────────────────
cancelRenameBtn.addEventListener('click',  () => renameDialog.classList.add('hidden'));
confirmRenameBtn.addEventListener('click', doRename);
renameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doRename(); });

async function doRename() {
  const newName = renameInput.value.trim();
  if (!newName) { showToast('Name cannot be empty', 'error'); return; }
  try {
    const tool = await dbGet(activeToolId);
    if (!tool) return;
    tool.name = newName;
    await dbPut(tool);
    const idx = allTools.findIndex(t => t.id === activeToolId);
    if (idx > -1) allTools[idx].name = newName;
    renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
    renameDialog.classList.add('hidden');
    showToast('Renamed', 'success');
  } catch (err) {
    showToast('Rename failed', 'error');
  }
}

// ── DELETE ────────────────────────────────────────────────────
cancelDeleteBtn.addEventListener('click',  () => deleteDialog.classList.add('hidden'));
confirmDeleteBtn.addEventListener('click', async () => {
  try {
    const tool = await dbGet(activeToolId);
    await dbDelete(activeToolId);
    allTools = allTools.filter(t => t.id !== activeToolId);
    renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
    deleteDialog.classList.add('hidden');
    showToast(`"${tool?.name || 'Tool'}" deleted`, 'success');
  } catch (err) {
    showToast('Delete failed', 'error');
  }
});

// ── EXPORT ────────────────────────────────────────────────────
exportBtn.addEventListener('click', async () => {
  closeMenu();
  try {
    const tools = await dbGetAll();
    if (!tools.length) { showToast('No tools to export', 'info'); return; }
    const json    = JSON.stringify({ version: 1, exportedAt: Date.now(), tools }, null, 2);
    const blob    = new Blob([json], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href     = url;
    a.download = `tool-hub-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${tools.length} tool${tools.length === 1 ? '' : 's'}`, 'success');
  } catch (err) {
    showToast('Export failed', 'error');
  }
});

// ── IMPORT ────────────────────────────────────────────────────
importBtn.addEventListener('click', () => { closeMenu(); importInput.click(); });
importInput.addEventListener('change', () => {
  const file = importInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.tools)) throw new Error('Invalid backup format');
      let imported = 0;
      for (const tool of data.tools) {
        if (!tool.id || !tool.name || !tool.html) continue;
        // Don't overwrite existing tools — give them a new id if collision
        const existing = await dbGet(tool.id).catch(() => null);
        const entry = { ...tool, id: existing ? crypto.randomUUID() : tool.id };
        await dbPut(entry);
        const idx = allTools.findIndex(t => t.id === entry.id);
        if (idx > -1) allTools[idx] = entry;
        else allTools.push(entry);
        imported++;
      }
      // sort by createdAt
      allTools.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
      showToast(`Imported ${imported} tool${imported === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      showToast('Import failed — invalid file', 'error');
    }
    importInput.value = '';
  };
  reader.readAsText(file);
});

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'info', duration = 2800) {
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── UTILS ─────────────────────────────────────────────────────
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

// ── KEYBOARD ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!viewer.classList.contains('active')) {
      closeAddSheet();
      closeToolMenu();
      closeMenu();
      if (!deleteDialog.classList.contains('hidden')) deleteDialog.classList.add('hidden');
      if (!renameDialog.classList.contains('hidden')) renameDialog.classList.add('hidden');
    }
  }
});

// ── BOOT ─────────────────────────────────────────────────────
init();
