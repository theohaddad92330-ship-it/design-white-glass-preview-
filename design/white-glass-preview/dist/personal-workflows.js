import {activeOrganization} from './organization.js';

// Espace de travail local de l'aperçu : uniquement les faits saisis par la personne.
// Aucune donnée du scénario fictif et aucun envoi vers le produit Bellum.
export const emptyWorkflow = () => ({goals:[],actions:[],meetings:[],invoices:[],touches:[]});

export function normalizeWorkflow(value) {
  const result=emptyWorkflow();
  for(const key of Object.keys(result)) {
    result[key]=Array.isArray(value?.[key])
      ? value[key].filter(item=>item&&typeof item.id==='string'&&typeof item.title==='string')
      : [];
  }
  return result;
}

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const formatDate=value=>value?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`)):'Date à définir';
const amount=value=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);
const field=(label,input)=>`<label class="pw-field"><span>${label}</span>${input}</label>`;
const uid=()=>globalThis.crypto?.randomUUID?.()||`local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const validDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const ms=Date.parse(`${value}T12:00:00Z`);return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value};
const formValue=(form,key)=>String(form.get(key)||'').trim();
const PERIOD_LABELS={week:'Cette semaine',month:'Ce mois',quarter:'Ce trimestre',semester:'Ce semestre'};
const GOAL_LABELS={actions:'Actions terminées',meetings:'Rendez-vous tenus',starts:'Démarrages déclarés',email:'E-mails déclarés',linkedin:'Approches LinkedIn déclarées'};
export const periodLabel=period=>PERIOD_LABELS[period]||PERIOD_LABELS.month;
export function periodKey(date,period){
  if(!validDate(date))return '';
  if(period==='month')return date.slice(0,7);
  const d=new Date(`${date}T12:00:00Z`),year=d.getUTCFullYear(),month=d.getUTCMonth();
  if(period==='quarter')return `${year}-T${Math.floor(month/3)+1}`;
  if(period==='semester')return `${year}-S${Math.floor(month/6)+1}`;
  const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return monday.toISOString().slice(0,10);
}
const inPeriod=(date,period,today=dateToday())=>Boolean(date&&periodKey(date,period)&&periodKey(date,period)===periodKey(today,period));

function agencyOptions(org){return `<option value="">Sans agence</option>${activeOrganization(org).agencies.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.city)}</option>`).join('')}`}
function unitOptions(org){return `<option value="">BU non renseignée</option>${activeOrganization(org).units.map(u=>`<option value="${esc(u.id)}">${esc(u.name)} · ${esc(agencyName(org,u.agencyId))}</option>`).join('')}`}
function personOptions(org){return `<option value="">À attribuer</option>${activeOrganization(org).people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}`}
function agencyName(org,id){return (org?.agencies||[]).find(a=>a.id===id)?.name||'Sans agence'}
function personName(org,id){return (org?.people||[]).find(p=>p.id===id)?.name||'À attribuer'}
function tag(org,item){return `<span class="pw-scope">${esc(agencyName(org,item.agencyId))}</span>`}
function statusButton(kind,id,done,label){return `<button type="button" class="pw-status ${done?'is-done':''}" data-action="pw-status" data-kind="${kind}" data-id="${esc(id)}" aria-label="${esc(label)}">${done?'✓':'○'} <span>${esc(label)}</span></button>`}

function actionForm(org){return `<form class="pw-form" data-pw-form="action"><div class="pw-form-heading"><strong>Ajouter une action</strong><small>Une tâche datée, visible dans votre journée.</small></div><div class="pw-form-grid">${field('Action','<input name="title" maxlength="120" required placeholder="Ex. Relancer le compte Atlas">')}${field('Échéance',`<input name="due" type="date" required value="${dateToday()}">`)}${field('Agence',`<select name="agencyId">${agencyOptions(org)}</select>`)}${field('BU',`<select name="unitId">${unitOptions(org)}</select>`)}${field('Responsable',`<select name="ownerId">${personOptions(org)}</select>`)}</div><button class="btn btn-primary" type="submit">Ajouter l’action</button></form>`}
function meetingForm(org){return `<form class="pw-form" data-pw-form="meeting"><div class="pw-form-heading"><strong>Ajouter un rendez-vous</strong><small>Déclaration manuelle, sans synchronisation d’agenda.</small></div><div class="pw-form-grid">${field('Objet','<input name="title" maxlength="120" required placeholder="Ex. Découverte avec Atlas">')}${field('Date',`<input name="date" type="date" required value="${dateToday()}">`)}${field('Heure','<input name="time" type="time" required value="09:00">')}${field('Agence',`<select name="agencyId">${agencyOptions(org)}</select>`)}${field('BU',`<select name="unitId">${unitOptions(org)}</select>`)}${field('Responsable',`<select name="ownerId">${personOptions(org)}</select>`)}</div><button class="btn btn-primary" type="submit">Ajouter le rendez-vous</button></form>`}
function goalForm(org,role='sales'){
  const people=activeOrganization(org).people;
  const scopeOptions=role==='direction'?'<option value="global">Groupe · activités consignées</option><option value="individual">Une personne de l’équipe</option>':'<option value="workspace">Mon espace · saisies visibles</option>';
  return `<form class="pw-form" data-pw-form="goal"><div class="pw-form-heading"><strong>Fixer un cap</strong><small>${role==='direction'?'Cap du groupe ou d’une personne.':'Votre cap personnel.'} Réalisé = activités consignées ici.</small></div><div class="pw-form-grid">${field('Mesure','<select name="metric" required><option value="actions">Actions terminées</option><option value="meetings">Rendez-vous tenus</option><option value="starts">Démarrages déclarés</option><option value="email">E-mails déclarés</option><option value="linkedin">Approches LinkedIn déclarées</option></select>')}${field('Période',`<select class="pw-period-select" name="period" required>${Object.entries(PERIOD_LABELS).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select>`)}${field('Cible','<input name="target" type="number" min="1" max="100000" required placeholder="Ex. 8">')}${field('Périmètre',`<select class="pw-goal-scope" name="goalScope" required>${scopeOptions}</select>`)}${role==='direction'?field('Personne si cap individuel',`<select name="ownerId"><option value="">Choisir une personne</option>${people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`):''}</div><button class="btn btn-primary" type="submit">Enregistrer le cap</button></form>`;
}
function touchForm(org){return `<form class="pw-form" data-pw-form="touch"><div class="pw-form-heading"><strong>Consigner une prospection</strong><small>E-mail et LinkedIn restent deux canaux distincts. Saisie manuelle, aucun message envoyé.</small></div><div class="pw-form-grid">${field('Canal','<select name="channel" required><option value="email">E-mail</option><option value="linkedin">LinkedIn</option></select>')}${field('Compte ou séquence','<input name="title" maxlength="120" required placeholder="Ex. Première approche Atlas">')}${field('Date',`<input name="date" type="date" required value="${dateToday()}">`)}${field('Nombre déclaré','<input name="count" type="number" min="1" max="1000" value="1" required>')}${field('Agence',`<select name="agencyId">${agencyOptions(org)}</select>`)}${field('BU',`<select name="unitId">${unitOptions(org)}</select>`)}${field('Responsable',`<select name="ownerId">${personOptions(org)}</select>`)}</div><button class="btn btn-primary" type="submit">Consigner le geste</button></form>`}
function invoiceForm(org){return `<form class="pw-form" data-pw-form="invoice"><div class="pw-form-heading"><strong>Suivre une échéance</strong><small>Rappel saisi ici, sans lecture comptable ni relance envoyée.</small></div><div class="pw-form-grid">${field('Client ou référence','<input name="title" maxlength="120" required placeholder="Ex. Facture Atlas 11/2026">')}${field('Montant (€)','<input name="amount" type="number" min="0.01" max="100000000" step="0.01" required>')}${field('Échéance',`<input name="due" type="date" required value="${dateToday()}">`)}${field('Agence',`<select name="agencyId">${agencyOptions(org)}</select>`)}</div><button class="btn btn-primary" type="submit">Suivre cette échéance</button></form>`}

/** Les dates et les agences ne viennent que des champs locaux, jamais des fixtures. */
export function createPersonalItem(value,kind,form,org,role='sales'){
  const workflow=normalizeWorkflow(value),title=formValue(form,'title');
  const agencyId=formValue(form,'agencyId'),unitId=formValue(form,'unitId'),ownerId=formValue(form,'ownerId');
  const active=activeOrganization(org);
  if(agencyId&&!active.agencies.some(a=>a.id===agencyId))return {error:'Choisissez une agence existante.'};
  if(ownerId&&!active.people.some(p=>p.id===ownerId))return {error:'Choisissez une personne existante.'};
  const unit=unitId?active.units.find(u=>u.id===unitId):null;
  if(unitId&&!unit)return {error:'Choisissez une BU existante.'};
  if(unit&&agencyId&&unit.agencyId!==agencyId)return {error:'La BU choisie n’appartient pas à cette agence.'};
  const effectiveAgency=agencyId||unit?.agencyId||null;
  const person=ownerId?active.people.find(p=>p.id===ownerId):null;
  if(person&&effectiveAgency&&active.teams.find(t=>t.id===person.teamId)?.agencyId!==effectiveAgency)return {error:'La personne choisie ne dépend pas de cette agence.'};
  const common={id:uid(),agencyId:effectiveAgency,unitId:unitId||null,ownerId:ownerId||null,createdAt:dateToday()};
  if(kind==='action'||kind==='meeting'||kind==='invoice'||kind==='touch'){
    if(title.length<2||title.length>120)return {error:'Saisissez un intitulé de 2 à 120 caractères.'};
  }
  if(kind==='action'){
    const due=formValue(form,'due');if(!validDate(due))return {error:'Choisissez une échéance valide.'};
    workflow.actions.push({...common,title,due,status:'open',completedAt:null});
    return {workflow,message:'Action ajoutée dans votre espace local.'};
  }
  if(kind==='meeting'){
    const date=formValue(form,'date'),time=formValue(form,'time');
    if(!validDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return {error:'Choisissez une date et une heure valides.'};
    workflow.meetings.push({...common,title,date,time,status:'planned'});
    return {workflow,message:'Rendez-vous ajouté à votre agenda local.'};
  }
  if(kind==='invoice'){
    const due=formValue(form,'due'),n=Number(formValue(form,'amount'));
    if(!validDate(due)||!Number.isFinite(n)||n<=0||n>100000000)return {error:'Saisissez une échéance et un montant valides.'};
    workflow.invoices.push({...common,title,due,amount:Math.round(n*100)/100,status:'unpaid'});
    return {workflow,message:'Échéance enregistrée sans relance envoyée.'};
  }
  if(kind==='touch'){
    const date=formValue(form,'date'),channel=formValue(form,'channel'),count=Number(formValue(form,'count'));
    if(!validDate(date)||!['email','linkedin'].includes(channel)||!Number.isInteger(count)||count<1||count>1000)return {error:'Choisissez un canal, une date et un volume valide.'};
    workflow.touches.push({...common,title,date,channel,count});
    return {workflow,message:`Volume consigné : ${count} ${channel==='email'?`e-mail${count>1?'s':''}`:`approche${count>1?'s':''} LinkedIn`}. Aucun message envoyé.`};
  }
  if(kind==='goal'||kind==='goal-edit'){
    const metric=formValue(form,'metric'),period=formValue(form,'period'),target=Number(formValue(form,'target')),goalScope=formValue(form,'goalScope')||'workspace';
    if(!Object.hasOwn(GOAL_LABELS,metric)||!Object.hasOwn(PERIOD_LABELS,period)||!Number.isInteger(target)||target<1||target>100000)return {error:'Choisissez une mesure, une période et une cible valides.'};
    if(!['workspace','global','individual'].includes(goalScope)||goalScope!=='workspace'&&role!=='direction')return {error:'Ce périmètre d’objectif exige le rôle direction.'};
    if(goalScope==='individual'&&!ownerId)return {error:'Choisissez la personne qui porte cet objectif.'};
    const goal=kind==='goal-edit'?workflow.goals.find(g=>g.id===formValue(form,'id')):null;
    if(kind==='goal-edit'&&(!goal||goal.onboardingOrigin==='local-profile'||role!=='direction'&&goal.goalScope!=='workspace'))return {error:'Cet objectif doit être modifié depuis le profil ou par la direction.'};
    const effectiveOwner=goalScope==='individual'?ownerId:null;
    const collision=workflow.goals.some(g=>g!==goal&&g.metric===metric&&g.period===period&&g.goalScope===goalScope&&(goalScope!=='individual'||g.ownerId===effectiveOwner));
    if(collision)return {error:'Un objectif existe déjà pour cette mesure, cette période et ce périmètre. Modifiez le cap existant.'};
    const next={title:GOAL_LABELS[metric],metric,period,target,goalScope,ownerId:effectiveOwner,agencyId:goalScope==='individual'?(active.teams.find(t=>t.id===active.people.find(p=>p.id===ownerId)?.teamId)?.agencyId||null):null};
    if(kind==='goal-edit'){
      const before=Object.fromEntries(Object.keys(next).map(key=>[key,goal[key]??null]));
      if(Object.keys(next).every(key=>before[key]===next[key]))return {error:'Aucun changement à enregistrer.'};
      const changes=[...(goal.revisions||[]),{at:new Date().toISOString(),byRole:role,previous:before,next:{...next}}].slice(-20);
      if(['metric','period','goalScope','ownerId'].some(key=>before[key]!==next[key])){goal.manualActual=null;goal.manualActualPeriod=null}
      Object.assign(goal,next,{revisions:changes,updatedAt:changes.at(-1).at});
      workflow.goals=workflow.goals.filter(g=>g!==goal).concat(goal);
      return {workflow,message:'Objectif mis à jour. Historique conservé.'};
    }
    workflow.goals.push({...common,...next,manualActual:null,manualActualPeriod:null,source:'Objectif déclaré'});
    return {workflow,message:'Objectif déclaré. Le réalisé reste non mesuré tant qu’aucune donnée n’est saisie.'};
  }
  if(kind==='goal-progress'){
    const id=formValue(form,'id'),actual=Number(formValue(form,'actual'));
    const goal=workflow.goals.find(g=>g.id===id&&g.metric==='starts');
    if(!goal||!Number.isInteger(actual)||actual<0||actual>100000)return {error:'Saisissez un nombre de démarrages valide.'};
    if(goal.goalScope!=='workspace'&&role!=='direction')return {error:'La direction valide le réalisé des objectifs du groupe et des personnes.'};
    goal.manualActual=actual;goal.manualActualPeriod=periodKey(dateToday(),goal.period);
    return {workflow,message:'Démarrages mis à jour à partir de votre déclaration.'};
  }
  return {error:'Cette saisie n’est pas disponible.'};
}

export function togglePersonalItem(value,kind,id){
  const workflow=normalizeWorkflow(value);
  const key={action:'actions',meeting:'meetings',invoice:'invoices'}[kind];
  const item=key&&workflow[key].find(x=>x.id===id);
  if(!item)return {error:'Cet élément est introuvable.'};
  if(kind==='action'){
    item.status=item.status==='done'?'open':'done';item.completedAt=item.status==='done'?dateToday():null;
  }else if(kind==='meeting'){item.status=item.status==='held'?'planned':'held';item.heldAt=item.status==='held'?dateToday():null}
  else item.status=item.status==='paid'?'unpaid':'paid';
  return {workflow,message:kind==='invoice'?'Statut déclaré manuellement, sans vérification comptable.':'Statut mis à jour dans votre espace local.'};
}

export function goalActual(workflow,goal,today=dateToday()){
  if(goal.metric==='starts')return goal.manualActualPeriod===periodKey(today,goal.period)||!goal.manualActualPeriod&&inPeriod(goal.createdAt,goal.period,today)?goal.manualActual??null:null;
  const match=item=>(!goal.agencyId||item.agencyId===goal.agencyId)&&(!goal.ownerId||item.ownerId===goal.ownerId);
  if(goal.metric==='actions'){
    const scoped=workflow.actions.filter(a=>match(a)&&(inPeriod(a.due,goal.period,today)||inPeriod(a.completedAt,goal.period,today)));
    return scoped.length?scoped.filter(a=>a.status==='done'&&inPeriod(a.completedAt,goal.period,today)).length:null;
  }
  if(goal.metric==='meetings'){
    const scoped=workflow.meetings.filter(m=>match(m)&&inPeriod(m.date,goal.period,today));
    return scoped.length?scoped.filter(m=>m.status==='held'&&inPeriod(m.date,goal.period,today)).length:null;
  }
  if(goal.metric==='email'||goal.metric==='linkedin'){
    const scoped=workflow.touches.filter(t=>match(t)&&t.channel===goal.metric&&inPeriod(t.date,goal.period,today));
    return scoped.length?scoped.reduce((sum,t)=>sum+t.count,0):null;
  }
  return null;
}

export function effectivePersonGoals(value,personId){
  const workflow=normalizeWorkflow(value),goals=workflow.goals.filter(g=>g.goalScope==='global'||g.goalScope==='individual'&&g.ownerId===personId);
  const axes=[...new Set(goals.map(g=>`${g.metric}:${g.period}`))];
  return axes.map(axis=>{
    const [metric,period]=axis.split(':'),individual=goals.filter(g=>g.goalScope==='individual'&&g.ownerId===personId&&g.metric===metric&&g.period===period).at(-1),global=goals.filter(g=>g.goalScope==='global'&&g.metric===metric&&g.period===period).at(-1),goal=individual||global;
    return {goal,source:individual?'Surcharge individuelle':'Cap groupe hérité',actual:goal.metric==='starts'&&!individual?null:goalActual(workflow,{...goal,ownerId:personId,agencyId:individual?.agencyId||null})};
  });
}

function goalsPanel(workflow,org,role='sales'){
  return `<section class="glass card pw-panel"><div class="section-title"><div><h2>Vos objectifs déclarés</h2><p>Période, périmètre et source de chaque mesure.</p></div></div>${workflow.goals.length?`<div class="pw-goals">${workflow.goals.map(g=>{
    const actual=goalActual(workflow,g),progress=actual===null?null:Math.min(100,Math.round(actual/g.target*100));
    const scope=g.goalScope==='individual'?`Individuel · ${personName(org,g.ownerId)}`:g.goalScope==='global'?'Groupe · réalisé partiel':g.agencyId?agencyName(org,g.agencyId):'Mon espace';
    return `<article class="pw-goal"><div class="pw-goal-top"><div><strong>${esc(g.title)}</strong><small>${periodLabel(g.period)} · ${esc(scope)}</small></div><b>${actual===null?`Réalisé inconnu · cible ${g.target}`:`${actual} / ${g.target}`}</b></div>${progress===null?'':`<div class="pw-goal-track" role="meter" aria-label="${esc(g.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>`}<small>${g.metric==='starts'?'Source : réalisé déclaré':'Source : actions datées consignées ici'}</small>${g.metric==='starts'&&(role==='direction'||(g.goalScope||'workspace')==='workspace')?`<form class="pw-inline-form" data-pw-form="goal-progress"><input type="hidden" name="id" value="${esc(g.id)}"><label>Réalisé déclaré <input name="actual" type="number" min="0" max="100000" required value="${goalActual(workflow,g)===null?'':g.manualActual??''}"></label><button type="submit">Mettre à jour</button></form>`:''}</article>`
  }).join('')}</div>`:'<div class="pw-empty"><strong>Fixez votre premier cap.</strong><p>Aucun objectif n’est présumé pour votre équipe.</p></div>'}</section>`;
}
function goalEditPanel(workflow,org,role){
  const people=activeOrganization(org).people;
  return `<div class="pw-goals">${workflow.goals.map(g=>{
    const scope=g.goalScope||'workspace',owner=people.find(p=>p.id===g.ownerId);
    const scopeOptions=role==='direction'?[['workspace','Mon espace'],['global','Groupe'],['individual','Personne']]:[['workspace','Mon espace']];
    const revisions=Array.isArray(g.revisions)?g.revisions:[];
    return `<details class="pw-goal goal-edit-item"><summary><span><strong>${esc(g.title)}</strong><small>${periodLabel(g.period)} · ${scope==='individual'?`Individuel · ${esc(owner?.name||'personne indisponible')}`:scope==='global'?'Groupe':'Mon espace'} · cible ${g.target}</small></span><span aria-hidden="true">⌄</span></summary><div id="local-goal-${esc(g.id)}">${g.onboardingOrigin==='local-profile'?`<p class="body-copy">Ce cap vient du profil local. Modifiez la cible et la période dans votre profil pour garder les réponses cohérentes.</p><button class="text-button" type="button" data-action="profile-edit">Modifier mon profil →</button>`:role!=='direction'&&scope!=='workspace'?'<p class="body-copy">La direction modifie les objectifs du groupe et des personnes.</p>':`<form class="pw-form" data-pw-form="goal-edit"><input type="hidden" name="id" value="${esc(g.id)}"><div class="pw-form-grid">${field('Mesure',`<select name="metric" required>${Object.entries(GOAL_LABELS).map(([id,label])=>`<option value="${id}" ${g.metric===id?'selected':''}>${label}</option>`).join('')}</select>`)}${field('Période',`<select name="period" required>${Object.entries(PERIOD_LABELS).map(([id,label])=>`<option value="${id}" ${g.period===id?'selected':''}>${label}</option>`).join('')}</select>`)}${field('Cible',`<input name="target" type="number" min="1" max="100000" required value="${g.target}">`)}${field('Périmètre',`<select name="goalScope" required>${scopeOptions.map(([id,label])=>`<option value="${id}" ${scope===id?'selected':''}>${label}</option>`).join('')}</select>`)}${role==='direction'?field('Personne si objectif individuel',`<select name="ownerId"><option value="">Choisir une personne</option>${people.map(p=>`<option value="${esc(p.id)}" ${g.ownerId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`):''}</div><button class="btn btn-primary" type="submit">Enregistrer les modifications</button></form>`}<p class="panel-footnote">Source initiale : ${esc(g.source||'Saisie manuelle')} · créé le ${esc(g.createdAt||'date non renseignée')}. ${revisions.length?`${revisions.length} modification(s) ; dernière le ${esc(formatDate(g.updatedAt?.slice(0,10)))}.`:'Aucune modification enregistrée.'}</p>${revisions.length?`<details class="progressive-list"><summary>Voir l’historique des cibles →</summary><div class="progressive-list-body">${revisions.map(r=>`<p class="panel-footnote">${esc(formatDate(r.at?.slice(0,10)))} · ${esc(r.byRole)} · ${esc(r.previous?.target)} → ${esc(r.next?.target)} · ${esc(periodLabel(r.previous?.period))} → ${esc(periodLabel(r.next?.period))} · ${esc(r.previous?.goalScope||'workspace')} → ${esc(r.next?.goalScope||'workspace')}</p>`).join('')}</div></details>`:''}</div></details>`;
  }).join('')}</div>`;
}
const progressive=(title,copy,content,open=false)=>`<details class="glass progressive-panel" ${open?'open':''}><summary><span><strong>${title}</strong><small>${copy}</small></span><span aria-hidden="true">⌄</span></summary><div class="progressive-panel-body">${content}</div></details>`;
const rowsWithMore=(items,render,limit=5,label='éléments')=>`${items.slice(0,limit).map(render).join('')}${items.length>limit?`<details class="progressive-list"><summary>Voir les ${items.length-limit} autres ${label} →</summary><div class="progressive-list-body">${items.slice(limit).map(render).join('')}</div></details>`:''}`;
function actionsPanel(workflow,org){
  const sorted=[...workflow.actions].sort((a,b)=>Number(a.status==='done')-Number(b.status==='done')||a.due.localeCompare(b.due));
  return `<section class="glass card pw-panel"><div class="section-title"><div><h2>Actions datées</h2><p>Votre prochaine action, son responsable et son échéance.</p></div></div>${sorted.length?`<div class="pw-list">${rowsWithMore(sorted,a=>`<div class="pw-row ${a.status==='done'?'pw-row--done':''}" id="local-action-${esc(a.id)}"><div><strong>${esc(a.title)}</strong><small>${formatDate(a.due)} · ${esc(personName(org,a.ownerId))} · ${esc(agencyName(org,a.agencyId))}</small></div>${statusButton('action',a.id,a.status==='done',a.status==='done'?'Rouvrir':'Marquer terminé')}</div>`,5,'actions')}</div>`:'<div class="pw-empty"><strong>Aucune action saisie.</strong><p>Ajoutez une tâche datée pour commencer votre journée.</p></div>'}</section>`;
}
function meetingsPanel(workflow,org,day=''){
  const sorted=[...workflow.meetings].filter(m=>!day||m.date===day).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  return `<section class="glass card pw-panel"><div class="section-title"><div><h2>${day?`Rendez-vous du ${formatDate(day)}`:'Rendez-vous'}</h2><p>Rendez-vous datés, avec leur suite.</p></div></div>${sorted.length?`<div class="pw-list">${rowsWithMore(sorted,m=>`<div class="pw-row" id="local-meeting-${esc(m.id)}"><div><strong>${esc(m.title)}</strong><small>${formatDate(m.date)} à ${esc(m.time)} · ${esc(personName(org,m.ownerId))} · ${esc(agencyName(org,m.agencyId))}</small></div>${statusButton('meeting',m.id,m.status==='held',m.status==='held'?'Remettre à venir':'Marquer tenu')}</div>`,4,'rendez-vous')}</div>`:`<div class="pw-empty"><strong>${day?'Aucun rendez-vous ce jour-là.':'Aucun rendez-vous saisi.'}</strong><p>Un rendez-vous déclaré apparaîtra ici et dans Ma journée.</p></div>`}</section>`;
}
function weekDays(){
  const today=new Date(`${dateToday()}T12:00:00`),monday=new Date(today);
  monday.setDate(today.getDate()-(today.getDay()+6)%7);
  return Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
}
function weekStrip(workflow,day=''){
  const days=weekDays();
  const selected=days.includes(day)?day:'';
  return `<div class="pw-week" role="group" aria-label="Filtrer les rendez-vous de cette semaine"><button type="button" class="pw-day ${selected?'':'active'}" data-action="agenda-day" data-value="" aria-pressed="${!selected}"><span>TOUS</span><strong>${workflow.meetings.length}</strong><small>rendez-vous saisis</small></button>${days.map((date,i)=>{const count=workflow.meetings.filter(m=>m.date===date).length;return `<button type="button" class="pw-day ${selected===date?'active':''}" data-action="agenda-day" data-value="${date}" aria-pressed="${selected===date}"><span>${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][i]}</span><strong>${Number(date.slice(8))}</strong><small>${count?`${count} RDV`:'—'}</small></button>`}).join('')}</div>`;
}
export function activityEvents(value){
  const workflow=normalizeWorkflow(value);
  return [
    ...workflow.touches.map(t=>({id:t.id,date:t.date,kind:t.channel,count:t.count,title:t.title,agencyId:t.agencyId,unitId:t.unitId,ownerId:t.ownerId,source:'Prospection consignée'})),
    ...workflow.actions.filter(a=>a.status==='done'&&a.completedAt).map(a=>({id:a.id,date:a.completedAt,kind:'action',count:1,title:a.title,agencyId:a.agencyId,unitId:a.unitId,ownerId:a.ownerId,source:'Action terminée'})),
    ...workflow.meetings.filter(m=>m.status==='held').map(m=>({id:m.id,date:m.heldAt||m.date,kind:'meeting',count:1,title:m.title,agencyId:m.agencyId,unitId:m.unitId,ownerId:m.ownerId,source:'Rendez-vous tenu'}))
  ].filter(event=>validDate(event.date));
}
function weekActivity(workflow,org,{series='all',day=''}={}){
  const days=weekDays(),touches=workflow.touches.filter(t=>days.includes(t.date)),activeSeries=['email','linkedin'].includes(series)?series:'all',activeDay=days.includes(day)?day:'';
  const count=(date,channel)=>touches.filter(t=>t.date===date&&t.channel===channel).reduce((n,t)=>n+t.count,0);
  const max=Math.max(1,...days.map(date=>Math.max(count(date,'email'),count(date,'linkedin'))));
  const total=channel=>touches.filter(t=>t.channel===channel).reduce((n,t)=>n+t.count,0);
  const filtered=touches.filter(t=>(!activeDay||t.date===activeDay)&&(activeSeries==='all'||t.channel===activeSeries)).sort((a,b)=>b.date.localeCompare(a.date));
  return `<section class="glass card pw-week-activity"><div class="section-title"><div><h2>Prospection · e-mails et LinkedIn</h2><p>E-mails et LinkedIn suivis séparément · lundi à dimanche.</p></div></div><div class="series-filter" role="group" aria-label="Afficher les séries de prospection">${[['all','Les deux canaux'],['email',`E-mails · ${total('email')}`],['linkedin',`LinkedIn · ${total('linkedin')}`]].map(([id,label])=>`<button type="button" data-action="activity-series" data-value="${id}" aria-pressed="${activeSeries===id}" class="${activeSeries===id?'active':''}">${label}</button>`).join('')}</div><div class="pw-week-activity-chart" role="group" aria-label="Prospection déclarée par jour">${days.map((date,i)=>{const email=count(date,'email'),linkedin=count(date,'linkedin');return `<button class="pw-week-activity-day ${activeDay===date?'active':''}" type="button" data-action="activity-day" data-value="${date}" aria-pressed="${activeDay===date}" aria-label="${date}, ${email} e-mails, ${linkedin} approches LinkedIn"><span class="pw-week-activity-bars">${activeSeries!=='linkedin'?`<i class="email" style="height:${email?Math.max(7,Math.round(email/max*100)):2}%" title="${email} e-mails"></i>`:''}${activeSeries!=='email'?`<i class="linkedin" style="height:${linkedin?Math.max(7,Math.round(linkedin/max*100)):2}%" title="${linkedin} approches LinkedIn"></i>`:''}</span><strong>${activeSeries==='email'?email:activeSeries==='linkedin'?linkedin:email+linkedin}</strong><small>${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][i]}</small></button>`}).join('')}</div><div class="pw-week-activity-detail"><div><strong>${activeDay?`Prospections du ${formatDate(activeDay)}`:'Prospections saisies cette semaine'}</strong>${activeDay?'<button type="button" class="text-button" data-action="activity-day" data-value="">Toute la semaine →</button>':''}</div>${filtered.length?filtered.map(t=>`<div class="pw-row"><span><strong>${esc(t.title)}</strong><small>${formatDate(t.date)} · ${esc(personName(org,t.ownerId))} · ${esc(agencyName(org,t.agencyId))}</small></span><b>${t.count} ${t.channel==='email'?`e-mail${t.count>1?'s':''}`:`approche${t.count>1?'s':''} LinkedIn`}</b></div>`).join(''):'<p class="body-copy">Aucune prospection sur ce filtre. Consignez un e-mail ou une approche LinkedIn pour alimenter cette vue.</p>'}</div><p class="panel-footnote">Volumes consignés manuellement. Aucun e-mail ni message LinkedIn envoyé depuis cette vue.</p></section>`;
}
function invoicesPanel(workflow,org){
  const sorted=[...workflow.invoices].sort((a,b)=>Number(a.status==='paid')-Number(b.status==='paid')||a.due.localeCompare(b.due));
  return `<section class="glass card pw-panel"><div class="section-title"><div><h2>Échéances suivies</h2><p>Rappels et statut déclarés manuellement · aucun paiement vérifié. Le facturé et l’encaissé réels restent dans Missions.</p></div></div>${sorted.length?`<div class="pw-list">${rowsWithMore(sorted,i=>`<div class="pw-row"><div><strong>${esc(i.title)}</strong><small>${amount(i.amount)} · échéance ${formatDate(i.due)} · ${esc(agencyName(org,i.agencyId))}</small></div>${statusButton('invoice',i.id,i.status==='paid',i.status==='paid'?'Redéclarer à suivre':'Déclarer réglé')}</div>`,5,'échéances')}</div>`:'<div class="pw-empty"><strong>Aucune échéance renseignée.</strong><p>Vous pouvez suivre un rappel sans importer ni inventer de facture.</p></div>'}</section>`;
}
function summary(workflow){
  const today=dateToday(),open=workflow.actions.filter(a=>a.status==='open'),late=open.filter(a=>a.due<today),upcoming=workflow.meetings.filter(m=>m.status==='planned'&&m.date>=today),unpaid=workflow.invoices.filter(i=>i.status==='unpaid'&&i.due<today);
  const tile=(label,count,copy,route)=>`<button type="button" class="pw-summary-card" data-route="${route}"><span>${label}</span><strong>${count===null?'—':count}</strong><small>${copy} · ouvrir le détail →</small></button>`;
  const cards=[workflow.actions.length?tile('Actions en retard',late.length,'Actions datées','team?tab=plans'):'',workflow.meetings.length?tile('Rendez-vous à venir',upcoming.length,'Rendez-vous datés','agenda'):'',workflow.invoices.length?tile('Échéances dépassées',unpaid.length,'Échéances déclarées','pilotage?section=finance'):''].filter(Boolean);
  return cards.length?`<div class="pw-summary">${cards.join('')}</div>`:'';
}
function firstRun(org,workflow){
  const touches=workflow.touches.filter(t=>weekDays().includes(t.date)),email=touches.filter(t=>t.channel==='email').reduce((n,t)=>n+t.count,0),linkedin=touches.filter(t=>t.channel==='linkedin').reduce((n,t)=>n+t.count,0);
  const goal=workflow.goals.find(g=>g.onboardingOrigin==='local-profile')||workflow.goals[0],actual=goal?goalActual(workflow,goal):null;
  const momentum=touches.length||goal?`<div class="pw-momentum" aria-label="Saisies et cap déclarés">${touches.length?`<button type="button" data-route="team?tab=activite"><span>Prospection · cette semaine</span><strong>${email} e-mails · ${linkedin} LinkedIn</strong><small>Voir l’activité par jour →</small></button>`:''}${goal?`<button type="button" data-route="team?tab=objectifs"><span>${esc(goal.title)} · ${periodLabel(goal.period)}</span><strong>${actual===null?`Cible ${goal.target} · réalisé inconnu`:`${actual} / ${goal.target}`}</strong><small>${esc(goal.source||'Objectif déclaré')} · voir le détail →</small></button>`:''}</div>`:'';
  return `<section class="glass card pw-first-run"><div class="section-title"><div><div class="eyebrow">MA JOURNÉE · PROCHAINE ÉTAPE</div><h2>Quelle action mérite une date ?</h2><p>Consignez la prochaine étape. Elle apparaîtra ici et dans le plan d’équipe ; aucun message n’est envoyé.</p></div></div>${momentum}${progressive('Dater la prochaine action','Responsable et échéance saisis ici',actionForm(org),!momentum)}<div class="pw-quick-links"><button type="button" data-route="agenda">Planifier un rendez-vous →</button><button type="button" data-route="team?tab=objectifs">Définir ou consulter le cap →</button></div></section>${progressive('Consigner une prospection','E-mail ou LinkedIn · aucun envoi',touchForm(org))}`;
}

/** Un écran s'appuie exclusivement sur les entrées locales. Les pages vides donnent un premier geste. */
export function renderPersonalWorkflows(value,org,view,options={}){
  const workflow=normalizeWorkflow(value);
  if(view==='agenda'){const day=weekDays().includes(options.day)?options.day:'';return `${weekStrip(workflow,day)}${workflow.meetings.length?meetingsPanel(workflow,org,day):''}${progressive('Planifier un rendez-vous','Date, heure et prochaine étape',meetingForm(org),!workflow.meetings.length)}`}
  if(view==='pilotage')return `${summary(workflow)}<div class="pw-two">${goalsPanel(workflow,org,options.role)}${invoicesPanel(workflow,org)}</div><div class="pw-two">${goalForm(org,options.role)}${invoiceForm(org)}</div><p class="pw-provenance">Les objectifs sont déclarés ; le réalisé vient des actions datées et des rendez-vous tenus. Aucune conversion n’est calculée sans taux observé.</p>`;
  if(view==='objectives')return `${workflow.goals.length?progressive('Modifier un objectif','Cible, période et périmètre · historique conservé',goalEditPanel(workflow,org,options.role)):''}${progressive('Fixer un objectif','Mesure · période · cible · périmètre',goalForm(org,options.role),!workflow.goals.length)}`;
  if(view==='cockpit')return `${summary(workflow)}<div class="pw-quick-links"><button type="button" data-route="team?tab=objectifs">Ajuster les objectifs →</button><button type="button" data-route="team?tab=plans">Voir les actions datées →</button></div>`;
  if(view==='plans')return `${workflow.actions.length?actionsPanel(workflow,org):''}${progressive('Ajouter une action','Une prochaine étape avec responsable et date',actionForm(org),!workflow.actions.length)}`;
  if(view==='finance')return `${workflow.invoices.length?invoicesPanel(workflow,org):''}${progressive('Suivre une échéance','Rappel et statut déclarés, sans validation comptable',invoiceForm(org),!workflow.invoices.length)}`;
  if(view==='pipe')return `${workflow.actions.length?actionsPanel(workflow,org):''}${progressive('Documenter une prochaine action','Aucune affaire CRM déduite',actionForm(org),!workflow.actions.length)}`;
  if(view==='research')return progressive('Consigner une piste à qualifier','Action datée, sans créer une affaire CRM',actionForm(org),!workflow.actions.length);
  if(view==='team')return `${summary(workflow)}<div class="pw-quick-links"><button type="button" data-route="team?tab=plans">Actions et responsables →</button><button type="button" data-route="agenda">Agenda et suites →</button></div>`;
  if(view==='activity')return `${workflow.touches.length?weekActivity(workflow,org,options):''}${progressive('Consigner une prospection','E-mail ou LinkedIn, volumes saisis manuellement',touchForm(org),!workflow.touches.length)}`;
  if(!workflow.actions.length&&!workflow.meetings.length)return firstRun(org,workflow);
  return `${summary(workflow)}${workflow.actions.length||workflow.meetings.length?`<div class="pw-two">${workflow.actions.length?actionsPanel(workflow,org):''}${workflow.meetings.length?meetingsPanel(workflow,org):''}</div>`:''}<div class="pw-quick-links"><button type="button" data-route="team?tab=activite">Prospection · e-mails et LinkedIn →</button><button type="button" data-route="team?tab=objectifs">Cap et progression →</button></div>${progressive('Ajouter un geste','Action datée ou prospection déclarée',`<div class="pw-two">${actionForm(org)}${touchForm(org)}</div>`)}`;
}
