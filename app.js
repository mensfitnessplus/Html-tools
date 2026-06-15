/* ═══════════════════════════════════════════════════════════════
   Tool Hub — app.js
   IndexedDB + full CRUD + export/import + PWA service worker reg
   (Includes Optional URL Tools Support Layer & Drag-and-Drop)
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
let pendingHtmlContent = null;
let editMode       = false;  // sheet is in "edit" mode (update HTML)

let tabsEnabled       = localStorage.getItem('tabsEnabled') !== 'false';   // multi-tab mode toggle
let urlSupportEnabled = localStorage.getItem('urlSupportEnabled') === 'true'; // URL support toggle
let currentFilter     = 'all'; // filter mode: 'all', 'html', 'url'

// ── DOM REFS ─────────────────────────────────────────────────
const hub            = document.getElementById('hub');
const viewer         = document.getElementById('viewer');
const toolGrid       = document.getElementById('toolGrid');
const emptyState     = document.getElementById('emptyState');
const noResults      = document.getElementById('noResults');
const searchInput    = document.getElementById('searchInput');
const searchClear    = document.getElementById('searchClear');
const addBtn         = document.getElementById('addBtn');
const tabBar         = document.getElementById('tabBar');
const tabList        = document.getElementById('tabList');
const frameContainer = document.getElementById('frameContainer');
const toolLoader     = document.getElementById('toolLoader');

// header & menu
const filterWrap     = document.getElementById('filterWrap');
const filterBtn      = document.getElementById('filterBtn');
const filterLabel    = document.getElementById('filterLabel');
const filterDropdown = document.getElementById('filterDropdown');
const menuBtn        = document.getElementById('menuBtn');
const menuDropdown   = document.getElementById('menuDropdown');
const menuOverlay    = document.getElementById('menuOverlay');
const tabsToggleBtn  = document.getElementById('tabsToggleBtn');
const tabsToggleLabel= document.getElementById('tabsToggleLabel');
const urlSupportToggleBtn   = document.getElementById('urlSupportToggleBtn');
const urlSupportToggleLabel = document.getElementById('urlSupportToggleLabel');
const exportBtn      = document.getElementById('exportBtn');
const importBtn      = document.getElementById('importBtn');
const importInput    = document.getElementById('importInput');

// sheet
const addSheet       = document.getElementById('addSheet');
const sheetOverlay   = document.getElementById('sheetOverlay');
const sheetTitle     = document.getElementById('sheetTitle');
const toolTypeGroup  = document.getElementById('toolTypeGroup');
const htmlFileGroup  = document.getElementById('htmlFileGroup');
const urlInputGroup  = document.getElementById('urlInputGroup');
const toolNameInput  = document.getElementById('toolNameInput');
const htmlPickLabel  = document.getElementById('htmlPickLabel');
const htmlPickText   = document.getElementById('htmlPickText');
const htmlFileInput  = document.getElementById('htmlFileInput');
const htmlRequired   = document.getElementById('htmlRequired');
const urlInput       = document.getElementById('urlInput');
const iconFileInput  = document.getElementById('iconFileInput');
const iconPreview    = document.getElementById('iconPreview');
const iconPlaceholder= document.getElementById('iconPlaceholder');
const clearIconBtn   = document.getElementById('clearIconBtn');
const cancelSheetBtn = document.getElementById('cancelSheetBtn');
const saveToolBtn    = document.getElementById('saveToolBtn');

// context menu
const toolMenu       = document.getElementById('toolMenu');
const toolMenuOverlay= document.getElementById('toolMenuOverlay');
const ctxRename      = document.getElementById('ctxRename');
const ctxUpdateHtml  = document.getElementById('ctxUpdateHtml');
const ctxUpdateUrl   = document.getElementById('ctxUpdateUrl');
const ctxChangeIcon  = document.getElementById('ctxChangeIcon');
const ctxDelete      = document.getElementById('ctxDelete');

// dialogs
const renameDialog   = document.getElementById('renameDialog');
const renameInput    = document.getElementById('renameInput');
const cancelRenameBtn= document.getElementById('cancelRenameBtn');
const confirmRenameBtn=document.getElementById('confirmRenameBtn');

const updateUrlDialog     = document.getElementById('updateUrlDialog');
const updateUrlInput      = document.getElementById('updateUrlInput');
const cancelUpdateUrlBtn  = document.getElementById('cancelUpdateUrlBtn');
const confirmUpdateUrlBtn = document.getElementById('confirmUpdateUrlBtn');

const deleteDialog   = document.getElementById('deleteDialog');
const deleteDialogBody=document.getElementById('deleteDialogBody');
const cancelDeleteBtn= document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn=document.getElementById('confirmDeleteBtn');

// hidden inputs
const updateHtmlInput= document.getElementById('updateHtmlInput');
const changeIconInput= document.getElementById('changeIconInput');
const toast          = document.getElementById('toast');

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  if (!tabsEnabled) {
    viewer.classList.add('single-mode');
    tabsToggleLabel.textContent = 'Multi-tab: Off';
  }
  applyUrlSupportState();

  try {
    db = await openDB();
    allTools = await dbGetAll();
    // Sort primarily by user's dragged order, fallback to creation time
    allTools.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
    renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
  } catch (err) {
    console.error('DB open failed:', err);
    showToast('Could not open storage', 'error');
  }
}

// Apply URL Support Toggle Changes Visually
function applyUrlSupportState() {
  urlSupportToggleLabel.textContent = `URL Support: ${urlSupportEnabled ? 'On' : 'Off'}`;
  if (urlSupportEnabled) {
    filterWrap.classList.remove('hidden');
  } else {
    filterWrap.classList.add('hidden');
    currentFilter = 'all';
    filterLabel.textContent = 'All';
  }
  if (allTools.length) renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
}

// ── RENDERING ────────────────────────────────────────────────
function renderGrid(tools) {
  toolGrid.innerHTML = '';
  const query = searchInput.value.trim().toLowerCase();

  emptyState.classList.toggle('hidden', allTools.length > 0 || query.length > 0 || currentFilter !== 'all');
  noResults.classList.toggle('hidden',  !(tools.length === 0 && (query.length > 0 || currentFilter !== 'all')));

  // We only enable drag-and-drop if we are viewing the default 'all' list
  const isDraggable = (query === '' && currentFilter === 'all');

  tools.forEach((tool, i) => {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.dataset.id = tool.id;
    card.style.animationDelay = `${i * 30}ms`;

    if (isDraggable) {
      card.draggable = true;
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragend', handleDragEnd);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('drop', handleDrop);
    }

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

// ── DRAG AND DROP REORDERING ─────────────────────────────────
let dragSourceCard = null;

function handleDragStart(e) {
  dragSourceCard = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
  // Add class slightly later to allow standard ghost image creation
  setTimeout(() => this.classList.add('dragging'), 0);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  dragSourceCard = null;
  saveNewOrder(); 
}

function handleDragOver(e) {
  e.preventDefault(); 
  e.dataTransfer.dropEffect = 'move';

  const targetCard = e.target.closest('.tool-card');
  if (targetCard && targetCard !== dragSourceCard && targetCard.classList.contains('tool-card')) {
    const rect = targetCard.getBoundingClientRect();
    const offset = e.clientX - rect.left;
    if (offset < rect.width / 2) {
      toolGrid.insertBefore(dragSourceCard, targetCard);
    } else {
      toolGrid.insertBefore(dragSourceCard, targetCard.nextSibling);
    }
  }
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
}

async function saveNewOrder() {
  const cards = Array.from(toolGrid.querySelectorAll('.tool-card'));
  if (!cards.length) return;

  const newOrderIds = cards.map(c => c.dataset.id);

  // Safety check: ensure we aren't saving a partial filtered view
  const q = searchInput.value.trim().toLowerCase();
  if (q !== '' || currentFilter !== 'all') return;

  const toolMap = new Map(allTools.map(t => [t.id, t]));
  allTools = newOrderIds.map((id, index) => {
    const t = toolMap.get(id);
    if (t) {
      t.order = index;
      return t;
    }
    return null;
  }).filter(Boolean);

  // Save the new order background task
  for (const tool of allTools) {
    dbPut(tool).catch(err => console.error(err));
  }
}

// ── END D&D ──────────────────────────────────────────────────

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
  let list = allTools;
  // Apply URL / HTML Type Filter
  if (urlSupportEnabled && currentFilter !== 'all') {
    list = list.filter(t => {
      const type = t.type === 'url' ? 'url' : 'html';
      return type === currentFilter;
    });
  }
  // Apply Search
  if (query) {
    list = list.filter(t => t.name.toLowerCase().includes(query));
  }
  return list;
}

// ── SEARCH & FILTER HEADER ───────────────────────────────────
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  searchClear.classList.toggle('visible', q.length > 0);
  renderGrid(filterTools(q));
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  renderGrid(filterTools(''));
  searchInput.focus();
});

filterBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = !filterDropdown.classList.contains('hidden');
  if (open) { filterDropdown.classList.add('hidden'); }
  else      { filterDropdown.classList.remove('hidden'); }
  if (!menuDropdown.classList.contains('hidden')) closeMenu();
});

filterDropdown.addEventListener('click', e => {
  const btn = e.target.closest('.dropdown-item');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  filterLabel.textContent = btn.textContent;
  filterDropdown.classList.add('hidden');
  renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
});

// ── LOADER ───────────────────────────────────────────────────
function showLoader() {
  toolLoader.classList.add('visible');
  toolLoader.setAttribute('aria-hidden', 'false');
}
function hideLoader() {
  toolLoader.classList.remove('visible');
  toolLoader.setAttribute('aria-hidden', 'true');
}

// ── TAB MANAGER ───────────────────────────────────────────────
const tabs = [];
let activeTabId = null;
let launchToken = 0;
let loaderTimeout = null;

function tabById(id) { return tabs.find(t => t.id === id) || null; }

function renderTab(tab, isActive) {
  const el = document.createElement('button');
  el.className = 'tab' + (isActive ? ' active' : '');
  el.dataset.tabId = tab.id;

  if (tab.icon) {
    const img = document.createElement('img');
    img.className = 'tab-icon';
    img.src = tab.icon;
    img.alt = '';
    el.appendChild(img);
  } else {
    const svg = defaultIconSVG();
    svg.classList.replace('tool-icon-default', 'tab-icon-default');
    el.appendChild(svg);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'tab-name';
  nameEl.textContent = tab.name;
  el.appendChild(nameEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.setAttribute('aria-label', `Close ${tab.name}`);
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeTab(tab.id);
  });
  el.appendChild(closeBtn);

  el.addEventListener('click', () => activateTab(tab.id));
  return el;
}

function activateTab(id) {
  if (activeTabId === id) return;
  if (activeTabId) {
    const prev = tabById(activeTabId);
    if (prev) {
      prev.frameEl.classList.remove('active');
      prev.tabEl.classList.remove('active');
    }
  }
  activeTabId = id;
  const tab = tabById(id);
  if (!tab) return;
  tab.frameEl.classList.add('active');
  tab.tabEl.classList.add('active');
  tab.tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

function openTab(tool) {
  const existing = tabById(tool.id);
  if (existing) { activateTab(tool.id); return; }

  const frame = document.createElement('iframe');
  frame.className = 'tool-frame';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads');
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  frameContainer.appendChild(frame);

  const tab = { id: tool.id, name: tool.name, icon: tool.icon || null, frameEl: frame, tabEl: null };
  tabs.push(tab);

  const tabEl = renderTab(tab, false);
  tab.tabEl = tabEl;
  tabList.appendChild(tabEl);

  const token = ++launchToken;
  clearTimeout(loaderTimeout);
  showLoader();

  const startTime = Date.now();
  frame.onload = () => {
    if (token !== launchToken) return;
    const elapsed   = Date.now() - startTime;
    const remaining = Math.max(0, 500 - elapsed);
    loaderTimeout = setTimeout(() => {
      if (token !== launchToken) return;
      hideLoader();
    }, remaining);
  };

  const type = tool.type === 'url' ? 'url' : 'html';
  if (type === 'url') frame.src = tool.url;
  else frame.srcdoc = tool.html;

  activateTab(tool.id);
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];
  launchToken++;
  clearTimeout(loaderTimeout);
  hideLoader();

  tab.frameEl.remove();
  tab.tabEl.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    activeTabId = null;
    closeTool();
    return;
  }
  if (activeTabId === id) {
    activeTabId = null;
    const next = tabs[Math.min(idx, tabs.length - 1)];
    activateTab(next.id);
  }
}

async function launchTool(id) {
  try {
    const tool = await dbGet(id);
    if (!tool) return;
    if (!viewer.classList.contains('active')) {
      viewer.classList.add('active');
      hub.classList.add('slide-out');
      history.pushState({ toolOpen: true }, '');
    }
    if (tabsEnabled) openTab(tool);
    else launchSingle(tool);
  } catch (err) {
    hideLoader();
    showToast('Could not open tool', 'error');
  }
}

function launchSingle(tool) {
  frameContainer.querySelectorAll('.tool-frame').forEach(f => f.remove());
  const token = ++launchToken;
  clearTimeout(loaderTimeout);
  showLoader();

  const frame = document.createElement('iframe');
  frame.className = 'tool-frame active';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads');
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  frameContainer.appendChild(frame);

  const startTime = Date.now();
  frame.onload = () => {
    if (token !== launchToken) return;
    const elapsed   = Date.now() - startTime;
    const remaining = Math.max(0, 500 - elapsed);
    loaderTimeout = setTimeout(() => {
      if (token !== launchToken) return;
      hideLoader();
    }, remaining);
  };

  const type = tool.type === 'url' ? 'url' : 'html';
  if (type === 'url') frame.src = tool.url;
  else frame.srcdoc = tool.html;
}

function closeTool() {
  launchToken++;
  clearTimeout(loaderTimeout);
  hideLoader();
  viewer.classList.remove('active');
  hub.classList.remove('slide-out');
  if (!tabsEnabled) {
    frameContainer.querySelectorAll('.tool-frame').forEach(f => f.remove());
  }
}

window.addEventListener('popstate', () => {
  if (viewer.classList.contains('active')) closeTool();
});

// ── ADD TOOL SHEET ────────────────────────────────────────────
addBtn.addEventListener('click', () => openAddSheet());

document.getElementsByName('toolType').forEach(radio => {
  radio.addEventListener('change', e => {
    if (e.target.value === 'url') {
      htmlFileGroup.classList.add('hidden');
      urlInputGroup.classList.remove('hidden');
    } else {
      htmlFileGroup.classList.remove('hidden');
      urlInputGroup.classList.add('hidden');
    }
  });
});

function openAddSheet(mode = 'add', toolId = null) {
  editMode = mode !== 'add';
  activeToolId = toolId;

  // reset form
  toolNameInput.value = '';
  htmlFileInput.value = '';
  htmlPickText.textContent = 'Choose .html file';
  htmlPickLabel.classList.remove('has-file');
  urlInput.value = '';
  pendingHtmlContent  = null;
  pendingNewIcon      = null;
  iconPreview.src     = '';
  iconPreview.classList.add('hidden');
  iconPlaceholder.style.display = 'flex';
  clearIconBtn.style.display    = 'none';

  document.querySelector('input[name="toolType"][value="html"]').checked = true;

  if (editMode) {
    sheetTitle.textContent = 'Edit Tool';
    htmlRequired.style.display = 'none';
    saveToolBtn.textContent    = 'Save Changes';
    
    // Hide Type configuration & URL config entirely in edit mode
    toolTypeGroup.classList.add('hidden');
    urlInputGroup.classList.add('hidden');
    htmlFileGroup.classList.add('hidden');

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
        const type = tool.type === 'url' ? 'url' : 'html';
        if (type === 'html') {
          htmlFileGroup.classList.remove('hidden'); // allow picking new HTML like original
        }
      }
    });
  } else {
    sheetTitle.textContent = 'Add Tool';
    htmlRequired.style.display = 'inline';
    saveToolBtn.textContent    = 'Save Tool';

    if (urlSupportEnabled) toolTypeGroup.classList.remove('hidden');
    else toolTypeGroup.classList.add('hidden');

    htmlFileGroup.classList.remove('hidden');
    urlInputGroup.classList.add('hidden');
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

// Icon pick
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

// URL validation helper
function isValidHttpUrl(string) {
  try {
    const u = new URL(string);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) { return false; }
}

// Save
saveToolBtn.addEventListener('click', async () => {
  const name = toolNameInput.value.trim();
  if (!name) { showToast('Please enter a tool name', 'error'); return; }

  if (!editMode) {
    // ADD
    const type = urlSupportEnabled ? document.querySelector('input[name="toolType"]:checked').value : 'html';
    
    let finalHtml = null;
    let finalUrl  = null;

    if (type === 'url') {
      const urlVal = urlInput.value.trim();
      if (!isValidHttpUrl(urlVal)) { showToast('Please enter a valid HTTP/HTTPS URL', 'error'); return; }
      finalUrl = urlVal;
    } else {
      if (!pendingHtmlContent) { showToast('Please choose an HTML file', 'error'); return; }
      finalHtml = pendingHtmlContent;
    }

    const tool = {
      id:        crypto.randomUUID(),
      name,
      icon:      pendingNewIcon || null,
      type:      type,
      html:      finalHtml,
      url:       finalUrl,
      createdAt: Date.now(),
      order:     allTools.length // place at the end by default
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
    // EDIT
    try {
      const tool = await dbGet(activeToolId);
      if (!tool) return;
      tool.name = name;
      tool.icon = pendingNewIcon;

      const type = tool.type === 'url' ? 'url' : 'html';
      if (type === 'html' && pendingHtmlContent) {
        tool.html = pendingHtmlContent;
      }
      
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
  if (!filterDropdown.classList.contains('hidden')) filterDropdown.classList.add('hidden');
});
function closeMenu() { menuDropdown.classList.add('hidden'); menuOverlay.classList.add('hidden'); }
menuOverlay.addEventListener('click', closeMenu);
document.addEventListener('click', e => {
  if (!menuDropdown.classList.contains('hidden') && !menuDropdown.contains(e.target)) closeMenu();
  if (!filterDropdown.classList.contains('hidden') && !filterWrap.contains(e.target)) filterDropdown.classList.add('hidden');
});

// ── TOGGLES ───────────────────────────────────────────────────
tabsToggleBtn.addEventListener('click', () => {
  tabsEnabled = !tabsEnabled;
  localStorage.setItem('tabsEnabled', tabsEnabled);
  tabsToggleLabel.textContent = `Multi-tab: ${tabsEnabled ? 'On' : 'Off'}`;
  closeMenu();

  if (!tabsEnabled) {
    viewer.classList.add('single-mode');
    tabs.forEach(t => { t.frameEl.remove(); t.tabEl.remove(); });
    tabs.length = 0;
    activeTabId = null;
    launchToken++;
    clearTimeout(loaderTimeout);
    hideLoader();
    if (viewer.classList.contains('active')) closeTool();
  } else {
    viewer.classList.remove('single-mode');
    frameContainer.querySelectorAll('.tool-frame').forEach(f => f.remove());
  }
});

urlSupportToggleBtn.addEventListener('click', () => {
  urlSupportEnabled = !urlSupportEnabled;
  localStorage.setItem('urlSupportEnabled', urlSupportEnabled);
  applyUrlSupportState();
  closeMenu();
});

// ── TOOL CONTEXT MENU ─────────────────────────────────────────
function openToolMenu(id, anchor) {
  activeToolId = id;
  toolMenu.classList.remove('hidden');
  toolMenuOverlay.classList.remove('hidden');

  const tool = allTools.find(t => t.id === id);
  const type = (tool && tool.type === 'url') ? 'url' : 'html';

  if (type === 'url') {
    ctxUpdateHtml.classList.add('hidden');
    ctxUpdateUrl.classList.remove('hidden');
  } else {
    ctxUpdateHtml.classList.remove('hidden');
    ctxUpdateUrl.classList.add('hidden');
  }

  // position near anchor
  const rect = anchor.getBoundingClientRect();
  const menuW = 210, menuH = 190;
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

ctxUpdateUrl.addEventListener('click', () => {
  closeToolMenu();
  dbGet(activeToolId).then(tool => {
    if (!tool) return;
    updateUrlInput.value = tool.url || '';
    updateUrlDialog.classList.remove('hidden');
    setTimeout(() => { updateUrlInput.focus(); updateUrlInput.select(); }, 50);
  });
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

// ── UPDATE HTML / URL ─────────────────────────────────────────
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

cancelUpdateUrlBtn.addEventListener('click', () => updateUrlDialog.classList.add('hidden'));
confirmUpdateUrlBtn.addEventListener('click', doUpdateUrl);
updateUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') doUpdateUrl(); });

async function doUpdateUrl() {
  const urlVal = updateUrlInput.value.trim();
  if (!isValidHttpUrl(urlVal)) { showToast('Please enter a valid HTTP/HTTPS URL', 'error'); return; }
  try {
    const tool = await dbGet(activeToolId);
    if (!tool) return;
    tool.url = urlVal;
    await dbPut(tool);
    const idx = allTools.findIndex(t => t.id === activeToolId);
    if (idx > -1) allTools[idx].url = urlVal;
    updateUrlDialog.classList.add('hidden');
    showToast(`URL updated`, 'success');
  } catch (err) {
    showToast('Update failed', 'error');
  }
}

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
        if (!tool.id || !tool.name) continue;

        const type = tool.type === 'url' ? 'url' : 'html';
        if (type === 'html' && !tool.html) continue;
        if (type === 'url' && !tool.url) continue;

        const existing = await dbGet(tool.id).catch(() => null);
        const entry = { ...tool, id: existing ? crypto.randomUUID() : tool.id, type };

        await dbPut(entry);
        const idx = allTools.findIndex(t => t.id === entry.id);
        if (idx > -1) allTools[idx] = entry;
        else allTools.push(entry);
        imported++;
      }
      
      // Keep proper ordering format on imported tools
      allTools.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
      allTools.forEach((t, i) => t.order = i); // lock the new order
      for(let t of allTools) await dbPut(t);   // update DB order

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
      if (!filterDropdown.classList.contains('hidden')) filterDropdown.classList.add('hidden');
      if (!deleteDialog.classList.contains('hidden')) deleteDialog.classList.add('hidden');
      if (!renameDialog.classList.contains('hidden')) renameDialog.classList.add('hidden');
      if (!updateUrlDialog.classList.contains('hidden')) updateUrlDialog.classList.add('hidden');
    }
  }
});

// ── BOOT ─────────────────────────────────────────────────────
init();