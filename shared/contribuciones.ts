// Matriz de contribuciones (la de cuadritos verdes del perfil de GitHub): colores y rachas. La usan la pantalla de la
// sala de Control de Versiones y la pestaña GitHub del cliente de git.
export const VERDES_GITHUB = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

/** Rachas de días seguidos con contribuciones: la actual (si hoy aún no hay nada, cuenta hasta ayer) y la mejor. */
export function rachas(dias: { n: number }[]) {
  let mejor = 0, seguidos = 0;
  for (const d of dias) { seguidos = d.n ? seguidos + 1 : 0; mejor = Math.max(mejor, seguidos); }
  let actual = 0, i = dias.length - 1;
  if (i >= 0 && !dias[i].n) i--;
  for (; i >= 0 && dias[i].n; i--) actual++;
  return { actual, mejor };
}
