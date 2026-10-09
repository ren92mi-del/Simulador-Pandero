
const botonIniciar = document.getElementById("iniciar");
const botonFinalizar = document.getElementById("finalizar");
const estado = document.getElementById("estado");
const conversacion = document.getElementById("conversacion");

let conexion = null;
let microfono = null;
let contextoAudio = null;
let procesador = null;
let fuenteMicrofono = null;
let llamadaActiva = false;
let siguienteAudio = 0;
let intentoActual = 0;

function mostrarEstado(mensaje) {
  estado.textContent = "Estado: " + mensaje;
}

function agregarTexto(texto) {
  if (conversacion.textContent.includes("Aquí aparecerá")) {
    conversacion.textContent = "";
  }

  conversacion.textContent += texto + "\n\n";
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
  fuente.connect(contextoAudio.destination);

  const inicio = Math.max(
    contextoAudio.currentTime,
    siguienteAudio
  );

  fuente.start(inicio);
  siguienteAudio = inicio + buffer.duration;
}

async function iniciarLlamada() {
  if (llamadaActiva || botonIniciar.disabled) return;

  intentoActual++;
  const esteIntento = intentoActual;

  botonIniciar.disabled = true;
  botonFinalizar.disabled = true;
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
      microfono.getTracks().forEach(p => p.stop());
      microfono = null;
      return;
    }

    contextoAudio = new AudioContext();
    await contextoAudio.resume();

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

      llamadaActiva = true;
      botonFinalizar.disabled = false;

      mostrarEstado("Llamada en curso. Habla con el cliente.");
      agregarTexto("Sistema: llamada iniciada. Saluda al cliente.");

      fuenteMicrofono =
        contextoAudio.createMediaStreamSource(microfono);

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
        agregarTexto("Error: " + datos.error);
        return;
      }

      if (datos.texto) {
        agregarTexto("Cliente: " + datos.texto);
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

      detenerLlamada(
        "Conexión cerrada. Puedes volver a intentarlo."
      );
    };

  } catch (error) {
    if (esteIntento !== intentoActual) return;

    console.error("Error al iniciar:", error);

    detenerLlamada(
      "No se pudo iniciar: " + error.message
    );
  }
}

function detenerLlamada(mensaje = "Llamada finalizada.") {
  intentoActual++;
  llamadaActiva = false;

  if (procesador) {
    procesador.onaudioprocess = null;
    procesador.disconnect();
    procesador = null;
  }

  if (fuenteMicrofono) {
    fuenteMicrofono.disconnect();
    fuenteMicrofono = null;
  }

  if (microfono) {
    microfono.getTracks().forEach(pista => pista.stop());
    microfono = null;
  }

  const socket = conexion;
  conexion = null;

  if (socket) {
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;

    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close();
    }
  }

  if (contextoAudio) {
    const audioAnterior = contextoAudio;
    contextoAudio = null;

    audioAnterior.close().catch(error => {
      console.warn("No se pudo cerrar el audio:", error);
    });
  }

  siguienteAudio = 0;
  botonIniciar.disabled = false;
  botonFinalizar.disabled = true;

  mostrarEstado(mensaje);
}

if (
  botonIniciar &&
  botonFinalizar &&
  estado &&
  conversacion
) {
  botonIniciar.disabled = false;
  botonFinalizar.disabled = true;

  botonIniciar.addEventListener("click", iniciarLlamada);

  botonFinalizar.addEventListener("click", () => {
    detenerLlamada("Llamada finalizada.");
  });
} else {
  console.error(
    "No se encontraron los elementos necesarios del simulador."
  );
}
