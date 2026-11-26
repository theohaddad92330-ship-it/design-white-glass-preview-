import type {
  CompiledNeed,
  ContractKind,
  CreateAccountNeed,
  CreateProjectNeed,
  DeliveryMode,
  NeedChannel,
  NeedCompilationField,
  NeedOrigin,
  NeedProcurementInvolvement,
  NeedUrgency,
  RemotePreference,
  RequiredSkill,
  SupervisionRole,
} from '@bellum/contracts'
import { needUnderstandingGaps } from '@bellum/contracts'

/**
 * L'ASSISTANT DE CRÉATION D'UN BESOIN EN QUATRE ÉTAPES (08-creer-un-besoin.png).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PORTE, ET CE QU'IL REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le brouillon vit ICI — la forme, sa persistance, sa validation par étape et
 * sa conversion vers le corps que le serveur accepte déjà (`createProjectNeedSchema`,
 * `.strict()`, un seul champ requis : `title`). Rien de neuf n'est demandé au
 * serveur pour l'étape 2 : compétences, séniorité, TJM, lieu, durée, urgence,
 * langues et habilitations sont DÉJÀ acceptés. Seuls `origin`, `channel` et
 * `required_certifications` sont neufs (ce lot, migration
 * `1790975000001-NeedOriginChannelCertifications.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE BROUILLON PERSISTANT — « on quitte, on revient, on retrouve »
 * ─────────────────────────────────────────────────────────────────────────────
 * `localStorage`, une clé UNIQUE : un commercial qui commence un besoin, ferme
 * l'onglet pour vérifier un mail, et revient, retrouve exactement où il en
 * était. Volontairement un SEUL brouillon à la fois plutôt qu'un par besoin en
 * cours de saisie — un besoin n'a pas encore d'identité tant qu'il n'est pas
 * créé, il n'y a donc rien à quoi accrocher plusieurs brouillons.
 *
 * Chaque lecture/écriture est protégée (`try`/`catch`) : un navigateur privé,
 * un stockage plein ou désactivé ne doit jamais faire planter l'assistant — il
 * démarre simplement sans brouillon, comme la première fois.
 */

/**
 * #2939 — L'ASSISTANT PASSE DE QUATRE À CINQ ÉTAPES (issue #2174, maquette
 * `08-creer-un-besoin.png`) : une étape DÉCISION s'intercale entre les
 * informations clés et le rapprochement — processus de décision, décideur,
 * achats (#2174.32/.33/.34) — et la confirmation devient l'étape 5, où la
 * reformulation relue et les inconnues bloquantes se lisent (#2174.35/.36).
 */
export type NeedWizardStep = 1 | 2 | 3 | 4 | 5

export const NEED_WIZARD_STEPS: readonly NeedWizardStep[] = [1, 2, 3, 4, 5]

/**
 * LES SEPT CARTES DE « TYPE DE MISSION » — et les DEUX champs qu'elles remplissent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE, ET PAS UNE ÉNUMÉRATION À SEPT VALEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette (`08-creer-un-besoin.png`) montre sept cartes côte à côte, ce qui
 * SUGGÈRE un champ unique à sept valeurs. Il n'en est rien : les sept mélangent
 * TROIS axes indépendants.
 *
 *  · L'ORIGINE — d'où vient l'affaire : entrant, sortant, appel d'offres,
 *    apport d'affaires. Quatre cartes, une valeur de `NEED_ORIGINS` chacune.
 *  · Le CANAL — par quel montage on intervient : partenaire, portage. Deux
 *    cartes, une valeur de `NEED_CHANNELS` chacune.
 *  · Une ACTION — « sourcing interne » ne décrit ni d'où vient l'affaire ni par
 *    quel montage on la sert : il dit où l'on va CHERCHER quelqu'un. Aucune
 *    valeur ne l'enregistre ; la carte OUVRE le vivier.
 *
 * Un besoin entrant servi par un partenaire est donc DEUX cartes allumées, pas
 * une septième valeur inventée — et les colonnes `origin` / `channel` (migration
 * `1790975000001`) restent exactement ce que la contrainte SQL accepte.
 *
 * ⚠️ Aucune carte ne pose `channel = 'direct'`. « Direct » reste une valeur
 * légitime de la colonne, mais la DEVINER parce qu'aucune carte partenaire n'est
 * cochée transformerait une absence de réponse en réponse. `null` = personne n'a
 * dit. C'est la même règle que « non mesuré n'est jamais 0 ».
 *
 * Les LIBELLÉS ne vivent pas ici : `projects:needWizard.typeCards.<key>` (FR+EN).
 */
type MissionTypeCardKey =
  | 'inbound'
  | 'outbound'
  | 'partenaire'
  | 'portage'
  | 'sourcing_interne'
  | 'appel_offres'
  | 'apport_affaires'

type MissionTypeCard = {
  key: MissionTypeCardKey
  /** L'axe ORIGINE que cette carte renseigne, quand elle en renseigne un. */
  origin?: NeedOrigin
  /** L'axe CANAL, idem. Une carte ne touche jamais aux deux. */
  channel?: NeedChannel
  /** La carte qui QUITTE l'assistant plutôt que d'écrire — voir l'en-tête. */
  to?: string
}

/** L'ordre de la maquette : quatre puis trois. */
export const MISSION_TYPE_CARDS: readonly MissionTypeCard[] = [
  { key: 'inbound', origin: 'entrant' },
  { key: 'outbound', origin: 'sortant' },
  { key: 'partenaire', channel: 'partenaire' },
  { key: 'portage', channel: 'portage' },
  { key: 'sourcing_interne', to: '/consultants' },
  { key: 'appel_offres', origin: 'appel_offres' },
  { key: 'apport_affaires', origin: 'apport_affaires' },
]

/** Cette carte est-elle allumée pour ce brouillon ? Une carte d'ACTION ne
 *  s'allume jamais : elle n'enregistre rien, il n'y a rien à relire. */
export function missionTypeCardSelected(card: MissionTypeCard, draft: NeedWizardDraft): boolean {
  if (card.origin) return draft.origin === card.origin
  if (card.channel) return draft.channel === card.channel
  return false
}

/**
 * Le patch d'un clic sur une carte — un SEUL axe touché, et re-cliquer efface.
 *
 * Effacer compte autant que poser : sans le retour en arrière, une carte cliquée
 * par erreur resterait dans la base pour toujours, et l'utilisateur n'aurait
 * d'autre issue que d'abandonner le brouillon.
 */
export function missionTypeCardPatch(card: MissionTypeCard, draft: NeedWizardDraft): Partial<NeedWizardDraft> {
  if (card.origin) return { origin: draft.origin === card.origin ? null : card.origin }
  if (card.channel) return { channel: draft.channel === card.channel ? null : card.channel }
  return {}
}

/**
 * #2939 (#2174.20, #2174.22, #2174.24) — RÉGLER UN CRITÈRE, PAS TOUS.
 *
 * `commitSkills` (`NeedWizard.tsx`) forçait `required: true` pour CHAQUE
 * compétence saisie : aucune séparation Indispensable/Souhaitable n'était
 * possible, alors que `required` (bloquant) et `level` existent déjà sur
 * `RequiredSkill` (`project.ts`) — juste jamais réglables un par un depuis
 * l'assistant. Une fonction pure, testée sans monter l'écran : seul l'INDEX
 * visé change, les autres compétences restent des références identiques
 * (pas de nouveau tableau alloué inutilement pour elles).
 *
 * ⚠️ Pas de troisième état « à clarifier » ici : `required` reste le
 * booléen du contrat (`requiredSkillSchema`, GA-11/GA-12 — une valeur qui va
 * en base voit sa contrainte élargie AVANT le code qui l'écrit). Un troisième
 * état suppose de faire grandir CE contrat, pas cette fonction.
 */
export function updateSkill(skills: RequiredSkill[], index: number, patch: Partial<RequiredSkill>): RequiredSkill[] {
  return skills.map((skill, i) => (i === index ? { ...skill, ...patch } : skill))
}

/**
 * #2942 (reste du 26/09) — LES COMPÉTENCES COMPILÉES PAR LAURA, en compétences
 * du brouillon.
 *
 * L'entrée est la MÊME liste jointe par virgules que `needField(action,
 * 'skills')` affiche déjà dans l'aperçu de la carte `compile_need`
 * (`PendingActions.tsx`) — aucune structure nouvelle : un terme, une virgule,
 * jamais un niveau ni un caractère bloquant que Laura n'a pas dit.
 *
 * `required: true` (le défaut du contrat, `requiredSkillSchema`) — Laura ne
 * distingue pas Indispensable/Souhaitable à la compilation, poser `false`
 * inventerait une réponse qu'elle n'a pas donnée.
 */
export function parseCompiledSkills(joined: string | undefined): RequiredSkill[] {
  if (!joined) return []
  return joined
    .split(',')
    .map(term => term.trim().slice(0, 80))
    .filter(term => term.length > 0)
    .map(term => ({ term, required: true, level: null }))
}

export type NeedWizardDraft = {
  title: string
  /**
   * #2558.1 — LE CLIENT, et c'est lui le champ requis de l'étape 1.
   *
   * Vide = personne ne l'a encore dit. Il se remplit de trois façons : en
   * choisissant un projet (le compte vient avec), en créant le projet sans
   * sortir du parcours (#2174.1), ou en nommant l'entreprise SANS projet —
   * le cas que ce lot ouvre.
   */
  accountId: string
  /** Le projet, quand il y en a un. Vide = il n'y en a pas, et c'est un état
   *  VALIDE : la majorité des missions d'ESN ne produisent aucun signal
   *  public, et leur inventer un projet fabriquait de la donnée creuse. */
  projectId: string
  /** #2174.11 — L'INTERLOCUTEUR, un contact DE CE COMPTE. Vide = personne ne
   *  l'a encore dit — jamais deviné, et vérifié CÔTÉ SERVEUR contre
   *  `accountId` (un contact d'un autre compte serait la mauvaise personne
   *  affichée sur le dossier client). */
  contactId: string
  /** #2174.12 — LE PORTEUR, un membre de l'espace. Vide = personne ne
   *  l'a encore dit — jamais celui qui a créé le besoin par défaut, c'est
   *  justement ce qu'un cockpit cherche à repérer (voir `owner_id` côté
   *  contrat, `project.ts`). */
  ownerId: string
  /** L'ORIGINE et le CANAL — deux champs, jamais une liste unique. Voir
   *  `NEED_ORIGINS` / `NEED_CHANNELS` (`packages/contracts/src/schemas/project.ts`). */
  origin: NeedOrigin | null
  channel: NeedChannel | null
  skills: RequiredSkill[]
  seniority: string
  headcount: number
  /** En CENTIMES, comme partout ailleurs dans le produit. `null` = non saisi. */
  target_tjm_cents: number | null
  location: string
  /** #2173.29 — `null` = non renseigné. Jamais un défaut `sur_site` : une
   *  extraction de document ne le devine pas non plus, elle ne le pose que si
   *  le texte source le dit explicitement. */
  remote: RemotePreference | null
  duration_months: number | null
  start_on: string
  contract_kind: ContractKind | ''
  /** #3547 — FORFAIT ENCADRÉ : l'ESN cadre ou supervise un forfait réalisé par les
   *  salariés du client, sans consultants. Ne s'envoie qu'au forfait. */
  supervised: boolean
  /** Le rôle tenu. `null` = non dit, jamais « cadrage » par défaut. */
  supervision_role: SupervisionRole | null
  /** L'équipe côté client, par un nombre… `null` = non saisi (jamais 0). */
  client_team_size: number | null
  /** …ou par des noms, en texte libre (virgules / retours à la ligne). `''` = non saisi. */
  client_team_names: string
  urgency: NeedUrgency | null
  required_certifications: string[]
  /** #2174.17 — LE PROBLÈME. `''` = rien saisi, jamais posé au serveur (voir
   *  la conversion plus bas) : un problème vide n'est pas une réponse. */
  context: string
  /** #2939 (#2174.16) — LA CAPACITÉ RECHERCHÉE. Même règle que `context` :
   *  `''` = rien saisi, jamais posé au serveur. */
  expertise: string
  /** #2939 (#2174.31) — LES CONTRAINTES ADMINISTRATIVES (astreinte,
   *  déplacements, horaires). Même règle que `context`/`expertise`. */
  constraints: string
  /** #2939 (#2174.32) — COMMENT LE CLIENT DÉCIDE en interne. `''` = rien
   *  saisi, jamais posé au serveur — même règle que `context`. */
  decisionProcess: string
  /** #2939 (#2174.33) — LE DÉCIDEUR, un contact DE CE COMPTE. `''` = personne
   *  ne l'a dit — même garde que `contactId` (#2174.11). */
  decisionMakerContactId: string
  /** #2939 (#2174.34) — voir `NEED_PROCUREMENT_INVOLVEMENTS`. `null` =
   *  personne ne l'a dit, jamais un troisième « peut-être ». */
  procurementInvolvement: NeedProcurementInvolvement | null
  /**
   * #2939 (#2174.3/.5/.6, #2174.36) — CE QUE LA COMPILATION D'UN TEXTE COLLÉ
   * (brief ou e-mail) a rendu à l'étape 1, transporté jusqu'à l'étape 5.
   *
   * ⚠️ `null` = aucune compilation n'a eu lieu (saisie manuelle, ou brouillon
   * dupliqué) : l'étape 5 n'affiche ALORS aucune ligne d'inconnue — « on
   * n'affiche pas ce qu'on n'a pas », jamais une inconnue inventée pour un
   * besoin qu'on n'a pas fait lire par le compilateur.
   */
  compiled: CompiledNeed | null
}

export function emptyNeedWizardDraft(): NeedWizardDraft {
  return {
    title: '',
    accountId: '',
    projectId: '',
    contactId: '',
    ownerId: '',
    origin: null,
    channel: null,
    skills: [],
    seniority: '',
    headcount: 1,
    target_tjm_cents: null,
    location: '',
    remote: null,
    duration_months: null,
    start_on: '',
    contract_kind: '',
    supervised: false,
    supervision_role: null,
    client_team_size: null,
    client_team_names: '',
    urgency: null,
    required_certifications: [],
    context: '',
    expertise: '',
    constraints: '',
    decisionProcess: '',
    decisionMakerContactId: '',
    procurementInvolvement: null,
    compiled: null,
  }
}

const STORAGE_KEY = 'bellum:need-wizard-draft:v1'

/** Un brouillon lu depuis `localStorage`, ou `null` — jamais une exception qui
 *  remonte : un stockage illisible n'est pas un besoin non plus. */
export function loadNeedWizardDraft(): NeedWizardDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<NeedWizardDraft>
    // Fusionné sur un brouillon VIDE plutôt que rendu tel quel : une version
    // antérieure de ce fichier qui aurait porté moins de champs ne doit pas
    // faire planter la lecture d'un `undefined.trim()` plus loin.
    return { ...emptyNeedWizardDraft(), ...parsed }
  } catch {
    return null
  }
}

export function saveNeedWizardDraft(draft: NeedWizardDraft): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Navigateur privé, quota dépassé — le brouillon vit alors le temps de la
    // session, ce qui est déjà ce que l'écran offrait avant ce lot.
  }
}

export function clearNeedWizardDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Rien à faire : si l'écriture a échoué plus haut, il n'y a rien à effacer.
  }
}

/**
 * Une étape peut-elle laisser passer à la suivante ?
 *
 * Seule l'étape 1 BLOQUE : un titre et un CLIENT sont le minimum que la route
 * exige (`createAccountNeedSchema` — `title` et `account_id`). Les étapes 2 et
 * 3 sont entièrement optionnelles côté serveur — les rendre bloquantes
 * forcerait une saisie que la fiche du besoin recueille très bien après coup.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2558.1 — LIVRÉ le 18/09/2026 : le projet est devenu OPTIONNEL
 * ─────────────────────────────────────────────────────────────────────────
 * Ce bloc portait jusqu'ici la mesure qui expliquait pourquoi le projet
 * restait exigé. Elle est conservée parce qu'elle dit ce qu'il a fallu payer,
 * et elle a été payée en entier :
 *
 *  · `POST /projects/:id/needs` portait le projet dans l'URL — une seconde
 *    porte existe désormais, `POST /projects/needs`, qui prend le COMPTE dans
 *    le corps et le projet en option ;
 *  · `project_needs.project_id` était `uuid NOT NULL` — la migration
 *    `1795711263408-NeedWithoutProject` l'a rendue nullable APRÈS avoir ajouté
 *    et reporté `account_id`, qui est `NOT NULL` à sa place (GA-11 / GA-12) ;
 *  · chaque lecture qui remontait au compte PAR le projet a été réécrite, et
 *    une garde d'architecture les tient (`need-account-never-via-project`).
 *
 * Ce qui NE change pas : #2174.1 / #2558.2 — créer le projet sans sortir du
 * parcours (`createProject` dans `NeedWizard.tsx`, arbitrage de Louis du
 * 16/09/2026) reste le bon chemin quand il Y A un projet à créer. Ce lot
 * ajoute le cas où il n'y a rien à créer : le client suffit.
 */
export function needWizardStepValid(step: NeedWizardStep, draft: NeedWizardDraft): boolean {
  if (step === 1) return draft.title.trim().length > 0 && draft.accountId.length > 0
  return true
}

/**
 * #2558.1 — LE CORPS ENVOYÉ À `POST /projects/needs` : le client, et le projet
 * seulement s'il y en a un.
 *
 * ⚠️ `project_id` vaut `null` et JAMAIS `''` : la chaîne vide n'est pas un
 * identifiant, et `createAccountNeedSchema` la refuserait en 400 — l'écran
 * dirait « la création a échoué » là où l'utilisateur a simplement décidé de
 * ne pas rattacher son besoin à un projet.
 *
 * C'est la SEULE conversion de l'assistant : elle compose celle des champs du
 * besoin plutôt que de la recopier, pour la même raison qu'une seconde
 * conversion serait un second assistant (garde `one-need-wizard`).
 */
export function needWizardDraftToAccountNeedInput(draft: NeedWizardDraft): CreateAccountNeed {
  return {
    ...needWizardDraftToCreateInput(draft),
    account_id: draft.accountId,
    project_id: draft.projectId.length > 0 ? draft.projectId : null,
  }
}

/** Les noms saisis en texte libre (virgules ou retours à la ligne), sans vides. */
export function parseClientTeamNames(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map(name => name.trim())
    .filter(Boolean)
}

/**
 * #3547 — le forfait encadré, posé SEULEMENT s'il est coché ET que la nature est
 * le forfait : changer la nature le fait taire (le serveur le refuserait de toute
 * façon). Ne pose que ce qui est saisi — rien n'est inventé.
 */
function supervisedFieldsOf(
  draft: NeedWizardDraft,
): Pick<CreateProjectNeed, 'delivery_mode' | 'supervision_role' | 'client_team_size' | 'client_team_names'> {
  if (!draft.supervised || draft.contract_kind !== 'forfait') return {}
  const names = parseClientTeamNames(draft.client_team_names)
  return {
    delivery_mode: 'supervised',
    ...(draft.supervision_role ? { supervision_role: draft.supervision_role } : {}),
    ...(draft.client_team_size ? { client_team_size: draft.client_team_size } : {}),
    ...(names.length > 0 ? { client_team_names: names } : {}),
  }
}

/** Les champs du BESOIN lui-même — sans le client ni le projet, qui disent où
 *  il se pose et non ce qu'il est. Composé par la conversion ci-dessus. */
export function needWizardDraftToCreateInput(draft: NeedWizardDraft): CreateProjectNeed {
  return {
    title: draft.title.trim(),
    skills: draft.skills.length > 0 ? draft.skills : undefined,
    seniority: draft.seniority.trim() ? draft.seniority.trim() : undefined,
    headcount: draft.headcount > 0 ? draft.headcount : undefined,
    target_tjm_cents: draft.target_tjm_cents ?? undefined,
    location: draft.location.trim() ? draft.location.trim() : undefined,
    remote: draft.remote ?? undefined,
    duration_months: draft.duration_months ?? undefined,
    start_on: draft.start_on ? draft.start_on : undefined,
    contract_kind: draft.contract_kind || undefined,
    ...supervisedFieldsOf(draft),
    urgency: draft.urgency ?? undefined,
    // #2174.11/.12 (épopée #2939) — INTERLOCUTEUR et PORTEUR, saisissables dès
    // l'étape 1 désormais (`StepType`). `|| undefined` et jamais une chaîne
    // vide posée : `createProjectNeedSchema` les valide en UUID, une chaîne
    // vide y échouerait en 400 là où l'utilisateur a simplement choisi de ne
    // rien assigner.
    contact_id: draft.contactId || undefined,
    owner_id: draft.ownerId || undefined,
    origin: draft.origin ?? undefined,
    channel: draft.channel ?? undefined,
    required_certifications: draft.required_certifications.length > 0 ? draft.required_certifications : undefined,
    // #2174.17 — un problème vide n'est jamais posé : `.trim()` seul, comme
    // `seniority` juste au-dessus, jamais un `null` explicite inventé.
    context: draft.context.trim() ? draft.context.trim() : undefined,
    // #2939 (#2174.16/.31) — même règle que `context` juste au-dessus.
    expertise: draft.expertise.trim() ? draft.expertise.trim() : undefined,
    constraints: draft.constraints.trim() ? draft.constraints.trim() : undefined,
    // #2939 (#2174.32/.33/.34) — même règle `.trim()`/`|| undefined` que les
    // champs texte libre voisins, jamais une chaîne vide posée.
    decision_process: draft.decisionProcess.trim() ? draft.decisionProcess.trim() : undefined,
    decision_maker_contact_id: draft.decisionMakerContactId || undefined,
    procurement_involvement: draft.procurementInvolvement ?? undefined,
  }
}

/**
 * #2939 (#2174.3/.5/.6) — APPLIQUER UNE COMPILATION AU BROUILLON.
 *
 * L'ÉTAPE 1 propose deux modes d'entrée en plus de la saisie manuelle : coller
 * un brief, coller un e-mail. Les deux passent par le MÊME outil de
 * compilation que la carte de Laura (`compile_need`, `apps/ia`) — jamais un
 * second chemin d'extraction. Cette fonction pure transporte ce qu'il a rendu
 * dans le brouillon : chaque champ COMPILÉ écrase le brouillon (l'étape 1
 * vient de démarrer, rien n'a encore été tapé à la main), et `compiled`
 * lui-même voyage jusqu'à l'étape 5 pour les inconnues bloquantes (#2174.36).
 *
 * #2560 — voir `applyMissionExtractionToDraft` juste après pour la 5e porte
 * (un contrat ou une fiche de poste, PDF/DOCX).
 *
 * ⚠️ Seuls les champs que `NeedWizardDraft` PORTE sont appliqués — `work_to_do`,
 * `entity`, `scope`… n'ont pas de colonne sur le besoin enregistré et
 * n'entrent dans aucun champ du brouillon (voir `need-compilation.ts` pour la
 * raison : un besoin compilé porte plus que ce qu'il enregistre).
 */
export function applyCompiledNeedToDraft(draft: NeedWizardDraft, compiled: CompiledNeed): NeedWizardDraft {
  const next: NeedWizardDraft = { ...draft, compiled }
  for (const entry of compiled.fields) {
    const value = entry.value
    switch (entry.field) {
      case 'title':
        if (typeof value === 'string') next.title = value
        break
      case 'skills':
        if (Array.isArray(value)) {
          next.skills = value
            .filter((item): item is RequiredSkill => typeof item === 'object' && item !== null && 'term' in item)
            .map(item => ({ term: item.term, required: item.required, level: item.level ?? null }))
        }
        break
      case 'seniority':
        if (typeof value === 'string') next.seniority = value
        break
      case 'headcount':
        if (typeof value === 'number') next.headcount = value
        break
      case 'target_tjm_cents':
        if (typeof value === 'number') next.target_tjm_cents = value
        break
      case 'start_on':
        if (typeof value === 'string') next.start_on = value
        break
      case 'duration_months':
        if (typeof value === 'number') next.duration_months = value
        break
      case 'location':
        if (typeof value === 'string') next.location = value
        break
      case 'remote':
        if (typeof value === 'string') next.remote = value as RemotePreference
        break
      case 'contract_kind':
        if (typeof value === 'string') next.contract_kind = value as ContractKind
        break
      case 'urgency':
        if (typeof value === 'string') next.urgency = value as NeedUrgency
        break
      case 'expertise':
        if (typeof value === 'string') next.expertise = value
        break
      case 'context':
        if (typeof value === 'string') next.context = value
        break
      case 'clearances':
        if (Array.isArray(value)) next.required_certifications = value.filter((v): v is string => typeof v === 'string')
        break
      case 'constraints':
        if (typeof value === 'string') next.constraints = value
        break
      case 'process':
        if (Array.isArray(value)) {
          next.decisionProcess = value.filter((v): v is string => typeof v === 'string').join(' · ')
        }
        break
      case 'procurement':
        if (value === 'implique' || value === 'non_implique') next.procurementInvolvement = value
        break
      default:
        break
    }
  }
  const decisionMaker = compiled.proposed_contacts.find(contact => contact.role === 'decideur')
  if (decisionMaker?.contact_id) next.decisionMakerContactId = decisionMaker.contact_id
  return next
}

/**
 * #2939 (#2174.35) — LES SEGMENTS DE LA REFORMULATION RELUE DE L'ÉTAPE 5,
 * « Voici ce que j'ai compris ».
 *
 * ⚠️ Cette fonction ne RÉDIGE aucune phrase — chaque segment est TRADUIT par
 * l'écran (`needWizard.reformulation.*`, FR+EN), jamais du texte figé dans le
 * modèle. Un segment n'apparaît QUE si le brouillon le porte : rien n'est
 * deviné pour remplir une ligne vide.
 */
type NeedWizardReformulationSegment =
  | { kind: 'title'; title: string | null; accountLabel: string | null }
  | { kind: 'skillsRequired'; terms: string[] }
  | { kind: 'skillsOptional'; terms: string[] }
  | { kind: 'tjm'; amount: number }
  | { kind: 'location'; value: string }
  | { kind: 'decisionProcess'; value: string }
  | { kind: 'procurement'; value: NeedProcurementInvolvement }

export function needWizardReformulationSegments(
  draft: NeedWizardDraft,
  accountLabel: string | null,
): NeedWizardReformulationSegment[] {
  const segments: NeedWizardReformulationSegment[] = [
    { kind: 'title', title: draft.title.trim() || null, accountLabel },
  ]
  const required = draft.skills.filter(skill => skill.required).map(skill => skill.term)
  const optional = draft.skills.filter(skill => !skill.required).map(skill => skill.term)
  if (required.length > 0) segments.push({ kind: 'skillsRequired', terms: required })
  if (optional.length > 0) segments.push({ kind: 'skillsOptional', terms: optional })
  if (draft.target_tjm_cents !== null) segments.push({ kind: 'tjm', amount: Math.round(draft.target_tjm_cents / 100) })
  if (draft.location.trim()) segments.push({ kind: 'location', value: draft.location.trim() })
  if (draft.decisionProcess.trim()) segments.push({ kind: 'decisionProcess', value: draft.decisionProcess.trim() })
  if (draft.procurementInvolvement) segments.push({ kind: 'procurement', value: draft.procurementInvolvement })
  return segments
}

/**
 * #2939 (#2174.36) — LES INCONNUES BLOQUANTES DE L'ÉTAPE 5, NOMMÉES.
 *
 * Vide quand aucune compilation n'a eu lieu (`draft.compiled === null`) —
 * « on n'affiche pas ce qu'on n'a pas » : un besoin saisi à la main n'a pas de
 * question à reposer, il vient d'être posé. Sinon, {@link needUnderstandingGaps}
 * (déjà pur, déjà testé, `need-compilation.ts`) DIT ce qui manque, jamais ce
 * champ qui ne fait que le transporter.
 */
export function needWizardBlockingUnknowns(draft: NeedWizardDraft): NeedCompilationField[] {
  if (!draft.compiled) return []
  return needUnderstandingGaps(draft.compiled.fields)
}

/**
 * #2560 — LA LECTURE D'UN CONTRAT OU D'UNE FICHE DE POSTE (PDF, DOCX), cinquième
 * porte de l'étape 1. L'extraction (`extractMission`, `POST /delivery/missions/
 * extract`) est une PROPOSITION : elle ne remplit que les champs du brouillon
 * encore VIDES, jamais ce qu'une personne a déjà saisi, et un champ que le
 * document ne dit pas reste vide.
 *
 * ⚠️ Le COMPTE n'est jamais choisi ici : le nom lu dans le document n'est
 * qu'une indication affichée à l'étape du client, où la personne choisit.
 * Deviner un rattachement depuis un nom écrit dans un PDF serait moins fiable
 * que l'endroit d'où elle clique.
 *
 * Le type d'entrée est STRUCTUREL (jamais `MissionExtraction`) : le module des
 * besoins n'importe pas celui des missions pour trois champs.
 */
type ExtractedMissionFields = {
  status: string
  fields: {
    roleTitle: { value: string | null }
    startedOn: { value: string | null }
    dailyRate: { value: number | null }
  }
}

export function applyMissionExtractionToDraft(
  draft: NeedWizardDraft,
  extraction: ExtractedMissionFields,
): NeedWizardDraft {
  if (extraction.status !== 'ok') return draft
  const next: NeedWizardDraft = { ...draft }
  const { roleTitle, startedOn, dailyRate } = extraction.fields
  if (!next.title.trim() && roleTitle.value) next.title = roleTitle.value
  if (!next.start_on && startedOn.value) next.start_on = startedOn.value
  if (next.target_tjm_cents === null && dailyRate.value !== null)
    next.target_tjm_cents = Math.round(dailyRate.value * 100)
  return next
}

/**
 * #2939 (#2174.6) — DUPLIQUER UN BESOIN EXISTANT, comme troisième mode
 * d'entrée de l'étape 1. Un besoin existant a déjà toute la matière qu'un
 * commercial retaperait sinon — la même raison que le brouillon persistant :
 * ne jamais faire retaper ce qui est déjà écrit.
 *
 * ⚠️ `title` est ÉCARTÉ tel quel, jamais recopié à l'identique : deux besoins
 * du même titre dans la même liste se confondraient au premier coup d'œil — le
 * suffixe nomme le geste, il ne l'efface pas.
 *
 * ⚠️ Le type d'entrée est structurel, jamais `ProjectNeed` — la liste
 * transverse des besoins (`OpenNeedsPage`, source la plus probable d'un choix
 * « dupliquer ») rend `OpenNeedRow`, pas `ProjectNeed` : deux formes voisines,
 * jamais la même (`open-needs.ts`). Les deux satisfont cette forme, plus
 * étroite que chacune.
 */
type DuplicatableNeed = {
  title: string
  account_id: string
  project_id?: string | null
  contact_id?: string | null
  owner_id?: string | null
  origin?: NeedOrigin | null
  channel?: NeedChannel | null
  skills: RequiredSkill[]
  seniority?: string | null
  headcount: number
  target_tjm_cents: number | null
  location?: string | null
  remote?: RemotePreference | null
  duration_months?: number | null
  start_on?: string | null
  contract_kind: ContractKind
  delivery_mode?: DeliveryMode | null
  supervision_role?: SupervisionRole | null
  client_team_size?: number | null
  client_team_names?: string[] | null
  urgency?: NeedUrgency | null
  required_certifications?: string[]
  context?: string | null
  expertise?: string | null
  constraints?: string | null
  decision_process?: string | null
  decision_maker_contact_id?: string | null
  procurement_involvement?: NeedProcurementInvolvement | null
}

export function duplicateNeedIntoDraft(source: DuplicatableNeed): NeedWizardDraft {
  const base = emptyNeedWizardDraft()
  return {
    ...base,
    title: `${source.title} (copie)`.slice(0, 200),
    accountId: source.account_id,
    projectId: source.project_id ?? '',
    contactId: source.contact_id ?? '',
    ownerId: source.owner_id ?? '',
    origin: source.origin ?? null,
    channel: source.channel ?? null,
    skills: source.skills,
    seniority: source.seniority ?? '',
    headcount: source.headcount,
    target_tjm_cents: source.target_tjm_cents,
    location: source.location ?? '',
    remote: source.remote ?? null,
    duration_months: source.duration_months ?? null,
    start_on: source.start_on ?? '',
    contract_kind: source.contract_kind === 'inconnu' ? '' : source.contract_kind,
    supervised: source.delivery_mode === 'supervised',
    supervision_role: source.supervision_role ?? null,
    client_team_size: source.client_team_size ?? null,
    client_team_names: (source.client_team_names ?? []).join(', '),
    urgency: source.urgency ?? null,
    required_certifications: source.required_certifications ?? [],
    context: source.context ?? '',
    expertise: source.expertise ?? '',
    constraints: source.constraints ?? '',
    decisionProcess: source.decision_process ?? '',
    decisionMakerContactId: source.decision_maker_contact_id ?? '',
    procurementInvolvement: source.procurement_involvement ?? null,
  }
}
