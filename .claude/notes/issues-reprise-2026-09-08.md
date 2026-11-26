# Reprise — retours bêta, après le lot du 08/09/2026

Coller ce fichier en entier dans une session neuve. Il remplace
`issues-reprise-2026-09-07.md`, qu'il ne faut plus lire seul : quatre décisions
qui y étaient « parquées » ont été **tranchées par Louis** le 08/09.

Le diagnostic complet des 73 issues reste dans
`.claude/notes/issues-vague-2026-09-07.md` (~308 demandes numérotées) —
**ne pas le refaire**, seulement re-vérifier dans le code.

## 1. Ce qui est TRANCHÉ — à ne pas reposer

### Les quatre arbitrages de Louis du 08/09 — détail dans `decisions-louis-2026-09-08.md`

1. **Mémoire marché : TOUT BRANCHER.** ⚠️ **#1622.5 est LEVÉ.** Le défaut
   conservateur du 07/09 (« aucune surface nouvelle avant un jugement terrain »)
   ne s'applique plus. L'agrégat de couverture du portefeuille se construit UNE
   fois puis se décline sur `/pilotage/qualite` (#1633), `/pilotage/marche`
   (#1635) et le territoire (#1634), **d'un coup**. Louis a accepté
   explicitement le risque : si l'ingestion du 06/09 est fausse quelque part,
   trois écrans le diront en même temps.
2. **Recette du back-office : Louis la fait lui-même.** Gestes écrits dans
   `.claude/notes/recette-backoffice-a-faire-par-louis-2026-09-07.md`, complété
   le 08/09 avec le lot #1744 (§5 à §8). Ne PAS monter de relais local.
3. **`/pilotage` : #1439 TIENT, #1440.1 est écarté.** « À traiter » reste en
   position 3 (`PilotagePage.tsx:130`). Écarté dans l'issue en citant #1439 le
   08/09. #1440.6 (couleurs et px littéraux) écarté pour la **troisième** fois
   (D79/D80). **Reste ouvert : #1440.4** (chaque indicateur ouvre sa source, sa
   période, son dénominateur, sa dernière mise à jour) + les déplacements
   (Rituels → Équipe, Automatisations, tiroir « Sources & méthode »).
4. **Traceur `/produit` : BLOQUÉ** jusqu'à la relecture juridique RGPD que
   #1681.6 exige. #1682 et ses cinq écrans (#1683, #1684, #1685, #1687, #1688)
   restent ouverts avec ce motif. **Ne pas y toucher.**

### Ce qui reste vrai du 07/09

- **REFUS, avec leur règle** : la hiérarchie de résolution à 5 échelons
  (#1603.6, #1617.2) — le corpus n'en porte que deux ; l'export CSV du
  back-office (#1672.5) — une garde interdit le mécanisme, sa liste d'exceptions
  est vide à dessein.
- **Défauts retenus faute d'arbitre**, toujours en vigueur : #1639 pas livré
  (facturation = arrêt obligatoire) · #1613.2/#1640 le score d'externalisation
  **ne s'affiche pas**, GA-257 l'interdit · #1575.2 un compteur à 0 reste non
  cliquable (#1580) · #1605.7 le seuil par ligne ESN reste à 2 ·
  #1603.2/#1616.2 on ne renomme pas 4 tables de prod.
- **Numéros de garde** : GA-257 et GA-258 pris. **Le prochain libre est GA-259.**

## 2. Ce qui est MERGÉ et RECETTÉ — rien en attente

- **PR #1745** (lot mémoire marché du dossier de compte) — recettée le 08/09 sur
  `app.bellum-ai.com`. Verdict : **8 points PASS, 2 PARTIAL** (corrigés depuis).
- **PR #1747** (`735bec695`) — la pilule étirée (#1608, #1631.7) + le compte qui
  se proposait lui-même (#1632). Recettée, mesurée.
- **PR #1748** (`2463af04d`) — « non mesuré » au lieu de « indisponible »
  (#1608, #1640.3). Recettée, mesurée.
  ⚠️ L'API sert encore `735bec695` et **c'est normal** : le diff entre les deux
  commits ne touche **aucun fichier hors `apps/web/`** (vérifié), Railway n'avait
  rien à reconstruire.

**Huit issues commentées avec leur verdict de recette**, aucune close : ce sont
des specs multi-points dont l'essentiel des points reste à faire (#1573, #1574,
#1608, #1621, #1630, #1631, #1632, #1640).

## 3. Ce qui n'a JAMAIS pu être vérifié — nommé, jamais compté comme fait

- **Toute la recette du back-office.** `belllum-monorepo-dashboard-manager.vercel.app`
  rend 401 Basic Auth et le middleware passe **avant** le routage : un 401 ne
  prouve rien. **#1643, #1655, #1656, #1669** sont entièrement livrées, chacune
  commentée avec sa preuve `fichier:ligne`, et restent OUVERTES pour ce seul
  motif. Louis rend le PASS.
- **La recette a tourné dans l'espace de DÉMONSTRATION** (`demo+demo5`), pas
  dans l'espace de Louis. Le code est le même ; les données ne le sont pas.

### Un défaut trouvé en recette, PAS corrigé, et voici pourquoi

**La vue d'ensemble d'un compte se contredit elle-même.** L'entête écrit
« Analyse le 7 septembre 2026 » pendant que le panneau « Sources et confiance »,
40 px plus bas, écrit **« Dossier pas encore analysé »** — au-dessus de cinq
sources datées et d'une confiance à 78/100.

Cause **mesurée** : `last_analyzed_at` vaut `null` en production
(`MAX(analysis_runs.completed_at)`). L'entête passe par la dérivation documentée
`lastAnalyzedDate()` (`apps/web/src/features/accounts/model/lastAnalyzed.ts:25`),
qui replie sur `created_at` pour un compte `completed` ; le panneau lit la
colonne BRUTE (`TabOverview.tsx:67`) et court-circuite la dérivation. C'est
« une dérivation vit à un seul endroit » enfreint.

**Deux correctifs candidats, et ils ne disent pas la même chose :**

| | Ce que ça corrige | Ce que ça masque |
| --- | --- | --- |
| (a) passer `lastAnalyzedDate(account)` à `buildAccountProvenance` | l'écran cesse de se contredire, une ligne | que le semis de démo n'écrit **aucune ligne `analysis_runs`** |
| (b) semer `analysis_runs` dans `demo-dataset.ts` | la démo devient fidèle, et `last_analyzed_at` devient VRAI partout | rien — mais ça ne dit rien des comptes RÉELS |

⚠️ **Ne pas faire (a) seul** : ça éteindrait le seul symptôme du trou de semis.
Et **vérifier d'abord si les comptes réels de Louis ont des lignes
`analysis_runs`** — si oui, c'est un défaut de démo ; si non, c'est un défaut de
production et (b) ne suffit pas.

⚠️ Les autres lecteurs de `last_analyzed_at` (plan, fraîcheur, échéances) sont
**légitimement** bruts : ils répondent à « quelle date a PRODUIT le plan », pas à
« que faut-il afficher sous *Analyse le* ». Ne pas les toucher.

## 4. Ce qui RESTE, avec le découpage

| Lot | Issues | Pourquoi maintenant |
| --- | ------ | ------------------- |
| **L'agrégat de couverture du portefeuille + ses 3 écrans** | #1633, #1635, #1634 | **débloqué par l'arbitrage n°1** ; c'est le plus gros rendement du corpus (~45 retours autour du même objet) |
| La preview mémoire marché **pré-compte** de `/search` | #1589.2, #1591.1, #1592.2, #1593.2 | quatre demandes, **un seul** manque racine : aucun endpoint n'expose `coverageFor()` avant la création d'un compte |
| `/pilotage` | **#1440.4 seulement** | #1440.1 et #1440.6 sont écartés |
| Le 5ᵉ compteur « parcours observés » de `/accounts` | #1575.1, #1575.3 | petit, isolé |
| Le reste du dossier de compte | #1603→#1613, #1630→#1632, #1638 | gros, à découper **par onglet** |
| Le traceur `/produit` | #1682 → #1683, #1684, #1685, #1687, #1688 | ⛔ **BLOQUÉ** — relecture juridique |
| `/billing` | #1639 | ⛔ arrêt obligatoire (facturation) |

**Ce que #1608 attend encore**, écrit dans l'issue le 08/09 : l'agrégation par
niveau géographique **dans `RegionDistributionCard`** (ce qui existe est UNE zone
pour le compte), et la gradation « forte » — qui exige une **normalisation par
cohorte**, même question ouverte que `externalization_score`.

## 5. Les pièges d'outillage payés dans CE lot — à ne pas repayer

- ⚠️⚠️ **`inline-flex` ne protège de RIEN dans un parent flex en colonne.** La
  spécification blockifie l'enfant, l'étirement lui donne toute la largeur. Deux
  pilules à 1 174 px et 489 px, **et les deux suites de composants étaient
  vertes** : jsdom ne met rien en page. Mémoire :
  `pilule-etiree-par-blockification-flex`. La sonde de mesure y est recopiée.
- ⚠️⚠️ **NestJS sérialise un `null` en corps VIDE sur un 200**, pas un 204 :
  `res.json()` jette, et l'écran annonce une PANNE au lieu de « non mesuré ».
  **Et React Query v5 REFUSE un `queryFn` qui rend `undefined`** — corriger le
  transport sans normaliser en `null` chez l'appelant garde le même écran.
  Mémoire : `corps-vide-200-nest-est-un-null`.
- **Un heredoc `<<PY` NON QUOTÉ fait substituer les backticks par zsh** — un
  script Python contenant du markdown a explosé en « command not found ».
  Toujours `<<'PY'`, et passer les chemins par l'environnement.
- **`ls` et `git status --porcelain` rendent du vide** dans ce bac à sable
  (`ls -la` a rendu 0 octet sur un fichier existant). Appeler `/bin/ls`,
  `/usr/bin/git`.
- **`MEMORY.md` avait dépassé sa limite de chargement** (24 598 o pour ~24 400).
  Place faite en déplaçant la section « Outillage » vers
  `outillage-qui-ment-index.md` — **on déplace d'un cran, on ne supprime pas**.
- **Le bail de démo rend un 401 transitoire** en pleine recette : recharger
  `/demo` le renouvelle. Un 401 au milieu d'une mesure invalide CETTE mesure,
  pas la précédente — vérifier l'horodatage avant de conclure.
- **`gh pr merge --merge` rend une sortie qui ressemble à un `checkout`.**
  Prouver la fusion par le **contenu** sur `origin/main`
  (`git show origin/main:<fichier> | grep`), jamais par la sortie de la commande.
