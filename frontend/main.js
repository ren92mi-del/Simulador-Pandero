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

function int16Base64(datos) {
  const bytes = new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength);
  let binario = "";
  for (let i = 0; i < bytes.length; i++) {
    binario += String.fromCharCode(bytes[i]);
  }
  return btoa(binario);
}

function convertirAudio(entrada, frecuencia) {
  const proporcion = frecuencia / 16000;
  const salida = new Int16Array(Math.floor(entrada.length / proporcion));

  for (let i = 0; i < salida.length; i++) {
    const valor = Math.max(-1, Math.min(1, entrada[Math.floor(i * proporcion)]));
    salida[i] = valor < 0 ? valor * 32768 : valor * 32767;
  }

  return salida;
}

function reproducirAudio(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  const muestras = new Int16Array(bytes.buffer);
  const buffer = contextoAudio.createBuffer(1, muestras.length, 24000);
  const canal = buffer.getChannelData(0);

  for (let i = 0; i < muestras.length; i++) canal[i] = muestras[i] / 32768;

  const fuente = contextoAudio.createBufferSource();
  fuente.buffer = buffer;
  fuente.connect(contextoAudio.destination);

  const inicio = Math.max(contextoAudio.currentTime, siguienteAudio);
  fuente.start(inicio);
  siguienteAudio = inicio + buffer.duration;
}

async function iniciarLlamada() {
  try {
    botonIniciar.disabled = true;
    mostrarEstado("Conectando y solicitando micrófono...");

    microfono = await navigator.mediaDevices.getUserMedia({ audio: true });
    contextoAudio = new AudioContext();
    await contextoAudio.resume();

    const protocolo = location.protocol === "https:" ? "wss:" : "ws:";
    conexion = new WebSocket(`${protocolo}//${location.host}/ws`);

    conexion.onopen = () => {
      llamadaActiva = true;
      mostrarEstado("Llamada en curso. Habla con el cliente.");
      botonFinalizar.disabled = false;

      fuenteMicrofono = contextoAudio.createMediaStreamSource(microfono);
      procesador = contextoAudio.createScriptProcessor(4096, 1, 1);

      procesador.onaudioprocess = (evento) => {
        if (!llamadaActiva || !conexion || conexion.readyState !== WebSocket.OPEN) return;

        const entrada = evento.inputBuffer.getChannelData(0);
        const muestras = convertirAudio(entrada, contextoAudio.sampleRate);

        conexion.send(JSON.stringify({ audio: int16Base64(muestras) }));
      };

      fuenteMicrofono.connect(procesador);
      procesador.connect(contextoAudio.destination);
      agregarTexto("Sistema: llamada iniciada. Saluda al cliente.");
    };

    conexion.onmessage = async (evento) => {
      const datos = JSON.parse(evento.data);

      if (datos.error) {
        mostrarEstado("Error: " + datos.error);
        agregarTexto("Error: " + datos.error);
        return;
      }

      if (datos.texto) agregarTexto("Cliente: " + datos.texto);

      if (datos.audio && contextoAudio) {
        if (contextoAudio.state === "suspended") await contextoAudio.resume();
        reproducirAudio(datos.audio);
      }
    };

    conexion.onerror = () => mostrarEstado("Error de conexión. Revisa el servidor.");
    conexion.onclose = () => {
      if (llamadaActiva) detenerLlamada();
      mostrarEstado("Conexión cerrada.");
    };
  } catch (error) {
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
    const socket = conexion;
    conexion = null;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ tipo: "finalizar" }));
      socket.close();
    }
  }

  if (contextoAudio) {
    contextoAudio.close();
    contextoAudio = null;
  }

  botonIniciar.disabled = false;
  botonFinalizar.disabled = true;
}

if (botonIniciar && botonFinalizar && estado && conversacion) {
  botonIniciar.addEventListener("click", iniciarLlamada);
  botonFinalizar.addEventListener("click", () => {
    detenerLlamada();
    mostrarEstado("Llamada finalizada.");
  });
} else {
  console.error("No se encontraron los elementos de la interfaz del simulador.");
}
