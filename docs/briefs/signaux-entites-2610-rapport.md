# Rapport — lot SIGNAUX-ENTITÉS (#4403.1 · #4409.1/.2 · #4418.1 · #4323.1)

Branche `claude/signaux-entites-2610` (base `origin/main` ee5397ba3d).

1. **#4403.1 — FAIT.** `/signals` n'appelait jamais le prédicat `isOutOfTrade` : `LibraryRow.outOfTrade` + marque « hors de ton métier » sur la carte, hors métier rangé SOUS le métier (dans les deux sens de date, rien retiré). Un cours de bourse est hors métier quel que soit le profil. Rouge d'abord : `expected ['bourse','projet'] to deeply equal ['projet','bourse']`. `/mes-cibles` → `/signals` NON défait.
2. **#4409.1 — FAIT.** Cause mesurée sur le registre réel : la page de 5 de « OGF » (source facturée) ne contient pas la tête de groupe (542076799), le registre libre la rend. Le rappel par sigle interroge aussi le registre libre, fusion par SIREN.
3. **#4409.2 — FAIT** (même cause, chemin Pappers). Rouge d'abord : `assert '401234567' == '542076799'` et `'100497288' == '542076799'` (holding à 0 salarié en tête).
4. **#4418.1 — FAIT.** « Marquer envoyé » sur les relances de `/actions` (contact visé + canal e-mail/LinkedIn) ; déclaratif : aucune date passée, aucun `planItems.update`, libellé « Bellum ne l'a pas envoyé ». Le serveur (`declare-sent`) planifiait déjà J+3/J+6/J+9. Rouge d'abord : `Unable to find role="button" and name /Marquer envoyé/`.
5. **#4323.1 — NON FAIT.** Le doublon Eviden est entre `IncumbentEsnCard` et `CompetitivePositioningCard` (montées par `TabOverview.tsx`), pas dans `AccountCanonicalContextCard.tsx` (qui ne rend pas d'ESN, cf. son commentaire l.88). Le périmètre n'autorisait que ce dernier fichier dans `features/accounts/**` : le correctif exige de toucher les deux cartes et `TabOverview`. À reprendre quand l'autre lot a fini.

**Démo.** Semé : un signal hors métier (cours de bourse, Société Générale `s7`). Non semé : groupe d'homonymes (le sélecteur lit un registre externe, aucune table), relance « faite » (aucun écran nouveau, le geste vit sur une relance existante), ESN vue par deux sources (point 5 non fait). Aucune nouvelle table ni clé `raw_analysis` : `demo-coverage` inchangé.

**Tests lancés.** IA : 43 passés (6 fichiers 4409 + 3 nouveaux). Web : 6 fichiers / 50 passés (signals-library, watchlist), 2 fichiers / 15 passés (relances). `tsc --noEmit` web : 0 `error TS`. API : `demo-coverage`, `demo-seed.service`, 3 specs signaux démo verts ; `demo-contact-profile.spec.ts` est rouge AUSSI sur main propre (colonne `contacts` non classée), hors périmètre.

**Décisions renversées.** Aucune.
