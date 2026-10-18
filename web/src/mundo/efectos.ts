// Efectos de ambiente: polvo en suspensión en los conos de luz, vapor de tuberías, chispas.
import * as THREE from 'three';

function texturaPunto() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
const TEX = texturaPunto();

// Motas de polvo que flotan despacio en un volumen (brillan al cruzar la luz gracias al bloom)
export class Polvo {
  puntos: THREE.Points; private vel: Float32Array; private caja: THREE.Box3;
  constructor(caja: THREE.Box3, n = 140, color = '#ffd9a8') {
    this.caja = caja;
    const pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    const s = caja.getSize(new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      pos[i * 3] = caja.min.x + Math.random() * s.x; pos[i * 3 + 1] = caja.min.y + Math.random() * s.y; pos[i * 3 + 2] = caja.min.z + Math.random() * s.z;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.06; this.vel[i * 3 + 1] = (Math.random() - 0.3) * 0.04; this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.075, map: TEX, color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.puntos = new THREE.Points(geo, mat); this.puntos.frustumCulled = false;
  }
  actualizar(dt: number, t: number) {
    const p = this.puntos.geometry.attributes.position as THREE.BufferAttribute; const a = p.array as Float32Array; const b = this.caja;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += (this.vel[i] + Math.sin(t * 0.3 + i) * 0.015) * dt; a[i + 1] += this.vel[i + 1] * dt; a[i + 2] += this.vel[i + 2] * dt;
      if (a[i] < b.min.x) a[i] = b.max.x; if (a[i] > b.max.x) a[i] = b.min.x;
      if (a[i + 1] < b.min.y) a[i + 1] = b.max.y; if (a[i + 1] > b.max.y) a[i + 1] = b.min.y;
      if (a[i + 2] < b.min.z) a[i + 2] = b.max.z; if (a[i + 2] > b.max.z) a[i + 2] = b.min.z;
    }
    p.needsUpdate = true;
  }
}

// Vapor: sprites que suben, crecen y se desvanecen desde un emisor (válvulas, tuberías, máquina caliente)
export class Vapor {
  grupo = new THREE.Group(); private parts: { s: THREE.Sprite; vida: number; v: THREE.Vector3 }[] = [];
  origen: THREE.Vector3; ritmo: number; private acum = 0; activo = true; dir: THREE.Vector3;
  constructor(origen: THREE.Vector3, ritmo = 6, dir = new THREE.Vector3(0, 1, 0)) { this.origen = origen; this.ritmo = ritmo; this.dir = dir; }
  actualizar(dt: number) {
    this.acum += dt * (this.activo ? this.ritmo : 0);
    while (this.acum > 1) {
      this.acum -= 1;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX, color: '#cfc8bd', transparent: true, opacity: 0, depthWrite: false }));
      s.position.copy(this.origen); s.scale.setScalar(0.15); this.grupo.add(s);
      this.parts.push({ s, vida: 0, v: this.dir.clone().multiplyScalar(0.5 + Math.random() * 0.3).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.1)) });
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.vida += dt;
      p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 0.6);
      p.s.scale.set(0.1 + p.vida * 0.35, 0.18 + p.vida * 0.75, 1);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.min(0.55, p.vida * 2) * Math.max(0, 1 - p.vida / 1.8);
      if (p.vida > 1.8) { this.grupo.remove(p.s); (p.s.material as THREE.Material).dispose(); this.parts.splice(i, 1); }
    }
  }
}

// Chispas: ráfaga corta con gravedad (máquina en error, soldadura)
export class Chispas {
  grupo = new THREE.Group(); private parts: { m: THREE.Mesh; v: THREE.Vector3; vida: number }[] = [];
  private static geo = new THREE.SphereGeometry(0.018, 4, 3);
  private static mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb860').multiplyScalar(8) });
  rafaga(origen: THREE.Vector3, n = 18) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(Chispas.geo, Chispas.mat); m.position.copy(origen); this.grupo.add(m);
      this.parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, Math.random() * 1.5), vida: 0 });
    }
  }
  actualizar(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.vida += dt; p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.02) { p.m.position.y = 0.02; p.v.y *= -0.3; p.v.x *= 0.6; }
      p.m.scale.setScalar(Math.max(0, 1 - p.vida / 0.9));
      if (p.vida > 0.9) { this.grupo.remove(p.m); this.parts.splice(i, 1); }
    }
  }
}

// Burbujas que suben dentro de un cilindro (la cápsula del horno)
export class Burbujas {
  grupo = new THREE.Group(); ritmo = 8; private acum = 0;
  private parts: { m: THREE.Mesh; v: number; fase: number }[] = [];
  private mat: THREE.MeshBasicMaterial;
  private static geo = new THREE.SphereGeometry(0.035, 8, 6);
  constructor(private base: THREE.Vector3, private radio: number, private alto: number, color: string) {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.6).multiplyScalar(1.3), transparent: true, opacity: 0.8 });
  }
  color(c: THREE.Color) { this.mat.color.copy(c).lerp(new THREE.Color('#ffffff'), 0.6).multiplyScalar(1.3); }
  actualizar(dt: number) {
    this.acum += dt * this.ritmo;
    while (this.acum > 1) {
      this.acum -= 1;
      const m = new THREE.Mesh(Burbujas.geo, this.mat); const a = Math.random() * 6.28, r = Math.random() * this.radio;
      m.position.set(this.base.x + Math.cos(a) * r, this.base.y, this.base.z + Math.sin(a) * r); m.scale.setScalar(0.5 + Math.random());
      this.grupo.add(m); this.parts.push({ m, v: 0.5 + Math.random() * 0.6, fase: Math.random() * 6 });
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.m.position.y += p.v * dt; p.fase += dt * 5; p.m.position.x += Math.sin(p.fase) * 0.003;
      if (p.m.position.y > this.base.y + this.alto) { this.grupo.remove(p.m); this.parts.splice(i, 1); }
    }
  }
}

// «Z» que suben sobre quien duerme (monocromas, del color de la interfaz)
let _texZ: THREE.Texture | null = null;
function texZ() {
  if (_texZ) return _texZ;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  g.font = '900 54px "Refugio Titulo", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(20,18,15,0.9)'; g.strokeText('Z', 32, 34); g.fillStyle = '#efe4c8'; g.fillText('Z', 32, 34);
  _texZ = new THREE.CanvasTexture(c); _texZ.colorSpace = THREE.SRGBColorSpace; return _texZ;
}
export class Zetas {
  grupo = new THREE.Group(); activo = false; private acum = 0; private parts: { s: THREE.Sprite; vida: number; x0: number }[] = [];
  constructor(public origen: THREE.Vector3) {}
  actualizar(dt: number) {
    if (this.activo) { this.acum += dt; if (this.acum > 0.8 || !this.parts.length) { this.acum = 0; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texZ(), transparent: true, depthWrite: false })); s.position.copy(this.origen); s.scale.setScalar(0.22); this.grupo.add(s); this.parts.push({ s, vida: 0, x0: this.origen.x }); } }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.vida += dt;
      p.s.position.y = this.origen.y + p.vida * 0.32; p.s.position.x = p.x0 + Math.sin(p.vida * 2.2) * 0.08 + p.vida * 0.18;
      p.s.scale.setScalar(0.16 + p.vida * 0.07); (p.s.material as THREE.SpriteMaterial).opacity = 0.75 * Math.min(1, p.vida * 3) * Math.max(0, 1 - p.vida / 2.6);
      if (p.vida > 2.6) { this.grupo.remove(p.s); (p.s.material as THREE.Material).dispose(); this.parts.splice(i, 1); }
    }
  }
}
