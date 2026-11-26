#!/usr/bin/env node
// Parcours de navigation réellement déléguée : un utilisateur payant doit
// retrouver la bonne vue, le bon rôle et la source sans garder un écran périmé.
import assert from 'node:assert/strict';
import {emptyWorkflow,createPersonalItem} from '../dist/personal-workflows.js';
import {emptyOrganization} from '../dist/organization.js';

const storage=new Map([['bellum-white-commercial-v1',JSON.stringify({mode:'scenario',role:'direction',teamTab:'vue',pilotSection:'cockpit'})]]);
const listeners={};
const element=()=>({innerHTML:'',scrollTop:0,dataset:{},classList:{add(){},toggle(){}},append(){},after(){},remove(){},querySelector(){return null},querySelectorAll(){return []},scrollIntoView(){},focus(){}});
const dom=Object.fromEntries(['#app','#overlay-root','#toast-root','#laura-root','#page-scroll'].map(key=>[key,element()]));
globalThis.document={querySelector:key=>dom[key]||null,getElementById:id=>dom[`#${id}`]||null,createElement:element,documentElement:{dataset:{}},body:{classList:{toggle(){}}},addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.window={addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.location={hash:'#today'};
globalThis.history={replaceState(_state,_title,hash){location.hash=hash}};
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
globalThis.requestAnimationFrame=fn=>fn();
globalThis.FormData=class{constructor(form){this.data=new Map(form?Object.entries(form.values):[])}get(key){return this.data.get(key)}entries(){return this.data.entries()}};
await import('../dist/performance.js?qa=paid-user-routes');

const html=()=>dom['#app'].innerHTML;
const saved=()=>JSON.parse(storage.get('bellum-white-commercial-v1'));
const click=(dataset)=>{const node={dataset,classList:{contains:()=>false}};listeners.click({target:{closest:()=>node},preventDefault(){}});listeners.hashchange()};
const route=(name)=>{dom['#page-scroll'].scrollTop=610;click({route:name});assert.equal(location.hash,`#${name}`);assert.equal(dom['#page-scroll'].scrollTop,0,`L’ouverture de ${name} doit revenir en haut`)};
const action=(name,value,id='')=>click({action:name,value,id});

let roleFocus=false;
dom['.topbar [data-change="role"]']={focus(){roleFocus=true},showPicker(){}};
assert.match(html(),/data-action="role-picker"/,'Le profil de scénario expose un choix de rôle');
action('role-picker');
assert.equal(roleFocus,true,'Le profil ouvre le sélecteur explicite au lieu de changer de rôle sans choix');
assert.equal(saved().role,'direction');

for(const [id,heading] of [['today','Bonjour Pierre'],['agenda','Pierre, vos rendez-vous'],['team','Équipe commerciale'],['pilotage','Performance commerciale']]){
  route(id);
  assert.ok(html().includes(heading),`${id} doit donner un titre reconnaissable`);
}
route('team');
for(const tab of ['vue','objectifs','plans','recherches','activite','administration']){
  action('team-tab',tab);
  assert.equal(location.hash,`#team?tab=${tab}`);
  assert.equal(saved().teamTab,tab);
  assert.match(html(),new RegExp(`data-action="team-tab" data-value="${tab}"`));
}
assert.match(html(),/france-canvas/,'La carte de France reste accessible dans Carte & agences');
action('map-city','Lyon');
assert.equal(saved().mapCity,'Lyon');
action('admin-view','affaires');
assert.match(html(),/Affaires à faire avancer/);
action('map-city','Paris');
assert.equal(saved().adminView,'performance','Changer de ville revient à la vue de mesure');

route('pilotage');
for(const section of ['cockpit','pipe','staffing','finance']){
  click({anchor:section});
  assert.equal(location.hash,`#pilotage?section=${section}`);
  assert.match(html(),new RegExp(`id="p-${section}"`));
  for(const other of ['cockpit','pipe','staffing','finance'].filter(x=>x!==section))assert.doesNotMatch(html(),new RegExp(`id="p-${other}"`));
}
for(const [control,section] of [['pilot-pipe','pipe'],['pilot-staffing','staffing'],['pilot-finance','finance']]){
  route('pilotage');
  assert.match(html(),new RegExp(`class="glass metric-tile metric-link" data-action="${control}"`));
  action(control);
  assert.equal(location.hash,`#pilotage?section=${section}`);
  assert.match(html(),new RegExp(`id="p-${section}"`));
}

// Ce CTA vient de la cadence dans Pilotage. Il doit ouvrir le journal promis,
// et non uniquement modifier un état invisible dans la page courante.
listeners.change({target:{dataset:{change:'city'},value:'all'}});
route('pilotage');
assert.match(html(),/Voir le journal/);
action('day-tab','flux');
assert.equal(location.hash,'#today','Voir le journal conduit à Ma journée');
assert.equal(saved().dayTab,'flux');
assert.match(html(),/barcode-line email/);
assert.match(html(),/barcode-line linkedin/);

// Un favori enregistré sous un rôle plus large doit expliquer la vraie vue.
storage.set('bellum-white-commercial-v1',JSON.stringify({...saved(),role:'manager',teamTab:'vue'}));
location.hash='#team?tab=administration';
await import('../dist/performance.js?qa=manager-deeplink');
assert.equal(location.hash,'#team?tab=vue','Le lien non autorisé ne doit pas annoncer une administration invisible');
assert.doesNotMatch(html(),/france-canvas org-map/);
storage.set('bellum-white-commercial-v1',JSON.stringify({...saved(),role:'sales'}));
location.hash='#team?tab=administration';
await import('../dist/performance.js?qa=sales-deeplink');
assert.equal(location.hash,'#today','Le commercial fictif revient à sa journée');
assert.doesNotMatch(html(),/Équipe commerciale/);

// Depuis la trajectoire du Cockpit local, ouvrir puis modifier le cap Direction
// par le vrai délégué de clic et le vrai gestionnaire de formulaire.
const goalForm={values:{metric:'starts',period:'month',target:'22',goalScope:'global'}};
const created=createPersonalItem(emptyWorkflow(),'goal',new FormData(goalForm),emptyOrganization(),'direction');
assert.equal(created.error,undefined);
const goalId=created.workflow.goals[0].id;
storage.set('bellum-white-commercial-v1',JSON.stringify({mode:'personal',role:'direction',profile:{firstName:'Maëlle',companyName:'Altimance',jobRole:'direction'},organization:emptyOrganization(),personalWorkflows:created.workflow}));
location.hash='#pilotage?section=cockpit';
await import('../dist/performance.js?qa=goal-ui');
assert.match(html(),new RegExp(`data-action="goal-edit-focus" data-id="${goalId}"`));
action('goal-edit-focus','',goalId);
assert.equal(location.hash,'#team?tab=objectifs');
assert.match(html(),/data-pw-form="goal-edit"/);
const editForm={dataset:{pwForm:'goal-edit'},values:{id:goalId,metric:'starts',period:'quarter',target:'30',goalScope:'global'}};
listeners.submit({target:{closest:()=>editForm},preventDefault(){}});
assert.equal(saved().personalWorkflows.goals[0].target,30);
assert.equal(saved().personalWorkflows.goals[0].period,'quarter');
assert.equal(saved().personalWorkflows.goals[0].revisions.length,1);
assert.match(html(),/cible 30/);
console.log('Parcours client payant : 4 routes, 6 sous-onglets, 4 sections, journal, carte, rôle, édition de cap et scroll haut OK');
