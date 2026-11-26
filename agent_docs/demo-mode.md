---
sources:
  - apps/api/src/modules/demo/demo-dataset.ts
  - apps/api/src/modules/demo/demo-coverage.ts
---

# Mode démo (C1 Théo) — workspace seedé sans coût réel

Un **workspace démo** (`workspaces.is_demo = true`) est un espace stable pour la
vidéo démo et les démos clients : dossiers de conquête complets déjà présents,
aucun crédit consommé, aucune analyse réelle possible.

## Ce que fait un workspace démo

| Comportement                                                                                                                                | Implémentation                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aucun débit crédit** — les actions marchent mais ne débitent jamais                                                                       | Court-circuit dans `CreditsService` (`consumeAnalysisSlot`, `consumeEnrichmentCredit`, refunds no-op, `hasEnrichmentCredit` → true)                              |
| **Pas de VRAIE analyse** — le bouton « Analyser » rejoue le dossier seedé si le nom matche, sinon message clair (403 `demo_workspace`)      | Garde dans `AnalysisService.start` (avant le quota) ; lookup replay à ~10 ans (`DEMO_REPLAY_MAX_AGE_DAYS`)                                                       |
| **Dossiers figés** — les re-runs IA à la demande (enrichir contacts / organigramme / re-plan / refresh) sont refusés                        | `demoGuard` dans `AnalysisOnDemandService` (couvre aussi `AnalysisRefreshService` qui délègue)                                                                   |
| **Bannière « Mode démo »** sur toutes les pages (FR/EN)                                                                                     | `DemoModeBanner` dans `CustomerPageContent`, piloté par `GET /credits → is_demo`                                                                                 |
| **Jamais verrouillé** par l'expiry d'essai                                                                                                  | `getCredits` force `trial_expired: false` en démo                                                                                                                |
| **Jamais échantillonné aux évals** (#2899/#4173) — `chat_eval_sampling_enabled` reste `false` quelle que soit sa valeur par défaut ailleurs | Forcé explicitement à la création/conversion d'une salle (`demo-seed.service.ts`, `demo-pool.service.ts`), pas confié au seul défaut de colonne ; 403 au `PATCH` |

Vide à dessein en démo (`demo-coverage.ts`) : le **frein doux** d'usage (#4464.5, `credits/soft-brake.ts`) — il ne naît
que d'un refus 402 du débit, et une salle de démo ne débite jamais ; le semer imposerait un quota épuisé fictif qui
ferait refuser le premier geste d'un prospect. Le dataset porte aussi les étiquettes `Tier A` / `Tier B` des comptes
(#4291) et l'affaire cadrée « Plan stratégique 2029 » (opportunities + project_contacts, #4291.7).

**La démonstration ne coûte jamais sa session à un utilisateur connecté** (#4608). `POST /demo/session` porte `@KeepOtherSessions()` :
la salle ne purge pas les cookies `session:*` / `uploadsSig:*` du compte réel du navigateur (le serveur lit le cookie que l'onglet
désigne par `X-Bellum-User`). « Quitter la démonstration » ne ferme que l'identité de l'onglet (`X-Bellum-Logout-Scope: tab`), rend
l'onglet à son identité d'avant (`pre-demo-identity.ts`) et revient sur l'écran d'où l'on venait — jamais sur `/login` quand on était
connecté. Les données de démonstration restent fictives et séparées ; seule la session cesse d'être partagée. Aucune donnée à semer.
#4608.3/.5 — une incarnation ouverte à côté ne gagne plus sur la salle : le cookie `imp_session` s'efface quand l'onglet déclare une autre
identité (`X-Bellum-User`), et le bandeau « Tu incarnes » se tait dans un onglet de démonstration (il se relit à l'entrée et à la sortie).

Le flag est résolu depuis le **workspace actif** de l'utilisateur
(`WorkspaceContextService.isDemoWorkspace`, fail-closed → `false` = chemin réel).

## Historique de /signals : chercher et croiser (#4756)

L'onglet Historique (#4755) se filtre à l'écran (`apps/web/src/features/signals-library/model/history-filters.ts`,
`applyHistoryFilters`) : aucun paramètre d'API, donc rien que Zod puisse avaler en silence. Le lieu de l'offre
(`recent_signals[].location`) voyage sur `GET /accounts/signals` (`location`, `toAccountSignalItems`).

**Semis** : Société Générale (premier compte du jeu hors SNCF — le tableau `job_offers` de SNCF n'est pas touché) porte cinq
offres passées (`freshness: 'archive'`, ids `s20` à `s24` de `sgSignals`) : trois « Java » à Lille (juin 2026, février 2026,
septembre 2025 — trois tranches de période), une data à Paris, une SAP à Lyon d'août 2024. Classé `seede` dans
`DEMO_SIGNALS_HISTORY_FILTERS_COVERAGE`, vérifié par `demo-signals-history-filters-coverage.spec.ts`.

**Axes livrés** : métier/techno (texte et compétences), zone (région, `France` explicite), période (4 tranches), volume
(≥ 1, ≥ 3, ≥ 5), texte plein sur l'intitulé — les quatre du cahier — puis famille de métier, secteur, source. Un besoin sans
lieu n'est dans aucune zone, un besoin sans date dans aucune tranche (compté à part, dit à l'écran).

**Axes écartés** (mesure sur les 9 offres passées du jeu de démonstration, pas sur un jeu réel — voir la PR) : type de contrat
(0 % — `readRecentSignals` ne porte aucun champ contrat), taille (0 % — l'effectif est une donnée du compte, absente du flux),
intitulé ROME (0 % — il vit dans la couche `job_offers`, pas dans `recent_signals`).

## Dataset doré (seed)

3 dossiers **fictifs par design** — l'exception explicite à « JAMAIS de données
fictives » : entreprises inventées (domaines `.example` réservés RFC 2606),
personnes inventées, chiffres inventés. Marquage systématique :
`contacts.source = 'demo'` (CHECK élargi par la migration `1785950000000`),
`raw_analysis.demo_seed = true`, données confinées au workspace `is_demo`.

| Dossier                         | Secteur             | Verdict      | Contenu                                                                                              |
| ------------------------------- | ------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| **Groupe Helios** (Lille)       | Grande distribution | GO 8/10      | 6 contacts, 3 angles (build headless recommandé), plan 3 phases, 3 signaux, NIS2/data/omnicanal      |
| **NovaSanté** (Lyon)            | Santé privée        | GO 7/10      | 5 contacts, 2 angles (audit flash cyber recommandé), plan 2 phases, convergence SI post-acquisitions |
| **Altiver Industries** (Nantes) | Industrie           | PRUDENT 6/10 | 4 contacts, 1 angle (MES / usine 4.0), compte « à cultiver »                                         |

Forme = vraie forme prod : colonnes `accounts` + `raw_analysis` snake_case
(`business_description`, `angles`, `comment_ouvrir_compte`, `quick_wins`,
`evaluation`, `plan`, `action_plan`, `entities_exhaustive`, `score_factors`…),
lignes `contacts` (familles, decision_role MEDDIC, messages prêts à envoyer,
lifecycle_state), `attack_angles`, `action_plans.weeks` (`PlanPhase[]`
snake_case). Source : `apps/api/src/modules/demo/demo-dataset.ts`.

### L'onglet « Historique » de `/signals` (#4755)

Le compte vitrine (SNCF) porte quatre offres **passées** (`recent_signals`, `freshness: 'archive'`,
datées du 02/12/2025 au 14/07/2026, compétences Java / Spring / Cloud lues dans l'offre) en plus de ses
signaux du jour. En salle, l'onglet « Historique » se voit donc rempli, et ces quatre offres forment
**UNE** ligne dépliable : une ligne d'Historique est un COMPTE, jamais une offre. Les autres comptes
n'ont aucun besoin passé de métier et ne font **AUCUNE** ligne — on n'affiche pas ce qu'on n'a pas.
Datées pour de bon, ces offres ne remontent jamais dans les signaux récents. Aucune table ni clé
`raw_analysis` neuve : l'onglet range côté écran ce qui était déjà semé. Classement :
`DEMO_SIGNALS_HISTORY_COVERAGE` (`demo-coverage.ts`), garde `demo-signals-history-coverage.spec.ts`.

**Collecte « fraîche » de SNCF (#4837).** `signals_collected_at` de SNCF reste le témoin « collecte fraîche » : elle est
datée APRÈS la dernière capacité du segment `signals` (`SEGMENT_CAPABILITY_EPOCH.signals`). #4754 (offres de plus de
12 mois, 28/10/2026 20:03Z) a avancé cet epoch, la date de SNCF passait au 28/10/2026 20:04Z, puis #4762 (collecte sans borne d'âge, 31/10/2026 09:55Z) l'a repoussée au
31/10/2026 09:56Z — sans quoi le
bandeau « collecte antérieure » s'afficherait sur le dossier vitrine. Garde : `demo-signals-stale-collection-coverage.spec.ts`.

### Parité des comptes de brief — historique et affaires (R33b, 16/10/2026)

Décision Louis (12/10, 13/10) : en démo aucun compte mince. Renault, Airbus, EDF, Thales et Orange s'ouvraient sur « Aucun échange enregistré » et zéro affaire. `demo-parity-history.ts` les met à parité avec Société Générale, **sans toucher `demo-dataset.ts`** : activités datées (`activities`, avec une réponse reçue et des appels), actions faites (`user_actions` : analyse, action du plan, message copié) et 1 à 3 affaires par compte (`opportunities` + `commercial_transitions`, dates relatives au reset), écrites par `DemoSeedService.seedParityHistory` juste après `seedExtensionAccounts`. Les échanges portent sur le compte (`contact: null`, décision 04/10) ; les affaires se rattachent PAR NOM aux décideurs déjà semés (`project_contacts`, un nom introuvable saute la ligne). Aucune table neuve : le reset purge par `workspace_id` / `ON DELETE CASCADE`. Garde : `demo-parity-history.spec.ts`.

### Refonte Pilotage L0 (14/10/2026)

- **Mémoire collective** : l'écran est supprimé. Ses quatre blocs propres (principe, ce qui reste privé, politique de l'espace, mises en relation du mois) sortent de `demo-coverage.ts` avec lui. Ils sont retirés, jamais passés en « vide à dessein ». `workspace_bridge_contacts` reste seedée parce que l'API l'écrit toujours, et les croisements restent affichés dans le bandeau Collaboration de la fiche compte.
- **Nom déduit de l'adresse** (#4586.5) : Élise Varennes (client d'exemple, `DEMO_DELIVERY_CLIENT`) porte `name_derived_from_email` → `raw_data.nameDerivedFromEmail`, la même clé que l'import réel ; la liste `/contacts` la montre « estimé ». Aucune table ni clé de `raw_analysis` neuve. Garde : `demo-name-derived.spec.ts`.
- **Qualité / Marché** : la file « À départager » et la vérité du marché vivent sur `/accounts/marches` (ex-`/pilotage/qualite` et `/pilotage/marche`). Les tuiles de `/pilotage` se lisent dans le bloc « Données à compléter ».
- **E-mail de la propriétaire de la salle** : le profil de la salle appartient à un compte du pool, donc `profiles.email` porte l'adresse d'un vrai compte. `/team` affiche à la place l'adresse du jeu (`maelle.lorquin@exemple.test`, domaine `.test`). Aucune adresse réelle ne sort d'une salle démo.

### Refonte Pilotage L1 — Cockpit (14/10/2026)

- **Ce qui a bougé cette semaine** (`GET /pilotage/week-delta`) : aucune table neuve. `DEMO_PILOTAGE_WEEK_MOVES` sème neuf affaires sur les comptes à brief de la salle (Société Générale, Groupe BPCE, ENGIE, TotalEnergies, Alstom, BNP Paribas), avec leur parcours dans `commercial_transitions` : trois créées (dont une sans montant saisi, jamais « 0 € »), trois avancées, une reculée, une perdue, une signée. Les dates sont relatives à la visite, donc les sept compteurs restent remplis quel que soit le jour.
- **Encaissé** : `DEMO_PILOTAGE_RECENT_PAYMENTS` ajoute trois règlements des cinq derniers jours, sur un mois que l'historique de facturation D42 n'utilise pas.
- **Missions qui finissent** : rien de neuf, les missions du jeu finissent déjà à 12 et 28 jours.
- **Objectif du mois** : lit `member_objectives`, déjà semé (`DEMO_MEMBER_OBJECTIVE`).
- Classement : `DEMO_PILOTAGE_WEEK_DELTA_COVERAGE` (seedé), tenu par `demo-pilotage-week-delta-coverage.spec.ts`.

### Refonte Pilotage L3 — Staffing (14/10/2026)

- `DemoSeedService.seedStaffing` remplit `/pilotage/staffing` à chaque semis, en dates relatives à `now` : le coût journalier de six consultants (`consultants.cost_rate_cents`), Léa Fontaine volontairement sans coût pour montrer « coût non renseigné » ; un congé à venir et un congé déjà pris (`consultant_absences`) ; les jours saisis du mois courant sur quatre missions (TACE réel) ; un seuil d'alerte TACE de 80 % (`workspaces.tace_alert_threshold_percent`).
- Fins de mission à 30 / 60 / 90 jours et TACE du mois précédent : missions et relevés déjà semés, rien de neuf.
- Classement : seedé dans `demo-coverage.ts`.

### Refonte Pilotage L2 — Pipe (14/10/2026)

- **Inspection** : `DEMO_PIPE_L2` sème douze affaires sur les comptes réels de la salle, avec des catégories déclarées variées (dont des « non déclarées ») et des dates prévues dépassées ou repoussées. Trois opportunités déjà semées reçoivent aussi une catégorie.
- **Waterfall** : journal des stades (`commercial_transitions`) et des montants (`opportunity_field_changes`) placé dans le mois en cours, relatif à `now` : jamais vide, quel que soit le jour du mois.
- **Signaux de risque** : les cinq familles de faits (aucune activité, date dépassée, date repoussée, montant baissé, étape inchangée) sont exercées.
- **Vide à dessein** : le bloc « par commercial » à plusieurs commerciaux. Pas de coéquipiers fictifs (Louis 14/10/2026) : il ne montre que le commercial de la salle, plus la ligne « non attribué ».
- Classement : `DEMO_PIPE_COVERAGE` et `opportunity_field_changes` dans `demo-coverage.ts`.

### File de pistes (#4292.5, Louis 29/10/2026)

La liste existait sous **trois noms** (« Pistes de Laura », « Pistes à qualifier », « Pistes détectées
sur tes comptes ») : en démonstration, personne ne la trouvait. **Une liste, un nom** — le panneau du
Pipe (`/projects?pistes=1`) s'appelle « File de pistes » (`projects:detections.drawerTitle`), GA-26,
aucune liste de plus.

- **Semis** : `seedPipelineDetections` écrit trois passages « détecté, à revoir » dans
  `pipeline_detections` — un intérêt exprimé à l'appel sur SNCF, une shortlist, un entretien, tous lus
  dans la salle. Sans ces lignes, **la file serait vide devant un prospect**.
- Classement : `DEMO_FILE_DE_PISTES_COVERAGE` (état `seede`) dans `demo-coverage.ts`.

### Levée de fonds (#4285.1)

La carte de levée **s'affiche à l'arrivée** de la démonstration, avec son lien de source — elle ne
dépendait plus de rien et ne se montrait jamais. Classement : seedé dans `demo-coverage.ts`.

### Ce que les dossiers rejouent du vrai chemin

- **Un dossier cadré sur une zone** (#4556 / #4432.4) : Airbus (siège à Blagnac) porte un run de
  vérification cadré Occitanie (`analysis_runs.scope_selection` : `geo_perimeter: 'region'`,
  `geo_areas: ['Occitanie']`). Ses contacts rejouent les **trois** cas de `scope_filter.py` : lieu
  dans la zone (en tête), lieu connu hors zone (écarté, motif `hors zone (Occitanie)` dans
  `contacts.exclusion_reason`), lieu **inconnu** (`location` null, jamais écarté — on n'écarte pas
  ce qu'on ne sait pas). Les trois interlocuteurs portant un lieu sont fictifs
  (`demo-occitanie-dossier.ts`) : un lieu de travail ne se pose jamais sur une personne réelle.
- **Le poste EN COURS et les départs** (#4465) : des contacts portent trois postes dont un seul
  « Actuel » dans `contacts.apollo_enrichment.employment_history` — en-tête, « Fonction » et
  sous-titre du bloc « Profil professionnel » disent alors le même intitulé, celui du poste en
  cours, jamais celui d'un ancien. D'autres sont **partis** : leur poste chez le compte porte une
  date de fin (relative au semis), la fiche dit « A quitté l'entreprise (mois année) » et
  l'organigramme ne les compte plus. Jamais sur un dirigeant réel.

Chaque nouveauté est classée dans `demo-coverage.ts` — **seedée** ou **vide à dessein avec sa
raison** — et tenue par une garde (`demo-occitanie-dossier-coverage.spec.ts`,
`demo-contact-poste-coverage.spec.ts`) qui fait échouer la CI tant que la question n'a pas de
réponse écrite.

## Créer un workspace démo (backoffice)

```
POST /internal/admin/workspaces/demo
Headers: x-internal-secret: <INTERNAL_API_SECRET>
Body: { "ownerUserId": "<uuid>", "name": "Démo Bellum" }   # name optionnel
→ { workspaceId, name, ownerUserId, isDemo: true, accounts: 3, seeded: true|false }
```

Flow recommandé :

1. Créer un **utilisateur dédié à la démo** (signup normal, ex. `demo@bellum-ai.com`) —
   son workspace seedé au signup est vide.
2. Récupérer son `userId` (backoffice « Users »).
3. Appeler l'endpoint : le workspace existant (vide) est **converti** en démo
   (`is_demo = true`, renommé) puis seedé.

Règles de sûreté :

- **409** si le workspace du user contient déjà des dossiers réels (un typo
  opérateur ne peut pas basculer un client en gratuit) → utiliser un compte frais.
- **Idempotent** : ré-appeler ne duplique jamais le seed (pattern lazy-seed,
  comme `LibraryService`) — `seeded: false` + le compte des dossiers existants.
- Un user sans workspace en reçoit un neuf (`is_demo`) + membership owner.

## Pool de salles — plusieurs visiteurs EN MÊME TEMPS

Le lien partagé (`<FRONTEND_URL>/demo`) menait à UN espace unique. Deux
conséquences, toutes deux corrigées par le pool :

1. le deuxième visiteur déclenchait la remise à neuf (~35 DELETE) et **effaçait
   les dossiers du premier en pleine présentation** ;
2. tous les visiteurs partageaient la même identité, donc le fil du copilote de
   l'un était **lisible par l'autre**.

Une **salle** = un workspace `is_demo` + SON utilisateur. Le lien en loue une par
visiteur (`DemoPoolService.acquire`) :

| Situation                                         | Ce qui se passe                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Le navigateur occupe déjà une salle (bail vivant) | Il y retourne **intacte** — un rechargement n'efface jamais une démo en cours |
| Une salle est libre (jamais louée / bail expiré)  | Elle est **purgée + re-semée pendant qu'elle est libre**, puis louée          |
| Tout est occupé, pool pas plein                   | Une salle est **provisionnée à la demande** (user Supabase dédié + workspace) |
| Tout est occupé, pool plein                       | On **reprend le bail le plus ancien** (jamais de refus) + `logger.warn`       |
| Aucun espace de démo n'existe                     | 503 — l'opérateur doit créer le premier (endpoint backoffice ci-dessus)       |

Points non évidents :

- **L'appartenance se lit sur le cookie `bellum_did`**, minté par le contrôleur
  AVANT le bail. C'est ce qui empêche un rechargement — ou un robot qui suit le
  lien public — de consommer (et d'effacer) une salle de plus.
- **La purge n'arrive que sur une salle libre.** C'est le renversement central :
  avant, elle arrivait à l'arrivée d'un visiteur, donc sur le dos du précédent.
- **Le pool est borné** (`DEMO_POOL_SIZE`, défaut 8) : un endpoint public ne peut
  pas faire créer un nombre illimité de comptes Supabase.
- **Adoption sans migration de données** : l'espace créé par l'opérateur devient
  la salle n°1 au premier passage (`demo_slot_index = 1`).
- Les adresses des salles dérivent de celle de la salle n°1 par sous-adressage
  (`demo@…` → `demo+demo2@…`). Comptes **sans mot de passe** (session ouverte par
  magic link admin, comme le 2FA), désabonnés des e-mails produit.
- Le cap anti-partage d'appareils reste **exempté** pour un compte démo
  (`SessionRegistryService`) — sinon le 3ᵉ onglet évincerait le 1ᵉʳ.
- `DEMO_POOL_SIZE=1` reproduit exactement l'ancien comportement.

Env (défauts actifs, zéro-config) : `DEMO_POOL_SIZE` (défaut 8),
`DEMO_LEASE_TTL_MINUTES` (défaut 30 — durée du bail, pas une déconnexion). **Le bail suit l'activité (#3511, 01/10/2026)** : `POST /demo/session` avec `{ renew: true }` (cookie `bellum_did`, sans jeton, aucune route de plus — gel GA-05) re-date le bail de la salle que le navigateur tient et rend une session neuve ; l'onglet de démo l'utilise comme porte de renouvellement à la place de `/auth/refresh` (échéance du jeton, 401) et en battement toutes les 10 min tant qu'il est visible. Une salle reprise par un autre visiteur répond 401 : une vraie expiration reste une expiration. Les règles de session de la production ne bougent pas.

## Deux espaces démo : staffing et forfait / conseil (#4291 lot J, 21/10/2026)

Décision Louis (21/10) : « Oui, un 2e espace démo au profil forfait / conseil ». La démo staffing ne change pas.

- **Entrée** : `/demo` porte deux boutons, « Lancer la démo » et « Lancer la démo forfait / conseil ». Le second
  envoie `profile: 'forfait_conseil'` à `POST /demo/session`. Même jeton, même bail, même sortie. Le choix passe
  par le formulaire `/demo/acces` dans la query (`?profil=forfait_conseil`, `features/demo/demo-profile.ts`).
- **Pas de second moteur** : même pool, même remise à neuf, même semis. La variante se lit sur le **numéro de salle**
  (`demo-room-variant.ts`) : salles staffing 1..N, salles forfait 1001.. (« Démo Bellum forfait 1 », adresse
  `+demo1001@`). Aucune colonne, aucune FK, aucune migration.
- **Isolation** : le visiteur forfait ne voit que les salles forfait, et l'inverse. Le provisionnement, le recyclage
  et la remise à neuf ne portent que sur sa variante. Un appareil tient UNE salle : passer d'une démo à l'autre rend
  l'autre salle (bail échu, remise à neuf par le balayage, jamais dans la requête). Comme toute salle,
  `chat_eval_sampling_enabled = false` est forcé au provisionnement (#4173).
- **Empreinte** : staffing garde `DEMO_SEED_FINGERPRINT` à l'octet. La salle forfait a sa propre empreinte
  (`demoSeedFingerprintFor`). Une salle semée dans la mauvaise variante est périmée, donc re-semée.
- **Semis** (`seedForfaitVariant`, après le semis staffing entier, avant l'empreinte) : trois comptes fictifs
  (`demo-forfait-dataset.ts` : Mutuelle Horizon Santé, Valmont Distribution, Régie des Eaux du Grand Ouest). Ils
  passent par le même `seedDossier`, avec des contacts aux noms complets dont des décideurs, des signaux datés, des
  angles et un plan. S'y ajoutent cinq besoins lus comme projets à cadrer (périmètre, sponsor =
  `decision_maker_contact_id`, budget, échéance) et deux projets gagnés suivis en forfait encadré (mission sans
  consultant, `need_id`). Enfin `esn_profiles.workspace_profile = 'forfait_conseil'`. Le vivier reste celui du
  semis staffing, au second plan de la navigation.
- **Couverture** : `DEMO_FORFAIT_ROOM_COVERAGE` (`demo-coverage.ts`) liste les tables écrites, toutes déjà semées
  et purgées par espace. Il classe aussi les clés `raw_analysis` des comptes forfait : semées, ou vides à dessein
  avec leur raison. Garde : `demo-forfait-room.spec.ts`.

## Ce que la démo seede depuis le 13/10/2026 (#4115, #4116)

- **Grille de signaux de Découvrir (#4115)** — classée _seedée_ dans `demo-coverage.ts`
  (`DEMO_DISCOVER_SIGNAL_GRID_COVERAGE`) : Aubrac Aerostructures porte le plafond de la règle
  (5 signaux forts puis 10 de contexte) ; `tier` voyage sur chaque signal de la réponse scriptée `/discover`.
- **Marchés publics (#4116)** — la clé `raw_analysis.public_tenders` n'est plus « vide à dessein » : EDF porte
  deux avis européens RÉELS (`demoPublicTendersOf` dans `demo-dataset.ts`), aux vraies dates de publication
  (nov. 2024, relues sur l'API de la source). Ni lieu ni date limite : l'avis n'en porte pas, elles restent
  nulles. La source n'est jamais nommée (libellé d'écran « Marchés publics »). Ces avis quittent la fenêtre de
  24 mois de la collecte fin nov. 2026 : les remplacer alors par des avis plus récents.
- **Propositions de doublons de personnes (#4114)** — classées _seedées_ (`DEMO_CONTACT_DUPLICATE_PROPOSALS_COVERAGE`,
  `demo-coverage.ts`) sans aucun semis dédié : la lecture `GET /contacts/account/:id/duplicate-proposals` calcule à la
  volée sur les contacts déjà semés, qui portent de vraies variantes d'orthographe (Denys / Denis Duyck,
  Jérome Lemoine / Jérôme LEMOYNE, Vincent Vandenberge / Vandenberg Vincent chez Société Générale et ENGIE). On
  PROPOSE, on ne fusionne jamais. Garde : `demo-duplicate-proposals-coverage.spec.ts`.
- **Lot UX atomic (#4134 à #4137)** — classé _seedé_ (`DEMO_UX_ATOMIC_COVERAGE`). Seule donnée neuve :
  `DEMO_DELIVERY_CLIENT.archivedProject` (opportunité avec `archived_at` posé, étape `dormant`, jamais `lost`) qui
  remplit l'onglet « Archivés » du pipe (#4137). Le report de tâche (#4134) et la feuille note-tâche (#4135) relisent
  `tasks` et `notes` déjà semées ; tirer pour rafraîchir (#4136) n'affiche aucune donnée. Garde :
  `demo-archived-project-coverage.spec.ts`.
- **Lot S7, 14/10 (#3236.2(b), #3921)** — deux entrées de plus classées _vide à dessein_ dans
  `demo-coverage.ts` : `chat_deepen_jobs` (la trace d'un approfondissement Laura interrompu —
  aucun tour Approfondi n'est matériellement lancé en démo, les réponses y sont scriptées) et
  `headcount_change` (un changement de tranche d'effectif observé sur le SIREN d'un compte réel
  apparaîtrait sur tous les espaces qui le suivent ; la carte « Annonces légales » existante suffit
  à le montrer le jour où `sirene_snapshots` aura deux relevés mesurés pour un SIREN suivi).
- **Lot B3, 15/10 (#2875/#3398)** — bulle `forecast_revenue_declared_blocked` classée _atteignable_
  (`DEMO_LAURA_BUBBLES_REACHABLE`) : la mission « Socle conteneurisé… » de la salle porte
  `renewal_status: 'bloque'`, que la mesure `forecastDeclaredBlockedMissions` compte. Aucune donnée neuve.

## Continuité d'équipe en salle (#4158.28, .30, .31 — lot L5, 14/10/2026)

Trois choses montrées, posées par `demo-team-continuity.ts` et `DemoSeedService.seedTeamContinuity` (des `UPDATE`
sur des lignes déjà semées — aucun `INSERT` neuf) : le digest du manager (une ligne `manager_digest` dans la cloche,
des dénombrements sans nom), les modèles de séquence PARTAGÉS avec l'équipe et signés d'un collègue fictif
(`created_by`, `visibility = 'team'`), et UNE action ouverte du plan déléguée à l'occupant avec sa note de contexte
(`handoff_note`). Le collègue fictif n'est pas un membre de la salle (un seul occupant réel) : c'est l'auteur désigné
par deux colonnes sans clé étrangère, donc l'écran n'affiche pas de nom inventé.

### Un besoin passé pour l'outil de Laura (#4759)

Le compte vitrine (SNCF) porte un besoin **daté du 12/11/2025** avec sa techno (« Lead développeur
Java (H/F) », Paris 75, source APEC), pour que l'outil `internal/copilot/account/needs-history` ait de
quoi répondre en salle : Laura dit « vous cherchiez un lead Java en novembre dernier », l'âge lu sur la
date et jamais déduit. Aucune table ni clé `raw_analysis` neuve — l'outil relit
`raw_analysis.it_job_signals`, déjà classée seedée, et sa réponse reste **bornée** par
`needs-history.limits.ts` : Laura cite une tranche, jamais le dossier entier. Fictif comme le reste du
jeu doré.

## Fichiers

- Migrations : `apps/api/src/migrations/1785950000000-DemoWorkspace.ts`,
  `apps/api/src/migrations/1788250000000-DemoPool.ts` (bail : `demo_slot_index`,
  `demo_leased_at`, `demo_lease_device`)
- Module : `apps/api/src/modules/demo/` (dataset + `DemoSeedService` +
  `DemoPoolService` + `DemoResetService` + `DemoLinkService`)
- Couverture et cas rejoués : `demo-coverage.ts` (le registre), `demo-occitanie-dossier.ts`
  (dossier cadré sur une zone), `demo-contact-density.ts` (postes en cours et départs)
- Endpoint : `apps/api/src/modules/admin/internal-admin.controller.ts` (`POST workspaces/demo`)
- Gardes : `credits.service.ts`, `analysis.service.ts`, `analysis-ondemand.service.ts`,
  `workspace-context.service.ts` (`isDemoWorkspace`)
- Web : `apps/web/src/components/layout/DemoModeBanner.tsx` (+ i18n `common.demo.*`)

## Ce que le registre de couverture a gagné (25/10/2026)

Chaque nouveauté user-facing est classée dans `apps/api/src/modules/demo/demo-coverage.ts` — **seedée**,
ou **vide à dessein avec sa raison** — et les gardes `demo-coverage.spec.ts` (tables ET clés de
`raw_analysis`) font échouer la CI tant que la question n'a pas de réponse écrite.

- **Le poste EN COURS et les départs** (#4465) — SEEDÉ, sans table ni clé neuve : l'écran lit
  `contacts.apollo_enrichment.employment_history`. Des contacts à recrutement récent (Société
  Générale, SNCF…) portent trois postes dont un seul « Actuel » : en-tête, « Fonction » et
  sous-titre du bloc « Profil professionnel » disent alors le même intitulé, celui du poste en
  cours. D'autres sont partis : leur poste chez le compte porte une date de fin (relative au
  semis), la fiche dit « A quitté l'entreprise (mois année) » et l'organigramme ne les compte plus.
  Jamais sur un dirigeant réel.
- **Découvrir arrive neutre, « Ma cible » est un bouton** (#4529 + #4530) — SEEDÉ **par le profil
  déjà en place**, aucun semis de plus : l'arrivée ne lit rien du profil (aucune zone, aucun
  secteur posé d'office) ; le bouton « Ma cible » pose les secteurs prioritaires, la zone et le
  niveau de décision du profil de l'espace démo (`DEMO_ESN_PROFILE.priority_sectors` /
  `geo_zones`, `DEMO_PROFILE_CONTEXT.idealAccountProfile`).

## Limites connues

- L'enrichissement **contact unitaire** (Apollo/Dropcontact) reste techniquement
  possible en démo (gratuit — pas de débit) : sur des contacts fictifs, Apollo ne
  matchera rien → « aucun résultat » propre. Les re-runs IA de phases, eux, sont
  bloqués (dossiers figés).
- Le replay matche par **nom exact** (case-insensitive) du dossier seedé : taper
  « Groupe Helios » rejoue le dossier ; tout autre nom → message clair.
- Multi-workspace (Phase 3 switcher) : le workspace actif = le plus ancien
  workspace POSSÉDÉ ; d'où le flow « compte dédié démo » (et une salle du pool =
  un utilisateur qui ne possède QUE sa salle).
- Pool saturé : la salle au bail le plus ancien est reprise **même si son bail
  court encore**. Refuser la démo à un prospect serait pire ; le cas se signale
  dans les logs (`Demo pool saturated`) et se corrige en montant `DEMO_POOL_SIZE`.

## Semis du 13/10/2026

- **#3295** — deux REX de perte au MÊME motif (BNP Paribas, ENGIE) : « Proposer une règle » a sa matière en démo.
- **#4068** — carte Découvrir Aubrac Aerostructures : recrutement (fort), salon, technologie, résultat financier
  repris par deux sources ; `funding`/`business` atteignent la carte.
- **#4044** — une offre de STAGE semée à dessein : stockée, jamais servie (`demo-internship-excluded.spec.ts`).
- **#3819** — la compétence cherchée suit le compte (grand arrêt = maintenance).
- **#4646** — l'offre qui a fait sortir le compte de Découvrir suit jusqu'au dossier (TotalEnergies : « Responsable maintenance — arrêt programmé », datée du 12/10, vue le 20/10) ; recopiée en tête des signaux de recrutement, jamais effacée par le rejeu.
- **Parité Orange / Groupe BPCE (13/10, PR #4138)** — Orange (compte d'extension) porte besoins, signaux de RECRUTEMENT IT datés relativement à l'ouverture de la salle (jamais de stage), vision et plans stratégiques (jamais `appel_offres`), programmes, stack, unités, chaîne d'achat et plan d'action (`DEMO_ORANGE_BPCE_PARITY_COVERAGE`). Vide à dessein : route recommandée, prix observés, entités juridiques au-delà du dossier. 14/10 (PR #4152, recette sur salle fraîche) : les offres semées sont les 16 offres RÉELLES collectées par le pipe produit (`orange-jobs-collected-13-10.ts`) ; le brief gagne `besoins-recents` (une ligne par offre réelle, 19 besoins avec les 3 du dossier) et `technos-a-vendre` (26 technos, chacune citée dans une offre réelle ou un profil du relevé — moins que BPCE, rien d'inventé pour combler) — `orange-needs-technos.ts`.
- **Orange : sept axes, fiabilité, technologies en place, garde-fous retirés (14/10)** — Orange sème `raw_analysis.evaluation.dossier_read` (les sept axes ; `adequation_offre` et `capacite_achat_externe` restent « inconnus » et NOMMÉS, jamais 0) et `data_confidence` (58, niveau moyen), donc ni « antérieure à la lecture en sept axes » ni « antérieure à la grille de fiabilité » ; `technology_stack` reprend les technos de la section TECHNOS (`orangeTechnologyStack`), donc « Technologies en place » n'affiche plus « non mesuré ». Les garde-fous (`data_reliability_notes`, `commercial_brief.guardrails`) ne s'affichent plus NULLE PART dans le web (Louis 13/10) : la donnée reste stockée, et les textes internes de démo (« ouverture de la salle », « de démonstration ») sont retirés du semis Orange. Les 14 critères « non évaluable » de la grille de qualification restent un fait de la grille de l'espace démo (seule Société Générale est qualifiée).
- **Sept axes et fiabilité pour TOUS les comptes (14/10, Louis « go pour tout »)** — `withDemoDossierRead` (`demo-dossier-read-seed.ts`) pose `raw_analysis.evaluation.dossier_read` (sept axes) et `data_confidence` sur tout compte de la salle (dossiers, extension, analysés) qui ne les porte pas, calculés des décomptes de la matière déjà semée (offres, signaux, défis, ESN citées, brief) ; `adequation_offre` et `capacite_achat_externe` restent « inconnus » et NOMMÉS, un axe sans matière aussi — jamais un zéro, jamais écrasé si le dossier a déjà sa lecture. Le Score lit la fiabilité par `readDossierReliability`, la MÊME lecture que la Vue d'ensemble (GA-26). Une note de fiabilité « Garde-fou » ne se rend plus (`KeyNotesCard`). Orange sème aussi `raw_analysis.competitors` (ses ESN du dossier, sans force ni faiblesse inventée) : « ESN déjà en place » les liste.
- **Plus de bandeau « collecte antérieure » en démo (13/10)** — `demoCollectedAtColumns` pose les sept dates `*_collected_at` au semis (dont `dossier_blocks_collected_at`, #4078 — les cinq blocs sont semés), relatives à l'ouverture de la salle ; la production est inchangée (`DEMO_NO_STALE_COLLECTION_BANNER_COVERAGE`, `demo-no-stale-banner.spec.ts`).
- **/mes-cibles : « Pourquoi ça compte » jamais vide (#4088.12, 14/10)** — un type de signal sans besoin d'ESN établi (partenariat, restructuration, établissement…) affiche « Signal « type » · secteur : aucun besoin d'ESN établi à ce type, à qualifier » (`buildWhyLine`, lu du type et du secteur déjà semés) : les 13 lignes « Autres » de la démo ont leur raison, sans besoin ni signal inventé.
- **Invitations : « Renvoyer » vide à dessein (14/10, #4158.2)** — `workspace_invitations` reste vide en démo (une salle de démonstration a un seul occupant) ; le bouton « Renvoyer » d'une invitation en attente vit sur ces lignes et n'apparaît donc pas. Raison inscrite dans `demo-coverage.ts`. Le semis de collègues fictifs est le lot L2 (#4158.13).
- **`contacts.email_sent_observed_at` vide à dessein (14/10, #4179.2)** — aucune boîte connectée ni envoi en salle de démo (`demo_send_blocked`) : un horodatage afficherait « dans les éléments envoyés » sans qu'un message soit parti (`demo-coverage.ts`).
- **Découvrir, critères de Contacts / Besoins / Liste d'appels dans le volet de recherche : SEEDÉ (27/10, #4634)** — les champs quittent le dessous des résultats pour le volet du haut (`ProjectionSearchFields.tsx`) ; fonction, entreprise, entité, localisation et relation partent dans `GET /contacts`, qui lit en démo les personnes déjà semées des dossiers (`DEMO_DOSSIERS[].contacts` : `title`, lieu dérivé du siège par `demoLocation`, `user_status` à `new` sauf déclaré). Aucune table ni clé `raw_analysis` neuve, aucun semis de plus. Entrée `DEMO_DISCOVER_PROJECTION_FIELDS_COVERAGE` ; garde : `demo-discover-projection-fields-coverage.spec.ts`.
- **Découvrir, section « Marché observé » : RETIRÉE (31/10, lot K — revient sur #4632, #1626)** — décision de Louis : les comptes de la mémoire marché entrent dans la liste (source, #4791.2), la section sous la liste disparaît avec `MarketObservedSection.tsx`. Plus de capacité à couvrir : `DEMO_DISCOVER_MARKET_OBSERVED_COVERAGE` et sa garde sont supprimées (la capacité n'existe plus ; rien n'est déplacé vers « vide à dessein »). Le rail « Tous les filtres » garde ses champs ; le lot F les branche sur la recherche.
- **Découvrir, employeur à identité « en cours » : SEEDÉ (28/10, #4674)** — un employeur prouvé par une offre mais que le registre public n'a pas résolu SORT désormais dans la liste (décision de Louis du 28/10/2026) : en salle, Ateliers Delorme (Colmar) part dans `skillPendingEmployers` avec sa ville et sa preuve datée (lien `example.org`), **sans SIREN ni action** — rien qui dépende du SIREN ne s'ouvre sur cette ligne, et l'écran dit pourquoi. `skillSearch.unresolvedRendered` le compte, à part de « non tenté (délai) ». VIDE À DESSEIN : aucun SIREN n'est inventé pour lui, et les états voisins (`pending`, `unmatched`) ne sont pas semés — un seul cas suffit à la salle, leurs libellés sont tenus par le test d'écran. Garde : `demo-discover-skill-coverage.spec.ts`.
- **Découvrir, motif FINAL de l'employeur non résolu : SEEDÉ (29/10, #4712)** — l'employeur fictif en homonymie (Ateliers Delorme, Colmar) porte `identityReason: 'homonym_on_site'` : « plusieurs entités du groupe recrutent ici — aucune n'est choisie au hasard », et le titre de la section ne promet plus une attente (« … sans SIREN »). L'entité résolue par l'établissement sur place est Rhénalp Équipements (siège Bartenheim, offre à Mulhouse). **Vide à dessein** : le motif `brand_or_program` (« marque ou programme — entité non nommée ») n'est pas semé, il se couvre par le test d'écran `SkillPendingEmployers.test.tsx`.
- **Découvrir, « signaux en cours » sur une carte : vide à dessein (28/10, #4677)** — `signalsState` (`pending` / `none` / `unavailable`) dit pourquoi une carte n'a pas encore ses signaux, depuis que la moisson de signaux est sortie du budget de la liste. `pending` n'existe que **tant qu'une moisson d'arrière-plan court** : la liste de Découvrir en démo est scriptée (`demo-scripts.ts`, zéro appel réseau), aucune moisson ne tourne, et un « en cours » seedé ne se résoudrait jamais — un chargement éternel devant un prospect est pire qu'un trou. `none` (« aucun signal mesuré », `signalsSearched: true`) est déjà visible ; `unavailable` suppose une source qui répond mal, impossible sans réseau. Entrée `DEMO_DISCOVER_SIGNALS_PENDING_COVERAGE` ; garde : `demo-discover-signals-pending-coverage.spec.ts`.
- **Cloche : « Vider » et purge hebdomadaire (27/10, #4648)** — aucune table neuve : `notifications` reste SEEDÉE (`seedNotifications`, dates relatives au semis, la plupart à moins de 7 jours — elles survivent à la purge `notifications-weekly-purge`, qui n'emporte que ce qui a plus de 7 jours). « Vider » en salle supprime les notifications semées de l'occupant ; la table est re-semée à chaque bail (`DEMO_PURGE_USER_TABLES`).
- **Nature du téléphone (14/10, #4178)** — `phone_nature` / `phone_nature_source` SEEDÉES sur tout numéro simulé (`DEMO_CONTACT_ENRICHMENT_COLUMNS`) : « professionnel déclaré » pour une ligne que le fournisseur simulé type « travail », « inconnue » (« Nature non vérifiée ») sinon — jamais « pro » déduit du format ; `NULL` sans numéro.

## Mode équipe en salle (14/10/2026, #4158.13)

La salle n'a plus UN occupant : elle compte **trois collègues fictifs** (`DEMO_COLLEAGUES`, `demo-dataset.ts` —
source unique de leurs identifiants ; notifications et page `/team` s'alignent dessus). Avec la propriétaire, quatre
membres actifs : la barre latérale affiche « Équipe » (dès deux membres actifs) et `/team` s'ouvre sur une équipe vivante.

- **Qui** : Léa Marchand (sales), Karim Benali (sales), Sophie Vasseur (admin). Un compte d'authentification est créé pour
  chacun SANS mot de passe, sur un domaine réservé, comme celui de l'occupant (`DemoSeedService.seedColleagues`) : ils ne
  se connectent pas.
- **Quoi** : six comptes secondaires (et leurs contacts) leur sont attribués — les dossiers vedettes restent à l'occupant ;
  trois actions déléguées (`action_plan_items.assigned_to`, ni faites ni en retard) ; des analyses terminées dans
  `user_actions`, uniquement sur leurs comptes (aucune collision de prospection, aucune preuve d'envoi).
- **Ne casse jamais** : un compte qui ne se crée pas laisse CE collègue de côté (jamais à moitié monté) et la salle reste à
  un occupant ; le semis avale ses pannes SQL. `workspace_members` survit au reset (`DEMO_KEEP_TABLES`), l'écriture est
  idempotente ; le reste part avec la purge ordinaire (`demo-reset.service.spec.ts`).
- **Classement** : `DEMO_TEAM_COLLEAGUES_COVERAGE` (`demo-coverage.ts`). Reste vide à dessein : commentaires d'équipe et
  partages (gestes du visiteur). Les anciennes raisons « la salle a un seul occupant » portent une note de renversement.

## Objet privé sur la fiche Contact — SEEDÉ depuis le 19/10/2026 (#4158.34, G.9)

`DEMO_PRIVATE_OBJECT_COVERAGE` est passé de « vide à dessein » à `seede` (renversement daté du 19/10/2026) : la salle n'a
qu'un occupant, gestionnaire, qui voit tout, mais l'état « Privé » doit se VOIR devant un prospect. `seedTeamGuardrails`
marque UN dossier du compte vitrine privé (`UPDATE opportunities SET is_private = true`). Garde : `demo-private-object-coverage.spec.ts`.

## Carte « Autres entités du groupe » — vide à dessein (#4158.60-.62)

Aucune table ni colonne neuve : la carte relit `accounts` (`group_head_siren`) par `GET /accounts/:id/group-entities`. Elle ne fait
**aucune ligne** sans compte frère ; la salle n'en compte aucun (Société Générale est seule de son groupe, et la seule entité sœur
semée, BoursoBank, a été retirée le 12/10/2026 : la démo ne fabrique pas de compte quasi vide). Classement : `DEMO_GROUP_ENTITIES_COVERAGE`
(`demo-coverage.ts`). Reste : semer une filiale avec son dossier complet.

## Garde-fous entre collègues en démo (14/10/2026, #4158 lot L4)

- **#4158.20 à .25** — `seedTeamGuardrails` (`demo-team-guardrails-seed.ts`, appelé par `seedWorkspace`) prend le
  PREMIER autre membre de la salle (un collègue fictif, créé par le lot L2 : clé étrangère dure vers `auth.users`) et
  sème avec lui : une action et un message envoyé (vérifié) il y a 5 jours sur un contact de Société Générale
  (« déjà travaillé par », « contacté par »), une exclusion de domaine avec motif, un positionnement chez le même
  client (« consultant déjà proposé »), et l'équipe du compte. SANS collègue : aucune ligne, jamais une trace
  attribuée à quelqu'un qui n'existe pas. Vide à dessein : le « doublon probable » (aucune paire sur un compte ouvert).
  Classé : `DEMO_TEAM_GUARDRAILS_COVERAGE` ; tables `workspace_do_not_contact` et `account_team_members` seedées et purgées.
- **#4996 L7** — même condition (un collègue fictif) : `seedTeamGuardrails` lui pose aussi deux zones d'ENTITÉ sur
  Société Générale (`account_team_scopes`), les deux entités les plus fournies en contacts, dérivées des libellés que
  les contacts portent déjà (`DEMO_SG_ZONE_ENTITY_LABELS`, `demo-dataset.ts`) : l'onglet Contacts montre « Mon
  périmètre » et « N hors de ton périmètre — Tout voir ». Sans collègue : aucune zone. Vide à dessein : la zone en
  texte libre (elle ne filtre jamais). Classé : `DEMO_TEAM_SCOPES_COVERAGE` ; table purgée au reset.
- **#4996.4** (Louis 02/11) — même condition : `seedTeamGuardrails` pose aussi au collègue UNE zone de BU de la salle
  (`DEMO_SG_ZONE_BUSINESS_UNIT` = « BU Banque & Assurance », l'une de `DEMO_BUSINESS_UNITS`, cherchée par son nom dans
  `business_units` de l'espace ; absente ⇒ aucune zone). La fenêtre « Périmètre de X » montre la section « Business
  units » (les trois BU de la salle). Même classement `DEMO_TEAM_SCOPES_COVERAGE` ; `account_team_scopes` est purgée
  avant `business_units`.

## Bibliothèque de messages d'équipe en démo (14/10/2026, #4158.50)

`DEMO_TEAM_MESSAGE_EXAMPLES` (`demo-team-continuity.ts`, semé par `seedTeamContinuity`) : DEUX exemples d'équipe dans
`message_library_entries`, l'un écrit par l'occupant, l'autre par le collègue fictif (Léa). `visibility = 'team'`,
`a_revoir` + `inspiration` — comme ce que produit « Ajouter un exemple » : jamais proposés comme messages prêts à envoyer.

## Semis du 14/10/2026 — refonte Actions (épopée #4163)

- **#4164 « Aujourd'hui »** — la file est pleine en démo : au moins un élément par geste (à valider, e-mail, LinkedIn, appel, tâche)
  et par section (en retard, aujourd'hui, cette semaine, plus tard), dont du retard d'e-mail et d'appel : deux relances du plan
  avec canal et deux appels datés s'ajoutent au semis (`demo-today-queue-coverage.spec.ts`).
- **#4165 séquences multicanal** — les séquences de démo portent des étapes LinkedIn et appel, une étape sautée pour invitation
  non acceptée, une séquence arrêtée sur RDV et des statistiques par étape non vides ; chaque valeur semée est confrontée au CHECK
  de la migration `OutreachMultichannelSteps` (leçon de la panne du 11/10).
- **#4167 L-D1 « Automatisations »** — `seedAutomations` sème quatre règles « quand [signal] → alors … » (tables
  `automation_rules` et `automation_rule_firings`) : trois allumées avec leur journal (le compteur « 30 jours » COMPTE ces lignes),
  une éteinte jamais passée (« non mesuré », jamais 0), et deux e-mails préparés par des règles en attente dans « À traiter »
  (`outreach_messages.source = 'automation'`, le signal en « pourquoi maintenant »). Le passage du matin saute les salles de
  démonstration : rien ne tourne en démo (`demo-automations.spec.ts`).
  Théo C (22/10) : une cinquième règle (fin de mission) porte un brouillon TESTÉ — la version 2 est prête à activer —, et
  `automation_rule_trials` sème le journal des essais (un du brouillon, un de la règle, un échec NOMMÉ : source non lisible).
  Chaque règle semée porte un nom.
- **#4163 LF finitions** — la démo montre une messagerie et un CRM branchés PAR LECTURE (`tool-registry/demo-connections.ts`,
  aucune ligne `crm_connections`, aucun jeton) : « À traiter » porte des écritures CRM EN ATTENTE (`outbound_write_requests`, un
  lot + une écriture seule) au lieu de « Écriture CRM indisponible ». `CrmController.decideWrite` ne les exécute JAMAIS depuis la
  salle : validée, une demande reste « approved », jamais « written ». Les relances semées portent leur raison d'être, et les
  séquences « Compte froid » visent une personne nommée.

## Semis du 14/10/2026 — refonte Affaires / Talents / Missions (épopée #4191)

- **#4196 cycle de vie d'une mission** (`demo-crm-mission-lifecycle.ts`) — chez Société Générale, une mission EN COURS qui finit
  dans 25 jours, avec un avenant de prolongation accepté dans son historique, et une mission TERMINÉE il y a 20 jours (motif
  typé) dont le consultant est redevenu disponible. Le consultant de la mission en cours était archivé avant son affectation :
  la fiche est désarchivée et le journal le dit. Sans compte Société Générale ou sans cinq consultants, rien n'est posé.
- **#4191 recette du 15/10 — origine des missions en cours** (`demo-crm-recette.ts`, couverture `DEMO_CRM_RECETTE_COVERAGE`
  dans `demo-coverage.ts`) — chaque mission en cours semée sans origine (SNCF « recette applicative lot A », Société Générale
  « refonte du SI paiement, phase 2 »…) reçoit une affaire gagnée et un besoin pourvu (`missions.opportunity_id` / `need_id`),
  pour que la ligne « Besoin d'origine » de la fiche mission ne dise plus « non mesuré » en démo. Posé après tous les
  `seedDemoCrm*`, jamais d'écrasement d'une origine existante ; le produit, lui, ne devine jamais une origine.
- **#4191 recette 2 du 15/10 — l'exemple vitrine du panneau « Objets liés »** (`demo-crm-recette2.ts`, couverture
  `DEMO_CRM_RECETTE2_COVERAGE` dans `demo-coverage.ts`, spec `demo-crm-recette2.spec.ts`) — la salle n'avait aucune affaire chez
  Orange (la chaîne de `demo-crm-links.ts` se tait sans Orange ou sans trois consultants). Le semis, indépendant et posé juste
  avant `seedDemoCrmRecette` (qui reste le dernier `seedDemoCrm*`), pend d’Orange — à défaut, de Société Générale, le compte vitrine le plus riche — une affaire au
  stade `profiles_submitted` avec UN besoin (`interview`, journal de transitions) et DEUX positionnements sur deux consultants
  distincts (`submitted` = envoyé, `interview`). Idempotent sur le libellé de l'affaire ; ni compte ni deux consultants = rien.
  Côté produit (même recette) : `GET /record-links` d'une affaire remonte aussi la mission qu'elle prolonge
  (`missions.renewal_opportunity_id`), et la fiche mission remonte son affaire de renouvellement.

- Recette 3 (#4191, F3) : le texte de contexte de la piste d'appel d'offres semée (`DEMO_SG_COMPLETE_LEAD.detail`) dit
  « Appel d'offres public relevé sur le site des marchés du groupe », plus un nom de registre entre parenthèses ; sa clé
  `source` reste `BOAMP` (c'est la source, pas un libellé de produit).

## Lot V12-RETENU-B, 17/10 — « a quitté l'entreprise », complète ce compte, secteurs

- **#4055.8** — SNCF porte « Thibault Revel » (personne simulée, profil `demo-bellum-`) dont la relecture d'employeur a observé un
  autre employeur : `raw_data.employmentCheck = { state: 'left', at, organization }`, daté relativement au semis
  (`demoEmploymentCheckRawData`, `DemoContact.employment_check`). Classement : `DEMO_EMPLOYMENT_LEFT_COVERAGE` (_seedée_), gardée
  par `demo-employment-left-coverage.spec.ts`. Les sièges champion restent vides (`DEMO_EMPLOYMENT_SEEN_COVERAGE`) : aucune date
  « vu le » inventée sur un siège sans personne.
- **#4055.4/.6** — `complete_account` et `get_portfolio_sectors` ne lisent que ce que la salle sème déjà (signaux, contacts,
  organigramme, besoins, `accounts.sector`) : `DEMO_COMPLETION_READS_COVERAGE` (_seedée_), aucune table ni clé `raw_analysis` neuve.

## Lot DATA-B, 15/10 — Laura lit le dossier déjà collecté

- **Classement** : `DEMO_LAURA_DOSSIER_READS_COVERAGE` (_seedée_) et `DEMO_COMPANY_PUBLIC_FACTS_COVERAGE` (_vide à dessein_) dans
  `demo-coverage.ts`, gardées par `demo-laura-dossier-reads-coverage.spec.ts`. Aucune table ni clé `raw_analysis` neuve.
- `get_account_firmographics` et `get_account_org_chart` ne lisent que ce que la salle sème déjà (`detected_tech_stack`,
  `github_signals`, filiales, `org.orgGraph`) ; le spec projette l'organigramme de la salle par la vraie route.
- `get_company_public_facts` lit le cache commun, pas une table de l'espace : rien à semer, et le semer fabriquerait des faits publics
  sur de vraies sociétés. Une entreprise jamais collectée rend l'état réel `not_collected` (inconnu).
- `accounts.apollo_enrichment` reste vide sur les comptes de la salle (groupes réels, aucun chiffre inventé).

## Volume d'offres des cartes Découvrir (DISCOVER-OFFRES, 15/10/2026)

`offersVolume` (« N offres en France sur 90 jours ») voyage sur la réponse de `/discover` : la salle le sème
sur Aubrac Aerostructures (179) et Marenval Financement (41) ; les autres cartes n'en portent aucun, comme le
vrai chemin sans réponse (jamais « 0 »). Classé « seedé » dans `demo-coverage.ts`
(`DEMO_DISCOVER_OFFERS_VOLUME_COVERAGE`), vérifié par `demo-discover-offers-volume-coverage.spec.ts`.

## Quatre dossiers de compte de Théo (15/10/2026, PR #4244)

Crédit Agricole (403 personnes), VINCI (255), Enedis (1 598) et Safran (105) rejoignent Orange parmi les comptes
d'extension (`EXTENSION_ACCOUNT_FACTS` via `dossierAccountFacts`), chacun avec son brief commercial
(`data/commercial-briefs/{credit-agricole,vinci,enedis,safran}.json`), produit par `convert:account-dossier
--account <slug>` (cœur `account-dossier.ts`, un mapping par compte dans `dossiers/`). VINCI et Safran, retirés minces
le 12/10, reviennent riches. Les ESN prospects (Soluxan, MK4 Technova, Experis, JEMS) ne sont jamais nommées et leurs
sections de stratégie sont écartées ; seules les adresses du domaine du groupe sont semées. Vide à dessein (raison dans
`demo-coverage.ts`) : plan d'action, angles, défis SI, prix — les dossiers n'en portent pas. La suggestion d'onboarding
« Crédit Agricole » devient « La Banque Postale » : une suggestion ne propose jamais un compte déjà ouvert.
`DEMO_SEED_REVISION` 16 (Louis 16/10 : à rôle égal, un contact joignable — e-mail ou téléphone — passe avant un contact
sans coordonnée, dans `rankPeople` et dans `briefContactSeeds`, pour tous les briefs ; rien n'est filtré).

Recette du 16/10 : un chiffre du brief qui décrit les personnes semées ÉGALE ce que l'écran en compte (tuile CONTACTS
et rubrique « Ce que je sais » de Crédit Agricole : 403 contacts, 18 décideurs ; VINCI : 255), dirigeants cités
compris, jamais le seul nombre de lignes du CSV (garde `account-dossiers-brief.spec.ts`). Les 10 premiers contacts de
VINCI sans e-mail sont fidèles à la source (leurs cellules d'adresse y sont vides) : 6 décideurs sur 83 en ont une, les
98 adresses du dossier sont surtout sur des contacts non décideurs ; jamais filtré.

## Relu le 15/10/2026 (R24-FIX-B, #4189)

- **Garde-fous d'équipe** : `DEMO_TEAM_GUARDRAILS_COVERAGE` compte en plus deux contacts du compte vitrine « ne pas
  contacter » (motif et auteur, jamais le contact déjà contacté).
- **`sync_record_events` reste vide à dessein**, raison complétée : les conflits de synchro (`action = 'conflict'`,
  colonne `proposal`) se lisent dans la note de périmètre d'un CRM BRANCHÉ ; aucun ne l'est en démo, un conflit seedé
  affirmerait une synchro jamais eue.
- **Découvrir en démo** : entreprises réelles (`demo-discover-real-companies.ts`), effectif absent plutôt que « 0 salarié » ;
  aucune annonce de registre n'y est écrite.

## Vague 2, 16/10/2026 — signaux, CRM, cadrage, motif de perte

- **Signaux** : `DEMO_SIGNAL_MODELS_COVERAGE` (`demo-coverage.ts`, #3928.4) classe les six modèles de signal. _Seedés_ :
  `recent_signals`, `canonical_trigger_events` (Société Générale), `discover_signal`. _Vides à dessein_ (raison écrite) :
  `signal_history`, `opportunities_signal`, `declared_signals`. Aucune table neuve.
- **Statut CRM** : `demoCrmReadStatus(now)` (`demo-dataset.ts`, #4189.8) — ligne fictive `demo: true` avec un écart d'e-mail
  proposé, rendue par `CrmReadSyncService.status` pour une salle sans CRM branché ; rien en base.
- **Cadrage analyse** : `DEMO_ANALYSIS_RUNS[].scope_selection` (optionnel) porte un cadrage fictif sur le dernier run de
  Société Générale ; « Cadrage appliqué » s'affiche rempli (`demo-cadrage-applique-coverage.spec.ts`).
- **Motif de perte** : `loss_reason_code: 'competitor_won'` sur `DEMO_SIMILAR_CASES` et `DEMO_SECOND_LOST_DEAL` (#3989.9).
- **Critères de route** : `DEMO_DELIVERY_CLIENT.account` pose `declared_route_budget` et `declared_route_availability` ;
  `declared_route_network` reste vide à dessein (`DEMO_ACCOUNT_ROUTE_CRITERIA_COVERAGE` mise à jour).
- Raisons relues : `sync_record_events` (vide à dessein) et la base commune (`DEMO_SHARED_BASE_COVERAGE`).

## Relu le 16/10/2026 (#3894, #3769)

- **Relance par contact dans la carte `contact_list`** : la ligne « Relance préparée : <date> » se lit dans les
  `outreach_messages` déjà semés (`needs_review`/`approved`) ; aucun message « envoyé » n'est semé à dessein, la démo
  n'invente pas un envoi. Gardé par `demo-contact-list-follow-up.spec.ts`.
- **Tutoiement de Laura** : le message d'accueil (`welcomeSummary`) et l'amorce de la conversation d'exemple tutoient le
  commercial ; gardé par `demo-laura-tutoiement.spec.ts`. Les brouillons destinés à un client gardent le vouvoiement.

## Zone RÉGION de Découvrir en démo (#3983.8, 16/10/2026)

La salle honorait un département (`departments`/`department`) mais ignorait la région : cocher « Pays de la Loire » ne
changeait rien. `demoDiscoverResponse` lit maintenant `regions` / `region` (codes INSEE) : un siège dont le
département appartient à la région tient la zone (base « siège »), une implantation fictive de la région la tient
aussi (base « implantation », région nommée sur le site), « siège dans la zone » retire le second cas. Département ET
région posés ensemble se croisent. `zoneRegion` n'est posé que si la zone EST une seule région. La commune reste un
ajout nommé par le texte libre (jamais un filtre qui retirerait des candidats). Garde :
`demo-discover-site-geography-coverage.spec.ts`.

- **Demandeur d'une offre** (#4182.5) : deux offres de SNCF (`sncf-data-engineer`, `sncf-devops-supervision`) portent
  `requester` dans les signaux récents semés (`demo-dataset.ts`) — une étayée, une « à identifier » avec sa méthode. Aucune table ni clé
  `raw_analysis` neuve : `demo-coverage` ne bouge pas.

### Registres publics partagés (#3921.9 / #3921.10, 16/10/2026)

`public_registry_announcements` (source `rne` comprise) et `esn_directory.public_awards` sont des stocks PARTAGÉS : ils ne se sèment
pas en démonstration (une ligne écrite pour le SIREN d'un compte réel apparaîtrait chez tous les espaces qui le suivent). Vide à dessein,
raison écrite dans `demo-coverage.ts`.

## Envoi vers plusieurs CRM (16/10/2026)

La fenêtre « Envoyer vers … » liste trois CRM fictifs en démo (`DEMO_CRM_PUSH_TARGETS` : HubSpot et Salesforce
écrivables, Odoo en lecture seule avec sa raison). Toujours aucune ligne `crm_connections` : l'envoi répond
`demo-<empreinte>` sans réseau. Classé dans `demo-coverage.ts` (`crm_connections`).

**Salesforce, domaine d'organisation (#4431, 21/10/2026)** : la colonne `crm_connections.login_url` vit sur la même table, donc reste vide
en salle — un domaine d'organisation ne se fabrique pas ; la carte montre le champ vide, sans domaine inventé.

**Zoho CRM (#4187.6) et historique des imports (#4051.10).** Zoho n'a aucune table propre : son classement vit dans
l'entrée `crm_connections` (vide à dessein, `getStatus` répond « non connecté » sans appel réseau). L'historique des
imports (Contacts › Imports & sources, Réglages › Import) lit `universal_import_jobs` : SEMÉ depuis le 22/10 (Théo B c3.R4,
`DEMO_IMPORT_HISTORY`, deux imports TERMINÉS et leurs lignes écartées — jamais « en cours » ni « interrompu », leurs parts
ne seraient plus au stockage), purgé entre deux visiteurs. Le badge de facturation d'une mission (#2979.90) est servi par les
factures échues de `demoInvoiceHistory` (garde `demo-billing-alert-coverage.spec.ts`).

## Panne du 16/10/2026 (R35) — la salle se purgeait en boucle et le visiteur attendait

**Cause prouvée (Postgres réel, `demo-seed-real-db.db.spec.ts`).** `weakest_link_diagnoses` est une table du semis
(`DEMO_SEEDED_TABLES`, donc sondée par `readRoom`), mais le semis la remplissait par `diagnoseFor` : calcul **mémorisé 60 s**
(la purge vide la table, pas le cache du process → aucune ligne réécrite) et **persisté en fond** (l'INSERT pouvait ne pas
être validé quand la salle se relit). Une salle fraîchement semée se lisait donc « incomplète » et chaque renouvellement de
bail (`repairIfIncomplete`) la purgeait et la re-semait. Le semis appelle désormais `seedDiagnosisFor` (sans cache,
écriture attendue). La garde : un semis terminé ⇒ `readRoom` sans manque ⇒ la réparation ne fait rien.

**Le visiteur n'attend jamais un re-semis.** `renewLease` et `acquire` (retour dans sa salle) ne purgent ni n'attendent plus :
salle périmée mais entière = servie telle quelle, marquée `demo_stale_served_at`, re-semée à la fin du bail par le balayage ;
tronquée = réparée en fond. `DemoLinkService` partage UNE consommation du lien magique (à usage unique) par navigateur
(`renew:`/`redeem:` + `InFlight`) : plus de 500 « Impossible de renouveler la session de démo » sur trois appels simultanés.
Côté web, un onglet de démo en « session indisponible » dit « La démo se prépare » (rôle `status`), jamais « Le serveur ne répond pas ».

## Vague 10 — ce que la démo sème (17/10/2026)

`demo-dataset.ts` / `demo-coverage.ts` : signal « Augmentation de capital » daté (#3941.5, jamais nommé « levée ») et son état vide `aucuneAugmentationCapital` (filtre coché sans annonce datée → « Aucune augmentation de capital récente », atteint sans entrée fictive), événements du registre national (#3921.11), ligne « Importé le … depuis … » (#4051), contradiction de fait nommée (#4016.L13), un message préparé par canal neuf (#2370). L'empreinte démo couvre les marques d'import et les canaux préparés.

## Vague 11 — ce que la démo sème (17/10/2026, lot V14-FIX-R45)

`demo-coverage.ts` : le « contact proche de ce sujet » d'une offre (#4182.6) est classé seedé — l'offre « Data engineer — plateforme data voyageurs » de SNCF et le contact simulé Younes Berrada (« Ingénieur plateforme data », non nommé dans l'offre), gardés par `demo-signal-close-contact-coverage.spec.ts`. `demo-scripts.ts` : la filiale Pharmatek Santé montre « Dirigeant du groupe · Directeur général » (#3983.11). Le marché public attribué de Thales (daté 01/09/2026) alimente aussi le compteur « Marchés publics gagnés, 12 mois » (#3915.30).

## Recette R46 — la démo ne casse plus (17/10/2026)

- **Organigramme des documents (#4072.7)** : en espace de démo, `proposeOrgPeopleFromDocuments` ne passe PAS par l'IA (« HTTP request failed » en recette) ; la proposition vient de `demo-org-document.ts`, même contenu que le document semé dans `DEMO_RAG_DOCUMENTS` (portée compte, Société Générale). Un autre compte : « aucun organigramme (0 lu) ».
- **Cloche (#3920.5)** : `consolidateNotifications` ne fusionne plus deux alertes de sources différentes au même lien — l'alerte « Votre CRM » de Société Générale n'était jamais visible, absorbée par l'annonce légale. Le libellé « BODACC » est remplacé par « Annonces légales officielles ».
- **CRM lecture (#4189.8)** : `demoCrmReadStatus` porte le fournisseur `hubspot` (le CRM fictif de la salle) et la carte HubSpot rend `CrmReadScope`.

## Vague 4 — ce que la démo sème (19/10/2026, intégration `integration/vague4-19-10`)

- **Profil forfait / conseil (#4270.5)** : `DEMO_FORFAIT_PROFILE_NEEDS` — un besoin « à cadrer » et un besoin gagné suivi
  comme projet, posés sans projet au client fictif ; `DemoSeedService` les insère dans `project_needs` (colonnes
  relues contre `project-need.entity.ts`) et relie la mission `DEMO_SUPERVISED_FORFAIT_MISSION` par `missions.need_id`.
  La salle reste l'espace STAFFING (`workspace_profile` NULL).
- **Pipe réordonné (#4338.1)** : les historiques d'étapes semés vont `confirmed` (Besoin exprimé) → `qualified` :
  une avancée de démo ne se lit jamais comme un recul. Navigation CRM de la salle (`demo-crm-nav.ts`) alignée sur
  Affaires = Pipe seul, Talents = Vivier seul.
- **Vivier V22 (#4500, 25/10/2026)** : seedé sans table neuve — la ligne et la carte du vivier lisent le score /100
  et ses axes (`TalentScorePill`) et « Disponibilité & planning » (`VivierAvailabilityCell`) sur les champs déjà posés
  par `DEMO_CONSULTANTS` (`availability_checked_days_ago`, `available_in_days`, `proven_skill_count`,
  `owned_by_visitor`) ; garde `demo-vivier-states.spec.ts`.
- **Séquences + Automatisations (#4357.1)** : seedé sans table neuve — le parcours « Créer ma séquence » et la section
  « Séquences sur un signal » lisent `DEMO_OUTREACH_PLAN` et `DEMO_AUTOMATION_RULES` (`DEMO_SEQUENCE_JOURNEY_COVERAGE`).
- **Radar par technologie (#4282.13)** : seedé — « radar SAP » rejoue `demoTechnologyRadar` (`demo-technology-radar.ts`),
  validé par le schéma strict du contrat ; aucune table ni clé `raw_analysis`.
- **Lecture des besoins historiques d'un compte (#4294.9)** : seedée sans table — la carte Découvrir de Cévennes
  Défense Systèmes pèse « 3 besoins passés observés, dont 1 gagné » (`DEMO_DISCOVER_SOURCE_FACTS`) et Laura répond
  « Qu'a-t-on déjà fait chez Cévennes Défense Systèmes ? » (`p-historical-needs-account`) ; `dataforge_needs` (base
  commune partagée) n'est jamais semé (`DEMO_HISTORICAL_NEEDS_COVERAGE`).
- **Base commune à l'enrichissement (#4268.b)** : vide à dessein — la salle sort par `enrichContactInDemo` avant toute
  lecture du commun (`DEMO_SHARED_BASE_ENRICH_COVERAGE`).
- **Tendances de marché entre espaces (`market_pattern`, #4286.15.c)** : seedées — les quatre espaces fictifs portent
  des recrutements au profil de Société Générale (`DEMO_SHARED_BASE_MARKET_PATTERNS`, `rewriteMarketPatternCells`, scope
  `demo`) ; `data` et `cloud` sortent, `securite` (deux espaces) non ; Laura répond « Qu'est-ce qui recrute autour de
  Société Générale, ailleurs ? » (`p-shared-base-market-patterns`). Classé dans `DEMO_SHARED_BASE_COVERAGE`.
- **État employeur de la base commune (#4286.15.b)** : les rôles semés sont actuels ; aucun ancien n'est semé, à dessein.
- **Découvrir et la base commune (#4067.11)** : seedé — Marenval Financement porte trois personnes en poste fictives
  connues de la base commune (`DEMO_DISCOVER_SOURCE_FACTS`), un compte sans nom.

## Cas Ludovic, pack industriel (19/10/2026, PR #4369)

- **Vide à dessein : « Où placer ce profil ? » pour un métier hors informatique (LUD.4 bis)** — `DEMO_PLACEMENT_TARGETS_COVERAGE` dans `demo-coverage.ts`. Les entreprises cibles (`placementTargets`) n'existent que dans un espace NON-IT et viennent d'une lecture en direct de la veille ; la salle est un espace d'ESN informatique, elle garde le tableau des ESN qui recrutent. Fabriquer des offres datées sur des sociétés réelles serait inventer des faits.
- **Semé : script « Préparer mon appel » complet (LUDB.8 bis)** — découverte et objection sont remplies en démo, sans appel live.

## Ce que la PR d'intégration du 19/10/2026 sème en plus (SYNC-A, G.7, G.10, SCOPES-I)

- **Miroir CRM (SYNC-A)** : `DEMO_CRM_MIRROR` / `seedCrmMirror` copie les trois affaires de Société Générale dans `crm_deals`
  (compte réel des briefs), plus `crm_pipelines` + `crm_stages` (« Pipe ESN », 4 étapes), `crm_owners` (un propriétaire) et
  `crm_activities` (4 : appel, réunion, tâche, note — sujet, type, date, jamais de corps, c96). Fournisseur `demo`, aucun CRM
  réel. Lu par `GET /crm/mirror/accounts/:id` avec le MÊME lecteur que la production. Les cinq tables sont dans `DEMO_SEEDED_TABLES`.
- **EDF (G.7)** : deux analyses terminées au MÊME verdict (GO, il y a 41 puis 9 jours) — la fiche dit « Même verdict depuis le… ».
- **G.10** : une version de message passe `archived` — une seule version active par objectif et canal.
- **`connector_scope_gaps` (SCOPES-I)** : vide à dessein (`DEMO_INTENTIONALLY_EMPTY`) — aucun connecteur OAuth réel n'est branché
  en démo, donc aucune portée à comparer.
- **Remise des contacts aux règles actuelles (LUDOVIC-C LC.1)** : vide à dessein (`DEMO_CONTACT_RULES_CATCHUP_COVERAGE`) —
  aucune collecte réelle en démo, donc ni date de collecte antérieure à la capacité ni homonyme collecté à archiver ; le
  bandeau `ContactsRulesCatchupNotice` ne s'affiche jamais en démo (#2543.3c). Le classement par zone et métiers du profil
  s'applique aux contacts semés.

## Lot LUDOVIC-D (20/10/2026) — Laura « avec qui appeler », homonymes

- **Semé : `appelsQuiRecrutent` (LC.6)** dans `DEMO_LAURA_GESTURES_COVERAGE` — l'amorce `p-call-hiring` de
  `demo-chat-script.ts` rend une carte `account_ranking` où chaque entreprise « (démo) » cite son signal daté
  (« Signal daté : … ») et la personne à appeler, ou « Personne connue : à trouver — Trouver qui appeler ». Garde :
  `demo-laura-gestures-coverage.spec.ts` (noms suffixés « (démo) », les trois lignes présentes).
- **LC.2 (homonymes dans les actus et angles)** : aucun écran ni champ nouveau — un filtre de collecte et de lecture ;
  rien à semer.
- **Vague 5 refusionnée (20/10)** : `demo-coverage.ts` garde les entrées des deux côtés — message au consultant scripté
  (`DEMO_TALENT_MESSAGE_DRAFT_COVERAGE`, #4347), compétences sans profil (`DEMO_MISSING_EXPERTISE_COVERAGE`, #4349 V.2) et
  remise aux règles des contacts, vide à dessein (`DEMO_CONTACT_RULES_CATCHUP_COVERAGE`, LUDOVIC-C LC.1).

## Lot V4-CORRECTIFS (20/10/2026) — contacts « a quitté l'entreprise » visibles sur /contacts

- **Semé : `DEMO_EMPLOYMENT_LEFT_COVERAGE` (4290.12, #4055.8)** — deux personnes SIMULÉES (profil `demo-bellum-`) relues
  chez un autre employeur : « Thibault Revel » (SNCF) et « Maxime Delaunay » (Société Générale). La liste `/contacts`
  les marque « A quitté l'entreprise » (`employment_left`, lu de `raw_data.employmentCheck`, même règle que la fiche : employeur
  observé ET date lisible) ; `seedDepartedContactsFirst` les remonte en tête du tri `created_at` décroissant pour qu'ils
  tombent sur la 1re page. Garde : `demo-employment-left-coverage.spec.ts`.

## Lot V4-CORRECTIFS-C (20/10/2026) — recette prod de la vague 4

- **Semé : demandeur de l'offre « SNCF Réseau — Data engineer — Lyon » (4286.12)** — troisième offre SNCF à porter `requester`
  (étayé : fonction probable, équipe `data infrastructure`) dans `demo-dataset.ts` : le popover « Signal détecté » du
  sous-signal « Recrutement Data » nomme le demandeur. Les deux autres offres gardent leur cas (étayé / « à identifier »).
  Garde : `demo-discover-offer-requester-coverage.spec.ts`.
- **Vide à dessein : « Écartés (N) » de Mes cibles (4283.1)** — la démo n'a aucun compte dont TOUS les signaux sont écartés
  (la presse seule, un stage seul) : en semer un changerait les comptes comptés de la veille. L'offre de stage SNCF existe
  déjà et reste invisible (autres signaux sur le compte).
- 4284.1 / 4284.23 / 4284.15 / 4292.6 / 4294.3 / 4294.6 : règles de lecture, aucun champ ni table nouveau, rien à semer.

## Lot COMPETENCE-TROUVE (20/10/2026) — une compétence trouve les comptes qui recrutent dessus

- **Semé : `DEMO_DISCOVER_SKILL_SEARCH_COVERAGE`** — en salle, une compétence posée dans Découvrir (mot-clé ou
  technologie, ex. « SAP ») remplace la liste scriptée par `demoSkillSearchResponse` (`demo-discover-skill.ts`,
  appelée par `IaProxyController.discoverRegistry`) : trois comptes fictifs « (démo) » rangés par nombre d'offres,
  chacun avec « N offres <compétence> » et la plus récente (lien `example.org`), puis un cabinet de recrutement et une
  ESN fictifs dans la section repliée. La compétence TAPÉE est reprise ; SIREN à clé de Luhn fausse ; aucune source
  nommée. Garde : `demo-discover-skill-coverage.spec.ts`.
- **#4419.1 (21/10/2026)** — `query.skillSearch` de la salle porte ses compteurs par étape (rejets d'offre par motif,
  groupes, échecs de résolution par motif, non tentés, hors zone, comptes), COHÉRENTS avec la liste rendue : un
  employeur fictif reste en homonymie, donc le bandeau « employeurs non identifiés » et « cabinets et ESN recrutent
  aussi » (#4419.6) se voient en réunion ; aucune coupure par le délai, `offersBySource` absent (aucune source, même
  dans la donnée). Même garde.
- **Lot DÉCOUVRIR-MOTEUR (27/10/2026, #4515 / #4419 / #4657)** — le lieu filtre sur le LIEU DE TRAVAIL de l'offre,
  jamais le siège : Rhénalp Équipements (siège Bartenheim) porte une offre à Mulhouse et la carte dit « Sites :
  Mulhouse ». Vide à dessein : les deux autres comptes recrutent à leur siège (aucune ville d'offre inventée) ; le
  rayon appliqué (`skillSearch.radiusKm`) n'est pas semé, la recherche de salle n'ayant pas de ville. Les lignes
  élargies de l'échelle de zone (Toulouse) nomment leur palier (« Élargi au département · Haute-Garonne », « Élargi à la
  région ») par la même étiquette partagée qu'en production. Même garde.
- **#4664 (27/10/2026)** — chaque compte de la salle porte aussi le DÉTAIL de ses offres
  (`skillEvidence.offers` : intitulé, date et lien `example.org` pour chacune, la plus récente d'abord, 10 au
  plus comme en production). `offerCount` reste le vrai total : la liste détaillée ne le remplace pas. Même garde.

## Lot OF (21/10/2026) — offres fraîches et faits voisins (#4430, #4437)

- **Semé : `DEMO_DISCOVER_FRESH_WIDENING_COVERAGE`** — la recherche par compétence de démo montre un compte « Trouvé par
  une collecte d'offres fraîche » (`skillFreshFill`) et un autre aux « Offres au <date> » (`jobsAsOf`, cache commun) ;
  le mode Signaux avec un recrutement qualifié (mot-clé tapé) ajoute, sous les comptes exacts, UN compte voisin fictif
  (`withDemoSignalNeighbour`, `demo-discover-widening.ts`, appelée par `IaProxyController.discoverSignals`) : un appel
  d'offres du domaine daté, étiqueté « Voisin de ta demande ». Aucune source nommée. Garde :
  `demo-discover-fresh-widening-coverage.spec.ts`.

- **MEYER-IMPORT M.2 (20/10/2026)** — `universal_import_issues` : l'historique de `/settings/import` compte désormais les écartés PAR RAISON depuis cette table.
  Rien n'est semé (un import de démo sans rejet n'affiche aucune raison) ; `demo-coverage.ts` le dit.

- **Semé : `DEMO_DISCOVER_LISTING_COVERAGE`** (#4361.2) — en salle, « Exclure les sociétés cotées » et la puce
  « Middle market » retirent de la liste scriptée huit sociétés RÉELLES des briefs dont la cotation à Euronext Paris
  est publique (`DEMO_LISTED_COMPANY_NAMES`, `demo-scripts.ts`) ; toutes les autres restent et sont comptées
  « cotation non établie » (jamais « non cotées ») dans `listingFilter`. Sans interrupteur, aucun compteur.
  Garde : `demo-discover-listing-coverage.spec.ts`.
- **Semé : `DEMO_DISCOVER_ENTITY_TYPE_COVERAGE`** (#4746.7) — en salle, « Clients finaux » (`entityType=client`)
  retire de la liste scriptée les lignes ESN (`isEsnPeer`), intermédiaires (`isIntermediary`) et partenaires déclarés
  (`isDeclaredPartner`), et `coverage.filteredByEntityType` dit combien (`EntityTypeFilteredNotice`). Les lectures
  « ESN » et « tous » ne retirent rien ; zéro retiré ⇒ aucun compteur, jamais « 0 ».
  Garde : `demo-discover-entity-type-coverage.spec.ts`.
- **Semé : `DEMO_DISCOVER_ZONE_WIDENING_COVERAGE`** (#4429.4, échelle révisée le 25/10, `c143` le 27/10 au matin,
  puis **`c144` le 27/10 au soir**, qui renverse `c143` : l'automatique s'arrête à la région) — en salle, Découvrir
  « Toulouse » ne rend que deux comptes (Altiver Industries, Aubrac Aerostructures, sous le seuil de 10) : la réponse
  rejoue `_widen_by_zone_tiers`, un palier à la fois (ville 25 km → 50 km → département → région, **puis STOP — jamais de
  lecture « France », même sous le seuil**). La salle ne publie aucune position, donc le barreau 50 km est franchi à
  vide et NOMMÉ (`zoneWidening.steps`) — Louis 02/11 : aucun barreau 100 km, l'échelle part de 25 km ; un rayon choisi (50/100 km) ne se rejoue
  pas ; le département (Haute-Garonne) ajoute Blagnac, la région est tentée et n'ajoute rien. Le palier ANNONCÉ est
  donc le DÉPARTEMENT (#4627 : on n'annonce jamais un barreau qui n'a rien ajouté) et l'arrêt à la région se dit à
  part (`autoCapReached`, qui fait sortir la ligne « La recherche s'arrête à la région ») — chaque compte ajouté
  porte son palier et son département quand la salle le connaît. « Revenir à Toulouse seule » (`zoneStrict`),
  « Revenir à 50 km » (`zoneCeiling` : rien à ce palier), un département ou aucune ville : aucun élargissement ;
  « Revenir au département » s'arrête au département.
  Garde : `demo-discover-zone-widening.spec.ts`.

## Lot RECHERCHE-NOM (20/10/2026) — chercher une personne par nom (#4386)

- En démo, « Chercher une personne par nom » (Découvrir › Contacts) ne fabrique plus d'homonyme dérivé du nom tapé : elle
  cherche dans les contacts SEMÉS de l'espace démo (`apps/api/src/modules/demo/person-name-search-demo.ts`), même
  appariement tolérant que la prod (accents, ordre prénom/nom, cœur du nom d'entreprise). Aucun appel réseau.
- Classée **seedée** : `DEMO_PERSON_NAME_SEARCH_COVERAGE` dans `demo-coverage.ts`.

## Recette démo du 21/10/2026 (intégration PR n°2)

- `demo-dataset.ts` sème en plus : le demandeur étayé par le texte de l'offre sur les offres SNCF/ENGIE (#4182.5), les
  interlocuteurs nommés de l'affaire de renouvellement SNCF (#4291.3, liés PAR NOM : un nom introuvable ne lie rien) et
  une 3e perte sur un client actif pour que la fiche ENGIE ait des cas comparables (#4289.2, `DEMO_THIRD_LOST_DEAL`, sans REX).

- **Raison sociale du registre (recette 21/10 K1)** — Société Générale et SNCF sèment `raw_analysis.legal_name` : la carte « Données financières » nomme l'entité dont elle montre les comptes sociaux, à côté du CA consolidé du groupe.

## Lot R21-W (21/10/2026) — « Tes trois prochaines étapes » et « Plan pour <prénom> » (#4415, #4416)

- Les deux blocs sont des LECTURES du plan déjà semé (`raw_analysis.plan.action_plan.phases`) et des messages portés par
  les contacts : aucune table ni clé `raw_analysis` neuve. Classement écrit dans `demo-coverage.ts` (note #4415 / #4416).
- Semé : le plan SNCF porte deux étapes (`SNCF5`, `SNCF6`) qui visent Younes Berrada (personne simulée, LinkedIn seul,
  message LinkedIn déjà semé) — l'onglet Plan montre un destinataire nommé + un message prêt, sa fiche montre « Plan pour
  Younes » avec deux étapes. Les autres étapes nomment un rôle (sièges anonymes) et s'affichent sans message.
- Garde : `demo-plan-steps-coverage.spec.ts`.
- R22-PF (#4416.3) : le plan de Thales nomme déjà Aurelia Peltier / Ralph Graaf (jointure par nom complet) et deux étapes
  e-mail visent Till Rausch (`DEMO_THALES_DEUTSCHLAND_STEPS`, blob d'analyse ET table, un seul plan). « Daniela » (CFO,
  détectée, sans coordonnée) n'a ni étape ni bloc, à dessein. Garde : `demo-contact-plan-steps-coverage.spec.ts`.

## Lot R21-X (21/10/2026) — une relance issue d'un « Marquer envoyé » dans Aujourd'hui (#4418)

- La démo sème UNE relance de cadence (`DEMO_PLAN_TASKS[*].cadenceStep: 'relance'`, SNCF, due aujourd'hui, interlocuteur
  FICTIF) : la colonne `action_plan_items.cadence_step` est écrite par `DemoSeedService`, comme `CadenceService` le fait en prod.
- Aucun `message_sent` n'est semé avec elle : « fait » reste déclaratif, jamais une preuve d'envoi.
- Classée **seedée** (table `action_plan_items`, prose dans `demo-coverage.ts`). Garde : `demo-seed.service.spec.ts` (« #4418 »).

## Lot R21-AA (21/10/2026) — « Préparer la réponse » pré-génère le mail (#4405)

- `POST /mailbox/reply-draft` répond en démo par un texte SCRIPTÉ (`demoMailReplyDraft`, `demo-briefing.ts`) pour CHAQUE
  fil de la boîte de démo — jamais un appel modèle (garde `demo-model-calls.spec.ts`), jamais une lecture de messagerie.
  Un fil hors du jeu répond 404, il n'invente rien.
- Aucune table ni clé `raw_analysis` neuve : rien à classer dans `demo-coverage.ts`. Garde : `demo-briefing.spec.ts` (« #4405.4 »).

## Lot R21-BB (21/10/2026) — conversations Beeper (#4406)

- Théo B C5.A24 (22/10/2026) — SMS et WhatsApp sont retirés des approches : `DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS` / `DEMO_PREPARED_CHANNELS_COVERAGE` ne sèment plus de brouillon sur ces deux canaux (restent au contrat : l'historique se lit). Gardé par `demo-prepared-channels-coverage.spec.ts`.
- Théo M2 (22/10/2026) — envoi programmé : la Messagerie « À venir » montre DEUX envois déjà programmés (l'e-mail et l'e-mail de suivi de Nadia Perrin, validés puis datés) — `DEMO_SCHEDULED_SEND_SEED_SPECS` / `seedScheduledSends`, gardé par `demo-scheduled-sends-coverage.spec.ts`. Aucun job n'est posé et rien ne part d'une salle de démonstration (`demo_send_blocked`).
- En démo, Intégrations montre Beeper « connecté » et Messagerie liste trois conversations fictives (WhatsApp, LinkedIn,
  Signal) fournies par l'adaptateur `apps/api/src/modules/demo/demo-beeper.ts` — jamais semées en table : côté Bellum une
  conversation Beeper n'est jamais stockée (c96). Nadia Perrin (contact semé) se rattache vraiment à son contact par e-mail.
  Aucun appel réseau, aucun branchement ni envoi depuis une salle (refus nommé).
- Classée **seedée** : `DEMO_BEEPER_CONVERSATIONS_COVERAGE` ; `beeper_connections` **vide à dessein** (aucun jeton inventé) et
  purgée à chaque bail (`DEMO_PURGE_TABLES`).

## Lot R21-JE (21/10/2026) — « Dépose tes documents » (pack de contexte)

- La zone de dépôt multi-fichiers (étape « Ton audit » de l'onboarding + tête de `/settings/import`) est un GESTE :
  elle ne montre rien avant un dépôt. Classée **vide à dessein** : `DEMO_CONTEXT_PACK_IMPORT_COVERAGE` dans
  `demo-coverage.ts` — semer un dépôt fictif inventerait un geste que personne n'a posé.
- Ses cinq destinations (`accounts`, `esn_target_personas`, `qualification_grids`, `sequence_templates`,
  `rag_documents`) sont, elles, semées : `demo-coverage.spec.ts` vérifie qu'elles figurent dans `DEMO_SEEDED_TABLES`,
  pour que chaque lien « Voir… » d'une ligne de résultat ouvre un écran rempli. L'onboarding reste hors d'atteinte en
  salle (`needsOnboarding` rend `false` sur `is_demo`).

## Lot JF2 (22/10/2026) — pack de contexte : onglets, tiers, scripts, historique (#4426, #4422.1)

- `context_pack_imports` (historique des imports de l'assistant) : **vide à dessein**, purgée à chaque bail
  (`DEMO_PURGE_TABLES`) — une ligne d'historique n'existe que si un visiteur a importé un fichier.
- Les scripts d'appel (`sequence_template_steps.kind = 'call_script'`) sont **semés** dans `demo-sequence-templates.ts`
  (deux scripts sur la campagne Logistique, un sur la campagne Retail) : la bibliothèque de /actions/sequences les montre.
- Le tier importé se pose en étiquette (`accounts.tags`) : aucune nouvelle colonne, donc rien à classer de plus.

## Lemlist — vide à dessein (21/10/2026, #4427.4)

- `lemlist_connections` et `lemlist_lead_pushes` sont classées **vides à dessein** dans `demo-coverage.ts` et purgées au
  reset (`demo-reset.service.ts`) : la connexion Lemlist est refusée en démo (400), comme l'ATS et la téléphonie. La
  carte « Lemlist » de /integrations s'affiche « à brancher », et la fiche contact n'affiche aucune ligne Lemlist —
  un « ouvert » ou un « répondu » semé serait une donnée inventée.

## Lot JR (21/10/2026) — préparer un R1, un R2, et un pitch (#4424)

- **Semé** : le pitch, dans la carte `meeting_brief` scriptée de Laura (`demo-chat-script.ts`, `p-meeting-brief`) — profil
  de l'ESN de démonstration (Bellum Conseil, ses offres) × l'enjeu déjà écrit, et la référence déjà semée « Audit
  cybersécurité pour SNCF ». Aucun fait nouveau.
- **Vide à dessein** (`DEMO_MEETING_BRIEF_BLOCKS`) : `pitch`, `rex`, `workshop_proposal`, `r1_recap` dans le brief d'avant
  rendez-vous de l'agenda — le brief ne s'ouvre que sur une PERSONNE invitée rattachée, que la salle ne pose sur aucun
  compte réel (décision Louis 04/10, entrée `who`) ; et aucune note de démo ne porte de compte rendu de rendez-vous, donc un
  R2 y dirait « Aucun R1 connu sur ce compte ».
- « Préparer le RDV » après la création d'une mission ou d'un besoin : aucune donnée, c'est une action de toast.

## Lot PALIERS (21/10/2026) — l'élargissement par paliers se voit en salle (#4433)

- En démo, une compétence posée qui rend moins de 10 comptes exacts (« React ») s'élargit au premier voisin du
  référentiel partagé : `withDemoWidening` (`apps/api/src/modules/demo/demo-criteria-widening.ts`, appelée par
  `IaProxyController.discoverRegistry` après `demoSkillSearchResponse`) ajoute deux comptes fictifs « proche :
  JavaScript » APRÈS les exacts, et `query.widening` fait dire l'élargissement au-dessus de la liste. « Revenir au
  strict » (`strictCriteria`) le retire ; une compétence inconnue du référentiel n'élargit rien.
- **Semé : `DEMO_DISCOVER_PLACE_RESOLUTION_COVERAGE`** (#4429.6) — en salle, Découvrir « Tolouse » est corrigée par proximité sur
  les villes de la salle (« Toulouse »), `query.placeResolution` le dit et la recherche part sur la ville corrigée ; un nom exact ou
  trop éloigné (« Toulan ») ne dit rien. L'homonyme et l'absence de commune ne sont pas rejoués (la salle n'a pas de référentiel de
  communes). Garde : `demo-discover-place-resolution.spec.ts`.
- Dossier zoné (#4432.7/.8) : le dossier de démonstration est scripté, sans collecte — rien à semer ; la mise en tête de la zone
  vit dans le chemin réel (`zone_dossier.py`), couvert par `test_4432_7_8_zone_dossier.py`.
- Classée **seedée** : `DEMO_CRITERIA_WIDENING_COVERAGE` dans `demo-coverage.ts`. Garde :
  `demo-criteria-widening-coverage.spec.ts`.

## Lot R22-SC (21/10/2026) — le secteur lu par l'activité se voit en salle (#4358.4)

- `demo-scripts.ts` : « Marché Reconditionné (démo) », NAF 46.90Z (commerce de gros), porte
  `qualification.sectorAttachment` (`ecommerce`, `activity`) : la carte nomme « rattaché par son activité ».
- Classée **seedée** : `DEMO_DISCOVER_SECTOR_ATTACHMENT_COVERAGE` dans `demo-coverage.ts`. Garde :
  `demo-discover-sector-attachment-coverage.spec.ts`. Le compteur « hors cible » de `demo-scripts.spec.ts` passe à 7.

## Lot PALIERS-SURFACES (21/10/2026) — Mes cibles, veille et analyse s'élargissent (#4433.9)

- **Mes cibles / la veille : seedée sans rien seeder de plus.** Les quelques comptes fictifs à signaux des dossiers
  d'exemple sont bien sous le seuil des critères : la liste « À traiter » s'ouvre d'elle-même aux comptes déjà
  traités et le bandeau commun le dit (calcul côté écran, `buildWatchlistView`).
- **Analyse de compte : vide à dessein.** `coverage.widened` n'est jamais écrit dans un dossier seedé (même raison
  que `sourceStatus` / `fallback`, #2543.5f) : une collecte qui n'a pas eu lieu ne se fabrique pas.
- **L'ORIGINE Découvrir d'un compte, elle, EST seedée (28/10/2026).** Un compte du jeu doré porte
  `zone_widened` (`discoverOriginCriteria` : `{ tier: 'radius_100', distance_km: 12, place: 'Lyon' }`) —
  Feyzin n'est pas Lyon, le compte est sorti d'une recherche élargie à 100 km, et `DiscoverOriginLine` le DIT.
  ⚠️ À ne pas confondre avec `coverage.widened` juste au-dessus : `zone_widened` est le CRITÈRE qui a fait
  sortir le compte (il est connu, donc seedable) ; `coverage.widened` serait une collecte d'analyse qui n'a
  pas eu lieu (jamais fabriquée). Sans ce semis, la démonstration promettait un palier d'élargissement dont
  aucun dossier ne portait la trace (craft rule n°9). L'étiquette « à moins de N km » ne s'écrit que sur une
  distance MESURÉE (#4433.3) : `distance_km` est la distance réelle, pas le rayon demandé.
- Classées dans `DEMO_SURFACE_WIDENING_COVERAGE` (`demo-coverage.ts`). Garde : `demo-surface-widening-coverage.spec.ts`.

## Lot R22-CC (22/10/2026) — « Venu de ton CRM » analysé (#4459.4)

- **Seedé** : Société Générale (dossier analysé) est « Venu de ton CRM » — la salle marque tout son portefeuille comme
  importé (`DEMO_IMPORT_MARKS`, #4051), SAUF les contacts nommés par `DEMO_CRM_COMPLETION` (Pierre Palmieri, Maxime
  Delaunay) : sans trace d'import, ils se lisent « Apporté par Bellum » ; Lorenzo Bini Smaghi reste « Déjà dans ton CRM ».
  La synthèse dit « 1 dans ton CRM · 2 trouvés par l'analyse », et « Compléter le compte » propose les deux apportés vers
  le CRM fictif de la salle (`DEMO_CRM_PUSH_TARGETS`).
- Les autres dossiers restent entièrement importés : tous leurs contacts sont « dans ton CRM », sans bouton (rien à
  compléter). Classé `DEMO_CRM_COMPLETION_COVERAGE` (`demo-coverage.ts`), garde `demo-crm-completion.spec.ts` ; la
  constante entre dans l'empreinte du semis.

## Liste repliée dans une réponse de Laura (#4445.1, 22/10/2026)

- Au-delà de `LIST_FOLD_THRESHOLD` (5, `apps/web/src/features/chat/view/markdown.tsx`), une liste d'une réponse se replie : 5 éléments + « Voir les N autres ».
- **Seedée** : le fil long de Laura sur SNCF (`DEMO_LONG_LAURA_THREAD`, `demo-dataset.ts`) porte un tour dont la réponse compte six puces (« Que préparer avant d'écrire à l'entité ? »), procédurales, sans fait de compte inventé. L'empreinte du semis couvre ce dataset : les salles déjà semées sont re-semées.
- K1 (recette 22/10, #4398.2) — nouvelle capacité `signals` (nom légal, 21/10 09:12Z) : la collecte fraîche de SNCF
  (`signals_collected_at` de `demo-dataset.ts`) passe au 21/10 20:00Z. L'avis « nom légal collecté depuis le 21/10 »
  vit hors démo (`SegmentStaleCollectionNotice` se tait en démo) : rien à classer dans `demo-coverage.ts`.

## R22-ECRAN-d6 — Réglages › Mon espace et Laura (22/10/2026)

- **Seedé** : la signature proposée et le pied de document de l'espace (`DEMO_DOCUMENT_IDENTITY`, `demo-dataset.ts`) —
  Réglages › Marque & documents les montre réglés, avec l'aperçu d'un dossier de compétences. Écrits à chaque prise de bail par
  `DemoSeedService.seedDocumentIdentity` (mêmes colonnes que `WorkspaceBrandService.update`). Classement :
  `DEMO_DOCUMENT_IDENTITY_COVERAGE` ; preuve : `demo-seed.service.spec.ts`. Aucune coordonnée réelle.
- **Déjà seedé, inchangé** : le barème de frais (interne et par client) que l'onglet Règles métier › Frais affiche, les
  catalogues (motifs de perte, comptes écartés, besoins non pourvus) et la mémoire de Laura.

## Théo L1 — sélecteur avancé de Laura, l'offre d'emploi (22/10/2026)

- **Seedé** : `DEMO_JOB_OFFER_THREAD` (`demo-dataset.ts`), un fil NOMMÉ sur SNCF parti de l'offre « Architecte cloud —
  Saint-Denis » de son dossier ; la réponse ne dit que ce que le signal dit (date, lieu, équipe et manager possible
  étayés par l'offre), aucune source nommée. Écrit par `DemoSeedService.seedWorkspace`, compté dans l'empreinte du semis.
- **Vide à dessein** : l'onglet « Une offre d'emploi » du sélecteur. Une offre ne se désigne que par sa ligne
  `signal_history` ; la table reste vide à dessein en salle, donc l'onglet dit « Aucune offre d'emploi repérée ».
  Le semer renverserait cette classification (gardée par quatre specs, lue par le compteur « nouveaux signaux 7 j ») —
  décision produit à trancher. Classement : `DEMO_JOB_OFFER_COVERAGE` ; garde : `demo-job-offer-thread-coverage.spec.ts`.
- K1 (recette 22/10, #4398.2) — nouvelle capacité `signals` (nom légal, 21/10 09:12Z) : la collecte fraîche de SNCF
  (`signals_collected_at` de `demo-dataset.ts`) passe au 21/10 20:00Z. L'avis « nom légal collecté depuis le 21/10 »
  vit hors démo (`SegmentStaleCollectionNotice` se tait en démo) : rien à classer dans `demo-coverage.ts`.

## Théo A — dossier de référence BPCE (R22 a7, 22/10/2026)

- **Semé** : Groupe BPCE est LE dossier de référence — `raw_analysis.reference_archive` (archive du dépôt fourni,
  30/09–01/10/2026, périmètre France, non revérifiée en ligne : fige le dossier, masque « Actualiser », propose
  « Créer une copie de travail ») et `raw_analysis.reference_dossier` (programmes cités, pratiques achats, organisation par
  regroupements 10·6·10·29, expertises, TJM par circuit, historique des besoins, écosystème), COMPTÉ dans le relevé par
  `buildReferenceDossier` (`bpce-reference-dossier.ts`) — aucun chiffre écrit en dur. Les 49 identités de gouvernance portent
  l'étiquette « À revalider » (`TO_REVALIDATE_TAG`).
- **Vide à dessein** : `working_copy_of` n'est jamais semé — la copie naît au clic du visiteur (notes reprises, archive
  intacte). Les autres dossiers sont ordinaires : pas d'archive. Classement : `DEMO_REFERENCE_ARCHIVE_COVERAGE` ; garde :
  `demo-reference-archive-coverage.spec.ts`.
- **Sources** : le relevé fourni ne porte aucune URL d'éditeur → aucun lien affiché (pas d'URL connue = pas de lien).
- Théo C (22/10/2026) — talents-recrutement : l'écran Recrutement montre TROIS candidats déjà rangés (Inès Castel « Qualifié », Samir Ouazani « Échange prévu » à date, le second Julien Fabre « En veille » avec son motif) et un quatrième jamais rangé, donc « À qualifier » — `DEMO_RECRUITMENT_SEED_SPECS` / `seedRecruitmentEvents`, gardé par `demo-recruitment-coverage.spec.ts`. « Écartée » reste vide à dessein : une colonne vide se montre.

## PR 12C — refonte V22, 24/10/2026 (#4485, #4493, #4497, #4499, #4505, #4506, #4509, AM.58)

- **Seedé** : liste des comptes V22 (prochaine action lue sur SG, BPCE, ENGIE — `DEMO_ACCOUNTS_LIST_V22_COVERAGE`) ;
  Affaires V22 (`DEMO_AFFAIRES_V22_COVERAGE`) ; vue d'ensemble de Découvrir (`DEMO_DISCOVER_OVERVIEW_COVERAGE`) ;
  Signaux et Mes veilles (#4505, #4506) ; deux relances en retard de 45 et 92 jours pour le bandeau « les marquer
  faites ? » (#4485) ; au graphe SNCF, une personne sans fiche contact (« Camille Rivière », fictive) pour « Créer sa
  fiche » depuis un nœud (`DEMO_ORG_PERSON_CREATE_RECORD_COVERAGE`, exemption nommée `DEMO_ORG_PEOPLE_WITHOUT_RECORD`
  dans `demo-org-graphs.spec` et `demo-org-coverage.spec`).
- **Vide à dessein** : « Ajouter un CV » depuis le fil de Laura (`DEMO_CHAT_ADD_CV_COVERAGE`) — l'import naît du
  fichier choisi par le visiteur, rien n'est semé.
- Les filtres « Historique documenté » et « Références autorisées » de la liste des comptes ne rendent rien en démo :
  `proofs` est vide à dessein (aucune preuve fabriquée).

## Intégration III — 25/10/2026 (#4294.7, #4538)

- **Seedé — filtre « Déjà travaillées » de Découvrir** (`DEMO_DISCOVER_WORKED_ACCOUNTS_COVERAGE`, #4294.7) :
  Cévennes Défense Systèmes porte `portfolioState: customer` et `workedBefore: true`, exactement comme le vrai
  chemin le pose pour une relation ou une mission passée. Le filtre de la rubrique **Relation** le retient et se
  combine **en ET** avec le secteur : Aubrac Aerostructures, même secteur mais jamais travaillé, sort de la liste.
  Ni table ni clé `raw_analysis` — `workedBefore` voyage sur la réponse de `/discover`, comme `portfolioState`.
  **Vide à dessein** : aucun autre compte n'est marqué, le jeu ne fabrique pas d'historique de mission à un
  candidat neuf. Garde : `demo-discover-worked-accounts-coverage.spec.ts`.
- **Seedé — onglet « Suivis » de `/accounts`** (#4538) : les trois comptes de `account_follows` (plafond
  `ACCOUNT_FOLLOW_MAX_PER_USER`) s'y listent un par ligne, avec le nombre de faits que la veille leur connaît.
  Les trois portent des faits — la démo n'a **aucun compte mince** (Louis 12/10) — donc le cas « suivi sans
  aucun fait de veille » n'est pas démontrable en salle sans en fabriquer un : il est gardé par
  `FollowedAccountsSection.test.tsx` (trois suivis sans fait ⇒ trois lignes), pas par le semis.

## Intégration II — 25/10/2026 (#4421.15-.18, #4529, #4530)

- **Seedé — « Obtenir l'e-mail » sous une personne HORS espace** (`DEMO_OUTSIDE_PERSON_REVEAL_COVERAGE`,
  #4421.15-.18) : sur le cas « missions pour Camille Roussel », la carte de SII porte deux personnes à vérifier
  au nom masqué (« Inès G. », « Julien M. »). En salle, le clic ne fait **aucun appel** : la révélation vient du
  script (`DEMO_REVEALED_PEOPLE`, personne fictive, adresse `@exemple.fr`) et remplit le destinataire du mail
  préparé ; la seconde se lit « adresse introuvable », **comme en production**. Côté serveur,
  `POST outside-people/reveal` **refuse** l'espace de démonstration (409) : aucun compte, aucun contact, aucune
  table ne reçoit de semis. Garde : `demo-outside-person-reveal-coverage.spec.ts`.
- **Seedé par le profil, sans code de semis — Découvrir neutre et « Ma cible »**
  (`DEMO_DISCOVER_MY_TARGET_COVERAGE`, #4529 / #4530) : l'**arrivée** sur Découvrir ne lit rien du profil (aucune
  zone, aucun secteur posé d'office) ; le **bouton « Ma cible »** pose les secteurs prioritaires, la zone et le
  niveau de décision depuis `DEMO_ESN_PROFILE.priority_sectors` / `geo_zones` et
  `DEMO_PROFILE_CONTEXT.idealAccountProfile`, déjà semés pour l'audit commercial. Sans ces champs le bouton ne
  poserait rien en réunion. Ni table ni clé `raw_analysis` neuve : les deux gardes de `demo-coverage.spec.ts`
  sont **aveugles** à cette nouveauté, et une garde aveugle n'est pas une exemption — d'où l'entrée de
  couverture, confrontée par `demo-discover-my-target-coverage.spec.ts`.

## Intégration IV — 25/10/2026 (#4305.2, #2399.6, #2399.7, #4546)

- **Seedé** : l'effort de recherche de Découvrir (`DEMO_DISCOVER_SEARCH_EFFORT_COVERAGE`, #4305.2) —
  `demoDiscoverResolved` (`demo-scripts.ts`) rejoue la forme du vrai chemin (`_search_effort`, `apps/ia`) et pose
  `query.searchEffort = { sourcesQueried, stoppedBy }` sur toute liste non vide. Ni table, ni clé `raw_analysis` :
  la valeur voyage sur la réponse scriptée de `/discover/registry`, comme la résolution de lieu. **Une liste vide
  n'en porte pas** — on n'affiche pas un effort qu'on n'a pas mesuré, et aucun fournisseur n'y est nommé.
- **Seedé** : la bascule de version d'une automatisation (#2399.6, #2399.7), sur la règle « Une fin de mission
  approche » — ACTIVE en v1, avec son brouillon TESTÉ en v2 (un e-mail à relire plutôt qu'un appel). L'écran
  « Avant de basculer » a donc deux versions à comparer, leurs différences, la migration et l'impact lu en lecture
  seule. Source illisible ⇒ « non mesuré », jamais 0. Aucune table ni clé neuve : `version_history` et
  `draft_compared_at` ont leur défaut (migration `1796575200123`).
- **Vide à dessein** : la deuxième boîte mail d'un commercial (#4546). La démo ne connecte aucune messagerie —
  un jeton OAuth semé serait une donnée fabriquée, et la doctrine l'interdit. L'écran « Boîtes mail » rend donc
  la liste vide avec son invitation à connecter, jamais un compte fictif. Le multi-boîtes se recette hors démo.

## Vague XVIII — 27/10/2026 (#4610, #4604.4, #4546)

- **Seedé** : le lien d'un nom de contact cité dans une carte `contact_list` de Laura, et du compte cité sur la
  même ligne (`DEMO_CONTACT_LIST_HREF_COVERAGE`, #4610 / #4610.5, vague M 28/10). La réponse scriptée « Qui sont les
  contacts nommés chez SNCF ? » (`p-contacts-card`, `demo-chat-script.ts`) porte la carte : Jean Castex et
  Laurent Trévisani (table `contacts`, semée) sont des liens vers leur fiche, SNCF vers la fiche du compte. Les
  chemins sont des **jetons** (`contactHref`, `accountHref`) que `demo-turn.ts` résout contre les contacts et comptes
  chargés par l'écran — jamais un UUID dans le script ; un contact introuvable reste du texte. En production, le
  serveur IA pose les mêmes chemins depuis le `contact_id` / `account_id` de l'outil (`contact_card_fallback.py`).
  La garde `demo-contact-list-href-coverage.spec.ts` relit le script ET le semis.
- **Seedé** : l'avancement du travail lancé (#4611, `get_work_progress`, qui REMPLACE `get_work_status` retiré).
  Un second lot d'analyses, « lancé la veille » (`seedWorkProgressBatch`, `DEMO_WORK_PROGRESS`, tables
  `analysis_batches` / `analysis_batch_items`), porte une analyse rendue, une en cours, une en file et UNE EN ERREUR
  avec la raison de l'amont : Laura répond « où en est le travail lancé ? » sans carte de zéros. Le mode démo n'expose
  donc plus `get_work_status`.
- **Seedé** : les champs personnalisés d'une affaire et les étiquettes CRM (#4604.4) —
  `DEMO_CRM_MIRROR.dealCustomFields` et `crm_custom_fields`, lus par la fiche compte. Fournisseur `demo` :
  aucun CRM réel n'est interrogé, et aucun fournisseur n'est nommé à l'écran.
- **Vide à dessein, inchangé** : plusieurs boîtes mail par commercial (#4546) ne change pas la réponse de
  l'intégration IV — ni compte Google ni compte Microsoft n'est connecté à une salle de démonstration, donc
  une ligne de plus serait une donnée fabriquée. Le journal par enregistrement reste vide lui aussi : il pend
  d'un import, et il n'y en a aucun — y semer des lignes attribuerait à un import des contacts qui ne viennent
  pas de là.

## Intégration VI — 25/10/2026 (#4284.1, #4419, #4563, cascade des offres)

Le semis porte ce que la vague VI ajoute à l'écran : la **cascade des offres** (paliers tentés, gains,
appels payés) sur un compte où le plancher de 5 offres n'est pas atteint, et un compte où le tri
métier a écarté des offres hors domaine — sans quoi ces deux blocs seraient livrés et vides en démo.
`demo-coverage.ts` classe les clés neuves de `raw_analysis` : semées, pas « vides à dessein ».

## Fiche contact — coordonnées en clair, badge seulement sans valeur (#4522, 25/10/2026)

- **Seedé** : un numéro connu s'affiche EN CLAIR sur la fiche (Camille Roussel, Sofiane Berthier, Corentin Fabre portent
  un mobile fictif) ; le badge court « Téléphone disponible » / « Email disponible » n'apparaît que sur les sièges SANS
  valeur dont `phone_availability` / `email_availability` vaut `available` (`demoCoordinateAvailability`). La fiche lit
  désormais cette annonce par champ, en plus du drapeau brut `raw_data.apolloDetails` que la salle ne sème pas.
- **Vide à dessein** : `contacts.apollo_enrichment.phone_numbers[]` (où la fiche lit un numéro quand la colonne `phone` est
  vide) — personnes simulées sur des entreprises réelles, un numéro posé là ferait croire qu'un fournisseur l'a rendu.
  Classement dans `demo-coverage.ts` (`DEMO_CONTACT_ENRICHMENT_COLUMNS`), aucune table ni clé `raw_analysis` neuve.

## Semis de Découvrir — « vue · Lille » et « Albi » (#4556.2, #4515.5, 26/10/2026)

`DEMO_DISCOVER_SAVED_VIEWS` compte désormais **cinq** recherches enregistrées : les trois d'origine, plus
« vue · Lille » et « Albi · 250 à 999 », chacune ramenant au moins huit cartes. Elles existent parce qu'une
recherche de démonstration doit répondre sur un métier **et** sur une ville : le rayon posé par la vue est gardé, et
« non appliqué » ne s'affiche sous la ville que si la source qui a répondu ignore vraiment le filtre (#4515.3).
La démo vise aussi une taille d'entreprise, et Découvrir la propose (#4516.4).

**#4628 (26/10/2026)** — l'arrivée en démo ne JOUE plus seule la première recherche enregistrée : elle la PROPOSE
(« Jouer la recherche … »), le clic la lance. #4490 (« aucun appel sans geste ») tient aussi en démonstration ; la garde
`apps/web/src/architecture/decouvrir-aucun-appel-sans-geste.test.ts` lit `Discover.tsx` et refuse tout `launch(` d'effet
qui ne soit pas un pré-remplissage seul.

Classé _seedé_ dans `demo-coverage.ts` (`DEMO_DISCOVER_ARRIVAL_COVERAGE`), vérifié par
`demo-discover-arrival-coverage.spec.ts`. Hors démo, rien ne change.

## Semis du 26/10/2026 — signal hors métier, siège SNCF « à qualifier », compteurs renommés

Trois nouveautés du lot, classées comme l'exige la craft rule n°9 (toute fonctionnalité user-facing
est AUSSI remplie en démo).

**1. Un signal HORS MÉTIER, seedé exprès (#4403.1).** Le dossier Société Générale porte un septième
signal (`s7`) : « Le cours de bourse de Société Générale progresse de 2,1 % … » (source BFM Bourse,
`source_kind: 'press'`). Un cours de bourse n'est un signal de recrutement pour **aucune** ESN. Il est
seedé précisément pour que la salle voie ce que `/signals` en fait : il est **nommé** « hors de ton
métier » et **rangé SOUS** les signaux de métier — jamais retiré. `sales_implication` est `null` :
aucune implication commerciale inventée.

**2. Le siège technique de SNCF reste « À qualifier » à dessein (#4324.1).** Son unique titulaire porte
`decision_role: 'unknown'`. C'est le cas que « Places à pourvoir » ne doit **pas** déclarer vide : un
intitulé voisin tient la place, même non vérifié. Le semis existe pour que la garde ait un cas réel.

**3. Les compteurs renommés : seedés, sans table ni clé neuve (#4612, #4327.2, #4493.4, #4503.2,
#4613, #4582.1).** Entrée `DEMO_COUNTER_LABELS_COVERAGE` de `demo-coverage.ts`, état `seede`. Aucune
table ni clé de `raw_analysis` nouvelle : les compteurs d'entités et de villes de l'onglet Sites lisent
`entities_exhaustive` et `sites_france`, déjà semés, avec des nombres **différents d'un dossier à
l'autre** (Société Générale et SNCF n'ont ni le même nombre d'entités ni le même nombre de villes) —
le compteur ne peut donc pas être figé sans que la salle le voie. Le total de `/contacts` lit
`channelTally` / `recommendedTally` (#4527) et se nomme « recommandés » par défaut. Le zéro-complété
(« 04 ») s'applique à la rangée de chiffres de Comptes, Pipe et Vivier, tous semés. Les pastilles
d'initiales de la synthèse des contacts ne sont plus rendues : rien à semer. #4649 (27/10) : la tuile « entités documentées » du Brief lit le même prédicat que l'onglet Sites
(`countListedEntities` sur `entities_exhaustive`, déjà semé) — les deux onglets disent le même nombre ; rien de neuf à semer.

- **#4642 — l'analyse lancée depuis « Comptes où placer X » garde la demande** : la carte scriptée « missions pour ce profil » (`demo-chat-script.ts`, `p-missions-for-profile`) porte `talent_context` (Camille Roussel · Kubernetes · Rhône) et les offres relevées de SII ; « Analyser la sélection » ouvre donc le cadrage prérempli en salle. Seedé dans le fil scripté, aucune table : Alten n'a aucune offre relevée dans le jeu, donc aucune ligne (on n'affiche pas ce qu'on n'a pas).

## Semis du 28/10/2026 — les contacts CONNUS d'un compte importé (#4678, #4679, #4680)

Décision Louis du 28/10/2026, née du compte VICAT dans l'espace d'un client : **un contact venu
d'un import CRM est une relation connue, pas une découverte.** En salle, cette distinction ne
se voit que s'il y a un compte versé par un fichier ET des contacts connus dessus.

**Le compte porteur : Kiabi** (`importedOrigin: true`, déjà le compte d'origine « import » du jeu).
Il gagne **deux contacts connus SIMULÉS** (`demo-contact-density.ts`, domaine `kiabi-groupe.example`,
source `import`) :

1. un **DSI en doublon probable** avec le DSI _déduit_ du graphe — c'est le cas réel de VICAT
   (un CISO connu, joignable, face à un « référent technique, déduit » qui tenait le L1). La salle
   voit donc « doublon probable » et le lien vers la file de fusion. **Rien n'est jamais fusionné** ;
2. un **acheteur épinglé hors arbre**, pour que le bloc « Connus de l'équipe » ait son cas : un
   contact connu dont le titre ne permet aucun niveau ne retombe jamais dans « Non enrichis ».

**Aucune table ni clé de `raw_analysis` nouvelle.** Entrée `DEMO_KNOWN_CONTACTS_RELATION` de
`demo-coverage.ts`, état `seede`, gardée par `demo-known-contacts-coverage.spec.ts`.

**Ce qui reste vide à dessein** : les autres dossiers n'ont aucun contact connu, donc aucun bloc
« Connu » et aucun bloc « Connus de l'équipe » — une absence ne fait **aucune ligne** (doctrine
« on n'affiche pas ce qu'on n'a pas »), et surtout jamais un « 0 ».

**La tension avec #4597.1, tranchée sans toucher à sa garde** : `demo-contacts-channel-tally-coverage.spec.ts`
exige que des contacts nommés portent `import` et **jamais** `crm`, parce que la puce « Mon CRM » ne
compte que le CRM branché. Les deux contacts connus de Kiabi sont donc semés en `import` : ils
remplissent le bloc « Connu » et l'axe relation **sans** gonfler « Mon CRM ».

## Une filiale DÉDUITE en démo (#4327.2 — lot W1, 28/10/2026)

`DEMO_DOSSIERS` gagne une entité de plus, **Ayvens Conseil**, et elle est là pour montrer un cas
qu'aucune autre entité semée ne montrait : une filiale **nommée par la presse, sans SIREN**.

`{ name: 'Ayvens Conseil', source: 'web', siren: null, source_url: 'https://www.lesechos.fr/finance-marches' }`

Ce qu'elle prouve à l'écran, dans « Entités & sites » : une filiale non confirmée **s'affiche**,
étiquetée « à confirmer », **avec sa source cliquable** — elle n'est ni omise, ni présentée comme
établie. C'est la demande de #4327.2 : on ne jette pas ce qu'on sait mal, on dit **à quel point** on
le sait.

Fictive comme tout le jeu de démo, et cohérente avec la doctrine : **on n'affiche pas ce qu'on n'a
pas**, mais une absence de SIREN n'est pas une absence de filiale — elle se NOMME au lieu de
disparaître. Aucune table ni clé `raw_analysis` neuve.

## Semis du 28/10/2026 — la connexion BoondManager AFFICHÉE, jamais écrite (#4688)

L'app publiée sur la Marketplace de l'éditeur est ce que ses clients verront en premier : la carte ERP de
`/integrations` ne peut donc pas être vide en démonstration. Elle est semée en **affichage seul**.

- `demoAtsConnection()` (`apps/api/src/modules/demo/demo-dataset.ts`) rend l'instance `esn-demo.boondmanager.example`
  (domaine `.example` réservé RFC 2606, comme les trois dossiers dorés), le mode OAuth2, des scopes et les dates du
  dernier échange et du branchement. `AtsService.status` rend ceci pour un espace de démonstration.
- **Aucune ligne n'est écrite dans `ats_connections`.** Un jeton fictif en base partirait en appel RÉEL vers l'éditeur
  au premier rafraîchissement : la table reste donc « vide à dessein », et sa raison est écrite dans `demo-coverage.ts`.
- **La connexion elle-même reste REFUSÉE** en démonstration (`AtsService.startOAuth`) : un prospect ne passe pas le
  consentement OAuth2 de l'ERP de son ESN depuis un espace partagé par plusieurs visiteurs.
- Aucune lecture ne part : la carte est branchée à l'écran, et le réseau ne bouge pas.
- **Carte et panneau lisent la MÊME définition (#4689).** La carte de la grille lit le registre d'outils : son overlay
  `withDemoConnections` (`tool-registry/demo-connections.ts`) rend BoondManager branché à partir de `demoAtsConnection()`,
  comme `AtsService.status` pour le panneau. Avant, la carte disait « Non connecté » pendant que le panneau disait
  « Branché ». Garde : `ats-demo-connection-single-source.spec.ts`.
- **Les dates sont figées sur le jour** : ancrées sur le début du jour UTC (−2 h), pas sur l'instant du rendu — deux
  captures le même jour montrent la même date, jamais dans le futur.
- Les scopes affichés sont **fictifs** et ne sont pas ceux de l'éditeur (le code le dit à l'endroit du semis) : la
  démonstration montre la FORME d'une connexion accordée, elle ne publie pas le référentiel d'un tiers.

⚠️ Dès que l'écriture d'un compte rendu dans l'ERP (#4692) ou l'iFrame embarquée (#4696) sera livrée, chacune devra
être semée ici à son tour — la carte branchée ne suffira plus à faire la démonstration de l'app.

## Ce que sèment les lots du retour Bedros × Adel (28/10/2026)

- **Structure technique du compte (#4742) — SEEDÉE.** `DEMO_TECH_STRUCTURE_COVERAGE` : sur SNCF,
  l'ERP, les données, l'hébergement et les outils métier, chacun **prouvé par une offre datée**
  (liens `example.org/demo`). Rien de deviné depuis le secteur : une pile non détectée n'apparaît pas.
- **Mes angles (#4739) — SEEDÉS.** Deux angles écrits à la main par le commercial de l'espace de
  démonstration, donc `source = 'human'` : de quoi montrer la liste, l'édition par le formulaire
  générique (c75) et la reprise d'un angle au moment de contacter quelqu'un.
- **Recrutement de dirigeant (#4733) — SEEDÉ.** L'offre « Directeur des Opérations » de SNCF porte
  un demandeur « à identifier » : le signal se voit sans faire croire qu'on connaît le décideur.

- **Écosystème startup (#4734) — SEEDÉ.** SNCF porte une ligne d'annuaire fictive « (exemple) » — type
  `ecosystem`, datée du 03/11/2025, avec son lien, source « Annuaire de l'écosystème startup » (aucun
  annuaire nommé). Aucune nouvelle clé `raw_analysis` : `demo-coverage.ts` n'a rien à classer.

⚠️ Ce que ces lots ne sèment PAS, à dessein : Crunchbase (#4735) reste **inerte faute de clé** — sans
clé = no-op strict, donc rien à montrer en salle plutôt qu'une donnée inventée.

## Semis du 28/10/2026 — historique complet des besoins sur la fiche compte (#4757, lot HIST-D)

La fiche compte tronquait les offres à six (`inTrade.slice(0, 6)`) et ne distinguait pas le récent du
passé. Elle rend maintenant **deux blocs** — besoins récents, puis besoins historiques — chacun plafonné,
trié et paginé, avec son total affiché. Aucune table ni clé `raw_analysis` neuve : la fiche relit
`raw_analysis.it_job_signals`, déjà classée seedée. SNCF porte **douze** offres datées du 09/12/2024 au
15/09/2025 en plus de ses offres récentes — de quoi montrer les deux blocs, le tri par date et la
pagination par dix. Les dossiers sans offre ancienne restent **SANS bloc historique, à dessein** : rien
n'est semé pour le remplir, et un bloc vide ne s'affiche jamais. Gardé par
`demo-job-history-coverage.spec.ts`.

## Semis du 28/10/2026 — Découvrir : les deux blocs et le compte qui remonte sur son historique (#4758, #4761)

Épopée #4762. L'écran Découvrir range la réponse en « Signaux récents » (un fait daté dans la fenêtre `sinceDays`,
90 jours par défaut) puis « Comptes à historique » (aucun récent, mais des besoins datés plus anciens). Chaque bloc
dit son plafond et son total (« 20 sur 134 »), le plafond vit en UN endroit (`DISCOVER_BLOCK_CAP`,
`packages/contracts/src/schemas/discover-blocks.ts`), et un bloc vide disparaît.

- **Où la salle le sème.** La liste de Découvrir en démonstration est la réponse SCRIPTÉE `demoDiscoverResponse`
  (`apps/api/src/modules/demo/demo-scripts.ts`), pas une table : le compte est donc ajouté là, à la fin des lignes
  fictives, jamais dans `job_offers` du dossier SNCF de `demo-dataset.ts`.
- **Cas 1 — un compte remonte sur son seul historique** : « Vauclair Logistique (démo) » porte trois offres Java datées
  d'avril 2025, décembre 2025 et mars 2026 (dates re-datées à aujourd'hui comme les autres signaux, `demoRebasedDay`),
  aucune dans les 90 jours. Il tombe dans « Comptes à historique » et sa carte écrit la raison.
- **Cas 2 — le bloc historique est vide** : toute recherche par ville dont les comptes ont un signal récent ne rend
  aucun compte à historique ; le bloc n'est pas rendu (ni « 0 », ni ligne de remplissage).
- **Classement** : `DEMO_DISCOVER_HISTORY_BLOCKS_COVERAGE` (`demo-coverage.ts`), `seede`. Ce n'est pas un type de
  résultat, donc elle n'entre pas dans `DEMO_DISCOVER_RESULT_TYPES` (la garde refuse toute entrée hors contrat).
- **Aucun crédit** : relire l'historique déjà stocké ne débite rien, la salle n'affiche aucun chiffre de crédit.
- Garde : `demo-discover-history-coverage.spec.ts` (lit la vraie réponse scriptée).

## Semis du 29/10/2026 — le geste d'ÉQUIPE en salle, la liste longue de Laura, deux vides à dessein (#4731, #4748, #4737, #4734)

Quatre nouveautés de l'intégration du 29/10 passent par le registre de couverture (`demo-coverage.ts`) :
deux seedées, une ligne de journal, une table archivée et un type de signal vide à dessein.

**Seedé — un compte ANALYSÉ par l'un, TRAVAILLÉ par l'autre (#4731).** ⚠️ Renversement assumé de #2117.14
(« l'espace de démo est SOLO, `DEMO_OWNER` seul membre réel ») : « le mode équipe est ce que Bedros et Adel
ont acheté, un prospect doit le voir ». La solitude de la salle avait déjà cédé à #4158.13 (trois collègues,
14/10/2026) ; restait que chacun ne travaillait QUE ses propres comptes. `DEMO_SHARED_ACCOUNT_WORK`
(`demo-dataset.ts`) donne au compte vedette de l'occupant — Société Générale, qu'il a analysé — une tâche
portée par Léa Marchand, collègue fictive sur domaine réservé. C'est une TÂCHE (`action_plan_items`), jamais
une ligne `user_actions` : deux auteurs sur un même compte se liraient comme une « collision de prospection »
(#3398.2), un signal que la salle n'a pas à fabriquer. Aucun envoi, aucun appel fournisseur. Jusque-là, seul
un test en mémoire prouvait ce geste — le prospect ne le voyait pas. Garde :
`demo-team-shared-account.spec.ts`.

**Seedé — une liste LONGUE de Laura (#4748).** L'amorce `p-liste-longue` (`demo-chat-script.ts`) sert une
carte `file_export` de 24 lignes d'entreprises fictives « (démo) » : le tableau les rend toutes, le bouton dit
combien partent, le CSV en contient autant. Le défaut « 3 lignes montrées, ~100 annoncées, 3 exportées » ne
peut plus revenir sans être vu en réunion. Effectif vide quand il n'est pas connu — jamais « 0 » — et aucun
fournisseur nommé. Aucune table ni clé `raw_analysis` neuve. Garde :
`demo-laura-liste-longue-coverage.spec.ts`.

**Seedé, mais une voie FERMÉE — le journal d'envoi LinkedIn (#4737).** `linkedin_send_log` porte une ligne
« voie non ouverte » (aucune clé fournisseur), sans corps de message ni preuve d'envoi : rien ne part en démo,
aucun appel fournisseur. Semé par `seedLinkedInMandate`.

**Archivé — `linkedin_mandates`, fusionnée dans `outreach_delegations` (#4737, fusion K2 du 29/10/2026).** Le
mandat d'envoi LinkedIn vit désormais comme une délégation de portée `linkedin_send` (5 par jour, 30 jours,
`seedLinkedInMandate`). Plus rien n'écrit dans l'ancienne table : la semer dupliquerait la notion de
délégation (GA-26). Elle reste purgée à chaque bail par prudence (`DEMO_PURGE_TABLES`).

**Vide à dessein — le signal d'ÉCOSYSTÈME (#4734).** Aucune table ni clé `raw_analysis` ajoutée : la ligne
voyage dans `recent_signals` (type `ecosystem`) et n'y entre que si un annuaire **déclaré** porte le SIREN du
compte (`FRENCH_TECH_DIRECTORY_URLS`, vide par défaut). En démonstration aucun fournisseur n'est interrogé —
le lien de démo part à des inconnus. Et les dossiers de la salle portent le nom de groupes RÉELS : leur semer
une appartenance à un programme affirmerait un fait faux sur une entreprise réelle (un essai sur Orange est
refusé par sa propre garde, `demo-orange-dossier-seed.spec.ts`). À reprendre avec un compte fictif DÉDIÉ,
jamais en déplaçant l'entrée pour faire passer une CI. Le rendu du type est prouvé ailleurs :
`discover-signal-ecosystem.test.ts` (contrat) et `signalTypes.ecosystem` FR/EN (web).

## Nouvelle capacité `signals` du 28/10/2026 (#4754) — la collecte fraîche de SNCF repoussée

La collecte profonde des offres (#4754 : France Travail, APEC et les ATS publics ne jettent plus une offre de
plus de 365 jours, elle est stockée et estampillée `historical`) entre au registre des capacités
(`SEGMENT_CAPABILITY_HISTORY.signals`, `packages/contracts/src/schemas/segment-catchup.ts`) avec son instant,
28/10/2026 20:03:39Z — elle devient la DERNIÈRE capacité du segment `signals`.

- **Ce qui bouge dans le semis** : `signals_collected_at` du dossier SNCF (`demo-dataset.ts`) passe au
  28/10/2026 20:04:00Z, APRÈS cette capacité. Sans ce décalage, le SEUL témoin « collecte fraîche » de la salle
  retomberait « collecte antérieure » et le contraire du bandeau ne se verrait plus nulle part.
- **Rien à classer dans `demo-coverage.ts`** : aucune table ni clé `raw_analysis` neuve, et l'avis
  « collecte antérieure à la capacité » vit hors démonstration (`SegmentStaleCollectionNotice` se tait en démo).
- **Garde** : `demo-signals-stale-collection-coverage.spec.ts` (elle épingle l'epoch ET le fait que SNCF seul
  porte une collecte fraîche).

## Le lecteur commun de la base en démonstration (#4792, lot BASE-A, 29/10/2026)

Épopée #4791. Un service unique (`BaseReaderService`, `apps/api/src/modules/base-reader/`) répond à « quoi, dans
notre base, correspond à ces critères ? » — métier ou compétence, lieu, période, famille, pagination — et rend trois
familles : les **comptes**, les **besoins** (besoins enregistrés ET offres déjà collectées) et les **consultants**.
Chaque ligne porte sa nature (`source`) et sa **date de collecte** (`collectedAt`).

- **Aucune table neuve, aucune clé de `raw_analysis` neuve, donc rien à classer dans `demo-coverage.ts`.** Le lecteur
  LIT ce qui existe : `accounts`, `project_needs`, `signal_history`, `consultants`, `consultant_experiences` — toutes
  déjà classées. Rien n'a été déplacé vers « vide à dessein » : ce lot n'y touche pas.
- **Mais une table seedée ne suffit pas**, et c'est le piège que `demo-coverage.ts` nomme lui-même : ce lecteur filtre
  sur un MÉTIER et un LIEU, donc la salle doit porter, par famille, au moins une ligne qui réponde à ces deux
  critères-là. Elle les porte déjà, sans semis de plus :
  - **comptes** : seedés avec un siège (`headquarters`) — un lieu se rapproche sur eux ;
  - **besoins** : le besoin phare (`DEMO_FLAGSHIP_NEED`, « Lyon », Kubernetes + Terraform) et les cinq rôles du
    dossier client (« Lyon (69) ») ;
  - **consultants** : les sept profils de `DEMO_CONSULTANTS`, avec leur pile (`stack`) et leurs zones (« IDF », « 69 »),
    et un consentement VALIDE — sans lui, aucune personne ne fait de ligne (même règle que `findByExperienceClient`).
- **La sous-famille « offres collectées » reste vide en salle**, et ce n'est pas une décision de ce lot :
  `signal_history` est déjà classée vide à dessein — « la veille quotidienne ne tourne pas en salle, les signaux
  viennent du dossier ». La famille BESOINS n'est pas vide pour autant : ses besoins ENREGISTRÉS répondent.
- **Deux formes de lieu, et les deux sont semées.** `project_needs.location` porte une PHRASE (« Lyon (69) ») que le
  lecteur rapproche en `ILIKE` ; `consultants.zones` porte un JETON (« 69 ») qu'il compare à l'ÉGAL. Un code de
  département donné par un visiteur trouve donc les deux.
- **Aucun crédit, aucun appel réseau** : relire ce qui est déjà stocké ne débite rien (doctrine
  `c145_historique_stocke_se_lit_sans_credit`), et la salle n'affiche aucun chiffre de crédit pour cette lecture.
- Garde : `base-reader-demo-coverage.spec.ts` (lit le jeu de démonstration et rougit le jour où la salle perd le lieu
  de ses besoins, la pile de ses consultants, le siège de ses comptes ou leur consentement).

## Semis du 29/10/2026 — les besoins historiques nommés au dossier (#4760)

Épopée #4762. L'analyse écrit `raw_analysis.historical_needs` (`AnalysisWorker.recordHistoricalNeeds`) : une liste de
besoins passés, chacun avec son libellé, sa date RÉELLE (`null` = non datée, jamais devinée) et sa source
(`signal` / `job_offer`), plus le total. Aucune probabilité, aucun score.

- **Où la salle le sème.** `demo-historical-needs.ts`, branché sur le compte analysé **Renault** par `analysedAccount`
  (`demo-dataset.ts`) — jamais dans `job_offers` du dossier SNCF. Trois besoins : deux offres datées de plus de
  180 jours et un signal non daté, qui reste non daté.
- **Les autres comptes analysés.** Avant ce semis, `historicalNeedsOf` (`demo-dataset.ts`) dérive le bloc de la couche
  `signal_layers` du compte (`buildHistoricalNeeds(readSignalLayers(…))`) : Thales et Airbus nomment ainsi leurs besoins
  de plus de 180 jours avec leur date ; EDF, dont la couche n'en porte aucun, ne porte pas la clé. Le semis Renault
  prime. La fiche rend les lignes `signal` dans la carte « Besoins plus anciens » (`CompanyPublicDataSection`).
- **Classement.** Clé de `raw_analysis` SEMÉE : la garde par clé de `demo-coverage.spec.ts` la lit dans la
  réponse des comptes analysés ; aucune entrée « vide à dessein ».
- **Gardes.** `demo-historical-needs.spec.ts` (contrat, total = lignes, une date de plus de 180 jours) et, côté
  analyse, `historical-needs-dossier-4760.spec.ts` (l'appelant FAIT ENTRER la donnée au dossier), plus
  `demo-analysed-accounts.spec.ts` (Thales, Airbus, Renault nommés ; EDF sans la clé).

## Onglet « Stratégie financière » rempli en démo (#4745.8)

- **Semis** : le client fictif de la salle (SNCF, `DEMO_DELIVERY_CARRIER`) porte trois exercices dans
  `raw_analysis.financials_history` (2024, 2023, 2022) avec marge brute, EBE et résultat d'exploitation **fictifs**
  (arbitrage Louis 29/10/2026). 2022 est incomplet à dessein : EBE et date de clôture « Non publié », jamais 0.
- **Les autres dossiers** (vraies sociétés) ne reçoivent aucune marge inventée.
- **Classement** : aucune clé neuve, `financials_history` était déjà seedée (note `FINANCE-ONGLET` dans `demo-coverage.ts`).
- Garde : `demo-finance-tab-coverage.spec.ts`.

## Chercher les offres d'un autre métier sur la fiche compte (Louis 30/10/2026)

- **Ce qui se montre** : dans la veille, le champ « métier » de `AccountJobOffersPanel` déroule les offres du compte 5
  par 5, jusqu'à 50 (`GET /accounts/:id/job-offers?term=`).
- **En démo** : aucune collecte. La route relit `raw_analysis.it_job_signals`, déjà semée, filtrée par le métier
  (`demoAccountJobOffers`, `@bellum/contracts`). SNCF : « data » rend « Ingénieur plateforme data » et « Data analyst
  exploitation », « devops » rend « Ingénieur DevOps Kubernetes » ; l'offre de stage semée n'est jamais servie.
- **Classement** : aucune table ni clé neuve — `DEMO_ACCOUNT_JOB_OFFERS_COVERAGE` (semée) dans `demo-coverage.ts`.
- Garde : `demo-account-job-offers-coverage.spec.ts`.

## Matrice famille × niveau et provenance `web_role_search` (#4923.12/.16, Louis 30/10/2026)

- **Matrice** : aucune table ni clé neuve — l'onglet Zones blanches lit `contacts.family` / `decision_role` / `seniority` / `title`, déjà semées. En salle, des cases couvertes et des cases « non trouvé par cette recherche » avec leur geste « Chercher ce rôle ». Classement : `DEMO_COVERAGE_MATRIX_ROLE_SEARCH_COVERAGE` (semée), preuve exécutée dans `demo-coverage-matrix-4923.spec.ts`.
- **Provenance `web_role_search`** : `DEMO_WEB_ROLE_SEARCH_PROVENANCE_COVERAGE` (vide à dessein) — source interne, aucune colonne de contact ne la porte, jamais nommée à l'écran (doctrine fournisseurs).

## Onglet « Signaux et besoins » : le tableau unique `signal-lines` (#4755 / #4756, lot 761, 31/10/2026)

- **Ce qui se montre** : `GET /accounts/:id/signal-lines` rend UN tableau à deux périodes, **Actuel** et **Historique**.
  La route LIT des familles déjà semées ; aucune table ni clé `raw_analysis` neuve.
- **Compte concerné** : Société Générale (`demo-dataset.ts`), le seul dossier réel à porter les deux périodes.
  - **Actuel** : deux offres Java de la même équipe le même mois (`it_job_signals`, datées au semis par
    `sgSeedDaysAgo`) fusionnées en UNE ligne dépliable « 1 ligne regroupée » ; un appel d'offres récent
    (`public_tenders`) ; une affaire CRM ouverte (`DEMO_CRM_DEALS`) ; les projets possibles.
  - **Historique** : deux besoins passés FERMÉS (`closedNeeds`), l'un **gagné** et l'autre **perdu**, chacun avec son
    TJM fictif (`tjm_eur`, écrit en `target_tjm_cents` par `seedBriefClosedNeeds`). TJM absent = NULL, jamais 0.
    S'y ajoutent les affaires CRM closes et les signaux anciens.
  - **Contacts qui recoupent** : le métier de contacts semés recoupe celui des lignes, donc « À contacter » n'est
    pas vide en salle.
- **Aucune source nommée** à l'écran : une ligne ne dit jamais d'où elle vient (doctrine fournisseurs).
- **Classement** : `DEMO_SIGNAL_LINES_COVERAGE` (semée) dans `demo-coverage.ts`. La base commune et la mémoire marché
  restent vides à dessein (fait de marché partagé ; GA-258), voir `DEMO_HISTORICAL_NEEDS_COVERAGE`.
- **Exception nommée** : `demo-sanofi-closed-need-coverage.spec.ts` accepte désormais deux porteurs de besoins fermés
  (Sanofi et Société Générale) et dit toujours NON aux autres dossiers.
- Garde : `demo-signal-lines-coverage.spec.ts`.

## Une marque = une ligne (#4892.1, Louis 31/10/2026)

- **Ce qui se montre** : dans Découvrir, deux entités juridiques fictives de la même marque (Valcourt France (démo) et
  Maison Valcourt (démo), SIREN distincts, même ville) sortent sur UNE ligne ; l'autre entité se déplie sous la tête
  (`brandGroup`). Rien n'est fusionné.
- **Classement** : aucune table ni clé neuve — `DEMO_DISCOVER_BRAND_GROUP_COVERAGE` (semée) dans `demo-coverage.ts`,
  preuve exécutée dans `demo-scripts.spec.ts`. Salle de Découvrir : 40 comptes scriptés.

## Contacts : groupe + filiales, pertinence, joignable (lots 757/758/760, 31/10/2026)

- **Sélecteur groupe + filiales (lot 757)** : taper « Société Générale » ouvre le sélecteur de périmètre. `DEMO_GROUP_PERIMETER` (le groupe, Boursorama, Treezor, la holding de participations) sert `GET group-perimeter/:siren` sans appel réseau ; le run SG porte deux filiales cochées (`contact_entities`). Aucune table neuve. Classement : `DEMO_GROUP_PERIMETER_COVERAGE` (semée), garde `account-group-perimeter.controller.spec.ts`.
- **Pertinence et pastille « Joignable » (lot 758)** : le score contact lit l offre DÉCLARÉE du profil démo (« Data & Intelligence Artificielle ») ; l ordre suit la pertinence, l acheteur est nommé. « Joignable » se calcule sur les coordonnées déjà semées. Seedée par construction : `DEMO_CONTACT_RELEVANCE_COVERAGE`, garde `demo-contact-relevance-coverage.spec.ts`.
- **Introuvable (lot 760)** : une recherche de téléphone « en recherche » depuis plus de 15 minutes se lit « introuvable » (au moins une source a répondu rien) ou « inconnu » (aucune réponse), jamais « en recherche » éternel.

## Lot semis recette 31/10 (#4556 #4432 #4195 #4193 #4290 #4295)

- **Zone nommée (4556.4 / 4432.4)** — « Hors zone » dit de quoi (`zone_label`, lu du profil) ; `DEMO_ESN_PROFILE.geo_zones`
  déclare aussi « Toulouse & Occitanie » : un contact d'Airbus est en zone, les autres « Hors zone (<zone>) ».
- **Affaire SNCF (4195.5)** — l'affaire de signature s'appelle « Renfort régie — entité numérique voyageurs », le nom
  cité par la carte /actions (Négociation, deux positionnements retenus).
- **Fenêtres 30/60/90 (4193.6)** — `demo-crm-counters.ts` ; cause du « 0 Orange » : le semis tournait AVANT les comptes
  d'extension (Orange en est un) et sautait ses missions sans bruit ; il tourne maintenant après
  `seedExtensionAccounts`. Relu sur vraie base par `demo-seed-real-db.db.spec.ts`.
- **Première page de /contacts (4290.12 / 4295.11)** — la portée par défaut est « recommandé » : SNCF ouvre la liste
  (`DEMO_HISTORY_RUNS`), son contact « a quitté » est dans son chemin, et « Gaëtan Lemoine » (fictif) est listé
  « ne pas contacter ». Garde : `demo-contacts-first-page-coverage.spec.ts`. « Privé » n'existe pas sur un contact.

## Sièges de cadres nommés (Louis 01/11/2026)

- **Les sièges de cadres de la démo portent un NOM FICTIF** (`demo-seat-names.ts`, 16 intitulés SG + SNCF) : « affiche-les » renverse l'anonymat des `roleSeat`, qui s'affichaient « Rôle à identifier ». Prénom + nom français inventés, aucun dirigeant connu de SG, SNCF ou Keolis, aucune coordonnée ni profil. Les références par nom (organigramme, relances, missions, tâches, étape achats) passent par `seatName(titre)` : un seul endroit. Les sièges AGRÉGÉS par famille métier (blocs 06/07/08 du CSV SG, « N profils ») restent sans nom, ce ne sont pas des personnes. La paire `homonym_conflict` (Keolis / SNCF Réseau) garde le suffixe d'entité. Garde : `demo-seat-names.spec.ts` (nom ≠ intitulé, 2 mots, aucun dirigeant réel, graphe = fiches).

## Recette R8 du 03/11/2026 (lot W16)

- **#4115.5** — la recherche par compétence de la salle (`demo-discover-skill.ts`, voisins de `demo-criteria-widening.ts`) porte des SIGNAUX DATÉS par compte (`demoSkillSignals` : 1 fort, 2 de contexte), à dates FIGÉES. Garde : `demo-discover-skill-coverage.spec.ts`.
- **#4975.1 / #4977.1** — le script d'appel semé (`demoPhoneScript`) ne porte aucune objection et s'ouvre sur l'offre d'emploi du dossier (poste + ville) quand il en a une.
- **#4629.2 — NON livré** : la salle n'est jamais verrouillée (`trial_expired` forcé à `false`) ; un état « essai terminé » exige une décision de facturation.
