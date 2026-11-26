import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_CONTEXT_PRESETS,
  ANALYSIS_CONTEXT_QUESTIONS,
  analysisContextFields,
  analysisContextSchema,
  analysisQuestionsFor,
} from './analysis-context.js'

/**
 * LES QUESTIONS QUE LE COPILOTE POSE AVANT DE LANCER UNE ANALYSE (#1489).
 *
 * ⚠️ Ce qui se garde ici est l'accord entre DEUX listes : les champs que le
 * schéma déclare, et les questions écrites à côté. Une question qui vise un
 * champ disparu ne se plaint jamais — elle se pose, la réponse part dans le
 * vide, et le contexte arrive vide au moteur. Un champ sans question, lui, ne
 * se pose jamais : le commercial n'a aucun moyen de le renseigner par la
 * conversation, et personne ne s'en aperçoit.
 *
 * C'est le même défaut que les libellés de déclencheur du 05/09 — trois
 * libellés qui visaient des valeurs inexistantes, invisibles parce qu'un repli
 * les couvrait.
 */
describe('les questions du copilote couvrent les champs du contexte', () => {
  /**
   * ⚠️ LA PREUVE QUE CETTE GARDE LIT QUELQUE CHOSE. Un registre vide ou un
   * schéma sans champs rendraient les tests suivants verts sans rien vérifier.
   */
  it('lit un corpus réel — sept presets, chacun avec des champs', () => {
    expect(ANALYSIS_CONTEXT_PRESETS.length).toBe(7)
    for (const preset of ANALYSIS_CONTEXT_PRESETS) {
      expect(analysisContextFields(preset).length, preset).toBeGreaterThanOrEqual(1)
    }
  })

  it('chaque champ du schéma a sa question', () => {
    const missing: string[] = []
    for (const preset of ANALYSIS_CONTEXT_PRESETS) {
      for (const field of analysisContextFields(preset)) {
        if (!ANALYSIS_CONTEXT_QUESTIONS[preset][field]) missing.push(`${preset}.${field}`)
      }
    }
    expect(missing, 'champs sans question — impossibles à renseigner en conversation').toEqual([])
  })

  it('aucune question ne vise un champ qui n’existe pas', () => {
    const orphans: string[] = []
    for (const preset of ANALYSIS_CONTEXT_PRESETS) {
      const fields = new Set(analysisContextFields(preset))
      for (const field of Object.keys(ANALYSIS_CONTEXT_QUESTIONS[preset])) {
        if (!fields.has(field)) orphans.push(`${preset}.${field}`)
      }
    }
    expect(orphans, 'questions dont la réponse partirait dans le vide').toEqual([])
  })

  it('chaque question existe dans les DEUX langues', () => {
    const missing: string[] = []
    for (const preset of ANALYSIS_CONTEXT_PRESETS) {
      for (const [field, texts] of Object.entries(ANALYSIS_CONTEXT_QUESTIONS[preset])) {
        if (!texts.fr?.trim()) missing.push(`fr:${preset}.${field}`)
        if (!texts.en?.trim()) missing.push(`en:${preset}.${field}`)
      }
    }
    expect(missing, 'questions non traduites').toEqual([])
  })

  it('chaque question est une QUESTION, pas une étiquette de formulaire', () => {
    // « Offre à pousser » est une étiquette ; « Quelle offre veux-tu pousser ? »
    // est ce qu'on dit à voix haute. Confondre les deux donne un copilote qui
    // parle comme un formulaire.
    const notQuestions: string[] = []
    for (const preset of ANALYSIS_CONTEXT_PRESETS) {
      for (const [field, texts] of Object.entries(ANALYSIS_CONTEXT_QUESTIONS[preset])) {
        if (!texts.fr.trim().endsWith('?')) notQuestions.push(`fr:${preset}.${field}`)
        if (!texts.en.trim().endsWith('?')) notQuestions.push(`en:${preset}.${field}`)
      }
    }
    expect(notQuestions).toEqual([])
  })
})

describe('analysisQuestionsFor', () => {
  it('suit l’ORDRE du schéma, pas celui du registre', () => {
    expect(analysisQuestionsFor('push-offer').map(entry => entry.field)).toEqual(analysisContextFields('push-offer'))
  })

  it('rend l’anglais quand on le demande', () => {
    const [first] = analysisQuestionsFor('signal', 'en')
    expect(first?.question).toMatch(/signal/i)
    expect(first?.question).not.toMatch(/as-tu/)
  })
})

/**
 * ⚠️ LA RÈGLE QUI PERMET « GO » SANS AVOIR TOUT RÉPONDU.
 *
 * Elle n'est pas une politesse d'interface : elle est déjà écrite au contrat,
 * puisque tous les champs sont `optional()`. Ce test est ce qui l'empêche de
 * disparaître le jour où quelqu'un rend un champ obligatoire « parce qu'on l'a
 * toujours » — et ce jour-là, le copilote refuserait de lancer une analyse pour
 * une question sans réponse.
 */
describe('répondre à tout n’est jamais obligatoire', () => {
  it('accepte un contexte où AUCUNE question n’a de réponse', () => {
    for (const preset of ANALYSIS_CONTEXT_PRESETS) {
      expect(() => analysisContextSchema.parse({ preset }), preset).not.toThrow()
    }
  })

  it('accepte un contexte partiellement rempli', () => {
    expect(() => analysisContextSchema.parse({ preset: 'signal', source: 'LesEchos' })).not.toThrow()
  })
})

describe('champs optionnels vides (lancer sans angle)', () => {
  it('accepte une raison de priorisation vide ou blanche et la retire du résultat', () => {
    for (const blank of ['', '   ']) {
      const parsed = analysisContextSchema.safeParse({ preset: 'strategic', prioritizationReason: blank })
      expect(parsed.success).toBe(true)
      if (parsed.success) expect(parsed.data).toEqual({ preset: 'strategic' })
    }
  })

  it('accepte la raison absente', () => {
    expect(analysisContextSchema.safeParse({ preset: 'strategic' }).success).toBe(true)
  })

  it('garde une raison saisie, rognée', () => {
    const parsed = analysisContextSchema.parse({ preset: 'strategic', prioritizationReason: '  Signal fort ' })
    expect(parsed).toEqual({ preset: 'strategic', prioritizationReason: 'Signal fort' })
  })
})

describe('requête de lancement sans angle', () => {
  it('startAnalysisSchema accepte un contexte stratégique à raison vide', async () => {
    const { startAnalysisSchema } = await import('./analysis.js')
    const parsed = startAnalysisSchema.safeParse({
      company_name: 'Boulanger',
      user_context: { preset: 'strategic', prioritizationReason: '' },
    })
    expect(parsed.success).toBe(true)
  })
})
