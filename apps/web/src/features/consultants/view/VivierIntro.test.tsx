import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetLauraIntro, useCurrentLauraIntro } from '@/features/laura/bubble/laura-intro-store'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
// #2182.4 — `ScreenIntro` lit le prénom via `useFirstName` → `useProfile` →
// `useSession`, qui exige un `SessionProvider` réel. Hors sujet ici : la
// copie personnalisée a son propre test (`vivier-intro-copy.test.tsx`).
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
// Bureau, déterministe — même convention que `AskLaura.test.tsx` : sur
// mobile, `AskLaura` garde toujours son lien, ce qui masquerait le défaut visé
// ici (le dépôt vers la bulle, pas le lien de repli).
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => false }))

const { VivierIntro } = await import('./VivierIntro')

/** Lit ce que le magasin partagé de Laura contient — la preuve du DÉPÔT. */
function IntroReader() {
  const intro = useCurrentLauraIntro()
  return <span data-testid="intro">{intro ? `${intro.question}|${intro.label}` : 'rien'}</span>
}

afterEach(() => {
  cleanup()
  resetLauraIntro()
})

/**
 * #2182.14 / #2182.15 — les CTA de l'entête du Vivier.
 *
 * Aucun n'invente un second mécanisme : le
 * secondaire « Chercher un profil » donne le focus à la recherche DÉJÀ posée
 * par `TalentFilters`, et « Demander à Laura » est la primitive partagée. Ces
 * tests posent les CIBLES RÉELLES dans le DOM et vérifient l'effet, pas
 * seulement la présence du bouton.
 */
describe('VivierIntro — les CTA (#2182.12, #2182.14, #2182.15)', () => {
  it('#3556 — aucun bouton d’import dans l’entête : il vit dans la modale « Importer »', () => {
    render(<VivierIntro />)
    expect(screen.queryByRole('button', { name: /Importer/ })).not.toBeInTheDocument()
  })

  it('refonte Théo — le h1 « Vivier », la phrase de la maquette, et les actions À DROITE', () => {
    render(<VivierIntro actions={<button type="button">Ajouter un profil</button>} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vivier')
    expect(
      screen.getByText(
        'Retrouver les bonnes expertises, vérifier la disponibilité, préparer le prochain positionnement.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter un profil' })).toBeInTheDocument()
  })

  it('« Chercher un profil » n’existe plus : la recherche ouvre la barre, toujours visible', () => {
    render(<VivierIntro />)
    expect(screen.queryByRole('button', { name: 'Chercher un profil' })).not.toBeInTheDocument()
  })

  it('#2182.15 — « Demander à Laura » dépose la question dans le magasin partagé', () => {
    render(
      <>
        <VivierIntro />
        <IntroReader />
      </>,
    )
    expect(screen.getByTestId('intro')).toHaveTextContent(
      'Aide-moi à retrouver le bon profil dans mon vivier.|Demander à Laura',
    )
  })
})
