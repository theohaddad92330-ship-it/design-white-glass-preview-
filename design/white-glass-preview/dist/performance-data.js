// Scénario commercial fictif, au 25 novembre 2026. Toutes les mesures de cette maquette
// proviennent de cette table; aucune donnée du produit ou du CRM connecté n'est lue.
export const CITIES = [
  {name:'Paris',x:49.1,y:29.8},{name:'Lille',x:52.8,y:15.5},
  {name:'Nantes',x:28.7,y:43.0},{name:'Bordeaux',x:33.8,y:62.2},
  {name:'Toulouse',x:44.4,y:72.1},{name:'Lyon',x:62.1,y:54.7},
  {name:'Marseille',x:64.9,y:74.6},{name:'Strasbourg',x:77.3,y:32.1}
];
// Montants exprimés en milliers d'euros, sur une même période mensuelle.
export const BUS = [
  {id:'gc',name:'Grands comptes',city:'Paris',target:420,signed:306,pipe:720,invoiced:248,funnel:[98,52,35,20,7],bench:2,needs:12,uncovered:3,margin:0.23,members:['nora','elise'],accounts:['Altiver','Véridian','Hélios','Ambre Finance']},
  {id:'data',name:'Conseil & Data',city:'Paris',target:260,signed:181,pipe:410,invoiced:127,funnel:[65,32,24,15,5],bench:1,needs:8,uncovered:2,margin:0.25,members:['karim'],accounts:['Sillage Data','Néoma','Elyance','Stellar']},
  {id:'ind',name:'Industrie',city:'Lyon',target:300,signed:225,pipe:460,invoiced:180,funnel:[77,38,29,17,6],bench:2,needs:10,uncovered:2,margin:0.21,members:['ines'],accounts:['Atelieria','Rhodia','Meridian','Cobalt']},
  {id:'ouest',name:'Ouest',city:'Nantes',target:210,signed:147,pipe:300,invoiced:112,funnel:[55,26,19,11,4],bench:1,needs:7,uncovered:2,margin:0.22,members:['lucas'],accounts:['NovaSanté','Arpège','Marée','Kerat']},
  {id:'nord',name:'Nord',city:'Lille',target:160,signed:121,pipe:220,invoiced:86,funnel:[48,24,16,9,3],bench:1,needs:5,uncovered:1,margin:0.24,members:['yasmine'],accounts:['Noroît','Aster','Opale','Flandre']},
  {id:'so',name:'Sud-Ouest',city:'Bordeaux',target:185,signed:104,pipe:270,invoiced:95,funnel:[50,23,15,8,2],bench:2,needs:6,uncovered:3,margin:0.19,members:['mathis'],accounts:['Rivage','Aqualis','Montaigne','Ligne 7']},
  {id:'aero',name:'Aéronautique',city:'Toulouse',target:225,signed:158,pipe:325,invoiced:115,funnel:[66,32,22,14,4],bench:1,needs:8,uncovered:2,margin:0.23,members:['chloe'],accounts:['Airéa','Saturn','Aérotech','Demos']},
  {id:'med',name:'Méditerranée',city:'Marseille',target:175,signed:93,pipe:255,invoiced:71,funnel:[43,21,13,7,2],bench:2,needs:6,uncovered:3,margin:0.20,members:['sarah'],accounts:['Calanques','Massilia','Galia','Lagon']},
  {id:'est',name:'Est',city:'Strasbourg',target:155,signed:124,pipe:205,invoiced:92,funnel:[45,22,14,9,3],bench:1,needs:5,uncovered:1,margin:0.26,members:['arthur'],accounts:['Alsance','Oria','Kléber','Vela']}
];
export const MEMBERS = [
  {id:'nora',name:'Nora Benali',role:'Business Manager',bu:'gc',signed:180,initials:'NB'},
  {id:'elise',name:'Élise Besson',role:'Account Manager',bu:'gc',signed:126,initials:'ÉB'},
  {id:'karim',name:'Karim Roche',role:'Business Manager',bu:'data',signed:181,initials:'KR'},
  {id:'ines',name:'Inès Laurent',role:'Business Manager',bu:'ind',signed:225,initials:'IL'},
  {id:'lucas',name:'Lucas Moreau',role:'Business Manager',bu:'ouest',signed:147,initials:'LM'},
  {id:'yasmine',name:'Yasmine Haddou',role:'Business Manager',bu:'nord',signed:121,initials:'YH'},
  {id:'mathis',name:'Mathis Rey',role:'Business Manager',bu:'so',signed:104,initials:'MR'},
  {id:'chloe',name:'Chloé Fabre',role:'Business Manager',bu:'aero',signed:158,initials:'CF'},
  {id:'sarah',name:'Sarah Ghali',role:'Business Manager',bu:'med',signed:93,initials:'SG'},
  {id:'arthur',name:'Arthur Klein',role:'Business Manager',bu:'est',signed:124,initials:'AK'}
];
export const WEEKLY_ACTIVITY={
  gc:[7,9,12,8,11],data:[4,6,8,7,9],ind:[5,7,9,8,10],ouest:[4,5,7,6,8],
  nord:[3,4,6,5,7],so:[3,4,5,4,6],aero:[4,5,8,6,7],med:[3,4,5,4,6],est:[3,4,5,5,6]
};
export const STAGES=['Découverte','Qualification','Proposition','Négociation'];
const shares=[0.15,0.25,0.34,0.26];
export const DEALS=BUS.flatMap(b=>b.accounts.map((account,i)=>({
  id:`${b.id}-${i}`,bu:b.id,account,stage:STAGES[i],amount:i===3?b.pipe-[0,1,2].reduce((v,j)=>v+Math.round(b.pipe*shares[j]),0):Math.round(b.pipe*shares[i]),
  owner:(i===0 && ['med','so','gc'].includes(b.id))?null:b.members[i%b.members.length],
  age:b.id==='gc'&&i===0?0:[3,6,11,17][i],next:b.id==='gc'&&i===0?'Désigner un responsable et qualifier le besoin':['Qualifier le besoin','Obtenir le cahier des charges','Relancer la proposition','Fixer la décision'][i],
  need:b.id==='gc'&&i===0?'Renfort SAP FI':['Transformation SI','Mission Data','Renfort équipe','Programme 2027'][i],due:b.id==='gc'&&i===0?'25 nov.':['27 nov.','28 nov.','30 nov.','2 déc.'][i]
})));
export const ACTIVITIES=[
  {time:'09:12',person:'Nora Benali',action:'Besoin SAP confirmé',account:'Altiver',bu:'gc',type:'Besoin'},
  {time:'10:05',person:'Karim Roche',action:'Rendez-vous tenu',account:'Sillage Data',bu:'data',type:'Rendez-vous'},
  {time:'11:20',person:'Inès Laurent',action:'Profil envoyé',account:'Atelieria',bu:'ind',type:'Profil'},
  {time:'14:00',person:'Lucas Moreau',action:'Entretien planifié',account:'NovaSanté',bu:'ouest',type:'Entretien'},
  {time:'15:35',person:'Sarah Ghali',action:'Affaire sans responsable',account:'Calanques',bu:'med',type:'Répartition'}
];
export const sum=(rows,key)=>rows.reduce((v,r)=>v+(r[key]||0),0);
export const pct=(a,b)=>b?Math.round(a/b*100):0;
export const scope=(city='all',bu='all')=>BUS.filter(b=>(city==='all'||b.city===city)&&(bu==='all'||b.id===bu));
export const total=rows=>({target:sum(rows,'target'),signed:sum(rows,'signed'),pipe:sum(rows,'pipe'),bench:sum(rows,'bench'),needs:sum(rows,'needs'),uncovered:sum(rows,'uncovered'),funnel:Array.from({length:5},(_,i)=>rows.reduce((v,b)=>v+b.funnel[i],0))});

// Les objets suivants décrivent un portefeuille commercial fictif et cohérent.
// Ils ne représentent pas des données synchronisées depuis un CRM ou un ATS.
// Le réalisé et les cibles ci-dessous sont des fixtures, pas des KPI du monorepo.
// Le pipe pondéré et les taux de conversion sont des hypothèses inventées, jamais des promesses.
const ROUND_UP=Math.ceil;
export function deriveReversePlan({target,completed,weightedPipe=0,weeks,rates}={}){
  if(!Number.isSafeInteger(target)||!Number.isSafeInteger(completed)||!Number.isSafeInteger(weeks)||target<0||completed<0||weeks<1||!rates||['reply','meeting','need','start'].some(key=>!Number.isFinite(rates[key])||rates[key]<=0||rates[key]>1))throw new RangeError('Cible, horizon et taux requis pour calculer une cadence');
  const remaining=Math.max(0,target-completed);
  const toCreate=Math.max(0,remaining-weightedPipe);
  const needs=ROUND_UP(toCreate/rates.start);
  const meetings=ROUND_UP(needs/rates.need);
  const replies=ROUND_UP(meetings/rates.meeting);
  const touches=ROUND_UP(replies/rates.reply);
  const grossNeeds=ROUND_UP(remaining/rates.start);
  const grossMeetings=ROUND_UP(grossNeeds/rates.need);
  const grossReplies=ROUND_UP(grossMeetings/rates.meeting);
  const grossTouches=ROUND_UP(grossReplies/rates.reply);
  return {
    remaining,toCreate,needs,meetings,replies,touches,
    perWeek:{needs:ROUND_UP(needs/weeks),meetings:ROUND_UP(meetings/weeks),replies:ROUND_UP(replies/weeks),touches:ROUND_UP(touches/weeks)},
    gross:{needs:grossNeeds,meetings:grossMeetings,replies:grossReplies,touches:grossTouches},
    rates,weeks
  };
}

export const GOAL_2026={
  asOf:'2026-11-25',period:'2026',label:'Démarrages 2026',scope:'Portefeuille commercial',
  target:22,completed:16,remaining:6,
  weightedPipe:3,pipeLabel:'3 équivalents pondérés dans les affaires en cours',
  forecastRange:[1,4],
  monthlyStarts:[
    {month:'Jan',count:1},{month:'Fév',count:1},{month:'Mar',count:1},
    {month:'Avr',count:1},{month:'Mai',count:2},{month:'Juin',count:1},
    {month:'Juil',count:1},{month:'Août',count:2},{month:'Sep',count:2},
    {month:'Oct',count:2},{month:'Nov',count:2},{month:'Déc',count:null}
  ],
  trajectory:[
    {month:'Jan',target:1,actual:1},{month:'Fév',target:2,actual:2},
    {month:'Mar',target:4,actual:3},{month:'Avr',target:5,actual:4},
    {month:'Mai',target:7,actual:6},{month:'Juin',target:9,actual:7},
    {month:'Juil',target:11,actual:8},{month:'Août',target:13,actual:10},
    {month:'Sep',target:15,actual:12},{month:'Oct',target:18,actual:14},
    {month:'Nov',target:20,actual:16},{month:'Déc',target:22,actual:null}
  ],
  pipeline:[
    {id:'helios-renfort',account:'Hélios',bu:'gc',owner:'nora',step:'Proposition',expected:'2026-12-04',value:.9,risk:'Décision attendue sur le renfort'},
    {id:'atelieria-cloud',account:'Atelieria',bu:'ind',owner:'ines',step:'Entretien client',expected:'2026-12-10',value:.8,risk:'Retour technique attendu'},
    {id:'airea-data',account:'Airéa',bu:'aero',owner:'chloe',step:'Décision',expected:'2026-12-15',value:.7,risk:'Budget non confirmé'},
    {id:'sillage-platform',account:'Sillage Data',bu:'data',owner:'karim',step:'Entretien client',expected:'2026-12-18',value:.6,risk:'Disponibilité consultant'}
  ]
};

// Semaine courante : données enregistrées jusqu'au mercredi 25 novembre.
// Les objectifs hebdomadaires arrondissent vers le haut le scénario du pipe.
export const WEEK_2026={
  start:'2026-11-23',end:'2026-11-27',asOf:'2026-11-25',label:'23 – 27 novembre',elapsedDays:3,workDays:5,
  targetBasis:'Cibles hebdomadaires du groupe · 23–27 nov.',
  metrics:[
    {id:'emails',label:'Emails utiles',actual:66,target:140,unit:'emails',daily:[21,24,21,null,null],source:'Messagerie',next:'74 emails à répartir sur jeudi et vendredi'},
    {id:'linkedin',label:'Contacts LinkedIn',actual:23,target:65,unit:'contacts',daily:[8,9,6,null,null],source:'Journal d’activité',next:'42 contacts à réaliser'},
    {id:'responses',label:'Réponses obtenues',actual:9,target:31,unit:'réponses',daily:[3,4,2,null,null],source:'Messagerie',next:'Qualifier les réponses ouvertes'},
    {id:'meetings',label:'Rendez-vous tenus',actual:3,target:8,unit:'RDV',daily:[1,1,1,null,null],source:'Agenda',next:'5 RDV à confirmer ou tenir'},
    {id:'needs',label:'Besoins qualifiés',actual:1,target:3,unit:'besoins',daily:[0,1,0,null,null],source:'Dossier commercial',next:'2 besoins à qualifier'},
    {id:'profiles',label:'Profils présentés',actual:2,target:4,unit:'profils',daily:[1,0,1,null,null],source:'Suivi des profils',next:'2 présentations à préparer'},
    {id:'interviews',label:'Entretiens client',actual:1,target:2,unit:'entretiens',daily:[0,1,0,null,null],source:'Agenda',next:'1 entretien à déclencher'}
  ],
  // Activité visible, avec la part attendue au mercredi matérialisée en UI.
  dailyAxis:['Lun 23','Mar 24','Mer 25','Jeu 26','Ven 27'],
  reach:[
    {day:'Lun',emails:21,linkedin:8,meetings:1},{day:'Mar',emails:24,linkedin:9,meetings:1},
    {day:'Mer',emails:21,linkedin:6,meetings:1},{day:'Jeu',emails:null,linkedin:null,meetings:null},
    {day:'Ven',emails:null,linkedin:null,meetings:null}
  ],
  // L'entonnoir compare le réalisé de la semaine aux volumes à tenir d'ici vendredi.
  // Le démarrage attendu (0,6/semaine) est une espérance, pas un compte entier.
  funnel:[
    {id:'touches',label:'Sollicitations',actual:89,target:205},
    {id:'responses',label:'Réponses',actual:9,target:31},
    {id:'meetings',label:'RDV tenus',actual:3,target:8},
    {id:'needs',label:'Besoins qualifiés',actual:1,target:3},
    {id:'starts',label:'Démarrages attendus',actual:0,target:.6}
  ]
};
export const metric=(id)=>WEEK_2026.metrics.find(m=>m.id===id);
export const weeklyGap=(id)=>{const m=metric(id);return m?Math.max(0,m.target-m.actual):0};

// Sommes en euros, dates ISO. Le montant facturé n'est pas le montant encaissé.
export const INVOICES=[
  {id:'FAC-2026-1184',account:'Altiver',bu:'gc',owner:'nora',amount:32400,issued:'2026-10-01',due:'2026-11-15',status:'overdue',daysLate:10,step:'Relancer le service achats',lastAction:'Relance envoyée le 18 nov.'},
  {id:'FAC-2026-1206',account:'NovaSanté',bu:'ouest',owner:'lucas',amount:18600,issued:'2026-10-16',due:'2026-11-20',status:'overdue',daysLate:5,step:'Obtenir une date de virement',lastAction:'Promesse de règlement le 21 nov.'},
  {id:'FAC-2026-1217',account:'Airéa',bu:'aero',owner:'chloe',amount:24100,issued:'2026-11-01',due:'2026-11-23',status:'overdue',daysLate:2,step:'Vérifier la réception de la facture',lastAction:'Aucun accusé de réception'},
  {id:'FAC-2026-1229',account:'Sillage Data',bu:'data',owner:'karim',amount:14250,issued:'2026-11-05',due:'2026-11-30',status:'due',daysLate:0,step:'Préparer un rappel préventif',lastAction:'Facture envoyée le 5 nov.'},
  {id:'FAC-2026-1163',account:'Véridian',bu:'gc',owner:'elise',amount:22000,issued:'2026-10-06',due:'2026-11-06',paidAt:'2026-11-19',status:'paid',daysLate:0,step:'Aucune',lastAction:'Règlement rapproché le 19 nov.'},
  {id:'FAC-2026-1192',account:'Atelieria',bu:'ind',owner:'ines',amount:20700,issued:'2026-10-20',due:'2026-11-22',paidAt:'2026-11-24',status:'paid',daysLate:0,step:'Aucune',lastAction:'Règlement rapproché le 24 nov.'}
];
export const FINANCE_2026={
  asOf:'2026-11-25',label:'Factures suivies',
  overdue:sum(INVOICES.filter(i=>i.status==='overdue'),'amount'),
  unpaid:sum(INVOICES.filter(i=>i.status!=='paid'),'amount'),
  received:sum(INVOICES.filter(i=>i.status==='paid'),'amount'),
  // Les montants ici ne doivent pas être additionnés aux agrégats BU.
  note:'Ce détail illustre six factures. Les agrégats mensuels des BU couvrent un périmètre plus large.'
};

// Les trois premiers items se rattachent aux affaires sans responsable de DEALS.
export const DISPATCH=[
  {id:'D-101',dealId:'gc-0',account:'Altiver',bu:'gc',kind:'Besoin entrant',title:'Renfort SAP FI',received:'2026-11-25T08:48:00',due:'2026-11-25',owner:null,suggested:'nora',why:'Compte déjà suivi par Nora · réponse attendue le 25 nov.',source:'E-mail'},
  {id:'D-102',dealId:'so-0',account:'Rivage',bu:'so',kind:'Demande de rendez-vous',title:'Refonte data plateforme',received:'2026-11-25T10:26:00',due:'2026-11-26',owner:null,suggested:'mathis',why:'Territoire Sud-Ouest · aucun responsable assigné',source:'Dossier commercial'},
  {id:'D-103',dealId:'med-0',account:'Calanques',bu:'med',kind:'Besoin détecté',title:'Programme cybersécurité',received:'2026-11-24T17:10:00',due:'2026-11-25',owner:null,suggested:'sarah',why:'Déjà un échange client en cours',source:'Historique du compte'},
  {id:'D-104',dealId:'data-2',account:'Elyance',bu:'data',kind:'Transmission interne',title:'Profil Data Engineer disponible',received:'2026-11-25T09:35:00',due:'2026-11-27',owner:'karim',suggested:'karim',why:'Karim suit le compte; validation du besoin à faire',source:'Suivi des profils'}
];

export const TOUCHPOINTS=[
  {id:'T-1',when:'08:48',kind:'Besoin',title:'Altiver demande un renfort SAP',detail:'À répartir puis qualifier avant 17h',account:'Altiver',bu:'gc',owner:null,source:'E-mail',urgency:'now',link:'dispatch'},
  {id:'T-2',when:'09:12',kind:'Relance',title:'Véridian attend le retour sur deux profils',detail:'Dernier message il y a 4 jours',account:'Véridian',bu:'gc',owner:'elise',source:'Dossier commercial',urgency:'today',link:'deal'},
  {id:'T-3',when:'10:05',kind:'Rendez-vous',title:'Sillage Data · découverte tenue',detail:'Besoin plateforme à préciser',account:'Sillage Data',bu:'data',owner:'karim',source:'Agenda',urgency:'today',link:'meeting'},
  {id:'T-4',when:'11:20',kind:'Profil',title:'Atelieria a reçu le profil de Lina',detail:'Retour technique attendu jeudi',account:'Atelieria',bu:'ind',owner:'ines',source:'Suivi des profils',urgency:'waiting',link:'deal'},
  {id:'T-5',when:'14:00',kind:'Entretien',title:'NovaSanté · entretien avec Malik',detail:'Compte rendu à partager à l’équipe',account:'NovaSanté',bu:'ouest',owner:'lucas',source:'Agenda',urgency:'today',link:'meeting'},
  {id:'T-6',when:'15:35',kind:'Finance',title:'Altiver · facture de 32 400 € échue',detail:'10 jours de retard · service achats à relancer',account:'Altiver',bu:'gc',owner:'nora',source:'Facturation',urgency:'late',link:'invoice'}
];

export const EVENTS=[
  {id:'E-1',date:'2026-11-25',start:'09:00',end:'09:30',title:'Préparer l’échange Altiver',account:'Altiver',bu:'gc',owner:'nora',kind:'Préparation',place:'Bellum',status:'done',next:'Relire les notes SAP'},
  {id:'E-2',date:'2026-11-25',start:'10:00',end:'10:45',title:'Découverte · Sillage Data',account:'Sillage Data',bu:'data',owner:'karim',kind:'Client',place:'Visio',status:'done',next:'Qualifier besoin et budget'},
  {id:'E-3',date:'2026-11-25',start:'11:30',end:'12:00',title:'Relances prioritaires',account:'Véridian',bu:'gc',owner:'elise',kind:'Action',place:'Bellum',status:'upcoming',next:'Deux profils en attente'},
  {id:'E-4',date:'2026-11-25',start:'14:00',end:'15:00',title:'Entretien client · NovaSanté',account:'NovaSanté',bu:'ouest',owner:'lucas',kind:'Entretien',place:'Visio',status:'upcoming',next:'Partager le compte rendu à l’équipe'},
  {id:'E-5',date:'2026-11-25',start:'16:15',end:'16:45',title:'Point pipe · Agence Paris',account:'',bu:'gc',owner:'nora',kind:'Équipe',place:'Salle 2',status:'upcoming',next:'3 dossiers sans prochaine étape'},
  {id:'E-6',date:'2026-11-26',start:'09:30',end:'10:15',title:'Cadrage du besoin · Altiver',account:'Altiver',bu:'gc',owner:'nora',kind:'Client',place:'Visio',status:'upcoming',next:'Confirmer le périmètre SAP et la date de retour'},
  {id:'E-7',date:'2026-11-26',start:'14:00',end:'14:45',title:'Qualification · Rivage',account:'Rivage',bu:'so',owner:'mathis',kind:'Client',place:'Visio',status:'upcoming',next:'Valider périmètre et décideur'},
  {id:'E-8',date:'2026-11-27',start:'11:00',end:'11:45',title:'Décision · Airéa',account:'Airéa',bu:'aero',owner:'chloe',kind:'Client',place:'Visio',status:'upcoming',next:'Budget et démarrage potentiel'},
  {id:'E-9',date:'2026-11-23',start:'09:15',end:'10:00',title:'Revue des suites · Hélios',account:'Hélios',bu:'gc',owner:'nora',kind:'Action',place:'Bellum',status:'done',next:'Confirmer le retour sur la proposition'},
  {id:'E-10',date:'2026-11-23',start:'14:00',end:'14:45',title:'Cadrage · Hélios',account:'Hélios',bu:'gc',owner:'nora',kind:'Client',place:'Visio',status:'done',next:'Identifier le décideur et la date'},
  {id:'E-11',date:'2026-11-24',start:'10:30',end:'11:15',title:'Prospection ciblée · comptes Paris',account:'',bu:'gc',owner:'nora',kind:'Action',place:'Bellum',status:'done',next:'Qualifier les réponses obtenues'},
  {id:'E-12',date:'2026-11-24',start:'15:00',end:'15:30',title:'Retour client · Altiver',account:'Altiver',bu:'gc',owner:'nora',kind:'Client',place:'Visio',status:'done',next:'Préparer la suite SAP'},
  {id:'E-13',date:'2026-11-27',start:'09:00',end:'09:45',title:'Relances · dossiers en attente',account:'Hélios',bu:'gc',owner:'nora',kind:'Action',place:'Bellum',status:'upcoming',next:'Fixer une prochaine action datée'},
  {id:'E-14',date:'2026-11-27',start:'14:30',end:'15:15',title:'Revue commerciale · Grands comptes',account:'',bu:'gc',owner:'nora',kind:'Équipe',place:'Bellum',status:'upcoming',next:'Partager les blocages à l’équipe'}
];

export const MEMBER_WEEK={
  nora:{emails:12,linkedin:4,meetings:1,needs:1,profiles:0,late:1,starts:0},
  elise:{emails:8,linkedin:3,meetings:0,needs:0,profiles:0,late:2,starts:0},
  karim:{emails:9,linkedin:4,meetings:1,needs:0,profiles:1,late:0,starts:0},
  ines:{emails:8,linkedin:2,meetings:0,needs:0,profiles:1,late:0,starts:0},
  lucas:{emails:7,linkedin:2,meetings:1,needs:0,profiles:0,late:1,starts:0},
  yasmine:{emails:5,linkedin:1,meetings:0,needs:0,profiles:0,late:0,starts:0},
  mathis:{emails:3,linkedin:1,meetings:0,needs:0,profiles:0,late:2,starts:0},
  chloe:{emails:5,linkedin:1,meetings:0,needs:0,profiles:0,late:0,starts:0},
  sarah:{emails:4,linkedin:1,meetings:0,needs:0,profiles:0,late:2,starts:0},
  arthur:{emails:5,linkedin:4,meetings:0,needs:0,profiles:0,late:0,starts:0}
};
// Cibles individuelles proposées dans ce scénario pour la commerciale affichée.
// Elles sont indépendantes de la répartition globale et doivent être paramétrables en production.
export const PERSONAL_TARGETS={nora:{emails:35,linkedin:14,meetings:2,needs:1}};
