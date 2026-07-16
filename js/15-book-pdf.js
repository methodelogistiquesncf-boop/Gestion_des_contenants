/* ===================================================================
   BOOK PDF DES TYPES DE CONTENANTS
   Génère un catalogue PDF (page de couverture + une page par type) à
   partir des données déjà chargées dans TYPES (photo, dimensions,
   description, catégorie). Aucun appel serveur supplémentaire : tout
   est déjà en mémoire grâce aux listeners Firestore.
   =================================================================== */
// Construit l'ordre des types pour le book PDF : regroupés par catégorie
// (triées alphabétiquement, "Non catégorisé" toujours en dernier), puis
// triés par lettre croissante à l'intérieur de chaque catégorie. Ainsi les
// types d'une même catégorie se suivent toujours dans le PDF au lieu
// d'être mélangés par un simple tri alphabétique global des lettres.
function obtenirOrdreTypesPourBook(){
  const catIds = Object.keys(CATEGORIES).sort((a,b)=> CATEGORIES[a].nom.localeCompare(CATEGORIES[b].nom));

  const groupes = catIds.map(id=> ({id, nom: CATEGORIES[id].nom}));
  groupes.push({id: null, nom: 'Non catégorisé'});

  let ordre = [];
  groupes.forEach(g=>{
    const lettresGroupe = Object.keys(TYPES)
      .filter(l=> (TYPES[l].categorieId || null) === g.id)
      .sort();
    ordre = ordre.concat(lettresGroupe);
  });
  return ordre;
}

async function genererBookPDF(){
  const lettres = obtenirOrdreTypesPourBook();
  if(lettres.length === 0){ toast("Aucun type à exporter.", 'err'); return; }

  toast("Génération du book PDF…", '');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  const steel = [44, 95, 138];
  const ink = [27, 39, 51];
  const inkSoft = [87, 105, 124];

  // ---- Page de couverture ----
  doc.setFillColor(...steel);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text('Catalogue des contenants', pageW / 2, 130, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.text(lettres.length + ' type(s) référencé(s)', pageW / 2, 145, { align: 'center' });
  doc.setFontSize(10);
  doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR'), pageW / 2, 155, { align: 'center' });

  // ---- Une page par type ----
  lettres.forEach((lettre, index) => {
    const t = TYPES[lettre];
    const cat = t.categorieId ? CATEGORIES[t.categorieId] : null;
    doc.addPage();

    // Bandeau d'en-tête
    doc.setFillColor(...steel);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Type ' + t.lettre, 15, 17);
    if(cat){
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(cat.nom, pageW - 15, 17, { align: 'right' });
    }

    let y = 40;
    doc.setTextColor(...ink);

    // Dimensions
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Dimensions', 15, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Longueur : ' + (t.longueur || 0) + ' cm', 15, y); y += 6;
    doc.text('Largeur : ' + (t.largeur || 0) + ' cm', 15, y); y += 6;
    doc.text('Hauteur : ' + (t.hauteur || 0) + ' cm', 15, y); y += 10;

    // Description
    if (t.description) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Description', 15, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(t.description, pageW - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 8;
    }

    // Photo
    if (t.photo) {
      try {
        const imgProps = doc.getImageProperties(t.photo);
        const maxW = pageW - 30;
        const maxH = pageH - y - 20;
        let w = maxW, h = (imgProps.height / imgProps.width) * w;
        if (h > maxH) { h = maxH; w = (imgProps.width / imgProps.height) * h; }
        const x = (pageW - w) / 2;
        doc.addImage(t.photo, 'JPEG', x, y, w, h);
      } catch (e) {
        console.error('Erreur image type ' + lettre, e);
      }
    } else {
      doc.setFontSize(10);
      doc.setTextColor(...inkSoft);
      doc.text('(Aucune photo disponible pour ce type)', 15, y);
    }

    // Pied de page
    doc.setFontSize(9);
    doc.setTextColor(...inkSoft);
    doc.text('Type ' + t.lettre, 15, pageH - 10);
    doc.text((index + 1) + ' / ' + lettres.length, pageW - 15, pageH - 10, { align: 'right' });
  });

  doc.save('catalogue-contenants.pdf');
  toast("Book PDF généré.", 'ok');
}
