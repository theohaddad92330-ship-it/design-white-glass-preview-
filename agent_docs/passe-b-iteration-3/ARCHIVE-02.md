### Passe B — archive 02 CRM / ATS / MATCHING / MISSIONS / ERP

> Lecture seule, 29/08/2026. Consigne inversée : chercher ce que la **source** demande
> et que le **tracker** (`agent_docs/archive-02-crm-ats-matching-2026-08-25.md`)
> ne mentionne **nulle part**.
> Corpus de contrôle élargi aux quatre trackers que l'archive audite
> (`pdf2-…`, `pdf3-…`, `pdf4-…`, `pdf5-…` dans `agent_docs/`), parce que le §7 de
> l'archive est explicitement « ce que les trackers ne disent pas » : un item présent
> dans un tracker n'est pas un trou, l'archive a raison de se taire dessus.
> Un trou = absent d'`archive-02` **et** des quatre trackers.

**Fichiers ouverts : 19 / 23**

Les 23 fichiers de `agent_docs/sources/BELLUMAI_ITERATION_3_02/02_CRM_ATS_MATCHING_MISSIONS_ERP/`
ont été énumérés par `find` (code de sortie 0, 23 entrées). Ouverts intégralement :

- `original_markdown_sources/pdf2.md` · `pdf3.md` · `pdf4.md` · `pdf5.md` (966 + 690 + 686 + 695 lignes) — **la matière**
- `repo_mirrors/` : les 9 fichiers (pdf2-5 trackers, `crm-ats-plan`, `pipeline`, `database_schema`, `backoffice-admin`, `plan-attaque-besoin`)
- `code_evidence/` : `api_modules.txt`, `web_routes.txt`, `ats_matching_outline.txt`
- `README.md`, `MANIFEST_SHA256.md`, `MANIFEST_SHA256.csv`

**Non ouverts, avec leur raison — 4 :** `source_pdfs/PDF-2…pdf`, `PDF-3…pdf`, `PDF-4…pdf`,
`PDF-5…pdf`. Consigne explicite de la mission (« `original_markdown_sources/*.md` PLUTÔT
que `source_pdfs/*.pdf` »). Leur intégrité est attestée par le manifeste ; **je n'ai donc
pas pu vérifier que le markdown est fidèle au PDF** — c'est la seule substitution de cette
passe, et elle est assumée par la consigne, pas par moi.

⚠️ Deux pièges rencontrés pour de vrai : `ls -la` a rendu une sortie **vide** sur quatre
fichiers qui existent (les `shasum` du même chemin ont réussi juste après) ; et deux
invocations de `grep` avec `-nhoE` ont été réécrites par l'outillage et ont rendu l'aide
en ligne de `rtk grep` **avec un code de sortie 0**. Tous les dénombrements ci-dessous ont
donc été refaits en Python, jamais en `grep | head`.

---

#### Le dénombrement reconstruit

Depuis la matière brute, pas depuis un inventaire.

| Source    | Lignes | Tableaux | **Lignes de tableau** | Rubriques d'arborescence | Tickets `BEL-*` |     Décisions `D*` |
| --------- | -----: | -------: | --------------------: | -----------------------: | --------------: | -----------------: |
| `pdf2.md` |    966 |       32 |               **314** |                       45 |               6 |                  6 |
| `pdf3.md` |    690 |       27 |               **202** |                       48 |               5 |                  7 |
| `pdf4.md` |    686 |       27 |               **176** |                       30 |               5 |                  5 |
| `pdf5.md` |    695 |       33 |               **241** |                       15 |               6 | 6 (+D2/D4 rappels) |
| **Total** |  3 037 |  **119** |               **933** |                  **138** |          **22** |             **30** |

Blocs identifiés, recomptés ligne à ligne :

| Bloc                                         | Source       |                                 Compte |
| -------------------------------------------- | ------------ | -------------------------------------: |
| Automatisations CRM (`CRM-01`…`12`)          | pdf2 §13     |                                     12 |
| Automatisations talent (`TAL-01`…`10`)       | pdf3 §12     |                                     10 |
| Automatisations matching (`MTC-01`…`08`)     | pdf4 §15     |                                      8 |
| **Automatisations missions/finance**         | **pdf5 §12** | **24** (`MIS-01`…`12` + `FIN-01`…`12`) |
| Codes d'exclusion, liste FERMÉE              | pdf4 §4.1    |                                     11 |
| Axes de correspondance                       | pdf4 §3      |                                     12 |
| Détections de parsing                        | pdf3 §4      |                                     12 |
| Sources de création d'un besoin              | pdf2 §7.2    |                                     11 |
| Statuts de besoin (avec condition d'entrée)  | pdf2 §7.4    |                                     11 |
| Colonnes du board Missions                   | pdf5 §2      |                                     12 |
| Bloqueurs de facturation (+ action proposée) | pdf5 §8.2    |                                      8 |
| Axes de marge                                | pdf5 §9.3    |                                      7 |
| KPI                                          | pdf2/3/4/5   |               13 / **10** / 8 / **17** |

**Le rapport de réduction.** 933 lignes de tableau, chacune portant 2 à 5 colonnes, plus
138 rubriques d'arborescence, arrivent au §7 d'`archive-02` sous la forme de **139 items**
en prose séparés par « · ». Ce n'est pas illégitime en soi — toutes les lignes ne sont pas
des exigences distinctes. Ce qui l'est moins, c'est la répartition : le PDF 4 (176 lignes
de tableau, le module qui porte les obligations EU AI Act) reçoit **18 items**, contre 46
au PDF 2. Et **le seul bloc de 24 lignes de toute l'archive reçoit zéro item.**

---

#### Ce que le tracker ne mentionne NULLE PART

Colonne « T2-T5 » = présence dans l'un des quatre trackers de dépôt. `—` = nulle part,
dans aucun des cinq documents.

| #      | Ce que la source demande                                                                                                                                                                                                                                                                                                                                                | Où                     | T2-T5         | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Les 24 automatisations `MIS-01`…`12` / `FIN-01`…`12`, avec leur colonne Niveau (N1/N2/N4/N5) et leur colonne Garde-fou**                                                                                                                                                                                                                                              | `pdf5.md:466-489`      | 1 ligne       | **Zéro occurrence de `MIS-0` ou `FIN-0` dans `archive-02`.** Les trois autres tables d'automatisations ont chacune leur ligne : §7.2 « colonne Garde-fou des 12 automatisations CRM », §7.3 « niveau d'autonomie N1-N6 des 10 automatisations · garde-fous TAL-02, 04, 07, 10 », §7.4 « colonne Garde-fou des 8 automatisations MTC ». La quatrième — la plus grosse — n'en a aucune. C'est le défaut du §4 (« le tracker jette la 3ᵉ colonne ») **reproduit dans le document qui le nomme**, sur la seule table où il jette aussi la 1ʳᵉ. Côté tracker PDF 5 : une seule ligne, « items 170-193 · Les 24 automatisations · 2 LIVRÉES sur 24 ». Vingt-quatre déclencheurs, vingt-quatre garde-fous, un verdict. |
| **1a** | `FIN-01` — « le **25 du mois** → lister les missions facturables »                                                                                                                                                                                                                                                                                                      | `pdf5.md:478`          | —             | 0 occurrence de « 25 du mois » ni de « facturables » dans les cinq documents. La seule automatisation qui ouvre le cycle de facturation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **1b** | `MIS-12` — « mission sans date de fin > 30 j → **rappel unique** au propriétaire », garde-fou « 1 seul »                                                                                                                                                                                                                                                                | `pdf5.md:477`          | —             | « mission sans date de fin » est cité six fois comme un ÉTAT compté à part ; l'automatisation qui le fait CORRIGER n'est citée nulle part. On sait compter le trou, personne ne relance pour le combler.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **1c** | Les niveaux **N5** (`FIN-02`, `FIN-03`) et **N4** (`FIN-12`)                                                                                                                                                                                                                                                                                                            | `pdf5.md:479-480, 489` | —             | 0 occurrence de « N5 » ou « N4 » à propos du PDF 5. **N5 = envoi automatique** (arbitrage n°13 du 16/08, `crm-ats-plan.md:23`). Les relances CRA sont les seules automatisations de toute l'archive que la source place au niveau qui envoie sans demander. Le tracker PDF 5 les traite comme « FAUX comme automatisation » sans jamais dire à quel niveau la source les voulait.                                                                                                                                                                                                                                                                                                                               |
| **1d** | Garde-fou `FIN-06` : « montant préparatoire, bloqueur levé — **jamais d'émission** »                                                                                                                                                                                                                                                                                    | `pdf5.md:483`          | —             | La règle fondatrice du PDF 5 (§1, « BellumAI n'émet aucune facture légale ») est bien tenue partout ailleurs — mais c'est ici, et seulement ici, qu'elle est attachée à un **exécutable**. La règle survit comme phrase, elle disparaît comme garde.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **1e** | Garde-fous `MIS-10` « jamais sur donnée absente » et `FIN-10` « jamais si coût absent »                                                                                                                                                                                                                                                                                 | `pdf5.md:475, 487`     | —             | Même famille : la doctrine « non mesuré n'est pas zéro » est partout ; les deux automatisations qui la portent, nulle part.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **1f** | `MIS-05` : « point de suivi + **créneau** »                                                                                                                                                                                                                                                                                                                             | `pdf5.md:470`          | —             | `archive-02` §7.5 retient « points J+1 / J+3 / J+30 » ; l'étape survit, la capacité (proposer le créneau) disparaît.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **2**  | **Les 7 axes de marge nommés**, dont **« Par canal — direct vs rang 2 : l'écart mesure le coût de l'intermédiation »**, « Par commercial, **avec prudence — le commercial ne fixe pas les salaires** », « Par offre / expertise — où l'ESN gagne réellement »                                                                                                           | `pdf5.md:369-375`      | groupe seul   | 0 occurrence de « par canal », « intermédiation », « par offre », « avec prudence ». Le tracker PDF 5 garde le compte (« Les 7 axes de marge · PARTIEL · seul l'axe par mission existe ») ; `archive-02` ne garde rien. L'axe « par canal » est le seul chiffre du produit qui mesure la stratégie rang 2 → rang 1 dont tout le PDF 2 §2 dépend.                                                                                                                                                                                                                                                                                                                                                                |
| **3**  | **Les cibles chiffrées des KPI du PDF 5** : marge non mesurée **< 10 %**, CRA reçus avant J+5 **> 85 %**, DSO **< 65 j**, intercontrat **< 5 %**, durée moyenne d'intercontrat **< 41 j**, missions non mesurables **< 20 %**, marge brute satisfaisante **25-40 %**                                                                                                    | `pdf5.md:531`          | —             | `archive-02` §7.5 écrit « cibles chiffrées des KPI » — la catégorie, jamais une valeur. Les cibles du PDF 2 et du PDF 3, elles, sont bien recopiées (`< 5 j`, `> 80 %`, `> 70 %`, `< 24 h`). Le PDF 5 est le seul dont on garde le mot « cible » sans le nombre.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **4**  | **Les chiffres de cadrage** : intercontrat 11,4 % pour 41 j ≈ 5 480 €/mois · turnover 18 %, 23,4 % pour les ESN de 15-50 · marge brute 23 %, **en baisse de 5 points depuis 2020** · DSO PME/ETI 65 j · retard de paiement 13,6 j                                                                                                                                       | `pdf5.md:21`           | catégorie     | Seule la date du 01/09/2026 a survécu (`archive-02` §3.2). Le tracker PDF 5 classe la ligne « repères de marché, aucune implémentation attendue » — juste pour du code, faux pour la décision : ce sont ces nombres qui **justifient** les seuils qu'on a retenus (l'alerte marge < 15 %, le KPI intercontrat < 41 j). Un seuil dont on a perdu le repère redevient une opinion.                                                                                                                                                                                                                                                                                                                                |
| **5**  | **Les 11 codes d'exclusion, NOMMÉS** (`missing_required_skill`, `unavailable_at_start`, `out_of_zone`, `previously_rejected_by_client`, `already_on_mission_at_client`, `consent_expired`, `contract_mismatch`, `rate_out_of_range`, `no_skills_recorded`, `language_mismatch`, `clearance_missing`) et leur colonne « Bloquant : oui / avertissement / non évaluable » | `pdf4.md:120-132`      | compte seul   | 0 occurrence d'un seul de ces codes dans les cinq documents. C'est une **liste FERMÉE** dont la source dit « Aucun profil n'est écarté sans code de motif. C'est une exigence de conformité, pas une préférence UX. » Les codes existent dans le dépôt — `EXCLUSION_REASONS`, visible dans le propre `code_evidence/ats_matching_outline.txt:282` de l'archive — donc ce n'est pas un trou produit ; c'est un trou de traçabilité sur la seule liste que l'archive qualifie de conformité.                                                                                                                                                                                                                      |
| **6**  | « Le **canal par défaut** d'une relance CRA est **l'email**. Teams sert au rappel, pas à l'engagement. »                                                                                                                                                                                                                                                                | `pdf5.md:257`          | interdit seul | **0 occurrence du mot « Teams » dans `archive-02`.** Le tracker PDF 5 tient l'interdit de langage (« jamais brouillon Teams ») ; la règle de choix par défaut, elle, n'est nulle part.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **7**  | `closing_chance` + `closing_chance_axes` demandés comme **COLONNES persistées** d'un besoin (0-100 + jsonb, « calculé »)                                                                                                                                                                                                                                                | `pdf2.md:373`          | —             | `archive-02` §3.1 consacre une section entière au refus de la probabilité et ajoute `c26_probabilite` au registre — en ne parlant que du **score affiché**. La source demandait aussi un **schéma**. « Ne pas afficher » et « ne pas stocker » sont deux décisions ; une seule est écrite, et c'est la seconde qui reviendra par une migration.                                                                                                                                                                                                                                                                                                                                                                 |

**Ce qui est absent d'`archive-02` mais tenu par un tracker** — donc pas un trou, listé pour
que personne ne le recompte : les 13 filtres du portefeuille, les 5 vues par défaut, la
garde « > 50 comptes = N3 », les 7 fenêtres de fraîcheur par type de signal, l'organigramme
et ses arêtes `confirmed`/`inferred`, le BTMMP, les portes G1/G3/G4, les 8 statuts de
séquence dérivés, les 12 détections de parsing, les 3 TJM et les 4 champs de mobilité d'un
talent, les 14 boutons, les 7 segments du pool, les 6 points d'entrée du matching, les 8
règles de déplacement du board, la relance graduée J+3/J+15/J+30, le prorata d'un mois
partiel, `[5, 12, 20]`, T-60/T-30, le préavis (`noticeDays`).

---

#### Les ~120 exigences que le §7 dit perdues — récupérées, ou seulement constatées ?

**Réponse courte : constatées, réparées là où ça touchait du code, et rendues invérifiables.**

**1. Les quatre chiffres ne se réconcilient pas.** Recomptés en Python sur le fichier :

| Où                        | Ce qu'il dit                    |    Ce que la liste contient |
| ------------------------- | ------------------------------- | --------------------------: |
| §4                        | « environ **120** exigences »   |                           — |
| §7.2 / §7.3 / §7.4 / §7.5 | « 40 / 40 / 17 / 30 » = **127** | **46 / 40 / 18 / 35 = 139** |
| §9, titre                 | « Les **139** exigences »       | ✔ correspond au vrai compte |
| §9, tableau               | 44 + 40 + 18 + 35 = **137**     |      ✘ le PDF 2 en a **46** |

Trois des quatre en-têtes du §7 sous-comptent leur propre liste, et **deux exigences du
PDF 2 figurent dans le titre du §9 et sortent de son tableau** : elles sont vérifiées nulle
part, et rien ne dit lesquelles.

**2. La vérification existe, la trace non.** Le §8 refuse explicitement de les livrer _et_
de les revérifier (« Sept vérifications ont pris le tiers d'un chantier »). Le §9, ajouté le
même jour, annonce qu'elles ont toutes été vérifiées dans le code par quatre lectures
indépendantes — mais ne publie que des **agrégats** (41 LIVRÉ / 64 PARTIEL / 32 ABSENT).
Aucun verdict par item n'existe nulle part. Le document qui reproche aux trackers de
« garder la loi et jeter ses conditions d'application » finit en gardant les totaux et en
jetant les items.

**3. La seule équivalence du §9 que j'ai pu tester de bout en bout est FAUSSE.**
Le §9 range parmi les « huit items du PDF 2 annoncés manquants [qui] existaient sous un
autre nom » : « `need-status.test.ts` pour les vingt cas de `deriveWorkPhase` ».
Mesuré dans le dépôt (`grep -rl` sur `apps/` + `packages/`, hors worktrees) :

- `deriveWorkPhase` : **0 fichier**, sauf une citation dans `packages/contracts/src/schemas/doctrine-registry.ts`
- `isPhaseValidForStatus` : **0 fichier**
- `need-status.test.ts` existe et teste `PROJECT_NEED_STATUSES` — les **onze statuts EN BASE**

Ce n'est pas le même objet, et ce n'est pas un oubli : c'est un **refus**, écrit le
lendemain. `doctrine-registry.ts` porte `c27_phase_de_travail` : « L'état d'un besoin est
EN BASE, jamais dérivé… une phase calculée à côté des onze états créerait deux vérités »,
avec en commentaire « `deriveWorkPhase` … introuvable dans le dépôt (mesuré le 26/08) ».
L'exigence n'a donc pas été retrouvée sous un autre nom : elle a été **écartée**, et le
tracker la compte comme récupérée. C'est le motif « A EST B dispense de lire ».

**4. Les défauts que le §9 a réellement corrigés sont réels.** PR #1075 : `COALESCE(SUM,0)`
sur les quatre CA (« Encaissé : 0 € » partout), `billing_cadence` ignorée, le `else` final de
`summarizeReadiness`, `truncated` calculé jamais rendu, `reactivate()` sans lecture du
consentement, `priority_gate` nulle en démo. Six défauts d'honnêteté, tous du bon genre. La
passe de code a produit de la valeur ; c'est la passe de **traçabilité** qui n'a pas eu lieu.

**5. Les comptes que le tracker a lui-même signalés n'ont pas été corrigés.**
Sur les sept « ⚠️ comptes signalés » du §7, quatre appartiennent aux trackers (donc
corrigeables) et **aucun ne l'a été** — mesuré aujourd'hui sur les fichiers du dépôt :

| Signalé par `archive-02`                                        | État aujourd'hui                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| « 10 indicateurs au §13.3 là où le tracker dit **douze** »      | `pdf3-…md` item 202 dit toujours « **Douze** indicateurs » (la source en compte **10**)                 |
| « les **18 KPI** là où la liste en fait **17** »                | `pdf5-…md` item 218 dit toujours « Les **18 KPI** » (la source en compte **17**)                        |
| « le §7.3 compte 26 lignes pour 30 champs, le tracker dit ~28 » | `pdf2-…md` item 120 dit toujours « Les **~28** champs »                                                 |
| « Les 9 premiers onglets porte les numéros 36 à 46 »            | `pdf2-…md` porte toujours `36-46` — onze numéros pour neuf objets, et tout l'inventaire décale derrière |

---

#### Renvois morts, contradictions, blocs non éclatés, comptes faux

**Renvois morts.** Balayage complet des références internes `§x.y` des quatre sources
(62 + 45 + 45 + 47 sections indexées) : **un seul** renvoi mort, `pdf4.md:559` → « 6 tests
nommés au §17.1 », section inexistante. Déjà trouvé et documenté par `archive-02` §5.
**Rien à ajouter — ce point du tracker est juste, et je le confirme.**

**Contradictions résolues en silence.**

- **C1 — dans la source, jamais relevée.** `pdf2.md:371` donne au champ `status` d'un besoin
  « enum (**11 valeurs**, §7.4) » ; `pdf2.md:380`, dans le §7.4 auquel il renvoie, tranche
  « **conserver les 4 statuts en base** et ajouter une phase de travail dérivée ». Le tableau
  des champs contredit la résolution qu'il cite. Aucun des cinq documents ne le note.
- **C2 — dans le dépôt, résolue et jamais réconciliée.** La conséquence de C1 : le prompt de
  `BEL-CRM-101` pose un **INTERDIT** explicite — « NE MODIFIE PAS l'enum `status` (4 valeurs) »
  (`pdf2.md:813`) et « Interdits : ajouter des valeurs à l'enum `status` » (`pdf2.md:826`).
  Louis a tranché D13 le 19/08 dans l'autre sens : « **11 statuts EN BASE** ». L'arbitrage est
  bon et il est écrit — dans le tracker PDF 2 §4, puis dans `c27_phase_de_travail` le 26/08.
  Mais `archive-02`, écrite entre les deux, compte l'exigence contraire comme **livrée**
  (voir §3 ci-dessus). Un lecteur qui n'ouvre que l'archive conclut que `deriveWorkPhase`
  existe.

**Comptes faux d'`archive-02` — dont un corrigé PAR un autre compte faux.**

| #   | Ligne du tracker                                                                            | Ce que dit la matière                                                                                                                                                                                                                                                                                                                                                                                                            | Gravité                                                                                    |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| N1  | §5 : « `pdf5-missions-cra` §0 annonçait « D31 à D35 » ; **son tableau va jusqu'à D36** ✅ » | Le §4 du tracker PDF 5 porte **sept** lignes : **D31, D32, D33, D34, D35, D36, D37**. La correction a été appliquée (le tracker dit maintenant « renumérotées **D31 à D36** ») et **elle est encore fausse**. Un compte faux corrigé par un compte faux, avec une coche verte.                                                                                                                                                   | **haute** — c'est le mécanisme même que l'archive dénonce, appliqué à sa propre correction |
| N2  | §1, table d'intégrité : « **Les 24 tickets `BEL-*`** des quatre sources → **24 cités** »    | Les quatre sources définissent **22 tickets** : 6 `BEL-CRM-10x`, 5 `BEL-ATS-20x`, 5 `BEL-MTC-30x`, 6 `BEL-MIS-4xx`/`BEL-FIN-4xx`. `BEL-ARCH-002` et `BEL-ARCH-004` ne sont pas des tickets de cette archive : ce sont des **dépendances déclarées** vers le PDF 1 (`pdf2.md:904`, `pdf4.md:561`, `pdf5.md:556`, `pdf5.md:619`). Une référence dérivée comptée comme item indépendant — dans une ligne « mesurée, pas supposée ». | moyenne — le verdict (« aucune dérive ») tient, le compte non                              |
| N3  | §7, en-têtes de sections                                                                    | 40 / 40 / 17 / 30 annoncés pour 46 / 40 / 18 / 35 réels                                                                                                                                                                                                                                                                                                                                                                          | voir ci-dessus                                                                             |
| N4  | §9, titre vs tableau                                                                        | 139 vs 137                                                                                                                                                                                                                                                                                                                                                                                                                       | voir ci-dessus                                                                             |

**Ce que j'ai vérifié et qui est JUSTE** — à dire, parce que la moitié de la valeur d'une
passe B est de ne pas casser ce qui tient :

- 23 fichiers sur disque, **21 au manifeste** ✔ (les deux hors manifeste sont bien le `.csv` et son `.md`).
- **73 routes web** ✔ — et 73 / 73 encore présentes aujourd'hui (82 au total, 9 ajoutées depuis).
- **« 100 modules d'API »** ✔ — `api_modules.txt` porte **104 lignes**, et j'ai failli appeler
  le compte faux : ce sont **100 répertoires** distincts (`credits` en porte 3, `esn-profile`
  et `notifications` 2 chacun). Aucun disparu, 107 aujourd'hui. Le tracker a compté juste.
- **« 9 miroirs identiques »** ✔ au 25/08. Aujourd'hui `pdf2` et `pdf5` sont encore
  byte-identiques ; `pdf3` et `pdf4` ont divergé — et les diffs sont exactement les
  corrections que l'archive a demandées (« Seize filtres », « sept décisions », le recomptage
  des six marqueurs du PDF 4, le statut `D4 Séniorité` corrigé le 27/08). La divergence est
  la **preuve** que la correction est partie, pas une dérive.
- **Le renvoi mort `§17.1`** ✔, et c'est le seul des quatre sources.

**Blocs non éclatés.**

- **`pdf5 §12`** : 24 lignes × 5 colonnes → **1 ligne** de tracker PDF 5, **0** dans `archive-02`. Le plus gros bloc de l'archive, le seul à zéro.
- **PDF 4 dans son ensemble** : 686 lignes, 27 tableaux, 176 lignes de données → **18 items**
  au §7.4 et **18 items** au §9, dont seulement **2 ABSENT**. Deux absences pour 176 lignes,
  sur le module qui porte l'Annexe III de l'AI Act, l'obligation d'explication de l'article 86
  et une liste d'exclusion déclarée « exigence de conformité ». Comparé aux 46 items du PDF 2,
  ce n'est pas une lecture plus favorable, c'est une lecture plus rapide.
- **`pdf5 §8.2`, les 8 bloqueurs** : `archive-02` ne nomme aucun des huit et ne reprend pas
  leur colonne « Action proposée », ni le critère de `BEL-FIN-403` « aucun montant en _prêt_
  avec un bloqueur ouvert ». Le tracker PDF 5, lui, les tient (7 puis 10 en code). La source
  en demande **8** ; c'est la troisième liste incompatible du projet, et **c'est celle-là qui
  fait foi pour cette archive** — elle ajoute « contact facturation inconnu », « mission sans
  date de début » et « litige ouvert », et retire les deux bloqueurs propres au code.

---

#### Verdict : le `DONE` est-il défendable ?

**Non — mais de justesse, et pas pour la raison qu'on attendrait.**

Ce tracker est le meilleur des trackers de cette itération : il mesure au lieu de supposer,
il nomme son propre défaut, il réfute quatre de ses propres alertes, il a produit six
corrections de code réelles, et cinq des six comptes que j'ai testés dans sa table
d'intégrité sont exacts. Ce n'est pas un document qu'on rouvre parce qu'il ment.

On le rouvre pour trois raisons, dans l'ordre :

1. **Le défaut qu'il nomme, il le commet — sur la plus grosse table de l'archive.** Les 24
   automatisations `MIS-*` / `FIN-*`, leurs niveaux d'autonomie (dont deux **N5**, c'est-à-dire
   _qui envoient seules_) et leurs 24 garde-fous n'apparaissent dans **aucun** des cinq
   documents autrement que comme le nombre « 24 ». Trois tables d'automatisations sur quatre
   ont leur ligne au §7 ; la quatrième, non. Marquer `DONE` promet que personne ne rouvrira :
   ce bloc-là serait perdu pour toujours, avec « jamais d'émission » et « jamais sur donnée
   absente » dedans.

2. **Sa vérification n'est pas auditable, et l'échantillon que j'ai pu tester est faux.**
   Quatre comptes différents pour un même ensemble (120 / 127 / 137 / 139), deux exigences du
   PDF 2 qui sortent du tableau sans qu'on sache lesquelles, aucun verdict par item — et la
   seule équivalence testable de bout en bout (`deriveWorkPhase` ↔ `need-status.test.ts`) est
   contredite par une entrée de doctrine écrite le lendemain.

3. **Il a signalé quatre comptes faux dans les trackers et n'en a corrigé aucun ; le
   cinquième, il l'a corrigé faux.** « Douze indicateurs » pour 10, « 18 KPI » pour 17,
   « ~28 champs » pour 30, « 36 à 46 » pour neuf onglets — tous encore là aujourd'hui. Et
   « D31 à D36 » pour un tableau qui va à D37.

**Ce qu'il faudrait pour que le `DONE` tienne** — trois choses, aucune n'est du code :

- réinjecter le tableau `pdf5 §12` complet (24 IDs, niveau, garde-fou) dans le tracker PDF 5,
  et vérifier séparément les six lignes de la colonne « trou n°1 » ci-dessus ;
- publier les 139 verdicts item par item, ou renoncer à la phrase « vérifiées dans le code » ;
- appliquer les cinq corrections de compte déjà signalées, et recompter D31…**D37**.

Tant que ces trois-là ne sont pas faites, `DONE` ne veut pas dire « épuisé » : il veut dire
« bien lu, mal classé ».
