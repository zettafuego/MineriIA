/**
 * FormalizaAI — Auth Service
 * Autenticación simulada con JSON + LocalStorage.
 * Listo para reemplazar por JWT/Firebase sin tocar las vistas.
 */

const AuthService = (() => {
  const { keys, get, set, remove, loadJson } = StorageService;

  function useRemoteAuth() {
    return Boolean(window.SupabaseService?.isConfigured?.());
  }

  function buildRemoteSession(user, profile = {}) {
    const metadata = user?.user_metadata || {};
    return {
      id: user.id,
      nombre: profile.nombre || metadata.nombre || user.email?.split('@')[0] || 'Usuario',
      email: user.email,
      region: profile.region || metadata.region || '',
      actividad: profile.actividad || metadata.actividad || '',
      estado: profile.estado || 'Inicio',
      porcentaje: profile.porcentaje || 0,
      telefono: profile.telefono || '',
      empresa: profile.empresa || '',
      fechaRegistro: user.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      loginAt: new Date().toISOString(),
      backend: 'supabase',
    };
  }

  /** Seed embebido: evita fallo de login si fetch/JSON no está disponible (file://, red, etc.) */
  const FALLBACK_USERS = [
    {
      id: 'usr-001',
      nombre: 'Carlos Mendoza',
      email: 'carlos@mineria.pe',
      password: 'demo1234',
      region: 'Puno',
      actividad: 'Pequeña Minería',
      estado: 'En formalización',
      porcentaje: 45,
      telefono: '+51 987 654 321',
      empresa: 'Minera Andina SAC',
      fechaRegistro: '2026-01-15',
      avatar: null,
    },
    {
      id: 'usr-002',
      nombre: 'María Quispe',
      email: 'maria@consultora.pe',
      password: 'demo1234',
      region: 'Arequipa',
      actividad: 'Consultoría Minera',
      estado: 'Formalizado',
      porcentaje: 92,
      telefono: '+51 912 345 678',
      empresa: 'Consultora Quispe EIRL',
      fechaRegistro: '2025-11-03',
      avatar: null,
    },
    {
      id: 'usr-003',
      nombre: 'José Huamán',
      email: 'jose@artesanal.pe',
      password: 'demo1234',
      region: 'Madre de Dios',
      actividad: 'Minería Artesanal',
      estado: 'Inicio',
      porcentaje: 15,
      telefono: '+51 945 111 222',
      empresa: 'Cooperativa El Dorado',
      fechaRegistro: '2026-03-20',
      avatar: null,
    },
  ];

  function isValidUserList(users) {
    return (
      Array.isArray(users) &&
      users.length > 0 &&
      users.every((u) => u && typeof u.email === 'string' && typeof u.password === 'string')
    );
  }

  async function loadSeedUsers() {
    try {
      const fromJson = await loadJson('assets/json/usuarios.json');
      if (isValidUserList(fromJson)) {
        return fromJson.map((u) => ({ ...u }));
      }
    } catch (err) {
      console.warn('[Auth] No se pudo cargar usuarios.json, usando seed embebido.', err);
    }
    return FALLBACK_USERS.map((u) => ({ ...u }));
  }

  async function ensureUsers() {
    let users = get(keys.USERS);
    if (!isValidUserList(users)) {
      users = await loadSeedUsers();
      set(keys.USERS, users);
    }
    return users;
  }

  function getSession() {
    return get(keys.SESSION, null);
  }

  function isAuthenticated() {
    return Boolean(getSession()?.id);
  }

  function requireAuth(redirectTo = 'login.html') {
    if (!isAuthenticated()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  function redirectIfAuth(to = 'dashboard.html') {
    if (isAuthenticated()) {
      window.location.href = to;
      return true;
    }
    return false;
  }

  /**
   * Login por email + password (simulado).
   * @returns {{ ok: boolean, user?: object, error?: string }}
   */
  async function login(email, password) {
    if (useRemoteAuth()) {
      const normalized = String(email || '').trim().toLowerCase();
      const { data, error } = await SupabaseService.client.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (error || !data?.user) {
        return { ok: false, error: error?.message || 'Correo o contraseña incorrectos.' };
      }
      try {
        const profile = (await SupabaseService.getProfile(data.user.id)) || {};
        const session = buildRemoteSession(data.user, profile);
        set(keys.SESSION, session);
        return { ok: true, user: session };
      } catch (err) {
        await SupabaseService.client.auth.signOut();
        return { ok: false, error: `No se pudo cargar el perfil: ${err.message}` };
      }
    }

    const users = await ensureUsers();
    const normalized = String(email || '').trim().toLowerCase();
    const user = users.find(
      (u) => u.email.toLowerCase() === normalized && u.password === password
    );

    if (!user) {
      return { ok: false, error: 'Correo o contraseña incorrectos.' };
    }

    const session = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      region: user.region,
      actividad: user.actividad,
      estado: user.estado,
      porcentaje: user.porcentaje,
      telefono: user.telefono,
      empresa: user.empresa,
      fechaRegistro: user.fechaRegistro,
      loginAt: new Date().toISOString(),
    };

    set(keys.SESSION, session);
    return { ok: true, user: session };
  }

  /**
   * Registro de nueva cuenta (solo LocalStorage).
   */
  async function register({ nombre, email, password, region, actividad }) {
    if (useRemoteAuth()) {
      const normalized = String(email || '').trim().toLowerCase();
      if (!nombre?.trim() || !normalized || !password) {
        return { ok: false, error: 'Completa todos los campos obligatorios.' };
      }
      if (password.length < 8) {
        return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
      }

      const { data, error } = await SupabaseService.client.auth.signUp({
        email: normalized,
        password,
        options: { data: { nombre: nombre.trim(), region, actividad } },
      });
      if (error || !data?.user) {
        return { ok: false, error: error?.message || 'No se pudo crear la cuenta.' };
      }
      if (!data.session) {
        return {
          ok: false,
          pendingConfirmation: true,
          error: 'Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.',
        };
      }

      try {
        const profile = await SupabaseService.saveProfile(data.user.id, {
          nombre: nombre.trim(),
          region,
          actividad,
        });
        const session = buildRemoteSession(data.user, profile || {});
        set(keys.SESSION, session);
        return { ok: true, user: session };
      } catch (err) {
        return { ok: false, error: `Cuenta creada, pero el perfil falló: ${err.message}` };
      }
    }

    const users = await ensureUsers();
    const normalized = String(email || '').trim().toLowerCase();

    if (!nombre?.trim() || !normalized || !password) {
      return { ok: false, error: 'Completa todos los campos obligatorios.' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }
    if (users.some((u) => u.email.toLowerCase() === normalized)) {
      return { ok: false, error: 'Ya existe una cuenta con ese correo.' };
    }

    const nuevo = {
      id: `usr-${Date.now()}`,
      nombre: nombre.trim(),
      email: normalized,
      password,
      region: region || 'No especificada',
      actividad: actividad || 'Por definir',
      estado: 'Inicio',
      porcentaje: 0,
      telefono: '',
      empresa: '',
      fechaRegistro: new Date().toISOString().slice(0, 10),
      avatar: null,
    };

    users.push(nuevo);
    set(keys.USERS, users);

    const session = {
      id: nuevo.id,
      nombre: nuevo.nombre,
      email: nuevo.email,
      region: nuevo.region,
      actividad: nuevo.actividad,
      estado: nuevo.estado,
      porcentaje: nuevo.porcentaje,
      telefono: nuevo.telefono,
      empresa: nuevo.empresa,
      fechaRegistro: nuevo.fechaRegistro,
      loginAt: new Date().toISOString(),
    };
    set(keys.SESSION, session);
    return { ok: true, user: session };
  }

  async function logout() {
    try {
      if (useRemoteAuth()) await SupabaseService.client.auth.signOut();
    } finally {
      remove(keys.SESSION);
      window.location.href = 'login.html';
    }
  }

  /** Actualiza campos del usuario en sesión y en el listado local */
  async function updateProfile(partial) {
    const session = getSession();
    if (!session) return { ok: false, error: 'Sin sesión.' };

    if (useRemoteAuth() && session.backend === 'supabase') {
      try {
        const updated = await SupabaseService.saveProfile(session.id, { ...session, ...partial });
        const nextSession = { ...session, ...partial, ...updated, email: session.email };
        set(keys.SESSION, nextSession);
        return { ok: true, user: nextSession };
      } catch (err) {
        return { ok: false, error: err.message || 'No se pudo actualizar el perfil.' };
      }
    }

    const users = await ensureUsers();
    const idx = users.findIndex((u) => u.id === session.id);
    if (idx === -1) return { ok: false, error: 'Usuario no encontrado.' };

    const updatedUser = { ...users[idx], ...partial };
    // No exponer password en sesión
    users[idx] = updatedUser;
    set(keys.USERS, users);

    const nextSession = {
      ...session,
      nombre: updatedUser.nombre,
      email: updatedUser.email,
      region: updatedUser.region,
      actividad: updatedUser.actividad,
      estado: updatedUser.estado,
      porcentaje: updatedUser.porcentaje,
      telefono: updatedUser.telefono,
      empresa: updatedUser.empresa,
    };
    set(keys.SESSION, nextSession);
    return { ok: true, user: nextSession };
  }

  function getCurrentUser() {
    return getSession();
  }

  return {
    ensureUsers,
    getSession,
    getCurrentUser,
    isAuthenticated,
    requireAuth,
    redirectIfAuth,
    login,
    register,
    logout,
    updateProfile,
  };
})();

window.AuthService = AuthService;
