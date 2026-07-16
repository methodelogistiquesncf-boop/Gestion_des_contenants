/* ===================================================================
   BADGE D'ALERTE (contenants cassés en attente)
   Affiché en permanence dans le bandeau, quel que soit l'onglet actif :
   c'est l'information la plus actionnable de l'app et elle ne doit pas
   être reléguée à l'onglet Statistiques.
   =================================================================== */
function renderAlertChip(){
  const chip = document.getElementById('alert-chip-casse');
  const countEl = document.getElementById('alert-chip-count');
  if(!chip || !countEl) return;
  const nbCasse = Object.values(CONTENANTS).filter(c=> c.statut === 'casse').length;
  if(nbCasse > 0){
    countEl.textContent = nbCasse + (nbCasse > 1 ? ' cassés à traiter' : ' cassé à traiter');
    chip.classList.add('visible');
  } else {
    chip.classList.remove('visible');
  }
}

/* ===================================================================
   STATISTIQUES
   =================================================================== */
function renderStats(){
  const kpisEl = document.getElementById('stats-kpis');
  const barsEl = document.getElementById('stats-bars');
  renderAlertChip();
  if(!kpisEl || !barsEl) return;

  const tous = Object.values(CONTENANTS);
  const total = tous.length;
  const nbService = tous.filter(c=> c.statut === 'en_service').length;
  const nbCasse = tous.filter(c=> c.statut === 'casse').length;
  const nbReforme = tous.filter(c=> c.statut === 'reforme').length;
  const tauxCasse = total ? Math.round((nbCasse / total) * 100) : 0;

  kpisEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total contenants</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-sub">tous statuts confondus</div>
    </div>
    <div class="kpi-card accent-ok">
      <div class="kpi-label">En service</div>
      <div class="kpi-value">${nbService}</div>
      <div class="kpi-sub">${total ? Math.round((nbService/total)*100) : 0}% du parc</div>
    </div>
    <div class="kpi-card accent-danger">
      <div class="kpi-label">Cassés</div>
      <div class="kpi-value">${nbCasse}</div>
      <div class="kpi-sub">${tauxCasse}% du parc</div>
    </div>
    <div class="kpi-card accent-info">
      <div class="kpi-label">Réformés</div>
      <div class="kpi-value">${nbReforme}</div>
      <div class="kpi-sub">${total ? Math.round((nbReforme/total)*100) : 0}% du parc</div>
    </div>`;

  if(total === 0){
    barsEl.innerHTML = '<div class="empty">Aucun contenant enregistré pour l\'instant.</div>';
    renderStatsParType();
    renderStatsParCategorie();
    return;
  }

  const pct = n => Math.round((n/total)*100);
  barsEl.innerHTML = `
    <div class="stat-bar-row">
      <div class="stat-bar-label"><span>En service</span><span>${nbService} (${pct(nbService)}%)</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill ok" style="width:${pct(nbService)}%"></div></div>
    </div>
    <div class="stat-bar-row">
      <div class="stat-bar-label"><span>Cassés</span><span>${nbCasse} (${pct(nbCasse)}%)</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill danger" style="width:${pct(nbCasse)}%"></div></div>
    </div>
    <div class="stat-bar-row">
      <div class="stat-bar-label"><span>Réformés</span><span>${nbReforme} (${pct(nbReforme)}%)</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill info" style="width:${pct(nbReforme)}%"></div></div>
    </div>`;

  renderStatsParType();
  renderStatsParCategorie();
}

function renderStatsParType(){
  const el = document.getElementById('stats-par-type');
  if(!el) return;

  const lettres = Object.keys(TYPES).sort();
  const tous = Object.values(CONTENANTS);

  if(lettres.length === 0){
    el.innerHTML = '<div class="empty">Aucun type enregistré pour l\'instant.</div>';
    return;
  }

  let html = '<table><thead><tr><th>Type</th><th>Total</th><th>En service</th><th>Cassé</th><th>Réformé</th><th>Taux de casse</th></tr></thead><tbody>';
  lettres.forEach(l=>{
    const items = tous.filter(c=> c.typeLettre === l);
    const total = items.length;
    const nbServiceT = items.filter(c=> c.statut === 'en_service').length;
    const nbCasseT = items.filter(c=> c.statut === 'casse').length;
    const nbReformeT = items.filter(c=> c.statut === 'reforme').length;
    const tauxT = total ? Math.round((nbCasseT/total)*100) : 0;
    html += `<tr>
      <td class="mono"><strong>${l}</strong></td>
      <td>${total}</td>
      <td>${nbServiceT}</td>
      <td>${nbCasseT}</td>
      <td>${nbReformeT}</td>
      <td>${tauxT}%</td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

// Ventilation des contenants par catégorie (Bois / Métallique / etc.),
// calculée à partir de la catégorie du type auquel chaque contenant
// appartient. Les contenants dont le type n'a pas de catégorie sont
// regroupés sous "Non catégorisé".
function renderStatsParCategorie(){
  const el = document.getElementById('stats-par-categorie');
  if(!el) return;

  const tous = Object.values(CONTENANTS);
  if(tous.length === 0){
    el.innerHTML = '<div class="empty">Aucun contenant enregistré pour l\'instant.</div>';
    return;
  }

  const catIds = Object.keys(CATEGORIES).sort((a,b)=> CATEGORIES[a].nom.localeCompare(CATEGORIES[b].nom));
  const groupes = catIds.map(id=> ({id, nom: CATEGORIES[id].nom}));
  groupes.push({id: null, nom: 'Non catégorisé'});

  let html = '<table><thead><tr><th>Catégorie</th><th>Total</th><th>En service</th><th>Cassé</th><th>Réformé</th><th>Taux de casse</th></tr></thead><tbody>';
  groupes.forEach(g=>{
    const items = tous.filter(c=>{
      const t = TYPES[c.typeLettre];
      const catId = t ? (t.categorieId || null) : null;
      return catId === g.id;
    });
    const total = items.length;
    if(total === 0 && g.id === null) return; // pas de ligne "Non catégorisé" si vide
    const nbServiceT = items.filter(c=> c.statut === 'en_service').length;
    const nbCasseT = items.filter(c=> c.statut === 'casse').length;
    const nbReformeT = items.filter(c=> c.statut === 'reforme').length;
    const tauxT = total ? Math.round((nbCasseT/total)*100) : 0;
    html += `<tr>
      <td>${g.id ? badgeCategorie(g.id) : '<span class="badge-cat badge-cat-empty">Non catégorisé</span>'}</td>
      <td>${total}</td>
      <td>${nbServiceT}</td>
      <td>${nbCasseT}</td>
      <td>${nbReformeT}</td>
      <td>${tauxT}%</td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}
