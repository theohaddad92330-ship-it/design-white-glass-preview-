import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { RfpEntity } from '../../database/entities/rfp.entity'
import type { RfpSourceDocumentEntity } from '../../database/entities/rfp-source-document.entity'
import { createMockRepository } from '../../database/test-utils'
import type { EsnProfileService } from '../esn-profile/esn-profile.service'
import type { IaClient } from '../ia/ia.client'
import type { StorageService } from '../storage/storage.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RfpService } from './rfp.service'

/**
 * RFP/RFQ Studio (addendum final p66-68).
 *
 * Ce qui se teste, c'est l'anti-invention. Le texte produit par ce module
 * devient un ENGAGEMENT CONTRACTUEL : une certification affirmée sans preuve, un
 * délai promis sans source, et le mensonge sort en audit ou en soutenance. Trois
 * gardes le tiennent, et chacune est vérifiée ici :
 *
 *   - une exigence dont le poids est inconnu devient AMBIGUË (donc une question
 *     au client), jamais « informative » — ce qui la ferait disparaître ;
 *   - une réponse ne peut pas être VALIDÉE sans sa source ;
 *   - la rédaction ne promeut jamais elle-même une réponse en « validée ».
 */

const USER = 'user-1'

function build() {
  const rfps = createMockRepository<RfpEntity>()
  const sourceDocuments = createMockRepository<RfpSourceDocumentEntity>()
  const accounts = createMockRepository<AccountEntity>()
  rfps.save.mockImplementation(async (entity: Partial<RfpEntity>) => ({ id: 'rfp-1', ...entity }))
  sourceDocuments.save.mockImplementation(async (entity: Partial<RfpSourceDocumentEntity>) => ({
    id: 'rfp-doc-1',
    ...entity,
  }))
  sourceDocuments.find.mockResolvedValue([])

  const ia = {
    rfpAnalyse: jest.fn(),
    rfpDraft: jest.fn(),
  } as unknown as IaClient
  const esnProfile = {
    getAnswers: jest.fn().mockResolvedValue({}),
    resolveProfileData: jest.fn().mockResolvedValue({}),
  } as unknown as EsnProfileService
  const isDemoWorkspace = jest.fn().mockResolvedValue(false)
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    isDemoWorkspace,
  } as unknown as WorkspaceContextService
  const storage = {
    put: jest.fn().mockResolvedValue({
      id: 'object-1',
      fileName: 'document.pdf',
      contentType: 'application/pdf',
      byteSize: 42,
      retentionUntil: '2031-01-01',
      uploadedAt: '2026-09-30T00:00:00.000Z',
    }),
    byIds: jest.fn().mockResolvedValue(new Map()),
    usedBytes: jest.fn().mockResolvedValue(0),
    quotaBytes: jest.fn().mockReturnValue(1_000_000_000),
    signedUrlFor: jest.fn().mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: '2026-09-30T00:05:00.000Z',
      fileName: 'document.pdf',
    }),
  } as unknown as StorageService

  const service = new RfpService(
    rfps as never,
    sourceDocuments as never,
    accounts as never,
    ia,
    esnProfile,
    workspaceContext,
    storage,
  )
  return { service, rfps, sourceDocuments, accounts, ia, esnProfile, isDemoWorkspace, storage }
}

function requirement(over: Partial<RfpEntity['requirements'][number]> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    rfp_id: 'rfp-1',
    section: null,
    text: 'Hébergement en France',
    weight: 'mandatory' as const,
    kind: 'security' as const,
    owner_role: 'security' as const,
    answer_status: 'to_produce' as const,
    answer_source: null,
    answer_text: null,
    risk: null,
    source_document: null,
    ...over,
  }
}

describe('import et analyse', () => {
  it('refuse un import sans texte ni fichier', async () => {
    const { service } = build()
    await expect(service.create(USER, { title: 'AO' })).rejects.toThrow(BadRequestException)
  })

  it('classe une exigence de poids inconnu en AMBIGUË, jamais en informative', async () => {
    // « informative » la ferait disparaître des manques ; « ambiguous » la
    // transforme en question au client. Trancher à sa place est la façon la plus
    // courante de perdre un lot.
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [{ text: 'Réversibilité en fin de contrat', weight: 'peut-être' }],
    })
    const { rfp, compliance } = await service.create(USER, { title: 'AO', text: 'contenu' })
    expect(rfp.requirements[0].weight).toBe('ambiguous')
    expect(compliance.ambiguous).toBe(1)
    expect(compliance.exportReady).toBe(false)
  })

  it('ignore une exigence sans texte plutôt que d’en fabriquer une', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [{ text: '   ' }, { weight: 'mandatory' }, { text: 'Vraie exigence' }],
    })
    const { rfp } = await service.create(USER, { title: 'AO', text: 'contenu' })
    expect(rfp.requirements).toHaveLength(1)
    expect(rfp.requirements[0].text).toBe('Vraie exigence')
  })

  it('reste en « analysé » — le bid/no-bid est une proposition, pas une décision', async () => {
    // Passer directement en `bid` reviendrait à décider à la place de l'humain.
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      decision: {
        verdict: 'bid',
        rationale: 'fit élevé',
        fit: 80,
        capacity: 70,
        conditions: [],
        questions: [],
        redFlags: [],
      },
    })
    const { rfp } = await service.create(USER, { title: 'AO', text: 'contenu' })
    expect(rfp.status).toBe('analysed')
    expect(rfp.decision?.verdict).toBe('bid')
  })

  it('ne laisse pas un profil ESN indisponible bloquer l’import', async () => {
    // Le fit sera moins tranché — ce qui est honnête — mais le dossier entre.
    const { service, ia, esnProfile } = build()
    ;(esnProfile.resolveProfileData as jest.Mock).mockRejectedValue(new Error('profil HS'))
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    await expect(service.create(USER, { title: 'AO', text: 'contenu' })).resolves.toBeDefined()
  })

  it('garde le titre saisi par le commercial plutôt que celui extrait', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ title: 'CONSULTATION 2026-042', requirements: [] })
    const { rfp } = await service.create(USER, { title: 'AO industrialisation', text: 'x' })
    expect(rfp.title).toBe('AO industrialisation')
  })

  it('n’invente pas une date d’échéance illisible', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ dueAt: 'fin du mois', requirements: [] })
    const { rfp } = await service.create(USER, { title: 'AO', text: 'x' })
    expect(rfp.due_at).toBeNull()
  })
})

/**
 * #2180.2 / #2180.4 / #2180.27 — DÉTECTION et REGROUPEMENT de plusieurs
 * documents dans un même dossier. Chaque document est analysé séparément
 * (l'IA ne reçoit qu'un texte à la fois) puis regroupé ici — c'est ce qui
 * permet de savoir ensuite QUEL document a produit QUELLE exigence.
 */
describe('import multi-documents (#2180.2, #2180.4)', () => {
  it('analyse chaque document séparément et regroupe leurs exigences', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock)
      .mockResolvedValueOnce({ requirements: [{ text: 'Hébergement en France' }] })
      .mockResolvedValueOnce({ requirements: [{ text: 'Livraison en 6 mois' }] })
    const { rfp } = await service.create(USER, {
      title: 'AO',
      documents: [
        { text: 'cahier des charges', fileName: 'cctp.pdf' },
        { text: 'bordereau de prix', fileName: 'bpu.xlsx' },
      ],
    })
    expect(ia.rfpAnalyse).toHaveBeenCalledTimes(2)
    expect(rfp.requirements).toHaveLength(2)
    expect(rfp.requirements[0].source_document).toBe('cctp.pdf')
    expect(rfp.requirements[1].source_document).toBe('bpu.xlsx')
  })

  it('ne fabrique pas de bid/no-bid par fusion — decision reste `null` au-delà d’un document', async () => {
    // Chaque analyse ne porte que sur SA propre lecture, partielle : une
    // décision unique demanderait une lecture combinée que le modèle n'a pas
    // faite. Tranché sans Louis (#2957).
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      decision: {
        verdict: 'bid',
        rationale: 'fit élevé',
        fit: 80,
        capacity: 70,
        conditions: [],
        questions: [],
        redFlags: [],
      },
    })
    const { rfp } = await service.create(USER, {
      title: 'AO',
      documents: [{ text: 'doc 1' }, { text: 'doc 2' }],
    })
    expect(rfp.decision).toBeNull()
  })

  it('mono-document reste inchangé : `source_document` null, decision reprise telle quelle', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [{ text: 'Réversibilité en fin de contrat' }],
      decision: { verdict: 'bid', rationale: 'ok', fit: 60, capacity: 60, conditions: [], questions: [], redFlags: [] },
    })
    const { rfp } = await service.create(USER, { title: 'AO', text: 'contenu' })
    expect(rfp.requirements[0].source_document).toBeNull()
    expect(rfp.decision?.verdict).toBe('bid')
  })

  it('refuse un import où un document n’a ni texte ni fichier', async () => {
    const { service } = build()
    await expect(
      service.create(USER, { title: 'AO', documents: [{ text: 'doc 1' }, { fileName: 'vide.pdf' }] }),
    ).rejects.toThrow(BadRequestException)
  })

  it('le premier champ non nul gagne — titre, émetteur, échéance, lots', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock)
      .mockResolvedValueOnce({ requirements: [], issuer: null, dueAt: null, lots: [] })
      .mockResolvedValueOnce({ requirements: [], issuer: 'Ville de Test', dueAt: '2026-12-01', lots: ['Lot 1'] })
    const { rfp } = await service.create(USER, {
      title: 'AO',
      documents: [{ text: 'doc 1' }, { text: 'doc 2' }],
    })
    expect(rfp.issuer).toBe('Ville de Test')
    expect(rfp.due_at?.toISOString().slice(0, 10)).toBe('2026-12-01')
    expect(rfp.lots).toEqual(['Lot 1'])
  })
})

/**
 * #2957 (#2180.9-.26) — la structure DOSSIER : douze catégories, chacune
 * avec sa provenance. Distincte de `requirements[]` (une ligne de conformité
 * par exigence).
 */
describe('extraction document (#2957, #2180.9-.26)', () => {
  function extractedField(over: Partial<Record<string, unknown>> = {}) {
    return { value: 'Société Générale SA', page: '1', confidence: 'high', status: 'found', ...over }
  }

  it('reparente une catégorie TROUVÉE, avec sa page et sa confiance', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      documentExtraction: { legal_entity: extractedField() },
    })

    const { rfp } = await service.create(USER, { title: 'AO', text: 'contenu' })

    expect(rfp.document_extraction?.legal_entity).toEqual({
      value: 'Société Générale SA',
      source_document: null, // mono-document : rien à distinguer, comme `source_document` sur les exigences
      page: '1',
      confidence: 'high',
      status: 'found',
    })
  })

  it('un statut NON_TROUVÉ ne porte jamais de valeur, même si le modèle en a écrit une par erreur', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      documentExtraction: { pricing: extractedField({ value: 'texte halluciné', status: 'not_found' }) },
    })

    const { rfp } = await service.create(USER, { title: 'AO', text: 'contenu' })

    expect(rfp.document_extraction?.pricing).toEqual({
      value: null,
      source_document: null,
      page: '1',
      confidence: 'high',
      status: 'not_found',
    })
  })

  it('un statut hors catalogue devient `not_found` — la position la plus prudente', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      documentExtraction: { volumes: extractedField({ status: 'inconnu' }) },
    })

    const { rfp } = await service.create(USER, { title: 'AO', text: 'contenu' })

    expect(rfp.document_extraction?.volumes?.status).toBe('not_found')
    expect(rfp.document_extraction?.volumes?.value).toBeNull()
  })

  it('JAMAIS de `contradiction` sur un document lu seul — dégradé en `to_verify`', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      documentExtraction: { calendar: extractedField({ status: 'contradiction' }) },
    })

    const { rfp } = await service.create(USER, { title: 'AO', text: 'contenu' })

    expect(rfp.document_extraction?.calendar?.status).toBe('to_verify')
  })

  it('aucune extraction rendue par le modèle → `document_extraction` reste `null`, jamais un objet vide fabriqué', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })

    const { rfp } = await service.create(USER, { title: 'AO', text: 'contenu' })

    expect(rfp.document_extraction).toBeNull()
  })

  it('multi-document : le PREMIER document qui a une valeur pour une catégorie gagne, avec SON nom de document', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock)
      .mockResolvedValueOnce({
        requirements: [],
        documentExtraction: { legal_entity: extractedField({ status: 'not_found', value: '' }) },
      })
      .mockResolvedValueOnce({
        requirements: [],
        documentExtraction: { legal_entity: extractedField({ value: 'Ville de Test' }) },
      })

    const { rfp } = await service.create(USER, {
      title: 'AO',
      documents: [
        { text: 'doc 1', fileName: 'cctp.pdf' },
        { text: 'doc 2', fileName: 'reglement.pdf' },
      ],
    })

    expect(rfp.document_extraction?.legal_entity).toMatchObject({
      value: 'Ville de Test',
      source_document: 'reglement.pdf',
    })
  })

  it('preview() rend exactement la même extraction que confirm() écrit — aucune ré-analyse', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      documentExtraction: { contacts: extractedField({ value: 'M. Dupont, DSI' }) },
    })

    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu' })
    const { rfp } = await service.confirm(USER, { draft })

    expect(rfp.document_extraction?.contacts?.value).toBe('M. Dupont, DSI')
  })

  /**
   * #2180.35/.44 — chaque document est TOUJOURS analysé séparément (l'IA ne
   * reçoit qu'un texte à la fois, inchangé), mais le REGROUPEMENT compare
   * désormais les lectures entre elles plutôt que de prendre la première.
   */
  it('#2180.35 — deux documents qui se contredisent sur une même catégorie produisent `contradiction`, jamais une valeur choisie au hasard', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock)
      .mockResolvedValueOnce({
        requirements: [],
        documentExtraction: { calendar: extractedField({ value: 'Remise le 2026-10-15' }) },
      })
      .mockResolvedValueOnce({
        requirements: [],
        documentExtraction: { calendar: extractedField({ value: 'Remise le 2026-11-02' }) },
      })

    const { rfp } = await service.create(USER, {
      title: 'AO',
      documents: [
        { text: 'doc 1', fileName: 'reglement.pdf' },
        { text: 'doc 2', fileName: 'avenant.pdf' },
      ],
    })

    expect(rfp.document_extraction?.calendar).toEqual({
      value: null,
      source_document: null,
      page: null,
      confidence: null,
      status: 'contradiction',
    })
  })

  it('#2180.35 — la même valeur lue par deux documents (espaces/casse différents) n’est PAS une contradiction', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock)
      .mockResolvedValueOnce({
        requirements: [],
        documentExtraction: { legal_entity: extractedField({ value: '  Ville de Test  ' }) },
      })
      .mockResolvedValueOnce({
        requirements: [],
        documentExtraction: { legal_entity: extractedField({ value: 'ville de test' }) },
      })

    const { rfp } = await service.create(USER, {
      title: 'AO',
      documents: [{ text: 'doc 1' }, { text: 'doc 2' }],
    })

    expect(rfp.document_extraction?.legal_entity?.status).toBe('found')
  })

  it('#2180.35 — une catégorie `not_found` sur un document n’entre pas en contradiction avec la valeur trouvée par l’autre', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock)
      .mockResolvedValueOnce({
        requirements: [],
        documentExtraction: { pricing: extractedField({ status: 'not_found', value: '' }) },
      })
      .mockResolvedValueOnce({
        requirements: [],
        documentExtraction: { pricing: extractedField({ value: '120 000 €' }) },
      })

    const { rfp } = await service.create(USER, {
      title: 'AO',
      documents: [{ text: 'doc 1' }, { text: 'doc 2' }],
    })

    expect(rfp.document_extraction?.pricing).toMatchObject({ value: '120 000 €', status: 'found' })
  })
})

/**
 * #2180.5 / #2180.6 — l'écran de preview d'import. `preview` analyse SANS
 * écrire ; `confirm` écrit exactement le brouillon rendu par `preview`, sans
 * jamais relancer l'IA.
 */
describe('preview et confirmation d’import (#2180.5, #2180.6)', () => {
  it('preview analyse sans RIEN écrire', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [{ text: 'Hébergement en France', weight: 'mandatory' }],
    })

    const { draft, indicators } = await service.preview(USER, { title: 'AO', text: 'contenu' })

    expect(rfps.save).not.toHaveBeenCalled()
    expect(draft.requirements).toHaveLength(1)
    expect(indicators.totalRequirements).toBe(1)
    expect(indicators.mandatoryRequirements).toBe(1)
  })

  it('nomme « non mesuré » les indicateurs sans détection — jamais un zéro fabriqué', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })

    const { indicators } = await service.preview(USER, { title: 'AO', text: 'contenu' })

    expect(indicators.missingDocuments).toBeNull()
    expect(indicators.contradictions).toBeNull()
    expect(indicators.estimatedCost).toBeNull()
  })

  it('confirm écrit exactement le brouillon reçu, sans ré-appeler l’IA', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [{ text: 'Hébergement en France', weight: 'mandatory' }],
    })
    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu' })
    ;(ia.rfpAnalyse as jest.Mock).mockClear()

    const { rfp, compliance } = await service.confirm(USER, { draft })

    expect(ia.rfpAnalyse).not.toHaveBeenCalled()
    expect(rfp.title).toBe('AO')
    expect(rfp.status).toBe('analysed')
    expect(rfp.requirements).toHaveLength(1)
    expect(compliance.total).toBe(1)
  })

  // #2957 (#2179.31) — « Créer depuis un besoin » : le dossier naît LIÉ au
  // besoin d'origine, ce qui ferme « Transformer en besoin » (garde #2179.36)
  // — jamais un second besoin pour le même travail.
  it('confirm lie le dossier au besoin d’origine quand il en vient', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu' })
    const needId = '00000000-0000-4000-8000-0000000000aa'

    const { rfp } = await service.confirm(USER, { draft, sourceNeedId: needId })

    expect(rfp.need_id).toBe(needId)
  })

  it('confirm sans besoin d’origine laisse need_id vide (comportement d’avant)', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu' })

    const { rfp } = await service.confirm(USER, { draft })

    expect(rfp.need_id ?? null).toBeNull()
  })

  it('confirm convertit l’échéance ISO du brouillon en Date, comme `create`', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [], dueAt: '2026-12-01' })
    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu' })

    const { rfp } = await service.confirm(USER, { draft })

    expect(rfp.due_at?.toISOString().slice(0, 10)).toBe('2026-12-01')
  })
})

describe('fichiers sources conservés (#2957, #2180.54)', () => {
  it('confirm range le fichier BRUT et crée la jointure vers le dossier créé', async () => {
    const { service, ia, storage, sourceDocuments } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    const { draft } = await service.preview(USER, { title: 'AO', fileBase64: 'YQ==', fileName: 'cahier.pdf' })

    const { rfp } = await service.confirm(USER, {
      draft,
      sourceDocuments: [{ fileBase64: 'YQ==', fileName: 'cahier.pdf' }],
    })

    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        domain: 'rfp_source_document',
        fileName: 'cahier.pdf',
        fileB64: 'YQ==',
      }),
    )
    expect(sourceDocuments.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'ws-1', rfp_id: rfp.id, storage_object_id: 'object-1', position: 0 }),
    )
  })

  it('un document texte collé (sans fileBase64) ne range aucun fichier — rien à conserver', async () => {
    const { service, ia, storage, sourceDocuments } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu collé' })

    await service.confirm(USER, { draft, sourceDocuments: [{ text: 'contenu collé' }] })

    expect(storage.put).not.toHaveBeenCalled()
    expect(sourceDocuments.save).not.toHaveBeenCalled()
  })

  it('confirm sans sourceDocuments (comportement d’avant ce lot) ne range rien', async () => {
    const { service, ia, storage } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu' })

    const { rfp } = await service.confirm(USER, { draft })

    expect(rfp).toBeDefined()
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('un dépôt de fichier en échec (quota dépassé) ne fait PAS échouer confirm — le dossier reste écrit', async () => {
    const { service, ia, storage } = build()
    ;(storage.put as jest.Mock).mockRejectedValueOnce(new Error('Quota d’espace dépassé.'))
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    const { draft } = await service.preview(USER, { title: 'AO', fileBase64: 'YQ==', fileName: 'cahier.pdf' })

    const { rfp } = await service.confirm(USER, {
      draft,
      sourceDocuments: [{ fileBase64: 'YQ==', fileName: 'cahier.pdf' }],
    })

    expect(rfp.title).toBe('AO')
  })

  it('create (import direct) range aussi le fichier — même chemin que confirm', async () => {
    const { service, ia, storage } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })

    await service.create(USER, { title: 'AO', fileBase64: 'YQ==', fileName: 'cahier.pdf' })

    expect(storage.put).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'cahier.pdf', fileB64: 'YQ==' }))
  })

  it('listSourceDocuments rend les fichiers RÉELLEMENT résolus, dans l’ordre de dépôt, et saute une ligne orpheline', async () => {
    const { service, rfps, sourceDocuments, storage } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1' })
    sourceDocuments.find.mockResolvedValue([
      { id: 'join-1', storage_object_id: 'object-1', position: 0 },
      { id: 'join-2', storage_object_id: 'object-2', position: 1 },
    ])
    ;(storage.byIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          'object-1',
          {
            id: 'object-1',
            fileName: 'cahier.pdf',
            contentType: 'application/pdf',
            byteSize: 42,
            retentionUntil: '2031-01-01',
            uploadedAt: '2026-09-30T00:00:00.000Z',
          },
        ],
        // 'object-2' absent : purgé — SAUTÉ, jamais inventé.
      ]),
    )

    const result = await service.listSourceDocuments(USER, 'rfp-1')

    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.fileName).toBe('cahier.pdf')
    expect(result.files[0]?.downloadPath).toBe('/rfp/rfp-1/documents/object-1/download')
  })

  it('listSourceDocuments refuse un dossier hors de l’espace de l’appelant', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue(null)

    await expect(service.listSourceDocuments(USER, 'rfp-etranger')).rejects.toThrow('Appel d’offres introuvable.')
  })

  it('downloadSourceDocument rend une URL signée pour un fichier RÉELLEMENT référencé par ce dossier', async () => {
    const { service, rfps, sourceDocuments, storage } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1' })
    sourceDocuments.findOne.mockResolvedValue({ id: 'join-1', storage_object_id: 'object-1' })

    const signed = await service.downloadSourceDocument(USER, 'rfp-1', 'object-1')

    expect(signed.url).toBe('https://storage.example/signed')
    expect(storage.signedUrlFor).toHaveBeenCalledWith('ws-1', 'object-1')
  })

  it('downloadSourceDocument refuse un identifiant deviné — pas référencé par CE dossier', async () => {
    const { service, rfps, sourceDocuments } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1' })
    sourceDocuments.findOne.mockResolvedValue(null)

    await expect(service.downloadSourceDocument(USER, 'rfp-1', 'object-devine')).rejects.toThrow(
      'Ce document n’a pas de fichier stocké ici.',
    )
  })
})

describe('détection de doublon par hash documentaire (#2180.40)', () => {
  it('calcule le MÊME hash pour le MÊME contenu, deux imports séparés', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })

    const first = await service.preview(USER, { title: 'AO', text: 'contenu identique' })
    const second = await service.preview(USER, { title: 'Autre titre', text: 'contenu identique' })

    expect(first.draft.document_hash).toBe(second.draft.document_hash)
    expect(first.draft.document_hash).toHaveLength(64)
  })

  it('un contenu DIFFÉRENT produit un hash DIFFÉRENT', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })

    const first = await service.preview(USER, { title: 'AO', text: 'contenu A' })
    const second = await service.preview(USER, { title: 'AO', text: 'contenu B' })

    expect(first.draft.document_hash).not.toBe(second.draft.document_hash)
  })

  it('aucune correspondance dans l’espace → `duplicateOf` reste `null`, une recherche réellement faite', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    rfps.findOne.mockResolvedValue(null)

    const { duplicateOf } = await service.preview(USER, { title: 'AO', text: 'contenu' })

    expect(duplicateOf).toBeNull()
    expect(rfps.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1' }) }),
    )
  })

  it('un dossier déjà présent dans l’espace, MÊME hash → nommé dans `duplicateOf`', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    rfps.findOne.mockResolvedValue({ id: 'rfp-existant', title: 'AO déjà importé' })

    const { duplicateOf } = await service.preview(USER, { title: 'AO', text: 'contenu' })

    expect(duplicateOf).toEqual({ id: 'rfp-existant', title: 'AO déjà importé', matchedOn: ['hash'] })
  })

  it('confirm persiste le hash — comparable par le PROCHAIN import de ce même contenu', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu' })

    const { rfp } = await service.confirm(USER, { draft })

    expect(rfp.document_hash).toBe(draft.document_hash)
  })
})

describe('détection de doublon par similarité (#2180.36-38)', () => {
  it('aucun hash égal, mais titre ET émetteur similaires sur un dossier récent de l’espace → proposé, jamais fusionné', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [], issuer: 'Société Générale' })
    rfps.findOne.mockResolvedValue(null)
    rfps.find.mockResolvedValue([
      { id: 'rfp-proche', title: 'Refonte SI Comptable', issuer: 'société générale', due_at: null },
    ])

    const { duplicateOf } = await service.preview(USER, { title: 'Refonte SI comptable', text: 'contenu neuf' })

    expect(duplicateOf).toEqual({ id: 'rfp-proche', title: 'Refonte SI Comptable', matchedOn: ['title', 'issuer'] })
  })

  it('titre proche mais SEUL — aucun second critère — ne propose rien (faux positif évité)', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    rfps.findOne.mockResolvedValue(null)
    rfps.find.mockResolvedValue([{ id: 'rfp-proche', title: 'Refonte SI comptable', issuer: null, due_at: null }])

    const { duplicateOf } = await service.preview(USER, { title: 'Refonte SI comptable', text: 'contenu neuf' })

    expect(duplicateOf).toBeNull()
  })

  it('scope l’espace : la recherche de similarité est faite sur `workspace_id`, jamais globale (GA-43)', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    rfps.findOne.mockResolvedValue(null)
    rfps.find.mockResolvedValue([])

    await service.preview(USER, { title: 'AO', text: 'contenu' })

    expect(rfps.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1' }) }),
    )
  })
})

// #2957 (#2180.39) — le doublon par RÉFÉRENCE de consultation.
describe('détection de doublon par référence (#2180.39)', () => {
  it('même référence (écrite autrement) sur un dossier de l’espace → proposé, seul critère suffisant', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [], reference: '2026/infra-042' })
    rfps.findOne.mockResolvedValue(null)
    rfps.find.mockResolvedValue([
      { id: 'rfp-ref', title: 'Tout autre titre', issuer: null, due_at: null, reference: '2026-INFRA-042' },
    ])

    const { draft, duplicateOf } = await service.preview(USER, { title: 'AO neuf', text: 'contenu neuf' })

    expect(draft.reference).toBe('2026/infra-042')
    expect(duplicateOf).toEqual({ id: 'rfp-ref', title: 'Tout autre titre', matchedOn: ['reference'] })
  })

  it('sait dire NON — sans référence extraite, aucun doublon par référence', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })
    rfps.findOne.mockResolvedValue(null)
    rfps.find.mockResolvedValue([
      { id: 'rfp-ref', title: 'Tout autre titre', issuer: null, due_at: null, reference: '2026-INFRA-042' },
    ])

    const { draft, duplicateOf } = await service.preview(USER, { title: 'AO neuf', text: 'contenu neuf' })

    expect(draft.reference ?? null).toBeNull()
    expect(duplicateOf).toBeNull()
  })

  it('la référence est persistée à la confirmation', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [], reference: '2026-INFRA-042' })
    const { draft } = await service.preview(USER, { title: 'AO', text: 'contenu' })
    const { rfp } = await service.confirm(USER, { draft })
    expect(rfp.reference).toBe('2026-INFRA-042')
  })
})

describe('import interrompable et reprenable (#2180.53)', () => {
  it('un document en échec ne perd PAS le travail déjà fait sur les autres — preview reste exploitable', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock)
      .mockResolvedValueOnce({ requirements: [requirement()] })
      .mockRejectedValueOnce(new Error('Document illisible'))

    const preview = await service.preview(USER, {
      title: 'AO',
      documents: [{ text: 'doc 1' }, { text: 'doc 2', fileName: 'lot2.pdf' }],
    })

    expect(preview.draft.requirements).toHaveLength(1)
    expect(preview.failedDocuments).toEqual([{ fileName: 'lot2.pdf', reason: 'Document illisible' }])
  })

  it('aucun échec → `failedDocuments` vide, un fait vérifié, pas une absence de vérification', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [] })

    const preview = await service.preview(USER, { title: 'AO', text: 'contenu' })

    expect(preview.failedDocuments).toEqual([])
  })

  it('TOUS les documents échouent → aucune preview possible, l’erreur du premier échec remonte', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockRejectedValue(new Error('Service IA indisponible'))

    await expect(service.preview(USER, { title: 'AO', text: 'contenu' })).rejects.toThrow('Service IA indisponible')
  })

  it('`create` (écriture directe) refuse un dossier incomplet plutôt que d’en persister un amputé', async () => {
    const { service, ia, rfps } = build()
    ;(ia.rfpAnalyse as jest.Mock)
      .mockResolvedValueOnce({ requirements: [requirement()] })
      .mockRejectedValueOnce(new Error('Document illisible'))

    await expect(
      service.create(USER, { title: 'AO', documents: [{ text: 'doc 1' }, { text: 'doc 2', fileName: 'lot2.pdf' }] }),
    ).rejects.toThrow(BadRequestException)
    expect(rfps.save).not.toHaveBeenCalled()
  })
})

describe('validation d’une réponse', () => {
  it('refuse de valider une réponse sans sa source', async () => {
    // Le garde-fou central : valider sans savoir d'où vient la réponse est
    // exactement ce qui produit un engagement inventé.
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    await expect(
      service.updateRequirement(USER, 'rfp-1', requirement().id, { answer_status: 'validated' }),
    ).rejects.toThrow(/source/i)
  })

  it('accepte la validation dès qu’une source est citée', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    const { compliance } = await service.updateRequirement(USER, 'rfp-1', requirement().id, {
      answer_status: 'validated',
      answer_source: 'politique sécurité 2026',
    })
    expect(compliance.mandatoryUnanswered).toBe(0)
    expect(compliance.exportReady).toBe(true)
  })

  it('un patch partiel n’écrase pas ce qui n’est pas fourni', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({
      id: 'rfp-1',
      workspace_id: 'ws-1',
      requirements: [requirement({ answer_text: 'texte existant', answer_source: 'source A' })],
    })
    const { rfp } = await service.updateRequirement(USER, 'rfp-1', requirement().id, { owner_role: 'legal' })
    expect(rfp.requirements[0].answer_text).toBe('texte existant')
    expect(rfp.requirements[0].owner_role).toBe('legal')
  })
})

// #2957 (#2181.16) — réécrire une réponse archive l'ancienne, jamais l'efface.
describe('versions d’une réponse (#2181.16)', () => {
  it('réécrire le texte d’une réponse garde l’ancien dans `versions`, avec son auteur', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({
      id: 'rfp-1',
      workspace_id: 'ws-1',
      requirements: [requirement({ answer_text: 'ancienne réponse', answer_status: 'drafted' })],
    })
    const { rfp } = await service.updateRequirement(USER, 'rfp-1', requirement().id, { answer_text: 'nouvelle' })
    expect(rfp.requirements[0].answer_text).toBe('nouvelle')
    expect(rfp.requirements[0].versions).toHaveLength(1)
    expect(rfp.requirements[0].versions?.[0]).toMatchObject({ answer_text: 'ancienne réponse', replaced_by: USER })
  })

  it('changer un rôle ne crée aucune version', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({
      id: 'rfp-1',
      workspace_id: 'ws-1',
      requirements: [requirement({ answer_text: 'réponse' })],
    })
    const { rfp } = await service.updateRequirement(USER, 'rfp-1', requirement().id, { owner_role: 'legal' })
    expect(rfp.requirements[0].versions).toBeUndefined()
  })
})

// #2957 (#2181.15) — commentaires d'équipe par exigence.
describe('commentaires par exigence (#2181.15)', () => {
  it('ajoute un commentaire, auteur et date posés par le serveur', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    const { rfp } = await service.addRequirementComment(USER, 'rfp-1', requirement().id, {
      body: 'À revoir avec le juridique',
    })
    const comments = rfp.requirements[0].comments ?? []
    expect(comments).toHaveLength(1)
    expect(comments[0]).toMatchObject({ author_id: USER, body: 'À revoir avec le juridique' })
    expect(typeof comments[0].id).toBe('string')
    expect(Number.isNaN(Date.parse(comments[0].created_at))).toBe(false)
  })

  it('ajoute à la suite, sans effacer les précédents', async () => {
    const { service, rfps } = build()
    const earlier = { id: 'c-1', author_id: 'u-2', body: 'premier', created_at: '2026-09-27T10:00:00.000Z' }
    rfps.findOne.mockResolvedValue({
      id: 'rfp-1',
      workspace_id: 'ws-1',
      requirements: [requirement({ comments: [earlier] })],
    })
    const { rfp } = await service.addRequirementComment(USER, 'rfp-1', requirement().id, { body: 'second' })
    expect(rfp.requirements[0].comments?.map(comment => comment.body)).toEqual(['premier', 'second'])
  })

  it('refuse une exigence introuvable — rien n’est écrit', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    await expect(
      service.addRequirementComment(USER, 'rfp-1', '99999999-9999-4999-8999-999999999999', { body: 'x' }),
    ).rejects.toThrow('Exigence introuvable.')
    expect(rfps.save).not.toHaveBeenCalled()
  })
})

// #2957 (#2181.40) — attribuer une section entière à un rôle.
describe('attribuer une section (#2181.40)', () => {
  it('pose le rôle sur TOUTES les exigences de la section, et seulement elles', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({
      id: 'rfp-1',
      workspace_id: 'ws-1',
      requirements: [
        requirement({ id: 'a1111111-1111-4111-8111-111111111111', section: 'Sécurité', owner_role: 'sales' }),
        requirement({ id: 'b1111111-1111-4111-8111-111111111111', section: 'Sécurité', owner_role: 'expert' }),
        requirement({ id: 'c1111111-1111-4111-8111-111111111111', section: 'Technique', owner_role: 'sales' }),
      ],
    })
    const { rfp } = await service.assignSectionOwner(USER, 'rfp-1', { section: 'Sécurité', owner_role: 'legal' })
    expect(rfp.requirements.map(r => r.owner_role)).toEqual(['legal', 'legal', 'sales'])
  })

  it('« sans section » vise les exigences dont la section est absente', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({
      id: 'rfp-1',
      workspace_id: 'ws-1',
      requirements: [
        requirement({ section: null }),
        requirement({ id: 'c1111111-1111-4111-8111-111111111111', section: 'Technique' }),
      ],
    })
    const { rfp } = await service.assignSectionOwner(USER, 'rfp-1', { section: null, owner_role: 'finance' })
    expect(rfp.requirements.map(r => r.owner_role)).toEqual(['finance', rfp.requirements[1].owner_role])
    expect(rfp.requirements[1].owner_role).not.toBe('finance')
  })

  it('refuse une section qui ne porte aucune exigence — rien n’est écrit', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({
      id: 'rfp-1',
      workspace_id: 'ws-1',
      requirements: [requirement({ section: 'Technique' })],
    })
    await expect(
      service.assignSectionOwner(USER, 'rfp-1', { section: 'Inconnue', owner_role: 'legal' }),
    ).rejects.toThrow('Section introuvable.')
    expect(rfps.save).not.toHaveBeenCalled()
  })
})

// #2957 (#2181.48) — « annoncer le coût avant génération lourde » : l'écran
// annonce qu'aucun crédit n'est débité. Cette garde tient la promesse — le
// jour où le service dépendrait des crédits, l'annonce deviendrait fausse.
describe('coût annoncé (#2181.48)', () => {
  it('RfpService ne dépend d’aucun service de crédits', () => {
    const params = (Reflect.getMetadata('design:paramtypes', RfpService) ?? []) as Array<{ name?: string }>
    expect(params.length).toBeGreaterThan(0)
    expect(params.map(param => param?.name ?? '').filter(name => /credit/i.test(name))).toEqual([])
  })
})

describe('rédaction', () => {
  it('ne promeut JAMAIS une réponse en « validée » — c’est un humain qui valide', async () => {
    const { service, rfps, ia } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(ia.rfpDraft as jest.Mock).mockResolvedValue({
      status: 'drafted',
      answer: 'Nos données sont hébergées en France.',
      source: 'contrat cadre 2025',
    })
    const { rfp } = await service.draft(USER, 'rfp-1', requirement().id, [])
    expect(rfp.requirements[0].answer_status).toBe('drafted')
  })

  it('rend « à produire » avec ce qui manque quand aucune source ne couvre l’exigence', async () => {
    // Ce n'est pas un échec : c'est l'information la plus utile de l'écran.
    const { service, rfps, ia } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(ia.rfpDraft as jest.Mock).mockResolvedValue({
      status: 'to_produce',
      ownerRole: 'legal',
      missing: 'attestation d’hébergement',
    })
    const { rfp, compliance } = await service.draft(USER, 'rfp-1', requirement().id, [])
    expect(rfp.requirements[0].answer_status).toBe('to_produce')
    expect(rfp.requirements[0].owner_role).toBe('legal')
    expect(rfp.requirements[0].risk).toContain('attestation')
    expect(compliance.exportReady).toBe(false)
  })

  it('compte une réponse rédigée sans source comme un engagement non prouvé', async () => {
    const { service, rfps, ia } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(ia.rfpDraft as jest.Mock).mockResolvedValue({ status: 'drafted', answer: 'Nous sommes certifiés.', source: null })
    const { compliance } = await service.draft(USER, 'rfp-1', requirement().id, [])
    expect(compliance.unprovenCommitments).toHaveLength(1)
    expect(compliance.exportReady).toBe(false)
  })

  it('refuse une exigence qui n’appartient pas au dossier', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    await expect(service.draft(USER, 'rfp-1', '99999999-9999-4999-8999-999999999999', [])).rejects.toThrow(
      /introuvable/i,
    )
  })

  describe('salle de démonstration', () => {
    it('n’appelle AUCUN modèle : l’analyse est scriptée', async () => {
      // Vu en production le 03/08 : coller un texte dans l'écran « Appels
      // d'offres » depuis le lien PUBLIC déclenchait une analyse Claude complète,
      // trente-cinq secondes, dans un espace dont le bandeau annonce que les
      // analyses réelles sont désactivées.
      const { service, ia, isDemoWorkspace } = build()
      isDemoWorkspace.mockResolvedValue(true)

      const { rfp } = await service.create(USER, { title: 'Consultation', text: 'Objet : refonte du portail.' })

      expect(ia.rfpAnalyse).not.toHaveBeenCalled()
      expect(rfp.requirements.length).toBeGreaterThan(0)
      expect(rfp.issuer).toContain('démo')
    })

    it('le verdict scripté DIT qu’il est scripté', async () => {
      // Un bid/no-bid écrit d'avance, présenté comme calculé, démontrerait
      // précisément la promesse qu'on ne tient pas.
      const { service, isDemoWorkspace } = build()
      isDemoWorkspace.mockResolvedValue(true)

      const { rfp } = await service.create(USER, { title: 'Consultation', text: 'Objet : refonte.' })

      expect(JSON.stringify(rfp.decision)).toMatch(/scripté/i)
    })

    it('la rédaction d’une exigence n’appelle pas de modèle non plus', async () => {
      const { service, rfps, ia, isDemoWorkspace } = build()
      isDemoWorkspace.mockResolvedValue(true)
      const target = requirement()
      rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [target] })

      const { rfp } = await service.draft(USER, 'rfp-1', target.id, [])

      expect(ia.rfpDraft).not.toHaveBeenCalled()
      expect(rfp.requirements[0].answer_text).toMatch(/démonstration/i)
      // La règle de fond ne bouge pas : jamais promu en « validée » ici.
      expect(rfp.requirements[0].answer_status).toBe('drafted')
    })
  })
})

describe('la décision rendue par le modèle est NORMALISÉE avant d’être écrite', () => {
  it('complète les listes absentes plutôt que de les stocker manquantes', async () => {
    // La décision vient d'un modèle : rien ne garantit qu'elle porte `redFlags`.
    // Elle était stockée telle quelle, et l'écran, qui fait `items.length`
    // dessus, remplaçait le dossier entier par « Une erreur inattendue est
    // survenue ». Vu en production le 03/08.
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      decision: { verdict: 'bid', rationale: 'On y va.', fit: 80 },
    })

    const { rfp } = await service.create(USER, { title: 'AO', text: 'texte' })

    expect(rfp.decision).toMatchObject({ redFlags: [], questions: [], conditions: [] })
  })

  it('écarte une décision franchement illisible plutôt que d’écrire un dossier qu’on ne peut pas ouvrir', async () => {
    const { service, ia } = build()
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({
      requirements: [],
      decision: { verdict: 'peut-être', rationale: 42 },
    })

    const { rfp } = await service.create(USER, { title: 'AO', text: 'texte' })

    expect(rfp.decision).toBeNull()
  })

  it('laisse intacte une décision complète', async () => {
    const { service, ia } = build()
    const decision = {
      verdict: 'no_bid',
      rationale: 'Trop court.',
      fit: 10,
      capacity: 20,
      conditions: [],
      questions: ['Le délai est-il ferme ?'],
      redFlags: ['Remise sous 5 jours'],
    }
    ;(ia.rfpAnalyse as jest.Mock).mockResolvedValue({ requirements: [], decision })

    const { rfp } = await service.create(USER, { title: 'AO', text: 'texte' })

    expect(rfp.decision).toEqual(decision)
  })
})

/**
 * #2056.14 — un AO reçu n'est pas une opportunité traitable. `findOne` doit
 * pouvoir dire LEQUEL des cinq axes manque, à partir de ce qui est RÉELLEMENT
 * mesuré aujourd'hui (le brief extrait, la capacité documentaire) — jamais un
 * `true` fabriqué pour `retour`, `economie` ou `responsable`, qu'aucune
 * colonne ne porte encore.
 */
describe('#2056.14 — traitabilité (findOne)', () => {
  it('un AO tout juste importé (aucune exigence) manque les cinq axes', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [] })

    const { actionability } = await service.findOne(USER, 'rfp-1')

    expect(actionability.actionable).toBe(false)
    expect(actionability.missing).toEqual(['brief', 'retour', 'economie', 'capacite', 'responsable'])
  })

  it('un brief extrait retire SEULEMENT l’axe « brief »', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })

    const { actionability } = await service.findOne(USER, 'rfp-1')

    expect(actionability.missing).toEqual(['retour', 'economie', 'capacite', 'responsable'])
  })

  it('la capacité documentaire CONFIRMÉE (#2056.13) retire l’axe « capacite »', async () => {
    const { service, rfps, esnProfile } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(esnProfile.resolveProfileData as jest.Mock).mockResolvedValue({
      rfpDocumentReadiness: 'Tout est à jour et prêt à l’usage',
    })

    const { actionability } = await service.findOne(USER, 'rfp-1')

    expect(actionability.missing).not.toContain('capacite')
    expect(actionability.missing).toEqual(['retour', 'economie', 'responsable'])
  })

  it('une réponse de capacité NÉGATIVE ne fabrique pas un axe confirmé (témoin)', async () => {
    const { service, rfps, esnProfile } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(esnProfile.resolveProfileData as jest.Mock).mockResolvedValue({
      rfpDocumentReadiness: 'Des pièces manquent ou sont périmées',
    })

    const { actionability } = await service.findOne(USER, 'rfp-1')

    expect(actionability.missing).toContain('capacite')
  })

  // #2056.11 — l'économie du dossier. `2056.11 reste hors périmètre` (commentaire
  // ci-dessus) est désormais câblé : un MONTANT déclaré (jamais « Je ne sais
  // pas ») retire l'axe « economie ».
  it('un montant DÉCLARÉ (#2056.11) retire l’axe « economie »', async () => {
    const { service, rfps, esnProfile } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(esnProfile.resolveProfileData as jest.Mock).mockResolvedValue({
      rfpDealValue: '150-500 k€',
    })

    const { actionability } = await service.findOne(USER, 'rfp-1')

    expect(actionability.missing).not.toContain('economie')
    expect(actionability.missing).toEqual(['retour', 'capacite', 'responsable'])
  })

  it('un « Je ne sais pas » explicite ne fabrique pas un axe confirmé (témoin)', async () => {
    const { service, rfps, esnProfile } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(esnProfile.resolveProfileData as jest.Mock).mockResolvedValue({
      rfpDealValue: 'Je ne sais pas',
    })

    const { actionability } = await service.findOne(USER, 'rfp-1')

    expect(actionability.missing).toContain('economie')
  })

  // #2057.10 — l'owner. Même bascule : un porteur NOMMÉ retire l'axe
  // « responsable », toute autre réponse le laisse manquant.
  it('un porteur NOMMÉ (#2057.10) retire l’axe « responsable »', async () => {
    const { service, rfps, esnProfile } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(esnProfile.resolveProfileData as jest.Mock).mockResolvedValue({
      rfpOwnerAssignment: 'Un porteur nommé sur chaque dossier',
    })

    const { actionability } = await service.findOne(USER, 'rfp-1')

    expect(actionability.missing).not.toContain('responsable')
    expect(actionability.missing).toEqual(['retour', 'economie', 'capacite'])
  })

  it('un porteur PAS TOUJOURS suivi ne fabrique pas un axe confirmé (témoin)', async () => {
    const { service, rfps, esnProfile } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', requirements: [requirement()] })
    ;(esnProfile.resolveProfileData as jest.Mock).mockResolvedValue({
      rfpOwnerAssignment: 'Un porteur nommé mais pas toujours suivi',
    })

    const { actionability } = await service.findOne(USER, 'rfp-1')

    expect(actionability.missing).toContain('responsable')
  })
})

/**
 * #2179.36 — LA GARDE ANTI-DOUBLON « Créer le besoin ».
 *
 * `markNeedCreated` est le SEUL écrivain de `need_id` (`RfpEntity`) : posé une
 * fois par la seule porte d'écriture du module (`POST :id/need`, #2571.2), il
 * permet au contrôleur de refuser un second clic sans relire tout le dossier.
 */
/**
 * #2957 (#2179.7-.12) — les cartes de résumé de la page d'entrée `/rfp`
 * (Actifs, À J-7, Exigences bloquantes, Réponses à valider, Soumis) ont
 * besoin d'un compte réel par dossier, pas seulement du statut déjà présent
 * dans `list()`. `mandatoryUnanswered`/`toValidateCount` sont calculés avec
 * la MÊME fonction pure que `findOne` (`computeRfpCompliance`) — jamais une
 * seconde logique qui pourrait diverger — puis la ligne de liste NE PORTE
 * PAS `requirements` en sortie (même discipline qu'avant ce lot : la liste
 * reste légère).
 */
describe('#2957 (#2179.7-.12) — list() porte un compte réel par dossier', () => {
  it('calcule mandatoryUnanswered et toValidateCount, sans exposer les exigences', async () => {
    const { service, rfps } = build()
    rfps.find.mockResolvedValue([
      {
        id: 'rfp-1',
        title: 'AO 1',
        status: 'bid',
        requirements: [
          requirement({ id: 'a', weight: 'mandatory', answer_status: 'to_produce' }),
          requirement({ id: 'b', weight: 'mandatory', answer_status: 'validated', answer_source: 'x' }),
          requirement({ id: 'c', weight: 'desirable', answer_status: 'drafted' }),
          requirement({ id: 'd', weight: 'desirable', answer_status: 'to_validate' }),
        ],
      },
    ])

    const { rfps: list } = await service.list(USER)

    expect(list[0]).toMatchObject({ id: 'rfp-1', mandatoryUnanswered: 1, toValidateCount: 2 })
    expect(list[0]).not.toHaveProperty('requirements')
  })

  it('un dossier sans exigence compte zéro, jamais une valeur absente', async () => {
    const { service, rfps } = build()
    rfps.find.mockResolvedValue([{ id: 'rfp-1', title: 'AO 1', status: 'intake', requirements: [] }])

    const { rfps: list } = await service.list(USER)

    expect(list[0]).toMatchObject({ mandatoryUnanswered: 0, toValidateCount: 0 })
  })

  /**
   * #2179.25/.26 — les colonnes « exigences » et « couverture » de la future
   * vue table (#2179.20-.29) ont besoin du TOTAL d'exigences et du total
   * d'obligatoires, pas seulement de `mandatoryUnanswered`. `computeRfpCompliance`
   * les calcule déjà ICI (`compliance.total`/`compliance.mandatory`) : ce lot
   * les EXPOSE, il ne les recalcule pas ailleurs (une seule fonction pure).
   */
  it('#2179.25/.26 — expose requirementsCount et mandatoryTotal, calculés par la même fonction pure', async () => {
    const { service, rfps } = build()
    rfps.find.mockResolvedValue([
      {
        id: 'rfp-1',
        title: 'AO 1',
        status: 'bid',
        requirements: [
          requirement({ id: 'a', weight: 'mandatory', answer_status: 'to_produce' }),
          requirement({ id: 'b', weight: 'mandatory', answer_status: 'validated', answer_source: 'x' }),
          requirement({ id: 'c', weight: 'desirable', answer_status: 'drafted' }),
        ],
      },
    ])

    const { rfps: list } = await service.list(USER)

    expect(list[0]).toMatchObject({ requirementsCount: 3, mandatoryTotal: 2 })
  })

  it('#2179.25/.26 — un dossier sans exigence compte zéro sur les deux, jamais une valeur absente', async () => {
    const { service, rfps } = build()
    rfps.find.mockResolvedValue([{ id: 'rfp-1', title: 'AO 1', status: 'intake', requirements: [] }])

    const { rfps: list } = await service.list(USER)

    expect(list[0]).toMatchObject({ requirementsCount: 0, mandatoryTotal: 0 })
  })
})

describe('#2179.36 — la garde anti-doublon retient l’identifiant du besoin créé', () => {
  it('écrit need_id sur LE dossier de l’espace courant, jamais un autre', async () => {
    const { service, rfps } = build()

    await service.markNeedCreated(USER, 'rfp-1', 'need-1')

    expect(rfps.update).toHaveBeenCalledWith({ id: 'rfp-1', workspace_id: 'ws-1' }, { need_id: 'need-1' })
  })
})

/**
 * #2957 (#2181.47) — « Marquer soumis ». Le registre ACTIONS de #2181 le
 * demande ; `submitted` existe dans `rfpStatusSchema` depuis le début, mais
 * AUCUN code ne transitionnait vers cet état (audit du 28/09, confirmé par
 * `git grep "status = 'submitted'"` — zéro résultat hors des fixtures de
 * test). Un geste DÉCLARATIF, jamais une preuve d'envoi (doctrine « "Fait" ne
 * porte jamais de preuve d'envoi » — Laura n'envoie jamais, le commercial
 * confirme qu'il l'a fait lui-même ailleurs) : même nature que `decide`,
 * juste au-dessus.
 */
describe('#2957 (#2181.47) — marquer un dossier soumis', () => {
  it('refuse de marquer soumis un dossier qui n’a pas été décidé « on y va »', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', status: 'analysed' })

    await expect(service.markSubmitted(USER, 'rfp-1')).rejects.toThrow(BadRequestException)
    expect(rfps.save).not.toHaveBeenCalled()
  })

  it('passe un dossier « on y va » à « soumis »', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', status: 'bid' })

    const { rfp } = await service.markSubmitted(USER, 'rfp-1')

    expect(rfp.status).toBe('submitted')
    expect(rfps.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'submitted' }))
  })

  it('un dossier déjà soumis reste soumis — pas une erreur, pas un double geste écrit', async () => {
    const { service, rfps } = build()
    rfps.findOne.mockResolvedValue({ id: 'rfp-1', workspace_id: 'ws-1', status: 'submitted' })

    const { rfp } = await service.markSubmitted(USER, 'rfp-1')

    expect(rfp.status).toBe('submitted')
    expect(rfps.save).not.toHaveBeenCalled()
  })
})
