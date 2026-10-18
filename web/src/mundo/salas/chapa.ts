// Chapa y Pintura, en la planta de ocio: la barbería y ropería del refugio. A la izquierda, la barbería: el sillón
// giratorio frente al espejo y el lavacabezas, el poste de barbero girando y Fito con las tijeras. A la derecha, la
// ropería: un escaparate de maniquíes vestidos con piezas del probador (cambian de modelito cada poco), la sombrerera con
// sombreros de verdad del catálogo y la cabina de prueba con su cortina. Sentarse en el sillón abre el probador.
import * as THREE from 'three';
import { colocar, R } from '../../motor/assets';
import { cartel, lienzo, texturaDe, PantallaFosforo } from '../../motor/texturas';
import { cartelEnPared, mancha, caja, materialAcero, puestoTrabajo, tumbada, aPared, superficie, type Contexto } from './comun';
import { texturaNeon } from './discoteca';
import { Personaje } from '../personaje';
import { PIEZAS, TELAS, type Aspecto } from '@shared/aspecto';
import { trozos } from '../figura/fuentes';

const VERDE = '#5fe0b0';

// poste de barbero: el cilindro de franjas que gira (la textura se desplaza), con sus remates de latón
function poste(g: THREE.Group, x: number, y: number, z: number) {
  const { c, g: x2 } = lienzo(128, 256);
  x2.fillStyle = '#f2ece0'; x2.fillRect(0, 0, 128, 256);
  for (let k = -4; k < 8; k++) for (const [col, d] of [['#b8322b', 0], ['#2d4f8a', 32]] as const) {
    x2.fillStyle = col; x2.beginPath(); const y0 = k * 64 + d;
    x2.moveTo(0, y0); x2.lineTo(128, y0 - 64); x2.lineTo(128, y0 - 64 + 18); x2.lineTo(0, y0 + 18); x2.fill();
  }
  const tex = texturaDe(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 1.6);
  const vidrio = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 28, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 }));
  vidrio.position.set(x, y, z); vidrio.userData.estatico = false; g.add(vidrio);
  const laton = materialAcero('#b08a3e');
  for (const dy of [-0.38, 0.38]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 24), laton); r.position.set(x, y + dy, z); g.add(r); }
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12), laton); bola.position.set(x, y + 0.48, z); g.add(bola);
  g.add(caja(0.05, 0.05, 0.16, laton, x, y, z - 0.12));
  return tex;
}

// un maniquí del escaparate: cabeza de maniquí y un modelito al azar del probador, quieto en su pose
function modelito(r: () => number): Aspecto {
  const de = (ranura: string) => PIEZAS.filter(p => p.ranura === ranura && p.especie !== 'robot');
  const elegir = <T,>(l: T[]) => l[Math.floor(r() * l.length)];
  const torso = elegir(de('torso'));
  const mismo = (ranura: string) => de(ranura).find(p => p.fuente === torso.fuente) ?? elegir(de(ranura));
  const piezas: Aspecto['piezas'] = { torso: torso.id, brazos: mismo('brazos').id, piernas: (r() < 0.6 ? mismo('piernas') : elegir(de('piernas'))).id };
  if (r() < 0.45) piezas.sombrero = elegir(de('sombrero').filter(p => !p.despiece)).id;
  if (r() < 0.25) piezas.espalda = elegir(de('espalda')).id;
  return { especie: 'humano', piezas, colores: { piel: '#cdbfa6', ...(r() < 0.6 ? { torso1: elegir(TELAS) } : {}), ...(r() < 0.4 ? { piernas1: elegir(TELAS) } : {}) } };
}

export async function amueblarChapa(ctx: Contexto) {
  const { g, zB, K, P, semilla } = ctx;
  let s = semilla * 7919 + 1; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // ---- rótulo de neón al fondo, en el centro
  const matNeon = new THREE.MeshBasicMaterial({ map: texturaNeon('CHAPA Y PINTURA', 'BARBERÍA · ROPERÍA · DESABOLLADO', VERDE), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.88), matNeon); neon.position.set(-0.1, 3.02, zB + 0.36); neon.userData.estatico = false; g.add(neon);

  // ---- barbería (izquierda): espejo, lavacabezas, sillón giratorio, poste y Fito
  const xS = -3.3;
  // el espejo, que parezca espejo (la luna del pack es blanca lisa): metal pulido que refleja el entorno
  colocar(g, R.casa('Bathroom_Mirror1'), { pos: [xS, 1.2, zB + 0.33], alto: 1.35, propios: true }).then(o => o.traverse((n: any) => {
    if (n.isMesh && n.material?.name === 'Mirror') { n.material.color.set('#b7cad3'); n.material.metalness = 1; n.material.roughness = 0.06; n.material.envMapIntensity = 1.4; n.material.emissive = new THREE.Color('#1c2a30'); }
  }));
  P(R.casa('Bathroom_Sink'), { pos: [xS - 1.45, 0, zB + 0.55], alto: 0.95 });
  P(R.casa('Bathroom_Towel'), { pos: [xS - 1.45, 1.35, zB + 0.33], alto: 0.55 });
  const sillon = await colocar(g, R.mueble('chair_desk_A'), { pos: [xS, 0, zB + 1.3], escala: K * 1.15, rot: 0.25, estatico: false });
  P(R.mueble('rug_oval_B'), { pos: [xS, 0.005, zB + 1.4], escala: K * 1.3 });
  const tocador = P(R.mueble('cabinet_small_decorated'), { pos: [xS + 1.3, 0, zB + 0.5], escala: K * 0.95 });
  ctx.sobre(tocador, R.herr('scissors'), { pos: [xS + 1.25, 0, zB + 0.68], escala: 0.5, ...tumbada(1.2) });
  for (const k of [0, 1]) ctx.sobre(tocador, R.cocina('papertowel'), { pos: [xS + 1.45 + k * 0.2, 0, zB + 0.42], escala: K * 0.55 }, { desde: 1.1 });
  const texPoste = poste(g, -5.45, 1.75, zB + 0.48);
  P(R.casa('Light_Floor1'), { pos: [-5.45, 0, zB + 1.2], alto: 1.75 });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(-5.9, zB), new THREE.Vector2(-2.0, zB + 0.95)));
  // Fito corta junto al sillón, tijeras en mano
  ctx.sala.puntos.push({ id: 'tijeras', tipo: 'aficion', pos: new THREE.Vector3(xS + 0.95, 0, zB + 1.35), giro: -1.1, clip: 'Holding_B', utensilio: 'tijeras', gesto: { clip: 'Use_Item', cada: 6 } });
  // la pieza: el sillón del barbero. Se le da media vuelta (gira), se repasa con las tijeras o se ajusta su palanca
  let vuelta = 0; const girar = () => { vuelta = 1; };
  ctx.sala.puntos.push({ id: 'sillon', tipo: 'pieza', pos: new THREE.Vector3(xS - 0.85, 0, zB + 1.5), giro: Math.PI / 2 - 0.2,
    acciones: [{ clip: 'Interact', alHacer: girar }, { clip: 'Use_Item', utensilio: 'tijeras' }, { clip: 'Working_C', utensilio: 'llave', alHacer: girar }] });
  cartelEnPared(g, cartel(['SE CORTA', 'SE COSE', 'SE ENDEREZA'], 'CHAPA Y PINTURA · WORK-SHELTER', '#e2efe6', '#1f4a3a', 'mano', semilla), -1.55, 2.0, 0.5, 0.7, zB + 0.33, 0.02);

  // ---- ropería (derecha): escaparate de maniquíes sobre una tarima, sombrerera y cabina de prueba
  const tarima = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 1.0), new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.6 }));
  tarima.position.set(2.45, 0.07, zB + 0.85); tarima.receiveShadow = true; g.add(tarima);
  g.add(caja(3.34, 0.03, 1.04, materialAcero('#b08a3e'), 2.45, 0.155, zB + 0.85));
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(0.75, zB), new THREE.Vector2(4.15, zB + 1.4)));
  const maniquies: { p: Personaje | null; x: number }[] = [1.35, 2.45, 3.55].map(x => ({ p: null, x }));
  const vestir = async (m: { p: Personaje | null; x: number }) => {
    const p = new Personaje('maniqui', modelito(r)); p.enReposo = 'Idle_A'; p.maniqui = true;
    await p.cargar();
    p.reproducir('Idle_A', 0); p.mixer.update(0.2);
    p.raiz.position.set(m.x, 0.17, zB + 0.85); p.raiz.rotation.y = (m.x - 2.45) * -0.25; p.giroObjetivo = p.raiz.rotation.y;
    p.sombraContacto.visible = false; p.raiz.userData.estatico = false;
    if (m.p) g.remove(m.p.raiz);
    m.p = p; g.add(p.raiz);
  };
  await Promise.all(maniquies.map(vestir));

  // sombrerera: baldas en la pared con sombreros de verdad del probador, dos en cada una
  const baldas = [1.4, 2.0, 2.6], xB = 4.95;
  const estantes = await Promise.all(baldas.map(y => colocar(g, R.mueble('shelf_B_large'), { pos: [xB, y - 0.2 * K, zB + 0.33], escala: K * 0.85, ancla: 'atras' })));
  for (const e of estantes) aPared(g, e);
  // la cara de arriba de cada balda, medida ahora (los sombreros llegan después, cuando la sala ya está fusionada)
  const ySombrero = estantes.map((e, i) => [-0.42, 0.42].map(dx => superficie(e, g, xB + dx, zB + 0.52) ?? baldas[i]));
  const sombreros = ['sombrero.Hiker.Hat', 'sombrero.Witch.Hat', 'sombrero.Farmer_B.Hat', 'sombrero.Helper_A.Hat', 'sombrero.ToySoldier.Hat', 'sombrero.Mage.Hat'];
  sombreros.forEach(async (id, k) => {
    const p = PIEZAS.find(x => x.id === id); if (!p) return;
    const [t] = await trozos(p); if (!t) return;
    const mat = (Array.isArray(t.malla.material) ? t.malla.material[0] : t.malla.material) as THREE.Material;
    const m = new THREE.Mesh(t.geo, mat); m.castShadow = true;
    const caja3 = new THREE.Box3().setFromBufferAttribute(t.geo.attributes.position as THREE.BufferAttribute);
    const tam = caja3.getSize(new THREE.Vector3()), centro = caja3.getCenter(new THREE.Vector3());
    const e = 0.38 / Math.max(tam.x, tam.z); m.scale.setScalar(e);
    m.position.set(-centro.x * e, -caja3.min.y * e, -centro.z * e);
    const o = new THREE.Group(); o.add(m); o.userData.estatico = false;
    o.position.set(xB - 0.42 + (k % 2) * 0.84, ySombrero[Math.floor(k / 2)][k % 2] + 0.003, zB + 0.52); o.rotation.y = 0.35 - (k % 2) * 0.7;
    g.add(o);   // cada sombrero, apoyado en su balda (la altura medida)
  });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(4.2, zB), new THREE.Vector2(5.9, zB + 0.75)));
  cartelEnPared(g, cartel(['SE PRUEBA', 'SIN', 'COMPROMISO'], 'ROPERÍA DEL REFUGIO', '#efe4c8', '#2d4f3f', 'engranaje', semilla + 3), 0.45, 2.15, 0.48, 0.66, zB + 0.33, -0.02);

  // ---- el puesto: la mesa de corte de la ropería, de pie (un mueble bajo con cajones, a la altura de las manos), con
  // el monitor del catálogo, tela, tijeras y la cinta
  const pCatalogo = new PantallaFosforo(384, 256, VERDE, ' catálogo'); pCatalogo.velocidad = 20;
  pCatalogo.escribir([`${PIEZAS.filter(p => p.ranura === 'torso').length} torsos`, `${PIEZAS.filter(p => p.ranura === 'sombrero').length} sombreros`, `${TELAS.length} telas`, 'P: probador']); ctx.sala.pantallas.push(pCatalogo);
  await puestoTrabajo(ctx, { id: 'corte', x: 4.8, z: 0.2, giro: -0.9, dePie: true, mesa: R.mueble('cabinet_medium'), escalaMesa: 1.12, tex: pCatalogo.tex, brillo: 1.0, teclado: true,
    encima: [{ ruta: R.mueble('rug_rectangle_stripes_A'), x: -0.45, z: 0.15, c: { ancho: 0.62, rot: 0.15 } }, { ruta: R.herr('scissors'), x: 0.55, z: 0.15, c: { escala: 0.5, ...tumbada(-0.7) } }, { ruta: R.herr('rope_bundle_B'), x: -0.7, z: -0.2, c: { escala: K * 0.35 } }] });

  // ---- vida: el poste gira, el neón zumba y el escaparate se cambia de ropa de vez en cuando
  let reloj = 30 + r() * 20, turno = 0;
  ctx.alActualizar((dt, t) => {
    vuelta = Math.max(0, vuelta - dt * 0.7);
    sillon.rotation.y = 0.25 + Math.sin((1 - vuelta) * Math.PI) * vuelta * 1.6;
    texPoste.offset.y = (t * 0.35) % 1;
    const fallo = Math.sin(t * 11.3) * Math.sin(t * 2.7) > 0.93;
    matNeon.opacity = fallo ? 0.3 : 0.92 + 0.08 * Math.sin(t * 50);
    reloj -= dt;
    if (reloj < 0) { reloj = 40 + r() * 30; vestir(maniquies[turno++ % maniquies.length]); }
  });

  // ---- luz: cálida de barbería en el sillón, fría de escaparate en los maniquíes
  ctx.sala.anclas.push({ tipo: 'foco', pos: new THREE.Vector3(2.45, 4.1, 0.6), objetivo: new THREE.Vector3(2.45, 0.9, zB + 0.85), intensidad: 30, color: new THREE.Color('#dfeaff'), angulo: 0.6, penumbra: 0.5, distancia: 7, prioridad: 1.2 });
  ctx.lamparas = [{ x: -3.3, z: 0.6, o: { intensidad: 48, sombra: true, corta: true } }, { x: 0.2, z: 1.0, o: { intensidad: 36, color: '#ffe2b8', corta: true } }];
  mancha(g, -2.2, 1.4, 0.9, semilla);
  ctx.sala.zonasPaseo = [[-1.6, 0.6], [0.8, 3.2]];
}
