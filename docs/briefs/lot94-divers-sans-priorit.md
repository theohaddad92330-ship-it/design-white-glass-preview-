# Lot 94 — divers · sans priorité (#4710, #4789 ; #4728 écarté)

Périmètre : `apps/web/src/routes/*.tsx`, `apps/web/src/routes/accounts/*.tsx`, `apps/web/src/routeTree.gen.ts`, `docs/briefs/*`

## Ce qu'on fait

- #4710 : `/vivier`, `/affaires`, `/signaux` redirigent (beforeLoad + `replace`, jamais `<Navigate>`, GA-27) vers
  `/consultants`, `/projects`, `/signals`. Famille : `/comptes`, `/decouvrir`, `/facturation` (noms affichés dans la nav).
- #4789 : lecture (1) de l'issue — alias `/accounts/<id>/analyze` → `/accounts/<id>` (le geste de relance vit dans le menu d'actualisation du dossier).
- Un test par alias (`alias-francais-redirections.test.ts`).

## Ce qu'on ne fait pas

- #4728 (zod 3 → 4) : l'issue dit « la migration ne part pas sans l'accord de Louis » — majeure sur le contrat partagé. QUESTION posée, rien touché.
- Aucune page nouvelle, aucun écran « relancer l'analyse » (lecture 2 de #4789). Aucun `/equipe` (route cible non vérifiée).
- Rien défait ; aucune ligne existante modifiée (hors régénération de `routeTree.gen.ts`, ajouts seuls).
