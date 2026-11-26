import type {
  AccountSize,
  ActionTargetKind,
  AnalysisDepth,
  AnalysisParameters,
  AuditActiveLoad,
  AuditConditionalRoadmapItem,
  AuditContradiction,
  AuditDeclaredSignals,
  AuditFact,
  AuditFunnelStage,
  AuditNamedNote,
  AuditProductArea,
  AuditRecommendedDirection,
  AuditSignalsInput,
  AuditWeek,
  AuditWeeklyPriority,
  CadenceRecommendation,
  CoachingInsights,
  CommercialAuditContext,
  DecisionLevel,
  EntryStrategy,
  EsnArchetype,
  IdealAccountProfile,
  KpiTargets,
  MessageLength,
  MessagingStyle,
  MessagingTone,
  MyPlanAction,
  ProfileContext,
  ProfileContextRevisionSummary,
  SellingPosture,
} from '@bellum/contracts'
import {
  ACTIVITY_MEASURES,
  auditEvaluableAxes,
  auditHypothesesFrom,
  auditMovesFrom,
  buildAuditActiveLoad,
  buildAuditDeclaredSignals,
  buildAuditProductConfiguration,
  buildStrategicOptions,
  COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION,
  effectiveEntryStrategy,
  hasFunctionalSpecialization,
  MAX_WEEKLY_PRIORITIES,
  MINIMUM_SCORE_AXES,
} from '@bellum/contracts'
import { AUDIT_CHAIN_STAGE_LABELS_FR, buildAuditChain, type AuditChainStage } from './audit-chain'
import { buildWeeklyPriority } from './audit-priority'
import { buildAuditVerdict } from './audit-verdict'
import {
  detectCommercialTensions,
  TENSION_RULE_COUNT,
  type CommercialTensionExternalSignals,
} from './tension-detectors'
import { computeCommercialMaturity } from './maturity-axes'

/**
 * L'AUDIT COMMERCIAL — ce que le produit a COMPRIS de l'activité, en clair.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE DÉRIVATION PURE, ET PAS DU JSX QUI LIT LE CONTEXTE
 * ─────────────────────────────────────────────────────────────────────────
 * Tout ce qui tranche « mesuré » contre « non mesuré » vit ICI, sans React et
 * sans i18n : c'est la seule partie qu'un test peut faire dire NON. Les
 * composants ne font que rendre — ils ne décident jamais qu'une valeur absente
 * vaut zéro.
 *
 * ⚠️ La règle qui gouverne ce fichier, à se poser sur CHAQUE champ :
 * *si cette valeur est absente, « 0 » est-il VRAI ?* Elle a deux réponses
 * distinctes, et les confondre est le défaut qu'on répare ici :
 *  - le bloc source MANQUE → `null` : non mesuré, et l'écran le NOMME ;
 *  - le bloc source EXISTE et ne nomme rien → `[]` / la valeur `0` : c'est un
 *    fait mesuré, et il s'affiche tel quel.
 */

export type AuditOrigin =
  | 'sellingPosture'
  | 'esnArchetype'
  | 'idealAccountProfile'
  | 'coachingInsights'
  | 'cadenceRecommendation'
  | 'kpiTargets'
  | 'messagingStyle'
  | 'analysisParameters'
  | 'bellumPhrases'

/**
 * Les blocs de l'écran qui ne viennent PAS d'une entrée de profil : ils
 * arrivent par le contrat (`CommercialAuditContext`) et aucune source ne les
 * produit encore (#2068). Ils sont ici, et non seulement dans
 * `buildCommercialAuditContext`, parce que la liste de ce qui n'a pas pu être
 * établi doit pouvoir les LIRE — voir `blockStates` plus bas.
 */
type AuditContextBlockKey = 'thirtyDayPlan' | 'milestones' | 'productConfiguration' | 'declaredSignals'

/** Les blocs dont l'absence est celle d'une SOURCE — profil ou contrat. */
type AuditUnestablishedFixedKey = AuditOrigin | AuditContextBlockKey

/**
 * #2457 — TROISIÈME forme : un bloc dont l'absence n'est pas celle d'une
 * source, mais d'une CONCLUSION non tirée. `verdict`/`maturity`/`priority`
 * tournent sur le MÊME `ProfileContext` que le reste de cet audit ; « non
 * mesuré » y est un RÉSULTAT (« rien n'a permis de trancher »), jamais un
 * bloc qui n'est jamais arrivé — voir `architecture/
 * audit-unestablished-reads-the-screen.test.ts` (GA-345) pour la raison
 * produit de leur entrée dans cette liste.
 */
type AuditUnestablishedDerivedKey = 'verdict' | 'maturity' | 'priority' | 'moves'

/**
 * #2067.2 / #2067.4 / #2067.5 / #2067.6 — QUATRIÈME forme : une grandeur de
 * l'arbitrage de la charge active (`commercial-audit-active-load.ts`). Elle ne
 * manque ni d'un bloc source entier ni d'une conclusion : elle manque d'une
 * RÉPONSE précise, et l'entrée NOMME laquelle (`missingAnswers`) — « il manque
 * ton temps protégé » se répare, « non établi » tout court ne dit pas comment.
 */
type AuditActiveLoadEntryKey = 'activeLoadPartners' | 'activeLoadSlots' | 'activeLoadReserve' | 'activeLoadDeferred'
type AuditActiveLoadMissingAnswers = Extract<AuditActiveLoad['reserve'], { kind: 'answerMissing' }>['missingAnswers']

/**
 * Pourquoi un bloc n'a pas pu être établi. Une CLÉ, pas une phrase : le texte
 * vit dans l'i18n, aux deux langues, et la distinction porte une conséquence
 * pour l'utilisateur — `profileMissing` se répare en complétant son profil,
 * `noSourceYet` ne se répare pas de son côté, et lui proposer le questionnaire
 * serait une fausse promesse.
 *
 * #2068.1 — décision Louis 19/09/2026 (2068.11) : `thirtyDayPlan` a désormais
 * une source (Actions, `GET /plan-items/mine`) — `noSourceYet` mentirait
 * (« aucune source ne le produit » alors qu'une source existe et a répondu
 * « rien »). `noActionsYet` porte SA propre réparation : créer une action
 * dans Actions, pas compléter le profil ni attendre un moteur séparé.
 */
type AuditUnestablishedReason = 'profileMissing' | 'noSourceYet' | 'noActionsYet'

/**
 * #2457 — un bloc FIXE ou PAR ITEM porte une clé d'i18n nue ; un bloc DÉRIVÉ
 * porte en plus le COMPTE qui a manqué pour conclure — jamais un
 * « indisponible » qui taperait sur la même doctrine que « non mesuré rendu
 * 0 » un cran plus haut. Deux formes de compte, pas une troisième inventée :
 *  - `verdict`/`priority` n'ont que les 18 règles de tension à vérifier
 *    (`rulesChecked`) ; aucune n'a détecté de rupture.
 *  - `maturity` porte SES TROIS nombres : combien d'axes ont pu être évalués,
 *    sur combien au total, et le seuil minimal pour un score global — jamais
 *    un taux (GA-259 : ce n'est pas une couverture de marché).
 */
export type AuditUnestablishedEntry =
  | { key: AuditUnestablishedFixedKey; reason: AuditUnestablishedReason }
  | { key: 'verdict' | 'priority' | 'moves' | 'hypotheses'; reason: 'notConcluded'; rulesChecked: number }
  | { key: 'maturity'; reason: 'notConcluded'; axesEvaluated: number; axesTotal: number; axesMinimum: number }
  /**
   * #2067 — une réponse manque : l'entrée la NOMME, et elle se répare en
   * répondant. #2067.2 compris depuis la décision de Louis du 18/09/2026 : la
   * question « avec combien de partenaires ? » existe, l'ancien `noSourceYet`
   * (« aucune question ne le demande ») n'a plus de cas.
   */
  | { key: AuditActiveLoadEntryKey; reason: 'profileMissing'; missingAnswers: AuditActiveLoadMissingAnswers }

/** Les trois blocs du contrat que l'écran rend aussi (#2068). */
type AuditContextBlocks = Pick<CommercialAuditContext, AuditContextBlockKey>

type AuditHeadlineKey = 'posture' | 'archetype' | 'target' | 'bottleneck' | 'cadence'

type AuditHeadlineValue =
  | { kind: 'posture'; posture: SellingPosture }
  | { kind: 'archetype'; archetype: EsnArchetype }
  | { kind: 'target'; size: AccountSize; decisionLevel: DecisionLevel; entryStrategy: EntryStrategy; sectors: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'cadence'; analysesPerWeek: number; messagesPerDay: number; followUpsPerWeek: number }

export type AuditHeadline = {
  key: AuditHeadlineKey
  origin: AuditOrigin
  /** `null` = non mesuré. Jamais une chaîne vide, jamais un zéro de remplissage. */
  value: AuditHeadlineValue | null
}

type AuditColumnKey = 'stop' | 'keep' | 'reinforce'

export type AuditColumn = {
  key: AuditColumnKey
  origin: AuditOrigin
  /**
   * `null` = le bloc source manque : NON MESURÉ.
   * `[]` = le bloc existe et n'a rien nommé : mesuré, et vide.
   * #2072.9 — les deux se disent autrement : une absence de donnée n'est pas
   * une faiblesse prouvée.
   */
  items: string[] | null
}

type AuditConsequenceKey = 'accounts' | 'contacts' | 'messages' | 'load' | 'kpiTargets' | 'routines' | 'copilot'

export type AuditConsequenceRule =
  | { kind: 'accounts'; size: AccountSize; entryStrategy: EntryStrategy; sectors: string[] }
  | { kind: 'contacts'; decisionLevel: DecisionLevel }
  | { kind: 'messages'; tone: MessagingTone; length: MessageLength; angle: string }
  | { kind: 'load'; analysesPerWeek: number; messagesPerDay: number; followUpsPerWeek: number }
  /**
   * #2067.1 / #2067.3 / #2067.2 — un nombre de comptes actifs, un volume de
   * suivi, et un nombre de partenaires à travailler, recommandés PAR MOIS,
   * tirés de `coachingInsights.kpiTargets`.
   * ⚠️ #2067.1 à #2067.6 en demandaient SIX (comptes, partenaires, suivi,
   * créneaux, réserve, éléments à reporter). Les PARTENAIRES ont rejoint la
   * liste le 20/09/2026 (arbitrage Louis) : le moteur calcule désormais
   * `kpiTargets.partnersPerMonth` par archétype
   * (`apps/ia/app/models/profile_context.py`), il y a donc une SOURCE. Les
   * trois derniers (créneaux, réserve, éléments à reporter) restent hors de
   * ce type — les ajouter sans source serait la donnée fictive que le dépôt
   * refuse ; ils sont servis à côté par `buildAuditActiveLoad`
   * (#2067.4/.5/.6), qui les tire des réponses DÉCLARÉES.
   * ⚠️ `partnersPerMonth` est `null` quand le moteur n'a pas su la calculer
   * (aucune porte partenaire, ou base partenaires non déclarée) : l'absence
   * est NOMMÉE dans la règle et l'écran n'écrit rien — jamais « 0 »
   * (gardes GA-18 / GA-19).
   * ⚠️ `conversionRateTarget` (le troisième champ de `kpiTargets`) n'entre
   * JAMAIS ici : c'est un taux de conversion, la forme exacte du
   * prévisionnel pondéré que la doctrine « aucune probabilité » refuse
   * (six fois). `build-audit.test.ts` le garde par une lecture de l'objet
   * SÉRIALISÉ, pas seulement de ce type.
   */
  | { kind: 'kpiTargets'; accountsPerMonth: number; rdvPerMonth: number; partnersPerMonth: number | null }
  | { kind: 'routines'; depth: AnalysisDepth; focusAreas: string[] }
  | { kind: 'copilot'; personalized: true }

export type AuditConsequence = {
  key: AuditConsequenceKey
  origin: AuditOrigin
  /** `null` = non mesuré : le produit ne promet pas une règle qu'il n'a pas. */
  rule: AuditConsequenceRule | null
}

export type CommercialAudit = {
  headlines: AuditHeadline[]
  columns: AuditColumn[]
  consequences: AuditConsequence[]
  /**
   * #2071.7 — ce qui remplace le « niveau de confiance » demandé : la LISTE
   * NOMMÉE de ce qui n'a pas pu être établi. Pas de pourcentage, pas de score :
   * un chiffre unique mesurerait la complétude de nos données et se lirait
   * comme une chance de réussite. Sous trois axes il n'y a pas de score, et
   * celui-ci n'en est pas un.
   *
   * ⚠️ Défaut du 16/09/2026 — elle décrit l'ÉCRAN, pas le profil : voir `blockStates`.
   */
  unestablished: AuditUnestablishedEntry[]
  /**
   * Les trois blocs du contrat rendus par `AuditPlanAndMilestones`. Ils
   * voyagent sur `CommercialAudit` — et non plus construits au vol dans
   * `buildCommercialAuditContext` — pour que `unestablished` les VOIE. Tant
   * qu'ils vivaient plus loin, la liste ne pouvait pas les nommer, et l'écran
   * se démentait lui-même.
   */
  contextBlocks: AuditContextBlocks
  /**
   * #2067.2 / .4 / .5 / .6 — l'arbitrage de la charge active, TOUJOURS dérivé :
   * une grandeur qui n'a pas pu l'être est `answerMissing` en place,
   * et NOMMÉE dans `unestablished` — jamais un bloc absent qui se tairait.
   */
  activeLoad: AuditActiveLoad
  /** Version du contexte de profil, `null` tant qu'aucun instantané n'existe. */
  version: number | null
  /** Date ISO du dernier instantané, `null` si inconnue. */
  updatedAt: string | null
}

/** Un texte n'est un fait que s'il dit quelque chose : « » et « &nbsp; » n'en sont pas. */
// #4422.3 — le drapeau de spécialisation fonctionnelle, calculé UNE fois ici
// depuis les réponses (`hasFunctionalSpecialization`) et relayé aux détecteurs.
function withFunctionalSpecialization(
  signals: CommercialTensionExternalSignals | undefined,
  answers: AuditSignalsInput | null | undefined,
): CommercialTensionExternalSignals | undefined {
  if (!hasFunctionalSpecialization(answers)) return signals
  return { ...signals, functionalSpecialization: true }
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Les entrées non vides d'une liste de chaînes, la liste VIDE restant une liste. */
function entries(values: readonly string[] | undefined): string[] | null {
  if (!values) return null
  return values.map(v => v.trim()).filter(v => v.length > 0)
}

/**
 * #2049.15 — UNE ÉTAPE NON MESURÉE SE NOMME, ELLE NE VAUT PAS 0 %.
 *
 * Les onze unités comparables, dans l'ordre de l'entonnoir, chacune COMPTÉE ou
 * NON COMPTÉE par l'ESN. `count` reste `null` PARTOUT, et ce n'est pas un oubli :
 * le questionnaire ne demande aucun nombre. Écrire `0` là où personne n'a compté
 * ferait exactement ce que #2049.14 interdit — un chiffre qui mesure la
 * complétude de NOS données. La rupture se lit sur `measurement`, jamais sur un
 * taux : localiser n'est pas convertir.
 *
 * `null` quand la question n'a pas été posée — « on n'a pas demandé » n'est pas
 * « rien n'est suivi ».
 */
function funnelStages(signals: AuditDeclaredSignals | null): AuditFunnelStage[] | null {
  const signal = signals?.funnelBreak
  if (signal === undefined || signal.kind === 'notDeclared') return null
  const tracked = new Set(signal.trackedStages)
  return [...ACTIVITY_MEASURES]
    .sort((a, b) => a.funnelRank - b.funnelRank)
    .map(measure => ({
      stage: measure.value,
      count: null,
      measurement: tracked.has(measure.value) ? ('tracked' as const) : ('notTracked' as const),
    }))
}

/**
 * Le questionnaire a-t-il établi QUELQUE CHOSE ? Un bloc lu dont les cinq
 * signaux répondent « non déclaré » n'a rien établi, et la liste du bas doit
 * pouvoir le dire — sinon l'écran se démentirait lui-même une deuxième fois
 * (défaut du 16/09/2026, GA-345).
 */
function hasAnyDeclaredSignal(signals: AuditDeclaredSignals | null): boolean {
  if (signals === null) return false
  return Object.values(signals).some(signal => signal.kind !== 'notDeclared')
}

/**
 * #2068.1 / #2068.24-.31 — décision Louis 19/09/2026 (2068.11) : la
 * replanification vit dans ACTIONS (GA-26), l'audit y renvoie. Le lien entre
 * le TYPE d'objet visé par une action (`ActionTargetKind`, les huit natures
 * de `action-plan-items.ts`) et l'AIRE PRODUIT qu'elle fait avancer
 * (`AuditProductArea`) s'écrit ICI, et nulle part ailleurs.
 *
 * Six des huit natures se relient sans ambiguïté à une aire du registre
 * #2068.23-.31 : un `contact` fait avancer Contacts, une `sequence` fait
 * avancer Séquences, un `meeting` et une `crm_task` sont tous deux du
 * pilotage d'agenda (Routines · Pilotage · Notifications), un `need` (un
 * poste à pourvoir) est la matière du Matching, un `partner` est le levier du
 * Reverse Market (placement via l'écosystème). `project` (une initiative
 * interne au client, ex. « Refonte du SI RH ») et `verification` (une DONNÉE
 * à vérifier, pas un domaine produit) n'ont AUCUNE aire aujourd'hui — plutôt
 * qu'un rattachement deviné, elles rendent `null` : le domaine n'apparaît
 * pas, il ne ment pas non plus.
 */
export const ACTION_TARGET_DOMAIN: Readonly<Partial<Record<ActionTargetKind, AuditProductArea>>> = {
  contact: 'contacts',
  meeting: 'routinesPilotageNotifications',
  crm_task: 'routinesPilotageNotifications',
  sequence: 'sequences',
  need: 'matchingActionPlan',
  partner: 'reverseMarket',
}

export function domainForActionTarget(kind: ActionTargetKind | null | undefined): AuditProductArea | null {
  if (!kind) return null
  return ACTION_TARGET_DOMAIN[kind] ?? null
}

/**
 * #2068.1 — décision Louis 19/09/2026 (2068.11) : le plan à 4 semaines de
 * l'audit se LIT depuis Actions (« mes actions ouvertes », `GET
 * /plan-items/mine`), il n'est plus un bloc que rien ne produit. `myActions`
 * `null`/`undefined`/`[]` rendent tous `null` ici — « aucun élément du tout »
 * (#2068.1) : la nuance chargement/lu vit dans le flag `isLoading` du hook
 * appelant, pas dans ce bloc (même convention que `declaredSignals`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FENÊTRE GLISSANTE DE 7 JOURS, JAMAIS `week_index`
 * ─────────────────────────────────────────────────────────────────────────
 * `myActions` traverse plusieurs comptes (#2123.46, « tous comptes
 * confondus »), chacun avec son PROPRE `week_index` — la position de l'action
 * dans LE PLAN GÉNÉRÉ DE SON COMPTE (#2123.46). Le lire comme un numéro de
 * semaine PERSONNEL mélangerait la semaine 1 du compte A avec la semaine 1 du
 * compte B, qui n'ont aucun rapport de calendrier entre elles — une
 * répartition devinée, exactement ce que la doctrine interdit. Seule
 * `due_date` (une vraie date calendaire, propre à CHAQUE action) est
 * comparable entre comptes : c'est elle qui place une action dans une
 * semaine.
 *
 * Une action SANS échéance n'est pas perdue — elle reste sur `/actions` —
 * mais elle n'entre pas dans CE bloc : la doctrine interdit un créneau
 * supposé (#2068.13), et une semaine sans date ne se laisse pas ranger sans
 * l'inventer. Une échéance PASSÉE (relance en retard) est traitée comme
 * relevant de la semaine EN COURS — la plus urgente, jamais reportée hors
 * fenêtre. Au-delà de la 4e semaine, l'action n'entre pas non plus : la revue
 * hebdomadaire ne porte que sur l'horizon du plan (#2068.12).
 *
 * Un compte source EXISTE et n'a rien à placer dans une semaine donnée →
 * cette semaine rend `priorities: []` (l'écran dit « rien de planifié cette
 * semaine », jamais un `null` qui prétendrait qu'aucune source n'a répondu) ;
 * seule l'ABSENCE TOTALE d'action ouverte rend `null`.
 */
export function buildThirtyDayPlanFromActions(
  myActions: readonly MyPlanAction[] | null | undefined,
  today: Date = new Date(),
): AuditWeek[] | null {
  if (!myActions || myActions.length === 0) return null
  const todayMidnightUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const weeks: AuditWeeklyPriority[][] = [[], [], [], []]
  for (const item of myActions) {
    if (item.due_date === null) continue
    const dueMidnightUTC = Date.parse(`${item.due_date}T00:00:00Z`)
    if (Number.isNaN(dueMidnightUTC)) continue
    const daysFromToday = Math.round((dueMidnightUTC - todayMidnightUTC) / 86_400_000)
    const weekIndex = Math.floor(Math.max(daysFromToday, 0) / 7)
    if (weekIndex > 3) continue
    const bucket = weeks[weekIndex]
    // #2068.2/.13 — trois priorités maximum par semaine ; le contrat le
    // borne aussi (`auditWeekSchema`), on ne lui envoie jamais une 4e.
    if (bucket.length >= MAX_WEEKLY_PRIORITIES) continue
    bucket.push({
      expectedResult: item.expected_outcome ?? item.label,
      action: item.label,
      owner: item.owner_name,
      // #2068.13 — aucun créneau, aucune dépendance, aucune preuve, aucun
      // lien de surface, aucune condition de remplacement : Actions ne
      // mesure encore aucun des cinq, un `null` ici est honnête, pas un
      // renoncement.
      slot: null,
      dependency: null,
      completionProof: null,
      surfaceLink: null,
      replacementCondition: null,
      domain: domainForActionTarget(item.target?.kind ?? null),
    })
  }
  return weeks.map((priorities, index) => ({ weekNumber: index + 1, priorities }))
}

export function buildCommercialAudit(
  context: ProfileContext | null | undefined,
  revisions: readonly ProfileContextRevisionSummary[] | undefined,
  /**
   * #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — LES RÉPONSES DU
   * QUESTIONNAIRE, lues ici pour la première fois.
   *
   * Elles étaient collectées, stockées et envoyées au modèle ; l'audit ne lit
   * que `ProfileContext`, qui est la SORTIE du Profileur. Cinq demandes
   * tombaient dans ce trou. `undefined` = elles n'ont pas été lues (l'appelant
   * n'attendait pas la requête), et c'est un fait différent de « elles sont
   * vides » : le premier rend le bloc ABSENT, le second le rend « non déclaré »
   * signal par signal.
   */
  answers?: AuditSignalsInput | null,
  /**
   * #2073.8 / #2073.11 — LA STRATÉGIE CHOISIE, persistée par l'utilisateur
   * (`profiles.chosen_entry_strategy`, distincte du champ CALCULÉ par le
   * profileur). `null`/`undefined` = aucun choix explicite : la conséquence
   * « accounts » retombe alors sur `ideal.entryStrategy`. Doublon assumé de
   * #2068.22-.33 : `entryStrategy` alimentait déjà cette règle, ce paramètre
   * fait juste entrer le champ CHOISI là où le champ CALCULÉ entrait — une
   * correction humaine gagne toujours, et c'est le SEUL endroit qui tranche
   * (GA-26).
   */
  chosenEntryStrategy?: EntryStrategy | null,
  /**
   * #2068.1 — décision Louis 19/09/2026 (2068.11) : MES actions ouvertes,
   * tous comptes confondus (`GET /plan-items/mine`), qui produisent
   * désormais `contextBlocks.thirtyDayPlan` — voir
   * {@link buildThirtyDayPlanFromActions}. `undefined` = pas encore lues
   * (même convention que `answers` ci-dessus) ; `[]` = lues, aucune action
   * ouverte : les deux rendent `null`, la nuance chargement vit dans le hook
   * appelant (`isLoading`), pas ici.
   */
  myActions?: readonly MyPlanAction[] | null,
  /**
   * #2074.12 — les signaux RÉELS des modules voisins (aujourd'hui : le vivier,
   * via {@link commercialTensionSignalsFromTalentStats}, `tension-detectors.ts`
   * — le bandeau `useTalentStats()`/`GET /talents/stats` porte déjà `{ total,
   * availableNow, availabilityUnknownCount }` sur TOUT l'espace, le SEUL des
   * sept signaux externes qu'un module existant exposait déjà). `undefined` =
   * aucun signal relié, même convention que `answers`/`myActions` ci-dessus :
   * chaque règle à signal rend `unknown`, jamais un vivier deviné vide.
   */
  signals?: CommercialTensionExternalSignals,
): CommercialAudit {
  const coaching = context?.coachingInsights
  const cadence = coaching?.cadenceRecommendation
  const kpiTargets = coaching?.kpiTargets
  const ideal = context?.idealAccountProfile
  const messaging = context?.messagingStyle
  const parameters = context?.analysisParameters
  const phrases = context?.bellumPhrases

  const headlines: AuditHeadline[] = [
    {
      key: 'posture',
      origin: 'sellingPosture',
      value: context?.sellingPosture ? { kind: 'posture', posture: context.sellingPosture } : null,
    },
    {
      key: 'archetype',
      origin: 'esnArchetype',
      value: context?.esnArchetype ? { kind: 'archetype', archetype: context.esnArchetype } : null,
    },
    {
      key: 'target',
      origin: 'idealAccountProfile',
      value: ideal
        ? {
            kind: 'target',
            size: ideal.size,
            decisionLevel: ideal.decisionLevel,
            entryStrategy: ideal.entryStrategy,
            sectors: entries(ideal.sectorsPriority) ?? [],
          }
        : null,
    },
    {
      // #2071.5 — le « goulot principal » demandé : c'est le seul champ du
      // profil qui dit ce qui freine, et il est écrit par le profileur.
      key: 'bottleneck',
      origin: 'coachingInsights',
      value: text(coaching?.mainWeakness) ? { kind: 'text', text: text(coaching?.mainWeakness) as string } : null,
    },
    {
      // #2071.6 — la « capacité réelle » demandée n'est pas mesurée : ce qui
      // existe est une CADENCE recommandée. On affiche ce qu'on a, sous son
      // vrai nom, plutôt qu'une capacité qu'on n'a jamais observée.
      key: 'cadence',
      origin: 'cadenceRecommendation',
      value: cadence
        ? {
            kind: 'cadence',
            // ⚠️ Aucun `?? 0` ici : ces trois nombres viennent d'un bloc
            // PRÉSENT, donc un zéro y est un fait mesuré, pas un trou comblé.
            analysesPerWeek: cadence.analysesPerWeek,
            messagesPerDay: cadence.messagesPerDay,
            followUpsPerWeek: cadence.followUpsPerWeek,
          }
        : null,
    },
  ]

  const columns: AuditColumn[] = [
    // #2074.1 — « Arrêter » se lit sur ce que le profil dit d'ÉVITER. Rien
    // n'est deviné : chaque ligne est une phrase écrite dans le profil.
    { key: 'stop', origin: 'messagingStyle', items: messaging ? entries(messaging.avoid) : null },
    // #2074.2 — « Garder » : les points de différenciation retenus.
    { key: 'keep', origin: 'messagingStyle', items: messaging ? entries(messaging.differentiationPoints) : null },
    // #2074.3 — « Renforcer » : le goulot et le conseil qui l'accompagne.
    {
      key: 'reinforce',
      origin: 'coachingInsights',
      items: coaching
        ? [text(coaching.mainWeakness), text(coaching.keyAdvice)].filter((v): v is string => v !== null)
        : null,
    },
  ]

  const angle = text(messaging?.valuePropositionAngle)
  const consequences: AuditConsequence[] = [
    {
      key: 'accounts',
      origin: 'idealAccountProfile',
      rule: ideal
        ? {
            kind: 'accounts',
            size: ideal.size,
            // #2073.11 — la stratégie CHOISIE remplace la stratégie CALCULÉE
            // ici, et ici seulement (voir le docblock du 4e paramètre).
            // #2118.16 — la règle vit dans le contrat (GA-26) : le moteur la lit aussi.
            entryStrategy: effectiveEntryStrategy(chosenEntryStrategy, ideal.entryStrategy) ?? ideal.entryStrategy,
            sectors: entries(ideal.sectorsPriority) ?? [],
          }
        : null,
    },
    {
      key: 'contacts',
      origin: 'idealAccountProfile',
      rule: ideal ? { kind: 'contacts', decisionLevel: ideal.decisionLevel } : null,
    },
    {
      key: 'messages',
      origin: 'messagingStyle',
      rule:
        messaging && angle ? { kind: 'messages', tone: messaging.tone, length: messaging.messageLength, angle } : null,
    },
    {
      key: 'load',
      origin: 'cadenceRecommendation',
      rule: cadence
        ? {
            kind: 'load',
            analysesPerWeek: cadence.analysesPerWeek,
            messagesPerDay: cadence.messagesPerDay,
            followUpsPerWeek: cadence.followUpsPerWeek,
          }
        : null,
    },
    {
      // #2067.1 / #2067.3 — comptes actifs et volume de suivi VISÉS par
      // mois. Jamais `conversionRateTarget` : voir le docblock du type.
      key: 'kpiTargets',
      origin: 'kpiTargets',
      rule: kpiTargets
        ? {
            kind: 'kpiTargets',
            accountsPerMonth: kpiTargets.accountsPerMonth,
            rdvPerMonth: kpiTargets.rdvPerMonth,
            // #2067.2 — la cible partenaires suit l'archétype. `?? null`
            // ramène l'absent et le `null` du contrat à UNE forme ; aucun
            // `|| 0` ici, jamais : une cible non calculée est une absence.
            partnersPerMonth: kpiTargets.partnersPerMonth ?? null,
          }
        : null,
    },
    {
      key: 'routines',
      origin: 'analysisParameters',
      rule: parameters
        ? { kind: 'routines', depth: parameters.analysisDepth, focusAreas: entries(parameters.focusAreas) ?? [] }
        : null,
    },
    {
      // #2075.7 — « Personnaliser le copilote » : la seule chose qu'on sache
      // dire est que ses phrases ont été réécrites pour cet espace. On ne
      // promet rien de plus, et surtout pas quand elles manquent.
      key: 'copilot',
      origin: 'bellumPhrases',
      rule: text(phrases?.welcome) ? { kind: 'copilot', personalized: true } : null,
    },
  ]

  // #2068.14-.33 — les paliers et la configuration EFFECTIVE de Laura.
  // Aucune source ne les produit encore (moteur séparé, lien à l'audit non
  // prouvé) : `null` est le bloc absent, jamais un plan inventé. L'écran les
  // rend quand même, et les NOMME « non mesuré ».
  //
  // #2068.1 — décision Louis 19/09/2026 (2068.11) : `thirtyDayPlan`, LUI, a
  // désormais une source — Actions (`myActions`, voir
  // {@link buildThirtyDayPlanFromActions}) — et n'est donc plus écrit `null`
  // en dur ici.
  //
  // #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — `declaredSignals`
  // est le QUATRIÈME bloc du contrat, et le seul des quatre qui ait une source :
  // les réponses du questionnaire. Il voyage ici, avec les trois autres, pour
  // que « ce qui n'a pas pu être établi » puisse le NOMMER — un bloc que la
  // liste ne voit pas est exactement le défaut réparé le 16/09.
  // #2068.24 / #2068.26 / #2068.27 — décision Louis 21/09/2026 : la
  // configuration produit a désormais une source — LES RÉGLAGES DE CET ESPACE
  // (`audit-product-configuration.ts`, qui dit pour chaque aire quel réglage
  // elle lit et ce qui la rend non évaluable) — et n'est plus écrite `null` en
  // dur ici. Trois aires promises (« Scoring », « Carte d'influence »,
  // « Messages ») n'avaient aucun autre porteur : `ACTION_TARGET_DOMAIN` ne
  // mène à aucune des trois.
  const contextBlocks: AuditContextBlocks = {
    thirtyDayPlan: buildThirtyDayPlanFromActions(myActions),
    milestones: null,
    productConfiguration: buildAuditProductConfiguration(context),
    declaredSignals: answers ? buildAuditDeclaredSignals(answers, ideal?.entryStrategy ?? null) : null,
  }

  // #2067.2 / #2067.4 / #2067.5 / #2067.6 — l'arbitrage de la charge active,
  // sur le budget de fronts DÉJÀ lu ci-dessus (#2050.14) : la dérivation du
  // contrat le reçoit, elle ne le recalcule pas (GA-26). Sans réponses lues,
  // les quatre grandeurs sont « non établies », jamais 0.
  const activeLoad = buildAuditActiveLoad(answers, contextBlocks.declaredSignals?.frontsBudget ?? null)

  // #2457 — tensions, chaîne fine et maturité, calculées ICI (et non plus
  // seulement dans `buildCommercialAuditContext` ci-dessous) : `unestablished`
  // doit savoir si le VERDICT et la PRIORITÉ de la semaine ont pu être
  // TRANCHÉS, et les deux en dépendent. `buildAuditVerdict`/`buildWeeklyPriority`
  // restent les MÊMES fonctions que celles que `CommercialAuditScreen.tsx`
  // appelle — jamais une deuxième dérivation de leur logique (GA-26).
  const chain = buildAuditChain(context)
  const tensions = detectCommercialTensions(context, withFunctionalSpecialization(signals, answers))
  const bottleneckValue = headlines.find(item => item.key === 'bottleneck')?.value ?? null
  const bottleneckText = bottleneckValue?.kind === 'text' ? bottleneckValue.text : null
  const breakpoints = deriveBreakpoints(chain, bottleneckText)
  const maturity = computeCommercialMaturity(context, answers)
  const verdict = buildAuditVerdict({ contradictions: tensions.contradictions, breakpoints })
  const reinforceItems = columnItems(columns, 'reinforce')
  const priority = buildWeeklyPriority({
    contradictions: tensions.contradictions,
    stopKeepReinforce: { stop: null, keep: null, reinforce: reinforceItems },
  })
  const axesEvaluated = auditEvaluableAxes(maturity.axes)

  // ───────────────────────────────────────────────────────────────────────────
  // CE QUI N'A PAS PU ÊTRE ÉTABLI — LU SUR LES BLOCS, JAMAIS ÉNUMÉRÉ À LA MAIN
  // ───────────────────────────────────────────────────────────────────────────
  // Mesuré en PRODUCTION le 16/09/2026 sur `/settings/profile/audit` :
  // l'écran rendait « non mesuré » sur le plan à 4 semaines, les paliers et la
  // configuration produit, puis concluait trois blocs plus bas, sur la MÊME
  // page, « Tout ce que cet écran affiche a pu être établi ». La liste ne
  // dérivait que des entrées du PROFIL ; son titre promet l'ÉCRAN. C'est
  // GA-18 / GA-19 pris à revers : l'absence était nommée en place, puis
  // DÉMENTIE en bas de page.
  //
  // LA FORME QUI EMPÊCHE LA RÉCIDIVE — un bloc ne « s'ajoute » pas à la liste,
  // il DÉCLARE son état ici, et la liste LIT cette table. Trois cliquets, du
  // plus fort au plus faible :
  //  1. la table est un `Record<AuditUnestablishedFixedKey, …>` : ajouter une
  //     clé à l'union sans déclarer son état ne COMPILE pas ;
  //  2. `fixedEntries` est un `filter` sur cette table — il n'existe plus
  //     aucun `push` où l'on puisse oublier une ligne FIXE, ni deux listes à
  //     tenir d'accord (GA-26 : une dérivation vit à un seul endroit). #2457 —
  //     les TROIS blocs DÉRIVÉS (`verdict`/`maturity`/`priority`) n'ont, eux,
  //     aucune source dont on pourrait dire qu'elle « manque » : ils sont un
  //     `push` conditionnel, juste après, sur `verdict === null` /
  //     `priority === null` / `maturity.score === null` — jamais un `if`
  //     séparé qui pourrait oublier l'un des trois, voir GA-345 plus bas ;
  //  3. ce que le compilateur ne peut pas voir — un bloc RENDU « non mesuré »
  //     sans clé du tout — est tenu par GA-345
  //     (`architecture/audit-unestablished-reads-the-screen.test.ts`), qui LIT
  //     le JSX des composants de l'audit.
  const blockStates: Record<AuditUnestablishedFixedKey, { established: boolean; reason: AuditUnestablishedReason }> = {
    sellingPosture: { established: Boolean(context?.sellingPosture), reason: 'profileMissing' },
    esnArchetype: { established: Boolean(context?.esnArchetype), reason: 'profileMissing' },
    idealAccountProfile: { established: Boolean(ideal), reason: 'profileMissing' },
    coachingInsights: { established: Boolean(coaching), reason: 'profileMissing' },
    cadenceRecommendation: { established: Boolean(cadence), reason: 'profileMissing' },
    // ⚠️ #2067 — cette ligne vient de `origin/main` (8da6631c8, « un rythme
    // mensuel visé »), poussée APRÈS le point de fork de cette branche. Elle
    // n'a pas été retirée ici, elle n'y était jamais arrivée ; elle est
    // reprise pour que la fusion de ce lot ne puisse pas la faire disparaître
    // en résolvant le conflit de cette table.
    kpiTargets: { established: Boolean(coaching?.kpiTargets), reason: 'profileMissing' },
    messagingStyle: { established: Boolean(messaging), reason: 'profileMissing' },
    analysisParameters: { established: Boolean(parameters), reason: 'profileMissing' },
    bellumPhrases: { established: text(phrases?.welcome) !== null, reason: 'profileMissing' },
    // Les trois blocs du contrat : leur état est LU sur la valeur rendue, pas
    // redit à côté — un `null` rendu à l'écran est un `null` dans la liste.
    // #2068.1 — `thirtyDayPlan` a maintenant une source (Actions) : sa
    // raison n'est plus « aucune source » mais « aucune action ouverte ».
    thirtyDayPlan: { established: contextBlocks.thirtyDayPlan !== null, reason: 'noActionsYet' },
    milestones: { established: contextBlocks.milestones !== null, reason: 'noSourceYet' },
    // #2068.24 / #2068.26 / #2068.27 — `productConfiguration` a maintenant une
    // source : les réglages de cet espace. `noSourceYet` mentirait (« aucune
    // source ne le produit encore » alors qu'une source existe et a répondu) —
    // `profileMissing` porte SA réparation : compléter son profil.
    productConfiguration: { established: contextBlocks.productConfiguration !== null, reason: 'profileMissing' },
    // ⚠️ `established` ne demande PAS « le bloc est-il arrivé ? » mais « a-t-il
    // dit quelque chose ? ». Un questionnaire lu dont les cinq signaux sont
    // « non déclaré » n'a rien établi — et la raison est `profileMissing`,
    // parce que celle-là se répare bien en répondant aux questions.
    declaredSignals: { established: hasAnyDeclaredSignal(contextBlocks.declaredSignals), reason: 'profileMissing' },
  }

  const fixedEntries: AuditUnestablishedEntry[] = (Object.keys(blockStates) as AuditUnestablishedFixedKey[])
    .filter(key => !blockStates[key].established)
    .map(key => ({ key, reason: blockStates[key].reason }))

  // #2457 — les TROIS conclusions, chacune avec le compte de ce qui a manqué
  // pour trancher. Décision Louis 16/09/2026 : elles entrent ici au même
  // titre qu'un bloc source absent, jamais un « indisponible » nu.
  const derivedEntries: AuditUnestablishedEntry[] = []
  if (verdict === null)
    derivedEntries.push({ key: 'verdict', reason: 'notConcluded', rulesChecked: TENSION_RULE_COUNT })
  if (priority === null) {
    derivedEntries.push({ key: 'priority', reason: 'notConcluded', rulesChecked: TENSION_RULE_COUNT })
  }
  // #2074.10-.15 / #2090.7 — QUATRIÈME conclusion, même forme et même raison
  // que la priorité : les premiers mouvements dérivent des MÊMES ruptures
  // (`auditMovesFrom`, la fonction que `CommercialAuditScreen.tsx` appelle —
  // jamais une seconde dérivation, GA-26). Aucune règle déclenchée = aucun
  // mouvement à proposer, et l'écran doit le dire ICI aussi, sinon il se
  // dément en bas de page (le défaut du 16/09/2026).
  if (auditMovesFrom(tensions.contradictions).length === 0) {
    derivedEntries.push({ key: 'moves', reason: 'notConcluded', rulesChecked: TENSION_RULE_COUNT })
  }
  // #2010.10 — CINQUIÈME conclusion, même forme que les mouvements juste
  // au-dessus : `AuditHypotheses` dérive `auditHypothesesFrom` sur les MÊMES
  // contradictions (`CommercialAuditScreen.tsx`, jamais une seconde source,
  // GA-26). Aucune contradiction porteuse d'explication possible = aucune
  // hypothèse, et « Ce qui n'a pas pu être établi » doit le dire ici aussi —
  // sinon l'écran se dément en bas de page, le défaut réparé par GA-345.
  if (auditHypothesesFrom(tensions.contradictions).length === 0) {
    derivedEntries.push({ key: 'hypotheses', reason: 'notConcluded', rulesChecked: TENSION_RULE_COUNT })
  }
  if (maturity.score === null) {
    derivedEntries.push({
      key: 'maturity',
      reason: 'notConcluded',
      axesEvaluated,
      axesTotal: maturity.axes.length,
      axesMinimum: MINIMUM_SCORE_AXES,
    })
  }

  // #2067.2 / .4 / .5 / .6 — QUATRIÈME forme : chaque grandeur de l'arbitrage
  // qui n'a pas pu être dérivée entre avec la RÉPONSE qui manque. La table est un
  // `Record` sur les quatre grandeurs du contrat : en ajouter une cinquième sans
  // lui donner de clé ici ne compile pas — même cliquet que `blockStates`.
  const activeLoadEntryKeys: Record<keyof AuditActiveLoad, AuditActiveLoadEntryKey> = {
    partners: 'activeLoadPartners',
    slots: 'activeLoadSlots',
    reserve: 'activeLoadReserve',
    deferred: 'activeLoadDeferred',
  }
  const activeLoadEntries: AuditUnestablishedEntry[] = (
    Object.keys(activeLoadEntryKeys) as (keyof AuditActiveLoad)[]
  ).flatMap((name): AuditUnestablishedEntry[] => {
    const quantity = activeLoad[name]
    const key = activeLoadEntryKeys[name]
    return quantity.kind === 'answerMissing'
      ? [{ key, reason: 'profileMissing', missingAnswers: quantity.missingAnswers }]
      : []
  })

  const unestablished: AuditUnestablishedEntry[] = [...fixedEntries, ...activeLoadEntries, ...derivedEntries]

  // #2071.8 / #2071.9 — la version et sa date sont des FAITS : elles viennent
  // des instantanés, jamais d'un « v1 » écrit à la main. Le plus RÉCENT se
  // prend par le numéro le plus haut plutôt qu'en se fiant à l'ordre rendu.
  const latest = (revisions ?? []).reduce<ProfileContextRevisionSummary | null>(
    (best, candidate) => (best === null || candidate.version > best.version ? candidate : best),
    null,
  )

  return {
    headlines,
    columns,
    consequences,
    unestablished,
    contextBlocks,
    activeLoad,
    version: latest?.version ?? null,
    updatedAt: text(latest?.created_at),
  }
}

/**
 * #2457 — extrait de `buildCommercialAuditContext` (où cette logique vivait
 * seule jusqu'ici) : `buildCommercialAudit` en a désormais besoin, lui aussi,
 * pour savoir si le VERDICT a de quoi trancher. Une seule implémentation,
 * appelée des deux côtés (GA-26) — la chaîne fine d'abord, le goulot mesuré
 * en repli, jamais une troisième source inventée.
 */
function deriveBreakpoints(
  chain: readonly AuditChainStage[],
  bottleneckText: string | null,
): CommercialAuditContext['breakpoints'] {
  const chainBreakpoints = chain
    .filter(stage => stage.state === 'rupture')
    .flatMap(stage =>
      stage.ruptures.map(rupture => ({
        label: `Rupture — ${AUDIT_CHAIN_STAGE_LABELS_FR[stage.key]}`,
        detail: rupture.consequenceIfUnaddressed,
        provenance: null,
        confidence: rupture.confidence,
      })),
    )
  if (chainBreakpoints.length > 0) return chainBreakpoints
  return bottleneckText
    ? [{ label: 'Goulot principal', detail: bottleneckText, provenance: null, confidence: null }]
    : null
}

/** Un item d'une colonne stop/keep/reinforce — `null` = bloc source absent
 *  (non mesuré), `[]` = bloc présent qui ne nomme rien (mesuré, vide). */
function columnItems(columns: readonly AuditColumn[], key: AuditColumn['key']): string[] | null {
  return columns.find(item => item.key === key)?.items ?? null
}

// ───────────────────────────────────────────────────────────────────────────
// #2061.2/.3/.7/.8/.15/.18/.20 — RÉOUVERTURE 24/09/2026 : les six blocs
// suivants étaient écrits `null` EN DUR (voir le docblock de tête de
// `buildCommercialAuditContext` plus bas, laissé volontairement comme
// PREUVE de l'état d'avant) et RENDUS PAR AUCUN COMPOSANT — l'audit qui a
// rouvert #2061 ce soir. Chacun compose UNIQUEMENT des champs déjà lus par
// ce fichier (`ideal`, `coaching`, `messaging`, `parameters`, `cadence`,
// `kpiTargets`, `tensions.contradictions`, `talentStats`), jamais une
// nouvelle requête ni une valeur devinée — même discipline que le reste de
// ce fichier : *si cette valeur est absente, « 0 » ou une phrase de
// remplissage seraient-ils VRAIS ?*
// ───────────────────────────────────────────────────────────────────────────

/** #2061.2 — le PÉRIMÈTRE que cet audit couvre : la cible visée
 *  (`idealAccountProfile`) et la profondeur d'analyse configurée
 *  (`analysisParameters`) sont les deux seules sources qui bornent ce qu'un
 *  audit regarde. `null` = ni l'une ni l'autre n'est établie. */
function buildScope(ideal: IdealAccountProfile | undefined, parameters: AnalysisParameters | undefined): string | null {
  if (!ideal && !parameters) return null
  const parts: string[] = []
  if (ideal) {
    parts.push(`Cible : comptes ${ideal.size}, décideurs ${ideal.decisionLevel}, entrée ${ideal.entryStrategy}`)
    const sectors = entries(ideal.sectorsPriority) ?? []
    if (sectors.length > 0) parts.push(`Secteurs prioritaires : ${sectors.join(', ')}`)
  }
  if (parameters) {
    parts.push(`Profondeur d'analyse : ${parameters.analysisDepth}`)
    const focus = entries(parameters.focusAreas) ?? []
    if (focus.length > 0) parts.push(`Axes d'analyse : ${focus.join(', ')}`)
  }
  return parts.join(' — ')
}

/** #2061.3 — les FAITS établis, un par champ de profil RENSEIGNÉ, chacun
 *  citant la valeur telle qu'écrite dans `ProfileContext` — jamais
 *  reformulée, jamais devinée. `provenance: null` : `ProfileContext` ne
 *  porte pas de provenance par champ (voir le docblock de
 *  `commercialAuditProvenanceSchema`) ; `confidence: 'single_source'` : une
 *  seule source (l'instantané de profil courant), jamais recoupée avec une
 *  deuxième. `[]` n'existe pas ici : un profil qui n'a RIEN renseigné rend
 *  `null` (aucun fait), pas une liste vide qui laisserait croire qu'on a
 *  cherché et rien trouvé. */
function buildFacts(
  context: ProfileContext | null | undefined,
  coaching: CoachingInsights | undefined,
  ideal: IdealAccountProfile | undefined,
  messaging: MessagingStyle | undefined,
  parameters: AnalysisParameters | undefined,
  cadence: CadenceRecommendation | undefined,
  kpiTargets: KpiTargets | undefined,
): AuditFact[] | null {
  const facts: AuditFact[] = []
  const add = (statement: string): void => {
    facts.push({ statement, provenance: null, confidence: 'single_source' })
  }
  if (context?.sellingPosture) add(`Positionnement commercial déclaré : ${context.sellingPosture}`)
  if (context?.esnArchetype) add(`Type d'ESN déclaré : ${context.esnArchetype}`)
  if (ideal) {
    add(`Taille de compte visée : ${ideal.size}`)
    add(`Niveau de décision visé : ${ideal.decisionLevel}`)
    add(`Stratégie d'entrée retenue : ${ideal.entryStrategy}`)
    const sectors = entries(ideal.sectorsPriority) ?? []
    if (sectors.length > 0) add(`Secteurs prioritaires nommés : ${sectors.join(', ')}`)
  }
  if (cadence) {
    add(
      `Cadence recommandée : ${cadence.analysesPerWeek} analyses/semaine, ${cadence.messagesPerDay} messages/jour, ${cadence.followUpsPerWeek} relances/semaine`,
    )
  }
  if (kpiTargets) {
    const partners = kpiTargets.partnersPerMonth != null ? `, ${kpiTargets.partnersPerMonth} partenaires/mois` : ''
    add(`Objectif visé : ${kpiTargets.accountsPerMonth} comptes/mois, ${kpiTargets.rdvPerMonth} RDV/mois${partners}`)
  }
  const weakness = text(coaching?.mainWeakness)
  if (weakness) add(`Point de friction identifié : ${weakness}`)
  const angle = text(messaging?.valuePropositionAngle)
  if (angle) add(`Angle de valeur formulé : « ${angle} »`)
  if (parameters) add(`Profondeur d'analyse configurée : ${parameters.analysisDepth}`)
  return facts.length > 0 ? facts : null
}

/** #2061.7 — les ATOUTS établis : le vivier disponible (`talentStats`,
 *  #2074.12 — même paramètre que `tension-detectors.ts`, jamais recalculé)
 *  et un copilote personnalisé pour cet espace (`bellumPhrases.welcome`,
 *  #2075.7 — même fait que la conséquence `copilot`, sous une forme
 *  DIFFÉRENTE : une note nommée, pas un simple drapeau — même précédent que
 *  `coachingInsights.mainWeakness`, rendu à la fois en carte et en colonne).
 *  ⚠️ Ne relit JAMAIS `messaging.avoid`/`differentiationPoints` :
 *  #2072.1-.3 a EXPLICITEMENT refusé de redire les mêmes phrases sous un
 *  autre titre (« les différenciateurs en actifs » — voir le docblock de
 *  tête d'`AuditDecisionColumns.tsx`, GA-26). */
function buildAssets(
  // #2064.5/#2074.12 — le vivier voyage dans `signals.candidatePool`
  // (`CommercialTensionExternalSignals`, `tension-detectors.ts`), jamais un
  // type `TalentStats` à part : même bandeau `useTalentStats()`, même champ.
  talentStats: CommercialTensionExternalSignals['candidatePool'],
  phrases: ProfileContext['bellumPhrases'] | undefined,
): AuditNamedNote[] | null {
  const notes: AuditNamedNote[] = []
  if (talentStats) {
    notes.push({
      label: 'Vivier de consultants',
      detail: `${talentStats.total} au total, dont ${talentStats.availableNow} disponibles maintenant`,
      provenance: null,
      confidence: 'single_source',
    })
  }
  if (text(phrases?.welcome)) {
    notes.push({
      label: 'Copilote personnalisé pour cet espace',
      detail: null,
      provenance: null,
      confidence: 'single_source',
    })
  }
  return notes.length > 0 ? notes : null
}

/** #2061.8 — les CONTRAINTES établies : la cadence recommandée (le plafond
 *  d'activité — la capacité réelle n'est jamais mesurée, voir le docblock
 *  d'`auditContradictionSchema` sur #2061.9) et le niveau de décision visé
 *  (l'accès qu'il faut atteindre). Reprend deux faits déjà rendus en TÊTE
 *  d'écran (`AuditHero`, cartes « Cadence »/« Cible ») sous une forme
 *  DIFFÉRENTE — même précédent que `coachingInsights.mainWeakness` (GA-26 :
 *  même dérivation, deux lectures, jamais deux calculs). ⚠️ Ne relit JAMAIS
 *  `messaging.avoid` — #2072.1-.3 (même refus que ci-dessus). */
function buildConstraints(
  cadence: CadenceRecommendation | undefined,
  ideal: IdealAccountProfile | undefined,
): AuditNamedNote[] | null {
  const notes: AuditNamedNote[] = []
  if (cadence) {
    notes.push({
      label: "Cadence recommandée — plafond d'activité",
      detail: `${cadence.analysesPerWeek} analyses/semaine · ${cadence.messagesPerDay} messages/jour · ${cadence.followUpsPerWeek} relances/semaine — la capacité réelle n'est jamais mesurée, seule cette cadence sert de repère.`,
      provenance: null,
      confidence: 'single_source',
    })
  }
  if (ideal) {
    notes.push({
      label: `Accès visé : niveau ${ideal.decisionLevel}`,
      detail: null,
      provenance: null,
      confidence: 'single_source',
    })
  }
  return notes.length > 0 ? notes : null
}

/** #2061.15 — LA direction recommandée : le geste de la PREMIÈRE tension
 *  détectée (`recommendation`, #2066.18 — déjà écrite pour le VERDICT et la
 *  colonne « Renforcer », voir `audit-verdict.ts`) ; à défaut, le conseil clé
 *  du profileur (`coaching.keyAdvice`, déjà lu par la même colonne). Jamais
 *  une TROISIÈME dérivation inventée à côté (GA-26). */
function buildRecommendedDirection(
  contradictions: readonly AuditContradiction[],
  coaching: CoachingInsights | undefined,
): AuditRecommendedDirection | null {
  const [first] = contradictions
  if (first) {
    return { label: first.recommendation, rationale: first.tension, confidence: first.confidence }
  }
  const advice = text(coaching?.keyAdvice)
  if (advice) {
    return { label: advice, rationale: text(coaching?.mainWeakness), confidence: 'single_source' }
  }
  return null
}

/** #2061.18 — la roadmap CONDITIONNELLE : une ligne par tension détectée,
 *  « SI la question à valider se confirme, ALORS le geste recommandé »
 *  (#2064.16 / #2066.18, déjà écrites par chaque détecteur,
 *  `tension-detectors.ts`). `null` = aucun profil à lire ; `[]` = un profil
 *  existe, aucune tension n'a été détectée — un fait MESURÉ, pas une
 *  absence. */
function buildConditionalRoadmap(
  context: ProfileContext | null | undefined,
  contradictions: readonly AuditContradiction[],
): AuditConditionalRoadmapItem[] | null {
  if (!context) return null
  return contradictions
    .filter((c): c is AuditContradiction & { questionToValidate: string } => c.questionToValidate !== null)
    .map(c => ({ condition: c.questionToValidate, then: c.recommendation }))
}

/** #2061.20 — les QUESTIONS à revisiter : la question à valider de chaque
 *  tension détectée (#2064.16) — même source que la roadmap ci-dessus, une
 *  lecture DIFFÉRENTE (une liste de questions, pas un couple
 *  condition/geste). Même règle `null`/`[]` que `buildConditionalRoadmap`. */
function buildQuestionsToRevisit(
  context: ProfileContext | null | undefined,
  contradictions: readonly AuditContradiction[],
): string[] | null {
  if (!context) return null
  return contradictions.map(c => c.questionToValidate).filter((q): q is string => q !== null)
}

/**
 * #2061 — `CommercialAuditContext`, la forme CONTRAT distincte de
 * `CommercialAudit` (voir `packages/contracts/src/schemas/
 * commercial-audit-context.ts` pour la raison de la distinction).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RÉSOLUTION DU « DOUBLON » MESURÉ PAR LA RECONCILIATION DU 15/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Deux vérificateurs ont mesuré que cette fonction n'avait AUCUN appelant en
 * dehors de son propre fichier de test, pendant que l'écran réel
 * (`useCommercialAudit.ts` → `CommercialAuditScreen.tsx`) appelait
 * `buildCommercialAudit` (sans « Context »). Ce n'était pas deux dérivations
 * DIVERGENTES — celle-ci COMPOSE déjà `buildCommercialAudit` ci-dessus,
 * comme le paragraphe suivant le documentait avant même ce lot — mais un
 * objet juste et testé SANS appelant en production, exactement le défaut le
 * plus cher du dépôt. La résolution : `buildCommercialAudit` reste LA
 * dérivation unique de `ProfileContext` (GA-26) ; `buildCommercialAuditContext`
 * reste sa composition contractuelle, et `useCommercialAudit()` l'appelle
 * désormais réellement (`auditContext`), rendue par `AuditPlanAndMilestones`
 * (`components/AuditPlanAndMilestones.tsx`). Les cinq composants historiques
 * (`AuditHero`, `AuditDecisionColumns`, `AuditStrategyOptions`,
 * `AuditConsequences`, `AuditUnestablished`) continuent de lire `audit` —
 * les migrer vers la forme contrat est un chantier plus large, hors de ce lot
 * borné à un fichier.
 *
 * COMPOSE `buildCommercialAudit` plutôt que de relire `ProfileContext` une
 * deuxième fois — deux dérivations du même contexte finiraient par diverger
 * (GA-26 : une dérivation vit à un seul endroit).
 *
 * ⚠️ RÉOUVERTURE 24/09/2026 (#2061 rouverte par un audit du soir) — Scope,
 * Facts, Assets, Constraints, la Direction recommandée, la roadmap
 * conditionnelle et les Questions à revisiter étaient écrits `null` EN DUR
 * ICI, et RENDUS PAR AUCUN COMPOSANT : l'exemple même du défaut n°1 de ce
 * dépôt (`CLAUDE.md`, « Ce qui est déjà livré »). Les six fonctions
 * `build*` juste au-dessus (`buildScope` à `buildQuestionsToRevisit`) les
 * dérivent maintenant du MÊME `context`, sans requête ni source
 * supplémentaire, et `CommercialAuditScreen.tsx` les rend via
 * `AuditFactsAndScope`, `AuditPositioning` et `AuditDirectionAndRoadmap`
 * (voir leurs docblocks pour ce que chacun refuse de dupliquer — #2072.1-.3).
 * Le Funnel et les Options stratégiques restaient DÉJÀ dérivés avant ce lot
 * (`funnelStages`/`buildStrategicOptions` ci-dessous) ; le plan à 4 semaines,
 * les paliers et la configuration produit restent lus sur
 * `audit.contextBlocks`, comme avant (#2068). La CHAÎNE COMMERCIALE
 * (#2066.1-.10) n'est plus dans cette liste depuis le lot #2066 :
 * `currentCommercialMachine` et `breakpoints` sont dérivés de
 * `buildAuditChain`, ci-dessous.
 *
 * #2064/#2065 — CONTRADICTIONS ET MATURITÉ NE SONT PLUS DANS CETTE LISTE.
 * `tension-detectors.ts` (12 règles nommées) et `maturity-axes.ts` (12 axes
 * nommés) tournent ICI, sur le même `ProfileContext` — aucun appel réseau,
 * aucun état supplémentaire. `contradictions` est désormais TOUJOURS un
 * tableau (vide si rien ne se déclenche) et `maturity` TOUJOURS un objet
 * (ses 12 axes NOMMÉS, mesurés ou non) : le corollaire du lot est que
 * l'absence de fait rend un axe/une règle « inconnu », jamais un silence qui
 * se lirait comme « rien à signaler ». Sept des douze règles de tension et
 * cinq des douze axes de maturité restent structurellement `unknown`
 * aujourd'hui : ils lisent une réalité opérationnelle (vivier, besoins
 * clients, partenaires, appels d'offres, missions, équipe…) que
 * `ProfileContext` — un questionnaire d'onboarding — ne porte pas. Câbler ces
 * signaux réels est un chantier séparé (voir le docblock de tête de
 * `tension-detectors.ts`).
 */
export function buildCommercialAuditContext(
  context: ProfileContext | null | undefined,
  revisions: readonly ProfileContextRevisionSummary[] | undefined,
  /** Voir le troisième paramètre de {@link buildCommercialAudit} — même objet, même règle. */
  answers?: AuditSignalsInput | null,
  /** #2068.1 — voir le 5e paramètre (`myActions`) de {@link buildCommercialAudit} — même objet, même règle. */
  myActions?: readonly MyPlanAction[] | null,
  /** #2074.12 — voir le 6e paramètre (`signals`) de {@link buildCommercialAudit} — même objet, même règle. */
  signals?: CommercialTensionExternalSignals,
): CommercialAuditContext {
  const audit = buildCommercialAudit(context, revisions, answers, undefined, myActions, signals)
  const bottleneck = audit.headlines.find(item => item.key === 'bottleneck')?.value
  // #2064.1-.17 — aucun signal externe encore relié (voir le docblock
  // ci-dessus) : chaque règle à signal rend honnêtement `unknown`.
  //
  // ⚠️ #2457 — `buildCommercialAudit` calcule maintenant, LUI AUSSI, sa propre
  // lecture de `detectCommercialTensions`/`buildAuditChain`/
  // `computeCommercialMaturity` (pour savoir si le verdict et la priorité de
  // la semaine ont pu être TRANCHÉS). Les recalculer ICI n'est pas une
  // deuxième dérivation qui pourrait diverger — ce sont des fonctions PURES
  // du même `context`, donc les deux calculs rendent TOUJOURS la même valeur
  // (même précédent que `buildCommercialAudit` lui-même, appelé deux fois
  // depuis `useCommercialAudit()`). Elles ne sont PAS relues sur `audit` :
  // `maturity.axes[].evidence` embarque `conversionRateTarget` (#2065,
  // `maturity-axes.ts`) — l'exposer sur `CommercialAudit` ferait échouer la
  // garde doctrine « aucune probabilité » de `build-audit.test.ts`, qui lit
  // spécifiquement le JSON de CET objet.
  const tensions = detectCommercialTensions(context, withFunctionalSpecialization(signals, answers))
  const maturity = computeCommercialMaturity(context, answers)
  // #2066.1-.10 — la chaîne fine à neuf étapes (Contact → Capitalisation),
  // calculée UNE fois ici et réutilisée pour `currentCommercialMachine` ET
  // `breakpoints` ci-dessous — jamais une deuxième dérivation (GA-26). C'est
  // la MÊME fonction que `useCommercialAudit()` appelle côté écran.
  const chain = buildAuditChain(context)
  // #2457 — `deriveBreakpoints` (juste après `buildCommercialAudit`) porte
  // désormais la SEULE implémentation de « chaîne d'abord, goulot en repli » :
  // `buildCommercialAudit` en a besoin pour son propre verdict, ce fichier ne
  // l'écrit plus deux fois.
  const bottleneckText = bottleneck?.kind === 'text' ? bottleneck.text : null
  // #2061.2/.3/.7/.8/.15/.18/.20 (réouverture 24/09/2026) — LA MÊME
  // destructuration que `buildCommercialAudit` ci-dessus, sur le MÊME
  // `context` : fonctions pures, même précédent que `tensions`/`maturity`/
  // `chain` juste au-dessus (voir le commentaire #2457).
  const coaching = context?.coachingInsights
  const cadence = coaching?.cadenceRecommendation
  const kpiTargets = coaching?.kpiTargets
  const ideal = context?.idealAccountProfile
  const messaging = context?.messagingStyle
  const parameters = context?.analysisParameters
  const phrases = context?.bellumPhrases
  // #2061.7 — réouverture 24/09/2026 : voir `buildAssets` ci-dessus, même
  // source que `tensions` juste au-dessus (`signals.candidatePool`), jamais
  // un type `TalentStats` à part.
  const talentStats = signals?.candidatePool

  return {
    schemaVersion: COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION,
    // #2061.24 — la même référence que `ProfileContext` : la date de
    // l'instantané dont cet audit est dérivé, jamais un horodatage de calcul
    // (voir le docblock de `commercialAuditContextSchema.generatedAt`).
    generatedAt: audit.updatedAt,
    profileContextVersion: audit.version,

    // #2061.2 — réouverture 24/09/2026 : voir `buildScope` ci-dessus.
    scope: buildScope(ideal, parameters),
    // #2061.3 — réouverture 24/09/2026 : voir `buildFacts` ci-dessus.
    facts: buildFacts(context, coaching, ideal, messaging, parameters, cadence, kpiTargets),
    // #2061.5 — déjà là sous `unestablished` ; la forme NOMMÉE du contrat.
    // #2064 — complétée par ce que les détecteurs de tension n'ont pas pu
    // évaluer : deux sources DIFFÉRENTES qui alimentent le MÊME registre des
    // inconnus, jamais deux listes séparées qui forceraient l'écran à en
    // lire une deuxième.
    // ⚠️ La `reason` du contrat est une PHRASE destinée à un lecteur externe ;
    // celle de `unestablished` est une clé d'i18n. Les traduire ici écrirait le
    // texte de l'écran une deuxième fois (GA-26) : le contrat garde `null`
    // jusqu'à ce qu'une phrase lui soit écrite pour lui. Depuis #2062,
    // `unestablished` porte une ENTRÉE `{ key, reason }` et non plus une
    // origine nue : c'est `entry.key` qui est le libellé, la `reason` de
    // l'entrée restant une clé d'i18n que seul l'écran sait rendre.
    unknowns: [...audit.unestablished.map(entry => ({ label: entry.key, reason: null })), ...tensions.unknowns],
    // #2064.1-.17 — TOUJOURS un tableau : les 12 règles tournent
    // systématiquement, `[]` veut dire « mesuré, rien à signaler ».
    contradictions: tensions.contradictions,
    // #2061.7 — réouverture 24/09/2026 : voir `buildAssets` ci-dessus.
    assets: buildAssets(talentStats, phrases),
    // #2061.8 — réouverture 24/09/2026 : voir `buildConstraints` ci-dessus.
    constraints: buildConstraints(cadence, ideal),
    // #2061.9 — RETIRÉ du contrat le 24/09/2026 : `auditCapacitySchema` ne
    // pouvait STRUCTURELLEMENT jamais valoir `state: 'measured'` (la
    // capacité réelle n'est jamais mesurée, seule une cadence RECOMMANDÉE
    // existe), et rien ne lisait `capacity` — voir le docblock d'
    // `auditContradictionSchema` (`commercial-audit-context.ts`). Ce fait
    // reste dit, honnêtement, par la carte « Cadence » de `AuditHero.tsx`.
    // #2066.1-.9 — les neuf étapes RÉELLEMENT calculées, chacune `rupture` /
    // `measured` / `unknown` selon les règles qui la composent (jamais un
    // quatrième état, jamais un libellé deviné). `provenance: null` : cette
    // chaîne se recalcule à la volée depuis `ProfileContext`, exactement
    // comme le reste de cet objet (voir `generatedAt` plus haut).
    currentCommercialMachine: chain.map(stage => ({ step: stage.key, state: stage.state, provenance: null })),
    // #2049.15 — ÉCRIT `null` EN DUR jusqu'au 16/09/2026, pendant que
    // `funnelBreak` (`packages/contracts/.../answers-mesures.ts`) calculait
    // juste la rupture sans aucun appelant hors tests : du code juste que
    // personne n'appelait, le défaut n°1 de ce dépôt. Il est appelé ici.
    funnel: funnelStages(audit.contextBlocks.declaredSignals),
    // #2066.10 — PROLONGE le goulot unique d'hier : quand la chaîne peut
    // situer une rupture RÉELLE, elle prend le relais du texte libre
    // (`bottleneck`, encore utile tant qu'aucune règle n'a rien mesuré). Les
    // deux ne coexistent jamais dans le même tableau — un seul chemin lit le
    // « où ça casse » (GA-26).
    breakpoints: deriveBreakpoints(chain, bottleneckText),
    // #2065.1-.18 — TOUJOURS un objet : les 12 axes sont TOUJOURS nommés,
    // mesurés ou non (un score n'est jamais nu).
    maturity,
    // #2066.19/.27 — la combinaison DÉJÀ DÉCLARÉE (`go_to_market_channels`),
    // jamais le catalogue générique de `AuditStrategyOptions.tsx` (#2073) :
    // voir le docblock de `buildStrategicOptions` (`commercial-audit-signals.ts`).
    // `null` reste le résultat honnête sous 2 voies déclarées — pas encore un
    // écran qui le lit (reste `retenu` au registre du 15/09), donc ce champ
    // n'apparaît nulle part avant qu'un écran soit câblé dessus.
    strategicOptions: answers ? buildStrategicOptions(answers) : null,
    // #2061.15 — réouverture 24/09/2026 : voir `buildRecommendedDirection` ci-dessus.
    recommendedDirection: buildRecommendedDirection(tensions.contradictions, coaching),
    // #2061.16 — déjà là, `AuditColumn` + `AuditDecisionColumns.tsx`.
    stopKeepReinforce: {
      stop: columnItems(audit.columns, 'stop'),
      keep: columnItems(audit.columns, 'keep'),
      reinforce: columnItems(audit.columns, 'reinforce'),
    },
    // #2068.1-.13 — le plan à 4 semaines : décision Louis 19/09/2026 (2068.11)
    // — LU depuis Actions (`myActions`), via `buildThirtyDayPlanFromActions`
    // (voir son docblock) ; `null` reste le bloc absent (aucune action
    // ouverte) plutôt qu'un plan inventé.
    // ⚠️ Défaut du 16/09/2026 — LU sur `audit.contextBlocks`, plus écrit `null` ici : le
    // `null` que l'écran rend et celui que la liste « n'a pas pu être établi »
    // compte sont désormais LE MÊME. Deux `null` écrits à deux endroits, c'est
    // exactement ce qui faisait dire à l'écran le contraire de lui-même.
    thirtyDayPlan: audit.contextBlocks.thirtyDayPlan,
    // #2061.18 — réouverture 24/09/2026 : voir `buildConditionalRoadmap` ci-dessus.
    conditionalRoadmap: buildConditionalRoadmap(context, tensions.contradictions),
    // #2061.19 — déjà là, `AuditConsequence` + `AuditConsequences.tsx`. Le
    // TEXTE reste dans l'écran (i18n) — dupliquer son rendu ici violerait
    // GA-26 ; seules l'identité et la mesure voyagent.
    productPersonalization: audit.consequences
      .filter(item => item.rule !== null)
      .map(item => ({ key: item.key, description: null })),
    // #2061.20 — réouverture 24/09/2026 : voir `buildQuestionsToRevisit` ci-dessus.
    questionsToRevisit: buildQuestionsToRevisit(context, tensions.contradictions),
    // #2068.14-.21 — les paliers 60j/90j/6mois/12mois : aucune source ne les
    // mesure encore (même lecture unique que `thirtyDayPlan` ci-dessus).
    milestones: audit.contextBlocks.milestones,
    // #2068.22-.33 — la configuration EFFECTIVE de Laura par aire produit, LUE
    // sur `audit.contextBlocks` comme les blocs au-dessus (le `null` que
    // l'écran rend et celui que la liste « n'a pas pu être établi » compte sont
    // LE MÊME). #2068.24/.26/.27 — sa source est
    // `audit-product-configuration.ts` : les réglages de cet espace.
    productConfiguration: audit.contextBlocks.productConfiguration,
    // #2042.15 / #2043.10 / #2050.14 / #2051.16 — LU sur `audit.contextBlocks`,
    // comme les trois blocs au-dessus : le `null` que l'écran rend et celui que
    // la liste « n'a pas pu être établi » compte sont LE MÊME (GA-26).
    declaredSignals: audit.contextBlocks.declaredSignals,
    // #2067.2 / .4 / .5 / .6 — LU sur `audit`, jamais redérivé : la valeur que
    // l'écran rend et celle que le contrat transporte sont la MÊME (GA-26).
    activeLoad: audit.activeLoad,
  }
}
