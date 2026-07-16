/* ===================================================================
   CATÉGORIES DE CONTENANTS
   (Bois / Métallique / Plastique / etc. — un type peut être rattaché
   à une catégorie pour permettre de filtrer et de statistiquer par
   matériau ou famille de contenant.)
   =================================================================== */
function creerCategorie(btn){
  const nom = document.getElementById('cat-nom').value.trim();
  const couleur = document.getElementById('cat-couleur').value || '#2c5f8a';

  if(!nom){ toast("Indique un nom de catégorie.", 'err'); return; }

  const dejaExistante = Object.values(CATEGORIES).some(c=> c.nom.toLowerCase() === nom.toLowerCase());
  if(dejaExistante){ toast("Cette catégorie existe déjà.", 'err'); return; }

  setBtnLoading(btn, 'Ajout…');
  db.collection('categoriesContenants').add({nom, couleur}).then(()=>{
    toast("Catégorie \"" + nom + "\" ajoutée.", 'ok');
    document.getElementById('cat-nom').value = '';
    document.getElementById('cat-couleur').value = '#2c5f8a';
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

function supprimerCategorie(id){
  const c = CATEGORIES[id];
  const nom = c ? c.nom : '';
  if(!confirm("Supprimer la catégorie \"" + nom + "\" ? Les types qui l'utilisent n'afficheront plus de catégorie (leurs données ne sont pas supprimées).")) return;
  db.collection('categoriesContenants').doc(id).delete()
    .then(()=> toast("Catégorie supprimée.", 'ok'))
    .catch(err=> toast("Erreur : " + err.message, 'err'));
}

function ouvrirEditCategorie(id){
  const c = CATEGORIES[id];
  if(!c) return;
  document.getElementById('edit-cat-id').value = id;
  document.getElementById('edit-cat-nom').value = c.nom || '';
  document.getElementById('edit-cat-couleur').value = c.couleur || '#2c5f8a';
  document.getElementById('modal-edit-categorie').classList.add('active');
}

function closeEditCategorieModal(){
  document.getElementById('modal-edit-categorie').classList.remove('active');
}
document.getElementById('modal-edit-categorie').addEventListener('click', e=>{
  if(e.target.id === 'modal-edit-categorie') closeEditCategorieModal();
});

function enregistrerEditCategorie(btn){
  const id = document.getElementById('edit-cat-id').value;
  const nom = document.getElementById('edit-cat-nom').value.trim();
  const couleur = document.getElementById('edit-cat-couleur').value || '#2c5f8a';

  if(!nom){ toast("Indique un nom de catégorie.", 'err'); return; }

  setBtnLoading(btn, 'Enregistrement…');
  db.collection('categoriesContenants').doc(id).update({nom, couleur}).then(()=>{
    toast("Catégorie mise à jour.", 'ok');
    closeEditCategorieModal();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

function renderCategories(){
  const el = document.getElementById('categories-table');
  if(!el) return;
  const ids = Object.keys(CATEGORIES).sort((a,b)=> CATEGORIES[a].nom.localeCompare(CATEGORIES[b].nom));
  if(ids.length === 0){
    el.innerHTML = '<div class="empty">Aucune catégorie enregistrée pour l\'instant. Ajoute-en une ci-dessus.</div>';
    return;
  }

  // Nombre de types rattachés à chaque catégorie, pour info.
  const nbTypesParCat = {};
  Object.values(TYPES).forEach(t=>{
    if(t.categorieId) nbTypesParCat[t.categorieId] = (nbTypesParCat[t.categorieId]||0) + 1;
  });

  let html = '<table><thead><tr><th>Catégorie</th><th>Types rattachés</th><th></th></tr></thead><tbody>';
  ids.forEach(id=>{
    html += `<tr>
      <td>${badgeCategorie(id)}</td>
      <td>${nbTypesParCat[id] || 0}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="ouvrirEditCategorie('${id}')">Modifier</button>
        <button class="btn btn-danger btn-sm" onclick="supprimerCategorie('${id}')">Supprimer</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

// Remplit tous les <select> qui proposent une liste de catégories :
// le formulaire de création de type, la modale d'édition de type, et
// le filtre de la liste des contenants.
function renderSelectCategories(){
  const ids = Object.keys(CATEGORIES).sort((a,b)=> CATEGORIES[a].nom.localeCompare(CATEGORIES[b].nom));
  const opts = ids.map(id=> `<option value="${id}">${CATEGORIES[id].nom}</option>`).join('');

  ['type-categorie', 'edit-type-categorie'].forEach(selId=>{
    const sel = document.getElementById(selId);
    if(!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Aucune</option>' + opts;
    sel.value = current;
  });

  const selFilter = document.getElementById('filter-categorie');
  if(selFilter){
    const current = selFilter.value;
    selFilter.innerHTML = '<option value="">Toutes les catégories</option>' + opts;
    selFilter.value = current;
  }
}

// Rendu d'un badge coloré pour une catégorie donnée (par son id).
// Retourne un badge neutre "Non catégorisé" si l'id est vide ou
// pointe vers une catégorie supprimée.
function badgeCategorie(catId){
  const c = CATEGORIES[catId];
  if(!c) return '<span class="badge-cat badge-cat-empty">Non catégorisé</span>';
  return `<span class="badge-cat" style="background:${c.couleur}22; color:${c.couleur}; border:1px solid ${c.couleur}55;">${c.nom}</span>`;
}
