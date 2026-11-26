# Fragments de lot — `changes/<lot>.yml`

Une branche de lot (`claude/lot*`) ne touche plus les **fichiers chauds** — ceux que chaque lot éditait au même endroit
et sur lesquels chaque intégration conflictait :

- `packages/contracts/src/changelog/**` (entrées et libellés FR/EN)
- `apps/api/src/modules/demo/demo-coverage.ts`
- `agent_docs/demo-mode.md`
- `agent_docs/chantiers-livres.md`

Le hook `pre-push` refuse le push d'un lot qui les touche (`tools/ci/hot-files.mjs`). Le lot écrit à la place UN
fragment `changes/<lot>.yml` ; l'intégrateur l'applique :

```sh
python3 tools/issues/fusion_fragments.py          # tous les changes/*.yml, retirés une fois appliqués
pnpm exec prettier --write <fichiers touchés>      # la commande exacte est affichée
```

Tout est validé avant la première écriture (rien n'est écrit sur un refus), rejouer un fragment ne duplique rien, et
les fragments s'appliquent du plus ancien au plus récent (le changelog reste _newest-first_).

## Format

Un sous-ensemble YAML, lu sans dépendance : mappings, listes `- `, scalaires simples ou entre guillemets, blocs `|`.
Indentation par espaces. Mettre entre guillemets un élément de liste qui contient `mot:` en tête ou commence par `[`.

```yaml
lot: lot-630
issues: [4886, 4837]

# Facultatif — une entrée de changelog, posée en tête des trois catalogues.
changelog:
  id: 2026-10-31-lot-630 # AAAA-MM-JJ-slug, unique
  comment: 'Lot 630 (#4886 #4837) — ce que l’utilisateur gagne, en une ligne'
  fr:
    date: 31 octobre 2026
    title: L’export dit ce qu’il garde
    items:
      - Premier point, en une phrase.
      - 'Deuxième point : avec deux-points, donc entre guillemets'
  en:
    date: October 31, 2026
    title: The export says what it keeps
    items: # parité stricte : autant d'items qu'en français
      - First item.
      - Second item.

# Facultatif — des blocs posés tels quels dans un fichier chaud.
inserts:
  - file: agent_docs/chantiers-livres.md
    after: '## Une ligne exacte du fichier' # ou `before:` ; ni l'un ni l'autre = fin du fichier
    text: |
      - **Export** (#4886) — sa raison, son tracker.
  - file: apps/api/src/modules/demo/demo-coverage.ts
    before: '// ⟵ une ligne exacte, unique dans le fichier'
    text: |
      export const DEMO_EXPORT_COVERAGE = { state: 'seede', reason: '…' } as const
```

Refus (rc 1, fichier nommé) : parité FR/EN rompue, identifiant mal formé, ancre introuvable ou présente deux fois,
chemin hors du dépôt, accolades déséquilibrées ou identifiant en double après application. La règle de la craft rule
n°9 ne change pas : une feature démo-visible se classe dans `demo-coverage.ts` — par un fragment, plus par un diff.
