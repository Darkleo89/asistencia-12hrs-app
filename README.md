# L - SENTRY · Google Apps Script
## Guía de Instalación y Despliegue

---

## 📁 ARCHIVOS DEL PROYECTO

  ```
Code.gs          → Router principal, helpers, constantes
Auth.gs          → Login, sesión, logout, log de acceso
Asistencia.gs    → CRUD BdAsistencia + KPI Asistencia
Documentos.gs    → CRUD BdDocumentos + KPI Documentos
Solicitudes.gs   → Flujo Proveedor → Seguridad Vial
Catalogos.gs     → Ubicaciones, Clientes, Turnos, Formatos, Usuarios, Dashboard
Index.html       → Página principal (shell de la app)
Estilos.html     → CSS global
Scripts.html     → Lógica JavaScript del frontend
```

---

## 🚀 PASO A PASO — INSTALACIÓN

### 1. Crear el proyecto en Google Apps Script

1. Abre tu Google Spreadsheet
2. Ve a ** Extensiones → Apps Script **
  3. Elimina el archivo `Code.gs` que viene por defecto
4. Crea los siguientes archivos con los nombres exactos:

#### Archivos.gs(Script):
- `Code.gs`
  - `Auth.gs`
  - `Asistencia.gs`
  - `Documentos.gs`
  - `Solicitudes.gs`
  - `Catalogos.gs`

#### Archivos.html(HTML):
- `Index.html`
  - `Estilos.html`
  - `Scripts.html`

Copia el contenido de cada archivo entregado en su correspondiente archivo del editor.

---

### 2. Configurar el ID de tu Spreadsheet

En`Code.gs`, línea 8, reemplaza:
```javascript
const SPREADSHEET_ID = 'REEMPLAZA_CON_TU_SPREADSHEET_ID';
```

El ID está en la URL de tu hoja:
```
https://docs.google.com/spreadsheets/d/[AQUÍ_ESTÁ_EL_ID]/edit
```

---

### 3. Configurar las Hojas de Google Sheets

Asegúrate de que tu Spreadsheet tenga estas hojas con nombres EXACTOS:

| Hoja | Notas |
| --------------------| -------|
| `Login` | Usuarios con acceso al sistema |
| `Usuario` | Directorio de usuarios |
| `Perfil` | Roles del sistema |
| `Admin_Vista` | Vistas por rol |
| `BdAsistencia` | Registros de asistencia |
| `Kpi_Asistencia` | KPIs de asistencia |
| `BdDocumentos` | Registros de documentos |
| `Kpi_Documentos` | KPIs de documentos |
| `Ubicacion` | Catálogo de ubicaciones |
| `Cliente` | Catálogo de clientes |
| `Turno` | Catálogo de turnos |
| `Jornada` | Catálogo de jornadas |
| `Formatos` | Catálogo de formatos |
| `Resumen_IA` | Resúmenes generados por IA |
| `Home` | Menú principal |
| `Solicitudes_Cambio` | ** Nueva hoja ** — se crea automáticamente |

  ---

### 4. Configurar la hoja Perfil con los 4 roles

La hoja `Perfil` debe tener:

| IDRol | Nom_Rol | Descripcion | F_creacion | F_Modificacion | IDLogin |
| -------| ---------| -------------| ------------| ----------------| ---------|
| 1 | Administrador | Acceso total al sistema | hoy | | |
| 2 | Capturista | Captura de asistencia y documentos | hoy | | |
| 3 | Proveedor | Vista y solicitud de cambios | hoy | | |
| 4 | Seguridad Vial | Autorización de cambios | hoy | | |

  ---

### 5. Configurar Admin_Vista(vistas por rol)

La hoja `Admin_Vista` define qué secciones ve cada rol:

| IDVistaWiew | Nombre_Vista | IDRol | Icono |
| -------------| --------------| -------| -------|
| V01 | Dashboard | 1 | fa - th - large |
| V02 | Asistencia | 1 | fa - user - clock |
| V03 | KPI Asistencia | 1 | fa - chart - line |
| ... | ... | ... | ... |
| V01 | Dashboard | 2 | fa - th - large |
| V02 | Asistencia | 2 | fa - user - clock |
| V06 | Documentos | 2 | fa - file - alt |

  (Una fila por vista por rol)

---

### 6. Crear un usuario administrador inicial

En la hoja`Login`, agrega manualmente la primera fila de datos:

| IDLogin | Serie_Equipo | Usuario | Contraseños | IDRol | Imagen | H_Entrada | H_Salida | Estado |
| ---------| --------------| ---------| -------------| -------| --------| -----------| ----------| --------|
| LOG - 0001 | EQ - 001 | admin | TuContraseña | 1 | | | | inactivo |

  En la hoja `Usuario`:

| IDUsuario | Correo | Nombre Completo | Usuario | Contraseña | IDRol | Estatus | ... |
| -----------| --------| -----------------| ---------| ------------| -------| ---------| -----|
| USR - 0001 | admin@empresa.com | Administrador | admin | TuContraseña | 1 | Activo | ... |

  ---

### 7. Ejecutar Setup inicial

En el editor de Apps Script, ejecuta la función:
```
setupHojasSolicitudes()
```

Esto crea automáticamente la hoja `Solicitudes_Cambio` con sus headers y valida que los roles estén configurados.

---

### 8. Desplegar como Web App

1. En el editor, clic en ** Implementar → Nueva implementación **
  2. Tipo: ** Aplicación web **
    3. Configuración:
   - ** Descripción:** L - SENTRY v1.0
  - ** Ejecutar como:** Yo(tu cuenta de Google)
    - ** Quién tiene acceso:** Cualquier persona * (o "Cualquier usuario de Google" para mayor seguridad)*
      4. Clic en ** Implementar **
        5. Copia la ** URL de la aplicación web ** — esta es tu URL del sistema

          > ⚠️ Cada vez que hagas cambios en el código, debes hacer una ** Nueva implementación ** o ** Actualizar implementación ** para que surtan efecto.

---

## 🔐 PERMISOS POR ROL

  | Acción | Admin | Capturista | Proveedor | Seg.Vial |
| --------| -------| -----------| -----------| -----------|
| Ver Dashboard | ✅ | ✅ | ✅ | ✅ |
| Ver Asistencia | ✅ | ✅ | ✅ | ✅ |
| Crear Asistencia | ✅ | ✅ | ❌ | ❌ |
| Editar Asistencia | ✅ | ❌ | ❌ | ❌ |
| Ver Documentos | ✅ | ✅ | ✅ | ✅ |
| Crear Documento | ✅ | ✅ | ❌ | ❌ |
| KPI / Resumen IA | ✅ | ❌ | ❌ | ✅ |
| Solicitar Cambio | ❌ | ❌ | ✅ | ❌ |
| Aprobar / Rechazar Cambio | ✅ | ❌ | ❌ | ✅ |
| Gestión Usuarios | ✅ | ❌ | ❌ | ❌ |
| Catálogos | ✅ | ❌ | ❌ | ❌ |
| Log de Acceso | ✅ | ❌ | ❌ | ❌ |

  ---

## 🔄 FLUJO DE SOLICITUDES DE CAMBIO

  ```
Proveedor detecta error
        ↓
Clic en ⇄ en el registro
        ↓
Selecciona campo + nuevo valor + justificación
        ↓
Sistema crea registro en Solicitudes_Cambio (Estatus: Pendiente)
        ↓
Seguridad Vial recibe notificación (badge rojo en sidebar)
        ↓
Seguridad Vial revisa: ve valor anterior vs valor propuesto
        ↓
    ┌───┴───┐
Aprueba   Rechaza
    │         │
Cambio    Sin cambios
aplicado  Proveedor
al registro  notificado
```

---

## 🛠️ ESTRUCTURA DE DATOS — HOJA SOLICITUDES_CAMBIO

  | Campo | Descripción |
| -------| -------------|
| IDSolicitud | ID único(SOL - XXXX) |
| Modulo | Asistencia \| Documento |
| IDRegistro | ID del registro a modificar |
| Cambios_Solicitados | JSON con campos y valores nuevos |
| Valores_Anteriores | JSON con valores actuales |
| Justificacion | Motivo del cambio |
| IDLogin_Proveedor | Quién solicitó |
| Usuario_Proveedor | Nombre del solicitante |
| Fecha_Solicitud / Hora_Solicitud | Timestamp de creación |
| Estatus | Pendiente \| Aprobada \| Rechazada |
| IDLogin_Resolutor | Quién autorizó / rechazó |
| Usuario_Resolutor | Nombre del autorizador |
| Fecha_Resolucion / Hora_Resolucion | Timestamp de resolución |
| Comentario_Resolucion | Comentario de Seguridad Vial |

  ---

## ⚡ CONSIDERACIONES PARA PRODUCCIÓN

1. ** Contraseñas:** Actualmente se guardan en texto plano.Para producción, implementa hashing con SHA - 256 usando `Utilities.computeDigest()` de Apps Script.

2. ** Sesiones:** Se usan `UserProperties` de Apps Script, que persisten por usuario de Google.Si el sistema lo acceden múltiples personas con la misma cuenta, considera usar`CacheService`.

3. ** Cuotas:** Google Apps Script tiene límites de tiempo de ejecución(6 min por llamada).Para hojas con miles de registros, implementa paginación más agresiva.

4. ** Imágenes(Foto_Elemento, Foto_Incidencia):** El sistema guarda la URL de la imagen.Usa Google Drive para subir imágenes y guarda el enlace compartido.

5. ** Resumen IA:** La hoja `Resumen_IA` espera que el texto sea generado externamente(puede integrarse con la API de Claude / Gemini vía`UrlFetchApp`).
