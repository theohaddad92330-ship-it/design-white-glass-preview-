/**
 * GA-80 / GA-81 — « recalculé à 06:12 » : un agrégat dit QUAND il a été calculé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────
 * Tome 7, partie A, loi 2 « partout, sans exception », élément n°10 :
 * « **Horodatage de calcul** — “recalculé à 06:12” — *à créer* — absent de
 * **tous les KPI et agrégats** ».
 *
 * C'est le JUMEAU de la complétude (GA-71) : « calculé sur 12 dossiers sur 43 »
 * répond à _sur quoi_, l'horodatage répond à _quand_. Les deux qualifient le
 * même chiffre et se posent au même endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES, DEUX NUMÉROS — ET LA SECONDE EST LA PLUS IMPORTANTE
 * ─────────────────────────────────────────────────────────────────────────
 * **GA-80 — l'horodatage vit à un seul endroit, et il est MONTÉ.** Mêmes quatre
 * vérifications que GA-71, pour la même raison : trois surfaces rendaient déjà
 * cette idée, chacune avec sa phrase et son formateur de date — dont un
 * verrouillé en français quelle que soit la langue de l'utilisateur.
 *
 * **GA-81 — une date de calcul ne s'INVENTE pas.** Il existe trois dates
 * voisines, et la troisième est la plus facile à afficher par erreur parce
 * qu'elle est toujours disponible :
 *   1. quand la donnée SOURCE a été observée → `Provenance` ;
 *   2. quand l'AGRÉGAT a été calculé → ce sujet ;
 *   3. quand l'ÉCRAN a chargé → `new Date()`, et ce n'est presque jamais
 *      l'information utile.
 * Un agrégat calculé à la volée a pour « date de calcul » l'instant de la
 * requête : l'afficher produit « il y a une seconde » à chaque rafraîchissement,
 * c'est-à-dire du bruit qui se fait passer pour de la traçabilité. Le refus vit
 * dans la dérivation (`deriveComputedAt` rend `live`, la primitive n'affiche
 * rien), et cette garde vérifie qu'aucun appelant ne le contourne en passant
 * lui-même l'instant présent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS LIRE — et le dire vaut mieux qu'une garde approximative
 * ─────────────────────────────────────────────────────────────────────────
 * **Elle ne sait pas reconnaître un agrégat dans du JSX** — exactement la limite
 * que GA-71 s'écrit à elle-même. Un écran qui afficherait un nouvel agrégat
 * stocké sans son horodatage passerait ici. Ce que la garde empêche, c'est qu'on
 * le DÉBRANCHE là où il est posé, qu'on recopie la phrase ailleurs, et qu'on
 * affiche l'heure de la requête à la place de la date de calcul.
 *
 * ⚠️ Numéros : GA-80 et GA-81 sont RÉSERVÉS à ce lot. Le dépôt était monté à
 * GA-75 au 30/08/2026. Une collision se corrige par un renommage, jamais par la
 * suppression d'une garde.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const CONTRACTS_SRC = join(WEB_SRC, '..', '..', '..', 'packages', 'contracts', 'src')

/** La primitive, et son test — les deux seuls fichiers qui ont le droit de
 *  parler la langue de l'horodatage de calcul. */
const PRIMITIVE = join(WEB_SRC, 'components', 'primitives', 'ComputedAt.tsx')
const PRIMITIVE_TEST = join(WEB_SRC, 'components', 'primitives', 'ComputedAt.test.tsx')

/** La dérivation — le seul endroit où vivent les règles de bord. */
const DERIVATION = join(CONTRACTS_SRC, 'schemas', 'computed-at.ts')

/**
 * Les surfaces BRANCHÉES au 30/08/2026 — celles dont le serveur sert une VRAIE
 * date de calcul.
 *
 * Ce n'est pas la liste de tous les agrégats du produit. C'est la liste de ceux
 * dont le « quand » existe et apprend quelque chose. On l'ALLONGE le jour où un
 * agrégat STOCKÉ de plus sert sa date ; on n'en retire une ligne que si l'écran
 * disparaît.
 *
 * ⚠️ Les sept écrans nommés par la mesure du 30/08 — `KpiRow`, `KpiStrip`,
 * `PilotagePage`, `DataQuality`, `KpiCataloguePanel`, `FinancePanel`,
 * `ContributionPanel` — n'y sont PAS, et c'est un résultat, pas un manque : ils
 * calculent tous leur chiffre à la volée, donc leur date de calcul est l'heure
 * de la requête. L'y poser aurait été le défaut que GA-81 interdit.
 */
const WIRED_SURFACES: readonly string[] = [
  // L'âge du plan de conquête : il est GÉNÉRÉ par une analyse, et sa date est
  // stockée (`accounts.last_analyzed_at`). Ce badge écrivait sa propre phrase.
  join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'plan', 'PlanFreshnessBadge.tsx'),
  // La date de RECALCUL d'un besoin, écrite par la matérialisation. Cette ligne
  // avait son propre formateur, avec ses propres options de format.
  join(WEB_SRC, 'features', 'projects', 'view', 'ProjectProvenanceLine.tsx'),
]

/**
 * Le cliquet : combien d'écrans montent la primitive.
 *
 * 2 au 30/08/2026. Comme GA-18, GA-19 et GA-71, ce n'est pas un budget à
 * dépenser dans l'autre sens : il MONTE, il ne redescend jamais.
 */
const COMPUTED_AT_MOUNTS_AT_FREEZE = 2

/** Les racines où un écran vit — les mêmes que GA-18 / GA-19 / GA-71. */
const GUARDED_ROOTS = [join(WEB_SRC, 'features'), join(WEB_SRC, 'components'), join(WEB_SRC, 'routes')]

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (entry === 'routeTree.gen.ts') continue
    out.push(full)
  }
  return out
}

/**
 * ⚠️ Les commentaires sont retirés AVANT tout comptage.
 *
 * Le dépôt a payé ce défaut quatre fois — GA-08 sur une apostrophe, GA-25 sur un
 * `bounce: 0`, GA-19 qui comptait ses propres docblocks, GA-71 dont la phrase
 * gardée apparaît forcément dans les commentaires des écrans branchés. Ici c'est
 * pire encore : le docblock de la primitive EXPLIQUE qu'il ne faut pas écrire
 * `at={new Date()}`, et sans ce retrait, l'expliquer serait le violer.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Le détecteur de GA-81 : un horodatage FABRIQUÉ sur place et passé à la
 * primitive.
 *
 * `at={new Date()}` et `at={Date.now()}` sont les deux façons d'écrire « l'heure
 * du chargement » ; `new Date(quelqueChose)` est légitime (on convertit une
 * valeur servie), donc la parenthèse doit être VIDE.
 */
const FABRICATED_INSTANT = /<ComputedAt[^>]*\bat=\{\s*(new\s+Date\(\s*\)|Date\.now\(\s*\))/

const guardedFiles = GUARDED_ROOTS.flatMap(sourceFiles)

describe('GA-80 — la primitive d’horodatage est montée, et elle le reste', () => {
  const mounted = guardedFiles.filter(
    file => !file.includes('.test.') && readFileSync(file, 'utf8').includes('<ComputedAt'),
  )

  it('la garde LIT un corpus réel — sinon elle serait verte sur du vide', () => {
    // Le défaut de la première version de GA-26 : trois hooks surveillés qui
    // n'existaient nulle part, et un test vert sur rien.
    expect(guardedFiles.length).toBeGreaterThan(200)
    expect(existsSync(PRIMITIVE), 'la primitive d’horodatage a disparu').toBe(true)
    expect(existsSync(DERIVATION), 'la dérivation d’horodatage a disparu').toBe(true)
    expect(COMPUTED_AT_MOUNTS_AT_FREEZE).toBeGreaterThan(0)
  })

  it('le nombre d’écrans qui disent QUAND ils ont calculé ne redescend pas', () => {
    // Si ce test tombe : un chiffre vient de perdre sa date de calcul, et il se
    // relit désormais comme un chiffre du jour.
    expect(mounted.length).toBeGreaterThanOrEqual(COMPUTED_AT_MOUNTS_AT_FREEZE)
  })
})

describe('GA-80 — les surfaces déclarées portent vraiment la primitive', () => {
  it('la liste des surfaces branchées n’est pas vide', () => {
    expect(WIRED_SURFACES.length).toBeGreaterThan(0)
  })

  it('chaque chemin déclaré EXISTE sur le disque', () => {
    // La leçon de GA-38 : un registre qui pointe dans le vide se déclare vert.
    const missing = WIRED_SURFACES.filter(file => !existsSync(file))
    expect(missing).toEqual([])
  })

  it('chacune monte `<ComputedAt`', () => {
    const naked = WIRED_SURFACES.filter(file => !readFileSync(file, 'utf8').includes('<ComputedAt'))
    expect(naked).toEqual([])
  })
})

describe('GA-80 — la phrase ne se recompose pas à la main', () => {
  /**
   * Le défaut mesuré avant ce lot : TROIS surfaces rendaient « quand ceci a été
   * calculé », chacune avec sa formulation et son formateur de date — et l'une
   * d'elles (`evidenceNote.ts`) passait par un helper verrouillé sur `fr`, si
   * bien qu'un utilisateur anglophone lisait la date en français.
   */
  const usesLabels = guardedFiles.filter(file => {
    if (file === PRIMITIVE || file === PRIMITIVE_TEST) return false
    return /computedAt\.(today|on|unknown)\b/.test(stripComments(readFileSync(file, 'utf8')))
  })

  it('aucun écran n’appelle les libellés d’horodatage directement', () => {
    expect(usesLabels).toEqual([])
  })

  it('le détecteur voit bien quelque chose — témoin positif sur la primitive elle-même', () => {
    // Sans ce témoin, une faute de frappe dans l'expression régulière rendrait
    // le test ci-dessus vert pour toujours.
    const source = stripComments(readFileSync(PRIMITIVE, 'utf8'))
    const hits = source.match(/computedAt\.(today|on|unknown)\b/g) ?? []
    // Cinq appels : « inconnue » deux fois (date absente, et date que le
    // formateur ne sait pas rendre), « aujourd'hui » et « le … », plus « aujourd'hui »
    // pour un instant PERSISTÉ lu comme `live` (#4289.8, `persisted`).
    expect(hits.length).toBe(5)
  })
})

describe('GA-80 — la dérivation vit à un seul endroit', () => {
  const contractFiles = sourceFiles(CONTRACTS_SRC)

  it('la garde atteint bien le paquet de contrats', () => {
    // Un chemin relatif faux ne produit pas d'erreur : il produit zéro fichier,
    // et les tests suivants passeraient au vert sans rien avoir lu.
    expect(contractFiles.length).toBeGreaterThan(50)
  })

  it('`deriveComputedAt` n’est DÉFINIE qu’une fois', () => {
    const definitions = contractFiles.filter(file =>
      /export function deriveComputedAt\b/.test(readFileSync(file, 'utf8')),
    )
    expect(definitions.length).toBe(1)
  })

  it('la primitive DÉLÈGUE le verdict, elle ne refait pas l’arithmétique du temps', () => {
    // Une comparaison de dates recalculée dans le JSX serait une seconde
    // dérivation : les règles de bord (indiscernable de la requête, date
    // future, même jour civil) vivraient à deux endroits et divergeraient au
    // premier correctif appliqué d'un seul côté.
    const source = stripComments(readFileSync(PRIMITIVE, 'utf8'))
    expect(source).toContain('deriveComputedAt')
    expect(source).not.toContain('getTime()')
    expect(source).not.toContain('COMPUTED_AT_LIVE_WINDOW_MS')
  })
})

describe('GA-81 — une date de calcul ne s’invente pas', () => {
  it('le détecteur d’instant fabriqué SAIT DIRE NON — témoin positif', () => {
    // Sans ce témoin, une expression régulière cassée rendrait le test suivant
    // vert pour toujours. Les deux formes fautives DOIVENT matcher, et les
    // formes légitimes ne doivent PAS.
    expect(FABRICATED_INSTANT.test('<ComputedAt at={new Date()} />')).toBe(true)
    expect(FABRICATED_INSTANT.test('<ComputedAt at={Date.now()} />')).toBe(true)
    expect(FABRICATED_INSTANT.test('<ComputedAt at={new Date(payload.computed_at)} />')).toBe(false)
    expect(FABRICATED_INSTANT.test('<ComputedAt at={snapshot.takenOn} />')).toBe(false)
  })

  it('aucun écran ne passe l’heure du CHARGEMENT comme date de calcul', () => {
    // Le piège central du sujet. « Il y a une seconde », à chaque
    // rafraîchissement, n'est pas une traçabilité : c'est un chiffre inventé,
    // et il est d'autant plus crédible qu'il a l'air précis.
    const faking = guardedFiles.filter(file => FABRICATED_INSTANT.test(stripComments(readFileSync(file, 'utf8'))))
    expect(faking).toEqual([])
  })

  it('la dérivation PORTE le refus, elle ne le délègue pas à la bonne volonté des écrans', () => {
    // Une règle qui ne vit que dans une revue de code n'existe pas. Le verdict
    // `live` est ce qui rend le défaut impossible, pas déconseillé.
    const source = stripComments(readFileSync(DERIVATION, 'utf8'))
    expect(source).toContain('COMPUTED_AT_LIVE_WINDOW_MS')
    expect(source).toMatch(/kind:\s*'live'/)
  })

  it('la primitive n’affiche RIEN sur un verdict `live`', () => {
    const source = stripComments(readFileSync(PRIMITIVE, 'utf8'))
    // #4289.8 — seul un instant PERSISTÉ (fait écrit en base, jamais l'heure de la requête) se dit sur un verdict
    // `live` ; sans `persisted`, la branche retombe sur `null`.
    expect(source).toMatch(/'live'[\s\S]{0,400}persisted\s*&&\s*at[\s\S]{0,300}:\s*null/)
    expect(source).toMatch(/persisted\s*=\s*false/)
  })

  it('une date de calcul INCONNUE se dit — elle ne devient pas « aujourd’hui »', () => {
    // « Non mesuré n'est jamais 0 », transposé au temps. Un verdict `unknown`
    // qui rendrait `null` laisserait le lecteur supposer une mesure du jour.
    const source = stripComments(readFileSync(PRIMITIVE, 'utf8'))
    expect(source).toMatch(/'unknown'[\s\S]{0,200}computedAt\.unknown/)
  })
})
