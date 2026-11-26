import { z } from 'zod'
import type { EsnRiskFlag } from './esn-directory.js'

/**
 * Le score de DÉBORDEMENT (tome 4 §19) — « cette ESN a-t-elle besoin de bras,
 * ici, maintenant ? »
 *
 * Il ne dit pas si c'est un bon partenaire (c'est l'autre score, celui à cinq
 * axes) : il dit s'il y a une raison de l'appeler CETTE semaine. Les deux ne se
 * fondent jamais — « bon partenaire mais rien à faire en ce moment » et
 * « inconnu mais débordé aujourd'hui » appellent deux gestes opposés, et un
 * nombre unique les confondrait.
 *
 * ⚠️ **Jamais montré au partenaire concerné** (D66). Le montrer transformerait
 * le produit en outil de pression : « je sais que vous n'arrivez pas à
 * recruter » est exactement la phrase que le tome interdit (§12).
 */

export const OVERFLOW_AXES = ['volume', 'tension', 'charge_nouvelle', 'ouverture'] as const
export type OverflowAxis = (typeof OVERFLOW_AXES)[number]

/** Le maximum de chaque axe (§19). La somme fait 100. */
export const OVERFLOW_AXIS_MAX: Record<OverflowAxis, number> = {
  volume: 35,
  tension: 25,
  charge_nouvelle: 25,
  ouverture: 15,
}

/** Sous ce nombre d'axes mesurables, aucun score n'est produit (règle 3). */
export const OVERFLOW_MIN_AXES = 2

/**
 * Les signaux d'entrée, NOMMÉS — pour qu'un appelant puisse déclarer ceux
 * qu'aucune source branchée ne produit chez lui.
 *
 * Sans cette liste, un `null` dit deux choses opposées : « cherché, absent » et
 * « jamais collecté ». Les deux sortent du dénominateur, mais la première
 * demande d'ATTENDRE et la seconde de CONSTRUIRE. Les confondre fait attendre
 * une valeur qui n'arrivera jamais — c'est exactement ce qui s'est passé ici.
 */
export const OVERFLOW_SIGNALS = [
  'offers90d',
  'baseline',
  'republished',
  'averageOfferAgeDays',
  'newEstablishment',
  'headcountGrowing',
  'recentAward',
  'awardWithoutLocalPresence',
  'offersOutsideCoreTech',
  'subcontractingMentioned',
  'declaredOpen',
] as const
export type OverflowSignal = (typeof OVERFLOW_SIGNALS)[number]

/** Ce que chaque axe EXIGE pour être mesurable, et comment. */
const AXIS_REQUIREMENT: Record<OverflowAxis, { signals: readonly OverflowSignal[]; mode: 'all' | 'any' }> = {
  // Un volume sans moyenne ne dit rien : les DEUX sont nécessaires, donc
  // l'absence d'un seul suffit à condamner l'axe.
  volume: { signals: ['offers90d', 'baseline'], mode: 'all' },
  tension: { signals: ['republished', 'averageOfferAgeDays'], mode: 'any' },
  charge_nouvelle: { signals: ['recentAward', 'awardWithoutLocalPresence', 'offersOutsideCoreTech'], mode: 'any' },
  ouverture: { signals: ['subcontractingMentioned', 'declaredOpen'], mode: 'any' },
}

/** En français : « republished » ne dit à personne ce qu'il faudrait bâtir. */
const SIGNAL_LABELS: Record<OverflowSignal, string> = {
  offers90d: 'le volume d’offres',
  baseline: 'la moyenne de recrutement',
  republished: 'les republications de poste',
  averageOfferAgeDays: 'l’ancienneté des offres',
  newEstablishment: 'l’ouverture d’un établissement',
  headcountGrowing: 'la hausse de tranche d’effectif',
  recentAward: 'les marchés publics récemment attribués',
  awardWithoutLocalPresence: 'les marchés gagnés hors implantation',
  offersOutsideCoreTech: 'les offres hors expertises connues',
  subcontractingMentioned: 'la mention de sous-traitance',
  declaredOpen: 'l’ouverture au rang 2 déclarée',
}

const AXIS_LABELS: Record<OverflowAxis, string> = {
  volume: 'volume',
  tension: 'tension',
  charge_nouvelle: 'charge nouvelle',
  ouverture: 'ouverture',
}

/** Un volume au-dessus de ce multiple de la moyenne EST un débordement (S01). */
export const OVERFLOW_VOLUME_RATIO = 2

export const overflowInputSchema = z.object({
  /** Offres publiées par cette ESN sur cette ville, sur 90 jours. */
  offers90d: z.number().int().nonnegative().nullable(),
  /** Sa moyenne trimestrielle sur les 4 trimestres précédents. `null` tant que
   *  l'historique n'existe pas — ce qui est le cas le premier jour. */
  baseline: z.number().nonnegative().nullable(),
  /** Postes republiés ≥ 3 fois en 90 jours (S03). */
  republished: z.number().int().nonnegative().nullable(),
  /** Ancienneté moyenne des offres ouvertes, en jours. */
  averageOfferAgeDays: z.number().nonnegative().nullable(),
  /** Un établissement ouvert récemment (S06). */
  newEstablishment: z.boolean().nullable(),
  /** Tranche d'effectif en hausse d'un cran au registre (S09). */
  headcountGrowing: z.boolean().nullable(),
  /** Marché public attribué depuis moins de 6 mois (S04). */
  recentAward: z.boolean().nullable(),
  /** Marché gagné dans une ville où elle n'a pas d'implantation (S05). */
  awardWithoutLocalPresence: z.boolean().nullable(),
  /** ≥ 3 offres sur une techno absente de ses expertises connues (S02). */
  offersOutsideCoreTech: z.boolean().nullable(),
  /** Une offre ou une page qui MENTIONNE la sous-traitance (S11). */
  subcontractingMentioned: z.boolean().nullable(),
  /** Ouverture au rang 2 déclarée (déclaratif ou communautaire). */
  declaredOpen: z.boolean().nullable(),
  /** Le drapeau de risque. `alerte` bloque le score entièrement. */
  riskFlag: z.custom<EsnRiskFlag>().optional(),
  /**
   * Les signaux qu'AUCUNE source branchée ne produit chez cet appelant.
   *
   * À ne pas confondre avec un `null` : `null` dit « cherché, rien trouvé »,
   * ceci dit « personne ne le cherche ». Un axe dont tous les signaux
   * nécessaires sont ici est NOMMÉ `not_collected` — il sort du dénominateur
   * comme n'importe quel axe non mesuré, mais l'écran peut enfin dire qu'il ne
   * sert à rien d'attendre.
   */
  uncollected: z.array(z.enum(OVERFLOW_SIGNALS)).optional(),
})

/**
 * `uncollected` est élargi en LECTURE SEULE : la déclaration d'un appelant est
 * une constante partagée (`readonly`), et le calcul ne fait que la lire. Sans
 * cet élargissement, chaque appelant devrait en recopier une version mutable —
 * une copie par ESN et par affichage, pour une liste qui ne bouge pas.
 */
export type OverflowInput = Omit<z.infer<typeof overflowInputSchema>, 'uncollected'> & {
  uncollected?: readonly OverflowSignal[]
}

/**
 * Pourquoi un axe vaut ce qu'il vaut — ou pourquoi il ne vaut rien.
 *
 * `absent` et `not_collected` sortent tous deux du dénominateur ; ils ne
 * demandent pas le même geste. Le premier s'attend, le second se construit.
 *
 * NOMMÉE et exportée depuis le 29/08/2026 (D141), même raison que
 * `EMAIL_LANGUAGES` : elle vivait en union de littéraux, donc invisible à
 * GA-08. C'est LA distinction que ce score porte — celle qui a laissé le score
 * muet pendant des mois sans que personne sache s'il fallait attendre ou
 * construire —, et une distinction que rien ne gèle se perd au premier
 * remaniement qui trouve qu'un « non mesuré » unique suffirait.
 */
export const OVERFLOW_AVAILABILITY = ['measured', 'absent', 'not_collected'] as const
export type OverflowAvailability = (typeof OVERFLOW_AVAILABILITY)[number]

/**
 * Un axe du score, tel que le calcul le rend.
 *
 * ⚠️ Le TYPE est DÉRIVÉ du schéma, pas écrit à côté de lui. L'écrire deux fois
 * — une `interface` pour TypeScript, un `z.object` pour l'exécution — c'est
 * exactement le défaut que D141 corrige, un cran plus bas : deux descriptions
 * du même objet dont une seule reste vraie.
 */
export const overflowAxisResultSchema = z
  .object({
    axis: z.enum(OVERFLOW_AXES),
    points: z.number().int().nonnegative().nullable(),
    max: z.number().int().positive(),
    /** En français, citant ce qui l'établit. Jamais « offers90d: 34 ». */
    evidence: z.string().min(1),
    availability: z.enum(OVERFLOW_AVAILABILITY),
  })
  // Un axe ne peut pas rapporter plus que ce qu'il pèse : c'est ce qui rend
  // « 62 sur 60 » impossible à afficher. Et `measured` VEUT DIRE qu'il y a des
  // points — les découpler laisserait un axe se dire mesuré en étant vide.
  .refine(axis => axis.points === null || axis.points <= axis.max, {
    message: 'Un axe ne peut pas rapporter plus que son maximum',
  })
  .refine(axis => (axis.points === null) === (axis.availability !== 'measured'), {
    message: '`measured` et des points sont la même chose, dite deux fois',
  })
export type OverflowAxisResult = z.infer<typeof overflowAxisResultSchema>

/** Un axe avant qu'on sache dire POURQUOI il est vide. */
type RawAxis = Omit<OverflowAxisResult, 'availability'>

/**
 * Le contrat de SORTIE du score (D141, 29/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce score était calculé ici, juste, testé sur dix-huit cas, posé sur chaque
 * ESN par un appelant réel — et il traversait l'API en `z.unknown()`
 * (`territory.ts:52`). L'écran ne pouvait donc pas TYPER ce qu'il affiche : il
 * a dû, au lot B3, recopier la forme de ce score dans un parseur de frontière,
 * avec sa propre liste d'axes et sa propre liste de disponibilités. Un
 * palliatif honnête, et une seconde description du même objet — dont une seule
 * reste vraie le jour où le calcul change.
 *
 * Le schéma est ici, à côté de la fonction qui produit la valeur, parce que
 * c'est le seul endroit où les deux ne peuvent pas diverger sans qu'un test
 * tombe : `overflow-score.test.ts` fait passer les sorties RÉELLES de
 * `overflowScore()` à travers ce schéma, branche par branche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL N'A PAS À FAIRE VOYAGER
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien à élargir en base (GA-11 / GA-12) : ce score se calcule à la LECTURE
 * (`territory.controller.ts:113`) et n'est jamais persisté — la photo
 * hebdomadaire du territoire ne garde que `{ name, offers }`
 * (`territory-watch.service.ts:103`). Aucune colonne ne porte ces valeurs, donc
 * aucune contrainte `CHECK` ne peut les refuser en fin de course.
 *
 * Rien à régénérer côté Python non plus : `sync_schemas` ne fait voyager que
 * les quatre contrats d'étape du pipeline (`research`, `contacts`, `classify`,
 * `plan`) et le contrat d'entrée, et le service IA ne pose AUCUN score — il
 * rend les ESN qui recrutent, l'API pose le score par-dessus parce que ses
 * entrées viennent des deux côtés.
 */
export const overflowScoreSchema = z
  .object({
    /** 0-100 ramené au dénominateur RÉEL, ou `null` quand rien n'est mesurable. */
    score: z.number().int().min(0).max(100).nullable(),
    /** La somme des maxima des seuls axes mesurés. Jamais 100 par principe. */
    scoreMax: z.number().int().nonnegative().max(100),
    axes: z.array(overflowAxisResultSchema),
    /** Les axes non mesurables, NOMMÉS. */
    unmeasured: z.array(z.enum(OVERFLOW_AXES)),
    /**
     * Ceux d'entre eux qu'aucune source ne peut alimenter aujourd'hui — le
     * sous-ensemble d'`unmeasured` qu'il est inutile d'attendre.
     */
    notCollected: z.array(z.enum(OVERFLOW_AXES)),
    /** Pourquoi il n'y a pas de score, quand il n'y en a pas. */
    reason: z.string().min(1).nullable(),
    /** L'ESN est-elle retirée des propositions, et pourquoi. */
    excluded: z.boolean(),
    exclusionReason: z.string().min(1).nullable(),
  })
  .superRefine((value, ctx) => {
    // « Un score n'est jamais nu » — ses axes, et ce qui n'a pas pu être évalué
    // est NOMMÉ. ⚠️ Une EXCLUSION n'est pas un score : le calcul rend bien
    // `axes: []` quand le drapeau vaut `alerte`, et un contrat qui refuserait
    // une sortie du calcul qu'il décrit ne serait pas un contrat. C'est la
    // lecture qui manquait au `.min(1)` du parseur de frontière.
    if (!value.excluded && value.axes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['axes'],
        message: 'Un score n’est jamais nu : hors exclusion, ses axes sont nommés',
      })
    }
    // « Ce qui est retiré est DIT, jamais escamoté » (§9.3). Une exclusion
    // muette se lit comme une ESN qui a disparu de la liste toute seule.
    if (value.excluded !== (value.exclusionReason !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exclusionReason'],
        message: 'Une exclusion porte sa raison, et une raison suppose une exclusion',
      })
    }
    // `notCollected` est par construction un SOUS-ENSEMBLE d'`unmeasured` : un
    // axe qu'aucune source n'alimente n'est pas mesuré. Les laisser diverger
    // ferait dire à l'écran « il faut construire la collecte » d'un axe qui
    // porte des points.
    const stray = value.notCollected.filter(axis => !value.unmeasured.includes(axis))
    if (stray.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notCollected'],
        message: `Non collecté sans être non mesuré : ${stray.join(', ')}`,
      })
    }
  })
export type OverflowScore = z.infer<typeof overflowScoreSchema>

/**
 * Les signaux de débordement que le calcul ne modélise PAS — nommés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE LISTE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un score n'est jamais nu » s'applique d'ordinaire à ses AXES : ce qui n'a
 * pas pu être évalué est nommé. Il manquait un cran au-dessus — ce que le
 * calcul ne regarde même pas.
 *
 * Le chantier décrit douze signaux de débordement (S01 à S12). Les entrées du
 * score ({@link OVERFLOW_SIGNALS}, onze au total) en portent huit : S01 (qui en
 * coûte deux, le volume ET sa moyenne de référence), S02, S03, S04, S05, S06,
 * S09, S11 — plus deux entrées qui ne viennent pas de cette liste (l'ancienneté
 * des offres et l'ouverture DÉCLARÉE). S12 est modélisé, mais comme une
 * EXCLUSION et non comme un axe : une procédure collective retire l'ESN au lieu
 * de lui coûter des points.
 *
 * Restent trois signaux que rien ne porte, et c'est ce que cette liste dit à
 * l'utilisateur. Sans elle, un axe « ouverture » non évaluable se lit « il
 * manque une donnée », alors qu'il manque aussi trois façons entières de
 * repérer un débordement. Les deux appellent des gestes différents.
 *
 * ⚠️ Cette liste RÉTRÉCIT quand un signal est modélisé — elle ne s'allonge pas
 * pour excuser un calcul. Écrite en prose au lot B3, elle est maintenant TENUE :
 * `overflow-score.test.ts` refuse qu'un angle mort soit déjà dans
 * {@link OVERFLOW_SIGNALS}. Elle vit ici et non dans l'écran pour la même
 * raison : c'est du CALCUL qu'elle dit l'absence, pas de l'affichage.
 */
export const OVERFLOW_BLIND_SPOTS = ['agencyLead', 'contractAnnouncement', 'leadershipChange'] as const

function volumeAxis(input: OverflowInput): RawAxis {
  const { offers90d, baseline } = input
  if (offers90d === null || baseline === null) {
    // Règle 2 : sans baseline, 34 offres à Toulouse ne veulent rien dire — c'est
    // peut-être leur rythme normal. L'axe SORT du dénominateur.
    return {
      axis: 'volume',
      points: null,
      max: OVERFLOW_AXIS_MAX.volume,
      evidence:
        baseline === null
          ? 'Pas encore de moyenne de référence — un volume sans comparaison ne dit rien'
          : 'Aucune offre relevée sur cette ville',
    }
  }
  let points = 0
  const parts: string[] = []
  if (baseline > 0 && offers90d >= baseline * OVERFLOW_VOLUME_RATIO) {
    points += 25
    parts.push(`${offers90d} offres sur 90 jours contre ${Math.round(baseline)} en moyenne`)
  } else {
    parts.push(`${offers90d} offres sur 90 jours, dans la moyenne`)
  }
  if (input.newEstablishment) {
    points += 5
    parts.push('un établissement ouvert récemment')
  }
  if (input.headcountGrowing) {
    points += 5
    parts.push('effectif en hausse au registre')
  }
  return { axis: 'volume', points, max: OVERFLOW_AXIS_MAX.volume, evidence: parts.join(' · ') }
}

function tensionAxis(input: OverflowInput): RawAxis {
  const { republished, averageOfferAgeDays } = input
  if (republished === null && averageOfferAgeDays === null) {
    return {
      axis: 'tension',
      points: null,
      max: OVERFLOW_AXIS_MAX.tension,
      evidence: 'Ni republication ni ancienneté d’offre connues',
    }
  }
  let points = 0
  const parts: string[] = []
  if (republished && republished > 0) {
    points += 15
    parts.push(`${republished} poste(s) republié(s) au moins trois fois en 90 jours`)
  }
  if (averageOfferAgeDays !== null && averageOfferAgeDays >= 45) {
    points += 10
    parts.push(`offres ouvertes depuis ${Math.round(averageOfferAgeDays)} jours en moyenne`)
  }
  if (parts.length === 0) parts.push('Aucun signe de difficulté de recrutement')
  return { axis: 'tension', points, max: OVERFLOW_AXIS_MAX.tension, evidence: parts.join(' · ') }
}

function newLoadAxis(input: OverflowInput): RawAxis {
  const { recentAward, awardWithoutLocalPresence, offersOutsideCoreTech } = input
  if (recentAward === null && awardWithoutLocalPresence === null && offersOutsideCoreTech === null) {
    return {
      axis: 'charge_nouvelle',
      points: null,
      max: OVERFLOW_AXIS_MAX.charge_nouvelle,
      evidence: 'Aucune charge nouvelle vérifiable',
    }
  }
  let points = 0
  const parts: string[] = []
  if (recentAward) {
    points += 10
    parts.push('marché public attribué il y a moins de six mois')
  }
  if (awardWithoutLocalPresence) {
    points += 8
    parts.push('marché gagné là où elle n’a pas d’implantation')
  }
  if (offersOutsideCoreTech) {
    points += 7
    parts.push('recrute sur une techno absente de ses expertises connues')
  }
  if (parts.length === 0) parts.push('Aucune charge nouvelle détectée')
  return { axis: 'charge_nouvelle', points, max: OVERFLOW_AXIS_MAX.charge_nouvelle, evidence: parts.join(' · ') }
}

function opennessAxis(input: OverflowInput): RawAxis {
  const { subcontractingMentioned, declaredOpen } = input
  if (subcontractingMentioned === null && declaredOpen === null) {
    // « Inconnu », jamais « non » : un refus se déclare, il ne se déduit pas
    // d'une absence — et c'est la donnée que personne ne publie.
    return {
      axis: 'ouverture',
      points: null,
      max: OVERFLOW_AXIS_MAX.ouverture,
      evidence: 'Ouverture au rang 2 inconnue — personne ne l’a encore déclarée',
    }
  }
  let points = 0
  const parts: string[] = []
  if (subcontractingMentioned) {
    points += 10
    parts.push('mentionne explicitement la sous-traitance')
  }
  if (declaredOpen) {
    points += 5
    parts.push('ouverture au rang 2 déclarée')
  }
  if (parts.length === 0) parts.push('Rien ne dit qu’elle sous-traite')
  return { axis: 'ouverture', points, max: OVERFLOW_AXIS_MAX.ouverture, evidence: parts.join(' · ') }
}

/**
 * Le score de débordement d'une ESN sur un territoire.
 *
 * Trois façons de ne PAS produire de score, et elles ne disent pas la même
 * chose : `alerte` (on ne la propose plus), trop peu d'axes (on ne sait pas),
 * aucun axe (on n'a rien regardé). Les confondre en un « 0 » ferait passer une
 * ESN qu'on n'a pas mesurée pour une ESN qui n'a besoin de personne.
 */
export function overflowScore(input: OverflowInput): OverflowScore {
  if (input.riskFlag === 'alerte') {
    return {
      score: null,
      scoreMax: 0,
      axes: [],
      unmeasured: [...OVERFLOW_AXES],
      notCollected: [],
      reason: null,
      excluded: true,
      exclusionReason: 'Procédure collective ouverte — je ne te la propose plus comme partenaire tant qu’elle court.',
    }
  }

  const uncollected = new Set(input.uncollected ?? [])
  const axes = [volumeAxis(input), tensionAxis(input), newLoadAxis(input), opennessAxis(input)].map(raw =>
    describeAvailability(raw, uncollected),
  )
  const measured = axes.filter(axis => axis.points !== null)
  const unmeasured = axes.filter(axis => axis.points === null).map(axis => axis.axis)
  const notCollected = axes.filter(axis => axis.availability === 'not_collected').map(axis => axis.axis)

  if (measured.length < OVERFLOW_MIN_AXES) {
    return {
      score: null,
      scoreMax: 0,
      axes,
      unmeasured,
      notCollected,
      // Trois raisons, trois gestes. « Attends la semaine prochaine » est faux
      // quand la donnée n'a pas de collecteur, et c'est ce mensonge-là qui a
      // laissé le score muet pendant des mois sans que personne s'en inquiète.
      reason:
        notCollected.length > 0
          ? `${notCollected.map(axis => AXIS_LABELS[axis]).join(', ')} : pas de source aujourd’hui — ce n’est pas « pas encore mesuré », et le score ne viendra pas tout seul.`
          : measured.length === 0
            ? 'Aucune donnée de recrutement sur cette ville — non mesurable, ce qui n’est pas la même chose que zéro.'
            : `Un seul axe mesurable sur quatre — trop peu pour un classement (il en faut ${OVERFLOW_MIN_AXES}).`,
      excluded: false,
      exclusionReason: null,
    }
  }

  const scoreMax = measured.reduce((sum, axis) => sum + axis.max, 0)
  const raw = measured.reduce((sum, axis) => sum + (axis.points ?? 0), 0)
  return {
    // Ramené au dénominateur RÉEL : un score sur 65 affiché sur 100 mesurerait
    // la complétude de nos données, pas le débordement de l'ESN.
    score: Math.round((raw / scoreMax) * 100),
    scoreMax,
    axes,
    unmeasured,
    notCollected,
    reason: null,
    excluded: false,
    exclusionReason: null,
  }
}

/**
 * Pourquoi cet axe est vide — « on a cherché » ou « personne ne cherche ».
 *
 * Un axe qui exige TOUS ses signaux (Volume) tombe dès qu'un seul n'est pas
 * collecté ; un axe qui se contente d'un seul (les trois autres) ne tombe que
 * si aucun ne l'est. Sans cette nuance, déclarer une seule lacune condamnerait
 * un axe qu'un autre signal suffirait à mesurer.
 */
function describeAvailability(raw: RawAxis, uncollected: Set<OverflowSignal>): OverflowAxisResult {
  if (raw.points !== null) return { ...raw, availability: 'measured' }
  const { signals, mode } = AXIS_REQUIREMENT[raw.axis]
  const missing = signals.filter(signal => uncollected.has(signal))
  const condemned = mode === 'all' ? missing.length > 0 : missing.length === signals.length
  if (!condemned) return { ...raw, availability: 'absent' }
  return {
    ...raw,
    availability: 'not_collected',
    evidence: `Non collecté : ${missing.map(signal => SIGNAL_LABELS[signal]).join(' et ')} — aucune source branchée ne les produit aujourd’hui.`,
  }
}

/* ------------------------------------------------------------------ */
/*  #3921.b — « effectif en hausse » sur DEUX points MESURÉS.          */
/* ------------------------------------------------------------------ */

/** L'ordre des tranches d'effectif INSEE (`trancheEffectifs*`), de la plus
 *  petite à la plus grande. `NN` (non renseignée) n'y est PAS : ce n'est pas
 *  une mesure. */
const INSEE_HEADCOUNT_TRANCHE_ORDER = [
  '00',
  '01',
  '02',
  '03',
  '11',
  '12',
  '21',
  '22',
  '31',
  '32',
  '41',
  '42',
  '51',
  '52',
  '53',
]

/** Au-delà, un relevé ne sert plus de référence (même fenêtre que l'archivage des signaux). */
const HEADCOUNT_HISTORY_WINDOW_DAYS = 730

/**
 * Libellé lisible de chaque tranche INSEE — mêmes codes, déjà vérifiés, que
 * {@link INSEE_HEADCOUNT_TRANCHE_ORDER} ci-dessus. Utilisé par le signal
 * `headcount_change` (#3921, décision Louis 13/10/2026) pour nommer la tranche
 * observée sans jamais inventer de date de fait.
 */
export const INSEE_HEADCOUNT_TRANCHE_LABELS: Readonly<Record<string, string>> = {
  '00': '0 salarié',
  '01': '1 à 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  '11': '10 à 19 salariés',
  '12': '20 à 49 salariés',
  '21': '50 à 99 salariés',
  '22': '100 à 199 salariés',
  '31': '200 à 249 salariés',
  '32': '250 à 499 salariés',
  '41': '500 à 999 salariés',
  '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés',
  '52': '5 000 à 9 999 salariés',
  '53': '10 000 salariés et plus',
}

/** Borne basse de chaque tranche INSEE — jamais le milieu : c'est la seule valeur que la tranche GARANTIT. */
const INSEE_HEADCOUNT_TRANCHE_LOWER_BOUND: Readonly<Record<string, number>> = {
  '00': 0,
  '01': 1,
  '02': 3,
  '03': 6,
  '11': 10,
  '12': 20,
  '21': 50,
  '22': 100,
  '31': 200,
  '32': 250,
  '41': 500,
  '42': 1000,
  '51': 2000,
  '52': 5000,
  '53': 10000,
}

/**
 * #3920.9 — l'effectif plancher d'une tranche INSEE, ou `null` (code inconnu, `NN`, vide). La borne basse est
 * ce que le registre garantit ; on ne devine pas un effectif au milieu de la tranche.
 */
export function headcountTrancheLowerBound(code: string | null | undefined): number | null {
  return INSEE_HEADCOUNT_TRANCHE_LOWER_BOUND[(code ?? '').trim()] ?? null
}

/**
 * #3921.8 — une ouverture d'établissement est « récente » en deçà de cette fenêtre (S06). Une année : le registre
 * date l'ouverture, pas notre observation, et un site ouvert il y a six mois pèse encore sur la charge de l'ESN.
 */
const NEW_ESTABLISHMENT_WINDOW_DAYS = 365

/**
 * #3921.8 (Louis 15/10/2026) — un établissement s'est-il OUVERT récemment ? `readingDays` : les jours où
 * `sirene_snapshots` a gardé la liste des établissements ; `openingDays` : les ouvertures datées par le registre.
 *
 * `null` (non mesuré) tant qu'il n'y a pas DEUX jours de relevé distincts : l'ouverture se déduit en comparant deux
 * relevés, un seul ne dit rien (jamais « aucune ouverture »). Avec deux relevés, aucune ouverture récente est un fait
 * mesuré : `false`.
 */
export function newEstablishmentFromReadings(
  readingDays: readonly string[],
  openingDays: readonly string[],
  now: Date = new Date(),
): boolean | null {
  if (new Set(readingDays.map(day => day.slice(0, 10)).filter(Boolean)).size < 2) return null
  const floor = new Date(now.getTime() - NEW_ESTABLISHMENT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  return openingDays.some(day => day.slice(0, 10) >= floor)
}

/** Un marché public GAGNÉ par l'ESN (titulaire), tel que `esn_directory.public_awards` le garde. */
export type WonAward = { date?: string | null }

/** « Marché récemment attribué » : moins de six mois (cf. le libellé du signal `recentAward`). */
const RECENT_AWARD_WINDOW_DAYS = 183
/** L'exposition à la commande publique se lit sur 24 mois. */
const PUBLIC_EXPOSURE_WINDOW_DAYS = 730
/** Seuils de l'exposition : 0 marché = nulle, 1 à 2 = moyenne, 3 et plus = forte. */
const PUBLIC_EXPOSURE_STRONG_FROM = 3

function awardsWithin(awards: readonly WonAward[], windowDays: number, now: Date): number {
  const ceiling = now.toISOString().slice(0, 10)
  const floor = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10)
  return awards.filter(a => {
    const day = (a?.date ?? '').slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= floor && day <= ceiling
  }).length
}

/**
 * #3921.12 (décision Louis 16/10/2026) — l'ESN a-t-elle GAGNÉ un marché public ces six derniers mois ?
 * `null` tant que ses marchés n'ont jamais été lus (`awardsRefreshedAt` absent) : « on ne sait pas » n'est ni
 * faux ni « aucun marché ». Lue sans marché récent, c'est un `false` MESURÉ.
 */
export function recentAwardFromAwards(
  awards: readonly WonAward[] | null | undefined,
  refreshedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean | null {
  if (!refreshedAt) return null
  return awardsWithin(awards ?? [], RECENT_AWARD_WINDOW_DAYS, now) > 0
}

/**
 * #3921.12 — l'exposition à la commande publique sur 24 mois, dérivée de `public_awards` : nulle / moyenne /
 * forte (`ESN_PUBLIC_EXPOSURES`). `null` tant que les marchés n'ont jamais été lus — jamais « nulle » par défaut.
 */
export function publicExposureFromAwards(
  awards: readonly WonAward[] | null | undefined,
  refreshedAt: Date | string | null | undefined,
  now: Date = new Date(),
): 'forte' | 'moyenne' | 'nulle' | null {
  if (!refreshedAt) return null
  const count = awardsWithin(awards ?? [], PUBLIC_EXPOSURE_WINDOW_DAYS, now)
  if (count === 0) return 'nulle'
  return count >= PUBLIC_EXPOSURE_STRONG_FROM ? 'forte' : 'moyenne'
}

/** Un relevé d'effectif tel que `sirene_snapshots` le garde, une ligne par jour. */
export type HeadcountReading = { observedOn: string; headcountRange: string | null }

/**
 * #3921.b — la tranche d'effectif a-t-elle MONTÉ entre le plus ancien et le plus
 * récent relevé mesurés (24 mois au plus) ?
 *
 * `null` tant qu'il n'y a pas DEUX jours mesurés distincts : « non mesuré »,
 * jamais déduit d'un seul point ni présumé stable. Avant ce lot,
 * `headcount_tranche` n'existait qu'au présent et ce signal ne pouvait pas
 * arriver ; l'historique `sirene_snapshots` lui donne enfin deux points.
 */
export function headcountGrowingFromReadings(
  readings: readonly HeadcountReading[],
  now: Date = new Date(),
): boolean | null {
  const floor = new Date(now.getTime() - HEADCOUNT_HISTORY_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const byDay = new Map<string, number>()
  for (const reading of readings) {
    const rank = INSEE_HEADCOUNT_TRANCHE_ORDER.indexOf((reading.headcountRange ?? '').trim())
    const day = (reading.observedOn ?? '').slice(0, 10)
    if (rank < 0 || !day || day < floor) continue
    byDay.set(day, rank)
  }
  if (byDay.size < 2) return null
  const days = [...byDay.keys()].sort()
  return (byDay.get(days[days.length - 1] as string) as number) > (byDay.get(days[0] as string) as number)
}
