import { HttpError, TechnicalError } from '@bellum/errors'
import { isFailure, success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import type { AccountsService } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { IaClient } from '../ia/ia.client'
import type { AnalysisPersistenceService } from './analysis.persistence'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #2553 / #3740 — importer un organigramme PDF / image / PPTX.
 *
 * Le fichier est lu par l'extraction documentaire EXISTANTE (`/cv/extract` :
 * PDF, PPTX, image lue par le modèle), puis le texte passe par la mise en lignes
 * de « Décris ton organigramme » — donc par sa garde, qui retire toute personne
 * non nommée dans le texte. On PROPOSE ; l'écriture reste `declareOrgPeople`.
 */

const account = { id: 'acc-1', user_id: 'u-1', company_name: 'Kovéa' } as unknown as AccountEntity

function build(opts: { extractEnvelope?: unknown; demo?: boolean } = {}) {
  const ia = {
    cvExtract: jest.fn().mockResolvedValue(opts.extractEnvelope ?? { data: { text: 'Jane Doe, DSI\nJohn Roe, DAF' } }),
    declareOrgFromText: jest.fn().mockResolvedValue({
      data: { people: [{ full_name: 'Jane Doe', title: 'DSI' }, { full_name: 'Personne Inventee' }] },
    }),
  }
  const service = new AnalysisOnDemandService(
    { findOne: jest.fn().mockResolvedValue(success(account)) } as unknown as AccountsService,
    {} as ContactsService,
    ia as unknown as IaClient,
    {} as AnalysisPersistenceService,
    { getAnswers: jest.fn(), resolveProfileData: jest.fn() } as unknown as EsnProfileReader,
    undefined,
    { isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false) } as unknown as WorkspaceContextService,
  )
  return { service, ia }
}

describe('AnalysisOnDemandService.proposeOrgPeopleFromFile', () => {
  it('lit le fichier, met en lignes, retire les personnes absentes du texte', async () => {
    const { service, ia } = build()
    const result = await service.proposeOrgPeopleFromFile('acc-1', 'u-1', {
      fileB64: 'QUJD',
      filename: 'orga-2023.pdf',
    })
    expect(ia.cvExtract).toHaveBeenCalledWith({ fileB64: 'QUJD', filename: 'orga-2023.pdf' })
    if (isFailure(result)) throw new Error('succès attendu')
    expect(result.output.people.map(p => p.fullName)).toEqual(['Jane Doe'])
    expect(result.output.dropped).toEqual(['Personne Inventee'])
  })

  it('un fichier sans texte lisible : échec NOMMÉ avec le motif, aucune mise en lignes', async () => {
    const { service, ia } = build({ extractEnvelope: { detail: 'scan sans texte' } })
    // Un PDF, pas une image : la garde image (#3740) refuse les images avant
    // cet appel — ce cas couvre le fichier qui ATTEINT `/cv/extract` mais n'en
    // rend aucun texte exploitable.
    const result = await service.proposeOrgPeopleFromFile('acc-1', 'u-1', { fileB64: 'QUJD', filename: 'scan.pdf' })
    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.message).toContain('scan sans texte')
    expect(ia.declareOrgFromText).not.toHaveBeenCalled()
  })

  it('espace de démonstration : refusé avant toute extraction', async () => {
    const { service, ia } = build({ demo: true })
    const result = await service.proposeOrgPeopleFromFile('acc-1', 'u-1', { fileB64: 'QUJD', filename: 'a.pdf' })
    expect(isFailure(result)).toBe(true)
    expect(ia.cvExtract).not.toHaveBeenCalled()
  })

  it('un texte plus long que la borne de mise en lignes est tronqué, pas refusé', async () => {
    const { service, ia } = build({ extractEnvelope: { data: { text: 'x'.repeat(30_000) } } })
    await service.proposeOrgPeopleFromFile('acc-1', 'u-1', { fileB64: 'QUJD', filename: 'a.pdf' })
    const sent = (ia.declareOrgFromText.mock.calls[0]![0] as { text: string }).text
    expect(sent.length).toBe(20_000)
  })
  it('#3740 — un classeur .xlsx part à la lecture documentaire de la mise en lignes (document_text), pas à /cv/extract', async () => {
    const { service, ia } = build()
    await service.proposeOrgPeopleFromFile('acc-1', 'u-1', { fileB64: 'QUJD', filename: 'Orga 2024.XLSX' })
    expect(ia.cvExtract).not.toHaveBeenCalled()
    expect(ia.declareOrgFromText).toHaveBeenCalledWith({
      file: { base64: 'QUJD', name: 'Orga 2024.XLSX' },
      accountName: 'Kovéa',
    })
  })

  // #3740 — recette prod 08/10 : un PNG rendait 502 « HTTP request failed »
  // (`/cv/extract` n'a aucune garde image, et tout rejet de `cvExtract`
  // devenait `ia_failed` sans égard pour son statut). Une image est refusée
  // NOMMÉMENT ici, avant tout appel — zéro réseau, zéro crédit.
  describe('#3740 — une image (PNG/JPEG/WEBP) est refusée AVANT tout appel au service IA', () => {
    it.each(['organigramme.png', 'organigramme.JPG', 'organigramme.jpeg', 'organigramme.webp'])(
      '%s : jamais /cv/extract, message nommé (pas encore lus, aucun OCR)',
      async filename => {
        const { service, ia } = build()
        const result = await service.proposeOrgPeopleFromFile('acc-1', 'u-1', { fileB64: 'QUJD', filename })
        expect(ia.cvExtract).not.toHaveBeenCalled()
        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) {
          expect(result.problem.code).toBe('precondition_failed')
          expect(result.problem.message).toContain('pas encore lus')
          expect(result.problem.message).toContain('OCR')
        }
      },
    )
  })

  // #3740 — même recette : un refus RÉEL du service IA (un PDF illisible,
  // 422 nommé côté `/cv/extract`) n'est pas une PANNE. Avant ce lot, le
  // `catch` générique transformait N'IMPORTE QUEL rejet de `cvExtract` en
  // `ia_failed` (502) : un refus nommé devenait indiscernable d'un service
  // injoignable, et le toast perdait le motif réel pour « HTTP request
  // failed » (texte de `HttpClient.request`, jamais vu par l'IA).
  it('#3740 — un refus NOMMÉ (422) du service IA devient precondition_failed, jamais ia_failed/502', async () => {
    const ia = {
      cvExtract: jest.fn().mockRejectedValue(
        new TechnicalError('HTTP request failed', {
          cause: new HttpError(
            422,
            JSON.stringify({ detail: 'PDF illisible (corrompu ou protégé par mot de passe).' }),
            false,
            '/cv/extract',
          ),
        }),
      ),
      declareOrgFromText: jest.fn(),
    }
    const service = new AnalysisOnDemandService(
      { findOne: jest.fn().mockResolvedValue(success(account)) } as unknown as AccountsService,
      {} as ContactsService,
      ia as unknown as IaClient,
      {} as AnalysisPersistenceService,
      { getAnswers: jest.fn(), resolveProfileData: jest.fn() } as unknown as EsnProfileReader,
      undefined,
      { isDemoWorkspace: jest.fn().mockResolvedValue(false) } as unknown as WorkspaceContextService,
    )

    const result = await service.proposeOrgPeopleFromFile('acc-1', 'u-1', { fileB64: 'QUJD', filename: 'scan.pdf' })

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) {
      expect(result.problem.code).toBe('precondition_failed')
      expect(result.problem.message).toBe('PDF illisible (corrompu ou protégé par mot de passe).')
    }
  })

  // Le symétrique : une VRAIE panne IA (5xx, réseau, timeout — aucun
  // `HttpError` 4xx dans la chaîne de cause) reste `ia_failed` (502),
  // comportement inchangé.
  it('#3740 — une panne RÉELLE du service IA (5xx) reste ia_failed (502)', async () => {
    const ia = {
      cvExtract: jest.fn().mockRejectedValue(
        new TechnicalError('HTTP request failed', {
          cause: new HttpError(503, 'service unavailable', true, '/cv/extract'),
        }),
      ),
      declareOrgFromText: jest.fn(),
    }
    const service = new AnalysisOnDemandService(
      { findOne: jest.fn().mockResolvedValue(success(account)) } as unknown as AccountsService,
      {} as ContactsService,
      ia as unknown as IaClient,
      {} as AnalysisPersistenceService,
      { getAnswers: jest.fn(), resolveProfileData: jest.fn() } as unknown as EsnProfileReader,
      undefined,
      { isDemoWorkspace: jest.fn().mockResolvedValue(false) } as unknown as WorkspaceContextService,
    )

    const result = await service.proposeOrgPeopleFromFile('acc-1', 'u-1', { fileB64: 'QUJD', filename: 'scan.pdf' })

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('ia_failed')
  })
})
