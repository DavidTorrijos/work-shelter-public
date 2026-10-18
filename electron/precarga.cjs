// Puente mínimo entre el juego y su ventana: el juego sabe si la ventana tiene el foco del sistema, para no pintar
// cuando está detrás de otra aplicación (ver web/src/motor/foco.ts), pide el permiso del micrófono para dictar y maneja
// el Chrome donde suena Spotify.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shelterVentana', {
  alCambiarFoco: f => { ipcRenderer.on('foco', (_e, conFoco) => f(conFoco)); },
  pedirMicrofono: () => ipcRenderer.invoke('microfono'),   // para dictar en el intercomunicador
});
// Spotify suena en un Chrome sin ventana (electron/chromeRemoto.cjs): el navegador de Spotify del juego enseña su
// página y le pasa ratón y teclado; la pletina le pregunta qué suena (Navegadores.tsx, Discoteca.tsx)
contextBridge.exposeInMainWorld('shelterRemoto', {
  orden: (orden, ...a) => ipcRenderer.invoke('remoto', orden, ...a),
  alFotograma: f => { ipcRenderer.on('remoto:fotograma', (_e, jpeg, ancho, alto) => f(jpeg, ancho, alto)); },
  alEstado: f => { ipcRenderer.on('remoto:estado', (_e, estado) => f(estado)); },
});
