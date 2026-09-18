/**
 * FormalizaAI — Wizard de Diagnóstico Inteligente
 */

(function () {
  App.boot({ auth: true });

  let preguntas = [];
  let current = 0;
  const answers = { ...(DiagnosisEngine.getRespuestas() || {}) };

  const elQuestion = document.getElementById('question-text');
  const elHelp = document.getElementById('question-help');
  const elOptions = document.getElementById('options-grid');
  const elStep = document.getElementById('step-label');
  const elBar = document.getElementById('wizard-bar');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const panelWizard = document.getElementById('panel-wizard');
  const panelAnalyzing = document.getElementById('panel-analyzing');

  init();

  async function init() {
    try {
      const data = await StorageService.loadJson('assets/json/preguntas.json');
      preguntas = data.preguntas.sort((a, b) => a.orden - b.orden);
      document.getElementById('wizard-title').textContent = data.titulo;
      document.getElementById('wizard-desc').textContent = data.descripcion;
      renderStep();
    } catch (err) {
      console.error(err);
      UI.toast('No se pudieron cargar las preguntas', 'error');
    }
  }

  function renderStep() {
    const q = preguntas[current];
    if (!q) return;

    const total = preguntas.length;
    const pct = Math.round((current / total) * 100);
    elStep.textContent = `Pregunta ${current + 1} de ${total}`;
    elBar.style.width = `${pct}%`;
    elQuestion.textContent = q.texto;
    elHelp.textContent = q.ayuda || '';

    btnPrev.disabled = current === 0;
    btnNext.textContent = current === total - 1 ? 'Finalizar análisis' : 'Siguiente';

    const selected = answers[q.campo];
    const cols = q.opciones.length <= 3 ? 'cols-3' : q.opciones.length <= 4 ? 'cols-2' : 'cols-2';

    elOptions.className = `option-grid ${cols}`;
    elOptions.innerHTML = q.opciones
      .map((opt) => {
        const value = opt.valor !== undefined ? opt.valor : opt.id;
        const isSelected = valuesEqual(selected, value) || selected === opt.id;
        return `
          <button type="button" class="option-card ${isSelected ? 'selected' : ''}"
            data-value="${UI.escapeHtml(String(value))}"
            data-id="${UI.escapeHtml(opt.id)}">
            <div class="opt-label">${UI.escapeHtml(opt.label)}</div>
            ${opt.descripcion ? `<div class="opt-desc">${UI.escapeHtml(opt.descripcion)}</div>` : ''}
          </button>`;
      })
      .join('');

    // Animación
    elOptions.classList.remove('stagger');
    void elOptions.offsetWidth;
    elOptions.classList.add('stagger');

    elOptions.querySelectorAll('.option-card').forEach((btn) => {
      btn.addEventListener('click', () => selectOption(q, btn));
    });
  }

  function selectOption(q, btn) {
    const raw = btn.dataset.value;
    let value = raw;
    if (raw === 'true') value = true;
    else if (raw === 'false') value = false;
    else if (!Number.isNaN(Number(raw)) && raw.trim() !== '' && q.tipo === 'single' && q.campo === 'numTrabajadores') {
      value = Number(raw);
    }

    // Preferir id semántico para tipo/región
    if (q.campo === 'tipoMineria' || q.campo === 'region' || q.campo === 'numTrabajadores') {
      if (q.campo === 'numTrabajadores') {
        answers[q.campo] = value;
      } else {
        answers[q.campo] = btn.dataset.id;
      }
    } else {
      answers[q.campo] = value;
    }

    // Guardar progreso parcial
    StorageService.set(StorageService.keys.RESPUESTAS, answers);
    StorageService.set(StorageService.keys.PROGRESS, {
      step: current,
      answers,
      updatedAt: new Date().toISOString(),
    });

    elOptions.querySelectorAll('.option-card').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
  }

  function valuesEqual(a, b) {
    return a === b || String(a) === String(b);
  }

  function currentAnswered() {
    const q = preguntas[current];
    return answers[q.campo] !== undefined && answers[q.campo] !== null && answers[q.campo] !== '';
  }

  btnPrev.addEventListener('click', () => {
    if (current > 0) {
      current -= 1;
      renderStep();
    }
  });

  btnNext.addEventListener('click', async () => {
    if (!currentAnswered()) {
      UI.toast('Selecciona una opción para continuar', 'warning');
      return;
    }

    if (current < preguntas.length - 1) {
      current += 1;
      renderStep();
      return;
    }

    // Finalizar → análisis IA simulado
    await runAnalysis();
  });

  async function runAnalysis() {
    panelWizard.classList.add('hidden');
    panelAnalyzing.classList.remove('hidden');

    const steps = [
      'Procesando respuestas...',
      'Evaluando requisitos legales...',
      'Calculando nivel de riesgo...',
      'Estimando plazos y costos...',
      'Generando checklist y plan de acción...',
    ];

    const statusEl = document.getElementById('analyze-status');
    const barEl = document.getElementById('analyze-bar');

    for (let i = 0; i < steps.length; i++) {
      statusEl.textContent = steps[i];
      barEl.style.width = `${((i + 1) / steps.length) * 100}%`;
      await new Promise((r) => setTimeout(r, 550 + Math.random() * 350));
    }

    try {
      const resultado = await DiagnosisEngine.analyze(answers);
      UI.toast(`Análisis listo: ${resultado.porcentaje}% formalizado`, 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html?from=diagnostico';
      }, 500);
    } catch (err) {
      console.error(err);
      UI.toast('Error al generar el análisis', 'error');
      panelAnalyzing.classList.add('hidden');
      panelWizard.classList.remove('hidden');
    }
  }
})();
