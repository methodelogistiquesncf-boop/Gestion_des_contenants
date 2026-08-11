#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Application des changements..."

# 09-contenants.js
sed -i "s/+ 'Perdu<\\/span>'/+ 'Usage non conforme<\\/span>'/g" js/09-contenants.js

# 10-contenants-tableau.js
sed -i "s/perdu: 'Perdu'/perdu: 'Usage non conforme'/g" js/10-contenants-tableau.js
sed -i "s/opt.textContent = 'Perdu';/opt.textContent = 'Usage non conforme';/g" js/10-contenants-tableau.js

# 12-stats.js
sed -i 's/<div class="kpi-label">Perdus</<div class="kpi-label">Usage non conforme</g' js/12-stats.js
sed -i 's/<span>Perdus</<span>Usage non conforme</g' js/12-stats.js
sed -i 's/<th>Perdu</<th>Usage non conforme</g' js/12-stats.js

# 13-casse.js
sed -i "s/? 'Perdu' : 'Casse'/? 'Usage non conforme' : 'Casse'/g" js/13-casse.js
sed -i 's/Commentaire perte/Commentaire/g' js/13-casse.js
sed -i 's/Ex: Perdu lors transport/Ex: Utilisation hors procedure/g' js/13-casse.js
sed -i 's/>Declarer perdu</>Declarer usage non conforme</g' js/13-casse.js
sed -i 's/Photo du contenant perdu/Photo (facultatif)/g' js/13-casse.js
sed -i "s/|| 'Declare perdu'/|| 'Declare en usage non conforme'/g" js/13-casse.js
sed -i 's/Contenant declare perdu./Contenant declare en usage non conforme./g' js/13-casse.js
sed -i "s/'Reapparu, remis en service'/'Remis en conformite, remis en service'/g" js/13-casse.js
sed -i 's/casse ou perdu actuellement/casse ou en usage non conforme actuellement/g' js/13-casse.js

# index.html
sed -i 's/<option value="perdu">Perdu</<option value="perdu">Usage non conforme</g' index.html
sed -i 's/casse ou une perte/casse ou un usage non conforme/g' index.html
sed -i 's/casse ou perdu/casse ou en usage non conforme/g' index.html
sed -i 's/Contenants casses ou perdus/Contenants casses ou en usage non conforme/g' index.html

echo "Termine ! Verifie avec : git diff"
