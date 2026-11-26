# Recette du 16/09/2026 au soir — ce qui est prouvé, ce qui ne l'est pas

Espace de Louis, production. API servie au moment du relevé : `5ef0faab4`.
Web : `main` à `e03dcfa85` (PR #2345 mergée pendant la session).

## 1. L'incident mobile des Réglages — TOUJOURS VIVANT

Mesuré à **500 px** (coque mobile confirmée : `matchMedia('(max-width: 768px)')`
vaut `true`, les quatre onglets du bas sont rendus) :

```
/settings/profile  →  « Oups. Une erreur inattendue est survenue. »
```

PR #2345 (`useSidebarOptional` + les deux gardes dans
`useSidebarCollapsePreference`) est **mergée** dans `main` à `e03dcfa85`, mais le
relevé la trouve encore rouge. **Deux lectures possibles, non départagées :**

1. Vercel n'avait pas fini de servir le nouveau bundle au moment du relevé ;
2. le correctif est incomplet — un **second appelant** de `useSidebar` lève dans
   la même section.

⚠️ **Ne pas conclure sans la console.** Le message exact du premier incident était
`useSidebar must be used within a SidebarProvider` ; si un autre nom apparaît,
c'est la lecture n°2. Louis a choisi d'attendre le déploiement et de remesurer
plus tard — cette ligne est le rappel que la question reste OUVERTE.

C'est une **impasse**, pas une page dégradée : sur téléphone, la barre des
Réglages est la SEULE navigation de cette section.

## 2. R16-3 — confirmé vivant en production

`/welcome` à 1512 px rend encore, mot pour mot :

- « Ce que tes connecteurs **débloqueront** » (futur),
- le bouton « **Connecter mes outils** »,

alors que **quatre connexions OAuth vivent depuis six semaines** sur cet espace.
Le correctif est écrit et poussé (`f8226bf11`,
`fix/welcome-nomme-les-outils-branches`), **pas encore mergé**. Le relevé de ce
soir est donc la preuve AVANT ; la preuve APRÈS est écrite dans le rapport de
l'écrivain : le bloc doit nommer l'outil au présent et le bouton devenir
« Gérer mes outils ».

## 3. Le questionnaire — un défaut d'état, découvert en mesurant

`GET /onboarding/state` sur l'espace de Louis :

| champ | valeur |
|---|---|
| `status` | `completed` |
| `current_stage_code` | **`transition_summary`** — l'étape **5 sur 8** |

Les étapes `time_2_profiles` (6) et `time_2_go_to_market` (7) **n'ont jamais été
parcourues**, et les réponses le confirment : `ideal_client_*`, `entry_channels_*`,
`tooling_*`, `weekly_*`, `sales_freins`, `decision_maker_personas`… valent toutes
`null` ou `[]`.

**Et le parcours ne se reprend pas** : `/onboarding/<id>/time_2_profiles` est
renvoyé sur `/onboarding` puis sur `/chat` par la porte, précisément parce que
`status` vaut `completed`. Un espace qui a été marqué terminé à l'étape 5 ne peut
donc plus remplir le Temps 2 par le questionnaire.

Le chemin prévu existe et fonctionne : le **complément**
(`GET /onboarding/complement` → `answered_count: 7` sur `total_count: 29`,
`status: pending`, `visible: true`), rendu par `ProfileComplementCard` sur le
tableau de bord. ⚠️ **Conséquence pour les registres** : une question posée par le
complément est traitée **même si l'étape du questionnaire ne la pose plus**. Un
point classé `retenu` au motif que « le questionnaire ne demande pas X » est
potentiellement faux — il faut regarder `complement-questions.ts`.

**TRANCHÉ par Louis le 16/09/2026 : c'est un DÉFAUT**, pas un état légitime. La
question posée était : `status: completed` à l'étape 5 est-il « terminé au sens du
Temps 1 », ou une incohérence ? Les deux lectures tenaient, et le nom du champ ne
les départageait pas — d'où la question.

La décision : **il faut une voie de reprise vers les étapes 6 et 7** pour un
espace marqué terminé avant de les avoir parcourues.

⚠️ **Ce n'est pas « rouvrir l'onboarding à tout le monde »** : le parcours reste
fermé pour qui l'a réellement terminé. La condition est précise — *marqué terminé
ET des étapes obligatoires jamais atteintes*. Le témoin qui le prouve est un
espace `completed` avec ses 8 étapes atteintes, dont la porte doit rester FERMÉE.

Correctif en cours sur `fix/onboarding-termine-a-letape-5`. ⚠️ **Corriger l'état
des espaces DÉJÀ touchés est une décision distincte** : une migration de données
se décrit, elle ne s'exécute pas sans Louis (arrêt §10).

## 4. Sonde de mise en page — trois écrans, à 1512 px

| écran | corpus LU | écrasé | déborde | recouvre `<h1>` | scroll du corps |
|---|---:|---:|---:|---:|---|
| `/chat` | 539 | 0 | 0 | 0 | non |
| `/discover` | 265 | 0 | 0 | 0 | non |
| `/welcome` | 182 | 0 | 0 | 0 | non |

⚠️ **Le premier relevé de `/welcome` était NUL et ressemblait à un vert** : la
sonde interrogeait `main *`, et cet écran n'a aucun `<main>` — **0 élément lu**.
Corrigé en retombant sur `document.body`, et la colonne « corpus LU » est
désormais obligatoire dans tout relevé. Une sonde qui ne lit rien rend le même
zéro qu'une page saine ; c'est la doctrine des gardes appliquée à la recette.

`/discover` ne contient par ailleurs **aucun « 0 » isolé** dans son texte rendu —
cohérent avec GA-18/GA-19 (« non mesuré » n'est jamais « 0 »).

## 5. Ce que cette session n'a PAS prouvé

- Le mobile au-delà de `/settings` : un seul écran mesuré à 500 px.
- Les 243 points à l'état `livré` : leurs preuves attendues sont très
  majoritairement **visuelles** (un libellé, un bouton, un état vide), donc un
  balayage par API seul ne les couvre pas. Il faut l'écran.
- L'outil `computer` de l'extension a refusé de cibler l'onglet à plusieurs
  reprises (`Couldn't determine which page this action targets`) ; le
  contournement qui marche est de **rappeler `tabs_context_mcp` avant chaque
  lot**, et de recréer un onglet neuf quand il s'obstine.
