import { describe, expect, it } from 'vitest'
import { createProjectSchema, projectRowSchema, updateProjectScopeSchema } from './project.js'

/**
 * #3266.1 — LE GRAIN équipe/site/projet d'une opportunité.
 *
 * Tranché sans Louis (#3292) : ce grain vit comme un CHAMP TEXTE LIBRE sur
 * l'opportunité (`scope_label`), saisi par le commercial — jamais un
 * septième axe BTMMP (six axes fixes, annexe méthodo p21 : les étendre est
 * une décision produit à part, pas une extension technique libre) et jamais
 * dérivé de l'org-graph du compte (qui modélise des PERSONNES, pas un
 * périmètre équipe/site/projet). `null` = personne ne l'a écrit — l'écran
 * n'affiche alors aucune ligne, même règle que `risks` (#2324.37).
 */
describe('scope_label — grain équipe/site/projet (#3266.1, #3292)', () => {
  it('se saisit à la création, rogné, ou reste absent', () => {
    expect(
      createProjectSchema.parse({
        account_id: crypto.randomUUID(),
        label: 'Refonte CRM',
        scope_label: '  Équipe Data / Site Lyon  ',
      }),
    ).toMatchObject({
      scope_label: 'Équipe Data / Site Lyon',
    })
    expect(
      createProjectSchema.parse({ account_id: crypto.randomUUID(), label: 'Refonte CRM' }).scope_label,
    ).toBeUndefined()
  })

  it('une chaîne vide part à null — jamais un périmètre "vide" stocké', () => {
    expect(
      createProjectSchema.parse({ account_id: crypto.randomUUID(), label: 'x', scope_label: '   ' }).scope_label,
    ).toBeNull()
  })

  it('borne la longueur', () => {
    expect(
      createProjectSchema.safeParse({ account_id: crypto.randomUUID(), label: 'x', scope_label: 'x'.repeat(201) })
        .success,
    ).toBe(false)
  })

  it('PATCH /projects/:id/scope — accepte, efface (null), rogne, borne', () => {
    expect(updateProjectScopeSchema.parse({ scope_label: '  Projet Refonte  ' })).toEqual({
      scope_label: 'Projet Refonte',
    })
    expect(updateProjectScopeSchema.parse({ scope_label: null })).toEqual({ scope_label: null })
    expect(updateProjectScopeSchema.parse({ scope_label: '   ' })).toEqual({ scope_label: null })
    expect(updateProjectScopeSchema.safeParse({ scope_label: 'x'.repeat(201) }).success).toBe(false)
    expect(updateProjectScopeSchema.safeParse({ scope_label: 'ok', stage: 'won' }).success).toBe(false)
  })

  it('la ligne de projet porte le grain, absent ou null — jamais deviné', () => {
    const shape = projectRowSchema.shape.scope_label
    expect(shape.safeParse(undefined).success).toBe(true)
    expect(shape.safeParse(null).success).toBe(true)
    expect(shape.safeParse('Équipe Data / Site Lyon').success).toBe(true)
  })
})
