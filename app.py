import streamlit as st

st.set_page_config(
    page_title="Simulador Pandero ATC",
    page_icon="🎧",
    layout="centered"
)

st.title("🎧 Simulador IA de Pandero ATC")
st.write("Plataforma de práctica para asesores en formación")

st.info(
    "Versión inicial: práctica guiada. "
    "La evaluación es orientativa y debe validarse con Calidad."
)

tema = st.selectbox(
    "Selecciona el escenario",
    [
        "Aplicación de remate",
        "Consulta de estado de cuenta",
        "Cuotas pendientes"
    ]
)

if "historial" not in st.session_state:
    st.session_state.historial = []

if "iniciado" not in st.session_state:
    st.session_state.iniciado = False

if st.button("Iniciar llamada"):
    st.session_state.historial = []
    st.session_state.iniciado = True

    st.session_state.historial.append({
        "rol": "Cliente",
        "mensaje": (
            "Buenas tardes. Quisiera saber cómo se aplicará "
            "el dinero de mi remate a mis cuotas."
            if tema == "Aplicación de remate"
            else "Buenas tardes. Tengo una consulta sobre mi cuenta."
        )
    })

if st.session_state.iniciado:
    st.subheader("Conversación")

    for mensaje in st.session_state.historial:
        st.markdown(
            f"**{mensaje['rol']}:** {mensaje['mensaje']}"
        )

    with st.form("respuesta_asesor", clear_on_submit=True):
        respuesta = st.text_input(
            "Respuesta del asesor",
            placeholder="Escribe aquí tu respuesta..."
        )
        enviar = st.form_submit_button("Responder")

    if enviar and respuesta.strip():
        st.session_state.historial.append({
            "rol": "Asesor",
            "mensaje": respuesta.strip()
        })

        st.session_state.historial.append({
            "rol": "Cliente",
            "mensaje": (
                "Entiendo. ¿Podría explicarme con más detalle "
                "cómo se aplicará el importe?"
            )
        })

        st.rerun()

    if st.button("Finalizar práctica"):
        st.session_state.iniciado = False
        st.subheader("Resumen de la práctica")
        st.write(
            f"Escenario: {tema}. "
            f"Intervenciones registradas: "
            f"{len(st.session_state.historial)}."
        )
        st.warning(
            "Esta versión todavía no calcula una nota automática "
            "ni verifica políticas oficiales."
        )

st.caption("Prototipo educativo. No sustituye la evaluación oficial.")
