import { z } from 'zod'

/**
 * #2381 — LAU-FINAL-095 « STOP CONDITIONS, REPLY DETECTION ET SUPPRESSION »
 * (issue #2381, registre `.claude/notes/registre-2026-09-20-chat-lot5.md`).
 *
 * « Arrêter automatiquement les actions futures lorsqu'un événement rend la
 * suite inutile, dangereuse ou inappropriée. » Deux listes FERMÉES, verbatim
 * de l'issue — un enum ne perd jamais de valeur et n'en insère jamais au
 * milieu (GA-08), donc l'ordre suit exactement celui du corps de l'issue.
 *
 * `outreach_transitions` (#2366.8, `outreach-canonical.ts`) porte déjà le
 * journal APPEND-ONLY des transitions de messages et d'appels. Ce module
 * étend son vocabulaire de SUJET à `sequence` (voir `OUTREACH_TRANSITION_SUBJECTS`)
 * au lieu d'ouvrir un second journal — une séquence arrêtée ou mise en pause
 * s'y écrit avec sa CAUSE, l'un des événements ci-dessous.
 */

/**
 * Les dix-sept événements d'ARRÊT — une séquence qui en reçoit un passe
 * `cancelled` : ses étapes futures ne partent plus, jamais une étape de plus
 * « pour être sûr » (doctrine, #2381.6).
 */
export const OUTREACH_SEQUENCE_STOP_EVENTS = [
  /** réponse entrante — tout message reçu, quel qu'il soit, arrête la suite. */
  'reply_received',
  /** réponse positive — arrête ET crée une qualification (#2381.6). */
  'reply_positive',
  /** refus. */
  'refusal',
  /** opt-out. */
  'opt_out',
  /** rendez-vous réservé. */
  'meeting_booked',
  /** appel qualifié. */
  'call_qualified',
  /** mauvaise personne. */
  'wrong_person',
  /** changement d'entreprise. */
  'company_changed',
  /** adresse invalide. */
  'invalid_address',
  /** bounce permanent. */
  'hard_bounce',
  /** besoin fermé. */
  'need_closed',
  /** opportunité perdue. */
  'opportunity_lost',
  /** contact retiré. */
  'contact_removed',
  /** arrêt manuel. */
  'manual_stop',
  /** compte écarté. */
  'account_excluded',
  /** séquence remplacée. */
  'sequence_replaced',
  /** délai maximal atteint. */
  'max_delay_reached',
] as const
export const outreachSequenceStopEventSchema = z.enum(OUTREACH_SEQUENCE_STOP_EVENTS)
export type OutreachSequenceStopEvent = z.infer<typeof outreachSequenceStopEventSchema>

/**
 * Les huit événements de PAUSE — une séquence qui en reçoit un passe
 * `paused` : elle ne reprend qu'après résolution ou validation EXPLICITE
 * (`OutreachService.resume`, geste utilisateur, #2381.8 déjà là), jamais
 * automatiquement.
 */
export const OUTREACH_SEQUENCE_PAUSE_EVENTS = [
  /** connecteur expiré. */
  'connector_expired',
  /** permission retirée. */
  'permission_revoked',
  /** réponse ambiguë. */
  'ambiguous_reply',
  /** contact à vérifier. */
  'contact_to_verify',
  /** absence temporaire (OOO) — jamais considérée comme une réponse commerciale (#2381.5). */
  'temporary_absence',
  /** litige. */
  'dispute',
  /** collision équipe. */
  'team_collision',
  /** action manuelle en attente. */
  'manual_action_pending',
  /**
   * #2374.19 (tranché sans Louis, 26/09/2026) — le contact a répondu « pas
   * maintenant » : AJOUTÉ après #2381 (GA-08, jamais au milieu), pas dans son
   * corps d'origine. Avant cette entrée, `not_now` déclenchait l'arrêt
   * générique `reply_received` — la séquence s'annulait pour de bon, sans
   * aucun chemin de retour : reprendre plus tard demandait d'en recréer une de
   * zéro, à la main, poste par poste. Une pause porte le contact jusqu'à
   * `OutreachService.resume()` (geste humain déjà là, #2381.8) — qui revérifie
   * DÉJÀ le poste (`assertNotHistoricalContact`) avant de reprendre. Contexte,
   * signal et pertinence restent NON re-vérifiés à la reprise (#2374.19 les
   * réclame aussi) : la construction d'un planificateur qui les évalue lui-même
   * à échéance reste un chantier séparé — voir #3061.
   */
  'not_now_deferred',
] as const
export const outreachSequencePauseEventSchema = z.enum(OUTREACH_SEQUENCE_PAUSE_EVENTS)
export type OutreachSequencePauseEvent = z.infer<typeof outreachSequencePauseEventSchema>

/**
 * Les onze classes de réponse (#2381.4), verbatim de l'issue. « Le modèle
 * peut PROPOSER la classe » — mais {@link outreachReplyEffect} n'écoute
 * jamais un avis seul : c'est une table FIXE, déterministe, qui décide des
 * conséquences fortes.
 */
export const OUTREACH_REPLY_CLASSES = [
  'positive',
  'neutral',
  'question',
  'orientation',
  'not_now',
  'refusal',
  'opt_out',
  'wrong_person',
  'out_of_office',
  'bounce',
  'unknown',
] as const
export const outreachReplyClassSchema = z.enum(OUTREACH_REPLY_CLASSES)
export type OutreachReplyClass = z.infer<typeof outreachReplyClassSchema>

/** La conséquence d'une classe de réponse — jamais devinée, toujours cette table. */
export type OutreachReplyEffect =
  | { action: 'stop'; event: OutreachSequenceStopEvent; createsQualification: boolean }
  | { action: 'pause'; event: OutreachSequencePauseEvent }

/**
 * #2381.4/.5/.6 — la conséquence DÉTERMINISTE d'une classe de réponse.
 *
 * Deux exceptions à la règle « toute réponse arrête » :
 *  - `out_of_office` MET EN PAUSE (reprise au retour), jamais un arrêt —
 *    « ne pas considérer automatiquement comme une réponse commerciale »
 *    (#2381.5) ;
 *  - `positive` arrête ET crée une qualification (#2381.6) — les deux à la
 *    fois, jamais l'un sans l'autre.
 *
 * Les six autres classes réelles (`refusal`, `opt_out`, `wrong_person`,
 * `bounce`) portent leur événement d'arrêt propre quand l'issue en nomme un ;
 * les classes qui portent du contenu LISIBLE mais sans signal dédié
 * (`neutral`, `question`, `orientation`, `not_now`) arrêtent sur l'événement
 * générique « réponse entrante » — un humain a répondu, la suite automatique
 * s'arrête, point.
 *
 * `unknown` est un TROISIÈME cas, distinct des deux premiers : un message est
 * bien arrivé (`direction: inbound` réel), mais rien n'y est lisible. Ce
 * n'est ni un signal fort qui justifie un arrêt définitif, ni un non-événement
 * — c'est l'événement de pause « réponse ambiguë » (#2381.2) : la suite
 * automatique s'arrête, réversible après revue humaine, jamais un arrêt
 * qu'aucune lecture ne motive.
 */
/**
 * #3061 — au-delà, une pause `not_now_deferred` mérite d'être reconsidérée.
 * Tranché sans Louis (26/09/2026) : même famille de délai que
 * `AVAILABILITY_REVALIDATION_DAYS` (`matching/pushable.ts`, 60 jours pour une
 * disponibilité déclarée), mais une CONSTANTE À PART — un « pas maintenant »
 * commercial et une disponibilité RH ne sont pas la même horloge, et GA-26
 * n'exige qu'un réglage par CHOSE réglée, pas un partage entre deux choses qui
 * se ressemblent.
 */
export const NOT_NOW_REVALIDATION_DAYS = 30

/**
 * Vrai passé ce délai depuis la pause. Ne dit RIEN de plus : ce n'est pas une
 * reprise, ni une revérification du poste/contexte/signal/pertinence — juste
 * le calcul déterministe dont tout planificateur futur (#3061, chantier séparé)
 * comme tout écran actuel a besoin pour savoir QUAND en parler à un humain.
 */
export function notNowRevalidationDue(pausedAt: string | Date, now: Date): boolean {
  const at = pausedAt instanceof Date ? pausedAt.getTime() : Date.parse(pausedAt)
  if (Number.isNaN(at)) return false
  return now.getTime() - at > NOT_NOW_REVALIDATION_DAYS * 24 * 60 * 60 * 1000
}

export function outreachReplyEffect(cls: OutreachReplyClass): OutreachReplyEffect {
  switch (cls) {
    case 'out_of_office':
      return { action: 'pause', event: 'temporary_absence' }
    case 'unknown':
      return { action: 'pause', event: 'ambiguous_reply' }
    case 'positive':
      return { action: 'stop', event: 'reply_positive', createsQualification: true }
    case 'refusal':
      return { action: 'stop', event: 'refusal', createsQualification: false }
    case 'opt_out':
      return { action: 'stop', event: 'opt_out', createsQualification: false }
    case 'wrong_person':
      return { action: 'stop', event: 'wrong_person', createsQualification: false }
    case 'bounce':
      return { action: 'stop', event: 'hard_bounce', createsQualification: false }
    case 'neutral':
    case 'question':
    case 'orientation':
      return { action: 'stop', event: 'reply_received', createsQualification: false }
    // #2374.19 — SEULE exception à « toute réponse arrête » en dehors de
    // `out_of_office`/`unknown` : « pas maintenant » n'est pas un refus, c'est
    // une échéance. Une pause, jamais un arrêt — voir `not_now_deferred`.
    case 'not_now':
      return { action: 'pause', event: 'not_now_deferred' }
  }
}
