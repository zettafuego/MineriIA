/**
 * FormalizaAI — Diagnosis Engine
 * Motor de análisis simulado (IA).
 * Calcula % formalización, checklist, riesgo, tiempo, costo y próximos pasos.
 * Open/Closed: se extiende vía requisitos.json sin tocar la lógica core.
 */

const DiagnosisEngine = (() => {
  const { keys, get, set, loadJson } = StorageService;

  /** Normaliza valor de respuesta a cumplido / parcial / no */
  function statusFromValue(value) {
    if (value === true || value === 'si') return 'ok';
    if (value === 'proceso' || value === 'tramite' || value === 'parcial' || value === 'vencido') {
      return 'parcial';
    }
    return 'falta';
  }

  /**
   * Ejecuta el análisis a partir de las respuestas del wizard.
   * @param {object} respuestas - mapa campo -> valor
   * @returns {Promise<object>} resultado completo
   */
  async function analyze(respuestas) {
    const reqData = await loadJson('assets/json/requisitos.json');
    const requisitos = reqData.requisitos;
    const niveles = reqData.nivelesRiesgo;

    let score = 0;
    let maxScore = 0;
    const checklist = [];
    const faltantes = [];
    let tiempoDias = 0;
    let costoMin = 0;
    let costoMax = 0;

    for (const req of requisitos) {
      // Explosivos solo aplica si usa explosivos
      if (req.condicional && req.campo === 'usaExplosivos') {
        if (!respuestas.usaExplosivos) continue;
        // Si usa explosivos, el "campo" no es cumplimiento: hay que exigir el permiso
        maxScore += req.peso;
        // Sin dato de permiso en wizard: asumimos faltante (MVP)
        score += 0;
        checklist.push({
          id: req.id,
          codigo: req.codigo,
          nombre: req.nombre,
          estado: 'falta',
          entidad: req.entidad,
          prioridad: req.prioridad,
        });
        faltantes.push(req);
        tiempoDias += req.tiempoDias;
        costoMin += req.costoMin;
        costoMax += req.costoMax;
        continue;
      }

      maxScore += req.peso;
      const raw = respuestas[req.campo];
      const estado = statusFromValue(raw);

      if (estado === 'ok') {
        score += req.peso;
      } else if (estado === 'parcial') {
        score += req.peso * 0.45;
        faltantes.push(req);
        tiempoDias += Math.round(req.tiempoDias * 0.5);
        costoMin += Math.round(req.costoMin * 0.5);
        costoMax += Math.round(req.costoMax * 0.5);
      } else {
        faltantes.push(req);
        tiempoDias += req.tiempoDias;
        costoMin += req.costoMin;
        costoMax += req.costoMax;
      }

      checklist.push({
        id: req.id,
        codigo: req.codigo,
        nombre: req.nombre,
        estado,
        entidad: req.entidad,
        prioridad: req.prioridad,
      });
    }

    // Bonus por tipo de minería definido y región
    if (respuestas.tipoMineria) score += 2;
    if (respuestas.region) score += 2;
    maxScore += 4;

    // Trabajadores: si tiene muchos y sin supervisor, ya se penaliza vía checklist
    const porcentaje = Math.min(100, Math.round((score / maxScore) * 100));

    const riesgo = resolveRisk(porcentaje, niveles);
    const proximosPasos = buildNextSteps(checklist, faltantes, respuestas);
    const proximoPaso = proximosPasos[0] || {
      titulo: 'Mantener cumplimiento',
      descripcion: 'Tu formalización está avanzada. Revisa alertas periódicamente.',
    };

    const estadoLabel =
      porcentaje >= 85 ? 'Formalizado' : porcentaje >= 40 ? 'En formalización' : 'Inicio';

    const resultado = {
      id: `diag-${Date.now()}`,
      fecha: new Date().toISOString(),
      porcentaje,
      riesgo,
      tiempoEstimadoDias: Math.max(7, tiempoDias),
      tiempoLabel: formatDays(tiempoDias),
      costoMin,
      costoMax,
      costoLabel: formatCurrencyRange(costoMin, costoMax),
      checklist: checklist.sort((a, b) => a.prioridad - b.prioridad),
      documentosFaltantes: faltantes
        .sort((a, b) => a.prioridad - b.prioridad)
        .map((r) => ({
          codigo: r.codigo,
          nombre: r.nombre,
          entidad: r.entidad,
          tiempoDias: r.tiempoDias,
          costoMin: r.costoMin,
          costoMax: r.costoMax,
        })),
      proximosPasos,
      proximoPaso,
      estado: estadoLabel,
      respuestas: { ...respuestas },
      resumenIA: buildAiSummary(porcentaje, riesgo, faltantes, respuestas),
    };

    // Persistencia
    set(keys.RESULTADO, resultado);
    set(keys.RESPUESTAS, respuestas);
    set(keys.CHECKLIST, resultado.checklist);
    set(keys.PROGRESS, {
      porcentaje,
      estado: estadoLabel,
      updatedAt: resultado.fecha,
    });

    // Alertas derivadas
    const alertas = buildAlerts(resultado);
    set(keys.ALERTAS, alertas);

    // Portfolio documental + expediente referencial automático
    if (window.DocumentService?.syncFromDiagnosis) {
      try {
        const portfolio = await DocumentService.syncFromDiagnosis(resultado, respuestas);
        resultado.porcentajeDocumental = portfolio.porcentajeDocs;
        resultado.expedienteId = portfolio.expediente?.id;
        // Fusionar alertas de vigencia documental
        const vig = portfolio.expediente?.alertasVigencia || [];
        vig.slice(0, 3).forEach((v) => {
          alertas.push({
            id: `al-vig-${v.codigo}`,
            tipo: 'vencimiento',
            severidad: v.severidad,
            titulo: 'Vigencia documental',
            mensaje: v.mensaje,
            codigo: v.codigo,
            fecha: new Date().toISOString(),
          });
        });
        alertas.push({
          id: 'al-exp-ref',
          tipo: 'referencial',
          severidad: 'info',
          titulo: 'Expediente referencial listo',
          mensaje: `Se generó tu expediente maestro (${portfolio.porcentajeDocs}% docs). Revisa Documentos.`,
          codigo: 'EXPEDIENTE',
          fecha: new Date().toISOString(),
        });
        set(keys.ALERTAS, alertas);
        resultado.alertas = alertas;
      } catch (err) {
        console.warn('[Diagnosis] No se pudo sincronizar documentos', err);
      }
    }

    // Actualizar sesión del usuario
    if (window.AuthService?.getCurrentUser()) {
      await AuthService.updateProfile({
        porcentaje,
        estado: estadoLabel,
        region: labelRegion(respuestas.region) || AuthService.getCurrentUser().region,
        actividad: labelTipoMineria(respuestas.tipoMineria) || AuthService.getCurrentUser().actividad,
      });
    }

    return resultado;
  }

  function resolveRisk(porcentaje, niveles) {
    if (porcentaje >= niveles.bajo.min) {
      return { key: 'bajo', label: niveles.bajo.label, color: niveles.bajo.color };
    }
    if (porcentaje >= niveles.medio.min) {
      return { key: 'medio', label: niveles.medio.label, color: niveles.medio.color };
    }
    if (porcentaje >= niveles.alto.min) {
      return { key: 'alto', label: niveles.alto.label, color: niveles.alto.color };
    }
    return { key: 'critico', label: niveles.critico.label, color: niveles.critico.color };
  }

  function buildNextSteps(checklist, faltantes, respuestas) {
    const steps = [];
    const byCode = (code) => faltantes.find((f) => f.codigo === code);

    if (statusFromValue(respuestas.tieneRuc) !== 'ok') {
      steps.push({
        orden: 1,
        titulo: 'Obtener o regularizar RUC en SUNAT',
        descripcion: 'Base tributaria obligatoria para cualquier trámite minero formal.',
        codigo: 'RUC',
      });
    }
    if (statusFromValue(respuestas.tieneReinfo) !== 'ok') {
      steps.push({
        orden: 2,
        titulo: 'Inscribir o renovar REINFO',
        descripcion: 'Registro clave del proceso de formalización ante MINEM/DREM.',
        codigo: 'REINFO',
      });
    }
    if (statusFromValue(respuestas.tieneContrato) !== 'ok') {
      steps.push({
        orden: 3,
        titulo: 'Gestionar contrato de explotación',
        descripcion: 'Negocia y formaliza el vínculo con el titular de la concesión.',
        codigo: 'CONTRATO',
      });
    }
    if (statusFromValue(respuestas.tieneIgafom) !== 'ok') {
      steps.push({
        orden: 4,
        titulo: 'Elaborar y presentar IGAFOM',
        descripcion: 'Instrumento ambiental prioritario para formalización de PPM/MA.',
        codigo: 'IGAFOM',
      });
    }
    if (statusFromValue(respuestas.tieneInstrumentoAmbiental) !== 'ok') {
      steps.push({
        orden: 5,
        titulo: 'Completar Instrumento Ambiental',
        descripcion: 'DIA/EIA según escala. Coordina con consultor ambiental acreditado.',
        codigo: 'IA',
      });
    }
    if (statusFromValue(respuestas.tieneSupervisorSeguridad) !== 'ok') {
      steps.push({
        orden: 6,
        titulo: 'Implementar plan y supervisor de seguridad',
        descripcion: 'Reduce riesgo operativo y cumple normativa de seguridad minera.',
        codigo: 'PLAN_SEG',
      });
    }
    if (respuestas.usaExplosivos && byCode('EXPLOSIVOS')) {
      steps.push({
        orden: 7,
        titulo: 'Tramitar autorización de explosivos (SUCAMEC)',
        descripcion: 'Permiso y condiciones de polvorín y personal calificado.',
        codigo: 'EXPLOSIVOS',
      });
    }

    if (!steps.length) {
      steps.push({
        orden: 1,
        titulo: 'Auditoría de cumplimiento trimestral',
        descripcion: 'Mantén documentos vigentes y revisa alertas de vencimiento.',
        codigo: 'MANTENIMIENTO',
      });
    }

    return steps.slice(0, 6);
  }

  function buildAlerts(resultado) {
    const alerts = [];
    const now = Date.now();

    resultado.documentosFaltantes.slice(0, 4).forEach((doc, i) => {
      alerts.push({
        id: `al-pend-${doc.codigo}`,
        tipo: 'pendiente',
        severidad: i === 0 ? 'danger' : 'warning',
        titulo: 'Documento pendiente',
        mensaje: `Falta: ${doc.nombre} (${doc.entidad})`,
        codigo: doc.codigo,
        fecha: new Date(now - i * 3600000).toISOString(),
      });
    });

    // Simular vencimiento si tiene REINFO ok o parcial
    const reinfo = resultado.checklist.find((c) => c.codigo === 'REINFO');
    if (reinfo && reinfo.estado === 'ok') {
      alerts.push({
        id: 'al-venc-reinfo',
        tipo: 'vencimiento',
        severidad: 'warning',
        titulo: 'Documento próximo a vencer',
        mensaje: 'Tu constancia REINFO vence en 45 días. Planifica la renovación.',
        codigo: 'REINFO',
        fecha: new Date().toISOString(),
      });
    }

    if (resultado.porcentaje < 70) {
      alerts.push({
        id: 'al-ob-diag',
        tipo: 'obligacion',
        severidad: 'info',
        titulo: 'Nueva obligación',
        mensaje: 'Prioriza el IGAFOM y el contrato de explotación en tu plan 90 días.',
        codigo: 'PLAN',
        fecha: new Date().toISOString(),
      });
    }

    return alerts;
  }

  function buildAiSummary(porcentaje, riesgo, faltantes, respuestas) {
    const tipo = labelTipoMineria(respuestas.tipoMineria) || 'tu operación';
    const region = labelRegion(respuestas.region) || 'tu región';
    const top = faltantes.slice(0, 3).map((f) => f.nombre).join(', ');

    if (porcentaje >= 85) {
      return `Análisis completado: ${tipo} en ${region} presenta un nivel de formalización alto (${porcentaje}%). Riesgo ${riesgo.label}. Enfócate en mantenimiento y renovaciones.`;
    }
    if (porcentaje >= 45) {
      return `Análisis completado: ${tipo} en ${region} está en proceso de formalización (${porcentaje}%). Riesgo ${riesgo.label}. Prioridades: ${top || 'revisar checklist'}.`;
    }
    return `Análisis completado: ${tipo} en ${region} requiere atención inmediata (${porcentaje}%). Riesgo ${riesgo.label}. Documentos críticos faltantes: ${top || 'varios requisitos base'}.`;
  }

  function formatDays(days) {
    const d = Math.max(7, days || 0);
    if (d < 30) return `${d} días`;
    const months = Math.round(d / 30);
    if (months < 18) return `${months} mes${months > 1 ? 'es' : ''}`;
    return `${Math.round(d / 30)} meses`;
  }

  function formatCurrencyRange(min, max) {
    const fmt = (n) =>
      new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
        maximumFractionDigits: 0,
      }).format(n || 0);
    if (!min && !max) return 'S/ 0';
    return `${fmt(min)} – ${fmt(max)}`;
  }

  function labelRegion(id) {
    const map = {
      puno: 'Puno',
      arequipa: 'Arequipa',
      cusco: 'Cusco',
      'madre-de-dios': 'Madre de Dios',
      ayacucho: 'Ayacucho',
      apurimac: 'Apurímac',
      'la-libertad': 'La Libertad',
      otra: 'Otra región',
    };
    return map[id] || id || null;
  }

  function labelTipoMineria(id) {
    const map = {
      pequena: 'Pequeña Minería',
      artesanal: 'Minería Artesanal',
      consultor: 'Consultoría Minera',
    };
    return map[id] || id || null;
  }

  function getResultado() {
    return get(keys.RESULTADO, null);
  }

  function getRespuestas() {
    return get(keys.RESPUESTAS, null);
  }

  function getChecklist() {
    return get(keys.CHECKLIST, null);
  }

  function getAlertas() {
    return get(keys.ALERTAS, []);
  }

  /** Datos demo si el usuario aún no hizo diagnóstico */
  function getDemoDashboardData(user) {
    const porcentaje = user?.porcentaje ?? 0;
    return {
      porcentaje,
      proximoPaso: {
        titulo: porcentaje > 0 ? 'Continuar con documentos pendientes' : 'Realizar diagnóstico inteligente',
        descripcion:
          porcentaje > 0
            ? 'Revisa tu checklist y completa los requisitos faltantes.'
            : 'Responde 10 preguntas y obtén tu plan de formalización personalizado.',
      },
      checklist: getChecklist() || [],
      alertas: getAlertas() || [],
      resultado: getResultado(),
    };
  }

  return {
    analyze,
    getResultado,
    getRespuestas,
    getChecklist,
    getAlertas,
    getDemoDashboardData,
    formatCurrencyRange,
    formatDays,
    labelRegion,
    labelTipoMineria,
    statusFromValue,
  };
})();

window.DiagnosisEngine = DiagnosisEngine;
