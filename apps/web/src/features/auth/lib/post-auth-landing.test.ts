import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserCredits } from '@/features/credits/api'
import { resolveDefaultLandingRoute, type DefaultView } from '@/features/preferences/preferences-provider'
import { resolveLandingFrom } from './post-auth-landing'

// #1786 — `resolveDefaultLandingRoute` reste le VRAI export de
// `preferences-provider.tsx` (`importOriginal`) : on ne veut PAS réimplémenter
// le calcul ici, seulement observer si `resolveLandingFrom` l'appelle bien —
// sinon ce test passerait même si `post-auth-landing.ts` s'était mis à
// recalculer la destination normale par sa propre copie.
vi.mock('@/features/preferences/preferences-provider', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/preferences/preferences-provider')>()
  return { ...actual, resolveDefaultLandingRoute: vi.fn(actual.resolveDefaultLandingRoute) }
})

const credits = (over: Partial<UserCredits> = {}): UserCredits =>
  ({
    plan: 'starter',
    accounts_limit: 80,
    accounts_used: 0,
    enrichments_limit: 0,
    enrichments_used: 0,
    is_demo: false,
    ...over,
  }) as UserCredits

const landing = (over: Partial<{ isMobile: boolean; defaultView: DefaultView }> = {}) => ({
  isMobile: false,
  defaultView: 'accounts' as DefaultView,
  ...over,
})

describe('resolveLandingFrom', () => {
  beforeEach(() => {
    vi.mocked(resolveDefaultLandingRoute).mockClear()
  })

  it('renvoie à Comptes un questionnaire terminé (AUTH-01)', () => {
    expect(resolveLandingFrom({ status: 'completed', skipped_at: null }, credits(), landing())).toBe('/accounts')
  })

  it('renvoie à Comptes un questionnaire explicitement reporté', () => {
    expect(
      resolveLandingFrom({ status: 'in_progress', skipped_at: '2026-08-01T10:00:00Z' }, credits(), landing()),
    ).toBe('/accounts')
  })

  it('envoie au questionnaire un vrai nouveau venu', () => {
    expect(resolveLandingFrom({ status: 'not_started', skipped_at: null }, credits(), landing())).toBe('/onboarding')
  })

  it('ne prend PAS un palier servi pour une réponse au questionnaire (§13)', () => {
    expect(
      resolveLandingFrom(
        { status: 'in_progress', skipped_at: null },
        credits({ plan: 'growth', accounts_used: 12 }),
        landing(),
      ),
    ).toBe('/onboarding')
  })

  it('dépose le visiteur de démonstration dans le produit', () => {
    expect(resolveLandingFrom({ status: 'not_started', skipped_at: null }, credits({ is_demo: true }), landing())).toBe(
      '/accounts',
    )
  })

  it('sans état lisible, ne conclut rien : la destination normale', () => {
    expect(resolveLandingFrom(null, credits(), landing())).toBe('/accounts')
    expect(resolveLandingFrom(null, null, landing())).toBe('/accounts')
  })

  // #1786 — « quand on se connecte à Bellum, c'est sur Laura qu'on doit
  // arriver par défaut ».
  it("un compte déjà onboardé qui n'a jamais touché Réglages atterrit chez Laura", () => {
    expect(
      resolveLandingFrom({ status: 'completed', skipped_at: null }, credits(), landing({ defaultView: 'chat' })),
    ).toBe('/chat')
  })

  it('sur mobile, Laura gagne même si la préférence de bureau est Comptes', () => {
    expect(
      resolveLandingFrom(
        { status: 'completed', skipped_at: null },
        credits(),
        landing({ isMobile: true, defaultView: 'accounts' }),
      ),
    ).toBe('/chat')
  })

  // #1786 — une correction humaine gagne toujours : un choix DÉJÀ fait dans
  // Réglages (Comptes) n'est jamais écrasé par le nouveau défaut (Laura).
  it('garde le choix déjà fait dans Réglages — une correction humaine gagne toujours', () => {
    expect(
      resolveLandingFrom({ status: 'completed', skipped_at: null }, credits(), landing({ defaultView: 'accounts' })),
    ).toBe('/accounts')
  })

  /**
   * #2151.60 — la préférence STOCKÉE « watchlist » survit à la disparition de
   * l'écran, comme « needs » a survécu au renommage en Projets : la clé vit chez
   * chaque utilisateur, la renommer renverrait tout le monde au tableau de bord.
   * Elle mène désormais DIRECTEMENT à « Mes cibles », qui monte la Veille —
   * `/watchlist` n'y serait qu'un détour par une redirection.
   */
  it('une préférence « Veille » déjà enregistrée atterrit sur « Mes cibles » (#2151.60)', () => {
    expect(
      resolveLandingFrom({ status: 'completed', skipped_at: null }, credits(), landing({ defaultView: 'watchlist' })),
    ).toBe('/signals')
  })

  it('témoin : la préférence voisine « needs » garde sa destination', () => {
    expect(
      resolveLandingFrom({ status: 'completed', skipped_at: null }, credits(), landing({ defaultView: 'needs' })),
    ).toBe('/projects')
  })

  it("l'onboarding inachevé garde la priorité même quand la destination normale serait Laura", () => {
    expect(
      resolveLandingFrom({ status: 'not_started', skipped_at: null }, credits(), landing({ defaultView: 'chat' })),
    ).toBe('/onboarding')
  })

  // #1786 — GA-26 : un réglage (ici, une DÉRIVATION) vit à un seul endroit.
  // Si `resolveLandingFrom` se mettait à recalculer isMobile/defaultView → route
  // par sa propre copie plutôt que d'appeler `resolveDefaultLandingRoute`, ce
  // mock ne serait jamais invoqué et ce test échouerait — quand bien même le
  // résultat final resterait correct.
  it('délègue la destination normale à LA dérivation partagée avec HomePage, jamais à une copie locale', () => {
    const result = resolveLandingFrom(
      { status: 'completed', skipped_at: null },
      credits(),
      landing({ isMobile: true, defaultView: 'accounts' }),
    )
    expect(resolveDefaultLandingRoute).toHaveBeenCalledWith(true, 'accounts')
    expect(resolveDefaultLandingRoute).toHaveBeenCalledTimes(1)
    expect(result).toBe('/chat')
  })
})
