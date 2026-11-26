import { z } from 'zod'
import { accountEntityIdentitySourceSchema, type AccountEntityIdentitySource } from './account-entity.js'

/**
 * « PEUT-ON FACTURER CE CLIENT ? » — LA MOITIÉ STRUCTURELLE, AU NIVEAU COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE FICHIER NE REFAIT PAS `invoice-readiness.ts`, ET C'EST TOUT LE SUJET
 * ─────────────────────────────────────────────────────────────────────────────
 * Le portefeuille porte DÉJÀ une lentille « prêt à facturer » : elle est
 * calculée PAR MISSION et PAR MOIS par `assessInvoiceReadiness`
 * ({@link ../schemas/invoice-readiness.js}), puis remontée au compte par
 * `accountInvoiceReadiness.ts` côté écran. Elle répond à « ce MOIS-ci, sur les
 * missions de ce compte, qu'est-ce qui bloque ? ».
 *
 * Elle ne peut PAS répondre à la question de l'ops, et c'est une limite de
 * forme, pas un défaut : **un compte sans mission n'a aucune ligne de
 * facturation**, donc aucun bloqueur — il s'affiche « rien à facturer ». Or
 * « peut-on facturer ce client ? » se pose AVANT la première mission, et sa
 * réponse ne dépend d'aucun relevé d'activité : ce client a-t-il une entité
 * qui reçoit la facture, quelqu'un à qui l'envoyer, un contrat encore valide,
 * des conditions de règlement connues ?
 *
 * Les deux moitiés sont donc DISTINCTES et se composent :
 *
 *   · OPÉRATIONNELLE (existe) — dépend du mois et des relevés. `invoice-readiness.ts`.
 *   · STRUCTURELLE  (ici)    — dépend du CLIENT. Vraie sans aucune mission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ `missing_po` EST LEVÉ, JAMAIS RECALCULÉ (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Bon de commande exigé mais absent » est la SEULE des cinq exigences de la
 * source qui appartient déjà à l'autre moitié : `requires_po` vit sur
 * `mission_commercial_terms`, et `assessInvoiceReadiness` en est seul juge.
 * Cette fonction ne relit ni la table ni la règle — elle reçoit
 * `missionsMissingPo`, un COMPTE produit par cette dérivation-là, et se
 * contente de le hisser au niveau du compte. Écrire ici un second
 * `requiresPo && !poNumber` ferait deux chemins qui divergeraient le jour où
 * l'un des deux apprend une exception.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS ICI, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Aucun KYC, aucun contrôle réglementaire.** La maquette en montrait un
 *    (« KYC validé le 15/04/2026 », « 2 documents manquants ») ; sa fiche de
 *    lecture le jette explicitement — « À jeter : le contrôle réglementaire ».
 *    Le dépôt n'a par ailleurs AUCUNE notion de conformité, et en fabriquer une
 *    aurait produit des dates et des compteurs que rien n'alimente : une
 *    conformité non renseignée se serait affichée « 0 document manquant », donc
 *    « tout va bien », sur des dossiers que personne n'a jamais ouverts.
 *
 *  · **Aucune coordonnée bancaire.** « Bellum ne signe rien, ne paie rien et ne
 *    stocke aucun IBAN » est écrit trois fois dans le dépôt (`admin-docs.ts`,
 *    la migration `1788900000005`, `tool-catalog.ts`). La « domiciliation » de
 *    la maquette n'a donc pas de champ ici. Elle n'en a pas besoin non plus :
 *    Bellum n'ÉMET aucune facture — il dit ce qui empêche d'en émettre une — et
 *    une adresse de facturation ne fait partie d'aucun des cinq bloqueurs que
 *    la source nomme.
 *
 *  · **Aucun delta mensuel.** La maquette affiche « +5 ce mois », « +12 ce
 *    mois ». Aucune photo datée de ces agrégats n'existe en base : le delta
 *    serait inventé, et « +0 » se lirait « rien n'a bougé » alors qu'il veut
 *    dire « on ne sait pas ». Un delta non calculable s'omet.
 */

/**
 * Ce qui empêche de facturer ce CLIENT. Liste FERMÉE, ordonnée par gravité :
 * le premier de la liste est celui qu'il faut traiter en premier.
 *
 * ⚠️ Cette liste est SŒUR de `INVOICE_BLOCKERS`, jamais la même : celle-là
 * juge un MOIS de mission, celle-ci juge un CLIENT. `missing_billing_contact`
 * et `missing_po` portent le même nom des deux côtés parce qu'ils désignent la
 * même chose manquante — les fusionner en une seule énumération aurait en
 * revanche fait voyager `missing_timesheet` sur un compte sans mission.
 *
 * ⚠️ Un ajout se fait EN FIN (GA-08) et sa contrainte SQL s'élargit AVANT
 * (GA-11 / GA-12) — mais rien de cette liste n'est ÉCRIT en base : elle est
 * dérivée à la lecture, à partir de colonnes qui, elles, sont contraintes.
 */
export const ACCOUNT_BILLING_BLOCKERS = [
  /**
   * Aucune entité du compte n'est désignée comme celle qui REÇOIT la facture.
   * Le bloqueur racine : sans payeur nommé, aucune des autres questions n'a de
   * sujet.
   */
  'missing_billing_entity',
  /** Personne à qui envoyer la facture chez ce client. */
  'missing_billing_contact',
  /**
   * Au moins une mission de ce compte exige un bon de commande et n'en a pas.
   * LEVÉ de `assessInvoiceReadiness`, jamais recalculé ici.
   */
  'missing_po',
  /** Le contrat-cadre a une échéance, et elle est passée. */
  'expired_contract',
  /**
   * Personne n'a saisi de délai de règlement. Sans lui, aucune échéance n'est
   * calculable — donc aucun retard, donc aucune relance d'encaissement : c'est
   * le bloqueur qui ne se voit jamais et qui coûte des mois.
   */
  'unknown_payment_terms',
] as const
export const accountBillingBlockerSchema = z.enum(ACCOUNT_BILLING_BLOCKERS)
export type AccountBillingBlocker = (typeof ACCOUNT_BILLING_BLOCKERS)[number]

/**
 * L'état structurel d'un compte.
 *
 * Deux valeurs seulement, et c'est délibéré : contrairement au mois de mission,
 * il n'existe pas de « non dû » ni de « déjà facturé » — la question « ce client
 * est-il facturable » se pose toujours, et elle a toujours une réponse.
 */
export const ACCOUNT_BILLING_STATES = ['ready', 'blocked'] as const
export const accountBillingStateSchema = z.enum(ACCOUNT_BILLING_STATES)
export type AccountBillingState = (typeof ACCOUNT_BILLING_STATES)[number]

/**
 * Le dossier de facturation d'un compte : l'entité DÉSIGNÉE et ce qu'elle porte.
 *
 * `null` partout est une réponse légitime — « personne ne l'a saisi » — et
 * jamais un zéro : un délai de règlement absent n'est pas « paiement comptant »,
 * une échéance de contrat absente n'est pas « expiré ».
 */
export const accountBillingProfileSchema = z.object({
  /** L'entité du CLIENT qui reçoit la facture (`account_entities.id`). */
  entityId: z.string().guid(),
  accountId: z.string().guid(),
  /**
   * La RAISON SOCIALE du payeur — distincte du libellé d'usage de l'entité.
   * « EDF DSI Groupe » est une business unit ; la facture part à « EDF SA ».
   * `null` = jamais saisie, et l'écran le dit plutôt que de replier sur `name`,
   * ce qui ferait passer un nom d'usage pour une raison sociale.
   */
  legalName: z.string().nullable(),
  siren: z.string().nullable(),
  /**
   * L'ÉTABLISSEMENT qui reçoit la facture, quatorze chiffres (31/08/2026).
   *
   * `null` = jamais saisi, et surtout jamais déduit du SIREN : chez un grand
   * groupe, le NIC est ce qui distingue le siège de l'usine, et l'inventer
   * enverrait la facture au mauvais endroit.
   *
   * `.catch(null).default(null)` — déploiement décalé : une API antérieure ne
   * renvoie pas le champ, et la lentille entière ne doit pas tomber pour ça.
   */
  siret: z.string().nullable().catch(null).default(null),
  /**
   * CE QUE LA PASTILLE « VÉRIFIÉ » AFFIRME — la source ET la date.
   *
   * Les deux voyagent ensemble ou pas du tout : c'est ce qui distingue un badge
   * qui informe d'un badge décoratif. `null` des deux côtés = personne n'a
   * confirmé, et l'écran se TAIT — il n'affiche pas « non vérifié », qui se
   * lirait comme un soupçon sur le client plutôt que comme un trou dans notre
   * fiche.
   */
  identitySource: accountEntityIdentitySourceSchema.nullable().catch(null).default(null),
  identityCheckedOn: z.string().nullable().catch(null).default(null),
  /**
   * Le délai de règlement en JOURS. `0` est une valeur SAISIE et légitime
   * (comptant) ; `null` veut dire que personne n'a répondu. Les confondre
   * ferait bloquer un client qui paie le jour même — la même distinction
   * exactement que `chargedCostCents` côté mission.
   */
  paymentTermsDays: z.number().int().nullable(),
  /**
   * L'échéance du contrat-cadre (`YYYY-MM-DD`). `null` = aucune échéance
   * connue, ce qui est le cas NORMAL d'un contrat sans terme — jamais
   * « expiré ».
   */
  contractExpiresOn: z.string().nullable(),
  /** À qui la facture part, chez le client. */
  billingContactId: z.string().guid().nullable(),
})
export type AccountBillingProfile = z.infer<typeof accountBillingProfileSchema>

/** Ce que la route rend : un dossier par compte, et RIEN pour les comptes qui
 *  n'en ont pas — un compte absent de la liste n'a pas d'entité désignée. */
export const accountBillingProfilesResponseSchema = z.object({
  items: z.array(accountBillingProfileSchema),
})
export type AccountBillingProfilesResponse = z.infer<typeof accountBillingProfilesResponseSchema>

/** Ce dont le jugement a besoin — jamais les entités complètes. */
type AccountBillingInput = {
  /** Le dossier du payeur. `null` = aucune entité désignée. */
  profile: AccountBillingProfile | null
  /**
   * Combien de missions de ce compte portent le bloqueur `missing_po`, tel que
   * `assessInvoiceReadiness` l'a décidé. LEVÉ, jamais recalculé (GA-26).
   */
  missionsMissingPo: number
}

/**
 * Ce qui empêche de facturer ce client, et rien d'autre.
 *
 * ⚠️ Sans entité désignée, la fonction rend UN seul bloqueur. Empiler
 * « conditions inconnues » et « pas de contact » par-dessus serait faux au sens
 * strict — on ne sait rien d'un dossier qui n'existe pas — et pratiquement
 * nuisible : trois lignes rouges pour un seul geste à faire, et l'utilisateur
 * ne sait plus par où commencer.
 */
export function assessAccountBillingReadiness(
  input: AccountBillingInput,
  now: Date,
): { state: AccountBillingState; blockers: AccountBillingBlocker[] } {
  const found = new Set<AccountBillingBlocker>()

  // Le bon de commande est levé de l'autre moitié : il vaut même sans dossier
  // de facturation, puisqu'il est porté par la mission.
  if (input.missionsMissingPo > 0) found.add('missing_po')

  if (!input.profile) {
    found.add('missing_billing_entity')
  } else {
    if (input.profile.billingContactId === null) found.add('missing_billing_contact')
    // `0` est une valeur saisie (comptant) : seul `null` est une absence.
    if (input.profile.paymentTermsDays === null) found.add('unknown_payment_terms')
    if (isContractExpired(input.profile.contractExpiresOn, now)) found.add('expired_contract')
  }

  // Réordonnés selon la gravité DU DOMAINE, jamais l'ordre de détection — c'est
  // cet ordre qui dit lequel traiter en premier.
  const blockers = ACCOUNT_BILLING_BLOCKERS.filter(blocker => found.has(blocker))
  return { state: blockers.length === 0 ? 'ready' : 'blocked', blockers }
}

/**
 * Le contrat est-il EXPIRÉ ?
 *
 * Trois refus, et chacun a coûté quelque part :
 *  · une date ABSENTE ne conclut rien — un contrat-cadre sans terme est le cas
 *    normal, et le compter expiré ferait rougir tout le portefeuille ;
 *  · une date ILLISIBLE ne conclut rien non plus — on ne devine pas ;
 *  · le JOUR de l'échéance, le contrat court encore. Il expire le lendemain.
 */
function isContractExpired(contractExpiresOn: string | null, now: Date): boolean {
  if (!contractExpiresOn) return false
  const expiry = Date.parse(`${contractExpiresOn.slice(0, 10)}T23:59:59Z`)
  if (Number.isNaN(expiry)) return false
  return now.getTime() > expiry
}

/**
 * Ce qu'il faut FAIRE pour lever chaque bloqueur, et OÙ.
 *
 * Le même contrat que `BLOCKER_ACTIONS` côté mission, et pour la même raison :
 * « non facturable » sans indication oblige à rouvrir trois écrans pour
 * comprendre — et on ne le fait pas, alors le compte reste bloqué.
 *
 * `route` est un chemin de l'application, jamais un lien externe. Les quatre
 * bloqueurs STRUCTURELS se réparent sur la fiche du compte (l'écran qui porte
 * les entités) ; `missing_po` se répare sur la mission, exactement où
 * `BLOCKER_ACTIONS.missing_po` l'envoie déjà — deux écrans différents pour deux
 * objets différents, jamais un renvoi vers un écran qui ne porte pas le geste.
 */
export const ACCOUNT_BILLING_BLOCKER_ACTIONS: Readonly<
  Record<AccountBillingBlocker, { action: string; route: string }>
> = {
  missing_billing_entity: { action: 'designate_billing_entity', route: '/accounts' },
  missing_billing_contact: { action: 'set_billing_contact', route: '/accounts' },
  missing_po: { action: 'ask_po', route: '/missions' },
  expired_contract: { action: 'renew_contract', route: '/accounts' },
  unknown_payment_terms: { action: 'set_payment_terms', route: '/accounts' },
}

/**
 * L'entité DÉSIGNÉE comme payeur, parmi celles d'un compte.
 *
 * ⚠️ Aucun repli. Ni sur `is_default` (le périmètre non déterminé accueille les
 * contacts sans division — il ne paie rien), ni sur la première de la liste.
 * Deviner qui reçoit la facture ferait afficher un SIREN qui n'est pas celui du
 * payeur, et c'est le genre de chiffre qu'on ne rattrape pas : il part sur un
 * document.
 */
export function billingEntityOfAccount<T extends { is_billing: boolean }>(entities: readonly T[]): T | null {
  return entities.find(entity => entity.is_billing) ?? null
}

/**
 * CE QUE LA PASTILLE « VÉRIFIÉ » A LE DROIT D'AFFIRMER — ou `null`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FONCTION, ET PAS UN `&&` DANS LE JSX
 * ─────────────────────────────────────────────────────────────────────────────
 * La pastille apparaît sur la carte du portefeuille, et elle apparaîtra demain
 * sur la fiche du compte et dans un export. Trois `if` écrits à trois endroits
 * divergent au premier cas de bord — et le cas de bord, ici, c'est justement le
 * couple incomplet : une source sans date, ou une date sans source. La base les
 * interdit (`account_entities_identity_pair_check`) ; une ligne écrite avant
 * cette contrainte, ou par un import, peut encore en porter un.
 *
 * Rend les DEUX moitiés ensemble, ou rien. Ce qui rend `null` n'affiche pas
 * « non vérifié » : un compte dont personne n'a confirmé l'identité n'est pas
 * suspect, c'est notre fiche qui est incomplète — et un badge rouge sur le nom
 * d'un client ferait porter à ce client un reproche qui nous revient.
 */
export function accountIdentityProof(
  profile: Pick<AccountBillingProfile, 'identitySource' | 'identityCheckedOn'> | null | undefined,
): { source: AccountEntityIdentitySource; checkedOn: string } | null {
  const source = profile?.identitySource ?? null
  const checkedOn = (profile?.identityCheckedOn ?? '').trim()
  if (!source || !checkedOn) return null
  return { source, checkedOn }
}
