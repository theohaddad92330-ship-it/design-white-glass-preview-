# Registre — lot DECOUVRIR-DEMO (vague L, 27/10/2026)

Preuve de recette = le geste qui prouvera le point à l'écran en production. Mesuré contre `origin/main` `8b6d99fc`.

| Point | État | Appelant / livraison | Preuve en recette |
| --- | --- | --- | --- |
| #4628.1 la démo ne lance aucune recherche à l'ouverture | déjà là | `Discover.tsx:1040-1053` (proposition, `launch` au clic seulement), rendue `Discover.tsx:2590`; garde `decouvrir-aucun-appel-sans-geste.test.ts` | Démo → `/discover` sans cliquer : aucune liste, un bouton propose la 1re recherche enregistrée ; le clic MONTRE la liste |
| #4628.2 le même défaut hors démo | déjà là | `Discover.tsx:1043` (`isDemo`), mémoire proposée jamais restaurée (`resumeLastSearch`, `Discover.tsx:871`) | Espace réel avec recherche récente → `/discover` nu : « Reprendre » proposé, rien ne part |
| #4556.1-3 liste, levée+lien, dossier Occitanie | déjà là | `DEMO_DISCOVER_SAVED_VIEWS`, `demoDiscoverResponse`, dossier Airbus (`demo-occitanie-dossier.ts`); `DEMO_DISCOVER_ARRIVAL_COVERAGE` = seedée | Démo → proposition → clic : ≥ 8 cartes dont une levée avec lien ; dossier Airbus onglet Contacts : zone d'abord, `hors zone (Occitanie)` |
| #4556.4 classement `demo-coverage.ts` | déjà là | `demo-coverage.ts:1904` (seedée, jamais déplacée) | — |
| Droits : la démo ne déclenche aucune collecte payante | livré | `ia-proxy.controller.ts` `discover` : garde démo (400) ; la recherche libre appelait le modèle sans garde. Spec `discover-demo-no-paid-collection.spec.ts` (refus + registre/signaux sans appel IA + témoin hors démo) | Démo : toute recherche rend la liste scriptée ; `POST /ia/discover` répond 400 |
| #4518.1 message : ce qui est arrivé, ce qui reste | livré | `discover.json` fr/en `degraded.reason.network_error` / `rate_limited` (rendus par `DegradedBanner` / `SearchReadingNotice`) | Provoquer un registre muet : la ligne dit « pas de réponse à temps — pas forcément une panne… relance dans quelques minutes » |
| #4518.2 débit respecté, 429 réessayée | déjà là | `recherche_entreprises.py:163,412-424` (`_may_retry_429`, `throttle`) ; tests `test_4617_registry_429.py` | Pas à l'écran : preuve par test, service seul |
| #4518.3 cache 30 j servi si la source refuse | déjà là | `recherche_entreprises.py:1094-1128` `list_companies` | Pas à l'écran : preuve par test, mesure en charge côté service |
| #4617 backoff + jitter + coupe-circuit + service dégradé | déjà là | `recherche_entreprises.py:88-160` (jitter 25 %, `REGISTRY_BREAKER`, `registry_refusal_reason`, `degraded_entry`) ; `test_4617_registry_circuit.py` | Idem : se mesure dans Sentry (BELLUM-IA-Q/R/S/V/W/Z), pas à l'écran |
