# Material artístico del Refugio

Este es el material con el que se construye el juego. No se dibuja nada a mano: el acabado sale de estos packs, de la luz y de la composición. Los packs son **CC0** (dominio público: uso libre, sin atribución obligatoria), verificado leyendo las licencias originales (copia en `LICENSES/`).

## Fuentes (fijadas por commit)

| Material | Autor | Licencia | Mirror en GitHub (commit fijado) |
|---|---|---|---|
| Personajes, props y **133 animaciones humanoides** | KayKit / Kay Lousberg (kaylousberg.com), colección completa v6 | CC0 | `GeorgeQLe/assets-kaykit-3d-characters` @ `af08a62d3669370ec4636ae6314b38cdcd5dd759` |
| Módulos de interior sci-fi, mobiliario, supervivencia, cyberpunk | Quaternius (quaternius.com) | CC0 | `trebeljahr/quaternius-showcase` @ `e90ffea347393537703ae6f9d73e36492820f5a9` (carpeta `public/glb/<pack>/`) |

`./shelter` lo descarga la primera vez desde esos commits a `./assets/` (`scripts/descargar-assets.mjs` con `scripts/manifest_assets.json`, y `scripts/descargar-extra.mjs` para el resto de piezas; idempotente). No se versiona: solo los terceros que no se pueden bajar de un commit fijo van en `assets/terceros/`.

Fuentes **opcionales** del mismo autor y licencia, por si hacen falta más piezas (misma estética, así que no rompen la coherencia): `GeorgeQLe/assets-kaykit-3d-environments` (City Builder Bits, Dungeon Remastered, Platformer, Medieval…) y `GeorgeQLe/assets-kaykit-3d-props` (Restaurant Bits, Halloween Bits, herramientas, mobiliario). Y en el mirror de Quaternius hay más packs (`rpg_items_pack`, `platformer_game_pack`, `street_pack`, `ultimate_space_pack`, `mech_pack`…). Kenney (kenney.nl, CC0) también es compatible en espíritu, pero su mirror no está fijado aquí: si lo usas, fija el origen.

Excepciones a CC0, con su licencia en `LICENSES/`: la Octocat de Control de Versiones (modelo de la comunidad, CC-BY 4.0, en `assets/terceros/octocat/`) y las tipografías de la interfaz (OFL, en `web/public/fuentes/`). El icono de la app (`electron/icono/`) es una imagen generada con IA para este proyecto y va con la licencia del repo.

Lo que **no** se usa: nada de Bethesda, Klei, ni texturas o sprites sacados de "rips" de juegos.

## El reparto (personajes KayKit, rig `Rig_Medium`, 23 huesos, texturas embebidas)

Todos comparten esqueleto, así que **cualquier clip de `character-animations-1.1/Animations/gltf/Rig_Medium/*.glb` se aplica a cualquiera de ellos** sin retargeting (verificado en three.js con `AnimationMixer`: los nombres de hueso coinciden: `root, hips, spine, chest, head, upperarm.l/r, lowerarm.l/r, wrist.l/r, hand.l/r, handslot.l/r, upperleg.l/r, lowerleg.l/r, foot.l/r, toes.l/r`…). Los previews oficiales de KayKit son la vara de medir de cómo deben verse en pantalla.

| Personaje | Archivo (bajo `assets/kaykit/`) | Papel natural en el refugio |
|---|---|---|
| Engineer | `adventurers-2.0/Characters/gltf/Engineer.glb` | Ingeniero de sala de repo (gafas, barba, mochila) |
| Survivalist | `mystery-monthly-series-4/9 - March 2024 - Survivalist/character/Survivalist.glb` | Superviviente (máscara de gas); props: `…/assets/gltf/` (mochila, escudos balísticos, señal de stop, hidrante) |
| Hoarder | `mystery-monthly-series-6/8 - February 2026 - Hoarder/characters/Hoarder.glb` | Carroñero del yermo (bufanda, bolsas) |
| Hiker | `mystery-monthly-series-5/11 - May 2025 - Hiker/characters/Hiker.glb` | Explorador; props: tienda, mochila |
| Protagonist_A / Protagonist_B | `mystery-monthly-series-5/10 - April 2025 - Protagonists/characters/Protagonist_*.glb` | Habitantes jóvenes (gorra, gafas); buen Supervisor jugable |
| Driver | `mystery-monthly-series-4/2 - August 2023 - Driver/character/gltf/Driver.glb` | Mecánico / conductor (gafas de sol); props: coche |
| SpaceRanger (+ `_FlightMode`) | `mystery-monthly-series-4/7 - January 2024 - Space Ranger/character/SpaceRanger*.glb` | Traje de exploración de superficie |
| Clanker | `mystery-monthly-series-5/9 - March 2025 - Clanker/characters/Clanker.glb` | Robot pesado (IA domesticada); más ancho que alto: escálalo por altura ~2.3 |
| Robot_One / Robot_Two | `mystery-monthly-series-4/12 - June 2024 - Robot/characters/Robot_*.glb` | Robots asistentes / subagentes |
| 4GTN (+ `_Forgotten`) | `mystery-monthly-series-6/7 - January 2026 - 4GTN/characters/4GTN*.glb` | Robot samurái; la variante "Forgotten" vale para IA abandonada del lore |
| Animatronic_Normal / _Creepy | `mystery-monthly-series-4/5 - November 2023 - Animatronic/characters/gltf/Animatronic_*.glb` | Lore: la IA descontrolada de la superficie |
| CombatMech | `mystery-monthly-series-5/1 - July 2024 - Combat Mech/characters/CombatMech.glb` | Guardián de la puerta del refugio (grande) |

Accesorios intercambiables en `adventurers-2.0/Assets/gltf/` (123 archivos gltf+bin: herramientas, cascos, mochilas, cajas de munición, antorchas…): se enganchan al hueso `handslot.l/r` o a la cabeza para dar variedad (sombreros, herramientas al trabajar).

Sin usar (no encajan en el tema): Knight, Mage, Rogue, Barbarian, Druid, Ranger, Skeletons, Toy Soldier, Clown, Witch, Vampire, Plant Warrior…

## Inventario de animaciones (`Rig_Medium_*.glb`)

- **General** (15): Death_A, Death_A_Pose, Death_B, Death_B_Pose, Hit_A, Hit_B, Idle_A, Idle_B, Interact, PickUp, Spawn_Air, Spawn_Ground, T-Pose, Throw, Use_Item
- **MovementBasic** (11): Jump_Full_Long, Jump_Full_Short, Jump_Idle, Jump_Land, Jump_Start, Running_A, Running_B, T-Pose, Walking_A, Walking_B, Walking_C
- **MovementAdvanced** (13): Crawling, Crouching, Dodge_Backward/Forward/Left/Right, Running_HoldingBow, Running_HoldingRifle, Running_Strafe_Left/Right, Sneaking, T-Pose, Walking_Backwards
- **Simulation** (14): Cheering, Lie_Down, Lie_Idle, Lie_StandUp, Push_Ups, Sit_Chair_Down, Sit_Chair_Idle, Sit_Chair_StandUp, Sit_Floor_Down, Sit_Floor_Idle, Sit_Floor_StandUp, Sit_Ups, T-Pose, Waving
- **Tools** (29): Chop, Chopping, Dig, Digging, Fishing_Bite/Cast/Catch/Idle/Reeling/Struggling/Tug, Hammer, Hammering, Holding_A/B/C, Lockpick, Lockpicking, Pickaxe, Pickaxing, Saw, Sawing, T-Pose, Work_A/B/C, Working_A/B/C
- **CombatMelee** (22) y **CombatRanged** (20): ataques, bloqueos, apuntar, disparar, magia. Útiles para minijuegos (tiro al blanco) y para el lore de la superficie.
- **Special** (15): animaciones de esqueletos y una transformación experimental; en principio no se usan.

Mapa natural de estados del habitante → clip: pensando/leyendo = `Idle_B` o `Sit_Chair_Idle` + accesorio tablilla; ejecutando herramienta = `Working_A/B/C`, `Hammering`, `Sawing`; esperando permiso = `Idle_A` + `Waving`; termina = `Cheering`; error = `Hit_A/B`; dormido (sin sesión) = `Lie_Idle`; paseo = `Walking_A/B/C`; prisa = `Running_A`; recoger/usar = `PickUp`, `Use_Item`, `Interact`; subagente = robot con `Working_C` / `Digging`.

## Inventario de módulos (Quaternius, GLB, materiales planos sin textura)

- **modular_sci_fi** (91): Wall_1..5, Wall_Empty, paredes con puerta simple/doble (`DoorSingle_Wall_SideA/B`, `DoorDouble_Wall_SideA/B`, versiones Long), paredes con ventana (`Window_Wall_SideA/B`, `LongWindow_Wall`, `SmallWindows_Wall`, `ThreeWindows_Wall`), `Door_Single`, `Door_Double`, FloorTile_Basic/Basic2/Corner/Double_Hallway/Empty/InnerCorner/Side, RoofTile_* (vents, pipes, plates), Column_1/2/3/Slim, Staircase, Pipes, Details_* (Arrow, Basic_1..4, Cylinder, Dots, Hexagon, Output, Pipes_Long/Medium/Small, Plate_*, Triangles, Vent_1..5, X), Props_Base, Props_Capsule, Props_Chest, Props_Computer, Props_ComputerSmall, Props_ContainerFull, Props_Crate, Props_CrateLong, Props_Laser, Props_Pod, Props_Shelf, Props_Shelf_Tall, Props_Statue, Props_Teleporter_1/2, Props_Vessel/_Short/_Tall.
- **house_interior_pack** (123): camas (Bed_Bunk, Bed_King, Bed_Single), sofás, sillas, mesas, taburete, estanterías, cajoneras, mesillas, cocina (fregadero, horno, nevera, armarios), baño completo, lámparas (Light_Ceiling1..6, Light_Desk, Light_Floor1..4, Light_Stand, Light_Chandelier, Light_Cube…), plantas (Houseplant_1..8), alfombras, puertas (Door_1..9, Door_Double), ventanas, papeleras, columnas, chimenea, cubiertos.
- **survival_pack** (53): Radio, Battery_Big/Small, PropaneTank, GasCan, FirstAidKit(_Hard), Backpack, Bonfire(_Fire), Tent, Torch, WoodenTorch, Shovel, Axe, Knife, Pan, Pot, Compass, Matchbox, Phone, FlareGun, WaterBottle_1..3, Can_*, BearTrap, Raft, Trashcan, WoodLog, armas de fuego (Pistol, Revolver, Shotgun…).
- **cyberpunk_pack** (71): Computer, Computer_Large, TV_1..3, Pipe_1/2, Pipe_Corner(_2), Cable_Long/Small/Thick, AC(_Side/_Stacked), Antenna_1/2, Light_Square, Light_Street_1/2, Lever, Lootbox, Fence, Rail_*, Sign_* (incl. Sign_Corner_Hazard), Support(_Long/_Short), Platform_*, Tank, Turret_*, Enemy_* (drones, mechs), Character, Collectible_*, Pickup_*.

## Medidas reales (bounding box en three.js tras aplicar los nodos), para escalar bien

Los accessors de los GLB de Quaternius **no** sirven para medir (traen escala 100 y rotaciones en los nodos): mide siempre con `Box3.setFromObject`. Unidades: Quaternius ≈ metros; KayKit personajes 2.2–2.4 de alto (Clanker 5.6 ancho × 3.8 alto; CombatMech grande).

| Módulo | ancho × alto × fondo |
|---|---|
| Wall_1/2/3, Window_Wall, DoorSingle_Wall | 4.00 × 4.43 × 0.5–1.25 |
| FloorTile_Basic / Basic2 | 2.00 × 0.09 × 2.00 |
| Column_1 / Column_Slim | 0.68 × 4.46 × 0.68 |
| Pipes (horizontal) | 3.51 × 0.37 × 0.13 |
| Details_Pipes_Long (**vertical**) | 0.51 × 1.58 × 0.09 |
| Details_Vent_1 | 0.53 × 0.31 × 0.04 |
| Details_Plate_Large | 1.05 × 1.08 × 0.03 |
| Door_Single | 1.67 × 2.79 × 0.45 |
| Staircase | 3.78 × 1.45 × 3.11 |
| Props_Computer / ComputerSmall | 0.58 × 2.08 × 0.64 / 0.75 × 1.54 × 0.46 |
| Props_Shelf_Tall / Props_Crate / Props_ContainerFull | 2.06 × 3.11 × 0.81 / 0.80 cubo / 1.20 × 0.58 × 0.75 |
| Props_Pod / Props_Capsule / Props_Base | 1.81 × 3.61 × 1.81 / 0.87 × 1.62 × 0.87 / 2.40 × 0.32 × 2.40 |
| Computer_Large (cyberpunk) | 1.29 × 2.38 × 0.69 |
| Bed_Bunk | 2.17 × 3.03 × 4.00 (largo en z) |
| Light_Ceiling1 / Houseplant_3 | 0.44 × 0.82 × 0.44 / 0.34 × 0.84 × 0.34 |
| PropaneTank / GasCan / Radio / FirstAidKit (survival, vienen grandes) | 2.16 × 2.89 / 1.88 × 2.47 / 1.69 × 2.10 / 1.56 × 1.36 → escálalos a su tamaño real (≈1.1, 0.6, 0.35, 0.6 de alto) |

## Notas técnicas (lo que hay que saber al montar una sala)

1. **Materiales Quaternius**: vienen con `metalness 0.4` y `roughness ≈ 0.4` y sin mapa de entorno, así que se ven oscuros y sucios. En el refugio se ponen a `metalness ≈ 0.05`, `roughness ≈ 0.7`. Los nombres de material son estables y sirven para recolorear: `Main` (gris medio), `DarkGrey`, `Light` (**gris claro, no una lámpara**: no le pongas emisivo), `Accent` (naranja: en paredes se recolorea a un teal apagado, en props se deja), `DarkAccent`, `Black`, `Screen` (pantallas: emisivo verde queda bien).
2. **Escala por el eje correcto**: `fit` por anchura en un módulo vertical (Details_Pipes_Long, Cable_Long) produce monstruos de 13–40 unidades. Mide primero, escala por la dimensión que de verdad fija el tamaño.
3. **Personajes KayKit**: `MeshStandardMaterial` con textura (atlas de gradiente embebido). Pon `map.colorSpace = SRGBColorSpace`. Castan y reciben sombras sin problema. Escálalos por altura al tamaño del mundo.
4. **Luz**: una direccional cálida con sombras (`PCFSoft`, 2048), hemisférica suave, dos puntuales cálidas en las lámparas y una verde en las pantallas, `ACESFilmic` con exposición ≈ 1.2. Sin esto todo parece plástico; con una luz naranja demasiado fuerte todo se vuelve amarillo.
5. Las masas de roca alrededor de la sala no deben proyectar sombra (meten cuñas negras dentro de la sala).
6. `GLTFLoader.parse` acepta un ArrayBuffer, así que los assets pueden embeberse o servirse en local; no hace falta red en tiempo de ejecución.
7. Los módulos comparten geometría si los cargas una vez y clonas (`scene.clone(true)` + clonar materiales solo si vas a recolorear); con cientos de módulos, instancia o fusiona geometrías por sala para mantener 60 fps.
