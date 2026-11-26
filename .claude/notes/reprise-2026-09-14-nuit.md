# Reprise — 14/09/2026, nuit. Objectif unique : FERMER DES ISSUES

> Cette session-ci n'a rien fermé. Elle a prouvé 425 points sur 1 392 (54 au
> départ) et **fait atterrir 8 branches en production** (API vue servir
> `ce33e140f` à 21h37Z). Une intégration R (5 branches) était en vol à la coupure. La suivante doit
> transformer ça en issues closes. Tout ce qui suit sert cet objectif-là.

---

## 0. Le premier geste, avant toute chose

**Vérifier que le déploiement a eu lieu**, puis recetter. `main` est passé à
`ce33e140f` (PR #2221 mergée à 21h28, CI 23/23 verte).

```sh
curl -s https://api.bellum-ai.com/version   # doit rendre ce33e140f, api ET ia
```

**État mesuré à 21h42Z** : API = `ce33e140f` ✅ · IA = `d2f5ae8a1` — **NORMAL, pas un
retard.** Vérifié à 22h00Z par les statuts GitHub du commit : `bellum-ia-service`
`pending` 21:28:15 → `success` 21:28:24, **9 secondes** — Railway a SAUTÉ le build (l'API,
elle, a mis 6 min). Et l'IA ne lit AUCUN des 6 fichiers de contrats de la PR (0 référence).
⚠️ J'avais d'abord conclu « IA concernée, déploiement jamais parti » en me fiant au bloc
`watchPatterns` de `.claude/projet.md` §6 — **ce bloc est périmé : `apps/ia/railway.json`
n'existe pas à `ce33e140f`**. La commande qui tranche, en une seconde :
`gh api "repos/{owner}/{repo}/commits/<sha>/statuses" --jq '.[]|"\(.context) \(.state) \(.created_at)"'`
— un `success` en quelques secondes est un build sauté, pas un déploiement.
L'intégration R touche `apps/ia` (`chat_tools.py`) : là, l'IA DOIT basculer.

⚠️ **Recetter avant les DEUX déploiements invente des pannes.**

⚠️⚠️ **Le navigateur était COUPÉ à la fin de cette session** : le compte claude.ai de
Claude Code a changé (`/login`), l'extension Chrome est restée sur l'ancien compte →
« Browser extension is not connected ». Les deux comptes doivent être le même.
Et **l'artefact de suivi appartient à l'ancien compte** : un compte qui ne le
possède pas ne peut pas le mettre à jour (il en créerait un second).

---

## 1. Ce que la production vient de recevoir (PR #2221, 8 branches)

| branche | ce qu'elle porte | points qui deviennent RECETTABLES |
|---|---|---|
| `provenance-du-contexte` — **SEULEMENT `9273dba55`** | la provenance du contexte atteint l'écran | **#2116.3 .6 .7** |
| `collaboration-sur-le-compte` | le bandeau de collaboration du dossier | **#2128.1 .3 .4 .6 .17 .20 .21 .23 .24** (9 points) **+ #2128.7** — voir ci-dessous |
| `niveau-dentite-nomme` | le niveau d'entité survit à un accent | **#2119.28 à .31** |
| `defauts-de-recette` | l'historique nomme ses événements ; ajouter/importer sans défiler | **#2124.68**, **#2120.46 .47** |
| `opportunites-une-section` · `historique-et-preuves` · `plan-objets-canoniques` · `demo-compte-no-go` | sections du dossier + semis démo | points de #2115, #2124, #2172 |

⚠️⚠️ **Corrigé après coup : #2116.31/.32/.51 ne sont PAS en prod.** L'intégrateur Q a
pris `9273dba55` et laissé son enfant direct `dcfe06cbd` (parent = `9273dba55`) en le
croyant issu de l'incident de concurrence. C'est lui qui porte la garde par action
facturée, `DossierCta.tsx` et `NeedsAccountSheet.tsx`. **Il part dans l'intégration R.**
Leçon : *vérifier `git merge-base --is-ancestor <chaque sha cité en preuve> origin/main`
avant d'annoncer qu'un point est recettable* — la colonne preuve citait les DEUX shas.

**#2128.7 (attribuer le compte) n'est plus réfuté** : le bandeau porte maintenant un
menu « Attribuer » → `useAssignAccount` → `managerApi.assignAccount` →
`PATCH /accounts/:id/assign`, droits tenus par le serveur (403 → toast « forbidden »).
À recetter comme les autres, ⚠️ un clic d'attribution ÉCRIT : choisir le porteur
actuel (idempotent) ou « Libérer » puis ré-attribuer.

Libellés à chercher (mesurer les boîtes, pas le texte) : `section[aria-label="Collaboration
sur ce compte"]` ; « Propriétaire : » / « Dernière activité de l’équipe : » / « Ont
travaillé ce compte : » ; croisements : pastille `G1|G4|G9|G11`, « Voir l’activité de »,
« Ouvrir la mémoire collective », « Continuer malgré tout ». #2128.23 « Coordonner » =
l'action suggérée `coordinateOrArbitrate` (« → Se coordonner, ou demander un arbitrage »).
⚠️ **#2128.17 est REPASSÉ à `retenu`** (vérifié dans le code, pas deviné) : G4
`prospectionCollision` lit `user_actions WHERE account_id = $2` sur 7 jours — c'est une
collision de COMPTE. Le point demande un CONTACT déjà sollicité. La pastille « Déjà
contacté » de la liste de contacts (`user_status !== 'new'`) n'est pas une alerte qui
nomme un collègue. `user_actions.contact_id` existe : c'est un `WHERE` de plus. **#2128
n'a donc que 9 points recettables maintenant, pas 10.**
Comptes témoins pour les croisements G4 (semis démo, `demo-dataset.ts:6221-6233`) :
Société Générale, Thales, leboncoin, BlaBlaCar.
Le bandeau ne s'affiche QUE s'il a quelque chose à dire ; les croisements exigent un
compte qui en a — les trouver par l'appel mémoire relevé dans `performance`.

**Première issue à fermer : #2116** — 3 points recettables maintenant, 3 dans R.

---

## 2. Branches prêtes, NON mergées (pour l'intégration R)

**Intégration R lancée à 21h40Z** (agent intégrateur, brief
`scratchpad/brief-integration-r.md`), branche `integration-r`, worktree `scratchpad/wt-r`.
Consigne : PR ouverte puis STOP, **ne merge rien**. Vérifier à la reprise :
`git rev-parse --short origin/integration-r` et `gh pr list --head integration-r`.

| ordre | branche | tête | ce qu'elle porte |
|---|---|---|---|
| 1 | `integration-q-suite` | `af66fa350` | `etats-affirmes-a-lecran` (`67ca7c5f6`, 9 points de #2123) **+ le correctif n°3 de l'intégration Q** |
| 2 | `provenance-du-contexte` | `dcfe06cbd` | **#2116.31/.32/.51** — le reliquat oublié par Q |
| 3 | `hero-ne-secrase-plus` | `4cea56a05` | ⚠️ **le défaut critique du hero** (voir §4) |
| 4 | `sections-completes` | `50c1ff215` | #2115.22/.23/.26/.27 — **les quatre objets existaient déjà**, il manquait le montage |
| 5 | `preuves-de-mission` | `82a1da69b` | #2124.49-.55 — producteur DÉTERMINISTE (aucun appel modèle), validation à l'écran |

⚠️⚠️ **Collision de migration garantie sur la n°5** : `1793700000000-ProofEvidenceFields.ts`
porte le timestamp exact que Q a dû renommer (`migrations.spec.ts` refuse les multiples
de 1e8). À renommer au-dessus de `1793700100000`, dans le fichier, la classe ET `name`.
⚠️ GA-332 existe en deux versions (n°3 et n°4) : une seule doit survivre.
Trois décisions de la n°5 **à faire valider par Louis** : producteur déterministe plutôt
que modèle ; `propose_mission_proof` hors `WRITE_TOOL_NAMES` ; exception nommée à GA-131.

⚠️ Trois fichiers de test (`PlanActionItem.test.tsx`, `ActionCenter.test.tsx`,
`CopilotCards.test.tsx`) existent sur `etats-affirmes-a-lecran` **et** dans ce qui
est déjà mergé, à cause d'un incident de concurrence. En cas de conflit, **la
version de `etats-affirmes-a-lecran` fait foi** : chaque assertion y a été
vérifiée capable de dire NON.

---

## 2 bis. ⚠️ Une décision de contrat d'URL à valider avant l'intégration R

La branche `sections-completes` fait de **`messages` une clé canonique** au lieu
d'un alias de `plan`. Raison donnée, et elle tient : garder l'alias faisait
diverger `resolveTab` (qui lit `TAB_KEYS` en premier) de `buildTabMappingTable`
(qui applique les alias en dernier) — `accountDetailSearch.test.ts:176` l'attrape.

Conséquences à connaître :
- `?tab=messages` ouvre toujours la section **Plan d'action**, désormais sur
  l'ancre `#dossier-messages`. Aucun ancien lien ne casse.
- Plus aucune section n'a UNE seule sous-partie, donc la branche
  `messageSectionOnly` de `TabMigrationNotice` n'est plus atteignable depuis une
  URL. Elle est testée directement sur le composant, avec la raison écrite.
- ⚠️ **L'ancien `TabMessages` avait été supprimé EXPRÈS** (`b6e5279c7`, « mort ET
  faux », deux surfaces concurrentes). La nouvelle sous-section est une **porte**
  vers `components/contact-engagement/`, pas une seconde surface : zéro rendu,
  zéro écriture. L'antériorité a été respectée — vérifier que ça le reste.
- Pas d'alias FR (`?tab=programmes`, `?tab=besoins`) : les ajouter à
  `LEGACY_TAB_ALIASES` déclencherait à tort la notice de migration.

## 3. Comment fermer une issue — la procédure, en comptant

```sh
# combien de points, combien de prouvés
grep -c '^| #<issue>\.' .claude/notes/registre-2026-09-14-accounts-*.md
grep -hE '^\| #<issue>\.' .claude/notes/registre-2026-09-14-accounts-*.md | grep -cE 'recetté|écarté'
```

`recetté` + `écarté` = nombre de points ⟹ **et seulement alors** :

```sh
gh issue close <n> --comment "Corrigé : <ce qui change pour toi> — en prod (<sha>)."
```

Le commentaire s'adresse à **celui qui a signalé**, pas à l'équipe.
**Jamais** de clôture sans avoir vu tourner en production.

---

## 4. ⚠️ Le défaut critique à recetter en premier (corrigé, pas encore mergé)

Le **hero du dossier de compte s'écrase à 0 px de large** : le nom, le secteur,
le SIREN et le propriétaire s'affichent **un mot par ligne** sur 700 px de haut,
et un bouton recouvre le `<h1>`. Mesuré sur **5 comptes sur 5 × 7 sections sur 7**
en production — c'est l'état permanent de l'écran principal du produit.

Cause : la rangée d'actions porte `shrink-0` et réclame 1 527 px pour un parent
de 1 174 (elle contenait la phrase entière de prochaine action). Flexbox retire la
différence au seul frère rétrécissable, à qui `min-w-0` a ôté son plancher.

Corrigé sur `hero-ne-secrase-plus` (`4cea56a05`). **Reste dû : la vérification
visuelle 360 → 1920 px.** La mesure qui tranche est la largeur de la colonne
d'identité à **1 024, 1 150 et 1 512 px** de fenêtre — la bande dangereuse
calculée est 1 024 à 1 222 px.

---

## 5. La méthode qui a fait le débit — à appliquer dès la première minute

### ⚠️⚠️ Avant de lancer un vérificateur : « puis-je écrire la commande qui répond ? »

**Mesuré ce soir : un vérificateur coûte ~140 000 tokens pour ~15 points. Les
mêmes verdicts par `git grep` groupés : ~6 000 tokens, en 20 secondes.**
Démonstration : 14 points de #2127 et 11 points de #2118 tranchés en deux appels
bash — dont **deux vrais manques produit** que personne ne cherchait (§6).

Un agent reste justifié pour **suivre une chaîne** (contrat → service → route →
écran → test), lire une intention dans un corps de fonction, ou trancher entre
deux implémentations. Jamais pour constater une présence ou une absence.

⚠️ `git grep -lin` n'existe pas (`-l -i -n`), et une variable multi-lignes passe
comme UN argument. **Un grep vide par erreur de syntaxe ressemble exactement à
une absence** — relire la commande avant de conclure.

### Les trois autres règles, payées cash ce soir

- **`isolation: "worktree"` sur CHAQUE écrivain.** Deux écrivains dans le dépôt
  principal ⟹ un `git add` qui emporte les fichiers de l'autre, un commit mêlé,
  le dépôt qui change de branche seul.
- **Pousser après chaque branche mergée.** 40 commits non poussés pendant une
  heure = zéro issue fermable.
- **Recette écran : un appel = un écran**, jamais de boucle clic+attente
  (3 dépassements, 2 relevés FAUX par dérive de navigation). Et **relire
  `location.href` DANS la capture** : URL mesurée ≠ URL demandée ⟹ relevé nul.

### La sonde de mise en page — 11ᵉ contrôle, à passer sur chaque écran touché

Un écran ne se recette pas en LISANT ce qu'il dit mais en MESURANT où sont ses
boîtes : `innerText` est parfaitement correct sur un bloc écrasé à 0 px.
Code complet : skill `livraison:recette`, § « La sonde de mise en page ».
Quatre symptômes : **écrasé** · **déborde** (lire `flex-shrink`) · **recouvre le
`<h1>`** · **défilement du corps**. Une sonde vide vaut recette de mise en page.

---

## 6. Ce qui est trouvé et attend une décision de Louis

### Arbitrages posés, sans réponse
1. **Trois retours contredisent une doctrine écrite** — #2127.2/.17 (afficher les
   dates de la mémoire marché, interdit absolu au contrat), #2150.29 (bouton
   « ajouter au portefeuille » dans la recherche, supprimé par la décision
   #1408), #2118.41 (un axe citant la mémoire marché comme source, impossible par
   construction). **Ne pas les écarter seul.**
2. **Les sept axes du dossier** : zéro des 30 comptes de production ne porte
   `dossier_read`. Relancer un compte existant est **impossible** (`launch-plan`
   rend `cache_hit`). Seule une analyse **neuve** les produit : **8 crédits**,
   solde **66/250**, portefeuille **184/250**. Louis a approuvé « 2-3 témoins »
   avant de connaître ces chiffres — **reposer la question**.

### Décisions PRISES, en cours d'exécution
- **Compléter les sections** de #2115 (branche `sections-completes`).
- **Laura propose les cinq champs de preuve, l'humain valide** (#2124.49-.55,
  branche `preuves-de-mission`).

### Manques produit trouvés par inventaire, jamais signalés
- **Le TERRITOIRE de l'ESN n'atteint jamais le moteur.** Inventaire exhaustif des
  clés lues par `apps/ia/app` : `offers`, `size`, `sectors`, `personas`,
  `references`, `positioning`, `turns_off`, `speaks_in`, `revenues`,
  `no_go_sectors`, `lever` — **et rien d'autre**. Une ESN parisienne et une ESN
  lyonnaise reçoivent le même verdict. Donnée demandée à l'onboarding, puis jetée.
- **La CAPACITÉ DISPONIBLE non plus.** L'axe `capacite` annonce « ton aptitude à
  délivrer » et ne reçoit que `size`, l'effectif total.
- **Aucune source de RÔLE n'est câblée** — `useRouteAccess` pose `role:'owner'`
  en dur. Toute règle de permission côté écran est donc décorative. C'est ce qui
  laisse #2116.31 à moitié livré.
- `RefreshTriggerProposal` / `refreshTriggerCost` n'ont **aucun consommateur**,
  sur les six déclencheurs de rafraîchissement.
- **Un état vide GLOBAL avale une sous-partie encore pleine** : `TabProjects`
  rendait un état vide dès `rows.length === 0` (aucun PROJET), ce qui masquait
  les « besoins confirmés » d'un compte qui en avait. Donnée présente, composant
  présent, montage présent, écran vide. L'état vide appartient à la sous-partie
  qui est vide, jamais à son conteneur — **chercher les jumeaux de ce défaut.**

---

## 7. État chiffré au moment de la reprise

**425 / 1 392 points prouvés** (418 recettés + 7 écartés). Restent : 839 `retenu`,
66 `déjà là`, 32 `livré`, 24 `reformulé`, 6 `à trancher`. *(Recalculé depuis les
registres à 21h50Z, pas corrigé à la main.)*

| issue | prouvés | reste | issue | prouvés | reste |
|---|---|---|---|---|---|
| **#2116** | 47/53 | **6** (3 en prod, 3 dans R) | #2126 | 16/63 | 47 |
| **#2115** | 43/53 | **10** (7 dans R, 3 critères de recette) | #2119 | 15/64 | 49 |
| #2127 | 23/40 | 17 | #2125 | 18/69 | 51 |
| #2118 | 32/53 | 21 | #2172 | 2/56 | 54 |
| #2155 | 1/29 | 28 | #2128 | 6/63 | 57 (9 recettables maintenant) |
| #2150 | 31/62 | 31 | #2157 | 0/61 | 61 |
| #2121 | 22/54 | 32 | #2123 | 21/83 | 62 |
| #2122 | 25/65 | 40 | #2156 | 0/74 | 74 |
| #2117 | 40/85 | 45 | #2167 | 15/103 | 88 |
| #2120 | 30/77 | 47 | #2130 | 17/117 | 100 |
| #2124 | 21/68 | 47 | | | |

**Les 3 derniers points de #2115 sont des critères de recette, pas du code** :
.49 « aucune information métier perdue » et .53 « plus de 14 onglets à parcourir »
se prouvent en COMPTANT, une fois R en prod. **La preuve de code est faite** sur
`sections-completes` (`50c1ff215`) : `ACCOUNT_SECTIONS` (`AccountDetailTabsBar.tsx:104-132`)
range les **14/14** clés de `TAB_KEYS` dans 7 sections, plus 4 sous-sections neuves
(`programs`, `needs`, `messages`, `memory`). Reste à VOIR en prod chaque ancre atteinte.
⚠️ `sectionOfTab` retombe EN SILENCE sur `synthesis` pour un onglet absent de la table
(`:137-138`) : juste aujourd'hui, mais un 15ᵉ onglet oublié y disparaîtrait sans erreur. .48 « Hervé explique les sept sections sans
formation » est un jugement humain : le poser à Louis, ne pas le déclarer seul.

**#2157 et #2156 ne se ferment pas** : leurs 91 points dépendent tous d'une
entité `TargetList` qui n'existe nulle part (ni SQL, ni TypeORM, ni contrat, ni
écran). C'est UN chantier, pas 91 points.

---

## 8. Les fichiers

- **Registres** (la vérité, jamais l'artefact) :
  `.claude/notes/registre-2026-09-14-accounts-{piliers,metier-1,metier-2,prospection}.md`
  ⚠️ **Un registre se COMPTE, il ne se relit pas.** L'état d'un point change par
  l'édition de SA ligne, jamais par la réécriture du fichier.
- **Défauts de recette** : `.claude/notes/defauts-recette-2026-09-14.md`
- **Artefact de suivi** (à régénérer à chaque frontière, TOUJOURS avec son `url`) :
  https://claude.ai/code/artifact/e236fc3e-69d5-4b20-a4f5-7b962f9b6d1f
  ```sh
  python3 ~/Desktop/SKILLS_TEMPLATES/scripts/suivi-issues.py --projet BellumAI \
    --titre "Retours bellum" --tri <scratchpad>/main-tri.md \
    --registres '.claude/notes/registre-*.md' \
    --reprise .claude/notes/reprise-2026-09-14-nuit.md \
    --ouvertes 255 --prod "$(git rev-parse --short origin/main)" \
    --sortie <scratchpad>/main-suivi.html
  ```

## 9. Les pièges d'outillage vérifiés ce soir

- **`git log --oneline origin/main -1` MENT** dans ce dépôt (un hook le réécrit) :
  utiliser `git rev-parse`.
- Les formes de test qui marchent :
  `cd apps/web && node node_modules/vitest/vitest.mjs run <chemins> --maxWorkers=2` ·
  `node apps/api/node_modules/jest/bin/jest.js --config apps/api/jest.config.js --maxWorkers=2` ·
  `pnpm --filter @bellum/api check-types` **ET** `check-types:tests` (jobs séparés).
- **Un zéro n'est une mesure qu'avec son code de sortie** ; `${PIPESTATUS[0]}` est
  perdu à travers un pipe. `uptime > 12` pendant une suite = verdict sur la MACHINE.
- `git commit --cleanup=whitespace -F <fichier>` — un `-F` nu mange les lignes `#`,
  donc tous les numéros d'issue.
