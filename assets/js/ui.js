/**
 * FormalizaAI — UI Utilities
 * Toast, loading, theme, sidebar, breadcrumbs, helpers DOM.
 */

const UI = (() => {
  const { keys, get, set } = StorageService;

  /* ---------- Theme ---------- */
  function getTheme() {
    return get(keys.THEME, null) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.setAttribute('data-theme', t);
    set(keys.THEME, t);
    // Sync toggle buttons
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(t === 'dark'));
    });
  }

  function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  function initTheme() {
    applyTheme(getTheme());
  }

  /* ---------- Toast ---------- */
  function ensureToastHost() {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'toast-host';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    return host;
  }

  /**
   * @param {string} message
   * @param {'success'|'error'|'info'|'warning'} type
   * @param {number} duration
   */
  function toast(message, type = 'info', duration = 3200) {
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = `toast toast-${type} animate-slide-in`;
    el.innerHTML = `
      <span class="toast-icon">${toastIcon(type)}</span>
      <span class="toast-msg">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" aria-label="Cerrar">&times;</button>
    `;
    host.appendChild(el);

    const close = () => {
      el.classList.add('animate-fade-out');
      setTimeout(() => el.remove(), 250);
    };
    el.querySelector('.toast-close').addEventListener('click', close);
    setTimeout(close, duration);
  }

  function toastIcon(type) {
    const icons = {
      success: '✓',
      error: '!',
      warning: '⚠',
      info: 'i',
    };
    return icons[type] || icons.info;
  }

  /* ---------- Loading ---------- */
  function showLoading(text = 'Procesando...') {
    let overlay = document.getElementById('global-loader');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-loader';
      overlay.className = 'global-loader';
      overlay.innerHTML = `
        <div class="loader-card">
          <div class="spinner"></div>
          <p class="loader-text">${escapeHtml(text)}</p>
        </div>
      `;
      document.body.appendChild(overlay);
    } else {
      overlay.querySelector('.loader-text').textContent = text;
      overlay.classList.remove('hidden');
    }
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  function hideLoading() {
    const overlay = document.getElementById('global-loader');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }

  /* ---------- Sidebar ---------- */
  function initSidebar() {
    const toggle = document.querySelector('[data-sidebar-toggle]');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (!toggle || !sidebar) return;

    const open = () => {
      sidebar.classList.add('open');
      backdrop?.classList.add('open');
      document.body.classList.add('sidebar-open');
    };
    const close = () => {
      sidebar.classList.remove('open');
      backdrop?.classList.remove('open');
      document.body.classList.remove('sidebar-open');
    };

    toggle.addEventListener('click', () => {
      sidebar.classList.contains('open') ? close() : open();
    });
    backdrop?.addEventListener('click', close);

    // Marcar link activo
    const page = document.body.dataset.page;
    if (page) {
      sidebar.querySelectorAll('[data-nav]').forEach((a) => {
        a.classList.toggle('active', a.dataset.nav === page);
      });
    }
  }

  /* ---------- User chip ---------- */
  function renderUserChip() {
    const user = AuthService.getCurrentUser();
    if (!user) return;
    document.querySelectorAll('[data-user-name]').forEach((el) => {
      el.textContent = user.nombre;
    });
    document.querySelectorAll('[data-user-email]').forEach((el) => {
      el.textContent = user.email;
    });
    document.querySelectorAll('[data-user-initials]').forEach((el) => {
      el.textContent = initials(user.nombre);
    });
    document.querySelectorAll('[data-user-pct]').forEach((el) => {
      el.textContent = `${user.porcentaje ?? 0}%`;
    });
  }

  function initials(name) {
    return String(name || 'U')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
  }

  /* ---------- Helpers ---------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Markdown simple: **bold**, saltos de línea, tablas básicas */
  function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // tablas markdown simples
    html = html.replace(
      /(?:^|\n)(\|.+\|)(?:\n\|[-| :]+\|)((?:\n\|.+\|)+)/g,
      (_, header, body) => {
        const th = header
          .split('|')
          .filter(Boolean)
          .map((c) => `<th>${c.trim()}</th>`)
          .join('');
        const rows = body
          .trim()
          .split('\n')
          .map((row) => {
            const cells = row
              .split('|')
              .filter(Boolean)
              .map((c) => `<td>${c.trim()}</td>`)
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');
        return `<div class="table-wrap"><table class="md-table"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
    );
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return [...root.querySelectorAll(sel)];
  }

  /** Layout app: theme + sidebar + user + logout */
  function initAppShell() {
    initTheme();
    initSidebar();
    renderUserChip();

    qsa('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', toggleTheme);
    });
    qsa('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        AuthService.logout();
      });
    });
  }

  return {
    initTheme,
    applyTheme,
    toggleTheme,
    getTheme,
    toast,
    showLoading,
    hideLoading,
    initSidebar,
    renderUserChip,
    initAppShell,
    escapeHtml,
    renderMarkdown,
    initials,
    qs,
    qsa,
  };
})();

window.UI = UI;
