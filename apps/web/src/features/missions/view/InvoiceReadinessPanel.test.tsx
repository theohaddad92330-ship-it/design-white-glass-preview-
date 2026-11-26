import userEvent from '@testing-library/user-event'
import { summarizeReadiness, type InvoiceReadiness, type ReadinessSummary } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeclaredBusyStore } from '@/stores/lauraDeclaredBusyStore'
import { InvoiceReadinessPanel } from './InvoiceReadinessPanel'

// #2197.43 — même parti pris que `MissionsToolbar.test.tsx` et
// `RenewalDecisionPanel.test.tsx` : la bulle du copilote a ses propres tests,
// et cet écran doit pouvoir prouver qu'il PROPOSE le geste, indépendamment de
// ce que la bulle en fait.
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

const readiness = vi.fn()
const markInvoiced = vi.fn()
const openDispute = vi.fn()
const resolveDispute = vi.fn()
const bulkRemindMutate = vi.fn()

vi.mock('../api', () => ({
  useInvoiceReadiness: (...args: unknown[]) => readiness(...args),
  useMarkInvoiced: () => ({ mutate: markInvoiced, isPending: false }),
  // Les trois gestes d'encaissement (I-77). Le panneau les monte tous les
  // trois : un mock incomplet fait tomber l'écran ENTIER, et les tests
  // diraient alors « pas de bloqueur nommé » pour la mauvaise raison.
  useRecordPayment: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelInvoiced: () => ({ mutate: vi.fn(), isPending: false }),
  useRecordReminder: () => ({ mutate: vi.fn(), isPending: false }),
  // Le geste GROUPÉ (31/08/2026) : même contrat que `useRecordReminder`, un
  // mock incomplet ferait ÉGALEMENT tomber l'écran entier.
  useBulkRecordReminder: () => ({ mutate: bulkRemindMutate, isPending: false }),
  // Le litige (BEL-MIS-011) : deux gestes, comme l'encaissement.
  useOpenDispute: () => ({ mutate: openDispute, isPending: false }),
  useResolveDispute: () => ({ mutate: resolveDispute, isPending: false }),
  invoiceReadinessApi: { exportCsv: vi.fn() },
}))
// `Link` rend son `to` en `href` : c'est la DESTINATION qu'on veut asserter,
// pas seulement la présence d'un lien. `params` est interpolé — le chevron
// (`InvoiceReadinessTable`) pose `to="/missions/$id"` + `params={{ id }}`, et
// sans l'interpolation le test ne verrait jamais QUELLE mission il ouvre.
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
  }) => {
    const href = params ? Object.entries(params).reduce((acc, [key, value]) => acc.replace(`$${key}`, value), to) : to
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))
// Le sélecteur de mois porte sa propre logique (les douze derniers mois,
// testée seule dans `InvoiceReadinessMonthSelect.test.ts`) — ce fichier n'a
// besoin que du FIL : que le panneau transmette bien ce qu'il choisit. Un
// `<select>` natif le prouve sans dépendre du portail Radix, qui n'a pas de
// précédent testé dans ce dépôt.
vi.mock('./InvoiceReadinessMonthSelect', () => ({
  InvoiceReadinessMonthSelect: ({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) => (
    <select aria-label="Mois" value={value ?? ''} onChange={event => onChange(event.target.value)}>
      <option value="">—</option>
      <option value="2026-06">juin 2026</option>
      <option value="2026-08">août 2026</option>
    </select>
  ),
}))

function item(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: 'm1',
    missionLabel: 'Renfort plateforme',
    accountId: null,
    accountName: 'ACME',
    periodMonth: '2026-08-01',
    state: 'blocked',
    blockers: ['missing_timesheet'],
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
    ...over,
  }
}

function invoiced(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return item({ state: 'invoiced', blockers: [], invoicedAt: '2026-09-02T09:00:00.000Z', ...over })
}

function summary(over: Partial<ReadinessSummary> = {}): ReadinessSummary {
  return {
    ready: 0,
    blocked: 1,
    invoiced: 0,
    // #2197.41 — compté SÉPARÉMENT de `invoiced` (déclaré, non prouvé) : 0 par
    // défaut, comme les fixtures déjà écrites qui ne parlent pas de lui.
    invoicedDeclared: 0,
    preparedAmountCents: 0,
    blockedAmountCents: 0,
    withoutAmount: 0,
    notDue: 0,
    // #2197.7 — 0 par défaut, comme les autres compteurs de cette fixture :
    // la plupart des tests de ce fichier ne parlent pas de l'écart de période.
    unexplainedGapCount: 0,
    // #2197.6 — même raison : 0 par défaut, les tests dédiés le nomment.
    preparedInvoicesCount: 0,
    // #2783 — même raison : 0 par défaut, les tests dédiés le nomment.
    amendmentsAccepted: 0,
    amendmentsSimulated: 0,
    ...over,
  }
}

/** Théo — un geste par ligne, les autres sous « ⋯ » : ouvre le menu de la (seule) ligne, s'il existe. */
async function openRowMenu() {
  const trigger = screen.queryByRole('button', { name: /^Autres gestes pour/ })
  if (trigger) await userEvent.setup({ pointerEventsCheck: 0 }).click(trigger)
}

/** Clique un geste, qu'il soit le bouton de la ligne ou une entrée de son menu « ⋯ ». */
async function openRowMenuItem(label: string) {
  const direct = screen.queryByRole('button', { name: label })
  if (direct) {
    fireEvent.click(direct)
    return
  }
  await openRowMenu()
  await userEvent.setup({ pointerEventsCheck: 0 }).click(await screen.findByRole('menuitem', { name: label }))
}

function renderPanel(props: { onShowMissions?: () => void; hideDisclaimer?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InvoiceReadinessPanel {...props} />
    </QueryClientProvider>,
  )
}

describe('InvoiceReadinessPanel', () => {
  beforeEach(() => {
    readiness.mockReset()
    markInvoiced.mockReset()
    openDispute.mockReset()
    resolveDispute.mockReset()
    useDeclaredBusyStore.setState({ activeIds: new Set() })
  })

  /**
   * #2197.41 — l'entête compte AUSSI le DÉCLARÉ, séparément du PROUVÉ.
   *
   * `summary.invoicedDeclared` existe côté contrat depuis ce lot ; l'écran ne
   * le passait pas à `t('readiness.counts', …)`, et la clé i18n interpolait
   * `{{invoicedDeclared}}` littéralement — un compteur qui existe côté
   * serveur et que personne ne lit vaut le même « code juste, jamais appelé »
   * que le reste de ce dépôt.
   */
  it('#2197.41 — l’entête nomme aussi les mois DÉCLARÉS facturés, séparément des PROUVÉS', () => {
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ ready: 2, blocked: 1, invoiced: 3, invoicedDeclared: 5 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText(/5 déclaré\(s\) facturé\(s\)/)).toBeInTheDocument()
    // Et jamais la clé brute non interpolée — le défaut qui a motivé ce test.
    expect(screen.queryByText(/invoicedDeclared/)).not.toBeInTheDocument()
  })

  // #2575 — recette prod du 07/10/2026 : le tableau mesurait 1 834 px dans un
  // parent de 1 206 px, « Statut » et l'action hors du champ visible. Les
  // colonnes SECONDAIRES se replient sous 2xl (leur valeur reste sur la fiche
  // mission, un clic) ; Statut et le chevron d'action restent TOUJOURS visibles.
  it('#2575 — replie les colonnes secondaires sous 2xl et garde Statut et l’action visibles', () => {
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    const headers = screen.getAllByRole('columnheader')
    const byName = (name: RegExp) => headers.find(header => name.test(header.textContent ?? ''))
    for (const secondary of [/TJM/, /Statut CRA/]) {
      expect(byName(secondary)?.className, String(secondary)).toMatch(/\bhidden\b.*2xl:table-cell/)
    }
    // #2197.9 — la société facturante est visible dès xl (1 280 px), pas seulement 2xl.
    expect(byName(/Société facturante/)?.className).toMatch(/\bhidden\b.*xl:table-cell/)
    expect(byName(/Société facturante/)?.className).not.toMatch(/2xl:table-cell/)
    // #3709 — Client et Jours quittent leur colonne (sous Mission / Période).
    for (const folded of [/^Client$/, /^Jours$/]) {
      expect(byName(folded)?.className, String(folded)).toMatch(/(^| )hidden( |$)/)
    }
    expect(byName(/Contrôles/)?.className).not.toMatch(/\bhidden\b/)
    expect(byName(/^Mission$/)?.className).not.toMatch(/\bhidden\b/)
  })

  it('NOMME chaque bloqueur — « non facturable » sans raison fait rouvrir trois écrans', () => {
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    // ⚠️ Depuis le 27/08 le badge nomme AUSSI le geste et MÈNE quelque part :
    // `BLOCKER_ACTIONS` portait la route depuis le PDF 5 sans aucun appelant,
    // et un indicateur qui ne mène nulle part ne sert à rien. L'assertion
    // vérifie donc les deux moitiés plutôt que le seul libellé.
    expect(screen.getByText(/Aucun relevé d’activité/)).toBeInTheDocument()
    expect(screen.getByText(/ouvrir le relevé/)).toBeInTheDocument()
  })

  // #2197.43 — « Demander à Laura » existait sur les renouvellements et le
  // planning (`RenewalsPage`, `PlanningPage`) mais pas ici : la bulle recevait
  // déjà le contexte du mois (`useLauraContext`) sans qu'aucun lien n'ouvre la
  // conversation avec une question pré-remplie.
  it('propose de demander à Laura, avec une question pré-remplie sur ce mois', () => {
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, l'amorce ouvre la bulle SUR PLACE : un bouton.
    expect(screen.getByRole('button', { name: /Demander à .+ quoi prioriser/ })).toHaveAttribute('type', 'button')
  })

  // #2566.2 — le blocage « bon de commande » NOMME son owner, sur l'écran où
  // le critère de recette se joue réellement (une mission longue, un PO qui
  // expire au milieu de la période).
  it('NOMME le chargé d’affaires sur le blocage « bon de commande expiré »', () => {
    readiness.mockReturnValue({
      data: {
        items: [item({ blockers: ['po_period_mismatch'], ownerId: 'u2', ownerName: 'Awa Diallo' })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText(/Bon de commande expiré pour ce mois/)).toBeInTheDocument()
    expect(screen.getByText(/À faire par Awa Diallo/)).toBeInTheDocument()
    // #2197.19 — DEUX endroits, et c'est voulu : le porteur nommé sur le
    // blocage PRÉCIS, et sa propre colonne « Owner ». `getAllByText` plutôt
    // que `getByText`, qui exige l'unicité.
    expect(screen.getAllByText(/Awa Diallo/)).toHaveLength(2)
  })

  it('NOMME son mois — « août 2026 », jamais le « 2026-08 » brut du serveur (GA-207)', () => {
    // Mesuré à l'œil en production le 30/08/2026 : cet écran affichait
    // « Facturation — 2026-07 ». Le lot F3 du matin avait corrigé l'AUTRE
    // appelant de `readiness.title` (`MissionDetailTabs`) et laissé
    // celui-ci — la garde d'architecture ne surveillait qu'un fichier.
    //
    // ⚠️ Ce test ne dit RIEN du mois choisi : `/missions/facturation` garde
    // volontairement le défaut serveur `previousMonth(now)` (D781). Il
    // n'assert que la FORME.
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText(/Facturation — août 2026/)).toBeInTheDocument()
    expect(screen.queryByText(/2026-08/)).not.toBeInTheDocument()
  })

  it('dit que le montant est PRÉPARATOIRE, pas une facture', () => {
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText(/n’émet aucune facture/)).toBeInTheDocument()
  })

  it('R3b — hideDisclaimer : la note « n’émet aucune facture » du panneau disparaît (le bandeau de la page la porte)', () => {
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel({ hideDisclaimer: true })
    expect(screen.queryByText(/n’émet aucune facture/)).not.toBeInTheDocument()
  })

  it('distingue « aucun relevé » de « zéro jour »', () => {
    readiness.mockReturnValue({
      data: { items: [item({ days: null })], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText(/Aucun relevé$/)).toBeInTheDocument()
    expect(screen.queryByText(/0 jour/)).not.toBeInTheDocument()
  })

  it('affiche le compteur « non chiffré » à côté du total', () => {
    // Sans lui, un total partiel se lit comme un total.
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ withoutAmount: 3, preparedAmountCents: 120_000 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('3 non chiffrés')).toBeInTheDocument()
  })

  /**
   * #2197.6 — « Résumé : Factures préparées ». Le compteur existe désormais
   * côté serveur (`ReadinessSummary.preparedInvoicesCount`) ; ce test prouve
   * que l'écran l'AFFICHE, pas seulement qu'il le reçoit.
   */
  it('#2197.6 — affiche le nombre de factures préparées ce mois', () => {
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ preparedInvoicesCount: 2 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('2 factures préparées')).toBeInTheDocument()
  })

  // #2197.6 — doctrine « on n'affiche pas ce qu'on n'a pas » (GA-18/19) :
  // zéro facture préparée n'est pas une absence à annoncer comme un fait, ce
  // mois n'a simplement rien à montrer sur ce point précis.
  it('#2197.6 — n’affiche RIEN quand aucune facture n’est préparée', () => {
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ preparedInvoicesCount: 0 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText(/facture préparée/)).not.toBeInTheDocument()
  })

  /**
   * #2783 — « dont avenants » à l'échelle de l'espace, sur ce mois : décidés
   * et simulés RENDUS SÉPARÉMENT, jamais fondus dans une même ligne.
   */
  it('#2783 — affiche décidés et simulés séparément', () => {
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ amendmentsAccepted: 2, amendmentsSimulated: 1 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('2 avenants acceptés')).toBeInTheDocument()
    expect(screen.getByText('1 avenant simulé')).toBeInTheDocument()
  })

  // #2783 — doctrine « on n'affiche pas ce qu'on n'a pas » (GA-18/19).
  it('#2783 — n’affiche RIEN quand aucun avenant n’a d’effet ce mois', () => {
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ amendmentsAccepted: 0, amendmentsSimulated: 0 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText(/avenant/)).not.toBeInTheDocument()
  })

  /**
   * #2197.7 — « Résumé : Écart période ». Même famille que #2197.6 : le
   * motif `unexplained_gap` existait déjà PAR LIGNE, jamais résumé en tuile.
   */
  it('#2197.7 — affiche le nombre de mois à l’écart de période non expliqué', () => {
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ unexplainedGapCount: 4 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('4 écarts de période non expliqués')).toBeInTheDocument()
  })

  it('#2197.7 — n’affiche RIEN quand aucun écart n’est à expliquer', () => {
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ unexplainedGapCount: 0 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText(/écart de période/)).not.toBeInTheDocument()
  })

  it('n’offre PAS de marquer facturé un mois déjà facturé ailleurs', () => {
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'invoiced', blockers: [], invoicedAt: '2026-09-02T09:00:00.000Z' })],
        summary: summary({ blocked: 0, invoiced: 1 }),
        month: '2026-08',
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText('Marqué comme facturé ailleurs')).not.toBeInTheDocument()
    expect(screen.getByText('Facturé ailleurs')).toBeInTheDocument()
  })

  it('compte les mois facturés ailleurs dans l’entête', () => {
    // Mesuré en production le 27/08 : `invoiced: 1` était rendu par le serveur
    // et affiché nulle part, si bien que l'entête écrivait « 0 prêt · 0
    // bloqué » au-dessus d'une ligne facturée — ça se lit « rien ce mois-ci ».
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'invoiced', blockers: [], invoicedAt: '2026-09-02T09:00:00.000Z' })],
        summary: summary({ blocked: 0, invoiced: 1 }),
        month: '2026-08',
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText(/1 facturé\(s\) ailleurs/)).toBeInTheDocument()
  })

  it('ne rend PAS un échec de lecture comme une liste vide', () => {
    readiness.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPanel()
    expect(screen.getByText(/n’a pas pu être chargé/)).toBeInTheDocument()
    expect(screen.queryByText('Rien à surveiller sur ce mois.')).not.toBeInTheDocument()
  })

  it('DIT qu’une facture est en litige, et ce que le client conteste', () => {
    // Sans ces deux mots à l'écran, une facture contestée se lit comme une
    // facture en retard — or l'une se discute et l'autre se relance.
    readiness.mockReturnValue({
      data: {
        items: [invoiced({ disputedAt: '2026-09-10T09:00:00.000Z', disputeReason: 'Trois jours contestés' })],
        summary: summary({ blocked: 0, invoiced: 1 }),
        month: '2026-08',
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('En litige')).toBeInTheDocument()
    expect(screen.getByText(/Trois jours contestés/)).toBeInTheDocument()
  })

  it('n’offre le litige que sur une facture ANNONCÉE', async () => {
    // Contester un mois que personne n'a facturé n'a pas de sens.
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    await openRowMenu()
    expect(screen.queryByText('Déclarer un litige')).not.toBeInTheDocument()
  })

  /**
   * #2419.8 — LA RELANCE N'EST « ENVOYÉE » QUE SUR PREUVE DU CONNECTEUR.
   *
   * `recordReminder` consigne un geste déclaratif humain (`c31`) : sans
   * `message_id`, une relance reste CONSIGNÉE, jamais ENVOYÉE — la distinction
   * vit désormais dans le MODÈLE (`InvoiceReadiness.lastReminderMessageId`),
   * pas seulement dans un libellé figé.
   */
  it('sans `message_id` : la relance reste CONSIGNÉE — jamais un mot d’envoi', () => {
    readiness.mockReturnValue({
      data: {
        items: [item({ remindersSent: 2, lastReminderMessageId: null })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('2 relances consignées')).toBeInTheDocument()
    expect(screen.queryByText(/2 relances envoyées/)).not.toBeInTheDocument()
  })

  it('AVEC un `message_id` (preuve du connecteur) : la relance se dit ENVOYÉE', () => {
    readiness.mockReturnValue({
      data: {
        items: [item({ remindersSent: 1, lastReminderMessageId: 'gmail:msg-abc123' })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('1 relance envoyée')).toBeInTheDocument()
    expect(screen.queryByText(/consignée/)).not.toBeInTheDocument()
  })

  it('exige un MOTIF : le bouton reste inerte tant que rien n’est saisi', async () => {
    readiness.mockReturnValue({
      data: {
        items: [invoiced()],
        summary: summary({ blocked: 0, invoiced: 1 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    await openRowMenuItem('Déclarer un litige')
    // Le libellé d'un bouton vit dans un `<p>` interne : c'est le BOUTON qu'on
    // interroge, sinon on affirme qu'un paragraphe n'est pas désactivé.
    const confirm = screen.getByRole('button', { name: 'Enregistrer le litige' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Que conteste le client ? (obligatoire)'), {
      target: { value: 'Trois jours de mars' },
    })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    expect(openDispute).toHaveBeenCalledWith({ missionId: 'm1', month: '2026-08', reason: 'Trois jours de mars' })
  })

  /**
   * « Rien à surveiller sur ce mois. » se lit comme une bonne nouvelle et n'en
   * est pas une : la requête ne rend AUCUNE ligne quand aucune mission ne
   * couvre le mois (`m.status <> 'draft'` + fenêtre `started_on` / `ends_on`).
   * C'est donc une question ouverte — mes missions sont-elles là ? leurs dates
   * sont-elles justes ? — et elle se répond sur les Missions, jamais ici.
   */
  it('l’état vide MÈNE aux missions — un mois sans mission n’a rien à facturer', () => {
    readiness.mockReturnValue({
      data: { items: [], summary: summary({ blocked: 0 }), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('link', { name: /missions/i })).toHaveAttribute('href', '/missions')
  })

  it('depuis l’onglet des Missions, la porte BASCULE au lieu de pointer sur soi-même', () => {
    // Le panneau a deux hôtes : la route `/missions/facturation` et la lentille
    // « Prêt à facturer » de `/missions`. Un `<Link to="/missions">` depuis la
    // seconde ne changerait rien à l'écran — un bouton qui ne fait rien est
    // pire qu'un chiffre nu.
    const onShowMissions = vi.fn()
    readiness.mockReturnValue({
      data: { items: [], summary: summary({ blocked: 0 }), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel({ onShowMissions })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /missions/i }))
    expect(onShowMissions).toHaveBeenCalledTimes(1)
  })

  it('n’offre AUCUNE porte sur un échec de lecture', () => {
    // « Réessaie » n'est pas une destination.
    readiness.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPanel()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('sur une ligne en litige, propose de le LEVER — jamais d’en ouvrir un second', async () => {
    readiness.mockReturnValue({
      data: {
        items: [invoiced({ disputedAt: '2026-09-10T09:00:00.000Z', disputeReason: 'Prestation contestée' })],
        summary: summary({ blocked: 0, invoiced: 1 }),
        month: '2026-08',
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    await openRowMenu()
    expect(screen.queryByText('Déclarer un litige')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Lever le litige'))
    expect(resolveDispute).toHaveBeenCalledWith({ missionId: 'm1', month: '2026-08' })
  })
})

/**
 * « N non chiffrés » — un compteur juste, à côté du total, qui ne menait nulle
 * part.
 *
 * ⚠️ Il ne peut PAS mener à un écran : les deux causes d'un montant absent se
 * réparent à deux endroits différents (`days === null` sur le relevé,
 * `dailyRateCents === null` sur la fiche mission). Un lien unique serait faux
 * une fois sur deux. Chaque ligne concernée porte déjà SA porte, exacte, par
 * `BLOCKER_ACTIONS` — le compteur amène donc à ces lignes-là, et à rien d'autre.
 *
 * Le risque de ce choix est le décompte : le filtre de l'écran et le compteur
 * du serveur peuvent diverger en silence. C'est ce que garde le second test,
 * contre le VRAI `summarizeReadiness`.
 */
describe('InvoiceReadinessPanel — « non chiffré » mène aux lignes concernées', () => {
  /** Les quatre états, chiffrés et non chiffrés — pour que la garde LISE
   *  quelque chose et voie les deux exclusions (`invoiced`, `not_due`). */
  const corpus: InvoiceReadiness[] = [
    item({ missionId: 'a', missionLabel: 'L1', state: 'blocked', preparedAmountCents: null }),
    item({ missionId: 'b', missionLabel: 'L2', state: 'blocked', days: 18, preparedAmountCents: 1_170_000 }),
    item({
      missionId: 'c',
      missionLabel: 'L3',
      state: 'ready',
      blockers: [],
      days: 20,
      preparedAmountCents: 1_300_000,
    }),
    invoiced({ missionId: 'd', missionLabel: 'L4', preparedAmountCents: null }),
    item({ missionId: 'e', missionLabel: 'L5', state: 'not_due', blockers: [], preparedAmountCents: null }),
    item({ missionId: 'f', missionLabel: 'L6', state: 'blocked', preparedAmountCents: null }),
  ]
  const expected = summarizeReadiness(corpus)

  beforeEach(() => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: { items: corpus, summary: expected, month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
  })

  it('le corpus porte bien des lignes des deux côtés — sinon la garde est borgne', () => {
    expect(expected.withoutAmount).toBeGreaterThan(0)
    expect(expected.withoutAmount).toBeLessThan(corpus.length)
  })

  it('le compteur est un GESTE : il resserre la liste sur ses propres lignes', () => {
    renderPanel()
    expect(screen.getAllByText(/^L\d$/)).toHaveLength(corpus.length)
    fireEvent.click(screen.getByRole('button', { name: `${expected.withoutAmount} non chiffrés` }))
    // Le décompte de l'écran est celui du serveur, ligne pour ligne.
    expect(screen.getAllByText(/^L\d$/)).toHaveLength(expected.withoutAmount)
    expect(screen.getByText('L1')).toBeInTheDocument()
    expect(screen.getByText('L6')).toBeInTheDocument()
  })

  it('n’avale ni le mois déjà facturé ailleurs ni le mois non dû — ils ne sont pas « ratés »', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: `${expected.withoutAmount} non chiffrés` }))
    // Leur montant est `null` lui aussi, mais la question du chiffrage ne se
    // pose pas : les compter ici gonflerait un compteur d'anomalies.
    expect(screen.queryByText('L4')).not.toBeInTheDocument()
    expect(screen.queryByText('L5')).not.toBeInTheDocument()
  })

  it('le geste se DÉFAIT — un filtre sans retour est un piège', () => {
    renderPanel()
    const toggle = screen.getByRole('button', { name: `${expected.withoutAmount} non chiffrés` })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByText(/^L\d$/)).toHaveLength(corpus.length)
  })

  it('aucun geste quand tout est chiffré — un bouton qui ne filtre rien n’existe pas', () => {
    const priced = [corpus[1] as InvoiceReadiness, corpus[2] as InvoiceReadiness]
    readiness.mockReturnValue({
      data: { items: priced, summary: summarizeReadiness(priced), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText(/non chiffré/)).not.toBeInTheDocument()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Le droit financier — « pas le droit » n'est pas « pas chiffrable »         */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Le défaut, mesuré le 29/08/2026 : cet écran rendait les montants sans jamais
 * consulter de droit — zéro occurrence de `canReadFinance` — au-dessus d'une
 * route qui ne déclarait aucune permission. Un `viewer` ou un `recruiter` lisait
 * donc le montant préparé, facturé et encaissé de chaque mois de l'ESN.
 *
 * Ce qui se garde ici est la moitié CLIENT du correctif : le serveur vide les
 * montants, l'écran doit encore dire POURQUOI ils sont vides — sinon un montant
 * absent par manque de droit se lit « ce mois n'est pas chiffrable », et
 * quelqu'un va chercher un relevé qui existe.
 */
describe('InvoiceReadinessPanel — les montants suivent le droit financier', () => {
  beforeEach(() => {
    readiness.mockReset()
  })

  function withRight(canReadFinance: boolean, over: Partial<ReadinessSummary> = {}) {
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'ready', blockers: [], days: 18, preparedAmountCents: 1_170_000 })],
        summary: summary({ ready: 1, blocked: 0, preparedAmountCents: 1_170_000, ...over }),
        month: '2026-08',
        canReadFinance,
      },
      isLoading: false,
      isError: false,
    })
  }

  it('SANS le droit : aucun montant a l ecran', () => {
    withRight(false)
    renderPanel()
    expect(screen.queryByText(/11700 €/)).not.toBeInTheDocument()
  })

  it('SANS le droit : JAMAIS « 0 € » — un zero se lirait « rien a facturer »', () => {
    // GA-18 / GA-19. C'est la facon dont une redaction rate le plus souvent :
    // en affichant la valeur vide plutot qu'en la taisant.
    withRight(false, { preparedAmountCents: null, blockedAmountCents: null })
    renderPanel()
    expect(screen.queryByText(/0 €/)).not.toBeInTheDocument()
  })

  it('SANS le droit : l ecran DIT que c est une question de droit', () => {
    // « Pas ton perimetre » fait demander un acces ; « non chiffrable » fait
    // chercher un releve. Les confondre envoie reparer ce qui n'est pas casse.
    withRight(false)
    renderPanel()
    expect(screen.getByText(/Montants réservés/)).toBeInTheDocument()
  })

  it('SANS le droit : les BLOQUEURS restent — c est la raison de ne pas refuser l ecran', () => {
    readiness.mockReturnValue({
      data: {
        items: [item()],
        summary: summary({ blocked: 1 }),
        month: '2026-08',
        canReadFinance: false,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText(/Aucun relevé d’activité/)).toBeInTheDocument()
  })

  it('SANS le droit : le compteur « non chiffre » se TAIT — il compterait la redaction', () => {
    // `isWithoutAmount` teste `preparedAmountCents === null`. Sous redaction,
    // TOUTES les lignes valent `null` : laisser ce compteur parler annoncerait
    // « 1 non chiffre » sur un mois parfaitement chiffre.
    withRight(false, { withoutAmount: 3 })
    renderPanel()
    expect(screen.queryByText(/non chiffré/)).not.toBeInTheDocument()
  })

  it('AVEC le droit : les montants s affichent, inchanges', () => {
    withRight(true)
    renderPanel()
    // DEUX endroits, et c'est voulu : le total de l'entete et le montant de la
    // ligne. `getAllByText` plutot que `getByText`, qui exige l'unicite.
    expect(screen.getAllByText(/11700 €/)).toHaveLength(2)
    expect(screen.queryByText(/Montants réservés/)).not.toBeInTheDocument()
  })
})

/**
 * #2197.14 — l'entête de la colonne montant disait « Montant TTC » (EN :
 * « Amount incl. tax ») alors qu'aucune TVA n'est jamais calculée nulle part
 * dans ce module (`preparedAmountCents` = jours × TJM, un HT). Le même
 * montant se nommait déjà correctement « Montant HT » dans l'aperçu du
 * connecteur (`readiness.connector.previewAmount`) — deux libellés pour la
 * même valeur, et le faux était sur la colonne la plus vue.
 */
describe('InvoiceReadinessPanel — #2197.14, la colonne dit HT, jamais TTC', () => {
  it('l’entête dit « Montant HT » — aucune TVA n’est calculée sur cet écran', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'ready', blockers: [], days: 10, preparedAmountCents: 100_000 })],
        summary: summary({ ready: 1, preparedAmountCents: 100_000 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Montant HT')).toBeInTheDocument()
    expect(screen.queryByText('Montant TTC')).not.toBeInTheDocument()
  })
})

/**
 * #2197.9, #2197.12, #2197.13, #2197.19 — décision de Louis du 16/09/2026
 * (soir) : « tout ajouter, en dur » plutôt qu'un sélecteur de colonnes. La
 * société facturante, les jours, le TJM et le porteur existaient déjà dans
 * `InvoiceReadiness` (`legalEntityName`, `days`, `dailyRateCents`,
 * `ownerName`) mais restaient hors du tableau — l'un replié dans la colonne
 * montant (jours, seulement quand le montant est inconnu), les trois autres
 * absents.
 */
describe('InvoiceReadinessPanel — #2197.9/.12/.13/.19, les quatre colonnes qui manquaient', () => {
  it('société facturante, jours, TJM et owner sont chacun leur PROPRE colonne', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [
          item({
            state: 'ready',
            blockers: [],
            days: 12,
            preparedAmountCents: 600_000,
            dailyRateCents: 50_000,
            legalEntityName: 'Bellum Conseil SAS',
            ownerName: 'Alix Bernard',
          }),
        ],
        summary: summary({ ready: 1, preparedAmountCents: 600_000 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Bellum Conseil SAS')).toBeInTheDocument()
    // Les jours restent visibles MÊME quand le montant est déjà chiffré — ce
    // n'était pas le cas avant (`AmountCell` ne montrait les jours QUE si le
    // montant était `null`).
    expect(screen.getByText('12 jours')).toBeInTheDocument()
    expect(screen.getByText('500 €/j')).toBeInTheDocument()
    expect(screen.getByText('Alix Bernard')).toBeInTheDocument()
  })

  it('le TJM reste visible SANS le droit financier — il n’est pas rédigé ailleurs dans ce dépôt', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'blocked', dailyRateCents: 45_000 })],
        summary: summary({ blocked: 1 }),
        month: '2026-08',
        canReadFinance: false,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('450 €/j')).toBeInTheDocument()
  })

  it('une société / un owner absents se lisent nommés, jamais silencieux', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'blocked', legalEntityName: null, ownerName: null })],
        summary: summary({ blocked: 1 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    // GA-18/19 — une société ou un owner absents se lisent « non mesuré »,
    // avec leur raison NOMMÉE à côté (`UnknownValue`, même primitive que la
    // colonne « Owner » de `MissionsTable.tsx`), jamais silencieux ni « 0 ».
    expect(screen.getByText(/non mesuré.*Aucune société renseignée/)).toBeInTheDocument()
    expect(screen.getByText(/non mesuré.*aucun porteur renseigné/)).toBeInTheDocument()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Le sélecteur de mois — un cas d'école du défaut n°1 de ce dépôt            */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `useInvoiceReadiness(month?)` acceptait déjà un mois, et ce panneau
 * l'appelait SANS argument (31/08/2026) : le paramètre était DÉCLARÉ, jamais
 * PASSÉ. Ces deux tests gardent le fil dans les deux sens — le défaut
 * serveur au premier rendu, et la transmission RÉELLE du choix ensuite.
 */
describe('InvoiceReadinessPanel — le sélecteur de mois transmet son choix', () => {
  beforeEach(() => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
  })

  it('appelle le hook SANS mois au premier rendu — le défaut reste celui du serveur (D781)', () => {
    renderPanel()
    expect(readiness).toHaveBeenCalledWith(undefined)
  })

  it('TRANSMET le mois choisi — le paramètre déclaré ne reste plus jamais sans appelant', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '2026-06' } })
    expect(readiness).toHaveBeenLastCalledWith('2026-06')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Les tuiles — trois, jamais quatre                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe('InvoiceReadinessPanel — les tuiles', () => {
  const rows: InvoiceReadiness[] = [
    item({
      missionId: 'a',
      missionLabel: 'Alpha',
      state: 'blocked',
      blockers: ['missing_timesheet'],
      supplierInvoiceStatus: 'missing',
    }),
    item({
      missionId: 'b',
      missionLabel: 'Beta',
      state: 'ready',
      blockers: [],
      days: 10,
      preparedAmountCents: 100_000,
      supplierInvoiceStatus: 'received',
    }),
    item({ missionId: 'c', missionLabel: 'Gamma', state: 'blocked', blockers: ['timesheet_disputed'] }),
  ]

  beforeEach(() => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: { items: rows, summary: summarizeReadiness(rows), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
  })

  it('affiche les TROIS tuiles — jamais un « brouillon », qui n’existe pas (c17_facturation)', () => {
    renderPanel()
    expect(screen.getByText('Facture manquante')).toBeInTheDocument()
    expect(screen.getByText('À envoyer')).toBeInTheDocument()
    expect(screen.getByText('CRA bloqué')).toBeInTheDocument()
    expect(screen.queryByText(/[Bb]rouillon/)).not.toBeInTheDocument()
  })

  it('« CRA manquants » filtre sur les CRA « à compléter », et se défait au second clic', () => {
    renderPanel()
    const button = screen.getByRole('button', { name: 'CRA manquants' })
    fireEvent.click(button)
    // Alpha (missing_timesheet → à compléter) reste seule ; Beta (aucun
    // bloqueur) et Gamma (timesheet_disputed → conflit) sortent.
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.getAllByText(/^(Alpha|Beta|Gamma)$/)).toHaveLength(3)
  })

  it('« Facture manquante » compte la facture ENTRANTE du sous-traitant, pas une facture client', () => {
    renderPanel()
    const tile = screen.getByText('Facture manquante').closest('button')
    expect(tile).toHaveTextContent('1')
  })

  it('« CRA bloqué » compte l’union des six codes timesheet_*, jamais un mois « prêt »', () => {
    renderPanel()
    const tile = screen.getByText('CRA bloqué').closest('button')
    expect(tile).toHaveTextContent('2')
  })

  it('chaque tuile FILTRE au clic, et le geste se DÉFAIT', () => {
    renderPanel()
    expect(screen.getAllByText(/^(Alpha|Beta|Gamma)$/)).toHaveLength(3)

    const tile = screen.getByText('Facture manquante').closest('button')
    expect(tile).not.toBeNull()
    fireEvent.click(tile as HTMLElement)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()

    fireEvent.click(tile as HTMLElement)
    expect(screen.getAllByText(/^(Alpha|Beta|Gamma)$/)).toHaveLength(3)
  })
})

/** Théo C missions-preparation.R1 — les quatre tuiles montants, en plus des trois tuiles de contrôle. */
describe('InvoiceReadinessPanel — les quatre tuiles de Théo', () => {
  const rows: InvoiceReadiness[] = [
    item({ missionId: 'a', missionLabel: 'Alpha', state: 'blocked', blockers: ['missing_timesheet'] }),
    item({
      missionId: 'b',
      missionLabel: 'Beta',
      state: 'ready',
      blockers: [],
      days: 10,
      preparedAmountCents: 100_000,
    }),
    item({ missionId: 'c', missionLabel: 'Gamma', state: 'blocked', blockers: ['timesheet_disputed'] }),
    invoiced({ missionId: 'd', missionLabel: 'Delta', preparedAmountCents: 50_000 }),
  ]
  function mount(canReadFinance: boolean) {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: { items: rows, summary: summarizeReadiness(rows), month: '2026-08', canReadFinance },
      isLoading: false,
      isError: false,
    })
    renderPanel()
  }

  it('Prêt à préparer porte le HT des dossiers prêts et leur nombre', () => {
    mount(true)
    const tile = screen.getByText('Prêt à préparer').closest('button')
    expect(tile).toHaveTextContent(/1\s000\s€/)
    expect(tile).toHaveTextContent('1 dossier')
  })

  it('À débloquer compte les dossiers bloqués, Déjà émis les factures lues ou déclarées', () => {
    mount(true)
    expect(screen.getByText('À débloquer').closest('button')).toHaveTextContent('2')
    expect(screen.getByText('Déjà émis').closest('div')).toHaveTextContent('1')
  })

  it('la tuile « Préparées » ne s’écrit jamais « brouillon » : une facture est préparée, pas créée', () => {
    mount(true)
    expect(screen.getByText('Préparées')).toBeInTheDocument()
    expect(screen.queryByText(/[Bb]rouillon/)).not.toBeInTheDocument()
  })

  it('sans droit financier, le montant est absent — jamais « 0 € »', () => {
    mount(false)
    const tile = screen.getByText('Prêt à préparer').closest('button')
    expect(tile).not.toHaveTextContent('€')
    expect(tile).toHaveTextContent('—')
  })

  it('Prêt à préparer et À débloquer FILTRENT au clic, et se défont au second', () => {
    mount(true)
    fireEvent.click(screen.getByText('Prêt à préparer').closest('button') as HTMLElement)
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Prêt à préparer').closest('button') as HTMLElement)
    fireEvent.click(screen.getByText('À débloquer').closest('button') as HTMLElement)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  La pagination — 10 lignes par page                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe('InvoiceReadinessPanel — pagination, 10 par page', () => {
  const rows: InvoiceReadiness[] = Array.from({ length: 11 }, (_, index) =>
    item({
      missionId: `m${index}`,
      missionLabel: `Mission ${index}`,
      state: 'blocked',
      blockers: ['missing_timesheet'],
    }),
  )

  beforeEach(() => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: { items: rows, summary: summarizeReadiness(rows), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
  })

  it('affiche DIX lignes au maximum sur la première page', () => {
    renderPanel()
    expect(screen.getAllByText(/^Mission \d+$/)).toHaveLength(10)
  })

  it('« Page suivante » montre la onzième ligne — jamais un tableau qui déborde en silence', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
    expect(screen.getByText('Mission 10')).toBeInTheDocument()
    expect(screen.getAllByText(/^Mission \d+$/)).toHaveLength(1)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  La recherche                                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe('InvoiceReadinessPanel — la recherche', () => {
  const rows: InvoiceReadiness[] = [
    item({ missionId: 'a', missionLabel: 'Renfort plateforme', accountName: 'ACME' }),
    item({ missionId: 'b', missionLabel: 'Refonte portail', accountName: 'Damaris' }),
  ]

  beforeEach(() => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: { items: rows, summary: summarizeReadiness(rows), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
  })

  it('resserre sur le CLIENT autant que sur la MISSION', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'damaris' } })
    expect(screen.getByText('Refonte portail')).toBeInTheDocument()
    expect(screen.queryByText('Renfort plateforme')).not.toBeInTheDocument()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Le geste groupé « Relancer la saisie/validation CRA »                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ Ce geste ne PART jamais tout seul — il consigne, comme son pendant ligne
 * par ligne (`useRecordReminder`). Les tests le prouvent en vérifiant l'ENTRÉE
 * de la mutation, jamais un envoi : aucune capacité de messagerie n'existe
 * dans ce module (voir la note de `useBulkRecordReminder`, `../api.ts`).
 */
describe('InvoiceReadinessPanel — le geste groupé « Relancer la saisie/validation CRA »', () => {
  const rows: InvoiceReadiness[] = [
    item({ missionId: 'a', missionLabel: 'Alpha', state: 'blocked', blockers: ['missing_timesheet'] }),
    item({ missionId: 'b', missionLabel: 'Beta', state: 'ready', blockers: [] }),
  ]

  beforeEach(() => {
    readiness.mockReset()
    bulkRemindMutate.mockReset()
    readiness.mockReturnValue({
      data: { items: rows, summary: summarizeReadiness(rows), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
  })

  it('reste INERTE tant qu’aucune ligne à CRA bloqué n’est sélectionnée', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /Relancer la saisie\/validation CRA/ })).toBeDisabled()
  })

  it('sélectionner une ligne SANS CRA bloqué ne débloque pas le geste — rien à relancer dessus', () => {
    renderPanel()
    const checkboxes = screen.getAllByRole('checkbox')
    // Beta (index 1) est « ready », sans aucun bloqueur CRA.
    fireEvent.click(checkboxes[1] as HTMLElement)
    expect(screen.getByRole('button', { name: /Relancer la saisie\/validation CRA/ })).toBeDisabled()
  })

  it('sélectionner une ligne à CRA bloqué puis cliquer consigne UNE relance, sur CETTE mission', () => {
    renderPanel()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0] as HTMLElement) // Alpha
    const button = screen.getByRole('button', { name: /Relancer la saisie\/validation CRA/ })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(bulkRemindMutate).toHaveBeenCalledWith({
      items: [{ missionId: 'a', month: '2026-08', blockers: ['missing_timesheet'] }],
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  La facture ENTRANTE du sous-traitant — jamais une facture client           */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe('InvoiceReadinessPanel — la facture fournisseur (supplierInvoiceStatus)', () => {
  it('« manquante » se lit à côté de l’état, jamais à sa place', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ supplierInvoiceStatus: 'missing' })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Facture fournisseur manquante')).toBeInTheDocument()
    // L'état de facturation CLIENT reste affiché à côté — les deux badges
    // coexistent, l'un ne remplace jamais l'autre.
    expect(screen.getByText('Bloqué')).toBeInTheDocument()
  })

  it('« reçue » se lit, distincte de « manquante »', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ supplierInvoiceStatus: 'received' })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Facture fournisseur reçue')).toBeInTheDocument()
    expect(screen.queryByText('Facture fournisseur manquante')).not.toBeInTheDocument()
  })

  it('une mission NON sous-traitée (`null`) ne montre aucun des deux badges', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ supplierInvoiceStatus: null })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText('Facture fournisseur manquante')).not.toBeInTheDocument()
    expect(screen.queryByText('Facture fournisseur reçue')).not.toBeInTheDocument()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Le chevron — ouvre le dossier de la mission, pas un second geste           */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe('InvoiceReadinessPanel — le chevron', () => {
  it('pointe vers le dossier de LA mission de sa ligne', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ missionId: 'm-42' })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('link', { name: /Ouvrir le dossier de la mission/i })).toHaveAttribute(
      'href',
      '/missions/m-42',
    )
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  #2408.76, .77, .78 — les trois gestes ALIGNÉS sur le verbe de l'issue      */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Recette du 25/09 sur `/missions/facturation` : une mission bloquée par le
 * CRA n'offrait que « Consigner une relance » — un verbe générique, jamais
 * « Demander le CRA » (le libellé de l'issue #2408, déjà utilisé mot pour mot
 * par le menu de ligne de `MissionsTable.tsx`, `table.actions.requestCra`).
 *
 * Le geste dessous (`onRecordReminder` → `useRecordReminder`) ne change PAS :
 * consigner une relance vaut pour N'IMPORTE quel bloqueur (PO manquant, TJM
 * manquant…), pas seulement le CRA — le renommer partout aurait menti sur les
 * blocages non-CRA. Le libellé ne bascule donc QUE quand TOUS les bloqueurs de
 * la ligne sont ceux que `BLOCKER_ACTIONS` route déjà vers `/missions/cra`
 * (aucune catégorie inventée : la partition existe déjà côté contrat).
 */
describe('InvoiceReadinessPanel — #2408.76, le geste de relance nomme le CRA quand c’est de ça qu’il s’agit', () => {
  it('bloqueurs 100% CRA (relevé manquant) : le bouton dit « Demander le CRA »', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ blockers: ['missing_timesheet'] })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: 'Demander le CRA' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Consigner une relance' })).not.toBeInTheDocument()
  })

  it('bloqueur NON-CRA (bon de commande) : le bouton reste générique « Consigner une relance »', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ blockers: ['missing_po'] })],
        summary: summary(),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: 'Consigner une relance' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Demander le CRA' })).not.toBeInTheDocument()
  })
})

/**
 * Recette du 25/09 : « préparer la facture » restait introuvable — le seul
 * geste d'écriture d'une ligne non-facturée s'appelait « Marqué comme facturé
 * ailleurs », qui ne se lit jamais comme une PRÉPARATION. Renommage du même
 * bouton (et du titre de sa boîte de dialogue, MÊME clé), zéro nouvelle
 * mutation : ouvrir la boîte de dialogue EST le geste « préparer » — la
 * déclaration elle-même reste un second clic, sur « Enregistrer »
 * (`readiness.confirmInvoiced`, inchangé).
 */
describe('InvoiceReadinessPanel — #2408.77, « préparer la facture » remplace « marqué comme facturé ailleurs »', () => {
  it('le bouton de la ligne dit « Préparer la facture »', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'ready', blockers: [], days: 10, preparedAmountCents: 100_000 })],
        summary: summary({ ready: 1, blocked: 0 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: 'Préparer la facture' })).toBeInTheDocument()
  })

  it('ouvre une boîte de dialogue qui porte le MÊME titre, et « Enregistrer » reste le geste qui écrit', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'ready', blockers: [], days: 10, preparedAmountCents: 100_000 })],
        summary: summary({ ready: 1, blocked: 0 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Préparer la facture' }))
    expect(screen.getByRole('heading', { name: 'Préparer la facture' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
  })
})

/**
 * #2944 (recette écran, 26/09) — la boîte RÉELLEMENT montée par
 * `/missions/facturation` (`MarkInvoicedDialog`, ci-dessus) ne nommait AUCUNE
 * entité facturante : le correctif du 26/09 (#2197.29) avait été posé sur
 * `MissionDetailTabs.tsx` (`InvoiceConnectorGate`, la prévisualisation du
 * connecteur sur `/missions/:id`) — une boîte DIFFÉRENTE, jamais celle-ci.
 * Même libellé que la colonne « Société facturante » du tableau (#2197.9) et
 * que la prévisualisation du connecteur : un réglage vit à un seul endroit
 * (GA-26), donc la MÊME clé i18n, jamais un second texte.
 */
describe('InvoiceReadinessPanel — #2944, la boîte « Préparer la facture » nomme l’entité facturante', () => {
  it('nomme l’entité facturante quand la mission en porte une', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [
          item({
            state: 'ready',
            blockers: [],
            days: 10,
            preparedAmountCents: 100_000,
            legalEntityName: 'Bellum Conseil SAS',
          }),
        ],
        summary: summary({ ready: 1, blocked: 0 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Préparer la facture' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Société facturante')
    expect(dialog).toHaveTextContent('Bellum Conseil SAS')
  })

  it('sans entité rattachée : le dit ET offre le chemin pour la renseigner — jamais une raison sociale inventée', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [
          item({
            missionId: 'm-42',
            state: 'ready',
            blockers: [],
            days: 10,
            preparedAmountCents: 100_000,
            legalEntityName: null,
          }),
        ],
        summary: summary({ ready: 1, blocked: 0 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Préparer la facture' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Aucune société renseignée')
    const link = screen.getByRole('link', { name: /renseigner/i })
    expect(link).toHaveAttribute('href', '/missions/m-42')
  })
})

/**
 * Recette du 25/09 : « vérifier le paiement » restait introuvable sur
 * `/missions/facturation` — le seul geste d'une ligne facturée non soldée
 * s'appelait « Enregistrer le paiement ». Même bouton, même mutation
 * (`useRecordPayment`), libellé aligné mot pour mot sur `table.actions.checkPayment`
 * (le menu de ligne de `MissionsTable.tsx`) — sans dupliquer la traduction.
 */
describe('InvoiceReadinessPanel — #2408.78, « vérifier le paiement » remplace « enregistrer le paiement »', () => {
  it('une ligne facturée non soldée propose « Vérifier le paiement »', () => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'invoiced', blockers: [], invoicedAt: '2026-09-02T09:00:00.000Z' })],
        summary: summary({ ready: 0, blocked: 0, invoiced: 1 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: 'Vérifier le paiement' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer le paiement' })).not.toBeInTheDocument()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  #2403.14 / #2403.15 — une action critique en ligne tait Laura              */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe('InvoiceReadinessPanel — une invite d’écriture financière déclare Laura occupée', () => {
  beforeEach(() => {
    useDeclaredBusyStore.setState({ activeIds: new Set() })
  })

  it('rien d’ouvert : aucune déclaration', () => {
    readiness.mockReturnValue({
      data: {
        items: [invoiced()],
        summary: summary({ blocked: 0, invoiced: 1 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(useDeclaredBusyStore.getState().activeIds.has('invoice-critical-action')).toBe(false)
  })

  it('l’invite de LITIGE (encart en ligne, pas de `role=dialog`) déclare l’action critique', async () => {
    readiness.mockReturnValue({
      data: {
        items: [invoiced()],
        summary: summary({ blocked: 0, invoiced: 1 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    await openRowMenuItem('Déclarer un litige')
    expect(useDeclaredBusyStore.getState().activeIds.has('invoice-critical-action')).toBe(true)
  })

  it('l’annulation de l’invite retire la déclaration', async () => {
    readiness.mockReturnValue({
      data: {
        items: [invoiced()],
        summary: summary({ blocked: 0, invoiced: 1 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    await openRowMenuItem('Déclarer un litige')
    expect(useDeclaredBusyStore.getState().activeIds.has('invoice-critical-action')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ne rien changer' }))
    expect(useDeclaredBusyStore.getState().activeIds.has('invoice-critical-action')).toBe(false)
  })
})

// Théo missions-preparation — Compte et Responsable en multi-sélection ; « Couverture de commande » en colonne.
describe('InvoiceReadinessPanel — la refonte Théo (filtres et couverture de commande)', () => {
  const rows: InvoiceReadiness[] = [
    item({
      missionId: 'a',
      missionLabel: 'Fiabilisation plateforme',
      accountName: 'SNCF',
      ownerName: 'Maëlle',
      poNumber: 'BC-SNCF-2026-114',
      blockers: [],
    }),
    item({
      missionId: 'b',
      missionLabel: 'Convergence temps réel',
      accountName: 'Orange',
      ownerName: 'Théo',
      poNumber: null,
      blockers: ['missing_po'],
    }),
    item({
      missionId: 'c',
      missionLabel: 'Audit sécurité',
      accountName: 'Thales',
      ownerName: 'Maëlle',
      poNumber: 'BC-THA-2026-207',
      blockers: ['po_period_mismatch'],
    }),
  ]

  beforeEach(() => {
    readiness.mockReset()
    readiness.mockReturnValue({
      data: { items: rows, summary: summarizeReadiness(rows), month: '2026-09', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
  })

  it('filtre sur PLUSIEURS comptes à la fois', async () => {
    renderPanel()
    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: /^Compte/ }))
    await u.click(await screen.findByRole('menuitemcheckbox', { name: 'SNCF' }))
    await u.click(await screen.findByRole('menuitemcheckbox', { name: 'Thales' }))
    await u.keyboard('{Escape}')
    expect(screen.getByText('Fiabilisation plateforme')).toBeInTheDocument()
    expect(screen.getByText('Audit sécurité')).toBeInTheDocument()
    expect(screen.queryByText('Convergence temps réel')).not.toBeInTheDocument()
  })

  it('filtre sur le responsable', async () => {
    renderPanel()
    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: /^Responsable/ }))
    await u.click(await screen.findByRole('menuitemcheckbox', { name: 'Théo' }))
    await u.keyboard('{Escape}')
    expect(screen.getByText('Convergence temps réel')).toBeInTheDocument()
    expect(screen.queryByText('Fiabilisation plateforme')).not.toBeInTheDocument()
  })

  it('la colonne « Couverture de commande » écrit la référence, ou dit que la commande manque', () => {
    renderPanel()
    expect(screen.getAllByText('Couverture de commande').length).toBeGreaterThan(0)
    expect(screen.getByText('BC-SNCF-2026-114')).toBeInTheDocument()
    expect(screen.getByText('Commande manquante')).toBeInTheDocument()
    expect(screen.getByText('Période hors commande')).toBeInTheDocument()
  })
})

// Contrôle de fidélité Théo (23/10) — tuiles, filtres libellés, portée, tableau en carte ; UN geste par ligne.
describe('InvoiceReadinessPanel — structure de la maquette Théo', () => {
  it('empile les tuiles, les filtres, la ligne de portée puis le tableau', () => {
    readiness.mockReturnValue({
      data: { items: [item()], summary: summary(), month: '2026-08', canReadFinance: true },
      isLoading: false,
      isError: false,
    })
    const { container } = renderPanel()
    const order = [...container.querySelectorAll('[data-slot^="readiness-"]')].map(node =>
      node.getAttribute('data-slot'),
    )
    expect(order).toEqual(['readiness-tiles', 'readiness-filters', 'readiness-scope', 'readiness-table'])
    expect(screen.getByText('Période d’activité')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').some(header => header.textContent === 'Base du mois')).toBe(true)
  })

  it('une ligne prête porte « Préparer la facture » en bouton, et rien d’autre en vrac', () => {
    readiness.mockReturnValue({
      data: {
        items: [item({ state: 'ready', blockers: [] })],
        summary: summary({ ready: 1, blocked: 0 }),
        month: '2026-08',
        canReadFinance: true,
      },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: 'Préparer la facture' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Autres gestes pour/ })).not.toBeInTheDocument()
  })
})
