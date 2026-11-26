import {activeOrganization} from './organization.js';
import {normalizeWorkflow,renderPersonalWorkflows,goalActual,effectivePersonGoals,activityEvents,periodLabel} from './personal-workflows.js';
import {normalizeProfile} from './onboarding-profile.js';

const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const chunks=value=>String(value||'').split(/[,;]+/).map(x=>x.trim()).filter(Boolean).slice(0,8);
const note=(eyebrow,title,copy,action='')=>`<section class="glass card identity-feature"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2><p>${copy}</p>${action}</section>`;
const mapButton='<button type="button" class="text-button" data-action="org-open-map">Ouvrir la carte des agences →</button>';
const fold=(title,copy,content)=>`<details class="glass progressive-panel"><summary><span><strong>${title}</strong><small>${copy}</small></span><span aria-hidden="true">⌄</span></summary><div class="progressive-panel-body">${content}</div></details>`;

function activityLedger(workflow,org){
  const agency=id=>safe(org.agencies.find(a=>a.id===id)?.name||'Sans agence');
  const labels={email:'E-mail déclaré',linkedin:'Approche LinkedIn déclarée',action:'Action terminée',meeting:'Rendez-vous tenu'};
  const rows=activityEvents(workflow).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const row=item=>`<div class="activity-ledger-row" id="local-activity-${safe(item.id)}"><time>${safe(item.date)}</time><span><strong>${safe(item.title)}</strong><small>${labels[item.kind]} · ${agency(item.agencyId)}</small></span><b>${item.count}</b></div>`;
  return `<section class="glass card activity-ledger"><div class="section-title"><div><h2>Journal d’activité</h2><p>Prospection, actions terminées et rendez-vous tenus, classés par date.</p></div></div>${rows.length?`<div class="activity-ledger-list">${rows.slice(0,5).map(row).join('')}${rows.length>5?`<details class="progressive-list"><summary>Voir les ${rows.length-5} autres activités →</summary><div class="progressive-list-body">${rows.slice(5).map(row).join('')}</div></details>`:''}</div>`:'<p class="body-copy">Aucune activité consignée. Une prospection, une action terminée ou un rendez-vous tenu apparaîtra ici.</p>'}</section>`;
}

function roster(org,role='direction'){
  const agencies=activeOrganization(org).agencies;
  const people=activeOrganization(org).people;
  return `<section class="glass card identity-roster"><div class="section-title"><div><h2>Qui travaille où ?</h2><p>Agences, équipes et personnes de votre organisation.</p></div>${mapButton}</div>${agencies.length?`<div class="identity-roster-list">${agencies.map(a=>{const teams=org.teams.filter(t=>!t.archivedAt&&t.agencyId===a.id);const members=people.filter(p=>teams.some(t=>t.id===p.teamId));return `<button class="identity-roster-row" type="button" data-action="org-agency" data-id="${safe(a.id)}"><span><strong>${safe(a.name)}</strong><small>${safe(a.city)} · ${teams.length} équipe${teams.length>1?'s':''}</small></span><b>${members.length} personne${members.length>1?'s':''} →</b></button>`}).join('')}</div>`:`<p class="body-copy">${role==='direction'?'La carte est prête à accueillir votre première agence. Choisissez une ville, puis ajoutez les équipes et personnes concernées.':'Aucune agence créée. Les implantations déclarées restent visibles sur la carte, à confirmer par la direction.'}</p>`}</section>`;
}

function goalTrajectory(wf,org){
  if(!wf.goals.length)return note('TRAJECTOIRE', 'Quel cap voulez-vous tenir ?', 'Ajoutez une mesure, une période et une cible. Le réalisé reste inconnu tant que vous ne l’avez pas documenté.');
  return `<section class="glass card identity-trajectory"><div class="section-title"><div><h2>Cap et mesure</h2><p>Objectifs déclarés · réalisé issu des actions datées et des déclarations.</p></div></div><div class="identity-trajectory-list">${wf.goals.map(g=>{const actual=goalActual(wf,g),target=Number(g.target)||0,known=actual!==null,ratio=known&&target?Math.min(100,Math.round(actual/target*100)):0,scope=g.goalScope==='individual'?`Individuel · ${org.people.find(p=>p.id===g.ownerId)?.name||'Personne inconnue'}`:g.goalScope==='global'?'Groupe · réalisé partiel':'Mon espace';return `<button type="button" class="identity-trajectory-row" data-action="goal-edit-focus" data-id="${safe(g.id)}"><span><strong>${safe(g.title)}</strong><small>${periodLabel(g.period)} · ${safe(scope)} · ${safe(g.source||'Saisie manuelle')}</small></span><span>${known?`${actual} / ${target}`:`Cible ${target} · réalisé inconnu`}</span><span class="identity-trajectory-track"><i style="width:${ratio}%"></i></span></button>`}).join('')}</div></section>`;
}

function declaredCommercialContext(profile){
  const p=normalizeProfile(profile);
  const offers=chunks(p.offerDomains),sectors=chunks(p.targetSectors);
  const tools=[p.toolingCrm&&`CRM : ${p.toolingCrm}`,p.toolingAts&&`ATS : ${p.toolingAts}`].filter(Boolean);
  return `<section class="glass card identity-context"><div class="section-title"><div><h2>Votre terrain commercial</h2><p>Les réponses de votre profil organisent les prochaines recherches et les objectifs.</p></div><button type="button" class="text-button" data-action="profile-edit">Modifier mes réponses</button></div><div class="identity-context-list"><div><span>Expertises</span><strong>${offers.length?offers.map(safe).join(' · '):'À préciser'}</strong></div><div><span>Secteurs ciblés</span><strong>${sectors.length?sectors.map(safe).join(' · '):'À préciser'}</strong></div><div><span>Outils indiqués</span><strong>${tools.length?tools.map(safe).join(' · '):'À préciser'}</strong></div></div><p class="panel-footnote">Indiquer un outil ne le connecte pas. Les résultats commerciaux attendent des données reliées ou des actions consignées.</p></section>`;
}
function effectiveTargets(wf,org){
  const people=org.people,rows=people.flatMap(person=>effectivePersonGoals(wf,person.id).map(entry=>({person,...entry})));
  return `<section class="glass card identity-effective"><div class="section-title"><div><h2>La cible effective de chaque personne</h2><p>Pour une même mesure et une même période, le cap individuel prime sur le cap groupe. Le réalisé dépend des actions attribuées et datées.</p></div></div>${rows.length?`<div class="identity-effective-list">${rows.map(({person,goal,source,actual})=>`<div class="identity-effective-row"><span><strong>${safe(person.name)}</strong><small>${safe(goal.title)} · ${periodLabel(goal.period)} · ${source}</small></span><b>${actual===null?`Inconnu / ${goal.target}`:`${actual} / ${goal.target}`}</b></div>`).join('')}</div>`:'<p class="body-copy">Ajoutez des personnes et un cap groupe ou individuel pour voir les cibles effectives. Le réalisé groupe ne se répartit pas automatiquement.</p>'}</section>`;
}
function startsDeclarations(wf,role){
  const goals=wf.goals.filter(g=>g.metric==='starts'&&(role==='direction'||(g.goalScope||'workspace')==='workspace'));
  if(!goals.length)return '';
  return `<section class="glass card identity-starts"><div class="section-title"><div><h2>Déclarer les démarrages</h2><p>Chaque valeur est une déclaration manuelle de la période en cours. Un réalisé groupe ne se répartit pas entre les personnes.</p></div></div><div class="identity-starts-list">${goals.map(g=>`<form class="pw-inline-form" data-pw-form="goal-progress"><input type="hidden" name="id" value="${safe(g.id)}"><label>${safe(g.title)} · ${periodLabel(g.period)} · ${g.goalScope==='individual'?'personne attribuée':g.goalScope==='global'?'groupe':'espace local'}<input name="actual" type="number" min="0" max="100000" required value="${goalActual(wf,g)===null?'':g.manualActual??''}"></label><button type="submit">Enregistrer le réalisé déclaré</button></form>`).join('')}</div></section>`;
}

export function renderPersonalSection(view,{workflow,organization,profile,overview='',role='sales',activitySeries='all',activityDay=''}){
  const wf=normalizeWorkflow(workflow),org=activeOrganization(organization),p=normalizeProfile(profile);
  if(view==='team-vue')return `${overview}${org.agencies.length?roster(organization,role):''}${renderPersonalWorkflows(wf,organization,'team')}`;
  if(view==='team-objectifs')return `${goalTrajectory(wf,org)}${renderPersonalWorkflows(wf,organization,'objectives',{role})}${role==='direction'?fold('Cibles par personne','Cap groupe hérité ou surcharge individuelle, sans réalisé supposé',effectiveTargets(wf,org)):''}${wf.goals.some(g=>g.metric==='starts'&&(role==='direction'||(g.goalScope||'workspace')==='workspace'))?fold('Déclarer les démarrages','Un réalisé groupe ne devient jamais individuel',startsDeclarations(wf,role)):''}`;
  if(view==='team-plans')return `<div class="section-kicker">PLAN D’ACTION · RESPONSABLE ET ÉCHÉANCE</div>${renderPersonalWorkflows(wf,organization,'plans')}`;
  if(view==='team-recherches'){
    const offers=chunks(p.offerDomains),sectors=chunks(p.targetSectors),geo=chunks(p.geoZones);
    return `${note('RECHERCHE · CONTEXTE DÉCLARÉ','Qualifier une piste commerciale.',`Chez ${safe(p.companyName||'votre ESN')}, vous avez indiqué ${offers.length?`les expertises ${offers.map(safe).join(', ')}`:'aucune expertise pour l’instant'}${sectors.length?` et les secteurs ${sectors.map(safe).join(', ')}`:''}${geo.length?` sur ${geo.map(safe).join(', ')}`:''}. Ces repères aident à cibler la recherche. Confirmez le besoin, son contact et sa date avant de créer une affaire.`,'<button type="button" class="text-button" data-action="profile-edit">Préciser mon contexte →</button>')}${renderPersonalWorkflows(wf,organization,'research')}`;
  }
  if(view==='team-activite')return `${role==='direction'?'<div class="pw-quick-links"><button type="button" data-action="open-report">Générer un rapport d’activité →</button></div>':''}${renderPersonalWorkflows(wf,organization,'activity',{series:activitySeries,day:activityDay})}${activityEvents(wf).length?activityLedger(wf,org):''}`;
  if(view==='pilot-cockpit')return `${goalTrajectory(wf,org)}${declaredCommercialContext(p)}${renderPersonalWorkflows(wf,organization,'cockpit',{role})}${role==='direction'?'<div class="pw-quick-links"><button type="button" data-action="open-report">Générer un rapport d’activité →</button></div>':''}`;
  if(view==='pilot-pipe')return `${note('AFFAIRES EN COURS','Aucune affaire reliée pour l’instant.','Reliez une source commerciale pour suivre les étapes, montants et responsables. Vos actions datées restent accessibles ci-dessous.','<button type="button" class="text-button" data-route="team">Voir le plan d’équipe →</button>')}${renderPersonalWorkflows(wf,organization,'pipe')}`;
  if(view==='pilot-staffing')return `${note('STAFFING','Suivre la couverture des besoins.','Les agences sont configurées. Les besoins, disponibilités et démarrages apparaîtront lorsque leurs sources seront reliées.',mapButton)}${roster(organization,role)}`;
  if(view==='pilot-finance')return `${note('FINANCE · APERÇU','Échéances à suivre.','Les échéances ci-dessous sont celles que vous avez renseignées. Reliez la facturation pour suivre le payé et l’encaissé.')}${renderPersonalWorkflows(wf,organization,'finance')}`;
  return '';
}
