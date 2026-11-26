import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { findSubStep, type Question } from '@/features/onboarding/lib/questions'
import { QuestionField } from './QuestionField'

/**
 * #2031.5 / #2045.5 — décision Louis 18/09/2026 : « PROPOSER sans remplir ».
 *
 * Le questionnaire d'entrée ne peut pas préremplir `target_sectors` /
 * `geo_zones` depuis le CRM branché (catalogue fermé `ESN_ANSWER_OPTIONS`,
 * aucune table de correspondance vers le vocabulaire d'un CRM — la fabriquer
 * serait deviner une équivalence, pas la lire). Ce que la décision débloque :
 * MONTRER le vocabulaire BRUT du CRM, jamais l'écrire à la place de la
 * personne.
 *
 * Le test qui compte est le deuxième : `onChange` ne doit JAMAIS être appelé
 * quand le CRM répond avec des valeurs — il aurait échoué (ROUGE) sur une
 * implémentation qui, par erreur, aurait coché une réponse depuis
 * `useCrmVocabulary` (ex. un `useEffect` qui pousserait les valeurs trouvées
 * dans `onChange`).
 */

const TARGET_SECTORS = findSubStep('target_market', 'secteurs')?.questions[0] as Question
const GEO_ZONES = findSubStep('target_market', 'cibles')?.questions[1] as Question

const vocabulary = vi.fn()
vi.mock('@/features/crm/hooks/useCrmVocabulary', () => ({ useCrmVocabulary: () => vocabulary() }))

const onChange = vi.fn()

beforeEach(() => {
  onChange.mockReset()
  vocabulary.mockReset()
})

describe('CrmVocabularyHint — le CRM propose, il ne remplit jamais', () => {
  it('montre le vocabulaire BRUT du CRM branché, dans ses propres mots (jamais traduit vers le catalogue)', async () => {
    vocabulary.mockReturnValue({ data: { provider: 'hubspot', industries: ['COMPUTER_SOFTWARE'], countries: [] } })
    renderWithRouter(<QuestionField question={TARGET_SECTORS} value={[]} onChange={onChange} />)
    // Le code BRUT HubSpot est affiché tel quel — jamais une valeur du
    // catalogue fermé (`ESN_ANSWER_OPTIONS.target_sectors`, ex. « Tech &
    // Startups / Scale-ups »), qu'aucune table ne rapproche de lui.
    expect(await screen.findByText(/COMPUTER_SOFTWARE/)).toBeInTheDocument()
    expect(screen.getByText(/HubSpot/)).toBeInTheDocument()
  })

  it("n'écrit AUCUNE réponse toute seule : onChange n'est jamais appelé", async () => {
    vocabulary.mockReturnValue({ data: { provider: 'hubspot', industries: ['COMPUTER_SOFTWARE'], countries: [] } })
    renderWithRouter(<QuestionField question={TARGET_SECTORS} value={[]} onChange={onChange} />)
    await screen.findByText(/COMPUTER_SOFTWARE/)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('montre les pays BRUTS du CRM sur la question geo_zones (countries, jamais industries)', async () => {
    vocabulary.mockReturnValue({
      data: { provider: 'hubspot', industries: ['COMPUTER_SOFTWARE'], countries: ['Andorre'] },
    })
    renderWithRouter(<QuestionField question={GEO_ZONES} value={[]} onChange={onChange} />)
    expect(await screen.findByText(/Andorre/)).toBeInTheDocument()
    expect(screen.queryByText(/COMPUTER_SOFTWARE/)).not.toBeInTheDocument()
  })

  it('rien ne s’affiche quand aucun CRM n’est connecté (jamais un exemple, jamais un repli)', () => {
    vocabulary.mockReturnValue({ data: { provider: null, industries: [], countries: [] } })
    renderWithRouter(<QuestionField question={TARGET_SECTORS} value={[]} onChange={onChange} />)
    expect(screen.queryByText(/HubSpot/)).not.toBeInTheDocument()
  })

  it('rien ne s’affiche quand le CRM est connecté mais muet — jamais un « 0 » déguisé (GA-18/GA-19)', () => {
    vocabulary.mockReturnValue({ data: { provider: 'hubspot', industries: [], countries: [] } })
    renderWithRouter(<QuestionField question={TARGET_SECTORS} value={[]} onChange={onChange} />)
    expect(screen.queryByText(/HubSpot/)).not.toBeInTheDocument()
  })
})
