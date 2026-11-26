/**
 * GA-115 — `deriveOrgCoverage` a un appelant de PRODUCTION.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FAMILLE DE DÉFAUT N°1 DE CE DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────
 * « Du code juste, calculé, testé, que personne n'appelle. » Le 30/08/2026, une
 * recherche exhaustive sur `apps` + `packages` (hors `dist`) trouvait ONZE
 * occurrences de `deriveOrgCoverage` — **toutes dans des fichiers de test**. La
 * fonction était correcte, documentée, couverte ; l'écran, lui, refaisait le
 * calcul à la main, en moins bien, et affichait un compteur que le contrat
 * refuse de produire (voir GA-114).
 *
 * Une suite verte à 100 % ne dit rien de cela : les tests appelaient la bonne
 * fonction, et c'est précisément ce qui rendait la situation invisible. La seule
 * question qui l'aurait révélée est celle que cette garde pose — **qui l'appelle
 * en dehors des tests ?**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VÉRIFIE AUSSI QUEL FICHIER L'APPELLE
 * ─────────────────────────────────────────────────────────────────────────
 * « Au moins un appelant » se satisferait d'un `export` de commodité ou d'un
 * script. Ce qui doit être branché, c'est l'ÉCRAN — c'est lui qui mentait. La
 * garde nomme donc le fichier, et tombe s'il cesse d'appeler la dérivation.
 *
 * Les deux preuves exigées d'une garde :
 *  · elle LIT quelque chose → `describe('le corpus…')` vérifie que le balayage
 *    trouve des milliers de fichiers, la définition de la fonction, ET des
 *    fichiers de test (sans quoi le filtre « hors tests » ne filtrerait rien) ;
 *  · elle SAIT DIRE NON → `describe('le détecteur…')` lui soumet l'état RÉEL du
 *    dépôt au 30/08 — la fonction, ses trois fichiers de test, et rien d'autre —
 *    et vérifie qu'elle le refuse.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(__dirname, '../../../..')
const DERIVATION = 'deriveOrgCoverage'
/** Le fichier qui DÉFINIT la dérivation — s'appeler soi-même n'est pas être appelé. */
const DEFINITION = join('packages', 'contracts', 'src', 'schemas', 'org-graph.ts')
/** L'écran qui mentait, et qui doit rester branché. */
const BANNER = join('apps', 'web', 'src', 'features', 'accounts', 'view', 'account-detail')

/* ------------------------------------------------------------------ */
/*  Le balayage                                                        */
/* ------------------------------------------------------------------ */

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', '.claude'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let stats
    try {
      stats = statSync(full)
    } catch {
      continue // lien symbolique cassé — il n'a rien à dire sur les appelants
    }
    if (stats.isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = [join(REPO, 'apps'), join(REPO, 'packages')].flatMap(root => walk(root))

function isTest(path: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(path)
}

function calls(path: string): boolean {
  // L'appel, pas la mention : `deriveOrgCoverage(` et non le mot dans une phrase
  // de documentation. Un import sans appel ne branche rien.
  return new RegExp(`\\b${DERIVATION}\\s*\\(`).test(readFileSync(path, 'utf8'))
}

/**
 * Les appelants de PRODUCTION : ni les tests, ni le fichier qui la définit.
 *
 * ⚠️ Le fichier de définition est exclu par son CHEMIN et non par son nom :
 * `org-graph.ts` existe aussi ailleurs dans le dépôt, et exclure par nom aurait
 * silencieusement fait disparaître un vrai appelant du décompte.
 */
function productionCallers(paths: readonly string[]): string[] {
  return paths.filter(path => !isTest(path) && !path.endsWith(DEFINITION) && calls(path))
}

const CALLERS = productionCallers(FILES)

/* ------------------------------------------------------------------ */
/*  Les preuves                                                        */
/* ------------------------------------------------------------------ */

describe('GA-115 — le corpus, LU', () => {
  it('balaie un dépôt entier, pas un dossier vide', () => {
    expect(FILES.length).toBeGreaterThan(1000)
  })

  it('trouve le fichier qui DÉFINIT la dérivation', () => {
    const definition = FILES.filter(path => path.endsWith(DEFINITION))
    expect(definition).toHaveLength(1)
    expect(readFileSync(definition[0]!, 'utf8')).toContain(`export function ${DERIVATION}`)
  })

  it('trouve des fichiers de test — sinon le filtre « hors tests » ne filtre rien', () => {
    // Une garde dont le filtre ne filtre jamais est une garde qui compte tout et
    // se croit satisfaite. Ce test-là est ce qui empêche ce silence.
    const tests = FILES.filter(path => isTest(path) && calls(path))
    expect(tests.length).toBeGreaterThanOrEqual(3)
  })
})

describe('GA-115 — le détecteur SAIT DIRE NON', () => {
  it('refuse l’état RÉEL du dépôt au 30/08/2026 — onze occurrences, toutes des tests', () => {
    const avant = [
      join(REPO, DEFINITION),
      join(REPO, 'apps/api/src/modules/demo/demo-org-coverage.spec.ts'),
      join(REPO, 'apps/api/src/modules/org-graph/org-graph-coverage.spec.ts'),
      join(REPO, 'packages/contracts/src/schemas/org-graph-coverage.test.ts'),
    ]
    expect(productionCallers(avant)).toEqual([])
  })

  it('ne compte pas une simple MENTION du nom dans une phrase', () => {
    // `orgGraphData.ts` cite la dérivation en commentaire sans l'appeler : la
    // compter ferait passer une note de documentation pour un branchement.
    const mention = FILES.filter(path => {
      const src = readFileSync(path, 'utf8')
      return src.includes(DERIVATION) && !new RegExp(`\\b${DERIVATION}\\s*\\(`).test(src)
    })
    for (const path of mention) expect(CALLERS).not.toContain(path)
  })
})

describe('GA-115 — la dérivation est BRANCHÉE', () => {
  it('au moins un fichier de production l’appelle', () => {
    expect(CALLERS.length).toBeGreaterThanOrEqual(1)
  })

  it('et c’est l’écran du bandeau — celui qui refaisait le calcul à la main', () => {
    expect(CALLERS.some(path => path.includes(BANNER))).toBe(true)
  })
})
