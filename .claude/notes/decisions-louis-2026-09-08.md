# Arbitrages de Louis — 2026-09-08

Quatre questions posées en un lot pendant que la CI de la PR #1747 tournait.
Chacune était bloquante pour un lot entier. **Ne pas les reposer.**

## 1. Mémoire marché — TOUT BRANCHER, les trois écrans

**Question** : #1622.5 avait été parqué le 07/09 sur le défaut conservateur
« on ne branche aucune surface nouvelle tant qu'aucun jugement terrain
n'existe ». Or le lot au meilleur rendement du corpus (~45 retours) est
justement l'agrégat de couverture du portefeuille, qui se décline sur trois
écrans.

**Réponse de Louis : tout brancher.** L'agrégat se construit UNE fois, puis se
décline sur `/pilotage/qualite` (#1633), `/pilotage/marche` (#1635) et le
territoire (#1634), **d'un coup**.

⚠️ **#1622.5 est donc levé.** Le défaut conservateur du 07/09 ne s'applique
plus : il avait été retenu faute d'arbitre, l'arbitre a tranché autrement. Ce
qui reste vrai de #1622 : l'ingestion du 06/09 n'a jamais été confrontée à un
jugement humain, et trois écrans le diront en même temps si elle est fausse
quelque part. C'est le risque que Louis a accepté explicitement.

## 2. Recette du back-office — Louis la fait lui-même

**Question** : `belllum-monorepo-dashboard-manager.vercel.app` rend 401 Basic
Auth, et le middleware passe AVANT le routage — un 401 ne prouve rien. Quatre
issues entièrement livrées (#1643, #1655, #1656, #1669) restent ouvertes pour
cette seule raison, plus tout le lot de la PR #1744.

**Réponse de Louis : il recette lui-même.** C'est la seule voie qui recette la
PRODUCTION — le relais local aurait recetté le même CODE, sans rien prouver du
déploiement, des variables d'environnement ni des données réelles.

**À produire** : compléter `.claude/notes/recette-backoffice-a-faire-par-louis-2026-09-07.md`
avec le lot #1744 (#1642, #1646, #1671.3, #1671.4, #1672, #1674.5, #1686),
écran par écran, avec ce qu'il faut voir.

## 3. `/pilotage` — #1439 tient, #1440.1 est écarté

**Question** : #1439 (03/09, CLOSED, livré) a fait REMONTER le bloc « À traiter »
en position 3. #1440.1 (03/09, OPEN) le veut en position 7. Même jour, même
auteur, même bloc, demandes inverses.

**Mesure qui a servi à trancher** : les six autres blocs de l'ordre cible de
#1440.1 sont **déjà dans le bon ordre**, simplement décalés d'un cran par la
position de « À traiter ». Déplacer ce bloc est le SEUL changement structurel
que #1440.1 demande.

**Réponse de Louis : #1439 tient.** « À traiter » reste haut. L'argument est
dans #1439 lui-même : ce bloc ne porte QUE ce que Bellum ne peut pas décider
seul, et un arbitrage qui attend ne se met pas en bas de page.

**À faire** : écarter #1440.1 dans l'issue **en citant #1439**, livrer #1440.4
seul. Ne PAS toucher à `PilotagePage.tsx:130`.

## 4. Traceur `/produit` — bloqué jusqu'à la relecture juridique

**Question** : #1682 est la racine de cinq écrans (#1683, #1684, #1685, #1687,
#1688), et #1681.6 appelle lui-même une relecture juridique RGPD **avant** de
poser le traceur.

**Réponse de Louis : bloqué jusqu'à la relecture.** Le cadre technique existe
déjà (`packages/contracts/src/schemas/product-analytics-privacy.ts`, gardes
GA-240 / GA-241) ; ce qui manque est juridique, pas technique. Les six issues
restent OUVERTES avec ce motif écrit. On n'y touche pas.
