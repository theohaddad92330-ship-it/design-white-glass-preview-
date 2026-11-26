import type {
  AgendaCalendarRef,
  AgendaCalendars,
  AgendaEventDraft,
  AgendaReschedule,
  AgendaRescheduleResult,
  AgendaStatus,
  AgendaWindow,
  FreeSlot,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * « Ton agenda » — la capacité, jamais l'éditeur : aucune route, aucun libellé
 * de cet écran ne nomme le fournisseur. Seul Réglages › Intégrations le fait,
 * là où l'utilisateur autorise lui-même l'accès.
 */
export const agendaApi = {
  calendars(): Promise<AgendaCalendars> {
    return apiFetch<AgendaCalendars>({ path: '/agenda/calendars' })
  },
  select(ref: AgendaCalendarRef): Promise<AgendaCalendars> {
    return apiFetch<AgendaCalendars>({ path: '/agenda/calendar', method: 'PUT', body: ref })
  },
  /** La liste ENTIÈRE des agendas cochés, jamais un ajout : deux onglets
   *  ouverts finiraient sinon par se contredire sur ce que Bellum lit. */
  selectMany(calendars: AgendaCalendarRef[]): Promise<AgendaCalendars> {
    return apiFetch<AgendaCalendars>({ path: '/agenda/calendars', method: 'PUT', body: { calendars } })
  },
  /** Tout lire, plutôt que d'avoir à deviner dans lequel sera le prochain rendez-vous. */
  selectAll(): Promise<AgendaCalendars> {
    return apiFetch<AgendaCalendars>({ path: '/agenda/calendars/all', method: 'PUT' })
  },
  /** Revenir à l'agenda par défaut du compte. */
  clear(): Promise<{ cleared: true }> {
    return apiFetch<{ cleared: true }>({ path: '/agenda/calendar', method: 'DELETE' })
  },
  window(range: { from: Date; to: Date }): Promise<AgendaWindow> {
    const query = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      limit: '250',
    })
    return apiFetch<AgendaWindow>({ path: `/agenda/events?${query.toString()}` })
  },
  /**
   * Les trous exploitables de la fenêtre affichée.
   *
   * Le calcul appartient au serveur (`free-slots.ts`, pur et testé) : il sait
   * ce qu'est un jour ouvré et comment se comportent les évènements « journée
   * entière ». Le refaire dans le navigateur produirait, tôt ou tard, une plage
   * proposée pendant une réunion existante — ce qui ne se découvre qu'au moment
   * où le client répond « je ne suis pas libre ».
   *
   * Cette route existait sans qu'aucun écran ne l'appelle.
   */
  freeSlots(range: { from: Date; to: Date }, durationMinutes = 30): Promise<FreeSlot[]> {
    const query = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      durationMinutes: String(durationMinutes),
    })
    return apiFetch<FreeSlot[]>({ path: `/agenda/free-slots?${query.toString()}` })
  },
  /** Ce que l'agenda connecté sait faire — dont : sait-il déplacer sans prévenir. */
  status(): Promise<AgendaStatus> {
    return apiFetch<AgendaStatus>({ path: '/agenda/status' })
  },
  /**
   * Créer un rendez-vous.
   *
   * La route existait, testée, sans qu'aucun écran ne l'appelle : le produit
   * savait poser un rendez-vous et ne l'offrait nulle part.
   */
  createEvent(draft: AgendaEventDraft): Promise<{ id: string; conferenceUrl: string | null }> {
    return apiFetch<{ id: string; conferenceUrl: string | null }, AgendaEventDraft>({
      path: '/agenda/events',
      method: 'POST',
      body: draft,
    })
  },
  /** Déplacer un rendez-vous. `PATCH` : seules les bornes changent. */
  reschedule(input: AgendaReschedule): Promise<AgendaRescheduleResult> {
    const { eventId, ...body } = input
    return apiFetch<AgendaRescheduleResult, Omit<AgendaReschedule, 'eventId'>>({
      path: `/agenda/events/${encodeURIComponent(eventId)}`,
      method: 'PATCH',
      body,
    })
  },
}

/**
 * La liste des agendas lisibles.
 *
 * Elle n'est demandée que lorsqu'un agenda est branché (`enabled`) : sans
 * connexion, la requête ne dirait rien de plus que ce que l'état du bloc dit
 * déjà, et échouerait à chaque ouverture de l'écran.
 */
export function useAgendaCalendars(enabled: boolean) {
  return useQuery({
    queryKey: ['agenda', 'calendars'],
    queryFn: agendaApi.calendars,
    enabled,
    // Relu à CHAQUE ouverture de l'écran, et non gardé dix minutes.
    //
    // Vécu le 16/08 : l'accès agenda a été rouvert côté fournisseur, l'API
    // rendait bien les dix agendas — et l'écran montrait toujours « un de tes
    // agendas n'a pas répondu » avec un seul agenda dans la liste, y compris
    // après rechargement, parce que la réponse d'AVANT la réparation était
    // conservée. Un état de panne mis en cache survit à sa réparation : c'est
    // la seule donnée qu'il ne faut jamais servir sans la revérifier.
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Une fenêtre d'agenda — la journée ou la semaine affichée.
 *
 * La clé de cache porte les bornes : naviguer d'un jour à l'autre puis revenir
 * réaffiche instantanément ce qui a déjà été lu, sans re-demander au
 * fournisseur. `keepPreviousData` évite l'écran blanc entre deux jours — un
 * agenda qui clignote à chaque flèche donne l'impression que tout se recharge.
 */
export function useAgendaWindow(range: { from: Date; to: Date }, enabled: boolean) {
  return useQuery({
    queryKey: ['agenda', 'window', range.from.toISOString(), range.to.toISOString()],
    queryFn: () => agendaApi.window(range),
    enabled,
    staleTime: 60 * 1000,
    placeholderData: previous => previous,
  })
}

/**
 * Les trous de la journée affichée.
 *
 * Même clé de fenêtre que les évènements, et même durée de fraîcheur : les deux
 * décrivent le même moment, et les voir diverger donnerait une plage « libre »
 * dessinée par-dessus un rendez-vous qui vient d'être ajouté.
 */
export function useFreeSlots(range: { from: Date; to: Date }, enabled: boolean) {
  return useQuery({
    queryKey: ['agenda', 'free-slots', range.from.toISOString(), range.to.toISOString()],
    queryFn: () => agendaApi.freeSlots(range),
    enabled,
    staleTime: 60 * 1000,
    placeholderData: previous => previous,
  })
}

/**
 * Ce que l'agenda connecté sait faire.
 *
 * L'écran en a besoin AVANT d'ouvrir la confirmation de déplacement : les deux
 * fournisseurs ne se valent pas sur la notification des invités, et une case à
 * cocher qui ne serait pas honorée est pire que pas de case du tout.
 */
export function useAgendaStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['agenda', 'status'],
    queryFn: () => agendaApi.status(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Déplacer un rendez-vous.
 *
 * Invalide la fenêtre, les trous ET le brief : les trois décrivent le même
 * moment, et n'en rafraîchir qu'un laisserait l'écran en désaccord avec
 * lui-même — un rendez-vous à sa nouvelle heure au-dessus d'un compteur de
 * conflits calculé sur l'ancienne.
 */
export function useRescheduleEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AgendaReschedule) => agendaApi.reschedule(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'window'] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'free-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
    },
  })
}

/**
 * Créer un rendez-vous.
 *
 * Invalide exactement ce que la création change : la fenêtre (le rendez-vous
 * apparaît), les trous (celui qu'on vient de combler disparaît) et le brief
 * (« 4 rendez-vous à venir » devient 5). N'en rafraîchir qu'un laisserait la
 * grille afficher une plage libre sous le rendez-vous qui l'occupe.
 */
export function useCreateAgendaEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: AgendaEventDraft) => agendaApi.createEvent(draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'window'] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'free-slots'] })
      void queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
    },
  })
}

/** Après tout changement de sélection : la liste ET la journée sont périmées. */
function useCalendarMutation<TInput>(mutationFn: (input: TInput) => Promise<AgendaCalendars>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: data => {
      queryClient.setQueryData(['agenda', 'calendars'], data)
      // Le choix vaut pour ce que l'écran montre ET pour ce que le serveur
      // calcule (rendez-vous à préparer, conflits) : ne rafraîchir que la liste
      // laisserait le brief sur la journée d'un autre agenda, sans rien dire.
      void queryClient.invalidateQueries({ queryKey: ['briefing', 'today'] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'window'] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', 'free-slots'] })
    },
  })
}

/** Choisir l'agenda lu. */
export function useSelectAgendaCalendar() {
  return useCalendarMutation(agendaApi.select)
}

/** Cocher plusieurs agendas — la réponse juste pour la plupart des gens. */
export function useSelectAgendaCalendars() {
  return useCalendarMutation(agendaApi.selectMany)
}

/** Lire tous les agendas à la fois — même invalidation, même raison. */
export function useSelectAllAgendaCalendars() {
  return useCalendarMutation<void>(agendaApi.selectAll)
}
