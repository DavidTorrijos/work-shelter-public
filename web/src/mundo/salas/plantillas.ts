// Plantillas de las salas de recluta: cada tipo de repo con su silueta y su pieza protagonista (solo modelos del pack).
// - fundición (Rust, Go): forja de ladrillo con campana y chimenea, yunque sobre tocón, crisol, tina de temple.
// - laboratorio (Python): terrario de cristal en el centro, mesa de pruebas con fregadero e invernadero de bandejas.
// - estudio (web, Node): rack de servidores con pilotos, muro de pantallas y sofá.
// - archivo (carpeta sin git o sin tipo): estantería alta de cajas, fichero con terminal y mesa de consulta.
// La pantalla con el estado real del repo cambia de sitio y de tamaño en cada una. Todas se espejan con la semilla.
import * as THREE from 'three';
import { colocar, R } from '../../motor/assets';
import { cartel, PantallaFosforo, PanelSala } from '../../motor/texturas';
import { superponerPantalla, pantallaFrontal } from '../util3d';
import { cartelEnPared, mancha, bandaAlta, monitorPared, montarPilotos, pantallaReal, apagarParedes, puestoTrabajo, apoyar, centrar, tumbada, aPared, ALTO, type Contexto } from './comun';
import { pantallaEstadoRepo } from './generica';

export type Plantilla = 'fundicion' | 'laboratorio' | 'estudio' | 'archivo' | 'banco';

// (qué plantilla le toca a cada repo según su tipo: plantillaDe, en shared/decorado.ts)
export const SUBTITULO_PLANTILLA: Record<Plantilla, string> = { fundicion: 'FUNDICIÓN', laboratorio: 'LABORATORIO', estudio: 'ESTUDIO', archivo: 'ARCHIVO', banco: 'TALLER' };
export const PANELES_PLANTILLA: Record<Plantilla, string[]> = {
  fundicion: ['Wall_5', 'Wall_Empty', 'Wall_5'], laboratorio: ['Wall_2', 'Wall_1', 'Wall_4'],
  estudio: ['Wall_4', 'Wall_3', 'Wall_1'], archivo: ['Wall_3', 'Wall_5', 'Wall_1'], banco: ['Wall_4', 'Wall_1', 'Wall_3'],
};

// espejo por semilla: todo se escribe para el lado «normal» y se refleja en X
function espejo(ctx: Contexto) {
  const s = ctx.semilla % 2 ? 1 : -1;
  const X = (x: number) => x * s;
  const obst = (x0: number, z0: number, x1: number, z1: number) => ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(Math.min(X(x0), X(x1)), Math.min(z0, z1)), new THREE.Vector2(Math.max(X(x0), X(x1)), Math.max(z0, z1))));
  const tramo = (a: number, b: number): [number, number] => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
  const punto = (id: string, tipo: any, x: number, y: number, z: number, giro: number, extra: Record<string, unknown> = {}) => ctx.sala.puntos.push({ id, tipo, pos: new THREE.Vector3(X(x), y, z), giro: giro * s, ...extra } as any);
  return { s, X, obst, tramo, punto };
}

// la pantalla grande con el estado del repo: un monitor del pack colgado (o apoyado) con soporte; la primera de la sala
async function pantallaRepo(ctx: Contexto, x: number, y: number, escala: number, titulo: string, rot = 0) {
  const p = new PantallaFosforo(704, 400, ctx.v.pantalla, titulo); p.velocidad = 45;
  const m = await monitorPared(ctx, x, y, escala, p.tex, 1.15, rot);
  // marco en grafito: en blanco era lo que más quemaba de la sala
  m.traverse((n: any) => { if (n.isMesh && !n.material.emissiveMap) { n.material = n.material.clone(); n.material.color = new THREE.Color('#3a3834'); n.material.roughness = 0.6; } });
  ctx.sala.pantallas.unshift(p);
  pantallaEstadoRepo(ctx, p, 30);
  return p;
}

const tinte = (o: THREE.Object3D, f: (m: THREE.MeshStandardMaterial, n: THREE.Mesh) => void) => o.traverse((n: any) => { if (n.isMesh) for (const m of [].concat(n.material)) f(m as THREE.MeshStandardMaterial, n); });

// ======================================================================== FUNDICIÓN (Rust, Go)
export async function amueblarFundicion(ctx: Contexto) {
  const { g, zB, K, P, semilla } = ctx; const { s, X, obst, tramo, punto } = espejo(ctx);
  await bandaAlta(ctx, { manometro: X(-4.7), valvulas: [X(-3.3)], tramos: [[X(-4.1), 3.6]] });
  // ---- CENTRO: la forja. Hogar de ladrillo, fuego, crisol encima y campana con chimenea hasta el techo
  const fx = -0.7, fz = zB + 1.0;
  // ladrillo refractario: el mismo modelo de piedra, tostado por el fuego; el fuego y el crisol, apoyados encima
  const hogar: THREE.Object3D[] = [];
  for (const dx of [-0.57, 0.57]) hogar.push(await colocar(g, R.recurso('Stone_Bricks_Stack_Large'), { pos: [X(fx + dx), 0, fz], alto: 0.92, propios: true, variante: ctx.v }));
  for (const o of hogar) tinte(o, m => m.color.multiply(new THREE.Color(0.78, 0.5, 0.38)));
  const fuego = apoyar(await colocar(g, R.sv('Bonfire_Fire'), { pos: [X(fx - 0.3), 0, fz + 0.05], ancho: 0.95, propios: true, estatico: false, sombra: false }), hogar[0]);
  const llamas: THREE.MeshStandardMaterial[] = [];
  tinte(fuego, m => { if (m.name === 'Fire') { m.emissive = new THREE.Color('#ff7a1a'); m.emissiveIntensity = 2.2; m.toneMapped = true; llamas.push(m); } });
  const crisol = apoyar(await colocar(g, R.sv('Pot'), { pos: [X(fx + 0.68), 0, fz + 0.05], alto: 0.42, rot: X(0.5), variante: ctx.v }), hogar[1]);
  const cCrisol = new THREE.Box3().setFromObject(crisol);
  const colada = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff8a2a', emissiveIntensity: 2.4 }));
  colada.rotation.x = -Math.PI / 2; colada.position.set(X(fx + 0.68), cCrisol.max.y - 0.05, fz + 0.05); colada.userData.estatico = false; g.add(colada);
  P(R.cocina('extractorhood'), { pos: [X(fx), 2.0, zB + 0.3], ancho: 2.4, ancla: 'atras', propios: true }).then(o => { o.scale.z *= 0.62; tinte(o, m => { m.color.multiplyScalar(0.62); m.metalness = 0.55; m.roughness = 0.45; }); });
  P(R.herr('tongs'), { pos: [X(fx + 1.3), 0, fz + 0.62], alto: 0.95, rotZ: X(-0.22) });
  P(R.herr('shovel'), { pos: [X(fx - 1.3), 0, fz + 0.62], alto: 1.2, rotZ: X(0.2), rot: X(0.3) });
  // fuelle mecánico (aire acondicionado del pack) soplando por un tubo al hogar
  P(R.cy('AC'), { pos: [X(-2.75), 0, zB + 0.75], alto: 0.72, rot: X(0.25) });
  P(R.cy('Pipe_1'), { pos: [X(-2.1), 0.34, zB + 0.95], ancho: 0.8 });
  obst(-3.3, zB, 0.6, zB + 1.75);
  // ---- yunque sobre tocón, y el herrero a su lado (de tres cuartos)
  const ax = 1.5, az = -0.5;
  // el tocón (un tronco puesto de pie, en el suelo) y el yunque encima, apoyado de verdad; el martillo, tumbado en el suelo
  const tocon = apoyar(centrar(await colocar(g, R.recurso('Wood_Log_A'), { pos: [X(ax), 0, az], escala: 0.6, rotX: Math.PI / 2, variante: ctx.v }), X(ax), az), null);
  ctx.sobre(tocon, R.herr('anvil'), { pos: [X(ax), 0, az], escala: 0.42, rot: X(0.12) });
  ctx.sobre(null, R.herr('hammer'), { pos: [X(ax + 0.62), 0, az + 0.35], escala: K * 0.6, ...tumbada(X(0.8)) });
  obst(1.1, az - 0.35, 1.9, az + 0.35);
  const chispa = new THREE.Vector3(X(ax), 1.0, az);
  punto('yunque', 'aficion', ax + 0.82, 0, az + 0.05, -1.15, { clip: 'Hammering', utensilio: 'martillo', gesto: { clip: 'Hammering', cada: 2.4, alHacer: () => ctx.sala.efectos?.chispas.rafaga(chispa, 12) } });
  // ---- tina de temple (con vapor que sube de ella, lejos de la pantalla)
  const agua = new THREE.Mesh(new THREE.CircleGeometry(0.33, 20), new THREE.MeshStandardMaterial({ color: '#1b2a2c', roughness: 0.15, metalness: 0.6 }));
  agua.rotation.x = -Math.PI / 2; agua.position.set(X(2.95), 0.72, zB + 0.85); g.add(agua);
  ctx.P(R.recurso('Food_Barrel_Empty'), { pos: [X(2.95), 0, zB + 0.85], alto: 0.8 }).then(o => { agua.position.y = new THREE.Box3().setFromObject(o).max.y - 0.08; });
  obst(2.45, zB, 3.45, zB + 1.35);
  // ---- DERECHA: la mesa del maestro fundidor (su puesto, de tres cuartos), bajo el parte de colada (estado del repo)
  await pantallaRepo(ctx, X(4.45), 1.5, 2.25, ' parte de colada');
  const pFundi = new PantallaFosforo(256, 320, ctx.v.pantalla, ' hornada'); pFundi.velocidad = 24;
  pantallaReal(ctx, pFundi, 'actividad'); ctx.sala.pantallas.push(pFundi);
  await puestoTrabajo(ctx, { x: X(4.55), z: -0.75, giro: X(-0.75), pantalla: 'ordenador', tex: pFundi.tex, silla: R.mueble('chair_desk_B'),
    encima: [{ ruta: R.herr('chisel'), x: -0.62, z: 0.25, c: { escala: K * 0.6, ...tumbada(0.4) } }, { ruta: R.herr('file'), x: 0.55, z: 0.3, c: { escala: K * 0.6, ...tumbada(-0.3) } },
      { ruta: R.recurso('Iron_Bars'), x: 0.65, z: -0.2, c: { escala: K * 0.45, rot: 0.2 } }, { ruta: R.herr('lantern'), x: -0.68, z: -0.3, c: { escala: K * 0.45 } }] });
  P(R.recurso('Copper_Bars_Stack_Small'), { pos: [X(5.55), 0, zB + 0.55], escala: K * 0.5 });
  obst(5.1, zB, 6, zB + 1.0);
  P(R.recurso('Wood_Log_Stack'), { pos: [X(5.45), 0, 1.15], escala: K * 0.42, rot: X(-0.3) });
  // ---- IZQUIERDA: lingotes, mineral, piedra de afilar y botellas de gas contra la pared
  P(R.recurso('Iron_Bars_Stack_Large'), { pos: [X(-5.35), 0, zB + 0.62], alto: 0.78 });
  P(R.recurso('Copper_Bars_Stack_Medium'), { pos: [X(-5.55), 0, zB + 1.45], alto: 0.95 });
  P(R.herr('grindstone'), { pos: [X(-4.25), 0, zB + 0.95], ancho: 1.25, rot: X(0.35) });
  P(R.cy('Tank'), { pos: [X(-3.55), 0, zB + 0.42], alto: 1.25 });
  P(R.sf('Details_Pipes_Long'), { pos: [X(-3.0), 0.9, zB + 0.34], alto: 1.8, sombra: false });
  obst(-6, zB, -3.3, zB + 1.8);
  punto('consola', 'consola', -3.35, 0, zB + 2.05, -2.3, { clip: 'Working_A' });   // afilando (lejos de la pantalla: la etiqueta no la tapa)
  P(R.recurso('Iron_Nuggets'), { pos: [X(-2.2), 0, 0.9], escala: K * 0.55, rot: 0.8 });
  P(R.herr('bucket_metal'), { pos: [X(-2.75), 0, 1.15], escala: K * 0.5 });
  // la pieza: la forja. Se atiza el fuego (chispas y llamarada), se le da al fuelle o se coge un lingote del montón
  let llamarada = 0;
  const bocaForja = new THREE.Vector3(X(fx - 0.3), 1.2, fz + 0.15);
  const atizar = () => { llamarada = 1; ctx.sala.efectos?.chispas.rafaga(bocaForja, 22); };
  punto('forja', 'pieza', fx - 0.3, 0, zB + 2.05, Math.PI, { acciones: [{ clip: 'Use_Item', alHacer: atizar }, { clip: 'Interact', alHacer: atizar }, { clip: 'PickUp' }] });
  punto('fuelle', 'pieza', -2.35, 0, zB + 2.0, Math.PI - 0.5, { acciones: [{ clip: 'Working_B', alHacer: atizar }, { clip: 'Interact' }] });
  cartelEnPared(g, cartel(['EL BORROW', 'CHECKER', 'NO SE', 'DISCUTE'], 'FUNDICIÓN · WORK-SHELTER', '#e6d2b0', '#6b2a14', 'rayo', semilla + 3), X(-5.15), 2.45, 0.56, 0.78, zB + 0.33, 0.03 * s);
  mancha(g, X(-0.6), 0.2, 1.6, semilla); mancha(g, X(1.6), 0.4, 0.9, semilla + 2);
  const panel = new PanelSala(); panel.titulo = 'FUNDICIÓN'; panel.color = ctx.v.pantalla; ctx.panel = panel;
  ctx.sala.zonasPaseo = [tramo(-3.0, -1.9), tramo(-0.2, 0.6), tramo(2.6, 3.6)];
  ctx.vapor = { pos: new THREE.Vector3(X(2.9), 0.8, zB + 0.85), dir: new THREE.Vector3(-0.3 * s, 0.9, 0.2) };
  ctx.chispas = chispa;
  ctx.lamparas = [{ x: X(-4.3), z: 0.45, o: { intensidad: 60, objetivo: [X(-4.3), -1.2] } }, { x: X(0.7), z: 0.4, o: { intensidad: 55, sombra: true, objetivo: [X(0.9), -0.9] } }, { x: X(4.45), z: 0.8, o: { intensidad: 55, corta: true } }];
  // el fuego ilumina la forja y late con la actividad
  const ancla = { tipo: 'punto' as const, pos: new THREE.Vector3(X(fx - 0.2), 1.5, fz + 0.6), intensidad: 3.5, color: new THREE.Color('#ff7a2a'), distancia: 4, prioridad: 2 };   // la fragua alumbra la sala, no quema a quien trabaja al lado
  ctx.sala.anclas.push(ancla);
  ctx.alActualizar((dt, t, a) => {
    const parpadeo = Math.sin(t * 11) * 0.35 + Math.sin(t * 4.3) * 0.5 + Math.sin(t * 23) * 0.15;
    llamarada = Math.max(0, llamarada - dt * 0.8);
    ancla.intensidad = 3 + a * 2.2 + parpadeo * 0.8 + llamarada * 3;
    for (const m of llamas) m.emissiveIntensity = 2 + a * 1.2 + parpadeo * 0.4 + llamarada * 1.5;
    fuego.scale.y = 1 + parpadeo * 0.04 + llamarada * 0.35;
  });
}

// ======================================================================== LABORATORIO (Python)
export async function amueblarLaboratorio(ctx: Contexto) {
  const { g, zB, K, P, semilla } = ctx; const { s, X, obst, tramo, punto } = espejo(ctx);
  apagarParedes(g, 0.62, 0.75);
  // el blanco de catálogo (fregadero, estantería, bombona) a gris de laboratorio usado: quemaba bajo las lámparas
  const gris = (o: THREE.Object3D) => tinte(o, m => { m.color.multiplyScalar(0.55); m.roughness = Math.max(m.roughness ?? 0.5, 0.75); });
  await bandaAlta(ctx, { manometro: X(4.9), valvulas: [X(3.1)], tramos: [[X(3.9), 3.6]] });
  // ---- CENTRO: el terrario (módulo ecológico de cristal con árboles), con cables de riego que bajan del techo
  const tx = 0.5, tz = -0.85;
  const terrario = await colocar(g, R.base('eco_module'), { pos: [X(tx), 0, tz], alto: 2.3, propios: true, estatico: false });
  tinte(terrario, m => { if (m.name === 'Glass') { m.opacity = 0.28; m.color = new THREE.Color('#bfe6dd'); m.roughness = 0.05; } else if (m.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.6) m.color.multiplyScalar(0.6); });
  for (const dx of [-0.45, 0.45]) P(R.cy('Cable_Thick'), { pos: [X(tx + dx), ALTO, tz - 0.2], alto: 2.05, ancla: 'techo', sombra: false });
  obst(tx - 1.25, zB, tx + 1.25, tz + 1.2);
  // consola de control del terrario (lo que hace ahora quien trabaja en la sala)
  const consola = await colocar(g, R.sf('Props_ComputerSmall'), { pos: [X(-1.35), 0, zB + 0.6], alto: 1.5, rot: X(0.25), variante: ctx.v, estatico: false });
  const pAct = new PantallaFosforo(256, 320, ctx.v.pantalla, ' sensores'); pAct.velocidad = 26;
  pantallaReal(ctx, pAct, 'actividad'); superponerPantalla(consola, /^Black$/, pAct.tex, { brillo: 1.25, margen: 0.9 }); ctx.sala.pantallas.push(pAct);
  obst(-1.8, zB, -0.9, zB + 1.0);
  punto('terrario', 'aficion', tx + 1.45, 0, tz + 0.55, -1.25, { clip: 'Holding_A', utensilio: 'lupa', gesto: { clip: 'Interact', cada: 4.5 } });
  // la pieza: el terrario. Se mira con la lupa, se toca el cristal o se riega por la boca de arriba (sube el vaho y la
  // luz de dentro se aviva)
  let riego = 0; const regar = () => { riego = 1; };
  const haciaTerrario = (x: number, z: number) => Math.atan2(tx - x, tz - z);
  punto('terrario-frente', 'pieza', tx - 0.55, 0, tz + 1.5, haciaTerrario(tx - 0.55, tz + 1.5), { acciones: [{ clip: 'Holding_A', utensilio: 'lupa', dur: 4 }, { clip: 'Interact', alHacer: regar }, { clip: 'Use_Item', utensilio: 'regadera', alHacer: regar }] });
  // ---- IZQUIERDA: mesa de pruebas con fregadero, frascos y pociones; encima, el cuaderno de experimentos (repo)
  const bx = -3.75;
  const fregadero = P(R.cocina('kitchentable_sink_large'), { pos: [X(bx), 0, zB + 1.05], escala: K * 0.95, propios: true });
  fregadero.then(gris);
  ctx.sobre(fregadero, R.acc('potion_large_green'), { pos: [X(bx - 0.75), 0, zB + 1.15], alto: 0.32 });
  ctx.sobre(fregadero, R.acc('potion_medium_blue'), { pos: [X(bx - 0.45), 0, zB + 1.3], alto: 0.24 });
  ctx.sobre(fregadero, R.cocina('jar_B_medium'), { pos: [X(bx + 0.6), 0, zB + 0.95], alto: 0.3 });
  ctx.sobre(fregadero, R.cocina('jar_C_small'), { pos: [X(bx + 0.85), 0, zB + 1.2], alto: 0.2 });
  ctx.sobre(fregadero, R.herr('journal_open'), { pos: [X(bx + 0.4), 0, zB + 1.4], escala: K * 0.42, rot: X(-0.2) });
  ctx.sobre(fregadero, R.herr('magnifying_glass'), { pos: [X(bx + 0.95), 0, zB + 1.5], escala: K * 0.45, ...tumbada(0.6) });
  await pantallaRepo(ctx, X(bx), 1.6, 2.25, ' cuaderno de experimentos');
  obst(bx - 1.3, zB, bx + 1.3, zB + 1.9);
  punto('consola', 'consola', bx + 1.85, 0, zB + 1.45, -1.2, { clip: 'Working_C' });
  // estantería estrecha de reactivos en la esquina
  const reactivos = P(R.casa('Shelf_1'), { pos: [X(-5.55), 0, zB + 0.55], alto: 2.9, propios: true });
  reactivos.then(gris);
  // baldas a 0,61 / 1,18 / 1,76 / 2,33 (Shelf_1 de 2,9 m): cada frasco, en la suya
  for (const [ruta, alto, y] of [[R.acc('potion_huge_orange'), 0.34, 1.0], [R.cocina('jar_A_large'), 0.36, 1.6], [R.acc('potion_large_red'), 0.3, 2.15], [R.cocina('jar_D_medium'), 0.3, 2.7]] as const)
    ctx.sobre(reactivos, ruta, { pos: [X(-5.55), 0, zB + 0.55], alto }, { desde: y });
  obst(-6, zB, -5.1, zB + 1.0);
  // ---- DERECHA: el puesto (de tres cuartos, con la bandeja de cultivo de prueba encima) y la bombona de gas
  const ix = 3.75;
  const pLab = new PantallaFosforo(384, 256, ctx.v.pantalla, ' pytest'); pLab.velocidad = 28;
  pantallaReal(ctx, pLab, 'cambios'); ctx.sala.pantallas.push(pLab);
  await puestoTrabajo(ctx, { x: X(ix), z: -0.75, giro: X(-0.8), tex: pLab.tex,
    encima: [{ ruta: R.base('space_farm_small'), x: -0.62, z: -0.15, c: { alto: 0.36 } }, { ruta: R.acc('potion_small_green'), x: 0.75, z: 0.0, c: { alto: 0.18 } }] });
  P(R.sv('PropaneTank'), { pos: [X(5.5), 0, zB + 0.6], alto: 1.35, propios: true }).then(gris);
  P(R.casa('Houseplant_7'), { pos: [X(5.4), 0, 0.95], alto: 0.85, rot: 0.6 });
  obst(5.05, zB, 6, zB + 1.05); obst(5.0, 0.6, 6, 1.35);
  cartelEnPared(g, cartel(['SANGRÍA:', 'CUATRO', 'ESPACIOS,', 'NI UNO MÁS'], 'LABORATORIO · WORK-SHELTER', '#dfe9d6', '#25472f', 'ojo', semilla + 5), X(5.25), 2.55, 0.56, 0.78, zB + 0.33, -0.02 * s);
  cartelEnPared(g, cartel(['IMPORT', 'THIS'], 'NORMA 20', '#e8e1c8', '#2f3b52', 'engranaje', semilla + 9), X(2.1), 2.6, 0.5, 0.62, zB + 0.33, 0.03 * s);
  // ---- suelo: caja de muestras y cubo delante, a un lado
  P(R.recurso('Containers_Crate_Small_Green'), { pos: [X(-5.35), 0, 0.85], escala: K * 0.7, rot: 0.4 });
  P(R.herr('bucket_metal'), { pos: [X(-4.85), 0, 1.15], escala: K * 0.5 });
  obst(-6, 0.4, -4.5, 1.45);
  mancha(g, X(0.2), 0.7, 1.3, semilla);
  const panel = new PanelSala(); panel.titulo = 'LABORATORIO'; panel.color = ctx.v.pantalla; ctx.panel = panel;
  ctx.sala.zonasPaseo = [tramo(-2.6, -1.6), tramo(-0.6, 0.4), tramo(2.2, 2.8)];
  ctx.vapor = { pos: new THREE.Vector3(X(tx), 2.3, tz), dir: new THREE.Vector3(0.1 * s, 1, 0.1) };
  ctx.lamparas = [{ x: X(bx + 1.45), z: 0.6, o: { intensidad: 50, corta: true, objetivo: [X(bx + 0.6), -0.9] } }, { x: X(tx), z: 0.9, o: { intensidad: 55, sombra: true, corta: true, objetivo: [X(tx), 0.2] } }, { x: X(ix), z: 0.4, o: { intensidad: 55, color: '#e6ffd8', objetivo: [X(ix), -0.6] } }];
  const ancla = { tipo: 'punto' as const, pos: new THREE.Vector3(X(tx), 1.2, tz + 0.4), intensidad: 3, color: new THREE.Color('#7dffc0'), distancia: 4.5, prioridad: 2 };
  ctx.sala.anclas.push(ancla);
  ctx.alActualizar((dt, t, a) => {
    riego = Math.max(0, riego - dt * 0.5);
    ancla.intensidad = 2.6 + a * 2.4 + riego * 2.5 + Math.sin(t * 1.3) * 0.3;
  });
}

// ======================================================================== ESTUDIO (web, Node)
export async function amueblarEstudio(ctx: Contexto) {
  const { g, zB, K, P, semilla } = ctx; const { s, X, obst, tramo, punto } = espejo(ctx);
  // ---- IZQUIERDA: muro de pantallas (estado del repo en la grande, último commit y cambios en las pequeñas)
  await pantallaRepo(ctx, X(-3.8), 1.75, 2.25, ' despliegue');
  const pCommit = new PantallaFosforo(384, 256, ctx.v.pantalla, ' último commit'); pCommit.velocidad = 40; pantallaReal(ctx, pCommit, 'commit'); ctx.sala.pantallas.push(pCommit);
  await monitorPared(ctx, X(-1.75), 2.72, 0.75, pCommit.tex, 1.15);
  const pCambios = new PantallaFosforo(384, 256, ctx.v.pantalla, ' git status'); pCambios.velocidad = 40; pantallaReal(ctx, pCambios, 'cambios'); ctx.sala.pantallas.push(pCambios);
  await monitorPared(ctx, X(-1.75), 2.02, 0.75, pCambios.tex, 1.15);
  // el puesto: mesa con dos monitores, de tres cuartos (se le ven las manos), bajo el muro de pantallas
  const pPuesto = new PantallaFosforo(384, 256, ctx.v.pantalla, ' npm run dev'); pPuesto.velocidad = 30;
  pantallaReal(ctx, pPuesto, 'actividad'); ctx.sala.pantallas.push(pPuesto);
  const puesto = await puestoTrabajo(ctx, { id: 'silla', x: X(-3.85), z: -0.7, giro: X(0.8), pantalla: 'doble', tex: pPuesto.tex, silla: R.mueble('chair_desk_B'),
    encima: [{ ruta: R.mueble('lamp_desk'), x: -0.8, z: -0.25, c: { escala: K * 0.55, rot: 0.6 } }, { ruta: R.mueble('mug_A'), x: 0.8, z: 0.15, c: { escala: K * 0.7 } }] });
  pantallaFrontal(puesto.monitores[1], pCambios.tex, { ancho: 0.84, alto: 0.66, cy: 0.6, dz: -0.02 }, 1.0);
  // ---- CENTRO: el rack de servidores (tres armarios con pilotos, cables gruesos al techo y la refrigeración encima)
  const rx = 0.9;
  const pilotos: ((t: number, a: number) => void)[] = [];
  for (const [i, dx] of [-0.72, 0, 0.72].entries()) {
    // cada armario lleva su pantalla de estado con datos reales del repo (lo que pasa, cambios, último commit)
    const armario = await colocar(g, R.sf('Props_Computer'), { pos: [X(rx + dx), 0, zB + 0.6], alto: 2.35, variante: ctx.v, estatico: false, propios: true });
    const pEst = new PantallaFosforo(256, 320, ctx.v.pantalla, [' servicio', ' cambios', ' commit'][i]); pEst.velocidad = 30;
    pantallaReal(ctx, pEst, (['actividad', 'cambios', 'commit'] as const)[i]); superponerPantalla(armario, /^Black$/, pEst.tex, { brillo: 1.0, margen: 0.9 }); ctx.sala.pantallas.push(pEst);
    tinte(armario, m => { if (!m.emissiveMap && m.name !== 'Black') { m.color.multiplyScalar(0.7); } });
    pilotos.push(montarPilotos(g, new THREE.Vector3(X(rx + dx), 0.9 + i * 0.12, zB + 1.02), ctx.v.pantalla));
    P(R.cy('Cable_Thick'), { pos: [X(rx + dx), ALTO, zB + 0.55], alto: ALTO - 2.35 + 0.05, ancla: 'techo', sombra: false });
  }
  P(R.cy('AC_Stacked'), { pos: [X(rx + 1.45), 0, zB + 0.55], alto: 1.25, rot: X(-0.2) });
  P(R.cy('Cable_Long'), { pos: [X(rx - 1.0), 0.02, zB + 1.2], alto: 0.12, rot: X(0.6), sombra: false });
  obst(rx - 1.2, zB, rx + 1.9, zB + 1.3);
  punto('consola', 'consola', rx + 0.0, 0, zB + 1.75, Math.PI + 0.35, { clip: 'Working_A' });
  // la pieza: el rack. Se aprieta una conexión con la llave (los pilotos se disparan), se le da a un armario o se lee
  // de cerca su pantalla
  let rafaga = 0; const disparar = () => { rafaga = 1.2; };
  punto('rack', 'pieza', rx - 0.7, 0, zB + 1.7, Math.PI + 0.15, { acciones: [{ clip: 'Working_C', utensilio: 'llave', alHacer: disparar }, { clip: 'Interact', alHacer: disparar }, { clip: 'Holding_A', utensilio: 'lupa', dur: 4 }] });
  punto('rack-2', 'pieza', rx + 0.75, 0, zB + 1.7, Math.PI - 0.15, { acciones: [{ clip: 'Interact', alHacer: disparar }, { clip: 'Use_Item', alHacer: disparar }] });
  // carrito con la consola portátil, a un lado del rack (no delante)
  const carrito = P(R.mueble('table_small'), { pos: [X(rx - 2.0), 0, 0.3], escala: K * 0.7 });
  ctx.sobre(carrito, R.mueble('gameconsole_handheld'), { pos: [X(rx - 2.05), 0, 0.3], escala: K * 0.7, rot: 0.4 });
  ctx.sobre(carrito, R.mueble('mug_A'), { pos: [X(rx - 1.8), 0, 0.42], escala: K * 0.7 });
  obst(rx - 2.35, -0.05, rx - 1.65, 0.65);
  // ---- DERECHA: rincón de descanso con sofá de cara a cámara, estantería alta y planta
  P(R.mueble('couch_pillows'), { pos: [X(4.45), 0, zB + 0.95], escala: K * 0.85, rot: X(-0.12), propios: true }).then(o => tinte(o, m => m.color.multiplyScalar(0.62)));   // tapizado apagado: quemaba bajo la lámpara
  punto('sofa', 'aficion', 4.1, 0.05, zB + 1.25, -0.12, { clip: 'Sit_Chair_Idle', utensilio: 'taza' });
  P(R.mueble('table_low_decorated'), { pos: [X(4.3), 0, zB + 2.0], escala: K * 0.7 });
  const estante = P(R.casa('Shelf_2'), { pos: [X(5.6), 0, zB + 0.5], alto: 3.1 });
  // Shelf_2 de 3,1 m: baldas a 0,90 / 1,34 / 1,78 / 2,22 / 2,66; cada cosa, apoyada en la suya
  for (const [k, y] of [1.2, 1.65, 2.1, 2.55].entries()) ctx.sobre(estante, R.mueble(k === 2 ? 'cup_pencils' : 'book_set'), { pos: [X(5.6), 0, zB + 0.5], escala: K * (k === 2 ? 0.55 : 0.45), rot: k * 0.5 }, { desde: y });
  ctx.sobre(estante, R.recurso('Containers_Box_Small'), { pos: [X(5.6), 0, zB + 0.5], escala: K * 0.5, rot: 0.3 }, { desde: 0.85 });
  P(R.casa('Houseplant_5'), { pos: [X(3.05), 0, zB + 0.4], alto: 0.95 });
  obst(2.7, zB, 6, zB + 2.4);
  cartelEnPared(g, cartel(['LOS VIERNES', 'NO SE', 'DESPLIEGA'], 'ESTUDIO · WORK-SHELTER', '#e9e2cc', '#8a2b1c', 'rayo', semilla + 11), X(4.35), 2.55, 0.56, 0.74, zB + 0.33, -0.02 * s);
  P(R.sf('Details_Vent_3'), { pos: [X(rx), 3.55, zB + 0.45], ancho: 1.6, sombra: false });
  mancha(g, X(-1.0), 0.9, 1.0, semilla);
  const panel = new PanelSala(); panel.titulo = 'ESTUDIO'; panel.color = ctx.v.pantalla; ctx.panel = panel;
  ctx.sala.zonasPaseo = [tramo(-0.6, 0.0), tramo(2.4, 3.2)];
  ctx.vapor = { pos: new THREE.Vector3(X(rx + 1.45), 1.3, zB + 0.6), dir: new THREE.Vector3(0.2 * s, 1, 0.2) };
  ctx.lamparas = [{ x: X(-3.95), z: 0.6, o: { intensidad: 60, corta: true, objetivo: [X(-3.6), 0.2] } }, { x: X(rx), z: 0.7, o: { intensidad: 55, sombra: true, objetivo: [X(rx), 0.0] } }, { x: X(4.3), z: 0.5, o: { intensidad: 45, objetivo: [X(4.3), -0.6] } }];
  ctx.alActualizar((dt, t, a) => { rafaga = Math.max(0, rafaga - dt); for (const p of pilotos) p(t, Math.min(1, a + rafaga)); });
}

// ======================================================================== ARCHIVO (carpeta sin git, sin tipo, o ala con varios repos)
export async function amueblarArchivo(ctx: Contexto) {
  const { g, zB, K, P, semilla } = ctx; const { s, X, obst, tramo, punto } = espejo(ctx);
  await bandaAlta(ctx, { reloj: X(-1.85), valvulas: [X(4.6)], tramos: [[X(4.2), 3.0]] });
  // ---- CENTRO: estantería alta del archivo, llena de cajas (cada una, en su balda)
  const ex = 0.6;
  const archivo = P(R.sf('Props_Shelf_Tall'), { pos: [X(ex), 0, zB + 0.75], alto: 3.3 });
  const cajas = ['Containers_Box_Medium', 'Containers_Box_Small', 'Containers_Crate_Medium_Tan', 'Containers_Box_Large', 'Containers_Box_Small', 'Containers_Box_Medium'];
  const rr = (k: number) => ((semilla * 31 + k * 17) % 100) / 100;
  // Props_Shelf_Tall de 3,3 m: baldas a 0,43 / 1,08 / 1,73 / 2,38 (0,65 entre baldas: las cajas, de 0,45 como mucho)
  for (const [n, y] of [0.9, 1.55, 2.2, 2.85].entries()) for (let k = 0; k < 3; k++) {
    if ((n * 3 + k + semilla) % 5 === 4) continue;   // algún hueco: un archivo de verdad no está lleno
    const c = cajas[(n * 3 + k + semilla) % cajas.length];
    ctx.sobre(archivo, R.recurso(c), { pos: [X(ex - 0.62 + k * 0.62 + (rr(n * 3 + k) - 0.5) * 0.06), 0, zB + 0.75], ancho: c === 'Containers_Box_Small' ? 0.34 : 0.5, rot: (rr(k + n) - 0.5) * 0.25 }, { desde: y });
  }
  obst(ex - 1.2, zB, ex + 1.2, zB + 1.25);
  // la pieza: la estantería. Se baja una caja, se repasa el inventario en el diario o se busca con la lupa
  punto('estanteria', 'pieza', ex - 0.55, 0, zB + 1.6, Math.PI + 0.1, { acciones: [{ clip: 'PickUp' }, { clip: 'Holding_A', utensilio: 'diario', dur: 4 }, { clip: 'Interact' }] });
  punto('estanteria-2', 'pieza', ex + 0.6, 0, zB + 1.6, Math.PI - 0.1, { acciones: [{ clip: 'Holding_B', utensilio: 'lupa', dur: 4 }, { clip: 'PickUp' }] });
  // ---- IZQUIERDA: el fichero (cajonera ancha) con la terminal del archivero encima (estado de la carpeta) y, delante,
  // su puesto, de tres cuartos
  const fx = -3.95;
  P(R.casa('Drawer_5'), { pos: [X(fx), 0, zB + 0.62], ancho: 2.5 });
  await pantallaRepo(ctx, X(fx), 1.2, 2.0, ' inventario');
  obst(fx - 1.3, zB, fx + 1.3, zB + 1.25);
  const pArch = new PantallaFosforo(384, 256, ctx.v.pantalla, ' ls -la'); pArch.velocidad = 26;
  pantallaReal(ctx, pArch, 'commit'); ctx.sala.pantallas.push(pArch);
  await puestoTrabajo(ctx, { x: X(-3.55), z: 0.15, giro: X(0.8), tex: pArch.tex, silla: R.mueble('chair_desk_B'),
    encima: [{ ruta: R.mueble('lamp_table'), x: -0.75, z: -0.2, c: { escala: K * 0.45 } }, { ruta: R.herr('map'), x: 0.62, z: 0.1, c: { escala: K * 0.35, rot: 0.2 } }] });
  punto('consola', 'consola', fx + 2.2, 0, zB + 1.6, -1.6, { clip: 'Working_A' });
  const libros = P(R.casa('Shelf_1'), { pos: [X(-5.6), 0, zB + 0.5], alto: 3.0 });
  // Shelf_1 de 3 m: baldas a 0,05 / 0,63 / 1,22 / 1,82 / 2,41
  for (const [k, y] of [0.5, 1.1, 1.7, 2.3, 2.9].entries()) ctx.sobre(libros, R.mueble(k % 2 ? 'book_set' : 'book_single'), { pos: [X(-5.6), 0, zB + 0.5], escala: K * (k % 2 ? 0.45 : 0.6), rot: k * 0.4 }, { desde: y });
  obst(-6, zB, -5.1, zB + 1.0);
  // ---- DERECHA: palé con cajas apiladas (cada una sobre la de debajo), montón de bultos, baúl y la mesa de consulta
  const pale = P(R.recurso('Pallet_Wood'), { pos: [X(3.15), 0, zB + 0.85], escala: K * 0.7 });
  const c1 = ctx.sobre(pale, R.recurso('Containers_Box_Large'), { pos: [X(2.95), 0, zB + 0.8], escala: K * 0.7, rot: 0.2 });
  ctx.sobre(c1, R.recurso('Containers_Box_Medium'), { pos: [X(2.95), 0, zB + 0.8], escala: K * 0.6, rot: -0.15 });
  ctx.sobre(pale, R.recurso('Containers_Box_Medium'), { pos: [X(3.5), 0, zB + 1.2], escala: K * 0.55, rot: 0.5 });
  P(R.recurso('Containers_Pile_Large'), { pos: [X(5.0), 0, zB + 0.7], alto: 1.45, rot: X(-0.12) });
  P(R.herr('rope_bundle_A'), { pos: [X(2.45), 0, zB + 1.6], escala: K * 0.55 });
  obst(2.3, zB, 6, zB + 1.75);
  // mesa de consulta, a la derecha y por delante: mapa, lupa y flexo; la silla de lado (lectura de perfil)
  const mx = 4.45, mz = 0.55;
  const consulta = P(R.mueble('table_medium'), { pos: [X(mx), 0, mz], escala: K * 0.6 });
  ctx.sobre(consulta, R.herr('map'), { pos: [X(mx + 0.05), 0, mz + 0.05], escala: K * 0.38, rot: 0.15 });
  ctx.sobre(consulta, R.herr('magnifying_glass'), { pos: [X(mx + 0.3), 0, mz + 0.22], escala: K * 0.42, ...tumbada(-0.5) });
  ctx.sobre(consulta, R.mueble('lamp_table'), { pos: [X(mx - 0.32), 0, mz - 0.3], escala: K * 0.45 });
  ctx.sobre(consulta, R.herr('journal_closed'), { pos: [X(mx + 0.32), 0, mz - 0.28], escala: K * 0.42, rot: 0.3 });
  P(R.mueble('chair_A_wood'), { pos: [X(mx - 0.85), 0, mz], escala: K, rot: X(Math.PI / 2) });
  obst(mx - 0.5, mz - 0.5, mx + 0.5, mz + 0.5);
  punto('lectura', 'aficion', mx - 0.85, 0, mz, Math.PI / 2, { clip: 'Sit_Chair_Idle', utensilio: 'diario' });
  const baul = P(R.sf('Props_Chest'), { pos: [X(5.45), 0, 1.15], alto: 0.55, rot: X(-0.9) });
  ctx.sobre(baul, R.herr('lantern'), { pos: [X(5.45), 0, 1.15], escala: K * 0.45 });
  obst(5.0, 0.75, 6, 1.55);
  cartelEnPared(g, cartel(['NADA SE', 'TIRA.', 'TODO SE', 'ARCHIVA.'], 'ARCHIVO · WORK-SHELTER', '#e2d8bf', '#4a3622', 'ojo', semilla + 13), X(4.95), 2.6, 0.56, 0.78, zB + 0.33, 0.02 * s);
  const caja1 = P(R.sf('Props_Crate'), { pos: [X(-5.45), 0, 1.25], alto: 0.55, rot: 0.5 });
  ctx.sobre(caja1, R.recurso('Containers_Box_Small'), { pos: [X(-5.45), 0, 1.25], escala: K * 0.5, rot: 0.9 });
  obst(-6, 0.9, -5.0, 1.6);
  mancha(g, X(1.0), 0.9, 1.2, semilla);
  const panel = new PanelSala(); panel.titulo = 'ARCHIVO'; panel.color = ctx.v.pantalla; ctx.panel = panel;
  ctx.sala.zonasPaseo = [tramo(-1.6, -0.6), tramo(1.9, 2.6)];
  ctx.vapor = { pos: new THREE.Vector3(X(4.6), 3.1, zB + 0.8), dir: new THREE.Vector3(-0.2 * s, 0.9, 0.3) };
  ctx.lamparas = [{ x: X(fx), z: 0.8, o: { intensidad: 55, corta: true, objetivo: [X(fx + 0.3), 0.0] } }, { x: X(ex), z: 0.6, o: { intensidad: 80, sombra: true, objetivo: [X(ex), -0.6] } }, { x: X(mx), z: 0.6, o: { intensidad: 55, objetivo: [X(mx), 0.2] } }];
}
