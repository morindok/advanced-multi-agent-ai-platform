/* js/editor.js — Rich Text Editor Logic for SyncNote */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     State
  ───────────────────────────────────────────── */
  var _editor = null;
  var _docId = null;
  var _lastSelection = null;
  var _history = [];
  var _historyIndex = -1;
  var _maxHistory = 50;
  var _isComposing = false;
  var _saveTimeout = null;
  var _onContentChange = null;
  var _onTitleChange = null;
  var _onCursorChange = null;

  /* ─────────────────────────────────────────────
     Formatting Commands Map
  ───────────────────────────────────────────── */
  var CMD_MAP = {
    'btn-bold': 'bold',
    'btn-italic': 'italic',
    'btn-underline': 'underline',
    'btn-strikeThrough': 'strikeThrough',
    'btn-insertUnorderedList': 'insertUnorderedList',
    'btn-insertOrderedList': 'insertOrderedList',
    'btn-justifyLeft': 'justifyLeft',
    'btn-justifyCenter': 'justifyCenter',
    'btn-justifyRight': 'justifyRight',
    'btn-indent': 'indent',
    'btn-outdent': 'outdent',
    'btn-createLink': 'createLink',
    'btn-removeLink': 'removeLink',
    'btn-insertHorizontalRule': 'insertHorizontalRule',
    'btn-foreColor': 'foreColor',
    'btn-backColor': 'backColor',
    'btn-formatBlock-h1': 'formatBlock',
    'btn-formatBlock-h2': 'formatBlock',
    'btn-formatBlock-h3': 'formatBlock',
    'btn-formatBlock-p': 'formatBlock',
    'btn-formatBlock-blockquote': 'formatBlock',
    'btn-code': 'formatCode',
    'btn-clearFormatting': 'removeFormat',
    'btn-undo': 'undo',
    'btn-redo': 'redo',
    'btn-delete': 'delete'
  };

  /* ─────────────────────────────────────────────
     Init
  ───────────────────────────────────────────── */
  function init(editorEl, titleEl, docId) {
    _editor = editorEl;
    _docId = docId;
    _editor.setAttribute('contenteditable', 'true');
    _editor.setAttribute('spellcheck', 'true');
    _editor.setAttribute('data-placeholder', 'شروع به نوشتن کنید...');
    _history = [];
    _historyIndex = -1;

    _editor.addEventListener('compositionstart', function () {
      _isComposing = true;
    });
    _editor.addEventListener('compositionend', function () {
      _isComposing = false;
      _afterInput();
    });
    _editor.addEventListener('input', function () {
      if (!_isComposing) _afterInput();
      _updatePlaceholder();
    });
    _editor.addEventListener('keyup', _onCursorChange && _pushHistory);
    _editor.addEventListener('mouseup', _onCursorChange ? _emitCursor : null);
    _editor.addEventListener('focus', _updatePlaceholder);
    _editor.addEventListener('blur', function () {
      _updatePlaceholder();
      if (_onContentChange) _flushSave();
    });
    _editor.addEventListener('keydown', _handleKeyDown);
    _editor.addEventListener('paste', _handlePaste);

    _updatePlaceholder();
    _pushHistory();
    return _editor;
  }

  /* ─────────────────────────────────────────────
     Placeholder
  ───────────────────────────────────────────── */
  function _updatePlaceholder() {
    if (!_editor) return;
    var hasContent = _editor.innerHTML.trim() !== '' &&
      _editor.innerHTML.trim() !== '<br>';
    _editor.classList.toggle('empty', !hasContent);
  }

  /* ─────────────────────────────────────────────
     KeyDown Handler
  ───────────────────────────────────────────── */
  function _handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); execCmd('bold'); break;
        case 'i': e.preventDefault(); execCmd('italic'); break;
        case 'u': e.preventDefault(); execCmd('underline'); break;
        case 'z':
          if (e.shiftKey) { e.preventDefault(); execCmd('redo'); }
          else { e.preventDefault(); execCmd('undo'); }
          break;
        case 'y': e.preventDefault(); execCmd('redo'); break;
        case 'k': e.preventDefault(); insertLink(); break;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      execCmd('insertText', '\t');
    }
  }

  /* ─────────────────────────────────────────────
     Paste Handler — strip HTML, keep text
  ───────────────────────────────────────────── */
  function _handlePaste(e) {
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    e.preventDefault();
    document.execCommand('insertText', false, text);
  }

  /* ─────────────────────────────────────────────
     After Input — debounce save + history
  ───────────────────────────────────────────── */
  function _afterInput() {
    _pushHistory();
    if (_onContentChange) {
      clearTimeout(_saveTimeout);
      _saveTimeout = setTimeout(_flushSave, 800);
    }
  }

  function _flushSave() {
    if (_onContentChange) _onContentChange(_docId, _editor.innerHTML);
  }

  /* ─────────────────────────────────────────────
     History (Undo/Redo)
  ───────────────────────────────────────────── */
  function _pushHistory() {
    if (!_editor) return;
    var html = _editor.innerHTML;
    if (_historyIndex >= 0 && _history[_historyIndex] === html) return;
    _history = _history.slice(0, _historyIndex + 1);
    _history.push(html);
    if (_history.length > _maxHistory) _history.shift();
    _historyIndex = _history.length - 1;
  }

  function undo() {
    if (_historyIndex > 0) {
      _historyIndex--;
      _editor.innerHTML = _history[_historyIndex];
      _updatePlaceholder();
      if (_onContentChange) _flushSave();
    }
  }

  function redo() {
    if (_historyIndex < _history.length - 1) {
      _historyIndex++;
      _editor.innerHTML = _history[_historyIndex];
      _updatePlaceholder();
      if (_onContentChange) _flushSave();
    }
  }

  function canUndo() { return _historyIndex > 0; }
  function canRedo() { return _historyIndex < _history.length - 1; }

  /* ─────────────────────────────────────────────
     execCmd — central command dispatcher
  ───────────────────────────────────────────── */
  function execCmd(command, value) {
    _editor.focus();
    if (command === 'formatBlock') {
      document.execCommand(command, false, '<' + value.toUpperCase() + '>');
    } else if (command === 'formatCode') {
      _toggleCodeBlock();
    } else if (command === 'removeFormat') {
      document.execCommand('removeFormat', false, null);
      document.execCommand('formatBlock', false, '<p>');
    } else {
      document.execCommand(command, false, value || null);
    }
    _pushHistory();
    if (_onContentChange) _flushSave();
    _emitCursor();
  }

  /* ─────────────────────────────────────────────
     Toggle Code Block
  ───────────────────────────────────────────── */
  function _toggleCodeBlock() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var block = _findBlock(sel.anchorNode);
    if (!block) return;
    if (block.tagName === 'PRE') {
      var txt = block.textContent;
      var p = document.createElement('p');
      p.innerHTML = txt;
      block.parentNode.replaceChild(p, block);
    } else {
      var range = sel.getRangeAt(0);
      var fragment = range.cloneContents();
      var pre = document.createElement('pre');
      pre.innerHTML = fragment.innerHTML;
      range.deleteContents();
      range.insertNode(pre);
      range.setStartAfter(pre);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    _pushHistory();
    if (_onContentChange) _flushSave();
  }

  function _findBlock(node) {
    var el = node;
    while (el && el !== _editor) {
      if (el.nodeType === 1 && (el.tagName === 'P' || el.tagName === 'H1' ||
        el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'BLOCKQUOTE' ||
        el.tagName === 'PRE' || el.tagName === 'UL' || el.tagName === 'OL')) {
        return el;
      }
      el = el.parentNode;
    }
    return null;
  }

  /* ─────────────────────────────────────────────
     Insert Link
  ───────────────────────────────────────────── */
  function insertLink(url) {
    var linkUrl = url || prompt('URL لینک را وارد کنید:', 'https://');
    if (!linkUrl) return;
    _editor.focus();
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var text = sel.toString();
    var a = document.createElement('a');
    a.href = linkUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text || linkUrl;
    var range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(a);
    range.setStartAfter(a);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    _pushHistory();
    if (_onContentChange) _flushSave();
  }

  /* ─────────────────────────────────────────────
     Set Content
  ───────────────────────────────────────────── */
  function setContent(html) {
    _editor.innerHTML = html;
    _history = [html];
    _historyIndex = 0;
    _updatePlaceholder();
  }

  function getContent() {
    return _editor.innerHTML;
  }

  function getText() {
    return _editor.innerText || _editor.textContent;
  }

  /* ─────────────────────────────────────────────
     Cursor / Selection
  ───────────────────────────────────────────── */
  function saveSelection() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    _lastSelection = {
      startContainer: range.startContainer.nodeIndex || range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer.nodeIndex || range.endContainer,
      endOffset: range.endOffset
    };
    return _lastSelection;
  }

  function restoreSelection(sel) {
    if (!sel || !sel.startContainer) return;
    var range = document.createRange();
    try {
      range.setStart(sel.startContainer, sel.startOffset);
      range.setEnd(sel.endContainer, sel.endOffset);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (e) { /* ignore */ }
  }

  function _emitCursor() {
    if (_onCursorChange) {
      var sel = window.getSelection();
      _onCursorChange({
        hasSelection: !sel.isCollapsed,
        selectedText: sel.toString(),
        isBold: document.queryCommandState('bold'),
        isItalic: document.queryCommandState('italic'),
        isUnderline: document.queryCommandState('underline'),
        isOrdered: document.queryCommandState('insertOrderedList'),
        isUnordered: document.queryCommandState('insertUnorderedList'),
        isLinked: document.queryCommandState('createLink')
      });
    }
  }

  /* ─────────────────────────────────────────────
     Toolbar Integration
  ───────────────────────────────────────────── */
  function bindToolbar(toolbarEl) {
    if (!toolbarEl) return;
    toolbarEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      e.preventDefault();
      var cmd = btn.getAttribute('data-cmd');
      var val = btn.getAttribute('data-val');
      var map = CMD_MAP[cmd];
      if (!map) return;
      if (map === 'createLink') {
        insertLink(val);
      } else if (map === 'foreColor' || map === 'backColor') {
        execCmd(map, val);
      } else if (map === 'formatBlock') {
        execCmd(map, val);
      } else if (map === 'formatCode') {
        execCmd(map);
      } else if (map === 'undo' || map === 'redo') {
        if (map === 'undo') undo();
        else redo();
      } else if (map === 'delete') {
        execCmd('delete');
      } else {
        execCmd(map);
      }
      _updateToolbarState(btn);
    });

    toolbarEl.addEventListener('mouseover', function (e) {
      var btn = e.target.closest('[data-cmd]');
      if (btn) btn.classList.add('hover');
    });
    toolbarEl.addEventListener('mouseout', function (e) {
      var btn = e.target.closest('[data-cmd]');
      if (btn) btn.classList.remove('hover');
    });
  }

  function _updateToolbarState(activeBtn) {
    /* highlight active buttons based on queryCommandState */
  }

  function updateToolbarStates() {
    var state = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      justifyLeft: document.queryCommandState('justifyLeft'),
      justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight: document.queryCommandState('justifyRight'),
      indent: document.queryCommandState('indent'),
      outdent: document.queryCommandState('outdent'),
      createLink: document.queryCommandState('createLink')
    };
    Object.keys(state).forEach(function (key) {
      var btn = document.querySelector('[data-cmd="' + key + '"]');
      if (btn) btn.classList.toggle('active', state[key]);
    });
    var undoBtn = document.querySelector('[data-cmd="btn-undo"]');
    var redoBtn = document.querySelector('[data-cmd="btn-redo"]');
    if (undoBtn) undoBtn.classList.toggle('disabled', !canUndo());
    if (redoBtn) redoBtn.classList.toggle('disabled', !canRedo());
  }

  /* ─────────────────────────────────────────────
     Shortcuts Info
  ───────────────────────────────────────────── */
  var SHORTCUTS = [
    { key: 'Ctrl+B', action: 'Bold' },
    { key: 'Ctrl+I', action: 'Italic' },
    { key: 'Ctrl+U', action: 'Underline' },
    { key: 'Ctrl+Z', action: 'Undo' },
    { key: 'Ctrl+Shift+Z', action: 'Redo' },
    { key: 'Ctrl+K', action: 'Insert Link' }
  ];

  function getShortcuts() { return SHORTCUTS; }

  /* ─────────────────────────────────────────────
     Clear
  ───────────────────────────────────────────── */
  function clearContent() {
    _editor.innerHTML = '';
    _history = [''];
    _historyIndex = 0;
    _updatePlaceholder();
    if (_onContentChange) _flushSave();
  }

  /* ─────────────────────────────────────────────
     Insert timestamp
  ───────────────────────────────────────────── */
  function insertTimestamp() {
    var now = new Date();
    var str = now.toLocaleDateString('fa-IR') + ' — ' +
      now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    execCmd('insertText', '\n📅 ' + str + '\n');
  }

  /* ─────────────────────────────────────────────
     Export as HTML
  ───────────────────────────────────────────── */
  function exportHTML() {
    return '<!DOCTYPE html>\n<html lang="fa" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<title>SyncNote Export</title>\n</head>\n<body>\n' + _editor.innerHTML + '\n</body>\n</html>';
  }

  /* ─────────────────────────────────────────────
     Focus
  ───────────────────────────────────────────── */
  function focus() {
    _editor.focus();
  }

  function blur() {
    _editor.blur();
  }

  /* ─────────────────────────────────────────────
     Heading shortcuts (press 1-3 after selecting text)
  ───────────────────────────────────────────── */
  function _handleHeadingKey(e) {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    if (e.key === '1' && e.ctrlKey) { execCmd('formatBlock', 'h1'); e.preventDefault(); }
    if (e.key === '2' && e.ctrlKey) { execCmd('formatBlock', 'h2'); e.preventDefault(); }
    if (e.key === '3' && e.ctrlKey) { execCmd('formatBlock', 'h3'); e.preventDefault(); }
  }

  /* ─────────────────────────────────────────────
     Public API
  ───────────────────────────────────────────── */
  window.Editor = {
    init: init,
    execCmd: execCmd,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    insertLink: insertLink,
    setContent: setContent,
    getContent: getContent,
    getText: getText,
    saveSelection: saveSelection,
    restoreSelection: restoreSelection,
    bindToolbar: bindToolbar,
    updateToolbarStates: updateToolbarStates,
    getShortcuts: getShortcuts,
    clearContent: clearContent,
    insertTimestamp: insertTimestamp,
    exportHTML: exportHTML,
    focus: focus,
    blur: blur,
    onContentChange: function (fn) { _onContentChange = fn; },
    onTitleChange: function (fn) { _onTitleChange = fn; },
    onCursorChange: function (fn) { _onCursorChange = fn; },
    getHistoryLength: function () { return _history.length; },
    getHistoryIndex: function () { return _historyIndex; },
    getState: function () {
      return {
        html: _editor ? _editor.innerHTML : '',
        text: _editor ? _editor.innerText : '',
        historyLen: _history.length,
        historyIdx: _historyIndex,
        canUndo: canUndo(),
        canRedo: canRedo()
      };
    }
  };

})();
