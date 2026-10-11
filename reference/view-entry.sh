#!/bin/sh
# Start a virtual screen, then run REBOL View with the given arguments.
Xvfb :9 -screen 0 1024x768x24 >/tmp/xvfb.log 2>&1 &
sleep 2
export DISPLAY=:9 HOME=/tmp
exec timeout "${REBOL_TIMEOUT:-60}" /rebol/rebol "$@"
