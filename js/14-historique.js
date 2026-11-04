/* ===================================================================
   FICHE CONTENANT (anciennement "Modale Historique")
   Affiche la fiche complète d'un contenant : résumé, n° GMAO éditable,
   bouton de réimpression de l'étiquette, et historique complet.
   =================================================================== */

/* -------------------------------------------------------------------
   LIBELLÉS DES ACTIONS D'HISTORIQUE (traduction en français)
   ------------------------------------------------------------------- */
function libelleAction(action){
  switch(action){
    case 'creation':        return 'Création du contenant';
    case 'casse':           return 'Déclaration de casse';
    case 'reparation':      return 'Remise en service (réparation)';
    case 'perte':           return 'Déclaration d\'usage non conforme';
    case 'reapparition':    return 'Remise en conformité (réapparition)';
    case 'reforme':         return 'Réforme définitive';
    case 'gmao_modification': return 'Modification du n° GMAO';
    default:                return action || 'Action inconnue';
  }
}

/* -------------------------------------------------------------------
   OUVERTURE DE LA FICHE CONTENANT
   ------------------------------------------------------------------- */
function ouvrirHistorique(identifiant){
  const c = CONTENANTS[identifiant];
  if(!c) return;
  
  // Titre
  document.getElementById('modal-title').textContent = 'Fiche du contenant — ' + identifiant;
  
  // Résolution des référentiels pour l'affichage
  const type = TYPES[c.typeLettre];
  const categorie = type && type.categorieId ? CATEGORIES[type.categorieId] : null;
  const emplacement = c.emplacementId && EMPLACEMENTS[c.emplacementId]
    ? EMPLACEMENTS[c.emplacementId].nom
    : '—';
  
  // ── BANDEAU RÉSUMÉ ──────────────────────────────────────────────
  let html = '';
  html += `<div class="fiche-bandeau">`;
  html += `<div class="fiche-ligne">`;
  
  html += `<div class="fiche-champ">
    <div class="fiche-label">Identifiant</div>
    <div class="mono" style="font-size:15px; letter-spacing:0.5px;">${identifiant}</div>
  </div>`;
  
  html += `<div class="fiche-champ">
    <div class="fiche-label">Type</div>
    <div>${c.typeLettre || '—'}</div>
  </div>`;
  
  html += `<div class="fiche-champ">
    <div class="fiche-label">Catégorie</div>
    <div>${categorie ? badgeCategorie(categorie.id) : '<span style="color:var(--ink-soft);">Non catégorisé</span>'}</div>
  </div>`;
  
  html += `<div class="fiche-champ">
    <div class="fiche-label">Statut</div>
    <div>${libelleStatut(c.statut)}</div>
  </div>`;
  
  html += `<div class="fiche-champ">
    <div class="fiche-label">Emplacement</div>
    <div>${emplacement}</div>
  </div>`;
  
  html += `<div class="fiche-champ">
    <div class="fiche-label">Créé le</div>
    <div>${formatDate(c.dateCreation)}</div>
  </div>`;
  
  html += `</div>`; // fin .fiche-ligne
  
  // ── SECTION GMAO (éditable) ─────────────────────────────────────
  const gmaoActuel = c.gmao || '';
  html += `<div class="fiche-section-gmao">
    <div class="fiche-label">
      N° GMAO
      <span class="small" style="font-weight:normal; color:var(--ink-soft);">
        — clé de secours, n'apparaît pas sur l'étiquette
      </span>
    </div>
    <div style="display:flex; gap:8px; margin-top:6px; align-items:stretch; flex-wrap:wrap;">
      <input type="text"
             id="edit-gmao-input"
             maxlength="40"
             placeholder="Ex: EQ-1234"
             value="${(gmaoActuel || '').replace(/"/g, '&quot;')}"
             style="flex:1; min-width:180px;">
      <button class="btn btn-primary btn-sm"
              onclick="modifierGmao('${identifiant}', this)">Enregistrer</button>
      <button class="btn btn-ghost btn-sm"
              onclick="imprimerCodeBarre('${identifiant}')"
              title="Réimprimer l'étiquette à 18 chiffres">
        🖨 Réimprimer l'étiquette
      </button>
    </div>
  </div>`;
  
  html += `</div>`; // fin .fiche-bandeau
  
  // ── HISTORIQUE ─────────────────────────────────────────────────
  html += `<div class="fiche-section">
    <h4 style="margin:20px 0 10px 0; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; color:var(--ink-soft);">
      Historique
    </h4>`;
  
  const hist = (c.historique || []).slice().sort((a,b)=> (b.date?.seconds||0)-(a.date?.seconds||0));
  historiqueCourant = hist; // conservé pour retrouver une photo par index au clic
  
  if(hist.length === 0){
    html += '<div class="empty">Aucun historique disponible.</div>';
  } else {
    hist.forEach((h, idx)=>{
      const emp = h.emplacementId && EMPLACEMENTS[h.emplacementId]
        ? EMPLACEMENTS[h.emplacementId].nom
        : null;
      const photoHtml = h.photo
        ? `<img src="${h.photo}" class="type-thumb" style="margin-top:6px;" onclick="ouvrirPhotoHistorique(${idx})" alt="Photo historique">`
        : '';
      const auteurHtml = h.utilisateur
        ? `<div class="small" style="color:var(--ink-soft); margin-top:4px;">Par : ${h.utilisateur}</div>`
        : '';
      
      // Commentaire spécifique selon l'action
      let detailHtml = '';
      if(h.action === 'gmao_modification'){
        const ancienne = h.ancienneValeur
          ? `<code style="background:var(--bg-grid); padding:2px 6px; border-radius:3px; font-size:12px;">${h.ancienneValeur}</code>`
          : '<em style="color:var(--ink-soft);">(vide)</em>';
        const nouvelle = h.nouvelleValeur
          ? `<code style="background:var(--bg-grid); padding:2px 6px; border-radius:3px; font-size:12px;">${h.nouvelleValeur}</code>`
          : '<em style="color:var(--ink-soft);">(vidé)</em>';
        detailHtml = `<div style="margin-top:6px; font-size:13px;">
          ${ancienne} → ${nouvelle}
        </div>`;
      }
      
      html += `<div class="hist-item">
        <div class="date">${formatDate(h.date)}</div>
        <div><strong>${libelleAction(h.action)}</strong></div>
        <div style="margin-top:2px;">${libelleStatut(h.statut)} ${emp ? '— ' + emp : ''}</div>
        ${h.commentaire ? `<div style="color:var(--ink-soft); margin-top:4px; font-style:italic;">${h.commentaire}</div>` : ''}
        ${detailHtml}
        ${auteurHtml}
        ${photoHtml}
      </div>`;
    });
  }
  
  html += `</div>`; // fin .fiche-section
  
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-historique').classList.add('active');
  
  // Focus sur le champ GMAO si vide (pour faciliter la saisie à la première ouverture)
  setTimeout(()=>{
    const input = document.getElementById('edit-gmao-input');
    if(input && !input.value) input.focus();
  }, 50);
}

/* -------------------------------------------------------------------
   FERMETURE DE LA MODALE
   ------------------------------------------------------------------- */
function closeModal(){
  document.getElementById('modal-historique').classList.remove('active');
}

document.getElementById('modal-historique').addEventListener('click', e=>{
  if(e.target.id === 'modal-historique') closeModal();
});

/* -------------------------------------------------------------------
   PHOTO D'HISTORIQUE (plein écran)
   Utilisée par les <img> de l'historique (onclick="ouvrirPhotoHistorique(idx)").
   Réutilise la modale existante pour les photos de types.
   ------------------------------------------------------------------- */
function ouvrirPhotoHistorique(idx){
  const h = historiqueCourant[idx];
  if(!h || !h.photo) return;
  const titre = libelleAction(h.action) + ' — ' + formatDate(h.date);
  document.getElementById('modal-photo-title').textContent = titre;
  const img = document.getElementById('modal-photo-img');
  img.src = h.photo;
  img.alt = 'Photo historique';
  document.getElementById('modal-photo').classList.add('active');
}

function closePhotoModal(){
  document.getElementById('modal-photo').classList.remove('active');
  document.getElementById('modal-photo-img').src = '';
}

document.getElementById('modal-photo').addEventListener('click', e=>{
  if(e.target.id === 'modal-photo') closePhotoModal();
});
