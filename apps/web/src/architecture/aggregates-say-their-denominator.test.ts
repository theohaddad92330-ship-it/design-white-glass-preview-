/**
 * GA-71 — « calculé sur … » : un agrégat dit sur combien il est calculé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────
 * Tome 7, partie A, loi 2 « partout, sans exception », élément n°6 :
 * « **Complétude** — “calculé sur 62 % de tes données” — *à créer* — absent de
 * **tous les agrégats** ».
 *
 * C'est la version AFFICHABLE d'une doctrine que le produit tient déjà au
 * calcul : « un axe non évaluable sort du dénominateur, sinon le score mesure
 * la complétude de nos données », et « un taux sans dénominateur vaut `null`,
 * pas 0 % ». Un chiffre affiché sans dire sur combien il est calculé laisse
 * croire à une mesure complète — c'est le même défaut qu'un score nu, à
 * l'échelon de la POPULATION.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE — ET CE QU'ELLE NE SAIT PAS LIRE
 * ─────────────────────────────────────────────────────────────────────────
 * Elle vérifie QUATRE choses, toutes mécaniques :
 *   1. la primitive est MONTÉE, et le nombre d'écrans qui la portent ne
 *      redescend pas (cliquet, comme GA-18 / GA-19) ;
 *   2. les surfaces DÉCLARÉES la portent vraiment — et chaque chemin déclaré
 *      existe sur le disque (la leçon de GA-38 : un registre qui pointe dans le
 *      vide se déclare vert) ;
 *   3. personne ne recompose la phrase à la main : les libellés `completeness.*`
 *      n'appartiennent qu'à la primitive ;
 *   4. la dérivation vit à UN seul endroit (`deriveCompleteness`, dans
 *      `@bellum/contracts`) et la primitive ne la refait pas.
 *
 * Ce qu'elle NE vérifie PAS, et le dire vaut mieux qu'une garde approximative :
 * **elle ne sait pas reconnaître un agrégat dans du JSX.** Une moyenne, un taux
 * ou un compteur ne se distinguent d'un nombre quelconque par aucune expression
 * régulière honnête — c'est exactement ce que `placement-laws.test.ts` refuse de
 * faire pour les lois 2, 3 et 4. Un écran qui affiche un NOUVEL agrégat sans
 * complétude passera donc ici ; ce que la garde empêche, c'est qu'on la
 * DÉBRANCHE là où elle est posée, et qu'on la recopie à la main ailleurs.
 *
 * ⚠️ Numéro : le dépôt était monté à GA-67 au 29/08/2026. Plusieurs lots
 * écrivant en parallèle, une collision de numéro reste possible et se corrige
 * par un renommage, jamais par la suppression d'une garde.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const CONTRACTS_SRC = join(WEB_SRC, '..', '..', '..', 'packages', 'contracts', 'src')

/** La primitive, et son test — les deux seuls fichiers qui ont le droit de
 *  parler la langue de la complétude. */
const PRIMITIVE = join(WEB_SRC, 'components', 'primitives', 'Completeness.tsx')
const PRIMITIVE_TEST = join(WEB_SRC, 'components', 'primitives', 'Completeness.test.tsx')

/**
 * Les surfaces d'agrégat BRANCHÉES au 30/08/2026.
 *
 * Ce n'est pas la liste de tous les agrégats du produit — la garde ne sait pas
 * les reconnaître (voir le docblock). C'est la liste de ceux qu'on a montés, et
 * elle existe pour qu'aucun ne se débranche en silence. On l'ALLONGE en montant
 * la primitive ailleurs ; on n'en retire une ligne que si l'écran disparaît.
 */
const WIRED_SURFACES: readonly string[] = [
  // La chaîne commerciale : « calculé sur 5 maillons sur 8 ». Cet écran écrivait
  // sa propre phrase — le quatrième endroit du produit à recomposer l'idée.
  // Théo D (22/10/2026) : la chaîne est le corps de la section Cockpit (`CockpitBody`), plus de la page.
  join(WEB_SRC, 'features', 'pilotage', 'view', 'CockpitBody.tsx'),
  // ⚠️ RETIRÉE le 16/09/2026 (#2486) : `discover/view/TerritoryPanel.tsx`, le
  // référentiel ESN (« 312 entités résolues sur 477 »). Cette ligne gardait
  // EXACTEMENT ce panneau — déménagé de l'écran Territoire vers Découvrir le
  // 10/09 (#1796.2), puis retiré de Découvrir sur décision de Louis. C'est le
  // cas que le docblock prévoit (« on n'en retire une ligne que si l'écran
  // disparaît ») : l'écran a disparu, sa complétude n'a pas été débranchée
  // d'un écran qui reste.
  // Les ESN d'un territoire dans la veille de marché : « n résolues sur N ».
  // ⚠️ Cette ligne a REMPLACÉ `features/dashboard/components/KpiRow.tsx` le
  // 04/09/2026 (#1457). Cet écran-là n'a pas perdu sa complétude : il a
  // DISPARU — `KpiRow` n'était plus rendu que par l'onglet « Équipe » de
  // `/dashboard`, supprimé avec le second cockpit d'équipe qu'il portait. La
  // liste ne rétrécit donc pas : on y inscrit un montage réel jusque-là non
  // déclaré, ce qui est le sens du « on l'ALLONGE » ci-dessus.
  join(WEB_SRC, 'features', 'market-watch', 'view', 'MarketWatch.tsx'),
  // #1633 / #1635 — la couverture mémoire marché du PORTEFEUILLE : « 38 comptes
  // sur 62 ». Le bloc est monté sur DEUX écrans (`/pilotage/qualite` et
  // `/pilotage/marche`) mais il n'y a qu'un composant, donc qu'une ligne ici :
  // c'est tout l'objet du lot, un agrégat construit une fois et décliné.
  join(WEB_SRC, 'features', 'market-memory', 'view', 'MarketMemoryCoverageCard.tsx'),
  // #1635.4 — le fit structurel : « 22 recoupent sur 38 comptes couverts ». Sa
  // complétude est distincte de celle du bloc au-dessus, et c'est le point : son
  // dénominateur est les comptes COUVERTS, pas le portefeuille.
  join(WEB_SRC, 'features', 'market-memory', 'view', 'MarketStructuralFitCard.tsx'),
  // #1839 — « Disponibles maintenant » du vivier : « calculé sur 10 fiches du
  // vivier sur 30 ». Le chiffre était NU sous un compagnon qui disait ce qui
  // manquait sans dire sur quoi le nombre portait — « 0 sur les 10 mesurables »
  // est vrai, « 0 sur 30 » est faux, et c'est le second que l'œil lit. Son
  // dénominateur n'est pas le vivier entier mais les fiches dont la
  // disponibilité est DÉRIVABLE (une affectation enregistrée existe) : même
  // forme que le fit structurel ci-dessus, exclusion NOMMÉE comprise.
  join(WEB_SRC, 'features', 'consultants', 'view', 'TalentStatsBanner.tsx'),
]

/**
 * Le cliquet : combien d'écrans montent la primitive.
 *
 * 3 au 30/08/2026, 5 au 08/09/2026 (#1633 / #1635 — la couverture mémoire
 * marché du portefeuille et son fit structurel), 6 au 10/09/2026 (#1839 — la
 * disponibilité dérivée du vivier). Comme GA-18 et GA-19, ce n'est pas un budget à dépenser dans
 * l'autre sens : il MONTE quand on branche un agrégat de plus, il ne descend
 * jamais. Un écran qui perdrait sa complétude ferait tomber ce test.
 */
const COMPLETENESS_MOUNTS_AT_FREEZE = 6

/** Les racines où un écran vit — les mêmes que GA-18 / GA-19. */
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
 * Le dépôt a payé ce défaut trois fois — GA-08 sur une apostrophe, GA-25 sur un
 * `bounce: 0` qui DÉSACTIVE le rebond, GA-19 qui comptait ses propres docblocks.
 * Ici c'est encore plus net : le mot « complétude » et la phrase « calculé sur »
 * apparaissent forcément dans les commentaires des écrans branchés — sans ce
 * retrait, EXPLIQUER la règle la violerait.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Le MONTAGE réel de la primitive — commentaires retirés.
 *
 * ⚠️ MESURÉ le 10/09/2026 (#1839) : la détection lisait le fichier BRUT, donc
 * un écran qui se contentait d'EXPLIQUER la règle dans son docblock
 * (« `<Completeness>` est LA voix du dépôt pour “calculé sur …” ») se déclarait
 * monté. La preuve : le mount retiré du JSX de `TalentStatsBanner.tsx`, les dix
 * tests restaient VERTS. C'est la quatrième espèce de garde borgne du dépôt —
 * une garde qui lit le RÉCIT du défaut au lieu du code — et `stripComments`
 * existait déjà quinze lignes plus bas, pour la règle voisine.
 */
function mountsPrimitive(file: string): boolean {
  return stripComments(readFileSync(file, 'utf8')).includes('<Completeness')
}

const guardedFiles = GUARDED_ROOTS.flatMap(sourceFiles)

describe('GA-71 — la primitive de complétude est montée, et elle le reste', () => {
  const mounted = guardedFiles.filter(file => !file.includes('.test.') && mountsPrimitive(file))

  it('la garde LIT un corpus réel — sinon elle serait verte sur du vide', () => {
    // Le défaut de la première version de GA-26 : trois hooks surveillés qui
    // n'existaient nulle part, et un test vert sur rien.
    expect(guardedFiles.length).toBeGreaterThan(200)
    expect(existsSync(PRIMITIVE), 'la primitive de complétude a disparu').toBe(true)
    expect(COMPLETENESS_MOUNTS_AT_FREEZE).toBeGreaterThan(0)
  })

  it('le nombre d’écrans qui disent sur combien ils calculent ne redescend pas', () => {
    // Si ce test tombe : un agrégat vient de perdre son dénominateur, et le
    // chiffre qu'il affiche se relit désormais comme une mesure complète.
    expect(mounted.length).toBeGreaterThanOrEqual(COMPLETENESS_MOUNTS_AT_FREEZE)
  })
})

describe('GA-71 — les surfaces déclarées portent vraiment la primitive', () => {
  it('la liste des surfaces branchées n’est pas vide', () => {
    expect(WIRED_SURFACES.length).toBeGreaterThan(0)
  })

  it('chaque chemin déclaré EXISTE sur le disque', () => {
    // La leçon de GA-38 : un registre qui pointe dans le vide se déclare vert.
    // Un écran renommé sans que cette liste suive rendrait la garde aveugle.
    const missing = WIRED_SURFACES.filter(file => !existsSync(file))
    expect(missing).toEqual([])
  })

  it('chacune monte `<Completeness`', () => {
    const naked = WIRED_SURFACES.filter(file => !mountsPrimitive(file))
    expect(naked).toEqual([])
  })

  it('le détecteur de montage NE LIT PAS un commentaire — témoin négatif', () => {
    // Le défaut mesuré le 10/09/2026 : un docblock qui cite la primitive
    // suffisait à déclarer un écran monté. Une garde protège une règle, elle
    // ne l'invente pas — et elle ne se satisfait pas d'en parler.
    const onlyInAComment = `/** Cet écran devrait porter <Completeness ... /> */\nexport const Rien = () => null\n`
    // Le leurre vit HORS de src/ : écrit sous src/architecture, il était lu
    // par les gardes qui balaient src/ en parallèle (GA-35) puis disparaissait
    // sous leurs pieds — un rouge instable qui ne disait rien de l'écran.
    const dir = mkdtempSync(join(tmpdir(), 'ga71-'))
    const decoy = join(dir, '__ga71-decoy.tsx')
    writeFileSync(decoy, onlyInAComment, 'utf8')
    try {
      expect(mountsPrimitive(decoy)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * L'APPEL d'un libellé de complétude — `t('completeness.partial', …)`.
 *
 * ⚠️ Une FABRIQUE et non une constante : `RegExp.test()` avec le drapeau `g` est
 * STATEFUL (`lastIndex` survit d'un appel à l'autre), et une expression partagée
 * entre le filtre et le témoin rendrait un fichier sur deux « propre ». Ce piège
 * a déjà coûté une garde borgne dans ce dépôt.
 */
function COMPLETENESS_LABEL_CALL(flags = ''): RegExp {
  return new RegExp(
    // #1866 — `excludedHint` rejoint la liste : c'est le libellé du
    // déclencheur qui REPLIE le détail de l'exclusion. Sans lui dans
    // l'alternation, `excluded\b` ne l'attrape pas (`d` suivi de `H` n'est pas
    // une frontière de mot) et un écran pourrait recomposer l'affordance à la
    // main — le même défaut que les quatre phrases maison d'avant GA-71.
    String.raw`\bt\(\s*['"\x60]completeness\.(complete|partial|unknownTotal|nothingToCount|excludedHint|excluded)\b`,
    flags,
  )
}

describe('GA-71 — la phrase ne se recompose pas à la main', () => {
  /**
   * Le vrai défaut mesuré avant ce chantier : QUATRE écrans écrivaient leur
   * propre version de « calculé sur … », chacun avec ses règles de bord, et
   * aucun ne traitait le dénominateur NON LU. « Une dérivation vit à un seul
   * endroit — deux chemins qui la refont divergent. »
   *
   * Ce que la garde sait lire exactement : les libellés `completeness.*`
   * n'appartiennent qu'à la primitive. Un écran qui appellerait
   * `t('completeness.partial')` lui-même se ferait attraper ici.
   *
   * ⚠️ Le motif exige l'APPEL `t('…')` et non le seul nom (01/09/2026). Il
   * cherchait `completeness.partial` n'importe où, et attrapait donc un ACCÈS DE
   * PROPRIÉTÉ portant le même nom — `explanation.completeness.excluded`, sur un
   * objet du contrat qui n'a rien d'un libellé. Une garde protège une règle,
   * elle ne l'invente pas : celle-ci porte sur qui compose la PHRASE, pas sur
   * qui a le droit d'écrire le mot « completeness ».
   */
  const usesLabels = guardedFiles.filter(file => {
    if (file === PRIMITIVE || file === PRIMITIVE_TEST) return false
    return COMPLETENESS_LABEL_CALL().test(stripComments(readFileSync(file, 'utf8')))
  })

  it('aucun écran n’appelle les libellés de complétude directement', () => {
    expect(usesLabels).toEqual([])
  })

  it('le détecteur voit bien quelque chose — témoin positif sur la primitive elle-même', () => {
    // Sans ce témoin, une faute de frappe dans l'expression régulière rendrait
    // le test ci-dessus vert pour toujours. La primitive DOIT matcher.
    const source = stripComments(readFileSync(PRIMITIVE, 'utf8'))
    const hits = source.match(COMPLETENESS_LABEL_CALL('g')) ?? []
    // Six libellés : quatre verdicts, la ligne « hors du calcul », et
    // #1866 — l'indice du déclencheur qui la replie.
    expect(hits.length).toBe(6)
  })
})

describe('GA-71 — la dérivation vit à un seul endroit', () => {
  const contractFiles = sourceFiles(CONTRACTS_SRC)

  it('la garde atteint bien le paquet de contrats', () => {
    // Un chemin relatif faux ne produit pas d'erreur : il produit zéro fichier,
    // et les deux tests suivants passeraient au vert sans rien avoir lu.
    expect(contractFiles.length).toBeGreaterThan(50)
  })

  it('`deriveCompleteness` n’est DÉFINIE qu’une fois', () => {
    const definitions = contractFiles.filter(file =>
      /export function deriveCompleteness\b/.test(readFileSync(file, 'utf8')),
    )
    expect(definitions.length).toBe(1)
  })

  it('la primitive DÉLÈGUE le calcul, elle ne refait pas la part', () => {
    // Une part recalculée dans le JSX serait une seconde dérivation : les règles
    // de bord (dénominateur non lu, population vide, numérateur > dénominateur)
    // vivraient alors à deux endroits, et divergeraient au premier correctif
    // appliqué d'un seul côté.
    const source = stripComments(readFileSync(PRIMITIVE, 'utf8'))
    expect(source).toContain('deriveCompleteness')
    expect(source).not.toMatch(/\*\s*100/)
    expect(source).not.toMatch(/Math\.round/)
  })
})
