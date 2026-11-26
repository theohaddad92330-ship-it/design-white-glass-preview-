import type { DiscoverCandidate, ScoreCriterion } from './discover-types'
import { parseHeadcountLabel, SCORE_CRITERIA } from './discover-types'
import { addressabilityRatio, classifyCardFact, decisiveSourceAxes, discoverRankRatio } from '@bellum/contracts'
import { groupScoreFactors, SCORE_BLOCKS } from './discover-score'
import { hasCommercialSignal } from './discover-known-signals'

/* ------------------------------------------------------------------ */
/*  Tri et sous-total « à fort potentiel ».                             */
/*                                                                     */
/*  Maquette p.20, en-tête de résultats : « 24 082 comptes trouvés ·    */
/*  dont 1 240 à fort potentiel · Trier par : Score global ».           */
/*                                                                     */
/*  Les deux ne reposent que sur des champs RÉELLEMENT présents dans la */
/*  réponse — `score`, `scoreMax`, `scoreUnmeasured`, `dataConfidence`, */
/*  `signals`. Aucun classement ne s'appuie sur une notion que le       */
/*  backend ne calcule pas.                                            */
/* ------------------------------------------------------------------ */

export const DISCOVER_SORTS = [
  'score',
  // Les deux tris du tome 1 §8.3. « score » reste l'INTÉRÊT — le renommer
  // casserait les liens déjà partagés, qui portent le tri en paramètre d'URL.
  'addressability',
  'balanced',
  'confidence',
  'signalRecency',
  // #3814.2 — effectif décroissant : sans secteur choisi, rien d'autre ne
  // distingue un grand compte d'une TPE pertinente pour les mêmes compétences.
  'headcount',
  'name',
] as const
export type DiscoverSort = (typeof DISCOVER_SORTS)[number]

/** Déduit du serveur (`DiscoverResponse.recommendedSort`, §8.3). */
type RecommendedSort = 'interest' | 'addressability' | 'balanced'

const RECOMMENDED_TO_SORT: Readonly<Record<RecommendedSort, DiscoverSort>> = {
  interest: 'score',
  addressability: 'addressability',
  balanced: 'balanced',
}

/**
 * Le tri par défaut de l'écran, avant tout choix de l'utilisateur.
 *
 * #3814.1 — aucun secteur choisi = recherche « tous secteurs », et le tri
 * proposé par le serveur (maturité déclarée de l'ESN, §8.3) classe alors par
 * intérêt ou adressabilité — deux mesures qui noient un grand compte pertinent
 * sous les TPE dès qu'aucun secteur ne les sépare déjà. La taille devient le
 * tri par défaut dans ce seul cas ; dès qu'un secteur est posé, le tri
 * recommandé par le serveur reprend la main, inchangé.
 */
export function defaultDiscoverSort(
  sectors: readonly string[],
  recommended: RecommendedSort | undefined,
): DiscoverSort {
  if (sectors.length === 0) return 'headcount'
  return RECOMMENDED_TO_SORT[recommended ?? 'interest']
}

/**
 * Part du score obtenue sur le maximum RÉELLEMENT mesurable, ou `null`.
 *
 * Comparer les scores bruts serait faux : `scoreMax` varie d'un candidat à
 * l'autre (les blocs sans donnée sortent du dénominateur), donc 63/80 vaut
 * mieux que 70/100. Un candidat sans score n'est pas ramené à 0 — « on n'a rien
 * pu mesurer » n'est pas « ce compte ne vaut rien ».
 */
export function scoreRatio(candidate: DiscoverCandidate): number | null {
  if (candidate.score === null || candidate.scoreMax === null || candidate.scoreMax <= 0) return null
  return candidate.score / candidate.scoreMax
}

/** Borne basse de l'effectif, ou `null` si `headcountRange` est absent,
 *  illisible, OU tranche « 0 salarié » (code INSEE « 00 »). « 1000+ » vaut
 *  1000 — cette borne SUFFIT à départager un ordre décroissant, les tranches
 *  du registre ne se chevauchant jamais.
 *
 *  #3814 — recette prod 08/10 (U 22edd95fe1) : « 0 salarié » est un code INSEE
 *  réel (une coquille, une holding sans personnel déclaré), pas un effectif
 *  MESURÉ au sens de ce tri — qui sert à faire remonter de VRAIS grands
 *  comptes. Le traiter comme un vrai zéro mesuré le class(ait) juste devant
 *  « inconnu », jamais derrière les tranches réellement peuplées (1-2, 3-5,
 *  …) une fois le signal commercial retiré du tri (ci-dessous) : la doctrine
 *  « non mesuré ≠ 0 » dit de le rejoindre dans le même panier de fin de tri. */
function headcountLow(candidate: DiscoverCandidate): number | null {
  const low = parseHeadcountLabel(candidate.headcountRange)?.[0] ?? null
  return low === 0 ? null : low
}

/** Date du signal le plus récent (ms), ou `null` si aucun signal lisible. */
function latestSignalMs(candidate: DiscoverCandidate): number | null {
  let latest: number | null = null
  for (const signal of candidate.signals) {
    const parsed = Date.parse(signal.date)
    if (Number.isNaN(parsed)) continue
    // #3819.9 — une date de DÉTECTION n'est jamais un « signal récent ».
    if (signal.dateIsDetection) continue
    if (latest === null || parsed > latest) latest = parsed
  }
  return latest
}

/* ------------------------------------------------------------------ */
/*  Fort potentiel                                                     */
/* ------------------------------------------------------------------ */

/** Part minimale du maximum mesurable pour parler de « fort potentiel ». */
export const HIGH_POTENTIAL_RATIO = 0.7

/**
 * Nombre minimal de blocs du barème effectivement évalués.
 *
 * Sans ce garde-fou, un candidat noté sur un seul critère (les autres sans
 * donnée) afficherait un ratio parfait et trusterait le sous-total : un « fort
 * potentiel » construit sur une seule mesure est un artefact de couverture, pas
 * un fait de marché.
 *
 * Le seuil est passé de 3 à 4 avec le barème p41, qui compte huit blocs au lieu
 * de cinq — dont un (l'accessibilité) jamais mesurable au stade registre. Rester
 * à 3 aurait laissé qualifier « fort potentiel » un candidat dont les cinq
 * huitièmes du barème sont muets.
 */
export const HIGH_POTENTIAL_MIN_MEASURED = 4

/**
 * « À fort potentiel » = au moins {@link HIGH_POTENTIAL_MIN_MEASURED} blocs du
 * barème mesurés ET au moins {@link HIGH_POTENTIAL_RATIO} du maximum mesurable.
 * Une règle, énoncée à l'écran — pas un classement maison invérifiable.
 */
export function isHighPotential(candidate: DiscoverCandidate): boolean {
  const measured = SCORE_CRITERIA.length - candidate.scoreUnmeasured.length
  if (measured < HIGH_POTENTIAL_MIN_MEASURED) return false
  const ratio = scoreRatio(candidate)
  return ratio !== null && ratio >= HIGH_POTENTIAL_RATIO
}

export function countHighPotential(candidates: readonly DiscoverCandidate[]): number {
  return candidates.reduce((total, candidate) => total + (isHighPotential(candidate) ? 1 : 0), 0)
}

/* ------------------------------------------------------------------ */
/*  Palier de fit NOMMÉ (maquette p.20)                                */
/* ------------------------------------------------------------------ */

const FIT_TIERS = ['high', 'medium', 'low'] as const
export type FitTier = (typeof FIT_TIERS)[number]

/**
 * Part minimale du maximum mesurable pour parler de « fit moyen ».
 *
 * Le palier « élevé » NE définit pas son propre seuil : il réutilise EXACTEMENT
 * {@link isHighPotential}. La carte (« Fit élevé ») et le sous-total de l'en-tête
 * (« dont N à fort potentiel ») désignent donc la MÊME population — une seule
 * règle, déjà énoncée à l'écran, plutôt que deux seuils maison à tenir en phase.
 */
export const FIT_MEDIUM_RATIO = 0.4

/**
 * Palier de fit NOMMÉ, dérivé du score déjà calculé — jamais une note inventée.
 *
 * `null` quand aucun critère n'était mesurable ({@link scoreRatio} `null`) :
 * « on n'a rien pu mesurer » n'est pas « fit faible », et les confondre est ce
 * qui affichait un mauvais palier sur toute une liste sans donnée.
 */
export function fitTierFor(candidate: DiscoverCandidate): FitTier | null {
  const ratio = scoreRatio(candidate)
  if (ratio === null) return null
  if (isHighPotential(candidate)) return 'high'
  if (ratio >= FIT_MEDIUM_RATIO) return 'medium'
  return 'low'
}

/* ------------------------------------------------------------------ */
/*  Axes du fit NOMMÉS (archive-05, item 15 — T5.md:1066-1088).         */
/*                                                                     */
/*  La source demande cinq axes pondérés : Sujets 30 · Maturité 25 ·    */
/*  Mission 20 · Précédent 15 · Appétence 10. L'arbitrage T5-B refuse    */
/*  un SECOND score de fit (deux nombres divergeraient au premier       */
/*  ajustement) — `fitTierFor` reste donc inchangé, seul juge du        */
/*  palier. Mais refuser le second NOMBRE n'autorisait pas à perdre les */
/*  AXES : « un score n'est jamais nu, ses axes nommés ». Ce module ne  */
/*  recalcule rien (GA-26) — il RÉUTILISE `scoreFactors`/`scoreUnmeasured` */
/*  (déjà calculés côté backend, déjà groupés par `groupScoreFactors`)  */
/*  et `portfolioState` (résolu côté API), et NOMME les deux axes que   */
/*  rien, dans Découvrir, ne mesure encore.                             */
/* ------------------------------------------------------------------ */

export const FIT_AXES = ['subjects', 'maturity', 'mission', 'precedent', 'appetite'] as const
type FitAxisKey = (typeof FIT_AXES)[number]

/** Le poids demandé par la source, pour chaque axe. */
const FIT_AXIS_MAX: Record<FitAxisKey, number> = {
  subjects: 30,
  maturity: 25,
  mission: 20,
  precedent: 15,
  appetite: 10,
}

/**
 * Pourquoi un axe n'a pas pu être évalué — un CODE, traduit côté écran.
 *
 *  - `block_unmeasured` : le bloc backend qui alimente cet axe existe, mais
 *    n'a pas été évalué SUR CE COMPTE (il est dans `scoreUnmeasured`).
 *  - `not_tracked` : aucune source ne mesure cet axe au stade Découvrir,
 *    quel que soit le compte — structurel, pas une lacune de CE candidat.
 */
type FitAxisUnmeasuredReason = 'block_unmeasured' | 'not_tracked'

export interface FitAxisResult {
  key: FitAxisKey
  /** Points ramenés sur `max`. `null` = non évaluable — SORT du dénominateur,
   *  ne se remplit jamais d'une valeur plausible. */
  score: number | null
  /** Le poids demandé par la source pour cet axe (constant, quel que soit le
   *  candidat — c'est `score`, pas `max`, qui varie). */
  max: number
  /** Présent seulement quand `score` est `null`. */
  reason?: FitAxisUnmeasuredReason
}

interface FitAxesBreakdown {
  /** Toujours les cinq, dans l'ordre de la source. Un axe non évaluable est
   *  NOMMÉ ici, jamais simplement absent du tableau. */
  axes: FitAxisResult[]
  /** Somme des seuls axes MESURÉS. `null` sous {@link FIT_AXES_MIN_MEASURED}
   *  axes mesurés : en dessous, il n'y a pas de score — seulement des axes
   *  nommés, comme un score bâti sur un ou deux axes sur cinq mesurerait la
   *  complétude de nos données plutôt que le compte. */
  score: number | null
  /** Somme des poids des seuls axes mesurés. `null` avec `score`. */
  max: number | null
  measuredCount: number
}

/** Sous ce nombre d'axes mesurés, il n'y a pas de score. Même logique que
 *  {@link HIGH_POTENTIAL_MIN_MEASURED} : un ratio flatteur bâti sur trop peu
 *  de mesures n'est pas un ratio, c'est un artefact de couverture. */
export const FIT_AXES_MIN_MEASURED = 3

/**
 * Bloc backend qui alimente chaque axe DYNAMIQUE (mesuré compte par compte).
 *
 * Seuls deux des cinq axes ont un correspondant déjà calculé et honnête dans
 * le score d'intérêt (`SCORE_CRITERIA`, huit blocs) :
 *
 *  - **Sujets** ≡ le bloc `signals` — appels d'offres, marchés attribués,
 *    recrutements, signaux techniques DATÉS : ce qui est concrètement en
 *    cours chez le compte, au sens le plus littéral de « sujets ».
 *  - **Maturité** ≡ le bloc `it_surface` — l'empreinte IT du compte, déjà
 *    mesurée par le backend.
 *
 * Les trois autres (`headcount`, `geography`, `age`, `activity`,
 * `accessibility`, `evidence`) ne correspondent à AUCUN des cinq axes de la
 * source par leur sens réel — les y rattacher aurait été une correspondance
 * inventée, pas une mesure. Ils restent dans le score d'intérêt existant et
 * ne sont pas dupliqués ici.
 */
const DYNAMIC_AXIS_BLOCK: Partial<Record<FitAxisKey, ScoreCriterion>> = {
  subjects: 'signals',
  maturity: 'it_surface',
}

/**
 * Points du bloc backend `block`, ramenés sur `axisMax` — ou `null` si le
 * backend n'a pas évalué ce bloc SUR CE COMPTE.
 *
 * Une mise à l'échelle, pas une nouvelle mesure : le ratio réel ne change
 * pas, seul le dénominateur affiché change — exactement comme `scoreRatio`
 * compare déjà des `scoreMax` qui varient d'un candidat à l'autre. Un bloc
 * mesuré à zéro reste `0`, jamais `null` : `groupScoreFactors` est appelé
 * avec `[block]` en `measured` précisément pour ça (même convention que
 * `CandidateScore`, qui l'utilise déjà).
 */
function rescaledBlockAxis(candidate: DiscoverCandidate, block: ScoreCriterion, axisMax: number): number | null {
  if (candidate.scoreUnmeasured.includes(block)) return null
  const backendMax = SCORE_BLOCKS.find(b => b.key === block)?.max
  if (!backendMax) return null
  const points = groupScoreFactors(candidate.scoreFactors, [block]).find(g => g.key === block)?.points ?? 0
  return Math.round((points / backendMax) * axisMax)
}

/**
 * Décompose le fit sur les cinq axes NOMMÉS par la source, honnêtement.
 *
 * Ce que Découvrir permet RÉELLEMENT de mesurer aujourd'hui :
 *
 *  - **Sujets** (30) et **Maturité** (25) — les blocs `signals` et
 *    `it_surface` du score d'intérêt, ramenés sur le poids de la source.
 *  - **Précédent** (15) — `portfolioState`, résolu côté API et JAMAIS
 *    deviné : le compte est-il DÉJÀ client ? C'est le seul fait du contrat
 *    qui parle d'un historique — toujours connu (jamais `null`), donc
 *    toujours mesuré : `customer` vaut le plein poids, tout autre état vaut
 *    zéro (« pas encore », pas « inconnu »).
 *  - **Mission** (20, taille de mission potentielle) et **Appétence** (10,
 *    propension à l'externe) — AUCUNE source ne les mesure au stade
 *    Découvrir : pas de besoin identifié, donc pas de taille de mission ; pas
 *    de signal qui distingue « ouvert à l'externe » de « recrute en interne ».
 *    Les remplir d'une valeur plausible (ex. l'effectif comme proxy de taille
 *    de mission) est exactement ce que la doctrine interdit. Ils sortent du
 *    dénominateur, nommés avec leur raison — pas simplement absents.
 *
 * D'où, dans le cas courant, trois axes mesurés sur cinq — honnêtement, pas
 * cinq inventés. Sous {@link FIT_AXES_MIN_MEASURED} (un compte dont le score
 * d'intérêt n'a quasiment rien pu évaluer), il n'y a pas de score : seuls les
 * cinq axes NOMMÉS restent.
 */
export function fitAxesFor(candidate: DiscoverCandidate): FitAxesBreakdown {
  const axes: FitAxisResult[] = FIT_AXES.map(key => {
    const max = FIT_AXIS_MAX[key]

    if (key === 'precedent') {
      return { key, max, score: candidate.portfolioState === 'customer' ? max : 0 }
    }

    const block = DYNAMIC_AXIS_BLOCK[key]
    if (block) {
      const score = rescaledBlockAxis(candidate, block, max)
      return score === null ? { key, max, score: null, reason: 'block_unmeasured' } : { key, max, score }
    }

    // 'mission' et 'appetite' : rien, dans Découvrir, ne les mesure.
    return { key, max, score: null, reason: 'not_tracked' }
  })

  const measured = axes.filter(axis => axis.score !== null)
  const measuredCount = measured.length
  const enough = measuredCount >= FIT_AXES_MIN_MEASURED

  return {
    axes,
    score: enough ? measured.reduce((total, axis) => total + (axis.score ?? 0), 0) : null,
    max: enough ? measured.reduce((total, axis) => total + axis.max, 0) : null,
    measuredCount,
  }
}

/* ------------------------------------------------------------------ */
/*  Tri                                                                */
/* ------------------------------------------------------------------ */

/** `null` en dernier, quel que soit l'ordre demandé : « inconnu » n'est pas « nul ». */
function byNullableDesc(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

/**
 * Trie une liste de candidats. Renvoie toujours un NOUVEAU tableau et ne
 * retire jamais personne : un tri qui filtre en douce est un mensonge sur le
 * nombre de résultats affiché juste au-dessus.
 *
 * L'égalité retombe sur le nom, pour que deux rendus successifs de la même
 * réponse donnent le même ordre.
 */
/**
 * Intérêt × adressabilité, le tri « équilibré ».
 *
 * Un PRODUIT, jamais une moyenne : la moyenne rattrape un compte parfait et
 * verrouillé par sa moitié forte, et c'est exactement le compte qu'on ne veut
 * plus voir en tête de liste. `null` dès qu'un des deux facteurs manque —
 * « je ne sais pas » ne se classe pas devant « je sais que c'est bon ».
 */
export function balancedRatio(candidate: DiscoverCandidate): number | null {
  // #4067 — l'intérêt compte aussi ce que l'espace sait déjà (sources mesurées).
  const interest = discoverRankRatio(candidate)
  const access = addressabilityRatio(candidate.addressability)
  if (interest === null || access === null) return null
  return interest * access
}

/** #4045 — un compte dont AU MOINS un signal recoupe le mot-clé (drapeau posé par le serveur, un seul lexique). */
function matchesKeyword(candidate: DiscoverCandidate, keyword: string): boolean {
  return candidate.signals.some(signal => signal.keywordMatch === true) || keywordNamesEmployer(candidate.name, keyword)
}

const foldKeyword = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * #3915.42 — le mot-clé NOMME l'employeur : chaque terme (séparés par virgule) dont TOUS les mots figurent dans
 * le nom du compte, accents et casse ignorés. « Renault » recoupe Renault ET Renault Trucks (employeurs
 * distincts, deux cartes) ; « Renault Trucks » ne recoupe que le second.
 */
function keywordNamesEmployer(name: string, keyword: string): boolean {
  const nameWords = new Set(foldKeyword(name).split(' ').filter(Boolean))
  if (nameWords.size === 0) return false
  return keyword.split(',').some(term => {
    const words = foldKeyword(term).split(' ').filter(Boolean)
    return words.length > 0 && words.every(word => nameWords.has(word))
  })
}

/**
 * #4045 (recette prod 13/10) — le mot-clé saisi mais qu'AUCUN signal des résultats ne mentionne : l'écran
 * le DIT au lieu d'un ordre inchangé muet. `null` : pas de mot-clé, pas de résultat, ou au moins un
 * signal correspond (l'ordre a bougé, il se voit).
 */
export function keywordMatchNotice(
  candidates: readonly DiscoverCandidate[],
  keyword: string,
): { keyword: string } | null {
  if (candidates.length === 0) return null
  const terms = keyword
    .split(/[,;]+/)
    .map(term => term.trim())
    .filter(Boolean)
  if (terms.length === 0) return null
  // #4419 — un compte TROUVÉ par ses offres (`skillEvidence`) est « mentionné » : sa preuve est l'offre, pas un
  // signal. Le drapeau serveur `keywordMatch` ne dit pas QUEL terme a recoupé : il couvre la saisie entière.
  if (
    candidates.some(
      c => (c.skillEvidence != null && c.skillEvidence.offerCount > 0) || c.signals.some(s => s.keywordMatch === true),
    )
  ) {
    return null
  }
  // Le message ne nomme que les termes réellement sans résultat, jamais la chaîne brute.
  const missing = terms.filter(term => !candidates.some(c => keywordNamesEmployer(c.name, term)))
  return missing.length === 0 ? null : { keyword: missing.join(', ') }
}

/**
 * #3819.9 (Louis 15/10) — « sans signal récent » : ni signal DATÉ (une date propre, pas la seule date
 * de première détection) ni source mesurée. Ce sont ceux que les tris Score / Fraîcheur rangent en bas.
 */
export function lacksDatedSignal(c: DiscoverCandidate): boolean {
  // Pas d'exemption « source mesurée » : une carte au-dessus du séparateur MONTRE une date de signal.
  return !c.signals.some(s => !s.dateIsDetection && Number.isFinite(Date.parse(s.date)))
}

/**
 * V4-CORRECTIFS-C 4284.15 — « sans signal récent » AFFICHÉ : `lacksDatedSignal` compte un acte juridique, un stage ou
 * un fait trop ancien comme « daté » (utile aux paliers de tri), mais la carte ne les montre pas. Le séparateur et la
 * partition se posent sur ce que la CARTE montre (`classifyCardFact`, GA-26), sinon onze cartes sans signal visible
 * passaient au-dessus (recette prod 20/10).
 */
export function lacksShownDatedSignal(c: DiscoverCandidate): boolean {
  const now = new Date()
  return !c.signals.some(
    s =>
      !s.dateIsDetection &&
      Number.isFinite(Date.parse(s.date)) &&
      classifyCardFact(
        { type: s.type, label: s.label, date: s.date, ...(s.fromSpace ? { fromSpace: true } : {}) },
        { now, companyName: c.name },
      ).tier !== 'off',
  )
}

/**
 * #4284.15 (#3819.9) — toute re-rangée APRÈS le tri (ex. « comptes qui recrutent » par domaine déclaré) défait la
 * partition par date : des cartes sans signal daté se retrouvaient au-dessus du séparateur (recette prod : cartes
 * 15-20). Cette passe STABLE remet les comptes à signal daté d'abord ; l'ordre dans chaque partie est conservé.
 *
 * ⚠️⚠️ RENVERSEMENT ASSUMÉ ET DATÉ — décision Louis 21/10/2026 : elle vaut pour TOUS les tris, y compris Taille
 * (défaut sans secteur), Intérêt et un tri choisi à la main. Elle renverse #3941.4 (17/10, « un tri choisi prime :
 * séparateur réservé au tri par défaut »). Raison : le séparateur dit où finissent les comptes qu'on SAIT actifs ;
 * un tri choisi ne change pas ce que l'écran sait.
 */
export function keepUndatedBelow<T extends DiscoverCandidate>(list: readonly T[]): T[] {
  return [...list.filter(c => !lacksShownDatedSignal(c)), ...list.filter(lacksShownDatedSignal)]
}

/**
 * Lot T point 4 (recette prod 01/11) — un compte sans NAF ou sans SIREN n'est pas VÉRIFIÉ au registre : il passe
 * APRÈS les autres QUEL QUE SOIT le tri choisi (Taille, score…), jamais mêlé à la liste (rangs 2, 3, 6, 8, 9, 11).
 * Partition STABLE, dernière passe : l'ordre de chaque moitié est celui du tri. Rien n'est retiré.
 */
export function lacksRegistryIdentity(c: Pick<DiscoverCandidate, 'siren' | 'nafCode'>): boolean {
  return !c.siren?.trim() || !c.nafCode?.trim()
}

export function verifiedFirst<T extends DiscoverCandidate>(list: readonly T[]): T[] {
  return [...list.filter(c => !lacksRegistryIdentity(c)), ...list.filter(lacksRegistryIdentity)]
}

/**
 * #3819.9 — index du premier compte « sans signal récent » d'une liste DÉJÀ partitionnée, là où la vue pose le
 * séparateur, sous TOUS les tris (#4284.15, Louis 21/10 : renverse #3941.4). -1 : rien au-dessus ou rien en dessous.
 */
export function undatedSeparatorIndex(sorted: readonly DiscoverCandidate[]): number {
  const at = sorted.findIndex(lacksShownDatedSignal)
  return at > 0 ? at : -1
}

export function sortCandidates(
  candidates: readonly DiscoverCandidate[],
  sort: DiscoverSort,
  options: { keyword?: string; explicit?: boolean } = {},
): DiscoverCandidate[] {
  const byName = (a: DiscoverCandidate, b: DiscoverCandidate) => a.name.localeCompare(b.name, 'fr')
  const keyword = options.keyword?.trim() ?? ''
  const boostKeyword = sort !== 'name' && keyword !== ''

  // #3941.4 (Louis 17/10) — `explicit` : l'utilisateur a CHOISI ce tri ; il prime sur les PALIERS commerciaux
  // (palier « aucun signal » de Taille…). ⚠️ #4284.15 (Louis 21/10) RENVERSE le reste : la partition par date et le
  // séparateur « Sans signal récent » valent pour TOUS les tris, tri choisi compris.
  const explicit = options.explicit === true
  return [...candidates].sort((a, b) => {
    // #3819.9 — d'abord les comptes à signal daté (au-dessus du séparateur), puis le tri dans chaque partie.
    const byDated = Number(lacksShownDatedSignal(a)) - Number(lacksShownDatedSignal(b))
    if (byDated !== 0) return byDated
    // #4045 — le mot-clé RECLASSE : un signal qui le recoupe (recrutement, projet…) passe en tête,
    // avant le palier commercial ; le critère choisi départage ensuite.
    if (boostKeyword) {
      const byKeyword = Number(matchesKeyword(b, keyword)) - Number(matchesKeyword(a, keyword))
      if (byKeyword !== 0) return byKeyword
    }
    // #3819 (démo Ludovic 08/10) — une entreprise qui porte un signal COMMERCIAL
    // (AO, recrutement, projet, levée…) passe devant celle dont le seul signal
    // est la vie juridique, ou qui n'en a aucun. Le critère choisi départage
    // ENSUITE. Le tri alphabétique reste ce qu'il annonce.
    //
    // #3814 — recette prod 08/10 (U 22edd95fe1) : « Taille (effectif) » en est
    // exclu aussi. C'est un tri NUMÉRIQUE explicite (« le plus grand devant »,
    // pas « le plus pertinent devant ») — un signal commercial y faisait
    // remonter une coquille à 0 salarié devant une tranche 20-49 bien réelle,
    // ce que le contrôle de tri affiche et que la recette a observé. Les tris
    // de PERTINENCE (score, adressabilité, équilibré, confiance, fraîcheur)
    // gardent la priorité commerciale ; celui-ci promet un ordre de taille, et
    // rien d'autre.
    //
    // #3819.4 (ajout bêta 08/10, second bêta-testeur, L04/L05) — un compte SANS
    // AUCUN signal (sélectionné sur le profil, pas sur une raison datée) classe
    // en plus APRÈS tout compte qui porte au moins un signal, même la seule vie
    // juridique : avoir une raison — fût-elle secondaire — prime sur n'en avoir
    // aucune. Trois paliers, pas deux : commercial · légal seul · aucun.
    // #3819 (Louis 10/10, revient sur #3814) — en « Taille », seul le palier
    // « aucun signal » passe en dernier ; l'effectif ordonne dans chaque groupe.
    if (sort === 'headcount') {
      if (!explicit) {
        const none = (c: DiscoverCandidate) => (c.signals.length === 0 ? 1 : 0)
        const byNone = none(a) - none(b)
        if (byNone !== 0) return byNone
      }
    } else if (sort !== 'name' && !explicit) {
      // #4067 — ce que l'espace SAIT déjà (un signal ancien, une affaire, un
      // document…) est une raison, secondaire comme la vie juridique : il passe
      // le compte du palier « aucune raison » au palier intermédiaire.
      const tier = (c: DiscoverCandidate) =>
        hasCommercialSignal(c) ? 0 : !lacksDatedSignal(c) || decisiveSourceAxes(c.sourceAxes).length > 0 ? 1 : 2
      const byTier = tier(a) - tier(b)
      if (byTier !== 0) return byTier
    }
    switch (sort) {
      case 'score':
        // #4067 — le rang ajoute les sources MESURÉES (points ET plafond) ; sans
        // elles, `discoverRankRatio` vaut exactement `scoreRatio`.
        return byNullableDesc(discoverRankRatio(a), discoverRankRatio(b)) || byName(a, b)
      case 'addressability':
        return (
          byNullableDesc(addressabilityRatio(a.addressability), addressabilityRatio(b.addressability)) || byName(a, b)
        )
      case 'balanced':
        // Le PRODUIT des deux, et non leur moyenne : un compte parfait mais
        // inatteignable doit tomber, pas se faire rattraper par sa moitié
        // forte. Un facteur inconnu rend `null` — « je ne sais pas » ne se
        // classe pas devant « je sais que c'est bon ».
        return byNullableDesc(balancedRatio(a), balancedRatio(b)) || byName(a, b)
      case 'confidence':
        return byNullableDesc(a.dataConfidence, b.dataConfidence) || byName(a, b)
      case 'signalRecency':
        return byNullableDesc(latestSignalMs(a), latestSignalMs(b)) || byName(a, b)
      case 'headcount':
        return byNullableDesc(headcountLow(a), headcountLow(b)) || byName(a, b)
      case 'name':
        return byName(a, b)
    }
  })
}
