import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { LauraContextMode } from '@bellum/contracts'

/**
 * A workspace = an ESN team. Several members (commercials) share the team's
 * accounts, analyses and knowledge base. `owner_user_id` is the billing/admin
 * user. Seeded one-per-user by migration 1784000000000; team scoping of the
 * data tables lands in Phase 2. See `agent_docs/multi-user-workspaces.md`.
 */
@Entity({ name: 'workspaces' })
export class WorkspaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('text', { default: 'Mon espace' })
  name: string

  /* ────────────────────────────────────────────────────────────────────────
   * LA MARQUE DE L'ESPACE — marque blanche, palier P2 (01/09/2026)
   * ────────────────────────────────────────────────────────────────────────
   * Tout est NULLABLE, et `NULL` ne veut pas dire « vide » : il veut dire
   * « la marque du produit ». Le repli vit dans `resolveBrand()`
   * (`@bellum/contracts`), UN seul endroit — poser un défaut SQL figerait
   * notre propre nom dans la base de chaque client.
   *
   * ⚠️ Ces colonnes ne portent NI hiérarchie, NI facturation déléguée. Un
   * espace reste un espace : la revente à deux niveaux demanderait un
   * `parent_workspace_id` et la reprise de toutes les portées.
   */

  /** Le nom du produit tel que ce client le montre aux siens. */
  @Column('text', { nullable: true })
  brand_name: string | null

  /** Le logo affiché à la place du nôtre. */
  @Column('text', { nullable: true })
  brand_logo_url: string | null

  /** L'accent — hexadécimal six chiffres minuscules, tenu par un CHECK SQL. */
  @Column('text', { nullable: true })
  brand_accent: string | null

  /**
   * Le nom du copilote.
   *
   * ⚠️ Renommer NE défait pas la mécanique : une seule porte, une seule
   * conversation, et la mention « produit par un système d'IA » reste
   * obligatoire. Ce champ porte un NOM, pas une permission.
   */
  @Column('text', { nullable: true })
  copilot_name: string | null

  /**
   * Le domaine sur lequel ce client sert l'application.
   *
   * ⚠️ UNIQUE et en minuscules (index partiel + CHECK) : il sert à résoudre le
   * TENANT depuis l'en-tête `Host`, et une résolution ambiguë de tenant est
   * une fuite entre clients, pas un défaut d'affichage.
   */
  @Column('text', { nullable: true })
  custom_domain: string | null

  /** L'expéditeur des e-mails transactionnels de cet espace. */
  @Column('text', { nullable: true })
  brand_email_from: string | null

  /**
   * Théo D settings-espace.N5 — la signature que l'espace propose en fin de document (≤ 600 caractères). NULL = aucune :
   * le document n'en porte pas, rien n'est inventé. Migration `1796574800005-WorkspaceDocumentIdentity`.
   */
  @Column('text', { nullable: true })
  document_signature: string | null

  /** Le pied de document répété en bas de chaque page d'un dossier (≤ 300 caractères). NULL = aucun. */
  @Column('text', { nullable: true })
  document_footer: string | null

  /**
   * Target market (country) driving this workspace's runs: data sources, default
   * locale and legal basis. Stored as a 2-letter code (`FR`/`CH`/`BE`/`LU`/`US`/`CA`); `FR`
   * is the default and the strictly-unchanged French path. A non-FR market
   * propagates as the `country` param the IA country packs expect. Validated at
   * the API boundary (`workspaceMarketSchema`); see migration 1785810000000 and
   * the country packs in `apps/ia/app/services/country_packs`.
   */
  @Column('text', { default: 'FR' })
  market: string

  /**
   * #2451.9 — LE MODE DE CONTEXTE PAR DÉFAUT DE L'ESPACE (RÉGLAGE, PAS UNE
   * RÈGLE — voir `WorkspaceDefaultContextModeResolution`, `@bellum/contracts`).
   * Un fil neuf sans choix explicite retombe sur cette valeur plutôt que sur
   * la constante figée `DEFAULT_LAURA_CONTEXT_MODE` ; `'my_activity'` est le
   * comportement d'avant ce lot, au bit près. Contrainte CHECK en base
   * (migration `1796000665432-WorkspaceDefaultContextMode`), pas ici : le
   * décorateur TypeORM ne pose pas de CHECK, la porte est la validation Zod.
   */
  @Column('text', { default: 'my_activity' })
  default_context_mode: LauraContextMode

  /**
   * #2899 / #2443.10 — L'ÉCHANTILLONNAGE DE CONVERSATIONS POUR LES ÉVALS, opt-in par espace.
   * Un réglage vit à un seul endroit (GA-26) : ici, et nulle part en variable d'environnement.
   * Migration `1796443917261`. ALLUMÉ par défaut depuis #4173 (migration `1796530329276`,
   * revirement assumé 3 jours après la décision du 11/10/2026) — SAUF un espace où un
   * propriétaire ou administrateur a déjà tranché, voir `chat_eval_sampling_chosen_at`.
   */
  @Column('boolean', { default: true })
  chat_eval_sampling_enabled: boolean

  /**
   * #4173 — QUAND ce réglage a été choisi EXPLICITEMENT la dernière fois (`PATCH`), jamais
   * posé par une migration. `NULL` = jamais touché par un humain : c'est la SEULE ligne qui
   * distingue « défaut jamais remis en cause » de « explicitement décoché » — sans elle, un
   * futur bascule de défaut écraserait un refus humain. Migration `1796530329276`.
   */
  @Column('timestamptz', { nullable: true })
  chat_eval_sampling_chosen_at: Date | null

  /**
   * Pays de FACTURATION — celui qui paie, jamais celui qu'on prospecte.
   *
   * Une colonne à part de {@link market} justement parce que les deux se
   * confondent facilement et qu'une confusion ici facturerait en dollars une ESN
   * française qui prospecte les États-Unis. `NULL` = jamais renseigné, ce qui
   * ramène à l'euro.
   */
  @Column('text', { nullable: true })
  billing_country: string | null

  /**
   * Devise réellement facturée, écrite au PREMIER paiement — puis figée.
   *
   * Ce n'est pas une préférence mais un verrou : Stripe n'autorise pas à changer
   * la devise d'un abonnement existant (il faut l'annuler et en recréer un).
   * Tant que c'est `NULL`, rien n'a été facturé et le choix reste ouvert.
   */
  @Column('text', { nullable: true })
  billing_currency: string | null

  @Index()
  @Column('uuid')
  owner_user_id: string

  /**
   * Demo mode (C1 Théo). A demo workspace never debits credits (short-circuit in
   * CreditsService), cannot launch REAL analyses (the start button replays the
   * seeded golden dossiers instead) and shows a permanent « Mode démo » banner in
   * the web app. Seeded data is fictional-by-design and confined to this
   * workspace — never mixed with real prospect data. Migration 1785950000000;
   * created only via the admin backoffice (`POST /internal/admin/workspaces/demo`).
   */
  @Column('boolean', { default: false })
  is_demo: boolean

  /**
   * Pool de démo (migration 1788250000000) — numéro de SALLE (1..N) quand ce
   * workspace est une salle du lien partagé. NULL partout ailleurs. Plusieurs
   * visiteurs peuvent présenter en même temps : chacun loue sa salle, avec son
   * propre utilisateur, donc personne ne voit le fil de personne.
   */
  @Column('integer', { nullable: true })
  demo_slot_index: number | null

  /** Début du bail courant. NULL = salle jamais louée. Une salle dont le bail a
   *  expiré (`DEMO_LEASE_TTL_MINUTES`) est remise à neuf AVANT d'être relouée —
   *  jamais pendant que quelqu'un est dedans. */
  @Column('timestamptz', { nullable: true })
  demo_leased_at: Date | null

  /** Cookie `bellum_did` du navigateur qui occupe la salle : un rechargement de
   *  page retrouve SA salle au lieu d'en consommer (et d'en effacer) une autre. */
  @Column('text', { nullable: true })
  demo_lease_device: string | null

  /**
   * Empreinte du semis posée par `DemoSeedService.seedWorkspace` (#3135,
   * migration 1796322780000, GA-372) : le SHA de build qui a écrit les
   * dossiers de cette salle (ou un hash de contenu en repli, voir
   * `demo-seed-fingerprint.ts`). `DemoResetService` la compare à l'empreinte
   * courante à CHAQUE bail — une salle complète mais PÉRIMÉE est purgée et
   * re-semée, là où seule une salle INCOMPLÈTE l'était jusqu'ici. `NULL` =
   * salle semée avant ce correctif, lue comme périmée par construction.
   */
  @Column('text', { nullable: true })
  demo_seed_fingerprint: string | null

  /**
   * #3806 (migration 1796437500001) — la salle a été servie EN SECOURS à
   * l'ancienne empreinte (aucune salle à jour n'était prête), à cette date.
   * Tant que ce bail-là court, elle n'est jamais re-semée sous son visiteur ;
   * le balayage la remet à neuf à la fin du bail. Remis à NULL à la location
   * normale suivante. NULL partout ailleurs.
   */
  @Column('timestamptz', { nullable: true })
  demo_stale_served_at: Date | null

  /**
   * Qui voit quels comptes (décision D5). `open` = tout le portefeuille de
   * l'équipe, le comportement historique et le défaut ; `restricted` = chaque
   * commercial voit le sien et les comptes libres, les responsables voient tout.
   *
   * Une valeur en dur plutôt que `nullable` : le cloisonnement décide de ce que
   * quelqu'un VOIT, et un `NULL` interprété à la lecture finirait par être lu
   * différemment par les quatre écrans qui listent des comptes.
   */
  @Column('text', { default: 'open' })
  portfolio_visibility: string

  /**
   * L'opt-in de la donnée communautaire (tome 2 §5.3), **décoché par défaut**.
   *
   * Activé, l'espace fait remonter ses déclarations d'accessibilité — et il
   * consomme celles des autres dès que trois espaces distincts les confirment.
   * Éteint, il ne remonte rien et ne consomme rien : c'est la réciprocité, et
   * c'est ce qui rend le mécanisme légitime.
   */
  @Column('boolean', { default: false })
  community_data_sharing: boolean

  /**
   * Réglages d'approbation de l'Action OS (addendum final p25). NULL = « suit le
   * défaut produit » — et non « zéro » : un espace existant n'a pas besoin d'être
   * rétro-rempli, et un changement du défaut le suit automatiquement.
   */
  @Column('text', { nullable: true })
  approval_default_level: string | null

  /** Au-delà de ce nombre de cibles, un run passe en validation manager. */
  @Column('integer', { nullable: true })
  approval_bulk_threshold: number | null

  /** Au-delà de ce coût en crédits, un run passe en validation manager. */
  @Column('integer', { nullable: true })
  approval_spend_threshold: number | null

  // ── Colonnes créées par migration et longtemps NON déclarées ici (GA-36) ──
  // Toutes étaient lues/écrites en SQL brut (`manager.query`) parce que
  // l'entité ne les connaissait pas. Les déclarer ne change aucun comportement ;
  // ça rend le drift impossible à reproduire sans casser la garde.

  /** Règle d'anonymisation des dossiers de compétences (PDF 3). */
  @Column('text', { default: 'nom_complet' })
  anonymisation_rule: string

  /** Sections masquées dans un dossier anonymisé. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  anonymisation_hide: string[]

  /** Masquer les coordonnées des talents aux rôles commerciaux (PDF 3). */
  @Column('boolean', { default: false })
  hide_talent_contacts_from_sales: boolean

  /** #2333.9 — QUI doit valider une version de CV avant usage : personne (la
   *  génération vaut validation), le consultant, ou un recruteur. Même patron
   *  que `anonymisation_rule` (migration `1795999506893-CvVersionValidation`). */
  @Column('text', { default: 'aucune' })
  cv_validation_policy: string

  /** Purge RGPD du vivier : interrupteur + fenêtre en mois. */
  @Column('boolean', { default: false })
  talent_retention_enabled: boolean

  @Column('integer', { default: 24 })
  talent_retention_months: number

  /** Seuil d'alerte de marge (PDF 5). NULL = alerte éteinte, jamais 0. */
  @Column('numeric', { nullable: true })
  margin_alert_threshold_percent: string | null

  /** L3 Pilotage — seuil d'alerte TACE (1-100). NULL = rien saisi = AUCUNE alerte, jamais 0. */
  @Column('numeric', { nullable: true })
  tace_alert_threshold_percent: string | null

  /** D21 — annoncer un TJM dans un message client. Éteint par défaut : un tarif
   *  annoncé au premier message devient un plafond. */
  @Column('boolean', { default: false })
  show_rate_in_client_message: boolean

  /**
   * #2195.8 — les fenêtres de renouvellement de cet espace, en JOURS
   * (migration `1795200000002`). La colonne existait sans être déclarée ici,
   * ce que GA-36 refuse : une colonne qu'aucune entité ne nomme est invisible
   * au code qui la lit.
   *
   * ⚠️ `NULL` = cet espace n'a rien réglé, et la valeur se lit alors dans le
   * contrat (`DEFAULT_RENEWAL_WINDOW_DAYS`) — jamais recopiée ici, sinon le
   * réglage vivrait à deux endroits (GA-26).
   */
  @Column('jsonb', { nullable: true })
  renewal_window_days: number[] | null

  /**
   * #1958.2 — LE FUSEAU DE L'ESPACE, nom IANA ou `NULL` (migration
   * `1795205000000-WorkspaceTimezone`). `NULL` = cet espace n'a rien réglé —
   * jamais UTC, jamais une devinette depuis {@link market} (le marché dit QUI
   * on prospecte, le fuseau dit QUAND on travaille).
   *
   * Lu par `resolve_applicable_timezone` (`apps/ia/app/prompts/current_time.py`)
   * en DERNIER recours avant le défaut produit nommé — personne → rendez-vous
   * → espace → défaut produit (GA-26, une seule dérivation).
   */
  @Column('varchar', { length: 64, nullable: true })
  timezone: string | null

  /**
   * #2957 (#2179.2/.35) — LES SECTIONS DE NAVIGATION MASQUÉES par un admin de
   * cet espace (migration `1796350312161-WorkspaceHiddenSections`). `[]` = rien
   * de masqué — jamais `NULL` : une navigation qui lit ce tableau n'a pas à
   * distinguer « pas encore réglé » de « rien masqué », les deux se comportent
   * pareil. Les valeurs sont validées à la frontière API
   * (`maskableWorkspaceSectionSchema`) — cette colonne ne fait pas confiance à
   * son propre contenu au-delà du type SQL.
   */
  @Column('text', { array: true, default: '{}' })
  hidden_sections: string[]

  /**
   * #4158.57 (migration `1796560255919-WorkspacePersonalMerge`) — l'espace personnel RAPATRIÉ dans un
   * espace ESN est ARCHIVÉ, jamais supprimé : ses lignes d'origine restent lisibles. NULL = espace vivant.
   */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  /** #4158.57 — l'espace où ses comptes et contacts ont été recopiés. NULL = jamais rapatrié. */
  @Column('uuid', { nullable: true })
  merged_into_workspace_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
