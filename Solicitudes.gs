// ============================================================
//  L-SENTRY · Solicitudes.gs
//  Flujo de cambios: Proveedor solicita → Seguridad Vial autoriza
// ============================================================

// ─────────────────────────────────────────────────────────────
//  ESTADOS DE SOLICITUD
// ─────────────────────────────────────────────────────────────
const ESTATUS_SOL = {
  PENDIENTE:  'Pendiente',
  APROBADA:   'Aprobada',
  RECHAZADA:  'Rechazada',
};

// Tipos de módulo que puede afectar una solicitud
const MODULOS_SOL = {
  ASISTENCIA: 'Asistencia',
  DOCUMENTO:  'Documento',
};

// ─────────────────────────────────────────────────────────────
//  CREAR SOLICITUD DE CAMBIO  (Proveedor)
// ─────────────────────────────────────────────────────────────

function actionCrearSolicitud(payload, sesion) {
  if (!tienePermiso(sesion.rol, 'crear_solicitud_cambio')) {
    return { ok: false, error: 'Solo el rol Proveedor puede crear solicitudes de cambio.' };
  }

  // Validaciones
  if (!payload.modulo)     return { ok: false, error: 'Módulo requerido (Asistencia | Documento).' };
  if (!payload.idRegistro) return { ok: false, error: 'ID del registro a modificar es requerido.' };
  if (!payload.cambios || Object.keys(payload.cambios).length === 0) {
    return { ok: false, error: 'Debes especificar al menos un campo a cambiar.' };
  }

  // Validar que el módulo sea válido
  const modulosValidos = Object.values(MODULOS_SOL);
  if (!modulosValidos.includes(payload.modulo)) {
    return { ok: false, error: `Módulo inválido. Usa: ${modulosValidos.join(', ')}` };
  }

  // Verificar que el registro exista
  const sheetNombre = payload.modulo === MODULOS_SOL.ASISTENCIA
    ? SHEETS.BD_ASISTENCIA : SHEETS.BD_DOCUMENTOS;
  const campoId = payload.modulo === MODULOS_SOL.ASISTENCIA
    ? 'IDAsistencia' : 'IDDocumentacion';

  const registros = sheetToObjects(sheetNombre);
  const registroActual = registros.find(r => String(r[campoId]) === String(payload.idRegistro));
  if (!registroActual) {
    return { ok: false, error: `Registro ${payload.idRegistro} no encontrado en ${payload.modulo}.` };
  }

  const nuevoId = generarId('SOL', SHEETS.SOLICITUDES, 'IDSolicitud');

  const solicitud = {
    IDSolicitud:        nuevoId,
    Modulo:             payload.modulo,
    IDRegistro:         payload.idRegistro,
    Cambios_Solicitados: JSON.stringify(payload.cambios),   // Guardamos JSON de campos
    Valores_Anteriores: JSON.stringify(
      // Capturar valores actuales de los campos que se quieren cambiar
      Object.keys(payload.cambios).reduce((acc, campo) => {
        acc[campo] = registroActual[campo] !== undefined ? registroActual[campo] : '';
        return acc;
      }, {})
    ),
    Justificacion:      payload.justificacion || '',
    IDLogin_Proveedor:  sesion.idLogin,
    Usuario_Proveedor:  sesion.usuario,
    Fecha_Solicitud:    fechaHoy(),
    Hora_Solicitud:     horaAhora(),
    Estatus:            ESTATUS_SOL.PENDIENTE,
    IDLogin_Resolutor:  '',
    Usuario_Resolutor:  '',
    Fecha_Resolucion:   '',
    Hora_Resolucion:    '',
    Comentario_Resolucion: '',
  };

  appendRow(SHEETS.SOLICITUDES, solicitud);

  // Notificar (log interno)
  Logger.log(`[SOLICITUD] ${nuevoId} creada por ${sesion.usuario} para ${payload.modulo} ${payload.idRegistro}`);

  return {
    ok: true,
    data: {
      IDSolicitud: nuevoId,
      mensaje: 'Solicitud enviada correctamente. Pendiente de autorización por Seguridad Vial.',
    }
  };
}

// ─────────────────────────────────────────────────────────────
//  OBTENER SOLICITUDES
//  - Proveedor: solo ve las suyas
//  - Seguridad Vial / Admin: ve todas (con filtro opcional)
// ─────────────────────────────────────────────────────────────

function actionGetSolicitudes(sesion) {
  let filas = sheetToObjects(SHEETS.SOLICITUDES);

  // Proveedor solo ve sus propias solicitudes
  if (sesion.rol === ROLES.PROVEEDOR) {
    filas = filas.filter(r => String(r['IDLogin_Proveedor']) === String(sesion.idLogin));
  }

  // Parsear JSON de cambios para facilitar el frontend
  const filasParseadas = filas.map(r => {
    try {
      r._cambios   = JSON.parse(r['Cambios_Solicitados'] || '{}');
      r._anteriores = JSON.parse(r['Valores_Anteriores']  || '{}');
    } catch (e) {
      r._cambios    = {};
      r._anteriores = {};
    }
    return r;
  });

  // Estadísticas rápidas
  const stats = {
    total:     filas.length,
    pendientes: filas.filter(r => r['Estatus'] === ESTATUS_SOL.PENDIENTE).length,
    aprobadas:  filas.filter(r => r['Estatus'] === ESTATUS_SOL.APROBADA).length,
    rechazadas: filas.filter(r => r['Estatus'] === ESTATUS_SOL.RECHAZADA).length,
  };

  return { ok: true, data: { solicitudes: filasParseadas, stats } };
}

// ─────────────────────────────────────────────────────────────
//  RESOLVER SOLICITUD  (Seguridad Vial / Admin)
//  decision: 'Aprobada' | 'Rechazada'
// ─────────────────────────────────────────────────────────────

function actionResolverSolicitud(payload, sesion) {
  if (!tienePermiso(sesion.rol, 'aprobar_solicitudes')) {
    return { ok: false, error: 'Solo Seguridad Vial o Administrador pueden resolver solicitudes.' };
  }

  const { IDSolicitud, decision, comentario } = payload;

  if (!IDSolicitud) return { ok: false, error: 'IDSolicitud requerido.' };
  if (![ESTATUS_SOL.APROBADA, ESTATUS_SOL.RECHAZADA].includes(decision)) {
    return { ok: false, error: 'decision debe ser "Aprobada" o "Rechazada".' };
  }

  // Buscar solicitud en la hoja
  const sheet   = getSheet(SHEETS.SOLICITUDES);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf('IDSolicitud');
  const estCol  = headers.indexOf('Estatus');

  let filaIdx = -1;
  let solicitudObj = null;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(IDSolicitud)) {
      filaIdx = i;
      solicitudObj = {};
      headers.forEach((h, ci) => { solicitudObj[h] = data[i][ci]; });
      break;
    }
  }

  if (filaIdx < 0) {
    return { ok: false, error: `Solicitud ${IDSolicitud} no encontrada.` };
  }

  if (solicitudObj['Estatus'] !== ESTATUS_SOL.PENDIENTE) {
    return { ok: false, error: `Esta solicitud ya fue resuelta (${solicitudObj['Estatus']}).` };
  }

  // Actualizar estatus en la hoja Solicitudes
  const camposActualizar = {
    Estatus:               decision,
    IDLogin_Resolutor:     sesion.idLogin,
    Usuario_Resolutor:     sesion.usuario,
    Fecha_Resolucion:      fechaHoy(),
    Hora_Resolucion:       horaAhora(),
    Comentario_Resolucion: comentario || '',
  };

  headers.forEach((h, ci) => {
    if (camposActualizar[h] !== undefined) {
      sheet.getRange(filaIdx + 1, ci + 1).setValue(camposActualizar[h]);
    }
  });

  // Si fue APROBADA → aplicar cambios al registro original
  if (decision === ESTATUS_SOL.APROBADA) {
    const resultado = aplicarCambiosAprobados(solicitudObj, sesion);
    if (!resultado.ok) {
      return { ok: false, error: 'Solicitud marcada como aprobada pero falló al aplicar cambios: ' + resultado.error };
    }
  }

  Logger.log(`[SOLICITUD] ${IDSolicitud} resuelta como ${decision} por ${sesion.usuario}`);

  return {
    ok: true,
    data: {
      IDSolicitud: IDSolicitud,
      decision:    decision,
      mensaje:     decision === ESTATUS_SOL.APROBADA
        ? 'Cambios aplicados correctamente al registro.'
        : 'Solicitud rechazada. No se realizaron cambios.',
    }
  };
}

// ─────────────────────────────────────────────────────────────
//  APLICAR CAMBIOS AL REGISTRO ORIGINAL  (solo si se aprueba)
// ─────────────────────────────────────────────────────────────

function aplicarCambiosAprobados(solicitudObj, sesion) {
  try {
    const modulo    = solicitudObj['Modulo'];
    const idRegistro = solicitudObj['IDRegistro'];
    let cambios = {};

    try {
      cambios = JSON.parse(solicitudObj['Cambios_Solicitados'] || '{}');
    } catch (e) {
      return { ok: false, error: 'No se pudo parsear Cambios_Solicitados.' };
    }

    // Determinar hoja y campo ID
    const sheetNombre = modulo === MODULOS_SOL.ASISTENCIA
      ? SHEETS.BD_ASISTENCIA : SHEETS.BD_DOCUMENTOS;
    const campoId = modulo === MODULOS_SOL.ASISTENCIA
      ? 'IDAsistencia' : 'IDDocumentacion';

    const sheet   = getSheet(sheetNombre);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf(campoId);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(idRegistro)) {
        // Aplicar cada campo del cambio aprobado
        headers.forEach((h, ci) => {
          if (cambios[h] !== undefined) {
            sheet.getRange(i + 1, ci + 1).setValue(cambios[h]);
          }
        });

        // Stamp de modificación + referencia a la solicitud aprobada
        const modCol  = headers.indexOf('Fecha_Modificacion');
        const logCol  = headers.indexOf('IDLogin');
        const repCol  = headers.indexOf('Replica_Cliente');

        if (modCol >= 0) sheet.getRange(i + 1, modCol + 1).setValue(fechaHoy());
        if (logCol >= 0) sheet.getRange(i + 1, logCol + 1).setValue(sesion.idLogin);
        if (repCol >= 0) sheet.getRange(i + 1, repCol + 1)
          .setValue(`Aprobado por ${sesion.usuario} · ${solicitudObj['IDSolicitud']}`);

        return { ok: true };
      }
    }

    return { ok: false, error: `Registro ${idRegistro} no encontrado en ${modulo}.` };
  } catch (e) {
    Logger.log('aplicarCambiosAprobados error: ' + e.message);
    return { ok: false, error: e.message };
  }
}