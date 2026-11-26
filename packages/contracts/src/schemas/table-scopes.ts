/**
 * Le registre des DEUX catégories de tables — `scoped` et `shared`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT L'EXIGENCE, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Tome 7 §23.1, « Le référentiel ESN partagé casse le modèle de scope »
 * (`agent_docs/sources/BELLUMAI_ITERATION_3_01/01_ARCHITECTURE_PRODUCT_UX_DESIGN/
 * original_markdown_sources/T7.md:299-316`) :
 *
 *   | Deux catégories de tables | `scoped` (avec `workspace_id`) et `shared`
 *   |                           | (sans, en lecture seule pour les espaces)   |
 *   | Une table partagée est en lecture seule côté espace | seul le pipeline écrit |
 *   | Le test de garde d'isolation | doit **connaître la liste** des tables
 *   |                              | partagées, sinon il échouera à chaque fois |
 *   | Aucune donnée commerciale d'un espace | ne remonte dans une table partagée
 *   |                                       | sans passer par l'agrégation à 3 espaces |
 *
 *   « **Sans cette distinction formelle, le test `GA-06` du PDF 9 devient
 *   ingérable.** »
 *
 * ⚠️ `GA-06` désigne ici la garde d'ISOLATION D'ESPACE au sens du PDF 9. Au
 * dépôt, ce numéro est déjà pris (les critères protégés,
 * `protected-criteria.spec.ts`) et l'isolation d'espace s'appelle **GA-46**
 * (`apps/api/src/architecture/workspace-isolation.spec.ts`). Les deux sources du
 * même paquet se contredisent d'ailleurs entre elles — `pdf1.md:664-666` dit
 * `GA-04` = isolation et `GA-06` = champs protégés, `pdf9.md:554-556` dit
 * exactement l'inverse. La table de correspondance vit au §1 de
 * `agent_docs/pdf9-backlog-claude-code-2026-08-22.md` ; elle ne se rejoue pas ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE DÉCLARE, ET CE QUI SE DÉDUIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Recopier à la main les 127 tables qui portent déjà `workspace_id` ou `user_id`
 * produirait une liste qui diverge du schéma à la première migration — et une
 * liste qui diverge est pire que pas de liste, parce qu'on la croit. Ce registre
 * ne déclare donc QUE ce qu'aucune colonne ne dit :
 *
 *   · une table qui porte `workspace_id`  → `scoped`, déduit, rien à écrire ;
 *   · une table qui porte `user_id`       → `scoped`, déduit (un utilisateur
 *     appartient à un espace ; c'est un scope, pas une absence de scope) ;
 *   · tout le reste                       → **doit figurer ci-dessous**, avec sa
 *     catégorie ET sa raison.
 *
 * ⚠️ `owner_user_id`, `author_user_id`, `target_user_id`, `created_by` ne
 * comptent PAS comme clés de portée. Ce sont des colonnes d'AUTEUR : elles
 * disent qui a produit la ligne, pas qui a le droit de la lire. Les traiter
 * comme un scope classerait `workspaces` « personnelle » et
 * `impersonation_audit` « d'un utilisateur », ce qui est faux dans les deux cas.
 * C'est la porte par laquelle une table non isolée entrerait sans bruit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI « À CLASSER » EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une table mal rangée `shared` est un trou d'isolation ; une table mal rangée
 * `scoped` est un écran vide. Entre les deux, il n'y a pas de défaut par défaut.
 * Une table dont personne ne sait dire à qui elle appartient se déclare
 * `to-classify` AVEC LA QUESTION qu'elle pose — et la question reste lisible
 * jusqu'à ce que quelqu'un y réponde.
 *
 * La garde qui lit ce fichier : `apps/api/src/architecture/table-scope-registry.spec.ts`
 * (GA-65). Elle confronte ce registre aux entités TypeORM RÉELLEMENT
 * enregistrées (`ENTITIES` de `database.module.ts`), pas à un balayage de
 * fichiers — les deux tables qui manquaient à ce registre le jour où il a été
 * écrit vivaient précisément dans un fichier partagé avec une sœur scopée.
 */

/** À qui appartient la donnée d'une table, au sens du tome 7 §23.1. */
export type TableScope =
  /**
   * `scoped` — la donnée d'UN espace. Toute lecture la borne, sans exception.
   *
   * `own_row` : la table EST l'espace (sa clé primaire est l'identifiant).
   * `workspace_column` / `user_column` : la colonne de portée existe mais la
   * table n'a pas d'entité TypeORM, donc rien ne peut la déduire.
   * `parent` : la ligne n'est isolée QUE par une jointure — la plus risquée des
   * quatre, et c'est pourquoi la jointure est écrite comme une DONNÉE
   * (`parent` + `column`), relisable par la garde, et non racontée en prose.
   */
  | { category: 'scoped'; by: 'own_row' | 'workspace_column' | 'user_column'; reason: string }
  | { category: 'scoped'; by: 'parent'; parent: string; column: string; reason: string }
  /**
   * `shared` — la table n'appartient à aucun espace.
   *
   * `market` : un fait de MARCHÉ que tous les espaces lisent (registre public,
   * référentiel d'entreprises, photo d'un territoire). La filtrer par espace
   * serait absurde : le nombre d'offres IT en Haute-Garonne est le même pour
   * tout le monde.
   * `operator` : la plomberie de l'éditeur. AUCUN espace ne la lit — ce n'est
   * pas un fait partagé, c'est un fait qui n'est à personne. Confondre les deux
   * ferait croire que `impersonation_audit` est consultable par un client.
   */
  | { category: 'shared'; audience: 'market' | 'operator'; reason: string }
  /** `to-classify` — on ne sait pas, et on l'écrit plutôt que de trancher au hasard. */
  | { category: 'to-classify'; question: string }

/**
 * Toute table dont l'appartenance ne se déduit d'aucune colonne.
 *
 * Les entrées `derived` de `shared-tables-declared.spec.ts` (GA-16) ont été
 * versées ici sans être réécrites : GA-16 lisait sa propre liste, ce registre
 * est désormais la seule, et GA-16 la lit. Un réglage vit à un seul endroit.
 */
export const TABLE_SCOPES: Record<string, TableScope> = {
  /* ───────────── La table qui EST l'espace ───────────── */

  workspaces: {
    category: 'scoped',
    by: 'own_row',
    reason:
      'L’espace lui-même : sa clé primaire EST l’identifiant que toutes les autres tables portent. Elle a bien un `owner_user_id`, mais c’est une colonne d’AUTEUR — la déduire comme portée rangerait l’espace parmi les tables personnelles, et un espace n’appartient pas à son créateur : il appartient à ses membres, qui vivent dans `workspace_members`.',
  },

  /* ───────────── Isolées par leur PARENT : la jointure est une donnée ───────────── */

  mission_timesheets: {
    category: 'scoped',
    by: 'parent',
    parent: 'missions',
    column: 'mission_id',
    reason:
      'Le relevé d’activité d’une mission. C’est la plus exposée des tables dérivées, parce qu’elle porte des JOURS FACTURABLES : une lecture qui oublie la jointure montrerait le temps vendu d’un autre espace.',
  },
  // #4188 — pas d'entité TypeORM : `CrmPushService` la lit et l'écrit en SQL,
  // comme le semis de démonstration.
  account_crm_exports: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Où un compte a été envoyé (CRM, identifiant de la société chez lui, date). C’est la référence externe qui empêche un second envoi de créer un doublon : une lecture non bornée à l’espace montrerait « Dans <CRM> » sur le compte d’un autre espace. Chaque requête porte `workspace_id`.',
  },
  // Pas d'entité TypeORM : la table est lue et écrite en SQL, comme sa voisine
  // `account_crm_exports` ci-dessus.
  account_crm_fusions: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'La trace d’une fusion de comptes : les deux identifiants (`kept_id` survit, `absorbed_id` est archivé, jamais supprimé), la base du rapprochement et ce qui a été déplacé. Elle porte `workspace_id` en propre, et « fusionné dans » se lit par ESPACE, jamais par agence : une lecture non bornée désignerait le compte d’un concurrent comme survivant d’une fusion. C’est une trace, pas une donnée commerciale.',
  },
  // #2196.31 — pas d'entité TypeORM : le service des relevés la lit et l'écrit
  // en SQL, comme `mission_timesheets`.
  mission_timesheet_exceptions: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'L’exception « non applicable » d’un relevé (qui, quand, pourquoi). Elle décide si un mois est RÉCLAMÉ à un consultant et s’il bloque la facturation : une lecture non bornée à l’espace lèverait le « relevé manquant » d’un autre espace. Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2563 — pas d'entité TypeORM : `InvoiceMonthPreparationService` les lit et
  // les écrit en SQL, chaque requête bornée par `workspace_id`.
  mission_month_preparations: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Le mois PRÉPARÉ d’une mission (jours saisis sans CRA, N° de bon de commande, qui l’a préparé). Une lecture non bornée à l’espace montrerait les jours à facturer d’un autre espace. Chaque requête porte `workspace_id`.',
  },
  mission_invoice_auto_prepare: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'L’option « préparer chaque mois » d’une mission : qui l’a activée et quand. Chaque requête porte `workspace_id`.',
  },
  // #3694.7 — pas d'entité TypeORM : `engagement-drafts.ts` la lit et l'écrit
  // en SQL, chaque requête bornée par `workspace_id` ET `user_id`.
  engagement_drafts: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Le brouillon d’engagement d’un commercial (brief confirmé et fil de conversation, par contact et canal). Une lecture non bornée à l’espace exposerait le brief d’un autre espace. Chaque requête porte `workspace_id` et `user_id`.',
  },
  // #2814 — pas d'entité TypeORM : `InvoiceAttachmentsService` la lit et
  // l'écrit en SQL, chaque requête bornée par `workspace_id`.
  invoice_attachments: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Les pièces jointes d’une facture préparée (bon de commande signé, relevé validé, PV) : des pièces comptables d’un espace. Une lecture non bornée ouvrirait le bon de commande d’un concurrent ; chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2417.3/.4/.5 — pas d'entité TypeORM : `MissionBillingService` et
  // `InvoiceReadinessService` les lisent en SQL.
  mission_milestones: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Les jalons déclarés d’un forfait (libellé, date, montant). Des montants d’un espace : chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  mission_billing_declarations: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Retainer mensuel, fee et garantie de placement déclarés d’une mission. Des montants d’un espace : chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2407.5/.6 — pas d'entité TypeORM : `MissionStatusService` l'écrit et la lit en SQL.
  mission_status_transitions: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Le journal des transitions de statut (mission, affectation), motif d’un retour arrière compris. Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2423 — pas d'entité TypeORM : `MissionAmendmentService` l'écrit et la lit en SQL.
  mission_amendments: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Les avenants d’une mission (TJM, société, site, pause…), immuables une fois proposés — seul leur statut et l’approbation évoluent — avec leur preuve. Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2422.4 (épopée #2869) — pas d'entité TypeORM : `LegalContractService`
  // l'écrit et la lit en SQL, même patron que `mission_amendments`.
  legal_contracts: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Le contrat juridique typé d’un compte (cadre/mission/avenant/PO/sous-traitance…). Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2422.6 (épopée #2869, lot R24 07/10/2026) — pas d'entité TypeORM :
  // `LegalContractUploadLinkService` l'écrit et la lit en SQL, même patron que
  // `legal_contracts`. La porte PUBLIQUE résout par `token_hash` (colonne
  // UNIQUE), jamais par `workspace_id` — c'est le jeton, pas la session, qui
  // prouve le droit sur cette ligne-là ; la RLS reste posée pour la lecture
  // authentifiée (écran du commercial), la porte publique passe par la clé de
  // service comme le reste de l'API.
  legal_contract_upload_links: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Le lien signé à portée limitée (une mission + un contrat) par lequel un contact externe, sans compte BellumAI, dépose une pièce. Chaque requête authentifiée porte `workspace_id`, et la RLS la limite aux membres de l’espace ; la résolution publique passe par `token_hash`, jamais par l’espace.',
  },
  // Épopée #2880 (lot V33) — pas d'entité TypeORM : `ExpertiseGroundingService`
  // l'écrit et la lit en SQL, même patron que `legal_contracts`.
  expertise_groundings: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Le croisement expertise ↔ fondement/preuve d’une ESN : quelle référence, quelle mission, quel document prouve quelle expertise, et avec quelle restriction de confidentialité. Des références clients confidentielles d’un espace : chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2338 / #2409 — pas d'entité TypeORM : `MissionStartReadinessService` l'écrit et la lit en SQL.
  mission_start_checks: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Les accords client/consultant et prérequis de démarrage déclarés d’une mission (auteur, date, preuve). Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2414 (LAU-FINAL-128) / épopée #2986 — pas d'entité TypeORM : `MissionEndService` l'écrit et la lit en SQL.
  mission_end_checks: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'La checklist de sortie d’une mission (client, consultant, interne) déclarée (auteur, date, note). Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2414 (LAU-FINAL-128) / épopée #2986 — pas d'entité TypeORM : `MissionEndService` l'écrit et la lit en SQL.
  mission_interruptions: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Une mission interrompue avant son terme : motif, responsabilité, risque, les deux accusés (confidentialité, non-sollicitation). NO-GO du #2414 : `availability_confirmed` démarre à `false` et n’est levée que par un second geste. Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // L3 Pilotage › Staffing (14/10/2026) — pas d'entité TypeORM : `StaffingPilotageService` la lit en SQL.
  consultant_absences: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Les congés et absences d’un consultant (début, fin, motif) : ils retirent des jours de la capacité et du dénominateur du TACE. Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #3269 (BEL-SC-240) — pas d'entité TypeORM : `MissionDeliveryMilestonesService` la lit et l'écrit en SQL.
  mission_delivery_milestones: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Les six jalons de delivery déclarés d’une mission qu’aucun objet canonique existant ne couvre (brief consultant, brief client, documents et accès, premier check, revue de début, suivi périodique) — auteur, date, note. Chaque requête porte `workspace_id`, et la RLS la limite aux membres de l’espace.',
  },
  // #2419.1 — pas d'entité TypeORM : `InvoicePaymentsService` la lit et l'écrit en SQL.
  invoice_payments: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Les paiements reçus (montant, date, payeur), rattachés ou non à une facture. Ce sont des montants d’un espace : une lecture non bornée montrerait l’encaissé d’un concurrent. Chaque requête porte `workspace_id` — y compris le rattachement, qui exige la facture ET le paiement dans le même espace — et la RLS la limite aux membres de l’espace.',
  },
  // #2407.10 / #2417.7 — pas d'entité TypeORM : `RevenueService.produced()` la
  // lit en SQL, comme `mission_timesheets` et `mission_timesheet_exceptions`.
  mission_rate_history: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'La fenêtre du TJM PASSÉ d’une mission (migration `1795999369139`). Elle porte le tarif qui a été VENDU sur une période close : une lecture non bornée à l’espace laisserait un autre espace recalculer le CA produit d’une mission qui n’est pas la sienne. Chaque ligne porte `workspace_id` en dur (posée par `DeliveryService.updateMission`, jamais déduite d’une jointure).',
  },
  activity_participants: {
    category: 'scoped',
    by: 'parent',
    parent: 'activities',
    column: 'activity_id',
    reason:
      'Les participants d’une activité. Ils portent des noms et des adresses de contacts, donc une lecture non jointe croiserait des personnes entre espaces.',
  },
  contact_lifecycle_transitions: {
    category: 'scoped',
    by: 'parent',
    parent: 'contacts',
    column: 'contact_id',
    reason:
      'L’historique de cycle de vie d’un contact. Sans la jointure, on lirait les changements d’état des contacts d’un autre espace.',
  },
  contact_merges: {
    category: 'scoped',
    by: 'parent',
    parent: 'accounts',
    column: 'account_id',
    reason:
      'La trace d’une fusion de doublons. Elle ne porte que des identifiants (`winner_id`, `loser_id`), jamais de donnée de contact.',
  },
  outreach_sequence_steps: {
    category: 'scoped',
    by: 'parent',
    parent: 'outreach_sequences',
    column: 'sequence_id',
    reason: 'Les étapes d’une séquence. Elles portent des gabarits de message, donc du contenu rédigé par un espace.',
  },
  // #3756 — les étapes d'un modèle de la bibliothèque de campagnes.
  sequence_template_steps: {
    category: 'scoped',
    by: 'parent',
    parent: 'sequence_templates',
    column: 'template_id',
    reason: 'Les étapes d’un modèle de campagne : objet et corps rédigés par un espace, jamais lus hors de lui.',
  },
  shortlist_entries: {
    category: 'scoped',
    by: 'parent',
    parent: 'shortlists',
    column: 'shortlist_id',
    reason:
      'Les profils retenus d’une shortlist. ⚠️ Aucune garde ne la voyait avant le 29/08 : elle partage son fichier d’entité avec `shortlists`, qui porte `workspace_id`, et GA-16 lisait le FICHIER. Elle porte le nom des consultants qu’une ESN a proposés — exactement ce qu’une ESN ne montre pas à une autre. ⚠️ Le `workspace_id` de son parent est NULLABLE : une shortlist héritée du mono-espace n’est bornée que par `IS NULL`.',
  },
  qualification_criteria: {
    category: 'scoped',
    by: 'parent',
    parent: 'qualification_grids',
    column: 'grid_id',
    reason:
      '#3755 — les critères d’une version de la grille de qualification d’un espace : sa façon de dire GO / NO-GO, propre à lui. Ils appartiennent à leur grille, qui porte `workspace_id`.',
  },
  match_run_entries: {
    category: 'scoped',
    by: 'parent',
    parent: 'match_runs',
    column: 'run_id',
    reason:
      'Le détail par profil d’une exécution de matching. Invisible pour GA-16 pour la même raison que `shortlist_entries` : elle est la deuxième des trois entités de `match-run.entity.ts`. Elle porte `consultant_id` ET `need_id`, donc quel talent a été classé sur quel besoin de quel client. ⚠️ Le `workspace_id` de son parent est NULLABLE.',
  },

  /* ───────────── Faits de MARCHÉ : les mêmes pour tout le monde ───────────── */

  territory_snapshots: {
    category: 'shared',
    audience: 'market',
    reason:
      'La photo d’un département à une date (tome 4 §21.3) : le nombre d’offres IT en Haute-Garonne est le même pour tout le monde. Par espace, la moyenne du score de débordement repartirait de zéro chez chaque nouveau client alors que la donnée existe déjà. L’ABONNEMENT, lui, est scopé (`territory_subscriptions`).',
  },
  esn_directory: {
    category: 'shared',
    audience: 'market',
    reason:
      'Référentiel ESN mutualisé (tome 4, D62) : du registre public, enrichi une fois et servi à tous. C’est l’exception NOMMÉE par le tome 7 §23.1 — celle qui a rendu ce registre nécessaire. La RELATION, elle, vit dans `partner_relations`, qui est scopée.',
  },
  // #3916.a (lot M03, 09/10/2026) — les registres publics lus EN CONTINU.
  public_registry_announcements: {
    category: 'shared',
    audience: 'market',
    reason:
      'Les annonces d’un registre public (BODACC, ouvertures d’établissement Sirene), rattachées au SIREN. Même fait pour tous les espaces — le stocker par espace multiplierait la même annonce par client. Ce qu’un espace SUIT reste dans `accounts`, scopée : la table ne dit jamais QUI regarde une société.',
  },
  // #4067 (lot DECOUVRIR-COLLECTE, Louis 13/10) — le cache des faits publics.
  source_cache: {
    category: 'shared',
    audience: 'market',
    reason:
      'Les faits PUBLICS par entreprise (offres d’emploi, actualités, annonces légales, appels d’offres, registre), rangés par SIREN sinon domaine, et les réponses brutes des sources publiques : le même fait pour tous les espaces — « que ce soit pas des crédits foutus en l’air ». Créée par le service IA (`source_cache.py`) ; RLS sans politique, une famille privée refusée en SQL (`SourceCachePublicFactsBoundary`). Jamais une donnée d’espace (CRM, notes, documents, missions, corrections, listes) : la clé est l’entreprise, jamais QUI regarde.',
  },
  public_registry_watch_state: {
    category: 'shared',
    audience: 'market',
    reason:
      'Jusqu’où chaque SIREN a été lu au registre public, et quand. Même raison que `public_registry_announcements` : c’est l’état d’une lecture de registre, pas l’opinion d’un espace.',
  },
  // #3921.a / #3921.b (lot M03, 09/10/2026) — le relevé Sirene du jour.
  sirene_snapshots: {
    category: 'shared',
    audience: 'market',
    reason:
      'Le relevé Sirene d’un SIREN, une ligne par jour : établissements (pour en tirer les ouvertures) et tranche d’effectif MESURÉE (pour qu’une hausse repose sur deux points). Registre public, le même pour tous les espaces ; ce qu’un espace suit reste dans `accounts`, scopée.',
  },
  market_company_signal: {
    category: 'shared',
    audience: 'market',
    reason:
      'La mémoire marché Bellum, agrégat par ENTREPRISE : combien de parcours y ont été observés, quelles familles de rôles, quel environnement technique, quelles sociétés de services gravitent autour. C’est un fait de MARCHÉ — le même pour tous les espaces — et le stocker par espace multiplierait 60 000 lignes identiques par client. Ce qu’un espace pense d’un compte (sa relation, ses faits d’accès, ses corrections) reste dans `accounts` et `access_facts`, qui sont scopées, et une correction d’espace PRIME sur l’observation partagée sans jamais la réécrire.',
  },
  market_esn_client: {
    category: 'shared',
    audience: 'market',
    reason:
      'Les couples société de services × client OBSERVÉS par les parcours. Partagé pour la même raison que `esn_directory` : c’est du fait de marché, pas l’opinion d’un espace. ⚠️ Ce n’est pas l’agrégation que GA-43 interdit — un lien observé entre deux organisations est un fait d’organisation, jamais un prix ni une commission.',
  },
  market_v2_rows: {
    category: 'shared',
    audience: 'market',
    reason:
      'Lot 783 (#5205, Louis 03/11/2026) — les 139 tables du pack marché v2.1 (DataForge V4→V12, ORION, freelances, Master Marché, CRM interne Belloum) en BASE COMMUNE, une ligne CSV par ligne, cellules NON pii en `data jsonb`. Fait de marché le même pour tous les espaces ; aucune donnée d’un espace client n’y entre. Écrite par l’importeur opérateur seul (`ingest:market-v2`) ; RLS activée sans politique.',
  },
  market_v2_row_identities: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Lot 783 (#5205, Louis 03/11/2026) — le COFFRE des cellules `pii=1` du pack v2.1 (identités importées brutes, décision Louis), séparées physiquement de `market_v2_rows`. AUCUN espace ne la lit, ni l’écran ni le modèle (décision 02/11) : seul l’importeur la nomme (garde `market-v2-pii-never-read.spec.ts`). RLS activée sans politique.',
  },
  market_v2_datasets: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Lot 783 (#5205) — le registre de chargement du pack v2.1 : une ligne par (version = sha256 de MANIFEST.csv, table source) chargée, avec ses volumes. Plomberie d’import (rejeu idempotent, reprise), à personne.',
  },
  common_account_links: {
    category: 'shared',
    audience: 'market',
    reason:
      'Lot 793 (Louis 04/11/2026) — le référentiel PIVOT des identifiants d’entreprise de la base commune : une clé de résolution normalisée (SIREN, domaine racine, nom ou alias) → une entreprise commune (BM-A du pack v2.1, fiche DF, racine de groupe). Fait de marché, le même pour tous les espaces ; aucun compte d’espace n’y est stocké (il se résout à la lecture, filtré par l’espace). Écrite par le script opérateur seul (`ingest:common-account-links`) ; RLS activée sans politique.',
  },
  market_person_paths: {
    category: 'shared',
    audience: 'market',
    reason:
      'Lot 775 (Louis 02/11/2026) — les PARCOURS individuels observés (poste, dates, statut, compétences, TJM, lieu de mission), SANS identifiant direct et sous un pseudonyme HMAC salé. Fait de marché, le même pour tous les espaces : le stocker par espace multiplierait les mêmes lignes par client. Aucune lecture hors `MarketMemoryService` (GA-258) ; RLS activée sans politique.',
  },
  market_company_stack: {
    category: 'shared',
    audience: 'market',
    reason:
      'Les technologies citées par les parcours passés par une entreprise, seuil de deux personnes. Fait de marché, jamais présenté comme la stack officielle du compte.',
  },
  market_memory_ground_truth_judgments: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Les jugements de vérité terrain sur la mémoire marché (#1622) : un opérateur regarde ce que le corpus dit d’un couple compte/ESN et tranche si la lecture est utile, plausible, trompeuse, hors sujet, sur la mauvaise entité, ou indécidable. Ce n’est ni un fait de marché ni une donnée d’espace — c’est un avis d’OPÉRATEUR sur la qualité de notre propre corpus, la même nature que les tables du back-office. Aucun espace client ne la lit, et elle ne porte aucune identité de personne observée : le compte, l’ESN, la lecture qui était affichée, le verdict, et qui a jugé.',
  },
  /**
   * #1617.4 — L'EXCEPTION SCOPÉE au milieu des six tables `market_*`.
   *
   * Ses sœurs sont `shared` : un fait de marché est le même pour tous, et le
   * stocker par espace multiplierait 60 067 lignes par client. Celle-ci porte
   * l'inverse — ce qu'UN espace a DÉCIDÉ d'un rapprochement sur SON compte.
   * Les espaces sont des ESN, donc des concurrents : la correction de l'un ne
   * devient jamais la vérité de l'autre, et elle ne réécrit pas le corpus, qui
   * reste en lecture seule pour tout le produit. C'est exactement ce que la
   * raison de `market_company_signal` annonçait déjà : « une correction
   * d'espace PRIME sur l'observation partagée sans jamais la réécrire ».
   */
  market_company_resolution_override: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'La décision d’un humain sur le rapprochement entre UN de ses comptes et une entreprise du corpus (#1617.4) : « c’est bien cette entreprise » ou « ce n’est pas exact ». Scopée parce qu’elle porte un `account_id` d’un espace et l’identité de qui a tranché — jamais un fait de marché. Elle se SUPERPOSE à la lecture (`applyResolutionOverride`) et n’écrit rien dans les tables partagées.',
  },
  market_company_alias: {
    category: 'shared',
    audience: 'market',
    reason:
      'Le rapprochement entre une raison sociale et une entreprise du corpus (#1756) : « SG SOCIETE GENERALE » → « societe generale ». C’est un fait de MARCHÉ, le même pour tous les espaces, et la même raison que `market_company_signal`. Elle ne porte ni identité, ni relation, ni opinion d’espace — rien qu’une équivalence de nom et sa provenance ; ce qu’un espace pense d’un compte reste dans `accounts`.',
  },
  market_ex_esn_at_client: {
    category: 'shared',
    audience: 'market',
    reason:
      'Les personnes passées par une société de services et aujourd’hui chez un client, en COMPTAGE seul — aucune identité, aucune coordonnée. C’est ce qui rend le partage tenable : la table ne porte que des nombres agrégés par couple d’organisations.',
  },
  dataforge_accounts: {
    category: 'shared',
    audience: 'market',
    reason:
      'Staging du pack DATAFORGE V10 (plan du 24/08) : 1 195 grands comptes du MARCHÉ français, les mêmes pour tous les espaces. Ce qui appartient à un espace — le compte suivi, ses faits d’accès, sa relation — vit dans `accounts` et `access_facts`, qui sont scopées.',
  },
  dataforge_account_domains: {
    category: 'shared',
    audience: 'market',
    reason:
      'Les 78 870 lignes compte × domaine du même pack : des priors de marché (97,5 % en Tier D), identiques pour tous. Les lire par espace multiplierait 345 Mo de donnée par client pour un contenu identique.',
  },
  dataforge_account_statuses: {
    category: 'shared',
    audience: 'market',
    reason:
      'Statut de sales-readiness ORION V12 (successeur de DATAFORGE V10, même espace de clés DF-XXXX) : le même statut_code/pénétrabilité pour les 1 195 comptes du marché français, quel que soit l’espace qui consulte.',
  },
  dataforge_data_anomalies: {
    category: 'shared',
    audience: 'market',
    reason:
      'Le registre qualité ORION V12 (20 anomalies dont 6 critiques) : un défaut du RÉFÉRENTIEL, identique pour tous les espaces — pas un fait propre à un client.',
  },
  dataforge_needs: {
    category: 'shared',
    audience: 'market',
    reason:
      'Les besoins historiques du référentiel (#4281.1, ORION V12 24_MISSIONS_BESOINS / 25_PIPELINE_CRM) : qui a acheté quelle compétence, quand, à quel TJM, par quel prescripteur — un fait de MARCHÉ, le même pour tous les espaces (base commune, décision Louis 19/10 n°18). Aucune donnée d’un espace client n’y entre.',
  },
  dataforge_rag_chunks: {
    category: 'shared',
    audience: 'market',
    reason:
      'Les 3 849 chunks indexables ORION V12 : du texte de marché prêt à vectoriser, le même pour tous les espaces. `account_id` scope la PERTINENCE d’un chunk (et est NULL pour les alertes qualité globales), jamais son appartenance à un espace. Depuis #3586 il porte aussi la connaissance produit du Drive interne Bellum (`type_chunk = DRIVE_INTERNE`, e-mails et téléphones masqués avant indexation, chunks archivés — jamais supprimés — quand le fichier change ou sort du dossier).',
  },
  internal_knowledge_files: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Journal de la synchro du Drive interne Bellum (#3586) : un fichier vu, son statut (indexé / ignoré / en erreur / archivé), sa date. Plomberie de l’éditeur pour le panneau du back-office — aucun espace ne la lit, et elle ne contient aucune donnée d’un client.',
  },
  internal_knowledge_digests: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Le digest du Drive interne Bellum (#3586, lot W2) : une synthèse de méthode ESN, de taxonomie et de ton, sans personne ni coordonnée, que le service IA préfixe au system prompt des surfaces commerciales. Une ligne courante, les anciennes archivées. Écrite par l’éditeur, jamais par un espace, et identique pour tous.',
  },
  internal_knowledge_sync_state: {
    category: 'shared',
    audience: 'operator',
    reason:
      'L’état de la synchro du Drive interne Bellum (#3586) : le jeton de page `changes.list` et le résultat du dernier passage. Une ligne, plomberie de l’éditeur, jamais lue par un espace.',
  },

  /* ───────────── Plomberie de l'éditeur : à personne, et c'est le but ───────────── */

  plan_definitions: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Le catalogue des offres commerciales. Il est le même pour tous par définition : le rendre scopé permettrait à un espace d’avoir sa propre grille tarifaire, ce qui est exactement ce que la facturation ne doit pas laisser arriver.',
  },
  outreach_approved_templates: {
    category: 'shared',
    audience: 'operator',
    reason:
      '#3417 (retour bêta 30/09) — la bibliothèque versionnée des scripts et messages approuvés. Même raison que `plan_definitions` : un catalogue de référence, le même pour tous par définition — le scoper permettrait à un espace de posséder sa propre version d’un modèle approuvé, ce que la promesse « approuvé » interdit précisément.',
  },
  onboarding_stage_definitions: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Les étapes du parcours d’accueil, identiques pour tous. L’AVANCEMENT, lui, est personnel (`user_onboarding_state`, qui porte un `user_id`).',
  },
  banners: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Les bandeaux d’annonce produit, posés par l’éditeur pour toute la plateforme. Aucun contenu client n’y entre — c’est ce qui rend le partage sans risque.',
  },
  stripe_events: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Le journal d’idempotence des webhooks Stripe, clé par identifiant d’événement. Il est reçu AVANT de savoir quel espace est concerné : le scoper supposerait de résoudre l’espace pour pouvoir dédoublonner, ce qui inverse l’ordre des opérations.',
  },
  outbox: {
    category: 'shared',
    audience: 'operator',
    reason:
      'La file de sortie transactionnelle. Elle porte le message à émettre, pas le droit de le lire : l’espace vit dans la CHARGE de chaque ligne, et c’est le consommateur qui le résout. La scoper ferait croire qu’elle arbitre un accès, ce qu’elle ne fait pas.',
  },
  oauth_clients: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Les clients OAuth enregistrés dynamiquement par le serveur MCP (RFC 7591). Un client est un LOGICIEL, pas un espace : c’est le jeton délivré ensuite qui porte l’utilisateur et son espace, et lui seul décide de ce qui est lisible.',
  },
  business_metric_snapshots: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Les instantanés mensuels des chiffres de BELLUM — MRR, mouvements, clients (#1645). Ils ne décrivent AUCUN espace : ils décrivent l’éditeur. Les y scoper reviendrait à demander « le MRR de BellumAI, vu par quel client ? », qui n’a pas de réponse. Leur seule porte est `internal/admin/*`, et aucun espace ne les lit.',
  },
  business_metric_snapshot_lines: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Ce qu’UN abonné payait le mois où la photo a été prise (#1645) — la seule chose qui permette de distinguer « nouveau » d’« expansion » le mois suivant. Sa colonne `subject_id` est l’utilisateur FACTURÉ, donc un sujet de facturation de l’éditeur, pas une portée de lecture : personne ne lit cette table depuis un espace, y compris le sien.',
  },
  business_treasury_months: {
    category: 'shared',
    audience: 'operator',
    reason:
      'La trésorerie de BellumAI saisie à la main (#1649) — solde, dépenses, encaissements, d’où sortent le burn et le runway. C’est le compte en banque de l’éditeur ; aucune ESN n’en a une vue, même partielle.',
  },
  demo_leads: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Les prospects captés par le formulaire obligatoire du lien de démo public (#2705) — prénom, nom, e-mail professionnel, fonction, entreprise, téléphone facultatif, UTM. Un prospect n’appartient à AUCUN espace de travail et n’a jamais de `user_id` : il n’a pas de compte, seulement une adresse à recontacter. La ligne sert le back-office (#2706, statut « Démo lancée ») et l’alerte au premier accès (#2707) — jamais l’application cliente, et jamais la salle de démo que ce visiteur va ouvrir (aucune donnée du formulaire n’y entre, voir `demo-coverage.ts`).',
  },
  backoffice_access_events: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Le journal d’ACCÈS du back-office (#1671.2) — qui est entré, quand, depuis quelle IP et quel navigateur. Il ne porte AUCUNE donnée de client : ni compte consulté, ni contact, ni contenu, seulement des opérateurs et leurs entrées. Il est délibérément hors périmètre d’espace, et pour la même raison que le journal d’incarnation : un espace ne doit ni pouvoir effacer la trace de ce qu’un administrateur a fait, ni savoir qu’elle existe. Sa colonne `actor_email` est une colonne d’AUTEUR, pas une portée. Distinct du journal d’ACTIONS (#1666) : deux questions, deux rétentions.',
  },
  backoffice_audit_events: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Le journal d’AUDIT unique du back-office (#1666) — qui a fait quoi, sur quoi, quand, depuis où, avec quel résultat, toutes opérations de la console confondues. C’est la plomberie de l’ÉDITEUR : aucun espace ne le lit, et surtout aucun espace ne doit pouvoir effacer la trace de ce qu’un administrateur y a fait ni savoir qu’elle existe — la même raison que pour `impersonation_audit` et `backoffice_access_events`. Ses colonnes `actor_email` et `subject_id` sont des colonnes d’AUTEUR et de SUJET, pas des portées : `subject_id` désigne souvent un utilisateur ou un espace, mais il dit de QUOI parle la ligne, jamais qui a le droit de la lire. Rétentions différenciées par catégorie (24 mois / 36 mois / permanent), appliquées par `AuditJournalRetentionService`.',
  },
  impersonation_audit: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Le journal des prises d’identité par le back-office. Il est délibérément hors périmètre d’espace : un espace ne doit pas pouvoir effacer la trace de ce qu’un administrateur y a fait, ni même savoir qu’elle existe. Sa colonne `target_user_id` est une colonne d’AUTEUR, pas une portée.',
  },
  analysis_tool_call_trace: {
    category: 'shared',
    audience: 'operator',
    reason:
      'La trace des outils appelés par UN run du pipeline d’analyse (Brave, Firecrawl, Apollo, Pappers, chaque prompt Claude), préalable au rejeu sans envoi ni débit (#2905, #2442.16) — écrite par `apps/ia/app/services/analysis_tool_trace.py`, une ligne par fournisseur, la MÊME donnée que `run_metrics.get_metrics` calcule déjà en mémoire. C’est la plomberie de l’ÉDITEUR : aucun espace ne la lit, aucun écran ne l’affiche. Sa colonne `account_id` est une colonne de SUJET (de QUOI parle la ligne), pas une portée — nullable, la phase de recherche d’une entreprise pas encore compte n’en a pas ; `company_name` retrouve alors le run par son nom.',
  },
  llm_routing_eval_declarations: {
    category: 'shared',
    audience: 'operator',
    reason:
      'La déclaration « cette destination de routage fournisseur a été réévaluée » (#2975, #2440.82) — une ligne par destination (`provider` ou `provider:model`), écrite depuis `POST /config/model-routing/evals` (console d’opérations, `apps/ia/app/services/provider_eval_declarations.py`) plutôt que par une variable d’env posée au déploiement (chemin conservé, les deux sont fusionnés par `provider_evals.eval_status_by_task`). C’est la plomberie de l’ÉDITEUR : aucun espace ne la lit, aucun écran client ne l’affiche — fournisseurs et modèles ne se nomment jamais côté produit. Une redéclaration CORRIGE sa ligne (auteur, note, horodatage), jamais un historique.',
  },
  laura_unrouted_intents: {
    category: 'shared',
    audience: 'operator',
    reason:
      'La trace ANONYME des demandes que Laura n’a pas su router (#1949.23, décision Louis 13/09 batch 12, contre la recommandation — migration `1792800190000-LauraUnroutedIntents`). Aucune colonne de portée, et c’est la décision même : ni `user_id` ni `workspace_id`, un texte masqué et tronqué, un JOUR sans heure. `workspace_day_hash` n’est PAS une portée — un hash d’(espace, jour) tourné à 24 h, qui ne sert qu’à compter des occurrences distinctes, et qu’aucun espace ne peut relire. Seul le back-office opérateur la lit, AGRÉGÉE, au-dessus du plancher de 5 occurrences distinctes ; aucun espace client n’y a accès. Purgée à 90 jours par le balayage RGPD.',
  },
  enrichment_duration_samples: {
    category: 'shared',
    audience: 'market',
    reason:
      'La durée RÉELLE d’un enrichissement (#2120.57 / #2297.23, migration `1789816319703-EnrichmentDurationSamples`) — volontairement ANONYME : ni `workspace_id`, ni `user_id`, ni `contact_id`. Une latence du PRODUIT, jamais une donnée d’espace (doctrine `c64_analytique_produit`) : la médiane agrège TOUS les espaces sans rien révéler d’aucun d’entre eux. `audience: market` plutôt que `operator` — contrairement à `laura_unrouted_intents`, elle n’est pas réservée au back-office : `GET /contacts/enrichment-duration-estimate` la lit pour CHAQUE espace client, exactement comme un fait de marché que tout le monde consulte.',
  },
  shared_action_outcome_aggregates: {
    category: 'shared',
    audience: 'market',
    reason:
      'P05.a — issues déclarées des actions par cadence / route / priorité, coupées par division NAF et catégorie INSEE. La base anonyme COMMUNE entre espaces (P05, #3246 — renversement de doctrine daté du 09/10/2026, `c92_base_anonyme_commune`, migration `1796437902401-SharedAnonymousBase`). Des AGRÉGATS, jamais une ligne brute : ni `workspace_id`, ni identifiant de compte, de contact ou de personne, ni nom, ni texte libre — chaque colonne texte est un jeton fermé, et un CHECK refuse toute cellule portée par moins de trois espaces (GA-43). Écrite par le job nocturne `SharedBaseAggregationService` (seul écrivain, via `poolSharedCells`), lue par CHAQUE espace client à travers Laura — `audience: market`, comme un fait de marché que tout le monde consulte. `scope = demo` isole la salle de démonstration du réel.',
  },
  shared_case_outcome_aggregates: {
    category: 'shared',
    audience: 'market',
    reason:
      'P05.b — cas gagnés / perdus par secteur, taille, position de groupe. La base anonyme COMMUNE entre espaces (P05, #3246 — renversement de doctrine daté du 09/10/2026, `c92_base_anonyme_commune`, migration `1796437902401-SharedAnonymousBase`). Des AGRÉGATS, jamais une ligne brute : ni `workspace_id`, ni identifiant de compte, de contact ou de personne, ni nom, ni texte libre — chaque colonne texte est un jeton fermé, et un CHECK refuse toute cellule portée par moins de trois espaces (GA-43). Écrite par le job nocturne `SharedBaseAggregationService` (seul écrivain, via `poolSharedCells`), lue par CHAQUE espace client à travers Laura — `audience: market`, comme un fait de marché que tout le monde consulte. `scope = demo` isole la salle de démonstration du réel.',
  },
  shared_signal_deal_aggregates: {
    category: 'shared',
    audience: 'market',
    reason:
      'P05.c — un type de signal suivi d’une affaire ouverte sous 90 jours. La base anonyme COMMUNE entre espaces (P05, #3246 — renversement de doctrine daté du 09/10/2026, `c92_base_anonyme_commune`, migration `1796437902401-SharedAnonymousBase`). Des AGRÉGATS, jamais une ligne brute : ni `workspace_id`, ni identifiant de compte, de contact ou de personne, ni nom, ni texte libre — chaque colonne texte est un jeton fermé, et un CHECK refuse toute cellule portée par moins de trois espaces (GA-43). Écrite par le job nocturne `SharedBaseAggregationService` (seul écrivain, via `poolSharedCells`), lue par CHAQUE espace client à travers Laura — `audience: market`, comme un fait de marché que tout le monde consulte. `scope = demo` isole la salle de démonstration du réel.',
  },
  shared_message_learning_aggregates: {
    category: 'shared',
    audience: 'market',
    reason:
      '#2877 (#2385.5, niveau GLOBAL — Louis 11/10/2026, « sers-toi d’un max de data possible et juste anonymise au besoin ») — les signaux d’apprentissage des messages (validé tel quel / après édition / rejeté, envoyé / réponse / rebond, faux fait / CTA / persona déclarés) mutualisés entre espaces. Des AGRÉGATS en jetons fermés, jamais une ligne brute ni un CORPS de message : ni `workspace_id`, ni identifiant de message, de contact ou de personne ; un CHECK refuse toute cellule portée par moins de trois espaces (GA-43). Écrite par le job nocturne `SharedBaseAggregationService` (via `poolSharedCells`), lue par le service IA à la génération de chaque message, pour chaque espace — `audience: market`.',
  },
  shared_market_pattern_aggregates: {
    category: 'shared',
    audience: 'market',
    reason:
      '#4286.15.c (décision Louis 22/10/2026, `c127_market_pattern_tendances_entre_espaces`, migration `1796574700000-SharedMarketPatternAggregates`) — les TENDANCES de marché entre espaces : des recrutements repérés, comptés par famille de métier (domaines du référentiel de compétences), division NAF, catégorie INSEE et région. Des AGRÉGATS sur jetons fermés, jamais une ligne brute ni un intitulé d’offre : ni `workspace_id`, ni identifiant de compte, ni nom, ni coût, prix ou TJM ; un CHECK refuse toute cellule portée par moins de trois espaces (GA-43, GA-416). Écrite par le job nocturne `SharedBaseAggregationService` (via `poolSharedCells`), lue par CHAQUE espace à travers Laura (`get_account_signals`, clé `marketPatterns`) — `audience: market`. `scope = demo` isole la salle de démonstration du réel.',
  },
  shared_company_people: {
    category: 'shared',
    audience: 'market',
    reason:
      '#3989 (suite de #3971 d) — les faits société PARTAGÉS par la base commune (élargissement daté de c92, Louis 11/10/2026, `c94_base_commune_capitalise_tout`). Ce que BELLUM a collecté (registre, recherche publique, nos analyses) y entre TEL QUEL — nom, poste, profil public ; ce qu’un UTILISATEUR a apporté (saisie, import, CRM, réunion) y entre ANONYMISÉ — le poste seul, ni nom ni profil ni empreinte, et un CHECK (`shared_company_people_user_anonymized_check`) refuse l’inverse (GA-43). Aucune colonne de portée : jamais le nom de l’espace qui a collecté. La société est un jeton (SIREN ou domaine). Écrite par le job nocturne `SharedCompanyFactsService` (seul écrivain, via `toSharedPersonFact`), recopiée dans un espace qui analyse la même société (source `shared_base`, « base commune »), purgée par l’effacement RGPD d’une personne (c67, empreintes `person_fingerprints`).',
  },
  // #4051 (lot V8-DÉCISIONS) — pas d'entité TypeORM : `record-import-marks.ts` l'écrit et `ProvenanceService` la
  // lit en SQL.
  record_import_marks: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      '#4051 — « Importé le <date> depuis <source> » sur une fiche : la fiche (type, id), le NOM du fichier déposé ou de l’outil branché du client, la date. Une lecture non bornée à l’espace montrerait le nom de fichier d’un autre espace. Chaque requête porte `workspace_id`.',
  },
  crm_webhook_events: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      '#4189.7 (décision Louis 15/10/2026) — l’idempotence des webhooks entrants HubSpot / Salesforce : l’identifiant d’événement, l’espace, la date. Aucune donnée du CRM. Écrite par `CrmWebhooksService` après vérification de la signature.',
  },
  shared_person_coordinates: {
    category: 'shared',
    audience: 'market',
    reason:
      '#3989.7 (décision Louis 15/10/2026) — une coordonnée PRO (e-mail, téléphone) trouvée par Bellum dans un espace est RÉUTILISÉE dans un nouvel espace, la donnée seule. Une ligne par fait NOMMÉ de `shared_company_people` (FK `ON DELETE CASCADE` : l’effacement RGPD c67 l’emporte). Aucune colonne d’espace, de note, de statut, de coût ni de fournisseur (GA-43). Écrite par le job nocturne via `toSharedCoordinates` ; lue à la recopie (source `shared_base`).',
  },
  shared_person_erasures: {
    category: 'shared',
    audience: 'operator',
    reason:
      '#3989 — l’effacement RGPD (c67, #2297) PROPAGÉ à la base commune : une personne effacée dans un espace l’est aussi de `shared_company_people` et de toutes les copies qu’en ont reçues les autres espaces. Ce qui reste : des EMPREINTES HMAC (clé `PERSON_ERASURE_HMAC_KEY`, portée « base commune ») et une date — aucune donnée de la personne, aucun espace. Elles empêchent sa RECOLLECTE vers la base commune. Aucun espace ne la lit : seuls l’effacement et le job nocturne la consultent.',
  },
  chat_turn_cost_samples: {
    category: 'shared',
    audience: 'market',
    reason:
      'Le coût et la durée RÉELS d’un tour de Laura, PAR PALIER (fast/deep) (#2448.8 / #2882.11, migration `1796405100123-ChatTurnCostSamples`) — volontairement ANONYME : ni `workspace_id`, ni `user_id`. Une latence et un coût du PRODUIT, jamais une donnée d’espace (doctrine `c64_analytique_produit`) : la médiane par palier agrège TOUS les espaces sans rien révéler d’aucun. `audience: market` comme `enrichment_duration_samples` : `GET ia/chat/mode-estimate` la lit pour CHAQUE espace client.',
  },

  /* ───────────── Sans entité TypeORM : déclarées d'après leur migration ───────────── */

  chat_generic_judgements: {
    category: 'shared',
    audience: 'operator',
    reason:
      'Le verdict du juge « recommandation générique » sur une réponse de Laura tirée dans l’échantillon quotidien (#3223, décision Louis 11/10/2026, migration `1796438109661-ChatGenericJudgements`). Ni `workspace_id`, ni `user_id`, ni texte : un jeton fermé et l’empreinte du juge, rattachés au message par sa clé (cascade à sa suppression). Seul le back-office opérateur la lit, AGRÉGÉE tous espaces confondus (`/produit/raisonnement`) ; aucun espace client n’y a accès (doctrine `c64_analytique_produit`).',
  },

  access_fact_questions: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'Les questions d’accès posées à un espace sur un compte (migration `1789994210583-CommunityAccessFacts`). Elle PORTE `workspace_id`, mais aucune entité TypeORM ne la décrit : rien ne pouvait le déduire, donc c’est écrit. Ses deux seules lectures la bornent (`account-access.service.ts`).',
  },
  action_dispatch_attempts: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'La RÉCLAMATION d’un dispatch du routeur d’actions : la clé d’idempotence fournie par l’appelant, posée AVANT tout effet, pour qu’un double clic ou un rejeu après timeout ne produise qu’un seul envoi (migration `1790958812345-ActionDispatchIdempotency`, D520, n4). PORTE `workspace_id`, sans entité TypeORM (raw SQL, comme `sprint_switches` ci-dessous) : rien ne pouvait le déduire. Son unicité est posée par la BASE, jamais par une lecture applicative avant écriture — deux requêtes concurrentes passeraient toutes les deux.',
  },
  sprint_switches: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'La trace d’une bascule automatique du board d’effort — quel évènement (réponse positive, rendez-vous obtenu…) a fait bouger un compte, et vers quel niveau (migration `1790900000001-SprintSwitchLog`, tome 5 §28-31, m8). PORTE `workspace_id`, sans entité TypeORM (raw SQL, comme `access_fact_questions` ci-dessus) : rien ne pouvait le déduire. Sa seule écriture la borne (`SprintsService.applyEvent`).',
  },
  proactivity_counters: {
    category: 'scoped',
    by: 'user_column',
    reason:
      'Le compteur d’envois proactifs par utilisateur et par JOUR LOCAL (migration `1789781294638-ProactivityCap`). Sans entité : la portée est la clé unique `(user_id, local_day)`, et les deux requêtes de `notifications.service.ts` la portent.',
  },
  user_contact_favorites: {
    category: 'scoped',
    by: 'user_column',
    reason:
      'Les contacts mis en favori, clé primaire `(user_id, contact_id)` (migration `1783700000001`). ⚠️ Plus AUCUN lecteur dans l’API : le favori générique l’a remplacée (`user_favorites`, D10). Elle reste déclarée parce qu’elle existe encore en base — une table qu’on ne classe plus parce qu’on ne l’appelle plus est exactement celle qu’une requête d’administration relira un jour.',
  },
  skill_alias_library: {
    category: 'shared',
    audience: 'market',
    reason:
      'La bibliothèque d’alias de compétences mutualisée (migration `1789900000003-SharedSkillAliases`). Ce qui voyage est un couple de TERMES techniques et rien d’autre : ni l’espace d’origine, ni un profil, ni un client — du vocabulaire de métier, ce qui rend le partage tenable. Elle est rendue en SUGGESTION, jamais appliquée (`skill-alias.service.ts`).',
  },
  esn_subcontracting_declarations: {
    category: 'scoped',
    by: 'workspace_column',
    reason:
      'La déclaration d’UN espace sur l’ouverture au rang 2 d’une ESN (migration `1790900000008-EsnSubcontractingDeclarations`, N16). Elle PORTE `workspace_id`, mais aucune entité TypeORM ne la décrit — `EsnDirectoryService` y écrit en SQL brut, comme `territory-watch.service.ts` le fait déjà pour `hiring_90d`. ⚠️ `esn_directory`, elle, reste `shared` : ce n’est pas la même donnée. Ce que dit UN espace sur un concurrent n’est pas un fait de marché — c’est son opinion, datée. Seul l’AGRÉGAT (≥ `COMMUNITY_THRESHOLD` espaces distincts, sans divergence, `subcontractingAggregate()`) est promu dans les colonnes partagées `esn_directory.open_to_subcontracting` et voisines ; en dessous du seuil, la déclaration reste ici et n’est lue par aucun autre espace. Ce n’est pas non plus l’agrégation que GA-43 interdit : « accepte-t-elle le rang 2 » est un fait d’ORGANISATION d’un tiers (famille `lock` / `mode` / `path`), jamais un prix ou une commission (`cost`).',
  },
  config_overrides: {
    category: 'to-classify',
    question:
      "Sa colonne `scope` vaut `'global'` par défaut et RIEN ne la lit — la table n’a aucun appelant dans l’API depuis sa création (migration `1783500000000`). La ranger `shared` affirmerait qu’aucun espace n’y écrira jamais ; la ranger `scoped` inventerait une portée que personne n’a posée. La question à trancher : `scope` est-il destiné à porter un identifiant d’espace, ou est-ce un réglage d’éditeur qui devrait alors s’appeler autrement ?",
  },
}

/**
 * Les noms de table que les migrations créent puis retirent.
 *
 * Sans cette liste, la garde exigerait de classer des tables qui n'existent
 * plus — et le remède naturel serait d'inventer une entrée, donc de mentir.
 */
export const RETIRED_TABLES: Record<string, string> = {
  user_credits:
    'Renommée `subscriptions` par la migration `1780000000001-RenameUserCreditsToSubscriptions` : l’ancien nom décrivait un solde, la table décrit un abonnement. C’est `subscriptions` qui est classée (portée déduite de son `user_id`).',
}
