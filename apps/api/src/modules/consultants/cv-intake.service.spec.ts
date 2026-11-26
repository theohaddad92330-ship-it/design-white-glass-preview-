import { createHash } from 'node:crypto'
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import type { TalentIdentityDecisionEntity } from '../../database/entities/talent-identity-decision.entity'
import type { IaClient } from '../ia/ia.client'
import { PERSON_ERASURE_HMAC_KEY_ENV } from '../../common/person-erasure-hmac'
import type { StorageClient } from '../storage/storage.client'
import type { CvAutoParseService } from './cv-auto-parse.service'
import { consultantErasureFingerprints } from './consultant-erasure.service'
import { CvIntakeService } from './cv-intake.service'
import { TalentIdentityService, type IdentityRow } from './talent-identity.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

function makeService(
  overrides: {
    existing?: (Partial<IdentityRow> & { id: string })[]
    extract?: unknown
    extractThrows?: Error
    target?: Record<string, unknown> | null
    erasureFingerprints?: string[]
    /** Une provenance `human` existe sur la fiche cible (`field_provenance`). */
    targetHasHuman?: boolean
    /** #4034.2 — le magasin de fichiers ; absent = chemin d'avant, byte-identique. */
    storage?: Pick<StorageClient, 'put' | 'remove'>
  } = {},
) {
  const saved: Record<string, unknown>[] = []
  const identityCalls: { sql: string; params: unknown[] }[] = []
  const markCalls: unknown[][] = []
  // #2327 — la matière de la comparaison passe par `TalentIdentityService` :
  // une ligne par fiche, avec tous ses signaux.
  const identityQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
    identityCalls.push({ sql, params })
    if (sql.includes('FROM consultants c')) {
      return (overrides.existing ?? []).map(row => ({
        workspace_id: WORKSPACE,
        full_name: null,
        email: null,
        phone: null,
        public_profile_url: null,
        location: null,
        employer: null,
        title: null,
        review_status: 'qualified',
        created_at: '2026-09-01T00:00:00.000Z',
        document_hashes: [],
        experience_keys: [],
        external_ids: [],
        ...row,
      }))
    }
    if (sql.startsWith('INSERT INTO talent_identity_decisions')) return [{ id: 'd1', created_at: new Date() }]
    return []
  })
  const identity = new TalentIdentityService({
    manager: { query: identityQuery },
  } as unknown as Repository<TalentIdentityDecisionEntity>)
  const consultants = {
    findOne: jest.fn(async () => (overrides.target === undefined ? null : overrides.target)),
    // #3781 — la garde « personne effacée » lit `person_erasures` : aucune ici,
    // sauf `erasureFingerprints` fourni (tests de la garde elle-même).
    manager: {
      find: jest.fn(async () =>
        overrides.erasureFingerprints ? [{ fingerprints: overrides.erasureFingerprints }] : [],
      ),
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('INSERT INTO record_import_marks')) markCalls.push(params)
        return sql.includes('field_provenance') ? [{ has_human: overrides.targetHasHuman === true }] : []
      }),
    },
    create: jest.fn((row: Record<string, unknown>) => row),
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push(row)
      return { ...row, id: (row['id'] as string | undefined) ?? 'new-consultant' }
    }),
  } as unknown as Repository<ConsultantEntity>
  const documents = {
    create: jest.fn((row: Record<string, unknown>) => row),
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push(row)
      return { ...row, id: 'new-document' }
    }),
    update: jest.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<ConsultantDocumentEntity>
  const cvExtract = jest.fn(async () => {
    if (overrides.extractThrows) throw overrides.extractThrows
    return overrides.extract ?? { data: { text: 'YANIS BERTHIER — Ingénieur plateforme', chars: 38 } }
  })
  const ia = { cvExtract } as unknown as IaClient
  // c88 (04/10/2026) — la lecture automatique, doublée : on vérifie la MISE
  // EN FILE, jamais un appel modèle dans ce service.
  const enqueueAutoRead = jest.fn(async () => true)
  const autoParse = { enqueue: enqueueAutoRead } as unknown as CvAutoParseService
  return {
    service: new CvIntakeService(
      consultants,
      documents,
      ia,
      identity,
      autoParse,
      overrides.storage as StorageClient | undefined,
    ),
    documents,
    saved,
    cvExtract,
    identityCalls,
    enqueueAutoRead,
    markCalls,
  }
}

const FILE = '%PDF-1.4'
const FILE_SHA = createHash('sha256').update(Buffer.from(FILE, 'utf8')).digest('hex')
const TARGET = 'a0000000-0000-4000-8000-00000000000a'
const CV_TEXT = [
  'YANIS BERTHIER',
  '2019 - 2022 · Société Alpha · Ingénieur plateforme',
  '2016 - 2019 Banque Beta Dev',
].join('\n')

/**
 * Le dépôt d'un CV (PDF 3 §3.3).
 *
 * L'ORDRE du pipeline est la règle : doublon AVANT toute écriture. Après, c'est
 * trop tard — une fiche en double se découvre trois mois plus tard, quand deux
 * personnes ont poussé le même profil chez le même client.
 */
// #3781.1 — requis seulement quand `erasureFingerprints` n'est pas vide
// (`isErasedConsultantIdentity` répond `false` avant de l'exiger sinon) : posé
// au niveau du FICHIER, `importCsv` ayant son propre `describe` séparé.
const savedErasureKey = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
beforeAll(() => {
  process.env[PERSON_ERASURE_HMAC_KEY_ENV] = 'test-only-person-erasure-key-0123456789abcdef'
})
afterAll(() => {
  if (savedErasureKey === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = savedErasureKey
})

describe('CvIntakeService', () => {
  const base = {
    filename: 'cv.pdf',
    fileB64: b64('%PDF-1.4'),
    kind: 'candidate' as const,
    createDespiteDuplicates: false,
  }

  it('crée une fiche EN ATTENTE DE RELECTURE, jamais qualifiée d’office', async () => {
    const { service, saved } = makeService()
    const result = await service.intake(WORKSPACE, USER, { ...base, fullName: 'Yanis Berthier' })

    expect(result.outcome).toBe('created')
    const consultant = saved.find(row => 'review_status' in row)
    expect(consultant?.['review_status']).toBe('needs_review')
    expect(consultant?.['qualified_at']).toBeNull()
    // La provenance est tamponnée : « d'où vient cette fiche » est la première
    // question qu'on se pose devant un vivier qu'on n'a pas constitué soi-même.
    expect(consultant?.['source']).toBe('cv')
  })

  // #3952 (recette prod 09/10, réserve) — « vérifier que la file de lecture
  // tourne pour un import UNITAIRE ». `intakeAutomatic` (ZIP, pièce jointe)
  // met déjà la fiche créée en file (c88) ; le dépôt INTERACTIF (`intake`,
  // ce test) ne le faisait pas — une fiche née d'un dépôt unitaire restait
  // SANS lecture automatique, nom/intitulé « Non renseigné » jusqu'à ce
  // qu'un humain ouvre la revue à la main. « Tous les CV sont lus
  // automatiquement, toujours » (#3947) vaut pour CE chemin aussi.
  it('#3952 — la fiche créée par un dépôt UNITAIRE part AUSSI en lecture automatique', async () => {
    const { service, enqueueAutoRead } = makeService()
    const result = await service.intake(WORKSPACE, USER, { ...base, fullName: 'Yanis Berthier' })

    expect(result.outcome).toBe('created')
    expect(enqueueAutoRead).toHaveBeenCalledWith(WORKSPACE, USER, 'new-consultant')
  })

  describe('#4034.2 — le CV ORIGINAL est conservé', () => {
    it('dépôt unitaire : le fichier part au stockage sous <espace>/cv/<document>/<nom>', async () => {
      const put = jest.fn(async () => undefined)
      const { service, documents } = makeService({ storage: { put, remove: jest.fn(async () => true) } })
      const result = await service.intake(WORKSPACE, USER, { ...base, filename: 'CV Yanis.pdf' })

      expect(result.outcome).toBe('created')
      expect(put).toHaveBeenCalledWith(
        `${WORKSPACE}/cv/new-document/CV_Yanis.pdf`,
        Buffer.from(FILE, 'utf8'),
        'application/pdf',
      )
      expect(documents.update).toHaveBeenCalledWith(
        { id: 'new-document', workspace_id: WORKSPACE },
        { storage_path: `${WORKSPACE}/cv/new-document/CV_Yanis.pdf` },
      )
    })

    it('le type MIME est écrit sur le document (lu dans les octets)', async () => {
      const { service, saved } = makeService({
        storage: { put: jest.fn(async () => undefined), remove: jest.fn(async () => true) },
      })
      await service.intake(WORKSPACE, USER, { ...base, filename: 'sans-extension' })
      const document = saved.find(row => 'extracted_text' in row)
      expect(document?.['mime_type']).toBe('application/pdf')
    })

    it('import ZIP / lot : même conservation', async () => {
      const put = jest.fn(async () => undefined)
      const { service } = makeService({ storage: { put, remove: jest.fn(async () => true) } })
      const outcome = await service.intakeAutomatic(WORKSPACE, USER, {
        filename: 'lot/cv.pdf',
        fileB64: b64(FILE),
        capturedAt: null,
      })
      expect(outcome.status).not.toBe('failed')
      expect(put).toHaveBeenCalledWith(`${WORKSPACE}/cv/new-document/cv.pdf`, expect.any(Buffer), 'application/pdf')
    })

    it('un échec de stockage n’est PAS un échec d’import, et le journal ne nomme personne', async () => {
      const put = jest.fn(async () => {
        throw new ServiceUnavailableException('stockage indisponible')
      })
      const { service, documents } = makeService({ storage: { put, remove: jest.fn(async () => true) } })
      const warn = jest.spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      warn.mockImplementation(() => undefined)

      const result = await service.intake(WORKSPACE, USER, { ...base, filename: 'CV Yanis Berthier.pdf' })

      expect(result.outcome).toBe('created')
      expect(documents.update).not.toHaveBeenCalled()
      const logged = warn.mock.calls.map(call => JSON.stringify(call)).join(' ')
      expect(logged).toContain('new-document')
      expect(logged).not.toContain('Yanis')
    })
  })

  it('S’ARRÊTE sur un doublon, sans rien écrire', async () => {
    const { service, saved, cvExtract } = makeService({
      existing: [{ id: 'a', full_name: 'Yanis Berthier', email: 'yanis@example.fr', phone: null }],
    })
    const result = await service.intake(WORKSPACE, USER, {
      ...base,
      fullName: 'Y. Berthier',
      email: 'yanis@example.fr',
    })

    expect(result.outcome).toBe('duplicates')
    expect(saved).toEqual([])
    // On ne fait même pas travailler l'extraction pour une fiche qu'on ne
    // créera pas.
    expect(cvExtract).not.toHaveBeenCalled()
  })

  it('crée quand même quand quelqu’un a dit « ce n’est pas la même personne »', async () => {
    const { service } = makeService({
      existing: [{ id: 'a', full_name: 'Yanis Berthier', email: 'yanis@example.fr', phone: null }],
    })
    const result = await service.intake(WORKSPACE, USER, {
      ...base,
      fullName: 'Yanis Berthier',
      email: 'yanis@example.fr',
      createDespiteDuplicates: true,
    })
    expect(result.outcome).toBe('created')
  })

  it('n’écrit RIEN quand l’extraction ne donne pas de texte, et DIT pourquoi', async () => {
    // « Fichier corrompu → erreur nommée, fichier conservé » (§13.2). Une fiche
    // vide serait pire que le refus : elle se découvrirait au moment de
    // l'envoyer à un client.
    const { service, saved } = makeService({
      extract: { detail: 'Aucun texte extractible du PDF (probablement un scan/image)' },
    })
    await expect(service.intake(WORKSPACE, USER, { ...base, fullName: 'Yanis' })).rejects.toThrow(
      UnprocessableEntityException,
    )
    expect(saved).toEqual([])
  })

  it('remonte le MOTIF du service d’extraction plutôt qu’un message générique', async () => {
    const { service } = makeService({ extract: { detail: 'Archive DOCX corrompue' } })
    await expect(service.intake(WORKSPACE, USER, { ...base })).rejects.toThrow('Archive DOCX corrompue')
  })

  /**
   * #2542.1 — mesuré pendant le call client de Ludovic Marx : un dossier de
   * compétences PDF restait « en analyse » sans qu'aucune erreur ne remonte.
   *
   * `extract()` ne relevait QUE l'absence de texte dans l'enveloppe reçue —
   * si `this.ia.cvExtract(...)` lui-même REJETAIT (service IA injoignable,
   * timeout du client HTTP après ses trois tentatives), rien ne l'attrapait :
   * l'exception technique brute remontait telle quelle, sans nommer la cause,
   * jusqu'à un 500 générique. Le témoin `extractThrows` existait déjà dans le
   * harnais de ce fichier — construit, jamais appelé par un test : exactement
   * le « code juste que personne n'appelle ».
   */
  it('nomme le service indisponible plutôt que de laisser fuir une erreur technique (#2542.1)', async () => {
    const { service, cvExtract } = makeService({ extractThrows: new Error('socket hang up') })
    const attempt = service.intake(WORKSPACE, USER, { ...base, fullName: 'Yanis Berthier' })
    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(attempt).rejects.toThrow(/indisponible/)
    expect(cvExtract).toHaveBeenCalled()
  })

  /**
   * Import ZIP de 2 329 CV (05/10/2026) — le job est tombé deux fois au 40ᵉ
   * fichier : `invalid byte sequence for encoding "UTF8": 0x00`. Un PDF peut
   * rendre un octet nul dans son texte ; Postgres le refuse dans tout `text`.
   */
  it('retire les octets nuls du texte extrait AVANT toute écriture', async () => {
    const { service, saved } = makeService({
      extract: { data: { text: 'YANIS\u0000 BERTHIER\u0000 — Ingénieur plateforme', chars: 40 } },
    })
    await service.intake(WORKSPACE, USER, { ...base, fullName: 'Yanis Berthier' })

    const written = saved.flatMap(row => [row['cv_text'], row['extracted_text']]).filter(v => typeof v === 'string')
    expect(written.length).toBeGreaterThan(0)
    for (const text of written) expect(text).not.toContain('\u0000')
    expect(written).toContain('YANIS BERTHIER — Ingénieur plateforme')
  })

  it('refuse un fichier vide ou hors borne', async () => {
    const { service } = makeService()
    await expect(service.intake(WORKSPACE, USER, { ...base, fileB64: '' })).rejects.toThrow(BadRequestException)

    const tooBig = Buffer.alloc(9 * 1024 * 1024).toString('base64')
    await expect(service.intake(WORKSPACE, USER, { ...base, fileB64: tooBig })).rejects.toThrow(BadRequestException)
  })

  it('ne cherche PAS de doublon quand rien n’est comparable', async () => {
    // Un dépôt sans nom ni coordonnée ne ressemble à personne : chercher
    // rapprocherait deux inconnus.
    const { service } = makeService({ existing: [{ id: 'a', full_name: 'Autre', email: null, phone: null }] })
    const result = await service.intake(WORKSPACE, USER, { ...base })
    expect(result.outcome).toBe('created')
  })

  /**
   * Le défaut que ce lot répare (D366).
   *
   * `full_name: candidateName || input.filename.replace(/\.[a-z0-9]+$/i, '')`,
   * avec `candidateName` TOUJOURS vide — l'écran de dépôt n'envoie pas
   * `fullName`. Résultat mesuré le 30/08/2026 : **toute** fiche née d'un CV
   * portait le nom de son fichier.
   */
  describe('le nom de la fiche', () => {
    it('vaut `null` quand personne ne l’a fourni — JAMAIS le nom du fichier', async () => {
      const { service, saved } = makeService()
      const result = await service.intake(WORKSPACE, USER, { ...base, filename: 'CV_2024_v3.pdf' })

      expect(result.outcome).toBe('created')
      const consultant = saved.find(row => 'review_status' in row)
      expect(consultant?.['full_name']).toBeNull()
    })

    it('ne remplace pas un remplissage par un autre', async () => {
      // Ni chaîne vide, ni « Inconnu », ni le nom du fichier amputé de son
      // extension : `null` est la seule valeur VRAIE quand on ne sait pas.
      const { service, saved } = makeService()
      await service.intake(WORKSPACE, USER, { ...base, filename: 'Profil_Dupont_VF_relu(2).docx' })

      const consultant = saved.find(row => 'review_status' in row)
      const name = consultant?.['full_name']
      expect(name).toBeNull()
      expect(name).not.toBe('')
      expect(name).not.toBe('Profil_Dupont_VF_relu(2)')
    })

    it('garde le nom du fichier là où il DIT ce qu’il est', async () => {
      // « On archive, on ne supprime pas » : le fichier reste nommé, dans la
      // colonne dont c'est le sujet. C'est ce que l'écran affiche sous
      // « Nom non renseigné ».
      const { service, saved } = makeService()
      await service.intake(WORKSPACE, USER, { ...base, filename: 'CV_2024_v3.pdf' })

      const document = saved.find(row => 'extracted_text' in row)
      expect(document?.['filename']).toBe('CV_2024_v3.pdf')
    })

    it('écrit le nom quand un humain l’a fourni', async () => {
      // Le chemin qui reste ouvert : ce que quelqu'un a tapé fait foi.
      const { service, saved } = makeService()
      await service.intake(WORKSPACE, USER, { ...base, fullName: 'Yanis Berthier' })

      const consultant = saved.find(row => 'review_status' in row)
      expect(consultant?.['full_name']).toBe('Yanis Berthier')
    })
  })

  /** #2327 — LAU-FINAL-068 : la résolution d'identité au dépôt. */
  describe('#2327 — identité au dépôt', () => {
    it('#2327.6 — le dépôt ne force plus l’employeur à `null` : la comparaison passe par le vivier complet', async () => {
      const { service, identityCalls } = makeService()
      await service.intake(WORKSPACE, USER, { ...base, fullName: 'Yanis Berthier' })
      const load = identityCalls.find(call => call.sql.includes('FROM consultants c'))
      expect(load?.sql).toContain('pa.company_name AS employer')
    })

    it('#2327.9 / #2327.16 — le MÊME fichier sous un autre nom s’arrête, rien n’est écrasé ni écrit', async () => {
      const { service, saved, cvExtract } = makeService({
        existing: [{ id: TARGET, full_name: 'Yanis Berthier', document_hashes: [FILE_SHA] }],
      })
      const result = await service.intake(WORKSPACE, USER, { ...base, fileB64: b64(FILE), filename: 'autre-nom.pdf' })
      expect(result).toMatchObject({ outcome: 'duplicates', state: 'resolved' })
      expect(result.outcome === 'duplicates' && result.duplicates[0]?.reason).toBe('same_document')
      expect(saved).toEqual([])
      expect(cvExtract).not.toHaveBeenCalled()
    })

    it('#2327.7 — CV anonymisé : les expériences identiques, lues APRÈS extraction, arrêtent le dépôt', async () => {
      const keys = ['2019 2022 societe alpha ingenieur plateforme', '2016 2019 banque beta dev']
      const { service, saved } = makeService({
        existing: [{ id: TARGET, full_name: 'Yanis Berthier', experience_keys: keys }],
        extract: { data: { text: CV_TEXT } },
      })
      const result = await service.intake(WORKSPACE, USER, { ...base, filename: 'anonyme.pdf' })
      expect(result).toMatchObject({ outcome: 'duplicates', state: 'ambiguous' })
      expect(saved).toEqual([])
    })

    it('stocke l’empreinte et les expériences du document créé', async () => {
      const { service, saved } = makeService({ extract: { data: { text: CV_TEXT } } })
      const result = await service.intake(WORKSPACE, USER, { ...base, fileB64: b64(FILE) })
      expect(result).toMatchObject({ outcome: 'created', state: 'new' })
      const document = saved.find(row => 'extracted_text' in row)
      expect(document?.['content_sha256']).toBe(FILE_SHA)
      expect(document?.['experience_keys']).toEqual([
        '2019 2022 societe alpha ingenieur plateforme',
        '2016 2019 banque beta dev',
      ])
    })

    it('#2542.3 — une extraction PARTIELLE survit sur le document ET sur la fiche, jamais silencieuse', async () => {
      // #2542.3 — mesuré en suivant la chaîne #2542 : le service IA sait déjà
      // dire qu'une page n'a pas pu être lue (#1954.16/.30), mais le signal
      // s'arrêtait à l'enveloppe HTTP. Un CV lu à moitié doit se voir jusque
      // sur la fiche, pas seulement dans les logs — « non mesuré n'est jamais
      // 0 » (GA-18/GA-19).
      const { service, saved } = makeService({
        extract: { data: { text: CV_TEXT, partial: true } },
      })
      const result = await service.intake(WORKSPACE, USER, { ...base, fileB64: b64(FILE) })
      expect(result).toMatchObject({ outcome: 'created', state: 'new' })
      const document = saved.find(row => 'extracted_text' in row)
      const consultant = saved.find(row => 'review_status' in row)
      expect(document?.['extraction_partial']).toBe(true)
      expect(consultant?.['cv_extraction_partial']).toBe(true)
    })

    it('#2542.3 — contrôle négatif : une extraction COMPLÈTE ne marque rien de partiel', async () => {
      const { service, saved } = makeService({ extract: { data: { text: CV_TEXT } } })
      const result = await service.intake(WORKSPACE, USER, { ...base, fileB64: b64(FILE) })
      expect(result).toMatchObject({ outcome: 'created', state: 'new' })
      const document = saved.find(row => 'extracted_text' in row)
      const consultant = saved.find(row => 'review_status' in row)
      expect(document?.['extraction_partial']).toBe(false)
      expect(consultant?.['cv_extraction_partial']).toBe(false)
    })

    it('#2327.12 — « créer quand même » MÉMORISE « pas la même personne » pour chaque fiche écartée', async () => {
      const { service, identityCalls } = makeService({
        existing: [{ id: TARGET, full_name: 'Yanis Berthier' }],
      })
      await service.intake(WORKSPACE, USER, {
        ...base,
        fullName: 'Yanis Berthier',
        createDespiteDuplicates: true,
        dismissedTalentIds: [TARGET, 'f0000000-0000-4000-8000-00000000000f'],
      })
      const inserts = identityCalls.filter(call => call.sql.startsWith('INSERT INTO talent_identity_decisions'))
      // Une seule ligne : l'identifiant inconnu de l'espace ne produit rien.
      expect(inserts.map(call => call.params)).toEqual([
        [WORKSPACE, 'new-consultant', TARGET, 'keep_separate', 'new', 'same_name', null, USER, []],
      ])
    })

    describe('#2327.17 — un second CV rejoint la fiche existante', () => {
      // #3935.16 (Louis 15/10/2026) — un CV ré-importé REMPLACE ET COMPLÈTE : le texte de la fiche
      // devient le nouveau CV, relu ; l'ancien reste un document de la fiche (archivé, consultable).
      it('ajoute une VERSION, ne crée aucune personne ; le nouveau CV devient la matière de la fiche, relue', async () => {
        const target = {
          id: TARGET,
          workspace_id: WORKSPACE,
          full_name: 'Yanis Berthier',
          cv_text: 'ancien CV',
          title: 'Dev',
        }
        const { service, saved, identityCalls, enqueueAutoRead } = makeService({
          existing: [{ id: TARGET, full_name: 'Yanis Berthier', document_hashes: [] }],
          target,
          extract: { data: { text: CV_TEXT } },
        })
        const result = await service.intake(WORKSPACE, USER, {
          ...base,
          fullName: 'Yanis Berthier',
          attachToTalentId: TARGET,
        })
        expect(result).toMatchObject({ outcome: 'updated', consultantId: TARGET, state: 'updated' })
        // Le document (nouvelle version) est écrit ; la fiche prend le NOUVEAU texte, et rien d'autre ici :
        // le titre ne bouge pas à l'import — c'est la relecture qui complète, sans écraser un champ humain.
        expect(saved[0]).toMatchObject({ consultant_id: TARGET, content_sha256: FILE_SHA })
        expect(saved.find(row => 'cv_text' in row)?.['cv_text']).toBe(CV_TEXT)
        expect(target.title).toBe('Dev')
        expect(enqueueAutoRead).toHaveBeenCalledWith(WORKSPACE, USER, TARGET)
        const decision = identityCalls.find(call => call.sql.startsWith('INSERT INTO talent_identity_decisions'))
        expect(decision?.params).toEqual([
          WORKSPACE,
          TARGET,
          null,
          'update_existing',
          'updated',
          'same_name',
          null,
          USER,
          ['new-document'],
        ])
      })

      it('remplit le CV de la fiche seulement quand elle n’en a pas', async () => {
        const target = { id: TARGET, workspace_id: WORKSPACE, full_name: null, cv_text: null }
        const { service, saved } = makeService({ target, extract: { data: { text: CV_TEXT } } })
        await service.intake(WORKSPACE, USER, { ...base, attachToTalentId: TARGET })
        expect(saved.find(row => 'cv_text' in row)?.['cv_text']).toBe(CV_TEXT)
      })

      it('#2542.3 — une extraction PARTIELLE sur un CV attaché marque aussi la fiche', async () => {
        const target = { id: TARGET, workspace_id: WORKSPACE, full_name: null, cv_text: null }
        const { service, saved } = makeService({
          target,
          extract: { data: { text: CV_TEXT, partial: true } },
        })
        await service.intake(WORKSPACE, USER, { ...base, attachToTalentId: TARGET })
        const document = saved.find(row => 'extracted_text' in row)
        expect(document?.['extraction_partial']).toBe(true)
        expect(saved.find(row => 'cv_text' in row)?.['cv_extraction_partial']).toBe(true)
      })

      it('404 sur une fiche d’un autre espace, sans rien écrire', async () => {
        const { service, saved, cvExtract } = makeService({ target: null })
        await expect(service.intake(WORKSPACE, USER, { ...base, attachToTalentId: TARGET })).rejects.toBeInstanceOf(
          NotFoundException,
        )
        expect(saved).toEqual([])
        expect(cvExtract).not.toHaveBeenCalled()
      })
    })
  })

  /**
   * #2568.1 / #2569.1-3 — le dépôt AUTOMATIQUE (pièce jointe de messagerie,
   * archive ZIP). Personne ne regarde l'écran pendant qu'il tourne : jamais de
   * pause sur un doublon, une décision AUTOMATIQUE à la place.
   */
  describe('intakeAutomatic — le lot N (#2568, #2569)', () => {
    const auto = { filename: 'cv.pdf', fileB64: b64(FILE), capturedAt: null as Date | null }

    it('crée une fiche EN ATTENTE DE RELECTURE quand personne ne ressemble — jamais de nom deviné', async () => {
      const { service, saved } = makeService({ extract: { data: { text: 'Jean Dupont\njean.dupont@example.com' } } })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)

      expect(result).toMatchObject({ status: 'created' })
      const consultant = saved.find(row => 'review_status' in row)
      expect(consultant?.['review_status']).toBe('needs_review')
      expect(consultant?.['full_name']).toBeNull()
      expect(consultant?.['email']).toBe('jean.dupont@example.com')
    })

    // #4051 — « Importé le <date> depuis <fichier> » sur la fiche consultant créée par le lot.
    it('#4051 — la fiche créée reçoit sa trace d’import, nommée par le fichier', async () => {
      const { service, markCalls } = makeService({
        extract: { data: { text: 'Jean Dupont\njean.dupont@example.com' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      expect(result).toMatchObject({ status: 'created' })
      expect(markCalls).toEqual([[WORKSPACE, 'consultant', ['new-consultant'], 'file', 'cv.pdf']])
    })

    it('#4051 — ⚠️ SAIT DIRE NON : un fichier échoué ou ignoré ne laisse aucune trace', async () => {
      const { service, markCalls } = makeService()
      const ignored = await service.intakeAutomatic(WORKSPACE, USER, {
        ...auto,
        filename: 'liste.csv',
        fileB64: b64('a;b'),
      })
      expect(ignored).toMatchObject({ status: 'ignored' })
      expect(markCalls).toEqual([])
    })

    // #3781.1 (lot K11, 07/10) — la garde posée sur le dépôt interactif (`intake`)
    // ne couvrait pas le lot (ZIP/messagerie) : un CV reproduisant l'e-mail
    // d'une personne EFFACÉE (RGPD art. 17) ne doit pas recréer sa fiche.
    it('#3781.1 — un CV du lot qui reproduit l’e-mail d’une personne effacée n’écrit aucune fiche', async () => {
      const fingerprints = consultantErasureFingerprints(WORKSPACE, {
        full_name: null,
        email: 'jean.dupont@example.com',
        public_profile_url: null,
      })
      const { service, saved } = makeService({
        extract: { data: { text: 'Jean Dupont\njean.dupont@example.com' } },
        erasureFingerprints: fingerprints,
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)

      expect(result).toMatchObject({ status: 'failed' })
      expect(saved.find(row => 'review_status' in row)).toBeUndefined()
    })

    // Incident boucle API (05/10/2026) — dans un lot, le vivier est lu UNE fois
    // (`openAutomaticBatch`), et une fiche créée par le lot est reconnue par le
    // CV suivant de la même personne, sans relire la base.
    it('(e) en lot : vivier lu une fois, la fiche créée par un CV est retrouvée par le suivant', async () => {
      const { service, identityCalls } = makeService({
        extract: { data: { text: 'Jean Dupont\njean.dupont@example.com' } },
        target: { id: 'new-consultant', review_status: 'needs_review', cv_text: 'Jean Dupont', cv_captured_at: null },
      })
      const batch = await service.openAutomaticBatch(WORKSPACE)
      const first = await service.intakeAutomatic(WORKSPACE, USER, auto, batch)
      const second = await service.intakeAutomatic(
        WORKSPACE,
        USER,
        { ...auto, filename: 'cv-bis.pdf', fileB64: b64(`${FILE} autre version`) },
        batch,
      )
      expect(first).toMatchObject({ status: 'created' })
      expect(second).toMatchObject({ status: 'auto_updated', consultantId: 'new-consultant' })
      expect(identityCalls.filter(call => call.sql.includes('FROM consultants c'))).toHaveLength(1)
    })

    it('c88 (04/10/2026) — chaque fiche CRÉÉE part en lecture automatique, après son écriture', async () => {
      const { service, enqueueAutoRead } = makeService({ extract: { data: { text: 'Jean Dupont\njean@example.com' } } })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      expect(result).toMatchObject({ status: 'created', consultantId: 'new-consultant' })
      expect(enqueueAutoRead).toHaveBeenCalledWith(WORKSPACE, USER, 'new-consultant')
    })

    it('c88 — un fichier hors périmètre ou illisible ne met RIEN en file', async () => {
      const { service, enqueueAutoRead } = makeService({ extractThrows: new Error('probablement un scan') })
      await service.intakeAutomatic(WORKSPACE, USER, auto)
      await service.intakeAutomatic(WORKSPACE, USER, { ...auto, filename: 'notes.csv', fileB64: b64('a;b') })
      expect(enqueueAutoRead).not.toHaveBeenCalled()
    })

    it('⚠️ ne dérive JAMAIS disponibilité, TJM ou consentement d’un CV — même quand le texte les mentionne', async () => {
      const { service, saved } = makeService({
        extract: { data: { text: 'Disponible immédiatement, TJM 550€, jean@example.com' } },
      })
      await service.intakeAutomatic(WORKSPACE, USER, auto)
      const consultant = saved.find(row => 'review_status' in row) as Record<string, unknown>
      expect(consultant).not.toHaveProperty('availability')
      expect(consultant).not.toHaveProperty('tjm')
      expect(consultant).not.toHaveProperty('consent_given_at')
      expect(consultant).not.toHaveProperty('consent_basis')
    })

    it('#2569.2/#2569.3 — une correspondance FORTE et non ambiguë se met à jour automatiquement', async () => {
      const target = {
        id: TARGET,
        workspace_id: WORKSPACE,
        review_status: 'needs_review',
        cv_text: 'ancien',
        cv_captured_at: new Date('2024-01-01'),
      }
      const { service, saved, identityCalls } = makeService({
        existing: [{ id: TARGET, email: 'jean@example.fr' }],
        target,
        extract: { data: { text: 'Jean Dupont\njean@example.fr' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, { ...auto, capturedAt: new Date('2025-01-01') })

      // #2326.13 — la provenance de la confiance élevée est NOMMÉE, pas
      // seulement décidée : la clé qui a rapproché ce document se retrouve
      // dans le rapport, pas seulement dans le journal `rememberAttached`.
      expect(result).toMatchObject({
        status: 'auto_updated',
        consultantId: TARGET,
        contentReplaced: true,
        matchedOn: 'same_email',
      })
      expect(saved.find(row => 'cv_text' in row)?.['cv_text']).toBe('Jean Dupont\njean@example.fr')
      // Aucune nouvelle fiche créée : la SEULE fiche sauvegardée est la cible.
      const consultantRows = saved.filter(row => 'review_status' in row)
      expect(consultantRows).toHaveLength(1)
      expect(consultantRows[0]?.['id']).toBe(TARGET)
      const decision = identityCalls.find(call => call.sql.startsWith('INSERT INTO talent_identity_decisions'))
      expect(decision?.params?.[3]).toBe('update_existing')
    })

    it('garde le texte le plus récent quand le document entrant est PLUS ANCIEN', async () => {
      const target = {
        id: TARGET,
        workspace_id: WORKSPACE,
        review_status: 'needs_review',
        cv_text: 'texte récent',
        cv_captured_at: new Date('2025-06-01'),
      }
      const { service, saved } = makeService({
        existing: [{ id: TARGET, email: 'jean@example.fr' }],
        target,
        extract: { data: { text: 'Jean Dupont\njean@example.fr' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, { ...auto, capturedAt: new Date('2020-01-01') })

      expect(result).toMatchObject({ status: 'auto_updated', contentReplaced: false })
      expect(saved.some(row => 'cv_text' in row)).toBe(false)
    })

    // c97 (décision Louis 12/10) — `qualified` ne veut plus dire « validé par un humain » :
    // un CV lu qualifie la fiche. La source de vérité de « un humain a touché la fiche »
    // est la provenance `human` (`field_provenance`).
    it('c97 — une fiche AUTO-qualifiée (aucune provenance humaine) réimportée : texte remplacé ET relue', async () => {
      const target = {
        id: TARGET,
        workspace_id: WORKSPACE,
        review_status: 'qualified',
        cv_text: 'L a m i s   M O U L O U D J',
        cv_captured_at: new Date('2020-01-01'),
      }
      const { service, saved, enqueueAutoRead } = makeService({
        existing: [{ id: TARGET, email: 'jean@example.fr' }],
        target,
        targetHasHuman: false,
        extract: { data: { text: 'Jean Dupont\njean@example.fr' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, { ...auto, capturedAt: new Date('2026-01-01') })

      expect(result).toMatchObject({ status: 'auto_updated', contentReplaced: true })
      expect(saved.find(row => 'cv_text' in row)?.['cv_text']).toBe('Jean Dupont\njean@example.fr')
      expect(enqueueAutoRead).toHaveBeenCalledWith(WORKSPACE, USER, TARGET)
    })

    // #3935.16 (Louis 15/10/2026) — RENVERSEMENT daté : une fiche corrigée à la main est RELUE depuis le
    // nouveau CV ; la correction humaine est gardée CHAMP PAR CHAMP par la relecture (`applyFields`).
    it('#3935.16 — une fiche portant une correction HUMAINE est relue depuis le nouveau CV, sans que l’import touche ses champs', async () => {
      const target = {
        id: TARGET,
        workspace_id: WORKSPACE,
        review_status: 'qualified',
        title: 'Architecte (corrigé à la main)',
        cv_text: 'validé par un humain',
        cv_captured_at: new Date('2020-01-01'),
      }
      const { service, saved, enqueueAutoRead } = makeService({
        existing: [{ id: TARGET, email: 'jean@example.fr' }],
        target,
        targetHasHuman: true,
        extract: { data: { text: 'Jean Dupont\njean@example.fr' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, { ...auto, capturedAt: new Date('2026-01-01') })

      expect(result).toMatchObject({ status: 'auto_updated', contentReplaced: true })
      expect(saved.find(row => 'cv_text' in row)?.['cv_text']).toBe('Jean Dupont\njean@example.fr')
      expect(target.title).toBe('Architecte (corrigé à la main)')
      expect(enqueueAutoRead).toHaveBeenCalledWith(WORKSPACE, USER, TARGET)
      // L'ancien CV n'est pas perdu : le document neuf s'ajoute, les précédents restent attachés.
      expect(saved.some(row => 'extracted_text' in row)).toBe(true)
    })

    it('#2569.3 — isole une exception pour revue : la fiche est créée, RIEN n’est perdu', async () => {
      const keys = ['2019 2022 societe alpha ingenieur plateforme', '2016 2019 banque beta dev']
      const { service, saved } = makeService({
        existing: [{ id: TARGET, full_name: null, experience_keys: keys }],
        extract: { data: { text: CV_TEXT } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)

      // #2326.14 — sans champ contradictoire ici (aucun nom/e-mail/téléphone
      // des deux côtés), les « champs à vérifier » sont un tableau VIDE, pas
      // absent : l'ambiguïté vient des expériences partagées, pas d'un conflit.
      expect(result).toMatchObject({ status: 'exception', state: 'ambiguous', conflicts: [] })
      const consultant = saved.find(row => 'review_status' in row)
      expect(consultant).toBeDefined()
      expect(consultant?.['review_status']).toBe('needs_review')
    })

    it('#2326.14 — une clé forte accompagnée d’un e-mail contradictoire nomme le CHAMP À VÉRIFIER', async () => {
      const { service, saved } = makeService({
        existing: [{ id: TARGET, phone: '0142000000', email: 'ancien@example.fr' }],
        extract: { data: { text: 'Jean Dupont\n01 42 00 00 00\nnouveau@example.fr' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)

      // Même téléphone (clé « probable ») mais un e-mail renseigné des DEUX
      // côtés qui diffère : ce n'est pas juste « à vérifier », c'est le champ
      // PRÉCIS qui contredit — jamais un conflit deviné sur un champ absent.
      expect(result).toMatchObject({ status: 'exception', state: 'probable_duplicate', conflicts: ['email'] })
      const consultant = saved.find(row => 'review_status' in row)
      expect(consultant?.['review_status']).toBe('needs_review')
    })

    /**
     * #2183.13 — LE PALIER DE CONFIANCE À LA CRÉATION.
     *
     * `state === 'new'` (aucune fiche ne ressemble) créait jusqu'ici en
     * silence, même quand rien n'a pu être comparé : ni nom (jamais déduit
     * en lot), ni e-mail, ni téléphone, ni expérience lue. « Aucune
     * ressemblance » sur zéro signal n'est pas une conclusion.
     */
    it('#2183.13 — un candidat SANS AUCUN signal d’identité rejoint la revue, jamais une création silencieuse', async () => {
      const { service, saved } = makeService({
        extract: { data: { text: 'Bonjour, ceci ne contient aucune coordonnee ni experience datee.' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)

      expect(result).toMatchObject({ status: 'exception', state: 'ambiguous' })
      const consultant = saved.find(row => 'review_status' in row)
      expect(consultant?.['review_status']).toBe('needs_review')
    })

    it('#2183.13 — contrôle négatif : un e-mail SEUL suffit à garder la création directe', async () => {
      const { service } = makeService({
        extract: { data: { text: 'Jean Dupont\njean.dupont@example.com' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      expect(result).toMatchObject({ status: 'created' })
    })

    it('rend `too_big` sans appeler l’extraction', async () => {
      const { service, cvExtract } = makeService()
      const tooBig = Buffer.alloc(9 * 1024 * 1024).toString('base64')
      const result = await service.intakeAutomatic(WORKSPACE, USER, { ...auto, fileB64: tooBig })
      expect(result).toEqual({ status: 'too_big', file: 'cv.pdf', steps: ['format_check', 'decode'] })
      expect(cvExtract).not.toHaveBeenCalled()
    })

    it('rend `failed` avec le MOTIF du serveur quand l’extraction échoue — n’arrête pas le lot', async () => {
      const { service, saved } = makeService({ extract: { detail: 'Probablement un scan' } })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      // Ce motif-là ne cite aucun des trois marqueurs CONTRÔLÉS de
      // `document_text.py` — il reste `other`, jamais un scan deviné.
      expect(result).toEqual({
        status: 'failed',
        file: 'cv.pdf',
        reason: 'Probablement un scan',
        category: 'other',
        steps: ['format_check', 'decode', 'extract_text'],
      })
      expect(saved).toEqual([])
    })

    it('#2183.41 — classe `scan_suspected` sur le motif réel émis par le service IA', async () => {
      const { service } = makeService({
        extract: {
          detail:
            'Aucun texte extractible du PDF (probablement un scan/image). Fournissez un PDF texte ou copiez le contenu.',
        },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      expect(result).toMatchObject({ status: 'failed', category: 'scan_suspected' })
    })

    it('rend `failed` sur une correspondance forte dont la cible a disparu, sans planter le lot', async () => {
      const { service, saved } = makeService({
        existing: [{ id: TARGET, email: 'jean@example.fr' }],
        target: null,
        extract: { data: { text: 'Jean Dupont\njean@example.fr' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      expect(result).toMatchObject({ status: 'failed' })
      expect(saved).toEqual([])
    })

    /**
     * #3065 (lot 2) — une archive réelle porte des fichiers qui ne sont PAS
     * des CV (csv, xlsx, zip imbriqué, sans extension). Les envoyer à
     * l'extraction les ferait échouer en silence, comptés comme des erreurs.
     * `ignored` les NOMME avant même d'appeler l'extraction — et sans en
     * payer le coût.
     */
    it('rend `ignored` sur un fichier qui n’est pas un CV, sans appeler l’extraction', async () => {
      const { service, cvExtract, saved } = makeService()
      const result = await service.intakeAutomatic(WORKSPACE, USER, {
        ...auto,
        filename: 'export.csv',
        fileB64: b64('nom,poste,email\nJean Dupont,Dev,jean@example.fr'),
      })
      expect(result).toEqual({
        status: 'ignored',
        file: 'export.csv',
        reason: 'Ce n’est pas un CV (extension .csv) — ignoré, pas compté comme une erreur.',
        steps: ['format_check'],
      })
      expect(cvExtract).not.toHaveBeenCalled()
      expect(saved).toEqual([])
    })

    it('reconnaît pdf, docx et doc — insensible à la casse — et continue le pipeline normal', async () => {
      const { service, cvExtract } = makeService({ extract: { data: { text: 'Jean Dupont\njean@example.com' } } })
      const result = await service.intakeAutomatic(WORKSPACE, USER, { ...auto, filename: 'CV-Jean.DOCX' })
      expect(result).toMatchObject({ status: 'created' })
      expect(cvExtract).toHaveBeenCalledTimes(1)
    })

    /**
     * #3303 — un export WeTransfer perd parfois l'extension d'un fichier.
     * `apps/ia` (`document_text.py`) sniffe déjà les octets à l'extraction,
     * quel que soit le nom transmis — ce test prouve que le fichier ATTEINT
     * bien cette étape plutôt que d'être écarté ici sur la seule extension.
     */
    it('un fichier SANS extension reconnue mais dont les octets disent PDF (`%PDF`) continue le pipeline, jamais ignoré', async () => {
      const { service, cvExtract } = makeService({ extract: { data: { text: 'Jean Dupont\njean@example.com' } } })
      const result = await service.intakeAutomatic(WORKSPACE, USER, { ...auto, filename: 'CV_Jean_Dupont' })
      expect(result).toMatchObject({ status: 'created' })
      expect(cvExtract).toHaveBeenCalledTimes(1)
    })

    it('un fichier SANS extension reconnue et dont les octets ne disent ni PDF ni DOCX reste `ignored`', async () => {
      const { service, cvExtract } = makeService()
      const result = await service.intakeAutomatic(WORKSPACE, USER, {
        ...auto,
        filename: 'notes',
        fileB64: b64('juste du texte, aucune signature connue'),
      })
      expect(result).toMatchObject({ status: 'ignored' })
      expect(cvExtract).not.toHaveBeenCalled()
    })
  })

  /**
   * #2326.12 (épopée #2794/#2905, lot V11) — les DIX étapes NOMMÉES, dans
   * l'ordre RÉELLEMENT parcouru : la trace le PROUVE, pas juste une liste
   * documentée à côté du code (même exigence que `MATCH_PIPELINE_STEPS` /
   * `runMatchPipeline`, `consultant-matching.spec.ts`).
   */
  describe('intakeAutomatic — les dix étapes nommées (#2326.12)', () => {
    const auto = { filename: 'cv.pdf', fileB64: b64(FILE), capturedAt: null as Date | null }

    it('une fiche CRÉÉE traverse les dix étapes, dans cet ordre', async () => {
      const { service } = makeService({ extract: { data: { text: 'Jean Dupont\njean.dupont@example.com' } } })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      expect(result).toMatchObject({
        status: 'created',
        steps: [
          'format_check',
          'decode',
          'extract_text',
          'read_identity_signals',
          'match_identity',
          'resolve_state',
          'decide_action',
          'write_record',
          'save_document',
          'classify_outcome',
        ],
      })
    })

    it('une fiche RAPPROCHÉE (auto_updated) porte la même trace complète', async () => {
      const { service } = makeService({
        existing: [{ id: TARGET, email: 'jean@example.fr' }],
        target: { id: TARGET, workspace_id: WORKSPACE, review_status: 'needs_review', cv_text: null },
        extract: { data: { text: 'Jean Dupont\njean@example.fr' } },
      })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      expect(result).toMatchObject({ status: 'auto_updated' })
      expect(result.steps).toEqual([
        'format_check',
        'decode',
        'extract_text',
        'read_identity_signals',
        'match_identity',
        'resolve_state',
        'decide_action',
        'write_record',
        'save_document',
        'classify_outcome',
      ])
    })

    it('un fichier IGNORÉ (pas un CV) s’arrête à la PREMIÈRE étape — la trace le dit, jamais complétée à dix', async () => {
      const { service } = makeService()
      const result = await service.intakeAutomatic(WORKSPACE, USER, {
        ...auto,
        filename: 'export.csv',
        fileB64: b64('nom,poste,email\nJean Dupont,Dev,jean@example.fr'),
      })
      expect(result).toMatchObject({ status: 'ignored', steps: ['format_check'] })
    })

    it('un fichier TROP GROS s’arrête après le décodage, jamais l’extraction', async () => {
      const { service, cvExtract } = makeService()
      const tooBig = Buffer.alloc(9 * 1024 * 1024).toString('base64')
      const result = await service.intakeAutomatic(WORKSPACE, USER, { ...auto, fileB64: tooBig })
      expect(result).toMatchObject({ status: 'too_big', steps: ['format_check', 'decode'] })
      expect(cvExtract).not.toHaveBeenCalled()
    })

    it('une extraction en ÉCHEC s’arrête après extract_text, jamais plus loin', async () => {
      const { service } = makeService({ extract: { detail: 'Probablement un scan' } })
      const result = await service.intakeAutomatic(WORKSPACE, USER, auto)
      expect(result).toMatchObject({ status: 'failed', steps: ['format_check', 'decode', 'extract_text'] })
    })
  })
})

/**
 * #2183.5 — import CSV d'un lot de consultants.
 *
 * Même règle de fond que le dépôt unitaire (`intake`) : une ressemblance,
 * quelle qu'elle soit, ARRÊTE la ligne — jamais de fusion silencieuse, jamais
 * de fiche perdue. `parseConsultantCsv` (testé séparément, `csv-import.spec.ts`)
 * porte déjà la lecture ; ces tests protègent l'ÉCRITURE.
 */
describe('CvIntakeService.importCsv (#2183.5)', () => {
  it('crée une fiche EN ATTENTE DE RELECTURE pour chaque ligne sans ressemblance', async () => {
    const { service, saved } = makeService()
    const csv = 'Prénom,Nom,Email\nClaire,Vasseur,claire@example.com'

    const report = await service.importCsv(WORKSPACE, USER, csv)

    expect(report.summary).toMatchObject({ created: 1, duplicate: 0, skipped: 0 })
    const consultant = saved.find(row => 'review_status' in row)
    expect(consultant).toMatchObject({
      full_name: 'Claire Vasseur',
      email: 'claire@example.com',
      source: 'csv',
      review_status: 'needs_review',
    })
  })

  it('SAUTE une ligne qui ressemble à une fiche existante — jamais fusionnée seule', async () => {
    const { service, saved } = makeService({ existing: [{ id: TARGET, email: 'claire@example.com' }] })
    const csv = 'Nom complet,Email\nClaire Vasseur,claire@example.com'

    const report = await service.importCsv(WORKSPACE, USER, csv)

    expect(report.summary).toMatchObject({ created: 0, duplicate: 1 })
    expect(report.outcomes[0]).toMatchObject({ status: 'duplicate', line: 2 })
    expect(saved).toEqual([])
  })

  it('reporte les lignes écartées à la lecture (identité manquante, doublon dans le fichier)', async () => {
    const { service } = makeService()
    const csv = [
      'Nom complet,Email,Notes',
      ',,à suivre',
      'Claire Vasseur,claire@example.com,',
      'Claire V.,CLAIRE@example.com,',
    ].join('\n')

    const report = await service.importCsv(WORKSPACE, USER, csv)

    expect(report.summary).toMatchObject({ created: 1, skipped: 2 })
    expect(report.outcomes.filter(o => o.status === 'skipped')).toMatchObject([
      { line: 2, reason: 'no_identity' },
      { line: 4, reason: 'duplicate_in_file' },
    ])
  })

  it('ne plante pas sur un fichier vide — rend un rapport à zéro', async () => {
    const { service } = makeService()
    const report = await service.importCsv(WORKSPACE, USER, '')
    expect(report).toMatchObject({ total: 0, summary: { created: 0, duplicate: 0, skipped: 0 }, outcomes: [] })
  })

  // #3781.1 (lot K11, 07/10) — même garde que le dépôt de CV et la création
  // manuelle : une ligne reproduisant l'identité d'une personne EFFACÉE (RGPD
  // art. 17) ARRÊTE la ligne, aucune fiche n'est écrite.
  it('#3781.1 — une ligne qui reproduit une personne effacée n’écrit aucune fiche', async () => {
    const fingerprints = consultantErasureFingerprints(WORKSPACE, {
      full_name: 'Claire Vasseur',
      email: 'claire@example.com',
      public_profile_url: null,
    })
    const { service, saved } = makeService({ erasureFingerprints: fingerprints })
    const csv = 'Nom complet,Email\nClaire Vasseur,claire@example.com'

    const report = await service.importCsv(WORKSPACE, USER, csv)

    expect(report.summary).toMatchObject({ created: 0, duplicate: 0, erased: 1 })
    expect(report.outcomes[0]).toMatchObject({ status: 'erased', line: 2 })
    expect(saved).toEqual([])
  })
})

/**
 * M2.3 (Meyer 20/10) — l'import de CV refuse ce qui n'est pas un CV.
 *
 * Mesuré : un CSV de 340 000 caractères déposé dans l'import de CV du Vivier a créé une fiche « Nom non renseigné ».
 * Le refus est NOMMÉ (422) et RIEN n'est écrit — ni fiche, ni document.
 */
describe('M2.3 — un tableur n’est pas un CV', () => {
  const TABLE = [
    'Référence;Nom;Prénom;Fonction;Société;Secteur;Email;Téléphone',
    ...Array.from({ length: 12 }, (_, i) => `C${i};Fictif${i};Prenom${i};Dir;Soc ${i};Sect;c${i}@x.invalid;0102030405`),
  ].join('\n')

  it('un .csv est refusé AVANT toute extraction : 422, aucune ligne talent créée', async () => {
    const { service, saved, cvExtract } = makeService()
    await expect(
      service.intake(WORKSPACE, USER, {
        filename: 'contacts.csv',
        fileB64: b64(TABLE),
        kind: 'candidate',
        createDespiteDuplicates: false,
      }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/Réglages › Import/) })
    expect(cvExtract).not.toHaveBeenCalled()
    expect(saved).toHaveLength(0)
  })

  it('un .xlsx est refusé de la même façon', async () => {
    const { service, saved } = makeService()
    await expect(
      service.intake(WORKSPACE, USER, {
        filename: 'vivier.xlsx',
        fileB64: b64('PK'),
        kind: 'candidate',
        createDespiteDuplicates: false,
      }),
    ).rejects.toMatchObject({ status: 422 })
    expect(saved).toHaveLength(0)
  })

  it('un tableau déguisé en .txt est refusé sur son CONTENU : rien n’est écrit', async () => {
    const { service, saved } = makeService({ extract: { data: { text: TABLE, chars: TABLE.length } } })
    await expect(
      service.intake(WORKSPACE, USER, {
        filename: 'export.txt',
        fileB64: b64(TABLE),
        kind: 'candidate',
        createDespiteDuplicates: false,
      }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/Réglages › Import/) })
    expect(saved).toHaveLength(0)
  })

  it('une lecture sans nom, sans coordonnée, sans expérience et démesurée ne crée PAS de fiche', async () => {
    const huge = 'lorem ipsum '.repeat(30_000)
    const { service, saved } = makeService({ extract: { data: { text: huge, chars: huge.length } } })
    await expect(
      service.intake(WORKSPACE, USER, {
        filename: 'dump.pdf',
        fileB64: b64('%PDF-1.4'),
        kind: 'candidate',
        createDespiteDuplicates: false,
      }),
    ).rejects.toMatchObject({ status: 422 })
    expect(saved).toHaveLength(0)
  })

  it('un PDF de CV reste accepté', async () => {
    const { service } = makeService({ extract: { data: { text: CV_TEXT, chars: CV_TEXT.length } } })
    const result = await service.intake(WORKSPACE, USER, {
      filename: 'cv.pdf',
      fileB64: b64('%PDF-1.4'),
      kind: 'candidate',
      createDespiteDuplicates: false,
    })
    expect(result.outcome).toBe('created')
  })
})
