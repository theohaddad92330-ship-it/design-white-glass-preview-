# Reprise — vague du 18/09/2026

**SHA servi en production** : `8de5540da` (API **et** IA, lu sur `https://api.bellum-ai.com/version`).
Contenu servi : taxonomie industrielle (#2531, #2549), porte de création de mission (#2557, #2559),
pertinence géo Découvrir (#2544). C'est la PR #2573.

## Où en est chaque lot

| Lot | Sujet | Branche | État |
| --- | --- | --- | --- |
| A | industrie · missions · territoire | `integration/vague-18-09-a` | **servi** (#2573) |
| B | onboarding · Découvrir écran · vivier · organigramme · Laura | `integration/vague-18-09-b` | **PR #2574**, refusionnée sur main, CI en cours |
| C | seuil de marge · BU · rétention · couverture contacts | `integration/vague-18-09-c` | intégration en vol |
| D | liste d'appels · appel d'offres→besoin · funnel compte · onboarding sans historique · import CV zip | `integration/vague-18-09-d` | intégration en vol |
| M | facturation mensuelle reconduite (#2563, #2566) | `feat/facture-mensuelle-reconduite-18-09` | fini, **non poussé** |
| S | suivi financier (#2564) | `feat/suivi-financier-18-09` | fini, **non poussé** |
| T | dossier de compétences → comptes (#2551) · enrichir un consultant (#2570) | `feat/consultants-reverse-market-et-enrichissement-18-09` | écriture en cours |
| U | organigramme importé daté (#2553) · valeur sur compte connu (#2556) | `feat/accounts-organigramme-importe-et-comptes-connus-18-09` | écriture en cours |
| V | mission depuis un document (#2560) · ventes de l'outil connecté (#2561) · reprise proposée (#2562) | `feat/missions-sans-ressaisie-18-09` | écriture en cours |
| — | balayage des registres au SHA servi | `chore/sweep-18-09-sha-servi` | prête, **non poussée** |

**La prochaine intégration (E) prend** : `feat/facture-mensuelle-reconduite-18-09`,
`feat/suivi-financier-18-09`, `chore/sweep-18-09-sha-servi`, puis T, U, V à mesure.
⚠️ **Elle ne part qu'une fois la #2574 mergée** — plafond de 2-3 PR ouvertes.

## Ce qui est bloqué et n'appartient qu'à l'humain

1. **Fermeture de six issues comptées** — `gh issue close` refusé par le classifieur du mode auto
   (« External System Writes »). Les six : **#1958** (18 pts : 11 `recetté`, 7 `déjà là`),
   **#2016** (10 `déjà là`), **#2017** (20 `déjà là`), **#2019** (8 `déjà là`),
   **#2123** (83 pts : 53 `recetté`, 30 `déjà là`), **#2490** (1 `déjà là`).
   Les commentaires de clôture sont **déjà rédigés**, dans le scratchpad de session
   (`cloture-<num>.md`) : il ne manque que le droit de les poster.
2. **`/backoffice/address` rend 403** sur le compte de Louis — l'incarnation du compte de Ludovic
   (autorisée le 17/09) reste donc impossible. Il faut le rôle `backoffice` sur le compte, ou l'URL.
3. **#2535.2** — le délai de 45 s de Découvrir : arbitrage coût/latence, pas une question de code.
4. **#2533.2** — faut-il construire `search_contacts` pour Laura ? Décision produit.

## Un défaut trouvé en chemin, pas encore déposé

**La marge affichée sur `/pilotage` s'appelle « brute » mais elle est COMMERCIALE.**
Le chiffre rendu (et celui qui déclenche l'alerte de seuil) vient de `aggregateMargin` → `missionMargin`,
qui **exclut les « autres coûts validés »** ; le libellé existant dit « marge brute ».
Un commercial qui lit « brute » lit un nombre qui n'en est pas une. Trouvé pendant le lot S,
documenté dans le commentaire de tête de `FinanceScreen.tsx`, **non corrigé** : `FinancePanel.tsx`
était hors du périmètre borné du lot. Deux issues possibles — renommer le libellé, ou changer le calcul —
et c'est un arbitrage, donc ça ne se tranche pas dans un lot d'écrivain.

## Le piège du jour, à ne pas reproduire

Un écrivain (lot U) a créé sa branche **dans le dépôt principal**, pas dans un worktree :
`git branch --show-current` à la racine rendait sa branche. Rien n'a été mêlé cette fois — le lot V a été
redirigé vers son propre worktree avant d'écrire — mais c'est exactement l'incident mesuré du 14/09
(le `git add` de l'un emporte les fichiers de l'autre, puis le dépôt bascule seul de branche).
**Vérifier `git worktree list | grep <branche>` après le lancement de chaque écrivain**, pas seulement
au moment du brief.
