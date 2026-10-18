// Sala de repositorio «escaparate» (estilo landing): el muro de pantallas muestra la landing que se trabaja,
// con focos de exposición, un expositor giratorio y el sofá de «pruebas de usuario».
import * as THREE from 'three';
import { colocar, R } from '../../motor/assets';
import { cartel, PantallaFosforo, PanelSala, maquetaLanding } from '../../motor/texturas';
import { lienzo, texturaDe, FUENTES } from '../../motor/texturas';
import { superponerPantalla, pantallaFrontal } from '../util3d';
import { cartelEnPared, mancha, bandaAlta, monitorPared, pantallaReal, puestoTrabajo, superficie, aPared, type Contexto } from './comun';

export async function amueblarEscaparate(ctx: Contexto) {
  const { g, v, zB, K, P, semilla } = ctx;
  // el amarillo de las paredes del escaparate, en ocre apagado: a plena luz era lo que subía la sala por encima de 70
  { const copias = new Map<THREE.Material, THREE.Material>();
    g.traverse((n: any) => { if (!n.isMesh || Array.isArray(n.material) || !/^(Accent|Orange|Main|Main2)$/.test(n.material.name)) return;
      if (!copias.has(n.material)) { const m = n.material.clone(); m.color.multiplyScalar(/^(Main|Main2)$/.test(n.material.name) ? 0.8 : 0.62); copias.set(n.material, m); }
      n.material = copias.get(n.material)!; }); }
  await bandaAlta(ctx, { reloj: 4.9, valvulas: [-4.2], tramos: [[-4.8, 2.4], [4.9, 2.2]] });   // ninguna tubería por delante de los monitores
  // muro de pantallas: la landing en tres versiones (A/B/C)
  const pantallas = [maquetaLanding('PURIFICADOR 3000', 0), maquetaLanding('PURIFICADOR 3000', 2), maquetaLanding('PURIFICADOR 3000', 2)];
  const mons: THREE.Object3D[] = [];
  for (const [i, x] of [-1.9, 0, 1.9].entries()) mons.push(await monitorPared(ctx, x, 2.15 + (i === 1 ? 0.1 : 0), i === 1 ? 1.55 : 1.25, pantallas[i], i === 1 ? 0.55 : 0.42));   // pantallas claras: brillo contenido (la sala no quema)
  // marcos de grafito (el plástico blanco del pack, bajo los focos, era lo que más quemaba de la sala)
  for (const m of mons) m.traverse((n: any) => { if (n.isMesh && !n.material.emissiveMap) { n.material = n.material.clone(); n.material.color.multiplyScalar(0.38); } });
  // rótulo luminoso de la marca sobre el muro de pantallas: es un escaparate
  const { c: cl, g: gl } = lienzo(768, 160);
  gl.fillStyle = '#120d06'; gl.fillRect(0, 0, 768, 160); gl.strokeStyle = '#d1a43a'; gl.lineWidth = 6; gl.strokeRect(6, 6, 756, 148);
  gl.fillStyle = '#ffd36a'; gl.shadowColor = '#ffb000'; gl.shadowBlur = 26; gl.font = `900 96px ${FUENTES.titulo}`; gl.textAlign = 'center'; gl.textBaseline = 'middle'; gl.fillText('PURIFICADOR', 384, 86, 720); gl.shadowBlur = 0;
  const texLogo = texturaDe(cl);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.52), new THREE.MeshStandardMaterial({ map: texLogo, emissiveMap: texLogo, emissive: '#ffffff', emissiveIntensity: 0.9, color: '#000' }));
  logo.position.set(0, 3.93, zB + 0.9); logo.renderOrder = 2; g.add(logo);   // con aire sobre el monitor central
  ctx.alActualizar((dt, t) => { (logo.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.85 + (Math.sin(t * 23) > 0.97 ? -0.4 : 0) + Math.sin(t * 2) * 0.05; });
  // tarima de exposición con el tótem de producto: columna del pack con la landing en pantalla, cajas de producto
  // a sus pies y dos focos de pie bajos que la apuntan (por debajo de los monitores, sin cruzarse con ellos)
  const tarima = await colocar(g, R.sf('Props_Base'), { pos: [0, 0, zB + 1.3], ancho: 1.75 });
  const yT = superficie(tarima, g, 0, zB + 1.3) ?? 0.29;   // tablero de la tarima, medido
  const totem = await colocar(g, R.sf('Props_Computer'), { pos: [0, yT, zB + 1.3], alto: 2.0, estatico: false, propios: true, variante: v });
  // la pantalla del tótem es vertical: la landing en versión móvil (cabecera, titular, botón, imagen y bloques)
  const { c: cTot, g: gTot } = lienzo(200, 560);
  { const G = gTot; G.fillStyle = '#f6d77a'; G.fillRect(0, 0, 200, 560); G.fillStyle = '#2a1c08';
    G.fillRect(14, 16, 46, 10); for (let i = 0; i < 3; i++) G.fillRect(150, 14 + i * 6, 34, 3);
    G.font = `900 40px ${FUENTES.titulo}`; G.fillText('AIRE', 14, 88); G.fillText('LIMPIO', 14, 128);
    G.font = `500 13px ${FUENTES.mono}`; G.globalAlpha = 0.75; G.fillText('Respira hondo:', 14, 152); G.fillText('el filtro trabaja.', 14, 168); G.globalAlpha = 1;
    G.fillStyle = '#2a1c08'; G.fillRect(14, 184, 120, 30); G.fillStyle = '#f6d77a'; G.font = `700 13px ${FUENTES.mono}`; G.fillText('Resérvalo', 22, 204);
    G.fillStyle = '#2a1c08'; G.beginPath(); G.arc(100, 300, 62, 0, 7); G.fill(); G.fillStyle = '#e2602b'; G.beginPath(); G.arc(124, 278, 20, 0, 7); G.fill();
    G.globalAlpha = 0.14; for (let i = 0; i < 3; i++) G.fillRect(14, 388 + i * 56, 172, 46); G.globalAlpha = 1;
    G.fillStyle = '#2a1c08'; G.font = `700 12px ${FUENTES.mono}`; ['Filtros', 'Modelos', 'Precios'].forEach((t, i) => G.fillText(t, 24, 416 + i * 56)); }
  const pTotem = texturaDe(cTot);
  const plTotem = superponerPantalla(totem, /^Black$/, pTotem, { brillo: 0.6, margen: 0.94 });
  const matsTotem = plTotem ? [plTotem.material as THREE.MeshStandardMaterial] : [];
  for (const x of [-0.6, 0.6]) ctx.sobre(tarima, R.cy('Light_Square'), { pos: [x, 0, zB + 1.25], alto: 0.5, rot: 0.785 });   // balizas de vitrina
  ctx.sobre(tarima, R.recurso('Containers_Box_Small'), { pos: [0.38, 0, zB + 1.78], alto: 0.22, rot: 0.35 });
  ctx.sobre(tarima, R.recurso('Containers_Box_Small'), { pos: [-0.36, 0, zB + 1.8], alto: 0.18, rot: -0.5 });
  P(R.casa('Light_Stand1'), { pos: [-1.3, 0, zB + 1.55], alto: 1.5, rot: 0.9 });
  P(R.casa('Light_Stand1'), { pos: [1.3, 0, zB + 1.55], alto: 1.5, rot: -0.9 });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(-1.6, zB), new THREE.Vector2(1.6, zB + 2.2)));
  // la pieza: el tótem. Se toca su pantalla (cambia de versión con un destello), se repasan las notas de diseño o se le
  // da al mando del costado
  let destello = 0;
  const tocar = () => { destello = 1; };
  const haciaTotem = (x: number, z: number) => Math.atan2(0 - x, zB + 1.3 - z);
  ctx.sala.puntos.push({ id: 'totem', tipo: 'pieza', pos: new THREE.Vector3(0.62, 0, zB + 2.4), giro: haciaTotem(0.62, zB + 2.4),
    acciones: [{ clip: 'Interact', alHacer: tocar }, { clip: 'Holding_A', utensilio: 'diario', dur: 4 }, { clip: 'Use_Item', alHacer: tocar }] });
  ctx.sala.puntos.push({ id: 'totem-2', tipo: 'pieza', pos: new THREE.Vector3(-0.62, 0, zB + 2.4), giro: haciaTotem(-0.62, zB + 2.4),
    acciones: [{ clip: 'Interact', alHacer: tocar }, { clip: 'Waving' }] });
  // puesto de diseño a la izquierda, de tres cuartos: mesa, monitor con los cambios, teclado, lápices y un cactus
  const pDiseno = new PantallaFosforo(384, 256, v.pantalla); pDiseno.velocidad = 30;
  pantallaReal(ctx, pDiseno, 'cambios'); ctx.sala.pantallas.push(pDiseno);
  await puestoTrabajo(ctx, { id: 'silla', x: -4.0, z: -0.75, giro: 0.8, tex: pDiseno.tex,
    encima: [{ ruta: R.mueble('cup_pencils'), x: 0.72, z: -0.22, c: { escala: K * 0.6 } }, { ruta: R.mueble('cactus_small_A'), x: -0.72, z: -0.2, c: { escala: K * 0.7 } }, { ruta: R.mueble('mug_A'), x: -0.6, z: 0.24, c: { escala: K * 0.7, rot: 0.5 } }] });
  P(R.casa('Houseplant_6'), { pos: [-5.5, 0, zB + 0.6], alto: 1.1 });
  P(R.mueble('shelf_B_large_decorated'), { pos: [-4.6, 2.2, zB + 0.35], escala: K }).then(o => aPared(g, o));
  // derecha: sofá de pruebas de usuario frente a una pantalla, con mesa baja y cartel
  P(R.mueble('couch_pillows'), { pos: [4.3, 0, zB + 0.95], escala: K, rot: -0.15, propios: true }).then(o => o.traverse((n: any) => { if (n.isMesh) n.material.color.multiplyScalar(0.72); }));   // mostaza apagada
  P(R.mueble('table_low_decorated'), { pos: [4.0, 0, 0.45], escala: K * 0.8, rot: -0.15 });
  P(R.mueble('lamp_standing'), { pos: [5.6, 0, zB + 0.6], escala: K });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(2.9, zB), new THREE.Vector2(6, zB + 1.9)), new THREE.Box2(new THREE.Vector2(3.2, 0.0), new THREE.Vector2(4.8, 0.95)));
  ctx.sala.puntos.push({ id: 'sofa', tipo: 'silla', pos: new THREE.Vector3(4.0, 0.05, zB + 1.25), giro: -0.15, clip: 'Sit_Chair_Idle' });
  cartelEnPared(g, cartel(['SI NO', 'CONVIERTE,', 'NO EXISTE'], 'DEPARTAMENTO DE CRECIMIENTO · WORK-SHELTER', '#f0d98a', '#2a1c08', 'rayo', semilla), 3.2, 2.6, 0.6, 0.84, zB + 0.33, -0.03);
  // consola de despliegue: se usa de pie
  const consola = await colocar(g, R.sf('Props_ComputerSmall'), { pos: [2.55, 0, zB + 0.55], alto: 1.5, rot: -0.3, estatico: false });
  const pDeploy = new PantallaFosforo(256, 256, v.pantalla, ' despliegue'); pDeploy.velocidad = 22;
  pantallaReal(ctx, pDeploy, 'actividad');
  superponerPantalla(consola, /^Black$/, pDeploy.tex, { brillo: 1.2, margen: 0.9 });
  ctx.sala.pantallas.push(pDeploy);
  ctx.sala.puntos.push({ id: 'consola', tipo: 'consola', pos: new THREE.Vector3(2.0, 0, zB + 1.4), giro: 0.5, clip: 'Working_A' });
  // panel de estado de la sala (encima del sofá)
  const panel = new PanelSala(); panel.titulo = 'ESCAPARATE'; panel.color = v.pantalla;
  const marcoPanel = aPared(g, await colocar(g, R.cy('Sign_2'), { pos: [4.5, 3.25, zB + 0.6], ancho: 1.55, estatico: false, propios: true }));
  superponerPantalla(marcoPanel, /^Texture_Signs$/, panel.tex, { brillo: 1.2, margen: 0.94 });
  ctx.panel = panel;
  // detalle de suelo y primer plano
  P(R.recurso('Containers_Box_Small'), { pos: [-5.5, 0, 1.6], escala: K * 0.9, rot: 0.4 });
  P(R.sv('Can_Red'), { pos: [5.7, 0, 1.75], alto: 0.35 });
  mancha(g, 1.2, 0.6, 1.0, semilla + 3);
  ctx.sala.zonasPaseo = [[-3.3, -2.7], [2.7, 3.3]];   // a los lados: el tótem del centro queda a la vista
  ctx.vapor = { pos: new THREE.Vector3(-4.2, 3.15, zB + 0.85), dir: new THREE.Vector3(0.3, 0.9, 0.3) };
  ctx.chispas = new THREE.Vector3(2.55, 1.4, zB + 0.9);
  // la lámpara central cuelga a un lado del rótulo: no se cruza con las letras
  ctx.lamparas = [{ x: -3.8, z: 0.4, o: { intensidad: 80 } }, { x: 1.65, z: 0.8, o: { intensidad: 110, sombra: true, corta: true, objetivo: [0, -0.9] } }, { x: 3.9, z: 0.5, o: { intensidad: 75 } }];
  let giro = 0, cambio = 0;
  ctx.alActualizar((dt, t, a) => {
    giro += dt * (0.35 + a * 1.2); totem.rotation.y = Math.sin(giro * 0.5) * 0.22;   // el tótem oscila hacia uno y otro lado del escaparate
    destello = Math.max(0, destello - dt * 1.5);
    for (const m of matsTotem) m.emissiveIntensity = 0.6 + destello * 1.4;
    cambio += dt; if (cambio > 6) { cambio = 0; mons.push(mons.shift()!); }
    if (ctx.sala.estado === 'trabajando' && Math.random() < dt * (0.12 + a)) panel.lineas.push('> ' + ['lighthouse: 98', 'test A/B: +3 %', 'hero.tsx guardado', 'preview desplegada'][Math.floor(Math.random() * 4)]);
  });
}
