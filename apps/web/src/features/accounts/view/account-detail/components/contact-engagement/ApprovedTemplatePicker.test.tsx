import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApprovedTemplatePicker } from './ApprovedTemplatePicker'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

const TEMPLATE = {
  id: 't1111111-1111-4111-8111-111111111111',
  scenario: 'invitation_acceptee',
  channel: 'linkedin',
  persona: null,
  sequenceStep: 1,
  delayDays: 0,
  version: 2,
  source: 'méthode conquête ESN v3',
  exactText: 'Merci pour la connexion {{prenom}} !',
  variables: ['prenom'],
  requiredEvidence: [],
  forbiddenClaims: [],
  status: 'active' as const,
  renderedText: 'Merci pour la connexion Gerald !',
}

describe('ApprovedTemplatePicker — #3417 (retour bêta 30/09)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('ne rend rien sur le canal "task" — une tâche ne s’envoie pas', () => {
    const { container } = render(
      <ApprovedTemplatePicker channel="task" contactId="c1" parameters={{}} onUseTemplate={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('Théo C6 — `alwaysOpen` (modale « Partir d’un modèle approuvé ») : le choix est ouvert, sans bouton bascule', () => {
    render(<ApprovedTemplatePicker alwaysOpen channel="email" contactId="c1" parameters={{}} onUseTemplate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Modèle approuvé' })).toBeNull()
    expect(screen.getByLabelText('Choisir un scénario')).toBeInTheDocument()
  })

  it('liste les modèles prêts pour le scénario choisi et insère le texte exact au clic', async () => {
    const u = userEvent.setup()
    apiFetch.mockResolvedValue({ ready: [TEMPLATE], blocked: [] })
    const onUseTemplate = vi.fn()
    render(<ApprovedTemplatePicker channel="linkedin" contactId="c1" parameters={{}} onUseTemplate={onUseTemplate} />)

    await u.click(screen.getByRole('button', { name: 'Modèle approuvé' }))
    await u.click(screen.getByLabelText('Choisir un scénario'))
    await u.click(await screen.findByRole('option', { name: 'Invitation acceptée' }))

    await waitFor(() => expect(screen.getByText('Merci pour la connexion Gerald !')).toBeInTheDocument())
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining('/outreach-templates/c1?channel=linkedin&scenario=invitation_acceptee'),
      }),
    )

    await u.click(screen.getByText('Merci pour la connexion Gerald !'))
    expect(onUseTemplate).toHaveBeenCalledWith(TEMPLATE)
  })

  /**
   * #3697.6 (recette prod 09/10) — « niveau (contact/compte) non étiqueté donc
   * l'ordre "contact d'abord" NON PROUVABLE ». `orderByRole` trie déjà les
   * trames par rôle ; encore fallait-il ÉCRIRE ce rôle à l'écran.
   */
  it('#3697.6 — nomme le niveau de chaque trame (rôle précis, ou « tous niveaux » quand le modèle n’en cible aucun)', async () => {
    const u = userEvent.setup()
    apiFetch.mockResolvedValue({
      ready: [TEMPLATE, { ...TEMPLATE, id: 't2222222-2222-4222-8222-222222222222', persona: 'decideur' }],
      blocked: [],
    })
    render(<ApprovedTemplatePicker channel="linkedin" contactId="c1" parameters={{}} onUseTemplate={vi.fn()} />)

    await u.click(screen.getByRole('button', { name: 'Modèle approuvé' }))
    await u.click(screen.getByLabelText('Choisir un scénario'))
    await u.click(await screen.findByRole('option', { name: 'Invitation acceptée' }))

    const levels = await waitFor(() => screen.getAllByTestId('approved-template-level'))
    expect(levels.map(el => el.textContent)).toEqual(['Niveau : Tous niveaux (compte)', 'Niveau : Décideur'])
  })

  /**
   * #3697.6 (recette prod 09/10, visuel) — menu de 165 px, libellés tronqués
   * (« Invitation accep… », « Connexion dorm… »). Les dix scénarios passent
   * désormais à la ligne plutôt que d'être coupés.
   */
  it('#3697.6 — un long libellé de scénario passe à la ligne, jamais tronqué par des points de suspension', async () => {
    const u = userEvent.setup()
    render(<ApprovedTemplatePicker channel="linkedin" contactId="c1" parameters={{}} onUseTemplate={vi.fn()} />)

    await u.click(screen.getByRole('button', { name: 'Modèle approuvé' }))
    await u.click(screen.getByLabelText('Choisir un scénario'))
    const option = await screen.findByRole('option', { name: 'Prospection inversée (consultant)' })

    expect(option.querySelector('.truncate')).toBeNull()
    expect(option.querySelector('.whitespace-normal')).not.toBeNull()
  })

  /**
   * #3697.7 (recette prod 09/10) — menu à 10 trames complètes (libellés sur 2
   * lignes, 0 tronqué) MAIS le placeholder du déclencheur fermé, « Choisir un
   * scén… », restait coupé par des points de suspension : `wrap: true` ne
   * portait que sur les OPTIONS de la liste ouverte, jamais sur le libellé
   * vide affiché dans le déclencheur fermé.
   */
  it('#3697.7 — le placeholder « Choisir un scénario » ne se tronque jamais dans le déclencheur fermé', async () => {
    render(<ApprovedTemplatePicker channel="linkedin" contactId="c1" parameters={{}} onUseTemplate={vi.fn()} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Modèle approuvé' }))
    const trigger = screen.getByLabelText('Choisir un scénario')

    expect(trigger.querySelector('.truncate')).toBeNull()
    expect(trigger.querySelector('.line-clamp-1')).toBeNull()
    expect(trigger).toHaveTextContent('Choisir un scénario')
  })

  it('nomme la raison quand aucun modèle n’est prêt à envoyer', async () => {
    const u = userEvent.setup()
    apiFetch.mockResolvedValue({
      ready: [],
      blocked: [{ ...TEMPLATE, reason: 'evidence_missing', missing: ['recent_signal'] }],
    })
    render(<ApprovedTemplatePicker channel="linkedin" contactId="c1" parameters={{}} onUseTemplate={vi.fn()} />)

    await u.click(screen.getByRole('button', { name: 'Modèle approuvé' }))
    await u.click(screen.getByLabelText('Choisir un scénario'))
    await u.click(await screen.findByRole('option', { name: 'Invitation acceptée' }))

    await waitFor(() =>
      expect(screen.getByText(/la preuve qu'il exige n'est pas encore au dossier/)).toBeInTheDocument(),
    )
    // #3417 — la preuve manquante est NOMMÉE, pas seulement annoncée.
    expect(screen.getByText(/un signal récent/)).toBeInTheDocument()
    // Recette Y11 : la preuve se lit sur le CONTACT (contacts.signals), le libellé ne dit pas « compte ».
    expect(screen.getByText(/un signal récent sur le contact/)).toBeInTheDocument()
    expect(screen.queryByText(/sur le compte/)).toBeNull()
  })

  it('#3417 — nomme la variable manquante (prénom, entreprise)', async () => {
    const u = userEvent.setup()
    apiFetch.mockResolvedValue({
      ready: [],
      blocked: [{ ...TEMPLATE, reason: 'variables_missing', missing: ['entreprise'] }],
    })
    render(<ApprovedTemplatePicker channel="linkedin" contactId="c1" parameters={{}} onUseTemplate={vi.fn()} />)
    await u.click(screen.getByRole('button', { name: 'Modèle approuvé' }))
    await u.click(screen.getByLabelText('Choisir un scénario'))
    await u.click(await screen.findByRole('option', { name: 'Invitation acceptée' }))
    await waitFor(() => expect(screen.getByText(/Il manque : le nom de l’entreprise/)).toBeInTheDocument())
  })
})
