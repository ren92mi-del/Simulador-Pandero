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

if "historial" not in st.session_state:
    st.session_state.historial = []

if "iniciado" not in st.session_state:
    st.session_state.iniciado = False

if "respuesta_cliente" not in st.session_state:
    st.session_state.respuesta_cliente = ""

def hablar(texto):
    audio = BytesIO()
    gTTS(text=texto, lang="es").write_to_fp(audio)
    audio.seek(0)
    st.audio(audio.getvalue(), format="audio/mp3")

if st.button("Iniciar llamada"):
    st.session_state.historial = []
    st.session_state.iniciado = True

    saludo = (
        "Buenas tardes. Quisiera saber cómo se aplicará "
        "el dinero de mi remate a mis cuotas."
    )

    st.session_state.historial.append(
        {"rol": "Cliente", "mensaje": saludo}
    )
    st.session_state.respuesta_cliente = saludo

if st.session_state.iniciado:
    st.subheader("Llamada en curso")

    if st.session_state.respuesta_cliente:
        st.markdown(
            "**Cliente virtual:** "
            + st.session_state.respuesta_cliente
        )
        hablar(st.session_state.respuesta_cliente)

        st.session_state.respuesta_cliente = ""

    for item in st.session_state.historial:
        st.markdown(f"**{item['rol']}:** {item['mensaje']}")

    st.write("Pulsa el micrófono y responde como asesor:")

    texto_asesor = speech_to_text(
        language="es",
        start_prompt="🎙️ Hablar",
        stop_prompt="⏹️ Terminar grabación",
        just_once=True,
        key="microfono_asesor"
    )

    if texto_asesor:
        ultimo = (
            st.session_state.historial[-1]["mensaje"]
            if st.session_state.historial
            else ""
        )

        if (
            not st.session_state.historial
            or st.session_state.historial[-1]["rol"] != "Asesor"
            or st.session_state.historial[-1]["mensaje"] != texto_asesor
        ):
            st.session_state.historial.append(
                {"rol": "Asesor", "mensaje": texto_asesor}
            )

            respuesta = (
                "Comprendo. ¿Podría explicarme si la aplicación "
                "que elegí se puede cambiar después?"
            )

            if any(
                palabra in texto_asesor.lower()
                for palabra in ["buenas tardes", "buenos días", "hola"]
            ):
                respuesta = (
                    "Buenas tardes. Quisiera saber cómo se aplicará "
                    "el dinero de mi remate a mis cuotas."
                )

            st.session_state.historial.append(
                {"rol": "Cliente", "mensaje": respuesta}
            )
            st.session_state.respuesta_cliente = respuesta
            st.rerun()

    if st.button("Finalizar llamada"):
        st.session_state.iniciado = False

        intervenciones = [
            x for x in st.session_state.historial
            if x["rol"] == "Asesor"
        ]

        st.subheader("Resumen de la práctica")
        st.write(
            f"Intervenciones del asesor: {len(intervenciones)}"
        )

        st.warning(
            "Esta versión no asigna una nota de calidad ni valida "
            "las políticas oficiales de Pandero."
        )

        st.download_button(
            "Descargar transcripción",
            data="\n".join(
                f"{x['rol']}: {x['mensaje']}"
                for x in st.session_state.historial
            ),
            file_name="practica_atc.txt",
            mime="text/plain"
        )

st.caption(
    "Prototipo educativo. No usar con datos reales de clientes."
)
