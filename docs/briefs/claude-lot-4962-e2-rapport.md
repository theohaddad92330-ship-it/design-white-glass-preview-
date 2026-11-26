# Rapport — lot E2 (#5024.2)

Branche claude/lot-4962-e2 ; base = merge de origin/claude/lot-4962-e ; code SHA a33aab89e5.

- Livré : apps/web/src/features/auth/hooks/useLeaveForeignDemo.ts (hook, réutilise useExitDemo — scope tab) ; branché apps/web/src/routes/__root.tsx (SessionContent, trace #5024.2).
- Règle : session posée + serveur « demo » + pas de marqueur d'onglet → sortie. /login laissé à useCloseDemoOnLogin.
- Marqueur démo présent → reste en démo. Pas de session / serveur real / unknown → rien (aucune entrée, seulement sortie).
- Tests (rouge → vert) : useLeaveForeignDemo.test.tsx (3 : sortie, reste en démo, REFUS).
- Lancés : useLeaveForeignDemo + useCloseDemoOnLogin + root-sans-barre-en-cours : 15/15 ; architecture/demo-frontiere… + src/routes : 55/55.
- tsc -p apps/web : 6681 erreurs TS6305/préexistantes (packages non construits) ; aucune sur mes fichiers.
- Non fait : pas de ci:local (interdit cloud) ; garde-derive-doc : rien à comparer. Hors périmètre : aucun.
- Question : « session réelle » interprété comme statut serveur ≠ demo côté autre onglet ; un admin en impersonation d'un espace démo sans marqueur serait aussi sorti — à confirmer.
