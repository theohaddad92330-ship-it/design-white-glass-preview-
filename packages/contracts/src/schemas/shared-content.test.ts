import { describe, expect, it } from 'vitest'
import { CONTENT_VISIBILITIES, isContentVisibleTo, setContentVisibilitySchema } from './shared-content.js'

// #4158.30 — partagé avec l'équipe / personnel : un personnel n'est lisible que de son auteur.
describe('shared-content', () => {
  it('deux états seulement, le partagé d’abord (comportement d’avant)', () => {
    expect(CONTENT_VISIBILITIES).toEqual(['team', 'personal'])
  })

  it('le partagé est lu de tout l’espace', () => {
    expect(isContentVisibleTo({ visibility: 'team', created_by: 'a' }, 'b')).toBe(true)
    expect(isContentVisibleTo({ visibility: 'team', created_by: null }, 'b')).toBe(true)
  })

  it('le personnel n’est lisible que de son auteur — un autre membre ne le voit pas', () => {
    expect(isContentVisibleTo({ visibility: 'personal', created_by: 'a' }, 'a')).toBe(true)
    expect(isContentVisibleTo({ visibility: 'personal', created_by: 'a' }, 'b')).toBe(false)
  })

  it('un personnel sans auteur connu n’est lisible de personne', () => {
    expect(isContentVisibleTo({ visibility: 'personal', created_by: null }, 'a')).toBe(false)
  })

  it('refuse une visibilité inconnue', () => {
    expect(() => setContentVisibilitySchema.parse({ visibility: 'public' })).toThrow()
  })
})
