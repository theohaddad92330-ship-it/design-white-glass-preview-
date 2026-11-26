import { z } from 'zod'
import { BLOCKER_ACTIONS } from './invoice-readiness.js'
import { missionStatusSchema, RENEWAL_J60_DAYS } from './mission.js'

/**
 * ADMINISTRATION DES VENTES — ce qui doit être complet pour qu'une mission
 * puisse DÉMARRER ou se RENOUVELER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN DOMAINE À PART, ET PAS UNE COLONNE DE PLUS SUR LA FACTURATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `invoice-readiness.ts` répond à « puis-je facturer CE MOIS-CI cette mission ? ».
 * Sa maille est le couple (mission, mois) et son pivot est le relevé d'activité.
 * L'ADV répond à une autre question, plus tôt : « ce dossier est-il en état de
 * démarrer, ou d'être reconduit ? ». Sa maille est le DOSSIER — une mission vue
 * sous l'angle d'un ÉVÉNEMENT (un démarrage, un renouvellement) — et son pivot
 * est l'administratif : à qui on facture, sous quelle référence, à quelles
 * conditions, avec quel bon de commande.
 *
 * Les deux se croisent sur deux faits, et ces deux-là sont RÉUTILISÉS TELS
 * QUELS ({@link ADV_BLOCKERS}) : « personne à qui envoyer la facture » et « pas
 * de bon de commande ». En inventer une seconde graphie aurait produit deux
 * vérités sur le même fait, traduites deux fois, comptées deux fois, et
 * divergentes au premier changement de règle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « RIB MANQUANT » N'EXISTE PAS, ET C'EST DÉLIBÉRÉ (31/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette nomme un motif « RIB manquant ». Le dépôt refuse par écrit, à
 * trois endroits, de stocker un moyen de paiement — « Bellum ne signe rien, ne
 * paie rien et ne stocke aucun IBAN » (`admin-docs.ts`, la migration
 * `AdminDocsConnections`, `tool-catalog.ts`). Ce refus n'est pas levé ici.
 *
 * Ce qui reste VRAI du motif est un ÉTAT : les coordonnées de règlement ont-elles
 * été transmises, et quand. C'est exactement l'information dont l'ADV a besoin
 * — elle relance tant que la réponse est non — et elle n'exige de conserver
 * aucun numéro. D'où {@link ADV_BLOCKERS}.`payment_details_not_transmitted`, et
 * un champ qui ne porte qu'une DATE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS MESURÉ ICI, ET LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux choses de la maquette n'ont aucune source dans le dépôt au 31/08/2026 :
 *
 *  - les DELTAS mensuels (« vs juil. 2026 +9 »). Aucune photo mensuelle des
 *    compteurs ADV n'existe. {@link advSummarySchema} les déclare `null` — et
 *    `z.null()` plutôt qu'un `nullable()` : le contrat RETIRE le moyen d'écrire
 *    « +0 » au lieu d'interdire de le faire. Le jour où la photo mensuelle
 *    atterrit, ce schéma doit changer, et le changement se voit en revue.
 *  - « EN NÉGOCIATION ». `MISSION_STATUSES` n'a pas cet état, et la négociation
 *    vit sur un AUTRE objet (les projets et leurs étapes), donc sur une autre
 *    population. Même traitement : `null`, et l'écran écrit « non mesuré ».
 */

// ── Le dossier ───────────────────────────────────────────────────────────────

/**
 * Les deux ÉVÉNEMENTS qui ouvrent un dossier ADV.
 *
 * Ce ne sont pas deux statuts de mission : une même mission peut avoir eu son
 * dossier de démarrage, puis en ouvrir un de renouvellement six mois plus tard.
 * Ce qui se répare n'est d'ailleurs pas le même — un démarrage attend une
 * référence et un contact, un renouvellement attend surtout un bon de commande.
 */
export const ADV_DOSSIER_KINDS = ['start', 'renewal'] as const
export const advDossierKindSchema = z.enum(ADV_DOSSIER_KINDS)
export type AdvDossierKind = (typeof ADV_DOSSIER_KINDS)[number]

/**
 * `complete` est une CONCLUSION, pas une case à cocher — elle se déduit de
 * l'absence de motif, exactement comme `ready` côté facturation. Personne ne
 * peut la forcer : il n'y a pas de champ pour ça.
 */
export const ADV_DOSSIER_STATES = ['incomplete', 'complete'] as const
export const advDossierStateSchema = z.enum(ADV_DOSSIER_STATES)
export type AdvDossierState = (typeof ADV_DOSSIER_STATES)[number]

/**
 * Ce qui empêche un dossier de démarrer ou d'être reconduit. Liste FERMÉE,
 * ordonnée par gravité : le premier motif est celui qu'il faut traiter.
 *
 * Les DEUX PREMIERS sont repris VERBATIM d'{@link INVOICE_BLOCKERS} — même
 * chaîne, même sens, même route de réparation (voir {@link ADV_BLOCKER_ACTIONS},
 * qui les DÉRIVE au lieu de les recopier).
 *
 * ⚠️ `kyc_not_validated` est RÉSERVÉ et n'est produit par AUCUN calcul de ce
 * fichier. Sa place existe pour que le lot qui livre le KYC des entités de
 * facturation n'ait pas à insérer une valeur au milieu d'une taxonomie déjà
 * écrite en base (GA-08). Tant qu'il n'est pas branché, son compteur vaut
 * `null` — « non mesuré » — et surtout pas `0`, qui se lirait « aucun KYC à
 * valider » sur un espace où personne n'a jamais regardé.
 */
export const ADV_BLOCKERS = [
  /** Personne à qui envoyer la facture. RÉUTILISÉ d'`INVOICE_BLOCKERS`. */
  'missing_billing_contact',
  /** Aucun bon de commande, alors que le client en exige un. RÉUTILISÉ. */
  'missing_po',
  /** La référence que le client exige de voir portée sur la facture (numéro
   *  fournisseur, référence de commande). Sans elle, la facture part et revient. */
  'missing_client_reference',
  /**
   * Aucune entité de facturation cliente DÉSIGNÉE sur ce dossier : on ne sait
   * pas à quelle personne morale la facture s'adresse.
   *
   * ⚠️ Ce motif porte la DÉSIGNATION, pas la VÉRIFICATION D'IDENTITÉ — et la
   * frontière est délibérée. `account_entities.siren` est optionnel, et rien
   * dans le produit ne l'écrit aujourd'hui : en faire le test allumerait cette
   * pastille sur 100 % des dossiers, partout, pour toujours. Une pastille qui
   * ne se vide jamais cesse d'être lue en une semaine.
   *
   * Ce qui se répare ici est un geste humain — choisir l'entité, avec son
   * auteur et sa date. La moitié « cette personne morale est-elle bien celle
   * qu'elle dit être » est exactement {@link ADV_BLOCKERS}.`kyc_not_validated`,
   * livrée par le lot des entités de facturation. Un motif, une vérité.
   */
  'missing_billing_entity',
  /** À combien de jours ce client règle. Sans elle, aucune échéance n'est
   *  calculable — et « 0 jour de retard » se lirait « elle vient d'échoir ». */
  'unknown_payment_terms',
  /**
   * Les coordonnées de règlement n'ont pas été transmises au client.
   *
   * Un ÉTAT, avec sa date — jamais un numéro. Voir l'entête du fichier : le
   * refus de stocker un IBAN n'est pas levé par ce lot.
   */
  'payment_details_not_transmitted',
  /**
   * RÉSERVÉ — jamais produit ici. Voir l'avertissement ci-dessus.
   */
  'kyc_not_validated',
] as const
export const advBlockerSchema = z.enum(ADV_BLOCKERS)
export type AdvBlocker = (typeof ADV_BLOCKERS)[number]

/**
 * Les motifs dont la PLACE est réservée mais qu'aucun calcul ne produit.
 *
 * Écrit ici plutôt que déduit à la lecture : un motif jamais produit et un
 * motif dont le compteur tombe à zéro se ressemblent à l'écran, et seul le
 * premier doit dire « non mesuré ».
 */
export const ADV_RESERVED_BLOCKERS: readonly AdvBlocker[] = ['kyc_not_validated']

/**
 * Où l'on va RÉPARER chaque motif. Même forme exacte que
 * {@link BLOCKER_ACTIONS} : « non conforme » sans geste oblige à rouvrir trois
 * écrans pour comprendre, et personne ne le fait.
 *
 * Les deux codes partagés HÉRITENT leur entrée — la recopier les ferait
 * diverger le jour où l'écran de réparation déménage.
 *
 * ⚠️ Chaque route de cette table doit exister dans l'arbre de routes réel. La
 * garde `apps/web/src/architecture/adv-blockers-lead-somewhere.test.ts` le
 * vérifie contre `routeTree.gen.ts`, pas contre une liste écrite à la main.
 */
export const ADV_BLOCKER_ACTIONS: Readonly<Record<AdvBlocker, { action: string; route: string }>> = {
  missing_billing_contact: BLOCKER_ACTIONS.missing_billing_contact,
  missing_po: BLOCKER_ACTIONS.missing_po,
  missing_client_reference: { action: 'set_client_reference', route: '/missions/adv' },
  missing_billing_entity: { action: 'set_billing_entity', route: '/missions/adv' },
  unknown_payment_terms: { action: 'set_payment_terms', route: '/missions/adv' },
  payment_details_not_transmitted: { action: 'record_payment_details_sent', route: '/missions/adv' },
  // Le KYC se valide sur la fiche du COMPTE, où vivent les entités de
  // facturation — pas sur cet écran. La route reste juste même quand le motif
  // n'est pas encore produit.
  kyc_not_validated: { action: 'validate_kyc', route: '/accounts' },
}

// ── Le calcul ────────────────────────────────────────────────────────────────

/** Ce dont le calcul a besoin — jamais l'entité complète. */
type AdvDossierInput = {
  kind: AdvDossierKind
  /** À qui la facture part. `null` = un motif, pas un détail. */
  billingContactId: string | null
  /** Le client exige-t-il un bon de commande ? */
  requiresPo: boolean
  poNumber: string | null
  clientBillingReference: string | null
  /**
   * Les conditions de règlement, en jours. `null` = personne ne les a saisies.
   * `0` n'est PAS une condition de règlement — « comptant » se saisit autrement
   * et personne ne l'a saisi ici : les deux se traitent donc pareil, et le
   * schéma d'écriture refuse `0` pour que le cas ne puisse pas naître.
   */
  paymentTermsDays: number | null
  /** Quand les coordonnées de règlement ont été transmises. `null` = jamais. */
  paymentDetailsTransmittedAt: string | null
  /**
   * L'entité de facturation CLIENTE désignée sur ce dossier.
   *
   * `null` couvre DEUX cas qui se réparent du même geste : personne n'en a
   * désigné, ou celle qui l'était ne résout plus (fusionnée, reprise ailleurs).
   * L'appelant les replie en amont, et c'est délibéré : les séparer produirait
   * deux pastilles pour une seule action.
   */
  clientEntityId: string | null
}

function blank(value: string | null): boolean {
  return (value ?? '').trim().length === 0
}

/**
 * Ce qui manque à ce dossier, et rien d'autre.
 *
 * L'ordre du résultat suit celui d'{@link ADV_BLOCKERS} : le premier motif rendu
 * est celui à traiter en premier.
 *
 * ⚠️ Aucun champ de cette fonction n'est optionnel, et c'est délibéré : un
 * appelant qui « ne sait pas » produirait un dossier complet par omission. La
 * facturation a déjà payé ce défaut une fois — un champ facultatif que l'écran
 * ne passait pas, et personne ne pouvait le voir. `tsc` refuse ici de laisser la
 * question sans réponse.
 */
export function assessAdvDossier(input: AdvDossierInput): { state: AdvDossierState; blockers: AdvBlocker[] } {
  const blockers: AdvBlocker[] = []

  if (input.billingContactId === null) blockers.push('missing_billing_contact')
  if (input.requiresPo && blank(input.poNumber)) blockers.push('missing_po')
  if (blank(input.clientBillingReference)) blockers.push('missing_client_reference')
  if (input.clientEntityId === null) blockers.push('missing_billing_entity')
  if (input.paymentTermsDays === null || input.paymentTermsDays <= 0) blockers.push('unknown_payment_terms')
  if (input.paymentDetailsTransmittedAt === null) blockers.push('payment_details_not_transmitted')

  // `kyc_not_validated` n'est PAS produit ici : voir ADV_RESERVED_BLOCKERS.

  return { state: blockers.length === 0 ? 'complete' : 'incomplete', blockers }
}

/**
 * Depuis combien de jours ce dossier attend — `null` quand on ne sait pas.
 *
 * `null` et jamais `0` : « ouvert aujourd'hui » et « on ignore quand il s'est
 * ouvert » n'appellent pas le même geste, et un dossier éternellement « ouvert
 * il y a 0 jour » ne remonterait jamais en tête d'une file triée par ancienneté.
 */
export function advAgeDays(openedOn: string | null, now: Date = new Date()): number | null {
  if (!openedOn) return null
  const opened = new Date(`${openedOn}T00:00:00.000Z`)
  if (Number.isNaN(opened.getTime())) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((today - opened.getTime()) / 86_400_000)
}

/**
 * Le jour où un dossier de RENOUVELLEMENT devient à traiter : J-60 de la fin.
 *
 * Pas la date de début de la mission — une mission de trois ans n'a pas un
 * dossier de renouvellement vieux de trois ans. {@link RENEWAL_J60_DAYS} est
 * repris du calcul existant, jamais recopié : c'est la même fenêtre que celle
 * qui alimente `GET /delivery/renewals`.
 */
export function advRenewalOpenedOn(endsOn: string | null): string | null {
  if (!endsOn) return null
  const end = new Date(`${endsOn}T00:00:00.000Z`)
  if (Number.isNaN(end.getTime())) return null
  const opened = new Date(end.getTime() - RENEWAL_J60_DAYS * 86_400_000)
  return opened.toISOString().slice(0, 10)
}

// ── Ce qui voyage ────────────────────────────────────────────────────────────

export const advDossierSchema = z.object({
  missionId: z.string().guid(),
  missionLabel: z.string().nullable(),
  /** `null` = mission sans compte. La jointure est un `LEFT JOIN`, donc le cas
   *  existe — même raison exacte que sur `invoiceReadinessSchema`. */
  accountId: z.string().guid().nullable(),
  accountName: z.string().nullable(),
  kind: advDossierKindSchema,
  missionStatus: missionStatusSchema,
  state: advDossierStateSchema,
  blockers: z.array(advBlockerSchema),
  /** Le jour où le dossier est devenu à traiter. `null` = non mesuré. */
  openedOn: z.string().nullable(),
  startedOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  clientBillingReference: z.string().nullable(),
  paymentTermsDays: z.number().int().positive().nullable(),
  /** La DATE de transmission. Jamais de numéro : voir l'entête du fichier. */
  paymentDetailsTransmittedAt: z.string().nullable(),
  clientEntityId: z.string().guid().nullable(),
  clientEntityName: z.string().nullable(),
})
export type AdvDossier = z.infer<typeof advDossierSchema>

/**
 * Les six tuiles de la maquette « Administration des ventes ».
 *
 * `in_negotiation` en fait partie et n'est PAS mesurable : la nommer et écrire
 * « non mesuré » dessous est le seul rendu honnête. La retirer ferait croire
 * qu'on n'a jamais eu la question ; y écrire un chiffre plausible serait pire.
 */
export const ADV_TILES = ['all', 'starts', 'renewals', 'active', 'ready_to_invoice', 'in_negotiation'] as const
export type AdvTile = (typeof ADV_TILES)[number]

/**
 * Les tuiles qui FILTRENT réellement la file de travail.
 *
 * Une tuile non mesurée ne peut pas filtrer : cliquer dessus rendrait une liste
 * vide, qui se lit « il n'y en a aucun » — le faux vert que ce lot refuse.
 */
export const ADV_FILTERABLE_TILES = ADV_TILES.filter(tile => tile !== 'in_negotiation') as readonly AdvTile[]
export const advTileSchema = z.enum(['all', 'starts', 'renewals', 'active', 'ready_to_invoice'])

export const advSummarySchema = z.object({
  /** Le mois observé, `AAAA-MM`. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  total: z.number().int().nonnegative(),
  /** Les démarrages du mois. Source : `missions.started_on`. */
  starts: z.number().int().nonnegative(),
  /** Les renouvellements à traiter. Source : `GET /delivery/renewals`. */
  renewals: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  /** Les dossiers dont le mois est déjà `ready` côté facturation — LU dans
   *  `invoice_readiness`, jamais recalculé : deux écrans ne doivent pas rendre
   *  deux verdicts pour le même mois. */
  readyToInvoice: z.number().int().nonnegative(),
  /**
   * ⚠️ TOUJOURS `null`, et le contrat le TIENT. `MISSION_STATUSES` n'a pas
   * d'état « en négociation » ; ce qui se négocie vit sur les projets, donc sur
   * une autre population. Voir l'entête du fichier.
   */
  inNegotiation: z.null(),
  incomplete: z.number().int().nonnegative(),
  /**
   * La variation du nombre de DÉMARRAGES par rapport au mois précédent.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ CE CHAMP A CHANGÉ DE TYPE LE 31/08/2026 — `z.null()` → `nullable()`
   * ─────────────────────────────────────────────────────────────────────────
   * Il était `z.null()` **exprès** : « le contrat RETIRE le moyen d'écrire
   * “+0” au lieu d'interdire de le faire », et l'entête de ce fichier promet
   * que « le jour où la photo mensuelle atterrit, ce schéma doit changer, et le
   * changement se voit en revue ». Ce commentaire EST cette revue.
   *
   * Ce qui a changé : un DÉMARRAGE est un **flux daté** — une mission dont
   * `started_on` tombe dans le mois. Il se recompte à l'identique pour n'importe
   * quel mois passé, aujourd'hui comme dans six mois, parce que la date ne bouge
   * pas. Il n'a donc pas besoin d'être photographié : la doctrine de la photo
   * (`metric-snapshot.ts`, D2 · 31/08) protège les **stocks**, dont la valeur
   * d'hier devient rétroactivement fausse quand on corrige une donnée passée.
   * `contribution.service.ts` porte déjà exactement cette distinction : « les
   * comptages qu'elle sert sont des flux datés, donc hors de la photo ».
   *
   * ⚠️ `nullable()` et non un entier obligatoire : le PREMIER mois d'un espace
   * n'a pas de mois de référence, et ce n'est pas une panne. `null` reste donc
   * une réponse — celle qui fait écrire « non mesuré » à l'écran.
   */
  startsDelta: z.number().int().nullable(),
  /**
   * ⚠️ TOUJOURS `null` **en pratique**, et pour une raison qui n'a pas bougé.
   *
   * Le type s'aligne sur son voisin — deux champs jumeaux qui ne se typent pas
   * pareil finissent par se traiter différemment à l'écran —, mais le
   * calcul reste impossible : `renewals` ne vient PAS d'une table datée, il
   * vient de `DeliveryService.renewalsToAct`, dont la fenêtre J-60/J-30 est
   * relative à **maintenant**. « Les renouvellements à traiter en juillet » n'est
   * pas recomposable en août : la question elle-même a bougé avec le calendrier.
   *
   * Ce n'est donc pas la même absence que celle du premier mois, et l'écran le
   * dit autrement — voir `AdvService.summarise`.
   */
  renewalsDelta: z.number().int().nullable(),
  /** Une entrée par motif, dans l'ordre d'{@link ADV_BLOCKERS}. `count: null`
   *  = motif non mesuré (réservé), jamais « aucun ». */
  byBlocker: z.array(z.object({ blocker: advBlockerSchema, count: z.number().int().nonnegative().nullable() })),
})
export type AdvSummary = z.infer<typeof advSummarySchema>

export const advDossiersQuerySchema = z
  .object({
    /** `AAAA-MM`. Absent = le mois courant, résolu par le serveur. */
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')
      .optional(),
    tile: advTileSchema.optional(),
    blocker: advBlockerSchema.optional(),
    q: z.string().trim().max(120).optional(),
  })
  .strict()
export type AdvDossiersQuery = z.infer<typeof advDossiersQuerySchema>

/**
 * Le plafond de `DeliveryService.list()`
 * (`apps/api/src/modules/delivery/delivery.service.ts`), MIROIR ici — pas
 * IMPORTÉ. L'ADV LIT et APPELLE le module `delivery`, il ne le modifie
 * jamais (périmètre du lot) ; `delivery` n'exporte donc rien à réutiliser.
 *
 * ⚠️ **Une COPIE, pas une source unique** : si ce plafond change côté
 * `delivery.service.ts`, cette constante diverge en silence. C'est le prix
 * d'une frontière de module qu'aucun des deux côtés n'a le droit de
 * franchir pour partager UNE constante — nommé ici pour qu'on le relise le
 * jour où `renewalsTruncated` se met à mentir.
 */
export const ADV_RENEWALS_SOURCE_CAP = 200

/**
 * Ce que `GET /adv/dossiers` rend : la file, son mois, son résumé — et si la
 * population des RENOUVELLEMENTS a pu être TRONQUÉE en silence (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `renewalsTruncated`, ET CE QU'IL NE PROUVE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `DeliveryService.list()` plafonne à {@link ADV_RENEWALS_SOURCE_CAP}
 * missions, SANS pagination — sur un espace plus grand, la file ADV mentirait
 * par omission sans qu'aucun signal ne le dise. `renewalsTruncated` compare
 * le nombre de renouvellements ACTIONABLES reçus à ce plafond.
 *
 * ⚠️ C'est un signal SÛR mais INCOMPLET, écrit en toutes lettres plutôt que
 * caché : il ne peut jamais dire « tronqué » à tort (`renewalsToAct` filtre
 * un sous-ensemble du plafond, donc l'atteindre PROUVE que la source l'a
 * atteint aussi), mais il peut manquer une troncature réelle — si le
 * plafond a coupé la source AVANT le filtre actionable, en écartant
 * justement des missions SANS date de fin (`ends_on IS NULL`, triées en
 * dernier), la population actionable reçue peut rester petite alors que la
 * vraie population, elle, était tronquée. Une détection complète demanderait
 * de paginer `DeliveryService.list()` lui-même — hors du périmètre de ce
 * lot, qui ne fait que LIRE et APPELER ce service.
 */
export const advDossiersPageSchema = z.object({
  month: z.string(),
  items: z.array(advDossierSchema),
  summary: advSummarySchema,
  renewalsTruncated: z.boolean(),
})
export type AdvDossiersPage = z.infer<typeof advDossiersPageSchema>

/**
 * Le geste de réparation — le SEUL chemin d'écriture du domaine.
 *
 * `.strict()` n'est pas décoratif : il refuse par construction un champ qui
 * porterait un moyen de paiement. Ce qui se saisit de la transmission est un
 * BOOLÉEN ; c'est le serveur qui pose la date, et il n'y a nulle part où
 * ranger un numéro.
 *
 * `null` RETIRE un terme ; `0` est refusé. Un champ financier se retire, il ne
 * se met pas à zéro — sinon « pas de conditions de règlement » devient
 * « règlement comptant », ce que personne n'a décidé.
 */
export const updateAdvDossierSchema = z
  .object({
    clientBillingReference: z.string().trim().min(1).max(80).nullable().optional(),
    paymentTermsDays: z.number().int().positive().max(365).nullable().optional(),
    clientEntityId: z.string().guid().nullable().optional(),
    paymentDetailsTransmitted: z.boolean().optional(),
  })
  .strict()
export type UpdateAdvDossierInput = z.infer<typeof updateAdvDossierSchema>
