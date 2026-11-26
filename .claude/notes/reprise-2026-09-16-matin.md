# Où reprendre — 16/09/2026, fin de matinée

**`origin/main` = `03625739f`** · **production servie = `3993b432b`** (2 commits
de notes d'écart, donc main ≈ prod pour tout ce qui est code).

## 🔴 LE VERROU, et c'est le seul

**La CI ne rend plus de vert.** `CI_RUNS_ON` est passé à `bellum-ci` (runners
auto-hébergés, CX43 8 vCPU / 16 Go, conteneurs à `mem_limit: 3g`) le 16/09 à
07 h 28. Les jobs de test lourds meurent en **OOM** (`Killed`, exit **137**) :
un shard de test web dépasse 3 Go. Aucune CI n'a été prouvée verte sur ce VPS —
le dernier vert de `main` (04 h 11) est d'AVANT la bascule.

**Louis a pris ce chantier pour lui** (QCM du matin : « Laisse le VPS, je m'en
occupe »). **Ne pas toucher `CI_RUNS_ON`, ne pas toucher aux runners.** Les PR
attendent son feu vert.

Conséquence en chaîne, et c'est tout le sujet : rien n'atterrit → rien ne passe
`recetté` → **aucune issue ne peut se fermer**. Tout le travail ci-dessous est
prêt et s'accumule derrière ce verrou.

## Ce qui attend, prêt

| Branche | Ce qu'elle porte |
| --- | --- |
| **PR #2457** `integration-vague12bis` | vague 12 bis, **9 branches absorbées**, draft, MERGEABLE, portes vertes (web 12 100 · api 13 844 · contracts 5 026 tests) |
| `feat/actions-branche-sur-plan-items-16-09` | `/actions` branché sur `/plan-items/mine` + **parité démo** (3 tâches sur comptes réels) |
| `feat/canal-notification-navigateur-16-09` | canal navigateur, 4 états, garde à fixture négative, `localStorage` sous `try/catch` |
| `feat/missions-quatre-onglets-16-09` | ⚠️ le renversement 13 → 4 onglets (en vol à l'écriture de cette note) |
| `feat/discover-lot-16-09` · `feat/dossier-compte-piliers-16-09` | lots d'écriture (en vol) |
| `feat/conclusions-non-tirees-entrent-dans-la-liste-16-09` | GA-345 étendue (en vol, **basée sur `integration-vague12bis`**) |
| 5 branches `chore/registre*-16-09` + 3 `chore/reconcilier*-16-09` | les 16 registres et le dossier d'arbitrages |
| `chore/arbitrages-a-trancher-16-09` | le dossier des 304 `à trancher` (724 lignes) |

⚠️ **Rien n'est fusionné.** 32 worktrees d'agents sont vivants et tous portent du
travail — **aucun n'est à purger** tant que rien n'a atterri.

## L'état du corpus

**427 issues ouvertes** · **16 registres** · **8 183 points** · **245 issues
couvertes**. Le matin même : 9 registres, 4 317 points, 175 issues. **+3 866
points découpés en une matinée**, sur treize écrans qui n'avaient aucun registre.

États : `retenu` 3 349 · `déjà là` 2 892 · `recetté` 1 051 · `livré` 461 ·
`à trancher` 371 · `écarté` 33 · `reformulé` 19.

## Les trois choses à savoir avant de reprendre

1. **La réconciliation n'est plus un levier.** 750 points balayés → 24 déplacés
   (0,4 % à 8 % selon le registre). Les gains de 14-95 % du 15/09 sont récoltés.
   **Ne plus ouvrir un lot par là.**
2. ⚠️ **17 % des `recetté` mentent** — 184 points sur 1 051 portent une preuve qui
   dit « MERGÉ », « NON MESURÉ » ou nomme une branche de worktree. Décomposés :
   106 sans SHA · 31 sur une branche d'agent · **24 dont la preuve dit
   littéralement « NON MESURÉ »** · 23 réellement en prod. **Les 24 doivent
   repasser `livré`** — non fait, les registres étaient tenus par des agents.
3. **Le geste qui manque, et qui s'écrit en une heure** : une garde qui refuse la
   contradiction « état `recetté` + preuve contenant NON MESURÉ / MERGÉ /
   worktree-agent ». **Rien ne l'empêche aujourd'hui.** C'est le premier geste du
   prochain lot.

## Ce qui a été fermé, ouvert, répondu

- **#2069 fermée** — 14/14 points, garde `stored-context-doctrine.spec.ts` sur le
  SHA servi, 27 tests verts.
- **#2456 ouverte** — `/discover` n'a aucun `<h1>` (mesuré en prod, 255 éléments
  lus). 39 fichiers d'écran sur 60 n'en portent pas, et c'est un MAJORANT.
- **#2112 · #2145** — l'écran d'arrivée reste Laura, le réglage existe déjà.
- **#2108** — le persona Dirigeant sur la page d'arrivée est REFUSÉ, avec sa
  raison (GA-254, la règle la plus re-demandée du corpus : 11 points la rouvrent).

## Les dix décisions du jour

`.claude/notes/decisions-2026-09-16.md` — chacune avec ce qu'elle renverse.
Deux à relire : la réduction à **4 onglets** (3ᵉ fois que le sujet se rouvre) et
**`/pilotage` prend tout** (contre la recommandation, coût assumé écrit).

## La recette de la matinée

`.claude/notes/recette-2026-09-16-masse.md` — 5 écrans mesurés, **sonde de mise
en page propre partout**, 257 tests de preuve verts sur le SHA servi, et le
compte du compte de Louis réparé par `POST /onboarding/complete`.

## Le prochain geste, dans l'ordre

1. **Attendre le vert de la CI** (Louis). Rien d'autre ne débloque les clôtures.
2. Merger **#2457**, puis déployer, puis **recetter** ce qu'elle porte.
3. Poser **la garde anti-`recetté`-menteur**, puis repasser les 24 en `livré`.
4. Reprendre l'écriture sur **`/chat`** (209 `retenu` + 14 `reformulé`) — il était
   verrouillé par l'intégration, il se libère dès que #2457 atterrit.
