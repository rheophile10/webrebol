#!/bin/sh
# Run a REBOL script in REBOL Core 2.7.8. Example: ./rebol-core.sh -qs probe.r
here="$(cd "$(dirname "$0")" && pwd)"
exec "$here/rebol-core-278-4-10/rebol-core/rebol" "$@" </dev/null
