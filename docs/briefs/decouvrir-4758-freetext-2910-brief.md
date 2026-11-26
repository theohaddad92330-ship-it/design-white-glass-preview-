# Lot 12 — Découvrir · #4758, #4736, #4751

Périmètre : apps/web/src/features/discover/lib/discover-history-blocks.ts, apps/web/src/features/discover/view/Discover.tsx

## Antériorité

- #4758 : PR #4775 a livré le bloc « Comptes à historique » et sa ligne de raison. La recette du 29/10 dit PARTIEL sur un seul point : la techno tapée dans la barre (`freetext`) n'atteint jamais `subject`. Garde #4758 (la ligne ne nomme que ce qu'un besoin daté recoupe, jamais un fournisseur, jamais un score).
- #4067 : l'historique entre dans le classement — garde, non re-litigué.
- #4761 : les deux blocs de l écran — garde #4761, le découpage `splitDiscoverBlocks` n est pas touché.

## Diagnostic

`Discover.tsx` : `subject={skillsText(filters) || activeFilters.keywords}` ; « Java » tapé dans la barre part en `freetext`, jamais en `subject`. Correctif : `historySubject` (expertise → mots-clés → saisie libre), candidat seulement : `historyReason` ne le nomme que si un besoin daté le recoupe.

## Livré

- #4758 : le point restant de la recette (freetext → raison nommée).

## Non livré, et pourquoi

- #4736 : demande une migration SQL (`workspaceMarketValues` élargi AVANT le code, GA-11/GA-12), un pays dans `DiscoverSignalsRequest`, un pays au contrat de carte et la démo — plusieurs paquets, hors d'un lot borné. À découper par Louis.
- #4751 : la piste première exige les journaux de production (400 amont, `rejected: 0`) à rejouer ; non disponibles ici.
- #4758, critère « compte réel sans signal récent » : dépend de #4754 (profondeur de collecte), hors périmètre déclaré.
