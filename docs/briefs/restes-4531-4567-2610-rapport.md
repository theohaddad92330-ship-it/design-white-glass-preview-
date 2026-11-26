# Rapport — lot RESTES (#4531 + #4567)

- Branche `claude/restes-4531-4567-2610` (base origin/main b8a3871e). Pas de PR.
- **#4531 : déjà livré sur main** par `e54cd954` (« revient sur 8b978267b8 »). Vérifié : `git grep ProfitabilityCalculator|computeProfitability apps/` = rien ;
  `Billing.tsx` = 2 onglets ; i18n fr/en, spec figma-sync, tests-node.generated, test-durations nettoyés ; test Billing #4531.1/.4 présents ; changelog historique intact. Rien refait (rien à défaire une 2e fois).
  Orphelins atteignables seulement par l'onglet : aucun trouvé (`git grep` sur apps/ packages/) ; `mission-tracking/ProfitabilityPanel` est une autre fonction, intacte.
- **#4567 cause réelle : piste 2 (hash), pas le temps.** `url = hash((employer,title)) % 10_000` : randomisé par PYTHONHASHSEED et replié sur 10 000 valeurs ;
  le moissonneur déduplique sur l'url, donc l'offre Sopra (lue en dernier, source cache) était écartée quand son url collait avec une offre déjà retenue.
  Mesure : sur 5000 graines, 5 où l'url Sopra collide (436, 763, 1547, 3620, 4023) ; test seul rouge en 436/1547/3620 (KeyError '326820065'), vert en 0/1/2/42.
  Piste temps écartée : l'offre est à 9 j, fenêtre 90 j, seul un passage de minuit déplace d'1 jour.
- Correctif : `_url()` = sha256 stable et sans collision (`tests/test_competence_trouve.py` seul). Assertion, chiffre, tolérance inchangés.
- Après : 8 graines (436 1547 3620 0 1 2 42 763) vertes. **Preuve du NON** : `esn` désactivé dans `discover_skill_offers.py` → KeyError sous 2 graines, puis `git checkout` (code non modifié).
- Env : venv python3.12 /tmp (requirements.txt + pytest).
- **Non traité (hors périmètre, constaté)** : `test_city_filters_on_the_city_not_the_whole_department` est lui aussi intermittent (~1 run sur 6, même graine, sur main aussi : renvoie CH LILLOIS + CH MAUBEUGE ; un appel `geo:communes` « payé » apparaît au log du run rouge). Recommandation : nouvelle issue, ce test ne dépend pas de PYTHONHASHSEED.
