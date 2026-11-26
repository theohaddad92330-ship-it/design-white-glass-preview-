# Manifeste — couvrir les 59 issues ouvertes (09/09/2026)

Demande de Louis, 09/09 : « je veux qu'on couvre toutes les issues, code les
toutes, dans plein d'agents en parallèle puis recette les ». Mode **sans arrêt** :
les décisions se PARQUENT avec une recommandation, elles ne bloquent pas.

## Ce que la mesure d'entrée a donné

| Mesure | Valeur |
| --- | --- |
| Issues ouvertes | **59** — 1 `feedback:bug`, 54 `feedback:metier`, 3 `feedback:autre` ; 18 `beta-backoffice` |
| Corps humains | specs longues (4 à 12 k caractères), rédigées à l'impératif, **5 à 12 demandes chacune** |
| Antériorité | **~39 sur 59 portent déjà du code** (commit et/ou `#NNNN` en commentaire) |
| Réellement intactes | **~20** (0 commit, 0 référence code) |
| CI | **~4 min**, 8 runners en ligne, tous libres → PR courtes possibles |
| Prod | api `c0ed0734c` · ia `d78ee624b` ; les 3 commits d'écart ne touchent que `dashboard-manager` + docs |

⚠️ **Le seul retour d'un vrai CLIENT du corpus est #1766** (`/discover` — « 0 résultats »,
`christophe.gueguen@jocx.fr`). Un retour client passe devant.

⚠️ **Le palier back-office (24 issues) est mergé ET recetté le 09/09.** Ses 18 issues
restées ouvertes sont du **reliquat de clôture**, pas du vierge. Manifeste :
`.claude/notes/palier-backoffice-24-manifeste-2026-09-08.md`.

## Vague A — les 7 éclaireurs (lecture seule, aucun `git`, aucun worktree)

| # | Lot | Issues | Rend |
| --- | --- | --- | --- |
| S1 | back-office A | #1642 #1648 #1655 #1657 #1667 #1669 #1671 #1672 #1673 | statut par point + appelant |
| S2 | back-office B (traceur produit, vague C) | #1674 #1676 #1681 #1683 #1684 #1685 #1686 #1687 #1688 | idem + « la donnée d'entrée existe-t-elle ? » |
| S3 | dossier de compte | #1603 #1606 #1607 #1611 #1612 #1613 | idem + le littéral à corriger |
| S4 | liste comptes + design final | #1581 #1630 #1631 #1632 #1638 #1640 #1417 | idem + les gardes de design |
| S5 | mémoire marché + tableau de bord | #1573 #1574 #1615..#1622 #1627 | idem + ce qui exige une MIGRATION |
| S6 | Laura / `/search` / `/discover` | **#1766** #1596 #1628 #1629 #1590 #1591 #1592 #1626 | **#1766 en priorité : FAIL ou BLOCKED** |
| S7 | écrans divers | #1756 #1624 #1625 #1634 #1636 #1637 #1639 #1440 #1472 | **#1756 en priorité : la jointure par nom** |

Raison de la vague A : ~39 issues sur 59 portent déjà du code. Dispatcher des agents
d'écriture directement aurait recodé du livré — le défaut n°1 du dépôt (7 occurrences
documentées). Un éclaireur ne pèse presque rien : pas de worktree, pas de paquets
construits, pas de suite.

## Les deux hypothèses posées d'avance, à confirmer ou démentir

1. **#1766 est probablement BLOCKED, pas FAIL.** La recette du back-office du 09/09
   dit qu'un incident **SUPABASE (AUTHENTIFICATION)** courait depuis 09:05 et qu'un
   client a signalé « 0 résultats » sur `/discover` à **09:06:57**. Le fil d'actions
   de #1766 court de 09:04 à 09:06. Même minute, même écran.
   ⚠️ **Le correctif produit vaut quand même** : avec zéro résultat, le bandeau
   « la liste est incomplète : d'autres candidats existent probablement » est FAUX et
   rassurant. Trois états, pas un : *toutes les sources sont tombées* ≠ *certaines ont
   échoué* ≠ *aucun résultat ne correspond aux filtres*.
2. **#1756 est la cause racine déjà documentée** « deux référentiels ne se joignent
   pas par le NOM » : « SG SOCIETE GENERALE » ne trouve pas « SOCIETE GENERALE » et
   ses 267 parcours, **sans jamais échouer**.

## La cadence retenue

**~10 issues par PR, et on recette avant d'ouvrir la suivante.** Il n'y a **pas de
préproduction** : deux lots en vol = deux lots non vérifiés en production en même
temps, et un défaut qui sort ne dit plus lequel des deux l'a causé.

La CI est rapide (4 min) donc le découpage n'est pas contraint par elle — il l'est par
la **recette live**, qui ne se parallélise pas.

## Réservations, pour éviter les collisions entre agents isolés

| Ressource | Réservé à |
| --- | --- |
| Horodatages de migration | une plage par agent, attribuée au dispatch de la vague B |
| `packages/contracts/src/changelog/**` | **l'intégrateur seul** — il conflicte à chaque vague parallèle |
| `CLAUDE.md`, `agent_docs/env-reference.md` | **l'intégrateur seul** |

## État

- [x] Vague A dispatchée (7 éclaireurs)
- [ ] Arbitrage + lot unique de décisions
- [ ] Vague B — agents d'écriture en worktrees
- [ ] PR / CI / merge / recette live, lot par lot

---

## Ce que la vague A a rendu (au fil de l'eau)

| Éclaireur | Issues | Points | LIVRÉ | PARTIEL | ABSENT | NON PROUVÉ | REFUS | DÉCISION |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 back-office A | 9 | 37 | 25 | 5 | 4 | 1 | 0 | 2 |
| S2 back-office B | 9 | 45 | 15 | 5 | 23 | 0 | 0 | 2 |
| S3 dossier de compte | 6 | 37 | 11 | 8 | 15 | 0 | 3 | 0 |
| S5 mémoire marché | 11 | 54 | 23 | 9 | 17 | 0 | 3 | 2 |

**Vérifié moi-même sur pièce** (un rapport d'agent est une AFFIRMATION) :
`Heatmap` n'a bien aucun appelant · `FilterBar` a bien 2 consommateurs sur 5 ·
`product-analytics.service.ts` porte bien **trois écritures et zéro lecture**
(`track` :256, `trackBehavioral` :289, `ingestBehavioralBatch` :324) ·
le cron du rapport hebdo existe bien (`@Cron('20 8 * * 1', Europe/Paris)`).
Une imprécision relevée : S1 dit « `exigerCapacite` appelé par 40 routes API » —
c'est **95 occurrences dans `apps/dashboard-manager`**, zéro dans `apps/api`.
Direction juste, localisation fausse.

## Le motif qui traverse les quatre rapports

**« Producteur livré, consommateur absent »**, sous quatre formes :
- le traceur produit émet 9 événements, **rien ne les lit** (5 écrans) ;
- `discover_scoring.py` **déclare** les axes Chemin et Relation, ne les calcule jamais ;
- `bellum_plan.py` et `bellum_messages.py` ont **zéro référence** à la mémoire marché,
  alors que les cartes web la lisent correctement — le défaut n°1 du dépôt, version
  prompt IA plutôt que version service TypeScript ;
- un registre nommé sans appelant (3/8 alertes, seuil de sessions à 1 appelant sur 3).

## La note de reprise du 08/09 (23:32) — ce qu'elle change

`.claude/notes/issues-reprise-2026-09-09.md`. Deux corrections qu'elle porte
elle-même et qu'il ne faut pas re-payer :
- **« Le service IA a 119 commits de retard » était FAUX.** `git log … -- apps/ia`
  rend **0** sur 147 commits d'écart : c'est l'ÉTIQUETTE de `/version` qui est
  périmée, pas le code. La porte ne se lit donc pas « les deux SHA sont égaux » mais
  **« aucun service n'est en RETARD sur mon commit »**.
- **Le lot le plus rentable qui reste n'est PLUS bloqué** : le format de réponse de
  Laura (#1573.1 format, #1581.2, #1581.3) dans `bellum_advisor.py`.

⚠️ Sa ligne « `/produit` ⛔ BLOQUÉ RGPD » est **antérieure** au manifeste back-office
(09/09 01:16), qui dit que **Louis a levé le gel le 08/09 au soir**. Le traceur est
livré et **éteint par défaut** (`VITE_PRODUCT_TRACKER_ENABLED`). Construire la couche
de LECTURE ne traite aucune donnée personnelle (agrégats ≥ 5 sessions, aucun contenu,
hash de session). **La relecture juridique reste DUE, et aucun commit ne doit laisser
croire l'inverse.** Décision parquée pour Louis.

## Vague B1 — les 4 agents d'écriture du back-office (worktrees isolés)

| # | Lot | Périmètre | Réservations |
| --- | --- | --- | --- |
| B1-a | **La fondation d'analytique produit** : catalogue des écrans, service de LECTURE de `product_events`, routes internes, seuil des 5 sessions appliqué centralement | `packages/contracts/…/product-screens-catalog.ts` (neuf), `apps/api/src/modules/analytics/product-analytics-read.*` (neuf), `internal-product-analytics.controller.ts` (neuf), `analytics-overview.service.ts`, `team-kpis.service.ts`, `doctrine-registry.ts:1751` | migrations `1791830000000–1791839999999`, gardes **GA-265/266/267** |
| B1-b | **Accessibilité** : le token AA manquant (3,74:1 en sombre sur `.btn`), la garde T2 (parcours clavier), la garde T3 (`outline:none`), l'audit des icônes | `dashboard-manager/src/architecture/**`, `globals.css`, `aria-label` seuls | gardes **GA-268/269** |
| B1-c | **Filtres + la jointure qui ne joint pas** : `FilterBar` sur 3 écrans de plus, la jointure espace↔ESN par NOM (`admin.service.ts:305`), le repli « Factures » | `dashboard-manager/src/app/{queues,feedback,monitoring,audit}`, `global-search.logic.ts`, `apps/api/src/modules/admin/**` | garde **GA-270** |
| B1-d | **Alertes + entonnoir** : câbler `api_indisponible` et `job_bloque`, ajouter « Deuxième session » et « Actif à J+30 » | `apps/api/src/modules/backoffice-alerts/**`, `analytics/onboarding-funnel*.ts`, `dashboard-manager/src/app/produit/onboarding/**` | migrations `1791840000000–1791849999999`, garde **GA-271** |

Les cinq écrans consommateurs (#1683, #1684, #1685, #1687, #1688) sont la vague B2 :
un lot qui touche une FONDATION ne part jamais en même temps qu'un lot qui la consomme.

## Le blocage de recette, mesuré

Le profil Chrome de ce poste **n'est pas connecté** à un compte réel
(`app.bellum-ai.com` redirige vers `/login`). La démonstration publique fonctionne
(`/discover` y rend 7 entreprises). Donc :
- ce qui se recette **en démo** : la navigation, les écrans, les deux thèmes, la console ;
- ce qui **ne se recette pas en démo** : ce que Laura RÉPOND (la salle n'appelle
  JAMAIS le modèle), le contexte et le prompt du copilote, `expertise_areas` et
  `offer_domains` (vides en démo), la couverture mémoire marché (tables PARTAGÉES,
  jamais semées en démo), et **tout le back-office** (Basic Auth).

---

## Les décisions de Louis — 09/09, lot unique

| Question | Tranché | Ce que ça change |
| --- | --- | --- |
| **La recette live** | **Louis ouvre la session Chrome** sur son espace | La recette se fait sur l'espace de TEST, pas seulement sur la démo. Ce qui ne se voyait pas en démo (ce que Laura RÉPOND, la mémoire marché, `expertise_areas`) redevient vérifiable. |
| **Les deux mesures SQL** | **Louis les lance** | #1613 (`count(externalization_score)`) et #1634 (`count(city)`, `count(region)`) sortent de l'attente. Si `city`/`region` sont majoritairement nuls, **#1634 TOMBE**. |
| **#1756 — qui remplit la table d'alias** | **Le pack de données livre les alias** | Le producteur du corpus sait quelles raisons sociales il a agrégées : c'est la source qui n'invente rien. ⇒ un **chemin d'import d'alias** est à poser dans `market-memory-import.ts` / le script d'ingestion, EN PLUS du réceptacle de B1-f. Débloque aussi **#1632**. |
| **#1472 / #1417 / #1440** | **Louis nomme l'écran de référence** | L'écran reste à nommer (relancé, non bloquant). Les valeurs littérales (hex fixes, 13/15 px) restent **refusées pour la 3ᵉ fois** — D79 / D80. |

## Les décisions PARQUÉES — tranchées au plus conservateur, dites à voix haute

Aucune ne bloque un lot ; chacune est le choix le plus étroit, et Louis peut demander l'autre.

- **#1672.6 — export CSV du back-office** : *ne pas construire*. La garde anti-export existe pour une raison mesurée — le `sortValue` d'une colonne d'e-mail masqué porte l'**adresse en clair** pour permettre le tri (`users-table.tsx:117`). Un export générique l'exfiltrerait depuis un composant partagé. Si on le veut, ce sera un accesseur d'export **par colonne** dont on prouve qu'il n'est jamais la valeur brute.
- **#1642 — `Heatmap` orpheline** : *brancher, pas retirer*. Une heatmap DUPLIQUÉE est rendue à côté (`AnalysesHeatmap`) — loi 4. Faire passer `AnalysesHeatmap` par la primitive donne une seule implémentation.
- **#1676 — `nouveau_client` / `churn_client`** : *ne pas coder*. « À partir de quand un client est-il nouveau ? » et « qu'est-ce qui fait un churn ? » sont des questions produit non tranchées. Ils restent nommés au registre sans détection, et c'est dit dans l'issue.
- **#1574.6 — Laura proactive sans gradation** : *ne pas construire*. Et de toute façon `GET /laura/plan` répond 401 sur la salle de démonstration : elle ne serait visible nulle part où on montre le produit.
- **#1639 — `/billing`** : *arrêt obligatoire* (facturation). Constat utile quand même : le « 0 crédit » est **déjà vrai de fait** — aucun débit sur les lectures de mémoire marché.
- **#1681.6 — relecture juridique RGPD** : hors code, reste DUE. Aucun commit ne doit laisser croire l'inverse.
- **#1631.6 — `access_cost`** : *REFUS motivé*, D60 — le coût d'accès est DÉCLARATIF et ne s'estime jamais. Il ne s'agrège pas non plus entre espaces (GA-43).

## Vague B — les 8 agents d'écriture en vol

| # | Lot | Issues | Branche |
| --- | --- | --- | --- |
| B1-a | fondation d'analytique produit (catalogue, lecture, seuil 5 sessions) | #1683→#1688 préalable, #1681.1/.2/.5 | `feat/analytique-produit-lecture` |
| B1-b | accessibilité : token AA, garde clavier, garde `outline:none`, icônes | #1674.1b/.3/.4/.8 | `fix/backoffice-accessibilite-trois-trous` |
| B1-c | `FilterBar` sur 3 écrans, jointure espace↔ESN, repli Factures | #1673.3/.4 | `fix/backoffice-filtres-et-jointure` |
| B1-d | alertes `api_indisponible`/`job_bloque`, entonnoir 7 étapes | #1676.1, #1686.5 | `feat/backoffice-alertes-et-entonnoir` |
| B1-e | axes d'adressabilité **chemin** et **relation** — le P0 non tenu | #1631.3/.4/.5 = #1630.4 = #1640.7 | `feat/adressabilite-chemin-et-relation` |
| B1-f | la jointure qui rend zéro sans échouer + la table d'alias | #1756 | `fix/jointure-corpus-registre-mesurable` |
| B1-g | `/briefing` départage sans fabriquer d'urgence | #1637 | `feat/briefing-memoire-marche-departage` |
| B1-h | **le bug CLIENT** : 3ᵉ état d'affichage + 6 filtres morts en mode Signaux | #1766 | `fix/discover-trois-etats-et-filtres-morts` |

## #1766 — ce que l'éclaireur a démenti, et ce qu'il a trouvé

Ma piste « incident Supabase » est **non prouvée**, et trois faits la contredisent : zéro dépendance
Supabase dans tout le chemin `/discover/signals` (`rc=1` sur les cinq sources) ; la vérification JWT
est **locale** (`jwt.strategy.ts:60-104`), donc une panne d'auth aurait rendu un 401, pas un 200 avec
bandeau ; et une piste plus économe existe dans le code — `france_travail.py:557` lève
`SignalSourceUnavailable(…, "authentification OAuth refusée")`, et France Travail est **exactement**
une des deux sources cochées par ce client.

**Ce qui reste vrai quelle que soit la cause** : `Discover.tsx:536-546` rend `DegradedBanner`
**inconditionnellement** dès que `data` existe, pendant que `renderResults()` décide séparément
d'afficher le vide. Le bandeau affirme « les entreprises ci-dessous restent exactes » **au-dessus de
rien**. C'est un FAIL produit, et c'est ce que B1-h corrige.

**Trouvé en creusant, non demandé** : `companyCategory` (que le client avait TOUTE cochée), `region`,
`revenueMin`, `revenueMax`, `legalForm` et `nafCode` sont **morts en mode Signaux** — absents de
`SignalsFilters` et de `buildSignalsQuery`. Même famille que le jumeau `sectors`, déjà corrigé.
⚠️ Un filtre ignoré ÉLARGIT : ce n'est **pas** la cause du zéro, et le dire serait faux.
