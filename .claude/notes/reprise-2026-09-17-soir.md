# Reprise — 17/09/2026 au soir (fin de la v1)

## Où en est la production
- **Vague 27** (#2527, `be3679a61`) : mergée et servie à 14:43. C'est la dernière vague de la v1 (décision de Louis) ; #2492, le CLAUDE.md allégé, y est incluse.
- **PR éclair de fin** (#2534, `11372508b`) : mergée à 17:55, déploiement suivi. Elle contient :
  - CRA et renouvellements ;
  - le périmètre BU de l'onboarding (#2017) ;
  - les défauts de la recette 12 ;
  - l'analyse bloquée (#2528/#2529) et l'alerte URGENT « crédits épuisés » ;
  - `/consultants` (#2525/#2526) ;
  - la répartition financière des relevés ;
  - le test IA rendu indépendant du minutage.
- Plus aucun lot hors bugs du jour : voir `perimetre-lots-bugs-du-jour-17-09` en mémoire.

## Réglages Railway à connaître
- **`LLM_ROUTE_PLAN` et `LLM_ROUTE_MESSAGES` = `anthropic`**, posées par Louis à 14:41 pour la démo. Avant, les deux valaient `openai:gpt-5.6-luna`.
  - Cause : ce modèle, qui raisonne, tronquait la phase plan (`InstructorRetryException … max_tokens`), et l'analyse échouait à la 1re tentative.
  - À faire : une fois l'éclair servie, **recetter une analyse de grand compte sur la route d'origine**, puis remettre les deux variables sur `openai:gpt-5.6-luna`.
- **`BACKOFFICE_ALERT_EMAILS`** : posée sur l'API (sans redéploiement), prise en compte au déploiement de l'éclair. `DM_ALLOWED_EMAILS` n'est PAS sur l'API ; seuls les destinataires de `BACKOFFICE_ALERT_EMAILS` reçoivent donc l'alerte.
- Le crédit Brave a été rechargé par Louis vers 14:33. Avant, toutes les recherches web recevaient un 402.

## Runners malades — à signaler, ne jamais y toucher
`vps-e820d794dc84` et `vps-fd892a059c55` mettent 20 min ou plus par shard (7 ailleurs). Un test d'intégration web y a dépassé 60 s (#2534). La réponse a été de relancer le seul job mort, run terminé (`gh run rerun --job <id>`).

## Ce qui reste (Louis : « pas de recette de la 27 pour l'instant »)
1. **Grande recette** de tout ce qui est livré : v26 (reste), v27, éclair. Puis **fermer toutes les issues dont chaque point est réglé** (`fermables.py`, commentaire de décompte).
2. Points de la recette 14 non mesurés (plafond du recetteur atteint) :
   - 2123.80, 2196.22, 2151.62, 2420.17, 2420.4, 1933.6, 1904.3, 1904.9, 1935.5, 1935.14, 2166.3 ;
   - **L1 à L5 de Laura** : aucun message envoyé.
3. Issues du jour encore ouvertes :
   - **#2509** : quelle fenêtre de `/chat` ? Deux vérifiées, sans défaut.
   - **#2519** : non mesurable sans panne.
   - **#2528/#2529, #2525/#2526** : dans l'éclair, à recetter.
   - **#2522** : livrée en v27, à recetter.
4. Questions produit :
   - **2020.4** : les quatre boutons « je ne sais pas encore » n'existent que dans l'onboarding, pas dans `/settings/profile`.
   - **Les « trois priorités » de l'audit et le plan à 4 semaines (#2068)** : aucune donnée structurée ne les produit (`build-audit.ts:429-431` écrit `null`). Il faut un moteur, c'est à décider.
   - **#2005.5** : les données de capacité par BU sont livrées, sans écran de saisie.
5. À signaler à Louis :
   - 2 stash inertes laissés par le lot BUGS-27 ;
   - branches Vercel Speed Insights non fusionnées ;
   - `docs/sect9` périmée ;
   - `apps/api/railway.json` probablement non lu (`railwayConfigFile` vide).

## Outillage du jour
- `fusion_changelog.py` décale encore les libellés à chaque fusion. La réparation fiable : repartir des libellés de `origin/main` et ajouter les blocs des ids manquants, pris dans les branches sources (script `libelles-depuis-main.py` du scratchpad de la session 57bed4ac), puis `pnpm exec tsc --build` dans `packages/contracts`.
- Un recetteur à 20 points ou plus atteint son plafond de 150 : couper la grande recette en passages de 12 points au plus.
