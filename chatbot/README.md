# ASTRA Chatbot

Asistente de chat de ICEWISE, integrado desde `astra-chatbot-standalone.zip`. Conserva todas sus funciones:

- Chat por texto con respuestas locales sobre ICEWISE (funcionan sin internet ni servidor).
- Voz: dictado por micrófono y lectura en voz alta (Web Speech API), como conversación manos libres.
- Reloj sincronizado por país (zonas horarias IANA), que también se usa como contexto.
- IA real y **gratuita** a través de un servidor propio (Workers AI de Cloudflare), sin ninguna clave.

## Estructura

- `index.html`: la ventana del chat (funciona sola o dentro de la web).
- `css/chatbot.css`: estilos del chat, con el diseño de ICEWISE.
- `js/data-context.js`: respuestas locales y dirección del servidor de IA (nunca una clave).
- `js/voice-timezone.js`: voz y zonas horarias.
- `js/astra-bot.js`: controlador que une la interfaz, la voz, el horario y las respuestas.
- `js/embed.js`: modo incrustado dentro del panel de la web.
- `astra-launcher.js` y `astra-launcher.css`: botón flotante «ASTRA» de la web principal (`../index.html`).
- `servidor/`: servidor intermedio (Cloudflare Worker) que habla con la IA.
- `../configurar-astra.bat`: configura y publica el servidor en un solo paso.

## Cómo responde ASTRA

1. **IA gratuita (Workers AI de Cloudflare)**, modelo Mistral Small 3.1, con instrucciones sobre ICEWISE: respuestas breves, en español, distinguiendo lo real de lo simulado. Cloudflare da una cuota gratuita que se renueva cada día (10 000 «neuronas»; con mensajes cortos, del orden de 150 al día según nuestra estimación).
2. **Respuestas locales** si la IA no está disponible (cuota del día agotada, sin conexión o servidor sin configurar): datos de ICEWISE sobre el rover, el hielo, la planta, el biofiltro, la colonia, la energía y el agua. En GitHub Pages siempre funciona.
3. **Claude (opcional, de pago):** si algún día cargas saldo en console.anthropic.com, el servidor puede usar Claude con la clave guardada como secreto. Si Claude falla, vuelve solo a Workers AI.

## Hablar por voz

Pulsa el micrófono y habla. ASTRA responde en voz alta y vuelve a escuchar sola, como una conversación. Para terminar, pulsa el mismo botón (o escribe un mensaje).

- **Funciona en GitHub Pages** porque la página va por HTTPS, que es lo que exige el navegador.
- **Navegadores:** dictado en Chrome, Edge y Safari. Firefox no tiene dictado: ASTRA lo avisa y se puede escribir. La lectura en voz alta funciona en todos.
- **La primera vez** el navegador pide permiso para el micrófono. Si se niega, ASTRA explica cómo activarlo.
- **Acento:** el país elegido decide la variante de español con la que ASTRA entiende y habla (es-PE, es-ES, es-MX…).
- **En Chrome y Edge** el dictado usa un servicio en internet: sin conexión, ASTRA lo avisa.
- **Abriendo el archivo con doble clic** (`file://`) el micrófono puede no funcionar. Usa GitHub Pages o Live Server.

## Poner en marcha la IA gratuita (una sola vez)

Necesitas Node.js y una cuenta gratuita de Cloudflare. **No hace falta pagar ni ninguna clave.**

**Opción fácil:** ejecuta `configurar-astra.bat` (carpeta principal del proyecto). En VS Code: menú *Terminal → Ejecutar tarea… → ASTRA: configurar servidor de IA*, o escribe `.\configurar-astra.bat` en la terminal. Publica el servidor, conecta la web, lo prueba e instala la protección de git contra claves. Cuando pregunte por una clave de Anthropic, responde **n**.

**Opción manual:**

```bash
cd chatbot/servidor
npm install
npx wrangler login     # abre el navegador para entrar en Cloudflare
npx wrangler deploy    # publica el servidor y muestra su dirección
```

Pon la dirección que muestra `deploy` en `js/data-context.js` (`usarApiExterna: true` y `endpoint: "https://astra-icewise.TU-USUARIO.workers.dev"`) y sube los cambios a GitHub.

## Seguridad

GitHub Pages solo publica archivos: todo lo que hay en esta carpeta es público. Por eso:

- **Ninguna clave en la web ni en el repositorio.** Workers AI no necesita clave: Cloudflare autoriza el servidor con tu propia cuenta. Si algún día usas Claude, su clave se guarda como **secreto** de Cloudflare (`npx wrangler secret put ANTHROPIC_API_KEY`) y solo la conoce el servidor.
- **Servidor:**
  - solo acepta peticiones de tu web (`ALLOWED_ORIGINS` en `servidor/wrangler.toml`);
  - limita a 15 mensajes por minuto por persona;
  - solo acepta JSON por POST y rechaza peticiones de más de 32 KB;
  - envía cabeceras de seguridad en todas las respuestas (sin caché, sin incrustar, sin filtrar el origen);
  - sus instrucciones resisten intentos de cambiarlas desde el chat;
  - los errores no revelan detalles internos.
- **Chat:**
  - política de seguridad de contenido (CSP): solo ejecuta scripts propios (ni externos ni `eval`) y solo se conecta a la web y al servidor de ASTRA (`workers.dev`);
  - lo que escribe la persona y lo que llega del servidor nunca se ejecuta como HTML.
- **Git:**
  - `.gitignore` excluye los archivos de secretos locales (`.dev.vars`, `.env`);
  - el configurador instala un `pre-commit` que bloquea cualquier commit con algo parecido a una clave de API.
- **Dependencias:** el configurador las revisa con `npm audit`.

Si en el futuro usas un dominio propio para el servidor en vez de `workers.dev`, añádelo en `connect-src` de la CSP de `index.html`.

## Cambios respecto al zip

- La clave de la API ya no está en el navegador: se quitaron `apiKey` y la cabecera `Authorization`. La IA va por un servidor propio, gratuito y sin clave.
- Respuestas locales sobre ICEWISE; las palabras clave solo cuentan al inicio de una palabra («hora» ya no salta con «ahora»).
- Conversación por voz manos libres, mensajes claros si falta el permiso, el micrófono o el soporte, y variante de español por país.
- Lo que escribe la persona y lo que llega del servidor se muestra como texto, no como HTML.
- El botón de voz también detiene la escucha. Iconos SVG, diseño de ICEWISE, indicador de «pensando» e historial reciente como contexto para la IA.
