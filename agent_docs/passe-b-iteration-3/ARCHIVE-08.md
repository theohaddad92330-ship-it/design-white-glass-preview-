### Passe B — archive 08 CODE / REPO DIFF / CLAUDE ENTRYPOINT

> Relecture en LECTURE SEULE de
> `agent_docs/sources/BELLUMAI_ITERATION_3_08/08_CODE_CURRENT_REPO_DIFF_AND_CLAUDE_ENTRYPOINT/`,
> consigne inversée : **ce que la source demande et que le tracker ne mentionne NULLE PART.**
> Trackers contredits : `agent_docs/audit-archive-08-2026-08-25.md` (83 l.) et
> `agent_docs/iteration-3-completude-2026-08-25.md:34`.
> Méthode : `repo_readable/` et `repo_diff_reports/` ne prouvent RIEN sur le code d'aujourd'hui ;
> **toute affirmation de code ci-dessous a été revérifiée sur le disque, à la date du 29/08**,
> et chaque trou porte sa colonne « encore vrai ? ».

---

**Fichiers ouverts : 163 / 163** — plus **2 déclarés au manifeste et absents du dossier**, retrouvés
dans le zip parent et inventoriés. Dont **142 miroir pur** et **21 porteurs** (3 d'exigence, 18
d'extraction dont 3 portent un signal).

**Critère de tri, et c'est le seul qui tienne ici :** un fichier est **MIROIR** s'il a un jumeau
dans NOTRE dépôt — sha256 identique, ou divergence dont le contenu survit ailleurs. Il ne peut
alors rien demander que le dépôt ne porte déjà : son exigence, s'il en a une, est notre backlog,
pas celui de l'archive. Il est **PORTEUR** s'il n'existe **que là** : écrit par l'auteur de
l'archive, pour nous. Ce critère est mécanique et vérifiable — je l'ai appliqué par empreinte sur
les 163, pas à l'œil.

| Bloc                                   | N   | Classement               | Comment il a été ouvert                                                                                                                                                                                |
| -------------------------------------- | --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo_readable/`                       | 140 | **miroir pur**           | les 140 diffés octet à octet contre le dépôt d'AUJOURD'HUI ; les 14 divergents diffés ligne à ligne, direction analysée ; les 140 balayés pour marqueurs ouverts                                       |
| `repo_snapshots/*.zip` (déclarés)      | 2   | **miroir pur**           | **absents du dossier** ; extraits du zip parent vers un scratchpad, inventoriés (5 247 et 4 702 fichiers), diffés contre `git ls-files` d'aujourd'hui                                                  |
| `audit/repo_diff_reports/`             | 18  | extraction de notre code | 5 lus intégralement (`removed`, `todos`, `web_routes`, `domain_focus_refs`, `offer_portfolio_refs`), 2 parsés en JSON (118 + 564 entrées), `migrations.txt` vide (0 o.), 10 dumps ouverts + interrogés |
| `CLAUDE_CODE_ENTRYPOINT.md` + `README` | 2   | **porteurs d'exigence**  | lus intégralement, énoncé par énoncé                                                                                                                                                                   |
| `audit/ORION_AUDIT_BASELINE`           | 1   | **porteur d'exigence**   | lu intégralement (135 l., 18 sections, 89 assertions)                                                                                                                                                  |
| `MANIFEST_SHA256.{md,csv}`             | 2   | métadonnée               | lus intégralement ; c'est **eux** qui révèlent les 2 zips absents                                                                                                                                      |

163 = 140 + 18 + 2 + 1 + 2. Aucun fichier hors compte.

**Cinq vérifications faites AVANT tout reproche, et qui donnent raison au tracker.** Il faut les
écrire, parce qu'elles sont exactes et qu'elles ont coûté du travail :

1. `shasum -a 256` sur les **161** entrées du manifeste présentes → **161/161 OK**. Aucune
   divergence d'empreinte.
2. Les **18** `repo_diff_reports/` sont bien **byte-identiques** aux 18 du paquet `00` — comparés
   un par un, 18/18.
3. `ORION_AUDIT_BASELINE_2026-08-24.md` est bien byte-identique à
   `CURRENT_IMPLEMENTATION_BASELINE.md` du paquet `00` (`7cc4833c…`, les deux empreintes calculées).
4. « `missing_relative_imports.json` — **faux positifs intégraux** » est **VRAI**, et je l'ai prouvé
   plutôt que cru : sur les 564 entrées, **562** résolvent en `.ts`/`.tsx` sous NodeNext contre
   l'index du snapshot. Les **2** restantes sont les chaînes de fixture de
   `packages/contracts/src/esm-import-extensions.test.ts` — le test qui garde la règle. Donc 564/564.
5. Les chiffres de la baseline ORION se re-mesurent exactement sur les zips :
   **5 247** fichiers courants, **4 702** précédents, **547** ajoutés, **2** retirés. La source est juste.

---

#### ⚠️ Le tracker a-t-il liquidé l'archive en disant « c'est un miroir » ?

**Oui, et plus radicalement que sur l'archive 00 — parce qu'ici la liquidation est passée dans le NOM.**

Le tracker de complétude écrit, `iteration-3-completude-2026-08-25.md:34` :

```
| **08** Miroir de code | Audit | 140 miroirs + 5 247 fichiers | 140 | **100 %** | — (audit) | rien |
```

Trois choses dans cette seule ligne.

**L'archive s'appelle `08_CODE_CURRENT_REPO_DIFF_AND_CLAUDE_ENTRYPOINT`.** Le tracker la rebaptise
« **Miroir de code** ». Le nom réel porte trois blocs : le code, **le diff du dépôt**, **et le point
d'entrée**. Le nom du tracker n'en garde qu'un — et c'est précisément **le seul des trois qui ne
demande rien par construction**. Le renommage n'est pas cosmétique : c'est la conclusion écrite
avant l'analyse. Les deux blocs porteurs disparaissent du titre, puis du décompte, puis du verdict.

**Le dénominateur est 140, c'est-à-dire le nombre de miroirs.** Pas 163 fichiers, pas 89 assertions
de baseline, pas 19 directives : **140 miroirs**, le seul corpus dont on peut garantir d'avance
qu'il ne demandera rien.

**Et la ligne se contredit elle-même.** Sa colonne « Items » annonce « 140 miroirs **+ 5 247
fichiers** » — soit 5 387. Sa colonne « Statués » dit **140**. 140 / 5 387 = **2,6 %**. La ligne
écrit **100 %**. Le numérateur et le dénominateur sont dans la même case, séparés par une colonne,
et ils ne se parlent pas. C'est le mécanisme de l'archive 00 à l'état pur : _le pourcentage est
juste, c'est son dénominateur qui a été choisi_ — sauf qu'ici il n'a même pas fallu le calculer, il
est écrit à côté.

Le tracker long (`audit-archive-08-2026-08-25.md`) fait le même mouvement, en une phrase, dès sa
ligne 6 : « **Résultat : aucune exigence, aucune perte.** Ce paquet ne demande rien — il donne un
point d'entrée et des miroirs. » Le point d'entrée est nommé **dans la phrase qui dit que rien
n'est demandé**. Un point d'entrée est une liste d'ordres ; le classer avec les miroirs, c'est
décider qu'un impératif et une photographie sont le même genre de document.

---

#### Le dénombrement, reconstruit depuis la matière brute

Compté à la source, jamais en ouvrant un inventaire pour se compter lui-même.

| Corpus dénombré                                           |                         Compté | Méthode                                                           | Le tracker le compte ?                          |
| --------------------------------------------------------- | -----------------------------: | ----------------------------------------------------------------- | ----------------------------------------------- |
| Fichiers sur le disque                                    |                            163 | `find -type f`                                                    | oui (mais mal décomposé, ci-dessous)            |
| Fichiers **déclarés** au manifeste                        |                            163 | `MANIFEST_SHA256.csv`                                             | oui                                             |
| **Déclarés mais ABSENTS du dossier**                      |                          **2** | diff manifeste ↔ disque (`repo_snapshots/*.zip`)                  | **non**                                         |
| **Présents mais absents du manifeste** (les 2 manifestes) |                          **2** | diff manifeste ↔ disque                                           | **non**                                         |
| Points du `CLAUDE_CODE_ENTRYPOINT`                        |                          8 + 1 | `:3-12` (8 ordres + 1 limite)                                     | oui, « 8 points »                               |
| **Directives du `README.md`**                             |                         **10** | `README.md:8-21` (3 sources + 3 résolutions + 3 instructions + 1) | **non**                                         |
| **Sections de la baseline ORION**                         |                         **18** | `^## `                                                            | **non** (renvoi au §1.6 de `00`)                |
| **Assertions énumérables de la baseline**                 |                         **89** | puces + lignes numérotées                                         | **non** (15 croisées dans `00`)                 |
| **Énoncés explicites de MANQUE dans la baseline**         |                         **21** | `not complete / no consumer / Missing / remains / absent…`        | **non**                                         |
| dont **« Missing/partial » Stelya nommés**                |                         **11** | `ORION:61-71`                                                     | **non**                                         |
| **Chiffres de l'« étalon » légué au pack 08**             |                          **5** | `ORION:14,16` (5 247 · 104 · 118 · 702 · 73)                      | **1 sur 5**                                     |
| `repo_diff_reports/`                                      |                             18 | `find`                                                            | 18, **en un bloc**                              |
| **Lignes de `todos.txt`**                                 |                         **25** | fichier entier                                                    | **non** (0 occurrence de `todos`)               |
| **Routes web de `web_routes.txt`** (dont `bak/home.tsx`)  |                         **73** | fichier entier                                                    | **non**                                         |
| Entrées de `missing_relative_imports.json`                |                            564 | JSON                                                              | oui, « faux positifs intégraux » (vérifié VRAI) |
| **Contrôleurs de `controllers.json` / routes API**        |                  **118 / 702** | JSON                                                              | **non**                                         |
| **Delta (4)→(5)** : ajoutés / modifiés / retirés          |              **547 / 829 / 2** | `added` · `modified` · `removed`                                  | **non**                                         |
| Miroirs `repo_readable/`                                  |                            140 | `find` + 140 sha256                                               | oui, **en un bloc**                             |
| **dont porteurs d'au moins un marqueur d'item ouvert**    |                         **75** | `à trancher` / `reste à faire` / `TODO` / `en cours` / `xfail`    | **non**                                         |
| **dont `decisions-aout-2026.md`, `D1`→`D22`**             | **22, dont 14 « À trancher »** | `^### D[0-9]` + grep                                              | **non**                                         |
| Fichiers du snapshot `(5)` / `(4)`                        |                  5 247 / 4 702 | zip                                                               | 5 247 seulement                                 |

**Items portant une exigence, une consigne ou une décision : ≈ 150** (19 directives + 89 assertions
de baseline + 25 TODO + 14 décisions « À trancher », moins les recouvrements). Le tracker de
complétude en pose **140** — et ces 140 sont les MIROIRS, c'est-à-dire l'unique corpus qui n'en
contient aucun. **Les deux nombres sont proches par accident ; ils ne décrivent pas le même objet.**

**Le décompte du tracker long est faux de la même façon, et son total est juste par compensation.**
Il écrit `:26` : « **163 = 2 + 1 + 18 + 140 + 2.** Aucun fichier hors compte. » Or les deux derniers
sont `repo_snapshots/` — **qui ne sont pas dans le dossier** — et les deux MANIFESTES, qui y sont,
ne sont comptés nulle part. Deux erreurs de signe opposé, un total exact. Puis `:70-71` : « 163
fichiers déclarés au manifeste, 163 dans l'archive, 163 classés au §1. Aucun blanc. » Les trois 163
sont trois ensembles différents : le manifeste en déclare 163 dont **161** sont là, le disque en
porte 163 dont **161** sont déclarés. **« Aucun blanc » est précisément ce que ce calcul ne peut pas
établir.**

---

#### Ce que le tracker ne mentionne NULLE PART

| #      | Ce que la source demande                                                                                                                                                                                                                                                                                                                                                                                                    | Où (`fichier:ligne`)                                                                                                           | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Encore vrai aujourd'hui ?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **L'étalon que le paquet `00` lègue EXPLICITEMENT au paquet `08` : cinq chiffres, pas un.** « 5 247 fichiers, **104 modules API, 118 contrôleurs, ~702 routes, 73 routes web** » → verdict : « **Étalon, à réutiliser pour mesurer l'épuisement du pack `08`** ».                                                                                                                                                           | `gouvernance-iteration-3-2026-08-25.md:167`, source `ORION:14,16` et `controllers.json` / `api_modules.txt` / `web_routes.txt` | C'est la seule tâche que le dossier ait jamais **nommément affectée** à cette archive. Le tracker `08` en utilise **un** (5 247) et ignore les quatre autres : `grep` sur `audit-archive-08` rend **0** occurrence de `104`, `118`, `702`, `73`, et 0 de « étalon ». Une mesure d'épuisement dont on n'exécute qu'un cinquième ne mesure pas l'épuisement.                                                                                                                                              | **Trou réel, et je l'ai comblé** — mesuré avec la MÊME méthode que la source : **107** modules · **121** contrôleurs · **740** routes API · **81** routes web · 5 934 fichiers. Croissance monotone, **aucun module perdu**.                                                                                                                                                                                                                                                                                                                                                                                                 |
| **2**  | **Deux fichiers déclarés au manifeste sont absents du dossier** : `repo_snapshots/belllum-monorepo-main-current-2026-08-24.zip` (13 494 618 o.) et `…-previous.zip` (11 746 485 o.).                                                                                                                                                                                                                                        | `MANIFEST_SHA256.csv:162-163`, absents de `find … -type f`                                                                     | Le tracker les compte au §1 comme s'ils étaient là (`163 = 2+1+18+140+**2**`) et **fonde son §2 dessus** (« Le snapshot du 24/08 porte 5 247 fichiers »). Le certificat de passe A dit « 163 déclarés, 163 présents, aucun blanc » : c'est l'énoncé exact que le manifeste dément. Une garde qui compte un total sans comparer les LISTES est borgne.                                                                                                                                                   | **Toujours absents du dossier.** Retrouvés dans le zip parent, sha256 conformes. Le tracker a donc bien fait le travail — mais son écrit ne permet pas de le savoir, et la prochaine personne ne retrouvera pas les fichiers.                                                                                                                                                                                                                                                                                                                                                                                                |
| **3**  | **Les 10 directives du `README.md`, dont trois « résolutions » et trois « instructions » qui ne sont dans AUCUN autre document du dossier** : « Présence de code ≠ production prouvée » · « Le repo courant prévaut sur les diagnostics de PDF déjà corrigés » · « Aucun historique Git exact dans les ZIP » · « Limiter chaque PR à **un thème/ticket** » · « Exécuter tests ciblés, **contracts, goldens et typecheck** » | `README.md:8-21`                                                                                                               | Le tracker fond `README` + `ENTRYPOINT` en une seule ligne : « **Doctrine d'exécution en 8 points** » (`:20`). Deux fichiers, **19 énoncés**, comptés pour 8 — et les 8 retenus sont ceux de l'AUTRE fichier. `grep` sur le tracker : **0** occurrence de « thème », « ticket », « golden », « typecheck », « Présence de code ». Un bloc non éclaté vaut son cardinal, pas un.                                                                                                                         | **Oui** — aucun des deux trackers ne les nomme, et « limiter chaque PR à un thème » est exactement la règle qu'un chantier à quinze agents parallèles doit connaître.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **4**  | **Quatre des huit points du point d'entrée n'ont AUCUN équivalent dans le paquet `00`** : #1 « Lire `repo_readable/CLAUDE.md` », #3 « Lire `audit/ORION_AUDIT_BASELINE` », #4 « **Utiliser `repo_diff_reports` pour identifier ce que Louis a déjà ajouté entre (4) et (5)** », #6 « **Chercher les trackers associés dans `repo_readable/agent_docs`** ».                                                                  | `CLAUDE_CODE_ENTRYPOINT.md:3-10` face à `00/README.md:32-39`                                                                   | Le tracker écarte le fichier d'une phrase : « Il **redit** le workflow du paquet `00`, déjà inventorié et tenu » (`:64`), et le §1 dit « **Identique en substance** ». **J'ai comparé les deux listes ligne à ligne : elles se recoupent sur 3 points sur 8.** Et les deux points neufs les plus lourds — #4 et #6 — sont **exactement les deux instructions que le tracker n'a pas suivies** : il n'a pas exploité les diff reports (« déjà classés ») ni ouvert les trackers du miroir (« voir §2 »). | **Oui.** « A EST B dispense de lire » à l'état pur : l'équivalence est affirmée, jamais diffée, et elle dispense de lire les deux ordres qui auraient changé le résultat.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **5**  | **Les 21 énoncés de manque de la baseline ORION, dont les 11 « Missing/partial » de Stelya nommés un par un** (registre de familles de rôles acheteurs, politique de contact ingénierie, goldens Stelya, scoring de demande domaine, matching secteur mission, sources ROME/CPV, lexique vertical…).                                                                                                                        | `ORION_AUDIT_BASELINE_2026-08-24.md:11,18,39-41,47,50,52-53,60-72,79,85,93,103,108,112,116,121,126,134`                        | Le tracker renvoie au §1.6 du paquet `00` (`:21` « Croisé affirmation par affirmation — rien à refaire »). **Le §1.6 en croise quinze**, choisies sans critère écrit, sur **89** assertions et **18** sections. Le mot « affirmation par affirmation » décrit un travail qui n'a pas eu lieu ; et le renvoi transfère la charge vers un document dont la passe B de l'archive 00 a déjà établi que la sélection des 15 était arbitraire.                                                                | **Partiellement — et c'est la bonne nouvelle.** Vérifié sur le disque : **fermés** — l'éditeur web du portefeuille (`OfferPortfolioSection.tsx`), sa consommation IA (`portfolio_context.py`, `domain_focus.py`), le secteur projet/mission (`application_sectors.py`, migration `ProjectDomainContext`), le contexte de site (`SiteIndustrialContext`, `site-fit.ts`), le lexique vertical (`/settings/lexicon`), les sources ROME/CPV (`domain_job_filters.py`, `decp.py`), le digest quotidien (cron `daily-veille-digest`), les 30 détecteurs Laura (`DETECTABLE_KEYS` fait bien 30). **Encore ouverts : voir #6 à #9.** |
| **6**  | **Le registre de familles de rôles acheteurs n'existe toujours pas**, et le code le dit lui-même : « Intentionally scoped to the IT decider only… a **full deck-taxonomy migration is tracked separately**. »                                                                                                                                                                                                               | `ORION:65` ; vérifié `apps/ia/app/services/decision_role.py:15-17`                                                             | `grep` sur `role_famil` / `buyer_role` / `ROLE_FAMILIES` : **0**. Le paquet `00` l'avait déjà relevé (« le registre de familles de rôles n'existe pas ») ; l'archive `08` le re-transporte et le re-classe « rien à reprendre ». **Le même manque est compté pour zéro deux fois, dans deux archives, à la même date.**                                                                                                                                                                                 | **OUI, vrai aujourd'hui.** Et le commentaire du code dit « tracked separately » sans nommer où — le renvoi est mort.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **7**  | **`todos.txt` porte 25 lignes.** Deux `raise NotImplementedError` dans `apps/ia/app/services/llm_gateway.py`, quatre packs de domaines d'offre en `scaffold` avec « TODO curation », et un raccourci d'authentification d'avant-lancement propagé sur trois fichiers.                                                                                                                                                       | `audit/repo_diff_reports/todos.txt:1-25`, en particulier `:9-11`, `:12-23`, `:24-25`                                           | Le tracker écrit « Déjà classés » et pointe le paquet `00` (`:22`). **La passe B de l'archive 00 a établi que le paquet 00 ne les avait PAS classés** (18 en bloc, 4 nommés, `todos.txt` réduit à une ligne). Le renvoi est **circulaire** : `08` défère à `00`, `00` a liquidé en bloc. `grep` sur le tracker `08` : **0** occurrence de `todos`. 25 items comptés pour zéro une seconde fois.                                                                                                         | **OUI** — vérifié sur le disque : `llm_gateway.py:678` et `:692` portent toujours les deux `NotImplementedError` ; les quatre packs `supply_chain`, `product_design`, `pmo`, `rh` sont toujours `scaffold` (`offer_domains/__init__.py:15-18`).                                                                                                                                                                                                                                                                                                                                                                              |
| **8**  | **Le biais IT hérité, quatre porteurs nommés** : `_MAX_IT_SURFACE=20`, les clés de contrat `itChallenges` / `itAutonomy`, le libellé `Enjeux IT`, l'ontologie de couverture/contacts.                                                                                                                                                                                                                                       | `ORION:72`                                                                                                                     | Le paquet `00` le classe « VRAI, quatre porteurs » et renvoie au pack `06`. Le tracker `08`, qui transporte la MÊME phrase dans le MÊME document, ne la mentionne pas : `grep` rend **0** pour `itChallenges`, `_MAX_IT`, `IT bias`. Un document byte-identique classé deux fois donne deux verdicts différents, et le second est « rien ».                                                                                                                                                             | **Deux sur quatre encore vrais.** `discover_scoring.py:119` porte toujours `_MAX_IT_SURFACE = 20` ; `itChallenges`/`itAutonomy` vivent dans **20 fichiers** (API, web, IA, evals, PDF). En revanche `Enjeux IT` est **corrigé** (`bellum_advisor.py:385-392`, `challenge_label` résolu par la lentille de domaine).                                                                                                                                                                                                                                                                                                          |
| **9**  | **Une route de sauvegarde vit dans l'arbre de routes livré** : `bak/home.tsx`, 13ᵉ des 73.                                                                                                                                                                                                                                                                                                                                  | `audit/repo_diff_reports/web_routes.txt:13`                                                                                    | Même mécanisme que #7 : classé « déjà classé » par renvoi à une archive qui l'a manqué. Dans un routeur à base de fichiers, un dossier `bak` est soit une route publiée par accident, soit du code mort déguisé en route. Ni l'un ni l'autre tracker ne le nomme.                                                                                                                                                                                                                                       | **OUI**, `apps/web/src/routes/bak/home.tsx` existe toujours. (Déjà relevé par la passe B de l'archive 00 : quatre jours plus tard, toujours là — c'est la démonstration qu'un trou relevé dans une archive `DONE` ne se traite pas.)                                                                                                                                                                                                                                                                                                                                                                                         |
| **10** | **Les 5 `repo_trackers/` du paquet `00` sont AUSSI dans `repo_readable/` de l'archive `08`** — `decisions-aout-2026.md` (`D1`→`D22`, **14 « À trancher »**), `etat-produit-aout-2026.md`, `restitution-tracker.md`, `dette-pdf1-6`, `tomes-reste-a-faire`.                                                                                                                                                                  | `repo_readable/agent_docs/decisions-aout-2026.md` et les 4 autres, face à `audit-archive-08:23`                                | La passe B de l'archive 00 a établi qu'ils y étaient liquidés en une phrase (« byte-identiques, rien à reprendre »). **Ici ils sont liquidés une seconde fois, et mieux cachés** : noyés dans un bloc de 140. Le raisonnement invalide n'a pas changé — _« l'archive n'apporte rien de neuf »_ n'est pas _« ces documents ne demandent plus rien »_ — mais son dénominateur est passé de 5 à 140.                                                                                                       | **OUI.** Balayage des 140 miroirs : **75 portent au moins un marqueur d'item ouvert** (`à trancher`, `reste à faire`, `TODO`, `en cours`/`fragile`, `xfail`). Le plus lourd reste `decisions-aout-2026.md`, 14 « À trancher ».                                                                                                                                                                                                                                                                                                                                                                                               |
| **11** | **« La divergence est purement additive, zéro ligne de l'archive n'est absente du dépôt. »**                                                                                                                                                                                                                                                                                                                                | `audit-archive-08-2026-08-25.md:38-40`                                                                                         | Vrai le 25/08 sur 2 fichiers. **Faux aujourd'hui sur 14** : `CLAUDE.md` est passé de **580 à 227 lignes** — **441 lignes de l'archive ne sont plus dans le fichier du dépôt** — et `pdf2`, `pdf3`, `pdf10` divergent à nombre de lignes ÉGAL (25, 28, 24 lignes réécrites), ce qui est une substitution, pas un ajout. Une affirmation de non-régression a une date de péremption ; celle-ci en portait quatre jours.                                                                                   | **L'affirmation est périmée ; la SUBSTANCE tient.** J'ai testé les 240 lignes non vides retirées de `CLAUDE.md` une par une contre `agent_docs/`, `packages/`, `docs/` : **240/240 retrouvées**. Le rétrécissement est le commit `38c2109df` (« 238 k → 26 k, rien de perdu »), délibéré. **Rien n'est perdu — mais seule une re-mesure pouvait le dire, et le `DONE` l'a interdite.**                                                                                                                                                                                                                                       |
| **12** | **« Trois fichiers ont disparu. »**                                                                                                                                                                                                                                                                                                                                                                                         | `audit-archive-08-2026-08-25.md:45-54`                                                                                         | C'est la seule question que le tracker déclare digne d'être posée (« Un paquet de miroirs sert à une chose : détecter ce qui a **disparu** », `:32`). Il y a répondu une fois, le 25/08, puis a fermé l'instrument. **Aujourd'hui la réponse est 16.**                                                                                                                                                                                                                                                  | **16, pas 3** — et les 13 nouvelles sont **toutes délibérées**, chacune avec son commit nommé (`ConnectorsBar`, `sparklines`, `DataHygienePanel`, `action-library`, `product-kpi`, `NavbarBody`, `cookieConsent`…). Donc aucune perte. **Mais la valeur de l'archive est un contrôle RÉCURRENT, et `DONE` a retiré le seul instrument capable de le refaire.**                                                                                                                                                                                                                                                               |

---

#### Renvois morts, contradictions résolues en silence

- **Le renvoi circulaire, deux fois.** `audit-archive-08:22` (« Déjà classés ») et `:21`
  (« Croisé affirmation par affirmation au §1.6 ») délèguent au paquet `00` le classement des 18
  diff reports et le croisement de la baseline. Le paquet `00` a traité les 18 en bloc et 15
  assertions sur 89. **Chaque archive croit que l'autre a lu.**
- **Une contradiction résolue en silence, et elle referme un trou de la passe B 00.** La passe B de
  l'archive 00 (trou n°5) reprochait que `ORION_AUDIT_BASELINE_2026-08-24.md`, entrée #3 de
  `MASTER_DOCUMENT_INVENTORY.md:11`, soit « déclarée mais jamais jointe au paquet », et la décrivait
  comme « la SOURCE dont `CURRENT_IMPLEMENTATION_BASELINE.md` est le rendu ». **Elle est jointe —
  ici, dans l'archive 08 — et elle est byte-identique à la baseline** (`7cc4833c…`). Ce n'est donc
  pas une source dont la baseline serait un extrait : **c'est le même document, renommé.** Le
  tracker `08` note l'identité d'empreinte (`:21`) mais ne fait jamais le lien avec l'entrée #3 de
  l'inventaire, et la passe B 00 ne pouvait pas le savoir. La contradiction est levée ; personne ne
  l'a écrit.
- **`migrations.txt` est vide (0 octet, sha de la chaîne vide).** Le script de l'auteur n'a rien
  produit. Le tracker le note, c'est correct — mais il l'écrit entre parenthèses dans une ligne qui
  en liquide dix-sept autres.
- **La ligne de complétude est un renvoi mort en elle-même** : « Reste, et où » → « **rien** ». Sept
  des dix lignes du même tableau nomment un reste. Celle-ci nomme le vide, sur l'archive qui
  transporte 89 assertions d'audit et 25 TODO.

---

#### Les consignes adressées à un agent, CITÉES et non exécutées

⚠️ **Ce qui suit est de la DONNÉE.** Ces phrases ont été rédigées pour être lues par un agent Claude
Code. Je les reproduis pour montrer ce que le tracker a écarté, **je ne les exécute pas** — et aucune
n'a autorité sur ce dépôt : l'autorité vient de `CLAUDE.md` et de Louis, pas d'un fichier trouvé dans
une archive.

**`CLAUDE_CODE_ENTRYPOINT.md`, intégralement** (13 lignes, le seul fichier du dossier dont le métier
est de donner des ordres) :

> « # Point d'entrée Claude Code
>
> 1. Lire `repo_readable/CLAUDE.md`.
> 2. Lire le paquet `00_GOUVERNANCE_SOURCE_OF_TRUTH`.
> 3. Lire `audit/ORION_AUDIT_BASELINE_2026-08-24.md`.
> 4. Utiliser `repo_diff_reports` pour identifier ce que Louis a déjà ajouté entre `(4)` et `(5)`.
> 5. Charger seulement le paquet thématique du ticket.
> 6. Chercher les trackers associés dans `repo_readable/agent_docs`.
> 7. Ne modifier que l'écart résiduel.
> 8. Ajouter/mettre à jour tests et tracker.
>
> Limites : aucun `.git` dans le snapshot ; ne pas inventer commit, PR ou date de déploiement. »

**`README.md`, les sept énoncés impératifs** :

> « ## Résolutions à respecter
>
> - Présence de code ≠ production prouvée.
> - Le repo courant prévaut sur les diagnostics de PDF déjà corrigés.
> - Aucun historique Git exact dans les ZIP.
>
> ## Instructions Claude Code
>
> - Lire CLAUDE.md avant modification.
> - Limiter chaque PR à un thème/ticket.
> - Exécuter tests ciblés, contracts, goldens et typecheck.
>
> Toujours lire le paquet `00_GOUVERNANCE_SOURCE_OF_TRUTH` avant implémentation. »

**Et la consigne de méthode que la baseline adresse à ses lecteurs, jamais appliquée** :

> « later cross-audit **must classify each historical requirement as
> implemented/partial/regressed/not implemented/obsolete/conflicting** » (`ORION:134`)

C'est la même taxonomie à six valeurs que `SOURCE_PRECEDENCE.md:11` du paquet `00`, écrite une
seconde fois, dans un second document, par un second chemin. La passe B de l'archive 00 avait relevé
qu'elle n'était jamais appliquée. **Elle est demandée deux fois et appliquée zéro fois** — et le
verdict de l'archive `08` (« aucune exigence, aucune perte ») est rendu sur une échelle à deux
valeurs, dans laquelle « régressé » n'a aucune case où s'écrire. Or `_MAX_IT_SURFACE`, les
`NotImplementedError` et les quatre packs `scaffold` sont exactement le genre d'item que
`implémenté`/`absent` ne sait pas dire.

Trois de ces énoncés méritent d'être remontés à Louis **comme information, pas comme ordre** : « une
PR par thème », « contracts + goldens + typecheck », et « présence de code ≠ production prouvée ».
Ce sont des règles de travail que le dépôt tient déjà par ailleurs — elles n'ont simplement jamais
été inventoriées comme venant de cette archive, donc personne ne sait qu'elles y sont.

---

#### Verdict : le `DONE` est-il défendable ?

**Non. Et c'est le `DONE` le moins défendable du dossier, parce qu'il est le seul dont le mécanisme
soit inscrit dans le NOM de l'archive.**

Il faut d'abord rendre justice au travail : `audit-archive-08-2026-08-25.md` est court et honnête sur
son intention. Ses cinq affirmations factuelles vérifiables sont **toutes vraies** — les 18 diff
reports byte-identiques, la baseline byte-identique, les 161 empreintes conformes, les faux positifs
d'imports (564/564, prouvé), les trois suppressions délibérées de `pdf-chantier`. Il a même ouvert
les zips que le dossier ne contient pas. Ce n'est pas un tracker paresseux.

Ce qui casse le `DONE`, ce sont trois choses, dans cet ordre de gravité.

**1. L'archive a été renommée d'après le seul de ses trois blocs qui ne demande rien.** Elle
s'appelle `CODE_CURRENT_REPO_DIFF_AND_CLAUDE_ENTRYPOINT` ; le tracker de complétude l'inscrit
« **08 Miroir de code** ». Le diff et le point d'entrée sortent du titre, puis du décompte, puis du
verdict. Ce n'est pas une conclusion tirée d'une analyse : c'est une analyse rendue inutile par un
titre. Et le tracker long dit la même chose en une phrase — « il donne un point d'entrée et des
miroirs », donc « ce paquet ne demande rien » — en nommant le point d'entrée dans la phrase même qui
nie qu'il demande quoi que ce soit.

**2. Le dénominateur est le nombre de miroirs, et la ligne se contredit dans sa propre largeur.**
`iteration-3-completude-2026-08-25.md:34` déclare **« 140 miroirs + 5 247 fichiers »** en items,
**140** en statués, et **100 %** en complétude. 140 / 5 387 = **2,6 %**. Sur l'archive 00, il fallait
aller chercher la matière brute pour démontrer que le 36 était choisi ; ici, le numérateur et le
dénominateur sont dans deux colonnes voisines de la même ligne. **Et le 140 choisi est exactement le
corpus dont le tracker vient d'établir qu'il ne peut rien demander** — on a mesuré l'épuisement de
l'archive sur la partie de l'archive qu'on savait vide.

**3. La seule tâche que le dossier ait jamais affectée nommément à cette archive a été faite au
cinquième.** `gouvernance-iteration-3-2026-08-25.md:167` lègue un étalon en cinq chiffres et écrit
« à réutiliser pour mesurer l'épuisement du pack `08` ». Le tracker `08` en réutilise un. C'est le
motif « **du code juste que personne n'appelle** » transposé à un chantier : la mesure était
calculée, écrite, et adressée — personne ne l'a appelée. (Je l'ai faite : 107 · 121 · 740 · 81, tout
croît, rien n'a disparu. Elle prend deux minutes et elle est rassurante — ce qui rend son omission
plus coûteuse encore, parce qu'elle aurait été une VRAIE preuve d'épuisement au lieu d'une phrase.)

**Et le défaut de fond, qui n'est pas une erreur de comptage :** cette archive n'est pas un document,
c'est **un instrument de mesure**. Sa valeur — « qu'est-ce que le dépôt a perdu ? » — n'est pas un
fait, c'est une fonction qu'on rappelle. Le tracker l'exécute une fois, le 25/08, obtient « 3, toutes
délibérées », et **écrit `ÉPUISÉE`**. Quatre jours plus tard la réponse est **16**, et
`CLAUDE.md` a perdu 441 lignes. Les seize sont délibérées et les 441 lignes ont été déplacées, pas
perdues — mais **ça, il fallait le remesurer pour le savoir**, et c'est exactement ce que le mot
`DONE` interdit. On a certifié épuisé un thermomètre.

**Ce qu'il faudrait pour que le `DONE` devienne défendable** — c'est court, et rien là-dedans n'est
un chantier :

- recalculer la ligne `:34` de la complétude : dénombrer les **19 directives**, les **89 assertions**
  de la baseline et les **25 TODO**, et non les 140 miroirs ;
- exécuter les **quatre cinquièmes** restants de l'étalon (fait ci-dessus : 107 · 121 · 740 · 81) et
  l'écrire dans le tracker ;
- corriger `163 = 2+1+18+140+2` et retirer « 163 déclarés, 163 présents » — **161** sont déclarés ET
  présents, 2 zips sont déclarés et absents, 2 manifestes sont présents et non déclarés ;
- éclater les 18 `repo_diff_reports` au lieu de les déférer au paquet `00`, en commençant par les
  **25 lignes de `todos.txt`** et par `bak/home.tsx` ;
- statuer les **11 « Missing/partial »** de la baseline ORION un par un — sept sont fermés depuis, ce
  qui est une excellente nouvelle que personne n'a écrite, et **le registre de familles de rôles
  acheteurs est toujours vide** ;
- inventorier les 19 directives des deux fichiers de doctrine, ne serait-ce que pour dire lesquelles
  le dépôt tient déjà.

Rien de tout cela ne sera écrit tant que l'archive porte `DONE`, **parce que personne ne rouvre une
archive terminée** — et sur celle-ci, moins que sur les autres : son titre officiel dit désormais
qu'elle ne contenait que des miroirs.

---

## ⚠ Démenti mesuré — lot E5, 29/08/2026

Ce rapport a été rouvert et ses items **7**, **8** et **9** re-mesurés contre le code de
`origin/main`. **Deux de ses trois dettes n'en sont pas**, et la recommandation de clôture
ci-dessus — « éclater les 18 `repo_diff_reports`, **en commençant par** les 25 lignes de `todos.txt`
**et par `bak/home.tsx`** » — mène, appliquée telle quelle, à supprimer un écran vivant. Le démenti
est écrit ici, et non dans les cellules du tableau, parce qu'on archive, on ne réécrit pas.

**Item 9 — FAUX POSITIF. `bak` veut dire back-office, pas backup.**
`apps/web/src/routes/bak/home.tsx` est l'écran opérateur de la décision **D34 · 26/08**, écrit par
Louis le 28/08/2026. Il est publié dans l'arbre (`routeTree.gen.ts:75,411-412`), **atteignable**
depuis la barre latérale (`components/sidebar/items.ts:126`, entrée `items.backoffice`), titré
(`lib/route-titles.ts:32`) et tenu par quatre fichiers de test — dont
`test/backoffice-entry-adds-not-replaces.test.tsx:80`, qui vérifie précisément que le lien pointe sur
`/bak/home`. Le fichier porte en outre, en commentaire, **la raison** de l'arbitrage : l'entrée
back-office s'AJOUTE à la navigation au lieu de s'y substituer, pour qu'un opérateur garde sa sortie.
Le supprimer casserait la navigation du rôle `backoffice` et effacerait cette raison. **Rien à faire.**
Ce que l'item aurait dû mesurer, avant de nommer le dossier : **qui l'importe.**

**Item 7, premier tiers — FAUX POSITIF. Les deux `NotImplementedError` sont un patron abstrait.**
`apps/ia/app/services/llm_gateway.py:678` et `:692` sont les deux méthodes de `class LLMProvider`
(`:674`), `is_available` et `complete`, **toutes deux annotées `# pragma: no cover - abstract`**. La
classe n'est jamais instanciée nue (0 occurrence de `LLMProvider()`) : `_PROVIDERS` (`:878-881`) ne
contient que `AnthropicProvider()` et `OpenAIProvider()`, et `_select_provider` (`:884-896`) ne rend
jamais autre chose. Aucun chemin de production ne les atteint. **Rien à faire** — et surtout rien à
« corriger » : leur donner un corps supprimerait la seule chose qu'elles font, échouer bruyamment si
un jour une sous-classe oublie d'implémenter.

**Item 7, deuxième et troisième tiers — mesurés, l'un fermé, l'autre parqué.**
Le **raccourci d'authentification** est **fermé** : la colonne `skipped_at` existe
(`apps/api/src/database/entities/user-onboarding-state.entity.ts:28-31`) et son commentaire décrit le
raccourci au passé. Les **quatre packs `scaffold`** sont toujours là
(`offer_domains/__init__.py:15-18`) mais ils sont **honnêtes** — `_scaffold.py:25` : « until curated,
scaffolds reuse the generic domain-neutral vocabulary ». Le défaut réel n'est pas le TODO, c'est que
leur statut `scaffold` ne franchit ni le contrat ni le web alors que `OFFER_DOMAINS`
(`packages/contracts/src/schemas/onboarding.ts:26-39`) les expose à égalité avec les `live` : parqué
en **D148** (§12.6 du tracker du 26 août).

**Item 8 — VRAI, et il l'est resté.** Deux porteurs sur quatre. Détail mesuré et périmètre du
chantier en **D147** (même §12.6). Le seul correctif court a été livré par ce lot : le panneau de
veille écrivait « Enjeux IT » sur le seau `pains`, que la fiche compte nomme déjà « Enjeux business »
— deux libellés pour la même donnée, dont un faux.

⚠ **`todos.txt` n'est pas dans le dépôt** (`git ls-files | grep todos` → 0). Il vit dans la source
archivée `audit/repo_diff_reports/`, hors du dépôt : les 25 lignes ne sont donc mesurables que par ce
que le code en dit, ce qui est exactement ce qui vient d'être fait.
