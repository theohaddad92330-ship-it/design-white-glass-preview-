import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_ACCESS_SLOW_WAIT_MS } from '../hooks/useDemoAccessForm'
import { DemoAccessPage } from './DemoAccessPage'

const registerLead = vi.fn()
const redeem = vi.fn()
vi.mock('@/features/demo/api', () => ({
  demoApi: { registerLead: (...a: unknown[]) => registerLead(...a), redeem: (...a: unknown[]) => redeem(...a) },
}))
vi.mock('@/features/auth/tab-identity', () => ({
  rememberTabIdentity: vi.fn(),
  forgetTabIdentity: vi.fn(),
  readTabIdentity: () => null,
}))
vi.mock('@/features/auth/demo-tab', () => ({
  markTabAsDemo: vi.fn(),
  isTabDemo: () => false,
  forgetTabDemoFlag: vi.fn(),
}))

const replace = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { replace, href: 'http://localhost/demo/acces', search: '' },
  })
})

// Requêtes par PLACEHOLDER pour prénom/nom/entreprise : leurs libellés se
// chevauchent (« Prénom » contient « nom », « Nom de l’entreprise » commence
// par « Nom ») — le placeholder est la façon non ambiguë de désigner chacun.
async function fillValidForm() {
  await userEvent.type(screen.getByPlaceholderText('Marie'), 'Marie')
  await userEvent.type(screen.getByPlaceholderText('Dupont'), 'Dupont')
  await userEvent.type(screen.getByLabelText(/e-mail professionnelle|professional email/i), 'marie.dupont@acme.fr')
  await userEvent.click(screen.getByRole('combobox', { name: /fonction|job title/i }))
  await userEvent.click(await screen.findByRole('option', { name: /freelance/i }))
  await userEvent.type(screen.getByPlaceholderText('Acme'), 'Acme')
}

// #2705.2 — le formulaire obligatoire : champs, bouton désactivé, soumission.
describe('DemoAccessPage', () => {
  it('maquette demo.html #demo-formulaire : titre hors carte, session expirée en bandeau, prénom et nom côte à côte', () => {
    render(<DemoAccessPage token={undefined} reason="expired" />)
    const heading = screen.getByTestId('access-heading')
    expect(heading.querySelector('h1')?.textContent).toMatch(/Avant de lancer la démo|Before you start the demo/)
    expect(screen.getByRole('note').textContent).toMatch(/expiré|expired/)
    const card = screen.getByTestId('access-card')
    expect(card.querySelector('h1')).toBeNull()
    const firstName = screen.getByPlaceholderText(/^Marie$|^Jane$|^Mary$/)
    const lastName = screen.getByPlaceholderText(/^Dupont$|^Doe$/)
    const row = firstName.closest('.grid')
    expect(row).not.toBeNull()
    expect(row?.contains(lastName)).toBe(true)
  })

  // #3563.3 — le menu « Fonction » passait de non contrôlé à contrôlé au 1er choix.
  it('choisir une fonction n’émet aucun avertissement « uncontrolled to controlled »', async () => {
    const errors = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorsE = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<DemoAccessPage token={undefined} />)
    await userEvent.click(screen.getByRole('combobox', { name: /fonction|job title/i }))
    await userEvent.click(await screen.findByRole('option', { name: /freelance/i }))
    const warned = [...errors.mock.calls, ...errorsE.mock.calls].some(c =>
      /uncontrolled|controlled/i.test(String(c[0])),
    )
    errors.mockRestore()
    errorsE.mockRestore()
    expect(warned).toBe(false)
  })

  it('le bouton reste désactivé tant que les champs obligatoires ne sont pas remplis', () => {
    render(<DemoAccessPage token={undefined} />)

    expect(screen.getByRole('button', { name: /accéder à la démo|access the demo/i })).toBeDisabled()
  })

  it('le téléphone reste facultatif — le bouton s’active sans lui', async () => {
    render(<DemoAccessPage token={undefined} />)
    await fillValidForm()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /accéder à la démo|access the demo/i })).toBeEnabled(),
    )
  })

  it('soumission valide : enregistre le lead puis entre dans la démo', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockResolvedValue({ user: { id: 'u1' } })

    render(<DemoAccessPage token="tok" />)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /accéder à la démo|access the demo/i }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'), { timeout: 2000 })
    expect(registerLead).toHaveBeenCalledWith(expect.objectContaining({ email: 'marie.dupont@acme.fr' }))
    expect(redeem).toHaveBeenCalledWith('tok', { onPreparing: expect.any(Function) })
  })

  // #2705.9 — le message de remerciement cite le PRÉNOM et se lit avant la
  // redirection ; le formulaire ne reste pas affiché derrière lui.
  it('soumission valide : affiche « Merci Marie… » avant de rediriger', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockResolvedValue({ user: { id: 'u1' } })

    render(<DemoAccessPage token="tok" />)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /accéder à la démo|access the demo/i }))

    expect(await screen.findByText(/merci marie/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accéder à la démo|access the demo/i })).not.toBeInTheDocument()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'), { timeout: 2000 })
  })

  it('porte le lien « Aller à la connexion » (#2705.11)', () => {
    render(<DemoAccessPage token={undefined} />)

    expect(screen.getByRole('link', { name: /aller à la connexion|go to sign-in/i })).toBeInTheDocument()
  })

  // #3562 (Y18) — la salle s'ouvre sur Maëlle Lorquin, pas sur l'identité saisie :
  // le formulaire le DIT, et n'annonce plus « jusqu'à une minute » (>60 s mesuré).
  it('#3562 — dit que la salle porte un autre nom que l’identité saisie sous lequel on entre dans la salle', () => {
    render(<DemoAccessPage token={undefined} />)
    expect(screen.getByText(/c’est son nom, et non le tien/)).toBeInTheDocument()
  })

  it('#3578 — la démo se prépare : le message d’attente HONNÊTE remplace celui de la salle, aucune erreur', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockImplementation((_t: unknown, opts?: { onPreparing?: () => void }) => {
      opts?.onPreparing?.()
      return new Promise(() => undefined)
    })

    render(<DemoAccessPage token="tok" />)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /accéder à la démo|access the demo/i }))

    expect(await screen.findByText(/la démo se prépare, ça peut prendre quelques minutes/i)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/environ une minute/i)
    expect(screen.queryByText(/une erreur est survenue/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // #3578.3 — recette prod 03/10 : 18 à ~40 s d'attente SANS 503 et sans un mot.
  it('#3578.3 — une attente longue SANS 503 dit « la démo se prépare » avec une progression, dès ~3 s', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockImplementation(() => new Promise(() => undefined)) // jamais de onPreparing, jamais de réponse

    render(<DemoAccessPage token="tok" />)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /accéder à la démo|access the demo/i }))

    // Avant le seuil : le message court de la salle, pas de barre.
    expect(await screen.findByText(/on prépare ta salle/i)).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

    // Après le seuil (vraie horloge : DEMO_ACCESS_SLOW_WAIT_MS) : état honnête + progression.
    expect(
      await screen.findByText(/la démo se prépare, ça peut prendre quelques minutes/i, undefined, {
        timeout: DEMO_ACCESS_SLOW_WAIT_MS + 2500,
      }),
    ).toBeInTheDocument()
    // #3666 (Louis 13/10) — une seule requête, aucune étape : la barre est INDÉTERMINÉE, sans valeur inventée.
    const bar = screen.getByRole('progressbar', { name: /préparation de la démo/i })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(screen.queryByText(/une erreur est survenue/i)).not.toBeInTheDocument()
  }, 15000)

  // #3747 — recette 06/10 : « Une erreur est survenue » après ~5 min alors que la salle s'ouvrait ensuite.
  it('#3747 — une préparation qui dépasse le garde-fou n’est PAS « une erreur » : on dit qu’elle continue', async () => {
    const { DemoTimeoutError } = await import('@/features/demo/demo-timeout')
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockRejectedValue(new DemoTimeoutError())

    render(<DemoAccessPage token="tok" />)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /accéder à la démo|access the demo/i }))

    expect(await screen.findByText(/la préparation prend plus de temps que prévu/i)).toBeInTheDocument()
    expect(screen.queryByText(/une erreur est survenue/i)).not.toBeInTheDocument()
  })

  it('#3747 — SAIT DIRE NON : une vraie erreur serveur reste « Une erreur est survenue »', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockRejectedValue(new Error('boom'))

    render(<DemoAccessPage token="tok" />)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /accéder à la démo|access the demo/i }))

    expect(await screen.findByText(/une erreur est survenue/i)).toBeInTheDocument()
  })

  it('#3562 — ne promet pas « jusqu’à une minute » : la préparation dépasse 60 s', () => {
    render(<DemoAccessPage token={undefined} />)
    expect(document.body.textContent ?? '').not.toMatch(/jusqu.à une minute/)
  })

  it('porte la mention RGPD avec le lien vers la politique de confidentialité', () => {
    render(<DemoAccessPage token={undefined} />)

    const link = screen.getByRole('link', { name: /politique de confidentialité|privacy policy/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('/privacy'))
  })

  // Constat production du 27/09/2026 — un visiteur renvoyé ici après une
  // session de démonstration perdue (401, appareil révoqué, jeton expiré) ne
  // doit jamais atterrir sur un formulaire MUET : `RedirectTo` route vers
  // `/demo/acces?reason=expired`, et cet écran le dit.
  it('affiche un message quand la session de démonstration a expiré (reason=expired)', () => {
    render(<DemoAccessPage token={undefined} reason="expired" />)

    expect(screen.getByText(/session de démonstration a expiré|demo session has expired/i)).toBeInTheDocument()
  })

  it('ne montre aucun message sans `reason`', () => {
    render(<DemoAccessPage token={undefined} />)

    expect(screen.queryByText(/session de démonstration a expiré|demo session has expired/i)).not.toBeInTheDocument()
  })
})
