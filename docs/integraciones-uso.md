# Integraciones: cómo funcionan, qué pide la cámara acorazada y el MCP de Linear

Qué hace cada conector de `server/integraciones/`, qué pide la cámara acorazada, dónde se guarda cada dato y cómo se
conecta el MCP oficial de Linear en Claude Code y en Codex. Las guías paso a paso para conseguir cada credencial están
también dentro del juego (cámara acorazada → la fuente).

## Principios

- **Tres estados por fuente**: demo (datos simulados, marcados DEMO), real conectada, o real con error y su motivo.
  En modo real sin datos completos, el estado es *sin configurar* y dice qué falta.
- **Solo lectura hacia fuera.** Ningún conector envía correos, mensajes ni eventos, y los permisos que se piden son
  de lectura. La única escritura es Linear, y la hace la conversación del habitante de Logística con el MCP oficial
  (eres tú actuando a través de él), no el juego.
- **Sin identificadores de nadie.** Cada usuario crea su propia app (Microsoft Entra, Google Cloud, bot de Discord,
  app de Slack) y pega sus datos. El repo no trae IDs de cliente, tokens ni URLs de ninguna organización.
- **Secretos solo en el llavero de macOS** (`server/integraciones/llavero.ts`): servicio `work-shelter-public`, cuenta
  `<fuente>.<campo>` (`linear.apiKey`, `discord.token`, `slack.token`, `github.token`, `google.clientSecret`,
  `outlook.refreshToken`, `google.refreshToken`). Se escriben con `security -i` (la orden va por stdin, así el secreto
  no aparece en `ps`) y en base64. En `.data/refugio.json` solo van los datos no secretos
  (`integraciones.<fuente>.campos`) y los **nombres** de los secretos guardados (`integraciones.<fuente>.secretos`).
  Nada de secretos en git, en logs ni en mensajes de error.
- **Sin telemetría.** El servidor escucha solo en `127.0.0.1`.

Limitación del llavero: con `/usr/bin/security`, la app de confianza del elemento es el propio `security`, así que
otro proceso de tu mismo usuario podría leerlo sin aviso. Para un Mac personal se acepta (evita dependencias
nativas); por eso los permisos que se piden son los mínimos y de solo lectura.

## Añadir una fuente nueva

1. Su id, nombre, color y qué trae, en `shared/fuentes.ts`.
2. El conector real en `server/integraciones/<id>.ts` con `export function crear(almacen)` (casi siempre, una
   subclase de `ConectorBase` de `comun.ts` con sus `Campo[]`).
3. Sus normalizadores puros en `normalizar.ts`, con fixtures sintéticos en `test/fixtures/` y pruebas.
4. Sus datos DEMO en `demo.ts`.
5. Su guía paso a paso en `web/src/ui/Camara.tsx` (`GUIAS`), y si tiene web que se pueda abrir dentro del juego, su
   sitio en `web/src/ui/Navegadores.tsx` (`SITIOS`).

## El tablón: lo pendiente, por conversación

Los conectores entregan mensajes con un `hilo` (canal de Discord o de Slack, conversación de correo, issue de Linear,
hilo de GitHub) y `Integraciones` los difunde agrupados (`agruparAvisos` en `normalizar.ts`): una entrada por
conversación con `cuantos`, `ids`, `autores` y los últimos `mensajes`. Su id cambia con cada mensaje nuevo (suena y
vuelve a «sin ver»); `marcarVista` recibe los `ids` de sus mensajes. Microsoft 365, Google, GitHub y Linear sondean
con `completas: true`: lo que devuelven es todo lo pendiente allí y lo que ya no viene (leído en su web) sale del
tablón. Discord y Slack no tienen estado de leído para un bot: acumulan lo que llega.

## Acciones de la cámara acorazada (por WebSocket, `integracion.<accion>` con `{ fuente, ... }`)

| Acción | Qué hace |
|---|---|
| `campos` | Devuelve `{ campos, valores, guardados }`: definición de los campos, valores públicos actuales y qué secretos hay guardados (sin su valor). |
| `probar` | `{ campos }` → `{ ok, detalle }`. Un secreto vacío significa «usar el guardado». |
| `guardar` | `{ campos, activar? }` → guarda (públicos al estado, secretos al llavero), prueba y, si pasa, cambia la fuente a real (salvo `activar: false`). |
| `modo` | `{ modo: 'demo' \| 'real' }`. |
| `refrescar` | Sondea ya. |
| `olvidar` | Borra los secretos del llavero y los campos, y vuelve a demo. |
| Microsoft / Google `conectar` | Abre en el navegador del sistema la autorización (`abrir: false` solo devuelve la URL). |
| Microsoft / Google `desconectar` | Borra la sesión (refresh token). |
| Discord `invitacion` | URL para invitar al bot con permisos de solo lectura (66560). |
| Discord / Slack `canales` | Canales para elegir. Guardar la selección con `guardar { campos: { canales: 'id1,id2' } }`. |
| Linear `panel` | `{ yo, misIssues (por estado), ciclos (ciclo actual por equipo) }`. |
| Linear `tablero` | `{ equipo: <clave> \| <id>, prioridad?: 'alta', etiqueta?, proyecto?, asignadoAMi?, ciclo?: 'actual' }` → columnas por estado. |

## Inicio de sesión con navegador (Microsoft y Google)

`server/integraciones/oauth.ts`: OAuth 2.0 de aplicación nativa (RFC 8252), código de autorización + PKCE (S256) y
`state` aleatorio, con retorno a `http://localhost:<puerto libre>` (IPv4 e IPv6). La escucha es de un solo uso y se
cierra al volver el navegador o a los 5 minutos. El access token vive solo en memoria; el refresh token, en el llavero.

## Campos de cada fuente

**Microsoft 365 (Outlook)** — Microsoft Graph, solo lectura. Registras tu propia app en Microsoft Entra.

| Campo | Etiqueta | Secreto | Ayuda |
|---|---|---|---|
| `clientId` | ID de aplicación (cliente) | no | Entra → Registros de aplicaciones → tu app → «Id. de aplicación (cliente)». |
| `tenant` | Inquilino | no (opcional) | Vacío: `common`. Si la app es de una sola organización, su «Id. de directorio». |

Registro: plataforma *Cliente público/nativo (móvil y escritorio)* con la URI `http://localhost` (Entra acepta
cualquier puerto en localhost), sin secreto. Permisos delegados: `User.Read`, `Mail.Read`, `Calendars.Read` y
`offline_access`. Sondeo: correo no leído de la bandeja de entrada de los últimos 7 días (metadatos + `bodyPreview`,
25 como máximo) cada 60 s; `calendarView` de hoy a +14 días cada 5 min, en la zona horaria del sistema.

**Google (Gmail y Calendar)** — solo lectura. Creas tu propio cliente OAuth en Google Cloud.

| Campo | Etiqueta | Secreto | Ayuda |
|---|---|---|---|
| `clientId` | ID de cliente | no | Google Cloud → APIs y servicios → Credenciales → cliente OAuth de tipo «Aplicación de escritorio». |
| `clientSecret` | Secreto de cliente | sí | El del mismo cliente (en una app de escritorio no es confidencial, pero va al llavero igualmente). |

Hay que activar Gmail API y Google Calendar API en el proyecto y, con la pantalla de consentimiento en «Pruebas»,
añadirte como usuario de prueba. En ese modo Google corta el refresh token a los 7 días: el estado lo explica y basta
con volver a conectar. Ámbitos: `gmail.readonly` y `calendar.readonly`. Sondeo: `is:unread in:inbox newer_than:7d`
(25 como máximo, metadatos y fragmento; los ya vistos no se vuelven a pedir) cada 60 s; el calendario principal de
hoy a +14 días cada 5 min.

**Discord** — bot oficial; **prohibido** el token de usuario. Los mensajes directos no llegan (ningún bot los ve).

| Campo | Etiqueta | Secreto | Ayuda |
|---|---|---|---|
| `token` | Token del bot | sí | Portal de desarrolladores → app → Bot → Reset Token → Copy. Activar «Message Content Intent». |
| `canales` | Canales a vigilar | no (opcional) | Se eligen en la cámara acorazada una vez conectado. Vacío = todos los que ve el bot. Las menciones llegan siempre. |
| `usuario` | Tu ID de usuario de Discord | no (opcional) | Solo si la app pertenece a un equipo; si no, se deduce del dueño de la app. |

Gateway (WebSocket) con intents `GUILDS | GUILD_MESSAGES` y `MESSAGE_CONTENT` solo si el portal lo concede. Sin él,
o si el Gateway cierra con 4014, se reconecta sin ese intent y se notifican los mensajes con un aviso en lugar del
texto. Prioridad alta: menciones a ti, a tus roles y respuestas a tus mensajes; media: `@everyone`/`@here`; baja: el
resto de los canales elegidos. Al conectar se rellenan las últimas 24 h de los canales que el bot ve. Reanuda
(Resume) siempre que puede. El estado nombra los canales privados que el bot no ve y no se avisa de canales que tú no
ves.

**Slack** — app propia en tu espacio de trabajo, token de bot (`xoxb-`) o de usuario (`xoxp-`).

| Campo | Etiqueta | Secreto | Ayuda |
|---|---|---|---|
| `token` | Token de OAuth | sí | api.slack.com/apps → tu app → OAuth & Permissions. |
| `canales` | Canales a vigilar | no (opcional) | Se eligen una vez conectado. Vacío = todos. Directos y menciones llegan siempre. |
| `usuario` | Tu ID de miembro | no (opcional) | Solo con token de bot, para tus menciones. Con token de usuario se sabe solo. |

Ámbitos: `channels:read`, `channels:history`, `groups:read`, `groups:history`, `users:read` (y con token de usuario,
`im:read`, `im:history`, `mpim:read`, `mpim:history`). Ninguno de escritura. Sondeo cada 60 s con
`conversations.history` desde el último mensaje visto de cada conversación (25 como máximo por vuelta, las de
actividad más reciente; al conectar, las últimas 24 h).

**GitHub** — notificaciones sin leer (`GET /notifications`).

| Campo | Etiqueta | Secreto | Ayuda |
|---|---|---|---|
| `token` | Token personal (clásico) | sí (opcional) | Con el permiso `notifications`. Vacío: se usa la sesión de `gh` (`gh auth token`) si la hay. |

Los tokens fine-grained no sirven para la API de notificaciones. Sondeo cada 60 s con `If-Modified-Since` (un 304 no
gasta cuota). Prioridad alta: te piden revisión, te mencionan, te asignan, alertas de seguridad.

**Linear** — GraphQL con clave personal (`Authorization: <clave>`, sin `Bearer`), solo lectura desde el juego.

| Campo | Etiqueta | Secreto | Ayuda |
|---|---|---|---|
| `apiKey` | Clave de API de Linear | sí | Settings → Account → Security & access → Personal API keys. «Read» para los paneles; «Write», «Create issues» y «Create comments» para que el habitante actúe. |

Notificaciones sin leer del inbox (las 100 últimas; sin archivadas ni pospuestas) cada 60 s; mis issues y ciclos
cada 5 min.

## MCP oficial de Linear para el habitante de Logística

`server/integraciones/linear.ts` exporta:

- `mcpLinear({ soloLectura? })` → `{ linear: { type: 'http', url: 'https://mcp.linear.app/mcp', headers? } }`
  (transporte HTTP transmitible).
- `entornoMcpLinear()` → `{ SHELTER_LINEAR_CLAVE: <clave> }` o `{}`.

Con clave en el llavero, la cabecera es literalmente `Authorization: Bearer ${SHELTER_LINEAR_CLAVE}`. El SDK pasa
`mcpServers` al CLI como argumento `--mcp-config` (visible en `ps`), por eso la clave **no** va ahí: Claude Code
expande `${VAR}` en las configuraciones MCP de la línea de comandos y la variable va solo en el entorno del proceso
hijo. Sin clave en el llavero se devuelve el servidor sin cabeceras y vale la autorización OAuth de Claude Code:
abrir `claude` en la carpeta, `/mcp` → `linear` → *Authenticate* e iniciar sesión en el navegador.

### Claude Code en la terminal (opcional, fuera del juego)

```bash
claude mcp add --transport http linear https://mcp.linear.app/mcp      # ámbito local; --scope user para todos
```

Luego `/mcp` → `linear` → *Authenticate*.

### Codex (`~/.codex/config.toml`, sección `mcp_servers`)

```bash
codex mcp add linear --url https://mcp.linear.app/mcp     # y luego: codex mcp login linear (OAuth en el navegador)
```

que equivale a:

```toml
[mcp_servers.linear]
url = "https://mcp.linear.app/mcp"
# Alternativa sin OAuth: la misma clave de API desde una variable de entorno
# bearer_token_env_var = "SHELTER_LINEAR_CLAVE"
```

## Pruebas

`npm test` ejecuta `server/integraciones/*.test.ts` sin red: normalizadores contra `test/fixtures/` y los conectores
completos con `fetch` simulado, llavero en memoria, el retorno de OAuth por localhost y un Gateway de Discord simulado
en `127.0.0.1`. Los fixtures son sintéticos (personas, empresas y dominios inventados; no hay credenciales).

## Límite conocido: la clave de Linear en el entorno del habitante de Logística

Para que el MCP oficial de Linear se autentique sin poner la clave en los argumentos (visibles con `ps`), el refugio
la pasa en la variable `SHELTER_LINEAR_CLAVE` del proceso de Claude Code de Logística. Esa variable la heredan también
sus herramientas (`Bash`, hooks, otros MCP): un `env` ejecutado por el habitante la mostraría en la transcripción. Si
no quieres ese riesgo, no guardes clave de Linear en la cámara acorazada: el MCP oficial pedirá autorizarlo por OAuth
en el navegador la primera vez, y el tablero de Logística seguirá en DEMO.
