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
# (cas observé : miroir apt lent, run 40237326474 ; workflow Preview, runs 40404640465 / 40414379557).
# Défense 1 : apt attend lui-même le verrou (`DPkg::Lock::Timeout`, ci-dessous) au lieu d'échouer
# aussitôt (code 100). Défense 2 : entre deux tentatives, attente bornée qu'aucun apt/dpkg ne tourne
# et que les verrous soient libres — ses paquets téléchargés restent en cache — sinon arrêt forcé
# puis réparation de dpkg.
APT_LOCKS=(/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock)
apt_procs() { pgrep -x apt-get >/dev/null || pgrep -x apt >/dev/null || pgrep -x dpkg >/dev/null; }
# Verrou tenu : `fuser` (psmisc, présent sur les runners Ubuntu) ; à défaut, seuls les processus comptent.
apt_locked() { command -v fuser >/dev/null && sudo fuser "${APT_LOCKS[@]}" >/dev/null 2>&1; }
apt_busy() { apt_procs || apt_locked; }
repair_apt() {
  # Attente bornée (≤ 300 s, le même délai que DPkg::Lock::Timeout) que l'apt-get orphelin termine.
  for _ in $(seq 1 60); do apt_busy || break; sleep 5; done
  if apt_busy; then
    echo "apt/dpkg toujours actif après 300 s : arrêt forcé"
    sudo pkill -9 -x apt-get 2>/dev/null || true
    sudo pkill -9 -x apt 2>/dev/null || true
    sudo pkill -9 -x dpkg 2>/dev/null || true
    for _ in $(seq 1 12); do apt_busy || break; sleep 5; done
  fi
  apt_busy && echo "::warning::verrou apt/dpkg encore tenu après arrêt forcé"
  sudo dpkg --configure -a || true
}

# Miroir lent ou coupures : apt réessaie lui-même chaque téléchargement avant d'abandonner.
# DPkg::Lock::Timeout : un apt-get concurrent (orphelin ou unattended-upgrades) fait attendre ≤ 300 s.
# Fichier de conf (lu par le `sudo apt-get` interne de Playwright, que l'environnement n'atteint pas).
echo 'Acquire::Retries "5"; Acquire::http::Timeout "30"; Acquire::https::Timeout "30"; DPkg::Lock::Timeout "300";' | sudo tee /etc/apt/apt.conf.d/80-ci-retries >/dev/null

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
  timeout -k 10 420 sudo apt-get update -o Acquire::Retries=3 -o DPkg::Lock::Timeout=300 >/dev/null || echo "::warning::apt-get update sur $m incomplet"
}

attempt() { # <seconds> <label> <cmd...>
  local limit="$1" label="$2" rc; shift 2
  for i in 1 2 3; do
    [ "$i" -gt 1 ] && switch_mirror $((i - 2))
    apt_busy && { echo "apt/dpkg occupé avant la tentative $i : attente"; repair_apt; }
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
