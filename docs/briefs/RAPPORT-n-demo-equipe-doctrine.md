# Rapport — N : démo équipe + règle de l'appelant (branche claude/n-demo-equipe-doctrine, base suite-a-contacts-4731)

⚠️ Prémisse du brief périmée : la salle n'était déjà plus solo — #4158.13 (14/10) a posé TROIS collègues fictifs (`DEMO_COLLEAGUES`,
`@exemple.test`, domaine réservé). Je n'ai donc PAS ajouté un 5ᵉ membre. Ce qui manquait : un compte analysé par l'occupant ET travaillé
par un collègue (chacun ne travaillait que ses comptes). Q : garder `exemple.test` (convention du jeu) ou passer à `example.org` ?
Point 1 — `DEMO_SHARED_ACCOUNT_WORK` (demo-dataset.ts) : Société Générale (analysée par l'occupant) porte une tâche `action_plan_items`
portée par Léa Marchand (fictive) ; semée par `seedColleagues`. Une tâche, jamais `user_actions` : deux auteurs = fausse « collision » (#3398.2).
Rien ne sort (aucun envoi, aucun appel fournisseur). Classée `compteAnalyseTravaille: seede` (demo-coverage.ts).
Renversement de #2117.14 écrit (date + raison de Louis) dans demo-dataset.ts, demo-seed.service.ts et la fiche de couverture.
Garde : `demo-team-shared-account.spec.ts` (non solo, compte de l'occupant, collègue réel, aucune preuve d'envoi, semis réel). Rouge d'abord
(4 échecs sur 5 ; le 1ᵉʳ — « pas solo » — passait déjà, la prémisse étant fausse) -> vert. `demo-team-colleagues.spec.ts` : décompte d'INSERT +1, assumé.
Recyclage : `demo-seed-fingerprint.ts` hache le nouvel export (garde `demo-seed-fingerprint.spec.ts` verte) -> une salle déjà louée se resème
au prochain bail ; `action_plan_items` est purgée avant `accounts` (demo-reset.service.ts:116) ; `workspace_members`/`profiles` survivent.
Point 2 — `c146_un_lot_n_est_fini_que_quand_son_appelant_existe` (doctrine-registry.ts, clé + entrée en fin de liste, forme de c145) avec les six cas
#4734 #4735 #4742 #4754 #4759 #4760 ; fiche dans agent_docs/doctrine.md. Honnête : `absent` · `unenforced` (aucune garde machine, `knip` ne voit pas l'appelant).
Test `doctrine-registry.test.ts` rouge -> 40/40 vert (le test de comptage ne compare qu'à DOCTRINE_KEYS : il ne pouvait pas rougir seul).
CLAUDE.md : rien posé ; aucune ligne nécessaire. Tests : 10 suites jest demo (404 verts) + vitest registre/analytics ; pas de tsc (zod 3 en env : liens
node_modules repointés sur zod 4.4.1, non suivis). Non fait : garde-appelant machine. Pas de PR, issues intactes.
