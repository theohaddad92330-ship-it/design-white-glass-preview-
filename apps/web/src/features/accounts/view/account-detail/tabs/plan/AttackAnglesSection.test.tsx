import { render, screen, waitFor } from '@testing-library/react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { stagger } from '../../motion'
import { describe, expect, it, vi } from 'vitest'
import { AttackAnglesSection } from './AttackAnglesSection'
import type { AttackAngle } from './planViewData'

vi.mock('@/features/accounts/hooks/useGenerateAttackAngle', () => ({
  useGenerateAttackAngle: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('./ReplanDialog', () => ({ ReplanDialog: () => null }))

/**
 * #1091 — « quand je clique ici, une fenêtre s'affiche mais rien est dedans ».
 *
 * Elle n'était pas vide : elle ne montrait RIEN DE PLUS que la carte. Le point
 * d'entrée, l'offre et le potentiel y figurent déjà en entier ; seule la
 * description est tronquée à trois lignes, donc elle seule justifie d'ouvrir.
 */
describe('AttackAnglesSection — le lien « Voir le détail »', () => {
  const base = { entryPoint: 'projet', offer: 'Approche à qualifier', estimatedDealSize: 'À qualifier' }

  it("n'est pas proposé quand l'angle n'a pas de description", () => {
    // Le cas exact du retour : trois métas vagues, aucune description. Ouvrir
    // ne montrait que ces mêmes trois lignes.
    render(<AttackAnglesSection angles={[{ ...base, title: 'Un angle' } as AttackAngle]} accountId="a1" />)

    expect(screen.queryByRole('button', { name: /voir le détail/i })).toBeNull()
  })

  it('est proposé dès qu’il y a une description à dérouler', () => {
    const angle = { ...base, title: 'Un angle', description: 'Une lecture longue du contexte.' } as AttackAngle
    render(<AttackAnglesSection angles={[angle]} accountId="a1" />)

    expect(screen.getByRole('button', { name: /voir le détail/i })).toBeInTheDocument()
  })
})

/**
 * #2947 (recette R16, Doctolib) — « Angles » déplié : une carte, aucun angle,
 * ~400 px de vide. La section est montée APRÈS l'animation du parent
 * (`TabPlan` : stagger initial=hidden/animate=visible) — au dépliage du
 * `CollapsedSection`. Un enfant `variants={cardFade}` monté si tard n'a pas de
 * changement de label à suivre : il restait à `opacity: 0`, invisible mais
 * réservant sa hauteur. La section doit se rendre visible d'elle-même.
 */
describe('AttackAnglesSection — montée après le parent animé (#2947)', () => {
  function LateParent() {
    const [open, setOpen] = useState(false)
    return (
      <motion.div variants={stagger} initial="hidden" animate="visible">
        <button type="button" onClick={() => setOpen(true)}>
          déplier
        </button>
        {open ? <AttackAnglesSection angles={[]} accountId="a1" /> : null}
      </motion.div>
    )
  }

  it('rend son état vide ET devient visible (opacité > 0), même montée tardivement', async () => {
    render(<LateParent />)
    screen.getByRole('button', { name: 'déplier' }).click()
    const root = (await screen.findByRole('heading', { level: 3 })).closest('div.p-1') as HTMLElement
    expect(screen.getByText(/Aucun angle identifié/)).toBeInTheDocument()
    await waitFor(() => expect(Number(root.style.opacity)).toBeGreaterThan(0))
  })
})
