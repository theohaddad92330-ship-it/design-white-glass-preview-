import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ReviewBlock } from '@/features/onboarding/lib/onboarding-review-blocks'
import { OnboardingReviewBlockCard } from './OnboardingReviewBlockCard'

const CONFIRMED_BLOCK: ReviewBlock = {
  code: 'company',
  titleKey: 'review.blocks.company.title',
  state: 'confirmed',
  editTarget: { stage: 'company_info', slug: 'entreprise' },
  rows: [
    {
      key: 'esn_name',
      labelKey: 'questions.esnName.label',
      value: 'Kicklox',
      state: 'answered',
      status: 'confirmed',
      provenance: null,
      unknownReason: null,
    },
  ],
}

const EMPTY_BLOCK: ReviewBlock = {
  code: 'businessUnit',
  titleKey: 'review.blocks.businessUnit.title',
  state: 'toVerify',
  editTarget: null,
  rows: [],
}

describe('#2030.9/.10/.11 — carte de bloc : état, lignes, Modifier', () => {
  it('affiche le titre et le badge « Confirmé » quand tout est répondu', async () => {
    renderWithRouter(<OnboardingReviewBlockCard block={CONFIRMED_BLOCK} onModify={vi.fn()} />)
    expect(await screen.findByText('Organisation')).toBeInTheDocument()
    expect(screen.getByText('Confirmé')).toBeInTheDocument()
    expect(screen.getByText('Kicklox')).toBeInTheDocument()
  })

  it('appelle onModify avec la cible du bloc au clic sur « Modifier »', async () => {
    const onModify = vi.fn()
    renderWithRouter(<OnboardingReviewBlockCard block={CONFIRMED_BLOCK} onModify={onModify} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    expect(onModify).toHaveBeenCalledWith({ stage: 'company_info', slug: 'entreprise' })
  })

  it('un bloc vide n’a AUCUN bouton Modifier — pas de renvoi deviné (#2030.9)', async () => {
    renderWithRouter(<OnboardingReviewBlockCard block={EMPTY_BLOCK} onModify={vi.fn()} />)
    expect(await screen.findByText('BU')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.getByText('À vérifier')).toBeInTheDocument()
  })
})

describe('#2030.12/.14 — préremplis non confirmés et réponses manquantes', () => {
  it('affiche « Non renseigné » pour une ligne manquante, distinctement de la valeur', async () => {
    const block: ReviewBlock = {
      ...CONFIRMED_BLOCK,
      state: 'toVerify',
      rows: [
        {
          key: 'esn_name',
          labelKey: 'questions.esnName.label',
          value: null,
          state: 'missing',
          status: 'unknown',
          provenance: null,
          unknownReason: null,
        },
      ],
    }
    renderWithRouter(<OnboardingReviewBlockCard block={block} onModify={vi.fn()} />)
    expect(await screen.findByText('Non renseigné')).toBeInTheDocument()
  })

  it('signale une valeur préremplie non confirmée', async () => {
    const block: ReviewBlock = {
      ...CONFIRMED_BLOCK,
      rows: [
        {
          key: 'esn_name',
          labelKey: 'questions.esnName.label',
          value: 'Kicklox',
          state: 'unconfirmedPrefill',
          status: 'proposed',
          provenance: null,
          unknownReason: null,
        },
      ],
    }
    renderWithRouter(<OnboardingReviewBlockCard block={block} onModify={vi.fn()} />)
    expect(await screen.findByText(/prérempli, non confirmé/)).toBeInTheDocument()
  })
})

// #2089.10 — 3 à 6 éléments max par section : au-delà, la carte n'en rend que 6.
describe('#2089.10 — plafond de 6 lignes par bloc', () => {
  it('ne rend jamais plus de 6 lignes, même si le bloc en porte davantage', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      key: `field_${i}`,
      labelKey: `questions.field${i}.label`,
      value: `Valeur ${i}`,
      state: 'answered' as const,
      status: 'confirmed' as const,
      provenance: null,
      unknownReason: null,
    }))
    const block: ReviewBlock = { ...CONFIRMED_BLOCK, rows }
    renderWithRouter(<OnboardingReviewBlockCard block={block} onModify={vi.fn()} />)
    expect(await screen.findByText('Valeur 5')).toBeInTheDocument()
    expect(screen.queryByText('Valeur 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Valeur 8')).not.toBeInTheDocument()
  })
})

// #2089.13 — chaque ÉLÉMENT (pas seulement le bloc) porte son bouton Modifier.
describe('#2089.13 — bouton Modifier par élément', () => {
  it('une ligne dans un bloc câblé porte SON propre bouton Modifier, qui renvoie vers la cible du bloc', async () => {
    const onModify = vi.fn()
    renderWithRouter(<OnboardingReviewBlockCard block={CONFIRMED_BLOCK} onModify={onModify} />)
    // Un bouton « Modifier » de bloc (nom accessible court) + un bouton par
    // ligne (nom accessible qui nomme la ligne, pour rester distinguable).
    expect(await screen.findByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    const rowButton = screen.getByRole('button', {
      name: 'Modifier — Comment s’appelle ton entreprise ou ton activité ?',
    })
    fireEvent.click(rowButton)
    expect(onModify).toHaveBeenCalledWith(CONFIRMED_BLOCK.editTarget)
  })

  it('un bloc sans cible n’a NI bouton de bloc NI bouton de ligne — pas de renvoi deviné', async () => {
    const block: ReviewBlock = {
      ...EMPTY_BLOCK,
      rows: [
        {
          key: 'esn_name',
          labelKey: 'questions.esnName.label',
          value: 'Kicklox',
          state: 'answered',
          status: 'confirmed',
          provenance: null,
          unknownReason: null,
        },
      ],
    }
    renderWithRouter(<OnboardingReviewBlockCard block={block} onModify={vi.fn()} />)
    expect(await screen.findByText('Kicklox')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
  })
})

// #2089.12 — provenance affichée (source + date) sur une ligne proposée.
describe('#2089.12 — provenance affichée sur une ligne proposée', () => {
  it('affiche la source quand la ligne porte une provenance', async () => {
    const block: ReviewBlock = {
      ...CONFIRMED_BLOCK,
      rows: [
        {
          key: 'esn_name',
          labelKey: 'questions.esnName.label',
          value: 'Kicklox',
          state: 'unconfirmedPrefill',
          status: 'proposed',
          provenance: { source: 'pappers', asOfIso: null },
          unknownReason: null,
        },
      ],
    }
    renderWithRouter(<OnboardingReviewBlockCard block={block} onModify={vi.fn()} />)
    expect(await screen.findByText(/registre officiel/)).toBeInTheDocument()
  })

  /**
   * #2089.17 / #2089.19 — les deux statuts qu'aucun autre élément de la ligne
   * ne disait. `confirmed` se lit à la valeur elle-même, `unknown` à
   * « Non renseigné », `proposed` à « prérempli, non confirmé » : les nommer
   * une seconde fois serait la loi 4 (rien deux fois sous la même forme).
   * « À vérifier » et « Contradictoire », eux, n'étaient dits NULLE PART.
   */
  it('#2089.17 — une ligne « À vérifier » le DIT', async () => {
    const block: ReviewBlock = {
      ...CONFIRMED_BLOCK,
      rows: [
        {
          key: 'esn_name',
          labelKey: 'questions.esnName.label',
          value: 'Kicklox',
          state: 'unconfirmedPrefill',
          status: 'toVerify',
          provenance: null,
          unknownReason: null,
        },
      ],
    }
    renderWithRouter(<OnboardingReviewBlockCard block={block} onModify={vi.fn()} />)
    expect(await screen.findByText('À vérifier')).toBeInTheDocument()
  })

  it('#2089.19 — une ligne « Contradictoire » le DIT', async () => {
    const block: ReviewBlock = {
      ...CONFIRMED_BLOCK,
      rows: [
        {
          key: 'esn_name',
          labelKey: 'questions.esnName.label',
          value: 'Kicklox',
          state: 'answered',
          status: 'contradictory',
          provenance: null,
          unknownReason: null,
        },
      ],
    }
    renderWithRouter(<OnboardingReviewBlockCard block={block} onModify={vi.fn()} />)
    expect(await screen.findByText('Contradictoire')).toBeInTheDocument()
  })

  it('#2089.17/.19 — une ligne confirmée ne porte AUCUN de ces deux libellés (témoin)', async () => {
    renderWithRouter(<OnboardingReviewBlockCard block={CONFIRMED_BLOCK} onModify={vi.fn()} />)
    expect(await screen.findByText('Kicklox')).toBeInTheDocument()
    expect(screen.queryByText('Contradictoire')).not.toBeInTheDocument()
    // ⚠️ « À vérifier » est AUSSI le libellé d'état du BLOC : on ne le
    // cherche donc que sur un bloc `confirmed`, sinon le témoin attraperait
    // le badge du bloc et ne prouverait rien.
    expect(screen.queryByText('À vérifier')).not.toBeInTheDocument()
  })
})
