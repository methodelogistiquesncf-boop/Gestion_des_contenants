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
let TYPES = {};        // { lettre: {lettre, longueur, largeur, hauteur, description, photo, categorieId} }
let EMPLACEMENTS = {}; // { id: {id, nom, description} }
let CONTENANTS = {};   // { identifiant: {...} }
let CATEGORIES = {};   // { id: {id, nom, couleur} }
let unsubTypes = null, unsubEmp = null, unsubCont = null, unsubCat = null;

let typePhotoBase64 = null; // photo en attente pour le nouveau type (aperçu avant "Ajouter")
let cassePhotoBase64 = null; // photo en attente pour la déclaration de casse en cours
let historiqueCourant = []; // historique actuellement affiché dans la modale (pour retrouver une photo par index)

/* ===================================================================
   DÉCONNEXION AUTOMATIQUE POUR INACTIVITÉ
   Après 8 heures sans la moindre interaction (clic, frappe, défilement,
   toucher, molette), l'utilisateur est automatiquement déconnecté et
   renvoyé vers l'écran de connexion.

   La dernière activité est stockée dans localStorage (et pas seulement
   en mémoire) afin de survivre à un rechargement de page ou à une
   fermeture/réouverture de l'onglet : si le PC part en veille prolongée
   ou que l'onglet reste ouvert en arrière-plan pendant la nuit, la
   vérification au retour (au chargement de la page, ou via le minuteur
   pendant que la page reste ouverte) déclenche quand même la
   déconnexion.
   =================================================================== */
const INACTIVITE_CLE = 'derniereActiviteSuiviContenantsBois';
const INACTIVITE_MAX_MS = 8 * 60 * 60 * 1000; // 8 heures
let inactiviteInterval = null;

function enregistrerActivite(){
  // On n'écrit dans localStorage que si quelqu'un est connecté : inutile
  // de suivre une "activité" sur l'écran de connexion lui-même.
  if(auth.currentUser){
    localStorage.setItem(INACTIVITE_CLE, Date.now().toString());
  }
}

// Tout type d'interaction utilisateur relance le compteur d'inactivité.
['click','keydown','mousemove','wheel','touchstart','scroll'].forEach(evt=>{
  document.addEventListener(evt, enregistrerActivite, {passive:true});
});

function demarrerSurveillanceInactivite(){
  arreterSurveillanceInactivite();
  // Vérification toutes les minutes : largement suffisant pour une limite
  // de 8h, et ça évite de solliciter le CPU/la batterie inutilement.
  inactiviteInterval = setInterval(()=>{
    const derniere = Number(localStorage.getItem(INACTIVITE_CLE) || 0);
    if(derniere && (Date.now() - derniere) > INACTIVITE_MAX_MS){
      arreterSurveillanceInactivite();
      auth.signOut().then(()=>{
        toast("Session expirée après 8h d'inactivité, reconnecte-toi.", 'err');
      });
    }
  }, 60 * 1000);
}

function arreterSurveillanceInactivite(){
  if(inactiviteInterval){
    clearInterval(inactiviteInterval);
    inactiviteInterval = null;
  }
}

/* ===================================================================
   ÉTATS DE CHARGEMENT DES BOUTONS
   Évite les doubles soumissions vers Firestore : le bouton se
   désactive et affiche un petit spinner + libellé pendant l'appel,
   puis reprend son état d'origine (succès ou échec).
   =================================================================== */
function setBtnLoading(btn, loadingLabel){
  if(!btn) return;
  if(!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>' + (loadingLabel || 'Enregistrement…');
}

function clearBtnLoading(btn){
  if(!btn) return;
  btn.disabled = false;
  if(btn.dataset.originalLabel){
    btn.innerHTML = btn.dataset.originalLabel;
    delete btn.dataset.originalLabel;
  }
}

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
    case 'auth/missing-email': return "Indique une adresse e-mail.";
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return "E-mail ou mot de passe incorrect.";
    case 'auth/too-many-requests': return "Trop de tentatives. Réessaie dans quelques minutes.";
    case 'auth/weak-password': return "Le nouveau mot de passe est trop faible (6 caractères minimum).";
    case 'auth/requires-recent-login': return "Session trop ancienne : reconnecte-toi puis réessaie.";
    default: return "Opération impossible (" + err.code + ").";
  }
}

auth.onAuthStateChanged(user=>{
  if(user){
    // Si la dernière activité connue date de plus de 8h (onglet resté
    // ouvert en arrière-plan, PC en veille prolongée, session Firebase
    // encore techniquement valide après une longue absence...), on
    // déconnecte immédiatement au lieu d'afficher l'application : on ne
    // laisse jamais réapparaître l'app sans repasser par l'écran de
    // connexion dans ce cas.
    const derniere = Number(localStorage.getItem(INACTIVITE_CLE) || 0);
    if(derniere && (Date.now() - derniere) > INACTIVITE_MAX_MS){
      localStorage.removeItem(INACTIVITE_CLE);
      auth.signOut();
      return;
    }

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('user-email').textContent = user.email;
    attacherListenersFirestore();
    enregistrerActivite();
    demarrerSurveillanceInactivite();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    if(unsubTypes) unsubTypes();
    if(unsubEmp) unsubEmp();
    if(unsubCont) unsubCont();
    if(unsubCat) unsubCat();
    arreterSurveillanceInactivite();
    localStorage.removeItem(INACTIVITE_CLE);
  }
});

document.getElementById('login-pass').addEventListener('keydown', e=>{
  if(e.key === 'Enter') doLogin();
});

/* ===================================================================
   VISIBILITÉ DES CHAMPS MOT DE PASSE (icône œil)
   =================================================================== */
const ICON_EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const ICON_EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

function toggleFieldVisibility(inputId, btn){
  const input = document.getElementById(inputId);
  if(input.type === 'password'){
    input.type = 'text';
    btn.innerHTML = ICON_EYE_OFF;
    btn.setAttribute('aria-label', 'Masquer le mot de passe');
  } else {
    input.type = 'password';
    btn.innerHTML = ICON_EYE;
    btn.setAttribute('aria-label', 'Afficher le mot de passe');
  }
}

/* ===================================================================
   MOT DE PASSE OUBLIÉ
   =================================================================== */
function ouvrirForgotModal(){
  document.getElementById('forgot-email').value = document.getElementById('login-email').value.trim();
  const msgEl = document.getElementById('forgot-msg');
  msgEl.textContent = '';
  msgEl.style.color = '';
  document.getElementById('modal-forgot').classList.add('active');
}

function closeForgotModal(){
  document.getElementById('modal-forgot').classList.remove('active');
}
document.getElementById('modal-forgot').addEventListener('click', e=>{
  if(e.target.id === 'modal-forgot') closeForgotModal();
});

function envoyerResetMotDePasse(btn){
  const email = document.getElementById('forgot-email').value.trim();
  const msgEl = document.getElementById('forgot-msg');

  if(!email){
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = "Indique ton adresse e-mail.";
    return;
  }

  setBtnLoading(btn, 'Envoi…');
  auth.sendPasswordResetEmail(email).then(()=>{
    msgEl.style.color = 'var(--ok)';
    msgEl.textContent = "E-mail envoyé. Vérifie ta boîte de réception (et les spams).";
  }).catch(err=>{
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = traduireErreurAuth(err);
  }).finally(()=> clearBtnLoading(btn));
}

/* ===================================================================
   CHANGER LE MOT DE PASSE (utilisateur déjà connecté)
   =================================================================== */
function ouvrirChangePasswordModal(){
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-new-confirm').value = '';
  const msgEl = document.getElementById('cp-msg');
  msgEl.textContent = '';
  msgEl.style.color = '';
  document.getElementById('modal-change-password').classList.add('active');
}

function closeChangePasswordModal(){
  document.getElementById('modal-change-password').classList.remove('active');
}
document.getElementById('modal-change-password').addEventListener('click', e=>{
  if(e.target.id === 'modal-change-password') closeChangePasswordModal();
});

function enregistrerNouveauMotDePasse(btn){
  const current = document.getElementById('cp-current').value;
  const nouveau = document.getElementById('cp-new').value;
  const confirmation = document.getElementById('cp-new-confirm').value;
  const msgEl = document.getElementById('cp-msg');
  msgEl.style.color = 'var(--danger)';

  if(!current || !nouveau || !confirmation){
    msgEl.textContent = "Remplis tous les champs.";
    return;
  }
  if(nouveau.length < 6){
    msgEl.textContent = "Le nouveau mot de passe doit faire au moins 6 caractères.";
    return;
  }
  if(nouveau !== confirmation){
    msgEl.textContent = "Les deux mots de passe ne correspondent pas.";
    return;
  }

  const user = auth.currentUser;
  if(!user){
    msgEl.textContent = "Session expirée, reconnecte-toi.";
    return;
  }

  setBtnLoading(btn, 'Enregistrement…');

  // Firebase exige une connexion "récente" pour changer le mot de passe :
  // on ré-authentifie d'abord avec le mot de passe actuel avant d'appeler
  // updatePassword, sinon Firebase renvoie l'erreur auth/requires-recent-login.
  const credential = firebase.auth.EmailAuthProvider.credential(user.email, current);
  user.reauthenticateWithCredential(credential).then(()=>{
    return user.updatePassword(nouveau);
  }).then(()=>{
    msgEl.style.color = 'var(--ok)';
    msgEl.textContent = "Mot de passe mis à jour.";
    toast("Mot de passe changé avec succès.", 'ok');
    setTimeout(closeChangePasswordModal, 1200);
  }).catch(err=>{
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = traduireErreurAuth(err);
  }).finally(()=> clearBtnLoading(btn));
}

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

// Raccourci utilisé par le badge d'alerte du bandeau : envoie directement
// vers l'onglet Casse / Réparation, où l'utilisateur peut agir.
function allerVersCasse(){
  const btn = document.querySelector('.tab-btn[data-view="v-casse"]');
  if(btn) btn.click();
}

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

  unsubCat = db.collection('categoriesContenants').onSnapshot(snap=>{
    CATEGORIES = {};
    snap.forEach(doc=> CATEGORIES[doc.id] = {id: doc.id, ...doc.data()});
    renderCategories();
    renderSelectCategories();
    renderTypes();
    renderStatsParCategorie();
  }, err=> toast("Erreur de chargement des catégories : " + err.message, 'err'));
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

/* ===================================================================
   CATÉGORIES DE CONTENANTS
   (Bois / Métallique / Plastique / etc. — un type peut être rattaché
   à une catégorie pour permettre de filtrer et de statistiquer par
   matériau ou famille de contenant.)
   =================================================================== */
function creerCategorie(btn){
  const nom = document.getElementById('cat-nom').value.trim();
  const couleur = document.getElementById('cat-couleur').value || '#2c5f8a';

  if(!nom){ toast("Indique un nom de catégorie.", 'err'); return; }

  const dejaExistante = Object.values(CATEGORIES).some(c=> c.nom.toLowerCase() === nom.toLowerCase());
  if(dejaExistante){ toast("Cette catégorie existe déjà.", 'err'); return; }

  setBtnLoading(btn, 'Ajout…');
  db.collection('categoriesContenants').add({nom, couleur}).then(()=>{
    toast("Catégorie \"" + nom + "\" ajoutée.", 'ok');
    document.getElementById('cat-nom').value = '';
    document.getElementById('cat-couleur').value = '#2c5f8a';
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
  document.getElementById('edit-cat-id').value = id;
  document.getElementById('edit-cat-nom').value = c.nom || '';
  document.getElementById('edit-cat-couleur').value = c.couleur || '#2c5f8a';
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

  if(!nom){ toast("Indique un nom de catégorie.", 'err'); return; }

  setBtnLoading(btn, 'Enregistrement…');
  db.collection('categoriesContenants').doc(id).update({nom, couleur}).then(()=>{
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

  // Nombre de types rattachés à chaque catégorie, pour info.
  const nbTypesParCat = {};
  Object.values(TYPES).forEach(t=>{
    if(t.categorieId) nbTypesParCat[t.categorieId] = (nbTypesParCat[t.categorieId]||0) + 1;
  });

  let html = '<table><thead><tr><th>Catégorie</th><th>Types rattachés</th><th></th></tr></thead><tbody>';
  ids.forEach(id=>{
    html += `<tr>
      <td>${badgeCategorie(id)}</td>
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

// Remplit tous les <select> qui proposent une liste de catégories :
// le formulaire de création de type, la modale d'édition de type, et
// le filtre de la liste des contenants.
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

// Rendu d'un badge coloré pour une catégorie donnée (par son id).
// Retourne un badge neutre "Non catégorisé" si l'id est vide ou
// pointe vers une catégorie supprimée.
function badgeCategorie(catId){
  const c = CATEGORIES[catId];
  if(!c) return '<span class="badge-cat badge-cat-empty">Non catégorisé</span>';
  return `<span class="badge-cat" style="background:${c.couleur}22; color:${c.couleur}; border:1px solid ${c.couleur}55;">${c.nom}</span>`;
}

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

/* ===================================================================
   EMPLACEMENTS DE RÉPARATION
   =================================================================== */
function creerEmplacement(btn){
  const nom = document.getElementById('emp-nom').value.trim();
  const description = document.getElementById('emp-desc').value.trim();
  if(!nom){ toast("Indique un nom d'emplacement.", 'err'); return; }

  setBtnLoading(btn, 'Ajout…');
  db.collection('emplacements').add({nom, description}).then(()=>{
    toast("Emplacement ajouté.", 'ok');
    document.getElementById('emp-nom').value='';
    document.getElementById('emp-desc').value='';
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

function supprimerEmplacement(id){
  if(!confirm("Supprimer cet emplacement ?")) return;
  db.collection('emplacements').doc(id).delete()
    .then(()=> toast("Emplacement supprimé.", 'ok'))
    .catch(err=> toast("Erreur : " + err.message, 'err'));
}

function ouvrirEditEmplacement(id){
  const e = EMPLACEMENTS[id];
  if(!e) return;
  document.getElementById('edit-emp-id').value = id;
  document.getElementById('edit-emp-nom').value = e.nom || '';
  document.getElementById('edit-emp-desc').value = e.description || '';
  document.getElementById('modal-edit-emplacement').classList.add('active');
}

function closeEditEmplacementModal(){
  document.getElementById('modal-edit-emplacement').classList.remove('active');
}
document.getElementById('modal-edit-emplacement').addEventListener('click', e=>{
  if(e.target.id === 'modal-edit-emplacement') closeEditEmplacementModal();
});

function enregistrerEditEmplacement(btn){
  const id = document.getElementById('edit-emp-id').value;
  const nom = document.getElementById('edit-emp-nom').value.trim();
  const description = document.getElementById('edit-emp-desc').value.trim();

  if(!nom){ toast("Indique un nom d'emplacement.", 'err'); return; }

  setBtnLoading(btn, 'Enregistrement…');
  db.collection('emplacements').doc(id).update({nom, description}).then(()=>{
    toast("Emplacement mis à jour.", 'ok');
    closeEditEmplacementModal();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}



function renderEmplacements(){
  const el = document.getElementById('emplacements-table');
  const ids = Object.keys(EMPLACEMENTS);
  if(ids.length === 0){
    el.innerHTML = '<div class="empty">Aucun emplacement enregistré pour l\'instant. Ajoute-en un ci-dessus.</div>';
    return;
  }
  let html = '<table><thead><tr><th>Nom</th><th>Description</th><th></th></tr></thead><tbody>';
  ids.forEach(id=>{
    const e = EMPLACEMENTS[id];
    html += `<tr>
      <td><strong>${e.nom}</strong></td>
      <td>${e.description || '—'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="ouvrirEditEmplacement('${id}')">Modifier</button>
        <button class="btn btn-danger btn-sm" onclick="supprimerEmplacement('${id}')">Supprimer</button>
      </td>
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

/* --- Réservation d'un LOT d'identifiants pour impression en masse ---
   Contrairement à genererIdentifiant() (simple aperçu, rien n'est écrit),
   ici le compteur avance réellement pour tout le lot : c'est le prix à
   payer pour pouvoir imprimer à l'avance une planche d'étiquettes qui
   seront collées sur des contenants pas encore créés. Les contenants
   eux-mêmes ne sont créés qu'au moment du scan/enregistrement individuel
   (creerContenant), exactement comme pour un identifiant généré à l'unité.
   Une seule lecture + une seule écriture sur le compteur, quelle que soit
   la quantité : la boucle d'incrémentation se fait en mémoire. */
const LOT_QUANTITE_MAX = 100;

function reserverLotIdentifiants(quantite){
  const compteurRef = db.collection('compteurs').doc('contenants');

  // Si le compteur n'a jamais été initialisé (ex. des contenants créés/
  // importés avant sa mise en place), repartir de IDENTIFIANT_INITIAL
  // ferait entrer les numéros réservés en collision avec des contenants
  // déjà enregistrés. On repère donc d'abord, hors transaction, le plus
  // grand identifiant AU FORMAT AUTO (18 chiffres) réellement utilisé,
  // pour servir de point de départ de secours si besoin. On ignore les
  // identifiants scannés/saisis manuellement dans un autre format : les
  // prendre en compte tronquerait la numérotation (incrementerIdentifiant
  // continuerait sur leur longueur, pas sur 18 chiffres).
  const pointDeDepartSecours = compteurRef.get().then(compteurDoc=>{
    if(compteurDoc.exists) return null; // compteur déjà initialisé, pas besoin
    return db.collection('contenants')
      .orderBy(firebase.firestore.FieldPath.documentId(), 'desc')
      .limit(50).get()
      .then(snap=>{
        const auto = snap.docs.find(d=> estIdentifiantAuto(d.id));
        return auto ? auto.id : null;
      });
  });

  return pointDeDepartSecours.then(secours=>{
    return db.runTransaction(tx=>{
      // Le compteur est relu ICI, dans la transaction, pour la décision
      // définitive : ça protège contre une réservation concurrente
      // pendant l'étape de secours ci-dessus. Le secours n'est utilisé
      // que si le compteur est toujours absent au moment de la transaction.
      return tx.get(compteurRef).then(compteurDoc=>{
        let dernier = compteurDoc.exists ? compteurDoc.data().dernier : secours;
        // Garde-fou : si la valeur récupérée (compteur ou secours) n'est
        // pas au format 18 chiffres, on ignore et repart proprement de
        // IDENTIFIANT_INITIAL plutôt que de propager une longueur invalide.
        if(dernier && !estIdentifiantAuto(dernier)) dernier = null;
        const identifiants = [];
        for(let i=0; i<quantite; i++){
          dernier = dernier ? incrementerIdentifiant(dernier) : IDENTIFIANT_INITIAL;
          identifiants.push(dernier);
        }
        tx.set(compteurRef, {dernier});
        return identifiants;
      });
    });
  });
}

// Lit la quantité saisie, réserve le lot, puis lance l'impression groupée.
function lancerImpressionLot(){
  const qteInput = document.getElementById('lot-quantite');
  const btn = document.getElementById('btn-lot-imprimer');
  const quantite = parseInt(qteInput.value, 10);

  if(!quantite || quantite < 1){ toast("Indique une quantité valide.", 'err'); return; }
  if(quantite > LOT_QUANTITE_MAX){
    toast("Maximum " + LOT_QUANTITE_MAX + " étiquettes par lot.", 'err');
    return;
  }

  setBtnLoading(btn, 'Réservation…');
  reserverLotIdentifiants(quantite).then(identifiants=>{
    imprimerLotCodeBarres(identifiants, true);
    const premier = identifiants[0], dernierNum = identifiants[identifiants.length - 1];
    toast(quantite + " numéro(s) réservé(s) : " + premier + (quantite > 1 ? " → " + dernierNum : ''), 'ok');
  }).catch(err=> toast("Erreur de réservation : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
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
function creerContenant(btn){
  const idInput = document.getElementById('new-id');
  const identifiant = idInput.value.trim();
  const typeLettre = document.getElementById('new-type').value;

  if(!identifiant){ toast("Scanne, saisis ou génère un identifiant.", 'err'); return; }
  if(!typeLettre){ toast("Sélectionne un type de contenant.", 'err'); return; }

  const now = firebase.firestore.Timestamp.now();
  const ref = db.collection('contenants').doc(identifiant);
  const compteurRef = db.collection('compteurs').doc('contenants');

  setBtnLoading(btn, 'Enregistrement…');

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
        photoCasse: null,
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
  }).finally(()=> clearBtnLoading(btn));
}

// Support douchette code-barres : validation sur "Entrée"
document.getElementById('new-id').addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); creerContenant(document.getElementById('btn-creer-contenant')); }
});
document.getElementById('lookup-id').addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); lookupContenant(); }
});

/* ===================================================================
   ICÔNES DE STATUT
   Chaque statut est toujours signalé par une couleur ET une icône, afin
   de rester lisible même pour les personnes daltoniennes ou sur un
   écran peu contrasté en atelier.
   =================================================================== */
const ICON_STATUT_OK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
const ICON_STATUT_ATTENTION = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>';
const ICON_STATUT_NEUTRE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"></rect><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>';

function libelleStatut(statut){
  switch(statut){
    case 'en_service': return '<span class="badge badge-ok">' + ICON_STATUT_OK + 'En service</span>';
    case 'casse': return '<span class="badge badge-attention">' + ICON_STATUT_ATTENTION + 'Cassé</span>';
    case 'reforme': return '<span class="badge badge-neutral">' + ICON_STATUT_NEUTRE + 'Réformé</span>';
    default: return statut;
  }
}

function formatDate(ts){
  if(!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
}

/* ===================================================================
   TRI DU TABLEAU DES CONTENANTS
   L'utilisateur clique sur un en-tête de colonne pour trier ; un
   second clic sur la même colonne inverse le sens. Le tri s'applique
   après les filtres, sur la liste réellement affichée.
   =================================================================== */
const COLONNES_CONTENANTS = [
  { key: 'identifiant', label: 'Identifiant', get: c => c.identifiant || '' },
  { key: 'typeLettre', label: 'Type', get: c => c.typeLettre || '' },
  { key: 'categorie', label: 'Catégorie', get: c => {
      const t = TYPES[c.typeLettre];
      const cat = t && t.categorieId ? CATEGORIES[t.categorieId] : null;
      return cat ? cat.nom : '';
    } },
  { key: 'statut', label: 'Statut', get: c => c.statut || '' },
  { key: 'emplacement', label: 'Emplacement', get: c => c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '' },
  { key: 'dateCreation', label: 'Créé le', get: c => c.dateCreation && c.dateCreation.seconds ? c.dateCreation.seconds : 0 }
];

let sortContenantsState = { colonne: 'dateCreation', sens: 'desc' };

function trierContenants(colonne){
  if(sortContenantsState.colonne === colonne){
    sortContenantsState.sens = sortContenantsState.sens === 'asc' ? 'desc' : 'asc';
  } else {
    sortContenantsState.colonne = colonne;
    sortContenantsState.sens = colonne === 'dateCreation' ? 'desc' : 'asc';
  }
  renderContenants();
}

function flecheTri(colonne){
  if(sortContenantsState.colonne !== colonne) return '';
  return sortContenantsState.sens === 'asc'
    ? ' <span class="sort-arrow">▲</span>'
    : ' <span class="sort-arrow">▼</span>';
}

/* ===================================================================
   EXPORT EXCEL DES CONTENANTS
   Exporte exactement la liste actuellement filtrée/triée à l'écran,
   pas l'intégralité de la base : ce que l'utilisateur voit est ce
   qu'il exporte. Génère un vrai fichier .xlsx (via SheetJS), avec
   en-têtes mis en forme et largeurs de colonnes adaptées.
   =================================================================== */
function exporterContenantsExcel(){
  const rows = obtenirContenantsFiltresTries();
  if(rows.length === 0){ toast("Aucun contenant à exporter avec ces filtres.", 'err'); return; }

  const libelleStatutTexte = statut => ({
    en_service: 'En service', casse: 'Cassé', reforme: 'Réformé'
  }[statut] || statut);

  const entetes = ['Identifiant', 'Type', 'Catégorie', 'Statut', 'Emplacement', 'Créé le'];
  const donnees = rows.map(c=>{
    const t = TYPES[c.typeLettre];
    const cat = t && t.categorieId ? CATEGORIES[t.categorieId] : null;
    const emp = c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '';
    return [
      c.identifiant,
      c.typeLettre || '',
      cat ? cat.nom : '',
      libelleStatutTexte(c.statut),
      emp,
      formatDate(c.dateCreation)
    ];
  });

  const feuille = XLSX.utils.aoa_to_sheet([entetes, ...donnees]);

  // Largeurs de colonnes adaptées au contenu
  feuille['!cols'] = [
    { wch: 22 }, // Identifiant
    { wch: 8 },  // Type
    { wch: 16 }, // Catégorie
    { wch: 12 }, // Statut
    { wch: 22 }, // Emplacement
    { wch: 18 }  // Créé le
  ];

  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Contenants');
  XLSX.writeFile(classeur, 'contenants-' + new Date().toISOString().slice(0,10) + '.xlsx');

  toast(rows.length + " contenant(s) exporté(s).", 'ok');
}

// Applique les mêmes filtres que renderContenants(), pour partager la
// logique entre l'affichage à l'écran et l'export CSV.
function obtenirContenantsFiltresTries(){
  const search = (document.getElementById('filter-search').value || '').trim().toLowerCase();
  const fStatut = document.getElementById('filter-statut').value;
  const fType = document.getElementById('filter-type').value;
  const fEmp = document.getElementById('filter-emplacement').value;
  const fCategorie = document.getElementById('filter-categorie') ? document.getElementById('filter-categorie').value : '';

  let rows = Object.values(CONTENANTS).filter(c=>{
    if(search && !c.identifiant.toLowerCase().includes(search)) return false;
    if(fStatut && c.statut !== fStatut) return false;
    if(fType && c.typeLettre !== fType) return false;
    if(fEmp && c.emplacementId !== fEmp) return false;
    if(fCategorie){
      const t = TYPES[c.typeLettre];
      if(!t || t.categorieId !== fCategorie) return false;
    }
    return true;
  });

  const col = COLONNES_CONTENANTS.find(c=> c.key === sortContenantsState.colonne) || COLONNES_CONTENANTS[COLONNES_CONTENANTS.length-1];
  const dir = sortContenantsState.sens === 'asc' ? 1 : -1;
  rows.sort((a,b)=>{
    const va = col.get(a), vb = col.get(b);
    if(va < vb) return -1 * dir;
    if(va > vb) return 1 * dir;
    return 0;
  });

  return rows;
}

function renderContenants(){
  const el = document.getElementById('contenants-table');
  const rows = obtenirContenantsFiltresTries();

  const enteteHtml = COLONNES_CONTENANTS.map(col=>
    `<th class="sortable" onclick="trierContenants('${col.key}')">${col.label}${flecheTri(col.key)}</th>`
  ).join('') + '<th></th>';

  if(rows.length === 0){
    el.innerHTML = `<table><thead><tr>${enteteHtml}</tr></thead></table><div class="empty">Aucun contenant ne correspond à ces critères.</div>`;
    return;
  }

  let html = `<table><thead><tr>${enteteHtml}</tr></thead><tbody>`;
  rows.forEach(c=>{
    const emp = c.emplacementId && EMPLACEMENTS[c.emplacementId] ? EMPLACEMENTS[c.emplacementId].nom : '—';
    const t = TYPES[c.typeLettre];
    html += `<tr class="clickable" onclick="ouvrirHistorique('${c.identifiant}')">
      <td class="mono">${c.identifiant}</td>
      <td>${c.typeLettre}</td>
      <td>${badgeCategorie(t ? t.categorieId : null)}</td>
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

/* ===================================================================
   BADGE D'ALERTE (contenants cassés en attente)
   Affiché en permanence dans le bandeau, quel que soit l'onglet actif :
   c'est l'information la plus actionnable de l'app et elle ne doit pas
   être reléguée à l'onglet Statistiques.
   =================================================================== */
function renderAlertChip(){
  const chip = document.getElementById('alert-chip-casse');
  const countEl = document.getElementById('alert-chip-count');
  if(!chip || !countEl) return;
  const nbCasse = Object.values(CONTENANTS).filter(c=> c.statut === 'casse').length;
  if(nbCasse > 0){
    countEl.textContent = nbCasse + (nbCasse > 1 ? ' cassés à traiter' : ' cassé à traiter');
    chip.classList.add('visible');
  } else {
    chip.classList.remove('visible');
  }
}

/* ===================================================================
   STATISTIQUES
   =================================================================== */
function renderStats(){
  const kpisEl = document.getElementById('stats-kpis');
  const barsEl = document.getElementById('stats-bars');
  renderAlertChip();
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
    renderStatsParCategorie();
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
  renderStatsParCategorie();
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

// Ventilation des contenants par catégorie (Bois / Métallique / etc.),
// calculée à partir de la catégorie du type auquel chaque contenant
// appartient. Les contenants dont le type n'a pas de catégorie sont
// regroupés sous "Non catégorisé".
function renderStatsParCategorie(){
  const el = document.getElementById('stats-par-categorie');
  if(!el) return;

  const tous = Object.values(CONTENANTS);
  if(tous.length === 0){
    el.innerHTML = '<div class="empty">Aucun contenant enregistré pour l\'instant.</div>';
    return;
  }

  const catIds = Object.keys(CATEGORIES).sort((a,b)=> CATEGORIES[a].nom.localeCompare(CATEGORIES[b].nom));
  const groupes = catIds.map(id=> ({id, nom: CATEGORIES[id].nom}));
  groupes.push({id: null, nom: 'Non catégorisé'});

  let html = '<table><thead><tr><th>Catégorie</th><th>Total</th><th>En service</th><th>Cassé</th><th>Réformé</th><th>Taux de casse</th></tr></thead><tbody>';
  groupes.forEach(g=>{
    const items = tous.filter(c=>{
      const t = TYPES[c.typeLettre];
      const catId = t ? (t.categorieId || null) : null;
      return catId === g.id;
    });
    const total = items.length;
    if(total === 0 && g.id === null) return; // pas de ligne "Non catégorisé" si vide
    const nbServiceT = items.filter(c=> c.statut === 'en_service').length;
    const nbCasseT = items.filter(c=> c.statut === 'casse').length;
    const nbReformeT = items.filter(c=> c.statut === 'reforme').length;
    const tauxT = total ? Math.round((nbCasseT/total)*100) : 0;
    html += `<tr>
      <td>${g.id ? badgeCategorie(g.id) : '<span class="badge-cat badge-cat-empty">Non catégorisé</span>'}</td>
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

/* ===================================================================
   BOOK PDF DES TYPES DE CONTENANTS
   Génère un catalogue PDF (page de couverture + une page par type) à
   partir des données déjà chargées dans TYPES (photo, dimensions,
   description, catégorie). Aucun appel serveur supplémentaire : tout
   est déjà en mémoire grâce aux listeners Firestore.
   =================================================================== */
// Construit l'ordre des types pour le book PDF : regroupés par catégorie
// (triées alphabétiquement, "Non catégorisé" toujours en dernier), puis
// triés par lettre croissante à l'intérieur de chaque catégorie. Ainsi les
// types d'une même catégorie se suivent toujours dans le PDF au lieu
// d'être mélangés par un simple tri alphabétique global des lettres.
function obtenirOrdreTypesPourBook(){
  const catIds = Object.keys(CATEGORIES).sort((a,b)=> CATEGORIES[a].nom.localeCompare(CATEGORIES[b].nom));

  const groupes = catIds.map(id=> ({id, nom: CATEGORIES[id].nom}));
  groupes.push({id: null, nom: 'Non catégorisé'});

  let ordre = [];
  groupes.forEach(g=>{
    const lettresGroupe = Object.keys(TYPES)
      .filter(l=> (TYPES[l].categorieId || null) === g.id)
      .sort();
    ordre = ordre.concat(lettresGroupe);
  });
  return ordre;
}

async function genererBookPDF(){
  const lettres = obtenirOrdreTypesPourBook();
  if(lettres.length === 0){ toast("Aucun type à exporter.", 'err'); return; }

  toast("Génération du book PDF…", '');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  const steel = [44, 95, 138];
  const ink = [27, 39, 51];
  const inkSoft = [87, 105, 124];

  // ---- Page de couverture ----
  doc.setFillColor(...steel);
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
    const cat = t.categorieId ? CATEGORIES[t.categorieId] : null;
    doc.addPage();

    // Bandeau d'en-tête
    doc.setFillColor(...steel);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Type ' + t.lettre, 15, 17);
    if(cat){
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(cat.nom, pageW - 15, 17, { align: 'right' });
    }

    let y = 40;
    doc.setTextColor(...ink);

    // Dimensions
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Dimensions', 15, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Longueur : ' + (t.longueur || 0) + ' cm', 15, y); y += 6;
    doc.text('Largeur : ' + (t.largeur || 0) + ' cm', 15, y); y += 6;
    doc.text('Hauteur : ' + (t.hauteur || 0) + ' cm', 15, y); y += 10;

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
