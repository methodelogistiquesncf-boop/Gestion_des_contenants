/* ===================================================================
   MODALE HISTORIQUE
   =================================================================== */
function ouvrirHistorique(identifiant){
  const c = CONTENANTS[identifiant];
  if(!c) return;
  document.getElementById('modal-title').textContent = 'Historique — ' + identifiant;
  const hist = (c.historique || []).slice().sort((a,b)=> (b.date?.seconds||0)-(a.date?.seconds||0));
  historiqueCourant = hist; // conservé pour retrouver une photo par index au clic
  let html = '';
  if(hist.length === 0){
    html = '<div class="empty">Aucun historique disponible.</div>';
  } else {
    hist.forEach((h, idx)=>{
      const emp = h.emplacementId && EMPLACEMENTS[h.emplacementId] ? EMPLACEMENTS[h.emplacementId].nom : null;
      const photoHtml = h.photo
        ? `<img src="${h.photo}" class="type-thumb" style="margin-top:6px;" onclick="ouvrirPhotoHistorique(${idx})" alt="Photo historique">`
        : '';
      html += `<div class="hist-item">
        <div class="date">${formatDate(h.date)}</div>
        <div>${libelleStatut(h.statut)} ${emp ? '— ' + emp : ''}</div>
        <div style="color:var(--ink-soft);">${h.commentaire || ''}</div>
        ${photoHtml}
      </div>`;
    });
  }
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-historique').classList.add('active');
}

function closeModal(){
  document.getElementById('modal-historique').classList.remove('active');
}
document.getElementById('modal-historique').addEventListener('click', e=>{
  if(e.target.id === 'modal-historique') closeModal();
});
