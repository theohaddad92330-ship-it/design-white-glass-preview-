# Reprise — 17/09/2026, nuit (après la grande recette)

## Où en est la production

- Commit servi : **`11372508b`** (api ET ia), l'éclair de fin de v27. Rien n'a été mergé depuis 17:55.
- ⚠️ **La note de 18 h était périmée sur un point** : `LLM_ROUTE_PLAN` et `LLM_ROUTE_MESSAGES` sont **déjà** sur `openai:gpt-5.6-luna` (redéploiement de l'IA à 18:09). Rien à rebasculer.
- Le correctif de troncature du plan **tient sur la vraie route** : trois réponses tronquées depuis 18:56 dans les journaux de l'IA, chacune rattrapée par « reprise UNIQUE avec consigne de concision », **aucune** `InstructorRetryException` sur deux heures. SAFRAN : analyse neuve complète en 5 min 17. DASSAULT SYSTEMES : reprise réussie.
- Portefeuille : 29 comptes analysés, 3 en échec (Orange, Blablacar, Doctolib — tous anciens), aucun échec après 18 h.

## Ce qui a été fait (sept passages de recette, un recetteur à la fois)

**23 issues fermées**, **2 ouvertes** (#2535, #2536), chacune vue en production sur `11372508b` :
#2499 · #2501 · #2503 · #2505 · #2506 · #2509 · #2519 · #2520 · #2521 · #2522 · #2525 · #2528 · #2529 · #2530 · #2254 · #2494 · #2496 · #1904 · #1921 · #1942 · #1957 · #2020 · #2082.
Registres : ~45 points passés en `recetté`, 44 points CODE de branches fusionnées passés en `déjà là` (sweep), 8 points « absent des données » documentés.

## Les défauts trouvés, tous encore OUVERTS (Louis : « recette seulement », pas d'écrivain le 17/09)

| Défaut | Mesure |
| --- | --- |
| **#2489** cartes de Découvrir | 623 px de haut, ~190 caractères de texte, aucun logo (initiales) |
| **#2490** pertinence | « aéronautique à Toulouse » → négociants en bijoux et hôpitaux, 0 acteur aéronautique |
| **#2500** vivier | 139 cellules tronquées, 81 sans infobulle |
| **#2526** vivier, panneau ouvert | 10 colonnes au lieu de 13, et « À confirmer » recouvre le TJM |
| **#2502** organigramme | le bouton revient (corrigé), mais la généralisation « pareil pour toutes les sections » et l'automatique restent à faire |
| **#2531 · #2532 · #2533** | aucun correctif écrit (consigne du jour). #2533 confirmé : « Je ne trouve pas de fiche correspondant à Caroline Jaouen chez UNEO » |
| **Découvrir sous charge** (nouveau) | 19:00 : `POST /ia/discover/registry` coupé à **45 s** (`DISCOVER_CALL_OPTS`, ia-proxy.controller.ts:159) pendant qu'une analyse tournait → 503. L'API renvoie une raison précise, **l'écran affiche le générique** « Le service n'a pas pu être joint » (`discover.json:707`). Moteur au repos : 11,9 s, 24 résultats. **Aucune issue ouverte pour ça** — décision de Louis attendue |
| **Laura boucle sur la clarification** (nouveau) | 1958.18 et 1935.5/.14 : après avoir répondu au choix qu'elle propose, elle **redemande** une précision au lieu de rendre sa carte |
| **1933.5 / 1933.10** | « mon consultant le plus disponible » ouvre le Reverse Market d'une fiche SANS nom ni compétence → page vide |
| **2151.62** | EDF : 7 ESN dans le dossier, 6 dans « Sur mes comptes » (Siemens, confiance faible, absente) — deux comptes pour un même compte |

## ⚠️ Le défaut de fin de soirée : un réglage sans écran

**`PATCH delivery/finance/margin-threshold` (`finance.controller.ts:366`) n'a AUCUN appelant dans `apps/web`** (git grep vide, 17/09 nuit). Sur `/pilotage/finance`, « Seuil d'alerte · non réglé » est en LECTURE SEULE, et aucune page de réglages ne le propose. Conséquence : le seuil de marge d'un espace **ne peut être posé par personne**, donc `diagnose()` rend toujours `null` (`mission-margin-engine.ts:576`) et **le « diagnostic de Laura » sur une marge basse ne s'affiche chez aucun client**. C'est la famille n°1 du dépôt : du code juste que personne n'appelle. #2420.17 et #2420.15 restent `livré` pour cette raison. Louis n'a pas encore tranché l'ouverture d'une issue (question 7).

⚠️ Autre fait mesuré au passage : « Autres coûts validés (€/jour) » nourrit la marge BRUTE (585 €/j → −52 %) et laisse la marge COMMERCIALE inchangée (38 %). Or le diagnostic et l'alerte de seuil se calculent sur la marge COMMERCIALE. Pour fabriquer un cas sous le seuil, il faut le coût qui nourrit `commercial`, pas ce champ.

## Les questions qui attendent Louis

1. **Seuil de marge de l'espace** — tranché le 17/09 au soir (« pose-le puis remets-le éteint »), mais **irréalisable** : aucun écran ne le pose (voir ci-dessus). Le poser est un réglage d'ESPACE : **le harnais a refusé** que je le fasse sans autorisation explicite.
2. **#2027 — « pour les questions pertinentes »** : les quatre réponses d'incertitude n'existent que sur `available_consultants_band`. La marge, citée en exemple dans l'issue, ne les porte pas. Lesquelles ?
3. **#2005.4 / #2005.5** : « implantations », « capacité » et « objectifs » de BU n'ont aucune source ni écran de saisie — nommés inconnus. On accepte, ou on ajoute les questions ?
4. **#2502** : le rechargement d'une section disparue reste MANUEL (décision d'un agent, pas de Louis) et n'est fait que pour l'organigramme.
5. **1933.8** : au retour au fil, une saisie NON envoyée est perdue (seul ce que l'URL porte survit).
6. **Découvrir sous charge** et **la boucle de clarification** : issues ouvertes le 17/09 au soir — **#2535** et **#2536**.
7. **Le seuil de marge sans écran** : ouvrir une issue ? (recommandé — c'est un réglage que personne ne peut poser)

## Outillage

- `marquer.py` (scratchpad de cette session) : change l'état d'UN point et APPEND sa preuve, par-dessus `registre.py` du skill. `classer.py` : range les issues ouvertes en fermables / seulement `livré` / bloquées / sans registre.
- **Le fil principal a un budget de 15 appels navigateur** (hook `garde-recette`) : le 16ᵉ est refusé. Tout ce qui est ÉCRAN passe par un `recetteur`, un seul à la fois.
- Tableau de suivi : **nouvelle URL** https://claude.ai/artifact/RzjdM75wuZQSCdFZgyjkaV (la précédente est morte, quatrième en quatre jours ; elle est notée dans `.claude/projet.md` §9).
- Une panne réseau se SIMULE dans la page pour prouver un chemin d'erreur (#2519) : `window.fetch` enveloppé, une seule requête rejetée. Idem pour une permission navigateur refusée (#2082.10) : `Object.defineProperty(Notification, 'permission', …)` + navigation interne, sans rechargement.
