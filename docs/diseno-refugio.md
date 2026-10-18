# Diseño del refugio

## Disposición
- Hueco del ascensor en x = 0 (3,4 m con paredes). Salas a la izquierda (x < 0) y a la derecha (x > 0) del ascensor; `orden` 0 junto al ascensor, 1 la siguiente.
- Cada sala mide 12 m (3 módulos) + pilares del corte (MARCO = 0,45 m). Centro de una sala: `x = ±(1,7 + MARCO + 6 + orden·(12 + MARCO))`.
- Plantas: `y = −planta · PLANTA` (PLANTA = 4,43 + 0,85). Se rotulan PB, -1, -2… (`rotuloPlanta`). La planta baja está a pie de calle.
- El sitio de cada sala no se elige a mano: lo calcula `distribuir` (`shared/disposicion.ts`) a partir de las salas que hay. El servidor lo aplica al cargar el estado guardado, al reclutar y al retirar una sala:
  - PB: la puerta, sola, a la izquierda del ascensor. Se entra y se sale por ella.
  - -1: cámara acorazada | Puente de Mando.
  - -2: comunicaciones (fuera) y planificación (junto al ascensor) | logística y control de versiones.
  - -3: los repos, en orden alfabético de izquierda a derecha y repartidos a los dos lados (la mitad redondeando hacia arriba a la izquierda). Caben 8 por planta; si hay más, siguen en la -4 y así.
  - La última planta: ocio (hidroponía y discoteca | galería de tiro y Chapa y Pintura).
- Calle: el terreno del yermo a la altura de la planta baja, con el cielo (degradado y siluetas de colinas y árboles secos del pack de naturaleza KayKit). A pie de calle quedan la puerta, con el rótulo «REFUGIO 42» en el tejado, y la torre del ascensor.
- Roca: una cara de corte con estratos de la calle hacia abajo, con agujeros para las salas y el hueco del ascensor; las zonas sin excavar son roca (sin cuevas por ahora).

## Circulación
- Cada planta tiene un carril de paso (z ≈ 1,2) que atraviesa sus salas por puertas en los tabiques (paredes laterales con hueco de puerta) y llega al ascensor.
- El ascensor tiene una cabina que sube y baja de verdad (con puertas, sonido, campanilla). Los personajes entran, la cabina viaja y salen.
- Grafo de navegación: nodos por planta (puertas, centro de cada sala, rellano del ascensor) y aristas verticales por el ascensor. Ruta = A* sobre ese grafo; el desplazamiento horizontal usa los clips de marcha y el vertical la cabina.
- Supervisor: A/D (←→) por la planta, W/S (↑↓) en profundidad dentro de una sala; en el rellano del ascensor, W/S llaman a la cabina para subir o bajar. Clic en el suelo de una sala: ir allí (con ascensor si hace falta).

## Luz con muchas salas (rendimiento)
- Un reparto fijo de luces dinámicas (6 focos, 1 con sombra, y 1 puntual para la pieza protagonista) que se asignan cada medio segundo a las lámparas más cercanas a la cámara. El número de luces nunca cambia (los shaders no se recompilan).
- Las lámparas sin luz asignada muestran su bombilla emisiva y una poza falsa (decal aditivo) para que de lejos parezcan encendidas.
- La sombra del sol sigue al encuadre de la cámara.

## Tipos de sala (personalidad propia, material fijado)
| Tipo | Pieza protagonista | Acorde | Habitante | Notas |
|---|---|---|---|---|
| Repo de serie: Estudio (express; web y Node) | Rack de servidores con pilotos y muro de pantallas | óxido, fósforo | Remi | sofá; la plantilla de los repos web y Node |
| Repo de serie: Laboratorio (requests; Python) | Terrario de cristal | oliva, verde | Lola | mesa de pruebas con fregadero, invernadero de bandejas |
| Repo de serie: Fundición (ripgrep; Rust y Go) | Forja de ladrillo con campana y chimenea | rojo óxido, cobre | Vera | yunque sobre tocón, crisol, tina de temple |
| Repo de serie: Archivo (awesome; sin código) | Estantería alta de cajas | ocre | Marga | fichero con terminal, mesa de consulta |
| Repo con decorado («Adaptar la sala al repo») | La que diseñe su habitante con el atrezo del juego | el suyo | el de la sala | `shared/decorado.ts`, `docs/decorados.md`; también puede partir del taller web, el escaparate, el archivo de marca o la sala de proyección hechos a mano |
| Comunicaciones | Centralita de radio con antenas y tubo neumático | verde | Ondina | pantalla con el feed real de notificaciones |
| Planificación | Pizarra-calendario de la semana (eventos reales) | azul | Calixto | relojes, mesa con mapa |
| Logística (tipo `logistica`) | Pantalla táctica con el tablero de Linear | rojo | CM-4 (Clanker) | consolas en arco |
| Control de Versiones (tipo `git`) | Cliente de git de todos los repos del refugio | grafito, verde | la Octocat (modelo propio, animada por código) | matriz de contribuciones y pull requests |
| Puente de Mando | Maqueta holográfica del refugio en vivo sobre un proyector (el repo del juego) | grafito y latón | Néstor «El Arquitecto» (Survivalist, aspecto original) | columnas de código, núcleo de energía (el generador), mesa de planos |
| Cámara acorazada | Pared de cajas de seguridad, una por integración con su piloto, tras una barrera láser | acero y rojo | Hanzo «Doble Factor» (4GTN con katana) | escáner biométrico, torreta y dron, reserva de oro, cámaras del refugio |
| Puerta Principal | Puerta-engranaje gigante | acero, amarillo | Guardián (androide 4GTN) | reclutamiento; cola de reclutas (carpetas sugeridas) |
| Hidroponía | Bancales de cultivo que crecen con las herramientas | verde, magenta (luces de cultivo) | Fermín | actividad: cosechar |
| Discoteca | Cabina del DJ (Spotify) | neón | DJ-80 | pista de baile con bailarines |
| Galería de tiro | Dianas y mostrador | rojo, amarillo | Dora | actividad: tiro al blanco (primera iteración, a medias: ver README) |
| Chapa y Pintura | Barbería y ropería: cambiar de aspecto | verde agua | Fito | probador (`web/src/ui/Probador.tsx`) |
