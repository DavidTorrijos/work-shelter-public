# Salir a la superficie

Para cuando el juego se cae o no conviene que se vea: todo lo que tienes abierto en el refugio (conversaciones con
los habitantes y terminales) sigue en una terminal normal de tu escritorio. Usa iTerm si está instalado; si no,
Terminal (`SHELTER_TERMINAL=terminal` o `iterm` para elegir). En el juego, todo esto está también en el Manual del
Supervisor (F1), sección «A la superficie».

## Las cuatro maneras

| Cómo | Qué saca |
| --- | --- |
| **⇧⌥⌘Esc** (desde cualquier app) | Todo. El juego desaparece al momento (ventana, icono del Dock y sonido) y lo abierto sale a una ventana nueva de iTerm, una pestaña por cosa. La misma tecla, abrir la app o un clic en su icono lo devuelve tal como estaba. |
| **Botón ↗ o ⌘⇧E** en un intercomunicador o una terminal | Solo la pestaña activa, a una pestaña de la ventana de iTerm que tengas delante. |
| **`./shelter superficie`** (en la carpeta del juego) | Todo. Con el juego abierto se lo pide a él; con el juego caído, retoma las conversaciones que quedaron abiertas y engancha las terminales que sigan vivas. `--lista` solo enseña qué hay. |
| **Sola, si el juego se cae** | Si la ventana desaparece sin pasar por «Salir» y no vuelve en 20 s, todo sale a tu escritorio antes de que el refugio se apague. Si solo se cuelga la página, la ventana se recarga sola y no sale nada. |

Ojo: **⇧⌥⌘Esc mantenido 3 segundos** es el «forzar salida» de macOS. Púlsala rápido. Si llegara a cerrar el juego,
a los 20 s todo sale igualmente.

## Conversaciones

- Se cierran en el juego y se abren fuera con `cd <carpeta> && claude --resume <id>`, con el mismo modelo, esfuerzo
  y permisos. Al salir de Claude Code te quedas en la carpeta del proyecto, con tu shell y tu historial.
- Si estaban trabajando o esperando un permiso, se interrumpen y fuera se les pide que sigan con lo que estaban
  haciendo.
- **Para traerlas de vuelta:** sal con `/exit` en iTerm y, en el juego, habla con el habitante → «Retomar un trabajo
  anterior». Mientras sigan abiertas fuera, el archivo las marca con ↗ y el juego no deja retomarlas (dos Claude Code
  escribiendo la misma conversación la corromperían).
- Fuera no tienen lo que solo existe en el juego: el MCP de Linear de Logística y las instrucciones del refugio.

## Terminales

- No es una copia: es la misma terminal (el mismo shell, con lo que tenga en marcha) en el juego y fuera a la vez. Lo
  que escribas en un sitio se ve en el otro.
- Mientras esté abierta fuera, manda el tamaño de la ventana de fuera, y en el juego la pestaña lleva ↗ y pone
  «también en tu escritorio».
- Sobrevive aunque cierres el juego mientras siga abierta fuera. Al volver a abrir el juego, reaparece en su pestaña.
- Cerrar la pestaña de iTerm la suelta: sigue en el juego (con el juego cerrado, se cierra sola a los 10 minutos). `exit` la termina en los dos sitios.
- A mano: `./shelter enganchar <id>` (el id es el de la pestaña del juego, p. ej. `sala:express` o `sala:express::2`).

## La primera vez

macOS pide permiso para que work-shelter maneje iTerm. Si lo deniegas, permítelo en Ajustes del Sistema ›
Privacidad y seguridad › Automatización.

## Para quien toca el código

`server/escritorio.ts` (comandos y AppleScript), `server/superficie.ts` (`./shelter superficie` y `enganchar`), la
acción `superficie.sacar` en `server/main.ts`, `Sesiones.sacar` en `server/sesiones.ts`, los clientes de fuera del
anfitrión en `server/anfitrionTerminales.ts` y la tecla de pánico en `electron/main.cjs`. QA:
`node scripts/qa-superficie.mjs` (servidor propio en 3793; `SHELTER_ESCRITORIO_PRUEBA` apunta lo que abriría en vez
de abrir ventanas).
