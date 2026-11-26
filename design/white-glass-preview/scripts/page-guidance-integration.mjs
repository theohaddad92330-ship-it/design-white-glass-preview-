#!/usr/bin/env node
// Parcours de première lecture : l'aide décrit la vue, les données gardent leur
// provenance et les filtres restent compréhensibles au clavier et au lecteur d'écran.
import assert from 'node:assert/strict';
import {renderFinanceCalculator,saveFinanceRecord} from '../dist/finance-calculator.js';

const storage=new Map(),listeners={};
const element=()=>({innerHTML:'',scrollTop:0,dataset:{},classList:{add(){},toggle(){}},append(){},after(){},remove(){},querySelector(){return null},querySelectorAll(){return []},scrollIntoView(){},focus(){}});
const dom=Object.fromEntries(['#app','#overlay-root','#toast-root','#laura-root','#page-scroll'].map(key=>[key,element()]));
globalThis.document={querySelector:key=>dom[key]||null,getElementById:id=>dom[`#${id}`]||null,createElement:element,documentElement:{dataset:{}},body:{classList:{toggle(){}}},addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.window={addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.location={hash:'#today'};
globalThis.history={replaceState(_state,_title,hash){location.hash=hash}};
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
globalThis.requestAnimationFrame=fn=>fn();

const text=html=>html.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/g,' ').replace(/\s+/g,' ').trim();
const main=html=>html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1]||'';
let serial=0;
async function capture({hash,mode='scenario',role='direction',dayTab='priorites',profile={}}){
  storage.set('bellum-white-commercial-v1',JSON.stringify({mode,role,dayTab,profile:{firstName:'Maëlle',companyName:'Altimance',jobRole:role,...profile}}));
  location.hash=hash;
  await import(`../dist/performance.js?guide-qa=${++serial}`);
  const html=dom['#app'].innerHTML;
  const body=main(html);
  assert.ok(body,`${hash} : page vide`);
  assert.equal((html.match(/<aside class="sidebar\b/g)||[]).length,1,`${hash} : un seul menu latéral`);
  assert.equal((html.match(/class="nav-parent active"/g)||[]).length,1,`${hash} : une seule entrée parente`);
  assert.equal((body.match(/class="preview-note"/g)||[]).length,1,`${hash} : un repère de provenance`);
  const guide=body.match(/<[^>]*class="[^"]*\bpage-guidance\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section|aside)>/);
  assert.ok(guide,`${hash} : aide contextuelle absente`);
  const copy=text(guide[1]);
  assert.ok(copy.length>=35&&copy.length<=320,`${hash} : aide trop vague ou trop longue (${copy.length})`);
  assert.ok(guide.index<body.indexOf('class="pilot-section"')||!body.includes('class="pilot-section"'),`${hash} : aide sous les résultats`);
  assert.doesNotMatch(copy,/\b(?:hypothèse|simulation|fictif|maquette|illustratif)\b/i,`${hash} : vocabulaire de fabrication`);
  for(const match of html.matchAll(/<select\b[^>]*>/g)){
    const tag=match[0],before=html.slice(0,match.index);
    const wrapped=before.lastIndexOf('<label')>before.lastIndexOf('</label');
    const named=/\b(?:aria-label|aria-labelledby|title)="[^"]+"/.test(tag);
    assert.ok(wrapped||named,`${hash} : menu déroulant sans nom accessible : ${tag}`);
  }
  const provenance=text(body.match(/<div class="preview-note"[^>]*>([\s\S]*?)<\/div>/)?.[1]||'');
  if(mode==='scenario')assert.match(provenance,/non synchronisées/i,`${hash} : chiffres d'exploration non signalés`);
  if(mode==='personal'){
    assert.match(provenance,/appareil.*(?:CRM|ATS).*non connectés/i,`${hash} : état local et intégrations non signalés`);
    assert.doesNotMatch(body,/Groupe Sillage/,`${hash} : données d'une autre ESN dans l'espace local`);
  }
  return copy;
}

const routes=[
  ['#today',/action|journée|priorit|affaire|contact/i],
  ['#agenda',/rendez-vous|agenda|prépar|événement/i],
  ['#team?tab=vue',/équipe|territoire|résultat|responsable|carte|portefeuille|commercial/i],
  ['#team?tab=objectifs',/objectif|affaire|résultat/i],
  ['#team?tab=plans',/action|échéance|relance|responsable/i],
  ['#team?tab=recherches',/signal|recherche|piste|qualif/i],
  ['#team?tab=activite',/activité|interaction|journal|échange/i],
  ['#team?tab=administration',/carte|agence|ville|business unit/i],
  ['#pilotage?section=cockpit',/objectif|cadence|performance|résultat/i],
  ['#pilotage?section=pipe',/affaire|pipe|dossier|étape/i],
  ['#pilotage?section=staffing',/besoin|profil|consultant|staffing/i],
  ['#pilotage?section=finance',/factur|encaisse|coût|finance/i]
];
const seen=new Set();
for(const [hash,purpose] of routes){
  const copy=await capture({hash});
  assert.match(copy,purpose,`${hash} : aide sans rapport avec la vue`);
  assert.ok(!seen.has(copy),`${hash} : aide recyclée d'une autre vue`);
  seen.add(copy);
}
const flux=await capture({hash:'#today',dayTab:'flux'});
assert.match(flux,/activit|journal|e-mail|LinkedIn|échange/i,'Le journal de Ma journée explique les canaux');
assert.ok(!seen.has(flux),'Le journal et les priorités ont besoin de guidages distincts');
for(const [hash] of routes)await capture({hash,mode:'personal'});
await capture({hash:'#pilotage?section=cockpit',mode:'personal',profile:{offerDomains:'Data, Cybersécurité',targetSectors:'Banque, Industrie',toolingCrm:'HubSpot',toolingAts:'BoondManager'}});
const localCockpit=main(dom['#app'].innerHTML);
assert.match(localCockpit,/Votre terrain commercial[\s\S]*Data[\s\S]*Banque[\s\S]*CRM : HubSpot[\s\S]*ATS : BoondManager/,'Le profil d’onboarding alimente le cockpit local');
assert.match(localCockpit,/Indiquer un outil ne le connecte pas/,'Le CRM et l’ATS déclarés ne doivent pas être présentés comme reliés');

// La finance garde l'entrée courte : le formulaire natif s'ouvre sur demande,
// puis le même calcul local peut être enregistré et relu.
const financeContext={workspaceKey:'company:altimance',people:[{id:'maelle',name:'Maëlle'}],role:'direction'};
const emptyFinance=renderFinanceCalculator([],financeContext);
assert.match(emptyFinance,/<details class="finance-editor"><summary>Renseigner un mois/,'Formulaire replié au premier regard');
assert.match(emptyFinance,/<form data-finance-form>/,'Formulaire disponible sous le volet');
const fields={personId:'maelle',month:'2026-11',salaryMode:'loaded',loadedCost:'4700',billed:'17000',margin:'7000',collected:'',otherCost:'0',fixedBonus:'0',commissionBase:'none',commissionRate:'',bonusEmployerRate:''};
const saved=saveFinanceRecord([],{get:key=>fields[key]??null},financeContext);
assert.equal(saved.error,undefined,'L’ouverture permet un calcul valide');
assert.match(renderFinanceCalculator(saved.records,{...financeContext,selectedId:saved.record.id}),/Contribution après coût commercial[\s\S]*2[\s\u202f\u00a0]?300\s*€/,'Le mois sauvegardé restitue un résultat');
console.log(`Guidage : ${routes.length+1} vues d'exploration et ${routes.length} vues locales ; provenance, menus et navigation vérifiés.`);
