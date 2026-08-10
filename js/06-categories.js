/* ===================================================================
   CATÉGORIES DE CONTENANTS
   Chaque catégorie porte un préfixe de numérotation (champ "prefixe")
   qui détermine la série de numéros générés pour ses types.
   =================================================================== */

function creerCategorie(btn){
  garantirChampPrefixeAjout();
  const nom = document.getElementById('cat-nom').value.trim();
  const couleur = document.getElementById('cat-couleur').value || '#2c5f8a';
  const prefixeEl = document.getElementById('cat-prefixe');
  const prefixe = prefixeEl ? prefixeEl.value.trim() : '';

  if(!nom){ toast("Indique un nom de catégorie.", 'err'); return; }
  if(prefixe && !prefixeValide(prefixe)){ toast("Le préfixe doit être composé de 1 à 12 chiffres.", 'err'); return; }

  const dejaExistante = Object.values(CATEGORIES).some(c=> c.nom.toLowerCase() === nom.toLowerCase());
  if(dejaExistante){ toast("Cette catégorie existe déjà.", 'err'); return; }

  setBtnLoading(btn, 'Ajout…');
  db.collection('categoriesContenants').add({nom, couleur, prefixe: prefixe || null}).then(()=>{
    toast("Catégorie \"" + nom + "\" ajoutée.", 'ok');
    document.getElementById('cat-nom').value = '';
    document.getElementById('cat-couleur').value = '#2c5f8a';
    if(prefixeEl) prefixeEl.value = '';
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
  garantirChampPrefixeEdition();
  document.getElementById('edit-cat-id').value = id;
  document.getElementById('edit-cat-nom').value = c.nom || '';
  document.getElementById('edit-cat-couleur').value = c.couleur || '#2c5f8a';
  const prefixeEl = document.getElementById('edit-cat-prefixe');
  if(prefixeEl) prefixeEl.value = c.prefixe || '';
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
  const prefixeEl = document.getElementById('edit-cat-prefixe');
  const prefixe = prefixeEl ? prefixeEl.value.trim() : '';

  if(!nom){ toast("Indique un nom de catégorie.", 'err'); return; }
  if(prefixe && !prefixeValide(prefixe)){ toast("Le préfixe doit être composé de 1 à 12 chiffres.", 'err'); return; }

  setBtnLoading(btn, 'Enregistrement…');
  db.collection('categoriesContenants').doc(id).update({nom, couleur, prefixe: prefixe || null}).then(()=>{
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

  const nbTypesParCat = {};
  Object.values(TYPES).forEach(t=>{
    if(t.categorieId) nbTypesParCat[t.categorieId] = (nbTypesParCat[t.categorieId]||0) + 1;
  });

  let html = '<table><thead><tr><th>Catégorie</th><th>Préfixe numérotation</th><th>Types rattachés</th><th></th></tr></thead><tbody>';
  ids.forEach(id=>{
    const cat = CATEGORIES[id];
    html += `<tr>
      <td>${badgeCategorie(id)}</td>
      <td class="mono">${cat.prefixe ? cat.prefixe : '—'}</td>
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

function badgeCategorie(catId){
  const c = CATEGORIES[catId];
  if(!c) return '<span class="badge-cat badge-cat-empty">Non catégorisé</span>';
  return `<span class="badge-cat" style="background:${c.couleur}22; color:${c.couleur}; border:1px solid ${c.couleur}55;">${c.nom}</span>`;
}

/* ===================================================================
   AUTO-CONSTRUCTION DES CHAMPS "PRÉFIXE" MANQUANTS
   =================================================================== */
function prefixeValide(p){ return /^[0-9]{1,12}$/.test(p); }

function garantirChampPrefixeAjout(){
  if(document.getElementById('cat-prefixe')) return;
  const btn = document.getElementById('btn-creer-categorie');
  if(!btn) return;
  const btnWrap = btn.parentElement;
  const row = btnWrap ? btnWrap.parentElement : null;
  if(!row) return;
  const div = document.createElement('div');
  div.style.maxWidth = '180px';
  div.innerHTML = `
    <label class="small" for="cat-prefixe">Préfixe numérotation</label>
    <input type="text" id="cat-prefixe" placeholder="Ex : 052080" maxlength="12" inputmode="numeric">`;
  row.insertBefore(div, btnWrap);
}

function garantirChampPrefixeEdition(){
  if(document.getElementById('edit-cat-prefixe')) return;
  const modal = document.getElementById('modal-edit-categorie');
  if(!modal) return;
  const couleurInput = document.getElementById('edit-cat-couleur');
  if(!couleurInput) return;
  const formRowCouleur = couleurInput.closest('.form-row');
  if(!formRowCouleur) return;
  const nouveauRow = document.createElement('div');
  nouveauRow.className = 'form-row';
  nouveauRow.style.marginTop = '12px';
  nouveauRow.innerHTML = `
    <div style="max-width:220px;">
      <label class="small" for="edit-cat-prefixe">Préfixe de numérotation</label>
      <input type="text" id="edit-cat-prefixe" placeholder="Ex : 052040" maxlength="12" inputmode="numeric">
    </div>`;
  formRowCouleur.parentNode.insertBefore(nouveauRow, formRowCouleur.nextSibling);
}

garantirChampPrefixeAjout();
garantirChampPrefixeEdition();
