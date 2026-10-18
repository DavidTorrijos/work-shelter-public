// Música propia de las salas que la tienen (la discoteca sin Spotify, el hilo musical de Chapa y Pintura).
// Contrato con el mundo: `pulsoMusica(sala)` dice si suena y por dónde va el compás, para que las luces y quien baila
// vayan a tiempo. (Lo rellena el motor de audio; mientras no suene nada, devuelve `sonando: false`.)

export interface PulsoMusica {
  sonando: boolean;   // suena música en esa sala (la propia o, en la discoteca, Spotify)
  bpm: number;        // golpes por minuto del tema que suena
  fase: number;       // 0..1 dentro del golpe actual (0 = justo en el golpe)
  golpe: number;      // número de golpe desde que empezó el tema (cada 4, un compás)
  energia: number;    // 0..1, cuánto «empuja» ahora el tema (sube en los estribillos, baja en los puentes)
}

const SILENCIO: PulsoMusica = { sonando: false, bpm: 118, fase: 0, golpe: 0, energia: 0 };
type Fuente = (sala: string) => PulsoMusica | null;
let fuente: Fuente = () => null;

/** El motor de audio registra aquí de dónde sale el pulso */
export function registrarPulso(f: Fuente) { fuente = f; }
export function pulsoMusica(sala: string): PulsoMusica { return fuente(sala) ?? SILENCIO; }
