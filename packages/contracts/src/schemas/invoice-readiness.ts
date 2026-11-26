import { z } from 'zod'
import { measurability, measurabilitySchema, type Measurability } from './measurability.js'
import { gapAnomalyMessages, gapBlocksInvoicing, type TimesheetStatus } from './mission.js'
import type { BillingCadence } from './staffing.js'
import type { LegalContractCoverage } from './contract.js'

/**
 * REVENUE PROTECTION — jusqu'à « prêt à facturer », et pas un pas de plus.
 *
 * L'arbitrage de Louis est net : Bellum n'émet AUCUNE facture légale. Une
 * facture engage une comptabilité, une TVA, une numérotation continue et une
 * obligation de conservation ; un produit qui en produirait « pour aider »
 * créerait des documents que personne ne pourrait ni corriger ni annuler
 * proprement. Ce que le produit fait, en revanche, est ce que personne ne fait :
 * dire, mois par mois et mission par mission, **ce qui empêche de facturer**.
 *
 * C'est la vraie perte des ESN. Le revenu ne disparaît pas parce que la facture
 * est mal faite ; il disparaît parce qu'un CRA n'a jamais été signé, qu'un bon
 * de commande manque, ou que personne ne s'est aperçu qu'un mois n'avait pas été
 * facturé du tout — et on s'en rend compte au moment du bilan, quand le client
 * conteste des jours vieux de cinq mois.
 *
 * Trois règles gouvernent le fichier :
 *
 * 1. **« Prêt » est une CONCLUSION, pas une case à cocher.** Elle se déduit de
 *    l'absence de bloqueur. Personne ne peut la forcer.
 * 2. **Chaque bloqueur nomme ce qu'il faut faire.** « Non facturable » sans
 *    raison oblige à rouvrir trois écrans pour comprendre, et on ne le fait pas.
 * 3. **Le montant est PRÉPARATOIRE et le dit.** Il est calculé à partir des
 *    jours déclarés et du TJM ; ce n'est ni un dû ni une facture, et l'appeler
 *    autrement ferait entrer un chiffre non contractuel dans une comptabilité.
 */

/**
 * Ce qui empêche de facturer. Liste FERMÉE et ordonnée par gravité : le premier
 * bloqueur de la liste est celui qu'il faut traiter en premier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CORRESPONDANCE AVEC LA LISTE DU 21/08/2026 — à lire avant d'en « restaurer »
 * ─────────────────────────────────────────────────────────────────────────────
 * La spécification du 21/08 portait `INVOICE_BLOCKERS` comme une liste fermée de
 * HUIT codes ; celle du 26/08 en décrit dix, dont plusieurs sous d'autres noms.
 * Un audit documentaire en a conclu que « quatre codes sur huit disparaissent »
 * et que les deux listes fermées sont incompatibles.
 *
 * **C'est faux du CODE, et vérifié le 26/08 : les huit sont couverts, et cette
 * liste en ajoute deux.** L'audit comparait deux documents, jamais le dépôt.
 *
 *   21/08                        → ici                         forme
 *   missing_timesheet            → missing_timesheet           identique
 *   timesheet_not_validated      → timesheet_not_validated     identique
 *   missing_po                   → missing_po                  identique
 *   missing_rate                 → missing_rate                identique
 *   missing_start_date           → missing_start_date          identique
 *   day_gap_unexplained          → unexplained_gap             renommé
 *   unknown_billing_contact      → missing_billing_contact     renommé
 *   open_dispute                 → timesheet_disputed          renommé
 *   —                            → timesheet_not_submitted     AJOUTÉ
 *   —                            → timesheet_anomalies         AJOUTÉ
 *
 * Les deux ajouts ne sont pas décoratifs : ils sont réellement produits
 * (`timesheet_not_submitted` sur un relevé en brouillon, `timesheet_anomalies`
 * dès qu'une anomalie est détectée) et ils portent chacun leur geste dans
 * {@link BLOCKER_ACTIONS}.
 *
 * ⚠️ Ne PAS « revenir aux huit ». Renommer un code de cette liste casse trois
 * choses d'un coup : les valeurs déjà écrites, la contrainte SQL qui les
 * couvre (GA-12) et les traductions des deux langues.
 */
export const INVOICE_BLOCKERS = [
  /** Aucun relevé d'activité pour ce mois. Le cas le plus coûteux : il ne se
   *  signale nulle part, et le mois passe. */
  'missing_timesheet',
  /** Un relevé existe mais n'a pas été soumis. */
  'timesheet_not_submitted',
  /** Soumis mais pas validé par le client. */
  'timesheet_not_validated',
  /** Le client conteste. Facturer par-dessus une contestation la transforme en
   *  litige. */
  'timesheet_disputed',
  /** Des anomalies ont été détectées sur le relevé. */
  'timesheet_anomalies',
  /** Aucun TJM sur la mission : impossible de préparer un montant. */
  'missing_rate',
  /** Aucun bon de commande, alors que le client en exige un. */
  'missing_po',
  /**
   * Personne à qui envoyer la facture. Le bloqueur le plus bête et le plus
   * fréquent : tout est prêt, et le document reste sur un bureau.
   */
  'missing_billing_contact',
  /** La mission n'a pas de date de début : impossible de dire ce que ce mois
   *  couvre, donc impossible de préparer un montant honnête. */
  'missing_start_date',
  /**
   * Un écart de jours que personne n'a expliqué (§7 : écart ≠ 0 empêche
   * `ready`). Facturer par-dessus, c'est facturer un chiffre dont on sait
   * qu'il ne colle pas.
   */
  'unexplained_gap',
  /**
   * Le relevé a été REJETÉ, motif à l'appui — il existe, et personne ne
   * l'assume.
   *
   * AJOUTÉ EN FIN (GA-08). Sans lui, un relevé rejeté ne produisait AUCUN
   * bloqueur de statut : il tombait dans la branche fourre-tout, à côté de
   * `validated`, et le mois partait « prêt à facturer » sur des jours qu'un
   * humain venait explicitement de refuser. C'est la divergence « deux écrans,
   * deux réponses » que ce module a déjà payée une fois — l'écran des relevés
   * disait « ça bloque », celui de la facturation « rien à signaler ».
   *
   * Il se distingue de `missing_timesheet` (rien n'est arrivé) et de
   * `timesheet_disputed` (le CLIENT conteste) : ici, c'est l'ESN elle-même qui
   * a renvoyé le relevé à son auteur. Le geste qui le lève est un redépôt
   * corrigé, pas une relance ni une négociation.
   */
  'timesheet_rejected',
  /**
   * Aucun COÛT CHARGÉ saisi sur la mission (`mission_commercial_terms.
   * loaded_daily_cost_cents`) — distinct de `missing_rate`, qui ne couvre que
   * le TJM VENDU. Un mois pouvait partir « prêt à facturer » avec un TJM
   * renseigné et un coût chargé absent : la marge se calculait alors sans son
   * coût, et le chiffre sortait faux dans le sens qui arrange.
   *
   * `null` EXPLICITE = personne n'a saisi de coût, et c'est un bloqueur. `0`
   * est une valeur LÉGITIME (un consultant interne peut avoir un coût chargé
   * nul dans certains montages) et ne bloque rien — les deux sont des valeurs
   * DISTINCTES en base (`bigint` nullable, sans contrainte `>= 0`) : les
   * confondre ferait bloquer une mission dont le coût est réellement zéro, ou
   * l'inverse, laisser passer une saisie qui n'a jamais eu lieu.
   *
   * AJOUTÉ EN FIN (GA-08), comme `timesheet_rejected` juste au-dessus.
   */
  'missing_cost',
  /**
   * #2566.2 — Le bon de commande EXISTE mais ne COUVRE PAS le mois facturé.
   *
   * Distinct de `missing_po` (l'ABSENCE) : ici, une référence est bien saisie,
   * mais sa date de validité (`poValidUntil`) tombe avant la fin du mois qu'on
   * facture — le cas concret nommé par le client, une mission longue dont le
   * bon de commande expire en cours de route. Confondre les deux ferait
   * proposer le même geste (« demander un PO ») à deux situations qui n'ont pas
   * la même réponse : redemander un numéro qu'on a déjà n'aide personne.
   *
   * AJOUTÉ EN FIN (GA-08), comme `timesheet_rejected` et `missing_cost`
   * au-dessus, pour la même raison exacte.
   */
  'po_period_mismatch',
  /**
   * #2422.9 (épopée #2869) — au moins un contrat de l'espace partage la
   * société de cette mission, et AUCUN de ceux qui matchent n'est actif
   * (`legalContractCoverage`, `contract.ts`) : la POLICY que le contrat
   * encode, jamais une exigence universelle de contrat présent.
   *
   * AJOUTÉ EN FIN (GA-08), comme les quatre blocages au-dessus.
   */
  'legal_contract_inactive',
] as const
export const invoiceBlockerSchema = z.enum(INVOICE_BLOCKERS)
export type InvoiceBlocker = (typeof INVOICE_BLOCKERS)[number]

/**
 * L'état de facturabilité d'un mois.
 *
 * `blocked` et `ready` ne suffisent pas : un mois déjà FACTURÉ (hors de Bellum,
 * dans l'outil comptable) doit sortir des relances, sinon on relance un client
 * qui a déjà payé — la façon la plus sûre de faire douter de tout le reste.
 */
/**
 * ⚠️ `not_due` est ajouté EN FIN de liste (GA-08), et sa contrainte SQL a été
 * élargie avant par la migration `1790050000001`. Il dit ce que ni `ready` ni
 * `blocked` ne savaient dire : sur une mission qui ne se facture pas au mois,
 * rien n'est cassé et rien n'est dû.
 */
/**
 * ⚠️ `invoiced_declared` — AJOUTÉ EN FIN (GA-08), décision Louis 21/09/2026
 * (#2197.41). Sa contrainte SQL est élargie AVANT le code qui l'écrit par la
 * migration `1795725508247`, qui rebascule aussi les lignes déjà écrites : le
 * seul chemin d'écriture existant (`InvoiceReadinessService.markInvoiced`) ne
 * porte AUCUNE preuve de connecteur, donc toute ligne `invoiced` d'avant cette
 * migration était en réalité une DÉCLARATION.
 *
 * « facturé » (prouvé par le connecteur de l'outil branché par le client) et
 * « déclaré facturé par `<personne>` le `<date>`, non confirmé » sont deux
 * états DISTINCTS, partout où la valeur voyage — listes, totaux, exports, ce
 * que Laura en dit, filtres. Ce n'est PAS un revirement de #2564 (« facturé »
 * ne s'écrit toujours que sur preuve de connecteur) : c'est cesser de
 * confondre une déclaration humaine avec cette preuve, en la NOMMANT au lieu
 * de l'interdire.
 */
export const INVOICE_READINESS_STATES = ['blocked', 'ready', 'invoiced', 'not_due', 'invoiced_declared'] as const
export const invoiceReadinessStateSchema = z.enum(INVOICE_READINESS_STATES)
export type InvoiceReadinessState = (typeof INVOICE_READINESS_STATES)[number]

/**
 * #2197.41 — un état qui se lit « facturé », prouvé OU déclaré. À utiliser
 * partout où la question est « ce mois est-il sorti de la relance/du
 * bloqueur ? », jamais dans un agrégat financier (`summarizeReadiness`, la
 * ligne `invoiced` de `RevenueService`) : là, seul `'invoiced'` (prouvé)
 * compte — voir la doctrine du fichier ci-dessus.
 */
export function isInvoicedState(state: InvoiceReadinessState): boolean {
  return state === 'invoiced' || state === 'invoiced_declared'
}

export const invoiceReadinessSchema = z.object({
  missionId: z.string().guid(),
  missionLabel: z.string().nullable(),
  accountName: z.string().nullable(),
  /**
   * L'identifiant du compte (30/08/2026, §9).
   *
   * ⚠️ Ajouté À CÔTÉ d'`accountName`, jamais à sa place : la requête est un
   * `LEFT JOIN accounts a ON a.id = m.account_id`
   * (`invoice-readiness.service.ts`), donc une mission sans compte existe —
   * `nullable`, comme `accountName`, pour la même raison exacte.
   *
   * Sans lui, la seule jointure fiable côté écran passait par `missionId` via
   * `GET /delivery/missions`, plafonné à 200 lignes sans pagination : un
   * compte dont toutes les missions tombaient au-delà du plafond s'affichait
   * « non mesuré », faute d'un identifiant à joindre. Joindre par NOM aurait
   * été pire — deux comptes peuvent porter le même nom, et un nom peut être
   * `null` — la « jointure par position » que ce dépôt a déjà payée.
   */
  accountId: z.string().guid().nullable(),
  /** Mois couvert, au premier du mois (`YYYY-MM-DD`). */
  periodMonth: z.string(),
  state: invoiceReadinessStateSchema,
  blockers: z.array(invoiceBlockerSchema),
  /** Jours déclarés. `null` = aucun relevé — pas zéro jour travaillé. */
  days: z.number().nullable(),
  /**
   * #2563 — D'OÙ viennent ces jours : le relevé (`cra`) ou une saisie SANS CRA
   * (`manual`, nommée « jours saisis, sans CRA » à l'écran). `null` = aucun
   * jour connu. `.optional()` : un objet écrit avant ce champ reste valide.
   */
  daysSource: z.enum(['cra', 'manual']).nullable().optional(),
  /**
   * Montant PRÉPARATOIRE, en centimes. `null` dès qu'un terme manque.
   *
   * Ni un dû, ni une facture : un chiffre calculé pour préparer, et nommé comme
   * tel partout où il s'affiche.
   */
  preparedAmountCents: z.number().int().nullable(),
  /** Quand quelqu'un a marqué le mois comme facturé ailleurs. */
  invoicedAt: z.string().nullable(),
  /**
   * #2197.41 — QUI a déclaré ce mois facturé (`invoice_readiness.invoiced_by`,
   * écrit depuis l'origine par `markInvoiced`, jamais rendu jusqu'ici). `null`
   * tant que `state !== 'invoiced_declared'`, ou sur une ligne écrite avant ce
   * lot dont l'auteur n'a pas été retrouvé. `.optional()` pour le deploy-skew,
   * comme `dailyRateCents` plus bas.
   */
  invoicedByName: z.string().nullable().optional(),
  /** La référence de la facture émise dans l'outil comptable. */
  invoiceReference: z.string().nullable(),
  /** Le montant RÉELLEMENT facturé. Différent du préparatoire quand il l'est,
   *  et c'est justement l'écart qu'on veut voir. */
  invoicedAmountCents: z.number().int().nullable(),
  /** L'échéance de règlement. Sans elle, aucun retard n'est calculable — et
   *  « 0 jour de retard » se lirait « elle vient d'échoir ». */
  dueOn: z.string().nullable(),
  /** Combien de relances ont déjà été faites sur ce mois. */
  remindersSent: z.number().int().nonnegative(),
  lastReminderAt: z.string().nullable(),
  /**
   * #2419.8 — LA PREUVE DU CONNECTEUR sur la dernière relance, s'il y en a
   * une. `null` = pas de preuve, donc PAS « envoyée » — une relance
   * consignée par un geste humain déclaratif reste « consignée », jamais
   * « envoyée » (doctrine `c31_relance_encaissement`, « Fait ne porte jamais
   * de preuve d'envoi »). Aujourd'hui, TOUJOURS `null` : aucun connecteur de
   * messagerie n'atteint cet écran — rien n'est inventé. `.optional()` pour
   * le deploy-skew, comme `invoicedByName` ci-dessus.
   */
  lastReminderMessageId: z.string().nullable().optional(),
  /**
   * Quand le client a RÉELLEMENT payé (I-77).
   *
   * ⚠️ La colonne existait, la route qui l'écrit aussi — et la LIGNE ne la
   * portait pas. L'écran ne pouvait donc pas savoir si un mois facturé était
   * encaissé : il proposait « marquer comme facturé » sur un mois déjà payé, et
   * la file des impayés n'existait nulle part.
   */
  paidAt: z.string().nullable(),
  /** Ce qui a été payé. Distinct du facturé : l'écart EST l'information. */
  paidAmountCents: z.number().int().nullable(),
  /**
   * Quand le client a CONTESTÉ cette facture (BEL-MIS-011).
   *
   * ⚠️ Les deux colonnes existaient depuis la migration `1789693128476`, avec
   * leur effet écrit noir sur blanc dans l'entité — « les relances s'arrêtent,
   * mais la ligne reste » — et **aucun chemin ne les écrivait**. Un litige se
   * gérait donc en annulant le « facturé », ce qui remettait le mois dans les
   * relances : on relançait un client qui conteste.
   *
   * `null` = personne n'a rien contesté. Ce n'est pas « le client est
   * d'accord » — c'est qu'aucun litige n'a été DÉCLARÉ ici.
   */
  disputedAt: z.string().nullable(),
  /** Ce que le client conteste, dans les mots de celui qui l'a entendu. Jamais
   *  vide quand un litige est ouvert : la contrainte SQL le tient aussi. */
  disputeReason: z.string().nullable(),
  /**
   * Quand le litige a été LEVÉ. `null` pendant qu'il court.
   *
   * On ne remet pas `disputedAt` à `null` : effacer ferait disparaître le fait
   * qu'une facture a été contestée, et c'est justement ce qu'il faut relire
   * pour comprendre un délai de paiement de quatre mois.
   */
  disputeResolvedAt: z.string().nullable(),
  /**
   * La facture ENTRANTE d'un sous-traitant sur CE mois (30/08/2026,
   * `supplier_invoices`) — distincte de la facturation CLIENT que porte tout
   * le reste de ce fichier. « Facture manquante », sur l'écran `/missions/
   * facturation`, désigne CETTE absence, jamais un document client qui
   * n'existe pas : lire une facture fournisseur n'est pas en émettre une, et
   * ce champ ne touche à aucun bloqueur ni à `state` — la position tenue
   * (Bellum s'arrête à « prêt à facturer ») ne bouge pas.
   *
   * `null` = la mission n'est pas sous-traitée (`mission_commercial_terms.
   * channel !== 'subcontracting'`) : la question ne se pose pas, ce n'est pas
   * une absence mesurée à `'missing'`. `'missing'` = sous-traitée, et aucune
   * facture fournisseur ne date de ce mois. `'received'` = au moins une en
   * porte la date.
   *
   * OPTIONNEL (`?`), et c'est délibéré : `InvoiceReadiness` est construit en
   * littéral à une bonne quinzaine d'endroits hors de ce lot (tests, démo,
   * pont copilote, écran des encaissements…) et les rendre tous obligatoires
   * sortirait très largement du périmètre de cette vague — certains de ces
   * fichiers sont explicitement hors périmètre. Absent = ce chemin-là n'a pas
   * encore calculé l'information ; le panneau de facturation le traite comme
   * `null` (non applicable), jamais comme un `'missing'` inventé.
   */
  supplierInvoiceStatus: z.enum(['missing', 'received']).nullable().optional(),
  /**
   * #2563.1 — Le TJM VENDU (`mission_commercial_terms`/`missions.daily_rate`),
   * en CENTIMES. `null` = non renseigné — c'est lui qui manque quand
   * `preparedAmountCents` vaut `null` faute de tarif. Le client demande
   * explicitement à le VOIR sur la préparation (« période, jours, TJM,
   * montant… ») : il n'était calculé qu'en interne par `prepared()`, jamais
   * rendu. NON gardé par `REDACTED_FINANCE_FIELDS` — le TJM de vente sort déjà
   * de l'API sans `finance:read` ailleurs dans le dépôt (voir la note de
   * `staffing.ts` sur ce point précis) ; l'inverse ici créerait une troisième
   * fausse alerte financière sur le même chiffre.
   *
   * OPTIONNEL, pour la même raison que `supplierInvoiceStatus` juste au-dessus :
   * `InvoiceReadiness` est construit en littéral à une quinzaine d'endroits
   * hors de ce lot.
   */
  dailyRateCents: z.number().int().nullable().optional(),
  /**
   * #2563.1/#2566.2 — La référence du bon de commande EN COURS sur la mission
   * (`mission_commercial_terms.po_number`), pour l'afficher dans les
   * RÉFÉRENCES de la préparation et pour que l'écran puisse nommer le geste
   * « renouveler » plutôt que « saisir ». `null` = non renseignée. Optionnel,
   * même raison que `dailyRateCents`.
   */
  poNumber: z.string().nullable().optional(),
  /**
   * #2566.2 — Le CHARGÉ D'AFFAIRES de la mission (`missions.owner_id`), résolu
   * en nom. C'est lui qui doit agir quand le bon de commande n'a plus cours —
   * le blocage nomme son OWNER plutôt que de désigner un écran vide. `null` =
   * la mission n'a pas de porteur déclaré, ce qui reste une fiche incomplète et
   * non une raison d'en deviner un. Optionnel, même raison que `dailyRateCents`.
   */
  ownerId: z.string().guid().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  /**
   * #2198.20 — L'INTERLOCUTEUR côté client, résolu en nom
   * (`missions.billing_contact_id` → `contacts.full_name`). Sans lui, la
   * ligne d'encaissement nommait le compte et la mission, jamais QUI appeler
   * pour la relance — un humain devait rouvrir la fiche mission pour le
   * retrouver. `null` = aucun contact de facturation saisi (le blocage
   * `missing_billing_contact` le dit déjà côté facturation ; ici ce n'est
   * qu'un champ manquant, pas une raison de relancer dans le vide). Optionnel,
   * même raison que `dailyRateCents`/`ownerName` ci-dessus : `InvoiceReadiness`
   * est construit en littéral à une quinzaine d'endroits hors de ce lot.
   */
  billingContactName: z.string().nullable().optional(),
  /**
   * #2197.9 — LA SOCIÉTÉ DE L'ESN qui émettrait la facture (`missions.
   * legal_entity_id` → `legal_entities.name`), pas celle du client
   * (`account_entities`, un objet différent — voir la note en tête de
   * `apps/web/src/features/legal-entities/api.ts`). `null` = aucune société
   * rattachée à la mission, ce qui reste une fiche incomplète et non une
   * raison d'en deviner une. Optionnel, même raison que `dailyRateCents` /
   * `ownerName` ci-dessus : `InvoiceReadiness` est construit en littéral à
   * une quinzaine d'endroits hors de ce lot.
   */
  legalEntityName: z.string().nullable().optional(),
})
export type InvoiceReadiness = z.infer<typeof invoiceReadinessSchema>

/**
 * LE STATUT DE CRA — quatre valeurs, pour le filtre déroulant « Statut CRA »
 * de `/missions/facturation` (maquette du 26/08, PDF-22 §6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PIÈGE NOMMÉ PAR LA FICHE DE LECTURE
 * ─────────────────────────────────────────────────────────────────────────
 * « L'état "conflit" n'existe pas. Ne pas l'ajouter : il se dérive d'un écart
 * non expliqué. » Il n'y a donc PAS de cinquième état dans `INVOICE_BLOCKERS`
 * ni de septième `TimesheetStatus` : `'conflict'` ci-dessous est une LECTURE
 * de {@link InvoiceReadiness.blockers}, calculée à la demande, jamais une
 * valeur stockée. Une dérivation vit à un seul endroit — ici — pour que le
 * filtre du dropdown, la colonne « Statut CRA » du tableau et la tuile
 * « CRA bloqué » ne puissent pas raconter trois histoires différentes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÉPARTITION DES SIX CODES `timesheet_*`
 * ─────────────────────────────────────────────────────────────────────────
 * `missing_timesheet`, `timesheet_not_submitted` et `timesheet_rejected`
 * partagent le même geste suivant — le CONSULTANT doit déposer ou redéposer
 * son relevé — et rejoignent donc `'not_submitted'` (« à compléter »).
 * `timesheet_not_validated` seul fait `'to_validate'` (« à valider ») : le
 * geste suivant change de main, c'est au CLIENT ou au delivery de trancher.
 * `timesheet_disputed` et `timesheet_anomalies` font `'conflict'` : les deux
 * signalent un ÉCART, contesté ou détecté, qui doit être expliqué avant que
 * le mois puisse redevenir « validé ». Une ligne SANS aucun de ces six codes
 * est `'validated'` — le défaut, jamais stocké, toujours conclu par élimination.
 *
 * Priorité quand plusieurs codes coexistent sur la même ligne (rare — une
 * anomalie peut être détectée sur un relevé encore en brouillon) :
 * `'not_submitted'` d'abord — un écart ne s'explique pas avant d'avoir été
 * déposé — puis `'conflict'`, puis `'to_validate'`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `null` — LE MOIS NON DÛ
 * ─────────────────────────────────────────────────────────────────────────
 * Une mission au forfait ou au jalon (`state === 'not_due'`) ne produit
 * JAMAIS de relevé mensuel : lui prêter un statut CRA — même « validé » —
 * répondrait à une question qui ne se pose pas. `null` la retire du
 * dénominateur, exactement comme un axe non évaluable sort d'un score
 * (`UnknownValue`/`ScoreWithAxes`) : ce n'est pas un cinquième état affiché,
 * c'est l'ABSENCE de la question.
 */
export const CRA_STATUS_VALUES = ['not_submitted', 'to_validate', 'validated', 'conflict'] as const
export type CraStatusValue = (typeof CRA_STATUS_VALUES)[number]

const CRA_STATUS_BY_BLOCKER: Readonly<Partial<Record<InvoiceBlocker, CraStatusValue>>> = {
  missing_timesheet: 'not_submitted',
  timesheet_not_submitted: 'not_submitted',
  timesheet_rejected: 'not_submitted',
  timesheet_not_validated: 'to_validate',
  timesheet_disputed: 'conflict',
  timesheet_anomalies: 'conflict',
}

/** Le rang de priorité quand plusieurs des six codes coexistent — voir la
 *  note au-dessus de {@link CRA_STATUS_VALUES}. */
const CRA_STATUS_PRIORITY: readonly CraStatusValue[] = ['not_submitted', 'conflict', 'to_validate']

export function craStatusOf(item: Pick<InvoiceReadiness, 'blockers' | 'state'>): CraStatusValue | null {
  if (item.state === 'not_due') return null
  const present = new Set(
    item.blockers
      .map(blocker => CRA_STATUS_BY_BLOCKER[blocker])
      .filter((status): status is CraStatusValue => status !== undefined),
  )
  for (const status of CRA_STATUS_PRIORITY) {
    if (present.has(status)) return status
  }
  return 'validated'
}

/**
 * La tuile « CRA bloqué » de la maquette — l'union des SIX codes `timesheet_*`
 * (§1 de ce lot), jamais un septième compté à part. Une ligne `null` (mois non
 * dû) n'est ni bloquée ni validée : elle sort du compte, comme partout ailleurs
 * dans ce fichier.
 */
export function isCraBlocked(item: Pick<InvoiceReadiness, 'blockers' | 'state'>): boolean {
  const status = craStatusOf(item)
  return status !== null && status !== 'validated'
}

/** Ce dont le calcul a besoin — jamais les entités complètes. */
type ReadinessInput = {
  timesheet: {
    /**
     * Le statut du relevé — la taxonomie NOMMÉE, pas une union recopiée.
     *
     * Elle était réécrite à la main ici, si bien qu'une valeur ajoutée à
     * `TIMESHEET_STATUSES` ne l'atteignait jamais : c'est le compilateur qui a
     * trouvé le trou le jour où `rejected` est né. Une taxonomie recopiée est
     * une taxonomie qui diverge.
     */
    status: TimesheetStatus
    days: number
    anomalies: string[]
    /** L'écart de jours, `null` quand il n'est pas mesurable. */
    gap?: number | null
    gapExplanation?: string | null
  } | null
  dailyRateCents: number | null
  /** L'espace exige-t-il un bon de commande sur cette mission ? */
  requiresPo: boolean
  poNumber: string | null
  invoicedAt: string | null
  /**
   * #2197.41 — `invoicedAt` PROUVÉ par le connecteur de l'outil branché par le
   * client, jamais deviné. `undefined`/`false` = c'est une DÉCLARATION (le
   * seul chemin d'écriture actuel, `markInvoiced`) : `state` sort alors
   * `'invoiced_declared'`, jamais `'invoiced'`.
   */
  invoiceConfirmedByConnector?: boolean
  /** À qui la facture part. Absent = bloqueur nommé, pas un silence. */
  billingContactId?: string | null
  /**
   * Le coût chargé, en CENTIMES (`mission_commercial_terms.
   * loaded_daily_cost_cents`) — distinct de `dailyRateCents`, qui est le TJM
   * VENDU. Même règle que `billingContactId` : `undefined` = l'appelant ne
   * sait pas — on ne bloque pas sur une information qu'on n'a pas demandée ;
   * `null` = on a regardé, et il n'y en a pas ; `0` = une valeur SAISIE,
   * légitimement nulle sur certains montages, qui ne bloque rien.
   */
  chargedCostCents?: number | null
  startedOn?: string | null
  /** Une mission qui ne fait pas de relevé (forfait, recrutement) : son mois ne
   *  se juge pas sur des jours. */
  expectsTimesheet?: boolean
  /**
   * Comment cette mission se facture. Une mission au JALON ou au FORFAIT ne se
   * facture pas au mois : l'écran mensuel n'a rien à lui demander.
   *
   * `null` / absent = on ne sait pas, et le statu quo est le mensuel — en
   * déduire l'inverse ferait disparaître de l'écran des missions qu'on facture
   * réellement chaque mois.
   */
  billingCadence?: BillingCadence | null
  /**
   * #2417.3 / #2417.4 — le montant que le CONTRAT déclare dû ce mois : la somme
   * des jalons déclarés échus dans le mois, sinon le retainer déclaré au
   * prorata des jours ouvrés (`billing-declarations.ts`, decisions §8).
   * `null`/absent = rien de déclaré, et le calcul d'avant s'applique (jours ×
   * TJM, ou « non dû » pour un jalon/forfait). Un montant DÉCLARÉ prime :
   * c'est ce que le contrat fait payer, pas une estimation.
   */
  declaredAmountCents?: number | null
  /**
   * #2566.2 — Le mois FACTURÉ (`YYYY-MM-DD`, premier du mois), nécessaire pour
   * comparer sa fin à `poValidUntil`. `undefined` = l'appelant ne le passe pas
   * (aucun appelant historique ne le faisait) — on ne bloque pas sur une
   * comparaison qu'on ne peut pas faire.
   */
  periodMonth?: string
  /**
   * #2566.2 — La date jusqu'à laquelle le bon de commande COUVRE (`mission_
   * commercial_terms.po_valid_until`). `undefined`/`null` = non renseignée : un
   * bon de commande sans échéance connue n'est pas présumé expiré, ce serait
   * inventer une date qu'on n'a pas. Même règle que `chargedCostCents`.
   */
  poValidUntil?: string | null
  /**
   * #2422.9 (épopée #2869) — la COUVERTURE contractuelle de la mission
   * (`legalContractCoverage`, `contract.ts`) : `'uncovered'` = au moins un
   * contrat de l'espace partage la société de la mission, et aucun de ceux
   * qui matchent n'est actif — la policy que le contrat encode, jamais une
   * exigence universelle codée en dur. `undefined` = société de la mission
   * inconnue, ou aucun contrat ne la partage : on ne bloque jamais sur une
   * comparaison qu'on ne peut pas faire honnêtement.
   */
  legalContractCoverage?: LegalContractCoverage
}

/**
 * #2566.2 — Le DERNIER jour calendaire d'un mois `YYYY-MM-DD` (premier du mois).
 *
 * `Date.UTC(année, mois, 0)` rend le dernier jour du mois PRÉCÉDENT le mois
 * `1..12` donné — l'astuce standard, en UTC pour ne jamais dépendre du fuseau
 * du serveur qui exécute le calcul (même piège que `startOfDay` de `staffing.ts`).
 */
function lastDayOfMonth(periodMonth: string): string {
  const year = Number(periodMonth.slice(0, 4))
  const month = Number(periodMonth.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

/**
 * Ce qui empêche de facturer ce mois, et le montant préparatoire s'il y en a un.
 *
 * L'ordre des bloqueurs suit la gravité, et `missing_timesheet` vient en tête :
 * c'est celui qui ne se signale nulle part et qui fait passer un mois entier.
 *
 * Un mois déjà facturé ailleurs sort de tout : ni bloqueur, ni relance. On ne
 * relance pas un client qui a payé.
 */
export function assessInvoiceReadiness(input: ReadinessInput): {
  state: InvoiceReadinessState
  blockers: InvoiceBlocker[]
  days: number | null
  preparedAmountCents: number | null
} {
  if (input.invoicedAt) {
    // #2197.41 — une déclaration humaine n'est pas une preuve de connecteur :
    // sans confirmation EXPLICITE du connecteur, ce mois est DÉCLARÉ facturé,
    // jamais PROUVÉ.
    return {
      state: input.invoiceConfirmedByConnector ? 'invoiced' : 'invoiced_declared',
      blockers: [],
      days: input.timesheet?.days ?? null,
      preparedAmountCents: prepared(input.timesheet?.days ?? null, input.dailyRateCents),
    }
  }

  const blockers: InvoiceBlocker[] = []
  // Un forfait ne se juge pas sur des jours : lui réclamer un relevé produirait
  // un bloqueur permanent que personne ne peut lever.
  const expectsTimesheet = input.expectsTimesheet ?? true

  if (expectsTimesheet) {
    if (!input.timesheet || input.timesheet.status === 'expected' || input.timesheet.status === 'missing') {
      blockers.push('missing_timesheet')
    } else if (input.timesheet.status !== 'not_required') {
      if (input.timesheet.status === 'draft') blockers.push('timesheet_not_submitted')
      if (input.timesheet.status === 'submitted') blockers.push('timesheet_not_validated')
      if (input.timesheet.status === 'disputed') blockers.push('timesheet_disputed')
      // Un relevé REJETÉ tombait ici sans produire aucun bloqueur — donc au
      // même rang que `validated`. Le mois partait « prêt à facturer » sur des
      // jours qu'un humain venait de refuser, et l'écran des relevés disait
      // l'inverse sur la même ligne.
      if (input.timesheet.status === 'rejected') blockers.push('timesheet_rejected')
      // Une anomalie sur un relevé VALIDÉ reste un bloqueur : le client a signé,
      // mais l'écart n'a pas été expliqué, et c'est lui qui reviendra dans trois
      // mois sous forme d'avoir.
      //
      // ⚠️ « pas expliqué » se VÉRIFIE désormais. La version précédente bloquait
      // sur `anomalies.length > 0` quoi qu'il arrive : expliquer l'écart —
      // c'est-à-dire faire EXACTEMENT le geste que `BLOCKER_ACTIONS` déclare
      // pour ce bloqueur (`action: 'explain_gap'`) — ne le levait jamais. Sur un
      // espace réel, neuf mois restaient « bloqués : anomalies » après que les
      // sept écarts eurent été expliqués, pendant que l'écran des relevés
      // affichait `blocksInvoicing: false` sur les mêmes lignes : deux écrans,
      // le même fait, deux réponses opposées, et aucune sortie.
      //
      // Ce que l'explication ne répond PAS reste bloquant : un chevauchement de
      // mission, un doublon déjà validé, une fraction de journée inhabituelle.
      // C'est la raison d'être de `gapAnomalyMessages` — la SEULE famille
      // qu'une explication d'écart couvre.
      const answered = new Set(
        gapBlocksInvoicing(input.timesheet.gap ?? null, input.timesheet.gapExplanation)
          ? []
          : gapAnomalyMessages(
              input.timesheet.days,
              input.timesheet.gap === null || input.timesheet.gap === undefined
                ? null
                : input.timesheet.days - input.timesheet.gap,
            ),
      )
      if (input.timesheet.anomalies.some(anomaly => !answered.has(anomaly))) {
        blockers.push('timesheet_anomalies')
      }
      const gap = input.timesheet.gap ?? null
      if (gap !== null && gap !== 0 && (input.timesheet.gapExplanation ?? '').trim().length === 0) {
        blockers.push('unexplained_gap')
      }
    }
  }

  if (input.dailyRateCents === null && expectsTimesheet) blockers.push('missing_rate')
  // Le coût CHARGÉ, distinct du TJM vendu juste au-dessus. Il n'est PAS gardé
  // par `expectsTimesheet` : un forfait ou un jalon a, lui aussi, un coût
  // interne à couvrir — la marge s'en sert quelle que soit la cadence de
  // facturation. `undefined` = l'appelant ne l'a pas demandé, `0` = saisi et
  // légitimement nul : seul `null` explicite bloque.
  if (input.chargedCostCents === null) blockers.push('missing_cost')
  if (input.requiresPo && !input.poNumber) blockers.push('missing_po')
  // #2566.2 — le bon de commande EXISTE mais ne couvre pas ce mois. Distinct de
  // `missing_po` juste au-dessus : les trois conditions (requis, présent, une
  // période ET une échéance CONNUES) évitent de bloquer sur une comparaison
  // qu'on ne peut pas faire honnêtement.
  if (
    input.requiresPo &&
    input.poNumber &&
    input.periodMonth &&
    input.poValidUntil &&
    input.poValidUntil < lastDayOfMonth(input.periodMonth)
  ) {
    blockers.push('po_period_mismatch')
  }
  // #2422.9 — la policy que le contrat encode : un contrat de l'espace partage
  // la société de la mission, et aucun de ceux qui matchent n'est actif.
  // `undefined` (société inconnue, ou aucun contrat qui matche) ne bloque
  // jamais — ce n'est pas une exigence universelle de contrat présent.
  if (input.legalContractCoverage === 'uncovered') blockers.push('legal_contract_inactive')
  // `undefined` = l'appelant ne sait pas — on ne bloque pas sur une information
  // qu'on n'a pas demandée. `null` = on a regardé, et il n'y en a pas.
  if (input.billingContactId === null) blockers.push('missing_billing_contact')
  if (input.startedOn === null) blockers.push('missing_start_date')

  const days =
    input.timesheet && input.timesheet.status !== 'expected' && input.timesheet.status !== 'missing'
      ? input.timesheet.days
      : null

  // Une mission qui ne se facture pas au mois n'est ni prête ni bloquée : la
  // question mensuelle ne se pose pas. Les bloqueurs restent RENDUS — une fiche
  // incomplète le reste, même si le mois n'est pas dû — mais l'état ne promet
  // aucune facturation, et le montant est `null` : `jours × TJM` n'est pas ce
  // qui sera facturé sur un jalon, et l'annoncer serait un chiffre inventé.
  //
  // Seule une cadence EXPLICITEMENT non mensuelle déclenche ce cas. `null` veut
  // dire « on ne sait pas » et garde le comportement d'avant.
  // #2417.3 / #2417.4 — un montant DÉCLARÉ au contrat pour ce mois (jalon
  // échu, retainer proratisé) rend le mois DÛ, pour ce montant-là. Placé AVANT
  // le « non dû » des cadences jalon/forfait : un jalon échu ce mois-ci est
  // justement ce qui fait facturer un forfait.
  if (input.declaredAmountCents !== undefined && input.declaredAmountCents !== null) {
    return {
      state: blockers.length === 0 ? 'ready' : 'blocked',
      blockers,
      days,
      preparedAmountCents: input.declaredAmountCents,
    }
  }
  if (input.billingCadence === 'milestone' || input.billingCadence === 'fixed_price') {
    return { state: 'not_due', blockers, days, preparedAmountCents: null }
  }

  return {
    state: blockers.length === 0 ? 'ready' : 'blocked',
    blockers,
    days,
    preparedAmountCents: prepared(days, input.dailyRateCents),
  }
}

/**
 * Le montant préparatoire. `null` dès qu'un terme manque — jamais 0 : « zéro
 * euro à facturer » et « on ne sait pas encore » ne se corrigent pas de la même
 * façon.
 */
function prepared(days: number | null, dailyRateCents: number | null): number | null {
  if (days === null || dailyRateCents === null) return null
  return Math.round(days * dailyRateCents)
}

/**
 * Les CADENCES de relance : trois rangs chacune, en jours après le PIVOT de
 * LEUR relance.
 *
 * ⚠️ Elles vivaient sur UN seul tableau partagé — et c'était faux : une
 * relance de RELEVÉ (« ton CRA n'est pas arrivé ») et une relance
 * d'ENCAISSEMENT (« ce client n'a pas payé ») n'ont ni le même pivot, ni la
 * même bonne cadence. Relancer un CLIENT à J+5 quand sa facture est réglée à
 * 30 jours l'agace deux à dix jours trop tôt — l'ESN a l'air de ne pas savoir
 * lire son propre contrat — alors que 5/12/20 jours reste le bon rythme pour
 * relancer un CONSULTANT qui n'a pas rendu son relevé.
 *
 *  - relance de RELEVÉ ({@link TIMESHEET_REMINDER_SCHEDULE_DAYS},
 *    `timesheets.service`) : pivot = la fin du mois travaillé. Un CRA d'août
 *    ne se relance pas le 6 août.
 *  - relance d'ENCAISSEMENT ({@link PAYMENT_REMINDER_SCHEDULE_DAYS},
 *    {@link reminderDue}) : pivot = l'ÉCHÉANCE DE RÈGLEMENT de la facture. Un
 *    mois d'août facturé à 60 jours n'est pas en retard le 5 septembre : il
 *    n'est même pas encore dû.
 *
 * Chacune graduée et BORNÉE à trois : au-delà, ce n'est plus une relance,
 * c'est du harcèlement, et le sujet doit remonter à un humain. Le produit ne
 * relance d'ailleurs personne tout seul ici — il dit qu'une relance est DUE.
 */
export const TIMESHEET_REMINDER_SCHEDULE_DAYS = [5, 12, 20] as const
/**
 * @deprecated Alias historique de {@link TIMESHEET_REMINDER_SCHEDULE_DAYS},
 * gardé UNIQUEMENT parce que `apps/api/.../delivery/timesheets.service.ts` et
 * `apps/web/.../missions/collections.ts` importent encore ce nom — hors du
 * périmètre de ce lot (le premier a un agent dessus EN CE MOMENT ; le second
 * est hors périmètre strict). Nouveau code : `TIMESHEET_REMINDER_SCHEDULE_DAYS`
 * pour un relevé, `PAYMENT_REMINDER_SCHEDULE_DAYS` pour un encaissement —
 * jamais ce nom.
 */
export const REMINDER_SCHEDULE_DAYS = TIMESHEET_REMINDER_SCHEDULE_DAYS

/**
 * Les conditions d'arrêt AUTOMATIQUE de la relance de RELEVÉ (#2416 —
 * LAU-FINAL-130, épopée #2972). Aucune n'est une valeur stockée : chacune est
 * un FILTRE calculé à la lecture par `TimesheetsService.dueReminders`, jamais
 * une colonne d'état séparée — même patron que `mission_suspended`/
 * `period_cancelled`, déjà livrés sur le statut de la mission.
 *
 * `manual_intervention` et `contact_changed` sont les deux dernières AJOUTÉES,
 * EN FIN (GA-08 : un enum ne perd jamais de valeur et n'en insère jamais au
 * milieu) — décision Louis 27/09/2026 :
 *  - `manual_intervention` — un humain a déjà agi sur ce relevé : la revue
 *    INTERNE (`internal_reviewed_at`, #2415.6) est le geste manuel déjà tracé
 *    par ce service, pas une colonne neuve inventée pour l'occasion ;
 *  - `contact_changed` — le contact CRA de la mission
 *    (`missions.cra_contact_id`) a changé depuis la première relance de la
 *    période en cours (`mission_timesheets.reminder_contact_id`, instantané
 *    posé par `recordReminder`).
 */
export const TIMESHEET_REMINDER_STOP_REASONS = [
  'mission_suspended',
  'period_cancelled',
  'manual_intervention',
  'contact_changed',
] as const
export type TimesheetReminderStopReason = (typeof TIMESHEET_REMINDER_STOP_REASONS)[number]

/**
 * La cadence d'ENCAISSEMENT — 7 / 15 / 30 jours après l'échéance de règlement.
 *
 * Distincte de {@link TIMESHEET_REMINDER_SCHEDULE_DAYS} depuis le 30/08/2026 :
 * les deux relances n'ont ni le même destinataire, ni la même bonne cadence,
 * et les confondre en faisait relancer un CLIENT trop tôt sur la cadence
 * pensée pour un CONSULTANT en interne.
 */
export const PAYMENT_REMINDER_SCHEDULE_DAYS = [7, 15, 30] as const
/** Le rang à partir duquel {@link reminderDue} rejoint aussi le chargé
 *  d'affaires (`missions.owner_id`) — le DERNIER rang de la cadence de
 *  paiement, jamais un chiffre recopié. */
export const MAX_REMINDERS = PAYMENT_REMINDER_SCHEDULE_DAYS.length

/**
 * #3671.3 (GA-26) — LE RETARD D'UN PAIEMENT, EN JOURS PLEINS, UNE SEULE FOIS.
 *
 * Recette prod 08/10 : la carte « Migration cloud » du briefing annonçait 67
 * jours de retard, son détail 31 — deux lectures du MÊME réglage qui avaient
 * fini par diverger parce qu'il était recalculé à deux endroits (une requête
 * SQL côté brief, cette formule côté écran). Un seul endroit la porte
 * désormais ; `reminderDue`, `overdueDaysAt` (`apps/web`, écran Encaissements)
 * et la lecture du brief (`briefing.service.ts`) l'appellent tous — aucun ne
 * la recopie.
 *
 * Le jour de l'échéance, le retard vaut 0 : elle vient d'échoir. `null` sans
 * échéance lisible — « on ne sait pas » ne se corrige pas comme « zéro jour ».
 */
export function overdueDaysFromDueOn(dueOn: string | null, now: Date): number | null {
  if (!dueOn) return null
  const due = Date.parse(`${dueOn.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(due)) return null
  return Math.floor((now.getTime() - due) / 86_400_000)
}

/**
 * Une relance d'ENCAISSEMENT est-elle due, et laquelle ?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PIVOT EST L'ÉCHÉANCE, ET IL NE L'ÉTAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Cette fonction comptait les jours après la fin du MOIS TRAVAILLÉ. La source
 * (PDF 6 §6.4) les compte après l'ÉCHÉANCE DE RÈGLEMENT, et c'est la seule
 * lecture défendable : un mois d'août facturé à 60 jours n'est pas en retard le
 * 5 septembre, il n'est même pas encore dû — la relance serait partie chez un
 * client qui n'a rien à se reprocher, ce qui est la façon la plus rapide de
 * faire cesser de lire les relances suivantes.
 *
 * `dueOn` est donc le pivot. Une échéance INCONNUE ne produit AUCUNE relance :
 * on ne devine pas une date, et « en retard » n'a pas de sens sans elle. C'est
 * le même refus qu'ailleurs — `markInvoiced` laisse déjà l'échéance à `null`
 * plutôt que d'en inventer une.
 *
 * Rend `null` quand il n'y a rien à faire. Cinq refus :
 *
 *  - **rien tant qu'aucune facture n'est partie** — l'état doit être `invoiced`.
 *    Réclamer le paiement d'un document qui n'existe pas est pire qu'un silence.
 *    Ce qui bloque la facturation se relance ailleurs et autrement : c'est la
 *    relance de RELEVÉ, avec son propre pivot (la fin du mois) ;
 *  - **rien sur un mois SOLDÉ** — on ne relance pas un client qui a payé. Le
 *    critère est le SOLDE et non la date (#2419.4) : un règlement partiel pose
 *    `paidAt` sans éteindre la dette, et sortir la ligne de la cadence laissait
 *    le reste dû ne plus jamais être réclamé ;
 *  - **rien sans échéance lisible** ;
 *  - **rien avant l'échéance de la relance suivante**, pour ne pas empiler ;
 *  - **rien au-delà de trois** — le silence après trois relances est un sujet
 *    de management, pas de cadence.
 *
 * ⚠️ Elle DIT qu'une relance est due ; elle n'en envoie aucune, et rien dans ce
 * fichier ne sait envoyer quoi que ce soit.
 *
 * Le résultat porte aussi `joinOwner` : au DERNIER rang de la cadence
 * ({@link PAYMENT_REMINDER_SCHEDULE_DAYS}), la source demande de prévenir
 * aussi le chargé d'affaires (`missions.owner_id`), pas seulement le contact
 * de facturation — si deux relances n'ont rien donné, c'est le porteur de la
 * mission qu'on informe avant que le sujet ne remonte à un humain
 * (`escalate_to_human`, côté écran). Cette fonction ne RÉSOUT pas
 * `owner_id` — elle n'a pas la donnée sous la main — elle dit seulement QUAND
 * le joindre ; c'est l'appelant qui a la mission qui fait le rapprochement.
 */
export function reminderDue(
  input: {
    state: InvoiceReadinessState
    /** L'échéance de règlement (`YYYY-MM-DD`). Le PIVOT. `null` = on ne sait
     *  pas, et on ne relance pas. */
    dueOn: string | null
    /** Quand le paiement a été constaté. SOLDÉ ⇒ plus jamais de relance — mais
     *  « constaté » ne veut pas dire « intégral », d'où les deux montants. */
    paidAt: string | null
    /**
     * Les DEUX montants du solde — obligatoires, et pour la raison exacte qui a
     * rendu le litige obligatoire un peu plus bas : #2419.4, un règlement de
     * 5 000 € sur 10 000 € posait `paidAt` et faisait sortir la ligne de la
     * cadence. Les rendre facultatifs laisserait un appelant refaire le défaut
     * en omettant simplement une propriété ; les rendre obligatoires RETIRE LE
     * MOYEN d'oublier — `tsc` nomme chaque appel qui ne s'est pas posé la
     * question. `null` reste une réponse : « on ne sait pas » se DIT.
     */
    paidAmountCents: number | null
    invoicedAmountCents: number | null
    remindersSent: number
    /**
     * Un litige OUVERT arrête la cadence — et ces deux champs sont OBLIGATOIRES.
     *
     * ⚠️ Ils ont été facultatifs, avec une raison qui semblait prudente : « un
     * appelant qui ne sait rien du litige garde exactement le comportement
     * d'avant ». C'est cette facultativité qui a produit le défaut. Il y a deux
     * appelants ; le service les passait, **l'écran ne les passait pas**, et
     * rien ne pouvait le dire — une propriété absente d'un objet littéral est
     * exactement ce que « facultatif » autorise. Résultat : la ligne affichait
     * « Relance n°2 due · Ton ferme » sur une facture que l'utilisateur venait
     * de déclarer contestée, pendant que le toast lui promettait « Les relances
     * s'arrêtent sur ce mois ».
     *
     * Les rendre obligatoires RETIRE LE MOYEN d'oublier au lieu d'ajouter une
     * consigne : `tsc` refuse désormais un appel qui ne s'est pas posé la
     * question. `null` reste une réponse — « pas de litige » se DIT, il ne
     * s'omet pas. Les deux appelants avaient déjà la donnée sous la main.
     */
    disputedAt: string | null
    disputeResolvedAt: string | null
  },
  now: Date,
): { index: number; overdueDays: number; dueSince: string; joinOwner: boolean } | null {
  // #2197.41 — un mois DÉCLARÉ facturé attend toujours son règlement : la
  // cadence de relance porte sur l'échéance et le solde, jamais sur la preuve
  // de connecteur. `isInvoicedState` couvre les deux — `invoiced` (prouvé) et
  // `invoiced_declared`.
  if (!isInvoicedState(input.state)) return null
  // #2419.4 — un paiement partiel ne sort pas de la file : ce qui arrête la
  // cadence est un SOLDE, pas une date. Une ligne réglée à moitié garde ses
  // relances, c'est la seule chose qui réclame le reste dû.
  if (isSettled(input)) return null
  // ⚠️ Le refus qui ne se déduit d'AUCUN état : une facture CONTESTÉE ne se
  // relance pas. Le client sait très bien qu'il n'a pas payé — il refuse de
  // payer, et lui redemander tous les sept jours pendant qu'un litige court est
  // la façon la plus sûre de le durcir.
  //
  // ⚠️ Ce refus et le pivot `dueOn` ont été écrits par deux lots parallèles et
  // fusionnés à la main le 27/08. Le premier raisonnait sur l'état `blocked`,
  // que le second a remplacé par `invoiced` + impayé. Le refus VAUT TOUJOURS,
  // et il vaut même mieux là : une facture partie, échue, impayée et contestée
  // est exactement le cas où la cadence ferait le plus de dégâts.
  if (isDisputeOpen(input)) return null
  if (input.remindersSent >= MAX_REMINDERS) return null
  if (!input.dueOn) return null

  const due = Date.parse(`${input.dueOn.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(due)) return null

  // GA-26 — LA MÊME fonction que `overdueDaysAt` (écran Encaissements) et que
  // la lecture du brief : le premier seuil est atteint le jour où le compteur
  // l'égale, jamais avant.
  const overdueDays = overdueDaysFromDueOn(input.dueOn, now)!
  const threshold = PAYMENT_REMINDER_SCHEDULE_DAYS[input.remindersSent]
  if (threshold === undefined || overdueDays < threshold) return null

  const index = input.remindersSent + 1
  return {
    index,
    overdueDays,
    // La date à laquelle CETTE relance est devenue due — pas celle de la
    // facture. « Due depuis le 5 octobre » se lit ; « 12 jours de retard » tout
    // seul oblige à refaire le calcul de tête.
    dueSince: new Date(due + threshold * 86_400_000).toISOString().slice(0, 10),
    // Le DERNIER rang, jamais un chiffre recopié : si la cadence change de
    // longueur un jour, ce test suit tout seul.
    joinOwner: index === PAYMENT_REMINDER_SCHEDULE_DAYS.length,
  }
}

export const markInvoicedSchema = z
  .object({
    /**
     * Quand la facture a été émise AILLEURS. Bellum n'en produit aucune ; il
     * enregistre seulement que ce mois est sorti de sa surveillance.
     */
    invoicedAt: z.string().datetime({ offset: true }).optional(),
    /**
     * La référence de la facture émise dans l'outil comptable (§8, exigence
     * 128). Sans elle, « facturé » est une case cochée que rien ne relie au
     * document réel : six mois plus tard, personne ne sait quelle facture
     * couvrait ce mois.
     */
    reference: z.string().trim().min(1).max(120).optional(),
    /** Le montant RÉELLEMENT facturé, en centimes. Il peut différer du
     *  préparatoire, et c'est justement l'écart qu'on veut voir. */
    amountCents: z.number().int().nonnegative().optional(),
    /** L'échéance de règlement, `YYYY-MM-DD`. C'est elle qui rend un retard
     *  calculable — sans elle, aucun impayé ne se voit. */
    dueOn: z.string().date().optional(),
  })
  .strict()
export type MarkInvoicedInput = z.infer<typeof markInvoicedSchema>

/**
 * Enregistrer un PAIEMENT reçu.
 *
 * ⚠️ Le geste qui manquait. `invoice_readiness.paid_at` était LU par le chiffre
 * d'affaires encaissé et par le délai de paiement, et **écrit par rien** : les
 * deux mesures étaient donc structurellement vides, et l'encaissé s'affichait
 * « 0 € » comme s'il était mesuré. Ajouter la lecture sans le geste qui écrit,
 * c'est fabriquer un indicateur qui ne bougera jamais.
 *
 * Bellum ne rapproche aucun compte bancaire (D33) : il enregistre ce que
 * quelqu'un CONSTATE. C'est la même honnêteté que « facturé ailleurs ».
 */
export const recordPaymentSchema = z
  .object({
    /** Quand le paiement a été constaté. Absent = maintenant. */
    paidAt: z.string().datetime({ offset: true }).optional(),
    /**
     * Ce qui a été payé, en centimes. Optionnel et JAMAIS déduit du montant
     * facturé : un paiement partiel est le cas normal d'un litige, et le
     * recopier ferait disparaître l'écart qu'on cherche justement à voir.
     */
    amountCents: z.number().int().nonnegative().optional(),
  })
  .strict()
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>

/**
 * Annuler un « marqué comme facturé » posé par erreur.
 *
 * Le geste était un ALLER SIMPLE : un mois marqué par erreur sortait
 * définitivement des relances — le client ne paie pas, personne ne le relance,
 * et rien ne le dit.
 *
 * On n'EFFACE pas la marque, on l'annule en gardant sa trace : effacer
 * `invoiced_at` ferait disparaître le fait qu'une facture a été annoncée, et
 * c'est précisément ce qu'il faut pouvoir relire. Le motif est OBLIGATOIRE —
 * une annulation sans raison est exactement ce qu'on ne saura pas relire dans
 * six mois — et la contrainte le tient en base, pas seulement ici.
 */
export const cancelInvoicedSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()
export type CancelInvoicedInput = z.infer<typeof cancelInvoicedSchema>

/**
 * DÉCLARER UN LITIGE sur une facture — BEL-MIS-011.
 *
 * **Le litige n'est pas un retard**, et c'est toute la décision : une facture
 * contestée n'est pas une facture payée en retard, elle est une facture dont on
 * discute. Les deux se traitaient pareil faute de chemin pour les distinguer,
 * avec deux conséquences chiffrées — le mois repartait dans les relances dès
 * qu'on annulait la marque « facturé », et son délai gonflait le délai de
 * paiement moyen de tout le portefeuille.
 *
 * Le motif est OBLIGATOIRE, comme pour l'annulation d'un « facturé » et pour la
 * même raison : « en litige » sans rien d'autre ne se relit pas. Ce qui est
 * écrit ici est ce que le client REPROCHE, dans les mots de celui qui l'a
 * entendu — jamais un code, jamais une catégorie devinée.
 */
export const disputeInvoiceSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()
export type DisputeInvoiceInput = z.infer<typeof disputeInvoiceSchema>

/**
 * Un litige COURT-il encore sur cette ligne ?
 *
 * Une seule dérivation, ici, parce que trois lectures en ont besoin — la
 * cadence des relances, le badge de l'écran et le geste inverse — et que trois
 * `Boolean(disputedAt) && !disputeResolvedAt` recopiés à la main divergeraient
 * le jour où l'un des trois oublie la seconde moitié.
 *
 * ⚠️ Ce n'est PAS le prédicat du délai de paiement : celui-là écarte toute
 * facture qui a été contestée, résolue ou non. Un litige levé ne réécrit pas le
 * temps qu'il a fait perdre.
 */
export function isDisputeOpen(row: { disputedAt?: string | null; disputeResolvedAt?: string | null }): boolean {
  return Boolean(row.disputedAt) && !row.disputeResolvedAt
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RESTE DÛ — #2419.4, un paiement partiel ne sort pas de la file
 * ─────────────────────────────────────────────────────────────────────────────
 * `paid_at` et `paid_amount_cents` sont DEUX colonnes, toutes deux constatées
 * par un humain. Tout ce qui concluait « payé » de la seule DATE traitait un
 * règlement de 5 000 € sur une facture de 10 000 € comme un solde : la ligne
 * quittait la file de relance, et les 5 000 € restants n'étaient plus jamais
 * réclamés — sans une alerte, sans un écran qui le dise.
 *
 * La dérivation vit ICI, à un seul endroit, parce que quatre lectures en ont
 * besoin — la cadence des relances, le statut de l'écran d'encaissement, la
 * prochaine action et les agrégats — et que quatre soustractions recopiées à la
 * main divergeraient au premier `null`.
 *
 * ⚠️ On ne DÉCIDE rien d'une absence. Deux montants peuvent manquer, et le
 * refus est le même dans les deux cas :
 *  - `paidAmountCents` inconnu : la ligne est payée d'un montant NON MESURÉ.
 *    La dire « partielle » accuserait un client de n'avoir payé qu'une part sur
 *    la foi d'un silence, et la remettrait dans une file de relance ;
 *  - `invoicedAmountCents` inconnu : le dénominateur manque, le rapport est
 *    indéterminé — « partiel » n'a alors aucun sens.
 *
 * « Non mesuré » n'est jamais « 0 » (GA-18 / GA-19) : le reste dû rend `null`,
 * jamais un zéro qui se lirait « plus rien à réclamer ».
 */
type SettlementRow = {
  /** Le montant RÉELLEMENT facturé — le seul dénominateur défendable. Ni le
   *  préparatoire, ni un prévisionnel. */
  invoicedAmountCents: number | null
  paidAt: string | null
  paidAmountCents: number | null
}

/**
 * Ce qu'il RESTE à encaisser sur une ligne facturée, en centimes.
 *
 * `null` = indéterminé, et ça se dit : ou le facturé manque, ou le règlement a
 * été constaté sans son montant. Un trop-perçu rend `0` et non un négatif — un
 * client qui a payé plus que la facture ne doit rien de moins que rien.
 */
export function outstandingAmountCents(row: SettlementRow): number | null {
  const invoiced = row.invoicedAmountCents
  if (invoiced === null || !Number.isFinite(invoiced)) return null
  // Rien n'a été constaté : ce qui reste dû est la facture entière.
  if (!row.paidAt) return invoiced
  const paid = row.paidAmountCents
  if (paid === null || !Number.isFinite(paid)) return null
  return Math.max(0, invoiced - paid)
}

/**
 * Le règlement constaté couvre-t-il MOINS que le facturé ?
 *
 * Vrai uniquement quand les DEUX montants sont lisibles et que l'écart est
 * positif. Une seule absence suffit à rendre `false` : voir le refus ci-dessus.
 */
export function isPartiallyPaid(row: SettlementRow): boolean {
  if (!row.paidAt) return false
  const outstanding = outstandingAmountCents(row)
  return outstanding !== null && outstanding > 0
}

/**
 * La ligne est-elle SOLDÉE — c'est-à-dire : n'y a-t-il plus rien à réclamer ?
 *
 * C'est le prédicat qui remplace partout `if (paidAt)`. Une ligne payée d'un
 * montant non mesuré est SOLDÉE : on ne relance pas quelqu'un dont on ignore
 * s'il reste redevable.
 */
export function isSettled(row: SettlementRow): boolean {
  return Boolean(row.paidAt) && !isPartiallyPaid(row)
}

export const invoiceReadinessQuerySchema = z
  .object({
    /** Mois à examiner (`YYYY-MM`). Défaut côté service : le mois précédent. */
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')
      .optional(),
    /** Ne rendre que ce qui BLOQUE. C'est la vue qu'on ouvre le 5 du mois. */
    blockedOnly: z.coerce.boolean().default(false),
    /**
     * Resserre sur UNE mission (30/08/2026) — le pendant de
     * `timesheetMonthQuerySchema.missionId`, qui existait déjà. Sans lui, la
     * fiche d'une mission n'avait aucun moyen de lire son propre état de
     * facturation : il fallait quitter la fiche et la retrouver dans la liste
     * mensuelle. Optionnel : absent, la route rend le mois ENTIER, comme avant.
     */
    missionId: z.string().guid().optional(),
  })
  .strict()
export type InvoiceReadinessQuery = z.infer<typeof invoiceReadinessQuerySchema>

/**
 * #2198.45 — L'EXPORT de l'écran `/missions/encaissements`.
 *
 * `list()` est MENSUEL ; l'écran interroge une fenêtre glissante de douze mois
 * (`COLLECTIONS_WINDOW_MONTHS`, `apps/web/.../collections.ts`) — le CSV doit
 * porter EXACTEMENT les mêmes mois que ce que l'écran a sous les yeux, jamais
 * une fenêtre recalculée séparément qui finirait par diverger. La liste vient
 * donc du NAVIGATEUR (qui l'a déjà calculée), en chaîne pour rester un query
 * param simple ; le serveur ne fait que la valider et la reparcourir.
 */
export const collectionsExportQuerySchema = z
  .object({
    /** `YYYY-MM` séparés par des virgules, 24 au plus — deux fenêtres, jamais
     *  un export qui traîne indéfiniment. */
    months: z
      .string()
      .regex(/^\d{4}-\d{2}(,\d{4}-\d{2}){0,23}$/, 'Format attendu : liste de AAAA-MM séparés par des virgules'),
  })
  .strict()
export type CollectionsExportQuery = z.infer<typeof collectionsExportQuerySchema>

/** Le total préparatoire d'un lot, et ce qu'il ne peut pas compter. */
export const readinessSummarySchema = z.object({
  ready: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  /** #2197.41 — PROUVÉ par le connecteur, et lui SEUL : un « déclaré facturé »
   *  ne compte jamais ici, sans quoi un encaissement affiché « facturé »
   *  pourrait n'être qu'une saisie manuscrite sans preuve. */
  invoiced: z.number().int().nonnegative(),
  /** DÉCLARÉ facturé par une personne, non confirmé — compté À PART, jamais
   *  fondu dans `invoiced` (voir ci-dessus). */
  invoicedDeclared: z.number().int().nonnegative(),
  /**
   * Somme des montants préparatoires des mois PRÊTS, et d'eux seuls.
   *
   * ⚠️ `nullable` depuis le 29/08/2026, et le `null` a UNE seule cause : le
   * lecteur n'a pas `finance:read`, et `redactFinance` a vidé la case. Le
   * calcul, lui, rend toujours un nombre — un mois sans aucune ligne chiffrée
   * vaut bien `0`, ce qui est VRAI. Rendre `0` à qui n'a pas le droit, en
   * revanche, annoncerait « rien à facturer ce mois-ci » (GA-18 / GA-19).
   */
  preparedAmountCents: z.number().int().nonnegative().nullable(),
  /** Ce qui est chiffré mais BLOQUÉ. Séparé du précédent : les additionner
   *  annoncerait une facturation qui n'aura pas lieu. `null` pour la même et
   *  unique raison que ci-dessus. */
  blockedAmountCents: z.number().int().nonnegative().nullable(),
  /** Combien de lignes n'ont pas pu être chiffrées. Sans ce compteur, un total
   *  partiel se lit comme un total. */
  withoutAmount: z.number().int().nonnegative(),
  /** Les mois qui ne sont pas DUS — mission au jalon, au forfait. Ni prêts, ni
   *  bloqués, et leur montant n'entre dans aucun total. */
  notDue: z.number().int().nonnegative(),
  /**
   * #2197.7 — combien de mois portent le bloqueur `unexplained_gap` (l'écart
   * de jours entre le relevé et l'attendu, JAMAIS expliqué). Il existait déjà
   * PAR LIGNE (`readiness.blockers.unexplained_gap`, une par une) ; sans ce
   * compteur, aucune tuile de `/missions/facturation` ne pouvait le résumer.
   *
   * Un mois peut porter CE bloqueur en même temps que d'autres — le compte
   * n'est donc PAS un sous-ensemble disjoint de `blocked`, il répond à une
   * question différente : « combien de mois ont un écart non expliqué »,
   * jamais « combien de mois sont bloqués ».
   */
  unexplainedGapCount: z.number().int().nonnegative(),
  /**
   * #2197.6 — combien de factures sont PRÉPARÉES ce mois : un brouillon
   * déposé chez le connecteur (`invoice_connector_write_requests.state IN
   * ('created', 'sent')`), pas encore confirmé ailleurs. Ce compte lit une
   * table que `summarizeReadiness` (pure, sans accès base) ne voit jamais —
   * `InvoiceReadinessService.list` l'ajoute APRÈS avoir appelé cette
   * fonction, ce qui est la raison pour laquelle elle est absente de son type
   * de retour (voir `Omit` ci-dessous) tout en restant obligatoire sur le fil.
   *
   * ⚠️ Jamais `created` ni `sent` seul : `created` est transitoire (écrasé
   * par `sent` dans le même appel, #2197.24) — les DEUX ensemble décrivent
   * « une tentative est en cours et n'a pas encore de réponse `invoiced` ni
   * `failed` ni `unknown` ».
   */
  preparedInvoicesCount: z.number().int().nonnegative(),
  /**
   * #2783 — combien d'avenants ont un EFFET dans le mois du résumé, à
   * l'échelle de l'ESPACE — décidés (`accepted`/`active`) séparés de
   * simulés (`proposed`), jamais fondus (même distinction que
   * `ForecastHorizonsService.compute`, GA-26). COMPTÉS, jamais chiffrés :
   * `new_term` est un JSON libre écrit par Laura (`propose_mission_amendment`,
   * aucune propriété déclarée dans son `input_schema`) — en extraire un
   * montant serait deviner (doctrine « un contrat d'API non vérifiable ne se
   * devine pas »).
   */
  amendmentsAccepted: z.number().int().nonnegative(),
  amendmentsSimulated: z.number().int().nonnegative(),
})
export type ReadinessSummary = z.infer<typeof readinessSummarySchema>

export function summarizeReadiness(
  rows: readonly Pick<InvoiceReadiness, 'state' | 'preparedAmountCents' | 'blockers'>[],
): Omit<ReadinessSummary, 'preparedInvoicesCount' | 'amendmentsAccepted' | 'amendmentsSimulated'> {
  let ready = 0
  let blocked = 0
  let invoiced = 0
  let invoicedDeclared = 0
  let preparedAmountCents = 0
  let blockedAmountCents = 0
  let withoutAmount = 0
  let notDue = 0
  let unexplainedGapCount = 0

  for (const row of rows) {
    // #2197.7 — indépendant des branches d'état ci-dessous : un mois qui
    // porte ce bloqueur reste compté ici QUELLE QUE SOIT sa branche, comme il
    // reste compté dans `blocked` ci-dessous s'il est bloqué. `?.` : certains
    // appelants (tests) construisent une ligne partielle sans `blockers`.
    if (row.blockers?.includes('unexplained_gap')) unexplainedGapCount += 1
    // ⚠️ Chaque état a sa branche NOMMÉE. La version d'avant finissait sur un
    // `else invoiced += 1` : toute valeur ajoutée à l'énumération se serait
    // annoncée « facturée » sans que rien ne casse — un compteur faux, et le
    // plus rassurant des quatre. #2197.41 — `invoiced_declared` a EXACTEMENT
    // cette branche nommée : sans elle, un « déclaré » retomberait soit dans
    // ce `else` (compté « non dû », faux), soit — pire — dans `invoiced`
    // (compté « prouvé », faux dans l'autre sens).
    if (row.state === 'ready') ready += 1
    else if (row.state === 'blocked') blocked += 1
    else if (row.state === 'invoiced') invoiced += 1
    else if (row.state === 'invoiced_declared') invoicedDeclared += 1
    else notDue += 1
    // Un mois déjà facturé ailleurs ne compte PAS dans le préparatoire : il est
    // sorti de la surveillance, et l'y garder gonflerait un chiffre censé
    // représenter ce qui reste à faire. Un mois NON DÛ en sort pour une autre
    // raison — il n'y a rien à facturer ce mois-ci — et surtout il ne compte
    // pas comme « sans montant » : ce n'est pas un chiffrage raté, c'est une
    // question qui ne se pose pas.
    if (isInvoicedState(row.state) || row.state === 'not_due') continue
    if (row.preparedAmountCents === null) {
      withoutAmount += 1
      continue
    }
    // Le défaut corrigé (§8, exigence 127) : le total additionnait PRÊT et
    // BLOQUÉ. Un mois bloqué n'est pas de l'argent qu'on va facturer — c'est de
    // l'argent qu'on ne peut PAS facturer, et les fondre en un chiffre unique
    // fait annoncer une facturation qui n'aura pas lieu.
    if (row.state === 'ready') preparedAmountCents += row.preparedAmountCents
    else blockedAmountCents += row.preparedAmountCents
  }

  return {
    ready,
    blocked,
    invoiced,
    invoicedDeclared,
    preparedAmountCents,
    blockedAmountCents,
    withoutAmount,
    notDue,
    unexplainedGapCount,
  }
}

/**
 * Ce qu'il faut FAIRE pour lever chaque bloqueur (§8).
 *
 * « Non facturable » sans indication oblige à rouvrir trois écrans pour
 * comprendre — et on ne le fait pas, alors le mois passe. Chaque bloqueur nomme
 * donc un geste et l'écran où il se fait.
 *
 * `route` est un chemin de l'application, jamais un lien externe : envoyer
 * quelqu'un dans un autre outil pour lever un bloqueur, c'est le perdre.
 */
export const BLOCKER_ACTIONS: Readonly<Record<InvoiceBlocker, { action: string; route: string }>> = {
  missing_timesheet: { action: 'open_timesheet', route: '/missions/cra' },
  timesheet_not_submitted: { action: 'remind_consultant', route: '/missions/cra' },
  timesheet_not_validated: { action: 'remind_client', route: '/missions/cra' },
  timesheet_disputed: { action: 'resolve_dispute', route: '/missions/cra' },
  // Le geste qui lève un rejet est un REDÉPÔT corrigé — ni une relance, ni une
  // négociation avec le client. Il se fait sur l'écran des relevés.
  timesheet_rejected: { action: 'resubmit_timesheet', route: '/missions/cra' },
  timesheet_anomalies: { action: 'explain_gap', route: '/missions/cra' },
  unexplained_gap: { action: 'explain_gap', route: '/missions/cra' },
  missing_rate: { action: 'set_rate', route: '/missions' },
  missing_po: { action: 'ask_po', route: '/missions' },
  missing_billing_contact: { action: 'set_billing_contact', route: '/missions' },
  missing_start_date: { action: 'set_start_date', route: '/missions' },
  missing_cost: { action: 'set_cost', route: '/missions' },
  // #2566.2 — le geste est de RENOUVELER le bon de commande, pas d'en saisir un
  // premier (`ask_po`, juste au-dessus) : la référence existe déjà.
  po_period_mismatch: { action: 'renew_po', route: '/missions' },
  // #2422.9 — le geste se fait sur la fiche contrat de la mission (compte →
  // onglet Missions → bloc Contrats, #2869), pas sur l'écran des relevés.
  legal_contract_inactive: { action: 'review_contract', route: '/accounts' },
}

/* ────────────────────────────────────────────────────────────────────────────
 *  LE COMPORTEMENT DE PAIEMENT D'UN CLIENT (PDF-06 §6.6, PDF-04 §1.1)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * « Ce client paie mal » — le dire AVANT la négociation, pas après.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ C'EST UN JUGEMENT SUR UN CLIENT. IL SE MESURE OU IL NE S'AFFICHE PAS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre règles, et chacune ferme une porte que ce dépôt a déjà vue s'ouvrir :
 *
 *  1. **Un DÉCOMPTE, avec son dénominateur et sa période.** « Trois retards sur
 *     onze factures, sur douze mois » est un fait. « Ce client paie mal » tout
 *     court est une opinion, et « 82 % de fiabilité » serait une probabilité —
 *     refusée six fois dans ce dépôt.
 *  2. **Sous le seuil, RIEN.** Deux factures ne font pas un comportement. Les
 *     décomptes valent alors `null`, jamais `0` : « zéro retard » est une bonne
 *     nouvelle, et on n'a rien mesuré du tout.
 *  3. **Ce n'est pas un CLASSEMENT.** On dit ce qui s'est passé sur CE compte ;
 *     rien ici ne range les clients du meilleur au pire, et la signature ne
 *     prend qu'un jeu de factures — elle ne sait pas comparer.
 *  4. **Retard et LITIGE ne se fondent pas.** Un client qui conteste ne paie pas
 *     parce qu'il conteste ; les additionner ferait passer un désaccord pour de
 *     la mauvaise volonté, et c'est l'inverse qu'il faut savoir avant d'appeler.
 */

/**
 * Le nombre de factures en dessous duquel il n'y a pas de comportement à lire.
 *
 * **Cinq**, comme l'intercontrat et la marge dans `MEASURABILITY_THRESHOLDS` :
 * le plus bas des seuils du produit, parce que le but est d'écarter le bruit des
 * premiers mois, pas d'atteindre une significativité qu'un outil commercial
 * n'atteindra jamais. Et nettement plus bas que le seuil du DSO (dix) : le DSO
 * publie une MÉDIANE de délais, qu'une facture aberrante déplace ; ici on ne
 * publie qu'un décompte, qu'aucune valeur extrême ne fausse.
 *
 * ⚠️ Il ne vit PAS dans `MEASURABILITY_THRESHOLDS` — et c'est une dette assumée,
 * pas un choix : `measurability.ts` était hors du périmètre du lot qui a livré
 * ce calcul. La suite juste est de l'y déplacer, pour que le registre des seuils
 * reste le seul endroit où on les lit tous.
 */
export const PAYMENT_BEHAVIOUR_MIN_INVOICES = 5

/**
 * La fenêtre, en mois GLISSANTS.
 *
 * Douze : un exercice complet, donc un cycle de trésorerie complet côté client —
 * y compris les mois où sa propre facturation se tend. Plus court laisserait un
 * client régulier passer pour mauvais sur une saison ; plus long ferait peser un
 * incident vieux de deux ans sur une négociation d'aujourd'hui, alors que la
 * personne qui payait a peut-être changé.
 */
export const PAYMENT_BEHAVIOUR_WINDOW_MONTHS = 12

/** Ce qu'une facture doit porter pour entrer dans le décompte. */
export interface PaymentBehaviourInvoice {
  /** Émise quand ? `null` = jamais émise — elle n'a pas encore d'histoire. */
  invoicedAt: string | null
  /** L'échéance. `null` = inconnue : sans elle, aucun retard ne se constate. */
  dueOn: string | null
  /** Réglée quand ? `null` = pas encore payée. */
  paidAt: string | null
  /**
   * #2419.4 — LES DEUX MONTANTS DU SOLDE, et ils manquaient.
   *
   * Ce décompte ne tenait que des dates : un client qui règle 500 € sur
   * 10 000 € le jour de l'échéance était compté « à l'heure », et son
   * `lateCount` restait à zéro. C'est pourtant le bloc qu'on montre AVANT de
   * renégocier des conditions de règlement — il disait l'inverse de ce qui
   * s'est passé. Un acompte ne dit rien du comportement de paiement : ce qui
   * le dit, c'est que le SOLDE soit rentré avant l'échéance.
   */
  paidAmountCents: number | null
  invoicedAmountCents: number | null
  /** Contestée quand ? `null` = aucun litige ouvert. */
  disputedAt: string | null
}

export interface PaymentBehaviour {
  /** Mesurable ou non, et de combien de factures il manque pour l'être. */
  measurability: Measurability
  /** LE DÉNOMINATEUR : les factures émises, à échéance connue, dans la fenêtre. */
  invoiceCount: number
  /**
   * Factures réglées après l'échéance, ou impayées et échues.
   *
   * ⚠️ `null` tant que le seuil n'est pas atteint — jamais `0`. Un zéro se lit
   * « ce client n'a jamais eu un jour de retard », c'est-à-dire une information,
   * et fausse.
   */
  lateCount: number | null
  /** Factures contestées, sur la MÊME population. `null` sous le seuil. */
  disputedCount: number | null
  /** Factures écartées faute d'échéance lisible. Comptées, jamais absorbées. */
  withoutDueDate: number
  /** La période sur laquelle tout ce qui précède a été compté. */
  windowMonths: number
}

export const paymentBehaviourSchema = z.object({
  measurability: measurabilitySchema,
  invoiceCount: z.number().int().nonnegative(),
  lateCount: z.number().int().nonnegative().nullable(),
  disputedCount: z.number().int().nonnegative().nullable(),
  withoutDueDate: z.number().int().nonnegative(),
  windowMonths: z.number().int().positive(),
})

/** `YYYY-MM-DD` d'un horodatage, ou `null` s'il n'est pas lisible. */
function isoDay(value: string | null): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString().slice(0, 10)
}

/**
 * Le comportement de paiement d'UN compte — jamais de plusieurs.
 *
 * ⚠️ Les dates se comparent en `YYYY-MM-DD`, jamais en horodatages : une facture
 * échue « le 30 juin » et réglée « le 30 juin à 18 h » a été payée à l'heure, et
 * comparer les instants la compterait en retard. Le piège a déjà été payé sur
 * l'agenda de ce dépôt.
 */
export function accountPaymentBehaviour(
  invoices: readonly PaymentBehaviourInvoice[],
  options: { now: Date; required?: number; windowMonths?: number },
): PaymentBehaviour {
  const windowMonths = options.windowMonths ?? PAYMENT_BEHAVIOUR_WINDOW_MONTHS
  const required = options.required ?? PAYMENT_BEHAVIOUR_MIN_INVOICES
  const today = options.now.toISOString().slice(0, 10)
  const floor = new Date(
    Date.UTC(options.now.getUTCFullYear(), options.now.getUTCMonth() - windowMonths, options.now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10)

  let invoiceCount = 0
  let lateCount = 0
  let disputedCount = 0
  let withoutDueDate = 0

  for (const invoice of invoices) {
    const issued = isoDay(invoice.invoicedAt)
    // Jamais émise, ou émise hors fenêtre : elle ne dit rien de la période.
    if (issued === null || issued < floor) continue
    const due = isoDay(invoice.dueOn)
    if (due === null) {
      // Comptée à PART. L'absorber dans le dénominateur ferait baisser la part
      // de retard sans qu'aucune facture n'ait été payée à l'heure.
      withoutDueDate += 1
      continue
    }
    invoiceCount += 1
    if (invoice.disputedAt !== null) disputedCount += 1
    // #2419.4 — un paiement partiel ne sort pas de la file : un acompte ne
    // solde rien, donc il ne compte pas comme un règlement. La ligne est alors
    // traitée comme ce qu'elle est — une facture dont il reste à encaisser, et
    // qui est en retard si son échéance est passée. Un règlement dont on
    // ignore le montant reste un SOLDE : on n'accuse pas un client d'un impayé
    // sur la foi d'une absence.
    const paid = isSettled(invoice) ? isoDay(invoice.paidAt) : null
    // Deux façons d'être en retard, et l'impayée échue est la plus coûteuse :
    // l'argent n'est jamais rentré.
    if (paid === null ? due < today : paid > due) lateCount += 1
  }

  const state = measurability(invoiceCount, required)
  return {
    measurability: state,
    invoiceCount,
    // ⚠️ Le refus. Sous le seuil, les décomptes n'existent pas — ils ne valent
    // pas zéro.
    lateCount: state.measurable ? lateCount : null,
    disputedCount: state.measurable ? disputedCount : null,
    withoutDueDate,
    windowMonths,
  }
}
