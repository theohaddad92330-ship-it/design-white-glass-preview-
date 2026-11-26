# État au 26/10/2026 ~02 h — fin de la vague VIII, départ de la vague IX

## Prouvé

- `origin/main` = `d7e6ab017acd18592fbf78ce6670e613c3bf52bc` (« integ: vague VIII — 12 lots, moteur Découvrir,
  paliers de zone, offres de Laura (#4580) »), **déployé et prouvé** (api + ia) à 00 h 38 puis après la VIII.
- **96 issues ouvertes** (`gh issue list --limit 400`, jamais sans `--limit`).
- **1 PR ouverte** : #4560 (Dependabot zod 4.6.6). Aucune PR d'intégration ouverte → la place est libre pour la IX.
- 11 routines cloud lancées, **toutes ont rendu une branche** (`enabled:true` encore — à repasser `false`).

## La récolte de la vague IX — 19 branches, aucune dans `main`

Mesuré par `git diff origin/main...origin/claude/<b> --shortstat` (vide = déjà dans main ; aucune ne l'est).

**Code à intégrer (13)**
| branche | poids |
| --- | --- |
| `claude/contexte-original-4573-2610` | 32 f. / +1436 (opus, conception : seau privé + URL signée + RGPD) |
| `claude/decouvrir-rail-4572-4574-2610` | 13 f. / +538 |
| `claude/boites-mail-4546-2510` | 10 f. / +425 |
| `claude/declinaison-competence-4579-2610` | 9 f. / +370 |
| `claude/talent-fiche-4576-4577-2610` | 13 f. / +299 |
| `claude/talents-vivier-4500-2510` | 17 f. / +270 |
| `claude/secu-idor-4559-2510` | 10 f. / +248 |
| `claude/fiche-contact-finitions-2510` | 8 f. / +242 |
| `claude/mise-en-ligne-4575-4578-2610` | 8 f. / +232 |
| `claude/decouvrir-restes-2510` | 19 f. / +541 |
| `claude/laura-process-achat-4408-2510` | 4 f. / +107 — **complète** `purchasing_process_filter.py` déjà sur main (vérifié, pas un doublon) |
| `claude/signaux-hors-metier-4403-2510` | 4 f. / +65 |
| `claude/cv-lecture-4401-2510` | 5 f. / +60 |

**Rapport seul, zéro code (6)** — `docs/briefs/*-rapport.md` ; leur valeur est la CLÔTURE, pas le code :
`erreurs-prod-c-2610` (#4478 #4479 #4480 #4471), `beeper-4406-2510` (#4406), `selection-ia-4409-4408-2510`
(#4409 #4408), `lemlist-4427-2510` (#4427), `import-contexte-4426-2510` (#4426), `restes-4531-4567-2610`
(+ 1 test python).

## Ce que disent les rapports (à passer par la porte `cloture` avant de fermer)

- **#4409, #4408, #4427, #4426.1-.3** : déjà livrés sur `main`, tests ciblés verts cités dans les rapports.
- **#4406** (Beeper) : livré sur `main` (af76f469) ; la preuve exige un poste Beeper réel + tunnel → recette humaine.
- **#4478 #4479 #4471** : corrigés par FIX-BUGS-PROD (24/10), relus et retestés (113 verts).
  **#4480** reste suspendu au jeton `RAILWAY_METRICS_TOKEN` posé sur Railway (noms de clés seulement, jamais la valeur).
- **#4471 — non fait, nommé** : le plafond de 100 000 fiches coupe les PLUS ANCIENNES et ne le dit qu'au journal ;
  curseur non persisté entre deux passages ; coût et durée du cron non mesurés (pas d'accès prod depuis la VM).
- **#4426 — arbitrage** : conserver l'original d'un document de contexte = issue dédiée, pas une greffe. Recoupe #4573.

## Reste à faire, dans l'ordre qui ferme le plus d'issues

1. **Intégrateur LOCAL** (mémoire `integration-en-local-23-10`) : fusionner les 13 branches de code dans
   `claude/integ-2510-ix`, tests ciblés, push, PR prête. Les 6 branches « rapport seul » se récoltent en lisant
   `docs/briefs/*-rapport.md`, **sans** les fusionner (sauf le test python de `restes-4531-4567`).
2. **Clôtures sur rapport** (porte `cloture`, rc lu sur `$?`) : #4409 #4408 #4427 #4426 #4478 #4479 #4471.
3. **47 points de recette** restants sur `d7e6ab017acd1859` : sections 1, 2, 8, 9, 10 (mailbox, actions, Laura,
   vocal, integrations) + le reste de Découvrir. Un recetteur à la fois.
4. **Recetteur back-office** (`belllum-monorepo-dashboard-manager.vercel.app`) pour les 6 points de #4532/#4533.
5. Lot d'un point pour **#4535.4** (la recherche de réglages mène à Affichage, pas Raccourcis).
6. Repasser les 11 routines cloud en `enabled:false`.
7. Dette notée, non traitée : **171 issues FERMÉES portent des points oubliés** (`scratchpad/audit-fermees.txt`).

## Question produit en attente pour Louis

La posture « écrit » de `launch_vivier_export` vit encore sous `/settings/vivier-export` alors que #4532/#4533
en ont fait un onglet de « Mes données » (GA-26).

## Prochaine commande

```
/livraison:issues  — reprends .claude/notes/etat-26-10-vague-ix.md, intégration LOCALE de la vague IX
```
