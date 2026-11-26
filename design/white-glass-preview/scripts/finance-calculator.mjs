#!/usr/bin/env node
import assert from 'node:assert/strict';
import {calculateFinanceRecord,normalizeFinanceRecords,removeFinanceRecord,renderFinanceCalculator,saveFinanceRecord,syncFinanceSalaryMode} from '../dist/finance-calculator.js';

const people=[{id:'nora',name:'Nora Benali'},{id:'ines',name:'Inès Laurent'}];
const context={workspaceKey:'esn:groupe-sillage',people,role:'direction'};
const data=values=>({get:key=>values[key] ?? null});
const base={personId:'nora',month:'2026-11',salaryMode:'loaded',loadedCost:'5000',salaryGross:'',employerRate:'',billed:'20000',margin:'8000',collected:'15000',otherCost:'500',fixedBonus:'300',commissionBase:'margin',commissionRate:'5',bonusEmployerRate:'40'};

let html=renderFinanceCalculator([],context);
assert.match(html,/data-finance-calculator/);
assert.match(html,/data-finance-form/);
assert.match(html,/data-finance-salary="gross" hidden/,'Le brut et le taux sont masqués en mode coût chargé');
assert.match(html,/data-finance-salary="loaded" >/,'Le coût chargé est visible par défaut');
assert.doesNotMatch(html,/data-finance-result|Contribution après coût commercial/,'Pas de résultat avant saisie');
assert.match(renderFinanceCalculator([],{...context,people:[]}),/Créer une personne dans l’équipe/);
assert.doesNotMatch(renderFinanceCalculator([],{...context,role:'sales'}),/data-finance-form|Brut mensuel/,'Le salaire reste hors de vue pour les commerciaux');

let saved=saveFinanceRecord([],data(base),context);
assert.equal(saved.error,undefined);
assert.equal(saved.records.length,1);
const result=calculateFinanceRecord(saved.record);
assert.equal(result.salaryCost,5000);
assert.equal(result.rateBonus,400);
assert.equal(result.bonusGross,700);
assert.equal(result.bonusCharges,280);
assert.equal(result.totalBonus,980);
assert.equal(result.totalCost,6480);
assert.equal(result.contribution,1520);
assert.equal(result.collectionGap,5000);
html=renderFinanceCalculator(saved.records,{...context,selectedId:saved.record.id});
assert.match(html,/data-finance-result/);
assert.match(html,/1[\s\u202f\u00a0]?520\s*€/);
assert.match(html,/Marge attribuée/);
assert.match(html,/Coût commercial total/);
assert.match(html,/Mois renseignés/);
assert.match(html,/Vérifier un coût employeur avec l’Urssaf/);
assert.match(html,/<details class="finance-delete-confirm"><summary>Supprimer ce mois<\/summary>[\s\S]*data-action="finance-remove" data-id="[^"]+"/,'La suppression requiert l’ouverture de la confirmation puis un second clic');

const denied=saveFinanceRecord(saved.records,data({...base,margin:'9000'}),{...context,role:'manager'});
assert.match(denied.error,/Seule la direction/);
assert.equal(saved.records[0].margin,8000);
assert.match(saveFinanceRecord(saved.records,data({...base,commissionBase:'collected',collected:''}),context).error,/encaissé/);
assert.match(saveFinanceRecord(saved.records,data({...base,salaryMode:'gross',employerRate:''}),context).error,/taux de charges/);
assert.match(saveFinanceRecord(saved.records,data({...base,bonusEmployerRate:''}),context).error,/charges sur prime/);
const productionAheadOfInvoice=saveFinanceRecord(saved.records,data({...base,margin:'25000'}),{...context,selectedId:saved.record.id});
assert.equal(productionAheadOfInvoice.error,undefined,'Une marge de production peut dépasser le CA facturé du même mois');
assert.equal(calculateFinanceRecord(productionAheadOfInvoice.record).contribution,17330);
assert.match(saveFinanceRecord(saved.records,data({...base,month:'2026-13'}),context).error,/mois valides/);

let updated=saveFinanceRecord(saved.records,data({...base,margin:'7500',collected:''}),{...context,selectedId:saved.record.id});
assert.equal(updated.records.length,1,'Même personne/mois : édition, pas doublon');
assert.equal(updated.record.id,saved.record.id);
assert.equal(calculateFinanceRecord(updated.record).collectionGap,null,'Absence d’encaissé ≠ zéro');
assert.match(saveFinanceRecord(updated.records,data(base),context).error,/existe déjà/,'Une création sur une clé existante demande l’ouverture du mois');
assert.match(renderFinanceCalculator(updated.records,{...context,selectedId:'new'}),/Renseigner un mois/);
assert.doesNotMatch(renderFinanceCalculator(updated.records,{...context,selectedId:'new'}),/data-finance-result/);
assert.doesNotMatch(renderFinanceCalculator(updated.records,{...context,selectedId:'new'}),/data-action="finance-remove"/);

const gross=saveFinanceRecord(updated.records,data({...base,personId:'ines',month:'2026-10',salaryMode:'gross',salaryGross:'4000',employerRate:'45',loadedCost:'',billed:'12000',margin:'6000',collected:'',otherCost:'0',fixedBonus:'0',commissionBase:'none',commissionRate:'',bonusEmployerRate:''}),context);
assert.equal(gross.error,undefined);
assert.equal(calculateFinanceRecord(gross.record).salaryCost,5800);
assert.equal(calculateFinanceRecord(gross.record).contribution,200);
assert.equal(gross.records.length,2);
html=renderFinanceCalculator(gross.records,{...context,selectedId:gross.record.id});
assert.match(html,/data-finance-salary="loaded" hidden/);
assert.match(html,/data-finance-salary="gross" >/);
const groups=[{dataset:{financeSalary:'loaded'},hidden:false},{dataset:{financeSalary:'gross'},hidden:true}];
const form={querySelector:()=>({value:'gross'}),querySelectorAll:()=>groups};
assert.equal(syncFinanceSalaryMode(form),true);
assert.deepEqual(groups.map(group=>group.hidden),[true,false]);
assert.equal(syncFinanceSalaryMode({querySelector:()=>({value:'bad'})}),false);

const second=saveFinanceRecord(gross.records,data({...base,month:'2026-12',margin:'-1000',billed:'10000',commissionBase:'margin',commissionRate:'10',fixedBonus:'0',otherCost:'0'}),context);
assert.equal(second.error,undefined);
assert.equal(calculateFinanceRecord(second.record).rateBonus,0,'Pas de prime sur marge négative');
assert.equal(calculateFinanceRecord(second.record).marginToCover,6000);
html=renderFinanceCalculator(second.records,{...context,selectedId:second.record.id});
assert.match(html,/2026|décembre/);
assert.match(html,/finance-trend-month/);

const moved=saveFinanceRecord(second.records,data({...base,personId:'ines',month:'2026-09',margin:'7000'}),{...context,selectedId:second.record.id});
assert.equal(moved.error,undefined);
assert.equal(moved.records.length,3,'Déplacer un mois/personne remplace la ligne sélectionnée');
assert.equal(moved.record.id,second.record.id,'Identité conservée pendant l’édition');
assert.ok(!moved.records.some(item=>item.personId==='nora'&&item.month==='2026-12'));
assert.match(saveFinanceRecord(second.records,data({...base,personId:'ines',month:'2026-10'}),{...context,selectedId:saved.record.id}).error,/existe déjà/,'Une collision ne doit pas écraser le mois d’un collègue');
assert.match(saveFinanceRecord(second.records,data(base),{...context,selectedId:'id-autre-esn'}).error,/n’existe plus dans cet espace/);

assert.doesNotMatch(renderFinanceCalculator(second.records,{...context,workspaceKey:'esn:autre'}),/data-finance-result|finance-record-list/,'Isolation des calculs entre espaces');
assert.match(removeFinanceRecord(second.records,second.record.id,{...context,role:'sales'}).error,/Seule la direction/);
assert.equal(removeFinanceRecord(second.records,second.record.id,context).records.length,2);
const crossWorkspace={...second.record,workspaceKey:'esn:autre',personId:'autre'};
const scopedRemoval=removeFinanceRecord([...second.records,crossWorkspace],second.record.id,context);
assert.equal(scopedRemoval.records.length,3);
assert.ok(scopedRemoval.records.some(item=>item.workspaceKey==='esn:autre'&&item.id===second.record.id),'Un ID commun ne doit pas supprimer un autre espace');
assert.match(removeFinanceRecord([...second.records,{...second.record}],second.record.id,context).error,/ambigu/,'Un doublon d’ID dans le même espace ne doit supprimer personne');
assert.equal(normalizeFinanceRecords(null).length,0);
console.log('Finance : calculs, primes, coût CDI, mois, droits, isolation et absence de donnée vérifiés');
