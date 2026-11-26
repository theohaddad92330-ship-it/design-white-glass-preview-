import type { DiscoverCandidate, DiscoverScoreFactor } from './discover-types'

/* ------------------------------------------------------------------ */
/*  Lecture du score.                                                   */
/*                                                                     */
/*  Le backend calcule un score /100 sur un barème à HUIT blocs et      */
/*  renvoie les facteurs à plat, chacun estampillé de son bloc. Ce      */
/*  module les recompose pour que le commercial voie « d'où viennent    */
/*  les points » plutôt qu'une liste indifférenciée — et ajoute l'axe   */
/*  qui manque au score seul : la CONFIANCE dans la donnée.            */
/* ------------------------------------------------------------------ */

import { DISCOVER_SCORE_BLOCKS, type DiscoverScoreBlock } from '@bellum/contracts'

type ScoreBlockKey = DiscoverScoreBlock

/** Barème backend. L'ordre est l'ordre d'affichage ; la somme fait 100.
 *
 *  Réexporté depuis `@bellum/contracts` et non recopié : la table vivait ici en
 *  double, deux versions en retard (5 blocs, 30/20/20/25/5), pendant que le
 *  backend en appliquait huit. Une table de barème dupliquée diverge toujours ;
 *  celle-ci a divergé sans que rien ne tombe. */
export const SCORE_BLOCKS: ReadonlyArray<{ key: ScoreBlockKey; max: number }> = DISCOVER_SCORE_BLOCKS

/**
 * Mots-clés de rattachement d'un facteur à son bloc — **repli seulement**.
 *
 * Le contrat transporte désormais `block`. Ces termes ne servent plus qu'aux
 * instantanés produits AVANT ce déploiement, qui n'ont pas la clé : un candidat
 * en cache ne doit pas basculer d'un coup dans « divers ». Ils resteront faux
 * pour les trois blocs qu'ils ne savent pas nommer (`it_surface`,
 * `accessibility`, `evidence`) — c'est assumé, c'est un repli, pas une méthode.
 */
const BLOCK_TERMS: Record<ScoreBlockKey, string[]> = {
  activity: ['naf', 'secteur', 'activite', 'code ape', 'metier'],
  geography: ['geo', 'zone', 'departement', 'ville', 'region', 'siege', 'localisation', 'implantation'],
  headcount: ['effectif', 'salarie', 'taille', 'headcount'],
  age: ['anciennete', 'creation', 'creee', 'cree', 'age ', 'fondee'],
  it_surface: ['surface informatique', 'surface it', 'stack'],
  signals: ['signal', 'signaux', "appel d'offres", 'appel d offres', 'ao ', 'marche', 'recrut', 'embauche', 'offre'],
  accessibility: ['accessibilit', 'adressabilit', 'barriere', 'verrouill', 'referenc'],
  evidence: ['preuve', 'confiance donnee'],
}

/** Accents et casse retirés avant comparaison. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Bloc d'appartenance d'un facteur, ou `'other'` si rien ne le rattache.
 *
 *  La clé TRANSPORTÉE fait foi. Le libellé n'est consulté que faute de clé —
 *  c'est-à-dire sur un instantané antérieur au déploiement qui l'a ajoutée. */
export function classifyScoreFactor(factor: DiscoverScoreFactor): ScoreBlockKey | 'other' {
  if (factor.block && SCORE_BLOCKS.some(b => b.key === factor.block)) return factor.block
  // Un espace final permet aux termes courts (« ao », « age ») de matcher un mot
  // entier sans attraper « chaos » ou « agence ».
  const folded = `${fold(factor.label)} `
  for (const { key } of SCORE_BLOCKS) {
    if (BLOCK_TERMS[key].some(term => folded.includes(term))) return key
  }
  return 'other'
}

interface ScoreBlockGroup {
  key: ScoreBlockKey | 'other'
  /** Points cumulés du bloc (contributions signées). */
  points: number
  /** Plafond du barème, ou `null` pour le bloc « divers ». */
  max: number | null
  factors: DiscoverScoreFactor[]
}

/**
 * Facteurs à plat → blocs du barème, dans l'ordre du barème, « divers » en
 * dernier.
 *
 * `measured` — les blocs que le backend déclare avoir ÉVALUÉS (le barème moins
 * `scoreUnmeasured`) — fait apparaître ceux qui n'ont rapporté aucun point.
 * Sans lui, un bloc évalué à zéro disparaissait purement : la carte annonçait
 * « 32/60 » au-dessus de blocs dont les plafonds faisaient 50, et les dix
 * points manquants n'avaient aucune explication à l'écran. « Le secteur ne
 * correspond pas » est une information ; l'absence de ligne n'en est pas une.
 * Les blocs ni mesurés ni pourvus d'un facteur restent omis — ils sont nommés
 * ailleurs, dans « non évalué faute de donnée ».
 */
export function groupScoreFactors(
  factors: readonly DiscoverScoreFactor[],
  measured?: readonly ScoreBlockKey[],
): ScoreBlockGroup[] {
  const buckets = new Map<ScoreBlockKey | 'other', DiscoverScoreFactor[]>()
  for (const factor of factors) {
    const key = classifyScoreFactor(factor)
    const existing = buckets.get(key)
    if (existing) existing.push(factor)
    else buckets.set(key, [factor])
  }

  const groups: ScoreBlockGroup[] = []
  for (const { key, max } of SCORE_BLOCKS) {
    const bucket = buckets.get(key)
    if (bucket) groups.push({ key, max, points: sumPoints(bucket), factors: bucket })
    else if (measured?.includes(key)) groups.push({ key, max, points: 0, factors: [] })
  }

  const other = buckets.get('other')
  if (other) groups.push({ key: 'other', max: null, points: sumPoints(other), factors: other })

  return groups
}

function sumPoints(factors: readonly DiscoverScoreFactor[]): number {
  return factors.reduce((total, factor) => total + factor.points, 0)
}

/* ------------------------------------------------------------------ */
/*  Confiance dans la donnée                                           */
/* ------------------------------------------------------------------ */

type ConfidenceLevel = 'low' | 'medium' | 'high'

interface DataConfidence {
  level: ConfidenceLevel
  /** Signaux datés — le socle le plus fort. */
  datedSignals: number
  /** Champs de registre effectivement renseignés (sur 6). */
  registryFields: number
  /** Facteurs de score accompagnés de leur donnée brute. */
  factorsWithEvidence: number
}

const REGISTRY_FIELDS = ['nafCode', 'sector', 'city', 'department', 'headcountRange', 'creationDate'] as const

/**
 * Épaisseur de la donnée derrière le score.
 *
 * Deux candidats à 90/100 ne se valent pas : l'un peut s'appuyer sur trois
 * signaux datés et un registre complet, l'autre sur une simple correspondance
 * NAF. Le score dit « à quel point ça matche » ; ceci dit « à quel point on en
 * sait quelque chose ». Sans signal daté, on ne monte JAMAIS à `high` — quelle
 * que soit la complétude du registre, il manque le « pourquoi maintenant ».
 */
export function dataConfidenceFor(candidate: DiscoverCandidate): DataConfidence {
  const datedSignals = candidate.signals.length
  const registryFields = REGISTRY_FIELDS.filter(field => candidate[field] !== null).length
  const factorsWithEvidence = candidate.scoreFactors.filter(f => Boolean(f.evidence)).length

  const level: ConfidenceLevel =
    datedSignals >= 2 && registryFields >= 4
      ? 'high'
      : datedSignals === 0 && (registryFields <= 3 || factorsWithEvidence === 0)
        ? 'low'
        : 'medium'

  return { level, datedSignals, registryFields, factorsWithEvidence }
}
