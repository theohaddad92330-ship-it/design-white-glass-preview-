# Reprise — les retours du 06/09/2026 (mémoire marché + back-office)

> Journal de lot. Ce fichier est le seul état qui survit à un `/clear` : ce qui
> n'y est pas écrit est perdu.

## Le corpus, tel qu'il est vraiment

**102 issues ouvertes au 06/09/2026 — et ce ne sont pas 102 retours.** Ce sont
**deux documents** découpés par le widget de signalement : leurs titres sont des
en-têtes de section (« CONTEXTE », « CE QUE JE VEUX », « EXISTANT », « ROUTE … »,
« LE PROBLÈME »). C'est le §3 bis du skill `issues` à l'envers — au lieu d'une
issue portant douze demandes, une spec éclatée en quarante-sept issues.

| corpus | issues | sujet |
| ------ | ------ | ----- |
| **Mémoire marché** (produit client) | 55, de #1417 à #1640 | câbler / gouverner / valider la mémoire marché livrée le 06/09 |
| **Back-office** (`apps/dashboard-manager`) | 47, de #1642 à #1688 | refonte complète : rail à 6 sections, module finance MRR, `/revenus`, `/produit`, auth TOTP + RBAC |

⚠️ **Aucune issue ne dépasse le seuil de 3 000 caractères de texte humain** (max
mesuré : 3 334). Trier au volume aurait donc conclu « zéro spec » — c'est le
TITRE qui trahit le découpage, pas la taille.

Zéro issue `beta-client`. Une seule `feedback:bug` (#1623, close).

## Les quatre arbitrages de Louis (06/09, un seul lot de questions)

1. **On commence par la mémoire marché**, pas par le back-office.
2. **#1682 (traceur d'usage) → derrière la porte de consentement**, comme les
   autres. Cohérent avec GA-46 et la décision du 28/08.
3. **#1605 (fusion des preuves ESN) → on garde la SÉPARATION.** La raison est
   déjà écrite dans `observed-esn.ts:8-30`. À livrer à la place : le comptage
   « N parcours observés » par ESN, et le lien entre les deux blocs.
4. **Ordre mémoire marché : résolution d'entité, PUIS câblage.** « Une mauvaise
   jointure est pire qu'une absence de donnée » — câbler 8 écrans avant de
   fiabiliser le rapprochement répandrait un mauvais Thales partout.

## Ce qui est livré et vérifié en production

### Lot 1 — `14c072726` (PR #1695), recetté

`/accounts` et Réglages › Intégrations. Trois défauts, tous mesurés au
`javascript_tool` sur l'écran, avant et après :

| | avant | après |
| --- | --- | --- |
| lignes débordant sur le score | **20 / 25** (pire : 547 px) | **0** |
| entêtes qui se chevauchent | +18 px | **0** |
| largeur de table | 1 220 px dans 1 158 | **1 158 = 1 158** |
| cartes d'intégration avec logo | 0 | **10 / 13**, 3 sur icône, 0 vide |

Gardes : **GA-255** (nouvelle, `shrink-0` + `truncate` sans borne) et **GA-118**
(élargie — elle nommait `/accounts` dans ses exceptions ET sautait
silencieusement les tableaux dont les entêtes vivent ailleurs). D337 close.

Issues closes : **#1623**, **#1614**. Commentées et laissées ouvertes :
**#1417**, **#1440** (bloquées sur #1472).

### Lot 2 — PR #1696, en CI au moment d'écrire

`#1617` — la résolution d'entité. `findOne` sur des index NON UNIQUES choisissait
au hasard, et les deux chemins de lecture choisissaient **différemment**.

Livré : arbitre unique, quatre états (`resolved`/`ambiguous`/`unresolved`/
`unavailable`), départage par `registry_country`, golden tests dans les deux sens.
Reformulé et dit dans l'issue : la hiérarchie à 5 échelons (le corpus n'a ni
SIREN ni registre ni LinkedIn), « domaine > nom » comme ordre fixe (contredit par
la production), `manual_override` (décision produit : donnée partagée entre
concurrents).

**Trouvé sans que personne le demande** : `IMPORTABLE_FILES`, la liste qui exclut
les fichiers à données personnelles, n'était lue par aucune ligne de code.

## Le lot suivant — le CÂBLAGE (arbitrage n°4)

Mesuré : sur les 9 pages du dossier de compte, **une seule** lit la mémoire
marché (`partners.service.ts:120`). Les huit autres ont **zéro occurrence**.

Ordre suggéré, du plus prouvé au plus incertain :

1. **#1607.2** — `TabOverview` : `sections/Technologies.tsx` est du **code mort**
   (0 importeur, vérifié) ; la vraie cible est `CompanyPublicDataSection.tsx:65`
   → `TechStackCard`, dont `mergeTechStack` ne connaît que 3 sources. La 4e
   (`observedStack`) est prête côté service.
2. **#1610** `TabCoverage`, **#1612/#1638** `TabProofs`, **#1608** `TabSites`,
   **#1609** `TabContacts` — chacun a son point d'ancrage identifié.
3. **#1617.3** — l'écran « Résolutions Market Memory à revoir » dans Qualité des
   données. La donnée existe depuis le lot 2 ; elle n'est lue que par le journal.
4. **#1605** — le comptage par ESN et le lien entre les deux blocs (décision 3).

⚠️ **PÉRIMÉS, ne pas recoder** : **#1606.1** et **#1631** demandent la
persistance de `raw_analysis.addressability`, livrée le jour même par
`b949638d5` (`phase1_research.py:1518`). Seuls les volets PATH et RELATION
restent à faire.

⚠️ **#1604** annonce « ~15 onglets » : il y en a **14** (`AccountDetailTabsBar.tsx:4-36`).

## Le back-office (47 issues), quand son tour viendra

Le rapport d'état des lieux est complet : reconstitution du document, garde-fous
verbatim, tableau route par route, découpage en 9 lots. Deux points à retenir :

- **La sécurité (#1668-#1671) est le seul morceau qui soit un RISQUE et pas une
  refonte** : Basic Auth partagé à trois personnes, aucun rôle, motif
  d'impersonation en texte libre.
- **#1682 est conditionné** par l'arbitrage n°2 : le traceur passe derrière la
  porte de consentement, ce qui demande d'abord une bannière sur cette app.
  Les 8 pages d'analytics produit (#1683-#1688, #1657, #1658) en dépendent.

## Ce qui reste en attente d'une réponse de Louis

- **#1472** — « désigne-moi un écran du produit dont la densité te convient ».
  Il bloque #1417 et #1440. Ouvert depuis le 03/09.
- **#1623** — deux questions posées à la clôture : faut-il faire céder l'effectif
  avant le secteur sur une ligne chargée ? et faut-il corriger le champ
  « effectif » côté analyse (il contient parfois une phrase entière) ?

## Piège d'outillage payé dans ce lot

`MEMORY.md` **dépasse sa limite de chargement** (25,9 Ko pour 24,4) : sa fin —
« Chantiers clos » et « Historique » — n'est pas lue. Compressée de 712 octets
sans perdre un lien (300, inchangé) ; il en faudrait ~1,5 Ko de plus.
