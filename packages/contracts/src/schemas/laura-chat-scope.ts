import { z } from 'zod'
import { creditCostOf } from '../billing/credit-weights.js'

/**
 * #1951.2 / #1951.3 / #1910.5 / #1910.7 — LES PORTÉES « OBJET » DE LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI VOYAGE, ET CE QUI NE VOYAGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le navigateur DÉSIGNE un objet — une nature et un identifiant. Il n'en
 * transporte jamais le contenu : le serveur relit la fiche lui-même, dans
 * l'espace actif de l'appelant, exactement comme il le fait pour `accountId`
 * depuis le premier jour (« le front envoie seulement message + accountId »).
 * Un libellé envoyé en plus serait un texte que n'importe qui peut écrire et qui
 * finirait dans un prompt ; `z.object` le retire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS NATURES, ET PAS ONZE
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision du 12/09/2026 : consultant + besoin d'abord, les autres (mission,
 * contact, opportunité, rendez-vous, territoire, séquence) selon la demande
 * réelle. Les accepter ici ferait voyager une portée que le serveur ne sait pas
 * lire — un scope silencieusement ignoré est la méprise même que la portée
 * explicite existe pour supprimer.
 *
 * #1910.6 — LA MISSION EST LA DEMANDE RÉELLE ATTENDUE, et elle arrive.
 * Elle ferme la boucle des trois autres : un besoin devient une mission, un
 * consultant y est affecté, et « où en est-on sur cette mission ? » était la
 * seule des trois questions qui n'avait pas de périmètre. Elle s'AJOUTE EN FIN
 * de liste — un enum ne perd jamais de valeur et n'en insère jamais au milieu
 * (GA-08) — et le serveur sait la relire (`readScopeObject`, lecture bornée à
 * l'espace actif par `DeliveryService.list`).
 *
 * ⚠️ Ce que la fiche de mission NE PORTE PAS dans le prompt : les MONTANTS
 * (TJM, coût chargé, marge). Ils suivent `finance:read`, que cette lecture ne
 * connaît pas — c'est la même règle que le consultant et le besoin, et la
 * lecture passe `canReadFinance: false` plutôt que de s'en remettre au rendu.
 *
 * #1951.1 — LE CONTACT EST LA QUATRIÈME, et c'était la demande la plus citée.
 * « Prépare une relance pour Sophie » se posait jusqu'ici sur le COMPTE entier,
 * si bien que Laura lisait deux mille fiches pour parler d'une seule personne.
 * Elle s'AJOUTE EN FIN de liste pour la même raison que la mission (GA-08), et
 * le serveur sait la relire (`readScopeObject` → `ContactsService.findOne`,
 * lecture déjà bornée à l'espace actif).
 *
 * ⚠️ Ce que la fiche de contact NE PORTE PAS dans le prompt : les COORDONNÉES
 * (e-mail, téléphone, profil public) — Laura prépare, elle ne contacte pas, et
 * le cloisonnement des coordonnées se règle par rôle — et tout CRITÈRE PROTÉGÉ,
 * photo comprise (`c58_criteres_proteges`) : un fil cadré sur une personne peut
 * en comparer plusieurs, et un champ présent dans le prompt pèse sans qu'aucune
 * ligne ne le « lise ».
 *
 * #1951.4 — L'OPPORTUNITÉ EST LA CINQUIÈME, et il a fallu vérifier qu'elle
 * existait vraiment. « Opportunité » désigne deux choses dans ce produit : un
 * STATUT commercial de compte (`commercial_status`), et une LIGNE de la table
 * `opportunities` — l'objet pivot du pipe, avec son identifiant, son étape et
 * son compte. La première n'aurait pas fait une portée : nommer un statut de
 * compte « opportunité » aurait donné un second nom au compte, donc une
 * deuxième vérité. C'est la seconde qui entre ici, et le serveur sait la relire
 * (`ProjectsService.getRow`, bornée à l'espace par son `WHERE`).
 *
 * ⚠️ Ce que la fiche d'opportunité NE PORTE PAS dans le prompt : la SOURCE
 * (elle nomme d'où l'information vient, et nos fournisseurs ne se nomment
 * jamais) et le champ `confidence`, qui se lirait comme une chance de conclure
 * — aucune PROBABILITÉ ne s'affiche, refusée six fois (`c26_probabilite`).
 *
 * ⚠️ CE QUI RESTE DEHORS, ET POURQUOI — rendez-vous, territoire et séquence
 * n'entrent pas ici, faute d'objet relisible. Un rendez-vous n'a pas d'entité
 * d'espace : son identifiant est celui d'un agenda EXTERNE, lu sous portée
 * PERSONNELLE — une boîte d'agenda est personnelle, et la cadrer dans un fil
 * d'espace serait un revirement de D58, pas une extension de portée. Un
 * territoire n'a aucun identifiant du tout (il se décrit par département et
 * rayon) et c'est de la donnée de MARCHÉ : « la portée protège le contexte
 * PRIVÉ, pas l'accès au marché ». Une séquence n'a pas d'instance : la cadence
 * se dérive d'un contact, que la portée « une personne » couvre déjà. Les
 * accepter ferait voyager une portée que le serveur ne sait pas lire — un scope
 * silencieusement ignoré est la méprise même que la portée explicite existe
 * pour supprimer.
 *
 * Théo L1 — sélecteur avancé — L'OFFRE D'EMPLOI EST LA SIXIÈME (décision Louis
 * 22/10/2026) : un signal de RECRUTEMENT repéré chez un compte. Elle s'AJOUTE EN
 * FIN (GA-08) et se désigne par l'identifiant de sa ligne d'historique de signal
 * (`signal_history.id`, bornée à l'espace) — la seule identité stable d'une
 * offre, le blob d'analyse étant réécrit à chaque passage. Le serveur la relit
 * avec son compte ; une offre de STAGE ne se relit jamais (décision 12/10).
 * ⚠️ Ce qu'elle NE PORTE PAS dans le prompt : le NOM de la source quand c'est un
 * de nos fournisseurs — seule la page carrières du compte lui-même se nomme.
 */
export const CHAT_SCOPE_OBJECT_KINDS = ['consultant', 'need', 'mission', 'contact', 'opportunity', 'job_offer'] as const

export const chatScopeObjectSchema = z.object({
  kind: z.enum(CHAT_SCOPE_OBJECT_KINDS),
  id: z.string().guid(),
})
export type ChatScopeObject = z.infer<typeof chatScopeObjectSchema>

/**
 * Théo L1 — sélecteur avancé — L'URL REFLÈTE LE CHOIX : `?scope=<nature>:<id>`.
 *
 * Un lien partageable désigne l'objet comme le corps d'un tour le désigne : une
 * nature et un identifiant, jamais un libellé (un texte d'URL que n'importe qui
 * peut écrire n'a rien à faire dans un prompt). La relecture passe par le MÊME
 * schéma que le corps : une nature inconnue ou un identifiant invalide rendent
 * `null`, jamais une portée devinée.
 */
export function chatScopeObjectParam(scope: ChatScopeObject): string {
  return `${scope.kind}:${scope.id}`
}

export function chatScopeObjectFromParam(value: unknown): ChatScopeObject | null {
  if (typeof value !== 'string') return null
  const separator = value.indexOf(':')
  if (separator <= 0) return null
  const parsed = chatScopeObjectSchema.safeParse({ kind: value.slice(0, separator), id: value.slice(separator + 1) })
  return parsed.success ? parsed.data : null
}

/**
 * #1950.17 — LE PLAFOND DE COÛT AGRÉGÉ D'UNE RÉPONSE DE LAURA, en crédits.
 *
 * Décision du 12/09/2026 : formaliser les cartes indépendantes que Laura
 * propose déjà, avec un plafond agrégé. Au-delà, Laura propose moins d'étapes
 * et le dit — le plafond ne décide jamais à la place de la personne, il borne
 * ce qu'une seule réponse peut mettre sur la table.
 *
 * La valeur se LIT dans la grille : une réponse ne propose jamais plus que le
 * prix de l'action la plus chère du produit, une analyse complète de compte.
 * Aucun chiffre n'est écrit ici — la grille vit à un seul endroit
 * (`credit-weights.ts`), et un miroir juste redevient faux.
 *
 * Il est lu par l'API, qui le transmet au service IA : le navigateur ne le
 * fournit jamais (il pourrait l'élever).
 */
export const LAURA_REPLY_COST_CEILING_CREDITS = creditCostOf('account_analysis')
