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
    renderCasseListe();
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
