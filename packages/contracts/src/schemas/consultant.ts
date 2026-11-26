import { z } from 'zod'
import { clearanceSchema, spokenLanguageSchema } from './language.js'
import { clientHistoryMarkSchema } from './client-history-flag.js'
import {
  siteFrequencySchema,
  talentMobilitySchema,
  talentPreferencesSchema,
  talentProcessSchema,
} from './talent-preferences.js'
import { fieldSourceSchema } from './provenance.js'
import { talentConsentSchema } from './talent-consent.js'
import { talentKindSchema, talentReviewStatusSchema } from './talent.js'
import { talentInterviewTraitSchema, talentRampUpSchema } from './talent-interview-assessment.js'
import { consultantFieldReportSchema } from './consultant-field-report.js'

/* ------------------------------------------------------------------ */
/*  Vivier de consultants — annexe méthodo p22 « Sourcing, push profil */
/*  et soutenance ».                                                   */
/*                                                                     */
/*  « Le profil est une offre commerciale SEULEMENT s'il est qualifié, */
/*  préparé et relié au besoin. »                                      */
/*                                                                     */
/*  Rien de tout ça n'existait : le produit savait détecter un besoin  */
/*  (module `opportunities`) et ne savait pas qui y répondre. Un       */
/*  commercial ESN vend des PERSONNES ; sans vivier, « pousser un      */
/*  profil » restait un libellé d'action que rien ne pouvait exécuter. */
/*                                                                     */
/*  Les champs sont EXACTEMENT ceux que la p22 liste pour le vivier :  */
/*  dispo, TJM, zone, CDI/freelance, stack, secteur, références,       */
/*  envie. Pas un de plus — un vivier qui demande vingt champs ne se   */
/*  remplit jamais.                                                    */
/* ------------------------------------------------------------------ */

/** Ce que le consultant est prêt à faire — la ligne « CDI/freelance » p22.
 *  `portage` existe en France et n'est ni l'un ni l'autre côté contrat.
 *
 *  `cdd` et `sous_traitance` sont ajoutés EN FIN (PDF 3 §6.1, colonne 11) : la
 *  garde d'additivité refuse une insertion au milieu, et l'ordre d'un enum est
 *  lu par des tests de baseline. */
export const CONSULTANT_CONTRACTS = ['cdi', 'freelance', 'portage', 'inconnu', 'cdd', 'sous_traitance'] as const
export const consultantContractSchema = z.enum(CONSULTANT_CONTRACTS)
export type ConsultantContract = z.infer<typeof consultantContractSchema>

/**
 * COMMENT on mobilise la personne (D16, tranché le 20/08).
 *
 * Champ SÉPARÉ de `kind`, et c'est le cœur de la décision. `kind` porte une
 * question de DROIT — un candidat est une donnée personnelle bornée à deux ans,
 * un consultant est une donnée d'entreprise justifiée par un contrat de
 * travail. `engagement_kind` porte une question de COMMERCE : qui paie qui, et
 * donc quel coût la personne représente.
 *
 * Les fusionner rendrait « un freelance qu'on suit encore comme candidat »
 * inexprimable, et ferait dépendre la politique de rétention du mode de
 * facturation. Ce sont deux axes, comme `commercial_status` et `priority_gate`
 * côté compte.
 *
 * #2948 (#2329.28) — `partenaire` : la personne EST elle-même l'entité
 * partenaire (principal d'une société partenaire qui exécute directement),
 * distinct de `sous_traitance` où `partner_account_id` porte un TIERS qui
 * répond pour quelqu'un d'autre. Contrainte SQL élargie AVANT ce changement
 * (GA-11/GA-12) : `20260927181000-ConsultantEngagementPartner`.
 * `engagementNeedsPartner` reste `false` pour cette valeur — on ne se porte
 * pas soi-même. Ajoutée EN FIN, après `inconnu` (GA-08) : une taxonomie ne
 * grandit qu'en queue, jamais entre deux valeurs déjà en service.
 */
export const ENGAGEMENT_KINDS = ['salarie', 'freelance', 'portage', 'sous_traitance', 'inconnu', 'partenaire'] as const
export const engagementKindSchema = z.enum(ENGAGEMENT_KINDS)
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number]

/**
 * Un engagement de sous-traitance SANS partenaire n'est pas exploitable.
 *
 * « Un sous-traitant porte toujours son partenaire » (§2, règle 3) : sans lui,
 * personne ne sait qui est responsable devant le client le jour où ça se passe
 * mal. La règle est ici, pure, plutôt que dans un `refine` du seul schéma
 * d'écriture — l'écran doit pouvoir poser la même question avant d'envoyer.
 */
export function engagementNeedsPartner(kind: EngagementKind): boolean {
  return kind === 'sous_traitance'
}

/**
 * Disponibilité — la première question d'un client, et la première source de
 * mensonge commercial. `immediate` engage : on ne le coche pas « au cas où ».
 *
 * #2186.5 — `en_mission` AJOUTÉE EN FIN (GA-08, décision de Louis du
 * 16/09/2026) : la fiche conflatait « en mission ailleurs » (une affectation
 * DÉCLARÉE par la personne, hors du suivi `mission_assignments` de l'ESN) et
 * `indisponible` (pas mobilisable, pour n'importe quelle autre raison) sous la
 * même valeur — `consultants.json` traduisait `indisponible` par « En
 * mission », ce qui rendait l'un et l'autre indiscernables à l'écran. Pas de
 * contrainte SQL à élargir (GA-11/GA-12) : la colonne `consultants.availability`
 * est `text`, sans CHECK — vérifié le 21/09/2026, aucune migration ne la
 * contraint (`check-constraints-additive.spec.ts` ne la cite pas).
 *
 * `a_confirmer` (#2186.7/#2186.14, la disponibilité déclarée mais PÉRIMÉE)
 * n'entre volontairement PAS dans cette liste : elle ne se stocke jamais, elle
 * se CALCULE à la lecture (`effectiveDeclaredAvailability`,
 * `apps/api/src/modules/consultants/declared-availability.ts`) à partir de
 * `availability_checked_at` — sinon le passage « à confirmer » dépendrait d'une
 * écriture que personne n'a faite, alors que la doctrine exige qu'il ait lieu
 * SEUL, sans geste humain.
 */
export const CONSULTANT_AVAILABILITIES = [
  'immediate', //   disponible maintenant (intercontrat)
  'sous_1_mois', // sort de mission sous ~4 semaines
  'sous_3_mois', // fin de mission connue à ~3 mois
  'indisponible', // pas mobilisable, pour une autre raison qu'une mission en cours
  'inconnu', //     non renseigné — JAMAIS présenté comme disponible
  'en_mission', //  #2186.5 — une affectation ailleurs, déclarée par la personne
] as const
export const consultantAvailabilitySchema = z.enum(CONSULTANT_AVAILABILITIES)
export type ConsultantAvailability = z.infer<typeof consultantAvailabilitySchema>

/** Séniorité — pèse sur le TJM tenable et sur ce qu'on peut promettre. */
export const consultantSenioritySchema = z.enum(['junior', 'confirme', 'senior', 'expert', 'inconnu'])
export type ConsultantSeniority = z.infer<typeof consultantSenioritySchema>

/**
 * D'où vient la fiche. Liste OUVERTE côté base (colonne `text` sans contrainte)
 * et fermée côté contrat, parce que l'écran la traduit : une valeur inconnue
 * afficherait sa clé brute. `null` = on ne sait pas, ce qui reste une réponse.
 */
export const CONSULTANT_SOURCES = [
  'manual', //     saisie à la main dans le vivier
  'cv', //         créé depuis un CV déposé
  'import', //     import de fichier ou reprise
  'ats', //        remonté d'un ATS connecté
  'referral', //   cooptation
  'linkedin_profile', // pré-rempli depuis l'URL d'un profil LinkedIn (H-DECISIONS #4348)
] as const
export const consultantSourceSchema = z.enum(CONSULTANT_SOURCES)
export type ConsultantSource = z.infer<typeof consultantSourceSchema>

/**
 * #2948 (#2329.12/.13/.14/.16, registre `.11`-`.16` — TJM : unité, devise,
 * source, contexte, date, confidentialité) — CE QUE PORTE UN TJM, AU-DELÀ DU
 * MONTANT.
 *
 * L'UNITÉ (#2329.11) n'a pas de champ ici : un TJM est un taux JOURNALIER par
 * construction, dans tout le domaine financier (`min_tjm_cents`,
 * `target_tjm_cents` d'un besoin) — en ajouter un par fiche ouvrirait deux
 * représentations du même fait (GA-26, « un réglage vit à un seul endroit »).
 *
 * Les cinq AUTRES axes sont bien absents avant ce lot (mesuré : aucun champ
 * `currency`/`source`/`context`/`observed_at`/`confidential` sur
 * `consultants`) :
 *  - `currency` — code ISO 4217, jamais deviné (`null` = non renseigné, pas
 *    « EUR » par défaut, un consultant en régie hors zone euro existe).
 *  - `source` — texte libre (« déclaré par le consultant », « mission
 *    précédente chez Renault ») : aucune échelle commune ne survit à deux
 *    clients, même patron que `context`/`constraints` d'un besoin.
 *  - `context` — idem, texte libre.
 *  - `observed_at` — QUAND ce TJM a été vrai. `null` = non daté. Distinct de
 *    `updated_at` (quand la LIGNE a été écrite) : un TJM ressaisi tel quel
 *    trois mois après reste vieux de trois mois, pas d'aujourd'hui.
 *  - `confidential` — une information SAISIE, pas encore un GATE : aucun
 *    export/partage client de cette donnée n'existe aujourd'hui (mesuré),
 *    gater une porte absente serait deviner sa forme. Le champ reste derrière
 *    `finance:read` comme le reste du TJM, prêt pour ce jour-là.
 */
export const tjmMetadataSchema = z.object({
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'currency doit être un code ISO 4217 (ex. EUR)')
    .nullable(),
  source: z.string().trim().max(200).nullable(),
  context: z.string().trim().max(500).nullable(),
  observed_at: z.string().nullable(),
  confidential: z.boolean(),
})
export type TjmMetadata = z.infer<typeof tjmMetadataSchema>

/**
 * #2948 (#2329.42/.44) — un TJM D'UNE ANCIENNE MISSION est un CONTEXTE
 * HISTORIQUE, jamais la condition ACTUELLE.
 *
 * Seuil DÉLIBÉRÉMENT distinct de `AVAILABILITY_REVALIDATION_DAYS` (60 jours,
 * `matching/pushable.ts`) : deux faits différents, deux horloges différentes.
 * Une disponibilité DÉCLARÉE se périme vite — elle engage une conversation
 * dans les prochaines semaines. Un TJM observé reste un FAIT VÉCU longtemps
 * après avoir été vrai (« ce TJM date d'une mission d'il y a huit mois » reste
 * une donnée utile, juste plus une condition actuelle) — copier le seuil de
 * l'un sur l'autre confondrait deux horloges qui n'ont pas la même raison
 * d'être courtes ou longues (GA-26 : deux réglages, jamais un seul recopié).
 *
 * Pure : `now` en paramètre, jamais lu de l'horloge système — un badge qui
 * changerait de jour en jour sans qu'aucune ligne ne bouge ne serait pas
 * testable.
 */
export const TJM_HISTORICAL_AFTER_DAYS = 180

export type TjmFreshness = 'recent' | 'historical' | 'unknown'

export function tjmObservedFreshness(observedAt: string | null | undefined, now: Date): TjmFreshness {
  if (!observedAt) return 'unknown'
  const parsed = Date.parse(observedAt)
  if (Number.isNaN(parsed)) return 'unknown'
  const days = Math.floor((now.getTime() - parsed) / (24 * 60 * 60 * 1000))
  return days > TJM_HISTORICAL_AFTER_DAYS ? 'historical' : 'recent'
}

/**
 * #2948 (#2329.45-.51) — L'ACCORD À 7 CONDITIONS avant présentation.
 *
 * Sur les 7 (disponibilité confirmée, mission comprise, TJM/conditions
 * validées, intérêt réel, compte autorisé, autres processus connus, CV
 * validé), CINQ sont LISIBLES ici ou ailleurs sur la fiche — disponibilité
 * confirmée (`declaredAvailability`/staleness), compte autorisé
 * (`consultant_account_consent`), TJM validé et CV validé (ci-dessous), et
 * autres processus connus (`otherProcessesKnown`, DÉRIVÉ de
 * `process.otherInterviews`, jamais un second champ — GA-26). « Mission
 * comprise » et « intérêt réel » (#2329.46/.48) restent HORS : ce sont des
 * faits PAR OPPORTUNITÉ, pas des faits globaux sur la personne — voir la
 * migration `20260927181300-ConsultantPositioningAgreement`.
 */
export const talentPositioningAgreementSchema = z
  .object({
    /** #2329.47 — geste explicite du commercial, jamais déduit. `null` =
     *  jamais confirmé. */
    tjmValidatedAt: z.string().nullable(),
    /** #2329.51 — CV validé ou règles d'usage acceptées. `null` = jamais
     *  confirmé. */
    cvValidatedAt: z.string().nullable(),
    /** #2329.50 — DÉRIVÉ de `process.otherInterviews !== null`, jamais un
     *  second champ stocké (GA-26). */
    otherProcessesKnown: z.boolean(),
  })
  .strict()
export type TalentPositioningAgreement = z.infer<typeof talentPositioningAgreementSchema>

/** Une personne du vivier. */
export const consultantSchema = z.object({
  id: z.string().guid(),
  workspace_id: z.string().guid().nullable(),
  /** Import universel (27/09/2026) — colonnes importées sans champ d'accueil ; absent sous un masque de visibilité. */
  extra: z.record(z.string(), z.string()).optional(),
  /**
   * #4401.1 — colonnes de la fiche dont la forme était illisible (CV importé partiel) : lues « absentes » et NOMMÉES,
   * pour que l'écran le dise au lieu de tomber. Absent quand tout s'est lu.
   */
  unreadable_fields: z.array(z.string()).optional(),
  /**
   * #4577.3 — PROVENANCE PAR CHAMP de la fiche (nom de colonne → source courante). `human` = « saisi à la main » :
   * la valeur ne sera JAMAIS écrasée par une resynchro ou un réimport (une correction humaine gagne toujours).
   * Un champ absent de la table n'a pas de provenance (jamais inventée). Posé par le contrôleur sur `GET :id`.
   */
  field_sources: z.record(z.string(), fieldSourceSchema).optional(),
  /**
   * Candidat ou consultant en poste. La colonne existait en base depuis la
   * tranche T5 ; elle ne voyageait PAS jusqu'à l'écran, si bien que le vivier
   * ne distinguait pas les deux — alors que la moitié des règles du domaine
   * (rétention, coût, onglet Missions) en dépendent.
   */
  kind: talentKindSchema,
  /** Voir `consultantSourceSchema`. Colonne en base depuis T5, jamais lue. */
  source: consultantSourceSchema.nullable(),
  /** Dernier contact connu — l'ancrage de la rétention d'un dossier candidat. */
  last_contact_at: z.string().nullable(),
  /**
   * Sortie du vivier ACTIF, données conservées (§13.2).
   *
   * `null` = actif. Une date et non un booléen : savoir QUAND quelqu'un est
   * parti répond à la moitié des questions qu'on se pose ensuite.
   */
  archived_at: z.string().nullable(),
  archived_reason: z.string().nullable(),
  /** Relue par un humain, ou pas encore (§3.3). */
  review_status: talentReviewStatusSchema,
  /** Ce que la PERSONNE a accepté, quand, et sur quelle base (§7.3). */
  consent: talentConsentSchema,
  /**
   * `null` tant que personne n'a donné le nom de la personne (D366).
   *
   * Une fiche née d'un CV déposé n'en a pas : le fichier a été lu, l'identité
   * pas encore relue. Elle portait auparavant le NOM DU FICHIER, ce qui rendait
   * ce champ non nul au prix d'un mensonge. La chaîne vide reste interdite —
   * elle serait le prochain remplissage (`consultants_full_name_not_blank`).
   */
  full_name: z.string().min(1).nullable(),
  /** Le métier en une ligne (« Ingénieur sécurité réseau »). */
  title: z.string().nullable(),
  seniority: consultantSenioritySchema,
  /**
   * Années d'expérience — SAISIES sur la personne, jamais déduites (décision
   * de Louis du 31/08/2026, écran Vivier, PDF-22 §01).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE CHAMP, ET PAS UN AGRÉGAT DE `consultantSkillSchema.years`
   * ─────────────────────────────────────────────────────────────────────────
   * Le tiroir de filtres promettait « années d'expérience » depuis le socle,
   * sans qu'aucun champ ne le porte : `consultantSkillSchema.years` ne mesure
   * l'ancienneté que sur UNE compétence (« 6 ans de Kubernetes »), jamais sur
   * la personne. Un agrégat improvisé — le plus grand `years` d'une
   * compétence, par exemple — mesurerait autre chose que ce que le libellé
   * promet : quelqu'un peut pratiquer Kubernetes depuis deux ans après quinze
   * ans de carrière ailleurs, et l'inverse est tout aussi courant.
   *
   * `null` = non renseigné — jamais confondu avec `0`, qui reste ici une
   * vraie réponse (« tout juste diplômée ») et non une valeur de remplissage.
   * C'est l'inverse de `consultantSkillSchema.years`, où `0` n'a pas de sens
   * (une compétence LISTÉE a forcément été pratiquée) : sur la PERSONNE,
   * l'ancienneté professionnelle démarre légitimement à zéro.
   */
  years_experience: z.number().int().min(0).max(60).nullable(),
  /**
   * La photo de la personne (écran Vivier, PDF-22 §01, piège n°3). LECTURE
   * SEULE ici — absente de `consultantUpsertSchema` à dessein : le SEUL
   * chemin d'écriture est `PUT /talents/:id/photo` (`talentPhotoSchema`),
   * géré par `TalentPhotoService`, hors de la liste des moteurs de sélection
   * surveillés par `protected-criteria.spec.ts` (GA-06). La faire voyager par
   * l'upsert général ouvrirait un second chemin d'écriture pour un critère
   * PROTÉGÉ, sans validation de forme (taille, type MIME).
   *
   * `null` = aucune photo déposée — l'état de toute fiche tant que personne
   * n'a utilisé ce chemin. `optional` — comme `email`/`phone` un peu plus
   * haut — pour qu'un objet de test construit avant ce lot reste valide :
   * seule l'ABSENCE du champ change de sens (« pas mesuré » plutôt que « pas
   * de photo »), jamais son écriture par un vrai appelant.
   */
  photoUrl: z.string().nullable().optional(),
  availability: consultantAvailabilitySchema,
  /** Date de disponibilité quand elle est connue (ISO `YYYY-MM-DD`). Sert à
   *  vérifier qu'une dispo « immédiate » saisie il y a six mois est périmée. */
  available_from: z.string().nullable(),
  contract_type: consultantContractSchema,
  engagement_kind: engagementKindSchema,
  /** Le partenaire qui porte un sous-traitant. `null` partout ailleurs. */
  partner_account_id: z.string().guid().nullable(),
  /**
   * #2195.12 — LE MANAGER DU CONSULTANT, SAISI À LA MAIN (décision de Louis,
   * 16/09/2026).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * DE QUEL « MANAGER » ON PARLE
   * ─────────────────────────────────────────────────────────────────────────
   * Le responsable HIÉRARCHIQUE de la personne, et lui seul. Pas le référent
   * de la mission côté client — c'est un contact, il a sa fiche. Pas le
   * référent commercial — c'est `owner_id`. Les trois existent dans le métier
   * ESN et ne se lisent pas au même endroit ; les confondre ferait relancer la
   * mauvaise personne.
   *
   * ⚠️ Il pointe vers un autre CONSULTANT et non vers un membre de l'espace :
   * un manager d'ESN est lui-même quelqu'un du vivier, et le restreindre aux
   * détenteurs d'un compte applicatif aurait rendu le champ insaisissable dans
   * la moitié des cas réels.
   *
   * `null` = NON RENSEIGNÉ, et rien d'autre. Jamais un nom deviné, jamais le
   * `lead` de la BU — un rôle sur une unité n'est pas le même fait, et rien ne
   * relie aujourd'hui un consultant à une BU.
   *
   * `optional` — comme `photoUrl` plus haut — pour qu'un objet construit avant
   * ce lot reste valide : seule l'ABSENCE du champ change de sens.
   */
  manager_id: z.string().guid().nullable().optional(),
  /**
   * Le NOM du manager, résolu par le serveur. LECTURE SEULE — l'écriture passe
   * par `manager_id`.
   *
   * Trois états, jamais deux, et c'est la distinction habituelle du produit :
   *  · la clé est ABSENTE → cette réponse ne l'a pas résolu (une réponse
   *    d'écriture, par exemple). Ce n'est pas « pas de manager » ;
   *  · `null` → personne n'a renseigné de manager, ou la fiche pointée n'a pas
   *    encore de nom. L'écran écrit « non renseigné », jamais un nom de repli ;
   *  · une chaîne → le nom, tel qu'il est sur la fiche pointée.
   */
  manager_name: z.string().nullable().optional(),
  /**
   * #2185.10 — le référent COMMERCIAL de la fiche, pas le manager hiérarchique
   * ci-dessus. Pointe vers un membre de l'espace (`auth.users`), jamais vers un
   * autre consultant. `null` = NON ATTRIBUÉ. S'écrit par sa propre route
   * (`PATCH /consultants/:id/owner`), pas par l'édition générale — même patron
   * que le manager client d'une mission (#2836).
   */
  owner_user_id: z.string().guid().nullable().optional(),
  /**
   * Le NOM du référent, résolu par le serveur. Mêmes trois états que
   * `manager_name` : clé ABSENTE (non résolu par cette réponse), `null`
   * (personne, ou profil illisible), une chaîne (le nom).
   */
  owner_name: z.string().nullable().optional(),
  /**
   * Coordonnées du talent.
   *
   * Absentes jusqu'au 20/08, alors que quatre gestes du §10 les supposent
   * (enrichir, demander la disponibilité, demander une mise à jour de CV,
   * réactiver). Elles sont RETIRÉES de la réponse — pas mises à vide — pour qui
   * n'a pas le droit de les voir : un champ vide se lit « pas renseigné », ce
   * qui n'est pas la même information que « pas ton périmètre ».
   */
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  /** La ville lue dans un CV (#2183.21). `null` = non renseignée, jamais devinée. */
  location: z.string().nullable().optional(),
  /** Profil public déclaré par la personne. Jamais scrapé. */
  public_profile_url: z.string().nullable().optional(),
  /** `false` quand les coordonnées ont été retirées faute de droit. */
  contact_visible: z.boolean(),
  /** TJM cible, en euros, SANS symbole. `null` = non renseigné (jamais 0). */
  tjm: z.number().int().positive().nullable(),
  /**
   * Les deux autres TJM du §8.1, en CENTIMES et sous `finance:read`.
   *
   * En centimes et non en euros comme `tjm` : c'est l'unité du reste du
   * domaine financier (`loaded_daily_cost_cents`, `target_tjm_cents` d'un
   * besoin), et mélanger les deux finit par produire un facteur cent quelque
   * part. `tjm` reste en euros parce qu'il est saisi et lu par tout le monde,
   * et le migrer casserait des écrans qui marchent.
   *
   * Absents de la réponse sans `finance:read`, comme la marge d'une mission.
   */
  min_tjm_cents: z.number().int().nonnegative().nullable().optional(),
  /** Coût chargé d'un SALARIÉ. Toujours saisi, jamais calculé (§8.1). */
  cost_rate_cents: z.number().int().nonnegative().nullable().optional(),
  /** TJM d'ACHAT d'un freelance ou d'un sous-traitant. Autre objet que le coût
   *  chargé : les confondre rendrait la marge fausse pour l'une des deux
   *  natures, et personne ne saurait laquelle. */
  purchase_tjm_cents: z.number().int().nonnegative().nullable().optional(),
  /** #2329.11-.16 — devise, source, contexte, date, confidentialité du TJM.
   *  `null` = jamais renseigné. Sous `finance:read`, comme le reste du TJM. */
  tjm_metadata: tjmMetadataSchema.nullable().optional(),
  /** `false` quand les montants financiers ont été retirés faute de droit. */
  finance_visible: z.boolean(),
  /** Technologies et compétences — la matière du matching. */
  stack: z.array(z.string()),
  /** Secteurs déjà pratiqués : c'est la PREUVE, pas une préférence. */
  sectors: z.array(z.string()),
  /** Zone géographique tenable (« IDF », « Lyon », « remote »). Texte libre,
   *  conservé tel quel : le réinterpréter produirait des mobilités inventées. */
  zones: z.array(z.string()),
  /** Formations lues dans le bloc `education` d'un CV (#2183.26, #2784).
   *  `[]` = non renseignées — jamais une formation devinée depuis un CV en
   *  texte libre. Pas gated par `contact_visible` : ce n'est pas une
   *  coordonnée, même règle que `sectors`/`zones`. */
  education: z.array(z.string()),
  /** #3935.2a — environnements techniques, outils et certifications lus dans le
   *  CV (`consultants.environments/tools/certifications`). `null` = NON LU (aucune
   *  lecture ne les a encore produits) — distinct d'une liste écrite, jamais une
   *  liste vide déduite d'un bloc absent. Optionnels : une réponse plus ancienne
   *  ne les porte pas. */
  environments: z.array(z.string()).nullable().optional(),
  tools: z.array(z.string()).nullable().optional(),
  certifications: z.array(z.string()).nullable().optional(),
  /** La mobilité STRUCTURÉE (§8.2). `null` = on n'a pas demandé. */
  mobility: talentMobilitySchema,
  /** Les préférences de mission (§8.3) — filtrent en avertissement, jamais en
   *  exclusion. */
  preferences: talentPreferencesSchema,
  /** #2948 (#2329.30-.34) — démarches en cours, exclusivité, autres entretiens,
   *  deadline de décision. Voir {@link talentProcessSchema} pour l'owner. */
  process: talentProcessSchema,
  /** #2948 (#2329.45-.51) — voir {@link talentPositioningAgreementSchema}. */
  positioningAgreement: talentPositioningAgreementSchema,
  /**
   * BEL-SC-238 (#3267) — ce que l'ENTRETIEN a appris, jamais un CV : voir
   * `talent-interview-assessment.ts`. `traits` porte au plus une entrée par
   * trait de {@link TALENT_INTERVIEW_TRAITS} ; un trait absent du tableau n'a
   * pas été évalué — {@link talentInterviewGaps} le nomme, jamais un niveau
   * deviné à sa place.
   *
   * `.optional()` — et non un champ requis : des dizaines de littéraux
   * `Consultant` existent déjà dans les fixtures de test (`positioningAgreement`
   * seul en compte douze), et leur imposer tous ce nouveau champ aurait dépassé
   * de loin la garde « jamais plus de trois fichiers sans vérifier l'impact ».
   * `ConsultantsService.toWire` le pose TOUJOURS ; seuls les littéraux plus
   * anciens le lisent `undefined`, jamais `null` inventé à la place.
   */
  interviewAssessment: z
    .object({
      traits: z.array(talentInterviewTraitSchema),
      rampUp: talentRampUpSchema.nullable(),
    })
    .optional(),
  /**
   * #3406 — les informations TERRAIN capitalisées, remontées par ce
   * consultant. `.optional()` pour la même raison qu'`interviewAssessment`
   * ci-dessus : ne pas imposer un champ neuf à toutes les fixtures `Consultant`
   * déjà écrites. `ConsultantsService.toWire` le pose TOUJOURS (liste vide =
   * aucune information capitalisée, un fait mesuré).
   */
  fieldReports: z.array(consultantFieldReportSchema).optional(),
  /** Références citables — missions/clients passés mobilisables comme preuve. */
  references: z.array(z.string()),
  /** Les langues parlées, avec leur niveau quand il a été évalué (axe 6). */
  languages: z.array(spokenLanguageSchema),
  /** Les habilitations détenues (axe 12). Une habilitation manquante BLOQUE un
   *  positionnement : elle n'est pas négociable par un commercial. */
  clearances: z.array(z.string()),
  /** « Envie » (p22) : ce que la personne VEUT faire. Un profil poussé contre son
   *  envie part en mission et démissionne — le coût est réel, donc le champ existe. */
  wants: z.string().nullable(),
  notes: z.string().nullable(),
  /** Le CV du consultant, en texte brut. C'est la MATIÈRE de la réécriture p22 :
   *  sans lui il n'y a rien à réécrire, et surtout rien à quoi confronter le
   *  résultat pour vérifier qu'aucune expérience n'a été inventée. */
  cv_text: z.string().nullable(),
  /**
   * #2570 — la trace du dernier enrichissement (« voir les consultants comme
   * des contacts concernant l'enrichissement »). `null` = jamais tenté.
   * `last_enrichment_source` vaut `pipeline` (cascade fournisseur réelle) ou
   * `demo` — jamais le nom d'un fournisseur (doctrine).
   */
  last_enrichment_at: z.string().nullable().optional(),
  last_enrichment_source: z.enum(['pipeline', 'demo']).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Consultant = z.infer<typeof consultantSchema>

/** Création / mise à jour — tout est optionnel sauf le nom : un vivier se
 *  remplit par petites touches, et un formulaire qui exige tout reste vide. */
/**
 * Profil public (LinkedIn…) d'un talent. Bug prod 31/10/2026 : le CV écrit `linkedin.com/in/…` SANS protocole, et
 * l'enregistrement inline (qui renvoie toute la fiche) était refusé — on ne pouvait plus modifier le NOM (#4833 ne
 * faisait qu'expliquer le refus). Une adresse sans protocole reçoit `https://`, une chaîne vide vaut « absent »,
 * et seuls http(s) passent (`z.url()` seul acceptait `javascript:`).
 */
export function normalisePublicProfileInput(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return /^[^\s/]+\.[^\s/]+/.test(trimmed) ? `https://${trimmed}` : trimmed
}

const publicProfileUrlSchema = z.preprocess(
  normalisePublicProfileInput,
  z
    .string()
    .url()
    .max(500)
    .refine(url => /^https?:\/\//i.test(url), 'URL http(s) attendue')
    .nullish(),
)

export const consultantUpsertSchema = z.object({
  full_name: z.string().min(1).max(200),
  kind: talentKindSchema.optional(),
  source: consultantSourceSchema.nullish(),
  consent_given_at: z.string().nullish(),
  consent_expires_at: z.string().nullish(),
  consent_basis: z.string().trim().max(300).nullish(),
  /** #2185.57 — voir `consultantSchema.consent` (`talentConsentSchema.restrictions`). */
  consent_restrictions: z.string().trim().max(1000).nullish(),
  title: z.string().max(200).nullish(),
  seniority: consultantSenioritySchema.optional(),
  /** Voir `consultantSchema.years_experience` — SAISIES, jamais déduites. */
  years_experience: z.number().int().min(0).max(60).nullish(),
  availability: consultantAvailabilitySchema.optional(),
  available_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'available_from must be YYYY-MM-DD')
    .nullish(),
  contract_type: consultantContractSchema.optional(),
  engagement_kind: engagementKindSchema.optional(),
  partner_account_id: z.string().guid().nullish(),
  /**
   * #2195.12 — le manager se SAISIT. `null` le retire (« non renseigné »), et
   * il n'est jamais dérivé : ni de la BU, ni du propriétaire commercial, ni du
   * dernier manager d'une mission. Voir `consultantSchema.manager_id`.
   */
  manager_id: z.string().guid().nullish(),
  email: z.string().trim().email().max(320).nullish(),
  phone: z.string().trim().max(40).nullish(),
  public_profile_url: publicProfileUrlSchema,
  tjm: z.number().int().positive().max(5000).nullish(),
  min_tjm_cents: z.number().int().min(0).max(500_000).nullish(),
  cost_rate_cents: z.number().int().min(0).max(500_000).nullish(),
  purchase_tjm_cents: z.number().int().min(0).max(500_000).nullish(),
  tjm_metadata: tjmMetadataSchema.nullish(),
  stack: z.array(z.string().min(1).max(80)).max(40).optional(),
  sectors: z.array(z.string().min(1).max(80)).max(20).optional(),
  zones: z.array(z.string().min(1).max(80)).max(20).optional(),
  mobility_zones: z.array(z.string().min(1).max(80)).max(30).nullish(),
  remote_preference: z.enum(['sur_site', 'hybride', 'full_remote', 'indifferent']).nullish(),
  travel_acceptance: z.enum(['aucun', 'ponctuel', 'frequent']).nullish(),
  relocation: z.boolean().nullish(),
  /** #2948 (#2329.19) — voir {@link SITE_FREQUENCIES}. */
  site_frequency: siteFrequencySchema.nullish(),
  /** #2948 (#2329.22) */
  international_mobility: z.boolean().nullish(),
  /** #2948 (#2329.23) */
  mobility_restrictions: z.string().trim().max(500).nullish(),
  /** #2948 (#2329.30) */
  process_in_progress: z.boolean().nullish(),
  /** #2948 (#2329.31) */
  process_exclusive: z.boolean().nullish(),
  /** #2948 (#2329.32) */
  process_other_interviews: z.string().trim().max(500).nullish(),
  /** #2948 (#2329.33) */
  process_decision_deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'process_decision_deadline must be YYYY-MM-DD')
    .nullish(),
  wanted_sectors: z.array(z.string().min(1).max(80)).max(20).optional(),
  refused_sectors: z.array(z.string().min(1).max(80)).max(20).optional(),
  refused_technologies: z.array(z.string().min(1).max(80)).max(30).optional(),
  wanted_contract_kinds: z.array(z.string().min(1).max(40)).max(10).optional(),
  /** #3410.10 — le type de client visé, texte libre (voir `talentPreferencesSchema`). */
  preferred_client_types: z.array(z.string().min(1).max(80)).max(20).optional(),
  /** #3410.11 — des clients NOMMÉS refusés par la personne, distinct du
   *  `clientHistoryFlag` du matching (un refus DU client, jamais DE la
   *  personne). */
  refused_clients: z.array(z.string().min(1).max(120)).max(20).optional(),
  /** #3410.13 — un environnement à éviter, distinct de `refused_technologies`. */
  environments_to_avoid: z.array(z.string().min(1).max(120)).max(20).optional(),
  /** #3410.14 — la condition qui rend une mission inacceptable, en clair.
   *  `null` = aucune connue, jamais une chaîne vide. */
  non_negotiable_conditions: z.string().trim().max(500).nullish(),
  references: z.array(z.string().min(1).max(200)).max(20).optional(),
  languages: z.array(spokenLanguageSchema).max(12).optional(),
  clearances: z.array(clearanceSchema).max(10).optional(),
  wants: z.string().max(1000).nullish(),
  notes: z.string().max(2000).nullish(),
  /** Collé depuis le CV existant. Borné haut : au-delà, ce n'est plus un CV. */
  cv_text: z.string().max(30_000).nullish(),
})
export type ConsultantUpsert = z.infer<typeof consultantUpsertSchema>

/**
 * Un sous-traitant sans partenaire est refusé À L'ÉCRITURE.
 *
 * Séparé du schéma pour rester utilisable côté écran : le formulaire doit
 * pouvoir poser la question AVANT d'envoyer, plutôt que d'attendre un 400 qui
 * ne dit pas quel champ manque.
 */
export function missingPartnerForEngagement(input: {
  engagement_kind?: EngagementKind
  partner_account_id?: string | null
}): boolean {
  if (input.engagement_kind === undefined) return false
  return engagementNeedsPartner(input.engagement_kind) && !input.partner_account_id
}

/* ------------------------------------------------------------------ */
/*  Matching besoin ↔ profil (p22 « Matching »)                        */
/* ------------------------------------------------------------------ */

/** Un critère du matching, avec sa PREUVE. Même discipline que le /100 contact :
 *  le score ne peut pas dériver de sa justification. */
export const consultantMatchCriterionSchema = z.object({
  criterion: z.string(),
  label: z.string(),
  points: z.number().int().min(0),
  max: z.number().int().positive(),
  proof: z.string(),
})
export type ConsultantMatchCriterion = z.infer<typeof consultantMatchCriterionSchema>

/**
 * Les CINQ verdicts nommés (#2330.1/.5 — LAU-FINAL-071).
 *
 * « Le résultat ne doit pas être un pourcentage opaque » : un score seul
 * n'explique rien, un verdict NOMMÉ dit d'emblée ce qu'il faut en faire.
 *
 *  - `fortement_defendable` : non bloqué, score élevé — se propose.
 *  - `a_qualifier` : non bloqué, score correct mais une information manque
 *    encore pour trancher.
 *  - `alternative` : une donnée DÉCISIVE bloque (`blocked`), mais le reste du
 *    profil reste solide — utile si le client accepte le compromis identifié.
 *  - `non_defendable` : gap bloquant ET score faible, ou score faible sans
 *    blocage — rien à en tirer sur CE besoin précis.
 *  - `non_evaluable` : `score` vaut `null` (moins de trois critères
 *    évaluables, GA-18/GA-19) — donnée insuffisante, jamais un « non ».
 */
export const CONSULTANT_MATCH_VERDICTS = [
  'fortement_defendable',
  'a_qualifier',
  'alternative',
  'non_defendable',
  'non_evaluable',
] as const
export const consultantMatchVerdictSchema = z.enum(CONSULTANT_MATCH_VERDICTS)
export type ConsultantMatchVerdict = (typeof CONSULTANT_MATCH_VERDICTS)[number]

/** Le résultat d'un matching pour UN consultant sur UN besoin.
 *
 *  `risks` n'est pas décoratif : la p22 exige « recommandation personnalisée,
 *  raisons ET RISQUES ». Un push sans risque énoncé est un push qui se retourne
 *  en soutenance. */
/**
 * Le niveau de preuve d'UNE compétence attendue par le besoin
 * (addendum final p63 : « distingue compétence démontrée, déclarée, adjacente et
 * absente »).
 *
 * La distinction n'est pas académique : c'est elle qui décide de ce qu'on écrit
 * au client. Une compétence DÉMONTRÉE se cite (« a mené ce chantier chez X ») ;
 * une compétence DÉCLARÉE se présente comme telle et se fait valider en
 * entretien ; une compétence ADJACENTE s'annonce comme une montée en charge ;
 * une compétence ABSENTE se dit. Les fondre en un score unique produit
 * exactement le push qui se retourne en soutenance.
 */
export const skillEvidenceLevelSchema = z.enum(['demonstrated', 'declared', 'adjacent', 'absent'])
export type SkillEvidenceLevel = z.infer<typeof skillEvidenceLevelSchema>

export const skillEvidenceSchema = z.object({
  /** Le terme attendu par le besoin, tel qu'il en a été extrait. */
  skill: z.string(),
  level: skillEvidenceLevelSchema,
  /** D'où vient la preuve — vide pour `absent`, jamais inventée. */
  proof: z.string(),
})
export type SkillEvidence = z.infer<typeof skillEvidenceSchema>

export const consultantMatchSchema = z.object({
  consultant_id: z.string().guid(),
  /** `null` sur une fiche sans nom (D366) — l'écran de rapprochement le lit
   *  déjà par `talentNameText`, qui accepte l'absence. */
  full_name: z.string().nullable(),
  /**
   * `null` sous {@link MIN_AXES_FOR_SCORE} (`match.ts`) critères évaluables —
   * jamais `0`. Un dénominateur nul en est le cas extrême, pas le seul : un
   * profil non bloqué avec une seule donnée connue (souvent la disponibilité)
   * n'a pas non plus un score digne de ce nom, il en manque deux pour en
   * avoir un. « Non mesuré » se lit à l'écran, il ne se calcule pas à zéro.
   */
  score: z.number().int().min(0).max(100).nullable(),
  /** Le verdict NOMMÉ (#2330.1/.5) — jamais un pourcentage seul. */
  verdict: consultantMatchVerdictSchema,
  breakdown: z.array(consultantMatchCriterionSchema),
  /** Les critères que la donnée ne permet pas d'évaluer, NOMMÉS — « un score
   *  n'est jamais nu » vaut aussi pour ce qui n'a pas pu être noté. `[]` quand
   *  les six critères sont tous évaluables. */
  unevaluated: z.array(z.string()).default([]),
  /** Compétence par compétence : ce qui est prouvé, déclaré, proche, ou manque.
   *  `[]` quand le besoin n'exprime aucun terme exploitable. */
  skills: z.array(skillEvidenceSchema).default([]),
  /** Ce qui MANQUE, en une phrase par manque (#2330.6) — absent ou seulement
   *  adjacent au besoin. `[]` quand tout ce que le besoin demande est prouvé. */
  gaps: z.array(z.string()).default([]),
  /** La prochaine étape, DÉDUITE du verdict et du premier risque réel — jamais
   *  une phrase générique déconnectée du profil (#2330.6). `null` sur un
   *  verdict qui n'appelle aucune action (`non_defendable`). */
  recommendedStep: z.string().nullable().default(null),
  /** Pourquoi ce profil — phrases prêtes à être reprises dans le push. */
  reasons: z.array(z.string()),
  /** Ce qui peut coincer. Vide = aucun risque DÉTECTÉ, jamais « aucun risque ». */
  risks: z.array(z.string()),
  /** `true` quand une donnée décisive manque (dispo ou stack) : le profil est
   *  affiché mais ne peut pas être poussé en l'état. */
  blocked: z.boolean(),
  /**
   * Ce que ce CLIENT a déjà dit de cette personne (§7.2).
   *
   * `null` = jamais présentée chez lui, le cas le plus fréquent. Le matching
   * était aveugle à cet historique : un profil refusé en janvier remontait
   * premier sur le besoin de mars, chez le même client — « la façon la plus
   * rapide de perdre un compte ».
   */
  clientHistory: clientHistoryMarkSchema.nullable().default(null),
})
export type ConsultantMatch = z.infer<typeof consultantMatchSchema>

/** Nombre maximum de profils poussés sur un besoin — p22 : « 1-2 profils ».
 *  Un push de cinq CV est un CV catalogue, ce que la page interdit. */
export const CONSULTANT_PUSH_MAX = 2

/**
 * Le plafond du TOP des profils défendables (#2330.7), distinct du push.
 *
 * « Ne jamais remplir jusqu'à cinq si seulement deux sont défendables » —
 * c'est un PLAFOND, jamais un objectif à atteindre. Le top sert à CONSULTER
 * au-delà des 1-2 profils réellement poussables ; il ne relâche pas la règle
 * « pas de CV catalogue » du push, qui reste bornée à {@link CONSULTANT_PUSH_MAX}.
 */
export const CONSULTANT_TOP_MAX = 5

/* ------------------------------------------------------------------ */
/*  Feedback de push + brief consultant (annexe méthodo p22)          */
/* ------------------------------------------------------------------ */

/**
 * L'issue d'un push de profil (annexe méthodo p22 « Feedback : retenu / refusé,
 * raison, apprentissage, réutilisation »).
 *
 * Sans boucle de feedback, un push est un coup dans le vide : on ne sait pas
 * pourquoi un profil a été retenu ou refusé, donc on ne réutilise rien. Ce record
 * capitalise l'issue — la raison et l'apprentissage nourrissent le prochain push.
 */
export const consultantPushOutcomeSchema = z.enum(['retenu', 'refuse', 'en_attente'])
export type ConsultantPushOutcome = z.infer<typeof consultantPushOutcomeSchema>

export const consultantPushFeedbackSchema = z.object({
  id: z.string().guid(),
  consultant_id: z.string().guid(),
  /** Le besoin sur lequel le profil a été poussé (`opportunities.id`), quand il
   *  est matérialisé. `null` = push hors besoin matérialisé. */
  opportunity_id: z.string().guid().nullable(),
  outcome: consultantPushOutcomeSchema,
  /** Pourquoi ce verdict — jamais deviné, saisi par le commercial. */
  reason: z.string().nullable(),
  /** L'apprentissage réutilisable (« le client voulait 5 ans d'XP min »). */
  learning: z.string().nullable(),
  created_at: z.string(),
})
export type ConsultantPushFeedback = z.infer<typeof consultantPushFeedbackSchema>

/** Le corps de `POST /consultants/:id/feedback`. */
export const recordPushFeedbackSchema = z.object({
  opportunity_id: z.string().guid().nullish(),
  outcome: consultantPushOutcomeSchema,
  reason: z.string().max(2000).nullish(),
  learning: z.string().max(2000).nullish(),
})
export type RecordPushFeedback = z.infer<typeof recordPushFeedbackSchema>

/**
 * Le brief de soutenance d'un consultant (annexe méthodo p22 « Brief : consultant
 * connaît compte, besoin, interlocuteurs, objections et plan J+30 »).
 *
 * Déterministe : assemblé depuis le consultant + le besoin, sans LLM ni invention.
 * C'est un document PRÊT À DONNER au consultant avant sa soutenance.
 */
export const consultantBriefSchema = z.object({
  /** `null` sur une fiche sans nom (D366) — comme `consultantName` l'est déjà
   *  dans `staffing`, `mission-board`, `ats` et `submission`. L'écran DIT
   *  l'absence ; il n'invente pas un nom pour remplir un document. */
  consultantName: z.string().nullable(),
  /** Le compte + le besoin, en une ligne. */
  context: z.string(),
  /** Ce que le consultant apporte, adossé à ses données (stack, références). */
  strengths: z.array(z.string()),
  /** Les objections probables + comment y répondre, dérivées des risques du match. */
  objections: z.array(z.string()),
  /** Les 30 premiers jours, en jalons. */
  planJ30: z.array(z.string()),
})
export type ConsultantBrief = z.infer<typeof consultantBriefSchema>

/**
 * #2189.23-.30 (épopée #2940) — le brief D'ENTRETIEN, distinct du brief de
 * soutenance ci-dessus (`ConsultantBrief`) : celui-là prépare le consultant à
 * DÉFENDRE son profil par écrit, celui-ci prépare la RENCONTRE elle-même.
 * Déterministe et sans invention, comme `ConsultantBrief` — `gaps` et
 * `objections` restent deux champs séparés parce que ce sont deux données
 * différentes du match (ce qui manque vs. ce qui peut coincer), pas la même
 * chose reformulée deux fois.
 */
export const interviewBriefSchema = z.object({
  consultantName: z.string().nullable(),
  objective: z.string(),
  pitch: z.string(),
  /** Les deux expériences les plus citables — jamais complétées à trois pour
   *  faire un compte rond : `[]` ou une seule ligne restent honnêtes. */
  keyExperiences: z.array(z.string()),
  gaps: z.array(z.string()),
  objections: z.array(z.string()),
  /** Des questions PRÊTES pour le consultant à poser au client — un gabarit de
   *  bonnes pratiques, jamais une donnée inventée sur CE client. */
  consultantQuestions: z.array(z.string()),
})
export type InterviewBrief = z.infer<typeof interviewBriefSchema>

/* ------------------------------------------------------------------ */
/*  Réécriture du CV selon la mission (annexe méthodo p22)             */
/* ------------------------------------------------------------------ */

/**
 * Une expérience du CV, remise en avant pour CETTE mission.
 *
 * `proof` est la citation — le fragment du CV SOURCE d'où sort la ligne. C'est le
 * dispositif anti-invention : une expérience réécrite qui ne peut pas citer sa
 * source n'a pas sa place dans le CV.
 */
export const cvHighlightSchema = z.object({
  title: z.string(),
  detail: z.string(),
  proof: z.string(),
})
export type CvHighlight = z.infer<typeof cvHighlightSchema>

/**
 * Le CV d'un consultant réécrit pour un besoin précis (annexe méthodo p22
 * « Réécriture du CV selon la mission »).
 *
 * La règle absolue, héritée de la règle produit « JAMAIS de données fictives » :
 * la réécriture **réordonne, reformule et met en avant** ce qui est déjà dans le
 * CV source. Elle n'ajoute JAMAIS une compétence, un client ou une année. Ce que
 * la mission demande et que le CV ne prouve pas ne devient pas une ligne de CV :
 * ça devient un `gap`.
 *
 * `gaps` est donc le pendant de `risks` du matching — le champ qui empêche le
 * livrable de mentir par omission. Il est renseigné de DEUX façons indépendantes :
 * par le modèle, et par un calcul déterministe côté serveur (les termes du besoin
 * qu'on ne retrouve ni dans la stack déclarée ni dans le texte du CV). Le second
 * ne peut pas être « oublié » par un prompt.
 */
export const consultantCvRewriteSchema = z.object({
  /** `null` sur une fiche sans nom (D366). Un CV réécrit pour quelqu'un dont on
   *  ignore le nom reste un CV réécrit : c'est l'écran qui décide de le laisser
   *  partir ou non, pas un nom inventé ici. */
  consultantName: z.string().nullable(),
  /** Le besoin visé, en une ligne — un CV réécrit hors contexte est ininterprétable. */
  missionLabel: z.string(),
  /** Le titre du CV, orienté mission (« Ingénieur sécurité réseau — environnement bancaire »). */
  headline: z.string(),
  /** L'accroche : ce que ce profil apporte À CE BESOIN, en quelques lignes. */
  summary: z.string(),
  /** Les expériences retenues, réordonnées par pertinence pour la mission. */
  highlights: z.array(cvHighlightSchema),
  /** Le vocabulaire du besoin réellement couvert par le CV (mots du client). */
  keywords: z.array(z.string()),
  /** Ce que la mission demande et que le CV NE PROUVE PAS. Jamais masqué. */
  gaps: z.array(z.string()),
  generated_at: z.string(),
})
export type ConsultantCvRewrite = z.infer<typeof consultantCvRewriteSchema>

/** Le corps de `POST /consultants/:id/cv-rewrite`. */
export const cvRewriteRequestSchema = z.object({
  opportunity_id: z.string().guid(),
})
export type CvRewriteRequest = z.infer<typeof cvRewriteRequestSchema>

/**
 * #2185.10 — le corps de `PATCH /consultants/:id/owner`. Même patron que
 * `setMissionClientManagerSchema` (`mission.ts`) : une seule clé, `null`
 * retire l'attribution (« non attribué »), pas un état à part.
 */
export const setConsultantOwnerSchema = z.object({ ownerUserId: z.string().guid().nullable() }).strict()
export type SetConsultantOwner = z.infer<typeof setConsultantOwnerSchema>
