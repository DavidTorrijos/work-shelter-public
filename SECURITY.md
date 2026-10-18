# Seguridad

## Antes de nada: úsalo bajo tu responsabilidad

work-shelter es una propuesta experimental que se publica **tal cual, sin garantía de ningún tipo** (ver
[`LICENSE`](LICENSE)). Nadie revisa ni certifica su seguridad, no hay compromiso de mantenimiento ni de corregir nada
en ningún plazo, y lo que describe este documento son las precauciones que el código **intenta** tomar, no promesas.

El juego maneja agentes que ejecutan órdenes en tu Mac con tus permisos, guarda credenciales de tus servicios y abre
navegadores con tus sesiones. Si lo instalas, lo usas, lo modificas o lo distribuyes, **la responsabilidad de lo que
pase (con tu equipo, tus datos, tus cuentas o las de tu organización) es tuya**. Revisa el código antes de usarlo con
nada que te importe.

## Cómo avisar de un problema

No hay canal de avisos: como el resto del proyecto, no se leen issues, pull requests ni avisos de seguridad (ver
«Sin pull requests ni issues» en el [README](README.md)). Si encuentras algo, arréglalo en tu fork y, si te parece
útil, cuéntalo donde prefieras para que otros lo sepan.

## Precauciones que toma el código

Está pensado como aplicación local para una sola persona en su Mac:

- **El servidor del juego** escucha en `127.0.0.1:3778`, rechaza otros `Host` (contra DNS rebinding) y, en el
  WebSocket, exige el `Origin` del juego y un secreto aleatorio que se genera en cada arranque. El secreto no se pasa a
  las sesiones de Claude Code, a las terminales ni a los procesos que lanza el juego (git, `gh`, Chrome).
- **Archivos**: el explorador, el cliente de git y los adjuntos trabajan dentro de las carpetas de las salas.
- **Órdenes**: se lanzan con `execFile`/`spawn`, con los argumentos separados. El git que el juego lanza solo (el estado
  de cada sala, cada 20 s) ignora el `core.fsmonitor` de la configuración local del repo, y los diffs van sin
  `textconv` ni diff externo.
- **Permisos de los habitantes**: se muestran como texto literal (el comando o el diff, con los caracteres invisibles a
  la vista) y los resuelves tú.
- **Confianza en las carpetas**: si un repo trae configuración de proyecto de Claude Code (`.claude/` con ajustes,
  hooks, reglas, comandos o agentes, `.mcp.json`, `CLAUDE.md`), el juego pregunta antes de cargarla, salvo que ya hayas
  aceptado esa carpeta en Claude Code o en el juego. Los repos de ejemplo también se preguntan: son de fuera.
- **Electron**: `contextIsolation`, sin `nodeIntegration`, la ventana principal confinada a su origen y los navegadores
  internos (`<webview>`) en su propia sesión, solo `https` y sin precarga.
- **Secretos**: en el llavero de macOS, no en el repo ni en `.data/`; las integraciones piden permisos de solo lectura.

## Riesgos conocidos

Lo que **no** cubre, por diseño o porque nadie lo ha resuelto:

- **Los habitantes son Claude Code con tus permisos**: lo que apruebes se ejecuta en tu Mac. Los modos «editar sin
  preguntar» y «saltar permisos» hacen exactamente eso.
- **Carpetas de fuera**: la pregunta de confianza solo cubre la configuración de Claude Code. Una carpeta ajena puede
  traer otras cosas que se ejecutan al tocarla, como filtros o ganchos en su `.git/config`, o tareas que abra tu editor.
  No vincules como sala una carpeta en la que no confíes.
- **El Puente de Mando** trabaja sobre el código del propio juego, y ese código se ejecuta al reiniciar o al abrir la
  app (incluido `npm ci` si cambia `package-lock.json`). Aprobar ediciones ahí equivale a aprobar que se ejecuten.
- **La instalación con `curl … | bash`** ejecuta `instalar.sh` tal como esté en GitHub en ese momento y, después, el
  código del repo que descarga. Léelo antes si quieres, o clona el repo y usa `./shelter instalar-app`.
- **La app instalada** (`/Applications/work-shelter-public.app`) carga el código de la carpeta del juego
  (`~/.work-shelter-public` con el instalador, o la carpeta desde la que la instalaste): quien pueda escribir en esa
  carpeta puede cambiar lo que hace la app. Volver a ejecutar el instalador trae y ejecuta lo último que haya en el
  repo.
- **Modo desarrollo** (`npm run dev`): Vite sirve los archivos de la carpeta del juego a cualquier proceso local, y entre
  ellos está `.data/token`, el secreto con el que se maneja el refugio (terminales incluidas). Úsalo solo en un equipo
  donde te fíes de todo lo que corre y, si quieres, con `SHELTER_DATOS` apuntando fuera del repo.
- **El Chrome de Spotify y el del inicio de sesión con Google** se manejan por su protocolo de depuración, abierto en
  un puerto de `127.0.0.1` mientras están en marcha. Otro proceso o usuario del mismo Mac podría conectarse y llegar a
  esas sesiones.
- **Los navegadores internos** se confinan al dominio de cada web, pero los inicios de sesión de terceros
  (Microsoft, Google, Okta, Auth0…) y sus redirecciones pueden llevar a páginas que no son del sitio, sin barra de
  direcciones a la vista.
- **Otros procesos de tu usuario** pueden leer los secretos del llavero sin aviso (los guarda `/usr/bin/security`).
- **La clave de Linear**, si la guardas, va en el entorno del habitante de Logística, cuyo MCP puede escribir en Linear
  (ver `docs/integraciones-uso.md`).
- **Otras cuentas de macOS** en el mismo equipo no se han tenido en cuenta a fondo: si compartes el Mac, asume que
  pueden llegar a más de lo que deberían.
