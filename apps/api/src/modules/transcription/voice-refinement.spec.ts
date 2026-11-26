import { voiceRefinementStatus } from './voice-refinement'

// #2434.74 / #2434.75 / #2434.77 — le port de raffinement (accent, bruit,
// mélange FR/EN) est NOMMÉ non branché — jamais deviné, jamais un appel réseau.

describe('voice-refinement — le port NON BRANCHÉ', () => {
  it('rend les trois capacités nommées, toutes non branchées', () => {
    expect(voiceRefinementStatus()).toEqual({
      accent: 'not_wired',
      noise: 'not_wired',
      mixedLanguage: 'not_wired',
    })
  })

  it('le test qui dit NON — aucune variable d’environnement ne le fait basculer : rien n’est deviné', () => {
    const OLD_ENV = { ...process.env }
    process.env['VOICE_REFINEMENT_PROVIDER_URL'] = 'https://un-fournisseur-imaginaire.example'
    process.env['TRANSCRIPTION_ACCENT_KEY'] = 'peu-importe'
    try {
      expect(voiceRefinementStatus()).toEqual({
        accent: 'not_wired',
        noise: 'not_wired',
        mixedLanguage: 'not_wired',
      })
    } finally {
      process.env = OLD_ENV
    }
  })

  it('n’effectue aucun appel réseau — un port, pas un client', () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    voiceRefinementStatus()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

/**
 * #3579 (décision Louis 14/10, QCM) — Mistral Voxtral est le fournisseur
 * NOMMÉ pour l'accent (#2434.74) et le bruit (#2434.75). Branché derrière CE
 * port : `accent`/`noise` basculent SEULEMENT quand l'appelant dit Voxtral
 * configuré (`readVoxtralConfig() !== null`, `ia-proxy.controller.ts`) —
 * jamais une précision simulée, jamais le nom du fournisseur ici (doctrine :
 * « nos fournisseurs ne se nomment jamais »).
 */
describe('voice-refinement — Voxtral branché (#3579)', () => {
  it('sans Voxtral configuré (par défaut) : accent et bruit restent non branchés', () => {
    expect(voiceRefinementStatus(true, false)).toEqual({
      accent: 'not_wired',
      noise: 'not_wired',
      mixedLanguage: 'segment_language',
    })
  })

  it('Voxtral configuré : accent et bruit basculent, sans jamais nommer le fournisseur', () => {
    const status = voiceRefinementStatus(true, true)
    expect(status.accent).toBe('robust_model')
    expect(status.noise).toBe('robust_model')
    expect(JSON.stringify(status).toLowerCase()).not.toContain('mistral')
    expect(JSON.stringify(status).toLowerCase()).not.toContain('voxtral')
  })

  it('Voxtral configuré mais la transcription elle-même non branchée : accent/bruit restent non branchés', () => {
    // #3579 — Voxtral n'est jamais appelé si la capacité de transcription
    // elle-même (`readTranscriptionConfig()`) est absente (voir
    // `ia-proxy.controller.ts`) : le port ne ment pas sur une capacité éteinte
    // en amont.
    expect(voiceRefinementStatus(false, true)).toEqual({
      accent: 'not_wired',
      noise: 'not_wired',
      mixedLanguage: 'not_wired',
    })
  })
})
