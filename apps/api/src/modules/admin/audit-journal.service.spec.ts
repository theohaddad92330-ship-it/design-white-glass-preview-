import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BackofficeAuditEventEntity } from '../../database/entities/backoffice-audit-event.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { AuditJournalService } from './audit-journal.service'

/**
 * LE JOURNAL D'AUDIT UNIQUE (#1666) — écriture, lecture, purge.
 *
 * CE QUE CES TESTS TIENNENT, ET POURQUOI CHACUN EXISTE
 * L'issue tient en quatre phrases, et chacune cache un piège :
 *  · « lecture seule, aucune purge manuelle » — le piège est de la tenir avec un
 *    bouton caché. On vérifie ici que la SURFACE du service ne porte aucune
 *    méthode de suppression par identifiant : on retire le moyen ;
 *  · « aucun filtre qui masque une catégorie entière » — le piège est qu'un
 *    filtre fasse tomber les compteurs avec lui. On vérifie que les cinq
 *    comptes sont calculés SANS le filtre de catégorie, et que le total ignore
 *    tous les filtres ;
 *  · les rétentions — le piège est d'effacer ce qui est permanent ;
 *  · « on archive, on ne supprime pas » — le piège est le trou silencieux : une
 *    purge qui efface doit s'inscrire au journal.
 */
describe('AuditJournalService (#1666)', () => {
  let repo: MockRepository<BackofficeAuditEventEntity>
  let service: AuditJournalService

  beforeEach(() => {
    repo = createMockRepository<BackofficeAuditEventEntity>()
    service = new AuditJournalService(repo as never)
  })

  it('LIT quelque chose — une entrée complète est écrite telle qu’elle arrive', async () => {
    await service.record({
      operation: 'users.delete',
      category: 'suppression',
      outcome: 'succes',
      actorEmail: 'ops@bellum-it.com',
      actorRole: 'owner',
      subjectType: 'user',
      subjectId: 'u-1',
      subjectLabel: 'Espace Dupont',
      statusCode: 200,
      detail: 'suppression demandée depuis la fiche',
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      country: 'FR',
    })

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'users.delete',
        category: 'suppression',
        outcome: 'succes',
        actor_email: 'ops@bellum-it.com',
        subject_type: 'user',
        subject_id: 'u-1',
        subject_label: 'Espace Dupont',
        status_code: 200,
        ip: '203.0.113.7',
        country: 'FR',
      }),
    )
  })

  it('une LACUNE reste une lacune — jamais « inconnu »', async () => {
    await service.record({ operation: 'banners.write', category: 'ordinaire', outcome: 'succes' })

    // La couche d'identité peut être au repos : il n'y a alors PAS d'auteur, et
    // écrire `'inconnu'` ferait d'une lacune un auteur.
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_email: null, actor_role: null, ip: null, country: null, status_code: null }),
    )
  })

  it('SAIT DIRE NON à sa propre panne — un INSERT en échec ne casse pas le geste', async () => {
    ;(repo.insert as jest.Mock).mockRejectedValue(new Error('table indisponible'))

    // Le geste a DÉJÀ eu lieu quand cette ligne s'écrit : jeter rendrait une
    // erreur à l'opérateur pour une action bel et bien faite.
    await expect(
      service.record({ operation: 'users.suspend', category: 'permission', outcome: 'succes' }),
    ).resolves.toBeUndefined()
  })

  it('AUCUNE méthode ne supprime une ligne choisie — on retire le MOYEN', () => {
    // Le test de l'issue vit d'abord ici : il n'y a rien à appeler. Une garde
    // qui vérifierait un rôle laisserait la méthode en place, et la méthode
    // finirait par être appelée depuis ailleurs.
    const surface = [
      ...Object.getOwnPropertyNames(AuditJournalService.prototype),
      ...Object.keys(service as unknown as Record<string, unknown>),
    ]
    expect(surface).not.toContain('delete')
    expect(surface).not.toContain('deleteById')
    expect(surface).not.toContain('remove')
    expect(surface).not.toContain('update')
    // Contrôle positif : la surface a bien été LUE (sans lui, un tableau vide
    // rendrait les quatre lignes ci-dessus vraies pour rien).
    expect(surface).toContain('record')
    expect(surface).toContain('purgeExpired')
  })

  it('la lecture est BORNÉE — `?limit=999999` ne sort pas la table entière', async () => {
    await service.search({ limit: 999_999 })
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }))

    await service.search({ limit: 0 })
    expect(repo.find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 1 }))

    await service.search({ limit: 25, offset: 50 })
    expect(repo.find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 25, skip: 50 }))
  })

  it('AUCUN FILTRE NE MASQUE UNE CATÉGORIE — les cinq comptes sont toujours là', async () => {
    // La base ne rend QUE la catégorie qui a des lignes…
    ;(repo._qb.getRawMany as jest.Mock).mockResolvedValue([
      { category: 'ordinaire', count: '31' },
      { category: 'impersonation', count: '4' },
    ])

    const result = await service.search({ category: 'ordinaire' })

    // … et les cinq sortent quand même, dont les impersonations que le filtre
    // excluait de la page. C'est le point entier de l'issue.
    expect(Object.keys(result.categoryCounts).sort()).toEqual([
      'export',
      'impersonation',
      'ordinaire',
      'permission',
      'suppression',
    ])
    expect(result.categoryCounts.impersonation).toBe(4)
    expect(result.categoryCounts.export).toBe(0)
  })

  it('le compte par catégorie ignore le filtre de CATÉGORIE, et lui seul', async () => {
    await service.search({ category: 'impersonation', outcome: 'refus', actorEmail: 'ops@bellum-it.com' })

    const clauses = (repo._qb.andWhere as jest.Mock).mock.calls.map(call => String(call[0]))
    // Le filtre de catégorie ne descend PAS dans le compteur…
    expect(clauses.some(clause => clause.includes('e.category ='))).toBe(false)
    // … mais les autres, si : sans eux, le compteur parlerait d'un autre
    // ensemble que la page, et les deux chiffres seraient incomparables.
    expect(clauses.some(clause => clause.includes('e.outcome ='))).toBe(true)
    expect(clauses.some(clause => clause.includes('e.actor_email ='))).toBe(true)
  })

  it('le TOTAL ignore TOUS les filtres — « le compte total reste visible »', async () => {
    ;(repo.count as jest.Mock).mockResolvedValue(7)
    await service.search({ category: 'ordinaire', outcome: 'succes' })

    const appels = (repo.count as jest.Mock).mock.calls
    // Deux comptes : celui du filtre, puis le total NU.
    expect(appels).toHaveLength(2)
    expect(appels[1]).toEqual([])
  })

  it('la purge ne touche JAMAIS les catégories permanentes', async () => {
    ;(repo.delete as jest.Mock).mockResolvedValue({ affected: 0 })

    await service.purgeExpired(new Date('2026-09-07T04:37:00.000Z'))

    const categories = (repo.delete as jest.Mock).mock.calls.map(call => call[0].category)
    expect(categories).not.toContain('suppression')
    expect(categories.sort()).toEqual(['export', 'impersonation', 'ordinaire', 'permission'])
  })

  it('une purge qui efface S’INSCRIT au journal — pas de trou silencieux', async () => {
    ;(repo.delete as jest.Mock).mockResolvedValue({ affected: 3 })

    await service.purgeExpired(new Date('2026-09-07T04:37:00.000Z'))

    const trace = (repo.insert as jest.Mock).mock.calls
      .map(call => call[0])
      .find(row => row.operation.includes('purge'))
    expect(trace).toBeDefined()
    // ⚠️ PERMANENTE : la trace d'une purge ne peut pas s'effacer elle-même.
    expect(trace.category).toBe('suppression')
    expect(trace.detail).toContain('ordinaire : 3 ligne(s)')
  })

  it('une purge qui n’efface RIEN n’écrit rien — le bruit noierait le signal', async () => {
    ;(repo.delete as jest.Mock).mockResolvedValue({ affected: 0 })
    await service.purgeExpired(new Date('2026-09-07T04:37:00.000Z'))
    expect(repo.insert).not.toHaveBeenCalled()
  })

  it('une catégorie en échec n’arrête pas les autres', async () => {
    ;(repo.delete as jest.Mock)
      .mockRejectedValueOnce(new Error('verrou'))
      .mockResolvedValue({ affected: 1 })
      .mockName('delete')

    const tallies = await service.purgeExpired(new Date('2026-09-07T04:37:00.000Z'))
    // Trois des quatre fenêtres ont abouti : abandonner les autres ferait
    // vieillir la table entière sur un incident local.
    expect(tallies).toHaveLength(3)
  })

  it('l’ENTITÉ ne porte aucune colonne de mise à jour — l’interdit est dans le schéma', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'database', 'entities', 'backoffice-audit-event.entity.ts'),
      'utf8',
    )
    expect(source).toContain('@CreateDateColumn')
    // `UpdateDateColumn` serait le premier pas vers une ligne qu'on corrige.
    expect(source).not.toContain('UpdateDateColumn')
  })
})
