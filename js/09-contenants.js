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
  const titreInput = document.getElementById('lot-titre');
  const btn = document.getElementById('btn-lot-imprimer');
  const quantite = parseInt(qteInput.value, 10);
  const titre = titreInput ? titreInput.value.trim() : '';

  if(!quantite || quantite < 1){ toast("Indique une quantité valide.", 'err'); return; }
  if(quantite > LOT_QUANTITE_MAX){
    toast("Maximum " + LOT_QUANTITE_MAX + " étiquettes par lot.", 'err');
    return;
  }

  setBtnLoading(btn, 'Réservation…');
  reserverLotIdentifiants(quantite).then(identifiants=>{
    imprimerLotCodeBarres(identifiants, true, titre);
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

/* --- Forçage manuel du compteur (administrateur) ---
   Écrase directement le doc compteurs/contenants. Utilisé pour corriger
   une numérotation incohérente (ex. après une reprise de données ou une
   erreur de manipulation). Aucune protection particulière ici au-delà
   du format 18 chiffres et de la confirmation : c'est un geste
   volontairement "dangereux", réservé à l'onglet Utilisateurs
   (déjà visible aux seuls administrateurs). */
function enregistrerCompteurManuel(btn){
  const input = document.getElementById('compteur-nouvelle-valeur');
  const valeur = input.value.trim();

  if(!estIdentifiantAuto(valeur)){
    toast("La valeur doit comporter exactement 18 chiffres.", 'err');
    return;
  }
  if(!confirm(
    "Forcer le compteur à " + valeur + " ?\n\n" +
    "Les prochains identifiants générés automatiquement repartiront de cette valeur. " +
    "Si elle est inférieure ou égale à un identifiant déjà attribué, un doublon devient possible."
  )) return;

  setBtnLoading(btn, 'Enregistrement…');
  db.collection('compteurs').doc('contenants').set({dernier: valeur}).then(()=>{
    toast("Compteur mis à jour : " + valeur, 'ok');
    input.value = '';
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

/* --- Suppression définitive d'un contenant (administrateur) ---
   Supprime le document Firestore, y compris son historique. Le
   compteur de numérotation n'est volontairement pas touché : même si
   l'identifiant supprimé avait été généré automatiquement, il ne sera
   jamais réattribué (évite toute confusion avec un contenant physique
   qui porterait encore l'ancienne étiquette). */
function supprimerContenant(identifiant){
  if(!confirm(
    "Supprimer définitivement le contenant " + identifiant + " ?\n\n" +
    "Son historique complet sera perdu. Cette action est irréversible."
  )) return;

  db.collection('contenants').doc(identifiant).delete()
    .then(()=> toast("Contenant " + identifiant + " supprimé.", 'ok'))
    .catch(err=> toast("Erreur : " + err.message, 'err'));
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
        historique: [{date: now, action: 'creation', statut: 'en_service', emplacementId: null, commentaire: 'Enregistrement du contenant', utilisateur: obtenirNomUtilisateurPourHistorique()}]
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
