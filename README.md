# Simulador Pandero

Simulador de atención al cliente con voz en tiempo real, Gemini, manual PDF, base Excel y evaluación sobre 20 puntos.

## Despliegues independientes

El frontend usa el mismo dominio para solicitudes HTTP y WebSocket. Así cada despliegue se conecta a su propio backend:

- Render: FastAPI sirve la interfaz y la API desde el mismo servicio.
- Vercel: el archivo raíz `index.py` expone la aplicación FastAPI como Vercel Function.

## Configuración en Vercel

1. En Project Settings → General, configura **Root Directory** como la raíz del repositorio (no `frontend`).
2. Configura `GEMINI_API_KEY` en Environment Variables para Preview y Production. No guardes la clave en GitHub.
3. Despliega la rama `feature/vercel-independent-backend` como Preview para probar sin cambiar la versión activa de Render.
4. Abre `/api/health`; debe responder `{"ok":true,...}`.
5. Carga el PDF y el Excel, prueba una llamada por voz y luego la evaluación.

## Límites de Vercel que debes tener en cuenta

- La función tiene un máximo configurado de 300 segundos por invocación; la conexión de voz puede cerrarse al alcanzar el límite.
- Vercel limita el cuerpo de una solicitud a 4.5 MB. Por eso, el PDF o Excel que cargues en Vercel debe pesar menos de ese límite, contando el formulario de subida. En Render se mantienen los límites propios del backend.
- WebSockets en Vercel están en beta pública y el proyecto debe tener esa capacidad disponible.

## Importante sobre archivos y sesiones

El PDF y el Excel se procesan en memoria y no se guardan en GitHub. Render mantiene un proceso de servidor más persistente; Vercel Functions puede atender solicitudes con instancias distintas o reiniciarlas. Por eso el estado en memoria de los archivos no es almacenamiento persistente y debe probarse en Vercel. Para garantizar persistencia entre instancias se necesita almacenamiento externo o adaptar la sesión para enviar el contexto necesario en cada conexión.

## Desarrollo local / Render

Instala dependencias con `pip install -r requirements.txt` y ejecuta `uvicorn main:app --host 0.0.0.0 --port 8000`.
