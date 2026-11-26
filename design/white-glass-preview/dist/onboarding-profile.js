// Profil saisi dans cet aperçu. Il ne lit ni le questionnaire du compte Bellum ni une API.
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clean=value=>String(value??'').trim().replace(/\s+/g,' ').slice(0,160);
const list=value=>clean(value).split(/[,;]+/).map(part=>part.trim()).filter(Boolean).slice(0,8);
const roles={sales:'Business developer / commercial',manager:'Responsable d’agence',direction:'Direction commerciale'};
export const profileRoleLabel=role=>roles[role]||'Fonction à préciser';
const metricLabels={actions:'actions terminées',meetings:'rendez-vous tenus',starts:'démarrages déclarés'};

export const emptyProfile=()=>({firstName:'',companyName:'',jobRole:'',companyLocations:'',geoZones:'',offerDomains:'',targetSectors:'',salesTeamSize:'',toolingCrm:'',toolingAts:'',goalMetric:'',goalPeriod:'month',goalTarget:''});
export function normalizeProfile(value){
  const profile=emptyProfile();
  for(const key of Object.keys(profile))profile[key]=clean(value?.[key]);
  if(!Object.hasOwn(roles,profile.jobRole))profile.jobRole='';
  if(!Object.hasOwn(metricLabels,profile.goalMetric))profile.goalMetric='';
  if(!['week','month','quarter','semester'].includes(profile.goalPeriod))profile.goalPeriod='month';
  return profile;
}
export const profileReady=profile=>Boolean(profile?.firstName&&profile?.companyName&&profile?.jobRole);
export function readProfile(form){
  const profile=normalizeProfile(Object.fromEntries(form.entries()));
  if(profile.firstName.length<2||profile.companyName.length<2||!profile.jobRole)return {error:'Indiquez votre prénom, votre entreprise et votre fonction.'};
  if(profile.goalTarget){
    const target=Number(profile.goalTarget);
    if(!profile.goalMetric||!Number.isInteger(target)||target<1||target>100000)return {error:'Pour le cap, choisissez une mesure et un nombre entier positif.'};
    profile.goalTarget=String(target);
  }
  return {profile};
}

const input=(label,name,value,placeholder='',type='text',required=false)=>`<label class="onboarding-field"><span>${label}</span><input name="${name}" type="${type}" value="${safe(value)}" placeholder="${safe(placeholder)}" maxlength="160" ${required?'required':''}></label>`;
const option=(value,label,current)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`;
export function onboardingForm(profile){
  const p=normalizeProfile(profile);
  return `<section class="glass onboarding-panel" aria-labelledby="onboarding-title"><div class="onboarding-intro"><span class="eyebrow">VOTRE POINT DE DÉPART</span><h2 id="onboarding-title">${profileReady(p)?'Ajuster votre contexte.':'Comment travaillez-vous ?'}</h2><p>Précisez votre périmètre commercial. Ces réponses organiseront Ma journée, l’équipe, l’agenda et le pilotage ; vous pourrez les modifier à tout moment.</p></div><form data-profile-form class="onboarding-form"><div class="onboarding-fields">${input('Prénom','firstName',p.firstName,'Votre prénom','text',true)}${input('Entreprise','companyName',p.companyName,'Nom de votre ESN','text',true)}<label class="onboarding-field"><span>Votre fonction</span><select name="jobRole" required>${option('','Choisir votre fonction',p.jobRole)}${Object.entries(roles).map(([id,label])=>option(id,label,p.jobRole)).join('')}</select></label>${input('Implantations déclarées','companyLocations',p.companyLocations,'Ex. Paris, Lyon')}${input('Territoires prospectés','geoZones',p.geoZones,'Ex. Île-de-France, Auvergne-Rhône-Alpes')}</div><details class="onboarding-more" ${profileReady(p)?'':'open'}><summary>Votre contexte commercial et votre cap</summary><div class="onboarding-fields">${input('Expertises proposées','offerDomains',p.offerDomains,'Ex. Data, cybersécurité')}${input('Secteurs ciblés','targetSectors',p.targetSectors,'Ex. Banque, industrie')}${input('Taille de l’équipe commerciale','salesTeamSize',p.salesTeamSize,'Ex. 5 à 10')}${input('CRM déclaré','toolingCrm',p.toolingCrm,'Nom de l’outil, si utilisé')}${input('ATS déclaré','toolingAts',p.toolingAts,'Nom de l’outil, si utilisé')}<label class="onboarding-field"><span>Mesure de votre cap</span><select name="goalMetric">${option('','À préciser',p.goalMetric)}${Object.entries(metricLabels).map(([id,label])=>option(id,label.charAt(0).toUpperCase()+label.slice(1),p.goalMetric)).join('')}</select></label><label class="onboarding-field"><span>Période</span><select name="goalPeriod">${option('week','Cette semaine',p.goalPeriod)}${option('month','Ce mois',p.goalPeriod)}${option('quarter','Ce trimestre',p.goalPeriod)}${option('semester','Ce semestre',p.goalPeriod)}</select></label>${input('Cible déclarée','goalTarget',p.goalTarget,'Ex. 8','number')}</div></details><div class="onboarding-actions"><button class="btn btn-primary" type="submit">${profileReady(p)?'Enregistrer mes réponses':'Entrer dans mon espace'} →</button><span>Aucun chiffre réalisé n’est déduit de ces réponses.</span></div></form></section>`;
}

export function identityStrip(profile,active,org){
  const p=normalizeProfile(profile);
  if(!profileReady(p))return onboardingForm(p);
  const title=active==='team'?'Votre organisation':active==='pilotage'?'Du cap au résultat':active==='agenda'?'Votre temps commercial':'Votre point de départ';
  const pieces=[p.jobRole?roles[p.jobRole]:null,p.companyLocations?`Implantations : ${list(p.companyLocations).join(' · ')}`:null,p.geoZones?`Prospection : ${list(p.geoZones).join(' · ')}`:null].filter(Boolean);
  const periodNames={week:'cette semaine',month:'ce mois',quarter:'ce trimestre',semester:'ce semestre'};
  const agencyCount=org?.agencies?.filter(a=>!a.archivedAt).length||0;
  const note=active==='team'?`${agencyCount} agence${agencyCount>1?'s':''} créée${agencyCount>1?'s':''}. Les implantations déclarées ne créent pas d’agence à votre place.`:active==='pilotage'?(p.goalTarget?`Cap déclaré : ${safe(p.goalTarget)} ${metricLabels[p.goalMetric]} ${periodNames[p.goalPeriod]}. Les résultats restent à documenter.`:'Définissez un cap mesurable pour suivre votre écart.'):active==='agenda'?'Les rendez-vous saisis ici alimentent Ma journée et le pilotage.':'Vos choix orientent le travail à faire ; les résultats attendent des actions et des sources.';
  return `<section class="glass identity-strip" aria-label="Contexte déclaré"><div><div class="eyebrow">${safe(title.toUpperCase())} · ${safe(p.companyName)}</div><p>${pieces.length?pieces.map(safe).join(' <span aria-hidden="true">·</span> '):'Ajoutez vos implantations et territoires pour préciser votre périmètre.'}</p><small>${note}</small></div><button type="button" class="text-button" data-action="profile-edit">Modifier mes réponses →</button></section>`;
}

export function personalHeading(profile,active){
  const p=normalizeProfile(profile),name=profileReady(p)?safe(p.firstName):'votre espace',company=profileReady(p)?safe(p.companyName):'votre entreprise';
  if(!profileReady(p))return {title:active==='team'?'Votre équipe':active==='pilotage'?'Vos objectifs':active==='agenda'?'Votre agenda':'Bienvenue dans votre espace.',copy:'Indiquez votre prénom et votre entreprise pour retrouver votre contexte sur chaque page. Vous pourrez compléter ce profil ensuite.'};
  if(active==='team')return {title:`L’équipe ${company}`,copy:p.jobRole==='direction'?`${name}, créez vos agences et reliez les personnes, les BU et les actions au même périmètre.`:p.jobRole==='manager'?`${name}, suivez les agences de votre ESN, coordonnez les équipes et attribuez les prochaines actions.`:`${name}, repérez votre agence, les responsables et les actions à faire avancer avec votre équipe.`};
  if(active==='pilotage')return {title:`${company}, du cap aux résultats`,copy:`${name}, votre cap déclaré prend sens quand chaque action, rendez-vous et résultat porte une source.`};
  if(active==='agenda')return {title:`${name}, vos rendez-vous`,copy:`Planifiez les échanges de ${company} et retrouvez leur suite dans Ma journée.`};
  return {title:`Bonjour, ${name}.`,copy:`Chez ${company}, commencez par les actions à faire avancer aujourd’hui.`};
}

export function applyProfileGoal(workflow,profile){
  const p=normalizeProfile(profile),goals=workflow.goals||[],existing=goals.find(g=>g.onboardingOrigin==='local-profile');
  if(!p.goalTarget||!p.goalMetric)return {...workflow,goals:goals.filter(g=>g.onboardingOrigin!=='local-profile')};
  const goal={title:metricLabels[p.goalMetric].charAt(0).toUpperCase()+metricLabels[p.goalMetric].slice(1),metric:p.goalMetric,period:p.goalPeriod,target:Number(p.goalTarget),agencyId:'',goalScope:'workspace',ownerId:null,onboardingOrigin:'local-profile',source:'Cap du profil'};
  if(existing){if(existing.metric!==goal.metric||existing.period!==goal.period){existing.manualActual=null;existing.manualActualPeriod=null}Object.assign(existing,goal)}
  else {const d=new Date(),createdAt=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;goals.push({...goal,id:globalThis.crypto?.randomUUID?.()||`local-profile-${Date.now()}`,createdAt,manualActual:null,manualActualPeriod:null})}
  return {...workflow,goals};
}
