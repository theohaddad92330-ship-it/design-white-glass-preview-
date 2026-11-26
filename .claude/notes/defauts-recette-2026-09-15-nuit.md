# Défauts trouvés en recette — 15/09/2026, nuit

Prod mesurée : `50aad8ef8` (api + ia + web alignés, vérifié sur `/version`).

## R15N-1 — `POST onboarding/refresh` n'a AUCUN appelant dans le web

`apps/api/src/modules/onboarding/onboarding.controller.ts:122` expose `@Post('refresh')`
→ `OnboardingService.requestRefresh`, la seule arête qui pose `refresh_required`
(`onboarding.service.ts:96` — `completed: ['refresh_required']`).

`git grep -n "requestRefresh\|refresh_required" origin/main -- apps/web/src` ne rend que
des TESTS (`onboarding-gate.test.ts:180`, `OnboardingWelcomePage.test.tsx:137`) et la
lecture dans `onboarding-gate.ts:170`. **Aucun bouton, aucun appel d'API.**

Conséquence : la reconfiguration guidée de #2022 — et donc la page 0 en mode
« reconfiguration » — est **inatteignable depuis le produit**. Le code est juste,
testé, et personne ne l'appelle : le motif le plus fréquent du dépôt.

Rattachement : #2022 (lot C3, registre `2026-09-15-onboarding-questionnaire`).

## R15N-2 — 14 branches finies ne sont dans aucune PR

Mesuré par `git branch --no-merged origin/main` + `git merge-base --is-ancestor` contre
les deux PR ouvertes : 14 branches, ~30 commits de travail terminé, jamais poussés en
intégration. Tant qu'ils n'y sont pas, **aucun point ne peut passer à `recetté`**.

Les quatre onboarding/welcome sont parties en intégration cette nuit
(`worktree-agent-aaedc057c51ef345d`, `feature/w17-commercial-audit-context`,
`worktree-agent-a5c8c7fd5e539921d`, `worktree-agent-a31a8fcab787c5dc3`).
Restent à intégrer, côté comptes/prospection : `cibles-modele-et-statuts`,
`ecosysteme-relations-qualifiees`, `favoris-ecran`, `pistes-a-qualifier`,
`plan-et-actions-une-seule-ligne`, `refresh-explique-et-diff`,
`statuts-commerciaux-renommes`, `worktree-agent-a7bf7ed615cdeda05`,
plus les deux vieilles `integration-i` (26 h) et `integration-q` (15 h).

## R15N-3 — le piège de shell qui a failli fabriquer un faux ABSENT

`M=origin/main; git show $M:apps/…` → **zsh lit `:a` comme un modificateur** (chemin
absolu) et rend `/Users/…/origin/mainpps/apps/…`, donc `fatal: ambiguous argument`.
Un enchaînement moins bavard aurait rendu un vide silencieux et fait conclure à une
absence. **Écrire la révision en littéral** : `git show origin/main:chemin`.

À remonter dans l'index de l'outillage qui ment.

## R15N-4 — un `min_length` sur un champ dont la source peut être vide EST la consigne d'inventer

`apps/ia/app/models/profile_context.py:226` — `differentiation_points` porte `min_length=3`, alors que sa
source documentée (`expertise_areas + positioning + target_sectors`) peut être vide pour un espace neuf.

Le plus net : **le fichier lui-même écrit la règle 200 lignes plus bas** (lignes 439-440, au titre de
#2069) — « un `min_length` sur un champ dont la source est absente du contexte EST la consigne
d'inventer ». La règle est posée, elle n'est pas appliquée à ce champ-là.

Conséquence : sur un espace au premier jour, le modèle DOIT produire trois points de différenciation
qu'aucune donnée ne fonde. C'est « jamais de donnée fictive » enfreint par une contrainte de schéma.

Trouvé en écrivant le corpus multi-persona (#2070). Non corrigé : le fichier appartient au lot W6
(contradictions + scoring par axe). Le cas « espace vide » du corpus contourne en NOMMANT l'absence
dans ses trois entrées, et une garde rougira le jour où la contrainte tombera.

## R15N-5 — le registre disait « absent » sur un corpus livré la veille

Les 23 points de #2070 étaient `retenu` avec « existant : absent ». Le corpus multi-persona avait été
livré le **14/09** (commit `7b245215c`, déjà sur `main`) : 16 fixtures, 213 tests. Un lot briefé sur ce
registre aurait écrit un second corpus — exactement ce que la décision du 12/09 interdit (« NE PAS en
écrire un de plus »).

Ce qui a sauvé le lot : le brief disait de CHERCHER l'existant avant d'écrire. À garder dans tous les
briefs — **le registre est daté, le dépôt ne l'est pas.**

## R15N-6 — deux pièges d'environnement mesurés cette nuit

- `ls` nu est réécrit par le hook et rend une sortie **VIDE** ; `/bin/ls` marche. Un agent qui liste un
  dossier avec `ls` peut conclure à un dossier vide.
- `pytest` lancé nu rend un résumé d'une ligne (réécriture RTK) : pour lire un échec, rediriger vers un
  fichier.
- Un worktree neuf doit passer par `scripts/worktree-ready.sh`, sinon le pre-commit échoue sur
  `lint-staged not found`.
- ⚠️ `git stash list` porte un `stash@{1}: lint-staged automatic backup (a4a60d8af)` **orphelin**,
  laissé par une autre session. Personne n'y touche (interdit du socle) — signalé pour que Louis décide.

## R15N-7 — un ÉCRAN NOIR pendant une bascule Vercel, et comment ne pas le prendre pour un P0

Mesuré deux fois cette nuit, sur `/settings/memory` puis sur `/accounts/<id>` :

- symptôme : écran **entièrement noir** (capture à l'appui, pas seulement une sonde à `taille: 0`) ;
- console : `TypeError: Cannot read properties of undefined (reading 'component')` dans
  `runLoader` / `loadRouteMatch` de TanStack Router ;
- **après un simple rechargement, la page rend normalement.**

Cause : pendant qu'un déploiement Vercel bascule, l'onglet tient un `index-*.js` dont les **chunks
paresseux** ont déjà été remplacés côté CDN. Le routeur charge un module de route qui n'existe plus et
la définition de route revient `undefined`.

⚠️ **Le piège dans le piège** : comparer le bundle de l'onglet à celui que sert `/` ne suffit PAS —
la deuxième fois, les deux étaient identiques (`index-BmrvtOqK.js`) et l'erreur se produisait quand
même, parce que c'étaient les CHUNKS, pas l'index, qui avaient changé. J'ai conclu « reproduit sur le
bundle courant » à tort avant de recharger.

**Le geste qui tranche, dans cet ordre** : recharger la page, et seulement si l'erreur SURVIT au
rechargement, ouvrir une enquête. Et ne jamais recetter pendant les quelques minutes qui suivent un
merge — c'est la règle 4.0 du socle, appliquée au front et pas seulement à l'API.

## R15N-8 — ce que la doctrine « non mesuré n'est jamais 0 » donne à l'écran, quand elle est tenue

Relevé sur un compte en statut `error` (Blablacar, `87be4312`), prod `61432eab9` — à garder comme
exemple de référence, c'est exactement ce que la règle demande :

- « **non mesuré** — aucune analyse n'est encore datée sur ce dossier »
- « Des mois sont facturés sur ce client, mais aucun ne porte de montant saisi. **Le total ne se
  calcule pas — il ne vaut pas zéro.** »
- « Analyse échouée … (flux SSE tronqué). **Reprendre débite jusqu'à 8 crédits** — le prix d'une
  analyse complète. Rien n'est débité si les crédits de ce run ne t'ont pas encore été rendus. »

Sonde de mise en page vide, aucun débordement horizontal.

## R15N-9 — le plan de reconfiguration mesure 10 clés, le questionnaire en pose 52

**Mesuré en production** le 15/09 sur l'espace de Louis remis en `refresh_required`
(`GET /api/onboarding/state`, session réelle) :

- `answers` porte **52 clés** : **19 remplies, 33 vides**.
- `TEMPS1_REQUIRED_KEYS` (`packages/contracts/src/schemas/onboarding.ts:161-172`) n'en
  contient que **10** — et les 10 sont dans les 19 remplies.
- Donc `reconfigurationPlan()` (`apps/web/src/features/onboarding/lib/onboarding-gate.ts:199-207`)
  rend `{ keys: [], estimatedMinutes: null }`.

**Ce que ça donne à l'écran** : la page 0 en reconfiguration écrit « Il nous manque
quelques éléments pour rendre tes résultats plus précis », **n'annonce aucune durée**
(le code masque la fourchette quand `keys.length === 0`, et il a raison : « 0 minute »
n'est pas une durée), puis le clic sur « Compléter mon profil » ouvre un questionnaire
dont **la toute première page** pose deux questions vides (`esn_maturity_situation`,
`company_growth_goal`) — et 31 autres derrière.

**Ce n'est pas un arrondi, c'est un autre ensemble.** Le code n'est pas faux ligne à
ligne : `TEMPS1_REQUIRED_KEYS` est la porte de COMPLÉTION serveur (dix clés, celle
qu'`activation.service.ts:101` lit pour `profile_completed`). Elle a été réutilisée
comme dénominateur d'une ESTIMATION de travail restant. Les deux questions sont
différentes : « ai-je le droit d'entrer ? » et « combien me reste-t-il à faire ? ».

**Correctif** : l'estimation compte les questions que le questionnaire POSE
RÉELLEMENT (le parcours des étapes), pas la porte de complétion. Et tant qu'elle
compte autre chose, la phrase « il nous manque quelques éléments » ment dans les deux
sens — elle s'affiche quand il ne manque rien de requis, et elle se tait sur les 33.

Famille : « un prédicat comparé à des valeurs que le produit ne produit pas », version
dénominateur — le calcul est juste, son ensemble de départ ne correspond pas à l'écran.

## R15N-10 — « Autre (préciser) » compte dans le plafond, mais n'est PAS dans « Ta sélection »

Écran `onboarding/<id>/offer_expertise/domaines` — « Quels sont tes domaines
d'expertise ? », plafond « Sélectionne jusqu'à 5 domaines ». Mesuré en production.

**Le geste qui casse** (réaliste — Louis avait déjà 5 domaines enregistrés) : cinq
domaines cochés, puis un mot écrit dans le champ libre « Autre (préciser) ».

**Ce qui s'affiche alors** :
- le compteur passe à **« 6/5 sélectionnés »** ;
- « Ta sélection » ne liste que **5** entrées — le sixième est le texte libre, qui
  n'y figure pas ;
- « Continuer » devient inactif (`disabled`), **sans `title` ni `aria-describedby`** ;
- le compteur reste en **gris neutre** `rgb(107,107,115)`, sans `role="alert"` ni
  `aria-live` : un état qui BLOQUE le parcours est peint comme une indication ;
- aucun texte ne dit quoi retirer. « Sélectionne jusqu'à 5 domaines » énonce la
  règle, pas le remède.

**Preuve du lien de cause** : vider le seul champ « Autre » fait passer le compteur
de `6/5` à `5/5` et réactive « Continuer », sans toucher aux cinq cases.

**Pourquoi c'est bloquant et pas cosmétique** : l'utilisateur voit cinq éléments, un
compteur qui en annonce six, un bouton mort et aucune consigne. Ce qu'il faut retirer
**n'est pas dans la liste qu'il regarde**. Les interfaces qui laissent dépasser un
plafond doivent soit empêcher le dépassement (désactiver ce qui n'est pas coché à 5),
soit nommer ce qui dépasse.

**Correctif** : le texte libre entre dans « Ta sélection » comme une entrée retirable,
et le compteur en état de dépassement porte la couleur d'erreur + `role="alert"`.

## R15N-11 — le texte GÉNÉRÉ de `/welcome` vouvoie, dans un écran qui tutoie 29 fois

Écran `/welcome`, bloc « Ce que Bellum va personnaliser pour toi ». Mesuré en
production, **deux fois, de part et d'autre d'une régénération** — ce n'est pas un
transitoire.

Le texte écrit à la main tutoie partout (29 occurrences de `ton/ta/tes/tu`). Les
trois encarts écrits par le modèle vouvoient :

- Recherches : « les signaux que **vos** cibles cherchent des ressources comme les
  **vôtres** »
- Messages : « **vous** parlez la langue technique et réglementaire de chaque secteur »
- Scoring : « **votre** couverture **stakeholders** — combien de décideurs techniques
  **vous** avez identifiés »

Et trois anglicismes dans les mêmes encarts : `stakeholders`, `corporate`,
`consultative`. (`scoring` est du vocabulaire produit assumé, il est aussi dans le
texte écrit à la main — pas un défaut.)

**Cause** : la consigne de tutoiement n'est pas dans le prompt qui écrit le contexte
personnalisé. C'est une règle de marque qui vit dans l'UI et pas dans le modèle.
**Correctif** : la poser dans le prompt ET la garder — une garde qui relit le texte
rendu et refuse `vous/votre/vos` hors citation. Sans garde, elle redevient une opinion.

⚠️ **Observé une fois, non reproduit** : entre deux mesures, le bloc « Scoring »
affichait à l'utilisateur « Ce texte, écrit le 15/09/2026, ne respecte plus nos
règles : il sera réécrit à la prochaine génération de ton contexte. » Le texte s'est
effectivement régénéré, et la phrase a disparu. Le mécanisme est sain (on refuse
d'afficher un texte non conforme) mais **il parle à l'utilisateur en vocabulaire
interne** : « nos règles » ne veut rien dire pour un client. À reformuler côté
utilisateur, sans le supprimer.

## R15N-12 — « 20 environnements » puis « 20 d'entre eux » : la phrase ne se lit pas

`apps/web/src/i18n/locales/fr/welcome.json:76-80`, rendu par
`MarketAwarenessCard.tsx:112` et `:122`.

À l'écran, deux phrases qui se suivent :
> Bellum connaît déjà **20** environnements de marché
> L'environnement observé de **20 d'entre eux** retrouve tes expertises déclarées : …

Le calcul est JUSTE — `environmentsWithFit` (`:88-92`) compte les entrées dont
`marketFitFor(...)` rend `matched`, et `title` compte `read.matches.length`. Ici les
deux valent 20.

Le défaut est de rédaction, et il est réel : « d'entre eux » a son antécédent dans un
TITRE, au-dessus, et le même nombre apparaît deux fois à trois mots d'intervalle.
Le lecteur ne peut pas savoir ce qui est comparé à quoi. Quand
`environmentsWithFit === read.matches.length`, la phrase doit le dire
(« **les 20** retrouvent tes expertises ») ; c'est seulement quand les deux diffèrent
qu'une fraction a du sens.

Pas un défaut de doctrine (GA-259 est respecté : on annonce ce qu'on SAIT), un défaut
de lisibilité sur un chiffre — donc exactement là où ça compte.

## R15N-13 — j'ai nommé le mauvais garde, et Louis a agi dessus

J'ai dit à Louis que `/onboarding/plan` et la page 0 étaient inatteignables « tant que
ton espace n'est pas en `refresh_required` ». C'était vrai pour la page 0, **faux pour
`/onboarding/plan`** : son garde (`apps/web/src/routes/onboarding/plan.tsx:23-39`) ne
lit PAS le statut d'onboarding, il lit le **palier du compte** — `resolvePlanScreen`
n'affiche l'écran qu'à un compte `decouverte`. L'espace de Louis est en bêta : il
redirige vers `/dashboard` dans tous les cas.

Louis a autorisé la bascule en partie sur cette phrase. La bascule a servi (tout le
questionnaire recetté, R15N-9 à R15N-12 trouvés) mais elle ne pouvait pas mener là.

**La leçon** : quand un écran redirige, on lit SON `beforeLoad` avant de nommer la
cause. J'avais lu celui de `routes/onboarding/index.tsx` et j'ai supposé que celui de
`plan.tsx` disait la même chose. Deux routes voisines, deux gardes différents.

## R15N-14 — juste après `POST /onboarding/refresh`, la page 0 rend la MAUVAISE variante

Mesuré en production le 15/09 sur `085cff0db`, deux fois de suite, dans les deux sens.

**Le geste** : `POST /api/onboarding/refresh` (200, l'API répond `status: refresh_required`),
puis navigation vers `/onboarding`.

**Ce qui s'affiche** : la page de PREMIÈRE FOIS — « Bienvenue dans Bellum », « Environ 8 à
12 minutes · 12 étapes », action « Commencer mon audit ». La phrase de reconfiguration
(« Tes réponses actuelles sont conservées : rien n'est effacé, et on ne repose que ce qui
manque ») est ABSENTE.

**Après un rechargement dur du navigateur**, la même URL rend la bonne variante :
« Nous avons entièrement repensé la personnalisation de Bellum », « Compléter mon profil »,
la phrase de conservation présente. L'API disait `refresh_required` dans les deux cas.

**Ce n'est donc pas une régression du rendu** — `resolveOnboardingEntry`
(`onboarding-gate.ts:161-173`) et `OnboardingWelcomePage.tsx:66-67` sont justes sur `main`.
C'est l'ÉTAT LU qui est périmé au premier rendu : le `beforeLoad` de la route sert une
lecture d'onboarding antérieure au POST.

**Pourquoi ça compte** : le chemin réel de l'utilisateur passe par Réglages › Profil →
« Revoir mes réponses », qui appelle `POST refresh` puis emmène sur la page 0. Si cette
navigation est côté client, l'utilisateur voit l'accueil de première fois — on lui annonce
8 à 12 minutes et 12 étapes alors qu'il a déjà répondu, et on ne lui dit pas que ses
réponses sont conservées. C'est précisément la promesse que #2022 fait.

**À vérifier avant de corriger** : est-ce que le bouton de Réglages invalide la lecture
d'onboarding avant de naviguer ? Si non, l'invalidation est le correctif — pas une
retouche du rendu.

**Leçon de méthode, la deuxième fois aujourd'hui** : j'ai failli écrire « régression » sur
la foi du premier rendu. Seul un rechargement tranche. Même famille que l'écran noir du
14/09 : comparer des empreintes ne prouve rien, recharger prouve.

## R15N-15 — « 100 % complété » est un cliquet : en reconfiguration il ment dès le premier écran

Mesuré en production le 15/09 sur `085cff0db`, espace de Louis en `refresh_required`,
**douze écrans consécutifs relevés**.

**Ce qu'on voit** : dans la nav des étapes, « 100 % complété » — **figé à 100 % sur les
douze écrans** — pendant que la barre de progression voisine (`role="progressbar"`) monte
8 % → 17 % → 25 % → 33 % → 42 % → 50 % → 58 % → 67 % → 75 % → 83 % → 92 % → 100 %.
Deux nombres à trois mots l'un de l'autre, qui ne mesurent pas la même chose, et dont
aucun ne dit ce qu'il mesure.

Pire que discordant : **faux**. Sur `offer_expertise/domaine-offre`, le libellé annonçait
« 100 % complété » alors que **huit groupes de questions de cet écran étaient sans
réponse** (relevé : 8 clics nécessaires pour activer « Continuer »).

**La cause, nommée** : `apps/web/src/features/onboarding/components/OnboardingStepper.tsx:61-66`

```ts
// #2023.6 — plafond monotone : ne redescend jamais sous ce qui a déjà été
// montré pendant cette session d'écran.
const maxPercentRef = useRef(0)
const rawPercent = onReview ? 100 : progress.percent
const displayPercent = clampProgressRegression(maxPercentRef.current, rawPercent)
maxPercentRef.current = displayPercent
```

Le cliquet est une bonne idée **pour un premier passage**, qui va toujours de l'avant : il
évite le clignotement d'une barre qui recule. Il devient faux en **reconfiguration**, où
l'utilisateur entre avec un profil déjà largement rempli : `progress.percent` vaut 100 au
premier rendu, `maxPercentRef` s'y verrouille, et plus rien ne peut le faire redescendre —
y compris sur des écrans réellement vides.

**Correctif** : le cliquet ne s'applique qu'au premier passage. En reconfiguration, le
pourcentage suit la mesure. Et dans les deux cas, **les deux nombres doivent dire leur
portée** — « 100 % de cette étape » et « étape 3 sur 12 » ne se confondent pas.

C'est la même famille que R15N-9 et R15N-12 : un nombre juste dans son calcul, faux à
l'écran parce que son ensemble de référence n'est pas celui que le lecteur suppose.

## R15N-16 — le cloisonnement BU tient sur la liste et tombe sur la fiche

**Mesuré le 15/09/2026 sur `origin/main` = `63f0c7ee8`, après fusion de la PR #2236.**

Le périmètre BU (`BusinessUnitService.scopeFor`) est résolu à **deux** endroits, et
deux seulement :

| Chemin | Périmètre BU | Preuve |
| --- | --- | --- |
| `@Get()` liste des comptes | **oui** | `accounts.controller.ts:301` |
| `@Get('market-memory-portfolio')` | **oui** | `accounts.controller.ts:542` |
| `@Get(':id')` **fiche d'un compte** | **NON** | `accounts.controller.ts:1155` → `findOneForWorkspace(id, workspaceId)`, `accounts.service.ts:1676` — la signature ne prend pas de périmètre |

Les ~18 autres routes de lecture du même contrôleur (`:id/timeline`, `:id/similar`,
`:id/runs`, `signals`, `needs`, `sectors`, `companies`, `hygiene`,
`similar-to-explore`, `portfolio-series`…) ne le portent pas non plus, ni la dizaine
d'autres modules qui lisent `AccountEntity` (`account-access`, `account-entities`,
`account-feedback`, `account-gate`…).

**Le geste qui le prouve** : mettre un membre en `business_unit_access =
'business_unit'` sans lui donner le périmètre de Lyon, puis ouvrir directement
`/accounts/<id d'un compte de Lyon>`. La liste ne le montre pas ; la fiche s'ouvre.

**Pourquoi ce n'est pas une urgence de production** : la dimension est **inerte**.
`business_unit_access` vaut `'workspace'` pour tout le monde
(`business-unit.service.ts:86` — le défaut, et `'business_unit'` est un
rétrécissement explicite). Personne n'est cloisonné, donc rien ne fuit aujourd'hui.

**Pourquoi c'est quand même à corriger d'abord** : le trou s'ouvre au premier
`'business_unit'` posé, et ce geste-là ne ressemblera pas à un changement risqué.
Un cloisonnement qui tient sur la liste et tombe sur la fiche est pire qu'un
cloisonnement absent : il donne la sensation d'être protégé.

**Ce que la garde n'a pas vu, et pourquoi** : `business-unit-scope.spec.ts:280`
vérifie que « le contrôleur des comptes APPELLE réellement la résolution de
périmètre ». C'est vrai — il l'appelle, deux fois. La garde prouve qu'un appelant
existe ; elle ne prouve pas que **tous** les chemins de lecture en ont un. C'est la
forme « code juste que personne n'appelle » retournée : un appelant qu'on a oublié.
