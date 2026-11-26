import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StructuredReply } from '../StructuredReply'

/**
 * #3763.1 (recette prod 08/10, 8c42a4032c) — la carte verdict (celle que
 * Laura rend le plus souvent, pas le gabarit markdown) ne pliait RIEN : 0
 * `<details>`, 0 « Voir pourquoi », et le libellé restait « Limites » au lieu
 * de « Ce qui manque ». `ReplyDisclosure`/`detailKindOf` existaient déjà
 * (#3763, lots J19/K03) mais n'étaient câblés que sur le gabarit markdown
 * (`StructuredReply`/`SectionBody`) — jamais sur `VerdictCard`.
 */
const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

const VERDICT_MANY_REASONS = {
  type: 'verdict',
  conclusion: 'Commence par le compte Alpha cette semaine.',
  reasons: [
    "Un appel d'offres est ouvert jusqu'au 30 septembre.",
    'Deux consultants du vivier sont disponibles.',
    'Le sponsor budgétaire a confirmé son intérêt.',
    'Un concurrent a été évincé du dernier appel.',
  ],
  limits: ["Le budget n'est pas confirmé."],
}

describe('VerdictCard — progressive disclosure (#3763.1)', () => {
  it('niveau 1 : la raison courte et « Ce qui manque » restent visibles, rien n’est caché', () => {
    render(<StructuredReply text={fence(VERDICT_MANY_REASONS)} />)
    expect(screen.getByText(VERDICT_MANY_REASONS.reasons[0])).toBeVisible()
    expect(screen.getByText("Le budget n'est pas confirmé.")).toBeVisible()
    expect(screen.getByText('Ce qui manque')).toBeInTheDocument()
    expect(screen.queryByText('Limites')).not.toBeInTheDocument()
  })

  it('niveau 2 : la preuve au-delà des 3 premières raisons se plie derrière « Voir pourquoi »', async () => {
    const user = userEvent.setup()
    render(<StructuredReply text={fence(VERDICT_MANY_REASONS)} />)
    expect(screen.queryByText(VERDICT_MANY_REASONS.reasons[3])).toBeNull()
    const button = screen.getByRole('button', { name: 'Voir pourquoi' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(screen.getByText(VERDICT_MANY_REASONS.reasons[3])).toBeVisible()
  })

  it('« Ce qui manque » ne se plie jamais, même avec « Voir pourquoi » affiché', () => {
    render(<StructuredReply text={fence(VERDICT_MANY_REASONS)} />)
    expect(screen.getByRole('button', { name: 'Voir pourquoi' })).toBeInTheDocument()
    expect(screen.getByText("Le budget n'est pas confirmé.")).toBeVisible()
  })

  it('peu de raisons (≤3) : aucun bouton « Voir pourquoi », tout reste ouvert', () => {
    render(
      <StructuredReply
        text={fence({
          type: 'verdict',
          conclusion: 'Go.',
          reasons: ['Une raison.', 'Une autre raison.'],
        })}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Voir pourquoi' })).toBeNull()
  })

  // #3763 (recette prod 09/10, lot V18/R23) — « une seule raison » n'a jamais pu
  // être observée en prod côté recetteur ; le lot V18 avait DÉJÀ tranché, sans
  // Louis, de ne jamais afficher « Voir pourquoi » sans rien derrière (« on
  // n'affiche pas ce qu'on n'a pas »). Ce cas existe déjà, scripté, en salle
  // démo (`demo-chat-script.ts:988`, « p-talent-duplicate ») — ce test fixe le
  // comportement de la carte elle-même, pour que la recette n'ait plus besoin
  // d'un fil prod précis pour l'observer.
  it('une seule raison : la raison reste visible directement, aucun bouton « Voir pourquoi » muet', () => {
    render(
      <StructuredReply
        text={fence({
          type: 'verdict',
          conclusion: 'Ambigu : à confirmer avant toute décision.',
          reasons: [
            'Ces deux fiches portent le même nom, et rien d’autre ne concorde : ce n’est pas suffisant pour dire qu’il s’agit de la même personne.',
          ],
        })}
      />,
    )
    expect(
      screen.getByText(
        'Ces deux fiches portent le même nom, et rien d’autre ne concorde : ce n’est pas suffisant pour dire qu’il s’agit de la même personne.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Voir pourquoi' })).toBeNull()
  })
})
