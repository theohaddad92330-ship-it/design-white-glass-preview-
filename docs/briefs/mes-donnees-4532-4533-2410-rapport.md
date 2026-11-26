# Rapport — lot PARAMÈTRES (#4532 #4533 #4534 #4535), 24/10/2026

Branche `claude/parametres-2410` (base `claude/talents-sans-presentations-2410`). Revient sur #3950 (page Export du vivier), la page Imports séparée et la PR #1255 (entrée « Raccourcis clavier »).

1. **Onglets** — FAIT. `MyDataTabs` (Exports · Imports), `?tab=exports|imports` (défaut Exports, valeur abîmée → Exports) dans `routes/settings/mes-donnees.tsx`.
2. **Exports + carte vivier** — FAIT. `VivierExportCard` (ex-`VivierExportView`) sous le contenu de Mes données ; masquée en entier quand `useDataExit` refuse (testé). `useDataExit` inchangé.
3. **Imports** — FAIT. `ImportsPanel` = contenu de l'ancienne page SANS la carte « Exporter le vivier » (grille à 2 cartes, une seule fois — GA-26). Composants réutilisés tels quels.
4. **Droits** — FAIT, testé : membre → pas d'onglet Imports ; membre + `?tab=imports` → Exports (contenu d'Imports jamais monté) ; rôle inconnu (équipe non chargée) → Exports ; gestionnaire → deux onglets (`MyDataTabs.test.tsx`). Règle = `team:manage`, comme `managerOnly`. Gardes serveur inchangées.
5. **Redirections** — FAIT. `/settings/import` → `/settings/mes-donnees?tab=imports`, `/settings/vivier-export` → `/settings/mes-donnees` (`beforeLoad` + `replace: true`, pas de `<Navigate>`). L'ancienne page Imports ne lisait AUCUN paramètre de recherche : rien à conserver. Entrées de menu retirées.
6. **Liens** — FAIT : 13 `<Link>` + `hero.ts`/`TodayStartCallout` (`search` séparé), `JourneyAudienceTools`, `SituationPicker`, `TabProofs`, `ConsultantsPage`, `ImportsOverview`, `chat.json` (FR), `demo-chat-script.ts`. Garde `les-imports-vivent-dans-mes-donnees.test.ts` : plus aucun lien vers les anciennes adresses (hors redirections, route-titles, `IMPORT_SCREEN`).
7. **Rien perdu** — vérifié : pas de sous-route `/settings/import/*` ; l'ancre `#import-dropzone` vit dans `ImportsPanel` ; tutoriel `importer-ses-donnees` (`guide-registry.ts`, hors périmètre, changé) vise désormais `/settings/mes-donnees`. Démo : l'historique d'imports reste « vide à dessein » (classé `demo-coverage.ts`, inchangé) ; Mes données est servie par le manifeste existant. Changelog FR+EN `2026-10-24-parametres-mes-donnees`.
8. **#4534 Retour à l'app** — FAIT. `isSettingsPath` dérive de `SETTINGS_SECTIONS` (+ `/settings*`) ; tests `/accounts → /integrations → /settings/preferences` ⇒ `/accounts`, `/billing → /settings/x` ne retient pas `/billing`, chaque `to` reconnu.
9. **#4535 Raccourcis** — FAIT. Entrée retirée, route `shortcuts.tsx` et liens gardés ; « Préférences » active sur `/settings/shortcuts` (`settings-nav-active.ts`) ; la recherche « raccourcis » mène à Préférences (`searchKeys`). GA-94 réécrite.

## Hors périmètre touché ou à décider

- `components/navigation/known-routes.ts` (`LINKABLE_REDIRECTS`) et `sections.test.ts` : les 3 adresses restent ouvrables par Laura (le service IA `chat_tools.py` les émet encore). À faire côté IA : les renommer.
- `product-screens-catalog.ts` (contracts) et `laura-settings-catalog.ts` (api) nomment toujours `/settings/import` et `/settings/vivier-export` : laissés (les adresses redirigent).
- Conséquence assumée : un MEMBRE qui suit un lien « Importer… » atterrit sur Exports. Guide `importer-ses-donnees` lancé depuis une autre page ouvre l'onglet par défaut (Exports) : le guide ne sait pas porter un `?tab=`.
- Env : `@bellum/contracts` a dû être compilé (`tsc --build`) ; `@bellum/utils` non construit ⇒ 5 gardes `src/architecture` rouges pour cette raison (pas le lot).
- Tests : `tsc -p apps/web` propre ; specs ciblées vertes (return-to-app, settings, navigation, architecture hors env).
