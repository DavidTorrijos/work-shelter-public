// Datos simulados plausibles (DEMO) para cuando una fuente no está configurada. En español, con proyectos
// ficticios del refugio y fechas relativas a «ahora» (zona horaria del sistema). Se generan de forma estable por día para no
// parpadear. Todas las personas, equipos y empresas son inventados.
import type { Notificacion, Evento, Prioridad, FuenteId } from './adaptadores.ts';
import { inicioDia } from './normalizar.ts';

function semilla(n: number) { let s = n >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const MIN = 60_000, H = 60 * MIN;

// [autor, título, fragmento, prioridad]
const CORREOS: [string, string, string, Prioridad][] = [
  ['Irene Valdés', 'Revisión de la guía de migración', 'Te paso los cambios de la guía a la versión 5; si te encaja la publicamos hoy.', 'alta'],
  ['Tomás Ibarra', 'Factura de octubre — proveedor de hosting', 'Adjunto la factura. Recordad que el plan sube de precio el mes que viene si no migramos.', 'media'],
  ['Nerea Calvo', 'Plan de pruebas de la nueva versión', 'He dejado el plan de pruebas en la wiki. ¿Le echas un ojo antes del viernes?', 'media'],
  ['Avisos de CI', '[express] Build fallida en la rama main', 'El job «test» ha fallado en el commit a3f9c21: 2 tests en router.test.js no pasan.', 'alta'],
  ['Bruno Esteve', 'Resultados del benchmark', 'Con el corpus grande sale un 12 % más rápido que la versión anterior. ¿Lo contamos en el changelog?', 'media'],
  ['Intendencia del Refugio', 'Inventario mensual del almacén', 'Antes del día 30, apuntad en la hoja lo que hayáis sacado del almacén de la planta -2.', 'baja'],
  ['Olga Prieto', 'Reunión con el cliente movida al jueves', 'El cliente no puede el miércoles; la pasamos al jueves a las 11:30 con el mismo enlace.', 'media'],
];
const GMAIL: [string, string, string, Prioridad][] = [
  ['Asociación de Vecinos del Refugio', 'Turnos de limpieza del filtro de aire', 'Esta semana te toca el jueves. Si no puedes, cámbialo con alguien en el tablón de la planta baja.', 'baja'],
  ['Hugo Lara', '¿Quedamos para el hackathon?', 'Tengo una idea para el reto de accesibilidad: necesito a alguien que sepa de Rust. ¿Te apuntas?', 'media'],
  ['Biblioteca Municipal', 'Tu préstamo vence mañana', '«Patrones de diseño para refugios» vence mañana. Puedes renovarlo una vez desde tu cuenta.', 'baja'],
  ['Rosa Quintana', 'Fotos del viaje', 'Ya están las fotos en la carpeta compartida. La del atardecer es para enmarcar.', 'alta'],
];
const DISCORD: [string, string, string, Prioridad][] = [
  ['#express', 'Iker', '¿Alguien ha tocado la configuración de los tests? Me tardan el doble en arrancar.', 'media'],
  ['#express', 'Irene', '@Supervisor ¿puedes aprobar el PR #42? Es solo documentación.', 'alta'],
  ['#awesome', 'Nerea', 'He ordenado la lista por temas. Quedan tres enlaces rotos.', 'baja'],
  ['#sala-comun', 'Tomás', 'Hoy hay sopa de setas de la hidroponía en el comedor 🍲', 'baja'],
  ['#avisos-ci', 'bot-ci', 'La documentación, desplegada en preview: https://preview.example.com/docs', 'baja'],
  ['#ripgrep', 'Bruno', '@equipo-rendimiento la búsqueda se queda colgada con un archivo de 4 GB, ¿alguna idea?', 'alta'],
];
const SLACK: [string, string, string, Prioridad][] = [
  ['#producto', 'Olga Prieto', 'Mañana cerramos el alcance del lanzamiento. Traed vuestras dudas a la reunión de las 10.', 'media'],
  ['@Iker Sáez', 'Iker Sáez', '¿Tienes un minuto para mirar el error del carrito? Creo que es la caché del navegador.', 'alta'],
  ['#random', 'Hugo Lara', 'Alguien se ha dejado un táper en la nevera de la planta -2 desde el lunes 👀', 'baja'],
  ['#soporte', 'Rosa Quintana', '@here hay tres clientes que no reciben el correo de confirmación del pedido.', 'media'],
];
const GITHUB: [string, string, string, Prioridad, string][] = [
  ['refugio/express', 'PR · Rutas con parámetros opcionales', 'te piden revisión', 'alta', 'pull/42'],
  ['refugio/requests', 'Issue · El reintento no respeta el timeout', 'te lo han asignado', 'alta', 'issues/17'],
  ['refugio/awesome', 'Release · v2.1.0', 'sigues el repositorio', 'baja', 'releases'],
  ['refugio/ripgrep', 'CI · Fallo en «bench»', 'actividad de CI', 'media', 'actions'],
];
const LINEAR: [string, string, string, Prioridad][] = [
  ['REF-212', 'Irene Valdés', 'Te han asignado «Rutas con barra final duplicada» (express).', 'media'],
  ['REF-219', 'Iker Sáez', 'Comentario en «Migrar rutas al nuevo router»: «¿Lo dejamos para el siguiente ciclo?»', 'baja'],
  ['REF-231', 'Nerea Calvo', '«Reintentos con espera exponencial» ha pasado a En revisión.', 'baja'],
  ['REF-240', 'Bruno Esteve', 'Te han mencionado en «Buscar dentro de archivos comprimidos» (ripgrep).', 'alta'],
];

export function demoNotificaciones(fuente: FuenteId): Notificacion[] {
  const dia = inicioDia();
  const r = semilla(Math.floor(dia / 86400000) * 7 + fuente.length);
  const ahora = Date.now();
  const n = (i: number, x: Partial<Notificacion> & { prioridad: Prioridad }): Notificacion =>
    ({ id: `demo-${fuente}-${Math.floor(dia / 86400000)}-${i}`, fuente, autor: '', titulo: '', fragmento: '', fecha: ahora - Math.floor(5 + r() * 300) * MIN, demo: true, ...x });
  switch (fuente) {
    case 'outlook': return CORREOS.map(([autor, titulo, fragmento, prioridad], i) => n(i, { autor, titulo, fragmento, prioridad, enlace: 'https://outlook.office.com/mail/' }));
    case 'google': return GMAIL.map(([autor, titulo, fragmento, prioridad], i) => n(i, { autor, titulo, fragmento, prioridad, canal: 'Recibidos', enlace: 'https://mail.google.com/mail/u/0/#inbox' }));
    case 'discord': return DISCORD.map(([canal, autor, fragmento, prioridad], i) => n(i, { canal, hilo: `demo-discord-${canal}`, autor, titulo: canal, fragmento, prioridad, enlace: 'https://discord.com/channels/@me' }));
    case 'slack': return SLACK.map(([canal, autor, fragmento, prioridad], i) => n(i, { canal, hilo: `demo-slack-${canal}`, autor, titulo: canal, fragmento, prioridad, enlace: 'https://app.slack.com/client' }));
    case 'github': return GITHUB.map(([repo, titulo, fragmento, prioridad], i) => n(i, { canal: repo, hilo: `demo-github-${i}`, autor: repo, titulo, fragmento, prioridad, enlace: 'https://github.com/notifications' }));
    case 'linear': return LINEAR.map(([clave, autor, fragmento, prioridad], i) => n(i, { canal: clave, autor, titulo: `${clave} · ${autor}`, fragmento, prioridad, enlace: 'https://linear.app/' }));
  }
}

// [día (0 = hoy), hora, duración en horas (≥ 24: todo el día), título, videollamada, lugar]
type EventoDemo = [number, number, number, string, string?, string?];
const EVENTOS: Partial<Record<FuenteId, EventoDemo[]>> = {
  outlook: [
    [0, 10, 0.25, 'Cambio de turno del refugio', 'https://teams.microsoft.com/l/meetup-join/demo'], [0, 12, 1, 'Revisión del plan de pruebas con Nerea', 'https://teams.microsoft.com/l/meetup-join/demo2'],
    [0, 16.5, 0.5, 'Llamada con el cliente: lanzamiento', 'https://teams.microsoft.com/l/meetup-join/demo3'], [1, 10, 0.25, 'Cambio de turno del refugio', 'https://teams.microsoft.com/l/meetup-join/demo'],
    [1, 11, 1.5, 'Planificación del ciclo 14'], [2, 10, 1, 'Demo interna: la versión 5'], [3, 11.5, 1, 'Reunión con el cliente (movida)', 'https://teams.microsoft.com/l/meetup-join/demo4'],
    [4, 13, 0, 'Simulacro de evacuación', undefined, 'Puerta Principal, planta baja'],
  ],
  google: [
    [0, 19, 1, 'Entrenamiento de escalada', undefined, 'Rocódromo de la planta -3'], [1, 13.5, 1, 'Comida con Hugo', 'https://meet.google.com/demo-abc-def'],
    [2, 0, 24, 'Cumpleaños de Rosa'], [3, 18, 1.5, 'Club de lectura', 'https://meet.google.com/demo-ghi-jkl'],
  ],
};
export function demoEventos(fuente: FuenteId): Evento[] {
  const dia = inicioDia();
  return (EVENTOS[fuente] ?? []).map(([d, h, dur, titulo, video, lugar], i) => {
    const todo = dur >= 24;
    const inicio = dia + d * 86400000 + (todo ? 0 : h * H);
    return { id: `demo-${fuente}-ev-${Math.floor(dia / 86400000)}-${i}`, fuente, titulo, inicio, fin: todo ? inicio + 86400000 : inicio + Math.max(dur, 0.25) * H, todoElDia: todo, videollamada: video, lugar, enlace: fuente === 'outlook' ? 'https://outlook.office.com/calendar/' : 'https://calendar.google.com/', demo: true };
  });
}

// Panel de Linear en DEMO (mismo formato que el real: mis issues por estado y ciclo actual), con proyectos ficticios
export function demoPanelLinear() {
  const ahora = Date.now(), dia = 86400_000;
  const issue = (n: number, titulo: string, tipo: string, nombre: string, prioridad: number, proyecto: string, etiquetas: string[] = []) => ({
    id: 'demo-' + n, identificador: `REF-${n}`, titulo, url: 'https://linear.app/', prioridad, prioridadTexto: ['Sin prioridad', 'Urgente', 'Alta', 'Media', 'Baja'][prioridad],
    estado: { id: tipo, nombre, tipo }, equipo: 'REF', proyecto, ciclo: 14, etiquetas: etiquetas.map(x => ({ nombre: x, color: '#888' })), actualizada: ahora - n * 3600_000,
  });
  const grupos = [
    { tipo: 'started', nombre: 'En curso', issues: [issue(212, 'Rutas con barra final duplicada', 'started', 'En curso', 2, 'Express', ['bug']), issue(219, 'Migrar rutas al nuevo router', 'started', 'En curso', 3, 'Express'), issue(240, 'Buscar dentro de archivos comprimidos', 'started', 'En revisión', 2, 'Ripgrep'), issue(236, 'Sesiones con conexiones persistentes', 'started', 'En revisión', 3, 'Requests'), issue(238, 'Comprobar los enlaces rotos de la lista', 'started', 'En curso', 3, 'Awesome'), issue(239, 'Colores en la salida de Windows', 'started', 'En revisión', 2, 'Ripgrep')] },
    { tipo: 'unstarted', nombre: 'Por hacer', issues: [issue(231, 'Reintentos con espera exponencial', 'unstarted', 'Por hacer', 3, 'Requests', ['mejora']), issue(244, 'Sección nueva: herramientas de terminal', 'unstarted', 'Por hacer', 2, 'Awesome'), issue(247, 'Revisar la licencia de los ejemplos', 'unstarted', 'Por hacer', 4, 'Express')] },
    { tipo: 'backlog', nombre: 'Backlog', issues: [issue(198, 'Binarios para más arquitecturas', 'backlog', 'Backlog', 0, 'Ripgrep'), issue(201, 'Tipos para los adaptadores', 'backlog', 'Backlog', 4, 'Requests')] },
  ];
  return { yo: { name: 'Supervisor (demo)' }, misIssues: grupos, ciclos: [{ equipoId: 'demo', equipo: 'REF', nombre: 'Refugio', ciclo: { id: 'c14', numero: 14, nombre: 'Ciclo 14', inicio: ahora - 6 * dia, fin: ahora + 8 * dia, progreso: 46 } }], cuando: ahora, demo: true };
}

// Tablero del equipo en DEMO (mismo formato que tableroDeEquipo): columnas por estado del equipo con sus incidencias
export function demoTableroLinear() {
  const p = demoPanelLinear();
  const todas = p.misIssues.flatMap(g => g.issues);
  const extra = [
    { id: 'demo-251', identificador: 'REF-251', titulo: 'Caché de imágenes en la portada', prioridad: 3, prioridadTexto: 'Media', estado: { id: 'started', nombre: 'En curso', tipo: 'started' }, proyecto: 'Taller', asignado: 'Iker Sáez' },
    { id: 'demo-188', identificador: 'REF-188', titulo: 'Plantilla de correo de bienvenida', prioridad: 4, prioridadTexto: 'Baja', estado: { id: 'completed', nombre: 'Hecho', tipo: 'completed' }, proyecto: 'Escaparate', asignado: 'Irene Valdés' },
    { id: 'demo-190', identificador: 'REF-190', titulo: 'Exportar la paleta a la herramienta de diseño', prioridad: 3, prioridadTexto: 'Media', estado: { id: 'completed', nombre: 'Hecho', tipo: 'completed' }, proyecto: 'Marca', asignado: 'Supervisor (demo)' },
  ];
  const issues = [...todas, ...extra] as any[];
  const estados = [['backlog', 'Backlog'], ['unstarted', 'Por hacer'], ['started', 'En curso'], ['review', 'En revisión'], ['completed', 'Hecho']];
  return { equipo: 'REF', nombre: 'Refugio', demo: true, columnas: estados.map(([tipo, nombre]) => ({ id: tipo, nombre, tipo, issues: issues.filter(i => tipo === 'review' ? i.estado.nombre === 'En revisión' : i.estado.tipo === tipo && i.estado.nombre !== 'En revisión') })) };
}
