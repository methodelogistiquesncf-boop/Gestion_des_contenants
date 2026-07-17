/* ===================================================================
   UTILISATEURS & RÔLES
   Onglet visible uniquement pour les comptes ayant le rôle
   "Administrateur". Un utilisateur n'apparaît dans la liste qu'après
   sa toute première connexion (sa fiche est créée automatiquement à
   ce moment-là par assurerFicheUtilisateur, appelée depuis
   02-auth.js) : impossible de lister les comptes Firebase Auth qui ne
   se sont jamais connectés depuis le client.

   Collection Firestore utilisée : "utilisateurs", un document par uid
   { email, prenom, nom, role, dateCreation, derniereConnexion }.
   =================================================================== */

const ROLES_DISPONIBLES = ['Administrateur', 'Utilisateur'];

let UTILISATEURS = {};
let unsubUtilisateurs = null;
let unsubMonRole = null;
let unsubCompteur = null;
let roleUtilisateurActuel = null;

// Nom affichable ("Prénom Nom", ou e-mail à défaut) de l'utilisateur
// actuellement connecté. Tenu à jour par afficherNomUtilisateurConnecte
// (appelée par le listener temps réel sur le rôle) et utilisé pour
// horodater/nommer l'auteur de chaque action dans l'historique des
// contenants (voir obtenirNomUtilisateurPourHistorique ci-dessous).
let nomUtilisateurActuelPourHistorique = '';

/* --- Fiche utilisateur créée/mise à jour à chaque connexion ---
   On ne touche jamais au champ "role" ici : c'est un administrateur
   qui l'attribue depuis cet onglet, pas l'utilisateur lui-même. */
function assurerFicheUtilisateur(user){
  const ref = db.collection('utilisateurs').doc(user.uid);
  return ref.get().then(doc=>{
    if(doc.exists){
      return ref.update({ email: user.email, derniereConnexion: firebase.firestore.Timestamp.now() });
    }
    return ref.set({
      email: user.email, prenom: '', nom: '', role: '',
      dateCreation: firebase.firestore.Timestamp.now(),
      derniereConnexion: firebase.firestore.Timestamp.now()
    });
  });
}

/* --- Rôle de l'utilisateur connecté (écoute temps réel) ---
   Détermine si l'onglet Utilisateurs doit être visible. Se désabonne
   à la déconnexion, comme les autres listeners de l'app. */
function attacherListenerMonRole(uid){
  unsubMonRole = db.collection('utilisateurs').doc(uid).onSnapshot(doc=>{
    const data = doc.exists ? doc.data() : {};
    roleUtilisateurActuel = data.role || '';
    appliquerVisibiliteOngletUtilisateurs();
    afficherNomUtilisateurConnecte(data);
  }, err=> console.error('Erreur listener rôle :', err));
}

// Affiche "Prénom Nom" dans le bandeau au lieu de l'e-mail, dès que ces
// champs sont renseignés (voir la fiche utilisateur, éditable depuis
// l'onglet Utilisateurs). Se met à jour en temps réel puisqu'il s'agit
// du même listener que celui du rôle. Retombe sur l'e-mail tant que le
// prénom et le nom ne sont pas encore renseignés. Alimente aussi
// nomUtilisateurActuelPourHistorique, réutilisé pour tracer l'auteur de
// chaque action dans l'historique des contenants.
function afficherNomUtilisateurConnecte(data){
  const complet = [data.prenom, data.nom].filter(Boolean).join(' ').trim();
  nomUtilisateurActuelPourHistorique = complet || (auth.currentUser ? auth.currentUser.email : '');
  const el = document.getElementById('user-email');
  if(!el) return;
  el.textContent = nomUtilisateurActuelPourHistorique;
}

// Nom à enregistrer comme auteur d'une action d'historique (création,
// casse, réparation, réforme...). Retombe sur l'e-mail du compte
// connecté si la fiche prénom/nom n'a pas encore été chargée (ex. tout
// début de session, avant le premier tick du listener de rôle), puis
// sur "Inconnu" en tout dernier recours.
function obtenirNomUtilisateurPourHistorique(){
  return nomUtilisateurActuelPourHistorique
    || (auth.currentUser ? auth.currentUser.email : '')
    || 'Inconnu';
}

function appliquerVisibiliteOngletUtilisateurs(){
  const tabBtn = document.querySelector('.tab-btn[data-view="v-utilisateurs"]');
  if(!tabBtn) return;
  const estAdmin = roleUtilisateurActuel === 'Administrateur';
  tabBtn.style.display = estAdmin ? '' : 'none';

  if(estAdmin){
    attacherListenerUtilisateurs();
    attacherListenerCompteur();
  } else {
    detacherListenerUtilisateurs();
    detacherListenerCompteur();
    // Si l'utilisateur vient de perdre son rôle admin alors qu'il est
    // sur cet onglet, on le renvoie vers Contenants pour éviter un état
    // incohérent (onglet actif mais masqué).
    const vue = document.getElementById('v-utilisateurs');
    if(vue && vue.classList.contains('active')){
      const contBtn = document.querySelector('.tab-btn[data-view="v-contenants"]');
      if(contBtn) contBtn.click();
    }
  }

  // Le bouton "Supprimer" du tableau des contenants n'est visible que
  // pour les administrateurs : on redessine pour qu'il apparaisse ou
  // disparaisse immédiatement, sans attendre une autre action.
  if(typeof renderContenants === 'function') renderContenants();
}

/* --- Compteur de numérotation automatique (compteurs/contenants) ---
   Écoute en temps réel, admin uniquement : permet de voir/forcer le
   dernier identifiant attribué depuis l'onglet Utilisateurs. La lecture
   et l'écriture réelles se font aussi ailleurs (voir 09-contenants.js)
   pour la génération/réservation normale des identifiants. */
function attacherListenerCompteur(){
  if(unsubCompteur) return; // déjà attaché
  unsubCompteur = db.collection('compteurs').doc('contenants').onSnapshot(doc=>{
    const el = document.getElementById('compteur-valeur-actuelle');
    if(!el) return;
    el.textContent = (doc.exists && doc.data().dernier)
      ? doc.data().dernier
      : "(aucun identifiant généré automatiquement pour l'instant)";
  }, err=> toast("Erreur de lecture du compteur : " + err.message, 'err'));
}

function detacherListenerCompteur(){
  if(unsubCompteur){ unsubCompteur(); unsubCompteur = null; }
}

/* --- Liste complète des utilisateurs (admins uniquement) ---
   Les règles de sécurité Firestore doivent restreindre la lecture de
   toute la collection aux seuls comptes Administrateur : cette
   fonction n'est appelée que si roleUtilisateurActuel === 'Administrateur',
   mais la vraie protection doit venir des règles côté serveur. */
function attacherListenerUtilisateurs(){
  if(unsubUtilisateurs) return; // déjà attaché
  unsubUtilisateurs = db.collection('utilisateurs').onSnapshot(snap=>{
    UTILISATEURS = {};
    snap.forEach(doc=> UTILISATEURS[doc.id] = {uid: doc.id, ...doc.data()});
    renderUtilisateurs();
  }, err=> toast("Erreur de chargement des utilisateurs : " + err.message, 'err'));
}

function detacherListenerUtilisateurs(){
  if(unsubUtilisateurs){ unsubUtilisateurs(); unsubUtilisateurs = null; }
  UTILISATEURS = {};
}

/* ===================================================================
   RENDU DU TABLEAU
   =================================================================== */
function renderUtilisateurs(){
  const el = document.getElementById('utilisateurs-table');
  if(!el) return;

  const uids = Object.keys(UTILISATEURS).sort((a,b)=>{
    const ua = UTILISATEURS[a], ub = UTILISATEURS[b];
    const na = ((ua.nom||'') + (ua.prenom||'')) || ua.email || '';
    const nb = ((ub.nom||'') + (ub.prenom||'')) || ub.email || '';
    return na.localeCompare(nb, 'fr');
  });

  if(uids.length === 0){
    el.innerHTML = '<div class="empty">Aucun utilisateur ne s\'est encore connecté.</div>';
    return;
  }

  const rolesOptions = ROLES_DISPONIBLES.map(r=> `<option value="${r}">${r}</option>`).join('');
  const monUid = auth.currentUser ? auth.currentUser.uid : null;

  let html = '<table><thead><tr><th>Prénom</th><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Dernière connexion</th><th></th></tr></thead><tbody>';
  uids.forEach(uid=>{
    const u = UTILISATEURS[uid];
    const soi = uid === monUid;
    html += `<tr>
      <td><input type="text" class="mono" style="width:100%;" value="${escapeAttr(u.prenom)}" placeholder="Prénom" onblur="enregistrerChampUtilisateur('${uid}','prenom',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td>
      <td><input type="text" class="mono" style="width:100%;" value="${escapeAttr(u.nom)}" placeholder="Nom" onblur="enregistrerChampUtilisateur('${uid}','nom',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td>
      <td>${u.email || ''}${soi ? ' <span class="badge-cat">vous</span>' : ''}</td>
      <td>
        <select data-uid="${uid}" onchange="modifierRoleUtilisateur('${uid}', this.value)">
          <option value="">— Aucun rôle —</option>
          ${rolesOptions}
        </select>
      </td>
      <td>${u.derniereConnexion ? formatDate(u.derniereConnexion) : '—'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-danger btn-sm" ${soi ? 'disabled title="Impossible de supprimer sa propre fiche"' : ''} onclick="supprimerFicheUtilisateur('${uid}')">Supprimer</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;

  // Présélectionne le rôle actuel de chaque ligne (fait après coup pour
  // ne pas avoir à gérer l'attribut "selected" dans le HTML ci-dessus).
  uids.forEach(uid=>{
    const sel = el.querySelector(`select[data-uid="${uid}"]`);
    if(sel) sel.value = UTILISATEURS[uid].role || '';
  });
}

function escapeAttr(str){
  return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

/* ===================================================================
   ACTIONS
   =================================================================== */
function enregistrerChampUtilisateur(uid, champ, valeur){
  const u = UTILISATEURS[uid];
  const val = valeur.trim();
  if(!u || (u[champ] || '') === val) return;
  db.collection('utilisateurs').doc(uid).update({ [champ]: val }).then(()=>{
    u[champ] = val;
  }).catch(err=>{
    toast("Erreur : " + err.message, 'err');
    renderUtilisateurs();
  });
}

function modifierRoleUtilisateur(uid, nouveauRole){
  db.collection('utilisateurs').doc(uid).update({ role: nouveauRole }).then(()=>{
    toast("Rôle mis à jour.", 'ok');
    if(UTILISATEURS[uid]) UTILISATEURS[uid].role = nouveauRole;
    // Si on vient de se retirer soi-même le rôle Administrateur, on
    // n'attend pas le round-trip du listener temps réel pour masquer
    // l'onglet : on applique tout de suite le changement localement.
    if(uid === auth.currentUser.uid && nouveauRole !== 'Administrateur'){
      roleUtilisateurActuel = nouveauRole;
      appliquerVisibiliteOngletUtilisateurs();
    }
  }).catch(err=>{
    toast("Erreur : " + err.message, 'err');
    renderUtilisateurs();
  });
}

function supprimerFicheUtilisateur(uid){
  if(uid === auth.currentUser.uid){
    toast("Impossible de supprimer sa propre fiche.", 'err');
    return;
  }
  const u = UTILISATEURS[uid];
  if(!confirm("Supprimer la fiche de " + (u ? u.email : uid) + " ?\n\nSon rôle sera retiré. Le compte de connexion (Firebase Auth) n'est PAS supprimé : si cette personne se reconnecte, sa fiche sera recréée sans rôle.")) return;

  db.collection('utilisateurs').doc(uid).delete()
    .then(()=> toast("Fiche utilisateur supprimée.", 'ok'))
    .catch(err=> toast("Erreur : " + err.message, 'err'));
}

/* --- Ajout d'un utilisateur (création du compte de connexion) ---
   Piège classique du SDK web Firebase Auth : createUserWithEmailAndPassword
   connecte automatiquement la session sur le compte qu'on vient de créer —
   ce qui déconnecterait l'administrateur en train de créer le compte !
   On contourne le problème avec une DEUXIÈME instance d'app Firebase,
   isolée de l'app principale ("auth") : le compte y est créé, l'e-mail
   de définition du mot de passe est envoyé, puis l'instance temporaire
   est détruite. La session de l'administrateur n'est jamais touchée. */
function creerCompteUtilisateur(btn){
  const emailInput = document.getElementById('user-add-email');
  const email = emailInput.value.trim();
  if(!email){ toast("Indique une adresse e-mail.", 'err'); return; }

  setBtnLoading(btn, 'Création…');

  const nomInstance = 'creationUtilisateur-' + Date.now();
  const appSecondaire = firebase.initializeApp(firebaseConfig, nomInstance);
  const authSecondaire = appSecondaire.auth();
  // Mot de passe temporaire aléatoire : jamais affiché ni communiqué,
  // la personne le redéfinit elle-même via l'e-mail reçu.
  const motDePasseTemporaire = Math.random().toString(36).slice(-10) + 'Aa1!';

  authSecondaire.createUserWithEmailAndPassword(email, motDePasseTemporaire).then(cred=>{
    return db.collection('utilisateurs').doc(cred.user.uid).set({
      email, prenom: '', nom: '', role: '',
      dateCreation: firebase.firestore.Timestamp.now(),
      derniereConnexion: null
    }).then(()=> authSecondaire.sendPasswordResetEmail(email));
  }).then(()=>{
    toast("Compte créé, e-mail de définition du mot de passe envoyé à " + email + ".", 'ok');
    emailInput.value = '';
  }).catch(err=>{
    toast("Erreur : " + traduireErreurAuth(err), 'err');
  }).finally(()=>{
    clearBtnLoading(btn);
    authSecondaire.signOut().finally(()=> appSecondaire.delete());
  });
}
