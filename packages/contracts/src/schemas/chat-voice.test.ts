import { describe, expect, it } from 'vitest'
import {
  CHAT_VOICE_LOW_CONFIDENCE_LOG_PROB,
  CHAT_VOICE_MESSAGE_MAX_BYTES,
  CHAT_VOICE_MESSAGE_MAX_SECONDS,
  chatVoiceDurationRefused,
  chatVoiceRefinementStatusSchema,
  chatVoiceStatusSchema,
  chatVoiceTranscribeSchema,
  chatVoiceTranscriptionSchema,
  chatVoiceUncertainSegments,
  sniffChatVoiceContainer,
} from './chat-voice.js'

const NOT_WIRED = { accent: 'not_wired', noise: 'not_wired', mixedLanguage: 'not_wired' } as const

const bytes = (...values: number[]) => Uint8Array.from(values)

describe('#1939 — la durée d’un message vocal', () => {
  it('est bornée à 90 secondes', () => {
    expect(CHAT_VOICE_MESSAGE_MAX_SECONDS).toBe(90)
    expect(chatVoiceDurationRefused(90_000)).toBe(false)
  })

  it('tolère une seconde de gigue d’horloge, pas plus', () => {
    // L'enregistreur coupe à 90 s : son minuteur rend 90 004 ms, pas 90 000.
    expect(chatVoiceDurationRefused(91_000)).toBe(false)
    expect(chatVoiceDurationRefused(91_001)).toBe(true)
    expect(chatVoiceDurationRefused(300_000)).toBe(true)
  })

  it('refuse une durée qui n’en est pas une', () => {
    expect(chatVoiceDurationRefused(0)).toBe(true)
    expect(chatVoiceDurationRefused(-5)).toBe(true)
    expect(chatVoiceDurationRefused(Number.NaN)).toBe(true)
  })
})

describe('#1939 — le conteneur se lit dans les OCTETS, jamais dans ce que le navigateur déclare', () => {
  it('reconnaît un WebM (Chrome, Firefox)', () => {
    expect(sniffChatVoiceContainer(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42))).toBe('webm')
  })

  it('reconnaît un Ogg', () => {
    expect(sniffChatVoiceContainer(bytes(0x4f, 0x67, 0x67, 0x53, 0x00, 0x02))).toBe('ogg')
  })

  it('reconnaît un MP4 (Safari) — « ftyp » à l’octet 4', () => {
    expect(sniffChatVoiceContainer(bytes(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34))).toBe('mp4')
  })

  it('rend `null` pour tout le reste — un PDF, du texte, trois octets', () => {
    expect(sniffChatVoiceContainer(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34))).toBeNull()
    expect(sniffChatVoiceContainer(new TextEncoder().encode('bonjour Laura'))).toBeNull()
    expect(sniffChatVoiceContainer(bytes(0x1a, 0x45, 0xdf))).toBeNull()
  })
})

describe('#1939 — ce qui voyage', () => {
  const ok = { audioB64: 'GkXfow==', durationMs: 4200 }

  it('le corps n’accepte rien d’autre — surtout pas un espace ni un utilisateur', () => {
    expect(chatVoiceTranscribeSchema.safeParse(ok).success).toBe(true)
    expect(chatVoiceTranscribeSchema.safeParse({ ...ok, language: 'en' }).success).toBe(true)
    expect(chatVoiceTranscribeSchema.safeParse({ ...ok, workspaceId: 'volé' }).success).toBe(false)
    expect(chatVoiceTranscribeSchema.safeParse({ ...ok, userId: 'volé' }).success).toBe(false)
    expect(chatVoiceTranscribeSchema.safeParse({ ...ok, language: 'de' }).success).toBe(false)
  })

  it('#2434.74/.75/.77 — accepte `auto` : la langue se détecte, ne se force pas', () => {
    expect(chatVoiceTranscribeSchema.safeParse({ ...ok, language: 'auto' }).success).toBe(true)
  })

  it('#2434.33 — accepte un accountId (UUID) optionnel, pour orienter les noms propres', () => {
    expect(
      chatVoiceTranscribeSchema.safeParse({ ...ok, accountId: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true)
    expect(chatVoiceTranscribeSchema.safeParse({ ...ok, accountId: 'pas-un-uuid' }).success).toBe(false)
  })

  it('le corps borne l’audio encodé au-dessus de la limite, pour que le refus CLAIR vienne du serveur', () => {
    // La borne du SCHÉMA est plus large que celle du fichier : c'est le serveur
    // qui dit « au plus 2 Mo », pas un message de validation générique.
    const decodedCeiling = Math.floor(((chatVoiceTranscribeSchema.shape.audioB64.maxLength ?? 0) * 3) / 4)
    expect(decodedCeiling).toBeGreaterThan(CHAT_VOICE_MESSAGE_MAX_BYTES)
  })

  it('la capacité et la réponse ont une forme fermée', () => {
    expect(chatVoiceStatusSchema.parse({ available: false, refinements: NOT_WIRED })).toEqual({
      available: false,
      refinements: NOT_WIRED,
    })
    expect(
      chatVoiceTranscriptionSchema.safeParse({
        text: 'Bonjour',
        voiceObjectId: '22222222-2222-4222-8222-222222222222',
        uncertainSegments: [],
      }).success,
    ).toBe(true)
    expect(chatVoiceTranscriptionSchema.safeParse({ text: 'Bonjour', voiceObjectId: 'pas-un-id' }).success).toBe(false)
  })

  it('#2434.74 / #2434.75 / #2434.77 — le raffinement (accent, bruit, mélange FR/EN) : non branché, ou branché par ses deux seules valeurs nommées', () => {
    expect(chatVoiceRefinementStatusSchema.safeParse(NOT_WIRED).success).toBe(true)
    // Le test qui dit NON — aucune autre valeur n'est un contrat vérifiable : deviner
    // « available » inventerait une capacité qui n'existe pas encore.
    expect(chatVoiceRefinementStatusSchema.safeParse({ ...NOT_WIRED, accent: 'available' }).success).toBe(false)
    expect(chatVoiceStatusSchema.safeParse({ available: true }).success).toBe(false)
  })

  it('#3579 (décision Louis 14/10) — accent et bruit acceptent `robust_model` (Voxtral branché), jamais un nom de fournisseur', () => {
    expect(
      chatVoiceRefinementStatusSchema.safeParse({ ...NOT_WIRED, accent: 'robust_model', noise: 'robust_model' })
        .success,
    ).toBe(true)
    expect(chatVoiceRefinementStatusSchema.safeParse({ ...NOT_WIRED, accent: 'voxtral' }).success).toBe(false)
    expect(chatVoiceRefinementStatusSchema.safeParse({ ...NOT_WIRED, accent: 'mistral' }).success).toBe(false)
  })

  it('#2434.40 / #2434.85 — `words` est optionnel, jamais un pourcentage', () => {
    const base = {
      text: 'Bonjour Belhadi',
      voiceObjectId: '22222222-2222-4222-8222-222222222222',
      uncertainSegments: [],
    }
    expect(chatVoiceTranscriptionSchema.safeParse(base).success).toBe(true)
    expect(
      chatVoiceTranscriptionSchema.safeParse({
        ...base,
        words: [
          { text: 'Bonjour', uncertain: false },
          { text: 'Belhadi', uncertain: true },
        ],
      }).success,
    ).toBe(true)
    // Un score n'est jamais un mot incertain : `uncertain` est un booléen, pas un nombre.
    expect(
      chatVoiceTranscriptionSchema.safeParse({ ...base, words: [{ text: 'Belhadi', uncertain: 0.42 }] }).success,
    ).toBe(false)
  })
})

describe('#2434.40 — la confiance par mot n’existe pas : les SEGMENTS, oui', () => {
  it('marque douteux un segment sous le seuil, jamais un segment au-dessus', () => {
    const segments = [
      { text: 'Bonjour Laura', avgLogprob: -0.1 },
      { text: 'mots inaudibles là', avgLogprob: -0.8 },
    ]
    expect(chatVoiceUncertainSegments(segments)).toEqual(['mots inaudibles là'])
  })

  it('le seuil documenté est celui réellement appliqué par défaut', () => {
    const segments = [{ text: 'pile au seuil', avgLogprob: CHAT_VOICE_LOW_CONFIDENCE_LOG_PROB }]
    // Au SEUIL, pas EN-DESSOUS : ce segment n'est pas marqué.
    expect(chatVoiceUncertainSegments(segments)).toEqual([])
    expect(
      chatVoiceUncertainSegments([{ text: 'sous le seuil', avgLogprob: CHAT_VOICE_LOW_CONFIDENCE_LOG_PROB - 0.01 }]),
    ).toEqual(['sous le seuil'])
  })

  it('un segment vide ou blanc ne marque rien — rien à relire', () => {
    expect(chatVoiceUncertainSegments([{ text: '   ', avgLogprob: -5 }])).toEqual([])
  })
})
