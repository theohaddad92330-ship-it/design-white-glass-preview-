import { z } from 'zod'

/**
 * #4069.3 — LES FAITS DU COMPTE : UN SEUL CONTRAT, PARTAGÉ.
 *
 * Constat (#4068, carte du 12/10) : chaque consommateur lisait ses sources à
 * sa façon — l'historique des signaux tronqué à 48 h / 7 j, le CRM réduit aux
 * affaires ouvertes, DataForge hors contexte, les analyses passées jamais
 * relues. Décision Louis 12/10 : toute la donnée accumulée est un intrant du
 * TRAITEMENT. Ce contrat est la forme unique sous laquelle elle voyage vers le
 * pipeline d'analyse (#4070), Laura (#4071), les écrans (#4072) et les exports
 * (#4073).
 *
 * Trois règles tiennent dans la forme elle-même :
 *  - **aucun champ de provenance** (« jamais nommé », renverse #2291.3) : un
 *    fait se dit par sa NATURE (`kind`) et sa DATE. Le schéma est `strict()` :
 *    un `source`, `provider` ou `origin` glissé par un producteur est REFUSÉ,
 *    pas silencieusement ignoré ;
 *  - **toujours daté** (aucune coupure d'âge) : `date` et `ageDays` sont
 *    obligatoires — un fait sans date n'est pas un fait du socle ;
 *  - **le poids est décoté, jamais une probabilité** : `weight` est un rang
 *    relatif (≥ 0) calculé par `account-facts-weight.ts` (#4069.2), jamais
 *    affiché comme un pourcentage.
 */
export const ACCOUNT_FACT_KINDS = [
  'hiring',
  'need',
  'signal',
  'deal_won',
  'deal_lost',
  'deal_dormant',
  /** #3918.6 — une mission arrive à 90 jours de sa fin connue : renouvellement à examiner. */
  'deal_renewal',
  'mission',
  'note',
  'meeting',
  'correction',
  'market_observation',
  'document',
  /**
   * #4072.2/.3 — un échange (e-mail, appel, rendez-vous) en MÉTADONNÉES : date,
   * destinataire, sujet. JAMAIS le corps (doctrine c96) : le libellé est construit
   * sans lire `activities.body`.
   */
  'exchange',
  /**
   * #4284.19 — le PARCOURS d'une personne chez ce compte (rôle passé ou en cours, daté par ses propres dates) :
   * l'historique ancien que ni les signaux ni les affaires ne portent.
   */
  'career',
] as const
export type AccountFactKind = (typeof ACCOUNT_FACT_KINDS)[number]

const factDateSchema = z.union([z.string().datetime({ offset: true }), z.string().date()])

export const accountFactSchema = z
  .object({
    /** Date du fait lui-même (pas de sa collecte) — ISO 8601, jour ou instant. */
    date: factDateSchema,
    kind: z.enum(ACCOUNT_FACT_KINDS),
    /** Ce que dit le fait, en une ligne — jamais le corps d'un message. */
    label: z.string().trim().min(1).max(280),
    /** Poids décoté par l'âge, bonifié par la récurrence (#4069.2). Rang relatif, jamais une probabilité. */
    weight: z.number().finite().min(0),
    /** Âge en jours entiers au moment de la lecture (`asOf`). */
    ageDays: z.number().int().min(0),
    /** Lien public vers le fait, quand il en a un. */
    url: z.string().url().optional(),
  })
  .strict()
export type AccountFact = z.infer<typeof accountFactSchema>

/** La réponse du lecteur unique (#4069.1) : les faits, les plus pesants d'abord. */
export const accountFactsSchema = z
  .object({
    /** L'instant contre lequel `ageDays` et `weight` ont été calculés. */
    asOf: z.string().datetime({ offset: true }),
    facts: z.array(accountFactSchema),
  })
  .strict()
export type AccountFacts = z.infer<typeof accountFactsSchema>

/**
 * #4072 — la forme AFFICHABLE d'un fait (date · TYPE · libellé · lien) : ce que
 * les écrans d'action portent. Ni poids (jamais une probabilité), ni provenance.
 */
export const accountFactBriefSchema = z
  .object({
    date: factDateSchema,
    kind: z.enum(ACCOUNT_FACT_KINDS),
    label: z.string().trim().min(1).max(280),
    url: z.string().url().optional(),
  })
  .strict()
export type AccountFactBrief = z.infer<typeof accountFactBriefSchema>

/**
 * #4072.3 — la fiche de préparation d'un rendez-vous : ce que l'espace sait de
 * CE compte, rangé par ce qu'on y cherche. Chaque ligne est un fait daté ; une
 * rubrique vide ne se rend pas (une absence ne fait aucune ligne).
 */
export const accountFactsBriefSchema = z
  .object({
    asOf: z.string().datetime({ offset: true }),
    /** Affaires passées : gagnées, perdues, en sommeil — les plus récentes d'abord. */
    deals: z.array(accountFactBriefSchema),
    missions: z.array(accountFactBriefSchema),
    /** Besoins exprimés au moins deux fois, à des jours distincts (signal fort, Louis 12/10). */
    recurringNeeds: z.array(
      z
        .object({
          label: z.string().min(1).max(280),
          occurrences: z.number().int().min(2),
          lastDate: z.string(),
        })
        .strict(),
    ),
    /** Derniers échanges, en métadonnées (date, destinataire, sujet) — jamais le corps. */
    exchanges: z.array(accountFactBriefSchema),
    /**
     * #4069.4 — les notes de l'équipe sur le compte, lisibles hors de Laura. Champ AJOUTÉ : absent d'une API
     * antérieure (jamais une erreur de lecture qui effacerait toute la fiche).
     */
    notes: z.array(accountFactBriefSchema).optional(),
    /**
     * #4424.3 — les comptes rendus de rendez-vous (notes nées de la cascade post-RDV) : ce que
     * le R2 reprend du R1. Champ AJOUTÉ, optionnel pour la même raison que `notes`.
     */
    meetings: z.array(accountFactBriefSchema).optional(),
    /** #4424.3 — les besoins ENREGISTRÉS sur le compte (jamais une offre publiée), datés. */
    needs: z.array(accountFactBriefSchema).optional(),
  })
  .strict()
export type AccountFactsBrief = z.infer<typeof accountFactsBriefSchema>

/**
 * #4072.2 — ce qu'une relance porte pour être écrite en connaissance de cause :
 * l'historique d'échanges en MÉTADONNÉES (date, destinataire, sujet — jamais le
 * corps) et les faits récents du compte. Une rubrique sans fait est absente.
 */
export const relanceHistorySchema = z
  .object({
    exchanges: z.array(accountFactBriefSchema).max(3),
    recent_facts: z.array(accountFactBriefSchema).max(2),
  })
  .strict()
export type RelanceHistory = z.infer<typeof relanceHistorySchema>

/**
 * #4072.1 — les personnes que l'espace CONNAÎT déjà chez ce compte : contacts
 * déjà présents dans « Votre CRM » et interlocuteurs de missions passées. Sert à
 * marquer et prioriser l'organigramme. Une personne = un nom, ses raisons, la
 * date du fait le plus récent — jamais d'où ça vient au-delà de ces deux natures.
 */
export const KNOWN_PERSON_REASONS = ['crm', 'mission'] as const
export const knownPeopleSchema = z
  .object({
    people: z.array(
      z
        .object({
          fullName: z.string().min(1).max(200),
          reasons: z.array(z.enum(KNOWN_PERSON_REASONS)).min(1),
          /** Date du fait le plus récent (mission, synchronisation) — `null` = inconnue, jamais devinée. */
          lastDate: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict()
export type KnownPeople = z.infer<typeof knownPeopleSchema>
export type KnownPerson = KnownPeople['people'][number]
