#!/usr/bin/env node
// Inventaire des contrats d'interaction du HTML construit dans le Site.
// Un clic complet au pixel, le focus et le contraste exigent la recette navigateur.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyOrganization,createOrganizationItem} from '../dist/organization.js';
import {emptyWorkflow,createPersonalItem} from '../dist/personal-workflows.js';
import {buildActivityReport} from '../dist/activity-report.js';
import {MEMBERS} from '../dist/performance-data.js';
import {saveFinanceRecord} from '../dist/finance-calculator.js';

const modules=['performance','onboarding-profile','organization','personal-workflows','personal-sections','activity-report','staffing-insights','finance-calculator'];
const source=(await Promise.all(modules.map(name=>readFile(new URL(`../dist/${name}.js`,import.meta.url),'utf8')))).join('\n');
const performance=await readFile(new URL('../dist/performance.js',import.meta.url),'utf8');
const laura=await readFile(new URL('../dist/laura.js',import.meta.url),'utf8');
const clickHandler=performance.split('function handleClick(e)')[1]?.split('function handleChange(e)')[0];
const changeHandler=performance.split('function handleChange(e)')[1]?.split('function handleSubmit(e)')[0];
const submitHandler=performance.split('function handleSubmit(e)')[1]?.split("document.addEventListener('click'")[0];
assert.ok(clickHandler&&changeHandler&&submitHandler);
const values=(text,regex)=>new Set([...text.matchAll(regex)].map(match=>match[1]));
const actions=values(source,/data-action="([a-z-]+)"/g);
for(const value of values(source,/btn\([^,\n]+,\s*['"]([a-z-]+)['"]/g))actions.add(value);
const changes=values(source,/data-change="([a-z-]+)"/g);
const forms={profile:new Set(['']),org:new Set(['agency','team','unit','person']),edit:new Set(['agency','team','unit','person']),pw:new Set(['action','meeting','goal','goal-edit','goal-progress','touch','invoice'])};
const hasBranch=(handler,value)=>new RegExp(`['"]${value}['"]`).test(handler);
for(const action of actions)assert.ok(hasBranch(clickHandler,action),`Action sans branche de clic : ${action}`);
for(const change of changes)assert.ok(hasBranch(changeHandler,change),`Sélecteur sans branche de changement : ${change}`);
for(const key of ['profileForm','orgForm','orgEdit','pwForm','planForm','financeForm'])assert.ok(submitHandler.includes(`form.dataset.${key}`),`Formulaire ${key} sans traitement`);
for(const [attr,kinds] of [['org-form',forms.org],['org-edit',forms.edit],['pw-form',forms.pw]]){
  for(const kind of values(source,new RegExp(`data-${attr}="([a-z-]+)"`,'g')))assert.ok(kinds.has(kind),`Formulaire inconnu : ${attr}=${kind}`);
}
const lauraControls=values(laura,/data-laura="([a-z-]+)"/g);
for(const value of lauraControls)assert.ok(hasBranch(laura,value),`Contrôle Laura sans effet : ${value}`);
for(const value of ['deal','invoice','navigate'])assert.ok(hasBranch(laura,value),`Action dynamique Laura sans effet : ${value}`);

const storage=new Map(),listeners={};
const element=()=>({innerHTML:'',scrollTop:0,dataset:{},classList:{add(){},toggle(){}},append(){},after(){},remove(){},querySelector(){return null},querySelectorAll(){return []},scrollIntoView(){},focus(){}});
const dom=Object.fromEntries(['#app','#overlay-root','#toast-root','#laura-root','#page-scroll'].map(key=>[key,element()]));
globalThis.document={querySelector:key=>dom[key]||null,getElementById:id=>dom[`#${id}`]||null,createElement:element,documentElement:{dataset:{}},body:{classList:{toggle(){}}},addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.window={addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.location={hash:'#today'};
globalThis.history={replaceState(_state,_title,hash){location.hash=hash}};
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
globalThis.requestAnimationFrame=fn=>fn();
const form=fields=>{const value=new FormData();for(const [key,entry] of Object.entries(fields))value.set(key,String(entry));return value};
let org=emptyOrganization();
for(const [kind,fields] of [['agency',{name:'Lyon',city:'Lyon'}],['team',{name:'Équipe Lyon'}],['unit',{name:'Data'}]]){
  if(kind!=='agency')fields.agencyId=org.agencies[0].id;
  const result=createOrganizationItem(org,kind,form(fields),'direction');assert.equal(result.error,undefined);org=result.org;
}
const person=createOrganizationItem(org,'person',form({name:'Maëlle',teamId:org.teams[0].id,role:'Business Manager'}),'direction');
assert.equal(person.error,undefined);org=person.org;
let workflow=emptyWorkflow();
const today=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})();
for(const [kind,fields] of [['goal',{metric:'starts',period:'month',target:22,goalScope:'global'}],['touch',{title:'Prospection Lyon',channel:'email',date:today,count:2,agencyId:org.agencies[0].id,ownerId:org.people[0].id}],['action',{title:'Relancer Lyon',due:today,agencyId:org.agencies[0].id,ownerId:org.people[0].id}],['meeting',{title:'RDV Lyon',date:today,time:'10:00',agencyId:org.agencies[0].id,ownerId:org.people[0].id}],['invoice',{title:'Facture Lyon',amount:1000,due:today,agencyId:org.agencies[0].id}]]){
  const result=createPersonalItem(workflow,kind,form(fields),org,'direction');assert.equal(result.error,undefined,`${kind}: ${result.error}`);workflow=result.workflow;
}
const report=buildActivityReport(workflow,org,'week',{city:'all',agency:'all',unit:'all',role:'direction',companyName:'Altimance'});
const state=(mode,role,extra={})=>({mode,role,profile:{firstName:'Maëlle',companyName:'Altimance',jobRole:role,companyLocations:'Lyon',goalMetric:'starts',goalPeriod:'month',goalTarget:'22'},organization:org,personalWorkflows:workflow,reports:[report],...extra});
const seen={action:new Set(),change:new Set(),route:new Set(),anchor:new Set(),laura:new Set(),form:new Set()};
const scan=(html,label)=>{
  for(const [key,regex] of [['action',/data-action="([a-z-]+)"/g],['change',/data-change="([a-z-]+)"/g],['route',/data-route="([^"]+)"/g],['anchor',/data-anchor="([a-z-]+)"/g],['laura',/data-laura="([a-z-]+)"/g],['form',/data-(?:profile-form|org-form|org-edit|pw-form)(?:="([a-z-]*)")?/g]])for(const value of values(html,regex))seen[key].add(value);
  if(/data-plan-form\b/.test(html))seen.form.add('annual-plan');
  if(/data-finance-form\b/.test(html))seen.form.add('finance-calculator');
  for(const match of html.matchAll(/<button\b[^>]*>/g)){
    const tag=match[0];
    assert.ok(/data-(?:action|route|anchor|laura)=/.test(tag)||/type="submit"/.test(tag)||/\sdisabled(?:[\s>]|=)/.test(tag),`Bouton sans destination ni validation sur ${label}: ${tag.slice(0,145)}`);
  }
  for(const match of html.matchAll(/<a\b[^>]*>/g))assert.ok(/href="[^"]+"/.test(match[0]),`Lien sans destination sur ${label}`);
  for(const match of html.matchAll(/<select\b[^>]*>/g))assert.ok(/data-(?:change|outcome-id|laura-recipient)=|name="[^"]+"/.test(match[0]),`Sélecteur sans traitement sur ${label}: ${match[0].slice(0,130)}`);
};
let n=0;
async function capture(mode,role,hash,extra={}){
  location.hash=hash;
  storage.set('bellum-white-commercial-v1',JSON.stringify(state(mode,role,extra)));
  await import(`../dist/performance.js?controls=${++n}`);
  scan(dom['#app'].innerHTML+dom['#overlay-root'].innerHTML+dom['#laura-root'].innerHTML,`${mode}/${role}/${hash}`);
}
await capture('choose','sales','#today');
for(const role of ['direction','manager','sales']){
  for(const page of ['today','agenda','team','pilotage'])await capture('scenario',role,`#${page}`);
  for(const tab of ['vue','objectifs','plans','recherches','activite','administration'])if(role!=='sales'&&!(role==='manager'&&tab==='administration'))await capture('scenario',role,`#team?tab=${tab}`);
  for(const section of ['cockpit','pipe','staffing','finance'])await capture('scenario',role,`#pilotage?section=${section}`);
}
for(const role of ['direction','manager','sales']){
  for(const page of ['today','agenda','team','pilotage'])await capture('personal',role,`#${page}`);
  for(const tab of ['vue','objectifs','plans','recherches','activite','administration'])await capture('personal',role,`#team?tab=${tab}`);
  for(const section of ['cockpit','pipe','staffing','finance'])await capture('personal',role,`#pilotage?section=${section}`);
}
await capture('personal','direction','#team?tab=administration',{adminSub:'report',reportActiveId:report.id,reportPreview:true});
await capture('personal','direction','#team?tab=administration',{adminSub:'report',reportActiveId:null});
for(const view of ['performance','team','affaires','finance'])await capture('scenario','direction','#team?tab=administration&city=Lyon',{adminView:view});
const interact=(action,id='',value='',kind='')=>{
  const node={dataset:{action,id,value,kind},classList:{contains:()=>false}};
  listeners.click({target:{closest:()=>node},preventDefault(){}});
  listeners.hashchange();
  scan(dom['#app'].innerHTML+dom['#overlay-root'].innerHTML+dom['#laura-root'].innerHTML,`après ${action}`);
};
await capture('scenario','direction','#pilotage?section=pipe');
const stage=dom['#app'].innerHTML.match(/data-action="pipe-stage" data-value="([^"]+)"/);
assert.ok(stage,'Le graphe des étapes doit pouvoir filtrer');
interact('pipe-stage','',stage[1]);
await capture('scenario','direction','#team?tab=activite');
const hour=dom['#app'].innerHTML.match(/data-action="heatmap-hour" data-value="([^"]+)"/);
assert.ok(hour,'Une heure documentée ouvre le journal filtré');
interact('heatmap-hour','',hour[1]);
await capture('scenario','direction','#today');
const dealId=dom['#app'].innerHTML.match(/data-action="deal" data-id="([^"]+)"/)?.[1];
assert.ok(dealId);
interact('deal',dealId);
await capture('scenario','direction','#today',{dayTab:'flux'});
await capture('scenario','direction','#pilotage?section=staffing');
const buId=dom['#app'].innerHTML.match(/data-action="bu" data-id="([^"]+)"/)?.[1];
assert.ok(buId);
interact('bu',buId);
await capture('scenario','direction','#pilotage?section=finance');
const invoiceId=dom['#app'].innerHTML.match(/data-action="invoice" data-id="([^"]+)"/)?.[1];
assert.ok(invoiceId);
interact('invoice',invoiceId);
let financeRecords=[];
for(const [personId,month] of [['nora','2026-11'],['ines','2026-10']]){
  const result=saveFinanceRecord(financeRecords,form({personId,month,salaryMode:'loaded',loadedCost:5000,billed:20000,margin:8000,collected:15000,otherCost:500,fixedBonus:300,commissionBase:'margin',commissionRate:5,bonusEmployerRate:40}),{workspaceKey:'example:groupe-sillage',people:MEMBERS,role:'direction',selectedId:'new'});
  assert.equal(result.error,undefined);
  financeRecords=result.records;
}
await capture('scenario','direction','#pilotage?section=finance',{financeRecords,financeSelectedId:financeRecords[0].id});
for(const action of ['finance-select','finance-new','finance-remove'])assert.ok(seen.action.has(action),`Action Finance non observée : ${action}`);
await capture('personal','direction','#team?tab=administration');
interact('org-edit',org.agencies[0].id,'','agency');
await capture('personal','direction','#team?tab=administration');
interact('org-archive',org.agencies[0].id,'','agency');
for(const action of seen.action)assert.ok(hasBranch(clickHandler,action),`Action rendue sans effet : ${action}`);
for(const change of seen.change)assert.ok(hasBranch(changeHandler,change),`Filtre rendu sans effet : ${change}`);
for(const route of seen.route)assert.ok(/^(today|agenda|team|pilotage)(\?|$)/.test(route),`Route inconnue : ${route}`);
for(const anchor of seen.anchor)assert.ok(['cockpit','pipe','staffing','finance'].includes(anchor),`Section inconnue : ${anchor}`);
for(const action of seen.laura)assert.ok(hasBranch(laura,action),`Action Laura rendue sans effet : ${action}`);
const deferred=[...actions].filter(action=>!seen.action.has(action));
assert.equal(deferred.length,0,`Actions source non montées : ${deferred.join(', ')}`);
console.log(`Inventaire : ${n} vues construites et états conditionnels ; ${actions.size} actions source, ${seen.action.size} rendues (+ rôles dynamiques) ; ${changes.size} sélecteurs source, ${seen.change.size} rendus ; ${seen.route.size} routes, ${seen.anchor.size} ancres, ${seen.form.size} types de formulaire, ${seen.laura.size} contrôles Laura. Tous ont un contrat de traitement.`);
console.log(`Contrôles conditionnels non montés dans les captures : ${deferred.join(', ')||'aucun'} (branche de traitement présente).`);
