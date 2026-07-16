/* ===================================================================
   PHOTOS (encodage base64 côté client)
   =================================================================== */

/* Redimensionne et compresse l'image côté client avant stockage en
   base64 dans Firestore. Chaque document Firestore est limité à 1 Mo :
   sans compression, une simple photo de smartphone (3-5 Mo) ferait
   largement dépasser cette limite. En la redimensionnant à 480px de
   large et en la ré-encodant en JPEG qualité 0.72, on obtient
   généralement des chaînes base64 de 20 à 60 Ko, ce qui laisse une
   énorme marge sur les autres champs du document. */
function redimensionnerImage(file, maxLargeur = 480, qualite = 0.72){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const ratio = Math.min(1, maxLargeur / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', qualite));
      };
      img.onerror = ()=> reject(new Error('IMAGE_INVALIDE'));
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('LECTURE_IMPOSSIBLE'));
    reader.readAsDataURL(file);
  });
}

// Aperçu de la photo choisie pour un NOUVEAU type (avant clic sur "Ajouter")
function previewPhotoType(event){
  const file = event.target.files[0];
  if(!file) return;
  redimensionnerImage(file).then(base64=>{
    typePhotoBase64 = base64;
    document.getElementById('type-photo-preview').src = base64;
    document.getElementById('type-photo-preview-wrap').style.display = 'flex';
  }).catch(()=> toast("Impossible de lire cette image.", 'err'));
}

function effacerPhotoType(){
  typePhotoBase64 = null;
  document.getElementById('type-photo').value = '';
  document.getElementById('type-photo-preview-wrap').style.display = 'none';
}

// Ouverture générique de la modale photo (réutilisée par les types, les
// déclarations de casse et l'historique d'un contenant)
function ouvrirPhotoGenerique(src, titre){
  if(!src) return;
  document.getElementById('modal-photo-title').textContent = titre;
  document.getElementById('modal-photo-img').src = src;
  document.getElementById('modal-photo').classList.add('active');
}

// Ouvre la photo d'un type existant en grand (modale)
function ouvrirPhotoType(lettre){
  const t = TYPES[lettre];
  if(!t || !t.photo) return;
  ouvrirPhotoGenerique(t.photo, 'Photo — Type ' + lettre);
}

function closePhotoModal(){
  document.getElementById('modal-photo').classList.remove('active');
}
document.getElementById('modal-photo').addEventListener('click', e=>{
  if(e.target.id === 'modal-photo') closePhotoModal();
});

/* --- Photo du contenant lors de la déclaration de casse ---
   Même principe que la photo de type : compression côté client, gardée
   en mémoire (cassePhotoBase64) jusqu'au clic sur "Déclarer cassé". */
function previewPhotoCasse(event){
  const file = event.target.files[0];
  if(!file) return;
  redimensionnerImage(file).then(base64=>{
    cassePhotoBase64 = base64;
    document.getElementById('casse-photo-preview').src = base64;
    document.getElementById('casse-photo-preview-wrap').style.display = 'flex';
  }).catch(()=> toast("Impossible de lire cette image.", 'err'));
}

function effacerPhotoCasse(){
  cassePhotoBase64 = null;
  const input = document.getElementById('casse-photo');
  if(input) input.value = '';
  const wrap = document.getElementById('casse-photo-preview-wrap');
  if(wrap) wrap.style.display = 'none';
}

// Photo actuellement associée à un contenant cassé (champ photoCasse)
function ouvrirPhotoCasse(identifiant){
  const c = CONTENANTS[identifiant];
  if(!c || !c.photoCasse) return;
  ouvrirPhotoGenerique(c.photoCasse, 'Photo — Contenant ' + identifiant);
}

// Photo rattachée à une entrée précise de l'historique (par index dans
// le tableau historiqueCourant affiché dans la modale Historique)
function ouvrirPhotoHistorique(idx){
  const h = historiqueCourant[idx];
  if(!h || !h.photo) return;
  ouvrirPhotoGenerique(h.photo, 'Photo historique');
}
