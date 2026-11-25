#!/usr/bin/env bash
# Compares every record of scripts/dns/records.txt between two DNS servers.
#   Before the switch: OVH (dns17.ovh.net) vs the name server Cloudflare assigned to the zone,
#     which already answers for it while the zone is "pending".
#   After the switch: OVH vs a public resolver (1.1.1.1), and the delegation at the .fr registry.
# Usage: scripts/dns/dns-compare.sh <server-A> <server-B>
#   e.g. scripts/dns/dns-compare.sh dns17.ovh.net ada.ns.cloudflare.com
# TXT answers are normalised (strings split differently by each server are joined).
# No +norecurse: a public resolver would then answer from its cache only (empty answers).
set -euo pipefail
zone=dailyedge.fr
a=${1:?server A}
b=${2:?server B}
here="$(cd "$(dirname "$0")" && pwd)"
diffs=0

answer() {
  # $1 server, $2 name, $3 type
  dig +short "$2" "$3" "@$1" 2>/dev/null \
    | sed -e 's/" "//g' \
    | tr '[:upper:]' '[:lower:]' \
    | sort
}

while IFS='|' read -r name type; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  fqdn=$zone
  [[ "$name" != "@" ]] && fqdn="$name.$zone"
  ra="$(answer "$a" "$fqdn" "$type")"
  rb="$(answer "$b" "$fqdn" "$type")"
  if [[ "$ra" == "$rb" ]]; then
    printf '✅ %-60s %-6s %s\n' "$fqdn" "$type" "$( [[ -z "$ra" ]] && echo '(vide des deux côtés)' || echo "${ra//$'\n'/ | }" | cut -c1-70)"
  else
    diffs=$((diffs + 1))
    printf '❌ %-60s %-6s\n   %s : %s\n   %s : %s\n' "$fqdn" "$type" "$a" "${ra//$'\n'/ | }" "$b" "${rb//$'\n'/ | }"
  fi
done < "$here/records.txt"

echo
echo "Délégation au registre .fr : $(dig +noall +authority NS $zone @d.nic.fr | awk '{print $5}' | sort | tr '\n' ' ')"
echo "DS au registre .fr        : $(dig +short DS $zone @d.nic.fr | tr '\n' ' ')"
if (( diffs > 0 )); then
  echo "❌ $diffs différence(s)"
  exit 1
fi
echo "✅ Aucune différence"
