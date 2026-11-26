import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UpdateProfile, UserProfile } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ThemeProvider } from '@/features/theme/theme-provider'
import { PreferencesProvider } from '@/features/preferences/preferences-provider'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * Théo D settings-prefs — Réglages › Préférences en trois sous-onglets
 * (Affichage · Mon identité · Raccourcis), page appliquée `d/settings-prefs`.
 *
 * Les mocks portent sur les BORDS (profil, build) — jamais sur l'écran.
 */
const saveMock = vi.fn(async (_update: UpdateProfile) => ({}) as UserProfile)
const profile: UserProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'maelle@example.com',
  first_name: 'Maëlle',
  last_name: 'Lorquin',
  avatar_url: null,
  timezone: 'Europe/Paris',
  created_at: '2026-09-14T08:00:00.000Z',
  updated_at: '2026-09-14T08:00:00.000Z',
  auth_created_at: null,
  auth_last_sign_in_at: null,
}
vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({ data: profile, isLoading: false }),
}))
vi.mock('@/features/profiles/hooks/useSaveProfile', () => ({
  useSaveProfile: () => ({ mutateAsync: saveMock, isPending: false }),
}))
vi.mock('@/features/profiles/hooks/useChangeEmail', () => ({
  usePendingEmailChange: () => ({ data: { new_email: null } }),
}))
vi.mock('@/features/mailbox/view/MailboxSignatureCard', () => ({
  MailboxSignatureCard: () => <div data-testid="signature" />,
}))
vi.mock('@/features/profile/components/BusinessRoleField', () => ({
  BusinessRoleField: () => <div data-testid="business-role" />,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { PreferencesView } = await import('./PreferencesView')

function renderView(initialTab?: 'display' | 'identity' | 'shortcuts') {
  localStorage.clear()
  return renderWithRouter(
    <ThemeProvider>
      <PreferencesProvider>
        <PreferencesView initialTab={initialTab} />
      </PreferencesProvider>
    </ThemeProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  saveMock.mockClear()
  document.documentElement.removeAttribute('data-density')
})

describe('settings-prefs.R4 / R5 — trois sous-onglets', () => {
  it('propose Affichage, Mon identité et Raccourcis, Affichage ouvert', async () => {
    renderView()
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['Affichage', 'Mon identité', 'Raccourcis'])
    expect(screen.getByRole('tab', { name: 'Affichage' })).toHaveAttribute('aria-selected', 'true')
  })

  it('Mon identité montre le nom, la fonction et la signature — sans fuseau (il vit dans Langue & dates)', async () => {
    renderView()
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Mon identité' }))
    expect(await screen.findByDisplayValue('Maëlle')).toBeInTheDocument()
    expect(screen.getByTestId('signature')).toBeInTheDocument()
    expect(screen.getByTestId('business-role')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Fuseau horaire' })).not.toBeInTheDocument()
  })

  it('Raccourcis ouvre sur « Les raccourcis utiles » et garde la table complète (A7)', async () => {
    renderView('shortcuts')
    expect(await screen.findByText('Les raccourcis utiles')).toBeInTheDocument()
    // Laura sur ⌘J, la recherche sur ⌘K : la touche de Théo.
    expect(screen.getByText('Ouvrir la recherche globale')).toBeInTheDocument()
    expect(screen.getByText(/Tous les raccourcis/)).toBeInTheDocument()
  })
})

describe('settings-prefs.R1 / N1 / R2 — Apparence, densité, page de démarrage', () => {
  it('le thème se choisit sur trois vignettes, et agit tout de suite', async () => {
    renderView()
    const group = await screen.findByRole('radiogroup', { name: 'Apparence' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map(r => r.textContent)).toEqual(['Clair', 'Sombre', 'Système'])
    await userEvent.setup().click(within(group).getByRole('radio', { name: 'Sombre' }))
    expect(within(group).getByRole('radio', { name: 'Sombre' })).toHaveAttribute('aria-checked', 'true')
  })

  it('la densité Compacte agit tout de suite sur <html> et se relit au stockage', async () => {
    renderView()
    const user = userEvent.setup()
    const select = await screen.findByRole('combobox', { name: 'Densité' })
    expect(select).toHaveTextContent('Confortable')
    await user.click(select)
    await user.click(await screen.findByRole('option', { name: 'Compacte' }))
    expect(document.documentElement.dataset.density).toBe('compact')
    expect(JSON.parse(localStorage.getItem('bellum-preferences') ?? '{}').density).toBe('compact')
  })

  it('la page de démarrage propose le Vivier, et garde Ma journée (#2112.20 ; « Ma journée » remplace « Aujourd’hui », Louis 23/10)', async () => {
    renderView()
    await userEvent.setup().click(await screen.findByRole('combobox', { name: 'Page de démarrage préférée' }))
    expect(await screen.findByRole('option', { name: 'Vivier' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ma journée' })).toBeInTheDocument()
  })
})

describe('settings-prefs.N5 — enregistrement explicite', () => {
  it('rien n’est écrit tant qu’on n’a pas cliqué « Enregistrer les modifications »', async () => {
    const user = userEvent.setup()
    renderView()
    expect(await screen.findByText('Aucune modification en attente')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Enregistrer les modifications' })
    expect(save).toBeDisabled()

    await user.click(screen.getByRole('combobox', { name: 'Page de démarrage préférée' }))
    await user.click(await screen.findByRole('option', { name: 'Vivier' }))

    expect(screen.getByText('Modifications à enregistrer')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('bellum-preferences') ?? '{}').defaultView).not.toBe('talents')

    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))
    expect(JSON.parse(localStorage.getItem('bellum-preferences') ?? '{}').defaultView).toBe('talents')
    expect(await screen.findByText('Aucune modification en attente')).toBeInTheDocument()
  })
})

describe('settings-prefs.R3 — Langue & dates, fuseau compris', () => {
  it('le fuseau s’enregistre sur le profil avec le même bouton, sans toucher au nom', async () => {
    const user = userEvent.setup()
    renderView()
    const zone = await screen.findByRole('combobox', { name: 'Fuseau horaire' })
    expect(zone).toHaveTextContent('Europe/Paris')
    await user.click(zone)
    await user.click(await screen.findByRole('option', { name: 'Europe/Brussels' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    expect(saveMock).toHaveBeenCalledWith({ timezone: 'Europe/Brussels' })
  })
})

describe('Rien ne se perd — settings-prefs liste 3 (A1 A3 A4 A5) et la barre de matching', () => {
  it('Lecture & saisie garde l’affichage des noms, l’envoi, la barre latérale', async () => {
    renderView()
    const section = (await screen.findByText('Lecture & saisie')).closest('section') as HTMLElement
    expect(section).not.toBeNull()
    expect(within(section).getByText('Affichage des noms')).toBeInTheDocument()
    expect(within(section).getByText('Envoi des commentaires')).toBeInTheDocument()
    expect(within(section).getByText('Barre latérale')).toBeInTheDocument()
  })

  it('Apparence garde la taille du texte et le curseur main', async () => {
    renderView()
    expect(await screen.findByText('Taille du texte')).toBeInTheDocument()
    expect(screen.getByText('Curseur main')).toBeInTheDocument()
  })

  it('la barre de matching renvoie vers Talents', async () => {
    renderView()
    const link = await screen.findByRole('link', { name: /Paramètres de matching/ })
    expect(link).toHaveAttribute('href', '/consultants')
  })

  it('les relances de tutoriel ne sont plus ici (Aide & signalements) ; À propos est un repli FERMÉ (A6)', async () => {
    renderView()
    await screen.findByRole('tab', { name: 'Affichage' })
    expect(screen.queryByRole('button', { name: 'Revoir la visite guidée' })).not.toBeInTheDocument()
    const summary = screen.getByText(/À propos de .* version et parité, utiles au support/)
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Copier pour le support' })).toBeInTheDocument()
  })

  it('« Comment travailler ici ? » est un repli qui porte le parcours utile (N-guide)', async () => {
    renderView()
    const summary = await screen.findByText('Comment travailler ici ?')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('Régler ton confort sans réécrire l’historique')).toBeInTheDocument()
    expect(screen.getByText('Paramètres · Personnel')).toBeInTheDocument()
  })
})

describe('settings-prefs — structure de la maquette Théo (contrôle 23/10)', () => {
  it('Affichage empile Apparence, Lecture & saisie, Langue & dates — dans cet ordre', async () => {
    renderView()
    await screen.findByRole('tab', { name: 'Affichage' })
    const blocks = screen
      .getAllByRole('heading', { level: 2 })
      .map(h => h.textContent ?? '')
      .filter(text => ['Apparence', 'Lecture & saisie', 'Langue & dates'].includes(text))
    expect(blocks).toEqual(['Apparence', 'Lecture & saisie', 'Langue & dates'])
  })

  it('l’affichage des noms est une liste déroulante, plus des cartes', async () => {
    renderView()
    await screen.findByRole('tab', { name: 'Affichage' })
    expect(screen.getByRole('combobox', { name: 'Affichage des noms' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Affichage des noms' })).not.toBeInTheDocument()
  })

  it('Mon identité renvoie vers Sécurité pour le mot de passe et la double authentification', async () => {
    renderView('identity')
    expect(await screen.findByRole('link', { name: 'Sécurité' })).toHaveAttribute('href', '/settings/security')
  })
})
