import { describe, it, expect } from 'vitest';
import { accionJuego, asegurarJugador, recompensaTarea } from './juego.ts';
import { estadoInicial } from './estado.ts';

const almacen = () => { const a: any = { estado: estadoInicial(), cambiar(f: (e: any) => void) { f(a.estado); } }; asegurarJugador(a); return a; };

describe('economía validada por el servidor', () => {
  it('no se compra sin chatarra suficiente', () => {
    const a = almacen(); a.estado.jugador.chatarra = 10;
    expect(() => accionJuego('comprar', { articulo: 'propulsor' }, a)).toThrow(/faltan/i);
    expect(a.estado.jugador.chatarra).toBe(10);
  });
  it('los puntos de tiro tienen techo y hay que esperar entre rondas', () => {
    const a = almacen(); const antes = a.estado.jugador.chatarra;
    const r: any = accionJuego('tiro', { puntos: 99999 }, a);
    expect(r.mejor).toBeLessThanOrEqual(600);
    expect(a.estado.jugador.chatarra - antes).toBeLessThanOrEqual(50);
    expect(() => accionJuego('tiro', { puntos: 10 }, a)).toThrow(/espera/i);
  });
  it('no se cosecha lo que no está maduro', () => {
    const a = almacen(); a.estado.jugador.cultivos[0].fase = 2;
    expect(() => accionJuego('cosechar', { bancal: 0 }, a)).toThrow(/madura/i);
  });
  it('cada tarea terminada da chatarra', () => {
    const a = almacen(); const antes = a.estado.jugador.chatarra;
    const r = recompensaTarea(a, 6);
    expect(r.chatarra).toBeGreaterThan(0);
    expect(a.estado.jugador.chatarra).toBe(antes + r.chatarra);
  });
});
