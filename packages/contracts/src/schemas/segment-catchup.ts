import type { RefreshDimension } from './analysis.js'

/**
 * #AF — LE RATTRAPAGE CIBLÉ PAR SEGMENT (décision Louis, 18/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI L'A DÉCLENCHÉ
 * ─────────────────────────────────────────────────────────────────────────
 * #2543 (couverture des contacts — `apollo.py:264` `ApolloUnavailableError`,
 * `total_entries` rendu, `phase2_contacts.py:704` seuil de repli INCLUSIF à 5)
 * est servi et vérifié en production. Il change ce qu'une NOUVELLE collecte
 * trouve — pas ce qu'un compte déjà analysé affiche : les contacts sont LUS
 * en base (`accounts.service.ts`), jamais recalculés à l'affichage. ARQUUS,
 * analysé avant ce correctif, continue d'afficher 5 contacts avec la même
 * assurance qu'une collecte fraîche.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────
 * « si on enrichit, si on rajoute un truc, ou modifie quoi que ce soit sur un
 * compte, on doit le mettre à jour sur les précédents, en ciblant bien sûr
 * précisément, et en updatant les segments qui ont changé » (Louis). Un
 * compte est CONCERNÉ si sa dernière collecte de ce segment est ANTÉRIEURE
 * au changement de capacité — jamais par un SYMPTÔME (« moins de 5 contacts »
 * rejouerait éternellement les comptes qui en ont légitimement peu).
 *
 * ⚠️ `SEGMENT_CAPABILITY_EPOCH` ne portait que `contacts` avant ce lot. Un
 * futur correctif de collecte sur `entities`/`signals`/`strategy` ajoute SA
 * propre entrée ici, il n'en retire ni n'en devine aucune.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2118.51 (18/09/2026) — `dossier_read`, LE CINQUIÈME SEGMENT
 * ─────────────────────────────────────────────────────────────────────────
 * `dossier_read` n'est PAS une valeur de `RefreshDimension` : ce n'est pas un
 * item du menu « Rafraîchir un axe » (aucun bouton, aucun crédit dédié), donc
 * la clé est portée en dehors du type de la table, sur le même objet — un
 * segment de rattrapage n'a jamais eu besoin d'être une dimension facturable.
 *
 * La date retenue, `2026-09-14T17:46:41.000Z`, est celle du commit qui a fait
 * du moteur IA un émetteur RÉEL de `dossier_read`
 * (`4c8169c81239666d8b4eb7959dd06ff1ad35ace0`, « feat(ia): le moteur rend la
 * lecture du dossier en sept axes fixes (#2118) », committer date
 * 2026-09-14T19:46:41+02:00) — pas la date du commit contrat qui le précède de
 * 24 secondes (`bd5289abb9d007f08908b1c196015c33eeb5a63c`) : avant que le
 * moteur n'émette le bloc, aucun dossier ne pouvait le porter, quelle que soit
 * la forme acceptée côté schéma.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2291.2 (lot R, 19/09/2026) — `signals`, LE PREMIER À S'ALLUMER
 * ─────────────────────────────────────────────────────────────────────────
 * Le modèle de contrat OBSERVÉ (« recourt à l'indépendant / à la régie »,
 * `contract_model.py`) est le premier correctif de collecte du segment
 * `signals` : la date retenue, `2026-09-19T11:20:34.000Z`, est celle du commit
 * qui a fait de la phase 1 (IA) un émetteur RÉEL de `contractModel`
 * (`8054769a3047d1cb4a2f552389a71d105d0b527f`, « feat(ia): #2291.2 —
 * l'observation du modèle de contrat survit à l'analyse complète », committer
 * date 2026-09-19T13:20:34+02:00) — même raisonnement que `dossier_read` :
 * avant ce commit, `_contract_model_overlay` n'existait pas, aucune analyse ne
 * pouvait porter le bloc, quel que soit le schéma déjà déclaré côté contrat.
 * `SegmentStaleCollectionNotice dimension="signals"` (`TabSignal.tsx`) était
 * monté depuis #2543.7 mais ne rendait RIEN tant que cette entrée manquait —
 * c'est cette ligne qui l'allume.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2298.4 (réfuté en production le 19/09/2026) — `access_relation`, LE
 * SIXIÈME SEGMENT
 * ─────────────────────────────────────────────────────────────────────────
 * L'axe RELATION de l'adressabilité (onglet Accès) ne lisait que le CRM
 * connecté (#1631.5) ; #2298.4 lui ajoute missions signées, agenda, e-mails
 * (métadonnées) et correction humaine. `raw_analysis.addressability` est
 * recalculé à CHAQUE recherche Phase 1 (`AccountsService.applyResearch`,
 * même écriture que `signals_collected_at`) — donc un compte analysé AVANT
 * cette capacité ne porte que le relevé CRM, jamais les quatre autres
 * sources, et deux comptes du même espace peuvent se contredire sur l'état
 * d'un connecteur selon la date de leur dernière analyse.
 *
 * `access_relation` n'est PAS une valeur de `RefreshDimension` (comme
 * `dossier_read` ci-dessus) : ni bouton dédié, ni crédit — il REJOUE
 * `signals` (la même colonne `signals_collected_at`), jamais une dimension
 * facturable à part.
 *
 * La date, `2026-09-19T10:59:00.000Z`, est celle où la capacité est devenue
 * RÉELLE de bout en bout en production (IA `d35eddb3f` + API `d4f4392fa`,
 * mesuré en production le 19/09 ~11:15Z) — pas la date d'un commit isolé :
 * IA seule ou API seule ne suffisait pas à ce qu'un run produise les quatre
 * nouvelles sources.
 */
export type SegmentCapabilityKey = RefreshDimension | 'dossier_read' | 'access_relation' | 'dossier_blocks'

/**
 * #2655.2 (21/09/2026) — LE TROU QUE CE REGISTRE BOUCHE.
 *
 * Le docblock ci-dessus prévoyait qu'« un futur correctif de collecte sur
 * `entities`/`signals`/`strategy` ajoute SA propre entrée ici ». Il n'avait pas
 * prévu le cas qui est arrivé : une SECONDE capacité sur le MÊME segment.
 *
 * `contacts` portait `2026-09-18T00:00:00.000Z`, la date de #2543. Puis #2655.1
 * (« la relance auto par famille garde le territoire du scope », commit
 * `c66467b743c3d90558b3769a7d2e3c1e7bc51f29`, committer date
 * 2026-09-20T15:08:13+02:00) a changé une nouvelle fois ce qu'une collecte de
 * contacts TROUVE — et personne n'a bougé la date, parce que rien ne l'exigeait.
 *
 * Conséquence mesurée : **tout compte collecté entre le 18/09 00:00Z et le
 * 20/09 13:08Z était déclaré « à jour » alors qu'il n'avait pas le correctif.**
 * Le critère de la doctrine (« concerné se décide sur la date de collecte du
 * segment contre la date de la capacité ») s'appliquait contre la MAUVAISE date,
 * silencieusement, y compris sur l'écran qui dit à l'utilisateur que sa collecte
 * est antérieure.
 *
 * La correction n'est pas de remettre une date à la main : c'est de rendre
 * l'oubli IMPOSSIBLE. Une capacité s'INSCRIT ici, et la date de bascule s'en
 * DÉDUIT — un réglage vit à un seul endroit (GA-26). Ajouter une capacité sans
 * toucher l'epoch devient le geste normal ; oublier d'inscrire la capacité fait
 * échouer la garde.
 *
 * ⚠️ `commit: null` est permis, mais il EXIGE une raison : `access_relation` est
 * devenu réel par DEUX déploiements (IA + API), aucun commit isolé ne porte sa
 * bascule. On ne devine pas un SHA pour faire joli.
 */
export type SegmentCapability = Readonly<{
  /** Le numéro de la demande qui a changé la capacité. */
  issue: string
  /** Le commit qui l'a rendue réelle, ou `null` si la bascule tient à plusieurs. */
  commit: string | null
  /** L'instant où la capacité est devenue réelle EN PRODUCTION, en UTC. */
  at: string
  /** Ce que la collecte trouve APRÈS, et ne trouvait pas AVANT. */
  why: string
}>

/**
 * L'HISTOIRE de chaque segment, dans l'ordre. **C'est ici qu'on écrit.**
 *
 * Un correctif de collecte ajoute son entrée au bout de la liste de son segment.
 * Il ne touche JAMAIS `SEGMENT_CAPABILITY_EPOCH`, qui s'en déduit.
 */
export const SEGMENT_CAPABILITY_HISTORY: Readonly<Partial<Record<SegmentCapabilityKey, readonly SegmentCapability[]>>> =
  {
    contacts: [
      {
        issue: '#2543',
        commit: null,
        at: '2026-09-18T00:00:00.000Z',
        why: "la couverture des contacts — l'erreur d'indisponibilité du fournisseur d'enrichissement distinguée d'un vide, `total_entries` rendu, seuil de repli INCLUSIF à 5",
      },
      {
        // #2722.1 (23/09/2026) — trou trouvé en diagnostiquant « où la collecte
        // de contacts perd des contacts » (compte comme OGF) : l'élargissement
        // automatique (titres retirés, bande de séniorité complète, UNE passe)
        // existait déjà au commit `8c979a182` mais restait éteint par défaut
        // (`CONTACTS_AUTO_WIDEN_ENABLED=false`) — il ne corrigeait AUCUN compte
        // réel. Il ne devient réel qu'ici, où le défaut bascule à ARMÉ. Sans
        // cette entrée, retirer #2655.1 (ci-dessous) un jour ferait retomber la
        // bascule au 18/09 MINUIT — avant que l'élargissement tourne pour de
        // vrai — sans que rien ne le signale (même classe de défaut que #2655.2).
        issue: '#2543.5',
        commit: '49a5829612ad685e80c5facd5f979a60ec173c6e',
        at: '2026-09-18T08:44:43.000Z',
        why: "l'élargissement automatique d'une collecte restée mince (titres retirés, bande de séniorité) devient ACTIF PAR DÉFAUT — avant, le defaut opt-in ne corrigeait rien pour aucun compte réel",
      },
      {
        issue: '#2655.1',
        commit: 'c66467b743c3d90558b3769a7d2e3c1e7bc51f29',
        at: '2026-09-20T13:08:13.000Z',
        why: 'la relance automatique par famille garde le territoire du scope — avant, une relance élargissait hors zone et la localisation manquait',
      },
      {
        // #3742/#3744 (07/10/2026) — le périmètre « France », choisi par la puce
        // de périmètre OU par le champ géographique, écarte les personnes dont
        // le pays connu est étranger. Un compte collecté avant garde l'Espagne
        // et l'Inde jusqu'à sa relance : son onglet Contacts le DIT. Rien ne
        // rejoue tout seul.
        issue: '#3742',
        commit: '6f8b6d61840186e18cbce3ded2f4a7fd29959921',
        at: '2026-10-07T10:43:49.000Z',
        why: 'le périmètre géographique choisi au lancement (puce « France » comprise) écarte les personnes au pays connu hors zone — avant, une relance « France » gardait des profils d’Espagne ou d’Inde',
      },
      {
        // #4016.3 — SIG-B (11/10/2026), point 3 de l'audit : les recruteurs NOMMÉS par une offre d'emploi
        // gardée (équipe de recrutement de l'offre) deviennent des contacts
        // candidats, prouvés par l'offre. Un compte collecté avant n'en porte
        // aucun : son onglet Contacts le DIT, le rejeu CIBLÉ (geste admin,
        // jamais au déploiement) les lui apporte. `commit: null` — la bascule
        // tient à trois déploiements (IA qui lit l'équipe, API qui l'écrit, web
        // qui montre la preuve) ; `at` est l'instant du commit IA (9926e4b6f),
        // À AJUSTER au jour réel du déploiement s'il diffère.
        issue: '#4016.3',
        commit: null,
        at: '2026-10-11T19:44:31.000Z',
        why: "les recruteurs nommés par une offre d'emploi publiée et gardée deviennent des contacts candidats, avec l'offre pour preuve — devenu réel par trois déploiements (IA + API + web), aucun commit isolé ne porte la bascule",
      },
      {
        // #4465 (22/10/2026) — retour bêta (compte CAFPI) : la fonction affichée était l'AVANT-DERNIER poste. Elle est
        // désormais l'expérience EN COURS chez l'employeur du compte (IA : `current_position.py`). Un compte collecté
        // avant garde l'ancienne fonction jusqu'à son rejeu CIBLÉ du segment contacts — l'onglet Contacts le DIT.
        issue: '#4465',
        commit: '28942839c98a9d83fba96826e205aeaa2409bb2e',
        at: '2026-10-22T12:16:11.000Z',
        why: "la fonction d'un contact est son expérience en cours chez l'employeur du compte — avant, le titre brut du fournisseur (parfois l'avant-dernier poste) était repris tel quel",
      },
      {
        // #4923 (30/10/2026) — retour bêta Julien Laszlo : L'Oréal, Decathlon, AXA sans Head of Data, Head of AI,
        // Directeur Achats ni DSI groupe. La collecte devient PILOTÉE PAR LA DEMANDE (familles cibles, rôles de tête,
        // toutes les ancres du groupe, recherche web par rôle, relance active). `commit: null` — la bascule tient à
        // la PR d'intégration de l'épopée, pas à un commit isolé ; `at` est l'instant de la rédaction, À AJUSTER au
        // déploiement réel s'il diffère (jamais dans le futur : la garde ci-dessus l'interdit).
        issue: '#4923',
        commit: null,
        at: '2026-10-30T16:20:00.000Z',
        why: "la collecte de contacts cherche les rôles de tête des familles cibles de la demande (Head of Data, Head of AI, Achats, DSI groupe) sur toutes les entités du groupe, avec une recherche web ciblée par rôle — avant, un grand compte n'y était jamais cherché",
      },
    ],
    dossier_read: [
      {
        issue: '#2118',
        commit: '4c8169c81239666d8b4eb7959dd06ff1ad35ace0',
        at: '2026-09-14T17:46:41.000Z',
        why: 'le moteur IA devient un émetteur RÉEL de la lecture du dossier en sept axes fixes',
      },
    ],
    signals: [
      {
        issue: '#2291.2',
        commit: '8054769a3047d1cb4a2f552389a71d105d0b527f',
        at: '2026-09-19T11:20:34.000Z',
        why: "l'observation du modèle de contrat survit à l'analyse complète — avant, `_contract_model_overlay` n'existait pas",
      },
      // #2284.17/.33/.58/.26 (#2978, lot SRC2 28/09/2026) — trois correctifs de
      // `raw_analysis.entity_resolution`, écrit par la MÊME `_research` que le
      // reste du segment `signals` (`applyResearch`, comme `access_relation`
      // ci-dessus). Avant ces trois commits, aucun de ces trois faits n'était
      // JAMAIS produit, quel que soit le compte.
      {
        issue: '#2284.17',
        commit: '4cc160f2f8cffedbcc4a0419533c5d7d5d56ee56',
        at: '2026-09-28T18:14:51.000Z',
        why: 'le type « client final » (administration/collectivité/établissement public/association, catégorie juridique INSEE via le registre Sirene déjà branché) devient réel — avant, `_kind_of` ne distinguait aucun de ces types, un compte administratif retombait toujours sur `legal_entity`',
      },
      {
        issue: '#2284.33',
        commit: 'b251120fa6d42c817f5ef2336127425e66cd91d0',
        at: '2026-09-28T18:30:26.000Z',
        why: "les dénominations antérieures du REGISTRE légal (INSEE Sirene, `periodesUniteLegale`) et l'état `historical` deviennent réels — avant, la seule source de renommage disponible était une correction CRM, jamais un fait de registre vérifié",
      },
      {
        issue: '#2284.26',
        commit: '75aa3ca5d5266c7d038059f70b8139d1fc08fa74',
        at: '2026-09-28T18:39:46.000Z',
        why: "le domaine PROUVÉ par un alias de la mémoire marché (`matchedOn: 'alias'`) devient une source de résolution — avant, la table d'alias marché n'était consultée par aucune résolution de compte",
      },
      // #3504 (01/10/2026) — « effectif 53 salariés » contre « Plus de 10 000 »
      // sur la fiche SG : `fetch_company` lisait le code de tranche INSEE comme
      // un effectif. La barrière d'achat est écrite par la recherche Phase 1,
      // donc dans ce segment : elle ne se recalcule qu'à la collecte suivante, et
      // tant que le compte n'est pas rejoué l'écran DIT que sa collecte est
      // antérieure. L'instant est celui du commit ; le déploiement a suivi.
      {
        issue: '#3504',
        commit: 'f9646bdd6f65aac1d1b5374d8cfdee28c608223f',
        at: '2026-10-01T11:31:34.000Z',
        why: "la tranche INSEE voyage comme code (`headcountTranche`) et non plus comme effectif — la barrière d'achat ne lit plus « 53 salariés » pour plus de 10 000",
      },
      // #3916/#3917/#3918 (lot RAK, 10/10/2026) — annonces BODACC des comptes
      // suivis, presse datée par SIREN, signaux CRM (affaire perdue/dormante/à
      // renouveler, changement de poste) : la DERNIÈRE des trois capacités à
      // toucher la collecte est `f9dbf1fe14` (contact_job_change au registre
      // canonique, 09/10 10:43:55Z) ; BODACC `a51c94b26a` 10:27Z, presse
      // `ea576fbb45` 10:29Z, CRM `eb0ea6dd83` 10:23Z. Un compte collecté avant
      // n'a ni annonce légale, ni presse datée, ni lien CRM : le rejeu CIBLÉ du
      // segment (geste admin, jamais au déploiement) les lui apporte. Entrée
      // explicite : l'epoch du segment (#3970, plus récent) ne change pas, mais
      // retirer #3970 un jour ne ferait pas retomber la bascule avant ces trois.
      {
        issue: '#3916',
        commit: 'f9dbf1fe14656b860ef87bc9a5e05c00d426eecf',
        at: '2026-10-09T10:43:55.000Z',
        why: 'les annonces BODACC des comptes suivis (par SIREN), la presse datée rattachée par SIREN et les signaux CRM (#3917, #3918) deviennent réels — avant, un compte déjà analysé ne portait ni « Annonces légales », ni presse datée, ni lien CRM',
      },
      // #3922.3 (K01, 09/10/2026) — recette AE : « 0 lien externe » sur la veille de
      // SG, Sanofi, TF1. Les collecteurs portaient l'URL, mais le signal persisté
      // non : elle se perdait entre le bloc daté du prompt et `recent_signals`. Le
      // pipeline la retrouve désormais par le jeton de la source. Un signal collecté
      // AVANT ne porte pas de lien : l'écran DIT « collecte antérieure au lien
      // source ». `commit: null` — la bascule tient à trois déploiements (IA + API +
      // web) ; `at` est le premier jour entier après la recette, À AJUSTER au jour
      // réel du déploiement si celui-ci diffère.
      {
        issue: '#3922.3',
        commit: null,
        // #3922 / #3935 (lot Q02) — le DÉPLOIEMENT réel : les trois fusions (IA 119681db96 à 06:37Z,
        // puis API et web jusqu'à 07:31Z) du 09/10. « Demain 00:00 » gardait le bandeau sur une analyse
        // NEUVE du soir même (SG, 20:09) : la date de collecte avançait, la capacité restait à venir.
        at: '2026-10-09T07:35:00.000Z',
        why: "chaque signal retrouve l'URL de sa source par son jeton (`stamp_signal_urls`) et la persiste — devenu réel par trois déploiements (IA + API + web), aucun commit isolé ne porte la bascule",
      },
      // #2371.4 (#2887, lot M09, 09/10/2026) — le 10e stade « partenaire actif » :
      // `salesContext.relationship.state` est écrit par la recherche Phase 1
      // (`applyResearch`, la même écriture que `signals_collected_at` —
      // c'est le rejeu de CE segment, pas celui d'`access_relation` qui ne
      // recalcule que l'adressabilité, qui le reclasse). Un compte analysé
      // AVANT ne peut pas porter ce stade, même s'il est un partenaire avec des
      // placements en cours : son écran DIT que sa collecte est antérieure, et
      // le rejeu ciblé du segment (sur geste, jamais au déploiement) le
      // reclasse. `commit: null` — la bascule tient à deux déploiements (IA +
      // API) ; `at` est le premier jour entier après le lot, À AJUSTER au jour
      // réel du déploiement s'il diffère.
      {
        issue: '#2371.4',
        commit: null,
        // #3935 (lot Q02) — le déploiement réel : fusion API 47c29a8515 du 09/10 à 10:42Z (jamais « demain »).
        at: '2026-10-09T10:50:00.000Z',
        why: 'le stade de relation lit les placements EN COURS de la relation partenaire de même SIREN (`partner_relations`, même espace) — avant, un partenaire actif se lisait « froid » ou « connu »',
      },
      // #3970 (lot P07, 09/10/2026) — « c'est toujours la même chose » : offres
      // d'emploi, annonces légales, appels d'offres et marchés attribués entrent
      // dans `recent_signals` par un chemin DÉTERMINISTE et TYPÉ
      // (`merge_collector_signals`, `dated_signals.py`) — avant, ils n'y
      // arrivaient que si le modèle les citait. Un compte analysé AVANT n'a pas
      // ces natures : son écran DIT que sa collecte est antérieure, et seul le
      // rejeu CIBLÉ du segment signaux (geste existant #3922, jamais au
      // déploiement) les lui apporte. `at` est le premier jour entier après le
      // lot, Heure réelle du déploiement IA (09/10/2026, 23:27:32Z).
      {
        issue: '#3970',
        commit: 'a43396ed8f14eabcf9aca7eabb37e12e3625250f',
        // Intégration p-09-10 : jamais « demain 00:00 » (garde Q02 : une capacité n'est pas datée
        // d'un instant à venir) — instant RÉEL du déploiement IA.
        at: '2026-10-09T23:27:32.000Z',
        why: 'les collecteurs datés (offres d’emploi, annonces légales, appels d’offres, marchés attribués) deviennent des signaux TYPÉS de la veille, bornés par nature — avant, ils n’y entraient que cités par le modèle, et la veille ne portait presque qu’une nature',
      },
      // #3978 (lot RBE, 11/10/2026) — chaque signal est classé par DOMAINE D'OFFRE à l'analyse (`domain_code`) : un
      // compte analysé avant n'en porte pas, et sa piste ne peut pas dire « Ce que ça change ». Seul le rejeu CIBLÉ du
      // segment signaux (geste d'opérateur existant, jamais au déploiement) le lui apporte. `at` = le commit (le
      // déploiement IA réel est postérieur : à resserrer sur son instant si l'écart compte).
      //
      // #3978 (rattrapage pains/enjeux, 11/10/2026) — pains et enjeux portent AUSSI leur domaine, et
      // c'est ICI, pas sous `strategy`, qu'ils se rattrapent : `bellum_strategy` tourne DANS la phase 1
      // (`phase1_research`), `applyResearch` les persiste (`raw_analysis.pains`, `it_challenges`) et date
      // `signals_collected_at`. Le plan (`savePlan`, `strategy_collected_at`) ne les régénère jamais :
      // daté sous `strategy`, ce correctif ferait rejouer un `replan` payant qui ne rapporte aucun domaine.
      // Le rejeu `signals` (`refreshResearch`) remplit ensuite le domaine des pistes EXISTANTES, là où il
      // manque seulement (`ProjectsService.fillClassifiedDomains`).
      {
        issue: '#3978',
        commit: '41bbdffe29a2af6d0a38ab4c7a1f6fcbd85acd84',
        at: '2026-10-11T07:23:53.000Z',
        why: 'chaque signal, et chaque pains/enjeux de la phase 1, est classé par domaine d’offre (code de pack) par le modèle — avant, `primary_domain_code` n’était jamais écrit et « Ce que ça change » ne sortait que sur la démo',
      },
      // #4031 (DECATHLON-FIN, 11/10/2026) — les offres d'emploi se rattachent au GROUPE : entités
      // connues, agrégateurs paginés, requête par domaine, offre datée avant un texte non daté, deux
      // entités publiant le même intitulé sont deux offres. C'est le segment `signals` (les offres
      // entrent dans `recent_signals` via `merge_collector_signals`, daté par `applyResearch`) : le rejeu
      // ciblé existant refait les offres, jamais l'analyse entière ni une correction humaine. `at` = le
      // dernier commit du correctif (`8b7612494`) ; l'instant du déploiement IA, plus tardif, resserre.
      {
        issue: '#4031',
        commit: null,
        at: '2026-10-11T18:41:46.000Z',
        why: 'les offres d’emploi de TOUTES les entités d’un groupe remontent (rattachement au groupe, agrégateurs paginés, requête par domaine) — avant, seule l’entité nommée était lue et la veille d’un groupe comme DECATHLON affichait presque aucune offre',
      },
      // #4327 (19/10/2026) — Fortuneo absente du dossier Arkéa : le graphe du registre REMPLAÇAIT les filiales
      // nommées par le web (`_merge_pappers`). Elles s'y ajoutent maintenant (jamais de SIREN inventé). `at` =
      // l'instant de la livraison, À AJUSTER sur le déploiement IA réel ; `commit: null` (la bascule tient au
      // déploiement, aucun SHA isolé ne la porte). Rattrapage : `POST internal/admin/segment-catchup/signals/subsidiaries`.
      {
        issue: '#4327',
        commit: null,
        at: '2026-10-19T19:10:00.000Z',
        why: 'les filiales nommées par le web (filiale indirecte, nom commercial ≠ raison sociale) restent dans le dossier à côté de celles du registre — avant, le registre les remplaçait et Fortuneo manquait chez Arkéa',
      },
      // K1 (recette 21/10, commit df963fb) — `legal_name`, le nom de l'entité dont la fiche affiche les comptes
      // sociaux, n'est collecté (`phase1_research`, daté par `applyResearch` → `signals_collected_at`) que depuis le
      // 21/10 : un compte analysé avant affichait « Comptes sociaux de l'entité immatriculée » sans un mot de
      // pourquoi (Decathlon, 22/10). `at` = l'instant du commit ; l'instant du déploiement IA, plus tardif, resserre.
      {
        issue: '#4398.2',
        commit: 'df963fb2707d4b061522988427aa0abddfe5f216',
        at: '2026-10-21T09:12:39.000Z',
        why: 'le nom légal de l’entité immatriculée est collecté par l’analyse — avant, la fiche affichait des comptes sociaux sans dire de quelle entité ils étaient',
      },
      // #4437.5 (recette 23/10) — chaque OFFRE d'un compte porte son rattachement (compétence, famille métier, type
      // de fait, extrait lu) : `stamp_offer_attachments`, posé par la recherche Phase 1 sur `recent_signals`
      // (`applyResearch` → `signals_collected_at`). Un compte analysé avant n'a aucun rattachement : son écran DIT que
      // sa collecte est antérieure, et seul le rejeu CIBLÉ du segment signaux (geste d'opérateur, jamais au
      // déploiement) le lui apporte. `commit: null` — la bascule tient à trois déploiements (IA + API + web) ; `at`
      // est l'instant du lot, à resserrer sur le déploiement réel s'il diffère.
      {
        issue: '#4437.5',
        commit: null,
        at: '2026-10-23T14:40:00.000Z',
        why: "chaque offre d'emploi lue porte sa compétence, sa famille métier et son extrait (« non classé » quand l'intitulé ne nomme rien) — avant, un intitulé libre n'était rattaché à rien dans la veille",
      },
      // #4754 (28/10/2026) — la collecte des offres descend au-delà de douze mois : avant, une offre de plus de 365
      // jours était coupée AVANT d'être stockée. Un compte analysé plus tôt a donc un historique tronqué à la source ;
      // son écran DIT que sa collecte est antérieure, et seul le rejeu CIBLÉ du segment signaux le lui rend.
      {
        issue: '#4754',
        commit: 'd818e6b7d3d743fd127351890e1a034210c55da6',
        at: '2026-10-28T20:03:39.000Z',
        why: "la collecte des offres descend au-delà de douze mois — avant, une offre de plus de 365 jours était coupée AVANT d'être stockée, donc l'historique d'un compte analysé plus tôt est tronqué à la source",
      },
      // Lot 762 (31/10/2026, décision Louis « pas de limite ») — la borne d'âge de STOCKAGE tombe pour toutes les
      // sources gratuites (offres, marchés publics, presse, levées, BODACC, événements du registre), les deals CRM
      // sans clé se rattachent par nom univoque, DataForge lit le SIREN résolu. Un compte analysé plus tôt a un
      // historique tronqué à la source : son écran le DIT, et seul le rejeu CIBLÉ du segment signaux le lui rend
      // (jamais tout le parc, jamais au déploiement, jamais d'écrasement d'une correction humaine).
      // ⚠️ `commit: null` : IA + API, deux déploiements ; `at` est à REMONTER à l'instant du déploiement réel.
      {
        issue: '#4762',
        commit: null,
        at: '2026-10-31T09:55:00.000Z',
        why: "la collecte ne jette plus une donnée à cause de son âge (offres, marchés publics, presse, levées, BODACC, événements du registre), les deals CRM sans clé se rattachent par nom univoque et l'actualisation écrit aussi les besoins historiques — devenu réel par DEUX déploiements (IA + API), aucun commit isolé ne porte la bascule",
      },
      // #2322.70 (31/10/2026) — mesuré en prod : les 27 offres d'EXTIA n'affichaient que titre, lieu, date. La collecte
      // extrait désormais rôle, équipe, compétences et tension (avec sa raison) du texte de l'offre. Un compte analysé
      // AVANT n'en porte aucun : son écran le DIT, et seul le rejeu CIBLÉ du segment signaux (geste opérateur, jamais
      // au déploiement) les lui apporte.
      // ⚠️ `commit: null` : IA + web, deux déploiements ; `at` est à REMONTER à l'instant du déploiement réel.
      {
        issue: '#2322.70',
        commit: null,
        at: '2026-10-31T15:50:00.000Z',
        why: "chaque offre d'emploi porte son rôle, son équipe, ses compétences et sa tension (avec la raison qui la prouve) lus dans son texte — avant, la carte d'offre ne montrait que titre, lieu et date — devenu réel par DEUX déploiements (IA + web), aucun commit isolé ne porte la bascule",
      },
    ],
    access_relation: [
      {
        issue: '#2298.4',
        commit: null,
        at: '2026-09-19T10:59:00.000Z',
        why: "l'axe RELATION lit missions signées, agenda, e-mails et correction humaine, plus seulement le CRM — devenu réel par DEUX déploiements (IA `d35eddb3f` + API `d4f4392fa`), aucun commit isolé ne porte la bascule",
      },
    ],
    // #4078 (14/10/2026) — LE SEPTIÈME SEGMENT : les cinq blocs du dossier complet
    // (`structural_reading_axes`, `ecosystem_third_parties`, `opportunity_domains`,
    // `financial_indicators`, `data_reliability_notes`). Ils ne sont ni la recherche
    // (`signals`), ni le plan (`strategy`), ni la lecture en sept axes (`dossier_read`) :
    // `DossierBlocksStep` les écrit APRÈS l'analyse, depuis ce qu'elle a déjà collecté,
    // et date `dossier_blocks_collected_at`. Comme `dossier_read`, ce n'est pas une
    // `RefreshDimension` (aucun bouton, aucun crédit). Avant, aucune vraie analyse ne
    // les produisait (seul l'import CSV du dossier complet les posait). `commit` =
    // l'intégration qui a porté l'IA (`POST /dossier-blocks`) ET l'API (l'étape) sur
    // `main` — l'instant du déploiement réel le suit de quelques minutes.
    dossier_blocks: [
      {
        issue: '#4078',
        commit: 'f2258af8ac67a6853ad42b279f0ec054c81770e2',
        at: '2026-10-13T04:58:48.000Z',
        why: "les axes de lecture, l'écosystème tiers, les domaines d'opportunité, les indicateurs financiers et les garde-fous de fiabilité sont produits par une vraie analyse — avant, seul l'import du dossier complet les posait",
      },
    ],
    // #2755 (24/09/2026) — LE PREMIER À S'ALLUMER SUR `entities`.
    //
    // Louis (beta, 23/09) : « il doit toujours y avoir un organigramme ». Le
    // bouton « Enrichir la carte » renvoie `account.raw_analysis` en
    // `research` — snake_case (`accounts.service.ts:3404`,
    // `toSnakeCaseKeys`) — mais `org_graph_build.py` ne lisait que les clés
    // camelCase (`entitiesExhaustive`/`salesContext`/`officialDirectory`) :
    // sur CE chemin précis, ces trois lectures rendaient systématiquement
    // `None`, et l'assembleur ne pouvait construire aucune structure
    // d'entités. `51f284697` ajoute le même double-alias que le reste de
    // l'API et remplace le `pragma: no cover` qui avalait un échec
    // d'assemblage par un `logger.exception` (TDD : 2 tests rouges avant,
    // verts après, `apps/ia/tests/test_org_graph_coverage.py`, 33/33).
    //
    // Avant cette entrée, `SEGMENT_CAPABILITY_EPOCH.entities` était absent et
    // `SegmentStaleCollectionNotice dimension="entities"` ne rendait RIEN
    // pour AUCUN compte (docblock du composant) — le mécanisme de rattrapage
    // était prêt, éteint. Elle l'allume : un compte analysé avant ce commit
    // est désormais CONCERNÉ, et l'écran le dit.
    entities: [
      {
        issue: '#2755',
        commit: '51f284697c948ceb2e866bbe1fdd10e752d69ce9',
        at: '2026-09-23T12:09:58.000Z',
        why: "repli snake_case pour entities_exhaustive/sales_context/official_directory sur le chemin « Enrichir la carte » — avant, ces trois lectures rendaient toujours None et l'assembleur ne pouvait construire aucune entité",
      },
    ],
  }

/**
 * La date de bascule de chaque segment : **la PLUS RÉCENTE de ses capacités**.
 *
 * Dérivée, jamais écrite à la main. Un compte dont la collecte est antérieure à
 * la dernière capacité n'a pas vu AU MOINS une amélioration — donc il est
 * concerné, même s'il a vu les précédentes. Prendre le maximum est le seul choix
 * qui ne rate personne.
 */
export function latestCapabilityAt(capabilities: readonly SegmentCapability[]): string {
  // Comparaison sur le TEMPS, pas sur la chaîne : deux dates UTC valides peuvent
  // s'écrire différemment (millisecondes omises, décalage explicite) et un tri
  // lexicographique les classerait à l'envers sans rien signaler.
  return capabilities.reduce((latest, capability) => {
    if (!latest) return capability.at
    return Date.parse(capability.at) > Date.parse(latest) ? capability.at : latest
  }, '')
}

// ⚠️ PAS de `Object.freeze` ici, et c'est délibéré : la garde
// `segment-catchup.service.spec.ts` SUPPRIME une clé pour prouver le chemin
// « aucune capacité datée pour ce segment ». Geler l'objet ferait échouer un
// test qui a raison, au profit d'une immuabilité que le type porte déjà.
export const SEGMENT_CAPABILITY_EPOCH: Readonly<Partial<Record<SegmentCapabilityKey, string>>> = Object.fromEntries(
  Object.entries(SEGMENT_CAPABILITY_HISTORY).map(([segment, capabilities]) => [
    segment,
    latestCapabilityAt(capabilities ?? []),
  ]),
)

/**
 * La date d'UNE capacité précise d'un segment, repérée par son issue.
 *
 * Pour un écran qui annonce le rattrapage d'un correctif PRÉCIS (ex. la barrière
 * d'achat et la lecture de l'effectif, #3504) : l'epoch du segment avance à
 * chaque nouvelle capacité (#3922.3, le lien source, l'a porté au 10/10), et le
 * relire ferait dire « analysé avant la correction de l'effectif » à un compte
 * qui l'a vue. `undefined` si l'issue n'est pas inscrite : rien ne s'invente.
 */
export function segmentCapabilityAt(segment: SegmentCapabilityKey, issue: string): string | undefined {
  return SEGMENT_CAPABILITY_HISTORY[segment]?.find(capability => capability.issue === issue)?.at
}

/**
 * La dernière collecte d'un segment est-elle ANTÉRIEURE au changement de
 * capacité — donc le compte est-il CONCERNÉ par un rattrapage ?
 *
 * Pure, sans I/O : l'appelant lit la date en base, celle-ci décide. Partagée
 * entre le ciblage API (qui compte les comptes concernés) et l'écran (qui
 * doit dire qu'un chiffre affiché est périmé) — GA-26, un réglage vit à un
 * seul endroit.
 *
 * ⚠️ `null`/`undefined`/date illisible rendent `true` : « non mesuré » n'est
 * jamais « à jour » (doctrine — « non mesuré n'est jamais 0 »). Un compte dont
 * on ne sait pas quand ce segment a été collecté est un compte dont on ne
 * peut PAS garantir qu'il a vu le correctif — donc concerné, jamais supposé
 * bon par défaut.
 */
export function isSegmentCollectionStale(collectedAt: Date | string | null | undefined, capabilityAt: string): boolean {
  if (!collectedAt) return true
  const at = collectedAt instanceof Date ? collectedAt.getTime() : Date.parse(collectedAt)
  if (!Number.isFinite(at)) return true
  const epoch = Date.parse(capabilityAt)
  return at < epoch
}

/**
 * LUDOVIC-C LC.1 (19/10/2026) — la capacité des RÈGLES de contacts repassables sur l'existant
 * SANS recollecte : le filtre d'homonymes (LUDB.5, domaine employeur ≠ compte). La date est
 * celle du commit qui l'a rendu réel à la collecte (`7dcbdc6298`, 19/10 10:25 UTC). Un compte
 * dont le segment contacts a été collecté avant ET jamais remis aux règles depuis est
 * CONCERNÉ : sa fiche propose « Remettre les contacts à jour avec les règles actuelles ».
 * Distinct de `SEGMENT_CAPABILITY_HISTORY.contacts` (qui demande une RECOLLECTE) : ce geste-ci
 * est gratuit et ne prétend aucune collecte.
 */
export const CONTACT_RULES_CAPABILITY = {
  issue: 'LUDB.5',
  commit: '7dcbdc62986dc0e1742c19489c45873dc50397ff',
  at: '2026-10-19T10:25:36.000Z',
  why: "les contacts d'un homonyme (domaine de l'employeur ni celui du compte ni de son groupe) sont archivés avec leur raison",
} as const

/** LUDOVIC-C LC.1 — LE critère « concerné » du geste (écran ET script opérateur, GA-26). */
export function isContactRulesCatchupNeeded(
  collectedAt: Date | string | null | undefined,
  rulesAppliedAt: Date | string | null | undefined,
): boolean {
  const latest = [collectedAt, rulesAppliedAt]
    .map(value => (value instanceof Date ? value.getTime() : value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite)
  if (latest.length === 0) return true
  return Math.max(...latest) < Date.parse(CONTACT_RULES_CAPABILITY.at)
}
