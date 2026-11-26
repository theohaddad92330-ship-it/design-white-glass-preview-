#!/usr/bin/env node
// Une suggestion répond immédiatement, tandis qu'une passation reste validée.
import assert from 'node:assert/strict';
import {createLaura} from '../dist/laura.js';
import {BUS,DEALS,MEMBERS} from '../dist/performance-data.js';
import {emptyOrganization} from '../dist/organization.js';
import {emptyWorkflow} from '../dist/personal-workflows.js';

const listeners=[];
const host={innerHTML:'',contains(){return true},querySelector(){return null},querySelectorAll(){return []}};
globalThis.document={getElementById:id=>id==='laura-root'?host:null,addEventListener:(type,fn)=>{if(type==='click')listeners.push(fn)}};
const click=(kind,dataset={},card=null)=>{
  const node={dataset:{laura:kind,...dataset},closest:selector=>selector==='.laura-transfer'?card:node};
  listeners.at(-1)({target:{closest:()=>node}});
};
const personal=createLaura({getContext:()=>({mode:'personal',role:'direction',workspace:'Altimance',scopeLabel:'Espace local',profile:{firstName:'Maëlle',companyName:'Altimance'},organization:emptyOrganization(),workflow:emptyWorkflow(),deals:[],members:[]}),onOpenDeal(){},onNavigate(){},onTransfer(){throw Error('La suggestion locale ne doit rien transmettre')}});
personal.render();
assert.match(host.innerHTML,/Bonjour Maëlle.*Altimance/);
click('prompt',{prompt:'Où en sont mes objectifs ?'});
assert.match(host.innerHTML,/Vos caps déclarés/,'La suggestion doit afficher une réponse, sans second clic sur Envoyer');
assert.match(host.innerHTML,/Source : actions datées de cet espace/);
assert.match(host.innerHTML,/Aucun cap n’est encore saisi/);

let transferred=0;
const scenario=createLaura({getContext:()=>({mode:'scenario',role:'sales',workspace:'Groupe Sillage',scopeLabel:'Grands comptes · Paris',scopeCity:'Paris',scopeBu:'gc',rows:[BUS[0]],availableRows:[BUS[0]],deals:DEALS.filter(d=>d.bu==='gc'),availableDeals:DEALS.filter(d=>d.bu==='gc'),activities:[],availableActivities:[],members:MEMBERS.filter(m=>m.bu==='gc')}),onOpenDeal(){},onNavigate(){},onTransfer(){transferred++;return true}});
scenario.render();
click('prompt',{prompt:'Prépare une transmission à un collègue'});
assert.match(host.innerHTML,/Préparer la transmission de/);
assert.match(host.innerHTML,/data-laura="confirm-transfer"/);
assert.equal(transferred,0,'La suggestion prépare la passation sans la consigner');
const error={textContent:''};
const fields={select:{value:''},textarea:{value:'Note insuffisante'},'input[type="date"]':{value:'2026-01-01'},'.laura-transfer-error':error};
const card={querySelector:selector=>fields[selector]||null};
const node={dataset:{laura:'confirm-transfer',answerId:'1'},closest:selector=>selector==='.laura-transfer'?card:node};
const confirm=()=>listeners.at(-1)({target:{closest:selector=>selector==='[data-laura]'?node:card}});
confirm();
assert.equal(transferred,0,'Une passation incomplète est bloquée');
assert.match(error.textContent,/Choisissez un collègue/);
fields.select.value='elise';
fields.textarea.value='Élise reprend le dossier et la prochaine étape.';
const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+2);
fields['input[type="date"]'].value=`${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
confirm();
assert.equal(transferred,1,'La passation exige une validation explicite avec destinataire, note et date');
assert.match(host.innerHTML,/Transmission consignée/);
for(const prompt of ['Où en est le cap de 22 démarrages ?', 'Quelles factures sont échues ?', 'Qui est en retard ?', 'Qu’a fait mon équipe ?', 'Quels besoins sans profil ?']){
  click('prompt',{prompt});
  const visible=host.innerHTML.replace(/<[^>]+>/g,' ');
  assert.doesNotMatch(visible,/\b(?:hypoth[eè]ses?|simulations?|sc[eé]narios?|ficti(?:f|ve)s?|maquettes?|d[eé]monstrations?|illustrati(?:f|ve)s?)\b/i,`Laura répète le vocabulaire de maquette après « ${prompt} »`);
}
click('prompt',{prompt:'Où en est le cap de 22 démarrages ?'});
let capText=host.innerHTML.replace(/<[^>]+>/g,' ');
assert.match(capText,/16 démarrages sur 22/);
assert.match(capText,/6 démarrages à sécuriser/);
assert.match(capText,/La direction peut renseigner les taux/);
assert.match(capText,/Voir le cap dans Pilotage/);
assert.doesNotMatch(capText,/1[\s\u202f]?014|140\s*\+\s*65|Sollicitations par semaine/,'Sans taux saisis, Laura ne doit pas inventer de volume');

const plan={weeks:6,rates:{reply:20,meeting:25,need:50,start:25},emailShare:60,complete:true};
let activePlan=null;
const planned=createLaura({getContext:()=>({mode:'scenario',role:'direction',workspace:'Groupe Sillage',scopeLabel:'Toutes les BU',rows:BUS,availableRows:BUS,deals:DEALS,availableDeals:DEALS,activities:[],availableActivities:[],members:MEMBERS,annualPlan:activePlan}),onOpenDeal(){},onNavigate(){},onTransfer(){}});
planned.render();
click('prompt',{prompt:'Quelle cadence pour tenir les 22 démarrages ?'});
capText=host.innerHTML.replace(/<[^>]+>/g,' ');
assert.match(capText,/Paramétrer la cadence/);
assert.doesNotMatch(capText,/Sollicitations par semaine/);
activePlan=plan;
click('prompt',{prompt:'Quelle cadence pour tenir les 22 démarrages ?'});
capText=host.innerHTML.replace(/<[^>]+>/g,' ');
assert.match(capText,/160\s+par semaine sur 6 semaines/);
assert.match(capText,/96\s*·\s*64/,'La répartition 60 % e-mails et 40 % LinkedIn suit les taux saisis');
assert.match(capText,/taux saisis dans Pilotage/);
assert.doesNotMatch(capText,/140\s*\+\s*65|1[\s\u202f]?014/);
activePlan={...plan,rates:{...plan.rates,reply:0}};
const invalid=createLaura({getContext:()=>({mode:'scenario',role:'direction',workspace:'Groupe Sillage',scopeLabel:'Toutes les BU',rows:BUS,availableRows:BUS,deals:DEALS,availableDeals:DEALS,activities:[],availableActivities:[],members:MEMBERS,annualPlan:activePlan}),onOpenDeal(){},onNavigate(){},onTransfer(){}});
invalid.render();
click('prompt',{prompt:'Quelle cadence pour tenir les 22 démarrages ?'});
capText=host.innerHTML.replace(/<[^>]+>/g,' ');
assert.match(capText,/Paramétrer la cadence/);
assert.doesNotMatch(capText,/Sollicitations par semaine/,'Un taux invalide ne produit pas de cadence');
console.log('Laura : suggestion répond avec provenance ; passation bloquée puis confirmée explicitement OK');
