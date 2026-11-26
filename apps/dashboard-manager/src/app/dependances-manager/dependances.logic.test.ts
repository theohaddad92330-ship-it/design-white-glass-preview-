import { describe, expect, it } from 'vitest'
import { couleurPresence, libellePresence, presenceApresTest, resumeParPresence } from './dependances.logic'

describe('libellePresence', () => {
  it('sait dire NON — "non mesuré" n’est jamais confondu avec "non configuré"', () => {
    expect(libellePresence(null)).toBe('Non mesuré')
    expect(libellePresence(false)).toBe('Non configuré')
    expect(libellePresence(true)).toBe('Configuré')
  })
})

describe('couleurPresence', () => {
  it('non mesuré et non configuré partagent la couleur neutre — ni l’un ni l’autre n’est une alerte', () => {
    expect(couleurPresence(null)).toBe(couleurPresence(false))
    expect(couleurPresence(true)).not.toBe(couleurPresence(false))
  })
})

describe('resumeParPresence', () => {
  it('compte les trois catégories indépendamment', () => {
    const deps = [
      { id: 'stripe', label: 'Stripe', role: 'x', configured: true },
      { id: 'resend', label: 'Resend', role: 'x', configured: false },
      { id: 'slack', label: 'Slack', role: 'x', configured: null },
    ] as const
    expect(resumeParPresence(deps)).toEqual({ configurees: 1, nonConfigurees: 1, nonMesurees: 1 })
  })

  it('LIT quelque chose — une liste vide rend un compte vide, pas une erreur', () => {
    expect(resumeParPresence([])).toEqual({ configurees: 0, nonConfigurees: 0, nonMesurees: 0 })
  })
})

describe('la preuve l’emporte sur la déclaration (recette du 09/09/2026)', () => {
  it('LIT quelque chose — sans test, la déclaration passe telle quelle', () => {
    expect(presenceApresTest(true, null)).toBe(true)
    expect(presenceApresTest(false, null)).toBe(false)
    expect(presenceApresTest(null, null)).toBeNull()
  })

  it('un test qui dit « non configuré » CORRIGE une déclaration trop optimiste', () => {
    // Le cas mesuré en production : présence « Configuré », et à quarante
    // pixels « non configuré pour un test réel — VERCEL_API_TOKEN absente ».
    expect(
      presenceApresTest(true, {
        ok: false,
        detail: 'non configuré pour un test réel — VERCEL_API_TOKEN absente (déploiement courant : c0ed073)',
      }),
    ).toBe(false)
  })

  it('un test RÉUSSI confirme la présence, même déclarée inconnue', () => {
    expect(presenceApresTest(null, { ok: true, detail: 'Supabase Auth a répondu' })).toBe(true)
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — une PANNE n’apprend rien sur la configuration', () => {
    // Le témoin, et c'est la moitié utile de la règle : confondre un échec
    // réseau avec une absence de configuration ferait dire « non configuré »
    // à une panne — exactement ce que cette page existe pour éviter.
    expect(presenceApresTest(true, { ok: false, detail: 'HTTP 503 — le service ne répond pas' })).toBe(true)
    expect(presenceApresTest(true, { ok: false, detail: 'fetch failed' })).toBe(true)
  })
})
