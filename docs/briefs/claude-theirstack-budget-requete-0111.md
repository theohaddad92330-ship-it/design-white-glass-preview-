# Lot O — URGENT : 301 crédits TheirStack par recherche UTILISATEUR (pas par vague) ; rayon 25 km par défaut

Branche : `claude/theirstack-budget-requete-0111`

## Compris (recette prod 01/11 ~10:20 UTC, ia 140f733e28 qui CONTIENT la PR #5095)

- Console TheirStack : UNE recherche Découvrir « Data & IA » Île-de-France (11:20:52→11:21:33 heure de Paris) = **~900 crédits** : 5 comptes à 1 crédit, puis 15 appels à 59-60 offres = 5 requêtes × **3 vagues**. « cloud » seul = 3 × 75 = 225 (conforme).
- Cause probable : #5095 a posé `THEIRSTACK_CREDITS_PER_SEARCH_MAX = 301` (`apps/ia/app/services/discover_skill_offers.py:123`) compté sur l'objet `SkillHarvest` (une MOISSON). Une recherche Découvrir lance PLUSIEURS moissons (paliers d'élargissement / cascade de zone / relance « délai » / compétences traduites — à trouver dans `apps/ia/app/routers/discover.py` et ses appelants de `paid_skill_offers`/`SkillHarvest()`), chacune repart à 0.
- Même recherche : « 0 trouvés · 0 retenus — Recherche coupée par le délai : 150 employeurs restent à vérifier », 139 sans SIREN (#4519) — HORS de ce lot (lot F traite les SIREN), mais NOTER dans la PR si les vagues TheirStack mangent le délai.
- #4515 : « Toulouse » dans « Cadrer la recherche » → rayon par défaut **100 km** (liste ville exacte/10/25/50/100), bandeau « Revenir à 100 km ». Attendu (#4515) : une ville seule cherche dans un rayon de **25 km** par défaut, affiché et modifiable, réellement envoyé (aller-retour URL).

## Je fais

1. **Budget par REQUÊTE utilisateur** : le compteur de crédits TheirStack vit le temps d'UNE requête `/discover` (et d'UN tour de recherche d'offres de Laura) — ContextVar posé à l'entrée du routeur (ou objet de requête transmis), partagé par TOUTES les moissons/vagues/paliers de cette requête. `SkillHarvest` le LIT, ne le recrée pas. Réservation avant l'`await`, ajustée au réel (inchangé). Une vague qui n'a plus de budget ne part pas : `notAttempted` + cause `creditBudget` (inchangé).
2. Test de NON qui REJOUE le cas prod : une recherche qui déclenche 3 vagues × 5 appels (doublure de `_request` comme `tests/test_theirstack_plafond_300.py`) dépense ≤ 301 crédits AU TOTAL ; l'ancien code (budget par moisson) échoue sur ce test. Lister dans la PR CHAQUE endroit qui crée une moisson payée (fichier:ligne).
3. **#4515 rayon 25 km** : trouver le défaut 100 km (web : `apps/web/src/features/discover/*`, `apps/web/src/lib/zones/*` — `grep -rn "100" … | grep -i "radius\|rayon\|km"`). Une ville seule ⇒ 25 km par défaut, affiché, modifiable, ÉCRIT dans l'URL (`radiusKm=25` ou équivalent existant) et relu à l'identique ; « Revenir à … » propose la valeur précédente réelle. Si le 100 km vient d'une décision écrite (#4429 / #4675 « élargir par paliers »), la citer et garder le palier d'élargissement AUTOMATIQUE (25 → 50 → département), mais le DÉFAUT affiché reste 25. Test aller-retour URL.
4. Tests qui savent dire NON, un par point.

## Je ne fais PAS

SIREN / délai (lot F), Laura UI, autres sources payantes.

## Droits

Aucune surface d'accès touchée.

## Je défais

Corrige #5095 (« revient sur #5095 : budget par moisson → par requête »). #4515 : citer #4429/#4675 si touchés.

Périmètre : `apps/ia/app/services/discover_skill_offers.py`, `apps/ia/app/services/data_sources/job_aggregators.py`, `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/tests/*`, `apps/web/src/features/discover/*`, `apps/web/src/lib/zones/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `agent_docs/env-reference.md`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/theirstack-budget-requete-0111` (SIMPLE ; pre-push en run_in_background puis attendu) ; après chaque push `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify`/`--force`.
- POINT 1-2 D'ABORD et poussé avec PR PRÊTE dès qu'il est vert (urgence : crédits consommés en prod), puis le 3 sur la même PR.
- Plafond 200 tours. Tests CIBLÉS seulement (pytest des fichiers touchés, vitest ciblés) ; Prettier 3.9.10.
- Doctrine : jamais de donnée fictive ; une source coupée par le budget est NOMMÉE (compteur), jamais silencieuse.
- Rapport ≤ 10 lignes : crédits max d'une recherche à 3 vagues avant/après.
