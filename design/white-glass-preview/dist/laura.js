// A deliberately local, deterministic illustration of the shared Laura dock.
// Answers use only the visible demonstration workspace and never call a CRM or LLM.
import {BUS, CITIES, GOAL_2026, WEEK_2026, INVOICES, MEMBER_WEEK, EVENTS, deriveReversePlan} from './performance-data.js';
import {activeOrganization} from './organization.js';
import {normalizeWorkflow,goalActual} from './personal-workflows.js';
import {calculateFinanceRecord,normalizeFinanceRecords} from './finance-calculator.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const mentions = (question, name) => {
  if (name === 'Est') return /\b(?:bu|region|territoire)\s+est\b|\bl['’]est\b/.test(question);
  const safe = plain(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${safe}(?=$|[^a-z0-9])`).test(question);
};
const euro = value => value >= 1000 ? `${(value / 1000).toLocaleString('fr-FR', {maximumFractionDigits: 2})} M€` : `${Math.round(value).toLocaleString('fr-FR')} k€`;
const euros = value => `${Math.round(value).toLocaleString('fr-FR')} €`;
const num = value => Math.round(value).toLocaleString('fr-FR');
const shortDate = iso => new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(`${iso}T12:00:00Z`));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const tomorrowISO = () => { const d = new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const sum = (rows, key) => rows.reduce((n, row) => n + (Number(row[key]) || 0), 0);
const validAnnualPlan = value => {
  const valid = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  if (!value || !valid(value.weeks, 1, 52) || !valid(value.emailShare, 0, 100) || !['reply', 'meeting', 'need', 'start'].every(key => valid(value.rates?.[key], 1, 100))) return null;
  return value;
};
const arrow = '<svg class="icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const closeIcon = '<svg class="icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

function suggestions(role, mode) {
  if (mode === 'personal') return role === 'direction'
    ? ['Quelles actions sont en retard ?', 'Quels rendez-vous arrivent ?', 'Où en sont mes objectifs ?', 'Quel commercial couvre son coût ?']
    : ['Quelles actions sont en retard ?', 'Quels rendez-vous arrivent ?', 'Où en sont mes objectifs ?', 'Que manque-t-il pour piloter mon équipe ?'];
  return role === 'sales'
    ? ['Que faire pour tenir les 22 démarrages ?', 'Quelles factures dois-je relancer ?', 'Qu’ai-je mené cette semaine ?', 'Prépare une transmission à un collègue']
    : ['Qui est en retard cette semaine ?', 'Où en est le cap de 22 démarrages ?', 'Quelles factures sont échues ?', 'Quel commercial couvre son coût ?', 'Qu’a fait mon équipe ?', 'Que faut-il répartir ?'];
}

function financeAnswer(question, context, id) {
  const q = plain(question);
  if (!/\bprime\b|rentabil|cout commercial|couvr.*cout|cout.*couvr|salaire|contribution|cout cdi|marge.*commercial|commercial.*marge/.test(q)) return null;
  const action = {label:'Ouvrir le suivi Finance',kind:'navigate',route:'pilotage',params:'section=finance'};
  if (context.role !== 'direction') return {
    id,title:'Coûts commerciaux réservés à la Direction',
    copy:'Les rémunérations et les primes ne sont visibles que par la Direction.',
    kpis:[],rows:[],actions:[],source:'Accès limité au rôle Direction.'
  };
  const finance=context.finance || {},people=Array.isArray(finance.people)?finance.people:[];
  const allowed=new Set(people.map(person=>person.id));
  const records=normalizeFinanceRecords(finance.records).filter(record=>record.workspaceKey===finance.workspaceKey&&allowed.has(record.personId));
  const source=`Source : montants saisis par la Direction · ${context.workspace || 'votre espace'}. La contribution est un calcul commercial, pas un résultat comptable.`;
  const base={id,source,kpis:[],rows:[],actions:[action]};
  if (!records.length) return {
    ...base,title:'Coût commercial à renseigner',
    copy:'Ajoutez un commercial et un mois dans Finance : marge brute attribuée, coût CDI chargé, autres coûts et règle de prime. Je pourrai alors comparer la contribution par personne.'
  };
  const named=people.find(person=>plain(person.name) && q.includes(plain(person.name))) ||
    people.find(person=>plain(person.name?.split(' ')[0]) && q.includes(plain(person.name.split(' ')[0])));
  const selected=records.find(record=>record.id===finance.selectedId);
  const month=(selected?.month || [...records].sort((a,b)=>b.month.localeCompare(a.month))[0].month);
  const latest=new Map();
  for(const record of records.filter(record=>record.month===month&&(!named||record.personId===named.id)).sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||''))))latest.set(record.personId,record);
  const evaluated=[...latest.values()].map(record=>({record,person:people.find(person=>person.id===record.personId),result:calculateFinanceRecord(record)})).filter(row=>row.result);
  if (!evaluated.length) return {...base,title:'Données de coût à compléter',copy:'Aucun calcul complet sur le mois demandé. Ouvrez Finance pour vérifier la marge et le coût de chaque commercial.'};
  const covered=evaluated.filter(row=>row.result.contribution>=0);
  const label=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(`${month}-15T12:00:00Z`));
  const focus=named&&evaluated.length===1?evaluated[0]:null;
  const coverageText=covered.length===0
    ? (evaluated.length===1?'Ce commercial ne couvre pas son coût.':`Aucun des ${evaluated.length} commerciaux renseignés ne couvre son coût.`)
    : `${covered.length} ${covered.length>1?'commerciaux':'commercial'} sur ${evaluated.length} ${covered.length>1?'couvrent':'couvre'} ${covered.length>1?'leurs':'son'} coût.`;
  return {
    ...base,
    title:focus?`${focus.person?.name||'Commercial'} · ${label}`:`Contribution commerciale · ${label}`,
    copy:focus
      ? `Marge attribuée ${euros(focus.record.margin)} ; coût commercial total ${euros(focus.result.totalCost)}, dont ${euros(focus.result.bonusGross)} de prime brute et ${euros(focus.result.bonusCharges)} de charges sur prime. Contribution après coût : ${euros(focus.result.contribution)}. ${focus.result.contribution<0?`${euros(focus.result.marginToCover)} de marge manquent pour couvrir ce coût.`:'La marge couvre le coût renseigné.'}`
      : `En ${label}, ${coverageText} La comparaison utilise la marge attribuée, le coût CDI, les primes et les autres coûts du même mois.`,
    kpis:focus
      ? [{label:'Marge attribuée',value:euros(focus.record.margin)},{label:'Coût commercial',value:euros(focus.result.totalCost)},{label:'Contribution',value:euros(focus.result.contribution)}]
      : [{label:'Coût couvert',value:`${covered.length} / ${evaluated.length}`},{label:'Mois',value:label}],
    rows:evaluated.slice(0,6).map(({record,person,result})=>({
      primary:person?.name||'Commercial',
      secondary:`Marge ${euros(record.margin)} · coût CDI ${euros(result.salaryCost)} · coût des primes ${euros(result.totalBonus)} · autres coûts ${euros(record.otherCost)}`,
      value:euros(result.contribution)
    }))
  };
}

function buildPersonalAnswer(question, context, id) {
  const q=plain(question),org=activeOrganization(context.organization),workflow=normalizeWorkflow(context.workflow);
  const profile=context.profile||{},firstName=String(profile.firstName||'').trim(),companyName=String(profile.companyName||'').trim();
  const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const source='Source : actions datées de cet espace.';
  const base={id,source,kpis:[],rows:[],actions:[]};
  const late=workflow.actions.filter(a=>a.status==='open'&&a.due<today).sort((a,b)=>a.due.localeCompare(b.due));
  const next=workflow.actions.filter(a=>a.status==='open').sort((a,b)=>a.due.localeCompare(b.due));
  const meetings=workflow.meetings.filter(m=>m.status==='planned'&&m.date>=today).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  const overdue=workflow.invoices.filter(i=>i.status==='unpaid'&&i.due<today).sort((a,b)=>a.due.localeCompare(b.due));
  if (/questionnaire|inscription|profil|entreprise|expertis|secteur|territoire|implantation/.test(q)) {
    const facts=[profile.jobRole&&`fonction ${profile.jobRole}`,profile.companyLocations&&`implantations ${profile.companyLocations}`,profile.geoZones&&`territoires prospectés ${profile.geoZones}`,profile.offerDomains&&`expertises ${profile.offerDomains}`,profile.targetSectors&&`secteurs ciblés ${profile.targetSectors}`].filter(Boolean);
    return {...base,title:`Contexte déclaré${companyName?` · ${companyName}`:''}`,copy:`${firstName?`${firstName}, `:''}${facts.length?`voici les repères de votre profil : ${facts.join(' ; ')}.`:'précisez votre rôle, vos implantations et vos cibles pour orienter les pages.'}`,actions:[{label:'Préciser ma journée',kind:'navigate',route:'today'}]};
  }
  if (/qui.*retard|retard.*equipe|equipe.*retard|qu.*fait.*equipe|men[eé].*equipe/.test(q)) {
    const owners=new Map(org.people.map(p=>[p.id,p.name]));
    const rows=late.slice(0,5).map(a=>({primary:a.title,secondary:`${owners.get(a.ownerId)||'Responsable à nommer'} · échéance ${a.due}`,value:'En retard'}));
    return {...base,title:'Actions en retard · équipe',copy:late.length?`${late.length} action${late.length>1?'s':''} ${late.length>1?'dépassent':'dépasse'} leur échéance. Retrouvez le responsable et la date dans les plans.`:`Aucune action datée en retard. ${workflow.actions.length?`${workflow.actions.length} action${workflow.actions.length>1?'s':''} enregistrée${workflow.actions.length>1?'s':''} au total.`:'Ajoutez une action datée et son responsable pour suivre les suites.'}`,rows,actions:[{label:'Voir les plans',kind:'navigate',route:'team',params:'tab=plans'}]};
  }
  if (/objectif|cap|cadence|performance|ecart/.test(q)) {
    return {...base,title:'Vos caps déclarés',copy:workflow.goals.length?'Ces cibles viennent de votre profil et des objectifs ajoutés ici. Le réalisé reste non mesuré sans action datée ou déclaration explicite.':'Aucun cap n’est encore saisi. Fixez une mesure, une période et une cible ; aucun objectif n’est présumé.',
      rows:workflow.goals.slice(0,5).map(g=>({primary:g.title,secondary:`${g.period==='week'?'Cette semaine':'Ce mois'} · ${org.agencies.find(a=>a.id===g.agencyId)?.name||'Sans agence'}`,value:goalActual(workflow,g)===null?`Non mesuré / cible ${g.target}`:`${goalActual(workflow,g)} / ${g.target}`})),
      actions:[{label:'Ouvrir Pilotage',kind:'navigate',route:'pilotage'}]};
  }
  if (/factur|echeanc|paiement|regle|encaisse/.test(q)) {
    return {...base,title:'Factures à suivre',copy:overdue.length?`${overdue.length} échéance(s) dépassent la date prévue. Vérifiez le statut de paiement avant de relancer.`:'Aucune échéance enregistrée n’est dépassée.',
      rows:overdue.slice(0,5).map(i=>({primary:i.title,secondary:`Échéance ${i.due} · ${org.agencies.find(a=>a.id===i.agencyId)?.name||'Sans agence'}`,value:euros(i.amount)})),
      actions:[{label:'Voir les échéances',kind:'navigate',route:'pilotage'}]};
  }
  if (/rdv|rendez|agenda|reunion|appel/.test(q)) {
    return {...base,title:'Rendez-vous à venir',copy:meetings.length?`${meetings.length} rendez-vous à venir dans cet espace.`:'Aucun rendez-vous à venir dans cet espace.',
      rows:meetings.slice(0,5).map(m=>({primary:m.title,secondary:`${m.date} à ${m.time} · ${org.agencies.find(a=>a.id===m.agencyId)?.name||'Sans agence'}`,value:'À venir'})),
      actions:[{label:'Ouvrir Mon agenda',kind:'navigate',route:'agenda'}]};
  }
  if (/equipe|agence|ville|territoire|personne|responsable|bu/.test(q)) {
    const withoutTeam=org.agencies.filter(a=>!org.teams.some(t=>t.agencyId===a.id));
    return {...base,title:'Structure de votre espace',copy:`${org.agencies.length} agence${org.agencies.length>1?'s':''}, ${org.teams.length} équipe${org.teams.length>1?'s':''}, ${org.people.length} personne${org.people.length>1?'s':''} configurée${org.people.length>1?'s':''}. ${withoutTeam.length?`${withoutTeam.length} agence${withoutTeam.length>1?'s':''} ${withoutTeam.length>1?'n’ont':'n’a'} pas encore d’équipe.`:'Les agences configurées ont une équipe.'} Ajoutez des objectifs et des actions datées pour suivre le travail.`,
      rows:withoutTeam.slice(0,5).map(a=>({primary:a.name,secondary:a.city,value:'Équipe à créer'})),
      actions:[{label:'Carte des agences',kind:'navigate',route:'team',params:'tab=administration'}]};
  }
  return {...base,title:late.length?'Actions en retard à reprendre':'Prochaines actions saisies',copy:late.length?`${late.length} action${late.length>1?'s':''} ${late.length>1?'dépassent':'dépasse'} leur échéance et ${late.length>1?'restent ouvertes':'reste ouverte'} dans votre espace.`:next.length?'Voici vos actions ouvertes, classées par échéance.':'Aucune action datée. Ajoutez une prochaine étape et son responsable.',
    rows:(late.length?late:next).slice(0,5).map(a=>({primary:a.title,secondary:`Échéance ${a.due} · ${org.agencies.find(agency=>agency.id===a.agencyId)?.name||'Sans agence'}`,value:a.status==='open'?'À faire':'Terminé'})),
    actions:[{label:'Ouvrir Ma journée',kind:'navigate',route:'today'}]};
}

function buildAnswer(question, context, id) {
  const finance=financeAnswer(question,context,id);
  if(finance)return finance;
  if (context.mode === 'personal') return buildPersonalAnswer(question, context, id);
  if (context.mode !== 'scenario') return {
    id, source: 'Source : configuration de cet espace',
    title: 'Données commerciales indisponibles',
    copy: 'La structure seule ne mesure pas la performance. Ajoutez des actions datées et des objectifs pour commencer.',
    kpis: [], rows: [], actions: []
  };
  const q = plain(question);
  const mentionedBu = [...BUS].sort((a, b) => b.name.length - a.name.length).find(b => mentions(q, b.name));
  const mentionedCity = CITIES.find(c => mentions(q, c.name));
  const availableRows = context.availableRows || context.rows || [];
  const availableDeals = context.availableDeals || context.deals || [];
  const availableActivities = context.availableActivities || context.activities || [];
  const mentionedDeal = [...availableDeals].sort((a, b) => b.account.length - a.account.length).find(d => mentions(q, d.account));
  const requested = Boolean(mentionedBu || mentionedCity || mentionedDeal);
  const rows = requested ? availableRows.filter(b => (!mentionedBu || b.id === mentionedBu.id) && (!mentionedCity || b.city === mentionedCity.name) && (!mentionedDeal || b.id === mentionedDeal.bu)) : context.rows || [];
  const allowedIds = new Set(rows.map(b => b.id));
  const deals = requested ? availableDeals.filter(d => allowedIds.has(d.bu) && (!mentionedDeal || d.id === mentionedDeal.id)) : context.deals || [];
  const members = context.members || [];
  const activities = requested ? availableActivities.filter(a => allowedIds.has(a.bu) && (!mentionedDeal || a.account === mentionedDeal.account)) : context.activities || [];
  const dealBu = mentionedDeal && BUS.find(b => b.id === mentionedDeal.bu);
  const scopeLabel = requested ? (mentionedDeal && dealBu ? `${mentionedDeal.account} · ${dealBu.name} / ${dealBu.city}` : mentionedBu ? `${mentionedBu.name} · ${mentionedBu.city}` : `${mentionedCity.name} · toutes les BU`) : context.scopeLabel;
  const scopedParams = base => {
    const params = new URLSearchParams(base);
    const bu = mentionedDeal ? dealBu : mentionedBu;
    const city = mentionedCity?.name || bu?.city || context.scopeCity;
    const selectedBu = bu?.id || (!requested ? context.scopeBu : null);
    if (city && city !== 'all') params.set('city', city);
    if (selectedBu && selectedBu !== 'all') params.set('bu', selectedBu);
    return params.toString();
  };
  const t = {
    target: sum(rows, 'target'), signed: sum(rows, 'signed'), pipe: sum(rows, 'pipe'),
    needs: sum(rows, 'needs'), uncovered: sum(rows, 'uncovered'), bench: sum(rows, 'bench')
  };
  const invoices = INVOICES.filter(invoice => allowedIds.has(invoice.bu) && (context.role !== 'sales' || invoice.owner === 'nora'));
  const overdue = invoices.filter(invoice => invoice.status === 'overdue').sort((a, b) => b.daysLate - a.daysLate);
  const events = EVENTS.filter(event => allowedIds.has(event.bu) && (context.role !== 'sales' || event.owner === 'nora'));
  const memberName = deal => members.find(m => m.id === deal.owner)?.name || 'Sans responsable';
  const source = `Source : dossiers et journal datés · ${context.workspace} · 25 nov. 2026. Périmètre : ${scopeLabel}.${context.role==='sales'?' Les montants et besoins agrégés couvrent toute la BU ; les dossiers et actions listés sont limités à Nora.':''}`;
  const metricScope=context.role==='sales'?'Agrégats de la BU entière, distincts des dossiers accessibles à Nora. ':'';
  const base = {id, source, kpis: [], rows: [], actions: []};
  if (requested && !rows.length) return {
    ...base, title: 'Périmètre indisponible',
    copy: `Je ne dispose pas des données de ${scopeLabel} avec cette fonction. Choisissez un périmètre autorisé ou demandez une lecture de la page actuelle.`
  };
  const specificDeal = deals.find(d => q.includes(plain(d.account)));
  const specificMember = members.find(m => (context.role!=='sales'||m.id==='nora')&&(q.includes(plain(m.name)) || q.includes(plain(m.name.split(' ')[0]))));

  if (/transmet|transmission|partag|envoi|envoie|collegue|passation|deleg/.test(q)) {
    const deal = specificDeal || deals.find(d => !d.owner) || [...deals].sort((a, b) => b.age - a.age)[0];
    if (!deal) return {...base, title: 'Aucun dossier dans ce périmètre', copy: 'Choisissez une autre ville ou une autre BU pour préparer une transmission.'};
    return {
      ...base, title: `Préparer la transmission de ${deal.account}`,
      copy: 'Je prépare le dossier, le destinataire et la note de passation. Validez pour enregistrer la passation dans cet espace. Aucun message ne part automatiquement.',
      rows: [{primary: deal.account, secondary: `${deal.stage} · ${memberName(deal)} · prochaine étape : ${deal.next}`, value: euro(deal.amount), dealId: deal.id}],
      handoff: {dealId: deal.id, recipientId: specificMember?.id || ''},
      actions: [{label: 'Ouvrir l’affaire', kind: 'deal', id: deal.id}]
    };
  }

  if (mentionedDeal && /objectif|performance|ecart|sans profil|staffing/.test(q)) return {
    ...base, title: `Lecture de ${mentionedDeal.account}`,
    copy: 'Aucun objectif ni taux de couverture n’est renseigné pour ce compte. Je peux montrer son affaire et le résultat de sa BU, sans attribuer les chiffres de la BU à ce compte.',
    kpis: [{label: 'Affaire ouverte', value: euro(mentionedDeal.amount)}, {label: 'Dernier échange', value: `${mentionedDeal.age} j`}],
    actions: [{label: 'Ouvrir le dossier', kind: 'deal', id: mentionedDeal.id}]
  };

  if (/factur|impay|encaiss|reglement|paiement|recouv/.test(q)) {
    const selected = mentionedDeal ? invoices.filter(invoice => invoice.account === mentionedDeal.account) : invoices;
    const late = selected.filter(invoice => invoice.status === 'overdue').sort((a, b) => b.daysLate - a.daysLate);
    const open = selected.filter(invoice => invoice.status !== 'paid');
    return {
      ...base,
      title: late.length ? `${euros(sum(late, 'amount'))} de factures échues` : 'Aucune facture échue ici',
      copy: `Sur ${scopeLabel}, ${late.length ? `${late.length} facture${late.length > 1 ? 's' : ''} suivie${late.length > 1 ? 's' : ''} ${late.length===1?'dépasse':'dépassent'}` : 'aucune facture suivie ne dépasse'} l’échéance. Le signé, le facturé et l’encaissé sont trois mesures distinctes. Ouvrez une pièce pour consigner une relance ; aucun message ne part automatiquement.`,
      kpis: [{label: 'Échu', value: euros(sum(late, 'amount'))}, {label: 'Non encaissé', value: euros(sum(open, 'amount'))}],
      rows: late.slice(0, 5).map(invoice => ({primary: `${invoice.account} · ${invoice.id}`, secondary: `${invoice.daysLate} j de retard · ${invoice.step} · ${members.find(m => m.id === invoice.owner)?.name || 'Responsable'}`, value: euros(invoice.amount), invoiceId: invoice.id})),
      actions: [{label: 'Voir les factures dans Finance', kind: 'navigate', route: 'pilotage', params: scopedParams('section=finance')}],
      source: `${source} Six factures suivies ; leur détail ne couvre pas tous les agrégats des BU.`
    };
  }

  if (/demarr|22\b|fin d.annee|annee 2026|cadence|reverse/.test(q)) {
    const remaining = Math.max(0, GOAL_2026.target - GOAL_2026.completed);
    const plan = validAnnualPlan(context.annualPlan);
    if (!plan) return {
      ...base,
      title: `${GOAL_2026.completed} démarrages sur ${GOAL_2026.target}`,
      copy: `Il reste ${remaining} démarrages à sécuriser. ${context.role==='direction'?'Pour calculer une cadence, renseignez l’horizon, vos taux de conversion et la part des e-mails dans Pilotage.':'La direction peut renseigner les taux dans Pilotage pour établir une cadence.'}`,
      kpis: [{label: 'À sécuriser', value: `${remaining}`}],
      actions: [{label: context.role==='direction'?'Paramétrer la cadence':'Voir le cap dans Pilotage', kind: 'navigate', route: 'pilotage', params: scopedParams('section=cockpit')}],
      source: `${source} Cap annuel déclaré ; aucune cadence calculée sans vos taux.`
    };
    const model = deriveReversePlan({target:GOAL_2026.target,completed:GOAL_2026.completed,weightedPipe:0,weeks:plan.weeks,rates:Object.fromEntries(Object.entries(plan.rates).map(([key,value])=>[key,value/100]))});
    const emails = Math.ceil(model.perWeek.touches*plan.emailShare/100),linkedin = model.perWeek.touches-emails;
    return {
      ...base,
      title: `${GOAL_2026.completed} démarrages sur ${GOAL_2026.target}`,
      copy: `${remaining} démarrages à sécuriser. D’après vos taux saisis dans Pilotage, voici le volume de travail à répartir sur ${plan.weeks} semaines. Ces contacts restent à réaliser.`,
      kpis: [{label: 'À sécuriser', value: `${remaining}`}, {label: 'Sollicitations par semaine', value: num(model.perWeek.touches)}],
      rows: [
        {primary: 'Rendez-vous à obtenir', secondary: `${num(model.needs)} besoins à qualifier · ${num(model.replies)} réponses attendues`, value: num(model.meetings)},
        {primary: 'Sollicitations à mener', secondary: `${num(model.perWeek.touches)} par semaine sur ${plan.weeks} semaines`, value: num(model.touches)},
        {primary: 'Répartition hebdomadaire', secondary: 'E-mails · approches LinkedIn', value: `${num(emails)} · ${num(linkedin)}`}
      ],
      actions: [{label: 'Modifier les taux dans Pilotage', kind: 'navigate', route: 'pilotage', params: scopedParams('section=cockpit')}],
      source: `${source} Cadence calculée à partir des taux saisis dans Pilotage ; ces sollicitations ne sont pas des actions déjà enregistrées.`
    };
  }

  if (/email|e-mail|linkedin|prospect|sollicit|rendez.vous|\brdv\b|cette semaine/.test(q) && !/retard|bloqu|relanc|factur|mene|fait|activit|equipe|prepar|prochain|agenda|demain/.test(q)) {
    const items = WEEK_2026.metrics.filter(metric => ['emails', 'linkedin', 'meetings', 'needs'].includes(metric.id));
    return {
      ...base, title: 'Cadence du 23 au 27 novembre',
      copy: 'Le réalisé est arrêté au mercredi 25. Les cibles hebdomadaires restent à confirmer ; la semaine se termine vendredi.',
      kpis: [{label: 'Rendez-vous', value: `${items.find(m => m.id === 'meetings').actual} / ${items.find(m => m.id === 'meetings').target}`}, {label: 'Besoins qualifiés', value: `${items.find(m => m.id === 'needs').actual} / ${items.find(m => m.id === 'needs').target}`}],
      rows: items.map(metric => ({primary: metric.label, secondary: metric.next, value: `${metric.actual} / ${metric.target}`})),
      actions: [{label: 'Voir ma cadence', kind: 'navigate', route: 'today'}, {label: 'Voir l’agenda', kind: 'navigate', route: 'agenda'}],
      source: `${source} Cumul hebdomadaire au 25 nov. ; volumes de groupe, pas de performance individuelle.`
    };
  }

  if (/agenda|prochain.*(rdv|rendez)|demain|prepar.*(rdv|rendez|entretien)/.test(q)) {
    const nextEvents = events.filter(event => event.status === 'upcoming').slice(0, 4);
    return {
      ...base, title: `${nextEvents.length} créneaux à préparer`,
      copy: 'Chaque rendez-vous renvoie au compte et à une question à clarifier. Après l’échange, la prochaine action et sa date doivent rester dans l’affaire.',
      rows: nextEvents.map(event => ({primary: `${event.title} · ${event.start}`, secondary: `${event.account || 'Interne'} · ${event.next}`, value: event.date === '2026-11-25' ? '25 nov.' : shortDate(event.date), dealId: deals.find(d => d.account === event.account)?.id})),
      actions: [{label: 'Ouvrir mon agenda', kind: 'navigate', route: 'agenda'}],
      source
    };
  }

  if (/sans responsable|sans proprietaire|attribu|reparti/.test(q)) {
    const missing = deals.filter(d => !d.owner).sort((a, b) => b.amount - a.amount);
    return {
      ...base, title: `${missing.length} affaire${missing.length > 1 ? 's' : ''} à attribuer`,
      copy: missing.length ? 'Chaque dossier reste dans le pipe de sa BU. Ouvrez la fiche pour nommer un responsable et voir la charge associée.' : 'Toutes les affaires de ce périmètre ont un responsable.',
      kpis: [{label: 'Pipe sans responsable', value: euro(sum(missing, 'amount'))}],
      rows: missing.slice(0, 4).map(d => ({primary: d.account, secondary: `${rows.find(b => b.id === d.bu)?.name || 'BU'} · ${d.next}`, value: euro(d.amount), dealId: d.id})),
      actions: missing[0] ? [{label: 'Préparer une transmission', kind: 'prompt', text: `Transmets ${missing[0].account} à un collègue`}] : []
    };
  }

  if (specificMember && /retard|activit|fait|mene|objectif|performance|portefeuille/.test(q)) {
    const owned = deals.filter(d => d.owner === specificMember.id);
    const late = owned.filter(d => d.age >= 11);
    const week = MEMBER_WEEK[specificMember.id];
    return {
      ...base, title: `${specificMember.name} · portefeuille et activité`,
      copy: `${owned.length} affaires suivies sur ${scopeLabel}, dont ${late.length} sans échange depuis au moins 11 jours. Le journal reprend les actions datées, pas tous les messages privés.`,
      kpis: [{label: 'RDV cette semaine', value: num(week?.meetings || 0)}, {label: 'Affaires à relancer', value: num(late.length)}],
      rows: late.slice(0, 4).map(d => ({primary: d.account, secondary: `${d.age} jours · ${d.next}`, value: euro(d.amount), dealId: d.id})),
      actions: context.role === 'sales' ? [{label: 'Voir mon activité', kind: 'navigate', route: 'today'}] : [{label: 'Voir la charge de l’équipe', kind: 'navigate', route: 'team', params: scopedParams('tab=plans')}]
    };
  }

  if (/retard|sans echange|relanc|bloqu/.test(q)) {
    const late = deals.filter(d => d.age >= 11).sort((a, b) => b.age - a.age || b.amount - a.amount);
    const owners = [...new Set(late.map(memberName))];
    return {
      ...base, title: `${late.length} dossier${late.length > 1 ? 's' : ''} sans échange récent`,
      copy: late.length ? `${owners.length} responsable${owners.length > 1 ? 's' : ''} concerné${owners.length > 1 ? 's' : ''}. Le retard signifie ici au moins 11 jours depuis le dernier échange consigné.` : 'Aucun dossier de ce périmètre ne franchit le seuil de 11 jours dans ce périmètre.',
      kpis: [{label: 'Montant ouvert concerné', value: euro(sum(late, 'amount'))}, {label: 'Seuil', value: '11 jours'}],
      rows: late.slice(0, 5).map(d => ({primary: `${d.account} · ${memberName(d)}`, secondary: `${d.age} jours · ${d.next}`, value: euro(d.amount), dealId: d.id})),
      actions: context.role === 'sales' ? [] : [{label: 'Voir les plans d’action', kind: 'navigate', route: 'team', params: scopedParams('tab=plans')}]
    };
  }

  if (/profil|staffing|besoin|consultant/.test(q)) {
    const uncovered = rows.filter(b => b.uncovered).sort((a, b) => b.uncovered - a.uncovered);
    return {
      ...base, title: `${t.uncovered} besoins sans profil`,
      copy: `${metricScope}La disponibilité déclarée et les besoins ouverts sont lus sur le même périmètre. Il faut qualifier un profil avant de promettre une couverture au client.`,
      kpis: [{label: 'Besoins ouverts', value: num(t.needs)}, {label: 'Consultants disponibles', value: num(t.bench)}],
      rows: uncovered.slice(0, 4).map(b => ({primary: `${b.name} · ${b.city}`, secondary: `${b.needs} besoins ouverts · ${b.bench} consultants disponibles`, value: `${b.uncovered} sans profil`})),
      actions: [{label: 'Voir le staffing', kind: 'navigate', route: 'pilotage', params: scopedParams('section=staffing')}]
    };
  }

  if (/objectif|performance|ecart|sous|pourquoi/.test(q)) {
    const gap = Math.max(0, t.target - t.signed);
    const largest = [...deals].filter(d => d.age >= 11).sort((a, b) => b.amount - a.amount).slice(0, 3);
    return {
      ...base, title: `${euro(gap)} restent à signer`,
      copy: `${metricScope}Le signé atteint ${t.target ? Math.round(t.signed / t.target * 100) : 0} % de l’objectif. Le pipe ouvert n’est pas une prévision de signature. Ces chiffres montrent l’écart et les dossiers à examiner ; ils ne prouvent pas à eux seuls la cause du retard.`,
      kpis: [{label: 'Signé / objectif', value: `${euro(t.signed)} / ${euro(t.target)}`}, {label: 'Pipe ouvert', value: euro(t.pipe)}],
      rows: largest.map(d => ({primary: d.account, secondary: `${memberName(d)} · ${d.age} jours sans échange`, value: euro(d.amount), dealId: d.id})),
      actions: [{label: 'Voir le cockpit', kind: 'navigate', route: 'pilotage', params: scopedParams('section=cockpit')}]
    };
  }

  if (/point|synthese|resume|brief/.test(q)) {
    const late = deals.filter(d => d.age >= 11);
    const missing = deals.filter(d => !d.owner);
    return {
      ...base, title: 'Point d’équipe préparé',
      copy: `${metricScope}Sur ${scopeLabel}, commencez par l’écart à l’objectif, puis attribuez les ${missing.length} dossiers sans propriétaire et fixez une suite aux ${late.length} dossiers sans échange récent. Aucun compte rendu n’est envoyé automatiquement.`,
      kpis: [{label: 'Signé / objectif', value: `${euro(t.signed)} / ${euro(t.target)}`}, {label: 'Sans profil', value: num(t.uncovered)}],
      rows: late.slice(0, 3).map(d => ({primary: d.account, secondary: `${memberName(d)} · ${d.next}`, value: `${d.age} j`, dealId: d.id})),
      actions: context.role === 'sales' ? [{label: 'Voir ma journée', kind: 'navigate', route: 'today'}] : [{label: 'Voir l’équipe', kind: 'navigate', route: 'team', params: scopedParams('tab=vue')}]
    };
  }

  if (/activit|fait|mene|aujourd|equipe|journal/.test(q)) {
    return {
      ...base, title: 'Activité documentée',
      copy: `${metricScope}${activities.length} activité${activities.length > 1 ? 's' : ''} datée${activities.length > 1 ? 's' : ''} ${activities.length > 1 ? 'apparaissent' : 'apparaît'} dans le journal. Les messages privés ne sont pas inclus.`,
      kpis: [{label: `RDV · BU · novembre`, value: num(rows.reduce((n, b) => n + b.funnel[0], 0))}, {label: `Besoins · BU · novembre`, value: num(rows.reduce((n, b) => n + b.funnel[1], 0))}],
      rows: activities.slice(0, 5).map(a => ({primary: `${a.action} · ${a.account}`, secondary: `${a.person} · ${a.time}`, value: a.type || 'Activité', dealId: deals.find(d => d.account === a.account)?.id})),
      actions: context.role === 'sales' ? [{label: 'Voir ma journée', kind: 'navigate', route: 'today'}] : [{label: 'Voir le journal', kind: 'navigate', route: 'team', params: scopedParams('tab=activite')}]
    };
  }

  if (specificDeal) return {
    ...base, title: specificDeal.account,
    copy: `Affaire en ${specificDeal.stage}, suivie par ${memberName(specificDeal)}. La prochaine étape enregistrée est : ${specificDeal.next}, échéance ${specificDeal.due}.`,
    kpis: [{label: 'Pipe ouvert', value: euro(specificDeal.amount)}, {label: 'Dernier échange', value: `${specificDeal.age} j`}],
    actions: [{label: 'Ouvrir le dossier', kind: 'deal', id: specificDeal.id}]
  };

  return {
    ...base, title: 'Je peux partir du travail visible ici',
    copy: 'Demandez-moi le cap de 22 démarrages, les factures échues, les affaires en retard, l’activité documentée ou une transmission. Je pars des dossiers, objectifs et actions du périmètre affiché.',
    actions: [{label: 'Qui est en retard ?', kind: 'prompt', text: 'Qui est en retard sur ce périmètre ?'}]
  };
}

export function createLaura({getContext, onOpenDeal, onOpenInvoice, onNavigate, onTransfer}) {
  let open = false;
  let draft = '';
  let entries = [];
  let nextId = 1;
  const root = () => document.getElementById('laura-root');
  const context = () => getContext();

  function answerHtml(answer, ctx) {
    const kpis = answer.kpis.length ? `<div class="laura-kpi-strip">${answer.kpis.map(k => `<div class="laura-kpi"><span>${esc(k.label)}</span><strong>${esc(k.value)}</strong></div>`).join('')}</div>` : '';
    const rows = answer.rows.length ? `<div class="laura-rows">${answer.rows.map(row => `<div class="laura-row"><div><strong>${esc(row.primary)}</strong><small>${esc(row.secondary)}</small></div>${row.dealId || row.invoiceId ? `<button class="laura-action" type="button" data-laura="${row.invoiceId ? 'invoice' : 'deal'}" data-id="${esc(row.invoiceId || row.dealId)}" aria-label="Ouvrir ${esc(row.primary)}">${esc(row.value)} ${arrow}</button>` : `<b>${esc(row.value || '')}</b>`}</div>`).join('')}</div>` : '';
    const actions = answer.actions.length ? `<div class="laura-actions">${answer.actions.map(a => `<button class="laura-action ${a.kind === 'deal' || a.kind === 'invoice' ? 'primary' : ''}" type="button" data-laura="${a.kind}" ${a.id ? `data-id="${esc(a.id)}"` : ''} ${a.route ? `data-laura-route="${esc(a.route)}"` : ''} ${a.params ? `data-laura-params="${esc(a.params)}"` : ''} ${a.text ? `data-prompt="${esc(a.text)}"` : ''}>${esc(a.label)} ${arrow}</button>`).join('')}</div>` : '';
    const deal = (ctx.availableDeals || ctx.deals).find(d => d.id === answer.handoff?.dealId);
    const handoff = deal ? (answer.confirmed
      ? `<div class="laura-transfer-done"><strong>Transmission consignée</strong><span>Fiche ${esc(deal.account)} → ${esc(answer.confirmed.toName)} · prise en charge le ${esc(shortDate(answer.confirmed.due))}. Elle apparaît dans l’activité et sur la fiche du collègue de cet espace.</span></div>`
      : `<div class="laura-transfer" data-transfer-id="${answer.id}"><label>Destinataire du même espace<select data-laura-recipient="${answer.id}"><option value="">Choisir un collègue</option>${ctx.members.filter(m => m.id !== deal.owner).map(m => `<option value="${esc(m.id)}" ${m.id === answer.handoff.recipientId ? 'selected' : ''}>${esc(m.name)} · ${esc((ctx.availableRows || ctx.rows).find(b => b.id === m.bu)?.name || 'Équipe')}</option>`).join('')}</select></label><label>Note de passation<textarea data-laura-note="${answer.id}" rows="3" placeholder="Contexte, besoin et prochaine action à partager"></textarea></label><label>Prise en charge avant le<input type="date" data-laura-due="${answer.id}" min="${tomorrowISO()}" value="${tomorrowISO()}" required></label><button class="laura-action primary" type="button" data-laura="confirm-transfer" data-answer-id="${answer.id}">Consigner la transmission ${arrow}</button><p class="laura-transfer-error" role="status"></p></div>`) : '';
    return `<div class="laura-message"><article class="laura-answer"><div class="laura-answer-head"><span class="laura-head-mark" aria-hidden="true">L</span> LAURA · LECTURE DU PÉRIMÈTRE</div><h3>${esc(answer.title)}</h3><p>${esc(answer.copy)}</p>${kpis}${rows}${handoff}${actions}<div class="laura-provenance">${esc(answer.source)}</div></article></div>`;
  }

  function render(options = {}) {
    const host = root();
    if (!host) return;
    const oldDraft = host.querySelector('.laura-composer textarea')?.value;
    if (oldDraft !== undefined && options.preserveDraft !== false) draft = oldDraft;
    const scrollY = host.querySelector('.laura-stream')?.scrollTop || 0;
    const transferDrafts = [...host.querySelectorAll('.laura-transfer')].map(card => ({
      id: card.dataset.transferId,
      recipient: card.querySelector('select')?.value,
      note: card.querySelector('textarea')?.value,
      due: card.querySelector('input[type="date"]')?.value
    }));
    const ctx = context();
    if (ctx.mode === 'choose') { host.innerHTML = ''; return; }
    const messages = entries.length ? `<div class="laura-message-list">${entries.map(e => e.kind === 'user' ? `<div class="laura-message user">${esc(e.text)}</div>` : answerHtml(e.answer, ctx)).join('')}</div>` : `<div class="laura-empty"><span class="laura-overline">UN MÊME SYSTÈME · UN MÊME PÉRIMÈTRE</span><h3>${ctx.mode==='personal'&&ctx.profile?.firstName?`Bonjour ${esc(ctx.profile.firstName)}. Que voulez-vous faire avancer chez ${esc(ctx.profile.companyName||'vous')} ?`:'Que faut-il faire avancer ?'}</h3><p>${ctx.mode==='personal'?'Je lis votre profil, vos équipes, actions, rendez-vous et objectifs de cet espace.':'Je relie l’activité, les affaires, les responsables et le staffing visibles ici. Une action sensible passe toujours par votre validation.'}</p><div class="laura-suggestions"><span class="laura-section-label">COMMENCER PAR UNE QUESTION</span>${suggestions(ctx.role,ctx.mode).map(question => `<button class="laura-chip" type="button" data-laura="prompt" data-prompt="${esc(question)}"><span>${esc(question)}</span>${arrow}</button>`).join('')}</div></div>`;
    host.innerHTML = `<div class="laura-layer ${open ? 'open' : ''}"><button class="laura-trigger" type="button" data-laura="toggle" aria-controls="laura-panel" aria-expanded="${open}"><span class="laura-trigger-mark" aria-hidden="true">L</span><span>Laura</span></button><section class="laura-panel ${open ? 'open' : ''}" id="laura-panel" role="region" aria-label="Laura, assistant commercial"><div class="laura-head"><span class="laura-head-mark" aria-hidden="true">L</span><div class="laura-head-copy"><h2>Laura</h2><p>Questions et actions commerciales · ${esc(ctx.workspace)}</p></div><button class="laura-close" type="button" data-laura="close" aria-label="Fermer Laura">${closeIcon}</button></div><div class="laura-context"><strong>${esc(ctx.workspace)}</strong><span>·</span><span class="laura-context-path">${esc(ctx.scopeLabel)}</span></div><div class="laura-stream">${messages}</div><div class="laura-composer"><textarea aria-label="Question pour Laura" placeholder="Demander à Laura…" rows="1">${esc(draft)}</textarea><button class="laura-composer-send" type="button" data-laura="send" aria-label="Envoyer la question">${arrow}</button></div></section></div>`;
    for (const saved of transferDrafts) {
      const card = host.querySelector(`.laura-transfer[data-transfer-id="${saved.id}"]`);
      if (!card) continue;
      if (saved.recipient !== undefined) card.querySelector('select').value = saved.recipient;
      if (saved.note !== undefined) card.querySelector('textarea').value = saved.note;
      if (saved.due !== undefined) card.querySelector('input[type="date"]').value = saved.due;
    }
    const stream = host.querySelector('.laura-stream');
    if (stream) stream.scrollTop = options.scroll ? stream.scrollHeight : scrollY;
    if (options.focus) host.querySelector('.laura-composer textarea')?.focus();
  }

  function ask(suggestedText = '') {
    const text = (suggestedText || root()?.querySelector('.laura-composer textarea')?.value || '').trim();
    if (!text) return;
    draft = '';
    entries.push({kind: 'user', text});
    entries.push({kind: 'answer', answer: buildAnswer(text, context(), nextId++)});
    render({scroll: true, focus: true, preserveDraft: false});
  }

  document.addEventListener('click', event => {
    const el = event.target.closest('[data-laura]');
    if (!el || !root()?.contains(el)) return;
    const kind = el.dataset.laura;
    if (kind === 'toggle' || kind === 'close') { open = kind === 'toggle' ? !open : false; render({focus: open}); return; }
    if (kind === 'prompt') { ask(el.dataset.prompt || ''); return; }
    if (kind === 'send') { ask(); return; }
    if (kind === 'deal') { open = false; render(); onOpenDeal(el.dataset.id); return; }
    if (kind === 'invoice') { open = false; render(); onOpenInvoice?.(el.dataset.id); return; }
    if (kind === 'navigate') { open = false; render(); onNavigate(el.dataset.lauraRoute, el.dataset.lauraParams || ''); return; }
    if (kind === 'confirm-transfer') {
      const id = Number(el.dataset.answerId);
      const answer = entries.find(e => e.kind === 'answer' && e.answer.id === id)?.answer;
      const card = el.closest('.laura-transfer');
      const to = card?.querySelector('select')?.value || '';
      const note = card?.querySelector('textarea')?.value.trim() || '';
      const due = card?.querySelector('input[type="date"]')?.value || '';
      const error = card?.querySelector('.laura-transfer-error');
      if (!answer || !to || note.length < 8 || due <= todayISO()) { if (error) error.textContent = 'Choisissez un collègue, une date future et une note de passation de 8 caractères minimum.'; return; }
      const ctx = context();
      const deal = (ctx.availableDeals || ctx.deals).find(d => d.id === answer.handoff?.dealId);
      const member = ctx.members.find(m => m.id === to);
      if (!deal || !member || member.id === deal.owner) { if (error) error.textContent = 'Ce dossier ou ce destinataire n’est pas disponible dans votre périmètre.'; return; }
      const result = onTransfer({dealId: deal.id, to: member.id, note, due});
      if (result === false) { if (error) error.textContent = 'La transmission n’a pas pu être consignée.'; return; }
      answer.confirmed = {toName: member.name, due};
      render({scroll: true});
    }
  });

  document.addEventListener('keydown', event => {
    if (event.target.matches('#laura-root .laura-composer textarea') && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(); }
    if (event.key === 'Escape' && open && root()?.contains(document.activeElement)) { open = false; render(); root()?.querySelector('.laura-trigger')?.focus(); }
  });

  function reset() { open = false; draft = ''; entries = []; render({preserveDraft: false}); }
  return {render, reset};
}
