// ============================================================
//  L-SENTRY · Documentos.gs  —  BdDocumentos & Kpi_Documentos
// ============================================================

// ─────────────────────────────────────────────────────────────
//  OBTENER DOCUMENTOS
// ─────────────────────────────────────────────────────────────

function actionGetDocumentos(payload) {
  const { idCliente, idUbicacion, idFormato, mes, pagina, porPagina } = payload || {};
  const POR_PAG = parseInt(porPagina) || 50;
  const PAG     = parseInt(pagina)    || 1;

  let filas = sheetToObjects(SHEETS.BD_DOCUMENTOS);

  if (idCliente)   filas = filas.filter(r => String(r['IDCliente'])   === String(idCliente));
  if (idUbicacion) filas = filas.filter(r => String(r['IDUbicacion']) === String(idUbicacion));
  if (idFormato)   filas = filas.filter(r => String(r['IDFormato'])   === String(idFormato));
  if (mes)         filas = filas.filter(r => String(r['Num_DMes'])    === String(mes));

  const total  = filas.length;
  const inicio = (PAG - 1) * POR_PAG;
  const datos  = filas.slice(inicio, inicio + POR_PAG);

  // Calcular % llenado en cada fila para facilitar el frontend
  const datosConPct = datos.map(r => {
    const campos   = parseInt(r['Campos_llenados'])   || 0;
    const tCampos  = parseInt(r['TCampos_llenados'])  || 0;
    const reqs     = parseInt(r['Requisitos_Llenados'])   || 0;
    const tReqs    = parseInt(r['Total_Requisitos'])  || 0;
    return {
      ...r,
      _pctCampos: tCampos > 0 ? Math.round((campos / tCampos) * 100) : 0,
      _pctReqs:   tReqs   > 0 ? Math.round((reqs   / tReqs)   * 100) : 0,
    };
  });

  const stats = calcularStatsDocumentos(filas);

  return {
    ok: true,
    data: {
      registros:    datosConPct,
      total:        total,
      pagina:       PAG,
      porPagina:    POR_PAG,
      totalPaginas: Math.ceil(total / POR_PAG),
      stats:        stats,
    }
  };
}

function calcularStatsDocumentos(filas) {
  const completos   = filas.filter(r => parseFloat(r['PCampos_Llenados']) >= 100).length;
  const incidencias = filas.filter(r => r['Incidencia del Documento'] && r['Incidencia del Documento'] !== '').length;
  const totalCampos = filas.reduce((s, r) => s + (parseInt(r['Campos_llenados']) || 0), 0);
  const pctPromedio = filas.length > 0
    ? Math.round(filas.reduce((s, r) => s + (parseFloat(r['PCampos_Llenados']) || 0), 0) / filas.length)
    : 0;

  return {
    total:       filas.length,
    completos:   completos,
    incompletos: filas.length - completos,
    incidencias: incidencias,
    totalCampos: totalCampos,
    pctPromedio: pctPromedio,
  };
}

// ─────────────────────────────────────────────────────────────
//  CREAR DOCUMENTO
//  Roles: Administrador, Capturista
// ─────────────────────────────────────────────────────────────

function actionCrearDocumento(payload, sesion) {
  if (!tienePermiso(sesion.rol, 'crear_documentos')) {
    return { ok: false, error: 'Sin permiso para crear documentos.' };
  }

  // Validaciones
  if (!payload.IDCliente)   return { ok: false, error: 'IDCliente es requerido.' };
  if (!payload.IDUbicacion) return { ok: false, error: 'IDUbicacion es requerido.' };
  if (!payload.IDFormato)   return { ok: false, error: 'IDFormato es requerido.' };

  const campos        = parseInt(payload.Campos_llenados)        || 0;
  const tCampos       = parseInt(payload.TCampos_llenados)       || 0;
  const reqs          = parseInt(payload.Requisitos_Llenados)    || 0;
  const tReqs         = parseInt(payload.Total_Requisitos)       || 0;
  const pctCampos     = tCampos > 0 ? Math.round((campos / tCampos) * 100) : 0;
  const pctReqsObl    = tReqs   > 0 ? Math.round((reqs   / tReqs)   * 100) : 0;

  const fechaDoc = payload.Fecha_Doc ? new Date(payload.Fecha_Doc) : new Date();
  const semana   = obtenerSemana(fechaDoc);
  const mes      = obtenerNombreMes(fechaDoc);
  const numMes   = fechaDoc.getMonth() + 1;

  const nuevoId = generarId('DOC', SHEETS.BD_DOCUMENTOS, 'IDDocumentacion');

  const fila = {
    IDDocumentacion:             nuevoId,
    IDCliente:                   payload.IDCliente,
    IDUbicacion:                 payload.IDUbicacion,
    IDFormato:                   payload.IDFormato,
    Fecha_Doc:                   payload.Fecha_Doc         || fechaHoy(),
    Campos_llenados:             campos,
    TCampos_llenados:            tCampos,
    PCampos_Llenados:            pctCampos,
    Requisitos_Llenados:         reqs,
    Total_Requisitos:            tReqs,
    PRequisitos_Obligatorios:    pctReqsObl,
    Num_DSem:                    semana,
    Nom_DMes:                    mes,
    Num_DMes:                    numMes,
    Observaciones:               payload.Observaciones     || '',
    Fecha_DRegistro:             fechaHoy(),
    IDRDocumentos:               '',
    Fecha_Modificacion:          '',
    Estatus:                     'Activo',
    Fecha_RCliente:              '',
    'Incidencia del Documento':  payload.Incidencia        || '',
    Replica_Cliente:             '',
    IDLogin:                     sesion.idLogin,
  };

  appendRow(SHEETS.BD_DOCUMENTOS, fila);

  // Actualizar KPI Documentos
  actualizarKpiDocumentos(fila, sesion);

  return { ok: true, data: { IDDocumentacion: nuevoId } };
}

// ─────────────────────────────────────────────────────────────
//  KPI DOCUMENTOS
// ─────────────────────────────────────────────────────────────

function actionGetKpiDocumentos(payload) {
  const { idCliente, idFormato, mes } = payload || {};
  let filas = sheetToObjects(SHEETS.KPI_DOCUMENTOS);

  if (idCliente) filas = filas.filter(r => String(r['IdCliente'])  === String(idCliente));
  if (idFormato) filas = filas.filter(r => String(r['IDFormato'])  === String(idFormato));
  if (mes)       filas = filas.filter(r => String(r['Num_DMes'])   === String(mes));

  return { ok: true, data: filas };
}

function actualizarKpiDocumentos(fila, sesion) {
  try {
    const kpiSheet   = getSheet(SHEETS.KPI_DOCUMENTOS);
    const kpiData    = kpiSheet.getDataRange().getValues();
    const kpiHeaders = kpiData[0];
    const clienteCol = kpiHeaders.indexOf('IdCliente');
    const formatoCol = kpiHeaders.indexOf('IDFormato');
    const mesCol     = kpiHeaders.indexOf('Num_DMes');
    const camposCol  = kpiHeaders.indexOf('Campos_llenados');
    const tCamposCol = kpiHeaders.indexOf('TCampos_llenados');
    const pctCol     = kpiHeaders.indexOf('PCampos_Llenados');

    for (let i = 1; i < kpiData.length; i++) {
      if (String(kpiData[i][clienteCol]) === String(fila.IDCliente) &&
          String(kpiData[i][formatoCol]) === String(fila.IDFormato) &&
          String(kpiData[i][mesCol])     === String(fila.Num_DMes)) {
        // Sumar campos
        const camposAcum  = (parseInt(kpiData[i][camposCol])  || 0) + fila.Campos_llenados;
        const tCamposAcum = (parseInt(kpiData[i][tCamposCol]) || 0) + fila.TCampos_llenados;
        const pctNuevo    = tCamposAcum > 0 ? Math.round((camposAcum / tCamposAcum) * 100) : 0;
        kpiSheet.getRange(i + 1, camposCol  + 1).setValue(camposAcum);
        kpiSheet.getRange(i + 1, tCamposCol + 1).setValue(tCamposAcum);
        kpiSheet.getRange(i + 1, pctCol     + 1).setValue(pctNuevo);
        return;
      }
    }

    // Nueva fila KPI
    const kpiId = generarId('KDOC', SHEETS.KPI_DOCUMENTOS, 'IDRDocumentos');
    const kpiFila = {
      IDRDocumentos:           kpiId,
      Num_DMes:                fila.Num_DMes,
      Nom_DMes:                fila.Nom_DMes,
      IdCliente:               fila.IDCliente,
      IDFormato:               fila.IDFormato,
      Campos_llenados:         fila.Campos_llenados,
      TCampos_llenados:        fila.TCampos_llenados,
      PCampos_Llenados:        fila.PCampos_Llenados,
      Requisitos_Llenados:     fila.Requisitos_Llenados,
      Total_Requisitos:        fila.Total_Requisitos,
      PRequisitos_Obligatorios: fila.PRequisitos_Obligatorios,
      Num_DAño:                new Date().getFullYear(),
      Observaciones:           '',
      Fecha_Control:           fechaHoy(),
      IDUbicacion:             fila.IDUbicacion,
    };
    appendRow(SHEETS.KPI_DOCUMENTOS, kpiFila);
  } catch (e) {
    Logger.log('actualizarKpiDocumentos error: ' + e.message);
  }
}