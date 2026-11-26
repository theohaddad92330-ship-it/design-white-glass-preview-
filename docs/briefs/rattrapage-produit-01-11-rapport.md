# Rapport — rattrapage produit 01/11 (branche `claude/rattrapage-produit-01-11`)

Livré (commit) — la preuve écran attendue se lit au rendu de chaque test cité.

- #4671.2 → liste des lots relue toutes les 15 s tant qu'un lot tourne (25d06a7e)
- #4941.1 #4941.2 → entrée `canceled` traduite ; compteur Filtres = une valeur = une puce, revient sur #4498 (25ee387c)
- #4688.11 → `POST /ats/test` rend `warnings`, bouton « Vérifier la connexion », semé en démo (72c8e653)
- #2202.15 → source « besoin » : `GET /outreach/audience/needs` + sélecteur (a4ca4891)
- #2202.36 → `owner_id` d'étape (membre vérifié, `null` efface), choisi dans Modifier, nommé sur la ligne, démo (90ac08da, f1f423ee)
- #4819.4 → « Castaing Transports (démo) », seule offre récente fermée (0a3897d7)
- #4711.1 #4711.2 → `built_at` sur `/version` api et ia, posé par la commande de build (332295c8)
- #4928.3 → `web_role_search` prend `name_matches_account` (0406dfde `fix(ia)`)
- #4868.1 #4868.4 → `splitInternalHref` unique, suivi par `laura-deep-links` (0406dfde web)
- #4631.4 #4631.5 #4631.6 → « 1–12 », tuile et badge = `listed`, « + N par l'élargissement » (521b0251)
- #4770.2 #4770.3 #4770.4 → audit contacts.json (rien d'autre à renommer), test total = lignes, trace « espace seulement » (247d1183)
- #4576.7 → `TabNav` `max-md:min-h-11` (848db1f2) ; parité clair/sombre et 1 colonne : déjà portés par les gardes existantes, non retouchés
- #4928.5 → « Écarter les contacts de cette entité » (954c5ce1) ; le filtre par entité existait
- #4631.3 → garde `test_4631_gabarits_collection.py` (7425c9b0)
- #4733.2 #4733.6 → `executive_role` au contrat, mention sur la ligne, SNCF semé (89decb2c)

Déjà là : aucun point entièrement satisfait sur origin/main (grep des issues vérifiés avant chaque point).

Non fait

- #2202.12 (vue enregistrée) : aucun écran n'écrit de vue de scope `contacts` (seuls `talents`, `discover`) ; la porte serait toujours vide.
- #4543.2 : un producteur de `raw_analysis.unknowns` passe par le prompt de synthèse (porte qualité IA) ; sans lui il doublonne le lecteur.
- #4733.2 (partie) : pas de jumeau `discover_card_facts` Python/TS (fixtures partagées) — l'offre de dirigeant reste « fort » (hiring).
- #4711 : la question « la date apporte-t-elle plus que le SHA ? » reste celle de l'issue ; livré tel que demandé.

Questions : #4631.6 lu comme « + N ajoutés par l'élargissement de zone » (widenedCount) — confirmer. #4770.2 : comptage par valeur au lieu de critère (#4941.2) à confirmer.

SHA de tête : 44b5d20a (types web, contracts, api-tests verts avant push ; ci:local vert).
