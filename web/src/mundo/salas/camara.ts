// Cámara acorazada (planta -1, izquierda): las llaves del refugio. Integraciones y ajustes; más adelante, claves.
// Pieza protagonista: la pared de cajas de seguridad, una por integración con su piloto de estado, tras una barrera
// láser que se apaga cuando el Supervisor se acerca al escáner. Vigilan una torreta de techo que le sigue con la
// mirada y un dron centinela; a la derecha, el puesto de guardia con las cámaras del refugio.
import * as THREE from 'three';
import { colocar, R } from '../../motor/assets';
import { cartel, PanelSala, lienzo, texturaDe, franjaPeligro, FUENTES } from '../../motor/texturas';
import { superponerPantalla } from '../util3d';
import { cartelEnPared, mancha, bandaAlta, monitorPared, materialAcero, texturaHalo, mundo, caja, ALTO, TEXTO_ESTADO, COLOR_ESTADO, type Contexto } from './comun';
import { vivo } from '../../red/cliente';

const FUENTES_INT = ['outlook', 'google', 'discord', 'slack', 'github', 'linear'];   // una caja por fuente (el orden de la cámara acorazada)
const COL_INT: Record<string, string> = { demo: '#ffb000', conectada: '#5dff8a', error: '#ff3a2a', 'sin-configurar': '#4a4a4a' };

export async function amueblarCamara(ctx: Contexto) {
  const { g, v, zB, K, P, semilla } = ctx;
  await bandaAlta(ctx, { valvulas: [-4.6, 5.55], tramos: [[-4.9, 2.2], [4.7, 2.4]] });   // el centro, libre para la baliza
  // ---- pared de cajas de seguridad: 7 × 4 puertas remachadas sobre un armazón de acero
  const X0 = -0.7, PASO = 0.66, COLS = 7, FILAS = 4, Y0 = 0.74;
  const armazon = materialAcero('#1f2226');
  g.add(caja(COLS * PASO + 0.34, FILAS * PASO + 0.34, 0.32, armazon, X0, Y0 + (FILAS - 1) * PASO / 2, zB + 0.47, true));
  // marco dorado alrededor (como las cámaras de los bancos de antes)
  for (const [w, h, x, y] of [[COLS * PASO + 0.5, 0.1, X0, Y0 - PASO / 2 - 0.13], [COLS * PASO + 0.5, 0.1, X0, Y0 + (FILAS - 0.5) * PASO + 0.13], [0.1, FILAS * PASO + 0.36, X0 - COLS * PASO / 2 - 0.2, Y0 + (FILAS - 1) * PASO / 2], [0.1, FILAS * PASO + 0.36, X0 + COLS * PASO / 2 + 0.2, Y0 + (FILAS - 1) * PASO / 2]] as const)
    g.add(caja(w, h, 0.36, materialAcero('#8a6a2c'), x, y, zB + 0.48));
  const zP = zB + 0.645;
  const r = azar(semilla);
  const leds: { m: THREE.MeshBasicMaterial; fuente?: string; fase: number }[] = [];
  const geoLed = new THREE.SphereGeometry(0.03, 8, 6);
  const ps: Promise<unknown>[] = [];
  for (let j = 0; j < FILAS; j++) for (let i = 0; i < COLS; i++) {
    const x = X0 + (i - (COLS - 1) / 2) * PASO, y = Y0 + j * PASO;
    const fuente = j === 2 && i >= 1 && i <= FUENTES_INT.length ? FUENTES_INT[i - 1] : undefined;
    const abierta = j === 1 && i === 6;
    if (abierta) {
      // una caja abierta: la puerta girada sobre su bisagra y, dentro, una llave que brilla
      const bisagra = new THREE.Group(); bisagra.position.set(x - 0.3, y, zP); g.add(bisagra);
      ps.push(colocar(bisagra, R.sf('Details_Plate_Details'), { pos: [0.3, 0, 0], alto: 0.6, ancla: 'centro', variante: ctx.vOscuro }).then(() => { bisagra.rotation.y = -1.95; }));
      g.add(caja(0.56, 0.56, 0.05, new THREE.MeshStandardMaterial({ color: '#0c0d0e', roughness: 0.9 }), x, y, zP - 0.04));
      ps.push(colocar(g, R.herr('key_C'), { pos: [x, y - 0.08, zP - 0.02], alto: 0.34, rotZ: Math.PI / 2, propios: true }).then(o => o.traverse((n: any) => { if (n.isMesh) { n.material.emissive = new THREE.Color('#ffc65a'); n.material.emissiveIntensity = 0.9; } })));
      const brillo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaHalo(), color: '#ffcf6a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
      brillo.scale.setScalar(0.7); brillo.position.set(x, y, zP + 0.05); g.add(brillo);
      continue;
    }
    ps.push(colocar(g, R.sf('Details_Plate_Details'), { pos: [x, y, zP], alto: 0.6, ancla: 'centro', variante: fuente ? v : ctx.vOscuro }));
    const led = new THREE.MeshBasicMaterial({ color: '#222' });
    const m = new THREE.Mesh(geoLed, led); m.position.set(x + 0.2, y + 0.2, zP + 0.04); m.scale.setScalar(fuente ? 1.6 : 1); g.add(m);
    leds.push({ m: led, fuente, fase: r() * 10 });
    if (fuente) {
      // rótulo de latón con el nombre de la integración
      const { c, g: gg } = lienzo(256, 64);
      gg.fillStyle = '#b8913a'; gg.fillRect(0, 0, 256, 64); gg.strokeStyle = '#5e4a1c'; gg.lineWidth = 6; gg.strokeRect(3, 3, 250, 58);
      gg.fillStyle = '#231a0c'; gg.font = `800 34px ${FUENTES.mono}`; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(fuente.toUpperCase(), 128, 34);
      const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.115), new THREE.MeshStandardMaterial({ map: texturaDe(c), roughness: 0.45, metalness: 0.6 }));
      placa.position.set(x, y - 0.19, zP + 0.035); g.add(placa);
    } else if (r() < 0.22) ps.push(colocar(g, R.herr(r() < 0.5 ? 'lock_A' : 'lock_B'), { pos: [x + 0.12, y - 0.24, zP + 0.05], alto: 0.17, rot: (r() - 0.5) * 0.4 }));
  }
  await Promise.all(ps);
  // baliza de alarma sobre la pared: gira y tiñe la sala de rojo si alguna integración falla
  const baliza = new THREE.Group(); baliza.position.set(X0, Y0 + FILAS * PASO - 0.05, zB + 0.62); g.add(baliza); baliza.userData.estatico = false;
  let matBaliza: THREE.MeshStandardMaterial | null = null;
  P(R.cy('Light_Square'), { alto: 0.4, sombra: false, propios: true, estatico: false }, baliza).then(o => o.traverse((n: any) => { if (n.isMesh && n.material.name === 'Light') { matBaliza = n.material; n.material.color = new THREE.Color('#000'); n.material.emissive = new THREE.Color('#ff2a1a'); n.material.emissiveIntensity = 0.3; } }));
  const haz = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.5, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  haz.geometry.translate(0, -2.25, 0); haz.geometry.rotateZ(Math.PI / 2); haz.position.y = 0.22; baliza.add(haz);
  const alarma = { tipo: 'punto' as const, pos: new THREE.Vector3(X0, 3.0, zB + 1.4), intensidad: 0, color: new THREE.Color('#ff3020'), distancia: 7, prioridad: 2 };
  ctx.sala.anclas.push(alarma);
  // ---- barrera láser delante de las cajas, entre dos postes emisores
  const xa = X0 - COLS * PASO / 2 - 0.45, xb = X0 + COLS * PASO / 2 + 0.45, zL = zB + 1.3;
  for (const x of [xa, xb]) { P(R.sf('Props_Vessel_Tall'), { pos: [x, 0, zL], alto: 1.5 }); P(R.sf('Details_Output_Small'), { pos: [x, 1.5, zL], ancho: 0.2, sombra: false }); }
  const nucleoLaser = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4030').multiplyScalar(2.2), transparent: true });
  const halo = (() => { const { c, g: gg } = lienzo(16, 64); const gr = gg.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,60,40,0)'); gr.addColorStop(0.5, 'rgba(255,60,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,40,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 16, 64); return new THREE.MeshBasicMaterial({ map: texturaDe(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); })();
  const rayos: THREE.Object3D[] = [];
  for (const y of [0.32, 0.62, 0.92, 1.22]) {
    const rayo = new THREE.Group(); rayo.position.set((xa + xb) / 2, y, zL); rayo.userData.estatico = false; g.add(rayo);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, xb - xa - 0.3, 6), nucleoLaser); n.rotation.z = Math.PI / 2; rayo.add(n);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa - 0.3, 0.09), halo); rayo.add(h);
    rayos.push(rayo);
  }
  // en el suelo, la franja de peligro y el rótulo de zona restringida
  const franja = franjaPeligro(512, 32, '#b8302a', '#1c1a18'); franja.wrapS = THREE.RepeatWrapping; franja.repeat.set(8, 1);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa + 0.3, 0.16), new THREE.MeshStandardMaterial({ map: franja, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.set((xa + xb) / 2, 0.015, zL + 0.14); g.add(suelo);
  { const { c, g: gg } = lienzo(1024, 96); gg.fillStyle = 'rgba(200,50,40,0.55)'; gg.font = `900 70px ${FUENTES.titulo}`; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText('ZONA RESTRINGIDA', 512, 52);
    const rot = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.32), new THREE.MeshStandardMaterial({ map: texturaDe(c), transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    rot.rotation.x = -Math.PI / 2; rot.position.set(X0, 0.016, zB + 0.95); g.add(rot); }
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(xa - 0.3, zB), new THREE.Vector2(xb + 0.3, zL + 0.25)));
  // la pieza: la pared de cajas, tras la barrera. Se revisa el inventario de llaves, se comprueba un cierre con la lupa o
  // se pasa la tarjeta por el lector del poste (las cajas de las integraciones parpadean)
  let repaso = 0; const repasar = () => { repaso = 1.5; };
  ctx.sala.puntos.push({ id: 'cajas', tipo: 'pieza', pos: new THREE.Vector3(X0 - 0.4, 0, zL + 0.6), giro: Math.PI,
    acciones: [{ clip: 'Holding_A', utensilio: 'diario', dur: 4 }, { clip: 'Interact', alHacer: repasar }, { clip: 'Holding_B', utensilio: 'lupa', dur: 3 }] });
  ctx.sala.puntos.push({ id: 'poste', tipo: 'pieza', pos: new THREE.Vector3(xb - 0.1, 0, zL + 0.6), giro: Math.PI + 0.45,
    acciones: [{ clip: 'Use_Item', utensilio: 'llave', alHacer: repasar }, { clip: 'Interact', alHacer: repasar }] });
  // ---- escáner biométrico junto a la barrera: aquí se abren las integraciones y los ajustes (E)
  const XE = 2.6;
  const escaner = new Escaner(v.pantalla);
  const terminal = await colocar(g, R.sf('Props_ComputerSmall'), { pos: [XE, 0, zB + 0.95], alto: 1.5, rot: -0.25, estatico: false, variante: v });
  superponerPantalla(terminal, /^Black$/, escaner.tex, { brillo: 1.3, margen: 0.9 });
  ctx.sala.puntos.push({ id: 'consola', tipo: 'consola', pos: new THREE.Vector3(XE - 0.1, 0, zB + 1.85), giro: Math.PI - 0.2, clip: 'Interact' });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(XE - 0.45, zB), new THREE.Vector2(XE + 0.45, zB + 1.35)));
  // ---- reserva enjaulada a la izquierda: lingotes, un cofre y la caja de caudales
  const zJ = zB + 1.45;
  // la reja con cristal blindado (el panel macizo del modelo, ahora ahumado): el oro se ve detrás
  const blindado = new THREE.MeshStandardMaterial({ color: '#6a8a9a', transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0.3, depthWrite: false });
  const cristal = (o: THREE.Object3D) => o.traverse((n: any) => { if (n.isMesh && n.material.name === 'DarkGrey') { n.material = blindado; n.renderOrder = 3; } });
  for (let k = 0; k < 3; k++) P(R.cy('Fence'), { pos: [-5.55 + k * 0.72, 0, zJ], alto: 1.75, propios: true }).then(cristal);
  P(R.cy('Fence'), { pos: [-3.5, 0, zJ - 0.45], alto: 1.75, rot: Math.PI / 2, propios: true }).then(cristal);
  ctx.sala.anclas.push({ tipo: 'punto', pos: new THREE.Vector3(-4.7, 1.3, zB + 1.3), intensidad: 2.2, color: new THREE.Color('#ffc46a'), distancia: 3, prioridad: 1 });
  const pale = P(R.recurso('Pallet_Wood'), { pos: [-5.1, 0, zB + 0.85], ancho: 1.1 });
  ctx.sobre(pale, R.recurso('Gold_Bars_Stack_Large'), { pos: [-5.1, 0, zB + 0.85], ancho: 0.9, rot: 0.1 });
  P(R.recurso('Gold_Bars_Stack_Small'), { pos: [-4.2, 0, zB + 1.05], ancho: 0.5, rot: -0.4 });
  const cofre = P(R.sf('Props_Chest'), { pos: [-4.15, 0, zB + 0.5], alto: 0.8, rot: 0.05, variante: v });
  ctx.sobre(cofre, R.recurso('Money_Bills_Stack_Medium'), { pos: [-4.15, 0, zB + 0.5], ancho: 0.4, rot: 0.3 });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(-6, zB), new THREE.Vector2(-3.3, zJ + 0.2)));
  // ---- puesto de guardia a la derecha: las cámaras del refugio en un monitor de pared, mesa y silla
  const cctv = new Cctv();
  await monitorPared(ctx, 4.55, 2.3, 1.3, cctv.tex, 1.15);
  // Hanzo no tiene mesa: hace la ronda. Paradas (en orden) mirando a lo que vigila: la reserva enjaulada, la pared de
  // cajas tras la barrera, el escáner y las cámaras del refugio
  for (const [i, x, z, mx, mz] of [[0, -3.0, 1.05, -4.7, zB + 0.9], [1, -0.7, 0.95, X0, zB + 0.6], [2, 3.2, 0.9, XE, zB + 0.95], [3, 4.6, 0.55, 4.55, zB + 0.6]] as const)
    ctx.sala.puntos.push({ id: 'ronda-' + i, tipo: 'patrulla', pos: new THREE.Vector3(x, 0, z), giro: Math.atan2(mx - x, mz - z) });
  // el sitio del guardia, sin mesa: un taburete alto junto a la pared de las cámaras y su taquilla
  P(R.sf('Props_Shelf'), { pos: [5.55, 0, zB + 0.5], alto: 1.6, rot: -Math.PI / 2 }).then(o => ctx.sobre(o, R.mueble('mug_B'), { pos: [5.55, 0, zB + 0.5], escala: K * 0.7 }, { desde: 1.2 }));
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(5.1, zB), new THREE.Vector2(6, zB + 1.0)));
  cartelEnPared(g, cartel(['LAS CLAVES', 'NO VAN', 'EN GIT'], 'CÁMARA ACORAZADA · WORK-SHELTER', '#e3e0d4', '#7a1f1a', 'mano', semilla), 3.55, 2.75, 0.56, 0.78, zB + 0.33, 0.03);
  // ---- torreta del techo: sigue al Supervisor mientras está en la sala
  const torreta = new THREE.Group(); torreta.position.set(X0 + 0.2, ALTO - 0.02, zB + 1.85); torreta.userData.estatico = false; g.add(torreta);
  P(R.cy('Turret_Gun'), { alto: 0.55, rotX: Math.PI, estatico: false, sombra: false }, torreta);
  const ojo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaHalo(), color: '#ff3a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ojo.scale.setScalar(0.22); ojo.position.set(0, -0.32, 0.38); torreta.add(ojo);
  // ---- dron centinela que patrulla bajo el techo
  const dron = new THREE.Group(); dron.userData.estatico = false; g.add(dron);
  P(R.cy('Enemy_Flying'), { alto: 0.5, ancla: 'centro', estatico: false }, dron);
  const ojoDron = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaHalo(), color: '#ff5a3a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
  ojoDron.scale.setScalar(0.3); ojoDron.position.set(0, 0, 0.2); dron.add(ojoDron);

  const panel = new PanelSala(); panel.titulo = 'CÁMARA'; panel.color = v.pantalla; ctx.panel = panel;
  mancha(g, 1.6, 1.2, 1.1, semilla); mancha(g, -2.4, 1.6, 0.8, semilla + 3);
  ctx.sala.zonasPaseo = [[-2.6, -1.0], [1.0, 2.0]];
  ctx.chispas = new THREE.Vector3(xb, 1.5, zL);
  ctx.lamparas = [{ x: -4.6, z: 0.5, o: { intensidad: 70, color: '#cfdcff' } }, { x: X0, z: 0.7, o: { intensidad: 105, sombra: true, corta: true, objetivo: [X0, -1.5], color: '#e4ecff' } }, { x: 4.5, z: 0.5, o: { intensidad: 75, color: '#ffd7a8' } }];

  const tmp = new THREE.Vector3();
  let rojo = 0, abierta = 0, xDron = -4, dirDron = 1;
  ctx.alActualizar((dt, t) => {
    const ints = vivo.get().integraciones ?? {};
    const fallo = FUENTES_INT.some(f => ints[f]?.estado === 'error');
    repaso = Math.max(0, repaso - dt);
    for (const l of leds) {
      if (l.fuente) { const e = ints[l.fuente]?.estado ?? 'demo'; l.m.color.set(COL_INT[e] ?? '#444').multiplyScalar(e === 'error' ? 1.5 + Math.sin(t * 8) * 1.2 : repaso > 0 && Math.sin(t * 20 + l.fase) > 0 ? 4 : 2.4); }
      else l.m.color.set(Math.sin(t * 0.7 + l.fase * 3) > 0.6 ? '#ff3a2a' : '#2f8a4a').multiplyScalar(Math.sin(t * 0.7 + l.fase * 3) > 0.6 ? 1.6 : 0.9);
    }
    // ¿el Supervisor está en esta sala y cerca del escáner? La barrera se apaga y el escáner da paso
    const sup = mundo.supervisor();
    let dentro = false, cerca = false;
    if (sup) { tmp.copy(sup.position); g.worldToLocal(tmp); dentro = Math.abs(tmp.x) < 6.2 && Math.abs(tmp.y) < 1.5 && Math.abs(tmp.z) < 3; cerca = dentro && Math.abs(tmp.x - XE) < 1.6; }
    abierta = THREE.MathUtils.damp(abierta, cerca ? 1 : 0, 6, dt);
    nucleoLaser.opacity = (1 - abierta) * (0.85 + 0.15 * Math.sin(t * 40)); halo.opacity = nucleoLaser.opacity * 0.9;
    for (const [k, rayo] of rayos.entries()) { rayo.visible = abierta < 0.97; rayo.position.y = [0.32, 0.62, 0.92, 1.22][k] + Math.sin(t * 1.3 + k) * 0.04; }
    escaner.actualizar(t, cerca ? 'concedido' : dentro ? 'escaneando' : 'reposo');
    // la torreta apunta al Supervisor si está dentro; si no, barre la sala despacio
    const giro = dentro ? Math.atan2(tmp.x - torreta.position.x, tmp.z - torreta.position.z) : Math.sin(t * 0.35) * 1.1;
    torreta.rotation.y = THREE.MathUtils.lerp(torreta.rotation.y, THREE.MathUtils.clamp(giro, -1.4, 1.4), 1 - Math.exp(-dt * 3));
    (ojo.material as THREE.SpriteMaterial).opacity = dentro ? 0.9 : 0.35 + 0.2 * Math.sin(t * 3);
    // dron: va y viene bajo el techo, cabeceando al girar
    xDron += dirDron * dt * 0.7; if (xDron > 3.6) dirDron = -1; if (xDron < -4.8) dirDron = 1;
    dron.position.set(xDron, 3.55 + Math.sin(t * 2.1) * 0.07, zB + 2.35);
    dron.rotation.y = THREE.MathUtils.damp(dron.rotation.y, dirDron > 0 ? 0.5 : -0.5, 3, dt); dron.rotation.z = Math.sin(t * 1.7) * 0.06;
    // alarma
    rojo = THREE.MathUtils.damp(rojo, fallo ? 1 : 0, 3, dt);
    baliza.rotation.y = t * 4 * rojo;
    (haz.material as THREE.MeshBasicMaterial).opacity = 0.09 * rojo; haz.visible = rojo > 0.02;
    if (matBaliza) (matBaliza as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + rojo * (2 + Math.sin(t * 8));
    alarma.intensidad = rojo * (3 + 2 * Math.sin(t * 8));
    cctv.actualizar(dt, t);
  });
}

function azar(s: number) { let x = s >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }

// Pantalla del escáner: huella dactilar que se lee con una línea de barrido; verde al conceder el acceso
class Escaner {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; private ultimo = -1;
  constructor(private color: string) { ({ c: this.c, g: this.g } = lienzo(256, 320)); this.tex = texturaDe(this.c); }
  actualizar(t: number, modo: 'reposo' | 'escaneando' | 'concedido') {
    const paso = Math.floor(t * 12); if (paso === this.ultimo) return; this.ultimo = paso;
    const { g } = this; const W = 256, H = 320;
    const col = modo === 'concedido' ? '#5dff8a' : modo === 'escaneando' ? this.color : '#3d6a78';
    g.fillStyle = '#041015'; g.fillRect(0, 0, W, H);
    g.strokeStyle = col; g.lineWidth = 3; g.globalAlpha = 0.85;
    // huella: arcos concéntricos con cortes, como las de los lectores de antes
    for (let k = 0; k < 11; k++) { const rr = 14 + k * 9; g.beginPath(); g.ellipse(128, 150, rr * 0.8, rr, 0, Math.PI * (0.9 + (k % 3) * 0.08), Math.PI * (2.1 - (k % 2) * 0.1)); g.stroke(); }
    g.globalAlpha = 1;
    if (modo !== 'concedido') { const y = 50 + ((t * 90) % 200); const gr = g.createLinearGradient(0, y - 20, 0, y + 4); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col); g.fillStyle = gr; g.globalAlpha = modo === 'reposo' ? 0.35 : 0.8; g.fillRect(30, y - 20, W - 60, 24); g.globalAlpha = 1; }
    g.fillStyle = col; g.font = `700 24px ${FUENTES.mono}`; g.textAlign = 'center';
    g.fillText(modo === 'concedido' ? 'ACCESO' : modo === 'escaneando' ? 'IDENTIFÍQUESE' : 'CÁMARA', 128, 282);
    g.fillText(modo === 'concedido' ? 'CONCEDIDO' : modo === 'escaneando' ? '· · ·' : 'SELLADA', 128, 308);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    this.tex.needsUpdate = true;
  }
}

// Monitor de vigilancia: cuatro cámaras del refugio con el estado de cada sala, ruido de señal, hora y REC
class Cctv {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; private acum = 1; private turno = 0; private ruido: HTMLCanvasElement[] = [];
  constructor() {
    ({ c: this.c, g: this.g } = lienzo(512, 400)); this.tex = texturaDe(this.c);
    for (let k = 0; k < 3; k++) { const { c, g } = lienzo(128, 100); const d = g.createImageData(128, 100); for (let i = 0; i < d.data.length; i += 4) { const v = 20 + Math.random() * 45; d.data[i] = v * 0.8; d.data[i + 1] = v; d.data[i + 2] = v * 0.9; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); this.ruido.push(c); }
  }
  actualizar(dt: number, t: number) {
    this.acum += dt; if (this.acum < 0.12) return; this.acum = 0;
    const { g } = this; const W = 512, H = 400, w = W / 2, h = H / 2;
    const salas = mundo.salas().filter(s => s.tipo !== 'camara');
    const repos = salas.filter(s => s.tipo === 'repo' || s.tipo === 'coordinacion');
    if (Math.floor(t / 6) !== this.turno) this.turno = Math.floor(t / 6);
    const vistas = [salas.find(s => s.tipo === 'puerta'), salas.find(s => s.tipo === 'puente'), repos[this.turno % Math.max(1, repos.length)], repos[(this.turno + 1) % Math.max(1, repos.length)]];
    vistas.forEach((s, k) => {
      const x = (k % 2) * w, y = Math.floor(k / 2) * h;
      g.drawImage(this.ruido[(Math.floor(t * 8) + k) % 3], x, y, w, h);
      g.fillStyle = 'rgba(10,20,16,0.45)'; g.fillRect(x, y, w, h);
      const col = s ? COLOR_ESTADO[s.estado] : '#555';
      // la sala, en silueta: el corte con su suelo y el piloto de su estado
      g.strokeStyle = 'rgba(200,230,210,0.5)'; g.lineWidth = 2; g.strokeRect(x + 30, y + 52, w - 60, h - 96);
      g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.arc(x + w - 46, y + 72, 9, 0, 7); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#d8efe0'; g.font = `600 18px ${FUENTES.mono}`; g.textAlign = 'left';
      g.fillText(`CAM 0${k + 1}`, x + 10, y + 24);
      g.font = `700 20px ${FUENTES.mono}`; g.fillText((s?.nombre ?? 'SIN SEÑAL').slice(0, 18).toUpperCase(), x + 40, y + h - 66 + 6);
      g.fillStyle = col; g.font = `600 16px ${FUENTES.mono}`; g.fillText(s ? TEXTO_ESTADO[s.estado] : '', x + 40, y + h - 44 + 6);
      if (Math.sin(t * 4) > 0) { g.fillStyle = '#ff3a2a'; g.beginPath(); g.arc(x + w - 52, y + 18, 6, 0, 7); g.fill(); g.fillStyle = '#ffb0a0'; g.font = `600 14px ${FUENTES.mono}`; g.fillText('REC', x + w - 42, y + 23); }
    });
    g.fillStyle = '#0a0d0c'; g.fillRect(w - 2, 0, 4, H); g.fillRect(0, h - 2, W, 4);
    const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    g.fillStyle = '#d8efe0'; g.font = `600 16px ${FUENTES.mono}`; g.textAlign = 'right'; g.fillText(hora, W - 10, H - 10);
    g.fillStyle = 'rgba(0,0,0,0.22)'; for (let yy = 0; yy < H; yy += 3) g.fillRect(0, yy, W, 1);
    this.tex.needsUpdate = true;
  }
}
