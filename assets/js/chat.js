/**
 * FormalizaAI — Chat Service
 * Asistente IA con streaming SSE (xAI vía /api/chat) + fallback local.
 */

const ChatService = (() => {
  const { keys, get, set, loadJson } = StorageService;

  let config = null;
  let apiStatus = null;

  async function init() {
    if (!config) {
      try {
        config = await loadJson('assets/json/chat.json');
      } catch (err) {
        console.warn('[Chat] chat.json no disponible', err);
        config = {
          asistente: {
            nombre: 'FormalizaAI',
            saludo:
              'Hola. Soy FormalizaAI, tu asistente de formalización minera. ¿En qué te ayudo?',
          },
          sugerencias: [
            '¿Qué es el IGAFOM?',
            '¿Cómo obtengo mi RUC?',
            '¿Qué es el REINFO?',
            '¿Cuánto demora formalizarse?',
          ],
          respuestas: [],
          fallback:
            'Puedo orientarte sobre RUC, REINFO, IGAFOM, contratos, seguridad y plazos. Completa el Diagnóstico para un plan personalizado.',
        };
      }
    }
    try {
      await refreshApiStatus();
    } catch (_) {
      apiStatus = { configured: false, reachable: false };
    }
    return config;
  }

  async function refreshApiStatus() {
    try {
      const res = await fetch('/api/health', { method: 'GET' });
      if (!res.ok) {
        apiStatus = { configured: false, reachable: false };
        return apiStatus;
      }
      const data = await res.json();
      apiStatus = {
        configured: Boolean(data.apiConfigured),
        reachable: true,
        model: data.model,
        provider: data.provider,
      };
    } catch {
      apiStatus = { configured: false, reachable: false };
    }
    return apiStatus;
  }

  function getApiStatus() {
    return apiStatus;
  }

  function getHistory() {
    return get(keys.CHAT_HISTORY, []);
  }

  function saveHistory(messages) {
    set(keys.CHAT_HISTORY, messages.slice(-50));
  }

  function clearHistory() {
    set(keys.CHAT_HISTORY, []);
  }

  function buildUserContext() {
    const user = window.AuthService?.getCurrentUser?.() || {};
    const resultado = window.DiagnosisEngine?.getResultado?.();
    const portfolio = window.DocumentService?.getPortfolio?.();
    const ctx = {
      nombre: user.nombre,
      region: user.region,
      actividad: user.actividad,
      estado: user.estado || resultado?.estado,
      porcentaje: resultado?.porcentaje ?? user.porcentaje,
      riesgo: resultado?.riesgo?.label,
      proximoPaso: resultado?.proximoPaso?.titulo,
      resumenIA: resultado?.resumenIA,
      porcentajeDocumental: portfolio?.porcentajeDocs,
      documentosFaltantes: [],
    };

    if (resultado?.documentosFaltantes?.length) {
      ctx.documentosFaltantes = resultado.documentosFaltantes
        .slice(0, 10)
        .map((d) => d.nombre || d.codigo);
    } else if (portfolio?.items?.length) {
      ctx.documentosFaltantes = portfolio.items
        .filter((i) => !i.esReferencial && (i.estado === 'pendiente' || i.estado === 'en_proceso'))
        .slice(0, 10)
        .map((i) => i.nombre || i.codigo);
    }
    return ctx;
  }

  function buildRequestBody(text, history) {
    return {
      message: text,
      stream: true,
      history: (history || [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.id !== 'greet')
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.text })),
      context: buildUserContext(),
    };
  }

  /**
   * Respuesta con streaming en tiempo real.
   * @param {string} text
   * @param {{ history?: array, onDelta?: (full:string, piece:string)=>void, onMeta?: (meta:object)=>void, useApi?: boolean }} options
   * @returns {Promise<{ text: string, source: string, model?: string, streamed?: boolean }>}
   */
  async function reply(text, options = {}) {
    const history = options.history || getHistory();
    const useApi = options.useApi !== false;
    const onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;
    const onMeta = typeof options.onMeta === 'function' ? options.onMeta : null;

    if (useApi) {
      try {
        const apiResult = await replyViaStream(text, history, { onDelta, onMeta });
        if (apiResult?.text) {
          const enriched = appendDiagnosisFootnote(apiResult.text);
          // Si hubo footnote, notificar un último delta visual
          if (enriched !== apiResult.text && onDelta) {
            onDelta(enriched, enriched.slice(apiResult.text.length));
          }
          return {
            text: enriched,
            matched: true,
            source: 'xai',
            model: apiResult.model,
            streamed: true,
          };
        }
      } catch (err) {
        console.warn('[Chat] Stream/API no disponible, fallback local.', err);
        if (options.preferApiOnly) {
          return {
            text: `No pude conectar con la IA en este momento.\n\n**Detalle:** ${err.message || err}\n\nConfigura \`XAI_API_KEY\` en \`.env\` y reinicia con \`python server.py\`.`,
            source: 'error',
            matched: false,
            streamed: false,
          };
        }
      }
    }

    // Fallback local con “streaming” simulado para misma UX
    const local = await replyLocal(text);
    const full = local.text;
    if (onDelta && full) {
      await streamTextLocally(full, onDelta);
    }
    return { ...local, source: 'local', streamed: Boolean(onDelta) };
  }

  /**
   * Lee SSE del proxy y emite deltas.
   */
  async function replyViaStream(text, history, { onDelta, onMeta } = {}) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(buildRequestBody(text, history)),
    });

    const ctype = res.headers.get('content-type') || '';

    // Respuesta JSON (error no-stream o stream:false)
    if (ctype.includes('application/json')) {
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const err = new Error(data?.message || `Error HTTP ${res.status}`);
        err.code = data?.error;
        err.fallback = data?.fallback;
        throw err;
      }
      if (onDelta && data.text) onDelta(data.text, data.text);
      return { text: data.text, model: data.model };
    }

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}`);
    }
    if (!res.body) {
      throw new Error('El navegador no soporta streaming (ReadableStream).');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';
    let model = null;
    let sawError = null;
    let completedOk = false;
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Procesar eventos SSE completos (separados por \n\n)
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const lines = rawEvent.split(/\r?\n/);
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          let evt;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }

          if (evt.type === 'meta') {
            model = evt.model || model;
            if (onMeta) onMeta(evt);
          } else if (evt.type === 'delta' && evt.text) {
            full += evt.text;
            if (onDelta) onDelta(full, evt.text);
          } else if (evt.type === 'error') {
            sawError = new Error(evt.message || 'Error de stream');
            sawError.code = evt.error;
            sawError.fallback = evt.fallback;
          } else if (evt.type === 'done') {
            if (evt.text && !full) full = evt.text;
            if (evt.model) model = evt.model;
            completedOk = evt.ok !== false;
            finished = true;
            try {
              await reader.cancel();
            } catch (_) {
              /* ignore */
            }
            break;
          }
        }
        if (finished) break;
      }
    }

    if (sawError && !full) throw sawError;
    if (!full.trim()) {
      throw sawError || new Error('La API no devolvió texto en el stream.');
    }
    if (!completedOk && sawError) throw sawError;

    return { text: full.trim(), model };
  }

  /** Simula escritura en vivo para respuestas locales */
  async function streamTextLocally(fullText, onDelta) {
    const text = String(fullText);
    // Chunks por palabras/caracteres para sensación de streaming
    let i = 0;
    let acc = '';
    while (i < text.length) {
      const size = text[i] === '\n' ? 1 : 2 + Math.floor(Math.random() * 5);
      const piece = text.slice(i, i + size);
      acc += piece;
      i += size;
      onDelta(acc, piece);
      await delay(12 + Math.random() * 28);
    }
  }

  async function replyLocal(text) {
    const cfg = await init();
    const strip = (s) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const q = strip(text);

    let best = null;
    let bestScore = 0;

    for (const item of cfg.respuestas || []) {
      let score = 0;
      for (const kw of item.keywords || []) {
        const k = strip(kw);
        if (q.includes(k)) score += k.length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (best && bestScore > 0) {
      return {
        text: appendDiagnosisFootnote(best.respuesta),
        matched: true,
      };
    }
    return {
      text:
        (cfg.fallback || 'No tengo una respuesta local para eso.') +
        '\n\n_Modo local (sin API). Configura XAI_API_KEY para respuestas con Grok en tiempo real._',
      matched: false,
    };
  }

  function appendDiagnosisFootnote(text) {
    const resultado = window.DiagnosisEngine?.getResultado?.();
    if (!resultado) return text;
    if (String(text).includes('Tu diagnóstico actual')) return text;
    return (
      text +
      `\n\n---\n📊 *Tu diagnóstico actual:* ${resultado.porcentaje}% formalizado · Riesgo ${
        resultado.riesgo?.label || '—'
      } · Próximo paso: ${resultado.proximoPaso?.titulo || '—'}`
    );
  }

  async function getSuggestions() {
    const cfg = await init();
    return cfg.sugerencias || [];
  }

  async function getGreeting() {
    const cfg = await init();
    const base =
      cfg.asistente?.saludo ||
      'Hola. Soy FormalizaAI, tu asistente de formalización minera. ¿En qué te ayudo?';
    const st = apiStatus || (await refreshApiStatus());
    if (st?.configured && st?.reachable) {
      return (
        base +
        `\n\n_Conectado a **${st.provider || 'xAI'}** · modelo \`${st.model || 'grok-4.5'}\` · **streaming en tiempo real**._`
      );
    }
    if (st?.reachable && !st?.configured) {
      return (
        base +
        '\n\n_Modo local: falta `XAI_API_KEY` en `.env`. Crea la clave en https://console.x.ai y reinicia `python server.py`._'
      );
    }
    return (
      base +
      '\n\n_Modo local: el proxy `/api/chat` no responde. Ejecuta la app con `python server.py`._'
    );
  }

  function delay(ms = 400) {
    return new Promise((r) => setTimeout(r, ms));
  }

  return {
    init,
    refreshApiStatus,
    getApiStatus,
    getHistory,
    saveHistory,
    clearHistory,
    reply,
    replyLocal,
    getSuggestions,
    getGreeting,
    delay,
    buildUserContext,
  };
})();

window.ChatService = ChatService;
