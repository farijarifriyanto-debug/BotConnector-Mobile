#!/bin/bash
# CI-only hermesc wrapper for the Mac Catalyst Debug smoke build.
#
# The Debug bundle is compiled by Xcode with `hermesc -Og`, which fails with
# "Error encoding bytecode" on the huge IPA dictionary module in `phonemize`
# (a TTS dependency). The same dev bundle compiles fine with `-O`. Swap the flag
# and leave everything else (dev bundle, Debug config) untouched.
# Used via HERMES_CLI_PATH from codemagic.yaml; remove once Hermes fixes -Og.
set -euo pipefail
REAL="${HERMESC_REAL:-${PODS_ROOT:?PODS_ROOT not set}/hermes-engine/destroot/bin/hermesc}"
args=()
for a in "$@"; do
  [ "$a" = "-Og" ] && a="-O"
  args+=("$a")
done
exec "$REAL" "${args[@]}"
