# Rapport SIGNAUX-HORS-METIER-4403 (25/10)

- **Prémisse du brief FAUSSE sur `origin/main` e641b2be** : `SignalsLibrary.tsx` porte la marque (l.54 import, l.158 `<OutOfTradeTag testId="signal-card-out-of-trade">`, l.634 `isOutOfTrade(item, profile)`). `git log -S"signal-card-out-of-trade"` : seul `ed9dff9a` la touche, jamais retirée. Pas de fusion perdue. Le « 0 hors métier » de la prod vient donc du commit SERVI, antérieur (déploiement), pas de main.
- Rangement : plus une partition mais le tri `trade` (défaut, `signal-library.ts:127`, #4544) ; la garde modèle le couvre.
- **Garde : elle savait déjà dire NON.** Témoin 1, marque retirée de la vue → ancienne garde ROUGE (1 failed) ; nouvelle garde 2 failed | 1 passed. Témoin 2, rangement neutralisé (`signal-library.ts:127`) → 3 failed | 2 passed. Restauré → 5 passed. (Le « PASS (3) FAIL (0) » du brief est exact SUR main : la marque y est.)
- Renforcée (`SignalsLibrary.outOfTrade.test.tsx`) : 3 cas rendus — marque en texte + ordre des cartes rendues ; les 3 offres Carrefour Banque (libellés de prod) marquées et après « Analyste SOC N2 » ; profil non lu → aucune marque à tort, offre non écartée.
- Chaîne : aucun champ « hors métier » à servir côté API/IA par conception (doctrine : décidé sur le profil, jamais un mot-liste). L'API sert type/source_kind/requester (`watchlist.ts:130`) ; le verdict = `isOutOfTradeHiring` (`discover-hiring-domain.ts:160`) avec profil `useHiringDomainProfile`. `discover_skill_offers.py` n'est pas dans le chemin de /signals.
- Démo (règle 9) : /signals n'avait AUCUNE offre hors métier (celle de « Gérant de magasin » est sur Découvrir). Semé : SNCF « Agent de circulation ferroviaire H/F » (`demo-dataset.ts` ~l.2491), classé dans `demo-coverage.ts`.
- Tests : web 5 passed (2 fichiers) ; api jest 4 suites / 107 passed (demo-coverage + 3). Pas de tsc complet.
- **Recommandation** : vérifier que la prod sert bien un commit ≥ e641b2be avant de rouvrir #4403 ; si l'écran reste muet après déploiement, c'est le profil (déduction/échec) qu'il faut mesurer, pas la vue.
- Non fait : recette navigateur ; aucune PR (consigne).
