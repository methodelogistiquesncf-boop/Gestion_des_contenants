/* ===================================================================
   EXPORT / IMPORT - SAUVEGARDE ET RESTAURATION COMPLÈTE
   Version B : Sauvegarde TOUTES les collections Firestore
   =================================================================== */

/* -------------------------------------------------------------------
   CONFIGURATION : Liste des collections à sauvegarder
   ⚠️ IMPORTANT : Modifie cette liste si tu ajoutes des collections
   ------------------------------------------------------------------- */
const COLLECTIONS_A_SAUVAGARDER = [
    'contenants',           // Contenant + historique
    'typesContenants',      // Catalogue des types
    'emplacements',         // Emplacements de réparation
    'categoriesContenants', // Catégories avec préfixes
    'utilisateurs',         // Comptes utilisateurs
    'configGlobale',        // Configuration (compteur, etc.)
    // Ajoute ici d'autres collections si nécessaire
    // 'autreCollection',
];

/* -------------------------------------------------------------------
   EXPORT EXCEL (MULTI-FEUILLES) - Rapports lisibles
   ------------------------------------------------------------------- */
function exporterExcelComplet() {
    try {
        // Feuille 1 : Contenants (avec colonne N° GMAO)
        const contenantsData = Object.entries(CONTENANTS).map(([id, c]) => {
            const type = TYPES[c.typeLettre];
            const categorie = type && CATEGORIES[type.categorieId];
            const emplacement = EMPLACEMENTS[c.emplacementId];
            
            return {
                'Identifiant': id,
                'N° GMAO': c.gmao || '',
                'Type': c.typeLettre || '',
                'Catégorie': categorie ? categorie.nom : 'Non catégorisé',
                'Dimensions (L×l×h cm)': type ? `${type.longueur}×${type.largeur}×${type.hauteur}` : '',
                'Description type': type ? (type.description || '') : '',
                'Emplacement': emplacement ? emplacement.nom : '',
                'Statut': c.statut || 'Disponible',
                'Date création': c.dateCreation ? formatTimestampPourExport(c.dateCreation) : '',
                'Nombre mouvements': c.historique ? c.historique.length : 0
            };
        });

        // Feuille 2 : Types
        const typesData = Object.entries(TYPES).map(([lettre, t]) => {
            const categorie = CATEGORIES[t.categorieId];
            return {
                'Lettre': lettre,
                'Longueur (cm)': t.longueur || 0,
                'Largeur (cm)': t.largeur || 0,
                'Hauteur (cm)': t.hauteur || 0,
                'Description': t.description || '',
                'Catégorie': categorie ? categorie.nom : 'Non catégorisé',
                'A photo': t.photo ? 'Oui' : 'Non'
            };
        });

        // Feuille 3 : Emplacements
        const emplacementsData = Object.entries(EMPLACEMENTS).map(([id, e]) => ({
            'ID': id,
            'Nom': e.nom || '',
            'Description': e.description || ''
        }));

        // Feuille 4 : Catégories
        const categoriesData = Object.entries(CATEGORIES).map(([id, c]) => ({
            'ID': id,
            'Nom': c.nom || '',
            'Couleur': c.couleur || '',
            'Préfixe': c.prefixe || ''
        }));

        // Feuille 5 : Utilisateurs
        const utilisateursData = Object.entries(UTILISATEURS).map(([uid, u]) => ({
            'UID': uid,
            'Email': u.email || '',
            'Prénom': u.prenom || '',
            'Nom': u.nom || '',
            'Rôle': u.role || 'Utilisateur',
            'Date création': u.dateCreation ? formatTimestampPourExport(u.dateCreation) : '',
            'Dernière connexion': u.derniereConnexion ? formatTimestampPourExport(u.derniereConnexion) : ''
        }));

        // Création du workbook
        const wb = XLSX.utils.book_new();
        
        const wsContenants = XLSX.utils.json_to_sheet(contenantsData);
        const wsTypes = XLSX.utils.json_to_sheet(typesData);
        const wsEmplacements = XLSX.utils.json_to_sheet(emplacementsData);
        const wsCategories = XLSX.utils.json_to_sheet(categoriesData);
        const wsUtilisateurs = XLSX.utils.json_to_sheet(utilisateursData);

        // Ajustement largeurs colonnes
        wsContenants['!cols'] = [
            {wch: 20}, // Identifiant
            {wch: 16}, // N° GMAO
            {wch: 8},  // Type
            {wch: 18}, // Catégorie
            {wch: 18}, // Dimensions
            {wch: 30}, // Description type
            {wch: 18}, // Emplacement
            {wch: 15}, // Statut
            {wch: 20}, // Date création
            {wch: 15}  // Nombre mouvements
        ];
        wsTypes['!cols'] = [{wch:8}, {wch:12}, {wch:12}, {wch:12}, {wch:40}, {wch:18}, {wch:10}];
        wsEmplacements['!cols'] = [{wch:20}, {wch:25}, {wch:40}];
        wsCategories['!cols'] = [{wch:20}, {wch:25}, {wch:12}, {wch:15}];
        wsUtilisateurs['!cols'] = [{wch:28}, {wch:30}, {wch:15}, {wch:15}, {wch:12}, {wch:20}, {wch:20}];

        XLSX.utils.book_append_sheet(wb, wsContenants, "Contenants");
        XLSX.utils.book_append_sheet(wb, wsTypes, "Types");
        XLSX.utils.book_append_sheet(wb, wsEmplacements, "Emplacements");
        XLSX.utils.book_append_sheet(wb, wsCategories, "Catégories");
        XLSX.utils.book_append_sheet(wb, wsUtilisateurs, "Utilisateurs");

        // Téléchargement
        const date = new Date().toISOString().slice(0,10);
        XLSX.writeFile(wb, `export-contenants-${date}.xlsx`);
        
        toast("Export Excel réussi ! " + contenantsData.length + " contenants, " + 
              typesData.length + " types, " + utilisateursData.length + " utilisateurs.", 'ok');
    } catch(err) {
        toast("Erreur export Excel : " + err.message, 'err');
        console.error(err);
    }
}

/* ===================================================================
   IMPORT GMAO (CORRESPONDANCE) — BACKFILL DU PARC
   -------------------------------------------------------------------
   Lit un fichier Excel 2 colonnes : "Identifiant" + "N° GMAO"
   et associe le n° GMAO au contenant existant, sans rien écraser
   d'autre (historique, statut, emplacement, etc.).
   
   Règles :
   - Format GMAO libre (juste trim).
   - Unicité stricte sur TOUT le parc (y compris réformés).
   - Aucune écriture silencieuse : rapport complet en fin de traitement.
   - Écriture par batch de 500 (limite Firestore).
   - Entrée d'historique "gmao_modification" ajoutée à chaque mise à jour.
   =================================================================== */
function importerGmaoExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                const feuille = wb.Sheets[wb.SheetNames[0]];
                const lignes = XLSX.utils.sheet_to_json(feuille, { defval: '' });
                
                if (lignes.length === 0) {
                    toast("Fichier vide ou aucune donnée lisible.", 'err');
                    return;
                }
                
                // Identifier les colonnes (insensible à la casse et aux espaces)
                const premiereLigne = lignes[0];
                let colIdentifiant = null, colGmao = null;
                for (const cle of Object.keys(premiereLigne)) {
                    const n = (cle || '').toLowerCase().replace(/\s+/g, '');
                    if (n === 'identifiant' || n === 'id' || n === 'identifiantunique') colIdentifiant = cle;
                    if (n.includes('gmao') || n === 'numerogmao' || n === 'numgmao' || n === 'codegmao') colGmao = cle;
                }
                
                if (!colIdentifiant || !colGmao) {
                    toast("Colonnes introuvables. Le fichier doit contenir au moins « Identifiant » et « N° GMAO ».", 'err');
                    return;
                }
                
                toast("Analyse du fichier en cours... (" + lignes.length + " lignes)", 'info');
                
                await traiterImportGmao(lignes, colIdentifiant, colGmao);
                
            } catch (err) {
                toast("Erreur lecture fichier : " + err.message, 'err');
                console.error(err);
            }
        };
        reader.readAsArrayBuffer(file);
    };
    
    input.click();
}

/* -------------------------------------------------------------------
   TRAITEMENT EFFECTIF DE L'IMPORT GMAO
   ------------------------------------------------------------------- */
async function traiterImportGmao(lignes, colIdentifiant, colGmao) {
    const rapport = {
        misAJour: [],
        identiques: [],      // GMAO identique à l'existant (pas d'écriture)
        introuvables: [],    // Identifiant 18 chiffres inconnu
        doublons: [],        // GMAO déjà porté par un autre contenant
        vides: [],           // Identifiant vide dans le fichier
        total: lignes.length
    };
    
    // Pré-calcul de la map des GMAO déjà utilisés (pour détection doublons)
    // clé = cleGmao(valeur), valeur = identifiant du contenant porteur
    const gmaoUtilises = {};
    for (const id in CONTENANTS) {
        const g = CONTENANTS[id].gmao;
        if (g) gmaoUtilises[cleGmao(g)] = id;
    }
    
    const now = firebase.firestore.Timestamp.now();
    const utilisateur = obtenirNomUtilisateurPourHistorique();
    
    // Liste des opérations à effectuer
    const operations = [];
    
    for (const ligne of lignes) {
        const id = String(ligne[colIdentifiant] || '').trim();
        const gmaoBrut = String(ligne[colGmao] || '').trim();
        
        // Ligne vide
        if (!id) {
            rapport.vides.push(ligne);
            continue;
        }
        
        // Identifiant inconnu
        if (!CONTENANTS[id]) {
            rapport.introuvables.push({ id, gmao: gmaoBrut });
            continue;
        }
        
        const contenant = CONTENANTS[id];
        const ancienGmao = contenant.gmao || '';
        
        // Valeur inchangée (normalisée)
        if (cleGmao(gmaoBrut) === cleGmao(ancienGmao)) {
            rapport.identiques.push({ id, gmao: gmaoBrut });
            continue;
        }
        
        // Doublon : ce GMAO est déjà porté par un autre contenant
        if (gmaoBrut) {
            const cle = cleGmao(gmaoBrut);
            if (gmaoUtilises[cle] && gmaoUtilises[cle] !== id) {
                rapport.doublons.push({ id, gmao: gmaoBrut, portePar: gmaoUtilises[cle] });
                continue;
            }
            // Marquer comme utilisé pour les lignes suivantes du fichier
            gmaoUtilises[cle] = id;
        }
        
        // Opération valide
        operations.push({ id, ancienGmao, nouveauGmao: gmaoBrut });
    }
    
    // S'il n'y a rien à écrire
    if (operations.length === 0) {
        afficherRapportImportGmao(rapport);
        return;
    }
    
    // Confirmation
    if (!confirm(
        "Importer " + operations.length + " n° GMAO ?\n\n" +
        "• À mettre à jour : " + operations.length + "\n" +
        "• Identifiants introuvables : " + rapport.introuvables.length + "\n" +
        "• Doublons refusés : " + rapport.doublons.length + "\n" +
        "• Valeurs inchangées : " + rapport.identiques.length + "\n" +
        "• Lignes vides : " + rapport.vides.length + "\n\n" +
        "Aucune autre donnée ne sera modifiée. Continuer ?"
    )) {
        toast("Import annulé.", 'info');
        return;
    }
    
    // Écriture par batch de 500
    try {
        for (let i = 0; i < operations.length; i += 500) {
            const batch = db.batch();
            const chunk = operations.slice(i, i + 500);
            
            for (const op of chunk) {
                const ref = db.collection('contenants').doc(op.id);
                
                // Lecture des données actuelles pour préserver l'historique
                const doc = await ref.get();
                const data = doc.exists ? doc.data() : {};
                const hist = (data.historique || []).slice();
                hist.push({
                    date: now,
                    action: 'gmao_modification',
                    ancienneValeur: op.ancienGmao,
                    nouvelleValeur: op.nouveauGmao,
                    commentaire: 'Import de correspondance GMAO',
                    utilisateur: utilisateur
                });
                
                batch.update(ref, {
                    gmao: op.nouveauGmao || null,
                    historique: hist
                });
                
                rapport.misAJour.push({ id: op.id, ancienGmao: op.ancienGmao, nouveauGmao: op.nouveauGmao });
            }
            
            await batch.commit();
        }
        
        afficherRapportImportGmao(rapport);
        
    } catch (err) {
        toast("❌ Erreur pendant l'import : " + err.message, 'err');
        console.error(err);
    }
}

/* -------------------------------------------------------------------
   AFFICHAGE DU RAPPORT D'IMPORT GMAO
   ------------------------------------------------------------------- */
function afficherRapportImportGmao(rapport) {
    const lignes = [];
    lignes.push("═══════════════════════════════════════");
    lignes.push("     RAPPORT D'IMPORT GMAO");
    lignes.push("═══════════════════════════════════════");
    lignes.push("");
    lignes.push("✅ Mis à jour : " + rapport.misAJour.length);
    lignes.push("➖ Inchangés   : " + rapport.identiques.length);
    lignes.push("❌ Introuvables : " + rapport.introuvables.length);
    lignes.push("⚠️ Doublons    : " + rapport.doublons.length);
    lignes.push("○ Lignes vides : " + rapport.vides.length);
    lignes.push("");
    lignes.push("Total traité : " + rapport.total + " lignes");
    
    if (rapport.misAJour.length > 0) {
        const msgType = rapport.misAJour.length > 0 ? 'ok' : 'info';
        toast(lignes.join('\n'), msgType, 12000);
        
        // Téléchargement d'un fichier récap (CSV) pour archivage
        telechargerRecapImportGmao(rapport);
    } else {
        toast(lignes.join('\n'), 'info', 8000);
    }
}

/* -------------------------------------------------------------------
   TÉLÉCHARGEMENT DU RÉCAP D'IMPORT (fichier CSV d'archivage)
   Utile pour garder une trace de ce qui a été importé ou refusé.
   ------------------------------------------------------------------- */
function telechargerRecapImportGmao(rapport) {
    const csvLines = [];
    csvLines.push('Statut;Identifiant;N° GMAO (saisi);N° GMAO existant;Porté par');
    
    rapport.misAJour.forEach(op => {
        csvLines.push('mis_a_jour;' + op.id + ';"' + (op.nouveauGmao || '').replace(/"/g, '""') + '";"' + (op.ancienGmao || '').replace(/"/g, '""') + '";');
    });
    rapport.identiques.forEach(op => {
        csvLines.push('inchange;' + op.id + ';"' + op.gmao.replace(/"/g, '""') + '";"' + op.gmao.replace(/"/g, '""') + '";');
    });
    rapport.introuvables.forEach(op => {
        csvLines.push('introuvable;' + op.id + ';"' + op.gmao.replace(/"/g, '""') + '";;');
    });
    rapport.doublons.forEach(op => {
        csvLines.push('doublon;' + op.id + ';"' + op.gmao.replace(/"/g, '""') + '";;' + op.portePar);
    });
    rapport.vides.forEach(() => {
        csvLines.push('ligne_vide;;;;');
    });
    
    const blob = new Blob(['\ufeff' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'recap-import-gmao-' + date + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------
   TÉLÉCHARGER UN MODÈLE VIDE D'IMPORT GMAO
   Pratique pour préparer la correspondance depuis le référentiel GMAO.
   ------------------------------------------------------------------- */
function telechargerModeleImportGmao() {
    const wb = XLSX.utils.book_new();
    const data = [
        { 'Identifiant': '052030000000000001', 'N° GMAO': 'EQ-1234' },
        { 'Identifiant': '052030000000000002', 'N° GMAO': '' }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Correspondance GMAO');
    XLSX.writeFile(wb, 'modele-import-gmao.xlsx');
    toast("Modèle téléchargé. Remplissez-le puis réimportez-le.", 'ok');
}

/* -------------------------------------------------------------------
   EXPORT JSON (BACKUP COMPLET - TOUTES LES COLLECTIONS)
   ------------------------------------------------------------------- */
async function exporterJsonComplet() {
    try {
        toast("Export en cours... Cela peut prendre quelques secondes.", 'info');
        
        const backup = {
            version: "2.0",
            type: "BACKUP_COMPLET",
            dateExport: new Date().toISOString(),
            application: "Gestion des Contenants",
            collections: {},
            stats: {}
        };

        let totalDocs = 0;

        // Exporter CHAQUE collection
        for (const collectionName of COLLECTIONS_A_SAUVAGARDER) {
            try {
                console.log(`Export collection : ${collectionName}`);
                
                const snapshot = await db.collection(collectionName).get();
                const docs = {};
                
                snapshot.forEach(doc => {
                    docs[doc.id] = serialiserPourExport(doc.data());
                });
                
                backup.collections[collectionName] = docs;
                backup.stats[collectionName] = Object.keys(docs).length;
                totalDocs += Object.keys(docs).length;
                
                console.log(`  → ${Object.keys(docs).length} documents`);
            } catch(err) {
                console.warn(`Collection ${collectionName} non trouvée ou erreur :`, err);
                backup.collections[collectionName] = {};
                backup.stats[collectionName] = 0;
            }
        }

        // Télécharger le fichier JSON
        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0,10);
        a.href = url;
        a.download = `backup-complet-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);

        // Résumé
        const resume = Object.entries(backup.stats)
            .map(([col, count]) => `• ${col} : ${count} docs`)
            .join('\n');
        
        toast(`Backup exporté ! Total : ${totalDocs} documents\n${resume}`, 'ok');
        
    } catch(err) {
        toast("Erreur export JSON : " + err.message, 'err');
        console.error(err);
    }
}

/* -------------------------------------------------------------------
   IMPORT JSON (RESTAURATION COMPLÈTE)
   ------------------------------------------------------------------- */
function importerJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const backup = JSON.parse(event.target.result);
                
                // Validation de la structure
                if (!backup.collections || !backup.version) {
                    toast("Fichier invalide : structure incorrecte.", 'err');
                    return;
                }

                // Vérifier si c'est un backup complet ou ancien format
                if (backup.type !== "BACKUP_COMPLET") {
                    toast("Attention : Ce fichier semble être un ancien format de backup.", 'err');
                    return;
                }

                // Résumé de la sauvegarde
                const stats = backup.stats || {};
                const totalDocs = Object.values(stats).reduce((a, b) => a + b, 0);
                
                const resume = `
                    ═══════════════════════════════════════
                    FICHIER DE SAUVEGARDE COMPLÈTE DÉTECTÉ
                    ═══════════════════════════════════════
                    
                    Version : ${backup.version}
                    Date : ${new Date(backup.dateExport).toLocaleString('fr-FR')}
                    
                    CONTENU À RESTAURER :
                    ${Object.entries(stats).map(([col, count]) => `• ${col} : ${count} documents`).join('\n')}
                    
                    TOTAL : ${totalDocs} documents
                    
                    ⚠️ ATTENTION : Cette opération va REMPLACER
                    TOUTES les données actuelles par celles du backup.
                    
                    Cette action est IRRÉVERSIBLE.
                    
                    Continuer ?
                `;

                if (!confirm(resume)) return;

                // Double confirmation pour les admins
                if (!confirm("Êtes-vous VRAIMENT sûr ? Toutes les données actuelles seront écrasées.")) return;

                // Restauration
                restaurerToutesCollections(backup.collections);
                
            } catch(err) {
                toast("Erreur lecture fichier : " + err.message, 'err');
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

/* -------------------------------------------------------------------
   RESTAURATION COMPLÈTE DE TOUTES LES COLLECTIONS
   ------------------------------------------------------------------- */
async function restaurerToutesCollections(collections) {
    try {
        toast("🔄 Restauration en cours... Ne fermez PAS la page.", 'info');
        
        let totalOperations = 0;
        let collectionsRestaurees = 0;

        for (const [collectionName, docs] of Object.entries(collections)) {
            const entries = Object.entries(docs);
            if (entries.length === 0) continue;

            console.log(`Restauration collection : ${collectionName} (${entries.length} docs)`);

            // Batch writes de 500 max (limite Firestore)
            for (let i = 0; i < entries.length; i += 500) {
                const batch = db.batch();
                const chunk = entries.slice(i, i + 500);
                
                chunk.forEach(([docId, docData]) => {
                    const ref = db.collection(collectionName).doc(docId);
                    batch.set(ref, deserialiserPourImport(docData));
                });
                
                await batch.commit();
                totalOperations += chunk.length;
                
                // Progression
                const progress = Math.round((i + chunk.length) / entries.length * 100);
                console.log(`  → Progression : ${progress}%`);
            }
            
            collectionsRestaurees++;
        }

        toast(`✅ Restauration terminée !\n${totalOperations} documents restaurés dans ${collectionsRestaurees} collections.\nLes données seront rechargées automatiquement.`, 'ok');
        
        // Les listeners Firestore vont détecter les changements
        // et rafraîchir l'interface automatiquement
        
    } catch(err) {
        toast("❌ Erreur restauration : " + err.message, 'err');
        console.error(err);
    }
}

/* -------------------------------------------------------------------
   UTILITAIRES : Sérialisation / Désérialisation
   ------------------------------------------------------------------- */
function serialiserPourExport(obj) {
    if (!obj) return null;
    
    // Firestore Timestamp -> ISO string
    if (obj.seconds !== undefined && obj.nanoseconds !== undefined) {
        return { __timestamp__: new Date(obj.seconds * 1000).toISOString() };
    }
    
    // Firestore GeoPoint -> {lat, lng}
    if (obj.latitude !== undefined && obj.longitude !== undefined) {
        return { __geopoint__: { lat: obj.latitude, lng: obj.longitude } };
    }
    
    // Arrays
    if (Array.isArray(obj)) {
        return obj.map(serialiserPourExport);
    }
    
    // Objects
    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = serialiserPourExport(obj[key]);
            }
        }
        return result;
    }
    
    return obj;
}

function deserialiserPourImport(obj) {
    if (!obj) return null;
    
    // ISO string -> Firestore Timestamp
    if (obj.__timestamp__) {
        return firebase.firestore.Timestamp.fromDate(new Date(obj.__timestamp__));
    }
    
    // GeoPoint
    if (obj.__geopoint__) {
        return new firebase.firestore.GeoPoint(obj.__geopoint__.lat, obj.__geopoint__.lng);
    }
    
    // Arrays
    if (Array.isArray(obj)) {
        return obj.map(deserialiserPourImport);
    }
    
    // Objects
    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = deserialiserPourImport(obj[key]);
            }
        }
        return result;
    }
    
    return obj;
}

function formatTimestampPourExport(timestamp) {
    if (!timestamp) return '';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch(e) {
        return '';
    }
}
