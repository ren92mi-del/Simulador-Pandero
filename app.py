import streamlit as st
from streamlit_mic_recorder import speech_to_text
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

# Crear estados de la sesión
if "historial" not in st.session_state:
    st.session_state.historial = []

if "iniciado" not in st.session_state:
    st.session_state.iniciado = False

if "turno" not in st.session_state:
    st.session_state.turno = 0

if "respuesta_cliente" not in st.session_state:
    st.session_state.respuesta_cliente = ""

def generar_audio(texto):
    audio = BytesIO()
    gTTS(text=texto, lang="es").write_to_fp(audio)
    audio.seek(0)
    return audio.getvalue()

# Iniciar llamada
if st.button("Iniciar llamada"):
    st.session_state.historial = []
    st.session_state.turno = 0
    st.session_state.iniciado = True

    saludo = (
        "Buenas tardes. Quisiera saber cómo se aplicará "
        "el dinero de mi remate a mis cuotas."
    )

    st.session_state.historial.append({
        "rol": "Cliente",
        "mensaje": saludo
    })

    st.session_state.respuesta_cliente = saludo
    st.rerun()

# Mostrar conversación
if st.session_state.iniciado:

    st.subheader("Llamada en curso")

    # Reproducir la respuesta nueva del cliente una sola vez
    if st.session_state.respuesta_cliente:
        texto = st.session_state.respuesta_cliente
        st.markdown("**Cliente virtual:** " + texto)

        try:
            st.audio(generar_audio(texto), format="audio/mp3")
        except Exception:
            st.warning(
                "No se pudo generar el audio. "
                "Puedes continuar con la conversación."
            )

        st.session_state.respuesta_cliente = ""

    # Mostrar el historial
    for item in st.session_state.historial:
        st.markdown(f"**{item['rol']}:** {item['mensaje']}")

    st.divider()
    st.write("🎙️ Pulsa el micrófono y responde como asesor.")

    # IMPORTANTE: la clave cambia después de cada respuesta.
    # Así se crea un nuevo control de grabación para cada turno.
    texto_asesor = speech_to_text(
        language="es",
        start_prompt="🎙️ Grabar respuesta",
        stop_prompt="⏹️ Terminar grabación",
        just_once=True,
        key=f"microfono_asesor_{st.session_state.turno}"
    )

    if texto_asesor:
        # Guardar respuesta del asesor
        st.session_state.historial.append({
            "rol": "Asesor",
            "mensaje": texto_asesor
        })

        # Respuesta guiada de prueba
        respuesta = (
            "Entiendo. ¿Podría explicarme si la modalidad "
            "que elegí para aplicar mi remate se puede cambiar?"
        )

        st.session_state.historial.append({
            "rol": "Cliente",
            "mensaje": respuesta
        })

        st.session_state.respuesta_cliente = respuesta

        # Preparar un micrófono nuevo para el siguiente turno
        st.session_state.turno += 1
        st.rerun()

    if st.button("Finalizar llamada"):
        st.session_state.iniciado = False
        st.session_state.respuesta_cliente = ""

        st.subheader("Resumen de la práctica")

        total = sum(
            1 for item in st.session_state.historial
            if item["rol"] == "Asesor"
        )

        st.write(f"Respuestas registradas del asesor: {total}")

        transcripcion = "\n".join(
            f"{item['rol']}: {item['mensaje']}"
            for item in st.session_state.historial
        )

        st.download_button(
            "Descargar transcripción",
            data=transcripcion,
            file_name="practica_atc.txt",
            mime="text/plain"
        )

st.caption(
    "Prototipo educativo. Las respuestas del cliente son guiadas; "
    "todavía no constituyen una evaluación oficial de calidad."
)
