import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_ONBOARDING_MARKET_AWARENESS_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #1627 — « et en démonstration, la première valeur marché de l'onboarding
 * montre quoi ? »
 *
 * `MarketAwarenessCard` n'a ni table ni clé de `raw_analysis` à elle : la garde
 * PAR TABLE ne pose donc jamais cette question. Ce fichier la pose à sa place,
 * sur le même principe que `demo-compatible-environments-coverage.spec.ts` —
 * dont c'est la capacité SŒUR : les deux lisent le même moteur, depuis deux
 * écrans différents.
 */

const WEB = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features')
const CARD = join(WEB, 'welcome', 'view', 'MarketAwarenessCard.tsx')
const WELCOME_SCREEN = join(WEB, 'welcome', 'view', 'WelcomeScreen.tsx')

/**
 * ⚠️ CE FICHIER NE NOMME PAS LES QUATRE TABLES, ET C'EST VOULU — voir la même
 * mise en garde dans `demo-compatible-environments-coverage.spec.ts` : GA-258
 * (`market-memory-single-source-of-truth.spec.ts`) interdit qu'un nom de table
 * de la mémoire marché apparaisse dans du CODE hors de `market-memory/`, et
 * elle retire les commentaires avant de chercher — une chaîne de caractères la
 * déclenche là où un commentaire ne la déclenche pas. Ce qu'on garde ici, c'est
 * que la raison NOMME la cause, pas qu'elle épelle des tables.
 */
const CAUSE_QUI_DOIT_ETRE_NOMMEE = ['MarketMemoryService', 'GA-258', 'PARTAGÉES', 'concurrentes']

/** Idem : les quatre noms vivent dans un `.spec.ts`, que GA-258 exclut de son balayage. */
const MARKET_MEMORY_SHARED_TABLES = [
  'market_company_signal',
  'market_esn_client',
  'market_company_stack',
  'market_ex_esn_at_client',
]

describe('couverture démo — la première valeur marché de l’onboarding (#1627)', () => {
  it('LIT les composants réels, pas une liste recopiée à la main', () => {
    const card = readFileSync(CARD, 'utf8')
    expect(card.length).toBeGreaterThan(0)
    expect(card).toContain('useMarketContextSearch')
    expect(card).toContain('deriveMarketAwarenessQuery')

    // La carte est bien MONTÉE : une capacité que personne n'appelle n'a pas de
    // question de parité démo à se poser — c'est le défaut n°1 de ce dépôt.
    const screen = readFileSync(WELCOME_SCREEN, 'utf8')
    expect(screen).toContain('<MarketAwarenessCard />')
  })

  it('classe la capacité « vide à dessein », et la raison NOMME la cause bloquée par GA-258', () => {
    expect(DEMO_ONBOARDING_MARKET_AWARENESS_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSE_QUI_DOIT_ETRE_NOMMEE) {
      expect(DEMO_ONBOARDING_MARKET_AWARENESS_COVERAGE.reason).toContain(cause)
    }
    expect(DEMO_ONBOARDING_MARKET_AWARENESS_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait à ce même contrôle (témoin)', () => {
    const tropCourte = { state: 'vide_a_dessein' as const, reason: 'Pas seedable.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
    expect(tropCourte.reason).not.toContain('GA-258')
  })

  it('la raison NOMME l’écran, pour qu’on sache LAQUELLE des deux lectures elle classe', () => {
    // Témoin de cas légitime voisin : `DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE`
    // classe la MÊME cause depuis le vivier. Deux entrées, deux écrans — une
    // raison qui ne nomme pas le sien se recopierait d'une capacité à l'autre.
    expect(DEMO_ONBOARDING_MARKET_AWARENESS_COVERAGE.reason).toContain('onboarding')
  })

  it('les quatre tables bloquées ne sont, À RAISON, jamais dans `DEMO_SEEDED_TABLES`', () => {
    for (const table of MARKET_MEMORY_SHARED_TABLES) {
      expect(DEMO_SEEDED_TABLES).not.toContain(table)
    }
  })
})
