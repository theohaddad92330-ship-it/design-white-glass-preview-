import type { InvoiceReadiness } from '@bellum/contracts'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataExitGrant } from '@/lib/data-exit'

const collectionsWindow = vi.fn()
const markInvoiced = vi.fn()
const recordPayment = vi.fn()
const openDispute = vi.fn()
const resolveDispute = vi.fn()
const recordReminder = vi.fn()
const exportCollectionsCsv = vi.fn(async () => 'colonne;valeur')
const invoicePayments = vi.fn(() => ({ data: { unmatched: [] as { amountCents: number }[] } }))

vi.mock('../api', () => ({
  useCollectionsWindow: () => collectionsWindow(),
  useInvoicePayments: () => invoicePayments(),
  useRecordPayment: () => ({ mutate: recordPayment, isPending: false }),
  useOpenDispute: () => ({ mutate: openDispute, isPending: false }),
  useResolveDispute: () => ({ mutate: resolveDispute, isPending: false }),
  useRecordReminder: () => ({ mutate: recordReminder, isPending: false }),
  useMarkInvoiced: () => ({ mutate: markInvoiced, isPending: false }),
  invoiceReadinessApi: { exportCollectionsCsv },
}))
// Les règlements à rapprocher : leur propre lecture, et leurs deux gestes.
const unmatchedPayments = vi.fn(() => ({ data: { unmatched: [] as unknown[] } }))
const matchPayment = vi.fn()
const recordUnmatched = vi.fn()
const noteCredit = vi.fn()
vi.mock('../payments-matching', () => ({
  useUnmatchedPayments: () => unmatchedPayments(),
  useMatchPayment: () => ({ mutate: matchPayment, isPending: false }),
  useRecordUnmatchedPayment: () => ({ mutate: recordUnmatched, isPending: false }),
  useNoteCustomerCredit: () => ({ mutate: noteCredit, isPending: false }),
}))
const teamState = vi.fn(() => ({ team: { workspace: { role: 'owner' } } }) as { team: unknown })
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => teamState() }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('./InvoiceAttachments', () => ({ InvoiceAttachments: () => <div>pièces</div> }))
// La coque de page a ses propres garanties ; ici on vérifie le CONTENU.
// Rendue à plat : le titre, la phrase, les gestes de tête et le guide passent par ses props.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({
    children,
    pageTitle,
    pageSubtitle,
    headerActions,
    screenGuide,
  }: {
    children: React.ReactNode
    pageTitle?: string
    pageSubtitle?: string
    headerActions?: React.ReactNode
    screenGuide?: React.ReactNode
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      <p>{pageSubtitle}</p>
      <div data-testid="head-actions">{headerActions}</div>
      <div data-testid="guide">{screenGuide}</div>
      {children}
    </div>
  ),
}))
/**
 * Le libellé d'une mission est une MENTION depuis le 30/08/2026 (D200) : elle
 * ouvre le dossier de la mission, et le vrai `Link` de TanStack exige un
 * routeur monté.
 *
 * ⚠️ Le faux INTERPOLE `params` et garde les attributs qu'on lui passe —
 * `aria-label` en tête, qui porte le nom accessible de la mention. Un faux qui
 * les jette teste le mock et non le composant : c'est le défaut trouvé sur
 * `LinkedAccountsCard`, où la porte passait au vert sans nom accessible.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search: _search,
    hash: _hash,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    hash?: string
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn(), info: vi.fn() } }))

const { CollectionsPage } = await import('./CollectionsPage')
const { useDataExit } = await import('@/lib/data-exit')
const { downloadCSV } = await import('@/lib/export-csv')
const { ApiError } = await import('@/lib/api')

// Les menus Radix ont besoin de ces API de pointeur, que jsdom n'implémente pas.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const NOW = new Date('2026-08-29T12:00:00.000Z')

function line(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Renfort plateforme',
    accountId: null,
    accountName: 'ACME',
    periodMonth: '2026-06-01',
    state: 'invoiced',
    blockers: [],
    days: 20,
    preparedAmountCents: 12_000_00,
    invoicedAt: '2026-07-05T12:00:00.000Z',
    invoiceReference: 'F-2026-118',
    invoicedAmountCents: 12_000_00,
    dueOn: '2026-08-04',
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...over,
  }
}

function show(
  over: Partial<{ items: InvoiceReadiness[]; canReadFinance: boolean; isLoading: boolean; failedMonths: number }> = {},
) {
  collectionsWindow.mockReturnValue({
    items: [],
    canReadFinance: true,
    isLoading: false,
    failedMonths: 0,
    ...over,
  })
  render(<CollectionsPage now={NOW} />)
}

beforeEach(() => {
  cleanup()
  collectionsWindow.mockReset()
  recordPayment.mockReset()
  openDispute.mockReset()
  resolveDispute.mockReset()
  recordReminder.mockReset()
  exportCollectionsCsv.mockClear()
  unmatchedPayments.mockReset()
  unmatchedPayments.mockReturnValue({ data: { unmatched: [] } })
  teamState.mockReset()
  teamState.mockReturnValue({ team: { workspace: { role: 'owner' } } })
  markInvoiced.mockReset()
  noteCredit.mockReset()
  invoicePayments.mockReturnValue({ data: { unmatched: [] } })
})

/** Ouvre la « File de suivi » (le filtre à choix multiple de la carte « Échéances à traiter »). */
async function openQueue(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole('button', { name: /^File de suivi : / }))
}
/** Une échéance de la file, par le nom du client. */
function rowOf(name: RegExp): HTMLElement {
  const item = screen.getAllByRole('listitem').find(candidate => name.test(candidate.textContent ?? ''))
  if (!item) throw new Error(`aucune échéance ne porte ${name}`)
  return item
}

async function openRowMenu(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole('button', { name: /gestes sur cette facture/i }))
}

/**
 * L'ÉCRAN « ENCAISSEMENTS » — la moitié « l'argent est-il rentré ? ».
 *
 * `/missions/facturation` s'arrête à « prêt à facturer » : il répare ce qui
 * empêche d'émettre. Ce qui se passe APRÈS l'émission — l'échéance, le retard,
 * le litige, le règlement — vivait ligne par ligne sur cet écran mensuel, sans
 * jamais être totalisé ni classé. La donnée était intégralement en base, et
 * personne ne pouvait répondre à « combien nous doit-on, et depuis quand ».
 */
describe('CollectionsPage — la file de suivi et ses quatre statuts', () => {
  it('annonce chaque statut en NOMBRE et en MONTANT, sur le parc entier (jamais un cinquième)', async () => {
    show({
      items: [
        line({
          periodMonth: '2026-05-01',
          paidAt: '2026-08-01T12:00:00.000Z',
          paidAmountCents: 10_000_00,
          invoicedAmountCents: 10_000_00,
        }),
        line({
          periodMonth: '2026-04-01',
          paidAt: '2026-08-02T12:00:00.000Z',
          paidAmountCents: 5_000_00,
          invoicedAmountCents: 5_000_00,
        }),
        line({ periodMonth: '2026-07-01', dueOn: '2026-09-30', invoicedAmountCents: 3_000_00 }),
        line({ periodMonth: '2026-06-01', dueOn: '2026-08-04', invoicedAmountCents: 7_000_00 }),
        line({ periodMonth: '2026-03-01', disputedAt: '2026-07-20T12:00:00.000Z', invoicedAmountCents: 2_000_00 }),
      ],
    })
    const u = user()
    await openQueue(u)
    const options = screen.getAllByRole('menuitemcheckbox').map(option => option.textContent)
    expect(options).toEqual([
      expect.stringMatching(/^Échues · 1 · 7\s?000\s?€$/),
      expect.stringMatching(/^En litige · 1 · 2\s?000\s?€$/),
      expect.stringMatching(/^À échoir · 1 · 3\s?000\s?€$/),
      'Sans échéance · 0',
      // Le total des réglées — 10 000 + 5 000 — n'existe sur aucune ligne : c'est le compteur.
      expect.stringMatching(/^Réglées · 2 · 15\s?000\s?€$/),
    ])
  })

  // c80 — la SOURCE d'un « facturé » se nomme sur la ligne : déclarée, non confirmée.
  it('nomme une facture DÉCLARÉE sur sa ligne, jamais confondue avec une facture lue', () => {
    show({ items: [line({ state: 'invoiced_declared', accountName: 'EDF' })] })
    expect(within(rowOf(/EDF/)).getByText(/déclarée facturée, non confirmée/)).toBeInTheDocument()
  })

  /**
   * ⚠️ « 0 compte » pendant que la liste arrive — le zéro de chargement ment.
   * Un écran de trésorerie qui annonce « 0 € en retard » le temps de douze
   * requêtes fait refermer l'onglet avant que la vérité n'arrive.
   */
  it('n’annonce AUCUN chiffre tant que la fenêtre charge', () => {
    show({ isLoading: true })
    expect(screen.queryByText(/0\s*€/)).not.toBeInTheDocument()
    expect(screen.queryByText(/en retard/i)).not.toBeInTheDocument()
  })

  /**
   * ⚠️ Le MONTANT est une donnée financière ; le NOMBRE ne l'est pas. Un
   * gestionnaire de delivery doit pouvoir voir qu'il y a une facture en retard
   * pour aller la chercher — sans connaître ce qu'elle vaut. Et surtout :
   * jamais « 0 € » à la place, qui se lirait « rien à réclamer ».
   */
  it('montre les NOMBRES et jamais un montant sans le droit financier', () => {
    show({ canReadFinance: false, items: [line({ dueOn: '2026-08-04', invoicedAmountCents: null })] })
    expect(screen.getAllByText(/montants réservés/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/0\s*€/)).not.toBeInTheDocument()
    expect(screen.getByText(/jours de retard/i)).toBeInTheDocument()
  })

  /**
   * Un total dont on ignore l'assiette est un total faux : si trois mois de la
   * fenêtre n'ont pas répondu, les quatre compteurs sont partiels et le disent.
   */
  it('DIT que la fenêtre est incomplète quand un mois n’a pas répondu', () => {
    show({ failedMonths: 3, items: [line()] })
    expect(screen.getByText(/3 mois/i)).toBeInTheDocument()
  })

  /** Une fenêtre sans borne annoncée fait lire un total pour un cumul de tout
   *  l'historique. Douze mois, et l'écran le dit. */
  it('NOMME sa fenêtre', () => {
    show({ items: [line()] })
    expect(screen.getByText(/12 derniers mois/i)).toBeInTheDocument()
  })
})

/**
 * #2408.48 — LE FILTRE « PAIEMENT ». Les quatre compteurs (Encaissé, En
 * attente, En retard, Contesté) ANNONÇAIENT déjà les populations sans
 * jamais y mener : aucune porte ne resserrait le tableau sur l'une d'elles,
 * seule la colonne « Statut » de chaque ligne le disait, une par une.
 *
 * ⚠️ Un seul statut à la fois, et un second clic le retire (`clearable`) —
 * même geste que les tuiles de `InvoiceReadinessPanel` (un filtre actif qui
 * s'annule lui-même).
 */
describe('CollectionsPage — #2408.48, le filtre « File de suivi »', () => {
  const two = () => [
    line({ missionLabel: 'Retard ACME', dueOn: '2026-08-04' }),
    line({
      missionId: '22222222-2222-4222-8222-222222222222',
      missionLabel: 'Réglée Nova',
      accountName: 'Nova',
      paidAt: '2026-08-02T12:00:00.000Z',
      paidAmountCents: 12_000_00,
    }),
  ]

  it('cocher « Échues » ne garde que les lignes en retard', async () => {
    show({ items: two() })
    const u = user()
    await openQueue(u)
    await u.click(screen.getByRole('menuitemcheckbox', { name: /^Échues/ }))
    expect(screen.getByText('Retard ACME')).toBeInTheDocument()
    expect(screen.queryByText('Réglée Nova')).not.toBeInTheDocument()
  })

  it('décocher retire le filtre', async () => {
    show({ items: two() })
    const u = user()
    await openQueue(u)
    await u.click(screen.getByRole('menuitemcheckbox', { name: /^Échues/ }))
    await u.click(screen.getByRole('menuitemcheckbox', { name: /^Échues/ }))
    expect(screen.getByText('Retard ACME')).toBeInTheDocument()
    expect(screen.getByText('Réglée Nova')).toBeInTheDocument()
  })

  it('les compteurs restent ceux du PARC ENTIER une fois un filtre choisi', async () => {
    show({ items: two() })
    const u = user()
    await openQueue(u)
    await u.click(screen.getByRole('menuitemcheckbox', { name: /^Échues/ }))
    // « Réglées » annonce encore son montant, alors que la file ne montre plus « Réglée Nova ».
    expect(screen.getByRole('menuitemcheckbox', { name: /^Réglées · 1 · 12\s?000\s?€$/ })).toBeInTheDocument()
    expect(screen.queryByText('Réglée Nova')).not.toBeInTheDocument()
  })

  it('la tuile « Dont échus » filtre la file, un second clic la relâche', async () => {
    show({ items: two() })
    const u = user()
    const tile = within(screen.getByRole('group', { name: 'Encours' })).getByRole('button', { name: /Dont échus/ })
    await u.click(tile)
    expect(screen.queryByText('Réglée Nova')).not.toBeInTheDocument()
    await u.click(tile)
    expect(screen.getByText('Réglée Nova')).toBeInTheDocument()
  })
})

describe('CollectionsPage — la file des échéances', () => {
  it('porte le client, la mission et le mois', () => {
    show({ items: [line({ accountName: 'Groupe Aurore', missionLabel: 'Socle conteneurisé' })] })
    expect(rowOf(/Groupe Aurore/)).toBeInTheDocument()
    expect(screen.getByText('Socle conteneurisé')).toBeInTheDocument()
  })

  /**
   * L'encaissement commence à la facture : ce qui n'est pas encore émis se
   * répare sur l'écran de facturation, avec ses bloqueurs et ses portes.
   */
  it('ne liste QUE les mois facturés', () => {
    show({ items: [line({ state: 'ready', missionLabel: 'Mois pas encore facturé' })] })
    expect(screen.queryByText('Mois pas encore facturé')).not.toBeInTheDocument()
    // ⚠️ La formule complète : le bandeau permanent dit lui aussi « Bellum
    // n'émet aucune facture », et un `/aucune facture/i` nu confondrait les deux.
    expect(screen.getByText(/aucune facture émise sur cette fenêtre/i)).toBeInTheDocument()
  })

  it('affiche le retard en jours sur une facture échue', () => {
    show({ items: [line({ dueOn: '2026-08-04' })] })
    expect(screen.getByText(/25 jours de retard/i)).toBeInTheDocument()
  })

  /**
   * #2516 — « le tableau est coupé, faut qu'on puisse le voir en entier ».
   * Aucune colonne ne déclarait de largeur bornée : un nom de compte ou un
   * intitulé de mission long étalait la ligne entière (`table-layout: auto`
   * n'a pas de plancher, GA-118) et poussait les colonnes de droite — Retard,
   * Relances, Prochaine action — hors du cadre visible, sans que le
   * défilement horizontal du conteneur ne suffise à le deviner. `max-w-`
   * borne la colonne au `<th>` ET au `<td>` (`ResponsiveTable` applique la
   * même classe aux deux). Refonte Théo : la file est une liste dense, le nom
   * passe à la ligne (`break-words`).
   */
  it('un nom long passe à la ligne au lieu d’étaler la file (#2516)', () => {
    show({
      items: [
        line({
          accountName: 'Une entreprise au nom particulièrement long pour tester le débordement horizontal',
          missionLabel: 'Un intitulé de mission délibérément long pour vérifier la largeur bornée de la colonne',
        }),
      ],
    })
    const title = within(rowOf(/Une entreprise/)).getAllByText(/Une entreprise au nom particulièrement long/)[0]!
    expect(title.className).toMatch(/break-words/)
  })

  /**
   * #2516 — la mention de mission tronque son texte (`ObjectMention`, ellipse
   * interne) dès que la colonne est bornée : sans `title`, le nom complet
   * disparaît purement et simplement au survol comme à la lecture d'écran.
   */
  it('porte le nom complet de la mission en infobulle quand la colonne le tronque (#2516)', () => {
    const long = 'Un intitulé de mission délibérément long pour vérifier la largeur bornée de la colonne'
    show({ items: [line({ missionLabel: long })] })
    const link = screen.getByRole('link', { name: `Ouvrir ${long}` })
    expect(link.closest('[title]')).not.toBeNull()
    expect(link.closest('[title]')).toHaveAttribute('title', long)
  })

  /**
   * ⚠️ « 0 jour de retard » se lirait « elle vient d'échoir », alors que la
   * vérité est qu'aucune échéance n'a été saisie — et c'est réparable.
   */
  it('NOMME une échéance absente au lieu d’écrire « 0 jour »', () => {
    show({ items: [line({ dueOn: null })] })
    expect(screen.queryByText(/(?<!\d)0 jours?/i)).not.toBeInTheDocument()
    expect(screen.getByText(/aucune échéance/i)).toBeInTheDocument()
  })

  it('nomme le RANG de la relance due comme prochaine action', () => {
    show({ items: [line({ dueOn: '2026-08-04', remindersSent: 1 })] })
    expect(within(rowOf(/ACME/)).getByText(/relance n°\s*2/i)).toBeInTheDocument()
  })

  /**
   * Doctrine `c31_relance_encaissement` : la relance se calcule et s'affiche,
   * elle ne part JAMAIS — et le brouillon est refusé au même titre tant
   * qu'aucune capacité de messagerie n'atteint cet écran.
   */
  it('dit que rien ne part tout seul, et ne promet aucun brouillon', () => {
    show({ items: [line({ dueOn: '2026-08-04' })] })
    expect(screen.getByText(/rien ne part tout seul/i)).toBeInTheDocument()
    expect(screen.queryByText(/brouillon/i)).not.toBeInTheDocument()
  })

  it('renvoie au litige plutôt qu’à une relance tant qu’il court', () => {
    show({ items: [line({ dueOn: '2026-06-04', disputedAt: '2026-07-20T12:00:00.000Z' })] })
    expect(screen.getByText(/lever le litige/i)).toBeInTheDocument()
    expect(screen.queryByText(/relance n°/i)).not.toBeInTheDocument()
  })

  /**
   * #2198.21 — le CONTEXTE d'une relance sur une ligne contestée : pourquoi le
   * client conteste. `disputeReason` était déjà en base et déjà lu par le
   * formulaire d'ouverture, jamais rendu une fois le litige ouvert — la ligne
   * revenait ensuite « En litige », sans dire de quoi.
   */
  it('porte le motif du litige en infobulle sur le badge « En litige » (#2198.21)', () => {
    show({
      items: [
        line({
          disputedAt: '2026-07-20T12:00:00.000Z',
          disputeReason: 'Prestation jugée incomplète par le client',
        }),
      ],
    })
    expect(screen.getByText('En litige').closest('[title]')).toHaveAttribute(
      'title',
      'Prestation jugée incomplète par le client',
    )
  })

  /**
   * #2198.20 — QUI appeler avant de relancer. `billingContactId` était lu côté
   * bloqueur de facturation, jamais résolu en nom sur cet écran : la ligne
   * disait « en retard » sans dire à qui parler.
   */
  it('nomme l’interlocuteur de facturation (#2198.20)', () => {
    show({ items: [line({ billingContactName: 'Camille Vasseur' })] })
    expect(screen.getByText('Camille Vasseur')).toBeInTheDocument()
  })

  it('NOMME l’absence d’interlocuteur plutôt que de laisser la cellule vide (#2198.20)', () => {
    show({ items: [line({ billingContactName: null })] })
    expect(screen.getByText(/aucun contact de facturation saisi/i)).toBeInTheDocument()
  })

  /**
   * #2198.7 — « Relances » ne disait qu'un NOMBRE, jamais QUAND la dernière a
   * eu lieu. La colonne « Dernière action » retient la plus récente des
   * quatre dates déjà en base (relance / règlement / litige ouvert / levé).
   */
  it('nomme la DERNIÈRE action consignée, pas seulement son compteur (#2198.7)', () => {
    show({ items: [line({ lastReminderAt: '2026-08-10T09:00:00.000Z', remindersSent: 1 })] })
    expect(screen.getByText(/relance du 10\/08\/2026/i)).toBeInTheDocument()
  })

  it('retient le règlement plutôt qu’une relance plus ancienne (#2198.7)', () => {
    show({
      items: [
        line({
          lastReminderAt: '2026-08-01T09:00:00.000Z',
          paidAt: '2026-08-20T12:00:00.000Z',
          paidAmountCents: 12_000_00,
        }),
      ],
    })
    expect(screen.getByText(/règlement du 20\/08\/2026/i)).toBeInTheDocument()
  })

  it('ne rend aucune cellule « dernière action » quand rien n’a encore eu lieu (#2198.7)', () => {
    show({ items: [line()] })
    expect(screen.queryByText(/relance du \d|règlement du \d|litige (ouvert|levé) le/i)).not.toBeInTheDocument()
  })
})

describe('CollectionsPage — les gestes de la ligne', () => {
  /** Un bouton qui ne montre qu'une icône porte un nom (GA-32), et ce qui se
   *  clique se tabule (GA-35). */
  it('ouvre les gestes depuis un menu NOMMÉ', async () => {
    const u = user()
    show({ items: [line()] })
    await openRowMenu(u)
    expect(await screen.findByRole('menuitem', { name: /marquer réglée/i })).toBeInTheDocument()
  })

  /** ⚠️ Le geste passe désormais par une invite de MONTANT (#2419.4) : sans
   *  elle, tout règlement enregistré depuis le produit laissait
   *  `paid_amount_cents` à `null`, et aucun partiel n'était détectable. */
  it('enregistre le règlement sur le MOIS de la ligne', async () => {
    const u = user()
    show({ items: [line({ periodMonth: '2026-06-01' })] })
    await openRowMenu(u)
    await u.click(await screen.findByRole('menuitem', { name: /marquer réglée/i }))
    await u.click(await screen.findByRole('button', { name: /^enregistrer le règlement$/i }))
    expect(recordPayment).toHaveBeenCalledWith({
      missionId: '11111111-1111-4111-8111-111111111111',
      month: '2026-06',
    })
  })

  it('ne propose pas de marquer réglée une facture déjà réglée', async () => {
    const u = user()
    show({ items: [line({ paidAt: '2026-08-01T12:00:00.000Z', paidAmountCents: 12_000_00 })] })
    await openRowMenu(u)
    await screen.findByRole('menuitem', { name: /consigner une relance/i })
    expect(screen.queryByRole('menuitem', { name: /marquer réglée/i })).not.toBeInTheDocument()
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * #2419.4 — UN PAIEMENT PARTIEL NE SORT PAS DE LA FILE
   * ─────────────────────────────────────────────────────────────────────────
   * Une fois `paidAt` posée, le geste « Marquer réglée » disparaissait : après
   * un règlement partiel, il n'existait plus AUCUNE porte dans le produit pour
   * enregistrer le solde. Le partiel était irréversible côté écran.
   */
  it('propose encore d’enregistrer un règlement sur une facture réglée à MOITIÉ', async () => {
    const u = user()
    show({
      items: [
        line({
          invoicedAmountCents: 10_000_00,
          paidAt: '2026-08-01T12:00:00.000Z',
          paidAmountCents: 5_000_00,
        }),
      ],
    })
    await openRowMenu(u)
    expect(await screen.findByRole('menuitem', { name: /marquer réglée/i })).toBeInTheDocument()
  })

  /**
   * LE MONTANT SE SAISIT, il ne se devine pas. Sans cette porte, tout règlement
   * enregistré depuis le produit écrivait `paid_at` et laissait
   * `paid_amount_cents` à `null` — et le correctif serait resté sans effet.
   * Le champ est FACULTATIF : laissé vide, on enregistre un règlement dont le
   * montant n'est pas mesuré, et on ne l'invente pas.
   */
  it('enregistre le MONTANT encaissé quand on le saisit', async () => {
    const u = user()
    show({ items: [line({ periodMonth: '2026-06-01', invoicedAmountCents: 10_000_00 })] })
    await openRowMenu(u)
    await u.click(await screen.findByRole('menuitem', { name: /marquer réglée/i }))
    await u.type(await screen.findByLabelText(/montant encaissé/i), '5000')
    await u.click(screen.getByRole('button', { name: /^enregistrer le règlement$/i }))
    expect(recordPayment).toHaveBeenCalledWith({
      missionId: '11111111-1111-4111-8111-111111111111',
      month: '2026-06',
      amountCents: 5_000_00,
    })
  })
})

describe('CollectionsPage — le reste dû d’un règlement partiel (#2419.4)', () => {
  const PARTIAL = {
    invoicedAmountCents: 10_000_00,
    paidAt: '2026-08-01T12:00:00.000Z',
    paidAmountCents: 5_000_00,
    dueOn: '2026-08-04',
  }

  it('NOMME le reste dû sur la ligne', () => {
    show({ items: [line(PARTIAL)] })
    expect(screen.getByText(/reste dû/i)).toBeInTheDocument()
  })

  /** Le badge de statut reste celui de la FILE : la ligne n'est pas sortie. */
  it('garde la ligne en RETARD, jamais « Réglée »', () => {
    show({ items: [line(PARTIAL)] })
    expect(screen.getByText('Échue')).toBeInTheDocument()
    expect(screen.queryByText('Réglée')).not.toBeInTheDocument()
  })

  /** Le retard s'effaçait dès que `paidAt` était posée : une facture échue et
   *  réglée à moitié n'affichait plus aucun jour de retard. */
  it('affiche encore les JOURS de retard', () => {
    show({ items: [line(PARTIAL)] })
    expect(screen.getByText(/25 jours de retard/i)).toBeInTheDocument()
  })

  /** Un montant encaissé inconnu n'est PAS un reste dû : on ne l'affiche pas,
   *  et surtout pas « 0 ». */
  it('n’annonce AUCUN reste dû quand le montant encaissé est inconnu', () => {
    show({ items: [line({ ...PARTIAL, paidAmountCents: null })] })
    expect(screen.queryByText(/reste dû/i)).not.toBeInTheDocument()
  })

  it('propose de LEVER le litige, jamais d’en ouvrir un second', async () => {
    const u = user()
    show({ items: [line({ disputedAt: '2026-07-20T12:00:00.000Z' })] })
    await openRowMenu(u)
    expect(await screen.findByRole('menuitem', { name: /lever le litige/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /déclarer un litige/i })).not.toBeInTheDocument()
  })
})

/**
 * #2198.45 — l'export, sous la même règle d'espace que `/missions/paiements`
 * (#2081.14) : masqué sans le droit, un refus de l'API se DIT par sa phrase.
 */
describe('CollectionsPage — l’export (#2198.45)', () => {
  it('télécharge le CSV via l’API — jamais recomposé depuis les lignes déjà chargées', async () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    show({ items: [line()] })
    await user().click(screen.getByRole('button', { name: 'Exporter les soldes' }))
    await waitFor(() => expect(exportCollectionsCsv).toHaveBeenCalled())
    expect(downloadCSV).toHaveBeenCalledWith('colonne;valeur', 'encaissements.csv', {})
  })

  it('NON : la règle réserve l’export — le bouton est masqué, rien ne part', () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
    show({ items: [line()] })
    expect(screen.queryByRole('button', { name: 'Exporter les soldes' })).not.toBeInTheDocument()
    expect(exportCollectionsCsv).not.toHaveBeenCalled()
  })

  it('un refus de l’API se dit « Réservé par la règle d’espace : … », aucun fichier ne sort', async () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    exportCollectionsCsv.mockRejectedValueOnce(
      new ApiError('Forbidden', 403, 'workspace_rule_refused', { rule: 'exportPolicy' }),
    )
    vi.mocked(downloadCSV).mockClear()
    show({ items: [line()] })
    await user().click(screen.getByRole('button', { name: 'Exporter les soldes' }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/^Réservé par la règle d’espace : /)),
    )
    expect(downloadCSV).not.toHaveBeenCalled()
  })
})

// Théo C missions-encaissements — l'écran de Théo : quatre tuiles d'encours, ancienneté,
// règles de suivi, et les paiements sortants fondus dedans (Louis 22/10/2026).
describe('Encaissements — l’écran de Théo', () => {
  const dueLate = line({ dueOn: '2026-08-09' }) // 20 jours de retard au 29/08
  const dueSoon = line({ missionId: '22222222-2222-4222-8222-222222222222', dueOn: '2026-09-30' })
  const disputed = line({
    missionId: '33333333-3333-4333-8333-333333333333',
    dueOn: '2026-08-19',
    disputedAt: '2026-08-21T12:00:00.000Z',
    disputeReason: 'heures contestées',
    invoicedAmountCents: 3_600_00,
  })

  it('rend les quatre tuiles : reste à recevoir, dont échus, à rapprocher, litigieux', () => {
    invoicePayments.mockReturnValue({ data: { unmatched: [{ amountCents: 5_000_00 }] } })
    show({ items: [dueLate, dueSoon, disputed] })
    const tiles = screen.getByRole('group', { name: 'Encours' })
    expect(within(tiles).getByText('Reste à recevoir')).toBeTruthy()
    expect(within(tiles).getByText(/27\s?600\s?€/)).toBeTruthy()
    expect(within(tiles).getByText('Dont échus')).toBeTruthy()
    expect(within(tiles).getByText('À rapprocher')).toBeTruthy()
    expect(within(tiles).getByText(/5\s?000\s?€/)).toBeTruthy()
    expect(within(tiles).getByText('Montant litigieux')).toBeTruthy()
    // N7 — inclus dans l'encours, jamais ajouté.
    expect(within(tiles).getByText('inclus dans l’encours, pas ajouté')).toBeTruthy()
  })

  it('sans règlement à rapprocher, la tuile le dit en toutes lettres', () => {
    invoicePayments.mockReturnValue({ data: { unmatched: [] } })
    show({ items: [dueLate] })
    expect(screen.getByText('Aucun règlement à rapprocher')).toBeTruthy()
  })

  it('affiche l’ancienneté de l’encours en six tranches, tranches à 0 € comprises', () => {
    show({ items: [dueLate, dueSoon, line({ dueOn: null, missionId: '44444444-4444-4444-8444-444444444444' })] })
    const aging = screen.getByRole('region', { name: 'Ancienneté de l’encours' })
    for (const label of [
      'Non échus',
      '1 à 30 jours',
      '31 à 60 jours',
      '61 à 90 jours',
      'Plus de 90 jours',
      'Sans échéance',
    ]) {
      expect(within(aging).getByText(label)).toBeTruthy()
    }
  })

  it('écrit les règles de suivi, dont « aucune relance automatique »', () => {
    show({ items: [dueLate] })
    const rules = screen.getByRole('region', { name: 'Les règles de suivi' })
    expect(within(rules).getByText(/Aucune relance n’est envoyée automatiquement/)).toBeTruthy()
  })

  // Théo V22, A4 — les paiements sortants et les cessions vivent dans la vue financière : ici, un lien.
  it('renvoie « Ce qui sort » vers la vue financière, sans en recopier le contenu', () => {
    show({ items: [dueLate] })
    const out = screen.getByRole('region', { name: 'Ce qui sort' })
    expect(within(out).getByRole('link', { name: 'Paiements et cessions' }).getAttribute('href')).toBe(
      '/missions/finance',
    )
  })
})

// Refonte Théo du 23/10 — Encaissements : en-tête, filtres multiples, rapprochement, suivi rédigé par Laura.
describe('Encaissements — la refonte du 23/10', () => {
  const M2 = '22222222-2222-4222-8222-222222222222'
  const M3 = '33333333-3333-4333-8333-333333333333'

  it('porte UN titre de niveau 1 et le guide replié « Comment travailler ici ? »', () => {
    show({ items: [line()] })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Savoir ce qui entre. Et ce qui attend.' })).toBeTruthy()
    // Le guide de l'écran passe à la coque (un seul « Comment travailler ici ? », jamais deux).
    expect(
      within(screen.getByTestId('guide')).getByText('Savoir ce qui est encaissé, attendu ou contesté'),
    ).toBeTruthy()
  })

  it('arrivée depuis un compte : le bandeau le dit et rend la sortie « Voir tous les comptes »', () => {
    collectionsWindow.mockReturnValue({ items: [line()], canReadFinance: true, isLoading: false, failedMonths: 0 })
    render(<CollectionsPage now={NOW} client="ACME" />)
    const banner = screen.getByText('Filtré depuis le compte ACME.').closest('[role="status"]') as HTMLElement
    expect(banner).toBeTruthy()
    expect(within(banner).getByRole('link', { name: 'Voir tous les comptes' }).getAttribute('href')).toBe(
      '/missions/encaissements',
    )
  })

  it('filtre par compte en multi-sélection : deux comptes s’additionnent', async () => {
    show({
      items: [
        line({ accountName: 'ACME' }),
        line({ missionId: M2, accountName: 'BETA' }),
        line({ missionId: M3, accountName: 'GAMMA' }),
      ],
    })
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Compte : Tous les comptes' }))
    await u.click(screen.getByRole('menuitemcheckbox', { name: 'ACME' }))
    await u.click(screen.getByRole('menuitemcheckbox', { name: 'BETA' }))
    expect(screen.getAllByRole('listitem').some(item => /GAMMA/.test(item.textContent ?? ''))).toBe(false)
    expect(rowOf(/ACME/)).toBeTruthy()
    expect(rowOf(/BETA/)).toBeTruthy()
  })

  // A6 — « Sans échéance » n'est jamais « 0 € » : la facture est nommée, avec le geste pour saisir l'échéance.
  it('nomme la facture sans échéance et le geste pour la saisir, qui ouvre sa fenêtre', async () => {
    show({ items: [line({ dueOn: null, accountName: 'EDF', state: 'invoiced_declared' })] })
    expect(screen.getByText(/1 facture sans échéance \(EDF\) n’entre dans aucune tranche échue/)).toBeTruthy()
    const u = user()
    await u.click(screen.getAllByRole('button', { name: 'Saisir l’échéance' })[0]!)
    const dialog = screen.getByRole('dialog')
    await u.type(within(dialog).getByLabelText('Échéance'), '2026-09-15')
    await u.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(markInvoiced).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-06', dueOn: '2026-09-15', reference: 'F-2026-118' }),
      expect.anything(),
    )
  })

  it('sans règlement à rapprocher, la carte n’existe pas (une absence ne fait aucune ligne)', () => {
    show({ items: [line()] })
    expect(screen.queryByText('Les règlements à rapprocher')).toBeNull()
  })

  it('« Affecter » propose les factures candidates et ne valide rien tout seul', async () => {
    unmatchedPayments.mockReturnValue({
      data: {
        unmatched: [
          {
            id: 'p1',
            amountCents: 5_000_00,
            receivedOn: '2026-08-16',
            payer: 'SNCF VOYAGEURS',
            reference: 'VIR SEPA 1610',
            accountName: 'SNCF',
            ambiguous: false,
            candidates: [
              {
                invoiceReadinessId: 'inv-1',
                missionId: M2,
                missionLabel: 'Fiabilisation',
                accountName: 'SNCF',
                periodMonth: '2026-08-01',
                dueCents: 5_000_00,
              },
              {
                invoiceReadinessId: 'inv-2',
                missionId: M3,
                missionLabel: 'Autre',
                accountName: 'SNCF',
                periodMonth: '2026-07-01',
                dueCents: 5_000_00,
              },
            ],
          },
        ],
      },
    })
    show({ items: [line()] })
    expect(screen.getByText('Les règlements à rapprocher')).toBeTruthy()
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Affecter' }))
    const dialog = screen.getByRole('dialog')
    // Deux candidates : rien n'est présélectionné, valider reste fermé tant qu'on n'a pas choisi.
    expect(within(dialog).getByRole('button', { name: 'Valider le rapprochement' })).toBeDisabled()
    await u.click(within(dialog).getAllByRole('radio')[0]!)
    await u.click(within(dialog).getByRole('button', { name: 'Valider le rapprochement' }))
    expect(matchPayment).toHaveBeenCalledWith({ paymentId: 'p1', invoiceReadinessId: 'inv-1' }, expect.anything())
  })

  it('sans candidate, « Affecter » le dit au lieu d’en inventer une', async () => {
    unmatchedPayments.mockReturnValue({
      data: {
        unmatched: [
          {
            id: 'p1',
            amountCents: 900_00,
            receivedOn: '2026-08-16',
            payer: null,
            reference: null,
            accountName: null,
            ambiguous: false,
            candidates: [],
          },
        ],
      },
    })
    show({ items: [line()] })
    await user().click(screen.getByRole('button', { name: 'Affecter' }))
    expect(within(screen.getByRole('dialog')).getByText(/Aucune facture n’a un reste dû égal/)).toBeTruthy()
  })

  it('« Consigner un règlement » enregistre un règlement à rapprocher (montant et date obligatoires)', async () => {
    show({ items: [line()] })
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Consigner un règlement' }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Consigner le règlement' })
    expect(confirm).toBeDisabled()
    await u.type(within(dialog).getByLabelText('Date du règlement'), '2026-08-20')
    await u.type(within(dialog).getByLabelText('Montant reçu (€)'), '1250,50')
    await u.type(within(dialog).getByLabelText('Payeur'), 'ACME SA')
    await u.click(confirm)
    expect(recordUnmatched).toHaveBeenCalledWith(
      { amountCents: 125_050, receivedOn: '2026-08-20', payer: 'ACME SA' },
      expect.anything(),
    )
  })

  it('sans le droit Finance, ni « Consigner un règlement » ni « Affecter » ne sont proposés', () => {
    teamState.mockReturnValue({ team: { workspace: { role: 'viewer' } } })
    show({ items: [line()] })
    expect(screen.queryByRole('button', { name: 'Consigner un règlement' })).toBeNull()
  })

  // Louis 23/10 — Laura GÉNÈRE : la fenêtre s'ouvre déjà rédigée, éditable, avec « Régénérer ».
  it('« Suivre » ouvre une relance DÉJÀ rédigée, éditable, avec « Régénérer »', async () => {
    show({ items: [line({ billingContactName: 'Nadia Perrin', remindersSent: 1 })] })
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Suivre' }))
    const dialog = screen.getByRole('dialog')
    const message = within(dialog).getByLabelText('Message') as HTMLTextAreaElement
    expect(message.value).toMatch(/Bonjour Nadia Perrin,/)
    expect(message.value).toMatch(/F-2026-118/)
    expect(message.value).toMatch(/échue depuis le/)
    // Éditable, puis régénérable : le texte revient.
    await u.clear(message)
    await u.type(message, 'autre texte')
    await u.click(within(dialog).getByRole('button', { name: 'Régénérer' }))
    expect((within(dialog).getByLabelText('Message') as HTMLTextAreaElement).value).toMatch(/Bonjour Nadia Perrin,/)
    // « Ouvrir dans ma messagerie » n'envoie rien : un lien mailto.
    expect(within(dialog).getByRole('link', { name: 'Ouvrir dans ma messagerie' }).getAttribute('href')).toMatch(
      /^mailto:/,
    )
  })

  it('à la troisième relance sans réponse, Laura propose de remonter plutôt que de relancer encore', async () => {
    show({ items: [line({ billingContactName: 'Nadia Perrin', remindersSent: 3 })] })
    await user().click(screen.getByRole('button', { name: 'Suivre' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('3 relances sans réponse — à remonter.')).toBeTruthy()
    expect((within(dialog).getByLabelText('Message') as HTMLTextAreaElement).value).toMatch(/qui je dois solliciter/)
  })

  it('« Consigner une relance faite » enregistre le geste sur le mois de la ligne', async () => {
    show({ items: [line({ remindersSent: 1 })] })
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Suivre' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Consigner une relance faite' }))
    expect(recordReminder).toHaveBeenCalledWith({
      missionId: '11111111-1111-4111-8111-111111111111',
      month: '2026-06',
    })
  })

  it('« Ouvrir » ouvre la fenêtre de la facture, avec sa source', async () => {
    show({ items: [line()] })
    await user().click(screen.getByRole('button', { name: 'Ouvrir' }))
    expect(within(screen.getByRole('dialog')).getByText(/Facturé · source : ton outil de facturation/)).toBeTruthy()
  })

  it('le journal liste les règlements constatés, et se tait sans règlement', async () => {
    show({ items: [line({ paidAt: '2026-08-02T12:00:00.000Z', paidAmountCents: 12_000_00 })] })
    expect(screen.getByText('Journal des règlements')).toBeTruthy()
    cleanup()
    show({ items: [line()] })
    expect(screen.queryByText('Journal des règlements')).toBeNull()
  })

  // #2419.11 — notre maquette validée (back.talents.240) : un trop-perçu se NOTE comme crédit dû, jamais un avoir émis.
  it('« Affecter » propose aussi de noter un trop-perçu comme crédit client, motif obligatoire', async () => {
    unmatchedPayments.mockReturnValue({
      data: {
        unmatched: [
          {
            id: 'p1',
            amountCents: 900_00,
            receivedOn: '2026-08-16',
            payer: 'ACME SA',
            reference: null,
            accountName: 'ACME',
            ambiguous: false,
            candidates: [],
          },
        ],
      },
    })
    show({ items: [line()] })
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Affecter' }))
    const dialog = screen.getByRole('dialog')
    await u.click(within(dialog).getByRole('button', { name: 'Noter un trop-perçu, dû au client' }))
    const confirm = within(dialog).getByRole('button', { name: 'Noter la somme due au client' })
    expect(confirm).toBeDisabled()
    await u.type(within(dialog).getByLabelText(/Pourquoi/), 'payé deux fois')
    await u.click(confirm)
    expect(noteCredit).toHaveBeenCalledWith({ paymentId: 'p1', note: 'payé deux fois' }, expect.anything())
  })

  // Théo `dlg-dispute` — « Traiter le litige » montre le motif, puis lève — ou ne change rien.
  it('« Traiter le litige » ouvre le motif consigné et propose de le lever', async () => {
    show({ items: [line({ disputedAt: '2026-07-20T12:00:00.000Z', disputeReason: '2 jours contestés' })] })
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Traiter le litige' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('2 jours contestés')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Ne rien changer' })).toBeTruthy()
    await u.click(within(dialog).getByRole('button', { name: 'Lever le litige' }))
    expect(resolveDispute).toHaveBeenCalledWith({ missionId: '11111111-1111-4111-8111-111111111111', month: '2026-06' })
  })

  // Théo A2 — les deux alertes en tête de la file : les rappels dus, l'échu de plus de 30 jours.
  it('annonce les rappels dus et l’échu de plus de trente jours en tête de la file', () => {
    show({
      items: [
        line({ accountName: 'Renault', dueOn: '2026-08-04', remindersSent: 3 }),
        line({ missionId: M2, accountName: 'Airbus', dueOn: '2026-07-15', invoiceReference: 'F-0368' }),
      ],
    })
    expect(screen.getByText('2 rappels dus')).toBeTruthy()
    expect(screen.getByText(/Renault : relances sans réponse, à remonter\./)).toBeTruthy()
    expect(screen.getByText('1 facture échue depuis plus de 30 jours')).toBeTruthy()
    expect(screen.getByText(/Airbus · F-0368/)).toBeTruthy()
  })

  // Refonte Théo — la STRUCTURE de `c/missions-encaissements.html`, dans son ordre.
  it('suit la maquette : en-tête, barre, quatre tuiles, puis la file à gauche et trois cartes à droite', () => {
    unmatchedPayments.mockReturnValue({
      data: {
        unmatched: [
          {
            id: 'p1',
            amountCents: 5_000_00,
            receivedOn: '2026-08-16',
            payer: 'SNCF',
            reference: 'VIR SEPA',
            accountName: 'SNCF',
            ambiguous: false,
            candidates: [],
          },
        ],
      },
    })
    show({
      items: [
        line({ ownerName: 'Maëva Coet' }),
        line({
          missionId: M2,
          accountName: 'BETA',
          ownerName: 'Théo Haddad',
          paidAt: '2026-08-02T12:00:00.000Z',
          paidAmountCents: 12_000_00,
        }),
      ],
    })
    const head = screen.getByTestId('head-actions')
    expect(
      within(head)
        .getAllByRole('button')
        .map(button => button.textContent),
    ).toEqual(['Exporter les soldes', 'Consigner un règlement'])
    const toolbar = screen.getByRole('group', { name: 'Filtrer les encaissements' })
    expect(within(toolbar).getByText(/^Situation au /)).toBeTruthy()
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map(button => button.getAttribute('aria-label')),
    ).toEqual(['Compte : Tous les comptes', 'Responsable : Tous les responsables'])
    const tiles = screen.getByRole('group', { name: 'Encours' })
    expect(
      within(tiles)
        .getAllByText(/^(Reste à recevoir|Dont échus|À rapprocher|Montant litigieux)$/)
        .map(n => n.textContent),
    ).toEqual(['Reste à recevoir', 'Dont échus', 'À rapprocher', 'Montant litigieux'])
    const titles = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(titles).toEqual([
      'Les règlements à rapprocher',
      'Échéances à traiter',
      'Journal des règlements',
      'Ancienneté de l’encours',
      'Les règles de suivi',
      'Ce qui sort',
    ])
    // Les trois dernières vivent dans la colonne latérale.
    const aside = screen.getByRole('complementary')
    expect(within(aside).getAllByRole('heading', { level: 2 })).toHaveLength(3)
    expect(toolbar.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
