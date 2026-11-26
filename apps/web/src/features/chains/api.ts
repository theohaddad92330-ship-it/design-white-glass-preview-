// ⚠️ `ChainBlocker` se lit DIRECTEMENT depuis le contrat partout où il sert :
// le ré-exporter d'ici ferait un second nom pour le même type, et le jour où le
// contrat gagne un champ, un des deux noms resterait en arrière.
import type {
  Chain,
  ChainBlocker,
  ChainDerivation,
  ChainKey,
  ChainSubjectType,
  ChainUndeterminedReason,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

/**
 * Une piste : le parcours, ses étapes comptées, ses portes en attente.
 *
 * ⚠️ **Les champs neufs sont OPTIONNELS ICI, bien qu'obligatoires au contrat.**
 * Ce type décrit ce que le client peut RECEVOIR, pas ce que le serveur promet —
 * et pendant les dix minutes qui séparent le déploiement de Vercel de celui de
 * Railway, ce qu'il reçoit vient de l'API PRÉCÉDENTE. Les déclarer obligatoires
 * a fait tomber `/actions/chaines` sur « Oups » en production le 05/09/2026 :
 * TypeScript croyait `purpose` toujours là, donc plus rien ne le vérifiait.
 */
export type ChainLane = {
  chain: Chain
  positions: {
    position: number
    count: number
    /**
     * Depuis combien de jours, en médiane, les dossiers de cette étape n'ont pas
     * bougé. `null` quand PERSONNE n'y est — « zéro jour d'attente » et « aucun
     * dossier ici » sont deux faits différents, et l'un des deux serait faux.
     */
    medianDaysAtPosition: number | null | undefined
    /** Combien y attendent une décision humaine. */
    awaiting?: number | undefined
  }[]
  gates: { afterPosition: number; waiting: number }[]
  total: number
  /** Les dossiers arrêtés devant une porte : quelqu'un doit trancher. */
  awaitingDecision: number | undefined
  /** Les dossiers sans mouvement depuis plus d'une semaine, porte ou pas. */
  stalled: number | undefined
  /**
   * Les dossiers que le moteur ne sait PAS placer, par raison (#1507 §6).
   *
   * Jamais masqués, et jamais rangés à l'étape 1 : « si Bellum ne sait pas, il
   * le dit ». Optionnel pour la même raison que les autres champs neufs.
   */
  undetermined?: { reason: ChainUndeterminedReason; count: number }[] | undefined
}

/** Un dossier placé par la dérivation, avec de quoi l'afficher. */
type ChainSubjectRow = {
  subjectId: string
  /** Le NOM du dossier. `null` = la ligne n'existe plus — l'écran le nomme. */
  label: string | null
  movedAt: string | null
  /** Depuis combien de jours l'objet n'a pas bougé. `null` = date illisible. */
  days: number | null
  derivation: ChainDerivation
}

/** Le parcours d'UN dossier, pour sa fiche (#1505). */
type ChainForSubject = {
  chain: Chain
  projection: { subjectId: string; label: string | null; movedAt: string | null; derivation: ChainDerivation }
  days: number | null
  manual: { position: number; markedAt: string | null }[]
}

export const chainKeys = {
  board: () => ['chains', 'board'] as const,
  position: (chain: string, position: number) => ['chains', chain, position] as const,
  undetermined: (chain: string) => ['chains', chain, 'undetermined'] as const,
  subject: (type: string, id: string) => ['chains', 'subject', type, id] as const,
}

export const chainsApi = {
  board(): Promise<{ lanes: ChainLane[] }> {
    return apiFetch<{ lanes: ChainLane[] }>({ path: '/chains/board' })
  },
  atPosition(chainKey: string, position: number): Promise<{ items: ChainSubjectRow[] }> {
    return apiFetch<{ items: ChainSubjectRow[] }>({ path: `/chains/${chainKey}/position/${position}` })
  },
  undetermined(chainKey: string): Promise<{ items: ChainSubjectRow[] }> {
    // La position est ignorée par le serveur quand `undetermined=true` ; elle
    // reste dans le chemin parce que la route est la même — un second chemin
    // pour la même lecture divergerait au premier champ ajouté.
    return apiFetch<{ items: ChainSubjectRow[] }>({ path: `/chains/${chainKey}/position/1?undetermined=true` })
  },
  forSubject(subjectType: string, subjectId: string): Promise<{ chains: ChainForSubject[] }> {
    return apiFetch<{ chains: ChainForSubject[] }>({ path: `/chains/subject/${subjectType}/${subjectId}` })
  },
  toggleMark(body: { chainKey: ChainKey; subjectId: string; position: number; marked: boolean }) {
    return apiFetch<{ position: number; marked: boolean }, typeof body>({
      path: '/chains/marks',
      method: 'POST',
      body,
    })
  },
}

export function useChainBoard() {
  return useQuery({ queryKey: chainKeys.board(), queryFn: chainsApi.board, staleTime: 0, refetchOnMount: 'always' })
}

export function useChainPosition(chainKey: ChainKey | null, position: number | null) {
  return useQuery({
    queryKey: chainKeys.position(chainKey ?? 'none', position ?? 0),
    queryFn: () => chainsApi.atPosition(chainKey as string, position as number),
    enabled: Boolean(chainKey) && Boolean(position),
    select: response => response.items,
    staleTime: 0,
  })
}

/** Les dossiers que le moteur ne sait pas placer. Lus À LA DEMANDE : les charger
 *  pour sept pistes à l'affichage ferait sept lectures que personne n'a
 *  demandées. */
export function useChainUndetermined(chainKey: ChainKey | null) {
  return useQuery({
    queryKey: chainKeys.undetermined(chainKey ?? 'none'),
    queryFn: () => chainsApi.undetermined(chainKey as string),
    enabled: Boolean(chainKey),
    select: response => response.items,
    staleTime: 0,
  })
}

/**
 * Le parcours d'un dossier, sur SA fiche (#1505).
 *
 * Une LECTURE dérivée : la fiche ne peut rien y écrire, et il n'existe aucune
 * route pour le faire. Ce n'est pas une seconde barre de statut.
 */
export function useChainForSubject(subjectType: string | null, subjectId: string | null) {
  return useQuery({
    queryKey: chainKeys.subject(subjectType ?? 'none', subjectId ?? 'none'),
    queryFn: () => chainsApi.forSubject(subjectType as string, subjectId as string),
    enabled: Boolean(subjectType) && Boolean(subjectId),
    select: response => response.chains,
    staleTime: 0,
  })
}

/** Cocher un geste hors outil. La seule écriture de cet écran. */
export function useToggleChainMark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: chainsApi.toggleMark,
    // #3526 — on RETOURNE l'invalidation : la mutation n'est « terminée » qu'une
    // fois la lecture rafraîchie, la case locale ne rebondit donc pas.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chains'] }),
    onError: (error: Error) => toast.error(error.message),
  })
}

/**
 * La phrase d'un blocage, dans la langue de l'utilisateur.
 *
 * ⚠️ Elle vit ICI et pas dans deux écrans : « Aujourd'hui » et la page des
 * parcours la rendent tous les deux, et deux formulations pour le même fait
 * finiraient par se contredire sur le même dossier.
 *
 * ⚠️ Les libellés viennent du BLOCAGE lui-même, pas d'une seconde requête vers
 * le catalogue. Les chercher aurait rendu ce composant dépendant d'un
 * `QueryClient` — donc impossible à monter dans les tests de « Aujourd'hui »,
 * qui n'en fournissent pas — pour une donnée que le serveur avait déjà sous la
 * main.
 */
/**
 * Où ouvrir UN dossier d'un blocage (#2107.20-.25).
 *
 * ⚠️ Avant ce lot, le SEUL lien d'un blocage menait vers `/actions/chaines` —
 * la page des parcours, générique — quel que soit le dossier reconnu dans
 * `sample`. « Ne plus forcer à comprendre /actions/chaines » (#2107.20) :
 * chaque dossier nommé ouvre désormais SON objet, par `subjectType`, même
 * logique que `interventionHref` (`apps/web/src/features/briefing/cockpit.ts`).
 *
 * #2107.21 — `project` ouvrait la liste générique : à l'écriture du lot
 * #2107.20-.25, aucune fiche projet par identifiant n'existait dans ce dépôt
 * (`apps/web/src/routes/projects/` n'avait pas de `$id.tsx`, contrairement à
 * `accounts/`, `consultants/`, `missions/`) — inventer une route aurait fait
 * un lien mort, pire qu'un lien générique. `/projects/$id` existe désormais
 * (fondation de l'épopée #2801) : le motif qui retenait `project` sur la
 * liste a disparu, même logique que les quatre autres cas.
 */
export function chainBlockerSubjectHref(subjectType: ChainSubjectType, subjectId: string): string {
  switch (subjectType) {
    case 'account':
      return `/accounts/${subjectId}`
    case 'need':
      return `/projects/needs/${subjectId}`
    case 'consultant':
      return `/consultants/${subjectId}`
    case 'mission':
      return `/missions/${subjectId}`
    case 'project':
      return `/projects/${subjectId}`
    default:
      return '/pilotage/pipe'
  }
}

export function blockerSentence(blocker: ChainBlocker, locale: 'fr' | 'en'): string {
  return i18n.t(blocker.gate ? 'chains:blockers.awaiting' : 'chains:blockers.stalled', {
    count: blocker.count,
    step: blocker.stepLabel?.[locale] ?? String(blocker.position),
    chain: blocker.chainLabel?.[locale] ?? blocker.chainKey,
    days: Math.round(blocker.oldestDays),
  })
}
