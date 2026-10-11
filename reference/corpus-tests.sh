#!/bin/sh
# Start a virtual screen, then let REBOL View run the core test suite of /tests. The container has no network.
Xvfb :9 -screen 0 1024x768x24 >/tmp/xvfb.log 2>&1 &
sleep 2
export DISPLAY=:9 HOME=/tmp
mkdir -p /tmp/run && cd /tmp/run
exec timeout 25 /rebol/rebol -qs /work/corpus-tests.r </dev/null
