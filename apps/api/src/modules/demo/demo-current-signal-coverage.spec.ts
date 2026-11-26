import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_CURRENT_SIGNAL_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #2288.2 — « et en démonstration, la colonne "Signal actuel" montre quoi ? »
 *
 * La colonne n'a ni table ni clé de `raw_analysis` à elle : la garde PAR TABLE
 * ne pose donc jamais cette question. Ce fichier la pose à sa place, sur le même
 * principe que `demo-compatible-environments-coverage.spec.ts`.
 *
 * ⚠️ ET SURTOUT — une classification affirme, elle ne prouve rien. La leçon du
 * dépôt est une garde VERTE posée sur un bloc MORT : « vide à dessein » sur une
 * colonne qui, de toute façon, ne reçoit jamais rien. Cette garde LIT donc les
 * deux fichiers qui rendent la colonne, et refuse la classification si la
 * colonne n'est plus branchée sur une vraie date.
 */

const WEB = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'consultants', 'view', 'reverse-market')
const CURRENT_SIGNAL_CELL = join(WEB, 'CurrentSignalCell.tsx')
const REVERSE_MARKET_PAGE = join(WEB, 'ReverseMarketPage.tsx')
const DEMO_DATASET = join(__dirname, 'demo-dataset.ts')

/** La cause doit être NOMMÉE, pas résumée — les mêmes mots que le bloc voisin. */
const CAUSE_QUI_DOIT_ETRE_NOMMEE = ['MarketMemoryService', 'GA-258', 'PARTAGÉES', 'concurrentes', 'DOMAINE']

describe('couverture démo — la colonne « Signal actuel » (#2288.2)', () => {
  it('LIT la cellule réelle, et elle rend bien les DEUX natures de date', () => {
    const source = readFileSync(CURRENT_SIGNAL_CELL, 'utf8')
    expect(source.length).toBeGreaterThan(0)
    expect(source).toContain("nature === 'own'")
    expect(source).toContain("nature === 'shared'")
    // Le mois passe par la dérivation partagée, jamais par un `Intl` recopié.
    expect(source).toContain('formatMonth')
  })

  it('⚠️ la colonne n’est PAS un bloc mort — l’écran lui passe une vraie date', () => {
    // Sans cette ligne, la classification serait vraie pour la mauvaise raison :
    // « vide en démonstration » parce que vide PARTOUT. C'était l'état du dépôt
    // avant #2288.2 (`signal={null}` en dur), et une garde verte l'aurait couvert.
    const source = readFileSync(REVERSE_MARKET_PAGE, 'utf8')
    expect(source).toContain('match.currentSignal')
    expect(source).not.toContain('<CurrentSignalCell signal={null} />')
  })

  it('classe la capacité « vide à dessein », et la raison NOMME ses deux verrous', () => {
    expect(DEMO_CURRENT_SIGNAL_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSE_QUI_DOIT_ETRE_NOMMEE) {
      expect(DEMO_CURRENT_SIGNAL_COVERAGE.reason).toContain(cause)
    }
    expect(DEMO_CURRENT_SIGNAL_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison qui ne nomme pas la cause échoue (témoin)', () => {
    const creuse = { state: 'vide_a_dessein' as const, reason: 'Pas seedable en démonstration.' }
    expect(CAUSE_QUI_DOIT_ETRE_NOMMEE.every(cause => creuse.reason.includes(cause))).toBe(false)
    expect(creuse.reason.length).toBeLessThan(200)
  })

  it('la MATIÈRE PREMIÈRE, elle, est bien semée — un fait d’accès HUMAIN et DATÉ', () => {
    // La raison affirme que le mécanisme se montre ailleurs en démonstration.
    // Une affirmation de ce genre se vérifie, sinon elle vieillit toute seule.
    const source = readFileSync(DEMO_DATASET, 'utf8')
    expect(source).toContain('accessFacts:')
    expect(source).toContain("provenance: 'human' as const")
    expect(source).toContain('observedDaysAgo:')
  })

  it('aucune table de la mémoire marché n’est semée — c’est le premier verrou', () => {
    for (const table of ['market_company_signal', 'market_esn_client', 'market_company_stack']) {
      expect(DEMO_SEEDED_TABLES).not.toContain(table)
    }
  })
})
