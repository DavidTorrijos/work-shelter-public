// El servidor de verdad, en un puerto y una carpeta de datos propios: rutas malformadas, orígenes, token y mensajes hostiles.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PUERTO = 3700 + Math.floor(Math.random() * 60);
const DATOS = mkdtempSync(path.join(tmpdir(), 'refugio-prueba-'));
const BASE = `http://127.0.0.1:${PUERTO}`;
let srv: ChildProcess; let token = '';
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));
const abrir = (q: string, origen = BASE) => new Promise<WebSocket | number>(ok => {
  const ws = new WebSocket(`ws://127.0.0.1:${PUERTO}/ws${q}`, { headers: { Origin: origen } });
  ws.on('open', () => ok(ws)); ws.on('unexpected-response', (_r, res) => ok(res.statusCode ?? 0)); ws.on('error', () => ok(-1));
});

beforeAll(async () => {
  // node con el cargador de tsx en el mismo proceso (el CLI de tsx crea un hijo que sobreviviría al kill)
  srv = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], { env: { ...process.env, SHELTER_PUERTO: String(PUERTO), SHELTER_DATOS: DATOS, SHELTER_DEV: '' }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/salud')).ok) break; } catch {} await espera(150); }
  token = readFileSync(path.join(DATOS, 'token'), 'utf8').trim();
}, 30_000);
afterAll(() => { srv?.kill('SIGKILL'); rmSync(DATOS, { recursive: true, force: true }); });

describe('servidor local', () => {
  it('una URL malformada no lo tumba', async () => {
    for (const u of ['/%', '/%E0%A4%A', '/assets/%']) expect((await fetch(BASE + u)).status).toBe(400);
    expect((await fetch(BASE + '/salud')).ok).toBe(true);
  });
  it('la página no lleva el secreto del arranque', async () => {
    const r = await fetch(BASE + '/'); const t = await r.text();
    expect(t).not.toContain(token);
  });
  it('no sirve nada fuera de sus carpetas', async () => {
    const r = await fetch(BASE + '/assets/..%2Fpackage.json');
    expect(await r.text()).not.toContain('"name": "work-shelter"');
  });
  it('el WebSocket exige el token del arranque y un origen del propio refugio', async () => {
    expect(await abrir('')).toBe(403);
    expect(await abrir('?t=malo')).toBe(403);
    expect(await abrir(`?t=${token}`, 'http://evil.example')).toBe(403);
    expect(await abrir(`?t=${token}`, 'http://localhost:5173')).toBe(403); // los orígenes de Vite solo con SHELTER_DEV
    const ws = await abrir(`?t=${token}`); expect(typeof ws).toBe('object'); (ws as WebSocket).close();
  });
  it('mensajes hostiles no lo tumban ni reescriben el estado', async () => {
    const ws = await abrir(`?t=${token}`) as WebSocket;
    const respuestas: any[] = []; ws.on('message', d => respuestas.push(JSON.parse(String(d))));
    ws.send(JSON.stringify({ t: 'hola', version: 'prueba' }));
    ws.send(JSON.stringify({ t: 'lateral', sesionId: 'no-existe', pregunta: 'x' }));
    ws.send(JSON.stringify({ t: 'accion', nombre: 'guardar', peticion: 'g', datos: { parche: { salas: null, jugador: { chatarra: 1e9 } } } }));
    ws.send(JSON.stringify({ t: 'accion', nombre: 'jugador', peticion: 'j', datos: { parche: { chatarra: 1e9 } } }));
    ws.send(JSON.stringify({ t: 'accion', nombre: 'retirarSala', peticion: 'r', datos: { salaId: 'puerta' } }));
    await espera(800);
    expect((await fetch(BASE + '/salud')).ok).toBe(true);
    const estados = respuestas.filter(m => m.t === 'estado' || m.t === 'bienvenida');
    const ultimo = estados[estados.length - 1].estado;
    expect(ultimo.salas.length).toBeGreaterThan(5);
    expect(ultimo.jugador.chatarra).toBeLessThan(1e9);
    expect(respuestas.find(m => m.peticion === 'j')?.error).toBeTruthy();
    expect(respuestas.find(m => m.peticion === 'r')?.error).toBeTruthy();
    ws.close();
  });
  it('no recluta la raíz ni el hogar, y al retirar una sala cierra sus terminales', async () => {
    const ws = await abrir(`?t=${token}`) as WebSocket;
    const respuestas: any[] = []; ws.on('message', d => respuestas.push(JSON.parse(String(d))));
    const pedir = (nombre: string, datos: any, peticion: string) => ws.send(JSON.stringify({ t: 'accion', nombre, peticion, datos }));
    pedir('reclutar', { ruta: '/' }, 'raiz'); pedir('reclutar', { ruta: '~' }, 'hogar');
    const carpeta = mkdtempSync(path.join(tmpdir(), 'refugio-recluta-'));
    pedir('reclutar', { ruta: carpeta }, 'rec');
    await espera(1500);
    expect(respuestas.find(m => m.peticion === 'raiz')?.error).toBeTruthy();
    expect(respuestas.find(m => m.peticion === 'hogar')?.error).toBeTruthy();
    const id = respuestas.find(m => m.peticion === 'rec')?.datos?.id; expect(id).toBeTruthy();
    ws.send(JSON.stringify({ t: 'terminalAbrir', id: 'prueba-term', cwd: carpeta, cols: 80, filas: 24 }));
    await espera(800);
    pedir('retirarSala', { salaId: id }, 'ret'); await espera(800);
    expect(respuestas.find(m => m.peticion === 'ret')?.error).toBeFalsy();
    const antes = respuestas.length;
    ws.send(JSON.stringify({ t: 'terminalEntrada', id: 'prueba-term', datos: 'echo VIVA-$((6*7))\r' }));
    await espera(800);
    expect(respuestas.slice(antes).some(m => m.t === 'terminalDatos' && /VIVA-42/.test(m.datos))).toBe(false);
    const repos = respuestas.filter(m => m.t === 'repos').pop()?.repos ?? {};
    expect(Object.keys(repos)).not.toContain(id);
    ws.close(); rmSync(carpeta, { recursive: true, force: true });
  }, 15_000);
  it('vincula una sala de repo a otra carpeta: conserva sitio y habitante, y la escena vuelve a la de su tipo', async () => {
    const ws = await abrir(`?t=${token}`) as WebSocket;
    const respuestas: any[] = []; ws.on('message', d => respuestas.push(JSON.parse(String(d))));
    const pedir = (nombre: string, datos: any, peticion: string) => ws.send(JSON.stringify({ t: 'accion', nombre, peticion, datos }));
    ws.send(JSON.stringify({ t: 'hola', version: 'prueba' }));
    const carpeta = mkdtempSync(path.join(tmpdir(), 'refugio-vincular-'));
    writeFileSync(path.join(carpeta, 'Cargo.toml'), '[package]\nname = "x"\n');
    pedir('vincularSala', { salaId: 'puerta', ruta: carpeta }, 'servicio');
    pedir('vincularSala', { salaId: 'requests', ruta: '/' }, 'raiz');
    pedir('vincularSala', { salaId: 'requests', ruta: path.join(carpeta, 'no-existe') }, 'falta');
    pedir('vincularSala', { salaId: 'requests', ruta: carpeta }, 'vin');
    await espera(1500);
    pedir('vincularSala', { salaId: 'express', ruta: carpeta }, 'repetida');
    pedir('sala.quitarDecorado', { salaId: 'puerta' }, 'quitar');
    await espera(600);
    for (const p of ['servicio', 'raiz', 'falta', 'repetida', 'quitar']) expect(respuestas.find(m => m.peticion === p)?.error, p).toBeTruthy();
    expect(respuestas.find(m => m.peticion === 'vin')?.error).toBeFalsy();
    const ultimo = respuestas.filter(m => m.t === 'estado' || m.t === 'bienvenida').pop().estado;
    const sala = ultimo.salas.find((s: any) => s.id === 'requests');
    expect(sala).toMatchObject({ ruta: carpeta, nombre: path.basename(carpeta), tipo: 'repo' });
    expect(sala.decorado).toBeUndefined();
    expect(ultimo.habitantes.find((h: any) => h.id === 'lola')?.salaId).toBe('requests');
    expect(respuestas.filter(m => m.t === 'repos').pop()?.repos?.requests?.tipo).toBe('rust');
    ws.close(); rmSync(carpeta, { recursive: true, force: true });
  }, 15_000);
});
