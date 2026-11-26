# Les 27 maquettes des 3 zips — chantier du 31/08/2026

**Demande de Louis, 31/08 :** « intégrer toutes les maquettes des zip de manière cohérente ou ajouter
les écrans qui manquent, les modifier » — « concentre toi sur toutes les maquettes présentes, sur les
3 zip il me faut tout » — « enlève même les trucs refusés si c'est dans la maquette, feu » — « si tu
as une garde tu me dis et au pire je la fais sauter mais je veux toutes les maquettes ».

**Base :** `origin/main` à `16474c757`. **Mode : SOLO** — aucune demande de permission, les décisions
se parquent au §6.

---

## 0. Le corpus — ce que contiennent RÉELLEMENT les 3 zips

Les trois archives nommées par Louis sont les dossiers Drive datés : **Lundi 24 août**, **Mercredi 26
août**, **Jeudi 27 août**. Le balayage `find -type f -iname "*.png|jpg|jpeg|webp"` sur
`agent_docs/sources/` rend **27 maquettes**. Les 6 autres images du dossier (captures Langfuse, grille
tarifaire, contexte bêta, diagrammes legacy) sont des **références produit, pas des maquettes** —
exclues nommément.

| Famille                                 | Nombre | Chemin                                            |
| --------------------------------------- | -----: | ------------------------------------------------- |
| **Les 17 écrans cibles**                | **17** | `dossier-26-aout/images-produit-cible/`           |
| **Organigramme — cible + alternatives** |  **4** | `jeudi-27-aout/27-aout-v3/maquette-organigramme/` |
| **ORGGRAPH — les 6 vues**               |  **6** | `jeudi-27-aout/jeudi-27-aout/`                    |

⚠️ `jeudi-27-aout/27-aout-v3/images-produit-cible/` est un doublon **octet pour octet** des 17 écrans
cibles du 26 août — **vérifié par `md5`, pas supposé**. Pas recompté.

La fiche de lecture des 17 est `dossier-26-aout/PDF-22_Annexe_les-17-ecrans-cibles.txt` (256 lignes,
une fiche par écran : « À garder » / « À jeter » / « Piège »). Elle a été recomptée au grain de la
puce le 29/08 — **92 exigences, 45 closes** — dans `agent_docs/dossier-26-aout-2026.md`, section « Le
recomptage de clôture de PDF-22 ». **Ce tracker ne la recompte pas** : il reprend ses statuts, les
re-vérifie contre le code d'aujourd'hui, et livre.

⚠️ **Le recomptage du 29/08 est PÉRIMÉ sur plusieurs points** — deux jours de commits l'ont dépassé.
Mesuré aujourd'hui, écran par écran :

| Ce que le tracker du 29/08 disait                       | Ce qui est vrai le 31/08                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fiche besoin : « aucun onglet »                         | **4 onglets** depuis le 30/08 (`0b4ae9e13`) — `NeedDetailPage.tsx:178-187`                                      |
| « zéro occurrence de `expense` »                        | **`mission_expenses` livré** le 30/08 — migration `1790900000003`, `ExpensesSection` montée                     |
| Facture entrante sous-traitant : ABSENT                 | **`supplier_invoices` livré** le 30/08 — migration `1790900000004`, endpoints `…/supplier-invoices`             |
| `/missions/planification` : 0 occurrence                | **Écran livré** le 29/08 — `PlanningPage.tsx`, 554 lignes, frise + ligne « aujourd'hui »                        |
| « 0 occurrence de `CreateNeed` »                        | **`CreateNeedDialog.tsx` existe** depuis le 30/08 (`5fbde6df7`) — 2 champs, pas l'assistant                     |
| D135 « garder le montant du pipe derrière `finance` »   | **Examiné et REJETÉ le lendemain** (`d38fcc154`), inscrit au registre `c53_montant_du_pipe`, tenu par une garde |
| Organigramme : planificateur « introuvable, code mort » | **Rendu atteignable** dans les 22 dernières heures (`06e67cd82`, `244209f1e`)                                   |

---

## 1. Les décisions de Louis du 31/08 — les revirements, datés

Louis a **lu chaque refus** et l'a levé ou confirmé. Chacun se réécrit au registre de doctrine avec
sa trace : **une décision qui change garde son historique**, elle ne s'efface pas.

| Sujet                                                                                | Refus antérieur                                                 | Décision du 31/08                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Notes de frais**                                                                   | D9 · 26/08 — « une ligne sur la mission, pas un domaine »       | **LEVÉ — domaine complet** (barèmes, TVA récupérable, conservation, politique par client) |
| **Cession / affacturage**                                                            | `c29_affacturage` — « Bellum ne touche jamais au financement »  | **LEVÉ — domaine complet** (objet, contrat factor, commission, encours, réconciliation)   |
| **Taux de réussite estimé 72 %**                                                     | `c26_probabilite` — refusé 6 à 9 fois                           | **LEVÉ — affiché tel quel**                                                               |
| **Montant du pipe**                                                                  | `c53_montant_du_pipe` (30/08) — « PAS sous droit financier »    | **RETOURNÉ — derrière le droit finance**                                                  |
| **Écran `/missions/suivi`**                                                          | D-22-2 · 29/08 — rayé, avec sa mesure                           | **LEVÉ — l'écran est construit**                                                          |
| **Objectif de marge / anneau**                                                       | D7 · 26/08 — « une couleur d'alerte sans seuil »                | **LEVÉ — objectif SAISISSABLE par espace**                                                |
| **Bandeau « activité récente » sur Finance**                                         | `FinanceScreen.tsx:60-61` — « un journal ne fait rien décider » | **LEVÉ — livré**                                                                          |
| **Ligne composée « = Marge Crème »**                                                 | `FinanceScreen.tsx:85-87` — « une ligne se calcule »            | **LEVÉ — livrée, avec nos libellés, pas ceux du concurrent**                              |
| **ADV**                                                                              | jamais posé                                                     | **LIVRÉ — domaine complet**                                                               |
| **Paiement sortant vers le consultant**                                              | jamais posé (trou G-02)                                         | **LIVRÉ — en SUIVI, pas en déclenchement**                                                |
| **Historisation / deltas**                                                           | D2 · 26/08 — ouverte                                            | **LIVRÉ — photo mensuelle**                                                               |
| **Émission de facture** (n° FAC-, brouillon)                                         | `c17_facturation`                                               | **CONFIRMÉ REFUSÉ** — Bellum s'arrête à la préparation                                    |
| **Ordre de virement / IBAN stocké**                                                  | 3 occurrences écrites                                           | **CONFIRMÉ REFUSÉ** — Louis a choisi le suivi, pas le déclenchement                       |
| **« Scrapers » (variante 16)**                                                       | refus permanent — le produit ne se fait passer pour personne    | **NON REPRIS** — hors périmètre des maquettes fonctionnelles                              |
| **Critères protégés dans un classement**                                             | `c58_criteres_proteges` (EU AI Act annexe III)                  | **TENU** — la photo s'affiche, elle n'ordonne jamais des personnes                        |
| **Vocabulaire du concurrent** (Belloom, Organisations, Octo, Marge Crème, Freelance) | l'annexe le dit fausse dès sa page 1                            | **NON REPRIS** — le produit dit Bellum, Comptes, consultant                               |

---

## 2. Le manifeste de dispatch — vagues 1 et 2, 12 agents

Périmètres disjoints, worktrees isolés, **horodatages de migration réservés** (quatre collisions le
30/08 sur ce point : à égalité de préfixe, TypeORM ordonne selon la lecture du répertoire, donc une
table peut se créer après la migration censée la remplir — un déploiement qui passe une fois sur deux).

| #   | Lot                         | Branche                                  | Périmètre principal                                                      | Horodatages réservés  | Modèle |
| --- | --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ | --------------------- | ------ |
| 1   | Notes de frais (domaine)    | `feat/ndf-notes-de-frais`                | `api/modules/expenses`, `web/features/expenses`                          | `1790970000001`…`009` | opus   |
| 2   | Cession / affacturage       | `feat/cession-affacturage`               | `api/modules/factoring`, `web/features/factoring`                        | `1790971000001`…`009` | opus   |
| 3   | Organisations / entités     | `feat/organisations-entites-facturation` | `web/features/accounts`, `api/modules/account-entities`                  | `1790972000001`…`009` | opus   |
| 4   | Vivier                      | `feat/vivier-maquette`                   | `web/features/consultants`, `api/modules/consultants`                    | `1790973000001`…`009` | sonnet |
| 5   | Fiche besoin                | `feat/fiche-besoin-maquette`             | `web/features/projects/open-needs/view/NeedDetail*`                      | `1790974000001`…`009` | sonnet |
| 6   | Kanban + assistant besoin   | `feat/kanban-et-assistant-besoin`        | `NeedsKanban`, `OpenNeedsPage`, `CreateNeedDialog`, `schemas/project.ts` | `1790975000001`…`009` | sonnet |
| 7   | Photo mensuelle (FONDATION) | `feat/photo-mensuelle-historisation`     | `api/modules/metric-snapshots`                                           | `1790976000001`…`009` | opus   |
| 8   | Écran Facturation           | `feat/facturation-maquette`              | `InvoicingPage`, `InvoiceReadinessPanel`, `missions/api.ts`              | `1790977000001`…`009` | sonnet |
| 9   | Paiements sortants          | `feat/paiements-sortants`                | `api/modules/payments`, `web/features/payments`                          | `1790978000001`…`009` | opus   |
| 10  | ADV                         | `feat/adv-administration-des-ventes`     | `api/modules/adv`, `web/features/adv`                                    | `1790979000001`…`009` | opus   |
| 11  | Écran Suivi                 | `feat/ecran-suivi-missions`              | `web/features/mission-tracking`, **+ `sections.ts` (seul autorisé)**     | `1790980000001`…`009` | sonnet |
| 12  | Planification (panneau)     | `feat/planification-panneau-detail`      | `PlanningPage`, `MissionDetailSheet`, `schemas/mission.ts`               | `1790981000001`…`009` | sonnet |
| 13  | Export PDF organigramme     | `feat/export-pdf-organigramme`           | `web/lib/account-pdf`, `web/features/contacts`                           | — (aucune migration)  | sonnet |

**Reste à dispatcher (vague 3, après le lot 7)** : le tableau de bord Finance (écrans 09 à 17) —
infobulles, deltas, liens « voir le détail », filtre par société / BU, export, anneau d'objectif
saisissable, bandeau d'activité récente, ligne composée, et les couleurs du relevé réduites à trois.
Il **consomme** la photo mensuelle : un lot de fondation ne part jamais en même temps qu'un lot qui
la consomme.

### Ce que je garde pour l'intégration — jamais délégué

La fusion des branches, l'arbitrage des conflits (ils se concentrent sur `packages/contracts`, les
fichiers i18n, `demo-*.ts` et le changelog — c'est prévu), l'ouverture des PR, le clic dans Chrome, et
**la passe « ce que l'agent a laissé à la frontière »** : sur une vague de trente lots le 30/08, huit
ont livré du travail juste qui ne servait à rien tant que l'intégrateur n'avait pas posé le câble.
C'est la conséquence mécanique du « NE TOUCHE À AUCUN AUTRE FICHIER » qui rend l'écriture concurrente
possible. Les câbles connus d'avance, à poser :

- les entrées `sections.ts` des routes neuves (`/expenses`, `/missions/cessions`, `/missions/paiements`, `/missions/adv`) ;
- la colonne « Cession » dans l'écran des paiements sortants ;
- le motif KYC dans l'énumération ADV ;
- le branchement du delta mensuel dans les quatre écrans qui l'affichent ;
- les pastilles de qualité ADV au-dessus de la liste de planification.

---

## 3. Inventaire — statut par maquette

### Les 17 écrans cibles

| #   | Écran                               | État au 31/08 avant chantier      | Lot   |
| --- | ----------------------------------- | --------------------------------- | ----- |
| 01  | Vivier                              | PARTIEL                           | 4     |
| 02  | Fiche besoin                        | PARTIEL (4 onglets sur 6)         | 5     |
| 03  | Suivi, facturation, automatisations | ABSENT (était rayé)               | 11    |
| 04  | Kanban des besoins                  | PARTIEL                           | 6     |
| 05  | Notes de frais                      | ABSENT (domaine était refusé)     | 1     |
| 06  | Facturation                         | PARTIEL                           | 8     |
| 07  | Planification des missions          | PARTIEL (frise livrée 29/08)      | 12    |
| 08  | Créer un besoin                     | PARTIEL (dialogue à 2 champs)     | 6     |
| 09  | Finance v1                          | LIVRÉ                             | —     |
| 10  | Finance v2                          | PARTIEL                           | 14    |
| 11  | Comptes vus par le delivery         | PARTIEL                           | 3     |
| 12  | Encaissements                       | LIVRÉ côté client, sortant ABSENT | 9 + 2 |
| 13  | Finance v3                          | LIVRÉ                             | —     |
| 14  | Finance v4                          | LIVRÉ                             | —     |
| 15  | Finance v5                          | LIVRÉ                             | —     |
| 16  | Finance v6                          | PARTIEL (couleurs du relevé)      | 14    |
| 17  | Finance v7                          | LIVRÉ                             | —     |

### Les 10 maquettes d'organigramme

| Maquette                          | État                                          | Lot |
| --------------------------------- | --------------------------------------------- | --- |
| 01 vue focale hiérarchie          | LIVRÉ                                         | —   |
| 02 vue système groupe             | LIVRÉ                                         | —   |
| 03 tous contacts couverture       | PARTIEL — 1 filtre sur 3                      | 13  |
| 04 correction personne + preuves  | LIVRÉ (30/08)                                 | —   |
| 05 planificateur d'enrichissement | LIVRÉ (31/08, rendu atteignable ce matin)     | —   |
| 06 export PDF organigramme        | **ABSENT** — la seule totalement absente      | 13  |
| cible SNCF-RÉSEAU                 | LIVRÉ en substance (L0-L4 au lieu de 3 rangs) | —   |
| alternative GPT 01 vue groupe     | REFUSÉ par décision produit documentée        | —   |
| alternative GPT 02 vue entité     | REFUSÉ (rail Achats, 8 rôles bruts)           | —   |
| alternative GPT 03 mode édition   | REFUSÉ (glisser-déposer, décision 7)          | —   |

---

## 4. Ce qu'on ne promet pas — même après « feu sur tout »

Trois refus survivent parce que Louis les a lui-même confirmés le 31/08, et deux parce qu'ils ne
relèvent pas d'un arbitrage produit :

1. **L'émission de facture** — pas de numérotation légale, pas de brouillon de facture client.
   Confirmé par Louis. La référence reste saisie à la main au retour de l'outil comptable.
2. **L'ordre de virement et le stockage d'IBAN** — confirmé par Louis : suivi, pas déclenchement.
   Conséquence : le motif ADV « RIB manquant » devient « coordonnées de règlement non transmises »,
   un ÉTAT sans le numéro.
3. **« Scrapers »** — le produit ne se fait passer pour personne. Aucun libellé ne le réintroduit.
4. **Les critères protégés dans un classement** — une photo s'affiche sur une fiche, elle n'ordonne
   jamais des personnes (EU AI Act annexe III, et le droit des données personnelles suffirait).
   L'interdit porte sur le PROMPT autant que sur le code.
5. **Le vocabulaire du concurrent** — l'annexe elle-même dit, dès sa page 1, que le nom du produit
   (« Belloom »), les logos, tous les chiffres, tous les noms et le vocabulaire (« Octo », « Marge
   Crème », « Organisations », « Freelance ») sont **faux dans toutes les images**. On dit Bellum,
   Comptes, consultant.

---

## 9. Comment reprendre dans une session neuve

_Réécrit à chaque vague. Un §9 périmé est pire qu'absent : il envoie une session
neuve refaire des lots livrés et reposer des décisions déjà prises._

### Ce qui est TRANCHÉ — ne le repose pas

Les 16 décisions du §1, toutes du 31/08/2026, toutes prises par Louis **après**
lecture du refus antérieur. Si une garde ou une entrée du registre de doctrine
dit encore l'inverse, c'est qu'un lot n'a pas fini de réécrire sa trace : la
référence est le §1, pas le code.

### Ce qui est MERGÉ dans `integration/maquettes-31-aout` — pas encore en prod

Douze lots sur treize, 291 fichiers, +32 379 / −1 328, **zéro collision
d'horodatage de migration** (seul le doublon préexistant `1783000000000`
subsiste). Branche de base : `origin/main` à `16474c757`.

| Lot                     | Branche                                  | Ce qu'il porte                                                                        |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Organisations / entités | `feat/organisations-entites-facturation` | lentille facturation sur `/accounts`, 5 bloqueurs nommés, SIREN + payeur sur la ligne |
| Cession / affacturage   | `feat/cession-affacturage`               | domaine complet, contrat factor, réconciliation, `/missions/cessions`                 |
| Photo mensuelle         | `feat/photo-mensuelle-historisation`     | ÉTEND `stock_snapshots`, 7 métriques gagnent leur dénominateur, `metricDelta`         |
| Notes de frais          | `feat/ndf-notes-de-frais`                | domaine complet, barème, TVA, conservation, `/expenses`                               |
| Écran Suivi             | `feat/ecran-suivi-missions`              | D-22-2 levée, la table fusionnée, « sans objet » ≠ « à faire » ≠ « non mesuré »       |
| Vivier                  | `feat/vivier-maquette`                   | tiroir complet, favoris talents, complétude décomposée, photo non classante           |
| Export PDF organigramme | `feat/export-pdf-organigramme`           | la page dédiée du PDF + 2 filtres sur l'onglet Contacts                               |
| Écran Facturation       | `feat/facturation-maquette`              | compteurs par valeur, actions de masse, tableau, facture fournisseur                  |
| Paiements sortants      | `feat/paiements-sortants`                | l'objet et l'écran de l'argent qui SORT, `/missions/paiements`                        |
| Fiche besoin            | `feat/fiche-besoin-maquette`             | six onglets, bandeau Staffing, étapes, documents, taux de réussite                    |
| Kanban + assistant      | `feat/kanban-et-assistant-besoin`        | pipe derrière le droit finance, rail Laura, assistant 4 étapes                        |
| Planification           | `feat/planification-panneau-detail`      | le panneau latéral, les trois contacts, conditions de règlement, impact               |

### Ce qui reste

1. **Le lot ADV** (`feat/adv-administration-des-ventes`) — dernier agent en vol.
2. **Le tableau de bord Finance** (écrans 09-17) — jamais dispatché. Il CONSOMME
   la photo mensuelle, et le contrat de lecture est prêt : `metricDelta` /
   `StockSnapshotService.seriesFor()`.
3. **La PR, la CI, le merge, et la recette live dans Chrome** — balayage ZÉRO
   régression compris, les deux thèmes, le mobile sous 768 px, le mode démo.

### Ce qui n'a JAMAIS pu être vérifié — nommé, jamais compté comme fait

- **Aucune migration n'a tourné contre un vrai Postgres.** Onze lots en ont écrit ;
  toutes sont validées par les gardes statiques (colonnes déclarées, `CHECK`
  additives et couvrant leurs énumérations, index d'espace), **aucune par
  `migration:run`**.
- **Aucune recette navigateur.** Rien n'a été vu à l'écran, dans aucun thème, à
  aucune largeur. Les nouveaux écrans sont couverts par des tests, pas par un œil.
- **Le mode démo est seedé mais jamais ouvert.** Plusieurs lots ont écrit leur
  seed ; personne n'a chargé la salle de démo pour vérifier qu'elle rend.

### Les câbles de frontière — posés, et ceux qui restent

Posés par l'intégrateur (les agents ne pouvaient pas, `sections.ts` et `nav.json`
étant partagés) : les quatre entrées de nav `/expenses`, `/missions/cessions`,
`/missions/paiements` et leurs libellés FR+EN ; le branchement STATIQUE du
namespace i18n `expenses` (l'agent l'enregistrait à l'exécution, donc hors de la
garde de parité) ; le titre de route de `/expenses/`.
**Restent** : la colonne « Cession » dans l'écran des paiements sortants (les deux
points d'ancrage sont commentés en place dans `columns.ts` et `PaymentsPage.tsx`),
le motif KYC dans l'énumération ADV, les pastilles de qualité ADV au-dessus de la
frise de planification (l'emplacement est posé, vide et commenté), et le
branchement du delta mensuel dans les écrans qui l'affichent.

### Les pièges d'outillage de ce poste — ils se repaient à chaque session neuve

- **`ls` nu rend « (empty) » sur un dossier plein** (interception `rtk`). `/bin/ls`.
- **`git diff --stat` rend VIDE**, et `git commit -F` peut tronquer. `/usr/bin/git`
  donne le vrai résultat — mesuré aujourd'hui par deux agents indépendamment.
- **`grep` avec une alternance `\|` échappée rend un FAUX ZÉRO**, et la sortie
  peut être TRONQUÉE à un seul fichier alors que plusieurs matchent. `grep -E`, et
  re-vérifier tout zéro avec une seconde forme avant d'en conclure une absence.
- **`rg` est un shim proxifié** qui a rendu « 0 matches » sur une chaîne qu'un
  agent venait de lire.
- **`agent_docs/sources/` est gitignoré** (`.gitignore:176`) : invisible depuis un
  worktree. Passer les maquettes par leur chemin ABSOLU.
- **Un worktree n'a pas `node_modules`** : chaque agent a dû faire `pnpm install`
  ET construire les paquets d'espace de travail (`@bellum/contracts` en tête, dont
  `main` pointe sur `dist/`) avant qu'un seul test ne s'exécute.
- **Un `dist` de contracts périmé fait échouer des tests qui n'ont rien à voir** —
  `assessAccountBillingReadiness is not a function` sur douze cas, réparé par un
  simple `pnpm --filter @bellum/contracts build`.
- **Le scratchpad de session est PARTAGÉ entre agents** : deux agents ont vu leur
  fichier de message de commit écrasé par un autre. Nommer ces fichiers de façon
  unique.
- **La CI ne se déclenche que sur une `pull_request`.** Un merge direct sur `main`
  ne lance rien.
- **Un merge tue la CI des autres PR en vol.** Vérifier qu'aucune n'est `PENDING`.
- **Capacité CI mesurée le 31/08 à 15 h** : 48 runners en ligne, runs à 2-4 min.

### La leçon de fusion de cette vague — elle a coûté un build

**Le conflit de changelog n'est PAS un « garder les deux côtés ».** Dans les deux
catalogues de libellés, il tombe _à l'intérieur_ de l'objet `entries` : chaque
côté OUVRE une entrée que seule la ligne d'APRÈS le conflit referme. Une union
naïve produit deux ouvertures pour une fermeture, et `tsc` tombe sur un
« '}' expected » à la DERNIÈRE ligne du fichier — très loin de l'endroit fautif.
Puis trois fusions successives ont empilé des conflits IMBRIQUÉS, et une
substitution de commande ratée a laissé partir les marqueurs dans un commit.

Deux outils en sont sortis, dans le scratchpad de session :

- `keep-both.py` — union additive, qui **REFUSE** un côté dont les accolades ne
  s'équilibrent pas (et qui retire les commentaires avant de compter : une
  apostrophe française s'y lit sinon comme une ouverture de chaîne) ;
- `merge-changelog.py` — la vraie résolution : on part de NOTRE côté, déjà
  syntaxiquement valide, et on y insère les entrées que l'AUTRE côté a en plus.
  On ne recolle jamais deux moitiés de bloc.

---

## 10. RÉGLÉ À LA FUSION DE LA VAGUE 3 — collision de numéros de garde

Mesuré le 01/09/2026 sur les 40 branches fraîches. **Quatre gardes réclamaient
`GA-236`.** Chacune avait raison isolément — c'est la concurrence qui crée la
collision. GA-40 la refuse : « un numéro est unique dans son chantier, jamais
globalement ».

⚠️ **La première attribution écrite ici était FAUSSE, et pour une raison qui
mérite d'être retenue : elle reposait sur « le maximum sur `main` est 235 », une
mesure prise AVANT la fusion de la vague 2.** Cette vague-là a porté
`org-drag-uses-the-correction-door.test.ts` sur `main`, avec son `GA-236`. Un
numéro libre le reste rarement pendant qu'on fusionne — **relire `origin/main` au
moment d'attribuer, jamais la note prise deux heures plus tôt.** C'est la même
famille que « un périmètre se décrit contre `origin/main`, jamais contre l'état
d'une branche non mergée ».

Attribution RETENUE ET APPLIQUÉE — l'ancienneté sur `main` garde son numéro,
les trois autres décalent dans l'ordre alphabétique de branche :

| Branche                          | Fichier                                            | Numéro     | État                      |
| -------------------------------- | -------------------------------------------------- | ---------- | ------------------------- |
| _(déjà sur `main`, vague 2)_     | `org-drag-uses-the-correction-door.test.ts`        | **GA-236** | inchangé                  |
| `feat/bulle-laura-partout`       | `laura-turn-single-door.test.ts`                   | **GA-237** | renuméroté (+4 citations) |
| `feat/laura-contextuelle-compte` | `laura-surfaces-are-not-second-assistants.test.ts` | **GA-238** | renuméroté                |
| `fix/garde-action-externe`       | `external-steps-need-a-human.spec.ts`              | **GA-239** | renuméroté                |

Les quatre citations de GA-237 vivent dans du code de PRODUCTION
(`laura-turn.ts`, `Chat.tsx`, `LauraDock.tsx`, `routes/__root.tsx`) : un
renumérotage qui ne les suivrait pas laisserait quatre docblocks pointant une
garde qui parle d'autre chose.

⚠️ **`GA-177` n'est PAS une collision** : il existe déjà sur `main` (la garde des
contraintes CHECK) et les trois branches qui semblaient le réclamer ne font que
le CITER dans un commentaire. La détection qui l'a signalé cherchait `GA-\d+`
dans les lignes ajoutées d'un diff, sans distinguer une déclaration d'une
citation — exactement le défaut de garde trop gourmande corrigé le même jour dans
GA-33. Vérifier ce que la branche FAIT du numéro, jamais qu'elle le mentionne.

---

## 11. REPRENDRE DANS UNE SESSION NEUVE — état au 01/09/2026, 09 h 00

### Ce qui est TRANCHÉ — ne pas reposer ces questions

- **Le dépôt gagne contre une source** quand elle contredit un arbitrage postérieur à sa date (SOL6 du 30/08, archives ITERATION_3 du 24/08, dossiers des 26 et 27 août).
- **Laura garde son nom, et « copilote » reste** le nom commun de la catégorie.
- **Laura a un visage** (D137) : illustration SVG versionnée, jamais une photo ni une personne identifiable générée.
- **Le taux de réussite mesuré de la fiche besoin RESTE** (`c26_probabilite`, exception nommée du 31/08).
- **Le consentement « jamais recueilli » AVERTIT et laisse passer** (`c45`) ; seul l'expiré refuse.
- **`lastVerifiedAt` reste sur l'organigramme**, `c61` passe en `partial`.
- **Le conflit de doctrine `first-move` N'EXISTE PLUS** — re-mesuré sur `main` frais : `first-move.ts:38-52` et `first-move.test.ts:51` disent la MÊME chose (« servi depuis le 23/08, arbitrage de Louis »). L'audit qui le signalait s'était arrêté à la ligne 40, qui RAPPELLE ce que la barrière disait avant. Ne pas rouvrir.
- **La prospection inversée est SEEDÉE en démo** (01/09) : l'interdit « ne jamais insérer de lignes fictives dans `territory_snapshots` » est levé parce que l'objection a été résolue — la colonne `source` sépare `'demo'` de `'sweep'`, et les DEUX lecteurs aiguillent sur `isDemoWorkspace`.

### Ce qui est MERGÉ mais pas encore recetté

**PR #1290 — la vague 2**, fusionnée le 01/09 vers 06 h 15 (`c8c3dccd3`), 23 jobs verts. Premier passage réel du verrou de migration non bloquant.

### Ce qui est POUSSÉ et attend sa CI

- **PR #1292 — la vague 3** : 20 lots, 368 fichiers. Contient ENTIÈREMENT `fix/pdf-verdict-du-silence` (#1289) et `fix/onglet-hors-champ` (#1288) — ces deux PR sont donc redondantes et se ferment en pointant #1292.
- **`integration/vague-4`** : 18 lots de plus, branchée SUR la vague 3. Pas encore poussée à l'heure où ces lignes sont écrites.

### Ce qui n'a JAMAIS pu être vérifié — ne pas le compter comme fait

- **Aucune migration n'a tourné contre un vrai Postgres.**
- **Aucune recette navigateur** sur les 38 lots des vagues 3 et 4.
- **94 pages sur 137 du corpus du 21 août** ne sont pas lues au niveau du contenu.
- Sur les 10 arbitrages du document de croisement : 4 confirmés, 1 infirmé, 5 non vérifiés.

### Ce qui RESTE

- `c61` et D137 attendent la fusion pour entrer au registre de doctrine (GA-38 exige que les chemins existent sur le disque).
- **Remplissage du compte de Louis + recette Chrome**, demandés le 01/09 : à faire APRÈS la fusion des trois PR.
- **Deux questions ouvertes** : les occupants fictifs de la salle de démo doivent-ils être de vrais comptes `auth.users` (sans quoi les croisements de mémoire collective n'y apparaissent pas) ; et le mot « probablement » du sous-titre de Ma matinée, que la doctrine « aucune probabilité » refuse.

### Numéros de garde — l'état APRÈS les deux vagues

`GA-236` org-drag (déjà sur `main`) · `GA-237` bulle Laura · `GA-238` surfaces de Laura · `GA-239` pas externes · `GA-244` états d'écran · `GA-245` section « ce que vous n'emportez pas » · `GA-246` mention IA.
**240 à 243 sont LIBRES** — un balayage antérieur les avait annoncés pris, à tort.

### Les pièges d'outillage — ils se repaient à chaque session

- **`git push … | tail` rend le code de retour de `tail`.** Rediriger, lire `$?`.
- **Le hook `pre-push` lance `prettier --check` sur TOUT le dépôt**, `agent_docs/` compris.
- **`git stash pop` sans argument dépile `stash@{0}`**, qui peut appartenir à un autre chantier.
- **zsh ne découpe PAS un `$var` non quotée en mots.** Une boucle `set -- $paire` reçoit UN argument, la commande échoue, et le test rend « NON » pour une raison qui n'a rien à voir. Trois faux « NON » ce matin.
- **Un argument VIDE en fin de `$(...)` fait sortir un script en 1**, donc le `git add` qui suit ne passe jamais — et la fusion a l'air d'avoir échoué alors qu'elle a réussi. Utiliser `xargs` sur un fichier.
- **Un conflit qui tombe DANS un docblock ou une chaîne concaténée** ne se voit pas à la relecture : garder les deux côtés donne un fichier plausible que `tsc` refuse (66 erreurs en cascade depuis un caractère). Refermer le bloc soi-même, rouvrir `/**`.
- **`routeTree.gen.ts` ne se fusionne PAS** — il se régénère. `cd apps/web && pnpm exec vite build --mode development` le réécrit (pas de script `tsr` dans ce dépôt).
- **Il existe DEUX goldens de prompt** : `prompt_fingerprint.json` (empreinte) et `golden/system/*.txt` (texte). Rebaser l'un laisse l'autre rouge. `UPDATE_PROMPT_GOLDEN=1 apps/ia/.venv/bin/python3 -m pytest tests/test_prompt_golden.py tests/test_prompt_fingerprint.py`.
- **Python du service IA : `.venv/bin/python3`**, jamais le `python3` du système (pas de `fastapi`).
- **Un test qui lit l'horloge locale sans la FIXER** passe à Paris et tombe en CI (UTC).
- **Vitest sort en 1 sans aucun test rouge** quand une erreur non gérée part d'un gestionnaire d'événement. Chercher « Errors N » sous « Tests N passed ».
- **`src/architecture` ne lance PAS `src/styles`.**
