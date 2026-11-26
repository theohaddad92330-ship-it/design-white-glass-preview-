import type { TFunction } from 'i18next'
import { composeMorningBrief, type MorningBriefInput } from './morning-brief'

/**
 * LA PREMIÈRE PRISE DE PAROLE DE LAURA — #1947 et #1908.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ DEMANDÉ
 * ─────────────────────────────────────────────────────────────────────────
 * #1947 : « au bout de 3 secondes Laura m'envoie le premier message pour
 * initier la conversation ». #1908 : « quand un utilisateur ouvre un fil
 * vierge, ne pas afficher uniquement un écran vide et des chips ». Les deux
 * portent sur le même geste ; ils partagent donc une seule phrase, choisie ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ LIVRÉ, ET CE QUI NE L'A PAS ÉTÉ
 * ─────────────────────────────────────────────────────────────────────────
 * - **Aucun appel au modèle.** Une amorce générée coûterait un message du
 *   plafond quotidien À CHAQUE clic sur « Demander à Laura » — cinquante clics
 *   et Laura se tait pour la journée. La phrase est composée ici.
 * - **Rien d'affirmé qui ne soit CHARGÉ.** #1908 l'exige (« aucune donnée non
 *   vérifiée dans cette amorce ») et le dépôt l'a déjà payé : un compte encore
 *   en chargement vaut `null`, pas zéro. « Je connais encore peu ton
 *   activité » ne se dit que lorsque TOUT a été lu et que tout est vide ; avant,
 *   la phrase reste neutre.
 * - **Pas de « depuis ta dernière connexion, deux comptes ont bougé ».**
 *   L'exemple de #1908 suppose un fil des changements par utilisateur : c'est
 *   le brief du matin (#1936), un autre sujet. L'écrire ici avec des nombres
 *   devinés serait exactement la donnée inventée que la doctrine refuse.
 *   Depuis le lot 7B, ce brief EXISTE : à la 1re ouverture du jour, `Chat`
 *   passe le `DailyBriefing` lu (`morningBrief`) et la phrase devient les
 *   trois blocs de `morning-brief.ts` — composés de la même façon, sans modèle.
 * - **Arrivée depuis l'accueil de fin d'onboarding** (#1921.9, `justOnboarded`) :
 *   Laura prend le relais avec la phrase de passage de main, sans rien affirmer
 *   de ce qu'elle aurait « compris » — elle propose de le vérifier.
 * - **Le prénom vient du profil**, jamais « Théo » : l'exemple de l'issue est
 *   un exemple.
 * - **En démonstration, la phrase dit que c'est une démonstration** (#1942) :
 *   seules les questions du script y ont une réponse, l'amorce y renvoie.
 */

/** Le délai que #1947 demande, mot pour mot. */
export const LAURA_OPENER_DELAY_MS = 3_000

export type LauraOpenerInput = {
  /** `useFirstName` — la chaîne vide quand le profil n'en a pas. */
  firstName: string
  isDemo: boolean
  /** Le compte en portée, quand son nom est connu. */
  accountName: string | null
  /** Le compte du SERVEUR ; `null` tant qu'il n'est pas lu. */
  portfolioCount: number | null
  /** Au moins un consultant LU dans le vivier. */
  hasVivier: boolean
  /** Toutes les lectures de l'accueil ont abouti (`LauraHomeContext.settled`). */
  settled: boolean
  /** #1921.9 — l'utilisateur arrive de l'accueil de fin d'onboarding (`/chat?from=welcome`). */
  justOnboarded?: boolean
  /**
   * #1936 — la 1re ouverture du jour : le brief lu (ou `briefing: null` s'il
   * n'a pas pu l'être). Absent ou `null` = pas la première du jour.
   */
  morningBrief?: MorningBriefInput | null
}

export function lauraOpener(t: TFunction<'chat'>, input: LauraOpenerInput): string {
  // #1936.1 — la 1re ouverture du jour : le brief en trois blocs REMPLACE l'amorce courte.
  if (input.morningBrief) {
    const brief = composeMorningBrief(t, { ...input.morningBrief, firstName: input.firstName })
    // #1942 — en démonstration, le brief se compose des données de la salle, et le DIT.
    return input.isDemo ? `${brief}\n\n${t('opener.demo')}` : brief
  }
  // #1921.9 — « puis Laura prend la parole » : le passage de main après l'onboarding.
  if (input.justOnboarded && !input.isDemo) {
    return input.firstName
      ? t('opener.justOnboardedWithName', { firstName: input.firstName })
      : t('opener.justOnboarded')
  }
  const body = openerBody(t, input)
  return input.firstName
    ? t('opener.withName', { firstName: input.firstName, body })
    : t('opener.withoutName', { body })
}

/**
 * #3773.1 — UNE SALUTATION D'INTERFACE N'EST PAS UN MESSAGE DU FIL.
 *
 * « Bonjour Louis. Sur quoi avance-t-on ? » est un accueil : le persister (comme
 * le faisait #1947 pour toutes les amorces) écrivait dans l'historique une
 * phrase datée du jour d'ouverture, relue plus tard comme une vraie réponse, et
 * l'envoyait au modèle comme s'il l'avait dite. Seules les prises de parole qui
 * POSENT une question à laquelle la réponse se rattache restent des messages :
 * le brief du jour, le passage de main de l'onboarding et « tu veux que je
 * choisisse pour toi ? » (`newcomer`). Le reste s'efface au premier message.
 */
export function lauraOpenerPersists(input: LauraOpenerInput): boolean {
  if (input.morningBrief) return true
  if (input.isDemo) return false
  if (input.justOnboarded) return true
  return openerKind(input) === 'newcomer'
}

type OpenerKind = 'demo' | 'account' | 'newcomer' | 'neutral'

function openerKind(input: LauraOpenerInput): OpenerKind {
  if (input.isDemo) return 'demo'
  if (input.accountName) return 'account'
  // #3773.1 — ni compteur de comptes ni « ton vivier est là » : ce volume n'est pas une donnée
  // utile à chaque ouverture, et la phrase ne doit pas laisser croire que Laura a tout relu.
  if (!input.hasVivier && input.settled && input.portfolioCount === 0) return 'newcomer'
  return 'neutral'
}

// #3772.5 — ce que #3773.1 a réglé en RETIRANT le compteur plutôt qu'en le
// bornant à la portée : aucune des quatre formes de l'accueil (`demo`,
// `account`, `newcomer`, `neutral`) ne cite plus `portfolioCount`, donc
// aucune n'a plus besoin d'être « bornée à la portée choisie » — il n'y a
// simplement plus de chiffre à border. Voir `laura-opener.test.ts`.
function openerBody(t: TFunction<'chat'>, input: LauraOpenerInput): string {
  const kind = openerKind(input)
  if (kind === 'account') return t('opener.account', { account: input.accountName })
  return t(`opener.${kind}`)
}
