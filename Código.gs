const API_KEY = "AIzaSyD4BaXf-WdypiLE2uJ_n0-OL3aprGFFSs8"; 

function consolidarYGenerarResumen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hAsis = ss.getSheetByName("BdAsistencia");
  const hDocs = ss.getSheetByName("BDDocumentos");
  const hDest = ss.getSheetByName("Resumen_IA");
  const hClientes = ss.getSheetByName("Clientes");
  
  if (!hAsis || !hDocs || !hDest || !hClientes) return;

  const datosDest = hDest.getDataRange().getValues();
  const datosClientes = hClientes.getDataRange().getValues();

  // Diccionario para BuscarV rápido y ahorrar memoria
  const dictClientes = {};
  datosClientes.forEach(fila => {
    dictClientes[String(fila[0]).trim()] = fila[1];
  });

  for (let i = 1; i < datosDest.length; i++) {
    const fechaControl = datosDest[i][1]; 
    const idCliente = String(datosDest[i][2]).trim();    
    const estatus = datosDest[i][4];       

    // Saltamos si ya está procesado para evitar saturar la API
    if (estatus === "Completado" || estatus === "Sin Datos" || !fechaControl || !idCliente) continue;

    const nombreClienteReal = dictClientes[idCliente] || idCliente;
    const fechaObj = new Date(fechaControl);
    const mes = fechaObj.getMonth();
    const anio = fechaObj.getFullYear();
    let textoAcumulado = "";

    // Consolidación optimizada
    const dataAsis = hAsis.getDataRange().getValues();
    dataAsis.forEach(row => {
      let f = new Date(row[2]); 
      if (String(row[1]).trim() === idCliente && f.getMonth() === mes && f.getFullYear() === anio) {
        if (row[18]) textoAcumulado += "- " + row[18] + "\n";
      }
    });

    const dataDocs = hDocs.getDataRange().getValues();
    dataDocs.forEach(row => {
      let f = new Date(row[4]); 
      if (String(row[1]).trim() === idCliente && f.getMonth() === mes && f.getFullYear() === anio) {
        if (row[20]) textoAcumulado += "- " + row[20] + "\n";
      }
    });

    if (textoAcumulado.trim().length > 10) {
      const respuestaIA = llamarGeminiAI_Seguro(textoAcumulado, nombreClienteReal);
      
      // Si la IA nos pide esperar por cuota
      if (respuestaIA.includes("REINTENTAR")) {
        Utilities.sleep(5000); // Pausa 5 segundos y salta a la siguiente para no bloquearse
        continue;
      }

      hDest.getRange(i + 1, 4).setValue(respuestaIA); 
      hDest.getRange(i + 1, 5).setValue("Completado");
      Utilities.sleep(2000); // Pausa obligatoria de 2 seg entre peticiones para evitar errores de Google
    } else {
      hDest.getRange(i + 1, 4).setValue("Sin incidencias suficientes para " + nombreClienteReal);
      hDest.getRange(i + 1, 5).setValue("Sin Datos");
    }
  }
}

function llamarGeminiAI_Seguro(texto, clienteNombre) {
  // Cambiado a gemini-1.5-flash (más estable en 2026 para scripts largos)
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY;
  
  const payload = {
    "contents": [{
      "parts": [{ 
        "text": "Actúa como un Gerente de Seguridad Privada con 15 años de experiencia en gestión de activos y análisis de riesgo."+"Contexto: Necesito redactar el cierre de un Reporte de Nivel de Servicio para un proveedor externo. Este texto resume el desempeño de los elementos y servicios de seguridad en la empresa." +"Tarea: Redacta un resumen (cobertura de servicio, puntualidad, cumplimiento de consignas y reportes de incidentes).Restricciones de estilo y formato (CRÍTICO): Tono:fluida, natural. Sin juicios de valor: No uses palabras como bueno, malo, excelente o pésimo. Sustitúyelas por conforme a protocolo, dentro de parámetros, desviación. No formato de correo: Prohibido usar Estimados, Saludos, Atentamente o firmas. El texto debe integrarse directamente al final de un reporte extenso. Longitud: Menos de 30,000 caracteres. Limpieza visual: No utilices emojis, ni negritas excesivas, ni caracteres especiales innecesarios. Cuida que los saltos de línea sean naturales para un documento formal. Objetivo: El proveedor debe entender qué se cumplió y qué no, basándose hechos observados." + clienteNombre + ". " +"INCIDENCIAS A RESUMIR: " + texto 
      }]
    }],
    "generationConfig": {
      "temperature": 0.1,
      "maxOutputTokens": 4000 
    }
  };

  const opciones = {
    "method": "POST",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const respuesta = UrlFetchApp.fetch(url, opciones);
    const code = respuesta.getResponseCode();
    const json = JSON.parse(respuesta.getContentText());

    if (code === 429) return "REINTENTAR: Cuota excedida";

    // CORRECCIÓN CRÍTICA DE RUTA:
    // Accedemos a candidates[0] -> content -> parts[0] -> text
    if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts) {
      return json.candidates[0].content.parts[0].text;
    } else {
      Logger.log("Error en estructura: " + respuestaTexto);
      return "Error: Estructura de respuesta no válida.";
    }
  } catch (e) {
    Logger.log("Error de conexión: " + e.toString());
    return "Error técnico en la fila.";
  }
}