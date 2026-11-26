/**
 * L'appel à l'action que le serveur recommande — extrait de `route.ts` par le
 * ticket BEL-LAU-905 du PDF 10.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le §2 du PDF 10 reproche à Laura d'avoir diffusé l'adresse personnelle du
 * fondateur, et remonte la cause à une seule ligne : le message d'échec de
 * transmission renvoyé au modèle. Il y en avait une SECONDE, que le document ne
 * voit pas — le bouton `support` / `human` portait un `mailto:` construit sur la
 * même adresse.
 *
 * Elle est plus grave que la première, parce qu'elle ne passe par aucun modèle :
 * ni le prompt, ni le filtre de sortie, ni aucune des huit gardes du §7.2 ne
 * regardent un champ structuré. C'est la famille de défauts que le dépôt connaît
 * bien — **une garde qui lit le texte ne voit pas la donnée à côté**.
 *
 * D'où ce module : le calcul du CTA devient PUR et testable, et la garde GL-01
 * porte sur la réponse entière (`reply` ET `cta.url`), pas sur son seul texte.
 */

import type { ChatCta } from './contract'
import type { ChatPrefill } from './prefill'
import { withPrefill } from './prefill'
import type { Route } from './routing'

export type CtaLinks = {
  demoUrl: string
  /** Le lien de réservation, ou `null` quand l'opérateur ne l'a pas posé. */
  bookingUrl: string | null
  appUrl: string
  siteUrl: string
}

/**
 * Où mène ce visiteur.
 *
 * Le repli du lien de réservation n'est pas décoratif : sans
 * `NEXT_PUBLIC_CALENDLY_URL`, un bouton « Réserver un échange » sans destination
 * est un bouton mort — et c'est celui qu'on propose au visiteur le plus
 * qualifié. Le formulaire du site envoie déjà un e-mail à l'équipe.
 *
 * `support` et `human` mènent au MÊME formulaire, et surtout pas à une adresse :
 * Laura transmet elle-même, par son outil. Demander au visiteur d'écrire à une
 * boîte, c'est lui faire refaire le travail — en plus de sortir une adresse.
 *
 * `prefill` (chantier n°5, §11 P2) n'accroche son contexte QUE sur le lien de
 * création de compte — c'est le seul CTA que le visiteur peut cliquer pour
 * faire naître un espace. Un lien mailto, une démo libre ou une réservation
 * n'ont rien à en faire : rien ne se crée sans le geste précis qui suit.
 */
export function ctaFor(route: Route, links: CtaLinks, prefill?: ChatPrefill): ChatCta {
  const contactUrl = links.bookingUrl ?? `${links.siteUrl}/beta`
  switch (route) {
    case 'demo':
      return { kind: 'demo', url: links.demoUrl }
    case 'calendly':
      return { kind: 'calendly', url: contactUrl }
    case 'signup':
      return {
        kind: 'signup',
        url: prefill ? withPrefill(`${links.appUrl}/signup`, prefill) : `${links.appUrl}/signup`,
      }
    case 'support':
    case 'human':
      return { kind: route, url: contactUrl }
    default:
      return { kind: 'resource', url: `${links.siteUrl}/product` }
  }
}
