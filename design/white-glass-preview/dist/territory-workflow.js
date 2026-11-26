const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=(n,singular,plural=singular+'s')=>`${n} ${n===1?singular:plural}`;
const asNumber=value=>Number.isFinite(Number(value))?Number(value):0;
const ratio=(a,b)=>b?Math.max(0,Math.min(100,Math.round(a/b*100))):0;
const total=(items,key)=>items.reduce((sum,item)=>sum+asNumber(item[key]),0);
const accountMark=name=>{
  const initials=String(name||'').split(/[\s-]+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  return `<span class="tw-account-mark" title="${safe(name)}" aria-label="${safe(name)}">${safe(initials)}</span>`;
};

/** A compact, navigable map. Only the supplied territory and accounts can appear. */
export function renderTerritoryCompass({cities=[],units=[],deals=[],invoices=[],selectedCity='Paris',owner=deal=>deal.owner,age=deal=>deal.age,money=value=>`${value} k€`}={}){
  if(!cities.length||!units.length)return '';
  const cityUnits=name=>units.filter(unit=>unit.city===name);
  const city=cityUnits(selectedCity).length?selectedCity:cities.find(item=>cityUnits(item.name).length)?.name;
  if(!city)return '';
  const current=cityUnits(city);
  const signed=total(current,'signed'),target=total(current,'target');
  const unitIds=new Set(current.map(unit=>unit.id));
  const linked=deals.filter(deal=>unitIds.has(deal.bu));
  const attention=linked.filter(deal=>!owner(deal)||age(deal)>=11).length;
  const unpaid=invoices.filter(invoice=>unitIds.has(invoice.bu)&&invoice.status==='overdue');
  const points=cities.filter(item=>cityUnits(item.name).length).map(item=>{
    const group=cityUnits(item.name),value=total(group,'signed'),goal=total(group,'target'),active=item.name===city;
    return `<button type="button" class="tw-map-point ${active?'is-active':''} ${ratio(value,goal)<60?'is-behind':''}" data-action="map-city" data-value="${safe(item.name)}" style="--tw-x:${Math.max(0,Math.min(100,asNumber(item.x)))}%;--tw-y:${Math.max(0,Math.min(100,asNumber(item.y)))}%;--tw-size:${Math.max(13,Math.min(23,12+value/40))}px" aria-label="${safe(item.name)}, ${safe(money(value))} signés sur ${safe(money(goal))} visés, ouvrir le territoire"><span class="tw-map-dot"></span><span class="tw-map-label">${safe(item.name)}</span></button>`;
  }).join('');
  const unitCards=current.map(unit=>{
    const cases=deals.filter(deal=>deal.bu===unit.id),late=cases.filter(deal=>!owner(deal)||age(deal)>=11).length;
    return `<button type="button" class="tw-unit" data-action="map-bu" data-value="${safe(unit.id)}"><span><strong>${safe(unit.name)}</strong><small>${count(late,'affaire')} à reprendre · ${count(asNumber(unit.uncovered),'besoin')} sans profil</small></span><b>${safe(money(asNumber(unit.signed)))}</b></button>`;
  }).join('');
  return `<section class="tw-atlas glass" aria-label="Carte commerciale de France"><div class="tw-atlas-heading"><div><span class="tw-kicker">VUE TERRITOIRES · FRANCE</span><h2>Votre activité sur la carte</h2><p>Ouvrez une ville pour consulter ses BU, ses affaires et les responsables du territoire.</p></div><button type="button" class="tw-atlas-open" data-action="go-map">Explorer la carte complète</button></div><div class="tw-atlas-main"><div class="tw-map-wrap"><div class="tw-map-shape" role="group" aria-label="Villes commerciales sur la carte de France">${points}</div><div class="tw-map-foot"><span><i></i>Ville sous 60 % de sa cible mensuelle</span><span>Montants signés · novembre</span></div></div><div class="tw-atlas-detail"><div class="tw-atlas-city"><span class="tw-kicker">VILLE SÉLECTIONNÉE</span><h3>${safe(city)}</h3><div class="tw-city-number"><strong>${safe(money(signed))}</strong><span>/ ${safe(money(target))} visés</span></div><div class="tw-city-meter" style="--tw-progress:${ratio(signed,target)}%" role="img" aria-label="${ratio(signed,target)} % de l’objectif mensuel signé"><b>${ratio(signed,target)} %</b></div><p>${count(attention,'affaire')} à reprendre · ${count(total(current,'uncovered'),'besoin')} sans profil.</p></div><div class="tw-city-notes"><span>${count(unpaid.length,'facture')} échue${unpaid.length===1?'':'s'} dans le suivi</span><strong>${safe(money(total(unpaid,'amount')/1000))}</strong></div><div class="tw-atlas-unit-title">Business units de ${safe(city)}</div><div class="tw-atlas-units">${unitCards}</div></div></div></section>`;
}

/** Cards keep a person's deals, current workload and next action together. */
export function renderTeamPortfolios({rows=[],members=[],deals=[],owner=deal=>deal.owner,age=deal=>deal.age,next=deal=>deal.next,avatar=()=>'',money=value=>`${value} k€`,maxVisible=4}={}){
  const visibleUnits=new Set(rows.map(unit=>unit.id));
  const people=members.filter(person=>visibleUnits.has(person.bu));
  if(!people.length)return '<p class="body-copy">Aucune personne dans ce périmètre.</p>';
  const renderPerson=person=>{
    const unit=rows.find(item=>item.id===person.bu),portfolio=deals.filter(deal=>deal.bu===person.bu&&owner(deal)===person.id),stalled=portfolio.filter(deal=>age(deal)>=11),nextDeal=portfolio.sort((a,b)=>age(b)-age(a))[0];
    return `<button type="button" class="tw-person" data-action="member" data-id="${safe(person.id)}" aria-label="Voir le portefeuille de ${safe(person.name)}"><span class="tw-person-top"><span class="tw-person-identity">${avatar(person.id)}<span><strong>${safe(person.name)}</strong><small>${safe(unit?.name||'Équipe')} · ${safe(person.role)}</small></span></span><span class="tw-person-signed">${safe(money(asNumber(person.signed)))}<small>signés</small></span></span><span class="tw-person-middle"><span><b>${portfolio.length}</b> affaires suivies</span><span class="${stalled.length?'tw-risk':''}"><b>${stalled.length}</b> à reprendre</span></span><span class="tw-person-bottom">${nextDeal?`<span>${accountMark(nextDeal.account)}<span><small>À faire sur ${safe(nextDeal.account)}</small><strong>${safe(next(nextDeal))}</strong></span></span>`:'<span><small>Portefeuille</small><strong>Aucune affaire attribuée</strong></span>'}<span class="tw-person-open" aria-hidden="true">↗</span></span></button>`;
  };
  return `<section class="tw-team" aria-label="Portefeuilles de l’équipe"><div class="tw-team-title"><div><span class="tw-kicker">ÉQUIPE · NOVEMBRE</span><h2>Les portefeuilles de l’équipe</h2><p>Chiffre signé, affaires à reprendre et prochaine suite par personne.</p></div><span>${count(people.length,'personne')} dans le périmètre</span></div><div class="tw-team-grid">${people.slice(0,maxVisible).map(renderPerson).join('')}</div>${people.length>maxVisible?`<details class="tw-team-more"><summary>Voir les ${people.length-maxVisible} autres portefeuilles</summary><div class="tw-team-grid">${people.slice(maxVisible).map(renderPerson).join('')}</div></details>`:''}</section>`;
}

/** The handoff board uses existing deal ownership and follow-up facts. */
export function renderHandoffFlow({deals=[],dispatch=[],owner=deal=>deal.owner,age=deal=>deal.age,next=deal=>deal.next,member=id=>({name:id}),money=value=>`${value} k€`}={}){
  const incoming=deals.filter(deal=>!owner(deal));
  const waiting=deals.filter(deal=>owner(deal)&&age(deal)>=11);
  const moving=deals.filter(deal=>owner(deal)&&age(deal)<11);
  const groups=[
    {id:'new',title:'À attribuer',description:'Un responsable doit prendre le dossier.',items:incoming},
    {id:'waiting',title:'À relancer',description:'Le dernier échange remonte à 11 jours ou plus.',items:waiting},
    {id:'moving',title:'À faire avancer',description:'Une prochaine action est identifiée.',items:moving},
  ];
  const cards=groups.map(group=>`<div class="tw-flow-column tw-flow-${group.id}"><div class="tw-flow-head"><span class="tw-flow-pulse"></span><span><strong>${group.title}</strong><small>${group.description}</small></span><b>${group.items.length}</b></div><div class="tw-flow-items">${group.items.slice(0,2).map(deal=>{
    const info=dispatch.find(item=>item.dealId===deal.id),responsible=owner(deal);
    return `<button type="button" class="tw-flow-case" data-action="deal" data-id="${safe(deal.id)}"><strong>${safe(deal.account)}</strong><span>${safe(deal.need||next(deal))}</span><small>${info?`${safe(info.kind)} · ${safe(info.source)}`:responsible?`${safe(member(responsible)?.name||'Responsable')} · ${safe(next(deal))}`:safe(next(deal))}</small><b>${safe(money(asNumber(deal.amount)))}</b></button>`;
  }).join('')||'<p>Rien à traiter à cette étape.</p>'}</div>${group.items.length>2?`<small class="tw-flow-more">${group.items.length-2} autres affaires dans le pipeline</small>`:''}</div>`).join('');
  return `<section class="tw-flow" aria-label="Circuit de traitement des affaires"><div class="tw-team-title"><div><span class="tw-kicker">DE LA DEMANDE À LA SUITE</span><h2>Les dossiers à faire avancer</h2><p>Les cartes ouvrent l’affaire avec son responsable, son contexte et sa prochaine action.</p></div></div><div class="tw-flow-grid">${cards}</div></section>`;
}
