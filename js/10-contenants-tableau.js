/* ===================================================================
   TRI DU TABLEAU DES CONTENANTS
   L'utilisateur clique sur un en-tête de colonne pour trier ; un
   second clic sur la même colonne inverse le sens. Le tri s'applique
   après les filtres, sur la liste réellement affichée.
   =================================================================== */
const COLONNES_CONTENANTS = [
  { key: 'identifiant', label: 'Identifiant', get: c => c.identifiant || '' },
  { key: 'typeLettre', label: 'Type', get: c => c.typeLettre || '' },
  { key: 'categorie', label: 'Catégorie', get: c => {
      const t = TYPES[c.typeLettre];
      const cat = t && t.categorieId ? CATEGORIES[t.categorieId] : null;
      return cat ? cat.nom : '';
    } },
  { key: 'statut', label: 'Statut', get: c => c.statut || '' },
  { key: 'emplacement', label: 'Emplacement', get: c => c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '' },
  { key: 'dateCreation', label: 'Créé le', get: c => c.dateCreation && c.dateCreation.seconds ? c.dateCreation.seconds : 0 }
];

let sortContenantsState = { colonne: 'dateCreation', sens: 'desc' };

function trierContenants(colonne){
  if(sortContenantsState.colonne === colonne){
    sortContenantsState.sens = sortContenantsState.sens === 'asc' ? 'desc' : 'asc';
  } else {
    sortContenantsState.colonne = colonne;
    sortContenantsState.sens = colonne === 'dateCreation' ? 'desc' : 'asc';
  }
  renderContenants();
}

function flecheTri(colonne){
  if(sortContenantsState.colonne !== colonne) return '';
  return sortContenantsState.sens === 'asc'
    ? ' <span class="sort-arrow">▲</span>'
    : ' <span class="sort-arrow">▼</span>';
}

/* ===================================================================
   EXPORT EXCEL DES CONTENANTS
   Exporte exactement la liste actuellement filtrée/triée à l'écran,
   pas l'intégralité de la base : ce que l'utilisateur voit est ce
   qu'il exporte. Génère un vrai fichier .xlsx (via SheetJS), avec
   en-têtes mis en forme et largeurs de colonnes adaptées.
   =================================================================== */
function exporterContenantsExcel(){
  const rows = obtenirContenantsFiltresTries();
  if(rows.length === 0){ toast("Aucun contenant à exporter avec ces filtres.", 'err'); return; }

  const libelleStatutTexte = statut => ({
    en_service: 'En service', casse: 'Cassé', reforme: 'Réformé'
  }[statut] || statut);

  const entetes = ['Identifiant', 'Type', 'Catégorie', 'Statut', 'Emplacement', 'Créé le'];
  const donnees = rows.map(c=>{
    const t = TYPES[c.typeLettre];
    const cat = t && t.categorieId ? CATEGORIES[t.categorieId] : null;
    const emp = c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '';
    return [
      c.identifiant,
      c.typeLettre || '',
      cat ? cat.nom : '',
      libelleStatutTexte(c.statut),
      emp,
      formatDate(c.dateCreation)
    ];
  });

  const feuille = XLSX.utils.aoa_to_sheet([entetes, ...donnees]);

  // Largeurs de colonnes adaptées au contenu
  feuille['!cols'] = [
    { wch: 22 }, // Identifiant
    { wch: 8 },  // Type
    { wch: 16 }, // Catégorie
    { wch: 12 }, // Statut
    { wch: 22 }, // Emplacement
    { wch: 18 }  // Créé le
  ];

  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Contenants');
  XLSX.writeFile(classeur, 'contenants-' + new Date().toISOString().slice(0,10) + '.xlsx');

  toast(rows.length + " contenant(s) exporté(s).", 'ok');
}

// Applique les mêmes filtres que renderContenants(), pour partager la
// logique entre l'affichage à l'écran et l'export CSV.
function obtenirContenantsFiltresTries(){
  const search = (document.getElementById('filter-search').value || '').trim().toLowerCase();
  const fStatut = document.getElementById('filter-statut').value;
  const fType = document.getElementById('filter-type').value;
  const fEmp = document.getElementById('filter-emplacement').value;
  const fCategorie = document.getElementById('filter-categorie') ? document.getElementById('filter-categorie').value : '';

  let rows = Object.values(CONTENANTS).filter(c=>{
    if(search && !c.identifiant.toLowerCase().includes(search)) return false;
    if(fStatut && c.statut !== fStatut) return false;
    if(fType && c.typeLettre !== fType) return false;
    if(fEmp && c.emplacementId !== fEmp) return false;
    if(fCategorie){
      const t = TYPES[c.typeLettre];
      if(!t || t.categorieId !== fCategorie) return false;
    }
    return true;
  });

  const col = COLONNES_CONTENANTS.find(c=> c.key === sortContenantsState.colonne) || COLONNES_CONTENANTS[COLONNES_CONTENANTS.length-1];
  const dir = sortContenantsState.sens === 'asc' ? 1 : -1;
  rows.sort((a,b)=>{
    const va = col.get(a), vb = col.get(b);
    if(va < vb) return -1 * dir;
    if(va > vb) return 1 * dir;
    return 0;
  });

  return rows;
}

function renderContenants(){
  const el = document.getElementById('contenants-table');
  const rows = obtenirContenantsFiltresTries();

  const enteteHtml = COLONNES_CONTENANTS.map(col=>
    `<th class="sortable" onclick="trierContenants('${col.key}')">${col.label}${flecheTri(col.key)}</th>`
  ).join('') + '<th></th>';

  if(rows.length === 0){
    el.innerHTML = `<table><thead><tr>${enteteHtml}</tr></thead></table><div class="empty">Aucun contenant ne correspond à ces critères.</div>`;
    return;
  }

  let html = `<table><thead><tr>${enteteHtml}</tr></thead><tbody>`;
  const estAdmin = (typeof roleUtilisateurActuel !== 'undefined') && roleUtilisateurActuel === 'Administrateur';
  rows.forEach(c=>{
    const emp = c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '—';
    const t = TYPES[c.typeLettre];
    const btnSupprimer = estAdmin
      ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); supprimerContenant('${c.identifiant}')">Supprimer</button>`
      : '';
    html += `<tr class="clickable" onclick="ouvrirHistorique('${c.identifiant}')">
      <td class="mono">${c.identifiant}</td>
      <td>${c.typeLettre}</td>
      <td>${badgeCategorie(t ? t.categorieId : null)}</td>
      <td>${libelleStatut(c.statut)}</td>
      <td>${emp}</td>
      <td>${formatDate(c.dateCreation)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); imprimerCodeBarre('${c.identifiant}')">Code-barres</button>
        ${btnSupprimer}
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}
