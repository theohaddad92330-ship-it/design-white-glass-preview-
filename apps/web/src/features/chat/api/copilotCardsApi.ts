import type {
  CardGesture,
  CardPreview,
  CardResult,
  CopilotCardState,
  PendingChatAction,
  PlanLaunchMode,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #1998 — CE QU'UNE CARTE D'ACTION OS EST SUR LE FIL.
 *
 * Forme exacte servie par l'API (`CardView`, `apps/api/src/modules/action-os/
 * copilot-card.service.ts`), en camelCase — contrairement à `pending_actions`,
 * qui est du JSON de modèle relayé tel quel. Elle arrive par DEUX portes, et les
 * deux comptent :
 *  - `data.context.cards` à la fin d'un tour (`withTurnCards`) ;
 *  - `message.cards` au rechargement du fil (`GET /ia/chat/messages`), ce qui
 *    est la raison d'être de la persistance : l'état SURVIT au rechargement.
 *
 * ⚠️ On ne déclare ici que ce que l'écran LIT. `estimatedCredits` n'en fait pas
 * partie exprès : c'est une colonne à défaut `0`, et « non annoncé » n'est jamais
 * « 0 » (GA-18). Le coût annoncé d'une carte, c'est `preview.costCredits`, qui
 * est `null` quand il n'est pas mesuré.
 */
export type CopilotCardWire = {
  id: string
  /** Ce que Laura a proposé, inchangé. `null` pour une carte sans proposition relisible. */
  action: PendingChatAction | null
  state: CopilotCardState
  /**
   * Les gestes que le SERVEUR offre dans cet état (`cardAllowedGestures`). L'écran
   * les lit, il ne les déduit pas : c'est ce qui garantit qu'on ne propose pas
   * « réessayer » après un résultat inconnu, ni « annuler » sur une carte partie.
   */
  allowedGestures: readonly CardGesture[]
  /** Les huit lignes de #1930. `null` sur une carte `suggested` — rien à valider. */
  preview: CardPreview | null
  /** Les huit champs d'après-coup de #1931. `null` tant que rien n'a eu lieu. */
  result: CardResult | null
  snoozedUntil: string | null
  expiresAt: string | null
  turnId: string | null
  /** Le rang de la proposition dans sa réponse — l'ordre d'affichage du fil. */
  proposalIndex: number | null
  primary: boolean
  /**
   * #1952.24 — la page qui POSSÈDE le résultat (le compte). Distinct de
   * `result.externalRef`, qui pour l'analyse suivie porte le jobId — jamais
   * une URL. `null` quand le run ne tient à aucun compte.
   */
  accountId: string | null
}

type GestureBody =
  | Record<string, never>
  | { reason: string }
  | { until: string }
  | { patch: Readonly<Record<string, string>> }

function gesture(runId: string, name: CardGesture, body: GestureBody): Promise<CopilotCardWire> {
  return apiFetch<{ card: CopilotCardWire }, GestureBody>({
    // L'identifiant est un UUID côté serveur, mais il vient d'une réponse réseau :
    // il s'encode comme tout segment de chemin construit à partir d'une donnée.
    path: `/action-os/cards/${encodeURIComponent(runId)}/${name}`,
    method: 'POST',
    body,
  }).then(response => response.card)
}

const EMPTY: Record<string, never> = {}

/**
 * Les gestes d'une carte — les routes que l'API sert déjà (#1931 L2).
 *
 * Chacun rend la carte RELUE : l'état suivant vient du serveur, jamais d'une
 * machine à états locale. C'est ce qui fait qu'un rechargement de page retrouve
 * la carte là où elle en était.
 *
 * #1930.11 — `modify` en fait partie depuis le 16/09/2026. Il exigeait un
 * `patch`, donc une surface d'édition ; elle existe (`copilot-card-edit.ts` dit
 * quels champs une proposition laisse réécrire, `CopilotCards.tsx` les rend).
 * Le serveur reste seul juge : il refait passer la proposition fusionnée par
 * `pendingChatActionSchema`, refuse un changement de type, et RECALCULE la
 * prévisualisation et le coût — l'écran n'en devine aucun.
 */
export const copilotCardsApi = {
  /** Le clic EST la décision (geste d'utilisateur = auto-approuvé). */
  confirm(runId: string): Promise<CopilotCardWire> {
    return gesture(runId, 'confirm', EMPTY)
  },
  reject(runId: string, reason?: string): Promise<CopilotCardWire> {
    return gesture(runId, 'reject', reason ? { reason } : EMPTY)
  },
  /** Sans date, c'est le serveur qui la choisit — l'écran n'a pas à la deviner. */
  snooze(runId: string, until?: string): Promise<CopilotCardWire> {
    return gesture(runId, 'snooze', until ? { until } : EMPTY)
  },
  /** SEULEMENT après un échec : un résultat inconnu n'est pas un échec (doctrine). */
  retry(runId: string): Promise<CopilotCardWire> {
    return gesture(runId, 'retry', EMPTY)
  },
  cancel(runId: string, reason?: string): Promise<CopilotCardWire> {
    return gesture(runId, 'cancel', reason ? { reason } : EMPTY)
  },
  /**
   * #1930.11 — modifier AVANT lancement. Le `patch` ne porte que les champs que
   * `copilot-card-edit.ts` déclare modifiables ; le serveur revalide la
   * proposition entière et rend la carte relue, prévisualisation recalculée.
   */
  modify(runId: string, patch: Readonly<Record<string, string>>): Promise<CopilotCardWire> {
    return gesture(runId, 'modify', { patch })
  },
  /**
   * #1950.14 / #1950.18 — le geste de PLAN, sur les cartes d'un tour : « Lancer
   * tout le plan » (`all`) ou « Seulement la 1re étape » (`first`). Le serveur
   * enchaîne carte par carte par `confirm` et rend les cartes RELUES, les rangs
   * lancés et ses refus (avec leur phrase).
   */
  runPlan(turnId: string, mode: PlanLaunchMode): Promise<CopilotPlanRun> {
    return apiFetch<CopilotPlanRun, { mode: PlanLaunchMode }>({
      path: `/action-os/cards/plan/${encodeURIComponent(turnId)}/run`,
      method: 'POST',
      body: { mode },
    })
  },
}

/** Forme exacte de `PlanRunOutcome` (`copilot-card.service.ts`). */
export type CopilotPlanRun = {
  cards: CopilotCardWire[]
  launched: number[]
  refused: { rank: number | null; reason: string }[]
}
