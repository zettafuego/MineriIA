/**
 * FormalizaAI — Página de Gestión Documental
 */

(function () {
  App.boot({ auth: true });

  let portfolio = null;
  let catalog = null;
  let selectedCodigo = null;

  init();

  async function init() {
    UI.showLoading('Cargando documentos…');
    try {
      if (window.SupabaseService?.hydrateUserState) {
        await SupabaseService.hydrateUserState();
      }
      catalog = await DocumentService.getCatalog();
      portfolio = await DocumentService.ensurePortfolio();
      fillCategoryFilter();
      bindFilters();
      bindActions();
      bindModal();
      renderAll();
    } catch (err) {
      console.error(err);
      UI.toast('No se pudo cargar el módulo de documentos', 'error');
    } finally {
      UI.hideLoading();
    }
  }

  function bindActions() {
    document.getElementById('btn-regen-exp')?.addEventListener('click', async () => {
      UI.showLoading('Regenerando expediente…');
      try {
        portfolio = await DocumentService.regenerateExpediente();
        renderAll();
        UI.toast('Expediente referencial regenerado', 'success');
      } catch (e) {
        console.error(e);
        UI.toast('Error al regenerar', 'error');
      } finally {
        UI.hideLoading();
      }
    });

    document.getElementById('btn-export-exp')?.addEventListener('click', async () => {
      const text = DocumentService.exportExpedienteText();
      try {
        await navigator.clipboard.writeText(text);
        UI.toast('Expediente copiado al portapapeles', 'success');
      } catch {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expediente-formalizaai-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        UI.toast('Expediente descargado como .txt', 'success');
      }
    });

    document.getElementById('btn-dl-exp-pdf')?.addEventListener('click', () =>
      downloadTemplate('EXPEDIENTE', 'pdf')
    );
    document.getElementById('btn-dl-exp-docx')?.addEventListener('click', () =>
      downloadTemplate('EXPEDIENTE', 'docx')
    );
  }

  async function downloadTemplate(codigo, format) {
    if (!window.TemplateService) {
      UI.toast('Servicio de plantillas no disponible', 'error');
      return;
    }
    UI.showLoading(format === 'pdf' ? 'Generando PDF…' : 'Generando Word…');
    try {
      // Pequeña pausa para que el loader se pinte
      await new Promise((r) => setTimeout(r, 80));
      const res = await TemplateService.download(codigo, format);
      UI.toast(`Descargado: ${res.filename}`, 'success');
    } catch (err) {
      console.error(err);
      UI.toast(err.message || 'No se pudo generar la plantilla', 'error');
    } finally {
      UI.hideLoading();
    }
  }

  function bindFilters() {
    document.getElementById('filter-estado')?.addEventListener('change', renderDocsList);
    document.getElementById('filter-categoria')?.addEventListener('change', renderDocsList);
  }

  function bindModal() {
    document.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function fillCategoryFilter() {
    const sel = document.getElementById('filter-categoria');
    if (!sel || !catalog?.categorias) return;
    catalog.categorias.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      sel.appendChild(opt);
    });
  }

  function renderAll() {
    renderStats();
    renderPortada();
    renderTemplates();
    renderPaquete();
    renderEtapas();
    renderPlan90();
    renderDocsList();
    renderAnexos();
  }

  function renderTemplates() {
    const host = document.getElementById('templates-list');
    if (!host || !window.TemplateService) return;

    const list = TemplateService.listAvailable();
    if (!list.length) {
      host.innerHTML = `<p class="text-muted" style="font-size:0.9rem;margin:0">Genera el portfolio para ver plantillas.</p>`;
      return;
    }

    host.innerHTML = list
      .map((t) => {
        const isMaster = t.codigo === 'EXPEDIENTE';
        return `
        <div class="template-card ${isMaster ? 'is-master' : ''}">
          <div class="template-card-body">
            <div class="template-code">${UI.escapeHtml(t.codigo)}</div>
            <div class="template-name">${UI.escapeHtml(t.nombre)}</div>
            <div class="template-desc">${UI.escapeHtml(t.descripcion || '')}</div>
          </div>
          <div class="template-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-tpl-pdf="${UI.escapeHtml(
              t.codigo
            )}">PDF</button>
            <button type="button" class="btn btn-primary btn-sm" data-tpl-docx="${UI.escapeHtml(
              t.codigo
            )}">Word</button>
          </div>
        </div>`;
      })
      .join('');

    host.querySelectorAll('[data-tpl-pdf]').forEach((btn) => {
      btn.addEventListener('click', () => downloadTemplate(btn.getAttribute('data-tpl-pdf'), 'pdf'));
    });
    host.querySelectorAll('[data-tpl-docx]').forEach((btn) => {
      btn.addEventListener('click', () => downloadTemplate(btn.getAttribute('data-tpl-docx'), 'docx'));
    });
  }

  function renderStats() {
    const s = DocumentService.getStats(portfolio);
    document.getElementById('stat-doc-pct').textContent = `${s.porcentajeDocs}%`;
    document.getElementById('stat-doc-bar').style.width = `${s.porcentajeDocs}%`;
    document.getElementById('stat-doc-ok').textContent = String(s.completos);
    document.getElementById('stat-doc-total').textContent = String(s.total);
    document.getElementById('stat-doc-pend').textContent = String(s.pendientes);
    document.getElementById('stat-doc-proc').textContent = String(s.enProceso);
    document.getElementById('stat-doc-block').textContent = String(s.bloqueados);
    document.getElementById('stat-doc-anexos').textContent = String(s.anexos);
  }

  function renderPortada() {
    const exp = portfolio?.expediente;
    const el = document.getElementById('exp-portada');
    if (!el) return;
    if (!exp) {
      el.textContent =
        'Aún no hay expediente. Ejecuta el diagnóstico o pulsa “Regenerar expediente” para armar el portfolio base.';
      return;
    }
    el.textContent = exp.textoPortada;
  }

  function renderPaquete() {
    const host = document.getElementById('paquete-minimo');
    if (!host) return;
    const pack = portfolio?.expediente?.paqueteMinimo || [];
    if (!pack.length) {
      host.innerHTML = `<p class="text-muted" style="font-size:0.9rem;margin:0">Sin paquete mínimo. Genera el expediente.</p>`;
      return;
    }
    host.innerHTML = pack
      .map(
        (p) => `
      <span class="doc-chip ${p.listo ? 'chip-ok' : 'chip-pend'}">
        <span class="chip-mark">${p.listo ? '✓' : '○'}</span>
        <span><strong>${UI.escapeHtml(p.codigo)}</strong> · ${UI.escapeHtml(p.nombre)}</span>
      </span>`
      )
      .join('');
  }

  function renderEtapas() {
    const host = document.getElementById('etapas-list');
    if (!host) return;
    const etapas = portfolio?.expediente?.etapas || [];
    if (!etapas.length) {
      host.innerHTML = `<p class="text-muted" style="font-size:0.9rem;margin:0">Sin etapas aún.</p>`;
      return;
    }
    host.innerHTML = etapas
      .map(
        (et) => `
      <div class="etapa-row">
        <div class="flex-between" style="margin-bottom:0.35rem">
          <span style="font-weight:600;font-size:0.9rem">${UI.escapeHtml(et.label)}</span>
          <span class="text-muted" style="font-size:0.8rem">${et.completos}/${et.total} · ${et.porcentaje}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar" style="width:${et.porcentaje}%"></div>
        </div>
      </div>`
      )
      .join('');
  }

  function renderPlan90() {
    const host = document.getElementById('plan90');
    if (!host) return;
    const phases = portfolio?.expediente?.plan90 || [];
    if (!phases.length) {
      host.innerHTML = `<div class="empty-state"><p>Sin plan. Completa el diagnóstico para priorizar.</p><a class="btn btn-primary" href="diagnostico.html">Diagnóstico</a></div>`;
      return;
    }
    host.innerHTML = phases
      .map(
        (ph) => `
      <div class="plan90-col">
        <div class="plan90-head">${UI.escapeHtml(ph.label)}</div>
        ${
          ph.items?.length
            ? ph.items
                .map(
                  (it) => `
            <div class="plan90-item ${it.bloqueado ? 'is-blocked' : ''}">
              <div style="font-weight:650;font-size:0.85rem">${UI.escapeHtml(it.codigo)} · ${UI.escapeHtml(it.nombre)}</div>
              <div class="text-muted" style="font-size:0.75rem">${UI.escapeHtml(it.entidad || '')}${
                    it.bloqueado ? ` · Bloqueado por ${(it.bloqueadoPor || []).join(', ')}` : ''
                  }</div>
              ${
                it.acciones?.length
                  ? `<ul class="plan90-actions">${it.acciones
                      .map((a) => `<li>${UI.escapeHtml(a)}</li>`)
                      .join('')}</ul>`
                  : ''
              }
            </div>`
                )
                .join('')
            : `<p class="text-muted" style="font-size:0.85rem;margin:0.5rem 0 0">Sin ítems en esta fase.</p>`
        }
      </div>`
      )
      .join('');
  }

  function filteredItems() {
    const estado = document.getElementById('filter-estado')?.value || 'all';
    const cat = document.getElementById('filter-categoria')?.value || 'all';
    let items = portfolio?.items || [];

    if (cat !== 'all') items = items.filter((i) => i.categoria === cat);
    if (estado === 'bloqueado') items = items.filter((i) => i.bloqueado);
    else if (estado === 'referencial') items = items.filter((i) => i.esReferencial || i.estado === 'referencial');
    else if (estado !== 'all') items = items.filter((i) => i.estado === estado);

    return items;
  }

  function renderDocsList() {
    const host = document.getElementById('docs-list');
    if (!host) return;
    const items = filteredItems();

    if (!items.length) {
      host.innerHTML = `
        <div class="empty-state">
          <p>No hay documentos con esos filtros. Completa el diagnóstico para generar el portfolio base.</p>
          <a href="diagnostico.html" class="btn btn-primary">Realizar diagnóstico</a>
          <button type="button" class="btn btn-secondary" id="btn-seed-portfolio" style="margin-left:0.5rem">Generar portfolio base</button>
        </div>`;
      document.getElementById('btn-seed-portfolio')?.addEventListener('click', async () => {
        portfolio = await DocumentService.syncFromDiagnosis(
          DiagnosisEngine.getResultado(),
          DiagnosisEngine.getRespuestas() || {}
        );
        renderAll();
        UI.toast('Portfolio base generado', 'success');
      });
      return;
    }

    host.innerHTML = items
      .map((doc) => {
        const cls = DocumentService.estadoClass(doc.estado, doc.bloqueado);
        const label = DocumentService.estadoLabel(doc.bloqueado && doc.estado !== 'completo' ? 'bloqueado' : doc.estado);
        const deps =
          doc.bloqueadoPor?.length
            ? `<span class="doc-dep">Bloqueado por: ${doc.bloqueadoPor.map((c) => UI.escapeHtml(c)).join(', ')}</span>`
            : doc.dependeDe?.length
              ? `<span class="doc-dep text-muted">Depende de: ${doc.dependeDe.map((c) => UI.escapeHtml(c)).join(', ')}</span>`
              : '';

        return `
        <article class="doc-card ${cls}" data-codigo="${UI.escapeHtml(doc.codigo)}">
          <div class="doc-card-main">
            <div class="doc-code">${UI.escapeHtml(doc.codigo)}</div>
            <div class="doc-info">
              <div class="doc-name">${UI.escapeHtml(doc.nombre)}</div>
              <div class="doc-meta">
                ${UI.escapeHtml(doc.entidad || '—')} · ${UI.escapeHtml(doc.categoria || '')}
                ${doc.esReferencial ? ' · <em>auto</em>' : ''}
              </div>
              ${deps}
            </div>
            <span class="doc-badge">${UI.escapeHtml(label)}</span>
          </div>
          <div class="doc-card-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-open-doc="${UI.escapeHtml(doc.codigo)}">Gestionar</button>
            <button type="button" class="btn btn-secondary btn-sm" data-dl-pdf="${UI.escapeHtml(doc.codigo)}" title="Descargar plantilla PDF">PDF</button>
            <button type="button" class="btn btn-secondary btn-sm" data-dl-docx="${UI.escapeHtml(doc.codigo)}" title="Descargar plantilla Word">Word</button>
            ${
              !doc.esReferencial && doc.estado !== 'no_aplica'
                ? `
              <button type="button" class="btn btn-secondary btn-sm" data-set-estado="${UI.escapeHtml(doc.codigo)}" data-estado="en_proceso">En proceso</button>
              <button type="button" class="btn btn-primary btn-sm" data-set-estado="${UI.escapeHtml(doc.codigo)}" data-estado="completo">Marcar completo</button>
            `
                : ''
            }
          </div>
        </article>`;
      })
      .join('');

    host.querySelectorAll('[data-open-doc]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.getAttribute('data-open-doc')));
    });
    host.querySelectorAll('[data-dl-pdf]').forEach((btn) => {
      btn.addEventListener('click', () => downloadTemplate(btn.getAttribute('data-dl-pdf'), 'pdf'));
    });
    host.querySelectorAll('[data-dl-docx]').forEach((btn) => {
      btn.addEventListener('click', () => downloadTemplate(btn.getAttribute('data-dl-docx'), 'docx'));
    });
    host.querySelectorAll('[data-set-estado]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-set-estado');
        const estado = btn.getAttribute('data-estado');
        const res = await DocumentService.updateItem(code, { estado });
        if (res.ok) {
          portfolio = res.portfolio;
          renderAll();
          UI.toast(`${code} → ${DocumentService.estadoLabel(estado)}`, 'success');
        }
      });
    });
  }

  function renderAnexos() {
    const host = document.getElementById('anexos-list');
    if (!host) return;
    const anexos = portfolio?.expediente?.anexosSugeridos || [];
    if (!anexos.length) {
      host.innerHTML = `<p class="text-muted" style="font-size:0.9rem;margin:0">Sin anexos pendientes. Al marcar documentos como pendientes, se sugieren anexos referenciales automáticamente.</p>`;
      return;
    }
    host.innerHTML = anexos
      .map(
        (a) => `
      <label class="anexo-item ${a.estado === 'hecho' ? 'is-done' : ''}">
        <input type="checkbox" data-anexo-doc="${UI.escapeHtml(a.documentoCodigo)}" data-anexo-text="${UI.escapeHtml(a.texto)}" ${
          a.estado === 'hecho' ? 'checked' : ''
        } />
        <span>
          <strong>${UI.escapeHtml(a.documentoCodigo)}</strong> — ${UI.escapeHtml(a.texto)}
        </span>
      </label>`
      )
      .join('');

    host.querySelectorAll('input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        DocumentService.toggleAnexo(
          cb.getAttribute('data-anexo-doc'),
          cb.getAttribute('data-anexo-text'),
          cb.checked
        );
        portfolio = DocumentService.getPortfolio();
        cb.closest('.anexo-item')?.classList.toggle('is-done', cb.checked);
        renderStats();
        UI.toast(cb.checked ? 'Anexo marcado' : 'Anexo desmarcado', 'info', 1800);
      });
    });
  }

  function openDetail(codigo) {
    selectedCodigo = codigo;
    const doc = portfolio?.items?.find((i) => i.codigo === codigo);
    if (!doc) return;

    const modal = document.getElementById('doc-detail-modal');
    const title = document.getElementById('doc-detail-title');
    const body = document.getElementById('doc-detail-body');
    title.textContent = `${doc.codigo} · ${doc.nombre}`;

    const checklist = (doc.checklistTramite || [])
      .map(
        (step) => `
      <label class="anexo-item ${doc.checklistHecho?.[step] ? 'is-done' : ''}">
        <input type="checkbox" data-check-step="${UI.escapeHtml(step)}" ${doc.checklistHecho?.[step] ? 'checked' : ''} />
        <span>${UI.escapeHtml(step)}</span>
      </label>`
      )
      .join('');

    const anexos = (doc.anexosReferenciales || [])
      .map(
        (ax) => `
      <label class="anexo-item ${doc.anexosHechos?.[ax] ? 'is-done' : ''}">
        <input type="checkbox" data-detail-anexo="${UI.escapeHtml(ax)}" ${doc.anexosHechos?.[ax] ? 'checked' : ''} />
        <span>${UI.escapeHtml(ax)}</span>
      </label>`
      )
      .join('');

    const plantilla = doc.plantillaExpediente
      ? `<div class="mt-2">
          <div style="font-weight:650;margin-bottom:0.35rem">${UI.escapeHtml(doc.plantillaExpediente.titulo)}</div>
          <ol class="doc-sections">${(doc.plantillaExpediente.secciones || [])
            .map((s) => `<li>${UI.escapeHtml(s)}</li>`)
            .join('')}</ol>
        </div>`
      : '';

    body.innerHTML = `
      <p class="text-secondary" style="font-size:0.9rem;margin:0 0 0.75rem">${UI.escapeHtml(doc.descripcion || '')}</p>
      <div class="doc-detail-grid">
        <div><span class="text-muted">Estado</span><br><strong>${UI.escapeHtml(
          DocumentService.estadoLabel(doc.estado)
        )}</strong></div>
        <div><span class="text-muted">Entidad</span><br><strong>${UI.escapeHtml(doc.entidad || '—')}</strong></div>
        <div><span class="text-muted">Norma</span><br><strong style="font-size:0.85rem">${UI.escapeHtml(
          doc.norma || '—'
        )}</strong></div>
        <div><span class="text-muted">Vigencia</span><br><strong>${
          doc.venceEl ? UI.escapeHtml(doc.venceEl) : '—'
        }</strong> <span class="text-muted">(${doc.validezMeses || '—'} meses)</span></div>
      </div>
      ${
        doc.bloqueado
          ? `<div class="alert-card warning mt-2" style="margin-top:0.75rem">
              <div class="alert-icon">⛓</div>
              <div>Bloqueado hasta completar: <strong>${(doc.bloqueadoPor || [])
                .map((c) => UI.escapeHtml(c))
                .join(', ')}</strong></div>
            </div>`
          : ''
      }
      ${
        doc.desbloquea?.length
          ? `<p class="text-muted mt-2" style="font-size:0.85rem">Al completarlo desbloquea: ${(doc.desbloquea || [])
              .map((c) => UI.escapeHtml(c))
              .join(', ')}</p>`
          : ''
      }
      <div class="template-download-bar mt-2">
        <span class="text-muted" style="font-size:0.8rem;font-weight:600">Descargar plantilla</span>
        <button type="button" class="btn btn-secondary btn-sm" data-detail-dl="pdf">PDF</button>
        <button type="button" class="btn btn-primary btn-sm" data-detail-dl="docx">Word (DOCX)</button>
      </div>
      <h3 class="section-title mt-3" style="font-size:0.95rem">Checklist de trámite</h3>
      <div class="anexos-list">${checklist || '<p class="text-muted">Sin pasos definidos.</p>'}</div>
      <h3 class="section-title mt-3" style="font-size:0.95rem">Anexos referenciales</h3>
      <div class="anexos-list">${anexos || '<p class="text-muted">Sin anexos.</p>'}</div>
      ${plantilla}
      ${
        !doc.esReferencial
          ? `<div class="wizard-actions mt-3" style="justify-content:flex-start">
              <button type="button" class="btn btn-secondary" data-detail-estado="pendiente">Pendiente</button>
              <button type="button" class="btn btn-secondary" data-detail-estado="en_proceso">En proceso</button>
              <button type="button" class="btn btn-primary" data-detail-estado="completo">Completo</button>
              <button type="button" class="btn btn-ghost" data-detail-estado="vencido">Vencido</button>
            </div>`
          : ''
      }
      ${
        doc.url
          ? `<p class="mt-2"><a href="${UI.escapeHtml(doc.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Abrir sitio de la entidad</a></p>`
          : ''
      }
    `;

    body.querySelectorAll('[data-check-step]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const step = cb.getAttribute('data-check-step');
        DocumentService.toggleChecklistStep(codigo, step, cb.checked);
        portfolio = DocumentService.getPortfolio();
        cb.closest('.anexo-item')?.classList.toggle('is-done', cb.checked);
        renderAll();
      });
    });

    body.querySelectorAll('[data-detail-anexo]').forEach((cb) => {
      cb.addEventListener('change', () => {
        DocumentService.toggleAnexo(codigo, cb.getAttribute('data-detail-anexo'), cb.checked);
        portfolio = DocumentService.getPortfolio();
        cb.closest('.anexo-item')?.classList.toggle('is-done', cb.checked);
        renderAnexos();
        renderStats();
      });
    });

    body.querySelectorAll('[data-detail-estado]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const estado = btn.getAttribute('data-detail-estado');
        const res = await DocumentService.updateItem(codigo, { estado });
        if (res.ok) {
          portfolio = res.portfolio;
          renderAll();
          openDetail(codigo);
          UI.toast(`Estado actualizado: ${DocumentService.estadoLabel(estado)}`, 'success');
        }
      });
    });

    body.querySelectorAll('[data-detail-dl]').forEach((btn) => {
      btn.addEventListener('click', () =>
        downloadTemplate(codigo, btn.getAttribute('data-detail-dl'))
      );
    });

    modal.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('doc-detail-modal')?.classList.add('hidden');
    selectedCodigo = null;
  }
})();
