import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { accountListCountersSchema } from '@bellum/contracts'
import { DEMO_PORTFOLIO_COUNTERS } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * « ET EN DÉMONSTRATION, LES COMPTEURS DE TÊTE MONTRENT QUOI ? »
 *
 * La garde par TABLE ne pose pas la question : les compteurs de `/accounts`
 * n'ajoutent aucune table, ils lisent `accounts`, `tasks`, `signal_history` et
 * la barrière d'accès de `raw_analysis`. Un bandeau de zéros se découvrirait en
 * réunion, pas en CI.
 *
 * Ce que cette garde prouve, en plus de la couverture :
 *  - elle LIT un corpus non vide — la liste des compteurs vient du CONTRAT, pas
 *    d'une copie ;
 *  - elle sait dire NON : un compteur ajouté au contrat sans décision de démo,
 *    une justification vide, ou un semis qui perd ses classes d'accès `A`/`B`
 *    la font rougir ;
 *  - elle refuse une justification qui décrit un ÉTAT du semis plutôt qu'une
 *    RÈGLE, et elle relit le SEMIS plutôt que de le croire sur parole.
 */
const COUNTER_KEYS = Object.keys(accountListCountersSchema.shape)

function readDemoDataset(): string {
  return readFileSync(join(__dirname, 'demo-dataset.ts'), 'utf8')
}

describe('couverture démo — les compteurs de tête du portefeuille', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(COUNTER_KEYS.length).toBe(9)
    expect(Object.keys(DEMO_PORTFOLIO_COUNTERS).length).toBeGreaterThan(0)
  })

  it('classe CHAQUE compteur du contrat : seedé, ou vide à dessein avec sa raison', () => {
    // Si ce test tombe : un compteur a été ajouté au contrat sans que personne
    // ait répondu « et en démonstration, ça montre quoi ? ».
    expect(Object.keys(DEMO_PORTFOLIO_COUNTERS).sort()).toEqual([...COUNTER_KEYS].sort())
  })

  it('ne garde pas de justification périmée — un compteur disparu du contrat ment sur le produit', () => {
    const known = new Set(COUNTER_KEYS)
    expect(Object.keys(DEMO_PORTFOLIO_COUNTERS).filter(key => !known.has(key))).toEqual([])
  })

  it('exige une raison SUBSTANTIELLE pour chaque compteur laissé à zéro', () => {
    const tooShort = Object.entries(DEMO_PORTFOLIO_COUNTERS)
      .filter(([, entry]) => entry.state !== 'seede' && entry.reason.length <= 200)
      .map(([key]) => key)
    expect(tooShort).toEqual([])
  })

  it('la raison est une RÈGLE : elle NOMME ce dont le compteur dérive', () => {
    // Une justification qui décrit l'état du semis (« la table est vide ») meurt
    // au premier changement de semis. Celle qui NOMME la source reste vraie, et
    // le compteur s'allume tout seul le jour où la source parle.
    const sources: Record<string, RegExp> = {
      followed: /followedAccounts/,
      withoutNextAction: /noUpcomingTask/,
      newSignals7d: /signal_history/,
      accessClassAB: /access_class/,
      total: /accounts/,
      activeRelations: /commercial_status/,
      favorites: /user_favorites/,
      crm: /CRM_LINKED_ACCOUNT_PREDICATE/,
      imported: /IMPORTED_ACCOUNT_PREDICATE/,
    }
    const silent = Object.entries(sources)
      .filter(([key, pattern]) => !pattern.test(DEMO_PORTFOLIO_COUNTERS[key]?.reason ?? ''))
      .map(([key]) => key)
    expect(silent).toEqual([])
  })

  it('le SEMIS tient ce que les entrées « seedé » promettent', () => {
    // Une raison de démo qui affirme un semis que le semis ne fait plus est un
    // audit documentaire, pas le code. On relit la source.
    const dataset = readDemoDataset()

    // `followed` — la population de `followedAccounts` existe en salle.
    expect(dataset).toContain("commercial_status: 'watching'")

    // `accessClassAB` — au moins un dossier en classe A ou B, ET au moins un
    // dossier hors de ces classes : un compteur qui n'a rien à écarter ne prouve
    // pas qu'il discrimine. Décision Louis 04/10/2026 : les comptes fictifs (la
    // classe A d'une PME, la classe C du client fictif) ont quitté la salle —
    // relu sur les VRAIS dossiers.
    const accessClass = (dossier: (typeof DEMO_DOSSIERS)[number]): unknown =>
      (dossier.account.raw_analysis['access_barrier'] as { access_class?: unknown } | undefined)?.access_class
    const counted = DEMO_DOSSIERS.filter(dossier => ['A', 'B'].includes(String(accessClass(dossier))))
    expect(counted.length).toBeGreaterThanOrEqual(1)
    expect(counted.length).toBeLessThan(DEMO_DOSSIERS.length)
    expect(dataset).toContain("access_class: 'B'")
  })

  it('le compteur laissé à zéro l’est pour la MÊME raison que sa table', () => {
    // `signal_history` est classée vide à dessein ailleurs dans le même fichier.
    // Les deux décisions doivent citer la même source, sinon l'une des deux
    // finira par bouger sans l'autre.
    const coverage = readFileSync(join(__dirname, 'demo-coverage.ts'), 'utf8')
    expect(coverage).toContain('signal_history:')
    expect(DEMO_PORTFOLIO_COUNTERS['newSignals7d']?.state).toBe('vide_a_dessein')
  })
})
