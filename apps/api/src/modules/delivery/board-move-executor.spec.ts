import { DeliveryController } from './delivery.controller'

/**
 * L'exécuteur du board Missions (arbitrage Louis du 26/08/2026).
 *
 * Le défaut corrigé : `moveBoardCard` rendait `acceptedActions` tel quel et
 * n'exécutait rien. Vingt cases qu'on cochait et qui ne faisaient rien — le
 * même défaut que le pipe des Projets avait corrigé un mois plus tôt.
 *
 * Ce qui se teste ici n'est pas la mise en page mais quatre propriétés :
 * l'exécution a lieu, ce qui n'est pas exécutable ressort en RAPPEL (jamais
 * jeté), un échec ne défait pas le déplacement, et une date manquante ne fait
 * inventer aucune échéance.
 */

const MISSION = {
  id: 'm-1',
  workspace_id: 'ws-1',
  account_id: 'acc-1',
  label: 'ACME — plateforme',
  started_on: '2026-06-01',
  status: 'active',
}

function build(options: { accepted?: string[]; reason?: string | null; startedOn?: string | null } = {}) {
  const mission = { ...MISSION, started_on: options.startedOn === undefined ? MISSION.started_on : options.startedOn }
  const moveBoardCard = jest.fn().mockResolvedValue({
    status: 'active',
    movedAt: '2026-08-26T10:00:00.000Z',
    acceptedActions: options.accepted ?? [],
    mission,
  })
  const delivery = { moveBoardCard } as never
  const board = {} as never
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never

  const decide = jest.fn().mockResolvedValue({})
  const createEvent = jest.fn().mockResolvedValue({})
  const accountGate = { decide } as never
  const agenda = { createEvent } as never

  const propagation = {} as never
  /** L'onglet Missions d'un dossier de compte : aucun rôle dans un déplacement
   *  de carte, mais le contrôleur le porte depuis BEL-BO-006. */
  const accountMissions = {} as never
  /** Le détecteur de dérive : aucun rôle dans un déplacement de carte, mais le
   *  contrôleur le porte depuis le §7.2 du PDF 5. Il est passé POSITIONNELLEMENT
   *  comme les autres — l'oublier décalerait `workspaceContext` d'un cran et le
   *  contrôleur appellerait `resolveActiveWorkspace` sur un objet vide. */
  const drift = {} as never
  /** #2562 — la proposition de reprise CRM : aucun rôle dans un déplacement de
   *  carte, mais le contrôleur la porte, POSITIONNELLEMENT comme les autres. */
  const crmReprisal = {} as never
  /** #2412 — le double pouls de satisfaction : aucun rôle dans un déplacement
   *  de carte, mais le contrôleur le porte, POSITIONNELLEMENT comme les autres. */
  const missionFeedback = {} as never

  const controller = new DeliveryController(
    delivery,
    board,
    propagation,
    accountMissions,
    drift,
    crmReprisal,
    missionFeedback,
    workspaceContext,
    accountGate,
    agenda,
  )
  const move = () =>
    controller.moveCard(
      'm-1',
      { to: 'perdue', reason: options.reason ?? 'budget gelé', acceptedActions: options.accepted ?? [] } as never,
      { userId: 'u-1' } as never,
    )
  return { controller, move, decide, createEvent, moveBoardCard }
}

describe('board Missions — les cases cochées font quelque chose', () => {
  it('ÉCARTE le compte avec le motif de la perte, sans en redemander un', async () => {
    // En redemander un ici le ferait remplir n'importe comment : le motif de la
    // perte est la seule raison qu'on ait, et elle est déjà exigée.
    const { move, decide } = build({ accepted: ['park_account'], reason: 'budget gelé' })
    const result = (await move()) as { actions: { performed: string[] } }
    expect(decide).toHaveBeenCalledWith('ws-1', 'acc-1', 'parked', 'budget gelé')
    expect(result.actions.performed).toEqual(['park_account'])
  })

  it('POSE le point à J+30 du démarrage, pas à J+30 d’aujourd’hui', async () => {
    const { move, createEvent } = build({ accepted: ['plan_j30_review'], startedOn: '2026-06-01' })
    await move()
    const draft = createEvent.mock.calls[0][1]
    expect(draft.startsAt.slice(0, 10)).toBe('2026-07-01')
    // Le titre porte la mission : un agenda plein de « Point » est illisible
    // une semaine plus tard.
    expect(draft.accountName).toBe('ACME — plateforme')
  })

  it('n’invente AUCUNE échéance quand la mission n’a pas de date de démarrage', async () => {
    // « J+30 » ne désigne alors rien, et quelqu'un se fierait à la date posée.
    const { move, createEvent } = build({ accepted: ['plan_j30_review'], startedOn: null })
    const result = (await move()) as { actions: { performed: string[]; failed: { key: string; reason: string }[] } }
    expect(createEvent).not.toHaveBeenCalled()
    expect(result.actions.performed).toEqual([])
    expect(result.actions.failed).toEqual([{ key: 'plan_j30_review', reason: 'no_start_date' }])
  })

  it('rend en RAPPEL ce qu’il ne sait pas faire — jamais jeté en silence', async () => {
    // Un REX exige un résumé écrit par un humain ; le fabriquer produirait la
    // phrase que ce dépôt s'interdit.
    const { move } = build({ accepted: ['collect_loss_rex', 'check_invoicing', 'park_account'] })
    const result = (await move()) as { actions: { performed: string[]; pending: string[] } }
    expect(result.actions.pending).toEqual(['collect_loss_rex', 'check_invoicing'])
    expect(result.actions.performed).toEqual(['park_account'])
  })

  it('range une clé INCONNUE dans les rappels plutôt que de la perdre', async () => {
    // Un client plus récent que le serveur ne doit pas voir une case disparaître
    // en silence : c'est ce qui a rendu le défaut d'origine invisible.
    const { move } = build({ accepted: ['clef_du_futur'] })
    const result = (await move()) as { actions: { pending: string[] } }
    expect(result.actions.pending).toEqual(['clef_du_futur'])
  })

  it('un échec d’action ne DÉFAIT pas le déplacement', async () => {
    // Le déplacement est déjà écrit quand on arrive ici : une action qui échoue
    // ne le défait pas, elle se dit.
    const { move, decide } = build({ accepted: ['park_account'] })
    decide.mockRejectedValue(new Error('compte introuvable'))
    const result = (await move()) as { status: string; actions: { failed: { key: string; reason: string }[] } }
    expect(result.status).toBe('active')
    expect(result.actions.failed[0].key).toBe('park_account')
  })

  it('sans les services optionnels, l’action est ANNONCÉE en échec et non oubliée', async () => {
    const moveBoardCard = jest.fn().mockResolvedValue({
      status: 'terminated',
      movedAt: '2026-08-26T10:00:00.000Z',
      acceptedActions: ['park_account'],
      mission: MISSION,
    })
    const controller = new DeliveryController(
      { moveBoardCard } as never,
      {} as never,
      // Les agrégats de propagation : aucun rôle dans un déplacement de carte,
      // mais le contrôleur les porte depuis le 28/08/2026.
      {} as never,
      // L'onglet Missions d'un dossier de compte — même remarque (BEL-BO-006).
      {} as never,
      // Le détecteur de dérive — même remarque (PDF 5 §7.2).
      {} as never,
      // La proposition de reprise CRM (#2562) — même remarque.
      {} as never,
      // Le double pouls de satisfaction (#2412) — même remarque.
      {} as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
    )
    const result = (await controller.moveCard(
      'm-1',
      { to: 'perdue', reason: 'x', acceptedActions: ['park_account'] } as never,
      { userId: 'u-1' } as never,
    )) as { actions: { failed: { key: string; reason: string }[] } }
    expect(result.actions.failed).toEqual([{ key: 'park_account', reason: 'unavailable' }])
  })
})
