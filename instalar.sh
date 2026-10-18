#!/bin/bash
# work-shelter — instalación como app de macOS en un solo comando:
#   curl -fsSL https://raw.githubusercontent.com/DavidTorrijos/work-shelter-public/main/instalar.sh | bash
# Descarga el juego en ~/.work-shelter-public (o $SHELTER_CODIGO), lo prepara (./shelter instalar-app: Node, dependencias,
# material CC0, compilación) y deja /Applications/work-shelter-public.app con su icono, fijada en el Dock. Volver a
# ejecutarlo pone el juego al día. Opciones para la app detrás de «bash -s --»: --sin-dock, --destino <ruta .app>.
# Todo va dentro de una función: con «curl | bash», bash lee el guion de la entrada y así lo lee entero antes de empezar.
set -euo pipefail

principal() {
  local REPO="${SHELTER_REPO:-https://github.com/DavidTorrijos/work-shelter-public.git}"
  local CODIGO="${SHELTER_CODIGO:-$HOME/.work-shelter-public}"
  amarillo() { printf '\033[33m%s\033[0m\n' "$*"; }
  verde() { printf '\033[32m%s\033[0m\n' "$*"; }
  rojo() { printf '\033[31m%s\033[0m\n' "$*" >&2; }

  [ "$(uname -s)" = "Darwin" ] || { rojo "work-shelter solo funciona en macOS."; exit 1; }
  # git viene con las herramientas de línea de comandos de Xcode; sin ellas, macOS ofrece instalarlas
  if ! xcode-select -p >/dev/null 2>&1; then
    rojo "Faltan las herramientas de línea de comandos de macOS (git). Se abre su instalador:"
    rojo "  cuando termine, vuelve a ejecutar este mismo comando."
    xcode-select --install >/dev/null 2>&1 || true
    exit 1
  fi

  if [ -d "${CODIGO}/.git" ]; then
    amarillo "Poniendo al día el juego en ${CODIGO}…"
    git -C "${CODIGO}" pull --ff-only --quiet </dev/null || amarillo "No he podido ponerlo al día (¿cambios tuyos en ${CODIGO}?): sigo con lo que hay."
  elif [ -e "${CODIGO}" ]; then
    rojo "${CODIGO} ya existe y no es una copia del juego: muévelo o elige otra carpeta con SHELTER_CODIGO=/otra/ruta."
    exit 1
  else
    amarillo "Descargando el juego en ${CODIGO}…"
    git clone --quiet "$REPO" "${CODIGO}" </dev/null
  fi

  /bin/bash "${CODIGO}/shelter" instalar-app "$@" </dev/null

  local APP="/Applications/work-shelter-public.app" i
  for ((i = 1; i <= $#; i++)); do [ "${!i}" = "--destino" ] && { local j=$((i + 1)); APP="${!j}"; }; done
  verde "Listo: work-shelter está en ${APP}."
  echo "Ábrelo desde Aplicaciones o el Dock. El código del juego queda en ${CODIGO}."
  [ -n "${SHELTER_SIN_ABRIR:-}" ] || open "$APP" || true
}

principal "$@"
