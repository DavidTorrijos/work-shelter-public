// El cielo de la calle sigue la hora real del Mac: noche con luna y estrellas, alba rosada, día de polvo, atardecer
// naranja, y transiciones suaves (todo sale de la altura del sol, calculada con las fórmulas astronómicas de SunCalc,
// sin red). Controla también la luz propia de la superficie y de lo que rodea la entrada (las lámparas del refugio no
// llegan arriba): fría y oscura de noche, rosada al alba, neutra de día, naranja al atardecer; y de noche enciende los
// faroles, la farola (con su poza de luz en el suelo) y el piloto de la antena. El interior no se toca.
//
// Coste: la astronomía y las mezclas de color van 4 veces por segundo; por fotograma solo se sigue a la cámara (unas
// pocas asignaciones). Los materiales de fuera se registran con `exterior(mat, papel)` y se retocan en sitio (colores y
// emisivos: uniformes, sin recompilar); la superficie y el entorno se fusionan por material, así que un cambio llega a
// todas sus mallas.
//
// QA: `?hora=HH:MM` (o `?hora=2026-06-21T21:30`) fija la hora; en la consola, `__cielo.fijar('06:40')`,
// `__cielo.fijar(null)` (vuelve al reloj real), `__cielo.avanzar(30)` (minutos) y `__cielo.info()` (altura del sol,
// salida y puesta de hoy, fase de la luna).
import * as THREE from 'three';

// ---- astronomía: versión mínima de SunCalc, Copyright (c) 2014 Vladimir Agafonkin, BSD-2-Clause
// (LICENSES/suncalc-BSD-2-Clause.txt)
const RAD = Math.PI / 180, DIA_MS = 86400000, J1970 = 2440588, J2000 = 2451545, OBLICUIDAD = RAD * 23.4397;
// Sin pedir la ubicación: una latitud templada y la longitud que corresponde a la zona horaria (la hora estándar, sin
// horario de verano, marca el meridiano: UTC+1 → 15° E), así que el mediodía solar cae hacia las 12 del reloj.
// Para afinarlo: ?lat=…&lon=… en la URL.
const parametro = (n: string) => { try { const v = parseFloat(new URLSearchParams(location.search).get(n) ?? ''); return Number.isFinite(v) ? v : null; } catch { return null; } };
const LAT = parametro('lat') ?? 40;
const LON = parametro('lon') ?? -Math.max(new Date(2026, 0, 1).getTimezoneOffset(), new Date(2026, 6, 1).getTimezoneOffset()) / 4;
const dias = (f: Date) => f.valueOf() / DIA_MS - 0.5 + J1970 - J2000;
const ascension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(OBLICUIDAD) - Math.tan(b) * Math.sin(OBLICUIDAD), Math.cos(l));
const declinacion = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(OBLICUIDAD) + Math.cos(b) * Math.sin(OBLICUIDAD) * Math.sin(l));
const sidereo = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;
function coordSol(d: number) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  return { dec: declinacion(L, 0), ra: ascension(L, 0) };
}
function coordLuna(d: number) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: ascension(l, b), dec: declinacion(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
// acimut desde el sur, positivo hacia el oeste; altura sobre el horizonte (radianes)
function posicion(f: Date, c: { ra: number; dec: number }) {
  const d = dias(f), phi = RAD * LAT, H = sidereo(d, RAD * -LON) - c.ra;
  return {
    acimut: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)),
    altura: Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)),
  };
}
const solEn = (f: Date) => posicion(f, coordSol(dias(f)));
const lunaEn = (f: Date) => posicion(f, coordLuna(dias(f)));
/** fracción iluminada, ángulo de fase (0 llena, π nueva) y si crece (iluminada por la derecha, vista desde el norte) */
function faseLuna(f: Date) {
  const d = dias(f), s = coordSol(d), m = coordLuna(d), DS = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(DS * Math.sin(phi), m.dist - DS * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { fraccion: (1 + Math.cos(inc)) / 2, inc, crece: ang < 0 };
}
/** salida y puesta del sol de ese día (hora local, «HH:MM»), buscando el cruce del borde del disco por el horizonte */
function salidaPuesta(f: Date) {
  const dia = new Date(f); dia.setHours(0, 0, 0, 0);
  const alt = (min: number) => solEn(new Date(dia.valueOf() + min * 60000)).altura / RAD + 0.833;
  let sale = '', pone = '';
  for (let m = 0; m < 1440; m += 2) {
    const a = alt(m), b = alt(m + 2);
    // hora de reloj del cruce (no minutos desde medianoche: el día del cambio de hora no coinciden)
    const hhmm = () => { const t = new Date(dia.valueOf() + (m + 2 * a / (a - b)) * 60000); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
    if (a < 0 && b >= 0) sale = hhmm(); else if (a >= 0 && b < 0) pone = hhmm();
  }
  return { sale, pone };
}

// ---- paletas por altura del sol (grados). Cielo: horizonte, bajo, medio y alto (sRGB). Luz de fuera: `albedo`
// multiplica el color de las piezas (compensa la luz direccional del refugio, que no cambia), `tinte` y `k` son el tono
// y la fuerza de su emisión propia
interface Clave { alt: number; cielo: [string, string, string, string]; sol: string; albedo: string; tinte: string; k: number; nubeLuz: string; nubeSombra: string }
const NOCHE: Clave = { alt: -15, cielo: ['#34405f', '#1f2846', '#11182e', '#080c1a'], sol: '#ff6a3a', albedo: '#3c4460', tinte: '#7088c4', k: 0.52, nubeLuz: '#2c3448', nubeSombra: '#141a28' };
const DIA: Clave = { alt: 24, cielo: ['#dccaa2', '#b6bdb2', '#78a2c4', '#5280b0'], sol: '#fff2d8', albedo: '#ffffff', tinte: '#fff0dc', k: 0.8, nubeLuz: '#f4ead8', nubeSombra: '#b8aa96' };
const MANANA: Clave[] = [
  NOCHE,
  { alt: -6, cielo: ['#8a6a7c', '#4e4a70', '#2c3054', '#161c36'], sol: '#ff7a6a', albedo: '#6a6278', tinte: '#a08cc4', k: 0.6, nubeLuz: '#6a5a78', nubeSombra: '#2a2a44' },
  { alt: 0, cielo: ['#f7a77c', '#d48a88', '#7c6a92', '#3a4068'], sol: '#ff9466', albedo: '#d0aca4', tinte: '#ffb0a4', k: 0.9, nubeLuz: '#ffb49a', nubeSombra: '#7a5a72' },
  { alt: 8, cielo: ['#f6c690', '#dcae94', '#9a9ca8', '#5a6a86'], sol: '#ffcc8a', albedo: '#f4e2cc', tinte: '#ffd0a8', k: 0.88, nubeLuz: '#ffdcb4', nubeSombra: '#a08a8a' },
  DIA,
];
const TARDE: Clave[] = [
  NOCHE,
  { alt: -6, cielo: ['#8a4e4a', '#523448', '#2c2440', '#141428'], sol: '#ff5a2a', albedo: '#6a5662', tinte: '#b07888', k: 0.6, nubeLuz: '#6a3c44', nubeSombra: '#261c2c' },
  { alt: 0, cielo: ['#f28a42', '#c05e3c', '#5e3640', '#26202e'], sol: '#ff7434', albedo: '#d8a88c', tinte: '#ff9c68', k: 1.0, nubeLuz: '#ff9a5a', nubeSombra: '#5a3034' },
  { alt: 8, cielo: ['#f4b472', '#d8925e', '#94706c', '#4e4c64'], sol: '#ffb460', albedo: '#f2d4b4', tinte: '#ffbc84', k: 0.92, nubeLuz: '#ffc488', nubeSombra: '#8a6458' },
  DIA,
];
const lin = (h: string) => new THREE.Color(h);   // THREE.Color convierte de sRGB a lineal
type ClaveLin = { alt: number; cielo: THREE.Color[]; sol: THREE.Color; albedo: THREE.Color; tinte: THREE.Color; k: number; nubeLuz: THREE.Color; nubeSombra: THREE.Color };
const aLin = (c: Clave): ClaveLin => ({ alt: c.alt, cielo: c.cielo.map(lin), sol: lin(c.sol), albedo: lin(c.albedo), tinte: lin(c.tinte), k: c.k, nubeLuz: lin(c.nubeLuz), nubeSombra: lin(c.nubeSombra) });
const MANANA_L = MANANA.map(aLin), TARDE_L = TARDE.map(aLin);
function mezclar(claves: ClaveLin[], alt: number, out: ClaveLin) {
  let i = 0; while (i < claves.length - 2 && alt > claves[i + 1].alt) i++;
  const a = claves[i], b = claves[i + 1];
  const t = THREE.MathUtils.smoothstep(alt, a.alt, b.alt);
  for (let j = 0; j < 4; j++) out.cielo[j].copy(a.cielo[j]).lerp(b.cielo[j], t);
  out.sol.copy(a.sol).lerp(b.sol, t); out.albedo.copy(a.albedo).lerp(b.albedo, t); out.tinte.copy(a.tinte).lerp(b.tinte, t);
  out.nubeLuz.copy(a.nubeLuz).lerp(b.nubeLuz, t); out.nubeSombra.copy(a.nubeSombra).lerp(b.nubeSombra, t);
  out.k = a.k + (b.k - a.k) * t;
}

// ---- materiales de fuera
/** suelo y piezas (polvo y óxido); `lejos`: colinas del fondo, con bruma del color del horizonte; `junto-luz`: lo que
 * alumbra la farola de noche; `farol`: el cristal de una lámpara (MeshBasic); `rotulo`: el cartel; `poza`: luz falsa
 * en el suelo (aditiva); `piloto`: luz roja que parpadea */
export type Papel = 'pieza' | 'lejos' | 'junto-luz' | 'farol' | 'rotulo' | 'poza' | 'piloto';
interface Registro { papel: Papel; color: THREE.Color; k: number; opacidad: number }
const registro = new Map<THREE.Material, Registro>();
const pilotos = new Set<THREE.Material>();
export function exterior<M extends THREE.Material>(mat: M, papel: Papel): M {
  if (!registro.has(mat)) { const m = mat as any; registro.set(mat, { papel, color: m.color?.clone() ?? new THREE.Color(), k: m.emissiveIntensity ?? 1, opacidad: m.opacity ?? 1 }); }
  if (papel === 'piloto') pilotos.add(mat);
  if (cieloActual) cieloActual.retocar(mat);
  return mat;
}
let cieloActual: Cielo | null = null;

const ALBEDO = 1.35;
const FAROL_APAGADO = lin('#4a3c2e'), FAROL_ENCENDIDO = lin('#ffc27a').multiplyScalar(3.2), LUZ_FAROLA = lin('#ffb060');
const PILOTO = lin('#ff3020');

const VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform vec3 uC0, uC1, uC2, uC3;
uniform vec2 uSol; uniform vec3 uSolColor; uniform float uSolR, uSolVis, uHalo, uBrillo;
uniform vec2 uLuna; uniform vec3 uLunaL; uniform float uLunaR, uLunaVis;
uniform vec3 uNubeLuz, uNubeSombra; uniform float uNubes, uTiempo, uEscala, uDesp;
varying vec2 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * ruido(p); p = p * 2.03 + vec2(17.1, 3.7); a *= 0.5; } return s; }
void main() {
  float h = vP.y;
  vec3 c = mix(uC0, uC1, smoothstep(0.0, 4.5, h));
  c = mix(c, uC2, smoothstep(4.5, 11.0, h));
  c = mix(c, uC3, smoothstep(11.0, 24.0, h));
  // resplandor del sol: halo cercano, velo ancho y una franja encendida en el horizonte bajo él
  vec2 d = (vP - uSol) / uEscala; float r = length(d);
  float halo = uHalo * (0.5 * exp(-r * 0.32) + 0.32 * exp(-r * 0.075));
  float franja = uHalo * 0.55 * exp(-abs(d.x) * 0.035) * exp(-h * 0.22);
  // polvo en suspensión: estratos alargados que se arrastran despacio
  vec2 q = vec2((vP.x + uDesp) * 0.022 + uTiempo * 0.0035, h * 0.2);
  float n = fbm(q + vec2(0.0, fbm(q * 0.7) * 0.6));
  float banda = smoothstep(2.5, 6.0, h) * (1.0 - smoothstep(15.0, 26.0, h));
  float nube = smoothstep(0.44, 0.78, n) * banda * uNubes;
  vec3 colNube = mix(uNubeSombra, uNubeLuz, smoothstep(0.5, 0.9, n)) + uSolColor * halo * 0.9;
  c += uSolColor * (halo + franja) * (1.0 - nube * 0.5);
  c = mix(c, colNube, nube * 0.75);
  // disco del sol: borde suave, centro más vivo que el borde y una corona en degradado que lo funde con el cielo (el
  // bloom lo abre). De día, pequeño y deslumbrante (uBrillo); junto al horizonte, más grande, naranja y velado
  float rr = r / uSolR;
  float disco = 1.0 - smoothstep(0.78, 1.08, rr);
  float corona = exp(-max(rr - 0.85, 0.0) * 2.4) * (1.0 - disco);
  float velo = 0.7 + 0.3 * smoothstep(0.0, 8.0, h);
  float vis = uSolVis * (1.0 - nube * 0.6);
  c += uSolColor * corona * (0.35 + 0.65 * uBrillo) * vis;
  c = mix(c, uSolColor * (1.9 + uBrillo * 1.6 + 1.2 * (1.0 - rr * rr)) * velo, disco * vis);
  // luna con su fase (esfera iluminada desde uLunaL), mares sutiles y su halo
  vec2 m = (vP - uLuna) / (uEscala * uLunaR); float rm = length(m);
  c += vec3(0.55, 0.62, 0.8) * 0.06 * exp(-rm * 0.9) * uLunaVis;
  if (rm < 1.02) {
    vec3 nn = vec3(m, sqrt(max(0.0, 1.0 - rm * rm)));
    float luz = smoothstep(-0.04, 0.14, dot(nn, uLunaL));
    float mar = fbm(m * 2.6 + 11.0);
    vec3 cara = vec3(0.92, 0.9, 0.84) * (0.68 + 0.42 * smoothstep(0.35, 0.7, mar)) * 1.7;
    vec3 oscura = c * 0.88;
    c = mix(c, mix(oscura, cara, luz), smoothstep(1.02, 0.97, rm) * uLunaVis);
  }
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const ALTO_CIELO = 60, ANCHO_CIELO = 260;

export class Cielo {
  grupo = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private estrellas: THREE.Points;
  private camara: THREE.PerspectiveCamera;
  private escena: THREE.Scene;
  private z: number;
  private fija: Date | null = null;
  private espera = 0;
  private t = 0;
  private parpadeo = 0;
  // estado calculado (4 veces por segundo)
  private mezcla: ClaveLin = aLin(NOCHE);
  private uSol = 0; private ySol = 0; private uLuna = 0; private yLuna = 0;
  private noche = 1; private lamparas = 1; private lunaLuz = 0;
  private altSol = 0; private altLuna = 0;
  private luna = { fraccion: 0, inc: 0, crece: true };
  private niebla = new THREE.Color('#0a0908'); private nieblaBase = new THREE.Color('#0a0908');

  /** `y`: altura de la calle (el borde inferior del cielo); `z`: plano del cielo, detrás de las colinas */
  constructor(motor: { camera: THREE.PerspectiveCamera; scene: THREE.Scene }, y: number, z = -40) {
    this.camara = motor.camera; this.escena = motor.scene; this.z = z;
    this.grupo.name = 'cielo'; this.grupo.position.set(0, y, z);
    const u = (v: any) => ({ value: v });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthWrite: false,
      uniforms: {
        uC0: u(new THREE.Color()), uC1: u(new THREE.Color()), uC2: u(new THREE.Color()), uC3: u(new THREE.Color()),
        uSol: u(new THREE.Vector2()), uSolColor: u(new THREE.Color()), uSolR: u(2.1), uSolVis: u(0), uHalo: u(0), uBrillo: u(1),
        uLuna: u(new THREE.Vector2()), uLunaL: u(new THREE.Vector3(0, 0, 1)), uLunaR: u(1.5), uLunaVis: u(0),
        uNubeLuz: u(new THREE.Color()), uNubeSombra: u(new THREE.Color()), uNubes: u(0.55), uTiempo: u(0), uEscala: u(1), uDesp: u(0),
      },
    });
    const geo = new THREE.PlaneGeometry(ANCHO_CIELO, ALTO_CIELO); geo.translate(0, ALTO_CIELO / 2, 0);
    const plano = new THREE.Mesh(geo, this.mat);
    // primero de todo y sin escribir profundidad: todo lo opaco lo tapa (las colinas ocultan el sol al salir)
    plano.renderOrder = -10; plano.frustumCulled = false;
    this.grupo.add(plano);
    this.estrellas = this.crearEstrellas(); this.grupo.add(this.estrellas);
    // reloj: ?hora=HH:MM fija la hora (QA)
    const q = new URLSearchParams(location.search).get('hora'); if (q) this.fija = Cielo.leer(q);
    cieloActual = this;
    (window as any).__cielo = {
      fijar: (h: string | null) => { this.fija = h == null ? null : Cielo.leer(h); this.calcular(); return this.info(); },
      avanzar: (min: number) => { this.fija = new Date(this.ahora().valueOf() + min * 60000); this.calcular(); return this.info(); },
      info: () => this.info(),
    };
    this.calcular();
  }

  /** «HH:MM» (hoy) o una fecha que entienda Date («2026-06-21T21:30») */
  static leer(h: string) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(h.trim());
    if (m) { const f = new Date(); f.setHours(+m[1], +m[2], 0, 0); return f; }
    const f = new Date(h); return isNaN(f.valueOf()) ? new Date() : f;
  }
  private ahora() { return this.fija ? new Date(this.fija) : new Date(); }

  info() {
    const f = this.ahora(), sp = salidaPuesta(f);
    return { hora: f.toLocaleString('es-ES'), sol: +(this.altSol / RAD).toFixed(1), salida: sp.sale, puesta: sp.pone, luna: +(this.altLuna / RAD).toFixed(1), iluminada: +this.luna.fraccion.toFixed(2), noche: +this.noche.toFixed(2), lamparas: +this.lamparas.toFixed(2), fija: !!this.fija };
  }

  private crearEstrellas() {
    const N = 520, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    let s = 4211; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (r() - 0.5) * ANCHO_CIELO * 0.62;
      pos[i * 3 + 1] = 5 + Math.pow(r(), 0.8) * 40;          // más arriba que junto al horizonte (allí el polvo las apaga)
      pos[i * 3 + 2] = -0.5;
      const b = 0.45 + Math.pow(r(), 3) * 1.4, tibia = r();
      const c = new THREE.Color(tibia < 0.2 ? '#ffd8b0' : tibia > 0.8 ? '#bcd0ff' : '#f0f0ff').multiplyScalar(b);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const p = new THREE.Points(geo, mat); p.frustumCulled = false; p.renderOrder = -9;
    return p;
  }

  // ---- 4 veces por segundo: astronomía, paletas y materiales
  private calcular() {
    const f = this.ahora();
    const sol = solEn(f), luna = lunaEn(f);
    this.altSol = sol.altura; this.altLuna = luna.altura;
    const alt = sol.altura / RAD;
    // mañana (sol al este, acimut < 0) o tarde: alba rosada o atardecer naranja; a mediodía y medianoche coinciden
    mezclar(sol.acimut < 0 ? MANANA_L : TARDE_L, alt, this.mezcla);
    const mz = this.mezcla, U = this.mat.uniforms;
    U.uC0.value.copy(mz.cielo[0]); U.uC1.value.copy(mz.cielo[1]); U.uC2.value.copy(mz.cielo[2]); U.uC3.value.copy(mz.cielo[3]);
    U.uSolColor.value.copy(mz.sol); U.uNubeLuz.value.copy(mz.nubeLuz); U.uNubeSombra.value.copy(mz.nubeSombra);
    // el sol cruza de izquierda (este) a derecha (oeste): se mira al sur. Altura comprimida para que quepa en la franja
    // de cielo que se ve (≈15 m sobre la calle en la vista general)
    const enX = (az: number) => THREE.MathUtils.clamp(az / (115 * RAD), -1, 1) * 0.8;
    // (raíz: sube deprisa al principio, para que el sol bajo asome sobre las mesetas del fondo un buen rato)
    const enY = (a: number) => a >= 0 ? Math.min(12.6, 4.5 + 10 * Math.sqrt(Math.sin(a) / Math.sin(45 * RAD))) : 4.5 + 30 * Math.sin(Math.max(a, -0.3));
    this.uSol = enX(sol.acimut); this.ySol = enY(sol.altura);
    U.uSolVis.value = THREE.MathUtils.smoothstep(alt, -1.5, 0.5);
    // la atmósfera agranda y apaga el sol bajo; alto, es un punto pequeño que deslumbra
    const alto = THREE.MathUtils.smoothstep(alt, 2, 22);
    U.uSolR.value = 2.75 - 0.75 * alto; U.uBrillo.value = alto;
    U.uHalo.value = THREE.MathUtils.smoothstep(alt, -12, -1) * (1 - 0.55 * THREE.MathUtils.smoothstep(alt, 6, 30));
    this.noche = 1 - THREE.MathUtils.smoothstep(alt, -13, -3);
    this.lamparas = 1 - THREE.MathUtils.smoothstep(alt, -3, 4);
    // luna: su fase real; de día casi no se ve
    this.luna = faseLuna(f);
    this.uLuna = enX(luna.acimut); this.yLuna = enY(luna.altura);
    const L = this.luna.inc;
    U.uLunaL.value.set(Math.sin(L) * (this.luna.crece ? 1 : -1), 0.05, Math.cos(L)).normalize();
    U.uLunaVis.value = THREE.MathUtils.smoothstep(luna.altura / RAD, -1.5, 1) * (0.25 + 0.75 * (1 - THREE.MathUtils.smoothstep(alt, -4, 8))) * (this.luna.fraccion > 0.03 ? 1 : 0);
    // con luna alta y llena, la noche clarea un poco
    this.lunaLuz = 0.22 * this.noche * this.luna.fraccion * THREE.MathUtils.smoothstep(luna.altura / RAD, 0, 25);
    (this.estrellas.material as THREE.PointsMaterial).opacity = this.noche * (1 - 0.35 * this.lunaLuz / 0.22);
    this.estrellas.visible = this.noche > 0.01;
    U.uNubes.value = 0.45 + 0.15 * (1 - this.noche);
    // niebla: un poco del horizonte, para que las colinas del fondo no se hundan en negro de día (las salas, cerca, no la notan)
    this.niebla.copy(this.nieblaBase).lerp(mz.cielo[0], 0.08 + 0.1 * (1 - this.noche));
    if (this.escena.fog) (this.escena.fog as THREE.Fog).color.copy(this.niebla);
    for (const m of registro.keys()) this.retocar(m);
  }

  private c = new THREE.Color();
  retocar(m: THREE.Material) {
    const r = registro.get(m); if (!r) return;
    const a = m as any, mz = this.mezcla;
    switch (r.papel) {
      case 'farol': a.color.copy(FAROL_APAGADO).lerp(FAROL_ENCENDIDO, this.lamparas); break;
      case 'poza': a.opacity = r.opacidad * this.lamparas; m.visible = this.lamparas > 0.01; break;
      case 'piloto': break;   // lo lleva el parpadeo
      case 'rotulo':
        a.color.copy(r.color).multiply(mz.albedo);
        a.emissiveIntensity = r.k * (0.55 + 0.45 * mz.k) + this.lamparas * 0.75;
        break;
      default: {
        // la luz de fuera tiñe sin lavar: el emisivo es el color de la pieza por el de la luz (y un poco de luz sola,
        // que levanta las sombras como la del cielo); el albedo, más alto, deja que la luz direccional marque el volumen
        a.color.copy(r.color).multiply(mz.albedo).multiplyScalar(ALBEDO);
        a.emissive.copy(r.color).multiply(mz.tinte).multiplyScalar(1.6).add(this.c.copy(mz.tinte).multiplyScalar(0.035));
        a.emissiveIntensity = r.k * (mz.k + this.lunaLuz);
        if (r.papel === 'lejos') {
          // bruma: las colinas del fondo se acercan al color del horizonte
          a.color.multiplyScalar(0.8); a.emissive.lerp(this.c.copy(mz.cielo[0]).multiplyScalar(0.5), 0.3); a.emissiveIntensity *= 1.1;
        } else if (r.papel === 'junto-luz' && this.lamparas > 0) {
          a.emissive.add(this.c.copy(LUZ_FAROLA).multiplyScalar(0.06 * this.lamparas));
        }
      }
    }
  }

  // ---- cada fotograma: seguir a la cámara (el cielo está «en el infinito»: no se queda atrás al moverse)
  actualizar(dt: number) {
    this.t += dt; this.espera -= dt;
    if (this.espera <= 0) { this.espera = 0.25; this.calcular(); }
    const cam = this.camara;
    const lejos = Math.max(10, cam.position.z - this.z);
    const ancho = lejos * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;   // medio ancho visible en el plano
    const escala = lejos / 148;   // tamaño aparente del sol y la luna constante con el zoom (148: la vista general)
    this.grupo.position.x = cam.position.x;
    const U = this.mat.uniforms;
    U.uSol.value.set(this.uSol * ancho, this.ySol); U.uLuna.value.set(this.uLuna * ancho, this.yLuna);
    U.uEscala.value = escala; U.uTiempo.value = this.t; U.uDesp.value = cam.position.x * 0.35;
    // piloto de la antena: destello corto cada 1,6 s (de día, apenas)
    this.parpadeo = (this.parpadeo + dt) % 1.6;
    const on = this.parpadeo < 0.18 ? 1 : 0;
    for (const m of pilotos) (m as any).color.copy(PILOTO).multiplyScalar(0.12 + on * (0.6 + 3 * this.lamparas));
  }
}
