/* ===================================================================
   IMPRESSION DE CODES-BARRES (JsBarcode)
   =================================================================== */

// Petit échappement local (le titre est un texte libre saisi par
// l'utilisateur, injecté dans le HTML de la zone d'impression).
function echapperHtmlBarcode(str){
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ===================================================================
   CHOIX DU FORMAT D'IMPRESSION
   L'utilisateur peut choisir entre :
   - a4-portrait-2 : A4 portrait, 2 étiquettes par page (format actuel)
   - a4-paysage-1 : A4 paysage, 1 code-barres par page
   =================================================================== */
const FORMAT_IMPRESSION_DEFAUT = 'a4-portrait-2';

function formatImpressionStocke() {
  try {
    return localStorage.getItem('formatImpression') || FORMAT_IMPRESSION_DEFAUT;
  } catch (e) {
    return FORMAT_IMPRESSION_DEFAUT;
  }
}

function valeurSelect(id) {
  const el = document.getElementById(id);
  return el ? el.value : null;
}

function lireFormatActif() {
  return valeurSelect('lot-format')
      || valeurSelect('barcode-format')
      || formatImpressionStocke();
}

function appliquerFormatImpression(format) {
  if (format !== 'a4-paysage-1') {
    format = 'a4-portrait-2';
  }

  // On stocke le format sur le body pour que le CSS puisse réagir
  document.body.dataset.printFormat = format;

  // On injecte une règle @page dynamique pour forcer l'orientation
  let style = document.getElementById('dynamic-print-page');
  if (!style) {
    style = document.createElement('style');
    style.id = 'dynamic-print-page';
    document.head.appendChild(style);
  }

  if (format === 'a4-paysage-1') {
    style.textContent = '@page { size: A4 landscape; margin: 6mm; }';
  } else {
    style.textContent = '@page { size: A4 portrait; margin: 6mm; }';
  }

  // On mémorise le choix pour les prochaines fois
  try {
    localStorage.setItem('formatImpression', format);
  } catch (e) {
    // localStorage indisponible : pas bloquant
  }
}

function imprimerDepuisModale() {
  const format = valeurSelect('barcode-format') || formatImpressionStocke();
  appliquerFormatImpression(format);

  // Petit délai pour laisser le navigateur appliquer le style dynamique
  setTimeout(() => {
    window.print();
  }, 80);
}

function initialiserSelectsFormatImpression() {
  const formatEnregistre = formatImpressionStocke();

  const selects = ['lot-format', 'barcode-format'];

  selects.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;

    select.value = formatEnregistre;

    select.addEventListener('change', () => {
      appliquerFormatImpression(select.value);
    });
  });

  appliquerFormatImpression(formatEnregistre);
}

// Conservation pour compatibilité (bouton "Code-barres" par ligne, génération
// unitaire) : imprime simplement un lot d'un seul identifiant.
function imprimerCodeBarre(identifiant){
  imprimerLotCodeBarres([identifiant], false, '', lireFormatActif());
}

// Rend un code-barres par identifiant dans la zone d'impression.
// Le format d'impression est choisi par l'utilisateur :
// - a4-portrait-2 : 2 étiquettes par page A4 portrait
// - a4-paysage-1 : 1 code-barres par page A4 paysage
//
// imprimerDirectement=true : ouvre directement la boîte de dialogue
// d'impression du navigateur (utilisé pour "Réserver et imprimer le
// lot", dont l'intitulé du bouton dit déjà explicitement l'intention —
// une fenêtre de prévisualisation intermédiaire n'apportait rien de
// plus que celle du navigateur). imprimerDirectement=false (par défaut)
// affiche d'abord la modale, pour les impressions ponctuelles d'un seul
// identifiant (bouton "Code-barres" d'une ligne, aperçu depuis "Générer").
function imprimerLotCodeBarres(identifiants, imprimerDirectement=false, titre='', format=null){
  if(!format){
    format = lireFormatActif();
  }

  appliquerFormatImpression(format);

  const zone = document.getElementById('barcode-print-zone');
  const titreHtml = titre ? `<div class="barcode-title">${echapperHtmlBarcode(titre)}</div>` : '';
  zone.innerHTML = identifiants.map(id=>
    `<div class="barcode-label"><div class="barcode-cell">${titreHtml}<svg class="barcode-svg-lot" data-id="${id}"></svg></div></div>`
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
    setTimeout(()=> window.print(), 100);
  } else {
    // Synchroniser le select de la modale avec le format choisi
    const selectFormat = document.getElementById('barcode-format');
    if(selectFormat){
      selectFormat.value = format;
    }

    document.getElementById('modal-barcode').classList.add('active');
  }
}

function closeBarcodeModal(){
  document.getElementById('modal-barcode').classList.remove('active');
}
document.getElementById('modal-barcode').addEventListener('click', e=>{
  if(e.target.id === 'modal-barcode') closeBarcodeModal();
});

// Initialiser les selects de format d'impression au chargement
initialiserSelectsFormatImpression();
