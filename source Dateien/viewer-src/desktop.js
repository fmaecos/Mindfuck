/* InstaBox Pilot — desktop viewer.
   Runs inside a WebView (native) or an iframe (web). The host app owns the
   WebSocket; this page speaks noVNC over a small bridge. */
(function () {
  'use strict';

  var MIN_SCALE = 0.05;
  var MAX_SCALE = 6;

  var state = {
    mode: 'demo',
    scaleMode: 'fit',
    scale: 1,
    zoom: 1,
    panMode: false,
    viewOnly: true,
    ctrl: false,
    alt: false,
    meta: false,
    keyboard: false,
    remoteSize: { w: 1280, h: 800 },
    demoText: '',
    demoPointer: null
  };

  function host(type, payload) {
    var msg = { type: type };
    if (payload !== undefined) msg.payload = payload;
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
      }
    } catch (e) { if (window.console) console.log('HOSTERR ' + (e && e.message ? e.message : e)); }
  }

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), remote = $('remote'), pan = $('pan'), statusBox = $('status'),
      statusText = $('statusText'), statusSpin = $('spin'), reconnectBtn = $('reconnect'),
      hudRes = $('hudRes'), hudScale = $('hudScale'), menu = $('menu'), bar = $('bar'),
      keysBar = $('keys'), kb = $('kb'), demoScroll = $('demoScroll'),
      demoCanvas = $('demoCanvas'), demoWrap = $('demoWrap');

  var rfb = null;
  var fake = null;
  var sockOpen = false;

  function isRemote() { return state.mode === 'remote'; }

  function fbSize() {
    if (isRemote() && rfb && rfb._display) {
      return { w: rfb._display.width, h: rfb._display.height };
    }
    return state.remoteSize;
  }

  function surface() {
    if (isRemote() && rfb) return { canvas: rfb._canvas, scroll: rfb._screen };
    return { canvas: demoCanvas, scroll: demoScroll };
  }

  function setScaleRaw(s) {
    if (isRemote() && rfb && rfb._display) {
      rfb._display.scale = s;
    } else {
      var d = state.remoteSize;
      demoCanvas.style.width = Math.round(d.w * s) + 'px';
      demoCanvas.style.height = Math.round(d.h * s) + 'px';
      demoWrap.style.width = Math.round(d.w * s) + 'px';
      demoWrap.style.height = Math.round(d.h * s) + 'px';
    }
    state.scale = s;
  }

  function layout() {
    var sc = surface();
    var st = stage.getBoundingClientRect();
    var size = fbSize();
    if (sc.scroll) {
      var sw = size.w * state.scale, sh = size.h * state.scale;
      sc.scroll.style.justifyContent = sw <= st.width ? 'center' : 'flex-start';
      sc.scroll.style.alignItems = sh <= st.height ? 'center' : 'flex-start';
    }
    hudRes.textContent = size.w + ' × ' + size.h;
    hudScale.textContent = Math.round(state.scale * 100) + ' %';
  }

  function targetScale() {
    var st = stage.getBoundingClientRect();
    var size = fbSize();
    if (!size.w || !size.h || !st.width || !st.height) return state.scale;
    var kx = st.width / size.w, ky = st.height / size.h;
    switch (state.scaleMode) {
      case 'width': return kx;
      case 'height': return ky;
      case 'native': return 1;
      case 'custom': return state.zoom;
      default: return Math.min(kx, ky);
    }
  }

  function applyScale(s, fx, fy, base) {
    s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    var sc = surface();
    var b = base || { scale: state.scale || 1, sl: sc.scroll ? sc.scroll.scrollLeft : 0, st: sc.scroll ? sc.scroll.scrollTop : 0 };
    if (sc.scroll && fx !== undefined && fx !== null && b.scale > 0) {
      var px = b.sl + fx, py = b.st + fy;
      var k = s / b.scale;
      setScaleRaw(s);
      sc.scroll.scrollLeft = px * k - fx;
      sc.scroll.scrollTop = py * k - fy;
    } else {
      setScaleRaw(s);
    }
    layout();
  }

  function setScaleMode(mode, remoteResize) {
    if (mode === 'custom' && state.scaleMode !== 'custom') {
      state.zoom = state.scale || 1;
    }
    state.scaleMode = mode;
    applyScale(targetScale());
    renderMenu();
    if (remoteResize && mode === 'remote') requestRemoteResize();
    host('scale', { mode: mode, scale: state.scale });
  }

  function requestRemoteResize() {
    if (!isRemote() || !rfb || !rfb._sock) return;
    var st = stage.getBoundingClientRect();
    if (!st.width || !st.height) return;
    var ar = st.width / st.height;
    var w = 1280, h = Math.round(1280 / ar);
    if (h < 600) { h = 600; w = Math.round(600 * ar); }
    if (h > 1600) { h = 1600; w = Math.round(1600 * ar); }
    if (w < 800) { w = 800; h = Math.round(800 / ar); }
    if (w > 2560) { w = 2560; h = Math.round(2560 / ar); }
    w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2;
    try {
      if (window.NoVNC && window.NoVNC.RFB && window.NoVNC.RFB.messages) {
        window.NoVNC.RFB.messages.setDesktopSize(rfb._sock, w, h, rfb._screenID || 0, rfb._screenFlags || 0);
        setStatus(false, 'Remote-Auflösung: ' + w + ' × ' + h);
      }
    } catch (e) {
      setStatus(true, 'Der Server lässt keine Größenänderung zu.');
    }
  }

  function setStatus(isError, message) {
    if (!message) { statusBox.className = ''; return; }
    statusBox.className = 'on';
    statusSpin.style.display = isError ? 'none' : 'block';
    statusText.className = isError ? 'err' : '';
    statusText.textContent = message;
    reconnectBtn.style.display = isError ? 'block' : 'none';
  }

  /* ---------------- noVNC plumbing ---------------- */

  function buildFakeSocket() {
    var f = {
      readyState: 0,
      binaryType: 'arraybuffer',
      protocol: '',
      onopen: null, onclose: null, onerror: null, onmessage: null,
      send: function (data) {
        if (!sockOpen) return;
        var bytes;
        if (typeof data === 'string') {
          bytes = [];
          for (var i = 0; i < data.length; i++) bytes.push(data.charCodeAt(i) & 0xff);
          data = new Uint8Array(bytes).buffer;
        } else if (data && data.buffer) {
          data = data.buffer.slice(data.byteOffset || 0, (data.byteOffset || 0) + (data.byteLength || 0));
        }
        host('sock', { kind: 'send', b64: b64encode(data) });
      },
      close: function () {
        f.readyState = 3;
        sockOpen = false;
        host('sock', { kind: 'close' });
      }
    };
    return f;
  }

  function startRfb() {
    if (fake) { try { fake.close(); } catch (e) {} }
    fake = buildFakeSocket();
    sockOpen = false;
    setStatus(false, 'Verbinde mit dem Desktop…');
    try {
      rfb = new window.NoVNC.RFB(remote, fake, {
        credentials: { password: '' },
        repeaterID: ''
      });
    } catch (e) {
      setStatus(true, 'noVNC konnte nicht starten: ' + (e && e.message ? e.message : e));
      return;
    }
    rfb.scaleViewport = false;
    rfb.clipViewport = false;
    rfb.resizeSession = false;
    rfb.showDotCursor = true;
    rfb._updateScale = function () {
      try { this._display.scale = state.scale; } catch (e) {}
    };
    rfb.addEventListener('connect', function () {
      setStatus(false, null);
      try {
        rfb._screen.style.justifyContent = 'center';
        rfb._screen.style.alignItems = 'center';
        rfb._screen.style.overflow = 'auto';
        rfb._screen.style.webkitOverflowScrolling = 'touch';
        rfb._screen.style.scrollbarWidth = 'none';
        rfb._screen.style.display = 'flex';
      } catch (e) {}
      setScaleMode(state.scaleMode === 'remote' ? 'fit' : state.scaleMode);
      host('ready', { w: rfb._display.width, h: rfb._display.height });
    });
    rfb.addEventListener('disconnect', function (e) {
      sockOpen = false;
      setStatus(true, 'Verbindung getrennt' + (e && e.detail && e.detail.clean ? '.' : ' (unerwartet).'));
    });
    rfb.addEventListener('securityfailure', function (e) {
      setStatus(true, 'Sicherheitsfehler: ' + JSON.stringify(e.detail || {}));
    });
    rfb.addEventListener('credentialsrequired', function () {
      setStatus(true, 'Der Desktop verlangt ein Passwort.');
    });
    rfb.addEventListener('clipboard', function (e) {
      host('clipboard', e.detail && e.detail.text ? e.detail.text : '');
    });
  }

  /* ---------------- bridge ---------------- */

  function onHostMessage(raw) {
    var msg = raw;
    if (typeof raw === 'string') { try { msg = JSON.parse(raw); } catch (e) { return; } }
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'init':
        state.mode = msg.mode || 'demo';
        state.viewOnly = msg.viewOnly !== false;
        state.scaleMode = msg.scaleMode || 'fit';
        remote.style.display = state.mode === 'remote' ? 'block' : 'none';
        demoScroll.style.display = state.mode === 'demo' ? 'flex' : 'none';
        updateControl();
        renderMenu();
        if (state.mode === 'remote') startRfb(); else { drawDemo(); applyScale(targetScale()); }
        break;
      case 'sock': {
        var p = msg.payload || {};
        if (p.kind === 'open') {
          sockOpen = true;
          if (fake) { fake.readyState = 1; if (fake.onopen) fake.onopen(); }
        } else if (p.kind === 'send') {
          if (fake && fake.onmessage) {
            var buf = b64decode(p.b64);
            fake.onmessage({ data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
          }
        } else if (p.kind === 'close') {
          sockOpen = false;
          if (fake) { fake.readyState = 3; if (fake.onclose) fake.onclose({ code: p.code || 1000, reason: p.reason || '' }); }
        } else if (p.kind === 'error') {
          setStatus(true, p.message || 'Verbindungsfehler.');
        }
        break;
      }
      case 'close':
        sockOpen = false;
        if (fake) { fake.readyState = 3; if (fake.onclose) fake.onclose({ code: msg.code || 1000, reason: msg.reason || '' }); }
        break;
      case 'scale':
        if (msg.mode) { state.scaleMode = msg.mode; applyScale(targetScale()); }
        break;
      case 'control':
        state.viewOnly = !!msg.viewOnly;
        updateControl();
        break;
      case 'error':
        setStatus(true, msg.message || 'Fehler');
        break;
      case 'reconnect':
        if (state.mode === 'remote') startRfb();
        break;
    }
  }

  window.addEventListener('message', function (e) { onHostMessage(e.data); });
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.addEventListener('message', function (e) { onHostMessage(e.data); });
  }

  /* ---------------- base64 ---------------- */

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64encode(buffer) {
    var bytes = new Uint8Array(buffer), out = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      var a = bytes[i] << 16;
      out += B64[(a >> 18) & 63] + B64[(a >> 12) & 63] + '==';
    } else if (rest === 2) {
      var b = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(b >> 18) & 63] + B64[(b >> 12) & 63] + B64[(b >> 6) & 63] + '=';
    }
    return out;
  }
  function b64decode(str) {
    var clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
    var len = clean.length, bytes = new Uint8Array(Math.floor(len * 3 / 4)), p = 0, i;
    for (i = 0; i < len; i += 4) {
      var n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
              ((clean[i + 2] ? B64.indexOf(clean[i + 2]) : 0) << 6) |
              (clean[i + 3] ? B64.indexOf(clean[i + 3]) : 0);
      if (p < bytes.length) bytes[p++] = (n >> 16) & 255;
      if (p < bytes.length) bytes[p++] = (n >> 8) & 255;
      if (p < bytes.length) bytes[p++] = n & 255;
    }
    return bytes;
  }

  /* ---------------- keyboard ---------------- */

  var CODES = {
    Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Delete: 127,
    ArrowLeft: 314, ArrowUp: 315, ArrowRight: 316, ArrowDown: 317,
    Home: 313, End: 312, PageUp: 316, PageDown: 317,
    ControlLeft: 306, ControlRight: 306, AltLeft: 313, AltRight: 313,
    MetaLeft: 313, MetaRight: 313, ShiftLeft: 306, ShiftRight: 306
  };

  function sendKey(code, key, shift) {
    if (isRemote() && rfb) {
      var sym = CODES[code];
      if (sym === undefined && key && key.length === 1) {
        var cp = key.charCodeAt(0);
        sym = cp < 256 ? cp : 0x01000000 + cp;
      }
      if (sym === undefined) return;
      if (state.ctrl || state.alt || state.meta) {
        if (state.ctrl) rfb.sendKey(0xFFE3, 'ControlLeft', true);
        if (state.alt) rfb.sendKey(0xFFE9, 'AltLeft', true);
        if (state.meta) rfb.sendKey(0xFFE7, 'MetaLeft', true);
        rfb.sendKey(sym, code, shift);
        if (state.meta) rfb.sendKey(0xFFE7, 'MetaLeft', false);
        if (state.alt) rfb.sendKey(0xFFE9, 'AltLeft', false);
        if (state.ctrl) rfb.sendKey(0xFFE3, 'ControlLeft', false);
      } else {
        rfb.sendKey(sym, code, shift);
      }
    } else {
      var printable = (key && key.length === 1) ? key : '';
      if (printable) { state.demoText += printable; drawDemo(); }
      else if (code === 'Enter') { state.demoText += '\n'; drawDemo(); }
      else if (code === 'Backspace') { state.demoText = state.demoText.slice(0, -1); drawDemo(); }
    }
  }

  function sendText(str) {
    if (isRemote() && rfb) {
      for (var i = 0; i < str.length; i++) {
        var ch = str[i], cp = ch.charCodeAt(0);
        var sym = cp < 256 ? cp : 0x01000000 + cp;
        if (state.ctrl || state.alt || state.meta) {
          if (state.ctrl) rfb.sendKey(0xFFE3, 'ControlLeft', true);
          if (state.alt) rfb.sendKey(0xFFE9, 'AltLeft', true);
          rfb.sendKey(sym, undefined, false);
          if (state.alt) rfb.sendKey(0xFFE9, 'AltLeft', false);
          if (state.ctrl) rfb.sendKey(0xFFE3, 'ControlLeft', false);
        } else {
          rfb.sendKey(sym, undefined, false);
        }
      }
    } else {
      state.demoText += str;
      drawDemo();
    }
  }

  kb.addEventListener('keydown', function (e) {
    if (e.key === 'Backspace' && e.keyCode === 229) return;
    if (e.key === 'Enter' || e.key === 'Tab' || e.key.indexOf('Arrow') === 0 ||
        e.key === 'Escape' || e.key === 'Delete' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      sendKey(e.key === 'Escape' ? 'Escape' : e.key, e.key, e.shiftKey);
      return;
    }
    if (e.key.length === 1) {
      e.preventDefault();
      sendKey('', e.key, e.shiftKey);
    }
  });

  kb.addEventListener('input', function () {
    var v = kb.value || '';
    var diff = v.length > 0 ? v.charAt(v.length - 1) : '';
    if (v.length === 0) sendKey('Backspace', '', false);
    else if (diff) sendText(diff);
    kb.value = '';
  });

  /* ---------------- extra keys bar ---------------- */

  var KEY_DEFS = [
    { l: 'Esc', a: function () { sendKey('Escape', 'Escape', false); } },
    { l: 'Tab', a: function () { sendKey('Tab', 'Tab', false); } },
    { l: 'Strg', mod: 'ctrl' },
    { l: 'Alt', mod: 'alt' },
    { l: '⌫', a: function () { sendKey('Backspace', 'Backspace', false); } },
    { l: '↵', a: function () { sendKey('Enter', 'Enter', false); } },
    { l: '←', a: function () { sendKey('ArrowLeft', 'ArrowLeft', false); } },
    { l: '↑', a: function () { sendKey('ArrowUp', 'ArrowUp', false); } },
    { l: '→', a: function () { sendKey('ArrowRight', 'ArrowRight', false); } },
    { l: '↓', a: function () { sendKey('ArrowDown', 'ArrowDown', false); } },
    { l: 'Strg+Alt+⌫', a: function () { if (isRemote() && rfb) rfb.sendCtrlAltDel(); } }
  ];

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
        if (def.mod) {
          state[def.mod] = !state[def.mod];
          b.classList.toggle('on', state[def.mod]);
          return;
        }
        if (def.a) def.a();
      });
      keysBar.appendChild(b);
    });
  }

  function openKeyboard() {
    state.keyboard = true;
    keysBar.classList.add('on');
    try { kb.focus({ preventScroll: true }); } catch (e) { try { kb.focus(); } catch (e2) {} }
  }

  function closeKeyboard() {
    state.keyboard = false;
    keysBar.classList.remove('on');
    try { kb.blur(); } catch (e) {}
  }

  /* ---------------- gestures ---------------- */

  var pts = {};
  var panBase = null, pinchBase = null;

  function dist(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); }

  pan.addEventListener('pointerdown', function (e) {
    try { pan.setPointerCapture(e.pointerId); } catch (err) {}
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var sc = surface();
    var list = Object.keys(pts).map(function (k) { return pts[k]; });
    if (list.length === 1) {
      panBase = { sl: sc.scroll.scrollLeft, st: sc.scroll.scrollTop, x: e.clientX, y: e.clientY };
    } else if (list.length === 2) {
      pinchBase = {
        d: Math.max(1, dist(list[0], list[1])),
        scale: state.scale,
        sl: sc.scroll.scrollLeft,
        st: sc.scroll.scrollTop,
        cx: (list[0].x + list[1].x) / 2,
        cy: (list[0].y + list[1].y) / 2
      };
    }
  });

  pan.addEventListener('pointermove', function (e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var sc = surface();
    var list = Object.keys(pts).map(function (k) { return pts[k]; });
    if (list.length === 1 && panBase) {
      sc.scroll.scrollLeft = panBase.sl - (e.clientX - panBase.x);
      sc.scroll.scrollTop = panBase.st - (e.clientY - panBase.y);
    } else if (list.length === 2 && pinchBase) {
      var d = Math.max(1, dist(list[0], list[1]));
      var ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchBase.scale * (d / pinchBase.d)));
      applyScale(ns, pinchBase.cx, pinchBase.cy, pinchBase);
    }
  });

  function endPointer(e) {
    delete pts[e.pointerId];
    if (Object.keys(pts).length < 2) pinchBase = null;
    if (Object.keys(pts).length === 0) panBase = null;
  }
  pan.addEventListener('pointerup', endPointer);
  pan.addEventListener('pointercancel', endPointer);
  pan.addEventListener('pointerleave', endPointer);

  pan.addEventListener('dblclick', function () {
    setScaleMode(state.scaleMode === 'native' ? 'fit' : 'native');
  });

  /* ---------------- demo surface ---------------- */

  function drawDemo() {
    if (state.mode !== 'demo') return;
    var ctx = demoCanvas.getContext('2d');
    var w = state.remoteSize.w, h = state.remoteSize.h;
    ctx.fillStyle = '#11131a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke(); }
    for (var y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); ctx.stroke(); }
    ctx.fillStyle = '#1b1e28';
    ctx.fillRect(0, 0, w, 46);
    ctx.fillStyle = '#9aa0b5';
    ctx.font = '16px sans-serif';
    ctx.fillText('InstaBox · Demo-Desktop (Xfce, agent-browser)', 18, 29);
    ctx.fillStyle = '#05df72';
    ctx.beginPath(); ctx.arc(w - 28, 23, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e7e9f2';
    ctx.font = '20px monospace';
    var lines = state.demoText.split('\n');
    for (var i = 0; i < Math.min(lines.length, 30); i++) {
      ctx.fillText(lines[i].slice(0, 110), 22, 90 + i * 26);
    }
    if (state.demoPointer) {
      ctx.strokeStyle = '#ff5f8f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.demoPointer.x, state.demoPointer.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,95,143,.85)';
      ctx.fillRect(state.demoPointer.x - 1, state.demoPointer.y - 24, 52, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '13px monospace';
      ctx.fillText(state.demoPointer.x + ',' + state.demoPointer.y, state.demoPointer.x + 3, state.demoPointer.y - 10);
    }
  }

  demoCanvas.addEventListener('pointerdown', function (e) {
    var rect = demoCanvas.getBoundingClientRect();
    state.demoPointer = {
      x: Math.round((e.clientX - rect.left) / (rect.width / state.remoteSize.w)),
      y: Math.round((e.clientY - rect.top) / (rect.height / state.remoteSize.h))
    };
    drawDemo();
  });

  /* ---------------- menu + toolbar ---------------- */

  var MODES = [
    { id: 'fit', l: 'Einpassen', s: 'Ganze Oberfläche' },
    { id: 'width', l: 'Breite', s: 'Volle Breite' },
    { id: 'height', l: 'Höhe', s: 'Volle Höhe' },
    { id: 'native', l: '100 %', s: 'Originalgröße' },
    { id: 'custom', l: 'Zoom', s: 'Fingerzoom' },
    { id: 'remote', l: 'Remote-Größe', s: 'Auflösung anpassen' }
  ];

  function renderMenu() {
    if (!menu.classList.contains('on')) return;
    buildMenu();
  }

  function buildMenu() {
    menu.innerHTML = '';
    MODES.forEach(function (m) {
      var item = document.createElement('div');
      item.className = 'mitem' + (state.scaleMode === m.id ? ' sel' : '');
      var l = document.createElement('div');
      l.textContent = m.l;
      var s = document.createElement('span');
      s.className = 'sub';
      s.textContent = m.s;
      item.appendChild(l);
      item.appendChild(s);
      item.addEventListener('click', function () {
        setScaleMode(m.id, true);
        menu.classList.remove('on');
      });
      menu.appendChild(item);
    });
  }

  function updateControl() {
    var lbl = $('tControlLbl');
    lbl.textContent = state.viewOnly ? 'Steuern' : 'Zurückgeben';
    $('tControl').classList.toggle('active', !state.viewOnly);
    $('tPan').classList.toggle('active', state.panMode);
    pan.classList.toggle('on', state.panMode || state.viewOnly);
    $('tScaleLbl').textContent = (MODES.filter(function (m) { return m.id === state.scaleMode; })[0] || MODES[0]).l;
  }

  function on(id, fn) {
    var el = $(id);
    el.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    el.addEventListener('mousedown', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) { e.preventDefault(); fn(e); });
  }

  on('tControl', function () {
    var next = state.viewOnly ? 'takeover' : 'handback';
    host('control', { action: next });
  });
  on('tPan', function () {
    state.panMode = !state.panMode;
    updateControl();
  });
  on('tScale', function () {
    if (menu.classList.contains('on')) { menu.classList.remove('on'); return; }
    buildMenu();
    menu.classList.add('on');
  });
  on('tZoomIn', function () {
    if (state.scaleMode !== 'custom') state.zoom = state.scale;
    state.scaleMode = 'custom';
    state.zoom = Math.min(MAX_SCALE, state.zoom * 1.25);
    applyScale(state.zoom);
    updateControl();
  });
  on('tZoomOut', function () {
    if (state.scaleMode !== 'custom') state.zoom = state.scale;
    state.scaleMode = 'custom';
    state.zoom = Math.max(MIN_SCALE, state.zoom / 1.25);
    applyScale(state.zoom);
    updateControl();
  });
  on('tKeyboard', function () {
    if (state.keyboard) closeKeyboard(); else openKeyboard();
  });
  on('tMore', function () {
    if (isRemote() && rfb) {
      try { rfb.sendCtrlAltDel(); } catch (e) {}
    }
    host('reconnect', {});
  });
  reconnectBtn.addEventListener('click', function () { host('reconnect', {}); });

  /* ---------------- layout ---------------- */

  function relayout() {
    var vv = window.visualViewport;
    var h = vv ? vv.height : window.innerHeight;
    var top = vv ? vv.offsetTop : 0;
    var root = document.getElementById('root');
    root.style.height = h + 'px';
    root.style.top = top + 'px';
    applyScale(targetScale());
  }

  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(relayout, 250); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);

  window.__ibpHost = onHostMessage;
  window.__ibp = {
    state: state,
    get rfb() { return rfb; },
    get fake() { return fake; }
  };

  buildKeys();
  updateControl();
  relayout();
  drawDemo();
  host('pageReady', {});
})();
