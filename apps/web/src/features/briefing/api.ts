import type {
  AgendaSlotProposalConfirmRequest,
  AgendaSlotProposalPreview,
  AgendaSlotProposalPreviewRequest,
  AgendaSlotProposalRejectRequest,
  BellumCreatedEventIdsResponse,
  BriefingAction,
  BriefingActionKind,
  BriefingCardDispositionRequest,
  BriefingRoleFitFeedbackRequest,
  BriefingTasksBlock,
  CancelFocusPlanBlockRequest,
  ConfirmFocusPlanBlockRequest,
  DailyBriefing,
  FirstOpenTodayRequest,
  FirstOpenTodayResponse,
  FocusPlanBlockOutcome,
  SetFocusPlanBlockOutcomeRequest,
  SinceLastVisitDigest,
  SlotProposalPriorityAccount,
} from '@bellum/contracts'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { lauraJobApi } from '@/features/chat/api/lauraJobApi'
// BEL-SC-227 (#3256) — le rôle déclaré, pour l'ORDRE des trois décisions du
// jour. Réexporté ICI (même hook, même requête que « Mon profil »,
// `esnProfileKeys.mine` — GA-26, jamais un second appel réseau) : `BriefingPage`
// lit tout son état depuis `../api`, et ses tests mockent déjà ce seul module
// plutôt que de monter un `SessionProvider`/`QueryClientProvider` réels.
export { useEsnProfile as useCurrentUserRole } from '@/features/profile/hooks/useEsnProfile'

/** Le brief du jour — lecture pure, aucun crédit consommé. */
export const briefingApi = {
  /**
   * #1936 — `timeZone` est le fuseau du NAVIGATEUR, envoyé à chaque appel et
   * jamais stocké (décision de Louis du 12/09). Absent, le serveur retombe sur
   * son fuseau par défaut : le chemin d'avant, inchangé.
   */
  async today(timeZone?: string, readAs?: string | null): Promise<DailyBriefing> {
    const params = new URLSearchParams()
    if (timeZone) params.set('timeZone', timeZone)
    // #3414 — « lire comme » : honoré par le serveur en salle de démo seulement.
    if (readAs) params.set('readAs', readAs)
    const query = params.toString() ? `?${params.toString()}` : ''
    return tolerateOlderApi(await apiFetch<DailyBriefing>({ path: `/briefing/today${query}` }))
  },
  /**
   * #1936 — « est-ce la première ouverture de Laura aujourd'hui ? », et la
   * réponse se CONSOMME : `true` une seule fois par jour civil (dans ce fuseau).
   * Réservé à l'amorce de Laura, au moment où elle va parler — jamais à un
   * affichage qui n'aurait rien montré.
   */
  async firstOpenToday(timeZone?: string): Promise<FirstOpenTodayResponse> {
    return apiFetch<FirstOpenTodayResponse, FirstOpenTodayRequest>({
      path: '/briefing/first-open-today',
      method: 'POST',
      body: timeZone ? { timeZone } : {},
    })
  },
  /** Les quatre lignes typées de « ce qui a bougé », sur la fenêtre du repère. */
  async sinceLastVisit(since: string): Promise<SinceLastVisitDigest> {
    return apiFetch<SinceLastVisitDigest>({ path: `/briefing/since-last-visit?since=${encodeURIComponent(since)}` })
  },
  /**
   * #2397.7 — « ceci correspond à mon rôle », posé sur un GENRE de carte.
   * `engaged: false` retire le geste — jamais une pénalité, l'absence est déjà
   * le défaut neutre. Aucun crédit débité.
   */
  /** #2099.17-.32 — Reporter / Pas pertinent / Déjà traité, sur UNE carte. */
  async setCardDisposition(request: BriefingCardDispositionRequest): Promise<{ recorded: true }> {
    return apiFetch<{ recorded: true }, BriefingCardDispositionRequest>({
      path: '/briefing/card-disposition',
      method: 'POST',
      body: request,
    })
  },
  async setRoleFit(kind: BriefingActionKind, engaged: boolean): Promise<{ engaged: boolean }> {
    return apiFetch<{ engaged: boolean }, BriefingRoleFitFeedbackRequest>({
      path: '/briefing/role-fit',
      method: 'POST',
      body: { kind, engaged },
    })
  },
  /**
   * #2107 (Centre d'actions) — TOUTES les actions candidates, jamais
   * plafonnées à `BRIEFING_ACTIONS_MAX` : c'est la lecture que `/actions`
   * utilise, `GET /briefing/today` continue de servir le top classé et
   * tronqué pour « Aujourd'hui ».
   */
  async allActions(): Promise<BriefingAction[]> {
    return (await apiFetch<{ actions: BriefingAction[] }>({ path: '/briefing/actions' })).actions
  },
  /**
   * #2770 (#2101.19/.21/.22/.30/.37/.40) — LA PORTE : `preview` ne calcule ni
   * n'écrit rien de plus qu'une prévisualisation FIGÉE (suspendue si un refus
   * est déjà posé aujourd'hui pour ce compte, #2101.40) ; `confirm` écrit
   * EXACTEMENT le créneau reçu, sur un geste explicite — jamais seule ;
   * `reject` mémorise le refus, sans toucher à l'agenda.
   */
  async previewSlotProposal(accountId: string, durationMinutes = 60): Promise<AgendaSlotProposalPreview> {
    return apiFetch<AgendaSlotProposalPreview, AgendaSlotProposalPreviewRequest>({
      path: '/briefing/slot-proposals/preview',
      method: 'POST',
      body: { accountId, durationMinutes },
    })
  },
  async confirmSlotProposal(
    input: AgendaSlotProposalConfirmRequest,
  ): Promise<{ id: string; conferenceUrl: string | null }> {
    return apiFetch<{ id: string; conferenceUrl: string | null }, AgendaSlotProposalConfirmRequest>({
      path: '/briefing/slot-proposals/confirm',
      method: 'POST',
      body: input,
    })
  },
  async rejectSlotProposal(accountId: string): Promise<{ rejected: true }> {
    return apiFetch<{ rejected: true }, AgendaSlotProposalRejectRequest>({
      path: '/briefing/slot-proposals/reject',
      method: 'POST',
      body: { accountId },
    })
  },
  /**
   * #2770 (#2101.14) — le classement par priorité, pour choisir à qui
   * proposer un créneau en premier. Lecture pure, aucun crédit consommé.
   */
  async slotProposalPriorityAccounts(): Promise<SlotProposalPriorityAccount[]> {
    return apiFetch<SlotProposalPriorityAccount[]>({ path: '/briefing/slot-proposal-priority-accounts' })
  },
  /**
   * #2770 (#2101.19/.21/.22/.37) — les identifiants que la grille/le
   * plateau d'agenda partagés croisent avec `event.id` pour distinguer une
   * suggestion BellumAI. Lecture pure, aucun crédit consommé.
   */
  async bellumCreatedEventIds(): Promise<BellumCreatedEventIdsResponse> {
    return apiFetch<BellumCreatedEventIdsResponse>({ path: '/briefing/bellum-created-event-ids' })
  },
  /**
   * #2770.49/.50/.51 — LA PORTE : écrit réellement UN bloc du plan de journée
   * (`propose_focus_plan`, #2391) dans l'agenda, sur le titre et les horaires
   * EXACTS que la carte a montrés.
   */
  async confirmFocusPlanBlock(
    input: ConfirmFocusPlanBlockRequest,
  ): Promise<{ id: string; conferenceUrl: string | null }> {
    return apiFetch<{ id: string; conferenceUrl: string | null }, ConfirmFocusPlanBlockRequest>({
      path: '/briefing/focus-plan/confirm-block',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2770.52 — annule un bloc réellement créé, sur le seul identifiant que
   * `confirmFocusPlanBlock` a rendu.
   */
  async cancelFocusPlanBlock(eventId: string): Promise<{ cancelled: true }> {
    return apiFetch<{ cancelled: true }, CancelFocusPlanBlockRequest>({
      path: '/briefing/focus-plan/cancel-block',
      method: 'POST',
      body: { event_id: eventId },
    })
  },
  /**
   * #2770.63/.64/.65 — la mesure post-bloc, sur le seul identifiant que
   * `confirmFocusPlanBlock` a rendu.
   */
  async setFocusPlanBlockOutcome(input: {
    eventId: string
    outcome: FocusPlanBlockOutcome
    note?: string
    actualMinutes?: number
  }): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }, SetFocusPlanBlockOutcomeRequest>({
      path: '/briefing/focus-plan/block-outcome',
      method: 'POST',
      // #2770.66/.67 — le résultat libre et la durée DÉCLARÉE n'entrent dans le
      // corps que s'ils sont donnés : un clic seul n'efface rien côté serveur.
      body: {
        event_id: input.eventId,
        outcome: input.outcome,
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.actualMinutes !== undefined ? { actual_minutes: input.actualMinutes } : {}),
      },
    })
  },
}

/**
 * Un bloc qu'on n'a pas reçu.
 *
 * `unavailable` et pas `ready` avec une liste vide : « le serveur ne sert pas
 * encore cette partie » et « tu n'as rien à faire » sont deux phrases
 * différentes, et confondre les deux est exactement ce que l'état de bloc
 * existe pour empêcher.
 */
const MISSING_TASKS: BriefingTasksBlock = {
  state: 'unavailable',
  reason: 'Cette partie du brief n’est pas encore servie par le serveur.',
  // #2098.9 — jamais lue : ce bloc n'existe même pas côté serveur ici.
  readAt: null,
  tasks: [],
  overdueCount: 0,
  todayCount: 0,
}

/**
 * Rend le brief lisible même quand il vient d'un serveur PLUS ANCIEN que l'app.
 *
 * L'app et l'API se déploient séparément — Vercel et Railway — donc il existe
 * toujours une fenêtre où le navigateur exécute du code plus récent que la
 * réponse qu'il reçoit. À cela s'ajoute le cache persisté : une réponse écrite
 * hier peut être rendue par le code d'aujourd'hui.
 *
 * Vu en production le 17/08 : le brief a gagné son bloc Tâches, l'écran lisait
 * `data.tasks.state`, et « Aujourd’hui » — l'écran le plus ouvert du produit —
 * affichait une page d'erreur à tous ceux dont le cache datait d'avant. Le
 * casseur de cache (`App.tsx`) ferme la porte principale ; ceci est la seconde
 * serrure, celle qui tient pendant les minutes d'un déploiement.
 */
function tolerateOlderApi(payload: DailyBriefing): DailyBriefing {
  return { ...payload, tasks: payload.tasks ?? MISSING_TASKS }
}

/** #1936 — le fuseau IANA du navigateur, ou `undefined` s'il ne se lit pas (le serveur a son repli). */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/**
 * #1936 — LE BRIEF DU MATIN, SEULEMENT À LA 1RE OUVERTURE DU JOUR.
 *
 * - `null` : pas la première du jour, OU le marqueur n'a pas répondu — l'amorce
 *   courte, jamais un brief deviné. Une API d'avant le marqueur (champ absent)
 *   ne vaut jamais « premier du jour ».
 * - `{ briefing: null }` : première du jour, mais le brief n'a pas pu être lu.
 *   Le marqueur est consommé quand même (décision de Louis) : Laura parle, et
 *   chacun des trois blocs DIT qu'il n'a pas pu lire.
 *
 * Le MÊME fuseau part aux deux appels : deux fuseaux pourraient désigner deux
 * jours différents.
 */
export async function readMorningBrief(
  timeZone: string | undefined,
): Promise<{ briefing: DailyBriefing | null } | null> {
  let isFirstOpenToday: boolean
  try {
    isFirstOpenToday = (await briefingApi.firstOpenToday(timeZone))?.isFirstOpenToday === true
  } catch (error) {
    console.error('[Morning brief] first-open-today', error)
    return null
  }
  if (!isFirstOpenToday) return null
  try {
    return { briefing: await briefingApi.today(timeZone) }
  } catch (error) {
    console.error('[Morning brief] today', error)
    return { briefing: null }
  }
}

/**
 * Le brief SUIT la journée.
 *
 * Il était relu à la demande seulement : un onglet ouvert le matin annonçait
 * encore à 16 h les relances traitées depuis, et le rendez-vous « à préparer »
 * était terminé depuis longtemps. Un écran qui s'appelle « Aujourd’hui » et qui
 * décrit la matinée est pire qu'un écran vide, parce qu'on lui fait confiance.
 *
 * Cinq minutes, et au retour sur l'onglet — pas moins : le brief lit une
 * messagerie et un agenda distants, et ces lectures ont un coût côté
 * fournisseur. Rien ici ne consomme de crédit.
 */
/**
 * Les quatre lignes typées de « ce qui a bougé depuis ta dernière visite ».
 *
 * La fenêtre est le repère de visite, figé pour la session par `useLastSeen`
 * (`staleTime: Infinity`) : elle entre donc dans la clé de cache, et deux
 * sessions ne se marchent pas dessus. `enabled` est faux tant qu'il n'y a pas de
 * repère — sans fenêtre, la question n'a pas de sens, et l'API la refuserait.
 *
 * Pas de `refetchInterval` : contrairement au brief, ce bloc décrit une PÉRIODE
 * CLOSE — ce qui s'est passé pendant l'absence. Le rafraîchir toutes les cinq
 * minutes ferait bouger des chiffres sous les yeux de quelqu'un en train de les
 * lire, pour dire la même chose.
 */
export function useSinceLastVisit(since: string | null) {
  return useQuery({
    queryKey: ['briefing', 'since-last-visit', since],
    queryFn: () => briefingApi.sinceLastVisit(since as string),
    enabled: since !== null,
    staleTime: Infinity,
  })
}

export function useDailyBriefing(readAs?: string | null) {
  return useQuery({
    queryKey: readAs ? ['briefing', 'today', readAs] : ['briefing', 'today'],
    // #1936 — le même fuseau que celui du brief de Laura : l'écran et Laura parlent du même jour.
    queryFn: () => briefingApi.today(browserTimeZone(), readAs),
    // #3414 — changer de lecture garde l'écran en place jusqu'à la réponse.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    // Seulement quand l'onglet est au premier plan : rafraîchir un onglet
    // caché fait payer des appels fournisseur que personne ne lit.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}

/**
 * #2107 (Centre d'actions) — TOUTES les actions candidates, jamais
 * plafonnées. Même cadence que `useDailyBriefing` (5 min, au premier plan
 * seulement) : les deux écrans lisent le même moteur, ils doivent rester à
 * la même fraîcheur.
 */
export function useAllBriefingActions() {
  return useQuery({
    queryKey: ['briefing', 'actions'],
    queryFn: () => briefingApi.allActions(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}

/**
 * #2397.7 — le geste « ceci correspond à mon rôle », depuis une carte. Invalide
 * `['briefing', 'today']` au succès : le prochain rendu du brief reflète le
 * nouveau classement, sans attendre le prochain rafraîchissement de 5 min.
 */
export function useSetRoleFit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, engaged }: { kind: BriefingActionKind; engaged: boolean }) =>
      briefingApi.setRoleFit(kind, engaged),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
    },
  })
}

/**
 * #2099.17-.32 — le geste posé sur une carte. Invalide le brief ET le Centre
 * d'actions : les deux lisent la même dérivation, la carte disparaît des deux.
 */
export function useSetCardDisposition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: BriefingCardDispositionRequest) => briefingApi.setCardDisposition(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
      queryClient.invalidateQueries({ queryKey: ['briefing', 'actions'] })
    },
  })
}

/**
 * #2147.5 (correctif 26/09 soir) — annuler un job composite de Laura (#2276)
 * depuis « Aujourd'hui ». Même route que le geste « Annuler » de la carte du
 * job dans la conversation (`lauraJobApi.gesture`, GA-26 : une seule fonction
 * qui parle à `action-os/jobs/:id/cancel`), invalide `['briefing', 'today']`
 * au succès pour que la carte de suivi disparaisse sans attendre le prochain
 * rafraîchissement de 5 min.
 */
export function useCancelLauraJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => lauraJobApi.gesture(jobId, 'cancel'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
    },
  })
}

/** #2770 (#2101.19/.21/.22/.30/.37/.40) — la prévisualisation, jamais mise en cache : chaque demande reflète l'agenda RÉEL au moment du clic. */
export function usePreviewSlotProposal() {
  return useMutation({
    mutationFn: ({ accountId, durationMinutes }: { accountId: string; durationMinutes?: number }) =>
      briefingApi.previewSlotProposal(accountId, durationMinutes),
  })
}

/** #2770 — la porte : écrit réellement dans l'agenda. Invalide les mêmes clés que `useCreateAgendaEvent`. */
export function useConfirmSlotProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AgendaSlotProposalConfirmRequest) => briefingApi.confirmSlotProposal(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'window'] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'free-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
    },
  })
}

/** #2770 (#2101.40) — mémorise le refus, n'écrit jamais dans l'agenda. */
export function useRejectSlotProposal() {
  return useMutation({
    mutationFn: (accountId: string) => briefingApi.rejectSlotProposal(accountId),
  })
}

/**
 * #2770.49/.50/.51 — la porte : écrit réellement un bloc du plan de journée
 * dans l'agenda. Mêmes invalidations que `useConfirmSlotProposal`.
 */
export function useConfirmFocusPlanBlock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ConfirmFocusPlanBlockRequest) => briefingApi.confirmFocusPlanBlock(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'window'] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'free-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
    },
  })
}

/** #2770.52 — annuler un bloc de plan de journée réellement créé. */
export function useCancelFocusPlanBlock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) => briefingApi.cancelFocusPlanBlock(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'window'] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'free-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
    },
  })
}

/**
 * #2770.63/.64/.65 — la mesure post-bloc (réalisé/interrompu/reporté), un
 * clic déclaré, jamais une surveillance. Aucune invalidation d'agenda : ce
 * geste ne touche ni l'évènement ni le brief, seulement le marqueur local.
 */
export function useSetFocusPlanBlockOutcome() {
  return useMutation({
    mutationFn: (input: { eventId: string; outcome: FocusPlanBlockOutcome; note?: string; actualMinutes?: number }) =>
      briefingApi.setFocusPlanBlockOutcome(input),
  })
}

/**
 * #2770 (#2101.14) — le classement par priorité pour « Aujourd'hui ». Même
 * cadence que `useDailyBriefing` : cinq minutes, au premier plan seulement —
 * les deux écrans lisent le même portefeuille, ils doivent rester à la même
 * fraîcheur.
 */
export function useSlotProposalPriorityAccounts() {
  return useQuery({
    queryKey: ['briefing', 'slot-proposal-priority-accounts'],
    queryFn: () => briefingApi.slotProposalPriorityAccounts(),
    staleTime: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}

/**
 * #2770 (#2101.19/.21/.22/.37) — les identifiants à croiser avec les
 * évènements affichés (`AgendaBoard`) pour poser `createdByBellum`. `enabled`
 * même patron que `useAgendaWindow` : inutile de lire tant que l'agenda
 * lui-même n'est pas monté.
 */
export function useBellumCreatedEventIds(enabled: boolean) {
  return useQuery({
    queryKey: ['briefing', 'bellum-created-event-ids'],
    queryFn: () => briefingApi.bellumCreatedEventIds(),
    enabled,
    staleTime: 60 * 1000,
  })
}
