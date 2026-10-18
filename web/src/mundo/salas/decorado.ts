// Monta el decorado que el habitante ha diseñado para su sala (shared/decorado.ts, «Adaptar la sala al repo») con el
// atrezo del juego: sobre una de las escenas de serie o sobre la sala vacía, a la que pone lo imprescindible (la pantalla
// con el estado real del repo, el puesto del habitante y su pieza) donde diga el decorado o en su sitio por defecto.
// Lo que no se puede montar (un modelo que no está) se salta: una pieza rota nunca deja la sala a medias.
import * as THREE from 'three';
import { colocar, type Colocacion } from '../../motor/assets';
import { cartel, PantallaFosforo, PanelSala } from '../../motor/texturas';
import { cartelEnPared, bandaAlta, puestoTrabajo, pantallaReal, apoyar, aPared, centrar, caja, materialAcero, mancha, tumbada, ESCALA_KAYKIT, type Amueblar, type Contexto, type PuntoSala } from './comun';
import { pantallaEstadoRepo } from './generica';
import { rutaAtrezo, PACKS, type Decorado, type PiezaDecorado, type PuntoDecorado } from '@shared/decorado';

const G = Math.PI / 180;
// nombres de material de los packs que son luz: «Screen», «Light», «Fire», «Glass», «Neon»…
const BRILLA = /screen|^light$|light_|_light|glow|emis|neon|lamp|bulb|^led|fire|flame|lava|crystal|glass|window/i;
const escalaPack = (id: string) => (PACKS[id.split('/')[0]]?.carpeta.startsWith('kaykit') ? ESCALA_KAYKIT : 1);

export async function amueblarDecorado(ctx: Contexto, d: Decorado, base: Amueblar | null) {
  if (base) await base(ctx); else await montarVacia(ctx, d);
  if (d.pieza && base) puntoPieza(ctx, d.pieza, 'pieza-decorado');
  if (d.aficion) puntoAficion(ctx, d.aficion);
  await Promise.all([montarPiezas(ctx, d.piezas ?? []), ...(d.carteles ?? []).map((c, i) => montarCartel(ctx, c, i)), ...(d.pantallas ?? []).map(p => montarPantalla(ctx, p))]);
  if (d.lamparas?.length) ctx.lamparas = d.lamparas.map(l => ({ x: l.x, z: l.z, o: { intensidad: l.intensidad ?? 80, ...(l.color ? { color: l.color } : {}), objetivo: [l.x, l.z - 0.6] as [number, number] } }));
}

// ---------------------------------------------------------------- la sala vacía: lo imprescindible
async function montarVacia(ctx: Contexto, d: Decorado) {
  const { g, v, zB } = ctx;
  await bandaAlta(ctx, { reloj: 4.9, valvulas: [-4.8], tramos: [[-4.4, 2.4], [3.6, 2.6]] });
  // la pantalla con el estado real del repo, en su marco
  const pr = d.pantallaRepo ?? { x: 0, y: 2.55, ancho: 3 };
  const alto = pr.ancho * 0.56;
  const pantalla = new PantallaFosforo(768, 432, v.pantalla, ' estado del repo'); pantalla.velocidad = 50;
  g.add(caja(pr.ancho + 0.2, alto + 0.2, 0.12, materialAcero('#1f1c19'), pr.x, pr.y, zB + 0.36));
  const pant = new THREE.Mesh(new THREE.PlaneGeometry(pr.ancho, alto), new THREE.MeshStandardMaterial({ map: pantalla.tex, emissiveMap: pantalla.tex, emissive: '#ffffff', emissiveIntensity: 0.95, color: '#000' }));
  pant.position.set(pr.x, pr.y, zB + 0.43); g.add(pant);
  ctx.sala.pantallas.unshift(pantalla);
  pantallaEstadoRepo(ctx, pantalla);
  // el puesto del habitante (por defecto, a la derecha y de tres cuartos). Su giro es hacia dónde mira quien se sienta
  // (180: a la pared); el de puestoTrabajo, el de la mesa (0: de espaldas a la cámara)
  const pu = d.puesto ?? { x: 4.3, z: -0.75, giro: 134 };
  const giroMesa = ((pu.giro ?? 180) - 180) * G;
  const pPuesto = new PantallaFosforo(384, 256, v.pantalla); pPuesto.velocidad = 30;
  pantallaReal(ctx, pPuesto, 'actividad'); ctx.sala.pantallas.push(pPuesto);
  const mesa = pu.mesa ? rutaAtrezo(pu.mesa) : null;
  await puestoTrabajo(ctx, { x: pu.x, z: pu.z, giro: giroMesa, tex: pPuesto.tex, pantalla: pu.pantalla ?? 'monitor', ...(mesa ? { mesa } : {}) }).catch(async () => {
    await puestoTrabajo(ctx, { x: pu.x, z: pu.z, giro: giroMesa, tex: pPuesto.tex });   // la mesa pedida no carga: la de siempre
  });
  // la pieza protagonista: el habitante va a ella (por defecto, delante de la pantalla del repo)
  puntoPieza(ctx, d.pieza ?? { x: pr.x - 0.5, z: zB + 1.3, giro: 180 }, 'pieza', () => { (pant.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.45; });
  ctx.alActualizar(dt => { const m = pant.material as THREE.MeshStandardMaterial; m.emissiveIntensity = Math.max(0.95, m.emissiveIntensity - dt * 0.4); });
  const panel = new PanelSala(); panel.titulo = d.subtitulo ?? 'TALLER'; panel.color = v.pantalla; ctx.panel = panel;
  mancha(g, -2.0, 1.1, 1.1, ctx.semilla);
  ctx.sala.zonasPaseo = [[-2.5, 2.5]];
  ctx.vapor = { pos: new THREE.Vector3(-1.2, 3.15, zB + 0.85), dir: new THREE.Vector3(0.3, 0.9, 0.3) };
  ctx.lamparas = [{ x: -3.6, z: 0.5, o: { intensidad: 80 } }, { x: pr.x, z: 0.9, o: { intensidad: 90, sombra: true, corta: true } }, { x: 3.8, z: 0.5, o: { intensidad: 70 } }];
}

function puntoPieza(ctx: Contexto, p: PuntoDecorado, id: string, alHacer?: () => void) {
  const gestos = p.gestos?.length ? p.gestos : ['Interact', 'Holding_A', 'Use_Item'];
  ctx.sala.puntos.push({ id, tipo: 'pieza', pos: new THREE.Vector3(p.x, 0, p.z), giro: (p.giro ?? 180) * G,
    acciones: gestos.map(clip => ({ clip, ...(clip === 'Holding_A' ? { utensilio: 'diario', dur: 4 } : {}), ...(alHacer && (clip === 'Interact' || clip === 'Use_Item') ? { alHacer } : {}) })) } as PuntoSala);
}
function puntoAficion(ctx: Contexto, p: PuntoDecorado) {
  const [clip = 'Idle_A', otro] = p.gestos ?? [];
  ctx.sala.puntos.push({ id: 'aficion-decorado', tipo: 'aficion', pos: new THREE.Vector3(p.x, 0, p.z), giro: (p.giro ?? 180) * G, clip, ...(otro ? { gesto: { clip: otro, cada: 5 } } : {}) });
}

// ---------------------------------------------------------------- el atrezo
async function montarPiezas(ctx: Contexto, piezas: PiezaDecorado[]) {
  const { g } = ctx;
  let luces = 0;
  // cada pieza espera solo a aquella sobre la que se apoya (las del suelo se cargan todas a la vez)
  const hechas: Promise<THREE.Object3D | null>[] = [];
  piezas.forEach((p, i) => {
    hechas[i] = (p.sobre !== undefined && p.sobre < i ? hechas[p.sobre] : Promise.resolve(null)).then(async soporte => {
      const ruta = rutaAtrezo(p.modelo); if (!ruta) return null;
      const giro = (p.giro ?? 0) * G;
      // (con su índice en el nombre: así la revisión de apoyos, ?revisar, dice qué pieza del decorado está mal)
      const c: Colocacion = { nombre: `piezas[${i}] ${p.modelo}`, pos: [p.x, p.y ?? 0, p.z], variante: ctx.v, propios: !!(p.color || p.luz), ...(p.tumbada ? tumbada(giro) : { rot: giro }), ...(p.alto ? { alto: p.alto } : p.ancho ? { ancho: p.ancho } : { escala: escalaPack(p.modelo) }) };
      let o: THREE.Object3D;
      try { o = await colocar(g, ruta, c); } catch (e) { console.warn('decorado: no se pudo montar', p.modelo, e); return null; }
      if (p.tumbada) centrar(o, p.x, p.z);
      if (soporte) apoyar(o, soporte);
      if (p.pared) aPared(g, o);
      if (p.color || p.luz) {
        const mats: THREE.MeshStandardMaterial[] = [];
        o.traverse((n: any) => { if (n.isMesh) mats.push(...([].concat(n.material) as THREE.MeshStandardMaterial[])); });
        if (p.color) for (const m of mats) m.color?.multiply(new THREE.Color(p.color));
        // brilla lo que en el modelo es luz (pantallas, pilotos, fuego, cristales); si no tiene nada así, todo, apenas
        const deLuz = mats.filter(m => BRILLA.test(m.name) && !/grey|gray|metal/i.test(m.name));
        if (p.luz) for (const m of deLuz.length ? deLuz : mats) if (m.emissive) { m.emissive = new THREE.Color(p.luz); m.emissiveIntensity = deLuz.length ? 1.6 : 0.22; }
      }
      const caja3 = new THREE.Box3().setFromObject(o);
      // lo que brilla da un poco de luz de verdad alrededor (pocas: las reparte el juego con las demás)
      if (p.luz && luces < 6) { luces++; ctx.sala.anclas.push({ tipo: 'punto', pos: caja3.getCenter(new THREE.Vector3()), intensidad: 2.4, color: new THREE.Color(p.luz), distancia: 3.5, prioridad: 1 }); }
      // lo que está en el suelo y abulta es un obstáculo para quien anda por la sala
      if (!soporte && !p.y && caja3.max.y - caja3.min.y > 0.3) ctx.sala.obstaculos.push(new THREE.Box2(new THREE.Vector2(caja3.min.x, caja3.min.z), new THREE.Vector2(caja3.max.x, caja3.max.z)));
      return o;
    }).catch(() => null);
  });
  await Promise.all(hechas);
}

async function montarCartel(ctx: Contexto, c: NonNullable<Decorado['carteles']>[number], i: number) {
  const alto = c.ancho * 720 / 512;
  const m = cartelEnPared(ctx.g, cartel(c.lineas.length ? c.lineas : [' '], c.titulo, c.fondo ?? '#e3d9c0', c.tinta ?? '#3a2a1e', c.simbolo ?? 'engranaje', ctx.semilla + i * 7), c.x, c.y, c.ancho, alto, ctx.zB + 0.33, (c.giro ?? 0) * G);
  aPared(ctx.g, m, 0.012);
}

async function montarPantalla(ctx: Contexto, p: NonNullable<Decorado['pantallas']>[number]) {
  const { g, v, zB } = ctx; const alto = p.ancho * 0.56;
  const pantalla = new PantallaFosforo(768, 432, v.pantalla, p.titulo ? ' ' + p.titulo : ''); pantalla.velocidad = 34;
  const marco = caja(p.ancho + 0.14, alto + 0.14, 0.1, materialAcero('#1f1c19'), p.x, p.y, zB + 0.36); g.add(marco);
  const pant = new THREE.Mesh(new THREE.PlaneGeometry(p.ancho, alto), new THREE.MeshStandardMaterial({ map: pantalla.tex, emissiveMap: pantalla.tex, emissive: '#ffffff', emissiveIntensity: 0.9, color: '#000' }));
  pant.position.set(p.x, p.y, zB + 0.42); g.add(pant); ctx.sala.pantallas.push(pantalla);
  // se escriben solas, en bucle: cuando acaba, una pausa y vuelta a empezar
  let espera = 0;
  pantalla.escribir(p.lineas);
  ctx.alActualizar(dt => {
    if (pantalla.cola.length) return;
    espera += dt; if (espera < 6) return;
    espera = 0; pantalla.lineas = []; pantalla.escribir(p.lineas);
  });
}
