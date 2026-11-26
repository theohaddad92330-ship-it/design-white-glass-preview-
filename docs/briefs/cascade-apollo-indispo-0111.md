# Brief — cascade d'enrichissement : Apollo à sec ne coupe plus tout (01/11/2026, décision Louis)

Branche : `claude/cascade-apollo-indispo-0111`. Plafond 300 tours. Livrable : commits + PR prête, puis STOP.

## Constat (logs prod 01/11 08:17 UTC)

`enrichContact provider failure (upstream_error): Apollo upstream_error [HTTP 422] (enrich name_org) — "You have insufficient credits!"` ⇒ l'API répond 502 « fournisseur indisponible » et AUCUNE autre source n'est essayée, alors que `KASPR_API_KEY` et `FULLENRICH_API_KEY` sont posées en prod. Côté API : `apps/api/src/modules/contacts/contacts.service.ts` ~l.5098 (`this.ia.enrichContact`) ; le `catch` ~l.5120 classe en `upstream_error`. La cascade IA (`apps/ia/app/services/contact_enrich.py`, `apollo.py`) lève sur l'erreur Apollo au lieu de passer à la source suivante.

## À faire

1. Dans la cascade IA : une erreur Apollo « crédits épuisés / plan » (422 insufficient credits, 402, 403 API_INACCESSIBLE, `ApolloPlanError`) = Apollo INDISPONIBLE pour cet appel ⇒ on CONTINUE sur les sources suivantes configurées (Kaspr, FullEnrich… selon l'ordre existant). Une source sans clé reste no-op strict.
2. Si TOUTES les sources échouent ⇒ comportement actuel (upstream_error, aucun crédit débité). Si une autre source trouve ⇒ succès normal, coût par fournisseur tracé (D19, en-tête de coût).
3. L'erreur Apollo reste JOURNALISÉE (opérateur) et l'alerte de panne (`notifyEnrichmentOutage`) part toujours pour Apollo à sec — la panne se nomme même si une autre source a pris le relais.
4. Un timeout n'est pas un échec : `unknown` arrête la reprise (doctrine) — ne pas changer ce cas.
5. Tests pytest : Apollo 422 crédits ⇒ Kaspr appelé ; Apollo 422 + Kaspr rien + FullEnrich trouve ⇒ succès ; tout échoue ⇒ erreur ; source sans clé ⇒ jamais appelée.

## Règles communes

- Étape 0 antériorité : `git grep` avant de coder ; déjà fait ⇒ écrire « DÉJÀ LÀ fichier:ligne » dans le rapport et passer.
- TDD (test rouge d'abord). Tests CIBLÉS (≤ 5 specs + `tsc -p` paquets touchés ; builder les deps workspace si le check-types les exige). JAMAIS suite complète, build global, check-types racine.
- Garde doc↔code : `node scripts/garde-derive-doc.mjs origin/main...HEAD`.
- Commitlint scopes : web|website|api|ia|mcp|dashboard-manager|ui|contracts|tooling|errors|http|observable|infra|packages.
- Aucun nom de personne réelle dans code/tests/commits/PR.
- PR prête vers main, corps finissant par :

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01RZu8c5wyRFXed6whEKHsXj
