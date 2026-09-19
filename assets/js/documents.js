/**
 * FormalizaAI — Document Service
 * Gestión documental: catálogo base, portfolio del usuario,
 * dependencias, anexos y expediente referencial automático.
 */

const DocumentService = (() => {
  const { keys, get, set, loadJson } = StorageService;

  const FALLBACK_CATALOG = {
    version: '2.0-fallback',
    categorias: [
      { id: 'tributario', label: 'Tributario', orden: 1 },
      { id: 'minero', label: 'Minero / REINFO', orden: 2 },
      { id: 'legal', label: 'Legal / Contractual', orden: 3 },
      { id: 'ambiental', label: 'Ambiental', orden: 4 },
      { id: 'seguridad', label: 'Seguridad minera', orden: 5 },
      { id: 'laboral', label: 'Laboral / Social', orden: 6 },
      { id: 'referencial', label: 'Expediente referencial', orden: 7 },
    ],
    etapasExpediente: [
      { id: 'base', label: 'Base legal y tributaria', orden: 1 },
      { id: 'minero', label: 'Registro minero', orden: 2 },
      { id: 'contractual', label: 'Derechos y contratos', orden: 3 },
      { id: 'ambiental', label: 'Gestión ambiental', orden: 4 },
      { id: 'operativo', label: 'Seguridad y operación', orden: 5 },
      { id: 'laboral', label: 'Personal y obligaciones', orden: 6 },
    ],
    documentos: [],
    reglasReferenciales: {
      generarTrasDiagnostico: true,
      paqueteMinimoBase: ['RUC', 'REINFO', 'CONTRATO', 'IGAFOM', 'PLAN_SEG'],
      alertarVencimientoDias: [60, 30, 15],
    },
  };

  let catalogCache = null;

  function persistRemote(portfolio) {
    if (!window.SupabaseService?.isConfigured?.() || !portfolio) return;
    SupabaseService.savePortfolio(portfolio).catch((err) =>
      console.warn('[Documents] No se pudo guardar el portfolio remoto', err)
    );
  }

  async function getCatalog(force = false) {
    if (catalogCache && !force) return catalogCache;
    try {
      const data = await loadJson('assets/json/documentos.json');
      if (data?.documentos?.length) {
        catalogCache = data;
        return catalogCache;
      }
    } catch (err) {
      console.warn('[Documents] Catálogo JSON no disponible, usando vacío + reglas locales.', err);
    }
    catalogCache = FALLBACK_CATALOG;
    return catalogCache;
  }

  function statusFromDiagnosisValue(value, codigo) {
    // Campos booleanos / semi-booleanos del wizard
    if (value === true || value === 'si') return 'completo';
    if (value === 'proceso' || value === 'tramite' || value === 'parcial') return 'en_proceso';
    if (value === 'vencido') return 'vencido';
    // Explosivos: si usa=true, el permiso se asume pendiente (no preguntamos si lo tiene)
    if (codigo === 'EXPLOSIVOS' && value === true) return 'pendiente';
    if (codigo === 'EXPLOSIVOS' && !value) return 'no_aplica';
    // Trabajadores: si hay número, documentos laborales pendientes hasta que el usuario los marque
    if ((codigo === 'PADRON' || codigo === 'ESSALUD') && value != null && value !== false) {
      return 'pendiente';
    }
    return 'pendiente';
  }

  function appliesDocument(doc, respuestas = {}) {
    if (doc.condicional && doc.condicionCampo) {
      return Boolean(respuestas[doc.condicionCampo]);
    }
    if (doc.codigo === 'EXPLOSIVOS') {
      return Boolean(respuestas.usaExplosivos);
    }
    return true;
  }

  /**
   * Construye o re-sincroniza el portfolio del usuario a partir del diagnóstico.
   */
  async function syncFromDiagnosis(resultado, respuestas) {
    const catalog = await getCatalog();
    const prev = get(keys.DOC_PORTFOLIO, null);
    const prevByCode = Object.fromEntries(
      (prev?.items || []).map((i) => [i.codigo, i])
    );

    const answers = respuestas || resultado?.respuestas || get(keys.RESPUESTAS, {}) || {};
    const checklist = resultado?.checklist || get(keys.CHECKLIST, []) || [];
    const checkByCode = Object.fromEntries(checklist.map((c) => [c.codigo, c]));

    const items = [];

    for (const doc of catalog.documentos) {
      if (!appliesDocument(doc, answers) && !doc.esReferencial) continue;

      const existing = prevByCode[doc.codigo];
      let estado = 'pendiente';

      if (doc.esReferencial) {
        estado = 'referencial';
      } else if (doc.campoDiagnostico && answers[doc.campoDiagnostico] !== undefined) {
        estado = statusFromDiagnosisValue(answers[doc.campoDiagnostico], doc.codigo);
      } else if (checkByCode[doc.codigo]) {
        const st = checkByCode[doc.codigo].estado;
        estado = st === 'ok' ? 'completo' : st === 'parcial' ? 'en_proceso' : 'pendiente';
      }

      // Si el usuario ya marcó progreso manual, no lo pisamos a "pendiente" peor sin razón
      if (existing?.estadoManual) {
        estado = existing.estado;
      } else if (existing && existing.estado === 'completo' && estado === 'pendiente') {
        // Mantener completo si el usuario lo cargó manualmente en una sesión previa
        if (existing.actualizadoPor === 'usuario') estado = 'completo';
      }

      // Ajustar vencidos simulados
      if (estado === 'completo' && existing?.venceEl) {
        const days = daysUntil(existing.venceEl);
        if (days < 0) estado = 'vencido';
      }

      const venceEl =
        existing?.venceEl ||
        (estado === 'completo' || estado === 'referencial'
          ? addMonths(new Date(), doc.validezMeses || 12).toISOString().slice(0, 10)
          : null);

      items.push({
        id: doc.id,
        codigo: doc.codigo,
        nombre: doc.nombre,
        categoria: doc.categoria,
        etapa: doc.etapa,
        entidad: doc.entidad,
        prioridad: doc.prioridad,
        peso: doc.peso || 0,
        requerido: doc.requerido !== false && !doc.esReferencial,
        esReferencial: Boolean(doc.esReferencial),
        autoGenerado: Boolean(doc.autoGenerado),
        dependeDe: doc.dependeDe || [],
        desbloquea: doc.desbloquea || [],
        anexosReferenciales: doc.anexosReferenciales || [],
        checklistTramite: doc.checklistTramite || [],
        plantillaExpediente: doc.plantillaExpediente || null,
        norma: doc.norma || '',
        descripcion: doc.descripcion || '',
        url: doc.url,
        validezMeses: doc.validezMeses || 12,
        estado,
        estadoManual: existing?.estadoManual || false,
        actualizadoPor: existing?.actualizadoPor || 'sistema',
        notas: existing?.notas || '',
        checklistHecho: existing?.checklistHecho || {},
        anexosHechos: existing?.anexosHechos || {},
        venceEl,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Si el catálogo no trajo docs (fallback vacío), generar mínimos desde checklist
    if (!items.length && checklist.length) {
      checklist.forEach((c, idx) => {
        items.push({
          id: c.id || `doc-${c.codigo}`,
          codigo: c.codigo,
          nombre: c.nombre,
          categoria: 'minero',
          etapa: 'minero',
          entidad: c.entidad,
          prioridad: c.prioridad || idx + 1,
          peso: 10,
          requerido: true,
          esReferencial: false,
          dependeDe: [],
          desbloquea: [],
          anexosReferenciales: [],
          checklistTramite: [],
          estado: c.estado === 'ok' ? 'completo' : c.estado === 'parcial' ? 'en_proceso' : 'pendiente',
          actualizadoPor: 'sistema',
          notas: '',
          checklistHecho: {},
          anexosHechos: {},
          venceEl: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
    }

    const portfolio = {
      version: 2,
      syncedAt: new Date().toISOString(),
      source: resultado?.id || prev?.source || 'manual',
      porcentajeDocs: 0,
      items: sortItems(items),
    };

    enrichBlocking(portfolio);
    portfolio.porcentajeDocs = computeDocPercent(portfolio.items);
    portfolio.expediente = buildExpedienteReferencial(portfolio, catalog, resultado, answers);

    set(keys.DOC_PORTFOLIO, portfolio);
    set(keys.DOC_EXPEDIENTE, portfolio.expediente);
    persistRemote(portfolio);
    return portfolio;
  }

  function enrichBlocking(portfolio) {
    const byCode = Object.fromEntries(portfolio.items.map((i) => [i.codigo, i]));
    portfolio.items.forEach((item) => {
      if (item.esReferencial || item.estado === 'no_aplica') {
        item.bloqueado = false;
        item.bloqueadoPor = [];
        return;
      }
      const missing = (item.dependeDe || []).filter((code) => {
        const dep = byCode[code];
        if (!dep || dep.estado === 'no_aplica') return false;
        return dep.estado !== 'completo';
      });
      item.bloqueado = missing.length > 0 && item.estado !== 'completo';
      item.bloqueadoPor = missing;
    });
  }

  function computeDocPercent(items) {
    const relevant = items.filter((i) => !i.esReferencial && i.estado !== 'no_aplica' && i.requerido);
    if (!relevant.length) return 0;
    let score = 0;
    let max = 0;
    relevant.forEach((i) => {
      const w = i.peso || 10;
      max += w;
      if (i.estado === 'completo') score += w;
      else if (i.estado === 'en_proceso') score += w * 0.45;
      else if (i.estado === 'vencido') score += w * 0.2;
    });
    return Math.min(100, Math.round((score / max) * 100));
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      if ((a.prioridad ?? 99) !== (b.prioridad ?? 99)) {
        return (a.prioridad ?? 99) - (b.prioridad ?? 99);
      }
      return String(a.codigo).localeCompare(String(b.codigo));
    });
  }

  /**
   * Genera el expediente referencial automático (índice + plan + anexos sugeridos).
   */
  function buildExpedienteReferencial(portfolio, catalog, resultado, respuestas) {
    const items = portfolio.items.filter((i) => i.estado !== 'no_aplica');
    const faltantes = items.filter(
      (i) => !i.esReferencial && (i.estado === 'pendiente' || i.estado === 'en_proceso' || i.estado === 'vencido')
    );
    const completos = items.filter((i) => i.estado === 'completo');

    // Anexos sugeridos de todos los docs pendientes (referenciales automáticos)
    const anexosSugeridos = [];
    const seenAnexo = new Set();
    faltantes.forEach((doc) => {
      (doc.anexosReferenciales || []).forEach((anexo) => {
        const key = `${doc.codigo}::${anexo}`;
        if (seenAnexo.has(key)) return;
        seenAnexo.add(key);
        anexosSugeridos.push({
          id: `anexo-${doc.codigo}-${seenAnexo.size}`,
          documentoCodigo: doc.codigo,
          documentoNombre: doc.nombre,
          texto: anexo,
          estado: doc.anexosHechos?.[anexo] ? 'hecho' : 'pendiente',
        });
      });
    });

    // Cadena de dependencias (grafo simple)
    const grafo = items
      .filter((i) => !i.esReferencial)
      .map((i) => ({
        codigo: i.codigo,
        dependeDe: i.dependeDe || [],
        desbloquea: i.desbloquea || [],
        estado: i.estado,
        bloqueado: i.bloqueado,
        bloqueadoPor: i.bloqueadoPor || [],
      }));

    // Orden topológico aproximado por prioridad + deps resueltas
    const plan90 = buildPlan90(items, resultado);

    // Paquetes por etapa
    const etapas = (catalog.etapasExpediente || []).map((et) => {
      const docs = items.filter((i) => i.etapa === et.id && !i.esReferencial);
      const ok = docs.filter((d) => d.estado === 'completo').length;
      return {
        ...et,
        total: docs.length,
        completos: ok,
        porcentaje: docs.length ? Math.round((ok / docs.length) * 100) : 0,
        codigos: docs.map((d) => d.codigo),
      };
    });

    const user = window.AuthService?.getCurrentUser?.() || {};
    const tipo = window.DiagnosisEngine?.labelTipoMineria?.(respuestas?.tipoMineria) || user.actividad || '—';
    const region = window.DiagnosisEngine?.labelRegion?.(respuestas?.region) || user.region || '—';

    return {
      id: `exp-${Date.now()}`,
      titulo: 'Expediente maestro de formalización',
      generadoEn: new Date().toISOString(),
      titular: user.nombre || 'Usuario',
      empresa: user.empresa || '',
      region,
      actividad: tipo,
      porcentajeDocs: portfolio.porcentajeDocs,
      porcentajeDiagnostico: resultado?.porcentaje ?? user.porcentaje ?? 0,
      resumen: {
        total: items.filter((i) => !i.esReferencial).length,
        completos: completos.length,
        pendientes: faltantes.filter((f) => f.estado === 'pendiente').length,
        enProceso: faltantes.filter((f) => f.estado === 'en_proceso').length,
        vencidos: faltantes.filter((f) => f.estado === 'vencido').length,
        bloqueados: items.filter((i) => i.bloqueado).length,
        anexosPendientes: anexosSugeridos.filter((a) => a.estado === 'pendiente').length,
      },
      indice: items.map((i, n) => ({
        orden: n + 1,
        codigo: i.codigo,
        nombre: i.nombre,
        categoria: i.categoria,
        etapa: i.etapa,
        estado: i.estado,
        entidad: i.entidad,
        bloqueado: i.bloqueado,
        bloqueadoPor: i.bloqueadoPor,
        esReferencial: i.esReferencial,
      })),
      etapas,
      grafoDependencias: grafo,
      anexosSugeridos,
      plan90,
      paqueteMinimo: (catalog.reglasReferenciales?.paqueteMinimoBase || []).map((code) => {
        const doc = items.find((i) => i.codigo === code);
        return {
          codigo: code,
          nombre: doc?.nombre || code,
          estado: doc?.estado || 'pendiente',
          listo: doc?.estado === 'completo',
        };
      }),
      alertasVigencia: buildVigenciaAlerts(items, catalog.reglasReferenciales?.alertarVencimientoDias || [60, 30, 15]),
      textoPortada: buildPortadaText(user, region, tipo, portfolio, resultado),
    };
  }

  function buildPlan90(items, resultado) {
    const actionable = items
      .filter(
        (i) =>
          !i.esReferencial &&
          i.estado !== 'completo' &&
          i.estado !== 'no_aplica'
      )
      .sort((a, b) => {
        // Primero desbloqueados, luego por prioridad
        if (a.bloqueado !== b.bloqueado) return a.bloqueado ? 1 : -1;
        return (a.prioridad ?? 99) - (b.prioridad ?? 99);
      });

    const phases = [
      { id: '0-30', label: 'Días 1–30 · Base y desbloqueo', dias: [1, 30], items: [] },
      { id: '31-60', label: 'Días 31–60 · Núcleo formalización', dias: [31, 60], items: [] },
      { id: '61-90', label: 'Días 61–90 · Cierre y operativos', dias: [61, 90], items: [] },
    ];

    actionable.forEach((doc, idx) => {
      const phase = idx < 2 ? phases[0] : idx < 5 ? phases[1] : phases[2];
      phase.items.push({
        codigo: doc.codigo,
        nombre: doc.nombre,
        entidad: doc.entidad,
        estado: doc.estado,
        bloqueado: doc.bloqueado,
        bloqueadoPor: doc.bloqueadoPor,
        acciones: (doc.checklistTramite || []).slice(0, 3),
      });
    });

    // Si diagnóstico trae próximos pasos, alinear
    if (resultado?.proximosPasos?.length) {
      phases[0].nota = resultado.proximosPasos[0]?.descripcion || null;
    }

    return phases;
  }

  function buildVigenciaAlerts(items, thresholds) {
    const alerts = [];
    items.forEach((item) => {
      if (!item.venceEl || item.estado === 'no_aplica') return;
      if (item.estado !== 'completo' && item.estado !== 'vencido' && item.estado !== 'referencial') return;
      const d = daysUntil(item.venceEl);
      if (d < 0) {
        alerts.push({
          codigo: item.codigo,
          nombre: item.nombre,
          venceEl: item.venceEl,
          dias: d,
          severidad: 'danger',
          mensaje: `${item.nombre} venció hace ${Math.abs(d)} días.`,
        });
      } else {
        const hit = [...thresholds].sort((a, b) => a - b).find((t) => d <= t);
        if (hit != null) {
          alerts.push({
            codigo: item.codigo,
            nombre: item.nombre,
            venceEl: item.venceEl,
            dias: d,
            severidad: d <= 15 ? 'danger' : 'warning',
            mensaje: `${item.nombre} vence en ${d} días (${item.venceEl}).`,
          });
        }
      }
    });
    return alerts.sort((a, b) => a.dias - b.dias);
  }

  function buildPortadaText(user, region, tipo, portfolio, resultado) {
    const r = portfolio.porcentajeDocs;
    const nPend = portfolio.items.filter(
      (i) => !i.esReferencial && (i.estado === 'pendiente' || i.estado === 'en_proceso')
    ).length;
    return (
      `Expediente de ${(user.nombre || 'titular').trim()} · ${tipo} en ${region}. ` +
      `Avance documental ${r}%. ` +
      (resultado ? `Diagnóstico ${resultado.porcentaje}% (${resultado.riesgo?.label || '—'}). ` : '') +
      `${nPend} pieza(s) por completar. Generado automáticamente por FormalizaAI.`
    );
  }

  function getPortfolio() {
    return get(keys.DOC_PORTFOLIO, null);
  }

  function getExpediente() {
    return get(keys.DOC_EXPEDIENTE, null) || getPortfolio()?.expediente || null;
  }

  async function ensurePortfolio() {
    let portfolio = getPortfolio();
    if (portfolio?.items?.length) {
      enrichBlocking(portfolio);
      return portfolio;
    }
    const resultado = get(keys.RESULTADO, null);
    const respuestas = get(keys.RESPUESTAS, null) || resultado?.respuestas || {};
    return syncFromDiagnosis(resultado, respuestas);
  }

  /**
   * Actualiza estado de un documento del portfolio (acción del usuario).
   */
  async function updateItem(codigo, patch = {}) {
    const portfolio = await ensurePortfolio();
    const idx = portfolio.items.findIndex((i) => i.codigo === codigo);
    if (idx === -1) return { ok: false, error: 'Documento no encontrado en el portfolio.' };

    const item = { ...portfolio.items[idx], ...patch, updatedAt: new Date().toISOString() };

    if (patch.estado) {
      item.estadoManual = true;
      item.actualizadoPor = 'usuario';
      if (patch.estado === 'completo' && !item.venceEl) {
        item.venceEl = addMonths(new Date(), item.validezMeses || 12).toISOString().slice(0, 10);
      }
    }

    portfolio.items[idx] = item;
    enrichBlocking(portfolio);
    portfolio.porcentajeDocs = computeDocPercent(portfolio.items);
    portfolio.syncedAt = new Date().toISOString();

    const catalog = await getCatalog();
    const resultado = get(keys.RESULTADO, null);
    const respuestas = get(keys.RESPUESTAS, null) || resultado?.respuestas || {};
    portfolio.expediente = buildExpedienteReferencial(portfolio, catalog, resultado, respuestas);

    portfolio.items = sortItems(portfolio.items);
    set(keys.DOC_PORTFOLIO, portfolio);
    set(keys.DOC_EXPEDIENTE, portfolio.expediente);

    persistRemote(portfolio);

    return { ok: true, portfolio, item };
  }

  function toggleChecklistStep(codigo, stepText, done) {
    const portfolio = getPortfolio();
    if (!portfolio) return { ok: false };
    const item = portfolio.items.find((i) => i.codigo === codigo);
    if (!item) return { ok: false };
    item.checklistHecho = { ...(item.checklistHecho || {}), [stepText]: done };
    item.updatedAt = new Date().toISOString();
    // Si todos los pasos del checklist están hechos y estaba pendiente → en_proceso
    if (item.checklistTramite?.length) {
      const all = item.checklistTramite.every((s) => item.checklistHecho[s]);
      if (all && item.estado === 'pendiente') {
        item.estado = 'en_proceso';
        item.estadoManual = true;
        item.actualizadoPor = 'usuario';
      }
    }
    enrichBlocking(portfolio);
    portfolio.porcentajeDocs = computeDocPercent(portfolio.items);
    set(keys.DOC_PORTFOLIO, portfolio);
    persistRemote(portfolio);
    return { ok: true, item, portfolio };
  }

  function toggleAnexo(codigo, anexoText, done) {
    const portfolio = getPortfolio();
    if (!portfolio) return { ok: false };
    const item = portfolio.items.find((i) => i.codigo === codigo);
    if (!item) return { ok: false };
    item.anexosHechos = { ...(item.anexosHechos || {}), [anexoText]: done };
    item.updatedAt = new Date().toISOString();
    set(keys.DOC_PORTFOLIO, portfolio);
    // refrescar expediente anexos
    if (portfolio.expediente) {
      portfolio.expediente.anexosSugeridos = (portfolio.expediente.anexosSugeridos || []).map((a) => {
        if (a.documentoCodigo === codigo && a.texto === anexoText) {
          return { ...a, estado: done ? 'hecho' : 'pendiente' };
        }
        return a;
      });
      set(keys.DOC_EXPEDIENTE, portfolio.expediente);
      set(keys.DOC_PORTFOLIO, portfolio);
    }
    persistRemote(portfolio);
    return { ok: true, item };
  }

  /** Regenera solo el expediente referencial sin perder estados manuales */
  async function regenerateExpediente() {
    const portfolio = await ensurePortfolio();
    const catalog = await getCatalog();
    const resultado = get(keys.RESULTADO, null);
    const respuestas = get(keys.RESPUESTAS, null) || resultado?.respuestas || {};
    enrichBlocking(portfolio);
    portfolio.porcentajeDocs = computeDocPercent(portfolio.items);
    portfolio.expediente = buildExpedienteReferencial(portfolio, catalog, resultado, respuestas);
    portfolio.syncedAt = new Date().toISOString();
    set(keys.DOC_PORTFOLIO, portfolio);
    set(keys.DOC_EXPEDIENTE, portfolio.expediente);
    persistRemote(portfolio);
    return portfolio;
  }

  function getStats(portfolio) {
    const p = portfolio || getPortfolio();
    if (!p) {
      return {
        total: 0,
        completos: 0,
        pendientes: 0,
        enProceso: 0,
        vencidos: 0,
        bloqueados: 0,
        porcentajeDocs: 0,
        anexos: 0,
      };
    }
    const items = p.items.filter((i) => !i.esReferencial && i.estado !== 'no_aplica');
    return {
      total: items.length,
      completos: items.filter((i) => i.estado === 'completo').length,
      pendientes: items.filter((i) => i.estado === 'pendiente').length,
      enProceso: items.filter((i) => i.estado === 'en_proceso').length,
      vencidos: items.filter((i) => i.estado === 'vencido').length,
      bloqueados: items.filter((i) => i.bloqueado).length,
      porcentajeDocs: p.porcentajeDocs || 0,
      anexos: p.expediente?.resumen?.anexosPendientes ?? 0,
    };
  }

  function estadoLabel(estado) {
    const map = {
      completo: 'Completo',
      en_proceso: 'En proceso',
      pendiente: 'Pendiente',
      vencido: 'Vencido',
      bloqueado: 'Bloqueado',
      referencial: 'Referencial',
      no_aplica: 'No aplica',
    };
    return map[estado] || estado;
  }

  function estadoClass(estado, bloqueado) {
    if (bloqueado && estado !== 'completo') return 'doc-bloqueado';
    const map = {
      completo: 'doc-ok',
      en_proceso: 'doc-proceso',
      pendiente: 'doc-pendiente',
      vencido: 'doc-vencido',
      referencial: 'doc-ref',
      no_aplica: 'doc-na',
    };
    return map[estado] || 'doc-pendiente';
  }

  function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + (months || 0));
    return d;
  }

  function daysUntil(isoDate) {
    const end = new Date(isoDate);
    const now = new Date();
    end.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.round((end - now) / 86400000);
  }

  /** Texto exportable del expediente (para copiar / simular descarga) */
  function exportExpedienteText(expediente) {
    const exp = expediente || getExpediente();
    if (!exp) return 'Sin expediente generado. Completa el diagnóstico o abre Documentos.';

    const lines = [
      '══════════════════════════════════════',
      '  FORMALIZAAI — EXPEDIENTE REFERENCIAL',
      '══════════════════════════════════════',
      exp.textoPortada,
      '',
      `Generado: ${exp.generadoEn}`,
      `Titular: ${exp.titular}`,
      `Empresa: ${exp.empresa || '—'}`,
      `Región / Actividad: ${exp.region} · ${exp.actividad}`,
      `Avance documental: ${exp.porcentajeDocs}% | Diagnóstico: ${exp.porcentajeDiagnostico}%`,
      '',
      '—— ÍNDICE ——',
      ...exp.indice.map(
        (i) =>
          `${String(i.orden).padStart(2, '0')}. [${i.estado.toUpperCase()}] ${i.codigo} — ${i.nombre}` +
          (i.bloqueado ? ` (bloqueado por: ${(i.bloqueadoPor || []).join(', ')})` : '')
      ),
      '',
      '—— PAQUETE MÍNIMO BASE ——',
      ...exp.paqueteMinimo.map((p) => `• ${p.listo ? '✓' : '○'} ${p.codigo} — ${p.nombre}`),
      '',
      '—— PLAN 90 DÍAS ——',
      ...exp.plan90.flatMap((ph) => [
        ph.label,
        ...(ph.items.length
          ? ph.items.map(
              (it) =>
                `  - ${it.codigo}: ${it.nombre}${it.bloqueado ? ' [bloqueado]' : ''} (${it.entidad || '—'})`
            )
          : ['  (sin ítems en esta fase)']),
        '',
      ]),
      '—— ANEXOS REFERENCIALES SUGERIDOS ——',
      ...exp.anexosSugeridos.map(
        (a) => `• [${a.estado}] (${a.documentoCodigo}) ${a.texto}`
      ),
      '',
      '—— ALERTAS DE VIGENCIA ——',
      ...(exp.alertasVigencia?.length
        ? exp.alertasVigencia.map((a) => `• ${a.mensaje}`)
        : ['• Sin alertas de vigencia']),
      '',
      'Documento referencial automático · FormalizaAI MVP',
    ];
    return lines.join('\n');
  }

  return {
    getCatalog,
    syncFromDiagnosis,
    ensurePortfolio,
    getPortfolio,
    getExpediente,
    updateItem,
    toggleChecklistStep,
    toggleAnexo,
    regenerateExpediente,
    getStats,
    estadoLabel,
    estadoClass,
    exportExpedienteText,
    buildExpedienteReferencial,
  };
})();

window.DocumentService = DocumentService;
