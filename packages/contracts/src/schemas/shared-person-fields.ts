/**
 * #4800.1 (Louis 29/10/2026) — « LE FAIT TRAVERSE, LA TRACE JAMAIS » : l'inventaire, champ par champ,
 * de ce qu'une PERSONNE (une fiche `contacts`) donne à la base commune entre espaces.
 *
 * L'arbitrage : un fait public d'une personne — son poste, son employeur, son ancienneté — n'est ni un
 * coût d'accès ni une donnée commerciale, il se mutualise. Ce qui reste cloisonné : QUI l'a cherchée,
 * QUI l'a contactée, et ce que l'accès a COÛTÉ (GA-43 : les espaces sont des concurrents).
 *
 * Deux listes, rien d'autre :
 *  · {@link SHARED_PERSON_PUBLIC_FIELDS} — le fait, avec la colonne COMMUNE où il atterrit ;
 *  · {@link SHARED_PERSON_TRACE_FIELDS} — la trace d'espace, qui ne franchit JAMAIS la frontière.
 *
 * Tenue par la garde `ga-418-fait-public-trace-jamais.spec.ts` : toute colonne des tables communes
 * est un fait déclaré ou un champ technique nommé ; aucune trace n'y est colonne ; et une colonne de
 * `contacts` qui a la FORME d'une trace (espace, utilisateur, coût, envoi, qui-a-fait-quoi) doit être
 * déclarée ici — sinon elle est un fait non classé, et la CI le dit.
 */

/** Un fait public d'une personne : le champ de la fiche d'espace, la table et la colonne COMMUNES. */
interface SharedPersonPublicField {
  /** Colonne de `contacts` d'où le fait est LU (ou, pour l'état employeur, la source qui le dérive). */
  readonly contactColumn: string
  readonly sharedTable: 'shared_company_people' | 'shared_person_coordinates'
  readonly sharedColumn: string
  readonly reason: string
}

export const SHARED_PERSON_PUBLIC_FIELDS: readonly SharedPersonPublicField[] = [
  {
    contactColumn: 'full_name',
    sharedTable: 'shared_company_people',
    sharedColumn: 'full_name',
    reason:
      'Nom d’une personne publique — seulement si Bellum l’a collecté (origine « bellum »), jamais un apport utilisateur.',
  },
  {
    contactColumn: 'title',
    sharedTable: 'shared_company_people',
    sharedColumn: 'title',
    reason: 'Son poste : le fait public par excellence. Un apport utilisateur ne garde que ce rôle, anonymisé.',
  },
  {
    contactColumn: 'linkedin_url',
    sharedTable: 'shared_company_people',
    sharedColumn: 'linkedin_url',
    reason: 'Son profil public.',
  },
  {
    contactColumn: 'lifecycle_state',
    sharedTable: 'shared_company_people',
    sharedColumn: 'employment_state',
    reason:
      'Son état chez la société (actuelle / ancienne) — jamais présenté comme actuel au-delà du seuil de fraîcheur.',
  },
  {
    contactColumn: 'contact_lifecycle_transitions.occurred_at',
    sharedTable: 'shared_company_people',
    sharedColumn: 'left_at',
    reason: 'La date de départ connue d’un ancien : son ancienneté chez la société.',
  },
  {
    contactColumn: 'email',
    sharedTable: 'shared_person_coordinates',
    sharedColumn: 'email',
    reason: 'Coordonnée PROFESSIONNELLE trouvée par Bellum — ni webmail grand public, ni correction humaine.',
  },
  {
    contactColumn: 'phone',
    sharedTable: 'shared_person_coordinates',
    sharedColumn: 'phone',
    reason: 'Idem pour le téléphone.',
  },
] as const

/**
 * Les colonnes des tables communes qui ne sont PAS un fait de la personne : clés, empreintes
 * d'effacement (c67), horodatages de la base commune, borne de scope (réel / démo).
 */
export const SHARED_PERSON_TECHNICAL_COLUMNS = [
  'id',
  'fact_id',
  'scope',
  'company_key',
  'origin',
  'fact_key',
  'person_fingerprints',
  'first_shared_at',
  'last_seen_at',
] as const

/**
 * Les traces d'espace d'une fiche — nommées, avec ce qu'elles disent. Aucune n'a de colonne commune.
 * Regroupées par nature : QUI (cherché / contacté / assigné), COMBIEN (coût d'accès), CE QUI S'EST PASSÉ
 * (envois, notes, statut), D'OÙ (provenance d'espace).
 */
export const SHARED_PERSON_TRACE_FIELDS = {
  /** L'espace et l'utilisateur : où et par qui la fiche a été créée ou suivie. */
  qui: [
    'workspace_id',
    'user_id',
    'assigned_to',
    'import_job_id',
    'identity_confirmed_by',
    'recommendation_authorized_by',
  ],
  /** Ce que l'accès a coûté (GA-43 : jamais agrégé entre espaces). */
  cout: ['email_cost_credits', 'phone_cost_credits'],
  /** Qui l'a contactée, quand, par quel canal : le journal d'envoi de l'espace. */
  contact: [
    'email_sent_at',
    'email_provider_message_id',
    'email_bounced_at',
    'email_send_state',
    'email_send_channel',
    'email_send_from',
    'email_send_attachments',
    'email_send_attempted_at',
    'email_sent_observed_at',
    'email_bounce_reason',
  ],
  /** Le travail commercial de l'espace sur la personne : statut, note, étiquettes, liens CRM. */
  travail: ['user_status', 'note', 'tags', 'crm_record_id', 'crm_synced_at', 'excluded_at', 'exclusion_reason'],
  /** Comment CET espace l'a enrichie : fournisseur, trace d'appel, résultat. */
  enrichissement: ['last_enrichment_provider', 'last_enrichment_result', 'enrichment_trace', 'enrichment_archive'],
} as const satisfies Record<string, readonly string[]>

/** Toutes les traces, à plat. */
export const SHARED_PERSON_TRACE_COLUMNS: readonly string[] = Object.values(SHARED_PERSON_TRACE_FIELDS).flat()

/**
 * La FORME d'une trace : un nom de colonne de fiche qui désigne un espace, un utilisateur, un coût,
 * un envoi ou un « par qui ». Une colonne qui a cette forme sans être déclarée ci-dessus est un fait
 * non classé (garde GA-418).
 */
export const SHARED_PERSON_TRACE_SHAPE =
  /(^workspace_id$|^user_id$|^assigned_to$|_by$|_cost|^email_sen[dt]|^email_bounce|_sent_)/
