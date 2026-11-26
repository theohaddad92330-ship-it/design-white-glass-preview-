# Rapport lot BUGS-PROD — PR 12C (branche `claude/pr12c-bugs`)

- #4478 conforme — `fetch_last_loss` + 4 jumeaux (`order(desc=)` : chat_tools, rag_service, weekly) sur l'API réelle de `TableQuery` (`not_is`, `ascending`) ; test sur le vrai builder + garde AST.
- #4475 conforme (cause déduite, Sentry illisible d'ici) — `account_id` snake_case ignoré par le contrat → liste de tout l'espace ; replié sur `accountId`, 400 si non-uuid.
- #4479 conforme — nom normalisé par compte tenu avant écriture : import (`writeContacts`), org chart, import manuel, CRM, réunions, saisie, promotion ; jamais de fusion.
- #4471 conforme — lecture par curseur (created_at, id), pages de 5 000, plafond mémoire 100 000, contacts ET comptes.
- #4480 conforme (partiel sur la cause) — les 2 requêtes GraphQL VALIDENT contre le schéma public Railway (introspection sans jeton) : pas de champ périmé ; l'échec prod est l'accès/débit. Ajouté : repli exponentiel après panne, noms en cache 10 min, erreur dite une fois (classe « accès refusé »).
- #4477 bloqué : cause non reproduite — 3 scénarios composant (`?new=1`, depuis un fil, tour long) restent verts ; test de garde ajouté (`Chat.new-thread-first-send.test.tsx`). Piste : échec de flux avant acceptation (~60 s) qui restaure la saisie ; à rejouer en prod avec le journal réseau.
- #4486 conforme — `py-4` en double retiré. #4474 conforme — icône/chevron `shrink-0`, `gap-2`. #4470 conforme — verdict sans `whitespace-nowrap`.
- #4472 conforme — DPA, dpa-a-signer, registre : europe-west4 (Pays-Bas) ; garde `railway-region.spec.ts`.
- #4485 conforme — `POST /plan-items/close-stale` (propriétaire seul, 404 sur toute la demande sinon, issue `other`, mode `manual`), bandeau FR/EN, démo (2 relances -45/-92 j), changelog.
- Retiré : rien. À trancher par Louis : #4485 utilise l'issue `other` (pas `abandoned`) ; seuil 30 j en contrat (`STALE_ACTION_DAYS`).
- Tests : pytest 15+3 verts ; jest api (contacts, import, crm-core, supervision, actions, demo) verts ; vitest web (today, missions, chat nouveau fil, accounts, architecture 241 fichiers) verts ; tsc web 0 error TS ; tsc api : 3 erreurs préexistantes `@bellum/email` (paquet non compilé ici).
- Rouge avant vert vérifié : #4478, #4471, #4480, #4479 (import). #4475/#4486/#4474/#4470 écrits avec le correctif.
