/* ===================================================================
   TYPES DE CONTENANTS
   =================================================================== */
function creerType(btn){
  const lettre = document.getElementById('type-lettre').value.trim().toUpperCase();
  const longueur = document.getElementById('type-longueur').value;
  const largeur = document.getElementById('type-largeur').value;
  const hauteur = document.getElementById('type-hauteur').value;
  const description = document.getElementById('type-desc').value.trim();
  const categorieId = document.getElementById('type-categorie').value || null;

  if(!lettre){ toast("Indique une lettre pour ce type.", 'err'); return; }
  if(TYPES[lettre]){ toast("Ce type existe déjà.", 'err'); return; }

  setBtnLoading(btn, 'Ajout…');
  db.collection('typesContenants').doc(lettre).set({
    lettre, longueur: Number(longueur)||0, largeur: Number(largeur)||0,
    hauteur: Number(hauteur)||0, description, categorieId,
    photo: typePhotoBase64 || null
  }).then(()=>{
    toast("Type " + lettre + " ajouté.", 'ok');
    document.getElementById('type-lettre').value='';
    document.getElementById('type-longueur').value='';
    document.getElementById('type-largeur').value='';
    document.getElementById('type-hauteur').value='';
    document.getElementById('type-desc').value='';
    document.getElementById('type-categorie').value='';
    effacerPhotoType();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

function supprimerType(lettre){
  if(!confirm("Supprimer le type " + lettre + " ? Les contenants existants garderont cette référence.")) return;
  db.collection('typesContenants').doc(lettre).delete()
    .then(()=> toast("Type " + lettre + " supprimé.", 'ok'))
    .catch(err=> toast("Erreur : " + err.message, 'err'));
}

/* --- Édition d'un type existant ---
   La lettre est l'identifiant du document Firestore : elle n'est pas
   modifiable ici (la changer reviendrait à créer un nouveau document et
   à supprimer l'ancien, ce qui casserait la référence typeLettre des
   contenants existants). Dimensions, description, catégorie et photo
   sont éditables. */
let editTypePhotoBase64 = null; // photo en attente pour la modale d'édition
let editTypePhotoSupprimee = false; // true si l'utilisateur a explicitement retiré la photo

function ouvrirEditType(lettre){
  const t = TYPES[lettre];
  if(!t) return;

  editTypePhotoBase64 = null;
  editTypePhotoSupprimee = false;

  document.getElementById('edit-type-lettre').value = lettre;
  document.getElementById('edit-type-lettre-affichage').textContent = lettre;
  document.getElementById('edit-type-longueur').value = t.longueur || '';
  document.getElementById('edit-type-largeur').value = t.largeur || '';
  document.getElementById('edit-type-hauteur').value = t.hauteur || '';
  document.getElementById('edit-type-desc').value = t.description || '';
  document.getElementById('edit-type-categorie').value = t.categorieId || '';
  document.getElementById('edit-type-photo').value = '';

  if(t.photo){
    document.getElementById('edit-type-photo-preview').src = t.photo;
    document.getElementById('edit-type-photo-preview-wrap').style.display = 'flex';
  } else {
    document.getElementById('edit-type-photo-preview-wrap').style.display = 'none';
  }

  document.getElementById('modal-edit-type').classList.add('active');
}

function closeEditTypeModal(){
  document.getElementById('modal-edit-type').classList.remove('active');
}
document.getElementById('modal-edit-type').addEventListener('click', e=>{
  if(e.target.id === 'modal-edit-type') closeEditTypeModal();
});

function previewPhotoEditType(event){
  const file = event.target.files[0];
  if(!file) return;
  redimensionnerImage(file).then(base64=>{
    editTypePhotoBase64 = base64;
    editTypePhotoSupprimee = false;
    document.getElementById('edit-type-photo-preview').src = base64;
    document.getElementById('edit-type-photo-preview-wrap').style.display = 'flex';
  }).catch(()=> toast("Impossible de lire cette image.", 'err'));
}

function effacerPhotoEditType(){
  editTypePhotoBase64 = null;
  editTypePhotoSupprimee = true;
  document.getElementById('edit-type-photo').value = '';
  document.getElementById('edit-type-photo-preview-wrap').style.display = 'none';
}

function enregistrerEditType(btn){
  const lettre = document.getElementById('edit-type-lettre').value;
  const longueur = document.getElementById('edit-type-longueur').value;
  const largeur = document.getElementById('edit-type-largeur').value;
  const hauteur = document.getElementById('edit-type-hauteur').value;
  const description = document.getElementById('edit-type-desc').value.trim();
  const categorieId = document.getElementById('edit-type-categorie').value || null;

  const maj = {
    longueur: Number(longueur)||0,
    largeur: Number(largeur)||0,
    hauteur: Number(hauteur)||0,
    description,
    categorieId
  };

  // Photo : on ne touche au champ que si l'utilisateur a choisi une
  // nouvelle photo, ou explicitement retiré l'ancienne. Sinon la photo
  // existante en base est conservée telle quelle.
  if(editTypePhotoBase64){
    maj.photo = editTypePhotoBase64;
  } else if(editTypePhotoSupprimee){
    maj.photo = null;
  }

  setBtnLoading(btn, 'Enregistrement…');
  db.collection('typesContenants').doc(lettre).update(maj).then(()=>{
    toast("Type " + lettre + " mis à jour.", 'ok');
    closeEditTypeModal();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

const COLONNES_TYPES = [
  { key: 'lettre', label: 'Lettre', get: l => l },
  { key: 'categorie', label: 'Catégorie', get: l => {
      const t = TYPES[l];
      const cat = t && t.categorieId ? CATEGORIES[t.categorieId] : null;
      return cat ? cat.nom : '';
    } },
  { key: 'longueur', label: 'Longueur', get: l => Number(TYPES[l].longueur) || 0 },
  { key: 'largeur', label: 'Largeur', get: l => Number(TYPES[l].largeur) || 0 },
  { key: 'hauteur', label: 'Hauteur', get: l => Number(TYPES[l].hauteur) || 0 },
  { key: 'description', label: 'Description', get: l => TYPES[l].description || '' }
];
let sortTypesState = { colonne: 'lettre', sens: 'asc' };

function trierTypes(colonne){
  if(sortTypesState.colonne === colonne){
    sortTypesState.sens = sortTypesState.sens === 'asc' ? 'desc' : 'asc';
  } else {
    sortTypesState.colonne = colonne;
    sortTypesState.sens = 'asc';
  }
  renderTypes();
}

function flecheTriTypes(colonne){
  if(sortTypesState.colonne !== colonne) return '';
  return sortTypesState.sens === 'asc'
    ? ' <span class="sort-arrow">▲</span>'
    : ' <span class="sort-arrow">▼</span>';
}

function renderTypes(){
  const el = document.getElementById('types-table');
  let lettres = Object.keys(TYPES);
  if(lettres.length === 0){
    el.innerHTML = '<div class="empty">Aucun type enregistré pour l\'instant. Ajoute-en un ci-dessus.</div>';
    return;
  }

  const col = COLONNES_TYPES.find(c=> c.key === sortTypesState.colonne) || COLONNES_TYPES[0];
  const dir = sortTypesState.sens === 'asc' ? 1 : -1;
  lettres.sort((a,b)=>{
    const va = col.get(a), vb = col.get(b);
    if(va < vb) return -1 * dir;
    if(va > vb) return 1 * dir;
    return 0;
  });

  const enteteHtml = '<th>Photo</th>' + COLONNES_TYPES.map(c=>
    `<th class="sortable" onclick="trierTypes('${c.key}')">${c.label}${flecheTriTypes(c.key)}</th>`
  ).join('') + '<th></th>';

  let html = `<table><thead><tr>${enteteHtml}</tr></thead><tbody>`;
  lettres.forEach(l=>{
    const t = TYPES[l];
    const photoHtml = t.photo
      ? `<img src="${t.photo}" class="type-thumb" onclick="ouvrirPhotoType('${l}')" alt="Photo type ${t.lettre}">`
      : '<span class="type-thumb-empty">—</span>';
    html += `<tr>
      <td>${photoHtml}</td>
      <td class="mono"><strong>${t.lettre}</strong></td>
      <td>${badgeCategorie(t.categorieId)}</td>
      <td>${t.longueur} cm</td>
      <td>${t.largeur} cm</td>
      <td>${t.hauteur} cm</td>
      <td>${t.description || '—'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="ouvrirEditType('${l}')">Modifier</button>
        <button class="btn btn-danger btn-sm" onclick="supprimerType('${l}')">Supprimer</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderSelectTypes(){
  const lettres = Object.keys(TYPES).sort();
  const opts = lettres.map(l=> `<option value="${l}">${l} — ${TYPES[l].description || (TYPES[l].longueur+'×'+TYPES[l].largeur+'×'+TYPES[l].hauteur+' cm')}</option>`).join('');

  const selNew = document.getElementById('new-type');
  selNew.innerHTML = lettres.length ? opts : '<option value="">Aucun type — crée-en un d\'abord</option>';

  const selFilter = document.getElementById('filter-type');
  const current = selFilter.value;
  selFilter.innerHTML = '<option value="">Tous les types</option>' + opts;
  selFilter.value = current;
}
