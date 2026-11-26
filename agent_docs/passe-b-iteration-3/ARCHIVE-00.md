### Passe B — archive 00 GOUVERNANCE

> Relecture en LECTURE SEULE de `agent_docs/sources/BELLUMAI_ITERATION_3_00_GOUVERNANCE/`,
> consigne inversée : **ce que la source demande et que le tracker ne mentionne NULLE PART.**
> Trackers contredits : `agent_docs/gouvernance-iteration-3-2026-08-25.md` (391 l.) et
> `agent_docs/iteration-3-completude-2026-08-25.md` (87 l.).
> Rappel de méthode appliqué : `repo_mirrors/` et `repo_diff_reports/` ne prouvent RIEN
> sur le code d'aujourd'hui ; toute affirmation de code ci-dessous a été revérifiée sur le
> disque, à la date du 29/08.

---

**Fichiers ouverts : 35 / 35**

Le dossier ne contient ni `source_pdfs/` ni `original_markdown_sources/` : cette archive est
100 % métadonnée de gouvernance. Aucun PDF à ouvrir, donc aucun miroir à préférer.

- **13 markdown lus intégralement** — les 8 de la racine (`README`, `SOURCE_PRECEDENCE`,
  `CLAUDE_CODE_RULES`, `IMPLEMENTATION_STATUS`, `MANIFEST_SHA256`,
  `MASTER_CONTRADICTION_REGISTER`, `MASTER_DOCUMENT_INVENTORY`,
  `CURRENT_IMPLEMENTATION_BASELINE`) et les 5 de `repo_trackers/`.
- **4 CSV lus intégralement** — dont `MANIFEST_SHA256.csv` et `MASTER_DOCUMENT_INVENTORY.csv`,
  diffés ligne à ligne contre leurs jumeaux markdown.
- **18 `repo_diff_reports/`** — 6 lus intégralement (`todos.txt`, `removed.txt`,
  `domain_focus_refs.txt`, `offer_portfolio_refs.txt`, `web_routes.txt`, `migrations.txt`) ;
  12 ouverts en tête + interrogés par grep ciblé (`access_code.txt`, `added.txt`,
  `api_modules.txt`, `ats_matching_outline.txt`, `controllers.json`,
  `dataforge_offer_stelya_code.txt`, `missing_relative_imports.json`, `modified.txt`,
  `packages_summary.txt`, `recent_doc_headings.txt`, `stat.txt`, `status_sections.txt`).

**Classés non porteurs d'exigence, avec leur raison** (12) : les 12 gros dumps ci-dessus sont
des extractions de NOTRE dépôt au 24/08 — du code et des listes de fichiers, pas des demandes.
Ils sont non porteurs _en tant qu'exigences_, ce qui n'est pas la même chose que « sans
information » : `web_routes.txt` et `todos.txt` portent chacun un signal que le tracker a
laissé tomber (trous 7 et 8 ci-dessous). `migrations.txt` est VIDE (0 octet, sha de la chaîne
vide) — le script de l'auteur n'a rien produit ; le tracker le note, c'est correct.

**Deux vérifications faites avant tout reproche, et qui donnent raison au tracker :**

1. `shasum -a 256 -c` sur les 33 entrées du manifeste → **33/33 OK**, aucune divergence.
   L'affirmation « le manifeste, lui, est exact » est VRAIE, et va même plus loin qu'écrit :
   les empreintes, et pas seulement le compte, sont bonnes.
2. Les 5 `repo_trackers/` sont bien **byte-identiques** aux `agent_docs/` d'aujourd'hui
   (sha256 comparés un par un). Le fait est exact. La conclusion qu'on en tire ne l'est pas
   — voir le trou n°2.

---

#### Le dénombrement, reconstruit depuis la matière brute

Compté à la source, sans jamais ouvrir un inventaire pour se compter lui-même.

| Corpus dénombré                                             | Compté | Méthode                                       | Le tracker le compte ? |
| ----------------------------------------------------------- | -----: | --------------------------------------------- | ---------------------- |
| Fichiers sur le disque                                      |     35 | `find -type f` (33 manifestés + 2 manifestes) | oui                    |
| Contradictions `## C…`                                      |     25 | titres du registre                            | oui                    |
| Invariants non négociables                                  |     11 | puces `SOURCE_PRECEDENCE.md:28-38`            | oui                    |
| **Points de la « Règle générale »**                         |  **5** | `SOURCE_PRECEDENCE.md:9-13`                   | **non**                |
| Niveaux de précédence (`SOURCE_PRECEDENCE`)                 |      8 | liste numérotée `:17-24`                      | oui                    |
| **Niveaux de priorité (`MASTER_DOCUMENT_INVENTORY` §14)**   | **10** | liste numérotée `:148-157`                    | **non**                |
| Lignes de `IMPLEMENTATION_STATUS`                           |     28 | lignes du tableau                             | oui                    |
| Règles `CLAUDE_CODE_RULES`                                  |     10 | puces                                         | oui                    |
| Étapes du workflow `README`                                 |      8 | liste numérotée `:32-39`                      | oui                    |
| **Paquets déclarés par le `README`**                        | **10** | `README.md:19-28`                             | **non**                |
| Entrées `MASTER_DOCUMENT_INVENTORY.md`                      |     69 | `^[0-9]+\. \`` (dont **2 doublons de titre**) | oui                    |
| Lignes `MASTER_DOCUMENT_INVENTORY.csv`                      |     38 | lignes hors entête                            | oui                    |
| **Miroirs `agent_docs/` listés au §13**                     | **25** | `MASTER_DOCUMENT_INVENTORY.md:118-142`        | **non**                |
| Sections de `CURRENT_IMPLEMENTATION_BASELINE`               |     18 | titres `##`                                   | 15 assertions choisies |
| `repo_diff_reports/`                                        |     18 | `find`                                        | 4 nommés / 14 en bloc  |
| `repo_trackers/`                                            |      5 | `find`                                        | 0 nommé / 5 en bloc    |
| **Décisions numérotées `D1`→`D22`** (`decisions-aout-2026`) | **22** | `^### D[0-9]`, dont **14 « À trancher »**     | **non**                |
| **Lignes de `todos.txt`**                                   | **25** | fichier entier                                | ~5 traitées, bloc      |

**Total d'items énumérables portant une exigence, une règle ou une décision : ≈ 300.**
(25+11+5+8+10+28+10+8+10+69+25+18+18+5+22+25, moins les recouvrements.)

Le tracker de gouvernance en dénombre **159** dans sa table de passe A (25+11+28+10+8+8+69),
ce qui est déjà honnête et bien au-dessus de la moyenne du dossier.

Le tracker de **complétude**, lui, écrit pour l'archive 00 : `Items : 36 | Statués : 36 |
Complétude 100 %` (`iteration-3-completude-2026-08-25.md:33`), le 36 étant
« 25 contradictions + 11 invariants ». **C'est le dénominateur qui est faux, pas le
numérateur** : il exclut les 28 lignes de matrice, les 10 règles d'ingestion, les 8 étapes de
workflow, les 8 niveaux de précédence et les 69 entrées d'inventaire — soit **123 items que le
tracker frère, dans le même dépôt et à la même date, dit avoir traités.** Les deux trackers ne
comptent pas la même archive. Le « 100 % » de l'archive 00 est un pourcentage calculé sur 23 %
de la matière, et c'est lui qui a autorisé le `_DONE`.

---

#### Ce que le tracker ne mentionne NULLE PART

| #   | Ce que la source demande                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Où (`fichier:ligne`)                                                                                                                                                                                                                                                      | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Une DEUXIÈME hiérarchie de précédence, à dix niveaux**, concurrente de celle à huit. Elle place les masters 160p/104p au rang 5, l'addendum 02/08 au 6, la méta-analyse 03/08 au 7 (rang que l'autre liste ignore), TF1 au 8, les restitutions au 9 — et surtout **elle ne donne AUCUN rang aux `agent_docs/` du dépôt**, que l'autre liste classe 5ᵉ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `MASTER_DOCUMENT_INVENTORY.md:146-157` (« Hiérarchie provisoire de priorité documentaire pour l'itération 3 »), face à `SOURCE_PRECEDENCE.md:15-24`                                                                                                                       | Le tracker §5 ne cite QUE les huit niveaux et écrit « La précédence, elle, est écrite dans le pack (`SOURCE_PRECEDENCE.md`) et c'est son contenu le plus durable ». Il n'a pas vu qu'il en existe une seconde, dans le même paquet, qui dit autre chose. **C'est une contradiction non tranchée à l'intérieur du document dont l'unique métier est de trancher les contradictions** — et elle porte précisément sur le niveau 5, dont le tracker dit lui-même qu'il est « l'un des trois qui font gagner du temps : ils autorisent à NE PAS recoder ». Un agent qui lit l'inventaire plutôt que `SOURCE_PRECEDENCE` n'a plus le droit d'invoquer un `agent_docs/` pour ne pas recoder. Zéro occurrence de « §14 », « dix niveaux » ou « hiérarchie provisoire » dans les deux trackers. |
| 2   | **Les 5 `repo_trackers/` portent ≈ 45 items ouverts, dont 22 décisions numérotées.** `decisions-aout-2026.md` compte `D1`→`D22`, dont **14 encore marquées « À trancher »**, et son propre chapeau dit « D8 et D22 restent en attente ». `etat-produit-aout-2026.md` porte 5 chantiers « En cours », **9 « Fragile — ça marche, sous conditions »** (dont `FIRECRAWL_MAX_PAGES=3` posé sur Railway, Stripe en mode test, rien qui surveille l'API de la démo) et 6 « Hors scope ». `restitution-tracker.md` porte 3 « ce qui reste », 3 sentinelles `xfail` vivantes et 3 blocages nommés avec leur responsable. `dette-pdf1-6` porte « Ce qui reste vraiment ».                                                                                                                                                                                                  | `repo_trackers/decisions-aout-2026.md:36-282` · `repo_trackers/etat-produit-aout-2026.md:51-114` · `repo_trackers/restitution-tracker.md:219-296` · `repo_trackers/dette-pdf1-6-2026-08-21.md:191-200`                                                                    | Le tracker liquide les cinq en **une phrase** : « Copies de nos `agent_docs/`. **Byte-identiques au dépôt** (sha256 comparés) : rien n'a divergé, **rien à reprendre** » (§1.5). L'identité d'empreinte est vraie — je l'ai revérifiée, 5/5 — mais elle prouve seulement que l'archive n'a rien apporté de NEUF. Elle ne dit rien de ce que ces fichiers demandent encore. **Non-sequitur : « identique » n'est pas « clos ».** Aucun des cinq n'est nommé une seule fois dans l'un ou l'autre tracker (`grep` : 0 occurrence de `decisions-aout`, `dette-pdf1-6`, `etat-produit`, `restitution-tracker`, `tomes-reste-a-faire`). C'est le bloc le plus lourd de l'archive : **5 documents comptés pour 0.**                                                                            |
| 3   | **« Zéro décision en suspens » est faux, et la source qui le dément est DANS l'archive.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Preuve n°5 du certificat, `gouvernance-iteration-3-2026-08-25.md:361-362` : « **Zéro décision en suspens** — les trois questions du 25/08 sont tranchées et livrées ; **aucune autre n'est ouverte** », contre `repo_trackers/decisions-aout-2026.md` (14 « À trancher ») | La preuve n°5 est l'une des dix qui autorisent le `_DONE`. Elle est contredite par un fichier que l'archive transporte elle-même et que le manifeste déclare. Le tracker n'a pas eu à chercher loin : il a classé le fichier « rien à reprendre » sans l'ouvrir, puis a certifié qu'aucune décision n'était ouverte. **Le trou n°2 et le trou n°3 sont la même erreur vue par ses deux bouts** — le bloc non éclaté d'abord, la certification fausse qu'il permet ensuite.                                                                                                                                                                                                                                                                                                              |
| 4   | **Le delta d'inventaire est faux : 69 − 38 = 31, pas 28.** Même après déduplication des deux titres répétés (67 uniques), on obtient 29.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `gouvernance-iteration-3-2026-08-25.md:243` (« Ce qu'il écarte réellement — **vingt-huit** entrées, recalculées par différence ») et `:328` (« delta de **28** recalculé et nommé »), contre `MASTER_DOCUMENT_INVENTORY.md` (69 entrées) / `.csv` (38 lignes)             | Le chiffre est écrit deux fois, dont une dans la **table de passe A** qui sert de preuve d'épuisement. Ironie utile : le §4 existe précisément parce qu'une première version disait quelque chose de faux sur ce CSV et a été corrigée. La correction a rétabli la NATURE du delta (une sélection, pas une troncature) mais a introduit une erreur d'arithmétique dans son AMPLEUR. Un total est un argument : ici il sous-déclare 3 documents écartés.                                                                                                                                                                                                                                                                                                                                 |
| 5   | **Neuf entrées écartées par le CSV ne sont nommées nulle part**, alors que le §4 se présente comme la liste de « ce qu'il écarte réellement ». Manquent à l'appel : `ORION_AUDIT_BASELINE_2026-08-24.md` (#3) — la SOURCE dont `CURRENT_IMPLEMENTATION_BASELINE.md` est le rendu ; `BELLUMAI_PLAN_ACTION_LOUIS_2026-07-07.pdf` (#4) ; la restitution 14/07 (#5) ; **`BELLUMAI_MODELE_OPERATOIRE_BUSINESS_INTEGRATIONS_INTERNATIONAL_LOUIS_2026-07-16.pdf` (#7)** ; **`BELLUMAI_STRATEGIE_INTERNATIONALE_METHODOLOGIE_ROADMAP_LOUIS_2026-07-16_V4.pdf` — « stratégie internationale / Market Packs » (#8)** ; `BellumAI_Restitution_Finalisee_Nouvelles_Briques.pdf` (#12) ; le `.docx` éditable du master 104p (#19) ; `bellumai-serie-9-pdf.zip` (#39, le §4 n'annonce que « les deux bundles zip » alors qu'il y en a trois) ; l'entrée Tome-6 dupliquée (#41). | `MASTER_DOCUMENT_INVENTORY.md:11,15,16,18,19,23,36,62,67` vs `gouvernance-iteration-3-2026-08-25.md:245-253`                                                                                                                                                              | Les deux plus lourdes sont **#7 et #8** : ce sont les **seules pièces du corpus entier sur le modèle opératoire international et les Market Packs**, et le dépôt porte une règle permanente « i18n + international — UI FR+EN + country packs ». Aucun des dix paquets du `README` ne les revendique (le `07` est « business / pricing / demo / beta »), donc elles ne tombent dans aucune archive et personne n'est en charge. **#3 est le second plus lourd** : c'est le document d'origine dont la baseline est un extrait — le tracker croise 15 affirmations de la baseline sans jamais noter que sa source primaire est déclarée dans l'inventaire et absente du paquet.                                                                                                          |
| 6   | **Un document que la source déclare INTROUVABLE et demande de localiser.** « `PDF_06_Integrations_Connecteurs.pdf` — intégrations / capability model — **À LOCALISER PAR TITRE EXACT EN FILE LIBRARY** ; contenu recoupé par série 10 et master #18. »                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `MASTER_DOCUMENT_INVENTORY.md:46`                                                                                                                                                                                                                                         | C'est la seule ligne de tout l'inventaire qui porte une **action explicite** au lieu d'un pointeur. Elle n'est mentionnée dans aucun des deux trackers, ni comme faite, ni comme refusée, ni comme non promise. Et la justification embarquée — « contenu recoupé par série 10 et master #18 » — est exactement le motif « **A EST B dispense de lire** » : l'inventaire affirme une équivalence de contenu entre un document qu'il n'a pas retrouvé et deux autres, sans que personne n'ait diffé les sommaires. Le paquet `04` traite les intégrations : il a hérité de l'équivalence sans hériter de la question.                                                                                                                                                                    |
| 7   | **`todos.txt` porte 25 lignes ; environ 5 ont été traitées.** Restent non mentionnées, entre autres : deux `raise NotImplementedError` dans `apps/ia/app/services/llm_gateway.py` (lignes 213 et 227 au 24/08) et un raccourci d'authentification assumé — « `/onboarding` (**un raccourci d'avant-lancement assumé dans un TODO**) », propagé sur trois fichiers (`useRedirectAfterAuth.ts`, `useOauthCallback.ts`, `post-auth-landing.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                     | `repo_diff_reports/todos.txt:1-25`, en particulier `:9-11` et `:24-25`                                                                                                                                                                                                    | Le tracker écrit « `todos.txt` — a mené au lot 2 (les commentaires périmés) » (§1.4) : un fichier de 25 lignes réduit à son unique ligne exploitée. **Vérifié sur le disque aujourd'hui, pas sur le miroir** : les deux `NotImplementedError` sont toujours là (`apps/ia/app/services/llm_gateway.py:678` et `:692` — le fichier a grossi, le code est vivant), et le commentaire du raccourci d'avant-lancement est toujours dans `apps/web/src/features/auth/hooks/useRedirectAfterAuth.ts:59`. Un raccourci d'authentification « d'avant-lancement » qui survit au lancement est le genre d'item qu'une archive `DONE` enterre définitivement.                                                                                                                                       |
| 8   | **Une route de sauvegarde vit dans l'arbre de routes livré** : `bak/home.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `repo_diff_reports/web_routes.txt:13`                                                                                                                                                                                                                                     | Le fichier de 73 routes a été classé « dump de notre propre dépôt, non porteur ». Il l'est en tant qu'exigence, mais il contient une anomalie qu'aucun autre document du dossier ne montre. **Vérifié aujourd'hui** : `apps/web/src/routes/bak/home.tsx` existe toujours. Un répertoire nommé `bak` dans un arbre de routes à base de fichiers est une route publiée par accident, ou du code mort qui ressemble à une route. Ni l'un ni l'autre tracker ne le nomme.                                                                                                                                                                                                                                                                                                                   |
| 9   | **Deux des « neuf règles tenues » ne le sont pas, de l'aveu même du tracker.** `CLAUDE_CODE_RULES.md` règle 11 : « Pour le multi-domaines : **aucune hypothèse IT silencieuse** ». Règle 12 : « Pour Stelya : secteur au Project/Mission, site-level context, **engineering buyer roles**, **confidentialité du feedback**. »                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `CLAUDE_CODE_RULES.md:11-12`, contre `gouvernance-iteration-3-2026-08-25.md:132` (« dix règles d'ingestion. **Neuf sont tenues** et vérifiables ci-dessus »)                                                                                                              | Le tracker écrit lui-même, trente lignes plus bas : le registre de familles de rôles « **n'existe pas** » (§6), et l'invariant de confidentialité du retour bêta est celui « **sans aucun porteur** » (§1.2) — donc la règle 12 est tenue à moitié. Et son §6 décrit `activity` qui « lit `profiles` et non `resolve_seller_context` : un espace dont le portefeuille vit dans `esn_profiles` **retombe sur la lentille IT** » — la définition littérale d'une hypothèse IT silencieuse, donc la règle 11 n'est pas tenue non plus. Le décompte « 9 tenues / 1 refusée » est une **3ᵉ colonne jetée** : le tableau qui applique les règles contredit la ligne qui les résume. Le nombre juste est au mieux 7 tenues, 2 partielles, 1 refusée.                                           |
| 10  | **La taxonomie de classement à six valeurs n'est jamais appliquée.** « classer `implémenté`, `partiel`, `absent`, `régressé`, `supplanté` ou `contradictoire` » — point 3 des cinq de la « Règle générale ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `SOURCE_PRECEDENCE.md:11`                                                                                                                                                                                                                                                 | Les cinq points de la « Règle générale » ne figurent dans aucune des deux tables de dénombrement. Le tracker répond en passe B que « la taxonomie à six valeurs est adoptée là où elle change quelque chose (§1.3 garde les `_PARTIAL`) » — réponse partielle et honnête, mais elle ne couvre que `partiel`. **Aucun item de l'archive n'est jamais classé `régressé` ni `supplanté`**, alors que ce sont les deux valeurs que la taxonomie ajoute pour attraper ce qu'`implémenté`/`absent` ne peut pas dire. Le §1.1 juge par VRAI/FAUX, une échelle à deux valeurs. Une régression au 25/08 par rapport au 24/08 n'avait aucune case où s'écrire.                                                                                                                                    |
| 11  | **Le §13 de l'inventaire — 25 miroirs `agent_docs/` — n'est jamais dénombré.** L'inventaire dit qu'ils « servent à **mesurer ce que Louis/Claude Code ont déjà absorbé** dans le repo ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `MASTER_DOCUMENT_INVENTORY.md:115-144`                                                                                                                                                                                                                                    | Vérifié : **les 25 chemins existent tous** sur le disque aujourd'hui — ce n'est donc PAS un renvoi mort, et c'est à porter au crédit du dossier. Mais la section porte une consigne de MESURE que personne n'exécute, et c'est l'unique endroit du paquet qui articule l'archive au niveau 5 de la précédence (les `agent_docs/` qui autorisent à ne pas recoder). Ni le §13 ni les 25 chemins n'apparaissent dans les deux trackers.                                                                                                                                                                                                                                                                                                                                                   |
| 12  | **L'inventaire s'intitule « Iteration 2 ».** « # BellumAI — **Iteration 2** — Master document inventory », dans une archive nommée `ITERATION_3`, dont le `README` est titré « Iteration 3 ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `MASTER_DOCUMENT_INVENTORY.md:1` vs `README.md:1`                                                                                                                                                                                                                         | Mineur mais jamais relevé, et c'est le genre d'indice qui explique le trou n°1 : le document de 69 entrées et sa hiérarchie à dix niveaux **viennent d'une itération précédente** et ont été embarqués tels quels. `SOURCE_PRECEDENCE.md` (8 niveaux) est daté « consolidation : 24 août 2026, après analyse du repo `(5)` ». Les deux hiérarchies ne sont pas deux opinions : c'est une ancienne et une neuve, et personne n'a écrit que la neuve remplace l'ancienne.                                                                                                                                                                                                                                                                                                                 |

---

#### Renvois morts, contradictions non tranchées, blocs non éclatés

**Renvois morts et pointeurs cassés** (aucun n'est relevé) :

- `MASTER_DOCUMENT_INVENTORY.md:46` — `PDF_06_Integrations_Connecteurs.pdf`, « **À LOCALISER** ».
  Le seul document du corpus déclaré introuvable, couvert par une équivalence de contenu non
  vérifiée (trou n°6).
- `:106` — titre « `Tarifs BELLUMAI.png` » mais pointeur `/mnt/data/**Tarfis** BELLUMAI.png`.
- `:107` — titre « `BÊTA TESTEURS.png` » mais pointeur `/mnt/data/**BÉTA** TESTEURS.png` (Ê ≠ É).
- `:112` — titre « `mémoire ancien GPT.docx` » mais pointeur `/mnt/data/mémoire **ancein** GPT.docx`.
- `:11` — `ORION_AUDIT_BASELINE_2026-08-24.md`, source primaire de la baseline, déclarée mais
  jamais jointe au paquet ni réclamée.
- Doublons d'entrées : #41 = #47 (`Tome-6-Laura-assistant-omnipresent.pdf`), #17 = #64
  (`Présentation plateforme BELLUMAI.pdf`). Le « 69 » réel est 67.

**Contradictions non tranchées :**

1. **Huit niveaux contre dix** (trou n°1) — la plus grave, parce qu'elle porte sur l'objet
   même de l'archive et qu'elle déclasse silencieusement les `agent_docs/`.
2. **« Neuf règles tenues » contre le corps du tracker** (trou n°9) — le résumé et le détail
   du même document se contredisent sur deux règles.
3. **« Zéro décision en suspens » contre 14 « À trancher » embarqués** (trou n°3).
4. **`Items : 36` contre `159` dénombrés** — les deux trackers du 25/08 ne comptent pas la même
   archive, et c'est le petit chiffre qui a servi à écrire « 100 % ».
5. **`IMPLEMENTATION_STATUS.md` contre `CURRENT_IMPLEMENTATION_BASELINE.md` sur Laura Site** :
   la matrice écrit `IMPLEMENTED` / « Sécurité handoff/email », la baseline écrit « P0 email
   leak **appears** fixed in code/tracker » (`:40`). `IMPLEMENTED` et « semble corrigé » ne
   sont pas le même statut sur une fuite d'e-mail interne classée P0. Le tracker retient
   `IMPLEMENTED` et ne signale pas la réserve de l'auteur.

**Blocs non éclatés** — chacun compte pour son cardinal, pas pour un :

| Bloc                                                                | Traité comme | Vaut en réalité                                                                                                           |
| ------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| « Les cinq `repo_trackers/` … rien à reprendre » (§1.5)             | 1 ligne      | **5 documents, ≈ 45 items ouverts, 22 décisions numérotées**                                                              |
| « Les dix-huit `repo_diff_reports/` … classés non porteurs » (§1.4) | 4 nommés     | **18**, dont 2 porteurs de signal non relevé (trous 7 et 8)                                                               |
| « `todos.txt` — a mené au lot 2 » (§1.4)                            | 1 item       | **25 lignes**, ~5 traitées                                                                                                |
| « Les quinze [affirmations] qui portent quelque chose » (§1.6)      | 15           | `CURRENT_IMPLEMENTATION_BASELINE` porte **18 sections** et ~100 assertions ; la sélection des 15 n'a pas de critère écrit |
| « 69 (md) / 38 (csv) — delta de 28 nommé » (passe A)                | 28 nommés    | **31 écartées**, 9 jamais citées                                                                                          |

---

#### Verdict : le `DONE` est-il défendable ?

**Non — mais de justesse, et pas pour la raison qu'on attendrait.**

Il faut le dire d'abord parce que c'est vrai : `gouvernance-iteration-3-2026-08-25.md` est un
travail sérieux. Il a trouvé six défauts réels, en a livré cinq, a documenté ses propres
erreurs de passe A, a refusé des chantiers avec des raisons écrites plutôt que de les taire, et
son manifeste vérifie au sha256. La plupart de ses verdicts de croisement, que j'ai re-testés
par sondage, tiennent.

Ce qui casse le `DONE` n'est pas la qualité du travail : c'est **la porte que ce travail a
laissée ouverte, et que le mot `DONE` referme sur elle**.

**Les trois plus lourds :**

1. **Les cinq `repo_trackers/`, liquidés en une phrase par un raisonnement invalide** (trou
   n°2). « Byte-identiques au dépôt, donc rien à reprendre » confond _l'archive n'apporte rien
   de neuf_ avec _ces documents ne demandent plus rien_. Ils demandent **22 décisions
   numérotées, dont 14 encore marquées « À trancher »**, et neuf conditions de production
   « fragiles » nommées avec leur identifiant. Cinq documents comptés pour zéro, dans l'archive
   dont on dit ensuite qu'elle est épuisée.

2. **La preuve n°5 du certificat est fausse** (trou n°3). « Zéro décision en suspens — aucune
   autre n'est ouverte » est démentie par un fichier que le manifeste de l'archive déclare, que
   j'ai lu en dix secondes, et qui liste D1 à D22. Une des dix preuves qui autorisent le `DONE`
   est contredite par la matière qu'elle certifie avoir épuisée.

3. **Deux hiérarchies de précédence concurrentes, dont une seule est vue** (trou n°1). C'est le
   défaut le plus structurant du lot, parce que cette archive est celle qui fait dériver toutes
   les autres : `MASTER_DOCUMENT_INVENTORY.md:146-157` classe les sources en dix rangs et
   **n'accorde aucun rang aux `agent_docs/` du dépôt**, que `SOURCE_PRECEDENCE.md` place 5ᵉ et
   dont le tracker dit lui-même qu'ils « autorisent à NE PAS recoder ». Les neuf autres archives
   ont été traitées sous une règle de précédence dont personne n'a constaté qu'elle avait un
   jumeau divergent dans le même paquet. La chose que cette archive existe pour empêcher — « une
   contradiction se tranche deux fois, dans deux sens » — s'est produite sur la précédence
   elle-même.

**Et le mécanisme qui a permis de signer :** le `100 %` qui autorise le `_DONE` vient de
`iteration-3-completude-2026-08-25.md:33`, qui pose `Items : 36` pour l'archive 00. Trente-six,
c'est « 25 contradictions + 11 invariants ». Le tracker frère, même dépôt, même journée, en
dénombre 159 et la matière brute en porte ≈ 300. **Le pourcentage est juste ; c'est son
dénominateur qui a été choisi.** Aucun des trous ci-dessus n'aurait pu apparaître dans ce
calcul, puisqu'ils vivent tous dans les 123 items que le dénominateur exclut.

**Ce qu'il faudrait pour que le `DONE` devienne défendable** — c'est court, et c'est lisible :

- trancher, ou dater, la contradiction 8 niveaux / 10 niveaux, et écrire laquelle supplante
  l'autre (trou n°1) ;
- rouvrir les cinq `repo_trackers/` et statuer leurs items un par un, en commençant par les
  14 « À trancher » (trous n°2 et n°3) ;
- retirer ou réécrire la preuve n°5 du certificat ;
- recalculer le dénominateur de la complétude de l'archive 00 ;
- nommer les 9 entrées d'inventaire écartées sans mention, et affecter un paquet aux deux
  documents « international / Market Packs » qui n'en ont aucun (trou n°5) ;
- corriger 28 → 31 (trou n°4), et le décompte « 9 règles tenues » (trou n°9).

Rien là-dedans n'est un chantier. C'est une demi-journée de lecture. Mais aucune de ces lignes
ne sera jamais écrite si l'archive reste marquée `DONE`, **parce que personne ne rouvre une
archive terminée** — et c'est précisément ce que cette passe devait vérifier.
