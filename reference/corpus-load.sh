#!/bin/sh
# Start a virtual screen, then let REBOL View load each script of /corpus. The container has no network.
Xvfb :9 -screen 0 1024x768x24 >/tmp/xvfb.log 2>&1 &
sleep 2
export DISPLAY=:9 HOME=/tmp
cd /tmp
exec timeout 600 /rebol/rebol -qs /work/corpus-load.r </dev/null
