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
let activeToolId   = null;   
let pendingNewIcon = null;   
let pendingHtmlContent = null;
let editMode       = false;  

let tabsEnabled       = localStorage.getItem('tabsEnabled') !== 'false';   
let urlSupportEnabled = localStorage.getItem('urlSupportEnabled') === 'true'; 
let currentFilter     = 'all'; 
let viewMode          = localStorage.getItem('viewMode') || 'tools'; 
let sortMode          = localStorage.getItem('sortMode') || 'add';
let sortAsc           = localStorage.getItem('sortAsc') === 'true';
let activeTag         = localStorage.getItem('activeTag') || null;
let bookmarksGridCols = localStorage.getItem('bookmarksGridCols') || 'auto';

// ── DOM REFS ─────────────────────────────────────────────────
const hub            = document.getElementById('hub');
const viewer         = document.getElementById('viewer');
const toolGrid       = document.getElementById('toolGrid');
const emptyState     = document.getElementById('emptyState');
const noResults      = document.getElementById('noResults');
const searchInput    = document.getElementById('searchInput');
const searchClear    = document.getElementById('searchClear');
const addBtn         = document.getElementById('addBtn');
const addUrlFab      = document.getElementById('addUrlFab');
const tabBar         = document.getElementById('tabBar');
const tabList        = document.getElementById('tabList');
const frameContainer = document.getElementById('frameContainer');
const toolLoader     = document.getElementById('toolLoader');

// header & menu
const filterWrap       = document.getElementById('filterWrap');
const filterBtn        = document.getElementById('filterBtn');
const filterLabel      = document.getElementById('filterLabel');
const filterDropdown   = document.getElementById('filterDropdown');
const sortWrap         = document.getElementById('sortWrap');
const sortBtn          = document.getElementById('sortBtn');
const sortLabel        = document.getElementById('sortLabel');
const sortDropdown     = document.getElementById('sortDropdown');
const gridToggleBtn    = document.getElementById('gridToggleBtn');
const menuBtn          = document.getElementById('menuBtn');
const menuDropdown     = document.getElementById('menuDropdown');
const menuOverlay      = document.getElementById('menuOverlay');
const tabsToggleBtn    = document.getElementById('tabsToggleBtn');
const tabsToggleLabel  = document.getElementById('tabsToggleLabel');
const urlSupportToggleBtn   = document.getElementById('urlSupportToggleBtn');
const urlSupportToggleLabel = document.getElementById('urlSupportToggleLabel');
const viewBookmarksBtn = document.getElementById('viewBookmarksBtn');
const exportBtn        = document.getElementById('exportBtn');
const importBtn        = document.getElementById('importBtn');
const importInput      = document.getElementById('importInput');

// tags
const tagsWrap         = document.getElementById('tagsWrap');

// sheet
const addSheet       = document.getElementById('addSheet');
const sheetOverlay   = document.getElementById('sheetOverlay');
const sheetTitle     = document.getElementById('sheetTitle');
const toolTypeGroup  = document.getElementById('toolTypeGroup');
const htmlFileGroup  = document.getElementById('htmlFileGroup');
const urlInputGroup  = document.getElementById('urlInputGroup');
const bookmarkGroup  = document.getElementById('bookmarkGroup');
const isBookmarkCheckbox = document.getElementById('isBookmarkCheckbox');
const tagsGroup      = document.getElementById('tagsGroup');
const tagsInput      = document.getElementById('tagsInput');
const tagsSuggestionBox = document.getElementById('tagsSuggestionBox');
const toolNameInput  = document.getElementById('toolNameInput');
const toolNameClearBtn = document.getElementById('toolNameClearBtn');
const htmlPickLabel  = document.getElementById('htmlPickLabel');
const htmlPickText   = document.getElementById('htmlPickText');
const htmlFileInput  = document.getElementById('htmlFileInput');
const htmlRequired   = document.getElementById('htmlRequired');
const urlInput       = document.getElementById('urlInput');
const urlClearBtn    = document.getElementById('urlClearBtn');
const iconFileInput  = document.getElementById('iconFileInput');
const iconPreview    = document.getElementById('iconPreview');
const iconPlaceholder= document.getElementById('iconPlaceholder');
const clearIconBtn   = document.getElementById('clearIconBtn');
const fetchIconBtn   = document.getElementById('fetchIconBtn');
const cancelSheetBtn = document.getElementById('cancelSheetBtn');
const saveToolBtn    = document.getElementById('saveToolBtn');

// context menu
const toolMenu       = document.getElementById('toolMenu');
const toolMenuOverlay= document.getElementById('toolMenuOverlay');
const ctxRename      = document.getElementById('ctxRename');
const ctxUpdateHtml  = document.getElementById('ctxUpdateHtml');
const ctxUpdateUrl   = document.getElementById('ctxUpdateUrl');
const ctxChangeIcon  = document.getElementById('ctxChangeIcon');
const ctxPin         = document.getElementById('ctxPin');
const ctxPinText     = document.getElementById('ctxPinText');
const ctxCopyUrl     = document.getElementById('ctxCopyUrl');
const ctxDelete      = document.getElementById('ctxDelete');

// dialogs
const renameDialog    = document.getElementById('renameDialog');
const renameInput     = document.getElementById('renameInput');
const cancelRenameBtn = document.getElementById('cancelRenameBtn');
const confirmRenameBtn= document.getElementById('confirmRenameBtn');

const deleteDialog    = document.getElementById('deleteDialog');
const deleteDialogBody= document.getElementById('deleteDialogBody');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn= document.getElementById('confirmDeleteBtn');

// hidden inputs
const updateHtmlInput = document.getElementById('updateHtmlInput');
const changeIconInput = document.getElementById('changeIconInput');
const toast           = document.getElementById('toast');

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  if (!tabsEnabled) {
    viewer.classList.add('single-mode');
    tabsToggleLabel.textContent = 'Multi-tab: Off';
  }
  
  if (viewMode === 'bookmarks') viewBookmarksBtn.classList.add('active');

  applyUrlSupportState();

  try {
    db = await openDB();
    allTools = await dbGetAll();
    renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
  } catch (err) {
    console.error('DB open failed:', err);
    showToast('Could not open storage', 'error');
  }
}

function updateSortUI() {
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(btn => {
    const dirSpan = btn.querySelector('.sort-dir');
    if (btn.dataset.sort === sortMode) {
      btn.classList.add('active');
      dirSpan.textContent = sortAsc ? '↑' : '↓';
      sortLabel.textContent = btn.textContent.replace(/[↑↓]/g, '').trim();
    } else {
      btn.classList.remove('active');
      dirSpan.textContent = '';
    }
  });
}

function applyGridCols() {
  if (viewMode === 'bookmarks' && bookmarksGridCols === '3') {
    toolGrid.classList.add('grid-3-cols');
    gridToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="4" width="6" height="16" rx="1"/><rect x="9" y="4" width="6" height="16" rx="1"/><rect x="16" y="4" width="6" height="16" rx="1"/></svg>`;
  } else {
    toolGrid.classList.remove('grid-3-cols');
    gridToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`;
  }
}

// Apply URL Support Toggle Changes Visually
function applyUrlSupportState() {
  urlSupportToggleLabel.textContent = `URL Support: ${urlSupportEnabled ? 'On' : 'Off'}`;
  
  if (viewMode === 'bookmarks') {
    filterWrap.classList.add('hidden');
    sortWrap.classList.remove('hidden');
    gridToggleBtn.classList.remove('hidden');
    
    // Hide standard + button in bookmarks
    addBtn.classList.add('hidden');
    
    // Show 🔗 button natively in the main position
    addUrlFab.classList.remove('hidden');
    addUrlFab.classList.remove('secondary-fab');
  } else {
    sortWrap.classList.add('hidden');
    gridToggleBtn.classList.add('hidden');
    
    // Show standard + button
    addBtn.classList.remove('hidden');
    
    if (urlSupportEnabled) {
      addUrlFab.classList.remove('hidden');
      addUrlFab.classList.add('secondary-fab');
      filterWrap.classList.remove('hidden');
    } else {
      addUrlFab.classList.add('hidden');
      filterWrap.classList.add('hidden');
      currentFilter = 'all';
      filterLabel.textContent = 'All';
    }
  }

  applyGridCols();
  updateSortUI();
  if (allTools.length) renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
}

// ── RENDERING ────────────────────────────────────────────────
function renderTags() {
  if (viewMode !== 'bookmarks') {
    tagsWrap.classList.add('hidden');
    return;
  }
  
  const allTags = new Set();
  let hasUntagged = false;

  allTools.forEach(t => {
    if (t.isBookmark) {
      if (!t.tags || t.tags.length === 0) hasUntagged = true;
      else t.tags.forEach(tag => allTags.add(tag));
    }
  });
  
  if (allTags.size === 0 && !hasUntagged) {
    tagsWrap.classList.add('hidden');
    return;
  }
  
  tagsWrap.classList.remove('hidden');
  tagsWrap.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = `tag-chip ${!activeTag ? 'active' : ''}`;
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => { 
    activeTag = null; 
    localStorage.removeItem('activeTag');
    renderGrid(filterTools(searchInput.value.trim().toLowerCase())); 
  });
  tagsWrap.appendChild(allBtn);

  if (hasUntagged) {
    const untaggedBtn = document.createElement('button');
    untaggedBtn.className = `tag-chip ${activeTag === 'Untagged' ? 'active' : ''}`;
    untaggedBtn.textContent = 'Untagged';
    untaggedBtn.addEventListener('click', () => { 
      activeTag = 'Untagged'; 
      localStorage.setItem('activeTag', 'Untagged');
      renderGrid(filterTools(searchInput.value.trim().toLowerCase())); 
    });
    tagsWrap.appendChild(untaggedBtn);
  }

  Array.from(allTags).sort().forEach(tag => {
    const btn = document.createElement('button');
    btn.className = `tag-chip ${activeTag === tag ? 'active' : ''}`;
    btn.textContent = tag;
    btn.addEventListener('click', () => { 
      activeTag = tag; 
      localStorage.setItem('activeTag', tag);
      renderGrid(filterTools(searchInput.value.trim().toLowerCase())); 
    });
    tagsWrap.appendChild(btn);
  });
}

function renderGrid(tools) {
  renderTags();
  
  toolGrid.innerHTML = '';
  const query = searchInput.value.trim().toLowerCase();

  emptyState.classList.toggle('hidden', allTools.length > 0 || query.length > 0 || currentFilter !== 'all');
  noResults.classList.toggle('hidden',  !(tools.length === 0 && (query.length > 0 || currentFilter !== 'all' || viewMode === 'bookmarks')));

  const isDraggable = (query === '' && (viewMode === 'tools' && currentFilter === 'all'));

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

    if (viewMode === 'bookmarks' && tool.pinned) {
      const pinBadge = document.createElement('div');
      pinBadge.className = 'pin-badge';
      pinBadge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2L12 10M12 22L12 14M10 2L14 2M10 22L14 22M6 10L18 10C19.1046 10 20 10.8954 20 12V14C20 15.1046 19.1046 16 18 16L6 16C4.89543 16 4 15.1046 4 14V12C4 10.8954 4.89543 10 6 10Z"/></svg>`;
      card.appendChild(pinBadge);
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
    
    // tags logic
    if (tool.isBookmark && tool.tags && tool.tags.length > 0) {
      const tagRow = document.createElement('div');
      tagRow.className = 'card-tags';
      tool.tags.slice(0, 3).forEach(tag => {
        const span = document.createElement('span');
        span.textContent = tag;
        tagRow.appendChild(span);
      });
      if (tool.tags.length > 3) {
         const span = document.createElement('span');
         span.textContent = '+' + (tool.tags.length - 3);
         tagRow.appendChild(span);
      }
      card.appendChild(tagRow);
    }

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

  const isToolsValid = viewMode === 'tools' && searchInput.value.trim() === '' && currentFilter === 'all';
  if (!isToolsValid) return; // Only save manual order in normal Tools view

  const visibleIds = cards.map(c => c.dataset.id);
  const renderedTools = visibleIds.map(id => allTools.find(t => t.id === id)).filter(Boolean);
  
  const availableOrders = renderedTools.map(t => t.order ?? t.createdAt).sort((a, b) => a - b);
  
  for(let i=0; i<renderedTools.length; i++){
    const t = renderedTools[i];
    t.order = availableOrders[i];
    await dbPut(t).catch(err => console.error(err));
  }

  renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
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
  
  if (viewMode === 'bookmarks') {
    list = list.filter(t => t.isBookmark);
    if (activeTag) {
      if (activeTag === 'Untagged') list = list.filter(t => !t.tags || t.tags.length === 0);
      else list = list.filter(t => t.tags && t.tags.includes(activeTag));
    }
  } else {
    list = list.filter(t => !t.isBookmark);
    if (urlSupportEnabled && currentFilter !== 'all') {
      list = list.filter(t => {
        const type = t.type === 'url' ? 'url' : 'html';
        return type === currentFilter;
      });
    }
  }

  if (query) {
    list = list.filter(t => 
      t.name.toLowerCase().includes(query) || 
      (t.tags && t.tags.some(tag => tag.toLowerCase().includes(query)))
    );
  }

  list.sort((a, b) => {
    if (viewMode === 'bookmarks') {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      
      let valA, valB;
      switch(sortMode) {
        case 'open': valA = a.openedAt || 0; valB = b.openedAt || 0; break;
        case 'count': valA = a.openCount || 0; valB = b.openCount || 0; break;
        case 'mod': valA = a.modifiedAt || a.createdAt; valB = b.modifiedAt || b.createdAt; break;
        case 'alpha': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
        case 'add': default: valA = a.createdAt; valB = b.createdAt; break;
      }
      
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    }
    return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
  });

  return list;
}

// ── SEARCH & FILTER/SORT HEADER ──────────────────────────────
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
  filterDropdown.classList.toggle('hidden');
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

sortBtn.addEventListener('click', e => {
  e.stopPropagation();
  sortDropdown.classList.toggle('hidden');
  if (!menuDropdown.classList.contains('hidden')) closeMenu();
});

sortDropdown.addEventListener('click', e => {
  const btn = e.target.closest('.dropdown-item');
  if (!btn) return;
  const clickedSort = btn.dataset.sort;
  if (clickedSort === sortMode) {
    sortAsc = !sortAsc;
  } else {
    sortMode = clickedSort;
    sortAsc = (sortMode === 'alpha'); // default Alpha to A-Z (asc), others to desc
  }
  localStorage.setItem('sortMode', sortMode);
  localStorage.setItem('sortAsc', sortAsc);
  
  updateSortUI();
  sortDropdown.classList.add('hidden');
  renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
});

gridToggleBtn.addEventListener('click', () => {
  bookmarksGridCols = bookmarksGridCols === '3' ? 'auto' : '3';
  localStorage.setItem('bookmarksGridCols', bookmarksGridCols);
  applyGridCols();
});

viewBookmarksBtn.addEventListener('click', () => {
  viewMode = viewMode === 'tools' ? 'bookmarks' : 'tools';
  localStorage.setItem('viewMode', viewMode);
  applyUrlSupportState();
  
  // Do not reset active tag here to maintain memory
  searchInput.value = '';
  searchClear.classList.remove('visible');
  renderGrid(filterTools(''));
});

document.addEventListener('click', e => {
  if (!menuDropdown.classList.contains('hidden') && !menuDropdown.contains(e.target)) closeMenu();
  if (!filterDropdown.classList.contains('hidden') && !filterWrap.contains(e.target)) filterDropdown.classList.add('hidden');
  if (!sortDropdown.classList.contains('hidden') && !sortWrap.contains(e.target)) sortDropdown.classList.add('hidden');
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
let dragSourceTab = null;
let launchToken = 0;
let loaderTimeout = null;

function tabById(id) { return tabs.find(t => t.id === id) || null; }

function renderTab(tab, isActive) {
  const el = document.createElement('button');
  el.className = 'tab' + (isActive ? ' active' : '');
  el.dataset.tabId = tab.id;

  el.draggable = true;
  el.addEventListener('dragstart', handleTabDragStart);
  el.addEventListener('dragend', handleTabDragEnd);
  el.addEventListener('dragover', handleTabDragOver);
  el.addEventListener('drop', handleTabDrop);

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

function handleTabDragStart(e) {
  dragSourceTab = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.tabId);
  setTimeout(() => this.classList.add('dragging'), 0);
}

function handleTabDragEnd(e) {
  this.classList.remove('dragging');
  dragSourceTab = null;
  updateTabsArrayOrder();
}

function handleTabDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const targetTab = e.target.closest('.tab');
  if (targetTab && targetTab !== dragSourceTab) {
    const rect = targetTab.getBoundingClientRect();
    const offset = e.clientX - rect.left;
    if (offset < rect.width / 2) {
      tabList.insertBefore(dragSourceTab, targetTab);
    } else {
      tabList.insertBefore(dragSourceTab, targetTab.nextSibling);
    }
  }
}

function handleTabDrop(e) {
  e.stopPropagation();
  e.preventDefault();
}

function updateTabsArrayOrder() {
  const tabElements = Array.from(tabList.querySelectorAll('.tab'));
  const newOrderIds = tabElements.map(el => el.dataset.tabId);

  const tabMap = new Map(tabs.map(t => [t.id, t]));

  tabs.length = 0;
  newOrderIds.forEach(id => {
    if (tabMap.has(id)) {
      tabs.push(tabMap.get(id));
    }
  });
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
    
    // Bookmark tracking & launching
    if (tool.isBookmark) {
      tool.openCount = (tool.openCount || 0) + 1;
      tool.openedAt = Date.now();
      await dbPut(tool);
      
      const idx = allTools.findIndex(t => t.id === tool.id);
      if (idx > -1) allTools[idx] = tool;
      
      // Auto re-render if a related sort mode is active to show changes
      if (sortMode === 'open' || sortMode === 'count') {
        renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
      }

      window.open(tool.url, '_blank', 'noopener,noreferrer');
      return;
    }
    
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

// ── ADD TOOL SHEET & CLEAR BTNS ──────────────────────────────
function updateClearBtnVisibility(input, btn) {
  if (input.value.length > 0) btn.classList.remove('hidden');
  else btn.classList.add('hidden');
}

toolNameInput.addEventListener('input', () => updateClearBtnVisibility(toolNameInput, toolNameClearBtn));
toolNameClearBtn.addEventListener('click', () => {
  toolNameInput.value = '';
  updateClearBtnVisibility(toolNameInput, toolNameClearBtn);
  toolNameInput.focus();
});

urlInput.addEventListener('input', () => {
  updateClearBtnVisibility(urlInput, urlClearBtn);
  processUrlAutoFill(urlInput.value.trim());
});
urlClearBtn.addEventListener('click', () => {
  urlInput.value = '';
  updateClearBtnVisibility(urlInput, urlClearBtn);
  urlInput.focus();
});

addBtn.addEventListener('click', () => openAddSheet());
addUrlFab.addEventListener('click', async () => {
  openAddSheet('add', null, 'url');
  try {
    const text = await navigator.clipboard.readText();
    if (isValidHttpUrl(text)) {
      urlInput.value = text;
      updateClearBtnVisibility(urlInput, urlClearBtn);
      processUrlAutoFill(text);
    }
  } catch(err) {
    // clipboard access denied or empty, silently proceed
  }
});

document.getElementsByName('toolType').forEach(radio => {
  radio.addEventListener('change', e => {
    if (e.target.value === 'url') {
      htmlFileGroup.classList.add('hidden');
      urlInputGroup.classList.remove('hidden');
      bookmarkGroup.classList.remove('hidden');
      tagsGroup.classList.remove('hidden');
      fetchIconBtn.style.display = 'inline-flex';
    } else {
      htmlFileGroup.classList.remove('hidden');
      urlInputGroup.classList.add('hidden');
      bookmarkGroup.classList.add('hidden');
      tagsGroup.classList.add('hidden');
      fetchIconBtn.style.display = 'none';
    }
  });
});

function openAddSheet(mode = 'add', toolId = null, forceType = null) {
  editMode = mode !== 'add';
  activeToolId = toolId;

  // reset form
  toolNameInput.value = '';
  updateClearBtnVisibility(toolNameInput, toolNameClearBtn);
  htmlFileInput.value = '';
  htmlPickText.textContent = 'Choose .html file';
  htmlPickLabel.classList.remove('has-file');
  urlInput.value = '';
  updateClearBtnVisibility(urlInput, urlClearBtn);
  isBookmarkCheckbox.checked = true;
  tagsInput.value = '';
  if (typeof tagsSuggestionBox !== 'undefined' && tagsSuggestionBox) tagsSuggestionBox.classList.add('hidden');
  pendingHtmlContent  = null;
  pendingNewIcon      = null;
  iconPreview.src     = '';
  iconPreview.classList.add('hidden');
  iconPlaceholder.style.display = 'flex';
  clearIconBtn.style.display    = 'none';
  fetchIconBtn.style.display    = 'none';

  bookmarkGroup.classList.add('hidden');
  tagsGroup.classList.add('hidden');

  let typeToSelect = forceType ? forceType : 'html';
  document.querySelector(`input[name="toolType"][value="${typeToSelect}"]`).checked = true;

  if (editMode) {
    sheetTitle.textContent = 'Edit Settings';
    htmlRequired.style.display = 'none';
    saveToolBtn.textContent    = 'Save Changes';
    toolTypeGroup.classList.add('hidden');

    dbGet(toolId).then(tool => {
      if (tool) {
        toolNameInput.value = tool.name;
        updateClearBtnVisibility(toolNameInput, toolNameClearBtn);
        if (tool.icon) {
          iconPreview.src = tool.icon;
          iconPreview.classList.remove('hidden');
          iconPlaceholder.style.display = 'none';
          clearIconBtn.style.display    = 'inline-flex';
          pendingNewIcon = tool.icon;
        }
        const type = tool.type === 'url' ? 'url' : 'html';
        if (type === 'html') {
          htmlFileGroup.classList.remove('hidden');
          urlInputGroup.classList.add('hidden');
          bookmarkGroup.classList.add('hidden');
          tagsGroup.classList.add('hidden');
          fetchIconBtn.style.display = 'none';
        } else {
          htmlFileGroup.classList.add('hidden');
          urlInputGroup.classList.remove('hidden');
          urlInput.value = tool.url || '';
          updateClearBtnVisibility(urlInput, urlClearBtn);
          bookmarkGroup.classList.remove('hidden');
          tagsGroup.classList.remove('hidden');
          fetchIconBtn.style.display = 'inline-flex';
          isBookmarkCheckbox.checked = !!tool.isBookmark;
          tagsInput.value = (tool.tags || []).join(', ');
        }
      }
    });
  } else {
    sheetTitle.textContent = 'Add Tool';
    htmlRequired.style.display = 'inline';
    saveToolBtn.textContent    = 'Save Tool';

    if (urlSupportEnabled) toolTypeGroup.classList.remove('hidden');
    else toolTypeGroup.classList.add('hidden');

    const selectedType = document.querySelector('input[name="toolType"]:checked').value;
    if (selectedType === 'url') {
      htmlFileGroup.classList.add('hidden');
      urlInputGroup.classList.remove('hidden');
      bookmarkGroup.classList.remove('hidden');
      tagsGroup.classList.remove('hidden');
      fetchIconBtn.style.display = 'inline-flex';
    } else {
      htmlFileGroup.classList.remove('hidden');
      urlInputGroup.classList.add('hidden');
    }
  }

  addSheet.classList.remove('hidden');
  sheetOverlay.classList.remove('hidden');
  
  setTimeout(() => {
     if (forceType === 'url') urlInput.focus();
     else toolNameInput.focus();
  }, 300);
}

function closeAddSheet() {
  addSheet.classList.add('hidden');
  sheetOverlay.classList.add('hidden');
}

cancelSheetBtn.addEventListener('click', closeAddSheet);
sheetOverlay.addEventListener('click', closeAddSheet);

// Auto-fill Logic
function processUrlAutoFill(urlVal) {
  if (!isValidHttpUrl(urlVal)) return;
  try {
    const u = new URL(urlVal);
    let domain = u.hostname.replace(/^www\./, '');
    let autoName = domain;
    let autoTag = null; 

    if (domain === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        autoName = parts[1]; // repo
      } else if (parts.length === 1) {
        autoName = parts[0]; // user
      }
      autoTag = 'github';
    } else if (domain === 'github.io') {
      autoTag = 'github';
    }

    if (!toolNameInput.value.trim()) {
      toolNameInput.value = autoName.charAt(0).toUpperCase() + autoName.slice(1);
      updateClearBtnVisibility(toolNameInput, toolNameClearBtn);
    }
    
    if (tagsGroup && !tagsGroup.classList.contains('hidden') && autoTag) {
      let currentTags = tagsInput.value.split(',').map(t=>t.trim()).filter(Boolean);
      if (!currentTags.includes(autoTag)) {
        currentTags.push(autoTag);
        tagsInput.value = currentTags.join(', ') + (currentTags.length ? ', ' : '');
      }
    }
  } catch(e) {}
}


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
      updateClearBtnVisibility(toolNameInput, toolNameClearBtn);
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

// Fetch Favicon
fetchIconBtn.addEventListener('click', () => {
  const urlVal = urlInput.value.trim();
  if (!isValidHttpUrl(urlVal)) {
    showToast('Enter a valid URL first', 'error');
    return;
  }
  try {
    const hostname = new URL(urlVal).hostname;
    const favUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
    pendingNewIcon = favUrl;
    iconPreview.src = favUrl;
    iconPreview.classList.remove('hidden');
    iconPlaceholder.style.display = 'none';
    clearIconBtn.style.display = 'inline-flex';
  } catch (err) {
    showToast('Invalid URL', 'error');
  }
});

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
    const type = urlSupportEnabled ? document.querySelector('input[name="toolType"]:checked').value : 'html';
    
    let finalHtml = null;
    let finalUrl  = null;
    let isBookmark = false;
    let tags = [];

    if (type === 'url') {
      const urlVal = urlInput.value.trim();
      if (!isValidHttpUrl(urlVal)) { showToast('Please enter a valid HTTP/HTTPS URL', 'error'); return; }
      finalUrl = urlVal;
      isBookmark = isBookmarkCheckbox.checked;
      tags = tagsInput.value.split(',').map(t=>t.toLowerCase().replace(/[\s-]/g, '')).filter(Boolean);
    } else {
      if (!pendingHtmlContent) { showToast('Please choose an HTML file', 'error'); return; }
      finalHtml = pendingHtmlContent;
    }

    const tool = {
      id:         crypto.randomUUID(),
      name,
      icon:       pendingNewIcon || null,
      type:       type,
      html:       finalHtml,
      url:        finalUrl,
      createdAt:  Date.now(),
      modifiedAt: Date.now(),
      order:      allTools.length,
      isBookmark,
      pinned:     false,
      tags
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
    try {
      const tool = await dbGet(activeToolId);
      if (!tool) return;
      tool.name = name;
      tool.icon = pendingNewIcon;
      tool.modifiedAt = Date.now();

      const type = tool.type === 'url' ? 'url' : 'html';
      if (type === 'html' && pendingHtmlContent) {
        tool.html = pendingHtmlContent;
      }
      if (type === 'url') {
        const urlVal = urlInput.value.trim();
        if (!isValidHttpUrl(urlVal)) { showToast('Please enter a valid HTTP/HTTPS URL', 'error'); return; }
        tool.url = urlVal;
        tool.isBookmark = isBookmarkCheckbox.checked;
        tool.tags = tagsInput.value.split(',').map(t=>t.toLowerCase().replace(/[\s-]/g, '')).filter(Boolean);
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
  if (!sortDropdown.classList.contains('hidden')) sortDropdown.classList.add('hidden');
});
function closeMenu() { menuDropdown.classList.add('hidden'); menuOverlay.classList.add('hidden'); }
menuOverlay.addEventListener('click', closeMenu);

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

  if (tool && tool.isBookmark) {
    ctxPin.classList.remove('hidden');
    ctxCopyUrl.classList.remove('hidden');
    ctxPinText.textContent = tool.pinned ? 'Unpin Bookmark' : 'Pin Bookmark';
  } else {
    ctxPin.classList.add('hidden');
    ctxCopyUrl.classList.add('hidden');
  }

  // position near anchor
  const rect = anchor.getBoundingClientRect();
  const menuW = 210, menuH = tool.isBookmark ? 250 : 190;
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
  openAddSheet('edit', activeToolId);
});

ctxChangeIcon.addEventListener('click', () => {
  closeToolMenu();
  changeIconInput.value = '';
  changeIconInput.click();
});

ctxPin.addEventListener('click', async () => {
  closeToolMenu();
  try {
    const tool = await dbGet(activeToolId);
    if(!tool) return;
    tool.pinned = !tool.pinned;
    tool.modifiedAt = Date.now();
    await dbPut(tool);
    allTools.find(t => t.id === activeToolId).pinned = tool.pinned;
    renderGrid(filterTools(searchInput.value.trim().toLowerCase()));
  } catch (err) {}
});

ctxCopyUrl.addEventListener('click', () => {
  closeToolMenu();
  const tool = allTools.find(t => t.id === activeToolId);
  if(tool && tool.url) {
    navigator.clipboard.writeText(tool.url);
    showToast('URL copied', 'success');
  }
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
      tool.modifiedAt = Date.now();
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
      tool.modifiedAt = Date.now();
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
    tool.modifiedAt = Date.now();
    await dbPut(tool);
    const idx = allTools.findIndex(t => t.id === activeToolId);
    if (idx > -1) {
      allTools[idx].name = newName;
      allTools[idx].modifiedAt = tool.modifiedAt;
    }
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
      if (!sortDropdown.classList.contains('hidden')) sortDropdown.classList.add('hidden');
      if (!deleteDialog.classList.contains('hidden')) deleteDialog.classList.add('hidden');
      if (!renameDialog.classList.contains('hidden')) renameDialog.classList.add('hidden');
    }
  }
});

// ── BOOT ─────────────────────────────────────────────────────
init();

// ── TAGS AUTOCOMPLETE ─────────────────────────────────────────
function getAllUniqueTags() {
  const tags = new Set();
  allTools.forEach(t => {
    if (t.tags) t.tags.forEach(tag => tags.add(tag));
  });
  return Array.from(tags).sort();
}

tagsInput.addEventListener('input', (e) => {
  const val = e.target.value;
  const parts = val.split(',');
  const currentWord = parts[parts.length - 1].trimLeft(); 
  const query = currentWord.trim().toLowerCase();

  if (query.length === 0) {
    tagsSuggestionBox.classList.add('hidden');
    return;
  }

  const allAvailableTags = getAllUniqueTags();
  const matches = allAvailableTags.filter(t => t.toLowerCase().includes(query));

  if (matches.length === 0 || (matches.length === 1 && matches[0].toLowerCase() === query)) {
    tagsSuggestionBox.classList.add('hidden');
    return;
  }

  tagsSuggestionBox.innerHTML = '';
  matches.forEach(match => {
    const div = document.createElement('div');
    div.className = 'tag-suggestion-item';
    div.textContent = match;
    div.addEventListener('click', () => {
      parts[parts.length - 1] = (parts.length > 1 ? ' ' : '') + match;
      tagsInput.value = parts.join(',') + ', ';
      tagsSuggestionBox.classList.add('hidden');
      tagsInput.focus();
    });
    tagsSuggestionBox.appendChild(div);
  });
  tagsSuggestionBox.classList.remove('hidden');
});

document.addEventListener('click', (e) => {
  if (!tagsInput.contains(e.target) && tagsSuggestionBox && !tagsSuggestionBox.contains(e.target)) {
    tagsSuggestionBox.classList.add('hidden');
  }
});