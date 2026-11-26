# Brief B — Apollo Professional : 3 branchements (décision Louis 02/11)

Branche `claude/apollo-pro-0211`. Plafond 300 tours. Commits + PR prête, puis STOP. Contexte : le plan Apollo est passé de Basic à Professional le 01/11 ; test réel : People-Match renvoie des e-mails pro déverrouillés (plus `email_not_unlocked@`), organizations/enrich renvoie des champs non lus.

1. **Croissance d'effectif** : lire `organization_headcount_six_month_growth`, `_twelve_month_growth`, `_twenty_four_month_growth` (`apps/ia/app/services/apollo_org.py` : TypedDict `ApolloOrgEnrichRaw` ~l.60-90, modèle `ApolloOrgEnrichment` ~l.116-145, mapping `_to_org_enrichment` ~l.273-299), les faire voyager jusqu'à la fiche compte (contrat + API + web) et l'afficher comme signal de compte (« Effectif +12 % sur 12 mois »), absent ⇒ rien (jamais 0). Démo seedée.
2. **Fraîcheur du poste via People-Match** (#4799) : mesure du 01/11 (n=44) — People-Match (parcours daté) 20/20 justes, ~0,025 $/contact ; la relecture en place (`searchPeopleByName`) 0/17 sur les départs. Brancher People-Match comme source de fraîcheur : sur un contact, dire « en poste — vérifié le … » ou « a quitté <employeur> (… ) », sinon inconnu ; jamais de probabilité ; coût tracé (registre D19, en-tête de coût) ; geste utilisateur ou enrichissement, pas un balayage du parc. Lire `apps/ia/app/eval/employment_freshness/` (protocole) et l'existant fraîcheur (axe « Fraîcheur du poste » du score).
3. **Rattrapage ciblé des e-mails verrouillés** : les contacts enrichis sous Basic ont fini « aucun canal » (placeholder écarté, `apollo.py` ~l.410). Ajouter un rattrapage PAR ESPACE (endpoint `internal/admin`, `InternalSecretGuard`, sur le modèle de `placeholder-email-catchup`) : `dryRun` par défaut qui COMPTE les contacts concernés et ESTIME les crédits avant toute dépense ; vrai passage = rejeu de l'enrichissement e-mail pour ces seuls contacts ; n'écrase jamais une saisie manuelle ; idempotent. Comment savoir qu'un contact était « verrouillé » ? si aucune trace n'existe, le dire et proposer le critère le plus étroit (ex. match Apollo présent + e-mail absent + enrichi avant le 01/11). Commande exacte dans le corps de PR.

## Règles communes

- Étape 0 antériorité (`git grep`) par point ; déjà fait ⇒ « DÉJÀ LÀ fichier:ligne » au rapport.
- TDD. Tests CIBLÉS (≤ 5 specs par point + `tsc -p` paquets touchés). JAMAIS suite complète, build global, check-types racine.
- Toute fonctionnalité user-facing remplie en DÉMO (`demo-dataset.ts`, `DemoSeedService`, classée dans `demo-coverage.ts`).
- « Non mesuré » ≠ 0 ; aucune probabilité affichée ; nos fournisseurs ne se nomment jamais à l'écran.
- Garde doc↔code `node scripts/garde-derive-doc.mjs origin/main...HEAD`. Commitlint scopes web|api|ia|contracts|…
- Aucun nom de personne réelle dans code/tests/commits/PR.
- PR prête vers main, corps finissant par :

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01RZu8c5wyRFXed6whEKHsXj
