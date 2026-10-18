// Renderer, postproceso y bucle. Un único perfil gráfico (es lowpoly: no hace falta más), 60 fps como máximo y nada que
// pintar mientras el juego no está en primer plano (ver foco.ts). Contrato de QA: window.__ready() / window.__step(dt) /
// window.__noLoop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, SMAAEffect, NoiseEffect, BlendFunction, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';

const FPS = 60;
// escala de render: en retina no se pinta a 2× (la interfaz HTML sigue nítida); SMAA suaviza los bordes. Con 1,1 la
// imagen se estiraba casi al doble y los rótulos de las salas se leían borrosos (portátil de referencia, 1440×900 retina: 118 fps con 1,5
// frente a 189 con 1,1; sigue sobrado para 60)
const TOPE_RESOLUCION = 1.5;
// anulación por URL para perfilar (?res=0.5)
const DEPURAR = new URLSearchParams(location.search);
const ESCALA_DEPURAR = +(DEPURAR.get('res') || 1);

export class Motor {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer!: EffectComposer;
  bloom!: BloomEffect;
  reloj = new THREE.Clock();
  t = 0;
  private alActualizar: ((dt: number, t: number) => void)[] = [];
  contenedor: HTMLElement;

  constructor(contenedor: HTMLElement) {
    this.contenedor = contenedor;
    // low-power: en un Mac con GPU integrada y dedicada, «high-performance» encendería la dedicada por nada
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power', stencil: false, depth: true, preserveDrawingBuffer: !!(window as any).__noLoop });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;   // las actualiza paso() con su ritmo
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'lienzo3d';
    contenedor.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(18, 16 / 9, 0.5, 600);
    this.scene.background = new THREE.Color('#0a0908');

    // Luz de entorno suave (como en los previews oficiales): da volumen a los personajes sin aplanarlos
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.24;
    this.scene.environmentRotation.set(0, Math.PI * 0.15, 0);

    this.montarPostproceso();
    window.addEventListener('resize', () => this.redimensionar());
    this.redimensionar();
  }

  private montarPostproceso() {
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({ luminanceThreshold: 0.92, luminanceSmoothing: 0.25, intensity: 0.7, mipmapBlur: true, radius: 0.7 });
    const tono = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.renderer.toneMappingExposure = 0.98;
    const grado = new HueSaturationEffect({ saturation: 0.06, hue: 0 });
    const contraste = new BrightnessContrastEffect({ contrast: 0.06, brightness: 0 });
    const vineta = new VignetteEffect({ offset: 0.32, darkness: 0.55 });
    const ruido = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
    ruido.blendMode.opacity.value = 0.035;
    this.composer.addPass(new EffectPass(this.camera, this.bloom, tono, grado, contraste, vineta, ruido));
    this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
  }

  sombrasCongeladas = false;
  private cuadro = 0;

  redimensionar() {
    const w = this.contenedor.clientWidth || window.innerWidth, h = this.contenedor.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, TOPE_RESOLUCION) * ESCALA_DEPURAR;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  cadaFotograma(f: (dt: number, t: number) => void) { this.alActualizar.push(f); }

  // el bucle solo corre con el juego en primer plano: fuera, la GPU se queda quieta (ver foco.ts)
  private activo = false;
  alCambiarPrimerPlano(activo: boolean) {
    if (activo === this.activo || (window as any).__noLoop) return;
    this.activo = activo;
    if (activo) { this.reloj.getDelta(); this.pendiente = 0; this.renderer.setAnimationLoop(() => this.bucle()); }
    else this.renderer.setAnimationLoop(null);
  }

  // tope de 60 fps: en una pantalla de 120 Hz se pinta un fotograma de cada dos. El tiempo de los que se saltan se
  // suma al siguiente, así el movimiento sigue yendo a tiempo real
  private pendiente = 0;
  private bucle() {
    this.pendiente += this.reloj.getDelta();
    if (this.pendiente < 1 / FPS - 0.002) return;   // margen para el jitter del vsync
    const dt = this.pendiente; this.pendiente = 0;
    this.paso(dt);
  }

  paso(dt: number) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    for (const f of this.alActualizar) f(dt, this.t);
    // sombras del sol: una de cada tres (rehacer el mapa redibuja todo lo que proyecta; el mundo casi no se mueve y
    // a 20 Hz no se aprecia); de lejos, a ratos
    this.cuadro++;
    const r = this.renderer;
    if (this.sombrasCongeladas) r.shadowMap.needsUpdate = this.cuadro % 6 === 0;
    else r.shadowMap.needsUpdate = this.cuadro % 3 === 0;
    this.composer.render(dt);
  }

  arrancar() {
    (window as any).__step = (dt: number) => this.paso(dt);
  }
}
