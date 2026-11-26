import type { FactoringView, OutgoingPayment, OutgoingPaymentsPage } from '@bellum/contracts'
import type { DataExitGrant } from '@/lib/data-exit'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const outgoingPayments = vi.fn()
const generate = vi.fn()
const validate = vi.fn()
const settle = vi.fn()
const reject = vi.fn()
const remind = vi.fn()
const factoringView = vi.fn()

vi.mock('../api', async () => {
  // ⚠️ Les CLÉS sont importées du vrai module, jamais recopiées : une clé
  // réécrite à la main dans un test rend le test vert pendant que l'écran lit
  // une autre case du cache.
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    paymentKeys: actual.paymentKeys,
    outgoingPaymentsApi: { exportCsv: vi.fn(async () => 'colonne;valeur') },
    useOutgoingPayments: () => outgoingPayments(),
    useGeneratePayment: () => ({ mutate: generate, isPending: false }),
    useValidatePayment: () => ({ mutate: validate, isPending: false }),
    useSettlePayment: () => ({ mutate: settle, isPending: false }),
    useRejectPayment: () => ({ mutate: reject, isPending: false }),
    useRemindPayments: () => ({ mutate: remind, isPending: false }),
  }
})
// La colonne CESSION lit le domaine affacturage à côté du sien — un test dédié
// (plus bas) couvre la jointure ; les autres n'ont besoin que d'un vide propre.
vi.mock('../../factoring/api', () => ({
  useFactoringView: () => factoringView(),
}))
// La coque de page a ses propres garanties ; ici on vérifie le CONTENU.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div data-testid="page-shell">{children}</div>,
}))
/**
 * ⚠️ Le faux INTERPOLE `params` et GARDE les attributs qu'on lui passe —
 * `aria-label` en tête, qui porte le nom accessible de la mention. Un faux qui
 * les jette teste le mock et non le composant.
 */
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

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn(), info: vi.fn() } }))

const { PaymentsPage } = await import('./PaymentsPage')
const { outgoingPaymentsApi } = await import('../api')
const { useDataExit } = await import('@/lib/data-exit')
const { ApiError } = await import('@/lib/api')
const { downloadCSV } = await import('@/lib/export-csv')

// Les menus Radix ont besoin de ces API de pointeur, que jsdom n'implémente pas.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const NOW = new Date('2026-08-20T12:00:00.000Z')

function line(over: Partial<OutgoingPayment> = {}): OutgoingPayment {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    missionId: '22222222-2222-4222-8222-222222222222',
    missionLabel: 'Renfort exploitation',
    accountId: '33333333-3333-4333-8333-333333333333',
    accountName: 'NOVA LOGISTIQUE',
    consultantId: '44444444-4444-4444-8444-444444444444',
    consultantName: 'Salomé Dufour',
    consultantTitle: 'Data Engineer',
    periodMonth: '2026-07-01',
    status: 'valide',
    payableAmountCents: 1_497_300,
    settledAmountCents: null,
    supplierInvoiceId: '55555555-5555-4555-8555-555555555555',
    supplierInvoiceReference: 'F-2026-0714',
    timesheetValidatedAt: '2026-07-14T09:00:00.000Z',
    timesheetDays: 18,
    scheduledOn: '2026-07-15',
    paidOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    validatedAt: '2026-07-10T09:00:00.000Z',
    rejectedAt: null,
    rejectionReason: null,
    ...over,
  }
}

function pageOf(items: OutgoingPayment[], over: Partial<OutgoingPaymentsPage> = {}): OutgoingPaymentsPage {
  return {
    month: '2026-07',
    items,
    summary: {
      paid: { count: 0, totalAmountCents: 0, withoutAmount: 0 },
      pending: { count: 0, totalAmountCents: 0, withoutAmount: 0 },
      overdue: { count: items.length, totalAmountCents: 1_497_300, withoutAmount: 0 },
      toValidate: { count: 0, totalAmountCents: 0, withoutAmount: 0 },
      rejected: 0,
      withoutScheduledDate: 0,
    },
    canReadFinance: true,
    ...over,
  }
}

function show(over: Partial<{ page: OutgoingPaymentsPage | null; canReadFinance: boolean; isLoading: boolean }> = {}) {
  outgoingPayments.mockReturnValue({
    page: pageOf([line()]),
    canReadFinance: true,
    isLoading: false,
    isError: false,
    ...over,
  })
  render(<PaymentsPage now={NOW} />)
}

beforeEach(() => {
  cleanup()
  outgoingPayments.mockReset()
  generate.mockReset()
  validate.mockReset()
  settle.mockReset()
  reject.mockReset()
  remind.mockReset()
  window.localStorage.clear()
  // Vide par défaut : aucune cession ne rapproche aucune ligne, et la colonne
  // dit « manquante » — le rendu le plus honnête tant qu'un test ne fournit
  // pas de cession.
  factoringView.mockReturnValue({ data: undefined, isLoading: false, isError: false })
})

async function openRowMenu(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole('button', { name: /gestes sur ce paiement/i }))
}

describe('l’écran des paiements sortants', () => {
  // Théo C missions-encaissements.A4 — Paiements FONDUS dans Encaissements : le même
  // contenu, sans second chrome de page (un écran dans un écran).
  it('embarqué, rend le contenu SANS la coque de page', () => {
    outgoingPayments.mockReturnValue({ page: pageOf([line()]), canReadFinance: true, isLoading: false, isError: false })
    render(<PaymentsPage now={NOW} embedded />)
    expect(screen.queryByTestId('page-shell')).toBeNull()
    expect(screen.getByText('NOVA LOGISTIQUE')).toBeTruthy()
  })

  it('annonce que Bellum SUIT le paiement et n’en déclenche aucun', () => {
    // Le refus est écrit trois fois dans le dépôt ; l'écran le DIT à celui qui
    // l'ouvre, sinon « Vérifier le paiement » se lit « faire partir l'argent ».
    show()
    expect(screen.getByText(/ne le déclenche pas/i)).toBeInTheDocument()
    expect(screen.getByText(/aucune coordonnée bancaire n’est stockée/i)).toBeInTheDocument()
  })

  it('n’affiche AUCUN chiffre pendant le chargement — le zéro de chargement ment', () => {
    show({ page: null, isLoading: true })
    expect(screen.queryByText(/^0 €$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/paiement$/i)).not.toBeInTheDocument()
  })

  it('rend les quatre tuiles, en montant ET en nombre', () => {
    show()
    expect(screen.getByText('Payés')).toBeInTheDocument()
    expect(screen.getByText('À valider')).toBeInTheDocument()
    expect(screen.getByText('En attente')).toBeInTheDocument()
    expect(screen.getByText('1 paiement')).toBeInTheDocument()
    // « En retard » apparaît DEUX fois — la tuile et le badge de la ligne — et
    // c'est juste : les deux nomment le même seau.
    expect(screen.getAllByText('En retard')).toHaveLength(2)
    // Le montant aussi apparaît deux fois — le total de la tuile et la ligne
    // unique qui le compose. C'est vrai, pas une duplication.
    expect(screen.getAllByText('14 973 €')).toHaveLength(2)
  })

  it('affiche le SEAU dans la colonne « Statut paiement », jamais l’état brut', () => {
    // ⚠️ La ligne est `valide` — quelqu'un l'a assumée — et sa date prévue est
    // passée de trente-six jours. L'afficher « Validé » ou « En attente » est
    // FAUX, et c'est justement la colonne qu'on balaie pour trouver ce qui
    // traîne. La maquette dit la même chose : sa colonne porte les seaux.
    show()
    expect(screen.queryByText('Validé')).not.toBeInTheDocument()
  })

  it('dit « non mesuré » pour l’évolution — jamais « +0 % »', () => {
    // La maquette porte « +12 % vs mois dernier » ; rien dans le dépôt ne prend
    // de photo mensuelle. Un delta inventé est un chiffre faux, et le plus
    // rassurant des trois.
    show()
    expect(screen.getByText(/évolution non mesurée/i)).toBeInTheDocument()
    expect(screen.queryByText(/\+0\s*%/)).not.toBeInTheDocument()
  })

  it('MASQUE les montants sans droit financier, et garde les nombres', () => {
    const page = pageOf([line({ payableAmountCents: null })], {
      canReadFinance: false,
      summary: {
        paid: { count: 0, totalAmountCents: null, withoutAmount: 0 },
        pending: { count: 0, totalAmountCents: null, withoutAmount: 0 },
        overdue: { count: 1, totalAmountCents: null, withoutAmount: 1 },
        toValidate: { count: 0, totalAmountCents: null, withoutAmount: 0 },
        rejected: 0,
        withoutScheduledDate: 0,
      },
    })
    show({ page, canReadFinance: false })
    // La phrase est dite UNE fois, en entête — jamais répétée par ligne.
    expect(screen.getAllByText(/ton rôle ne donne pas accès aux données financières/i)).toHaveLength(1)
    // Le NOMBRE reste : compter n'est pas une donnée financière.
    expect(screen.getByText('1 paiement')).toBeInTheDocument()
  })

  it('affiche le consultant et son métier', () => {
    show()
    expect(screen.getByText('Salomé Dufour')).toBeInTheDocument()
    expect(screen.getByText('Data Engineer')).toBeInTheDocument()
  })

  it('NOMME l’absence de validation du relevé plutôt que de laisser un vide', () => {
    // C'est la colonne qui autorise le paiement. Un vide s'y lirait « rien à
    // signaler », ce qui est exactement le contraire.
    show({ page: pageOf([line({ timesheetValidatedAt: null, status: 'non_genere', id: null })]) })
    expect(screen.getAllByTitle(/n’a pas été validé par le client/i).length).toBeGreaterThan(0)
  })

  it('NOMME l’absence de date de paiement prévue — elle est réparable en une saisie', () => {
    show({ page: pageOf([line({ scheduledOn: null })]) })
    expect(screen.getAllByTitle(/aucune date de paiement prévue/i).length).toBeGreaterThan(0)
  })

  it('affiche le retard en jours, jamais « 0 jour »', () => {
    // Le 20/08 pour une date prévue au 15/07 : 36 jours.
    show()
    expect(screen.getByText('+36 jours')).toBeInTheDocument()
  })

  it('n’affiche AUCUN retard sur un paiement sorti — « 0 jour » se lirait « il vient d’échoir »', () => {
    show({ page: pageOf([line({ status: 'paye', paidOn: '2026-07-16', settledAmountCents: 1_497_300 })]) })
    expect(screen.queryByText(/^\+\d+ jour/)).not.toBeInTheDocument()
  })
})

describe('les gestes de la ligne', () => {
  it('propose de RELANCER un paiement validé et en retard, et la relance CONSIGNE', async () => {
    const u = user()
    show()
    await u.click(screen.getByRole('button', { name: /^relancer le paiement$/i }))
    expect(remind).toHaveBeenCalledWith(['11111111-1111-4111-8111-111111111111'])
  })

  it('propose de PRÉPARER un paiement non généré', async () => {
    const u = user()
    show({ page: pageOf([line({ id: null, status: 'non_genere' })]) })
    await u.click(screen.getByRole('button', { name: /préparer le paiement/i }))
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: '22222222-2222-4222-8222-222222222222', month: '2026-07' }),
    )
  })

  it('propose de VÉRIFIER un paiement préparé — #2408.78, le verbe de l’issue', async () => {
    const u = user()
    show({ page: pageOf([line({ status: 'a_valider' })]) })
    await u.click(screen.getByRole('button', { name: /vérifier le paiement/i }))
    expect(validate).toHaveBeenCalledWith({ paymentId: '11111111-1111-4111-8111-111111111111' })
  })

  it('ne rend PAS de bouton pour ce qui se fait ailleurs — un bouton mort est pire qu’un texte', async () => {
    show({ page: pageOf([line({ id: null, status: 'non_genere', timesheetValidatedAt: null })]) })
    expect(screen.getByText(/attendre la validation du relevé/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /attendre la validation du relevé/i })).not.toBeInTheDocument()
  })

  it('n’ouvre AUCUN menu sur une ligne sans objet en base — il n’y a rien à faire avancer', () => {
    show({ page: pageOf([line({ id: null, status: 'non_genere' })]) })
    expect(screen.queryByRole('button', { name: /gestes sur ce paiement/i })).not.toBeInTheDocument()
  })

  it('permet de constater un paiement depuis le menu de la ligne', async () => {
    const u = user()
    show()
    await openRowMenu(u)
    await u.click(screen.getByRole('menuitem', { name: /marquer payé/i }))
    expect(settle).toHaveBeenCalledWith({ paymentId: '11111111-1111-4111-8111-111111111111' })
  })

  it('ne propose ni refus ni constat sur un paiement déjà sorti', async () => {
    const u = user()
    show({ page: pageOf([line({ status: 'paye', paidOn: '2026-07-16' })]) })
    await openRowMenu(u)
    expect(screen.queryByRole('menuitem', { name: /marquer payé/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /refuser le paiement/i })).not.toBeInTheDocument()
  })

  it('exige un MOTIF pour refuser — le bouton reste inerte tant que le champ est vide', async () => {
    const u = user()
    show()
    await openRowMenu(u)
    await u.click(screen.getByRole('menuitem', { name: /refuser le paiement/i }))
    const confirm = screen.getByRole('button', { name: /^refuser$/i })
    expect(confirm).toBeDisabled()
    await u.type(screen.getByRole('textbox', { name: /refuser ce paiement/i }), 'Facture en double')
    expect(confirm).toBeEnabled()
    await u.click(confirm)
    expect(reject).toHaveBeenCalledWith({
      paymentId: '11111111-1111-4111-8111-111111111111',
      reason: 'Facture en double',
    })
  })
})

describe('la relance EN MASSE', () => {
  it('relance TOUTES les lignes en retard en un geste', async () => {
    const u = user()
    show({
      page: pageOf([line(), line({ id: 'p2' })]),
    })
    await u.click(screen.getByRole('button', { name: /relancer les paiements/i }))
    expect(remind).toHaveBeenCalledWith(['11111111-1111-4111-8111-111111111111', 'p2'])
  })

  it('reste INERTE quand aucune ligne n’est en retard — et dit pourquoi', () => {
    show({ page: pageOf([line({ status: 'paye', paidOn: '2026-07-16' })]) })
    const button = screen.getByRole('button', { name: /relancer les paiements/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/aucun paiement en retard/i))
  })

  it('n’emporte PAS les lignes qui ne sont pas en retard', async () => {
    const u = user()
    show({ page: pageOf([line(), line({ id: 'p2', status: 'a_valider', scheduledOn: null })]) })
    await u.click(screen.getByRole('button', { name: /relancer les paiements/i }))
    expect(remind).toHaveBeenCalledWith(['11111111-1111-4111-8111-111111111111'])
  })
})

describe('l’état vide', () => {
  it('distingue « rien ce mois-ci » de « rien qui corresponde aux filtres »', async () => {
    const u = user()
    show({ page: pageOf([]) })
    expect(screen.getByText(/aucun paiement à suivre sur ce mois/i)).toBeInTheDocument()

    // Un vide FILTRÉ n'est pas un mois vide : les deux ne se réparent pas de la
    // même façon, et confondre les deux fait croire à une panne.
    await u.type(screen.getByRole('textbox', { name: /rechercher un consultant/i }), 'zzz')
    expect(await screen.findByText(/aucun paiement ne correspond à ces filtres/i)).toBeInTheDocument()
  })
})

describe('le sélecteur de colonnes', () => {
  it('masque une colonne cochée, et ne laisse pas décocher le consultant', async () => {
    const u = user()
    show()
    expect(screen.getByText('NOVA LOGISTIQUE')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: /colonnes affichées/i }))
    await u.click(screen.getByRole('menuitemcheckbox', { name: /^client$/i }))
    expect(screen.queryByText('NOVA LOGISTIQUE')).not.toBeInTheDocument()

    // L'épinglée : la case existe, elle est désactivée, et la règle est tenue
    // dans le hook — pas dans le rendu du bouton.
    //
    // ⚠️ `aria-disabled` et non `toBeDisabled()` : un `menuitemcheckbox` Radix
    // est un `<div>`, et l'attribut `disabled` n'existe pas dessus. Le matcher
    // aurait échoué en annonçant « n'est pas désactivé » sur un élément qui
    // l'est réellement — c'est le mock qu'on aurait testé, pas le composant.
    expect(screen.getByRole('menuitemcheckbox', { name: /^consultant$/i })).toHaveAttribute('aria-disabled', 'true')
  })
})

/** Une cession, telle que le domaine affacturage la rend — assez pour la
 *  jointure et le rendu de la cellule, pas l'objet complet. */
function assignment(patch: Partial<FactoringView['assignments'][number]> = {}): FactoringView['assignments'][number] {
  return {
    id: 'a1111111-1111-4111-8111-111111111111',
    contractId: 'c1111111-1111-4111-8111-111111111111',
    factorName: 'Le factor',
    missionId: '22222222-2222-4222-8222-222222222222',
    missionLabel: 'Renfort exploitation',
    accountName: 'NOVA LOGISTIQUE',
    periodMonth: '2026-07-01',
    status: 'assigned',
    assignedAmountCents: 1_400_000,
    commissionRateBps: 250,
    commissionAmountCents: 35_000,
    assignedOn: '2026-07-12',
    settledOn: null,
    decisionReason: null,
    reconciliation: { state: 'awaiting', settledCents: 0, expectedNetCents: 1_365_000, varianceCents: null },
    ...patch,
  }
}

describe('la colonne CESSION — BRANCHÉE sur le domaine affacturage', () => {
  it('dit « manquante » quand aucune cession ne couvre la mission × le mois', () => {
    factoringView.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    show()
    expect(screen.getByText(/aucune cession n'a été préparée/i)).toBeInTheDocument()
  })

  it('montre « Cession reçue » et sa date quand la créance a été TRANSMISE au factor', () => {
    factoringView.mockReturnValue({
      data: { assignments: [assignment()] } as FactoringView,
      isLoading: false,
      isError: false,
    })
    show()
    expect(screen.getByText('Cession reçue')).toBeInTheDocument()
  })

  it('ne rapproche PAS une cession d’un autre mois — la clé porte mission ET mois', () => {
    factoringView.mockReturnValue({
      data: { assignments: [assignment({ periodMonth: '2026-06-01' })] } as FactoringView,
      isLoading: false,
      isError: false,
    })
    show()
    // Le mois de la ligne (juillet) ne correspond pas à celui de la cession
    // (juin) : la jointure ne doit rien rapprocher.
    expect(screen.queryByText('Cession reçue')).not.toBeInTheDocument()
    expect(screen.getByText(/aucune cession n'a été préparée/i)).toBeInTheDocument()
  })

  it('nomme un REFUS du factor comme un FAIT, jamais comme une absence', () => {
    factoringView.mockReturnValue({
      data: {
        assignments: [
          assignment({
            status: 'rejected',
            reconciliation: { state: 'not_due', settledCents: 0, expectedNetCents: null, varianceCents: null },
          }),
        ],
      } as FactoringView,
      isLoading: false,
      isError: false,
    })
    show()
    expect(screen.getByText(/refusée par le factor/i)).toBeInTheDocument()
    expect(screen.queryByText(/aucune cession n'a été préparée/i)).not.toBeInTheDocument()
  })
})

/**
 * #2081.14 — DÉCISION Louis 19/09/2026 : le CSV des paiements est une SORTIE de
 * données. Sous la règle d'espace « administrateurs seulement », le bouton est
 * MASQUÉ ; un refus de l'API (la règle posée entre-temps) se DIT par sa phrase,
 * jamais sous une erreur générique.
 */
describe('#2081.14 — la règle d’espace « qui peut exporter »', () => {
  it('NON : la règle réserve l’export — le bouton est masqué, rien ne part', () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
    show()
    expect(screen.queryByRole('button', { name: 'Exporter' })).not.toBeInTheDocument()
    expect(outgoingPaymentsApi.exportCsv).not.toHaveBeenCalled()
  })

  it('un refus de l’API se dit « Réservé par la règle d’espace : … », et aucun fichier ne sort', async () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    vi.mocked(outgoingPaymentsApi.exportCsv).mockRejectedValueOnce(
      new ApiError('Forbidden', 403, 'workspace_rule_refused', { rule: 'exportPolicy' }),
    )
    vi.mocked(downloadCSV).mockClear()
    show()
    await user().click(screen.getByRole('button', { name: 'Exporter' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/^Réservé par la règle d’espace : /)),
    )
    expect(downloadCSV).not.toHaveBeenCalled()
  })
})
