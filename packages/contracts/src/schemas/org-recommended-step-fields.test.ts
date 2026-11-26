import { describe, expect, it } from 'vitest'
import { orgRecommendedStepSchema } from './org-graph.js'

/**
 * #2963 (LAU-FINAL-053, Recommended Path Builder) — une étape du chemin
 * recommandé ne portait que step/personId/objective/channel/unlocks/fallback.
 * L'issue en demande huit par étape (pourquoi maintenant, question à poser,
 * information à obtenir, preuve à mobiliser, résultat attendu, condition de
 * passage, prochaine personne, risque) — constat audit 25/09/2026. Tous
 * optionnels : un dossier antérieur à ce lot n'en porte aucun, jamais devinés.
 */
describe('orgRecommendedStepSchema — champs de l’étape (#2312.2/.4/.5/.6/.8/.9/.10/.12)', () => {
  it('accepte les huit champs neufs, tous optionnels', () => {
    const step = orgRecommendedStepSchema.parse({
      step: 1,
      personId: 'p-dir',
      objective: 'ouvrir la conversation',
      whyNow: 'le programme data vient de démarrer',
      questionToAsk: 'quel est le périmètre du programme ?',
      infoToObtain: "le budget alloué et l'échéance",
      evidenceToUse: 'article sur le lancement du programme',
      expectedResult: 'confirmation du périmètre et introduction au sponsor',
      gatingCondition: 'a confirmé le périmètre',
      nextPersonId: 'p-sponsor',
      risk: 'périmètre encore flou, risque de perdre du temps',
    })
    expect(step.whyNow).toBe('le programme data vient de démarrer')
    expect(step.questionToAsk).toContain('périmètre')
    expect(step.infoToObtain).toContain('budget')
    expect(step.evidenceToUse).toContain('article')
    expect(step.expectedResult).toContain('sponsor')
    expect(step.gatingCondition).toContain('périmètre')
    expect(step.nextPersonId).toBe('p-sponsor')
    expect(step.risk).toContain('flou')
  })

  it('reste valide sans aucun des huit champs (dossier antérieur au lot)', () => {
    const step = orgRecommendedStepSchema.parse({ step: 1, personId: 'p-dir', objective: 'ouvrir la conversation' })
    expect(step.whyNow).toBeUndefined()
    expect(step.nextPersonId).toBeUndefined()
    expect(step.risk).toBeUndefined()
  })
})
