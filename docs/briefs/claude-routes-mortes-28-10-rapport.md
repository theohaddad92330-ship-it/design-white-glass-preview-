# Rapport N2 — claude/routes-mortes-28-10

Branche `claude/routes-mortes-28-10`, poussée (SHA en fin de fichier du message de push). Aucune PR.

- **#4658** DÉJÀ LÀ sur main (fa6a32ec, 89a81b7e) : routes/analyze.tsx:9, analyse.tsx, accounts/$id.tsx:19 ; test analyze-aliases.test.ts (6 verts). Rien codé.
- **#4662** DÉJÀ LÀ (434fba49) : l'attente porte son h1. Rien codé.
- **#4668** LIVRÉ : `/talents` → `/consultants` (routes/talents.tsx:9, redirect en beforeLoad, pas de `<Navigate>`). Aucun lien/doc ne promettait `/talents` côté web ; la nav « Talents » pointe déjà `/consultants`. Appelant : routeTree.gen.ts (régénéré, +21 lignes). Test : talents-alias.test.ts.
- **#4670** DÉJÀ LÀ : `GET /version` existe sur api (health.controller.ts:67) et ia (main.py:358, exempté du secret), Sentry release ia posé (#4618), depuis le 20-21/10 — AVANT l'issue. Probable cause de « aucune route » : mauvaise URL en recette (hôte web au lieu de l'hôte api/ia ?). QUESTION : la « date de construction » demandée n'existe pas (`timestamp` = heure de la réponse) ; l'ajouter demande de poser une variable au build (Dockerfile/Railway) — à décider.
- **#4682** LIVRÉ en partie : `GET mailbox/senders` déclarée `@PersonalScope` de MÉTHODE (mailbox.controller.ts:88 ; mailbox-senders-scope.spec.ts). QUESTION d'autorisation : confirmer que « personnel » est la bonne déclaration (le corps ne lit que user.userId).
  - DÉFAUT DE LA GARDE trouvé : GA-05 exemptait un fichier ENTIER dès que `@PersonalScope`/`@MarketData` y apparaissait (même sur une méthode, même en commentaire) — poser la déclaration aurait fait taire les 11 autres routes de la boîte mail. Corrigé (endpoint-guards.spec.ts : marqueurs de classe seulement + test qui sait dire NON).
  - Mesure GA-05 : avant 367 sur main courant (366 annoncé + `GET ats/oauth/callback` arrivé avec #4688) ; après 388 avec le défaut corrigé. Le gel passe 365 → 388, MESURÉ, ligne d'histoire écrite : 22 routes jusque-là invisibles (copilot-bridge 111 routes exemptées par une mention en commentaire, memory, market-watch, technology-radar) + callback. **À VALIDER par Louis** : ce relèvement est la mesure honnête, pas une ajustement ; la garde ne baissera qu'en déclarant ces routes.
  - NON FAIT (Boond, autre session) : `GET ats/oauth/callback` reste nue (retour navigateur OAuth, sans JWT par nature) — elle compte dans les 388.
  - ÉCART CI/local : NON EXPLIQUÉ. Pistes écartées : sélection test-changed (hors PR tout est « complet » ; l'architecture est « toujours jouée »), cache Turbo (inputs = fichiers du paquet). Reste à lire les logs du run 40651015734 (le shard qui contient endpoint-guards.spec.ts a-t-il vraiment couru ?). Hypothèse non vérifiée : base de comparaison/état du dépôt différent au moment du run.

Portes : vitest talents-alias + analyze-aliases 6/6 (exit 0) ; jest endpoint-guards + mailbox-senders-scope 19/19 (exit 0) ; check-types:tests api 0 erreur TS (exit 0) ; build packages exit 0. Non lancés : tsc web, lint:exports:types.
