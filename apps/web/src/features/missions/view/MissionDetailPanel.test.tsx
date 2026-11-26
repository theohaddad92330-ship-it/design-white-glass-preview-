import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionAssignment } from '@bellum/contracts'
import type { MissionView } from '../api'
import type { MissionContactsPanel } from './mission-panel.api'
import { chooseOption } from '@/test/select'

const terms = vi.fn()
const missionPanel = vi.fn()
const accountContacts = vi.fn()
const setCraContact = vi.fn()
const setClientManager = vi.fn()
const updateMission = vi.fn()
const missionAssignments = vi.fn()
const assign = vi.fn()
const unassign = vi.fn()
const resolveMissionRisk = vi.fn()

// #1518 — le bloc « société qui porte la mission » lit les entités juridiques.
// Ce fichier garde l'EN-TÊTE du panneau : la liste des sociétés n'en fait pas
// partie, et sans ce faux le hook réclamerait un client de requêtes.
const legalEntities = vi.hoisted(() => ({ current: [] as { id: string; name: string; archived: boolean }[] }))
vi.mock('@/features/legal-entities/api', () => ({ useLegalEntities: () => ({ data: legalEntities.current }) }))

vi.mock('../api', () => ({
  useMissionTerms: () => terms(),
  useMissionAssignments: () => missionAssignments(),
  useAssign: () => assign(),
  useUnassign: () => unassign(),
}))
vi.mock('./mission-panel.api', () => ({
  useMissionPanel: () => missionPanel(),
  useAccountContacts: () => accountContacts(),
  useSetCraContact: () => setCraContact(),
  useSetClientManager: () => setClientManager(),
  useUpdateMission: () => updateMission(),
  useResolveMissionRisk: () => resolveMissionRisk(),
}))
/** ⚠️ Le faux `Link` REND ce que le vrai rendrait — même précaution que
 *  `MissionDetailSheet.test.tsx` : un mock qui jette `params` teste le mock,
 *  pas le composant. */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { MissionDetailPanel } = await import('./MissionDetailPanel')

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label: 'Renfort plateforme',
    status: 'active',
    started_on: '2026-02-01',
    ends_on: null,
    daily_rate: null,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: null,
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    accountName: 'ACME',
    renewal: 'unknown',
    risks: [],
    marginPercent: null,
    assignees: [],
    ...over,
  }
}

function panel(over: Partial<MissionContactsPanel> = {}): MissionContactsPanel {
  return {
    entity: null,
    consultant: null,
    businessManager: null,
    craValidator: null,
    clientManager: null,
    clientManagerContactId: null,
    billingRecipientEmail: null,
    crmDeal: null,
    ...over,
  }
}

function show(missionOver: Partial<MissionView> = {}) {
  render(<MissionDetailPanel mission={mission(missionOver)} onClose={() => {}} />)
}

beforeEach(() => {
  cleanup()
  terms.mockReset().mockReturnValue({
    data: {
      canReadFinance: false,
      terms: null,
      margin: null,
      expensesTotalCents: null,
      supplierInvoicesTotalCents: null,
      marginWithExpenses: null,
    },
    isPending: false,
  })
  missionPanel.mockReset().mockReturnValue({ data: panel(), isLoading: false })
  accountContacts.mockReset().mockReturnValue({ data: [], isLoading: false })
  setCraContact.mockReset().mockReturnValue({ mutate: vi.fn() })
  setClientManager.mockReset().mockReturnValue({ mutate: vi.fn() })
  updateMission.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  missionAssignments.mockReset().mockReturnValue({ data: [], isError: false })
  assign.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  unassign.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  resolveMissionRisk.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
})

/**
 * LE PANNEAU LATÉRAL DE PLANIFICATION — « Mission sélectionnée » (PDF-22 §7).
 *
 * Trois principes tenus par ces tests :
 *  1. le TJM CLIENT n'est jamais gardé, le TJM FREELANCE l'est toujours ;
 *  2. les trois contacts se rendent séparément, chacun avec son absence NOMMÉE ;
 *  3. la prochaine étape porte un niveau d'impact, ou ne s'affiche pas du tout.
 */
describe('MissionDetailPanel — l’en-tête', () => {
  it('nomme la mission, le compte et son statut', () => {
    show({ label: 'Fiabilisation plateforme', accountName: 'Lacoste', status: 'active' })
    expect(screen.getByText('Fiabilisation plateforme')).toBeInTheDocument()
    expect(screen.getByText('Lacoste')).toBeInTheDocument()
  })

  it('ferme sur un clic — le bouton porte un nom accessible malgré son icône seule (GA-32)', async () => {
    const onClose = vi.fn()
    render(<MissionDetailPanel mission={mission()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /fermer/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('offre d’ouvrir le dossier complet, à son adresse interpolée', () => {
    show({ id: '55555555-5555-4555-8555-555555555555' })
    const door = screen.getByRole('link', { name: /voir la mission/i })
    expect(door).toHaveAttribute('href', '/missions/55555555-5555-4555-8555-555555555555')
  })
})

// #2194.32
describe('MissionDetailPanel — renseigner une date manquante', () => {
  it('n’affiche RIEN quand les deux dates sont connues', () => {
    show({ started_on: '2026-02-01', ends_on: '2026-08-01' })
    expect(screen.queryByText(/date de fin non renseignée/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /renseigner la date/i })).not.toBeInTheDocument()
  })

  it('nomme l’absence de la date de fin, avec un geste pour la renseigner', () => {
    show({ started_on: '2026-02-01', ends_on: null })
    expect(screen.getByText(/fin non renseignée/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /renseigner la date de fin/i })).toBeInTheDocument()
  })

  it('écrit la date sur la mission une fois saisie et confirmée', async () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    show({ started_on: '2026-02-01', ends_on: null })
    await userEvent.click(screen.getByRole('button', { name: /renseigner la date de fin/i }))
    const field = screen.getByLabelText(/date de fin prévue/i) as HTMLInputElement
    fireEvent.change(field, { target: { value: '2026-10-15' } })
    await userEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }))
    expect(mutate).toHaveBeenCalledWith({ endsOn: '2026-10-15' }, expect.anything())
  })

  it('propose les DEUX champs quand aucune date n’est connue', () => {
    show({ started_on: null, ends_on: null })
    expect(screen.getByRole('button', { name: /renseigner la date de début/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /renseigner la date de fin/i })).toBeInTheDocument()
  })
})

describe('MissionDetailPanel — l’entité cliente', () => {
  it('affiche raison sociale, adresse et SIREN quand ils sont connus', () => {
    missionPanel.mockReturnValue({
      data: panel({
        entity: { name: 'Lacoste Operations Market', address: '10080 Troyes, France', siren: '123456789' },
      }),
      isLoading: false,
    })
    show()
    expect(screen.getByText('Lacoste Operations Market')).toBeInTheDocument()
    expect(screen.getByText('10080 Troyes, France')).toBeInTheDocument()
    expect(screen.getByText(/123456789/)).toBeInTheDocument()
  })

  it('NOMME l’absence d’entité plutôt que de laisser un vide', () => {
    missionPanel.mockReturnValue({ data: panel({ entity: null }), isLoading: false })
    show()
    expect(screen.getByText(/raison sociale non renseignée/i)).toBeInTheDocument()
  })
})

describe('MissionDetailPanel — le deal CRM rattaché (#2561)', () => {
  it('sans deal rattaché, AUCUNE section — la quasi-totalité des missions n’en ont pas', () => {
    missionPanel.mockReturnValue({ data: panel({ crmDeal: null }), isLoading: false })
    show()
    expect(screen.queryByText(/vente crm rattachée/i)).not.toBeInTheDocument()
  })

  it('montre le deal, champ par champ, avec la correspondance NOMMÉE — jamais devinée en silence', () => {
    missionPanel.mockReturnValue({
      data: panel({
        crmDeal: {
          provider: 'hubspot',
          dealId: '55501',
          name: 'Renouvellement Q4',
          stage: 'negotiation',
          stageLabel: 'Négociation',
          amount: '24000',
          isClosed: false,
          isWon: null,
        },
      }),
      isLoading: false,
    })
    show()
    expect(screen.getByText(/vente crm rattachée/i)).toBeInTheDocument()
    expect(screen.getByText('Renouvellement Q4')).toBeInTheDocument()
    expect(screen.getByText('Négociation')).toBeInTheDocument()
    // Le nom de l'outil vient de `clientToolName('hubspot')` — jamais un
    // littéral « HubSpot » écrit dans le composant.
    expect(screen.getByText(/dans hubspot/i)).toBeInTheDocument()
  })

  it('NOMME un nom, un stade ou un montant absents plutôt qu’un vide muet', () => {
    missionPanel.mockReturnValue({
      data: panel({
        crmDeal: {
          provider: 'hubspot',
          dealId: '55501',
          name: null,
          stage: null,
          stageLabel: null,
          amount: null,
          isClosed: false,
          isWon: null,
        },
      }),
      isLoading: false,
    })
    show()
    expect(screen.getByText(/nom du deal non renseigné/i)).toBeInTheDocument()
    expect(screen.getByText(/stade non renseigné/i)).toBeInTheDocument()
    expect(screen.getByText(/montant non renseigné/i)).toBeInTheDocument()
  })

  it('un outil non reconnu de CLIENT_TOOLS ne se nomme pas — la capacité, pas un nom deviné', () => {
    missionPanel.mockReturnValue({
      data: panel({
        crmDeal: {
          provider: 'un-provider-inconnu',
          dealId: '1',
          name: 'Deal X',
          stage: null,
          stageLabel: null,
          amount: null,
          isClosed: false,
          isWon: null,
        },
      }),
      isLoading: false,
    })
    show()
    expect(screen.getByText(/dans ton outil connecté/i)).toBeInTheDocument()
  })
})

describe('MissionDetailPanel — conditions financières : le TJM client n’est jamais gardé', () => {
  it('affiche le TJM CLIENT même SANS le droit financier', () => {
    terms.mockReturnValue({
      data: { canReadFinance: false, terms: null, margin: null },
      isPending: false,
    })
    show({ daily_rate: 620 })
    expect(screen.getByText(/620/)).toBeInTheDocument()
  })

  it('NOMME un TJM client absent plutôt que « 0 »', () => {
    show({ daily_rate: null })
    expect(screen.queryByText(/^0\s*€/)).not.toBeInTheDocument()
  })

  it('cache le TJM FREELANCE et le bon de commande sans le droit financier', () => {
    terms.mockReturnValue({
      data: { canReadFinance: false, terms: null, margin: null },
      isPending: false,
    })
    show()
    expect(screen.getByText(/périmètre/i)).toBeInTheDocument()
    expect(screen.queryByText(/bon de commande/i)).not.toBeInTheDocument()
  })

  it('montre le TJM FREELANCE et le bon de commande avec le droit financier', () => {
    terms.mockReturnValue({
      data: {
        canReadFinance: true,
        terms: {
          missionId: '11111111-1111-4111-8111-111111111111',
          loadedDailyCostCents: 57_900,
          channel: 'direct',
          requiresPo: true,
          poNumber: 'PO-2026-0418',
          poIssuedOn: '2026-07-15',
          poAmountCents: 1_860_000,
          poVolumeDays: 50,
          poConsumedDays: 28,
          poConsumption: { percent: 56, remainingDays: 22 },
          billingCadence: 'monthly',
          partnerCommissionDailyCents: null,
          noticeDays: 30,
          notes: null,
          paymentTermsDays: 60,
          paymentTermsBasis: 'end_of_month',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        margin: { amountCents: 6_100, percent: 10 },
      },
      isPending: false,
    })
    show()
    expect(screen.getByText(/579/)).toBeInTheDocument()
    expect(screen.getByText('PO-2026-0418')).toBeInTheDocument()
    // Les conditions de règlement — l’exemple même de la fiche de lecture.
    expect(screen.getByText(/60 jours/)).toBeInTheDocument()
    expect(screen.getByText(/fin de mois/)).toBeInTheDocument()
  })

  it('NOMME des conditions de règlement non renseignées, jamais un vide muet', () => {
    terms.mockReturnValue({
      data: {
        canReadFinance: true,
        terms: {
          missionId: '11111111-1111-4111-8111-111111111111',
          loadedDailyCostCents: null,
          channel: 'unknown',
          requiresPo: false,
          poNumber: null,
          poIssuedOn: null,
          poAmountCents: null,
          poVolumeDays: null,
          poConsumedDays: null,
          poConsumption: null,
          billingCadence: null,
          partnerCommissionDailyCents: null,
          noticeDays: null,
          notes: null,
          paymentTermsDays: null,
          paymentTermsBasis: null,
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        margin: null,
      },
      isPending: false,
    })
    show()
    expect(screen.getByText(/conditions de règlement non renseignées/i)).toBeInTheDocument()
  })
})

describe('MissionDetailPanel — les trois contacts', () => {
  it('rend le consultant, le chargé d’affaires et le contact CRA, séparément', () => {
    missionPanel.mockReturnValue({
      data: panel({
        consultant: { name: 'Yannick Succab', email: 'ysuccab@gmail.com', phone: '+33678787875' },
        businessManager: { name: 'Maureen Incrociati', email: 'maureen@example.com', phone: null },
        craValidator: { name: 'Julien Dubois', email: 'jdubois@lacoste.com', phone: null },
      }),
      isLoading: false,
    })
    show()
    expect(screen.getByText('Yannick Succab')).toBeInTheDocument()
    expect(screen.getByText('Maureen Incrociati')).toBeInTheDocument()
    expect(screen.getByText('Julien Dubois')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ysuccab@gmail.com' })).toHaveAttribute('href', 'mailto:ysuccab@gmail.com')
    // #3850.4 — stockage E.164 compact (+33678787875), AFFICHAGE international lisible.
    expect(screen.getByRole('link', { name: '+33 6 78 78 78 75' })).toHaveAttribute('href', 'tel:+33678787875')
    expect(screen.queryByText('+33678787875')).toBeNull()
  })

  it('NOMME un contact non désigné plutôt qu’une carte vide', () => {
    show()
    expect(screen.getAllByText(/non désigné/i).length).toBeGreaterThan(0)
  })

  it('« Changer le contact CRA » ouvre un sélecteur, et l’enregistrement APPELLE la mutation', async () => {
    accountContacts.mockReturnValue({
      data: [{ id: 'c1', full_name: 'Ferdinand Aumont' }],
      isLoading: false,
    })
    const mutate = vi.fn()
    setCraContact.mockReturnValue({ mutate })
    show()
    await userEvent.click(screen.getByRole('button', { name: /changer le contact cra/i }))
    await chooseOption(screen.getByRole('combobox', { name: /choisir le contact cra/i }), 'c1')
    expect(mutate).toHaveBeenCalledWith('c1', expect.anything())
  })
})

/**
 * #2836 — LE MANAGER CLIENT : l'écran d'affectation. Le panneau nomme celui
 * qui est désigné, et le geste « Désigner le manager client » ÉCRIT — un
 * champ lu sans écrivain serait une colonne que personne ne remplit.
 */
describe('#2836 — MissionDetailPanel, le manager client', () => {
  it('nomme le manager client désigné, distinct du contact CRA', () => {
    missionPanel.mockReturnValue({
      data: panel({
        craValidator: { name: 'Julien Dubois', email: 'jdubois@lacoste.com', phone: null },
        clientManager: { name: 'Hélène Marchal', email: 'hmarchal@lacoste.com', phone: null },
        clientManagerContactId: 'c2',
      }),
      isLoading: false,
    })
    show()
    expect(screen.getByText('Manager client')).toBeInTheDocument()
    expect(screen.getByText('Hélène Marchal')).toBeInTheDocument()
    expect(screen.getByText('Julien Dubois')).toBeInTheDocument()
  })

  it('le sélecteur part du contact désigné, et un nouveau choix APPELLE la mutation', async () => {
    accountContacts.mockReturnValue({
      data: [
        { id: 'c1', full_name: 'Ferdinand Aumont' },
        { id: 'c2', full_name: 'Hélène Marchal' },
      ],
      isLoading: false,
    })
    missionPanel.mockReturnValue({
      data: panel({
        clientManager: { name: 'Hélène Marchal', email: null, phone: null },
        clientManagerContactId: 'c2',
      }),
      isLoading: false,
    })
    const mutate = vi.fn()
    setClientManager.mockReturnValue({ mutate })
    show()
    await userEvent.click(screen.getByRole('button', { name: /désigner le manager client/i }))
    const combo = screen.getByRole('combobox', { name: /choisir le manager client/i })
    expect(combo).toHaveTextContent('Hélène Marchal')
    await chooseOption(combo, 'c1')
    expect(mutate).toHaveBeenCalledWith('c1', expect.anything())
    expect(setCraContact().mutate).not.toHaveBeenCalled()
  })
})

describe('MissionDetailPanel — la prochaine étape suggérée', () => {
  // #2411.8 (épopée #2881) — l'échelle DÉFINITIVE de sévérité remplace l'ancien
  // niveau d'impact à trois crans (#2195) : le manque nommé par la fiche de
  // lecture reste le même, l'échelle affichée est désormais celle du moteur
  // de risque.
  it('porte une SÉVÉRITÉ — le manque nommé par la fiche de lecture', () => {
    show({ risks: ['timesheet_disputed'] })
    expect(screen.getByText(/critique/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voir dans la mission/i })).toBeInTheDocument()
  })

  it('un renouvellement non engagé est EN RISQUE', () => {
    show({ risks: ['renewal_not_started'] })
    expect(screen.getByText(/en risque/i)).toBeInTheDocument()
  })

  it('l’absence de chargé d’affaires est NON MESURÉE — une donnée manquante, pas un fait avéré', () => {
    show({ risks: ['missing_owner'] })
    // Portée sur la ligne de titre : « non mesuré » apparaît aussi ailleurs
    // sur la fiche (entité cliente, dates), sans lien avec cette sévérité.
    const titleRow = screen.getByText('Prochaine étape suggérée').closest('div')
    expect(titleRow).not.toBeNull()
    expect(within(titleRow!).getByText(/non mesuré/i)).toBeInTheDocument()
  })

  it('sans aucun risque, dit qu’il n’y a rien à signaler — jamais une étape inventée', () => {
    show({ risks: [] })
    expect(screen.getByText(/rien à signaler/i)).toBeInTheDocument()
    // Portée sur la LIGNE de titre de la section : « non mesuré » apparaît
    // ailleurs sur la fiche (entité cliente, dates), sans lien avec la
    // sévérité de la prochaine étape.
    const titleRow = screen.getByText('Prochaine étape suggérée').closest('div')
    expect(titleRow).not.toBeNull()
    expect(titleRow!.querySelector('[class*="rounded-full"]')).toBeNull()
  })

  // #2411.11 (reste, épopée #2881) — « Marquer comme traité » un risque déjà
  // calculé, PERSISTÉ (`useResolveMissionRisk` → `PATCH …/risks/:risk`).
  it('« Marquer comme traité » appelle la résolution avec le risque affiché — jamais un autre', () => {
    const mutate = vi.fn()
    resolveMissionRisk.mockReturnValue({ mutate, isPending: false })
    show({ risks: ['timesheet_disputed', 'no_end_date'] })
    fireEvent.click(screen.getByRole('button', { name: /marquer comme traité/i }))
    expect(mutate).toHaveBeenCalledWith('timesheet_disputed')
    expect(mutate).not.toHaveBeenCalledWith('no_end_date')
  })

  it('sans risque affiché, aucun bouton « Marquer comme traité » — rien à résoudre', () => {
    show({ risks: [] })
    expect(screen.queryByRole('button', { name: /marquer comme traité/i })).not.toBeInTheDocument()
  })

  it('désactive le bouton pendant l’écriture — jamais un double geste', () => {
    resolveMissionRisk.mockReturnValue({ mutate: vi.fn(), isPending: true })
    show({ risks: ['timesheet_disputed'] })
    expect(screen.getByRole('button', { name: /marquer comme traité/i })).toBeDisabled()
  })
})

/**
 * LE CONTACT DE FACTURATION — le geste qui manquait.
 *
 * `missing_billing_contact` est un bloqueur de facturation, et
 * `BLOCKER_ACTIONS` promet qu'il « se répare sur la fiche de mission ». Aucun
 * écran ne l'écrivait : la colonne n'était renseignée qu'à la création, et
 * seulement par le semis de démonstration. Mesuré le 01/09/2026 sur un espace
 * réel : 11 missions sur 11 bloquées par ce seul motif.
 */
describe('MissionDetailPanel — le contact de facturation', () => {
  it('nomme son absence plutôt que de la taire', () => {
    show()
    expect(screen.getByText(/à qui part la facture/i)).toBeInTheDocument()
  })

  it('affiche le destinataire quand il est connu', () => {
    missionPanel.mockReturnValue({
      data: panel({ billingRecipientEmail: 'compta@acme.fr' }),
      isLoading: false,
    })
    show()
    expect(screen.getByText('compta@acme.fr')).toBeInTheDocument()
  })

  it('écrit le contact choisi sur la mission — pas sur le contact CRA', async () => {
    const mutate = vi.fn()
    updateMission.mockReturnValue({ mutate, isPending: false })
    accountContacts.mockReturnValue({
      data: [{ id: '99999999-9999-4999-8999-999999999999', full_name: 'Sonia Ferreira' }],
      isLoading: false,
    })
    show()
    await userEvent.click(screen.getByRole('button', { name: /changer le contact de facturation/i }))
    const picker = screen.getByRole('combobox', { name: /contact de facturation/i })
    await chooseOption(picker, '99999999-9999-4999-8999-999999999999')
    expect(mutate).toHaveBeenCalledWith({ billingContactId: '99999999-9999-4999-8999-999999999999' }, expect.anything())
  })
})

/**
 * #1518 — LA SOCIÉTÉ QUI PORTE LA MISSION.
 *
 * `missions.legal_entity_id` existait depuis la migration des entités
 * juridiques ; le panneau Finance la LIT et le filtre de pilotage FILTRE
 * dessus. Son SEUL écrivain était le semis de démo : en production, déclarer
 * une seconde société ne servait à rien, rien ne pouvait y rattacher une
 * mission.
 */
/**
 * #2194.36 — MODIFIER UNE AFFECTATION DEPUIS LE PLANNING.
 *
 * `useAssign` existait sans appelant UI ; ces tests couvrent le geste ajouté
 * ICI, dans le panneau ouvert depuis le Gantt — pas la simple lecture
 * (déjà couverte côté `MissionDetailTabs`/`StaffingTab`).
 */
describe('MissionDetailPanel — modifier une affectation (#2194.36)', () => {
  function assignment(over: Partial<MissionAssignment> = {}): MissionAssignment {
    return {
      id: 'a1',
      missionId: '11111111-1111-4111-8111-111111111111',
      missionLabel: 'Renfort plateforme',
      accountName: 'ACME',
      consultantId: 'c1',
      consultantName: 'Yannick Succab',
      loadPercent: 80,
      startsOn: '2026-02-01',
      endsOn: '2026-08-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      workLocation: null,
      remoteMode: null,
      consentGiven: null,
      consentDate: null,
      documentsExpected: null,
      documentsReceived: null,
      declaredRisks: null,
      ...over,
    }
  }

  it('nomme l’absence d’affectation plutôt qu’une liste vide muette', () => {
    missionAssignments.mockReturnValue({ data: [], isError: false })
    show()
    expect(screen.getByText(/personne n’est affecté/i)).toBeInTheDocument()
  })

  it('liste la charge et l’échéance de chaque affectation', () => {
    missionAssignments.mockReturnValue({ data: [assignment()], isError: false })
    show()
    expect(screen.getByText('Yannick Succab')).toBeInTheDocument()
    expect(screen.getByText(/80 %/)).toBeInTheDocument()
  })

  it('« Modifier » ouvre un formulaire pré-rempli avec la charge et les dates actuelles', async () => {
    missionAssignments.mockReturnValue({ data: [assignment({ loadPercent: 60 })], isError: false })
    show()
    await userEvent.click(screen.getByRole('button', { name: /^modifier$/i }))
    expect(screen.getByLabelText(/taux de charge/i)).toHaveValue(60)
    expect(screen.getByLabelText(/début de l’affectation/i)).toHaveValue('2026-02-01')
    expect(screen.getByLabelText(/fin de l’affectation/i)).toHaveValue('2026-08-01')
  })

  it('enregistrer RETIRE l’ancienne ligne puis RECRÉE avec les valeurs éditées, même consultant', async () => {
    const unassignMutate = vi.fn((_id: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    const assignMutate = vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    unassign.mockReturnValue({ mutate: unassignMutate, isPending: false })
    assign.mockReturnValue({ mutate: assignMutate, isPending: false })
    missionAssignments.mockReturnValue({ data: [assignment({ id: 'a9', loadPercent: 60 })], isError: false })
    show()
    await userEvent.click(screen.getByRole('button', { name: /^modifier$/i }))
    fireEvent.change(screen.getByLabelText(/taux de charge/i), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/début de l’affectation/i), { target: { value: '2026-03-01' } })
    await userEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }))
    expect(unassignMutate).toHaveBeenCalledWith('a9', expect.anything())
    expect(assignMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        consultantId: 'c1',
        loadPercent: 100,
        startsOn: '2026-03-01',
        endsOn: '2026-08-01',
      }),
      expect.anything(),
    )
    // Le formulaire se referme une fois la nouvelle ligne créée.
    expect(screen.queryByRole('button', { name: /^enregistrer$/i })).not.toBeInTheDocument()
  })

  it('ne RECOPIE jamais un taux journalier que le lecteur ne peut pas voir — la clé reste absente, jamais `null`', async () => {
    const unassignMutate = vi.fn((_id: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    const assignMutate = vi.fn()
    unassign.mockReturnValue({ mutate: unassignMutate, isPending: false })
    assign.mockReturnValue({ mutate: assignMutate, isPending: false })
    // `dailyRateCents` ABSENT (comme le sert le serveur sans `finance:read`) —
    // pas `undefined` écrit à la main, la clé n'existe simplement pas.
    missionAssignments.mockReturnValue({ data: [assignment()], isError: false })
    show()
    await userEvent.click(screen.getByRole('button', { name: /^modifier$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }))
    const [input] = assignMutate.mock.calls[0] as [Record<string, unknown>, unknown]
    expect('dailyRateCents' in input).toBe(false)
  })

  it('préserve le taux journalier connu quand le lecteur a le droit finance', async () => {
    const unassignMutate = vi.fn((_id: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    const assignMutate = vi.fn()
    unassign.mockReturnValue({ mutate: unassignMutate, isPending: false })
    assign.mockReturnValue({ mutate: assignMutate, isPending: false })
    missionAssignments.mockReturnValue({ data: [assignment({ dailyRateCents: 45_000 })], isError: false })
    show()
    await userEvent.click(screen.getByRole('button', { name: /^modifier$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }))
    expect(assignMutate).toHaveBeenCalledWith(expect.objectContaining({ dailyRateCents: 45_000 }), expect.anything())
  })
})

describe('MissionDetailPanel — la société porteuse (#1518)', () => {
  afterEach(() => {
    legalEntities.current = []
  })

  it('ne pose PAS la question sur un espace mono-société', () => {
    // Un réglage sans alternative n'est pas un réglage : c'est du bruit.
    legalEntities.current = [{ id: 'e1', name: 'Bellum Conseil', archived: false }]
    show()
    expect(document.body.textContent).not.toContain('Société qui porte la mission')
  })

  it('la pose dès que l’espace a DEUX sociétés actives', () => {
    legalEntities.current = [
      { id: 'e1', name: 'Bellum Conseil', archived: false },
      { id: 'e2', name: 'Bellum Régie Sud', archived: false },
    ]
    show()
    expect(document.body.textContent).toContain('Société qui porte la mission')
  })

  it('ne PRÉ-SÉLECTIONNE jamais une société à la place de l’utilisateur', () => {
    // Une raison sociale apparaîtrait sur des documents où personne ne l'a mise.
    legalEntities.current = [
      { id: 'e1', name: 'Bellum Conseil', archived: false },
      { id: 'e2', name: 'Bellum Régie Sud', archived: false },
    ]
    show()
    expect(document.body.textContent).not.toContain('Bellum Conseil')
  })
})
