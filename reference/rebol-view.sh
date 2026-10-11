#!/bin/sh
# Run a REBOL script of this folder in REBOL View 2.7.8. Example: ./rebol-view.sh -qs probe-view.r
here="$(cd "$(dirname "$0")" && pwd)"
exec docker run --rm --init -v "$here/rebol-view-278-4-3/releases/rebol-view:/rebol:ro" -v "$here:/work" webrebol-rebview "$@" </dev/null
