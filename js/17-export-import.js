/* ===================================================================
   EXPORT / IMPORT - SAUVEGARDE ET RESTAURATION DES DONNÉES
   Fonctionnalités admin uniquement :
   - Export Excel multi-feuilles (Contenants, Types, Emplacements, Catégories)
   - Export JSON (backup complet)
   - Import JSON (restauration avec confirmation)
   =================================================================== */

/* -------------------------------------------------------------------
   EXPORT EXCEL (MULTI-FEUILLES)
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

        // Création du workbook
        const wb = XLSX.utils.book_new();
        
        const wsContenants = XLSX.utils.json_to_sheet(contenantsData);
        const wsTypes = XLSX.utils.json_to_sheet(typesData);
        const wsEmplacements = XLSX.utils.json_to_sheet(emplacementsData);
        const wsCategories = XLSX.utils.json_to_sheet(categoriesData);

        // Ajustement largeurs colonnes
        wsContenants['!cols'] = [{wch:20}, {wch:8}, {wch:18}, {wch:18}, {wch:30}, {wch:18}, {wch:15}, {wch:20}, {wch:15}];
        wsTypes['!cols'] = [{wch:8}, {wch:12}, {wch:12}, {wch:12}, {wch:40}, {wch:18}, {wch:10}];
        wsEmplacements['!cols'] = [{wch:20}, {wch:25}, {wch:40}];
        wsCategories['!cols'] = [{wch:20}, {wch:25}, {wch:12}, {wch:15}];

        XLSX.utils.book_append_sheet(wb, wsContenants, "Contenants");
        XLSX.utils.book_append_sheet(wb, wsTypes, "Types");
        XLSX.utils.book_append_sheet(wb, wsEmplacements, "Emplacements");
        XLSX.utils.book_append_sheet(wb, wsCategories, "Catégories");

        // Téléchargement
        const date = new Date().toISOString().slice(0,10);
        XLSX.writeFile(wb, `export-contenants-${date}.xlsx`);
        
        toast("Export Excel réussi ! " + contenantsData.length + " contenants, " + typesData.length + " types.", 'ok');
    } catch(err) {
        toast("Erreur export Excel : " + err.message, 'err');
        console.error(err);
    }
}

/* -------------------------------------------------------------------
   EXPORT JSON (BACKUP COMPLET)
   ------------------------------------------------------------------- */
function exporterJsonComplet() {
    try {
        // Conversion des Timestamps Firestore en ISO strings pour la portabilité
        const serialiserTimestamp = (obj) => {
            if (!obj) return null;
            if (typeof obj === 'object' && obj.seconds !== undefined) {
                return new Date(obj.seconds * 1000).toISOString();
            }
            if (Array.isArray(obj)) {
                return obj.map(serialiserTimestamp);
            }
            if (typeof obj === 'object' && obj !== null) {
                const result = {};
                for (const key in obj) {
                    result[key] = serialiserTimestamp(obj[key]);
                }
                return result;
            }
            return obj;
        };

        const backup = {
            version: "1.0",
            dateExport: new Date().toISOString(),
            application: "Gestion des Contenants",
            stats: {
                contenants: Object.keys(CONTENANTS).length,
                types: Object.keys(TYPES).length,
                emplacements: Object.keys(EMPLACEMENTS).length,
                categories: Object.keys(CATEGORIES).length
            },
            data: {
                contenants: serialiserTimestamp(CONTENANTS),
                types: serialiserTimestamp(TYPES),
                emplacements: serialiserTimestamp(EMPLACEMENTS),
                categories: serialiserTimestamp(CATEGORIES)
            }
        };

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0,10);
        a.href = url;
        a.download = `backup-contenants-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);

        toast("Backup JSON exporté ! " + backup.stats.contenants + " contenants sauvegardés.", 'ok');
    } catch(err) {
        toast("Erreur export JSON : " + err.message, 'err');
        console.error(err);
    }
}

/* -------------------------------------------------------------------
   IMPORT JSON (RESTAURATION)
   ------------------------------------------------------------------- */
function importerJson() {
    // Créer un input file temporaire
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
                if (!backup.data || !backup.version) {
                    toast("Fichier invalide : structure incorrecte.", 'err');
                    return;
                }

                // Résumé de la sauvegarde
                const stats = backup.stats || {};
                const resume = `
                    Fichier de sauvegarde détecté :
                    ─────────────────────────────
                    Version : ${backup.version}
                    Date : ${new Date(backup.dateExport).toLocaleString('fr-FR')}
                    
                    Contenu à restaurer :
                    • ${stats.contenants || 0} contenants
                    • ${stats.types || 0} types
                    • ${stats.emplacements || 0} emplacements
                    • ${stats.categories || 0} catégories
                    
                    ATTENTION : Cette opération va REMPLACER toutes 
                    les données actuelles. Cette action est IRRÉVERSIBLE.
                    
                    Continuer ?
                `;

                if (!confirm(resume)) return;

                // Restauration des données
                restaurerDonnees(backup.data);
                
            } catch(err) {
                toast("Erreur lecture fichier : " + err.message, 'err');
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

async function restaurerDonnees(data) {
    try {
        // Désérialisation des timestamps ISO vers Firestore Timestamps
        const deserialiserTimestamp = (obj) => {
            if (!obj) return null;
            if (typeof obj === 'string' && !isNaN(Date.parse(obj)) && obj.includes('T')) {
                return firebase.firestore.Timestamp.fromDate(new Date(obj));
            }
            if (Array.isArray(obj)) {
                return obj.map(deserialiserTimestamp);
            }
            if (typeof obj === 'object' && obj !== null) {
                const result = {};
                for (const key in obj) {
                    result[key] = deserialiserTimestamp(obj[key]);
                }
                return result;
            }
            return obj;
        };

        let operationsCount = 0;
        
        // Afficher un indicateur de chargement
        toast("Restauration en cours... Ne fermez pas la page.", 'info');

        // Batch write pour contenants
        if (data.contenants) {
            const batch = db.batch();
            const entries = Object.entries(data.contenants);
            
            // Limite de 500 opérations par batch Firestore
            for (let i = 0; i < entries.length; i += 500) {
                const chunk = entries.slice(i, i + 500);
                chunk.forEach(([id, docData]) => {
                    const ref = db.collection('contenants').doc(id);
                    batch.set(ref, deserialiserTimestamp(docData));
                });
                await batch.commit();
                operationsCount += chunk.length;
            }
        }

        // Batch write pour types
        if (data.types) {
            const batch = db.batch();
            const entries = Object.entries(data.types);
            for (let i = 0; i < entries.length; i += 500) {
                const chunk = entries.slice(i, i + 500);
                chunk.forEach(([lettre, docData]) => {
                    const ref = db.collection('typesContenants').doc(lettre);
                    batch.set(ref, deserialiserTimestamp(docData));
                });
                await batch.commit();
                operationsCount += chunk.length;
            }
        }

        // Batch write pour emplacements
        if (data.emplacements) {
            const batch = db.batch();
            const entries = Object.entries(data.emplacements);
            for (let i = 0; i < entries.length; i += 500) {
                const chunk = entries.slice(i, i + 500);
                chunk.forEach(([id, docData]) => {
                    const ref = db.collection('emplacements').doc(id);
                    batch.set(ref, deserialiserTimestamp(docData));
                });
                await batch.commit();
                operationsCount += chunk.length;
            }
        }

        // Batch write pour catégories
        if (data.categories) {
            const batch = db.batch();
            const entries = Object.entries(data.categories);
            for (let i = 0; i < entries.length; i += 500) {
                const chunk = entries.slice(i, i + 500);
                chunk.forEach(([id, docData]) => {
                    const ref = db.collection('categoriesContenants').doc(id);
                    batch.set(ref, deserialiserTimestamp(docData));
                });
                await batch.commit();
                operationsCount += chunk.length;
            }
        }

        toast(`Restauration terminée ! ${operationsCount} documents restaurés. Les listeners vont recharger les données.`, 'ok');
        
        // Les listeners Firestore vont automatiquement détecter les changements
        // et rafraîchir l'interface
        
    } catch(err) {
        toast("Erreur restauration : " + err.message, 'err');
        console.error(err);
    }
}

/* -------------------------------------------------------------------
   UTILITAIRE : Formater timestamp pour Excel
   ------------------------------------------------------------------- */
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
