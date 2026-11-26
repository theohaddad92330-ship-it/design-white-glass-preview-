import type { Repository } from 'typeorm'
import { resolveBrand } from '@bellum/contracts'
import { isSuccess } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { AccountShareEntity } from '../../database/entities/account-share.entity'
import type { AccountShareService } from './account-share.service'
import { SharePublicService } from './share-public.service'
import type { WorkspaceBrandService } from '../workspace/workspace-brand.service'

/**
 * #2125.23/.26 — Le rendu public d'un dossier (`GET /share/:slug`, sans
 * authentification) ne montre jamais le chiffre d'affaires ni les contacts
 * nominatifs. Décision de Louis du 14/09/2026 20:35 : le lien reste public
 * et simple, mais ces champs sont retirés AU SERVEUR, avant de quitter
 * l'API — pas dans l'écran.
 *
 * La garde lit la sortie SÉRIALISÉE (`JSON.stringify`) plutôt que des
 * assertions champ par champ : une régression qui déplacerait la donnée
 * sensible dans un champ voisin (ex. un futur champ « note ») resterait
 * attrapée.
 */
describe('SharePublicService — un dossier partagé publiquement ne montre pas les champs sensibles', () => {
  const SENSITIVE_REVENUE = '12 500 000 €'
  const SENSITIVE_FULL_NAME = 'Camille Vasseur'
  const SENSITIVE_EMAIL = 'camille.vasseur@example-client.fr'
  const SENSITIVE_PHONE = '+33 6 12 34 56 78'
  const SENSITIVE_TITLE = 'Directrice des Achats'

  const share = {
    account_id: 'acc-1',
    workspace_id: 'ws-1',
    expires_at: new Date('2026-10-14T00:00:00.000Z'),
  } as AccountShareEntity

  const fullAccountRow = {
    id: 'acc-1',
    company_name: 'Acme Corp',
    sector: 'Édition logicielle',
    employees: '250-500',
    revenue: SENSITIVE_REVENUE,
    headquarters: 'Lyon, France',
    website: 'https://acme.example',
    priority_score: 8,
    priority_justification: "Signal d'expansion récent sur la practice cloud.",
  } as AccountEntity

  function buildService() {
    const shareService = { findActiveBySlug: jest.fn().mockResolvedValue(share) } as unknown as AccountShareService
    const accounts = { findOne: jest.fn().mockResolvedValue(fullAccountRow) } as unknown as Repository<AccountEntity>
    const brands = {
      getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
    } as unknown as WorkspaceBrandService

    return new SharePublicService(shareService, accounts, brands)
  }

  it('ne fait apparaître ni le chiffre d’affaires ni un champ nominatif de contact dans la sortie sérialisée', async () => {
    const service = buildService()
    const result = await service.resolveBySlug('acme-corp-abc123')
    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return

    const serialized = JSON.stringify(result.output)

    // #2125.23 — le chiffre d'affaires ne voyage jamais sur le lien public.
    expect(serialized).not.toContain(SENSITIVE_REVENUE)
    // #2125.26 — aucun champ nominatif de contact ne voyage sur le lien public.
    expect(serialized).not.toContain(SENSITIVE_FULL_NAME)
    expect(serialized).not.toContain(SENSITIVE_EMAIL)
    expect(serialized).not.toContain(SENSITIVE_PHONE)
    expect(serialized).not.toContain(SENSITIVE_TITLE)
  })

  it('témoin positif : les champs légitimes (analyse, axes, contexte) restent présents', async () => {
    // Garde borgne sinon : une sortie VIDE passerait aussi le test ci-dessus.
    const service = buildService()
    const result = await service.resolveBySlug('acme-corp-abc123')
    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return

    expect(result.output.account.company_name).toBe('Acme Corp')
    expect(result.output.account.sector).toBe('Édition logicielle')
    expect(result.output.account.priority_justification).toContain("Signal d'expansion")
    expect(result.output.account.priority_score).toBe(8)
  })

  it('nomme les champs retirés dans redactedFields, pour que l’écran distingue « masqué » de « non mesuré »', async () => {
    const service = buildService()
    const result = await service.resolveBySlug('acme-corp-abc123')
    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return

    expect(result.output.redactedFields).toEqual(expect.arrayContaining(['account.revenue', 'contacts']))
  })

  // #2914 (#2128.11) — un lien réduit à la section Score ne montre que le
  // score et sa justification, jamais le secteur, l'effectif, le siège ou le
  // site — même s'ils existent en base.
  describe("section 'evaluation'", () => {
    function buildEvaluationService() {
      const evaluationShare = { ...share, section: 'evaluation' } as AccountShareEntity
      const shareService = {
        findActiveBySlug: jest.fn().mockResolvedValue(evaluationShare),
      } as unknown as AccountShareService
      const accounts = { findOne: jest.fn().mockResolvedValue(fullAccountRow) } as unknown as Repository<AccountEntity>
      const brands = {
        getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
      } as unknown as WorkspaceBrandService
      return new SharePublicService(shareService, accounts, brands)
    }

    it('masque secteur, effectif, siège et site en plus des champs déjà retirés', async () => {
      const service = buildEvaluationService()
      const result = await service.resolveBySlug('acme-corp-abc123')
      expect(isSuccess(result)).toBe(true)
      if (!isSuccess(result)) return

      expect(result.output.account.sector).toBeNull()
      expect(result.output.account.employees).toBeNull()
      expect(result.output.account.headquarters).toBeNull()
      expect(result.output.account.website).toBeNull()
      expect(result.output.section).toBe('evaluation')
      expect(result.output.redactedFields).toEqual(
        expect.arrayContaining(['account.sector', 'account.employees', 'account.headquarters', 'account.website']),
      )
    })

    it('garde le score et sa justification — un score n’est jamais nu', async () => {
      const service = buildEvaluationService()
      const result = await service.resolveBySlug('acme-corp-abc123')
      expect(isSuccess(result)).toBe(true)
      if (!isSuccess(result)) return

      expect(result.output.account.priority_score).toBe(8)
      expect(result.output.account.priority_justification).toContain("Signal d'expansion")
      expect(result.output.account.company_name).toBe('Acme Corp')
    })
  })
})
