import type { DailyBriefing } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BriefingHero } from './BriefingHero'

// `UserDropdownMenu` (montée sous 768px, voir plus bas) lit `useNavigate` —
// aucun `RouterProvider` ici, même patron que `Chat.mobile-composer.test.tsx`.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
}))

/**
 * #2097 (27/09/2026) — L'AVATAR DE L'UTILISATEUR, VISIBLE SANS DÉFILER, SOUS
 * 768px.
 *
 * Recette du 27/09 (fenêtre 500px) : aucun avatar en tête d'écran — le premier
 * n'apparaissait qu'à 5 847px de haut, une carte de priorité et non
 * l'utilisateur lui-même. `BriefingHero` — le contrat éditorial de l'écran,
 * voir son propre docblock — est l'en-tête du brief : c'est ICI que l'avatar
 * doit apparaître, sans défiler, sous 768px seulement (le bureau le porte déjà
 * dans la barre latérale, `NavUser` → `UserDropdownMenu` — le répéter là
 * serait « deux fois sous la même forme », loi 4 du tome 7).
 *
 * Ce test échoue si l'avatar disparaît de l'en-tête (retrait accidentel du
 * composant, ou de la condition `isMobile`).
 */

vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({ data: { first_name: 'Louis', last_name: 'Schlegel', avatar_url: null } }),
}))
// `UserDropdownMenu` lit `useAuth` → `useSession` : aucun `SessionProvider`
// ici, même patron que `Chat.mobile-composer.test.tsx` (`useSession: () => ({ user: { id: 'u1' } })`).
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' }, loading: false }) }))

function payload(over: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    date: '2026-09-25',
    timeZone: 'Europe/Paris',
    firstName: 'Louis',
    agenda: { state: 'ready', reason: null, readAt: null, events: [], conflicts: [], needsPreparation: [] },
    mail: { state: 'ready', reason: null, readAt: null, awaitingReply: [], positiveReplies: [], unread: [] },
    tasks: { state: 'ready', reason: null, readAt: null, tasks: [], overdueCount: 0, todayCount: 0 },
    accountsToWatch: [],
    actions: [],
    generatedAt: new Date().toISOString(),
    ...over,
  } as unknown as DailyBriefing
}

describe('BriefingHero — l’avatar de l’utilisateur, sous 768px (#2097)', () => {
  it('rend l’avatar sous 768px — visible sans défiler, dans l’en-tête', () => {
    render(<BriefingHero data={payload()} isMobile />)
    // `UserDropdownMenu` (triggerVariant="avatar") rend un bouton nommé — voir
    // `nav:user.account` — c'est l'avatar de l'utilisateur, jamais celui d'un
    // objet métier (compte/contact).
    expect(screen.getByRole('button', { name: /account|compte/i })).toBeInTheDocument()
  })

  it('ne rend PAS l’avatar sur le bureau — déjà porté par la barre latérale (non-régression)', () => {
    render(<BriefingHero data={payload()} isMobile={false} />)
    expect(screen.queryByRole('button', { name: /account|compte/i })).not.toBeInTheDocument()
  })

  it('sans prop `isMobile` (défaut), l’avatar ne se rend pas — comportement d’avant ce lot', () => {
    render(<BriefingHero data={payload()} />)
    expect(screen.queryByRole('button', { name: /account|compte/i })).not.toBeInTheDocument()
  })

  it('le titre de l’écran reste le seul niveau 1 — l’avatar ne le remplace ni ne le double', () => {
    render(<BriefingHero data={payload({ firstName: 'Louis' })} isMobile />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

/**
 * Théo A today-jour.R1 — le résumé « 2 réponses · 4 relances » et le geste principal ne sont plus ici : c'est la
 * carte « Commencer ici ». Le titre PERSONNALISÉ et la phrase qui nomme le nombre réel de décisions (#2113.8,
 * #2113.13) restent le contrat éditorial de l'écran, gardé aussi par `BriefingFoundation.test.tsx`.
 */
describe('BriefingHero — l’en-tête de « Ta journée » (Théo A today-jour.R1)', () => {
  // Louis 23/10 — « Ta journée » en niveau 1 (la maquette), la phrase personnalisée juste dessous.
  it('porte le titre « Ta journée », la phrase personnalisée et celle qui nomme le nombre réel de décisions', () => {
    render(
      <BriefingHero
        data={payload({ actions: [{ id: 'a1', href: '/accounts/x' }] as unknown as DailyBriefing['actions'] })}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Ta journée$/)
    expect(screen.getByText(/^Bonjour Louis\./)).toBeInTheDocument()
    expect(screen.getByText('1 sujet mérite une décision aujourd’hui.')).toBeInTheDocument()
  })

  it('ne rend plus de résumé dynamique ni de « commencer par la priorité n°1 »', () => {
    render(
      <BriefingHero
        data={payload({ actions: [{ id: 'a1', href: '/accounts/x' }] as unknown as DailyBriefing['actions'] })}
      />,
    )
    expect(screen.queryByTestId('briefing-hero-summary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-hero-cta')).not.toBeInTheDocument()
  })

  it('le geste qui répare une source muette n’est plus dans l’en-tête : il vit dans « Commencer ici »', () => {
    // Théo A today-jour.R1 : `briefing-hero-cta` est porté par `TodayStartCallout` ; son comportement (#2113.10,
    // #2111.49 — le geste suit l’étape qui MANQUE) reste gardé par `BriefingFoundation.test.tsx`.
    render(
      <BriefingHero
        data={payload({
          mail: { state: 'not_connected', reason: null, readAt: null } as unknown as DailyBriefing['mail'],
        })}
      />,
    )
    expect(screen.queryByTestId('briefing-hero-cta')).not.toBeInTheDocument()
  })
})
