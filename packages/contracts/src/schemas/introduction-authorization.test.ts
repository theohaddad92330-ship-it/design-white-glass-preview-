import { describe, expect, it } from 'vitest'
import {
  INTRODUCTION_AUTHORIZATION_CHANNELS,
  createIntroductionAuthorizationSchema,
} from './introduction-authorization.js'

/**
 * #2373.9 — le body de POST .../introduction-authorizations. Ni `workspaceId`
 * ni `recordedBy` : dérivés du JWT + du workspace actif côté contrôleur,
 * jamais pris tels quels du corps de la requête.
 */
describe('#2373.9 — createIntroductionAuthorizationSchema', () => {
  const base = {
    targetContactId: '11111111-1111-4111-8111-111111111111',
    granted: true,
    channel: 'email',
    authorizedAt: '2026-09-22T10:00:00.000Z',
  }

  it('accepte le minimum requis', () => {
    expect(createIntroductionAuthorizationSchema.safeParse(base).success).toBe(true)
  })

  it('refuse un canal hors vocabulaire fermé', () => {
    const result = createIntroductionAuthorizationSchema.safeParse({ ...base, channel: 'pigeon-voyageur' })
    expect(result.success).toBe(false)
  })

  it('refuse une cible qui n’est pas un uuid', () => {
    const result = createIntroductionAuthorizationSchema.safeParse({ ...base, targetContactId: 'pas-un-uuid' })
    expect(result.success).toBe(false)
  })

  it('couvre les canaux nommés par LAU-FINAL-088', () => {
    expect(INTRODUCTION_AUTHORIZATION_CHANNELS).toEqual(['email', 'sms', 'appel', 'linkedin', 'verbal', 'autre'])
  })

  it('accepte le texte, le périmètre et les restrictions, bornés', () => {
    const result = createIntroductionAuthorizationSchema.safeParse({
      ...base,
      referrerContactId: '22222222-2222-4222-8222-222222222222',
      text: 'Oui, tu peux le présenter.',
      scope: 'Cette seule introduction',
      restrictions: 'Ne pas mentionner le projet en cours',
    })
    expect(result.success).toBe(true)
  })
})

/**
 * #3403.7 — `linkKind`/`verified`, enfin PERSISTÉS. Optionnels : une ligne déjà
 * en base, ou saisie sans type, n'en porte aucun.
 */
describe('#3403.7 — linkKind et verified, optionnels et fermés', () => {
  const base = {
    targetContactId: '11111111-1111-4111-8111-111111111111',
    granted: true,
    channel: 'email',
    authorizedAt: '2026-09-22T10:00:00.000Z',
  }

  it('accepte sans linkKind ni verified (ligne existante, ou saisie sans type)', () => {
    expect(createIntroductionAuthorizationSchema.safeParse(base).success).toBe(true)
  })

  it('accepte un type du vocabulaire fermé, vérifié ou non', () => {
    const result = createIntroductionAuthorizationSchema.safeParse({
      ...base,
      linkKind: 'former_manager',
      verified: true,
    })
    expect(result.success).toBe(true)
  })

  it('refuse un type inventé', () => {
    const result = createIntroductionAuthorizationSchema.safeParse({ ...base, linkKind: 'lien_invente' })
    expect(result.success).toBe(false)
  })
})
