import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { TjmMetadata } from '@bellum/contracts'

/**
 * Le vivier de consultants d'une ESN (annexe méthodo p22 « Sourcing, push profil
 * et soutenance »).
 *
 * « Le profil est une offre commerciale seulement s'il est qualifié, préparé et
 * relié au besoin. » Le produit savait détecter un besoin (table `opportunities`)
 * mais pas qui pouvait y répondre : « pousser un profil » restait un libellé
 * d'action que rien n'exécutait. Cette table est le substrat manquant.
 *
 * Les colonnes sont exactement celles que la p22 liste pour le vivier — dispo,
 * TJM, zone, CDI/freelance, stack, secteur, références, envie — pas une de plus :
 * un vivier qui demande vingt champs ne se remplit jamais.
 *
 * Scope équipe comme le reste des tables métier. RLS = défense en profondeur
 * (l'API tourne en service role) ; voir la migration `1788000000000`.
 */
@Entity({ name: 'consultants' })
export class ConsultantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** Propriétaire de la ligne — utile tant que le roll-out workspace n'est pas
   *  terminé, et pour l'audit. Le scope de LECTURE reste `workspace_id`. */
  @Index()
  @Column('uuid')
  user_id: string

  /**
   * `consultant` (salarié en poste) ou `candidate` (dossier de candidature).
   *
   * Une colonne et non une seconde table (arbitrage Louis #7) : ce sont les
   * mêmes champs et le même écran. Ce qu'elle change, c'est le RÉGIME de la
   * donnée — un consultant est justifié par un contrat de travail, un candidat
   * non, et seul le second est purgé par la rétention.
   */
  @Column('text', { default: 'consultant' })
  kind: string

  /** Ancrage de la rétention : recontacter quelqu'un remet le compteur à zéro,
   *  parce que c'est ce qui justifie de garder son dossier. */
  @Column('timestamptz', { nullable: true })
  last_contact_at: Date | null

  /** D'où vient la fiche (cooptation, salon, candidature spontanée…). Texte
   *  libre : chaque ESN a son vocabulaire, et une liste fermée le trahirait. */
  @Column('text', { nullable: true })
  source: string | null

  /**
   * Le nom de la personne — `null` tant que personne ne l'a donné (D366).
   *
   * Nullable depuis `1790871117001-TalentNameOrNothing`, et la contrainte SQL
   * a été élargie AVANT ce changement de type (GA-11, GA-12). La colonne portait
   * auparavant `NOT NULL`, ce qui obligeait l'ingestion d'un CV à trouver
   * QUELQUE CHOSE à y mettre — elle y mettait le nom du fichier. Une contrainte
   * qui n'admet pas « inconnu » ne rend pas la donnée présente : elle rend le
   * remplissage obligatoire.
   *
   * Une chaîne vide est interdite par `consultants_full_name_not_blank` : elle
   * serait le prochain « Inconnu ».
   */
  @Column('text', { nullable: true })
  full_name: string | null

  @Column('text', { nullable: true })
  title: string | null

  /**
   * La photo de la personne (écran Vivier, PDF-22 §01) — `1790973000001-
   * ConsultantPhotoUrl`. `null` pour toute fiche : aucun chemin n'écrit encore
   * cette colonne, et « non renseigné » reste plus honnête qu'un portrait
   * deviné.
   *
   * ⚠️ CRITÈRE PROTÉGÉ (annexe III de l'EU AI Act). `TalentService` ne lit ni
   * n'écrit ce champ — voir `protected-criteria.spec.ts` (GA-06) et
   * `talent-photo.service.ts`, qui la fusionne à la réponse APRÈS coup, hors
   * de tout classement.
   */
  @Column('text', { nullable: true })
  photo_url: string | null

  /** junior | confirme | senior | expert | inconnu */
  @Column('text', { default: 'inconnu' })
  seniority: string

  /**
   * Années d'expérience — SAISIES, ou LUES dans le CV quand il les écrit (décision Louis
   * 15/10/2026, #3935 ; jamais déduites d'un intitulé) (`1791000000002-
   * ConsultantYearsExperience`, écran Vivier, PDF-22 §01, 31/08/2026).
   * `null` = non renseigné ; `0` reste une vraie réponse (« tout juste
   * diplômée »), pas une valeur de remplissage. Voir
   * `consultantSchema.years_experience` pour la raison complète (pourquoi pas
   * un agrégat de compétence).
   */
  @Column('integer', { nullable: true })
  years_experience: number | null

  /** immediate | sous_1_mois | sous_3_mois | indisponible | inconnu | en_mission.
   *  `inconnu` n'est JAMAIS présenté comme disponible. `en_mission` (#2186.5,
   *  ajoutée EN FIN) distingue une affectation ailleurs, déclarée par la
   *  personne, d'un `indisponible` qui ne l'est pour aucune autre raison —
   *  les deux étaient conflatés sous `indisponible` (libellé « En mission »).
   *  Colonne `text` + `consultants_availability_check` (élargie à `en_mission`
   *  par `1796531408463-ConsultantAvailabilityEnMission`), miroir de
   *  `consultantAvailabilitySchema`. */
  @Column('text', { default: 'inconnu' })
  availability: string

  /** Date de disponibilité (`YYYY-MM-DD`) quand elle est connue — sert à repérer
   *  une dispo « immédiate » saisie il y a des mois et désormais périmée. */
  @Column('date', { nullable: true })
  available_from: string | null

  /** cdi | freelance | portage | inconnu */
  @Column('text', { default: 'inconnu' })
  contract_type: string

  /** TJM cible en euros, sans symbole. NULL = non renseigné (jamais 0). */
  @Column('integer', { nullable: true })
  tjm: number | null

  /**
   * Comment on mobilise la personne (décision D16 du 20/08).
   *
   * Séparé de `kind`, qui porte une question de DROIT (candidat = donnée
   * personnelle bornée à deux ans). Celui-ci porte une question de COMMERCE :
   * qui paie qui, donc quel coût la personne représente.
   */
  @Column('text', { default: 'inconnu' })
  engagement_kind: string

  /** Le partenaire qui porte un sous-traitant — sans lui, personne ne sait qui
   *  est responsable devant le client. `null` pour toutes les autres natures. */
  @Column('uuid', { nullable: true })
  partner_account_id: string | null

  /**
   * #2195.12 — le responsable HIÉRARCHIQUE de la personne, saisi à la main
   * (`1795200000001-ConsultantManager`, 16/09/2026).
   *
   * Pointe vers un autre `consultants.id`, jamais vers `profiles.user_id` : un
   * manager d'ESN est lui-même quelqu'un du vivier. `null` = non renseigné, et
   * jamais dérivé de la BU. Voir `consultantSchema.manager_id` pour la raison
   * complète et les deux autres « managers » qu'il ne désigne pas.
   */
  @Column('uuid', { nullable: true })
  manager_id: string | null

  /**
   * #2185.10 — le référent COMMERCIAL de la fiche (`1796321356173-ConsultantOwner`).
   *
   * Pointe vers `auth.users(id)`, jamais vers `consultants.id` : contrairement
   * au manager (ci-dessus), qui est souvent un autre consultant, le référent
   * commercial est toujours un membre de l'espace. `null` = « non attribué ».
   */
  @Column('uuid', { nullable: true })
  owner_user_id: string | null

  /** Coordonnées. Masquables par réglage d'espace (D20) : RETIRÉES de la
   *  réponse, jamais vidées — un champ vide se lit « pas renseigné ». */
  @Column('text', { nullable: true })
  email: string | null

  @Column('text', { nullable: true })
  phone: string | null

  /** La ville lue dans le bloc `identity` d'un CV (#2183.21, `readLocationFromIdentity`,
   *  `1796001541963-ConsultantLocation`). `null` = non renseigné, jamais devinée. */
  @Column('text', { nullable: true })
  location: string | null

  /** Les formations lues dans le bloc `education` d'un CV (#2183.26, #2784,
   *  `20260927195301-ConsultantEducation`). `null` = non renseignées, jamais
   *  devinées — le même bloc alimente déjà l'écran de revue d'import, mais
   *  n'était jusqu'ici persisté nulle part sur la fiche. */
  @Column('text', { array: true, nullable: true })
  education: string[] | null

  /** #3935.2a — environnements techniques lus dans le bloc `environments` d'un CV
   *  (`1796437900701-ConsultantEnvironmentsToolsCertifications`). `null` = NON LU,
   *  jamais une liste vide déduite d'un bloc absent. Provenance : `field_provenance`. */
  @Column('text', { array: true, nullable: true })
  environments: string[] | null

  /** #3935.2a — outils lus dans le bloc `tools` d'un CV. `null` = non lu. */
  @Column('text', { array: true, nullable: true })
  tools: string[] | null

  /** #3935.2a — certifications lues dans le bloc `certifications` d'un CV
   *  (intitulé et organisme, tels qu'écrits). `null` = non lu. */
  @Column('text', { array: true, nullable: true })
  certifications: string[] | null

  /** Profil public déclaré par la personne. Jamais scrapé. */
  @Column('text', { nullable: true })
  public_profile_url: string | null

  /**
   * Relue par un humain, ou pas encore (§3.3).
   *
   * Le défaut de la COLONNE est `qualified` parce que les fiches historiques
   * ont été saisies à la main. Une fiche née d'une extraction est écrite
   * explicitement en `needs_review` : un défaut de colonne ne peut pas
   * distinguer les deux origines.
   */
  @Column('text', { default: 'qualified' })
  review_status: string

  @Column('timestamptz', { nullable: true })
  qualified_at: Date | null

  /**
   * Le consentement de la PERSONNE (§7.3) — distinct de la rétention, qui est
   * une politique d'espace calculée sur une inactivité. `null` = jamais
   * recueilli, ce qui est une information et non un défaut à combler.
   */
  @Column('timestamptz', { nullable: true })
  consent_given_at: Date | null

  @Column('timestamptz', { nullable: true })
  consent_expires_at: Date | null

  /** La base légale, en clair. Texte libre : la formulation engage l'ESN. */
  @Column('text', { nullable: true })
  consent_basis: string | null

  /**
   * #2185.57 — ce que la personne a EXCLU de son accord (« pas de mission
   * chez tel concurrent », « ne pas partager mon CV avant le 1er »),
   * `1796321350100-ConsultantConsentRestrictions`. Distinct de `consent_basis`
   * (la base légale) : une restriction borne l'USAGE, pas la durée ni le
   * fondement. `null` = aucune restriction connue, jamais une chaîne vide.
   */
  @Column('text', { nullable: true })
  consent_restrictions: string | null

  /**
   * Sorti du vivier ACTIF, données conservées (§13.2).
   *
   * Une date et non un booléen : savoir QUAND quelqu'un est parti répond à la
   * moitié des questions qu'on se pose ensuite.
   */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @Column('text', { nullable: true })
  archived_reason: string | null

  /**
   * Mobilité structurée (§8.2). TOUT est nullable, sans défaut : ces champs
   * sont rarement dans un CV, et `null` veut dire « on n'a pas demandé ».
   * Un défaut à `indifferent` ferait proposer des missions sur site à
   * quelqu'un qui n'a jamais dit qu'il acceptait.
   */
  @Column('text', { array: true, nullable: true })
  mobility_zones: string[] | null

  @Column('text', { nullable: true })
  remote_preference: string | null

  @Column('text', { nullable: true })
  travel_acceptance: string | null

  /** `false` = a dit non. `null` = on n'a pas demandé. */
  @Column('boolean', { nullable: true })
  relocation: boolean | null

  /**
   * #2948 (#2329.19) — fréquence sur site EXACTE (`SITE_FREQUENCIES`), plus fine
   * que `travel_acceptance` ci-dessus, qui porte les déplacements PONCTUELS
   * ailleurs qu'au domicile, pas la régularité de présence chez LE client.
   * `text` sans CHECK, même patron que `remote_preference`/`travel_acceptance` :
   * validée par `talentMobilitySchema`, jamais par la base. `null` = on n'a pas
   * demandé (migration `20260927181100-ConsultantMobilityFine`).
   */
  @Column('text', { nullable: true })
  site_frequency: string | null

  /**
   * #2948 (#2329.22) — mobilité INTERNATIONALE, distincte de `mobility_zones`
   * ci-dessus qui ne porte que des départements/régions FRANÇAISES. `false` =
   * a dit non. `null` = on n'a pas demandé.
   */
  @Column('boolean', { nullable: true })
  international_mobility: boolean | null

  /**
   * #2948 (#2329.23) — une restriction de mobilité NOMMÉE (permis, découché,
   * garde d'enfant…), texte libre comme `consent_restrictions` : aucune échelle
   * commune ne survit à deux ESN. `null` = aucune restriction connue, jamais
   * une chaîne vide.
   */
  @Column('text', { nullable: true })
  mobility_restrictions: string | null

  /**
   * #2948 (#2329.30) — démarches (candidatures/entretiens) EN COURS ailleurs.
   * `false` = a dit non. `null` = on n'a pas demandé.
   */
  @Column('boolean', { nullable: true })
  process_in_progress: boolean | null

  /**
   * #2948 (#2329.31) — exclusivité accordée sur le processus en cours. `null` =
   * on n'a pas demandé — jamais un « non exclusif » deviné.
   */
  @Column('boolean', { nullable: true })
  process_exclusive: boolean | null

  /**
   * #2948 (#2329.32) — les AUTRES entretiens/processus, EN CLAIR (texte libre :
   * « 2e tour chez un concurrent », « en attente d'une réponse »). Distinct de
   * `process_in_progress`, qui ne dit que oui/non/pas demandé — ce champ NOMME
   * ce qu'on sait. `null` = rien de connu, jamais une chaîne vide.
   */
  @Column('text', { nullable: true })
  process_other_interviews: string | null

  /**
   * #2948 (#2329.33) — la date à laquelle la personne doit décider (chez un
   * autre acteur). `null` = aucune deadline connue.
   */
  @Column('date', { nullable: true })
  process_decision_deadline: string | null

  /**
   * #2948 (#2329.47) — TJM/conditions VALIDÉES avant présentation, l'un des 7
   * axes de l'accord (#2329.45-.51). Geste explicite du commercial
   * (`ConsultantsService.confirmTjmValidated`), JAMAIS déduit — même doctrine
   * que `availability_checked_at`. `null` = jamais confirmé.
   */
  @Column('timestamptz', { nullable: true })
  tjm_validated_at: Date | null

  /**
   * #2948 (#2329.51) — CV validé ou règles d'usage acceptées, un autre des 7
   * axes. `null` = jamais confirmé.
   */
  @Column('timestamptz', { nullable: true })
  cv_validated_at: Date | null

  /**
   * BEL-SC-238 (#3267) — les traits observés en ENTRETIEN (communication,
   * autonomie), au plus une entrée par trait (`TALENT_INTERVIEW_TRAITS`).
   * `null`/`[]` = jamais entretenu sur ces traits — jamais un niveau inventé
   * en leur absence.
   */
  @Column('jsonb', { nullable: true })
  interview_traits:
    | {
        trait: string
        level: string
        source: 'interview'
        note: string | null
        recordedAt: string
        recordedByName: string | null
      }[]
    | null

  /** #3406 — les informations TERRAIN capitalisées, append-only. `null` =
   *  aucune information capitalisée, jamais `[]` deviné. */
  @Column('jsonb', { nullable: true })
  field_reports:
    | {
        id: string
        accountId: string | null
        accountName: string | null
        entity: string | null
        team: string | null
        manager: string | null
        project: string | null
        technologies: string[]
        teamSize: string | null
        partnersObserved: string[]
        painPoints: string | null
        possibleSponsor: string | null
        decisionMakers: string[]
        uncoveredNeed: string | null
        peopleToContact: string[]
        introductionPossible: string | null
        notForCommercialUse: boolean
        confidentialityLevel: string
        usageAuthorization: string | null
        scope: string | null
        confidence: string
        recordedByUserId: string
        recordedByName: string | null
        declaredAt: string
      }[]
    | null

  /** Le temps avant efficacité ANNONCÉ en entretien — un fait unique, jamais
   *  déduit d'un CV. `null` = jamais évalué. */
  @Column('text', { nullable: true })
  ramp_up_band: string | null

  @Column('text', { nullable: true })
  ramp_up_note: string | null

  @Column('timestamptz', { nullable: true })
  ramp_up_recorded_at: Date | null

  @Column('text', { nullable: true })
  ramp_up_recorded_by_name: string | null

  /** Préférences de mission (§8.3) — distinctes de `sectors`, qui est une
   *  PREUVE d'expérience et non un souhait. */
  @Column('text', { array: true, nullable: true })
  wanted_sectors: string[] | null

  @Column('text', { array: true, nullable: true })
  refused_sectors: string[] | null

  @Column('text', { array: true, nullable: true })
  refused_technologies: string[] | null

  @Column('text', { array: true, nullable: true })
  wanted_contract_kinds: string[] | null

  /** #3410.10 — le type de client visé, texte libre. */
  @Column('text', { array: true, nullable: true })
  preferred_client_types: string[] | null

  /** #3410.11 — des clients NOMMÉS refusés par la personne (distinct du
   *  `clientHistoryFlag` calculé par le matching). */
  @Column('text', { array: true, nullable: true })
  refused_clients: string[] | null

  /** #3410.13 — un environnement à éviter, distinct de `refused_technologies`. */
  @Column('text', { array: true, nullable: true })
  environments_to_avoid: string[] | null

  /** #3410.14 — la condition qui rend une mission inacceptable, en clair. */
  @Column('text', { nullable: true })
  non_negotiable_conditions: string | null

  /** Le plancher accepté après négociation, en CENTIMES. `finance:read`. */
  @Column('bigint', { nullable: true })
  min_tjm_cents: string | number | null

  /** Coût chargé d'un SALARIÉ, en centimes. Toujours saisi, jamais calculé. */
  @Column('bigint', { nullable: true })
  cost_rate_cents: string | number | null

  /** TJM d'ACHAT d'un freelance ou d'un sous-traitant, en centimes. Autre objet
   *  que le coût chargé : les confondre rendrait la marge fausse pour une des
   *  deux natures sans qu'on sache laquelle. */
  @Column('bigint', { nullable: true })
  purchase_tjm_cents: string | number | null

  /**
   * #2948 (#2329.12/.13/.14/.16) — devise, source, contexte, date et
   * confidentialité du TJM (`TjmMetadata`, `consultant.ts`). `NULL` = jamais
   * renseigné. L'unité (#2329.11) n'a pas de champ : un TJM est un taux
   * JOURNALIER par construction dans tout le domaine financier (GA-26).
   */
  @Column('jsonb', { nullable: true })
  tjm_metadata: TjmMetadata | null

  @Column('text', { array: true, default: () => "'{}'" })
  stack: string[]

  /** #5016.3 — correction humaine gagne : posé quand une personne enregistre la stack. */
  @Column('timestamptz', { nullable: true })
  stack_edited_by_human_at: Date | null

  @Column('text', { array: true, default: () => "'{}'" })
  sectors: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  zones: string[]

  /**
   * Coordonnées GÉOCODÉES de la première zone (`zones[0]`) via la Base
   * Adresse Nationale (`1791000000001-ConsultantGeocoding`, écran Vivier,
   * PDF-22 §01, décision de Louis du 31/08/2026 — publique, sans clé).
   *
   * Recalculées à chaque écriture de `zones` (`ConsultantsService`, JAMAIS
   * dans `talent.service.ts`, qui ne fait que LIRE le vivier). `null` = pas
   * (encore) géocodable — aucune zone saisie, ou l'appel a échoué (réseau
   * indisponible, ville inconnue). Un talent non géocodé SORT du filtre par
   * rayon, il ne vaut jamais « à 0 km ».
   */
  @Column('double precision', { nullable: true })
  latitude: number | null

  @Column('double precision', { nullable: true })
  longitude: number | null

  @Column('text', { array: true, default: () => "'{}'" })
  references: string[]

  /** Langues parlées, `[{code, level}]`. `level` peut être `null` : une langue
   *  déclarée sans niveau reste une question à poser, pas un A1. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  languages: { code: string; level: string | null }[]

  /** Habilitations détenues. Texte libre : chaque donneur d'ordre a les siennes. */
  @Column('text', { array: true, default: () => "'{}'" })
  clearances: string[]

  /** Dernière revalidation de la disponibilité. `null` = jamais revalidée, ce qui
   *  n'est pas la même chose que « revalidée il y a longtemps ». */
  @Column('timestamptz', { nullable: true })
  availability_checked_at: Date | null

  /** « Envie » (p22) : ce que la personne veut faire. Un profil poussé contre son
   *  envie part en mission et démissionne — d'où une colonne, pas un oubli. */
  @Column('text', { nullable: true })
  wants: string | null

  @Column('text', { nullable: true })
  notes: string | null

  /** Le CV source, en texte brut (annexe méthodo p22). Matière de la réécriture
   *  ET référence de vérification : une expérience réécrite qui ne se retrouve
   *  pas ici est retirée du livrable. */
  @Column('text', { nullable: true })
  cv_text: string | null

  /**
   * #2569.2 — la date RÉELLE du `cv_text` actuel (entrée ZIP, ou message qui la
   * portait). Sert à départager DEUX versions du même CV à l'import en lot :
   * la plus récente remplace le texte, jamais l'inverse. `null` = inconnue —
   * un dépôt manuel n'en porte pas, et ce n'est jamais deviné.
   */
  @Column('timestamptz', { nullable: true })
  cv_captured_at: Date | null

  /**
   * #2542.3 — vrai quand le `cv_text` ACTUEL de la fiche vient d'une lecture
   * PARTIELLE (#1954.16/.30). Même valeur que `extraction_partial` sur le
   * document qui l'a fourni, dupliquée ici pour que l'écran de revue
   * (`CvParseService.propose`) la lise sans rejoindre `consultant_documents`
   * — même patron que `cv_captured_at` au-dessus.
   */
  @Column('boolean', { default: false })
  cv_extraction_partial: boolean

  /**
   * Lecture automatique des CV à l'import (04/10/2026, `c88_lecture_auto_cv_import`)
   * — la date de la dernière lecture du CV par le modèle (file `cv-auto-parse`).
   * `null` = jamais lu, ce qui définit « CV non lu » pour le rattrapage ciblé.
   * Migration `1796432163481-ConsultantCvAutoReadAt`.
   */
  @Column('timestamptz', { nullable: true })
  cv_auto_read_at: Date | null

  /**
   * #2570 — la trace du dernier enrichissement, même patron que
   * `contacts.last_enrichment_at` (`1786500000000-ContactEnrichmentTrace`).
   * `last_enrichment_source` vaut `pipeline` (cascade fournisseur réelle) ou
   * `demo` — jamais le nom d'un fournisseur. `null` = jamais tenté.
   */
  @Column('timestamptz', { nullable: true })
  last_enrichment_at: Date | null

  @Column('text', { nullable: true })
  last_enrichment_source: string | null

  /**
   * #2818 — l'origine du sourcing EXTERNE, quand cette fiche vient de là
   * (`ExternalSourcingService.importCandidate`, migration
   * `1796322428694-ConsultantExternalSourcingOrigin`).
   *
   * `null` = fiche entrée par un autre chemin (saisie manuelle, dépôt de CV
   * direct…) — l'état ordinaire de la quasi-totalité du vivier. Posée UNE
   * SEULE fois : un second import sur la même fiche ne l'écrase jamais, pour
   * la même raison que `consent_given_at` plus haut — l'origine PREMIÈRE est
   * celle qui compte, pas la dernière relecture.
   */
  @Column('jsonb', { nullable: true })
  external_sourcing_origin: {
    sourceKind: string
    needId: string | null
    importedAt: string
    externalRef?: string
  } | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /**
   * Import universel (Louis 27/09/2026, migration `1796322824816`) — les
   * colonnes d'un fichier importé qui n'ont AUCUN champ d'accueil, sous leur
   * en-tête d'origine. `{}` = rien d'importé en plus.
   */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  extra: Record<string, string>
}
