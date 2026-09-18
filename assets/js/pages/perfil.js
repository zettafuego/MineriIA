/**
 * FormalizaAI — Perfil de usuario
 */

(function () {
  App.boot({ auth: true });

  const user = AuthService.getCurrentUser();
  const resultado = DiagnosisEngine.getResultado();
  const form = document.getElementById('form-perfil');

  // Rellenar vista
  document.getElementById('perfil-nombre').textContent = user.nombre;
  document.getElementById('perfil-email').textContent = user.email;
  document.getElementById('perfil-initials').textContent = UI.initials(user.nombre);
  document.getElementById('perfil-estado').textContent = user.estado || 'Inicio';
  document.getElementById('perfil-pct').textContent = `${user.porcentaje ?? 0}%`;
  document.getElementById('perfil-region-view').textContent = user.region || '—';
  document.getElementById('perfil-actividad-view').textContent = user.actividad || '—';
  document.getElementById('perfil-fecha').textContent = user.fechaRegistro || '—';

  // Form
  form.nombre.value = user.nombre || '';
  form.email.value = user.email || '';
  form.telefono.value = user.telefono || '';
  form.empresa.value = user.empresa || '';
  form.region.value = user.region || '';
  form.actividad.value = user.actividad || '';

  if (resultado) {
    document.getElementById('perfil-diag-date').textContent = new Date(
      resultado.fecha
    ).toLocaleString('es-PE');
    document.getElementById('perfil-diag-risk').textContent = resultado.riesgo.label;
    document.getElementById('perfil-diag-wrap').classList.remove('hidden');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.showLoading('Guardando...');
    try {
      await new Promise((r) => setTimeout(r, 400));
      const result = await AuthService.updateProfile({
        nombre: form.nombre.value.trim(),
        telefono: form.telefono.value.trim(),
        empresa: form.empresa.value.trim(),
        region: form.region.value.trim(),
        actividad: form.actividad.value.trim(),
        // email no editable en MVP por simplicidad de id
      });
      if (!result.ok) {
        UI.toast(result.error || 'No se pudo guardar', 'error');
        return;
      }
      UI.renderUserChip();
      document.getElementById('perfil-nombre').textContent = result.user.nombre;
      document.getElementById('perfil-initials').textContent = UI.initials(result.user.nombre);
      document.getElementById('perfil-region-view').textContent = result.user.region || '—';
      document.getElementById('perfil-actividad-view').textContent = result.user.actividad || '—';
      UI.toast('Perfil actualizado', 'success');
    } catch (err) {
      console.error(err);
      UI.toast('Error al guardar', 'error');
    } finally {
      UI.hideLoading();
    }
  });
})();
