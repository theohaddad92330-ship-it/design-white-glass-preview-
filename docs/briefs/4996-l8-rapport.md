# Rapport — claude/4996-l8 (#4996 L8 rétrécir)

**Fait** : migration `1796610035217-AccountTeamFks` — FK `account_team_members.account_id → accounts(id)` `NOT VALID`, orphelins comptés (anti-jointure), échec explicite si > 0 (aucune suppression), sinon `VALIDATE` ; `down` symétrique. Commentaire d'entité corrigé (« élargit le cloisonné »). `agent_docs/database_schema.md` à jour.
**Écarté** : FK composite d'entité (`SET NULL (entity_id)` = PostgreSQL 15+, non vérifié sur Supabase ; l'invariant reste tenu par `addTeamScope`). FK de `account_team_scopes` : déjà valides depuis L1 (table neuve), rien à valider.
**Gardé** : dédoublonnage à la lecture dans `team-guardrails.service.ts` — le rattrapage est à la demande, le compteur n'est pas garanti nul ; son test (`dédoublonne à la lecture`) reste.
**Tests** (verts) : `1796610035217-AccountTeamFks.spec` (ordre NOT VALID→compte→VALIDATE, échec orphelins, pas de composite, down), `migration-neuve-est-la-plus-grande.spec`, `team-guardrails.service.spec`.
**Non lancé** : ci:local, suite complète, build. Pas de base réelle (SQL vérifié par mock).
**Question** : relancer le dry-run `account-team-catchup` en prod avant déploiement pour savoir si des orphelins feraient échouer la migration.
