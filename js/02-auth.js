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
    case 'auth/email-already-in-use': return "Un compte existe déjà avec cette adresse e-mail.";
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
    // Crée/actualise la fiche Firestore de l'utilisateur (voir
    // 16-utilisateurs.js), puis se met à l'écoute de son rôle pour
    // afficher ou masquer l'onglet Utilisateurs.
    assurerFicheUtilisateur(user).finally(()=> attacherListenerMonRole(user.uid));
    enregistrerActivite();
    demarrerSurveillanceInactivite();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    if(unsubTypes) unsubTypes();
    if(unsubEmp) unsubEmp();
    if(unsubCont) unsubCont();
    if(unsubCat) unsubCat();
    if(unsubMonRole) unsubMonRole();
    detacherListenerUtilisateurs();
    roleUtilisateurActuel = null;
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
