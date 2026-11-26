import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CvImportNextSteps } from './CvImportNextSteps'

// #2197.43 — même parti pris que les autres écrans qui posent `<AskLaura>` :
// la bulle du copilote a ses propres tests, celui-ci prouve seulement que le
// GESTE est proposé.
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

/**
 * #2183.52/.53/.54/.55 — les quatre CTA après un import de CV/CSV.
 * #2326.25 (épopée #2794) — le CTA nomme désormais le COMPTE réel plutôt
 * qu'un « voir » générique.
 *
 * Ce que ces tests protègent : « Traiter les N exceptions » n'apparaît QUE
 * s'il y a des exceptions à traiter (jamais un lien mort vers une liste
 * vide, jamais un bouton qui dit « 0 »), et les trois autres sont TOUJOURS
 * là ; et le nombre affiché est bien celui reçu, singulier compris.
 */
describe('CvImportNextSteps', () => {
  it('montre les CTA permanents, sans « Traiter les exceptions » quand il n’y en a pas', async () => {
    renderWithRouter(<CvImportNextSteps reviewCount={0} />)

    expect(await screen.findByRole('link', { name: /Voir le Vivier/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Traiter/ })).not.toBeInTheDocument()
    // #3962 (décision Louis 10/10) : la vue « À réveiller » n'existe plus, son CTA non plus.
    expect(screen.queryByRole('link', { name: /analyse de disponibilité/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Demander à Laura/ })).toBeInTheDocument()
  })

  it('nomme le compte exact quand il y a plusieurs exceptions', async () => {
    renderWithRouter(<CvImportNextSteps reviewCount={7} />)

    expect(await screen.findByRole('link', { name: /Traiter les 7 exceptions/ })).toBeInTheDocument()
  })

  it('accorde au singulier quand il n’y en a qu’une', async () => {
    renderWithRouter(<CvImportNextSteps reviewCount={1} />)

    expect(await screen.findByRole('link', { name: /Traiter l’exception/ })).toBeInTheDocument()
  })

  it('golden journey 3 — cliquer un lien prévient l’appelant, pour qu’il ferme son dialogue', async () => {
    const onNavigate = vi.fn()
    renderWithRouter(<CvImportNextSteps reviewCount={2} onNavigate={onNavigate} />)

    fireEvent.click(await screen.findByRole('link', { name: /Traiter les 2 exceptions/ }))

    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
