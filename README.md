---
title: Simulador Pandero ATC
emoji: 🎧
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Simulador Pandero ATC

Aplicación de práctica de atención al cliente con simulación de voz, escenarios, carga temporal de una base Excel, consulta de manual PDF y evaluación de calidad con Gemini.

## Despliegue en Hugging Face Spaces

1. Crea un Space nuevo y selecciona **Docker**.
2. En el Space, abre **Settings → Variables and secrets**.
3. Crea el secreto `GEMINI_API_KEY` con tu clave de Google Gemini.
4. Espera a que finalice la construcción de la imagen.
5. Abre la pestaña **App** y prueba primero cargando el manual PDF y la base Excel.

La aplicación se sirve desde el mismo Space que ejecuta la API. En este modo, las llamadas HTTP y WebSocket usan el mismo dominio; no necesita Render ni Vercel para funcionar.

## Sincronizar este repositorio de GitHub con Hugging Face

El flujo de GitHub Actions `.github/workflows/deploy-huggingface.yml` sincroniza la rama `main` con el Space cuando se hace un push.

Configura estos **secrets** en GitHub → Settings → Secrets and variables → Actions:

- `HF_TOKEN`: token de Hugging Face con permiso de escritura para el Space.
- `HF_SPACE_REPO`: identificador del Space, con formato `usuario/nombre-del-space`.

El Space debe existir previamente y usar el SDK Docker. Si no configuras esos secretos, el despliegue automático no podrá publicar cambios.

## Datos y privacidad

- `GEMINI_API_KEY` debe guardarse como secreto, nunca en el código.
- El PDF y el Excel que se cargan desde la interfaz se procesan en memoria del servidor. No se guardan automáticamente en el repositorio.
- Como la memoria de la sesión se pierde si el Space se reinicia o vuelve a construirse, vuelve a cargar el manual y la base Excel después de un reinicio.
- Si el Space es público, cualquier persona podrá abrir la aplicación. No subas al repositorio datos personales reales ni archivos confidenciales.

## Recursos y concurrencia

El hardware gratuito de Spaces tiene límites de CPU, memoria, tiempo y disponibilidad. La variable `MAX_LLAMADAS_SIMULTANEAS` se establece inicialmente en 2 en el contenedor; el uso real también depende de las cuotas y la disponibilidad de Gemini.
