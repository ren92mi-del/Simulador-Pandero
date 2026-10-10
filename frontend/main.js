"use strict";

console.info("Simulador Pandero main.js build 2026-10-09 Excel profiles");

const botonIniciar = document.getElementById("iniciar");
const botonFinalizar = document.getElementById("finalizar");
const estado = document.getElementById("estado");
const panelDescargas = document.getElementById("descargas");
const enlaceAudio = document.getElementById("descargarAudio");
const enlaceTexto = document.getElementById("descargarTexto");
const archivoAsociados = document.getElementById("archivoAsociados");
const botonCargarAsociados = document.getElementById("cargarAsociados");
const estadoBase = document.getElementById("estadoBase");
const modoEscenario = document.getElementById("modoEscenario");
const escenarioSeleccionado = document.getElementById("escenarioSeleccionado");
const panelEvaluacion = document.getElementById("evaluacion");
const contenidoEvaluacion = document.getElementById("contenidoEvaluacion");
const archivoManual = document.getElementById("archivoManual");
const botonCargarManual = document.getElementById("cargarManual");
const estadoManual = document.getElementById("estadoManual");

let baseCargada = false;
let manualCargado = false;
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
let escenarioActual = "";
let evaluacionSolicitada = false;

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

function mostrarEstadoBase(mensaje) {
    if (estadoBase) estadoBase.textContent = mensaje;
}

function actualizarDisponibilidad() {
    if (botonIniciar) botonIniciar.disabled = !(baseCargada && manualCargado) || llamadaActiva || iniciando;
}

async function consultarEstadoBase() {
    try {
        const respuesta = await fetch("/api/asociados/estado", {
            cache: "no-store"
        });
        if (!respuesta.ok) throw new Error("No se pudo consultar el estado de la base.");
        const datos = await respuesta.json();
        baseCargada = Boolean(datos.cargada && datos.cantidad > 0);
        actualizarDisponibilidad();
        mostrarEstadoBase(baseCargada
            ? "Base lista: " + datos.cantidad + " asociados cargados (" + datos.archivo + "). Cada llamada usará un perfil aleatorio."
            : "Debes cargar una base Excel para iniciar una llamada.");
    } catch (error) {
        baseCargada = false;
        actualizarDisponibilidad();
        mostrarEstadoBase("No se pudo verificar la base. Recarga la página o vuelve a cargar el Excel.");
        console.error("Error consultando la base:", error);
    }
}



async function consultarEstadoManual() {
    try {
        const respuesta = await fetch("/api/manual/estado", { cache: "no-store" });
        if (!respuesta.ok) throw new Error("No se pudo consultar el estado del manual.");
        const datos = await respuesta.json();
        manualCargado = Boolean(datos.cargado && datos.caracteres > 0);
        if (estadoManual) {
            estadoManual.textContent = manualCargado
                ? "Manual listo: " + datos.paginas + " páginas procesadas (" + datos.archivo + "). Se mantiene en memoria durante esta sesión del servidor."
                : "Debes cargar el manual PDF para usar todos los procedimientos.";
        }
        actualizarDisponibilidad();
    } catch (error) {
        manualCargado = false;
        if (estadoManual) estadoManual.textContent = "No se pudo verificar el manual. Vuelve a cargar el PDF.";
        actualizarDisponibilidad();
        console.error("Error consultando el manual:", error);
    }
}

async function subirManualPDF() {
    const archivo = archivoManual?.files?.[0];
    if (!archivo) {
        if (estadoManual) estadoManual.textContent = "Primero selecciona el manual PDF.";
        return;
    }
    if (botonCargarManual) botonCargarManual.disabled = true;
    if (estadoManual) estadoManual.textContent = "Leyendo y procesando el PDF en memoria...";
    try {
        const formulario = new FormData();
        formulario.append("archivo", archivo);
        const respuesta = await fetch("/api/manual", { method: "POST", body: formulario });
        const datos = await respuesta.json();
        if (!respuesta.ok) throw new Error(datos.detail || "No se pudo cargar el manual.");
        manualCargado = true;
        if (estadoManual) estadoManual.textContent = datos.mensaje || ("Manual listo: " + datos.paginas + " páginas.");
        archivoManual.value = "";
        actualizarDisponibilidad();
    } catch (error) {
        manualCargado = false;
        if (estadoManual) estadoManual.textContent = "Error: " + error.message;
        actualizarDisponibilidad();
        console.error("Error cargando el manual PDF:", error);
    } finally {
        if (botonCargarManual) botonCargarManual.disabled = false;
    }
}

async function cargarEscenarios() {
    if (!escenarioSeleccionado) return;
    try {
        const respuesta = await fetch("/api/escenarios", { cache: "no-store" });
        if (!respuesta.ok) throw new Error("No se pudieron cargar los temas.");
        const datos = await respuesta.json();
        escenarioSeleccionado.replaceChildren();
        let categoriaActual = "";
        let grupo = null;
        for (const escenario of (datos.escenarios || [])) {
            if (escenario.categoria !== categoriaActual) {
                categoriaActual = escenario.categoria;
                grupo = document.createElement("optgroup");
                grupo.label = categoriaActual;
                escenarioSeleccionado.appendChild(grupo);
            }
            const opcion = document.createElement("option");
            opcion.value = escenario.id;
            opcion.textContent = escenario.nombre;
            grupo.appendChild(opcion);
        }
        if (!escenarioSeleccionado.options.length) throw new Error("La lista de temas está vacía.");
        escenarioSeleccionado.disabled = modoEscenario?.value !== "manual";
    } catch (error) {
        console.error("Error cargando temas:", error);
        escenarioSeleccionado.replaceChildren();
        const opcion = document.createElement("option");
        opcion.value = "";
        opcion.textContent = "No se pudieron cargar los temas";
        escenarioSeleccionado.appendChild(opcion);
    }
}

function renderizarEvaluacion(datos) {
    if (!panelEvaluacion || !contenidoEvaluacion) return;
    contenidoEvaluacion.replaceChildren();
    const nota = document.createElement("div");
    nota.className = "nota-evaluacion";
    nota.textContent = Number(datos.nota).toFixed(1) + " / 20";
    contenidoEvaluacion.appendChild(nota);
    const tema = document.createElement("p");
    tema.textContent = "Tema: " + (datos.tema || "Consulta general");
    contenidoEvaluacion.appendChild(tema);
    const resumen = document.createElement("p");
    resumen.textContent = datos.resumen || "Evaluación generada a partir de la transcripción disponible.";
    contenidoEvaluacion.appendChild(resumen);
    const grupos = [["Errores detectados", datos.errores], ["Recomendaciones", datos.recomendaciones], ["Fortalezas", datos.fortalezas]];
    for (const [titulo, elementos] of grupos) {
        const h = document.createElement("h3");
        h.textContent = titulo;
        contenidoEvaluacion.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "lista-evaluacion";
        const lista = Array.isArray(elementos) ? elementos : [];
        if (!lista.length) {
            const li = document.createElement("li");
            li.textContent = titulo === "Errores detectados" ? "No se identificaron errores verificables." : "Sin observaciones adicionales.";
            ul.appendChild(li);
        } else {
            for (const texto of lista) {
                const li = document.createElement("li");
                li.textContent = String(texto);
                ul.appendChild(li);
            }
        }
        contenidoEvaluacion.appendChild(ul);
    }
    if (Array.isArray(datos.criterios) && datos.criterios.length) {
        const h = document.createElement("h3");
        h.textContent = "Detalle por criterio";
        contenidoEvaluacion.appendChild(h);
        for (const criterio of datos.criterios) {
            const bloque = document.createElement("div");
            bloque.className = "criterio-evaluacion";
            const nombre = document.createElement("strong");
            nombre.textContent = (criterio.nombre || "Criterio") + ": " + (criterio.puntaje ?? 0) + " / " + (criterio.maximo ?? 0);
            const observacion = document.createElement("span");
            observacion.textContent = criterio.observacion || "";
            bloque.append(nombre, observacion);
            contenidoEvaluacion.appendChild(bloque);
        }
    }
    if (datos.requiere_revision_humana) {
        const aviso = document.createElement("p");
        aviso.textContent = "Revisión recomendada: la llamada pudo ser demasiado breve o la evidencia no fue suficiente para una calificación concluyente.";
        contenidoEvaluacion.appendChild(aviso);
    }
    panelEvaluacion.hidden = false;
    panelEvaluacion.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function evaluarLlamada() {
    if (evaluacionSolicitada) return;
    const hayAsesor = transcripcion.some(item => item.tipo === "Asesor");
    const hayCliente = transcripcion.some(item => item.tipo === "Cliente");
    if (!hayAsesor || !hayCliente) return;
    evaluacionSolicitada = true;
    mostrarEstado("Llamada finalizada. Generando evaluación sobre 20...");
    if (panelEvaluacion) panelEvaluacion.hidden = false;
    if (contenidoEvaluacion) contenidoEvaluacion.textContent = "Analizando la transcripción y los criterios de calidad...";
    try {
        const respuesta = await fetch("/api/evaluar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcripcion: transcripcion.slice(), escenario: escenarioActual })
        });
        const datos = await respuesta.json();
        if (!respuesta.ok) throw new Error(datos.detail || "No se pudo evaluar la llamada.");
        renderizarEvaluacion(datos);
        mostrarEstado("Evaluación lista. Revisa la nota, errores y recomendaciones.");
    } catch (error) {
        console.error("Error evaluando llamada:", error);
        if (contenidoEvaluacion) contenidoEvaluacion.textContent = "No se pudo generar la evaluación: " + error.message + ".";
        mostrarEstado("La llamada terminó, pero no se pudo generar la evaluación.");
    }
}

async function cargarBaseAsociados() {
    const archivo = archivoAsociados?.files?.[0];
    if (!archivo) {
        mostrarEstadoBase("Primero selecciona un archivo Excel (.xlsx).");
        return;
    }

    botonCargarAsociados.disabled = true;
    mostrarEstadoBase("Cargando y validando el archivo Excel...");

    try {
        const formulario = new FormData();
        formulario.append("archivo", archivo);

        const respuesta = await fetch("/api/asociados", {
            method: "POST",
            body: formulario
        });
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(datos.detail || "No se pudo cargar el archivo.");
        }

        baseCargada = true;
        actualizarDisponibilidad();
        mostrarEstadoBase(datos.mensaje + " La ficha completa no se muestra en pantalla.");
        archivoAsociados.value = "";
    } catch (error) {
        mostrarEstadoBase("Error: " + error.message);
        console.error("Error cargando Excel:", error);
    } finally {
        botonCargarAsociados.disabled = false;
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

    botonIniciar.disabled = !baseCargada;
    botonFinalizar.disabled = true;

    mostrarEstado(mensaje);
    evaluarLlamada();
}

async function iniciarLlamada() {
    if (llamadaActiva || iniciando) return;

    if (!baseCargada) {
        mostrarEstado("Primero carga una base de asociados en Excel (.xlsx).");
        return;
    }
    if (!manualCargado) {
        mostrarEstado("Primero carga el manual de procedimientos Pandero en PDF.");
        return;
    }

    iniciando = true;
    const intento = ++numeroIntento;

    botonIniciar.disabled = true;
    botonFinalizar.disabled = true;

    ocultarDescargas();
    if (panelEvaluacion) panelEvaluacion.hidden = true;
    if (contenidoEvaluacion) contenidoEvaluacion.replaceChildren();
    evaluacionSolicitada = false;

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
        const modo = modoEscenario?.value || "automatico";
        escenarioActual = modo === "manual" ? (escenarioSeleccionado?.value || "") : "";
        if (modo === "manual" && !escenarioActual) throw new Error("Selecciona un tema de práctica antes de iniciar.");
        const parametros = new URLSearchParams({ modo });
        if (escenarioActual) parametros.set("escenario", escenarioActual);
        const nuevaConexion = new WebSocket(
            `${protocolo}//${location.host}/ws?${parametros.toString()}`
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

            if (datos.tipo === "escenario_asignado") {
                escenarioActual = datos.escenario || escenarioActual;
                mostrarEstado("Tema de práctica: " + (datos.nombre || "asignado") + ". Inicia la conversación cuando estés listo.");
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

    botonIniciar.disabled = true;
    botonFinalizar.disabled = true;

    botonIniciar.addEventListener("click", iniciarLlamada);

    if (botonCargarAsociados) {
        botonCargarAsociados.addEventListener("click", cargarBaseAsociados);
    }
    if (botonCargarManual) {
        botonCargarManual.addEventListener("click", subirManualPDF);
    }
    if (modoEscenario && escenarioSeleccionado) {
        modoEscenario.addEventListener("change", () => {
            escenarioSeleccionado.disabled = modoEscenario.value !== "manual";
        });
    }
    cargarEscenarios();
    consultarEstadoBase();
    consultarEstadoManual();

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
