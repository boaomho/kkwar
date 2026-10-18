/* ชั้นเก็บข้อมูล: ใช้ Firebase Realtime Database ถ้ามี config
   ถ้าไม่มี ใช้ MockStore (localStorage + BroadcastChannel) สำหรับทดสอบในเครื่อง */
window.Store = (function () {
  function pathParts(p) { return p.split('/').filter(Boolean); }

  // ---------- Mock ----------
  function createMock() {
    const KEY = 'kkwar-mock-db';
    let tree = {};
    try { tree = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { tree = {}; }
    const chan = ('BroadcastChannel' in window) ? new BroadcastChannel('kkwar-mock') : null;
    const listeners = []; // {path, cb}

    function getAt(path) {
      let n = tree;
      for (const k of pathParts(path)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
      return n === undefined ? null : n;
    }
    function setAt(path, value) {
      const parts = pathParts(path);
      if (!parts.length) { tree = value == null ? {} : value; return; }
      let n = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        if (n[parts[i]] == null || typeof n[parts[i]] !== 'object') n[parts[i]] = {};
        n = n[parts[i]];
      }
      if (value === null || value === undefined) delete n[parts[parts.length - 1]];
      else n[parts[parts.length - 1]] = value;
    }
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch (e) {} }
    function notify(changedPath) {
      for (const l of listeners) {
        if (changedPath.startsWith(l.path) || l.path.startsWith(changedPath)) {
          l.cb(deepClone(getAt(l.path)));
        }
      }
    }
    function deepClone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
    if (chan) chan.onmessage = (ev) => {
      const { path, value } = ev.data;
      setAt(path, value); notify(path);
    };
    function broadcast(path, value) { if (chan) chan.postMessage({ path, value: deepClone(value) }); }

    function ref(path) {
      path = pathParts(path).join('/');
      return {
        path,
        async get() { return deepClone(getAt(path)); },
        async set(v) { setAt(path, deepClone(v)); persist(); notify(path); broadcast(path, v); },
        async update(obj) {
          for (const k of Object.keys(obj)) {
            const p = path + '/' + k;
            setAt(p, deepClone(obj[k]));
          }
          persist(); notify(path);
          for (const k of Object.keys(obj)) broadcast(path + '/' + k, obj[k]);
        },
        async remove() { setAt(path, null); persist(); notify(path); broadcast(path, null); },
        on(cb) {
          const l = { path, cb };
          listeners.push(l);
          setTimeout(() => cb(deepClone(getAt(path))), 0);
          return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
        },
        child(k) { return ref(path + '/' + k); },
      };
    }
    return { kind: 'mock', ref, now: () => Date.now() };
  }

  // ---------- Firebase ----------
  function createFirebase(config) {
    firebase.initializeApp(config);
    const db = firebase.database();
    let offset = 0;
    db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
    function ref(path) {
      path = pathParts(path).join('/');
      const r = db.ref(path);
      return {
        path,
        async get() { const s = await r.get(); return s.exists() ? s.val() : null; },
        async set(v) { await r.set(v === undefined ? null : v); },
        async update(obj) { await r.update(obj); },
        async remove() { await r.remove(); },
        on(cb) {
          const h = r.on('value', (s) => cb(s.exists() ? s.val() : null), (err) => console.error('db', err));
          return () => r.off('value', h);
        },
        child(k) { return ref(path + '/' + k); },
      };
    }
    return { kind: 'firebase', ref, now: () => Date.now() + offset, offsetRef: () => offset };
  }

  function init() {
    const cfg = window.FIREBASE_CONFIG;
    if (cfg && cfg.apiKey && window.firebase) return createFirebase(cfg);
    return createMock();
  }
  return { init };
})();
