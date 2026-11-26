import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS, resolveMarketMemoryGroundTruthMetric } from '@bellum/contracts'

/**
 * GA-285 — #1622 — UNE MÉTRIQUE DE VÉRITÉ TERRAIN NE SE DIVISE QU'À UN SEUL
 * ENDROIT, ET JAMAIS SOUS LE SEUIL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les six métriques du jeu de vérité terrain (#1622) n'ont AUCUN sens sur un
 * corpus trop petit : `0.0 %` de faux positifs sur zéro jugement se lit « tout
 * va bien » et veut dire « personne n'a regardé ». La seule fonction autorisée
 * à transformer un compte `{ qualifying, total }` en pourcentage est
 * `resolveMarketMemoryGroundTruthMetric` (`@bellum/contracts`), qui refuse de
 * rendre une `value` sous {@link MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS}
 * jugements. Un second calcul, écrit à la main ailleurs (`qualifying / total`),
 * contournerait le seuil sans jamais toucher au fichier que cette garde lit —
 * exactement le défaut que #1621 documente pour la mémoire marché elle-même
 * (« deux dérivations qui divergent »), appliqué à ses propres métriques
 * d'évaluation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX PREUVES, PAS UNE SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Une preuve de COMPORTEMENT sur la fonction réelle : le corpus vide, le
 *    corpus juste sous le seuil, et le corpus au-dessus, contre la fonction
 *    RÉELLEMENT IMPORTÉE de `@bellum/contracts` (pas une copie recollée ici,
 *    qui prouverait seulement qu'une copie fonctionne).
 * 2. Une preuve DE SOURCE : aucun fichier du dépôt, hors de
 *    `resolveMarketMemoryGroundTruthMetric` lui-même, ne recalcule
 *    `qualifying / total` à la main pour une métrique de vérité terrain. Sans
 *    elle, la preuve 1 resterait vraie pendant qu'un second calcul, ailleurs,
 *    la contournerait complètement — « du code juste que personne ne
 *    contourne » n'est une garantie que si RIEN d'autre ne recalcule le fait.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const RESOLVER_FILE = join(REPO_ROOT, 'packages/contracts/src/schemas/market-memory-ground-truth.ts')
const METRICS_FILE = join(
  REPO_ROOT,
  'apps/api/src/modules/market-memory-ground-truth/market-memory-ground-truth-metrics.ts',
)

/** Le SEUL fichier où `qualifying / total` a le droit d'apparaître en code
 *  (hors commentaire) : c'est la définition même de la fonction protégée. */
const ALLOWED_DIVISION_FILE = RESOLVER_FILE

/** Retire les commentaires AVANT lecture — une docstring qui NOMME le motif
 *  interdit (comme celle de `market-memory-ground-truth-metrics.ts`, qui
 *  avertit justement de ne jamais l'écrire) ne doit pas se faire piéger par sa
 *  propre mise en garde. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Le motif d'une division brute `qualifying / total` (espaces et qualification
 *  d'objet tolérés : `counts.qualifying / counts.total`, `x.qualifying/y.total`). */
const RAW_DIVISION_PATTERN = /\bqualifying\s*\/\s*[\w.]*\btotal\b/

function findRawMetricDivision(source: string): string | null {
  const match = stripComments(source).match(RAW_DIVISION_PATTERN)
  return match ? match[0] : null
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (entry.endsWith('.spec.ts') || entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue
    out.push(full)
  }
  return out
}

/** Tout le dépôt applicatif, moins le fichier explicitement autorisé à
 *  diviser. C'est délibérément LARGE (api + dashboard-manager + contracts) :
 *  le défaut que cette garde cible peut apparaître n'importe où, y compris
 *  dans un futur écran qui recalculerait « pour faire vite ». */
function candidateFiles(): string[] {
  return [
    ...sourceFiles(join(REPO_ROOT, 'apps/api/src')),
    ...sourceFiles(join(REPO_ROOT, 'apps/dashboard-manager/src')),
    ...sourceFiles(join(REPO_ROOT, 'packages/contracts/src')),
  ].filter(file => file !== ALLOWED_DIVISION_FILE)
}

describe('GA-285 — une métrique de vérité terrain ne se divise jamais sous le seuil', () => {
  describe('preuve de comportement — la fonction RÉELLE, importée telle quelle', () => {
    it('un corpus VIDE ne rend jamais un pourcentage', () => {
      const result = resolveMarketMemoryGroundTruthMetric({ qualifying: 0, total: 0 })
      expect(result.status).toBe('insufficient_data')
      expect('value' in result).toBe(false)
    })

    it('juste sous le seuil nommé, toujours non mesuré', () => {
      const result = resolveMarketMemoryGroundTruthMetric({
        qualifying: 3,
        total: MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS - 1,
      })
      expect(result.status).toBe('insufficient_data')
    })

    it('au seuil, la mesure apparaît enfin — la garde ne bloque pas ce qu’elle doit laisser passer', () => {
      const result = resolveMarketMemoryGroundTruthMetric({
        qualifying: 4,
        total: MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS,
      })
      expect(result).toEqual({
        status: 'measured',
        value: 0.2,
        judgmentsCount: MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS,
      })
    })
  })

  describe('preuve de source — aucun second calcul, nulle part', () => {
    it('lit un corpus non vide (api + dashboard-manager + contracts, hors le fichier autorisé)', () => {
      const files = candidateFiles()
      expect(files.length).toBeGreaterThan(500)
      expect(files.some(file => file === METRICS_FILE)).toBe(true)
    })

    it('SAIT DIRE NON — un calcul fautif écrit à la main est détecté par le motif', () => {
      const fautif = `
        function computeFalsePositiveRateTheWrongWay(counts: { qualifying: number; total: number }) {
          // Personne ne relit le seuil ici : c'est exactement le contournement visé.
          return counts.qualifying / counts.total
        }
      `
      expect(findRawMetricDivision(fautif)).not.toBeNull()
    })

    it('SAIT DIRE NON, sur le VRAI fichier — une régression simulée par substitution textuelle est détectée', () => {
      // Preuve la plus forte : pas une fabrication en l'air, le VRAI fichier
      // protégé (`market-memory-ground-truth-metrics.ts`), avec UN de ses
      // six appels sûrs remplacé par le calcul à la main qu'il est censé
      // éviter. Si ce test se met à échouer, c'est que le fichier réel a
      // changé de forme au point que la garde ne sait plus le lire — pas que
      // la protection a cessé d'avoir un sens.
      const real = readFileSync(METRICS_FILE, 'utf8')
      const safeCall =
        "resolveMarketMemoryGroundTruthMetric({\n      qualifying: countByLabel(rows, 'wrong_entity'),\n      total,\n    })"
      expect(real).toContain(safeCall)
      const regressed = real.replace(
        safeCall,
        "(() => { const qualifying = countByLabel(rows, 'wrong_entity'); return qualifying / total })()",
      )
      expect(findRawMetricDivision(regressed)).not.toBeNull()
      // Contrôle positif : le fichier RÉEL, non modifié, ne déclenche rien —
      // sans cette ligne, un motif mal orthographié rendrait aussi bien « rien
      // trouvé nulle part », donc une garde verte qui ne compare rien.
      expect(findRawMetricDivision(real)).toBeNull()
    })

    it("n'attrape pas ce qu'elle ne vise pas — un commentaire qui NOMME le motif, sans l'écrire en code", () => {
      // C'est très exactement la ligne réelle de market-memory-ground-truth-metrics.ts
      // (docblock) : elle avertit de ne jamais écrire `qualifying / total`, et ne
      // doit pas se faire piéger par sa propre mise en garde une fois recopiée.
      const commentaireSeul = `
        /**
         * N'ajoute jamais un \`qualifying / total\` à la main ailleurs — passe par
         * resolveMarketMemoryGroundTruthMetric.
         */
        export function legitimate() { return 1 }
      `
      expect(findRawMetricDivision(commentaireSeul)).toBeNull()
    })

    it("n'attrape pas ce qu'elle ne vise pas — un ratio SANS RAPPORT avec la vérité terrain, ailleurs dans le dépôt", () => {
      // Témoin d'un calcul légitime qui divise deux variables nommées
      // différemment (aucune ne s'appelle `qualifying`) : la garde n'est
      // ancrée que sur ce nom précis, pas sur « une division existe ».
      const sansRapport = `
        function tauxDeReponse(repondus: number, envoyes: number) {
          return envoyes === 0 ? null : repondus / envoyes
        }
      `
      expect(findRawMetricDivision(sansRapport)).toBeNull()
    })

    it('AUCUN fichier du dépôt (hors le fichier autorisé) ne recalcule `qualifying / total` à la main', () => {
      const offenders = candidateFiles()
        .map(file => ({ file, hit: findRawMetricDivision(readFileSync(file, 'utf8')) }))
        .filter((entry): entry is { file: string; hit: string } => entry.hit !== null)
        .map(entry =>
          entry.file.slice(
            entry.file.indexOf('apps') !== -1 ? entry.file.indexOf('apps') : entry.file.indexOf('packages'),
          ),
        )

      // ⚠️ Si cette liste cesse d'être vide : quelqu'un a recalculé une métrique
      // de vérité terrain à la main. La correction n'est jamais d'élargir le
      // motif ou d'ajouter une exception — c'est de faire passer ce calcul par
      // `resolveMarketMemoryGroundTruthMetric`.
      expect(offenders).toEqual([])
    })
  })
})
