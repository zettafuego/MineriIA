/**
 * FormalizaAI — Layout compartido (sidebar + navbar)
 * Inyecta markup reutilizable para no duplicar HTML gigante.
 */

const Layout = (() => {
  const NAV = [
    { id: 'dashboard', href: 'dashboard.html', label: 'Dashboard', icon: 'home' },
    { id: 'diagnostico', href: 'diagnostico.html', label: 'Diagnóstico', icon: 'clipboard' },
    { id: 'documentos', href: 'documentos.html', label: 'Documentos', icon: 'folder' },
    { id: 'chat', href: 'chat.html', label: 'Asistente IA', icon: 'chat' },
    { id: 'perfil', href: 'perfil.html', label: 'Perfil', icon: 'user' },
  ];

  const ICONS = {
    home: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>`,
    clipboard: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"/></svg>`,
    folder: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"/></svg>`,
    chat: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/></svg>`,
    user: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>`,
    menu: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>`,
    sun: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"/></svg>`,
    moon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"/></svg>`,
    logout: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15"/></svg>`,
  };

  /**
   * @param {{ page: string, breadcrumbs?: {label:string, href?:string}[] }} opts
   */
  function render(opts) {
    const { page, breadcrumbs = [] } = opts;
    const mount = document.getElementById('app-root');
    if (!mount) return;

    const navHtml = NAV.map(
      (item) => `
      <a href="${item.href}" class="nav-link" data-nav="${item.id}">
        ${ICONS[item.icon] || ''}
        <span>${item.label}</span>
      </a>`
    ).join('');

    const crumbs =
      breadcrumbs.length > 0
        ? `<nav class="breadcrumbs" aria-label="Breadcrumb">
            ${breadcrumbs
              .map((c, i) => {
                const last = i === breadcrumbs.length - 1;
                if (last || !c.href) {
                  return `<span class="current">${c.label}</span>`;
                }
                return `<a href="${c.href}">${c.label}</a><span class="sep">/</span>`;
              })
              .join('')}
          </nav>`
        : '';

    const content = mount.innerHTML;

    mount.outerHTML = `
      <div class="app-layout">
        <div id="sidebar-backdrop" class="sidebar-backdrop"></div>
        <aside id="sidebar" class="sidebar" aria-label="Navegación principal">
          <div class="sidebar-brand">
            <div class="brand-mark">FA</div>
            <div>
              <div class="brand-text">FormalizaAI</div>
              <div class="brand-sub">Formalización minera</div>
            </div>
          </div>
          <nav class="sidebar-nav">
            ${navHtml}
          </nav>
          <div class="sidebar-footer">
            <div class="user-chip" style="margin-bottom:0.75rem">
              <div class="avatar" data-user-initials>U</div>
              <div class="meta">
                <div class="name" data-user-name>—</div>
                <div class="email" data-user-email>—</div>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm w-full" data-logout>
              ${ICONS.logout}
              Cerrar sesión
            </button>
          </div>
        </aside>
        <div class="main-wrap">
          <header class="navbar">
            <div class="navbar-left">
              <button type="button" class="btn-icon" data-sidebar-toggle aria-label="Abrir menú">
                ${ICONS.menu}
              </button>
              <span class="brand-text" style="font-size:0.95rem;display:none" id="nav-page-title"></span>
            </div>
            <div class="navbar-right">
              <button type="button" class="btn-icon" data-theme-toggle aria-label="Cambiar tema" title="Dark / Light">
                <span class="icon-sun">${ICONS.sun}</span>
              </button>
              <a href="perfil.html" class="user-chip" style="text-decoration:none">
                <div class="avatar" data-user-initials>U</div>
                <div class="meta">
                  <div class="name" data-user-name>—</div>
                  <div class="email"><span data-user-pct>0%</span> formalizado</div>
                </div>
              </a>
            </div>
          </header>
          <main class="content">
            ${crumbs}
            ${content}
          </main>
        </div>
      </div>
    `;

    document.body.dataset.page = page;
  }

  return { render, ICONS };
})();

window.Layout = Layout;
