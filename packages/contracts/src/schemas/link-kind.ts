import { z } from 'zod'

/**
 * #2373.2 / #3403.7-.10 — LES TREIZE TYPES DE LIEN PERSONNEL (LAU-FINAL-088,
 * étendu par le retour #3403 sur l'onglet Accès).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LISTE FERMÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une introduction sans nom de type ne dit ni ce qu'on SAIT de la relation, ni
 * ce qu'on a le droit d'en FAIRE — « on connaît quelqu'un chez eux » ne dit pas
 * si c'est une recommandation explicite ou une pure homonymie. Treize noms,
 * écrits une fois, jamais recopiés côté écran (GA-26).
 *
 * ⚠️ Distinct du vocabulaire de {@link ecosystem-relation.js} — celui-là dit ce
 * qu'une ESN EST pour un compte (huit types), celui-ci dit ce qu'une PERSONNE
 * est pour une autre personne. Deux domaines, deux listes, aucun recouvrement.
 *
 * L'ordre est ADDITIF (même règle que GA-08) : un type ne s'insère jamais au
 * milieu, il s'ajoute à la fin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `former_manager` / `event_encounter` / `alumni_network` (#3403.7/.9/.10) —
 * TRANCHÉ SANS LOUIS (30/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour #3403 nomme onze voies d'accès ; huit avaient déjà une dérivation
 * réelle dans ce dépôt (dix `LINK_KINDS`, `account_partners`, l'état de
 * relation CRM, le signal de changement de poste). Trois n'avaient AUCUN
 * concept qui les distingue : « ancien manager » (spécialisation de
 * `former_colleague`), « événement ou rencontre » et « réseau alumni ». Ils ne
 * sont pas ajoutés sans dérivation — la même règle que #2316.10 a refusé pour
 * quatre types sans appelant (voir le docblock de {@link ecosystem-relation.js})
 * s'applique ici : leur APPELANT est le même sélecteur que les dix types
 * existants (`ContactWarmIntroCard`, un geste humain qui les déclare), donc
 * l'ajout ne rompt pas la garde — il lui donne un producteur réel dès ce
 * commit, au même titre que `team_declared` côté écosystème.
 */
export const LINK_KINDS = [
  /** Quelqu'un a explicitement recommandé la mise en relation. */
  'explicit_recommendation',
  /** Une introduction a été proposée, pas encore obtenue. */
  'proposed_introduction',
  /** Une relation commune existe, sans qu'elle ait agi. */
  'common_relation',
  /** Un ancien collègue de la cible ou du commercial. */
  'former_colleague',
  /** Un consultant de l'ESN qui connaît la cible. */
  'consultant',
  /** Un collègue du même workspace, distinct de « ancien collègue ». */
  'workspace_colleague',
  /** Une interaction LinkedIn (commentaire, message, relation) — pas un accord. */
  'linkedin_interaction',
  /** Un contact déjà rencontré par le passé, hors CRM à jour. */
  'historic_contact',
  /** Une relation PROBABLE, jamais confirmée — ne devient jamais citable. */
  'probable_relation',
  /** Simple homonymie — aucune relation réelle. Ne devient jamais citable. */
  'plain_homonymy',
  /** #3403.7 — un ancien MANAGER de la cible ou du commercial (distinct d'un
   *  simple ancien collègue : le rapport hiérarchique passé pèse différemment
   *  sur ce qu'on peut demander). */
  'former_manager',
  /** #3403.9 — rencontré lors d'un événement ou d'une conférence. */
  'event_encounter',
  /** #3403.10 — lien issu d'un réseau d'anciens élèves. */
  'alumni_network',
] as const
export const linkKindSchema = z.enum(LINK_KINDS)
export type LinkKind = (typeof LINK_KINDS)[number]

/**
 * Les deux types qui ne deviennent JAMAIS citables, quel que soit l'état de
 * vérification — ce sont par construction des liens NON confirmés : citer
 * « de la part de X » dessus fabriquerait une proximité qui n'existe pas.
 */
export const NEVER_CITABLE_LINK_KINDS: readonly LinkKind[] = ['probable_relation', 'plain_homonymy']

/**
 * « Seuls les liens vérifiés peuvent être cités » (LAU-FINAL-088). `verified`
 * porte la preuve obtenue AILLEURS (accord du referrer, confirmation
 * d'appartenance) — cette fonction ne la produit jamais, elle applique juste
 * la règle une fois que la preuve existe.
 */
export function isLinkKindCitable(kind: LinkKind, verified: boolean): boolean {
  if (NEVER_CITABLE_LINK_KINDS.includes(kind)) return false
  return verified
}

/**
 * #3403.12 — LA CHALEUR RELATIONNELLE d'un lien, DÉCLARÉE par la personne qui
 * le connaît (geste sur `ContactWarmIntroCard`), jamais calculée : aucune
 * source ne la distingue d'un lien « probable », et un score inventé violerait
 * « aucun chiffre sans appui ». Trois niveaux fermés ; absent = non déclaré
 * (`null`), jamais « distant » par défaut.
 */
export const RELATIONAL_WARMTHS = ['distant', 'cordial', 'close'] as const
export const relationalWarmthSchema = z.enum(RELATIONAL_WARMTHS)
export type RelationalWarmth = (typeof RELATIONAL_WARMTHS)[number]
