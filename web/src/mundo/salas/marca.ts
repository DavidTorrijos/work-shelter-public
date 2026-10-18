// Sala de repositorio «archivo de marca» (estilo marca): muro de muestras de color y logotipos, mesa de dibujo
// con planos, estanterías de catálogos y botes de pintura. Aquí manda el manual de marca.
import * as THREE from 'three';
import { colocar, R } from '../../motor/assets';
import { cartel, PantallaFosforo, PanelSala, muestrasMarca } from '../../motor/texturas';
import { superponerPantalla, pantallaFrontal } from '../util3d';
import { cartelEnPared, mancha, bandaAlta, type Contexto, pantallaReal, puestoTrabajo, aPared } from './comun';

export async function amueblarArchivoMarca(ctx: Contexto) {
  const { g, v, zB, K, P, semilla } = ctx;
  await bandaAlta(ctx, { reloj: -3.62, valvulas: [3.4], tramos: [[-4.6, 2.6], [3.8, 3.8]] });   // el tablero, despejado; el reloj, entre la librería y el muro
  // pieza protagonista: el muro de muestras, retroiluminado como una mesa de luz
  const tex = muestrasMarca();
  const muro = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshStandardMaterial({ map: tex, color: '#a8a296', emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.08, roughness: 0.85 }));
  muro.position.set(-0.6, 2.35, zB + 0.33); g.add(muro);
  for (const [x, y, w, h] of [[-0.6, 3.55, 4.9, 0.12], [-0.6, 1.15, 4.9, 0.12], [-3.0, 2.35, 0.12, 2.5], [1.8, 2.35, 0.12, 2.5]] as const) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.6, metalness: 0.3 })); b.position.set(x, y, zB + 0.36); g.add(b); }
  // mesa de dibujo (caballete con planos) delante del muro, a la izquierda
  const dibujo = P(R.mueble('table_medium'), { pos: [-3.9, 0, zB + 1.4], escala: K * 0.85, rot: 0.2 });
  ctx.sobre(dibujo, R.herr('blueprint_stacked'), { pos: [-3.9, 0, zB + 1.4], escala: K * 0.55, rot: 0.25 });
  ctx.sobre(dibujo, R.herr('drafting_compass'), { pos: [-3.45, 0, zB + 1.7], escala: K * 0.5, rot: 1.1 });
  ctx.sobre(dibujo, R.mueble('lamp_desk'), { pos: [-4.35, 0, zB + 1.0], escala: K * 0.7, rot: 1.2 });
  P(R.mueble('chair_stool_wood'), { pos: [-3.0, 0, zB + 1.9], escala: K });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(-4.8, zB + 0.6), new THREE.Vector2(-3.1, zB + 2.2)));
  ctx.sala.puntos.push({ id: 'consola', tipo: 'consola', pos: new THREE.Vector3(-3.2, 0, zB + 2.35), giro: Math.PI + 0.6, clip: 'Working_B' });
  // estanterías de catálogos de color (libros) y botes de pintura
  const libreria = P(R.casa('Bookshelf'), { pos: [-5.35, 0, zB + 0.42], alto: 3.4 });
  for (const y of [1.2, 1.7, 2.2]) ctx.sobre(libreria, R.mueble('book_set'), { pos: [-5.35, 0, zB + 0.45], escala: K * 1.0 }, { desde: y });
  const latas = ['Can_Red', 'Can_Open', 'Can_Closed', 'Can_Red', 'Can_Broken'];
  latas.forEach((l, i) => P(R.sv(l), { pos: [2.4 + i * 0.32, 0, zB + 0.45 + (i % 2) * 0.18], alto: 0.42, rot: i }));
  // derecha: el puesto del habitante, de tres cuartos (el monitor muestra la guía de estilo), cajonera y planta
  const pGuia = new PantallaFosforo(384, 256, v.pantalla, ' tokens.css'); pGuia.velocidad = 26;
  pantallaReal(ctx, pGuia, 'commit'); ctx.sala.pantallas.push(pGuia);
  await puestoTrabajo(ctx, { id: 'silla', x: 4.25, z: -0.8, giro: -0.8, silla: R.mueble('chair_desk_B'), tex: pGuia.tex,
    encima: [{ ruta: R.herr('pencil_A_long'), x: 0.55, z: 0.25, c: { escala: K * 0.7, rot: 0.6 } }, { ruta: R.mueble('pictureframe_standing_B'), x: -0.7, z: -0.25, c: { escala: K * 0.7, rot: 0.3 } }, { ruta: R.mueble('mug_B'), x: 0.75, z: -0.1, c: { escala: K * 0.7 } }] });
  P(R.mueble('cabinet_medium_decorated'), { pos: [5.3, 0, zB + 0.5], escala: K * 0.75, rot: -Math.PI / 2 });
  P(R.casa('Houseplant_8'), { pos: [2.1, 0, zB + 1.9], alto: 0.9 });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(2.2, zB), new THREE.Vector2(3.9, zB + 0.75)), new THREE.Box2(new THREE.Vector2(4.9, zB), new THREE.Vector2(6, zB + 1.3)));
  // panel de estado y cartel de humor
  const panel = new PanelSala(); panel.titulo = 'MANUAL DE MARCA'; panel.color = v.pantalla;
  const marcoPanel = aPared(g, await colocar(g, R.cy('Sign_2'), { pos: [4.3, 2.75, zB + 0.6], ancho: 1.55, estatico: false, propios: true }));
  superponerPantalla(marcoPanel, /^Texture_Signs$/, panel.tex, { brillo: 1.2, margen: 0.94 });
  ctx.panel = panel;
  cartelEnPared(g, cartel(['EL LOGO', 'NO SE', 'ESTIRA'], 'COMITÉ DE MARCA · WORK-SHELTER', '#e9dfc9', '#b8402e', 'mano', semilla), 2.55, 2.4, 0.56, 0.78, zB + 0.33, 0.04);
  P(R.recurso('Containers_Box_Medium'), { pos: [-1.2, 0, 1.75], escala: K * 0.8, rot: 0.3 });
  mancha(g, -2.0, 0.3, 1.2, semilla + 7);
  // en el centro, la mesa de muestras: libro de marca abierto, muestras de color y un marco con el logotipo
  const muestras = P(R.mueble('table_medium'), { pos: [-0.6, 0, 0.0], escala: K * 0.75 });
  ctx.sobre(muestras, R.mueble('book_set'), { pos: [-0.95, 0, 0.05], escala: K * 0.65, rot: 0.3 });
  ctx.sobre(muestras, R.mueble('pictureframe_standing_A'), { pos: [-0.25, 0, -0.15], escala: K * 0.75, rot: -0.3 });
  ctx.sobre(muestras, R.herr('map_empty'), { pos: [-0.45, 0, 0.3], escala: K * 0.4, rot: 0.15 });
  ctx.sobre(muestras, R.herr('magnifying_glass'), { pos: [-0.1, 0, 0.3], escala: K * 0.45, rotX: -Math.PI / 2, rot: 0.6 });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(-1.25, -0.65), new THREE.Vector2(0.05, 0.65)));
  // la pieza: el muro de muestras y su mesa. Se coge una muestra, se compara con la lupa contra el muro (que se enciende
  // como una mesa de luz) o se señala en el muro
  let luz = 0; const encender = () => { luz = 1; };
  ctx.sala.puntos.push({ id: 'muestras', tipo: 'pieza', pos: new THREE.Vector3(0.45, 0, 0.0), giro: -Math.PI / 2,
    acciones: [{ clip: 'PickUp' }, { clip: 'Holding_A', utensilio: 'lupa', dur: 4, alHacer: encender }, { clip: 'Interact', alHacer: encender }] });
  ctx.sala.puntos.push({ id: 'muro', tipo: 'pieza', pos: new THREE.Vector3(-1.75, 0, -1.2), giro: Math.PI - 0.15,
    acciones: [{ clip: 'Interact', alHacer: encender }, { clip: 'Use_Item' }] });
  ctx.sala.zonasPaseo = [[-2.2, -1.6], [0.6, 1.2]];
  ctx.vapor = { pos: new THREE.Vector3(3.4, 3.15, zB + 0.85), dir: new THREE.Vector3(-0.3, 0.9, 0.3) };
  ctx.chispas = new THREE.Vector3(3.6, 1.2, zB + 1.0);
  ctx.lamparas = [{ x: -3.8, z: 0.5, o: { intensidad: 85 } }, { x: -0.6, z: 0.4, o: { intensidad: 90, sombra: true, corta: true, objetivo: [-0.6, -1.4] } }, { x: 4.0, z: 0.5, o: { intensidad: 80 } }];
  ctx.alActualizar((dt, t, a) => {
    luz = Math.max(0, luz - dt * 0.7);
    (muro.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.07 + a * 0.08 + luz * 0.3 + Math.sin(t * 0.8) * 0.01;
    if (ctx.sala.estado === 'trabajando' && Math.random() < dt * (0.12 + a)) panel.lineas.push('> ' + ['logo.svg optimizado', 'paleta exportada', 'tipografías ok', 'revisión de contraste'][Math.floor(Math.random() * 4)]);
  });
}
