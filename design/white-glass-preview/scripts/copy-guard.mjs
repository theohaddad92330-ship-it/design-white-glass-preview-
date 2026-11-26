#!/usr/bin/env node
// Recette de microcopie des vues construites, sans confondre données d'exemple
// et faits d'un espace connecté. Le repère global vit dans `.preview-note`.
import assert from 'node:assert/strict';
import {emptyOrganization,createOrganizationItem} from '../dist/organization.js';
import {emptyWorkflow,createPersonalItem} from '../dist/personal-workflows.js';
import {buildActivityReport} from '../dist/activity-report.js';

const storage=new Map(),listeners={};
const element=()=>({innerHTML:'',scrollTop:0,dataset:{},classList:{add(){},toggle(){}},append(){},after(){},remove(){},querySelector(){return null},querySelectorAll(){return []},scrollIntoView(){},focus(){}});
const dom=Object.fromEntries(['#app','#overlay-root','#toast-root','#laura-root','#page-scroll'].map(key=>[key,element()]));
globalThis.document={querySelector:key=>dom[key]||null,getElementById:id=>dom[`#${id}`]||null,createElement:element,documentElement:{dataset:{}},body:{classList:{toggle(){}}},addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.window={addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.location={hash:'#today'};
globalThis.history={replaceState(_state,_title,hash){location.hash=hash}};
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
globalThis.requestAnimationFrame=fn=>fn();

// Les mots de maquette ne sont pas des informations métier. Une indication
// globale de provenance suffit ; les cartes doivent décrire données et gestes.
const metaWords=/\b(?:hypoth[eè]ses?|hypoth[eè]tiques?|simulations?|sc[eé]narios?|ficti(?:f|ve)s?|maquettes?|d[eé]monstrations?|illustrati(?:f|ve)s?|exemples?)\b/giu;
const visibleCopy=html=>{
  const withoutTags=html.replace(/<[^>]+>/g,' ');
  const accessible=[...html.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]+)"/g)].map(match=>match[1]);
  return [withoutTags,...accessible].join(' ').replace(/\s+/g,' ').trim();
};
const errors=[];
let n=0;
async function capture(mode,role,hash,extra={}){
  storage.set('bellum-white-commercial-v1',JSON.stringify({mode,role,profile:{firstName:'Maëlle',companyName:'Altimance',jobRole:role},...extra}));
  location.hash=hash;
  await import(`../dist/performance.js?copy=${++n}`);
  const app=dom['#app'].innerHTML;
  assert.equal((app.match(/class="preview-note"/g)||[]).length,1,`Provenance dupliquée : ${mode}/${role}/${hash}`);
  const main=app.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  assert.ok(main,`Contenu principal absent : ${mode}/${role}/${hash}`);
  const note=main.match(/<div class="preview-note"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(note,`Repère de provenance absent : ${mode}/${role}/${hash}`);
  const disclosure=visibleCopy(note);
  if(mode!=='choose')assert.match(disclosure,/navigateur|appareil|non synchronis[eé]es?|sans connexion/i,`Repère local trompeur : ${mode}/${role}/${hash}`);
  const content=main.replace(/<div class="preview-note"[^>]*>[\s\S]*?<\/div>/,'').replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/,'');
  const words=(visibleCopy(content).match(metaWords)||[]).filter(word=>mode!=='choose'||!/^exemples?$/i.test(word));
  if(words.length)errors.push(`${mode}/${role}/${hash}: ${words.join(', ')}`);
  const chrome=[...app.matchAll(/<(?:aside|header|footer)\b[^>]*>[\s\S]*?<\/(?:aside|header|footer)>/g)].map(match=>match[0]).join(' ');
  const chromeWords=(visibleCopy(chrome).match(metaWords)||[]).filter(word=>!/^exemples?$/i.test(word));
  if(chromeWords.length)errors.push(`Navigation ${mode}/${role}/${hash}: ${chromeWords.join(', ')}`);
  const laura=dom['#laura-root'].innerHTML;
  if(laura){
    const lauraContent=laura.replace(/<div class="laura-disclosure">[\s\S]*?<\/div>/,'');
    const lauraWords=visibleCopy(lauraContent).match(metaWords)||[];
    if(lauraWords.length)errors.push(`Laura ${mode}/${role}/${hash}: ${lauraWords.join(', ')}`);
  }
}
await capture('choose','direction','#today');
for(const mode of ['scenario','personal'])for(const role of ['direction','manager','sales']){
  for(const page of ['today','agenda','team','pilotage'])await capture(mode,role,`#${page}`);
  for(const tab of ['vue','objectifs','plans','recherches','activite','administration'])await capture(mode,role,`#team?tab=${tab}`);
  for(const section of ['cockpit','pipe','staffing','finance'])await capture(mode,role,`#pilotage?section=${section}`);
}
const form=fields=>{const data=new FormData();for(const [key,value] of Object.entries(fields))data.set(key,String(value));return data};
let org=emptyOrganization();
for(const [kind,fields] of [['agency',{name:'Lyon',city:'Lyon'}],['team',{name:'Équipe Lyon'}],['unit',{name:'Data'}]]){
  if(kind!=='agency')fields.agencyId=org.agencies[0].id;
  const result=createOrganizationItem(org,kind,form(fields),'direction');
  assert.equal(result.error,undefined);org=result.org;
}
const createdPerson=createOrganizationItem(org,'person',form({name:'Maëlle',teamId:org.teams[0].id,role:'Business Manager'}),'direction');
assert.equal(createdPerson.error,undefined);org=createdPerson.org;
let workflow=emptyWorkflow();
const createdGoal=createPersonalItem(workflow,'goal',form({metric:'starts',period:'month',target:22,goalScope:'global'}),org,'direction');
assert.equal(createdGoal.error,undefined);workflow=createdGoal.workflow;
for(const tab of ['vue','objectifs','plans','recherches','activite','administration'])await capture('personal','direction',`#team?tab=${tab}`,{organization:org,personalWorkflows:workflow});
for(const page of ['today','agenda','pilotage'])await capture('personal','direction',`#${page}`,{organization:org,personalWorkflows:workflow});
const report=buildActivityReport(workflow,org,'week',{city:'all',agency:'all',unit:'all',role:'direction',companyName:'Altimance'});
await capture('personal','direction','#team?tab=administration',{organization:org,personalWorkflows:workflow,adminSub:'report',reports:[report],reportActiveId:report.id,reportPreview:true});
await capture('scenario','direction','#today',{dayTab:'flux'});
for(const view of ['performance','team','affaires','finance'])await capture('scenario','direction','#team?tab=administration&city=Lyon',{adminView:view});
// Les panneaux de détail ne sont pas inclus dans le contenu de la page.
// Les ouvrir évite qu'un ancien texte de maquette survive derrière un CTA.
for(const [hash,action] of [['#today','deal'],['#agenda','event'],['#pilotage?section=finance','invoice'],['#team?tab=vue','member']]){
  await capture('scenario','direction',hash);
  const id=dom['#app'].innerHTML.match(new RegExp(`data-action="${action}" data-id="([^"]+)"`))?.[1];
  assert.ok(id,`Aucun ${action} à ouvrir sur ${hash}`);
  const node={dataset:{action,id},classList:{contains:()=>false}};
  listeners.click({target:{closest:()=>node},preventDefault(){}});
  const drawer=visibleCopy(dom['#overlay-root'].innerHTML);
  const words=drawer.match(metaWords)||[];
  if(words.length)errors.push(`Détail ${hash}/${action}: ${words.join(', ')}`);
}
assert.equal(errors.length,0,`Microcopie de maquette répétée :\n${errors.join('\n')}`);
console.log(`Microcopie : ${n} vues rendues ; vocabulaire de maquette limité au repère de provenance, données locales signalées.`);
