// ============================================================
//  L-SENTRY · Catalogos.gs  —  Catálogos, Usuarios & Dashboard
// ============================================================

// ─────────────────────────────────────────────────────────────
//  CATÁLOGOS GENÉRICOS
// ─────────────────────────────────────────────────────────────

function actionGetCatalogo(sheetKey) {
  const nombre = SHEETS[sheetKey];
  if (!nombre) return { ok: false, error: `Catálogo desconocido: ${sheetKey}` };
  const filas = sheetToObjects(nombre);
  // Filtrar solo activos si la hoja tiene columna Estatus
  const activos = filas.filter(r => !r['Estatus'] || String(r['Estatus']).toLowerCase() !== 'inactivo');
  return { ok: true, data: activos };
}

// ─────────────────────────────────────────────────────────────
//  USUARIOS
// ─────────────────────────────────────────────────────────────

function actionGetUsuarios() {
  const filas = sheetToObjects(SHEETS.USUARIO);
  // Nunca retornar contraseñas al frontend
  const seguros = filas.map(r => {
    const copia = { ...r };
    delete copia['Contraseña'];
    delete copia['Contraseños']; // nombre alternativo en tu schema
    return copia;
  });
  return { ok: true, data: seguros };
}

function actionCrearUsuario(payload, sesion) {
  if (!tienePermiso(sesion.rol, 'editar_usuarios')) {
    return { ok: false, error: 'Sin permiso para crear usuarios.' };
  }

  // Validaciones
  if (!payload.Correo)    return { ok: false, error: 'Correo requerido.' };
  if (!payload.Usuario)   return { ok: false, error: 'Usuario requerido.' };
  if (!payload.Contraseña) return { ok: false, error: 'Contraseña requerida.' };
  if (!payload.IDRol)     return { ok: false, error: 'IDRol requerido.' };

  // Verificar que el usuario no exista
  const existentes = sheetToObjects(SHEETS.USUARIO);
  const duplicado  = existentes.find(r =>
    String(r['Usuario']).toLowerCase() === String(payload.Usuario).toLowerCase() ||
    String(r['Correo']).toLowerCase()  === String(payload.Correo).toLowerCase()
  );
  if (duplicado) {
    return { ok: false, error: 'Ya existe un usuario con ese nombre o correo.' };
  }

  // Verificar que el rol sea válido
  const perfiles   = sheetToObjects(SHEETS.PERFIL);
  const perfilExiste = perfiles.find(p => String(p['IDRol']) === String(payload.IDRol));
  if (!perfilExiste) {
    return { ok: false, error: `IDRol ${payload.IDRol} no existe en la hoja Perfil.` };
  }

  const nuevoId = generarId('USR', SHEETS.USUARIO, 'IDUsuario');

  const fila = {
    IDUsuario:        nuevoId,
    Correo:           payload.Correo,
    'Nombre Completo': payload.Nombre_Completo || '',
    Usuario:          payload.Usuario,
    Contraseña:       payload.Contraseña,      // En producción: hashear antes de guardar
    IDRol:            payload.IDRol,
    Estatus:          'Activo',
    Fotografia:       payload.Fotografia        || '',
    Num_telefonico:   payload.Num_telefonico     || '',
    F_Creacion:       fechaHoy(),
    F_Modificacion:   '',
    IDLogin:          sesion.idLogin,
  };

  appendRow(SHEETS.USUARIO, fila);

  // Crear entrada en Login para que pueda iniciar sesión
  crearLoginEntry(fila, payload.Serie_Equipo || '');

  return { ok: true, data: { IDUsuario: nuevoId } };
}

function actionEditarUsuario(payload, sesion) {
  if (!tienePermiso(sesion.rol, 'editar_usuarios')) {
    return { ok: false, error: 'Sin permiso para editar usuarios.' };
  }

  const { IDUsuario } = payload;
  if (!IDUsuario) return { ok: false, error: 'IDUsuario requerido.' };

  const sheet   = getSheet(SHEETS.USUARIO);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf('IDUsuario');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(IDUsuario)) {
      headers.forEach((h, ci) => {
        // No permitir cambiar IDUsuario, F_Creacion ni IDLogin original
        if (['IDUsuario', 'F_Creacion'].includes(h)) return;
        if (payload[h] !== undefined) {
          sheet.getRange(i + 1, ci + 1).setValue(payload[h]);
        }
      });
      // Stamp modificación
      const modCol = headers.indexOf('F_Modificacion');
      if (modCol >= 0) sheet.getRange(i + 1, modCol + 1).setValue(fechaHoy());
      return { ok: true };
    }
  }
  return { ok: false, error: `Usuario ${IDUsuario} no encontrado.` };
}

/** Crea la fila correspondiente en hoja Login al crear un usuario nuevo */
function crearLoginEntry(usuario, serieEquipo) {
  try {
    const idLogin = generarId('LOG', SHEETS.LOGIN, 'IDLogin');
    const fila = {
      IDLogin:       idLogin,
      Serie_Equipo:  serieEquipo,
      Usuario:       usuario.Usuario,
      Contraseños:   usuario.Contraseña,
      IDRol:         usuario.IDRol,
      Imagen:        usuario.Fotografia || '',
      H_Entrada:     '',
      H_Salida:      '',
      Estado:        'inactivo',
    };
    appendRow(SHEETS.LOGIN, fila);
  } catch (e) {
    Logger.log('crearLoginEntry error: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────
//  RESUMEN IA
// ─────────────────────────────────────────────────────────────

function actionGetResumenIA(payload) {
  const { idCliente, mes } = payload || {};
  let filas = sheetToObjects(SHEETS.RESUMEN_IA);

  if (idCliente) filas = filas.filter(r => String(r['IDCliente']) === String(idCliente));
  if (mes)       filas = filas.filter(r => String(r['NumMes'])    === String(mes));

  // Ordenar por fecha descendente
  filas.sort((a, b) => new Date(b['Fecha_Resumen']) - new Date(a['Fecha_Resumen']));

  return { ok: true, data: filas };
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD  —  Datos consolidados para la pantalla principal
// ─────────────────────────────────────────────────────────────

function actionGetDashboard(sesion) {
  const hoy     = fechaHoy();
  const mesNum  = new Date().getMonth() + 1;

  // ── Asistencia de hoy ──
  const asistencia = sheetToObjects(SHEETS.BD_ASISTENCIA);
  const asistHoy   = asistencia.filter(r => {
    const fe = String(r['Fecha_Entrada'] || '');
    return fe.startsWith(hoy.slice(0, 6));  // dd/MM
  });

  const presentes   = asistHoy.filter(r => r['Hora_Entrada']).length;
  const faltas      = asistHoy.filter(r => String(r['Incidencia del Elemto']).toLowerCase().includes('falta')).length;
  const penalizados = asistHoy.filter(r => String(r['Penalizado']).toLowerCase() === 'si').length;

  // ── Documentos del mes ──
  const docs      = sheetToObjects(SHEETS.BD_DOCUMENTOS);
  const docsMes   = docs.filter(r => String(r['Num_DMes']) === String(mesNum));
  const completos = docsMes.filter(r => parseFloat(r['PCampos_Llenados']) >= 100).length;
  const pctDocs   = docsMes.length > 0
    ? Math.round(docsMes.reduce((s, r) => s + (parseFloat(r['PCampos_Llenados']) || 0), 0) / docsMes.length)
    : 0;

  // ── Solicitudes pendientes ──
  let solicitudesPendientes = 0;
  try {
    const sols = sheetToObjects(SHEETS.SOLICITUDES);
    solicitudesPendientes = sols.filter(r => r['Estatus'] === ESTATUS_SOL.PENDIENTE).length;
  } catch (e) { /* hoja aún no existe */ }

  // ── Actividad reciente (últimos 10 registros de asistencia) ──
  const recientes = asistencia
    .slice(-10)
    .reverse()
    .map(r => ({
      tipo:     'Asistencia',
      texto:    r['Nombre_Completo'],
      sub:      `${r['IDUbicacion']} · ${r['IDTurno']}`,
      hora:     r['Hora_Entrada'],
      incidencia: r['Incidencia del Elemto'] || '',
    }));

  // ── KPI Semana (últimas 4 entradas de Kpi_Asistencia) ──
  let kpiSemana = [];
  try {
    const kpi = sheetToObjects(SHEETS.KPI_ASISTENCIA);
    kpiSemana = kpi.slice(-4);
  } catch (e) {}

  // ── Datos filtrados según rol ──
  // Proveedor y Capturista ven resumen simplificado
  const esAdmin    = sesion.rol === ROLES.ADMIN;
  const esSegVial  = sesion.rol === ROLES.SEG_VIAL;

  return {
    ok: true,
    data: {
      kpis: {
        asistenciaHoy:          presentes,
        faltasHoy:              faltas,
        penalizadosHoy:         penalizados,
        pctDocumentosMes:       pctDocs,
        solicitudesPendientes:  (esAdmin || esSegVial) ? solicitudesPendientes : null,
        totalDocsCompletos:     completos,
        totalDocsMes:           docsMes.length,
      },
      actividadReciente: recientes,
      kpiSemana:         kpiSemana,
      rol:               sesion.rol,
    }
  };
}

// ─────────────────────────────────────────────────────────────
//  SETUP INICIAL  —  Crea hojas faltantes con headers correctos
//  Ejecutar una sola vez desde el editor de Apps Script
// ─────────────────────────────────────────────────────────────

function setupHojasSolicitudes() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Crear hoja Solicitudes_Cambio si no existe
  let solSheet = ss.getSheetByName(SHEETS.SOLICITUDES);
  if (!solSheet) {
    solSheet = ss.insertSheet(SHEETS.SOLICITUDES);
    const headers = [
      'IDSolicitud', 'Modulo', 'IDRegistro',
      'Cambios_Solicitados', 'Valores_Anteriores', 'Justificacion',
      'IDLogin_Proveedor', 'Usuario_Proveedor', 'Fecha_Solicitud', 'Hora_Solicitud',
      'Estatus',
      'IDLogin_Resolutor', 'Usuario_Resolutor', 'Fecha_Resolucion', 'Hora_Resolucion',
      'Comentario_Resolucion',
    ];
    solSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    solSheet.setFrozenRows(1);
    // Estilo del header
    solSheet.getRange(1, 1, 1, headers.length)
      .setBackground('#0D1117')
      .setFontColor('#06B6D4')
      .setFontWeight('bold');
    Logger.log('✅ Hoja Solicitudes_Cambio creada.');
  } else {
    Logger.log('ℹ️ Hoja Solicitudes_Cambio ya existe.');
  }

  // Verificar roles en Perfil
  const perfilSheet = ss.getSheetByName(SHEETS.PERFIL);
  if (perfilSheet) {
    const perfilData = perfilSheet.getDataRange().getValues();
    const rolesExistentes = perfilData.slice(1).map(r => r[1]); // Nom_Rol columna B

    const rolesRequeridos = Object.values(ROLES);
    const faltantes = rolesRequeridos.filter(r => !rolesExistentes.includes(r));
    if (faltantes.length > 0) {
      Logger.log('⚠️ Roles faltantes en hoja Perfil: ' + faltantes.join(', '));
      Logger.log('Agrégalos manualmente en la hoja Perfil con sus IDRol correspondientes.');
    } else {
      Logger.log('✅ Todos los roles están configurados en Perfil.');
    }
  }

  SpreadsheetApp.flush();
  Logger.log('✅ Setup completado.');
}
