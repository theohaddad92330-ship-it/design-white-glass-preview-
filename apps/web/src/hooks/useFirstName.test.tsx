import { renderHook } from '@testing-library/react'

/**
 * #1315 · #1316 · #1319 · #1320 · #1321 · #1322 · #1323 · #1329 · #1332 —
 * NEUF retours du 02/09 demandent le même entête personnalisé.
 *
 * Chacun l'écrit avec un prénom EN DUR : « Tes favoris, Louis », « Tes
 * partenaires, Maëlle », « Ton pipe commercial, Maëlle ». Livrer ces chaînes
 * telles quelles afficherait le prénom de quelqu'un d'autre à tous les autres
 * membres de l'espace — c'est le piège du littéral, et il se corrige ici, une
 * fois, plutôt que neuf fois à l'écran.
 *
 * ⚠️ Le calcul existait DÉJÀ, recopié à l'identique dans trois fichiers
 * (`DashboardHeader`, `PersonalCockpit`, `useDashboardCockpit`) et sous une
 * QUATRIÈME forme dans `WelcomeScreen` (`?.trim() ?? ''`). Quatre endroits,
 * deux règles. En ajouter neuf en aurait fait treize : un réglage vit à UN
 * seul endroit (loi 1 du tome 7, GA-26).
 */

const profile = { data: undefined as { first_name?: string | null } | undefined }
const session = { user: undefined as { email?: string | null } | undefined }

vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => profile }))
const credits = { data: undefined as { is_demo?: boolean } | undefined }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => session }))
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => credits }))

const { useFirstName } = await import('./useFirstName')

describe('le prénom de la personne connectée', () => {
  beforeEach(() => {
    profile.data = undefined
    session.user = undefined
    credits.data = undefined
  })

  // R21-FIX point 3 (15/10) : en démo, jamais le prénom du compte réel qui visite.
  it('en salle démo : la persona, jamais le prénom du compte réel', () => {
    credits.data = { is_demo: true }
    profile.data = { first_name: 'Louis' }
    session.user = { email: 'louis@bellum-it.com' }

    expect(renderHook(() => useFirstName()).result.current).toBe('Maëlle')
  })

  it('vient du PROFIL quand il y est', () => {
    profile.data = { first_name: 'Maëlle' }
    session.user = { email: 'maelle@bellum-it.com' }

    expect(renderHook(() => useFirstName()).result.current).toBe('Maëlle')
  })

  it('retombe sur le début de l’e-mail quand le profil n’a pas de prénom', () => {
    profile.data = { first_name: null }
    session.user = { email: 'louis@bellum-it.com' }

    expect(renderHook(() => useFirstName()).result.current).toBe('louis')
  })

  it('traite un prénom BLANC comme absent — «   » n’est pas un prénom', () => {
    profile.data = { first_name: '   ' }
    session.user = { email: 'louis@bellum-it.com' }

    // C'est la divergence qui existait : trois fichiers acceptaient «   »
    // (`||` ne voit qu'une chaîne vide), un seul le nettoyait.
    expect(renderHook(() => useFirstName()).result.current).toBe('louis')
  })

  it('rend une chaîne VIDE quand on ne sait rien — jamais « Utilisateur »', () => {
    // Un entête qui dit « Tes favoris, Utilisateur » est pire que « Tes
    // favoris » : il annonce une personnalisation qu'il n'a pas. L'appelant
    // choisit la formule sans prénom, il ne reçoit pas un faux prénom.
    expect(renderHook(() => useFirstName()).result.current).toBe('')
  })

  it('ne prend pas le domaine pour un prénom sur un e-mail sans arobase', () => {
    session.user = { email: 'pasunemail' }

    expect(renderHook(() => useFirstName()).result.current).toBe('pasunemail')
  })
})
