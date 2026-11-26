# Rapport — Lot J, « Mes angles » (#4739)

Branche `claude/bedros-j-angles-4739` (base origin/main 5c42f0af). Aucune PR, aucun commentaire d'issue.

**Fait** (capacité neuve — mesure : `user_attack_angles` existe déjà mais PAR DOSSIER dans `raw_analysis`, aucun angle PAR UTILISATEUR)

- Migration `1796584260871-UserAngles` (> max(main) 1796584177275) : table `user_angles`, RLS `auth.uid() = user_id`, `archived_at`, `source` contraint à `human` AVANT le code qui l'écrit. `attack_angles` (calculés) non touchée.
- API : module autonome `user-angles` (entité, service, contrôleur `@PersonalScope`) : GET/POST/PATCH, DELETE = archivage. Une ligne d'un autre → 404, jamais 403. Aucun chemin de recalcul n'y écrit (un angle humain n'est jamais réécrit).
- Web, « Contacter » : `MyAnglesPicker` dans le composer, à côté du sélecteur de modèles ; choisir un angle pose son texte dans le champ, rien ne part. UN formulaire générique créer/modifier/renommer (c75). Libellés fr/en.
- Démo (règle n°9) : 2 angles fictifs semés (`seedUserAngles`), `user_angles` classée dans `DEMO_SEEDED_TABLES` et dans la purge.

**Tests lancés** (sorties réelles)

- `jest user-angles` : 5/5 (rouge d'abord : module absent).
- `jest migration-neuve-est-la-plus-grande demo-coverage` : verts. `jest demo-forfait-room demo-reset.service` : 87/87.
- `vitest MyAnglesPicker` : 6/6 ; `ComposerDock*` (3 specs) : verts ; `theme-parity laura-ai-disclosure no-vendor-names motion-grammar` : 63/63.
- `tsc --noEmit` apps/api : seules 3 erreurs `@bellum/email` (paquet non construit sur la VM), aucune dans mes fichiers. apps/web : voir ci-dessous.

**Reste à faire / signalé**

- `endpoint-guards.spec` rouge : 367 routes nues pour 365 au gel — PRÉEXISTANT sur main (même résultat sans mon contrôleur, qui est exempté par `@PersonalScope`). À traiter à l'intégration.
- Non fait, hors périmètre : partage d'un angle à l'espace ; l'écran Plan n'affiche pas ces angles (ils vivent sur « Contacter »).
- Pour lancer vitest j'ai dû construire `packages/contracts` (`tsc --build`, `dist` ignoré par git).
- La CI doit rejouer les gardes complètes (knip exports, i18n, tailles) — non lancées ici.

**Question ouverte (« À préciser » de l'issue)** : un angle sauvegardé est-il personnel, ou visible par tout l'espace (Louis) ? Implémenté : personnel. La colonne `workspace_id` est posée pour un partage futur, sans effet aujourd'hui.
