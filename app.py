
import streamlit as st
from streamlit_mic_recorder import speech_to_text
from google import genai
from google.genai import types
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

# Inicializar el estado de la aplicación
if "historial" not in st.session_state:
    st.session_state.historial = []

if "iniciado" not in st.session_state:
    st.session_state.iniciado = False

if "turno" not in st.session_state:
    st.session_state.turno = 0

if "error_ia" not in st.session_state:
    st.session_state.error_ia = ""

if "transcripcion_final" not in st.session_state:
    st.session_state.transcripcion_final = ""


# Crear el cliente de Gemini una sola vez
@st.cache_resource
def obtener_cliente():
    return genai.Client(
        api_key=st.secrets["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=20000)
    )


# Guardar el audio generado para evitar repetir el trabajo
@st.cache_data(ttl=3600)
def generar_audio(texto):
    audio = BytesIO()
    gTTS(text=texto, lang="es").write_to_fp(audio)
    return audio.getvalue()


# Generar la respuesta del cliente
def generar_respuesta_cliente(historial, escenario):
    cliente = obtener_cliente()

    # Enviar solo los últimos mensajes para reducir el texto
    mensajes_recientes = historial[-6:]

    conversacion = "\n".join(
        f"{item['rol']}: {item['mensaje']}"
        for item in mensajes_recientes
    )

    instrucciones = f"""
Actúa exclusivamente como un cliente de Pandero en Perú.

Escenario: {escenario}

Conversación reciente:
{conversacion}

Instrucciones:
- Habla en español peruano natural.
- Responde a lo último que dijo el asesor.
- Mantén el contexto de la llamada.
- Si no entiendes, pide una aclaración.
- Haz preguntas realistas cuando corresponda.
- No inventes políticas, montos ni procedimientos.
- No evalúes ni aconsejes al asesor.
- Responde solamente como cliente.
- Usa una o dos frases breves, máximo 35 palabras.
"""

    resultado = cliente.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=instrucciones,
        config=types.GenerateContentConfig(
            temperature=0.5,
            max_output_tokens=80
        )
    )

    if not resultado.text:
        raise ValueError("Gemini no generó una respuesta.")

    return resultado.text.strip()


# Iniciar una llamada nueva
if st.button("Iniciar llamada"):
    st.session_state.historial = []
    st.session_state.turno = 0
    st.session_state.error_ia = ""
    st.session_state.transcripcion_final = ""
    st.session_state.iniciado = True

    st.session_state.historial.append({
        "rol": "Cliente",
        "mensaje": (
            "Buenas tardes. Quisiera saber cómo se aplicará "
            "el dinero de mi remate a mis cuotas."
        )
    })

    st.rerun()


# Pantalla de la llamada
if st.session_state.iniciado:
    st.subheader("📞 Llamada en curso")

    for item in st.session_state.historial:
        st.markdown(
            f"**{item['rol']}:** {item['mensaje']}"
        )

    # Reproducir la última intervención del cliente
    if (
        st.session_state.historial
        and st.session_state.historial[-1]["rol"] == "Cliente"
    ):
        ultimo_mensaje = (
            st.session_state.historial[-1]["mensaje"]
        )

        try:
            st.audio(
                generar_audio(ultimo_mensaje),
                format="audio/mp3"
            )
        except Exception:
            st.warning(
                "No se pudo generar el audio. "
                "Puedes continuar leyendo el mensaje."
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
            with st.spinner(
                "El cliente está preparando su respuesta..."
            ):
                respuesta = generar_respuesta_cliente(
                    st.session_state.historial,
                    tema
                )

            st.session_state.error_ia = ""

        except Exception as e:
            respuesta = (
                "Disculpe, parece que tengo un problema "
                "de comunicación. ¿Podría repetirlo, por favor?"
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
        st.error(
            "No se pudo obtener la respuesta de la IA: "
            + st.session_state.error_ia
        )

    if st.button("Finalizar llamada"):
        st.session_state.transcripcion_final = "\n".join(
            f"{item['rol']}: {item['mensaje']}"
            for item in st.session_state.historial
        )

        st.session_state.iniciado = False
        st.rerun()


# Mostrar la descarga fuera de la pantalla de llamada
if (
    not st.session_state.iniciado
    and st.session_state.transcripcion_final
):
    st.success("Llamada finalizada.")

    st.download_button(
        "📄 Descargar transcripción",
        data=st.session_state.transcripcion_final,
        file_name="practica_atc.txt",
        mime="text/plain"
    )

st.caption(
    "Prototipo educativo. Las respuestas de IA pueden contener "
    "errores y no constituyen una evaluación oficial de calidad."
)
