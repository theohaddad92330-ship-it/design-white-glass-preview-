import { buildAccessBySiren } from './partner-access-by-siren'

/**
 * #3181.4 / #3247 — le LIEN SIREN partenaire↔client : « ce compte est-il accessible via un
 * partenaire ? » se lit sur le SIREN du client (comptes de l'espace) et le SIREN du partenaire
 * (relations de l'espace). Jamais un rapprochement sur le nom seul.
 */
describe('buildAccessBySiren', () => {
  const account = { id: 'a-1', siren: '111111111', group_head_siren: null as string | null }
  const row = (over: Record<string, unknown> = {}) => ({
    account_id: 'a-1',
    name: 'Alpha Conseil',
    rank: 'rank2',
    relationship: 'partner',
    source: 'declared',
    placements: 0,
    partner_relation_id: null as string | null,
    ...over,
  })

  it('un compte possédé avec un partenaire déclaré → un chemin nommé, avec son rang et sa source', () => {
    const out = buildAccessBySiren({ sirens: ['111111111'], accounts: [account], partnerRows: [row()], relations: [] })
    expect(out['111111111']?.paths).toEqual([
      {
        partner_name: 'Alpha Conseil',
        partner_siren: null,
        rank: 'rank2',
        relationship: 'partner',
        source: 'declared',
        placements: 0,
        via_group: false,
      },
    ])
  })

  it('le SIREN du partenaire vient de sa relation de l’espace, jamais du nom', () => {
    const out = buildAccessBySiren({
      sirens: ['111111111'],
      accounts: [account],
      partnerRows: [row({ partner_relation_id: 'r-1' })],
      relations: [{ id: 'r-1', siren: '222222222', name: 'Alpha Conseil', stage: 'actif' }],
    })
    expect(out['111111111']?.paths[0]?.partner_siren).toBe('222222222')
  })

  it('un concurrent ou une relation inconnue n’est PAS un chemin d’accès', () => {
    const out = buildAccessBySiren({
      sirens: ['111111111'],
      accounts: [account],
      partnerRows: [
        row({ relationship: 'competitor', rank: 'rank1' }),
        row({ name: 'X', relationship: 'unknown', rank: 'unknown' }),
      ],
      relations: [],
    })
    expect(out['111111111']?.paths).toEqual([])
  })

  it('un SIREN sans compte possédé → absent (jamais un « aucun chemin » affirmé)', () => {
    const out = buildAccessBySiren({ sirens: ['999999999'], accounts: [account], partnerRows: [row()], relations: [] })
    expect(out['999999999']).toBeUndefined()
  })

  it('un candidat qui EST un partenaire de l’espace (même SIREN) est nommé partenaire', () => {
    const out = buildAccessBySiren({
      sirens: ['222222222'],
      accounts: [],
      partnerRows: [],
      relations: [{ id: 'r-1', siren: '222222222', name: 'Alpha Conseil', stage: 'actif' }],
    })
    expect(out['222222222']?.is_workspace_partner).toEqual({ name: 'Alpha Conseil', stage: 'actif' })
    expect(out['222222222']?.paths).toEqual([])
  })

  it('deux comptes possédés pour un même SIREN : les chemins des deux, sans doublon de partenaire', () => {
    const out = buildAccessBySiren({
      sirens: ['111111111'],
      accounts: [account, { id: 'a-2', siren: '111111111', group_head_siren: null }],
      partnerRows: [row(), row({ account_id: 'a-2' })],
      relations: [],
    })
    expect(out['111111111']?.paths).toHaveLength(1)
  })

  /**
   * #3247 (décision Louis 14/10) — ÉLARGIR le périmètre : un candidat jamais
   * ajouté au portefeuille (« hors portefeuille ») obtient un chemin d'accès
   * quand il est la TÊTE DE GROUPE d'un compte POSSÉDÉ — donnée déjà persistée
   * par l'analyse Phase 1 (`accounts.group_head_siren`, Pappers, zéro appel
   * supplémentaire), jamais une donnée inventée. Jamais entre espaces
   * (GA-43) : la même borne `workspace_id` que le reste de la lecture.
   */
  describe('#3247 (décision Louis 14/10) — élargi aux comptes hors portefeuille, via le groupe', () => {
    const subsidiary = { id: 'a-sub', siren: '333333333', group_head_siren: '999999999' }

    it('la TÊTE DE GROUPE d’une filiale possédée avec un partenaire déclaré → un chemin, marqué `via_group`', () => {
      const out = buildAccessBySiren({
        sirens: ['999999999'],
        accounts: [subsidiary],
        partnerRows: [row({ account_id: 'a-sub' })],
        relations: [],
      })
      expect(out['999999999']?.paths).toEqual([
        {
          partner_name: 'Alpha Conseil',
          partner_siren: null,
          rank: 'rank2',
          relationship: 'partner',
          source: 'declared',
          placements: 0,
          via_group: true,
        },
      ])
    })

    it('un chemin direct (compte lui-même possédé) n’est PAS marqué `via_group`', () => {
      const out = buildAccessBySiren({
        sirens: ['111111111'],
        accounts: [account],
        partnerRows: [row()],
        relations: [],
      })
      expect(out['111111111']?.paths[0]?.via_group).toBe(false)
    })

    it('sait dire NON : une filiale SANS tête de groupe connue (`group_head_siren: null`) ne crée aucun chemin fabriqué', () => {
      const out = buildAccessBySiren({
        sirens: ['999999999'],
        accounts: [{ id: 'a-sub', siren: '333333333', group_head_siren: null }],
        partnerRows: [row({ account_id: 'a-sub' })],
        relations: [],
      })
      expect(out['999999999']).toBeUndefined()
    })

    it('ne mélange pas deux têtes de groupe : la filiale d’un AUTRE groupe n’ouvre rien', () => {
      const out = buildAccessBySiren({
        sirens: ['777777777'],
        accounts: [subsidiary],
        partnerRows: [row({ account_id: 'a-sub' })],
        relations: [],
      })
      expect(out['777777777']).toBeUndefined()
    })
  })
})
