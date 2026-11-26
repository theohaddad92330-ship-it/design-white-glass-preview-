import type { Brand } from '@bellum/contracts'
import { createMockRepository } from '../../database/test-utils'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountShareEntity } from '../../database/entities/account-share.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { AccountShareService } from './account-share.service'
import { SharePublicService } from './share-public.service'

/**
 * #2130.51 — SCÉNARIO « COMPTE PARTAGÉ » : deux comptes (deux utilisateurs
 * ESN différents) voient le MÊME dossier à travers un lien de partage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE, ET POURQUOI AUCUN SPEC EXISTANT NE LE FAISAIT
 * ─────────────────────────────────────────────────────────────────────────
 * `account-share.service.spec.ts` teste l'ÉCRITURE (`mintShareLink`) seule,
 * avec un dépôt mocké. `share-public.service.spec.ts` teste la LECTURE
 * (`resolveBySlug`) seule, avec un `AccountShareService` **lui-même mocké**
 * (`findActiveBySlug: jest.fn()`). Aucun des deux ne prouve que ce que
 * `AccountsController.createShareLink` écrit est bien ce que
 * `SharePublicController.getBySlug` relit — c'est exactement le trou que
 * #2130.42 nommait pour la porte NO-GO, et que le lot N8 a refermé côté
 * refresh : un test d'intégration à défaut de serveur, pas un Playwright
 * qu'aucun serveur web+api+DB ne peut faire tourner dans cet environnement.
 *
 * Ici, les DEUX services réels partagent la MÊME instance d'`AccountShareService`
 * (comme en production, où `SharePublicService` reçoit l'instance injectée par
 * Nest) — seule la frontière d'E/S réelle (les deux dépôts TypeORM, la marque)
 * est mockée.
 */
describe('Partage public d’un dossier compte — intégration écriture → lecture (#2130.51)', () => {
  const ACCOUNT_ID = 'acc-nordia-1'
  const WORKSPACE_ID = 'ws-nordia'

  function makeServices() {
    const sharesRepo = createMockRepository<AccountShareEntity>()
    const accountsRepo = createMockRepository<AccountEntity>()

    // Un dépôt de partages MINIMAL mais RÉEL dans son comportement : une
    // ligne sauvegardée devient relisable par `findOne`, et redevient
    // introuvable une fois `revoked_at` posé — exactement le contrat que le
    // docblock du service promet (« revoking = setting revoked_at »).
    const rows = new Map<string, AccountShareEntity>()
    sharesRepo.save.mockImplementation(async (row: Partial<AccountShareEntity>) => {
      const saved = {
        ...row,
        id: `share-${rows.size + 1}`,
        created_at: new Date('2026-09-28T08:00:00.000Z'),
      } as AccountShareEntity
      rows.set(saved.slug, saved)
      return saved
    })
    sharesRepo.findOne.mockImplementation(async ({ where }: { where: { slug: string } }) => {
      const row = rows.get(where.slug)
      if (!row) return null
      if (row.revoked_at) return null
      if (row.expires_at.getTime() <= Date.now()) return null
      return row
    })

    accountsRepo.findOne.mockResolvedValue({
      id: ACCOUNT_ID,
      company_name: 'Nordia Group',
      sector: 'Distribution',
      employees: 1200,
      headquarters: 'Lyon',
      website: 'https://nordia.example',
      priority_score: 78,
      priority_justification: 'Trois signaux de croissance récents.',
    } as unknown as AccountEntity)

    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE_ID, role: 'member' }),
    } as unknown as WorkspaceContextService
    const config = { get: jest.fn((_key: string, fallback: string) => fallback) } as never

    const shareService = new AccountShareService(sharesRepo as never, config, workspaceContext)

    const brands = {
      getForWorkspace: jest.fn().mockResolvedValue({ name: 'Nordia Group' } as unknown as Brand),
    } as unknown as WorkspaceBrandService
    const sharePublic = new SharePublicService(shareService, accountsRepo as never, brands)

    return { shareService, sharePublic, sharesRepo }
  }

  it('le lien miné par le CRÉATEUR ouvre, pour un AUTRE utilisateur, le MÊME dossier', async () => {
    const { shareService, sharePublic } = makeServices()

    // Le créateur (compte A) mine le lien — chemin de `AccountsController.createShareLink`.
    const link = await shareService.mintShareLink(ACCOUNT_ID, 'user-a', 'Nordia Group')

    // Un AUTRE utilisateur (compte B), sans session, ouvre le même slug —
    // chemin de `SharePublicController.getBySlug`, sans JwtGuard.
    const result = await sharePublic.resolveBySlug(link.slug)

    expect(result.type).toBe('success')
    if (result.type !== 'success') throw new Error('résolution attendue')
    expect(result.output.account.company_name).toBe('Nordia Group')
    expect(result.output.account.sector).toBe('Distribution')

    // Un second lecteur, même slug : EXACTEMENT le même dossier — jamais une
    // seconde dérivation qui pourrait diverger.
    const second = await sharePublic.resolveBySlug(link.slug)
    expect(second).toEqual(result)
  })

  it('un slug RÉVOQUÉ ne rouvre plus le dossier, même si le lien a déjà circulé', async () => {
    const { shareService, sharePublic, sharesRepo } = makeServices()
    const link = await shareService.mintShareLink(ACCOUNT_ID, 'user-a', 'Nordia Group')

    // Révoquer = poser `revoked_at` (docblock du service) — jamais une
    // suppression de ligne (doctrine : on archive, on ne supprime pas).
    const row = await sharesRepo.findOne({ where: { slug: link.slug } } as never)
    if (!row) throw new Error('ligne attendue')
    row.revoked_at = new Date()

    const result = await sharePublic.resolveBySlug(link.slug)
    expect(result).toEqual({
      type: 'failure',
      problem: { code: 'not_found', message: 'Lien de partage invalide ou expiré' },
    })
  })

  it('sait dire NON — un slug qui n’a jamais existé ne trouve rien par accident', async () => {
    const { sharePublic } = makeServices()
    const result = await sharePublic.resolveBySlug('jamais-mine-xyz')
    expect(result.type).toBe('failure')
  })
})
