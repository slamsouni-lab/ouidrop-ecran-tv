#!/usr/bin/env bash
# Vérifie / affine les coordonnées des droppers avec la Base Adresse Nationale
# (service public gratuit, sans clé). À lancer depuis la racine du projet :
#     bash geocoder-droppers.sh
# Affiche, pour chaque dropper : latitude, longitude, et un score de confiance
# (1 = adresse trouvée exactement). À recopier dans DropperController.php si
# un point est décalé sur la carte.
set -euo pipefail

CSV=$(mktemp)
echo "id,adresse" > "$CSV"
# Extrait id + adresse directement du contrôleur : une seule source de vérité.
grep -oP "'id' => '\K[^']+|'address' => \"\K[^\"]+" src/Controller/DropperController.php \
  | paste -d, - - | sed 's/,\(.*\)/,"\1"/' >> "$CSV"

curl -sS -X POST -F "data=@$CSV" -F "columns=adresse" \
  https://api-adresse.data.gouv.fr/search/csv/ \
  | awk -F',' 'NR==1 { for (i=1;i<=NF;i++) col[$i]=i; print "id        latitude    longitude   score"; next }
              { printf "%-9s %-11s %-11s %s\n", $1, $col["latitude"], $col["longitude"], $col["result_score"] }'
rm -f "$CSV"
