
import os
import json
import base64
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types

app = FastAPI()

app.mount(
    "/frontend",
    StaticFiles(directory="frontend"),
    name="frontend"
)


@app.get("/")
async def inicio():
    return FileResponse("frontend/index.html")


@app.websocket("/ws")
async def llamada(websocket: WebSocket):
    await websocket.accept()

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        await websocket.send_json({
            "error": "Falta configurar GEMINI_API_KEY en Render."
        })
        await websocket.close()
        return

    cliente = genai.Client(api_key=api_key)

    instrucciones = """
    Eres un cliente de Pandero en Perú en una llamada real de
    atención al cliente.

    El asesor humano inicia la conversación. Tú respondes como
    cliente y mantienes una conversación continua por voz.

    Escucha lo que dice el asesor, responde de forma natural,
    haz preguntas cuando corresponda y recuerda el contexto.
    No repitas el saludo en cada turno.
    No finalices la conversación después de tu primera respuesta.
    No inventes montos, políticas ni procedimientos de Pandero.
    No evalúes al asesor ni salgas del papel de cliente.
    Habla en español peruano natural y con respuestas breves.
    """

    tareas = []

    try:
        async with cliente.aio.live.connect(
            model="gemini-3.8-live",
            config={
                "response_modalities": ["AUDIO"],
                "system_instruction": instrucciones,
            }
        ) as sesion:

            async def recibir_audio():
                while True:
                    mensaje = await websocket.receive_text()
                    datos = json.loads(mensaje)

                    if datos.get("tipo") == "finalizar":
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
                    # Recibe mensajes continuamente, incluso
                    # después de terminar cada respuesta de Gemini.
                    respuesta = await sesion._receive()

                    if respuesta is None:
                        print("Gemini cerró la recepción.")
                        return

                    contenido = respuesta.server_content

                    if not contenido:
                        continue

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

                            if parte.text:
                                await websocket.send_json({
                                    "texto": parte.text
                                })

                    transcripcion = contenido.output_transcription

                    if transcripcion and transcripcion.text:
                        await websocket.send_json({
                            "texto": transcripcion.text
                        })

            tareas.extend([
                asyncio.create_task(recibir_audio()),
                asyncio.create_task(enviar_respuestas())
            ])

            terminadas, pendientes = await asyncio.wait(
                tareas,
                return_when=asyncio.FIRST_COMPLETED
            )

            for tarea in terminadas:
                if tarea.cancelled():
                    continue

                error = tarea.exception()

                if error:
                    print(
                        "Error en tarea de llamada:",
                        type(error).__name__,
                        str(error)
                    )

            for tarea in pendientes:
                tarea.cancel()

            await asyncio.gather(
                *pendientes,
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
