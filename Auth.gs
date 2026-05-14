// ============================================================
//  L-SENTRY · Auth.gs  —  Autenticación & Sesión
// ============================================================

// Duración de sesión en minutos
const SESSION_MINUTES = 480; // 8 horas

// ─────────────────────────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────────────────────────

function actionLogin(payload) {
  const { usuario, password } = payload;

  if (!usuario || !password) {
    return { ok: false, error: 'Usuario y contraseña son requeridos.' };
  }

  // Buscar en hoja Login
  const logins = sheetToObjects(SHEETS.LOGIN);
  const loginRow = logins.find(r =>
    String(r['Usuario']).trim().toLowerCase() === usuario.trim().toLowerCase()
  );

  if (!loginRow) {
    return { ok: false, error: 'Usuario no encontrado.' };
  }

  // Verificar contraseña (comparación directa; en producción usa hash)
  if (String(loginRow['Contraseña']).trim() !== String(password).trim()) {
    return { ok: false, error: 'Contraseña incorrecta.' };
  }

  // Verificar estado
  if (String(loginRow['Estado']).trim().toLowerCase() !== 'Activo') {
    return { ok: false, error: 'Tu cuenta está inactiva. Contacta al administrador.' };
  }

  // Obtener rol desde tabla Perfil
  const perfiles = sheetToObjects(SHEETS.PERFIL);
  const perfil   = perfiles.find(p => String(p['IDRol']) === String(loginRow['IDRol']));
  const nomRol   = perfil ? String(perfil['Nom_Rol']).trim() : '';

  if (!nomRol) {
    return { ok: false, error: 'Rol no configurado para este usuario.' };
  }

  // Obtener vistas permitidas para el rol (Admin_Vista)
  const vistas = getVistasRol(String(loginRow['IDRol']));

  // Registrar hora de entrada en la hoja Login
  registrarEntradaLogin(loginRow['IDLogin'], logins);

  // Crear sesión en PropertiesService (por usuario de Apps Script)
  const sesionData = {
    idLogin:   String(loginRow['IDLogin']),
    usuario:   String(loginRow['Usuario']).trim(),
    idRol:     String(loginRow['IDRol']),
    rol:       nomRol,
    imagen:    String(loginRow['Imagen'] || ''),
    vistas:    vistas,
    expira:    new Date().getTime() + SESSION_MINUTES * 60 * 1000,
  };

  // Guardamos en PropertiesService (UserProperties persiste por usuario GAS)
  PropertiesService.getUserProperties().setProperty(
    'lsentry_session',
    JSON.stringify(sesionData)
  );

  return {
    ok:   true,
    data: {
      usuario: sesionData.usuario,
      rol:     sesionData.rol,
      vistas:  sesionData.vistas,
      idLogin: sesionData.idLogin,
    }
  };
}

// ─────────────────────────────────────────────────────────────
//  LOGOUT
// ─────────────────────────────────────────────────────────────

function actionLogout() {
  const sesion = getSesion();
  if (sesion) {
    registrarSalidaLogin(sesion.idLogin);
  }
  PropertiesService.getUserProperties().deleteProperty('lsentry_session');
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
//  OBTENER SESIÓN ACTIVA
// ─────────────────────────────────────────────────────────────

function getSesion() {
  try {
    const raw = PropertiesService.getUserProperties().getProperty('lsentry_session');
    if (!raw) return null;
    const sesion = JSON.parse(raw);
    // Verificar expiración
    if (new Date().getTime() > sesion.expira) {
      PropertiesService.getUserProperties().deleteProperty('lsentry_session');
      return null;
    }
    return sesion;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
//  VISTAS POR ROL  (Admin_Vista)
// ─────────────────────────────────────────────────────────────

function getVistasRol(idRol) {
  try {
    const adminVista = sheetToObjects(SHEETS.ADMIN_VISTA);
    return adminVista
      .filter(v => String(v['IDRol']) === String(idRol))
      .map(v => ({
        id:     String(v['IDVistaWiew']),
        nombre: String(v['Nombre_Vista']),
        icono:  String(v['Icono']),
      }));
  } catch (e) {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  REGISTRO EN HOJA LOGIN
// ─────────────────────────────────────────────────────────────

function registrarEntradaLogin(idLogin, logins) {
  try {
    const sheet   = getSheet(SHEETS.LOGIN);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('IDLogin');
    const entCol  = headers.indexOf('H_Entrada');
    const estCol  = headers.indexOf('Estado');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(idLogin)) {
        if (entCol >= 0) sheet.getRange(i + 1, entCol + 1).setValue(horaAhora());
        if (estCol >= 0) sheet.getRange(i + 1, estCol + 1).setValue('activo');
        break;
      }
    }
  } catch (e) {
    Logger.log('registrarEntradaLogin error: ' + e.message);
  }
}

function registrarSalidaLogin(idLogin) {
  try {
    const sheet   = getSheet(SHEETS.LOGIN);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('IDLogin');
    const salCol  = headers.indexOf('H_Salida');
    const estCol  = headers.indexOf('Estado');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(idLogin)) {
        if (salCol >= 0) sheet.getRange(i + 1, salCol + 1).setValue(horaAhora());
        if (estCol >= 0) sheet.getRange(i + 1, estCol + 1).setValue('cerrado');
        break;
      }
    }
  } catch (e) {
    Logger.log('registrarSalidaLogin error: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────
//  LOG DE ACCESO (para Admin)
// ─────────────────────────────────────────────────────────────

function actionGetLoginLog() {
  const filas = sheetToObjects(SHEETS.LOGIN);
  // Retornamos sin contraseñas
  const seguro = filas.map(r => ({
    IDLogin:      r['IDLogin'],
    Usuario:      r['Usuario'],
    Serie_Equipo: r['Serie_Equipo'],
    IDRol:        r['IDRol'],
    Imagen:       r['Imagen'],
    H_Entrada:    r['H_Entrada'],
    H_Salida:     r['H_Salida'],
    Estado:       r['Estado'],
  }));
  return { ok: true, data: seguro };
}