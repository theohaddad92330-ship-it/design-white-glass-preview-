# Inventaire des tests

Lot G de la refonte CI (31/10/2026). **Lecture seule : aucun test n’est supprimé, déplacé ni modifié.**

- Générer : `node tools/tests/inventory.mjs --date AAAA-MM-JJ` (écrit `<date>.csv`, `<date>.md`, `candidats-lot-1.md`).
- Tester les heuristiques : `node --test tools/tests/inventory.test.mjs` (une fixture par classe, plus des cas qui doivent dire NON).
- Les règles et leur ordre sont documentés en tête de `tools/tests/inventory.mjs` ; la colonne `why` du CSV cite la règle qui a décidé.
- Durées : seulement `apps/web/test-durations.json` (api et ia n’ont pas de JUnit dans le dépôt).

## Précision mesurée

Échantillon de 40 fichiers tirés au hasard (graine 1, `--sample 40 --seed 1`), vérifiés par comptage de signaux
(`readFileSync`, `toContain`, `toHaveBeenCalledWith`, supertest/pg, citations `#N`) puis lecture des cas douteux :
**39 sur 40 bien classés (97,5 %)** avec la première version des règles. L’erreur (un contrôleur lu en texte puis
comparé par `indexOf`, classé `behavior`) a été corrigée et couverte par un test. Biais connu : la vérification
a lu les cas douteux, pas les 40 fichiers en entier ; la précision par classe n’est pas mesurée (échantillon trop petit
pour `integration`, 3 fichiers). Les faux positifs probables restent côté `guard-text` (une lecture de fixture avec `.match(`)
et `mirror` (un `toHaveBeenCalledWith` qui EST le comportement : effet de bord attendu).

## Candidats

`candidats-lot-1.md` : 100 fichiers max, hors fichiers sensibles (sécurité, multi-tenant, argent, RGPD). **À valider par Louis.**
