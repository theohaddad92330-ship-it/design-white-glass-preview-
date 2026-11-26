import {
  angleProofState,
  displayableAngleProof,
  generatedPlanWeeks,
  homonymLensForAccount,
  isSignalDatedToTheDay,
  MARKET_MEMORY_MIN_PATHS,
  readRecentSignals,
  type AngleProofState,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import type { PlanWeek } from '../../helpers/plan'
import { looksLikePersonName } from '../../helpers/personName'
import { safeArray, safeString } from '../../helpers/safe'

export type PlanRecord = Record<string, unknown>

export type DiscardedAxis = {
  angle: string
  raison: string
  comment_reactiver: string
}

export type AttackAngle = {
  title: string
  description: string
  entryPoint: string
  offer: string
  estimatedDealSize: string
  recommended: boolean
  /** La PREUVE citable, ou `null` quand rien n'est soutenable (tome 5 §32.2). */
  proof: string | null
  /** Ce qu'on a le droit de DIRE de cette preuve — dont « pas encore vérifiée ». */
  proofState: AngleProofState
}

export type RecommendedMovement = {
  movement: string
  sequence: string
  rationale: string
}

/** #2959 — la route commerciale calculée par l'IA (`recommendedRoute`) : son
 *  nom, sa raison, et ses attributs NON VIDES (une absence ne fait aucune ligne). */
export type RecommendedRoute = {
  route: string
  rationale: string
  details: { key: string; value: string }[]
}

/** #3278.b — le signal que le plan suit : daté AU JOUR (le serveur n'en pose pas d'autre). */
export type FollowedSignal = { signal: string; date: string; source: string }

export type NextAction = {
  id: string
  chantier: string
  label: string
  why: string
  /** Échéance de l'action (annexe méthodo p27). Vide sur un dossier analysé
   *  avant que le pipeline ne la produise → affichage à plat, comme avant. */
  horizon: string
}

/**
 * Les échéances p27, dans l'ordre où le commercial les traite.
 *
 * #2317.4 (épopée #2923) — « aujourd'hui » ajouté EN TÊTE, jamais fusionné
 * avec « 7j » (même discipline additive que `action_recommender.HORIZONS`
 * côté IA, GA-08). Aucune action n'y est encore rangée : le bucket vide est
 * écarté par `normalizeNextActionGroups` ci-dessous, comme n'importe quel
 * autre horizon sans action — jamais une section « Aujourd'hui » creuse.
 */
const NEXT_ACTION_HORIZONS = ["aujourd'hui", '7j', '30j', '60j', '90j'] as const

export type NextActionGroup = {
  horizon: string
  actions: NextAction[]
}

/**
 * Prospection inversée (annexe méthodo p7 canal 3 / p9) : quelqu'un qui a
 * TRAVAILLÉ chez ce compte et qui est ailleurs aujourd'hui. Le pipeline la
 * calculait déjà (historique de poste Apollo) sans jamais l'afficher.
 */
export type ReverseProspect = {
  fullName: string
  title: string
  currentCompany: string
  linkedinUrl: string
}

/**
 * Un axe du contexte de vente, tel que le SalesContext déterministe le fixe :
 * la VALEUR retenue, d'où elle vient (`derivation`), à quel point on en est sûr
 * et sur quelles PREUVES.
 *
 * DoD p31 n°6 : « chaque recommandation cite la règle, le profil et les preuves ».
 * Le profil manquait — le SalesContext pilotait le mouvement d'ouverture, le
 * score, le tri des contacts et le choix des actions sans jamais être montré.
 * Le commercial subissait donc une reco sans pouvoir la contester.
 */
export type SalesContextAxis = {
  /** Clé de la valeur retenue (`freelance`, `grand_groupe`, `client_actif`…). */
  value: string
  derivation: string
  confidence: number
  evidence: string[]
}

export type SalesContextView = {
  esnStage: string
  salesStructure: string
  /** #2645.2 — le modèle de revenu déclaré (`recurrent`/`mixte`/`ponctuel`), qui
   *  change l'angle proposé ET la cadence de relance. Porté TEL QUEL, `inconnu`
   *  compris : c'est la vue qui décide de le taire (GA-18/GA-19), pas la
   *  normalisation — sinon deux règles diraient la même chose à deux endroits. */
  revenueModel: string
  /** #2645.1 — rang1 (prime) / rang2 (sous-traitant) / mixte / inconnu, dérivé
   *  côté IA de `service_types`. Voyage tel quel, « inconnu » inclus : c'est la
   *  vue qui décide de le taire, comme pour `esnStage`/`salesStructure`. */
  rankPosition: string
  account: SalesContextAxis | null
  relationship: SalesContextAxis | null
}

export interface IfNoResponse {
  trigger: string | null
  alternativeContact: string | null
  differentAngle: string | null
  reengagementPretext: string | null
}

export type PlanViewData = {
  /** Ce qu'on fait quand personne ne répond. `null` quand la phase 4 ne l'a pas
   *  produit — un plan ancien, ou une génération partielle. */
  ifNoResponse: IfNoResponse | null
  /**
   * De quoi préparer le rendez-vous : les questions qui font VERBALISER au
   * client ses critères, et la trame de l'entretien.
   *
   * ⚠️ La phase 4 produit `powerQuestions` et `rdvScript` à CHAQUE analyse —
   * un appel modèle payé à chaque run — et zéro écran de l'application ne les
   * lisait : seul le back-office les affichait. Le commercial payait une sortie
   * qu'il n'avait jamais sous les yeux. Même famille que `ifNoResponse`.
   */
  meetingPrep: MeetingPrep | null
  strategy: string
  justification: string
  immediateAction: string
  planWeeks: PlanWeek[]
  userActions: ReturnType<typeof normalizeUserActions>
  angles: AttackAngle[]
  /** Les angles écartés + pourquoi. Montrés quand `angles` est vide. */
  discardedAxes: DiscardedAxis[]
  recommendedMovement: RecommendedMovement | null
  recommendedRoute: RecommendedRoute | null
  followedSignal: FollowedSignal | null
  nextActions: NextAction[]
  /** Les mêmes actions rangées par échéance (7j → 90j). Vide quand le dossier
   *  ne porte aucune échéance : l'écran retombe alors sur la liste à plat. */
  nextActionsByHorizon: NextActionGroup[]
  reverseProspects: ReverseProspect[]
  /** Le profil qui a produit toutes les recos ci-dessus. `null` pour un dossier
   *  analysé avant le SalesContext — la carte ne s'affiche alors pas. */
  salesContext: SalesContextView | null
}

/**
 * #3720 — `strategy_type` voyage tantôt en prose (dossiers analysés), tantôt en IDENTIFIANT
 * (`land_and_expand`) : l'écran montrait la clé brute. Un identifiant se lit en libellé (i18n),
 * un identifiant sans libellé se lit sans tiret bas — jamais un libellé inventé ; la prose reste intacte.
 */
function readableStrategy(value: string): string {
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(value)) return value
  return i18n.t(`accountDetail:planSummary.strategyTypes.${value}`, { defaultValue: value.replace(/_/g, ' ') })
}

export function buildPlanViewData(raw: PlanRecord, accountWebsite?: string | null): PlanViewData {
  // LUDOVIC-D LC.2 — un angle d'HOMONYME déjà stocké (« Still Waters Farm » sur STILL) n'est pas
  // affiché : la lentille du compte, apprise de SES signaux, masque l'angle de l'IA (jamais supprimé) ;
  // un angle saisi par un humain (`user_attack_angles`) gagne toujours.
  const homonymLens = homonymLensForAccount(accountWebsite, readRecentSignals(raw['recent_signals']))
  const plan = readRecord(raw['plan']) ?? raw
  const actionPlan =
    readRecord(plan['actionPlan']) ??
    readRecord(plan['action_plan']) ??
    readRecord(raw['actionPlan']) ??
    readRecord(raw['action_plan']) ??
    plan
  const nextActions = normalizeNextActions(plan['nextActions'])

  return {
    strategy: readableStrategy(safeString(actionPlan['strategy'] ?? raw['strategyType'] ?? raw['strategy_type'])),
    justification: safeString(actionPlan['justification'] ?? raw['strategyJustification']),
    immediateAction: safeString(raw['immediate_action'] ?? raw['immediateAction']),
    // #2871 — le MÊME lecteur que la projection canonique de l'API
    // (`GET /accounts/:id/actions`) : mêmes étapes, même ordre (GA-26).
    planWeeks: generatedPlanWeeks(raw),
    // #2123.46 — RÉTRO-COMPATIBILITÉ DE LECTURE, volontaire : les actions saisies
    // AVANT ce lot vivent encore ici, dans `raw_analysis.user_plan_actions`, et un
    // run de ré-analyse REMPLACE tout le blob (voir `ScopeConfirmPanel.tsx`) — donc
    // ne plus les lire les ferait disparaître de l'écran sans qu'elles aient été
    // migrées. Depuis ce lot, une action saisie au formulaire du plan écrit une
    // ligne `action_plan_items` (porte `POST /plan-items`), qui survit à une
    // ré-analyse ; câbler l'écran sur cette ligne (au lieu de ce blob, pour les
    // actions NOUVELLES) reste ouvert — voir le rapport du lot #2123.46/.47.
    userActions: normalizeUserActions(raw['user_plan_actions']),
    angles: [
      ...normalizeAttackAngles(raw['user_attack_angles']),
      ...normalizeAttackAngles(raw['angles']).filter(
        angle => homonymLens.reasonFor({ text: `${angle.title} ${angle.description}` }) === null,
      ),
    ],
    discardedAxes: normalizeDiscardedAxes(raw['axesEcartes'] ?? raw['axes_ecartes']),
    recommendedMovement: normalizeRecommendedMovement(plan['recommendedMovement']),
    recommendedRoute: normalizeRecommendedRoute(plan['recommendedRoute']),
    followedSignal: normalizeFollowedSignal(plan['followedSignal']),
    // « SI SILENCE » — le troisième point du premier mouvement (tome 5 §14.4).
    // La phase 4 le produit depuis le premier jour (`if_no_response`) et AUCUN
    // écran ne le lisait : un plan qui ne dit pas quoi faire quand personne ne
    // répond laisse le commercial relancer au hasard, ou pas du tout.
    ifNoResponse: normalizeIfNoResponse(raw['if_no_response'] ?? plan['ifNoResponse']),
    meetingPrep: normalizeMeetingPrep(raw, plan),
    nextActions,
    nextActionsByHorizon: normalizeNextActionGroups(plan['nextActionsByHorizon'], nextActions),
    reverseProspects: normalizeReverseProspects(plan['reverseProspects']),
    // Le SalesContext est posé à la RACINE du dossier par la phase 1 ; on le lit
    // aussi sous `plan` par tolérance aux appelants qui passent le sous-objet.
    salesContext: normalizeSalesContext(raw['salesContext'] ?? plan['salesContext']),
  }
}

/** Un axe du contexte de vente. `null` dès que la valeur manque : on n'affiche
 *  jamais un axe vide, et on ne suppose jamais une valeur par défaut. */
function normalizeSalesContextAxis(value: unknown, key: string): SalesContextAxis | null {
  const record = readRecord(value)
  if (!record) return null
  const resolved = safeString(record[key])
  if (!resolved) return null
  const confidence = record['confidence']
  return {
    value: resolved,
    derivation: safeString(record['derivation']),
    confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0,
    evidence: safeArray(record['evidence'])
      .map(item => safeString(item))
      .filter(Boolean),
  }
}

/** Le profil de vente qui a produit les recommandations du dossier (DoD n°6).
 *  `null` quand le dossier n'en porte pas — la carte ne s'affiche simplement pas
 *  plutôt que d'inventer un stade ou une relation. */
function normalizeSalesContext(value: unknown): SalesContextView | null {
  const record = readRecord(value)
  if (!record) return null
  const esnProfile = readRecord(record['esnProfile']) ?? {}
  const gtm = readRecord(esnProfile['gtm']) ?? {}
  const businessModel = readRecord(esnProfile['businessModel']) ?? {}
  const view: SalesContextView = {
    esnStage: safeString(esnProfile['stage']),
    salesStructure: safeString(gtm['structure']),
    // #2645.2 — le fait qui a produit l'angle et les dates de relance.
    revenueModel: safeString(businessModel['revenueModel']),
    rankPosition: safeString(businessModel['rankPosition']),
    account: normalizeSalesContextAxis(record['account'], 'archetype'),
    relationship: normalizeSalesContextAxis(record['relationship'], 'state'),
  }
  // Un contexte dont AUCUN axe n'est résolu n'apprend rien au commercial.
  return view.esnStage || view.account || view.relationship ? view : null
}

/** Ex-collaborateurs du compte. Une entrée sans nom n'est pas actionnable — on
 *  la jette plutôt que d'afficher une ligne creuse (JAMAIS de donnée inventée :
 *  clé absente du dossier ⇒ liste vide ⇒ la carte ne s'affiche pas). */
function normalizeReverseProspects(value: unknown): ReverseProspect[] {
  return (
    safeArray(value)
      .map(entry => {
        const record = readRecord(entry) ?? {}
        return {
          fullName: safeString(record['fullName']),
          title: safeString(record['title']),
          currentCompany: safeString(record['currentCompany']),
          linkedinUrl: safeString(record['linkedinUrl']),
        }
      })
      // #4399.5 — seule une personne (prénom + nom) entre dans la liste ; rien n'est supprimé en base.
      .filter(prospect => looksLikePersonName(prospect.fullName))
  )
}

/** Une destination agrégée : combien d'ex-collaborateurs de ce compte y sont
 *  allés, JAMAIS lesquels. */
export type TrajectoryDestination = {
  company: string
  persons: number
}

/**
 * #1611.6 — LE SECOND BLOC, AGRÉGÉ, DES TRAJECTOIRES.
 *
 * `ReverseProspectsSection` liste les ex-collaborateurs INDIVIDUELLEMENT, nom
 * et profil compris — c'est le bloc Apollo, une porte d'entrée chaude et
 * nommée. Le retour en demande l'OPPOSÉ : « Ce que Bellum observe dans les
 * trajectoires » — les destinations où PLUSIEURS ex-collaborateurs sont
 * allés, sans jamais nommer qui.
 *
 * ⚠️ Le seuil est `MARKET_MEMORY_MIN_PATHS` (3), importé — jamais recopié
 * (GA-26). Ce n'est pas littéralement une lecture de la mémoire marché (les
 * `reverseProspects` viennent d'Apollo, sur CE compte) : c'est la MÊME raison
 * d'être — sous 3 occurrences, un chiffre ne distingue rien d'une coïncidence,
 * et l'agrégat désignerait une poignée de personnes précises plutôt qu'un
 * motif. Le lot le cite explicitement comme LE seuil d'anonymisation à tenir.
 *
 * Trié par nombre décroissant, puis alphabétique — jamais par ordre d'arrivée
 * dans le dossier, qui ne veut rien dire pour le lecteur.
 */
export function aggregatedTrajectoryDestinations(prospects: readonly ReverseProspect[]): TrajectoryDestination[] {
  const counts = new Map<string, number>()
  for (const prospect of prospects) {
    const company = prospect.currentCompany.trim()
    if (!company) continue
    counts.set(company, (counts.get(company) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, persons]) => persons >= MARKET_MEMORY_MIN_PATHS)
    .map(([company, persons]) => ({ company, persons }))
    .sort((a, b) => b.persons - a.persons || a.company.localeCompare(b.company))
}

function normalizeRecommendedMovement(value: unknown): RecommendedMovement | null {
  const record = readRecord(value)
  if (!record) return null
  const movement = safeString(record['movement'])
  const sequence = safeString(record['sequence'])
  const rationale = safeString(record['rationale'])
  if (!movement && !sequence && !rationale) return null
  return { movement, sequence, rationale }
}

/** Les attributs de la route, dans l'ordre où le commercial les parcourt. */
const ROUTE_DETAIL_KEYS = [
  'motivating_signal',
  'first_door',
  'info_to_obtain',
  'proof',
  'proof_cited',
  'channel_history',
  'next_contact',
  'passage_condition',
  'fallback_plan',
  'discouraged_route',
] as const

function normalizeRecommendedRoute(value: unknown): RecommendedRoute | null {
  const record = readRecord(value)
  if (!record) return null
  const route = safeString(record['route'])
  if (!route) return null
  const details = ROUTE_DETAIL_KEYS.flatMap(key => {
    const text = safeString(record[key])
    return text ? [{ key, value: text }] : []
  })
  return { route, rationale: safeString(record['rationale']), details }
}

function normalizeFollowedSignal(value: unknown): FollowedSignal | null {
  const record = readRecord(value)
  if (!record) return null
  const signal = safeString(record['signal'])
  const date = safeString(record['date'])
  // Une actualité se date au jour ou n'apparaît pas (#3917.r39) : même prédicat que le bloc des signaux.
  if (!signal || !isSignalDatedToTheDay(date)) return null
  return { signal, date, source: safeString(record['source']) }
}

function normalizeNextActions(value: unknown): NextAction[] {
  return safeArray(value)
    .map(action => {
      const record = readRecord(action) ?? {}
      return {
        id: safeString(record['id']),
        chantier: safeString(record['chantier']),
        label: safeString(record['label']),
        why: safeString(record['why']),
        horizon: safeString(record['horizon']),
      }
    })
    .filter(action => action.label)
}

/**
 * Les actions rangées par échéance 7/30/60/90 (annexe méthodo p27). Le dossier
 * livre la vue groupée ; on retombe sur l'échéance portée par chaque action
 * quand elle manque, puis sur rien du tout — un dossier analysé avant les
 * horizons n'a ni l'une ni l'autre et s'affiche comme avant, à plat.
 * Les buckets vides sont écartés : jamais de section « 60 jours » creuse.
 */
function normalizeNextActionGroups(value: unknown, actions: NextAction[]): NextActionGroup[] {
  const grouped = readRecord(value)
  return NEXT_ACTION_HORIZONS.map(horizon => ({
    horizon,
    actions: grouped ? normalizeNextActions(grouped[horizon]) : actions.filter(action => action.horizon === horizon),
  })).filter(group => group.actions.length > 0)
}

export function readRecord(value: unknown): PlanRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as PlanRecord) : null
}

/**
 * Les angles que l'analyse a délibérément écartés.
 *
 * On ne garde que ceux qui NOMMENT l'angle : une raison sans angle n'apprend
 * rien, et remplirait la carte d'entrées creuses — exactement ce que ce panneau
 * doit cesser de faire.
 */
function normalizeDiscardedAxes(value: unknown): DiscardedAxis[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      const record = readRecord(item)
      if (!record) return null
      const angle = safeString(record['angle'])
      if (!angle) return null
      return {
        angle,
        raison: safeString(record['raison']),
        comment_reactiver: safeString(record['commentReactiver'] ?? record['comment_reactiver']),
      }
    })
    .filter((axis): axis is DiscardedAxis => axis !== null)
}

function normalizeAttackAngles(value: unknown): AttackAngle[] {
  return safeArray(value)
    .map(angle => {
      const record = readRecord(angle) ?? {}
      return {
        title: safeString(record['title']),
        description: safeString(record['strategy'] ?? record['description']),
        entryPoint: safeString(record['entry_contact_persona'] ?? record['entry_point']),
        offer: safeString(record['specific_offer'] ?? record['offer']),
        estimatedDealSize: safeString(record['estimated_deal_size']),
        recommended: record['is_recommended'] === true,
        // ⚠️ Un normaliseur qui n'ajoute pas le champ neuf le fait disparaître
        // en silence : la donnée arrive dans `raw_analysis` et l'écran ne la
        // voit jamais. C'est le défaut qui a déjà vidé persona / offre /
        // deal-size, et il ne laisse aucune trace — l'écran affiche « rien »,
        // ce qui ressemble exactement à « il n'y a rien ».
        proof: displayableAngleProof(record),
        proofState: angleProofState(record),
      }
    })
    .filter(angle => angle.title || angle.description)
}

function normalizeUserActions(value: unknown) {
  return safeArray(value)
    .map(action => {
      const record = readRecord(action) ?? {}
      return {
        text: safeString(record['text'] ?? record['action']),
        // p27 : « chaque action doit préciser owner, canal, contact, raison,
        // échéance, résultat attendu et feedback ». `owner` et `reason` étaient
        // GÉNÉRÉS par le plan et lus par personne — le champ historique de la
        // vue s'appelle `responsable`, celui du modèle `owner`. On lit les deux.
        responsable: safeString(record['responsable'] ?? record['owner']) || undefined,
        outil: safeString(record['outil'] ?? record['channel']) || undefined,
        deadline: safeString(record['deadline']) || undefined,
        kpi: safeString(record['kpi']) || undefined,
        expectedOutcome: safeString(record['expected_outcome'] ?? record['expectedOutcome']) || undefined,
        // La RAISON de l'action : c'est elle qui rend le plan discutable plutôt
        // qu'une liste de tâches. Sans elle, « Demander une intro » ne dit pas
        // pourquoi cette porte-là plutôt qu'une autre.
        reason: safeString(record['reason']) || undefined,
        contact: safeString(record['contact']) || undefined,
      }
    })
    .filter(action => action.text)
}

/** `if_no_response` de la phase 4, ramené à ce que l'écran sait montrer.
 *  `null` dès que rien d'exploitable n'y est : un bloc « si silence » vide se
 *  lirait comme « il n'y a rien à faire », ce qui est le contraire. */
/** Les questions de soutenance et la trame du rendez-vous, ou `null`. */
export interface MeetingPrep {
  /** Questions ouvertes qui font verbaliser critères, KPI et douleurs. */
  powerQuestions: string[]
  /** La trame, section par section. Chaque entrée porte son intitulé. */
  script: { key: string; text: string }[]
}

/** L'ordre du rendez-vous — il n'est pas alphabétique, il est chronologique.
 *  Le lire depuis les clés de l'objet rendrait la trame incompréhensible. */
const RDV_SECTIONS = ['opening', 'positioning', 'exploration', 'proposal', 'closing'] as const

function normalizeMeetingPrep(raw: PlanRecord, plan: PlanRecord): MeetingPrep | null {
  const questions = safeArray(raw['powerQuestions'] ?? raw['power_questions'] ?? plan['powerQuestions'])
    .map(q => safeString(q).trim())
    .filter(Boolean)
  const scriptRecord = readRecord(raw['rdvScript'] ?? raw['rdv_script'] ?? plan['rdvScript'])
  const script: { key: string; text: string }[] = []
  for (const key of RDV_SECTIONS) {
    // `safeString` ne coupe pas les blancs : une section faite de trois espaces
    // passerait pour du contenu et afficherait un bloc vide dans la trame.
    const text = safeString(scriptRecord?.[key]).trim()
    if (text) script.push({ key, text })
  }
  // Rien à préparer n'est pas une carte vide : c'est une carte absente.
  return questions.length > 0 || script.length > 0 ? { powerQuestions: questions, script } : null
}

function normalizeIfNoResponse(value: unknown): IfNoResponse | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const out: IfNoResponse = {
    trigger: safeString(raw['trigger']) || null,
    alternativeContact: safeString(raw['alternative_contact'] ?? raw['alternativeContact']) || null,
    differentAngle: safeString(raw['different_angle'] ?? raw['differentAngle']) || null,
    reengagementPretext: safeString(raw['reengagement_pretext'] ?? raw['reengagementPretext']) || null,
  }
  return Object.values(out).some(Boolean) ? out : null
}
