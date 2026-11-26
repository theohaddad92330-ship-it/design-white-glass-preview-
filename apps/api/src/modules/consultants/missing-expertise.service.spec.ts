import { MissingExpertiseService } from './missing-expertise.service'

/**
 * Ce que le service ajoute à la fonction pure : la LECTURE et la RÉDACTION.
 *
 * Le seuil des trois refus et les règles de chiffrage sont testés dans
 * `packages/contracts/src/schemas/missing-expertise.test.ts`.
 */

type Row = Record<string, unknown>

function service(rows: Row[]): { svc: MissingExpertiseService; query: jest.Mock } {
  const query = jest.fn().mockResolvedValue(rows)
  return { svc: new MissingExpertiseService({ manager: { query } } as never), query }
}

function row(id: string, over: Row = {}): Row {
  return {
    id,
    title: 'Ingénieur plateforme',
    skills: [{ term: 'Kubernetes', required: true, level: 'confirmé' }],
    stack: [],
    refused_at: '2026-08-01T09:00:00.000Z',
    target_tjm_cents: '62000',
    start_on: '2026-09-01',
    duration_months: 1,
    ...over,
  }
}

const NOW = new Date('2026-08-20T00:00:00.000Z')

describe('MissingExpertiseService — la lecture des besoins refusés', () => {
  it('ne lit QUE les besoins refusés de l’espace, via la définition du contrat', async () => {
    const { svc, query } = service([])
    await svc.forWorkspace('w1', { canReadFinance: true, now: NOW })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('n.workspace_id = $1')
    // La définition d'un besoin refusé vient de `needStaffableRefusedSql`.
    expect(sql).toContain("n.staffable = 'no'")
    expect(params).toEqual(['w1'])
  })

  it('regroupe trois refus sur la compétence CANONIQUE, alias compris', async () => {
    // « k8s » et « Kube » écrits par trois commerciaux différents sont la même
    // absence dans le vivier. Comptés tels quels, aucun n'atteint trois.
    const { svc } = service([
      row('a', { skills: [{ term: 'k8s' }] }),
      row('b', { skills: [], stack: ['Kube'] }),
      row('c', { skills: [{ term: 'Kubernetes' }] }),
    ])
    const found = await svc.forWorkspace('w1', { canReadFinance: true, now: NOW })
    expect(found).toHaveLength(1)
    expect(found[0]?.skill).toBe('kubernetes')
    expect(found[0]?.refusedCount).toBe(3)
  })

  it('lit AUSSI la colonne historique `stack` — un besoin ancien n’a que celle-là', async () => {
    const { svc } = service([
      row('a', { skills: null, stack: ['Kubernetes'] }),
      row('b', { skills: null, stack: ['kubernetes'] }),
      row('c', { skills: null, stack: ['k8s'] }),
    ])
    const found = await svc.forWorkspace('w1', { canReadFinance: true, now: NOW })
    expect(found[0]?.refusedCount).toBe(3)
  })

  it('ÉCARTE un terme que le référentiel ne reconnaît pas', async () => {
    // Le garder tel quel ferait trois seaux d'un pour trois graphies.
    const { svc } = service([
      row('a', { skills: [{ term: 'zzzz-inconnu' }] }),
      row('b', { skills: [{ term: 'zzzz-inconnu' }] }),
      row('c', { skills: [{ term: 'zzzz-inconnu' }] }),
    ])
    expect(await svc.forWorkspace('w1', { canReadFinance: true, now: NOW })).toEqual([])
  })

  it('chiffre le CA non adressé à partir des TJM cibles saisis', async () => {
    const { svc } = service([row('a'), row('b'), row('c')])
    const found = await svc.forWorkspace('w1', { canReadFinance: true, now: NOW })
    // 620 €/j × 22 jours ouvrés de septembre 2026 × 3 besoins.
    expect(found[0]?.unaddressedRevenueCents).toBe(62_000 * 22 * 3)
    expect(found[0]?.cumulativeDayRateCents).toBe(186_000)
    expect(found[0]?.revenueState).toBe('measured')
    expect(found[0]?.countedNeeds).toBe(3)
  })

  it('COMPTE À PART un besoin sans TJM plutôt que d’inventer une moyenne', async () => {
    const { svc } = service([row('a'), row('b'), row('c', { target_tjm_cents: null })])
    const found = await svc.forWorkspace('w1', { canReadFinance: true, now: NOW })
    expect(found[0]?.unaddressedRevenueCents).toBe(62_000 * 22 * 2)
    expect(found[0]?.withoutRate).toBe(1)
    expect(found[0]?.refusedCount).toBe(3)
  })

  it('ne chiffre RIEN quand aucun besoin ne porte de durée — et le dit', async () => {
    const { svc } = service([
      row('a', { duration_months: null }),
      row('b', { duration_months: null }),
      row('c', { duration_months: null }),
    ])
    const found = await svc.forWorkspace('w1', { canReadFinance: true, now: NOW })
    expect(found[0]?.unaddressedRevenueCents).toBeNull()
    expect(found[0]?.revenueState).toBe('not_chiffrable')
    // Les trois refus restent affichables : c'est le message qui reste vrai.
    expect(found[0]?.refusedCount).toBe(3)
  })

  it('MASQUE les montants sans `finance:read`, et distingue masqué de non chiffrable', async () => {
    const { svc } = service([row('a'), row('b'), row('c')])
    const found = await svc.forWorkspace('w1', { canReadFinance: false, now: NOW })
    expect(found[0]?.unaddressedRevenueCents).toBeNull()
    expect(found[0]?.cumulativeDayRateCents).toBeNull()
    // ⚠️ Le seul champ qui empêche les deux `null` d'être indiscernables.
    expect(found[0]?.revenueState).toBe('hidden')
    // La clé reste PRÉSENTE et vide (D45), jamais retirée.
    expect('unaddressedRevenueCents' in (found[0] ?? {})).toBe(true)
  })

  it('n’expose aucun compte de refus faux quand la date est illisible', async () => {
    const { svc } = service([row('a', { refused_at: null }), row('b'), row('c')])
    expect(await svc.forWorkspace('w1', { canReadFinance: true, now: NOW })).toEqual([])
  })
})
