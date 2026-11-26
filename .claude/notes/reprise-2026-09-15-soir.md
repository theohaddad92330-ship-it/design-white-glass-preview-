# Reprise — 15/09/2026, soir

`main` = `ac1a59e1f`. Page de suivi : https://claude.ai/artifact/UwAs2A2aRGsCu4n6dFLeSi

## 1. Le registre, en un coup d'œil

4 308 points · **`à trancher` = 0** (c'était 140 ce matin)
`recetté` 817 · `retenu` 2 302 · `déjà là` 860 · `livré` 285 · `reformulé` 19 · `écarté` 25

## 2. Les huit décisions de Louis — détail dans `decisions-2026-09-15-soir.md`

Gratuité de l'onboarding · la BU est un libellé, pas une partition · 72 h puis on crée
son espace · les chiffres d'argent visibles par tous · un rôle déclaré ne donne aucun
droit · « recours externe observé » en carte ET en filtre, libellé nuancé · Action OS
en priorité · les 46 points d'écran tranchés par Claude.

**Deux ont été prises contre ma recommandation** (chiffres d'argent, filtre de
couverture) : le risque de chacune est écrit, et les 3 points qui exigeaient l'inverse
sont `écarté` **sur décision**, pas sur absence.

## 3. Mergé aujourd'hui

#2227 #2229 #2230 #2231 #2233 #2235 #2236 #2237 #2238 #2239 #2241 #2242.

## 4. En vol au moment d'écrire

| Quoi | Où |
| --- | --- |
| Action OS **L4** (le web) | écrivain |
| Navigation : groupes retirés, routes redirigées | écrivain |
| Déduction **champ par champ** (#2031.10) | écrivain |
| Sauvetage #2234 + 3 branches | intégrateur |

PR ouvertes : **#2234** (CI relancée), **#2244** (worksAlone), #1487 (vieille, CONFLICTING).

## 5. Branches finies, en attente d'intégration

- `worktree-agent-a5d455bfb62d57f04` — autosauvegarde visible + date du prérempli + son changelog (`8f817685f`)
- `worktree-agent-a0af3b831659a8ca9` — Laura compte avant de proposer un lien (`3241e73ce`)
- `worktree-agent-ae8e9893b62d0e996` — L15, 12 points maturité/effectif (`4bcec55ed` + `f034b1e68`)

## 6. ⚠️ Les trois choses à ne pas réapprendre

1. **Le plafond de tours vit dans `maxTurns:` du frontmatter de `~/.claude/agents/<type>.md`.**
   L'écrire dans le brief ne l'augmente pas. Trois agents se sont coupés à 150 **sans
   rendre leur rapport**, après 250 à 330 k tokens chacun. Corrigé à 250. Un agent coupé
   se REPREND par `SendMessage` sur son identifiant — il repart de son transcript.

2. **Deux défauts de la même famille dans `profile-questionnaire.ts`, trouvés le même
   jour** : `worksAlone` comparé à `'1'` quand les six valeurs réelles sont des libellés,
   et `hasConnectedTooling` qui masque quatorze outils sur un booléen. **Un prédicat
   comparé à des valeurs que le produit ne produit pas.** Les deux avaient été repérés
   par des écrivains qui ne les ont pas corrigés faute de budget — les deux seraient
   restés. **Quand un agent signale un défaut hors de son lot, il faut le prendre tout
   de suite ou lui ouvrir un lot ; sinon il meurt dans un rapport.**

3. **Un faux `déjà là` est pire qu'un `retenu`** : #2037.12 était marqué fait sur la foi
   d'un prédicat qui ne marchait pas. Un point `déjà là` n'est jamais revisité.

## 7. La neuvième famille de faux positifs en recette

`javascript_tool` rend **« BLOCKED: Cookie/query string data »** sur certains écrans
(`/dashboard`, `/discover`) et pas sur d'autres, pour la même sonde. Ce n'est ni un
défaut d'écran ni une session expirée : c'est le classifieur de l'outil.
**Le contournement** : `get_page_text`, qui lit `<main>` sans exécuter de script — mais
il ne donne pas la géométrie, donc la sonde de mise en page reste au script.

## 8. Ce qui reste, par taille

`registre-2026-09-12` (Laura) 442 · `onboarding-audit-welcome` 595 ·
`onboarding-questionnaire` ~406 · `accounts-prospection` 284 · `accounts-metier-2` 152 ·
`accounts-metier-1` 106 · `discover` 140 · `accounts-piliers` 29.

Le plus gros gisement non entamé : **L19** du plan questionnaire (#2048→#2060, 176
demandes) — il touche `questions.ts`, libre depuis que L15 a livré.
