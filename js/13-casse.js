/* ===================================================================
   DÉCLARATION DE CASSE / PERTE / RÉPARATION
   =================================================================== */
let contenantCourant = null;
let pertePhotoBase64 = null;

/* -------------------------------------------------------------------
   LISTE DES CONTENANTS CASSÉS OU PERDUS
   Affichée sous le formulaire de recherche. Un clic sur une ligne
   pré-remplit l'identifiant et ouvre directement la fiche, comme si
   on l'avait scanné/saisi puis cliqué sur "Rechercher".
   ------------------------------------------------------------------- */
function renderCasseListe(){
  const el = document.getElementById('casse-liste-table');
  if(!el) return;

  const rows = Object.values(CONTENANTS)
    .filter(c=> c.statut === 'casse' || c.statut === 'perdu')
    .sort((a,b)=> {
      const dateA = (a.dateCasse?.seconds||0) || (a.datePerte?.seconds||0);
      const dateB = (b.dateCasse?.seconds||0) || (b.datePerte?.seconds||0);
      return dateB - dateA;
    });

  if(rows.length === 0){
    el.innerHTML = '<div class="empty">Aucun contenant cassé ou perdu actuellement.</div>';
    return;
  }

  let html = '<table><thead><tr><th>Identifiant</th><th>Type</th><th>Statut</th><th>Emplacement</th><th>Depuis le</th></tr></thead><tbody>';
  rows.forEach(c=>{
    const emp = c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '—';
    const statutTexte = c.statut === 'perdu' ? 'Usage non conforme' : 'Cassé';
    const dateObj = c.dateCasse || c.datePerte;
    html += `<tr class="clickable" onclick="ouvrirFicheDepuisListeCasse('${c.identifiant}')">
      <td class="mono">${c.identifiant}</td>
      <td>${c.typeLettre}</td>
      <td>${statutTexte}</td>
      <td>${emp}</td>
      <td>${formatDate(dateObj)}</td>
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

/* -------------------------------------------------------------------
   PHOTO DE PERTE (encodage base64 côté client)
   Même principe que la photo de casse : compression côté client via
   redimensionnerImage() (05-photos.js), gardée en mémoire
   (pertePhotoBase64) jusqu'au clic sur "Déclarer perdu".
   ------------------------------------------------------------------- */
function previewPhotoPerte(event){
  const file = event.target.files[0];
  if(!file) return;
  redimensionnerImage(file).then(base64=>{
    pertePhotoBase64 = base64;
    document.getElementById('perte-photo-preview').src = base64;
    document.getElementById('perte-photo-preview-wrap').style.display = 'flex';
  }).catch(()=> toast("Impossible de lire cette image.", 'err'));
}

function effacerPhotoPerte(){
  pertePhotoBase64 = null;
  const input = document.getElementById('perte-photo');
  if(input) input.value = '';
  const wrap = document.getElementById('perte-photo-preview-wrap');
  if(wrap) wrap.style.display = 'none';
}

// Photo actuellement associée à un contenant perdu (champ photoPerte)
function ouvrirPhotoPerte(identifiant){
  const c = CONTENANTS[identifiant];
  if(!c || !c.photoPerte) return;
  ouvrirPhotoGenerique(c.photoPerte, 'Photo — Contenant ' + identifiant);
}

/* -------------------------------------------------------------------
   RECHERCHE D'UN CONTENANT + FICHE D'ACTION
   ------------------------------------------------------------------- */
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
  if(c.statut === 'en_service' || c.statut === 'casse'){
    // Réinitialise les photos en attente à chaque nouvelle recherche, pour
    // ne pas réutiliser par erreur la photo d'un contenant précédent.
    cassePhotoBase64 = null;
    pertePhotoBase64 = null;
    actionsHtml = `
      <div class="form-row" style="margin-top:14px;">
        <div>
          <label class="small" for="casse-emplacement">Emplacement de réparation</label>
          <select id="casse-emplacement">${empOptions || '<option value="">Aucun emplacement — crée-en un d\'abord</option>'}</select>
        </div>
        <div style="flex:2; min-width:160px;">
          <label class="small" for="casse-commentaire">Commentaire casse</label>
          <input type="text" id="casse-commentaire" placeholder="Facultatif">
        </div>
      </div>
      <div class="form-row" style="margin-top:12px; align-items:flex-end;">
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
      </div>
      <hr style="margin:18px 0; border:0; border-top:1px solid var(--line);">
      <div class="form-row" style="margin-top:4px;">
        <div style="flex:2; min-width:160px;">
          <label class="small" for="perte-commentaire">Commentaire</label>
          <input type="text" id="perte-commentaire" placeholder="Ex: Utilisation hors procédure">
        </div>
      </div>
      <div class="form-row" style="margin-top:12px; align-items:flex-end;">
        <div>
          <label class="small" for="perte-photo">Photo (facultatif)</label>
          <input type="file" id="perte-photo" accept="image/*" capture="environment" onchange="previewPhotoPerte(event)">
        </div>
        <div id="perte-photo-preview-wrap" style="display:none; align-items:center; gap:10px;">
          <img id="perte-photo-preview" alt="Aperçu photo perte" style="max-width:80px; max-height:80px; border-radius:8px; border:1px solid var(--line); object-fit:cover;">
          <button type="button" class="btn btn-ghost btn-sm" onclick="effacerPhotoPerte()">Retirer</button>
        </div>
        <div style="flex:1;"></div>
        <div style="flex:0;">
          <button class="btn" style="background:#b45309; color:white; border:none;" onclick="declarerPerdu(this)">Déclarer usage non conforme</button>
        </div>
      </div>`;
  } else if(c.statut === 'perdu'){
    actionsHtml = `
      <div class="form-row" style="margin-top:14px;">
        <div style="flex:2; min-width:160px;">
          <label class="small" for="reapparition-commentaire">Commentaire de réapparition</label>
          <input type="text" id="reapparition-commentaire" placeholder="Facultatif">
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

  // Photo actuellement associée à la perte en cours, affichée en lecture
  // seule dans le résumé (uniquement si le contenant est perdu).
  const photoPerteHtml = (c.statut === 'perdu' && c.photoPerte)
    ? `<div class="row"><span>Photo</span><span><img src="${c.photoPerte}" class="type-thumb" onclick="ouvrirPhotoPerte('${c.identifiant}')" alt="Photo contenant perdu"></span></div>`
    : '';

  resultEl.innerHTML = `
    <div class="lookup-result">
      <div class="row"><span>Identifiant</span><span class="mono">${c.identifiant}</span></div>
      <div class="row"><span>Type</span><span>${c.typeLettre}</span></div>
      <div class="row"><span>Statut actuel</span><span>${libelleStatut(c.statut)}</span></div>
      <div class="row"><span>Emplacement actuel</span><span>${c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '—'}</span></div>
      ${photoCasseHtml}
      ${photoPerteHtml}
      ${actionsHtml}
    </div>`;
}

/* -------------------------------------------------------------------
   DÉCLARER CASSÉ
   ------------------------------------------------------------------- */
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
    photoPerte: null,
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: 'casse', statut: 'casse', emplacementId: empId,
      commentaire: commentaire || 'Déposé sur emplacement de réparation',
      photo: photo, utilisateur: obtenirNomUtilisateurPourHistorique()
    })
  }).then(()=>{
    toast("Contenant déclaré cassé et déposé.", 'ok');
    cassePhotoBase64 = null;
    pertePhotoBase64 = null;
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

/* -------------------------------------------------------------------
   DÉCLARER PERDU (avec photo facultative)
   ------------------------------------------------------------------- */
function declarerPerdu(btn){
  if(!contenantCourant) return;
  const commentaire = document.getElementById('perte-commentaire') ? document.getElementById('perte-commentaire').value.trim() : '';
  const now = firebase.firestore.Timestamp.now();
  const photo = pertePhotoBase64 || null;
  setBtnLoading(btn, 'Enregistrement…');
  db.collection('contenants').doc(contenantCourant.identifiant).update({
    statut: 'perdu',
    datePerte: now,
    emplacementId: null,
    photoCasse: null,
    photoPerte: photo,
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: 'perte', statut: 'perdu', emplacementId: null,
      commentaire: commentaire || 'Déclaré perdu',
      photo: photo, utilisateur: obtenirNomUtilisateurPourHistorique()
    })
  }).then(()=>{
    toast("Contenant déclaré perdu.", 'ok');
    pertePhotoBase64 = null;
    cassePhotoBase64 = null;
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

/* -------------------------------------------------------------------
   REMETTRE EN SERVICE (réparation ou réapparition d'un contenant perdu)
   ------------------------------------------------------------------- */
function marquerRepare(btn){
  if(!contenantCourant) return;
  const isLost = contenantCourant.statut === 'perdu';
  const commentaireInput = document.getElementById(isLost ? 'reapparition-commentaire' : 'reparation-commentaire');
  const commentaire = commentaireInput ? commentaireInput.value.trim() : '';
  const now = firebase.firestore.Timestamp.now();
  setBtnLoading(btn, 'Enregistrement…');
  db.collection('contenants').doc(contenantCourant.identifiant).update({
    statut: 'en_service',
    emplacementId: null,
    dateReparation: now,
    photoCasse: null,
    photoPerte: null,
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: isLost ? 'reapparition' : 'reparation',
      statut: 'en_service', emplacementId: null,
      commentaire: commentaire || (isLost ? 'Réapparu, remis en service' : 'Réparé, remis en service'),
      utilisateur: obtenirNomUtilisateurPourHistorique()
    })
  }).then(()=>{
    toast("Contenant remis en service.", 'ok');
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

/* -------------------------------------------------------------------
   RÉFORMER DÉFINITIVEMENT
   ------------------------------------------------------------------- */
function marquerReforme(btn){
  if(!contenantCourant) return;
  if(!confirm("Réformer définitivement ce contenant ? Cette action est difficilement réversible.")) return;
  const now = firebase.firestore.Timestamp.now();
  setBtnLoading(btn, 'Enregistrement…');
  db.collection('contenants').doc(contenantCourant.identifiant).update({
    statut: 'reforme',
    photoCasse: null,
    photoPerte: null,
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: 'reforme', statut: 'reforme', emplacementId: contenantCourant.emplacementId || null,
      commentaire: 'Réformé définitivement',
      utilisateur: obtenirNomUtilisateurPourHistorique()
    })
  }).then(()=>{
    toast("Contenant réformé.", 'ok');
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}
