# Tome 2/8 — La donnée : sources, collecte, pipeline, interprétation — 20 août 2026

Source : `agent_docs/sources/tome2-donnee-sources-pipeline-2026-08-21.pdf` (18 pages,
lues intégralement le 22/08/2026) + la source Markdown livrée
`agent_docs/sources/tomes-md/T2.md` (949 lignes, identique au PDF). Auteur ORION.
Origine : call bêta Loïc du 20/08 · note stratégique · document Pariente Consulting.

Deuxième des **8 tomes** reçus le 22/08. Le tome 1 (pivot d'accessibilité) est livré,
sa recette live est faite (`agent_docs/tome1-pivot-accessibilite-2026-08-20.md`).

**Arbitrage de Louis du 22/08 : tome par tome, validation entre chaque.**

## 0. Ce qu'il faut savoir avant de le lire

Le tome dit lui-même ce qu'il ne contient pas : le scoring (**tome 3**), l'exploitation
ESN (**tome 4**), le RAG (**tome 7**). C'est la clé de lecture du tracker : une bonne
moitié de ses « usages sous-exploités » sont des usages **ESN** (volume d'offres par
ESN → débordement, cartographie d'agences, CA d'une ESN, crawl de la page « nos
agences »). Ils sont inventoriés ici et **renvoyés au tome 4**, où vit leur
consommateur. Les livrer maintenant produirait exactement ce que ce dépôt passe son
temps à corriger : du code qui écrit dans une table que personne ne lit.

Ce qui reste — et qui est le vrai tome 2 — est la **collecte** : quelles sources, ce
qu'elles donnent réellement, ce qu'on ne peut pas savoir, et comment on le dit.

### Ce que le croisement a établi de plus important

**⚠️ Le refus le plus coûteux du tome 1 repose sur un fait faux.** `CLAUDE.md:483` et
`packages/contracts/src/schemas/access.ts:240` affirment que « DECP ne publie pas
`dureeMois` dans ce jeu », et en tirent que l'échéance d'un référencement n'est pas
promise. **Vérifié en direct le 22/08 sur les deux jeux de données réellement
appelés** :

| Jeu de données                             | `dureemois` | Couverture mesurée (100 marchés IT récents, CPV 72xx)  |
| ------------------------------------------ | ----------- | ------------------------------------------------------ |
| `decp-2022-marches-valides` (chemin liste) | **présent** | **100 / 100** exploitable · 14 346 marchés IT au total |
| `decp_augmente` (chemin mono-entreprise)   | **présent** | **100 / 100** exploitable · 20 315 marchés IT au total |

Le champ existe, il est peuplé, et `datenotification + dureemois` donne la date de
fin. Le tome 2 le dit en une phrase (§14) : « DECP porte trois informations que rien
d'autre ne donne : qui a gagné, pour combien de temps, et donc **quand ça se rouvre**.
C'est la seule source qui transforme un « non » en rendez-vous daté. » C'est le
lot 0, et c'est le meilleur rapport valeur/effort des huit tomes lus jusqu'ici.

Nuance vérifiée, et qui devient une garde : `decp_augmente` porte des dates de
notification **dans le futur** (1 sur 100 dans l'échantillon ; le code du dépôt
notait déjà « max datenotification 2048-12-06, aberrant »). Une échéance calculée sur
une date invraisemblable serait une invention datée — la pire espèce.

**Deux contrats d'API vérifiés en direct** (règle du dépôt : on n'écrit jamais un
client sur un contrat deviné) :

- Greenhouse — `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` → 200,
  `jobs[]` avec `id`, `title`, `absolute_url`, `location.name`, `updated_at`,
  `first_published`, `company_name`. Sans authentification. (140 offres sur le board
  d'essai.)
- Lever — `GET https://api.lever.co/v0/postings/{company}?mode=json` → 200, tableau
  d'objets avec `id`, `text` (l'intitulé), `hostedUrl`, `categories.{commitment,
department, location}`, `createdAt` (epoch ms), `country`, `workplaceType`. Sans
  authentification. Un board inconnu rend **404 `{"ok":false}`** — c'est le signal de
  détection d'ATS, et il ne coûte rien.

**Le tome compte 17 sources branchées ; il y en a 16** (`apps/ia/app/services/
data_sources/`, `__init__.py` vide non compté). Pappers et l'enrichissement Apollo
vivent ailleurs (`apps/ia/app/services/pappers/`, `apps/ia/app/services/apollo.py`),
ce qui explique l'écart.

**Trois affirmations du tome sont fausses ou datées** :

| Ce que le tome affirme                                              | Réalité                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §4 « Firecrawl est déjà branché pour le site officiel d'un compte » | Firecrawl ne **crawle** pas : il _scrape_ une à une des URL trouvées par Brave (`apps/ia/app/services/research/firecrawl.py`). Aucun appel `.crawl()`/`.map()` dans le dépôt. Le « site officiel » est un hit parmi d'autres, favorisé par un score de mots-clés d'URL. |
| §23.1 « Test de garde : une portée absente produit un 503 nommé »   | Vrai pour les **connecteurs** (GA-10, `qualified-empty-lists.spec.ts`) ; les **sources de collecte** de l'IA n'ont aucune garde équivalente.                                                                                                                            |
| §3.4 « doublons proposés, jamais fusionnés — invariant du dépôt »   | Vrai pour les **contacts** uniquement, et c'est délibéré : `duplicates.sweeper.ts:29` — « Portée : les contacts. Les comptes ne sont pas proposés. » Aucune détection de doublons de COMPTES n'existe.                                                                  |

---

## 1. Inventaire

Statuts : `LIVRÉ` (preuve `fichier:ligne`) · `PARTIEL` · `ABSENT` · `TOME 4` (le
consommateur vit ailleurs) · `DÉCISION` · `DIFFÉRÉ` (avec raison).

### 1.1 Doctrine de collecte (p.2)

| #   | p.  | Exigence                                                 | Statut | Preuve / raison                                                                           |
| --- | --- | -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| 1   | 2   | Les 5 niveaux N1→N5 et leur statut juridique             | ABSENT | les règles existent, la doctrine écrite non — lot 7                                       |
| 2   | 2   | Les 5 interdits (scraping, contournement, robots, RGPD…) | LIVRÉ  | `CLAUDE.md` refus permanents + `.claude/skills/pdf-chantier/references/conventions.md:§7` |
| 3   | 2   | Le principe « se faire passer pour un autre ⇒ non »      | ABSENT | la règle est appliquée, jamais énoncée — lot 7                                            |

### 1.2 Inventaire des sources (p.3-4)

| #   | p.  | Exigence                                                | Statut   | Preuve / raison                                                                                                                                                                                                             |
| --- | --- | ------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | 3   | « 17 modules branchés »                                 | LIVRÉ    | 16 en réalité : `apps/ia/app/services/data_sources/` (+ Pappers et Apollo hors dossier)                                                                                                                                     |
| 5   | 3   | France Travail — volume d'offres par ESN                | TOME 4   | `france_travail.py:442` liste des employeurs, aucun comptage de volume ; le débordement est tome 4                                                                                                                          |
| 6   | 3   | APEC — idem                                             | TOME 4   | `apec.py:18` actif par défaut                                                                                                                                                                                               |
| 7   | 3   | WTTJ — no-op documenté, réactivable ?                   | LIVRÉ    | `wttj.py:1-31,58-63` — no-op strict sans clés Algolia légitimes                                                                                                                                                             |
| 8   | 3   | BOAMP — allotissement (quel lot est à ma taille)        | DIFFÉRÉ  | absent (`public_tenders.py:226-241`) ; les avis récents sont en **eForms UBL** imbriqué (`cac:ProcurementProjectLot`) et les anciens en schéma Boamp_v230 — deux parseurs, pour un usage qui appartient au scoring (tome 3) |
| 9   | 3   | DECP — verrouillage **+ échéance**                      | PARTIEL  | verrouillage livré (tome 1, `lockFactFromAwards`) ; **échéance absente sur un refus factuellement faux** → lot 0                                                                                                            |
| 10  | 3   | BODACC — santé du partenaire avant de s'y adosser       | TOME 4   | `bodacc.py:83` rend le libellé brut, aucune classification ; le consommateur est le partenaire (tome 4)                                                                                                                     |
| 11  | 3   | Recherche d'entreprises — cartographie d'agences        | TOME 4   | `recherche_entreprises.py:94` ne rend qu'un COMPTE d'établissements ; la liste existe (`insee_sirene.py:347`)                                                                                                               |
| 12  | 3   | INSEE Sirene — idem                                     | TOME 4   | `insee_sirene.py:392` `sites_for_siren` alimente déjà `sitesFrance`                                                                                                                                                         |
| 13  | 3   | INPI RNE — liens capitalistiques entre ESN              | TOME 4   | `inpi_rne.py:34-59` ne lit que les bénéficiaires effectifs                                                                                                                                                                  |
| 14  | 3   | Pappers — CA et effectif d'une ESN                      | TOME 4   | lus (`pappers/models.py:128,81`), l'usage « capacité à sous-traiter » est tome 4                                                                                                                                            |
| 15  | 3   | GitHub org — stack réelle d'une ESN                     | TOME 4   | `github_org.py:355-362` produit déjà langages/repos actifs                                                                                                                                                                  |
| 16  | 3   | tech_detect                                             | LIVRÉ    | `tech_detect.py:29-58` ~27 signatures                                                                                                                                                                                       |
| 17  | 3   | Brave/Serper/Tavily — communiqués de partenariat        | ABSENT   | aucun mot-clé injecté (`brave_news.py:38`) ; ciblage = tome 4                                                                                                                                                               |
| 18  | 3   | Firecrawl — page « nos agences »                        | TOME 4   | pas de ciblage de page (`firecrawl.py:177` favorise seulement les URL carrière)                                                                                                                                             |
| 19  | 3   | Apollo — BM et responsables d'agence d'une ESN          | TOME 4   | cascade livrée (`apollo.py:59-69`), l'usage ESN est tome 4                                                                                                                                                                  |
| 20  | 3   | `territory_query` — socle du balayage territorial       | PARTIEL  | `territory_query.py:14-27` livré, appelé **à la demande seulement** (`discover_signals.py:552`), jamais planifié                                                                                                            |
| 21  | 3   | Ajouter Greenhouse Job Board API (priorité haute)       | ABSENT   | **contrat vérifié en direct** → lot 1                                                                                                                                                                                       |
| 22  | 3   | Ajouter Lever Postings API (priorité haute)             | ABSENT   | **contrat vérifié en direct** → lot 1                                                                                                                                                                                       |
| 23  | 3   | WTTJ (priorité moyenne)                                 | LIVRÉ    | no-op documenté ; s'active à la clé Algolia de l'opérateur                                                                                                                                                                  |
| 24  | 4   | Crawl de la page carrière de chaque ESN                 | TOME 4   | exige le référentiel ESN (`BEL-DATA-001`)                                                                                                                                                                                   |
| 25  | 4   | Crawl de la page « nos agences » de chaque ESN          | TOME 4   | idem — « critique pour §12 », et §12 est le territoire (tome 4)                                                                                                                                                             |
| 26  | 4   | TED (marchés européens)                                 | DIFFÉRÉ  | priorité moyenne annoncée ; aucun écran ne le demande aujourd'hui                                                                                                                                                           |
| 27  | 4   | AWS / PLACE / plateformes acheteurs                     | DIFFÉRÉ  | priorité basse annoncée par le tome lui-même                                                                                                                                                                                |
| 28  | 4   | Registres étrangers                                     | LIVRÉ    | packs pays BE/US/CA/CH existants (`CLAUDE.md`)                                                                                                                                                                              |
| 29  | 4   | Déclaratif utilisateur (critique)                       | PARTIEL  | `AccountAccessService.declare` (`account-access.service.ts:131`) ; les 5 moments manquent → lot 8                                                                                                                           |
| 30  | 4   | Communautaire (le moat)                                 | DÉCISION | rien n'existe ; D51 → lot 9                                                                                                                                                                                                 |
| 31  | 4   | Règle produit « là où la donnée n'existe pas, le dire » | LIVRÉ    | `access.ts` (`inconnu` explicite), `discover_scoring.py` (`unmeasured`), i18n « Je ne sais pas si… »                                                                                                                        |

### 1.3 Le pipeline en 7 étages (p.4-6)

| #   | p.  | Exigence                                              | Statut  | Preuve / raison                                                                                                                                                                                                                                         |
| --- | --- | ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 32  | 4   | Un pipeline NOMMÉ en 7 étages                         | ABSENT  | `agent_docs/pipeline.md` décrit 5 étapes produit, pas ces étages — lot 7                                                                                                                                                                                |
| 33  | 4   | Deux modes : balayage territorial / approfondissement | PARTIEL | Explorer est gratuit et synchrone (`accounts.service.ts:824`), l'analyse est en file et débitée ; aucun balayage planifié                                                                                                                               |
| 34  | 4   | Règle de coût : le mutualisé ne débite aucun espace   | LIVRÉ   | précédent en place : `WatchlistRefresh` rafraîchit sans débiter (`CLAUDE.md`)                                                                                                                                                                           |
| 35  | 5   | Normalisation : 7 règles                              | PARTIEL | dates `timestamptz`/UTC ✓ · domaines ✓ (`assets.py:17`, `logo-source.ts:76`) · département ✓ (`territory_query.py:14`) · NAF ✓ · montants **mixtes** (centimes côté facturation, `numeric` côté CRM) · adresses/code INSEE ✗ · nom vs forme juridique ✗ |
| 36  | 5   | SIREN pivot                                           | LIVRÉ   | `pappers/discovery.py:108-115`, `routers/discover.py:177-183`                                                                                                                                                                                           |
| 37  | 5   | Référentiel ESN : 477 lignes, 18 doublons, SII ×7     | TOME 4  | `BEL-DATA-001`                                                                                                                                                                                                                                          |
| 38  | 5   | 4 clés de déduplication                               | PARTIEL | livré pour les CONTACTS (`crm-duplicates.ts:20-25`) ; **aucune détection de doublons de comptes** (`duplicates.sweeper.ts:29`, refus délibéré)                                                                                                          |
| 39  | 5   | Les 5 niveaux d'interprétation                        | PARTIEL | 7 statuts existants (`truth_status.py:22-30`) : FAIT/REGISTRE/SIGNAL/HYPOTHESE/RECOMMANDATION/RISQUE/INCONNU                                                                                                                                            |
| 40  | 6   | Le format canonique d'une affirmation                 | PARTIEL | « ce que je ne sais pas » existe (`context_transparency.py:152`), badge « déduit » existe (`accountDetail.json:469`) ; le format complet n'est nulle part                                                                                               |
| 41  | 6   | Aucun pourcentage de probabilité                      | LIVRÉ   | refus structurel ×6 (`mission-scores.ts:18`, `crm-kpis.spec.ts:89`, `1789537604211-NeedFields.ts:23`) — mais aucune garde qui LIT un texte                                                                                                              |
| 42  | 6   | Decay : 10 demi-vies, « périmé ⇒ inconnu »            | PARTIEL | `signal_freshness.py:44-65`, `access.ts:95-123`, `priority-gate.ts:97`, `contact-enrichment.ts:37` ; rien ne « redevient inconnu » hors faits d'accès                                                                                                   |

### 1.4 Le crawl (p.6-7)

| #   | p.  | Exigence                       | Statut  | Preuve / raison                                                                                                                                                                                                                                    |
| --- | --- | ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 43  | 6   | 6 cibles de crawl              | PARTIEL | une seule : les hits Brave d'un compte analysé ; les 5 autres sont tome 4                                                                                                                                                                          |
| 44  | 6   | 8 règles de crawl              | PARTIEL | cache 7 j ✓ (`scrape_cache.py:38`) · cadence par FOURNISSEUR ✓ (`rate_limiter.py:96`, 20 rpm) · profondeur = 12 pages/run ✓ (`research/firecrawl.py:243`) · robots.txt et user-agent **délégués à Firecrawl** · pause après 3 échecs ✗ · journal ✗ |
| 45  | 7   | Ce que le crawl ne fait jamais | LIVRÉ   | aucun login, aucun contournement : le scrape passe par Firecrawl, qui rend `WEBSITE_BLOCKED` (`firecrawl.py:54`)                                                                                                                                   |

### 1.5 La donnée communautaire (p.7-8, p.15-16)

| #   | p.  | Exigence                                              | Statut   | Preuve / raison                                                                                                        |
| --- | --- | ----------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| 46  | 7   | Ce qui remonte / ce qui ne remonte jamais             | DÉCISION | D51                                                                                                                    |
| 47  | 7   | 4 principes : opt-in, seuil 3, réciprocité, anonymat  | DÉCISION | D51 — Louis a tranché « cadre complet et activé » le 22/08, **la revue CGU doit précéder le merge**                    |
| 48  | 7   | 5 moments de contribution à 1 clic                    | ABSENT   | lot 8                                                                                                                  |
| 49  | 7   | Une question par compte et par espace, jamais reposée | PARTIEL  | précédent : `laura_interventions` + `REFUSAL_COOLDOWN_DAYS = 30` (`laura.service.ts:61`)                               |
| 50  | 8   | La valeur chiffrée par nombre d'espaces               | —        | hypothèse, rien à coder                                                                                                |
| 88  | 15  | Les 5 moments et le champ alimenté                    | ABSENT   | lot 8                                                                                                                  |
| 89  | 15  | 5 règles de non-agacement                             | PARTIEL  | plafond de proactivité livré (`notifications.service.ts:201`), aucun format « question » (`laura-interventions.ts:45`) |
| 90  | 16  | Agrégation : 1 / 2 / 3 espaces, divergence            | ABSENT   | lot 9                                                                                                                  |
| 91  | 16  | Ce qui ne remonte jamais                              | ABSENT   | lot 9                                                                                                                  |
| 92  | 16  | Réciprocité : non-contributeur ne consomme pas        | ABSENT   | lot 9                                                                                                                  |

### 1.6 Résolution d'entité et ordonnancement (p.8-10)

| #   | p.  | Exigence                                            | Statut  | Preuve / raison                                                                                                                                                         |
| --- | --- | --------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 51  | 8   | 7 cas difficiles (alias, groupe, agences…)          | PARTIEL | détail lignes 51a-51g ci-dessous                                                                                                                                        |
| 51a | 8   | Table d'alias nom commercial ≠ raison sociale       | ABSENT  | aucune table ; `nom_commercial` ponctuel (`pappers/models.py:73`)                                                                                                       |
| 51b | 8   | Hiérarchie groupe/filiales, jamais fusionnée        | PARTIEL | `account_entities` + `sites` existent mais **à plat** : aucun `parent_entity_id` (`org-mapping-plan.md:74`)                                                             |
| 51c | 8   | Agences régionales rattachées et distinctes         | TOME 4  | c'est le référentiel ESN                                                                                                                                                |
| 51d | 8   | Lien `succède_à` avec date                          | ABSENT  | aucune occurrence, même pas en refus                                                                                                                                    |
| 51e | 8   | Établissement ≠ entreprise                          | LIVRÉ   | `sites` (`site.entity.ts:13-54`) porte les implantations, `accounts` l'entreprise                                                                                       |
| 51f | 8   | Homonymes par NAF + département + effectif          | PARTIEL | `homonym_disambiguation.py:240-292` pondère nom/effectif/NAF ; **le département n'entre pas dans le score**                                                             |
| 51g | 8   | Entité étrangère marquée, jamais supprimée          | LIVRÉ   | `entity_identity.py:124-137` (`sirenStatus`/`sirenReason`)                                                                                                              |
| 52  | 8   | Le cas SII comme test de référence                  | TOME 4  | —                                                                                                                                                                       |
| 53  | 8   | Fusion auto ≤ clé 2, proposition au-delà            | PARTIEL | vrai pour les contacts, inexistant pour les comptes                                                                                                                     |
| 54  | 9   | Domaine `unverified`, jamais affiché comme officiel | ABSENT  | aucun statut de domaine (`account.entity.ts:38` = texte simple) ; le besoin naît avec le référentiel ESN → tome 4                                                       |
| 55  | 9   | Deux files : mutualisée / imputée                   | PARTIEL | cf. item 33                                                                                                                                                             |
| 56  | 9   | Calendrier de la file mutualisée                    | TOME 4  | son objet est le référentiel ESN et le territoire                                                                                                                       |
| 57  | 9   | Poste de coût du crawl ESN + mitigations            | TOME 4  | —                                                                                                                                                                       |
| 58  | 9   | Les 6 plafonds                                      | PARTIEL | analyses simultanées = 3 **globales** au worker (`analysis.worker.ts:370`), pas par espace ; throttles par source ✓ ; crawls/domaine/jour ✗ ; les 3 « à définir » = D85 |

### 1.7 Quand une source tombe (p.10, p.15)

| #   | p.  | Exigence                                         | Statut  | Preuve / raison                                                                                                                                      |
| --- | --- | ------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 59  | 10  | 7 comportements, aucun ne bloque le reste        | PARTIEL | échec gracieux par source ✓ (`source_health.py`, `company_filters.py:34-49` 9 raisons) ; pas de registre déclaratif                                  |
| 85  | 15  | Les 7 comportements avec leur CODE               | PARTIEL | 5 codes connecteurs (`connector-error.ts:36-42`) : `deprecated`, `stale`, `conflict` n'existent pas                                                  |
| 86  | 15  | Réponse vide QUALIFIÉE (« j'ai cherché dans N ») | PARTIEL | `connectorSearchResult` (`connector-error.ts:104-131`) côté connecteurs ; les sources de collecte de l'IA ne comptent rien                           |
| 60  | 10  | Contradiction : les deux valeurs, datées         | ABSENT  | `decideFieldWrite` (`provenance.ts:123`) écrase à autorité **égale** sans trace ; refus documenté du 9ᵉ indicateur (`data-hygiene.service.ts:17-20`) |
| 87  | 15  | `value_a` / `value_b` / `conflict_since`         | ABSENT  | idem → lot 4                                                                                                                                         |

### 1.8 Les fiches sources (p.10-13) — informatif

| #   | p.  | Point de la fiche                                   | Statut  | Note                                                      |
| --- | --- | --------------------------------------------------- | ------- | --------------------------------------------------------- |
| 61  | 10  | France Travail = la source la plus critique         | LIVRÉ   | `france_travail.py:300-556`                               |
| 62  | 10  | Le piège du cabinet de recrutement (NAF 78.10Z/30Z) | ABSENT  | seul un filtre par NOM existe (`apec.py:131-156`) → lot 2 |
| 63  | 11  | APEC, intitulés plus normalisés                     | LIVRÉ   | —                                                         |
| 64  | 11  | WTTJ                                                | LIVRÉ   | no-op                                                     |
| 65  | 11  | Greenhouse/Lever + `ats_detected`                   | ABSENT  | lot 1                                                     |
| 66  | 11  | BOAMP : allotissement + AO de référencement         | DIFFÉRÉ | cf. item 8                                                |
| 67  | 11  | DECP : qui, combien de temps, quand ça se rouvre    | PARTIEL | lot 0                                                     |
| 68  | 11  | TED                                                 | DIFFÉRÉ | cf. item 26                                               |
| 69  | 11  | Recherche d'entreprises — bloquant si elle tombe    | LIVRÉ   | `recherche_entreprises.py`                                |
| 70  | 12  | INSEE inter-millésimes (tendance d'effectif)        | ABSENT  | aucun consommateur aujourd'hui                            |
| 71  | 12  | INPI hiérarchie groupe/filiale                      | TOME 4  | —                                                         |
| 72  | 12  | Pappers CA → capacité à sous-traiter                | TOME 4  | —                                                         |
| 73  | 12  | BODACC drapeau de risque partenaire                 | TOME 4  | —                                                         |
| 74  | 12  | GitHub stack réelle vs revendiquée                  | TOME 4  | —                                                         |
| 75  | 12  | tech_detect                                         | LIVRÉ   | —                                                         |
| 76  | 12  | Firecrawl, premier poste variable                   | LIVRÉ   | mesuré au registre (`provider_costs`, feature `analysis`) |
| 77  | 12  | Brave/Serper/Tavily : communiqués, nominations      | ABSENT  | cf. item 17                                               |
| 78  | 13  | Apollo : 1 crédit si trouvé, jamais de nom exposé   | LIVRÉ   | `output_hygiene.py:39-43`, `contacts.service.ts:1602`     |

### 1.9 Coût, niveaux illustrés, gardes, KPI (p.13-18)

| #   | p.  | Exigence                                             | Statut   | Preuve / raison                                                                                                        |
| --- | --- | ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| 79  | 13  | Coût par geste et imputation                         | PARTIEL  | `provider_costs` câblé sur 4 fonctionnalités (`1788500000000-ProviderCosts.ts`) ; aucune notion « mutualisé / imputé » |
| 80  | 13  | 7 mitigations du crawl                               | TOME 4   | la mitigation 5 (ATS détecté ⇒ API au lieu du crawl) est préparée par le lot 1                                         |
| 81  | 13  | Les 6 plafonds, dont 3 à chiffrer                    | DÉCISION | D85                                                                                                                    |
| 82  | 14  | Le même compte, 5 niveaux (exemple SEB)              | PARTIEL  | cf. item 39                                                                                                            |
| 83  | 14  | Niveau 3 (règle explicite) vs 4 (saut)               | PARTIEL  | le badge « déduit » existe, la RÈGLE appliquée n'est affichée que dans l'organigramme                                  |
| 84  | 14  | Le format canonique appliqué                         | PARTIEL  | cf. item 40                                                                                                            |
| 97  | 17  | GD-01 portée absente ⇒ 503 nommé                     | LIVRÉ    | GA-10 `qualified-empty-lists.spec.ts`                                                                                  |
| 98  | 17  | GD-02 toute valeur porte source et date              | PARTIEL  | 4 structures coexistent, aucune garde globale                                                                          |
| 99  | 17  | GD-03 aucune donnée expirée présentée comme actuelle | PARTIEL  | vrai pour les faits d'accès et les signaux ; rien ailleurs                                                             |
| 100 | 17  | GD-04 aucun nom de fournisseur                       | LIVRÉ    | `output_hygiene.py`, `no-vendor-names.test.ts`, `enum-keys.test.ts:113`                                                |
| 101 | 17  | GD-05 aucun pourcentage de probabilité               | PARTIEL  | refus structurel ✓, aucune garde qui lit un texte de sortie → lot 6                                                    |
| 102 | 17  | GD-06 identité du contributeur jamais exposée        | ABSENT   | sans objet tant que le communautaire n'existe pas — lot 9                                                              |
| 103 | 17  | GD-07 seuil de 3 espaces respecté                    | ABSENT   | lot 9                                                                                                                  |
| 104 | 17  | GD-08 chaque source déclare son comportement         | ABSENT   | lot 3                                                                                                                  |
| 105 | 18  | Les 8 KPI de la donnée                               | PARTIEL  | `pilotage/hygiene` en porte 8 autres ; aucun sur SIREN résolus / domaines vérifiés / source+date                       |
| 106 | 18  | D51 — cadre communautaire                            | DÉCISION | tranché le 22/08 sur le FOND ; la revue CGU conditionne le merge                                                       |
| 107 | 18  | D85 — les 3 plafonds à chiffrer                      | DÉCISION | exige le coût unitaire réel                                                                                            |
| 108 | 18  | D86 — crawl général ou opt-in par domaine            | DÉCISION | tranché le 22/08 (tome 8) : **général encadré**                                                                        |

---

## 2. Lots d'implémentation

- **Lot 0 — L'échéance d'un marché public** (items 9, 67, 74 du tome 1) — dépend de : rien.
  `dureemois` lu dans les DEUX chemins DECP, `endsOn` calculé, garde sur les dates
  invraisemblables, `lockFactFromAwards` rend `verrouille` avec sa date de réouverture,
  l'onglet Accès l'affiche, `CLAUDE.md` corrigé.
- **Lot 1 — Greenhouse et Lever** (21, 22, 65, ticket `BEL-SRC-001`) — dépend de : rien.
  Contrats vérifiés en direct ; fusion ADDITIVE dédupliquée par URL avec France Travail
  et APEC ; un board inconnu (404) est une non-détection, jamais une erreur.
- **Lot 2 — Le filtre cabinet de recrutement** (62, ticket `BEL-SRC-002`) — dépend de : rien.
  Une offre publiée par un cabinet est CONSERVÉE et marquée `intermediated`, jamais
  supprimée, et sort des agrégats par employeur.
- **Lot 3 — Les 7 comportements de panne + la réponse vide qualifiée** (59, 85, 86, 104) —
  dépend de : rien. Registre déclaratif des sources (niveau N1-N5, comportement de panne),
  garde GD-08, comptage `scanned` sur les recherches de Découvrir.
- **Lot 4 — La contradiction entre deux sources** (60, 87, 98) — dépend de : rien.
  À autorité ÉGALE et valeurs différentes, les deux sont conservées et datées ; une
  correction humaine tranche.
- **Lot 5 — Périmé ⇒ inconnu, hors faits d'accès** (42, 94, 99) — dépend de : rien.
- **Lot 6 — GD-05, la garde qui lit** (41, 101) — dépend de : rien.
- **Lot 7 — La doctrine écrite** (1, 3, 32) — dépend de : rien. `CLAUDE.md` + `agent_docs/pipeline.md`.
- **Lot 8 — La contribution en un clic, LOCALE** (29, 48, 49, 88, 89) — dépend de : rien.
  Les 5 moments, la mémoire des questions posées, une seule par session. Utile seule,
  sans aucun partage entre espaces.
- **Lot 9 — Le communautaire** (30, 46, 47, 90, 91, 92, 102, 103) — dépend de : **D51 et de
  la revue CGU de Louis**.

Hors périmètre, renvoyé au **tome 4** avec sa raison : tout ce qui exploite le
référentiel ESN (items 5, 6, 10-15, 18, 19, 24, 25, 37, 51c, 52, 54, 56, 57, 71-74, 80).

## 3. Décisions demandées à Louis — tranchées le 22/08

| #        | Question                                            | Reco                        | Réponse                                                                                                                                            |
| -------- | --------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T2-A** | Ce qu'on affiche maintenant qu'on a l'échéance DECP | `verrouille` + date         | **Verrouillé jusqu'au \<date\>**, avec la fenêtre de renouvellement. Marché échu ou durée illisible ⇒ on reste à `semi_ouvert`, jamais d'invention |
| **T2-B** | D51 — le communautaire, et la revue CGU             | contribution locale d'abord | **Tout livrer, les CGU sont faites** — opt-in, seuil de 3 espaces confirmants, réciprocité, anonymat de la contribution                            |
| **T2-C** | Comment détecter un cabinet de recrutement          | NAF via le registre         | **NAF résolu via recherche-entreprises** (78.10Z / 78.30Z), avec cache ; repli sur une liste de noms quand aucun SIREN n'est publié                |
| **T2-D** | Le périmètre : les sujets ESN du tome               | renvoyer au tome 4          | **Renvoyés au tome 4** — on livre la collecte générique et les 4 tickets ; ce qui exploite le référentiel ESN attend son consommateur              |

⚠️ **Collision d'identifiants de décision** : `D51` désigne le cadre communautaire
dans les tomes 1-2 (ORION) et « exclure un contact » dans la dette des PDF 1-6
(`agent_docs/dette-pdf1-6-2026-08-21.md:127`, livrée le 21/08). Les deux sont en
production sous ce numéro ; on ne renomme rien — même arbitrage que pour la
numérotation des gardes du PDF 9.

## 4. Ce qu'on ne promet pas

- **L'allotissement BOAMP** (items 8, 66) : les avis récents sont en eForms UBL
  imbriqué et les anciens en schéma Boamp_v230 — deux parseurs à écrire pour une
  information dont le consommateur (« quel lot est à ma taille ») est le scoring du
  tome 3.
- **TED, AWS/PLACE** (26, 27, 68) : priorités moyenne et basse annoncées par le tome
  lui-même, aucun écran ne les demande.
- **La tendance d'effectif inter-millésimes INSEE** (70) : aucun consommateur.
- **Le lien `succède_à`** (51d) et **la table d'alias** (51a) : leur consommateur est
  la résolution du référentiel ESN, `BEL-DATA-001` (tome 4).
- **Le domaine `unverified`** (54) : même raison — le besoin naît du fichier des 477
  ESN dont 93 % des domaines sont devinés.
- **Les 3 plafonds « à définir »** (81, D85) : exigent un coût unitaire réel que le
  tome n'a pas et que le registre `provider_costs` ne mesure pas encore par unité.
- **La contradiction entre deux sources** (items 60, 87) : la représenter exige
  une IDENTITÉ de source, et `field_provenance` ne porte que la CATÉGORIE
  (`human` | `connector` | `pipeline` | `model`). À rang égal, deux écritures
  différentes sont indiscernables d'une réanalyse qui met à jour sa propre
  valeur — flaguer l'une flaguerait l'autre, et un écran de conflits qui
  s'allume à chaque run est un écran qu'on cesse de lire. Le journal
  `record_field_audit` conserve déjà les deux valeurs avec leur date et leur
  source : ce qui manque est le moyen de dire laquelle CONTREDIT l'autre.
- **« J'ai cherché dans 1 240 offres »** (item 86) : les trois listes de
  Découvrir sont mises en cache PAR LEUR VALEUR DE RETOUR. Y ajouter un
  compteur de volume brut change le contrat de cache des trois fonctions, pour
  une phrase — le compteur de couverture existant (`coverage`, cinq chiffres qui
  ne se recouvrent pas) répond déjà à « qu'est-ce qui n'a pas été regardé ».
- **Les demi-vies du §3.7** (item 42) : elles CONTREDISENT une décision
  postérieure. Le tome donne 45 jours à une offre d'emploi ; D50 du 21/08 a posé
  neuf fenêtres par TYPE de signal, dont 180 jours pour un recrutement, après
  mesure. La décision la plus récente tient.
- **Un pourcentage de probabilité** : 8ᵉ refus de l'arbitrage n°4 — et désormais
  une garde qui LIT les libellés, pas seulement une colonne qui n'existe pas.

## 5. État de livraison

Branche `feat/tome2-donnee-sources`.

| Lot                                                               | Commit    | Mergé | Vérifié en live |
| ----------------------------------------------------------------- | --------- | ----- | --------------- |
| 0 — l'échéance d'un marché public (DECP `dureemois`)              | `1c83836` | —     | à faire         |
| 1 — Greenhouse et Lever (`BEL-SRC-001`)                           | `0ba1d03` | —     | à faire         |
| 2 — le filtre cabinet de recrutement (`BEL-SRC-002`)              | `e855426` | —     | à faire         |
| 8 + 9 — contribution en un clic et communautaire (`BEL-DATA-005`) | `dccd7d7` | —     | à faire         |
| 3 — GD-08, chaque source déclare sa panne                         | ce commit | —     | à faire         |
| 6 — GD-05, la garde qui LIT les libellés                          | ce commit | —     | à faire         |
| 7 — la doctrine écrite (CLAUDE.md + pipeline.md)                  | ce commit | —     | —               |
| 4 — la contradiction entre deux sources                           | refusé    | —     | voir §4         |
| 5 — le decay généralisé                                           | périmé    | —     | voir §4         |

### Ce que le chantier a ajouté au dépôt, et que le tome ne demandait pas

- **Un fait faux corrigé à la racine** : le refus de l'échéance DECP reposait sur
  « `dureeMois` n'est pas publié ». Il l'est, sur les deux jeux, à 100 % de
  couverture sur l'échantillon mesuré. `CLAUDE.md` et le commentaire de
  `lockFactFromAwards` disaient le contraire depuis le 22/08 au matin.
- **Un défaut de persistance** : l'écriture du fait de verrouillage porte
  `ON CONFLICT (account_id, kind, value)`. Tant que la valeur ne changeait
  jamais, la clause suffisait ; le lot 0 la fait changer, et l'ancienne ligne
  restait à côté de la nouvelle avec la même provenance et la même date —
  `bestAccessFact` les départageait dans l'ordre de la base.
- **Une garde d'attribution** : `test_upstream_throttle_coverage` a refusé la
  première version du lot 1 parce que le seau de débit était appliqué avec une
  clé VARIABLE, invisible à son analyse de l'AST. C'est la « clé fantôme »
  qu'elle existe pour empêcher.
- **Le site du compte voyage enfin avec le run** (`website`), du worker jusqu'à
  `ResearchRequest`. Clé omise quand il est inconnu : le wire d'un compte neuf
  est byte-identique.

### La numérotation, encore

⚠️ `D51` désigne **deux décisions différentes** en production : le cadre
communautaire (tomes 1-2, ORION) et « exclure un contact » (dette des PDF 1-6,
livrée le 21/08). On ne renomme rien — même arbitrage que pour les gardes du
PDF 9, dont la numérotation ne correspond pas non plus à celle du dépôt.

## 6. La recette live du 22/08

Faite sur le compte de Louis, API en `33ad08c6`.

**Ce qui est vérifié en production :**

| Ce qu'on a regardé                      | Résultat                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| L'échéance dans un signal d'attribution | ✅ « Titulaire : NEWSOFT IT · Montant 1000000.0 · **En cours jusqu'au 2028-08-13** » · « SCC FRANCE … jusqu'au 2030-08-03 »          |
| Le filtre cabinet                       | ✅ E-QUADRA (NAF **78.30Z**) : offre marquée, détail « le client final n'est pas nommé », et `signals` passé en **non mesuré**       |
| L'onglet Accès après migration          | ✅ `GET /accounts/:id/access` rend `community` et `question` — la migration est passée, les trois requêtes de déclenchement tournent |
| Le réglage de partage                   | ✅ visible dans Réglages › Équipe, décoché par défaut, écrit et relu — après le correctif ci-dessous                                 |
| ZÉRO régression                         | ✅ les dix entrées de navigation rendues une par une, zéro erreur de console                                                         |

**Le défaut trouvé en recette, corrigé (`33ad08c6`).** La carte de partage
invalidait une clé de cache RÉ-ÉCRITE à la main (`['workspace', 'team']`) là où
l'écran Équipe lit `['workspace-team']`. Le serveur enregistrait, l'interrupteur
restait à sa valeur d'avant, et le clic suivant renvoyait la même valeur. Un
réglage qui ne se voit pas est un réglage qu'on croit cassé — et celui-ci décide
de ce qui sort de l'espace. La clé est désormais importée, et un test la compare
à celle du hook.

**Ce que la recette n'a PAS pu couvrir, et pourquoi** — les deux chemins qui ne
s'exercent qu'au cours d'une analyse complète (8 crédits du quota de Louis) :

- le lot 1 (Greenhouse / Lever) : la source n'est appelée que dans la phase 1 ;
- l'écriture du fait « verrouillé jusqu'au … » sur un compte réel : elle se fait
  à la fin d'une analyse. Le CALCUL est vérifié en direct dans les signaux de
  Découvrir, et l'écriture est couverte par les tests.

Et la carte de question (§24) n'apparaît que sur un compte **écarté**, **avec une
mission terminée** ou **avec un message sortant journalisé** ; aucun des 22
comptes de l'espace n'est dans ce cas aujourd'hui. Le mécanisme répond (les trois
requêtes tournent sans erreur), la carte attend son premier déclencheur.

## 7. Ce que l'analyse réelle a trouvé (22/08, FRANCE TELEVISIONS)

Louis a autorisé une analyse (8 crédits) pour exercer les deux chemins qui ne
tournent qu'en phase 1. Elle a coûté 8 crédits + 3 rafraîchissements ciblés, et
elle a rapporté **trois défauts** que rien d'autre n'aurait sortis.

**1. Le marché de CE compte ne se trouvait pas.** Zéro marché attribué remonté,
sur un acheteur qui en porte **701** en IT. Deux millésimes, deux moitiés :
`decp_augmente` porte les NOMS mais presque plus de données récentes (le module
le notait déjà) ; `decp-2022-marches-valides` est vivant mais ne publie que des
SIRET. Chercher par le nom ne trouve rien de récent, chercher par SIREN suppose
de le connaître. Une seconde passe par SIREN a été ajoutée (`1f881c6`).

**2. Le SIREN ne partait pas avec la requête.** Le contrat `researchInputSchema`
porte `siren` depuis toujours ; le corps de `IaClient.research()` ne l'envoyait
PAS — seul `analyzeGraph` le fait. Sur le chemin « Rafraîchir », la phase 1
repartait donc du NOM, et « FRANCE TELEVISIONS » a cinq homonymes au registre :
la désambiguïsation ne tranche pas, et toutes les sources ancrées sur l'identité
légale rendent vide (`abb4d27`).

**3. La passe par SIREN héritait d'un client HTTP FERMÉ.** Elle s'exécutait après
le `finally` de la passe par nom ; httpx levait, le `except` de la source libre
l'avalait comme une panne réseau, et la fonction rendait `[]`. **Aucun test ne
pouvait le voir : ils injectent tous un client**, donc la branche « la fonction
possède le sien » — celle qui tourne en production — n'était jouée nulle part
(`11fd05b`).

**Résultat en production, sur l'onglet Accès :**

> CE QUI VERROUILLE · **Panel fermé** · DECP (commande publique) · 03/08/2026
> marché attribué à NETINO … · **en cours jusqu'au 03/08/2030** · consultation de
> renouvellement à préparer vers le **03/02/2030**

C'est la thèse du tome, réalisée : un « non » devenu un rendez-vous daté. Et le
marché qui décide est bien celui qui tient la porte le plus longtemps, pas le
plus récent.

Le lot 1 (boards ATS) a tourné sans rien trouver : France Télévisions n'a de
board ni Greenhouse ni Lever, ce qui est le cas le plus fréquent et coûte deux 404. Le chemin ne casse rien et ne fabrique rien.
