import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EmptyTranscriptionError,
  readTranscriptionConfig,
  transcribeAudio,
  transcribeAudioDetailed,
} from './transcription.client'

/**
 * #1939.14 — LE CLIENT DE TRANSCRIPTION, DÉSORMAIS NEUTRE.
 *
 * Il vivait dans `meeting-notes/` alors qu'il ne sait rien d'un rendez-vous : il
 * transcrit des octets. Le message vocal de Laura en a besoin aussi, et le lui
 * faire importer depuis le dossier d'un autre écran aurait lié deux modules qui
 * n'ont rien à voir. Ce qui est tenu ici :
 *
 *  1. **sans clé, la capacité est ABSENTE** — `null`, et aucun octet ne part ;
 *  2. un échec se VOIT, et « rien entendu » ne se confond pas avec « le service
 *     est tombé » ;
 *  3. le déplacement n'a rien cassé : le compte rendu importe depuis ici, et ce
 *     module n'importe rien de lui.
 */
describe('transcription — le client neutre', () => {
  const OLD_ENV = { ...process.env }
  const config = { url: 'https://transcription.example/v1/audio/transcriptions', apiKey: 'k', model: 'm' }
  const audio = { audio: Buffer.from('octets'), filename: 'message-vocal.webm' }

  beforeEach(() => {
    process.env = { ...OLD_ENV }
    delete process.env['TRANSCRIPTION_API_KEY']
    delete process.env['TRANSCRIPTION_API_URL']
    delete process.env['TRANSCRIPTION_MODEL']
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  describe('la configuration', () => {
    it('sans clé : aucune configuration — la capacité n’existe pas', () => {
      expect(readTranscriptionConfig()).toBeNull()
    })

    it('une clé faite d’espaces n’est pas une clé', () => {
      process.env['TRANSCRIPTION_API_KEY'] = '   '
      expect(readTranscriptionConfig()).toBeNull()
    })

    it('avec clé : les défauts, que l’URL et le modèle peuvent déplacer', () => {
      process.env['TRANSCRIPTION_API_KEY'] = 'k'
      expect(readTranscriptionConfig()).toEqual(
        expect.objectContaining({
          apiKey: 'k',
          model: 'whisper-1',
          url: expect.stringContaining('/audio/transcriptions'),
        }),
      )
      process.env['TRANSCRIPTION_API_URL'] = 'https://whisper.interne/v1/audio/transcriptions'
      process.env['TRANSCRIPTION_MODEL'] = 'autre'
      expect(readTranscriptionConfig()).toEqual({
        apiKey: 'k',
        url: 'https://whisper.interne/v1/audio/transcriptions',
        model: 'autre',
      })
    })
  })

  describe('l’appel', () => {
    it('rend le texte, rogné', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ text: '  Bonjour Laura  ' }), { status: 200 }))
      await expect(transcribeAudio(config, { ...audio, language: 'fr' })).resolves.toBe('Bonjour Laura')
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(config.url)
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer k')
    })

    it('#2434.34/.35/.36/.37/.38 — un biais de vocabulaire est transmis quand l’appelant en fournit un', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 }))
      await transcribeAudio(config, { ...audio, prompt: 'ESN, TJM, CRA' })
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const form = init.body as FormData
      expect(form.get('prompt')).toBe('ESN, TJM, CRA')
    })

    it('sans biais fourni : aucun champ `prompt` — le compte rendu de rendez-vous n’est pas affecté', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 }))
      await transcribeAudio(config, audio)
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const form = init.body as FormData
      expect(form.get('prompt')).toBeNull()
    })

    it('un refus du service lève une erreur NOMMÉE', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }))
      await expect(transcribeAudio(config, audio)).rejects.toThrow(/HTTP 401/)
    })

    it('« rien entendu » est une erreur DISTINCTE — pas une panne, pas un texte vide', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: '   ' }), { status: 200 }))
      const failure = await transcribeAudio(config, audio).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(EmptyTranscriptionError)
      // Le message d'origine ne change pas : le compte rendu de rendez-vous le
      // remontait déjà tel quel.
      expect((failure as Error).message).toBe('Le service de transcription n’a rendu aucun texte.')
    })
  })

  describe('transcribeAudioDetailed — #2434.40 / #2434.74-.77 / #2434.85 — un seul appel pour langue, segments et mots', () => {
    it('#3457 — une phrase rendue deux fois de suite ne sort qu’une fois, et le verdict par mot suit le premier exemplaire', async () => {
      const spoken = 'Bonjour, comment allez-vous ?'
      const once = spoken.split(' ')
      const twice = [...once, ...once]
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            text: `${spoken} ${spoken}`,
            language: 'french',
            segments: [{ text: spoken, start: 0, end: 2, avg_logprob: -0.1 }],
            words: twice.map((word, index) => ({ word, start: index * 0.3, end: index * 0.3 + 0.2 })),
          }),
          { status: 200 },
        ),
      )
      const detail = await transcribeAudioDetailed(config, audio)
      expect(detail.text).toBe(spoken)
      expect(detail.words.map(w => w.text)).toEqual(once)
    })

    it('demande `verbose_json` avec les horodatages par mot, et rend la langue détectée, les segments et le verdict par mot', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            text: 'Bonjour Laura',
            language: 'french',
            segments: [
              { text: 'Bonjour', start: 0, end: 0.4, avg_logprob: -0.1 },
              { text: 'Laura', start: 0.5, end: 1, avg_logprob: -0.9 },
            ],
            words: [
              { word: 'Bonjour', start: 0, end: 0.4 },
              { word: 'Laura', start: 0.5, end: 1 },
            ],
          }),
          { status: 200 },
        ),
      )
      await expect(transcribeAudioDetailed(config, audio)).resolves.toEqual({
        text: 'Bonjour Laura',
        durationSeconds: null,
        language: 'french',
        segments: [
          { text: 'Bonjour', avgLogprob: -0.1 },
          { text: 'Laura', avgLogprob: -0.9 },
        ],
        words: [
          { text: 'Bonjour', uncertain: false },
          { text: 'Laura', uncertain: true },
        ],
      })
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const form = init.body as FormData
      expect(form.get('response_format')).toBe('verbose_json')
      expect(form.get('timestamp_granularities[]')).toBe('word')
    })

    it('langue absente, segments absents, mots absents : `null` et `[]`, jamais une valeur inventée', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'Bonjour' }), { status: 200 }))
      await expect(transcribeAudioDetailed(config, audio)).resolves.toEqual({
        text: 'Bonjour',
        durationSeconds: null,
        language: null,
        segments: [],
        words: [],
      })
    })

    it('`transcribeAudio` ne garde que le texte, en `json` — le compte rendu de rendez-vous n’a rien à changer', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ text: 'Bonjour', language: 'french', segments: [] }), { status: 200 }),
        )
      await expect(transcribeAudio(config, audio)).resolves.toBe('Bonjour')
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const form = init.body as FormData
      expect(form.get('response_format')).toBe('json')
    })

    it('« rien entendu » reste la même erreur nommée qu’en `json`', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: '' }), { status: 200 }))
      await expect(transcribeAudioDetailed(config, audio)).rejects.toBeInstanceOf(EmptyTranscriptionError)
    })
  })

  describe('le déplacement', () => {
    const MODULES = join(__dirname, '..')

    it('le compte rendu de rendez-vous importe depuis le module neutre — et plus aucune copie ne traîne', () => {
      const meetingNotes = readFileSync(join(MODULES, 'meeting-notes', 'meeting-notes.service.ts'), 'utf8')
      expect(meetingNotes).toContain("from '../transcription/transcription.client'")
      expect(existsSync(join(MODULES, 'meeting-notes', 'transcription.client.ts'))).toBe(false)
    })

    it('le module neutre ne dépend d’aucun écran', () => {
      const client = readFileSync(join(__dirname, 'transcription.client.ts'), 'utf8')
      expect(client.length).toBeGreaterThan(500)
      expect(client).not.toMatch(/from '\.\.\//)
    })
  })
})
