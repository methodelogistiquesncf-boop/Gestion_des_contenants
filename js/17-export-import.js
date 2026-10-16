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
        // Feuille 1 : Contenants
        const contenantsData = Object.entries(CONTENANTS).map(([id, c]) => {
            const type = TYPES[c.typeLettre];
            const categorie = type && CATEGORIES[type.categorieId];
            const emplacement = EMPLACEMENTS[c.emplacementId];
            
            return {
                'Identifiant': id,
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
        wsContenants['!cols'] = [{wch:20}, {wch:8}, {wch:18}, {wch:18}, {wch:30}, {wch:18}, {wch:15}, {wch:20}, {wch:15}];
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
