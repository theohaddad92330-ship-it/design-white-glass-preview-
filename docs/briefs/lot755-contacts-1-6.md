# Lot 755 — CONTACTS 1/6 : couverture (trouver les décideurs que le client connaît)

Périmètre : apps/ia/app/services/web_role_search.py, apps/ia/app/services/contact_zone.py, apps/ia/app/routers/phase2_contacts.py, apps/ia/tests/test_755_contacts_couverture.py

Antériorité réconciliée : #4925 (relance par défaut, plafond 6, recherche web par rôle) et #4928 (garde d'employeur, phase2_contacts.py) sont GARDÉS ; pré-tri PR #1465 inchangé.
Trou n°3 (chercher une fonction directement) : déjà couvert par #4750 / taxonomie #4923 — non dupliqué.

Fait : (1) group_names branché sur web_role_search + requêtes au niveau groupe (bornées, compte d'abord) ; (2) la zone ordonne aussi les graines sans région Apollo — pays étranger derrière, `zoneNote` dit pourquoi, rien retiré.
Ne fait pas : aucune probabilité, aucun contact inventé, aucun filtre qui supprime ; pas d'écran changé (zoneNote n'est pas encore lu par le web) donc pas de semis démo ; mesure prod sur vraies personnes faite en local après la PR.

Décisions touchées : garde #4730 (ligne d'import de phase2_contacts.py, seulement étendue), garde #4928, garde #4925.
