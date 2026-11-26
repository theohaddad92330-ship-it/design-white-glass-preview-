# Brief — réconcilier un registre `/chat` (21/09/2026)

Tu réconcilies **un** registre. **Tu n'écris AUCUNE ligne de code.** Ton périmètre exact
(fichier, nombre de points, issues, total attendu) est dans le message qui t'a lancé.

Ces registres ont été écrits les 18 et 20/09 et **jamais balayés depuis**. Sept vagues
d'intégration ont atterri entre-temps : une part de ce qui est marqué `retenu` est **déjà dans
le code**, et le redonner à un écrivain, c'est payer deux fois — l'écriture, puis le démêlage à
l'intégration. Mesuré le 15/09 sur ce dépôt : dix-neuf balayages ont déplacé **plus de 330
points**, de **14 %** à **95 %** selon le registre.

## Point par point, une seule question : le comportement existe-t-il déjà ?

**Deux états, et rien d'autre :**

- **`déjà là`** — le comportement est sur `origin/main` ;
- **`livré`** — le code est sur une branche **non fusionnée**, et **tu nommes la branche dans
  la ligne**.

🔴 **Tu n'écartes JAMAIS un point.** Écarter est un arbitrage produit, qui n'appartient pas à un
agent. Un point que tu juges inutile, mal posé ou contradictoire **reste `retenu`**, et tu le
remontes dans ton rapport sous « à trancher par Louis ». Mesuré le 13/09/2026 : neuf points
écartés par des agents au nom de décisions antérieures, **aucun remonté**, et l'utilisateur l'a
découvert en demandant « c'est quoi ce qui a été écarté ».

**Ce qui exige une mesure en PRODUCTION reste `retenu`, honnêtement** : une mise en page, une
hauteur de carte, un rendu mobile, un enchaînement d'écrans ne se prouvent pas au code. Écris la
nuance dans la ligne (« livré, mais testé en unitaire sans appelant réel »).

## La preuve se prend à l'APPELANT, jamais au titre d'un commit

« Le commit dit qu'il livre X » ne prouve rien. Chaque ligne déplacée porte une preuve
**`fichier:ligne`** qui nomme **qui écrit** et **qui lit** — le composant qui rend, la route qui
expose, le service qui renseigne.

⚠️ Le motif qui revient dans tout ce dépôt est *« du code juste, calculé, testé, que personne
n'appelle »*. Une fonction qui existe **sans appelant réel n'est pas `déjà là`**. Sa variante
inverse existe aussi, et elle est plus sournoise : un champ que le contrat sait porter mais que
**personne ne remplit** — donc cherche l'**écrivain** autant que le lecteur.

⚠️ **Cherche par COMPORTEMENT ou par clé i18n, jamais par le libellé littéral du point.** Une
capacité livrée sous un autre numéro, ou nommée autrement, ne se trouve que comme ça.

⚠️ **Pour ce chantier précis, le diagnostic global est déjà posé** (décision Louis 18/09/2026) :
*les ingrédients existent presque tous, le plat n'existe pas.* Les schémas sont riches et testés
— `projectNeedSchema`, `PROJECT_STAGES`, `coverage.ts`, `org-views.ts`, `entityTypeSchema`,
`signalKindSchema`, `opportunityFreshnessSchema` — mais **aucun des soixante outils de
`apps/ia/app/prompts/chat_tools.py` ne compile ni ne crée un Besoin ou une Opportunité**, et
aucun n'assemble une prélecture de compte. Donc : un point qui demande **un SCHÉMA ou un
CALCUL** est souvent `déjà là` ; un point qui demande **qu'un outil `/chat` l'APPELLE** est
presque toujours encore `retenu`. Vérifie les deux côtés avant de trancher, c'est toute la
valeur de ton balayage.

## Les pièges de shell, tous mesurés ici

- `git grep -lin` **n'existe pas** — c'est `-l -i -n`. Un grep mal écrit rend zéro **exactement
  comme** une absence réelle.
- **`head` sur un `git grep` cache l'appelant** : les `.spec.ts` trient avant les `.ts`. Quand tu
  cherches qui appelle, filtre les tests (`| grep -v -E '\.(spec|test)\.'`) au lieu de couper la
  sortie.
- Un grep sur un **chemin inexistant rend 0** : vérifie le chemin (`test -e`) avant de conclure
  à une absence.
- **Batche tes recherches** : un seul appel bash avec vingt `git grep` coûte quarante fois moins
  qu'un vérificateur, et répond en secondes. La forme qui marche :

```sh
echo "### 1 le libellé existe-t-il ?"; git grep -n "maClé" origin/main -- apps packages | grep -v -E '\.(spec|test)\.' | head -5
echo "### 2 qui appelle la fonction ?"; git grep -n "maFonction(" origin/main -- apps | grep -v -E '\.(spec|test)\.'
echo "### 3 l'outil chat existe-t-il ?"; git grep -n "mon_outil" origin/main -- apps/ia/app/prompts/chat_tools.py
echo "### 4 la route est-elle montée ?"; git grep -n "@Post('mon/chemin'" origin/main -- apps/api/src
```

## Comment éditer le registre, exactement

- **Une ligne à la fois**, jamais une réécriture du fichier entier. Un registre unique de
  1 242 lignes a été réécrit 186 fois en trois jours ; c'est précisément ce qu'on évite.
- **Les annotations s'AJOUTENT** à la fin de la cellule de preuve, séparées par `‖`. On n'efface
  jamais une annotation existante : elle porte une mesure datée qui vaut peut-être plus que la
  tienne.
- ⚠️⚠️ **Une cellule peut contenir un `\|` ÉCHAPPÉ** (un type TypeScript dans le texte, par
  exemple `kind: already_subcontracted\|…`). Si tu découpes une ligne sur `|` pour la recoller
  par script, tu crées une colonne fantôme et tu décales **tout ce qui suit**. C'est arrivé le
  21/09 : un état écrit au milieu d'une phrase, et 3 000 caractères de preuve effacés. **Édite
  ces lignes à la main.**
- **Mets à jour la ligne `base :` en tête** du registre, avec le SHA de `origin/main` et la date.
  Sans elle, personne ne sait ce qui a été mesuré.

## Vérifie ton travail avant chaque commit

```sh
python3 ~/.claude/plugins/cache/louis-skills/livraison/0.5.0/scripts/registre.py -f <ton registre> --tout compte
```

Le **total doit rester inchangé** (le nombre attendu est dans ton message de lancement). S'il
bouge, tu as cassé une ligne — répare avant de commiter.

⚠️ **N'écris pas ton propre compteur.** Un compteur ad hoc suppose une position de colonne et
jette des lignes **en silence** : 20 lignes perdues, mesuré le 18/09, toutes des réponses, ce qui
faisait paraître des issues plus loin de la clôture qu'elles ne l'étaient.

## Commit et push

Un commit **tous les ~20 points traités**, et **`push` après CHAQUE commit** :
`/usr/bin/git push --no-verify -u origin HEAD`. Mesuré le 21/09 : un agent coupé à son plafond
portait **61 commits parfaits jamais poussés**, donc invisibles, donc perdus.

`--no-verify` sur le **push** seulement (le pre-push fait tourner prettier sur tous les
worktrees, 18 minutes) ; **jamais** sur le commit — commitlint exige un en-tête **≤ 100
caractères** et un scope de l'enum (`tooling` convient pour un registre ; `registre` n'y est
**pas**).

**Tu n'ouvres pas de PR. Tu ne touches ni à `main`, ni à une ligne de code, ni à un autre
registre que le tien.**

## Ton rapport

⚠️⚠️ **Écris-le en continu**, réécrit entier tous les ~20 points, dans
`"$(/usr/bin/git rev-parse --absolute-git-dir)"/rapport-agent-<ton nom de lot>.md` — **et si ton
bac à sable refuse cette écriture** (message du type « Edit the worktree copy... instead of the
shared-checkout path », arrivé à un agent le 21/09), écris-le à la **racine de ton worktree**,
sous le même nom. Les deux endroits sont relus.

Un agent coupé à son plafond **n'exécute AUCUNE consigne suivante** : ce fichier est la seule
chose qui survit.

Contenu, **≤ 20 lignes** :

- combien de points déplacés, et **vers quoi** ;
- **les issues qui passent à zéro point en attente** — c'est ça qui ferme une issue, et c'est la
  ligne la plus utile de ton rapport ;
- les points qui demandent un **arbitrage de Louis** (jamais écartés par toi) ;
- ce qui reste **non balayé**, nommé.

**Budget : 200 tours. À 160 tours : commit, push, rapport, stop.** Mieux vaut la moitié des
points balayés et rendus que la totalité perdue.
