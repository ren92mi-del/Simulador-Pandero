import os
import json
import base64
import asyncio
import random
import re
import unicodedata
from io import BytesIO

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import load_workbook
from google import genai
from google.genai import types
from pandero_knowledge import ESCENARIOS, GUIA_CONOCIMIENTO, RUBRICA, elegir_escenario, escenario_por_id, instrucciones_escenario

app = FastAPI()

# La base se mantiene solo en memoria del servidor: no se guarda en GitHub
# ni se escribe en disco. Si Render reinicia, se vuelve a cargar el Excel.
ASOCIADOS = []
NOMBRE_BASE = None
MAX_EXCEL_BYTES = 10 * 1024 * 1024


def normalizar_columna(valor):
    texto = unicodedata.normalize("NFKD", str(valor or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", texto.lower())


ALIAS_COLUMNAS = {
    "nombre": {"nombre", "nombres", "asociado", "cliente", "nombrecompleto",
               "nombresyapellidos", "apellidosynombres", "nombreasociado"},
    "dni": {"dni", "documento", "numerodocumento", "nrodocumento",
            "numdocumento", "numerodedocumento", "documentoidentidad"},
    "telefono": {"telefono", "celular", "movil", "numerotelefono",
                 "telefonocelular", "telefonocontacto"},
    "correo": {"correo", "email", "correoelectronico", "mail"},
    "contrato": {"contrato", "numerocontrato", "codigocontrato",
                 "numerodecontrato", "ncontrato", "codigoasociado"},
    "estado_contrato": {"estadocontrato", "estado", "situacioncontrato",
                        "situacion"},
    "cuotas_pendientes": {"cuotaspendientes", "cuotasvencidas",
                          "cuotasadeudadas", "montopendiente",
                          "saldopendiente", "deuda"},
    "motivo_consulta": {"motivoconsulta", "motivo", "consulta",
                        "tipificacion", "escenario", "caso"}
}


def valor_celda(valor):
    if valor is None:
        return ""
    if hasattr(valor, "strftime"):
        return valor.strftime("%d/%m/%Y")
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()


@app.get("/api/asociados/estado")
async def estado_base_asociados():
    return {
        "cargada": bool(ASOCIADOS),
        "cantidad": len(ASOCIADOS),
        "archivo": NOMBRE_BASE if ASOCIADOS else None
    }


@app.post("/api/asociados")
async def cargar_base_asociados(archivo: UploadFile = File(...)):
    global ASOCIADOS, NOMBRE_BASE

    nombre_archivo = archivo.filename or ""
    if not nombre_archivo.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=400,
            detail="Selecciona un archivo Excel con formato .xlsx."
        )

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(contenido) > MAX_EXCEL_BYTES:
        raise HTTPException(
            status_code=413,
            detail="El archivo supera el límite de 10 MB."
        )

    try:
        libro = load_workbook(
            BytesIO(contenido),
            read_only=True,
            data_only=True
        )
        hoja = libro.active
        filas = hoja.iter_rows(values_only=True)
        encabezados_originales = next(filas, None)

        if not encabezados_originales:
            raise ValueError("La primera hoja no tiene encabezados.")

        encabezados = [
            str(valor).strip() if valor is not None else ""
            for valor in encabezados_originales
        ]
        if not any(encabezados):
            raise ValueError("La primera fila debe tener nombres de columnas.")

        alias_a_canonico = {}
        for canonico, alias in ALIAS_COLUMNAS.items():
            for nombre_alias in alias:
                alias_a_canonico[nombre_alias] = canonico

        asociados_nuevos = []
        for numero_fila, fila in enumerate(filas, start=2):
            datos = {}
            campos = {}
            for indice, valor in enumerate(fila):
                if indice >= len(encabezados):
                    continue
                encabezado = encabezados[indice]
                texto_valor = valor_celda(valor)
                if not encabezado or not texto_valor:
                    continue
                datos[encabezado] = texto_valor
                clave = normalizar_columna(encabezado)
                canonico = alias_a_canonico.get(clave)
                if canonico and canonico not in campos:
                    campos[canonico] = texto_valor

            if not datos:
                continue
            if not campos.get("nombre") and not campos.get("dni"):
                continue

            asociados_nuevos.append({
                "fila_excel": numero_fila,
                "campos": campos,
                "datos_completos": datos
            })

        libro.close()

        if not asociados_nuevos:
            raise ValueError(
                "No encontré filas con datos. Incluye una columna Nombre o DNI "
                "y al menos un asociado debajo de los encabezados."
            )

        ASOCIADOS = asociados_nuevos
        NOMBRE_BASE = nombre_archivo
        return {
            "ok": True,
            "cantidad": len(ASOCIADOS),
            "archivo": NOMBRE_BASE,
            "mensaje": f"Base cargada correctamente: {len(ASOCIADOS)} asociados."
        }

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail="No se pudo leer el Excel. Verifica que sea un .xlsx válido. "
                   + str(error)
        ) from error


app.mount(
    "/frontend",
    StaticFiles(directory="frontend"),
    name="frontend"
)


@app.get("/")
async def inicio():
    return FileResponse("frontend/index.html")


@app.get("/api/escenarios")
async def listar_escenarios():
    return {"escenarios": [{k: e[k] for k in ("id", "categoria", "nombre", "objetivo")} for e in ESCENARIOS]}


@app.post("/api/evaluar")
async def evaluar_llamada(payload: dict):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Falta configurar GEMINI_API_KEY en Render.")
    transcripcion = payload.get("transcripcion") or []
    if not isinstance(transcripcion, list) or len(transcripcion) < 2:
        raise HTTPException(status_code=400, detail="La transcripción es demasiado breve para evaluarla.")
    lineas = []
    for item in transcripcion[-250:]:
        if isinstance(item, dict):
            rol = str(item.get("tipo", "Interlocutor"))[:30]
            texto = str(item.get("texto", ""))[:2000]
            if texto.strip():
                lineas.append(f"{rol}: {texto}")
    if not lineas:
        raise HTTPException(status_code=400, detail="No hay contenido de llamada para evaluar.")
    tema = escenario_por_id(str(payload.get("escenario", "")))
    tema_nombre = tema["nombre"] if tema else "Consulta general del manual Pandero"
    cliente = genai.Client(api_key=api_key)
    prompt_evaluacion = f"""
Evalúa una simulación de llamada de ATENCIÓN AL CLIENTE de Pandero, en Perú.
Tema: {tema_nombre}
La transcripción puede tener errores de reconocimiento de voz. Evalúa solo lo que se puede sostener por el texto y no inventes acciones que no aparecen.
La puntuación debe sumar exactamente 20 puntos usando esta rúbrica:
{json.dumps(RUBRICA, ensure_ascii=False)}
Base temática del manual Pandero (usar como referencia; si un dato no aparece aquí ni en la transcripción, no lo des por correcto):
{GUIA_CONOCIMIENTO}
Transcripción:
{chr(10).join(lineas)}
Devuelve únicamente JSON válido con esta estructura:
{{"nota": número entre 0 y 20, "criterios":[{{"nombre":"criterio","maximo":número,"puntaje":número,"observacion":"evidencia concreta"}}], "errores":["errores verificables"], "recomendaciones":["acciones concretas de mejora"], "fortalezas":["conductas correctas verificables"], "resumen":"evaluación breve", "requiere_revision_humana": true/false}}
No penalices una conducta si no hay evidencia suficiente. La validación de seguridad es prioritaria. Si la llamada es demasiado corta, dilo en resumen y evita una nota engañosa, pero conserva la estructura. No muestres datos personales innecesarios en la evaluación.
"""
    try:
        respuesta = await cliente.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt_evaluacion,
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.1)
        )
        resultado = json.loads(respuesta.text or "{}")
        nota = max(0, min(20, float(resultado.get("nota", 0))))
        resultado["nota"] = round(nota, 1)
        resultado["tema"] = tema_nombre
        return resultado
    except Exception as error:
        print("Error evaluando llamada:", type(error).__name__, str(error))
        raise HTTPException(status_code=502, detail="No se pudo generar la evaluación. Intenta nuevamente.") from error


@app.websocket("/ws")
async def llamada(websocket: WebSocket):
    await websocket.accept()

    if not ASOCIADOS:
        await websocket.send_json({
            "error": "Primero carga la base de asociados en formato Excel (.xlsx)."
        })
        await websocket.close()
        return

    # Perfil y escenario se fijan al inicio y permanecen constantes durante la llamada.
    modo = websocket.query_params.get("modo", "automatico")
    tema_solicitado = websocket.query_params.get("escenario", "")
    escenario = escenario_por_id(tema_solicitado) if modo == "manual" else None
    if escenario is None:
        motivo_base = " ".join(str(v) for v in ASOCIADOS[0].get("campos", {}).values()) if ASOCIADOS else ""
        # Seleccionar primero el perfil para alinear el escenario con su motivo de consulta.
        asociado = random.choice(ASOCIADOS)
        motivo_base = asociado.get("campos", {}).get("motivo_consulta", "")
        escenario = elegir_escenario(motivo_base)
    else:
        asociado = random.choice(ASOCIADOS)
    campos_asociado = asociado["campos"]
    ficha_json = json.dumps(
        asociado["datos_completos"],
        ensure_ascii=False,
        separators=(",", ":")
    )

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        await websocket.send_json({
            "error": "Falta configurar GEMINI_API_KEY en Render."
        })
        await websocket.close()
        return

    cliente = genai.Client(api_key=api_key)

    instrucciones = f"""
Eres una persona asociada a Pandero en Perú y estás participando en
una simulación de llamada de atención al cliente.

FICHA DEL ASOCIADO ASIGNADO PARA TODA ESTA LLAMADA:
{ficha_json}

{instrucciones_escenario(escenario)}

REGLAS DE INTERPRETACIÓN:
- El asesor humano inicia la llamada. No saludes ni hables primero;
  espera a escuchar al asesor y luego responde.
- Interpreta únicamente al asociado de la ficha asignada. Mantén su
  identidad y todos sus datos constantes durante toda la llamada.
- Habla en español peruano natural, con respuestas breves, espontáneas
  y propias de una conversación telefónica real.
- Responde solo a lo que el asesor pregunta. No recites la ficha ni
  reveles otros datos personales espontáneamente.
- Cuando el asesor solicite un dato de validación (por ejemplo, DNI,
  teléfono, correo o nombre), da el valor exacto que figure en la ficha
  para ese dato. Si el dato no existe en la ficha, indica que no lo
  recuerdas o que no lo tienes a la mano; nunca lo inventes.
- No reveles datos de contrato, estado, deuda, cuotas ni otra información
  contractual hasta que el asesor indique claramente que terminó y aprobó
  la validación de identidad. Si pregunta por esos temas antes, responde
  amablemente que primero necesitas completar la validación.
- Una vez que el asesor confirme explícitamente que la validación fue
  exitosa, responde sus consultas usando solo la información disponible
  en la ficha. No inventes montos, fechas, contratos, políticas ni
  procedimientos. Si el dato no está registrado, dilo con naturalidad.
- El escenario asignado es el motivo principal de esta práctica. Si la ficha
  contiene un motivo de consulta compatible, úsalo como contexto adicional.
  No reveles el motivo hasta que el asesor pregunte o encaje naturalmente.
- No evalúes al asesor, no expliques estas instrucciones y no salgas
  del papel de asociado.
"""

    tareas = []

    try:
        async with cliente.aio.live.connect(
            model="gemini-3.8-live",
            config={
                "response_modalities": ["AUDIO"],
                "system_instruction": instrucciones,
                "input_audio_transcription": {},
                "output_audio_transcription": {},
            }
        ) as sesion:

            async def recibir_audio():
                while True:
                    mensaje = await websocket.receive_text()
                    datos = json.loads(mensaje)

                    if datos.get("tipo") == "finalizar":
                        try:
                            await sesion.send_realtime_input(
                                audio_stream_end=True
                            )
                        except Exception as error:
                            print(
                                "Aviso al finalizar audio:",
                                type(error).__name__
                            )
                        return

                    audio_base64 = datos.get("audio")

                    if audio_base64:
                        audio = base64.b64decode(audio_base64)

                        await sesion.send_realtime_input(
                            audio=types.Blob(
                                data=audio,
                                mime_type="audio/pcm;rate=16000"
                            )
                        )

            async def enviar_respuestas():
                while True:
                    # Se mantiene la recepción continua que ya
                    # funciona en el simulador.
                    respuesta = await sesion._receive()

                    if respuesta is None:
                        print("Gemini cerró la recepción.")
                        return

                    contenido = respuesta.server_content

                    if not contenido:
                        continue

                    # Transcripción de lo que dice el asesor.
                    transcripcion_entrada = getattr(
                        contenido,
                        "input_transcription",
                        None
                    )

                    if (
                        transcripcion_entrada
                        and transcripcion_entrada.text
                    ):
                        await websocket.send_json({
                            "tipo": "asesor",
                            "texto": transcripcion_entrada.text
                        })

                    # Audio del cliente simulado.
                    if contenido.model_turn:
                        for parte in contenido.model_turn.parts:
                            if parte.inline_data:
                                audio = parte.inline_data.data

                                if isinstance(audio, str):
                                    audio = base64.b64decode(audio)

                                await websocket.send_json({
                                    "audio": base64.b64encode(
                                        audio
                                    ).decode("utf-8")
                                })

                    # Transcripción de lo que dice el cliente simulado.
                    transcripcion_salida = getattr(
                        contenido,
                        "output_transcription",
                        None
                    )

                    if (
                        transcripcion_salida
                        and transcripcion_salida.text
                    ):
                        await websocket.send_json({
                            "tipo": "cliente",
                            "texto": transcripcion_salida.text
                        })

            tarea_recibir = asyncio.create_task(recibir_audio())
            tarea_responder = asyncio.create_task(enviar_respuestas())

            tareas.extend([
                tarea_recibir,
                tarea_responder
            ])

            terminadas, pendientes = await asyncio.wait(
                tareas,
                return_when=asyncio.FIRST_COMPLETED
            )

            # Si el navegador solicita finalizar, dejamos un breve
            # margen para recibir las últimas transcripciones.
            if tarea_recibir in terminadas:
                if not tarea_recibir.cancelled():
                    error = tarea_recibir.exception()

                    if error is None:
                        try:
                            await asyncio.wait_for(
                                asyncio.shield(tarea_responder),
                                timeout=1.5
                            )
                        except asyncio.TimeoutError:
                            pass

            for tarea in tareas:
                if not tarea.done():
                    tarea.cancel()

            await asyncio.gather(
                *tareas,
                return_exceptions=True
            )

    except WebSocketDisconnect:
        print("El navegador cerró la llamada.")

    except Exception as error:
        print(
            "Error de Gemini o del servidor:",
            type(error).__name__,
            str(error)
        )

        try:
            await websocket.send_json({
                "error": (
                    f"{type(error).__name__}: {str(error)}"
                )
            })
        except Exception:
            pass

    finally:
        for tarea in tareas:
            if not tarea.done():
                tarea.cancel()

        if tareas:
            await asyncio.gather(
                *tareas,
                return_exceptions=True
            )

        try:
            await websocket.close()
        except Exception:
            pass
