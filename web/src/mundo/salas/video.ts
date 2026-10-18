// Sala de repositorio «sala de proyección» (estilo vídeo). Mitad izquierda: cine, con la pantalla grande en alto
// (fotograma y, debajo, la línea de tiempo del render), telón a los lados y dos filas rectas de butacas tapizadas
// (sillón del pack estrechado: respaldo y brazos de verdad). Mitad derecha: cabina de proyección y montaje, con el
// proyector colgado (bobinas que giran y haz visible hasta la pantalla), foco de estudio en trípode, mesa de montaje
// con dos monitores y la claqueta, y el rack de render con sus pilotos.
import * as THREE from 'three';
import { colocar, R } from '../../motor/assets';
import { cartel, PantallaFosforo, PanelSala, fotograma, LineaTiempo, lienzo, texturaDe, FUENTES } from '../../motor/texturas';
import { superponerPantalla, pantallaFrontal } from '../util3d';
import { cartelEnPared, mancha, bandaAlta, ALTO, pantallaReal, montarPilotos, puestoTrabajo, apoyar, aPared, type Contexto } from './comun';

// repinta un modelo con materiales propios: { nombreDeMaterial: color } ('*' para todos los demás)
function repintar(o: THREE.Object3D, colores: Record<string, string>, rugosidad = 0.85) {
  o.traverse((m: any) => {
    if (!m.isMesh) return;
    for (const mt of ([] as THREE.MeshStandardMaterial[]).concat(m.material)) {
      const c = colores[mt.name] ?? colores['*']; if (!c) continue;
      mt.map = null; mt.color.set(c); mt.roughness = rugosidad; mt.metalness = 0.05; mt.needsUpdate = true;
    }
  });
  return o;
}

// pirámide de luz desde el objetivo hasta las cuatro esquinas de la pantalla: aditiva, sin escribir profundidad,
// brillante junto al proyector y casi apagada al llegar a la pantalla
function hazProyector(apice: THREE.Vector3, esquinas: THREE.Vector3[], color: string, encoge = 1) {
  const c0 = new THREE.Color(color), c1 = new THREE.Color(color).multiplyScalar(0.06);
  const centro = esquinas.reduce((a, e) => a.add(e), new THREE.Vector3()).multiplyScalar(1 / esquinas.length);
  const es = esquinas.map(e => e.clone().lerp(centro, 1 - encoge));
  const pos: number[] = [], col: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = es[i], b = es[(i + 1) % 4];
    pos.push(apice.x, apice.y, apice.z, a.x, a.y, a.z, b.x, b.y, b.z);
    col.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.renderOrder = 3; m.userData.estatico = false; m.frustumCulled = false;
  return m;
}

// motas de polvo que solo existen dentro del haz (se ven porque las ilumina)
function motasHaz(apice: THREE.Vector3, esquinas: THREE.Vector3[], n = 70) {
  const { c, g } = lienzo(32, 32); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const t = new Float32Array(n), u = new Float32Array(n), w = new Float32Array(n), fase = new Float32Array(n);
  for (let i = 0; i < n; i++) { t[i] = 0.12 + Math.random() * 0.85; u[i] = Math.random(); w[i] = Math.random(); fase[i] = Math.random() * 10; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const puntos = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, map: texturaDe(c), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  puntos.frustumCulled = false; puntos.userData.estatico = false; puntos.renderOrder = 4;
  const [a, b, , d] = esquinas; const ex = b.clone().sub(a), ey = d.clone().sub(a);
  const p = new THREE.Vector3(), base = new THREE.Vector3();
  const actualizar = (dt: number, tt: number, fuerza: number) => {
    for (let i = 0; i < n; i++) {
      t[i] += dt * 0.012; u[i] += Math.sin(tt * 0.3 + fase[i]) * dt * 0.01; w[i] += dt * (0.006 + 0.004 * Math.sin(fase[i]));
      if (t[i] > 0.97 || u[i] < 0.03 || u[i] > 0.97 || w[i] > 0.97) { t[i] = 0.12 + Math.random() * 0.2; u[i] = 0.05 + Math.random() * 0.9; w[i] = 0.05 + Math.random() * 0.5; }
      base.copy(a).addScaledVector(ex, u[i]).addScaledVector(ey, w[i]);
      p.copy(apice).lerp(base, t[i]);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      const brillo = (1 - t[i]) * (0.55 + 0.45 * Math.sin(tt * 2 + fase[i])) * fuerza;
      col[i * 3] = brillo; col[i * 3 + 1] = brillo * 0.95; col[i * 3 + 2] = brillo * 1.1;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  };
  return { puntos, actualizar };
}

// claqueta: la pizarra del pack con su cara pintada (franjas y tiza)
function texturaClaqueta() {
  const { c, g } = lienzo(256, 220);
  g.fillStyle = '#16161a'; g.fillRect(0, 0, 256, 220);
  for (let i = -2; i < 12; i++) { g.fillStyle = i % 2 ? '#e8e2d4' : '#16161a'; g.beginPath(); g.moveTo(i * 26, 0); g.lineTo(i * 26 + 26, 0); g.lineTo(i * 26 + 8, 44); g.lineTo(i * 26 - 18, 44); g.fill(); }
  g.fillStyle = '#e8e2d4'; g.fillRect(0, 50, 256, 3); g.fillRect(0, 118, 256, 2); g.fillRect(128, 53, 2, 65);
  g.font = `700 22px ${FUENTES.rotulo}`; g.textBaseline = 'middle';
  g.fillText('ESCENA', 12, 72); g.fillText('TOMA', 140, 72);
  g.font = `800 42px ${FUENTES.titulo}`; g.fillText('1', 30, 100); g.fillText('3', 160, 100);
  g.font = `700 20px ${FUENTES.rotulo}`; g.fillText('PROMO 30 S', 12, 145); g.fillText('DIR. WORK-SHELTER', 12, 175);
  return texturaDe(c);
}

export async function amueblarProyeccion(ctx: Contexto) {
  const { g, v, zB, K, P, semilla } = ctx;
  const ps: Promise<unknown>[] = [];
  const fotos = [0, 1, 2, 3].map(n => fotograma(n, 640, 360));

  // ================================================================ CINE (mitad izquierda)
  const cx = -2.7;                      // eje de la pantalla y de las butacas
  const imgW = 2.84, imgH = 1.6, imgY = 3.22, tiraH = 0.3, tiraY = 2.24;   // la pantalla va en alto: las cabezas del público quedan por debajo de la línea de tiempo
  const zP = zB + 0.47;
  // marco: un cartel del pack, ensanchado, con la cara en negro mate
  const yArriba = imgY + imgH / 2, yAbajo = tiraY - tiraH / 2;
  const marco = await colocar(g, R.cy('Sign_1'), { pos: [cx, (yArriba + yAbajo) / 2, zB + 0.38], ancho: imgW + 0.3, ancla: 'centro', propios: true, sombra: false });
  marco.scale.y = (yArriba - yAbajo + 0.26) / marco.userData.tam.y;
  repintar(marco, { Texture_Signs: '#0b0a0d', Grey: '#2a2527' }, 0.7);
  const lienzoGrande = new THREE.Mesh(new THREE.PlaneGeometry(imgW, imgH), new THREE.MeshStandardMaterial({ map: fotos[0], emissiveMap: fotos[0], emissive: '#ffffff', emissiveIntensity: 0.78, color: '#000' }));
  lienzoGrande.position.set(cx, imgY, zP); g.add(lienzoGrande);
  const linea = new LineaTiempo();
  const tira = new THREE.Mesh(new THREE.PlaneGeometry(imgW, tiraH), new THREE.MeshStandardMaterial({ map: linea.tex, emissiveMap: linea.tex, emissive: '#ffffff', emissiveIntensity: 0.7, color: '#000' }));
  tira.position.set(cx, tiraY, zP); g.add(tira);
  // telón a los dos lados (cortina del pack en terciopelo granate)
  for (const s of [-1, 1]) ps.push(colocar(g, R.casa('Curtains_Single'), { pos: [cx + s * (imgW / 2 + 0.62), 0, zB + 0.42], alto: 4.0, propios: true }).then(o => { o.scale.x *= 0.62; repintar(o, { Couch_Blue: '#5c1724', LightMetal: '#8c6a3c' }, 0.95); }));
  // la pantalla tiñe un poco la sala (luz de relleno del color del fotograma)
  ctx.sala.anclas.push({ tipo: 'punto', pos: new THREE.Vector3(cx, 2.6, zB + 1.5), intensidad: 6, color: new THREE.Color('#e7a6c8'), distancia: 5, prioridad: 1 });

  // butacas: dos filas rectas encaradas a la pantalla (de espaldas a cámara); la de atrás, de tres
  const PASO = 0.84;
  const butaca = (x: number, z: number) => colocar(g, R.casa('Couch_Small1'), { pos: [x, 0, z], alto: 0.86, rot: Math.PI, propios: true })
    .then(o => { o.scale.x = 0.6; repintar(o, { Couch_Blue: '#6e1d2c', Black: '#1b1819' }, 0.9); });
  const filaDelante = [-1.5, -0.5, 0.5, 1.5].map(k => cx + k * PASO), filaDetras = [-1, 0, 1].map(k => cx + k * PASO);
  ps.push(...filaDelante.map(x => butaca(x, -0.55)), ...filaDetras.map(x => butaca(x, 0.72)));
  ctx.sala.obstaculos.push(
    new THREE.Box2(new THREE.Vector2(cx - 2 * PASO - 0.05, -1.05), new THREE.Vector2(cx + 2 * PASO + 0.05, -0.05)),
    new THREE.Box2(new THREE.Vector2(cx - 1.5 * PASO - 0.05, 0.25), new THREE.Vector2(cx + 1.5 * PASO + 0.05, 1.22)));
  // el habitante, en la butaca central de la fila de atrás, mirando la pantalla
  ctx.sala.puntos.push({ id: 'butaca', tipo: 'aficion', pos: new THREE.Vector3(cx, 0.05, 0.68), giro: Math.PI, clip: 'Sit_Chair_Idle' });
  // latas de película apiladas junto al telón
  for (let i = 0; i < 3; i++) P(R.sv('Can_Closed'), { pos: [-5.25 + (i % 2) * 0.05, i * 0.1, zB + 1.05], alto: 0.1, ancho: 0.42, rot: i * 0.7, variante: v });

  // ================================================================ CABINA DE PROYECCIÓN Y MONTAJE (mitad derecha)
  // proyector colgado del techo: cuerpo (caja del pack), objetivo apuntando a la pantalla y dos bobinas que giran
  const PX = 0.35, PY = 3.42, PZ = zB + 1.35;
  P(R.cy('Support_Short'), { pos: [PX + 0.05, ALTO, PZ], alto: ALTO - PY - 0.2, ancla: 'techo', sombra: false });
  ps.push(colocar(g, R.sf('Props_Crate'), { pos: [PX, PY - 0.22, PZ], alto: 0.42, propios: true, sombra: false }).then(o => { o.scale.x *= 1.35; repintar(o, { '*': '#2c2a2e' }, 0.6); }));
  const lente = await colocar(g, R.sf('Details_Cylinder'), { pos: [PX - 0.42, PY - 0.02, PZ], alto: 0.2, rotZ: Math.PI / 2, ancla: 'centro', sombra: false, propios: true });
  repintar(lente, { '*': '#141316' }, 0.4);
  const ojo = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2dc').multiplyScalar(2.2) }));
  ojo.position.set(PX - 0.53, PY - 0.02, PZ); ojo.rotation.y = -Math.PI / 2; g.add(ojo);
  const bobinas: THREE.Object3D[] = [];
  for (const [dx, r] of [[-0.2, 0.46], [0.25, 0.4]] as const) {
    const b = await colocar(g, R.sf('Details_Output'), { pos: [PX + dx, PY + 0.2 + r / 2, PZ], ancho: r, ancla: 'centro', estatico: false, propios: true, sombra: false });
    b.scale.z *= 2; repintar(b, { '*': '#7c7678' }, 0.35); bobinas.push(b);
  }
  // haz: del objetivo a la pantalla (dos capas para que tenga borde suave) y motas dentro
  const apice = new THREE.Vector3(PX - 0.55, PY - 0.02, PZ);
  const esq = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => new THREE.Vector3(cx + sx * imgW / 2, imgY + sy * imgH / 2, zP));
  const haz = hazProyector(apice, esq, '#3a3f52'), nucleo = hazProyector(apice, esq, '#2c3044', 0.72);
  g.add(haz, nucleo);
  const motas = motasHaz(apice, esq); g.add(motas.puntos);

  // luz rasante sobre la parte alta de la pared de la cabina (que no quede en negro)
  ctx.sala.anclas.push({ tipo: 'foco', pos: new THREE.Vector3(2.4, 4.1, zB + 1.7), objetivo: new THREE.Vector3(2.4, 2.6, zB), intensidad: 14, color: new THREE.Color('#ffd2a0'), angulo: 0.9, penumbra: 0.8, distancia: 6, prioridad: 0 });
  // cámara de cine en su trípode (tres mástiles de celosía del pack como patas), con las bobinas arriba y el objetivo hacia la sala
  const TX = 0.45, TZ = zB + 1.3, PATA = 1.4, ABRE = 0.2;
  for (const ang of [0.3, 0.3 + 2.1, 0.3 + 4.2]) ps.push(colocar(g, R.cy('Antenna_1'), { pos: [TX + Math.sin(ang) * PATA * Math.sin(ABRE), 0, TZ + Math.cos(ang) * PATA * Math.sin(ABRE)], alto: PATA, propios: true }).then(o => {
    o.rotation.order = 'YXZ'; o.rotation.set(-ABRE, ang, 0); repintar(o, { '*': '#3a383c' }, 0.5);
  }));
  const cabeza = new THREE.Group(); cabeza.position.set(TX, PATA * Math.cos(ABRE) - 0.02, TZ); cabeza.rotation.y = 0.55; g.add(cabeza);
  ps.push(colocar(cabeza, R.sf('Props_Crate'), { pos: [0, 0, 0], alto: 0.34, propios: true, sombra: false }).then(o => { o.scale.x *= 1.45; repintar(o, { '*': '#232125' }, 0.55); }));
  ps.push(colocar(cabeza, R.sf('Details_Cylinder'), { pos: [-0.4, 0.17, 0], alto: 0.18, rotZ: Math.PI / 2, ancla: 'centro', propios: true, sombra: false }).then(o => repintar(o, { '*': '#121114' }, 0.35)));
  for (const [dx, r] of [[-0.12, 0.34], [0.2, 0.3]] as const) {
    const b = await colocar(cabeza, R.sf('Details_Output'), { pos: [dx, 0.34 + r / 2 - 0.02, 0], ancho: r, ancla: 'centro', estatico: false, propios: true, sombra: false });
    b.scale.z *= 2; repintar(b, { '*': '#6c6668' }, 0.35); bobinas.push(b);
  }
  cabeza.userData.estatico = false;
  // piloto rojo de grabación (se enciende al renderizar)
  const rec = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#2a0c0c' }));
  rec.position.set(-0.2, 0.28, 0.13); cabeza.add(rec);
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(TX - 0.4, TZ - 0.4), new THREE.Vector2(TX + 0.4, TZ + 0.4)));
  // la pieza: la cámara de cine. Se mira por el visor, se le da a la manivela (las bobinas se aceleran y se enciende el
  // piloto de grabación) o se ajusta el objetivo con la llave
  let rodando = 0; const rodar = () => { rodando = 2.5; };
  const haciaCamara = (x: number, z: number) => Math.atan2(TX - x, TZ - z);
  ctx.sala.puntos.push({ id: 'camara', tipo: 'pieza', pos: new THREE.Vector3(TX + 0.72, 0, TZ + 0.55), giro: haciaCamara(TX + 0.72, TZ + 0.55),
    acciones: [{ clip: 'Interact', alHacer: rodar }, { clip: 'Working_B', alHacer: rodar }, { clip: 'Use_Item', utensilio: 'llave' }] });

  // mesa de montaje, de tres cuartos: dos monitores (render y previsualización), teclado, la taza y la claqueta. Es el
  // puesto de quien trabaja en la sala
  const MX = 3.0;
  const pRender = new PantallaFosforo(384, 256, v.pantalla, ' render --final'); pRender.velocidad = 24;
  pantallaReal(ctx, pRender, 'actividad'); ctx.sala.pantallas.push(pRender);
  const puesto = await puestoTrabajo(ctx, { id: 'montaje', x: MX, z: -1.0, giro: -0.6, pantalla: 'doble', tex: pRender.tex, brillo: 0.55, colorMesa: '#8c7466',
    encima: [{ ruta: R.mueble('mug_A'), x: -0.78, z: 0.22, c: { escala: K * 0.75 } }] });
  for (const m of puesto.monitores) m.traverse((n: any) => { if (n.isMesh && !n.material.emissiveMap) { n.material = n.material.clone(); n.material.color.set('#34333a'); n.material.roughness = 0.6; } });
  const previo = pantallaFrontal(puesto.monitores[1], fotos[1], { ancho: 0.84, alto: 0.66, cy: 0.6, dz: -0.02 }, 0.45);
  const claqueta = apoyar(await colocar(puesto.grupo, R.cy('Sign_Small_1'), { pos: [0.72, puesto.alto, 0.12], ancho: 0.3, rot: -0.5, estatico: false, propios: true }), puesto.mesa);
  repintar(claqueta, { '*': '#16161a' }, 0.7);
  superponerPantalla(claqueta, /^Texture_Signs$/, texturaClaqueta(), { brillo: 0.18, margen: 0.96 });
  ctx.sala.puntos.push({ id: 'consola', tipo: 'consola', pos: new THREE.Vector3(MX - 1.2, 0, zB + 1.85), giro: Math.PI - 0.6, clip: 'Working_A' });

  // rack de render: dos torres de módulos del pack (cajas con rejilla, como unidades de rack) con sus pilotos
  const pilotos: ((t: number, a: number) => void)[] = [];
  for (const x of [4.6, 5.5]) {
    // cada módulo, apoyado de verdad sobre el de debajo (antes se metían unos en otros)
    let debajo: THREE.Object3D | null = null;
    for (let n = 0; n < 3; n++) {
      const m = await colocar(g, R.sf('Props_CrateLong'), { pos: [x, 0, zB + 0.62], alto: 0.6, propios: true });
      apoyar(m, debajo); debajo = m;
      repintar(m, { Main: '#4a4950', Accent: '#2c2b31', DarkAccent: '#232227', DarkGrey: '#1c1b20', Black: '#101013' }, 0.55);
      const caja3 = new THREE.Box3().setFromObject(m);
      if (n !== 1) { const leds = new THREE.Group(); leds.position.set(x + 0.02, caja3.min.y + 0.24, caja3.max.z + 0.01); leds.scale.set(1.5, 0.9, 1); leds.userData.estatico = false; g.add(leds); pilotos.push(montarPilotos(leds, new THREE.Vector3(0, 0, 0), v.pantalla)); }
    }
  }
  P(R.cy('Cable_Thick'), { pos: [5.05, ALTO, zB + 0.75], alto: 1.1, ancla: 'techo', sombra: false });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(4.1, zB), new THREE.Vector2(6.0, zB + 1.15)));
  // banda alta solo sobre el rack (el resto de la pared es de la pantalla y los carteles)
  await bandaAlta(ctx, { manometro: 4.35, valvulas: [5.7], tramos: [[5.2, 1.9]] });
  // cartel luminoso «RENDERIZANDO» sobre la mesa (se enciende cuando la sala trabaja)
  const { c, g: cxx } = lienzo(512, 128);
  const pintar = (on: boolean) => { cxx.fillStyle = '#140a0a'; cxx.fillRect(0, 0, 512, 128); cxx.strokeStyle = on ? '#ff4a3a' : '#4a2a2a'; cxx.lineWidth = 8; cxx.strokeRect(6, 6, 500, 116); cxx.fillStyle = on ? '#ff6a52' : '#4a2a2a'; cxx.shadowColor = '#ff4a3a'; cxx.shadowBlur = on ? 22 : 0; cxx.font = `800 64px ${FUENTES.titulo}`; cxx.textAlign = 'center'; cxx.textBaseline = 'middle'; cxx.fillText('RENDERIZANDO', 256, 68); cxx.shadowBlur = 0; };
  pintar(false); const texAviso = texturaDe(c);
  const aviso = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.32), new THREE.MeshStandardMaterial({ map: texAviso, emissiveMap: texAviso, emissive: '#ffffff', emissiveIntensity: 1.0, color: '#000' }));
  aviso.position.set(MX, 3.55, zB + 0.4); g.add(aviso);
  // panel de la cola de render, en la pared sobre la mesa
  const panel = new PanelSala(); panel.titulo = 'COLA DE RENDER'; panel.color = v.pantalla;
  const marcoPanel = aPared(g, await colocar(g, R.cy('Sign_2'), { pos: [MX, 2.72, zB + 0.5], ancho: 1.5, estatico: false, propios: true }));
  superponerPantalla(marcoPanel, /^Texture_Signs$/, panel.tex, { brillo: 0.9, margen: 0.94 });
  ctx.panel = panel;
  cartelEnPared(g, cartel(['UN FOTOGRAMA', 'MÁS Y', 'LO TENEMOS'], 'PRODUCCIONES WORK-SHELTER', '#d8c8f0', '#3a2a5a', 'ojo', semilla), 1.35, 1.75, 0.6, 0.84, zB + 0.33, 0.03);

  await Promise.all(ps);
  mancha(g, 1.2, 1.0, 1.0, semilla + 5);
  ctx.sala.zonasPaseo = [[0.0, 2.4]];
  ctx.vapor = { pos: new THREE.Vector3(5.7, 3.15, zB + 0.85), dir: new THREE.Vector3(-0.3, 0.9, 0.3) };
  ctx.chispas = new THREE.Vector3(5.25, 1.9, zB + 0.9);
  ctx.lamparas = [{ x: -4.85, z: 1.0, o: { intensidad: 130, corta: true } }, { x: 2.55, z: 0.8, o: { intensidad: 115, sombra: true, corta: true } }, { x: 4.95, z: 0.6, o: { intensidad: 120 } }];

  let k = 0, tCambio = 0, encendido = false;
  ctx.alActualizar((dt, t, a) => {
    const trabajando = ctx.sala.estado === 'trabajando';
    linea.actualizar(dt, trabajando ? 1 + a * 3 : 0.15);
    tCambio += dt;
    if (tCambio > (trabajando ? 2.2 : 6)) {
      tCambio = 0; k++;
      const m = lienzoGrande.material as THREE.MeshStandardMaterial; m.map = m.emissiveMap = fotos[k % 4]; m.needsUpdate = true;
      const pm = previo.material as THREE.MeshStandardMaterial; pm.map = pm.emissiveMap = fotos[(k + 1) % 4]; pm.needsUpdate = true;
    }
    if (trabajando !== encendido) { encendido = trabajando; pintar(trabajando); texAviso.needsUpdate = true; }
    // el haz parpadea con el obturador; las bobinas giran (más deprisa si renderiza)
    const fuerza = 0.9 + Math.sin(t * 9) * 0.06 + Math.sin(t * 23) * 0.04 + (trabajando ? 0.25 : 0);
    (haz.material as THREE.MeshBasicMaterial).opacity = fuerza; (nucleo.material as THREE.MeshBasicMaterial).opacity = fuerza;
    motas.actualizar(dt, t, fuerza);
    rodando = Math.max(0, rodando - dt);
    for (const b of bobinas) b.rotation.z -= dt * (trabajando || rodando > 0 ? 2.2 + rodando : 0.7);
    (rec.material as THREE.MeshBasicMaterial).color.set((trabajando || rodando > 0) && Math.sin(t * 5) > 0 ? '#ff3020' : '#2a0c0c');
    for (const f of pilotos) f(t, a);
    if (trabajando && Math.random() < dt * (0.12 + a)) panel.lineas.push('> ' + ['fotograma ' + ((t * 30) % 900 | 0), 'audio sincronizado', 'codificando h264', 'previsualización lista'][Math.floor(Math.random() * 4)]);
  });
}
