import type { Repository } from 'typeorm'
import type { TargetListItemEntity } from '../../database/entities/target-list-item.entity'
import { SellerHypothesesReader, withDiscoverOrigin } from './seller-hypotheses.reader'

/**
 * #3753.3 — la phase 1 de l'analyse lit ce que l'ESN a dit de CE compte dans son
 * ciblage (tier, raison, problématiques, projets IT). Jamais autre chose, jamais
 * hors de l'espace, jamais un élément retiré de la liste.
 */
function makeReader(rows: Partial<TargetListItemEntity>[]) {
  const find = jest.fn(async () => rows as TargetListItemEntity[])
  const reader = new SellerHypothesesReader({ find } as unknown as Repository<TargetListItemEntity>)
  return { reader, find }
}

describe('SellerHypothesesReader', () => {
  it('rend le ciblage du vendeur pour ce compte, borné à son espace et aux éléments vivants', async () => {
    const { reader, find } = makeReader([
      {
        tier_label: 'A',
        selection_reason: 'Plan de transformation SI',
        seller_hypotheses: { addressable_issues: 'Dette applicative', upcoming_it_projects: 'Migration ERP' },
      },
    ])
    const out = await reader.forAccount('acc-1', 'ws-1')

    expect(out).toEqual({
      tier_label: 'A',
      selection_reason: 'Plan de transformation SI',
      addressable_issues: 'Dette applicative',
      upcoming_it_projects: 'Migration ERP',
    })
    const where = (find.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where
    expect(where['account_id']).toBe('acc-1')
    expect(where['workspace_id']).toBe('ws-1')
    expect(where).toHaveProperty('removed_at')
  })

  it('rend undefined quand le compte n’est dans aucune liste : rien ne s’invente', async () => {
    expect(await makeReader([]).reader.forAccount('acc-1', 'ws-1')).toBeUndefined()
  })

  it('rend undefined quand l’élément ne porte ni tier, ni raison, ni hypothèse', async () => {
    const { reader } = makeReader([{ tier_label: null, selection_reason: null, seller_hypotheses: null }])
    expect(await reader.forAccount('acc-1', 'ws-1')).toBeUndefined()
  })

  it('sans espace, ne lit rien', async () => {
    const { reader, find } = makeReader([])
    expect(await reader.forAccount('acc-1', null)).toBeUndefined()
    expect(find).not.toHaveBeenCalled()
  })

  it('une panne de lecture ne bloque jamais l’analyse', async () => {
    const reader = new SellerHypothesesReader({
      find: jest.fn(async () => {
        throw new Error('db down')
      }),
    } as unknown as Repository<TargetListItemEntity>)
    expect(await reader.forAccount('acc-1', 'ws-1')).toBeUndefined()
  })
})

describe('withDiscoverOrigin — #4646', () => {
  it('transporte les compétences et les offres de Découvrir sous forme structurée', () => {
    const out = withDiscoverOrigin(undefined, {
      reason: null,
      criteria: { skills: ['java'], offers: [{ title: 'Dev Java', date: '2026-10-20', seen: '2026-10-27' }] },
    })
    expect(out?.discover_origin_skills).toEqual(['java'])
    expect(out?.discover_origin_offers).toEqual([{ title: 'Dev Java', date: '2026-10-20', seen: '2026-10-27' }])
  })

  it('#4646.2 le lien de l’annonce voyage avec l’offre', () => {
    const offers = [{ title: 'Dev Java', url: 'https://offres.example.org/a', seen: '2026-10-27' }]
    expect(withDiscoverOrigin(undefined, { reason: null, criteria: { offers } })?.discover_origin_offers).toEqual(
      offers,
    )
  })

  it('hors Découvrir, rien n’est ajouté', () => {
    expect(withDiscoverOrigin(undefined, undefined)).toBeUndefined()
    const out = withDiscoverOrigin(undefined, { reason: 'raison', criteria: { zone: 'Lille' } })
    expect(out).not.toHaveProperty('discover_origin_skills')
    expect(out).not.toHaveProperty('discover_origin_offers')
  })
})
