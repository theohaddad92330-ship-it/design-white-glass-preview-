/**
 * Le registre des interrupteurs d'arrêt (« break-glass ») — et LE seul endroit
 * du dépôt qui lise leurs variables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL CORRIGE (D169 · 29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un interrupteur existe pour couper une capacité en incident, vite. C'est bien.
 * Le défaut est qu'une fois coupée, **personne ne le sait** : le balayage ne
 * tourne plus, l'écran a l'air normal, et un interrupteur qu'on oublie
 * d'éteindre devient indistinguable d'un produit qui n'a jamais su faire.
 * Mesuré le 30/08 : sur les quinze interrupteurs de l'API, **six ne laissaient
 * aucune trace** (pas même une ligne de journal), et **un seul** était lisible
 * sur une route HTTP.
 *
 * ⚠️ Un interrupteur ÉTEINT n'est PAS une panne : il a été éteint exprès. Ce
 * registre dit « cette capacité est coupée », jamais « une erreur s'est
 * produite ». Et il ne dit rien du cas « sans clé = no-op strict », qui est un
 * chemin NORMAL et non un interrupteur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE PUBLIE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le nom de la variable vit ICI — il faut bien lire quelque chose — et il ne
 * SORT jamais. Ce qui s'affiche est l'ÉTAT d'une CAPACITÉ. Un écran opérateur
 * qui listerait des noms de variables serait un défaut plus grave que celui
 * qu'on corrige : il apprend à lire une configuration d'infrastructure dans une
 * interface, et la prochaine variable listée portera un secret. Gardé par
 * **GA-85**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS FAÇONS DE LIRE, ET POURQUOI ON LES A RECOPIÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt lit ces variables de trois manières, et chacune était délibérée à son
 * site d'origine :
 *
 *   `exact`      `raw === 'true'` — douze interrupteurs. Le docblock des alertes
 *                d'observabilité écrit la raison : « volontairement strict sur
 *                la valeur — `yes` n'éteint rien, parce qu'un garde-fou éteint
 *                par une faute de frappe ne se remarque pas ».
 *   `trim-lower` `raw.trim().toLowerCase() === 'true'` — synchro CRM, routines.
 *   `lower`      `String(raw ?? '').toLowerCase() === 'true'` — purge RGPD.
 *
 * Les recopier plutôt que les unifier est ce qui permet d'adopter ce registre
 * **sans changer un seul comportement de production**. Que trois conventions
 * cohabitent est en soi une décision à trancher : elle est parquée en **D240**,
 * pas résolue en passant. ⚠️ Le moteur IA, lui, a une QUATRIÈME convention
 * (`1/true/yes/on`, `kill_switch.py`) — c'est la même décision.
 */

/** Les deux process qui portent des interrupteurs. */
type KillSwitchService = 'api' | 'ia'

/**
 * Qui a besoin de savoir.
 *
 * `operator` — l'exploitant seul. Couper le balayage de rétention regarde qui
 * tient la plateforme ; l'annoncer à un commercial l'inquiéterait sans rien lui
 * permettre de faire.
 * `user` — l'exploitant ET l'utilisateur, parce que sans le dire le produit
 * MENT : un écran continue d'annoncer une capacité armée pendant qu'elle est
 * coupée. Cette colonne ne CRÉE aucune surface client à elle seule — elle dit
 * lesquelles en méritent une, et le tracker dit lesquelles sont livrées.
 */
type KillSwitchAudience = 'operator' | 'user'

/** La comparaison EXACTE du site d'origine — voir le docblock du fichier. */
type KillSwitchMatch = 'exact' | 'trim-lower' | 'lower'

/**
 * L'état d'une capacité.
 *
 * ⚠️ `unknown` n'est pas un habillage : le moteur IA vit dans un autre process,
 * et quand il ne répond pas, on ne SAIT PAS si ses capacités tournent. Dire
 * « actif » serait le « non mesuré affiché zéro » transposé à une panne.
 */
type KillSwitchState = 'active' | 'cut' | 'unknown'

type KillSwitchDefinition = {
  /** Identifiant STABLE de la capacité. Jamais le nom d'une variable. */
  readonly id: string
  readonly service: KillSwitchService
  /** Ce que la capacité EST, côté produit. */
  readonly labelFr: string
  readonly labelEn: string
  /** Ce qui s'arrête quand l'interrupteur est posé. */
  readonly cutsFr: string
  readonly cutsEn: string
  readonly audience: KillSwitchAudience
  /**
   * Le nom de la variable. INTERNE : il sert à lire, il ne se sérialise pas.
   * Vide pour les capacités du moteur IA — l'API ne lit pas son environnement,
   * elle lui DEMANDE son état.
   */
  readonly envVar: string
  readonly match: KillSwitchMatch
}

/** La lecture, recopiée du site d'origine. Rien d'autre ne lit ces variables. */
export function readKillSwitch(sw: KillSwitchDefinition): boolean {
  const raw = process.env[sw.envVar]
  switch (sw.match) {
    case 'exact':
      return raw === 'true'
    case 'trim-lower':
      return (raw ?? '').trim().toLowerCase() === 'true'
    case 'lower':
      return String(raw ?? '').toLowerCase() === 'true'
  }
}

/**
 * Les interrupteurs portés par l'API — dix-neuf depuis le 07/09/2026 (la
 * rétention du journal d'audit du back-office, #1666), dix-huit le même jour
 * (l'instantané mensuel des chiffres, #1645), dix-sept depuis le 02/09/2026 (la
 * surveillance des contrats sur facture), seize depuis le 31/08/2026, quinze
 * avant lui (le stockage de fichiers a apporté sa purge de rétention).
 *
 * ⚠️ Le NOMBRE ne se recopie pas d'un commentaire : il se lit ici, et GA-84 le
 * balaie dans le code. « Un total est un argument » — celui de `CLAUDE.md`
 * était déjà périmé une fois, de dix unités.
 *
 * ⚠️ Cette liste ne rétrécit pas en silence : retirer une entrée demande que
 * l'interrupteur ait DISPARU du code, pas qu'on ait cessé de vouloir
 * l'expliquer. GA-84 refuse toute lecture non déclarée ici.
 */
export const API_KILL_SWITCHES: readonly KillSwitchDefinition[] = [
  {
    id: 'accounts.partners_backfill',
    service: 'api',
    labelFr: 'Reprise des partenaires détectés',
    labelEn: 'Detected-partner backfill',
    cutsFr: 'Les dossiers analysés AVANT cette reprise ne gagnent jamais leur liste de partenaires détectés.',
    cutsEn: 'Accounts analysed before this backfill never gain their detected-partner list.',
    audience: 'operator',
    envVar: 'PARTNERS_BACKFILL_DISABLED',
    match: 'exact',
  },
  {
    // #AF (18/09/2026) — le rattrapage ciblé par segment (#2543 : couverture
    // des contacts). ⚠️ À la différence de `accounts.partners_backfill`
    // ci-dessus, RIEN ne déclenche ce rattrapage automatiquement — ni boot, ni
    // routine planifiée. Cet interrupteur n'est donc pas « le geste d'urgence
    // qui arrête une reprise en cours » au sens habituel : c'est le
    // coupe-circuit qui garantit qu'un appel explicite (opérateur, script) ne
    // peut RIEN exécuter tant qu'il est posé — la dernière digue si le
    // ciblage se trompait un jour.
    id: 'accounts.contacts_segment_catchup',
    service: 'api',
    labelFr: 'Rattrapage ciblé — segment contacts',
    labelEn: 'Targeted catch-up — contacts segment',
    cutsFr:
      'Le rejeu ciblé de la collecte de contacts (#2543) sur les comptes analysés avant le correctif. Rien ne se déclenche seul de toute façon — cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The targeted contacts-collection re-run (#2543) on accounts analysed before the fix. Nothing triggers it on its own anyway — this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'CONTACTS_SEGMENT_CATCHUP_DISABLED',
    match: 'exact',
  },
  {
    // #2543.7 (18/09/2026) — même famille que `accounts.contacts_segment_catchup`
    // ci-dessus, un interrupteur PAR SEGMENT (jamais un seul pour les quatre) :
    // couper le rattrapage du segment signaux ne doit jamais couper celui des
    // entités ou de la stratégie — « ciblé, par segment » est aussi une promesse
    // d'isolation entre interrupteurs.
    id: 'accounts.signals_segment_catchup',
    service: 'api',
    labelFr: 'Rattrapage ciblé — segment signaux',
    labelEn: 'Targeted catch-up — signals segment',
    cutsFr:
      'Le rejeu ciblé de la recherche (Phase 1) sur les comptes analysés avant une future capacité datée sur ce segment. Rien ne se déclenche seul de toute façon — cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The targeted research (Phase 1) re-run on accounts analysed before a future dated capability on this segment. Nothing triggers it on its own anyway — this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'SIGNALS_SEGMENT_CATCHUP_DISABLED',
    match: 'exact',
  },
  {
    id: 'accounts.entities_segment_catchup',
    service: 'api',
    labelFr: 'Rattrapage ciblé — segment entités',
    labelEn: 'Targeted catch-up — entities segment',
    cutsFr:
      'Le rejeu ciblé de l’organigramme (Phase 3) sur les comptes analysés avant une future capacité datée sur ce segment. Rien ne se déclenche seul de toute façon — cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The targeted org-chart (Phase 3) re-run on accounts analysed before a future dated capability on this segment. Nothing triggers it on its own anyway — this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'ENTITIES_SEGMENT_CATCHUP_DISABLED',
    match: 'exact',
  },
  {
    id: 'accounts.strategy_segment_catchup',
    service: 'api',
    labelFr: 'Rattrapage ciblé — segment stratégie',
    labelEn: 'Targeted catch-up — strategy segment',
    cutsFr:
      'Le rejeu ciblé du plan (Phase 4) sur les comptes analysés avant une future capacité datée sur ce segment. Rien ne se déclenche seul de toute façon — cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The targeted plan (Phase 4) re-run on accounts analysed before a future dated capability on this segment. Nothing triggers it on its own anyway — this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'STRATEGY_SEGMENT_CATCHUP_DISABLED',
    match: 'exact',
  },
  {
    // #2118.51 (18/09/2026) — même famille, CINQUIÈME segment : la lecture du
    // dossier en sept axes (#2118). Interrupteur PROPRE, isolé de
    // `accounts.strategy_segment_catchup` — une future capacité sur l'angle
    // stratégique ne doit jamais couper le rattrapage de cette lecture-ci, et
    // réciproquement.
    id: 'accounts.dossier_read_segment_catchup',
    service: 'api',
    labelFr: 'Rattrapage ciblé — lecture en sept axes',
    labelEn: 'Targeted catch-up — seven-axis reading',
    cutsFr:
      'Le rejeu ciblé de la lecture du dossier en sept axes (#2118) sur les comptes analysés avant sa mise en production. Rien ne se déclenche seul de toute façon — cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The targeted seven-axis dossier reading (#2118) re-run on accounts analysed before it shipped. Nothing triggers it on its own anyway — this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'DOSSIER_READ_SEGMENT_CATCHUP_DISABLED',
    match: 'exact',
  },
  {
    // #2298.4 (19/09/2026, lot I3) — même famille, SIXIÈME segment : l'axe
    // RELATION de l'adressabilité. Interrupteur PROPRE, isolé des cinq autres
    // — couper CE rattrapage ne doit jamais couper les autres, et
    // réciproquement. Ce chemin est déjà GRATUIT (aucun crédit, aucun appel
    // sortant) : l'interrupteur reste le seul frein si le ciblage se trompait
    // un jour sur le volume de comptes concernés.
    id: 'accounts.access_relation_segment_catchup',
    service: 'api',
    labelFr: 'Rattrapage ciblé — axe relation (gratuit)',
    labelEn: 'Targeted catch-up — relation axis (free)',
    cutsFr:
      'Le rejeu ciblé et GRATUIT de l’axe relation (#2298.4) sur les comptes analysés avant sa mise en production. Rien ne se déclenche seul de toute façon — cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The targeted, FREE relation axis (#2298.4) re-run on accounts analysed before it shipped. Nothing triggers it on its own anyway — this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'ACCESS_RELATION_SEGMENT_CATCHUP_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 21/09/2026 (#2637.1) — le rattrapage AUTOMATIQUE des rôles
   * manquants, en lot, sur `OrgEnrichmentJobService.advance({ mode:
   * 'missing_roles' })` — le MÊME chemin payant que le bouton « Enrichir les
   * rôles manquants » (débite `targeted_refresh`). Contrairement aux six
   * segments GRATUITS ci-dessus, celui-ci dépense le crédit du CLIENT sans
   * qu'il ait cliqué. Comme eux : rien ne le déclenche seul (ni cron, ni
   * boot) — seul un appel EXPLICITE d'opérateur (`internal/admin/…`)
   * l'atteint, et cet interrupteur l'empêche même alors. Le compte API passe
   * de 33 à 34 entrées (balayé par GA-84, jamais recopié d'un commentaire).
   */
  {
    // #3549 (02/10/2026) — le rattrapage ciblé des coordonnées manquantes
    // (contacts sans e-mail/téléphone, collectés avant le correctif de la
    // cascade). Même doctrine que `accounts.contacts_segment_catchup` : RIEN ne
    // le déclenche seul — ni boot ni routine ; l'interrupteur coupe même un appel
    // explicite d'opérateur.
    id: 'contacts.reachability_catchup',
    service: 'api',
    labelFr: 'Rattrapage ciblé — coordonnées manquantes',
    labelEn: 'Targeted catch-up — missing contact details',
    cutsFr:
      'Le rejeu ciblé de l’enrichissement des contacts restés sans e-mail ou sans téléphone, collectés avant le correctif (#3549). Gratuit pour le client. Rien ne se déclenche seul de toute façon — cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The targeted enrichment re-run of contacts left without an email or phone, collected before the fix (#3549). Free for the client. Nothing triggers it on its own anyway — this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'CONTACTS_REACHABILITY_CATCHUP_DISABLED',
    match: 'exact',
  },
  {
    // #3850.1 (lot V04, 08/10) — l'archivage CIBLÉ des téléphones déjà en
    // base qui n'ont pas la forme d'un numéro (code postal, date,
    // identifiant — ex. le code postal brésilien « 90480-000 » mesuré en
    // prod sur une fiche réelle). Même doctrine que `contacts.reachability_catchup` :
    // rien ne le déclenche seul — ni boot ni routine ; l'interrupteur coupe
    // même un appel explicite d'opérateur. La valeur n'est jamais effacée
    // (`enrichment_archive`, même colonne que la rétention RGPD #2297.51).
    id: 'contacts.invalid_phone_archive',
    service: 'api',
    labelFr: 'Rattrapage ciblé — téléphones invalides archivés',
    labelEn: 'Targeted catch-up — invalid phones archived',
    cutsFr:
      'L’archivage ciblé des téléphones déjà en base qui n’ont pas la forme d’un numéro (code postal, date, identifiant). La valeur n’est jamais effacée, seulement archivée. Rien ne se déclenche seul de toute façon — cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The targeted archiving of phones already stored that do not have the shape of a number (postal code, date, identifier). The value is never erased, only archived. Nothing triggers it on its own anyway — this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'CONTACTS_INVALID_PHONE_ARCHIVE_DISABLED',
    match: 'exact',
  },
  {
    id: 'accounts.missing_roles_catchup',
    service: 'api',
    labelFr: 'Rattrapage automatique — rôles manquants (payant)',
    labelEn: 'Automatic catch-up — missing roles (billed)',
    cutsFr:
      'Le rejeu en lot de la recherche des rôles manquants (#2637.1) sur les comptes jamais rattrapés. ⚠️ Débite le crédit du client, à la différence des six rattrapages gratuits — rien ne se déclenche seul de toute façon, cet interrupteur empêche même un appel explicite d’exécuter quoi que ce soit.',
    cutsEn:
      'The batched missing-roles search re-run (#2637.1) on accounts never caught up yet. ⚠️ Debits the client’s own credit, unlike the six free catch-ups — nothing triggers it on its own anyway, this switch stops even an explicit call from executing.',
    audience: 'operator',
    envVar: 'MISSING_ROLES_CATCHUP_DISABLED',
    match: 'exact',
  },
  {
    id: 'billing.metrics_snapshot',
    service: 'api',
    labelFr: 'Instantané mensuel des chiffres',
    labelEn: 'Monthly business-metrics snapshot',
    cutsFr:
      'Le passage du 1er du mois qui FIGE le MRR, ses mouvements et le revenu contracté. \u26a0\ufe0f Un mois non figé ne se rattrape pas tout seul : la position d\u2019alors n\u2019existe plus, et l\u2019instantant\u00e9 devra \u00eatre pris \u00e0 la main depuis le back-office \u2014 avec les chiffres du jour, pas ceux du mois manqu\u00e9.',
    cutsEn:
      'The 1st-of-month pass that FREEZES MRR, its movements and contracted revenue. \u26a0\ufe0f A month left unfrozen does not catch up on its own: that position no longer exists, and the snapshot will have to be taken by hand from the backoffice \u2014 with today\u2019s figures, not the missed month\u2019s.',
    audience: 'operator',
    envVar: 'BUSINESS_METRICS_SNAPSHOT_DISABLED',
    match: 'exact',
  },
  {
    id: 'backoffice.audit_retention',
    service: 'api',
    labelFr: 'Rétention du journal d’audit',
    labelEn: 'Audit-journal retention',
    cutsFr:
      'Le passage de 04:37 qui applique les cinq rétentions du journal d’audit du back-office (#1666) — 24 mois pour les actions ordinaires, 36 pour les permissions, les exports et les impersonations, jamais pour les suppressions. ⚠️ Rien n’est effacé tant qu’il est posé : le journal grossit, et l’écran continue d’annoncer des durées qui ne sont plus appliquées.',
    cutsEn:
      'The 04:37 pass applying the five retention windows of the backoffice audit journal (#1666) — 24 months for ordinary actions, 36 for permissions, exports and impersonations, never for deletions. ⚠️ Nothing is erased while it is posted: the journal keeps growing, and the screen still advertises durations that are no longer enforced.',
    audience: 'operator',
    envVar: 'AUDIT_JOURNAL_RETENTION_DISABLED',
    match: 'exact',
  },
  {
    id: 'billing.manual_sweep',
    service: 'api',
    labelFr: 'Surveillance des contrats sur facture',
    labelEn: 'Invoice-billed contract watch',
    cutsFr:
      'Le passage quotidien qui signale un engagement échu sans renouvellement et les factures manquantes. ⚠️ L’écran Facturation continue de les afficher — seule l’alerte sans ouvrir le back-office disparaît.',
    cutsEn:
      'The daily pass flagging a lapsed commitment with no renewal, and missing invoices. ⚠️ The Billing screen still shows them — only the alert that reaches you without opening the backoffice is lost.',
    audience: 'operator',
    envVar: 'MANUAL_BILLING_SWEEP_DISABLED',
    match: 'exact',
  },
  {
    id: 'observability.alerts',
    service: 'api',
    labelFr: 'Alertes d’observabilité',
    labelEn: 'Observability alerts',
    cutsFr: 'Le passage quotidien qui alerte sur la latence, le taux d’erreur et le taux d’hallucination.',
    cutsEn: 'The daily pass that alerts on latency, error rate and hallucination rate.',
    audience: 'operator',
    envVar: 'OBSERVABILITY_ALERTS_DISABLED',
    match: 'exact',
  },
  {
    id: 'changelog.newsletter',
    service: 'api',
    labelFr: 'Newsletter des nouveautés',
    labelEn: 'Changelog newsletter',
    cutsFr: 'L’e-mail bimensuel des nouveautés. Les abonnés cessent de le recevoir, le réglage reste sur « activé ».',
    cutsEn: 'The twice-monthly product newsletter. Subscribers stop receiving it while the toggle still reads “on”.',
    audience: 'user',
    envVar: 'CHANGELOG_NEWSLETTER_DISABLED',
    match: 'exact',
  },
  {
    id: 'crm.duplicates_sweep',
    service: 'api',
    labelFr: 'Détection des doublons',
    labelEn: 'Duplicate detection',
    cutsFr:
      'La recherche quotidienne de doublons : plus aucune paire n’est proposée, et plus aucune fusion automatique n’a lieu — la liste cesse de se remplir.',
    cutsEn:
      'The daily duplicate search: no pair is proposed any more, and no automatic merge happens — the list simply stops filling.',
    audience: 'user',
    envVar: 'DUPLICATES_SWEEP_DISABLED',
    match: 'exact',
  },
  {
    // #4016 L6 (Louis 11/10/2026) — la fusion automatique des doublons ≥ 0,99,
    // dans Bellum seulement. Coupée, les paires certaines redeviennent des
    // PROPOSITIONS : rien ne se perd, un humain tranche comme avant.
    id: 'crm.duplicates_auto_merge',
    service: 'api',
    labelFr: 'Fusion automatique des doublons certains',
    labelEn: 'Automatic merge of certain duplicates',
    cutsFr:
      'La fusion automatique des doublons quasi certains (même adresse et même nom). Ils sont proposés à la place, et un humain tranche.',
    cutsEn:
      'The automatic merge of near-certain duplicates (same address and same name). They are proposed instead, and a person decides.',
    audience: 'user',
    envVar: 'DUPLICATES_AUTO_MERGE_DISABLED',
    match: 'exact',
  },
  {
    // #4016 L6 (Louis 11/10/2026) — le pipe « détecté, à revoir » : Bellum écrit
    // seul le passage qu'un signal fort rend probable. Coupé, plus aucune ligne
    // neuve ; celles déjà détectées restent, à trancher par un humain.
    id: 'pipeline.auto_detect',
    service: 'api',
    labelFr: 'Pipe « détecté, à revoir »',
    labelEn: 'Pipeline “detected, to review”',
    cutsFr:
      'La détection automatique des passages probables (intérêt → affaire, shortlist → positionnement, entretien → mission). Les lignes déjà détectées restent à trancher.',
    cutsEn:
      'The automatic detection of likely moves (interest → deal, shortlist → submission, interview → engagement). Lines already detected stay to be decided.',
    audience: 'user',
    envVar: 'PIPELINE_AUTO_DETECT_DISABLED',
    match: 'exact',
  },
  {
    id: 'crm.sync',
    service: 'api',
    labelFr: 'Synchronisation avec le CRM',
    labelEn: 'CRM synchronisation',
    cutsFr:
      'La boucle dans les deux sens : plus de rapprochement de contacts, plus de détection d’écart, aucune écriture chez le tiers.',
    cutsEn: 'The two-way loop: no contact linking, no divergence detection, no third-party write.',
    audience: 'user',
    envVar: 'CRM_SYNC_DISABLED',
    match: 'trim-lower',
  },
  {
    id: 'referential.dataforge_resolution',
    service: 'api',
    labelFr: 'Résolution du référentiel d’entreprises',
    labelEn: 'Company-referential resolution',
    cutsFr: 'La résolution horaire des identifiants légaux du référentiel. Les entrées restent « en attente ».',
    cutsEn: 'The hourly legal-id resolution of the referential. Entries stay “pending”.',
    audience: 'operator',
    envVar: 'DATAFORGE_RESOLUTION_DISABLED',
    match: 'exact',
  },
  {
    id: 'referential.esn_directory_refresh',
    service: 'api',
    labelFr: 'Rafraîchissement de l’annuaire ESN',
    labelEn: 'ESN directory refresh',
    cutsFr:
      'La résolution horaire de l’annuaire ET l’inférence des maisons mères. L’écran Territoire garde ses entrées non résolues.',
    cutsEn:
      'The hourly directory resolution AND parent-company inference. The Territory screen keeps its unresolved entries.',
    audience: 'user',
    envVar: 'ESN_DIRECTORY_REFRESH_DISABLED',
    match: 'exact',
  },
  {
    id: 'territory.weekly_watch',
    service: 'api',
    labelFr: 'Veille territoriale hebdomadaire',
    labelEn: 'Weekly territory watch',
    cutsFr:
      'La photo du lundi matin de chaque département suivi. La routine qui annonce la variation ne trouve plus rien à annoncer.',
    cutsEn:
      'The Monday-morning snapshot of every followed area. The routine announcing the change finds nothing to announce.',
    audience: 'user',
    envVar: 'TERRITORY_WATCH_DISABLED',
    match: 'exact',
  },
  {
    id: 'pilotage.stock_snapshot',
    service: 'api',
    labelFr: 'Photo mensuelle des indicateurs',
    labelEn: 'Monthly indicator snapshot',
    cutsFr:
      'La photo du 1er du mois. ⚠️ Le mois sauté est un trou DÉFINITIF : « vs mois précédent » ne se recalcule pas.',
    cutsEn: 'The 1st-of-month snapshot. ⚠️ A skipped month is a PERMANENT hole: “vs last month” cannot be recomputed.',
    audience: 'user',
    envVar: 'STOCK_SNAPSHOT_DISABLED',
    match: 'exact',
  },
  {
    id: 'playbooks.interventions_sweep',
    service: 'api',
    labelFr: 'Détection des interventions',
    labelEn: 'Intervention detection',
    cutsFr: 'Les douze détecteurs qui ouvrent une intervention. Le bloc « Ce qui m’attend » du briefing se vide.',
    cutsEn: 'The twelve detectors that open an intervention. The briefing’s “What awaits me” block goes empty.',
    audience: 'user',
    envVar: 'INTERVENTIONS_SWEEP_DISABLED',
    match: 'exact',
  },
  {
    id: 'playbooks.send',
    service: 'api',
    labelFr: 'Exécution des playbooks',
    labelEn: 'Playbook execution',
    cutsFr: 'Les relances armées cessent de partir. ⚠️ Les abonnements continuent de s’afficher « actifs » à l’écran.',
    cutsEn: 'Armed follow-ups stop going out. ⚠️ Subscriptions still display as “on” in the UI.',
    audience: 'user',
    envVar: 'PLAYBOOKS_SEND_DISABLED',
    match: 'exact',
  },
  {
    // #3718.6 — le balayage horaire des réponses entrantes (séquences vivantes).
    id: 'mailbox.reply-sweep',
    service: 'api',
    labelFr: 'Détection des réponses entrantes',
    labelEn: 'Inbound reply detection',
    cutsFr:
      'Une réponse n’arrête plus les relances d’elle-même tant que la messagerie n’est pas ouverte. ⚠️ Ouvrir la messagerie ou « Traiter la réponse » les arrête toujours.',
    cutsEn:
      'A reply no longer stops follow-ups on its own until the mailbox is opened. ⚠️ Opening the mailbox or “Handle reply” still stops them.',
    audience: 'user',
    envVar: 'MAILBOX_REPLY_SWEEP_DISABLED',
    match: 'exact',
  },
  {
    // #3069 — le dispatcher d'envoi outreach (messages approuvés).
    id: 'outreach.send',
    service: 'api',
    labelFr: 'Dispatcher d’envoi outreach',
    labelEn: 'Outreach send dispatcher',
    cutsFr:
      'Les messages outreach validés cessent de partir. ⚠️ Ils restent affichés « validé », en attente de ce dispatcher.',
    cutsEn:
      'Approved outreach messages stop going out. ⚠️ They still display as “approved”, waiting on this dispatcher.',
    audience: 'user',
    envVar: 'OUTREACH_SEND_DISABLED',
    match: 'exact',
  },
  {
    id: 'privacy.retention_sweep',
    service: 'api',
    labelFr: 'Balayage de rétention RGPD',
    labelEn: 'GDPR retention sweep',
    cutsFr:
      'La purge des sessions révoquées et des fichiers de candidature expirés. Rien n’est effacé tant qu’il est posé.',
    cutsEn: 'The purge of revoked sessions and expired candidate files. Nothing is erased while it is posted.',
    audience: 'operator',
    envVar: 'RETENTION_SWEEP_DISABLED',
    match: 'lower',
  },
  {
    id: 'rag.purge',
    service: 'api',
    labelFr: 'Purge du magasin de connaissance',
    labelEn: 'Knowledge-store purge',
    cutsFr: 'La purge mensuelle des documents de connaissance. Rien n’est effacé.',
    cutsEn: 'The monthly purge of knowledge documents. Nothing is erased.',
    audience: 'operator',
    envVar: 'RAG_PURGE_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 13/09/2026 (#1954, décision de Louis) — la purge nocturne des
   * documents « pour cette conversation » dont le fil n'a AUCUN message après
   * 24 h. Jamais un document de la base de l'ESN.
   */
  {
    id: 'rag.thread_orphan_purge',
    service: 'api',
    labelFr: 'Purge des pièces jointes sans conversation',
    labelEn: 'Purge of attachments with no conversation',
    cutsFr:
      'Le passage de 03:53 qui efface, après 24 h, les documents joints « pour cette conversation » dans un fil où personne n’a jamais écrit. ⚠️ Rien n’est effacé tant qu’il est posé : ces documents, invisibles partout, restent en base. Un document de la base de l’ESN n’est jamais concerné.',
    cutsEn:
      'The 03:53 pass that erases, after 24 h, documents attached “for this conversation” in a thread where nobody ever wrote. ⚠️ Nothing is erased while it is posted: those documents, visible nowhere, stay in the database. A document of the ESN knowledge base is never concerned.',
    audience: 'operator',
    envVar: 'RAG_THREAD_ORPHAN_PURGE_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 14/10/2026 (#2876, décision de Louis) — le balayage nocturne
   * qui ARCHIVE (jamais ne supprime) les zones vision d'une image de chat dont
   * la rétention (30 jours) est dépassée.
   */
  {
    id: 'chat.image_vision_archive',
    service: 'api',
    labelFr: 'Archivage des zones vision de chat expirées',
    labelEn: 'Archiving of expired chat vision zones',
    cutsFr:
      'Le passage nocturne qui pose `image_vision_archived_at` sur les messages dont l’image jointe a dépassé 30 jours. ⚠️ Rien n’est jamais effacé, posé ou non : ce balayage ne fait que retirer les zones et objets mesurés de l’affichage une fois l’image expirée. Coupé, ces zones restent visibles au-delà de leur rétention.',
    cutsEn:
      'The nightly pass that sets `image_vision_archived_at` on messages whose attached image is past its 30-day retention. ⚠️ Nothing is ever erased, posted or not: this sweep only stops rendering measured zones and objects once the image has expired. Cut, those zones stay visible past their retention.',
    audience: 'operator',
    envVar: 'CHAT_IMAGE_VISION_ARCHIVE_DISABLED',
    match: 'exact',
  },
  {
    id: 'routines.sweep',
    service: 'api',
    labelFr: 'Exécution des routines',
    labelEn: 'Routine execution',
    cutsFr: 'Le balayage des quinze minutes. Aucun abonné ne reçoit plus sa routine ni son briefing quotidien.',
    cutsEn: 'The fifteen-minute sweep. No subscriber receives their routine or daily brief any more.',
    audience: 'user',
    envVar: 'ROUTINES_DISABLED',
    match: 'trim-lower',
  },
  /**
   * Lot L-D1 (#4167) — la PRÉPARATION DU MATIN des automatisations (« quand signal → alors … »).
   * Coupée, aucune règle n'inscrit ni ne prépare plus rien ; les règles et leur journal restent intacts.
   */
  {
    id: 'automation.morning_run',
    service: 'api',
    labelFr: 'Préparation du matin des automatisations',
    labelEn: 'Morning preparation of automations',
    cutsFr:
      'Le passage du matin où les règles actives inscrivent les contacts concernés par un signal et préparent leurs messages. Rien ne part de toute façon sans validation humaine ; coupé, plus rien n’arrive dans « À traiter » depuis les automatisations.',
    cutsEn:
      'The morning pass where active rules enrol the contacts concerned by a signal and prepare their messages. Nothing is ever sent without human validation anyway; cut, nothing more arrives in “To do” from automations.',
    audience: 'user',
    envVar: 'AUTOMATION_RULES_DISABLED',
    match: 'exact',
  },
  {
    id: 'watchlist.refresh',
    service: 'api',
    labelFr: 'Rafraîchissement des comptes suivis',
    labelEn: 'Watched-account refresh',
    cutsFr: 'La ré-analyse quotidienne des comptes suivis. Les dossiers vieillissent sans que rien ne le dise.',
    cutsEn: 'The daily re-analysis of watched accounts. Dossiers go stale with nothing saying so.',
    audience: 'user',
    envVar: 'WATCHLIST_REFRESH_DISABLED',
    match: 'exact',
  },
  /**
   * #3916.a (lot M03, 09/10/2026) — la lecture QUOTIDIENNE des registres
   * publics (BODACC, Sirene) pour les SIREN des comptes suivis. Coupée, plus
   * aucune annonce ni ouverture n'arrive entre deux analyses — et la fiche
   * continue d'afficher la date de la dernière lecture, ce qui le DIT.
   */
  {
    id: 'watchlist.registry',
    service: 'api',
    labelFr: 'Veille des registres publics',
    labelEn: 'Public registry watch',
    cutsFr: 'La lecture quotidienne des annonces légales et des ouvertures d’établissement des comptes suivis.',
    cutsEn: 'The daily reading of legal notices and establishment openings for watched accounts.',
    audience: 'user',
    envVar: 'PUBLIC_REGISTRY_WATCH_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 16/09/2026 (#2151.14 / #2151.25) — le balayage qui fait
   * APPARAÎTRE les événements qu'une alerte de Découvrir surveille (entreprise
   * entrée dans l'espace, besoin confirmé, ESN déclarée, mission terminée, voie
   * d'accès consignée). La coupure porte sur la DÉTECTION : plus aucun
   * événement n'est consigné, donc plus aucune alerte n'apparaît dans
   * Aujourd'hui — et rien à l'écran ne le dit. C'est la raison pour laquelle
   * l'audience est `user` : cette coupure se voit par une ABSENCE.
   */
  {
    id: 'discover.alert_events',
    service: 'api',
    labelFr: 'Détection des événements de Découvrir',
    labelEn: 'Discover event detection',
    cutsFr:
      'Le balayage qui repère ce qui vient d’apparaître dans l’espace (entreprise, besoin confirmé, ESN déclarée, mission terminée, voie d’accès). ⚠️ Les alertes cessent d’apparaître dans Aujourd’hui, et l’écran ne dit pas pourquoi : il affiche « aucun déclenchement ».',
    cutsEn:
      'The sweep that spots what has just appeared in the workspace (company, confirmed need, declared partner, ended mission, access path). ⚠️ Alerts stop appearing in Today, and the screen does not say why: it reads “no trigger yet”.',
    audience: 'user',
    envVar: 'DISCOVER_ALERT_EVENTS_DISABLED',
    match: 'exact',
  },
  {
    id: 'storage.retention_purge',
    service: 'api',
    labelFr: 'Purge des fichiers échus',
    labelEn: 'Expired-file purge',
    cutsFr:
      'Le balayage de 03:41 qui efface les fichiers dont l’échéance de conservation est passée. ⚠️ Les écrans continuent d’afficher cette échéance : rien ne dit qu’elle n’est plus appliquée.',
    cutsEn:
      'The 03:41 sweep that erases files past their retention date. ⚠️ Screens keep displaying that date: nothing says it is no longer enforced.',
    audience: 'operator',
    envVar: 'STORAGE_RETENTION_PURGE_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 09/09/2026 (#1676.1) — le dispatcheur d'alertes du back-office
   * (e-mail + Slack : connexion manager anormale, coût quotidien hors norme,
   * taux d'échec d'analyse). La coupure porte sur l'ENVOI seul — le calcul et
   * la dé-duplication continuent de tourner (donc restent vérifiables), rien
   * ne part juste vers un humain. Le compte API passe de 19 à 20 entrées.
   */
  {
    id: 'backoffice.alerts_dispatch',
    service: 'api',
    labelFr: 'Alertes sortantes du back-office',
    labelEn: 'Backoffice outbound alerts',
    cutsFr:
      'L’envoi des alertes back-office (e-mail et Slack) : connexion manager anormale, coût quotidien hors norme, taux d’échec d’analyse. ⚠️ Le calcul et la dé-duplication continuent — rien n’est perdu silencieusement, mais plus personne n’est prévenu.',
    cutsEn:
      'Backoffice outbound alerts (email and Slack): abnormal manager login, out-of-range daily cost, analysis failure rate. ⚠️ Calculation and dedup keep running — nothing is silently lost, but no one is warned any more.',
    audience: 'operator',
    envVar: 'BACKOFFICE_ALERTS_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 12/09/2026 (#1911.1) — le titre des fils de Laura, rédigé en
   * tâche de fond par un modèle léger après le 2e échange (décision de Louis :
   * « rédigé par Laura, sans quota »). Un appel de modèle que personne ne
   * déclenche à la main mérite un interrupteur d'incident : posé, zéro lecture
   * et zéro appel (`ChatThreadTitlesService.titleAfterReply`). L'écran ne ment
   * pas pendant la coupure — un fil sans titre rédigé garde son premier message,
   * comme avant ce lot. Le compte API passe de 20 à 21 entrées.
   */
  {
    id: 'copilot.thread_titles',
    service: 'api',
    labelFr: 'Titres des conversations rédigés par Laura',
    labelEn: 'Conversation titles written by Laura',
    cutsFr:
      'Laura cesse de titrer les nouveaux fils : ils gardent leur premier message pour titre. Les titres déjà écrits et le renommage à la main restent.',
    cutsEn:
      'Laura stops titling new threads: they keep their first message as title. Titles already written and manual renaming stay.',
    audience: 'operator',
    envVar: 'CHAT_THREAD_TITLES_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 13/09/2026 (#1946.22, décision Louis batch 12) — l'alerte
   * d'équipe sur un espace client dont le score de santé MESURÉ passe sous le
   * seuil. Posé : aucune lecture de santé, aucun envoi
   * (`BackofficeAlertsService.checkWorkspacesAtRisk`). Le compte API passe de
   * 22 à 23 entrées.
   */
  {
    id: 'backoffice.workspace_risk_alerts',
    service: 'api',
    labelFr: 'Alerte d’équipe sur un espace client à risque',
    labelEn: 'Team alert on an at-risk client workspace',
    cutsFr:
      'Le passage quotidien de 07:40 qui prévient l’équipe quand le score de santé mesuré d’un espace passe sous le seuil (#1946.22). ⚠️ L’écran Revenus › Clients continue d’afficher le score et le risque — seule l’alerte qui arrive sans ouvrir le back-office disparaît.',
    cutsEn:
      'The 07:40 daily pass that warns the team when a workspace’s measured health score drops below the threshold (#1946.22). ⚠️ The Revenue › Clients screen still shows the score and the risk — only the alert that reaches you without opening the backoffice is lost.',
    audience: 'operator',
    envVar: 'WORKSPACE_RISK_ALERTS_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 13/09/2026 (#1949.23, décision Louis batch 12) — la trace
   * anonyme d'une demande que Laura n'a pas su router. Posé : aucune écriture
   * (`LauraUnroutedIntentsService.record`). La PURGE à 90 jours, elle, reste
   * sous l'interrupteur du balayage RGPD (`privacy.retention_sweep`) : couper
   * l'écriture ne doit jamais geler l'effacement. Le compte API passe de 23 à
   * 24 entrées.
   */
  {
    id: 'copilot.unrouted_intents',
    service: 'api',
    labelFr: 'Trace anonyme des demandes non comprises par Laura',
    labelEn: 'Anonymous trace of requests Laura could not route',
    cutsFr:
      'Une demande que Laura n’a pas su router ne laisse plus aucune trace (#1949.23). Les traces déjà écrites restent lisibles au back-office et suivent leur purge à 90 jours.',
    cutsEn:
      'A request Laura could not route no longer leaves any trace (#1949.23). Traces already written stay readable in the backoffice and are still purged after 90 days.',
    audience: 'operator',
    envVar: 'LAURA_UNROUTED_INTENTS_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 13/09/2026 (#1938.4 — décision Louis 13/09 batch 13) — le canal
   * SMS des alertes urgentes. Un envoi facturé à l'unité, vers le téléphone
   * personnel de quelqu'un, mérite un interrupteur d'incident dès le premier
   * jour — même si, tant qu'aucun fournisseur n'est branché, il n'y a rien à
   * couper. Posé : aucune lecture, aucun envoi (`SmsChannelService.dispatch`),
   * aucune demande de code, et l'écran dit « en pause » plutôt que de laisser
   * croire le canal ouvert. Les choix de chacun sont gardés, et décocher reste
   * possible. Le compte API passe de 24 à 25 entrées.
   */
  {
    id: 'notifications.sms',
    service: 'api',
    labelFr: 'Alertes urgentes par SMS',
    labelEn: 'Urgent alerts by text message',
    cutsFr:
      'L’envoi des alertes urgentes par SMS (signal d’achat, crédits bientôt épuisés, actions en retard) et des codes de vérification. Les choix de chacun sont gardés, Réglages › Notifications affiche « En pause », et décocher reste possible.',
    cutsEn:
      'Urgent alerts by text message (buy signal, credits running low, overdue actions) and verification codes stop. Everyone’s choices are kept, Settings › Notifications shows “Paused”, and unticking still works.',
    audience: 'user',
    envVar: 'SMS_NOTIFICATIONS_DISABLED',
    match: 'exact',
  },
  /**
   * ⚠️ AJOUTÉ LE 16/09/2026 (#2082.4/.5/.6) — les trois annonces d'ENGAGEMENT,
   * posées avec leur émetteur. Elles LISENT trois sources dont deux sont des
   * connecteurs personnels (agenda, messagerie) : un balayage quotidien qui
   * interroge la boîte de chacun mérite un interrupteur d'incident dès le
   * premier jour. Coupé : aucune lecture, aucune annonce — et les choix de
   * chacun sont gardés tels quels. Le compte API passe de 25 à 26 entrées.
   */
  {
    id: 'notifications.engagement',
    service: 'api',
    labelFr: 'Annonces d’engagement',
    labelEn: 'Commitment alerts',
    cutsFr:
      'Le balayage quotidien qui annonce un rendez-vous à préparer, une fin de mission ou l’arrivée d’une réponse. Plus aucune lecture d’agenda ni de messagerie pour ces annonces, et aucune notification. Les choix de chacun sont gardés, et se décochent toujours.',
    cutsEn:
      'The daily sweep that flags a meeting to prepare, a mission ending, or a reply that has arrived. No calendar or mailbox is read for these alerts any more, and no notification is created. Everyone’s choices are kept, and can still be unticked.',
    audience: 'user',
    envVar: 'ENGAGEMENT_ALERTS_DISABLED',
    match: 'exact',
  },
  {
    id: 'crm.deal_signals_sweep',
    service: 'api',
    labelFr: 'Signaux CRM (affaires)',
    labelEn: 'CRM deal signals',
    cutsFr:
      'Le balayage quotidien du cache des affaires CRM (affaire perdue, dormante, à renouveler). Plus aucun de ces trois signaux ne rejoint le registre canonique ; le cache lui-même continue d’être relu normalement.',
    cutsEn:
      'The daily sweep of the cached CRM deals (lost, dormant, due for renewal). None of these three signals reaches the canonical registry any more; the cache itself keeps syncing normally.',
    audience: 'user',
    envVar: 'CRM_DEAL_SIGNALS_DISABLED',
    match: 'exact',
  },
] as const

/**
 * Les onze interrupteurs portés par le moteur IA — huit jusqu'au 12/09/2026,
 * plus `rag.llm_rerank` (LOT 13, D169) : `RAG_LLM_RERANK_DISABLED` existait et
 * fonctionnait depuis GA-304 (`rag_knowledge.py`) mais restait hors du
 * registre partagé, posé par un agent sans `apps/api/` dans son périmètre —
 * sans surface, un interrupteur posé en incident ne se voyait nulle part ;
 * plus `copilot.deep_link_count` (15/09/2026, Laura compte avant de proposer),
 * plus `copilot.model_routing` (#2248, 17/09/2026, Laura choisit son palier de
 * modèle).
 *
 * L'API ne lit PAS leur environnement — c'est un autre process, souvent une
 * autre machine. Elle les DEMANDE (`GET /internal/kill-switches` côté moteur) et
 * rend `unknown` quand il ne répond pas. Les identifiants sont les mêmes des
 * deux côtés : la parité est gardée par `kill-switch-registry.spec.ts`
 * (GA-84), qui lit le fichier Python (`apps/ia/app/services/kill_switch.py`).
 */
export const IA_KILL_SWITCHES: readonly KillSwitchDefinition[] = [
  {
    id: 'analysis.judge',
    service: 'ia',
    labelFr: 'Juge anti-hallucination',
    labelEn: 'Anti-hallucination judge',
    cutsFr: 'Le nœud qui relit l’analyse sort du graphe : plus aucun contrôle de cohérence sur ce qui est produit.',
    cutsEn: 'The node that re-reads the analysis leaves the graph: no coherence check on what is produced.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  {
    id: 'analysis.llm_gateway',
    service: 'ia',
    labelFr: 'Routage des modèles',
    labelEn: 'Model routing',
    cutsFr: 'Tout routage est ignoré : chaque appel repart en direct sur le modèle par défaut de l’appelant.',
    cutsEn: 'All routing is ignored: every call goes direct to the caller’s default model.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  {
    id: 'analysis.data_gateway',
    service: 'ia',
    labelFr: 'Recherche web complémentaire',
    labelEn: 'Supplementary web search',
    cutsFr:
      'La cascade de recherche rend une liste vide, sans aucun appel réseau. Le dossier perd ses sources web additionnelles.',
    cutsEn: 'The search waterfall returns empty with zero network call. The dossier loses its additional web sources.',
    audience: 'user',
    envVar: '',
    match: 'exact',
  },
  /**
   * LOT 13 — DÉFAUT A, REVIREMENT (D169) : deux passes Claude distinctes
   * citent des faits (`apps/ia/app/services/grounding_citations.py`) —
   * `cite_key_facts` (B3+, alimente `sources.citations`) et `ground_facts_v2`
   * (v2, alimente `grounding` + le KPI « <5 % non sourcés »). Un premier
   * passage n'avait trouvé qu'une seule garde `disabled(GROUNDING_KILL_SWITCH)`
   * (dans `ground_facts_v2` seule) et avait choisi de le DIRE dans le libellé
   * (« (v2) ») plutôt que d'étendre la garde — une décision produit qu'un
   * agent ne tranche pas seul. Louis a tranché : étendre. Un interrupteur
   * d'incident doit couper ce que son NOM annonce, posé sous pression, sans le
   * temps de se souvenir qu'il ne coupait qu'une moitié. Les DEUX passes
   * écoutent désormais `GROUNDING_DISABLED` — le dossier sort sans aucune
   * citation pendant la coupure, et c'est le BUT recherché. Gardé par
   * **GA-315** (`apps/ia/tests/test_grounding_kill_switch_both_passes.py`).
   */
  {
    id: 'analysis.grounding',
    service: 'ia',
    labelFr: 'Sourçage des faits',
    labelEn: 'Fact sourcing',
    cutsFr:
      'Les deux passes de citations (references par fait, indicateur « moins de 5 % de faits non sourcés », et les citations qui alimentent les sources du dossier) ne sont plus calculées : le dossier sort sans aucune preuve citée.',
    cutsEn:
      'Both citation passes stop (per-fact references, the “under 5% unsourced facts” indicator, and the citations feeding the dossier’s sources): the dossier ships with no cited proof at all.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  {
    id: 'copilot.tools',
    service: 'ia',
    labelFr: 'Actions du copilote',
    labelEn: 'Copilot actions',
    cutsFr:
      'Laura répond en texte seul : elle ne lit plus de dossier et ne propose plus d’action. ⚠️ Son invite continue de lui décrire des outils qu’elle n’a plus.',
    cutsEn:
      'Laura answers in plain text: she no longer reads a dossier nor proposes an action. ⚠️ Her prompt still describes tools she no longer has.',
    audience: 'user',
    envVar: '',
    match: 'exact',
  },
  {
    id: 'analysis.self_consistency',
    service: 'ia',
    labelFr: 'Mesure d’auto-cohérence',
    labelEn: 'Self-consistency measure',
    cutsFr: 'La mesure de stabilité du plan d’action ne tourne plus.',
    cutsEn: 'The action-plan stability measure stops running.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  {
    id: 'analysis.source_cache',
    service: 'ia',
    labelFr: 'Cache des sources',
    labelEn: 'Source cache',
    cutsFr: 'Toute lecture ET toute écriture de cache s’arrêtent : chaque source est réinterrogée, donc repayée.',
    cutsEn: 'Every cache read AND write stops: each source is re-queried, and re-paid.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  {
    id: 'observability.tracing',
    service: 'ia',
    labelFr: 'Traçage des appels de modèle',
    labelEn: 'Model-call tracing',
    cutsFr: 'Les traces d’appel cessent d’être envoyées. Aucun effet produit — un angle mort d’exploitation.',
    cutsEn: 'Call traces stop being sent. No product effect — an operational blind spot.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  /**
   * LOT 13 — DÉFAUT B (D169) : `RAG_LLM_RERANK_DISABLED` fonctionne depuis
   * GA-304 (`rag_knowledge.py` — reclassement des passages RAG-connaissance
   * par Claude Haiku, à chaque tour de chat ET chaque phase d'analyse), mais
   * restait hors de ce registre : posé pendant un incident, rien ne le
   * disait. Rejoint ici avec son miroir Python
   * (`CAPABILITY_KILL_SWITCHES` dans `apps/ia/app/services/kill_switch.py`).
   */
  {
    id: 'rag.llm_rerank',
    service: 'ia',
    labelFr: 'Reclassement LLM du RAG-connaissance',
    labelEn: 'RAG-knowledge LLM rerank',
    cutsFr:
      'Le reclassement des passages de connaissance par un appel Claude Haiku rejoint le repli déterministe déjà en place (fraîcheur + recouvrement lexical, gratuit). Le cross-encoder local garde toujours la priorité sur les deux.',
    cutsEn:
      'The knowledge-passage rerank via a Claude Haiku call falls back to the deterministic path already in place (freshness + lexical overlap, free). The local cross-encoder always keeps priority over both.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  /**
   * Laura compte avant de proposer (décision Louis, 15/09/2026, contre la
   * recommandation). Le compte a son PROPRE budget de latence
   * (`DEEP_LINK_COUNT_BUDGET_S`) et son échec n'empêche JAMAIS la
   * proposition d'un lien — ce switch coupe le compte SEUL, pas le lien.
   * `envVar` reste vide comme les huit switches ci-dessus : l'API ne lit pas
   * l'environnement du moteur IA, elle le demande.
   */
  {
    id: 'copilot.deep_link_count',
    service: 'ia',
    labelFr: 'Compte avant un lien proposé',
    labelEn: 'Count before a proposed link',
    cutsFr:
      'Laura ne compte plus les lignes qu’un lien filtré ramènerait avant de le proposer : elle propose le lien comme avant sa mise en place, sans jamais citer de nombre.',
    cutsEn:
      'Laura stops counting how many rows a filtered link would return before proposing it: she proposes the link as before this capability, and never names a number.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  /**
   * #2248 (décision Louis, 17/09/2026) — Laura choisit, demande par demande,
   * entre un palier de modèle rapide et un palier fort (classifieur à règles,
   * `apps/ia/app/services/chat_model_routing.py`). Coupé : chaque tour repart
   * vers la destination unique du copilote et compte son coût sous son nom
   * d'avant ; les réglages de palier restent posés, ignorés. Miroir Python :
   * `CAPABILITY_KILL_SWITCHES` (GA-84).
   */
  {
    id: 'copilot.model_routing',
    service: 'ia',
    labelFr: 'Choix du palier de modèle de Laura',
    labelEn: 'Laura’s model tier choice',
    cutsFr:
      'Laura ne choisit plus entre un modèle rapide et un modèle fort selon la demande : chaque tour repart sur le modèle unique du copilote, comme avant ce choix. Les réglages de palier restent posés, sans effet.',
    cutsEn:
      'Laura stops choosing between a fast and a strong model for each request: every turn goes back to the single copilot model, as before this choice. The tier settings stay in place, with no effect.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  /**
   * #2543.5g (décision Louis, 18/09/2026) — la passe d'élargissement
   * automatique d'une collecte de contacts mince (`phase2_contacts.py`).
   * ACTIF PAR DÉFAUT, à l'inverse du reste de cette famille : un défaut
   * ÉTEINT ne corrigeait rien pour le cas signalé (ARQUUS, stock inchangé
   * après repli). Rejoint le registre le 21/09/2026 (intégration vague 2,
   * GA-84) : la lecture vivait en `os.getenv` direct côté IA, hors surface
   * opérateur. Miroir Python : `CAPABILITY_KILL_SWITCHES` (`kill_switch.py`).
   */
  {
    id: 'contacts.auto_widen',
    service: 'ia',
    labelFr: 'Élargissement automatique d’une collecte mince',
    labelEn: 'Automatic widening of a thin contact collection',
    cutsFr:
      'La dernière passe d’élargissement (bande de séniorité complète, sans filtre de titres) ne se déclenche plus quand la collecte de contacts reste mince après le repli web : le stock reste tel quel, comme avant cette passe.',
    cutsEn:
      'The last widening pass (full seniority band, no title filter) no longer fires when a contact collection stays thin after the web fallback: the stock stays as-is, as before this pass.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
  /** #3586 — miroir Python : `INTERNAL_KNOWLEDGE_DIGEST_KILL_SWITCH` (`kill_switch.py`). */
  {
    id: 'knowledge.internal_digest',
    service: 'ia',
    labelFr: 'Synthèse du Drive interne',
    labelEn: 'Internal Drive digest',
    cutsFr:
      'Le résumé du savoir interne (méthode, métiers, règles de prospection, ton) n’est plus placé en tête des prompts : chaque surface repart sur son prompt d’origine, sans lecture de la base.',
    cutsEn:
      'The internal knowledge summary (method, roles, prospecting rules, tone) is no longer prefixed to prompts: every surface falls back to its original prompt, with no database read.',
    audience: 'operator',
    envVar: '',
    match: 'exact',
  },
] as const

/** Les identifiants que le moteur IA doit savoir rendre. */
export const IA_KILL_SWITCH_IDS: readonly string[] = IA_KILL_SWITCHES.map(s => s.id)

const ALL: readonly KillSwitchDefinition[] = [...API_KILL_SWITCHES, ...IA_KILL_SWITCHES]

/** Retrouve une définition par son identifiant de capacité. Lève si inconnue. */
export function killSwitchById(id: string): KillSwitchDefinition {
  const found = ALL.find(s => s.id === id)
  if (!found) throw new Error(`Interrupteur inconnu : ${id}`)
  return found
}

/**
 * « Cette capacité est-elle coupée ? » — LA question que posent les sites
 * d'appel de l'API, et le seul chemin par lequel ils la posent.
 *
 * ⚠️ Lève sur une capacité du moteur IA : l'API ne lit pas l'environnement d'un
 * autre process. Rendre `false` y serait pire qu'une erreur — ce serait affirmer
 * « active » sans avoir rien mesuré.
 */
export function killSwitchCut(id: string): boolean {
  const sw = killSwitchById(id)
  if (sw.service !== 'api') {
    throw new Error(`L'état de « ${id} » se DEMANDE au moteur IA, il ne se lit pas ici.`)
  }
  return readKillSwitch(sw)
}

/**
 * Une ligne publiée. ⚠️ Aucun `envVar`, aucune valeur d'environnement — c'est
 * l'invariant de GA-85, et il tient parce que ce type ne PORTE pas le champ.
 */
type KillSwitchStatus = {
  id: string
  service: KillSwitchService
  labelFr: string
  labelEn: string
  cutsFr: string
  cutsEn: string
  audience: KillSwitchAudience
  state: KillSwitchState
}

export type KillSwitchReport = {
  switches: KillSwitchStatus[]
  summary: { active: number; cut: number; unknown: number }
  /**
   * Le moteur IA a-t-il répondu. `false` ⇒ ses huit lignes valent `unknown`,
   * et l'écran doit le DIRE plutôt que de les peindre en vert.
   */
  iaReachable: boolean
  measuredAt: string
}

/**
 * Assemble l'état de toutes les capacités.
 *
 * @param input.ia L'état rendu par le moteur IA, indexé par identifiant de
 *   capacité, ou `null` quand il n'a pas répondu. Une clé ABSENTE d'une réponse
 *   présente reste `unknown` : un moteur plus ancien qui ignore une capacité ne
 *   la déclare pas saine.
 */
export function killSwitchReport(input: { ia: Record<string, boolean> | null }): KillSwitchReport {
  const switches: KillSwitchStatus[] = ALL.map(sw => {
    let state: KillSwitchState
    if (sw.service === 'api') {
      state = readKillSwitch(sw) ? 'cut' : 'active'
    } else if (input.ia && Object.hasOwn(input.ia, sw.id)) {
      state = input.ia[sw.id] ? 'cut' : 'active'
    } else {
      state = 'unknown'
    }
    return {
      id: sw.id,
      service: sw.service,
      labelFr: sw.labelFr,
      labelEn: sw.labelEn,
      cutsFr: sw.cutsFr,
      cutsEn: sw.cutsEn,
      audience: sw.audience,
      state,
    }
  })

  return {
    switches,
    summary: {
      active: switches.filter(s => s.state === 'active').length,
      cut: switches.filter(s => s.state === 'cut').length,
      unknown: switches.filter(s => s.state === 'unknown').length,
    },
    iaReachable: input.ia !== null,
    measuredAt: new Date().toISOString(),
  }
}
