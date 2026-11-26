#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createLaura} from '../dist/laura.js';

const listeners=[];
const host={innerHTML:'',contains(){return true},querySelector(){return null},querySelectorAll(){return []}};
globalThis.document={
  getElementById:id=>id==='laura-root'?host:null,
  addEventListener:(type,fn)=>{if(type==='click')listeners.push(fn)}
};
const ask=question=>{
  const node={dataset:{laura:'prompt',prompt:question}};
  listeners.at(-1)({target:{closest:()=>node}});
  return host.innerHTML.replace(/<[^>]+>/g,' ');
};
const workspaceKey='example:groupe-sillage';
const people=[{id:'nora',name:'Nora Benali'},{id:'ines',name:'Inès Laurent'}];
const record=(id,personId,margin,loadedCost)=>({
  id,workspaceKey,personId,month:'2026-11',salaryMode:'loaded',loadedCost,
  salaryGross:null,employerRate:null,billed:15000,collected:null,margin,
  otherCost:500,fixedBonus:200,commissionBase:'margin',commissionRate:5,bonusEmployerRate:20,
  updatedAt:'2026-11-25T15:00:00Z'
});
let records=[];
const getContext=()=>({
  mode:'scenario',role:'direction',workspace:'Groupe Sillage',scopeLabel:'Toutes les BU',
  finance:{workspaceKey,people,records,selectedId:null},
  rows:[],availableRows:[],deals:[],availableDeals:[],activities:[],availableActivities:[],members:[]
});
const laura=createLaura({getContext,onOpenDeal(){},onNavigate(){},onTransfer(){}});
laura.render();
let output=ask('Quel commercial couvre son coût ?');
assert.match(output,/Coût commercial à renseigner/);
assert.match(output,/marge brute attribuée, coût CDI chargé/);
assert.doesNotMatch(output,/contribution après coût\s*:\s*\d/);
records=[
  record('one','nora',7000,5000),
  record('two','ines',4000,6000),
  {...record('other','nora',100000,1),workspaceKey:'another:company'}
];
output=ask('Quel commercial couvre son coût ?');
assert.match(output,/1 commercial sur 2 couvre son coût/);
assert.match(output,/Nora Benali/);
assert.match(output,/Inès Laurent/);
assert.match(output,/840\s*€/);
assert.match(output,/-2\s*980\s*€/);
assert.doesNotMatch(output,/100\s*000\s*€/,'Une autre ESN ne doit pas apparaître');
assert.match(output,/Source : montants saisis par la Direction/);
output=ask('Nora Benali couvre-t-elle son coût ?');
assert.match(output,/Nora Benali · novembre 2026/);
assert.match(output,/7\s*000\s*€ de marge|Marge attribuée 7\s*000\s*€/);
assert.match(output,/840\s*€/);
assert.match(output,/550\s*€ de prime brute et 110\s*€ de charges/);
records=[record('two','ines',4000,6000)];
output=ask('Quel commercial couvre son coût ?');
assert.match(output,/Ce commercial ne couvre pas son coût/);
const sales=createLaura({getContext:()=>({...getContext(),role:'sales'}),onOpenDeal(){},onNavigate(){},onTransfer(){}});
sales.render();
output=ask('Quel est le salaire et la prime de Nora ?');
assert.match(output,/réservés à la Direction/);
assert.doesNotMatch(output,/6\s*000\s*€|4\s*000\s*€|-2\s*980\s*€/);
console.log('Laura Finance : mois, source, marge/coût/prime, isolation ESN et rôle Direction OK');
