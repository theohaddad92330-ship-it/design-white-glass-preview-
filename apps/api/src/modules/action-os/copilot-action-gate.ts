import {
  COPILOT_ACTION_LEVEL_ORDER,
  DEFAULT_APPROVAL_SETTINGS,
  GRADUATED_MODE_LEVEL,
  intentReversibility,
  intentSite,
  writesIntoClientTool,
  missingAutomationPrerequisites,
  type ActionIntentType,
  type ActionRisk,
  type ApprovalSettings,
  type AutomationPrerequisite,
  type AutomationReadiness,
  type CopilotActionLevel,
  type GraduatedActionMode,
  type SensitiveActionFamily,
} from '@bellum/contracts'
import { demandsAHuman, levelForStep } from './approval-policy'

/**
 * #2449 — LA PORTE DES QUATRE NIVEAUX D'ACTION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PORTE, ET PAS UNE ÉTIQUETTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le niveau d'action n'est pas une étiquette d'affichage : c'est ce qui
 * autorise ou refuse une écriture. » Un niveau qu'on affiche sans que rien ne le
 * lise est le défaut qui revient dans tout ce dépôt — du code juste, calculé,
 * testé, que personne n'appelle. D'où l'appelant, nommé et unique :
 * `ActionRouterService.dispatchIdempotent` (`action-router.service.ts`), la
 * seule porte par laquelle passent la route `actions/dispatch`, les cartes de
 * Laura, les workflows et leurs approbations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE REFAIT PAS (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne recalcule RIEN de ce que le dépôt sait déjà :
 *
 *   « ce geste exige-t-il un humain ? »  → `levelForStep` + `demandsAHuman`
 *                                          (`approval-policy.ts`), inchangés.
 *   « où l'effet atterrit-il ? »         → `intentSite` (`action-os.ts`).
 *   « peut-on le défaire ? »             → `intentReversibility` (idem).
 *   « qui est habilité ? »               → la matrice de permissions.
 *
 * Ce qu'elle AJOUTE est la seule chose qui manquait : composer ces réponses avec
 * le MANDAT que l'utilisateur a donné pour ce travail. Le barème dit ce que le
 * geste réclame ; le niveau dit jusqu'où le copilote a le droit d'aller. Deux
 * questions différentes, et c'est pourquoi la seconde ne peut pas se lire dans
 * l'échelle N0-N5 (qui, elle, répond à la première).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CHEMIN QUAND PERSONNE NE DÉCLARE DE NIVEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * Le niveau est OPTIONNEL chez l'appelant, et son absence laisse le chemin
 * byte-identique à ce qu'il était : la porte n'est pas consultée. C'est le motif
 * déjà retenu pour `origin` (`action-router.service.ts` : « Absent = `user` —
 * le comportement exact que tout appelant existant avait, donc aucun appelant ne
 * change de sens par omission »). Un mandat qu'on n'a pas donné ne se devine
 * pas, et surtout il ne se devine pas en RELEVANT ce qui était permis.
 */

/** Ce que la porte a besoin de savoir d'un geste, et rien de plus. */
export type ActionGesture = {
  intentType: ActionIntentType
  /**
   * Le risque DÉCLARÉ par le pas — absent quand personne ne l'a déclaré (un
   * intent dispatché depuis une carte n'en porte pas). ⚠️ Absent n'est PAS
   * `low` : la réversibilité RÉELLE se lit sur le TYPE (`intentReversibility`),
   * et c'est elle qui tient la porte quand la déclaration manque.
   */
  risk?: ActionRisk
  /**
   * Coût annoncé en crédits — absent quand personne ne l'a annoncé. ⚠️ Absent
   * n'est PAS zéro : on ne conclut pas « gratuit » d'un silence. Les gestes qui
   * coûtent réellement sont ceux qui appellent un fournisseur, donc de site
   * `connected_system`, et la porte les retient déjà par là.
   */
  estimatedCredits?: number
  /** Cibles réellement touchées. Trois pas sur un contact restent unitaires. */
  targetCount: number
  sensitiveFamily?: SensitiveActionFamily
}

/** Ce qui oblige à demander avant d'agir, au niveau « exécuter ». */
type GoReason =
  /** L'effet atterrit hors de BellumAI : CRM, agenda, boîte, fournisseur. */
  | 'leaves_bellum'
  /** Le geste coûte des crédits. */
  | 'spends'
  /** Le barème d'approbation l'exige déjà (famille sensible, seuil, plancher). */
  | 'sensitive'
  /** Rien ne le défait ni ne le compense (#2400.8). */
  | 'irreversible'
  /** Plus d'une cible : un lot n'est jamais un geste unitaire. */
  | 'in_bulk'

/** Pourquoi le NIVEAU lui-même ferme la porte — jamais un verdict nu. */
export type ActionLevelRefusal =
  /** « Répondre seulement » : aucun objet, aucune écriture, aucun envoi. */
  | 'level_writes_nothing'
  /** « Préparer » : l'effet atterrirait hors de BellumAI. */
  | 'level_prepares_only'
  /** « Préparer » : une préparation ne dépense pas. */
  | 'level_prepares_free'
  /** « Préparer » : une préparation n'engage pas l'espace. */
  | 'level_prepares_unengaged'
  /** Aucun niveau n'adresse quelque chose à une personne — doctrine, pas réglage. */
  | 'never_reaches_a_person'
  /** « Automatiser » : au moins une des six conditions manque. */
  | 'automation_not_ready'

type ActionLevelVerdict =
  | { verdict: 'allowed' }
  /** #2449.16 — ce que « préparer » a créé porte le statut « préparé dans BellumAI ». */
  | { verdict: 'allowed'; preparedInBellum: true }
  | { verdict: 'needs_go'; because: GoReason[] }
  | { verdict: 'refused'; because: ActionLevelRefusal; missing?: AutomationPrerequisite[] }

/** L'ordre dans lequel les raisons se lisent — le plus structurel d'abord. */
const GO_REASON_ORDER: readonly GoReason[] = ['leaves_bellum', 'irreversible', 'spends', 'sensitive', 'in_bulk']

/**
 * Ce qui, dans ce geste, réclame qu'un humain dise oui.
 *
 * `sensitive` délègue au barème (`levelForStep` + `demandsAHuman`) : on ne
 * recopie ni la liste des familles sensibles, ni le plancher des pas
 * irréversibles, ni l'effet du réglage d'espace. Les quatre autres raisons sont
 * les axes que le barème NE PEUT PAS voir — il raisonne sur « qui doit dire
 * oui », pas sur « où ça atterrit », « ce qu'on peut défaire » ni « combien de
 * cibles » (ce dernier ne vit que dans `decideApproval`, à l'échelle du run).
 */
function goReasonsFor(gesture: ActionGesture): GoReason[] {
  const reasons = new Set<GoReason>()
  // #2449.18 / #2449.20 — une écriture CRM et un enrichissement SORTENT de
  // BellumAI ; ni l'un ni l'autre ne sollicite quelqu'un, et c'est précisément
  // ce que `reachesOutsideProduct` ne sait pas dire.
  if (intentSite(gesture.intentType) !== 'bellum') reasons.add('leaves_bellum')
  // #2400.8 — l'irréversible garde sa porte même quand tout le reste passerait.
  if (intentReversibility(gesture.intentType) === 'irreversible' || gesture.risk === 'irreversible') {
    reasons.add('irreversible')
  }
  // #2449.23 — une dépense demande, même sur un geste qui ne sort pas.
  if ((gesture.estimatedCredits ?? 0) > 0) reasons.add('spends')
  // #2449.22 — export sensible, engagement client, envoi en masse : le barème
  // les connaît déjà, et c'est lui qui répond.
  // #4016 L6 — le barème pose désormais un plancher sur l'écriture CRM ; ce
  // plancher-là est DÉJÀ nommé `leaves_bellum` juste au-dessus. Le redire en
  // `sensitive` ferait lire « geste sensible » sur une simple note CRM.
  const onlyTheClientToolFloor =
    writesIntoClientTool(gesture.intentType) &&
    !gesture.sensitiveFamily &&
    (gesture.estimatedCredits ?? 0) === 0 &&
    gesture.risk !== 'irreversible'
  if (!onlyTheClientToolFloor && demandsAHuman(levelForStep(stepRequirementOf(gesture), GESTURE_ALONE))) {
    reasons.add('sensitive')
  }
  // #2449.24 — dès la DEUXIÈME cible. Le seuil de `decideApproval` dit quand il
  // faut un responsable ; ici, on dit seulement qu'un lot n'est pas unitaire.
  if (gesture.targetCount > 1) reasons.add('in_bulk')
  return GO_REASON_ORDER.filter(reason => reasons.has(reason))
}

/**
 * Le barème interrogé sur le GESTE SEUL, la posture de l'espace mise de côté.
 *
 * ⚠️ Sans ça, `levelForStep` rend la posture de l'espace pour tout geste
 * ORDINAIRE (`return settings.defaultLevel`), et le défaut produit est
 * `n2_user_approval` : la porte verrait alors « il faut un humain » sur un
 * simple pense-bête, et les quatre niveaux ne distingueraient plus rien. En
 * posant le plancher à `n0_advice`, on ne lit du barème que ce qu'il RELÈVE —
 * l'irréversible, la sortie, la famille sensible, la dépense — c'est-à-dire
 * exactement ce que le geste réclame par lui-même.
 *
 * La posture de l'espace n'est pas perdue pour autant : elle continue d'être
 * appliquée par `decideApproval`, à l'échelle du run, exactement comme avant.
 * Ce sont deux axes, et les mélanger ici en écraserait un.
 */
const GESTURE_ALONE: ApprovalSettings = { ...DEFAULT_APPROVAL_SETTINGS, defaultLevel: 'n0_advice' }

/** Le geste, vu par le barème d'approbation — aucun champ inventé. */
function stepRequirementOf(gesture: ActionGesture) {
  return {
    intentType: gesture.intentType,
    // Non déclaré → on interroge le barème sur le risque le plus BAS : il ne
    // doit jamais RELEVER le verdict sur une valeur qu'on aurait devinée.
    risk: gesture.risk ?? ('low' as const),
    estimatedCredits: gesture.estimatedCredits ?? 0,
    ...(gesture.sensitiveFamily ? { sensitiveFamily: gesture.sensitiveFamily } : {}),
  }
}

/**
 * La porte : ce niveau autorise-t-il ce geste, et sinon pourquoi.
 *
 * PURE — elle ne lit ni base ni requête et n'écrit rien. C'est ce qui rend la
 * simulation de #2400.5 possible sans un second chemin de code : simuler, c'est
 * appeler cette fonction sur les gestes réels.
 */
export function authorizeAtActionLevel(input: {
  level: CopilotActionLevel
  gesture: ActionGesture
  /** Un humain a-t-il fait le geste ? (`origin === 'user'` d'un dispatch.) */
  backedByUserGesture: boolean
  /** L'état MESURÉ des six conditions. Absent = non mesuré, donc non. */
  readiness?: AutomationReadiness
}): ActionLevelVerdict {
  const site = intentSite(input.gesture.intentType)

  switch (input.level) {
    // #2449.3-.7 — il ne touche à rien. Aucun des intents du catalogue n'est une
    // lecture : tous laissent une trace quelque part, donc tous sont refusés.
    // Et un clic ne RACHÈTE pas le niveau — un mandat n'est pas une préférence.
    case 'respond_only':
      return { verdict: 'refused', because: 'level_writes_nothing' }

    // #2449.8-.15 — il crée à l'INTÉRIEUR de BellumAI, jamais dehors.
    case 'prepare': {
      if (site !== 'bellum') return { verdict: 'refused', because: 'level_prepares_only' }
      if ((input.gesture.estimatedCredits ?? 0) > 0) return { verdict: 'refused', because: 'level_prepares_free' }
      if (input.gesture.sensitiveFamily) return { verdict: 'refused', because: 'level_prepares_unengaged' }
      // #2449.16 — « préparé dans BellumAI » : ni créé ailleurs, ni envoyé.
      return { verdict: 'allowed', preparedInBellum: true }
    }

    // #2449.18-.24 — il demande AVANT chaque geste qui sort ou qui coûte.
    case 'execute': {
      const because = goReasonsFor(input.gesture)
      if (because.length === 0) return { verdict: 'allowed' }
      // Doctrine : « auto-approuvé sur geste utilisateur, sinon prévisualisation
      // figée ». Le clic EST la décision ; sans clic, rien ne part tout seul.
      return input.backedByUserGesture ? { verdict: 'allowed' } : { verdict: 'needs_go', because }
    }

    // #2449.26-.31 — six conditions, toutes nécessaires.
    case 'automate': {
      // Doctrine, au-dessus des six : « le copilote n'envoie jamais d'e-mail :
      // il prépare, le commercial envoie ». Aucun réglage ne lève cette ligne,
      // et les six réunies ne la lèvent pas davantage.
      if (site === 'person') return { verdict: 'refused', because: 'never_reaches_a_person' }
      const missing = missingAutomationPrerequisites(input.readiness ?? NOTHING_MEASURED)
      if (missing.length > 0) return { verdict: 'refused', because: 'automation_not_ready', missing }
      // #2400.8 — ce qui ne se défait pas ne part pas seul, fût-on prêt.
      if (intentReversibility(input.gesture.intentType) === 'irreversible' || input.gesture.risk === 'irreversible') {
        return { verdict: 'needs_go', because: ['irreversible'] }
      }
      return { verdict: 'allowed' }
    }
  }
}

/**
 * #2400.3 — LA COMPOSITION DES CINQ MODES ET DES QUATRE NIVEAUX.
 *
 * `authorizeAtActionLevel` ne change pas : le niveau (`CopilotActionLevel`,
 * #2449) reste l'unique clé qui autorise ou refuse une écriture. Ce que cette
 * fonction ajoute est la seule chose qui manquait : un appelant qui ne connaît
 * que l'un des CINQ modes du rapport (#2400.3 — observe / suggest / prepare /
 * execute-after-approval / auto-execute) peut désormais demander le niveau
 * qu'il implique, via {@link GRADUATED_MODE_LEVEL} — jamais l'inverse, et
 * jamais un sixième mode (le `Record` exhaustif de `copilot-action-level.ts`
 * ne compile pas sans les cinq).
 *
 * ⚠️ Aucun comportement actuel ÉLARGI : si les deux sont déclarés, LE PLUS
 * PRUDENT gagne — composer un niveau déjà déclaré avec un mode ne doit jamais
 * ouvrir plus que ce que ce niveau autorisait seul. Ni l'un ni l'autre :
 * `undefined`, byte-identique à avant (la porte se tait, comme aujourd'hui).
 */
export function resolveActionLevel(input: {
  level?: CopilotActionLevel
  mode?: GraduatedActionMode
}): CopilotActionLevel | undefined {
  const fromMode = input.mode ? GRADUATED_MODE_LEVEL[input.mode] : undefined
  if (!input.level) return fromMode
  if (!fromMode) return input.level
  const moreCautious = (a: CopilotActionLevel, b: CopilotActionLevel) =>
    COPILOT_ACTION_LEVEL_ORDER.indexOf(a) <= COPILOT_ACTION_LEVEL_ORDER.indexOf(b) ? a : b
  return moreCautious(input.level, fromMode)
}

/** « On ne sait pas » n'est pas « c'est bon » : sans mesure, les six manquent. */
const NOTHING_MEASURED: AutomationReadiness = {
  capability_exists: false,
  workspace_policy_allows: false,
  role_allowed: false,
  simulation_validated: false,
  cap_defined: false,
  kill_switch_available: false,
}

// ── #2400.5 / #2449.29 — la simulation ───────────────────────────────────────

type ActionLevelSimulation = {
  level: CopilotActionLevel
  gestures: Array<ActionLevelVerdict & { intentType: ActionIntentType }>
  /** Combien ne partiraient pas seuls. */
  blocked: number
}

/**
 * Le rapport rendu par `ActionRouterService.simulateBulk` : la simulation, plus
 * la seule chose que l'appelant n'a pas à recalculer — verdict global.
 */
export type ActionLevelSimulationReport = ActionLevelSimulation & { validated: boolean }

/**
 * #2400.5 — le dry run : ce que CE niveau ferait des gestes RÉELS d'un travail,
 * sans en exécuter un seul.
 *
 * Il n'existe pas de « second chemin de simulation » à maintenir en phase avec
 * le vrai : la porte est pure, donc simuler c'est l'appeler. Un chemin de
 * simulation distinct finirait par répondre autre chose que la production —
 * c'est exactement le genre d'écart qu'un rapport de simulation est censé
 * fermer.
 */
export function simulateAtActionLevel(input: {
  level: CopilotActionLevel
  gestures: readonly ActionGesture[]
  backedByUserGesture: boolean
  readiness?: AutomationReadiness
}): ActionLevelSimulation {
  const gestures = input.gestures.map(gesture => ({
    intentType: gesture.intentType,
    ...authorizeAtActionLevel({
      level: input.level,
      gesture,
      backedByUserGesture: input.backedByUserGesture,
      ...(input.readiness ? { readiness: input.readiness } : {}),
    }),
  }))
  return {
    level: input.level,
    gestures,
    blocked: gestures.filter(g => g.verdict !== 'allowed').length,
  }
}

/**
 * #2449.29 — cette simulation VALIDE-t-elle l'activation ?
 *
 * ⚠️ Une simulation VIDE ne valide rien. Zéro geste bloqué sur zéro geste joué
 * est le « non mesuré affiché comme un succès » : c'est la forme que prend ici
 * la règle « une valeur absente ne s'affiche jamais 0 ».
 */
export function simulationValidates(simulation: ActionLevelSimulation): boolean {
  return simulation.gestures.length > 0 && simulation.blocked === 0
}
