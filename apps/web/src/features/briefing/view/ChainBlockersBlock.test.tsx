import type { ChainBlocker } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChainBlockersBlock } from './ChainBlockersBlock'

/**
 * #2107.20-.25 — UN BLOCAGE OUVRE SON OBJET, PLUS LA PAGE GÉNÉRIQUE.
 *
 * Avant ce lot, chaque dossier nommé (`sample`) était un texte inerte : seul
 * le CTA du groupe menait quelque part, et toujours vers `/actions/chaines`
 * (#2107.20). Un commercial qui reconnaît « SNCF » dans la liste devait
 * comprendre la page des parcours pour retrouver SNCF — c'est exactement ce
 * que #2107.20 interdit.
 *
 * Chaque dossier ouvre maintenant SON objet réel, par `subjectType` du
 * blocage (le sujet dit quel écran ouvrir, même logique que
 * `interventionHref`, `apps/web/src/features/briefing/cockpit.ts:181`) :
 * account → sa fiche compte, need → sa fiche besoin, consultant → sa fiche
 * talent, mission → sa fiche mission, project → sa fiche projet.
 *
 * #2107.21 — `project` ouvrait la liste générique `/projects` : à l'écriture
 * de ce lot, aucune fiche par identifiant n'existait pour un projet dans ce
 * dépôt. `/projects/$id` existe désormais (fondation de l'épopée #2801,
 * `apps/web/src/routes/projects/$id.tsx`) : le lien mort que ce fichier
 * refusait de fabriquer n'en est plus un.
 *
 * Le CTA du groupe (« voir le parcours ») garde `/actions/chaines` : #2107.26
 * (déjà là) veut que la page Parcours reste une vue avancée SECONDAIRE, pas
 * qu'elle disparaisse.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, hash }: { children: React.ReactNode; to: string; hash?: string }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}))

function blocker(partial: Partial<ChainBlocker>): ChainBlocker {
  return {
    chainKey: 'push_ao_conversion',
    subjectType: 'project',
    position: 2,
    chainLabel: { fr: 'Conversion AO', en: 'Tender conversion' },
    stepLabel: { fr: 'Qualification', en: 'Qualification' },
    gate: null,
    count: 1,
    oldestDays: 9,
    sample: [{ subjectId: 'sub-1', label: 'SNCF', days: 9 }],
    ...partial,
  }
}

describe('ChainBlockersBlock — chaque dossier ouvre son objet réel', () => {
  it('un blocage account ouvre la fiche compte', () => {
    render(
      <ChainBlockersBlock
        blockers={[blocker({ subjectType: 'account', sample: [{ subjectId: 'acc-1', label: 'SNCF', days: 9 }] })]}
      />,
    )
    expect(screen.getByRole('link', { name: 'SNCF' })).toHaveAttribute('href', '/accounts/acc-1')
  })

  it('un blocage need ouvre la fiche besoin', () => {
    render(
      <ChainBlockersBlock
        blockers={[blocker({ subjectType: 'need', sample: [{ subjectId: 'need-1', label: 'DevOps', days: 9 }] })]}
      />,
    )
    expect(screen.getByRole('link', { name: 'DevOps' })).toHaveAttribute('href', '/projects/needs/need-1')
  })

  it('un blocage consultant ouvre la fiche talent', () => {
    render(
      <ChainBlockersBlock
        blockers={[blocker({ subjectType: 'consultant', sample: [{ subjectId: 'cons-1', label: 'Jean', days: 9 }] })]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Jean' })).toHaveAttribute('href', '/consultants/cons-1')
  })

  it('un blocage mission ouvre la fiche mission', () => {
    render(
      <ChainBlockersBlock
        blockers={[blocker({ subjectType: 'mission', sample: [{ subjectId: 'mis-1', label: 'Régie SNCF', days: 9 }] })]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Régie SNCF' })).toHaveAttribute('href', '/missions/mis-1')
  })

  it('un blocage project ouvre la fiche projet (#2107.21)', () => {
    render(
      <ChainBlockersBlock
        blockers={[blocker({ subjectType: 'project', sample: [{ subjectId: 'proj-1', label: 'Orange', days: 9 }] })]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Orange' })).toHaveAttribute('href', '/projects/proj-1')
  })

  it('le CTA du groupe garde la page Parcours en vue secondaire (#2107.26)', () => {
    render(<ChainBlockersBlock blockers={[blocker({})]} />)
    const links = screen.getAllByRole('link')
    expect(links.at(-1)).toHaveAttribute('href', '/pilotage/pipe#parcours')
  })

  it('un dossier sans label reste ouvrable', () => {
    render(
      <ChainBlockersBlock
        blockers={[blocker({ subjectType: 'account', sample: [{ subjectId: 'acc-2', label: null, days: 9 }] })]}
      />,
    )
    const links = screen.getAllByRole('link')
    // le premier lien (le dossier) pointe vers la fiche même sans nom lisible
    expect(links[0]).toHaveAttribute('href', '/accounts/acc-2')
  })
})
