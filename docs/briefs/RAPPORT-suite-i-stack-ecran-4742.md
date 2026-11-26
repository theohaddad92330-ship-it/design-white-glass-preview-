# Rapport — SUITE-I #4742 : la structure technique DANS le dossier du compte

Branche `claude/suite-i-stack-ecran-4742` (base origin/main 5d20561e). Web seul : API, module pur, contrôleur et gardes non touchés.

## L'appelant

- `GET /accounts/:id/tech-structure` est appelé par `accountsApi.getTechStructure` (`features/accounts/api.ts`), via `useAccountTechStructure` (hooks/, `retry: false`, lu à l'ouverture, sans bouton), rendu par `AccountTechStructureSection`, monté dans la synthèse du dossier (`TabOverview.tsx`, à côté de la carte Contexte marché).

## Preuve

- Écran écrit ROUGE d'abord (`AccountTechStructureSection.test.tsx`, module absent), puis vert : 8 tests. + `tech-structure-api.test.ts` (2).
- États : chargement, erreur (role=alert « indisponible », aucune techno ni axe deviné), aucun axe observé (empty + 5 axes NOMMÉS), partiel (technos + preuve datée + lien, ou datée sans lien).
- Axe non observé : une seule ligne « Non observé : CRM · Données · … », jamais « 0 », jamais de ligne vide par axe ; aucun pourcentage ; aucun fournisseur nommé (lien = intitulé de l'offre ou nature).
- FR (tutoie) + EN dans `accounts.json` (`techStructure.*`).
- Verts : TabOverview.collapsed (42), une-absence-ne-fait-pas-une-ligne (45), market-context-absent-is-null (2, seul : timeout à froid en lot), synthese-ne-nomme-pas-un-fournisseur, une-cle-i18n-dynamique, theme-parity, i18n keys-resolve/accents/interpolation/gender, dossier-grammaire-visuelle.
- `tsc --noEmit -p apps/web` : 245 erreurs `error TS`, TOUTES hors de mes fichiers (0 sur api.ts/TabOverview/TechStructure) — routes typées TanStack, arbre de routes périmé dans cette VM.

## Démo

Aucun code démo web : la section lit la vraie route sur l'espace de démo, déjà seedé côté API (SNCF, CRM « non observé » → nommé). NON vérifié à l'écran (pas de navigateur lancé ici) : à recetter sur le dossier SNCF.

## Non fait / questions

- GA-05 (endpoint-guards) non lancé : aucun diff API ; rouge connu sur main selon le rapport du lot I.
- VM : zod 3.25 lié au lieu de 4 → j'ai repointé les liens `node_modules` (ignorés par git) vers zod 4.4.1 et construit `packages/contracts/dist` pour pouvoir tester. Rien de versionné.
- Section placée dans la synthèse (repliée par défaut ?) : à confirmer par Louis.
