import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { AccountsService } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import type { StorageService } from '../storage/storage.service'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { TranscribeChatVoiceDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #1939 — LE MESSAGE VOCAL, CÔTÉ SERVEUR : trois routes, et ce qu'elles refusent.
 *
 *  · `GET  /ia/chat/voice/status`        — la capacité, lue AVANT d'afficher le micro ;
 *  · `POST /ia/chat/voice/transcribe`     — transcrire ET ranger, sans rien envoyer au modèle ;
 *  · `GET  /ia/chat/messages/:id/voice`   — réécouter, avec la portée du texte du fil.
 *
 * L'ordre des refus est une décision : la démo et l'absence de clé passent AVANT
 * tout octet décodé et tout appel réseau — « aucun service payant en démo » et
 * « sans clé = no-op strict » ne sont vrais que si RIEN ne part.
 */
describe('#1939 — IaProxyController, le message vocal', () => {
  const OLD_ENV = { ...process.env }
  const USER = { userId: 'u-1' } as never
  const VOICE = '44444444-4444-4444-8444-444444444444'
  const MESSAGE = '55555555-5555-4555-8555-555555555555'
  const TRANSCRIPT = 'Prépare une relance pour le DSI de Nova Logistique'
  const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]).toString('base64')

  type Options = {
    key?: boolean
    demo?: boolean
    limit?: number
    used?: number
    storage?: boolean
    accountsService?: Pick<AccountsService, 'findOneForWorkspace'>
    contacts?: Pick<ContactsService, 'findByAccount'>
    providerCosts?: { record: jest.Mock }
  }

  function setup(opts: Options = {}) {
    if (opts.key ?? true) process.env['TRANSCRIPTION_API_KEY'] = 'cle-de-test'
    else delete process.env['TRANSCRIPTION_API_KEY']

    const ia = { chatStream: jest.fn() }
    const chatMessages = {
      measureUserMessagesSince: jest.fn().mockResolvedValue({ total: opts.used ?? 0, exempt: 0 }),
      create: jest.fn(),
      voiceObjectIdInWorkspace: jest.fn().mockResolvedValue(null),
    }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'viewer' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false),
    }
    const storage = {
      put: jest.fn().mockResolvedValue({ id: VOICE, retentionUntil: '2026-10-12' }),
      signedUrlFor: jest.fn().mockResolvedValue({
        url: 'https://magasin.example/objet?signature=abc',
        expiresAt: '2026-09-12T10:05:00.000Z',
        fileName: 'message-vocal.webm',
      }),
    }
    const controller = new IaProxyController(
      ia as unknown as IaClient,
      chatMessages as unknown as ChatMessagesService,
      workspaceContext as unknown as WorkspaceContextService,
      {} as EsnProfileReader,
      {} as ChatContextService,
      {} as DiscoverPortfolioService,
      { get: () => opts.limit ?? 0 } as unknown as ConfigService,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      // #1954 — les documents du fil, dépendance OBLIGATOIRE en 9ᵉ position.
      {} as ChatThreadDocumentsService,
      opts.providerCosts as never, // #3579 — le registre de coûts (10ᵉ)
      undefined,
      opts.accountsService as unknown as AccountsService | undefined, // #1581.1 — les comptes (12ᵉ)
      undefined, // #1911 — le service des titres (13ᵉ)
      undefined, // #1960.20 — la marque de l'espace (14ᵉ)
      undefined, // #1943 L3 — les cartes de Laura (15ᵉ)
      undefined, // #1951.2 — les consultants (16ᵉ)
      undefined, // #1951.3 — les besoins ouverts (17ᵉ)
      undefined, // #1957 — le palier du plan (18ᵉ)
      undefined, // #1916.24 — la trace des éléments de mémoire (19ᵉ)
      undefined, // #1919.15 — les retours sur les réponses (20ᵉ)
      undefined, // #1949.23 — la trace des demandes non routées (21ᵉ)
      (opts.storage ?? true) ? (storage as unknown as StorageService) : undefined, // #1939 — le stockage (22ᵉ)
      undefined, // #1910.6 — la portée mission (23ᵉ)
      undefined, // #1955.7 — l'export d'un fil (24ᵉ)
      opts.contacts as unknown as ContactsService | undefined, // #1951.1 — les contacts (25ᵉ)
    )
    return { controller, ia, chatMessages, workspaceContext, storage }
  }

  const dto = (over: Partial<TranscribeChatVoiceDto> = {}) =>
    ({ audioB64: WEBM, durationMs: 4200, language: 'fr', ...over }) as TranscribeChatVoiceDto

  const transcriptionAnswers = (body: unknown, status = 200) =>
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))

  beforeEach(() => {
    process.env = { ...OLD_ENV }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  const NOT_WIRED = { accent: 'not_wired', noise: 'not_wired', mixedLanguage: 'not_wired' } as const

  describe('la capacité', () => {
    it('sans clé : absente — et rien n’est même lu', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const { controller, workspaceContext } = setup({ key: false })
      expect(await controller.voiceStatus(USER)).toEqual({ available: false, refinements: NOT_WIRED })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(workspaceContext.isDemoWorkspace).not.toHaveBeenCalled()
    })

    it('en salle de démonstration : absente, même avec la clé', async () => {
      const { controller } = setup({ demo: true })
      expect(await controller.voiceStatus(USER)).toEqual({ available: false, refinements: NOT_WIRED })
    })

    it('sans le stockage : absente — un message vocal non conservable ne se propose pas', async () => {
      const { controller } = setup({ storage: false })
      expect(await controller.voiceStatus(USER)).toEqual({ available: false, refinements: NOT_WIRED })
    })

    it('clé posée, espace réel : disponible', async () => {
      const { controller } = setup()
      expect(await controller.voiceStatus(USER)).toEqual({
        available: true,
        refinements: { ...NOT_WIRED, mixedLanguage: 'segment_language' },
      })
    })

    it('#2434.74 / #2434.75 — accent et bruit restent NOMMÉS non branchés ; sans clé, le mélange FR/EN aussi', async () => {
      const { controller } = setup({ key: false })
      const status = await controller.voiceStatus(USER)
      expect(status.refinements).toEqual(NOT_WIRED)
    })
  })

  /**
   * #3579 (décision Louis 14/10, QCM) — fournisseur Voxtral pour l'accent et
   * le bruit (#2434.74/.75). Sans `OCR_API_KEY` (absente en production au
   * 14/10/2026) : chemin byte-identique, aucun appel Voxtral.
   */
  describe('#3579 — Voxtral (accent, bruit) : no-op strict sans clé, branché avec', () => {
    afterEach(() => {
      delete process.env['OCR_API_KEY']
    })

    it('sans OCR_API_KEY : accent/bruit restent non branchés même la transcription active', async () => {
      const { controller } = setup()
      expect(await controller.voiceStatus(USER)).toEqual({
        available: true,
        refinements: { ...NOT_WIRED, mixedLanguage: 'segment_language' },
      })
    })

    it('OCR_API_KEY posée : accent/bruit basculent sur `robust_model`, jamais un nom de fournisseur', async () => {
      process.env['OCR_API_KEY'] = 'mistral-cle-test'
      const { controller } = setup()
      const status = await controller.voiceStatus(USER)
      expect(status.refinements).toEqual({
        accent: 'robust_model',
        noise: 'robust_model',
        mixedLanguage: 'segment_language',
      })
      expect(JSON.stringify(status).toLowerCase()).not.toMatch(/mistral|voxtral/)
    })

    it('OCR_API_KEY posée, transcription non branchée : accent/bruit restent non branchés', async () => {
      process.env['OCR_API_KEY'] = 'mistral-cle-test'
      const { controller } = setup({ key: false })
      expect(await controller.voiceStatus(USER)).toEqual({ available: false, refinements: NOT_WIRED })
    })

    it('OCR_API_KEY posée : la transcription appelle Voxtral — jamais une clé dans le corps, `res.ok` vérifié', async () => {
      process.env['OCR_API_KEY'] = 'mistral-cle-test'
      const fetchSpy = transcriptionAnswers({
        text: TRANSCRIPT,
        language: 'fr',
        usage: { prompt_audio_seconds: 3.5 },
      })
      const { controller } = setup()

      const result = await controller.transcribeVoiceMessage(USER, dto())

      // #3579 — la clé ne sort JAMAIS vers le client : seuls `text`/`voiceObjectId`/
      // `uncertainSegments` reviennent, jamais la configuration appelée côté serveur.
      expect(result).toEqual({ text: TRANSCRIPT, voiceObjectId: VOICE, uncertainSegments: [] })
      expect(JSON.stringify(result)).not.toContain('mistral-cle-test')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.mistral.ai/v1/audio/transcriptions')
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer mistral-cle-test')
      const form = init.body as FormData
      expect(form.get('model')).toBe('voxtral-mini-latest')
      // #3579 — le `prompt` OpenAI n'existe pas chez Voxtral ; hors dossier, aucun
      // `context_bias` non plus (LOT 15/10 DATA-C : rien d'inventé).
      expect(form.has('prompt')).toBe(false)
      expect(form.has('context_bias')).toBe(false)
    })

    it('LOT (15/10) DATA-C — un dossier ouvert donne ses noms propres à Voxtral en `context_bias`', async () => {
      process.env['OCR_API_KEY'] = 'mistral-cle-test'
      const fetchSpy = transcriptionAnswers({ text: TRANSCRIPT, language: 'fr' })
      const accountsService = {
        findOneForWorkspace: jest
          .fn()
          .mockResolvedValue({ type: 'success', output: { company_name: 'Nova Logistique' } }),
      }
      const contacts = { findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Camille Belhadi' }]) }
      const { controller } = setup({ accountsService, contacts })

      await controller.transcribeVoiceMessage(USER, dto({ accountId: '66666666-6666-4666-8666-666666666666' }))

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const form = init.body as FormData
      expect(form.getAll('context_bias')).toEqual(['Nova Logistique', 'Camille Belhadi'])
      expect(form.has('prompt')).toBe(false)
    })

    it('OCR_API_KEY posée mais le service refuse (`res.ok` faux) : échec explicite, jamais un texte deviné', async () => {
      process.env['OCR_API_KEY'] = 'mistral-cle-test'
      transcriptionAnswers({ message: 'invalid_api_key' }, 401)
      const { controller } = setup()

      const failure = await controller.transcribeVoiceMessage(USER, dto()).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(ServiceUnavailableException)
    })
  })

  describe('transcrire + ranger — les refus, AVANT tout appel réseau', () => {
    it('sans clé : refus explicite, zéro appel réseau, rien de rangé — et aucun nom d’éditeur', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const { controller, storage } = setup({ key: false })
      const failure = await controller.transcribeVoiceMessage(USER, dto()).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(ServiceUnavailableException)
      expect((failure as Error).message).not.toMatch(/openai|whisper/i)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(storage.put).not.toHaveBeenCalled()
    })

    it('en démo : refus — aucun service payant n’est appelé', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const { controller, storage } = setup({ demo: true })
      await expect(controller.transcribeVoiceMessage(USER, dto())).rejects.toBeInstanceOf(BadRequestException)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(storage.put).not.toHaveBeenCalled()
    })

    it('plafond quotidien atteint : même refus que pour un message tapé — pas de second compteur', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const { controller } = setup({ limit: 50, used: 50 })
      const failure = await controller.transcribeVoiceMessage(USER, dto()).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(HttpException)
      expect((failure as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('au-delà de 90 secondes : refus CLAIR, qui dit la borne', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const { controller } = setup()
      await expect(controller.transcribeVoiceMessage(USER, dto({ durationMs: 95_000 }))).rejects.toThrow(/90 secondes/)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('au-delà de 2 Mo : refus 413 qui dit la borne', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const { controller } = setup()
      const tooBig = Buffer.concat([Buffer.from(WEBM, 'base64'), Buffer.alloc(2 * 1024 * 1024)]).toString('base64')
      const failure = await controller
        .transcribeVoiceMessage(USER, dto({ audioB64: tooBig }))
        .catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PayloadTooLargeException)
      expect((failure as Error).message).toMatch(/2 Mo/)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('ce qui n’est pas un enregistrement audio est refusé — le conteneur se lit dans les octets', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const { controller, storage } = setup()
      const pdf = Buffer.from('%PDF-1.4 un contrat').toString('base64')
      await expect(controller.transcribeVoiceMessage(USER, dto({ audioB64: pdf }))).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(storage.put).not.toHaveBeenCalled()
    })
  })

  describe('transcrire + ranger — le chemin qui marche', () => {
    it('rend le texte à RELIRE et l’enregistrement rangé — sans rien envoyer au modèle ni au fil', async () => {
      const fetchSpy = transcriptionAnswers({ text: TRANSCRIPT })
      const { controller, ia, chatMessages, storage } = setup()

      expect(await controller.transcribeVoiceMessage(USER, dto())).toEqual({
        text: TRANSCRIPT,
        voiceObjectId: VOICE,
        uncertainSegments: [],
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(storage.put).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          domain: 'chat_voice_message',
          fileName: 'message-vocal.webm',
          uploadedBy: 'u-1',
          today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      )
      // #1939.10 / #1939.14 — le texte n'est PAS un message : il revient dans la
      // zone de saisie, et c'est l'utilisateur qui l'envoie par le tour ordinaire.
      expect(ia.chatStream).not.toHaveBeenCalled()
      expect(chatMessages.create).not.toHaveBeenCalled()
    })

    it('#2434.40 / #2434.85 — demande les mots horodatés, et rend le mot INCERTAIN, jamais un pourcentage', async () => {
      const fetchSpy = transcriptionAnswers({
        text: TRANSCRIPT,
        words: [{ word: 'Nova', start: 0, end: 0.4 }],
        segments: [{ start: 0, end: 1, avg_logprob: -0.9 }],
      })
      const { controller } = setup()

      expect(await controller.transcribeVoiceMessage(USER, dto())).toEqual({
        text: TRANSCRIPT,
        voiceObjectId: VOICE,
        uncertainSegments: [],
        words: [{ text: 'Nova', uncertain: true }],
      })
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const form = init.body as FormData
      expect(form.get('response_format')).toBe('verbose_json')
      expect(form.get('timestamp_granularities[]')).toBe('word')
    })

    it('sans `words` rendus par le fournisseur : aucune clé `words` dans la réponse — rien de deviné', async () => {
      transcriptionAnswers({ text: TRANSCRIPT })
      const { controller } = setup()
      const result = await controller.transcribeVoiceMessage(USER, dto())
      expect(result).not.toHaveProperty('words')
    })

    it('#2434.34/.35/.36/.37/.38 — transmet un biais de vocabulaire ESN au service de transcription', async () => {
      const fetchSpy = transcriptionAnswers({ text: TRANSCRIPT })
      const { controller } = setup()
      await controller.transcribeVoiceMessage(USER, dto())
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const form = init.body as FormData
      expect(form.get('prompt')).toMatch(/TJM/)
    })

    it('#2434.33 — un dossier ouvert ajoute son nom et ses contacts au biais, pour les noms propres', async () => {
      const fetchSpy = transcriptionAnswers({ text: TRANSCRIPT })
      const accountsService = {
        findOneForWorkspace: jest
          .fn()
          .mockResolvedValue({ type: 'success', output: { company_name: 'Nova Logistique' } }),
      }
      const contacts = {
        findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Camille Belhadi' }, { full_name: 'Yohan Perrin' }]),
      }
      const { controller } = setup({ accountsService, contacts })
      const ACCOUNT = '66666666-6666-4666-8666-666666666666'

      await controller.transcribeVoiceMessage(USER, dto({ accountId: ACCOUNT }))

      expect(accountsService.findOneForWorkspace).toHaveBeenCalledWith(ACCOUNT, 'ws-1')
      expect(contacts.findByAccount).toHaveBeenCalledWith(ACCOUNT, 'u-1')
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const prompt = (init.body as FormData).get('prompt')
      expect(prompt).toMatch(/TJM/)
      expect(prompt).toMatch(/Nova Logistique/)
      expect(prompt).toMatch(/Camille Belhadi/)
      expect(prompt).toMatch(/Yohan Perrin/)
    })

    it('#2434.33 — un compte hors de portée n’échoue PAS la transcription : il ne l’oriente simplement pas', async () => {
      const fetchSpy = transcriptionAnswers({ text: TRANSCRIPT })
      const accountsService = {
        findOneForWorkspace: jest.fn().mockResolvedValue({ type: 'failure', problem: { code: 'not_found' } }),
      }
      const contacts = { findByAccount: jest.fn() }
      const { controller } = setup({ accountsService, contacts })

      expect(
        await controller.transcribeVoiceMessage(USER, dto({ accountId: '77777777-7777-4777-8777-777777777777' })),
      ).toEqual({ text: TRANSCRIPT, voiceObjectId: VOICE, uncertainSegments: [] })

      expect(contacts.findByAccount).not.toHaveBeenCalled()
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const prompt = (init.body as FormData).get('prompt')
      expect(prompt).toMatch(/TJM/)
      expect(prompt).not.toMatch(/Noms propres/)
    })

    it('#2434.33 — sans accountId : le biais reste celui du vocabulaire seul, aucune lecture de compte', async () => {
      const fetchSpy = transcriptionAnswers({ text: TRANSCRIPT })
      const accountsService = { findOneForWorkspace: jest.fn() }
      const { controller } = setup({ accountsService })
      await controller.transcribeVoiceMessage(USER, dto())
      expect(accountsService.findOneForWorkspace).not.toHaveBeenCalled()
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect((init.body as FormData).get('prompt')).not.toMatch(/Noms propres/)
    })

    it('n’écrit JAMAIS la transcription dans un journal', async () => {
      transcriptionAnswers({ text: TRANSCRIPT })
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(level =>
        jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
      )
      const { controller } = setup()
      await controller.transcribeVoiceMessage(USER, dto())
      const written = spies.flatMap(spy => spy.mock.calls).map(call => JSON.stringify(call))
      expect(written.some(line => line.includes('relance'))).toBe(false)
    })

    it('le service de transcription tombe : refus 503, et RIEN n’est rangé', async () => {
      transcriptionAnswers({ error: { message: 'down' } }, 500)
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      const { controller, storage } = setup()
      const failure = await controller.transcribeVoiceMessage(USER, dto()).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(ServiceUnavailableException)
      expect((failure as Error).message).not.toMatch(/openai|whisper/i)
      expect(storage.put).not.toHaveBeenCalled()
    })

    it('rien entendu : un refus DISTINCT de la panne, et aucun silence n’est conservé', async () => {
      transcriptionAnswers({ text: '   ' })
      const { controller, storage } = setup()
      await expect(controller.transcribeVoiceMessage(USER, dto())).rejects.toThrow(/rien entendu/i)
      expect(storage.put).not.toHaveBeenCalled()
    })
  })

  describe('#2434.74/.75/.77 — la langue : auto ne se force pas, la langue détectée revient', () => {
    it('`auto` ne se transmet PAS au fournisseur — Whisper détecte seul', async () => {
      const fetchSpy = transcriptionAnswers({ text: TRANSCRIPT, language: 'english' })
      const { controller } = setup()
      await controller.transcribeVoiceMessage(USER, dto({ language: 'auto' }))
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect((init.body as FormData).get('language')).toBeNull()
    })

    it('la langue détectée n’est PLUS rendue (retour du 30/09 : aucun lecteur, du bruit à l’écran)', async () => {
      transcriptionAnswers({ text: TRANSCRIPT, language: 'english' })
      const { controller } = setup()
      const result = await controller.transcribeVoiceMessage(USER, dto({ language: 'fr' }))
      expect(result).not.toHaveProperty('detectedLanguage')
    })
  })

  describe('#3579 / #2434.77 — langue par segment et coût par minute', () => {
    const MIXED = {
      text: 'on a un go pour le projet we need the budget for this',
      duration: 90,
      segments: [
        { start: 0, end: 3, text: 'on a un go pour le projet', avg_logprob: -0.1 },
        { start: 3, end: 6, text: 'we need the budget for this', avg_logprob: -0.1 },
      ],
    }

    it('rend la langue de CHAQUE segment (FR/EN)', async () => {
      transcriptionAnswers(MIXED)
      const { controller } = setup()
      const result = await controller.transcribeVoiceMessage(USER, dto({ language: 'auto' }))
      expect(result.segments).toEqual([
        { text: 'on a un go pour le projet', language: 'fr' },
        { text: 'we need the budget for this', language: 'en' },
      ])
    })

    it('inscrit la durée au registre de coûts (par minute), sans nom de fournisseur dans la réponse', async () => {
      transcriptionAnswers(MIXED)
      const providerCosts = { record: jest.fn().mockResolvedValue(undefined) }
      const { controller } = setup({ providerCosts })
      const result = await controller.transcribeVoiceMessage(USER, dto())
      expect(providerCosts.record).toHaveBeenCalledWith(
        [expect.objectContaining({ operation: 'transcribe', units: 1.5, cost_usd: expect.closeTo(0.009, 6) })],
        expect.objectContaining({ workspaceId: 'ws-1', userId: 'u-1', feature: 'voice_transcription' }),
      )
      expect(JSON.stringify(result).toLowerCase()).not.toContain('openai')
    })

    it('le statut annonce la langue par segment comme branchée, accent et bruit restant non branchés', async () => {
      const { controller } = setup()
      const status = await controller.voiceStatus(USER)
      expect(status.refinements).toEqual({ accent: 'not_wired', noise: 'not_wired', mixedLanguage: 'segment_language' })
    })
  })

  describe('#2434.40 — les passages douteux : segments sous le seuil, jamais un score par mot', () => {
    it('marque les segments de faible confiance dans la réponse', async () => {
      transcriptionAnswers({
        text: TRANSCRIPT,
        segments: [
          { text: 'Prépare une relance', avg_logprob: -0.1 },
          { text: 'pour le DSI de Nova Logistique', avg_logprob: -0.9 },
        ],
      })
      const { controller } = setup()
      const result = await controller.transcribeVoiceMessage(USER, dto())
      expect(result.uncertainSegments).toEqual(['pour le DSI de Nova Logistique'])
    })

    it('aucun segment rendu par le fournisseur : liste vide, jamais une valeur inventée', async () => {
      transcriptionAnswers({ text: TRANSCRIPT })
      const { controller } = setup()
      const result = await controller.transcribeVoiceMessage(USER, dto())
      expect(result.uncertainSegments).toEqual([])
    })
  })

  describe('la réécoute — même portée que le texte du fil', () => {
    it('rend une URL signée pour un message de l’espace du demandeur', async () => {
      const { controller, chatMessages, storage } = setup()
      chatMessages.voiceObjectIdInWorkspace.mockResolvedValueOnce(VOICE)

      const signed = await controller.listenVoiceMessage(USER, MESSAGE)

      expect(chatMessages.voiceObjectIdInWorkspace).toHaveBeenCalledWith('ws-1', MESSAGE)
      expect(storage.signedUrlFor).toHaveBeenCalledWith('ws-1', VOICE)
      expect(signed.url).toContain('signature=')
    })

    it('NON — un membre d’un AUTRE espace ne réécoute pas : l’espace vient de SA session', async () => {
      const { controller, chatMessages, workspaceContext, storage } = setup()
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-2', role: 'owner' })
      // Le message existe dans ws-1, et seulement là.
      chatMessages.voiceObjectIdInWorkspace.mockImplementation(async (workspaceId: string) =>
        workspaceId === 'ws-1' ? VOICE : null,
      )

      await expect(controller.listenVoiceMessage(USER, MESSAGE)).rejects.toBeInstanceOf(NotFoundException)
      expect(chatMessages.voiceObjectIdInWorkspace).toHaveBeenCalledWith('ws-2', MESSAGE)
      expect(storage.signedUrlFor).not.toHaveBeenCalled()
    })

    it('un message sans enregistrement conservé : 404 qui dit pourquoi', async () => {
      const { controller, storage } = setup()
      await expect(controller.listenVoiceMessage(USER, MESSAGE)).rejects.toThrow(/30 jours/)
      expect(storage.signedUrlFor).not.toHaveBeenCalled()
    })
  })
})
