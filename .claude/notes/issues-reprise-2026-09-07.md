# Reprise — retours bêta, après la vague du 07/09/2026

Coller ce fichier en entier dans une session neuve. Il ne porte ni le diagnostic
complet ni les extraits de code — ceux-là sont dans
`.claude/notes/issues-vague-2026-09-07.md`.

## 1. Ce qui est TRANCHÉ — à ne pas reposer

- **Les 73 issues ouvertes ont été diagnostiquées** et découpées en ~308 demandes
  numérotées. Le découpage vit dans `issues-vague-2026-09-07.md`. **Ne pas
  recommencer le diagnostic** : re-vérifier dans le code, oui ; re-diagnostiquer, non.
- **Les ~45 retours « mémoire marché » sont UN objet, pas dix chantiers.** Quatre
  éclaireurs y sont arrivés indépendamment. Ce qui manque est un **agrégat de
  couverture à l'échelle du portefeuille** — aujourd'hui tout se lit compte par
  compte (`coverageFor`, `pathsFor`), jamais bouclé sur le portefeuille. Le
  construire UNE fois, puis le décliner sur `/pilotage/qualite` (#1633),
  `/pilotage/marche` (#1635) et le territoire (#1634).
- **REFUS, avec leur règle** : les valeurs littérales `#FAFAFC`/`#E8E8EE`/`#6B6B76`
  et 13/15/26 px (#1417.2, #1440.6) — D79/D80, **refusées trois fois** ; la
  hiérarchie de résolution à 5 échelons (#1603.6, #1617.2) — le corpus n'en porte
  que deux ; l'export CSV du back-office (#1672.5) — une garde interdit le
  mécanisme, sa liste d'exceptions est vide **à dessein**.
- **Défauts retenus faute d'arbitre** (chacun est le choix conservateur, à dire à
  Louis) : #1639 pas livré (facturation = arrêt obligatoire) · #1613.2/#1640 le
  score d'externalisation **ne s'affiche pas**, et GA-257 l'interdit désormais ·
  #1622.5 on ne branche **aucune surface nouvelle** avant un jugement terrain ·
  #1575.2 un compteur à 0 **reste non cliquable** (#1580) · #1605.7 le seuil par
  ligne ESN reste à 2 · #1603.2/#1616.2 on ne renomme pas 4 tables de prod.
- **Numéros de garde attribués** : GA-257 = `market-memory-score-single-reader`
  (web, ce qu'on a le droit de SORTIR), GA-258 =
  `market-memory-single-source-of-truth` (api, la porte d'ENTRÉE). Le prochain
  libre est **GA-259**.

## 2. Ce qui est MERGÉ mais pas recetté

- **PR #1744, mergée, `main` = `b671c3395`, déployée** (api sert bien ce commit).
  Back-office : #1642, #1646, #1671.3, #1671.4, #1672, #1674.5, #1686.
  ⚠️ **NON RECETTÉE** — voir §3.

## 3. Ce qui n'a JAMAIS pu être vérifié — nommé, jamais compté comme fait

- **Toute la recette du back-office est BLOCKED.**
  `belllum-monorepo-dashboard-manager.vercel.app` répond 401 Basic Auth, et le
  middleware passe **avant le routage** : `/route-qui-nexiste-pas` rend 401 comme
  `/securite`. On ne peut donc rien prouver de l'extérieur. Deux issues :
  demander les identifiants à Louis, ou monter la pile locale + relais
  (`recette-backoffice-en-local-relais-basic-auth`) — qui recette le même CODE,
  **pas la production**.
- **Les 4 issues entièrement livrées restent OUVERTES** pour cette raison :
  **#1643, #1655, #1656, #1669**. Chacune est commentée avec sa preuve
  `fichier:ligne`. Elles se closent dès que la recette est possible.
- **Le remplissage réel de `city`/`region`** dans `market_company_signal` en
  production n'est pas mesuré (pas d'accès base). Les deux cas se rendent
  correctement ; à vérifier.

## 4. Ce qui RESTE, avec le découpage

**PR #1745 (ouverte, CI en cours)** — client web : #1640.3/.5/.6, #1631.7,
#1632.5, #1573.4/.5, #1574.2, #1621.1, #1608, #1630.10. **À merger puis recetter**
sur `app.bellum-ai.com` (accessible, contrairement au back-office).

**Ensuite, par ordre de rendement :**

| Lot | Issues | Pourquoi maintenant |
| --- | ------ | ------------------- |
| L'agrégat de couverture du portefeuille | #1633, #1635, #1634 | débloque trois écrans d'un coup |
| La preview mémoire marché **pré-compte** de `/search` | #1589.2, #1591.1, #1592.2, #1593.2 | quatre demandes, **un seul** manque racine : aucun endpoint n'expose `coverageFor()` avant la création d'un compte |
| `/pilotage` réagencement | #1440.1, #1440.4 | ⚠️ #1440.1 **contredit #1439** — à trancher, pas à coder |
| Le traceur front + ses écrans `/produit` | #1682 → #1683, #1684, #1685, #1687, #1688 | ⚠️ #1682 est la RACINE des cinq, et il attend la **relecture juridique** que #1681 appelle lui-même |
| Le reste du dossier de compte | #1603→#1613, #1630→#1632, #1638 | gros, à découper par onglet |

## 5. Les pièges d'outillage payés dans CE lot — à ne pas repayer

- **Un agent en worktree ne peut pas toujours lancer `git`** : sur 7 lots, 2 ont
  commité, 5 ont laissé le travail **non commité dans l'arbre**. Un rapport qui dit
  « branche X, commit Y » **se vérifie** (`git rev-parse <branche>` : si elle pointe
  sur `origin/main`, rien n'a été commité). Récupérer en **recopiant les fichiers**
  depuis le worktree.
- **`git diff --stat` a rendu VIDE pour 36 fichiers**, et `git log -1 origin/main`
  rend un **ancêtre**. Seuls `git ls-remote`, `git rev-parse` et surtout
  `git diff-tree --name-status` disent vrai ici.
- **Trois tâches de fond ont annoncé « exit 0 » en ayant échoué**, dont une qui
  cachait un test rouge. **Lire la sortie, toujours.**
- **knip est en CASCADE** : 4 fuites, puis 6 de plus après correction. Le relancer
  jusqu'au vert.
- **commitlint** : scope dans une liste FERMÉE, sujet ≤ 100 caractères, pas de type
  `merge:`. Trois cycles perdus.
- **La garde de parité démo est aveugle aux tables PARTAGÉES** (pas de
  `workspace_id`) : la mémoire marché ne peut pas la faire rougir.
- **`--include=*.ts` non quoté sous zsh** fait planter `grep` en silence.
