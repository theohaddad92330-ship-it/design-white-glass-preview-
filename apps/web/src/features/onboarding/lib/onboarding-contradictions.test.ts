import type { TFunction } from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import type { QuestionnaireContradiction } from '@bellum/contracts'
import { TEMPS1_CATALOGUE_SUBSTEPS } from '@/features/onboarding/lib/questions'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

/**
 * #2085.24 — GARDE « branchements » : le référent est le seul branchement
 * réel de ce fichier — `editTargetForKeys` (interne, appelée par
 * `buildQuestionnaireContradictions`) choisit vers QUELLE sous-étape
 * « Corriger » renvoie parmi plusieurs clés en tension possibles.
 *
 * Décision (25/09, ce lot) après trois reconfirmations (16/09, 22/09 ×2,
 * 23/09) sans référent unique : `useOnboardingNavigation.ts` pilote une
 * séquence LINÉAIRE (pas un branchement) — écarté. La seule fonction de ce
 * périmètre qui choisit RÉELLEMENT entre plusieurs cibles selon les données
 * est celle-ci : elle prend la PREMIÈRE clé en tension qui a une sous-étape
 * réelle au catalogue, jamais une clé devinée, et rend `null` plutôt qu'une
 * cible fausse quand aucune ne correspond.
 *
 * `detectQuestionnaireContradictions` est mocké pour composer des clés
 * arbitraires (présentes/absentes du catalogue) sans dépendre des seuils
 * réels des huit détecteurs — ce test vise le BRANCHEMENT, pas la détection.
 */
vi.mock('@bellum/contracts', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, detectQuestionnaireContradictions: vi.fn() }
})

const { detectQuestionnaireContradictions } = await import('@bellum/contracts')
const { buildQuestionnaireContradictions } = await import('./onboarding-contradictions')

const detectMock = vi.mocked(detectQuestionnaireContradictions)
const t = ((key: string) => key) as unknown as TFunction<'onboarding'>
const ANSWERS: OnboardingAnswers = {}

function substepFor(key: string) {
  const sub = TEMPS1_CATALOGUE_SUBSTEPS.find(s => s.questions.some(q => q.key === key))
  if (!sub) throw new Error(`clé absente du catalogue dans ce test : ${key}`)
  return { stage: sub.stageCode, slug: sub.slug }
}

function contradiction(keys: string[]): QuestionnaireContradiction[] {
  return [{ id: 'small_team_many_sectors', keys }] as unknown as QuestionnaireContradiction[]
}

describe('onboarding-contradictions — editTarget (branchements, #2085.24)', () => {
  it('résout vers la PREMIÈRE clé en tension présente au catalogue, pas une autre', () => {
    detectMock.mockReturnValue(contradiction(['sales_team_size', 'target_sectors']))
    const [view] = buildQuestionnaireContradictions(ANSWERS, t)
    expect(view.editTarget).toEqual(substepFor('sales_team_size'))
    expect(view.editTarget).not.toEqual(substepFor('target_sectors'))
  })

  it('saute une clé absente du catalogue pour retomber sur la suivante', () => {
    detectMock.mockReturnValue(contradiction(['cle_inexistante', 'target_sectors']))
    const [view] = buildQuestionnaireContradictions(ANSWERS, t)
    expect(view.editTarget).toEqual(substepFor('target_sectors'))
  })

  it("rend null quand AUCUNE clé en tension n'a de sous-étape réelle — jamais une cible devinée", () => {
    detectMock.mockReturnValue(contradiction(['cle_inexistante', 'autre_inexistante']))
    const [view] = buildQuestionnaireContradictions(ANSWERS, t)
    expect(view.editTarget).toBeNull()
  })
})
