#!/usr/bin/env node
// Recette transversale de l'aperçu local : faits, droits, périmètres et exports.
import assert from 'node:assert/strict';
import {emptyOrganization,createOrganizationItem,organizationHub} from '../dist/organization.js';
import {emptyWorkflow,createPersonalItem,togglePersonalItem,effectivePersonGoals,goalActual,periodKey,renderPersonalWorkflows} from '../dist/personal-workflows.js';
import {buildActivityReport,renderActivityReport,renderActivityReportSetup,activityReportCsv,activityReportEmail,activityReportHtml,formatReportTimestamp,reportsForCompany} from '../dist/activity-report.js';

const today=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})();
const form=values=>{const data=new FormData();for(const [key,value] of Object.entries(values))data.set(key,String(value));return data};
let org=emptyOrganization();
const add=(kind,values,role='direction')=>{const result=createOrganizationItem(org,kind,form(values),role);assert.equal(result.error,undefined,`${kind}: ${result.error}`);org=result.org;return org[`${kind==='person'?'people':kind==='agency'?'agencies':kind==='team'?'teams':'units'}`].at(-1).id};
const paris=add('agency',{name:'Paris conseil',city:'Paris'});
const lyon=add('agency',{name:'Lyon conseil',city:'Lyon'});
const teamParis=add('team',{name:'Équipe Paris',agencyId:paris});
const teamLyon=add('team',{name:'Équipe Lyon',agencyId:lyon});
const buParis=add('unit',{name:'BU Data',agencyId:paris});
const buLyon=add('unit',{name:'BU Cloud',agencyId:lyon});
const alice=add('person',{name:'Alice Martin',teamId:teamParis,role:'Business Manager'});
const bob=add('person',{name:'Bob Durand',teamId:teamParis,role:'Business Manager'});
const chloe=add('person',{name:'Chloé Lyon',teamId:teamLyon,role:'Business Manager'});
let workflow=emptyWorkflow();
const create=(kind,values,role='direction')=>{const result=createPersonalItem(workflow,kind,form(values),org,role);assert.equal(result.error,undefined,`${kind}: ${result.error}`);workflow=result.workflow;return workflow[kind==='goal'?'goals':kind==='touch'?'touches':kind==='action'?'actions':'meetings'].at(-1)};

for(const period of ['week','month','quarter','semester']){
  const global=create('goal',{metric:'email',period,target:10,goalScope:'global'});
  assert.equal(global.period,period);
  assert.equal(periodKey(today,period),periodKey(global.createdAt,period));
}
create('goal',{metric:'email',period:'week',target:20,goalScope:'individual',ownerId:alice});
assert.ok(createPersonalItem(workflow,'goal',form({metric:'email',period:'week',target:100,goalScope:'global'}),org,'sales').error,'Un commercial ne doit pas écrire un cap groupe');
const ownAlice=effectivePersonGoals(workflow,alice).find(item=>item.goal.metric==='email'&&item.goal.period==='week');
const ownBob=effectivePersonGoals(workflow,bob).find(item=>item.goal.metric==='email'&&item.goal.period==='week');
assert.equal(ownAlice.goal.target,20);
assert.equal(ownAlice.source,'Surcharge individuelle');
assert.equal(ownBob.goal.target,10);
assert.equal(ownBob.source,'Cap groupe hérité');
const globalStarts=create('goal',{metric:'starts',period:'month',target:22,goalScope:'global'});
workflow=createPersonalItem(workflow,'goal-progress',form({id:globalStarts.id,actual:5}),org,'direction').workflow;
assert.equal(effectivePersonGoals(workflow,alice).find(item=>item.goal.metric==='starts').actual,null,'Le réalisé groupe ne peut être dupliqué à Alice');
assert.equal(effectivePersonGoals(workflow,bob).find(item=>item.goal.metric==='starts').actual,null,'Le réalisé groupe ne peut être dupliqué à Bob');
const aliceStarts=create('goal',{metric:'starts',period:'month',target:12,goalScope:'individual',ownerId:alice});
workflow=createPersonalItem(workflow,'goal-progress',form({id:aliceStarts.id,actual:2}),org,'direction').workflow;
assert.equal(effectivePersonGoals(workflow,alice).find(item=>item.goal.metric==='starts').actual,2,'La déclaration individuelle reste attribuée à Alice seule');
assert.equal(effectivePersonGoals(workflow,bob).find(item=>item.goal.metric==='starts').actual,null);

create('touch',{title:'Mail Acme',date:today,channel:'email',count:3,agencyId:paris,unitId:buParis,ownerId:alice});
create('touch',{title:'LinkedIn Acme',date:today,channel:'linkedin',count:2,agencyId:paris,unitId:buParis,ownerId:alice});
create('touch',{title:'=2+2',date:today,channel:'email',count:1,agencyId:paris,unitId:buParis,ownerId:bob});
create('touch',{title:'Mail Lyon',date:today,channel:'email',count:7,agencyId:lyon,unitId:buLyon,ownerId:chloe});
assert.equal(goalActual(workflow,ownAlice.goal),3,'La cible e-mail individuelle ne compte pas LinkedIn');
assert.equal(effectivePersonGoals(workflow,bob).find(item=>item.goal.period==='week').actual,1,'L’héritage groupe garde le réalisé de Bob');
const task=create('action',{title:'Préparer dossier Acme',due:today,agencyId:paris,unitId:buParis,ownerId:alice});
workflow=togglePersonalItem(workflow,'action',task.id).workflow;
const meeting=create('meeting',{title:'Découverte Acme',date:today,time:'10:30',agencyId:paris,unitId:buParis,ownerId:alice});
workflow=togglePersonalItem(workflow,'meeting',meeting.id).workflow;

const report=buildActivityReport(workflow,org,'week',{city:'Paris',agency:paris,unit:buParis,role:'direction',companyName:'Acme ESN'});
assert.deepEqual(report.totals,{email:4,linkedin:2,action:1,meeting:1});
assert.equal(report.rows.length,5);
assert.ok(report.rows.every(row=>row.city==='Paris'&&row.agency==='Paris conseil'&&row.unit==='BU Data'&&row.source));
assert.doesNotMatch(JSON.stringify(report),/Mail Lyon|Groupe Sillage|Nora Benali/);
const filtered=renderActivityReport(report,{channel:'email',owner:alice,preview:true,companyName:'Acme ESN'});
assert.equal((filtered.match(/class="activity-report-row"/g)||[]).length,1,'Le filtre canal + responsable agit sur les lignes visibles');
assert.equal((filtered.match(/class="activity-report-bar /g)||[]).length,1,'Le graphe ne garde que la série sélectionnée');
assert.match(filtered,/class="activity-report-bar active"[^>]*data-value="email"/);
assert.equal((renderActivityReport(report,{channel:'all'}).match(/class="activity-report-bar /g)||[]).length,4,'Toutes les séries restaure les quatre barres');
assert.match(filtered,/Mail Acme/);
assert.doesNotMatch(filtered,/Mail Lyon/);
assert.match(filtered,/Aperçu e-mail · aucun envoi/);
const csv=activityReportCsv(report);
assert.match(csv,/Mail Acme/);
assert.doesNotMatch(csv,/Mail Lyon/);
assert.match(csv,/"'=2\+2"/,'Une cellule CSV commençant par = doit être neutralisée');
assert.match(activityReportEmail(report,'Acme ESN'),/aucun e-mail n’est envoyé/);
assert.match(activityReportHtml(report,'Acme ESN'),/Document figé/);
assert.match(activityReportHtml(report,'Acme ESN'),/Ouvrir la page des saisies/);
assert.match(activityReportHtml(report,'Acme ESN'),/href="#team\?tab=activite">Ouvrir la page des saisies/);
assert.doesNotMatch(activityReportHtml(report,'Acme ESN'),/Ouvrir la page source/);
assert.doesNotMatch(activityReportHtml(report,'Acme ESN'),/Mail Lyon/);
const dated={...report,generatedAt:'2026-11-25T17:19:49.222Z'};
assert.equal(formatReportTimestamp(dated.generatedAt),'25 novembre 2026 à 18:19');
for(const output of [renderActivityReport(dated),renderActivityReportSetup(org,{reports:[dated]}),activityReportEmail(dated,'Acme ESN'),activityReportHtml(dated,'Acme ESN'),activityReportCsv(dated)]){
  assert.match(output,/25 novembre 2026 à 18:19/);
  assert.doesNotMatch(output,/2026-11-25T17:19:49\.222Z/);
}
assert.equal(dated.generatedAt,'2026-11-25T17:19:49.222Z','La date ISO interne reste intacte');
const other={...dated,id:'other-company',companyName:'Autre ESN'};
assert.deepEqual(reportsForCompany([dated,other],' Acme   ESN ').map(item=>item.id),[dated.id]);
assert.deepEqual(reportsForCompany([dated,other],'Autre ESN').map(item=>item.id),[other.id]);
const firstDay=renderPersonalWorkflows(emptyWorkflow(),org,'today');
assert.match(firstDay,/Quelle action mérite une date/);
assert.doesNotMatch(firstDay,/pw-summary-card/,'Aucune tuile de chiffre inconnu ne précède le premier geste');
let momentumWorkflow=emptyWorkflow();
for(const [channel,count] of [['email',3],['linkedin',2]])momentumWorkflow=createPersonalItem(momentumWorkflow,'touch',form({title:`Geste ${channel}`,date:today,channel,count,agencyId:paris}),org).workflow;
momentumWorkflow=createPersonalItem(momentumWorkflow,'goal',form({metric:'starts',period:'month',target:22,goalScope:'global'}),org,'direction').workflow;
const momentum=renderPersonalWorkflows(momentumWorkflow,org,'today');
assert.match(momentum,/3 e-mails · 2 LinkedIn/);
assert.match(momentum,/Cible 22 · réalisé inconnu/);
assert.match(momentum,/data-route="team\?tab=activite"/);
assert.match(momentum,/data-route="team\?tab=objectifs"/);
assert.doesNotMatch(momentum,/pw-summary-card/,'Le résumé factuel ne recrée pas trois KPI vides');
let manyActions=emptyWorkflow();
for(let i=0;i<7;i++)manyActions=createPersonalItem(manyActions,'action',form({title:`Action source ${i}`,due:today,agencyId:paris}),org).workflow;
const plans=renderPersonalWorkflows(manyActions,org,'plans');
assert.match(plans,/Voir les 2 autres actions/);
assert.ok(manyActions.actions.every(a=>plans.includes(`local-action-${a.id}`)),'Les lignes repliées restent accessibles par leur identifiant source');
const structure=organizationHub(org,{role:'direction',city:'Paris',agency:paris,declaredLocations:'Paris'});
for(const kind of ['agency','team','unit','person'])assert.match(structure,new RegExp(`data-org-form="${kind}"`),'Chaque création reste accessible dans le panneau d’administration');
assert.match(structure,/france-canvas org-map/);

// Une route de sous-onglet remet le défilement en haut dans le vrai gestionnaire de clics.
const storage=new Map([['bellum-white-commercial-v1',JSON.stringify({mode:'personal',role:'direction',profile:{firstName:'Maëlle',companyName:'Acme ESN',jobRole:'direction'}})]]),listeners={};
const element=()=>({innerHTML:'',scrollTop:0,dataset:{},classList:{add(){},toggle(){}},append(){},remove(){},querySelector(){return null},querySelectorAll(){return []},scrollIntoView(){},focus(){}});
const dom=Object.fromEntries(['#app','#overlay-root','#toast-root','#laura-root','#page-scroll'].map(key=>[key,element()]));
globalThis.document={querySelector:key=>dom[key]||null,getElementById:id=>dom[`#${id}`]||null,createElement:element,documentElement:{dataset:{}},body:{classList:{toggle(){}}},addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.window={addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.location={hash:'#today'};
globalThis.history={replaceState(_state,_title,hash){location.hash=hash}};
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
globalThis.requestAnimationFrame=fn=>fn();
await import('../dist/performance.js?qa=top');
dom['#page-scroll'].scrollTop=580;
listeners.click({target:{closest:()=>({dataset:{route:'team'},classList:{contains:()=>false}})}});
assert.equal(dom['#page-scroll'].scrollTop,0);
assert.equal(location.hash,'#team');

// Le sixième geste est réellement sous « Voir les autres » ; le lien du
// rapport doit rouvrir ce panneau avant de faire défiler vers sa ligne.
let folded=emptyWorkflow();
for(let i=1;i<=6;i++){
  const result=createPersonalItem(folded,'touch',form({title:`Geste ${i}`,date:today,channel:'email',count:1,agencyId:paris,ownerId:alice}),org,'direction');
  assert.equal(result.error,undefined);
  folded=result.workflow;
}
const hiddenId=folded.touches.at(-1).id;
storage.set('bellum-white-commercial-v1',JSON.stringify({mode:'personal',role:'direction',profile:{firstName:'Maëlle',companyName:'Acme ESN',jobRole:'direction'},organization:org,personalWorkflows:folded}));
location.hash='#team?tab=activite';
await import('../dist/performance.js?qa=folded-source');
const rendered=dom['#app'].innerHTML,foldStart=rendered.indexOf('<details class="progressive-list">'),marker=`id="local-activity-${hiddenId}"`;
assert.ok(foldStart>=0,'Le journal présente un détail ouvrable après cinq lignes');
assert.ok(rendered.indexOf(marker)>foldStart,'Le sixième geste source est dans le panneau replié');
const parent={tagName:'DETAILS',open:false,parentElement:null};
let scrolled=false;
dom[`#local-activity-${hiddenId}`]={parentElement:{tagName:'DIV',parentElement:parent},scrollIntoView(){assert.equal(parent.open,true,'Ouvrir avant de défiler');scrolled=true}};
listeners.click({target:{closest:()=>({dataset:{action:'report-source',kind:'email',id:hiddenId},classList:{contains:()=>false}})}});
assert.equal(parent.open,true);
assert.equal(scrolled,true,'Le lien atteint le geste replié');
console.log('QA intégration locale : objectifs et 4 périodes, rôles, gestes distincts, rapport sourcé et filtré, exports sûrs, navigation haute OK');
