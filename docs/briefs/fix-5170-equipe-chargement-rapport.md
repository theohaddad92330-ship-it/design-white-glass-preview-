# Rapport — fix #5170 (/settings/team bloqué sur « Chargement de l'équipe… »)

- Branche : `fix/5170-equipe-chargement` (depuis origin/main).
- Cause : donnée restaurée du cache persistant < `staleTime` (30 s) ⇒ pas de refetch ⇒ `awaitingCurrentWorkspace` vrai à jamais.
- Correctif : `useSettledTeam.ts` — `useEffect` qui déclenche UN `refetch()` quand l'attente est vraie et `!isFetching`. Contrat #4630 inchangé.
- Test : `useTeam.stale-role.test.tsx` (cas #5170) rouge (timeout, aucun appel) puis vert ; avec `TeamView.test.tsx` : 29 verts.
- Non lancé : ci:local, suite complète, check-types (réservés à la CI).
