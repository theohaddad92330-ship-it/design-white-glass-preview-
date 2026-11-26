# Statuage du groupe A (PDF-01 → PDF-03) — 28/08/2026

> **116 lignes, 0 sans statut, 0 « à vérifier », 0 « non prouvé ».**
> `A1`–`A28` · `B1`–`B35` · `C1`–`C53`, aucun trou, aucun doublon dans la source.

| statut         | nombre |
| -------------- | -----: |
| ABSENT         |     48 |
| LIVRÉ          |     45 |
| NON PORTEUR    |     12 |
| PÉRIMÉ         |     10 |
| REFUSÉ         |      1 |
| **NON PROUVÉ** |  **0** |
| **À VÉRIFIER** |  **0** |

---

## 1. Le constat qui vaut plus que le décompte

**Les 48 `ABSENT` ne sont pas 48 trous indépendants. Ce sont DEUX chantiers.**

- **19 tombent sur « il n'existe aucune route de fiche besoin »** — C22 à C36 (hors les livrés), C38, C40 à C42. L'en-tête, le bandeau méta, les compétences avec leur source, la timeline typée, les documents, l'onglet Positionnements, les trois messages de Laura : tous décrivent **une fiche qui n'a pas d'adresse**.
- **7 tombent sur « il n'existe aucun assistant de création »** — C43, C44, C47 à C49, plus C6 (le bouton « + Créer un besoin ») et C9. La route serveur existe pourtant : `projects.controller.ts:325`.

⇒ **Deux chantiers, pas vingt-six lignes de backlog.** Et le second est petit : la porte serveur est déjà ouverte, il manque le bouton et le formulaire.

---

## 2. Le backlog fantôme est trois fois pire ici que sur le groupe D

**12 entrées sur 116 — 10,3 % — ne sont pas des exigences** : A16, A24, A26, A27, A28, B4, B13, B27, B35, C1, C27, C46.

Ce sont des règles de méthode de travail (« un chantier gratuit se fait s'il sert la phase en cours »), des inventaires de la source sur elle-même (« 19 images annoncées, 17 reçues », « les 10 préfixes jamais cités »), des mesures de couverture (« la moitié utile de 4 écrans sur 17 »), des justifications de valeur (« le levier de rétention le plus simple du produit »), et des **listes de refus** — B35 et C27 énumèrent ce que la source ne veut PAS, et étaient comptés comme des trous produit.

Sur le groupe D, le backlog fantôme était de 3 %. **Ici il est de 10,3 %.**

---

## 3. ⚠️ `VERIFIE-groupes-A-F.md` n'est plus citable pour ses COMPTES

Quatre défauts mesurés, cumulatifs :

1. **Ses plages sur-déclarent.** `B1–B7, B9, B11–B14` annonce 13, en contient **12**. `B18, B23, B26–B33, B35` annonce 12, en contient **11**. La grande plage `C…` annonce 43, en contient **41**. Total A/B/C : **68 déclarés pour 64 réels**.
2. **Il double-compte** : `C25` et `C38` figurent chacun **deux fois**, une fois en plage et une fois en ligne propre.
3. **Cinq identifiants y portent deux statuts CONTRADICTOIRES** — `C28` et `B12` sont à la fois `NON PROUVÉ` et `ABSENT` ; `C29`, `C34`, `C35` à la fois `ABSENT` et `À VÉRIFIER`. Le résumé se contredit lui-même.
4. **Son total `ABSENT` de 199 est donc faux d'au moins 4** côté A/B/C, avant même toute péremption.

⇒ **Ce fichier reste utile comme piste, jamais comme dénominateur.**

## 3 bis. La péremption, mesurée sur CE groupe : 15 %, pas 28 %

Sur les 80 `ABSENT` A/B/C re-grepés, **12 ne le sont plus** — A5, A14, A18, B2, B3, B5, B12, B18, C13, C14, C15, C28.

Le chiffre annoncé au brief était 28 % ; **la mesure de ce groupe donne 15 %**, et les deux sont écrits plutôt qu'arrondis. En revanche, sur les items du **top-10 « meilleur rapport valeur/effort »** qui tombent dans ce périmètre, **2 sur 3 sont faits (67 %)** — ce qui confirme le motif : _le tri par rentabilité et le tri par péremption sont le même tri._

---

## 4. Ce que la re-vérification a rendu au produit

Huit `ABSENT` de `VERIFIE` sont en réalité livrés, et trois méritent d'être nommés :

- **A14** — les huit contrôles d'hygiène SONT descendus sur les écrans de travail : `HygieneBadge.tsx:88` est monté par `OpenNeedsPage.tsx:300` **et** `ConsultantsPage.tsx:184`. C'était le **n°1 du top-10**.
- **A18** — le secteur appartient bien au travail, pas au compte : `mission.entity.ts:108`, `project.entity.ts:150`, et l'invariant est **gardé** (`sector_belongs_to_the_work`).
- **C14 + C15** — le kebab de ligne et les actions de masse existent, avec **sept gestes** dans un catalogue unique (`need-actions.ts:70-78`), monté deux fois depuis la même source.

---

## 5. Trois refus tenus, avec leur raison écrite DANS le code

Ce groupe montre la bonne façon de tenir un refus — pas par la vigilance, par un texte que le prochain lecteur trouvera :

- **C5, « Exporter »** — `need-actions.ts:186-192` porte `NEED_BULK_ACTIONS_REFUSED.export` : « aucune action de masse ne sort de l'entreprise ». Gardé par test.
- **C13, la couleur de l'âge dans l'étape** — la colonne est livrée, **la couleur est refusée avec sa raison** : la durée type n'est chiffrée nulle part, donc « rouge au-delà » n'a pas de seuil.
- **C8, le « CA potentiel » = tarif × durée** — refus motivé écrit dans `NeedsKanban.tsx:17-28` : ce produit « n'existera jamais ».

---

## 6. Deux pièges d'outillage NEUFS, mesurés pendant cette passe

- ⚠️ **Un HEAD lu une seule fois n'est pas une preuve sur ce poste.** `git rev-parse HEAD && git log -1` a rendu **deux hashes différents dans la même commande** — un autre agent avait mergé pendant l'exécution. Le lire trois fois et vérifier la stabilité.
- ⚠️ **`git status --porcelain` et `ls` rendent la chaîne littérale `ok` avec `rc=0`** sous ce bac à sable. **Ne jamais conclure « arbre propre » depuis `git status` ici.** `find`, `grep`, `cat` et `sed` fonctionnent.

---

## 7. Un signalement pour la passe suivante

**Le registre de doctrine lui-même est un cas `NON PROUVÉ` classique** : `DOCTRINE_REGISTRY` n'a pour importateurs que son propre test. Ce n'est pas un défaut — un registre descriptif a un test pour consommateur légitime — mais il mérite d'être classé explicitement plutôt que découvert une troisième fois.
