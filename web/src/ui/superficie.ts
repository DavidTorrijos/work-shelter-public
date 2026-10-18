// Salir a la superficie desde el juego: una conversación o una terminal sigue en una terminal de tu escritorio
// (iTerm, o Terminal). Lo hace el servidor (server/escritorio.ts); aquí solo se pide y se avisa si no se puede.
import { cliente, vivo } from '../red/cliente';
import { SFX } from '../audio/sonido';

export function sacarASuperficie(que: { sesiones?: string[]; terminales?: string[]; todo?: boolean }) {
  SFX.clic();
  cliente.accion('superficie.sacar', que).catch((e: Error) => {
    SFX.noPermitido();
    vivo.set(x => ({ avisos: [...x.avisos.slice(-4), { id: Date.now() + Math.random(), nivel: 'error', texto: e.message }] }));
  });
}
