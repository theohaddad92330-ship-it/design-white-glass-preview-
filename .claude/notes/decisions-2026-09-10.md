# Décisions de Louis — 10/09/2026, en cours de lot. Ne se re-litigent pas.

| # | Question | Tranché |
| --- | --- | --- |
| **D-A** | #1472 / #1417 — quel écran sert de RÉFÉRENCE de densité ? | **Le dossier de compte (Vue d'ensemble).** C'est le mètre-étalon : `/accounts`, les listes et les autres écrans s'alignent SUR LUI, et ils deviendront donc plus denses qu'aujourd'hui. Débloque #1417 et #1440, ouverts depuis le 03/09. |
| **D-B** | #1822 — Laura ÉCRIT dans les réglages, ou REDIRIGE ? | **Elle écrit AUSSI, avec confirmation.** Les 18 écrans de `/settings/*`. La porte reste visible : Laura propose, la personne valide — jamais d'écriture silencieuse. Le catalogue + la redirection restent le socle (lot 12), l'écriture vient par-dessus. |
| **D-C** | #1613 / #1640 — la gradation Forte/Moyenne/Faible de l'appétence aux externes | **Construire l'index normalisé par cohorte** (effectif, couverture, nombre d'observations). La gradation reste derrière `MARKET_MEMORY_SCORING_ENABLED` tant que la calibration n'est pas validée sur données réelles — l'index d'abord, le drapeau ensuite. |
| **D-D** | #1622 / #1639.3 — le jeu de vérité terrain | **Construire l'outillage de labellisation**, plus les six métriques (precision@3, precision@10, taux de faux positifs, couverture, échec de résolution d'entité, utilité déclarée). Le corpus reste vide tant que Louis n'a pas jugé — c'est assumé. |

⚠️ **D-C et D-D créent du code que personne n'appelle tant que la donnée n'existe pas.** C'est le défaut
n°1 du dépôt, et il est ici ACCEPTÉ EN CONNAISSANCE DE CAUSE : Louis a écarté les deux replis
(« garder le signal binaire honnête », « écarter avec la raison écrite ») en connaissant l'argument.
À écrire dans le tracker plutôt qu'à redécouvrir dans trois semaines.

## D-A — la mesure de l'écran de référence, faite ce soir en production

Le dossier de compte (Vue d'ensemble) est le mètre-étalon. Ce qu'il vaut, mesuré sur BNP Paribas
à 1512 px, contre les deux écrans à aligner :

| Écran | nœuds de texte | 12 px | 14 px | ≥ 16 px | gouttière de page |
| --- | ---: | ---: | ---: | ---: | --- |
| **Dossier de compte — la RÉFÉRENCE** | **420** | 319 (76 %) | 87 (21 %) | 13 | 24 px / 24 px |
| `/accounts` (la liste) | 258 | 189 (73 %) | 68 (26 %) | **1** | **introuvable** |
| Fiche talent (`/consultants/:id`) | **68** | 33 (49 %) | 34 (50 %) | 1 | 24 px / 24 px |

Trois choses que la mesure dit, et qu'on n'aurait pas devinées :

1. **L'échelle typo est DÉJÀ tenue partout** — 12 et 14 px font 95 % des nœuds sur les trois écrans,
   aucune valeur hors échelle. Le sujet de #1417 n'est donc pas la typo : c'est la DENSITÉ.
2. **`/accounts` neutralise la gouttière de page et la repose section par section** — d'où
   « introuvable » : c'est exactement le défaut de famille de #1846.
3. **La fiche talent est six fois moins dense que la référence** (68 nœuds contre 420) et répartit
   moitié-moitié entre 12 et 14 px là où la référence met 76 % en 12. C'est l'écart le plus large
   du produit, et personne ne l'avait chiffré.
