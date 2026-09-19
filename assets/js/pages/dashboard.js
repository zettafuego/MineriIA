/**
 * FormalizaAI — Dashboard
 */

(async function () {
  App.boot({ auth: true });

  if (window.SupabaseService?.hydrateUserState) {
    UI.showLoading('Recuperando tu avance…');
    try {
      const remoteState = await SupabaseService.hydrateUserState();
      if (
        remoteState?.diagnosis &&
        window.DocumentService?.syncFromDiagnosis &&
        (!remoteState.portfolio?.items?.length || remoteState.portfolio?.source === 'manual')
      ) {
        await DocumentService.syncFromDiagnosis(
          remoteState.diagnosis,
          remoteState.diagnosis.respuestas || {}
        );
      }
    } catch (err) {
      console.warn('[Dashboard] No se pudo recuperar el estado remoto', err);
    } finally {
      UI.hideLoading();
    }
  }

  const user = AuthService.getCurrentUser();
  const resultado = DiagnosisEngine.getResultado();
  const alertas = DiagnosisEngine.getAlertas();
  const checklist = DiagnosisEngine.getChecklist() || [];

  // Feedback al volver del diagnóstico
  if (new URLSearchParams(location.search).get('from') === 'diagnostico' && resultado) {
    UI.toast(`Diagnóstico guardado: ${resultado.porcentaje}% formalizado`, 'success');
    history.replaceState({}, '', 'dashboard.html');
  }

  // Header
  document.getElementById('dash-greeting').textContent = greetingFor(user.nombre);
  document.getElementById('dash-estado').textContent = user.estado || 'Inicio';
  document.getElementById('dash-region').textContent = user.region || '—';
  document.getElementById('dash-actividad').textContent = user.actividad || '—';

  const pct = resultado?.porcentaje ?? user.porcentaje ?? 0;
  document.getElementById('dash-pct-label').textContent = `${pct}%`;
  document.getElementById('dash-progress').style.width = `${pct}%`;
  const pctMirror = document.getElementById('ring-pct-mirror');
  if (pctMirror) pctMirror.textContent = `${pct}%`;
  document.querySelectorAll('[data-journey-min]').forEach((step) => {
    const min = Number(step.dataset.journeyMin || 0);
    const next = Number(step.dataset.journeyNext || 101);
    step.classList.toggle('completed', pct >= min);
    step.classList.toggle('current', pct >= min && pct < next);
  });
  const updatedEl = document.getElementById('dash-last-update');
  if (updatedEl && resultado?.fecha) {
    updatedEl.textContent = new Intl.DateTimeFormat('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).format(new Date(resultado.fecha));
  }

  // Próximo paso
  const next = resultado?.proximoPaso || {
    titulo: 'Realizar diagnóstico inteligente',
    descripcion: 'Responde 10 preguntas y obtén tu plan de formalización personalizado.',
  };
  document.getElementById('next-title').textContent = next.titulo;
  document.getElementById('next-desc').textContent = next.descripcion;

  // Stats
  if (resultado) {
    document.getElementById('stat-riesgo').textContent = resultado.riesgo.label;
    document.getElementById('stat-riesgo').className = `stat-value risk-${resultado.riesgo.key}`;
    document.getElementById('stat-tiempo').textContent = resultado.tiempoLabel;
    document.getElementById('stat-costo').textContent = resultado.costoLabel;
    document.getElementById('stat-faltantes').textContent = String(
      resultado.documentosFaltantes?.length ?? 0
    );
    document.getElementById('ai-summary').textContent = resultado.resumenIA;
    document.getElementById('ai-summary-wrap').classList.remove('hidden');
    document.getElementById('result-extra').classList.remove('hidden');
  } else {
    document.getElementById('stat-riesgo').textContent = '—';
    document.getElementById('stat-tiempo').textContent = '—';
    document.getElementById('stat-costo').textContent = '—';
    document.getElementById('stat-faltantes').textContent = '—';
  }

  // Resumen documental (portfolio + paquete mínimo)
  (async function loadDocsSummary() {
    if (!window.DocumentService) return;
    try {
      const portfolio = await DocumentService.ensurePortfolio();
      const s = DocumentService.getStats(portfolio);
      const pctEl = document.getElementById('dash-doc-pct');
      const okEl = document.getElementById('dash-doc-ok');
      const pendEl = document.getElementById('dash-doc-pend');
      const blockEl = document.getElementById('dash-doc-block');
      const packEl = document.getElementById('dash-paquete');
      const hintEl = document.getElementById('dash-doc-hint');
      if (pctEl) pctEl.textContent = `${s.porcentajeDocs}%`;
      if (okEl) okEl.textContent = String(s.completos);
      if (pendEl) pendEl.textContent = String(s.pendientes + s.enProceso);
      if (blockEl) blockEl.textContent = String(s.bloqueados);
      const pack = portfolio?.expediente?.paqueteMinimo || [];
      if (packEl) {
        packEl.innerHTML = pack.length
          ? pack
              .map(
                (p) =>
                  `<span class="doc-chip ${p.listo ? 'chip-ok' : 'chip-pend'}"><span class="chip-mark">${
                    p.listo ? '✓' : '○'
                  }</span><span><strong>${UI.escapeHtml(p.codigo)}</strong></span></span>`
              )
              .join('')
          : '<span class="text-muted" style="font-size:0.85rem">Aún sin paquete mínimo. Haz el diagnóstico o abre Documentos.</span>';
      }
      if (hintEl && portfolio?.expediente) {
        hintEl.textContent = portfolio.expediente.textoPortada;
      }
    } catch (err) {
      console.warn('[Dashboard] docs summary', err);
    }
  })();

  // Checklist
  const listEl = document.getElementById('checklist-list');
  if (!checklist.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>Aún no tienes un checklist. Completa el diagnóstico para generarlo automáticamente.</p>
        <a href="diagnostico.html" class="btn btn-primary">Realizar diagnóstico</a>
      </div>`;
  } else {
    listEl.innerHTML = checklist
      .map((item) => {
        const icon = item.estado === 'ok' ? '✔' : item.estado === 'parcial' ? '◐' : '✘';
        const cls = item.estado === 'ok' ? 'ok' : item.estado === 'parcial' ? 'parcial' : 'falta';
        const label =
          item.estado === 'ok' ? 'Completo' : item.estado === 'parcial' ? 'Parcial' : 'Falta';
        return `
          <div class="check-item">
            <span class="check-icon ${cls}" aria-hidden="true">${icon}</span>
            <div>
              <div style="font-weight:600;font-size:0.9rem">${UI.escapeHtml(item.nombre)}</div>
              <div class="text-muted" style="font-size:0.78rem">${UI.escapeHtml(item.codigo)} · ${UI.escapeHtml(item.entidad || '')} · ${label}</div>
            </div>
          </div>`;
      })
      .join('');
  }

  // Alertas
  const alertsEl = document.getElementById('alerts-list');
  if (!alertas.length) {
    alertsEl.innerHTML = `
      <div class="empty-state" style="padding:1rem">
        <p class="text-secondary" style="font-size:0.9rem;margin:0">Sin alertas por ahora. Completa el diagnóstico para generar alertas personalizadas.</p>
      </div>`;
  } else {
    alertsEl.innerHTML = alertas
      .map(
        (a) => `
      <div class="alert-card ${a.severidad}">
        <div class="alert-icon">${alertIcon(a.tipo)}</div>
        <div>
          <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.15rem">${UI.escapeHtml(a.titulo)}</div>
          <div class="text-secondary" style="font-size:0.85rem">${UI.escapeHtml(a.mensaje)}</div>
        </div>
      </div>`
      )
      .join('');
  }

  // Próximos pasos detallados
  const stepsEl = document.getElementById('steps-list');
  if (resultado?.proximosPasos?.length) {
    stepsEl.innerHTML = resultado.proximosPasos
      .map(
        (s, i) => `
      <div class="check-item">
        <span class="check-icon" style="background:var(--brand-50);color:var(--brand);font-size:0.7rem">${i + 1}</span>
        <div>
          <div style="font-weight:600;font-size:0.9rem">${UI.escapeHtml(s.titulo)}</div>
          <div class="text-muted" style="font-size:0.78rem">${UI.escapeHtml(s.descripcion)}</div>
        </div>
      </div>`
      )
      .join('');
  }

  // Chart.js — donut formalización
  renderRingChart(pct);
  if (resultado) {
    renderBarChart(checklist);
  }

  function greetingFor(name) {
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const first = (name || '').split(' ')[0];
    return `${saludo}, ${first}`;
  }

  function alertIcon(tipo) {
    if (tipo === 'vencimiento') return '⏰';
    if (tipo === 'pendiente') return '📄';
    return '🔔';
  }

  function renderRingChart(percentage) {
    const canvas = document.getElementById('chart-ring');
    if (!canvas || typeof Chart === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const track = isDark ? '#1f2937' : '#e2e8f0';

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Formalizado', 'Pendiente'],
        datasets: [
          {
            data: [percentage, Math.max(0, 100 - percentage)],
            backgroundColor: ['#0d9488', track],
            borderWidth: 0,
            cutout: '78%',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: percentage > 0 },
        },
        animation: { animateRotate: true, duration: 900 },
      },
    });
  }

  function renderBarChart(items) {
    const canvas = document.getElementById('chart-bars');
    if (!canvas || typeof Chart === 'undefined' || !items.length) return;

    const labels = items.map((i) => i.codigo);
    const values = items.map((i) => (i.estado === 'ok' ? 100 : i.estado === 'parcial' ? 45 : 10));
    const colors = items.map((i) =>
      i.estado === 'ok' ? '#059669' : i.estado === 'parcial' ? '#d97706' : '#dc2626'
    );

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Cumplimiento %',
            data: values,
            backgroundColor: colors,
            borderRadius: 6,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted') },
            grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border') },
          },
          x: {
            ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted'), maxRotation: 45 },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }
})();
