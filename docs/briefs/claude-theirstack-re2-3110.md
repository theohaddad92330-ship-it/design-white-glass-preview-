# Lot H — TheirStack refuse nos requêtes depuis le 29/10 (regex non re2)

Branche : `claude/theirstack-re2-3110`

## Compris (mesuré 31/10 : console TheirStack + logs IA prod)

- 27/10→31/10 : 1 761 requêtes, **1 352 en 422**, 98 en 402, 311 en 200. Crédits : 28/10 = 7 088, 29/10 = 6, 30/10 = 0, 31/10 = 0 ⇒ TheirStack ne rend PLUS rien depuis la fusion de #4727 (29/10).
- Log IA prod 31/10 16:54 : `theirstack search failed (status 422) … {"error":{"code":"E-013","title":"Invalid regex expression","description":"Make sure you're using re2-compatible syntax"}}` puis `source_health … HTTP 422 [upstream_error]` et `COMPETENCE-TROUVE — source theirstack tombée`.
- Cause : `apps/ia/app/services/internship_posting.py:19-36` — `title_patterns_not()` envoie `^(?!.*…).*(?<![a-z]-)(?<![a-z])(?:stages?|…)(?![a-z])(?!-[a-z]*stage)` à `job_title_pattern_not` (`job_aggregators.py:820` et `:1260`). Lookahead/lookbehind = INTERDITS en re2.
- Aussi mesuré : #4724 FAIL — 0 requête sur 1 158 porte `job_id_not` ni `discovered_at_gte` (rejeu = repaie) ; #4725 FAIL — les 501 requêtes de comptage `include_total_results:true, limit:1` sont toutes en 422 (même regex).

## Je fais

1. **#4723.2 regex re2** : réécrire le motif de `job_title_pattern_not` en re2 PUR (pas de `(?=`, `(?!`, `(?<=`, `(?<!`, pas de backreference) — ex. une LISTE de motifs simples `(?i)\bstages?\b`, `(?i)\bstagiaires?\b`, `(?i)\binterns?(hip)?s?\b`, et l'exception « stage manager » traitée côté local (`is_internship_posting` reste le filtre Python fin après réception). Vérifier dans l'OpenAPI TheirStack (`https://api.theirstack.com/openapi.json`, si le réseau le permet) que le champ accepte une liste et la sémantique (OR). Test qui sait dire NON : chaque motif envoyé compile avec le module `re2` (`google-re2`) s'il est installable, SINON une garde qui refuse tout `(?=`, `(?!`, `(?<` et `\1` dans tout motif envoyé à TheirStack (balayer TOUS les champs `*_pattern*` des corps construits par `job_aggregators.py`). La garde doit échouer sur l'ancien motif.
2. **#4725.2 comptage** : la requête de comptage (`theirstack_skill_count`) repasse en 200 avec le motif corrigé ; test du corps envoyé.
3. **#4724.2 anti-redite** : sur un rejeu de la même recherche, le corps porte `job_id_not` (ids déjà achetés, depuis le stock/cache existant `STOCK_NAMESPACE_SKILL`) ou `discovered_at_gte` (date du dernier achat). Lire d'abord ce que #4730 a livré (`git log --grep 4724`) : le code existe peut-être mais n'est pas appelé (chercher l'APPELANT). Test sur le corps du 2e appel.
4. **#4723.3 le 402 dit** : un 402 (crédits épuisés) se journalise en `source_health` avec un motif DISTINCT (`quota`), jamais confondu avec un 422 ; pas d'affichage nommant la source (doctrine) ; test.
5. Tests ciblés `apps/ia/tests/test_*theirstack*`, `test_*internship*`, `test_*4723*`, `test_*4724*`, `test_*4725*`.

## Je ne fais PAS

Changer de fournisseur, budgets, Découvrir côté web, le filtrage local des stages (il reste).

## Droits

Aucune surface d'accès.

## Je défais

Le motif de #4723 (lookarounds) — « revient sur #4723 », raison : refusé par TheirStack (E-013), 0 offre depuis le 29/10.

Périmètre : `apps/ia/app/services/*`, `apps/ia/app/services/data_sources/*`, `apps/ia/tests/*`, `apps/ia/requirements*.txt`, `docs/briefs/*`, `agent_docs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/theirstack-re2-3110` APRÈS CHAQUE POINT VERT (pre-push en fond + Monitor). Jamais main, jamais `--no-verify`.
- Plafond 150 tours. TDD, trace `# #4723.2 — …`. Jamais d'appel réel payant à TheirStack depuis un test.
- PR PRÊTE vers main dès le point 1 poussé (c'est le correctif qui rallume la source : il doit pouvoir partir seul), corps = points + `fichier:ligne`. Rapport ≤ 10 lignes.
