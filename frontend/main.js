const botonIniciar = document.getElementById("iniciar");
const botonFinalizar = document.getElementById("finalizar");
const estado = document.getElementById("estado");
const conversacion = document.getElementById("conversacion");

let conexion = null;
let microfono = null;
let contextoAudio = null;
let procesador = null;
let fuenteMicrofono = null;
let siguienteAudio = 0;
let llamadaActiva = false;

function mostrarEstado(mensaje) {
  estado.textContent = "Estado: " + mensaje;
}

function agregarTexto(texto) {
  if (conversacion.textContent.includes("Aquí aparecerá")) {
    conversacion.textContent = "";
  }

  conversacion.textContent += texto + "\n\n";
}

function convertirBase64AInt16(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);

  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }

  return new Int16Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.byteLength / 2)
  );
}

function convertirInt16ABase64(datos) {
  const bytes = new Uint8Array(
    datos.buffer,
    datos.byteOffset,
    datos.byteLength
  );

  let binario = "";
  const tamano = 8192;

  for (let i = 0; i < bytes.length; i += tamano) {
    binario += String.fromCharCode(
      ...bytes.subarray(i, i + tamano)
    );
  }

  return btoa(binario);
}

function convertirA16kHz(entrada, frecuenciaOriginal) {
  const frecuenciaDestino = 16000;

  if (frecuenciaOriginal === frecuenciaDestino) {
    return entrada;
  }

  const proporcion = frecuenciaOriginal / frecuenciaDestino;
  const longitud = Math.floor(entrada.length / proporcion);
  const salida = new Float32Array(longitud);

  for (let i = 0; i < longitud; i++) {
    const inicio = Math.floor(i * proporcion);
    const fin = Math.min(
      Math.floor((i + 1) * proporcion),
      entrada.length
    );

    let suma = 0;
    let cantidad = 0;

    for (let j = inicio; j < fin; j++) {
      suma += entrada[j];
      cantidad++;
    }

    salida[i] = cantidad ? suma / cantidad : 0;
  }

  return salida;
}

function convertirFloatAInt16(entrada) {
  const salida = new Int16Array(entrada.length);

  for (let i = 0; i < entrada.length; i++) {
    const valor = Math.max(-1, Math.min(1, entrada[i]));

    salida[i] = valor < 0
      ? valor * 32768
      : valor * 32767;
  }

  return salida;
}

function reproducirAudio(base64) {
  const muestras = convertirBase64AInt16(base64);

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

  const ahora = contextoAudio.currentTime;
  const inicio = Math.max(ahora, siguienteAudio);

  fuente.start(inicio);
  siguienteAudio = inicio + buffer.duration;
}

async function iniciarLlamada() {
  try {
    botonIniciar.disabled = true;
    mostrarEstado("Solicitando permiso del micrófono...");

    microfono = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    contextoAudio = new AudioContext();

    await contextoAudio.resume();

    siguienteAudio = contextoAudio.currentTime;

    const protocolo = location.protocol === "https:" ? "wss:" : "ws:";

    conexion = new WebSocket(
      `${protocolo}//${location.host}/ws`
    );

    conexion.onopen = () => {
      llamadaActiva = true;
      mostrarEstado("Llamada en curso. Puedes hablar.");

      botonFinalizar.disabled = false;

      fuenteMicrofono = contextoAudio.createMediaStreamSource(
        microfono
      );

      procesador = contextoAudio.createScriptProcessor(
        4096,
        1,
        1
      );

      procesador.onaudioprocess = (evento) => {
        if (
          !llamadaActiva ||
          conexion.readyState !== WebSocket.OPEN
        ) {
          return;
        }

        const entrada = evento.inputBuffer.getChannelData(0);

        const remuestreada = convertirA16kHz(
          entrada,
          contextoAudio.sampleRate
        );

        const muestras = convertirFloatAInt16(remuestreada);

        conexion.send(JSON.stringify({
          audio: convertirInt16ABase64(muestras)
        }));
      };

      fuenteMicrofono.connect(procesador);

      // Mantiene activo el procesamiento del micrófono.
      procesador.connect(contextoAudio.destination);

      agregarTexto("Sistema: llamada iniciada. Saluda al cliente.");
    };

    conexion.onmessage = async (evento) => {
      const datos = JSON.parse(evento.data);

      if (datos.error) {
        mostrarEstado(datos.error);
        agregarTexto("Error: " + datos.error);
        return;
      }

      if (datos.texto) {
        agregarTexto("Cliente: " + datos.texto);
      }

      if (datos.audio) {
        if (contextoAudio.state === "suspended") {
          await contextoAudio.resume();
        }

        reproducirAudio(datos.audio);
      }
    };

    conexion.onerror = () => {
      mostrarEstado("Error de conexión con el servidor.");
    };

    conexion.onclose = () => {
      if (llamadaActiva) {
        detenerLlamada();
        mostrarEstado("Conexión cerrada.");
      }
    };

  } catch (error) {
    console.error(error);
    mostrarEstado("No se pudo iniciar: " + error.message);
    detenerLlamada();
  }
}

function detenerLlamada() {
  llamadaActiva = false;

  if (procesador) {
    procesador.disconnect();
    procesador.onaudioprocess = null;
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

  if (conexion) {
    if (conexion.readyState === WebSocket.OPEN) {
      conexion.send(JSON.stringify({ tipo: "finalizar" }));
      conexion.close();
    }

    conexion = null;
  }

  if (contextoAudio) {
    contextoAudio.close();
    contextoAudio = null;
  }

  botonIniciar.disabled = false;
  botonFinalizar.disabled = true;
}

botonIniciar.addEventListener("click", iniciarLlamada);

botonFinalizar.addEventListener("click", () => {
  detenerLlamada();
  mostrarEstado("Llamada finalizada.");
});
