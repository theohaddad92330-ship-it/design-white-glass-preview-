import { describe, expect, it } from 'vitest'
import { bannerFormCanSubmit } from './banner-form-validation'

/**
 * #1667.2 — la décision « peut-on soumettre ? » vit ici, hors du composant,
 * parce que l'environnement de test de cette application est `node` (voir
 * `vitest.config.mts`) : jsdom ne met rien en page, donc ce qui se garde est
 * la LOGIQUE, pas le rendu.
 *
 * Avant ce lot, `canSubmit` ne vérifiait que les deux titres — une bannière
 * sans date de fin passait le bouton, atteignait l'API, et y restait affichée
 * aux clients pour toujours (le contrat `endsAt` était nullable en écriture).
 * `endsAt` est maintenant l'une des conditions du bouton lui-même : l'opérateur
 * ne peut plus soumettre le formulaire — création OU édition — sans en saisir
 * une, avant même que l'API n'ait son mot à dire.
 */

const base = { titleFr: 'Nouveauté', titleEn: 'What’s new', endsAt: '2026-08-01T10:00', state: 'idle' as const }

describe('bannerFormCanSubmit', () => {
  it('allows submit when both titles and an end date are filled', () => {
    expect(bannerFormCanSubmit(base)).toBe(true)
  })

  it('refuses submit when endsAt is empty — the bug this closes', () => {
    expect(bannerFormCanSubmit({ ...base, endsAt: '' })).toBe(false)
  })

  it('refuses submit when the FR title is empty (whitespace-only counts as empty)', () => {
    expect(bannerFormCanSubmit({ ...base, titleFr: '   ' })).toBe(false)
  })

  it('refuses submit when the EN title is empty', () => {
    expect(bannerFormCanSubmit({ ...base, titleEn: '' })).toBe(false)
  })

  it('refuses submit while a save is already in flight', () => {
    expect(bannerFormCanSubmit({ ...base, state: 'saving' })).toBe(false)
  })

  it('still allows submit while in an error state (retry)', () => {
    expect(bannerFormCanSubmit({ ...base, state: 'error' })).toBe(true)
  })
})
