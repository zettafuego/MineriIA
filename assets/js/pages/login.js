/**
 * FormalizaAI — Login / Registro
 */

(function () {
  App.boot({ auth: false, redirectAuth: true });
  document.body.classList.add('page-ready');

  const loginForm = document.getElementById('form-login');
  const registerForm = document.getElementById('form-register');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const panelLogin = document.getElementById('panel-login');
  const panelRegister = document.getElementById('panel-register');

  function switchTab(mode) {
    const isLogin = mode === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    panelLogin.classList.toggle('hidden', !isLogin);
    panelRegister.classList.toggle('hidden', isLogin);
  }

  tabLogin?.addEventListener('click', () => switchTab('login'));
  tabRegister?.addEventListener('click', () => switchTab('register'));

  // Deep link ?register=1
  if (new URLSearchParams(location.search).get('register') === '1') {
    switchTab('register');
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';

    if (!email?.trim() || !password) {
      const msg = 'Ingresa tu correo y contraseña.';
      errEl.textContent = msg;
      UI.toast(msg, 'error');
      return;
    }

    UI.showLoading('Ingresando...');
    try {
      // Pequeña latencia simulada
      await new Promise((r) => setTimeout(r, 500));
      const result = await AuthService.login(email, password);
      if (!result.ok) {
        errEl.textContent = result.error;
        UI.toast(result.error, 'error');
        return;
      }
      UI.toast(`Bienvenido, ${result.user.nombre}`, 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 400);
    } catch (err) {
      console.error(err);
      const msg =
        'No se pudo iniciar sesión. Usa start.bat o un servidor local (python -m http.server 8080) y prueba carlos@mineria.pe / demo1234.';
      errEl.textContent = msg;
      UI.toast('Error al iniciar sesión. Revisa la consola (F12).', 'error');
    } finally {
      UI.hideLoading();
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';

    const payload = {
      nombre: registerForm.nombre.value,
      email: registerForm.email.value,
      password: registerForm.password.value,
      region: registerForm.region.value,
      actividad: registerForm.actividad.value,
    };

    UI.showLoading('Creando cuenta...');
    try {
      await new Promise((r) => setTimeout(r, 600));
      const result = await AuthService.register(payload);
      if (!result.ok) {
        errEl.textContent = result.error;
        UI.toast(result.error, 'error');
        return;
      }
      UI.toast('Cuenta creada correctamente', 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 400);
    } catch (err) {
      console.error(err);
      UI.toast('Error al registrar', 'error');
    } finally {
      UI.hideLoading();
    }
  });

  // Rellenar demo con un clic
  document.getElementById('fill-demo')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('login');
    loginForm.email.value = 'carlos@mineria.pe';
    loginForm.password.value = 'demo1234';
    UI.toast('Credenciales demo cargadas', 'info');
  });
})();
