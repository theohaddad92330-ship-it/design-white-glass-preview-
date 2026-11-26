import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'
import type { Question } from '@/features/onboarding/lib/questions'
import { QuestionField } from './QuestionField'

/**
 * #2024.5 — « priorité 1 / priorité 2 plutôt qu'une sélection indifférenciée ».
 *
 * Ce que le dépôt savait DÉJÀ faire, et qui ne suffisait pas : l'ordre
 * d'insertion portait la priorité (#2088.9 a même ajouté les flèches pour le
 * corriger), mais il ne se LISAIT nulle part. Vingt cases cochées se
 * ressemblent toutes, et c'est exactement le constat du retour.
 *
 * Les trois bords : elle sait dire OUI (le rang s'affiche, la relance apparaît
 * au-delà du seuil), elle sait dire NON (sous le seuil, aucune relance), et
 * elle n'attrape pas ce qu'elle ne vise pas (une question multi SANS `priority`
 * garde son rendu d'avant, à l'octet près).
 */

const AVEC_PRIORITE: Question = {
  key: 'target_sectors',
  kind: 'multi',
  label: 'questions.targetSectors.label',
  choices: [{ value: 'Banque' }, { value: 'Industrie' }, { value: 'Santé' }],
  priority: { nudgeAbove: 2 },
}

const SANS_PRIORITE: Question = {
  key: 'expertise_areas',
  kind: 'multi',
  label: 'questions.expertiseAreas.label',
  choices: [{ value: 'Banque' }, { value: 'Industrie' }, { value: 'Santé' }],
}

describe('#2024.5 — la sélection est ordonnée, et l’ordre se LIT', () => {
  it('le corpus n’est pas vide : une question RÉELLE du parcours porte le champ', () => {
    const reelles = TEMPS1_SUBSTEPS.flatMap(step => step.questions).filter(q => 'priority' in q && q.priority)
    expect(reelles.map(q => q.key)).toContain('target_sectors')
    // `target_sectors` est justement la question de « pas vingt prioritaires ».
    expect(reelles.every(q => (q as { priority: { nudgeAbove: number } }).priority.nudgeAbove >= 1)).toBe(true)
  })

  it('affiche le RANG de chaque choix retenu, dans l’ordre de la sélection', () => {
    render(<QuestionField question={AVEC_PRIORITE} value={['Industrie', 'Banque']} onChange={() => undefined} />)

    expect(screen.getByText(/Priorité 1/)).toBeInTheDocument()
    expect(screen.getByText(/Priorité 2/)).toBeInTheDocument()
  })

  it('RELANCE au-delà du seuil, sans rien bloquer ni rien retirer', () => {
    render(
      <QuestionField question={AVEC_PRIORITE} value={['Banque', 'Industrie', 'Santé']} onChange={() => undefined} />,
    )

    const relance = screen.getByRole('status')
    expect(relance).toHaveTextContent(/Au-delà de 2 priorités, plus rien n'est prioritaire/)
    // Les trois choix restent cochables et retirables : la relance n'agit pas.
    expect(screen.getAllByRole('button', { name: /Retirer/ })).toHaveLength(3)
  })

  it('SAIT DIRE NON — sous le seuil, aucune relance', () => {
    render(<QuestionField question={AVEC_PRIORITE} value={['Banque', 'Industrie']} onChange={() => undefined} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('LE TÉMOIN — une question multi sans `priority` n’affiche ni rang ni relance', () => {
    render(
      <QuestionField question={SANS_PRIORITE} value={['Banque', 'Industrie', 'Santé']} onChange={() => undefined} />,
    )

    expect(screen.queryByText(/Priorité 1/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
