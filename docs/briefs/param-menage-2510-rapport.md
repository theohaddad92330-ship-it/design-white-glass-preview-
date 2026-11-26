# PARAM-MENAGE — rapport (branche `claude/param-menage-2510`)

- **#4531** : déjà livré sur main (e54cd95402, 2726edb751, 1eb92c634f) — rien à refaire.
- **#4534** : `return-to-app.ts` reconnaît comme « Réglages » tout `to` de `items.settings.ts` (dérivé, GA-26) ; 3 tests ajoutés (rouges puis verts).
- **#4535** : « Raccourcis clavier » n'est plus une entrée du menu ; déclarée en alias (`aliasOf: '/settings'`), route et onglet de Préférences conservés ; garde GA-94 adaptée.
- **#4520** : rangée identité retirée du pied de barre sur bureau ; bouton de repli conservé. Décision : GARDÉE sous 768 px, car la barre du haut (avatar) n'est pas montée sur mobile (`!isMobile`) — la retirer couperait la déconnexion.
- **#4532 + #4533** : Mes données = deux onglets Exports/Imports (`?tab=imports`, Imports réservé aux gestionnaires `team:manage`) ; carte « Exporter le vivier » (masquée si `useDataExit` refuse) dans Exports ; `ImportsTab` extrait ; `/settings/import` et `/settings/vivier-export` redirigent (`beforeLoad`) ; entrées de menu devenues alias ; liens/textes mis à jour ; `VivierExportView` et clés i18n orphelines supprimés.
- Décisions : paramètre d'URL `tab` (comme demandé), pas `onglet` ; liens internes vers `/settings/import` laissés (valides par redirection).
- Tests : vitest ciblés (architecture, i18n, settings, sidebar, import, guide, lib : 4431 verts) + `tsc --noEmit` web vert. Non fait : recette Chrome prod (cloud sans navigateur sur la prod).
