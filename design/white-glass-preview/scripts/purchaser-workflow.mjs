#!/usr/bin/env node
// Parcours d'achat : la première lecture doit mener au dossier et à la décision.
import assert from 'node:assert/strict';
import { BUS, EVENTS, INVOICES } from '../dist/performance-data.js';

const storage = new Map();
const listeners = {};
const element = () => ({
  innerHTML: '', scrollTop: 0, dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
  append() {}, after() {}, remove() {}, querySelector() { return null },
  querySelectorAll() { return [] }, scrollIntoView() {}, focus() {},
});
const dom = Object.fromEntries(['#app', '#overlay-root', '#toast-root', '#laura-root', '#page-scroll'].map(key => [key, element()]));
let lauraTriggerClicks = 0;
globalThis.document = {
  querySelector: key => key === '#laura-root [data-laura="toggle"]' ? { click() { lauraTriggerClicks++ } } : dom[key] || null,
  getElementById: id => dom[`#${id}`] || null,
  createElement: element,
  documentElement: { dataset: {} },
  body: { classList: { toggle() {} } },
  addEventListener(key, fn) { listeners[key] = fn },
};
globalThis.window = { addEventListener(key, fn) { listeners[key] = fn } };
globalThis.location = { hash: '#today' };
globalThis.history = { replaceState(_state, _title,hash) { location.hash = hash } };
globalThis.localStorage = {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
};
globalThis.requestAnimationFrame = fn => fn();
globalThis.FormData = class {
  constructor(form) { this.values = form?.values || {} }
  get(key) { return this.values[key] ?? null }
};

let serial = 0;
async function visit(role, hash, extra = {}) {
  location.hash = hash;
  storage.set('bellum-white-commercial-v1', JSON.stringify({ mode: 'scenario', role, teamTab: 'vue', pilotSection: 'cockpit', ...extra }));
  await import(`../dist/performance.js?paid-workflow=${++serial}`);
  return dom['#app'].innerHTML;
}
function click(action, id, value = '', extra = {}) {
  const node = { dataset: { action, id, value, ...extra }, classList: { contains: () => false } };
  listeners.click({ target: { closest: () => node }, preventDefault() {} });
  listeners.hashchange?.();
}

// Le lien de revue doit montrer un cockpit utile dès un navigateur vierge,
// tout en marquant explicitement qu'il s'agit du portefeuille d'exemple.
storage.clear();
location.hash='#today';
await import(`../dist/performance.js?paid-workflow=fresh-${++serial}`);
assert.match(dom['#app'].innerHTML,/Bonjour Pierre/,'Une première visite ouvre Ma journée');
assert.match(dom['#app'].innerHTML,/Données d’exemple arrêtées au 25 nov\. 2026 · non synchronisées/,'Le portefeuille d’exemple reste identifié');
assert.match(dom['#app'].innerHTML,/value="personal"/,'La configuration de son propre espace reste accessible');

let html = await visit('direction', '#today');
assert.match(html, /Pierre/,'La Direction reconnaît son prénom dès l’arrivée');
assert.match(html, /Groupe Sillage/,'Le périmètre de l’entreprise est visible');
assert.match(html, /data-action="deal"/,'Une affaire prioritaire ouvre son dossier');
assert.match(html, /priority-deal-follow[\s\S]*?data-action="deal"/,'Un dossier suivi reste visible dès le premier écran');
assert.match(html, /data-action="ask-laura"/);
click('ask-laura');
assert.equal(lauraTriggerClicks,1,'Le CTA du cockpit appelle la bulle Laura');

html = await visit('sales', '#today', { dayTab: 'priorites' });
assert.match(html, /Nora/,'Le Business Manager reconnaît son espace');
assert.match(html, /data-action="deal"/,'Les priorités relient une affaire à son action');
const prioritySection=html.match(/<section class="glass card" id="priority-actions">[\s\S]*?<\/section>/)?.[0];
assert.ok(prioritySection);
assert.doesNotMatch(prioritySection,/Désigner un responsable|À attribuer/,'Le commercial ne reçoit pas une attribution qu’il ne peut pas effectuer');
const salesMeetingGap=html.match(/data-action="route-agenda"><strong>(\d+)<\/strong>/)?.[1];
assert.equal(salesMeetingGap,'1','Le retard de RDV du commercial se calcule sur sa cible 2 et son réalisé 1, pas sur le groupe');
html = await visit('sales', '#today', { dayTab: 'flux' });
assert.match(html, /class="glass card deal-focus-card"/,'Le flux donne d’abord une carte d’affaires à faire avancer');
assert.match(html, /data-action="deal"/,'Chaque priorité conserve son dossier');
const dealSection=html.match(/<section class="glass card deal-focus-card">[\s\S]*?<\/section>/)?.[0];
assert.ok(dealSection);
assert.doesNotMatch(dealSection,/Désigner un responsable|À attribuer/,'Le flux ne propose pas de tâche inopérante au commercial');
assert.match(html, /personal-cadence/,'La cadence du commercial utilise ses propres mesures');
assert.doesNotMatch(html, /day-barcode/,'Le graphe groupe ne doit pas être attribué au commercial');
assert.match(html, /data-action="ask-laura"/);
click('ask-laura');
assert.equal(lauraTriggerClicks,2,'Le CTA Laura fonctionne aussi pour le Business Manager');

html = await visit('manager', '#today');
const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const parisIds=new Set(BUS.filter(bu=>bu.city==='Paris').map(bu=>bu.id));
const parisMeetings=EVENTS.filter(event=>parisIds.has(event.bu)&&event.date>=today&&event.status==='upcoming'&&['Client','Entretien'].includes(event.kind)).length;
const managerMeetingSignal=html.match(/data-action="route-agenda"><strong>(\d+)<\/strong>/)?.[1];
assert.equal(Number(managerMeetingSignal),parisMeetings,'Le responsable voit les rendez-vous à préparer à Paris, pas un écart à la cible nationale');
html = await visit('direction','#today',{city:'Lyon'});
const lyonIds=new Set(BUS.filter(bu=>bu.city==='Lyon').map(bu=>bu.id));
const lyonMeetings=EVENTS.filter(event=>lyonIds.has(event.bu)&&event.date>=today&&event.status==='upcoming'&&['Client','Entretien'].includes(event.kind)).length;
const lyonSignal=html.match(/data-action="route-agenda"><strong>(\d+)<\/strong>/)?.[1];
assert.equal(Number(lyonSignal),lyonMeetings,'La direction filtrée sur Lyon ne reçoit pas la cible nationale');
html = await visit('direction','#today',{city:'Nantes'});
const nantesIds=new Set(BUS.filter(bu=>bu.city==='Nantes').map(bu=>bu.id));
const nantesMeetings=EVENTS.filter(event=>nantesIds.has(event.bu)&&event.date>=today&&event.status==='upcoming'&&['Client','Entretien'].includes(event.kind)).length;
assert.equal(Number(html.match(/data-action="route-agenda"><strong>(\d+)<\/strong>/)?.[1]),nantesMeetings,'Un rendez-vous passé ne devient pas une préparation à venir');
assert.doesNotMatch(html,/data-action="event" data-id="E-4"/,'La première page ne propose pas un ancien rendez-vous comme prochain créneau');
html = await visit('direction','#agenda',{city:'Nantes'});
const prepare=html.match(/<section class="glass card"><div class="section-title"><div><h2>À préparer<\/h2>[\s\S]*?<\/section>/)?.[0];
assert.ok(prepare,'La section de préparation reste visible sans prochain RDV');
assert.doesNotMatch(prepare,/data-id="E-4"/,'L’agenda ne prépare plus un créneau passé');

html = await visit('sales', '#agenda');
assert.match(html, /data-action="event"/,'Un rendez-vous ouvre son contexte');
const eventId = html.match(/data-action="event" data-id="([^"]+)"/)?.[1];
assert.ok(eventId);
click('event', eventId);
assert.match(dom['#overlay-root'].innerHTML, /data-action="deal"/,'Le rendez-vous commercial mène à l’affaire liée');

html = await visit('direction', '#pilotage?section=staffing');
assert.match(html, /staffing-insight/,'La couverture doit expliquer son enjeu commercial');
assert.match(html, /class="[^"]*bu-coverage-card[^"]*" data-action="bu"/,'Chaque BU donne un accès direct au détail');
assert.match(html, /client-logo-stack/,'Les comptes éclairent la lecture des BU');
const buId = html.match(/bu-coverage-card[^>]*data-action="bu" data-id="([^"]+)"/)?.[1];
assert.ok(buId);
click('bu',buId);
assert.match(dom['#overlay-root'].innerHTML, /bu-linked-deals/,'La synthèse BU liste ses dossiers contributeurs');
assert.match(dom['#overlay-root'].innerHTML, /data-action="deal"/,'Une affaire BU reste actionnable');

html = await visit('direction', '#pilotage?section=finance');
assert.match(html, /finance-lab/,'Finance héberge un espace de calcul utile');
assert.match(html, /data-finance-calculator/,'Le calculateur est visible depuis Pilotage');
assert.match(html, /data-finance-form/,'Les paramètres sont éditables');
assert.doesNotMatch(html, /data-finance-result/,'Sans saisie, aucun profit ou coût salarié ne doit être fabriqué');
html = await visit('direction', '#pilotage?section=finance',{city:'Nantes'});
const nantesInvoices=INVOICES.filter(invoice=>nantesIds.has(invoice.bu));
assert.equal((html.match(/class="invoice-row"/g)||[]).length,nantesInvoices.filter(invoice=>invoice.status!=='paid').length,'Le registre reprend les factures ouvertes du périmètre Nantes');
assert.match(html,/Échu · périmètre<\/span><strong>18,6 k€<\/strong>/,'La tuile échue suit le même périmètre que le registre');
assert.match(html,/Encaissé · factures suivies<\/span><strong>0 k€<\/strong>/,'Aucun encaissement d’une autre BU ne remonte à Nantes');
html = await visit('direction', '#pilotage?section=finance');
const financeForm={dataset:{financeForm:''},values:{personId:'nora',month:'2026-11',salaryMode:'loaded',loadedCost:'5000',billed:'20000',margin:'8000',collected:'15000',otherCost:'500',fixedBonus:'300',commissionBase:'margin',commissionRate:'5',bonusEmployerRate:'40'}};
listeners.submit({target:{closest:()=>financeForm},preventDefault(){}});
const financeRecords=JSON.parse(storage.get('bellum-white-commercial-v1')).financeRecords;
assert.equal(financeRecords.length,1,'La saisie Finance est enregistrée pour ce commercial et ce mois');
assert.match(dom['#app'].innerHTML,/data-finance-result/,'Le résultat apparaît après la saisie');
assert.match(dom['#app'].innerHTML,/1[\s\u202f\u00a0]?520\s*€/,'8 000 € de marge − 5 000 € CDI − 980 € de prime chargée − 500 € de coûts = 1 520 €');
html = await visit('manager', '#pilotage?section=finance',{financeRecords});
assert.doesNotMatch(html, /data-finance-form/,'Un responsable d’agence ne saisit pas les rémunérations de l’équipe');
assert.doesNotMatch(html, /data-finance-result/,'Les coûts individuels restent réservés à la direction');
click('finance-remove',financeRecords[0].id,'',{personId:'nora'});
assert.equal(JSON.parse(storage.get('bellum-white-commercial-v1')).financeRecords.length,1,'Le responsable d’agence ne supprime pas un calcul de la direction');
html = await visit('direction', '#pilotage?section=finance',{financeRecords,financeSelectedId:financeRecords[0].id});
assert.match(html,/<details class="finance-delete-confirm"><summary>Supprimer ce mois<\/summary>[\s\S]*data-action="finance-remove"/,'Une suppression nécessite de déplier la confirmation');
click('finance-remove',financeRecords[0].id,'',{personId:'nora'});
assert.equal(JSON.parse(storage.get('bellum-white-commercial-v1')).financeRecords.length,0,'La confirmation efface le mois dans cet espace');
assert.doesNotMatch(dom['#app'].innerHTML,/data-finance-result/,'Le résultat supprimé disparaît du Pilotage');

location.hash = '#today';
storage.set('bellum-white-commercial-v1', JSON.stringify({
  mode: 'personal', role: 'direction',
  profile: { firstName: 'Maëlle', companyName: 'Altimance', jobRole: 'direction' },
}));
await import(`../dist/performance.js?paid-workflow=${++serial}`);
assert.match(dom['#app'].innerHTML, /Maëlle/);
assert.match(dom['#app'].innerHTML, /Altimance/);

console.log('Parcours acheteur : accueil personnalisé, affaires BM, agenda relié, BU détaillée et Finance paramétrable OK');
