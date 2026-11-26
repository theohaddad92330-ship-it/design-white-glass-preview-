# Tome 3/8 — Accessibilité, barrière d'achat et scoring par profil — 20 août 2026

Source : `agent_docs/sources/tome3-barriere-achat-scoring-2026-08-21.pdf` (20 pages,
lues intégralement le 22/08) + `agent_docs/sources/tomes-md/T3.md` (1110 lignes).
Auteur ORION. Les tomes 1 (pivot) et 2 (donnée) sont livrés et recettés.

## 0. Ce qu'il faut savoir avant de le lire

Le tome apporte **un modèle**, pas une liste : six proxies publics, quatre classes,
et une phrase qui tient tout — « **la barrière d'achat n'est pas mesurable, elle
est estimable** ». Il est le seul des huit à livrer un jeu de validation utilisable :
281 comptes scorés, avec leurs entrées ET leurs sorties.

**La formule du tome reproduit ses propres chiffres.** Vérifié en rejouant le §4.3
sur les 281 lignes du CSV : **0 désaccord sur la barrière, 0 sur la classe**, et
6 écarts d'un dixième sur l'accessibilité — tous expliqués par le même détail
d'implémentation (la référence calcule l'accessibilité sur la barrière ARRONDIE).
Le modèle est donc reproductible, et c'est ce qui le rend livrable.

⚠️ **Le CSV n'entre pas dans le dépôt** : `agent_docs/sources/` est gitignoré. La
vérification des 281 lignes est faite ICI, une fois ; le test embarqué rejoue un
sous-ensemble figé qui couvre les six statuts, les quatre classes et les bornes.

### Ce que le croisement a établi

| Ce que le tome suppose                | Réalité du dépôt                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le produit ne calcule pas la barrière | **Vrai** — aucune occurrence de `barrier`/`barriere` dans `apps/ia` ni `apps/api`                                                                        |
| Les 6 proxies sont observables        | **Quatre le sont**, un partiellement, un pas du tout — voir §1.1                                                                                         |
| Le score d'entité existe              | Il existe en Python (`prioritization.py:160`), **n'est jamais persisté et n'a aucun consommateur à l'écran** — `grep priorityTier apps/web/src` est vide |
| Il faut brancher l'échéance DECP      | La donnée existe **depuis le tome 2** (`decp.py`, `endsOn`) — et l'axe A1 de Découvrir écrit toujours « échéance du marché inconnue » en dur             |

### 1.1 Les six proxies, face au registre français

| Proxy                | Observable aujourd'hui ?                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 statut            | **partiellement** : le registre publie une CATÉGORIE (PME/ETI/GE) et des drapeaux de service public — jamais « ETI familiale » vs « ETI sous fonds » |
| P2 effectif          | **oui** — `tranche_effectif_salarie`                                                                                                                 |
| P3 cotation          | **non** — aucune source publique gratuite ne lie un SIREN à une cotation Euronext                                                                    |
| P4 commande publique | **oui** — DECP/BOAMP, et depuis le tome 2 avec l'échéance du marché                                                                                  |
| P5 décentralisation  | **oui** — `nombre_etablissements_ouverts`                                                                                                            |
| P6 ancienneté        | **oui** — `date_creation`                                                                                                                            |

Conséquence assumée : **la cotation n'est jamais mesurée** et le statut ne l'est
que par ce que le registre PROUVE. Le modèle garde l'échelle du tome pour ce qui
est DÉCLARÉ (utilisateur, puis communauté — le mécanisme du tome 2), et retient,
quand le registre ne dit qu'« ETI », la valeur de l'ETI **sous fonds** (4,0) : la
plus fermée des deux. Sur-estimer la capacité à ouvrir coûte huit mois ;
sous-estimer suggère seulement de viser une filiale.

## 2. Inventaire

| #   | §     | Exigence                                                    | Statut   | Preuve / raison                                                             |
| --- | ----- | ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| 1   | 1     | Les 9 faits de benchmark sur le référencement               | —        | contexte, rien à coder                                                      |
| 2   | 2.1   | Viser le prescripteur qui CONTOURNE                         | PARTIEL  | rôles de décision livrés, « champion » non distingué                        |
| 3   | 2.2   | La décentralisation est un proxy POSITIF                    | ABSENT   | lot A                                                                       |
| 4   | 2.3   | L'échéance est une fenêtre, alerte T-6 mois                 | PARTIEL  | échéance collectée au tome 2 ; **aucune alerte**, et l'axe A1 ne la lit pas |
| 5   | 3     | Ce qui n'est pas public, et son substitut                   | LIVRÉ    | doctrine du tome 2 dans `CLAUDE.md`                                         |
| 6   | 4     | Les 6 proxies et leurs poids                                | ABSENT   | lot A                                                                       |
| 7   | 4.1   | Barème de statut (6 valeurs)                                | ABSENT   | lot A — en constantes, jamais en dur dans un service                        |
| 8   | 4.2   | Barème de taille (6 paliers)                                | ABSENT   | lot A                                                                       |
| 9   | 4.3   | La formule et ses bornes                                    | ABSENT   | lot A — vérifiée sur 281 lignes                                             |
| 10  | 4.4   | Un proxy non renseigné SORT du calcul                       | LIVRÉ    | règle du dépôt (`discover_scoring.py:809`), reprise à l'identique           |
| 11  | 5     | Les 4 classes A/B/C/D et leurs libellés                     | ABSENT   | lot A                                                                       |
| 12  | 6     | La base des 281 comptes                                     | REFUS    | jeu de validation, jamais un import de scores (déjà tranché au tome 1)      |
| 13  | 6.5   | Concordance avec les 13 cas Pariente                        | PARTIEL  | 9 des 13 sont dans le CSV ; SEB, Fnac, VINCI et Pernod n'y sont pas         |
| 14  | 6.6   | Scorer l'ENTITÉ, pas le groupe (`BEL-ADR-003`)              | ABSENT   | lot D — le ticket que le tome dit le plus important                         |
| 15  | 7     | Les 6 signaux correcteurs, datés                            | PARTIEL  | lot C — deux disponibles, quatre demandent une détection qui n'existe pas   |
| 16  | 7.1   | Les deux lectures d'un partenariat intégrateur              | DIFFÉRÉ  | exige de détecter l'annonce — canal partenaire, tome 4                      |
| 17  | 8     | La notion vit sur 7 surfaces                                | PARTIEL  | 4 des 7 livrées au tome 1                                                   |
| 18  | 8.1   | Le nom : « Comptes ouverts » (D88)                          | DÉCISION | tranché ci-dessous                                                          |
| 19  | 9     | L'écran `/discover?mode=open`                               | PARTIEL  | Découvrir a déjà familles, tris et filtres — pas un second écran            |
| 20  | 9.2   | Les 11 colonnes, dont « ce qui bloque » et « ce qui ouvre » | ABSENT   | lot F — les deux colonnes qui font la valeur                                |
| 21  | 9.4   | Les 4 familles de résultat                                  | LIVRÉ    | livrées au tome 1 avec d'autres libellés — voir T3-B                        |
| 22  | 9.5   | Ce que l'écran ne fait jamais                               | LIVRÉ    | garde GD-05 (tome 2) et « affiché, pas masqué » (D59)                       |
| 23  | 10-12 | Le score pondéré par profil d'ESN                           | PARTIEL  | lot E, périmètre réduit — voir T3-C                                         |
| 24  | 11    | Les 8 profils                                               | DÉCISION | D87 : trois                                                                 |
| 25  | 12.2  | Le profil se déduit ; trois questions manquent              | PARTIEL  | taille, expertises et modèle existent ; CA partenaire et référencement non  |
| 26  | 13    | Les 8 stratégies affichées dans le produit                  | DIFFÉRÉ  | ce sont des écrans, aucun n'est demandé ailleurs                            |
| 27  | 23.2  | Trois profils d'abord (D87)                                 | DÉCISION | retenu                                                                      |
| 28  | 24.2  | Le profil est recalculé chaque trimestre et annoncé         | DIFFÉRÉ  | aucun recalcul périodique n'existe                                          |
| 29  | 26    | `BEL-ADR-001` la barrière                                   | ABSENT   | lots A-C                                                                    |
| 30  | 26    | `BEL-ADR-002` l'écran                                       | PARTIEL  | lot F                                                                       |
| 31  | 26    | `BEL-ADR-003` le score d'entité                             | ABSENT   | lot D                                                                       |
| 32  | 26    | `BEL-ADR-004` le scoring par profil                         | PARTIEL  | lot E                                                                       |
| 33  | 27    | Les 7 KPI du scoring                                        | DIFFÉRÉ  | le premier exige des retours terrain qui n'existent pas encore              |
| 34  | 28    | Les 12 cas limites                                          | PARTIEL  | neuf traités par le modèle ; procédure collective = lot G                   |
| 35  | 29    | D71 / D87 / D88                                             | DÉCISION | D71 déjà tranché au tome 1                                                  |

## 3. Décisions

| #        | Question                                                    | Décision                                                                                                                                                                    |
| -------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D71**  | Accessibilité et barrière : un axe ou deux ?                | **Deux**, déjà tranché au tome 1. La barrière ALIMENTE l'axe A1 ; elle ne le remplace pas                                                                                   |
| **D88**  | Le libellé de la classe A                                   | **« Ouvert probable »**, jamais « facile », toujours suivi de « à vérifier au premier contact »                                                                             |
| **D87**  | Huit profils ou trois ?                                     | **Trois** (créateur, spécialiste, établie) — 64 valeurs calibrées sans donnée d'usage seraient 64 inventions                                                                |
| **T3-A** | Une classe A vaut-elle un état d'accès `ouvert` ?           | **NON.** Une classe est une ESTIMATION de proxies ; `ouvert` est un FAIT. Les confondre ressusciterait ce que le tome 1 interdit : conclure d'un silence                    |
| **T3-B** | Deux systèmes de familles (tome 1 et tome 3) ?              | **Un seul**, celui du tome 1, en production et recetté. Le tome 3 apporte la CLASSE : une colonne et un filtre, pas un second rangement                                     |
| **T3-C** | La matrice 8 profils × 8 axes rebase-t-elle le score /100 ? | **Non.** Les axes du tome ne sont pas les blocs du barème, et rebaser invaliderait tous les scores stockés. Le profil pilote le TRI et les défauts, pas les poids du barème |

## 4. Lots

- **Lot A — la barrière, fonction pure** (items 3, 6-11) : `access_scoring.py`,
  six proxies, quatre classes, « non estimable » sous trois proxies, evidence en
  français. Golden figé couvrant les six statuts et les quatre classes.
- **Lot B — les proxies branchés sur le registre** (item 6).
- **Lot C — la barrière alimente l'axe A1, et l'échéance est enfin lue** (items 4, 15).
- **Lot D — le score d'entité** (item 14) : sur une classe C ou D, le produit ne
  propose jamais le groupe.
- **Lot E — le profil d'ESN** (items 23-25, périmètre T3-C).
- **Lot F — l'écran** (items 18, 20).
- **Lot G — la procédure collective** (item 34).

## 5. Ce qu'on ne promet pas

- **La cotation en bourse** : aucune source publique gratuite ne la lie à un SIREN.
- **ETI familiale contre ETI sous fonds** : le registre ne le dit pas ; le modèle
  retient la valeur la plus fermée et l'écrit.
- **Les huit profils** (D87) et **le rebasage du barème** (T3-C).
- **Le recalcul trimestriel du profil** : aucun recalcul périodique n'existe, et en
  poser un sans écran qui l'annonce produirait un changement invisible.
- **Les huit stratégies affichées** et **la double lecture d'un partenariat**.
- **Les 281 comptes importés** : jeu de validation, jamais des scores importés.

## 6. État de livraison

| Lot | Commit | Mergé | Vérifié en live |
| --- | ------ | ----- | --------------- |

| Lot | Contenu | Commit     | Mergé | Vérifié en live                                                                                                 |
| --- | ------- | ---------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| A-G | Tous    | `d87678e6` | ✅    | ✅ recette 23/08 : un défaut trouvé et corrigé (`1f93c6f0`) — la barrière s'affichait « non estimable » partout |
