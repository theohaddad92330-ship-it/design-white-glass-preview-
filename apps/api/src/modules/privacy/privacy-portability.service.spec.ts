import { PrivacyPortabilityService } from './privacy-portability.service'

/**
 * LA RÉVERSIBILITÉ AFFICHÉE — PDF 7 §9.2, `BEL-INT-608` PR1.
 *
 * « Un dirigeant qui hésite à confier son CRM est rassuré par un écran qu'il
 * peut regarder, pas par un article de CGU. »
 *
 * Ce qui se joue ici, et qui n'est pas cosmétique :
 *  - un COMPTE qu'on ne sait pas lire vaut `null`, jamais `0` — « 0 contact »
 *    sur un carnet de 3 890 lignes est le pire message qu'une page de
 *    réversibilité puisse rendre ;
 *  - la section « ce que vous n'emportez pas » est DÉRIVÉE, donc elle ne périme
 *    pas ;
 *  - un export est une SORTIE de données personnelles : il est journalisé, et
 *    il ne rend que la donnée du demandeur ;
 *  - le CSV ne devient jamais une formule dans le tableur de qui l'ouvre.
 */
describe('PrivacyPortabilityService', () => {
  const rows = (count: number) => ({ count: jest.fn().mockResolvedValue(count) })

  function build(over: Partial<Record<string, unknown>> = {}) {
    const track = jest.fn()
    const events = {
      findOne: jest.fn().mockResolvedValue({ occurred_at: new Date('2026-08-30T10:00:00.000Z') }),
    }
    const repos = {
      profiles: rows(1),
      esnProfiles: rows(2),
      subscriptions: rows(1),
      accounts: rows(24),
      contacts: rows(3890),
      consultants: rows(0),
      ragDocuments: rows(4),
      actions: rows(120),
      creditLedger: rows(56),
      sessions: rows(3),
      smsChannel: rows(0),
      ...over,
    }
    const retention = { getRetentionPolicy: () => ({ rules: [{ key: 'anonymized_records', days: 30 }] }) }
    const exportService = {
      buildExport: jest.fn().mockResolvedValue({
        exportedAt: '2026-09-01T00:00:00.000Z',
        userId: 'u-1',
        profile: { user_id: 'u-1', email: 'a@b.c' },
        contacts: [
          { id: 'c-1', full_name: 'Alix Roux', note: 'dit "oui"' },
          { id: 'c-2', full_name: '=SOMME(A1)', note: null },
        ],
        accounts: [],
      }),
    }
    const service = new PrivacyPortabilityService(
      repos.profiles as never,
      repos.esnProfiles as never,
      repos.subscriptions as never,
      repos.accounts as never,
      repos.contacts as never,
      repos.consultants as never,
      repos.ragDocuments as never,
      repos.actions as never,
      repos.creditLedger as never,
      repos.sessions as never,
      events as never,
      retention as never,
      exportService as never,
      { track } as never,
      repos.smsChannel as never,
    )
    return { service, repos, events, exportService, track }
  }

  describe('buildManifest', () => {
    it('rend un compte par objet, et la section « ce que vous n’emportez pas »', async () => {
      const { service } = build()
      const manifest = await service.buildManifest('u-1')

      expect(manifest.objects.find(object => object.payloadKey === 'contacts')?.rows).toBe(3890)
      // La section est calculée sur l'inventaire COMPLET (une centaine de
      // tables), pas sur les seules exceptions du registre écrit.
      expect(manifest.withheld.length).toBeGreaterThan(0)
      expect(manifest.withheld.flatMap(group => group.tables).length).toBeGreaterThan(100)
      for (const group of manifest.withheld) {
        expect(group.tables.length).toBeGreaterThan(0)
        expect(group.reasonKey).toMatch(/^withheld\./)
      }
    })

    it('un compte illisible vaut `null`, JAMAIS zéro', async () => {
      const { service } = build({ contacts: { count: jest.fn().mockRejectedValue(new Error('boom')) } })
      const manifest = await service.buildManifest('u-1')

      expect(manifest.objects.find(object => object.payloadKey === 'contacts')?.rows).toBeNull()
      // Et l'échec d'UN compte n'emporte pas les autres : l'écran reste utile.
      expect(manifest.objects.find(object => object.payloadKey === 'accounts')?.rows).toBe(24)
    })

    it('un vrai zéro reste zéro — c’est une réponse, pas une absence', async () => {
      const { service } = build()
      const manifest = await service.buildManifest('u-1')
      expect(manifest.objects.find(object => object.payloadKey === 'consultants')?.rows).toBe(0)
    })

    it('le délai de suppression vient de la politique de conservation, pas d’un nombre écrit ici', async () => {
      const { service } = build()
      expect((await service.buildManifest('u-1')).deletionDelayDays).toBe(30)
    })

    it('« dernier export : jamais » est un fait lu, pas une date inventée', async () => {
      const { service, events } = build()
      expect((await service.buildManifest('u-1')).lastExportedAt).toBe('2026-08-30T10:00:00.000Z')

      events.findOne.mockResolvedValue(null)
      expect((await service.buildManifest('u-1')).lastExportedAt).toBeNull()
    })

    it('compte la donnée du DEMANDEUR, jamais celle de l’espace', async () => {
      const { service, repos } = build()
      await service.buildManifest('u-1')
      for (const repo of Object.values(repos)) {
        for (const call of (repo.count as jest.Mock).mock.calls) {
          expect(JSON.stringify(call[0])).toContain('u-1')
        }
      }
    })
  })

  describe('exportObject', () => {
    it('rend le JSON du seul objet demandé', async () => {
      const { service } = build()
      const file = await service.exportObject('u-1', 'contacts', 'json')

      expect(file.contentType).toContain('application/json')
      expect(file.filename).toMatch(/contacts/)
      const parsed = JSON.parse(file.body) as unknown[]
      expect(parsed).toHaveLength(2)
    })

    it('rend un CSV dont l’en-tête est l’union des champs', async () => {
      const { service } = build()
      const file = await service.exportObject('u-1', 'contacts', 'csv')

      expect(file.contentType).toContain('text/csv')
      const [header] = file.body.split('\n')
      expect(header).toBe('id,full_name,note')
    })

    it('échappe les guillemets et NEUTRALISE une formule de tableur', async () => {
      // Une cellule qui commence par `=`, `+`, `-` ou `@` s'exécute à
      // l'ouverture dans un tableur. Un export est une donnée, pas un programme.
      const { service } = build()
      const body = (await service.exportObject('u-1', 'contacts', 'csv')).body

      expect(body).toContain('"dit ""oui"""')
      expect(body).toContain("'=SOMME(A1)")
      expect(body).not.toMatch(/(^|,)=SOMME/m)
    })

    it('une valeur absente reste VIDE — jamais « null » écrit en toutes lettres', async () => {
      const { service } = build()
      const lines = (await service.exportObject('u-1', 'contacts', 'csv')).body.split('\n')
      expect(lines[2]).toMatch(/,$/)
      expect(lines[2]).not.toContain('null')
    })

    it('refuse un objet qui n’est pas au catalogue — jamais une clé devinée', async () => {
      const { service } = build()
      await expect(service.exportObject('u-1', 'workspaceSecrets', 'json')).rejects.toThrow()
    })

    it('JOURNALISE la sortie — un export de données personnelles se trace', async () => {
      const { service, track } = build()
      await service.exportObject('u-1', 'contacts', 'csv')

      expect(track).toHaveBeenCalledWith(
        'export_performed',
        expect.objectContaining({ userId: 'u-1', properties: expect.objectContaining({ target: 'contacts' }) }),
      )
    })

    it('ne journalise JAMAIS le contenu — seulement quoi, quand, et par qui', async () => {
      const { service, track } = build()
      await service.exportObject('u-1', 'contacts', 'csv')

      const payload = JSON.stringify((track as jest.Mock).mock.calls[0])
      expect(payload).not.toContain('Alix Roux')
      expect(payload).not.toContain('a@b.c')
    })
  })
})
