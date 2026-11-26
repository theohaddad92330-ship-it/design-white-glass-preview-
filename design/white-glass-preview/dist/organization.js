// Configuration locale pour la maquette. Aucun objet ici n'est envoyé au produit Bellum.
// Les montants et les activités du scénario fictif vivent dans performance-data.js.
export const LOCATIONS = [
  {name:'Aix-en-Provence',x:65,y:71}, {name:'Amiens',x:49,y:22},
  {name:'Angers',x:37,y:41}, {name:'Annecy',x:70,y:55},
  {name:'Bordeaux',x:34,y:62}, {name:'Brest',x:15,y:38},
  {name:'Caen',x:36,y:28}, {name:'Clermont-Ferrand',x:54,y:56},
  {name:'Dijon',x:62,y:44}, {name:'Grenoble',x:67,y:60},
  {name:'Le Havre',x:37,y:27}, {name:'Lille',x:53,y:16},
  {name:'Limoges',x:46,y:56}, {name:'Lyon',x:62,y:55},
  {name:'Marseille',x:65,y:75}, {name:'Metz',x:70,y:31},
  {name:'Montpellier',x:57,y:72}, {name:'Nantes',x:29,y:43},
  {name:'Nice',x:76,y:70}, {name:'Nîmes',x:61,y:70},
  {name:'Orléans',x:47,y:38}, {name:'Paris',x:49,y:30},
  {name:'Perpignan',x:55,y:81}, {name:'Poitiers',x:39,y:48},
  {name:'Reims',x:58,y:29}, {name:'Rennes',x:29,y:36},
  {name:'Rouen',x:43,y:27}, {name:'Saint-Étienne',x:59,y:58},
  {name:'Strasbourg',x:77,y:32}, {name:'Toulon',x:69,y:75},
  {name:'Toulouse',x:44,y:72}, {name:'Tours',x:41,y:42}
];

export const emptyOrganization = () => ({agencies:[],teams:[],units:[],people:[]});
export function normalizeOrganization(value) {
  const clean = emptyOrganization();
  for (const key of Object.keys(clean)) {
    clean[key] = Array.isArray(value?.[key])
      ? value[key].filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
      : [];
  }
  return clean;
}
export function activeOrganization(value) {
  const org=normalizeOrganization(value);
  org.agencies=org.agencies.filter(a=>!a.archivedAt);
  org.teams=org.teams.filter(t=>!t.archivedAt&&org.agencies.some(a=>a.id===t.agencyId));
  org.units=org.units.filter(u=>!u.archivedAt&&org.agencies.some(a=>a.id===u.agencyId));
  org.people=org.people.filter(p=>!p.archivedAt&&org.teams.some(t=>t.id===p.teamId));
  return org;
}

const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));
const counts = (org,city) => org.agencies.filter(a => a.city === city);
const noun=(count,label)=>`${count} ${label}${count>1?'s':''}`;
const agencyName = (org,id) => org.agencies.find(a => a.id === id)?.name || 'Agence supprimée';
const teamName = (org,id) => org.teams.find(t => t.id === id)?.name || 'Équipe supprimée';
const option = (name,value,selected) => `<option value="${safe(value)}" ${value===selected?'selected':''}>${safe(name)}</option>`;
const citySelect = selected => `<select name="city"><option value="">Choisir une ville</option>${LOCATIONS.map(c=>option(c.name,c.name,selected)).join('')}<option value="_other" ${selected&&!LOCATIONS.some(c=>c.name===selected)?'selected':''}>Autre commune…</option></select><input name="cityOther" maxlength="80" placeholder="Autre ville si absente" value="${selected&&!LOCATIONS.some(c=>c.name===selected)?safe(selected):''}" aria-label="Autre commune si absente de la liste">`;
const agencySelect = (org,selected) => `<select name="agencyId" required><option value="">Choisir une agence</option>${org.agencies.map(a=>option(`${a.name} · ${a.city}`,a.id,selected)).join('')}</select>`;
const teamSelect = (org,selected) => `<select name="teamId" required><option value="">Choisir une équipe</option>${org.teams.map(t=>option(`${t.name} · ${agencyName(org,t.agencyId)}`,t.id,selected)).join('')}</select>`;

function formCard(kind,title,fields,submit,disabled=false) {
  return `<form class="org-card org-form" data-org-form="${kind}"><div class="org-card-head"><span class="org-card-kicker">AJOUTER</span><h3>${title}</h3></div>${disabled?`<p class="org-prereq">${kind==='person'?'Créez d’abord une équipe.':'Créez d’abord une agence.'}</p>`:''}${fields}<button class="btn btn-primary" type="submit" ${disabled?'disabled':''}>${submit}</button></form>`;
}
const creationStep=(title,form,open=false)=>`<details class="org-form-step" name="org-create" ${open?'open':''}><summary>${title} →</summary>${form}</details>`;
const field = (label,input) => `<label class="org-field"><span>${label}</span>${input}</label>`;

const declaredCities=value=>[...new Map(String(value||'').split(/[,;]+/).map(name=>name.trim()).filter(Boolean).map(name=>[name.toLocaleLowerCase('fr'),name])).values()].slice(0,12);
const knownCity=name=>LOCATIONS.find(c=>c.name.localeCompare(name,'fr',{sensitivity:'base'})===0);
export function organizationMap(org,selectedCity,declaredLocations='') {
  org=activeOrganization(org);
  const cities = LOCATIONS.filter(c => counts(org,c.name).length);
  const unplaced=[...new Set(org.agencies.filter(a=>!LOCATIONS.some(c=>c.name===a.city)).map(a=>a.city))];
  const declared=declaredCities(declaredLocations).map(name=>({name:knownCity(name)?.name||name,location:knownCity(name)}));
  const pendingMarkers=declared.filter(item=>item.location&&!counts(org,item.name).length);
  return `<div class="france-canvas org-map" role="group" aria-label="Implantations déclarées et agences configurées sur la carte de France">
    ${cities.map(c=>`<button class="city-marker custom ${selectedCity===c.name?'active':''}" type="button" style="left:${c.x}%;top:${c.y}%;--marker-size:${Math.min(23,12+counts(org,c.name).length*3)}px" data-action="org-city" data-value="${safe(c.name)}" aria-label="${safe(c.name)}, ${noun(counts(org,c.name).length,'agence')} dans cette ville"><span class="city-dot"></span><span class="city-name">${safe(c.name)}</span></button>`).join('')}
    ${pendingMarkers.map(({name,location})=>`<button class="city-marker org-declared-marker ${selectedCity===name?'active':''}" type="button" style="left:${location.x}%;top:${location.y}%;--marker-size:13px" data-action="org-declared-city" data-value="${safe(name)}" aria-label="${safe(name)}, implantation déclarée à confirmer, aucune agence créée"><span class="city-dot"></span><span class="city-name">${safe(name)}</span></button>`).join('')}
    ${cities.length||pendingMarkers.length?'':`<div class="org-map-empty">${unplaced.length?'Vos agences sont listées sous la carte ; aucune position n’est inventée.':'Choisissez une ville pour placer votre première agence.'}</div>`}
  </div>${declared.length?`<div class="identity-locations" aria-label="Implantations déclarées dans le profil"><div class="identity-locations-head"><strong>Implantations déclarées</strong><small>À confirmer dans l’organisation</small></div><div class="identity-locations-list">${declared.map(({name,location})=>`<button type="button" class="identity-location-chip ${selectedCity===name?'active':''}" data-action="org-declared-city" data-value="${safe(name)}"><span>${safe(name)}</span><small>${counts(org,name).length?'Agence créée':location?'À confirmer sur la carte':'Ville à confirmer'}</small></button>`).join('')}</div><p>Aucune agence n’est créée automatiquement à partir de cette déclaration. Sélectionnez une ville pour préremplir son choix.</p></div>`:''}${unplaced.length?`<div class="org-unplaced"><strong>Villes à positionner sur la carte</strong><div>${unplaced.map(name=>`<button type="button" data-action="org-city" data-value="${safe(name)}">${safe(name)} · ${noun(counts(org,name).length,'agence')}</button>`).join('')}</div><small>Ces communes restent dans la liste et les filtres. Choisissez une ville connue pour placer l’agence sur la carte.</small></div>`:''}`;
}

function editPanel(org,editing,role) {
  if(!editing)return '';
  const collection={agency:'agencies',team:'teams',unit:'units',person:'people'}[editing.kind];
  const item=org[collection]?.find(x=>x.id===editing.id);
  if(!item||item.archivedAt||role==='sales'||(role==='manager'&&['agency','unit'].includes(editing.kind)))return '';
  let fields=field('Nom affiché',`<input name="name" maxlength="80" value="${safe(item.name)}" required>`);
  if(editing.kind==='agency')fields+=field('Ville',citySelect(item.city));
  if(editing.kind==='team'||editing.kind==='unit')fields+=field('Agence',agencySelect(org,item.agencyId));
  if(editing.kind==='person')fields+=field('Fonction',`<select name="role">${['Business Manager','Responsable d’agence','Talent Acquisition','Direction commerciale'].map(name=>option(name,name,item.role)).join('')}</select>`)+field('Équipe',teamSelect(org,item.teamId));
  return `<form class="glass card org-editor" data-org-edit="${editing.kind}" data-id="${safe(item.id)}"><div class="section-title"><div><h2>Modifier ${safe(item.name)}</h2><p>Les équipes et personnes liées restent rattachées à cet élément.</p></div><button type="button" class="text-button" data-action="org-cancel-edit">Annuler</button></div><div class="org-editor-fields">${fields}</div><button type="submit" class="btn btn-primary">Enregistrer</button></form>`;
}
function manageButtons(kind,item,allowed) {
  return allowed?`<div class="org-manage"><button type="button" class="text-button" data-action="org-edit" data-kind="${kind}" data-id="${safe(item.id)}">Modifier</button><button type="button" class="text-button" data-action="org-archive" data-kind="${kind}" data-id="${safe(item.id)}">Archiver</button></div>`:'';
}
function archiveList(raw,role) {
  const names={agency:'Agence',team:'Équipe',unit:'BU',person:'Personne'};
  const entries=Object.entries({agency:raw.agencies,team:raw.teams,unit:raw.units,person:raw.people})
    .flatMap(([kind,items])=>items.filter(item=>item.archivedAt).map(item=>({kind,item})));
  return entries.length?`<details class="glass progressive-panel org-archive"><summary><span><strong>Archives</strong><small>${noun(entries.length,'élément')} archivé${entries.length>1?'s':''} · liens conservés</small></span><span aria-hidden="true">⌄</span></summary><div class="progressive-panel-body"><p>Restaurer une agence réaffiche ses équipes encore actives.</p><div class="org-list">${entries.map(({kind,item})=>`<div class="org-row"><strong>${safe(item.name)}</strong><small>${names[kind]} · archivé</small>${role==='direction'||role==='manager'&&!['agency','unit'].includes(kind)?`<button type="button" class="text-button" data-action="org-restore" data-kind="${kind}" data-id="${safe(item.id)}">Restaurer</button>`:''}</div>`).join('')}</div></div></details>`:'';
}

export function organizationHub(org,{role='direction',city='all',agency='all',unit='all',editing=null,declaredLocations=''}={}) {
  const raw=normalizeOrganization(org);
  org=activeOrganization(raw);
  const admin=role==='direction', manager=admin||role==='manager';
  const current=city==='all'?org.agencies:counts(org,city);
  const currentAgency=agency==='all'?null:org.agencies.find(a=>a.id===agency);
  const shown=currentAgency?current.filter(a=>a.id===currentAgency.id):current;
  const teams=org.teams.filter(t=>shown.some(a=>a.id===t.agencyId));
  const availableUnits=org.units.filter(u=>shown.some(a=>a.id===u.agencyId));
  const units=unit==='all'?availableUnits:availableUnits.filter(u=>u.id===unit);
  const people=org.people.filter(p=>teams.some(t=>t.id===p.teamId));
  const nextStep=admin?(!org.agencies.length?'agency':!org.teams.length?'team':!org.units.length?'unit':!org.people.length?'person':''):!org.teams.length?'team':!org.people.length?'person':'';
  const additional=[...new Set([...org.agencies.map(a=>a.city),...declaredCities(declaredLocations)])].filter(name=>!knownCity(name)).sort((a,b)=>a.localeCompare(b,'fr'));
  const cityOptions=`<option value="all">Toutes les villes</option>${[...LOCATIONS.map(c=>c.name),...additional].map(name=>option(name,name,city)).join('')}`;
  return `<div class="org-setup">
    <div class="territory-hero glass"><div class="territory-copy"><div class="eyebrow">TERRITOIRES · VOTRE ORGANISATION</div><h2>${admin?'Placez vos agences sur la carte.':'Parcourez les implantations de votre ESN.'}</h2><p>${admin?'Agence → équipe → personne ou BU.':'Les implantations déclarées sont à confirmer par un administrateur ; les agences créées restent séparées.'}</p><div class="org-actions"><span>${org.agencies.length} agence${org.agencies.length>1?'s':''} · ${org.teams.length} équipe${org.teams.length>1?'s':''} · ${org.people.length} personne${org.people.length>1?'s':''}</span></div></div><div class="territory-map">${organizationMap(org,city,declaredLocations)}</div></div>
    <div class="org-grid"><section class="glass card org-directory"><div class="section-title"><div><h2>Agences & équipes</h2><p>Choisissez une ville, une agence et éventuellement une BU pour lire son périmètre.</p></div></div><div class="org-filters">${field('Ville',`<select data-change="org-city">${cityOptions}</select>`)}${field('Agence',`<select data-change="org-agency"><option value="all">Toutes les agences</option>${current.map(a=>option(a.name,a.id,agency)).join('')}</select>`)}${field('BU',`<select data-change="org-unit"><option value="all">Toutes les BU</option>${availableUnits.map(u=>option(u.name,u.id,unit)).join('')}</select>`)}</div>
    ${shown.length?`<div class="org-list">${shown.map(a=>`<article class="org-card org-agency"><div class="org-card-head"><span class="org-card-kicker">AGENCE · ${safe(a.city)}</span><h3>${safe(a.name)}</h3></div><div class="org-card-counts"><span>${noun(org.teams.filter(t=>t.agencyId===a.id).length,'équipe')}</span><span>${org.units.filter(u=>u.agencyId===a.id).length} BU</span><span>${noun(org.people.filter(p=>org.teams.some(t=>t.agencyId===a.id&&t.id===p.teamId)).length,'personne')}</span></div><button type="button" class="text-button" data-action="org-agency" data-id="${safe(a.id)}">Voir le périmètre →</button>${manageButtons('agency',a,admin)}</article>`).join('')}</div>`:`<div class="org-empty"><strong>${org.agencies.length?'Aucune agence dans ce filtre.':'Votre carte démarre ici.'}</strong><p>${org.agencies.length?(admin?'Choisissez une autre ville ou créez une agence.':'Choisissez une autre ville pour parcourir les agences existantes.'):(admin?'Donnez un nom à votre première agence et choisissez sa ville. Elle apparaîtra sur la carte.':'Aucune agence n’a été créée. Les implantations déclarées ci-dessus restent à confirmer par la direction.')}</p></div>`}</section>
    <section class="glass card org-directory"><div class="section-title"><div><h2>${currentAgency?safe(currentAgency.name):city==='all'?'Périmètre sélectionné':safe(city)}</h2><p>Agences, équipes et personnes du périmètre sélectionné.</p></div></div>${shown.length?`<div class="org-structure"><div><span class="org-card-kicker">ÉQUIPES</span>${teams.length?teams.map(t=>`<div class="org-row"><strong>${safe(t.name)}</strong><small>${safe(agencyName(org,t.agencyId))}</small>${manageButtons('team',t,manager)}</div>`).join(''):'<p class="org-empty-inline">Aucune équipe créée.</p>'}</div><div><span class="org-card-kicker">PERSONNES</span>${people.length?people.map(p=>`<div class="org-row"><strong>${safe(p.name)}</strong><small>${safe(p.role)} · ${safe(teamName(org,p.teamId))}</small>${manageButtons('person',p,manager)}</div>`).join(''):'<p class="org-empty-inline">Aucune personne ajoutée.</p>'}</div><div><span class="org-card-kicker">BUSINESS UNITS</span>${units.length?units.map(u=>`<div class="org-row"><strong>${safe(u.name)}</strong><small>${safe(agencyName(org,u.agencyId))}</small>${manageButtons('unit',u,admin)}</div>`).join(''):'<p class="org-empty-inline">Aucune BU créée.</p>'}</div></div>`:'<div class="org-empty"><strong>Choisissez une agence.</strong><p>Les équipes, personnes et BU de ce territoire s’afficheront ici.</p></div>'}</section></div>
    ${editPanel(org,editing,role)}${archiveList(raw,role)}
    ${manager?`<details class="glass progressive-panel org-creation" ${nextStep?'open':''}><summary><span><strong>Construire le périmètre</strong><small>Ajouter une agence, une équipe, une BU ou une personne</small></span><span aria-hidden="true">⌄</span></summary><div class="progressive-panel-body"><p>Ajoutez les personnes à leur équipe. Aucun accès n’est envoyé automatiquement.</p><div class="org-form-grid">
      ${admin?creationStep('Agence',formCard('agency','Une agence',field('Nom de l’agence','<input name="name" maxlength="80" required placeholder="Ex. Paris Conseil">')+field('Ville',citySelect(city==='all'?'':city)),'Créer l’agence'),nextStep==='agency'):''}
      ${manager?creationStep('Équipe',formCard('team','Une équipe',field('Nom de l’équipe','<input name="name" maxlength="80" required placeholder="Ex. Équipe Finance">')+field('Agence',agencySelect(org)),'Créer l’équipe',!org.agencies.length),nextStep==='team'):''}
      ${admin?creationStep('Business unit',formCard('unit','Une business unit',field('Nom de la BU','<input name="name" maxlength="80" required placeholder="Ex. Data & IA">')+field('Agence',agencySelect(org)),'Créer la BU',!org.agencies.length),nextStep==='unit'):''}
      ${manager?creationStep('Personne',formCard('person','Une personne',field('Nom affiché','<input name="name" maxlength="80" required placeholder="Ex. Camille Martin">')+field('Fonction',`<select name="role" required><option value="Business Manager">Business Manager</option><option value="Responsable d’agence">Responsable d’agence</option><option value="Talent Acquisition">Talent Acquisition</option><option value="Direction commerciale">Direction commerciale</option></select>`)+field('Équipe',teamSelect(org)),'Ajouter la personne',!org.teams.length),nextStep==='person'):''}
    </div></div></details>`:''}
  </div>`;
}

export function organizationOverview(org,{role='direction',city='all'}={}) {
  org=activeOrganization(org);
  const agencies=city==='all'?org.agencies:counts(org,city);
  const teams=org.teams.filter(t=>agencies.some(a=>a.id===t.agencyId));
  const people=org.people.filter(p=>teams.some(t=>t.id===p.teamId));
  return `<section class="glass card org-overview"><div class="section-title"><div><h2>Votre périmètre</h2><p>${org.agencies.length?'Agences et équipes configurées.':'Aucune agence configurée pour le moment.'}</p></div><button type="button" class="text-button" data-action="org-open-map">Carte de France & agences →</button></div><div class="org-card-counts"><span>${noun(agencies.length,'agence')}</span><span>${noun(teams.length,'équipe')}</span><span>${noun(people.length,'personne')}</span></div><p class="panel-footnote">Les personnes ajoutées ici ne reçoivent pas d’accès automatiquement.</p></section>`;
}

export function createOrganizationItem(org,kind,form,role) {
  org=normalizeOrganization(org);
  const name=String(form.get('name')||'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>80) return {error:'Saisissez un nom de 2 à 80 caractères.'};
  const id=(globalThis.crypto?.randomUUID?.()||`local-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const duplicate=(list,parent,reference)=>list.some(item=>!item.archivedAt&&item.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr') && (!parent||item[parent]===reference));
  if(kind==='agency'&&role==='direction') {
    const chosen=String(form.get('city')||'');
    const city=chosen==='_other'?String(form.get('cityOther')||'').trim().replace(/\s+/g,' '):chosen;
    if(city.length<2||city.length>80||city==='_other') return {error:'Choisissez une ville ou saisissez une autre commune.'};
    if(duplicate(org.agencies,'city',city)) return {error:'Une agence porte déjà ce nom dans cette ville.'};
    org.agencies.push({id,name,city});
    return {org,city,agency:id,message:`Agence ${name} créée à ${city}.`};
  }
  if(kind==='team'&&(role==='direction'||role==='manager')) {
    const agencyId=String(form.get('agencyId')||'');
    if(!org.agencies.some(a=>a.id===agencyId&&!a.archivedAt)) return {error:'Choisissez une agence active.'};
    if(duplicate(org.teams,'agencyId',agencyId)) return {error:'Une équipe porte déjà ce nom dans cette agence.'};
    org.teams.push({id,name,agencyId});
    return {org,agency:agencyId,message:`Équipe ${name} ajoutée à ${agencyName(org,agencyId)}.`};
  }
  if(kind==='unit'&&role==='direction') {
    const agencyId=String(form.get('agencyId')||'');
    if(!org.agencies.some(a=>a.id===agencyId&&!a.archivedAt)) return {error:'Choisissez une agence active.'};
    if(duplicate(org.units,'agencyId',agencyId)) return {error:'Une BU porte déjà ce nom dans cette agence.'};
    org.units.push({id,name,agencyId});
    return {org,agency:agencyId,message:`BU ${name} ajoutée à ${agencyName(org,agencyId)}.`};
  }
  if(kind==='person'&&(role==='direction'||role==='manager')) {
    const teamId=String(form.get('teamId')||'');
    if(!activeOrganization(org).teams.some(t=>t.id===teamId)) return {error:'Choisissez une équipe active.'};
    if(duplicate(org.people,'teamId',teamId)) return {error:'Cette personne figure déjà dans l’équipe.'};
    const position=String(form.get('role')||'Business Manager');
    if(!['Business Manager','Responsable d’agence','Talent Acquisition','Direction commerciale'].includes(position)) return {error:'Choisissez une fonction valide.'};
    org.people.push({id,name,teamId,role:position});
    return {org,message:`${name} ajouté à l’équipe ${teamName(org,teamId)}. Aucun accès envoyé.`};
  }
  return {error:'Ce rôle ne peut pas modifier cet objet.'};
}

const collectionForKind={agency:'agencies',team:'teams',unit:'units',person:'people'};
const canManage=(kind,role)=>role==='direction'||role==='manager'&&['team','person'].includes(kind);
export function archiveOrganizationItem(value,kind,id,role,restore=false) {
  const org=normalizeOrganization(value),collection=collectionForKind[kind];
  const item=org[collection]?.find(x=>x.id===id);
  if(!item||!canManage(kind,role))return {error:'Objet introuvable ou droit insuffisant.'};
  if(restore){
    if(['team','unit'].includes(kind)&&!org.agencies.some(a=>a.id===item.agencyId&&!a.archivedAt))return {error:'Restaurez d’abord l’agence liée.'};
    if(kind==='person'&&!activeOrganization(org).teams.some(t=>t.id===item.teamId))return {error:'Restaurez d’abord l’équipe et son agence.'};
    delete item.archivedAt;
  }
  else item.archivedAt=new Date().toISOString();
  return {org,message:`${item.name} ${restore?'restauré':'archivé'} dans cet espace. ${kind==='agency'&&!restore?'Ses équipes liées sont masquées jusqu’à restauration.':''}`};
}
export function updateOrganizationItem(value,kind,id,form,role) {
  const org=normalizeOrganization(value),collection=collectionForKind[kind];
  const item=org[collection]?.find(x=>x.id===id);
  if(!item||item.archivedAt||!canManage(kind,role))return {error:'Objet introuvable ou droit insuffisant.'};
  const name=String(form.get('name')||'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>80)return {error:'Saisissez un nom de 2 à 80 caractères.'};
  const active=activeOrganization(org);
  let parent='',reference='',position='';
  if(kind==='agency'){
    const chosen=String(form.get('city')||'');
    reference=chosen==='_other'?String(form.get('cityOther')||'').trim().replace(/\s+/g,' '):chosen;
    if(reference.length<2||reference.length>80)return {error:'Choisissez une ville ou saisissez une autre commune.'};
    parent='city';
  }
  if(kind==='team'||kind==='unit'){
    parent='agencyId';reference=String(form.get('agencyId')||'');
    if(!active.agencies.some(a=>a.id===reference))return {error:'Choisissez une agence active.'};
  }
  if(kind==='person'){
    parent='teamId';reference=String(form.get('teamId')||'');
    if(!active.teams.some(t=>t.id===reference))return {error:'Choisissez une équipe active.'};
    position=String(form.get('role')||'');
    if(!['Business Manager','Responsable d’agence','Talent Acquisition','Direction commerciale'].includes(position))return {error:'Choisissez une fonction valide.'};
  }
  if(active[collection].some(other=>other.id!==id&&other.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr')&&(!parent||other[parent]===reference)))return {error:'Ce nom est déjà utilisé dans ce périmètre.'};
  item.name=name;
  if(parent)item[parent]=reference;
  if(kind==='person')item.role=position;
  return {org,city:kind==='agency'?reference:undefined,agency:['team','unit'].includes(kind)?reference:undefined,message:`${name} mis à jour.`};
}
