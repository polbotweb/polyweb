#!/usr/bin/env bash
# Installation Playwright robuste pour la CI.
#   playwright-install.sh deps    <browsers...>  → dépendances système seules (navigateurs restaurés du cache)
#   playwright-install.sh full    <browsers...>  → dépendances système + navigateurs
# Chaque phase a 3 tentatives bornées (600 s) ; entre deux tentatives, l'état apt/dpkg laissé par une
# tentative coupée est réparé (sinon les tentatives suivantes échouent immédiatement sur le verrou
# ou sur « dpkg was interrupted »).
set -uo pipefail
mode="${1:?mode: deps|full}"; shift
browsers=("$@")

# Une tentative coupée par `timeout` laisse le `sudo apt-get` de Playwright vivant, verrou dpkg tenu
# (cas observé : miroir apt lent, run 40237326474). On attend d'abord qu'il termine — ses paquets
# téléchargés restent en cache pour la tentative suivante — puis on le tue et on répare dpkg.
apt_busy() { pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null; }
repair_apt() {
  for _ in $(seq 1 24); do apt_busy || break; sleep 5; done
  if apt_busy; then
    echo "apt/dpkg toujours actif après 120 s : arrêt forcé"
    sudo pkill -9 -x apt-get 2>/dev/null || true
    sudo pkill -9 -x dpkg 2>/dev/null || true
    sleep 2
  fi
  sudo dpkg --configure -a || true
}

# Miroir lent ou coupures : apt réessaie lui-même chaque téléchargement avant d'abandonner.
echo 'Acquire::Retries "5"; Acquire::http::Timeout "30"; Acquire::https::Timeout "30";' | sudo tee /etc/apt/apt.conf.d/80-ci-retries >/dev/null

# Miroir Azure très lent (≈ 40 ko/s observé, runs 40292262172 / 40295000348 / 40295409861) : à partir de
# la 2e tentative on bascule les sources apt vers un autre miroir officiel puis `apt-get update`.
# Les .deb déjà téléchargés restent dans /var/cache/apt/archives et ne sont pas re-téléchargés.
FALLBACK_MIRRORS=("http://archive.ubuntu.com/ubuntu/" "http://us.archive.ubuntu.com/ubuntu/")
switch_mirror() { # <index>
  local m="${FALLBACK_MIRRORS[$1]:-}"
  [ -n "$m" ] || return 0
  echo "Bascule du miroir apt vers $m"
  for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list; do
    [ -f "$f" ] || continue
    sudo sed -i -E "s#mirror\+file:/etc/apt/apt-mirrors\.txt/?#${m}#g; s#https?://(azure\.)?archive\.ubuntu\.com/ubuntu/?#${m}#g; s#https?://us\.archive\.ubuntu\.com/ubuntu/?#${m}#g" "$f"
  done
  timeout -k 10 120 sudo apt-get update -o Acquire::Retries=3 >/dev/null || echo "::warning::apt-get update sur $m incomplet"
}

attempt() { # <seconds> <label> <cmd...>
  local limit="$1" label="$2" rc; shift 2
  for i in 1 2 3; do
    [ "$i" -gt 1 ] && switch_mirror $((i - 2))
    echo "::group::$label — tentative $i/3 (≤ ${limit}s)"
    if timeout -k 20 "$limit" "$@"; then echo "::endgroup::"; return 0; else rc=$?; fi
    echo "::endgroup::"
    echo "::warning::$label — tentative $i échouée (code $rc)"
    repair_apt
    sleep $((i * 10))
  done
  echo "::error::$label — 3 tentatives échouées"
  return 1
}

attempt 600 "playwright install-deps" pnpm exec playwright install-deps "${browsers[@]}" || exit 1
if [ "$mode" = "full" ]; then
  attempt 600 "playwright install (navigateurs)" pnpm exec playwright install "${browsers[@]}" || exit 1
fi
