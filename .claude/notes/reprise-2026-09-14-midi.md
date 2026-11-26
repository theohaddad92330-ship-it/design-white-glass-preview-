# Reprise — 14/09/2026, 12 h 20

## État de la production

- `main` = **`79666d36d`** (merge de la PR **#2138**, intégration F).
- ⚠️ **L'API est EN RETARD** : au 14/09 12:14, `GET /version` rend `api=600f5da55` et `ia=79666d36d`.
  L'api n'a donc pas redéployé depuis **trois** merges, dont **#2134 qui était un correctif infra
  DE L'API** (`fix/user-agent-api-railway`). Deux lectures possibles, à trancher par la mesure et pas
  par l'intuition : des `watchPatterns` Railway qui ne matchent pas, ou **un déploiement qui n'est jamais
  parti** — et ce dernier « ne ressemble à rien » : ni erreur, ni « skipped ».
  Sonde en fond : `<scratchpad>/sonde-deploy.py 79666d36d` → `<scratchpad>/deploy2.log`.
- ⚠️ **Ne PAS recetter #2138 tant que l'api n'a pas basculé.** Le toast « Une nouvelle version est
  disponible » est déjà apparu côté web : recharger maintenant, c'est du front neuf sur API ancienne,
  et ça invente des pannes.
- ⚠️ `/version` se lit **en JSON**, jamais en grep : `ia.commit` est imbriqué dans la réponse de l'api.

## Ce qui a atterri dans #2138 (intégration F, 4 branches, 0 conflit, toutes portes RC=0)

- **#2002** — plancher tactile 44 px sur 4 gestes écrits à la main qui échappaient à `Button`
  (`OnboardingPlanPage.tsx`, `WelcomeScreen.tsx`, `ActivationChecklist.tsx`, `TagsField.tsx`).
- **#1946.14/.17/.18/.19/.21** — cohortes J+7 et J+30 au back-office. Le J+30 était calculé, servi,
  et rendu par **aucun écran** : défaut n°1. « en amorçage » remplace « trop récent ». Garde **GA-329**.
- **#1995** — le contact nommé survit au tour. Vraie cause : `chat_thread_state.py:426`, la branche
  `status == "clarification"` s'arrêtait à la QUESTION, donc les objets nommés par ses OPTIONS
  n'allaient nulle part.
- Les constats de mise en page `/chat`.

## Branches poussées, PAS encore intégrées

| branche | SHA | contenu |
| --- | --- | --- |
| `doctrine-profile-context` | `039ea2e8c` | #2069 + doctrine « aucune probabilité » ; garde sur `ProfileContext.model_json_schema()` |
| `jobs-longs-visibles` | `5732aaccc` | #1952.1/.18 — avancement MESURÉ d'une analyse, jamais un pourcentage |
| `enum-onboarding-status` | `c67a08dc1` | #2004 (SQL seulement) — 9 valeurs ajoutées, migration `1793500000000` |

→ `doctrine-profile-context` + `jobs-longs-visibles` sont partis en **intégration G** (agent en vol).
→ `enum-onboarding-status` attend une **intégration H**.

## Registre des demandes — `.claude/notes/registre-2026-09-12.md`

**106 recetté · 106 livré · 656 retenu · 285 écarté · 13 reformulé = 1166** (somme vérifiée).

Recettés dans cette session, tous avec preuve nommée en production :
- **1914.11** — 45/45 paragraphes de `markdown.tsx` bornés **exactement** à 70ch (sonde `width:70ch`
  dans la police de CHAQUE nœud, fenêtre 1512 px). Zéro non conforme.
- **1937.1** — `/settings/notifications` › « Ce que Laura sait dire » : 36 interventions en lecture
  seule, dont `copilot_never_used`.
- **1948.45** — exactement 6 cartes de suggestion (`Chat.tsx:2192:11`).
- **1902.16** — les 8 outils nommés par `ConnectedToolsStrip.tsx:35` croisés avec `/integrations` :
  HubSpot, Salesforce, Odoo, Google Workspace, Microsoft 365, Notion sont **tous « Connecté »**.
  L'injection de #1912.11 tient, aucun littéral.
- **1916.2/.3/.4/.7/.8/.10/.11/.13/.14/.15/.16/.18/.19/.21/.22/.23/.24** — les 17 points du cluster
  mémoire, prouvés par UNE ligne de fait qui porte source · périmètre · date · auteur · pourquoi ·
  surfaces influencées, plus la conséquence visible (« Consulté par Laura dans 7 réponses ») et
  5 vrais `<button type="button">` tabulables (`MemoryFactRow.tsx:166/177/190/206`).

## Le faux `livré` débusqué

**1933.5** remis à `retenu`. `chat_tools.py:1351` déclare `params: ()` pour reverse-market et
`routes/consultants/$id_.reverse-market.tsx` n'a **aucun `validateSearch`** : 0 des 5 filtres promis
n'est lu. **9ᵉ occurrence du défaut n°1.** Un écrivain le corrige (`deeplink-reverse-market`).

Audit complet des 32 `livré` à trace muette : **31 confirmés** avec définition + appelant en
`fichier:ligne`, 1 seul faux. Donc **110/111 des `livré` sont réels** — c'était la colonne *trace*
qui était périmée, pas l'état.

## Deux pistes que j'ai REFUSÉ de gonfler en chantier

- Les 6 faits de mémoire de l'espace de test sont **3 faits dupliqués deux fois** (même date, même
  portée, libellés cosmétiquement différents, dont un strictement identique). Les trois énoncés
  n'existent dans le dépôt que dans des **fixtures de test** (`MemoryBar.test.tsx:59-61`) : ce sont
  des **données**, pas un semis. Rien à corriger dans le code.
- Le modal « Nouvelle conversation » reste monté avec `data-state="closed"`, `aria-hidden="true"`,
  `pointer-events:none` **mais** `visibility:visible`, `opacity:1`, 576×832 px, `animation-name:exit`
  et `animation-fill-mode:none`. Le style calculé disait « il peint ». **La capture dit qu'il ne peint
  pas.** L'image tranche, pas le style calculé.

## Décisions PARQUÉES pour Louis

1. **`/welcome` va perdre ses suggestions.** Le lot doctrine retire la consigne qui faisait inventer
   des noms d'entreprises au modèle (#2069). Or `bellum_profiler.py` n'injecte **aucun compte réel** :
   la liste sortira vide tant qu'un lot n'y branche pas la mémoire marché / DataForge. C'est #2069 tenu
   honnêtement (« si aucune suggestion fiable : le dire »), mais l'écran se vide. Enchaîner sur
   l'injection des comptes, ou assumer l'écran vide ?
2. **Le contrat TS ment sur un minimum** : `packages/contracts/src/schemas/profile-context.ts:165`
   garde `.min(3).max(4)` sur `firstAnalysisSuggestions` alors que le prompt ne garantit plus 3.
   Sans danger immédiat mesuré (aucun `parse()` à l'exécution côté API, `Search.tsx:202` lit `?? []`).
   Confié à l'intégration G avec consigne de **re-vérifier** avant de toucher.
3. **#2004** : tout ce qui touche la machine d'état applicative, l'affichage de reprise et
   l'entitlement reste à trancher. Seule la contrainte SQL a été élargie.
4. **#2002** demande trois entrées tarifaires là où l'écran n'en montre qu'une (grille du 27/08,
   #1152), et « le bouton ramène vers le site » contredit la décision du 24/07 (« une démo menée, pas
   une fenêtre gratuite »). Non codé.
5. **#1946.1-12/.16/.23-26** restent bloqués par `c64_analytique_produit` : l'union fermée de
   `product-tracker.ts` (9 événements, GA-264) ne contient aucun des événements demandés, et la
   relecture juridique RGPD est due (reportée trois fois).

## Leçons de la session, à faire remonter dans SKILLS_TEMPLATES

- **La machine peut être le goulot, et ça ne se devine pas.** Charge **74** sur 12 cœurs : tout verdict
  de test rendu là parle de la machine. Le bon geste n'était pas d'attendre ni de dispatcher, c'était
  de **couper les worktrees finis** (27 → 11) et de basculer sur le travail à **zéro cœur** : la recette
  navigateur. Charge retombée à 5 en quinze minutes.
- **Un worktree dont le HEAD est ancêtre de `main` n'est pas forcément fini** : trois écrivains y
  travaillaient sans avoir commité. Vérifier `git status --porcelain` avant toute suppression.
- **Un filtre `!e.children.length` exclut les boutons à icône** — il m'a fait conclure « aucun élément
  interactif » sur cinq boutons qui étaient tous de vrais `<button type="button">` tabulables.
- **Un CHECK SQL écrit EN LIGNE et sans nom est invisible à sa garde** (GA-12). Le nommer suffit à le
  faire entrer sous la garde existante.
- **La sortie Bash résumée frappe encore** : `git diff --name-only A..B` en pipe shell a rendu **vide**,
  la même commande via `python3`+`subprocess` a rendu 3 fichiers.
