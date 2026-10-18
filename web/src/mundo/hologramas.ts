// Worktrees como copias holográficas: cada worktree de un repo es un holograma del habitante que lo creó (su clon de
// ensayo), con su proyector en un rincón libre de la franja delantera de la sala y su propio ordenador holográfico.
// Nunca usa los puestos del original (consola, silla, cama): pensando, consulta su portátil sentado en el proyector;
// trabajando, maneja pantallas en el aire; esperando, te llama; terminado, lo celebra; avería, se distorsiona; sin
// nada que hacer, se pasea cerca de su proyector, tenue (y se para a mirarte si te acercas). Al crearse se
// materializa junto a su autor y va a su sitio; al desecharse se desvanece.
// Cada copia es un interlocutor propio, como un clon: con E (o un clic) se habla con ella en su intercomunicador, que
// no es el de su autor (ui/copias.ts); lo que se trabaja dentro del worktree vive en él.
import * as THREE from 'three';
import type { Refugio } from './refugio';
import type { Sala } from './salas/comun';
import { Habitante } from './habitante';
import type { Personaje } from './personaje';
import { gltf, medir, R } from '../motor/assets';
import { vivo } from '../red/cliente';
import { SFX } from '../audio/sonido';
import { TIENDA } from '@shared/catalogo';
import type { InfoWorktree, ResumenSesion } from '@shared/protocolo';
import type { EstadoHabitante, ResumenHabitante } from '../ui/estadoJuego';
import { idCopia, rotuloRama, rutaWorktree } from '../ui/copias';

const MAX_POR_SALA = 4;
const COLOR = new THREE.Color('#58e6ff'), COLOR_AVERIA = new THREE.Color('#ff6a4a');
const Z_SITIO = 1.5;
const RADIO_PASEO = 2.4;   // sin nada que hacer, se pasea hasta aquí de su proyector
const tiempo = { value: 0 };

// ---------------------------------------------------------------- material: el personaje, en luz
const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec3 vPosW; varying vec3 vNorW; varying vec2 vUvH;
void main() {
  vUvH = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vPosW = w.xyz;
  vNorW = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
uniform vec3 uColor; uniform sampler2D uMapa; uniform float uConMapa, uTiempo, uOpacidad, uCorte, uGlitch, uSemilla, uLineas;
varying vec3 vPosW; varying vec3 vNorW; varying vec2 vUvH;
float azar(float x) { return fract(sin(x) * 43758.5453); }
void main() {
  if (vPosW.y > uCorte) discard;
  // la textura del habitante, en luminancia: se le reconoce la cara y la ropa
  float lum = uConMapa > 0.5 ? dot(texture2D(uMapa, vUvH).rgb, vec3(0.299, 0.587, 0.114)) : 0.5;
  vec3 v = normalize(cameraPosition - vPosW);
  float fres = pow(1.0 - abs(dot(normalize(vNorW), v)), 2.0);
  float lineas = 0.7 + 0.3 * sin(vPosW.y * uLineas - uTiempo * 5.0);
  float barrido = smoothstep(0.93, 1.0, fract(vPosW.y * 0.5 - uTiempo * 0.32 + uSemilla));
  float borde = smoothstep(0.07, 0.0, uCorte - vPosW.y);
  // parpadeo: casi nunca en reposo, a tirones con avería
  float t = floor(uTiempo * 18.0 + uSemilla * 50.0);
  float corte = step(1.0 - 0.015 - uGlitch * 0.45, azar(t + floor(vPosW.y * 9.0)));
  float a = ((0.42 + 0.3 * lum + 0.45 * fres) * lineas + barrido * 0.2) * uOpacidad * (1.0 - corte * 0.85) + borde;
  float l = pow(lum, 1.6);   // con contraste: el parche, las cejas y la ropa oscura se siguen leyendo
  vec3 c = uColor * (0.04 + 1.5 * l) * (0.8 + 0.2 * lineas) + uColor * fres * 0.8 + uColor * barrido * 0.3 + vec3(0.7, 1.0, 1.0) * borde * 2.0;
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}`;

interface Uniformes { uColor: { value: THREE.Color }; uTiempo: typeof tiempo; uOpacidad: { value: number }; uCorte: { value: number }; uGlitch: { value: number }; uSemilla: { value: number } }

function holografiar(o: THREE.Object3D, u: Uniformes) {
  const cache = new Map<THREE.Texture | null, THREE.ShaderMaterial>();
  const material = (mapa: THREE.Texture | null) => {
    let m = cache.get(mapa);
    if (!m) {
      m = new THREE.ShaderMaterial({ uniforms: { ...u, uMapa: { value: mapa }, uConMapa: { value: mapa ? 1 : 0 }, uLineas: { value: 150 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true });
      cache.set(mapa, m);
    }
    return m;
  };
  o.traverse((n: any) => {
    if (!n.isMesh) return;
    const ms = ([] as any[]).concat(n.material).map(m => material(m?.map ?? null));
    n.material = ms.length === 1 ? ms[0] : ms;
    n.castShadow = false; n.receiveShadow = false; n.renderOrder = 3;
  });
}

// ---------------------------------------------------------------- qué worktrees hay y quién trabaja dentro
// en el proyector: sentado con el portátil (pensando o en reposo con avería) o con las pantallas en el aire (trabajando);
// en cualquier sitio: de pie (te espera, terminó, habla contigo) o paseando (sin nada que hacer)
type Pose = 'reposo' | 'portatil' | 'manos' | 'pie' | 'paseo';
const EN_PROYECTOR = new Set<Pose>(['reposo', 'portatil', 'manos']);
const ANDANDO = /^(Walking|Running)/;
export interface Copia {
  ruta: string; w: InfoWorktree; sala: Sala; autorId: string;
  p: Personaje; u: Uniformes; base: THREE.Object3D | null; portatil: THREE.Group; pantallas: THREE.Group;
  sitio: THREE.Vector3; giro: number;
  estado: EstadoHabitante; detalle: string; sesionId?: string; firma: string;
  pose: Pose | ''; desdePose: number; poseQuerida: Pose; relojGesto: number;
  opacidad: number; corteObjetivo: number; saliendo: boolean; listo: boolean;
  relojPaseo: number; destino: THREE.Vector3 | null; volviendo: boolean;
  hablando: boolean; giroCharla: number;   // en una charla con el Supervisor: de pie y mirándole
}

export class Hologramas {
  figuras = new Map<string, Copia>();
  private desde = performance.now();
  constructor(private r: Refugio) {}

  /** Todos los worktrees (no principales) con su sala: los de git y los que una sesión acaba de crear. */
  private worktrees() {
    const repos = vivo.get().repos ?? {};
    const out: { w: InfoWorktree; sala: Sala }[] = [];
    for (const s of this.r.salas) for (const w of repos[s.id]?.worktrees ?? []) if (!w.principal) out.push({ w, sala: s });
    const todos = out.map(x => x.w);
    for (const s of Object.values(vivo.get().sesiones) as ResumenSesion[]) {
      if (s.estado === 'cerrada') continue;
      const ruta = rutaWorktree(s.cwd, todos); if (!ruta || out.some(x => x.w.ruta === ruta)) continue;
      const sala = this.r.salas.find(x => x.id === s.salaId); if (!sala) continue;
      const w: InfoWorktree = { ruta, rama: ruta.split('/').pop() ?? '', principal: false, cambios: 0, adelantados: 0, autor: s.habitanteId };
      out.push({ w, sala }); todos.push(w);
    }
    return out;
  }

  /** Sesiones que trabajan dentro de algún worktree: las anima su holograma, no el habitante original. */
  enWorktree(s: ResumenSesion) { return !!rutaWorktree(s.cwd, this.worktrees().map(x => x.w)); }

  private sesionDentro(ruta: string): ResumenSesion | undefined {
    const urg = (s: ResumenSesion) => s.estado === 'esperando' ? 0 : s.estado === 'error' ? 1 : s.estado === 'terminada' && s.sinLeer ? 2 : s.estado === 'trabajando' || s.estado === 'arrancando' ? 3 : 4;
    return (Object.values(vivo.get().sesiones) as ResumenSesion[]).filter(s => s.estado !== 'cerrada' && (s.cwd === ruta || s.cwd?.startsWith(ruta + '/'))).sort((a, b) => urg(a) - urg(b) || b.actualizada - a.actualizada)[0];
  }

  private autorDe(w: InfoWorktree, sala: Sala) {
    const hs = this.r.habitantes;
    const propio = hs.find(h => h.id.id === w.autor);
    if (propio) return propio;
    // sin autor conocido (creado fuera del refugio): uno de la sala, siempre el mismo para ese worktree
    const deSala = hs.filter(h => h.sala === sala); const lista = deSala.length ? deSala : hs;
    const k = [...w.ruta].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return lista[k % lista.length];
  }

  sincronizar() {
    if (!this.r.salas.length || !this.r.habitantes.length) return;
    const lista = this.worktrees();
    const porSala = new Map<Sala, number>();
    const vistos = new Set<string>();
    let cambio = false;
    for (const { w, sala } of lista) {
      const n = porSala.get(sala) ?? 0; if (n >= MAX_POR_SALA) continue; porSala.set(sala, n + 1);
      vistos.add(w.ruta);
      const autor = this.autorDe(w, sala); if (!autor) continue;
      const ya = this.figuras.get(w.ruta);
      // otro autor: la copia nueva nace a su lado; la sala reconstruida (disposición nueva): reaparece en su sitio sin más
      let efecto = true;
      if (ya && (ya.autorId !== autor.id.id || ya.sala !== sala)) { efecto = ya.autorId !== autor.id.id; this.quitar(ya, true); }
      else if (ya) { ya.w = w; if (ya.listo) cambio = this.aplicar(ya) || cambio; continue; }
      this.crear(w, sala, autor, efecto); cambio = true;
    }
    for (const f of [...this.figuras.values()]) if (!vistos.has(f.ruta) && !f.saliendo) { this.quitar(f); cambio = true; }
    if (cambio) this.r.publicar();
  }

  // ---- un hueco en la franja delantera. Lo que cuenta es lo que se solapa en pantalla (en X), y las salas van llenas:
  // se puntúa cada hueco y gana el que menos estorba. Nunca encima de otra copia; muy caro tapar la pieza central, el
  // puesto de un habitante (para no pisar al original) o un aparato; algo, las zonas de paseo, los muebles que asoman
  // por delante, los sitios de los robots ayudantes y el paso del ascensor; y a igualdad, mejor del lado contrario
  private sitio(sala: Sala, ruta: string) {
    const lejos = sala.lado === 'izq' ? -1 : 1, medio = sala.ancho / 2 - 0.9;
    const otros = [...this.figuras.values()].filter(f => f.sala === sala && f.ruta !== ruta && !f.saliendo).map(f => f.sitio.x - sala.grupo.position.x);
    const puestos = sala.puntos.filter(pt => pt.tipo !== 'mirar' && pt.tipo !== 'charla').map(pt => pt.pos.x);
    const aparatos = (sala.interactivos ?? []).filter(i => !i.id.startsWith('vis:')).map(i => i.x);
    // entre copias, bien separadas: cada una con su sitio para que se distinga a quién se habla
    const coste = (x: number) =>
      (otros.some(o => Math.abs(o - x) < 1.3) ? 1000 : otros.some(o => Math.abs(o - x) < 2.2) ? 30 : 0) + (Math.abs(x) < 1.8 ? 100 : 0)
      + (puestos.some(px => Math.abs(px - x) < 1.2) ? 50 : 0) + (aparatos.some(ax => Math.abs(ax - x) < 1.0) ? 40 : 0)
      + ((sala.zonasPaseo ?? []).some(([a, b]) => x > a - 0.6 && x < b + 0.6) ? 10 : 0)
      + (sala.obstaculos.some(b => b.max.y > 0.3 && b.min.x - 0.5 < x && b.max.x + 0.5 > x) ? 5 : 0)
      + ([-3.2, 3.0, -1.4, 1.6, -4.6, 4.4].some(r => Math.abs(r - x) < 0.8) ? 4 : 0)
      + (Math.abs(-lejos * medio - x) < 1.2 ? 12 : 0)   // junto al paso del ascensor se asoman los visitantes y entran los robots
      + Math.abs(lejos * medio - x);
    let mejor = lejos * medio, cmin = Infinity;
    for (let x = -medio; x <= medio + 1e-6; x += 0.3) { const c = coste(x); if (c < cmin) { cmin = c; mejor = x; } }
    return new THREE.Vector3(sala.grupo.position.x + mejor, sala.grupo.position.y, Z_SITIO);
  }

  private async crear(w: InfoWorktree, sala: Sala, autor: Habitante, efecto = true) {
    const u: Uniformes = { uColor: { value: COLOR.clone() }, uTiempo: tiempo, uOpacidad: { value: 0 }, uCorte: { value: -1e4 }, uGlitch: { value: 0 }, uSemilla: { value: Math.random() } };
    // el mismo aspecto que su autor (modelo, tono, silueta y accesorios), y luego en luz
    const clon = new Habitante(autor.id, sala);
    const sitio = this.sitio(sala, w.ruta);
    const lado = Math.sign(sala.grupo.position.x - sitio.x) || 1;
    const f: Copia = {
      ruta: w.ruta, w, sala, autorId: autor.id.id, p: clon.p, u, base: null, portatil: new THREE.Group(), pantallas: new THREE.Group(),
      sitio, giro: lado * 1.05, estado: 'ocioso', detalle: '', firma: '', pose: '', desdePose: 0, poseQuerida: 'reposo', relojGesto: 3,
      opacidad: 0, corteObjetivo: 1e4, saliendo: false, listo: false,
      relojPaseo: 3 + Math.random() * 4, destino: null, volviendo: false, hablando: false, giroCharla: 0,
    };
    this.figuras.set(w.ruta, f);
    await clon.cargar();
    if (this.figuras.get(w.ruta) !== f) return;
    const p = f.p;
    await this.accesorios(p, autor.id.id);
    await Promise.all([this.montarPortatil(f), this.montarBase(f)]);
    if (this.figuras.get(w.ruta) !== f) return;
    for (const o of [p.modelo, f.portatil, f.pantallas]) holografiar(o, u);
    p.sombraContacto.visible = false;
    p.raiz.name = 'holograma:' + w.ruta;
    p.marcha = { andar: 'Walking_B', correr: 'Running_A', ritmoAndar: 1.45, ritmoCorrer: 1 };
    // recién creado con el refugio ya en marcha: se materializa junto a su autor y va a su sitio
    const enCaliente = efecto && performance.now() - this.desde > 8000 && autor.sala === sala && autor.p.raiz.visible;
    const y = sala.grupo.position.y;
    if (enCaliente) {
      const ap = autor.pos; const dx = Math.sign(sitio.x - ap.x) || 1;
      p.raiz.position.set(THREE.MathUtils.clamp(ap.x + dx * 0.8, sala.grupo.position.x - sala.ancho / 2 + 0.7, sala.grupo.position.x + sala.ancho / 2 - 0.7), y, THREE.MathUtils.clamp(ap.z + 0.6, 0.9, 1.7));
      p.giroObjetivo = 0; p.raiz.rotation.y = 0;
      u.uCorte.value = y; f.corteObjetivo = y + 2.6; f.opacidad = 1; u.uOpacidad.value = 1;
      SFX.holoAparece();
      this.r.motor.scene.add(p.raiz);
      p.reproducir('Spawn_Ground', 0, { bucle: false });
      setTimeout(() => { if (f.saliendo) return; p.irA([new THREE.Vector3(p.raiz.position.x, y, Z_SITIO), sitio], false, () => { f.pose = 'pie'; f.desdePose = 0; this.aplicar(f, true); f.listo = true; this.r.publicar(); }); }, 1300);
    } else {
      p.raiz.position.copy(sitio); p.raiz.rotation.y = f.giro; p.giroObjetivo = f.giro;
      u.uCorte.value = 1e4; f.corteObjetivo = 1e4;
      this.r.motor.scene.add(p.raiz);
      this.aplicar(f, true); this.cambiarPose(f, f.poseQuerida, true); f.listo = true; u.uOpacidad.value = f.opacidad; this.r.publicar();
    }
    if (f.base) this.r.motor.scene.add(f.base);
    // quien estaba de paseo justo ahí le deja el sitio
    for (const h of this.r.habitantes) if (h.sala === sala && h.estado === 'ocioso' && !h.fijo && Math.abs(h.pos.x - sitio.x) < 1.1) h.p.irA(this.r.huecoLibre(sala));
  }

  private async accesorios(p: Personaje, autorId: string) {
    const ids: string[] = (vivo.get().estado?.habitantes as any[] | undefined)?.find(x => x.id === autorId)?.accesorios ?? [];
    await Promise.all(ids.map(id => { const a = TIENDA.find(x => x.id === id); return a?.ruta && a.hueso ? p.acoplar('acc:' + id, { ruta: a.ruta, hueso: a.hueso, escala: a.escala ?? 1, pos: a.pos, rot: a.rot, rig: a.rig }).catch(() => {}) : null; }));
  }

  // su ordenador: un teclado y una pantalla de los muebles KayKit, en luz como él (en el suelo o flotando en el aire)
  private async montarPortatil(f: Copia) {
    const [tec, mon] = await Promise.all([gltf(R.mueble('keyboard')), gltf(R.mueble('monitor'))]);
    const ajustar = (o: THREE.Object3D, ancho: number) => { const { tam } = medir(o); o.scale.setScalar(ancho / Math.max(tam.x, tam.z, 1e-3)); return o; };
    const teclado = ajustar(tec.scene.clone(true), 0.36); teclado.position.set(0, 0.01, 0.5);
    const pantalla = ajustar(mon.scene.clone(true), 0.38); pantalla.position.set(0, 0.01, 0.74); pantalla.rotation.y = Math.PI; pantalla.rotation.x = -0.12;
    f.portatil.add(teclado, pantalla);
    // en arco delante de él, a la altura de las manos (la cámara no las ve tapándole la cabeza)
    const p1 = ajustar(mon.scene.clone(true), 0.5); p1.position.set(-0.22, 0.88, 0.72); p1.rotation.y = Math.PI - 0.35;
    const p2 = ajustar(mon.scene.clone(true), 0.42); p2.position.set(0.36, 0.8, 0.6); p2.rotation.y = Math.PI + 0.5;
    f.pantallas.add(p1, p2);
    for (const g of [f.portatil, f.pantallas]) { g.visible = false; f.p.raiz.add(g); }
  }

  // el proyector: una plataforma baja de KayKit en el suelo, con su material (no es holograma)
  private async montarBase(f: Copia) {
    try {
      const g = await gltf(R.base('landingpad_small'));
      const o = g.scene.clone(true);
      const { tam } = medir(o); o.scale.setScalar(1.0 / Math.max(tam.x, tam.z, 1e-3));
      o.traverse((n: any) => { if (n.isMesh) { n.receiveShadow = true; n.castShadow = false; } });
      const base = new THREE.Group(); base.add(o); base.position.copy(f.sitio); base.userData.estatico = false;
      f.base = base;
      f.sitio.y += medir(o).tam.y;   // de pie (o sentado) encima de la plataforma
    } catch { f.base = null; }
  }

  // ---- la sesión de dentro → pose y animación
  private aplicar(f: Copia, forzar = false): boolean {
    const s = this.sesionDentro(f.ruta);
    const m = s?.actividad?.modo;
    let estado: EstadoHabitante = 'ocioso', detalle = '', quiere: Pose = 'paseo';
    if (s) {
      if (s.estado === 'arrancando') { estado = 'pensando'; detalle = 'preparándose…'; quiere = 'portatil'; }
      else if (s.estado === 'trabajando') {
        if (!m || m === 'pensar') { estado = 'pensando'; detalle = s.actividad?.texto ?? 'pensando…'; quiere = 'portatil'; }
        else { estado = 'trabajando'; detalle = s.actividad?.texto ?? ''; quiere = 'manos'; }
      } else if (s.estado === 'esperando') { estado = 'esperando'; detalle = s.pendiente?.titulo ?? 'te espera'; quiere = 'pie'; }
      else if (s.estado === 'terminada' && s.sinLeer) { estado = 'terminado'; detalle = 'listo: ' + (s.titulo ?? ''); quiere = 'pie'; }
      else if (s.estado === 'error') { estado = 'error'; detalle = s.error ?? 'avería'; quiere = 'reposo'; }
      else { detalle = s.titulo ?? ''; quiere = 'paseo'; }
    }
    const firma = [s?.id, estado, detalle, f.w.cambios, f.w.adelantados].join('|');
    if (firma === f.firma && !forzar) return false;
    const antes = f.estado;
    f.firma = firma; f.estado = estado; f.detalle = detalle; f.sesionId = s?.id; f.poseQuerida = quiere;
    if (estado !== antes) {
      if (estado === 'terminado') { SFX.exito(); f.p.gesto('Cheering', 'Idle_A'); f.pose = 'pie'; f.desdePose = tiempo.value; }
      else if (estado === 'error') { SFX.holoGlitch(); f.u.uGlitch.value = 1; }
      else if (estado === 'esperando') SFX.notifAlta();
    }
    if (estado !== 'error') f.u.uGlitch.value = 0;
    f.opacidad = estado === 'ocioso' ? 0.6 : 1;
    return estado !== antes;
  }

  private cambiarPose(f: Copia, pose: Pose, inmediata = false) {
    const p = f.p; const sentado = f.pose === 'reposo' || f.pose === 'portatil';
    const sentar = pose === 'reposo' || pose === 'portatil';
    f.pose = pose; f.desdePose = tiempo.value;
    if (pose === 'paseo') f.relojPaseo = Math.max(f.relojPaseo, 1.6);   // primero termina de levantarse
    f.portatil.visible = pose === 'portatil' || pose === 'reposo';
    f.pantallas.visible = pose === 'manos';
    if (EN_PROYECTOR.has(pose)) p.giroObjetivo = f.giro; else if (pose === 'pie') p.giroObjetivo = 0;
    if (sentar) {
      p.enReposo = 'Sit_Floor_Idle';
      if (sentado || inmediata) p.reproducir('Sit_Floor_Idle', inmediata ? 0 : 0.35);
      else p.gesto('Sit_Floor_Down', 'Sit_Floor_Idle', 0.25);
    } else {
      const clip = pose === 'manos' ? 'Ranged_Magic_Spellcasting_Long' : 'Idle_A';
      p.enReposo = clip;
      if (sentado && !inmediata) p.gesto('Sit_Floor_StandUp', clip, 0.2);
      else if (pose === 'pie' && f.estado === 'esperando' && !f.hablando) { p.gesto('Waving', 'Idle_A'); f.relojGesto = 3; }
      else p.reproducir(clip, inmediata ? 0 : 0.3);
    }
  }

  private quitar(f: Copia, ya = false) {
    f.saliendo = true; this.figuras.delete(f.ruta); f.p.parar();
    const fuera = () => { this.r.motor.scene.remove(f.p.raiz); if (f.base) this.r.motor.scene.remove(f.base); };
    if (ya || !f.p.raiz.parent) { fuera(); return; }
    SFX.apagado();
    // se desvanece de la cabeza a los pies
    f.u.uCorte.value = Math.min(f.u.uCorte.value, f.p.raiz.position.y + 2.6); f.corteObjetivo = f.p.raiz.position.y - 0.05;
    setTimeout(fuera, 1400);
    this.salientes.add(f);
  }
  private salientes = new Set<Copia>();

  actualizar(dt: number) {
    tiempo.value += dt;
    for (const f of [...this.figuras.values(), ...this.salientes]) {
      if (!f.p.mixer || !f.p.raiz.parent) { if (f.saliendo && !f.p.raiz.parent) this.salientes.delete(f); continue; }
      const u = f.u;
      // materializar o desvanecer: el corte sube (o baja) a ritmo constante
      if (u.uCorte.value !== f.corteObjetivo && u.uCorte.value > -1e3 && u.uCorte.value < 1e3) {
        const paso = dt * 2.2; const d = f.corteObjetivo - u.uCorte.value;
        u.uCorte.value = Math.abs(d) <= paso ? f.corteObjetivo : u.uCorte.value + Math.sign(d) * paso;
        if (u.uCorte.value >= f.p.raiz.position.y + 2.55 && !f.saliendo) { u.uCorte.value = 1e4; f.corteObjetivo = 1e4; }
      }
      u.uOpacidad.value = THREE.MathUtils.damp(u.uOpacidad.value, f.opacidad, 3, dt);
      if (f.estado === 'error') u.uGlitch.value = 0.35 + 0.65 * Math.max(0, Math.sin(tiempo.value * 3.1 + u.uSemilla.value * 9));
      u.uColor.value.lerp(f.estado === 'error' ? COLOR_AVERIA : COLOR, 1 - Math.exp(-dt * 4));   // con avería, en rojo
      if (f.listo && !f.saliendo) this.conducir(f, dt);
      f.p.actualizar(dt);
    }
  }

  // ---- qué hace cada copia: hablar contigo, volver a su proyector para trabajar, pasearse o cambiar de postura
  private conducir(f: Copia, dt: number) {
    const p = f.p, pos = p.raiz.position;
    if (f.hablando) {
      if (p.enMovimiento || ANDANDO.test(p.nombreActual)) { p.parar(); p.reproducir(p.enReposo, 0.25); }
      if (f.pose !== 'pie') this.cambiarPose(f, 'pie');
      p.giroObjetivo = f.giroCharla;
      return;
    }
    const quiere = f.poseQuerida;
    // lo de trabajar se hace en el proyector: si andaba de paseo, vuelve primero
    if (EN_PROYECTOR.has(quiere) && Math.hypot(pos.x - f.sitio.x, pos.z - f.sitio.z) > 0.08) {
      if (!f.volviendo || !p.enMovimiento) {
        f.volviendo = true; f.destino = f.sitio;
        if (f.pose !== 'pie' && f.pose !== 'paseo') this.cambiarPose(f, 'paseo');
        p.irA(f.sitio, false, () => { f.volviendo = false; f.destino = null; this.cambiarPose(f, f.poseQuerida); });
      }
      return;
    }
    if (f.volviendo) return;
    // entre pensar y trabajar no se levanta y se sienta a cada herramienta: cada postura dura al menos unos segundos
    const vaiven = (f.pose === 'portatil' && quiere === 'manos') || (f.pose === 'manos' && quiere === 'portatil');
    if (quiere !== f.pose && (!vaiven || tiempo.value - f.desdePose > 6)) { if (p.enMovimiento && quiere !== 'paseo') p.parar(); this.cambiarPose(f, quiere); }
    if (f.estado === 'esperando' && f.pose === 'pie') { f.relojGesto -= dt; if (f.relojGesto < 0) { f.relojGesto = 4 + Math.random() * 2; f.p.gesto('Waving', 'Idle_A'); } }
    if (f.pose === 'paseo') this.pasear(f, dt);
  }

  // sin nada que hacer, da vueltas cerca de su proyector, sin pisar a nadie; si el Supervisor se le acerca, se para y le mira
  private pasear(f: Copia, dt: number) {
    const p = f.p, pos = p.raiz.position, sp = this.r.supervisor?.raiz.position;
    if (sp && Math.abs(sp.y - pos.y) < 1 && Math.hypot(sp.x - pos.x, sp.z - pos.z) < 1.7) {
      if (p.enMovimiento) { p.parar(); f.destino = null; p.reproducir(p.enReposo, 0.25); }
      p.giroObjetivo = Math.atan2(sp.x - pos.x, sp.z - pos.z);
      f.relojPaseo = Math.max(f.relojPaseo, 2.5);
      return;
    }
    if (p.enMovimiento) return;
    f.relojPaseo -= dt; if (f.relojPaseo > 0) return;
    f.relojPaseo = 5 + Math.random() * 7;
    const sala = f.sala, sx = sala.grupo.position.x, med = sala.ancho / 2 - 0.8, y = sala.grupo.position.y;
    let dest: THREE.Vector3 | null = Math.random() < 0.25 && Math.hypot(pos.x - f.sitio.x, pos.z - f.sitio.z) > 0.5 ? f.sitio : null;
    for (let k = 0; !dest && k < 14; k++) {
      const x = THREE.MathUtils.clamp(f.sitio.x + (Math.random() * 2 - 1) * RADIO_PASEO, sx - med, sx + med), z = 0.85 + Math.random() * 0.85;
      const libre = Math.hypot(x - pos.x, z - pos.z) > 0.8
        && ![...this.figuras.values()].some(o => o !== f && Math.abs((o.destino ?? o.p.raiz.position).x - x) < 1.3)
        && !this.r.habitantes.some(h => h.sala === sala && Math.hypot(h.pos.x - x, h.pos.z - z) < 1.2);
      if (libre) dest = new THREE.Vector3(x, y, z);
    }
    if (!dest) return;
    const casa = dest === f.sitio;
    f.destino = dest;
    p.irA(dest, false, () => { f.destino = null; p.reproducir(p.enReposo, 0.3); p.giroObjetivo = casa ? f.giro : (Math.random() * 2 - 1) * 0.8; });
  }

  // ---- charla con el Supervisor
  empezarCharla(f: Copia, mirarA: THREE.Vector3) {
    f.hablando = true; f.volviendo = false; f.destino = null; f.p.parar();
    if (ANDANDO.test(f.p.nombreActual)) f.p.reproducir(f.p.enReposo, 0.2);
    f.giroCharla = Math.sign(mirarA.x - f.p.raiz.position.x || 1) * 0.55;
  }
  terminarCharla(f: Copia) { f.hablando = false; f.relojPaseo = 4; this.aplicar(f, true); }

  /** La copia más cercana a `junto` (en su planta), a menos de `max`. */
  cercana(junto: THREE.Vector3, max: number): { f: Copia; d: number } | null {
    let mejor: { f: Copia; d: number } | null = null;
    for (const f of this.figuras.values()) {
      if (!f.listo || f.saliendo || Math.abs(f.p.raiz.position.y - junto.y) > 1) continue;
      const d = Math.hypot(f.p.raiz.position.x - junto.x, f.p.raiz.position.z - junto.z);
      if (d < max && (!mejor || d < mejor.d)) mejor = { f, d };
    }
    return mejor;
  }
  deId(id: string) { for (const f of this.figuras.values()) if (idCopia(f.ruta) === id) return f; }

  // sus proyectores y por dónde andan (para que los habitantes no se les metan dentro)
  posiciones() { return [...this.figuras.values()].flatMap(f => [f.sitio, f.p.raiz.position]); }

  /** Cada copia, como interlocutor de la interfaz (regleta, barra, intercomunicador). */
  resumenes(): ResumenHabitante[] {
    return [...this.figuras.values()].map(f => {
      const autor = this.r.habitantes.find(h => h.id.id === f.autorId), a = autor?.id;
      const nombre = a?.nombre ?? 'Copia';
      return {
        id: idCopia(f.ruta), nombre: `${nombre} ◇ ${rotuloRama(f.w.rama)}`, mote: 'copia holográfica', tipo: a?.tipo ?? '',
        bio: `Copia holográfica de ${nombre} «${a?.mote ?? ''}». Trabaja en el worktree ${f.w.rama || f.ruta}, sin tocar la copia principal del repo.`,
        sala: f.sala.id, salaNombre: f.sala.nombre, ruta: f.ruta, carpeta: f.ruta, estado: f.listo ? f.estado : 'ocioso', detalle: f.detalle, sesionId: f.sesionId,
        robot: autor?.p.aspecto?.especie === 'robot',
        copia: { ruta: f.ruta, rama: f.w.rama, autorId: f.autorId, autorNombre: nombre, autorMote: a?.mote ?? '', cambios: f.w.cambios, adelantados: f.w.adelantados },
      };
    });
  }

  etiquetas(lejos: boolean, junto: THREE.Vector3, seleccionada: Copia | null) {
    return [...this.figuras.values()].filter(f => f.listo && f.p.mixer).map(f => {
      const cerca = f.p.raiz.position.distanceTo(junto) < 2.4, elegida = f === seleccionada;
      const git = f.w.cambios ? `${f.w.cambios} cambios` : f.w.adelantados ? `${f.w.adelantados} commits por integrar` : 'limpia';
      const detalle = !cerca ? '' : f.estado === 'ocioso' ? git : f.detalle.slice(0, 48);
      const autor = this.r.habitantes.find(h => h.id.id === f.autorId);
      return { k: f, pos: f.p.puntoCabeza(), alto: 0.2, nombre: `${autor?.id.nombre ?? 'Copia'} ◇ ${rotuloRama(f.w.rama)}`, estado: f.estado, detalle, cerca: elegida, lejos, prompt: elegida ? 'Hablar' : '', relevante: cerca || elegida || f.estado !== 'ocioso' };
    }).filter(x => x.relevante);
  }
}
