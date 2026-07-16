/* ===================================================================
   EMPLACEMENTS DE RÉPARATION
   =================================================================== */
function creerEmplacement(btn){
  const nom = document.getElementById('emp-nom').value.trim();
  const description = document.getElementById('emp-desc').value.trim();
  if(!nom){ toast("Indique un nom d'emplacement.", 'err'); return; }

  setBtnLoading(btn, 'Ajout…');
  db.collection('emplacements').add({nom, description}).then(()=>{
    toast("Emplacement ajouté.", 'ok');
    document.getElementById('emp-nom').value='';
    document.getElementById('emp-desc').value='';
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}

function supprimerEmplacement(id){
  if(!confirm("Supprimer cet emplacement ?")) return;
  db.collection('emplacements').doc(id).delete()
    .then(()=> toast("Emplacement supprimé.", 'ok'))
    .catch(err=> toast("Erreur : " + err.message, 'err'));
}

function ouvrirEditEmplacement(id){
  const e = EMPLACEMENTS[id];
  if(!e) return;
  document.getElementById('edit-emp-id').value = id;
  document.getElementById('edit-emp-nom').value = e.nom || '';
  document.getElementById('edit-emp-desc').value = e.description || '';
  document.getElementById('modal-edit-emplacement').classList.add('active');
}

function closeEditEmplacementModal(){
  document.getElementById('modal-edit-emplacement').classList.remove('active');
}
document.getElementById('modal-edit-emplacement').addEventListener('click', e=>{
  if(e.target.id === 'modal-edit-emplacement') closeEditEmplacementModal();
});

function enregistrerEditEmplacement(btn){
  const id = document.getElementById('edit-emp-id').value;
  const nom = document.getElementById('edit-emp-nom').value.trim();
  const description = document.getElementById('edit-emp-desc').value.trim();

  if(!nom){ toast("Indique un nom d'emplacement.", 'err'); return; }

  setBtnLoading(btn, 'Enregistrement…');
  db.collection('emplacements').doc(id).update({nom, description}).then(()=>{
    toast("Emplacement mis à jour.", 'ok');
    closeEditEmplacementModal();
  }).catch(err=> toast("Erreur : " + err.message, 'err'))
    .finally(()=> clearBtnLoading(btn));
}



function renderEmplacements(){
  const el = document.getElementById('emplacements-table');
  const ids = Object.keys(EMPLACEMENTS);
  if(ids.length === 0){
    el.innerHTML = '<div class="empty">Aucun emplacement enregistré pour l\'instant. Ajoute-en un ci-dessus.</div>';
    return;
  }
  let html = '<table><thead><tr><th>Nom</th><th>Description</th><th></th></tr></thead><tbody>';
  ids.forEach(id=>{
    const e = EMPLACEMENTS[id];
    html += `<tr>
      <td><strong>${e.nom}</strong></td>
      <td>${e.description || '—'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="ouvrirEditEmplacement('${id}')">Modifier</button>
        <button class="btn btn-danger btn-sm" onclick="supprimerEmplacement('${id}')">Supprimer</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderSelectEmplacements(){
  const ids = Object.keys(EMPLACEMENTS);
  const opts = ids.map(id=> `<option value="${id}">${EMPLACEMENTS[id].nom}</option>`).join('');

  const selFilter = document.getElementById('filter-emplacement');
  const current = selFilter.value;
  selFilter.innerHTML = '<option value="">Tous les emplacements</option>' + opts;
  selFilter.value = current;
}
