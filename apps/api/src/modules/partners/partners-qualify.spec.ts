import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PartnersService } from './partners.service'

/**
 * #2122.46 — QUALIFIER UNE RELATION QUE L'ESPACE CONNAÎT DÉJÀ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QUE CETTE ROUTE FERME, ET COMMENT IL S'EST CREUSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * L'onglet portait DEUX gestes positifs — « Qualifier » et « Vérifier
 * aujourd'hui » — et tous les deux étaient rendus derrière `isObservedOnly`,
 * c'est-à-dire « une ligne dont la SEULE origine de preuve est l'observation du
 * corpus ». Or `mergePartnerEvidence` pousse TOUJOURS `workspace_declared`
 * (source `declared`) ou `current_inference` (source `analysis`) dans les
 * origines d'une ligne canonique : le prédicat ne peut pas être vrai sur une
 * ligne de `landscape.partners`. Les deux CTA étaient donc inatteignables là,
 * et la seule sortie positive restante — `create` — refuse par un 400 un nom
 * déjà présent. Une ligne détectée par le pipeline, rang `unknown` et relation
 * `unknown`, n'avait aucun geste : exactement celle qu'il y a à qualifier.
 *
 * ⚠️ `source` N'EST PAS TOUCHÉ, et c'est délibéré. Le basculer en `declared`
 * fermerait « Ce n'est pas exact » (`dismiss` refuse une ligne déclarée à la
 * main) et couperait le rafraîchissement du pipeline, dont l'upsert ne met à
 * jour note / certitude / périmètre / date QUE `WHERE source = 'analysis'`.
 * La correction humaine est protégée sans ça : ce même upsert ne réécrit NI
 * `rank` NI `relationship` (`accounts.service.ts`, `seedDetectedPartners`).
 */
describe('PartnersService.qualify (#2122.46)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'p-1',
    workspace_id: 'w-1',
    account_id: 'a-1',
    entity_id: null,
    name: 'Sopra',
    rank: 'unknown',
    relationship: 'unknown',
    note: null,
    source: 'analysis',
    placements: 0,
    dismissed_at: null,
    created_at: new Date(),
    ...over,
  })

  const build = (found: unknown, partnerRelation: unknown = null) => {
    const partners = {
      findOne: jest.fn().mockResolvedValue(found),
      save: jest.fn(async (value: Record<string, unknown>) => value),
    }
    // #3404.5 — `null` par défaut : la plupart de ces tests ne parlent pas du
    // lien vers `partner_relations`.
    const partnerRelations = { findOne: jest.fn().mockResolvedValue(partnerRelation) }
    return {
      partners,
      partnerRelations,
      service: new PartnersService(
        partners as never,
        { find: jest.fn() } as never,
        { findOne: jest.fn(), find: jest.fn() } as never,
        partnerRelations as never,
        {} as never,
        {} as never,
        (() => false) as never,
      ),
    }
  }

  it('écrit le rang et la relation sur la ligne canonique', async () => {
    const { service, partners } = build(row())
    const saved = await service.qualify('w-1', 'p-1', { rank: 'rank1', relationship: 'competitor' })
    expect(saved.rank).toBe('rank1')
    expect(saved.relationship).toBe('competitor')
    expect(partners.save).toHaveBeenCalledTimes(1)
  })

  it('n’écrit QUE ce qui est dit : une relation seule laisse le rang intact', async () => {
    const { service } = build(row({ rank: 'rank2' }))
    const saved = await service.qualify('w-1', 'p-1', { relationship: 'partner' })
    expect(saved.rank).toBe('rank2')
    expect(saved.relationship).toBe('partner')
  })

  it('ne bascule PAS `source` — sinon « Ce n’est pas exact » se fermerait', async () => {
    const { service } = build(row())
    const saved = await service.qualify('w-1', 'p-1', { rank: 'rank1' })
    expect(saved.source).toBe('analysis')
  })

  it('refuse une ligne d’un autre espace', async () => {
    const { service } = build(null)
    await expect(service.qualify('w-2', 'p-1', { rank: 'rank1' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuse de qualifier une ligne ÉCARTÉE — la pierre tombale n’est pas un brouillon', async () => {
    const { service } = build(row({ dismissed_at: new Date() }))
    await expect(service.qualify('w-1', 'p-1', { rank: 'rank1' })).rejects.toBeInstanceOf(BadRequestException)
  })

  // #2316.34 — LE FAIT TERRAIN, écrit par le même geste, sans toucher au reste.
  it('écrit une information terrain SEULE, sans toucher au rang ni à la relation', async () => {
    const { service } = build(row({ rank: 'rank2', relationship: 'partner', note: 'Ancienne note' }))
    const saved = await service.qualify('w-1', 'p-1', { note: 'TMA reprise en interne au 01/09' })
    expect(saved.note).toBe('TMA reprise en interne au 01/09')
    expect(saved.rank).toBe('rank2')
    expect(saved.relationship).toBe('partner')
  })

  it('coupe les espaces et vide une note blanche en `null`', async () => {
    const { service } = build(row({ note: 'Ancienne note' }))
    const saved = await service.qualify('w-1', 'p-1', { note: '   ' })
    expect(saved.note).toBeNull()
  })

  it('`null` efface la note, `undefined` la laisse intacte', async () => {
    const { service } = build(row({ note: 'Ancienne note' }))
    const saved = await service.qualify('w-1', 'p-1', { note: null })
    expect(saved.note).toBeNull()

    const { service: other } = build(row({ note: 'Intacte' }))
    const untouched = await other.qualify('w-1', 'p-1', { rank: 'rank1' })
    expect(untouched.note).toBe('Intacte')
  })

  // #2316.22-.27 — les cinq critères de qualification rang2, écrits par le
  // même geste que rank/relationship/note, sans se toucher entre eux.
  it('écrit un critère de qualification rang2 seul, sans toucher aux autres', async () => {
    const { service } = build(row({ rank: 'rank2', rank2_brief_precise: null }))
    const saved = await service.qualify('w-1', 'p-1', { rank2_brief_precise: true })
    expect(saved.rank2_brief_precise).toBe(true)
    expect(saved.rank2_scope_accessible).toBeNull()
  })

  it('`null` repasse un critère à « non mesuré », `undefined` le laisse intact', async () => {
    const { service } = build(row({ rank2_scope_accessible: true }))
    const saved = await service.qualify('w-1', 'p-1', { rank2_scope_accessible: null })
    expect(saved.rank2_scope_accessible).toBeNull()

    const { service: other } = build(row({ rank2_scope_accessible: true }))
    const untouched = await other.qualify('w-1', 'p-1', { rank: 'rank1' })
    expect(untouched.rank2_scope_accessible).toBe(true)
  })

  // #3205.4 (épopée #3239) — risque concurrentiel, complémentarité et
  // prochaine vérification, écrits par le MÊME formulaire générique.
  it('écrit le risque concurrentiel et la complémentarité, sans se toucher entre eux', async () => {
    const { service } = build(row())
    const saved = await service.qualify('w-1', 'p-1', {
      competitive_risk: 'Concurrent sur le périmètre data',
      complementarity: null,
    })
    expect(saved.competitive_risk).toBe('Concurrent sur le périmètre data')
    expect(saved.complementarity).toBeNull()
  })

  it('`undefined` laisse le risque concurrentiel intact, `null` l’efface', async () => {
    const { service } = build(row({ competitive_risk: 'Concurrent direct' }))
    const untouched = await service.qualify('w-1', 'p-1', { rank: 'rank1' })
    expect(untouched.competitive_risk).toBe('Concurrent direct')

    const { service: other } = build(row({ competitive_risk: 'Concurrent direct' }))
    const cleared = await other.qualify('w-1', 'p-1', { competitive_risk: null })
    expect(cleared.competitive_risk).toBeNull()
  })

  it('écrit la prochaine date de vérification', async () => {
    const { service } = build(row())
    const saved = await service.qualify('w-1', 'p-1', { next_verification_at: '2026-12-01' })
    expect(saved.next_verification_at).toBe(new Date('2026-12-01').toISOString())
  })

  // #3404.5 — LE LIEN VERS LA RELATION GOUVERNÉE (`partner_relations`), qui
  // fait du rang 2 un objet métier structuré plutôt qu'un badge.
  describe('le lien vers `partner_relations` (#3404.5)', () => {
    it('pose le lien quand la relation existe dans le MÊME espace', async () => {
      const { service, partnerRelations } = build(row({ rank: 'rank2' }), { id: 'rel-1', workspaceId: 'w-1' })
      const saved = await service.qualify('w-1', 'p-1', { partner_relation_id: 'rel-1' })
      expect(saved.partner_relation_id).toBe('rel-1')
      expect(partnerRelations.findOne).toHaveBeenCalledWith({ where: { id: 'rel-1', workspaceId: 'w-1' } })
    })

    it('refuse un id qui ne désigne aucune relation de cet espace', async () => {
      const { service } = build(row({ rank: 'rank2' }), null)
      await expect(service.qualify('w-1', 'p-1', { partner_relation_id: 'rel-ailleurs' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('`null` rompt le lien, `undefined` le laisse intact', async () => {
      const { service } = build(row({ partner_relation_id: 'rel-1' }))
      const cleared = await service.qualify('w-1', 'p-1', { partner_relation_id: null })
      expect(cleared.partner_relation_id).toBeNull()

      const { service: other } = build(row({ partner_relation_id: 'rel-1' }))
      const untouched = await other.qualify('w-1', 'p-1', { rank: 'rank1' })
      expect(untouched.partner_relation_id).toBe('rel-1')
    })
  })
})
