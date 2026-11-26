/**
 * Le contrat de fil entre le widget et `/api/chat`.
 *
 * Écrit une fois, importé des deux côtés : c'est ce qui évite qu'un champ
 * renommé côté serveur laisse un bouton mort côté navigateur. Le score de
 * qualification, lui, ne traverse JAMAIS cette frontière — le rapport le pose
 * deux fois comme interne, et un visiteur qui découvrirait qu'il vaut 4 points
 * n'aurait pas tort de mal le prendre.
 */

import type { LeadState } from './routing'

/** Les événements de mesure du §9. Énumération fermée : une chaîne libre
 *  produirait un tableau de bord illisible en trois semaines. */
export type ChatAnalyticsEvent =
  | 'chat_widget_viewed'
  | 'chat_opened'
  | 'chat_first_reply'
  | 'intent_detected'
  | 'qualification_started'
  | 'qualification_completed'
  | 'demo_clicked'
  | 'calendly_clicked'
  | 'lead_created'
  | 'human_handoff'
  | 'pricing_answered'
  | 'integration_answered'
  | 'chat_abandoned'
  | 'chat_refusal'
  /** Le §4.14 mesure le taux d'ouverture du widget : sans distinguer une
   *  ouverture AUTOMATIQUE d'un clic, le chiffre mélange le levier et son
   *  résultat, et « > 35 % des visiteurs » ne veut plus rien dire. */
  | 'chat_auto_opened'
  | 'chat_returning_visitor'
  /** Une objection qu'aucune entrée de la bibliothèque ne couvre (§9, « top 20
   *  des objections non couvertes »). Voyage avec le THÈME en propriété — jamais
   *  avec la phrase du visiteur. */
  | 'objection_uncovered'
  /** Le visiteur a accepté que la conversation prépare son espace (§11, P2). */
  | 'prefill_accepted'

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatRequestBody = {
  /** Identifiant de session tiré côté navigateur — sert la borne de fréquence
   *  et l'idempotence des notifications, jamais l'identification d'une personne. */
  sessionId: string
  locale: string
  /** La page d'où vient le visiteur (chemin, pas URL complète). */
  page?: string
  messages: ChatTurn[]
  /** Ce que la session sait déjà. Re-validé côté serveur, jamais pris tel quel. */
  lead?: LeadState
}

/** L'appel à l'action que le serveur recommande. Le libellé est choisi par le
 *  client dans ses traductions ; le serveur ne renvoie que la nature et l'URL. */
export type ChatCta = {
  kind: 'demo' | 'calendly' | 'signup' | 'support' | 'human' | 'resource'
  url: string | null
}

export type ChatResponseBody = {
  /** La réponse entière — conservée pour ce qui la lit d'un bloc. */
  reply: string
  /**
   * La réponse découpée en bulles successives (§4.11), une à trois.
   *
   * Le découpage est fait par le SERVEUR et non par le navigateur : c'est le
   * serveur qui connaît le plafond, et un client qui découperait lui-même
   * pourrait en produire dix.
   */
  messages: string[]
  /** Les clés de réponse rapide à proposer sous la réponse — traduites par le
   *  navigateur, comme le libellé du CTA. */
  quickReplies: string[]
  cta: ChatCta | null
  /** L'état de qualification mis à jour, à renvoyer au tour suivant. */
  lead: LeadState
  /** Les événements que le navigateur doit déclencher (le serveur ne voit pas
   *  Plausible ; c'est le navigateur qui mesure). */
  events: ChatAnalyticsEvent[]
  /**
   * Les propriétés à joindre à certains événements.
   *
   * Le serveur en connaît une que le navigateur ne peut pas connaître : le
   * THÈME d'une objection non couverte, calculé sur le message du visiteur. La
   * phrase, elle, ne traverse pas cette frontière — seul le mot du vocabulaire
   * fermé la traverse, et il ne désigne personne.
   */
  eventProps?: Partial<Record<ChatAnalyticsEvent, Record<string, string>>>
  /**
   * Ce que la conversation transmettrait à l'espace si le visiteur cliquait
   * « créer mon compte » — et RIEN de plus (§11, P2).
   *
   * `fields` est la liste blanche des huit axes de qualification, `withheld` ce
   * qu'on avait et qu'on garde ici. Le widget montre les deux AVANT le clic :
   * c'est ce qui rend « aucune donnée personnelle ne voyage sans que le visiteur
   * le sache » vrai, plutôt que promis.
   */
  prefill?: { fields: Record<string, string>; withheld: string[]; query: string }
}

export type ChatErrorBody = {
  /** Une clé de traduction, pas une phrase : le serveur ne connaît pas la
   *  langue d'affichage mieux que le client, et une phrase en dur ne se traduit
   *  jamais après coup. */
  error: 'not_configured' | 'empty' | 'too_long' | 'rate_limited' | 'injection' | 'unavailable'
  /**
   * Les événements à déclencher malgré le refus.
   *
   * Un refus est justement ce que le §9 demande de compter (`chat_refusal`,
   * indicateur de sécurité) — et c'est le seul chemin où le serveur ne rend
   * aucune réponse. Sans ce champ, la seule mesure qui compte les injections et
   * les abus est celle qui n'existe pas : le tableau de bord affiche zéro
   * tentative, ce qui se lit « personne n'attaque » et non « on ne regarde pas ».
   */
  events?: ChatAnalyticsEvent[]
}

/** Bornes de la conversation transmise. Un fil illimité, c'est une facture
 *  illimitée : le contexte est renvoyé en entier à chaque tour. */
export const MAX_TURNS_SENT = 20
