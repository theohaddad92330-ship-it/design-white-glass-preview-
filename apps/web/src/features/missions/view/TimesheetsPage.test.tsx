import { cleanup, fireEvent, render as renderUi, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const timesheetMonth = vi.fn()
const rejectTimesheet = vi.fn()
// #2196.30 — la forme d'une relance DUE, telle que la rend `dueReminders`
// côté API. Locale au test : le module `../api` est entièrement mocké
// ci-dessous, un type importé de là n'apporterait rien.
type DueReminderItem = {
  line: { missionId: string; consultantId: string | null; timesheetId: string | null }
  index: number
  overdueDays: number
  tone: 'neutral' | 'firm' | 'escalate'
}
// #2196.30 — les relances dues. Défaut « aucune » : les tests d'avant ce lot
// ne parlent pas de relances, et ne doivent pas avoir à le savoir.
const dueTimesheetReminders = vi.fn((_month?: string) => ({
  data: { channel: { kind: 'none' }, items: [] as DueReminderItem[] },
  isLoading: false,
  isError: false,
}))
const recordTimesheetReminder = vi.fn()
// #2196.31 — marquer / annuler l'exception « non applicable ».
const markNotApplicable = vi.fn()
const revokeNotApplicable = vi.fn()
// #2972 — les escalades dues. Défaut « aucune », même raison que
// `dueTimesheetReminders` juste au-dessus.
type DueEscalationItem = {
  line: { missionId: string; consultantId: string | null; timesheetId: string | null }
  ownerId: string | null
  ownerName: string | null
  clientManagerId: string | null
  clientManagerName: string | null
  delayDays?: number | null
  advContactId?: string | null
  advName?: string | null
  partnerName?: string | null
  level?: number
}
const dueTimesheetEscalations = vi.fn((_month?: string) => ({
  data: [] as DueEscalationItem[],
  isLoading: false,
  isError: false,
}))

vi.mock('../api', () => ({
  useTimesheetMonth: (month: string | undefined, blockingOnly: boolean) => timesheetMonth(month, blockingOnly),
  useOpenTimesheets: () => ({ mutate: vi.fn(), isPending: false }),
  useExplainGap: () => ({ mutate: vi.fn(), isPending: false }),
  useValidateByClient: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectTimesheet: () => ({ mutate: rejectTimesheet, isPending: false }),
  // Le tiroir de validation (`TimesheetReviewDrawer`) monte SON hook dès que
  // `TimesheetsPage` le rend — même quand aucune ligne n'est ouverte. Sans cet
  // export, le mock du module fait échouer les DIX-HUIT tests de ce fichier,
  // sur une erreur de câblage qui ne parle d'aucun d'eux.
  useTimesheetReview: () => ({ data: undefined, isLoading: false, isError: false }),
  useDueTimesheetReminders: (month: string | undefined) => dueTimesheetReminders(month),
  useDueTimesheetEscalations: (month: string | undefined) => dueTimesheetEscalations(month),
  useRecordTimesheetReminder: () => ({ mutate: recordTimesheetReminder, isPending: false }),
  useMarkTimesheetNotApplicable: () => ({ mutate: markNotApplicable, isPending: false }),
  useRevokeTimesheetNotApplicable: () => ({ mutate: revokeNotApplicable, isPending: false }),
}))
// Le contrat de route n'a rien à voir avec l'état vide : il est neutralisé pour
// que le test parle du SEUL sujet qu'il garde.
// #2222 — `'ok'` n'est PAS un etat du contrat : les cinq sont `ready`,
// `plan_locked`, `permission`, `no_integration`, `degraded`. Le mock passait
// parce que l'ecran ne compare que « different de ready » — un mock qui rend un
// etat inexistant est un test qui ne protege rien.
vi.mock('@/components/access/useRouteAccess', () => ({ useRouteAccess: () => ({ state: 'ready', missing: [] }) }))
vi.mock('@/components/access/CapabilityBanner', () => ({ CapabilityBanner: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// `Link` rend son `to` en `href` : c'est la DESTINATION qu'on veut asserter,
// pas seulement la présence d'un bouton.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

// Théo C missions-cra.N6 — la sortie de données passe par la règle d'espace.
const downloadCSV = vi.fn()
vi.mock('@/lib/export-csv', () => ({
  downloadCSV: (...args: unknown[]) => downloadCSV(...args),
  downloadJSON: vi.fn(),
}))
const dataExit = vi.fn((): { allowed: boolean; grant: { kind: string } | null } => ({
  allowed: true,
  grant: { kind: 'grant' },
}))
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => dataExit(), workspaceRuleRefusalText: () => null }))

const { TimesheetsPage } = await import('./TimesheetsPage')

/**
 * Théo missions-cra.R3/R6 — la liste est un TABLEAU PLAT : les gestes d'un relevé (rejeter, expliquer l'écart,
 * non applicable, relance…) vivent dans la fenêtre « Relevé » que « Ouvrir » ouvre. Les blocs de tests qui
 * mesurent ces gestes ouvrent la première ligne ; les autres lisent le tableau tel quel.
 */
let autoOpen = false
function render(ui: React.ReactElement) {
  const view = renderUi(ui)
  if (autoOpen) {
    const first = screen.queryAllByRole('button', { name: /^Ouvrir le relevé de/ })[0]
    if (first) fireEvent.click(first)
  }
  return view
}
afterEach(() => {
  autoOpen = false
})
const opensTheLine = () =>
  beforeEach(() => {
    autoOpen = true
  })

async function chooseState(label: string) {
  const user = userEvent.setup()
  // « Ce qui bloque » est un segment à côté du menu État (il croise deux états, le serveur le porte).
  if (label === 'Ce qui bloque') {
    await user.click(screen.getByRole('button', { name: /^Ce qui bloque/ }))
    return
  }
  await user.click(screen.getByRole('button', { name: /^État/ }))
  await user.click(await screen.findByRole('menuitemcheckbox', { name: label }))
  await user.keyboard('{Escape}')
}

/** Le résumé porte sur TOUT le mois, filtre ou pas — c'est ce qui permet de
 *  distinguer « le mois est vide » de « le filtre l'a vidé ». */
function summary(over: { total?: number; blocking?: number; late?: number; escalated?: number } = {}) {
  return {
    total: over.total ?? 0,
    awaiting: 0,
    // #2196.6 / #2196.24 — sortis de `awaiting` le 17/09/2026.
    late: over.late ?? 0,
    submitted: 0,
    validated: 0,
    disputed: 0,
    rejected: 0,
    escalated: over.escalated ?? 0,
    notRequired: 0,
    blocking: over.blocking ?? 0,
    declaredDays: null,
  }
}

function page(over: { items?: unknown[]; total?: number } = {}) {
  return {
    data: { month: '2026-07', items: over.items ?? [], summary: summary({ total: over.total ?? 0 }) },
    isLoading: false,
    isError: false,
  }
}

/**
 * « Aucune mission sur ce mois » était un cul-de-sac : le relevé d'activité
 * n'existe QUE parce qu'une mission le porte, et l'écran ne disait nulle part
 * où la trouver.
 *
 * Deux causes se cachaient sous la même phrase, et c'est la moitié la plus
 * grave : quand le filtre « Ce qui bloque » est armé, un mois plein de relevés
 * SAINS s'affichait « Aucune mission sur ce mois ». Une bonne nouvelle rendue
 * comme une panne — et une porte vers les Missions y aurait envoyé réparer
 * quelque chose qui n'est pas cassé.
 */
describe('TimesheetsPage — l’état vide dit d’où vient un relevé, et y mène', () => {
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
  })

  it('offre un chemin TABULABLE vers les missions — un relevé naît d’une mission', () => {
    timesheetMonth.mockReturnValue(page())
    render(<TimesheetsPage />)
    // `getByRole('link')` échoue sur un `<div onClick>` : c'est ce qui garde GA-35.
    expect(screen.getByRole('link', { name: /missions/i })).toHaveAttribute('href', '/missions')
  })

  it('ne propose AUCUNE porte sur un échec de lecture', () => {
    // « Réessaie » n'est pas une destination, et une mauvaise porte est pire
    // que pas de porte.
    timesheetMonth.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<TimesheetsPage />)
    expect(screen.queryByRole('link', { name: /missions/i })).not.toBeInTheDocument()
  })

  it('ne dit PAS « aucune mission » quand c’est le FILTRE qui a tout retiré', async () => {
    timesheetMonth.mockReturnValue(page({ total: 4 }))
    render(<TimesheetsPage />)
    await chooseState('Ce qui bloque')
    expect(screen.queryByText(/Aucune mission sur ce mois/)).not.toBeInTheDocument()
    expect(screen.getByText('Aucun relevé ne bloque ce mois')).toBeInTheDocument()
    expect(screen.getByText(/masque les 4 lignes du mois/)).toBeInTheDocument()
  })

  it('n’envoie réparer NULLE PART quand rien ne bloque — c’est une bonne nouvelle', async () => {
    timesheetMonth.mockReturnValue(page({ total: 4 }))
    render(<TimesheetsPage />)
    await chooseState('Ce qui bloque')
    expect(screen.queryByRole('link', { name: /missions/i })).not.toBeInTheDocument()
  })

  it('le filtre se DÉFAIT depuis son propre état vide', async () => {
    timesheetMonth.mockReturnValue(page({ total: 4 }))
    render(<TimesheetsPage />)
    await chooseState('Ce qui bloque')
    expect(timesheetMonth).toHaveBeenLastCalledWith(undefined, true)
    await userEvent.click(screen.getByRole('button', { name: 'Voir tous les relevés' }))
    // Le geste n'est pas décoratif : c'est la REQUÊTE qui repart sans filtre.
    expect(timesheetMonth).toHaveBeenLastCalledWith(undefined, false)
  })

  it('garde la porte vers les missions quand le mois n’a AUCUNE ligne, filtre armé ou non', async () => {
    timesheetMonth.mockReturnValue(page({ total: 0 }))
    render(<TimesheetsPage />)
    await chooseState('Ce qui bloque')
    // Le filtre n'a rien masqué : il n'y avait rien. La vraie question reste
    // « où sont mes missions ? ».
    expect(screen.getByRole('link', { name: /missions/i })).toHaveAttribute('href', '/missions')
  })
})

/**
 * #1826 — « supprime ce titre ». Ce que Louis pointait était un SOUS-TITRE
 * ORPHELIN : la phrase de doctrine (« Attendu » n'est pas « manquant », etc.)
 * était posée tout en haut du corps, sans aucun titre au-dessus d'elle — la
 * barre d'onglets de section nomme déjà l'écran (« · Relevés d'activité »),
 * donc `PageHeader` masque son propre titre ici (`nameLivesInTabs`).
 *
 * La phrase n'est répétée nulle part ailleurs sur cet écran (contrairement à
 * #1807 sur `/pilotage/finance`) : elle porte de la doctrine que rien d'autre
 * ne dit. Elle rejoint donc un titre plutôt que d'être supprimée — la première
 * phrase de `cra.subtitle` (« Une ligne par mission et par consultant »)
 * devient ce titre, et la seconde (le rappel de doctrine) reste sa légende.
 */
describe('TimesheetsPage — le sous-titre rejoint son titre (#1826)', () => {
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
    timesheetMonth.mockReturnValue(page())
  })

  it('affiche un TITRE visible juste au-dessus du rappel de doctrine — la phrase n’est plus orpheline', () => {
    render(<TimesheetsPage />)
    // Le titre existe, et il précède la légende dans le DOM : un titre en bas
    // de l'écran ne « couvrirait » pas la phrase, il faudrait que le titre
    // apparaisse AVANT elle pour qu'elle cesse d'être orpheline.
    const heading = screen.getByText('Clôturer l’activité, sans courir après les pièces')
    const caveat = screen.getByText(/« Attendu » n’est pas « manquant »/)
    expect(heading.compareDocumentPosition(caveat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ne perd rien du rappel de doctrine — « Attendu » n’est pas « manquant », « aucun relevé » n’est pas « zéro jour »', () => {
    render(<TimesheetsPage />)
    expect(
      screen.getByText('« Attendu » n’est pas « manquant », et « aucun relevé » n’est pas « zéro jour ».'),
    ).toBeInTheDocument()
  })
})

/** Théo C missions-cra — R1 (titre), R2 (quatre tuiles), N1 (chaîne), A3 (menu État), N6 (export). */
describe('TimesheetsPage — la page appliquée de Théo (missions-cra)', () => {
  const receivedLine = (over: Record<string, unknown> = {}) => timesheetLine({ status: 'submitted', ...over })
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
  })

  it('R2 — quatre tuiles d’état comptées sur le mois', () => {
    timesheetMonth.mockReturnValue({
      data: {
        month: '2026-09',
        items: [
          receivedLine(),
          receivedLine({ internalReviewedAt: '2026-10-01T00:00:00Z' }),
          receivedLine({ status: 'validated', days: 18 }),
          receivedLine({ status: 'missing', days: null }),
        ],
        summary: summary({ total: 4 }),
      },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    const tile = (label: string) => screen.getAllByText(label)[0].parentElement as HTMLElement
    expect(tile('À recevoir')).toHaveTextContent('1')
    expect(tile('À contrôler')).toHaveTextContent('1')
    expect(tile('Attente client')).toHaveTextContent('1')
    expect(tile('Validés client')).toHaveTextContent('1')
    expect(tile('Validés client')).toHaveTextContent('18 jours déclarés')
  })

  it('R2 — filtré par « Ce qui bloque », les tuiles disent « — » et non 0', async () => {
    timesheetMonth.mockReturnValue(page({ total: 4 }))
    render(<TimesheetsPage />)
    await chooseState('Ce qui bloque')
    const tile = screen.getAllByText('À recevoir')[0].parentElement as HTMLElement
    expect(tile).toHaveTextContent('—')
  })

  it('N1 — le bandeau de chaîne en quatre étapes est en tête', () => {
    timesheetMonth.mockReturnValue(page())
    render(<TimesheetsPage />)
    expect(screen.getByRole('navigation', { name: /activité au règlement/i })).toBeInTheDocument()
  })

  it('A3 — « Ce qui bloque » est un segment à côté du menu État, et se défait d’un clic sur « Tous »', async () => {
    timesheetMonth.mockReturnValue(page())
    render(<TimesheetsPage />)
    const group = screen.getByRole('group', { name: 'Ce qui bloque' })
    const blocking = within(group).getByRole('button', { name: /^Ce qui bloque/ })
    expect(blocking).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(blocking)
    expect(blocking).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(group).getByRole('button', { name: 'Tous les relevés' }))
    expect(blocking).toHaveAttribute('aria-pressed', 'false')
  })

  it('filtre par état : un état vide ne dit pas « aucune mission » et se défait', async () => {
    timesheetMonth.mockReturnValue(page({ total: 4 }))
    render(<TimesheetsPage />)
    await chooseState('Rejetés')
    expect(screen.queryByText(/Aucune mission sur ce mois/)).not.toBeInTheDocument()
    expect(screen.getByText('Aucun relevé dans cet état')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voir tous les relevés' }))
    // Plus aucun état n'est choisi : le menu ne compte plus rien.
    expect(screen.getByRole('button', { name: /^État$/ })).toBeInTheDocument()
  })

  it('A1 — l’exception « non applicable » se compte dans le résumé', () => {
    timesheetMonth.mockReturnValue({
      data: {
        month: '2026-09',
        items: [
          receivedLine({
            status: 'missing',
            notApplicable: {
              id: 'x-1',
              reason: 'Congé sans solde',
              markedAt: '2026-08-03T09:00:00.000Z',
              markedByName: 'Louise Martin',
            },
          }),
        ],
        summary: summary({ total: 1 }),
      },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.getByText('dont 1 non applicable')).toBeInTheDocument()
  })

  it('N6 — « Exporter la sélection » est désactivé sans ligne et actif avec', () => {
    timesheetMonth.mockReturnValue(page())
    const { unmount } = render(<TimesheetsPage />)
    expect(screen.getByRole('button', { name: 'Exporter la sélection' })).toBeDisabled()
    unmount()
    timesheetMonth.mockReturnValue(page({ items: [receivedLine()], total: 1 }))
    render(<TimesheetsPage />)
    expect(screen.getByRole('button', { name: 'Exporter la sélection' })).toBeEnabled()
  })

  it('N6 — l’export passe par downloadCSV et la règle d’espace ; sans autorisation, pas de bouton', async () => {
    timesheetMonth.mockReturnValue(page({ items: [receivedLine()], total: 1 }))
    const { unmount } = render(<TimesheetsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Exporter la sélection' }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    expect(String(downloadCSV.mock.calls[0][0]).split('\n')[0]).toBe(
      'Consultant;Mission;Compte;Période;État;Jours déclarés',
    )
    unmount()
    dataExit.mockReturnValueOnce({ allowed: false, grant: null })
    render(<TimesheetsPage />)
    expect(screen.queryByRole('button', { name: 'Exporter la sélection' })).not.toBeInTheDocument()
  })
})

/** Une ligne de relevé DÉPOSÉ — celle sur laquelle le rejet a un sens. */
function timesheetLine(over: Record<string, unknown> = {}) {
  return {
    timesheetId: 'ts-1',
    missionId: 'm-1',
    missionLabel: 'Run plateforme',
    accountName: 'ACME',
    consultantId: 'c-1',
    consultantName: 'A. Dupont',
    periodMonth: '2026-07-01',
    status: 'submitted',
    days: 21,
    expectedDays: 21,
    gap: 0,
    gapKind: 'none',
    gapExplanation: null,
    blocksInvoicing: false,
    validatedByClientAt: null,
    approverName: null,
    anomalies: [],
    remindersSent: 0,
    lastReminderAt: null,
    rejectedAt: null,
    rejectionReason: null,
    contestedDays: null,
    correctionDeadline: null,
    submittedByName: null,
    internalReviewedAt: null,
    internalReviewedByName: null,
    notApplicable: null,
    ...over,
  }
}

/**
 * Le rejet motivé, vu de l'écran.
 *
 * L'écran ne PORTE pas la règle — le serveur l'exige, et `timesheets.service`
 * le prouve. Ce qui est gardé ici est plus modeste et tout aussi nécessaire :
 * que le geste existe, qu'il ne parte pas sans motif (un aller-retour en 400
 * fait recliquer), et que le motif se LISE une fois posé — sans quoi le rejet
 * serait un statut muet, ce qui est exactement le trou qu'on vient de combler.
 */
describe('TimesheetsPage — rejeter un relevé exige un motif', () => {
  opensTheLine()
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
    rejectTimesheet.mockReset()
  })

  const renderWith = (over: Record<string, unknown> = {}) => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine(over)], summary: summary({ total: 1 }) },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
  }

  it('propose de rejeter un relevé déposé', () => {
    renderWith()
    expect(screen.getByRole('button', { name: 'Rejeter le relevé' })).toBeInTheDocument()
  })

  // #2196.22 — DÉCISION : le DÉPÔT du relevé EST la validation consultant.
  // Le statut `submitted` s'affiche « Validé consultant », partout où il se
  // montre — ici, le badge de la liste (`TimesheetsPage.tsx`).
  it('#2196.22 — un relevé déposé (submitted) s’affiche « Validé consultant »', () => {
    renderWith({ status: 'submitted' })
    // le badge de la liste ET celui de la fenêtre « Relevé » (ouverte sur cette ligne)
    expect(screen.getAllByText('Validé consultant').length).toBeGreaterThan(0)
    expect(screen.queryByText('Soumis')).not.toBeInTheDocument()
  })

  it('ne propose RIEN à rejeter quand rien n’a été déposé', () => {
    // Le geste vise une LIGNE de relevé, pas une mission.
    renderWith({ timesheetId: null, status: 'missing', days: null })
    expect(screen.queryByRole('button', { name: 'Rejeter le relevé' })).not.toBeInTheDocument()
  })

  it('ne propose pas de rejeter ce que le CLIENT a déjà validé', () => {
    // Le serveur refuse ce cas ; l'écran ne propose donc pas un geste qui
    // reviendrait en erreur. Le bon chemin est le litige.
    renderWith({ status: 'validated', validatedByClientAt: '2026-08-01T10:00:00.000Z' })
    expect(screen.queryByRole('button', { name: 'Rejeter le relevé' })).not.toBeInTheDocument()
  })

  it('n’envoie RIEN tant que le motif est vide', async () => {
    renderWith()
    await userEvent.click(screen.getByRole('button', { name: 'Rejeter le relevé' }))
    // Le bouton existe et reste inerte : un rejet sans motif partirait pour
    // revenir en 400.
    expect(screen.getByRole('button', { name: 'Rejeter' })).toBeDisabled()
    expect(rejectTimesheet).not.toHaveBeenCalled()
  })

  it('reste inerte sur un motif fait d’espaces', async () => {
    renderWith()
    await userEvent.click(screen.getByRole('button', { name: 'Rejeter le relevé' }))
    await userEvent.type(screen.getByLabelText('Motif du rejet'), '   ')
    expect(screen.getByRole('button', { name: 'Rejeter' })).toBeDisabled()
    expect(rejectTimesheet).not.toHaveBeenCalled()
  })

  it('envoie le motif DÉTOURÉ, la quantité contestée et la deadline, sur le bon relevé', async () => {
    renderWith()
    await userEvent.click(screen.getByRole('button', { name: 'Rejeter le relevé' }))
    await userEvent.type(screen.getByLabelText('Motif du rejet'), '  Jours imputés au mauvais mois  ')
    await userEvent.type(screen.getByLabelText('Jours contestés (obligatoire)'), '3')
    await userEvent.type(screen.getByLabelText('Deadline de correction (obligatoire)'), '2026-08-20')
    await userEvent.click(screen.getByRole('button', { name: 'Rejeter' }))
    expect(rejectTimesheet).toHaveBeenCalledWith({
      id: 'ts-1',
      reason: 'Jours imputés au mauvais mois',
      contestedDays: 3,
      correctionDeadline: '2026-08-20',
    })
  })

  // #2415.7 — sans quantité contestée ni deadline, le bouton reste inerte,
  // même avec un motif renseigné — les trois sont requis ensemble.
  it('#2415.7 — reste inerte tant que la quantité contestée ou la deadline manquent', async () => {
    renderWith()
    await userEvent.click(screen.getByRole('button', { name: 'Rejeter le relevé' }))
    await userEvent.type(screen.getByLabelText('Motif du rejet'), 'Jours imputés au mauvais mois')
    expect(screen.getByRole('button', { name: 'Rejeter' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Jours contestés (obligatoire)'), '3')
    expect(screen.getByRole('button', { name: 'Rejeter' })).toBeDisabled()
    expect(rejectTimesheet).not.toHaveBeenCalled()
  })

  it('se referme sans rien envoyer sur « Ne rien changer »', async () => {
    renderWith()
    await userEvent.click(screen.getByRole('button', { name: 'Rejeter le relevé' }))
    await userEvent.type(screen.getByLabelText('Motif du rejet'), 'Un motif tapé puis abandonné')
    await userEvent.click(screen.getByRole('button', { name: 'Ne rien changer' }))
    expect(rejectTimesheet).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Motif du rejet')).not.toBeInTheDocument()
  })

  it('AFFICHE le motif d’un relevé rejeté — un statut muet ne sert à rien', () => {
    renderWith({
      status: 'rejected',
      blocksInvoicing: true,
      rejectedAt: '2026-08-10T09:00:00.000Z',
      rejectionReason: 'Trois jours de juin imputés à juillet',
    })
    expect(screen.getByText('Rejeté le 2026-08-10')).toBeInTheDocument()
    expect(screen.getByText('Trois jours de juin imputés à juillet')).toBeInTheDocument()
  })

  // #2415.7 — la quantité contestée et la deadline s'affichent à côté du
  // motif — sans elles, le consultant sait POURQUOI mais pas COMBIEN ni QUAND.
  it('#2415.7 — AFFICHE la quantité contestée et la deadline de correction', () => {
    renderWith({
      status: 'rejected',
      blocksInvoicing: true,
      rejectedAt: '2026-08-10T09:00:00.000Z',
      rejectionReason: 'Trois jours de juin imputés à juillet',
      contestedDays: 3,
      correctionDeadline: '2026-08-20',
    })
    expect(screen.getByText('3 jours contestés')).toBeInTheDocument()
    expect(screen.getByText('Correction attendue avant le 2026-08-20')).toBeInTheDocument()
  })

  // #2415.5 — QUI a déclaré, distinct du consultant dont c'est le mois.
  it('#2415.5 — AFFICHE QUI a déclaré, distinct du consultant dont c’est le mois', () => {
    renderWith({ submittedByName: 'M. Ops' })
    expect(screen.getByText('Déclaré par M. Ops')).toBeInTheDocument()
  })

  it('#2415.5 — n’affiche rien sur une ligne historique, d’avant cette trace', () => {
    renderWith({ submittedByName: null })
    expect(screen.queryByText(/^Déclaré par/)).not.toBeInTheDocument()
  })

  // #2415.6 — la revue INTERNE, distincte de la validation client (#2415.5
  // pour le motif du même patron : QUI, jamais deviné).
  it('#2415.6 — AFFICHE QUI a revu en interne, distinct du client', () => {
    renderWith({ internalReviewedByName: 'M. Ops' })
    expect(screen.getByText('Vérifié en interne par M. Ops')).toBeInTheDocument()
  })

  it('#2415.6 — n’affiche rien tant qu’aucune revue interne n’a été posée', () => {
    renderWith({ internalReviewedByName: null })
    expect(screen.queryByText(/^Vérifié en interne par/)).not.toBeInTheDocument()
  })

  it('garde la trace du rejet APRÈS un redépôt — on archive, on ne supprime pas', () => {
    // Le statut est repassé à « soumis » ; le motif reste lisible, et le dit.
    renderWith({
      status: 'submitted',
      rejectedAt: '2026-08-10T09:00:00.000Z',
      rejectionReason: 'Trois jours de juin imputés à juillet',
    })
    expect(screen.getByText('Rejeté le 2026-08-10, puis redéposé')).toBeInTheDocument()
    expect(screen.getByText('Trois jours de juin imputés à juillet')).toBeInTheDocument()
  })

  it('AFFICHE le compte des rejets du mois — un compte calculé et jamais montré ne sert à rien', () => {
    timesheetMonth.mockReturnValue({
      data: {
        month: '2026-07',
        items: [timesheetLine()],
        summary: { ...summary({ total: 3 }), rejected: 2 },
      },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.getByText('2 relevés rejetés')).toBeInTheDocument()
  })

  it('n’écrit PAS « 0 relevé rejeté » quand il n’y en a aucun', () => {
    // Un compteur à zéro permanent apprend à ne plus lire la ligne.
    renderWith()
    expect(screen.queryByText(/relevés? rejetés?$/)).not.toBeInTheDocument()
  })

  it('un relevé rejeté peut être rejeté de nouveau — ce n’est pas une impasse', () => {
    // Il reste déposé, donc corrigeable, donc rejetable si la correction ne va
    // toujours pas. Un rejet dont on ne peut pas sortir serait un cul-de-sac.
    renderWith({ status: 'rejected', rejectedAt: '2026-08-10T09:00:00.000Z', rejectionReason: 'Motif' })
    expect(screen.getAllByText('Rejeté').length).toBeGreaterThan(0)
  })
})

/**
 * #2196.3, #2196.6, #2196.11 — trois champs que l'API rendait déjà et que
 * l'écran ne montrait pas : « Reçus » et « En retard » vivaient fondus dans la
 * phrase de résumé (ou nulle part pour le second), et `accountName` n'était
 * lu par AUCUNE ligne — même défaut que la colonne « Owner » des missions,
 * du code juste, calculé, que personne n'affiche.
 */
describe('TimesheetsPage — trois champs déjà calculés, jamais montrés', () => {
  opensTheLine()
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
  })

  it('AFFICHE le compte des relevés REÇUS, à part de la phrase de résumé', () => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine()], summary: { ...summary({ total: 3 }), submitted: 4 } },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.getByText('4 relevés reçus')).toBeInTheDocument()
  })

  it('n’écrit PAS « 0 relevé reçu » quand il n’y en a aucun', () => {
    timesheetMonth.mockReturnValue(page())
    render(<TimesheetsPage />)
    expect(screen.queryByText(/relevés? reçus?$/)).not.toBeInTheDocument()
  })

  it('AFFICHE le compte des relevés EN RETARD, distinct de « en attente »', () => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine()], summary: { ...summary({ total: 3 }), late: 5 } },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.getByText('5 relevés en retard')).toBeInTheDocument()
  })

  it('n’écrit PAS « 0 relevé en retard » quand il n’y en a aucun', () => {
    timesheetMonth.mockReturnValue(page())
    render(<TimesheetsPage />)
    expect(screen.queryByText(/relevés? en retard$/)).not.toBeInTheDocument()
  })

  it('AFFICHE le compte des relevés ESCALADÉS', () => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine()], summary: { ...summary({ total: 3 }), escalated: 1 } },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.getByText('1 relevé escaladé')).toBeInTheDocument()
  })

  it('n’écrit PAS « 0 relevé escaladé » quand il n’y en a aucun', () => {
    timesheetMonth.mockReturnValue(page())
    render(<TimesheetsPage />)
    expect(screen.queryByText(/relevés? escaladés?$/)).not.toBeInTheDocument()
  })

  it('NOMME le compte porteur de chaque ligne — #2196.11', () => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine({ accountName: 'ACME' })], summary: summary({ total: 1 }) },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.getByText('ACME')).toBeInTheDocument()
  })

  // #2196.16 — celui qui a ENREGISTRÉ la validation client, jamais le
  // contact client lui-même (voir `timesheets.service.ts`).
  it('NOMME qui a enregistré la validation — #2196.16', () => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine({ approverName: 'A. Martin' })], summary: summary({ total: 1 }) },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.getByText('Enregistré par A. Martin')).toBeInTheDocument()
  })

  it('ne nomme PERSONNE tant que rien n’a été validé — absent n’est pas une chaîne vide', () => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine({ approverName: null })], summary: summary({ total: 1 }) },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.queryByText(/Enregistré par/)).not.toBeInTheDocument()
  })

  // #2196.17 — `remindersSent`/`lastReminderAt` étaient déjà lus par le
  // TIROIR de validation (`TimesheetReviewDrawer`) et jamais par la LIGNE de
  // la liste, alors que c'est elle qu'on regarde pour savoir « ai-je déjà
  // relancé celui-là ? » avant d'en préparer une autre.
  it('dit COMBIEN de relances sont parties, et QUAND la dernière — #2196.17', () => {
    timesheetMonth.mockReturnValue({
      data: {
        month: '2026-07',
        items: [timesheetLine({ remindersSent: 2, lastReminderAt: '2026-08-05T00:00:00.000Z' })],
        summary: summary({ total: 1 }),
      },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.getByText('2 relances envoyées, la dernière le 2026-08-05.')).toBeInTheDocument()
  })

  it('ne dit RIEN sur les relances quand aucune n’est encore partie', () => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine({ remindersSent: 0 })], summary: summary({ total: 1 }) },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
    expect(screen.queryByText(/relance/)).not.toBeInTheDocument()
  })
})

/**
 * #2196.18 — « prochaine action », par ligne.
 *
 * Un statut DIT où en est un relevé (« Soumis », « Rejeté »…) ; il ne dit pas
 * ce qu'il reste à FAIRE. La donnée existe déjà en entier dans `status` — rien
 * à ajouter côté serveur, une DÉRIVATION pure côté écran.
 */
describe('TimesheetsPage — prochaine action (#2196.18)', () => {
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
  })

  const renderLine = (status: string) => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine({ status })], summary: summary({ total: 1 }) },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
  }

  it('dit qu’il faut relancer pour dépôt sur un relevé encore attendu', () => {
    renderLine('expected')
    expect(screen.getByText('Relancer pour dépôt')).toBeInTheDocument()
  })

  it('dit qu’il faut valider avec le client sur un relevé déposé', () => {
    renderLine('submitted')
    expect(screen.getByText('Valider avec le client')).toBeInTheDocument()
  })

  it('dit qu’il faut attendre le redépôt sur un relevé rejeté', () => {
    renderLine('rejected')
    expect(screen.getByText('Attendre le redépôt')).toBeInTheDocument()
  })

  it('dit qu’il faut clore le litige sur un relevé disputé', () => {
    renderLine('disputed')
    expect(screen.getByText('Clore le litige')).toBeInTheDocument()
  })

  it('dit que ça demande un humain sur un relevé escaladé', () => {
    renderLine('escalated')
    expect(screen.getByText('Passer par un humain')).toBeInTheDocument()
  })

  // Non mesuré n'est jamais « rien à faire » inventé : un relevé déjà validé
  // ou non requis n'affiche AUCUNE prochaine action plutôt qu'un texte creux.
  it('n’affiche RIEN sur un relevé déjà validé', () => {
    renderLine('validated')
    expect(screen.queryByText('Relancer pour dépôt')).not.toBeInTheDocument()
    expect(screen.queryByText('Valider avec le client')).not.toBeInTheDocument()
    expect(screen.queryByText('Attendre le redépôt')).not.toBeInTheDocument()
    expect(screen.queryByText('Clore le litige')).not.toBeInTheDocument()
    expect(screen.queryByText('Passer par un humain')).not.toBeInTheDocument()
  })

  it('n’affiche RIEN sur un relevé non requis', () => {
    renderLine('not_required')
    expect(screen.queryByText('Relancer pour dépôt')).not.toBeInTheDocument()
  })
})

/**
 * #2196.33/#2196.34 — rappel AVANT l'échéance, distinct du retard.
 *
 * Purement informationnel (aucun bouton, aucune mutation) : l'API calcule
 * `preDeadlineReminder`, la ligne se contente de le nommer.
 */
describe('TimesheetsPage — rappel avant échéance (#2196.33/#2196.34)', () => {
  opensTheLine()
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
  })

  const renderLine = (preDeadlineReminder: unknown) => {
    timesheetMonth.mockReturnValue({
      data: {
        month: '2026-08',
        items: [timesheetLine({ status: 'expected', preDeadlineReminder })],
        summary: summary({ total: 1 }),
      },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
  }

  it('nomme le nombre de jours restants avant l’échéance', () => {
    renderLine({ kind: 'before', daysRemaining: 3 })
    expect(screen.getByText('Le mois se termine dans 3 jours')).toBeInTheDocument()
  })

  it('distingue le jour même de l’échéance', () => {
    renderLine({ kind: 'dueToday' })
    expect(screen.getByText('Le mois se termine aujourd’hui')).toBeInTheDocument()
  })

  it('n’affiche rien quand aucune échéance n’approche', () => {
    renderLine(null)
    expect(screen.queryByText(/Le mois se termine/)).not.toBeInTheDocument()
  })
})

/**
 * #2196.30 — « Préparer une relance », côté CRA.
 *
 * Le calcul existait déjà, testé, DEPUIS LE DÉBUT : `GET
 * /delivery/timesheets/reminders` (`dueReminders`) dit lesquelles sont dues et
 * sur quel ton — et n'avait AUCUN appelant web, exactement le défaut déjà
 * réparé côté encaissements par `PaymentReminderDue` (item #87). Le produit ne
 * PRÉPARE le geste que sur une ligne qui a déjà une existence en base
 * (`timesheetId` non nul) : sans elle, `recordReminder` n'a rien à écrire —
 * le bouton « Ouvrir les relevés attendus » de la barre existe pour créer
 * cette ligne au préalable.
 */
describe('TimesheetsPage — préparer une relance (#2196.30)', () => {
  opensTheLine()
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
    dueTimesheetReminders.mockReset()
    recordTimesheetReminder.mockReset()
  })

  function renderPage(items: DueReminderItem[]) {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine()], summary: summary({ total: 1 }) },
      isLoading: false,
      isError: false,
    })
    dueTimesheetReminders.mockReturnValue({
      data: { channel: { kind: 'none' }, items },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
  }

  const dueOn = (over: Partial<DueReminderItem> = {}): DueReminderItem => ({
    line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: 'ts-1' },
    index: 1,
    overdueDays: 6,
    tone: 'neutral',
    ...over,
  })

  it('propose de préparer une relance quand elle est DUE sur cette ligne', () => {
    renderPage([dueOn()])
    expect(screen.getByRole('button', { name: 'Préparer une relance' })).toBeInTheDocument()
  })

  it('ne propose RIEN quand aucune relance n’est due sur cette ligne', () => {
    renderPage([])
    expect(screen.queryByRole('button', { name: 'Préparer une relance' })).not.toBeInTheDocument()
  })

  it('dit que rien ne part tout seul — le produit prépare, il n’envoie pas', () => {
    renderPage([dueOn()])
    expect(screen.getByText(/Rien ne part tout seul/)).toBeInTheDocument()
  })

  it('enregistre la relance sur le BON relevé au clic', async () => {
    renderPage([dueOn()])
    await userEvent.click(screen.getByRole('button', { name: 'Préparer une relance' }))
    expect(recordTimesheetReminder).toHaveBeenCalledWith('ts-1')
  })

  it('ne propose PAS le bouton quand le relevé n’a encore AUCUNE ligne en base — le mois doit d’abord être ouvert', () => {
    renderPage([dueOn({ line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: null } })])
    expect(screen.queryByRole('button', { name: 'Préparer une relance' })).not.toBeInTheDocument()
  })

  it('ne propose rien sur une AUTRE ligne — le rapprochement se fait par mission ET consultant', () => {
    renderPage([dueOn({ line: { missionId: 'autre-mission', consultantId: 'c-1', timesheetId: 'ts-2' } })])
    expect(screen.queryByRole('button', { name: 'Préparer une relance' })).not.toBeInTheDocument()
  })
})

/**
 * #2972 — vers QUI le sujet remonte quand un relevé est ESCALADÉ.
 *
 * `dueEscalations` (`timesheets.service.ts`) résout le PORTEUR de la mission
 * (`missions.owner_id`) — donnée déjà là, jamais affichée. L'écran ne fait que
 * NOMMER ce destinataire ; il n'envoie rien lui-même.
 */
describe('TimesheetsPage — vers qui l’escalade remonte (#2972)', () => {
  opensTheLine()
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
    dueTimesheetEscalations.mockReset()
  })

  function renderPage(over: Record<string, unknown>, escalations: DueEscalationItem[]) {
    timesheetMonth.mockReturnValue({
      data: {
        month: '2026-07',
        items: [timesheetLine({ status: 'escalated', ...over })],
        summary: summary({ total: 1 }),
      },
      isLoading: false,
      isError: false,
    })
    dueTimesheetEscalations.mockReturnValue({ data: escalations, isLoading: false, isError: false })
    render(<TimesheetsPage />)
  }

  it('nomme le porteur de la mission sur un relevé escaladé', () => {
    renderPage({}, [
      {
        line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: 'ts-1' },
        ownerId: 'u-1',
        ownerName: 'A. Martin',
        clientManagerId: null,
        clientManagerName: null,
      },
    ])
    expect(screen.getByText('À signaler à A. Martin')).toBeInTheDocument()
  })

  it('ne nomme personne quand la mission n’a pas de porteur déclaré', () => {
    renderPage({}, [
      {
        line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: 'ts-1' },
        ownerId: null,
        ownerName: null,
        clientManagerId: null,
        clientManagerName: null,
      },
    ])
    expect(screen.queryByText(/À signaler à/)).not.toBeInTheDocument()
  })

  it('ne nomme rien sur un relevé qui n’est PAS escaladé', () => {
    renderPage({ status: 'missing', timesheetId: null, days: null }, [])
    expect(screen.queryByText(/À signaler à/)).not.toBeInTheDocument()
  })

  /* #2972 (lot V20b) — le manager client est un SECOND candidat, nommé à côté
   * du porteur, jamais à sa place : aucun des deux n'est choisi pour l'autre. */
  it('nomme aussi le manager client, sans remplacer le porteur', () => {
    renderPage({}, [
      {
        line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: 'ts-1' },
        ownerId: 'u-1',
        ownerName: 'A. Martin',
        clientManagerId: 'contact-1',
        clientManagerName: 'B. Client',
      },
    ])
    expect(screen.getByText('À signaler à A. Martin')).toBeInTheDocument()
    expect(screen.getByText('Manager client : B. Client')).toBeInTheDocument()
  })

  /* #2972 (lot V20b) — le délai : jours écoulés depuis la fin de la période,
   * silencieux tant qu'il n'y a rien à dire (GA-18/GA-19). */
  it('affiche le délai écoulé depuis la fin de la période', () => {
    renderPage({}, [
      {
        line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: 'ts-1' },
        ownerId: 'u-1',
        ownerName: 'A. Martin',
        clientManagerId: null,
        clientManagerName: null,
        delayDays: 14,
      },
    ])
    expect(screen.getByText('Escaladé depuis 14 jours')).toBeInTheDocument()
  })

  /* #2972 — ADV (contact de facturation), partenaire (sous-traitance), niveau. */
  it('nomme l’ADV, le partenaire et le niveau, à côté du porteur', () => {
    renderPage({}, [
      {
        line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: 'ts-1' },
        ownerId: 'u-1',
        ownerName: 'A. Martin',
        clientManagerId: null,
        clientManagerName: null,
        advContactId: 'contact-adv',
        advName: 'C. Compta',
        partnerName: 'Partenaire SAS',
        level: 2,
      },
    ])
    expect(screen.getByText('À signaler à A. Martin')).toBeInTheDocument()
    expect(screen.getByText('ADV : C. Compta')).toBeInTheDocument()
    expect(screen.getByText('Partenaire : Partenaire SAS')).toBeInTheDocument()
    expect(screen.getByText('Niveau d’escalade 2')).toBeInTheDocument()
  })

  it('ne nomme ni ADV ni partenaire tant que la source n’en porte pas', () => {
    renderPage({}, [
      {
        line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: 'ts-1' },
        ownerId: 'u-1',
        ownerName: 'A. Martin',
        clientManagerId: null,
        clientManagerName: null,
        advName: null,
        partnerName: null,
      },
    ])
    expect(screen.queryByText(/ADV :/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Partenaire :/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Niveau d’escalade/)).not.toBeInTheDocument()
  })

  it('ne nomme pas de manager client tant que la mission n’en désigne aucun', () => {
    renderPage({}, [
      {
        line: { missionId: 'm-1', consultantId: 'c-1', timesheetId: 'ts-1' },
        ownerId: 'u-1',
        ownerName: 'A. Martin',
        clientManagerId: null,
        clientManagerName: null,
      },
    ])
    expect(screen.queryByText(/Manager client/)).not.toBeInTheDocument()
  })
})

/**
 * #2196.31 — « Marquer non applicable » / « Annuler l'exception ».
 *
 * Le serveur tient la règle (motif exigé, relevé déposé refusé) ; l'écran ne
 * propose pas un geste qu'il refuserait, n'envoie rien sans motif, et MONTRE
 * la trace — qui, quand, pourquoi — tant que l'exception vit.
 */
describe('TimesheetsPage — l’exception « non applicable » (#2196.31)', () => {
  opensTheLine()
  beforeEach(() => {
    cleanup()
    timesheetMonth.mockReset()
    markNotApplicable.mockReset()
    revokeNotApplicable.mockReset()
  })

  const renderWith = (over: Record<string, unknown> = {}) => {
    timesheetMonth.mockReturnValue({
      data: { month: '2026-07', items: [timesheetLine(over)], summary: summary({ total: 1 }) },
      isLoading: false,
      isError: false,
    })
    render(<TimesheetsPage />)
  }
  const missing = { timesheetId: null, status: 'missing', days: null }

  it('propose le geste sur un mois MANQUANT', () => {
    renderWith(missing)
    expect(screen.getByRole('button', { name: 'Marquer non applicable' })).toBeInTheDocument()
  })

  it('ne le propose PAS sur un relevé déposé — un fait ne se cache pas', () => {
    renderWith({ status: 'submitted' })
    expect(screen.queryByRole('button', { name: 'Marquer non applicable' })).not.toBeInTheDocument()
  })

  it('n’envoie RIEN tant que le motif est vide', async () => {
    renderWith(missing)
    await userEvent.click(screen.getByRole('button', { name: 'Marquer non applicable' }))
    await userEvent.type(screen.getByLabelText('Motif de l’exception'), '   ')
    expect(screen.getByRole('button', { name: 'Confirmer l’exception' })).toBeDisabled()
    expect(markNotApplicable).not.toHaveBeenCalled()
  })

  it('envoie la MAILLE et le motif détouré', async () => {
    renderWith(missing)
    await userEvent.click(screen.getByRole('button', { name: 'Marquer non applicable' }))
    await userEvent.type(screen.getByLabelText('Motif de l’exception'), '  Congé sans solde  ')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer l’exception' }))
    expect(markNotApplicable).toHaveBeenCalledWith({
      missionId: 'm-1',
      month: '2026-07',
      consultantId: 'c-1',
      reason: 'Congé sans solde',
    })
  })

  it('MONTRE la trace — qui, quand, pourquoi — et « Annuler l’exception » la révoque', async () => {
    renderWith({
      ...missing,
      status: 'not_required',
      notApplicable: {
        id: 'x-1',
        reason: 'Congé sans solde tout le mois',
        markedAt: '2026-08-03T09:00:00.000Z',
        markedByName: 'Louise Martin',
      },
    })
    expect(screen.getByText('Marqué non applicable le 2026-08-03 par Louise Martin')).toBeInTheDocument()
    expect(screen.getByText('Congé sans solde tout le mois')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marquer non applicable' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Annuler l’exception' }))
    expect(revokeNotApplicable).toHaveBeenCalledWith('x-1')
  })
})

/**
 * #2415.8 — « Agréger plusieurs CRA consultants sur une même facture ».
 *
 * Bellum ne crée ni n'émet de facture (doctrine) : le groupe montre la
 * préparation de facturation MISSION, jamais un objet facture. Une mission à
 * UN seul consultant garde son rendu d'avant — pas de groupe visible.
 */
describe('TimesheetsPage — regrouper les CRA par mission (#2415.8)', () => {
  it('affiche un groupe « prêt » quand deux consultants de la MÊME mission ne bloquent rien', () => {
    timesheetMonth.mockReturnValue(
      page({
        items: [
          timesheetLine({ consultantId: 'c-1', consultantName: 'A. Dupont', blocksInvoicing: false }),
          timesheetLine({ consultantId: 'c-2', consultantName: 'B. Martin', blocksInvoicing: false }),
        ],
        total: 2,
      }),
    )
    render(<TimesheetsPage />)
    expect(screen.getByText('Prêt pour la préparation de facturation')).toBeInTheDocument()
    expect(screen.getByText('A. Dupont')).toBeInTheDocument()
    expect(screen.getByText('B. Martin')).toBeInTheDocument()
  })

  it('affiche « pas encore prêt » dès qu’UN SEUL des deux consultants bloque', () => {
    timesheetMonth.mockReturnValue(
      page({
        items: [
          timesheetLine({ consultantId: 'c-1', blocksInvoicing: false }),
          timesheetLine({ consultantId: 'c-2', blocksInvoicing: true }),
        ],
        total: 2,
      }),
    )
    render(<TimesheetsPage />)
    expect(screen.getByText('Pas encore prêt pour la facturation')).toBeInTheDocument()
  })

  it('ne montre AUCUN badge de groupe pour une mission à un seul consultant', () => {
    timesheetMonth.mockReturnValue(page({ items: [timesheetLine()], total: 1 }))
    render(<TimesheetsPage />)
    expect(screen.queryByText('Prêt pour la préparation de facturation')).not.toBeInTheDocument()
    expect(screen.queryByText('Pas encore prêt pour la facturation')).not.toBeInTheDocument()
  })
})

// Théo missions-cra — le tableau plat, les filtres en multi-sélection, la fenêtre « Relevé ».
describe('TimesheetsPage — la refonte Théo (missions-cra)', () => {
  const lines = () => [
    timesheetLine({
      consultantId: 'c-1',
      consultantName: 'Yanis Berthier',
      missionLabel: 'Fiabilisation plateforme',
      accountName: 'SNCF',
      status: 'validated',
      days: 20,
      validatedByClientAt: '2026-10-01T10:00:00.000Z',
      internalReviewedAt: '2026-10-01T09:00:00.000Z',
    }),
    timesheetLine({
      consultantId: 'c-2',
      consultantName: 'Camille Roussel',
      missionId: 'm-2',
      missionLabel: 'Plateforme conteneurs',
      accountName: 'Société Générale',
      status: 'submitted',
      days: 20,
      expectedDays: 18,
    }),
    timesheetLine({
      consultantId: 'c-3',
      consultantName: 'Antoine Rivière',
      missionId: 'm-3',
      missionLabel: 'Intégration EDI',
      accountName: 'Renault',
      status: 'missing',
      timesheetId: null,
      days: null,
      expectedDays: null,
    }),
  ]
  const show = () => {
    timesheetMonth.mockReturnValue(page({ items: lines(), total: 3 }))
    render(<TimesheetsPage />)
  }

  it('est un tableau plat : consultant / mission, activité, validation interne, validation client, suivi', () => {
    show()
    const table = screen.getByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(cell => cell.textContent)
    expect(headers).toEqual([
      '',
      'Consultant / mission',
      'Activité',
      'Validation interne',
      'Validation client',
      'Suivi',
      '',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(4)
  })

  it('une activité non reçue dit « Aucune activité supposée », jamais « 0 j »', () => {
    show()
    const row = screen.getByText('Antoine Rivière').closest('tr') as HTMLElement
    expect(within(row).getByText('À recevoir')).toBeInTheDocument()
    expect(within(row).getByText('Aucune activité supposée')).toBeInTheDocument()
    expect(row.textContent).not.toMatch(/\b0 j/)
  })

  it('la validation client est une PREUVE consignée, jamais une signature inventée', () => {
    show()
    const validated = screen.getByText('Yanis Berthier').closest('tr') as HTMLElement
    expect(within(validated).getByText('Preuve consignée')).toBeInTheDocument()
    const waiting = screen.getByText('Camille Roussel').closest('tr') as HTMLElement
    expect(within(waiting).getByText('En attente')).toBeInTheDocument()
    expect(within(waiting).queryByText('Preuve consignée')).not.toBeInTheDocument()
  })

  it('filtre sur PLUSIEURS comptes à la fois', async () => {
    show()
    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: /^Compte/ }))
    await u.click(await screen.findByRole('menuitemcheckbox', { name: 'SNCF' }))
    await u.click(await screen.findByRole('menuitemcheckbox', { name: 'Renault' }))
    await u.keyboard('{Escape}')
    expect(screen.getByText('Yanis Berthier')).toBeInTheDocument()
    expect(screen.getByText('Antoine Rivière')).toBeInTheDocument()
    expect(screen.queryByText('Camille Roussel')).not.toBeInTheDocument()
  })

  it('filtre sur PLUSIEURS états à la fois', async () => {
    show()
    await chooseState('À recevoir')
    await userEvent.click(screen.getByRole('button', { name: /^État/ }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Validés client' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('Antoine Rivière')).toBeInTheDocument()
    expect(screen.getByText('Yanis Berthier')).toBeInTheDocument()
    expect(screen.queryByText('Camille Roussel')).not.toBeInTheDocument()
  })

  it('la recherche retient le consultant, la mission ou le compte', async () => {
    show()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un relevé' }), 'conteneurs')
    expect(screen.getByText('Camille Roussel')).toBeInTheDocument()
    expect(screen.queryByText('Yanis Berthier')).not.toBeInTheDocument()
  })

  it('« Ouvrir » ouvre la fenêtre du relevé, qui porte les gestes (rejeter, expliquer l’écart…)', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le relevé de Camille Roussel' }))
    const dialog = screen.getByRole('dialog', { name: 'Relevé · Camille Roussel' })
    expect(within(dialog).getByRole('button', { name: 'Rejeter le relevé' })).toBeInTheDocument()
  })

  it('« Exporter la sélection » exporte les relevés cochés, ou tout ce qui est affiché', async () => {
    show()
    const u = userEvent.setup()
    await u.click(screen.getByRole('checkbox', { name: 'Sélectionner le relevé de Camille Roussel' }))
    expect(screen.getByRole('button', { name: 'Exporter la sélection' })).toBeEnabled()
  })
})

// Contrôle de fidélité Théo (23/10) — l'ORDRE de l'écran des relevés et ses gestes. Dit NON si un bloc change
// de place, si une tuile redevient un chiffre inerte, ou si les cartes de pied disparaissent.
describe('TimesheetsPage — structure de la maquette Théo', () => {
  it('empile chaîne, tuiles, filtres libellés, tableau en carte, puis les deux cartes de pied', () => {
    timesheetMonth.mockReturnValue(page({ items: [timesheetLine()], total: 1 }))
    const { container } = render(<TimesheetsPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Clôturer l’activité, sans courir après les pièces' }),
    ).toBeInTheDocument()
    const order = [...container.querySelectorAll('[data-slot]')]
      .map(node => node.getAttribute('data-slot'))
      .filter(slot => ['finance-chain', 'cra-tiles', 'cra-filters', 'cra-table', 'cra-after'].includes(slot ?? ''))
    expect(order).toEqual(['finance-chain', 'cra-tiles', 'cra-filters', 'cra-table', 'cra-after'])
    expect(screen.getByText('Période d’activité')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Une seule chaîne de validation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contrôler le prêt à facturer' })).toHaveAttribute(
      'href',
      '/missions/facturation',
    )
  })

  it('une tuile d’état est un bouton qui pose le filtre sur sa population', async () => {
    timesheetMonth.mockReturnValue(
      page({
        items: [
          timesheetLine(),
          timesheetLine({
            timesheetId: 'ts-2',
            consultantName: 'B. Martin',
            status: 'validated',
            validatedByClientAt: '2026-08-02T00:00:00Z',
          }),
        ],
        total: 2,
      }),
    )
    render(<TimesheetsPage />)
    const tile = screen.getByRole('button', { name: /À contrôler/ })
    expect(tile).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(tile)
    expect(screen.getByRole('button', { name: /À contrôler/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('B. Martin')).not.toBeInTheDocument()
    expect(screen.getAllByText('A. Dupont').length).toBeGreaterThan(0)
  })
})
