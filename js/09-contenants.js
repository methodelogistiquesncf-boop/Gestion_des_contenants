/* ===================================================================
   CONTENANTS — NUMÉROTATION PAR CATÉGORIE
   Chaque catégorie a son propre PRÉFIXE et son propre compteur Firestore
   (document "compteurs/prefixe-XXXX"). Le préfixe d'une catégorie se
   renseigne dans l'onglet Catégories via le bouton "Modifier".
   =================================================================== */

/* --- Préfixes par défaut (repli si non renseigné dans la catégorie) --- */
const PREFIXES_DEFAUT = {
  'Caisse Bois':      '052030',
  'Praticable':       '052040',
  'Caisse Plastique': '052080'
};
const PREFIXE_DEFAUT = '05203';

const IDENTIFIANT_INITIAL = '052030000000000000';
const IDENTIFIANT_LONGUEUR = IDENTIFIANT_INITIAL.length; // 18 chiffres

/* -------------------------------------------------------------------
   INCRÉMENTATION D'UN IDENTIFIANT (chaîne de chiffres)
   ------------------------------------------------------------------- */
function incrementerIdentifiant(str){
  const chiffres = str.split('');
  let i = chiffres.length - 1;
  while(i >= 0){
    if(chiffres[i] === '9'){ chiffres[i] = '0'; i--; }
    else { chiffres[i] = String(Number(chiffres[i]) + 1); return chiffres.join(''); }
  }
  return '1' + chiffres.join('');
}

// Premier numéro d'une série : préfixe complété de zéros jusqu'à 18
// chiffres, puis incrémenté de 1 pour que la série démarre à …001
function identifiantInitialPourPrefixe(prefixe){
  return incrementerIdentifiant(prefixe.padEnd(IDENTIFIANT_LONGUEUR, '0'));
}

/* -------------------------------------------------------------------
   RÉSOLUTION DU PRÉFIXE D'UNE CATÉGORIE
   1) Préfixe renseigné dans l'onglet Catégories (recommandé)
   2) Repli par nom de catégorie (tableau PREFIXES_DEFAUT)
   3) Repli sur PREFIXE_DEFAUT (05203)
   ------------------------------------------------------------------- */
function normaliserNom(nom){
  return (nom || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function prefixePourCategorieId(catId){
  const cat = catId && CATEGORIES[catId] ? CATEGORIES[catId] : null;
  if(cat){
    const p = String(cat.prefixe || '').trim();
    if(p && /^[0-9]+$/.test(p)) return p;
    const cle = normaliserNom(cat.nom);
    for(const nom in PREFIXES_DEFAUT){
      if(normaliserNom(nom) === cle) return PREFIXES_DEFAUT[nom];
    }
  }
  return PREFIXE_DEFAUT;
}

function prefixeDuTypeSelectionne(){
  const lettre = document.getElementById('new-type').value;
  const t = TYPES[lettre];
  return prefixePourCategorieId(t ? (t.categorieId || null) : null);
}

function refCompteurPourPrefixe(prefixe){
  return db.collection('compteurs').doc('prefixe-' + prefixe);
}

/* -------------------------------------------------------------------
   DERNIER NUMÉRO CONNU D'UNE SÉRIE
   Utilisé quand le compteur de la série n'existe pas encore : on repart
   du plus grand identifiant déjà présent dans la série, ou de l'ancien
   compteur "compteurs/contenants" pour le préfixe 05203.
   ------------------------------------------------------------------- */
function dernierConnusPourPrefixe(prefixe){
  const legacyRef = db.collection('compteurs').doc('contenants');
  const queryRef = db.collection('contenants')
    .orderBy(firebase.firestore.FieldPath.documentId())
    .startAt(prefixe).endAt(prefixe + '\uf8ff').limit(500);
  return Promise.all([legacyRef.get(), queryRef.get()]).then(([legacyDoc, snap])=>{
    const candidats = [];
    if(legacyDoc.exists){
      const d = legacyDoc.data().dernier;
      if(d && typeof d === 'string' && d.startsWith(prefixe) && estIdentifiantAuto(d)) candidats.push(d);
    }
    snap.forEach(doc=>{ if(estIdentifiantAuto(doc.id)) candidats.push(doc.id); });
    if(candidats.length === 0) return null;
    candidats.sort();
    return candidats[candidats.length - 1];
  });
}

function prochainIdentifiantPourPrefixe(prefixe){
  const compteurRef = refCompteurPourPrefixe(prefixe);
  return compteurRef.get().then(doc=>{
    const dernier = doc.exists ? (doc.data().dernier || null) : null;
    if(dernier && estIdentifiantAuto(dernier)) return incrementerIdentifiant(dernier);
    return dernierConnusPourPrefixe(prefixe).then(secours=>
      secours ? incrementerIdentifiant(secours) : identifiantInitialPourPrefixe(prefixe));
  });
}

/* -------------------------------------------------------------------
   GÉNÉRATION D'UN IDENTIFIANT (prévisualisation, rien n'est écrit)
   ------------------------------------------------------------------- */
function genererIdentifiant(){
  const idInput = document.getElementById('new-id');
  const prefixe = prefixeDuTypeSelectionne();
  prochainIdentifiantPourPrefixe(prefixe).then(suivant=>{
    idInput.value = suivant;
    imprimerCodeBarre(suivant);
    idInput.focus();
  }).catch(err=> toast("Erreur de génération : " + err.message, 'err'));
}

/* ===================================================================
   IMPRESSION EN MASSE
   =================================================================== */
const LOT_QUANTITE_MAX = 100;

function reserverLotIdentifiants(quantite, prefixe){
  const compteurRef = refCompteurPourPrefixe(prefixe);
  const secoursPromise = compteurRef.get().then(doc=>
    (doc.exists && doc.data().dernier) ? null : dernierConnusPourPrefixe(prefixe));
  return secoursPromise.then(secours=> db.runTransaction(tx=>{
    return tx.get(compteurRef).then(compteurDoc=>{
      let dernier = compteurDoc.exists ? (compteurDoc.data().dernier || null) : secours;
      if(dernier && !estIdentifiantAuto(dernier)) dernier = null;
      const identifiants = [];
      for(let i=0;i<quantite;i++){
        dernier = dernier ? incrementerIdentifiant(dernier) : identifiantInitialPourPrefixe(prefixe);
        identifiants.push(dernier);
      }
      tx.set(compteurRef, {dernier});
      return identifiants;
    });
  }));
}

// Sélecteur de catégorie pour le lot : créé si absent de index.html
function garantirSelectLotCategorie(){
  if(document.getElementById('lot-categorie')) return;
  const titreInput = document.getElementById('lot-titre');
  if(!titreInput) return;
  const titreWrap = titreInput.parentElement;
  const row = titreWrap ? titreWrap.parentElement : null;
  if(!row) return;
  const div = document.createElement('div');
  div.style.cssText = 'flex:1; min-width:160px;';
  div.innerHTML = `
    <label class="small" for="lot-categorie">Catégorie (préfixe)</label>
    <select id="lot-categorie"></select>`;
  row.insertBefore(div, titreWrap);
}

function remplirSelectLotCategorie(){
  const sel = document.getElementById('lot-categorie');
  if(!sel) return;
  const actuel = sel.value;
  const cats = Object.keys(CATEGORIES).sort((a,b)=> CATEGORIES[a].nom.localeCompare(CATEGORIES[b].nom));
  sel.innerHTML = cats.length
    ? cats.map(id=> `<option value="${id}">${CATEGORIES[id].nom}</option>`).join('')
    : '<option value="">Aucune catégorie</option>';
  if(actuel && CATEGORIES[actuel]) sel.value = actuel;
}

function lancerImpressionLot(){
  garantirSelectLotCategorie();
  remplirSelectLotCategorie();
  const qteInput = document.getElementById('lot-quantite');
  const titreInput = document.getElementById('lot-titre');
  const btn = document.getElementById('btn-lot-imprimer');
  const quantite = parseInt(qteInput.value, 10);
  const titre = titreInput ? titreInput.value.trim() : '';
  const catSel = document.getElementById('lot-categorie');
  const prefixe = prefixePourCategorieId(catSel ? catSel.value : null);

  if(!quantite || quantite < 1){ toast("Indique une quantité valide.", 'err'); return; }
  if(quantite > LOT_QUANTITE_MAX){
    toast("Maximum " + LOT_QUANTITE_MAX + " étiquettes par lot.", 'err'); return;
  }

  setBtnLoading(btn, 'Réservation…');
  reserverLotIdentifiants(quantite, prefixe).then(identifiants=>{
    imprimerLotCodeBarres(identifiants, true, titre);
    const premier = identifiants[0], dernierNum = identifiants[identifiants.length-1];
    toast(quantite + " numéro(s) réservé(s) : " + premier + (quantite > 1 ? " → " + dernierNum : ''), 'ok');
  }).catch(err=> toast("Erreur de réservation : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

/* -------------------------------------------------------------------
   VÉRIFICATION DU FORMAT AUTO (18 chiffres)
   ------------------------------------------------------------------- */
function estIdentifiantAuto(id){
  return typeof id === 'string' && id.length === IDENTIFIANT_LONGUEUR && /^[0-9]+$/.test(id);
}

/* ===================================================================
   COMPTEUR MANUEL (onglet Utilisateurs — administrateur)
   =================================================================== */
function rafraichirAffichageCompteur(){
  const sel = document.getElementById('compteur-prefixe');
  const aff = document.getElementById('compteur-valeur-actuelle');
  if(!sel || !aff) return;
  const prefixe = sel.value;
  refCompteurPourPrefixe(prefixe).get().then(doc=>{
    aff.textContent = (doc.exists && doc.data().dernier)
      ? doc.data().dernier
      : '(aucune valeur — la série démarrera à ' + identifiantInitialPourPrefixe(prefixe) + ')';
  }).catch(()=>{ aff.textContent = '—'; });
}

function garantirSelectPrefixeCompteur(){
  if(document.getElementById('compteur-prefixe')) return;
  const inputValeur = document.getElementById('compteur-nouvelle-valeur');
  if(!inputValeur) return;
  const inputWrap = inputValeur.parentElement;
  const row = inputWrap ? inputWrap.parentElement : null;
  if(!row) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <label class="small" for="compteur-prefixe">Préfixe de la série</label>
    <select id="compteur-prefixe" onchange="rafraichirAffichageCompteur()">
      <option value="05203">05203 (Caisse Bois)</option>
      <option value="052040">052040 (Praticable)</option>
      <option value="052080">052080 (Caisse Plastique)</option>
    </select>`;
  row.insertBefore(div, inputWrap);
  rafraichirAffichageCompteur();
}

function enregistrerCompteurManuel(btn){
  garantirSelectPrefixeCompteur();
  const input = document.getElementById('compteur-nouvelle-valeur');
  const sel = document.getElementById('compteur-prefixe');
  const prefixe = sel ? sel.value : PREFIXE_DEFAUT;
  const valeur = input.value.trim();

  if(!estIdentifiantAuto(valeur)){
    toast("La valeur doit comporter exactement 18 chiffres.", 'err'); return;
  }
  if(!valeur.startsWith(prefixe)){
    toast("La valeur doit commencer par le préfixe " + prefixe + ".", 'err'); return;
  }
  if(!confirm(
    "Forcer le compteur de la série " + prefixe + " à " + valeur + " ?\n\n" +
    "Si cette valeur est inférieure ou égale à un identifiant déjà attribué, un doublon devient possible."
  )) return;

  setBtnLoading(btn, 'Enregistrement…');
  refCompteurPourPrefixe(prefixe).set({dernier: valeur}).then(()=>{
    toast("Compteur " + prefixe + " mis à jour : " + valeur, 'ok');
    input.value = '';
    rafraichirAffichageCompteur();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

/* ===================================================================
   SUPPRESSION D'UN CONTENANT (administrateur)
   =================================================================== */
function supprimerContenant(identifiant){
  if(!confirm(
    "Supprimer définitivement le contenant " + identifiant + " ?\n\n" +
    "Son historique complet sera perdu. Cette action est irréversible."
  )) return;
  db.collection('contenants').doc(identifiant).delete()
    .then(()=> toast("Contenant " + identifiant + " supprimé.", 'ok'))
    .catch(err=> toast("Erreur : " + err.message, 'err'));
}

/* ===================================================================
   CRÉATION D'UN CONTENANT
   Transaction anti-doublon + mise à jour du compteur de la série
   correspondant à la catégorie du type choisi.
   =================================================================== */
function creerContenant(btn){
  const idInput = document.getElementById('new-id');
  const identifiant = idInput.value.trim();
  const typeLettre = document.getElementById('new-type').value;

  if(!identifiant){ toast("Scanne, saisis ou génère un identifiant.", 'err'); return; }
  if(!typeLettre){ toast("Sélectionne un type de contenant.", 'err'); return; }

  const now = firebase.firestore.Timestamp.now();
  const ref = db.collection('contenants').doc(identifiant);
  const t = TYPES[typeLettre];
  const prefixe = prefixePourCategorieId(t ? (t.categorieId || null) : null);
  const compteurRef = refCompteurPourPrefixe(prefixe);

  setBtnLoading(btn, 'Enregistrement…');

  db.runTransaction(tx=>{
    return Promise.all([tx.get(ref), tx.get(compteurRef)]).then(([contDoc, compteurDoc])=>{
      if(contDoc.exists) throw new Error('DUPLICATE');
      tx.set(ref, {
        identifiant, typeLettre, statut: 'en_service',
        emplacementId: null,
        dateCreation: now, dateCasse: null, dateReparation: null, datePerte: null,
        photoCasse: null, photoPerte: null,
        historique: [{
          date: now, action: 'creation', statut: 'en_service',
          emplacementId: null, commentaire: 'Enregistrement du contenant',
          utilisateur: obtenirNomUtilisateurPourHistorique()
        }]
      });
      if(estIdentifiantAuto(identifiant) && identifiant.startsWith(prefixe)){
        const dernier = compteurDoc.exists ? (compteurDoc.data().dernier || null) : null;
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

/* --- Support douchette code-barres (validation sur "Entrée") --- */
document.getElementById('new-id').addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); creerContenant(document.getElementById('btn-creer-contenant')); }
});
document.getElementById('lookup-id').addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); lookupContenant(); }
});

/* ===================================================================
   ICÔNES DE STATUT
   =================================================================== */
const ICON_STATUT_OK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
const ICON_STATUT_ATTENTION = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>';
const ICON_STATUT_NEUTRE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"></rect><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>';

function libelleStatut(statut){
  switch(statut){
    case 'en_service': return '<span class="badge badge-ok">' + ICON_STATUT_OK + 'En service</span>';
    case 'casse': return '<span class="badge badge-attention">' + ICON_STATUT_ATTENTION + 'Cassé</span>';
    case 'perdu': return '<span class="badge" style="background:#fde68a; color:#b45309;">' + ICON_STATUT_ATTENTION + 'Perdu</span>';
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
   HOOK SUR renderCategories POUR METTRE À JOUR LE SÉLECTEUR DE LOT
   =================================================================== */
if(typeof renderCategories === 'function'){
  const _renderCategoriesInitial = renderCategories;
  renderCategories = function(){
    const resultat = _renderCategoriesInitial.apply(this, arguments);
    remplirSelectLotCategorie();
    return resultat;
  };
}

/* ===================================================================
   INITIALISATION AU CHARGEMENT
   Crée le sélecteur de catégorie de l'impression en masse (s'il
   manque dans index.html) et le remplit avec les catégories connues.
   =================================================================== */
garantirSelectLotCategorie();
remplirSelectLotCategorie();
