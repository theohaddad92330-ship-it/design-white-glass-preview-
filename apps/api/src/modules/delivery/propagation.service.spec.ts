import {
  accountPropagationSchema,
  accountRevenuePropagationSchema,
  consultantMarginPropagationSchema,
  consultantPropagationSchema,
  contactPropagationSchema,
  type FinanceScope,
} from '@bellum/contracts'
import { PropagationService } from './propagation.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const OTHER_ACCOUNT = 'a0000000-0000-4000-8000-000000000002'
const CONTACT = 'c0000000-0000-4000-8000-000000000010'
const CONSULTANT = 'c0000000-0000-4000-8000-000000000020'

type Rows = Record<string, unknown[]>

/**
 * Le mock répond par MARQUEUR de requête, jamais par ordre d'appel : un service
 * qui réordonne ses lectures ne doit pas faire passer un test au vert sur les
 * mauvaises lignes.
 */
function makeService(rows: Rows = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('AVG(m.daily_rate)')) return rows['accounts'] ?? []
      if (sql.includes('billing_contact_id')) return rows['contacts'] ?? []
      if (sql.includes('AS placements')) return rows['placements'] ?? []
      if (sql.includes('invoice_readiness')) return rows['revenue'] ?? []
      if (sql.includes('WITH placed AS')) return rows['margin'] ?? []
      return []
    }),
  }
  const missions = { manager }
  const service = new PropagationService(missions as never)
  return { service, queries, manager }
}

const WORKSPACE_SCOPE: FinanceScope = { kind: 'workspace', workspaceId: WORKSPACE }
const OWN_SCOPE: FinanceScope = { kind: 'own', workspaceId: WORKSPACE, userId: USER }

/* ══════════════════════════════════════════════════════════════════════════ */
/*  §4.4 — chaque bloc porte sa source, et ne s'édite jamais sur place         */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('chaque agrégat propagé porte un lien vers sa source', () => {
  it('les cinq agrégats portent une source cliquable et un verrou d’édition', async () => {
    const { service } = makeService({
      accounts: [{ account_id: ACCOUNT, missions: '3', missions_without_rate: '1', average_daily_rate: '600' }],
      contacts: [{ contact_id: CONTACT, account_id: ACCOUNT, signed_missions: '2' }],
      placements: [{ consultant_id: CONSULTANT, placements: '4' }],
      revenue: [
        {
          account_id: ACCOUNT,
          invoiced_cents: '1200000',
          invoiced_months: '3',
          missions: '2',
          months_without_amount: '0',
        },
      ],
      margin: [{ consultant_id: CONSULTANT, daily_rate: '600', loaded_daily_cost_cents: '40000', days: '20' }],
    })

    const digest = await service.digest(WORKSPACE)
    const finance = await service.financeDigest(WORKSPACE_SCOPE, true)

    // Chacun passe par son schéma : la source et `editable: false` y sont
    // OBLIGATOIRES, donc un bloc qui les perdrait ne parse plus.
    expect(accountPropagationSchema.parse(digest.accounts[0]).editable).toBe(false)
    expect(contactPropagationSchema.parse(digest.contacts[0]).editable).toBe(false)
    expect(consultantPropagationSchema.parse(digest.consultants[0]).editable).toBe(false)
    expect(accountRevenuePropagationSchema.parse(finance.accounts[0]).editable).toBe(false)
    expect(consultantMarginPropagationSchema.parse(finance.consultants[0]).editable).toBe(false)

    // Le lien mène aux LIGNES qui composent le chiffre, pas à la fiche.
    expect(digest.accounts[0]?.source.href).toBe(`/missions?accountId=${ACCOUNT}`)
    expect(finance.accounts[0]?.source.href).toBe(`/missions?accountId=${ACCOUNT}`)
    expect(digest.contacts[0]?.source.href).toBe(`/missions?accountId=${ACCOUNT}`)
    expect(digest.consultants[0]?.source.href).toBe(`/missions?consultantId=${CONSULTANT}`)
    expect(finance.consultants[0]?.source.href).toBe(`/missions?consultantId=${CONSULTANT}`)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  « aucune mission » ne rend JAMAIS 0                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('une absence ne s’affiche jamais « 0 »', () => {
  it('un espace sans aucune mission rend des listes VIDES, jamais des lignes à zéro', async () => {
    const { service } = makeService()
    const digest = await service.digest(WORKSPACE)
    const finance = await service.financeDigest(WORKSPACE_SCOPE, true)

    // Le point du test : rien, plutôt que « 0 € sur 0 mission ». Un compte sans
    // mission n'a pas « rapporté 0 € », il n'a RIEN à afficher.
    expect(digest).toEqual({ accounts: [], contacts: [], consultants: [] })
    expect(finance.accounts).toEqual([])
    expect(finance.consultants).toEqual([])
  })

  it('un compte dont AUCUNE mission n’a de TJM rend `null`, pas 0 €', async () => {
    // Trois forfaits : ils se facturent aux jalons et ne portent aucun TJM.
    // `AVG` rend `NULL` sur un ensemble vide — c'est tout l'intérêt de ne pas
    // écrire `COALESCE(AVG(...), 0)`, qui a déjà coûté trois défauts au dépôt.
    const { service } = makeService({
      accounts: [{ account_id: ACCOUNT, missions: '3', missions_without_rate: '3', average_daily_rate: null }],
    })
    const [row] = (await service.digest(WORKSPACE)).accounts
    expect(row?.averageSoldDailyRateCents).toBeNull()
    expect(row?.missionsWithoutRate).toBe(3)
    expect(row?.missions).toBe(3)
  })

  it('un compte dont aucun mois facturé ne porte de montant rend `null`, pas 0 €', async () => {
    const { service } = makeService({
      revenue: [
        {
          account_id: ACCOUNT,
          invoiced_cents: null,
          invoiced_months: '2',
          missions: '1',
          months_without_amount: '2',
        },
      ],
    })
    const [row] = (await service.financeDigest(WORKSPACE_SCOPE, true)).accounts
    expect(row?.invoicedCents).toBeNull()
    // Le total est un PLANCHER quand des mois n'ont pas de montant, et il le dit.
    expect(row?.monthsWithoutAmount).toBe(2)
  })

  it('un montant illisible vaut « on ne sait pas », jamais 0 €', async () => {
    // ⚠️ `bigint` revient en CHAÎNE depuis pg, et `Number('')` vaut 0 : sans ce
    // filtre, une somme illisible s'afficherait « 0 € encaissé ».
    const { service } = makeService({
      revenue: [
        { account_id: ACCOUNT, invoiced_cents: '', invoiced_months: '1', missions: '1', months_without_amount: '0' },
      ],
    })
    expect((await service.financeDigest(WORKSPACE_SCOPE, true)).accounts[0]?.invoicedCents).toBeNull()
  })

  it('une marge non calculable rend `null` et COMPTE ce qui en est sorti', async () => {
    const { service } = makeService({
      margin: [
        // Sans coût chargé : la mission sort du calcul, et elle est comptée.
        { consultant_id: CONSULTANT, daily_rate: '600', loaded_daily_cost_cents: null, days: '20' },
        // Sans relevé : aucun jour déclaré, donc aucune pondération possible.
        { consultant_id: CONSULTANT, daily_rate: '600', loaded_daily_cost_cents: '40000', days: null },
      ],
    })
    const [row] = (await service.financeDigest(WORKSPACE_SCOPE, true)).consultants
    expect(row?.marginPercent).toBeNull()
    expect(row?.measured).toBe(0)
    expect(row?.unmeasured).toBe(2)
    // « Non mesurable — 0 mission sur les 5 nécessaires. »
    expect(row?.measurability.measurable).toBe(false)
    expect(row?.measurability.required).toBe(5)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les chiffres eux-mêmes                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('ce que chaque agrégat calcule', () => {
  it('le tarif vendu moyen sort en CENTIMES depuis des euros', async () => {
    const { service } = makeService({
      accounts: [{ account_id: ACCOUNT, missions: '2', missions_without_rate: '0', average_daily_rate: '587.5' }],
    })
    // `missions.daily_rate` est en EUROS (`numeric`), la réponse en centimes :
    // sans l'arrondi, 587.5 € donnerait 58 750,000000001 centimes.
    expect((await service.digest(WORKSPACE)).accounts[0]?.averageSoldDailyRateCents).toBe(58_750)
  })

  it('la marge est PONDÉRÉE par les jours, jamais une moyenne de pourcentages', async () => {
    const { service } = makeService({
      margin: [
        // 1 jour à 50 % de marge…
        { consultant_id: CONSULTANT, daily_rate: '1000', loaded_daily_cost_cents: '50000', days: '1' },
        // …et 99 jours à 10 %. Une moyenne simple dirait 30 % ; la vérité est
        // proche de 10 %, et c'est celle que `aggregateMargin` rend.
        { consultant_id: CONSULTANT, daily_rate: '1000', loaded_daily_cost_cents: '90000', days: '99' },
      ],
    })
    const [row] = (await service.financeDigest(WORKSPACE_SCOPE, true)).consultants
    expect(row?.marginPercent).toBeCloseTo(10.4, 1)
    expect(row?.measured).toBe(2)
  })

  it('un placement n’est pas un positionnement — le compte se lit sur `mission_assignments`', async () => {
    const { service, queries } = makeService({ placements: [{ consultant_id: CONSULTANT, placements: '4' }] })
    await service.digest(WORKSPACE)
    const sql = queries.find(q => q.sql.includes('AS placements'))?.sql ?? ''
    expect(sql).toContain('mission_assignments')
    // ⚠️ La confusion que ce lot corrige : `talent.service.ts` comptait des
    // `submissions` — une PROPOSITION — et l'appelait « placements ».
    expect(sql).not.toContain('submissions')
    // Une mission qui n'a pas démarré n'est pas un placement.
    expect(sql).toContain('m.started_on')
  })

  it('un contact « qui a signé » se lit sur la facturation ET sur les rôles d’achat', async () => {
    const { service, queries } = makeService({
      contacts: [{ contact_id: CONTACT, account_id: ACCOUNT, signed_missions: '2' }],
    })
    const digest = await service.digest(WORKSPACE)
    expect(digest.contacts[0]?.signedMissions).toBe(2)
    const sql = queries.find(q => q.sql.includes('billing_contact_id'))?.sql ?? ''
    expect(sql).toContain('project_contacts')
    // Un UTILISATEUR n'a rien signé : le compter ferait d'un prospect un client.
    expect(sql).not.toContain('utilisateur')
    // `DISTINCT` : un contact à la fois destinataire de la facture ET acheteur
    // du projet compterait la même mission deux fois.
    expect(sql).toContain('COUNT(DISTINCT')
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Le droit financier voyage avec chaque agrégat                             */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('le droit financier voyage avec l’agrégat', () => {
  it('sans `finance:read`, la marge vaut `null` — PRÉSENTE et vide, jamais retirée', async () => {
    const { service } = makeService({
      margin: [{ consultant_id: CONSULTANT, daily_rate: '600', loaded_daily_cost_cents: '40000', days: '20' }],
    })
    const finance = await service.financeDigest(OWN_SCOPE, false)
    const [row] = finance.consultants
    // D45 : la clé reste, vide. Un client qui lit `undefined` ne peut pas
    // distinguer « on ne me l'envoie pas » d'« il n'y a pas de clé de ce nom ».
    expect(row).toHaveProperty('marginPercent')
    expect(row?.marginPercent).toBeNull()
    // Le DROIT accompagne la réponse : sans lui, « pas ton périmètre » et
    // « pas mesuré » deviennent le même `null`.
    expect(finance.canReadFinance).toBe(false)
    // Ce qui n'est PAS un montant reste lisible : combien de missions sont
    // entrées dans le calcul n'est pas une donnée financière.
    expect(row?.measured).toBe(1)
  })

  it('le tarif vendu moyen n’est PAS gardé — le prix de vente est visible par design', async () => {
    // Deux fausses alertes financières ont déjà été levées ici le 28/08/2026 :
    // ce qui se garde, c'est ce qui laisse REMONTER au coût.
    const { service } = makeService({
      accounts: [{ account_id: ACCOUNT, missions: '1', missions_without_rate: '0', average_daily_rate: '600' }],
    })
    expect((await service.digest(WORKSPACE)).accounts[0]?.averageSoldDailyRateCents).toBe(60_000)
  })

  it('une portée « mon périmètre » restreint le CA cumulé, elle ne l’efface pas', async () => {
    const { service, queries } = makeService({
      revenue: [
        {
          account_id: ACCOUNT,
          invoiced_cents: '900000',
          invoiced_months: '2',
          missions: '1',
          months_without_amount: '0',
        },
      ],
    })
    await service.financeDigest(OWN_SCOPE, false)
    const call = queries.find(q => q.sql.includes('invoice_readiness'))
    // La clause de portée vient de `financeScopeClause` — un seul noyau, celui
    // que les six lectures financières partagent déjà.
    expect(call?.sql).toContain('a.assigned_to')
    expect(call?.params).toContain(USER)
  })

  it('une portée « espace » n’ajoute aucune clause', async () => {
    const { service, queries } = makeService()
    await service.financeDigest(WORKSPACE_SCOPE, true)
    const call = queries.find(q => q.sql.includes('invoice_readiness'))
    expect(call?.sql).not.toContain('a.assigned_to')
    expect(call?.params).toEqual([WORKSPACE])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  La performance : une requête groupée, jamais N                            */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('le coût en requêtes ne dépend pas du nombre de comptes', () => {
  it('trois cents comptes coûtent les mêmes cinq requêtes qu’un seul', async () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        account_id: `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        missions: '2',
        missions_without_rate: '0',
        average_daily_rate: '600',
      }))

    const one = makeService({ accounts: many(1) })
    await one.service.digest(WORKSPACE)
    await one.service.financeDigest(WORKSPACE_SCOPE, true)

    const threeHundred = makeService({ accounts: many(300) })
    const digest = await threeHundred.service.digest(WORKSPACE)
    await threeHundred.service.financeDigest(WORKSPACE_SCOPE, true)

    expect(digest.accounts).toHaveLength(300)
    // Un agrégat par ligne rendrait l'écran inutilisable : c'est le défaut que
    // `loadedCostsByMission` et `assigneesByMission` avaient déjà corrigé.
    expect(threeHundred.queries).toHaveLength(one.queries.length)
    expect(threeHundred.queries).toHaveLength(5)
  })

  it('les agrégats ne portent que le compte demandé quand on en demande un', async () => {
    const { service, queries } = makeService({
      accounts: [
        { account_id: ACCOUNT, missions: '2', missions_without_rate: '0', average_daily_rate: '600' },
        { account_id: OTHER_ACCOUNT, missions: '1', missions_without_rate: '0', average_daily_rate: '700' },
      ],
    })
    const digest = await service.digest(WORKSPACE)
    // Le filtrage par fiche se fait CÔTÉ ÉCRAN sur la réponse groupée : une
    // requête par fiche ouverte rendrait la liste du portefeuille impossible.
    expect(digest.accounts.map(row => row.accountId)).toEqual([ACCOUNT, OTHER_ACCOUNT])
    expect(queries.filter(q => q.sql.includes('AVG(m.daily_rate)'))).toHaveLength(1)
  })
})
