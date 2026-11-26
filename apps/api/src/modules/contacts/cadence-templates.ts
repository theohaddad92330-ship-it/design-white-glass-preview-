import type {
  CadenceScenario,
  CadenceStepKey,
  CadenceTemplateKey,
  EsnRevenueModel,
  RelationshipState,
} from '@bellum/contracts'
import { esnRevenueModelSchema, relationshipStateSchema } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'

/**
 * Cadence dérivée du scénario relationnel (restitution TF1 p25 ① ; annexe
 * méthodo p6, p10, p12).
 *
 * La cadence de relance n'est plus une constante J+1/J+3/J+6/J+9 : elle DÉCOULE
 * de l'état de relation du compte (froid / connu / LinkedIn accepté / dormant /
 * référé / ancien client / rang 2 / client actif / besoin ouvert). Chaque patron
 * ci-dessous est écrit dans l'annexe — jamais une variante inventée :
 *   - `standard` ............... p12, la séquence historique (compte froid/connu) ;
 *   - `linkedin_3_touches` ..... p10, « stop après 3 messages » (connexion acceptée) ;
 *   - `referral_short` ......... p6, nommer le référent, aiguillage précis (référé) ;
 *   - `reactivation` ........... p6/p12, réactiver par un signal, borne J+7/J+14 (dormant) ;
 *   - `ancien_client_preuve` ... p6, capitaliser sur la preuve, vérifier ce qui a changé ;
 *   - `partenaire_rang2` ....... p6, respecter le partenaire → touches espacées ;
 *   - `client_expansion` ....... p6, foisonnement BU adjacente / renouvellement ;
 *   - `besoin_ouvert` .......... p6, qualification resserrée, next step daté.
 *
 * SÛRETÉ / byte-identité : un compte froid — donc tout dossier sans `salesContext`
 * et toute colonne kanban `inbox` — reste sur le patron `standard`, dont les
 * offsets ET les libellés sont exactement ceux d'avant cette feature. Seule une
 * relation réellement plus chaude change le rythme.
 *
 * Les 4 clés d'étape (`initial`/`relance`/`preuve_sociale`/`close_loop`) restent
 * le vocabulaire stable persisté dans `action_plan_items.cadence_step` : un
 * patron n'invente aucune clé, il en choisit un sous-ensemble et fixe leurs
 * offsets. Aucune migration, aucun changement pour le cron de rappels ni pour la
 * carte « Mes relances » du cockpit.
 */

/** Le patron résolu pour un état de relation : sa clé, la règle métier citée et
 *  ses touches ordonnées par échéance. La forme d'une touche est annotée inline
 *  pour ne pas exporter un type uniquement consommé ici (règle
 *  `lint:exports:types`, CLAUDE.md) : `key` = clé stable ; `offsetDays` = J+n ;
 *  `label` = libellé canonique persisté/lu par le cron ; `isInitial` = message
 *  d'ouverture (déclenche la cadence, pas une relance planifiée). */
export type CadencePattern = {
  template: CadenceTemplateKey
  ruleId: string
  touches: readonly {
    key: CadenceStepKey
    offsetDays: number
    label: string
    isInitial: boolean
  }[]
}

/** Alias local (non exporté) de la forme d'une touche — usage interne seulement. */
type CadenceTouch = CadencePattern['touches'][number]

/* --------------------------- libellés canoniques ---------------------------- */
// Un libellé par clé d'étape — indépendant du patron pour garder les lignes
// persistées et la carte « Mes relances » cohérentes quel que soit le scénario.
const LABEL: Readonly<Record<CadenceStepKey, string>> = {
  initial: 'Message initial',
  relance: 'Relance',
  preuve_sociale: 'Preuve sociale',
  close_loop: 'Close-loop',
}

const touch = (key: CadenceStepKey, offsetDays: number): CadenceTouch => ({
  key,
  offsetDays,
  label: LABEL[key],
  isInitial: key === 'initial',
})

/* ------------------------------- les patrons -------------------------------- */
const PATTERNS: Readonly<Record<CadenceTemplateKey, readonly CadenceTouch[]>> = {
  // #4418.1 — DÉCISION LOUIS 23/10 : la série par défaut est J+3 / J+6 / J+9 (trois relances).
  // La relation connue ne REMPLACE pas la série, elle la DÉCALE : chaque patron garde les trois
  // touches (relance, preuve sociale, close-loop) et ne fait que déplacer leurs dates.
  // Byte-identique à l'ancien CADENCE_TEMPLATE (compte froid/connu).
  standard: [touch('initial', 1), touch('relance', 3), touch('preuve_sociale', 6), touch('close_loop', 9)],
  // Porte tiède (annexe p10) : décalée d'un jour.
  linkedin_3_touches: [touch('initial', 1), touch('relance', 4), touch('preuve_sociale', 7), touch('close_loop', 10)],
  // Référé (annexe p6) : décalée d'un jour, le référent a été nommé.
  referral_short: [touch('initial', 1), touch('relance', 4), touch('preuve_sociale', 7), touch('close_loop', 10)],
  // Dormant (p6/p12) : réactivation lente, décalée de quatre jours.
  reactivation: [touch('initial', 1), touch('relance', 7), touch('preuve_sociale', 10), touch('close_loop', 13)],
  // Ancien client (p6) : décalée d'un jour.
  ancien_client_preuve: [touch('initial', 1), touch('relance', 4), touch('preuve_sociale', 7), touch('close_loop', 10)],
  // Rang 2 (p6) : respecter le partenaire en place → décalée de trois jours.
  partenaire_rang2: [touch('initial', 1), touch('relance', 6), touch('preuve_sociale', 9), touch('close_loop', 12)],
  // Client actif (p6) : rythme d'expansion, décalée de deux jours.
  client_expansion: [touch('initial', 1), touch('relance', 5), touch('preuve_sociale', 8), touch('close_loop', 11)],
  // Besoin ouvert (p6) : priorité haute, avancée d'un jour.
  besoin_ouvert: [touch('initial', 1), touch('relance', 2), touch('preuve_sociale', 5), touch('close_loop', 8)],
  // #2371.4 — Partenaire actif (p6) : on n'insiste pas, décalée de deux jours.
  partenaire_actif: [touch('initial', 1), touch('relance', 5), touch('preuve_sociale', 8), touch('close_loop', 11)],
}

/**
 * État de relation → patron de cadence + règle métier citée.
 *
 * ⚠️ Cette table et `PATTERNS` sont la SOURCE UNIQUE du rythme de relance —
 * seules elles calculent un `due_date`. Trois autres tables lui ressemblent sans
 * répondre à la même question : la carte est écrite une fois, dans le bloc
 * « ⚑ Où vit le rythme d'une relance » de
 * `packages/contracts/src/schemas/outreach-scenarios.ts`.
 *
 * Le service IA en porte une copie (`relationship_playbook.CADENCE_PATTERNS`),
 * parce qu'il est en Python et ne peut pas importer ceci. Cette copie est tenue
 * par `apps/ia/tests/test_cadence_parity.py`, qui LIT ce fichier et compare :
 * toucher un offset ici sans le reporter là-bas fait rougir la CI.
 */
const STATE_TO_TEMPLATE: Readonly<Record<RelationshipState, CadenceTemplateKey>> = {
  froid: 'standard',
  connu: 'standard',
  linkedin: 'linkedin_3_touches',
  dormant: 'reactivation',
  refere: 'referral_short',
  ancien_client: 'ancien_client_preuve',
  rang2: 'partenaire_rang2',
  client_actif: 'client_expansion',
  besoin_ouvert: 'besoin_ouvert',
  partenaire_actif: 'partenaire_actif',
}

/* ------------------- #2645.2 — le modèle de revenu module le rythme --------- */

/**
 * #2645.2 — un revenu PONCTUEL veut une relance plus serrée et une reprise de
 * contact APRÈS livraison ; un revenu RÉCURRENT veut un suivi long.
 *
 * Ce que ce réglage NE fait pas, à dessein : il n'invente ni patron
 * (`CadenceTemplateKey` ne bouge pas), ni clé d'étape (`cadence_step` reste le
 * même vocabulaire persisté), ni touche supplémentaire. Il déplace des
 * ÉCHÉANCES sur le patron que l'état de relation a déjà choisi — donc aucune
 * migration, aucun changement pour le cron de rappels ni pour la carte « Mes
 * relances », et un rythme qui reste lisible dans la même grille.
 *
 * Trois invariants tenus par `applyRevenueModel` :
 *  1. la touche d'OUVERTURE ne bouge jamais — ce n'est pas une relance ;
 *  2. les échéances restent STRICTEMENT croissantes (resserrer ne doit jamais
 *     faire tomber deux touches le même jour) ;
 *  3. `mixte` et `inconnu` ne changent RIEN, à l'octet près — on ne resserre
 *     pas la relance de quelqu'un qui n'a rien déclaré (GA-18/GA-19 : une
 *     valeur non mesurée ne se comporte pas comme une valeur mesurée).
 */
const TIGHTEN_FACTOR = 0.6 // revenu ponctuel : la fenêtre d'achat est courte
const STRETCH_FACTOR = 1.5 // revenu récurrent : le suivi se joue sur la durée

/** Jours ajoutés à la DERNIÈRE touche d'un revenu ponctuel : la mission a été
 *  livrée entre-temps, et c'est là que la reprise de contact a du sens (un
 *  nouveau besoin naît après une livraison, pas pendant). Quatre semaines. */
const POST_DELIVERY_DAYS = 28

function applyRevenueModel(touches: readonly CadenceTouch[], revenueModel: EsnRevenueModel): readonly CadenceTouch[] {
  if (revenueModel !== 'ponctuel' && revenueModel !== 'recurrent') return touches
  const factor = revenueModel === 'ponctuel' ? TIGHTEN_FACTOR : STRETCH_FACTOR
  const lastIndex = touches.length - 1

  let previous = 0
  return touches.map((entry, index) => {
    if (entry.isInitial) {
      previous = entry.offsetDays
      return entry
    }
    let days = Math.max(Math.ceil(entry.offsetDays * factor), previous + 1)
    // La dernière touche d'un revenu ponctuel N'EST PLUS un close-loop serré :
    // c'est la reprise après livraison. Elle part donc au-delà de la mission.
    if (revenueModel === 'ponctuel' && index === lastIndex) days += POST_DELIVERY_DAYS
    previous = days
    return { ...entry, offsetDays: days }
  })
}

/**
 * Le modèle de revenu de l'ESN, lu sur le dossier du compte — le MÊME chemin
 * que l'état de relation (`raw_analysis.salesContext`), jamais une seconde
 * source. Illisible, absent ou hors taxonomie ⇒ `inconnu`, et la cadence est
 * alors exactement celle d'avant ce lot.
 */
export function resolveRevenueModel(account: Pick<AccountEntity, 'raw_analysis'>): EsnRevenueModel {
  const raw = account.raw_analysis as Record<string, unknown> | undefined
  const sc = raw?.['salesContext']
  if (!sc || typeof sc !== 'object') return 'inconnu'
  const esnProfile = (sc as Record<string, unknown>)['esnProfile']
  if (!esnProfile || typeof esnProfile !== 'object') return 'inconnu'
  const businessModel = (esnProfile as Record<string, unknown>)['businessModel']
  if (!businessModel || typeof businessModel !== 'object') return 'inconnu'
  const parsed = esnRevenueModelSchema.safeParse((businessModel as Record<string, unknown>)['revenueModel'])
  return parsed.success ? parsed.data : 'inconnu'
}

/** Le patron (template + règle + touches) pour un état de relation, modulé par
 *  le modèle de revenu de l'ESN (#2645.2). Sans modèle déclaré, rendu
 *  byte-identique à ce qu'il était avant ce lot. */
export function cadencePatternForState(
  state: RelationshipState,
  revenueModel: EsnRevenueModel = 'inconnu',
): CadencePattern {
  const template = STATE_TO_TEMPLATE[state]
  return {
    template,
    ruleId: `methodo/cadence-${state}`,
    touches: applyRevenueModel(PATTERNS[template], revenueModel),
  }
}

/* ----------------------- résolution de l'état de relation ------------------- */
// Miroir de `_KANBAN_TO_STATE` côté IA (`app/services/sales_context.py`) — la
// même traduction colonne kanban → état de relation, pour que la cadence lise la
// relation exactement comme le reste du pipeline.
const KANBAN_TO_STATE: Readonly<Record<string, RelationshipState>> = {
  customer: 'client_actif',
  opportunity: 'besoin_ouvert',
  watching: 'connu',
  archived: 'dormant',
  inbox: 'froid',
}

type ResolvedRelationship = { state: RelationshipState; evidence: string[] }

/** Lit `raw_analysis.salesContext.relationship` d'un compte : `{state, evidence}`
 *  quand l'état est dans la taxonomie, sinon `null`. */
function readSalesContextRelationship(account: Pick<AccountEntity, 'raw_analysis'>): ResolvedRelationship | null {
  const raw = account.raw_analysis as Record<string, unknown> | undefined
  const sc = raw?.['salesContext']
  if (!sc || typeof sc !== 'object') return null
  const rel = (sc as Record<string, unknown>)['relationship']
  if (!rel || typeof rel !== 'object') return null
  const parsed = relationshipStateSchema.safeParse((rel as Record<string, unknown>)['state'])
  if (!parsed.success) return null
  const rawEvidence = (rel as Record<string, unknown>)['evidence']
  const evidence = Array.isArray(rawEvidence) ? rawEvidence.filter((e): e is string => typeof e === 'string') : []
  return { state: parsed.data, evidence }
}

/**
 * L'état de relation d'un compte + la preuve qui le fonde. Priorité (comme le
 * reste du pipeline) :
 *   1) le `salesContext` du dossier (dérivé par l'IA, intègre déjà le kanban) ;
 *   2) sinon, la colonne kanban `commercial_status` du compte ;
 *   3) sinon, `froid` sans preuve inventée.
 */
export function resolveRelationshipEvidence(
  account: Pick<AccountEntity, 'raw_analysis' | 'commercial_status'>,
): ResolvedRelationship {
  const fromContext = readSalesContextRelationship(account)
  if (fromContext) return fromContext

  const status = (account.commercial_status ?? '').trim()
  const mapped = KANBAN_TO_STATE[status]
  if (mapped && mapped !== 'froid') return { state: mapped, evidence: [`kanban: ${status}`] }
  return { state: 'froid', evidence: [] }
}

/** Assemble le scénario de cadence exposé au client : l'état de relation, le
 *  patron qui en découle et la citation règle + preuve (DoD p31). */
export function resolveCadenceScenario(
  account: Pick<AccountEntity, 'raw_analysis' | 'commercial_status'>,
): CadenceScenario {
  const { state, evidence } = resolveRelationshipEvidence(account)
  const pattern = cadencePatternForState(state)
  return {
    state,
    template: pattern.template,
    citation: { rule: pattern.ruleId, evidence },
  }
}
