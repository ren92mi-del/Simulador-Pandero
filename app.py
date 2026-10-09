import streamlit as st
from streamlit_mic_recorder import speech_to_text
from google import genai
from gtts import gTTS
from io import BytesIO

st.set_page_config(
    page_title="Simulador Pandero ATC",
    page_icon="🎧"
)

st.title("🎧 Simulador Pandero ATC")
st.write("Práctica de atención al cliente por voz")

tema = st.selectbox(
    "Selecciona el escenario",
    ["Aplicación de remate"]
)

if "historial" not in st.session_state:
    st.session_state.historial = []

if "iniciado" not in st.session_state:
    st.session_state.iniciado = False

if "turno" not in st.session_state:
    st.session_state.turno = 0

if "error_ia" not in st.session_state:
    st.session_state.error_ia = ""


def generar_audio(texto):
    audio = BytesIO()
    gTTS(text=texto, lang="es").write_to_fp(audio)
    audio.seek(0)
    return audio.getvalue()


def generar_respuesta_cliente(historial, escenario):
    cliente = genai.Client(
        api_key=st.secrets["GEMINI_API_KEY"]
    )

    conversacion = "\n".join(
        f"{item['rol']}: {item['mensaje']}"
        for item in historial
    )

    instrucciones = f"""
Eres un cliente que llama a atención al cliente
de Pandero en Perú.

Escenario de práctica: {escenario}

Tu papel es exclusivamente el de cliente.
No eres asesor ni evaluador.

REGLAS:
- Habla en español peruano natural y sencillo.
- Responde a lo que acaba de decir el asesor.
- Mantén el contexto de toda la conversación.
- Haz preguntas realistas y plantea dudas si corresponde.
- Si la explicación no es clara, pide que te la aclaren.
- No repitas siempre la misma pregunta.
- No inventes políticas, montos ni procedimientos de Pandero.
- No des instrucciones al asesor sobre cómo debe atender.
- Responde brevemente, como en una llamada real.
- Escribe únicamente lo que diría el cliente, en 1 a 3 frases.

Historial de la llamada:
{conversacion}

Ahora genera la siguiente intervención del cliente.
"""

    resultado = cliente.models.generate_content(
        model="gemini-flash-latest",
        contents=instrucciones
    )

    if not resultado.text:
        raise ValueError("La IA no generó una respuesta.")

    return resultado.text.strip()


if st.button("Iniciar llamada"):
    st.session_state.historial = []
    st.session_state.turno = 0
    st.session_state.error_ia = ""
    st.session_state.iniciado = True

    saludo = (
        "Buenas tardes. Quisiera saber cómo se aplicará "
        "el dinero de mi remate a mis cuotas."
    )

    st.session_state.historial.append({
        "rol": "Cliente",
        "mensaje": saludo
    })

    st.rerun()


if st.session_state.iniciado:
    st.subheader("📞 Llamada en curso")

    for item in st.session_state.historial:
        st.markdown(
            f"**{item['rol']}:** {item['mensaje']}"
        )

    # Reproducir la voz de la última intervención del cliente
    if (
        st.session_state.historial
        and st.session_state.historial[-1]["rol"] == "Cliente"
    ):
        ultimo_mensaje = st.session_state.historial[-1]["mensaje"]

        try:
            st.audio(
                generar_audio(ultimo_mensaje),
                format="audio/mp3"
            )
        except Exception:
            st.warning(
                "No se pudo generar el audio. "
                "Puedes continuar con la práctica."
            )

    st.divider()
    st.write("🎙️ Pulsa el micrófono y responde como asesor.")

    texto_asesor = speech_to_text(
        language="es",
        start_prompt="🎙️ Grabar respuesta",
        stop_prompt="⏹️ Terminar grabación",
        just_once=True,
        key=f"microfono_asesor_{st.session_state.turno}"
    )

    if texto_asesor:
        st.session_state.historial.append({
            "rol": "Asesor",
            "mensaje": texto_asesor
        })

        try:
            with st.spinner("El cliente está respondiendo..."):
                respuesta = generar_respuesta_cliente(
                    st.session_state.historial,
                    tema
                )

            st.session_state.error_ia = ""

        except Exception as e:
    respuesta = (
        "Disculpe, parece que hubo un problema "
        "de comunicación. ¿Podría explicármelo nuevamente?"
    )
    st.session_state.error_ia = (
        f"{type(e).__name__}: {e}"
    )

        st.session_state.historial.append({
            "rol": "Cliente",
            "mensaje": respuesta
        })

        st.session_state.turno += 1
        st.rerun()

    if st.session_state.error_ia:
        st.warning(st.session_state.error_ia)

    if st.button("Finalizar llamada"):
        transcripcion = "\n".join(
            f"{item['rol']}: {item['mensaje']}"
            for item in st.session_state.historial
        )

        st.session_state.iniciado = False

        st.download_button(
            "Descargar transcripción",
            data=transcripcion,
            file_name="practica_atc.txt",
            mime="text/plain"
        )

st.caption(
    "Prototipo educativo. Las respuestas de IA pueden contener "
    "errores y todavía no constituyen una evaluación oficial de calidad."
)
