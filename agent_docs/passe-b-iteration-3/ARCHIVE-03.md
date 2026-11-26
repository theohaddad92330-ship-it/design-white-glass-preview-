### Passe B — archive 03 IA / LAURA / ACTION OS / OBSERVABILITÉ

**Source** : `agent_docs/sources/BELLUMAI_ITERATION_3_03/03_AI_LAURA_COPILOT_ACTION_OS_AUTOMATIONS_OBSERVABILITY/`
**Tracker contredit** : `agent_docs/archive-03-ia-laura-observabilite-2026-08-25.md` (243 l.)
**Mode** : lecture seule. Aucun code, aucune correction, aucun git.

---

**Fichiers ouverts : 25 / 25**

25 fichiers sur disque, 23 au manifeste (les deux manifestes ne s'y listent pas eux-mêmes).

**Porteurs (6)** — `original_markdown_sources/pdf6.md` (468 l.) · `original_markdown_sources/T6.md`
(1 441 l.) · `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md` (35 l.) · `README.md` (22 l.) ·
`langfuse_evidence/tracing.png` · `langfuse_evidence/sessions.png`.

**Non porteurs, avec leur raison (19)**

| Fichier(s)                                     | Pourquoi non porteur                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_pdfs/Tome-6-…pdf` (1 977 l. extraites) | Extrait à `pdftotext -layout` et diffé : **identique à `T6.md`**, tables comprises.                                                                                                                                                                                                                                                      |
| `source_pdfs/PDF-10-…pdf` (1 494 l.)           | Identique aux **§1-9 de `T6.md`** — le tome EMBARQUE le PDF 10 verbatim (`T6.md:33`). ⚠️ **PDF 10 n'a AUCUN fichier dans `original_markdown_sources/`** : il n'est lisible que par le PDF, ou par son inclusion dans T6. Un agent qui applique « markdown plutôt que PDF » sans vérifier ce fichier-là croit avoir lu 2 documents sur 3. |
| `source_pdfs/PDF-6-…pdf` (719 l.)              | Identique à `pdf6.md`.                                                                                                                                                                                                                                                                                                                   |
| `MANIFEST_SHA256.md` + `.csv`                  | Intégrité. 23/23 recalculés, tous intègres.                                                                                                                                                                                                                                                                                              |
| `repo_mirrors/` — 9 fichiers                   | **Octet pour octet identiques au dépôt** (SHA-256 recalculé) : `agent-contract.md`, `agents.md`, `eval-gate.md`, `ia-quality-activation.md`, `knowledge-architecture.md`, `profiler-memory.md`, `rag.md`, `vision-copilote-actions.md`, `agent-contract.fixtures.json`. Aucune demande neuve.                                            |
| `repo_mirrors/` — 4 fichiers                   | Divergent parce que **le dépôt a évolué depuis le 24/08**, pas l'inverse : `pdf10-laura-chatbot` (48 l.), `tomes6-8-laura-architecture-execution` (51 l.), `pdf6-automatisations-requetes` (14 l.), `strategy-token-eval` (13 l.). Le miroir est l'**ancienne** version.                                                                 |

⚠️ Le README (`README.md:6-10`) déclare « **Contrats agents/evals du repo** » comme l'une des
**4 sources canoniques** du paquet. Le tracker les range en une ligne comme « miroirs de trackers
et de docs du dépôt » (`archive-03…md:16`). Statut de source canonique ≠ statut de miroir ; l'écart
est bénin ici (ils sont identiques au dépôt) mais il est ce qui a autorisé à ne pas les lire.

---

#### Le dénombrement reconstruit

Reconstruit depuis la matière brute, jamais depuis le tracker.

**A. `pdf6.md` — 20 énumérations, 468 lignes**

| #   | Énumération                         | Compte SOURCE                                                                                           | Ligne           |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | Périmètre du PDF                    | 6                                                                                                       | `pdf6.md:11-16` |
| 2   | Attributs d'une automatisation      | **12** (« une automatisation qui n'en renseigne pas 12 n'est pas spécifiée »)                           | `:26-37`        |
| 3   | Niveaux d'autonomie                 | 6 (N0→N5), 2 colonnes                                                                                   | `:47-52`        |
| 4   | **Garde-fous N5 non désactivables** | **6**                                                                                                   | `:56-61`        |
| 5   | **Familles toujours sensibles**     | **7**                                                                                                   | `:65`           |
| 6   | Catalogue d'automatisations         | A 10 · B 10 · C 10 · D 10 · **E 14 annoncés / 24 nommés** · F 10 · G 6                                  | `:74-162`       |
| 7   | Workflows de brouillons             | **10**, × 8 colonnes (destinataire, canal, données, personnalisation, validation, après-envoi, relance) | `:172-183`      |
| 8   | Règles communes aux 10              | 7                                                                                                       | `:187-193`      |
| 9   | Aspects Gmail/Outlook vs Teams      | 7 + 3 libellés de bouton                                                                                | `:199-209`      |
| 10  | Chaînes ordonnées                   | **7** (142 étapes, portes G1→G8)                                                                        | `:221-227`      |
| 11  | Objets du modèle de chaînes         | 4                                                                                                       | `:233-236`      |
| 12  | Compteur de proactivité             | 5 points + **2 exclusions du plafond**                                                                  | `:263-271`      |
| 13  | Sécurité transverse                 | **8 règles**                                                                                            | `:279-286`      |
| 14  | Familles de requêtes                | 7 familles, **285** = 227 (cerveau A) + 58 (B)                                                          | `:298-305`      |
| 15  | Requêtes prioritaires               | **20**, avec outil + preuve attendue                                                                    | `:313-332`      |
| 16  | Protocole de recette                | 8 champs                                                                                                | `:337`          |
| 17  | Verdicts                            | **4** (PASS / FAIL / PARTIAL / BLOCKED)                                                                 | `:340-343`      |
| 18  | Routeur d'intentions                | 5 étapes + 2 règles                                                                                     | `:351-359`      |
| 19  | Tickets                             | **5** (`BEL-AUT-501`→`505`), chacun avec critères + tests + priorité + dépendances                      | `:365-452`      |
| 20  | Questions à trancher                | 5 (`D3`, `D8`, `D31`, `D32`, `D33`)                                                                     | `:460-464`      |

**B. `T6.md` §1-9 (= PDF 10) — 24 énumérations, 1 101 lignes**

14 défauts · 14 fichiers inventoriés + 4 paramètres · 6 intouchables · 5 situations de tutoiement ·
9 éléments de widget · **9 types de page × délai** + **7 règles anti-agacement** · 5 temps ·
**8 axes / « 30 » points** + 4 paliers + 3 conditions cumulées · **70 questions** en 8 groupes ·
**22 objections** · 4 situations RDV · 5 situations prix · 5 cas multi-message · 12 interdits ·
**10 métriques Site** · 8 causes de churn · 3 couches de mémoire · **9 règles de budget
d'interruption** · **30 interventions** (8+7+8+7) · 5 formats + 4 « jamais » · **7 axes de santé
pondérés** + 4 paliers · 5 outils propres · **8 métriques Produit** · **7 tickets**
(`BEL-LAU-901`→`907`) · **20 conversations golden** · **8 gardes `GL-01`→`GL-08`** ·
6 contrôles de recette manuelle · **8 décisions `D43`→`D50`**.

**C. `T6.md` §11-16 — 11 énumérations, 337 lignes** (les « jamais inventoriées » du tracker)

**12 surfaces** (`:1121-1134`) · **table des contraintes de 8 surfaces** (`:1138-1148`) ·
**6 couches de mémoire** (`:1155-1162`) · **8 éléments de la couche 5** + **règle de transparence**
(`:1168-1179`) · **6 non-mémorisables** (`:1183`) · **5 conditions d'intervention** (`:1195-1201`) ·
**budget adaptatif, 5 lignes** (`:1209-1215`) · **3 moments d'or** (`:1223-1227`) ·
**40 interventions** (8+7+6+7+7+5, `:1235-1303`) · prompt unifié + **5 niveaux de vérité** +
**8 blocs de surface** (`:1311-1409`) · **14 outils** + **6 contraintes d'outil** (`:1419-1438`).

**D. `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md`** — **16 métadonnées** (recomptées à la puce :
`:5-18`) et **8 garde-fous** (`:22-30`), dont le dernier porte **5 alertes** distinctes
(coût · latence · erreur · **hallucination** · **no-outcome**).

**E. `README.md`** — 4 sources canoniques, 4 résolutions, 3 « instructions Claude Code »
(`:16-19`), 1 renvoi (`:21`).

---

#### Ce que le tracker ne mentionne NULLE PART

> Un « faux trou » écarté d'avance : le tracker renvoie implicitement à deux trackers frères du
> dépôt (`pdf6-automatisations-requetes-2026-08-21.md`, 626 l. ; `pdf10-laura-chatbot-2026-08-22.md`,
> 334 l.). Chaque ligne ci-dessous a été cherchée **dans les trois** avant d'être écrite.

| #      | Ce que la source demande                                                                                                                                                                                                                                                                                                                                                   | Où                         | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Les 14 outils de Laura** : `get_account_access`, `get_access_path`, `declare_access_fact`, `get_territory_overview`, `search_territory_accounts`, `search_territory_esn`, `search_partners`, `get_partner`, `get_partner_overflow`, `get_esn_on_account`, `create_partner_opportunity`, `search_dormant_network`, `find_intro_path`, `get_job_changes`                   | `T6.md:1419-1434`          | Le tracker écrit « **14 / 14 PRÉSENTS** dans `chat_tools.py` (le catalogue en compte 31) » (`archive-03…md:62`) et en fait le pilier de son récit (« le chapitre le plus concret est entièrement livré », `:64`). **Mesuré : 0 / 14.** `apps/ia/app/services/chat_tools.py` déclare **36** outils ; aucun des 14 n'y figure, et **aucun fichier du dépôt ne contient ces 13 identifiants** (`create_partner_opportunity`, `find_intro_path`, … → aucun fichier ; grep-témoin sur `get_workspace_health` positif, donc pas un faux zéro). Ce qui existe est la **capacité** derrière ~10 d'entre eux (`packages/contracts/src/schemas/overflow-score.ts`, `territory.ts`, `apps/api/src/modules/esn-directory/territory.controller.ts`, `access_barrier` — tomes 1 et 4) : des **routes REST**, jamais un outil que Laura puisse appeler. C'est « A EST B dispense de lire » — le défaut que le tracker dénonce lui-même à son §2, rejoué à son §3. |
| **2**  | **Les 6 contraintes d'outil du §16.2** : appelle l'API Nest jamais la base · filtre par `workspace_id` **avec test d'isolation** · respecte les permissions **y compris dans la réponse** · aucune écriture directe, **Action OS pour tout N2+** · déclare ses capacités de connecteur et **nomme** celle qui manque · **journalise outil, paramètres, latence, résultat** | `T6.md:1438`               | Aucun tracker ne les mentionne. La dernière est une exigence d'**observabilité** qui recoupe mot pour mot « outils appelés » et « coût/tokens/latence » du fichier Langfuse du **même paquet** — et le tracker traite les deux chapitres à 40 lignes d'écart sans les relier. La 4ᵉ est la seule qui gouverne `create_partner_opportunity` (N2) : déclarer « 14/14 présents » sans elle laisserait un outil d'écriture hors de la porte.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **3**  | **La table des contraintes de surface** : 8 surfaces × 3 colonnes — longueur max (`⌘K` = 1 résultat, bloc = 3 lignes, survol = 5 lignes, carte = 2 lignes + 1 bouton), **peut poser une question** (oui pour le panneau et la saisie, non pour les 6 autres), **peut agir** (`⌘K` : N1 seulement ; survol : jamais)                                                        | `T6.md:1138-1148`          | Le tracker ne retient du §11 que le **compte** (« 12 surfaces », `:56`). C'est exactement « le tracker jette la 3ᵉ colonne » : la loi est reprise, les bornes qui la rendent implémentable sont jetées. Ce sont elles qui empêchent une carte de devenir un formulaire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **4**  | **La règle de transparence de la couche 5** : « l'utilisateur **voit** cette mémoire, **en clair**, dans un **écran dédié**, et peut en **supprimer n'importe quelle ligne**. Une mémoire invisible est une mémoire dangereuse. » + les 8 choses qu'elle retient                                                                                                           | `T6.md:1168-1179`          | Le tracker refuse la couche 5 (`:148`) au motif que « la rétention et la base légale se décident avant de s'écrire ». **La source répond à cette objection exactement — et le tracker ne cite pas la réponse.** Un refus qui ignore l'argument adverse n'est pas un arbitrage, c'est un oubli habillé. Vérifié : aucun écran de mémoire dans `apps/web/src/routes` (36 routes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **5**  | **Ce que Laura ne mémorise JAMAIS** (6) : le contenu des messages · les données d'un autre espace · celles d'un collègue hors périmètre · une information supprimée par l'utilisateur · **un secret partagé par erreur — « elle prévient et n'y revient pas »**                                                                                                            | `T6.md:1183`               | Absent des trois trackers. Cinq des six recoupent de la doctrine déjà tenue (D65, isolation d'espace) — **la sixième est neuve et n'a aucun équivalent** : aucun comportement du dépôt ne décrit ce que Laura fait quand un utilisateur lui colle un secret. Un garde-fou perdu se re-débat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **6**  | **Les 3 moments d'or où le plafond NE S'APPLIQUE PAS** : retour d'absence > 5 jours · fin d'une action longue attendue · blocage réel qu'il ne voit pas                                                                                                                                                                                                                    | `T6.md:1223-1227`          | Le tracker nomme « moments d'or » dans l'**intitulé** de sa ligne §13 (`:59`) puis ne mesure que l'écart 7 j / 30 j, et ne les inscrit pas au §7 « ce qu'on ne promet pas ». **Mesuré : aucun contournement de plafond dans `packages/contracts/src/schemas/interruption-budget.ts`** (recherche `moment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | absence | blocage | bypass | exception`→ 0). Or`canInterrupt` est la porte unique : sans exception, un utilisateur qui revient de deux semaines reçoit **une** intervention, pas son rattrapage — l'inverse de l'intention. |
| **7**  | **Les 2 lignes de budget adaptatif jamais implémentées** : « 3 interventions, **1 acceptée** → plafond **2** » et « utilisateur qui interroge Laura spontanément **> 5 fois/jour → 4** » (une **hausse**)                                                                                                                                                                  | `T6.md:1211,1215`          | Le tracker écrit « budget adaptatif » sans valeur. Mesuré : le dépôt implémente la **binaire** (`IGNORED_BEFORE_THROTTLE = 2` → `THROTTLED_CAP = 1`, `THROTTLE_DAYS = 7`, `CLOSED_BEFORE_RETREAT = 3`, `RETREAT_DAYS = 7`, `MIN_GAP_MINUTES = 20`) — le **palier intermédiaire à 2 n'existe pas**, et **rien ne fait jamais MONTER le plafond**. Le budget « suit le comportement » dans un seul sens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **8**  | **Les 5 niveaux de vérité** — FAIT · OBSERVATION · INFÉRENCE · HYPOTHÈSE · **SPÉCULATION = interdit, aucune probabilité en pourcentage** — et la structure imposée : « ce qui est vrai · d'où ça vient · ce que j'en déduis · **ce que je ne sais pas** »                                                                                                                  | `T6.md:1350-1359`, `:1394` | Le tracker classe tout le §15 « **106 lignes de prose, aucun tableau** → **NON MESURÉ** » (`:61`). C'est faux deux fois : le §15 porte cette échelle **numérotée** et les **8 blocs de surface** (`:1400-1408`), tous deux énumérables et testables. Et il jette au passage le seul endroit de l'archive où la doctrine `c26_probabilite` est formulée comme une **règle de sortie de modèle**. Déclarer « pas de tableau » est le prétexte qui a permis de ne pas lire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **9**  | **Les 5 alertes** exigées de l'observabilité : coût · latence · erreur · **hallucination** · **no-outcome**                                                                                                                                                                                                                                                                | `LANGFUSE…md:30`           | Une seule puce, cinq exigences. Le tracker compte « 8 garde-fous » et n'en instruit qu'un (dev/staging/prod). Aucune alerte n'est mentionnée nulle part — et **« no-outcome » est la traduction opérationnelle de la résolution que le tracker déclare TENUE** (« une sortie de modèle ne prouve jamais un outcome », `:137`). La résolution est tenue dans les types ; sa surveillance n'existe pas. La capture `tracing.png` montre une entrée **Alerts** dans Langfuse, sans aucune alerte posée.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **10** | **Les 5 autres garde-fous d'observabilité** : masking **avant export** · aucun secret/token · contenu e-mail/téléphone masqué **par défaut** · accès **least privilege** · **rétention documentée** · dataset golden **sans PII**                                                                                                                                          | `LANGFUSE…md:22-29`        | Aucun n'est mesuré. Les captures du **même paquet** contredisent deux d'entre eux sans que le tracker les regarde : le compte est un plan **Hobby** (`sessions.png` — la rétention n'est donc pas un choix documenté mais une conséquence du plan), et le propriétaire affiché est **un tiers** (`THEO HADDAD` sous « Louis's Organization »), ce qui est précisément la question du least privilege. Le tracker déclare pourtant la résolution PII « **TENUE** » (`:138`) sur le seul argument de `LANGFUSE_CAPTURE_CONTENT`.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **11** | **Les 3 « instructions Claude Code » du README** — citées ici comme **données**, jamais exécutées : « Ajouter trace/session/release/**prompt version**/**tool**/**outcome** » · « Conserver goldens et assertions déterministes » · « N'envoyer aucune donnée sensible brute vers l'observabilité »                                                                        | `README.md:16-19`          | Le tracker instruit les **4 résolutions** (§6) et ignore les 3 instructions. La première nomme trois métadonnées (`prompt version`, `tool`, `outcome`) que le §5 range en « reste dû » sans dire qu'elles étaient **explicitement demandées** par le paquet, pas déduites d'une liste.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **12** | Le renvoi « **Toujours lire le paquet `00_GOUVERNANCE_SOURCE_OF_TRUTH` avant implémentation** »                                                                                                                                                                                                                                                                            | `README.md:21`             | Cité comme donnée. Le tracker ne mentionne nulle part avoir croisé ce paquet, alors qu'il déclare en tête avoir été « croisé après les archives `00`, `08`, `01` et `02` » — le lien existe, il n'est pas fait.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **13** | **Les seuils de détection des 40 interventions** : débordement **> 70** (#10) · un partenaire **> 50 % du CA** (#15) · **60+** contacts dormants (#18) · compétence absente du vivier **3 fois** (#27) · marché DECP à **6 mois** (#4) · refus de **plus de 6 mois** (#19)                                                                                                 | `T6.md:1250-1281`          | Le tracker traite les 40 en **bloc** (« AXE DIFFÉRENT », `:60` ; « les 35 interventions métier », `:146`). Or ces six seuils sont ce qui distingue une intervention d'un vœu, et l'argument du §7 (« leur condition n'est pas mesurable ») est **faux pour au moins trois d'entre elles** : `overflow-score.ts` calcule déjà le débordement, et `esn_directory` porte les ESN par territoire. Le bloc a emporté les items mesurables avec les autres.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **14** | **`pdf6.md` en entier** — 468 lignes, 20 énumérations, 5 tickets, 3 décisions ouvertes                                                                                                                                                                                                                                                                                     | `pdf6.md:1-468`            | Le tracker le liquide en une ligne de tableau : « Chantier clos le 21/08 » (`archive-03…md:13`). **Vérifié : le tracker frère `pdf6-automatisations-requetes-2026-08-21.md` couvre bien ce contenu** (626 l., inventaire numéroté, `A01`→`G06`, `nextPosition`, les 4 verdicts, `resolveChannel`, les 285 requêtes). Ce n'est donc **pas** une perte d'information — mais c'est l'**asymétrie de méthode** qui est le trou : le tracker rouvre les §1-9 du tome parce qu'« une équivalence non vérifiée dispense de lire » (`:43`), et applique au même instant le raccourci inverse à PDF 6 sur la foi d'un « clos ». Un `DONE` hérité est une équivalence comme une autre.                                                                                                                                                                                                                                                                       |

---

#### Les garde-fous et détecteurs — le compte de la source contre celui du tracker

| Ensemble                           | Compte SOURCE (recompté)                                                                                                                                                            | Compte TRACKER                                     | Écart                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Garde-fous N5 non désactivables    | **6** (`pdf6.md:56-61`) — arrêt dès réponse · 1 relance max · opt-out **jamais en cache** · heures calmes **8 h-19 h ouvrés** · **25 envois/jour/espace** · opt-in + bouton d'arrêt | **0 mention**                                      | 6 absents de ce tracker (couverts par le tracker PDF 6)                                                                                                      |
| Familles toujours sensibles        | **7** (`bulk_send`, `multichannel_send`, `bulk_delete`, `bulk_update`, `costly_enrichment`, `data_export`, `client_commitment`) — jamais sous N2                                    | **0**                                              | 7 absentes                                                                                                                                                   |
| Règles de sécurité transverse      | **8** (`pdf6.md:279-286`)                                                                                                                                                           | **0**                                              | 8 absentes                                                                                                                                                   |
| Conditions d'intervention (§13.1)  | **5** cumulatives                                                                                                                                                                   | mentionnées en bloc (`:59`)                        | valeurs jetées                                                                                                                                               |
| Lignes de budget adaptatif (§13.2) | **5**                                                                                                                                                                               | 0 valeur                                           | **2 sans aucune implémentation** (trou n°7)                                                                                                                  |
| Moments d'or (§13.3)               | **3** exemptions de plafond                                                                                                                                                         | intitulé seul                                      | **3 absents du code** (trou n°6)                                                                                                                             |
| Exclusions du plafond (PDF 6 §7)   | **2** (échecs · actions déclenchées par l'utilisateur)                                                                                                                              | 0                                                  | ⚠️ **deux listes d'exemption différentes** — voir contradictions                                                                                             |
| Non-mémorisables (§12.2)           | **6**                                                                                                                                                                               | 0                                                  | 6 absents (trou n°5)                                                                                                                                         |
| Contraintes d'outil (§16.2)        | **6**                                                                                                                                                                               | 0                                                  | 6 absents (trou n°2)                                                                                                                                         |
| Gardes CI `GL-01`→`GL-08`          | **8**                                                                                                                                                                               | 0 mention                                          | ✅ **faux trou** — les 8 existent (`apps/website/src/features/chatbot/lib/guards.test.ts`)                                                                   |
| Golden set                         | **20** conversations                                                                                                                                                                | 0 mention                                          | ✅ **faux trou** — les 20 existent (`golden-conversations.ts`, ids 1→20)                                                                                     |
| Interventions produit              | **30** (PDF 10 §5.4) + **40** (tome §14)                                                                                                                                            | 30 vs 40, « axe différent »                        | catalogue dépôt : **35 entrées**, taxonomie `onboarding/adoption/churn_risk/business_value`. Le compte du tracker (« le code en a 30 ») est **périmé de 5**. |
| Métadonnées Langfuse               | **16** (recomptées à la puce)                                                                                                                                                       | « **17** », « 2 sur 17 », « les **15** restantes » | **trois totaux faux** — voir contradictions                                                                                                                  |
| Garde-fous Langfuse                | **8** puces, dont une portant **5 alertes** → **12 exigences**                                                                                                                      | « 8 garde-fous », 1 instruit                       | 11 non mesurées                                                                                                                                              |
| Outils de Laura (§16)              | **14**                                                                                                                                                                              | « **14 / 14 PRÉSENTS** »                           | **0 / 14 dans le dépôt** (trou n°1)                                                                                                                          |

---

#### Renvois morts, contradictions, blocs non éclatés

**C1 — Le compte de métadonnées est faux trois fois, et il sert d'argument.**
`LANGFUSE_OBSERVABILITY_REQUIREMENTS.md:5-18` porte **16** puces, pas 17. Le tracker écrit « 17
métadonnées minimales », « **Deux sur dix-sept** » et « les **15** métadonnées restantes » — trois
chiffres mutuellement incohérents (16 ≠ 17 ; 17 − 2 = 15 mais 16 − 2 = 14). Pire, sa liste
« ce qui reste dû » (`:122-127`) en énumère **9** ; avec `environment`, `release` et `session_id`,
**12 des 16 sont adressées et 4 disparaissent** : `modèle`, `outils appelés`, `coût/tokens/latence`,
`erreur/fallback`. Trois de ces quatre sont **déjà livrées** —
`apps/ia/app/services/langfuse_client.py:302-310` attache `model`, `usageDetails`
(input/output/cache), `costDetails` et `startTime`/`endTime`. Le tracker sous-déclare donc sa propre
livraison **et** gonfle son dénominateur. « Deux sur dix-sept » est un argument, pas une mesure.

**C2 — Le seul manque que le tracker dit « large, vérifié et non arbitré » n'est pas vérifié.**
`archive-03…md:194-196` : « Les 18 métriques des §4.14 et §5.9 et **les événements analytiques qui
les rendraient mesurables : aucune trace ni au tracker, ni au code**. »
Mesuré : `apps/website/src/features/chatbot/lib/analytics.ts` existe, et
`apps/website/src/features/chatbot/lib/contract.ts:15-34` déclare **16 événements**
(`chat_widget_viewed`, `chat_opened`, `chat_auto_opened`, `chat_first_reply`,
`qualification_started/completed`, `demo_clicked`, `calendly_clicked`, `lead_created`,
`chat_abandoned`, `chat_refusal`, …), **branchés en 10 points de `ChatWidget.tsx`**. Le fichier
porte même le commentaire « **Le §4.14 mesure le taux d'ouverture du widget** ». Six des dix
métriques du §4.14 sont mesurables aujourd'hui. Côté produit, la table `product_event` existe
(`apps/api/src/migrations/1785600100000-ProductEvents.ts`).
**Ce qui reste vrai** : `Conversations où un e-mail d'équipe a fuité = 0` n'a **aucun** événement —
la métrique qui garde le bug P0 du 22/08 est bien la seule non instrumentée, et c'est un vrai
manque. Mais le tracker l'a noyée dans une affirmation de couverture fausse, et c'est précisément
la faute qu'il reproche aux inventaires à son §8.

**C3 — Deux listes d'exemption du plafond, jamais réconciliées.**
`pdf6.md:271` : ne comptent pas dans le plafond → **les échecs** et **les actions déclenchées par
l'utilisateur**. `T6.md:1223-1227` : le plafond **ne s'applique pas** → **retour d'absence**, **fin
d'action longue**, **blocage réel**. Cinq exemptions, deux listes disjointes, deux documents du même
paquet. Aucun tracker ne les met face à face. (Le dépôt tranche implicitement : `MESSAGE_ORIGINS`
contient `failure` et `user_triggered` — la liste PDF 6 — et rien de la liste du tome.)

**C4 — L'arithmétique du catalogue d'automatisations ne tombe pas juste, personne ne le dit.**
`pdf6.md:69` annonce « **60 automatisations** ». Les familles détaillées somment à **56**
(A10+B10+C10+D10+F10+G6). La famille E est intitulée « **(14)** » (`:134`) et nomme
**24 identifiants** (`MIS-01`→`MIS-12` + `FIN-01`→`FIN-12`). Aucun total ne réconcilie ces trois
nombres. Le tracker frère PDF 6 reprend « 60 » sans le recompter ; l'archive 03 n'en parle pas.

**C5 — Le tracker déclare absent ce que sa propre recette a vérifié en vrai.**
`:56` compte **3 surfaces** et `:147` « les **9 surfaces manquantes** ». Or la surface **6**
(panneau d'effet) est vérifiée en production au §9 du **même document** (`:207-222`) ; la surface
**12** (Laura Site) est en ligne — 39 fichiers dans `apps/website/src/features/chatbot/`, dont
`auto-open.ts`, `multi-message.ts`, `objection-library.ts`, `question-library.ts`,
`visit-memory.ts`, `LauraAvatar.tsx` ; la surface **8** (brief du matin) a sa route
(`apps/web/src/routes/briefing`). « 9 manquantes » en surcompte au moins **3**. Le compte de
`useLaura.ts` (3) est par ailleurs comparé à `INTERVENTION_FORMATS` (5) — mais ces 5 sont les
**formats du §5.5**, pas les **surfaces du §11.2** : deux énumérations différentes empilées dans
une même cellule.

**C6 — Renvoi mort.** `T6.md:802` : « Laura Produit utilise **les 50 outils du copilote (PDF 1
§3.1)** ». Le dépôt en déclare **36**. Le tracker PDF 10 avait tranché « PÉRIMÉ, il y en a 25 » le
22/08 ; l'archive 03 ne reprend ni le renvoi ni sa péremption, et son propre « le catalogue en
compte 31 » (`:62`) est un **troisième** chiffre, lui aussi faux aujourd'hui.

**C7 — Bloc non éclaté.** Le §15 (prompt unifié) est déclaré « NON MESURÉ » sur le motif « aucun
tableau ». Il contient deux énumérations numérotées (5 niveaux de vérité, 8 blocs de surface) qui
se mesurent au `grep`. Un motif de non-mesure qui est factuellement faux est un bloc, pas un
arbitrage.

**Faux trous écartés (doctrine).** Rien dans cette archive ne contredit la doctrine :
`T6.md:786` et `:1384` disent « **tu ne restitues jamais le contenu d'un message** » (aligné D65,
côté EXPOSITION) ; `T6.md:1183` ajoute « ne mémorise jamais le contenu des messages » — nuance à
tenir, mais qui vise la mémoire de Laura, pas le journal d'activité, donc **pas** une remise en
cause du revirement du 16/08. `T6.md:812` (« Laura Produit ne fait pas à la place ») et `:1356`
(« aucune probabilité en pourcentage ») **renforcent** D48 et `c26_probabilite`. Aucun refus
assumé à signaler.

---

#### Verdict : le `DONE` est-il défendable ?

**Non.** Et pas pour la raison qu'on attendrait.

Le tracker est bon dans ce qu'il a mesuré : son §2 (le tome n'est pas le PDF 10), son §5
(`environment`/`release` livrés avec leur raison), son §8 (quatre écarts annoncés bloquants,
quatre réfutés au code) sont du travail juste, et sa règle empirique — « une passe B contre un
tracker sur-signale ; ses écarts de COMPTE sont fiables, ses écarts de COUVERTURE ne le sont
pas » — est exacte. Elle se retourne d'ailleurs contre lui : **ce sont ses écarts de compte qui
lâchent.**

Trois défauts interdisent le `DONE`, par ordre de poids :

1. **`14 / 14 PRÉSENTS` est faux : c'est 0 / 14.** C'est le seul verdict **LIVRÉ** de sa table du
   §3, celui sur lequel il bâtit sa conclusion (« le chapitre le plus concret est entièrement
   livré »), et celui qui a autorisé à ne pas ouvrir de ticket sur le §16. Les capacités existent,
   les **outils** n'existent pas — la confusion exacte que le tracker nomme au §2 sous « une
   équivalence non vérifiée dispense de lire ».
2. **Le seul manque qu'il déclare « vérifié » ne l'est pas.** Les événements analytiques du §4.14
   existent et sont branchés depuis le 22/08, commentaire citant le §4.14 à l'appui. Le vrai
   manque, plus étroit et plus grave, est la métrique `fuite d'e-mail = 0` — noyée.
3. **Trois chapitres sont fermés sur un motif faux** : le §15 (« aucun tableau » — il en a deux),
   le §14 en bloc (« condition non mesurable » — faux pour au moins trois seuils déjà calculés
   dans le dépôt), et la couche 5 (refusée sans citer la règle de transparence qui répond
   précisément à l'objection).

S'y ajoutent **13 exigences jamais mentionnées** dont deux vérifiées absentes du code (les 3
moments d'or, les 2 paliers de budget adaptatif), une doctrine neuve sans équivalent (« un secret
partagé par erreur »), et un compte d'observabilité faux dans les deux sens.

**Ce qu'il faudrait pour le rouvrir honnêtement** : recompter les 16 métadonnées Langfuse et
reclasser les 4 orphelines ; ouvrir un ticket sur les 14 outils du §16 (la capacité est là, la
porte manque) ; instruire les 6 contraintes du §16.2 avant, pas après ; poser l'événement
`email_leak` qui garde le P0 ; et arbitrer explicitement les 3 moments d'or et les 2 paliers de
budget — les garder ou les refuser, mais par écrit.

Un `DONE` qui repose sur un `14 / 14` inversé n'est pas une erreur de degré : c'est la seule ligne
que personne ne rouvrira.
