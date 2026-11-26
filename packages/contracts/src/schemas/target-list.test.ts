import { describe, expect, it } from 'vitest'
import {
  TARGET_LIST_SOURCES,
  TARGET_LIST_STATUSES,
  TARGET_LIST_TYPES,
  TARGET_LIST_VISIBILITIES,
  TARGET_WORK_STATUSES,
  TARGET_WORK_STATUS_FLOW,
  addTargetListItemSchema,
  parseTierLabel,
  tierToPriority,
  countTargetListItems,
  createTargetListSchema,
  deriveTargetListType,
  isTargetItemReadyToWork,
  removeTargetListItemSchema,
  targetListCountsSchema,
  targetListItemSchema,
  targetListSchema,
  updateTargetListSchema,
} from './target-list.js'

const ITEM = {
  id: 'i1',
  target_list_id: 'l1',
  kind: 'account' as const,
  ref_id: 'a1',
  label: 'Banque Nord',
  sublabel: null,
  selection_reason: null,
  priority: null,
  owner_user_id: null,
  work_status: 'to_review' as const,
  provenance: 'manual' as const,
  refreshed_at: null,
  removed_at: null,
  removal_reason: null,
  next_action: null,
  notes: null,
  created_at: '2026-09-15T00:00:00.000Z',
  updated_at: '2026-09-15T00:00:00.000Z',
}

describe('#2156 — le modèle d’une cible commerciale', () => {
  describe('les statuts (#2156.34 à .48)', () => {
    it('la liste a les sept statuts demandés, dans l’ordre du parcours', () => {
      expect(TARGET_LIST_STATUSES).toEqual([
        'draft',
        'to_qualify',
        'ready',
        'in_progress',
        'paused',
        'done',
        'archived',
      ])
    })

    it('l’élément garde ses cinq statuts historiques EN TÊTE et ajoute les nouveaux EN FIN (GA-08)', () => {
      expect(TARGET_WORK_STATUSES.slice(0, 5)).toEqual(['to_review', 'in_progress', 'contacted', 'done', 'dropped'])
      expect(TARGET_WORK_STATUSES).toContain('to_enrich')
      expect(TARGET_WORK_STATUSES).toContain('ready_to_contact')
      expect(TARGET_WORK_STATUSES).toContain('replied')
      expect(TARGET_WORK_STATUSES).toContain('to_follow_up')
      // `to_review` est le défaut écrit en base depuis le premier jour.
      expect(TARGET_WORK_STATUSES[0]).toBe('to_review')
    })

    it('le parcours lisible est une permutation EXACTE de la taxonomie gelée', () => {
      expect([...TARGET_WORK_STATUS_FLOW].sort()).toEqual([...TARGET_WORK_STATUSES].sort())
    })

    it('« prêt à traiter » se dérive à UN seul endroit (GA-26)', () => {
      expect(isTargetItemReadyToWork('ready_to_contact')).toBe(true)
      expect(isTargetItemReadyToWork('to_review')).toBe(false)
      expect(isTargetItemReadyToWork('dropped')).toBe(false)
    })
  })

  describe('la composition (#2156.1 à .4 / .8)', () => {
    it('une liste de comptes seuls, de contacts seuls ou mixte se NOMME', () => {
      expect(TARGET_LIST_TYPES).toEqual(['accounts', 'contacts', 'mixed'])
      expect(deriveTargetListType([{ ...ITEM, kind: 'account' }])).toBe('accounts')
      expect(deriveTargetListType([{ ...ITEM, kind: 'contact' }])).toBe('contacts')
      expect(
        deriveTargetListType([
          { ...ITEM, kind: 'account' },
          { ...ITEM, id: 'i2', kind: 'contact' },
        ]),
      ).toBe('mixed')
    })

    it('une liste VIDE n’a pas de type — elle n’est pas « mixte »', () => {
      expect(deriveTargetListType([])).toBeNull()
    })

    it('un élément retiré ne compte pas dans le type de la liste', () => {
      expect(
        deriveTargetListType([
          { ...ITEM, kind: 'account' },
          { ...ITEM, id: 'i2', kind: 'contact', removed_at: '2026-09-15T10:00:00.000Z' },
        ]),
      ).toBe('accounts')
    })

    it('un élément référence une fiche et ne recopie jamais son contenu (#2156.4)', () => {
      const parsed = targetListItemSchema.parse({ ...ITEM, extra: 'copié' } as never)
      expect(parsed).not.toHaveProperty('extra')
      expect(parsed.ref_id).toBe('a1')
    })
  })

  describe('les compteurs (#2156.17 à .19)', () => {
    it('comptent les éléments encore dans la liste, retirés exclus', () => {
      const counts = countTargetListItems([
        { ...ITEM, work_status: 'to_review' },
        { ...ITEM, id: 'i2', work_status: 'ready_to_contact' },
        { ...ITEM, id: 'i3', work_status: 'to_review', removed_at: '2026-09-15T10:00:00.000Z' },
      ])
      expect(counts).toEqual({ measured: true, total: 2, ready_to_work: 1, to_review: 1 })
    })

    it('un compteur NON CALCULÉ n’est jamais « 0 » (GA-18 / GA-19)', () => {
      const unmeasured = targetListCountsSchema.parse({ measured: false, gap: 'portfolio_restricted' })
      expect(unmeasured).toEqual({ measured: false, gap: 'portfolio_restricted' })
      // Le zéro est REFUSÉ par le schéma quand rien n'a été mesuré : il n'y a
      // pas de champ où l'écrire.
      expect(() => targetListCountsSchema.parse({ measured: false, total: 0 })).toThrow()
    })
  })

  describe('la liste (#2156.5 à .22)', () => {
    it('porte les dix-huit champs promis', () => {
      const list = targetListSchema.parse({
        id: 'l1',
        name: 'Banques — T4',
        objective: 'Trois rendez-vous DSI',
        type: 'accounts',
        owner_user_id: null,
        team: 'BU Finance',
        visibility: 'workspace',
        source: 'discover',
        source_query: { secteur: 'banque' },
        status: 'in_progress',
        counts: { measured: true, total: 1, ready_to_work: 0, to_review: 1 },
        next_action: 'Caler trois appels',
        sequence_id: null,
        prospecting_session_id: null,
        created_by: 'u1',
        created_at: '2026-09-15T00:00:00.000Z',
        updated_at: '2026-09-15T00:00:00.000Z',
        items: [ITEM],
      })
      expect(list.type).toBe('accounts')
      expect(list.team).toBe('BU Finance')
      expect(list.source_query).toEqual({ secteur: 'banque' })
    })

    it('la visibilité et la source sont des taxonomies fermées', () => {
      expect(TARGET_LIST_VISIBILITIES).toEqual(['workspace', 'private'])
      expect(TARGET_LIST_SOURCES).toContain('saved_search')
      expect(createTargetListSchema.safeParse({ name: 'X', visibility: 'public' }).success).toBe(false)
      expect(createTargetListSchema.safeParse({ name: 'X', visibility: 'private' }).success).toBe(true)
    })

    it('une liste se crée en BROUILLON par défaut et son statut se corrige ensuite', () => {
      const created = createTargetListSchema.parse({ name: 'X' })
      expect(created.status).toBeUndefined()
      expect(updateTargetListSchema.safeParse({ status: 'archived' }).success).toBe(true)
      expect(updateTargetListSchema.safeParse({ status: 'supprimee' }).success).toBe(false)
    })
  })

  describe('le retrait (#2156.31)', () => {
    it('demande un motif, et ne propose AUCUNE suppression de fiche', () => {
      expect(removeTargetListItemSchema.safeParse({ reason: 'Déjà client' }).success).toBe(true)
      expect(removeTargetListItemSchema.safeParse({}).success).toBe(true)
      expect(Object.keys(removeTargetListItemSchema.shape)).toEqual(['reason'])
    })
  })
})

// #3753.1/.2/.6 — le tier de l'ESN (A/B/C) devient une priorité, sans jamais devenir une chance.
describe('#3753 — tier A/B/C', () => {
  it('lit « A », « Tier b », « c » ; tout le reste est une absence', () => {
    expect(parseTierLabel('A')).toBe('A')
    expect(parseTierLabel(' tier b ')).toBe('B')
    expect(parseTierLabel('Tier C')).toBe('C')
    expect(parseTierLabel('c')).toBe('C')
    expect(parseTierLabel('D')).toBeNull()
    expect(parseTierLabel('')).toBeNull()
    expect(parseTierLabel(undefined)).toBeNull()
    expect(parseTierLabel('60 %')).toBeNull()
  })

  it('A/B/C → high/medium/low', () => {
    expect(tierToPriority('A')).toBe('high')
    expect(tierToPriority('B')).toBe('medium')
    expect(tierToPriority('C')).toBe('low')
  })

  it('un élément porte tier_label et des hypothèses du vendeur, les deux nullables', () => {
    const parsed = targetListItemSchema.parse({
      ...ITEM,
      tier_label: 'A',
      seller_hypotheses: { addressable_issues: 'Migration cloud', upcoming_it_projects: null },
    })
    expect(parsed.tier_label).toBe('A')
    expect(targetListItemSchema.safeParse({ ...ITEM, tier_label: 'D' }).success).toBe(false)
    expect(targetListItemSchema.safeParse({ ...ITEM, tier_label: null, seller_hypotheses: null }).success).toBe(true)
  })

  it('addTargetListItemSchema accepte tier_label et seller_hypotheses', () => {
    const ok = addTargetListItemSchema.safeParse({
      kind: 'account',
      ref_id: '11111111-1111-4111-8111-111111111111',
      tier_label: 'B',
      seller_hypotheses: { addressable_issues: 'SI vieillissant' },
    })
    expect(ok.success).toBe(true)
  })
})
