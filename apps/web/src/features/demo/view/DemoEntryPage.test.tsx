import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionResponse } from '@bellum/contracts'
import { demoApi } from '@/features/demo/api'
import { ApiError } from '@/lib/api-error'
import { clearVolatileUserState } from '@/features/auth/clear-client-user-state'
import { clearPersistedQueryCache } from '@/lib/cache/idb/tanstack-persister'
import { DemoTimeoutError } from '@/features/demo/demo-timeout'
import { DemoEntryPage } from './DemoEntryPage'

vi.mock('@/features/demo/api', () => ({ demoApi: { redeem: vi.fn(), leadTouch: vi.fn() } }))
vi.mock('@/features/auth/components/AuthBrandingPanel', () => ({ AuthBrandingPanel: () => null }))
vi.mock('@/lib/cache/idb/tanstack-persister', () => ({
  clearPersistedQueryCache: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/features/auth/clear-client-user-state', () => ({ clearVolatileUserState: vi.fn() }))

/** Une session de démonstration telle que l'API la rend. Le test n'a besoin
 *  d'aucun de ces champs — la page recharge la fenêtre — mais les écrire évite
 *  de mentir au compilateur sur la forme de la réponse. */
const REDEEMED: SessionResponse = {
  access_token: 'demo-token',
  expires_at: null,
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'demo@bellum.example',
    created_at: '2026-08-02T00:00:00.000Z',
    roles: ['customer'],
  },
}

const replace = vi.fn()
const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { replace, assign, href: 'http://localhost/demo', search: '' },
  })
  // #2705.6 — la majorité des tests existants de ce fichier couvrent le
  // chemin de redemption directe : par défaut, le cookie porte déjà un lead
  // (visiteur qui revient), comme AVANT ce lot. Les tests §2705 ci-dessous
  // écrasent cette valeur pour couvrir le visiteur INCONNU.
  vi.mocked(demoApi.leadTouch).mockResolvedValue({ found: true })
})

/** The CTA that opens the demo — matched on both locales. */
function startButton() {
  return screen.getByRole('button', { name: /^(lancer la démo|start the demo)$/i })
}

/** #4291 J — le second bouton, au profil forfait / conseil. */
function forfaitButton() {
  return screen.getByRole('button', { name: /lancer la démo forfait|start the fixed-price/i })
}

describe('DemoEntryPage (shared demo link landing)', () => {
  it('lands on an explanatory page and does NOT open a room until the visitor asks', () => {
    // Un prospect qui ouvre le lien depuis un message doit d'abord lire où il
    // arrive. Redeem au chargement = une salle du pool consommée par chaque
    // aperçu de lien (Slack, LinkedIn, antivirus…).
    render(<DemoEntryPage />)

    expect(startButton()).toBeInTheDocument()
    expect(demoApi.redeem).not.toHaveBeenCalled()
  })

  it('dit la VÉRITÉ sur les données, et ne se contredit pas sept lignes plus bas', () => {
    // La page annonçait « les entreprises, contacts et signaux sont fictifs »
    // alors que les cinq dossiers portent de vraies sociétés, analysées à
    // partir d'informations publiques — un prospect qui lit « Société
    // Générale » juste après voit la contradiction. Elle doit donc dire les
    // deux : les dossiers sont réels, et UN compte est fictif.
    //
    // ⚠️ Mesuré en production le 16/09/2026 : le corps disait cela, et la note
    // de bas de page — la ligne de réassurance, celle qu'un prospect lit comme
    // un engagement sur le traitement des données — disait « Aucune donnée
    // réelle ». Les deux à sept lignes d'écart, sur le MÊME écran.
    render(<DemoEntryPage />)

    expect(screen.getByText(/vraies entreprises|REAL companies/i)).toBeInTheDocument()
    expect(screen.getByText(/fictif|fictional/i)).toBeInTheDocument()
    expect(screen.queryByText(/aucune donnée réelle|no real data/i)).not.toBeInTheDocument()
  })

  it('la note de bas de page n’énonce QUE des garanties que le code tient', () => {
    // #4463 — la note ne parle plus de crédit (crédits implicites) : elle ne garde que deux garanties,
    // qui se prouvent. Aucune analyse relancée vient du même endroit — `analysis.service.ts` court-circuite
    // un espace `is_demo` AVANT la réclamation de quota, donc avant tout
    // mouvement de crédit ; aucun compte à créer vient de `demo.controller.ts`,
    // dont la route `POST /demo/session` ne porte AUCUN `JwtGuard` — le
    // visiteur n'a pas de compte, le lien EST le justificatif.
    render(<DemoEntryPage />)

    const footnote = screen.getByText(/aucune analyse relancée|no analysis re-run/i)
    expect(footnote).toBeInTheDocument()
    expect(footnote.textContent).not.toMatch(/crédit|credit/i)
    expect(footnote.textContent).toMatch(/aucune analyse relancée|no analysis re-run/i)
    expect(footnote.textContent).toMatch(/aucun compte à créer|no account to create/i)
  })

  it('ne promet AUCUNE date de sortie — une date écrite en dur pourrit toute seule', () => {
    // La page a porté « {{brand}} sort en septembre » jusqu'au 16 septembre
    // 2026, jour où elle est devenue fausse sans que personne n'ait touché au
    // code. GA-342 (`i18n/no-dated-promises.test.ts`) tient la classe entière
    // sur tous les libellés ; ce test-ci tient l'écran où la faute est née.
    render(<DemoEntryPage />)

    expect(screen.queryByText(/septembre|September/i)).not.toBeInTheDocument()
  })

  it('redeems the token on click then hard-reloads into the app', async () => {
    vi.mocked(demoApi.redeem).mockResolvedValue(REDEEMED)

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(startButton())

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(demoApi.redeem).toHaveBeenCalledWith('tok')
  })

  // #3068 / SG — un ré-semis serveur (salle reprise ou recyclée) est API-only :
  // sans ce vidage, l'instantané IndexedDB de la visite PRÉCÉDENTE sous cette
  // MÊME identité survivrait au rechargement complet et rendrait un instant
  // l'ancien dossier (contacts, conversation) avant que le réseau ne rattrape.
  it('vide l’instantané IndexedDB de cette identité AVANT le rechargement complet', async () => {
    vi.mocked(demoApi.redeem).mockResolvedValue(REDEEMED)

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(startButton())

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(clearPersistedQueryCache).toHaveBeenCalledWith(REDEEMED.user.id)
    // L'ordre compte : vider APRÈS le rechargement ne protège rien du premier rendu.
    expect(vi.mocked(clearPersistedQueryCache).mock.invocationCallOrder[0]).toBeLessThan(
      replace.mock.invocationCallOrder[0],
    )
  })

  // #3788.6 — recette prod 08/10 : un navigateur qui portait déjà une session
  // RÉELLE avant ce clic affichait ses comptes/contacts réels sous le bandeau
  // MODE DÉMO — le scroll infini persiste en localStorage, hors de portée de
  // `clearPersistedQueryCache` (scopé à l'instantané IndexedDB).
  it('vide le scroll infini des comptes et des contacts AVANT le rechargement (#3788.6)', async () => {
    vi.mocked(demoApi.redeem).mockResolvedValue(REDEEMED)

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(startButton())

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(clearVolatileUserState).toHaveBeenCalledTimes(1)
    expect(vi.mocked(clearVolatileUserState).mock.invocationCallOrder[0]).toBeLessThan(
      replace.mock.invocationCallOrder[0],
    )
  })

  it('redeems only ONCE even on a double click', async () => {
    // A second redemption would wipe the space out from under the first visit.
    vi.mocked(demoApi.redeem).mockResolvedValue(REDEEMED)

    render(<DemoEntryPage token="tok" />)
    const button = startButton()
    await userEvent.click(button)
    await userEvent.click(button).catch(() => undefined)

    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(demoApi.redeem).toHaveBeenCalledTimes(1)
  })

  it('works on a plain link with no token — the normal case', async () => {
    // Le lien envoyé aux prospects est nu (`/demo`) : c'est l'API qui décide,
    // pas une clé recopiée dans un message.
    vi.mocked(demoApi.redeem).mockResolvedValue(REDEEMED)

    render(<DemoEntryPage />)
    await userEvent.click(startButton())

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(demoApi.redeem).toHaveBeenCalledWith(undefined)
  })

  it('tells a not-yet-provisioned demo (503) apart from an invalid link', async () => {
    vi.mocked(demoApi.redeem).mockRejectedValue(new ApiError('nope', 503))

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(startButton())

    expect(await screen.findByRole('heading', { level: 1, name: /indisponible|unavailable/i })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('does NOT blame the link when the API itself is down (5xx / network)', async () => {
    // Vécu le 31/07 : l'API prod répondait 404 côté edge Railway et la page
    // annonçait « lien invalide » à un prospect. Le lien allait très bien.
    // 404 compte ici : c'est ce que rend l'edge Railway quand l'API est morte,
    // ET ce que rend Nest quand la démo n'est pas configurée. Aucun des deux
    // n'est un lien périmé.
    for (const status of [404, 500, 502, 504, 0]) {
      vi.mocked(demoApi.redeem).mockRejectedValue(new ApiError('down', status))

      const { unmount } = render(<DemoEntryPage />)
      await userEvent.click(startButton())

      expect(await screen.findByRole('heading', { level: 1, name: /indisponible|unavailable/i })).toBeInTheDocument()
      unmount()
    }
  })

  it('#3468 — un serveur qui ne répond pas donne une erreur NOMMÉE, jamais une roue sans fin', async () => {
    vi.mocked(demoApi.redeem).mockRejectedValue(new DemoTimeoutError())

    render(<DemoEntryPage />)
    await userEvent.click(startButton())

    expect(await screen.findByText(/met trop de temps|taking too long/i)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // ni « lien invalide » (le lien n'y est pour rien) ni « indisponible »
    expect(screen.queryByText(/invalide|invalid/i)).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('shows an invalid-link message on a refused token', async () => {
    vi.mocked(demoApi.redeem).mockRejectedValue(new ApiError('nope', 401))

    render(<DemoEntryPage token="bad" />)
    await userEvent.click(startButton())

    expect(await screen.findByRole('heading', { level: 1, name: /invalide|invalid/i })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it("nomme l'état par une pastille teintée au-dessus du titre (maquette demo.html), le titre hors de la carte", async () => {
    vi.mocked(demoApi.redeem).mockRejectedValue(new ApiError('nope', 401))

    render(<DemoEntryPage token="bad" />)
    expect(screen.getByText(/^(Démo|Demo)$/).className).toMatch(/warning-soft/)
    await userEvent.click(startButton())

    const badge = await screen.findByText(/^(Lien invalide|Invalid link)$/)
    expect(badge.className).toMatch(/danger-soft/)
    const heading = screen.getByTestId('access-heading')
    expect(heading.contains(badge)).toBe(true)
    expect(screen.getByTestId('access-card').querySelector('h1')).toBeNull()
  })

  it('lets the visitor retry after a failure instead of dead-ending', async () => {
    vi.mocked(demoApi.redeem).mockRejectedValueOnce(new ApiError('down', 503))

    render(<DemoEntryPage />)
    await userEvent.click(startButton())
    await screen.findByRole('heading', { level: 1, name: /indisponible|unavailable/i })

    vi.mocked(demoApi.redeem).mockResolvedValue(REDEEMED)
    await userEvent.click(screen.getByRole('button', { name: /réessayer|try again/i }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })
})

// #2705.1/#2705.6 — « Lancer la démo » n'appelle plus `redeem` directement :
// un visiteur INCONNU (aucun lead pour son cookie `bellum_did`) est envoyé
// vers le formulaire obligatoire, jamais dans la démo.
describe('DemoEntryPage — routage vers le formulaire de démo (#2705)', () => {
  it('un visiteur SANS lead connu est envoyé vers /demo/acces, pas dans la démo', async () => {
    vi.mocked(demoApi.leadTouch).mockResolvedValue({ found: false })

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(startButton())

    await waitFor(() => expect(assign).toHaveBeenCalled())
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('/demo/acces'))
    expect(demoApi.redeem).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('le `?t=` et les UTM de la page survivent jusqu’au formulaire', async () => {
    vi.mocked(demoApi.leadTouch).mockResolvedValue({ found: false })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        replace,
        assign,
        href: 'http://localhost/demo?t=tok&utm_source=linkedin',
        search: '?t=tok&utm_source=linkedin',
      },
    })

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(startButton())

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/demo/acces?t=tok&utm_source=linkedin'))
  })

  it('un visiteur CONNU (cookie déjà porteur d’un lead) entre directement, sans repasser par le formulaire', async () => {
    vi.mocked(demoApi.leadTouch).mockResolvedValue({ found: true, firstName: 'Marie' })
    vi.mocked(demoApi.redeem).mockResolvedValue(REDEEMED)

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(startButton())

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('DemoEntryPage — #3483.4 une préparation longue ne reste pas muette', () => {
  it('ne dit « encore en cours » qu’après le seuil, jamais d’emblée', async () => {
    vi.mocked(demoApi.redeem).mockReturnValue(new Promise(() => undefined))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<DemoEntryPage />)
      await user.click(startButton())
      await screen.findByRole('status')
      expect(screen.queryByTestId('demo-preparing-slow')).not.toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100)
      })
      expect(screen.getByTestId('demo-preparing-slow')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

// #4291 J (décision Louis 21/10) — un second espace démo, au profil forfait / conseil : même jeton, même durée de
// vie, même sortie ; seule la salle louée change.
describe('DemoEntryPage — la démo forfait / conseil (#4291 J.2)', () => {
  it('propose les DEUX démos côte à côte', () => {
    render(<DemoEntryPage token="tok" />)

    expect(startButton()).toBeInTheDocument()
    expect(forfaitButton()).toBeInTheDocument()
  })

  it('un visiteur connu entre dans la salle forfait : même jeton, variante forfait', async () => {
    vi.mocked(demoApi.redeem).mockResolvedValue(REDEEMED)

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(forfaitButton())

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(demoApi.redeem).toHaveBeenCalledWith('tok', { profile: 'forfait_conseil' })
  })

  it('un visiteur inconnu passe par le formulaire, qui garde le choix forfait (et la query de la page)', async () => {
    vi.mocked(demoApi.leadTouch).mockResolvedValue({ found: false })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { replace, assign, href: 'http://localhost/demo?t=tok', search: '?t=tok' },
    })

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(forfaitButton())

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/demo/acces?t=tok&profil=forfait_conseil'))
  })

  it('« Réessayer » après un échec relance la démo CHOISIE', async () => {
    vi.mocked(demoApi.redeem).mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(REDEEMED)

    render(<DemoEntryPage token="tok" />)
    await userEvent.click(forfaitButton())
    await userEvent.click(await screen.findByRole('button', { name: /réessayer|try again|retry/i }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(demoApi.redeem).toHaveBeenLastCalledWith('tok', { profile: 'forfait_conseil' })
  })
})
