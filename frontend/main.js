const botonIniciar = document.getElementById("iniciar");
const botonFinalizar = document.getElementById("finalizar");
const estado = document.getElementById("estado");

const panelDescargas = document.getElementById("descargas");
const botonDescargarAudio = document.getElementById("descargarAudio");
const botonDescargarTexto = document.getElementById("descargarTexto");

let conexion = null;
let microfono = null;
let contextoAudio = null;
let procesador = null;
let fuenteMicrofono = null;
let destinoGrabacion = null;
let grabador = null;

let fragmentosAudio = [];
let audioBlob = null;
let urlAudio = null;

let transcripcion = [];
let llamadaActiva = false;
let huboLlamada = false;
let llamadaTerminada = false;
let finalizando = false;
let limpiezaEnCurso = false;

let siguienteAudio = 0;
let intentoActual = 0;

function mostrarEstado(mensaje) {
  estado.textContent = "Estado: " + mensaje;
}

function guardarTexto(tipo, texto) {
  if (!texto || !texto.trim()) return;

  const emisor = tipo === "asesor"
    ? "Asesor"
    : "Cliente simulado";

  transcripcion.push({
    emisor,
    texto: texto.trim(),
    hora: new Date().toLocaleTimeString("es-PE")
  });
}

function actualizarDescargas() {
  if (!llamadaTerminada) return;

  panelDescargas.hidden = false;

  botonDescargarTexto.disabled = transcripcion.length === 0;
  botonDescargarAudio.disabled = !audioBlob;

  if (!audioBlob) {
    botonDescargarAudio.title =
      "No se pudo preparar la grabación de esta llamada.";
  } else {
    botonDescargarAudio.title = "";
  }
}

function convertirAudio(entrada, frecuencia) {
  const proporcion = frecuencia / 16000;
  const longitud = Math.floor(entrada.length / proporcion);
  const salida = new Int16Array(longitud);

  for (let i = 0; i < longitud; i++) {
    const valor = Math.max(
      -1,
      Math.min(1, entrada[Math.floor(i * proporcion)])
    );

    salida[i] = valor < 0 ? valor * 32768 : valor * 32767;
  }

  return salida;
}

function int16Base64(datos) {
  const bytes = new Uint8Array(
    datos.buffer,
    datos.byteOffset,
    datos.byteLength
  );

  let binario = "";
  const bloque = 8192;

  for (let i = 0; i < bytes.length; i += bloque) {
    binario += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + bloque, bytes.length))
    );
  }

  return btoa(binario);
}

function reproducirAudio(base64) {
  if (!contextoAudio || contextoAudio.state === "closed") return;

  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);

  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }

  if (bytes.byteLength % 2 !== 0) {
    console.error("El audio recibido tiene un tamaño incorrecto.");
    return;
  }

  const muestras = new Int16Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / 2
  );

  const buffer = contextoAudio.createBuffer(
    1,
    muestras.length,
    24000
  );

  const canal = buffer.getChannelData(0);

  for (let i = 0; i < muestras.length; i++) {
    canal[i] = muestras[i] / 32768;
  }

  const fuente = contextoAudio.createBufferSource();
  fuente.buffer = buffer;

  // Se escucha el audio de Gemini.
  fuente.connect(contextoAudio.destination);

  // Se incorpora la voz del cliente simulado a la grabación.
  if (destinoGrabacion) {
    fuente.connect(destinoGrabacion);
  }

  const inicio = Math.max(
    contextoAudio.currentTime,
    siguienteAudio
  );

  fuente.start(inicio);
  siguienteAudio = inicio + buffer.duration;
}

function detenerCapturaMicrofono() {
  if (procesador) {
    procesador.onaudioprocess = null;

    try {
      procesador.disconnect();
    } catch (_) {}

    procesador = null;
  }

  if (fuenteMicrofono) {
    try {
      fuenteMicrofono.disconnect();
    } catch (_) {}

    fuenteMicrofono = null;
  }

  if (microfono) {
    microfono.getTracks().forEach(pista => pista.stop());
    microfono = null;
  }
}

function iniciarGrabacion() {
  if (!destinoGrabacion) {
    throw new Error("No se pudo preparar la grabación de audio.");
  }

  if (!window.MediaRecorder) {
    throw new Error(
      "Este navegador no permite grabar el audio. Usa una versión actual de Chrome."
    );
  }

  const opciones = {};

  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    opciones.mimeType = "audio/webm;codecs=opus";
  }

  grabador = new MediaRecorder(
    destinoGrabacion.stream,
    opciones
  );

  const grabadorActual = grabador;

  grabadorActual.ondataavailable = evento => {
    if (evento.data && evento.data.size > 0) {
      fragmentosAudio.push(evento.data);
    }
  };

  grabadorActual.onerror = evento => {
    console.error("Error de grabación:", evento.error);
  };

  grabadorActual.onstop = () => {
    if (fragmentosAudio.length > 0) {
      audioBlob = new Blob(fragmentosAudio, {
        type: grabadorActual.mimeType || "audio/webm"
      });
    }

    actualizarDescargas();
  };

  // Genera fragmentos periódicos para evitar depender de un
  // único bloque de audio acumulado durante toda la llamada.
  grabadorActual.start(1000);
}

async function iniciarLlamada() {
  if (
    llamadaActiva ||
    botonIniciar.disabled ||
    limpiezaEnCurso
  ) {
    return;
  }

  intentoActual++;
  const esteIntento = intentoActual;

  botonIniciar.disabled = true;
  botonFinalizar.disabled = true;

  llamadaTerminada = false;
  huboLlamada = false;
  finalizando = false;
  fragmentosAudio = [];
  audioBlob = null;
  transcripcion = [];

  panelDescargas.hidden = true;

  if (urlAudio) {
    URL.revokeObjectURL(urlAudio);
    urlAudio = null;
  }

  mostrarEstado("Solicitando permiso para usar el micrófono...");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "El navegador no permite usar el micrófono. Abre el simulador mediante HTTPS."
      );
    }

    microfono = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    if (esteIntento !== intentoActual) {
      microfono.getTracks().forEach(pista => pista.stop());
      microfono = null;
      return;
    }

    contextoAudio = new AudioContext();
    await contextoAudio.resume();

    // Este destino mezcla las voces para crear una grabación única.
    destinoGrabacion = contextoAudio.createMediaStreamDestination();

    mostrarEstado("Conectando con el servidor...");

    const protocolo = location.protocol === "https:" ? "wss:" : "ws:";
    const nuevaConexion = new WebSocket(
      `${protocolo}//${location.host}/ws`
    );

    conexion = nuevaConexion;

    nuevaConexion.onopen = () => {
      if (esteIntento !== intentoActual) {
        nuevaConexion.close();
        return;
      }

      try {
        fuenteMicrofono =
          contextoAudio.createMediaStreamSource(microfono);

        // La voz del asesor se incorpora a la grabación.
        fuenteMicrofono.connect(destinoGrabacion);

        procesador = contextoAudio.createScriptProcessor(
          4096,
          1,
          1
        );

        procesador.onaudioprocess = evento => {
          if (
            !llamadaActiva ||
            !conexion ||
            conexion.readyState !== WebSocket.OPEN
          ) {
            return;
          }

          const entrada = evento.inputBuffer.getChannelData(0);

          const muestras = convertirAudio(
            entrada,
            contextoAudio.sampleRate
          );

          try {
            conexion.send(JSON.stringify({
              audio: int16Base64(muestras)
            }));
          } catch (error) {
            console.error("Error enviando audio:", error);
          }
        };

        fuenteMicrofono.connect(procesador);
        procesador.connect(contextoAudio.destination);

        iniciarGrabacion();

        llamadaActiva = true;
        huboLlamada = true;
        botonFinalizar.disabled = false;

        mostrarEstado("Llamada en curso. Habla con el cliente.");

      } catch (error) {
        console.error("No se pudo preparar la llamada:", error);
        detenerLlamada("No se pudo iniciar: " + error.message);
      }
    };

    nuevaConexion.onmessage = async evento => {
      if (esteIntento !== intentoActual) return;

      let datos;

      try {
        datos = JSON.parse(evento.data);
      } catch {
        console.error("Respuesta no válida del servidor.");
        return;
      }

      if (datos.error) {
        mostrarEstado("Error del servidor: " + datos.error);
        return;
      }

      // Se guarda el texto internamente. Nunca se muestra en pantalla.
      if (datos.texto) {
        guardarTexto(datos.tipo || "cliente", datos.texto);
      }

      if (datos.audio && contextoAudio) {
        if (contextoAudio.state === "suspended") {
          await contextoAudio.resume();
        }

        reproducirAudio(datos.audio);
      }
    };

    nuevaConexion.onerror = () => {
      if (esteIntento !== intentoActual) return;

      mostrarEstado("Error de conexión con el servidor.");
    };

    nuevaConexion.onclose = () => {
      if (esteIntento !== intentoActual) return;

      // Durante una finalización normal, la función que finaliza
      // la llamada se encarga de limpiar todos los recursos.
      if (!finalizando) {
        detenerLlamada(
          "Conexión cerrada. Puedes volver a intentarlo."
        );
      }
    };

  } catch (error) {
    if (esteIntento !== intentoActual) return;

    console.error("Error al iniciar:", error);

    await detenerLlamada(
      "No se pudo iniciar: " + error.message
    );
  }
}

async function finalizarLlamada() {
  if (!llamadaActiva || finalizando) return;

  llamadaActiva = false;
  finalizando = true;

  botonFinalizar.disabled = true;
  botonIniciar.disabled = true;

  mostrarEstado("Finalizando llamada y preparando descargas...");

  // Dejamos de enviar voz del asesor, pero conservamos brevemente
  // el audio de salida para recibir la respuesta final de Gemini.
  detenerCapturaMicrofono();

  const socket = conexion;

  if (socket && socket.readyState === WebSocket.OPEN) {
    const cierre = new Promise(resolve => {
      socket.addEventListener("close", resolve, { once: true });
    });

    try {
      socket.send(JSON.stringify({ tipo: "finalizar" }));
    } catch (error) {
      console.warn("No se pudo enviar la finalización:", error);
    }

    // El servidor dispone de un margen para enviar las últimas
    // transcripciones y terminar la conexión.
    await Promise.race([
      cierre,
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
  }

  finalizando = false;

  await detenerLlamada("Llamada finalizada.");
}

async function detenerLlamada(
  mensaje = "Llamada finalizada."
) {
  if (limpiezaEnCurso) return;

  limpiezaEnCurso = true;

  intentoActual++;
  llamadaActiva = false;

  detenerCapturaMicrofono();

  const socket = conexion;
  conexion = null;

  if (socket) {
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    socket.onopen = null;

    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      try {
        socket.close();
      } catch (_) {}
    }
  }

  // Esperamos que MediaRecorder entregue el último fragmento.
  if (grabador && grabador.state !== "inactive") {
    const grabadorActual = grabador;

    await Promise.race([
      new Promise(resolve => {
        grabadorActual.addEventListener(
          "stop",
          resolve,
          { once: true }
        );

        try {
          grabadorActual.stop();
        } catch (_) {
          resolve();
        }
      }),
      new Promise(resolve => setTimeout(resolve, 1500))
    ]);
  }

  grabador = null;

  if (contextoAudio) {
    const audioAnterior = contextoAudio;
    contextoAudio = null;

    try {
      await audioAnterior.close();
    } catch (error) {
      console.warn("No se pudo cerrar el audio:", error);
    }
  }

  destinoGrabacion = null;
  siguienteAudio = 0;

  botonIniciar.disabled = false;
  botonFinalizar.disabled = true;

  llamadaTerminada = huboLlamada;

  if (llamadaTerminada) {
    actualizarDescargas();
  } else {
    panelDescargas.hidden = true;
  }

  mostrarEstado(mensaje);

  limpiezaEnCurso = false;
}

function descargarTranscripcion() {
  if (transcripcion.length === 0) return;

  const fecha = new Date().toLocaleString("es-PE");

  const lineas = [
    "SIMULADOR PANDERO ATC",
    `Fecha de descarga: ${fecha}`,
    "",
    ...transcripcion.map(
      linea => `[${linea.hora}] ${linea.emisor}: ${linea.texto}`
    )
  ];

  const archivo = new Blob(
    [lineas.join("\n")],
    { type: "text/plain;charset=utf-8" }
  );

  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = `transcripcion_pandero_${Date.now()}.txt`;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  URL.revokeObjectURL(url);
}

function descargarAudio() {
  if (!audioBlob) return;

  if (urlAudio) {
    URL.revokeObjectURL(urlAudio);
  }

  urlAudio = URL.createObjectURL(audioBlob);

  const enlace = document.createElement("a");
  enlace.href = urlAudio;

  const extension = audioBlob.type.includes("mp4")
    ? "m4a"
    : "webm";

  enlace.download = `llamada_pandero_${Date.now()}.${extension}`;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

botonIniciar.disabled = false;
botonFinalizar.disabled = true;
panelDescargas.hidden = true;

botonIniciar.addEventListener("click", iniciarLlamada);
botonFinalizar.addEventListener("click", finalizarLlamada);

botonDescargarAudio.addEventListener("click", descargarAudio);
botonDescargarTexto.addEventListener("click", descargarTranscripcion);
