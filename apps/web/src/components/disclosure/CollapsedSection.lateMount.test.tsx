import { fireEvent, render, screen } from '@testing-library/react'
import { motion } from 'framer-motion'
import { describe, expect, it } from 'vitest'
import { CollapsedSection } from './CollapsedSection'

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }
const cardFade = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.24 } } }

/**
 * #2947.R16 (recette prod 15/10, Doctolib) — « Angles » déplié : une carte, ~400 px de vide. Reproduit en vrai
 * navigateur (Chromium) : un enfant `variants={cardFade}` monté APRÈS l'animation de son parent
 * (`TabPlan` : `stagger`, initial="hidden" animate="visible") hérite `initial="hidden"` mais ne reçoit plus
 * jamais de `visible` — invisible (`opacity: 0`), hauteur réservée. `CollapsedSection` monte TOUJOURS son
 * contenu après coup : c'est LUI qui pose les étiquettes, une seule fois, pour toutes les cartes dépliées.
 */
describe('CollapsedSection — un contenu monté après le parent animé est visible (#2947.R16)', () => {
  it('une carte à `variants` dépliée n’est jamais posée à opacity: 0', () => {
    render(
      <motion.div variants={stagger} initial="hidden" animate="visible">
        <CollapsedSection title="Angles">
          <motion.div variants={cardFade} data-testid="late-card">
            contenu
          </motion.div>
        </CollapsedSection>
      </motion.div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Angles' }))
    const card = screen.getByTestId('late-card')
    expect(card.style.opacity).not.toBe('0')
  })
})
