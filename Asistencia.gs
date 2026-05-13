// ============================================================
//  L-SENTRY · Asistencia.gs  —  BdAsistencia & Kpi_Asistencia
// ============================================================

// ─────────────────────────────────────────────────────────────
//  OBTENER ASISTENCIA (con filtros opcionales)
// ─────────────────────────────────────────────────────────────

function actionGetAsistencia(payload) {
  const { idCliente, fecha, semana, mes, idUbicacion, pagina, porPagina } = payload || {};
  const POR_PAG = parseInt(porPagina) || 50;
  const PAG     = parseInt(pagina)    || 1;

  let filas = sheetToObjects(SHEETS.BD_ASISTENCIA);

  // Filtros dinámicos
  if (idCliente)   filas = filas.filter(r => String(r['IDCliente'])   === String(idCliente));
  if (idUbicacion) filas = filas.filter(r => String(r['IDUbicacion']) === String(idUbicacion));
  if (fecha)       filas = filas.filter(r => String(r['Fecha_Entrada']).startsWith(fecha));
  if (semana)      filas = filas.filter(r => String(r['Semana'])      === String(semana));
  if (mes)         filas = filas.filter(r => String(r['Mes'])         === String(mes));

  // Paginación
  const total  = filas.length;
  const inicio = (PAG - 1) * POR_PAG;
  const pagina_datos = filas.slice(inicio, inicio + POR_PAG);

  // Estadísticas rápidas del resultado actual
  const stats = calcularStatsAsistencia(filas);

  return {
    ok: true,
    data: {
      registros:   pagina_datos,
      total:       total,
      pagina:      PAG,
      porPagina:   POR_PAG,
      totalPaginas: Math.ceil(total / POR_PAG),
      stats:       stats,
    }
  };
}

function calcularStatsAsistencia(filas) {
  const hoy = fechaHoy();
  const hoy_filas = filas.filter(r => String(r['Fecha_Entrada']).startsWith(hoy.substring(0, 8)));
  return {
    total:       filas.length,
    presentes:   filas.filter(r => r['Hora_Entrada'] && !r['Incidencia del Elemto']).length,
    faltas:      filas.filter(r => String(r['Incidencia del Elemto']).toLowerCase().includes('falta')).length,
    adicionales: filas.filter(r => String(r['Incidencia del Elemto']).toLowerCase().includes('adicional')).length,
    penalizados: filas.filter(r => String(r['Penalizado']).toLowerCase() === 'si' || r['Penalizado'] === true).length,
  };
}

// ─────────────────────────────────────────────────────────────
//  CREAR REGISTRO DE ASISTENCIA
//  Roles permitidos: Administrador, Capturista
// ─────────────────────────────────────────────────────────────

function actionCrearAsistencia(payload, sesion) {
  if (!tienePermiso(sesion.rol, 'crear_asistencia')) {
    return { ok: false, error: 'Sin permiso para crear registros de asistencia.' };
  }

  // Validaciones mínimas
  if (!payload.Nombre_Completo)  return { ok: false, error: 'Nombre_Completo es requerido.' };
  if (!payload.IDCliente)        return { ok: false, error: 'IDCliente es requerido.' };
  if (!payload.IDUbicacion)      return { ok: false, error: 'IDUbicacion es requerido.' };
  if (!payload.Fecha_Entrada)    return { ok: false, error: 'Fecha_Entrada es requerida.' };

  const fechaObj = new Date(payload.Fecha_Entrada);
  const semana   = obtenerSemana(fechaObj);
  const mes      = obtenerNombreMes(fechaObj);
  const numMes   = fechaObj.getMonth() + 1;

  const nuevoId = generarId('ASS', SHEETS.BD_ASISTENCIA, 'IDAsistencia');

  const fila = {
    IDAsistencia:               nuevoId,
    IDCliente:                  payload.IDCliente,
    Fecha_Captura:              fechaHoy(),
    Semana:                     semana,
    Mes:                        mes,
    'Numero de Mes':            numMes,
    Nombre_Completo:            payload.Nombre_Completo,
    IDUbicacion:                payload.IDUbicacion,
    Fecha_Entrada:              payload.Fecha_Entrada       || '',
    Hora_Entrada:               payload.Hora_Entrada        || '',
    Fecha_Salida:               payload.Fecha_Salida        || '',
    Hora_Salida:                payload.Hora_Salida         || '',
    IDJornada:                  payload.IDJornada            || '',
    IDTurno:                    payload.IDTurno              || '',
    'Observaciones del Turno':  payload.Observaciones        || '',
    Ubicacion_Captura:          payload.Ubicacion_Captura    || '',
    Fecha_Registro:             fechaHoy(),
    Foto_Elemento:              payload.Foto_Elemento        || '',
    'Incidencia del Elemto':    payload.Incidencia           || '',
    Penalizado:                 payload.Penalizado           || 'No',
    Foto_Incidencia:            payload.Foto_Incidencia      || '',
    IDRAsistencia:              '',
    Fecha_Modificacion:         '',
    Replica_Cliente:            '',
    Estatus:                    'Activo',
    IDLogin:                    sesion.idLogin,
    Fecha_RCliente:             '',
  };

  appendRow(SHEETS.BD_ASISTENCIA, fila);

  // Actualizar KPI
  actualizarKpiAsistencia(fila, sesion);

  return { ok: true, data: { IDAsistencia: nuevoId } };
}

// ─────────────────────────────────────────────────────────────
//  EDITAR ASISTENCIA
//  Solo Administrador puede editar directamente.
//  Proveedor debe usar flujo de Solicitud de Cambio.
// ─────────────────────────────────────────────────────────────

function actionEditarAsistencia(payload, sesion) {
  if (!tienePermiso(sesion.rol, 'editar_asistencia')) {
    return { ok: false, error: 'No tienes permiso para editar asistencia directamente.' };
  }

  const { IDAsistencia } = payload;
  if (!IDAsistencia) return { ok: false, error: 'IDAsistencia requerido.' };

  const sheet   = getSheet(SHEETS.BD_ASISTENCIA);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf('IDAsistencia');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(IDAsistencia)) {
      // Actualizar campos enviados
      headers.forEach((h, colIdx) => {
        if (payload[h] !== undefined && h !== 'IDAsistencia') {
          sheet.getRange(i + 1, colIdx + 1).setValue(payload[h]);
        }
      });
      // Stamp de modificación
      const modCol = headers.indexOf('Fecha_Modificacion');
      const logCol = headers.indexOf('IDLogin');
      if (modCol >= 0) sheet.getRange(i + 1, modCol + 1).setValue(fechaHoy());
      if (logCol >= 0) sheet.getRange(i + 1, logCol + 1).setValue(sesion.idLogin);
      return { ok: true };
    }
  }
  return { ok: false, error: `Registro ${IDAsistencia} no encontrado.` };
}

// ─────────────────────────────────────────────────────────────
//  KPI ASISTENCIA
// ─────────────────────────────────────────────────────────────

function actionGetKpiAsistencia(payload) {
  const { idCliente, mes, anio } = payload || {};
  let filas = sheetToObjects(SHEETS.KPI_ASISTENCIA);

  if (idCliente) filas = filas.filter(r => String(r['IdCliente']) === String(idCliente));
  if (mes)       filas = filas.filter(r => String(r['Num_DMes'])  === String(mes));

  return { ok: true, data: filas };
}

/** Actualiza o crea resumen diario en Kpi_Asistencia */
function actualizarKpiAsistencia(fila, sesion) {
  try {
    const kpiSheet   = getSheet(SHEETS.KPI_ASISTENCIA);
    const kpiData    = kpiSheet.getDataRange().getValues();
    const kpiHeaders = kpiData[0];
    const fechaCol   = kpiHeaders.indexOf('Fecha_Resumen');
    const clienteCol = kpiHeaders.indexOf('IdCliente');
    const asistCol   = kpiHeaders.indexOf('Asistencia_Dia');

    // Buscar si ya existe resumen para este día/cliente
    for (let i = 1; i < kpiData.length; i++) {
      if (String(kpiData[i][fechaCol]) === String(fila.Fecha_Entrada) &&
          String(kpiData[i][clienteCol]) === String(fila.IDCliente)) {
        // Incrementar asistencia
        const actual = parseInt(kpiData[i][asistCol]) || 0;
        kpiSheet.getRange(i + 1, asistCol + 1).setValue(actual + 1);
        return;
      }
    }

    // Si no existe, crear nueva fila KPI
    const kpiId = generarId('KPI', SHEETS.KPI_ASISTENCIA, 'IDRAsistencia');
    const kpiFila = {
      IDRAsistencia:  kpiId,
      Fecha_Resumen:  fila.Fecha_Entrada,
      IdCliente:      fila.IDCliente,
      Asistencia_Dia: 1,
      Plantilla_Dia:  '',    // Se puede calcular con datos de Cliente
      Faltas_Dia:     0,
      Adicional_Dia:  0,
      Nivel_Asistencia: '',
      Num_DSem:       fila.Semana,
      Nom_DMes:       fila.Mes,
      Observaciones:  '',
      Num_DMes:       fila['Numero de Mes'],
    };
    appendRow(SHEETS.KPI_ASISTENCIA, kpiFila);
  } catch (e) {
    Logger.log('actualizarKpiAsistencia error: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────
//  HELPERS DE FECHA
// ─────────────────────────────────────────────────────────────

function obtenerSemana(fecha) {
  const inicio = new Date(fecha.getFullYear(), 0, 1);
  const dias   = Math.floor((fecha - inicio) / (24 * 60 * 60 * 1000));
  return Math.ceil((dias + inicio.getDay() + 1) / 7);
}

function obtenerNombreMes(fecha) {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return meses[fecha.getMonth()];
}