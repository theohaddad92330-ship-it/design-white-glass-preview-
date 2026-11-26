import 'reflect-metadata'
import { AuditJournalController, parseQuery } from './audit-journal.controller'
import type { AuditJournalService } from './audit-journal.service'

/**
 * LE TEST DE L'ISSUE : « tentative de suppression d'une ligne → refus » (#1666).
 *
 * ⚠️ IL VIT ICI, CÔTÉ API, ET PAS SEULEMENT DANS LA CONSOLE. Cacher un bouton
 * n'est pas un refus : un `curl` porteur du secret interne passerait à côté. Le
 * refus est donc dans la ROUTE, et surtout il n'y a AUCUNE méthode de service
 * derrière elle — le service n'expose pas de suppression par identifiant.
 */
describe('AuditJournalController (#1666)', () => {
  const journal = {
    search: jest.fn().mockResolvedValue({
      entries: [],
      matching: 0,
      total: 0,
      categoryCounts: { ordinaire: 0, permission: 0, export: 0, suppression: 0, impersonation: 0 },
      limit: 50,
      offset: 0,
    }),
    record: jest.fn().mockResolvedValue(undefined),
    plan: jest.fn().mockReturnValue([
      { category: 'ordinaire', months: 24, cutoff: new Date('2024-09-07T00:00:00.000Z') },
      { category: 'suppression', months: null, cutoff: null },
    ]),
  }
  const controller = new AuditJournalController(journal as unknown as AuditJournalService)

  beforeEach(() => jest.clearAllMocks())

  it('LIT quelque chose — la page porte ses comptes ET le plan de rétention', async () => {
    const view = await controller.list({})
    expect(journal.search).toHaveBeenCalled()
    expect(view.categoryCounts).toBeDefined()
    // Le plan vient du MÊME endroit que la purge : une promesse affichée qui
    // vient d'une autre source que celle qui l'applique finit par mentir.
    expect(view.retention).toEqual([
      { category: 'ordinaire', months: 24, cutoff: '2024-09-07T00:00:00.000Z' },
      { category: 'suppression', months: null, cutoff: null },
    ])
  })

  it('SUPPRIMER EST REFUSÉ — 405, avec ou sans identifiant', () => {
    const refus = controller.refuseDelete()
    expect(refus.ok).toBe(false)
    expect(refus.error).toContain('lecture seule')
    expect(refus.error).toContain('aucune purge manuelle')
  })

  it('MODIFIER est refusé aussi — un journal d’audit ne se corrige pas', () => {
    expect(controller.refusePatch().ok).toBe(false)
    expect(controller.refusePut().ok).toBe(false)
  })

  it('le refus ne passe par AUCUNE méthode de service — il n’y a rien à appeler', () => {
    controller.refuseDelete()
    controller.refusePatch()
    controller.refusePut()
    // Ni lecture, ni écriture : le contrôleur ne consulte même pas la ligne
    // visée. Vérifier qu'elle existe apprendrait déjà quelque chose à qui essaie.
    expect(journal.search).not.toHaveBeenCalled()
    expect(journal.record).not.toHaveBeenCalled()
  })

  it('le refus est déclaré sur les TROIS verbes destructifs, avec le code 405', () => {
    // Sans déclaration, un DELETE recevrait un 404 de routage — qui se lit
    // comme « pas encore écrit », donc comme quelque chose qu'on pourrait
    // ajouter. Le 405 dit l'inverse.
    const http = (nom: string): number =>
      Reflect.getMetadata('__httpCode__', (AuditJournalController.prototype as never)[nom] as never) as number
    expect(http('refuseDelete')).toBe(405)
    expect(http('refusePatch')).toBe(405)
    expect(http('refusePut')).toBe(405)
  })
})

describe('parseQuery — un filtre illisible ne ferme pas l’écran d’audit', () => {
  it('LIT quelque chose — un filtre valide est bien retenu', () => {
    expect(parseQuery({ category: 'impersonation', outcome: 'refus' })).toMatchObject({
      category: 'impersonation',
      outcome: 'refus',
    })
  })

  it('SAIT DIRE NON — une catégorie inventée est IGNORÉE, pas refusée', () => {
    // Une faute de frappe dans une URL ne doit pas produire une page d'erreur
    // sur le seul écran qui doit toujours répondre : elle rend le journal
    // ENTIER, ce qui montre plus, jamais moins.
    expect(parseQuery({ category: 'impersonations' })).not.toHaveProperty('category')
    expect(parseQuery({ outcome: 'ok' })).not.toHaveProperty('outcome')
  })

  it('une DATE illisible est ignorée en entier — jamais une `Invalid Date`', () => {
    // Une borne `Invalid Date` ferait rendre zéro ligne à un journal plein, ce
    // qui ressemblerait exactement à « il ne s'est rien passé ».
    expect(parseQuery({ since: 'hier' })).not.toHaveProperty('since')
    expect(parseQuery({ since: '2026-09-01' }).since?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('l’adresse d’acteur est normalisée, comme partout ailleurs', () => {
    expect(parseQuery({ actorEmail: '  OPS@Bellum-IT.com ' }).actorEmail).toBe('ops@bellum-it.com')
  })
})
