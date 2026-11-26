import type { BriefingBlockState } from '@bellum/contracts'

/**
 * #1901.2 — LA PAGE, LA BULLE, LE BRIEF ET LE VOCAL SONT LE MÊME SYSTÈME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI CONVERGEAIT DÉJÀ, ET CE QUI NE CONVERGEAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 16/09/2026. La page « Aujourd'hui » (`BriefingPage`) et le brief
 * dans la voix de Laura (`features/chat/lib/morning-brief.ts`) partagent DÉJÀ
 * l'essentiel : la même source (`DailyBriefing` servi par le serveur), le même
 * classement (aucun second tri côté écran), le même vocabulaire de geste
 * (`BRIEFING_ACTION_CTA`) et les mêmes libellés de fait (les clés
 * `briefing.actions.*`, que `morning-brief` traduit dans l'espace de noms
 * `briefing`). Le vocal, lui, n'a pas de rendu propre : il transcrit puis entre
 * dans le tour ordinaire (GA-237), donc il ne peut pas diverger.
 *
 * Ce qui divergeait est la DÉRIVATION : « cette source est-elle lue ? » et
 * surtout « cet accès est-il ÉTEINT, ou juste en panne ? ». Deux gestes
 * différents — le second se répare tout seul, le premier jamais tant que
 * personne ne rouvre l'accès —, et deux écrans qui les décidaient chacun de leur
 * côté. Une dérivation vit à UN endroit ; ce fichier est cet endroit.
 *
 * ⚠️ CE QUI NE CONVERGE PAS, ET NE DOIT PAS : la PHRASE. La page parle de
 * l'écran (« Aucun agenda connecté. Connecte-le pour voir tes rendez-vous ici »),
 * Laura parle à la première personne (« Ton agenda n'est pas connecté : je ne
 * vois pas tes rendez-vous »). Fusionner les deux textes ferait perdre la voix,
 * qui est le produit. Ce qui se partage est le FAIT ; le ton reste à chacun.
 */

/**
 * ⚠️ LE PRÉDICAT ÉTAIT COMPARÉ À UNE VALEUR QUE LE PRODUIT N'ÉMET PAS.
 *
 * `BlockState.tsx` testait `reason === 'agenda_provider_api_disabled'`. Le
 * producteur réel est `agendaReadFailure` → `connectorFailure`
 * (`apps/api/src/common/connector-error.ts:74`), qui pose `reason: input.code`,
 * c'est-à-dire **`provider_api_disabled`** — sans préfixe. Le prédicat était
 * donc TOUJOURS FAUX en production, et l'écran disait « Ton agenda n'a pas
 * répondu. Rien n'est perdu : réessaie dans un moment. » pour un accès que
 * personne n'allait rouvrir. C'est exactement l'incident que le commentaire de
 * `briefing.service.ts` raconte (« le bloc agenda est resté Indisponible pendant
 * des jours en production »), et il était encore vivant côté écran.
 *
 * Il était invisible parce que la fixture de `briefing.service.spec.ts`
 * INVENTAIT la valeur : elle construisait l'exception à la main au lieu de
 * passer par le producteur.
 *
 * Le préfixé reste accepté — un ancien enregistrement peut le porter, et
 * l'accepter ne coûte rien ; l'inverse, lui, coûtait la vérité à l'écran.
 */
const PROVIDER_DISABLED_REASONS: readonly string[] = [
  'provider_api_disabled',
  'agenda_provider_api_disabled',
  'mailbox_provider_api_disabled',
]

/**
 * L'accès est-il ÉTEINT côté fournisseur ? Une seule réponse pour tous les
 * rendus du brief — la page, la bulle, le brief du matin.
 */
export function briefingAccessIsSwitchedOff(reason: string | null | undefined): boolean {
  return Boolean(reason) && PROVIDER_DISABLED_REASONS.includes(reason as string)
}

/**
 * Le bloc a-t-il été LU ? `partial` porte du contenu : ses éléments comptent, et
 * sa phrase dit ce qui manque à côté — jamais à la place.
 *
 * La règle était écrite deux fois : `isRead` dans `morning-brief.ts`, et les
 * retours anticipés de `BlockStateNotice`. Deux copies d'une règle divergent.
 */
export function briefingBlockIsRead(state: BriefingBlockState): boolean {
  return state === 'ready' || state === 'partial'
}
