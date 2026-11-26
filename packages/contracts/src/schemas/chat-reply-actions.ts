import type { ReplyBlock } from './reply-blocks.js'

/**
 * #3766 (BEL-LAU-1011) — LES ACTIONS D'UNE RÉPONSE DE LAURA : DES DÉBOUCHÉS RÉELS.
 *
 * « Les réponses Laura doivent déboucher sur de vraies actions, pas sur des
 * boutons décoratifs ou des redirections floues. »
 *
 * Tranché sans Louis : les actions sont DÉRIVÉES de ce que la réponse porte
 * réellement (comptes cités, critères Découvrir, cartes, données manquantes),
 * jamais émises par le modèle. Un modèle qui écrirait ses propres boutons
 * pourrait proposer « Voir le compte » sans compte, ou deux gestes
 * contradictoires au même niveau ; une dérivation pure ne le peut pas, et la
 * même règle s'applique à l'écran et dans les tests (GA-26).
 *
 * Quatre refus par construction :
 *  - aucun objet réel dans la réponse → AUCUNE action (`null`), jamais un
 *    bouton qui « fait semblant » ;
 *  - un geste n'est proposé que si son objet existe (pas de « Découvrir » sans
 *    critères, pas de « Voir le compte » sans compte) — donc jamais de vue vide ;
 *  - UN seul geste principal, les autres sont secondaires — jamais deux gestes
 *    de même niveau qui se contredisent ;
 *  - un geste déjà accompli par la réponse n'est pas re-proposé.
 *
 * Deux gestes de la liste de l'issue n'ont PAS de bouton ici, parce qu'ils
 * existent déjà sous la réponse et que les rendre aussi ici les afficherait
 * deux fois sous la même forme (GA-26) :
 *  - « Sauvegarder cette réponse » : le pied de réponse (`SaveReply`,
 *    `ReplyFooter.tsx`) ;
 *  - « Ouvrir dans Découvrir » : la carte de proposition `find_accounts`
 *    (`PendingActions.tsx`, `discoverSearch`), qui emporte les mêmes critères
 *    et le fil d'origine. Une réponse qui porte des critères Découvrir porte
 *    donc TOUJOURS cette carte — le bloc d'actions n'y ajoute que « Affiner ».
 */
export const REPLY_ACTION_KINDS = [
  'view_account',
  'find_contacts',
  'prepare_approach',
  'refine_search',
  'create_worklist',
  'qualify_further',
  'dismiss',
] as const

export type ReplyActionKind = (typeof REPLY_ACTION_KINDS)[number]

export type ReplyActionInput = {
  /** Les comptes que la réponse cite, dans son ordre (`accountIdsInReply`). */
  accountIds: readonly string[]
  /** Les types de cartes présentes dans la réponse. */
  blockTypes: readonly ReplyBlock['type'][]
  /** La réponse porte une proposition Découvrir (carte `find_accounts`) avec au moins un critère. */
  hasDiscoverCriteria: boolean
  /** La réponse a nommé ce qu'elle n'a pas pu évaluer (carte `missing_data`, axe non évalué). */
  hasMissingData: boolean
}

export type ReplyActionPlan = {
  primary: ReplyActionKind
  /** Dans l'ordre d'affichage ; `dismiss` est toujours le dernier. */
  secondary: ReplyActionKind[]
}

/** L'ordre d'affichage des gestes secondaires. */
const DISPLAY_ORDER: readonly Exclude<ReplyActionKind, 'dismiss'>[] = [
  'view_account',
  'find_contacts',
  'prepare_approach',
  'refine_search',
  'create_worklist',
  'qualify_further',
]

/** Au plus trois gestes secondaires, plus « Ignorer » : pas de mur de boutons. */
const MAX_SECONDARY = 3

const RANKED = ['account_ranking', 'account_volume_sprint'] as const

export function replyActionsFor(input: ReplyActionInput): ReplyActionPlan | null {
  const { accountIds, blockTypes, hasDiscoverCriteria, hasMissingData } = input
  const accounts = accountIds.length
  const has = (type: ReplyBlock['type']) => blockTypes.includes(type)

  const eligible = new Set<Exclude<ReplyActionKind, 'dismiss'>>()
  if (hasDiscoverCriteria) eligible.add('refine_search')
  if (accounts >= 1) {
    eligible.add('view_account')
    if (!has('contact_list')) eligible.add('find_contacts')
    if (!has('approach')) eligible.add('prepare_approach')
    eligible.add('qualify_further')
  }
  if (accounts >= 2) eligible.add('create_worklist')
  if (eligible.size === 0) return null

  // Le geste que la réponse RECOMMANDE, du plus spécifique au plus général.
  const recommended: Exclude<ReplyActionKind, 'dismiss'> | undefined =
    hasMissingData && accounts >= 1
      ? 'qualify_further'
      : has('contact_list')
        ? 'prepare_approach'
        : accounts >= 2 && RANKED.some(has)
          ? 'create_worklist'
          : has('approach')
            ? 'find_contacts'
            : undefined

  const primary =
    recommended && eligible.has(recommended)
      ? recommended
      : (['find_contacts', 'prepare_approach', 'view_account', 'refine_search'] as const).find(kind =>
          eligible.has(kind),
        )
  if (!primary) return null

  const secondary: ReplyActionKind[] = DISPLAY_ORDER.filter(kind => kind !== primary && eligible.has(kind)).slice(
    0,
    MAX_SECONDARY,
  )
  secondary.push('dismiss')
  return { primary, secondary }
}
