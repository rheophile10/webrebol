#!/bin/sh
# Run each case of /cases/cases.hex in a new REBOL View session. One line of the file is one case as hexadecimal text.
Xvfb :9 -screen 0 1024x768x24 >/tmp/xvfb.log 2>&1 &
sleep 2
export DISPLAY=:9 HOME=/tmp
cd /tmp
while IFS= read -r line; do
  echo "@@BEGIN $line"
  timeout 20 /rebol/rebol -qs /work/do.r "$line" </dev/null
  echo "@@END"
done < /cases/cases.hex
