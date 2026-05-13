// ============================================================
//  L-SENTRY · Code.gs  —  Router principal & Web App Entry
//  Google Apps Script · Web App desplegada como URL pública
// ============================================================

// ── ID DE TU GOOGLE SPREADSHEET ──────────────────────────────
const SPREADSHEET_ID = 'REEMPLAZA_CON_TU_SPREADSHEET_ID';

// ── NOMBRES DE HOJAS (deben coincidir exactamente) ────────────
const SHEETS = {
  LOGIN:          'Login',
  USUARIO:        'Usuario',
  PERFIL:         'Perfil',
  ADMIN_VISTA:    'Admin_Vista',
  BD_ASISTENCIA:  'BdAsistencia',
  KPI_ASISTENCIA: 'Kpi_Asistencia',
  BD_DOCUMENTOS:  'BdDocumentos',
  KPI_DOCUMENTOS: 'Kpi_Documentos',
  UBICACION:      'Ubicacion',
  CLIENTE:        'Cliente',
  TURNO:          'Turno',
  JORNADA:        'Jornada',
  FORMATOS:       'Formatos',
  RESUMEN_IA:     'Resumen_IA',
  HOME:           'Home',
  SOLICITUDES:    'Solicitudes_Cambio',   // Nueva hoja para flujo Proveedor→SeguridadVial
};

// ── ROLES ─────────────────────────────────────────────────────
const ROLES = {
  ADMIN:          'Administrador',
  CAPTURISTA:     'Capturista',
  PROVEEDOR:      'Proveedor',
  SEG_VIAL:       'Seguridad Vial',
};

// ── PERMISOS POR ROL ──────────────────────────────────────────
// Define qué acciones puede ejecutar cada rol.
// El frontend también filtra vistas, pero el backend SIEMPRE valida.
const PERMISOS = {
  [ROLES.ADMIN]: [
    'ver_dashboard', 'ver_asistencia', 'editar_asistencia',
    'ver_documentos', 'editar_documentos',
    'ver_kpi', 'ver_resumen_ia',
    'ver_usuarios', 'editar_usuarios',
    'ver_ubicaciones', 'editar_ubicaciones',
    'ver_clientes', 'editar_clientes',
    'ver_turnos', 'editar_turnos',
    'ver_formatos', 'editar_formatos',
    'ver_solicitudes', 'aprobar_solicitudes', 'rechazar_solicitudes',
    'ver_login_log',
  ],
  [ROLES.CAPTURISTA]: [
    'ver_dashboard',
    'ver_asistencia', 'crear_asistencia',
    'ver_documentos', 'crear_documentos',
  ],
  [ROLES.PROVEEDOR]: [
    'ver_dashboard',
    'ver_asistencia',
    'ver_documentos',
    'crear_solicitud_cambio',   // Solo puede SOLICITAR cambios
    'ver_mis_solicitudes',
  ],
  [ROLES.SEG_VIAL]: [
    'ver_dashboard',
    'ver_asistencia',
    'ver_documentos',
    'ver_solicitudes',
    'aprobar_solicitudes',      // Puede AUTORIZAR cambios del Proveedor
    'rechazar_solicitudes',
  ],
};

// ─────────────────────────────────────────────────────────────
//  ENTRY POINTS
// ─────────────────────────────────────────────────────────────

function doGet(e) {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('L-SENTRY')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Incluye archivos HTML parciales (CSS, JS)
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─────────────────────────────────────────────────────────────
//  ROUTER PRINCIPAL  —  llamado desde el cliente con google.script.run
// ─────────────────────────────────────────────────────────────

function dispatch(action, payload) {
  // Recuperar sesión activa
  const sesion = getSesion();

  // Acciones públicas (no requieren sesión)
  const PUBLICAS = ['login', 'ping'];
  if (!PUBLICAS.includes(action) && !sesion) {
    return { ok: false, error: 'Sesión expirada. Por favor inicia sesión.' };
  }

  // Validar permiso antes de ejecutar
  if (sesion && !PUBLICAS.includes(action)) {
    const accionPermiso = ACTION_PERMISO_MAP[action];
    if (accionPermiso && !tienePermiso(sesion.rol, accionPermiso)) {
      return { ok: false, error: 'No tienes permiso para realizar esta acción.' };
    }
  }

  try {
    switch (action) {
      // Auth
      case 'ping':              return { ok: true };
      case 'login':             return actionLogin(payload);
      case 'logout':            return actionLogout();
      case 'getSesion':         return { ok: true, data: sesion };

      // Dashboard
      case 'getDashboard':      return actionGetDashboard(sesion);

      // Asistencia
      case 'getAsistencia':     return actionGetAsistencia(payload);
      case 'crearAsistencia':   return actionCrearAsistencia(payload, sesion);
      case 'editarAsistencia':  return actionEditarAsistencia(payload, sesion);

      // Documentos
      case 'getDocumentos':     return actionGetDocumentos(payload);
      case 'crearDocumento':    return actionCrearDocumento(payload, sesion);

      // KPI
      case 'getKpiAsistencia':  return actionGetKpiAsistencia(payload);
      case 'getKpiDocumentos':  return actionGetKpiDocumentos(payload);

      // Catálogos
      case 'getUbicaciones':    return actionGetCatalogo('UBICACION');
      case 'getClientes':       return actionGetCatalogo('CLIENTE');
      case 'getTurnos':         return actionGetCatalogo('TURNO');
      case 'getJornadas':       return actionGetCatalogo('JORNADA');
      case 'getFormatos':       return actionGetCatalogo('FORMATOS');

      // Admin
      case 'getUsuarios':       return actionGetUsuarios();
      case 'crearUsuario':      return actionCrearUsuario(payload, sesion);
      case 'editarUsuario':     return actionEditarUsuario(payload, sesion);

      // Solicitudes de cambio (Proveedor → Seguridad Vial)
      case 'crearSolicitud':    return actionCrearSolicitud(payload, sesion);
      case 'getSolicitudes':    return actionGetSolicitudes(sesion);
      case 'resolverSolicitud': return actionResolverSolicitud(payload, sesion);

      // Resumen IA
      case 'getResumenIA':      return actionGetResumenIA(payload);

      // Login Log
      case 'getLoginLog':       return actionGetLoginLog();

      default:
        return { ok: false, error: `Acción desconocida: ${action}` };
    }
  } catch (err) {
    Logger.log(`[ERROR] dispatch(${action}): ${err.message}\n${err.stack}`);
    return { ok: false, error: 'Error interno del servidor: ' + err.message };
  }
}

// Mapa acción → permiso requerido
const ACTION_PERMISO_MAP = {
  getDashboard:      'ver_dashboard',
  getAsistencia:     'ver_asistencia',
  crearAsistencia:   'crear_asistencia',
  editarAsistencia:  'editar_asistencia',
  getDocumentos:     'ver_documentos',
  crearDocumento:    'crear_documentos',
  getKpiAsistencia:  'ver_kpi',
  getKpiDocumentos:  'ver_kpi',
  getUsuarios:       'ver_usuarios',
  crearUsuario:      'editar_usuarios',
  editarUsuario:     'editar_usuarios',
  crearSolicitud:    'crear_solicitud_cambio',
  getSolicitudes:    'ver_solicitudes',
  resolverSolicitud: 'aprobar_solicitudes',
  getResumenIA:      'ver_resumen_ia',
  getLoginLog:       'ver_login_log',
};

// ─────────────────────────────────────────────────────────────
//  HELPERS GENERALES
// ─────────────────────────────────────────────────────────────

function getSheet(nombre) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(nombre);
  if (!sheet) throw new Error(`Hoja no encontrada: "${nombre}"`);
  return sheet;
}

/** Convierte filas de una hoja en array de objetos usando la fila 1 como headers */
function sheetToObjects(sheetName, filtro) {
  const sheet = getSheet(sheetName);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return filtro ? rows.filter(filtro) : rows;
}

/** Agrega una fila al final de la hoja usando el orden de headers */
function appendRow(sheetName, obj) {
  const sheet   = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row     = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sheet.appendRow(row);
}

/** Actualiza una fila específica por índice (1-based, sin contar header) */
function updateRow(sheetName, rowIndex, obj) {
  const sheet   = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row     = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
}

/** Genera un ID único con prefijo: e.g. "ASS-0123" */
function generarId(prefijo, sheetName, campoId) {
  const rows = sheetToObjects(sheetName);
  const nums = rows
    .map(r => parseInt((r[campoId] || '').replace(prefijo + '-', ''), 10))
    .filter(n => !isNaN(n));
  const siguiente = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefijo}-${String(siguiente).padStart(4, '0')}`;
}

function fechaHoy() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function horaAhora() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss');
}

function tienePermiso(rol, permiso) {
  return (PERMISOS[rol] || []).includes(permiso);
}