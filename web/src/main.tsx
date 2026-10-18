import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Motor } from './motor/render';
import { vigilarPrimerPlano } from './motor/foco';
import { Refugio } from './mundo/refugio';
import { Hud } from './ui/Hud';
import { Dialogo, intercoms } from './ui/Dialogo';
import { Paneles } from './ui/Paneles';
import { Terminales } from './ui/Terminales';
import { Barra } from './ui/Barra';
import { Navegadores, navegadores, abrirNavegador } from './ui/Navegadores';
import { ClienteGit } from './ui/git/ClienteGit';
import { ventanaGit, abrirGit } from './ui/git/ventana';
import { Explorador } from './ui/archivos/Explorador';
import { ventanaArchivos, abrirArchivos } from './ui/archivos/ventana';
import { Avisos, Carga, CargaSalas } from './ui/Puente';
import { Pletina } from './ui/Discoteca';
import { Buscador } from './ui/Buscador';
import { cliente, vivo } from './red/cliente';
import { juego } from './ui/estadoJuego';

async function cargarFuentes() {
  const familias = ['800 40px "Refugio Titulo"', '600 40px "Refugio Rotulo"', '400 20px "Refugio Mono"', '500 20px "Refugio Mono"', '600 20px "Refugio Mono"', '20px "Refugio CRT"'];
  await Promise.all(familias.map(f => document.fonts.load(f, 'ÁÑáñ¿¡')));
}

const fuentes = cargarFuentes();
const motor = new Motor(document.getElementById('mundo')!);
(window as any).__motor = motor;
import('./mundo/animaciones').then(m => { (window as any).__anim = m; });   // QA: componer y probar clips desde la página
(window as any).__THREE = THREE;   // para la QA (rayos, cajas)
let refugio: Refugio;
const listo = fuentes.then(() => { refugio = new Refugio(motor); (window as any).__refugio = refugio; return refugio.listo; });
(window as any).__ready = () => listo;
createRoot(document.getElementById('ui')!).render(<><Hud /><Dialogo /><Paneles /><Terminales /><Navegadores /><ClienteGit /><Explorador /><div className="columna-izquierda"><Pletina /><Barra /></div><Avisos /><Buscador /><CargaSalas /><Carga /></>);
cliente.conectar();
Object.assign(window as any, { __juego: juego, __cliente: cliente, __vivo: vivo, __intercoms: intercoms, __navegadores: { navegadores, abrirNavegador }, __git: { ventanaGit, abrirGit }, __archivos: { ventanaArchivos, abrirArchivos } }); // para QA y depuración
(window as any).__salirRefugio = () => new Promise<void>(ok => { cliente.enviar({ t: 'salir' }); setTimeout(ok, 300); });
// tecla de pánico (Electron): lo abierto sale a tu escritorio. Contesta al momento; si no hay conexión, Electron se lo
// pide al servidor por su cuenta (./shelter superficie)
(window as any).__superficie = () => { if (!vivo.get().conectado) return Promise.reject(new Error('Sin conexión')); cliente.accion('superficie.sacar', { todo: true, ventanaNueva: true }).catch(() => {}); return Promise.resolve(true); };
motor.arrancar();
// fuera de primer plano el motor deja de pintar y la interfaz deja de animarse
vigilarPrimerPlano(activo => motor.alCambiarPrimerPlano(activo));
