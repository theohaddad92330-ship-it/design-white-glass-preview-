import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CreateMissionFromDocumentDialog } from './CreateMissionFromDocumentDialog'

const createMission = vi.fn()
const demo = { current: false }
const extractMission = vi.fn()

vi.mock('@/features/missions/api', () => ({
  useCreateMission: () => ({ mutate: createMission, isPending: false }),
}))

vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.current }))

vi.mock('@/features/missions/mission-extraction', () => ({
  extractMission: (...args: unknown[]) => extractMission(...args),
}))

const ACCOUNT = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  demo.current = false
  createMission.mockReset()
  extractMission.mockReset()
})

function emptyField() {
  return { value: null, confidence: 0, sourceExcerpt: '' }
}

/**
 * #2560 — « créer une mission depuis un contrat, une fiche de poste ou un
 * e-mail ». Ce que ces tests protègent :
 *
 *  1. Le COMPTE ne se saisit ni ne s'extrait ici — il vient du contexte
 *     (`accountId`/`accountName` reçus en props), jamais deviné du document.
 *  2. Une extraction est une PROPOSITION : les champs lus se pré-remplissent,
 *     modifiables, et RIEN n'est créé avant le clic sur « Créer la mission ».
 *  3. Un champ que le document ne dit pas reste VIDE, jamais inventé — la
 *     garde qui sait dire NON : un jour halluciné romprait ce test.
 */
describe('CreateMissionFromDocumentDialog', () => {
  it('pré-remplit les champs proposés, et laisse les champs absents vides', async () => {
    extractMission.mockResolvedValue({
      status: 'ok',
      costUsd: 0.001,
      fields: {
        accountName: { value: 'Acme Corp', confidence: 0.9, sourceExcerpt: 'Acme Corp' },
        roleTitle: { value: 'Développeur backend', confidence: 0.9, sourceExcerpt: 'Poste : Développeur backend' },
        startedOn: { value: '2026-10-01', confidence: 0.9, sourceExcerpt: 'Début : 2026-10-01' },
        endsOn: emptyField(),
        dailyRate: { value: 550, confidence: 0.9, sourceExcerpt: 'TJM : 550 euros' },
        days: { value: 120, confidence: 0.9, sourceExcerpt: 'Volume : 120 jours' },
      },
    })
    renderWithRouter(
      <CreateMissionFromDocumentDialog accountId={ACCOUNT} accountName="Acme Corp" open onOpenChange={() => {}} />,
    )

    await userEvent.type(await screen.findByLabelText('Coller le texte du document'), 'Fiche de mission')
    await userEvent.click(screen.getByRole('button', { name: 'Lire ce texte' }))

    expect(await screen.findByLabelText('Rôle')).toHaveValue('Développeur backend')
    expect(screen.getByLabelText('TJM (€)')).toHaveValue(550)
    // La fin n'a pas été lue : le champ reste vide, jamais une date devinée.
    expect(screen.getByLabelText('Fin prévue')).toHaveValue('')
    // Les jours PROPOSÉS se montrent, mais ne sont pas un champ soumis (#2560.5).
    expect(screen.getByText('120 jours')).toBeInTheDocument()
  })

  // #2732.1 + #5022.1 (recette prod 31/10) — « l'écran ne dit pas les formats acceptés ».
  it('dit les formats lus AVANT le dépôt, et ce qui n’est pas lu', async () => {
    renderWithRouter(
      <CreateMissionFromDocumentDialog accountId={ACCOUNT} accountName="Acme Corp" open onOpenChange={() => {}} />,
    )
    const formats = await screen.findByText(/Formats lus/i)
    expect(formats).toHaveTextContent(/PDF/)
    expect(formats).toHaveTextContent(/Word/)
    expect(formats).toHaveTextContent(/PDF scanné/)
  })

  it('le clic sur « Créer la mission » écrit avec l’accountId du CONTEXTE, jamais du document', async () => {
    extractMission.mockResolvedValue({
      status: 'ok',
      costUsd: 0.001,
      fields: {
        accountName: { value: 'Une autre entreprise', confidence: 0.9, sourceExcerpt: 'Une autre entreprise' },
        roleTitle: { value: 'Développeur backend', confidence: 0.9, sourceExcerpt: 'Poste : Développeur backend' },
        startedOn: emptyField(),
        endsOn: emptyField(),
        dailyRate: emptyField(),
        days: emptyField(),
      },
    })
    renderWithRouter(
      <CreateMissionFromDocumentDialog accountId={ACCOUNT} accountName="Acme Corp" open onOpenChange={() => {}} />,
    )

    await userEvent.type(await screen.findByLabelText('Coller le texte du document'), 'Fiche de mission')
    await userEvent.click(screen.getByRole('button', { name: 'Lire ce texte' }))
    await screen.findByLabelText('Rôle')
    await userEvent.click(screen.getByRole('button', { name: 'Créer la mission' }))

    expect(createMission).toHaveBeenCalledWith(expect.objectContaining({ accountId: ACCOUNT }), expect.anything())
  })

  it('rien n’est créé avant le clic — la lecture seule ne mute rien', async () => {
    extractMission.mockResolvedValue({
      status: 'ok',
      costUsd: 0.001,
      fields: {
        accountName: emptyField(),
        roleTitle: { value: 'Développeur backend', confidence: 0.9, sourceExcerpt: 'Poste : Développeur backend' },
        startedOn: emptyField(),
        endsOn: emptyField(),
        dailyRate: emptyField(),
        days: emptyField(),
      },
    })
    renderWithRouter(
      <CreateMissionFromDocumentDialog accountId={ACCOUNT} accountName="Acme Corp" open onOpenChange={() => {}} />,
    )

    await userEvent.type(await screen.findByLabelText('Coller le texte du document'), 'Fiche de mission')
    await userEvent.click(screen.getByRole('button', { name: 'Lire ce texte' }))
    await screen.findByLabelText('Rôle')

    expect(createMission).not.toHaveBeenCalled()
  })

  // X66 / #3547 — LE FORFAIT ENCADRÉ, proposé depuis le document : l'interrupteur
  // arrive allumé SEULEMENT si le document le dit (avec sa citation), reste
  // modifiable, et la création part au forfait avec le mode.
  describe('forfait encadré (#3547)', () => {
    const base = {
      status: 'ok',
      costUsd: 0.001,
      fields: {
        accountName: emptyField(),
        roleTitle: { value: 'Cadrage paiement', confidence: 0.9, sourceExcerpt: 'Poste : Cadrage paiement' },
        startedOn: emptyField(),
        endsOn: emptyField(),
        dailyRate: emptyField(),
        days: emptyField(),
      },
    }

    async function readDocument() {
      renderWithRouter(
        <CreateMissionFromDocumentDialog accountId={ACCOUNT} accountName="Acme Corp" open onOpenChange={() => {}} />,
      )
      await userEvent.type(await screen.findByLabelText('Coller le texte du document'), 'Fiche de mission')
      await userEvent.click(screen.getByRole('button', { name: 'Lire ce texte' }))
      await screen.findByLabelText('Rôle')
    }

    it('un document qui le dit PROPOSE le forfait encadré, cité, et la création l’écrit au forfait', async () => {
      extractMission.mockResolvedValue({
        ...base,
        fields: {
          ...base.fields,
          supervisedForfait: {
            value: 'supervised',
            confidence: 0.9,
            sourceExcerpt: 'réalisé par les équipes internes du client',
          },
        },
      })
      await readDocument()

      expect(screen.getByRole('switch', { name: 'Forfait encadré, sans consultants' })).toBeChecked()
      expect(screen.getByText(/réalisé par les équipes internes du client/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Créer la mission' }))

      expect(createMission).toHaveBeenCalledWith(
        expect.objectContaining({ contractKind: 'forfait', deliveryMode: 'supervised' }),
        expect.anything(),
      )
    })

    it('un document qui ne le dit pas : interrupteur éteint, aucun mode envoyé', async () => {
      extractMission.mockResolvedValue(base)
      await readDocument()

      expect(screen.getByRole('switch', { name: 'Forfait encadré, sans consultants' })).not.toBeChecked()
      await userEvent.click(screen.getByRole('button', { name: 'Créer la mission' }))

      const body = createMission.mock.calls[0]?.[0] as Record<string, unknown>
      expect(body).not.toHaveProperty('deliveryMode')
      expect(body).not.toHaveProperty('contractKind')
    })
  })
})

/**
 * Décision Louis 12/10 (lot DEMO-PRODUIT) — plus de document d'exemple : en démo, le
 * prospect dépose SON document comme un client. #3547 l'avait ajouté pour rejouer
 * l'extraction ; le geste reste le même, sans faux document proposé.
 */
describe('CreateMissionFromDocumentDialog — aucun document d’exemple, en démo comme hors démo', () => {
  it.each([true, false])('démo = %s : on ne propose jamais de faux document', async isDemo => {
    demo.current = isDemo
    renderWithRouter(
      <CreateMissionFromDocumentDialog accountId={ACCOUNT} accountName="Acme Corp" open onOpenChange={() => {}} />,
    )
    await screen.findByLabelText('Coller le texte du document')
    expect(screen.queryByRole('button', { name: 'Insérer un document d’exemple' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lire ce texte' })).toBeDisabled()
  })
})
