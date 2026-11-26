import { describe, expect, it } from 'vitest'
import { PIPELINE_STAGES, PROJECT_STAGES } from './project.js'
import { effectsForMove } from './stage-move.js'

/**
 * Le tableau des effets d'un déplacement d'étape (PDF 2 §8.5).
 *
 * Ce que ces tests tiennent, et que le document répète : rien n'est
 * PRÉ-COCHÉ au-delà du niveau N1, aucun envoi externe n'est pré-coché, et une
 * perte exige son motif. Une case pré-cochée qui envoie un e-mail est la seule
 * faute de cet écran qui ne se rattrape pas.
 */
describe('effectsForMove', () => {
  it('couvre les neuf étapes — une destination sans effets laisserait un panneau vide', () => {
    for (const stage of PROJECT_STAGES) {
      const effects = effectsForMove('qualified', stage)
      expect(effects).toBeTruthy()
      expect(Array.isArray(effects.proposals)).toBe(true)
    }
  })

  it('ne pré-coche JAMAIS un envoi externe', () => {
    for (const stage of PROJECT_STAGES) {
      for (const proposal of effectsForMove('qualified', stage).proposals) {
        if (proposal.external) expect(proposal.checked).toBe(false)
      }
    }
  })

  it('ne pré-coche que du niveau N1', () => {
    for (const stage of PROJECT_STAGES) {
      for (const proposal of effectsForMove('qualified', stage).proposals) {
        if (proposal.checked) expect(proposal.level).toBe('n1')
      }
    }
  })

  it('exige un motif pour une perte, et seulement là', () => {
    expect(effectsForMove('negotiation', 'lost').reasonRequired).toBe(true)
    for (const stage of PIPELINE_STAGES) {
      expect(effectsForMove('qualified', stage).reasonRequired).toBe(false)
    }
    // Dormant pose une QUESTION (« quand revoit-on ça ? ») sans exiger de motif :
    // mettre en veille n'est pas une décision qu'on justifie, c'est une décision
    // qu'on date.
    expect(effectsForMove('qualified', 'dormant').reasonRequired).toBe(false)
  })

  it('dit ce qui change mécaniquement en base', () => {
    expect(effectsForMove('negotiation', 'won').changes).toContain('outcome')
    expect(effectsForMove('negotiation', 'won').changes).toContain('closed_at')
    // Rouvrir efface la clôture : « gagné le 3 mars » sur un projet redevenu en
    // négociation est un mensonge que personne ne remarque.
    expect(effectsForMove('won', 'negotiation').changes).toContain('closed_at')
  })

  it('signale le retour arrière depuis « gagné » — la mission existe peut-être déjà', () => {
    const back = effectsForMove('won', 'negotiation')
    expect(back.warnsAboutMission).toBe(true)
    expect(effectsForMove('qualified', 'confirmed').warnsAboutMission).toBe(false)
  })

  it('porte les vérifications de la destination, jamais une liste vide déguisée', () => {
    expect(effectsForMove('potential', 'qualified').checks.length).toBeGreaterThan(0)
    expect(effectsForMove('qualified', 'confirmed').checks.length).toBeGreaterThan(0)
  })
})
