# Reprise — après le palier back-office (PR #1765), 09/09/2026

Coller ce fichier en entier dans une session neuve. Il **complète**
`issues-reprise-2026-09-09.md` (le lot Laura, mergé en `d78ee624b`).

## 0. ⚠️ À LIRE EN PREMIER — ce que ce lot a payé

- **`commitlint` refuse le message par défaut de `git merge`.** Chaque fusion se
  termine par un `git commit -F` avec un sujet conventionnel. Écrit dans
  `.claude/projet.md` §4, payé quand même.
- ⚠️ **Une plage d'horodatage de migration réservée à un agent ne doit PAS être
  un nombre ROND** : `migrations.spec.ts` refuse `1789100000000` — un rond
  collisionne. Réserver une plage, oui ; donner un rond comme point de départ,
  non. Écrire la réservation sous la forme « prends un horodatage réel entre X
  et Y », jamais « prends X ».
- ⚠️ **`knip` est EN CASCADE** : 11 fuites de types, en DEUX tours. Un agent qui
  ne le lance pas (parce que la machine est partagée) laisse le travail à
  l'intégrateur — c'est acceptable, mais ça se dit dans son rapport, et
  l'intégrateur DOIT le lancer jusqu'au vert.
- ⚠️ **`git grep -c` compte des LIGNES, pas des occurrences.** Pour un cliquet,
  `git grep -o … | wc -l`.

## 1. Ce qui est TRANCHÉ — à ne pas reposer

- **Le gel du traceur `/produit` est LEVÉ** (Louis, 08/09 au soir, en
  connaissance du motif). ⚠️ **La relecture juridique RGPD reste DUE** — lever le
  gel a fait coder le traceur, ça ne l'a pas remplacée. C'est écrit dans
  `doctrine-registry.ts` (entrée `c64`), pas seulement dans une réponse.
- **`VITE_PRODUCT_TRACKER_ENABLED` est ÉTEINT par défaut** : sans elle, aucun
  timer, aucun écouteur, zéro réseau. La poser est une décision d'opérateur.
- **`POST /analytics/events` est PUBLIC**, à dessein : `sendBeacon` ne pose aucun
  en-tête, et le mettre derrière le secret interne l'aurait fait fuiter dans du
  code client. Borné par le throttle global (120/min par IP) et un plafond de
  lot. Risque résiduel = pollution de MESURE, pas fuite.
- **#1667.1, « dernier changement de mot de passe » : « non mesuré » assumé.** La
  donnée n'existe pas chez le fournisseur. Ne pas la « réparer ».
- **La recette du back-office est BLOCKED (configuration)**, pas FAIL. 401,
  secret partagé. Louis seul.

## 2. Ce qui attend une DÉCISION de Louis

1. ⚠️ **L'export CSV du `DataTable` (#1672.6).** Bloqué par
   `aucun-export-de-donnees-personnelles.test.ts` (#1670.5), **et le défaut
   était réel** : la conception passait par le `sortValue` de chaque colonne, or
   pour une colonne d'e-mail masqué `sortValue` porte l'adresse EN CLAIR — un
   export générique aurait exfiltré les vraies adresses depuis un composant
   partagé par six écrans. Deux issues possibles : une exception NOMMÉE dans la
   garde, ou un accesseur d'export par colonne dont on prouve qu'il n'est jamais
   la valeur brute.
2. **`.btn` / `.report-primary` : blanc sur `--accent` = 3,74:1 en sombre.**
   Non-conformité AA RÉELLE sur des boutons, trouvée par la garde neuve. Non
   corrigée : la réparer avec `--action` casserait « un seul bouton d'action par
   écran » (`.btn` apparaît 3× dans `feedback-card.tsx`). Tracké en HERITAGE.
3. **`CLAUDE.md` porte la table des variables d'environnement EN DEUX COPIES
   qui ont DIVERGÉ** (~136-150 et ~152-166). « Un réglage vit à un seul
   endroit », violé dans le fichier qui énonce la règle. Les deux ont été mises
   à jour ; les fusionner demande de décider quelle version fait foi.

## 3. Ce qui RESTE, avec le découpage

| Lot | Issues | État |
| --- | --- | --- |
| **Les 5 écrans du traceur** | #1683, #1684, #1685, #1687, #1688 | ✅ **DÉBLOQUÉS** — le producteur (#1682) est livré. **Vague C** : ils consomment le contrat d'événement, ils ne partent JAMAIS en même temps que lui |
| **`/produit` (la route)** | #1657 | #1657.3 (délai de première valeur) est codable MAINTENANT — la donnée existe déjà. #1657.1/.2 attendent le traceur EN PRODUCTION, pas juste en code |
| **L'entonnoir** | #1686.2 / .3 | 4 étapes sur 7 ; manquent « analyse lancée », « première action validée » (LE moment), « 2ᵉ session », « actif à J+30 ». Et l'écran doit DIRE que les taux ne sont pas cumulatifs |
| **Les 5 déclencheurs d'alerte restants** | #1676 | nommés au registre, sans détection. « Nouveau client » et « churn » demandent une sémantique produit non tranchée |
| **`FilterBar` sur 3 écrans de plus** | #1673 | `monitoring/filters.tsx`, `queues/page.tsx`, `audit/audit-filtres.tsx` — hors périmètre du lot |
| **`flag_matured`** | #1667.1 | type DÉCLARÉ, calcul absent (et Reflag n'a pas l'historique). À brancher ou à documenter comme tel |

## 4. La recette qui reste à faire

**Par Louis, sur le back-office** (401 pour moi) : les deux nouvelles entrées de
rail (« Dépendances du manager », « Runbook »), le pagineur de `/queues` en
anglais, la page `/securite` complétée, `/impersonations`, et — le plus utile —
**réduire la fenêtre sous 768 px sur `/users/<id>` et vérifier que les boutons
Supprimer / Suspendre / Incarner sont ABSENTS du DOM**, pas juste invisibles.
