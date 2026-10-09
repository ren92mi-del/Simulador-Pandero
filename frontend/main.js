"use strict";

console.info("Simulador Pandero main.js build 2026-10-09");

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
let gananciaSilencio = null;
let grabadora = null;
let partesGrabacion = [];

let llamadaActiva = false;
let iniciando = false;
let siguienteAudio = 0;
let transcripcion = [];

let blobAudioFinal = null;
let urlAudioAnterior = null;
let urlTextoAnterior = null;
let numeroIntento = 0;

function mostrarEstado(mensaje) {
    if (estado) {
        estado.textContent = "Estado: " + mensaje;
    }
}

function guardarTexto(tipo, texto) {
    if (!texto || !texto.trim()) return;

    transcripcion.push({
        hora: new Date().toLocaleTimeString("es-PE"),
        tipo,
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

        salida[i] = valor < 0
            ? valor * 32768
            : valor * 32767;
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

function liberarUrlAnterior(url) {
    if (url) URL.revokeObjectURL(url);
}

function ocultarDescargas() {
    if (panelDescargas) {
        panelDescargas.hidden = true;
        panelDescargas.style.display = "none";
    }

    if (enlaceAudio) enlaceAudio.style.display = "none";
    if (enlaceTexto) enlaceTexto.style.display = "none";

    liberarUrlAnterior(urlAudioAnterior);
    liberarUrlAnterior(urlTextoAnterior);

    urlAudioAnterior = null;
    urlTextoAnterior = null;
}

function prepararGrabacion() {
    if (!contextoAudio || !destinoGrabacion) {
        return false;
    }

    if (!window.MediaRecorder) {
        console.warn("Este navegador no permite grabar audio.");
        return false;
    }

    try {
        const opciones = {};

        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            opciones.mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
            opciones.mimeType = "audio/webm";
        }

        const grabadoraActual = new MediaRecorder(
            destinoGrabacion.stream,
            opciones
        );

        grabadora = grabadoraActual;
        partesGrabacion = [];

        grabadoraActual.ondataavailable = evento => {
            if (evento.data && evento.data.size > 0) {
                partesGrabacion.push(evento.data);
            }
        };

        grabadoraActual.onerror = evento => {
            console.error("Error durante la grabación:", evento);
        };

        grabadoraActual.onstop = () => {
            if (partesGrabacion.length > 0) {
                const tipo = grabadoraActual.mimeType || "audio/webm";

                blobAudioFinal = new Blob(partesGrabacion, {
                    type: tipo
                });
            }

            if (grabadora === grabadoraActual) {
                grabadora = null;
            }

            mostrarDescargas();
        };

        grabadoraActual.start(1000);
        return true;
    } catch (error) {
        console.error("No se pudo iniciar la grabación:", error);
        grabadora = null;
        return false;
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

        // Reproduce la voz del cliente por los parlantes.
        fuente.connect(contextoAudio.destination);

        // Incorpora también la voz del cliente a la grabación.
        if (destinoGrabacion) {
            fuente.connect(destinoGrabacion);
        }

        const inicio = Math.max(
            contextoAudio.currentTime,
            siguienteAudio
        );

        fuente.start(inicio);
        siguienteAudio = inicio + buffer.duration;
    } catch (error) {
        console.error("Error al reproducir el audio:", error);
    }
}

function mostrarDescargas() {
    if (enlaceAudio && blobAudioFinal && blobAudioFinal.size > 0) {
        liberarUrlAnterior(urlAudioAnterior);

        urlAudioAnterior = URL.createObjectURL(blobAudioFinal);
        enlaceAudio.href = urlAudioAnterior;
        enlaceAudio.download = "llamada-pandero.webm";
        enlaceAudio.style.display = "block";
    }

    if (enlaceTexto && transcripcion.length > 0) {
        liberarUrlAnterior(urlTextoAnterior);

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
        enlaceTexto.style.display = "block";
    }

    if (panelDescargas) {
        panelDescargas.hidden = false;
        panelDescargas.style.display = "block";
    }
}

function limpiarAudio() {
    if (procesador) {
        procesador.onaudioprocess = null;
        try {
            procesador.disconnect();
        } catch {}
        procesador = null;
    }

    if (fuenteMicrofono) {
        try {
            fuenteMicrofono.disconnect();
        } catch {}
        fuenteMicrofono = null;
    }

    if (gananciaSilencio) {
        try {
            gananciaSilencio.disconnect();
        } catch {}
        gananciaSilencio = null;
    }

    if (microfono) {
        microfono.getTracks().forEach(pista => pista.stop());
        microfono = null;
    }

    if (contextoAudio) {
        const contextoAnterior = contextoAudio;
        contextoAudio = null;

        contextoAnterior.close().catch(error => {
            console.warn("No se pudo cerrar el audio:", error);
        });
    }

    destinoGrabacion = null;
    siguienteAudio = 0;
}

function detenerLlamada(mensaje = "Llamada finalizada.") {
    numeroIntento++;
    llamadaActiva = false;
    iniciando = false;

    const socket = conexion;
    conexion = null;

    if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.onopen = null;

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
            try {
                socket.close();
            } catch (error) {
                console.warn("No se pudo cerrar la conexión:", error);
            }
        }
    }

    const grabadoraActual = grabadora;

    if (grabadoraActual && grabadoraActual.state !== "inactive") {
        try {
            grabadoraActual.stop();
        } catch (error) {
            console.warn("No se pudo detener la grabación:", error);
            mostrarDescargas();
        }
    } else {
        grabadora = null;
        mostrarDescargas();
    }

    limpiarAudio();

    botonIniciar.disabled = false;
    botonFinalizar.disabled = true;

    mostrarEstado(mensaje);
}

async function iniciarLlamada() {
    if (llamadaActiva || iniciando) return;

    iniciando = true;
    const intento = ++numeroIntento;

    botonIniciar.disabled = true;
    botonFinalizar.disabled = true;

    ocultarDescargas();

    transcripcion = [];
    partesGrabacion = [];
    blobAudioFinal = null;
    siguienteAudio = 0;

    mostrarEstado("Solicitando permiso para usar el micrófono...");

    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "No se puede acceder al micrófono. Abre el simulador mediante HTTPS."
            );
        }

        microfono = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        if (intento !== numeroIntento) {
            microfono.getTracks().forEach(pista => pista.stop());
            microfono = null;
            return;
        }

        contextoAudio = new AudioContext();
        await contextoAudio.resume();

        if (intento !== numeroIntento) {
            limpiarAudio();
            return;
        }

        destinoGrabacion = contextoAudio.createMediaStreamDestination();

        mostrarEstado("Conectando con el servidor...");

        const protocolo = location.protocol === "https:" ? "wss:" : "ws:";
        const nuevaConexion = new WebSocket(
            `${protocolo}//${location.host}/ws`
        );

        conexion = nuevaConexion;

        nuevaConexion.onopen = () => {
            if (conexion !== nuevaConexion || intento !== numeroIntento) {
                nuevaConexion.close();
                return;
            }

            try {
                fuenteMicrofono =
                    contextoAudio.createMediaStreamSource(microfono);

                // Graba la voz del asesor, pero no la reproduce por los parlantes.
                fuenteMicrofono.connect(destinoGrabacion);

                procesador = contextoAudio.createScriptProcessor(
                    4096,
                    1,
                    1
                );

                // Evita escuchar la propia voz por los parlantes.
                gananciaSilencio = contextoAudio.createGain();
                gananciaSilencio.gain.value = 0;

                procesador.onaudioprocess = evento => {
                    if (
                        !llamadaActiva ||
                        !conexion ||
                        conexion.readyState !== WebSocket.OPEN ||
                        !contextoAudio
                    ) {
                        return;
                    }

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
                procesador.connect(gananciaSilencio);
                gananciaSilencio.connect(contextoAudio.destination);

                // La grabación no debe impedir el inicio de la llamada.
                prepararGrabacion();

                llamadaActiva = true;
                iniciando = false;

                botonFinalizar.disabled = false;

                mostrarEstado("Llamada en curso. Habla con el cliente.");
                guardarTexto("Sistema", "Llamada iniciada.");
            } catch (error) {
                console.error("Error preparando la llamada:", error);
                detenerLlamada(
                    "No se pudo preparar la llamada: " + error.message
                );
            }
        };

        nuevaConexion.onmessage = async evento => {
            if (
                conexion !== nuevaConexion ||
                intento !== numeroIntento
            ) {
                return;
            }

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

            // El servidor identifica por separado al asesor y al cliente.
            if (datos.texto) {
                const tipoTexto = datos.tipo === "asesor"
                    ? "Asesor"
                    : datos.tipo === "cliente"
                        ? "Cliente"
                        : "Cliente";
                guardarTexto(tipoTexto, datos.texto);
            }

            if (datos.audio && contextoAudio) {
                if (contextoAudio.state === "suspended") {
                    await contextoAudio.resume();
                }

                if (conexion === nuevaConexion && llamadaActiva) {
                    reproducirAudio(datos.audio);
                }
            }
        };

        nuevaConexion.onerror = () => {
            if (conexion !== nuevaConexion) return;

            mostrarEstado(
                "Error de conexión con el servidor. Revisa Render."
            );
        };

        nuevaConexion.onclose = () => {
            if (conexion !== nuevaConexion) return;

            detenerLlamada(
                "Conexión cerrada. Puedes volver a intentarlo."
            );
        };
    } catch (error) {
        if (intento !== numeroIntento) return;

        console.error("Error al iniciar la llamada:", error);

        detenerLlamada("No se pudo iniciar: " + error.message);
    }
}

function configurarSimulador() {
    if (
        !botonIniciar ||
        !botonFinalizar ||
        !estado
    ) {
        console.error(
            "Faltan elementos HTML. Revisa los identificadores iniciar, finalizar y estado."
        );

        if (estado) {
            estado.textContent =
                "Error: no se encontraron los elementos del simulador.";
        }

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
    document.addEventListener(
        "DOMContentLoaded",
        configurarSimulador,
        { once: true }
    );
} else {
    configurarSimulador();
}
