/* ===================================================================
   CONFIGURATION FIREBASE
   Remplace les valeurs ci-dessous par celles de ton projet Firebase
   (Console Firebase > Paramètres du projet > Tes applications > SDK).
   =================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyCt0wwzyQEk1PaZf2cQMNIAiQonWiPqyN8",
  authDomain: "gestiondescontenants.firebaseapp.com",
  projectId: "gestiondescontenants",
  storageBucket: "gestiondescontenants.firebasestorage.app",
  messagingSenderId: "974245233171",
  appId: "1:974245233171:web:2d779724958d605c6d75e6"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ===================================================================
   ÉTAT LOCAL
   =================================================================== */
let TYPES = {};        // { lettre: {lettre, longueur, largeur, hauteur, description, photo} }
let EMPLACEMENTS = {}; // { id: {id, nom, description} }
let CONTENANTS = {};   // { identifiant: {...} }
let unsubTypes = null, unsubEmp = null, unsubCont = null;

let typePhotoBase64 = null; // photo en attente pour le nouveau type (aperçu avant "Ajouter")

/* ===================================================================
   AUTHENTIFICATION
   =================================================================== */
function doLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if(!email || !pass){
    errEl.textContent = "Renseigne l'e-mail et le mot de passe.";
    return;
  }
  auth.signInWithEmailAndPassword(email, pass).catch(err=>{
    errEl.textContent = traduireErreurAuth(err);
  });
}

function doLogout(){
  auth.signOut();
}

function traduireErreurAuth(err){
  switch(err.code){
    case 'auth/invalid-email': return "Adresse e-mail invalide.";
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return "E-mail ou mot de passe incorrect.";
    case 'auth/too-many-requests': return "Trop de tentatives. Réessaie dans quelques minutes.";
    default: return "Connexion impossible (" + err.code + ").";
  }
}

auth.onAuthStateChanged(user=>{
  if(user){
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('user-email').textContent = user.email;
    attacherListenersFirestore();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    if(unsubTypes) unsubTypes();
    if(unsubEmp) unsubEmp();
    if(unsubCont) unsubCont();
  }
});

document.getElementById('login-pass').addEventListener('keydown', e=>{
  if(e.key === 'Enter') doLogin();
});

/* ===================================================================
   NAVIGATION ENTRE ONGLETS
   =================================================================== */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.view).classList.add('active');
  });
});

/* ===================================================================
   TOASTS
   =================================================================== */
function toast(msg, type=''){
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}

/* ===================================================================
   FIRESTORE : LISTENERS TEMPS RÉEL
   =================================================================== */
function attacherListenersFirestore(){
  unsubTypes = db.collection('typesContenants').onSnapshot(snap=>{
    TYPES = {};
    snap.forEach(doc=> TYPES[doc.id] = doc.data());
    renderTypes();
    renderSelectTypes();
    renderStatsParType();
  }, err=> toast("Erreur de chargement des types : " + err.message, 'err'));

  unsubEmp = db.collection('emplacements').onSnapshot(snap=>{
    EMPLACEMENTS = {};
    snap.forEach(doc=> EMPLACEMENTS[doc.id] = {id: doc.id, ...doc.data()});
    renderEmplacements();
    renderSelectEmplacements();
  }, err=> toast("Erreur de chargement des emplacements : " + err.message, 'err'));

  unsubCont = db.collection('contenants').onSnapshot(snap=>{
    CONTENANTS = {};
    snap.forEach(doc=> CONTENANTS[doc.id] = doc.data());
    renderContenants();
    renderStats();
  }, err=> toast("Erreur de chargement des contenants : " + err.message, 'err'));
}

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

// Ouvre la photo d'un type existant en grand (modale)
function ouvrirPhotoType(lettre){
  const t = TYPES[lettre];
  if(!t || !t.photo) return;
  document.getElementById('modal-photo-title').textContent = 'Photo — Type ' + lettre;
  document.getElementById('modal-photo-img').src = t.photo;
  document.getElementById('modal-photo').classList.add('active');
}

function closePhotoModal(){
  document.getElementById('modal-photo').classList.remove('active');
}
document.getElementById('modal-photo').addEventListener('click', e=>{
  if(e.target.id === 'modal-photo') closePhotoModal();
});

/* ===================================================================
   TYPES DE CONTENANTS
   =================================================================== */
function creerType(){
  const lettre = document.getElementById('type-lettre').value.trim().toUpperCase();
  const longueur = document.getElementById('type-longueur').value;
  const largeur = document.getElementById('type-largeur').value;
  const hauteur = document.getElementById('type-hauteur').value;
  const description = document.getElementById('type-desc').value.trim();

  if(!lettre){ toast("Indique une lettre pour ce type.", 'err'); return; }
  if(TYPES[lettre]){ toast("Ce type existe déjà.", 'err'); return; }

  db.collection('typesContenants').doc(lettre).set({
    lettre, longueur: Number(longueur)||0, largeur: Number(largeur)||0,
    hauteur: Number(hauteur)||0, description,
    photo: typePhotoBase64 || null
  }).then(()=>{
    toast("Type " + lettre + " ajouté.", 'ok');
    document.getElementById('type-lettre').value='';
    document.getElementById('type-longueur').value='';
    document.getElementById('type-largeur').value='';
    document.getElementById('type-hauteur').value='';
    document.getElementById('type-desc').value='';
    effacerPhotoType();
  }).catch(err=> toast("Erreur : " + err.message, 'err'));
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
   contenants existants). Seuls les dimensions, la description et la
   photo sont éditables. */
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

function enregistrerEditType(){
  const lettre = document.getElementById('edit-type-lettre').value;
  const longueur = document.getElementById('edit-type-longueur').value;
  const largeur = document.getElementById('edit-type-largeur').value;
  const hauteur = document.getElementById('edit-type-hauteur').value;
  const description = document.getElementById('edit-type-desc').value.trim();

  const maj = {
    longueur: Number(longueur)||0,
    largeur: Number(largeur)||0,
    hauteur: Number(hauteur)||0,
    description
  };

  // Photo : on ne touche au champ que si l'utilisateur a choisi une
  // nouvelle photo, ou explicitement retiré l'ancienne. Sinon la photo
  // existante en base est conservée telle quelle.
  if(editTypePhotoBase64){
    maj.photo = editTypePhotoBase64;
  } else if(editTypePhotoSupprimee){
    maj.photo = null;
  }

  db.collection('typesContenants').doc(lettre).update(maj).then(()=>{
    toast("Type " + lettre + " mis à jour.", 'ok');
    closeEditTypeModal();
  }).catch(err=> toast("Erreur : " + err.message, 'err'));
}

function renderTypes(){
  const el = document.getElementById('types-table');
  const lettres = Object.keys(TYPES).sort();
  if(lettres.length === 0){
    el.innerHTML = '<div class="empty">Aucun type enregistré pour l\'instant.</div>';
    return;
  }
  let html = '<table><thead><tr><th>Photo</th><th>Lettre</th><th>Longueur</th><th>Largeur</th><th>Hauteur</th><th>Description</th><th></th></tr></thead><tbody>';
  lettres.forEach(l=>{
    const t = TYPES[l];
    const photoHtml = t.photo
      ? `<img src="${t.photo}" class="type-thumb" onclick="ouvrirPhotoType('${l}')" alt="Photo type ${t.lettre}">`
      : '<span class="type-thumb-empty">—</span>';
    html += `<tr>
      <td>${photoHtml}</td>
      <td class="mono"><strong>${t.lettre}</strong></td>
      <td>${t.longueur} mm</td>
      <td>${t.largeur} mm</td>
      <td>${t.hauteur} mm</td>
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
  const opts = lettres.map(l=> `<option value="${l}">${l} — ${TYPES[l].description || (TYPES[l].longueur+'×'+TYPES[l].largeur+'×'+TYPES[l].hauteur+' mm')}</option>`).join('');

  const selNew = document.getElementById('new-type');
  selNew.innerHTML = lettres.length ? opts : '<option value="">Aucun type — crée-en un d\'abord</option>';

  const selFilter = document.getElementById('filter-type');
  const current = selFilter.value;
  selFilter.innerHTML = '<option value="">Tous les types</option>' + opts;
  selFilter.value = current;
}

/* ===================================================================
   EMPLACEMENTS DE RÉPARATION
   =================================================================== */
function creerEmplacement(){
  const nom = document.getElementById('emp-nom').value.trim();
  const description = document.getElementById('emp-desc').value.trim();
  if(!nom){ toast("Indique un nom d'emplacement.", 'err'); return; }

  db.collection('emplacements').add({nom, description}).then(()=>{
    toast("Emplacement ajouté.", 'ok');
    document.getElementById('emp-nom').value='';
    document.getElementById('emp-desc').value='';
  }).catch(err=> toast("Erreur : " + err.message, 'err'));
}

function supprimerEmplacement(id){
  if(!confirm("Supprimer cet emplacement ?")) return;
  db.collection('emplacements').doc(id).delete()
    .then(()=> toast("Emplacement supprimé.", 'ok'))
    .catch(err=> toast("Erreur : " + err.message, 'err'));
}

function renderEmplacements(){
  const el = document.getElementById('emplacements-table');
  const ids = Object.keys(EMPLACEMENTS);
  if(ids.length === 0){
    el.innerHTML = '<div class="empty">Aucun emplacement enregistré pour l\'instant.</div>';
    return;
  }
  let html = '<table><thead><tr><th>Nom</th><th>Description</th><th></th></tr></thead><tbody>';
  ids.forEach(id=>{
    const e = EMPLACEMENTS[id];
    html += `<tr>
      <td><strong>${e.nom}</strong></td>
      <td>${e.description || '—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="supprimerEmplacement('${id}')">Supprimer</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderSelectEmplacements(){
  const ids = Object.keys(EMPLACEMENTS);
  const opts = ids.map(id=> `<option value="${id}">${EMPLACEMENTS[id].nom}</option>`).join('');

  const selFilter = document.getElementById('filter-emplacement');
  const current = selFilter.value;
  selFilter.innerHTML = '<option value="">Tous les emplacements</option>' + opts;
  selFilter.value = current;
}

/* ===================================================================
   CONTENANTS
   =================================================================== */

/* --- Génération d'un identifiant unique via compteur transactionnel ---
   Le doc "compteurs/contenants" stocke le dernier numéro attribué, sous
   forme de CHAÎNE (et non de Number) : ce numéro fait 18 chiffres, ce qui
   dépasse largement Number.MAX_SAFE_INTEGER. Le stocker comme nombre
   ferait perdre de la précision et finirait par créer des doublons.
   La transaction garantit qu'aucun numéro ne peut être délivré deux fois,
   même en cas de générations simultanées depuis plusieurs postes. */
const IDENTIFIANT_INITIAL = "052030000000000000"; // premier numéro généré
const IDENTIFIANT_LONGUEUR = IDENTIFIANT_INITIAL.length; // 18 chiffres

// Incrémente de 1 une chaîne de chiffres, comme une addition posée à la main.
function incrementerIdentifiant(str){
  const chiffres = str.split('');
  let i = chiffres.length - 1;
  while(i >= 0){
    if(chiffres[i] === '9'){ chiffres[i] = '0'; i--; }
    else { chiffres[i] = String(Number(chiffres[i]) + 1); return chiffres.join(''); }
  }
  // Cas extrême (débordement au-delà de 18 chiffres, ne devrait jamais arriver) :
  return '1' + chiffres.join('');
}

// "Générer" ne fait qu'une PRÉVISUALISATION : simple lecture, rien n'est
// écrit dans Firestore ici. Le numéro n'est réellement "consommé" (compteur
// mis à jour) que lorsqu'on clique sur "Ajouter" et que le contenant est
// vraiment créé — voir creerContenant() ci-dessous. Ainsi, si on génère
// plusieurs numéros sans jamais valider, on ne crée pas de trous dans la
// numérotation.
function genererIdentifiant(){
  const idInput = document.getElementById('new-id');
  const compteurRef = db.collection('compteurs').doc('contenants');

  compteurRef.get().then(doc=>{
    const dernier = doc.exists ? doc.data().dernier : null;
    const suivant = dernier ? incrementerIdentifiant(dernier) : IDENTIFIANT_INITIAL;
    idInput.value = suivant;
    imprimerCodeBarre(suivant);
    idInput.focus();
  }).catch(err=> toast("Erreur de génération : " + err.message, 'err'));
}

// Vrai si l'identifiant a le format de la numérotation automatique
// (18 chiffres). Un identifiant scanné/saisi manuellement dans un autre
// format n'impacte pas le compteur.
function estIdentifiantAuto(id){
  return typeof id === 'string' && id.length === IDENTIFIANT_LONGUEUR && /^[0-9]+$/.test(id);
}

/* --- Création d'un contenant avec vérification anti-doublon côté serveur ---
   On utilise une transaction plutôt qu'un simple .set() : elle relit le
   document au moment exact de l'écriture, donc même si le cache local
   (CONTENANTS) n'est pas encore à jour ou si deux utilisateurs créent
   le même identifiant en même temps, un seul des deux réussira. */
function creerContenant(){
  const idInput = document.getElementById('new-id');
  const identifiant = idInput.value.trim();
  const typeLettre = document.getElementById('new-type').value;

  if(!identifiant){ toast("Scanne, saisis ou génère un identifiant.", 'err'); return; }
  if(!typeLettre){ toast("Sélectionne un type de contenant.", 'err'); return; }

  const now = firebase.firestore.Timestamp.now();
  const ref = db.collection('contenants').doc(identifiant);
  const compteurRef = db.collection('compteurs').doc('contenants');

  // La mise à jour du compteur se fait DANS la même transaction que la
  // création du contenant : c'est le seul moyen de garantir que le
  // compteur avance exactement en même temps que les contenants sont
  // réellement créés (et pas à chaque "Générer", qui n'est qu'un aperçu).
  // Toutes les lectures Firestore doivent précéder les écritures dans une
  // transaction, d'où le Promise.all sur les deux lectures avant les tx.set.
  db.runTransaction(tx=>{
    return Promise.all([tx.get(ref), tx.get(compteurRef)]).then(([contDoc, compteurDoc])=>{
      if(contDoc.exists) throw new Error('DUPLICATE');

      tx.set(ref, {
        identifiant, typeLettre, statut: 'en_service',
        emplacementId: null, dateCreation: now, dateCasse: null, dateReparation: null,
        historique: [{date: now, action: 'creation', statut: 'en_service', emplacementId: null, commentaire: 'Enregistrement du contenant'}]
      });

      // On n'avance le compteur que si l'identifiant suit le format auto
      // (18 chiffres) ET qu'il est supérieur au dernier connu. Cette
      // dernière condition évite de faire reculer le compteur si un
      // identifiant plus ancien (scanné manuellement) est saisi après coup.
      if(estIdentifiantAuto(identifiant)){
        const dernier = compteurDoc.exists ? compteurDoc.data().dernier : null;
        if(!dernier || identifiant > dernier){
          tx.set(compteurRef, {dernier: identifiant});
        }
      }
    });
  }).then(()=>{
    toast("Contenant " + identifiant + " enregistré.", 'ok');
    idInput.value = '';
    idInput.focus();
  }).catch(err=>{
    if(err.message === 'DUPLICATE') toast("Cet identifiant est déjà enregistré.", 'err');
    else toast("Erreur : " + err.message, 'err');
  });
}

// Support douchette code-barres : validation sur "Entrée"
document.getElementById('new-id').addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); creerContenant(); }
});
document.getElementById('lookup-id').addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); lookupContenant(); }
});

function libelleStatut(statut){
  switch(statut){
    case 'en_service': return '<span class="badge badge-ok">En service</span>';
    case 'casse': return '<span class="badge badge-danger">Cassé</span>';
    case 'reforme': return '<span class="badge badge-info">Réformé</span>';
    default: return statut;
  }
}

function formatDate(ts){
  if(!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
}

function renderContenants(){
  const el = document.getElementById('contenants-table');
  const search = (document.getElementById('filter-search').value || '').trim().toLowerCase();
  const fStatut = document.getElementById('filter-statut').value;
  const fType = document.getElementById('filter-type').value;
  const fEmp = document.getElementById('filter-emplacement').value;

  let rows = Object.values(CONTENANTS).filter(c=>{
    if(search && !c.identifiant.toLowerCase().includes(search)) return false;
    if(fStatut && c.statut !== fStatut) return false;
    if(fType && c.typeLettre !== fType) return false;
    if(fEmp && c.emplacementId !== fEmp) return false;
    return true;
  });

  rows.sort((a,b)=> (b.dateCreation?.seconds||0) - (a.dateCreation?.seconds||0));

  if(rows.length === 0){
    el.innerHTML = '<div class="empty">Aucun contenant ne correspond à ces critères.</div>';
    return;
  }

  let html = '<table><thead><tr><th>Identifiant</th><th>Type</th><th>Statut</th><th>Emplacement</th><th>Créé le</th><th></th></tr></thead><tbody>';
  rows.forEach(c=>{
    const emp = c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '—';
    html += `<tr class="clickable" onclick="ouvrirHistorique('${c.identifiant}')">
      <td class="mono">${c.identifiant}</td>
      <td>${c.typeLettre}</td>
      <td>${libelleStatut(c.statut)}</td>
      <td>${emp}</td>
      <td>${formatDate(c.dateCreation)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); imprimerCodeBarre('${c.identifiant}')">Code-barres</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ===================================================================
   IMPRESSION DE CODES-BARRES (JsBarcode)
   =================================================================== */
function imprimerCodeBarre(identifiant){
  const svg = document.getElementById('barcode-svg');
  JsBarcode(svg, identifiant, {
    format: 'CODE128',
    width: 2,
    height: 70,
    fontSize: 14,
    margin: 12
  });
  document.getElementById('modal-barcode').classList.add('active');
}

function closeBarcodeModal(){
  document.getElementById('modal-barcode').classList.remove('active');
}
document.getElementById('modal-barcode').addEventListener('click', e=>{
  if(e.target.id === 'modal-barcode') closeBarcodeModal();
});

/* ===================================================================
   STATISTIQUES
   =================================================================== */
function renderStats(){
  const kpisEl = document.getElementById('stats-kpis');
  const barsEl = document.getElementById('stats-bars');
  if(!kpisEl || !barsEl) return;

  const tous = Object.values(CONTENANTS);
  const total = tous.length;
  const nbService = tous.filter(c=> c.statut === 'en_service').length;
  const nbCasse = tous.filter(c=> c.statut === 'casse').length;
  const nbReforme = tous.filter(c=> c.statut === 'reforme').length;
  const tauxCasse = total ? Math.round((nbCasse / total) * 100) : 0;

  kpisEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total contenants</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-sub">tous statuts confondus</div>
    </div>
    <div class="kpi-card accent-ok">
      <div class="kpi-label">En service</div>
      <div class="kpi-value">${nbService}</div>
      <div class="kpi-sub">${total ? Math.round((nbService/total)*100) : 0}% du parc</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-label">Cassés</div>
      <div class="kpi-value">${nbCasse}</div>
      <div class="kpi-sub">${tauxCasse}% du parc</div>
    </div>
    <div class="kpi-card accent-info">
      <div class="kpi-label">Réformés</div>
      <div class="kpi-value">${nbReforme}</div>
      <div class="kpi-sub">${total ? Math.round((nbReforme/total)*100) : 0}% du parc</div>
    </div>`;

  if(total === 0){
    barsEl.innerHTML = '<div class="empty">Aucun contenant enregistré pour l\'instant.</div>';
    renderStatsParType();
    return;
  }

  const pct = n => Math.round((n/total)*100);
  barsEl.innerHTML = `
    <div class="stat-bar-row">
      <div class="stat-bar-label"><span>En service</span><span>${nbService} (${pct(nbService)}%)</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill ok" style="width:${pct(nbService)}%"></div></div>
    </div>
    <div class="stat-bar-row">
      <div class="stat-bar-label"><span>Cassés</span><span>${nbCasse} (${pct(nbCasse)}%)</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill danger" style="width:${pct(nbCasse)}%"></div></div>
    </div>
    <div class="stat-bar-row">
      <div class="stat-bar-label"><span>Réformés</span><span>${nbReforme} (${pct(nbReforme)}%)</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill info" style="width:${pct(nbReforme)}%"></div></div>
    </div>`;

  renderStatsParType();
}

function renderStatsParType(){
  const el = document.getElementById('stats-par-type');
  if(!el) return;

  const lettres = Object.keys(TYPES).sort();
  const tous = Object.values(CONTENANTS);

  if(lettres.length === 0){
    el.innerHTML = '<div class="empty">Aucun type enregistré pour l\'instant.</div>';
    return;
  }

  let html = '<table><thead><tr><th>Type</th><th>Total</th><th>En service</th><th>Cassé</th><th>Réformé</th><th>Taux de casse</th></tr></thead><tbody>';
  lettres.forEach(l=>{
    const items = tous.filter(c=> c.typeLettre === l);
    const total = items.length;
    const nbServiceT = items.filter(c=> c.statut === 'en_service').length;
    const nbCasseT = items.filter(c=> c.statut === 'casse').length;
    const nbReformeT = items.filter(c=> c.statut === 'reforme').length;
    const tauxT = total ? Math.round((nbCasseT/total)*100) : 0;
    html += `<tr>
      <td class="mono"><strong>${l}</strong></td>
      <td>${total}</td>
      <td>${nbServiceT}</td>
      <td>${nbCasseT}</td>
      <td>${nbReformeT}</td>
      <td>${tauxT}%</td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ===================================================================
   DÉCLARATION DE CASSE / RÉPARATION
   =================================================================== */
let contenantCourant = null;

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
        <div style="flex:0;">
          <button class="btn btn-danger" onclick="declarerCasse()">Déclarer cassé</button>
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
          <button class="btn btn-primary" onclick="marquerRepare()">Remettre en service</button>
        </div>
        <div style="flex:0;">
          <button class="btn btn-ghost" onclick="marquerReforme()">Réformer définitivement</button>
        </div>
      </div>`;
  } else {
    actionsHtml = '<p class="sub" style="margin-top:14px;">Ce contenant est réformé, aucune action disponible.</p>';
  }

  resultEl.innerHTML = `
    <div class="lookup-result">
      <div class="row"><span>Identifiant</span><span class="mono">${c.identifiant}</span></div>
      <div class="row"><span>Type</span><span>${c.typeLettre}</span></div>
      <div class="row"><span>Statut actuel</span><span>${libelleStatut(c.statut)}</span></div>
      <div class="row"><span>Emplacement actuel</span><span>${c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '—'}</span></div>
      ${actionsHtml}
    </div>`;
}

function declarerCasse(){
  if(!contenantCourant) return;
  const empId = document.getElementById('casse-emplacement').value;
  const commentaire = document.getElementById('casse-commentaire').value.trim();
  if(!empId){ toast("Sélectionne un emplacement de réparation.", 'err'); return; }

  const now = firebase.firestore.Timestamp.now();
  db.collection('contenants').doc(contenantCourant.identifiant).update({
    statut: 'casse',
    emplacementId: empId,
    dateCasse: now,
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: 'casse', statut: 'casse', emplacementId: empId,
      commentaire: commentaire || 'Déposé sur emplacement de réparation'
    })
  }).then(()=>{
    toast("Contenant déclaré cassé et déposé.", 'ok');
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'));
}

function marquerRepare(){
  if(!contenantCourant) return;
  const commentaire = document.getElementById('reparation-commentaire').value.trim();
  const now = firebase.firestore.Timestamp.now();
  db.collection('contenants').doc(contenantCourant.identifiant).update({
    statut: 'en_service',
    emplacementId: null,
    dateReparation: now,
    historique: firebase.firestore.FieldValue.arrayUnion({
      date: now, action: 'reparation', statut: 'en_service', emplacementId: null,
      commentaire: commentaire || 'Réparé, remis en service'
    })
  }).then(()=>{
    toast("Contenant remis en service.", 'ok');
    document.getElementById('lookup-id').value = '';
    document.getElementById('lookup-result').innerHTML = '';
    document.getElementById('lookup-id').focus();
  }).catch(err=> toast("Erreur : " + err.message, 'err'));
}

function marquerReforme(){
  if(!contenantCourant) return;
  if(!confirm("Réformer définitivement ce contenant ? Cette action est difficilement réversible.")) return;
  const now = firebase.firestore.Timestamp.now();
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
  }).catch(err=> toast("Erreur : " + err.message, 'err'));
}

/* ===================================================================
   MODALE HISTORIQUE
   =================================================================== */
function ouvrirHistorique(identifiant){
  const c = CONTENANTS[identifiant];
  if(!c) return;
  document.getElementById('modal-title').textContent = 'Historique — ' + identifiant;
  const hist = (c.historique || []).slice().sort((a,b)=> (b.date?.seconds||0)-(a.date?.seconds||0));
  let html = '';
  if(hist.length === 0){
    html = '<div class="empty">Aucun historique disponible.</div>';
  } else {
    hist.forEach(h=>{
      const emp = h.emplacementId && EMPLACEMENTS[h.emplacementId] ? EMPLACEMENTS[h.emplacementId].nom : null;
      html += `<div class="hist-item">
        <div class="date">${formatDate(h.date)}</div>
        <div>${libelleStatut(h.statut)} ${emp ? '— ' + emp : ''}</div>
        <div style="color:var(--ink-soft);">${h.commentaire || ''}</div>
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

/* ===================================================================
   BOOK PDF DES TYPES DE CONTENANTS
   Génère un catalogue PDF (page de couverture + une page par type) à
   partir des données déjà chargées dans TYPES (photo, dimensions,
   description). Aucun appel serveur supplémentaire : tout est déjà en
   mémoire grâce aux listeners Firestore.
   =================================================================== */
async function genererBookPDF(){
  const lettres = Object.keys(TYPES).sort();
  if(lettres.length === 0){ toast("Aucun type à exporter.", 'err'); return; }

  toast("Génération du book PDF…", '');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  const oak = [138, 90, 52];
  const ink = [38, 35, 30];
  const inkSoft = [107, 98, 85];

  // ---- Page de couverture ----
  doc.setFillColor(...oak);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text('Catalogue des contenants', pageW / 2, 130, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.text(lettres.length + ' type(s) référencé(s)', pageW / 2, 145, { align: 'center' });
  doc.setFontSize(10);
  doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR'), pageW / 2, 155, { align: 'center' });

  // ---- Une page par type ----
  lettres.forEach((lettre, index) => {
    const t = TYPES[lettre];
    doc.addPage();

    // Bandeau d'en-tête
    doc.setFillColor(...oak);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Type ' + t.lettre, 15, 17);

    let y = 40;
    doc.setTextColor(...ink);

    // Dimensions
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Dimensions', 15, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Longueur : ' + (t.longueur || 0) + ' mm', 15, y); y += 6;
    doc.text('Largeur : ' + (t.largeur || 0) + ' mm', 15, y); y += 6;
    doc.text('Hauteur : ' + (t.hauteur || 0) + ' mm', 15, y); y += 10;

    // Description
    if (t.description) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Description', 15, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(t.description, pageW - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 8;
    }

    // Photo
    if (t.photo) {
      try {
        const imgProps = doc.getImageProperties(t.photo);
        const maxW = pageW - 30;
        const maxH = pageH - y - 20;
        let w = maxW, h = (imgProps.height / imgProps.width) * w;
        if (h > maxH) { h = maxH; w = (imgProps.width / imgProps.height) * h; }
        const x = (pageW - w) / 2;
        doc.addImage(t.photo, 'JPEG', x, y, w, h);
      } catch (e) {
        console.error('Erreur image type ' + lettre, e);
      }
    } else {
      doc.setFontSize(10);
      doc.setTextColor(...inkSoft);
      doc.text('(Aucune photo disponible pour ce type)', 15, y);
    }

    // Pied de page
    doc.setFontSize(9);
    doc.setTextColor(...inkSoft);
    doc.text('Type ' + t.lettre, 15, pageH - 10);
    doc.text((index + 1) + ' / ' + lettres.length, pageW - 15, pageH - 10, { align: 'right' });
  });

  doc.save('catalogue-contenants.pdf');
  toast("Book PDF généré.", 'ok');
}
