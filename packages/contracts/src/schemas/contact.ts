import { contactSendChannelSchema } from './contact-send-state.js'
import { EMAIL_ATTACHMENT_MAX_COUNT } from './storage.js'
import { z } from 'zod'
import { CONTACT_REACHABILITY_KINDS, contactLifecycleStateSchema, HIERARCHY_LEVELS } from './classified-data.js'
import { contactRecommendationAuthorizableReasonSchema } from './contact-ranking.js'
import { apolloContactProfileSchema } from './ia.js'
import { paginatedResultSchema } from './pagination.js'
import { CONTACT_ENRICHMENT_RESULTS } from './contact-enrichment.js'
import { enrichmentCoordinateStatesSchema } from './enrichment-coordinates.js'
import { CONTACT_AVAILABILITIES } from './contact-availability.js'
import { PHONE_NATURES, PHONE_NATURE_SOURCES } from './enrichment-compliance.js'
import { fieldContradictionSchema } from './field-contradiction.js'
import { marketLocaleSchema } from './workspace.js'
import { INTERACTION_ACTIVITY_KINDS } from './activity.js'
import { fieldSourceSchema } from './provenance.js'

export const decisionRoleSchema = z.enum([
  // Deck MEDDIC taxonomy. Phase 3 now emits the SAME vocabulary from both the LLM
  // (BELLUM-CONTACTS) and the deterministic title override (decision_role.py):
  //   technical (DSI/CTO/RSSI…) · economic (CFO/dir. achats budget) · procurement
  //   (vendor/achats manager — la porte achats) · user (métier) · champion (relais
  //   interne) · influencer (prescripteur) · blocker (gatekeeper sécu/juridique).
  //   A title matching no rule keeps the LLM role (→ effectively "à-vérifier").
  'technical',
  'economic',
  'procurement',
  'user',
  'champion',
  'influencer',
  'blocker',
  // Legacy values — kept so historical rows still validate; no longer emitted.
  'sponsor',
  'operational',
  'purchasing',
  'unknown',
])

export const contactStatusSchema = z.enum(['new', 'contacted', 'replied', 'meeting', 'refused', 'silence'])

export const contactSourceSchema = z.enum([
  'linkedin_apify',
  'apollo',
  'ai_generated',
  'brave_search',
  'ia_reconstruction',
  'pappers',
  'manual',
  // On-demand enrichment fallback provider (RGPD-safe, algorithmic — no stored
  // pre-scraped database). Env-gated behind DROPCONTACT_API_KEY; stamped only
  // when Dropcontact resolves a contact Apollo could not.
  'dropcontact',
  // Demo-mode seeded contact (fictional by design — the explicit exception to
  // « JAMAIS de données fictives »). Only ever written by the demo workspace
  // seeder; never mixed with real prospect data. Migration 1785950000000.
  'demo',
  // Enrichisseurs de secours à API officielle (LOT 7 des méta-analyses du
  // 03/08). Env-gated : sans clé, jamais écrits.
  'hunter',
  'lusha',
  /**
   * Reprise de masse depuis l'assistant d'import.
   *
   * ⚠️ Ces contacts étaient estampillés `manual`, indiscernables d'une fiche
   * saisie à la main. Six mois plus tard, personne ne pouvait plus dire ce qui
   * venait de la reprise de l'ancien CRM et ce qu'un commercial avait réellement
   * vérifié — et c'est exactement la distinction dont on a besoin le jour où une
   * adresse rebondit. Migration `1790040000001`, posée AVANT ce code.
   */
  'import',
  // #1995 — fiche créée depuis une LIGNE du CRM connecté, sur geste de
  // l'utilisateur dans une conversation avec Laura. Ni saisie à la main
  // (`manual`) ni reprise en masse (`import`) : elle vient d'un outil que le
  // client tient à jour, et c'est cette distinction qu'on cherche le jour où
  // une adresse rebondit. Ajoutée en FIN de liste (GA-08 : un enum ne perd
  // jamais de valeur et n'en insère jamais au milieu) ; contrainte SQL élargie
  // AVANT par la migration 1793680000000 (GA-11 / GA-12).
  'crm',
  // #2777 — fiche créée depuis une personne CITÉE dans la cascade du compte
  // rendu de rendez-vous (`mentionedContacts`), sur validation de
  // l'utilisateur. Ni `manual`, ni `import`, ni `crm` : le nom vient d'un
  // rendez-vous, pas d'une saisie, d'une reprise ou d'un outil connecté.
  // Contrainte SQL élargie AVANT par la migration 1796001527197 (GA-11 / GA-12).
  'meeting',
  // E1 (#3698) — les deux enrichisseurs de secours que `EnrichmentProviders`
  // estampillait déjà (`updates.source = hit.provider`) SANS que la contrainte
  // les admette : un mobile trouvé par FullEnrich faisait échouer l'écriture
  // entière (`update_failed`). Contrainte élargie AVANT par 1796436688517.
  'kaspr',
  'fullenrich',
  // SIG-B (11/10/2026) — un recruteur NOMMÉ par une offre d'emploi publiée et
  // GARDÉE pour le compte (équipe de recrutement de l'offre). Ni un annuaire,
  // ni un modèle : la preuve est l'offre elle-même (`raw_data.jobPosting`).
  // Contrainte SQL élargie AVANT par la migration 1796438093817 (GA-11 / GA-12).
  'job_posting',
  // #3989 (Louis 11/10/2026, `c94_base_commune_capitalise_tout`) — fiche
  // RECOPIÉE depuis la base commune entre espaces : un fait public que Bellum
  // a déjà collecté pour un autre espace. Provenance nommée « base commune »,
  // jamais l'espace d'origine. En FIN de liste (GA-08) ; contrainte SQL
  // élargie AVANT par la migration 1796439898901 (GA-11 / GA-12).
  'shared_base',
])

/**
 * Business family (GPT-Mapping-décideurs method / knowledge-pack-v2) — the
 * functional decision-maker domain an imported contact belongs to. Persisted on
 * `contacts.family` as free text; these are the canonical labels the
 * deterministic import classifier emits. Left `null` when no rule fires (unknown
 * function → the row is flagged for review, never silently dropped).
 */
export const contactFamilySchema = z.enum([
  'IT',
  'Cyber',
  'Data',
  'IA',
  'Infra',
  'Dev',
  'PMO',
  'Finance',
  'C-Level',
  'Achat',
  'RH',
])

/**
 * Hierarchy / decision level (knowledge-pack-v2 §"Hierarchy levels"). Orthogonal
 * to `family`: a DSI is `family: 'IT'` at `decision_level: 'c_level'`. `unknown`
 * when the title is blank or unclassifiable.
 */
export const contactDecisionLevelSchema = z.enum([
  'c_level',
  'direction',
  'management',
  'expert',
  'operationnel',
  'unknown',
])

/* ------------------------------------------------------------------ */
/*  Rich contact-detail sub-structures                                */
/*  Nullable end-to-end: the API returns the full shape with `null`   */
/*  until a field is populated, so front and back share one structure.*/
/* ------------------------------------------------------------------ */

/** A market/personal signal attached to a contact ("Signaux" tab). */
export const contactSignalSchema = z.object({
  label: z.string(),
  source: z.string().nullable().optional(),
  /** Théo B c5 — la page d'origine du signal (l'éditeur, jamais un intermédiaire) ; absente = pas de lien. */
  source_url: z
    .string()
    .url()
    .refine(value => /^https?:\/\//i.test(value))
    .nullable()
    .optional(),
  type: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
})

/** A logged action on the contact ("Activité" tab). */
export const contactActivitySchema = z.object({
  label: z.string(),
  detail: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  at: z.string().nullable().optional(),
})

/** A relationship to another person in the org ("Relations" tab) — enough to
 *  render an org-chart node (avatar/name/role badge/title) and deep-link to
 *  that person's contact sheet. */
export const contactRelationSchema = z.object({
  /** Target contact id, when the related person is itself a known contact
   *  (enables the "Voir la fiche" link). */
  id: z.string().nullable().optional(),
  name: z.string(),
  title: z.string().nullable().optional(),
  entity: z.string().nullable().optional(),
  decision_role: decisionRoleSchema.nullable().optional(),
  relationship: z.string().nullable().optional(),
  /** Hierarchy depth from the root contact (1 = direct/solid link,
   *  2 = indirect/dashed link). Drives the org-chart layout. */
  tier: z.number().nullable().optional(),
})

/**
 * #2120.68 — confiance PAR CHAMP (email, téléphone). Vocabulaire réemployé de
 * `PROJECT_CONFIDENCE_LEVELS` (`schemas/project.ts`) : une échelle NOMMÉE,
 * jamais un pourcentage — aucune PROBABILITÉ ne s'affiche jamais dans ce
 * produit. `null` = non mesurée (GA-18/19 : « non mesuré » n'est jamais une
 * valeur basse), jamais devinée depuis une URL ou un mot-clé.
 */
export const CONTACT_FIELD_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export const contactFieldConfidenceSchema = z.enum(CONTACT_FIELD_CONFIDENCE_LEVELS)
export type ContactFieldConfidence = z.infer<typeof contactFieldConfidenceSchema>

/**
 * #2128.17 — CE CONTACT PRÉCIS a-t-il déjà été sollicité par un collègue
 * récemment ? Extrait pour être RÉUTILISÉ tel quel (#2386.6) par la version
 * groupée (`contactSolicitationsResponseSchema`) plutôt que redéclaré.
 * `null` = lu, aucune collision dans la fenêtre de politique.
 */
export const contactSolicitationSchema = z
  .object({
    colleague: z.object({ user_id: z.string().guid(), name: z.string() }),
    lastTouchOn: z.string(),
    withinDays: z.number().int().positive(),
  })
  .nullable()
export type ContactSolicitation = z.infer<typeof contactSolicitationSchema>

export const contactSchema = z.object({
  id: z.string().guid(),
  /**
   * L'entreprise du contact — `null` quand on ne la connaît PAS encore (#1473).
   *
   * Un contact rencontré en salon, ou recommandé sans société, existait
   * jusqu'ici dans le téléphone du commercial et nulle part dans l'outil :
   * `contacts.account_id` était `NOT NULL`. Le rattachement se fait plus tard,
   * quand l'information arrive. `null` n'est pas un compte vide : c'est
   * « à qualifier », et l'écran le NOMME au lieu d'afficher un tiret.
   */
  account_id: z.string().guid().nullable(),
  /**
   * #4996 L6 — l'entité du CLIENT (BU, filiale…) où le contact travaille ; `null`/absent = non rattaché. Sert à la
   * mention « dans la zone de X » ; jamais un droit. Ajout seul : un ancien serveur ne le sert pas.
   */
  entity_id: z.string().guid().nullable().optional(),
  // Optional depuis LOT 4 (perf, GA-297) : `GET /contacts/account/:id` ne le
  // sert plus — c'est un champ interne (le porteur DB de la ligne), constant
  // sur toute une réponse de compte et jamais lu côté web. `GET /contacts/:id`
  // continue de l'envoyer.
  user_id: z.string().guid().optional(),
  // #2297 — le porteur ATTRIBUÉ (`contacts.assigned_to`), que `GET /contacts/:id`
  // envoie avec la fiche. Lu par l'écran pour dire qui peut effacer la personne
  // (`canErasePerson`, `person-erasure.ts`). Optionnel : absent = inconnu.
  assigned_to: z.string().guid().nullable().optional(),
  /**
   * #2160.9 — LE PORTEUR NOMMÉ, pour la tête de fiche. `assigned_to` (juste
   * au-dessus) porte l'id ; ce champ porte le NOM déjà résolu par le serveur
   * — l'écran n'a jamais lu la table `profiles` et ne doit pas commencer ici.
   * `null` = lu, personne ne porte ce contact (ou le profil n'est plus
   * lisible) ; absent (`undefined`) = endpoint qui ne le sert pas encore.
   * Jamais un « non attribué » deviné côté client (GA-18/19).
   */
  owner: z.object({ user_id: z.string().guid(), name: z.string() }).nullable().optional(),
  /** Théo B c5.R2 — le badge relationnel DÉRIVÉ de l'historique ; la déclaration humaine (`declared`) gagne. */
  relation_badge: z
    .object({
      derived: z.enum(['engaged', 'to_contact']),
      declared: contactStatusSchema.exclude(['new']).nullable(),
      shown: z.discriminatedUnion('source', [
        z.object({ source: z.literal('declared'), status: contactStatusSchema.exclude(['new']) }),
        z.object({ source: z.literal('derived'), relation: z.enum(['engaged', 'to_contact']) }),
      ]),
    })
    .optional(),
  /**
   * #2128.17 — CE CONTACT PRÉCIS a-t-il déjà été sollicité par un collègue
   * récemment ? Même geste que la collision de prospection au niveau du
   * compte (`workspace-memory-crossings.service.ts` G4, `user_actions`),
   * mais bornée au CONTACT (`user_actions.contact_id`), pas au compte entier
   * — une pastille « Déjà contacté » existe déjà sur la LISTE (statut de la
   * personne, `user_status`), ceci est une COLLISION qui nomme un collègue
   * et une date, un fait distinct.
   * `null` = lu, aucune collision dans la fenêtre de politique ; absent =
   * endpoint antérieur à ce champ (jamais un « aucune » deviné, GA-18/19).
   */
  solicitation: contactSolicitationSchema.optional(),
  full_name: z.string(),
  title: z.string().nullable(),
  entity: z.string().nullable(),
  decision_role: decisionRoleSchema.nullable(),
  priority: z.number(),
  email: z.string().nullable(),
  email_verified: z.boolean().default(false),
  /**
   * #2295.4bis — décision Louis 18/09/2026 (question 24) : « ce contact est
   * UTILISABLE EN DÉMONSTRATION », un fait de SEMIS distinct d'{@link
   * email_verified} par construction — son nom ne dit rien sur une adresse
   * réelle. `classifyGroup()` (`contact-ranking.ts`, #2295.4) accepte le
   * groupe « première porte » quand l'email est vérifié OU quand ce champ
   * vaut `true`, jamais autrement.
   *
   * `true` UNIQUEMENT sur les contacts posés par le jeu de données de
   * démonstration — jamais sur un espace réel (garde de frontière,
   * `apps/api/src/architecture/demo-seed-first-door-is-demo-only.spec.ts`).
   * Optionnel : absent = `undefined`, jamais un `true` implicite.
   */
  demo_seed_first_door: z.boolean().optional(),
  phone: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  /**
   * #2861 (#2437.2, 26/09/2026) — le niveau DESTINATAIRE des quatre niveaux
   * de langue demandés (membre/workspace/destinataire/source). Même
   * catalogue que `workspace.defaultLocale` (`marketLocaleSchema`, GA-26 —
   * un deuxième catalogue divergerait dès le premier ajustement). `null` =
   * non renseigné, jamais deviné depuis une adresse ou un secteur.
   */
  locale: marketLocaleSchema.nullable(),
  // Real profile photo from Apollo (People Search / Match — free field of the
  // same call). Nullable/optional: no photo known → the UI keeps the initials
  // fallback. Never a generated/placeholder image.
  photo_url: z.string().nullable().optional(),
  profile_summary: z.string().nullable(),
  why_contact: z.string().nullable(),
  email_message: z
    .object({
      subject: z.string(),
      body: z.string(),
    })
    .nullable(),
  linkedin_message: z.string().nullable(),
  phone_script: z.string().nullable(),
  followup_message: z
    .object({
      subject: z.string(),
      body: z.string(),
    })
    .nullable(),
  user_status: contactStatusSchema,
  // Palier 1 « Envoie l'email » : ISO timestamp du dernier envoi du brouillon
  // `email_message` au contact depuis Bellum (null = jamais envoyé).
  email_sent_at: z.string().nullable().optional(),
  /**
   * #2733.2 — la vérité de LIVRAISON sur la FICHE, même champ que
   * `contactListItemSchema.email_bounced_at` (posé par le webhook Resend
   * `email.bounced`), distincte de `email_sent_at` qui ne prouve que
   * l'acceptation par Resend. `null`/absent = aucun rebond connu.
   */
  email_bounced_at: z.string().nullable().optional(),
  /**
   * #2988 (#2161) — provenance PAR CHAMP (source + date), sur les trois champs
   * que la fiche affiche déjà (email/téléphone/LinkedIn). Servie par
   * `ProvenanceService.currentSourcesDetailed` (`field_provenance`, une ligne
   * par champ écrit). Absent/optionnel : une fiche jamais passée par un chemin
   * qui commit la provenance (import ancien, saisie avant cette colonne) n'a
   * simplement rien à ce sujet — jamais une source devinée.
   */
  field_provenance: z.record(z.string(), z.object({ source: fieldSourceSchema, observedAt: z.string() })).optional(),
  /**
   * #4016 L4.1 — l'adresse affichée est une ESTIMATION (motif de l'entreprise,
   * vérifiée MX + SMTP) : la date de sa vérification. Calculée par l'API sur
   * TOUTE ligne de contact (liste et fiche), en une requête, pour que chaque
   * écran qui montre l'adresse puisse la badger « estimé, vérifié le … »
   * (`EstimatedBadge`). `null`/absent = l'adresse n'est pas estimée.
   */
  email_estimated_at: z.string().nullable().optional(),
  /**
   * #4016.L13 — un fait CONFIRMÉ à la main (provenance `human`) qu'une source automatique a contredit
   * depuis : la valeur adverse, sa source et sa date, NOMMÉES à côté du fait — jamais à sa place.
   * Une par champ, la plus récente ; disparaît dès qu'une correction humaine la suit
   * (`visibleFieldContradictions`). Absent = aucune contradiction : aucune ligne.
   */
  field_contradictions: z.array(fieldContradictionSchema).optional(),
  /**
   * #3692.7 — `true` quand le MÊME `why_contact` (casse, espaces et ponctuation
   * finale ignorés) figure sur au moins deux autres contacts de l'espace : un
   * texte qui convient à tout le monde ne dit rien de CETTE personne, la synthèse
   * « Pourquoi ce contact compte » le retire. Absent/`false` = rien à signaler.
   * Posé par `ContactsService.findOne` seulement (la liste ne le calcule pas).
   */
  why_contact_shared: z.boolean().optional(),
  source: contactSourceSchema.nullable(),
  /**
   * #2120.48 — dernier rapprochement avec le CRM (`ContactEntity.crm_synced_at`,
   * colonne existante, jusqu'ici jamais exposée). `null` = jamais rapproché,
   * ce qui N'EST PAS « rapproché sans résultat » — voir l'entité pour la
   * distinction. C'est le seul fait qui date « l'instantané » que l'écran de
   * confrontation CRM doit annoncer ; en son absence, l'écran dit « fraîcheur
   * non mesurée », jamais une date devinée.
   */
  crm_synced_at: z.string().nullable().optional(),
  // Persisted position in the détecté → actionnable ladder (single canonical
  // computation, see `computeContactLifecycleState`). Nullable/optional so rows
  // predating the backfill and list projections that don't select it still
  // validate; the transition journal (`GET /contacts/:id/lifecycle`) carries the
  // per-state "detected on / verified on" dates.
  lifecycle_state: contactLifecycleStateSchema.nullable().optional(),
  // Optional depuis LOT 4 (perf, GA-297) : `GET /contacts/account/:id` ne sert
  // plus le blob entier (282 Ko mesurés sur 2 027 lignes THALES) — seule la clé
  // que le front y lisait (`lastNameObfuscated`) voyage désormais projetée,
  // voir `last_name_obfuscated` plus bas. `GET /contacts/:id` continue de
  // servir `raw_data` intact.
  raw_data: z.record(z.string(), z.unknown()).nullable().optional(),
  // Le masque de nom de famille Apollo (offre gratuite, « Mo***y »), projeté
  // hors de `raw_data` pour `GET /contacts/account/:id` (même motif que
  // `contactListItemSchema.last_name_obfuscated` ci-dessous) — jamais présent
  // en même temps que `raw_data` sur une même réponse.
  last_name_obfuscated: z.string().nullable().optional(),
  // #4055.8 — la preuve datée d'un départ, projetée hors de `raw_data` pour la liste d'un compte (même règle que la liste /contacts).
  employment_left: z.object({ organization: z.string(), at: z.string() }).nullable().optional(),
  // #4044 — pays / ville / employeur lus à la collecte, projetés hors de `raw_data` pour la liste d'un
  // compte : l'écran juge le périmètre géographique avec le MÊME test que l'analyse. `null` = non lu.
  place: z
    .object({
      country: z.string().nullable(),
      city: z.string().nullable(),
      organization: z.string().nullable(),
    })
    .nullable()
    .optional(),
  // Free-form commercial note + soft-hide flag (Théo P0 "Fiche contact" — les
  // onglets vides doivent proposer note / masquer). Nullable/optional so old
  // rows and listing projections that don't select them still validate.
  note: z.string().nullable().optional(),
  hidden: z.boolean().optional(),
  /**
   * Contact ÉCARTÉ, avec son motif (PDF 2, items 82-83). `null` = actif.
   *
   * Distinct de `hidden` (masqué de MA liste) et de `deleted_at` (supprimé) :
   * écarter est une décision commerciale qui porte une raison, et cette raison
   * est ce qu'on relit six mois plus tard.
   */
  excluded_at: z.string().nullable().optional(),
  exclusion_reason: z.string().nullable().optional(),
  /**
   * #2160.58 — la confirmation POSITIVE « bon contact », symétrique du refus
   * (`contact_stops` `confirmed_wrong_contact`). `null` = jamais confirmé —
   * distinct d'une identité complète (`isContactIdentityComplete`), qui reste
   * un calcul, pas une déclaration humaine.
   */
  identity_confirmed_at: z.string().nullable().optional(),
  identity_confirmed_by: z.string().nullable().optional(),
  /**
   * #219.8 (#3231, lot Q03 30/09) — la relation personne↔entreprise DÉCLARÉE
   * par le commercial (ex-salarié, ex-prestataire, sponsor…). `null` = jamais
   * déclarée, lu « relation inconnue » : la prudence par défaut du message,
   * jamais une relation devinée d'un intitulé ou d'un parcours.
   */
  declared_person_company_relation: z.string().nullable().optional(),
  /**
   * #2160.60 — « Autoriser la recommandation », la correction humaine qui lève
   * un doute d'identité (`homonym_conflict` / `entity_mismatch`) à la porte
   * d'éligibilité du classement. `null` = jamais autorisé. Réversible : la
   * retirer remet les trois champs à `null`.
   */
  recommendation_authorized_at: z.string().nullable().optional(),
  recommendation_authorized_by: z.string().nullable().optional(),
  recommendation_authorized_reason: contactRecommendationAuthorizableReasonSchema.nullable().optional(),
  /**
   * #2159.26 — les ÉTIQUETTES du contact, normalisées (`normalizeTags`,
   * `tags.ts`) : minuscules, une seule graphie. `[]` = aucune étiquette posée.
   * Optionnel : une réponse antérieure à la colonne ne la porte pas.
   */
  tags: z.array(z.string()).optional(),
  /**
   * Import universel (Louis 27/09/2026) — les colonnes d'un fichier importé
   * SANS champ d'accueil, sous leur en-tête d'origine. `{}` = rien d'importé en
   * plus ; optionnel : une réponse antérieure à la colonne ne la porte pas.
   */
  extra: z.record(z.string(), z.string()).optional(),
  // --- Rich detail fields (shared shape, nullable until populated) ---
  contact_score: z.number().nullable().optional(),
  // The explained criteria BEHIND `contact_score` (03_BUSINESS_RULES §3), computed
  // server-side with the account context (perimeter tier + recommended angles) that
  // a bare contact row doesn't carry. Shipped so the UI EXPLAINS the score it shows
  // instead of recomputing a context-less copy that lands on a different number.
  contact_score_breakdown: z
    .array(
      z.object({
        key: z.string(),
        points: z.number(),
        max: z.number(),
        proof: z.string(),
        evaluated: z.boolean(),
      }),
    )
    .nullable()
    .optional(),
  /**
   * Lot 758 (arbitrage Louis 31/10/2026) — la JOIGNABILITÉ, sortie du score de pertinence :
   * une pastille (meilleur canal connu), jamais des points. `null` : aucun canal connu — rien
   * ne s'affiche (on n'affiche pas ce qu'on n'a pas). Absent : réponse non scorée.
   */
  contact_reachability: z.enum(CONTACT_REACHABILITY_KINDS).nullable().optional(),
  language: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  budget_authority: z.string().nullable().optional(),
  key_points: z.array(z.string()).nullable().optional(),
  signals: z.array(contactSignalSchema).nullable().optional(),
  activity: z.array(contactActivitySchema).nullable().optional(),
  relations: z.array(contactRelationSchema).nullable().optional(),
  // Rich, factual Apollo People-Match profile (career path, education, social
  // links, seniority, functions…) — the SAME paid payload as the email/phone,
  // no longer discarded. Present-only, persisted verbatim as JSONB. Rendered on
  // the contact detail; hidden cleanly when absent. Never invented.
  apollo_enrichment: apolloContactProfileSchema.nullable().optional(),
  // --- Trace de la dernière tentative d'enrichissement (idempotence) --------
  // Alimentées à CHAQUE passage, qu'il ait matché ou non. Elles sont ce qui
  // permet à l'UI de cesser de proposer un clic payant dont on sait qu'il ne
  // rapportera rien — voir `enrichmentCooldown` (schemas/contact-enrichment).
  last_enrichment_at: z.string().nullable().optional(),
  // #2297.51 — quand la rétention (trois ans sans activité,
  // `ENRICHED_CONTACT_RETENTION_DAYS`) a ARCHIVÉ les coordonnées enrichies.
  // NULL = rien d'archivé. L'archive elle-même ne sort jamais de l'API.
  enrichment_archived_at: z.string().nullable().optional(),
  /**
   * L'étiquette de source du deck : `INTERNE` · `PUBLIC` · `HYPOTHESE` ·
   * `RISQUE` · `ARRIVEE` (PDF 2 §5.1). CALCULÉE à la lecture, jamais stockée —
   * elle dépend de ce que le dernier enrichissement a dit de l'employeur
   * courant, et une colonne figée mentirait au premier changement de poste.
   *
   * `RISQUE` : l'employeur détecté ne correspond ni au compte ni à l'entité,
   * donc la personne est probablement partie. Le calcul existait depuis
   * longtemps et n'atteignait que le back-office ; le commercial, lui, voyait
   * un contact ordinaire et lui écrivait.
   *
   * `ARRIVEE` (#2632.1) : miroir de `RISQUE` — l'employeur détecté correspond
   * au compte (ou à l'entité), précédé dans l'historique d'un employeur
   * différent : la personne vient d'arriver. L'écran ne détectait que les
   * départs, jamais les arrivées.
   */
  source_tag: z.enum(['INTERNE', 'PUBLIC', 'HYPOTHÈSE', 'RISQUE', 'ARRIVEE']).nullable().optional(),
  last_enrichment_provider: z.string().nullable().optional(),
  /**
   * `ambiguous` (#2120.61) et `newer_data_exists` (#2120.64) rejoignent
   * `matched` / `no_new_data` — contrainte SQL élargie par la migration
   * `1795712351210` AVANT ce schéma (GA-11/GA-12).
   */
  last_enrichment_result: z.enum(CONTACT_ENRICHMENT_RESULTS).nullable().optional(),
  /** Canaux encore vides à l'issue de la tentative (email / linkedin / phone). */
  last_enrichment_missing: z.array(z.string()).nullable().optional(),
  /**
   * E1 / #3822 — l'état PAR COORDONNÉE de la dernière tentative (trouvé ·
   * introuvable chez N sources · en attente · inconnu). `unknown` est aussi la
   * trace d'une PANNE fournisseur (#3822.2), distincte de `not_found`. `null`
   * = aucune tentative tracée. Les sources ne s'y nomment jamais.
   */
  enrichment_coordinates: enrichmentCoordinateStatesSchema.nullable().optional(),
  /** R22 a4 — la disponibilité ANNONCÉE par la source pour ce champ (available · unknown · not_found). */
  email_availability: z.enum(CONTACT_AVAILABILITIES).nullable().optional(),
  phone_availability: z.enum(CONTACT_AVAILABILITIES).nullable().optional(),
  /**
   * #2159.62 — la dernière fois que l'EMPLOI (titre, entité) a été VÉRIFIÉ —
   * par un fournisseur qui reconfirme la personne à SON organisation
   * (`last_enrichment_result = 'matched'`), ou par une correction humaine de
   * `title`/`entity` (`RecordEditService.patchContact`). `null` = jamais
   * vérifié, jamais une date devinée.
   */
  employment_verified_at: z.string().nullable().optional(),
  /** #2120.68 — confiance de l'e-mail courant. Écrite UNIQUEMENT quand un
   *  enrichissement vient de FOURNIR une valeur neuve et facturée pour ce
   *  champ ; sinon `null` (non mesurée), jamais « basse » par défaut. */
  email_confidence: contactFieldConfidenceSchema.nullable().optional(),
  /** #2120.68 — même règle pour le téléphone. Reste `null` au 18/09/2026 :
   *  aucun signal de confiance fiable n'existe pour le numéro principal (pas
   *  d'équivalent à `email_status`) — on ne le devine pas. */
  phone_confidence: contactFieldConfidenceSchema.nullable().optional(),
  /** #4178.1 — nature du numéro : pro vérifié / déclaré / personnel / inconnue.
   *  `null` = jamais qualifié, lu « nature non vérifiée » — jamais « pro ». */
  phone_nature: z.enum(PHONE_NATURES).nullable().optional(),
  /** #4178.1 — qui l'a posée : le fournisseur, ou une correction humaine. */
  phone_nature_source: z.enum(PHONE_NATURE_SOURCES).nullable().optional(),
  /** #2120.70 — coût ENGAGÉ pour obtenir l'e-mail courant, en crédits (jamais
   *  agrégé entre espaces, GA-43). `null` = aucun appel payant ne l'a fourni
   *  (saisie manuelle, import CRM, valeur héritée) — jamais 0. */
  email_cost_credits: z.number().int().min(0).nullable().optional(),
  /** #2120.70 — même règle pour le téléphone. */
  phone_cost_credits: z.number().int().min(0).nullable().optional(),
  /** Set only when the caller asked for an id that was merged away: the retired
   *  id that resolved to this row. Deduplication deletes the loser, so a link a
   *  rep had bookmarked or pasted into an email used to answer « Contact
   *  introuvable » for someone who still existed. The detail page reads this to
   *  rewrite the address bar to the canonical URL. */
  merged_from: z.string().guid().optional(),
  // Optional depuis LOT 4 (perf, GA-297) : `GET /contacts/account/:id` ne le
  // sert plus — aucun consommateur de cette route ne le lit (`updated_at`,
  // juste en dessous, reste requis : `RelationshipMemoryCard` et le brief de
  // réunion le lisent sur cette même route). `GET /contacts/:id` continue de
  // l'envoyer.
  created_at: z.string().optional(),
  updated_at: z.string(),
})

/** #2988 — enrichissement ciblé PAR coordonnée : email pro seul, ou téléphone
 *  pro seul. */
export const enrichmentCoordinateSchema = z.enum(['email', 'phone'])
export type EnrichmentCoordinate = z.infer<typeof enrichmentCoordinateSchema>

export const enrichContactSchema = z.object({
  first_name: z.string().min(1),
  // Optional: mononym / unsplittable full names (single token) have no last
  // name. Apollo still matches on first_name + organization_name.
  last_name: z.string().min(1).optional(),
  organization_name: z.string().min(1),
  /** « Réessayer quand même » — sortie de secours explicite qui outrepasse le
   *  délai d'idempotence. L'UI annonce le coût avant de l'envoyer ; sans ce
   *  flag une re-tentative connue-stérile est refusée sans débit. */
  force: z.boolean().optional(),
  /** #2988 — absent = comportement historique (email ET téléphone). Présent,
   *  la coordonnée NON demandée n'est ni écrite ni débitée
   *  (`ContactsService.enrichContact`, `foldReachability`) et les fournisseurs
   *  de secours qui ne peuvent structurellement pas la rendre ne sont pas
   *  appelés (`EnrichmentProviders.enrich` — Hunter est sauté pour `phone`,
   *  Dropcontact pour `phone` aussi, les deux étant des résolveurs email). */
  only: enrichmentCoordinateSchema.optional(),
})

export const updateContactStatusSchema = z.object({
  user_status: contactStatusSchema.optional(),
})

/** `POST /contacts/send-email/bulk` — send the drafted email to many contacts
 *  at once. Capped to protect deliverability + keep the request bounded. */
export const sendBulkEmailSchema = z.object({
  contact_ids: z.array(z.string().guid()).min(1).max(50),
})

export type SendBulkEmailInput = z.infer<typeof sendBulkEmailSchema>

/**
 * #2386.6 — `POST /contacts/solicitations` : la MÊME collision (#2128.17),
 * pour PLUSIEURS contacts en un aller-retour. La session de prospection
 * construit sa liste SANS appel réseau supplémentaire
 * (`prospecting-session.ts` — « tout ce qu'elle utilise est déjà chargé à
 * l'écran Découvrir ») ; nommer la collision ne doit pas en coûter UN PAR
 * CONTACT. Même plafond que `sendBulkEmailSchema`.
 */
export const contactSolicitationsQuerySchema = z.object({
  contact_ids: z.array(z.string().guid()).min(1).max(50),
})
export type ContactSolicitationsQuery = z.infer<typeof contactSolicitationsQuerySchema>

/** Clé = id du contact. Un id demandé mais hors de l'espace (ou introuvable)
 *  est ABSENT de la réponse — jamais un `null` deviné pour un id qu'on n'a
 *  pas vérifié (GA-18/19), et jamais un oracle d'existence sur un autre tenant. */
export const contactSolicitationsResponseSchema = z.record(z.string(), contactSolicitationSchema)
export type ContactSolicitationsResponse = z.infer<typeof contactSolicitationsResponseSchema>

/**
 * `PATCH /contacts/assign` — attribue (ou libère) une SÉLECTION de contacts à un
 * membre de l'espace de travail. Même geste que `PATCH /accounts/:id/assign`
 * (portefeuille), transposé au contact et appliqué en masse : le commercial coche
 * ses lignes puis choisit un porteur.
 *
 * `assigned_to: null` retire l'attribution. La borne (100) tient la requête et
 * l'écriture dans un ordre de grandeur raisonnable, comme l'envoi en masse.
 */
export const assignContactsSchema = z.object({
  contact_ids: z.array(z.string().guid()).min(1).max(100),
  assigned_to: z.string().guid().nullable(),
})

export type AssignContactsInput = z.infer<typeof assignContactsSchema>

/**
 * Retour HONNÊTE de l'attribution en masse : les ids réellement écrits et ceux
 * laissés en place. Un commercial (sans `team:manage`) ne peut pas prendre le
 * contact d'un collègue — ces lignes reviennent dans `skipped` plutôt que de
 * faire échouer toute la sélection, et le compteur affiché est celui du serveur,
 * jamais une estimation client.
 */
export const contactAssignmentResultSchema = z.object({
  assigned_to: z.string().guid().nullable(),
  assigned: z.array(z.string().guid()),
  skipped: z.array(z.string().guid()),
})

export type ContactAssignmentResult = z.infer<typeof contactAssignmentResultSchema>

/**
 * `POST /contacts/:id/send-email` — body is OPTIONAL.
 *
 * Without `draft`, the stored `email_message` (written by the analysis) is what
 * goes out — the historical behaviour.
 *
 * With `draft`, the caller sends the exact copy the seller just read on screen
 * (the panel's live IA draft, which is NOT persisted at generation time). The
 * service persists it onto the contact in the same write that stamps
 * `email_sent_at`, so the stored record always equals what actually left. This
 * is deliberately NOT a free-form mail relay: the recipient is never client-
 * supplied (always `contact.email`), the send stays behind `messages:send`, the
 * opt-out / idempotency guards, and the `user_actions` trace.
 */
export const sendContactEmailSchema = z.object({
  draft: z
    .object({
      subject: z.string().max(300).optional(),
      body: z.string().min(1).max(20000),
    })
    .optional(),
  /**
   * #3699.4 — par où part le message. Absent = l'expéditeur de l'espace (le
   * comportement d'avant : MCP, envoi en masse). `mailbox` = la boîte connectée
   * du commercial ; si elle ne peut pas envoyer, le serveur REFUSE
   * (`mailbox_unavailable`) — jamais de bascule silencieuse sur l'adresse de l'espace.
   */
  channel: contactSendChannelSchema.optional(),
  /**
   * #3699.6 — les documents de la bibliothèque que le COMMERCIAL a choisis
   * (identifiants d'assets, jamais un fichier ni une URL). Le serveur relit,
   * vérifie (droit d'usage, type, signature, taille) et REFUSE l'envoi entier
   * si une pièce ne passe pas — jamais un envoi sans la pièce vue cochée.
   */
  attachment_asset_ids: z.array(z.string().guid()).max(EMAIL_ATTACHMENT_MAX_COUNT).optional(),
  /**
   * #4546.5 — la boîte connectée CHOISIE parmi les siennes (`GET /mailbox/senders`). Absent = la boîte par défaut
   * d'avant. Une boîte qui n'est pas à lui, ou sans la portée d'envoi, est REFUSÉE (`mailbox_unavailable`) — jamais un
   * expéditeur deviné. Sans effet hors du canal `mailbox`.
   */
  sender_connection_id: z.string().guid().optional(),
})

/** `PATCH /contacts/:id/note` — set/clear the free-form commercial note. A
 *  blank string clears it (the service collapses whitespace-only to NULL). */
export const updateContactNoteSchema = z.object({
  note: z.string().max(5000).nullable(),
})

/**
 * #3942.2 — `PATCH /contacts/:id/email-draft` : écrit `email_message` sans
 * envoyer. Distinct de `sendContactEmailSchema.draft` (qui part avec l'envoi,
 * `POST /contacts/:id/send-email`) : celui-ci est le geste « Préparer un
 * e-mail par personne » (#3942) — un mail personnalisé par contact qu'on
 * relit et valide un par un, déposé « préparé », jamais envoyé.
 */
export const saveContactEmailDraftSchema = z.object({
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(20000),
  /** #4546.5 — la boîte CHOISIE où déposer le brouillon ; absent = la boîte par défaut d'avant. */
  sender_connection_id: z.string().guid().optional(),
})
export type SaveContactEmailDraft = z.infer<typeof saveContactEmailDraftSchema>

/**
 * #4412 — ce que l'enregistrement d'un brouillon a fait CHEZ LE FOURNISSEUR.
 * Le brouillon Bellum (`email_message`) est toujours écrit ; ceci dit, en clair,
 * s'il existe AUSSI dans la boîte (Gmail / Outlook), et sinon pourquoi — jamais
 * un faux succès. `provider` est celui que la boîte a réellement rendu.
 */
export const contactEmailDraftMailboxSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('created'), provider: z.enum(['google', 'microsoft']) }),
  z.object({ status: z.literal('not_connected') }),
  z.object({ status: z.literal('failed'), provider: z.enum(['google', 'microsoft']).nullable(), reason: z.string() }),
])
export type ContactEmailDraftMailbox = z.infer<typeof contactEmailDraftMailboxSchema>

/**
 * #219.8 (#3231) — les treize valeurs de la relation personne↔entreprise.
 * Miroir EXACT de `PersonCompanyRelation` (`apps/ia/app/services/
 * person_company_relation.py`) et de la contrainte SQL
 * `contacts_declared_person_company_relation_check` : un test lit le fichier
 * Python et échoue à la moindre divergence (GA-26, un seul vocabulaire).
 * `unknown_relationship` n'est pas déclarable — c'est l'ABSENCE de
 * déclaration, qu'on exprime par `null`.
 */
export const PERSON_COMPANY_RELATION_VALUES = [
  'employee_current',
  'employee_former',
  'contractor_current',
  'contractor_historical',
  'freelancer',
  'manager',
  'buyer',
  'technical_reviewer',
  'sponsor',
  'user',
  'recruiter',
  'consultant_presented',
  'unknown_relationship',
] as const

export const personCompanyRelationSchema = z.enum(PERSON_COMPANY_RELATION_VALUES)

/** `PATCH /contacts/:id/hidden` — soft-hide a contact from the default list. */
export const updateContactHiddenSchema = z.object({
  hidden: z.boolean(),
})

/* ------------------------------------------------------------------ */
/*  Bulk manual import (CSV)                                          */
/*  A commercial can drop a CSV of prospects on an account. Fields    */
/*  are lenient — only ``full_name`` is required; the rest are best-  */
/*  effort strings the client already trimmed/mapped from arbitrary   */
/*  column headers. Blank cells arrive as ``null``.                   */
/* ------------------------------------------------------------------ */

const bulkImportContactSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).nullish(),
  email: z.string().trim().max(320).nullish(),
  phone: z.string().trim().max(64).nullish(),
  linkedin_url: z.string().trim().max(1000).nullish(),
  // "Liste perso" ingestion — the reviewed classification the rep is importing.
  // All optional/backward-compatible: an un-classified CSV import (no preview)
  // still validates and persists as before.
  entity: z.string().trim().max(200).nullish(),
  family: contactFamilySchema.nullish(),
  priority: z.number().int().min(1).max(5).nullish(),
})

export const bulkImportContactsSchema = z.object({
  // Bounded so a runaway paste can't OOM the batch insert. 500 covers any
  // realistic single-account contact list.
  contacts: z.array(bulkImportContactSchema).min(1).max(500),
})

export type BulkImportContact = z.infer<typeof bulkImportContactSchema>

/* ------------------------------------------------------------------ */
/*  #1995 — CRÉER LA FICHE D'UN CONTACT CONNU DU SEUL CRM             */
/*                                                                    */
/*  Sandrine Pata est citée par le CRM connecté sur THALES ; le       */
/*  compte porte 2 027 fiches Bellum, aucune « Pata ». Laura disait   */
/*  « fiche Bellum absente » et renvoyait vers une fiche qui          */
/*  n'existe pas — et le rappel restait impossible, puisqu'il exige   */
/*  un identifiant de fiche.                                          */
/*                                                                    */
/*  Création UNITAIRE, sur geste d'utilisateur (le clic EST la        */
/*  décision). Rien n'est fusionné : un doublon ou une ambiguïté      */
/*  REFUSE la création et le DIT — « on PROPOSE une fusion, on ne     */
/*  fusionne JAMAIS ».                                                */
/* ------------------------------------------------------------------ */

export const createContactFromCrmSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).nullish(),
  email: z.string().trim().max(320).nullish(),
  /** L'identifiant de la LIGNE CRM d'où vient cette personne — la trace de
   *  provenance, jamais un identifiant Bellum (le CRM externe n'en connaît pas). */
  crm_reference: z.string().trim().max(200).nullish(),
})

export type CreateContactFromCrmInput = z.infer<typeof createContactFromCrmSchema>

/**
 * `POST /accounts/:id/contacts/from-crm` — trois issues, et pas deux.
 *
 * `created` : la fiche existe, `contact_id` la désigne (c'est lui qui rend le
 * rappel possible). `duplicate` : une fiche répond DÉJÀ au même critère que
 * `resolveCrmContactToBellum` (e-mail normalisé, puis nom plié) — on ne crée
 * pas un second exemplaire, on rend celui qui existe. `ambiguous` : PLUSIEURS
 * fiches répondent au critère — on refuse et on le dit, plutôt que de choisir
 * à la place de quelqu'un.
 */
export type CreateContactFromCrmResult =
  | { status: 'created'; contact_id: string }
  | { status: 'duplicate'; contact_id: string }
  | { status: 'ambiguous'; matches: number }

/** Why a row did NOT land — the two branches `bulkImportManual` actually
 *  filters on, never a third state invented for the screen (#2159.63). */
export type BulkImportSkipReason = 'blank_name' | 'duplicate'

/** `POST /accounts/:id/contacts/bulk` — how many rows were inserted vs
 *  dropped as duplicates (case-insensitive `full_name` already on the
 *  account). `skipped_details` names EACH skipped row and why — #2159.63
 *  "Voir les exceptions" needs the real reason, not a re-derived guess; one
 *  entry per skipped row, bounded by the same 500-row cap as the request. */
export type BulkImportContactsResponse = {
  created: number
  skipped: number
  skipped_details: { full_name: string; reason: BulkImportSkipReason }[]
}

/* ------------------------------------------------------------------ */
/*  "Liste perso" ingestion — deterministic classify preview          */
/*  (Drive backlog #10, GPT-Mapping-décideurs). A rep pastes a raw     */
/*  contact list; the backend cleans + classifies each row into the    */
/*  family / decision-level taxonomy, scores relevance 1-5, and — the  */
/*  key rule — instead of silently dropping low-value rows, KEEPS them */
/*  with a `exclusion_reason` flag (⚠ en cas de doute, conserver).     */
/* ------------------------------------------------------------------ */

/** One row submitted for classification. Only `full_name` is required; the
 *  rest is best-effort (same lenient shape as the CSV import, plus `entity`). */
export const classifyContactInputSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).nullish(),
  entity: z.string().trim().max(200).nullish(),
  email: z.string().trim().max(320).nullish(),
  phone: z.string().trim().max(64).nullish(),
  linkedin_url: z.string().trim().max(1000).nullish(),
})

export const classifyContactsSchema = z.object({
  contacts: z.array(classifyContactInputSchema).min(1).max(500),
})

/** A single classified row returned for the rep's review. `exclusion_reason`
 *  is the load-bearing field: `null` ⇒ a clean high-value contact; non-null ⇒
 *  the human-readable reason it would normally be excluded — but it is STILL
 *  returned (never dropped) so the rep decides. */
export const classifiedContactSchema = z.object({
  full_name: z.string(),
  title: z.string().nullable(),
  entity: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  family: contactFamilySchema.nullable(),
  decision_level: contactDecisionLevelSchema,
  relevance_score: z.number().int().min(1).max(5),
  exclusion_reason: z.string().nullable(),
  /**
   * La forme canonique du titre quand le libellé est CONNU du référentiel
   * d'intitulés (`title-taxonomy.ts`), sinon `null`.
   *
   * ⚠️ `null` ne veut pas dire « mauvais titre » : le référentiel fait 298
   * entrées et ne prétend pas couvrir les intitulés de poste français. Il dit
   * seulement « je reconnais ce libellé » — c'est ce qui permet d'écrire à
   * l'écran « titre reconnu » plutôt que de laisser croire à une validation.
   */
  canonical_title: z.string().nullable(),
})

export const classifyContactsResponseSchema = z.object({
  contacts: z.array(classifiedContactSchema),
  /** Rows kept as high-value (`exclusion_reason === null`). */
  kept: z.number().int(),
  /** Rows flagged with a reason but still kept (`exclusion_reason !== null`). */
  flagged: z.number().int(),
})

/** Filtre "type de contact" — quel canal d'enrichissement est dispo.
 *  `missing_details` est l'INVERSE utile : les fiches que le bandeau compte sous
 *  « coordonnées à compléter » (email OU téléphone manquant). Sans lui, le KPI
 *  annonçait un nombre sans aucun chemin vers la liste correspondante.
 *  `with_phone` — #2167.51 — un canal DIRECT comme `with_email`, ajouté en fin
 *  de liste (GA-08) : la recette « cinq contacts avec email ET téléphone »
 *  n'avait aucun chemin vers les fiches qui portent un numéro. */
export const contactChannelFilterSchema = z.enum([
  'with_email',
  'with_linkedin',
  'with_both',
  'missing_details',
  'with_phone',
])

/**
 * Filtres acceptés par `GET /contacts`. Tous optionnels.
 *  - `q`       → recherche texte sur `full_name`, `title`, `email`,
 *                `account.company_name` (ILIKE %q%).
 *  - `role`    → filtre rôle décisionnel. `'all'` est admis (mapping
 *                URL ↔ API) et traité comme "pas de filtre" côté service.
 *  - `company` → ILIKE %company% sur `account.company_name`.
 *  - `channel` → présence d'email / LinkedIn / les deux, ou coordonnées
 *                incomplètes (`missing_details`).
 *  - `state`   → état du cycle de vie (`contacts.lifecycle_state`). Filtré
 *                SERVER-side : les pastilles annoncent un total workspace, donc
 *                cliquer une pastille doit paginer sur ce total, pas filtrer les
 *                25 lignes déjà chargées.
 */
/**
 * #4526.4 — la puce « Mon CRM » du Répertoire : les contacts d'origine CRM, c'est-à-dire
 * `crm` (fiche créée depuis une ligne du CRM branché) + `import` (reprise en masse de
 * l'ancien CRM). Une valeur du filtre `source`, jamais une valeur stockée — aucune
 * réécriture de `contacts.source`.
 */
export const MON_CRM_SOURCE_FILTER = 'mon_crm'
/**
 * ⚠️ #4597.2 — RENVERSEMENT de #4526.4 (« sources crm + import », livré le 24/10) : la puce « Mon CRM » ne
 * compte plus que `crm`. Mesuré en production, elle donnait 1 080 contacts, tous « Import de masse » — un
 * fichier importé n'est pas un CRM. Les fichiers ont leur puce « Importés » (`source = 'import'`).
 */
export const MON_CRM_SOURCES = ['crm'] as const
/** #4597.1 — la valeur du filtre `source` de la puce « Importés » et de la colonne « Origine » : `contacts.source`, lue telle quelle. */
export const IMPORT_SOURCE_VALUE = 'import' as const

export const contactListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  role: z.enum(['all', ...decisionRoleSchema.options]).optional(),
  company: z.string().trim().min(1).optional(),
  channel: contactChannelFilterSchema.optional(),
  state: contactLifecycleStateSchema.optional(),
  /**
   * Les contacts À QUALIFIER — sans entreprise connue (#1473).
   *
   * `contacts.account_id` peut valoir `null` depuis que le contact rencontré en
   * salon a le droit d'exister. Sans ce filtre, il se retrouve NOYÉ dans la
   * liste : la recherche texte porte sur le nom de société, donc elle ne peut
   * pas le trouver, et rien d'autre ne le distingue. Un état qui appelle une
   * action a besoin de sa file, sinon personne ne la vide.
   *
   * `false` n'est PAS l'inverse : il n'existe pas de besoin « montre-moi ceux
   * qui ONT une entreprise », c'est le cas par défaut. Le filtre est donc
   * présent-ou-absent, jamais un booléen à deux faces.
   */
  unassigned: z.coerce.boolean().optional(),
  /**
   * #4599 — les contacts dont l'e-mail est un GABARIT (`prenom.nom@…`) : le COMPTE exact, côté serveur, de ce que la
   * garde d'écriture refuse désormais. Présent-ou-absent (jamais l'inverse), comme `unassigned`.
   */
  placeholderEmail: z.coerce.boolean().optional(),
  /**
   * Inclure les contacts ÉCARTÉS (PDF 2, items 82-83).
   *
   * Défaut `false` : un contact écarté sort des listes, c'est le but du geste.
   * Mais il reste TROUVABLE — quelqu'un doit pouvoir relire pourquoi, et le
   * réintégrer si le motif ne tient plus. Le supprimer emporterait son
   * historique et rendrait l'exclusion irréversible, ce qu'elle n'est pas.
   */
  includeExcluded: z.coerce.boolean().optional(),
  /**
   * Le RÉSEAU DORMANT (tome 1 §11.4) : les contacts sans le moindre échange
   * depuis N mois.
   *
   * « Ses deux premières affaires ne viennent d'aucun signal » — elles viennent
   * d'une copine et du réseau de son associé. Le produit ne regardait jamais là.
   *
   * Aucune donnée nouvelle n'est collectée : on RELIT ce qui est déjà en base.
   * Le corps des messages n'entre pas dans le calcul, et un contact écarté ou
   * en opt-out n'y figure jamais — relancer quelqu'un qui a demandé le silence
   * est la faute la plus visible d'un outil de prospection.
   */
  dormantMonths: z.coerce.number().int().min(1).max(60).optional(),
  /**
   * #2158.67 — LA FRAÎCHEUR DE LA FICHE (`contact.updated_at`), distincte de
   * `dormantMonths` (l'ancienneté du dernier ÉCHANGE, `activities`) et de
   * `contactsFreshWithinMonths` (la collecte du COMPTE, `accounts.contacts_collected_at`) :
   * ici, la dernière fois que CETTE fiche a été mise à jour (import, enrichissement,
   * correction manuelle). `updated_at` n'est jamais `NULL` (colonne requise sur
   * `contactSchema`) — chaque fiche a donc une fraîcheur mesurée.
   */
  updatedWithinMonths: z.coerce.number().int().min(1).max(60).optional(),
  /**
   * #2159.26 — les contacts qui portent CETTE étiquette. Normalisée côté
   * serveur (`normalizeTag`) : « SAP » et « sap » filtrent pareil.
   */
  tag: z.string().trim().min(1).max(80).optional(),
  /**
   * #2834 (#2106.24) — les contacts « a changé d'employeur », le badge
   * `RISQUE` de `contactSourceTag`. Une seule valeur au contrat : c'est la
   * seule notion que l'épopée demande de rendre cliquable depuis le brief
   * (ligne « depuis ta dernière visite ») — `ARRIVEE`, le miroir de
   * `RISQUE`, n'a aucun appelant qui la demande.
   */
  sourceTag: z.enum(['RISQUE']).optional(),
  /**
   * #2158.61 — la ville/le pays où travaille le contact (`contact.location`,
   * #2165.38). ILIKE, comme `company` : une doctrine de recherche partielle,
   * pas une correspondance exacte. Ville et pays sont les deux SEULES
   * exceptions nommées à l'interdit des critères protégés (doctrine c58) —
   * jamais une adresse personnelle.
   */
  location: z.string().trim().min(1).optional(),
  /**
   * #4982.1 — le tri « zone » (proche d'abord) de la liste, fait EN SQL (la liste est paginée côté serveur) : en zone
   * du profil, puis lieu connu, puis hors France, la zone inconnue EN DERNIER. Absent ⇒ le plus récent d'abord.
   */
  sort: z.enum(['zone']).optional(),
  /**
   * #2158.57 — l'ENTITÉ du contact (`contact.entity` — filiale/direction/BU
   * DÉCLARÉE par le contact lui-même, déjà affichée en colonne). ILIKE,
   * même geste que `company`/`location` : un texte cherché, pas une
   * taxonomie fermée — l'entité est saisie en texte libre côté import/enrichissement.
   */
  entity: z.string().trim().min(1).optional(),
  /**
   * #2158.58 — la FONCTION du contact (`contact.title`). ILIKE, même geste
   * qu'`entity` : la recherche texte (`q`) porte déjà sur `title`, mais rien
   * ne permettait de le filtrer SEUL — chercher « DSI » via `q` remonte
   * aussi les sociétés et emails qui contiennent la chaîne.
   */
  title: z.string().trim().min(1).optional(),
  /**
   * #2158.68 — LA CIBLE (`target_list_items.contact_id`, referme la même
   * jointure que le message d'épopée #2997 : « jointure contact↔cible
   * absente »). Égalité EXACTE sur un identifiant de liste, jamais un ILIKE.
   * `removed_at IS NULL` : un élément RETIRÉ d'une liste n'y compte plus.
   */
  targetListId: z.string().guid().optional(),
  /**
   * #2158.65 — le PORTEUR du contact (`contacts.assigned_to`). Correspondance
   * EXACTE (un membre d'espace précis), jamais un ILIKE — c'est un identifiant,
   * pas un texte cherché.
   */
  assignedTo: z.string().guid().optional(),
  /**
   * #1903.15 — le COMPTE discuté quand Laura ouvre `/contacts` depuis le
   * chat. Correspondance EXACTE sur `contacts.account_id`, jamais un ILIKE
   * comme `company` : un nom de société peut se dupliquer entre deux
   * comptes homonymes, un identifiant ne peut pas.
   */
  accountId: z.string().guid().optional(),
  /**
   * #4475 — le MÊME filtre écrit en snake_case, comme le nomment les lignes
   * (`contact.account_id`) et les appelants hors web. Zod retirait en silence la
   * clé inconnue : `GET /contacts?account_id=…&limit=25` listait alors TOUT
   * l'espace (des dizaines de milliers de contacts et leurs agrégats) au lieu
   * des contacts du compte, et tombait en 500 (BLM-C1820F80). Le contrôleur le
   * replie sur `accountId` : un critère, une seule exécution.
   */
  account_id: z.string().guid().optional(),
  /**
   * #2294.2 — le SECTEUR du compte (`accounts.sector`). ILIKE, comme
   * `company` : un texte cherché, pas une taxonomie fermée — le secteur est
   * saisi/collecté en texte libre côté compte.
   */
  sector: z.string().trim().min(1).optional(),
  /**
   * #2294.2 — groupe ou filiale (`accounts.group_role`, même vocabulaire que
   * `DiscoverAccountRow.groupRole`, `discover.ts` — GA-26, un référentiel ne
   * se redéclare pas). Égalité EXACTE : deux valeurs fermées, jamais un texte
   * cherché.
   */
  groupRole: z.enum(['groupe', 'filiale']).optional(),
  /**
   * #2294.2 — « fraîcheur min » : ne garder que les contacts dont le compte a
   * collecté ses contacts il y a au plus N mois (`accounts.contacts_collected_at`).
   * Même granularité que `dormantMonths`. Un compte jamais collecté
   * (`contacts_collected_at IS NULL`) ne correspond à aucune fraîcheur — il
   * n'est pas datable, donc jamais compté comme frais.
   */
  contactsFreshWithinMonths: z.coerce.number().int().min(1).max(60).optional(),
  /**
   * #2158.60 — la FAMILLE MÉTIER (`contacts.family`, migration
   * `1782000000000`) : la colonne existe et est peuplée par le classifieur
   * d'import déterministe (`contact-classifier.ts`) depuis toujours, mais
   * n'était exposée par AUCUN filtre — la demande porte sur le filtre, pas
   * sur une donnée à collecter. Égalité EXACTE, comme `role` : une taxonomie
   * FERMÉE (`contactFamilySchema`), jamais un texte cherché. `'all'` est
   * admis (même mapping URL ↔ API que `role`) et traité comme « pas de
   * filtre » côté service.
   */
  family: z.enum(['all', ...contactFamilySchema.options]).optional(),
  /**
   * #2158.66 — LA SOURCE (`contacts.source`). Égalité EXACTE, comme `family` :
   * une taxonomie FERMÉE (`contactSourceSchema`), jamais un texte cherché.
   * `'all'` est admis (même mapping URL ↔ API que `role`/`family`) et traité
   * comme « pas de filtre » côté service.
   *
   * ⚠️ La valeur brute (`apollo`, `pappers`…) ne voyage QUE dans ce filtre —
   * jamais affichée telle quelle : l'écran ne montre que le libellé anonymisé
   * de `contactSourceLabel` (doctrine « nos fournisseurs ne se nomment
   * jamais »), la valeur du filtre en reste la clé interne.
   */
  source: z.enum(['all', ...contactSourceSchema.options, MON_CRM_SOURCE_FILTER]).optional(),
  /**
   * #4597.3 — « voir les N contacts de CET import » : l'identifiant du job d'import (`universal_import_jobs.id`),
   * jamais sa date. Un filtre AJOUTÉ : il restreint la vue, ne retire rien du répertoire.
   */
  importJob: z.string().guid().optional(),
  /**
   * #2158.59 — LE NIVEAU (`computeHierarchyLevel(contact.title)`,
   * `classified-data.ts`) : calculé pour AFFICHAGE seul jusqu'ici
   * (`ContactTableRow.tsx`), jamais persisté ni filtrable. Même fonction PURE
   * partagée, réappliquée ici plutôt que dupliquée (GA-26) — voir
   * `ContactsService.applyContactListFiltersExceptState`, qui la fait tourner
   * en JS sur `title`, jamais une réécriture en SQL qui pourrait diverger de
   * l'écran. Égalité EXACTE sur une taxonomie FERMÉE, `'all'` admis comme
   * « pas de filtre » — même mapping URL ↔ API que `role`/`family`.
   */
  hierarchyLevel: z.enum(['all', ...HIERARCHY_LEVELS]).optional(),
  /**
   * #2158.14 (#2997) — la vue « Sans prochaine action » demandée, posée en
   * FILTRE (doctrine de l'épopée : la partition de vues reste fermée à 5).
   * `next_relance_due_date` (#3098) est `null` quand aucune touche de cadence
   * n'est planifiée — ce filtre ne fait que le RESTREINDRE à ces lignes-là,
   * jamais une seconde règle qui pourrait diverger. Présent-ou-absent, comme
   * `unassigned` : il n'existe pas de besoin « montre-moi ceux qui EN ont
   * une », c'est déjà le défaut.
   */
  withoutNextAction: z.coerce.boolean().optional(),
  /**
   * #2158.69 (#2997) — la NATURE de la DERNIÈRE activité échangée (`activities.kind`,
   * bornée sur `MAX(occurred_at)` PARMI les échanges — même périmètre que
   * `INTERACTION_ACTIVITY_KINDS`, jamais une note ou un changement d'étape).
   * Distinct de `dormantMonths` (l'ANCIENNETÉ) : ici, le TYPE du dernier
   * contact (appel/email/réunion/LinkedIn). Un contact jamais échangé ne
   * correspond à aucune valeur — il n'a pas de dernière activité, donc
   * jamais compté comme « dernière action = X ».
   */
  lastActivityKind: z.enum(INTERACTION_ACTIVITY_KINDS).optional(),
  /**
   * #3718 — le STATUT déclaré du contact (`contacts.user_status`) : « Répondu »,
   * « Rendez-vous »… Sans ce filtre, « Traiter la réponse » n'était atteignable
   * que contact par contact (recette démo 10/10). Égalité exacte, comme `family`.
   */
  userStatus: contactStatusSchema.optional(),
  /**
   * #3942.2 — recette prod 09/10 (#3942, PARTIEL) : la portée « Recommandés »
   * de `/contacts` filtrait CÔTÉ CLIENT sur la page déjà chargée — sur un
   * espace de 41 304 contacts, les recommandés d'un compte pouvaient tomber
   * hors de la page 1, qui annonçait alors « aucun recommandé ». Le paramètre
   * part désormais dans la requête : le serveur classe PAR COMPTE (même
   * noyau que `rankForAccount`/l'onglet Contacts du dossier compte,
   * `rankAccountContacts`, GA-26) et referme la requête sur le chemin
   * recommandé AVANT pagination. `'all'` ou absent = comportement
   * HISTORIQUE, byte-identique (aucun filtre).
   */
  recommendedScope: z.enum(['recommended', 'all']).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const contactListItemSchema = z.object({
  id: z.string().guid(),
  /** `null` = contact à qualifier, sans entreprise connue (#1473). */
  account_id: z.string().guid().nullable(),
  full_name: z.string(),
  title: z.string().nullable(),
  entity: z.string().nullable(),
  decision_role: decisionRoleSchema.nullable(),
  /** #219.8 (#3231) — relation personne↔entreprise DÉCLARÉE ; `null`/absent = jamais déclarée. */
  declared_person_company_relation: z.string().nullable().optional(),
  priority: z.number().nullable(),
  email: z.string().nullable(),
  /** #4586.5 — vrai quand le NOM affiché est une déduction de l'adresse e-mail (jamais une saisie) ; absent/faux = rien à dire. */
  name_derived_from_email: z.boolean().optional(),
  /** #4016 L4.1 — même champ que `contactSchema.email_estimated_at` : l'adresse est ESTIMÉE (date de vérification). */
  email_estimated_at: z.string().nullable().optional(),
  phone: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  /**
   * #4290.12 — « a quitté l'entreprise » : l'employeur observé à la relecture et sa date. `null`/absent = aucune
   * preuve de départ (« non retrouvé » ne vaut pas départ) — jamais une ligne inventée.
   */
  employment_left: z.object({ organization: z.string(), at: z.string() }).nullable().optional(),
  /** Contact écarté, avec son motif. `null` = actif. */
  excluded_at: z.string().nullable().optional(),
  exclusion_reason: z.string().nullable().optional(),
  /** #2159.26 — les étiquettes, pour la colonne de la liste. Optionnel : un
   *  instantané IndexedDB d'avant la colonne ne la porte pas. */
  tags: z.array(z.string()).optional(),
  // Apollo profile photo (see contactSchema.photo_url) — optional so list
  // projections predating the column still validate.
  photo_url: z.string().nullable().optional(),
  // Surname as Apollo masks it on the search tier ("Mo***y") — present only while
  // nobody has paid to reveal the contact. Lets the row read "Séverine M." rather
  // than a bare first name. Optional: non-Apollo rows and pre-deploy IndexedDB
  // snapshots don't carry it.
  last_name_obfuscated: z.string().nullable().optional(),
  why_contact: z.string().nullable(),
  user_status: contactStatusSchema,
  source: z.string().nullable(),
  // Provenance dates (Théo p.16 — colonnes Source/Date de la table contacts) :
  // collecte (`created_at`) + dernière mise à jour (`updated_at`). Optional so
  // pre-deploy cached snapshots (IndexedDB) without them still validate.
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  /**
   * #2158.60 — la famille métier (`contacts.family`). `null` = le classifieur
   * n'a fait matcher aucune règle (jamais une famille devinée) ; optionnel :
   * une réponse antérieure à ce filtre ne porte pas la clé.
   */
  family: contactFamilySchema.nullable().optional(),
  /** Le nom de l'entreprise, `null` pour un contact à qualifier (#1473). La
   *  jointure est un LEFT JOIN : sans elle, la ligne DISPARAÎTRAIT de la liste. */
  company_name: z.string().nullable(),
  // Porteur du contact (`contacts.assigned_to`, migration 1788236104913) — le
  // même geste que `accounts.assigned_to`. Optional/nullable : les snapshots
  // IndexedDB d'avant ce déploiement n'ont pas la clé, `null` = non attribué.
  assigned_to: z.string().guid().nullable().optional(),
  // L'étiquette de source, calculée à la lecture (cf. `contactSchema.source_tag`).
  // `RISQUE` dit que l'employeur détecté ne correspond pas au compte, donc que
  // la personne est probablement partie. `ARRIVEE` (#2632.1) en est le miroir :
  // l'employeur détecté correspond au compte, précédé d'un employeur différent
  // — la personne vient d'arriver. Optionnel : un instantané IndexedDB d'avant
  // ce déploiement n'a pas la clé, et un badge absent vaut mieux qu'une liste
  // qui ne valide plus.
  source_tag: z.enum(['INTERNE', 'PUBLIC', 'HYPOTHÈSE', 'RISQUE', 'ARRIVEE']).nullable().optional(),
  /**
   * #2296.10/.36/.37 — le désaccord entre DEUX sources d'emploi : ce que
   * l'humain a saisi (`source_tag: 'INTERNE'`) contre ce qu'un fournisseur
   * rapporte. La correction humaine gagne toujours (`source_tag` ne bascule
   * jamais `RISQUE` pour cette raison) — mais le désaccord n'est pas tu pour
   * autant, il est nommé ici. `undefined` ⇒ aucun conflit (ligne non humaine,
   * ou les deux sources s'accordent).
   */
  employer_conflict: z.object({ detectedEmployer: z.string() }).optional(),
  // La date du dernier enrichissement — le moment où un fournisseur a dit où
  // travaille cette personne. C'est la date que les badges RISQUE et ARRIVEE affichent.
  last_enrichment_at: z.string().nullable().optional(),
  /**
   * #2297.26 (30/09/2026) — le RÉSULTAT et les CANAUX manquants de la dernière
   * tentative, repris ici pour la MÊME raison que `last_enrichment_at` juste
   * au-dessus : sans eux, `bulkEnrichmentExclusionReason` (`contact-views.ts`)
   * ne pouvait jamais reconnaître un contact sous délai de protection
   * (`enrichmentCooldown` exige `last_enrichment_result === 'no_new_data'`) —
   * cette liste le lui refusait par construction, quel que soit l'état réel du
   * contact.
   */
  last_enrichment_result: z.enum(CONTACT_ENRICHMENT_RESULTS).nullable().optional(),
  last_enrichment_missing: z.array(z.string()).nullable().optional(),
  /** E1 / #3822 — voir le schéma ci-dessus : l'état par coordonnée (panne = `unknown`). */
  enrichment_coordinates: enrichmentCoordinateStatesSchema.nullable().optional(),
  /** R22 a4 — la disponibilité ANNONCÉE par la source pour ce champ (available · unknown · not_found). */
  email_availability: z.enum(CONTACT_AVAILABILITIES).nullable().optional(),
  phone_availability: z.enum(CONTACT_AVAILABILITIES).nullable().optional(),
  /**
   * #2165.38 — LE LIEU DE TRAVAIL DÉCLARÉ, tel qu'il a été COLLECTÉ.
   *
   * La MÊME colonne que `contactSchema.location` (la fiche) : elle existait
   * depuis toujours, elle était alimentée par l'enrichissement, et cette
   * projection de liste la jetait. Le filtre « Localisation » de Découvrir
   * était donc refusé au motif exact qu'« aucune localisation n'existe sur la
   * liste des contacts » — vrai de la LISTE, faux de la donnée.
   *
   * ⚠️ C'est le lieu de TRAVAIL (ville, pays), jamais une adresse personnelle,
   * et il n'est JAMAIS rabattu sur le siège de l'entreprise : le siège est un
   * fait sur l'ORGANISATION, pas sur la personne, et les confondre revient à
   * affirmer où quelqu'un travaille sans l'avoir constaté. Ville et pays sont
   * les deux seules exceptions nommées à l'interdit des critères protégés
   * (`doctrine-registry.ts`, c58) — rien d'autre de ce registre ne passe ici.
   *
   * `null`/absent = INCONNU, jamais une chaîne vide affichée comme un lieu.
   */
  location: z.string().nullable().optional(),
  /**
   * #4982.2 — la ville du regroupement (tri « zone » seulement) : celle que la ligne porte, `null` = zone inconnue
   * (jamais devinée, jamais rabattue sur le siège du compte).
   */
  zone_city: z.string().nullable().optional(),
  /** #4982 — code département (métropole) du lieu du contact ; `null` = région inconnue, jamais devinée. */
  zone_department: z.string().nullable().optional(),
  /**
   * #4503 — LE SIÈGE DU COMPTE (`accounts.headquarters`), d'où la colonne « Compte » tire la VILLE (maquette V22 :
   * nom + ville). Un fait sur l'ORGANISATION, distinct de `location` juste au-dessus (où travaille la personne) :
   * l'un ne se rabat jamais sur l'autre. `null`/absent = sans compte, ou siège inconnu.
   */
  account_headquarters: z.string().nullable().optional(),
  /**
   * #2733 — la vérité de LIVRAISON (posée par le webhook Resend
   * `email.bounced`), distincte de `email_sent_at` qui ne prouve que
   * l'acceptation par Resend (doctrine c73_fait_ne_porte_pas_preuve_denvoi).
   * `null`/absent = aucun rebond connu — un instantané IndexedDB d'avant ce
   * déploiement n'a pas la clé.
   */
  email_bounced_at: z.string().nullable().optional(),
  /**
   * #3098 — la prochaine touche de cadence PLANIFIÉE et NON FAITE
   * (`action_plan_items.due_date`, `cadence_step IS NOT NULL AND done = false`),
   * la plus proche dans le temps. Alimente la carte du Kanban de prospection
   * (`/contacts`, colonnes par `user_status`) : « prochaine relance ».
   * `null`/absent = aucune touche planifiée — jamais une date inventée, et
   * jamais confondu avec « pas encore mesuré » (un instantané IndexedDB
   * d'avant ce déploiement n'a pas la clé, `undefined`).
   */
  next_relance_due_date: z.string().nullable().optional(),
  /**
   * #3942.5 — le rang 1-based DANS LE CHEMIN RECOMMANDÉ DE SON COMPTE (« N° k »,
   * même vocabulaire que le bloc « Chemin d'accès recommandé » du dossier
   * compte). Posé UNIQUEMENT quand `recommendedScope=recommended` est actif —
   * absent en portée « Tous », jamais un rang qui ne correspondrait à aucun tri
   * affiché (« on n'affiche pas ce qu'on n'a pas »). `undefined` sur une ligne
   * sans compte : un contact à qualifier n'entre jamais dans un chemin.
   */
  recommended_rank: z.number().int().positive().optional(),
  /**
   * #3942.5 — la taille du chemin recommandé DE SON COMPTE (≤ `RECOMMENDED_PATH_MAX`,
   * « le vrai nombre », brief F05 point 2) — ce qu'un en-tête de groupe par
   * compte affiche (« N contacts prioritaires »). Même présence que
   * `recommended_rank` : posé seulement en portée Recommandés.
   */
  recommended_path_size: z.number().int().positive().optional(),
})
/**
 * Compte de contacts par état du cycle de vie, sur l'ENSEMBLE du jeu filtré
 * (workspace + `q`/`role`/`company`/`channel`), pas sur la page
 * courante — c'est ce qui alimente les pastilles de `/contacts`.
 *
 * Invariant : la somme des 7 buckets == `pagination.totalItems` quand aucun
 * filtre `state` n'est appliqué (cf. `contacts.service.ts`, qui rabat les
 * `lifecycle_state` NULL sur l'état calculé plutôt que de les perdre). Les deux
 * états terminaux (`historique` ex-employé / `rejete` écarté, annexe p15) restent
 * à 0 tant que leur signal (employerMismatch / rejected) n'est pas alimenté.
 */
export const contactLifecycleTallySchema = z.object({
  detecte: z.number().int(),
  identite_verifiee: z.number().int(),
  qualifie: z.number().int(),
  enrichi: z.number().int(),
  actionnable: z.number().int(),
  historique: z.number().int(),
  rejete: z.number().int(),
})
export type ContactLifecycleTally = z.infer<typeof contactLifecycleTallySchema>

/**
 * #2934 (#2309.11/.12/.16/.17/.19/.20/.21) — POURQUOI un contact est écarté,
 * par raison RÉELLE, sur la même population filtrée que `lifecycleTally`.
 *
 * Trois raisons, chacune un signal déjà réel et déjà persisté ailleurs
 * (`email_suppressions`, `contact_stops`, l'identité partagée avec une autre
 * fiche du même compte) — jamais un motif deviné. Une raison sans AUCUN
 * contact concerné est ABSENTE de l'objet, jamais une clé à `0` : « on
 * n'affiche pas ce qu'on n'a pas ». Le quatrième motif nommé par l'épopée
 * (« poste quitté ») N'EST PAS répété ici : c'est le même fait que l'état
 * terminal `historique` de `contactLifecycleTallySchema` (signal
 * `employerMismatch`) — un second comptage aurait pu diverger du premier
 * (GA-26, « un réglage vit à un seul endroit »).
 */
export const CONTACT_REJECTION_REASONS = ['unsubscribed', 'stopped', 'duplicate'] as const
export const contactRejectionReasonSchema = z.enum(CONTACT_REJECTION_REASONS)
export type ContactRejectionReason = z.infer<typeof contactRejectionReasonSchema>
export const contactRejectionReasonsSchema = z.partialRecord(contactRejectionReasonSchema, z.number().int().positive())
export type ContactRejectionReasons = z.infer<typeof contactRejectionReasonsSchema>

/**
 * #2934 (#2309.11/.12/.17) — les TROIS raisons d'exclusion que l'épopée nomme
 * mais qu'AUCUN détecteur ne mesure aujourd'hui : mauvaise entreprise
 * (`wrong_company`), mauvaise entité (`wrong_entity`), information trop
 * ancienne (`stale_information`). Vérifié `git grep` sur `apps/api/src/modules`
 * et `packages/contracts` : aucun signal existant ne les distingue.
 *
 * Distincte de `CONTACT_REJECTION_REASONS` (mesurées, comptées, une raison à
 * zéro fait ABSENCE de ligne — « on n'affiche pas ce qu'on n'a pas »). Ici
 * c'est l'inverse : une raison non mesurable n'est pas « zéro contact
 * concerné », c'est « on ne sait pas la compter » — la même distinction que
 * GA-18/19 pour un axe de score non évaluable, appliquée à une raison
 * d'exclusion. Elle se NOMME donc TOUJOURS (jamais conditionnée à une
 * donnée, puisqu'il n'y en a pas), jamais rendue comme un compte à 0.
 *
 * Constante STATIQUE, pas un endpoint : ce que le produit ne sait pas mesurer
 * ne varie pas d'un espace à l'autre ni d'une requête à l'autre.
 */
export const CONTACT_UNMEASURED_REJECTION_REASONS = ['wrong_company', 'wrong_entity', 'stale_information'] as const
export const contactUnmeasuredRejectionReasonSchema = z.enum(CONTACT_UNMEASURED_REJECTION_REASONS)
export type ContactUnmeasuredRejectionReason = z.infer<typeof contactUnmeasuredRejectionReasonSchema>

/** #2309.16/.19 — voir `contactListResponseSchema.preCreationExclusions`. */
export type ContactPreCreationExclusions = {
  ambiguous_identity?: number
  duplicate_identity?: number
}

/** #3942.2 — voir `contactListResponseSchema.recommendedTally`. */
export type ContactChannelTally = NonNullable<z.infer<typeof contactListResponseSchema>['channelTally']>

export type ContactRecommendedTally = {
  recommended: number
  all: number
}

export const contactListResponseSchema = paginatedResultSchema(contactListItemSchema).extend({
  // Optionnel : seule la 1re page (offset 0) le calcule — les pages suivantes
  // n'ont pas à repayer l'agrégat, et les snapshots IndexedDB d'avant ce déploiement
  // (sans le champ) restent valides. Absent ⇒ l'UI n'affiche AUCUN compteur
  // plutôt qu'un chiffre faux.
  lifecycleTally: contactLifecycleTallySchema.optional(),
  /**
   * Contacts créés dans les sept derniers jours, **sur exactement la population
   * que `lifecycleTally` compte** — mêmes filtres, même recherche, même portée.
   *
   * ⚠️ Il existait déjà un `savedThisWeek` dans les statistiques du tableau de
   * bord, et l'écran l'affichait sous le funnel. Il compte **tout l'espace**,
   * sans filtre : la démonstration affichait donc « 254 détectés » surmonté de
   * « **+255 cette semaine** » — un delta plus grand que son propre total.
   * Deux nombres sous le même bandeau doivent compter la même chose, sans quoi
   * le lecteur conclut que l'un des deux est faux. Il a raison.
   *
   * Absent ⇒ l'écran n'affiche RIEN, jamais un « +0 » creux.
   */
  lifecycleWeeklyNet: z.number().int().nonnegative().optional(),
  /** #2934 — voir `contactRejectionReasonsSchema`. Absent ⇒ l'écran n'affiche
   *  aucune ligne de raison, jamais un décompte faux. */
  rejectionReasons: contactRejectionReasonsSchema.optional(),
  /**
   * #2309.16/.19 — POURQUOI un candidat n'est JAMAIS devenu une fiche, sur
   * TOUT l'espace (`contact_intake_exclusions`) : distinct de `lifecycleTally`,
   * qui ne compte que des fiches déjà créées — un candidat écarté avant
   * création n'entre dans AUCUN de ses buckets, y compris `rejete`.
   *
   * Une raison à zéro est ABSENTE de la clé rendue : « on n'affiche pas ce
   * qu'on n'a pas ». Absent ⇒ l'écran n'affiche AUCUNE ligne.
   */
  preCreationExclusions: z
    .object({
      ambiguous_identity: z.number().int().positive().optional(),
      duplicate_identity: z.number().int().positive().optional(),
    })
    .optional(),
  /**
   * #3942.2 — le compteur « Recommandés X / Tous Y » de `/contacts`
   * (`ContactsRecommendedToggle`), sur la MÊME population que `lifecycleTally`
   * (mêmes filtres, mais jamais la portée `recommendedScope` elle-même —
   * sinon « Tous » deviendrait illisible dès que « Recommandés » est actif).
   * Calculé UNIQUEMENT quand `recommendedScope=recommended` est posé (le
   * coût d'un second classement ne se paie que quand le geste le demande) et
   * UNIQUEMENT sur la 1re page (comme `lifecycleTally`). Absent ⇒ le bandeau
   * n'affiche AUCUN chiffre, jamais un faux.
   */
  recommendedTally: z
    .object({ recommended: z.number().int().nonnegative(), all: z.number().int().nonnegative() })
    .optional(),
  /**
   * #4527.1 — les chiffres des tuiles / puces « Avec e-mail · Avec téléphone · À rattacher
   * · Mon CRM », comptés CÔTÉ SERVEUR sur la population de la liste (mêmes recherche,
   * vue, compte, filtres) SANS le filtre de la puce elle-même : chaque chiffre est le
   * nombre de lignes que la puce afficherait si on la posait. 1re page seulement.
   * Absent ⇒ la tuile n'affiche AUCUN chiffre, jamais « 0 » (GA-18/19, garde 549f2b2753).
   */
  channelTally: z
    .object({
      withEmail: z.number().int().nonnegative(),
      withPhone: z.number().int().nonnegative(),
      unattached: z.number().int().nonnegative(),
      monCrm: z.number().int().nonnegative(),
      /** #4597.1 — « Importés » : les fiches `source = 'import'`. Absent = la puce se tait, jamais « 0 ». */
      imported: z.number().int().nonnegative().optional(),
    })
    .optional(),
})

export const contactStatsSchema = z.object({
  total: z.number().int(),
  toEnrich: z.number().int(),
  savedThisWeek: z.number().int(),
  savedLastWeek: z.number().int(),
  enrichedToday: z.number().int(),
  enrichedYesterday: z.number().int(),
})

/**
 * #2384.5 — la délivrabilité, DISTINCTE du taux d'envoi (« combien de messages
 * sont partis ») : « combien de ce qui est parti a réellement atteint la
 * boîte du destinataire ». `sent`/`bounced`/`bounceReasons` sont MESURÉS,
 * posés par le webhook fournisseur (#2733, `email_bounced_at`/
 * `email_bounce_reason` sur `contacts`) — jamais devinés.
 *
 * `domainReputation`/`complaints` restent `null` : aucun connecteur ne les
 * mesure aujourd'hui (pas de webhook plainte, pas de score de réputation de
 * domaine branché). Nommés et non `0` (GA-18/GA-19, doctrine « non mesuré
 * n'est jamais 0 ») — l'écran les affiche via `UnknownValue`, jamais masqués.
 */
export const contactDeliverabilitySchema = z.object({
  sent: z.number().int(),
  bounced: z.number().int(),
  /** `null` sans envoi mesuré — un taux sur un dénominateur nul ne se calcule pas. */
  bounceRate: z.number().nullable(),
  bounceReasons: z.array(z.object({ reason: z.string(), count: z.number().int() })),
  /** Non mesuré aujourd'hui (aucun connecteur de réputation de domaine branché). */
  domainReputation: z.null(),
  /** Non mesuré aujourd'hui (aucun webhook de plainte branché). */
  complaints: z.null(),
})

/**
 * #2842 (reste, 26/09) — épopée #2074.13-.19, tranché sans Louis :
 * `contactFollowUps` de `CommercialTensionExternalSignals`
 * (`apps/web/src/features/commercial-audit/lib/tension-detectors.ts`).
 * `total` = les contacts PRIS (`email_sent_at`, le même fait que
 * `ContactDeliverability.sent`, GA-26) ; `withNextStepDate` = ceux qui ont
 * encore au moins une touche de cadence OUVERTE (`action_plan_items`) — la
 * date de reprise que la règle réclame.
 */
export const contactFollowUpStatsSchema = z.object({
  total: z.number().int().min(0),
  withNextStepDate: z.number().int().min(0),
})

/**
 * #2155.24/.25 — le badge de navigation « Contacts ».
 *
 * Un compteur de nav est STRICTEMENT actionnable (retour #2155, QCM Louis
 * 15/09/2026) : `readyToProcess` compte les contacts « prêts à traiter »,
 * c'est-à-dire une coordonnée VÉRIFIÉE (`email_verified`), rattachés à un
 * compte du portefeuille, et sans aucune action ouverte les concernant —
 * jamais un volume total de contacts.
 *
 * ⚠️ `optional()`, jamais `0` par défaut : « je n'ai pas pu compter » (la
 * mesure échoue) et « il n'y en a aucun » sont deux phrases différentes, et
 * dans les deux cas le badge de nav ne s'affiche pas — une valeur absente ne
 * s'affiche jamais « 0 » (gardes GA-18/GA-19). C'est à l'appelant (le rendu
 * de la barre latérale) de ne rien montrer quand la clé est absente.
 */
export const contactBadgeCountersSchema = z.object({
  readyToProcess: z.number().int().nonnegative().optional(),
})

/* ------------------------------------------------------------------ */
/*  Contact lifecycle transition journal (P0 « états + providers »)   */
/*  Append-only log of each passage détecté → identité vérifiée →     */
/*  qualifié → enrichi → actionnable, with the provider (source) and  */
/*  the REAL date of the transition — so "détecté le X / vérifié le Y" */
/*  is traceable instead of recomputed. `from_state` is null for the   */
/*  first (detection) row; `actor` is the acting user_id when known,   */
/*  null for a pipeline/system transition.                             */
/* ------------------------------------------------------------------ */
export const contactLifecycleTransitionSchema = z.object({
  id: z.string().guid(),
  contact_id: z.string().guid(),
  from_state: contactLifecycleStateSchema.nullable(),
  to_state: contactLifecycleStateSchema,
  source: contactSourceSchema.nullable(),
  occurred_at: z.string(),
  actor: z.string().nullable(),
})

/** `GET /contacts/:id/lifecycle` — the contact's current persisted state plus
 *  its full transition history (chronological), so the UI can render
 *  "détecté le … / identité vérifiée le … / enrichi le …". */
export const contactLifecycleHistorySchema = z.object({
  contact_id: z.string().guid(),
  state: contactLifecycleStateSchema.nullable(),
  transitions: z.array(contactLifecycleTransitionSchema),
})

export type Contact = z.infer<typeof contactSchema>
export type ContactSignal = z.infer<typeof contactSignalSchema>
export type ContactActivity = z.infer<typeof contactActivitySchema>
export type ContactRelation = z.infer<typeof contactRelationSchema>
export type DecisionRole = z.infer<typeof decisionRoleSchema>
export type ContactStatus = z.infer<typeof contactStatusSchema>
export type ContactSource = z.infer<typeof contactSourceSchema>
export type ContactFamily = z.infer<typeof contactFamilySchema>
export type ContactDecisionLevel = z.infer<typeof contactDecisionLevelSchema>
export type ClassifyContactInput = z.infer<typeof classifyContactInputSchema>
export type ClassifiedContact = z.infer<typeof classifiedContactSchema>
export type ClassifyContactsResponse = z.infer<typeof classifyContactsResponseSchema>
export type ContactChannelFilter = z.infer<typeof contactChannelFilterSchema>
export type EnrichContact = z.infer<typeof enrichContactSchema>
export type UpdateContactStatus = z.infer<typeof updateContactStatusSchema>
export type UpdateContactNote = z.infer<typeof updateContactNoteSchema>
export type PersonCompanyRelationValue = z.infer<typeof personCompanyRelationSchema>
export type UpdateContactHidden = z.infer<typeof updateContactHiddenSchema>
export type ContactListQuery = z.infer<typeof contactListQuerySchema>
export type ContactListItem = z.infer<typeof contactListItemSchema>
export type ContactListResponse = z.infer<typeof contactListResponseSchema>
export type ContactStats = z.infer<typeof contactStatsSchema>
export type ContactDeliverability = z.infer<typeof contactDeliverabilitySchema>
export type ContactFollowUpStats = z.infer<typeof contactFollowUpStatsSchema>
export type ContactBadgeCounters = z.infer<typeof contactBadgeCountersSchema>
export type ContactLifecycleTransition = z.infer<typeof contactLifecycleTransitionSchema>
export type ContactLifecycleHistory = z.infer<typeof contactLifecycleHistorySchema>
