// Catálogo de las fuentes de las integraciones, compartido por el servidor y el cliente: nombre, etiqueta corta,
// color y qué trae cada una. El orden es el de la cámara acorazada. Una fuente nueva: aquí, su conector en
// server/integraciones/<id>.ts, sus datos DEMO en server/integraciones/demo.ts y su ficha en web/src/ui/Camara.tsx.
export const FUENTES = ['outlook', 'google', 'discord', 'slack', 'github', 'linear'] as const;
export type FuenteId = typeof FUENTES[number];

export interface InfoFuente {
  nombre: string;            // en la cámara acorazada y en los paneles
  corto: string;             // en la insignia del tablón
  color: string;             // insignia, eventos y agenda
  calendario?: boolean;      // trae eventos
  chat?: boolean;            // conversaciones por canal (el tablón las trata como chats)
  completa?: boolean;        // el sondeo trae TODO lo pendiente: lo leído en su web sale solo del tablón
  oauth?: string;            // se conecta iniciando sesión en el navegador («Conectar con …»)
  canales?: boolean;         // se eligen los canales a vigilar una vez conectada
}

export const INFO_FUENTE: Record<FuenteId, InfoFuente> = {
  outlook: { nombre: 'Microsoft 365 (Outlook)', corto: 'Outlook', color: '#6f8fb0', calendario: true, completa: true, oauth: 'Microsoft' },
  google: { nombre: 'Google (Gmail y Calendar)', corto: 'Gmail', color: '#b0a05a', calendario: true, completa: true, oauth: 'Google' },
  discord: { nombre: 'Discord (bot)', corto: 'Discord', color: '#b07a4a', chat: true, canales: true },
  slack: { nombre: 'Slack', corto: 'Slack', color: '#a07088', chat: true, canales: true },
  github: { nombre: 'GitHub', corto: 'GitHub', color: '#8a96a8', completa: true },
  linear: { nombre: 'Linear', corto: 'Linear', color: '#7fae86', completa: true },
};
export const FUENTES_CALENDARIO = FUENTES.filter(f => INFO_FUENTE[f].calendario);
