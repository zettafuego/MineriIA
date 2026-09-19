/**
 * Cliente remoto de FormalizaAI.
 * Solo usa la publishable key; RLS decide que filas puede leer cada usuario.
 */
const SupabaseService = (() => {
  const cfg = window.FORMALIZAAI_CONFIG || {};
  const configured = Boolean(
    cfg.supabaseUrl &&
      cfg.supabasePublishableKey &&
      window.supabase?.createClient
  );
  const client = configured
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

  if (client) {
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('formalizaai_session');
      }
    });
  }

  function isConfigured() {
    return configured;
  }

  async function getProfile(userId) {
    if (!client || !userId) return null;
    const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function saveProfile(userId, partial = {}) {
    if (!client || !userId) return null;
    const payload = {
      id: userId,
      nombre: partial.nombre || 'Usuario',
      region: partial.region || null,
      actividad: partial.actividad || null,
      telefono: partial.telefono || null,
      empresa: partial.empresa || null,
      estado: partial.estado || 'Inicio',
      porcentaje: Number(partial.porcentaje || 0),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function saveDiagnosis(resultado) {
    if (!client || !resultado) return null;
    const { data: authData } = await client.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return null;
    const { data, error } = await client
      .from('diagnoses')
      .insert({
        user_id: userId,
        respuestas: resultado.respuestas || {},
        resultado,
        porcentaje: resultado.porcentaje,
        riesgo: resultado.riesgo?.key || resultado.riesgo?.label || 'sin_clasificar',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function savePortfolio(portfolio) {
    if (!client || !portfolio) return null;
    const { data: authData } = await client.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return null;
    const { data, error } = await client
      .from('document_portfolios')
      .upsert(
        { user_id: userId, portfolio, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  return { client, isConfigured, getProfile, saveProfile, saveDiagnosis, savePortfolio };
})();

window.SupabaseService = SupabaseService;
