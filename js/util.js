/*
 * 綴り — UI ユーティリティ（DOM 生成・アイコン・モーダル・トーストなど）
 */
(function (NS) {
  'use strict';

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach((sk) => { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; });
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'readOnly' || k === 'multiple') el[k] = !!v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    children.forEach((c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) append(el, c);
      else if (c instanceof Node) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    });
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  const ICONS = {
    pen: 'M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z|M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
    bulb: 'M9 18h6|M10 22h4|M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z',
    columns: 'M3 3h18v18H3z|M9 3v18|M15 3v18',
    map: 'M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z|M9 3v15|M15 6v15',
    sliders: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6',
    home: 'M3 10.5 12 3l9 7.5|M5 9v12h14V9',
    plus: 'M12 5v14|M5 12h14',
    minus: 'M5 12h14',
    trash: 'M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M21 21l-4.3-4.3',
    download: 'M12 3v12|M7 10l5 5 5-5|M5 21h14',
    upload: 'M12 21V9|M7 14l5-5 5 5|M5 3h14',
    check: 'M20 6 9 17l-5-5',
    x: 'M18 6 6 18|M6 6l12 12',
    left: 'M15 18l-6-6 6-6',
    right: 'M9 18l6-6-6-6',
    up: 'M12 19V5|M5 12l7-7 7 7',
    down: 'M12 5v14|M19 12l-7 7-7-7',
    undo: 'M9 14 4 9l5-5|M4 9h11a5 5 0 0 1 0 10h-3',
    redo: 'M15 14l5-5-5-5|M20 9H9a5 5 0 0 0 0 10h3',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z|M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    pin: 'M12 17v5|M9 3h6l-1 6 3 3v2H7v-2l3-3z',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8|M3 3v5h5|M12 7v5l3 2',
    menu: 'M4 6h16|M4 12h16|M4 18h16',
    more: 'M5 12h.01|M12 12h.01|M19 12h.01',
    vertical: 'M17 4v16|M12 4v16|M7 4v10',
    grip: 'M9 5h.01|M9 12h.01|M9 19h.01|M15 5h.01|M15 12h.01|M15 19h.01',
    hand: 'M18 11V6a2 2 0 0 0-4 0v5|M14 10V4a2 2 0 0 0-4 0v6|M10 10.5V6a2 2 0 0 0-4 0v8|M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
    cursor: 'M4 4l7 17 2.5-7.5L21 11z',
    mountain: 'M3 20 9.5 8l4 7 2.5-4L21 20z',
    brush: 'M18.4 2.6a2 2 0 0 1 3 3L12 15l-3-3z|M9 12c-2 0-4 1.5-4 4 0 1.5-1 2.5-2 3 1 1 3 1.5 5 1.5 3 0 4-2 4-4.5',
    tree: 'M12 22v-6|M12 3 6 12h3l-4 5h14l-4-5h3z',
    wave: 'M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0|M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
    route: 'M5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M19 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M6.5 17.5C9 12 12 13 13 10s3-4 4.5-4.5',
    polygon: 'M12 3l9 6-3.5 11h-11L3 9z',
    marker: 'M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z|M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    text: 'M5 7V4h14v3|M12 4v16|M9 20h6',
    dice: 'M4 4h16v16H4z|M8.5 8.5h.01|M15.5 15.5h.01|M15.5 8.5h.01|M8.5 15.5h.01|M12 12h.01',
    image: 'M3 5h18v14H3z|M3 16l5-5 4 4 3-3 6 6|M15 9h.01',
    layers: 'M12 3 2 8l10 5 10-5z|M2 13l10 5 10-5',
    copy: 'M8 8h12v12H8z|M4 16V4h12',
    link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    alert: 'M12 3 2 21h20z|M12 10v5|M12 18h.01',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 11v6|M12 7.5h.01',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    tag: 'M3 12V3h9l9 9-9 9z|M7.5 7.5h.01',
    save: 'M5 3h11l3 3v15H5z|M8 3v5h7|M8 21v-7h8v7',
    file: 'M14 3H6v18h12V7z|M14 3v4h4|M9 13h6|M9 17h6',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 7v5l3 2',
    sidebar: 'M3 4h18v16H3z|M9 4v16',
    panel: 'M3 4h18v16H3z|M15 4v16',
    compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M16 8l-2 6-6 2 2-6z',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z|M9 12l2 2 4-4',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M3 12h18|M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
    flag: 'M5 21V4|M5 4h11l-2 4 2 4H5',
    box: 'M3 7l9-4 9 4v10l-9 4-9-4z|M3 7l9 4 9-4|M12 11v10',
    building: 'M4 21V5l8-3v19|M12 8h8v13|M7 8h2|M7 12h2|M7 16h2|M15 12h2|M15 16h2',
    list: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01',
    feather: 'M20 4C10 4 5 10 5 19|M5 19l4-4|M20 4c0 8-5 12-11 12',
    eraser: 'M20 20H9l-6-6 10-10 8 8-7 8|M11 6l8 8',
    lock: 'M6 11h12v10H6z|M8 11V7a4 4 0 0 1 8 0v4',
    unlock: 'M6 11h12v10H6z|M8 11V7a4 4 0 0 1 7.6-1.8',
    eyeoff: 'M3 3l18 18|M10.6 10.6a2 2 0 0 0 2.8 2.8|M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2|M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
    flip: 'M12 3v18|M8 7l-5 5 5 5|M16 7l5 5-5 5',
    rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8|M21 3v5h-5',
    book2: 'M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z|M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z',
    network: 'M12 5a2 2 0 1 0 0 .01|M5 18a2 2 0 1 0 0 .01|M19 18a2 2 0 1 0 0 .01|M12 7v4|M12 11l-6 5|M12 11l6 5',
    play: 'M6 4l14 8-14 8z',
    printer: 'M6 9V3h12v6|M6 18H4v-7h16v7h-2|M6 14h12v7H6z',
    dict: 'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z|M4 17a3 3 0 0 1 3-3h11|M9 8h5',
  };

  function icon(name, size) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', name === 'more' || name === 'grip' ? '3' : '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('icon');
    (ICONS[name] || ICONS.info).split('|').forEach((d) => {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function btn(label, opts) {
    opts = opts || {};
    const b = h('button', {
      type: 'button',
      class: 'btn' + (opts.primary ? ' btn-primary' : '') + (opts.danger ? ' btn-danger' : '') + (opts.ghost ? ' btn-ghost' : '') +
        (opts.small ? ' btn-sm' : '') + (!label ? ' btn-icon' : '') + (opts.class ? ' ' + opts.class : ''),
      title: opts.title || null,
      // 表示される文字があるときは、それをそのまま読み上げ名にする
      'aria-label': label ? null : (opts.title || null),
      onclick: opts.onClick,
      disabled: opts.disabled,
    }, opts.icon ? icon(opts.icon, opts.iconSize) : null, label ? h('span', null, label) : null);
    return b;
  }

  let toastTimer = null;
  function toast(msg, kind) {
    let el = document.getElementById('toast');
    if (!el) {
      el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 2600);
  }

  /** モーダル。actions: [{label, primary, danger, onClick(close) -> false で閉じない}] */
  function modal(opts) {
    const prevFocus = document.activeElement;
    const overlay = h('div', { class: 'modal-overlay' });
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      if (opts.onClose) opts.onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    const footer = h('div', { class: 'modal-footer' });
    (opts.actions || []).forEach((a) => {
      footer.appendChild(btn(a.label, {
        primary: a.primary, danger: a.danger, ghost: a.ghost,
        onClick: async () => {
          const r = a.onClick ? await a.onClick(close) : undefined;
          if (r !== false) close();
        },
      }));
    });
    const box = h('div', { class: 'modal' + (opts.wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
      h('div', { class: 'modal-header' },
        h('h2', null, opts.title || ''),
        btn('', { icon: 'x', ghost: true, title: '閉じる', onClick: close })),
      h('div', { class: 'modal-body' }, opts.body),
      opts.actions && opts.actions.length ? footer : null);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    setTimeout(() => {
      const f = box.querySelector('[autofocus], input, textarea, select');
      if (f) f.focus();
    }, 30);
    return close;
  }

  function prompt(title, value, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      const input = opts.multiline
        ? h('textarea', { class: 'input', rows: 4, value: value || '', placeholder: opts.placeholder || '' })
        : h('input', { class: 'input', type: 'text', value: value || '', placeholder: opts.placeholder || '' });
      const body = h('div', { class: 'stack' }, opts.message ? h('p', { class: 'muted' }, opts.message) : null, input);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (!opts.multiline || e.ctrlKey || e.metaKey) && !e.isComposing) {
          e.preventDefault();
          done = true;
          resolve(input.value);
          closeFn();
        }
      });
      const closeFn = modal({
        title,
        body,
        onClose: () => { if (!done) resolve(null); },
        actions: [
          { label: 'キャンセル', ghost: true },
          { label: opts.okLabel || 'OK', primary: true, onClick: () => { done = true; resolve(input.value); } },
        ],
      });
      setTimeout(() => { input.focus(); if (input.select) input.select(); }, 40);
    });
  }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      modal({
        title: opts.title || '確認',
        body: h('p', null, message),
        onClose: () => { if (!done) resolve(false); },
        actions: [
          { label: 'キャンセル', ghost: true },
          { label: opts.okLabel || 'OK', primary: !opts.danger, danger: !!opts.danger, onClick: () => { done = true; resolve(true); } },
        ],
      });
    });
  }

  /** ポップアップメニュー。items: [{label, icon, onClick, danger}] or null(区切り) */
  function menu(anchor, items) {
    document.querySelectorAll('.popmenu').forEach((m) => m.remove());
    const m = h('div', { class: 'popmenu', role: 'menu' });
    items.forEach((it) => {
      if (!it) { m.appendChild(h('div', { class: 'popmenu-sep' })); return; }
      m.appendChild(h('button', {
        type: 'button', role: 'menuitem', class: 'popmenu-item' + (it.danger ? ' danger' : ''),
        onclick: () => { m.remove(); it.onClick && it.onClick(); },
      }, it.icon ? icon(it.icon, 16) : h('span', { class: 'icon-spacer' }), it.label));
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    let left = r.right - mw;
    if (left < 8) left = Math.min(r.left, window.innerWidth - mw - 8);
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    m.style.left = Math.max(8, left) + 'px';
    m.style.top = top + 'px';
    const off = (e) => {
      if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); }
    };
    setTimeout(() => document.addEventListener('mousedown', off, true), 0);
    const first = m.querySelector('button');
    if (first) first.focus();
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') m.remove(); });
    return m;
  }

  /** 任意の中身を持つポップオーバー */
  function popover(anchor, content, opts) {
    opts = opts || {};
    document.querySelectorAll('.popover').forEach((m) => m.remove());
    const m = h('div', { class: 'popover', role: 'dialog' }, content);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    let left = opts.alignLeft ? r.left : r.right - mw;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    const close = () => { m.remove(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', onKey, true); };
    const off = (e) => { if (!m.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    setTimeout(() => { document.addEventListener('mousedown', off, true); document.addEventListener('keydown', onKey, true); }, 0);
    return close;
  }

  function debounce(fn, ms) {
    let t = null;
    const d = function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
    d.flush = () => { clearTimeout(t); fn(); };
    d.cancel = () => clearTimeout(t);
    return d;
  }

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function download(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept: accept || '' });
      input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
      input.click();
    });
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  function fmtDate(ts, withTime) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    const s = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    return withTime ? `${s} ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
  }

  function relTime(ts) {
    if (!ts) return '';
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'たった今';
    if (diff < 3600) return Math.floor(diff / 60) + '分前';
    if (diff < 86400) return Math.floor(diff / 3600) + '時間前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + '日前';
    return fmtDate(ts);
  }

  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fmtNum(n) {
    return Math.round(n).toLocaleString('ja-JP');
  }

  function safeFilename(s) {
    return String(s || '無題').replace(/[\\/:*?"<>|\n\r]+/g, '_').slice(0, 60);
  }

  /** フォーム行（ラベル + 入力） */
  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
  }

  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  const SWATCHES = ['#c8553d', '#d9a441', '#6a994e', '#3d7ea6', '#5f4b8b', '#b5838d', '#6c757d', '#2b9348'];

  NS.UI = {
    h, append, clear, icon, btn, toast, modal, prompt, confirm, menu, popover, debounce, uid, download, pickFile, readFileText,
    fmtDate, relTime, today, fmtNum, safeFilename, field, lsGet, lsSet, SWATCHES,
  };
})(window.Tsuzuri = window.Tsuzuri || {});
