### Passe B — archive 04 INTÉGRATIONS / DONNÉE / RAG / SÉCURITÉ / INFRA

> Lecture seule, 29/08/2026. Consigne inversée : partir de la matière brute, chercher ce que la
> SOURCE demande et que le TRACKER ne mentionne NULLE PART.
> Source : `agent_docs/sources/BELLUMAI_ITERATION_3_04/04_INTEGRATIONS_DATA_QUALITY_RAG_SECURITY_INFRA/`
> Tracker contredit : `agent_docs/archive-04-integrations-donnee-securite-2026-08-25.md` (134 lignes).

**Fichiers ouverts : 25 / 25**

| Fichier                                       | Ouvert           | Note                                                                                                                                                                                                                                  |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                   | oui              | 4 résolutions + 3 instructions Claude Code                                                                                                                                                                                            |
| `MANIFEST_SHA256.md` / `.csv`                 | oui              | **SHA-256 recalculés à la main : 23/23 conformes, 0 anomalie.** Le tracker dit vrai ici. 25 fichiers sur disque = 23 au manifeste + les 2 manifestes eux-mêmes.                                                                       |
| `original_markdown_sources/pdf7.md`           | oui              | 626 l.                                                                                                                                                                                                                                |
| `original_markdown_sources/T2.md`             | oui              | 949 l.                                                                                                                                                                                                                                |
| `code_evidence/controllers.json`              | oui              | **118 contrôleurs, 702 routes** — jamais dénombré par le tracker                                                                                                                                                                      |
| `code_evidence/packages_summary.txt`          | oui              | 519 l., 17 `package.json` — jamais ouvert par le tracker                                                                                                                                                                              |
| `code_evidence/missing_relative_imports.json` | oui              | 564 entrées, recomptées (voir §3)                                                                                                                                                                                                     |
| `code_evidence/migrations.txt`                | oui              | **0 octet vérifié (`wc -c` = 0)** — non porteur, et c'est l'information                                                                                                                                                               |
| `repo_mirrors/` (11 fichiers)                 | oui              | tous lus intégralement ; **tous byte-identiques à leur copie vivante d'`agent_docs/`** (vérifié par `diff`) — donc ce qui est périmé dans le miroir est périmé DANS LE DÉPÔT                                                          |
| `repo_root/env.example`                       | oui              | 88 l.                                                                                                                                                                                                                                 |
| `repo_root/TECHNICAL_DOCUMENTATION.md`        | oui              | 786 l. — **existe aussi vivant à la racine du dépôt**                                                                                                                                                                                 |
| `source_pdfs/PDF-7-…pdf`, `Tome-2-…pdf`       | **non porteurs** | Binaires. Consigne explicite : lire `original_markdown_sources/*.md`. Le tracker du tome 2 atteste « T2.md, 949 lignes, **identique au PDF** » (`tome2-donnee-sources-pipeline-2026-08-21.md:5`). Contenu couvert par les deux `.md`. |

---

#### Le dénombrement reconstruit

Reconstruit depuis la matière brute seule, sans regarder le tracker.

**`pdf7.md`** — 8 états de capacité (§2) · 4 situations « rien trouvé ≠ pas le droit » (§3) · **22 connecteurs
annoncés** en 12 familles (§4) · 5 règles Teams (§4.3) · 1 carte de connecteur à 7 blocs + 1 séparation
utilisateur/back-office (§5) · **5 boutons** (§6) · **12 sources d'import**, 1 ordre imposé à 8 objets,
**7 étapes**, 1 rapport de simulation, **5 familles de clés de dédup**, **annulation 24 h / 7 j**,
5 règles d'import par API, **4 phases de sortie progressive**, **7 champs de source de vérité** (§7) ·
**9 mesures de sécurité « en place » + 4 « à ajouter »** (§8) · **6 pièges** (§9) · 4 règles de bandeau (§10) ·
**5 tickets** BEL-INT-601→605, dont 7 PR + 5 tests + 5 interdits pour 601 et 6 PR + 6 tests + 4 interdits
pour 602 (§11) · **6 décisions** D6/D26/D34/D35/D36/D37 (§12).

**`T2.md`** — 5 niveaux de collecte N1→N5 + 5 interdits (§1) · 17 sources branchées + 10 à ajouter +
6 impossibles (§2) · **pipeline 7 étages** (§3) · 7 règles de normalisation (§3.2) · **7 cas difficiles de
résolution** (§3.3/§9.2) · 4 clés de dédup (§3.4/§9.4) · **5 niveaux d'interprétation** (§3.5) · 1 format
canonique à 6 blocs (§3.6) · **10 demi-vies de decay** (§3.7) · **6 cibles de crawl + 8 règles + 6 interdits**
(§4) · 4 principes communautaires + 5 moments (§5) · calendrier 7 sources (§10.1) · **7 mitigations** +
**6 plafonds dont 3 « à définir »** (§10.2-10.3 / §19-20) · **7 comportements de panne AVEC LEUR CODE**
(§11 / §23) · **fiche source à 7 champs** (§12) · 10 gestes de coût (§18) · 5 règles de non-agacement +
5 étapes d'agrégation (§24-25) · **4 tickets** BEL-DATA-005/006, BEL-SRC-001/002 (§26) ·
**8 gardes GD-01→GD-08** (§27) · **8 KPI** (§28) · **3 décisions** D51/D85/D86 (§29).

**Total exigible.** Les deux trackers antérieurs — que l'archive 04 déclare « déjà closes » — ont eux-mêmes
numéroté **104 exigences pour le PDF 7** et **108 pour le tome 2**, soit **212 items**.

**Ce que le tracker d'archive 04 traite : 9.** Trois sections du tome 2 (§12, §21, §27), les 4 résolutions
du README, et 2 des 4 fichiers de `code_evidence`. Il ne cite **aucun** des 212 items, **aucun** des 5 tickets
BEL-INT, **aucun** des 4 tickets BEL-DATA/BEL-SRC, **aucune** des 9 décisions, et **aucun** des 11 miroirs.
Rapport de couverture : **9 / 212+**.

---

#### Ce que le tracker ne mentionne NULLE PART

| #   | Ce que la source demande                                                                                                                                                                                                                                                           | Où                                                                                                                                                                                      | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **La passerelle temps réel doit authentifier ses abonnés.** « Socket.IO — WebSocket via NestJS Gateway — **Aucune auth actuellement** » ; et §13 item 8 : « WebSocket Gateway sans authentification — **N'importe quel client peut écouter les analyses d'un autre utilisateur** » | `repo_root/TECHNICAL_DOCUMENTATION.md:484` et `:704` (fichier VIVANT à la racine du dépôt)                                                                                              | **FAILLE RÉELLE, TOUJOURS OUVERTE — voir §« Sécurité » ci-dessous.** L'archive porte le défaut, nommé, daté du 10/04/2026 ; le tracker range les deux fichiers de `repo_root/` sous « deux fichiers de racine » (l. 9) et n'en ouvre aucun. Un `DONE` posé au-dessus d'un trou d'autorisation que l'archive elle-même documente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2   | **« Journal d'accès par connecteur : qui a lu quoi, quand — consultable par l'admin »** (`[Spécification proposée]`, §8) — redemandé par `security.md:23` « Audit trail (qui a accédé à quelles données) »                                                                         | `pdf7.md:429` + `repo_mirrors/security.md:23`                                                                                                                                           | **Deux sources indépendantes de la MÊME archive le demandent.** Le tracker PDF 7 l'a classé item 72 `ABSENT` — et l'item 72 **n'est dans AUCUN des 14 lots** A→N. Il est sorti du plan sans un mot. Vérifié aujourd'hui : aucune table ni service d'accès connecteur dans `apps/api/src` (`integration_deliveries` journalise des ENVOIS sortants, pas des LECTURES). Archive 04 ne le mentionne pas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | **Les TTL de cache par source** — la fraîcheur est la promesse produit                                                                                                                                                                                                             | `repo_mirrors/caching.md:18-31` vs `repo_mirrors/source-cache.md:62-69`                                                                                                                 | **Deux miroirs de la MÊME archive donnent des chiffres contradictoires, et l'un est faux.** Mesuré dans le code : `provider_cache.py:48-53` → firmo **30 j**, news **1 j**, jobs **3 j** ; `scrape_cache.py:38` → Firecrawl **7 j**. `caching.md` annonce 14 j / 2 j / 2 j / 14 j. `source-cache.md` a raison, `caching.md` est périmé — **et il est identique à la copie vivante `agent_docs/caching.md`.** Le tracker n'ouvre ni l'un ni l'autre.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4   | **La garantie anti-donnée-morte n°2** : « Le cache résultat (30 j) est toujours **plus vieux** que les caches provider (≤ 14 j), donc une relance forcée re-scrape au pire de la donnée ≤ 14 j »                                                                                   | `repo_mirrors/caching.md:77-78` (et `agent_docs/caching.md:77-78`)                                                                                                                      | **La garantie est devenue FAUSSE.** `CACHE_MAX_AGE_DAYS = 30` (`accounts.service.ts:368`) et `TTL_FIRMO = 30 j` (`provider_cache.py:48`) : le cache résultat n'est plus strictement plus vieux que le cache provider. Une relance forcée peut resservir du firmo de 30 jours. C'est une garantie ÉCRITE de fraîcheur qui ne tient plus — exactement ce que le README de l'archive appelle « la provenance/fraîcheur est obligatoire ». Le tracker déclare cette résolution « **TENUE** » (l. 121) sans mesurer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5   | **L'interrupteur des vecteurs RAG** : « activer avec `RAG_USE_VECTORS=true` + `EMBEDDING_API_KEY` »                                                                                                                                                                                | `repo_mirrors/knowledge-architecture.md:110` (= `agent_docs/knowledge-architecture.md:110`), redit par `repo_root/TECHNICAL_DOCUMENTATION.md:528`, et **`agent_docs/legal/dpa.md:170`** | **Renvoi mort — et il a fui jusque dans le juridique.** `env-reference.md:79` dit noir sur blanc « la clé est le **seul** interrupteur — `RAG_USE_VECTORS` **supprimé** », et le code le confirme : `rag_service.py:141` « zero-flag policy: **the key IS the switch** », `:259` idem. Zéro occurrence dans `apps/ia/app`. La variable morte survit dans **trois documents vivants** : les deux docs de l'archive, plus l'**accord de traitement des données**, qui liste OpenAI en sous-traitant « Embeddings RAG (`RAG_USE_VECTORS`) — **Contenu des documents Client** — US — CCT ». Un document contractuel conditionne donc un transfert hors UE à un drapeau qui n'existe plus : qui vérifie « les vecteurs sont-ils actifs ? » cherchera une variable absente et conclura que non, alors que la seule pose d'`EMBEDDING_API_KEY` suffit à envoyer le contenu des documents client chez un tiers américain. **RAG est au TITRE de l'archive ; le tracker le mentionne une fois, en passant (« le decay du RAG »), et n'ouvre jamais `knowledge-architecture.md`.** |
| 6   | **Les 7 comportements de panne, chacun avec son CODE** (`provider_unavailable`, `rate_limited`, `200+searched`, `scope_missing`, `deprecated`, `stale`, `conflict`)                                                                                                                | `T2.md:773-781` (§23)                                                                                                                                                                   | Le tracker déclare `GD-08` « **livré**, `source_registry.py` ». Vérifié : le registre existe, sa garde existe (`apps/ia/tests/test_source_registry.py`, 42 l.) — mais `FailureBehaviour` ne porte que **4** valeurs (`graceful_empty`, `reported_degraded`, `raises_unavailable`, `no_op_documented`), et le commentaire juste au-dessus dit « **Les sept comportements de panne (§23)** » (`source_registry.py:23-32`). Un libellé qui annonce sept au-dessus de quatre : le lecteur suivant croira les sept couverts. `deprecated`, `stale`, `conflict` n'existent nulle part — déjà noté item 85 du tracker T2, jamais repris.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 7   | **Les tables sans `workspace_id` sont une décision, jamais un oubli** — corollaire de « isolation par espace » (`pdf7.md:422`)                                                                                                                                                     | `repo_mirrors/source-cache.md:27-54` ; `repo_mirrors/knowledge-architecture.md:58`                                                                                                      | **La garde GA-16 ne peut pas les voir.** `shared-tables-declared.spec.ts` lit **uniquement** `apps/api/src/database/entities/*.entity.ts` (140 fichiers). Or trois tables de cette archive naissent hors de ce corpus : `source_cache` (DDL idempotente **Python**, `apps/ia/app/services/source_cache.py:126`, PK `(source, category, company_key)`, **aucun `workspace_id`**), `config_overrides` (`apps/api/src/migrations/1783500000000-ConfigOverrides.ts:18`, `scope='global'`, **aucune entité**), et les `checkpoints*` du graphe (même patron, cité en précédent par `source-cache.md:29`). GA-16 énumère 16 tables et se croit complète : son docstring dit « **Seize tables y échappent** » — une affirmation d'exhaustivité qu'elle ne peut pas faire, puisqu'elle regarde des ENTITÉS, pas des TABLES. Même moule que le défaut qu'elle raconte avoir corrigé (« elle en voyait quatre »), remonté d'un cran : ce n'est plus la détection du décorateur, c'est le CORPUS.                                                                                   |
| 8   | **Rétention bornée** — « collecte au fil du besoin commercial, **rétention bornée** » (RGPD, finalité et minimisation) ; et « Mécanisme de suppression RGPD automatisé »                                                                                                           | `T2.md:93` (§1.2) + `repo_mirrors/security.md:24` (case NON cochée)                                                                                                                     | **`getRetentionPolicy()` PUBLIE cinq règles, une seule est balayée.** `privacy-retention.service.ts:80-111` déclare `revoked_sessions` 90 j · `anonymized_records` 30 j · `inactive_account` 1095 j · `credit_ledger` 3650 j · `invoices` 3650 j. Un seul balayeur existe : `sweepRevokedSessions` (`:118`). `invoices` dit honnêtement « jamais purgées ici » ; **`anonymized_records`, `inactive_account` et `credit_ledger` sont trois promesses affichées sans code derrière**. Le tracker ne prononce pas le mot « rétention ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 9   | **Les 12 sources d'import, l'ordre imposé, l'annulation 24 h / 7 j** (BEL-INT-602, P0)                                                                                                                                                                                             | `pdf7.md:306-381`, `:534-582`                                                                                                                                                           | Le tracker PDF 7 les note LIVRÉES au lot L — puis, dans « ce qui reste ouvert », écrit que **l'écriture n'est branchée que pour les COMPTES et les CONTACTS ; les dix autres objets se simulent et refusent l'écriture**, et que `sync_links` **n'est toujours jamais inséré** (défaut n°9, « NON corrigé »). Archive 04 déclare le PDF 7 « déjà clos » sans reprendre un seul de ces reliquats.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10  | **Les 5 boutons, le pré-consentement, le test non destructif** (BEL-INT-601, P0) — et les orphelins du plan                                                                                                                                                                        | `pdf7.md:239-294`, `:462-530`                                                                                                                                                           | Le plan à 14 lots du tracker PDF 7 laisse **sans lot** les items PARTIEL/ABSENT suivants : **2** (verbes `résumer`/`supprimer`/`planifier` absents), **10** (429 + file d'attente : `ABSENT`), **19** (`/agenda/status` rend toujours `read: true`), **21** (PJ→lien absent, « e-mail par défaut » non gardé), **22** (seul HubSpot lit vraiment, 3 CRM sur 4 sans lecture paginée), **26** (`update_tjm`/`update_need_status` sont des **POST de création** — une mise à jour BoondManager n'a aucune chance d'aboutir), **28** (`Files.Read.All` toujours pas dans les portées par défaut), **30** (la couche zéro cherche par NOM, pas par contenu), **47** (KPI d'adoption connecteur), **70** (le socle sécurité « en place » = 6/9), **72** (le journal d'accès, ligne 2 ci-dessus), **80** (check-list opérateur avant ajout de portée). Aucun n'apparaît dans archive 04.                                                                                                                                                                                        |
| 11  | **La révocation au « Déconnecter »**, décidée « là où le fournisseur la documente (**Google, HubSpot, Salesforce, Pipedrive**) »                                                                                                                                                   | `pdf7.md:294` (§6.5) + décision du tracker PDF 7, l. 278                                                                                                                                | **Décision à moitié exécutée.** Vérifié : Google révoque (`google.service.ts:914`), HubSpot révoque (`crm.service.ts:646`). **Salesforce et Pipedrive ne révoquent pas** — leur code le dit encore : `salesforce.service.ts:334` et `pipedrive.service.ts:309`, « does not revoke server-side ». Deux fournisseurs nommés dans la décision, tombés de la livraison, sans une ligne. (Détail annexe : `crm.service.ts:498` est un JSDoc **orphelin** — « does not revoke server-side at HubSpot » flotte au-dessus de `createTask`, et dit le contraire du code.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 12  | **« Purger `FIRECRAWL_MAX_PAGES=3` des variables Railway du service IA »** — tant qu'elle existe, elle écrase le défaut code 12 et maintient la prod **au tiers** de la profondeur cible                                                                                           | `repo_mirrors/collection-depth.md:106`                                                                                                                                                  | Action opérateur explicite, en gras, dans un miroir canonique de l'archive. Non vérifiable depuis le dépôt (c'est une variable Railway) — **et c'est précisément pour ça qu'elle devait être portée par le tracker.** Un `DONE` la referme définitivement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 13  | **La fiche source à 7 champs** (§12)                                                                                                                                                                                                                                               | `T2.md:503`                                                                                                                                                                             | Le tracker le traite honnêtement (3/7, « non livré, le remplir demanderait des mesures qu'on n'a pas ») — **et c'est le seul point du document où il fait le travail**. Retenu ici pour dire que le reproche n'est pas global : il est que ce niveau d'exigence n'a été appliqué qu'à une section sur 212 items.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

#### Sécurité : ce que la source exige et que rien ne tient

**FAILLE RÉELLE — deux passerelles Socket.IO n'authentifient personne et joignent la salle que le client
nomme.** L'archive porte le diagnostic, elle-même, à deux endroits (`repo_root/TECHNICAL_DOCUMENTATION.md:484`
et `:704`, item ÉLEVÉ n°8 du 10/04/2026, « fix estimé 2h »). Vérifié dans le code du 29/08 :

- `apps/api/src/modules/analysis/analysis.gateway.ts:15-20` — `@WebSocketGateway({ cors })`, **aucun
  `@UseGuards`, aucun `handleConnection`, aucune vérification de jeton**.
  `apps/api/src/modules/analysis/analysis.gateway.ts:57-59` — `handleJoin(@MessageBody() accountId)` fait
  `client.join(accountId)` : la salle est celle que le client NOMME, sans le moindre contrôle
  d'appartenance. La passerelle diffuse ensuite dans cette salle `phase:started`, `phase:progress`,
  **`phase:complete` avec `data?: Record<string, unknown>`** (`:100-107`), `analysis:done`,
  `analysis:error`, `analysis:degraded`.
- `apps/api/src/modules/profile-context/profiler.gateway.ts:68-74` — **pire** :
  `handleJoin(@MessageBody() userId)` joint `profiler:${userId}` avec un **identifiant d'utilisateur fourni
  par l'appelant**, puis **rejoue immédiatement le tampon de cet utilisateur** vers le socket appelant
  (`for (const { event, payload } of replay) client.emit(event, payload)`). Le tampon contient les
  `emitField(userId, field, label, **preview**)` du profil ESN.

Ce qui existe et ne suffit pas : l'allowlist CORS (`getAllowedCorsOrigins()`) borne les origines
**navigateur**, pas un client socket quelconque ; et les identifiants sont des UUID — de l'obscurité, pas
une autorisation.

**Et la garde est verte, structurellement.** `apps/api/src/architecture/endpoint-guards.spec.ts` (GA-05)
n'énumère que des `*.controller.ts` : une passerelle n'entre jamais dans son corpus. Son propre docstring
admet le reste du moule — « `WorkspacePermissionGuard` est **fail-open par défaut** : une route sans
`@RequirePermission` passe intacte […] **53 contrôleurs sur 98 n'ont aujourd'hui aucune déclaration** », et
la garde **FIGE** cette liste au lieu de la fermer. `workspace-isolation.spec.ts` ne parle pas non plus de
passerelle. Il existe `analysis.gateway.spec.ts` et `profiler.gateway.spec.ts` : aucun des deux ne pose
`@UseGuards` ni ne teste l'autorisation de `join`.

**Second point, plus discutable mais du même moule.** `google/google.controller.ts`, `microsoft/…` et
`notion/…` figurent tous trois dans la liste figée de GA-05 (`endpoint-guards.spec.ts:131`, `:141`, `:143`)
et ne portent **aucune** `@RequirePermission`. Pour la boîte mail et l'agenda c'est conforme à D58
(connecteurs personnels). Mais deux routes de ce même contrôleur ne sont pas personnelles :
`POST /google/sheets/export` (`google.controller.ts:122`) **sort les contacts de l'espace** vers un Sheet
externe, et `POST /google/drive/ingest` (`:158`) **écrit dans le RAG de l'espace**. Le même geste ailleurs
exige `@RequirePermission('data:export')` — `crm.controller.ts` ×7, `accounts.controller.ts:456`,
`projects.controller.ts:713`, `salesforce.controller.ts:56`, `import.controller.ts:33`,
`telephony.controller.ts:70`, `admin-docs.controller.ts:58`. Ici, `JwtGuard` seul. Ni `@PersonalScope`, ni
`@MarketData`, ni `@WorkspaceRead` : rien ne DIT que c'est un choix.

**Ce que l'archive demande et qui n'a jamais été mesuré par le tracker** : `repo_mirrors/security.md`
(source canonique déclarée par le README de l'archive) porte **14 cases à cocher**, dont, non cochées :
CORS restreint (l. 11), rate limiting (l. 12), en-têtes CSP/HSTS/X-Frame-Options (l. 14), audit des
dépendances (l. 15), **chiffrement applicatif des e-mails/téléphones enrichis** (l. 22), **audit trail**
(l. 23), **mécanisme de suppression RGPD automatisé** (l. 24), détection multi-device (l. 25). Le tracker
d'archive 04 **ne cite jamais `security.md`** — dans une archive dont le titre porte le mot « sécurité ».

Le seul point de sécurité du tracker (« Aucun secret ni contenu confidentiel dans logs/traces — **TENUE** »,
l. 122) est argumenté sur Langfuse seul. Il ne dit rien des jetons, du chiffrement au repos, des en-têtes,
ni des passerelles.

---

#### Renvois morts, contradictions, blocs non éclatés

**Contradiction n°1 — le tracker contredit son prédécesseur sans le dire, et sa prémisse est fausse à 2/3.**
Archive 04, l. 56-59 : « Trois sections du tome n'ont **aucune trace** dans son tracker
(`tome2-donnee-sources-pipeline-2026-08-21.md`) : §12, §21, §27 ». Vérifié ligne à ligne dans ce tracker :

- **§27 est couvert**, items **97 à 104**, `tome2-…-2026-08-21.md:226-233` — un par GD, nommés `GD-01`…`GD-08` ;
- **§21 est couvert**, items **82-84**, `:223-225` ;
- §12 seul est effectivement sans trace.

Et la prémisse fausse porte la conclusion. Archive 04 conclut « **Huit sur huit. Le tracker n'en citait
qu'une ; le dépôt les porte toutes.** » Le tracker T2 dit l'inverse, item par item : `GD-02` **PARTIEL**
(« 4 structures coexistent, **aucune garde globale** », `:227`), `GD-03` **PARTIEL** (`:228`), `GD-05`
**PARTIEL** (`:230`), **`GD-06` ABSENT** (`:231`), **`GD-07` ABSENT** (`:232`), **`GD-08` ABSENT** (`:233`).
Trois `ABSENT` et trois `PARTIEL` sont devenus « huit sur huit » en une phrase, sans que la contradiction
soit nommée. Pire : les lots qui devaient les fermer (3, 6, 8+9) sont enregistrés dans ce même tracker à
`:325-335` avec **« Mergé : — »** et **« Vérifié en live : à faire »**. Archive 04 déclare acquis ce que sa
source déclare non mergé.

Nuance honnête : `COMMUNITY_THRESHOLD = 3` existe bien (`packages/contracts/src/schemas/community-facts.ts:31`,
testé) et `source_registry.py` existe. Ce n'est donc pas faux partout — c'est **affirmé sans être mesuré**,
et c'est exactement le reproche que le tracker adresse à `missing_relative_imports.json` (« un artefact
publié sans avoir été confronté au dépôt »).

**Contradiction n°2 — deux TTL de cache, deux vérités, dans la même archive.** `caching.md` vs
`source-cache.md` (détail au trou n°3). Aucun tracker ne l'a vu. Les deux fichiers sont vivants dans
`agent_docs/`.

**Contradiction n°3 — `RAG_USE_VECTORS`, mort dans le code et dans `env-reference.md`, vivant dans TROIS
documents** — les deux de l'archive, plus l'accord de traitement des données `agent_docs/legal/dpa.md:170`,
qui y conditionne un transfert de contenu client hors UE (trou n°5).

**Renvoi mort.** `repo_root/TECHNICAL_DOCUMENTATION.md:541` documente encore `VITE_PAPPERS_API_KEY`
(« clé Pappers côté client, visible dans le bundle ») comme une variable supportée — une pratique que
`CLAUDE.md` interdit (« JAMAIS de clé API dans du code côté client »). Le code, lui, l'a fermée :
`apps/web/src/features/search/hooks/useCompanySearch.ts:38` dit « fixed by routing everything ». Le
document vivant recommande donc une pratique interdite et corrigée. Idem `VITE_IA_URL` (« certaines pages
appellent FastAPI directement ») : zéro occurrence dans `apps/web/src`.

**Item traité en BLOC, n°1.** L. 8-9 : « Plus **quatre inventaires de code** et **deux fichiers de racine**. »
Deux des quatre sont traités ; `controllers.json` (**118 contrôleurs, 702 routes** — l'inventaire complet de
la surface d'API, dans une archive dont le sujet est la sécurité) et `packages_summary.txt` ne sont jamais
ouverts. Les **deux** fichiers de racine ne sont jamais ouverts — dont celui qui porte la faille du §Sécurité.
Une seule ligne les compte tous les six ; le compte tient lieu de lecture.

**Item traité en BLOC, n°2.** L. 7-8 : « Deux sources, toutes deux **déjà closes** ». 212 exigences
numérotées sont refermées par cette proposition. Aucun reliquat de ces deux trackers n'est repris — alors
que les deux en listent explicitement (« Ce qui reste ouvert », `pdf7-…:329-342` ; « Ce qu'on ne promet
pas », `tome2-…:286-319`).

**Ce que `packages_summary.txt` disait, et que personne n'a lu.** `apps/ia/package.json` porte
`"lint": "echo 'TODO: ruff check'"` — **le service Python n'a aucun linter**, dans le seul service qui parle
aux fournisseurs externes. Non porteur d'une exigence explicite du PDF, mais c'est ce genre de ligne qu'un
inventaire de code sert à trouver, et l'inventaire n'a pas été ouvert.

**Une précision d'honnêteté sur le §1 du tracker.** Sa mesure « 564 entrées, **2 réellement introuvables**,
et les deux sont des contre-exemples délibérés » est juste dans son esprit. Recomptée le 29/08 en résolvant
chaque import contre le disque : **562 imports en `.js`**, et **6** non résolus — les 2 contre-exemples de
`esm-import-extensions.test.ts`, plus 4 qui pointent vers `packages/contracts/src/schemas/action-library.ts`
et `product-kpi.ts`, **supprimés depuis** (leurs `export` ont disparu d'`index.ts` aussi : rien n'est cassé).
La conclusion « 564 faux positifs » tient ; le chiffre « 2 » est une photo, pas un invariant. Détail mineur,
noté pour que personne ne le recompte en croyant trouver une régression.

---

#### Verdict : le `DONE` est-il défendable ?

**Non.**

Une seule raison suffirait : **l'archive transporte, dans `repo_root/TECHNICAL_DOCUMENTATION.md:484` et
`:704`, le diagnostic écrit d'un trou d'autorisation temps réel qui est toujours ouvert dans le dépôt le
29/08** — deux passerelles Socket.IO sans authentification, dont l'une rejoue le tampon d'un utilisateur
à quiconque annonce son identifiant. Le tracker a rangé ce fichier sous « deux fichiers de racine » et ne
l'a jamais ouvert. C'est le scénario exact que la mission redoutait : _un trou de sécurité oublié ne se
signale pas tout seul_, et un `DONE` promet que personne ne rouvrira le carton.

Les trois autres raisons, dans l'ordre de gravité :

1. **La seule affirmation forte du tracker est bâtie sur une prémisse fausse.** « §27 n'a aucune trace dans
   son tracker » → c'est faux, les huit `GD` y sont aux items 97-104 ; et ce tracker-là les note **trois
   ABSENT et trois PARTIEL**, sur des lots que lui-même enregistre **non mergés**. « Huit sur huit » est un
   verdict rendu contre la source qu'il prétend compléter, sans le dire.
2. **La sécurité, qui est dans le titre, n'est jamais mesurée.** `security.md` — source canonique déclarée
   par le README de l'archive, 8 cases non cochées dont l'audit trail, le chiffrement des coordonnées
   enrichies et la purge RGPD — n'est **pas cité une seule fois**. Le journal d'accès par connecteur, demandé
   deux fois dans l'archive, est sorti du plan à 14 lots sans un mot. Et cinq politiques de rétention sont
   publiées à l'utilisateur pour un seul balayeur.
3. **Deux vérités contradictoires ont été archivées côte à côte sans arbitrage** : les TTL de `caching.md`
   contre ceux de `source-cache.md` — dont l'un rend fausse une garantie de fraîcheur écrite en toutes
   lettres — et `RAG_USE_VECTORS`, mort dans le code, vivant dans trois documents dont l'**accord de
   traitement des données**, où il conditionne un transfert de contenu client hors UE.
   Ce sont exactement les « contradictions résolues en silence » qu'un second passage doit trouver.

Ce que le tracker fait bien, et qu'il faut garder : le démontage de `missing_relative_imports.json`
(564 faux positifs, la bonne conclusion), la lecture de `migrations.txt` à 0 octet, et le §12 du tome 2
mesuré à 3 champs sur 7 avec la raison écrite de ne pas inventer les quatre autres. Le problème n'est pas
la qualité du travail fait : c'est son **périmètre** — 9 items sur 212+, et pas un seul du côté sécurité.

**Reclassement proposé : `DONE` → `À ROUVRIR`**, avec priorité au §Sécurité (les deux passerelles), puis aux
trous 2, 3-4, 5, 7 et 8.
