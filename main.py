
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
            "error": "Falta configurar la clave de Gemini en el servidor."
        })
        await websocket.close()
        return

    cliente = genai.Client(api_key=api_key)

    instrucciones = """
    Actúa como un cliente de Pandero en Perú durante una llamada de atención.
    Habla siempre en español peruano natural y responde exclusivamente como
    cliente. Mantén una conversación realista y breve con el asesor.
    El asesor inicia la conversación y tú respondes a lo que diga.
    Puedes hacer preguntas o pedir aclaraciones si corresponde.
    No inventes montos, políticas ni procedimientos de Pandero.
    No evalúes al asesor ni salgas del papel de cliente.
    """

    configuracion = {
        "response_modalities": ["AUDIO"],
        "system_instruction": instrucciones
    }

    try:
        async with cliente.aio.live.connect(
            model="gemini-3.8-live",
            config=configuracion
        ) as sesion:

            async def recibir_del_navegador():
                while True:
                    mensaje = await websocket.receive_text()
                    datos = json.loads(mensaje)

                    if datos.get("tipo") == "finalizar":
                        return

                    if datos.get("audio"):
                        audio = base64.b64decode(datos["audio"])

                        await sesion.send_realtime_input(
                            audio=types.Blob(
                                data=audio,
                                mime_type="audio/pcm;rate=16000"
                            )
                        )

            async def enviar_al_navegador():
                async for respuesta in sesion.receive():
                    contenido = respuesta.server_content

                    if not contenido or not contenido.model_turn:
                        continue

                    for parte in contenido.model_turn.parts:
                        if parte.inline_data:
                            audio = parte.inline_data.data

                            await websocket.send_json({
                                "audio": base64.b64encode(
                                    audio
                                ).decode("utf-8"),
                                "mime_type": "audio/pcm;rate=24000"
                            })

                        if parte.text:
                            await websocket.send_json({
                                "texto": parte.text
                            })

            tareas = [
                asyncio.create_task(recibir_del_navegador()),
                asyncio.create_task(enviar_al_navegador())
            ]

            terminadas, pendientes = await asyncio.wait(
                tareas,
                return_when=asyncio.FIRST_COMPLETED
            )

            for tarea in pendientes:
                tarea.cancel()

            await asyncio.gather(
                *pendientes,
                return_exceptions=True
            )

    except WebSocketDisconnect:
        pass

    except Exception as error:
        print(f"Error en la llamada: {error}")

    finally:
        try:
            await websocket.close()
        except Exception:
            pass

