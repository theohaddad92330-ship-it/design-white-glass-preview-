# Lot L — TheirStack : 300 crédits AU PLUS par recherche Découvrir

Branche : `claude/theirstack-plafond-300-0111`

## Compris (console TheirStack de Louis, 01/11 08:56-09:06)

- UNE recherche « data » Île-de-France = 1 appel de compte (1 crédit) + 9 pages de 100 = **901 crédits** en 25 s. « cybersécurité » Grand Est : 1 + 100 + …
- Cause en code (`apps/ia/app/services/discover_skill_offers.py`) : `_pages_for(total)` (:410) achète autant de pages de `PAID_SKILL_PAGE_SIZE` (100) qu'il faut pour couvrir `total` ; le seul frein est `SKILL_PAID_CALLS_MAX = 18` APPELS (:114), jamais un nombre de CRÉDITS. TheirStack facture 1 crédit par offre RENDUE (+1 par compte `total_results`).
- Louis 01/11 : « TheirStack doit être bloqué à max 300 crédits par requête ».

## Je fais

1. **Budget nommé** `THEIRSTACK_CREDITS_PER_SEARCH_MAX = 300` (un seul endroit, GA-26), commentaire daté « Louis 01/11/2026 ». Compteur de crédits TheirStack PAR MOISSON (même objet que `harvest.paid_total`) : +1 par appel de compte (`_count_results`, seulement s'il part vraiment — un compte servi par le cache ne coûte rien), + `len(offres rendues)` par page (ou la `limit` envoyée si le rendu est illisible — on compte au pire, jamais au mieux).
2. **Avant chaque appel TheirStack** (compte ou page), réserver le coût MAX de l'appel AVANT l'`await` (les compétences tournent en parallèle sous asyncio : réserver puis ajuster au réel, jamais lire-puis-écrire après l'await). Si la réserve dépasse le budget : l'appel ne part pas, `stats["notAttempted"] += 1`, cause `creditBudget` nommée dans `stats["causes"]`, log `COMPETENCE-TROUVE source=theirstack payé=non budget_credits=… atteint`.
3. **Partage entre compétences** : jusqu'à 3 compétences (`SKILL_MAX_TERMS`) se partagent les 300 ; une compétence ne prend pas tout. Règle simple et testée (ex. part = budget restant / compétences restantes à servir, plancher 25). La `limit` envoyée à `theirstack_skill_offers` devient un paramètre (`limit: int = PAID_SKILL_PAGE_SIZE`) borné par la part restante ; la PAGINATION reste juste : page n>0 seulement à taille pleine (offset = page × limit doit rester cohérent) — si la part restante < une page pleine, on s'arrête (ou on utilise `offset` SEULEMENT s'il est documenté dans l'API TheirStack, lu dans le dépôt ou la doc officielle, jamais deviné).
4. **Toutes les portes d'entrée TheirStack d'une recherche Découvrir** respectent le budget : `grep -n "theirstack" apps/ia/app` — moisson compétence, recherche par NOM d'employeur (`job_aggregators.py` ~:1242, :1612, `_THEIRSTACK_MAX_NAMES`), recherche d'offres de Laura (`skill_scope`). Une porte hors recherche Découvrir (veille, fiche compte) : la nommer dans la PR, ne pas la changer.
5. La lecture tronquée par le budget n'est PAS rangée au cache 30 j comme complète (même règle que le plafond d'appels : `complete = False`).
6. Tests qui disent NON : (a) total=900 → crédits dépensés ≤ 300, le 4e appel ne part pas ; (b) 3 compétences en parallèle → somme ≤ 300 et chacune a eu sa part ; (c) compte servi par le cache → 0 crédit ; (d) l'ancien comportement (9 pages) échoue sur le test (a). Mettre à jour `test_discover_paid_zone_4676.py` / `test_decouvrir_sources_payantes_4419.py` si leurs attentes supposent > 300.
7. `agent_docs/env-reference.md` ou la fiche coût de Découvrir : une ligne « 300 crédits TheirStack par recherche (Louis 01/11) ».

## Je ne fais PAS

Toucher aux autres sources payantes, au cache 30 j, au stock #4724, à l'UI. Aucune nouvelle variable d'environnement (constante en code).

## Droits

Aucune surface d'accès touchée.

## Je défais

Revient sur #4725 (« un compte… une lumière, jamais un plafond », Louis 25/10) et #4676 (L4) pour TheirStack seulement : le nombre de PAGES n'est plus seul borné par les appels — citer « revient sur #4725 / #4676 (Louis 01/11) » aux lignes touchées.

Périmètre : `apps/ia/app/services/discover_skill_offers.py`, `apps/ia/app/services/data_sources/job_aggregators.py`, `apps/ia/app/routers/discover.py`, `apps/ia/tests/*`, `agent_docs/*`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/theirstack-plafond-300-0111` (push SIMPLE ; pre-push en run_in_background puis attendu) ; après chaque push `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify`/`--force`.
- PUSH APRÈS CHAQUE POINT VERT. PR PRÊTE vers main dès le premier point poussé, titre `fix(ia): TheirStack plafonné à 300 crédits par recherche Découvrir`.
- Plafond 150 tours. Tests CIBLÉS seulement (pytest des fichiers touchés). TDD, trace `# Louis 01/11 — …`.
- Doctrine : jamais de donnée fictive ; une source coupée par le budget est NOMMÉE (compteur), jamais silencieuse ; aucune source nommée à l'écran.
- Rapport ≤ 10 lignes : crédits max d'une recherche avant/après (calculé par le test).
