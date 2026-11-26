import { EmptyTranscriptionError } from './transcription.client'
import { readVoxtralConfig, transcribeWithVoxtral } from './voxtral.client'

/**
 * #3579 (décision Louis 14/10) — LE FOURNISSEUR DE TRANSCRIPTION POUR
 * L'ACCENT ET LE BRUIT (#2434.74 / #2434.75) : Mistral Voxtral.
 *
 * Contrat SUIVI, et rien que lui (docs.mistral.ai/api/endpoint/audio/transcriptions,
 * vérifié le 14/10/2026) : `text`, `language`, `usage.prompt_audio_seconds`.
 * Rien d'autre — `segments`/`words` ne sont documentés nulle part sur cette
 * page, donc jamais lus ici (un contrat d'API non vérifiable ne se devine
 * pas, `agent_docs/doctrine.md`).
 */
describe('Voxtral — le client de transcription suivi au contrat vérifié seul', () => {
  const OLD_ENV = { ...process.env }
  const config = { url: 'https://voxtral.example/v1/audio/transcriptions', apiKey: 'k', model: 'voxtral-mini-latest' }
  const audio = { audio: Buffer.from('octets'), filename: 'message-vocal.webm' }

  beforeEach(() => {
    process.env = { ...OLD_ENV }
    delete process.env['OCR_API_KEY']
    delete process.env['MISTRAL_API_URL']
    delete process.env['MISTRAL_VOXTRAL_MODEL']
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  describe('la configuration — sans clé, no-op STRICT', () => {
    it('sans clé : aucune configuration, aucun appel possible', () => {
      expect(readVoxtralConfig()).toBeNull()
    })

    it('une clé faite d’espaces n’est pas une clé', () => {
      process.env['OCR_API_KEY'] = '   '
      expect(readVoxtralConfig()).toBeNull()
    })

    it('avec clé : les défauts, que l’URL et le modèle peuvent déplacer', () => {
      process.env['OCR_API_KEY'] = 'k'
      expect(readVoxtralConfig()).toEqual({
        apiKey: 'k',
        url: 'https://api.mistral.ai/v1/audio/transcriptions',
        model: 'voxtral-mini-latest',
      })
      process.env['MISTRAL_API_URL'] = 'https://voxtral.interne/v1/audio/transcriptions'
      process.env['MISTRAL_VOXTRAL_MODEL'] = 'voxtral-large'
      expect(readVoxtralConfig()).toEqual({
        apiKey: 'k',
        url: 'https://voxtral.interne/v1/audio/transcriptions',
        model: 'voxtral-large',
      })
    })
  })

  describe('l’appel — jamais une clé côté client, toujours `res.ok` vérifié', () => {
    it('rend le texte, la langue et la durée VÉRIFIÉES ; segments et words vides, jamais devinés', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            text: '  on a un go pour le projet  ',
            language: 'fr',
            model: 'voxtral-mini-2507',
            segments: [],
            usage: { prompt_audio_seconds: 4.2, prompt_tokens: 10, total_tokens: 12, completion_tokens: 2 },
          }),
          { status: 200 },
        ),
      )

      const detail = await transcribeWithVoxtral(config, audio)

      expect(detail).toEqual({
        text: 'on a un go pour le projet',
        language: 'fr',
        segments: [],
        words: [],
        durationSeconds: 4.2,
      })
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(config.url)
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer k')
      expect(init.body).toBeInstanceOf(FormData)
      const form = init.body as FormData
      expect(form.get('model')).toBe('voxtral-mini-latest')
      expect(form.has('file')).toBe(true)
    })

    it('transmet la langue quand elle est connue, l’omet sinon', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async () => new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 }))
      await transcribeWithVoxtral(config, { ...audio, language: 'fr' })
      expect((fetchSpy.mock.calls[0]?.[1]?.body as FormData).get('language')).toBe('fr')

      await transcribeWithVoxtral(config, audio)
      expect((fetchSpy.mock.calls[1]?.[1]?.body as FormData).has('language')).toBe(false)
    })

    it('une durée non rendue reste `null`, jamais 0 (coût non tarifé)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 }))
      const detail = await transcribeWithVoxtral(config, audio)
      expect(detail.durationSeconds).toBeNull()
    })

    it('un texte vide lève EmptyTranscriptionError, jamais un texte deviné', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: '   ' }), { status: 200 }))
      await expect(transcribeWithVoxtral(config, audio)).rejects.toBeInstanceOf(EmptyTranscriptionError)
    })

    it('sait dire NON : `res.ok` vérifié — un refus HTTP lève, jamais un texte deviné', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ message: 'invalid_api_key' }), { status: 401 }))
      await expect(transcribeWithVoxtral(config, audio)).rejects.toThrow(/invalid_api_key/)
    })

    it('un corps de refus non JSON retombe sur le code HTTP, jamais une erreur masquée', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<html>502</html>', { status: 502 }))
      await expect(transcribeWithVoxtral(config, audio)).rejects.toThrow(/502/)
    })
  })

  /**
   * LOT (15/10) DATA-C — `context_bias` (doc Mistral relue le 15/10/2026,
   * « Offline transcription » : « up to 100 words or phrases » ; champ
   * multipart RÉPÉTÉ, forme du SDK officiel `mistralai` 3.2.0) : les noms
   * propres du dossier guident l'orthographe, comme le `prompt` du contrat
   * OpenAI sur l'autre voie.
   */
  describe('context_bias — le vocabulaire du dossier', () => {
    it('un champ par terme, nettoyé, dédoublonné, plafonné à 100', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 }))
      const many = Array.from({ length: 120 }, (_, i) => `Terme ${i}`)
      await transcribeWithVoxtral(config, {
        ...audio,
        contextBias: [' Decathlon ', 'Decathlon', '', 'Jeanne Martin', ...many],
      })
      const form = fetchSpy.mock.calls[0]?.[1]?.body as FormData
      const terms = form.getAll('context_bias')
      expect(terms.slice(0, 2)).toEqual(['Decathlon', 'Jeanne Martin'])
      expect(terms).toHaveLength(100)
    })

    it('sans vocabulaire : aucun champ, requête inchangée', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 }))
      await transcribeWithVoxtral(config, { ...audio, contextBias: [] })
      const form = fetchSpy.mock.calls[0]?.[1]?.body as FormData
      expect(form.has('context_bias')).toBe(false)
      expect(form.has('timestamp_granularities')).toBe(false)
    })
  })
})
