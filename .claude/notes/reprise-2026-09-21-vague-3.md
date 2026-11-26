# Reprise — 21/09/2026, vague 3 (matin/midi)

> Tout ce qui est mesuré ici est sur `origin` ou dans un worktree nommé. Un `/clear` ne perd rien.

## L'état de la production

- **PROD = `5483e3631`** (relu sur `api.bellum-ai.com/version`, api = ia).
- `origin/main` = **`f691bc15c`**, 8 commits au-dessus de PROD — **tous de la doc et des registres, zéro code.**
  Donc le code servi et le code de `main` sont identiques : ce n'est PAS un retard de déploiement.
- Branche de travail de la session : `chore/vague-3-21-09-soir` (registres réconciliés + profil).

## Ce qui est FERMÉ aujourd'hui — 3 issues, 328 → 325

| Issue | Pourquoi elle se ferme |
| --- | --- |
| **#2018** | 9 points : 6 `déjà là` prouvés au code avec appelant, 3 `recetté`. Un nouveau membre ne repasse plus le profil ESN. |
| **#2035** | 12 points : 10 `déjà là`, 2 `recetté`. Effectif global ≠ capacité ; une disponibilité inconnue reste inconnue. |
| **#2624** | 1 point `recetté` en prod : territoire/taille/exclusions voyagent jusqu'aux contacts. |

## ⚠️ LA MESURE QUI COMMANDE LA SUITE

**156 issues ouvertes sont à ≤ 12 points de la clôture** — dont **32 à UN seul point**, 14 à deux, 3 à trois.
Soit ~49 issues qui se ferment pour ~70 points de travail. C'est là qu'est le débit, pas dans un lot de 40 points
qui ne ferme rien. La liste est régénérable :

```sh
python3 ~/Desktop/SKILLS_TEMPLATES/plugins/livraison/scripts/registre.py --tout fermables \
  --registres '.claude/notes/registre-*.md' --seuil 12
```
puis intersection avec `gh issue list --state open --limit 1000 --json number --jq '.[].number'`.

**Et la plupart de ces derniers points sont `livré` en attente de RECETTE ÉCRAN** — donc bloqués derrière #2674.
Le chemin critique n'est pas d'écrire plus de code : c'est **#2674 verte → fusionnée → déployée → UN recetteur**.

## La réconciliation des registres — ce qu'elle a dit, et c'est un renversement

Dix balayages `git grep` lancés ce matin sur `origin/main` ET `origin/integration-vague-2-21-09`.
**43 points déplacés `retenu` → `déjà là` sur ~2 500 mesurés** (briefing 19, consultants 14, missions 4,
dashboard 2, accounts-prospection 2, accounts-metier-2 1, ecrans-secondaires 1, actions 0, navigateur-guide 0,
12/09 0). Toutes les bases sont remises à `f691bc15c`.

⚠️ **À comparer au 15/09 : 330 points déplacés, jusqu'à 95 % d'un registre.** Cette fois : **1,7 %.**
Les registres étaient déjà à jour. **Conséquence pour le skill** : la réconciliation ne se justifie pas
« par principe avant chaque dispatch » — elle se justifie quand le registre n'a pas été touché depuis une vague.
Dix agents pour 43 points, c'est le mauvais prix. Le bon signal est la date de la dernière édition du registre,
pas la date de sa base.

## PR #2674 — vague 2, 15 lots du 21/09, EN COURS DE RÉPARATION

Tête `11e268dc0`, draft, MERGEABLE. **CI : 9 rouges / 14 verts** (run 35582812650). Un intégrateur travaille dessus,
avec la liste complète relayée. Les huit rouges réels :

1. `Test (contracts)` — `esm-import-extensions.test.ts` : imports relatifs sans `.js`.
2. `Test (API) (2)` — `endpoint-guards.spec.ts` **GA-05** : une route sans permission déclarée.
3. `Test (IA)` — `test_settings_screens_catalog.py` : `/settings/commercial-priority` dans `known`, absent d'`inventoried`.
4. `Test (API) (1)` — `laura-settings-catalog.spec.ts`, 3 tests : **même cause que le n°3**, Laura ne connaît pas l'écran.
5. `Test (Web) (6)` — deux gardes de design sur un plafond qui REMONTE : **GA-35** (`expected 6 to be ≤ 5`, un
   `div`/`span` cliquable sans clavier) et **GA-249** (`17 usages de « ? 'default' : 'outline' »`, plafond 16).
6. `Test (Web) (4)` — **GA-235** : un composant à `keyPrefix` appelle `t('namespace:…')`, donc rend une clé brute.
7. `Test (Web) (3)` — `ProfileQuestionnaireDialog.test.tsx` **#2018.5** (2 tests) + `TabContacts.engineCoverageFunnelRemoved` **#2658.1**.
8. `Test (Web) (5)` — `TabContacts.observedRoleFamilyPriorsRemoved` **#2659.1**.

⚠️ **Les rouges 7 et 8 sont un défaut de FUSION, pas de comportement.** Les deux tests affirment qu'une chose
a DISPARU (`…Removed.test.tsx`) : ils échouent parce qu'elle est REVENUE. Un lot l'a retirée, la fusion d'un lot
voisin l'a réintroduite. On ne corrige pas le test : on remet la suppression que la fusion a annulée.

## Les agents en vol — 12

- **1 intégrateur** sur les 9 rouges de #2674 (worktree).
- **1 intégrateur** sur `integration-vague-3-21-09` : les 6 branches restantes du 18/09, dont
  `feat/rafraichissement-explique-complet-18-09` qui porte un commit `wip` de sauvetage (`2482ede58`) jamais passé par une porte.
- **9 écrivains**, périmètres disjoints : déclencheurs du briefing (35 pts) · écrivains de l'analytique (31 + le bug
  #2130.73) · données de mission (40) · socle du guide (22, opus, conception) · contenu des actions (39) ·
  fiche contact (≤40) · derniers points de Découvrir (7 pts → 6 issues) · derniers points du chat (3 pts → 3 issues) ·
  les arbitrages du 21/09 au registre de doctrine.
- **1 vérificateur** en lecture seule sur **39 points CODE/API** — hors chemin critique, sans navigateur.

## Les quatre arbitrages tranchés par Louis le 21/09 — à ne plus re-litiger

1. **Pas de 5ᵉ statut d'encaissement.** Une facture partiellement réglée garde `overdue`/`pending`, et le **reste dû
   se NOMME**. Ratifie `collections.ts:113-146`. (#2198.11 → `écarté`)
2. **« Fait » ne porte PAS de preuve d'envoi.** Le commercial coche ce qu'il a fait ; BellumAI n'affirme jamais un
   envoi qu'il n'a pas vu. (#2203.69)
3. **`campaign_label` referme le chantier de l'audience multi-contacts — RENVERSEMENT ASSUMÉ du 16/09.**
   (#2203.32-38, #2203.59, #2203.68, #2201.24 → `écarté`)
4. **`PlanRecap` : duplication d'étape OUI, édition GÉNÉRIQUE** (un formulaire commun aux 13 types, pas 13).
   (#1950.5/.8/.15 — décision prise, code à écrire)

Un lot est en vol pour les inscrire dans `doctrine-registry.ts` (garde GA-38), `CLAUDE.md` (une ligne chacune)
et `agent_docs/doctrine.md` (le détail + l'historique du renversement).

## Le compte de test — décision de Louis du 21/09

**Je le crée moi-même au back-office** (`https://belllum-monorepo-dashboard-manager.vercel.app`, routes `/clients`,
`/esn`, `/impersonations`) **puis j'incarne**. Le signup manuel et le mot de passe restent son geste ; l'incarnation
est la voie autorisée.
⚠️ **Mais ça ne débloque pas encore #2626.1/.2, #2640.1, #2645.1** : ces points sont `livré` sur des branches de la
**vague 2, pas en prod**. Le compte se crée juste APRÈS le déploiement de #2674, sinon on recette du vieux code.
⚠️ **#2644.1 restera bloqué même là** : la bascule demande un utilisateur membre de DEUX espaces, ce qui passe par
une invitation, donc un envoi d'e-mail — interdit à un agent. C'est Louis qui invite.

## Le tableau de suivi — NOUVELLE URL (6ᵉ en huit jours)

**https://claude.ai/artifact/RZoJ8qfbbuGJasSQBwMJgE**

Et cette fois le lien n'était pas mort, il était **non lu** : republier sur `WUxKkFc6k4n2q1WuoPu9nw` a été refusé
parce que la session n'avait pas ouvert la version en ligne, et le refus exige de relire 471 Ko ligne à ligne
(~120 k tokens) pour une page que `suivi-issues.py` régénère entièrement. Le contrôle qui évite tout ça :
`Artifact` `action: "list"` **avant** de republier.

## ⚠️ L'état de la machine — à regarder avant d'accuser une suite

Mesuré à 11 h 57 : **load 40-50 sur 12 cœurs, mais CPU à 47 % user / 20 % sys / 33 % idle** — donc du vrai calcul,
pas de l'attente disque. En revanche **22 Go sur 23 utilisés**, compresseur à 6,4 Go, et **35 worktrees**.
**Aucun agent de plus n'a été lancé à partir de là.** Une suite lue sur une machine saturée rend des rouges qui
n'existent pas, et un écrivain « corrige » alors à partir d'un faux.

Trois serveurs de développement vivent depuis plus de 90 min (`72796`, `72824`, `72882`) — pas les miens,
donc pas coupés : ils peuvent être ceux que Louis regarde.

## Ce qui reste, dans l'ordre

1. **#2674 verte → fusionner → déployer → UN recetteur** sur les 27 points de preuve ÉCRAN. C'est le chemin critique.
2. Récolter les 9 écrivains, les intégrer (vague 3 ou 4), pousser, PR.
3. Appliquer les verdicts du vérificateur (39 points CODE/API) avec `registre.py etat`.
4. **Les 27 points classés `[?]`** : leur colonne « preuve en recette » est vide ou non typée. Un point dont la
   preuve est vide ne peut pas passer à `livré` — il leur faut une preuve écrite avant tout verdict.
5. **Purger les worktrees** (35, dont ~24 antérieurs à cette session) — **jamais pendant qu'une vague écrit**.
6. Supprimer les 25 branches mortes, mesurées à `git cherry` (jamais `rev-list --count`), **après** la purge.
7. Deux arbitrages attendent encore Louis : **#2631.1** (gate CI automatisé golden/eval, ou recette manuelle avant
   chaque sortie) et **#2634.1** (voie autorisée : API partenaire officielle, contrat, données fournies par le client).
