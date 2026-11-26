# Fiches en défaut de recette prod (01/11) — #4813.1 #4345.3 #4802.2 #4198.2

Périmètre : apps/web/src/features/accounts/view/account-detail/tabs/committee/committeeScreenData.ts, apps/web/src/features/accounts/view/account-detail/tabs/committee/committeeScreenData.test.ts, apps/web/src/components/primitives/AskLaura.tsx, apps/web/src/components/primitives/AskLaura.test.tsx, apps/web/src/features/projects/view/ProjectLauraDialog.tsx, apps/api/src/modules/contacts/contact-ranking.ts, apps/api/src/modules/contacts/contact-ranking-access-status.spec.ts, apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx, apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.accessStatus.test.tsx, apps/web/src/i18n/locales/fr/accounts.json, apps/web/src/i18n/locales/en/accounts.json, apps/web/src/features/accounts/view/accounts-list/AccountsTable.rowActions.test.tsx, changes/fix-fiches-defauts-recette-01-11.yml, docs/briefs/fix-fiches-defauts-recette-01-11.md

## Traité

- #4813.1 : le badge « Dirigeant du groupe » ne sortait jamais car le graphe réel ne porte ni `hierarchyLevel` ni entité pour le dirigeant ; titre c_level et absence d'entité lus comme niveau groupe.
- #4345.3 : `AskLaura` reçoit `releaseOverlay` ; le dialogue du dossier /projects se ferme et la bulle s'ouvre sur place (plus de navigation vers /chat?prompt=…). Composeur Laura V8 non touché.
- #4802.2 : l'état d'accès lit aussi le RÔLE posé (à bâtir : décideurs économiques et sponsors devant ; référencé : utilisateurs et achats devant) ; « Accès inconnu » ne reste pas affiché à côté d'un état choisi.
- #4198.2 : « Ouvrir le dossier » devient « Voir le compte » sur /accounts (accounts.json fr ; EN disait déjà « Open the account »).

## Décisions touchées

Garde #1847 (le lien reste sous surcouche sans `releaseOverlay`), #4345.2, #2150.21, #4271 (ordre par état d'accès, c76 : le rôle change l'ORDRE, jamais le CONTENU).

## Droits

Aucune surface d'accès touchée (pas de route, garde ni rôle).

## Non fait

Démo : aucun écran neuf, seulement des règles d'ordre et des libellés ; seeds inchangés. Vérification en prod à refaire (données réelles non reproduites en local).
