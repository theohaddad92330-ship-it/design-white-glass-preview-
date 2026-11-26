import { describe, expect, it } from 'vitest'
import {
  MARKET_VERIFICATION_STAGES,
  MARKET_VERIFICATION_STAGE_OF,
  MARKET_VERIFICATION_STATES,
  PUBLIC_SOURCE_IDS,
  decideMarketVerificationState,
  marketVerificationKey,
  marketVerificationReceiptSchema,
  marketVerificationStatesQuerySchema,
  planMarketVerification,
  readMarketVerificationStates,
} from './market-verification.js'
import { REFRESH_AGED_AFTER_MS, REFRESH_MODE_DURATION_MINUTES, REFRESH_SOURCE_NATURES } from './refresh-explained.js'
import { OUR_SUPPLIERS, supplierNamesIn } from './tool-naming.js'
import { creditCostOf } from '../billing/credit-weights.js'

const NOW = new Date('2026-09-18T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function receipt(overrides: Partial<Parameters<typeof decideMarketVerificationState>[0]['receipt'] & object> = {}) {
  return {
    companyName: 'Cegedim',
    verifiedAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
    outcome: 'verified' as const,
    correctedByHuman: false,
    archivedAt: null,
    creditsAnnounced: 8,
    ...overrides,
  }
}

describe('#2288.2 — les trois étapes du flux, chacune avec son état', () => {
  it('nomme exactement trois étapes : présélection, vérification, conservation', () => {
    expect(MARKET_VERIFICATION_STAGES).toEqual(['preselection', 'verification', 'conservation'])
  })

  it('range CHAQUE état dans une étape, et les trois étapes sont atteignables', () => {
    for (const state of MARKET_VERIFICATION_STATES) {
      expect(MARKET_VERIFICATION_STAGES).toContain(MARKET_VERIFICATION_STAGE_OF[state])
    }
    const reached = new Set(MARKET_VERIFICATION_STATES.map(state => MARKET_VERIFICATION_STAGE_OF[state]))
    expect([...reached].sort()).toEqual([...MARKET_VERIFICATION_STAGES].sort())
  })

  it('une entreprise jamais vérifiée est À VÉRIFIER, et elle est à l’étape de présélection', () => {
    const state = decideMarketVerificationState({ receipt: null, now: NOW })
    expect(state).toBe('to_verify')
    expect(MARKET_VERIFICATION_STAGE_OF[state]).toBe('preselection')
  })

  it('une vérification récente est CONSERVÉE — la relire ne repasse pas par l’étape payante', () => {
    const state = decideMarketVerificationState({ receipt: receipt(), now: NOW })
    expect(state).toBe('kept')
    expect(MARKET_VERIFICATION_STAGE_OF[state]).toBe('conservation')
  })
})

describe('#2288.2 — la conservation vieillit, elle ne disparaît pas', () => {
  it('au-delà de la fenêtre de fraîcheur, la vérification redevient PÉRIMÉE (la ligne reste)', () => {
    const old = receipt({ verifiedAt: new Date(NOW.getTime() - REFRESH_AGED_AFTER_MS - DAY).toISOString() })
    expect(decideMarketVerificationState({ receipt: old, now: NOW })).toBe('stale')
  })

  it('juste avant la borne, elle est encore conservée — la borne vit dans REFRESH_AGED_AFTER_MS', () => {
    const edge = receipt({ verifiedAt: new Date(NOW.getTime() - REFRESH_AGED_AFTER_MS + 1000).toISOString() })
    expect(decideMarketVerificationState({ receipt: edge, now: NOW })).toBe('kept')
  })

  it('une ligne archivée est PÉRIMÉE, jamais absente', () => {
    const archived = receipt({ archivedAt: new Date(NOW.getTime() - DAY).toISOString() })
    expect(decideMarketVerificationState({ receipt: archived, now: NOW })).toBe('stale')
  })
})

describe('#2288.2 — un temps dépassé n’est pas un échec, et une correction humaine gagne', () => {
  it('un résultat NON MESURÉ reste « inconnu » — jamais « non vérifié », jamais « 0 »', () => {
    const timedOut = receipt({ outcome: 'unknown' })
    expect(decideMarketVerificationState({ receipt: timedOut, now: NOW })).toBe('unknown')
  })

  it('une date illisible rend « inconnu » plutôt qu’une fraîcheur devinée', () => {
    const broken = receipt({ verifiedAt: 'pas-une-date' })
    expect(decideMarketVerificationState({ receipt: broken, now: NOW })).toBe('unknown')
  })

  it('une correction humaine gagne, même vieille, même archivée', () => {
    const corrected = receipt({
      correctedByHuman: true,
      verifiedAt: new Date(NOW.getTime() - 10 * REFRESH_AGED_AFTER_MS).toISOString(),
      archivedAt: new Date(NOW.getTime() - DAY).toISOString(),
      outcome: 'unknown',
    })
    expect(decideMarketVerificationState({ receipt: corrected, now: NOW })).toBe('corrected')
  })
})

describe('#2288.4 — le coût annoncé AVANT, cinq informations', () => {
  it('annonce candidats, sources, coût, durée et ce que ça apporte', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim', 'Sopra Steria'],
      receipts: [],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    expect(plan.candidates).toBe(2)
    expect(plan.sources.length).toBeGreaterThan(0)
    for (const source of plan.sources) expect(REFRESH_SOURCE_NATURES).toContain(source)
    expect(plan.credits).toEqual({ measured: true, credits: 2 * creditCostOf('account_analysis') })
    expect(plan.durationMinutes).toEqual(REFRESH_MODE_DURATION_MINUTES.full)
    expect(plan.adds.length).toBeGreaterThan(0)
  })

  it('ne facture PAS ce qui est déjà conservé, et le dit', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim', 'Sopra Steria'],
      receipts: [receipt()],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    expect(plan.candidates).toBe(1)
    expect(plan.kept).toBe(1)
    expect(plan.credits).toEqual({ measured: true, credits: creditCostOf('account_analysis') })
  })

  it('GA-66 — le total de coût conservé dit combien de lignes n’ont PAS de coût connu', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim', 'Sopra Steria'],
      receipts: [receipt(), receipt({ companyName: 'Sopra Steria', creditsAnnounced: null })],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    expect(plan.keptCreditsSpent).toEqual({ measured: true, credits: 8 })
    expect(plan.keptWithoutKnownCost).toBe(1)
  })

  it('un coût de grille illisible rend NON MESURÉ, jamais 0', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim'],
      receipts: [],
      now: NOW,
      fullAnalysisCredits: null,
    })
    expect(plan.credits).toEqual({ measured: false })
  })

  it('aucune probabilité, aucun taux de succès : le plan ne porte que des faits', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim'],
      receipts: [],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    const keys = Object.keys(plan).join(' ').toLowerCase()
    for (const forbidden of ['probab', 'chance', 'success', 'likelihood', 'odds']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('rend l’état de CHAQUE entreprise présélectionnée, dans l’ordre reçu', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim', 'Sopra Steria'],
      receipts: [receipt()],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    expect(plan.states).toEqual([
      { companyName: 'Cegedim', state: 'kept', siren: null },
      { companyName: 'Sopra Steria', state: 'to_verify', siren: null },
    ])
  })

  // #2288.4 (18/09, suite) — LE SIREN CONNU VOYAGE JUSQUE DANS LE PLAN PAYANT,
  // pour que le devis (`launch-plan`) et le lancement (`/analysis/start`)
  // résolvent la même entité, jamais deux lectures indépendantes par nom.
  it('porte le SIREN connu jusque dans les états du plan — sans SIREN connu, `null` (comportement inchangé)', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim', 'Sopra Steria'],
      receipts: [receipt()],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
      knownSirens: new Map([[marketVerificationKey('Sopra Steria'), '326820065']]),
    })
    expect(plan.states).toEqual([
      { companyName: 'Cegedim', state: 'kept', siren: null },
      { companyName: 'Sopra Steria', state: 'to_verify', siren: '326820065' },
    ])
  })

  it('rapproche les libellés sans tenir compte de la casse ni des espaces de bord', () => {
    const plan = planMarketVerification({
      companies: ['  cegedim '],
      receipts: [receipt()],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    expect(plan.states[0]?.state).toBe('kept')
    expect(plan.candidates).toBe(0)
  })

  it('une présélection vide n’annonce rien — 0 candidat MESURÉ, pas une absence de mesure', () => {
    const plan = planMarketVerification({
      companies: [],
      receipts: [],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    expect(plan.candidates).toBe(0)
    expect(plan.credits).toEqual({ measured: true, credits: 0 })
  })
})

describe('c66 — les sources PUBLIQUES prévues se nomment, jamais un fournisseur', () => {
  // #2288.4 (18/09, suite) — France Travail suivait le plan et se nommait pour
  // TOUTE vérification, y compris quand tous les candidats étaient rouverts
  // (aucune collecte). Elle suit désormais le LANCEUR, comme BOAMP/DECP : ce
  // plan n'annonce donc plus AUCUNE source publique de façon inconditionnelle.
  it('n’annonce plus rien de façon inconditionnelle — la décision vit entièrement chez le lanceur', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim'],
      receipts: [],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    expect(plan.publicSources).toEqual([])
  })

  it('la liste est FERMÉE, et ne recoupe AUCUN de nos fournisseurs (GA-44) — elle doit savoir dire NON', () => {
    const ourSupplierNames = new Set(OUR_SUPPLIERS.flatMap(supplier => [supplier.name, supplier.brand]))
    for (const id of PUBLIC_SOURCE_IDS) {
      expect(ourSupplierNames.has(id)).toBe(false)
      expect(supplierNamesIn(id)).toEqual([])
    }
  })

  // #2288.4 — le plan ne reçoit que des noms : BOAMP/DECP, gatés par entreprise,
  // sont annoncés par le LANCEUR (`planLaunch` → `publicTenderSources`), pas ici.
  it('le plan n’annonce PAS BOAMP ni DECP : ils se décident par lancement, pas sur une liste de noms', () => {
    const plan = planMarketVerification({
      companies: ['Cegedim'],
      receipts: [],
      now: NOW,
      fullAnalysisCredits: creditCostOf('account_analysis'),
    })
    expect(plan.publicSources).not.toContain('boamp')
    expect(plan.publicSources).not.toContain('decp')
  })
})

describe('#2288.3 — le reçu est un fait sur MON geste, jamais une donnée devinée', () => {
  it('accepte un reçu bien formé', () => {
    expect(marketVerificationReceiptSchema.parse(receipt())).toMatchObject({ companyName: 'Cegedim' })
  })

  it('refuse un champ inconnu — le contrat ne laisse passer aucune colonne devinée', () => {
    expect(() => marketVerificationReceiptSchema.parse({ ...receipt(), probabiliteDeSucces: 0.7 })).toThrow()
  })

  it('refuse une issue hors du catalogue fermé', () => {
    expect(() => marketVerificationReceiptSchema.parse({ ...receipt(), outcome: 'failed' })).toThrow()
  })
})

describe('#2288.2 (décision Louis 18/09) — la LECTURE des états, lisible par tout membre', () => {
  it('rend l’état ET la date de chaque entreprise — une vérification porte SA date', () => {
    const rows = readMarketVerificationStates({
      companies: ['Cegedim', 'Sopra Steria'],
      receipts: [receipt()],
      now: NOW,
    })
    expect(rows).toEqual([
      { companyName: 'Cegedim', state: 'kept', verifiedAt: receipt().verifiedAt, siren: null },
      { companyName: 'Sopra Steria', state: 'to_verify', verifiedAt: null, siren: null },
    ])
  })

  // #2288.4 (18/09, suite) — LE SIREN CONNU VOYAGE AVEC LA VÉRIFICATION.
  // `knownSirens` est une lecture DÉJÀ FAITE par l'appelant (nos propres
  // comptes du workspace, jamais deviné depuis le nom) — cette fonction ne
  // fait QUE la reporter sur la ligne, `null` quand rien n'est connu.
  it('reporte le SIREN connu de l’appelant sur la ligne — jamais deviné ici', () => {
    const rows = readMarketVerificationStates({
      companies: ['Cegedim', 'Sopra Steria'],
      receipts: [receipt()],
      now: NOW,
      knownSirens: new Map([[marketVerificationKey('Cegedim'), '552081317']]),
    })
    expect(rows).toEqual([
      { companyName: 'Cegedim', state: 'kept', verifiedAt: receipt().verifiedAt, siren: '552081317' },
      { companyName: 'Sopra Steria', state: 'to_verify', verifiedAt: null, siren: null },
    ])
  })

  it('sans SIREN connu : comportement inchangé — `null`, jamais une chaîne vide', () => {
    const rows = readMarketVerificationStates({ companies: ['Cegedim'], receipts: [receipt()], now: NOW })
    expect(rows[0]?.siren).toBeNull()
  })

  it('ne porte AUCUN montant — pas de coût dans une lecture ouverte au viewer', () => {
    const rows = readMarketVerificationStates({ companies: ['Cegedim'], receipts: [receipt()], now: NOW })
    const keys = rows
      .flatMap(row => Object.keys(row))
      .join(' ')
      .toLowerCase()
    expect(keys).not.toMatch(/credit|cost|price|cout|coût/)
  })

  it('décide avec la MÊME fonction que le plan — une vérification vieillie y est périmée aussi', () => {
    const old = receipt({ verifiedAt: new Date(NOW.getTime() - REFRESH_AGED_AFTER_MS - DAY).toISOString() })
    const [row] = readMarketVerificationStates({ companies: ['Cegedim'], receipts: [old], now: NOW })
    expect(row?.state).toBe('stale')
    // La date reste dite : « à revérifier » sans dire depuis quand serait muet.
    expect(row?.verifiedAt).toBe(old.verifiedAt)
  })

  it('la requête accepte UN libellé seul comme une liste (paramètre de requête non répété)', () => {
    expect(marketVerificationStatesQuerySchema.parse({ companies: 'Cegedim' })).toEqual({ companies: ['Cegedim'] })
    expect(marketVerificationStatesQuerySchema.parse({ companies: ['A', 'B'] })).toEqual({ companies: ['A', 'B'] })
    expect(marketVerificationStatesQuerySchema.parse({})).toEqual({ companies: [] })
  })

  it('la requête refuse plus de cinquante libellés plutôt que de tronquer', () => {
    const many = Array.from({ length: 51 }, (_, index) => `E${index}`)
    expect(() => marketVerificationStatesQuerySchema.parse({ companies: many })).toThrow()
  })
})
