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
    // Le tableau des contenants affiche la catégorie de chaque ligne via
    // TYPES[c.typeLettre].categorieId : si ce listener se déclenche après
    // celui des contenants (ordre d'arrivée non garanti), un premier
    // rendu de renderContenants() a déjà pu avoir lieu sans les types
    // chargés, laissant "Non catégorisé" affiché à tort jusqu'à ce que
    // l'utilisateur touche un filtre. On redessine donc ici aussi.
    renderContenants();
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
    renderCasseListe();
  }, err=> toast("Erreur de chargement des contenants : " + err.message, 'err'));

  unsubCat = db.collection('categoriesContenants').onSnapshot(snap=>{
    CATEGORIES = {};
    snap.forEach(doc=> CATEGORIES[doc.id] = {id: doc.id, ...doc.data()});
    renderCategories();
    renderSelectCategories();
    renderTypes();
    renderStatsParCategorie();
    // Même raison que dans le listener des types ci-dessus : la colonne
    // Catégorie du tableau des contenants dépend de CATEGORIES, qui peut
    // arriver après le premier rendu de la liste des contenants.
    renderContenants();
  }, err=> toast("Erreur de chargement des catégories : " + err.message, 'err'));
}
