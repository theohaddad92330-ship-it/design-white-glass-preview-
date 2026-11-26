#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const name of ['performance-data','performance','laura']){
  const source=await readFile(new URL(`../dist/${name}.js`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bderiveReversePlan\(\s*\)/,`${name} réintroduit un calcul sans taux renseignés`);
}

const storage=new Map([['bellum-white-commercial-v1',JSON.stringify({mode:'scenario',role:'direction',city:'all',bu:'all',pilotSection:'cockpit'})]]);
const listeners={};
const element=()=>({innerHTML:'',scrollTop:0,dataset:{},classList:{add(){},toggle(){}},append(){},after(){},remove(){},querySelector(){return null},querySelectorAll(){return []},scrollIntoView(){},focus(){}});
const dom=Object.fromEntries(['#app','#overlay-root','#toast-root','#laura-root','#page-scroll'].map(key=>[key,element()]));
globalThis.document={querySelector:key=>dom[key]||null,getElementById:id=>dom[`#${id}`]||null,createElement:element,documentElement:{dataset:{}},body:{classList:{toggle(){}}},addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.window={addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.location={hash:'#pilotage?section=cockpit'};
globalThis.history={replaceState(_state,_title,hash){location.hash=hash}};
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
globalThis.requestAnimationFrame=fn=>fn();
globalThis.FormData=class{constructor(form){this.values=new Map(Object.entries(form.values||{}))}get(key){return this.values.get(key)}};
await import('../dist/performance.js?qa=annual-plan');

const html=()=>dom['#app'].innerHTML;
const saved=()=>JSON.parse(storage.get('bellum-white-commercial-v1'));
const submit=values=>{
  const form={dataset:{planForm:''},values};
  listeners.submit({target:{closest:()=>form},preventDefault(){}});
};
assert.match(html(),/16 démarrages réalisés sur 22 · 6 à sécuriser/);
assert.match(html(),/data-plan-form/);
assert.doesNotMatch(html(),/1[\s\u202f\u00a0]?014 sollicitations/);
assert.doesNotMatch(html(),/140 e-mails \+ 65/);
assert.equal(saved().annualPlan,null,'Aucun taux de conversion ne doit être attribué automatiquement');

const valid={weeks:'5',reply:'15',meeting:'25',need:'40',start:'20',emailShare:'70'};
submit({...valid,need:''});
assert.equal(saved().annualPlan,null,'Une saisie partielle ne doit pas produire de plan');
submit({...valid,reply:'0'});
assert.equal(saved().annualPlan,null,'Un taux nul ne doit pas produire de division');
submit({...valid,weeks:'2.5'});
assert.equal(saved().annualPlan,null,'L’horizon doit être entier');
submit(valid);
assert.deepEqual(saved().annualPlan,{weeks:5,rates:{reply:15,meeting:25,need:40,start:20},emailShare:70});
assert.match(html(),/2[\s\u202f\u00a0]?000/,'Les six démarrages restants doivent être calculés, sans soustraire le pipe');
assert.match(html(),/400 sollicitations par semaine/);
assert.match(html(),/280 e-mails · 120 approches LinkedIn/);
assert.match(html(),/les objectifs de la semaine restent distincts/);
assert.match(html(),/Modifier le plan/);

submit({...valid,reply:'30',emailShare:'50'});
assert.equal(saved().annualPlan.rates.reply,30,'Le plan doit être modifiable');
assert.match(html(),/100 e-mails · 100 approches LinkedIn/);

storage.set('bellum-white-commercial-v1',JSON.stringify({mode:'scenario',role:'manager',annualPlan:null}));
location.hash='#pilotage?section=cockpit';
await import('../dist/performance.js?qa=annual-plan-manager');
assert.doesNotMatch(html(),/data-plan-form/,'Le plan global ne doit pas proposer son formulaire au manager');
submit(valid);
assert.equal(saved().annualPlan,null,'Le responsable ne peut pas modifier le plan global');
console.log('Plan annuel : sans taux inventés, validation stricte, calcul non pondéré, répartition et droits OK');
