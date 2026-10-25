#!/usr/bin/env bash
# Installation Playwright robuste pour la CI.
#   playwright-install.sh deps    <browsers...>  → dépendances système seules (navigateurs restaurés du cache)
#   playwright-install.sh full    <browsers...>  → dépendances système + navigateurs
# Chaque phase a 3 tentatives bornées ; entre deux tentatives, l'état apt/dpkg laissé par une
# tentative coupée est réparé (sinon les tentatives suivantes échouent immédiatement sur le verrou
# ou sur « dpkg was interrupted »).
set -uo pipefail
mode="${1:?mode: deps|full}"; shift
browsers=("$@")

repair_apt() {
  sudo pkill -9 -x apt-get 2>/dev/null || true
  sudo pkill -9 -x dpkg 2>/dev/null || true
  sleep 2
  sudo rm -f /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend /var/cache/apt/archives/lock /var/lib/apt/lists/lock
  sudo dpkg --configure -a || true
}

attempt() { # <seconds> <label> <cmd...>
  local limit="$1" label="$2"; shift 2
  for i in 1 2 3; do
    echo "::group::$label — tentative $i/3 (≤ ${limit}s)"
    if timeout -k 20 "$limit" "$@"; then echo "::endgroup::"; return 0; fi
    echo "::endgroup::"
    echo "::warning::$label — tentative $i échouée (code $?)"
    repair_apt
    sleep $((i * 10))
  done
  echo "::error::$label — 3 tentatives échouées"
  return 1
}

attempt 420 "playwright install-deps" pnpm exec playwright install-deps "${browsers[@]}" || exit 1
if [ "$mode" = "full" ]; then
  attempt 420 "playwright install (navigateurs)" pnpm exec playwright install "${browsers[@]}" || exit 1
fi
