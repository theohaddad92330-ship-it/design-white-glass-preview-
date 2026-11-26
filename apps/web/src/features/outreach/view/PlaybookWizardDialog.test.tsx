import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const contactsMock = vi.fn()
const eligibilityMock = vi.fn()
const createMock = vi.fn()
const prepareMock = vi.fn()

vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => contactsMock() }))
vi.mock('../hooks/useOutreachSequences', () => ({ useEnrollmentEligibility: () => eligibilityMock() }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: createMock, isPending: false }),
}))
vi.mock('../playbook-messages', () => ({ prepareStepMessage: (input: unknown) => prepareMock(input) }))

import { PlaybookWizardDialog } from './PlaybookWizardDialog'

/** Lot L-C (#4166) — l'assistant en 4 questions : modèle proposé, messages de Laura éditables, exclusions. */

const contact = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Marie Dubois', company_name: 'Acme' }
const onOpenChange = vi.fn()

const renderWizard = (props: Partial<React.ComponentProps<typeof PlaybookWizardDialog>> = {}) =>
  render(<PlaybookWizardDialog open onOpenChange={onOpenChange} {...props} />)

const clickRadio = (name: RegExp | string) => fireEvent.click(screen.getByRole('radio', { name }))
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

describe('PlaybookWizardDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    contactsMock.mockReturnValue({ data: { pages: [{ data: [contact] }] } })
    eligibilityMock.mockReturnValue({ data: { contacts: [] } })
    createMock.mockReset().mockResolvedValue({ id: 's1' })
    prepareMock
      .mockReset()
      .mockImplementation(async ({ kind }: { kind: string }) =>
        kind === 'email'
          ? { subject: 'Votre poste de Lead Data', body: 'Bonjour Marie, une idée pour Acme ?' }
          : { subject: '', body: 'Message de Laura' },
      )
    onOpenChange.mockReset()
  })

  it('pose les quatre questions dans l’ordre : qui, pourquoi maintenant, ce que j’offre, ce que je veux', () => {
    renderWizard({ initialContact: contact })
    expect(screen.getByText('Question 1 sur 4')).toBeTruthy()
    expect(screen.getByText('Qui veux-tu contacter ?')).toBeTruthy()
    next()
    expect(screen.getByText('Pourquoi maintenant ?')).toBeTruthy()
    next()
    expect(screen.getByText('Que proposes-tu ?')).toBeTruthy()
    next()
    expect(screen.getByText('Que veux-tu obtenir ?')).toBeTruthy()
  })

  it('on ne passe pas la première question sans contact', () => {
    renderWizard()
    expect((screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Marie Dubois/ }))
    expect((screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('pré-remplit le signal quand on vient d’un compte ou d’un signal', () => {
    renderWizard({ initialContact: contact, initialTrigger: 'tender' })
    next()
    expect(screen.getByText(/Signal déjà connu pour ce contact : Appel d’offres/)).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Appel d’offres/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('propose le modèle adapté aux réponses, et l’utilisateur peut en changer', () => {
    renderWizard({ initialContact: contact })
    next()
    clickRadio('Pas de signal précis')
    next()
    clickRadio(/Un profil disponible/)
    next()
    clickRadio('Une réponse')
    next()
    expect(screen.getByText('Modèle proposé : Consultant en inter-contrat')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Changer de modèle' }))
    fireEvent.click(screen.getByRole('radio', { name: /Appel d’offres/ }))
    expect(screen.getByText('Modèle proposé : Appel d’offres')).toBeTruthy()
  })

  it('Laura prépare les messages de chaque étape qui s’écrit, avec le contexte du compte ; la note LinkedIn reste vide', async () => {
    renderWizard({ initialContact: contact, initialPlaybook: 'hiring_signal' })
    next()
    next()
    clickRadio(/Un profil disponible/)
    next()
    clickRadio('Un échange (appel ou rendez-vous)')
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Laura prépare les messages' }))
    await waitFor(() => expect(screen.getByText('Messages prêts : relis et modifie avant d’inscrire.')).toBeTruthy())
    // A : e-mail, invitation (non rédigée), message, appel, e-mail → 4 appels au moteur.
    expect(prepareMock).toHaveBeenCalledTimes(4)
    const first = prepareMock.mock.calls[0]?.[0]
    expect(first.contactId).toBe(contact.id)
    expect(first.context).toContain('Un profil disponible')
    expect(first.context).toContain('Signal de recrutement')
    expect(screen.getAllByDisplayValue('Bonjour Marie, une idée pour Acme ?').length).toBe(2)
  })

  it('affiche le score de qualité à côté des étapes e-mail et LinkedIn, avec les critères nommés', async () => {
    prepareMock.mockResolvedValue({ subject: 'x'.repeat(80), body: 'Bonjour Marie ? Et Acme ?' })
    renderWizard({ initialContact: contact, initialPlaybook: 'warm_contact' })
    next()
    next()
    next()
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Laura prépare les messages' }))
    await waitFor(() => expect(screen.getAllByTestId('message-quality').length).toBeGreaterThan(0))
    const badge = screen.getAllByTestId('message-quality')[0] as HTMLElement
    expect(badge.textContent).toMatch(/À revoir : .*pas exactement une question/)
    expect(badge.textContent).toMatch(/objet absent ou trop long/)
  })

  it('#4163 LF — l’aperçu montre la qualité AVANT que Laura prépare : « non évaluée », jamais une note nue', () => {
    renderWizard({ initialContact: contact, initialPlaybook: 'warm_contact' })
    next()
    next()
    next()
    next()
    const badges = screen.getAllByTestId('message-quality')
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) expect(badge.textContent).toMatch(/Qualité non évaluée : le texte est vide/)
    expect(screen.queryByText(/critères tenus/)).toBeNull()
  })

  it('un message que Laura n’a pas pu préparer reste VIDE et le dit — rien d’inventé', async () => {
    prepareMock.mockResolvedValue(null)
    renderWizard({ initialContact: contact, initialPlaybook: 'warm_contact' })
    next()
    next()
    next()
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Laura prépare les messages' }))
    await waitFor(() => expect(screen.getAllByText(/Laura n’a rien pu préparer pour cette étape/).length).toBe(2))
    expect(screen.queryAllByTestId('message-quality')).toHaveLength(0)
  })

  it('tout est éditable avant d’inscrire, et la requête porte le texte édité, en jours ouvrés', async () => {
    renderWizard({ initialContact: contact, initialPlaybook: 'warm_contact' })
    next()
    next()
    next()
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Laura prépare les messages' }))
    await waitFor(() => expect(screen.getByText('Messages prêts : relis et modifie avant d’inscrire.')).toBeTruthy())
    fireEvent.change(screen.getByRole('textbox', { name: 'Message — E-mail' }), {
      target: { value: 'Mon texte, Marie, chez Acme ?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Inscrire la séquence' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const request = createMock.mock.calls[0]?.[0]
    expect(request.delay_unit).toBe('business_days')
    expect(request.name).toBe('Contact tiède (salon, visite) — Marie Dubois')
    expect(request.contact_id).toBe(contact.id)
    expect(request.steps.map((step: { kind: string }) => step.kind)).toEqual(['linkedin_invite', 'email', 'call'])
    const emailStep = request.steps[1]
    expect(emailStep.draft).toEqual({ subject: 'Votre poste de Lead Data', body: 'Mon texte, Marie, chez Acme ?' })
    // L'invitation LinkedIn part sans note tant que personne n'en écrit une.
    expect(request.steps[0].draft).toBeUndefined()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('une exclusion forçable se NOMME et se lève d’un geste ; un refus RGPD bloque l’inscription', async () => {
    eligibilityMock.mockReturnValue({
      data: {
        contacts: [
          {
            contact_id: contact.id,
            contact_name: 'Marie Dubois',
            exclusions: [{ code: 'recently_contacted', forceable: true }],
            client_status_known: true,
          },
        ],
      },
    })
    renderWizard({ initialContact: contact, initialPlaybook: 'warm_contact' })
    next()
    next()
    next()
    next()
    expect(screen.getByTestId('enrollment-exclusions')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Inscrire la séquence' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    expect(createMock.mock.calls[0]?.[0].override_exclusions).toBe(true)
  })

  it('opposition RGPD : le bouton Inscrire est désactivé', () => {
    eligibilityMock.mockReturnValue({
      data: {
        contacts: [
          {
            contact_id: contact.id,
            contact_name: 'Marie Dubois',
            exclusions: [{ code: 'rgpd_opposition', forceable: false }],
            client_status_known: true,
          },
        ],
      },
    })
    renderWizard({ initialContact: contact, initialPlaybook: 'warm_contact' })
    next()
    next()
    next()
    next()
    expect((screen.getByRole('button', { name: 'Inscrire la séquence' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('dit que rien ne part tout seul', () => {
    renderWizard({ initialContact: contact, initialPlaybook: 'warm_contact' })
    next()
    next()
    next()
    next()
    expect(screen.getByText(/Aucun message ne part tout seul/)).toBeTruthy()
    expect(within(screen.getByRole('dialog')).queryByText(/taux de réponse/i)).toBeNull()
  })
})
