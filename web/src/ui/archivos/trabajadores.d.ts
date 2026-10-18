// Los trabajadores de Monaco se importan con el sufijo ?worker de Vite
declare module '*?worker' {
  const Trabajador: { new (opciones?: { name?: string }): Worker };
  export default Trabajador;
}
