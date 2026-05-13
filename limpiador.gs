function gestionMensualResumenIA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaAsistencia = ss.getSheetByName("BdAsistencia");
  const hojaResumen = ss.getSheetByName("Resumen_IA");
  
  // 1. Obtener el IDCliente del último registro de BdAsistencia (Columna B / Índice 1)
  const ultimaFilaAsistencia = hojaAsistencia.getLastRow();
  const idClienteDinamico = hojaAsistencia.getRange(ultimaFilaAsistencia, 2).getValue(); 

  if (!idClienteDinamico) {
    console.error("No se encontró IDCliente en la última fila de BdAsistencia");
    return;
  }

  const ahora = new Date();
  const mesActualNum = ahora.getMonth() + 1;
  const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const mesActualNombre = nombresMeses[ahora.getMonth()];
  const anioActual = ahora.getFullYear();
  
  const dataResumen = hojaResumen.getDataRange().getValues();
  let filaEncontrada = -1;

  // 2. Buscar si ya existe el registro del mes/año para ese cliente específico
  for (let i = 1; i < dataResumen.length; i++) {
    let fechaFila = new Date(dataResumen[i][1]); // Columna Fecha_Resumen (Índice 1)
    let clienteFila = dataResumen[i][2];        // Columna IDCliente (Índice 2)
    
    if (clienteFila === idClienteDinamico && 
        fechaFila.getMonth() + 1 === mesActualNum && 
        fechaFila.getFullYear() === anioActual) {
      filaEncontrada = i + 1;
      break;
    }
  }

  if (filaEncontrada !== -1) {
    // CASO A: Existe. Borramos Estatus (Columna E / Índice 5)
    hojaResumen.getRange(filaEncontrada, 5).setValue(""); 
    console.log("Estatus reseteado para cliente: " + idClienteDinamico + " en " + mesActualNombre);
  } else {
    // CASO B: Nuevo Mes o Nuevo Cliente. Crear fila
    const nuevoID = generarIDAppSheet(anioActual);
    const primerDiaMes = new Date(anioActual, ahora.getMonth(), 1);
    
    // Columnas: IDResumenIA, Fecha_Resumen, IDCliente, ResumenIA, Estatus, NumMes, Mes
    hojaResumen.appendRow([
      nuevoID, 
      primerDiaMes, 
      idClienteDinamico, 
      "", 
      "", 
      mesActualNum, 
      mesActualNombre
    ]);
    console.log("Nuevo registro creado para cliente: " + idClienteDinamico);
  }

  // 3. Ejecutar tu lógica de IA
  if (typeof consolidarYGenerarResumen === "function") {
    consolidarYGenerarResumen();
  }
}

function generarIDAppSheet(anio) {
  const ahora = new Date();
  const mes = ("0" + (ahora.getMonth() + 1)).slice(-2);
  const dia = ("0" + ahora.getDate()).slice(-2);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase(); 
  // Formato: 20260108-ABCD
  return anio + mes + dia + "-" + random;
}