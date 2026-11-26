import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { MissionStatus, RenewalClientRail, RenewalConsultantRail, RenewalStatus } from '@bellum/contracts'
/** `numeric` revient en chaîne depuis pg : sans ce transformateur, une marge se
 *  calculerait sur des chaînes et rendrait « 600420 » au lieu de 30 %. */
const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
}

/**
 * Une mission — l'objet qui referme la boucle du produit (addendum final p71).
 *
 * `opportunity_id` n'est pas décoratif : c'est le seul lien qui permette de dire
 * « ce besoin détecté en mars est devenu cette mission en juin ». Sans lui, le
 * produit ne peut jamais prouver qu'il a servi à quelque chose.
 *
 * `daily_rate` et `daily_cost` sont nullables SÉPARÉMENT, et la marge n'est
 * calculée que quand les deux existent. Supposer un coût moyen produirait une
 * marge fausse — plus dangereuse qu'une marge absente, parce qu'elle fait
 * renoncer à une mission rentable ou accepter une mission à perte.
 */
@Entity({ name: 'missions' })
@Index(['workspace_id', 'status'])
export class MissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  account_id: string

  @Column('uuid', { nullable: true })
  opportunity_id: string | null

  /**
   * #3413 « autre BU » (migration `1796421837419`) — la BU PROPRIÉTAIRE posée par
   * un TRANSFERT explicite. `NULL` = la mission suit la BU de son compte (aucun
   * transfert n'a eu lieu) — ce n'est pas « sans BU ». Le journal du transfert
   * vit dans `record_field_audit`, pas ici.
   */
  @Column('uuid', { nullable: true })
  business_unit_id: string | null

  /**
   * #2195.33 — L'AFFAIRE QUI RENOUVELLE CETTE MISSION (migration
   * `1795200000003`, décision de Louis du 16/09/2026).
   *
   * Distincte de `opportunity_id`, et la distinction est le point : celle-ci
   * nomme l'affaire qui a PRODUIT la mission, celle-là l'affaire NEUVE qui
   * cherche à la prolonger. Les écraser l'une sur l'autre ferait perdre d'où
   * la mission vient dès le premier renouvellement.
   *
   * ⚠️ `NULL` n'est PAS « pas de renouvellement prévu » : c'est « aucune
   * affaire de renouvellement n'a été ouverte ». Le renouvellement se DÉCIDE
   * ailleurs (`renewal_status`) ; cette colonne dit seulement qu'une affaire
   * a été créée pour le porter au pipe.
   */
  @Column('uuid', { nullable: true })
  renewal_opportunity_id: string | null

  /**
   * Le RÔLE d'origine — le besoin que cette mission a pourvu (migration
   * `1791001000001`, arbitrage du 31/08/2026).
   *
   * `opportunity_id` désigne l'AFFAIRE, et une affaire porte souvent plusieurs
   * rôles : sans cette colonne, « combien de missions sont nées de ce besoin »
   * n'avait aucune réponse honnête, et le bandeau Staffing d'une fiche besoin
   * affichait « non mesuré » pour toujours.
   *
   * ⚠️ `NULL` n'est PAS « aucune mission » : c'est « le rôle d'origine n'est pas
   * connu ». Trois populations le portent — les missions créées avant ce lien,
   * celles d'une affaire à plusieurs rôles (le geste `create_mission` ne
   * remplit le lien que si la réponse est CERTAINE), et celles créées à la main
   * sans qu'on désigne de besoin. L'écran distingue les deux phrases.
   */
  @Column('uuid', { nullable: true })
  need_id: string | null

  /**
   * La société de l'ESN qui porte cette mission et facturera le mois (D9).
   *
   * `null` est le cas ORDINAIRE : un espace mono-société n'a déclaré aucune
   * entité, et ses missions n'en portent aucune. Inventer une entité par défaut
   * ferait apparaître une raison sociale sur des documents où personne ne l'a
   * mise.
   */
  @Column('uuid', { nullable: true })
  legal_entity_id: string | null

  @Column('text')
  label: string

  @Index()
  @Column('text')
  status: MissionStatus

  @Column('date', { nullable: true })
  started_on: string | null

  /** Fin PRÉVUE — c'est elle qui déclenche les fenêtres J-60 / J-30. */
  @Index()
  @Column('date', { nullable: true })
  ends_on: string | null

  /**
   * #2414 (LAU-FINAL-128) / épopée #2986 — le motif TYPÉ de fin (8 valeurs,
   * `MISSION_END_REASONS`). N'écrase pas le motif libre historique lu par
   * `account-missions.service.ts` (`endReasonsOf`, `record_field_audit`) : les
   * deux coexistent, écrit par `MissionEndService.setEndReason`.
   */
  @Column('text', { nullable: true })
  end_reason: string | null

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  daily_rate: number | null

  @Column('numeric', { nullable: true, transformer: numericTransformer })
  daily_cost: number | null

  /** Quand la mission est entrée dans son statut ACTUEL. Distincte de
   *  `updated_at`, qui bouge à chaque modification de TJM : sans elle, aucune
   *  alerte de séjour n'est calculable. */
  @Column('timestamptz', { default: () => 'now()' })
  stage_entered_at: Date

  /** régie | forfait | recrutement | inconnu. Au forfait, le relevé d'activité
   *  n'est pas requis et la facturation s'appuie sur des jalons (D35). */
  @Column('text', { default: 'regie' })
  contract_kind: string

  /** #3547 — `staffed` (défaut historique) | `supervised` : le FORFAIT ENCADRÉ,
   *  réalisé par les salariés du client, où les consultants sont facultatifs.
   *  N'existe qu'au forfait (CHECK croisé, migration `1796424913577`). */
  @Column('text', { default: 'staffed' })
  delivery_mode: string

  /** #3547 — framing | supervision | both. `NULL` = non dit, jamais « cadrage ». */
  @Column('text', { nullable: true })
  supervision_role: string | null

  /** #3547 — l'équipe côté client, par un NOMBRE… `NULL` = non renseignée (jamais 0). */
  @Column('integer', { nullable: true })
  client_team_size: number | null

  /** #3547 — …ou par des NOMS. `{}` = non renseignés. */
  @Column('text', { array: true, default: () => "'{}'" })
  client_team_names: string[]

  /** Le rôle CHERCHÉ, distinct du nom de la mission. Les confondre affiche
   *  « Refonte du SI paiement » là où le recruteur cherche « Architecte ». */
  @Column('text', { nullable: true })
  role_title: string | null

  /**
   * #2191.17 — REPRIS de `project_needs.remote` au handoff (migration
   * `1796000703962`). `sur_site | hybride | full_remote | indifferent`,
   * mêmes quatre valeurs que `consultants.remote_preference` (GA-26). `null` =
   * non repris, jamais un défaut `sur_site`.
   */
  @Column('text', { nullable: true })
  remote_preference: string | null

  /**
   * #2191.18 — REPRIS de `project_needs.location` au handoff (même migration
   * que juste au-dessus). Texte libre, comme sa source : `null` = non repris.
   */
  @Column('text', { nullable: true })
  location: string | null

  /** #2953 (#2193.17) — CE QUE CETTE MISSION DOIT PRODUIRE, saisi sur la
   *  fiche : aucune source ne le porte au handoff, contrairement à
   *  `location`/`remote_preference` juste au-dessus. `null` = non renseigné. */
  @Column('text', { nullable: true })
  objective: string | null

  /** #2953 (#2193.18) — LE PÉRIMÈTRE de la mission, saisi sur la fiche. À ne
   *  pas confondre avec `account_partners.scope` (le périmètre d'une AUTRE
   *  société chez ce client). `null` = non renseigné. */
  @Column('text', { nullable: true })
  perimeter: string | null

  /** À qui la facture part. `null` = un bloqueur, pas un détail. */
  @Column('uuid', { nullable: true })
  billing_contact_id: string | null

  /** Le PORTEUR, distinct du créateur (`user_id`) : c'est lui qu'on alerte. */
  @Column('uuid', { nullable: true })
  owner_id: string | null

  /**
   * #4158.34 — objet PRIVÉ : visible de son porteur (`owner_id`) et de qui gère
   * l'équipe, d'aucun autre membre (il ne fait alors AUCUNE ligne sur la fiche
   * Contact). Défaut `false` = partagé avec l'espace.
   */
  @Column('boolean', { default: false })
  is_private: boolean

  /** #2320.21 — l'accord DÉCLARÉ du CLIENT. `null` = jamais déclaré, jamais
   *  deviné. Contrainte SQL `mission_client_agreement_date_check` (migration
   *  `1796321346104`). Distinct de `consultant_agreement` juste en dessous :
   *  deux rails, pas un. */
  @Column('boolean', { nullable: true })
  client_agreement: boolean | null

  @Column('date', { nullable: true })
  client_agreement_date: string | null

  /** #2320.21 — l'accord DÉCLARÉ du CONSULTANT à cette mission précise. */
  @Column('boolean', { nullable: true })
  consultant_agreement: boolean | null

  @Column('date', { nullable: true })
  consultant_agreement_date: string | null

  /**
   * #2195.22 à .29 — OÙ EN EST LA RECONDUCTION, saisi par un humain.
   *
   * ⚠️ À ne pas confondre avec `status`, juste au-dessus : celui-là est l'état de
   * la MISSION (en cours, terminée…), celui-ci celui de sa reconduction. Les
   * deux vivent sur la même ligne et ne se recouvrent pas — une mission en cours
   * peut être déjà `fin_confirmee`, et c'est justement l'information qui manquait.
   *
   * `null` n'est PAS `non_engage` : `null` veut dire « personne n'a encore ouvert
   * cette ligne », `non_engage` veut dire « quelqu'un l'a ouverte et a constaté
   * que rien n'était engagé ». L'écran les rend différemment.
   *
   * Migration `1795100000001`, contrainte `missions_renewal_status_check`
   * (les huit valeurs de `RENEWAL_STATUSES`, gelées — GA-08 / GA-12).
   */
  @Column('text', { nullable: true })
  renewal_status: RenewalStatus | null

  /** QUAND le statut a été posé. Sans elle, « Feedback demandé » ne dit pas
   *  depuis combien de temps on attend — or c'est ce qui décide s'il faut
   *  relancer. C'est aussi ce qui permet de rendre « information du 3 mars, à
   *  revérifier » plutôt que de laisser un fait périmé passer pour un fait. */
  @Column('timestamptz', { nullable: true })
  renewal_status_at: Date | null

  /** QUI l'a posé. `null` sur les lignes d'avant ce lot, et c'est honnête :
   *  personne ne peut le deviner rétroactivement. */
  @Column('uuid', { nullable: true })
  renewal_status_by: string | null

  /**
   * #2413.49 à .52 — LE RAIL CLIENT (migration `1796321339583`).
   *
   * `jsonb`, forme portée par `renewalClientRailSchema` (`@bellum/contracts`) —
   * jamais une contrainte SQL (patron `outbound_write_requests.source`). `null`
   * = ce rail n'a jamais été ouvert, à distinguer de la valeur `non_demande`
   * DANS le rail (intent jamais posé) : `null` veut dire qu'aucune des quatre
   * questions n'a été posée, le rail ouvert avec `intent: 'non_demande'` veut
   * dire qu'on a ouvert la conversation sans encore de réponse fermée.
   */
  @Column('jsonb', { nullable: true })
  renewal_client_rail: RenewalClientRail | null

  /**
   * #2413.53 à .56 — LE RAIL CONSULTANT, symétrique du rail client.
   *
   * ⚠️ Distinct de la disponibilité PLANNING du vivier (`availabilityFrom`,
   * web) : celle-là se calcule depuis la date de fin et `renewal_status` pour
   * tout le vivier, celle-ci est la réponse SAISIE à la question posée dans LA
   * conversation de renouvellement de CETTE mission.
   */
  @Column('jsonb', { nullable: true })
  renewal_consultant_rail: RenewalConsultantRail | null

  /**
   * Celui qui VALIDE le relevé, côté client — distinct de `billing_contact_id`
   * (à qui la facture part). `null` = non désigné, l'état normal en début de
   * mission. Migration `1790981000001`.
   */
  @Column('uuid', { nullable: true })
  cra_contact_id: string | null

  /**
   * #2836 — le MANAGER CLIENT : le contact, chez le client, qui encadre le
   * consultant. Distinct du contact CRA (qui valide) et du chargé d'affaires
   * (`owner_id`, le nôtre). `null` = non désigné. Migration `1796001525994`.
   */
  @Column('uuid', { nullable: true })
  client_manager_contact_id: string | null

  /**
   * Le contexte HÉRITÉ du projet à la conversion (addendum Stelya §9.1).
   *
   * `inherited_from_project_at` dit QUAND la copie a eu lieu — donc si ce qu'on
   * lit vient du projet ou d'une correction humaine postérieure. Une correction
   * de la mission ne réécrit JAMAIS le projet : le projet dit ce qui a été
   * vendu, la mission ce qui est délivré, et les deux peuvent diverger sans que
   * l'un efface l'autre.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  application_sector_codes: string[]

  @Column('text', { nullable: true })
  primary_domain_code: string | null

  @Column('timestamptz', { nullable: true })
  inherited_from_project_at: Date | null

  /** Le SITE (table `sites`) où la mission se délivre. Ajouté en base par
   *  `1789531284416` mais jamais déclaré ici — colonne restée 100 % morte
   *  (aucun lecteur, aucun écrivain) pendant des semaines. NULL = site non dit,
   *  jamais deviné depuis le siège du compte. */
  @Column('uuid', { nullable: true })
  site_id: string | null

  /**
   * #2561/#2562 — le deal CRM (`crm_deal_facts`) correspondant à cette
   * mission, migration `1795660000000`. Même forme que `need_id` ci-dessus,
   * même raison : une RÉFÉRENCE, jamais devinée. `null` = « pas de
   * correspondance connue », le cas ordinaire — aucun CRM connecté, un CRM
   * connecté hors des quatre fournisseurs à contrat vérifié, ou une mission
   * née avant que ce lien existe.
   */
  @Index()
  @Column('uuid', { nullable: true })
  crm_deal_id: string | null

  /**
   * #2339.7 (épopée #2795) — le POSITIONNEMENT retenu dont cette mission est
   * la CONVERSION (migration `1796321999852`). Même forme que `crm_deal_id`
   * juste au-dessus : une RÉFÉRENCE, jamais devinée. `null` = pas de
   * positionnement connu — mission saisie à la main ou reprise CRM.
   */
  @Index()
  @Column('uuid', { nullable: true })
  submission_id: string | null

  /**
   * #2561/#2562 — la VENTE Odoo (`sale.order`, son identifiant Odoo) dont
   * cette mission est la REPRISE (migration `1796437218463`). Lue en direct
   * chez le client, jamais stockée ici : seule la référence l'est. Index
   * UNIQUE partiel `(workspace_id, odoo_sale_order_id)` : une vente ne devient
   * qu'UNE mission par espace, même sous deux clics simultanés. `null` =
   * mission saisie à la main ou venue d'ailleurs.
   */
  @Column('bigint', { nullable: true, transformer: numericTransformer })
  odoo_sale_order_id: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
