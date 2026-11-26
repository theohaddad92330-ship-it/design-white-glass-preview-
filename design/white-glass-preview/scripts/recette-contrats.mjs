#!/usr/bin/env node
// Vérifie les contrats des 12 vues locales sans navigateur ni données fictives.
// Exécuter : node scripts/recette-contrats.mjs
import { emptyProfile, readProfile, personalHeading, identityStrip, applyProfileGoal } from '../dist/onboarding-profile.js';
import { emptyOrganization, createOrganizationItem, archiveOrganizationItem, organizationMap, organizationOverview } from '../dist/organization.js';
import { emptyWorkflow, createPersonalItem, togglePersonalItem, goalActual, effectivePersonGoals, renderPersonalWorkflows } from '../dist/personal-workflows.js';
import { renderPersonalSection } from '../dist/personal-sections.js';

const assert = (condition, reason) => { if (!condition) throw new Error(reason); };
const form = values => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, String(value)); return data; };
const selected = readProfile(form({ firstName: 'Maëlle', companyName: 'Altimance', jobRole: 'direction', goalMetric: 'starts', goalPeriod: 'month', goalTarget: 22, offerDomains: 'Data, cybersécurité' }));
assert(!selected.error, selected.error || 'Profil refusé');
const profile = selected.profile;
assert(!readProfile(form({ firstName: '', companyName: 'Altimance' })).profile, 'Prénom manquant accepté');

for (const route of ['today', 'agenda', 'team', 'pilotage']) {
  const title = personalHeading(profile, route).title;
  const strip = identityStrip(profile, route, emptyOrganization());
  assert(title.includes('Maëlle') || title.includes('Altimance'), `Personnalisation absente : ${route}`);
  assert(strip.includes('Altimance'), `ESN absente du contexte : ${route}`);
}

let workflow = applyProfileGoal(emptyWorkflow(), profile);
assert(workflow.goals.length === 1, 'Le cap déclaré doit être repris une fois');
assert(workflow.goals[0].target === 22 && /profil/i.test(workflow.goals[0].source), 'Source/cible du cap perdues');
assert(goalActual(workflow, workflow.goals[0]) === null, 'Un questionnaire ne doit pas inventer un réalisé');
workflow = applyProfileGoal(workflow, profile);
assert(workflow.goals.length === 1, 'Cap du questionnaire dupliqué');

let org = emptyOrganization();
const agency = createOrganizationItem(org, 'agency', form({ name: 'Agence Test Paris', city: 'Paris' }), 'direction');
assert(!agency.error && agency.org.agencies.length === 1, `Agence refusée : ${agency.error}`);
assert(createOrganizationItem(org, 'agency', form({ name: 'Agence X', city: 'Lyon' }), 'manager').error, 'Manager autorisé à créer une agence');
org = agency.org;
const team = createOrganizationItem(org, 'team', form({ name: 'Équipe conseil', agencyId: org.agencies[0].id }), 'manager');
assert(!team.error && team.org.teams.length === 1, `Équipe refusée : ${team.error}`);
org = team.org;
const unit = createOrganizationItem(org, 'unit', form({ name: 'BU Data', agencyId: org.agencies[0].id }), 'direction');
assert(!unit.error, `BU refusée : ${unit.error}`);
org = unit.org;
const person = createOrganizationItem(org, 'person', form({ name: 'Samira Test', teamId: org.teams[0].id, role: 'Business Manager' }), 'manager');
assert(!person.error, `Personne refusée : ${person.error}`);
org = person.org;
assert(organizationMap(org, 'all').includes('Paris'), 'Agence absente de la carte');
const originalId = org.agencies[0].id;
const archived = archiveOrganizationItem(org, 'agency', originalId, 'direction');
assert(!archived.error && archived.org.agencies[0].archivedAt, 'Archive agence refusée');
assert(createOrganizationItem(archived.org, 'team', form({name:'Équipe invisible',agencyId:originalId}), 'manager').error, 'Création acceptée sous une agence archivée');
const restored = archiveOrganizationItem(archived.org, 'agency', originalId, 'direction', true);
assert(!restored.error && restored.org.agencies[0].id === originalId && restored.org.teams[0].agencyId === originalId, 'Restauration perd les liens');
org = restored.org;
const hiddenTeam=archiveOrganizationItem(org,'team',org.teams[0].id,'manager');
const hiddenAgency=archiveOrganizationItem(hiddenTeam.org,'agency',originalId,'direction');
assert(archiveOrganizationItem(hiddenAgency.org,'team',org.teams[0].id,'manager',true).error,'Équipe restaurée sans son agence');
org=archiveOrganizationItem(hiddenAgency.org,'agency',originalId,'direction',true).org;
org=archiveOrganizationItem(org,'team',org.teams[0].id,'manager',true).org;
const lyon=createOrganizationItem(org,'agency',form({name:'Agence Lyon',city:'Lyon'}),'direction');
org=lyon.org;
org=createOrganizationItem(org,'team',form({name:'Équipe Lyon',agencyId:lyon.agency}),'manager').org;
org=createOrganizationItem(org,'person',form({name:'Alex Test',teamId:org.teams[1].id,role:'Business Manager'}),'manager').org;
assert(organizationOverview(org,{city:'Paris'}).includes('<span>1 personne</span>'),'Filtre ville compte des personnes hors périmètre');

const globalGoal=createPersonalItem(workflow,'goal',form({metric:'meetings',period:'week',target:8,goalScope:'global'}),org,'direction');
assert(!globalGoal.error,`Cap groupe refusé : ${globalGoal.error}`);
workflow=globalGoal.workflow;
const personId=org.people[0].id;
const individualGoal=createPersonalItem(workflow,'goal',form({metric:'meetings',period:'week',target:3,goalScope:'individual',ownerId:personId}),org,'direction');
assert(!individualGoal.error,`Cap individuel refusé : ${individualGoal.error}`);
workflow=individualGoal.workflow;
const goalId=workflow.goals.at(-1).id,initialSource=workflow.goals.at(-1).source;
assert(effectivePersonGoals(workflow,personId).find(x=>x.goal.metric==='meetings').goal.target===3,'La cible individuelle doit primer sur la cible groupe');
assert(createPersonalItem(workflow,'goal-edit',form({id:goalId,metric:'meetings',period:'week',target:5,goalScope:'individual',ownerId:personId}),org,'manager').error,'Un manager a modifié un cap individuel');
let edited=createPersonalItem(workflow,'goal-edit',form({id:goalId,metric:'meetings',period:'week',target:5,goalScope:'individual',ownerId:personId}),org,'direction');
assert(!edited.error,`Édition refusée : ${edited.error}`);
workflow=edited.workflow;
assert(effectivePersonGoals(workflow,personId).find(x=>x.goal.metric==='meetings').goal.target===5,'La cible modifiée ne recalcule pas la vue individuelle');
edited=createPersonalItem(workflow,'goal-edit',form({id:goalId,metric:'meetings',period:'month',target:6,goalScope:'individual',ownerId:personId}),org,'direction');
assert(!edited.error,`Changement de période refusé : ${edited.error}`);
workflow=edited.workflow;
assert(effectivePersonGoals(workflow,personId).some(x=>x.goal.id===goalId&&x.goal.period==='month'&&x.goal.target===6),'La période modifiée n’apparaît pas dans les cibles effectives');
assert(workflow.goals.find(g=>g.id===goalId).source===initialSource&&workflow.goals.find(g=>g.id===goalId).revisions.length===2,'La provenance ou l’historique du cap ont été perdus');
assert(renderPersonalWorkflows(workflow,org,'objectives',{role:'direction'}).includes('historique des cibles'),'L’historique du cap doit rester consultable');
assert(renderPersonalSection('team-objectifs',{workflow,organization:org,profile,role:'direction'}).includes('Cible 6 · réalisé inconnu'),'La vue Objectifs n’affiche pas la cible éditée');
const startsGoal=createPersonalItem(workflow,'goal',form({metric:'starts',period:'month',target:4,goalScope:'global'}),org,'direction');
assert(!startsGoal.error,`Cap démarrages groupe refusé : ${startsGoal.error}`);
workflow=startsGoal.workflow;
const startsId=workflow.goals.at(-1).id;
assert(createPersonalItem(workflow,'goal-progress',form({id:startsId,actual:2}),org,'manager').error,'Un manager a déclaré le réalisé d’un cap groupe');
assert(!renderPersonalSection('team-objectifs',{workflow,organization:org,profile,role:'manager'}).includes(`data-pw-form="goal-progress"><input type="hidden" name="id" value="${startsId}"`),'Formulaire de réalisé groupe exposé à un non-admin');
const declared=createPersonalItem(workflow,'goal-progress',form({id:startsId,actual:2}),org,'direction');
assert(!declared.error&&goalActual(declared.workflow,declared.workflow.goals.at(-1))===2,'La direction doit pouvoir déclarer le réalisé groupe');
workflow=declared.workflow;

const action = createPersonalItem(workflow, 'action', form({ title: 'Préparer le rendez-vous', due: '2026-12-02', agencyId: org.agencies[0].id }), org);
assert(!action.error, `Action refusée : ${action.error}`);
workflow = action.workflow;
const meeting = createPersonalItem(workflow, 'meeting', form({ title: 'Découverte client', date: '2026-12-03', time: '09:30' }), org);
assert(!meeting.error, `RDV refusé : ${meeting.error}`);
workflow = meeting.workflow;
assert(renderPersonalWorkflows(workflow, org, 'agenda').includes('Découverte client'), 'RDV absent de l’agenda');
assert(!renderPersonalSection('team-activite', { workflow, organization: org, profile }).includes('Préparer le rendez-vous'), 'Action encore ouverte comptée comme geste terminé');
const completed = togglePersonalItem(workflow, 'action', workflow.actions[0].id);
assert(!completed.error, `Action non clôturable : ${completed.error}`);
workflow = completed.workflow;
assert(renderPersonalSection('team-activite', { workflow, organization: org, profile }).includes('Préparer le rendez-vous'), 'Action terminée absente du journal');

const views = [
  ['team-vue', 'Qui travaille où ?'],
  ['team-objectifs', 'Cap et mesure'],
  ['team-plans', 'PLAN D’ACTION'],
  ['team-recherches', 'RECHERCHE · CONTEXTE DÉCLARÉ'],
  ['team-activite', 'Journal d’activité'],
  ['pilot-cockpit', 'Cap et mesure'],
  ['pilot-pipe', 'Aucune affaire reliée pour l’instant'],
  ['pilot-staffing', 'Suivre la couverture des besoins'],
  ['pilot-finance', 'Échéances à suivre'],
];
for (const [view, expected] of views) {
  const html = renderPersonalSection(view, { workflow, organization: org, profile });
  assert(html.includes(expected), `Vue ${view} sans question métier : ${expected}`);
  assert(!html.includes('Groupe Sillage') && !html.includes('Nora Benali'), `Fixture mêlée à ${view}`);
}
const objectives = renderPersonalSection('team-objectifs', { workflow, organization: org, profile });
assert(objectives.includes('réalisé inconnu') || objectives.includes('Non mesuré'), 'Objectif déclaré affiché comme réalisé');
assert(!renderPersonalSection('pilot-finance', { workflow, organization: org, profile }).includes('facture payée'), 'Finance fictive');
process.stdout.write(`Contrats locaux validés : identité, cap sans réalisé, rôles, carte, archive et liens conservés, action/RDV liés, ${views.length} vues distinctes.\n`);
