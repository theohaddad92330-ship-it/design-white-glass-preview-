import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_MARKET_REVIEW_DECISION_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_PURGE_TABLES } from './demo-reset.service'

/**
 * #1617.4 — « et en démonstration, le geste « départager » montre quoi ? »
 *
 * Le geste n'a pas d'écran à lui : il vit sur les lignes de `MarketReviewQueue`,
 * et sa table (`market_company_resolution_override`) est classée vide à dessein.
 * La garde PAR TABLE pose donc la question de l'ÉCRITURE, jamais celle de ce que
 * le visiteur VOIT. Ce fichier pose la seconde, sur le même principe que
 * `demo-compatible-environments-coverage.spec.ts`.
 *
 * ⚠️ Il NOMME les tables partagées, et `demo-coverage.ts` ne le fait pas : GA-258
 * exclut les `.spec.ts` de son balayage. Un test a le droit de nommer ce qu'il
 * vérifie, un fichier de production non.
 */

const REVIEW_QUEUE = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'market-memory',
  'view',
  'MarketReviewQueue.tsx',
)

/** La cause qui doit être NOMMÉE dans la raison — pas son orthographe, sa nature. */
const CAUSE_QUI_DOIT_ETRE_NOMMEE = ['portfolioFor', 'GA-258', 'PARTAGÉES', 'concurrentes']

const MARKET_MEMORY_SHARED_TABLES = [
  'market_company_signal',
  'market_esn_client',
  'market_company_stack',
  'market_ex_esn_at_client',
  'market_company_alias',
]

describe('couverture démo — le geste « départager » de la file de revue (#1617.4)', () => {
  it('LIT le composant réel, pas une liste recopiée à la main', () => {
    const source = readFileSync(REVIEW_QUEUE, 'utf8')
    expect(source.length).toBeGreaterThan(0)
    // Les deux sens du geste, et le hook qui les envoie : si l'un des trois
    // disparaissait, cette garde surveillerait un écran qui n'existe plus.
    expect(source).toContain('useRecordMarketResolution')
    expect(source).toContain('confirmed')
    expect(source).toContain('dismissed')
  })

  it('classe la capacité « vide à dessein », et la raison NOMME la cause', () => {
    expect(DEMO_MARKET_REVIEW_DECISION_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSE_QUI_DOIT_ETRE_NOMMEE) {
      expect(DEMO_MARKET_REVIEW_DECISION_COVERAGE.reason).toContain(cause)
    }
    expect(DEMO_MARKET_REVIEW_DECISION_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait au même contrôle (témoin)', () => {
    const tropCourte = { state: 'vide_a_dessein' as const, reason: 'Pas seedable.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
    expect(CAUSE_QUI_DOIT_ETRE_NOMMEE.every(cause => tropCourte.reason.includes(cause))) //
      .toBe(false)
  })

  it('la table de la décision est PURGÉE et classée vide à dessein, jamais seedée', () => {
    // Purgée : elle porte le nom de qui a tranché, et la salle se remet à neuf
    // entre deux visiteurs. Le leak guard de `demo-reset.service.spec.ts` le
    // vérifie sur les entités ; ici on vérifie la même chose côté couverture.
    expect(DEMO_PURGE_TABLES).toContain('market_company_resolution_override')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).toContain('market_company_resolution_override')
    expect(DEMO_SEEDED_TABLES).not.toContain('market_company_resolution_override')
  })

  it('n’attrape pas ce qu’elle ne vise pas — les cinq tables PARTAGÉES restent hors du semis', () => {
    // Témoin de cas légitime voisin : la table scopée entre dans les listes de
    // démonstration, les cinq partagées n'y entrent jamais. Si l'une d'elles y
    // apparaissait, GA-258 romprait avant ce test — les deux gardes se
    // recoupent, elles ne se substituent pas.
    for (const table of MARKET_MEMORY_SHARED_TABLES) {
      expect(DEMO_SEEDED_TABLES).not.toContain(table)
      expect(DEMO_PURGE_TABLES).not.toContain(table)
    }
  })
})
