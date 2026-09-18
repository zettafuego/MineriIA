/**
 * FormalizaAI — Template Service
 * Plantillas descargables PDF y DOCX por documento y expediente completo.
 * PDF: jsPDF (CDN). DOCX: OOXML mínimo vía JSZip (CDN).
 */

const TemplateService = (() => {
  function getUser() {
    return window.AuthService?.getCurrentUser?.() || {};
  }

  function getPortfolio() {
    return window.DocumentService?.getPortfolio?.() || null;
  }

  function getExpediente() {
    return window.DocumentService?.getExpediente?.() || getPortfolio()?.expediente || null;
  }

  function getResultado() {
    return window.DiagnosisEngine?.getResultado?.() || null;
  }

  function todayLabel() {
    return new Date().toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function slug(str) {
    return String(str || 'doc')
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñ]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  function estadoLabel(estado) {
    return window.DocumentService?.estadoLabel?.(estado) || estado || '—';
  }

  /**
   * Modelo de plantilla unificado (secciones con líneas).
   * @returns {{ title: string, subtitle: string, meta: object, sections: {heading:string, lines:string[]}[], footer: string, filenameBase: string }}
   */
  function buildTemplateModel(codigo) {
    const user = getUser();
    const portfolio = getPortfolio();
    const expediente = getExpediente();
    const resultado = getResultado();
    const isFull = !codigo || codigo === 'EXPEDIENTE' || codigo === 'FULL';

    if (isFull) {
      return buildExpedienteModel(user, portfolio, expediente, resultado);
    }

    const item = portfolio?.items?.find((i) => i.codigo === codigo);
    if (!item) {
      throw new Error(`No hay datos de plantilla para ${codigo}. Genera el portfolio en Documentos.`);
    }
    return buildDocumentModel(item, user, portfolio, expediente, resultado);
  }

  function buildDocumentModel(item, user, portfolio, expediente, resultado) {
    const plantilla = item.plantillaExpediente || {
      titulo: `Ficha de expediente — ${item.codigo}`,
      secciones: ['Identificación', 'Estado del trámite', 'Anexos', 'Observaciones'],
    };

    const checklistLines = (item.checklistTramite || []).map(
      (s) => `${item.checklistHecho?.[s] ? '[x]' : '[ ]'} ${s}`
    );
    const anexoLines = (item.anexosReferenciales || []).map(
      (s) => `${item.anexosHechos?.[s] ? '[x]' : '[ ]'} ${s}`
    );

    const sections = [
      {
        heading: '1. Identificación del titular',
        lines: [
          `Titular: ${user.nombre || '—'}`,
          `Email: ${user.email || '—'}`,
          `Empresa / razón social: ${user.empresa || '—'}`,
          `Teléfono: ${user.telefono || '—'}`,
          `Región: ${user.region || expediente?.region || '—'}`,
          `Actividad: ${user.actividad || expediente?.actividad || '—'}`,
        ],
      },
      {
        heading: '2. Datos del documento',
        lines: [
          `Código: ${item.codigo}`,
          `Nombre: ${item.nombre}`,
          `Categoría: ${item.categoria || '—'}`,
          `Etapa del expediente: ${item.etapa || '—'}`,
          `Entidad competente: ${item.entidad || '—'}`,
          `Base normativa: ${item.norma || '—'}`,
          `Estado actual: ${estadoLabel(item.estado)}`,
          `Prioridad: ${item.prioridad ?? '—'}`,
          `Vigencia estimada: ${item.validezMeses || '—'} meses`,
          `Fecha de vencimiento: ${item.venceEl || 'Pendiente de definir'}`,
          item.bloqueado
            ? `Bloqueado por: ${(item.bloqueadoPor || []).join(', ') || 'dependencias'}`
            : 'Bloqueos: ninguno',
          item.desbloquea?.length
            ? `Al completar desbloquea: ${item.desbloquea.join(', ')}`
            : 'Desbloquea: —',
        ],
      },
      {
        heading: '3. Descripción y objetivo',
        lines: [
          item.descripcion || 'Sin descripción.',
          '',
          'Uso de esta plantilla: completar los campos en blanco, adjuntar evidencias y archivar en el expediente maestro.',
        ],
      },
      {
        heading: '4. Secciones de la ficha (rellenar)',
        lines: (plantilla.secciones || []).flatMap((sec, i) => [
          `${i + 1}. ${sec}`,
          '   _______________________________________________',
          '   _______________________________________________',
          '',
        ]),
      },
      {
        heading: '5. Checklist de trámite',
        lines: checklistLines.length ? checklistLines : ['(Sin pasos definidos en catálogo)'],
      },
      {
        heading: '6. Anexos referenciales',
        lines: anexoLines.length
          ? anexoLines.concat(['', 'Otros anexos: ________________________________'])
          : ['(Sin anexos referenciales)', 'Otros anexos: ________________________________'],
      },
      {
        heading: '7. Control de calidad / firmas',
        lines: [
          'Elaborado por: _______________________  Fecha: ________',
          'Revisado por:  _______________________  Fecha: ________',
          'Aprobado por:  _______________________  Fecha: ________',
          '',
          'Observaciones:',
          '________________________________________________',
          '________________________________________________',
        ],
      },
    ];

    if (resultado) {
      sections.push({
        heading: '8. Contexto del diagnóstico FormalizaAI',
        lines: [
          `Fecha diagnóstico: ${resultado.fecha ? new Date(resultado.fecha).toLocaleString('es-PE') : '—'}`,
          `% formalización: ${resultado.porcentaje ?? '—'}%`,
          `Riesgo: ${resultado.riesgo?.label || '—'}`,
          `Tiempo estimado brechas: ${resultado.tiempoLabel || '—'}`,
          `Costo orientativo: ${resultado.costoLabel || '—'}`,
          portfolio ? `Avance documental portfolio: ${portfolio.porcentajeDocs ?? 0}%` : '',
        ].filter(Boolean),
      });
    }

    return {
      title: plantilla.titulo || `Plantilla — ${item.codigo}`,
      subtitle: 'Plantilla referencial de formalización minera · FormalizaAI',
      meta: {
        codigo: item.codigo,
        generado: todayLabel(),
        titular: user.nombre || '—',
      },
      sections,
      footer:
        'Documento referencial generado por FormalizaAI. No reemplaza formularios oficiales de SUNAT, MINEM, DREM, SENACE ni SUCAMEC. Verifique requisitos vigentes ante la autoridad competente.',
      filenameBase: `plantilla-${slug(item.codigo)}-${slug(user.nombre || 'usuario')}`,
    };
  }

  function buildExpedienteModel(user, portfolio, expediente, resultado) {
    const exp = expediente || {};
    const items = (portfolio?.items || []).filter((i) => i.estado !== 'no_aplica');

    const indiceLines = (exp.indice || items).map((i, n) => {
      const ord = i.orden || n + 1;
      const est = estadoLabel(i.estado);
      const block = i.bloqueado ? ` [BLOQUEADO: ${(i.bloqueadoPor || []).join(', ')}]` : '';
      return `${String(ord).padStart(2, '0')}. [${est}] ${i.codigo} — ${i.nombre}${block}`;
    });

    const packLines = (exp.paqueteMinimo || []).map(
      (p) => `${p.listo ? '[x]' : '[ ]'} ${p.codigo} — ${p.nombre}`
    );

    const planLines = [];
    (exp.plan90 || []).forEach((ph) => {
      planLines.push(ph.label);
      if (!ph.items?.length) planLines.push('  (sin ítems)');
      else {
        ph.items.forEach((it) => {
          planLines.push(
            `  - ${it.codigo}: ${it.nombre}${it.bloqueado ? ' [bloqueado]' : ''} (${it.entidad || '—'})`
          );
          (it.acciones || []).slice(0, 2).forEach((a) => planLines.push(`      · ${a}`));
        });
      }
      planLines.push('');
    });

    const anexoLines = (exp.anexosSugeridos || []).map(
      (a) => `${a.estado === 'hecho' ? '[x]' : '[ ]'} (${a.documentoCodigo}) ${a.texto}`
    );

    const etapaLines = (exp.etapas || []).map(
      (e) => `${e.label}: ${e.completos}/${e.total} (${e.porcentaje}%)`
    );

    const vigLines = (exp.alertasVigencia || []).map((a) => `! ${a.mensaje}`);

    const sections = [
      {
        heading: '1. Portada',
        lines: [
          exp.textoPortada ||
            `Expediente de ${user.nombre || 'titular'} · ${user.actividad || '—'} en ${user.region || '—'}.`,
          '',
          `Titular: ${user.nombre || exp.titular || '—'}`,
          `Empresa: ${user.empresa || exp.empresa || '—'}`,
          `Email: ${user.email || '—'}`,
          `Teléfono: ${user.telefono || '—'}`,
          `Región / actividad: ${exp.region || user.region || '—'} · ${exp.actividad || user.actividad || '—'}`,
          `Fecha de generación: ${todayLabel()}`,
          `ID expediente: ${exp.id || '—'}`,
        ],
      },
      {
        heading: '2. Resumen de avance',
        lines: [
          `Avance documental: ${exp.porcentajeDocs ?? portfolio?.porcentajeDocs ?? 0}%`,
          `Diagnóstico formalización: ${exp.porcentajeDiagnostico ?? resultado?.porcentaje ?? user.porcentaje ?? 0}%`,
          resultado ? `Riesgo: ${resultado.riesgo?.label || '—'} · Tiempo: ${resultado.tiempoLabel || '—'}` : '',
          resultado ? `Costo orientativo: ${resultado.costoLabel || '—'}` : '',
          '',
          `Total piezas: ${exp.resumen?.total ?? items.filter((i) => !i.esReferencial).length}`,
          `Completos: ${exp.resumen?.completos ?? '—'}`,
          `Pendientes: ${exp.resumen?.pendientes ?? '—'}`,
          `En proceso: ${exp.resumen?.enProceso ?? '—'}`,
          `Vencidos: ${exp.resumen?.vencidos ?? '—'}`,
          `Bloqueados: ${exp.resumen?.bloqueados ?? '—'}`,
          `Anexos pendientes: ${exp.resumen?.anexosPendientes ?? '—'}`,
        ].filter((l) => l !== ''),
      },
      {
        heading: '3. Paquete mínimo base',
        lines: packLines.length ? packLines : ['(Sin paquete mínimo generado)'],
      },
      {
        heading: '4. Avance por etapa',
        lines: etapaLines.length ? etapaLines : ['(Sin etapas)'],
      },
      {
        heading: '5. Índice del expediente',
        lines: indiceLines.length ? indiceLines : ['(Portfolio vacío)'],
      },
      {
        heading: '6. Plan referencial 90 días',
        lines: planLines.length ? planLines : ['(Sin plan — complete el diagnóstico)'],
      },
      {
        heading: '7. Anexos referenciales sugeridos',
        lines: anexoLines.length ? anexoLines : ['(Sin anexos pendientes sugeridos)'],
      },
      {
        heading: '8. Alertas de vigencia',
        lines: vigLines.length ? vigLines : ['Sin alertas de vigencia registradas.'],
      },
      {
        heading: '9. Matriz de dependencias (resumen)',
        lines: (exp.grafoDependencias || items.filter((i) => !i.esReferencial))
          .map((g) => {
            const deps = (g.dependeDe || []).join(', ') || '—';
            return `${g.codigo}: depende de [${deps}] · estado ${estadoLabel(g.estado)}`;
          })
          .concat(['', 'Nota: respetar el orden de desbloqueo para evitar observaciones de entidad.']) ,
      },
      {
        heading: '10. Declaración y control',
        lines: [
          'Declaro que la información consignada es referencial y será verificada ante las entidades competentes.',
          '',
          'Firma del titular: _______________________  DNI: ______________',
          'Fecha: ______________',
          '',
          'Uso interno FormalizaAI / consultor: _______________________',
        ],
      },
    ];

    return {
      title: 'Expediente maestro de formalización',
      subtitle: 'Plantilla referencial completa · FormalizaAI',
      meta: {
        codigo: 'EXPEDIENTE',
        generado: todayLabel(),
        titular: user.nombre || '—',
      },
      sections,
      footer:
        'Expediente referencial automático FormalizaAI. Orientativo para gestión interna y preparación de trámites. No constituye documento oficial de formalización minera.',
      filenameBase: `expediente-formalizaai-${slug(user.nombre || 'usuario')}-${new Date()
        .toISOString()
        .slice(0, 10)}`,
    };
  }

  /* ---------- PDF (jsPDF) ---------- */

  function ensureJsPdf() {
    const mod = window.jspdf || window.jsPDF;
    if (!mod) throw new Error('jsPDF no está cargado. Revisa la conexión a internet / CDN.');
    return mod.jsPDF || mod;
  }

  /** Helvetica de jsPDF no trae acentos: normalizamos para PDF (DOCX sí conserva UTF-8). */
  function pdfSafe(str) {
    return String(str ?? '')
      .replace(/[áàäâ]/g, 'a')
      .replace(/[ÁÀÄÂ]/g, 'A')
      .replace(/[éèëê]/g, 'e')
      .replace(/[ÉÈËÊ]/g, 'E')
      .replace(/[íìïî]/g, 'i')
      .replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[óòöô]/g, 'o')
      .replace(/[ÓÒÖÔ]/g, 'O')
      .replace(/[úùüû]/g, 'u')
      .replace(/[ÚÙÜÛ]/g, 'U')
      .replace(/ñ/g, 'n')
      .replace(/Ñ/g, 'N')
      .replace(/¿/g, '?')
      .replace(/¡/g, '!')
      .replace(/·/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
  }

  function downloadPdf(codigo) {
    const model = buildTemplateModel(codigo);
    const JsPDF = ensureJsPdf();
    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    const margin = 16;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = pageW - margin * 2;
    let y = margin;

    const ensureSpace = (need = 10) => {
      if (y + need > pageH - 18) {
        doc.addPage();
        y = margin;
        drawHeaderBar(doc, model, margin, pageW, true);
        y = margin + 14;
      }
    };

    drawHeaderBar(doc, model, margin, pageW, false);
    y = margin + 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 118, 110);
    const titleLines = doc.splitTextToSize(pdfSafe(model.title), maxW);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 6 + 2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafe(model.subtitle), margin, y);
    y += 5;
    doc.text(
      pdfSafe(
        `Codigo: ${model.meta.codigo}  |  Titular: ${model.meta.titular}  |  ${model.meta.generado}`
      ),
      margin,
      y
    );
    y += 8;

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 8;

    model.sections.forEach((sec) => {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      const hLines = doc.splitTextToSize(pdfSafe(sec.heading), maxW);
      doc.text(hLines, margin, y);
      y += hLines.length * 5.5 + 2;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);

      (sec.lines || []).forEach((line) => {
        const text = line === '' ? ' ' : pdfSafe(line);
        const wrapped = doc.splitTextToSize(text, maxW);
        ensureSpace(wrapped.length * 4.8 + 2);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 4.8 + 1.2;
      });
      y += 4;
    });

    ensureSpace(16);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const foot = doc.splitTextToSize(pdfSafe(model.footer), maxW);
    doc.text(foot, margin, y);

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`FormalizaAI | pag. ${i}/${pages}`, pageW - margin, pageH - 8, { align: 'right' });
    }

    const filename = `${model.filenameBase}.pdf`;
    doc.save(filename);
    return { ok: true, filename, format: 'pdf' };
  }

  function drawHeaderBar(doc, model, margin, pageW, compact) {
    doc.setFillColor(15, 118, 110);
    doc.rect(0, 0, pageW, compact ? 10 : 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('FormalizaAI', margin, compact ? 6.5 : 7.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(pdfSafe(model.meta.codigo || 'DOC'), pageW - margin, compact ? 6.5 : 7.5, {
      align: 'right',
    });
    doc.setTextColor(15, 23, 42);
  }

  /* ---------- DOCX (OOXML + JSZip) ---------- */

  function ensureJSZip() {
    if (!window.JSZip) throw new Error('JSZip no está cargado. Revisa la conexión a internet / CDN.');
    return window.JSZip;
  }

  function xmlEscape(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function paragraphXml(text, opts = {}) {
    const {
      bold = false,
      size = 20, // half-points (20 = 10pt)
      color = '334155',
      spacingAfter = 80,
      heading = false,
    } = opts;
    const t = xmlEscape(text === '' ? ' ' : text);
    const rPr = `
      <w:rPr>
        ${bold || heading ? '<w:b/>' : ''}
        <w:sz w:val="${heading ? size + 4 : size}"/>
        <w:szCs w:val="${heading ? size + 4 : size}"/>
        <w:color w:val="${heading ? '0F766E' : color}"/>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      </w:rPr>`;
    return `
      <w:p>
        <w:pPr>
          <w:spacing w:after="${spacingAfter}" w:line="276" w:lineRule="auto"/>
          ${heading ? '<w:keepNext/>' : ''}
        </w:pPr>
        <w:r>
          ${rPr}
          <w:t xml:space="preserve">${t}</w:t>
        </w:r>
      </w:p>`;
  }

  function buildDocumentXml(model) {
    let body = '';
    body += paragraphXml('FormalizaAI — Plantilla referencial', {
      bold: true,
      size: 18,
      color: '0F766E',
      spacingAfter: 40,
    });
    body += paragraphXml(model.title, { bold: true, size: 28, color: '0F172A', spacingAfter: 60, heading: true });
    body += paragraphXml(model.subtitle, { size: 18, color: '64748B', spacingAfter: 40 });
    body += paragraphXml(
      `Código: ${model.meta.codigo}  |  Titular: ${model.meta.titular}  |  ${model.meta.generado}`,
      { size: 18, color: '64748B', spacingAfter: 200 }
    );

    model.sections.forEach((sec) => {
      body += paragraphXml(sec.heading, {
        bold: true,
        size: 22,
        color: '0F766E',
        spacingAfter: 100,
        heading: true,
      });
      (sec.lines || []).forEach((line) => {
        body += paragraphXml(line, { size: 20, color: '334155', spacingAfter: 40 });
      });
      body += paragraphXml(' ', { size: 10, spacingAfter: 60 });
    });

    body += paragraphXml(model.footer, { size: 16, color: '94A3B8', spacingAfter: 0 });

    body += `
      <w:sectPr>
        <w:pgSz w:w="11906" w:h="16838"/>
        <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/>
      </w:sectPr>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${body}
  </w:body>
</w:document>`;
  }

  async function downloadDocx(codigo) {
    const model = buildTemplateModel(codigo);
    const JSZip = ensureJSZip();
    const zip = new JSZip();

    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    );

    zip.folder('_rels').file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    );

    const word = zip.folder('word');
    word.file('document.xml', buildDocumentXml(model));
    word.folder('_rels').file(
      'document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
    );

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const filename = `${model.filenameBase}.docx`;
    triggerDownload(blob, filename);
    return { ok: true, filename, format: 'docx' };
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function download(codigo, format) {
    const fmt = String(format || 'pdf').toLowerCase();
    if (fmt === 'pdf') return downloadPdf(codigo);
    if (fmt === 'docx' || fmt === 'word' || fmt === 'doc') return downloadDocx(codigo);
    throw new Error(`Formato no soportado: ${format}`);
  }

  /** Lista de plantillas disponibles según portfolio */
  function listAvailable() {
    const portfolio = getPortfolio();
    const list = [
      {
        codigo: 'EXPEDIENTE',
        nombre: 'Expediente maestro completo',
        descripcion: 'Portada, índice, plan 90 días, anexos y dependencias',
      },
    ];
    (portfolio?.items || [])
      .filter((i) => i.estado !== 'no_aplica')
      .forEach((i) => {
        list.push({
          codigo: i.codigo,
          nombre: i.nombre,
          descripcion: i.plantillaExpediente?.titulo || `Ficha ${i.codigo}`,
          estado: i.estado,
        });
      });
    return list;
  }

  return {
    buildTemplateModel,
    downloadPdf,
    downloadDocx,
    download,
    listAvailable,
  };
})();

window.TemplateService = TemplateService;
