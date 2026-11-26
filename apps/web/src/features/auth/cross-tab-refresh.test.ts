import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Revue sécurité de session-tient-24h (15/09/2026) — deux durcissements sur la
 * marque `bellum.auth.renewed` : elle vit dans `localStorage`, donc n'importe
 * quel script de MÊME ORIGINE peut l'écrire, pas seulement le code de ce
 * fichier.
 *
 * 1. Un `at` dans le futur ferait croire à `renewedSince` qu'un renouvellement
 *    vient TOUJOURS de se produire (`mark.at >= since` est vrai pour tout
 *    `since` passé) : plus aucun `/auth/refresh` n'est jamais rappelé.
 * 2. Un `expiresAt` fantaisiste ferait croire à une session vivante bien
 *    au-delà de la durée de vie réelle d'un access Supabase (1 h — voir
 *    `apps/api/src/supabase/supabase.service.spec.ts`).
 * 3. Quand l'onglet CONNAÎT son identité (démo à côté d'un vrai compte), une
 *    marque sans `userId` ou avec un autre ne doit plus compter pour lui —
 *    avant le correctif, l'absence de `userId` passait.
 */

const TAB_IDENTITY_KEY = 'bellum.tab.user'
const RENEWAL_MARK_KEY = 'bellum.auth.renewed'
const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const T0 = new Date('2026-09-15T19:00:00Z').getTime()

async function freshModule() {
  vi.resetModules()
  return import('./cross-tab-refresh')
}

function writeMark(mark: { at: number; expiresAt?: number | null; userId?: string | null }): void {
  window.localStorage.setItem(RENEWAL_MARK_KEY, JSON.stringify(mark))
}

describe('cross-tab-refresh — une marque forgée par un script de même origine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepte une marque honnête : renouvellement vu, échéance connue (témoin — la garde ne doit pas tout refuser)', async () => {
    const { renewedSince } = await freshModule()
    writeMark({ at: T0, expiresAt: T0 + 3_000_000, userId: null })

    const mark = renewedSince(T0 - 1)

    expect(mark).not.toBeNull()
    expect(mark?.expiresAt).toBe(T0 + 3_000_000)
  })

  it("rejette un `at` dans le futur au-delà de la tolérance d'horloge : sinon le refresh ne serait plus jamais rappelé", async () => {
    const { renewedSince } = await freshModule()
    // Un script de la page a écrit une marque « renouvelée dans 10 s » : sans
    // le correctif, `mark.at >= since` reste vrai indéfiniment.
    writeMark({ at: T0 + 10_000, expiresAt: null, userId: null })

    expect(renewedSince(T0 - 1)).toBeNull()
  })

  it("tolère un petit écart d'horloge légitime (< 5 s) entre onglets", async () => {
    const { renewedSince } = await freshModule()
    writeMark({ at: T0 + 2_000, expiresAt: null, userId: null })

    expect(renewedSince(T0 - 1)).not.toBeNull()
  })

  it("plafonne un `expiresAt` fantaisiste à la durée de vie maximale d'un access token", async () => {
    const { renewedSince } = await freshModule()
    const farFuture = T0 + 365 * 24 * 60 * 60 * 1000 // un an — aucun access Supabase ne vit ça
    writeMark({ at: T0, expiresAt: farFuture, userId: null })

    const mark = renewedSince(T0 - 1)

    expect(mark).not.toBeNull()
    expect(mark?.expiresAt).not.toBeNull()
    expect(mark!.expiresAt!).toBeLessThan(farFuture)
    expect(mark!.expiresAt!).toBeLessThanOrEqual(T0 + 3_600_000)
  })

  it("ignore une marque sans userId quand l'onglet connaît son identité", async () => {
    window.sessionStorage.setItem(TAB_IDENTITY_KEY, USER_A)
    const { renewedSince } = await freshModule()
    writeMark({ at: T0, expiresAt: T0 + 1_000_000, userId: null })

    expect(renewedSince(T0 - 1)).toBeNull()
  })

  it("ignore une marque d'un autre utilisateur quand l'onglet connaît son identité", async () => {
    window.sessionStorage.setItem(TAB_IDENTITY_KEY, USER_A)
    const { renewedSince } = await freshModule()
    writeMark({ at: T0, expiresAt: T0 + 1_000_000, userId: USER_B })

    expect(renewedSince(T0 - 1)).toBeNull()
  })

  it("compte une marque du MÊME utilisateur quand l'onglet connaît son identité (témoin)", async () => {
    window.sessionStorage.setItem(TAB_IDENTITY_KEY, USER_A)
    const { renewedSince } = await freshModule()
    writeMark({ at: T0, expiresAt: T0 + 1_000_000, userId: USER_A })

    expect(renewedSince(T0 - 1)).not.toBeNull()
  })

  it('sans identité connue pour cet onglet, une marque sans userId compte toujours (comportement inchangé hors démo)', async () => {
    const { renewedSince } = await freshModule()
    writeMark({ at: T0, expiresAt: T0 + 1_000_000, userId: null })

    expect(renewedSince(T0 - 1)).not.toBeNull()
  })
})
