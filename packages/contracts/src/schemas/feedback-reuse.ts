import { type FeedbackReuseScope } from './offer-portfolio.js'

/**
 * Un retour ne franchit pas la frontière de l'espace qui l'a donné.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS UNE PRÉFÉRENCE PRODUIT
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est l'onzième invariant du registre de doctrine — « le retour d'un bêta
 * testeur ne se réutilise pas tel quel chez un concurrent » — et le SEUL des
 * onze qui n'avait aucun porteur au 25/08/2026. Sa raison est la même que celle
 * de GA-43 : **les espaces de Bellum sont des ESN, donc des concurrents.**
 *
 * Un retour détaillé décrit une stratégie — des zones de chasse, des seuils, des
 * cibles, un lexique, le nom d'un client et ce qu'il a répondu. Le servir à un
 * autre espace, c'est donner à une ESN ce que sa concurrente a écrit en croyant
 * parler à son outil. Et comme pour le coût d'accès : ça ne se rattrape pas
 * après coup, puisque l'information aura circulé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES, ET L'ASYMÉTRIE ENTRE ELLES
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Le TEXTE écrit par un humain ({@link FEEDBACK_FREE_TEXT_COLUMNS}) ne sort
 *     JAMAIS de son espace, quelle que soit la portée déclarée. Aucune valeur
 *     de l'énumération ne l'autorise, et c'est délibéré : `generalized_only`
 *     autorise le MOTIF anonymisé (« le secteur appartient à la mission »),
 *     jamais la phrase qui l'a inspiré.
 *  2. La GÉNÉRALISATION ne sort que sur décision explicite de l'espace, via
 *     `offer_portfolio.privacy.feedback_reuse` recopié sur la LIGNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA PORTÉE VIT SUR LA LIGNE ET NON SEULEMENT SUR L'ESPACE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le réglage d'espace existe depuis l'addendum Stelya (`FEEDBACK_REUSE_SCOPES`)
 * et il ne suffit pas : il dit ce que l'espace autorise AUJOURD'HUI, pas ce
 * qu'il autorisait le jour où le retour a été écrit. Un espace qui coche
 * `generalized_only` en septembre rendrait rétroactivement réutilisable tout ce
 * qui a été dit en août — c'est-à-dire un consentement obtenu après coup.
 *
 * La ligne porte donc la portée du moment, comme `access_facts.observed_at`
 * porte la date où le fait était vrai. Un réglage vit à un seul endroit ; ce qui
 * est recopié ici n'est pas le réglage, c'est sa TRACE.
 *
 * ⚠️ Ce module DÉCRIT, il n'exécute rien — c'est ce qui lui permet d'être lu par
 * la garde qui, elle, refuse. Au 27/08/2026, aucune lecture inter-espaces de ces
 * tables n'existe : la garde ne corrige donc rien, elle empêche celle de demain.
 */

/**
 * Le plus fermé des deux, et la seule valeur par défaut acceptable.
 *
 * Un retour se réutilise sur DÉCISION, jamais par omission — le défaut
 * s'applique justement à ceux qui n'ont rien dit, et personne ne peut consentir
 * en se taisant.
 */
export const DEFAULT_FEEDBACK_REUSE_SCOPE: FeedbackReuseScope = 'tenant_private'

/** La colonne qui porte la portée, identique dans les trois tables de retour.
 *  Nommée ici pour que la garde et les migrations parlent du même mot. */
export const FEEDBACK_REUSE_SCOPE_COLUMN = 'reuse_scope'

/**
 * Les tables qui STOCKENT un retour d'utilisateur, et qui portent donc sa
 * portée. Ajouter une table de retour sans la colonne fait échouer la garde de
 * schéma. Quatre depuis #1919 : `chat_reply_feedback`, les retours d'une personne
 * sur les réponses de Laura — portée `tenant_private`, et même plus étroite en
 * pratique (lue par son seul auteur).
 */
export const FEEDBACK_ROW_TABLES = [
  'account_feedback',
  'submission_feedback',
  'beta_feedback',
  'chat_reply_feedback',
] as const

/**
 * Celles des tables de retour qui sont SCOPÉES à un espace.
 *
 * `beta_feedback` n'y figure pas : elle n'a pas de `workspace_id` (un retour
 * bêta est adressé à l'éditeur, pas à une équipe) et relève donc de la règle de
 * schéma seule. Les confondre ferait crier la garde sur du code correct, et une
 * garde qui crie sur du code correct finit désactivée.
 */
export const WORKSPACE_SCOPED_FEEDBACK_TABLES = [
  'account_feedback',
  'submission_feedback',
  'chat_reply_feedback',
] as const

/**
 * Le texte écrit par un humain, dans les trois tables — la seule chose qui ne
 * doit JAMAIS traverser une frontière d'espace.
 *
 * `verbatim` (`submission_feedback`) est ce que le client a répondu, cité tel
 * quel ; `note` (`account_feedback`) la précision libre de l'utilisateur ;
 * `message` (`beta_feedback`) le retour bêta lui-même ; `correction_field` et
 * `correction_value` (`chat_reply_feedback`, #1919.7) ce qu'une personne dit
 * être faux dans une réponse de Laura, et la bonne information.
 */
export const FEEDBACK_FREE_TEXT_COLUMNS = [
  'verbatim',
  'note',
  'message',
  'correction_field',
  'correction_value',
] as const

/**
 * Ce retour peut-il, sous cette forme, sortir de son espace ?
 *
 * L'ordre des deux conditions est la règle : la forme d'abord, la portée
 * ensuite. Tester la portée en premier laisserait croire qu'une portée assez
 * ouverte finit par autoriser le verbatim — elle ne le fait pas, et c'est le
 * cœur de l'invariant.
 */
export function mayLeaveWorkspace(scope: FeedbackReuseScope, form: 'verbatim' | 'generalized'): boolean {
  if (form === 'verbatim') return false
  return scope === 'generalized_only'
}
