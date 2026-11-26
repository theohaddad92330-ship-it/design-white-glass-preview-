import { describe, expect, it } from 'vitest'
import {
  addLegalContractDocumentSchema,
  createLegalContractSchema,
  legalContractChainNoGo,
  legalContractCoverage,
  legalContractLifecycle,
  legalContractSchema,
  nextLegalContractDocumentVersion,
  visibleLegalContractDocuments,
  type LegalContract,
  type LegalContractDocument,
} from './contract.js'

const NOW = new Date('2026-09-27T12:00:00.000Z')

function contract(over: Partial<Pick<LegalContract, 'status' | 'startsOn' | 'endsOn'>> = {}) {
  return { status: 'signed' as const, startsOn: '2026-01-01', endsOn: '2026-12-31', ...over }
}

describe('legalContractLifecycle', () => {
  it('reste `draft` quelles que soient les dates — un brouillon ne devient jamais actif tout seul', () => {
    expect(legalContractLifecycle(contract({ status: 'draft', endsOn: '2020-01-01' }), NOW)).toBe('draft')
  })

  it('est `terminated` dès que le statut déclaré l’est, même en cours de fenêtre', () => {
    expect(legalContractLifecycle(contract({ status: 'terminated', endsOn: '2030-01-01' }), NOW)).toBe('terminated')
  })

  it('est `active` signé, sans fin, ou avec une fin lointaine', () => {
    expect(legalContractLifecycle(contract({ endsOn: null }), NOW)).toBe('active')
    expect(legalContractLifecycle(contract({ endsOn: '2027-06-01' }), NOW)).toBe('active')
  })

  it('est `expiring_soon` dans les 30 jours avant la fin, `expired` après', () => {
    expect(legalContractLifecycle(contract({ endsOn: '2026-10-10' }), NOW)).toBe('expiring_soon')
    expect(legalContractLifecycle(contract({ endsOn: '2026-09-01' }), NOW)).toBe('expired')
  })
})

describe('legalContractChainNoGo', () => {
  const LEGAL_A = '11111111-1111-1111-1111-111111111111'
  const LEGAL_B = '22222222-2222-2222-2222-222222222222'

  it('rend `null` sans aucune donnée croisée — on ne bloque pas sur une information qu’on n’a pas', () => {
    expect(
      legalContractChainNoGo({
        contract: { legalEntityId: null, source: 'unknown' },
        mission: { legalEntityId: null, channel: 'unknown' },
      }),
    ).toBeNull()
  })

  it('rend `wrong_legal_entity` quand la mission facture sous une société différente du contrat', () => {
    expect(
      legalContractChainNoGo({
        contract: { legalEntityId: LEGAL_A, source: 'unknown' },
        mission: { legalEntityId: LEGAL_B, channel: 'unknown' },
      }),
    ).toBe('wrong_legal_entity')
  })

  it('ne bloque pas quand un seul des deux côtés connaît sa société', () => {
    expect(
      legalContractChainNoGo({
        contract: { legalEntityId: null, source: 'unknown' },
        mission: { legalEntityId: LEGAL_B, channel: 'unknown' },
      }),
    ).toBeNull()
  })

  it('rend `partner_skipped` quand le contrat passe par un intermédiaire mais la mission facture en direct', () => {
    expect(
      legalContractChainNoGo({
        contract: { legalEntityId: null, source: 'partner' },
        mission: { legalEntityId: null, channel: 'direct' },
      }),
    ).toBe('partner_skipped')
    expect(
      legalContractChainNoGo({
        contract: { legalEntityId: null, source: 'subcontracting' },
        mission: { legalEntityId: null, channel: 'direct' },
      }),
    ).toBe('partner_skipped')
    expect(
      legalContractChainNoGo({
        contract: { legalEntityId: null, source: 'portage' },
        mission: { legalEntityId: null, channel: 'direct' },
      }),
    ).toBe('partner_skipped')
  })

  it('ne bloque pas un contrat intermédié dont la mission suit la même voie', () => {
    expect(
      legalContractChainNoGo({
        contract: { legalEntityId: null, source: 'partner' },
        mission: { legalEntityId: null, channel: 'partner' },
      }),
    ).toBeNull()
  })
})

describe('legalContractCoverage', () => {
  const LEGAL_A = '11111111-1111-1111-1111-111111111111'
  const LEGAL_B = '22222222-2222-2222-2222-222222222222'

  it('rend `undefined` quand la mission ne connaît pas sa société — on ne bloque pas sur une comparaison qu’on ne peut pas faire', () => {
    expect(legalContractCoverage({ legalEntityId: null }, [contract({ endsOn: null })], NOW)).toBeUndefined()
  })

  it('rend `undefined` quand aucun contrat de l’espace ne partage la société de la mission', () => {
    expect(
      legalContractCoverage(
        { legalEntityId: LEGAL_B },
        [{ ...contract({ endsOn: null }), legalEntityId: LEGAL_A }],
        NOW,
      ),
    ).toBeUndefined()
  })

  it('rend `covered` dès qu’un contrat qui matche est actif', () => {
    expect(
      legalContractCoverage(
        { legalEntityId: LEGAL_A },
        [{ ...contract({ endsOn: null }), legalEntityId: LEGAL_A }],
        NOW,
      ),
    ).toBe('covered')
  })

  it('rend `covered` avec un contrat bientôt expiré — pas encore un blocage', () => {
    expect(
      legalContractCoverage(
        { legalEntityId: LEGAL_A },
        [{ ...contract({ endsOn: '2026-10-10' }), legalEntityId: LEGAL_A }],
        NOW,
      ),
    ).toBe('covered')
  })

  it('rend `uncovered` quand le seul contrat qui matche est expiré', () => {
    expect(
      legalContractCoverage(
        { legalEntityId: LEGAL_A },
        [{ ...contract({ endsOn: '2026-01-01' }), legalEntityId: LEGAL_A }],
        NOW,
      ),
    ).toBe('uncovered')
  })

  it('rend `uncovered` quand le seul contrat qui matche est un brouillon, malgré des dates actives', () => {
    expect(
      legalContractCoverage(
        { legalEntityId: LEGAL_A },
        [{ ...contract({ status: 'draft', endsOn: null }), legalEntityId: LEGAL_A }],
        NOW,
      ),
    ).toBe('uncovered')
  })

  it('rend `covered` si AU MOINS un des contrats qui matchent est actif, même si un autre est résilié', () => {
    expect(
      legalContractCoverage(
        { legalEntityId: LEGAL_A },
        [
          { ...contract({ status: 'terminated', endsOn: null }), legalEntityId: LEGAL_A },
          { ...contract({ endsOn: null }), legalEntityId: LEGAL_A },
        ],
        NOW,
      ),
    ).toBe('covered')
  })

  it('ignore les contrats d’une AUTRE société — n’en tient compte pour aucun sens', () => {
    expect(
      legalContractCoverage(
        { legalEntityId: LEGAL_A },
        [{ ...contract({ endsOn: null }), legalEntityId: LEGAL_B }],
        NOW,
      ),
    ).toBeUndefined()
  })
})

describe('createLegalContractSchema', () => {
  it('refuse une fin avant le début', () => {
    const result = createLegalContractSchema.safeParse({
      type: 'framework',
      label: 'Contrat-cadre',
      counterpartyName: 'Client SA',
      startsOn: '2026-06-01',
      endsOn: '2026-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('accepte le minimum et pose les défauts', () => {
    const result = createLegalContractSchema.parse({
      type: 'framework',
      label: 'Contrat-cadre',
      counterpartyName: 'Client SA',
    })
    expect(result.status).toBe('draft')
    expect(result.source).toBe('unknown')
    expect(result.autoRenew).toBe(false)
    expect(result.confidential).toBe(false)
  })
})

describe('legalContractSchema', () => {
  it('valide une vue complète', () => {
    const result = legalContractSchema.safeParse({
      id: '33333333-3333-3333-3333-333333333333',
      workspaceId: '44444444-4444-4444-4444-444444444444',
      accountId: '55555555-5555-5555-5555-555555555555',
      type: 'framework',
      label: 'Contrat-cadre 2026',
      counterpartyName: 'Client SA',
      legalEntityId: null,
      legalEntityName: null,
      ownerId: null,
      ownerName: null,
      startsOn: '2026-01-01',
      endsOn: null,
      scope: null,
      tariffNote: null,
      volumeNote: null,
      capAmountCents: null,
      paymentTermsDays: null,
      paymentTermsBasis: null,
      noticeDays: null,
      autoRenew: false,
      documents: [],
      source: 'unknown',
      status: 'draft',
      confidential: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })
})

describe('pièces d’un contrat — permission par pièce (#2422.10, lot X54)', () => {
  const piece = (over: Partial<LegalContractDocument>): LegalContractDocument => ({
    label: 'Contrat signé',
    url: null,
    version: 1,
    signedAt: null,
    expiresOn: null,
    visibility: 'workspace',
    ...over,
  })
  const docs = [
    piece({ label: 'Cadre', visibility: 'workspace' }),
    piece({ label: 'Grille tarifaire', visibility: 'finance' }),
    piece({ label: 'Clause personnelle', visibility: 'owner' }),
  ]

  it('un membre ordinaire ne voit que les pièces ouvertes à l’espace — les autres ne font AUCUNE ligne', () => {
    const seen = visibleLegalContractDocuments(docs, { canReadFinance: false, isOwner: false })
    expect(seen.map(d => d.label)).toEqual(['Cadre'])
  })

  it('le droit finance ouvre les pièces finance et propriétaire', () => {
    const seen = visibleLegalContractDocuments(docs, { canReadFinance: true, isOwner: false })
    expect(seen.map(d => d.label)).toEqual(['Cadre', 'Grille tarifaire', 'Clause personnelle'])
  })

  it('le propriétaire du contrat voit sa pièce propriétaire mais PAS la pièce finance', () => {
    const seen = visibleLegalContractDocuments(docs, { canReadFinance: false, isOwner: true })
    expect(seen.map(d => d.label)).toEqual(['Cadre', 'Clause personnelle'])
  })

  it('une pièce sans visibilité (ligne antérieure) reste ouverte à l’espace — jamais masquée par défaut', () => {
    const legacy = { label: 'Ancienne', url: null, version: 1, signedAt: null, expiresOn: null }
    expect(visibleLegalContractDocuments([legacy], { canReadFinance: false, isOwner: false })).toHaveLength(1)
  })

  it('la version suit le libellé : la première est 1, un dépôt du même libellé fait +1, un autre libellé repart à 1', () => {
    expect(nextLegalContractDocumentVersion([], 'Cadre')).toBe(1)
    expect(nextLegalContractDocumentVersion([piece({ label: 'Cadre', version: 2 })], ' cadre ')).toBe(3)
    expect(nextLegalContractDocumentVersion([piece({ label: 'Cadre', version: 2 })], 'Avenant')).toBe(1)
  })

  it('le dépôt d’une pièce refuse une date mal formée et une visibilité inconnue', () => {
    expect(addLegalContractDocumentSchema.safeParse({ label: 'X', expiresOn: '12/2026' }).success).toBe(false)
    expect(addLegalContractDocumentSchema.safeParse({ label: 'X', visibility: 'public' }).success).toBe(false)
    const ok = addLegalContractDocumentSchema.parse({ label: 'X' })
    expect(ok).toMatchObject({ url: null, signedAt: null, expiresOn: null, visibility: 'workspace' })
  })

  it('une pièce dont l’URL n’est pas http(s) est refusée', () => {
    expect(addLegalContractDocumentSchema.safeParse({ label: 'X', url: 'javascript:alert(1)' }).success).toBe(false)
    expect(addLegalContractDocumentSchema.safeParse({ label: 'X', url: 'https://exemple.test/a.pdf' }).success).toBe(
      true,
    )
  })
})
