# Intégration vague 12 bis — à dispatcher dès que #2364 et #2365 sont mergées

Plafond 300 tours. `isolation: "worktree"`, `/usr/bin/git`. **Pousse et ouvre la
PR en draft dès que les portes passent**, même s'il reste des branches à
absorber : deux intégrations qui atterrissent valent mieux qu'une parfaite qui
n'atterrit pas.

## Les branches, mesurées le 16/09 à 06 h 35 (base `origin/main`)

| Branche | SHA | commits | fichiers |
| --- | --- | --- | --- |
| `integration-vague12-onboarding-9-10-parking` | `5b2eb066d` | +29 | 145 |
| `feat/la-campagne-de-laura-ouvre-les-sequences` | `432392e3d` | +15 | 109 |
| `feat/contexte-audit-commercial-cable` | `ea8460426` | +1 | 12 |
| `fix/ce-qui-na-pas-pu-etre-etabli-dit-la-verite` | (écrivain en vol, **basé sur `ea8460426`**) | | |
| `fix/le-detecteur-reconnait-tous-les-noms-de-nos-fournisseurs` | `5bdff4c30` | +1 | 4 |
| `fix/un-seul-detecteur-de-fournisseurs` | (écrivain en vol, **basé sur `5bdff4c30`**) | | |
| `fix/lunion-des-propositions-de-laura-vit-a-un-seul-endroit` | `b00cd2779` | +1 | 6 |
| `feat/nos-fournisseurs-ne-peuvent-pas-atteindre-lecran` | `60cc04c18` | +1 | 2 |
| les deux branches de réconciliation de registre | (agents en vol) | | ne touchent QUE `.claude/notes/registre-*.md` |

⚠️ **Deux couples sont chaînés** : prendre la branche FILLE suffit, elle
contient sa mère. Vérifie-le (`git merge-base --is-ancestor <mère> <fille>`)
plutôt que de me croire.

## Les trois points de couture connus d'avance

1. **`prepare_campaign` aura besoin d'une entrée dans `ACTION_ICON`.**
   `integration-vague12-audit-laura` (déjà mergée à ce moment-là) apporte le
   quatorzième variant zod ; `fix/lunion-…` retire l'union recopiée du `.tsx` et
   fait lire celle du contrat. Une fois les deux ensemble, la table d'icônes n'a
   plus de ligne pour cette action et **`chat-actions-cross-language.test.ts` le
   dira en rouge**. C'est un point d'INTÉGRATION : il n'existe qu'au moment où
   les deux se rejoignent.

2. **`copilot-card-catalog.ts` a TROIS endroits à tenir d'accord** : le type
   `NavigationAction`, le jumeau d'exécution `NAVIGATION_ACTIONS`, et la liste
   **littérale** de `case` du `switch` qui construit l'intent (il lit la forme
   brute, pas `EffectfulAction`). Si une fusion touche ce fichier, revérifie les
   trois.

3. **Les comptes à remesurer**, jamais à recopier :
   - `onboarding-question-consumers.ts` : 132 entrées après la vague 12 ; le
     parking en porte **158**. Le chiffre du docblock et celui de
     `ia.client.spec.ts` doivent suivre la MÊME source.
   - GA-19 (`display-primitives.test.ts`) : `NULLISH_ZERO_AT_FREEZE` était à 114
     sur main. ⚠️ Le compte se fait **après `stripComments()`** — j'ai compté
     faux deux fois en lisant des occurrences qui vivaient dans un docblock.

## Les portes, et les pièges d'environnement

```sh
readlink node_modules/@bellum/contracts
for d in packages/*/node_modules/@bellum/contracts; do [ -e "$d" ] && echo "$d -> $(readlink "$d")"; done
pnpm -r --filter './packages/*' build      # pnpm install ne CONSTRUIT rien
```
- « Failed to resolve entry for package » parle d'un paquet, jamais d'une ligne
  de code : c'est l'environnement.
- `npx prettier --list-different`, **jamais `--check`** (son texte ment ; et un
  code 2 veut dire « le fichier ne parse pas », pas « à reformater »).
- Fusion bloquée par les hooks : `-c core.hooksPath=/dev/null` et `HUSKY=0`.
- `commande | tail -5; echo "exit=$?"` lit le code de `tail`. Rediriger, puis
  `echo` sur la ligne suivante.
- `git mv` fige le contenu ANCIEN dans l'index : un `sed` d'après n'est pas
  re-stagé. `git status` qui dit `RM` le dit déjà ; vérifier par
  `git show "HEAD:<chemin>"`.

## Règle de fusion

Un conflit de REGISTRE se résout en gardant **les deux côtés, dédupliqués par
NUMÉRO de point** — jamais en écrasant un fichier. Vérifier doublons ET
équilibre des accolades avant de committer un catalogue multi-lignes.
