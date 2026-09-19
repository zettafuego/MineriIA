/**
 * FormalizaAI — Storage Service
 * Abstracción de LocalStorage para migrar fácilmente a API/Firebase.
 * Principio: Single Responsibility — solo persiste y recupera datos.
 */

const StorageService = (() => {
  const PREFIX = 'formalizaai_';

  const keys = {
    SESSION: `${PREFIX}session`,
    USERS: `${PREFIX}users`,
    RESPUESTAS: `${PREFIX}respuestas`,
    RESULTADO: `${PREFIX}resultado`,
    CHECKLIST: `${PREFIX}checklist`,
    ALERTAS: `${PREFIX}alertas`,
    CHAT_HISTORY: `${PREFIX}chat_history`,
    THEME: `${PREFIX}theme`,
    PROGRESS: `${PREFIX}progress`,
    DOC_PORTFOLIO: `${PREFIX}doc_portfolio`,
    DOC_EXPEDIENTE: `${PREFIX}doc_expediente`,
  };

  const GLOBAL_KEYS = new Set([keys.SESSION, keys.USERS, keys.THEME]);

  function resolveKey(key) {
    if (GLOBAL_KEYS.has(key)) return key;
    try {
      const raw = localStorage.getItem(keys.SESSION);
      const userId = raw ? JSON.parse(raw)?.id : null;
      return userId ? `${key}_${userId}` : key;
    } catch (_) {
      return key;
    }
  }

  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(resolveKey(key));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[Storage] Error al leer', key, err);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(resolveKey(key), JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[Storage] Error al guardar', key, err);
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(resolveKey(key));
  }

  function clearAll() {
    Object.values(keys).forEach((k) => localStorage.removeItem(resolveKey(k)));
  }

  /** Carga JSON remoto (assets) con caché opcional en memoria */
  const memoryCache = {};

  async function loadJson(path, useCache = true) {
    if (useCache && memoryCache[path]) return memoryCache[path];

    // file:// bloquea fetch en la mayoría de navegadores
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      throw new Error(
        `No se puede cargar ${path} con file://. Ejecuta start.bat o: python -m http.server 8080`
      );
    }

    const res = await fetch(path);
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status})`);
    const data = await res.json();
    if (useCache) memoryCache[path] = data;
    return data;
  }

  return {
    keys,
    get,
    set,
    remove,
    clearAll,
    loadJson,
  };
})();

// Export global para scripts no-module (compatibilidad MVP)
window.StorageService = StorageService;
