# Rapport — claude/4996-l1-l2 (#4996 L1 + L2, Refs #4731)

**Branche** : `claude/4996-l1-l2` (base #5103 / `integration-4962-r2`). Pas de PR (brief).
**Migration** : `20261101100000-AccountTeamScopes` (table `account_team_scopes`, index, RLS lecture sur elle et sur `account_team_members`). `agent_docs/database_schema.md` mis à jour.

**Fait**

- L1 : migration + spec (CHECK = constantes du contrat `ACCOUNT_TEAM_SCOPE_LABEL_*`, RLS, `down` sans toucher `account_team_members`) ; entité `AccountTeamScopeEntity` + `database.module.ts` ; contrat (`scopes`, `can_edit_own_scope`, `addAccountTeamScopeRequestSchema`) ; test du contrat.
- L2 : `accountTeam` enrichi (zones du responsable et des membres, dédoublonnage responsable/co-équipier à la lecture) ; `POST accounts/:id/team/:userId/scopes`, `DELETE …/scopes/:scopeId` ; libellé recopié de l'entité ; entité d'un autre compte, non-membre, autre espace, membre qui pose celui d'un autre : refusés (tests négatifs) ; `addTeamMember` refuse le responsable ; retirer un co-équipier archive ses zones ; `canEditAccountTeam`/`canEditOwnScope` purs dans le contrat ; `releaseMemberWork` archive équipes + zones (auteur = acteur, ou le partant en back-office) ; `AccountAssignmentService.assign` archive la ligne d'équipe du nouveau responsable dans la même transaction (zones conservées) ; rattrapage `POST internal/admin/team/account-team-catchup` (dry-run par défaut, un espace, `removedBy` requis hors dry-run, compte le doublon sans l'archiver).

**Tests** (verts) : contracts `team-guardrails-scopes.test.ts` (11) ; api `20261101100000-AccountTeamScopes.spec`, `migration-neuve-est-la-plus-grande.spec`, `team-guardrails/*` (61), `assignment/*`, `release-member-work.spec`, `workspace-team.release-portfolio.spec`, `team-two-users.integration.spec`. `tsc --noEmit` contracts OK ; api OK hors `@bellum/email` (module non construit ici, antérieur).
**Non lancé** : ci:local, suite complète, build (interdits). Pas de test sur base réelle (migration vérifiée par mock du SQL).

**Écarts / questions**

- Le script de diagnostic du doublon (Q3) est le dry-run du rattrapage (`responsibleAlsoMember`) ; pas de script séparé.
- `scopes`/`can_edit_own_scope` sont optionnels dans le contrat (ajout seul, ancien client OK).
- Hors périmètre (L3+) : visibilité cloisonnée, écrans, démo, `changes/*.yml` (aucun fichier chaud touché).
