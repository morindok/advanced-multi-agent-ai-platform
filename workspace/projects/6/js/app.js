/* SyncNote — Core Application Logic (js/app.js) */
(function () {
  'use strict';

  /* ──────────────────────────────── CONSTANTS ──────────────────────────────── */

  var STORAGE_KEY = 'syncnote_data';
  var PREFS_KEY = 'syncnote_prefs';
  var APP_VERSION = '1.0.0';

  var CATEGORIES = ['عمومی', 'کار', 'شخصی', 'ایده', 'مهم'];
  var SORT_OPTIONS = [
    { value: 'updated', label: 'آخرین به‌روزرسانی' },
    { value: 'created', label: 'قدیمی‌ترین' },
    { value: 'title', label: 'الفبایی' },
    { value: 'priority', label: 'اولویت' }
  ];
  var PRIORITIES = [
    { value: 'low', label: 'پایین', color: '#6b7280' },
    { value: 'medium', label: 'متوسط', color: '#f59e0b' },
    { value: 'high', label: 'بالا', color: '#ef4444' }
  ];

  /* ──────────────────────────────── STATE ──────────────────────────────────── */

  var state = {
    notes: [],
    activeId: null,
    searchQuery: '',
    filterCategory: 'همه',
    sortBy: 'updated',
    sortOrder: 'desc',
    sidebarOpen: true,
    darkMode: false,
    syncStatus: 'ready',
    syncProgress: 0,
    view: 'list',
    editorInitialized: false,
    unsavedChanges: false,
    showConfirmModal: false,
    confirmAction: null,
    searchFocused: false,
    mobileMenuOpen: false
  };

  var quillEditor = null;
  var syncTimer = null;
  var saveDebounce = null;
  var idCounter = Date.now();

  /* ──────────────────────────────── UTILITY FUNCTIONS ──────────────────────── */

  function generateId() {
    return 'note_' + (++idCounter) + '_' + Math.random().toString(36).substr(2, 9);
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  function stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    var date = new Date(timestamp);
    var now = new Date();
    var diff = now - date;
    var mins = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(diff / 86400000);

    if (mins < 1) return 'همین الان';
    if (mins < 60) return mins + ' دقیقه پیش';
    if (hours < 24) return hours + ' ساعت پیش';
    if (days < 7) return days + ' روز پیش';
    return date.toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatFullDate(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString('fa-IR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function debounce(fn, delay) {
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(saveDebounce);
      saveDebounce = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  function getWordCount(html) {
    var text = stripHtml(html);
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) return 0;
    return text.split(' ').length;
  }

  /* ──────────────────────────────── PERSISTENCE ─────────────────────────────── */

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        state.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
        state.syncProgress = 100;
      }
    } catch (e) {
      console.warn('Load error:', e);
      state.notes = [];
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        notes: state.notes,
        version: APP_VERSION,
        updatedAt: Date.now()
      }));
      state.syncStatus = 'synced';
      state.syncProgress = 100;
      updateSyncIndicator();
    } catch (e) {
      console.warn('Save error:', e);
      state.syncStatus = 'error';
      updateSyncIndicator();
    }
  }

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        var prefs = JSON.parse(raw);
        if (prefs.darkMode !== undefined) state.darkMode = prefs.darkMode;
        if (prefs.sidebarOpen !== undefined) state.sidebarOpen = prefs.sidebarOpen;
        if (prefs.sortBy) state.sortBy = prefs.sortBy;
        if (prefs.sortOrder) state.sortOrder = prefs.sortOrder;
      }
    } catch (e) { /* ignore */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        darkMode: state.darkMode,
        sidebarOpen: state.sidebarOpen,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder
      }));
    } catch (e) { /* ignore */ }
  }

  /* ──────────────────────────────── NOTE CRUD ──────────────────────────────── */

  function createNote() {
    var note = {
      id: generateId(),
      title: 'بدون عنوان',
      content: '',
      category: state.filterCategory !== 'همه' ? state.filterCategory : 'عمومی',
      priority: 'medium',
      pinned: false,
      created: Date.now(),
      updated: Date.now(),
      wordCount: 0,
      charCount: 0
    };
    state.notes.unshift(note);
    setActiveNote(note.id);
    saveToStorage();
    renderAll();
    focusTitle();
    showToast('یادداشت جدید ایجاد شد', 'success');
  }

  function updateNote(id, changes) {
    var note = getNote(id);
    if (!note) return;
    Object.assign(note, changes, { updated: Date.now() });
    note.wordCount = getWordCount(note.content);
    note.charCount = (note.content || '').length;
    state.unsavedChanges = true;
    saveToStorage();
  }

  function deleteNote(id) {
    state.notes = state.notes.filter(function (n) { return n.id !== id; });
    if (state.activeId === id) {
      state.activeId = state.notes.length > 0 ? state.notes[0].id : null;
    }
    saveToStorage();
    renderAll();
    showToast('یادداشت حذف شد', 'info');
  }

  function duplicateNote(id) {
    var original = getNote(id);
    if (!original) return;
    var copy = Object.assign({}, original, {
      id: generateId(),
      title: original.title + ' (کپی)',
      created: Date.now(),
      updated: Date.now(),
      pinned: false
    });
    state.notes.unshift(copy);
    setActiveNote(copy.id);
    saveToStorage();
    renderAll();
    showToast('تکثیر شد', 'success');
  }

  function pinNote(id) {
    var note = getNote(id);
    if (!note) return;
    note.pinned = !note.pinned;
    note.updated = Date.now();
    saveToStorage();
    renderAll();
  }

  function toggleSyncStatus() {
    if (state.syncStatus === 'syncing') return;
    state.syncStatus = 'syncing';
    state.syncProgress = 0;
    updateSyncIndicator();

    var step = 0;
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(function () {
      step += 20;
      state.syncProgress = Math.min(step, 100);
      updateSyncIndicator();
      if (step >= 100) {
        clearInterval(syncTimer);
        syncTimer = null;
        state.syncStatus = 'synced';
        updateSyncIndicator();
      }
    }, 80);
  }

  function getNote(id) {
    return state.notes.find(function (n) { return n.id === id; }) || null;
  }

  function setActiveNote(id) {
    state.activeId = id;
    state.unsavedChanges = false;
    renderAll();
  }

  /* ──────────────────────────────── FILTERED & SORTED NOTES ─────────────────── */

  function getFilteredNotes() {
    var filtered = state.notes.slice();

    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(function (n) {
        return n.title.toLowerCase().indexOf(q) !== -1 ||
          stripHtml(n.content).toLowerCase().indexOf(q) !== -1;
      });
    }

    if (state.filterCategory !== 'همه') {
      filtered = filtered.filter(function (n) { return n.category === state.filterCategory; });
    }

    var pinned = filtered.filter(function (n) { return n.pinned; });
    var unpinned = filtered.filter(function (n) { return !n.pinned; });

    var sortFn = function (a, b) {
      var va, vb;
      switch (state.sortBy) {
        case 'title':
          va = a.title.toLowerCase(); vb = b.title.toLowerCase();
          return state.sortOrder === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        case 'priority':
          var po = { high: 3, medium: 2, low: 1 };
          va = po[a.priority] || 0; vb = po[b.priority] || 0;
          return state.sortOrder === 'asc' ? va - vb : vb - va;
        case 'created':
          va = a.created; vb = b.created;
          return state.sortOrder === 'asc' ? va - vb : vb - va;
        case 'updated':
        default:
          va = a.updated; vb = b.updated;
          return state.sortOrder === 'asc' ? va - vb : vb - va;
      }
    };

    pinned.sort(sortFn);
    unpinned.sort(sortFn);
    return pinned.concat(unpinned);
  }

  /* ──────────────────────────────── EDITOR INITIALIZATION ──────────────────── */

  function initEditor() {
    if (typeof Quill === 'undefined') {
      console.error('Quill not loaded from CDN');
      return;
    }

    var editorEl = document.getElementById('editor-container');
    if (!editorEl) return;

    quillEditor = new Quill('#editor-container', {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ 'header': [1, 2, 3, false] }],
          [{ 'font': [] }],
          [{ 'size': ['small', false, 'large', 'huge'] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'color': [] }, { 'background': [] }],
          [{ 'script': 'sub' }, { 'script': 'super' }],
          [{ 'align': [] }],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          [{ 'indent': '-1' }, { 'indent': '+1' }],
          ['blockquote', 'code-block'],
          ['link', 'image', 'video'],
          ['clean'],
          [{ 'direction': 'rtl' }]
        ]
      },
      placeholder: 'متن یادداشت خود را اینجا بنویسید...',
      theme: 'snow'
    });

    state.editorInitialized = true;

    quillEditor.on('text-change', function (delta, oldDelta, source) {
      if (source === 'user' && state.activeId) {
        var content = quillEditor.root.innerHTML;
        updateNote(state.activeId, { content: content });
        renderEditorInfo();
        highlightActiveNote();
        updateSidebarPreview();
      }
    });

    quillEditor.on('selection-change', function (range, oldRange, source) {
      if (source === 'user' && state.activeId) {
        updateToolbarStates();
      }
    });

    renderAll();
  }

  function loadEditorContent(id) {
    if (!quillEditor || !id) return;
    var note = getNote(id);
    if (!note) return;
    quillEditor.root.innerHTML = note.content || '';
    quillEditor.setText('');
    if (note.content) {
      quillEditor.clipboard.dangerouslyPasteHTML(note.content);
    } else {
      quillEditor.setText('');
    }
    quillEditor.selection.setRange(0, 0);
    renderEditorInfo();
    updateToolbarStates();
  }

  /* ──────────────────────────────── THEME ───────────────────────────────────── */

  function applyTheme() {
    var html = document.documentElement;
    if (state.darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    if (quillEditor) {
      var themeClass = state.darkMode ? 'ql-dark' : 'ql-light';
      var container = document.querySelector('.ql-container');
      if (container) {
        container.classList.toggle('dark', state.darkMode);
      }
    }
    savePrefs();
  }

  /* ──────────────────────────────── RENDER FUNCTIONS ───────────────────────── */

  function renderAll() {
    renderNoteList();
    renderEditor();
    renderSidebar();
    renderHeader();
    applyTheme();
  }

  function renderHeader() {
    var header = document.getElementById('app-header');
    if (!header) return;

    var syncIcon = state.syncStatus === 'syncing' ? '⟳' :
      state.syncStatus === 'error' ? '⚠' : '✓';
    var syncColor = state.syncStatus === 'syncing' ? '#f59e0b' :
      state.syncStatus === 'error' ? '#ef4444' : '#10b981';
    var syncText = state.syncStatus === 'syncing' ? 'در حال همگام‌سازی…' :
      state.syncStatus === 'error' ? 'خطا' : 'هماهنگ شده';

    header.innerHTML =
      '<div class="header-left">' +
        '<button class="menu-toggle" id="btn-menu-toggle" aria-label="منو">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
        '<div class="logo">' +
          '<span class="logo-icon">📝</span>' +
          '<span class="logo-text">SyncNote</span>' +
        '</div>' +
      '</div>' +
      '<div class="header-center">' +
        '<div class="search-box">' +
          '<span class="search-icon">🔍</span>' +
          '<input type="text" id="search-input" placeholder="جستجو در یادداشت‌ها…" ' +
            'value="' + escapeHtml(state.searchQuery) + '" autocomplete="off" />' +
          '<button id="btn-search-clear" class="search-clear" style="display:none">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="header-right">' +
        '<button id="btn-sync" title="همگام‌سازی" class="icon-btn">' +
          '<span class="sync-icon" style="color:' + syncColor + '">' + syncIcon + '</span>' +
          '<span class="sync-text">' + syncText + '</span>' +
        '</button>' +
        '<button id="btn-theme" title="تغییر تم" class="icon-btn">' +
          '<span>' + (state.darkMode ? '☀️' : '🌙') + '</span>' +
        '</button>' +
        '<button id="btn-export" title="خروجی" class="icon-btn">⬇</button>' +
        '<button id="btn-import" title="ورودی" class="icon-btn">⬆</button>' +
      '</div>';

    /* Header events */
    var btnMenu = document.getElementById('btn-menu-toggle');
    if (btnMenu) btnMenu.addEventListener('click', toggleSidebar);

    var btnTheme = document.getElementById('btn-theme');
    if (btnTheme) btnTheme.addEventListener('click', toggleDarkMode);

    var btnSync = document.getElementById('btn-sync');
    if (btnSync) btnSync.addEventListener('click', toggleSyncStatus);

    var btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', exportNotes);

    var btnImport = document.getElementById('btn-import');
    if (btnImport) btnImport.addEventListener('click', triggerImport);

    var searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('focus', function () { state.searchFocused = true; renderNoteList(); });
      searchInput.addEventListener('blur', function () { state.searchFocused = false; renderNoteList(); });
      searchInput.addEventListener('input', function (e) {
        state.searchQuery = e.target.value;
        var clearBtn = document.getElementById('btn-search-clear');
        if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
        renderNoteList();
      });
    }

    var clearBtn = document.getElementById('btn-search-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        state.searchQuery = '';
        var input = document.getElementById('search-input');
        if (input) input.value = '';
        clearBtn.style.display = 'none';
        renderNoteList();
      });
    }
  }

  function renderNoteList() {
    var list = document.getElementById('notes-list');
    if (!list) return;

    var filtered = getFilteredNotes();
    var totalNotes = state.notes.length;
    var filteredCount = filtered.length;

    list.innerHTML =
      '<div class="notes-header">' +
        '<span class="notes-count">' + totalNotes + ' یادداشت' +
          (filteredCount !== totalNotes ? ' · ' + filteredCount + ' نمایش' : '') + '</span>' +
        '<div class="sort-controls">' +
          '<select id="sort-select" class="sort-select">' +
            SORT_OPTIONS.map(function (o) {
              return '<option value="' + o.value + '"' +
                (state.sortBy === o.value ? ' selected' : '') + '>' + o.label + '</option>';
            }).join('') +
          '</select>' +
          '<button id="sort-order-btn" class="sort-order-btn" title="تغییر ترتیب">' +
            (state.sortOrder === 'asc' ? '↑' : '↓') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="category-filters">' +
        '<button class="cat-btn ' + (state.filterCategory === 'همه' ? 'active' : '') + '" data-cat="همه">همه</button>' +
        CATEGORIES.map(function (c) {
          return '<button class="cat-btn ' + (state.filterCategory === c ? 'active' : '') + '" data-cat="' + c + '">' + c + '</button>';
        }).join('') +
      '</div>';

    if (filtered.length === 0) {
      list.innerHTML +=
        '<div class="empty-state">' +
          '<div class="empty-icon">' + (state.searchQuery ? '🔍' : '📝') + '</div>' +
          '<div class="empty-title">' + (state.searchQuery ? 'نتیجه‌ای یافت نشد' : 'هنوز یادداشتی ندارید') + '</div>' +
          '<div class="empty-desc">' + (state.searchQuery ? 'عبارت دیگری جستجو کنید' : 'با دکمه + یک یادداشت جدید بسازید') + '</div>' +
        '</div>';
      return;
    }

    filtered.forEach(function (note) {
      var isActive = note.id === state.activeId;
      var priority = PRIORITIES.find(function (p) { return p.value === note.priority; }) || PRIORITIES[1];
      var preview = stripHtml(note.content).substring(0, 80);
      var title = note.title.trim() ? note.title : 'بدون عنوان';

      var el = document.createElement('div');
      el.className = 'note-item' + (isActive ? ' active' : '') + (note.pinned ? ' pinned' : '');
      el.setAttribute('data-id', note.id);
      el.innerHTML =
        '<div class="note-item-top">' +
          '<span class="note-title">' + escapeHtml(title) + '</span>' +
          '<span class="note-pin">' + (note.pinned ? '📌' : '') + '</span>' +
        '</div>' +
        '<div class="note-preview">' + escapeHtml(preview) + '</div>' +
        '<div class="note-meta">' +
          '<span class="note-category" style="--pc:' + priority.color + '">' + note.category + '</span>' +
          '<span class="note-time">' + formatDate(note.updated) + '</span>' +
          '<span class="note-priority-dot" style="background:' + priority.color + '"></span>' +
        '</div>';

      list.appendChild(el);
    });

    /* Event listeners */
    var items = list.querySelectorAll('.note-item');
    items.forEach(function (item) {
      item.addEventListener('click', function (e) {
        if (e.target.closest('.note-delete-btn')) return;
        var id = item.getAttribute('data-id');
        setActiveNote(id);
      });
    });

    var sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', function (e) {
        state.sortBy = e.target.value;
        savePrefs();
        renderNoteList();
      });
    }

    var sortOrderBtn = document.getElementById('sort-order-btn');
    if (sortOrderBtn) {
      sortOrderBtn.addEventListener('click', function () {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
        savePrefs();
        renderAll();
      });
    }

    var catBtns = list.querySelectorAll('.cat-btn');
    catBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filterCategory = btn.getAttribute('data-cat');
        renderNoteList();
      });
    });
  }

  function renderEditor() {
    var editorArea = document.getElementById('editor-area');
    if (!editorArea) return;

    if (!state.activeId) {
      editorArea.innerHTML =
        '<div class="editor-placeholder">' +
          '<div class="placeholder-icon">📝</div>' +
          '<div class="placeholder-title">SyncNote را انتخاب کنید</div>' +
          '<div class="placeholder-desc">از لیست سمت راست یک یادداشت انتخاب کنید یا با دکمه + یک یادداشت جدید بسازید</div>' +
          '<button class="btn-new-note" id="btn-editor-new">+ یادداشت جدید</button>' +
        '</div>';
      var newBtn = document.getElementById('btn-editor-new');
      if (newBtn) newBtn.addEventListener('click', createNote);
      return;
    }

    var note = getNote(state.activeId);
    if (!note) {
      editorArea.innerHTML = '<div class="editor-placeholder"><div class="placeholder-title">یادداشتی یافت نشد</div></div>';
      return;
    }

    var priority = PRIORITIES.find(function (p) { return p.value === note.priority; }) || PRIORITIES[1];

    editorArea.innerHTML =
      '<div class="editor-topbar">' +
        '<div class="editor-topbar-left">' +
          '<input type="text" id="note-title-input" class="title-input" ' +
            'value="' + escapeHtml(note.title) + '" placeholder="عنوان یادداشت…" />' +
        '</div>' +
        '<div class="editor-topbar-right">' +
          '<select id="priority-select" class="priority-select">' +
            PRIORITIES.map(function (p) {
              return '<option value="' + p.value + '"' +
                (note.priority === p.value ? ' selected' : '') + ' style="color:' + p.color + '">' + p.label + '</option>';
            }).join('') +
          '</select>' +
          '<select id="category-select" class="category-select">' +
            CATEGORIES.map(function (c) {
              return '<option value="' + c + '"' +
                (note.category === c ? ' selected' : '') + '>' + c + '</option>';
            }).join('') +
          '</select>' +
          '<button id="btn-pin" class="icon-btn" title="سنجاق">' + (note.pinned ? '📌' : '📍') + '</button>' +
          '<button id="btn-duplicate" class="icon-btn" title="تکثیر">⧉</button>' +
          '<button id="btn-delete" class="icon-btn btn-delete" title="حذف">🗑</button>' +
        '</div>' +
      '</div>' +
      '<div class="editor-divider"></div>' +
      '<div id="quill-editor" class="quill-editor"></div>';

    /* Bind events */
    var titleInput = document.getElementById('note-title-input');
    if (titleInput) {
      titleInput.addEventListener('input', function (e) {
        updateNote(note.id, { title: e.target.value });
        renderNoteList();
      });
      titleInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          focusEditor();
        }
      });
    }

    var prioritySelect = document.getElementById('priority-select');
    if (prioritySelect) {
      prioritySelect.addEventListener('change', function (e) {
        updateNote(note.id, { priority: e.target.value });
        renderNoteList();
      });
    }

    var categorySelect = document.getElementById('category-select');
    if (categorySelect) {
      categorySelect.addEventListener('change', function (e) {
        updateNote(note.id, { category: e.target.value });
        state.filterCategory = 'همه';
        renderAll();
      });
    }

    var btnPin = document.getElementById('btn-pin');
    if (btnPin) btnPin.addEventListener('click', function () { pinNote(note.id); renderEditor(); });

    var btnDuplicate = document.getElementById('btn-duplicate');
    if (btnDuplicate) btnDuplicate.addEventListener('click', function () { duplicateNote(note.id); });

    var btnDelete = document.getElementById('btn-delete');
    if (btnDelete) {
      btnDelete.addEventListener('click', function () {
        showConfirmModal('حذف یادداشت', 'آیا از حذف این یادداشت مطمئن هستید؟', function () {
          deleteNote(note.id);
          hideConfirmModal();
        });
      });
    }

    loadEditorContent(note.id);
    renderEditorInfo();
  }

  function renderEditorInfo() {
    var infoBar = document.getElementById('editor-info-bar');
    if (!infoBar) return;
    var note = getNote(state.activeId);
    if (!note) { infoBar.innerHTML = ''; return; }

    infoBar.innerHTML =
      '<span class="info-item">🕐 ' + formatFullDate(note.updated) + '</span>' +
      '<span class="info-item">📄 ' + note.wordCount + ' کلمه</span>' +
      '<span class="info-item">🔤 ' + note.charCount + ' کاراکتر</span>' +
      (state.unsavedChanges ? '<span class="info-item info-draft">⏎ نسخه‌ی پیش‌نویس</span>' : '');
  }

  function renderSidebar() {
    var sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('closed', !state.sidebarOpen);
    sidebar.classList.toggle('open', state.sidebarOpen);
  }

  function renderSyncIndicator() {
    var indicator = document.getElementById('sync-indicator');
    if (!indicator) return;
    var status = state.syncStatus;
    var color = status === 'syncing' ? '#f59e0b' :
      status === 'error' ? '#ef4444' : '#10b981';
    var text = status === 'syncing' ? 'در حال همگام‌سازی…' :
      status === 'error' ? 'خطای همگام‌سازی' : 'هماهنگ شده';
    indicator.innerHTML = '<span class="sync-dot" style="background:' + color + '"></span><span>' + text + '</span>';
  }

  function updateSyncIndicator() {
    renderSyncIndicator();
    renderHeader();
  }

  /* ──────────────────────────────── HIGHLIGHT & PREVIEW ────────────────────── */

  function highlightActiveNote() {
    var items = document.querySelectorAll('.note-item');
    items.forEach(function (item) {
      var id = item.getAttribute('data-id');
      item.classList.toggle('active', id === state.activeId);
    });
  }

  function updateSidebarPreview() {
    /* Could add a live preview panel in the sidebar */
  }

  function updateToolbarStates() {
    /* Quill toolbar state updates handled by Quill internally */
  }

  function focusTitle() {
    var input = document.getElementById('note-title-input');
    if (input) { input.focus(); input.select(); }
  }

  function focusEditor() {
    if (quillEditor) quillEditor.focus();
  }

  /* ──────────────────────────────── MODALS & TOASTS ────────────────────────── */

  function showConfirmModal(title, message, onConfirm) {
    state.showConfirmModal = true;
    state.confirmAction = onConfirm;

    var overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    overlay.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<h3>' + escapeHtml(title) + '</h3>' +
          '<button class="modal-close" id="btn-modal-close">×</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<p>' + escapeHtml(message) + '</p>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-secondary" id="btn-modal-cancel">انصراف</button>' +
          '<button class="btn btn-danger" id="btn-modal-confirm">حذف</button>' +
        '</div>' +
      '</div>';

    overlay.style.display = 'flex';

    document.getElementById('btn-modal-close').addEventListener('click', hideConfirmModal);
    document.getElementById('btn-modal-cancel').addEventListener('click', hideConfirmModal);
    document.getElementById('btn-modal-confirm').addEventListener('click', function () {
      if (state.confirmAction) state.confirmAction();
      hideConfirmModal();
    });
  }

  function hideConfirmModal() {
    state.showConfirmModal = false;
    state.confirmAction = null;
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function showToast(message, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span><span>' + escapeHtml(message) + '</span>';
    container.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('show');
    });

    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3000);
  }

  /* ──────────────────────────────── IMPORT / EXPORT ────────────────────────── */

  function exportNotes() {
    var data = {
      app: 'SyncNote',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      notes: state.notes
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'syncnote-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('یادداشت‌ها خروجی گرفته شدند', 'success');
  }

  function triggerImport() {
    var input = document.getElementById('import-file-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'import-file-input';
      input.accept = '.json';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', handleImport);
    }
    input.click();
  }

  function handleImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (data.notes && Array.isArray(data.notes)) {
          var count = data.notes.length;
          data.notes.forEach(function (n) {
            if (!n.id) n.id = generateId();
            if (!n.created) n.created = Date.now();
            if (!n.updated) n.updated = Date.now();
            n.wordCount = getWordCount(n.content || '');
            n.charCount = (n.content || '').length;
            if (!state.notes.find(function (x) { return x.id === n.id; })) {
              state.notes.push(n);
            }
          });
          saveToStorage();
          renderAll();
          showToast(count + ' یادداشت وارد شد', 'success');
        } else {
          showToast('فرمت فایل معتبر نیست', 'error');
        }
      } catch (err) {
        showToast('خطا در خواندن فایل', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* ──────────────────────────────── KEYBOARD SHORTCUTS ─────────────────────── */

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'n') {
        e.preventDefault();
        createNote();
      } else if (ctrl && e.key === 'f') {
        e.preventDefault();
        var searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.focus();
      } else if (ctrl && e.key === 's') {
        e.preventDefault();
        saveToStorage();
        showToast('ذخیره شد', 'success');
      } else if (ctrl && e.key === 'e') {
        e.preventDefault();
        exportNotes();
      } else if (e.key === 'Escape') {
        hideConfirmModal();
        if (state.mobileMenuOpen) toggleMobileMenu();
      } else if (e.key === '/' && !ctrl && !e.shiftKey) {
        var active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        var si = document.getElementById('search-input');
        if (si) si.focus();
      }
    });
  }

  /* ──────────────────────────────── SIDEBAR & MOBILE ──────────────────────── */

  function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    savePrefs();
    renderSidebar();
  }

  function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    applyTheme();
    showToast(state.darkMode ? 'حالت تاریک فعال شد' : 'حالت روشن فعال شد', 'info');
  }

  function toggleMobileMenu() {
    state.mobileMenuOpen = !state.mobileMenuOpen;
    var sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.classList.toggle('mobile-open', state.mobileMenuOpen);
  }

  /* ──────────────────────────────── EVENT LISTENERS ────────────────────────── */

  function initEventListeners() {
    var newNoteBtn = document.getElementById('btn-new-note');
    if (newNoteBtn) newNoteBtn.addEventListener('click', createNote);

    var newNoteFab = document.getElementById('btn-new-fab');
    if (newNoteFab) newNoteFab.addEventListener('click', createNote);

    document.addEventListener('click', function (e) {
      if (state.mobileMenuOpen && e.target.id === 'app-main') {
        state.mobileMenuOpen = false;
        var sidebar
