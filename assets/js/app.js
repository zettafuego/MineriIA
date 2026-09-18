/**
 * FormalizaAI — App bootstrap compartido
 */

const App = (() => {
  /**
   * Protege páginas privadas y monta shell.
   * @param {{ auth?: boolean, redirectAuth?: boolean }} opts
   */
  function boot(opts = {}) {
    const { auth = true, redirectAuth = false } = opts;

    UI.initTheme();

    if (redirectAuth && AuthService.redirectIfAuth()) return;
    if (auth && !AuthService.requireAuth()) return;

    if (auth) {
      UI.initAppShell();
    }

    // Fade-in de página
    document.body.classList.add('page-ready');
  }

  return { boot };
})();

window.App = App;
