/**
 * FormalizaAI — Asistente IA (chat)
 * Streaming en tiempo real vía SSE (/api/chat).
 */

(function () {
  App.boot({ auth: true });

  const messagesEl = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const suggestionsEl = document.getElementById('chat-suggestions');
  const btnClear = document.getElementById('btn-clear-chat');
  const statusEl = document.getElementById('chat-api-status');

  let messages = ChatService.getHistory();
  let busy = false;
  let streamRaf = null;

  init();

  async function init() {
    await ChatService.init();
    updateStatusBadge();

    if (!messages.length) {
      const greeting = await ChatService.getGreeting();
      messages.push({
        id: 'greet',
        role: 'assistant',
        text: greeting,
        at: new Date().toISOString(),
        source: 'system',
      });
      ChatService.saveHistory(messages);
    }

    renderMessages();
    renderSuggestions(await ChatService.getSuggestions());
    scrollBottom();
  }

  function updateStatusBadge() {
    if (!statusEl) return;
    const st = ChatService.getApiStatus();
    statusEl.classList.remove('is-online', 'is-offline', 'is-local');
    if (st?.configured && st?.reachable) {
      statusEl.textContent = `En vivo · ${st.model || 'grok-4.5'}`;
      statusEl.classList.add('is-online');
      statusEl.title = (st.provider || 'xAI') + ' · streaming SSE';
    } else if (st?.reachable && !st?.configured) {
      statusEl.textContent = 'Sin API key';
      statusEl.classList.add('is-local');
      statusEl.title = 'Configura XAI_API_KEY en .env';
    } else {
      statusEl.textContent = 'Modo local';
      statusEl.classList.add('is-offline');
      statusEl.title = 'Proxy no disponible — usa python server.py';
    }
  }

  function renderMessages() {
    messagesEl.innerHTML = messages
      .map((m) => bubbleHtml(m))
      .join('');
  }

  function bubbleHtml(m) {
    if (m.role === 'user') {
      return `<div class="chat-bubble user" data-msg-id="${UI.escapeHtml(m.id)}">${UI.escapeHtml(m.text)}</div>`;
    }
    const badge =
      m.source === 'xai'
        ? `<span class="chat-source chat-source-api">Grok</span>`
        : m.source === 'local'
          ? `<span class="chat-source chat-source-local">Local</span>`
          : m.source === 'error'
            ? `<span class="chat-source chat-source-local">Error</span>`
            : '';
    const streamingClass = m.streaming ? ' is-streaming' : '';
    const cursor = m.streaming ? '<span class="stream-cursor" aria-hidden="true"></span>' : '';
    return `<div class="chat-bubble assistant${streamingClass}" data-msg-id="${UI.escapeHtml(
      m.id
    )}">${badge}<div class="chat-md">${UI.renderMarkdown(m.text || '')}${cursor}</div></div>`;
  }

  function renderSuggestions(list) {
    suggestionsEl.innerHTML = list
      .map(
        (s) =>
          `<button type="button" class="chip" data-suggestion="${UI.escapeHtml(s)}">${UI.escapeHtml(s)}</button>`
      )
      .join('');

    suggestionsEl.querySelectorAll('[data-suggestion]').forEach((btn) => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.suggestion;
        form.requestSubmit();
      });
    });
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /** Actualiza solo la burbuja en streaming (sin re-render de todo el historial). */
  function updateStreamingBubble(msg) {
    const el = messagesEl.querySelector(`[data-msg-id="${CSS.escape(msg.id)}"]`);
    if (!el) {
      // Si no existe, append
      messagesEl.insertAdjacentHTML('beforeend', bubbleHtml(msg));
      scrollBottom();
      return;
    }
    const badge =
      msg.source === 'xai'
        ? `<span class="chat-source chat-source-api">Grok</span>`
        : msg.source === 'local'
          ? `<span class="chat-source chat-source-local">Local</span>`
          : '';
    el.classList.toggle('is-streaming', Boolean(msg.streaming));
    el.innerHTML = `${badge}<div class="chat-md">${UI.renderMarkdown(msg.text || '')}${
      msg.streaming ? '<span class="stream-cursor" aria-hidden="true"></span>' : ''
    }</div>`;
    scrollBottom();
  }

  function scheduleStreamPaint(msg) {
    if (streamRaf) return;
    streamRaf = requestAnimationFrame(() => {
      streamRaf = null;
      updateStreamingBubble(msg);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;

    busy = true;
    input.value = '';
    input.disabled = true;

    messages.push({
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      at: new Date().toISOString(),
    });
    ChatService.saveHistory(messages);
    renderMessages();
    scrollBottom();

    const assistantId = `a-${Date.now()}`;
    const assistantMsg = {
      id: assistantId,
      role: 'assistant',
      text: '',
      at: new Date().toISOString(),
      source: 'xai',
      streaming: true,
    };
    messages.push(assistantMsg);
    updateStreamingBubble(assistantMsg);

    try {
      await ChatService.refreshApiStatus();
      updateStatusBadge();

      const result = await ChatService.reply(text, {
        history: messages.filter((m) => m.id !== assistantId),
        onMeta: (meta) => {
          if (meta?.model) {
            assistantMsg.model = meta.model;
            assistantMsg.source = 'xai';
          }
        },
        onDelta: (full) => {
          assistantMsg.text = full;
          // source se confirma al final; mientras stream llega, asumimos xai
          if (!assistantMsg.source || assistantMsg.source === 'system') {
            assistantMsg.source = 'xai';
          }
          scheduleStreamPaint(assistantMsg);
        },
      });

      assistantMsg.text = result.text;
      assistantMsg.source = result.source;
      assistantMsg.model = result.model;
      assistantMsg.streaming = false;
      ChatService.saveHistory(messages);
      updateStreamingBubble(assistantMsg);

      if (result.source === 'local') {
        UI.toast('Respuesta local (API no disponible)', 'info', 2200);
      } else if (result.source === 'error') {
        UI.toast('Error de API — revisa la configuración', 'warning');
      }
    } catch (err) {
      console.error(err);
      UI.toast('Error al obtener respuesta', 'error');
      assistantMsg.streaming = false;
      assistantMsg.source = 'error';
      assistantMsg.text =
        `No pude responder ahora. ${err.message || ''}\n\n` +
        'Prueba de nuevo o revisa que el servidor esté en marcha con `python server.py` y `XAI_API_KEY` en `.env`.';
      ChatService.saveHistory(messages);
      updateStreamingBubble(assistantMsg);
    } finally {
      busy = false;
      input.disabled = false;
      input.focus();
    }
  });

  btnClear?.addEventListener('click', () => {
    if (!confirm('¿Borrar el historial del chat?')) return;
    ChatService.clearHistory();
    messages = [];
    init();
    UI.toast('Chat reiniciado', 'info');
  });
})();
