import { ContactsService } from './contacts.service'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande. `null` =
 *  aucune adresse déclarée par l'espace, donc repli sur l'environnement. */
/**
 * Le service de marque, réduit à ce que le code testé lui demande : la marque
 * du PRODUIT, c'est-à-dire un espace qui n'a rien posé — et `null` pour
 * l'adresse d'expédition, donc repli sur celle d'environnement.
 */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * Écarter un contact (PDF 2, items 82-83 — décision de Louis du 21/08).
 *
 * L'état `rejete` vivait dans l'énumération du cycle de vie depuis des mois et
 * son drapeau n'était JAMAIS posé. Ce qui manquait n'était pas la colonne mais
 * les deux réponses produit : qui peut, et que devient une séquence en cours.
 */
describe('exclusion d’un contact', () => {
  const contact = { id: 'c-1', user_id: 'u-1' }
  let repo: {
    findOne: jest.Mock
    find: jest.Mock
    update: jest.Mock
    manager: { query: jest.Mock }
  }
  let service: ContactsService

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(contact),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: { query: jest.fn().mockResolvedValue([[{ id: 's-1' }, { id: 's-2' }], 2]) },
    }
    // Les treize dépendances suivantes ne sont pas touchées par ce chemin :
    // écarter un contact lit une ligne, écrit deux colonnes et annule des
    // séquences. Les mocker toutes ferait croire le contraire.
    service = new ContactsService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      brandsStub as never,
    )
  })

  it('refuse un motif vide AVANT toute écriture', async () => {
    // C'est le seul apprentissage que produit un « non ». Sans lui, on relit
    // dans six mois une liste de contacts disparus sans savoir lesquels ont
    // quitté l'entreprise et lesquels ont demandé qu'on les laisse tranquilles.
    const result = await service.excludeContact('c-1', 'u-1', '   ')
    expect(result.type).toBe('failure')
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.manager.query).not.toHaveBeenCalled()
  })

  it('ARRÊTE les séquences en cours et le dit', async () => {
    // Continuer d'écrire à quelqu'un qu'on vient d'exclure est la faute la plus
    // visible qu'un outil de prospection puisse commettre — et elle serait
    // commise par l'outil, pas par l'utilisateur.
    const result = await service.excludeContact('c-1', 'u-1', 'A quitté l’entreprise')
    expect(result.type).toBe('success')
    if (result.type !== 'success') return
    expect(result.output.cancelled_sequences).toBe(2)
    expect(repo.manager.query.mock.calls[0]?.[0]).toContain(`status = 'cancelled'`)
    expect(repo.manager.query.mock.calls[0]?.[0]).toContain(`'active'`)
  })

  // #4293.3 — l'arrêt sur EXCLUSION est codé côté moteur : une séquence en pause s'arrête aussi, ses étapes à venir
  // sont sautées, et l'arrêt est journalisé avec sa cause (la fiche séquence peut la nommer).
  it('#4293.3 — arrête aussi une séquence EN PAUSE, saute ses étapes, journalise la cause', async () => {
    await service.excludeContact('c-1', 'u-1', 'Ne souhaite plus être contacté')
    const sqls = repo.manager.query.mock.calls.map(call => String(call[0]))
    expect(sqls[0]).toContain(`status IN ('active', 'paused')`)
    expect(sqls.some(sql => sql.includes('outreach_sequence_steps') && sql.includes(`'skipped'`))).toBe(true)
    const transition = repo.manager.query.mock.calls.find(call => String(call[0]).includes('outreach_transitions'))
    expect(transition?.[1]).toContain('contact_removed')
  })

  it('marque le contact AVANT d’annuler les séquences', async () => {
    // L'ordre inverse laisserait une fenêtre où une relance peut partir sur un
    // contact déjà écarté.
    const order: string[] = []
    repo.update.mockImplementation(async () => {
      order.push('mark')
      return { affected: 1 }
    })
    repo.manager.query.mockImplementation(async () => {
      order.push('cancel')
      return [[], 0]
    })
    await service.excludeContact('c-1', 'u-1', 'Ne souhaite plus être contacté')
    expect(order).toEqual(['mark', 'cancel'])
  })

  it('réintégrer efface le motif AVEC l’exclusion', async () => {
    // Le garder ferait croire qu'il vaut encore.
    const result = await service.restoreContact('c-1', 'u-1')
    expect(result.type).toBe('success')
    expect(repo.update).toHaveBeenCalledWith({ id: 'c-1' }, { excluded_at: null, exclusion_reason: null })
  })

  it('refuse un contact qui n’appartient pas à l’appelant', async () => {
    repo.findOne.mockResolvedValue(null)
    const result = await service.excludeContact('c-1', 'u-1', 'motif')
    expect(result.type).toBe('failure')
  })
  describe('rattrapage du périmètre géographique (#3742, #3744)', () => {
    const row = (id: string, raw: Record<string, unknown> | null, location: string | null = null) => ({
      id,
      raw_data: raw,
      location,
    })

    it('écarte (sans supprimer) les contacts étrangers déjà au dossier, garde les inconnus', async () => {
      repo.find.mockResolvedValue([
        row('fr', { country: 'France', city: 'Paris' }),
        row('es', { country: 'Spain', city: 'Madrid' }),
        row('in', { country: 'India' }),
        row('inconnu', null),
        row('loc', null, 'Pune, India'),
      ])
      const n = await service.excludeOutsideGeoPerimeter('a-1', { geo_perimeter: 'france' })
      expect(n).toBe(3)
      const [where, patch] = repo.update.mock.calls[0] as [{ id: { _value: string[] } }, Record<string, unknown>]
      expect(where.id._value).toEqual(['es', 'in', 'loc'])
      expect(patch['exclusion_reason']).toContain('France')
      expect(patch['excluded_at']).toBeInstanceOf(Date)
    })

    // #3742 — la zone est dans le TITRE, la fiche ne dit pas le pays (Schneider, 10/10).
    it('écarte un contact dont le titre dit une zone étrangère, garde Head of France et le sans-lieu', async () => {
      repo.find.mockResolvedValue([
        { ...row('nordics', null), title: 'VP Nordics' },
        { ...row('cee', null), title: 'Chief Digital Officer CEE' },
        { ...row('fr', null), title: 'Head of France' },
        { ...row('europe', null), title: 'VP Europe' },
        { ...row('rien', null), title: null },
        { ...row('alcampo', { apolloDetails: { organization: 'Alcampo' } }), title: 'Directeur' },
      ])
      const n = await service.excludeOutsideGeoPerimeter('a-1', { geo_perimeter: 'france' })
      expect(n).toBe(3)
      const [where] = repo.update.mock.calls[0] as [{ id: { _value: string[] } }]
      expect(where.id._value).toEqual(['nordics', 'cee', 'alcampo'])
    })

    it('arrête les séquences actives des contacts écartés', async () => {
      repo.find.mockResolvedValue([row('es', { country: 'Spain' })])
      await service.excludeOutsideGeoPerimeter('a-1', { geo_perimeter: 'france' })
      expect(repo.manager.query).toHaveBeenCalledWith(expect.stringContaining("status = 'cancelled'"), [['es']])
    })

    it('ne lit ni ne touche rien sans périmètre France/Europe', async () => {
      expect(await service.excludeOutsideGeoPerimeter('a-1', undefined)).toBe(0)
      expect(await service.excludeOutsideGeoPerimeter('a-1', { geo_perimeter: 'world' })).toBe(0)
      expect(repo.find).not.toHaveBeenCalled()
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('ne relit que les contacts actifs et sans confirmation humaine : une correction humaine gagne', async () => {
      await service.excludeOutsideGeoPerimeter('a-1', { geo_perimeter: 'france' })
      const arg = repo.find.mock.calls[0]?.[0] as { where: Record<string, unknown> }
      expect(Object.keys(arg.where)).toEqual(
        expect.arrayContaining(['account_id', 'deleted_at', 'excluded_at', 'identity_confirmed_at']),
      )
    })

    // #3820 — même rattrapage pour une relance en périmètre SITE : les contacts
    // parisiens déjà au dossier d'une première analyse ne doivent pas survivre
    // à une relance cadrée sur Lille.
    describe('périmètre SITE (#3820)', () => {
      it('écarte (sans supprimer) les contacts hors site déjà au dossier, garde les inconnus', async () => {
        repo.find.mockResolvedValue([
          row('lille', { city: 'Lille' }),
          row('paris', { city: 'Paris' }),
          row('inconnu', null),
        ])
        const n = await service.excludeOutsideGeoPerimeter('a-1', { geo_perimeter: 'city', geo_areas: ['Lille'] })
        expect(n).toBe(1)
        const [where, patch] = repo.update.mock.calls[0] as [{ id: { _value: string[] } }, Record<string, unknown>]
        expect(where.id._value).toEqual(['paris'])
        expect(patch['exclusion_reason']).toBe('hors site (Lille)')
      })

      it('ne relit ni ne touche rien sans ville saisie dans le cadrage', async () => {
        expect(await service.excludeOutsideGeoPerimeter('a-1', { geo_perimeter: 'city' })).toBe(0)
        expect(repo.find).not.toHaveBeenCalled()
      })
    })
  })
})
