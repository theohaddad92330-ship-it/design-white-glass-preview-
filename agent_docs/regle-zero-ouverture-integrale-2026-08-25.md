# Règle zéro — tous les fichiers sont ouverts — 25 août 2026

## 0. Ce qui a déclenché ce chantier

Arbitrage de Louis, le 25/08/2026 :

> « Même s'il y a une source ou quoi, il faut quand même tout ouvrir et tout
> analyser. Au pire on voit qu'on l'a déjà fait, et c'est pas grave. Mais tout
> doit être ouvert SANS EXCEPTION. »

Le skill `chantier` autorisait jusque-là à lire un markdown miroir à la place de
son PDF. C'est la bonne pratique **quand le miroir existe** — mais la mesure a
montré que le raccourci s'était étendu là où il n'avait aucun miroir à couvrir.

## 1. La mesure qui justifie la règle

| Mesure                                                     | Chiffre  |
| ---------------------------------------------------------- | -------- |
| Fichiers dans les 11 archives (après extraction récursive) | **653**  |
| PDF distincts par contenu (13 doublons exacts écartés)     | **33**   |
| Pages de PDF au total                                      | **591**  |
| PDF de l'itération 3 ayant un jumeau markdown              | **tous** |

### ⚠️ Correction — l'argument que j'avais donné était FAUX

J'ai d'abord écrit que neuf PDF « n'avaient aucun jumeau markdown » et
n'avaient donc « jamais été lus ». **C'est faux.** Les huit Tomes ont bien un
miroir, nommé `T1.md` à `T8.md`, dans le même dossier
`original_markdown_sources/` que les autres.

L'erreur vient de ma détection : elle appariait par NOM, et
`Tome-7-Architecture-placement-motion.pdf` ne se rapproche pas de `T7.md`. Je
n'ai pas vérifié autrement, et j'ai bâti tout un récit dessus — c'est
exactement la faute `tracker-counts-are-arguments` que ce dépôt documente : un
chiffre non vérifié qui sert d'argument.

**Ce que ça change, et ce que ça ne change pas.** Les six défauts ci-dessous
sont réels, mesurés et corrigés — leur existence ne dépend pas de la présence
d'un miroir. En revanche la conclusion s'inverse, et elle devient PLUS forte :
ces documents **avaient** été lus par leur markdown, et les rouvrir en PDF a
quand même trouvé six défauts dont un juridique et une erreur de 50 % sur le
premier poste de la facture. C'est le meilleur argument possible pour la règle
de Louis — pas le plus faible.

## 2. Ce qui a été trouvé, et livré

| #   | Défaut                                              | Source               | Commit     |
| --- | --------------------------------------------------- | -------------------- | ---------- |
| 1   | Sonnet facturé 3/15 au lieu de 2/10                 | BP unit economics    | `78e79854` |
| 2   | Le coût d'accès pouvait s'agréger entre concurrents | Tome 8 D70 / §54     | `7f8e3dd8` |
| 3   | Deux caches persistés sans buster                   | Tome 7 §22.2         | `b03a36ef` |
| 4   | L'échéance connue n'avançait pas le réexamen        | Tome 1 §11.5 / §17.1 | `b8993c64` |
| 5   | Un opt-out ne fermait qu'une voie sur deux          | Tome 1 U34           | `f40af0d2` |
| 6   | Laura nommait les éditeurs à l'écran                | Recette live         | `a3528421` |
| 7   | Capacité partout, sans exception                    | Arbitrage Louis      | `2f6b2fad` |

### 2.1 Le tarif Anthropic — 50 % d'erreur devenue permanente

`BellumAI_BP_Unit_Economics_v2_2026-08-18.xlsx` (archive 07), jamais ouvert, dit
sur **trois lignes indépendantes** — cockpit, hypothèses, feuille « Sources »
avec sa référence et sa date de vérification — que la hausse à 3 $/15 $ prévue
au 01/09/2026 a été **annulée le 10/08/2026**.

`_compute_cost` facturait 3/15 « en attendant l'échéance ». L'échéance n'existant
plus, la sur-estimation était devenue **permanente sur le premier poste de la
facture**. Elle faussait `GET /metrics/cost`, le registre `provider_costs`,
l'alerte `COST_ALERT_DAILY_USD` — et le prix plancher d'un crédit (0,26 € au
tarif réel), qui est une décision commerciale, pas de la télémétrie.

Le tarif ayant changé deux fois en un mois, il devient surchargeable sans
redéploiement : `ANTHROPIC_PRICE_{OPUS,SONNET,HAIKU}_{IN,OUT}`.

**Repères tarifaires de la même source, à poser en `PROVIDER_UNIT_COST_<NOM>`** :
Brave 5 $/1 000 requêtes · Serper 0,001 $/requête · Firecrawl 0,00099 $/crédit ·
Pappers 0,06 €/jeton · Apollo 0,025 $/crédit · Dropcontact 0,16 €/succès (le
seul non vérifié).
⚠️ Corrigé le 11/10/2026 (décision Louis, #3705) : la valeur de référence Pappers est
**0,022 $ par appel** (défaut de `provider_pricing`, seul réglage — GA-26) ; le repère
« 0,06 €/jeton » ci-dessus est conservé pour l'historique, il ne fait plus foi.

### 2.2 Le coût d'accès entre concurrents — GA-43

Le tome 8 pose la règle **deux fois** (§26 D70 et §54), chaque fois avec le
marqueur « à vérifier AVANT de l'ouvrir » : agréger la commission d'accès entre
espaces est un **échange d'informations tarifaires entre concurrents**.

L'interdit était RESPECTÉ — par un `WHERE f.kind = 'lock'` écrit à la main dans
un seul service, sans qu'aucun texte n'explique pourquoi. Or étendre
l'agrégation aux **modes** d'accès est prévu et légitime : rien n'aurait arrêté
la main qui écrit `IN ('lock','mode','cost')`.

C'est le mécanisme du chemin d'écriture non branché, appliqué à un interdit
juridique — et celui-là ne se rattrape pas, puisque l'information aura circulé.

### 2.3 Les caches — GA-42

Le tome 7 §22.2 : « un état de panne mis en cache survit à sa réparation ». Le
dépôt l'a payé deux fois, sur ses deux étages, corrigés à deux dates.

La garde a trouvé un **troisième cas que la relecture n'avait pas vu** :
`accounts` et `drafts` écrivent sans buster, et n'ont **aucun appelant** — ce qui
explique que personne ne l'ait remarqué. Le danger n'était pas qu'ils dorment,
c'était le jour où quelqu'un les brancherait.

**Vérifié en production** : les clés de `query_snapshots` portent bien
`26.08.25-ts…+git2af984bb9e`, deux versions cohabitent sans se mélanger, et
`accounts`/`drafts` sont à 0 ligne — la mesure statique et la production
concordent.

### 2.4 Les deux moitiés qui ne se parlaient pas — tome 1

Le tome écrit la cadence de péremption d'un refus ainsi : « déjà un prestataire →
**à l'échéance du contrat si connue**, sinon 12 mois ». Le code appliquait 12
mois dans tous les cas — alors que le dépôt CONNAÎT cette échéance depuis le
23/08 (`access_facts.reopens_on`, `referencingWindowAlert` à T-9/T-6/T-3).

Sur un compte écarté pour titulaire en place dont le marché finit dans quatre
mois, l'alerte disait « prépare tes preuves » pendant que la porte de priorité
gardait le compte écarté douze mois — **huit mois après le seul moment où le
panel s'ouvre**.

Et un compte écarté se rouvre par DEUX voies. Seule la voie du TEMPS gardait
« ne plus me contacter » ; la voie du SIGNAL ne filtrait rien.

### 2.5 Les noms d'éditeur — GA-44

Trouvé en **recette live**, pas en test. Le bandeau en tête de chaque
conversation avec Laura affichait « HubSpot · Connecté », « Google Workspace ·
Connecté », « Slack · Non connecté » — l'endroit exact que l'arbitrage du 02/08
cite en premier.

Deux gardes existaient, chacune sur une moitié : le PROMPT
(`test_copilote_prompt_blocks.py`) et le DIGEST
(`tool-capability-digest.spec.ts`). **Aucune ne regardait l'écran.** Ce qui était
gardé est ce que le modèle DIT, pas ce que l'utilisateur VOIT.

Louis a tranché « capacité partout, sans exception » ; les huit occurrences
restantes sont corrigées et GA-44 n'en tolère plus aucune.

## 3. État d'ouverture des 33 PDF distincts

| État                  | Nombre | Pages |
| --------------------- | ------ | ----- |
| Ouverts intégralement | 22     | 358   |
| Restant à ouvrir      | 11     | 233   |

⚠️ **Les huit Tomes sont désormais tous ouverts en PDF**, en plus de leur
miroir markdown qui l'était déjà.

**Ouverts** : PDF-10 Laura (20), Addendum Stelya (23), Présentation plateforme
(21), mémoire ancien GPT (46), Devis Keyrus (1), les 5 PDF du recovery juin
(13), Tome 7 (25), Tome 8 (17), Tome 3 (20), Tome 1 (23), Tome 2 (18), Tome 4
(19), Tome 5 (25), Tome 6 (27), PDF-1 (17), PDF-2 (18), PDF-3 (13), PDF-4 (12).

**Restant** : PDF-1 ×2 versions (34), PDF-2 ×2 (36),
PDF-3 (13), PDF-4 (12), PDF-5 (13), PDF-6 (10), PDF-7 (11), PDF-8 (10), PDF-9
(10), Annexe méthodologie (31), Annexe organigramme (32), Restitution V2 (32),
TF1 (49).

Tous les fichiers de DONNÉES sont mesurés : 198 CSV, 42 txt, 36 JSON, 11 JSONL,
5 XLSX, 2 SQLite, 2 DOCX, 1 `.example` — lignes, colonnes, tables, cardinalités.

## 4. Ce qui est constaté et NON livré

| Constat                                                                                                                         | Statut                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Le deck produit montre l'ancienne navigation et annonce Salesforce / Pipedrive / Microsoft « bientôt » alors qu'ils sont livrés | Commercial, hors dépôt                  |
| Le devis Keyrus facture 119 € **TTC** (99,17 € HT) là où la grille vend 119 € **HT**                                            | Commercial, à dire à Louis              |
| L'écran unique « Ce que Laura retient » (tome 4 §18.5, tome 6 §12)                                                              | **Confort, pas conformité** — voir §4.1 |
| Les 1 183 appels d'offres Luxembourg de `dataforge_v10.sqlite` ne sont exploités par rien                                       | Ouvert, LU est en beta                  |
| `BEL-DOM-1016` — `reuse_scope` sur les retours bêta : le seul des onze invariants de la doctrine sans porteur                   | **Ouvert**, déjà connu                  |

### 4.1 Correction — la mémoire de Laura n'est PAS une boîte noire

Les tomes 4 et 6 demandent tous deux un écran `/settings/memoire`, et le tome 6
le justifie par « une mémoire invisible est une mémoire dangereuse ». J'avais
noté que `accounts.relationship_memory` « s'accumule sans écran ni effacement,
obligation RGPD de fait ». **C'est faux sur les trois points**, vérifié :

| Couche                         | Écrite par                                    | Visible                     | Effaçable                      |
| ------------------------------ | --------------------------------------------- | --------------------------- | ------------------------------ |
| `memory_pinned_facts`          | l'utilisateur (« Sauvegarder cette réponse ») | carte Mémoire du rail droit | `DELETE /memory/facts/:id`     |
| `accounts.relationship_memory` | l'utilisateur (`PATCH`, `records:write`)      | onglet Aperçu du compte     | tous les champs sont `nullish` |

`analysis.service.ts` **LIT** la mémoire de relation, il ne l'écrit pas — son
propre commentaire le dit : « ce que le commercial a SAISI sur ce compte, relu
au run suivant ». Rien ne s'accumule dans le dos de l'utilisateur.

Les deux droits qui fondent l'obligation sont donc satisfaits : **accès** (les
deux couches sont affichées) et **effacement** (les deux sont supprimables).
L'écran unique reste souhaitable — rassembler ce qui est épars, et offrir un
« tout oublier » — mais c'est du CONFORT, pas une mise en conformité. La
distinction change ce qu'il faut faire, et avec quelle urgence.

## 5. Ce qu'on ne promet pas

- **Renommer les composants qui portent un nom d'éditeur dans leur identifiant**
  (`ApolloFirmographicsCard`) : GA-44 mesure ce qui est AFFICHÉ. Exiger le
  renommage noierait les vraies violations sous des changements sans effet pour
  l'utilisateur.
- **Une garde sur les noms d'éditeur venus du serveur** : GA-44 ferme le chemin
  du littéral écrit dans un composant ou dans l'i18n. Un nom qui arriverait dans
  une chaîne de données lui échappe, et elle le dit.
- **L'onglet Territoire sous Comptes** (tome 4 §17) : l'écran EXISTE, sous
  `/discover/territoire`. C'est un placement différent, pas un manque.

## 6. Trace

- Skill : `.claude/skills/chantier/references/epuisement.md` §0 et `SKILL.md`
  ligne 49 — la règle zéro, avec ce que « ouvrir » veut dire par type de fichier
  et la preuve comptable à produire.
- `CLAUDE.md` : le tarif Anthropic et le cinquième principe communautaire.
