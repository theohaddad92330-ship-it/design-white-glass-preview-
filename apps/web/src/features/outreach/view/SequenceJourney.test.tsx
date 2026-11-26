import userEvent from '@testing-library/user-event'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { initialJourney } from '../sequence-journey'
import { SequenceJourney } from './SequenceJourney'

const marie = { id: 'c1', full_name: 'Marie Dubois', title: 'DSI', email: 'marie@acme.fr', assigned_to: null }
const paul = { id: 'c2', full_name: 'Paul Martin', title: 'DAF', email: null, assigned_to: null }

vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: () => ({ data: { pages: [{ data: [marie, paul] }] }, isLoading: false }),
}))
const createRule = vi.fn()
vi.mock('@/features/automations/api', () => ({
  useCreateAutomationRule: () => ({ mutate: createRule, isPending: false }),
}))

const continueButton = () => screen.getByRole('button', { name: 'Continuer' })
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))

function setup(initial = initialJourney()) {
  const onLaunchManual = vi.fn()
  const onSaveDraft = vi.fn()
  const onClose = vi.fn()
  renderWithRouter(
    <SequenceJourney initial={initial} onLaunchManual={onLaunchManual} onSaveDraft={onSaveDraft} onClose={onClose} />,
  )
  return { onLaunchManual, onSaveDraft, onClose }
}

beforeEach(async () => {
  createRule.mockReset()
  await i18n.changeLanguage('fr')
})

describe('« Créer une séquence » — Audience · Objectif · Messages · Vérification (Théo C sequences-assistant)', () => {
  it('l’étape 1 est l’AUDIENCE ; « Continuer » attend au moins un contact', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Qui veux-tu contacter ?' })).toBeInTheDocument()
    expect(screen.getByText('Étape 1 sur 4')).toBeInTheDocument()
    expect(continueButton()).toBeDisabled()
    // un seul écran à la fois : l'étape suivante n'est pas rendue en même temps
    expect(screen.queryByRole('heading', { name: 'Quel résultat attends-tu ?' })).not.toBeInTheDocument()
  })

  it('la colonne « Ta séquence » reste là à chaque étape et suit les choix (N2)', async () => {
    setup()
    const side = await screen.findByRole('complementary', { name: 'Ta séquence' })
    expect(within(side).getByText('Pas encore nommée')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nom de la séquence'), { target: { value: 'Data grands comptes' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Marie Dubois/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Paul Martin/ }))
    expect(within(side).getByText('Data grands comptes')).toBeInTheDocument()
    expect(within(side).getByText('2 contacts sélectionnés')).toBeInTheDocument()
    fireEvent.click(continueButton())
    expect(screen.getByRole('complementary', { name: 'Ta séquence' })).toBeInTheDocument()
  })

  it('l’e-mail pro s’affiche en clair, et un contact sans e-mail le dit (A5)', async () => {
    setup()
    expect(await screen.findByText('marie@acme.fr')).toBeInTheDocument()
    expect(screen.getByText('Sans e-mail pro')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Paul Martin/ }))
    expect(screen.getByRole('status')).toHaveTextContent('1 contact sélectionné n’a pas d’e-mail pro')
  })

  it('audience de plusieurs contacts → objectif → messages → vérification, puis la dernière vérification reçoit le choix', async () => {
    const { onLaunchManual } = setup()
    fireEvent.change(await screen.findByLabelText('Nom de la séquence'), { target: { value: 'Data' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Marie Dubois/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Paul Martin/ }))
    fireEvent.click(continueButton())
    expect(screen.getByRole('heading', { name: 'Quel résultat attends-tu ?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Présenter une expertise/ }))
    fireEvent.click(continueButton())
    expect(screen.getByRole('heading', { name: 'Prépare le message et les relances' })).toBeInTheDocument()
    fireEvent.click(continueButton())
    const review = screen.getByRole('region', { name: 'Vérification' })
    expect(within(review).getByText(/2 contacts : Marie Dubois, Paul Martin/)).toBeInTheDocument()
    expect(within(review).getByText('Présenter une expertise')).toBeInTheDocument()
    const launch = screen.getByRole('button', { name: 'Vérifier et enregistrer' })
    expect(launch).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai relu l’audience et les messages/ }))
    fireEvent.click(launch)
    expect(onLaunchManual).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Data',
        template: 'nurturing',
        customSteps: null,
        contacts: [expect.objectContaining({ id: 'c1' }), expect.objectContaining({ id: 'c2' })],
      }),
    )
  })

  it('l’étape Messages règle le canal et le jour de chaque touche ; une touche s’ajoute et se retire (N1, A3)', async () => {
    const { onLaunchManual } = setup()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Marie Dubois/ }))
    fireEvent.click(continueButton())
    fireEvent.click(continueButton())
    const day = screen.getByRole('spinbutton', { name: 'Jour après le départ 2' })
    fireEvent.change(day, { target: { value: '6' } })
    expect(screen.getByRole('spinbutton', { name: 'Jour après le départ 2' })).toHaveValue(6)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une étape' }))
    expect(screen.getAllByRole('spinbutton')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Retirer cette touche 4' }))
    expect(screen.getAllByRole('spinbutton')).toHaveLength(3)
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai relu/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et enregistrer' }))
    const request = onLaunchManual.mock.calls[0]?.[0] as { customSteps: { offsetDays: number }[] }
    expect(request.customSteps.map(step => step.offsetDays)).toEqual([0, 6, 10])
  })

  it('le retour arrière garde la sélection et le nom — rien ne plante, rien ne se perd', async () => {
    setup()
    fireEvent.change(await screen.findByLabelText('Nom de la séquence'), { target: { value: 'Data' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Marie Dubois/ }))
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('radio', { name: /Reprendre un échange/ }))
    back()
    expect(screen.getByRole('checkbox', { name: /Marie Dubois/ })).toBeChecked()
    expect(screen.getByLabelText('Nom de la séquence')).toHaveValue('Data')
    fireEvent.click(continueButton())
    expect(screen.getByRole('radio', { name: /Reprendre un échange/ })).toBeChecked()
  })

  it('« Seulement une action préparée » est un choix d’objectif, sans cadence à construire (A2)', async () => {
    setup()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Marie Dubois/ }))
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('radio', { name: /Seulement une action préparée/ }))
    fireEvent.click(continueButton())
    expect(screen.getByText(/Un seul message est préparé pour chaque contact/)).toBeInTheDocument()
  })

  it('« Quitter et conserver » range le brouillon, rien n’est créé (N3)', async () => {
    const { onSaveDraft, onClose } = setup()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Marie Dubois/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitter et conserver' }))
    expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ step: 'audience' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(createRule).not.toHaveBeenCalled()
  })

  it('« Annuler » sur la première étape ferme le parcours (rien n’est créé)', async () => {
    const { onClose } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }))
    expect(onClose).toHaveBeenCalled()
    expect(createRule).not.toHaveBeenCalled()
  })

  it('« Quand un signal arrive » (ex-Automatisations) : la règle est créée par l’assistant, dite en mots simples', async () => {
    const { onClose } = setup()
    const user = userEvent.setup()
    // « Quand démarrer » : un contrôle segmenté ; le départ sur signal se dit « elle devient une automatisation ».
    const trigger = await screen.findByRole('button', { name: 'Quand un signal arrive' })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('journey-signal-notice')).toHaveTextContent('Elle devient une automatisation.')
    await user.click(screen.getByRole('combobox', { name: 'Signal de départ' }))
    await user.click(await screen.findByRole('option', { name: /un appel d’offres est publié/ }))
    fireEvent.click(continueButton())
    // le modèle naturel du signal est proposé, pas imposé
    expect(screen.getByRole('radio', { name: /Appel d’offres/ })).toBeChecked()
    fireEvent.click(continueButton())
    expect(screen.getByText(/Laura prépare le premier message de la séquence/)).toBeInTheDocument()
    fireEvent.click(continueButton())
    const review = screen.getByRole('region', { name: 'Vérification' })
    expect(within(review).getByText(/Quand un appel d’offres est publié/)).toBeInTheDocument()
    // « Rien ne part » : la note posée sous le récapitulatif (`.notice.purple`), hors de la carte.
    expect(screen.getByText(/Rien ne part sans ta validation/)).toBeInTheDocument()
    // la règle naît éteinte côté API (`automation-rules.service.ts`) : l'écran le dit, sans promettre un départ
    expect(within(review).getByText(/Il naît éteint/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Créer le déclencheur' }))
    expect(createRule).toHaveBeenCalledWith(
      { signal: 'tender', action_kind: 'enroll_sequence', playbook_key: 'tender' },
      expect.anything(),
    )
    createRule.mock.calls[0]?.[1]?.onSuccess?.()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('Théo C sequences-assistant — la STRUCTURE de la maquette', () => {
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('en-tête (h1 + Quitter et conserver) · fil des 4 étapes · étape (h2, phrase) · pied « Étape N sur 4 » | Ta séquence', async () => {
    const { onSaveDraft } = setup()
    const head = await screen.findByTestId('sequences-page-head')
    expect(within(head).getByRole('heading', { level: 1, name: 'Créer une séquence' })).toBeInTheDocument()
    expect(
      within(head).getByText('Un parcours guidé. Ton audience et tes textes restent conservés.'),
    ).toBeInTheDocument()
    const stepper = screen.getByTestId('journey-stepper')
    expect(
      within(stepper)
        .getAllByRole('button')
        .map(button => button.getAttribute('aria-label')),
    ).toEqual(['1. Audience', '2. Objectif', '3. Messages', '4. Vérification'])
    const step = screen.getByTestId('journey-step')
    const side = screen.getByTestId('journey-side')
    ;[head, stepper, step, side]
      .slice(1)
      .forEach((node, index) => expect(before([head, stepper, step, side][index] as Element, node)).toBe(true))
    expect(within(step).getByRole('heading', { level: 2, name: 'Qui veux-tu contacter ?' })).toBeInTheDocument()
    // « Quand démarrer » en tête de l'audience, segmenté ; « Dès que je l'enregistre » par défaut.
    expect(within(step).getByRole('button', { name: 'Dès que je l’enregistre' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(step).getByRole('button', { name: 'Sélection métier' })).toBeInTheDocument()
    expect(within(step).getByText('Étape 1 sur 4')).toBeInTheDocument()
    fireEvent.click(within(head).getByRole('button', { name: 'Quitter et conserver' }))
    expect(onSaveDraft).toHaveBeenCalled()
  })

  it('la liste de contacts : nom, compte · poste, e-mail pro en clair, « Sans e-mail pro » nommé', async () => {
    setup()
    const list = await screen.findByTestId('journey-contacts')
    expect(within(list).getByText('marie@acme.fr')).toBeInTheDocument()
    expect(within(list).getByText('Sans e-mail pro')).toBeInTheDocument()
  })

  it('« Sélection métier » déplie le constructeur d’audience existant (plafonds compris), sans quitter l’étape', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Sélection métier' }))
    expect(screen.getByTestId('journey-business-selection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sélection métier' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('l’étape Messages : chaque touche a Monter / Descendre / Retirer, nommés ; la première ne monte pas', async () => {
    setup()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Marie Dubois/ }))
    fireEvent.click(continueButton())
    fireEvent.click(continueButton())
    const first = screen.getByTestId('journey-touch-0')
    expect(within(first).getByRole('button', { name: 'Monter l’étape 1' })).toBeDisabled()
    expect(within(first).getByRole('button', { name: 'Descendre l’étape 1' })).toBeEnabled()
    fireEvent.click(within(first).getByRole('button', { name: 'Descendre l’étape 1' }))
    expect(within(screen.getByTestId('journey-touch-1')).getByRole('heading', { level: 3 })).toBeInTheDocument()
  })
})
