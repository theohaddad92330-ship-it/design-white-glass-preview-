# Statuage des groupes E et G — 28/08/2026

> Preuve n°2 du certificat. **71 lignes statuées, 0 sans statut, 0 « à vérifier », 0 « refusé ».**
> Complète `RECONSTRUIT-groupes-D-E.md`, qui laissait 11 incertains hors périmètre — et dont les
> statuts instables ont été ROUVERTS ici plutôt que reportés.

## 1. Le dénombrement

|                                                 | relevées | déjà statuées ailleurs |                         statuées ici |
| ----------------------------------------------- | -------: | ---------------------: | -----------------------------------: |
| `passeB-groupe-E.md` — `E-01`→`E-77`            |       77 |                     77 |                     **17 rouvertes** |
| `passeB-groupe-E.md` — incertains `U-xx`        |       11 |                      0 |                               **11** |
| `passeB-groupe-G-images.md` — `G-01`→`G-30`     |       30 |                  **0** | **30** (31 lignes, `G-14` se scinde) |
| `passeB-groupe-G-images.md` — incertains `U-xx` |       10 |                      0 |                               **10** |
| `passeB-groupe-G-images.md` — contradictions    |        2 |                      0 |                                **2** |
| **Total**                                       |          |                        |                               **71** |

### Décompte, par script

| statut         | nombre |
| -------------- | -----: |
| ABSENT         |     38 |
| LIVRÉ          |     19 |
| DOUBLON        |      5 |
| NON PORTEUR    |      5 |
| PÉRIMÉ         |      2 |
| NON PROUVÉ     |      2 |
| **À VÉRIFIER** |  **0** |
| **REFUSÉ**     |  **0** |

⚠️ **`REFUSÉ` = 0, et c'est un résultat, pas un oubli** : aucune de ces 71 exigences ne heurte la
doctrine. `GU-06` en approche — un badge « Impact Élevé » **nu** tomberait sous « un score n'est
jamais nu » — mais c'est sa FORME qui serait refusée, pas l'exigence.

### Trois comptes faux, écrits plutôt que maquillés

1. `passeB-groupe-E.md` annonce « **66 entrées** ». Les tables en portent **77**. Le résumé de son propre fichier est faux de onze.
2. Les 77 `E-xx` étaient statuées **par un fichier qui se déclare lui-même périmé**. Les 17 items instables ont donc été rouverts : les 5 `NON PROUVÉ` (dont la date était le seul argument) et les 12 `À VÉRIFIER` — qui ne sont pas un statut.
3. **Le groupe images n'était confronté NULLE PART** : aucun fichier du dépôt ne porte ses identifiants. Ses 42 lignes sont statuées ici pour la première fois.

---

## 2. Ce que la réouverture a rendu

Sur les 17 `E-xx` rouvertes : **9 `À VÉRIFIER` deviennent `LIVRÉ`**, 2 `ABSENT`, 1 `DOUBLON` —
**aucune n'était un vrai trou**. Et sur les 5 `NON PROUVÉ`, **2 sont tombés** (`ScoreWithAxes` monté
sur 4 écrans, `Provenance` sur 2) tandis qu'un troisième était **faux dans sa justification** :
`E-49` disait « aucun service déterministe ne lit le portefeuille » — `account-entities.controller.ts:112`
le lit désormais (`offerPortfolio.read()` → `siteFit`).

⚠️ Ce qui reste vrai et qu'il ne faut pas confondre : **`Provenance` ne porte aucun lien de retour à
la source** (`E-30`). La primitive rend `source · date · detail` et rien d'autre. Elle est montée,
mais amputée d'un tiers de son exigence.

---

## 3. Deux `NON PROUVÉ` NEUFS, que personne n'avait relevés

**`resolveRouteAccess` + `ROUTE_ACCESS_STATES`** — `packages/contracts/src/schemas/route-access.ts:25,94`
déclare cinq états d'écran et la fonction qui les résout. Recherche sur tout le dépôt : **deux hits,
son propre test et le baril d'exports**. Et `apps/web/src/components/access/useRouteAccess.ts`
**réimplémente localement**. C'est le défaut n°1 du dépôt sous sa forme la plus pure — sur le
contrat de route lui-même, celui qui décide ce qu'un utilisateur a le droit de voir.

**Le module `legal-entities`** — la table existe, l'entité existe, le chemin d'écriture existe
(`delivery.service.ts:257`), `missions` porte `legal_entity_id`. Et `grep -rn 'legal_entity' apps/web/src`
rend **zéro**. Personne ne le lit. **C'est exactement l'écran « Organisations » que trois maquettes
réclament** : le back-end est là, l'écran manque.

---

## 4. Ce que le groupe images dit, et qu'aucune table ne disait

**38 `ABSENT` sur 42 lignes.** Les maquettes décrivent un **back-office financier** dont le dépôt ne
porte quasiment rien : la cession de créance, le paiement AU freelance et son cycle d'états, le
KYC/RIB comme conditions d'exécution, les devis et NDA avec statut de signature, le filtre « toutes
les BU » côté ESN, le rôle « business manager », la vue calendrier des missions, le sélecteur de
colonnes, le sélecteur de devise, la relance de CRA en masse.

⚠️ **Le « piège des 30 % » NE JOUE PAS ici** : sur 30 écarts d'images, **6 seulement** étaient déjà
livrés. C'est l'inverse des tables de texte, où 28 % des `ABSENT` étaient périmés. La raison est
lisible : une maquette décrit une INTENTION, un document décrit souvent ce qui a déjà été fait.

Quatre écarts méritent d'être nommés parce qu'ils sont **à moitié** livrés :

- **Le sélecteur de devise** : la colonne existe et le serveur la lit — **toute l'interface écrit EUR en dur** (`ProjectNeedsPanel.tsx:37`, `PipelineBoard.tsx:75`, `ProjectAmountControl.tsx:12`).
- **Le mode de travail sur un BESOIN** : livré côté TALENT (`remote_preference`, contraint en SQL, lu par le matching), absent côté besoin.
- **Le matching suggéré** : existe côté COMPTE, pas sur le vivier.
- **La relance de CRA en masse** : le chemin gouverné existe (`POST /mailbox/batch`), il n'est branché sur aucune relance de relevé.

---

## 5. Le piège d'outillage qui a failli tout fausser

L'agent a dû **refaire une passe entière** : `--exclude=*.tsbuildinfo` **non quoté sous zsh** fait
échouer `grep` **en silence** et a rendu **21 faux zéros d'affilée**. Un faux zéro ne ressemble pas à
une panne, il ressemble à une réponse — et vingt-et-un d'affilée auraient produit vingt-et-un
`ABSENT` inventés.

**La parade est le code de sortie** : `rc=1` est un zéro légitime, `rc=2` est un grep qui a planté.
Chaque zéro de ce fichier a été prouvé avec son `rc` lu.
