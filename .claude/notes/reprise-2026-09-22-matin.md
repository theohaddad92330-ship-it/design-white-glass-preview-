# Reprise — 22/09/2026, fin du lot du matin

> Tout ce qui est mesuré ici est sur `origin` ou dans une PR nommée. Un `/clear` ne perd rien.

## L'état de la production

- **PROD = `50b991d36`** (api), ia `a806508a1` — relu sur `api.bellum-ai.com/version`.
- **`origin/main` = `f23dfaf49`.** La vague 11 est SERVIE (vérifié : `git merge-base --is-ancestor`).
- La PR #2700 (preuve mobile) est fusionnée mais **pas encore servie** : son déploiement était en
  cours au moment d'écrire. Le contrôle : `curl -s https://api.bellum-ai.com/version`, et
  `git merge-base --is-ancestor 0fba7f00d <sha servi>`.

## Ce qui est FERMÉ aujourd'hui — 5 issues, 298 → 293

| Issue | Pourquoi elle se ferme |
| --- | --- |
| **#2637** | Decathlon › Personnes › Qui nous manque : 7 axes sur 10 « Tenu », Entités/Sponsor nommé « Manque », « Rôles couverts 5/8 ». n=10 axes. |
| **#2648** | Sur un contact dont l'accroche échoue, l'écran NOMME l'info manquante (« Identité incomplète… »). n=1. |
| **#2298** | `ACCESS_MODE_DETAIL_FIELDS` (`TabAccess.tsx:889`) est RENDU en `:958`. Preuve prise à l'appelant. |
| **#2688** | Libellé stable « Décider de la priorité » sur les TROIS états (À décider / Prioritaire / Écarté). |
| **#2691** | Le bloc « Remplaçants » a bord + fond (`rounded-sm`, `border-subtle`, 12 px) — le texte nu a disparu. |

## ⚠️ #2640 a été ROUVERTE — et c'est la leçon du jour

Fermée à 07:20 sur une preuve de CODE. Sa preuve est ÉCRAN (« source visible, champ corrigible,
correction conservée après resync ») et une recette du 21/09 l'avait RÉFUTÉE sur l'écran que
l'issue nomme. Les deux faits tiennent ensemble : l'écran de confirmation
(`OnboardingCompanyPage.tsx:556`) est toujours `company?.website ?? ''` en lecture seule, ET
`esn_website` est devenu une clé de réponse éditable (`onboarding.ts:1644`). Seul un passage à
l'écran tranche.

## Les PR

- **#2699 vague 11** — FUSIONNÉE et servie. Elle rendait #2698 caduque (`git cherry` : 0 commit
  absent), ce qui a évité de réparer 9 rouges de CI et 2 conflits. #2698 fermée en citant la mesure.
- **#2700 preuve mobile** — FUSIONNÉE, 24 checks verts.
- **#2701 vague 12** — OUVERTE, draft, MERGEABLE, CI en cours au moment d'écrire. 57 commits,
  10 branches absorbées, 7 portes vertes. **C'est le premier geste de la reprise : vérifier sa CI,
  la passer en `ready`, fusionner, prouver le déploiement.**

## Ce qui reste, dans l'ordre

1. **#2701 → verte → fusionner → déployer → prouver.**
2. **Trois branches attendent une vague 13**, et deux d'entre elles demandent un ARBITRAGE, pas une
   fusion :
   - `wip/le-site-de-lesn-au-profil-21-09` — deux branches ont ajouté le même champ sous deux noms
     (`esn_website` vs `website`) avec deux migrations. **Le gagnant est `esn_website`** : il est
     déjà en production et c'est lui que consomment `PREFILLABLE_ANSWER_KEYS`
     (`onboarding.ts:1625-1648`) et `esn-profile.controller.ts:118`.
   - `feat/trois-points-et-leur-appelant-21-09` et `feat/les-derniers-points-avant-cloture-21-09` —
     même conflit byte-identique sur `passesPublicEmployerExclusion` (case à cocher contre filtre
     structurel).
3. **Un défaut NEUF, trouvé en recette, à ouvrir ou à rattacher** : #2616.1 — l'élargissement de
   « comptes qui recrutent » aux plateformes **n'atteint pas l'écran**. Relevé exhaustif des 58
   liens « Voir la source » : apec.fr = 38, candidat.francetravail.fr = 20, **aucun Welcome to the
   Jungle, aucun ATS**. La distinction du CDI, elle, est prouvée.
4. **#2068.24/.26/.27 : il faut la VRAIE ROUTE de l'audit commercial, prise au code.** Le seul
   accès trouvé est « Aperçu PDF », qui a **gelé l'onglet deux fois** (rendu bloquant de type
   impression). Quatre chemins devinés rendent 404. Ne pas réessayer au hasard.
5. **#2692.1 attend un CAS, pas du code** : 124 pistes de qualification sondées sur 5 comptes,
   toutes datées, zéro sans date. Le `text-xs` ne porte que sur le cas sans date.
6. **#2679 attend une conversation NEUVE** (postérieure au déploiement du 22/09 à 09:18) : les
   options de clarification mesurées venaient d'un échange du 18-21/09.

## La mesure qui commande la suite

**129 issues ouvertes sont à ≤ 12 points de la clôture** (966 points), dont **17 à ≤ 3 points**.
Aucune n'est à 0 : tout ce qui pouvait se fermer aujourd'hui l'a été.

```sh
python3 ~/Desktop/SKILLS_TEMPLATES/plugins/livraison/scripts/registre.py --tout fermables \
  --registres '.claude/notes/registre-*.md' --seuil 12
```
puis intersection avec `gh issue list --state open --limit 1000 --json number --jq '.[].number'`.

États du corpus : **13 729 points** — `retenu` 5 897 · `déjà là` 5 583 · `recetté` 1 932 (+31
aujourd'hui) · `écarté` 144 · `livré` 136 · `reformulé` 37.

## ⚠️ Les quatre pièges payés aujourd'hui — ne pas les repayer

1. **Un registre se lit sur la branche qui porte le balayage.** Les premières mesures du matin
   étaient faites sur une branche en retard de **102 commits** : trois points lus `retenu` étaient
   `livré` sur `main`.
2. **Sur une ligne de registre, le DERNIER segment `‖` gagne.** Un brief bâti sur la colonne
   tronquée au premier `‖` a affirmé qu'un arbitrage était tranché alors que deux décisions plus
   récentes du même jour disaient l'inverse. **L'écrivain a refusé le brief, à raison.**
3. **Un témoin de méthode juste ne rend pas la CIBLE juste.** Deux « RÉFUTÉ » ont été rendus avec
   des mesures propres, sur le mauvais élément : `QualificationLeadsQueue` n'est rendu que dans le
   dossier d'un compte, et le voisin visé par #2691.1 est `QuickPassRow`. Un contrôle au code les a
   attrapés ; la re-mesure a donné PROUVÉ et NON PROUVABLE.
4. **Une résolution de conflit se contrôle contre les DEUX côtés.** Prendre `main` comme base a
   fait reculer #2627.1 de `recetté` à `livré` alors que sa preuve était bien réinjectée. Comparer
   au seul `main` ne peut pas le voir.

## Le tableau de suivi

**https://claude.ai/artifact/SMB6GSwQJ8wFpDSPUkaVzZ** (septième URL en neuf jours — la cause est
écrite dans `.claude/projet.md` §9 : republier est refusé même sur une URL vivante, et relire la
page coûte ~120 k tokens pour rien puisque `suivi-issues.py` la régénère entièrement).

## L'état de la machine

Load descendu à ~5 sur 12 cœurs, 146 Go de disque libres. **84 worktrees** (3 rendus aujourd'hui) —
la purge large attend qu'aucune vague n'écrive.
