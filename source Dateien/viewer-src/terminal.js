/* InstaBox Pilot — terminal viewer (xterm.js over the bridge). */
(function () {
  'use strict';

  var state = { fontSize: 12, ctrl: false, alt: false, keyboard: false, mode: 'demo', cols: 80, rows: 24 };

  function host(type, payload) {
    var msg = { type: type };
    if (payload !== undefined) msg.payload = payload;
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      else if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
    } catch (e) {}
  }

  var $ = function (id) { return document.getElementById(id); };
  var termEl = $('term'), kb = $('kb'), keysBar = $('keys'), statusBox = $('status'),
      statusText = $('statusText'), statusSpin = $('spin'), reconnectBtn = $('reconnect');

  var term = null, fit = null;

  function setStatus(isError, message) {
    if (!message) { statusBox.className = ''; return; }
    statusBox.className = 'on';
    statusSpin.style.display = isError ? 'none' : 'block';
    statusText.className = isError ? 'err' : '';
    statusText.textContent = message;
    reconnectBtn.style.display = isError ? 'block' : 'none';
  }

  function buildTerm() {
    if (term) return;
    term = new window.XT.Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: state.fontSize,
      cursorBlink: true,
      scrollback: 2000,
      theme: { background: '#0b0b0e', foreground: '#e6e6ea', cursor: '#05df72', selectionBackground: 'rgba(5,223,114,.28)' },
      allowProposedApi: true
    });
    fit = new window.XT.FitAddon();
    term.loadAddon(fit);
    term.open(termEl);
    term.onData(function (d) { host('data', { data: d }); });
    term.onResize(function (size) {
      state.cols = size.cols; state.rows = size.rows;
      host('resize', { cols: size.cols, rows: size.rows });
    });
    setTimeout(function () { try { fit.fit(); } catch (e) {} }, 60);
  }

  function onHostMessage(raw) {
    var msg = raw;
    if (typeof raw === 'string') { try { msg = JSON.parse(raw); } catch (e) { return; } }
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'init':
        state.mode = msg.mode || 'demo';
        buildTerm();
        if (state.mode === 'demo') {
          setStatus(false, null);
          term.write('\x1b[32mInstaBox Pilot — Demo-Terminal\x1b[0m\r\n');
          term.write('Dies ist eine Vorschau. Für eine echte Shell wird der InstaBox-Terminalkanal geöffnet.\r\n\r\n');
          term.write('\x1b[1;32mdev@instabox\x1b[0m:\x1b[1;34m~\x1b[0m$ ');
          var buf = '';
          term.onData(function (d) {
            if (d === '\r') { term.write('\r\n\x1b[1;32mdev@instabox\x1b[0m:\x1b[1;34m~\x1b[0m$ '); return; }
            if (d === '\x7f') { buf = buf.slice(0, -1); term.write('\b \b'); return; }
            buf += d;
            term.write(d);
          });
        } else {
          setStatus(false, 'Verbinde mit der Shell…');
        }
        break;
      case 'text':
        if (term) term.write(msg.payload || '');
        break;
      case 'binary':
        if (term) term.write(msg.payload || '');
        break;
      case 'close':
        setStatus(true, 'Shell getrennt.');
        break;
      case 'error':
        setStatus(true, msg.message || 'Fehler');
        break;
      case 'reconnect':
        setStatus(false, 'Verbinde mit der Shell…');
        host('reconnect', {});
        break;
    }
  }

  window.addEventListener('message', function (e) { onHostMessage(e.data); });
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.addEventListener('message', function (e) { onHostMessage(e.data); });
  }

  /* ---------------- keys ---------------- */

  var KEY_DEFS = [
    { l: 'Esc', a: function () { sendKey('\x1b'); } },
    { l: 'Tab', a: function () { sendKey('\t'); } },
    { l: 'Strg', mod: 'ctrl' },
    { l: 'Alt', mod: 'alt' },
    { l: '⌫', a: function () { sendKey('\x7f'); } },
    { l: '↵', a: function () { sendKey('\r'); } },
    { l: '←', a: function () { sendKey('\x1b[D'); } },
    { l: '↑', a: function () { sendKey('\x1b[A'); } },
    { l: '→', a: function () { sendKey('\x1b[C'); } },
    { l: '↓', a: function () { sendKey('\x1b[B'); } },
    { l: '|', a: function () { sendKey('|'); } },
    { l: '/', a: function () { sendKey('/'); } }
  ];

  function sendKey(data) {
    var prefix = '';
    if (state.ctrl) prefix += '\x03';
    host('data', { data: prefix + data });
  }

  function buildKeys() {
    keysBar.innerHTML = '';
    KEY_DEFS.forEach(function (def) {
      var b = document.createElement('button');
      b.className = 'key' + (def.mod ? ' mod' : '');
      b.textContent = def.l;
      b.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) {
        e.preventDefault();
        if (def.mod) { state[def.mod] = !state[def.mod]; b.classList.toggle('on', state[def.mod]); return; }
        if (def.a) def.a();
      });
      keysBar.appendChild(b);
    });
  }

  function openKeyboard() {
    state.keyboard = true;
    keysBar.classList.add('on');
    try { kb.focus({ preventScroll: true }); } catch (e) { try { kb.focus(); } catch (e2) {} }
    setTimeout(function () { try { fit.fit(); } catch (e) {} }, 250);
  }
  function closeKeyboard() {
    state.keyboard = false;
    keysBar.classList.remove('on');
    try { kb.blur(); } catch (e) {}
  }

  kb.addEventListener('keydown', function (e) {
    e.preventDefault();
    var data = e.key;
    if (e.key === 'Enter') data = '\r';
    else if (e.key === 'Backspace') data = '\x7f';
    else if (e.key === 'Tab') data = '\t';
    else if (e.key === 'Escape') data = '\x1b';
    else if (e.key.indexOf('Arrow') === 0) {
      data = { ArrowLeft: '\x1b[D', ArrowUp: '\x1b[A', ArrowRight: '\x1b[C', ArrowDown: '\x1b[B' }[e.key];
    } else if (e.key.length === 1) {
      data = e.key;
    }
    sendKey(data);
  });

  function on(id, fn) {
    var el = $(id);
    el.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    el.addEventListener('mousedown', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) { e.preventDefault(); fn(e); });
  }
  on('tKeyboard', function () { if (state.keyboard) closeKeyboard(); else openKeyboard(); });
  on('tFontUp', function () { state.fontSize = Math.min(22, state.fontSize + 1); if (term) { term.options.fontSize = state.fontSize; try { fit.fit(); } catch (e) {} } });
  on('tFontDown', function () { state.fontSize = Math.max(8, state.fontSize - 1); if (term) { term.options.fontSize = state.fontSize; try { fit.fit(); } catch (e) {} } });
  on('tCtrl', function () { state.ctrl = !state.ctrl; $('tCtrl').classList.toggle('active', state.ctrl); });
  on('tReconnect', function () { host('reconnect', {}); });
  reconnectBtn.addEventListener('click', function () { host('reconnect', {}); });

  function relayout() {
    var vv = window.visualViewport;
    var h = vv ? vv.height : window.innerHeight;
    var top = vv ? vv.offsetTop : 0;
    var root = document.getElementById('root');
    root.style.height = h + 'px';
    root.style.top = top + 'px';
    setTimeout(function () { try { fit.fit(); } catch (e) {} }, 40);
  }
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(relayout, 250); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);

  window.__ibpHost = onHostMessage;
  buildKeys();
  relayout();
  host('pageReady', {});
})();
