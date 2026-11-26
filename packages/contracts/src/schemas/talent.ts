import { z } from 'zod'
import { remotePreferenceSchema } from './talent-preferences.js'
import { consentStateSchema } from './talent-consent.js'
import { EXPERIENCE_DATE_PRECISIONS } from './cv-experience.js'

/**
 * Les TALENTS — le vivier, élargi aux candidats, et la donnée personnelle qui
 * va avec.
 *
 * La table `consultants` portait des salariés en poste. Une ESN suit aussi des
 * CANDIDATS : des gens qui ne travaillent pas pour elle, qu'elle a rencontrés
 * une fois, dont elle garde le CV. Ce sont les mêmes champs et le même écran —
 * d'où une colonne `kind` plutôt qu'une seconde table, décision explicite de
 * Louis (arbitrage #7). Deux tables auraient produit deux recherches, deux
 * matchings, et une question à chaque fois : « il est où, celui-là ? »
 *
 * Mais la NATURE de la donnée change avec `kind`, et c'est ce que porte ce
 * fichier :
 *
 *  - un consultant est une donnée d'ENTREPRISE (un contrat de travail la
 *    justifie) ;
 *  - un candidat est une donnée PERSONNELLE conservée sans contrat. Le RGPD la
 *    borne dans le temps, la CNIL recommande **deux ans après le dernier
 *    contact** pour un dossier de candidature, et ce plafond est écrit dans le
 *    schéma — pas seulement dans un écran de réglages, où il se contournerait
 *    en tapant 120 mois.
 */

export const TALENT_KINDS = ['consultant', 'candidate'] as const
export const talentKindSchema = z.enum(TALENT_KINDS)
export type TalentKind = (typeof TALENT_KINDS)[number]

/**
 * Le niveau d'une compétence.
 *
 * Quatre crans nommés plutôt qu'une note sur 5 ou sur 10 : personne ne sait
 * dire la différence entre 6 et 7 sur Kubernetes, et une échelle numérique
 * produit surtout des 7. « Autonome » et « confirmé » se discutent en entretien.
 *
 * `inconnu` est le cinquième, ajouté en fin : une compétence recopiée d'une
 * liste libre ou lue sur un CV arrive SANS niveau, et lui en prêter un
 * (« autonome » par défaut) revient à écrire devant un client une évaluation
 * que personne n'a faite. Un niveau inconnu se montre et se corrige ; un niveau
 * inventé ne se voit jamais.
 */
export const SKILL_LEVELS = ['notions', 'autonome', 'confirme', 'expert', 'inconnu'] as const
export const skillLevelSchema = z.enum(SKILL_LEVELS)
export type SkillLevel = (typeof SKILL_LEVELS)[number]

/**
 * D'où vient l'information. Affichée telle quelle : « déclaré par la personne »
 * et « lu dans son CV » n'ont pas la même valeur devant un client, et
 * « confirmé en entretien » encore moins.
 */
export const SKILL_SOURCES = ['declared', 'cv', 'interview', 'mission'] as const
export const skillSourceSchema = z.enum(SKILL_SOURCES)
export type SkillSource = (typeof SKILL_SOURCES)[number]

/** #2185.35 — UNE compétence est « prouvée » quand elle vient d'une MISSION
 *  ou d'un ENTRETIEN — jamais d'une déclaration ou d'un CV, qui restent des
 *  affirmations non vérifiées. Le MÊME calcul que le moteur de matching
 *  (`apps/api/src/modules/consultants/matching/axes.ts`, "coverageLine") : un
 *  second seuil ici divergerait du premier au premier correctif (GA-26). */
export function isSkillSourceProven(source: SkillSource | null | undefined): boolean {
  return source === 'mission' || source === 'interview'
}

/**
 * Qui a VALIDÉ une compétence, au-delà de sa déclaration initiale (#2328.12/.13).
 *
 * Deux dates plutôt qu'un statut : `consultant` et `recruteur` valident
 * INDÉPENDAMMENT, et une seule colonne « validated » aurait effacé laquelle des
 * deux a réellement regardé la fiche.
 */
export const SKILL_VALIDATORS = ['consultant', 'recruiter'] as const
export const skillValidatorSchema = z.enum(SKILL_VALIDATORS)
export type SkillValidator = (typeof SKILL_VALIDATORS)[number]

/**
 * La confiance à accorder à une compétence — trois crans NOMMÉS, jamais un
 * pourcentage (doctrine « aucune probabilité », refusée six fois).
 *
 * COMPUTED, jamais stocké : dérivée de `inferred` et de {@link isSkillSourceProven}
 * (même calcul que le matching, GA-26) — un second seuil ici divergerait du
 * premier au premier correctif.
 *
 *  - `a_verifier` — lue seule dans un mot-clé (#2328.24), jamais un must-have ;
 *  - `confirmee` — prouvée par une mission/un entretien, ou validée par un humain ;
 *  - `declaree` — le reste : ce que la personne dit, sans preuve ni validation.
 */
export const SKILL_CONFIDENCE_TIERS = ['a_verifier', 'declaree', 'confirmee'] as const
export const skillConfidenceSchema = z.enum(SKILL_CONFIDENCE_TIERS)
export type SkillConfidence = (typeof SKILL_CONFIDENCE_TIERS)[number]

export function computeSkillConfidence(skill: {
  inferred: boolean
  source: SkillSource
  validatedByConsultantAt: string | null
  validatedByRecruiterAt: string | null
}): SkillConfidence {
  if (skill.inferred) return 'a_verifier'
  if (isSkillSourceProven(skill.source) || skill.validatedByConsultantAt || skill.validatedByRecruiterAt) {
    return 'confirmee'
  }
  return 'declaree'
}

export const consultantSkillSchema = z.object({
  id: z.string().guid(),
  /** Libellé CANONIQUE, résolu par le référentiel d'alias (`k8s` → `kubernetes`). */
  skill: z.string(),
  /** Ce que la personne a écrit, quand ce n'est pas le libellé canonique. */
  rawLabel: z.string().nullable(),
  level: skillLevelSchema,
  /** Années de pratique. `null` = inconnu, JAMAIS 0 — « zéro année » se lirait
   *  comme « n'a jamais pratiqué », ce qui est l'inverse d'une compétence listée. */
  years: z.number().int().nonnegative().nullable(),
  /** Dernière année de pratique. Une compétence de 2014 n'est pas une compétence
   *  d'aujourd'hui, et le client le demandera. */
  lastUsedYear: z.number().int().min(1970).max(2100).nullable(),
  source: skillSourceSchema,
  createdAt: z.string(),
  /** La famille de la compétence (« langage », « cloud »…). `null` = jamais
   *  saisie — aucune famille inventée par regroupement automatique (#2328.4). */
  family: z.string().nullable(),
  /** Le niveau VALIDÉ par un humain, distinct du niveau DÉCLARÉ (`level`,
   *  #2328.5) : les deux peuvent diverger, et c'est l'écart qui est utile à
   *  montrer (#2328.6). `null` = jamais validé. */
  validatedLevel: skillLevelSchema.nullable(),
  /** Une certification NOMMÉE en preuve ce cette compétence (#2328.11). */
  certification: z.boolean(),
  /** Un retour client NOMMÉ, texte libre (#2328.14). `null` = aucun. */
  clientFeedback: z.string().nullable(),
  /**
   * Compétence PLAUSIBLE mais lue seule dans un mot-clé, jamais dans une
   * expérience détaillée (#2328.24) — « à vérifier », jamais un must-have.
   * Posée par l'extraction automatique (`addExtractedSkills`), jamais par une
   * saisie humaine (`upsertSkill`).
   */
  inferred: z.boolean(),
  validatedByConsultantAt: z.string().nullable(),
  validatedByRecruiterAt: z.string().nullable(),
  /** Calculée, jamais saisie : voir {@link computeSkillConfidence}. */
  confidence: skillConfidenceSchema,
  /** L'expérience qui PROUVE cette compétence (#2328.9). `null` = aucune
   *  citée — une déclaration reste une déclaration tant qu'elle n'est
   *  rattachée à rien. */
  sourceExperienceId: z.string().guid().nullable(),
  /** Le projet NOMMÉ, DANS cette expérience, qui porte la preuve (#2328.10).
   *  Ne peut exister sans `sourceExperienceId` — un projet ne prouve rien
   *  hors de l'expérience qui le contient. */
  sourceProject: z.string().nullable(),
})
export type ConsultantSkill = z.infer<typeof consultantSkillSchema>

/**
 * La validation d'une compétence par un humain — CONSULTANT ou RECRUTEUR,
 * INDÉPENDAMMENT de sa déclaration initiale.
 *
 * N'écrit JAMAIS `level`, `source` ni `rawLabel` : une mise à jour ENRICHIT le
 * graphe, elle ne supprime pas la source initiale (#2328.26, même doctrine que
 * `raw_label` dans `upsertSkill`).
 */
export const validateSkillSchema = z
  .object({
    validatedBy: skillValidatorSchema,
    validatedLevel: skillLevelSchema.optional(),
    certification: z.boolean().optional(),
    clientFeedback: z.string().trim().max(2000).nullable().optional(),
    /** #2328.9 — cite l'expérience qui prouve cette compétence. `null` retire
     *  la citation, jamais une suppression de l'expérience elle-même. */
    sourceExperienceId: z.string().guid().nullable().optional(),
    /** #2328.10 — le projet nommé dans cette expérience. */
    sourceProject: z.string().trim().max(200).nullable().optional(),
  })
  .strict()
  .refine(input => !input.sourceProject || input.sourceExperienceId, {
    message: 'Un projet source suppose une expérience source citée',
    path: ['sourceExperienceId'],
  })
export type ValidateSkillInput = z.infer<typeof validateSkillSchema>

/**
 * Une EXPÉRIENCE structurée en DIX champs nommés (#2328.22) — la base des
 * preuves d'une compétence, plutôt qu'un champ plat où « client, rôle, dates,
 * réalisations » se mélangent en une seule valeur non exploitable.
 *
 * `clientMasked` distingue « rien renseigné » (`entreprise`/`clientFinal`
 * nuls, silence honnête) de « client explicitement confidentiel » — jamais
 * l'un inventé à la place de l'autre (#2328.23). Un masquage SANS raison
 * n'est pas accepté par {@link addExperienceSchema} : ce serait une
 * invention de la même famille qu'un contexte inventé.
 */
export const consultantExperienceSchema = z.object({
  id: z.string().guid(),
  entreprise: z.string().nullable(),
  clientFinal: z.string().nullable(),
  clientMasked: z.boolean(),
  clientMaskedReason: z.string().nullable(),
  secteur: z.string().nullable(),
  role: z.string().nullable(),
  dateDebut: z.string().nullable(),
  dateFin: z.string().nullable(),
  /** #3935 (lot P03) — `year` : seule l'année de la date est connue (l'écran
   *  affiche « 2019 », jamais un mois) ; `month` : le mois ; `null` : la date
   *  se lit telle quelle (`formatExperienceDate`). */
  dateDebutPrecision: z.enum(EXPERIENCE_DATE_PRECISIONS).nullable(),
  dateFinPrecision: z.enum(EXPERIENCE_DATE_PRECISIONS).nullable(),
  contexte: z.string().nullable(),
  realisations: z.string().nullable(),
  technologies: z.array(z.string()),
  responsabilites: z.string().nullable(),
  /** L'extrait qui JUSTIFIE l'expérience — même exigence que
   *  `parsedFieldSchema.sourceExcerpt` (cv-parsing.ts) : une expérience sans
   *  ce qui la porte est indistinguable d'une invention. */
  preuve: z.string().nullable(),
  createdAt: z.string(),
})
export type ConsultantExperience = z.infer<typeof consultantExperienceSchema>

export const addExperienceSchema = z
  .object({
    entreprise: z.string().trim().max(200).nullable().default(null),
    clientFinal: z.string().trim().max(200).nullable().default(null),
    clientMasked: z.boolean().default(false),
    clientMaskedReason: z.string().trim().max(500).nullable().default(null),
    secteur: z.string().trim().max(200).nullable().default(null),
    role: z.string().trim().max(200).nullable().default(null),
    dateDebut: z.string().nullable().default(null),
    dateFin: z.string().nullable().default(null),
    contexte: z.string().trim().max(4000).nullable().default(null),
    realisations: z.string().trim().max(4000).nullable().default(null),
    technologies: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    responsabilites: z.string().trim().max(4000).nullable().default(null),
    preuve: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .refine(input => !input.clientMasked || Boolean(input.clientMaskedReason?.trim()), {
    message: 'Un client masqué doit porter sa raison — jamais un masquage inventé (#2328.23)',
    path: ['clientMaskedReason'],
  })
export type AddExperienceInput = z.infer<typeof addExperienceSchema>

export const upsertSkillSchema = z
  .object({
    skill: z.string().trim().min(1).max(120),
    level: skillLevelSchema.default('autonome'),
    years: z.number().int().min(0).max(60).nullable().default(null),
    lastUsedYear: z.number().int().min(1970).max(2100).nullable().default(null),
    source: skillSourceSchema.default('declared'),
  })
  .strict()
export type UpsertSkillInput = z.infer<typeof upsertSkillSchema>

export const TALENT_DOCUMENT_KINDS = ['cv', 'dossier', 'certificate', 'other'] as const
export const talentDocumentKindSchema = z.enum(TALENT_DOCUMENT_KINDS)
export type TalentDocumentKind = (typeof TALENT_DOCUMENT_KINDS)[number]

/**
 * Un document attaché à un talent.
 *
 * Le TEXTE extrait sert à chercher et réécrire. #4034 (Louis 12/10/2026) : le
 * fichier ORIGINAL d'un CV déposé est désormais AUSSI conservé (seau privé,
 * URL signée ≤ 5 min) pour l'aperçu fidèle — voir `talent-document-file.ts`.
 */
export const talentDocumentSchema = z.object({
  id: z.string().guid(),
  kind: talentDocumentKindSchema,
  filename: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  /** Longueur du texte extrait. 0 = extraction vide, et l'écran le DIT : un
   *  CV scanné en image ne donne rien, et le silence ferait croire à un import
   *  réussi. */
  extractedChars: z.number().int().nonnegative(),
  uploadedAt: z.string(),
  uploadedByName: z.string().nullable(),
  /** #4034.5 — l'ORIGINAL est-il conservé ? `false` pour tout CV importé avant
   *  #4034 (seul le texte était gardé) : l'aperçu le DIT, il n'invente rien. */
  hasOriginal: z.boolean().default(false),
})
export type TalentDocument = z.infer<typeof talentDocumentSchema>

/** Borne d'extraction. Au-delà, on garde le début et on le dit. */
export const TALENT_DOCUMENT_TEXT_MAX = 200_000

export const talentSearchQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    kind: talentKindSchema.optional(),
    /** #2183.52 — filtrer sur ce qui vient de rejoindre la revue humaine
     *  (import CV/CSV en lot, `review_status: 'needs_review'`) plutôt que sur
     *  les fiches déjà qualifiées. Vocabulaire de `consultants.review_status`
     *  (`cv-intake.service.ts`, `cv-parse.service.ts:268`), pas un état
     *  inventé pour ce filtre. */
    reviewStatus: z.enum(['needs_review', 'qualified']).optional(),
    /** Compétences exigées — TOUTES, pas au moins une : un besoin « Java ET
     *  Kubernetes » satisfait par « Java seul » fait perdre le rendez-vous. */
    // #3830 — une compétence unique arrive de l'URL en chaîne : on l'enveloppe.
    skills: z
      .preprocess(
        value => (typeof value === 'string' ? [value] : value),
        z.array(z.string().trim().min(1).max(120)).max(10),
      )
      .default([]),
    availability: z.enum(['immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible', 'inconnu']).optional(),
    seniority: z.enum(['junior', 'confirme', 'senior', 'expert', 'inconnu']).optional(),
    /** TJM plafond. Un talent sans TJM renseigné n'est PAS écarté : « pas de
     *  prix » n'est pas « trop cher », et l'écarter cacherait le profil le plus
     *  souvent négociable. */
    maxTjm: z.number().int().min(0).max(5000).optional(),
    /** TJM plancher (PDF 3 §6.4, tiroir « Plus de filtres »). Même garde que
     *  `maxTjm` : un talent sans TJM renseigné n'est PAS écarté — « pas de
     *  prix » n'est ni « trop cher » ni « trop bon marché ». */
    minTjm: z.number().int().min(0).max(5000).optional(),
    zone: z.string().trim().max(120).optional(),
    /**
     * Rayon en km autour de `zone` (tiroir « Ville et rayon », PDF-22 §01,
     * tranché le 31/08/2026) : Louis a choisi de géocoder via la Base Adresse
     * Nationale (`api-adresse.data.gouv.fr`, publique, sans clé) plutôt que
     * d'inventer des coordonnées.
     *
     * Sans effet sans `zone` : un rayon n'a pas de centre. Avec les deux, le
     * SERVEUR géocode `zone`, calcule la distance haversine en SQL contre
     * `consultants.latitude/longitude`, et REMPLACE le filtre de correspondance
     * exacte sur `zones[]` — un rayon de 50 km autour de « Paris » ne doit pas
     * exiger, EN PLUS, que la fiche porte le mot exact « Paris ».
     *
     * ⚠️ Un talent non géocodé SORT du filtre — il ne vaut jamais « à 0 km ».
     * Si le géocodage de `zone` échoue (réseau indisponible, ville inconnue de
     * la BAN), le rayon est ignoré plutôt que de faire échouer toute la
     * recherche : c'est un critère de confort, pas une donnée qu'on invente.
     */
    radiusKm: z.number().int().min(1).max(500).optional(),
    /** Secteur déjà pratiqué (`consultants.sectors`, colonne existante — la
     *  fiche p22 la portait depuis le socle sans qu'aucun critère de recherche
     *  ne la lise). Texte libre, comme `zone` : une liste fermée trahirait le
     *  vocabulaire propre à chaque ESN. */
    sector: z.string().trim().max(120).optional(),
    /** Une langue parlée, par son code (`languages[].code`). */
    language: z.string().trim().min(2).max(8).optional(),
    /** Comment la personne veut travailler (`consultants.remote_preference`,
     *  déjà saisi sur la fiche, jamais devenu un critère de recherche). Sert
     *  aussi de source au badge « Mode de travail » de la ligne. */
    remotePreference: remotePreferenceSchema.optional(),
    /** « CV disponible » (tiroir) : uniquement les profils dont le CV source
     *  (`consultants.cv_text`) n'est pas vide. `false`/absent ne filtre rien —
     *  ce n'est pas « sans CV », c'est « indifférent ». */
    cvAvailable: z.coerce.boolean().optional(),
    /**
     * Années d'expérience MINIMUM (tiroir, tranché le 31/08/2026).
     *
     * Porte sur `consultants.years_experience` — un champ SAISI sur la
     * personne, distinct de `consultantSkillSchema.years` (qui ne mesure
     * l'ancienneté que sur UNE compétence). Les fusionner aurait produit un
     * agrégat qui mesure autre chose que ce que le libellé promet — voir
     * `consultant.ts` pour la décision complète.
     *
     * Même garde que `minTjm`/`maxTjm` : un talent SANS années saisies n'est
     * PAS écarté — « pas renseigné » n'est ni « junior » ni « senior ».
     */
    minYearsExperience: z.number().int().min(0).max(60).optional(),
    /** « En mission » (tiroir) : Oui/Non/Indifférent. S'applique sur la
     *  disponibilité DÉRIVÉE (`staffing.availability`), jamais sur le
     *  déclaratif — même garde que `derived` et pour la même raison (§6.2). */
    onMission: z.enum(['yes', 'no']).optional(),
    /**
     * Inclure les fiches ARCHIVÉES.
     *
     * Défaut `false` : un vivier montre par défaut les gens qu'on peut placer.
     * Mais les archivés restent CHERCHABLES — leurs missions passées sont la
     * preuve de compétence dont l'ESN se sert pour vendre les suivants, et un
     * ancien salarié revient parfois.
     */
    includeArchived: z.coerce.boolean().optional(),
    /** Comment la personne est mobilisée (§6.3). */
    engagementKind: z.enum(['salarie', 'freelance', 'portage', 'sous_traitance', 'inconnu']).optional(),
    /**
     * La disponibilité DÉRIVÉE, pas celle que la fiche déclare (§6.3).
     *
     * Filtrer sur le déclaratif reproduirait exactement le défaut que le §6.2
     * corrige : on retrouverait « disponible » des gens en mission.
     */
    derived: z.enum(['available', 'partial', 'busy', 'busy_open_ended', 'unknown', 'a_confirmer']).optional(),
    /** Libre AVANT cette date (`YYYY-MM-DD`) — la question d'un client pressé. */
    freeBefore: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** Jamais positionné : le vivier qu'on a constitué et jamais utilisé. */
    neverSubmitted: z.coerce.boolean().optional(),
    /** Sans contact depuis N mois. */
    dormantMonths: z.coerce.number().int().min(1).max(60).optional(),
    /**
     * Sans MISSION depuis N mois (#2182.23 « Sans mission récente », #2182.53
     * « Filtre : dernière mission ») — porte sur la date de FIN de la
     * DERNIÈRE mission (`mission_assignments`/`missions.ends_on`), jamais sur
     * le dernier CONTACT (`dormantMonths`) : ne pas avoir parlé à quelqu'un et
     * ne pas l'avoir placé sont deux faits différents (registre du
     * 16/09/2026). Une fiche sans mission connue entre aussi dans ce filtre —
     * l'inverse laisserait indéfiniment hors du filtre exactement les fiches
     * que la question vise.
     */
    noMissionMonths: z.coerce.number().int().min(1).max(60).optional(),
    /** État du consentement (#2182.51) — même vocabulaire que `consentState()`
     *  (`talent-consent.ts`), jamais un état inventé pour ce filtre. */
    consentState: consentStateSchema.optional(),
    /**
     * #2182.55 — « Filtre : preuves ». Trois lectures possibles du mot
     * (CV, références, source d'une compétence) — celle qui a un critère
     * SERVEUR déjà nommé ailleurs dans le code gagne : {@link isSkillSourceProven}
     * distingue déjà `mission`/`interview` (prouvé) de `declared`/`cv` (affirmé),
     * c'est le même calcul que le moteur de matching
     * (`apps/api/.../matching/axes.ts`, "coverageLine", GA-26). Les deux autres
     * lectures ont déjà leur filtre (`cvAvailable`) ou n'ont pas de critère
     * serveur (références : absentes de `TalentRow`) — non construites ici.
     * `false`/absent ne filtre rien, même garde que `cvAvailable`.
     */
    provenSkillsOnly: z.coerce.boolean().optional(),
    /**
     * Théo C talents-vivier.A12 — « Mes favoris » : seulement les profils que l'APPELANT a mis en favori
     * (`user_favorites`, `entity_type = 'talent'`). Un favori est personnel : jamais celui d'un collègue.
     */
    favorite: z.enum(['mine']).optional(),
    /**
     * #2182.21 — LA COMPLÉTUDE DE FICHE, en filtre.
     *
     * Les cinq axes de {@link talentCompleteness} (identité, compétences,
     * disponibilité, TJM, CV) sont déjà chargés sur chaque ligne décorée —
     * aucune colonne, aucune vue matérialisée n'est nécessaire pour les LIRE.
     * `TalentService.search` applique donc ce filtre APRÈS décoration, même
     * famille que `derived`/`onMission`/`freeBefore` juste au-dessus (§6.2) :
     * même calcul, même seuil ({@link ENRICHED_MIN_AXES}) que le bandeau de
     * statistiques et `talentPipelineStatus`, jamais un second seuil qui
     * divergerait au premier correctif (GA-26).
     *
     * Tranché sans Louis (26/09/2026) : le registre du 16/09 écartait un
     * patron « post-filtre + total recalculé sur la page » pour CE critère au
     * profit d'une colonne dédiée ou d'une vue matérialisée — mais c'est
     * exactement le patron déjà en production pour `derived`/`onMission`/
     * `freeBefore`, sur les mêmes données déjà en mémoire, avec la même
     * approximation acceptée de pagination. Étendre le patron existant est la
     * plus petite tranche utile et prouvable ; la vue matérialisée reste un
     * chantier séparé si le volume du vivier la justifie un jour.
     */
    completeness: z.enum(['incomplete', 'enriched']).optional(),
    /**
     * Exclut les talents DÉJÀ vus par ce compte client (§6.3).
     *
     * « La façon la plus rapide de perdre un compte est de repousser un profil
     * refusé » — ce filtre est l'inverse du drapeau : il retire avant même
     * qu'on regarde.
     */
    excludeSeenByAccount: z.string().guid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(25),
  })
  .strict()
export type TalentSearchQuery = z.infer<typeof talentSearchQuerySchema>

/**
 * #3781 — la borne d'un geste en lot sur le vivier (archiver ou effacer), et la
 * taille de page « tout le monde » de l'écran : UN seul nombre, lu par les deux.
 * Retour du 06/10/2026 : « je dois archiver ou supprimer 20 par 20 » — la page
 * plafonnait à 100 lignes et le lot à 100 identifiants.
 */
export const TALENT_BULK_MAX = 500

/**
 * #2662.2 — `POST /consultants/archive/bulk` : archive une SÉLECTION de
 * fiches en un geste (retour de Louis du 20/09/2026, « je veux pouvoir tout
 * sélectionner pour clean mon vivier »).
 *
 * Le MÊME geste que `POST /consultants/:id/archive` — archiver, jamais
 * supprimer, la doctrine du dépôt ne se re-litige pas — appliqué à plusieurs
 * fiches. Bornée à 100, comme `assignContactsSchema` (contact.ts) : la
 * sélection d'un écran, jamais un vivier entier d'un coup.
 */
export const archiveConsultantsSchema = z
  .object({
    consultant_ids: z.array(z.string().guid()).min(1).max(TALENT_BULK_MAX),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
export type ArchiveConsultantsInput = z.infer<typeof archiveConsultantsSchema>

/**
 * Pourquoi une fiche reste en place à l'archivage en masse (#4191 G5) :
 * `not_found` (hors périmètre de l'espace, ou déjà inexistante) ou `on_mission`
 * (affectation en cours, #4196 — la date de fin est portée à côté).
 */
export const CONSULTANT_ARCHIVE_REFUSAL_REASONS = ['not_found', 'on_mission'] as const
export type ConsultantArchiveRefusalReason = (typeof CONSULTANT_ARCHIVE_REFUSAL_REASONS)[number]

/**
 * Retour HONNÊTE de l'archivage en masse : les fiches RÉELLEMENT archivées, et
 * celles laissées en place avec leur raison — même patron que
 * `contactAssignmentResultSchema` (contact.ts).
 *
 * ARCHIVAGE PARTIEL (Louis 15/10/2026, #4191 G5) : une ligne refusée ne fait
 * plus échouer toute la sélection. Les lignes valides sont archivées (on
 * archive, on ne supprime pas), les autres reviennent dans `refused`, que
 * l'écran NOMME avec leur raison. `ends_on` (`AAAA-MM-JJ`) n'existe que pour
 * `on_mission`, et reste `null` quand l'affectation n'a pas de fin connue.
 */
export const consultantArchiveBulkResultSchema = z.object({
  archived: z.array(z.string().guid()),
  refused: z.array(
    z.object({
      id: z.string().guid(),
      reason: z.enum(CONSULTANT_ARCHIVE_REFUSAL_REASONS),
      ends_on: z.string().nullable(),
    }),
  ),
})
export type ConsultantArchiveBulkResult = z.infer<typeof consultantArchiveBulkResultSchema>

/**
 * #3781 — `POST /consultants/erase/bulk` : EFFACER des personnes du vivier
 * (RGPD art. 17), le geste que « supprimer définitivement » demande.
 *
 * ⚠️ Tranché sans Louis (06/10/2026) : la doctrine dit « on archive, on ne
 * supprime pas — SAUF l'effacement RGPD d'une personne à sa demande » (c67,
 * #2297). Un consultant est une personne : « supprimer » passe donc par CET
 * effacement — même règle de droit que celui d'un contact (`canErasePerson`),
 * même trace sans donnée personnelle (empreintes HMAC qui empêchent la
 * recollecte). `confirm: true` n'est envoyé qu'après la confirmation explicite
 * de l'écran : une irréversibilité découverte après coup n'a pas été consentie.
 */
export const eraseConsultantsSchema = z
  .object({
    consultant_ids: z.array(z.string().guid()).min(1).max(TALENT_BULK_MAX),
    confirm: z.literal(true),
  })
  .strict()
export type EraseConsultantsInput = z.infer<typeof eraseConsultantsSchema>

/**
 * Retour HONNÊTE de l'effacement en lot : ce qui est parti, ce qui est resté et
 * POURQUOI. Aucune donnée de la personne — que des identifiants que l'appelant
 * a lui-même fournis.
 *  - `not_found` : hors de l'espace ou déjà parti (jamais « interdit » : la
 *    réponse ne confirme pas qu'une fiche d'un autre espace existe) ;
 *  - `forbidden` : ni administrateur de l'espace, ni porteur de la fiche ;
 *  - `blocked` : une affectation court encore — la mission garderait sinon une
 *    charge que plus personne ne porte (même refus que `DELETE /consultants/:id`).
 */
export const consultantErasureResultSchema = z.object({
  erased: z.array(z.string().guid()),
  erased_at: z.string().nullable(),
  skipped: z.array(
    z.object({
      consultant_id: z.string().guid(),
      reason: z.enum(['not_found', 'forbidden', 'blocked']),
    }),
  ),
})
export type ConsultantErasureResult = z.infer<typeof consultantErasureResultSchema>

/**
 * La rétention des dossiers de CANDIDATURE.
 *
 * Plafond DUR à 24 mois : la CNIL recommande deux ans après le dernier contact
 * pour un dossier de candidature, et un réglage qui accepte 120 mois transforme
 * une politique en formalité. Le minimum à 1 mois existe pour qu'une ESN plus
 * stricte que la loi puisse l'être.
 */
export const TALENT_RETENTION_MAX_MONTHS = 24
export const TALENT_RETENTION_DEFAULT_MONTHS = 24

export const talentRetentionSchema = z
  .object({
    months: z.number().int().min(1).max(TALENT_RETENTION_MAX_MONTHS).default(TALENT_RETENTION_DEFAULT_MONTHS),
    /**
     * La purge est-elle ARMÉE ?
     *
     * Défaut `false`, et c'est délibéré : effacer des dossiers est irréversible,
     * et l'armer par surprise sur un espace existant détruirait un vivier
     * constitué. L'écran dit combien de dossiers partiraient AVANT que la case
     * se coche.
     */
    enabled: z.boolean().default(false),
  })
  .strict()
export type TalentRetention = z.infer<typeof talentRetentionSchema>

/** Ce dont le calcul de purge a besoin. */
type PurgeableTalent = {
  kind: TalentKind
  /** Dernier contact connu. `null` = jamais recontacté depuis la création. */
  lastContactAt: string | null
  createdAt: string
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

/**
 * La date à laquelle un dossier de candidature doit disparaître.
 *
 * Deux règles :
 *
 *  - le compte part du DERNIER CONTACT, pas de la création. Recontacter
 *    quelqu'un remet le compteur à zéro, parce que c'est ce qui justifie de
 *    garder son dossier ;
 *  - sans dernier contact connu, on prend la date de création. Ne rien faire
 *    dans ce cas garderait indéfiniment les dossiers les plus anciens —
 *    exactement ceux que la règle vise.
 *
 * Rend `null` pour un CONSULTANT : sa fiche est une donnée d'entreprise
 * justifiée par un contrat de travail, pas un dossier de candidature. La purger
 * effacerait l'historique de missions d'un salarié en poste.
 */
export function talentPurgeDate(talent: PurgeableTalent, months: number): Date | null {
  if (talent.kind !== 'candidate') return null
  const anchor = Date.parse(talent.lastContactAt ?? talent.createdAt)
  if (Number.isNaN(anchor)) return null
  const capped = Math.min(Math.max(months, 1), TALENT_RETENTION_MAX_MONTHS)
  return new Date(anchor + capped * MONTH_MS)
}

/** Ce dossier doit-il partir maintenant ? */
export function isTalentPurgeDue(talent: PurgeableTalent, months: number, now: Date): boolean {
  const due = talentPurgeDate(talent, months)
  return due !== null && due.getTime() <= now.getTime()
}

/**
 * Combien de jours reste-t-il avant l'effacement. `null` quand la règle ne
 * s'applique pas, `0` quand c'est dû — jamais un nombre négatif, qui se lirait
 * comme une donnée corrompue sur une fiche.
 */
export function daysBeforePurge(talent: PurgeableTalent, months: number, now: Date): number | null {
  const due = talentPurgeDate(talent, months)
  if (due === null) return null
  return Math.max(0, Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
}

/* ------------------------------------------------------------------ */
/*  La ligne du VIVIER (PDF 3 §6)                                      */
/* ------------------------------------------------------------------ */

/**
 * L'état de relecture d'une fiche.
 *
 * L'invariant du §3.3 : « aucune fiche n'atteint `qualified` sans passage
 * humain ». Sans ce champ, la garde n'existait pas — une fiche née d'une
 * extraction et une fiche relue par un recruteur se ressemblaient trait pour
 * trait, et rien ne disait laquelle on pouvait envoyer à un client.
 */
export const TALENT_REVIEW_STATUSES = ['needs_review', 'qualified'] as const
export const talentReviewStatusSchema = z.enum(TALENT_REVIEW_STATUSES)
export type TalentReviewStatus = (typeof TALENT_REVIEW_STATUSES)[number]

/**
 * Une ligne de l'écran Vivier.
 *
 * Ce type existe parce que la recherche paginée rendait jusqu'ici des LIGNES
 * SQL brutes, non contractuelles — et que personne ne l'appelait, si bien que
 * la divergence ne se voyait pas. L'écran chargeait à la place tout le vivier
 * d'un coup, sans filtre ni pagination.
 *
 * Il porte deux choses que la table ne sait pas dire seule :
 *
 *  - `staffing`, la disponibilité DÉDUITE des affectations. C'est la règle
 *    centrale du §6.2 : pour un salarié, la disponibilité ne se saisit pas,
 *    elle se calcule. Le champ déclaratif reste rendu à côté — l'écran montre
 *    ce que la fiche DIT sans conclure quand il n'y a aucune affectation ;
 *  - `topSkills`, les compétences typées avec leur niveau et leur SOURCE. Une
 *    compétence déclarée et une compétence prouvée en mission ne valent pas la
 *    même chose devant un client, et la stack en texte libre ne le disait pas.
 */
export const talentRowSchema = z.object({
  id: z.string().guid(),
  kind: talentKindSchema,
  /**
   * `null` quand la fiche n'a pas de nom (D366) — une fiche née d'un CV déposé
   * dont personne n'a encore relu l'identité. L'écran le DIT (« Nom non
   * renseigné ») et montre le fichier déposé en dessous ; il n'invente rien.
   */
  fullName: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.string(),
  /**
   * #4016 L4.3 — les années SAISIES, pour que l'écran estime (badgé) la séniorité
   * d'une fiche `inconnu` (`displayedSeniority`). `null` = non saisi, jamais 0.
   */
  yearsExperience: z.number().int().nullish(),
  /** Ce que la FICHE déclare. Jamais présenté comme la vérité pour un salarié. */
  declaredAvailability: z.string(),
  /** Ce que les AFFECTATIONS disent. `unknown` = aucune affectation connue. */
  staffing: z.object({
    availability: z.enum(['available', 'partial', 'busy', 'busy_open_ended', 'unknown', 'a_confirmer']),
    loadPercent: z.number().int().nonnegative(),
    freeFrom: z.string().nullable(),
    assignments: z.number().int().nonnegative(),
  }),
  tjm: z.number().int().nullable(),
  /** Le plancher et le coût, en centimes. ABSENTS sans `finance:read` — un zéro
   *  se lirait comme un coût nul, ce qui est une tout autre information. */
  minTjmCents: z.number().int().nullable().optional(),
  costCents: z.number().int().nullable().optional(),
  /** `false` quand les montants ont été retirés faute de droit. */
  financeVisible: z.boolean(),
  contractType: z.string(),
  /** Comment on mobilise la personne — distinct de `kind`. */
  engagementKind: z.string(),
  zones: z.array(z.string()),
  /** La dernière mission connue : client et date de fin. `null` quand il n'y en
   *  a aucune — jamais « aucune mission » écrit comme un fait sur quelqu'un
   *  qu'on vient d'ajouter. */
  lastMission: z
    .object({
      label: z.string().nullable(),
      accountName: z.string().nullable(),
      endsOn: z.string().nullable(),
      /** #4016.8e — le dernier TJM vendu (€/jour), propagé en lecture seule depuis la mission. `null` = non saisi. */
      dailyRate: z.number().positive().nullable().optional(),
      // Théo C talents-vivier.R4 — le début de l'affectation : « Démarrage prévu » quand il est à venir.
      startsOn: z.string().nullable().optional(),
    })
    .nullable(),
  /** Positionnements : ceux qui courent, et le total. */
  submissions: z.object({ open: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  /** D'où vient la fiche. `null` = on ne sait pas, ce qui reste une réponse. */
  source: z.string().nullable(),
  /** Dernier contact connu — l'ancre du segment « dormants ». */
  lastContactAt: z.string().nullable(),
  /** Sorti du vivier actif. `null` = actif. */
  archivedAt: z.string().nullable(),
  /** Relue par un humain, ou pas encore (§3.3). */
  reviewStatus: talentReviewStatusSchema,
  /**
   * Théo C talents-vivier.N1/N2 — la DÉCLARATION datée de disponibilité : la date annoncée
   * (`consultants.available_from`) et la dernière confirmation (`availability_checked_at`).
   * `null` = jamais déclarée / jamais confirmée, ce qui n'est ni « tout de suite » ni « jamais ».
   * `optional` : une ligne d'un ancien serveur ne les porte pas.
   */
  declaredAvailableFrom: z.string().nullable().optional(),
  availabilityCheckedAt: z.string().nullable().optional(),
  /** Théo C talents-vivier.N4 — le référent de la fiche (colonne « Suivi »). `null` = non attribuée. */
  ownerUserId: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  /** Théo C talents-vivier.A12 — ce profil est dans MES favoris. `optional` : absent d'une ancienne réponse. */
  isFavorite: z.boolean().optional(),
  /** Théo C talents-vivier.R3 — compétences PROUVÉES (mission/entretien) : l'axe « Compétences prouvées » du score. */
  provenSkillCount: z.number().int().nonnegative().optional(),
  /** Cinq au plus — la colonne du §6.1 en montre cinq, et en charger quarante
   *  par ligne ferait payer à la liste le coût d'une fiche. */
  topSkills: z.array(
    z.object({
      /** Libellé CANONIQUE — c'est lui qui sert au rapprochement besoin ↔ profil. */
      skill: z.string(),
      /**
       * Ce qui s'AFFICHE : le libellé écrit quand il diffère du canonique.
       *
       * Le référentiel range volontairement `postgresql`, `mysql` et `oracle`
       * sous `sql` — utile pour rapprocher un besoin, désastreux à l'écran :
       * un recruteur qui a saisi « PostgreSQL » lisait « sql » sur la fiche
       * qu'il venait de remplir, et un dossier envoyé au client aurait effacé
       * la techno réelle au profit d'une famille.
       */
      label: z.string(),
      level: skillLevelSchema,
      source: skillSourceSchema,
    }),
  ),
  /** Nombre total de compétences typées, pour dire « +12 » sans les charger. */
  skillCount: z.number().int().nonnegative(),
  /** Un CV source existe (`consultants.cv_text` non vide) — sert le filtre
   *  « CV disponible » ET l'axe « CV » de {@link talentCompleteness}. Un
   *  BOOLÉEN et non la longueur du texte : la ligne du vivier ne réaffiche
   *  jamais le CV, seulement sa présence. */
  hasCv: z.boolean(),
  /** Comment la personne veut travailler (`consultants.remote_preference`) —
   *  `null` = jamais demandé, ce qui n'est pas « présentiel ». */
  workMode: z.enum(['sur_site', 'hybride', 'full_remote', 'indifferent']).nullable(),
  /**
   * La photo de la personne. `optional` à dessein : `TalentService.decorate`
   * (un des moteurs surveillés par GA-06, `protected-criteria.spec.ts`) ne la
   * lit ni ne l'écrit — elle est fusionnée APRÈS, par un service séparé qui
   * n'entre dans aucun classement. Voir `talent-photo.service.ts`.
   *
   * ⚠️ N'ENTRE DANS AUCUN TRI, AUCUN SCORE, AUCUNE CHARGE UTILE DE PROMPT —
   * c'est un critère protégé (annexe III de l'EU AI Act). Elle s'AFFICHE,
   * elle ne classe jamais personne.
   */
  photoUrl: z.string().nullable().optional(),
  updatedAt: z.string(),
})
export type TalentRow = z.infer<typeof talentRowSchema>

/* ------------------------------------------------------------------ */
/*  La « Complétude » d'une fiche (PDF-22, écran Vivier)               */
/* ------------------------------------------------------------------ */

/**
 * Ce que la maquette du vivier appelle « Score » est une colonne interdite
 * par la doctrine du dépôt : un score de RAPPROCHEMENT n'existe que contre un
 * besoin de référence, et cette ligne n'en a aucun. Ce qu'elle mesure
 * réellement — cinq champs remplis ou non — est une COMPLÉTUDE de fiche, pas
 * un rapprochement. D'où un nom différent et un calcul différent, jamais une
 * probabilité de rien.
 *
 * Les cinq axes sont TOUJOURS évaluables (`score` n'est jamais `null` ici) :
 * savoir si un champ est rempli ne dépend d'aucune donnée qu'on n'a pas — à
 * la différence d'un score de matching, qui peut manquer de tout. Sous trois
 * axes il n'y aurait pas de score (doctrine) ; il y en a cinq.
 */
export const TALENT_COMPLETENESS_AXES = ['identity', 'skills', 'availability', 'rate', 'cv'] as const
export type TalentCompletenessAxisKey = (typeof TALENT_COMPLETENESS_AXES)[number]

export type TalentCompletenessAxis = { key: TalentCompletenessAxisKey; score: number }
export type TalentCompleteness = { score: number; max: 100; axes: TalentCompletenessAxis[] }

/**
 * #2185.18 — LE SEUIL « FICHE INCOMPLÈTE », UN SEUL, PARTAGÉ (GA-26).
 *
 * `talent.service.ts` (`stats()`, #2182.10) compte « enrichi » à partir de
 * TROIS axes remplis sur cinq — le même seuil que la doctrine applique au
 * matching (« sous trois axes il n'y a pas de score »). Exporté ici pour que
 * l'action principale de la fiche (`primaryHeroAction.ts`) et
 * {@link talentPipelineStatus} lisent EXACTEMENT la même frontière : un
 * second seuil ici divergerait du premier au premier correctif.
 */
export const ENRICHED_MIN_AXES = 3

/** Le sous-ensemble de {@link TalentRow} dont la complétude a besoin — un type
 *  étroit plutôt que la ligne entière, pour rester appelable depuis un
 *  contexte qui n'a pas chargé le reste (le calcul agrégé de `stats()`). */
export type TalentCompletenessInput = Pick<TalentRow, 'fullName' | 'skillCount' | 'staffing' | 'tjm' | 'hasCv'>

export function talentCompleteness(row: TalentCompletenessInput): TalentCompleteness {
  const axes: TalentCompletenessAxis[] = [
    { key: 'identity', score: row.fullName && row.fullName.trim().length > 0 ? 100 : 0 },
    { key: 'skills', score: row.skillCount > 0 ? 100 : 0 },
    { key: 'availability', score: row.staffing.availability !== 'unknown' ? 100 : 0 },
    { key: 'rate', score: row.tjm != null ? 100 : 0 },
    { key: 'cv', score: row.hasCv ? 100 : 0 },
  ]
  const score = Math.round(axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length)
  return { score, max: 100, axes }
}

/* ------------------------------------------------------------------ */
/*  Le « statut » d'une fiche (issue #2185, HERO + action principale)   */
/* ------------------------------------------------------------------ */

/**
 * Les cinq états de la fiche — #2185.4 (badge de statut, en hero) et
 * #2185.12/.13/.15/.16/.17/.18 (l'action principale qui en dépend, UNE
 * seule, jamais deux).
 *
 * « Besoin compatible » (#2185.14) N'EST PAS un sixième état DÉRIVÉ ici : le
 * savoir suppose de lancer le matching inverse (`InverseMatchPanel`), un
 * calcul coûteux, VOLONTAIREMENT déclenché à la main plutôt qu'à l'ouverture
 * de chaque fiche (doctrine de coût — même famille que GA-43). L'automatiser
 * pour peupler un badge ferait payer à chaque ouverture de fiche le prix
 * d'un rapprochement que personne n'a demandé.
 */
export const TALENT_PIPELINE_STATUSES = [
  'incomplete',
  'in_mission',
  'availability_to_verify',
  'positioned',
  'available',
] as const
export type TalentPipelineStatus = (typeof TALENT_PIPELINE_STATUSES)[number]

export type TalentPipelineStatusInput = TalentCompletenessInput &
  Pick<TalentRow, 'declaredAvailability' | 'submissions' | 'reviewStatus'>

/**
 * ORDRE, et pourquoi il ne se relit pas dans le sens de l'issue :
 *
 * 1. `incomplete` D'ABORD — une fiche en attente de relecture, ou sous le
 *    seuil des trois axes (`ENRICHED_MIN_AXES`, même calcul et même seuil
 *    que `talentCompleteness`/`talent.service.ts`), ne mérite aucune autre
 *    conclusion : on ne sait rien d'assez sûr pour agir dessus.
 * 2. `in_mission` — la disponibilité DÉRIVÉE des affectations l'emporte sur
 *    tout déclaratif (même garde que `TalentAvailabilityBadge`) : occupé
 *    prime sur "positionné", qui ne serait qu'une trace passée.
 * 3. `availability_to_verify` — aucune affectation connue (`unknown`), ou la
 *    fiche dit "disponible maintenant" quand la dérivation ne le confirme
 *    pas : la même contradiction que le badge affiche déjà.
 * 4. `positioned` — un positionnement COURT, disponibilité confirmée par
 *    ailleurs.
 * 5. `available` — le repli : disponibilité confirmée, rien en cours.
 */
export function talentPipelineStatus(row: TalentPipelineStatusInput): TalentPipelineStatus {
  if (row.reviewStatus === 'needs_review') return 'incomplete'

  const filledAxes = talentCompleteness(row).axes.filter(axis => axis.score > 0).length
  if (filledAxes < ENRICHED_MIN_AXES) return 'incomplete'

  if (row.staffing.availability === 'busy' || row.staffing.availability === 'busy_open_ended') return 'in_mission'
  // #3068 — `a_confirmer` (interruption non confirmée) est la MÊME contradiction
  // que `unknown` : on ne sait pas encore, on ne conclut pas « disponible ».
  if (row.staffing.availability === 'unknown' || row.staffing.availability === 'a_confirmer') {
    return 'availability_to_verify'
  }
  if (row.declaredAvailability === 'immediate' && row.staffing.availability !== 'available') {
    return 'availability_to_verify'
  }

  if (row.submissions.open > 0) return 'positioned'

  return 'available'
}

export const talentPageSchema = z.object({
  items: z.array(talentRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
})
export type TalentPage = z.infer<typeof talentPageSchema>

/**
 * Le bandeau de statistiques du vivier (PDF-22, écran Vivier).
 *
 * Compte sur TOUT l'espace, jamais sur la page affichée ni sur le filtre
 * courant — même doctrine que `HygieneBadge` : deux chiffres qui divergent
 * font douter des deux. `null` partout où le dénominateur est nul : un
 * pourcentage sans dénominateur n'est pas zéro, il n'est pas mesurable.
 */
export const talentStatsSchema = z.object({
  /** Tous les talents actifs de l'espace (consultants + candidats, non
   *  archivés) — le même périmètre que le vivier par défaut. */
  total: z.number().int().nonnegative(),
  /** Disponibles MAINTENANT, au sens DÉRIVÉ (`staffing.availability ===
   *  'available'`) — jamais le déclaratif, même garde que le reste du §6.2. */
  availableNow: z.number().int().nonnegative(),
  /**
   * Le COMPAGNON obligatoire d'`availableNow` (#1839) — combien, sur la MÊME
   * population (tous les talents actifs de l'espace), n'ont AUCUNE affectation
   * enregistrée dans `mission_assignments` : `staffing.availability ===
   * 'unknown'` (`deriveStaffing`, `staffing.ts`). Pour ces fiches, la
   * disponibilité dérivée ne peut être ni « disponible » ni « occupée » — on
   * ne sait pas, on n'a jamais pu conclure.
   *
   * Sans lui, « Disponibles maintenant : 0 » est un chiffre ORPHELIN : rien ne
   * dit si l'espace entier est occupé ou si personne n'a jamais renseigné
   * d'affectation. Même doctrine, et même paire de champs dans l'esprit, que
   * `AccountResourceMeasure` (`laura-account-context.ts`) — « `null` sur l'une
   * des deux moitiés suffit à ne rien affirmer » — mais PAS la même mesure :
   * celle-ci porte sur la disponibilité DÉRIVÉE des affectations, sur TOUT le
   * vivier (consultants + candidats) ; `AccountResourceMeasure` porte sur le
   * champ DÉCLARATIF (`consultants.availability = 'inconnu'`), sur les seuls
   * consultants d'un compte. Emprunter l'un pour l'autre mélangerait deux
   * définitions de « disponible » sur la même tuile — voir le docblock de
   * `TalentStatsBanner.tsx`.
   *
   * Jamais `null` : `deriveStaffing` rend TOUJOURS une valeur pour chaque
   * fiche (au pire `unknown`), donc ce compte est aussi certain que `total`.
   */
  availabilityUnknownCount: z.number().int().nonnegative(),
  /** Part des fiches dont la complétude ({@link talentCompleteness}) atteint
   *  au moins trois axes sur cinq. `null` sans talent à mesurer. */
  enrichedPercent: z.number().min(0).max(100).nullable(),
  /**
   * #2182.10 — le COMPTE (jamais un pourcentage) des fiches SOUS ce même
   * seuil — le complément d'`enrichedPercent`, sur le MÊME calcul
   * ({@link talentCompleteness}) et le MÊME seuil (`ENRICHED_MIN_AXES`,
   * `talent.service.ts`). Jamais `null` : à la différence d'un pourcentage,
   * un compte sur un vivier vide est un zéro VRAI (0 fiche incomplète sur 0
   * fiche), pas une division indéterminée.
   */
  incompleteCount: z.number().int().nonnegative(),
  /** Part des fiches mises à jour dans les sept derniers jours — la carte
   *  « Vivier enrichi ». `null` sans talent à mesurer. */
  refreshedThisWeekPercent: z.number().min(0).max(100).nullable(),
  /** La plus récente mise à jour connue, pour « mis à jour il y a N » —
   *  jamais recalculée côté écran, qui suivrait alors l'horloge du visiteur
   *  plutôt que celle du serveur. `null` sans aucun talent. */
  lastUpdatedAt: z.string().nullable(),
})
export type TalentStats = z.infer<typeof talentStatsSchema>

/**
 * CE QU'ON A LE DROIT DE DIRE DE « DISPONIBLES MAINTENANT » (#1839).
 *
 * Les deux moitiés arrivent désormais côté écran (`availableNow` +
 * `availabilityUnknownCount`, MÊME population) — il manquait la CONCLUSION,
 * et c'est elle que la tuile rendait de travers : « Disponibles maintenant :
 * 0 » sur un vivier où PERSONNE n'a d'affectation enregistrée n'est pas un
 * fait, c'est un silence rendu en chiffre. Un chef d'agence y lit « tout le
 * monde est en mission » et ferme l'écran.
 *
 * La règle appliquée est celle du dépôt, deux fois écrite :
 *  - « un axe non évaluable SORT du dénominateur » (doctrine). Ici, chaque
 *    fiche sans affectation est non évaluable : quand elles le sont TOUTES, le
 *    dénominateur est vide et il n'y a rien à affirmer.
 *  - « le vivier illisible se TAIT ; le vivier lisible et vide DIT zéro, parce
 *    que c'est un fait » (`laura-account-context.ts`). D'où les deux zéros
 *    distincts : un espace SANS talent reste `measured` (il n'y a personne, et
 *    c'est une réponse), un vivier peuplé mais entièrement muet devient
 *    `unmeasured`.
 *
 * Même patron que `accountResourceMeasure` — dont ceci n'est PAS un doublon :
 * celui-là porte sur le champ DÉCLARATIF des consultants d'UN compte, celui-ci
 * sur la disponibilité DÉRIVÉE des affectations de TOUT le vivier (§6.2
 * interdit de mélanger les deux sur la même tuile).
 *
 * `unmeasurable` voyage dans les DEUX états : c'est ce qui permet à l'écran de
 * nommer ce qu'il ne sait pas sans le recompter (une dérivation vit à un seul
 * endroit).
 */
export function talentAvailabilityMeasure(stats: {
  total: number
  availableNow: number
  availabilityUnknownCount: number
}): { state: 'measured'; availableNow: number; unmeasurable: number } | { state: 'unmeasured'; unmeasurable: number } {
  const { total, availableNow, availabilityUnknownCount: unmeasurable } = stats
  const counts = [total, availableNow, unmeasurable]
  // Une paire incohérente n'est pas une mesure basse, c'est une lecture
  // fausse — et une mesure fausse est pire qu'une mesure absente.
  if (counts.some(count => !Number.isInteger(count) || count < 0)) return { state: 'unmeasured', unmeasurable: 0 }
  if (unmeasurable > total || availableNow > total) return { state: 'unmeasured', unmeasurable }
  // Le dénominateur de la disponibilité dérivée : les fiches sur lesquelles
  // `deriveStaffing` a pu conclure. Vide alors que des fiches existent = on ne
  // sait rien, et « 0 » le dirait quand même.
  if (total > 0 && total - unmeasurable === 0) return { state: 'unmeasured', unmeasurable }
  return { state: 'measured', availableNow, unmeasurable }
}

/* ------------------------------------------------------------------ */
/*  Les vues par défaut du vivier (PDF 3 §6.4)                         */
/* ------------------------------------------------------------------ */

/**
 * Six questions qu'un recruteur se pose tous les matins, sous forme de filtres.
 *
 * Elles sont EN CODE et non en base, comme le catalogue de routines : une vue
 * éditable serait une requête que personne n'a relue, et surtout leur intérêt
 * est d'être les mêmes pour tout le monde — « les dormants » doit vouloir dire
 * la même chose d'une ESN à l'autre pour qu'on puisse en parler.
 *
 * `rare_profiles` n'y figure PAS : « une compétence présente chez moins de trois
 * talents » se calcule sur l'ensemble du vivier, pas par ligne — ce n'est pas un
 * filtre, c'est un autre écran. Le promettre ici afficherait une vue vide.
 */
export const TALENT_VIEWS = [
  'available_30d', //     disponibles sous 30 jours
  'on_bench', //          en intercontrat (libres aujourd'hui, sans mission)
  'to_revalidate', //     disponibilité déclarée mais aucune affectation connue
  'never_submitted', //   jamais positionnés
  'dormant', //           aucun contact depuis six mois
  'no_recent_mission', // aucune mission terminée ou en cours depuis six mois (#2182.23)
  'candidates', //        les dossiers de candidature, qui ont leur propre régime
] as const
export const talentViewSchema = z.enum(TALENT_VIEWS)
export type TalentView = (typeof TALENT_VIEWS)[number]

/**
 * Ce qu'une vue met dans la requête. Pur : l'écran et le serveur appliquent la
 * MÊME définition, et un test peut la lire sans base.
 *
 * `today` est un paramètre plutôt qu'une lecture d'horloge — sinon la fonction
 * n'est pas testable et « sous 30 jours » dérive d'un jour à l'autre sans que
 * personne ne s'en aperçoive.
 */
export function talentViewFilters(view: TalentView, today: Date): Partial<TalentSearchQuery> {
  const inDays = (days: number): string => {
    const target = new Date(today.getTime() + days * 24 * 60 * 60 * 1000)
    return target.toISOString().slice(0, 10)
  }
  switch (view) {
    case 'available_30d':
      // Libre avant 30 jours — ce qui inclut les gens libres AUJOURD'HUI. Les
      // exclure est l'erreur classique : ce sont les premiers à placer.
      return { freeBefore: inDays(30) }
    case 'on_bench':
      return { derived: 'available' }
    case 'to_revalidate':
      // La fiche annonce une disponibilité, aucune affectation ne la confirme
      // ni ne la contredit. C'est exactement la ligne dont il faut appeler la
      // personne — pas une donnée fausse, une donnée non vérifiée.
      return { derived: 'unknown' }
    case 'never_submitted':
      return { neverSubmitted: true }
    case 'dormant':
      // #2152.45 / #2182.20 — « À réveiller » devient une vue du vivier
      // lui-même : MÊME seuil (six mois) que le segment `dormant` de
      // `/consultants/pool` (`POOL_THRESHOLDS.dormantMonths`, talent-pool-
      // segments.ts), reliés par le libellé « À recontacter »
      // (`views.dormant`) — pas un second mécanisme, la même question posée
      // depuis un raccourci plutôt qu'une page à part.
      return { dormantMonths: 6 }
    case 'no_recent_mission':
      // #2182.23 — même seuil (six mois) que la vue « Dormants » juste
      // au-dessus, pour la même raison de lisibilité : deux questions
      // voisines (« sans contact » / « sans mission ») posées au même délai
      // par défaut, chacune réglable depuis le tiroir (`noMissionMonths`).
      return { noMissionMonths: 6 }
    case 'candidates':
      return { kind: 'candidate' }
  }
}

/* ------------------------------------------------------------------ */
/*  Ingestion d'un CV (PDF 3 §3.3)                                     */
/* ------------------------------------------------------------------ */

/** Borne du fichier déposé, en octets. Au-delà, ce n'est plus un CV. */
export const CV_UPLOAD_MAX_BYTES = 8 * 1024 * 1024

export const cvIntakeSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    /** Le fichier, encodé en base64 — même chemin que l'ingestion documentaire. */
    fileB64: z.string().min(1),
    /**
     * Le nom de la personne, quand l'utilisateur le connaît déjà.
     *
     * Optionnel : le parsing le lira dans le CV. Mais le fournir AVANT permet
     * de chercher un doublon sur le nom, donc de poser la question avant
     * d'écrire quoi que ce soit — ce que le §3.3 exige.
     */
    fullName: z.string().trim().max(200).optional(),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
    kind: talentKindSchema.default('candidate'),
    /**
     * Créer la fiche MALGRÉ un doublon proposé.
     *
     * Le geste est explicite parce que la décision l'est : « ce n'est pas la
     * même personne » est une affirmation, et elle doit venir de quelqu'un.
     */
    createDespiteDuplicates: z.boolean().default(false),
    /**
     * #2327.12 — les fiches que l'utilisateur vient d'écarter en créant malgré
     * tout. La décision « ce n'est pas la même personne » est MÉMORISÉE pour
     * chacune : la même paire ne se reproposera plus.
     */
    dismissedTalentIds: z.array(z.string().guid()).max(20).default([]),
    /**
     * #2327.17 — « mettre à jour une fiche » : le CV rejoint cette fiche comme
     * une VERSION de plus. Aucune nouvelle personne n'est créée, aucun champ de
     * la fiche n'est écrasé.
     */
    attachToTalentId: z.string().guid().optional(),
  })
  .strict()
export type CvIntakeInput = z.input<typeof cvIntakeSchema>

/* ------------------------------------------------------------------ */
/*  La photo d'un talent (écran Vivier, PDF-22 §01, piège n°3)         */
/* ------------------------------------------------------------------ */

/**
 * Le dépôt d'une photo sur la fiche d'un talent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE DATA URI, ET PAS UN STOCKAGE BINAIRE
 * ─────────────────────────────────────────────────────────────────────────
 * `consultants.photo_url` (`1790973000001-ConsultantPhotoUrl`) est une
 * colonne `text`, posée sans qu'aucun chemin ne l'écrive encore. Ce dépôt n'a
 * NULLE PART de stockage d'objets binaires (S3, bucket Supabase) — en poser
 * un pour une seule colonne aurait été l'inverse de la doctrine CV
 * (`TALENT_DOCUMENT_TEXT_MAX` : « on stocke le TEXTE, pas le fichier »). La
 * photo, elle, EST l'artefact à montrer — il n'y a rien à en extraire. On
 * accepte donc une donnée URI (`data:image/…;base64,…`) directement dans la
 * colonne, bornée strictement en taille : un portrait de fiche n'a besoin ni
 * de haute résolution ni de son poids d'origine.
 *
 * ⚠️ CRITÈRE PROTÉGÉ (annexe III de l'EU AI Act) : `photoUrl` n'entre dans
 * AUCUN tri, AUCUN classement, AUCUNE charge utile de prompt — gardé par
 * `apps/api/src/architecture/protected-criteria.spec.ts` (GA-06). Cette
 * écriture passe par `TalentPhotoService`, HORS de la liste des moteurs
 * surveillés, jamais par `TalentService`.
 */
export const TALENT_PHOTO_MAX_BYTES = 400_000

/** `null` retire la photo — un dépôt raté ne doit jamais laisser un portrait
 *  à moitié écrit, donc le retrait est un geste EXPLICITE, pas un défaut. */
export const talentPhotoSchema = z
  .object({
    photoUrl: z
      .string()
      .trim()
      .max(TALENT_PHOTO_MAX_BYTES)
      .regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/, 'photoUrl doit être une image encodée en base64')
      .nullable(),
  })
  .strict()
export type TalentPhotoInput = z.infer<typeof talentPhotoSchema>
