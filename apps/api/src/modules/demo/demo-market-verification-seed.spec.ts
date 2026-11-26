import { creditCostOf, decideMarketVerificationState, type MarketVerificationReceipt } from '@bellum/contracts'
import { DemoSeedService } from './demo-seed.service'
import { DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #2288.2 — LE SEMIS DE LA CONSERVATION, EXÉCUTÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE À CÔTÉ DE `demo-coverage.spec.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde de couverture lit le SOURCE du service de semis et vérifie qu'une
 * chaîne `INSERT INTO market_verification_receipts` s'y trouve, et que la
 * méthode qui la porte est atteignable depuis `seedWorkspace`. C'est déjà
 * beaucoup — mais une classification AFFIRME, elle ne vérifie pas : un `INSERT`
 * présent dans le texte peut n'écrire aucune ligne (boucle vide, garde qui
 * sort, paramètre absent) et la CI resterait verte devant un écran vide.
 *
 * Ce fichier EXÉCUTE la dérivation, sans base, et prouve deux choses que le
 * texte ne peut pas prouver : qu'il sort bien trois reçus, et que ces trois
 * reçus rendent les trois états que la salle doit montrer — un conservé, un
 * périmé, un corrigé à la main. Si le semis devenait muet, ou si ses dates
 * dérivaient au point de rendre trois fois le même état, ce test rougirait.
 */
type Insert = { sql: string; params: readonly unknown[] }

const WORKSPACE = '11111111-1111-4111-8111-111111111111'
const OWNER = '22222222-2222-4222-8222-222222222222'

async function runSeed(companies: readonly string[], now: number): Promise<Insert[]> {
  const inserts: Insert[] = []
  // On exécute la MÉTHODE RÉELLE : construire le service entier demanderait
  // quarante repositories dont aucun ne participe à ce semis, et un double
  // recopié ici ne prouverait que lui-même.
  // `unknown` d’abord : une intersection avec la classe s’effondrerait en `never`,
  // `accounts` et la méthode de semis y étant PRIVÉS.
  const service = Object.create(DemoSeedService.prototype) as unknown as {
    accounts: { manager: { query: (sql: string, params: readonly unknown[]) => Promise<unknown> } }
    seedMarketVerificationReceipts: (
      workspaceId: string,
      ownerUserId: string,
      companyNames: readonly string[],
      now: number,
    ) => Promise<void>
  }
  service.accounts = {
    manager: {
      query: async (sql: string, params: readonly unknown[]) => {
        inserts.push({ sql, params })
        return []
      },
    },
  }
  await service.seedMarketVerificationReceipts(WORKSPACE, OWNER, companies, now)
  return inserts
}

/** Le reçu tel que le service le relira, reconstruit depuis les paramètres insérés. */
function receiptFrom(insert: Insert): MarketVerificationReceipt {
  const [, , companyName, , verifiedAt, outcome, creditsAnnounced, correctedBy] = insert.params
  return {
    companyName: String(companyName),
    verifiedAt: (verifiedAt as Date).toISOString(),
    outcome: outcome === 'unknown' ? 'unknown' : 'verified',
    correctedByHuman: correctedBy !== null,
    archivedAt: null,
    creditsAnnounced: typeof creditsAnnounced === 'number' ? creditsAnnounced : null,
  }
}

describe('#2288.2 — le semis de démonstration écrit vraiment trois reçus', () => {
  const NOW = new Date('2026-09-18T10:00:00.000Z').getTime()
  const COMPANIES = ['Société Générale', 'Cegedim', 'Sopra Steria', 'Atos']

  it('la table est déclarée SEEDÉE — la classification et le semis parlent du même nom', () => {
    expect(DEMO_SEEDED_TABLES).toContain('market_verification_receipts')
  })

  it('écrit trois lignes, et pas une de plus', async () => {
    const inserts = await runSeed(COMPANIES, NOW)
    expect(inserts).toHaveLength(3)
    for (const insert of inserts) expect(insert.sql).toContain('INSERT INTO market_verification_receipts')
  })

  it('rend les TROIS états que la salle doit montrer — conservé, périmé, corrigé', async () => {
    const inserts = await runSeed(COMPANIES, NOW)
    const states = inserts.map(insert =>
      decideMarketVerificationState({ receipt: receiptFrom(insert), now: new Date(NOW) }),
    )
    expect([...states].sort()).toEqual(['corrected', 'kept', 'stale'])
  })

  it('prend les libellés des COMPTES de la salle — jamais un nom inventé', async () => {
    const inserts = await runSeed(COMPANIES, NOW)
    for (const insert of inserts) expect(COMPANIES).toContain(String(insert.params[2]))
  })

  it('rapproche par un libellé normalisé, pour que l’écran retrouve la ligne', async () => {
    const inserts = await runSeed(['Société Générale'], NOW)
    expect(inserts[0]?.params[3]).toBe('société générale')
  })

  it('le coût inscrit vient de la GRILLE, jamais d’un nombre écrit dans le semis', async () => {
    const inserts = await runSeed(COMPANIES, NOW)
    for (const insert of inserts) expect(insert.params[6]).toBe(creditCostOf('account_analysis'))
  })

  it('un espace sans aucun compte n’écrit rien plutôt que d’inventer une entreprise', async () => {
    expect(await runSeed([], NOW)).toHaveLength(0)
  })

  it('les dates sont RELATIVES au semis — la salle ne vieillit jamais', async () => {
    const later = NOW + 400 * 24 * 60 * 60 * 1000
    const states = (await runSeed(COMPANIES, later)).map(insert =>
      decideMarketVerificationState({ receipt: receiptFrom(insert), now: new Date(later) }),
    )
    expect([...states].sort()).toEqual(['corrected', 'kept', 'stale'])
  })
})
