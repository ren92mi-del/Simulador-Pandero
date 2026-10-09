
const botonIniciar = document.getElementById("iniciar");
const botonFinalizar = document.getElementById("finalizar");
const estado = document.getElementById("estado");
const panelDescargas = document.getElementById("descargas");
const enlaceAudio = document.getElementById("descargarAudio");
const enlaceTexto = document.getElementById("descargarTexto");

let conexion = null;
let microfono = null;
let contextoAudio = null;
let procesador = null;
let fuenteMicrofono = null;
let destinoGrabacion = null;
let grabadora = null;
let partesGrabacion = [];
let llamadaActiva = false;
let iniciando = false;
let siguienteAudio = 0;
let transcripcion = [];
let blobAudioFinal = null;
let urlAudioAnterior = null;
let urlTextoAnterior = null;

function mostrarEstado(mensaje) {
    if (estado) estado.textContent = "Estado: " + mensaje;
}

function guardarTexto(tipo, texto) {
    if (!texto || !texto.trim()) return;

    transcripcion.push({
        hora: new Date().toLocaleTimeString("es-PE"),
        tipo: tipo,
        texto: texto.trim()
    });
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

function prepararGrabacion() {
    if (!contextoAudio || !destinoGrabacion) return;

    if (!window.MediaRecorder) {
        console.warn("El navegador no permite grabar el audio.");
        return;
    }

    try {
        const opciones = {};
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            opciones.mimeType = "audio/webm;codecs=opus";
        }

        grabadora = new MediaRecorder(destinoGrabacion.stream, opciones);
        partesGrabacion = [];

        grabadora.ondataavailable = evento => {
            if (evento.data && evento.data.size > 0) {
                partesGrabacion.push(evento.data);
            }
        };

        grabadora.onstop = () => {
            if (partesGrabacion.length > 0) {
                const tipo = grabadora?.mimeType || "audio/webm";
                blobAudioFinal = new Blob(partesGrabacion, { type: tipo });
            }
            mostrarDescargas();
        };

        grabadora.start(1000);
    } catch (error) {
        console.error("No se pudo iniciar la grabación:", error);
        grabadora = null;
        // La grabación no debe impedir que la llamada funcione.
    }
}

function reproducirAudio(base64) {
    if (!contextoAudio || contextoAudio.state === "closed") return;

    try {
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

        // Se escucha al cliente y se incorpora su voz a la grabación.
        fuente.connect(contextoAudio.destination);
        if (destinoGrabacion) {
            fuente.connect(destinoGrabacion);
        }

        const inicio = Math.max(contextoAudio.currentTime, siguienteAudio);
        fuente.start(inicio);
        siguienteAudio = inicio + buffer.duration;
    } catch (error) {
        console.error("Error al reproducir el audio:", error);
    }
}

function mostrarDescargas() {
    if (enlaceAudio && blobAudioFinal && blobAudioFinal.size > 0) {
        if (urlAudioAnterior) URL.revokeObjectURL(urlAudioAnterior);

        urlAudioAnterior = URL.createObjectURL(blobAudioFinal);
        enlaceAudio.href = urlAudioAnterior;
        enlaceAudio.download = "llamada-pandero.webm";
        enlaceAudio.style.display = "";
    }

    if (enlaceTexto && transcripcion.length > 0) {
        if (urlTextoAnterior) URL.revokeObjectURL(urlTextoAnterior);

        const contenido = transcripcion.map(item =>
            `[${item.hora}] ${item.tipo}: ${item.texto}`
        ).join("\n\n");

        const archivo = new Blob(
            ["Transcripción de llamada Pandero\n\n" + contenido],
            { type: "text/plain;charset=utf-8" }
        );

        urlTextoAnterior = URL.createObjectURL(archivo);
        enlaceTexto.href = urlTextoAnterior;
        enlaceTexto.download = "transcripcion-pandero.txt";
        enlaceTexto.style.display = "";
    }

    if (panelDescargas) {
        panelDescargas.hidden = false;
        panelDescargas.style.display = "";
    }
}

async function iniciarLlamada() {
    if (llamadaActiva || iniciando) return;

    iniciando = true;
    botonIniciar.disabled = true;
    botonFinalizar.disabled = true;

    if (panelDescargas) {
        panelDescargas.hidden = true;
        panelDescargas.style.display = "none";
    }

    transcripcion = [];
    partesGrabacion = [];
    blobAudioFinal = null;
    siguienteAudio = 0;

    mostrarEstado("Solicitando permiso para usar el micrófono...");

    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "El navegador no permite usar el micrófono. Abre el simulador con HTTPS."
            );
        }

        microfono = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        contextoAudio = new AudioContext();
        await contextoAudio.resume();

        destinoGrabacion = contextoAudio.createMediaStreamDestination();

        mostrarEstado("Conectando con el servidor...");

        const protocolo = location.protocol === "https:" ? "wss:" : "ws:";
        const nuevaConexion = new WebSocket(
            `${protocolo}//${location.host}/ws`
        );

        conexion = nuevaConexion;

        nuevaConexion.onopen = () => {
            if (conexion !== nuevaConexion) return;

            try {
                fuenteMicrofono =
                    contextoAudio.createMediaStreamSource(microfono);

                // La voz del asesor entra a la grabación.
                fuenteMicrofono.connect(destinoGrabacion);

                procesador = contextoAudio.createScriptProcessor(
                    4096, 1, 1
                );

                procesador.onaudioprocess = evento => {
                    if (
                        !llamadaActiva ||
                        !conexion ||
                        conexion.readyState !== WebSocket.OPEN
                    ) return;

                    const entrada =
                        evento.inputBuffer.getChannelData(0);
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

                // Si falla la grabación, la llamada puede continuar.
                prepararGrabacion();

                llamadaActiva = true;
                iniciando = false;
                botonFinalizar.disabled = false;

                mostrarEstado("Llamada en curso. Habla con el cliente.");
                guardarTexto("Sistema", "Llamada iniciada.");
            } catch (error) {
                console.error("Error al preparar la llamada:", error);
                detenerLlamada("No se pudo preparar la llamada: " + error.message);
            }
        };

        nuevaConexion.onmessage = async evento => {
            if (conexion !== nuevaConexion) return;

            let datos;
            try {
                datos = JSON.parse(evento.data);
            } catch {
                console.error("Respuesta no válida del servidor.");
                return;
            }

            if (datos.error) {
                mostrarEstado("Error del servidor: " + datos.error);
                guardarTexto("Sistema", "Error: " + datos.error);
                console.error("Error del servidor:", datos.error);
                return;
            }

            if (datos.texto) {
                const tipo = datos.tipo === "asesor" ? "Asesor" : "Cliente";
                guardarTexto(tipo, datos.texto);
            }

            if (datos.audio && contextoAudio) {
                if (contextoAudio.state === "suspended") {
                    await contextoAudio.resume();
                }
                reproducirAudio(datos.audio);
            }
        };

        nuevaConexion.onerror = () => {
            if (conexion !== nuevaConexion) return;
            mostrarEstado("Error de conexión con el servidor.");
        };

        nuevaConexion.onclose = () => {
            if (conexion !== nuevaConexion) return;
            detenerLlamada("Conexión cerrada. Puedes volver a intentarlo.");
        };
    } catch (error) {
        console.error("Error al iniciar la llamada:", error);
        detenerLlamada("No se pudo iniciar: " + error.message);
    }
}

function detenerLlamada(mensaje = "Llamada finalizada.") {
    llamadaActiva = false;
    iniciando = false;

    if (procesador) {
        procesador.onaudioprocess = null;
        try { procesador.disconnect(); } catch {}
        procesador = null;
    }

    if (fuenteMicrofono) {
        try { fuenteMicrofono.disconnect(); } catch {}
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

        if (socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({ tipo: "finalizar" }));
            } catch (error) {
                console.warn("No se pudo enviar el cierre:", error);
            }
        }

        if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        ) {
            socket.close();
        }
    }

    if (grabadora && grabadora.state !== "inactive") {
        grabadora.stop();
    } else {
        mostrarDescargas();
    }

    grabadora = null;

    if (contextoAudio) {
        const audioAnterior = contextoAudio;
        contextoAudio = null;
        audioAnterior.close().catch(error =>
            console.warn("No se pudo cerrar el audio:", error)
        );
    }

    destinoGrabacion = null;
    siguienteAudio = 0;

    botonIniciar.disabled = false;
    botonFinalizar.disabled = true;
    mostrarEstado(mensaje);
}

function configurarSimulador() {
    if (!botonIniciar || !botonFinalizar || !estado) {
        console.error(
            "No se encontraron los elementos iniciar, finalizar o estado. Revisa frontend/index.html."
        );
        return;
    }

    botonIniciar.disabled = false;
    botonFinalizar.disabled = true;

    botonIniciar.addEventListener("click", iniciarLlamada);
    botonFinalizar.addEventListener("click", () => {
        detenerLlamada("Llamada finalizada.");
    });

    mostrarEstado("Listo para iniciar.");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", configurarSimulador);
} else {
    configurarSimulador();
}
