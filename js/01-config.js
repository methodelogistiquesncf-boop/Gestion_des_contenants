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
