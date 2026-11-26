/**
 * #2442.3 / #2442.4 — ce que l'API dit de SON tour à la trace du service IA.
 *
 * L'identifiant de trace voyage déjà : c'est le correlation-id (middleware →
 * `HttpClient.streamSse` → `x-correlation-id` → `derive_trace_id` côté IA,
 * #2442.2). Une SECONDE convention d'identifiant casserait cette unité ; ce
 * module n'ajoute donc que ce que seule l'API sait :
 *
 *  · l'identifiant du MESSAGE (`turnId`, la moitié de la clé des cartes) ;
 *  · la durée de ses étapes AVANT le service IA — `auth`, `quota`, `context` —
 *    que la route IA range dans le récapitulatif du tour (`stageMs.api.<étape>`).
 *
 * Que des nombres et un UUID : ni texte, ni identifiant de personne ou
 * d'espace (la trace les porte PSEUDONYMISÉS, côté IA). Une étape jamais
 * mesurée n'a pas de clé — jamais « 0 ».
 *
 * `auth` (épopée #2879, #2442.4 — span manquant : « auth avant le contrôleur »)
 * ne se mesure pas comme les deux autres : un guard Nest s'exécute AVANT que le
 * contrôleur n'instancie cette horloge, donc rien ne peut y poser un `.lap()`
 * directement. `startedAt` (l'instant de RÉCEPTION de la requête, posé par
 * `correlationIdMiddleware` — le seul maillon qui s'exécute avant tout guard)
 * sert de point de départ à l'horloge plutôt qu'à l'instanciation : le premier
 * `.lap('auth')` mesure alors tout ce qui s'est écoulé entre la réception et
 * l'entrée dans le contrôleur — routage et guards compris. Sans `startedAt`
 * (un appel direct au contrôleur, hors d'une vraie requête HTTP), l'horloge
 * démarre normalement et l'appelant ne pose PAS ce lap — voir `ia-proxy.controller.ts`.
 */

export const CHAT_TURN_TRACE_HEADER = 'x-bellum-turn'

/** Liste FERMÉE : le service IA ignore tout autre nom. */
const CHAT_TURN_STAGES = ['auth', 'quota', 'context'] as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ChatTurnClock {
  private last: number
  private readonly laps = new Map<(typeof CHAT_TURN_STAGES)[number], number>()

  constructor(
    private readonly now: () => number = Date.now,
    startedAt?: number,
  ) {
    this.last = startedAt ?? now()
  }

  /** Clôt l'étape nommée : sa durée court depuis l'étape précédente. */
  lap(stage: (typeof CHAT_TURN_STAGES)[number]): void {
    const at = this.now()
    this.laps.set(stage, Math.max(0, Math.round(at - this.last)))
    this.last = at
  }

  /** L'en-tête du tour ; rien à dire → aucun en-tête (jamais une valeur vide). */
  header(turnId: string): Record<string, string> {
    const parts: string[] = []
    if (UUID_PATTERN.test(turnId)) parts.push(`id=${turnId}`)
    for (const stage of CHAT_TURN_STAGES) {
      const ms = this.laps.get(stage)
      if (ms !== undefined) parts.push(`${stage}=${ms}`)
    }
    return parts.length ? { [CHAT_TURN_TRACE_HEADER]: parts.join(';') } : {}
  }
}
