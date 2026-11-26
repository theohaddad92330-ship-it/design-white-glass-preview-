# Lot 95 — #4805 · une vue qui disparaît en silence

Périmètre : `apps/web/src/components/feedback/NamedAbsence.tsx` ; `apps/web/src/architecture/une-vue-ne-disparait-pas-en-silence.*` ; `apps/web/src/features/accounts/view/account-detail/**` ; `apps/web/src/features/governance/view/DuplicatesPanel.tsx` ; `apps/web/src/i18n/locales/*/common.json` ; `apps/web/src/i18n/locales/*/accountOrg.json`

## Ce que le lot fait

1. **Une garde** (`une-vue-ne-disparait-pas-en-silence.test.ts`) sur le périmètre restreint (fichiers `*View|*Section|*Panel|*Card|*Table`, `if (<absence de données>) return null`), avec contrôle négatif synthétique, preuve de lecture, preuve qu'elle n'attrape pas une prop optionnelle ni une absence nommée.
2. **Un cliquet** : `…baseline.txt` (90 sites tolérés, surensemble heuristique mesuré 103 avant correctifs). Site neuf → rouge ; site devenu propre non retiré → rouge. Plafond lu par `^[0-9]+` (test avec fichier à commentaires chiffrés, piège prettier-dette du 29/10).
3. **`NamedAbsence`** (components/feedback) : la vue NOMME ce qui manque ; jamais « 0 », jamais de valeur devinée.
4. **Corrigés** : organigramme Focal / Groupe / Édition (`!view`), CompanyPublicData (financier, technologies, dirigeants), ReferenceDossierView (7 blocs), et trois **échecs de lecture silencieux** (LinkedAccountsCard, AutoMergedPairs de DuplicatesPanel, PersonalContactsSection → `QueryLoadError`).

## Ce que le lot NE fait PAS (et pourquoi)

- `HierarchyOrgView` (:170/:369) : traité par #4749 (branche `claude/l-organigramme-4749`) — non refait, reste dans la baseline.
- `ContactSelectionPanel:412` : sélection vide = absence de PROP, pas de donnée chargée → toléré.
- `SignalLeadsSection:19`, `PersonalContactsSection` (liste vide), `DuplicatesPanel` auto-fusions vides : LISTES — « dans une liste, une absence ne fait AUCUNE ligne » (Louis 20/09) → tolérés. Seul l'ÉCHEC de lecture est désormais dit.
- `CompanyPublicDataSection` cartes US SEC (:428/:433), Légal, Marchés, Emplois, GitHub : cartes propres à un contexte (société cotée US, etc.) — « non applicable » n'est pas « manquant » ; les nommer ferait afficher « Données SEC : aucune » sur tout compte français. Restent dans la baseline.
- Pas d'élargissement aux ~1 016 `return null`. Aucun fichier `.github/workflows`. Aucune migration, aucune route, aucun garde d'accès.

## Ce que le lot DÉFAIT

- Deux tests qui figeaient le défaut : `FocalOrgView.test` « ne rend rien plutôt qu'un écran vide et muet » et `GroupOrgView.test` « pas de groupe à dessiner » (`toBeEmptyDOMElement`) → remplacés par l'assertion de l'absence nommée.

## Décisions touchées

Garde : doctrine « on n'affiche pas ce qu'on n'a pas » (20/09, listes), GA-18/GA-19 (jamais « 0 »), #3666.k (échec ≠ vide), #4749 (non refait) ; garde #4565 (le mock `useQuery` de LinkedAccountsCard.test gagne seulement `isError`, rien d'autre).

## Démo (règle n°9)

Aucune donnée neuve affichée : `NamedAbsence` n'écrit que le nom d'une rubrique déjà existante. Rien à seeder, rien à classer dans `demo-coverage.ts`.

## Environnement

Les `dist/` de `packages/*` et le lien `zod` ont été reconstruits localement (node_modules/dist gitignorés) pour pouvoir lancer vitest ; rien de versionné.
