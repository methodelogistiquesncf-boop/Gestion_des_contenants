/* ===================================================================
   ÉTATS DE CHARGEMENT DES BOUTONS
   Évite les doubles soumissions vers Firestore : le bouton se
   désactive et affiche un petit spinner + libellé pendant l'appel,
   puis reprend son état d'origine (succès ou échec).
   =================================================================== */
function setBtnLoading(btn, loadingLabel){
  if(!btn) return;
  if(!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>' + (loadingLabel || 'Enregistrement…');
}

function clearBtnLoading(btn){
  if(!btn) return;
  btn.disabled = false;
  if(btn.dataset.originalLabel){
    btn.innerHTML = btn.dataset.originalLabel;
    delete btn.dataset.originalLabel;
  }
}


/* ===================================================================
   NAVIGATION ENTRE ONGLETS
   =================================================================== */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.view).classList.add('active');
  });
});

// Raccourci utilisé par le badge d'alerte du bandeau : envoie directement
// vers l'onglet Casse / Réparation, où l'utilisateur peut agir.
function allerVersCasse(){
  const btn = document.querySelector('.tab-btn[data-view="v-casse"]');
  if(btn) btn.click();
}

/* ===================================================================
   TOASTS
   =================================================================== */
function toast(msg, type=''){
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}
