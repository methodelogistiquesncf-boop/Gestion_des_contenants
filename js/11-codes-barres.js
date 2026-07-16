/* ===================================================================
   IMPRESSION DE CODES-BARRES (JsBarcode)
   =================================================================== */
// Conservée pour compatibilité (bouton "Code-barres" par ligne, génération
// unitaire) : imprime simplement un lot d'un seul identifiant.
function imprimerCodeBarre(identifiant){
  imprimerLotCodeBarres([identifiant]);
}

// Rend un code-barres par identifiant dans la zone d'impression, sous
// forme d'étiquettes indépendantes au format A5 (une étiquette = une
// demi-page A4 verticale, deux étiquettes par feuille). Le SVG est rendu
// en une taille fixe puis converti en viewBox pour pouvoir être mis à
// l'échelle proprement en CSS, à l'écran comme à l'impression.
//
// imprimerDirectement=true : ouvre directement la boîte de dialogue
// d'impression du navigateur (utilisé pour "Réserver et imprimer le
// lot", dont l'intitulé du bouton dit déjà explicitement l'intention —
// une fenêtre de prévisualisation intermédiaire n'apportait rien de
// plus que celle du navigateur). imprimerDirectement=false (par défaut)
// affiche d'abord la modale, pour les impressions ponctuelles d'un seul
// identifiant (bouton "Code-barres" d'une ligne, aperçu depuis "Générer").
function imprimerLotCodeBarres(identifiants, imprimerDirectement=false){
  const zone = document.getElementById('barcode-print-zone');
  zone.innerHTML = identifiants.map(id=>
    `<div class="barcode-label"><div class="barcode-cell"><svg class="barcode-svg-lot" data-id="${id}"></svg></div></div>`
  ).join('');
  identifiants.forEach(id=>{
    const svgEl = zone.querySelector('svg[data-id="' + id + '"]');
    JsBarcode(svgEl, id, {
      format: 'CODE128',
      width: 3,
      height: 110,
      fontSize: 22,
      margin: 10
    });
    // Fige les proportions dans le viewBox puis retire width/height figés
    // en px, pour laisser .barcode-svg-lot (CSS) piloter la taille réelle.
    // IMPORTANT : viewBox exige des nombres SANS unité. JsBarcode renvoie
    // parfois ces attributs avec "px" (ex. "422px") — on l'enlève avant
    // de construire le viewBox, sinon il est invalide, silencieusement
    // ignoré par le navigateur, et le SVG perd tout ratio intrinsèque
    // (c'était la vraie cause du mauvais centrage à l'impression).
    const w = parseFloat(svgEl.getAttribute('width')), h = parseFloat(svgEl.getAttribute('height'));
    svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
  });
  if(imprimerDirectement){
    // Petit délai pour laisser le navigateur peindre les <svg> avant
    // d'ouvrir la boîte de dialogue d'impression.
    setTimeout(()=> window.print(), 50);
  } else {
    document.getElementById('modal-barcode').classList.add('active');
  }
}

function closeBarcodeModal(){
  document.getElementById('modal-barcode').classList.remove('active');
}
document.getElementById('modal-barcode').addEventListener('click', e=>{
  if(e.target.id === 'modal-barcode') closeBarcodeModal();
});
