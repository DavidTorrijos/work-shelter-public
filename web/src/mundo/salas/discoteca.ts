// La discoteca del refugio («Búnker»), en la planta de ocio: la música para currar. Lo que suena es lo que se pone en
// Spotify, dentro del juego (vivo.musica, ver ui/Discoteca.tsx): la pantalla LED del fondo enseña la carátula y el tema, los platos giran, la pista de
// baile se enciende a ritmo, la bola de espejos reparte puntos de luz por la sala y los altavoces laten. Sin música,
// la sala se queda en penumbra de local cerrado: la bola quieta, la pista apagada y el rótulo de neón parpadeando.
// El ritmo sale de `pulsoMusica('discoteca')` (audio/musica.ts: la música propia de la sala, o Spotify); si suena Spotify
// y el pulso no dice nada, 118 golpes por minuto (Spotify web no cuenta el tempo del tema). En la pista bailan unos robots
// chiquitines (bailarines.ts).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { colocar, R } from '../../motor/assets';
import { cartel, PanelSala, lienzo, texturaDe, FUENTES, PantallaFosforo, partirPorPalabras } from '../../motor/texturas';
import { cartelEnPared, mancha, caja, materialAcero, apagarParedes, superficie, mundo, ALTO, type Contexto } from './comun';
import { superponerPantalla } from '../util3d';
import { vivo } from '../../red/cliente';
import type { EstadoMusica } from '@shared/protocolo';
import { pulsoMusica } from '../../audio/musica';
import { montarBailarines, type Ritmo } from './bailarines';

const BPM = 118;
const NEON = ['#ff3fb4', '#3fe0ff', '#ffb347', '#9b5bff'];
const musica = (): EstadoMusica | null => vivo.get().musica;
const sonando = () => musica()?.estado === 'sonando';
// el pulso de la sala: lo que diga el motor de audio y, si no dice nada pero suena Spotify, el tempo fijo
let relojSpotify = 0;
function ritmo(dt = 0): Ritmo {
  const p = pulsoMusica('discoteca');
  if (p.sonando) return { sonando: true, bpm: p.bpm || BPM, pulso: p.golpe + p.fase, energia: p.energia };
  if (sonando()) { relojSpotify += dt * BPM / 60; return { sonando: true, bpm: BPM, pulso: relojSpotify, energia: 0.7 }; }
  return { sonando: false, bpm: BPM, pulso: relojSpotify, energia: 0 };
}
let ritmoSala: Ritmo = ritmo();
// golpe de bombo: 1 justo en el golpe y se apaga enseguida
const golpe = () => Math.exp(-(ritmoSala.pulso % 1) * 5);

// ---------------------------------------------------------------- pantalla LED: carátula, tema y ecualizador
class PantallaDJ {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture;
  private caratula: HTMLImageElement | null = null; private urlCaratula = ''; private clave = ''; private reloj = 0;
  constructor() { ({ c: this.c, g: this.g } = lienzo(1024, 448)); this.tex = texturaDe(this.c); this.dibujar(0); }
  actualizar(dt: number, t: number) {
    const m = musica();
    const url = m?.pista?.caratula ?? '';
    if (url !== this.urlCaratula) {
      this.urlCaratula = url; this.caratula = null;
      if (url) { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { if (this.urlCaratula === url) { this.caratula = im; this.clave = ''; } }; im.src = url; }
    }
    // mientras suena, a 12 imágenes por segundo (el ecualizador); si no, solo cuando cambia algo
    this.reloj -= dt;
    const k = [m?.estado, m?.pista?.titulo, m?.pista?.artista, !!this.caratula, ritmoSala.sonando].join('|');
    if (sonando() ? this.reloj <= 0 : k !== this.clave) { this.reloj = 1 / 12; this.clave = k; this.dibujar(t); }
  }
  dibujar(t: number) {
    const { g } = this; const W = 1024, H = 448; const m = musica(); const p = m?.pista; const vivoYa = m?.estado === 'sonando';
    g.fillStyle = '#05040a'; g.fillRect(0, 0, W, H);
    if (!p) {
      // local cerrado: el logotipo del club
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = NEON[0]; g.shadowBlur = 30; g.fillStyle = '#ffd1ee'; g.font = `800 150px ${FUENTES.titulo}`; g.fillText('BÚNKER', W / 2, H / 2 - 30);
      g.shadowColor = NEON[1]; g.shadowBlur = 16; g.fillStyle = '#bff6ff'; g.font = `600 40px ${FUENTES.rotulo}`;
      g.fillText(ritmoSala.sonando ? 'EN DIRECTO · PINCHA LA CASA' : 'CERRADO · PON MÚSICA EN LA CABINA', W / 2, H / 2 + 90);
      g.shadowBlur = 0; g.textAlign = 'left';
    } else {
      const L = 384, x0 = 32, y0 = 32;
      if (this.caratula) g.drawImage(this.caratula, x0, y0, L, L);
      else { g.fillStyle = '#1b1426'; g.fillRect(x0, y0, L, L); g.fillStyle = NEON[0]; g.font = `800 220px ${FUENTES.titulo}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♫', x0 + L / 2, y0 + L / 2); g.textAlign = 'left'; }
      const xt = x0 + L + 40, an = W - xt - 32;
      g.textBaseline = 'top';
      g.fillStyle = vivoYa ? NEON[2] : '#8c8496'; g.font = `600 30px ${FUENTES.mono}`; g.fillText(vivoYa ? '● SONANDO' : '❚❚ EN PAUSA', xt, 40);
      g.shadowColor = NEON[0]; g.shadowBlur = vivoYa ? 18 : 0; g.fillStyle = '#fff0fa'; g.font = `800 64px ${FUENTES.titulo}`;
      partirPorPalabras(g, p.titulo, an, 2).forEach((l, i) => g.fillText(l, xt, 92 + i * 68));
      g.shadowBlur = 0; g.fillStyle = '#bff6ff'; g.font = `600 36px ${FUENTES.rotulo}`;
      g.fillText(partirPorPalabras(g, p.artista, an, 1)[0] ?? '', xt, 240);
      // ecualizador de barras a ritmo (de adorno: la página de Spotify no comparte el sonido)
      const n = 18, bw = an / n, base = 410;
      for (let i = 0; i < n; i++) {
        const h = vivoYa ? 18 + Math.abs(Math.sin(t * (2.1 + i * 0.37) + i * 1.7)) * 70 * (0.55 + 0.45 * golpe()) * (1 - i / n * 0.45) : 6;
        g.fillStyle = NEON[i % 2 ? 1 : 0]; g.globalAlpha = 0.9; g.fillRect(xt + i * bw + 3, base - h, bw - 6, h);
      }
      g.globalAlpha = 1;
    }
    // rejilla de píxeles de la pantalla LED
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1); for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
    this.tex.needsUpdate = true;
  }
}

// rótulo de neón (texto con halo sobre negro, sumado a la escena: brilla con el bloom)
export function texturaNeon(texto: string, sub: string, color: string, w = 1024, h = 300) {
  const { c, g } = lienzo(w, h);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let tl = h * 0.62; g.font = `800 ${tl}px ${FUENTES.titulo}`; while (g.measureText(texto).width > w * 0.9 && tl > 40) { tl -= 6; g.font = `800 ${tl}px ${FUENTES.titulo}`; }
  for (const [blur, alfa] of [[40, 0.9], [16, 1], [0, 1]] as const) { g.shadowColor = color; g.shadowBlur = blur; g.globalAlpha = alfa; g.fillStyle = blur ? color : '#fff4fb'; g.fillText(texto, w / 2, sub ? h * 0.4 : h / 2); }
  if (sub) { g.shadowBlur = 12; g.shadowColor = '#3fe0ff'; g.fillStyle = '#d6fbff'; g.font = `600 ${h * 0.16}px ${FUENTES.rotulo}`; g.fillText(sub, w / 2, h * 0.84); }
  return texturaDe(c);
}

// altavoz de cabina: caja lacada con dos conos que laten
function altavoz(g: THREE.Group, x: number, zB: number, alto: number, conos: THREE.Object3D[]) {
  const cuerpo = new THREE.Mesh(new RoundedBoxGeometry(0.95, alto, 0.7, 3, 0.05), new THREE.MeshStandardMaterial({ color: '#141316', roughness: 0.45, metalness: 0.2 }));
  cuerpo.position.set(x, alto / 2, zB + 0.75); cuerpo.castShadow = true; cuerpo.receiveShadow = true; g.add(cuerpo);
  const goma = new THREE.MeshStandardMaterial({ color: '#0a0a0b', roughness: 0.85 });
  const membrana = new THREE.MeshStandardMaterial({ color: '#2a2930', roughness: 0.6, metalness: 0.15 });
  const aro = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.35, metalness: 0.8 });
  const perfil = [new THREE.Vector2(0.02, -0.05), new THREE.Vector2(0.12, -0.035), new THREE.Vector2(0.26, -0.01), new THREE.Vector2(0.3, 0)];
  for (const [y, r] of [[alto * 0.68, 0.34], [alto * 0.3, 0.38]] as const) {
    const cono = new THREE.Group(); cono.position.set(x, y, zB + 1.105); cono.userData.estatico = false;
    const m = new THREE.Mesh(new THREE.LatheGeometry(perfil.map(v => v.clone().multiplyScalar(r / 0.3)), 28), membrana); m.rotation.x = Math.PI / 2; cono.add(m);
    const c = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), goma); c.rotation.x = Math.PI / 2; c.position.z = -0.03; cono.add(c);
    const a = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.025, 8, 32), aro); a.position.z = 0.005; g.add(a); a.position.copy(cono.position);
    g.add(cono); conos.push(cono);
  }
}

export async function amueblarDiscoteca(ctx: Contexto) {
  const { g, v, zB, K, P, semilla } = ctx;
  apagarParedes(g, 0.4, 0.55);   // un club: las paredes casi no se ven, brilla lo que tiene que brillar

  // ---- pantalla LED al fondo, con su marco
  const pantalla = new PantallaDJ();
  const YP = 2.6;
  g.add(caja(4.9, 2.25, 0.12, materialAcero('#121115'), 0, YP, zB + 0.3));
  const led = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 2.06), new THREE.MeshBasicMaterial({ map: pantalla.tex, color: new THREE.Color('#ffffff').multiplyScalar(1.15), toneMapped: false }));
  led.position.set(0, YP, zB + 0.37); g.add(led);

  // ---- cabina: mostrador oscuro, dos platos, mesa de mezclas y los cascos
  const xs = [-0.65, 0.65];
  const yCab = 0.95;   // a la altura de la cintura del DJ: se le ve pinchar
  const mostrador = await colocar(g, R.cocina('kitchencounter_straight_B'), { pos: [0, 0, zB + 1.15], alto: yCab, propios: true });
  { const t = mostrador.userData.tam as THREE.Vector3; mostrador.scale.set(2.7 / t.x, 1, 0.62 / t.z);
    mostrador.traverse((n: any) => { if (n.isMesh) { n.material.color.multiplyScalar(0.12).lerp(new THREE.Color('#150f1a'), 0.7); n.material.roughness = 0.45; n.material.metalness = 0.4; } }); }
  const yTablero = superficie(mostrador, g, 0.9, zB + 1.15) ?? yCab;   // el tablero, medido: platos y mesa de mezclas, apoyados
  // frente de la cabina: franja de neón que late
  const franja = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON[0]).multiplyScalar(2), toneMapped: false }));
  franja.position.set(0, yCab - 0.12, zB + 1.47); franja.userData.estatico = false; g.add(franja);
  const platos: THREE.Object3D[] = [];
  const texPlato = (() => { const { c, g: x } = lienzo(256, 256); const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#2a2a2e'); gr.addColorStop(1, '#0b0b0d'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(255,255,255,0.06)'; for (let r = 40; r < 126; r += 4) { x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.stroke(); } x.fillStyle = '#e0952f'; x.beginPath(); x.arc(128, 128, 38, 0, Math.PI * 2); x.fill(); x.fillStyle = '#222'; x.beginPath(); x.arc(128, 128, 5, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff3'; x.fillRect(124, 92, 8, 26); return texturaDe(c); })();
  for (const x of xs) {
    g.add(caja(0.62, 0.07, 0.5, materialAcero('#2b2a2e'), x, yTablero + 0.035, zB + 1.1));
    const plato = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 40), [new THREE.MeshStandardMaterial({ color: '#111' }), new THREE.MeshStandardMaterial({ map: texPlato, roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: '#111' })]);
    plato.position.set(x - 0.05, yTablero + 0.08, zB + 1.1); plato.userData.estatico = false; g.add(plato); platos.push(plato);
    const brazo = caja(0.025, 0.02, 0.32, materialAcero('#bdb6a8'), x + 0.2, yTablero + 0.1, zB + 1.08); brazo.rotation.y = 0.35; g.add(brazo);
  }
  // mesa de mezclas: pilotos que bailan con el ritmo
  g.add(caja(0.34, 0.09, 0.42, materialAcero('#1d1c20'), 0, yTablero + 0.045, zB + 1.1));
  const pilotos: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.035), new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON[i % 3]).multiplyScalar(1.6), toneMapped: false })); p.position.set(-0.09 + (i % 3) * 0.09, yTablero + 0.095, zB + 1.0 + Math.floor(i / 3) * 0.18); p.userData.estatico = false; g.add(p); pilotos.push(p); }
  ctx.sobre(mostrador, R.mueble('lamp_desk_headphones'), { pos: [1.18, 0, zB + 1.32], escala: K * 0.55, rot: -0.6 });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(-1.4, zB + 0.84), new THREE.Vector2(1.4, zB + 1.5)));   // el mostrador; detrás, el sitio del DJ
  // el puesto: la cabina. El DJ pincha de pie detrás de ella, de cara a la pista (y a la cámara): se le ven las manos
  // en los platos
  ctx.sala.puntos.push({ id: 'platos', tipo: 'puesto', dePie: true, mesa: +yTablero.toFixed(3), pos: new THREE.Vector3(0, 0, zB + 0.6), giro: 0, clip: 'Working_B' });
  // la pieza: la mesa de mezclas, desde el costado de la cabina: se saca un disco de la caja, se le da al cue (la franja y
  // los pilotos destellan) o se celebra el drop
  let cue = 0; const darCue = () => { cue = 1; };
  const discos = P(R.recurso('Containers_Box_Small'), { pos: [2.0, 0, zB + 0.6], ancho: 0.5, rot: 0.2, propios: true });
  discos.then(o => o.traverse((n: any) => { if (n.isMesh) n.material.color.multiplyScalar(0.35).lerp(new THREE.Color('#2a1630'), 0.5); }));
  for (let k = 0; k < 6; k++) ctx.sobre(discos, R.mueble('book_single'), { pos: [1.86 + k * 0.055, 0, zB + 0.6], alto: 0.3, rot: Math.PI / 2 + (k % 2) * 0.08, propios: true }, { desde: 2 })
    .then(o => o.traverse((n: any) => { if (n.isMesh) n.material.color.set(NEON[k % NEON.length]).multiplyScalar(0.35); }));
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(1.7, zB), new THREE.Vector2(2.35, zB + 0.95)));
  ctx.sala.puntos.push({ id: 'mezclas', tipo: 'pieza', pos: new THREE.Vector3(1.75, 0, zB + 1.45), giro: -Math.PI / 2 - 0.35,
    acciones: [{ clip: 'PickUp' }, { clip: 'Interact', alHacer: darCue }, { clip: 'Cheering', alHacer: darCue }] });

  // ---- altavoces a los lados de la pantalla
  const conos: THREE.Object3D[] = [];
  altavoz(g, -3.05, zB, 1.9, conos); altavoz(g, 3.05, zB, 1.9, conos);
  for (const x of [-3.05, 3.05]) ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(x - 0.5, zB), new THREE.Vector2(x + 0.5, zB + 1.15)));

  // ---- pista de baile: baldosas de cristal que se encienden a ritmo
  const nx = 8, nz = 3, lado = 0.62, x0 = -((nx - 1) * lado) / 2, z0 = zB + 1.95;
  const baldosas: { m: THREE.MeshBasicMaterial; i: number; k: number }[] = [];
  const base = new THREE.Mesh(new THREE.BoxGeometry(nx * lado + 0.08, 0.03, nz * lado + 0.08), materialAcero('#0c0b0e')); base.position.set(0, 0.015, z0 + ((nz - 1) * lado) / 2); g.add(base);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const m = new THREE.MeshBasicMaterial({ color: '#1a1420', toneMapped: false });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(lado - 0.05, lado - 0.05), m);
    b.rotation.x = -Math.PI / 2; b.position.set(x0 + i * lado, 0.034, z0 + k * lado); b.userData.estatico = false; g.add(b);
    baldosas.push({ m, i, k });
  }

  // ---- bola de espejos colgada del techo, con los puntos de luz que reparte
  const facetas = new THREE.IcosahedronGeometry(0.24, 3).toNonIndexed();
  const col: number[] = []; for (let f = 0; f < facetas.attributes.position.count / 3; f++) { const l = 0.45 + Math.random() * 0.55; for (let j = 0; j < 3; j++) col.push(l, l, l * 1.05); }
  facetas.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); facetas.computeVertexNormals();
  const matBola = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.18, flatShading: true, emissive: '#3a3448', emissiveIntensity: 0.6 });
  const bola = new THREE.Mesh(facetas, matBola); const YB = ALTO - 0.52, ZBola = 0.35;   // por encima de la pantalla, sin taparla
  bola.position.set(0, YB, ZBola); bola.userData.estatico = false; g.add(bola);
  g.add(caja(0.012, ALTO - YB - 0.3, 0.012, materialAcero('#777'), 0, (ALTO + YB + 0.3) / 2, ZBola));
  const nPuntos = 70;
  const dirs = Array.from({ length: nPuntos }, () => ({ th: Math.random() * Math.PI * 2, ph: -0.15 - Math.random() * 1.1, c: new THREE.Color(NEON[Math.floor(Math.random() * 3)]) }));
  const geoP = new THREE.BufferGeometry(); const posP = new Float32Array(nPuntos * 3); const colP = new Float32Array(nPuntos * 3);
  dirs.forEach((d, i) => d.c.toArray(colP, i * 3));
  geoP.setAttribute('position', new THREE.BufferAttribute(posP, 3)); geoP.setAttribute('color', new THREE.BufferAttribute(colP, 3));
  const texPunto = (() => { const { c, g: x } = lienzo(64, 64); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return texturaDe(c); })();
  const matP = new THREE.PointsMaterial({ size: 0.3, map: texPunto, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const puntosLuz = new THREE.Points(geoP, matP); puntosLuz.userData.estatico = false; puntosLuz.frustumCulled = false; g.add(puntosLuz);
  const ancho = ctx.ancho / 2 - 0.05;

  // ---- a la izquierda: la gramola (el ordenador con Spotify) bajo el rótulo de neón
  const gramola = await colocar(g, R.sf('Props_Computer'), { pos: [-4.55, 0, zB + 0.75], alto: 1.75, rot: 0.3, estatico: false, variante: v });
  const pantGramola = new PantallaFosforo(256, 256, '#ff7ad1'); pantGramola.velocidad = 14; pantGramola.escribir(['GRAMOLA', '', 'busca y elige', 'en Spotify', '', '[E] abrir']);
  superponerPantalla(gramola, /^Black$/, pantGramola.tex, { brillo: 1.3, margen: 0.9 }); ctx.sala.pantallas.push(pantGramola);
  const matNeon = new THREE.MeshBasicMaterial({ map: texturaNeon('BÚNKER', 'CLUB · DESDE EL GRAN APAGÓN', NEON[0]), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.65), matNeon); neon.position.set(-4.6, 3.05, zB + 0.36); neon.userData.estatico = false; g.add(neon);
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(-5.6, zB), new THREE.Vector2(-3.9, zB + 1.1)));

  // ---- a la derecha: rincón para descansar los oídos
  colocar(g, R.mueble('couch_pillows'), { pos: [4.65, 0, zB + 0.62], escala: K * 1.0, propios: true }).then(o => o.traverse((n: any) => {
    if (n.isMesh) { const c = n.material.color as THREE.Color; const hsl = c.getHSL({ h: 0, s: 0, l: 0 }); n.material.color = new THREE.Color().setHSL(0.94, 0.6, hsl.l * 0.3 + 0.04); n.material.roughness = 0.9; }
  }));
  const mesita = P(R.mueble('table_low'), { pos: [4.65, 0, zB + 1.6], escala: K * 0.9 });
  ctx.sobre(mesita, R.mueble('cup'), { pos: [4.45, 0, zB + 1.55], escala: K * 0.9 });
  ctx.sobre(mesita, R.mueble('cup'), { pos: [4.9, 0, zB + 1.68], escala: K * 0.9, rot: 1.2 });
  P(R.casa('Light_Floor3'), { pos: [5.65, 0, zB + 0.5], alto: 1.9 });
  ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(3.7, zB), new THREE.Vector2(5.8, zB + 2.0)));
  cartelEnPared(g, cartel(['SE PINCHA', 'LO QUE', 'COMPILA'], 'CLUB BÚNKER · WORK-SHELTER', '#f2d6ea', '#5a1a48', 'rayo', semilla), 4.6, 2.75, 0.56, 0.78, zB + 0.33, -0.02);

  // ---- luz: focos de colores sobre la pista que laten con la música; la sala, en penumbra
  const focos = [
    { tipo: 'foco' as const, pos: new THREE.Vector3(-2.2, ALTO - 0.3, 1.2), objetivo: new THREE.Vector3(-0.8, 0, zB + 2.3), intensidad: 0, color: new THREE.Color(NEON[0]), angulo: 0.45, penumbra: 0.4, distancia: 8, prioridad: 1.5 },
    { tipo: 'foco' as const, pos: new THREE.Vector3(2.2, ALTO - 0.3, 1.2), objetivo: new THREE.Vector3(0.8, 0, zB + 2.3), intensidad: 0, color: new THREE.Color(NEON[1]), angulo: 0.45, penumbra: 0.4, distancia: 8, prioridad: 1.5 },
  ];
  ctx.sala.anclas.push(...focos);
  ctx.sala.anclas.push({ tipo: 'punto', pos: new THREE.Vector3(0, 1.6, zB + 1.0), intensidad: 2.5, color: new THREE.Color('#ff7ad1'), distancia: 4, prioridad: 0.5 });
  // (ninguna en el centro: ahí cuelga la bola)
  ctx.lamparas = [{ x: -3.9, z: 0.5, o: { intensidad: 38, color: '#ff8ad8', corta: true } }, { x: -1.7, z: 1.2, o: { intensidad: 50, sombra: true, corta: true } }, { x: 3.9, z: 0.5, o: { intensidad: 38, color: '#8ae4ff', corta: true } }];

  const panel = new PanelSala(); panel.titulo = 'PISTA'; panel.color = '#ff7ad1'; ctx.panel = panel;
  mancha(g, 2.4, 1.2, 1.0, semilla);
  ctx.sala.zonasPaseo = [[-2.3, 2.3]];
  ctx.vapor = { pos: new THREE.Vector3(-1.6, 0.25, zB + 1.7), dir: new THREE.Vector3(0.6, 0.15, 0.4) };   // máquina de humo a ras de suelo

  // ---- los robots chiquitines que bailan en la pista: a los lados de la cabina y por delante, dejando ver al DJ y los
  // platos (el centro, libre); no son obstáculos y se apartan del Supervisor
  const baile = montarBailarines(g, [[-2.05, zB + 2.1], [-1.4, zB + 2.9], [1.4, zB + 2.9], [2.05, zB + 2.1], [2.75, zB + 3.05]], () => ritmoSala, () => mundo.supervisor());
  (ctx.sala.userData as any).bailarines = baile.bailarines;

  // ---- vida: todo a ritmo mientras suena
  const dir = new THREE.Vector3(); let marcha = 0, firmaPanel = '';
  ctx.alActualizar((dt, t) => {
    ritmoSala = ritmo(dt);
    const s = ritmoSala.sonando;
    marcha = THREE.MathUtils.damp(marcha, s ? 1 : 0, 2.5, dt);   // la sala «arranca» y se apaga con fundido
    const b = golpe() * marcha * (0.75 + 0.25 * ritmoSala.energia);
    baile.actualizar(dt);
    pantalla.actualizar(dt, t);
    for (const p of platos) p.rotation.y -= dt * 3.49 * marcha;   // 33⅓ rpm
    for (const c of conos) c.scale.setScalar(1 + b * 0.06);
    pilotos.forEach((p, i) => { p.visible = marcha < 0.1 ? i === 0 : Math.sin(t * 7 + i * 1.9) + b > 0.2; });
    cue = Math.max(0, cue - dt * 1.5);
    (franja.material as THREE.MeshBasicMaterial).color.set(NEON[0]).multiplyScalar(0.6 + 1.6 * (0.3 + b) * marcha + 0.25 + cue * 1.5);
    if (cue > 0) pilotos.forEach((p, i) => { p.visible = Math.sin(t * 30 + i) > -0.2; });
    // la pista: ondas de color que salen del centro, con el golpe más brillante
    const compas = Math.floor(ritmoSala.pulso);   // (golpes: los colores cambian en cada uno)
    for (const bd of baldosas) {
      if (marcha < 0.02) { bd.m.color.set('#1a1420'); continue; }
      const onda = Math.sin(Math.hypot(bd.i - (nx - 1) / 2, bd.k * 1.4) * 0.9 - t * 4.2);
      const tono = NEON[(bd.i + bd.k + compas) % 3];
      bd.m.color.set(tono).multiplyScalar((0.15 + Math.max(0, onda) * 0.9 + b * 0.6) * marcha);
    }
    // la bola gira y los puntos de luz barren las paredes y el suelo
    bola.rotation.y += dt * 0.5 * (0.15 + marcha);
    matBola.emissiveIntensity = 0.35 + marcha * (0.4 + b * 0.8);
    matP.opacity = 0.85 * marcha;
    if (marcha > 0.01) {
      dirs.forEach((d, i) => {
        const th = d.th + bola.rotation.y;
        dir.set(Math.cos(d.ph) * Math.sin(th), Math.sin(d.ph), -Math.cos(d.ph) * Math.cos(th));
        // donde corta el rayo: la pared del fondo, el suelo o las paredes de los lados (lo primero que encuentre)
        let k = Infinity;
        if (dir.z < 0) k = Math.min(k, (zB + 0.42 - ZBola) / dir.z);
        if (dir.y < 0) k = Math.min(k, (0.05 - YB) / dir.y);
        if (dir.x !== 0) k = Math.min(k, ((dir.x > 0 ? ancho : -ancho) - 0) / dir.x);
        const visible = Number.isFinite(k) && k > 0 && ZBola + dir.z * k < 2.2;
        posP[i * 3] = visible ? dir.x * k : 0; posP[i * 3 + 1] = visible ? YB + dir.y * k : -50; posP[i * 3 + 2] = visible ? ZBola + dir.z * k : 0;
      });
      geoP.attributes.position.needsUpdate = true;
    }
    // focos de colores: laten con el golpe y cambian de color cada cuatro compases
    focos.forEach((f, i) => { f.intensidad = marcha * (35 + b * 70); f.color.set(NEON[(i + Math.floor(compas / 4)) % NEON.length]); });
    // el neón parpadea como los de verdad (más de noche, con el local cerrado)
    const fallo = Math.sin(t * 13.7) * Math.sin(t * 3.1) > (s ? 0.97 : 0.85);
    matNeon.opacity = fallo ? 0.25 : 0.9 + 0.1 * Math.sin(t * 50);
    // el panel de la sala: lo que suena
    const m = musica();
    const lineas = m?.pista ? [`> ${m.pista.titulo}`.slice(0, 34), `> ${m.pista.artista}`.slice(0, 34), m.estado === 'sonando' ? '> sonando' : '> en pausa'] : ['> equipo apagado', '> pon música en la cabina'];
    const f = lineas.join('|'); if (f !== firmaPanel) { firmaPanel = f; panel.lineas = lineas; panel.estado = m?.estado === 'sonando' ? '♫ EN DIRECTO' : 'CERRADO'; }
  });
}
