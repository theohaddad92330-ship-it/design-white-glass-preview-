# Rapport — trois rouges web de la vague N (28/10)

- Base f5a08b24 ; SHA poussé : voir `git log -1` de la branche `integration-vague-n-2810` (commit « fix(web): trois rouges de la vague N »).
- Rouge 1 (#4521.5/#4418.1) — TEST changé : l'assertion exige « n'est pas une preuve d'envoi » ET « J+3, J+6, J+9 », sans figer la phrase ; 3 titres fautifs (envoi affirmé, cadence tue) la font échouer. Libellé de production intact.
- Rouge 2 (#4591) — cause : l'helper `launch()` cliquait hors `act` et ne vidait que deux fois les microtâches ; React rend sur une vraie macrotâche, donc le 1er sondage partait ou non selon la charge (le test en échec changeait d'un run à l'autre : 12/12, puis 1 échec, ailleurs). Le code de production du lancement est correct, je n'y ai pas touché. Clic + vidage passent dans `act` ; 4 runs consécutifs 12/12.
- Rouge 3 (#1914) — cause : `p-contacts-card` (#4610.5) s'est insérée avant `p-priorities` ; « Par où je commence dans mon portefeuille ? » passait 7e, derrière « voir plus » (plafond de six amorces, #1321.2) : régression visible en démo. CODE changé : la carte Contacts est déplacée juste après `p-priorities` (demo-chat-script.ts). Test inchangé.
- vitest : planMail 7/7 · SyncLaunchFlow 12/12 · demo-runs-the-real-shell 10/10. `tsc --noEmit -p .` (apps/web) : 0 error TS.
- Prérequis posé localement (non commité) : `tsc --build` de packages/contracts (dist absent dans la VM).
- Aussi lancé : src/features/demo + demo-turn.test.ts, verts sauf `demo/api.test.ts` (timeout 20 s, réseau de la VM, hors périmètre, non investigué).
- Aucune garde d'architecture ne lit demo-chat-script.ts (git grep). Aucune clé i18n touchée. Aucun skip.
- Question : le plafond de six amorces fait dépendre la visibilité de l'amorce phare de l'ordre du script ; une garde dédiée serait à décider.
