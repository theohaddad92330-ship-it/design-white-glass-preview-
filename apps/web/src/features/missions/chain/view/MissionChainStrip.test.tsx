import type { InvoiceReadiness } from '@bellum/contracts'
import { cleanup, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../../api'

const invoiceReadiness = vi.fn()

vi.mock('../../api', async () => {
  // ⚠️ `assigneesOf` est la lecture qui soigne les DEUX formes d'affectation
  // (chaîne d'avant le 04/09/2026, objet depuis). La remplacer par un faux
  // testerait le faux ; on garde donc le vrai module et on ne substitue que la
  // requête.
  const actual = await vi.importActual<typeof import('../../api')>('../../api')
  return { ...actual, useInvoiceReadiness: () => invoiceReadiness() }
})

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

const { MissionChainStrip } = await import('./MissionChainStrip')

const MISSION_ID = '11111111-1111-4111-8111-111111111111'
const CONSULTANT_ID = '33333333-3333-4333-8333-333333333333'

function mission(overrides: Partial<MissionView> = {}): MissionView {
  return {
    id: MISSION_ID,
    workspace_id: '44444444-4444-4444-8444-444444444444',
    account_id: '22222222-2222-4222-8222-222222222222',
    opportunity_id: null,
    label: 'Migration du socle applicatif',
    status: 'active',
    started_on: '2026-01-05',
    ends_on: '2026-12-31',
    daily_rate: 620,
    daily_cost: 400,
    contract_kind: 'regie',
    role_title: 'Ingénieure plateforme',
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-05T09:00:00.000Z',
    updated_at: '2026-09-01T09:00:00.000Z',
    marginPercent: 35,
    renewal: 'far',
    assignees: [{ id: CONSULTANT_ID, fullName: 'Inès Kaczmarek', photoUrl: null }],
    ...overrides,
  } as MissionView
}

function readiness(overrides: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: MISSION_ID,
    missionLabel: 'Migration du socle applicatif',
    accountName: 'Cliente Industrie',
    accountId: '22222222-2222-4222-8222-222222222222',
    periodMonth: '2026-08-01',
    state: 'blocked',
    blockers: [],
    days: null,
    preparedAmountCents: null,
    invoicedAt: null,
    invoiceReference: null,
    invoicedAmountCents: null,
    dueOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...overrides,
  }
}

function served(items: InvoiceReadiness[], month = '2026-08') {
  return { data: { items, month, summary: {}, canReadFinance: true }, isPending: false, isError: false }
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('la bande « de la signature au cash »', () => {
  it('rend les CINQ étapes, nommées', () => {
    invoiceReadiness.mockReturnValue(served([readiness()]))
    render(<MissionChainStrip mission={mission()} />)
    for (const label of [
      'Relevé d’activité',
      'CA facturable',
      'Facture préparée',
      'Encaissement',
      'Repositionnement',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  // #2986 — recette démo 10/10 : « La fin approche : quinze jours. » restait affiché alors que le
  // bloc « Repositionnement » (MissionRepositioningPanel) dit déjà pourquoi repositionner, et le
  // mot « Repositionnement » apparaissait deux fois. Quand le bloc est présent, il porte seul le motif.
  it('#2986 : quand le bloc Repositionnement est présent, la bande ne redit pas « La fin approche »', () => {
    invoiceReadiness.mockReturnValue(served([readiness()]))
    render(
      <MissionChainStrip
        mission={mission({
          renewal: 'j15',
          repositionTrigger: { state: 'a_commencer', reasonKey: 'tier_close' },
        })}
      />,
    )
    const strip = screen.getByRole('region', { name: 'De la signature au cash' })
    expect(within(strip).queryByText(/La fin approche/)).not.toBeInTheDocument()
    // L'étape garde son nom : c'est l'une des cinq du parcours.
    expect(within(strip).getByText('Repositionnement')).toBeInTheDocument()
  })

  it('#2986 sait dire NON : sans bloc (pas de déclencheur), la bande garde « La fin approche »', () => {
    invoiceReadiness.mockReturnValue(served([readiness()]))
    render(<MissionChainStrip mission={mission({ renewal: 'j15' })} />)
    const strip = screen.getByRole('region', { name: 'De la signature au cash' })
    expect(within(strip).getByText('La fin approche : quinze jours.')).toBeInTheDocument()
  })

  it('NOMME le blocage, il ne le compte pas', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ blockers: ['timesheet_not_validated', 'missing_po'] })]))
    render(<MissionChainStrip mission={mission()} />)
    // #2421 — lu DANS la bande : la timeline détaillée, repliée sous elle, nomme
    // le même motif sur son étape exacte.
    const strip = screen.getByRole('region', { name: 'De la signature au cash' })
    expect(within(strip).getByText('Relevé non validé par le client')).toBeInTheDocument()
    expect(within(strip).getByText('Bon de commande manquant')).toBeInTheDocument()
    // « 2 blocages » envoie ouvrir trois écrans pour savoir lesquels.
    expect(screen.queryByText(/2 blocage/i)).not.toBeInTheDocument()
  })

  it('elle dit le GESTE — donc la main qui le fait (#2199.13, .14)', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ blockers: ['timesheet_not_validated', 'missing_po'] })]))
    render(<MissionChainStrip mission={mission()} />)
    // « relancer le client » et « demander le bon de commande » ne s'adressent
    // pas à la même personne : c'est tout ce que le dépôt sait de la propriété
    // d'une étape, et en inventer plus serait une donnée fictive.
    expect(screen.getByText('relancer le client')).toBeInTheDocument()
    expect(screen.getByText('demander le bon de commande')).toBeInTheDocument()
  })

  it('chaque étape mesurée MÈNE à l’écran qui existe déjà', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ blockers: ['missing_po'] })]))
    render(<MissionChainStrip mission={mission({ renewal: 'j30' })} />)
    const hrefs = screen.getAllByRole('link').map(node => node.getAttribute('href'))
    expect(hrefs).toContain('/missions/cra')
    expect(hrefs).toContain('/missions/facturation')
    expect(hrefs).toContain('/missions/encaissements')
    expect(hrefs).toContain(`/consultants/${CONSULTANT_ID}/reverse-market`)
  })

  /* ---------------------------------------------------------------------- */
  /*  LE TÉMOIN — « non mesuré » ne s'écrit jamais « 0 » ni « fait »         */
  /* ---------------------------------------------------------------------- */

  it('une étape non mesurée le DIT, avec sa raison — et n’écrit aucun zéro', () => {
    // Aucune ligne de facturation sur le mois lu : quatre étapes sur cinq sont
    // hors de portée de la mesure. C'est le cas le plus fréquent, et celui où
    // « fait » serait le plus coûteux.
    invoiceReadiness.mockReturnValue(served([]))
    render(<MissionChainStrip mission={mission({ renewal: undefined })} />)
    const strip = screen.getByRole('region', { name: 'De la signature au cash' })
    expect(within(strip).getAllByText(/^non mesuré/).length).toBe(5)
    expect(within(strip).queryByText('Franchie')).not.toBeInTheDocument()
    // Le zéro qui ment : aucun maillon n'écrit un nombre.
    expect(strip.textContent ?? '').not.toMatch(/\b0\b/)
  })

  it('une lecture EN ÉCHEC n’est pas « rien à faire »', () => {
    invoiceReadiness.mockReturnValue({ data: undefined, isPending: false, isError: true })
    render(<MissionChainStrip mission={mission()} />)
    const strip = screen.getByRole('region', { name: 'De la signature au cash' })
    expect(within(strip).queryByText('Franchie')).not.toBeInTheDocument()
    expect(within(strip).getAllByText(/^non mesuré/).length).toBeGreaterThan(0)
  })

  it('« sans objet » n’est pas « non mesuré »', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ state: 'not_due' })]))
    render(<MissionChainStrip mission={mission()} />)
    const strip = screen.getByRole('region', { name: 'De la signature au cash' })
    expect(within(strip).getAllByText('Sans objet').length).toBeGreaterThan(0)
  })

  it('ce qui se clique se TABULE — aucun div cliquable', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ blockers: ['missing_po'] })]))
    const { container } = render(<MissionChainStrip mission={mission()} />)
    expect(container.querySelectorAll('div[onclick]').length).toBe(0)
    for (const node of screen.getAllByRole('link')) {
      expect(node.getAttribute('href')).toBeTruthy()
    }
  })

  it('sans identité de consultant, le repositionnement n’offre AUCUN lien mort', () => {
    invoiceReadiness.mockReturnValue(served([readiness()]))
    render(<MissionChainStrip mission={mission({ renewal: 'j15', assignees: [] })} />)
    const hrefs = screen.getAllByRole('link').map(node => node.getAttribute('href'))
    expect(hrefs.some(href => href?.includes('$id'))).toBe(false)
    expect(hrefs.some(href => href?.includes('reverse-market'))).toBe(false)
    // L'étape reste VISIBLE : c'est la porte qui manque, pas la position.
    expect(screen.getByText('Repositionnement')).toBeInTheDocument()
  })

  it('aucun pourcentage d’avancement, aucune probabilité', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ state: 'ready', blockers: [] })]))
    render(<MissionChainStrip mission={mission()} />)
    const strip = screen.getByRole('region', { name: 'De la signature au cash' })
    expect(strip.textContent ?? '').not.toMatch(/%/)
    expect(strip.textContent ?? '').not.toMatch(/sur 5|\/ ?5/)
  })
})

describe('#2421 — la timeline mission-to-cash, sous la bande', () => {
  it('rend les QUATORZE étapes nommées et l’étape ACTUELLE exacte (NO-GO : jamais « facturation en cours »)', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ blockers: ['missing_po'] })]))
    render(<MissionChainStrip mission={mission({ ownerName: 'Claire Porteur' })} />)
    const timeline = screen.getByRole('list', { name: 'Détail de la mission au cash (14 étapes)' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(14)
    expect(screen.getByText('Étape actuelle : CA facturable calculé')).toBeInTheDocument()
  })

  it('#2421.3/.6 — chaque étape ouverte dit son RESPONSABLE, sa DURÉE, et une étape faite sa PREUVE', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ blockers: ['missing_po'] })]))
    render(<MissionChainStrip mission={mission({ ownerName: 'Claire Porteur' })} />)
    const timeline = screen.getByRole('list', { name: 'Détail de la mission au cash (14 étapes)' })
    const billable = within(timeline).getByText('CA facturable calculé').closest('li') as HTMLElement
    expect(within(billable).getByText('Responsable : Claire Porteur (porteur de la mission)')).toBeInTheDocument()
    expect(within(billable).getByText(/^Depuis le .* \(\d+ j\)$/)).toBeInTheDocument()
    const created = within(timeline).getByText('Mission créée').closest('li') as HTMLElement
    expect(within(created).getByText(/^Créée le /)).toBeInTheDocument()
  })

  it('#2421.6 — owner absent : l’étape ouverte est marquée EXCEPTION, jamais un nom deviné', () => {
    invoiceReadiness.mockReturnValue(served([readiness({ blockers: ['missing_po'] })]))
    render(<MissionChainStrip mission={mission({ ownerName: null })} />)
    const timeline = screen.getByRole('list', { name: 'Détail de la mission au cash (14 étapes)' })
    const prepared = within(timeline).getByText('Préparation de la facture').closest('li') as HTMLElement
    expect(within(prepared).getByText('Aucun porteur sur cette mission — étape sans responsable')).toBeInTheDocument()
    expect(within(prepared).getByText('Exception')).toBeInTheDocument()
  })
})
