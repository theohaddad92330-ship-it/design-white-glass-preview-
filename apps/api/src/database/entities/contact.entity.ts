import type {
  ApolloContactProfile,
  ContactActivity,
  ContactAvailability,
  ContactEnrichmentTrace,
  ContactRelation,
  ContactSignal,
  EnrichmentCoordinateStates,
  PhoneNature,
  PhoneNatureSource,
} from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

type ContactMessage = {
  subject?: string
  body: string
  channel?: 'email' | 'linkedin'
}

@Entity({ name: 'contacts' })
export class ContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * L'entreprise du contact. NULLABLE depuis #1473 : un contact rencontré en
   * salon ou recommandé sans société n'avait nulle part où exister, la colonne
   * étant `NOT NULL`. `null` = « à qualifier » — un état honnête, pas un
   * compte vide qu'on aurait inventé pour satisfaire la contrainte.
   *
   * ⚠️ Toute lecture qui joint `accounts` depuis `contacts` doit être un LEFT
   * JOIN, sinon le contact DISPARAÎT de la liste sans que rien ne le signale.
   */
  @Index()
  @Column('uuid', { nullable: true })
  account_id: string | null

  @Index()
  @Column('uuid')
  user_id: string

  // Team scope (multi-user Phase 2). Nullable while the user_id → workspace_id
  // roll-out is mid-flight (see agent_docs/multi-user-workspaces.md): the Phase-1
  // migration backfilled it 1:1 from each row's owner workspace, and it flips to
  // NOT NULL only once every write path stamps it. `user_id` stays as the
  // created-by attribution; `workspace_id` becomes the read scope.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  // Porteur du contact — l'équivalent de `accounts.assigned_to` (migration
  // 1788236104913). NULL = non attribué, l'état honnête de départ : la colonne
  // n'est PAS backfillée depuis `user_id`, qui reste l'attribution de création.
  @Column('uuid', { nullable: true })
  assigned_to: string | null

  @Column('text')
  full_name: string

  @Column('text', { nullable: true })
  title: string | null

  @Column('text', { nullable: true })
  entity: string | null

  /**
   * L'entité du compte à laquelle ce contact appartient (PDF 2 §2).
   *
   * `entity` au-dessus reste le LIBELLÉ libre que le pipeline écrit ; celui-ci
   * est la CLÉ. Les deux coexistent délibérément : le libellé est ce que la
   * source a dit, la clé est ce que quelqu'un a validé. Écraser le premier avec
   * le second effacerait la trace de ce qu'on avait lu.
   */
  @Column('uuid', { nullable: true })
  entity_id: string | null

  // Business family (IT / Cyber / Data / IA / Infra / Dev / PMO / Finance /
  // C-Level / Achat / RH) — the decision-maker taxonomy from Phase 3 classify.
  @Column('text', { nullable: true })
  family: string | null

  @Column('text', { nullable: true })
  decision_role: string | null

  @Column('integer', { nullable: true })
  priority: number | null

  @Column('text', { nullable: true })
  email: string | null

  @Column('boolean', { default: false })
  email_verified: boolean

  /**
   * #2295.4bis — décision Louis 18/09/2026 (question 24, née de la livraison
   * de #2295.4) : un fait de SEMIS de démonstration ("ce contact est
   * UTILISABLE EN DÉMONSTRATION"), distinct d'{@link email_verified} par
   * construction — son nom ne dit rien sur une adresse réelle.
   *
   * `false` par défaut, et `true` UNIQUEMENT sur les lignes posées par le jeu
   * de données de démonstration (`demo-dataset.ts` via
   * `DemoSeedService.demoContactRow`) — jamais sur un espace réel. Garde de
   * frontière : `apps/api/src/architecture/demo-seed-first-door-is-demo-only.spec.ts`.
   * Migration `1795712710555`.
   */
  @Column('boolean', { default: false })
  demo_seed_first_door: boolean

  @Column('text', { nullable: true })
  phone: string | null

  @Column('text', { nullable: true })
  linkedin_url: string | null

  // #219.8 (LAU-FINAL-219, #3231) — la relation personne↔entreprise DÉCLARÉE
  // (correction du commercial, champ CRM dédié — jamais devinée depuis un
  // `employmentHistory` Apollo). Une des treize valeurs de `PersonCompanyRelation`
  // (`apps/ia/app/services/person_company_relation.py`, GA-26 : un seul
  // vocabulaire) ; NULL = non déclarée, lue comme `unknown_relationship` — pas
  // une hypothèse par défaut. Contrainte SQL : migration
  // `ContactDeclaredPersonCompanyRelation1796376150639`.
  @Column('text', { nullable: true })
  declared_person_company_relation: string | null

  // Real Apollo profile photo (People Search / Match — free field of the same
  // call). NULL = no known photo → the UI keeps its initials fallback. Never a
  // generated/placeholder image. Migration 1785930000000.
  @Column('text', { nullable: true })
  photo_url: string | null

  @Column('text', { nullable: true })
  profile_summary: string | null

  @Column('text', { nullable: true })
  why_contact: string | null

  @Column('jsonb', { nullable: true })
  email_message: ContactMessage | null

  @Column('text', { nullable: true })
  linkedin_message: string | null

  @Column('text', { nullable: true })
  phone_script: string | null

  /** Le contenu prêt à copier de chaque touche de la cadence email (annexe
   *  méthodo p12 : « une preuve NEUVE par touche »). Les touches J+3/J+6/J+9
   *  étaient des rappels datés sur le MÊME email — une répétition, pas une
   *  séquence. Rempli par la phase 4 (`bellum_messages.cadence`). NULL = un
   *  dossier antérieur. Voir migration `1788020000001`. */
  @Column('jsonb', { nullable: true })
  cadence_messages: { relance?: string; preuveSociale?: string; closeLoop?: string } | null

  @Column('jsonb', { nullable: true })
  followup_message: ContactMessage | null

  @Column('text', { default: 'new' })
  user_status: string

  // Palier 1 « Envoie l'email » : timestamp du dernier envoi du brouillon
  // `email_message` au contact depuis Bellum. NULL = jamais envoyé (l'envoi est
  // idempotent : un contact déjà marqué ne peut pas être ré-envoyé sans reset).
  //
  // ⚠️ #2733 — `email_sent_at` prouve que Resend a ACCEPTÉ le message, jamais
  // qu'il est arrivé (doctrine c73_fait_ne_porte_pas_preuve_denvoi). Un
  // écran qui affiche « envoyé » sur ce seul champ affirme un vérifié qui
  // n'en est pas un — la vérité de LIVRAISON est `email_bounced_at`
  // ci-dessous, jamais un remplacement de cette date.
  @Column('timestamptz', { nullable: true })
  email_sent_at: Date | null

  // L'identifiant RENDU PAR RESEND (`data.id`) au moment de l'envoi — la seule
  // clé qui permette de relier un événement `email.bounced` du webhook à CE
  // contact précis (Resend ne connaît ni notre espace, ni notre contact_id).
  // NULL avant tout envoi, ou pour un contact envoyé avant #2733 (rebond
  // indétectable rétroactivement — assumé, pas de backfill possible : Resend
  // ne redonne jamais l'identifiant d'un envoi déjà parti).
  @Column('text', { nullable: true })
  email_provider_message_id: string | null

  // #2733 (SKAIZen Group, 22/09/2026) — un rebond (adresse inexistante,
  // domaine invalide) redescend ICI depuis le webhook Resend
  // (`ResendWebhookController`), jamais en écrasant `email_sent_at` : on
  // archive, on ne supprime pas (doctrine). NULL = aucun rebond connu ; posé
  // = la preuve de livraison que `email_sent_at` semblait porter est fausse,
  // et la cadence de relance s'arrête (`CadenceService.cancelForBounce`).
  @Column('timestamptz', { nullable: true })
  email_bounced_at: Date | null

  // #3699.4/.5 — le SORT de l'envoi individuel (`CONTACT_SEND_STATES`), le canal
  // par où il est parti (`CONTACT_SEND_CHANNELS`), l'adresse d'expédition RÉELLE
  // et l'instant de la tentative. NULL = aucune tentative enregistrée ; jamais
  // rétro-calculé. SQL : `contacts_email_send_*_check` (migration 1796436300000).
  @Column('text', { nullable: true })
  email_send_state: string | null

  @Column('text', { nullable: true })
  email_send_channel: string | null

  @Column('text', { nullable: true })
  email_send_from: string | null

  /**
   * #3699.6 — les pièces jointes de la dernière tentative d'envoi individuel :
   * nom, taille, empreinte SHA-256 des octets relus pour partir. Jamais le
   * contenu. `null` = tentative sans pièce (ou antérieure à ce lot).
   * Migration `1796437901202-ContactEmailSendAttachments`.
   */
  @Column('jsonb', { nullable: true })
  email_send_attachments: { name: string; byte_size: number; sha256: string }[] | null

  @Column('timestamptz', { nullable: true })
  email_send_attempted_at: Date | null

  /**
   * #4179.2 — l'instant du message sortant LU dans la boîte connectée après une
   * tentative d'envoi par cette boîte. `null` = jamais observé : l'écran ne
   * promet alors pas « éléments envoyés ». Migration `1796541389219-ContactEmailSentObserved`.
   */
  @Column('timestamptz', { nullable: true })
  email_sent_observed_at: Date | null

  // Le TYPE de rebond renvoyé par Resend (`bounce.type`, ex. « permanent » /
  // « transient »), affiché tel quel — jamais reformulé en une catégorie
  // inventée que Resend ne nous a pas donnée.
  @Column('text', { nullable: true })
  email_bounce_reason: string | null

  // Free-form commercial note (Théo P0 "Fiche contact").
  //
  // HÉRITAGE — plus écrite par l'application depuis le socle CRM (T0). Une note
  // unique écrasée à chaque saisie faisait que deux commerciaux sur le même
  // contact s'effaçaient l'un l'autre, et une information non datée ne vaut
  // rien. Les notes vivent désormais dans la table `notes` (polymorphe, datée,
  // empilable) ; la migration `1789301274613` y a repris le contenu existant.
  // La colonne est CONSERVÉE : aucune migration ne détruit du texte écrit à la
  // main.
  @Column('text', { nullable: true })
  note: string | null

  // Soft-hide flag — hidden contacts are excluded from the default list but
  // still reachable by id.
  @Column('boolean', { default: false })
  hidden: boolean

  /**
   * Suppression réversible (T0). NULL = vivant. Un contact supprimé sort de
   * toutes les listes mais garde sa ligne : un effacement définitif emporterait
   * les activités, positionnements et notes qui le citent, et une suppression
   * par erreur ne se rattraperait pas.
   */
  @Column('timestamptz', { nullable: true })
  deleted_at: Date | null

  /**
   * #4016 L6 — la fiche qui a ABSORBÉ celle-ci lors d'une fusion automatique
   * (doublon ≥ 0,99, dans Bellum seulement). Posée avec `deleted_at` ; une
   * annulation remet les deux à NULL. Migration `1796440163847`.
   */
  @Column('uuid', { nullable: true })
  merged_into_id: string | null

  @Column('text', { nullable: true })
  source: string | null

  /**
   * Import universel (Louis 27/09/2026, migration `1796322824816`) — les
   * colonnes d'un fichier importé qui n'ont AUCUN champ d'accueil, sous leur
   * en-tête d'origine. On n'écrase ni ne jette rien : `{}` = rien d'importé en plus.
   */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  extra: Record<string, string>

  // Persisted lifecycle position (détecté → identité vérifiée → qualifié →
  // enrichi → actionnable). Written by the deterministic `computeContactLifecycleState`
  // on every create/verify/enrich; each change appends a row to
  // `contact_lifecycle_transitions` (source + real date). Nullable only for rows
  // predating the backfill.
  @Column('text', { nullable: true })
  lifecycle_state: string | null

  @Column('jsonb', { nullable: true })
  raw_data: Record<string, unknown> | null

  // --- Rich contact-detail fields (nullable; same shape as @bellum/contracts) ---
  @Column('integer', { nullable: true })
  contact_score: number | null

  /**
   * The explained criteria behind `contact_score` (03_BUSINESS_RULES §3).
   *
   * NOT a column — computed on read by `ContactsService.scoreContacts`, which is
   * also what (re)writes `contact_score` on the way out. It travels with the score
   * so the UI can display the SAME grid the server computed, with the account
   * context (perimeter tier + angles) a bare contact row doesn't carry; the front
   * used to re-derive it locally and land on a different number.
   */
  contact_score_breakdown?: Array<{
    key: string
    points: number
    max: number
    proof: string
    evaluated: boolean
  }>

  @Column('text', { nullable: true })
  language: string | null

  @Column('text', { nullable: true })
  timezone: string | null

  @Column('text', { nullable: true })
  location: string | null

  @Column('text', { nullable: true })
  seniority: string | null

  @Column('text', { nullable: true })
  scope: string | null

  @Column('text', { nullable: true })
  budget_authority: string | null

  @Column('jsonb', { nullable: true })
  key_points: string[] | null

  @Column('jsonb', { nullable: true })
  signals: ContactSignal[] | null

  @Column('jsonb', { nullable: true })
  activity: ContactActivity[] | null

  @Column('jsonb', { nullable: true })
  relations: ContactRelation[] | null

  // Rich, factual Apollo People-Match profile (career path, education, social
  // links, seniority, functions…) from the SAME paid payload as email/phone.
  // Present-only, persisted verbatim; NULL until a People-Match resolved it.
  @Column('jsonb', { nullable: true })
  apollo_enrichment: ApolloContactProfile | null

  // --- Trace de la dernière tentative d'enrichissement (migration 1786500000000) ---
  // Écrites à CHAQUE passage, qu'il ait matché ou non — c'est ce qui rend
  // l'enrichissement idempotent : sans elles, un contact que le provider ne peut
  // plus compléter était reproposé et redébité indéfiniment. La règle qui les
  // lit vit dans `@bellum/contracts` (`enrichmentCooldown`) et est partagée
  // telle quelle avec le web, pour que l'UI grise exactement ce que le serveur
  // refuse. NULL sur les lignes antérieures = « jamais tenté » (jamais bloqué).
  @Column('timestamptz', { nullable: true })
  last_enrichment_at: Date | null

  /** Provider qui a répondu en dernier ('apollo' | 'dropcontact'). */
  @Column('text', { nullable: true })
  last_enrichment_provider: string | null

  /** 'matched' | 'no_new_data' | 'ambiguous' (#2120.61) | 'newer_data_exists'
   *  (#2120.64) — contrainte élargie par la migration 1795712351210. */
  @Column('text', { nullable: true })
  last_enrichment_result: string | null

  /** Canaux encore vides à l'issue de la tentative (email / linkedin / phone). */
  @Column('jsonb', { nullable: true })
  last_enrichment_missing: string[] | null

  /**
   * E1 (#3698, écran #3822) — l'état PAR COORDONNÉE de la dernière tentative :
   * trouvé / introuvable chez N sources / en attente / inconnu. Les sources n'y
   * sont jamais nommées (`EnrichmentCoordinateStates`, @bellum/contracts).
   * Migration `1796436688517`. C'est aussi la SEULE trace d'une panne
   * fournisseur (#3822.2) : un appel qui a échoué laisse la coordonnée visée à
   * `unknown` (« erreur » à l'écran), distincte de `not_found` — intégration
   * J1, la colonne en double `last_enrichment_error_*` du lot C5 retirée.
   */
  @Column('jsonb', { nullable: true })
  enrichment_coordinates: EnrichmentCoordinateStates | null

  /**
   * E1 — trace INTERNE de l'enrichissement : réponses par source (mesure de
   * couverture), révélation du mobile attendue par webhook (nonce, débit déjà
   * fait ?), recherche asynchrone en cours. `select: false` : aucune lecture
   * par défaut ne la sert au client — nos fournisseurs ne se nomment jamais.
   */
  @Column('jsonb', { nullable: true, select: false })
  enrichment_trace?: ContactEnrichmentTrace | null

  /**
   * #2159.62 — la dernière fois que l'EMPLOI de cette personne (titre, entité)
   * a été VÉRIFIÉ — par un fournisseur qui la RECONFIRME (`last_enrichment_result
   * = 'matched'`, jamais un simple essai sans réponse) ou par un humain qui
   * corrige `title`/`entity` à la main (`RecordEditService.patchContact`).
   * NULL = jamais vérifié, jamais une date devinée. Migration
   * `1796349810000-ContactEmploymentVerifiedAt`.
   */
  @Column('timestamptz', { nullable: true })
  employment_verified_at: Date | null

  /** #2120.68 — confiance PAR CHAMP : 'high' | 'medium' | 'low', jamais une
   *  probabilité. NULL = non mesurée (GA-18/19), jamais devinée. Migration
   *  1795712351210. */
  @Column('text', { nullable: true })
  email_confidence: string | null

  /**
   * R22 a4 — la disponibilité ANNONCÉE par la source pour cette coordonnée :
   * `available` (elle existe, non livrée) · `unknown` · `not_found` (cherchée,
   * rien). NULL = jamais annoncée. Contrainte SQL posée par la migration
   * 1796574871953 ; la date de la dernière recherche reste dans
   * `enrichment_coordinates`.
   */
  @Column('text', { nullable: true })
  email_availability: ContactAvailability | null

  @Column('text', { nullable: true })
  phone_availability: ContactAvailability | null

  /** #2120.68 — aucun signal de confiance fiable n'existe pour le téléphone
   *  principal au 18/09/2026 (pas d'équivalent à `email_status`) : la colonne
   *  existe, mais reste NULL tant qu'aucune source ne sait se noter — jamais
   *  devinée. Migration 1795712351210. */
  @Column('text', { nullable: true })
  phone_confidence: string | null

  /** #4178.1 — nature du numéro : pro vérifié / déclaré / personnel / inconnue.
   *  NULL = jamais qualifié ; jamais « pro » par déduction du format. Migration
   *  1796541447940. */
  @Column('text', { nullable: true })
  phone_nature: PhoneNature | null

  /** #4178.1 — qui a posé la nature : 'provider' | 'human' (la correction humaine gagne). */
  @Column('text', { nullable: true })
  phone_nature_source: PhoneNatureSource | null

  /** #2120.70 — coût ENGAGÉ pour CE champ, en crédits (jamais agrégé entre
   *  espaces, GA-43). NULL = aucun appel payant ne l'a fourni (saisie
   *  manuelle, import CRM, valeur héritée) — jamais 0. Migration
   *  1795712351210. */
  @Column('int', { nullable: true })
  email_cost_credits: number | null

  /** #2120.70 — même règle que `email_cost_credits`, pour le téléphone. */
  @Column('int', { nullable: true })
  phone_cost_credits: number | null

  // Decider psychology (deck / ORION) — career levers to orient the pitch and
  // implicit organisational fears to defuse. Set by Phase-3 for the top-N
  // deciders only; NULL for the seeded tail.
  @Column('jsonb', { nullable: true })
  career_levers: string[] | null

  @Column('jsonb', { nullable: true })
  implicit_fears: string[] | null

  /** RGPD droit à l'effacement: set when the owning account was closed and this
   *  prospect's PII (name/email/phone/linkedin/messages) has been scrubbed.
   *  NULL = active. */
  @Column('timestamptz', { nullable: true })
  anonymized_at: Date | null

  /**
   * #2297.51 — les coordonnées ENRICHIES retirées de la lecture par la
   * rétention (trois ans sans activité, `ENRICHED_CONTACT_RETENTION_DAYS`).
   * `select: false` : aucun `find` ne la charge — ni la fiche, ni un export, ni
   * un envoi ne peut relire une valeur archivée. Seule une demande d'effacement
   * RGPD y touche (`anonymizeContacts`), pour la vider. Migration 1789809858927.
   */
  @Column('jsonb', { nullable: true, select: false })
  enrichment_archive?: Record<string, unknown> | null

  /** #2297.51 — quand la rétention a archivé ces coordonnées ; NULL = rien
   *  d'archivé. La fiche l'AFFICHE : archivé n'est jamais « jamais cherché ». */
  @Column('timestamptz', { nullable: true })
  enrichment_archived_at: Date | null

  /**
   * La fiche de ce contact côté CRM, quand elle existe. `NULL` = pas de fiche
   * connue, ou jamais cherchée — deux choses que `crm_synced_at` distingue.
   */
  @Column('text', { nullable: true })
  crm_record_id: string | null

  /**
   * Dernier rapprochement avec le CRM. `NULL` = jamais rapproché, ce qui n'est
   * PAS « rapproché sans résultat » : la boucle de synchronisation traite les
   * plus anciens d'abord, et un défaut à `now()` aurait fait croire que tout
   * l'existant était vérifié.
   */
  @Column('timestamptz', { nullable: true })
  crm_synced_at: Date | null

  /**
   * Contact ÉCARTÉ (PDF 2, items 82-83). `NULL` = actif.
   *
   * L'état `rejete` du cycle de vie existait depuis des mois sans que rien ne
   * pose son drapeau. Deux colonnes et pas une : la date dit quand, le motif dit
   * pourquoi — et c'est six mois plus tard qu'on se demande pourquoi ce contact
   * a disparu des listes.
   */
  @Column('timestamptz', { nullable: true })
  excluded_at: Date | null

  @Column('text', { nullable: true })
  exclusion_reason: string | null

  /**
   * #2160.58 — la confirmation POSITIVE, symétrique du refus (`contact_stops`
   * `confirmed_wrong_contact`) : « oui, c'est la bonne personne ». `NULL` =
   * jamais confirmé — ce n'est pas la même chose qu'une identité incomplète
   * (`isContactIdentityComplete`), qui reste un calcul, pas une déclaration
   * humaine. Deux colonnes, même raison que `excluded_at`/`exclusion_reason` :
   * la date dit quand, `_by` dit qui a vu la fiche et l'a validée.
   */
  @Column('timestamptz', { nullable: true })
  identity_confirmed_at: Date | null

  @Column('uuid', { nullable: true })
  identity_confirmed_by: string | null

  /**
   * #2160.60 — « Autoriser la recommandation » : la correction humaine qui
   * lève, sur CETTE fiche, un doute d'identité (`homonym_conflict` /
   * `entity_mismatch`) à la porte d'éligibilité du classement
   * ({@link ../../modules/contacts/contact-eligibility.ts}). `NULL` = jamais
   * autorisé. `_reason` porte la raison LEVÉE elle-même (jamais une raison
   * RGPD/opposition/effacement) : c'est elle que la porte compare à ce qui
   * bloque CE contact avant d'ignorer l'exclusion. Réversible : retirer
   * l'autorisation remet les trois colonnes à `NULL`, jamais un second statut.
   */
  @Column('timestamptz', { nullable: true })
  recommendation_authorized_at: Date | null

  @Column('uuid', { nullable: true })
  recommendation_authorized_by: string | null

  @Column('text', { nullable: true })
  recommendation_authorized_reason: string | null

  /**
   * #2159.26 — les ÉTIQUETTES, normalisées par `normalizeTags` (contrat) et
   * tenues en base par `contacts_tags_check`. `{}` = aucune, jamais `NULL`.
   * Migration `1795725274971`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  tags: string[]

  /**
   * #2861 (#2437.2, 26/09/2026) — le niveau DESTINATAIRE des quatre niveaux
   * de langue demandés (membre/workspace/destinataire/source). Même
   * catalogue que `marketLocaleSchema` (`workspace.defaultLocale`,
   * `contacts_locale_check`, migration `1796321722137`) — un deuxième
   * catalogue divergerait dès le premier ajustement (GA-26). `NULL` = non
   * renseigné, jamais deviné.
   */
  @Column('text', { nullable: true })
  locale: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /**
   * #4597.3 — l'import universel qui a CRÉÉ cette fiche (`universal_import_jobs.id`). `null` : fiche non née d'un
   * import, ou importée avant la colonne — jamais devinée d'après une date. Migration `1796575257285`.
   */
  @Column('uuid', { nullable: true })
  import_job_id: string | null
}
