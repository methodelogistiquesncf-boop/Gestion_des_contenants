/* ===================================================================
   DÉCLARATION DE CASSE / RÉPARATION
   =================================================================== */
let contenantCourant = null;

// Liste de tous les contenants au statut "casse", affichée sous le
// formulaire de recherche. Un clic sur une ligne pré-remplit
// l'identifiant et ouvre directement la fiche de réparation, comme si
// on l'avait scanné/saisi puis cliqué sur "Rechercher".
function renderCasseListe(){
  const el = document.getElementById('casse-liste-table');
  if(!el) return;

  const rows = Object.values(CONTENANTS)
    .filter(c=> c.statut === 'casse')
    .sort((a,b)=> (b.dateCasse?.seconds||0) - (a.dateCasse?.seconds||0));

  if(rows.length === 0){
    el.innerHTML = '<div class="empty">Aucun contenant cassé actuellement.</div>';
    return;
  }

  let html = '<table><thead><tr><th>Identifiant</th><th>Type</th><th>Emplacement</th><th>Depuis le</th></tr></thead><tbody>';
  rows.forEach(c=>{
    const emp = c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '—';
    html += `<tr class="clickable" onclick="ouvrirFicheDepuisListeCasse('${c.identifiant}')">
      <td class="mono">${c.identifiant}</td>
      <td>${c.typeLettre}</td>
      <td>${emp}</td>
      <td>${formatDate(c.dateCasse)}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function ouvrirFicheDepuisListeCasse(identifiant){
  document.getElementById('lookup-id').value = identifiant;
  lookupContenant();
  document.getElementById('lookup-result').scrollIntoView({behavior:'smooth', block:'start'});
}

function lookupContenant(){
  const id = document.getElementById('lookup-id').value.trim();
  const resultEl = document.getElementById('lookup-result');
  if(!id){ toast("Scanne ou saisis un identifiant.", 'err'); return; }

  const c = CONTENANTS[id];
  if(!c){
    contenantCourant = null;
    resultEl.innerHTML = '<div class="lookup-result">Aucun contenant ne correspond à cet identifiant. Vérifie la saisie ou enregistre-le d\'abord dans l\'onglet Contenants.</div>';
    return;
  }
  contenantCourant = c;

  const empOptions = Object.keys(EMPLACEMENTS).map(eid=> `<option value="${eid}" ${c.emplacementId===eid?'selected':''}>${EMPLACEMENTS[eid].nom}</option>`).join('');

  let actionsHtml = '';
  if(c.statut === 'en_service'){
    // Réinitialise la photo en attente à chaque nouvelle recherche, pour
    // ne pas réutiliser par erreur la photo d'un contenant précédent.
    cassePhotoBase64 = null;
    actionsHtml = `
      <div class="form-row" style="margin-top:14px;">
        <div>
          <label class="small" for="casse-emplacement">Emplacement de réparation</label>
          <select id="casse-emplacement">${empOptions || '<option value="">Aucun emplacement — crée-en un d\'abord</option>'}</select>
        </div>
        <div style="flex:2; min-width:160px;">
          <label class="small" for="casse-commentaire">Commentaire</label>
          <input type="text" id="casse-commentaire" placeholder="Facultatif">
        </div>
      </div>
      <div class="form-row" style="margin-top:12px;">
        <div>
          <label class="small" for="casse-photo">Photo du contenant cassé</label>
          <input type="file" id="casse-photo" accept="image/*" capture="environment" onchange="previewPhotoCasse(event)">
        </div>
        <div id="casse-photo-preview-wrap" style="display:none; align-items:center; gap:10px;">
          <img id="casse-photo-preview" alt="Aperçu photo casse" style="max-width:80px; max-height:80px; border-radius:8px; border:1px solid var(--line); object-fit:cover;">
          <button type="button" class="btn btn-ghost btn-sm" onclick="effacerPhotoCasse()">Retirer</button>
        </div>
        <div style="flex:1;"></div>
        <div style="flex:0;">
          <button class="btn btn-danger" onclick="declarerCasse(this)">Déclarer cassé</button>
        </div>
      </div>`;
  } else if(c.statut === 'casse'){
    actionsHtml = `
      <div class="form-row" style="margin-top:14px;">
        <div style="flex:2; min-width:160px;">
          <label class="small" for="reparation-commentaire">Commentaire</label>
          <input type="text" id="reparation-commentaire" placeholder="Facultatif">
        </div>
        <div style="flex:0;">
          <button class="btn btn-primary" onclick="marquerRepare(this)">Remettre en service</button>
        </div>
        <div style="flex:0;">
          <button class="btn btn-ghost" onclick="marquerReforme(this)">Réformer définitivement</button>
        </div>
      </div>`;
  } else {
    actionsHtml = '<p class="sub" style="margin-top:14px;">Ce contenant est réformé, aucune action disponible.</p>';
  }

  // Photo actuellement associée à la casse en cours, affichée en lecture
  // seule dans le résumé (uniquement si le contenant est cassé).
  const photoCasseHtml = (c.statut === 'casse' && c.photoCasse)
    ? `<div class="row"><span>Photo</span><span><img src="${c.photoCasse}" class="type-thumb" onclick="ouvrirPhotoCasse('${c.identifiant}')" alt="Photo contenant cassé"></span></div>`
    : '';

  resultEl.innerHTML = `
    <div class="lookup-result">
      <div class="row"><span>Identifiant</span><span class="mono">${c.identifiant}</span></div>
      <div class="row"><span>Type</span><span>${c.typeLettre}</span></div>
      <div class="row"><span>Statut actuel</span><span>${libelleStatut(c.statut)}</span></div>
      <div class="row"><span>Emplacement actuel</span><span>${c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '—'}</span></div>
      ${photoCasseHtml}
      ${actionsHtml}
    </div>`;
}

function declarerCasse(btn){
  if(!contenantCourant) return;
  const empId = document.getElementById('casse-emplacement').value;
  const commentaire = document.getElementById('casse-commentaire').value.trim();
  if(!empId){ toast("Sélectionne un emplacement de réparation.", 'err'); return; }

  const now = firebase.firestore.Timestamp.now();
  const photo = cassePhotoBase64 || null;
  setBtnLoading(btn, 'Enregistrement…');
  db.collection('contenants').doc(contenantCourant.identifiant).update({
    statut: 'casse',
    emplacementId: empId,
    dateCasse: now,
    photoCasse: photo,
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: 'casse', statut: 'casse', emplacementId: empId,
      commentaire: commentaire || 'Déposé sur emplacement de réparation',
      photo: photo
    })
  }).then(()=>{
    toast("Contenant déclaré cassé et déposé.", 'ok');
    cassePhotoBase64 = null;
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

function marquerRepare(btn){
  if(!contenantCourant) return;
  const commentaire = document.getElementById('reparation-commentaire').value.trim();
  const now = firebase.firestore.Timestamp.now();
  setBtnLoading(btn, 'Enregistrement…');
  db.collection('contenants').doc(contenantCourant.identifiant).update({
    statut: 'en_service',
    emplacementId: null,
    dateReparation: now,
    photoCasse: null,
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: 'reparation', statut: 'en_service', emplacementId: null,
      commentaire: commentaire || 'Réparé, remis en service'
    })
  }).then(()=>{
    toast("Contenant remis en service.", 'ok');
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

function marquerReforme(btn){
  if(!contenantCourant) return;
  if(!confirm("Réformer définitivement ce contenant ? Cette action est difficilement réversible.")) return;
  const now = firebase.firestore.Timestamp.now();
  setBtnLoading(btn, 'Enregistrement…');
  db.collection('contenants').doc(contenantCourant.identifiant).update({
    statut: 'reforme',
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: 'reforme', statut: 'reforme', emplacementId: contenantCourant.emplacementId || null,
      commentaire: 'Réformé définitivement'
    })
  }).then(()=>{
    toast("Contenant réformé.", 'ok');
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}
