import type { TFunction } from 'i18next'
import type { ActionDispatchClaim } from '@bellum/contracts'

/**
 * « CETTE ACTION A DÉJÀ ÉTÉ LANCÉE » — PAR QUI, ET À QUELLE HEURE (#1959.9, #1959.10).
 *
 * Le routeur refuse de réexécuter un geste dont la clé est déjà réclamée : c'est
 * le point de l'idempotence. Mais le message rendu à l'écran était « Une action
 * identique (même clé) est déjà en cours de traitement » — personne n'était
 * nommé, aucune heure n'était donnée, et la personne devant l'écran ne savait ni
 * à qui parler ni si l'effet avait eu lieu. Le serveur porte désormais les deux
 * informations (`ActionDispatchClaim`) ; ce module les met en mots.
 *
 * Trois interlocuteurs possibles, et la différence compte :
 *  - SOI — « vous l'aviez déjà lancée » : la personne n'a personne à aller voir ;
 *  - QUELQU'UN — le nom, parce qu'une action lancée par un collègue se règle en
 *    lui parlant, pas en recliquant ;
 *  - LE SYSTÈME (`actor: null`) — on nomme la CAPACITÉ, jamais un inconnu :
 *    un séquenceur ou une routine dispatchent au même titre qu'un clic.
 *
 * ⚠️ `completedAt: null` veut dire « l'effet est ENCORE EN VOL », jamais
 * « exécuté à une heure qu'on ignore » : les deux phrases ne disent pas la même
 * chose à un commercial, et écrire la seconde à la place de la première ferait
 * croire qu'il peut passer à la suite.
 *
 * ⚠️ Une heure qu'on ne sait pas LIRE ne produit AUCUN message : mieux vaut
 * laisser la raison d'origine du serveur que d'inventer un moment. « Non mesuré
 * n'est jamais 0 », appliqué au temps.
 */
export function claimNotice(claim: ActionDispatchClaim | undefined, t: TFunction, locale: string): string | null {
  if (!claim) return null
  const who = claim.self ? 'self' : claim.actor ? 'by' : 'system'
  if (claim.completedAt === null) {
    // #1959.10 — encore en vol : on le DIT, on ne date rien.
    return t(`pending.claimed.${who}Running`, { actor: claim.actor ?? '' })
  }
  const time = formatTime(claim.completedAt, locale)
  if (time === null) return null
  // #1959.10 — l'heure RÉELLE d'exécution, celle que la base a enregistrée.
  return t(`pending.claimed.${who}At`, { actor: claim.actor ?? '', time })
}

function formatTime(iso: string, locale: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
  } catch {
    // Une étiquette de langue que l'environnement refuse ne doit pas faire
    // tomber une carte — mais le repli n'est PAS la locale du runtime : elle
    // écrirait l'heure dans la langue du navigateur sur un écran qui parle
    // celle de l'app (garde `locale-is-the-app-not-the-runtime`). Aucune heure
    // lisible : aucun message, et la raison d'origine du serveur reste.
    return null
  }
}
