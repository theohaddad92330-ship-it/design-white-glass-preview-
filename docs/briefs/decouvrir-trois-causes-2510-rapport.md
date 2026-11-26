# Rapport — DECOUVRIR-TROIS-CAUSES (#4419, #4518, #4284.1, #4284.26)

Branche `claude/decouvrir-trois-causes-2510` · code : `21369646` · base `origin/main` `1bb7793a`. Pas de PR.
Tests : `apps/ia/tests/test_decouvrir_trois_causes_2510.py` (12 verts) + 20 fichiers voisins verts (rc=0). Hors lot :
2 échecs de `test_discover_fresh_jobs_4430.py`, déjà rouges sur `origin/main`.

## Cause 1 — le registre répond 400

AVANT : `WARNING recherche-entreprises list failed (status 400)` → écran « la source a renvoyé une erreur ».
FAIT : un 4xx (hors 429) devient `request_rejected` (nouvelle raison, phrase fr/en « notre recherche a été refusée — le
défaut est chez nous… inutile de relancer ») ; 5xx / 429 / délai gardent leurs messages. Le journal porte désormais
`url=… params=… reason=<le motif du registre>`. APRÈS (lu par les tests) : faux 400 → `['request_rejected']`, faux
500/502/503 → `['upstream_error']`, URL `…/search` + commune dans la ligne, sans secret.
⚠️ NON TROUVÉ : le paramètre fautif. Le registre refuse avec un 400 qui NOMME le paramètre (mesuré : `per_page>25`,
`section_activite_principale` hors A-U, `tranche_effectif_salarie`/`activite_principale`/`code_commune`/`departement`
invalides) mais `q="dev vue"` seul rend 200, et le limiteur du proxy a coupé mes sondes. La requête de prod n'étant pas
connue, je ne corrige rien à l'aveugle : au prochain passage, la ligne `reason=` dit lequel.

## Cause 2 — Adzuna rend 0

Hypothèse retenue : **clé absente (no-op strict voulu)**. Preuve par le code : `adzuna_skill_offers` rend `[]` sans les
deux clés, sans appel réseau, et `harvest` le comptait quand même (`calls adzuna=1`, `tried`). Inférence : 0 sur trois
appels « vue » avec une clé valide serait invraisemblable. ⚠️ Je n'ai PAS pu lire Railway : à confirmer par
`railway variables --service bellum-ia-service --json | jq -r 'keys[]' | grep -i adzuna` (noms seuls).
FAIT : `adzuna_offers` rend `None` (non configurée) ; la moisson ne la compte plus (`calls`, `tried`). APRÈS :
`calls['adzuna']==0`, `tried==2` sans clé ; avec clé et réponse vide `calls==1`, `tried==3`. Aucune clé posée.

## Cause 3 — `outsideTrade: 0`

Causes mesurées : (a) `_reject_reason` sautait le tri métier pour toute offre `termChecked` (= TOUTES celles de France
Travail) ; (b) un placeur « tous métiers » (`all_roles`) garde toute ouverture ; (c) « vue » est un mot français (« en vue
de », « vue d'ensemble ») : `_mentions("Vue.js", …)` est vrai dans une boulangerie, donc `skillAbsent` ne les écarte pas.
FAIT : le tri s'applique à toutes les offres (sans profil : rien à comparer, #3901) ; une compétence du référentiel
informatique exige un poste IT (`is_it_offer`, ROME/intitulé désormais portés), même pour un placeur ou sans profil ;
`HARVEST_KEY_VERSION` k3→k4 (les moissons en cache à 0 rejet ne sont plus servies).
APRÈS (test, 3 profils : vide, `esn_it`, placeur) : sur « Pochettes Surprise », « Tuyauterie », « Développeur Vue.js » →
`outsideTrade == 2`, seul « FRONT SARL » retenu. #4284.1 tient (l'offre hors métier ne s'affiche jamais).
#4284.26 : le marquage COMPTE (`account_out_of_trade`) était déjà câblé en mode compétence mais renvoie faux pour un
placeur (`recruitsForClients`) — voulu ; ici la cause était en amont (l'offre), pas dans le marquage.

## Reste à prouver en production

Recette : retaper « dev vue à lille », compter les comptes À Lille, lire `outsideTrade` (> 0) dans le journal
COMPETENCE-TROUVE, lire `reason=` si un 400 revient. Élargissement de zone NON touché : il masque probablement le
défaut (une source en échec + « Peu de comptes à Lille » → France entière), question pour Louis.
Bandeau : l'en-tête « Une partie de la recherche n'a pas abouti » reste identique ; seule la ligne de détail change.
