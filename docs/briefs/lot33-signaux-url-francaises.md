# Lot 33 — Signaux · URL françaises, faits voisins, dates (#4710, #4437, #4716)

Périmètre : apps/web/src/routes/vivier.tsx, apps/web/src/routes/affaires.tsx, apps/web/src/routes/signaux.tsx, apps/web/src/routeTree.gen.ts, packages/contracts/src/schemas/account.ts, apps/ia/app/services/signal_freshness.py, packages/contracts/src/schemas/product-screens-catalog.ts, packages/figma-sync/src/spec/route-exceptions.ts

## Ce que le lot fait

- #4710 : `/vivier` → `/consultants`, `/affaires` → `/projects`, `/signaux` → `/signals`, par `beforeLoad` + `redirect` (jamais `<Navigate>`, GA-27). Même famille que #4668 (`/talents`) et #4658 (`/analyse`). Arbre de routes régénéré avec le générateur du plugin.
- #4716 : `signalDateMs` lit les mois français en toutes lettres (« 23 octobre 2026 »), garde la règle d'ancrage sur la première année (« 2024 (comptes déposés 2025-11) » → 2024). Commentaire croisé avec `signal_freshness.py` (#4647), cas dans `signal-date-ms.test.ts`.

## Ce que le lot ne fait pas

- #4437 : rien recodé. Le rattachement des offres (#4437.5) et le palier voisin existent déjà (`free_text_facts.py`, `signal_neighbours.py`, `job_family.py`, commit 4bde4822). L'issue attend une re-recette en prod, qu'aucune routine ne peut faire : elle reste ouverte.
- Ne touche pas aux gardes #4647 côté Python (seul un commentaire est ajouté) et ne rend pas l'année seule au 31 décembre côté TS (autre décision, non demandée).

## Droits

Routes nouvelles de redirection, sans contenu ni donnée : chacune lève un `redirect` vers une route existante, qui garde ses propres gardes d'accès. Qui voit : tout visiteur, il est renvoyé vers la route cible. Refusé : aucun accès supplémentaire, car la cible applique sa garde (un visiteur non connecté est renvoyé au login par la cible). Test ajouté : `apps/web/src/routes/french-aliases.test.ts`.

## Décisions touchées

garde #4537, garde #4544 : ils ne sont que le commit d'intégration qui a posé la docstring de `signalDateMs` ; sa règle d'ancrage sur la première année est gardée, seule la lecture des mois en toutes lettres s'ajoute. Garde #4647, #4668, #4658.
