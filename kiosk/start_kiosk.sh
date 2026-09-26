#!/usr/bin/env bash
#
# start_kiosk.sh - Arranque del kiosco grafico de Monli.
#
# Lo ejecuta `monli-kiosk.service` dentro de una sesion X local (lanzada con
# `startx`). Se encarga de:
#   1. Ocultar el puntero del raton.
#   2. Desactivar el salvapantallas y el gestor de energia del monitor.
#   3. Lanzar Chromium a pantalla completa contra el dashboard local.
#
# Uso:  ./start_kiosk.sh
# Config: variable KIOSK_URL (por defecto http://127.0.0.1:8080)
#
set -u

KIOSK_URL="${KIOSK_URL:-http://127.0.0.1:8080}"

# 1) Ocultar el puntero del raton.
unclutter -idle 0.1 -root &

# 2) Desactivar el apagado/atenuacion de la pantalla.
xset s off
xset -dpms
xset s noblank

# 3) Chromium a pantalla completa.
if command -v chromium >/dev/null 2>&1; then
	BROWSER="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
	BROWSER="chromium-browser"
else
	echo "start_kiosk: no se encontro Chromium (chromium / chromium-browser)." >&2
	exit 1
fi

exec "$BROWSER" \
	--kiosk \
	--noerrdialogs \
	--disable-infobars \
	--check-for-update-interval=31536000 \
	--use-gl=angle \
	--use-angle=swiftshader \
	--enable-unsafe-swiftshader \
	--disable-gpu-compositing \
	--disable-dev-shm-usage \
	--disable-session-crashed-bubble \
	--no-first-run \
	--user-data-dir="${HOME}/.config/chromium-kiosk" \
	"$KIOSK_URL"
