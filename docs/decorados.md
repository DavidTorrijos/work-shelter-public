# Decorados: la escena de cada sala

Cada sala de repo lleva una escena. Sin decorado, la escena de serie de su tipo de repo:

- **Estudio** para web y Node.
- **Laboratorio** para Python.
- **Fundición** para Rust y Go.
- **Archivo** para carpetas sin código.
- **Taller** para lo demás.

Hay además escenas hechas a mano: taller web, escaparate, archivo de marca y sala de proyección. Les tocan a los
repos cuyo nombre o tipo lo pide (`estiloSala` en `server/repos.ts`).

## Adaptar la sala al repo

Desde el panel de la sala (E junto a él) o con ⌘K, «Adaptar la sala al repo» pide a su habitante que le diseñe una
escena propia:

1. Lee el repo: de qué va, para quién es y con qué está hecho.
2. Elige una metáfora física (una base de datos, una cámara de fichas; un compilador, una forja…).
3. Monta la escena con el atrezo del juego.
4. Mira cómo ha quedado con una foto y corrige.

Al terminar, te cuenta qué ha montado. La conversación queda abierta para pedirle retoques («más luz», «quita el
sofá», «pon el cartel a la izquierda»). «Volver a la escena de serie» quita el decorado.

El habitante trabaja con las herramientas del juego (`server/decoradoSala.ts`, un servidor MCP dentro del proceso
del juego):

| Herramienta | Qué hace |
|---|---|
| `decorado_actual` | La guía y cómo está la sala ahora. |
| `catalogo_atrezo` | Los modelos del material del juego, con su tamaño medido en su glTF (`server/atrezo.ts`). |
| `aplicar_decorado` | Valida, guarda y se ve al momento. |
| `ver_sala` | Una foto de la sala con el propio juego en un Chromium sin ventana (`server/capturaSala.ts`), con las piezas que el juego ve flotando o hundidas. |
| `quitar_decorado` | Devuelve la sala a su escena de serie. |

Solo tocan el decorado de su propia sala, así que no piden permiso. El repo no se toca.

## Qué es un decorado

Un decorado son datos, nunca código. El formato y su validación están en `shared/decorado.ts`. El servidor lo valida
al recibirlo y al cargar el estado: recorta lo que se sale de la sala, quita los modelos que no son del catálogo y
limpia los textos. Se guarda en la sala, en `refugio.json`.

El cliente lo monta en `web/src/mundo/salas/decorado.ts`. Un modelo que no carga se salta: una pieza rota nunca deja
la sala a medias.

- `base`: la escena de partida. Puede ser cualquiera de las de serie o `vacia`. En la vacía, el juego pone lo
  imprescindible: la pantalla con el estado real del repo, el puesto del habitante y el punto de su pieza
  protagonista, donde diga el decorado o en su sitio por defecto.
- Estilo de la sala: `subtitulo`, `resumen`, `acento`, `paleta`, `paredes`, `luz` y `espejo`.
- `piezas`: modelos del catálogo (`pack/nombre`) con posición, giro y tamaño. Pueden ir apoyadas sobre otra (`sobre`),
  pegadas a la pared (`pared`), colgadas (`y`) o tumbadas. Pueden llevar tinte (`color`) o brillo (`luz`).
- `carteles` y `pantallas`: en la pared del fondo. Las pantallas son de fósforo y escriben sus líneas en bucle.
- `puesto`, `pieza`, `aficion` y `lamparas`: dónde trabaja el habitante, dónde usa la pieza protagonista, su rincón y
  las luces.

Coordenadas en metros:

- **x**, de -6 a 6.
- **y**, del suelo (0) al techo (4,43). De la pared se ve hasta y ≈ 3,6.
- **z**, de -2,3 (pared del fondo) a 2,3 (borde del corte). La franja z > 0,8 es el pasillo y queda libre.

El giro va en grados: 0 es de frente al jugador y 180, hacia la pared.

Todo el material es el fijo del juego, CC0 de KayKit y Quaternius (`docs/assets.md`): no se añaden modelos ni
texturas.

## Vincular y retirar

- **Vincular a otra carpeta**: la sala pasa a un repo tuyo y conserva su sitio, su habitante y su aspecto.
  - Las conversaciones de la carpeta de antes se cierran y siguen en su historial.
  - La escena vuelve a la de serie del tipo de repo nuevo.
- **Retirar la sala**: se va con su habitante.

En los dos casos, una copia de un repo de ejemplo que ya no usa ninguna sala va a la papelera de macOS. Las carpetas
tuyas nunca se tocan.

## QA

`scripts/qa-decorado.mjs [sala] [modelo] [foto.png]` lanza «Adaptar la sala al repo» con una sesión real. Úsalo contra
un refugio de prueba (`SHELTER_DATOS`, `SHELTER_PUERTO`). Comprueba que la sala acaba con un decorado y guarda una foto.

Las pruebas del formato están en `shared/decorado.test.ts` y las del catálogo, en `server/atrezo.test.ts`.
