import { z } from 'zod'
import { accountAccessLevelSchema, type AccountAccessLevel } from './partner.js'

/**
 * LA PASSE RAPIDE SUR VINGT COMPTES — #2630.1, décision Louis 20/09/2026 (QCM).
 *
 * « Une passe rapide sur vingt comptes rend, par compte, un verdict court et sa
 * raison courte. » Ce fichier est ce verdict, et RIEN d'autre : il ne collecte
 * pas, il ne classe pas, il ne remplace pas l'analyse. Il relit ce qu'une
 * recherche Découvrir a DÉJÀ ramené et en tire un mot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA REMPLACE
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien — et c'est le problème qu'il ferme. Avant lui, la seule façon de trier
 * vingt-cinq résultats était de les ouvrir un par un et de cliquer « suivre »
 * ou « écarter » (`useDiscoverShortlist`). Le commercial décidait donc vingt
 * fois de suite, sans jamais que l'écran lui dise sur QUOI il décidait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI CE N'EST PAS UN DOUBLON DE `need-verdict.ts` (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * `need-verdict.ts` tranche un BESOIN — « faut-il répondre à cet appel ? » — sur
 * six axes dont la matière (TJM cible, profils au seuil, consentement) n'existe
 * QUE sur un besoin ouvert. Ici l'objet est un COMPTE qui n'a même pas de fiche :
 * un candidat de Découvrir, dont on ne sait que ce qu'un registre public et une
 * recherche de signaux ont donné. Aucun des six axes du besoin n'est calculable,
 * et aucun des quatre axes d'ici ne vaut pour un besoin.
 *
 * Ce qui EST partagé, et qui ne se recopie pas, c'est la DISCIPLINE : un axe non
 * évaluable sort du dénominateur, ce qui manque est nommé, un bloquant connu
 * l'emporte sur une ignorance, et aucun nombre agrégé ne sort d'ici. Ce fichier
 * suit cette discipline à la lettre plutôt que d'en inventer une seconde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN POURCENTAGE, AUCUNE PROBABILITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le refus a été prononcé six fois (`c26_probabilite`, garde GA-64). Il vaut
 * doublement pour une passe rapide : vingt lignes côte à côte, chacune avec un
 * nombre, deviennent un classement par chance de signer sans que personne ne
 * l'ait décidé. Ce qui sort d'ici est donc entièrement QUALITATIF — trois mots,
 * des états nommés, et des COMPTES d'axes, qui sont vrais tout seuls.
 *
 * {@link discoverQuickPassEntrySchema} le REFUSE en plus de l'écrire : une
 * raison qui chiffre une chance ne passe pas le contrat.
 */

/* ------------------------------------------------------------------ */
/* Les quatre axes — tous lisibles sur un candidat Découvrir           */
/* ------------------------------------------------------------------ */

/**
 * Les quatre axes de la passe rapide, dans l'ordre de lecture.
 *
 * ⚠️ Liste ORDONNÉE et APPEND-ONLY (GA-08) : une valeur n'en disparaît jamais et
 * ne s'insère jamais au milieu — elle s'ajoute à la fin.
 *
 * Chacun se calcule sur une donnée que la recherche a DÉJÀ ramenée. Aucun axe
 * n'appelle quoi que ce soit : une passe rapide qui déclencherait vingt
 * collectes ne serait pas rapide, et une passe qui devinerait serait interdite.
 */
export const DISCOVER_QUICK_PASS_AXES = [
  /** Y a-t-il de quoi vendre ? — le score de correspondance et son dénominateur RÉEL. */
  'interest',
  /** Peut-on entrer ? — l'état d'accès dérivé (#2646.1), jamais une chance. */
  'access',
  /** Se passe-t-il quelque chose ? — un signal daté, si les sources ont été interrogées. */
  'signal',
  /** À qui parler ? — une personne qu'une source a NOMMÉE, jamais une fonction devinée. */
  'named_contact',
] as const
export const discoverQuickPassAxisSchema = z.enum(DISCOVER_QUICK_PASS_AXES)
export type DiscoverQuickPassAxis = (typeof DISCOVER_QUICK_PASS_AXES)[number]

/**
 * Le POIDS d'un axe — un mot, pas un coefficient (même choix que `need-verdict`).
 *
 * `decisive` : l'axe INTÉRÊT, et lui seul. Sans lui, « vas-y » serait dit d'un
 * compte dont personne n'a regardé s'il y avait quelque chose à vendre. Et un
 * intérêt mesuré à zéro est le seul fait qui autorise un NON.
 *
 * `advisory` : accès, signal, contact nommé. Ceux-là se DISENT, ils n'écartent
 * jamais. Un compte servi par un concurrent en rang 1, sans signal daté et sans
 * personne nommée reste un compte qu'un bon commercial travaille — le passer en
 * bloquant ferait écarter exactement les affaires qui se gagnent.
 */
export const DISCOVER_QUICK_PASS_AXIS_WEIGHTS: Readonly<Record<DiscoverQuickPassAxis, 'decisive' | 'advisory'>> = {
  interest: 'decisive',
  access: 'advisory',
  signal: 'advisory',
  named_contact: 'advisory',
}

/** Les axes qui peuvent dire NON, dans l'ordre de {@link DISCOVER_QUICK_PASS_AXES}. */
export const DISCOVER_QUICK_PASS_DECISIVE_AXES: readonly DiscoverQuickPassAxis[] = DISCOVER_QUICK_PASS_AXES.filter(
  axis => DISCOVER_QUICK_PASS_AXIS_WEIGHTS[axis] === 'decisive',
)

/**
 * L'état d'un axe ÉVALUÉ.
 *
 * ⚠️ « non évaluable » n'en fait PAS partie, et c'est tout le point : il s'écrit
 * `state: null`, ce qui le SORT du décompte au lieu de lui donner une couleur
 * (GA-18 / GA-19). Le ranger ici en quatrième valeur le ferait peser.
 */
export const DISCOVER_QUICK_PASS_AXIS_STATES = ['positive', 'attention', 'blocking'] as const
export const discoverQuickPassAxisStateSchema = z.enum(DISCOVER_QUICK_PASS_AXIS_STATES)
export type DiscoverQuickPassAxisState = (typeof DISCOVER_QUICK_PASS_AXIS_STATES)[number]

/**
 * Les trois verdicts, dans les mots de Louis : GO / PRUDENCE / NON.
 *
 * ⚠️ Il n'y a pas de quatrième mot, et il y a pourtant une quatrième issue :
 * l'ABSENCE de verdict (`verdict: null`). « Je ne sais pas » n'est pas un
 * verdict tiède qu'on rangerait dans « prudence » — c'est une réponse
 * différente, qui mène à un geste différent : aller chercher ce qui manque.
 * Mettre ces comptes en « prudence » les rendrait indistinguables de ceux qu'on
 * a réellement pesés et trouvés discutables.
 */
export const DISCOVER_QUICK_PASS_VERDICTS = ['go', 'prudence', 'non'] as const
export const discoverQuickPassVerdictSchema = z.enum(DISCOVER_QUICK_PASS_VERDICTS)
export type DiscoverQuickPassVerdict = (typeof DISCOVER_QUICK_PASS_VERDICTS)[number]

/** Le lot est BORNÉ : vingt comptes, comme la décision le dit. */
export const DISCOVER_QUICK_PASS_MAX_ACCOUNTS = 20

/**
 * Le plancher d'axes évalués sous lequel aucun verdict ne se rend.
 *
 * Deux : un seul axe évalué sur quatre ne fait pas une revue, il fait une
 * impression. Le même plancher existe pour les scores du dépôt
 * (`MIN_AXES_FOR_SCORE`), pour la même raison.
 */
export const DISCOVER_QUICK_PASS_MIN_EVALUATED_AXES = 2

/* ------------------------------------------------------------------ */
/* Ce qui a été mesuré, en CHIFFRES et non en phrase                   */
/* ------------------------------------------------------------------ */

/**
 * Les grandeurs mesurées sur un axe, une union discriminée par l'axe.
 *
 * ⚠️ Des NOMBRES et des CLÉS, jamais une phrase française : un libellé produit
 * ici figerait la langue du produit dans le contrat, et la garde de parité
 * FR/EN n'aurait plus rien à lire. La phrase se compose à l'écran.
 *
 * ⚠️ `score` / `scoreMax` voyagent ENSEMBLE et `scoreMax` est le dénominateur
 * RÉEL (les plafonds des seuls blocs mesurés), jamais 100. C'est ce qui permet
 * à l'écran de rendre « 62/70 » et rend « 88 % » impossible à composer.
 */
export const discoverQuickPassMeasureSchema = z.union([
  z.object({ score: z.number().int().min(0), scoreMax: z.number().int().min(1) }).strict(),
  z.object({ accessLevel: accountAccessLevelSchema }).strict(),
  z.object({ signalCount: z.number().int().min(0) }).strict(),
  z.object({ namedContactCount: z.number().int().min(0) }).strict(),
])
export type DiscoverQuickPassMeasure = z.infer<typeof discoverQuickPassMeasureSchema>

export const discoverQuickPassAxisResultSchema = z
  .object({
    axis: discoverQuickPassAxisSchema,
    /** `null` = axe NON ÉVALUABLE. Il sort du décompte ; il ne vaut pas zéro. */
    state: discoverQuickPassAxisStateSchema.nullable(),
    weight: z.enum(['decisive', 'advisory']),
    /** Les grandeurs mesurées. `null` exactement quand `state` est `null`. */
    measured: discoverQuickPassMeasureSchema.nullable(),
    /**
     * POURQUOI l'axe n'a pas pu être évalué — une clé de traduction, pas une
     * phrase. Non nulle exactement quand `state` est `null` : « deux axes non
     * évaluables » n'apprend rien, « les sources datées n'ont pas été
     * interrogées sur ce compte » dit quoi compléter.
     */
    unevaluable: z.string().min(1).nullable(),
  })
  .strict()
  .refine(axis => (axis.state === null) === (axis.unevaluable !== null), {
    message: 'un axe non évaluable NOMME sa raison, et un axe évalué n’en a pas',
  })
  .refine(axis => (axis.state === null) === (axis.measured === null), {
    message: 'un axe non évaluable ne porte AUCUNE mesure — pas de zéro déguisé',
  })
export type DiscoverQuickPassAxisResult = z.infer<typeof discoverQuickPassAxisResultSchema>

/**
 * Ce qui chiffrerait une CHANCE. Le contrat refuse ces formes dans la raison
 * d'un verdict, parce qu'une garde qui se contente d'un commentaire ne tient
 * rien : `%`, « pourcent », « probabilit… », « chance(s) ».
 */
const PROBABILITY_SHAPES = /%|pourcent|probabilit|\bchances?\b/i

/** Une clé de traduction courte, qui ne chiffre aucune chance. */
const qualitativeReasonSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(reason => !PROBABILITY_SHAPES.test(reason), {
    message: 'aucune probabilité, aucun pourcentage — refusé six fois (c26_probabilite)',
  })

export const discoverQuickPassEntrySchema = z
  .object({
    siren: z.string().min(1),
    name: z.string().min(1),
    /**
     * `null` = pas assez d'éléments pour trancher. Voir
     * {@link DISCOVER_QUICK_PASS_VERDICTS} : ce n'est pas un « prudence » tiède.
     */
    verdict: discoverQuickPassVerdictSchema.nullable(),
    /** La RAISON COURTE, en clé de traduction — jamais une phrase, jamais un nombre. */
    reason: qualitativeReasonSchema,
    /** Les QUATRE, toujours : un axe non évaluable se montre, il ne se cache pas. */
    axes: z.array(discoverQuickPassAxisResultSchema).length(DISCOVER_QUICK_PASS_AXES.length),
    axisCount: z.number().int().min(0),
    evaluatedCount: z.number().int().min(0),
    /** Les axes qu'on a pu peser, NOMMÉS — « un score n'est jamais nu ». */
    evaluatedAxes: z.array(discoverQuickPassAxisSchema),
    /** Ceux qu'on n'a pas pu peser, NOMMÉS aussi. */
    unevaluableAxes: z.array(discoverQuickPassAxisSchema),
    /** Le sous-ensemble qui interdit de conclure « vas-y ». */
    unevaluableDecisiveAxes: z.array(discoverQuickPassAxisSchema),
    attentionAxes: z.array(discoverQuickPassAxisSchema),
    blockingAxes: z.array(discoverQuickPassAxisSchema),
  })
  .strict()
  .refine(entry => entry.evaluatedAxes.every(axis => !entry.unevaluableAxes.includes(axis)), {
    message: 'un axe est évalué OU non évaluable, jamais les deux',
  })
  .refine(entry => entry.evaluatedCount === entry.evaluatedAxes.length, {
    message: 'le dénominateur affiché est celui des axes réellement pesés',
  })
  .refine(
    entry =>
      entry.verdict === 'non' ||
      entry.blockingAxes.length > 0 ||
      (entry.unevaluableDecisiveAxes.length === 0 && entry.evaluatedCount >= DISCOVER_QUICK_PASS_MIN_EVALUATED_AXES) ===
        (entry.verdict !== null),
    {
      message: 'aucun verdict ne se rend sans son axe décisif — et l’absence de verdict se dit',
    },
  )
export type DiscoverQuickPassEntry = z.infer<typeof discoverQuickPassEntrySchema>

export const discoverQuickPassResultSchema = z
  .object({
    entries: z.array(discoverQuickPassEntrySchema).max(DISCOVER_QUICK_PASS_MAX_ACCOUNTS),
    /**
     * QUAND la passe a été faite. Une revue sans date se relit comme fraîche
     * une semaine plus tard — la même discipline que `Provenance`.
     */
    reviewedAt: z.string().min(1),
  })
  .strict()
export type DiscoverQuickPassResult = z.infer<typeof discoverQuickPassResultSchema>

/* ------------------------------------------------------------------ */
/* Les quatre constructeurs d'axe — tous déterministes                 */
/* ------------------------------------------------------------------ */

function evaluated(
  axis: DiscoverQuickPassAxis,
  state: DiscoverQuickPassAxisState,
  measured: DiscoverQuickPassMeasure,
): DiscoverQuickPassAxisResult {
  return { axis, state, weight: DISCOVER_QUICK_PASS_AXIS_WEIGHTS[axis], measured, unevaluable: null }
}

/** L'axe qu'on n'a pas pu évaluer, avec la RAISON — jamais un axe muet. */
function unevaluable(axis: DiscoverQuickPassAxis, reason: string): DiscoverQuickPassAxisResult {
  return { axis, state: null, weight: DISCOVER_QUICK_PASS_AXIS_WEIGHTS[axis], measured: null, unevaluable: reason }
}

/**
 * Le seuil qui choisit un MOT, jamais un nombre affiché.
 *
 * Un score qui n'atteint pas la moitié de SON dénominateur réel se dit
 * « réserve ». Ce rapport ne sort jamais du fichier : il ne devient ni un
 * pourcentage, ni un rang. C'est le même usage qu'un seuil de rapprochement
 * (`MATCH_DEFAULT_THRESHOLD`) — il décide d'un état, il ne s'affiche pas.
 */
const INTEREST_ATTENTION_RATIO = 0.5

/**
 * Axe 1 — INTÉRÊT. « Y a-t-il de quoi vendre ? »
 *
 * ⚠️ ZÉRO MESURÉ N'EST PAS ZÉRO ÉVALUABLE, et c'est la distinction que tout le
 * reste du dépôt tient déjà (`DiscoverCandidate.score`) : `score: null` veut
 * dire « aucun critère du barème n'était évaluable », `score: 0` veut dire
 * « le barème a tourné et rien n'a matché ». Le premier interdit tout verdict,
 * le second en autorise un NON. Les confondre afficherait « 0/70 » sur toute
 * une liste — le défaut exact déjà payé une fois.
 */
export function discoverQuickPassInterestAxis(input: {
  score: number | null
  /** Le dénominateur RÉEL (plafonds des seuls blocs mesurés), jamais 100. */
  scoreMax: number | null
}): DiscoverQuickPassAxisResult {
  const { score, scoreMax } = input
  if (score === null || scoreMax === null || scoreMax <= 0) {
    return unevaluable('interest', 'noScorableCriterion')
  }
  const state: DiscoverQuickPassAxisState =
    score === 0 ? 'blocking' : score < scoreMax * INTEREST_ATTENTION_RATIO ? 'attention' : 'positive'
  return evaluated('interest', state, { score, scoreMax })
}

/**
 * Axe 2 — ACCÈS. « Peut-on entrer ? »
 *
 * L'état vient de `accountAccessLevel` (#2646.1), la dérivation UNIQUE du dépôt
 * — on ne la refait pas ici (GA-26). `inconnu` est le SEUL état non évaluable :
 * les trois autres sont des faits.
 *
 * ⚠️ `rang3_plus` est une RÉSERVE, jamais un refus. On nomme un état d'accès,
 * jamais une chance de réussite (décision Louis 20/09/2026, #2646.1).
 */
export function discoverQuickPassAccessAxis(input: { level: AccountAccessLevel }): DiscoverQuickPassAxisResult {
  if (input.level === 'inconnu') return unevaluable('access', 'accessNotDerivable')
  return evaluated('access', input.level === 'direct' ? 'positive' : 'attention', { accessLevel: input.level })
}

/**
 * Axe 3 — SIGNAL. « Se passe-t-il quelque chose ? »
 *
 * ⚠️ « Interrogé, rien trouvé » est une MESURE ; « pas interrogé » n'en est pas
 * une. La recherche Découvrir n'interroge les sources datées que pour les
 * premiers candidats, en nombre borné (`signalsSearched`, décision 1 du
 * 18/09/2026) : sans ce drapeau, `signals: []` ne dit RIEN, et l'afficher comme
 * « aucun signal » serait la faute que GA-18 / GA-19 interdisent.
 */
export function discoverQuickPassSignalAxis(input: {
  /** Les sources datées ont-elles réellement été interrogées pour ce compte ? */
  searched: boolean
  count: number
}): DiscoverQuickPassAxisResult {
  if (!input.searched) return unevaluable('signal', 'signalsNotSearched')
  return evaluated('signal', input.count > 0 ? 'positive' : 'attention', { signalCount: input.count })
}

/**
 * Axe 4 — CONTACT NOMMÉ. « À qui parler ? »
 *
 * `count: null` = la collecte des personnes n'a pas eu lieu sur ce compte (une
 * réponse d'avant ce déploiement, ou un candidat non ciblé). `count: 0` = elle a
 * eu lieu et n'a nommé personne — un fait, qui se dit en réserve.
 *
 * ⚠️ Ce sont les personnes qu'une SOURCE a nommées, jamais les fonctions
 * suggérées par un modèle (`suggestedRoles`) : une passe rapide qui compterait
 * des suppositions comme des contacts inventerait de la donnée.
 */
export function discoverQuickPassNamedContactAxis(input: { count: number | null }): DiscoverQuickPassAxisResult {
  if (input.count === null) return unevaluable('named_contact', 'notCollected')
  return evaluated('named_contact', input.count > 0 ? 'positive' : 'attention', { namedContactCount: input.count })
}

/* ------------------------------------------------------------------ */
/* Le verdict                                                          */
/* ------------------------------------------------------------------ */

export interface DiscoverQuickPassInput {
  siren: string
  name: string
  interest: { score: number | null; scoreMax: number | null }
  access: { level: AccountAccessLevel }
  signal: { searched: boolean; count: number }
  namedContact: { count: number | null }
}

/**
 * Les raisons COURTES — des clés, une par issue. La phrase vit dans
 * `discover.json`, FR et EN.
 */
const QUICK_PASS_REASON_KEYS = {
  blocking: 'nothingToSell',
  attention: 'reservesNamed',
  go: 'axesAllFavourable',
  insufficient: 'notEnoughEvaluated',
} as const

/**
 * LA PASSE RAPIDE SUR UN COMPTE — #2630.1.
 *
 * ⚠️ L'ORDRE DES TESTS CI-DESSOUS EST LA DÉCISION.
 *
 * Un bloquant CONNU passe AVANT l'ignorance : un compte dont le barème a
 * tourné et n'a rien trouvé se dit NON, même si les trois autres axes sont
 * muets. Se taire là serait renvoyer le commercial chercher des données pour un
 * compte déjà pesé.
 *
 * Ensuite seulement vient le refus de conclure : sans l'axe DÉCISIF, ou sous le
 * plancher d'axes pesés, la réponse est l'ABSENCE de verdict — jamais
 * « prudence » par défaut, qui ferait passer une ignorance pour une nuance.
 *
 * Aucun nombre agrégé ne sort d'ici : le verdict est un mot, et les seuls
 * chiffres rendus sont des COMPTES d'axes, vrais tout seuls.
 */
export function buildDiscoverQuickPassEntry(input: DiscoverQuickPassInput): DiscoverQuickPassEntry {
  const axes: DiscoverQuickPassAxisResult[] = [
    discoverQuickPassInterestAxis(input.interest),
    discoverQuickPassAccessAxis(input.access),
    discoverQuickPassSignalAxis(input.signal),
    discoverQuickPassNamedContactAxis(input.namedContact),
  ]

  const evaluatedAxes = axes.filter(axis => axis.state !== null).map(axis => axis.axis)
  const unevaluableAxes = axes.filter(axis => axis.state === null).map(axis => axis.axis)
  const unevaluableDecisiveAxes = unevaluableAxes.filter(axis => DISCOVER_QUICK_PASS_AXIS_WEIGHTS[axis] === 'decisive')
  const attentionAxes = axes.filter(axis => axis.state === 'attention').map(axis => axis.axis)
  const blockingAxes = axes.filter(axis => axis.state === 'blocking').map(axis => axis.axis)

  // #2630.1 — verdict GO / PRUDENCE / NON, jamais un pourcentage : un bloquant
  // connu l'emporte sur une ignorance, et une ignorance ne devient jamais une
  // nuance (GA-18 / GA-19 — l'axe non évaluable est sorti du dénominateur
  // ci-dessus, il ne vaut pas zéro).
  const insufficient =
    unevaluableDecisiveAxes.length > 0 || evaluatedAxes.length < DISCOVER_QUICK_PASS_MIN_EVALUATED_AXES

  const verdict: DiscoverQuickPassVerdict | null =
    blockingAxes.length > 0 ? 'non' : insufficient ? null : attentionAxes.length > 0 ? 'prudence' : 'go'

  const reason =
    blockingAxes.length > 0
      ? QUICK_PASS_REASON_KEYS.blocking
      : insufficient
        ? QUICK_PASS_REASON_KEYS.insufficient
        : attentionAxes.length > 0
          ? QUICK_PASS_REASON_KEYS.attention
          : QUICK_PASS_REASON_KEYS.go

  return {
    siren: input.siren,
    name: input.name,
    verdict,
    reason,
    axes,
    axisCount: axes.length,
    evaluatedCount: evaluatedAxes.length,
    evaluatedAxes,
    unevaluableAxes,
    unevaluableDecisiveAxes,
    attentionAxes,
    blockingAxes,
  }
}
