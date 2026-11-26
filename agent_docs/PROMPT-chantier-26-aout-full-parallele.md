# Le prompt de reprise — finir le dossier du 26 août, en parallèle intégral

> Copier le bloc du §1 tel quel dans une session neuve. Le reste de ce fichier est
> ce que la session ira lire : le périmètre MESURÉ, le plan de dispatch, et les
> pièges qui se repaient à chaque fois qu'on les oublie.

---

## 1. Le prompt

```
/chantier agent_docs/dossier-26-aout-2026.md

Mode implémenter, parallélisme INTÉGRAL. Objectif : amener les 22 documents du
dossier du 26 août à 100 %, et délivrer le certificat d'épuisement.

NE REFAIS PAS CE QUI EST FAIT. Lis d'abord, dans cet ordre :
  1. agent_docs/PROMPT-chantier-26-aout-full-parallele.md  (ce fichier — le plan)
  2. le §9 du tracker                                       (l'état, à jour)
  3. le §12 du tracker                                      (les neuf recomptages)
  4. le §12.6                                               (les décisions parquées)

La source est DÉJÀ dépliée dans agent_docs/sources/dossier-26-aout/ — 22 fichiers
.txt, un par PDF, plus LISEZ-MOI.txt, SOMMAIRE et le CSV DATAFORGE. Ne retélécharge
rien, ne redéplie rien, ne relis pas les PDF binaires : les .txt sont le MÊME
contenu, greppable et citable à la ligne.

Deux vagues, décrites au §3 de ce fichier :
  · vague A — 13 agents en LECTURE, un par document jamais recompté ;
  · vague B — N agents en ÉCRITURE, en worktrees, périmètres de fichiers DISJOINTS.

Tu ne me redemandes pas la permission de merger, de déployer, de recetter ni de
passer au lot suivant. Une décision neuve se PARQUE au §12.6 avec sa
recommandation et ne bloque rien. Tu rends la main quand le certificat passe, ou
sur un vrai blocage.
```

---

## 2. Le périmètre, MESURÉ — pas estimé

`AVANCEMENT_TRACKER=agent_docs/dossier-26-aout-2026.md python3 tools/avancement/mesure.py`
rend, à ce jour, neuf documents recomptés et **cohérents** (`coherent: true` sur les neuf).

| document  | couverture | PARTIEL |  ABSENT | NON PROUVÉ | **dus** |
| --------- | ---------: | ------: | ------: | ---------: | ------: |
| PDF-06    |     25,8 % |      44 |      48 |          0 |  **92** |
| PDF-03    |     34,2 % |      56 |      46 |          2 | **104** |
| PDF-07    |     34,7 % |      49 |      31 |          1 |  **81** |
| PDF-08    |     37,0 % |      61 |      55 |          0 | **116** |
| PDF-05    |     37,4 % |      32 |      34 |          1 |  **67** |
| PDF-04    |     43,0 % |      32 |      53 |          1 |  **86** |
| PDF-01    |     55,3 % |      21 |      13 |          0 |  **34** |
| PDF-13    |     83,0 % |      14 |       2 |          0 |  **16** |
| PDF-02    |     93,0 % |       8 |       1 |          0 |   **9** |
| **TOTAL** |            | **317** | **283** |      **5** | **605** |

⚠️ **Ces pourcentages ne s'ADDITIONNENT PAS et ne se moyennent pas.** Les
recouvrements entre documents sont NOMMÉS dans chaque §12.x mais **pas
dédupliqués** : additionner compterait deux fois une exigence que deux PDF posent.
Le seul chiffre agrégeable est « 605 lignes d'inventaire non closes », et il
sur-compte pour la même raison.

**Treize documents n'ont JAMAIS été recomptés** — donc leur couverture est
inconnue, ce qui n'est pas « zéro » :

> PDF-09 · PDF-10 · PDF-11 · PDF-12 · PDF-14 · PDF-15 · PDF-16 · PDF-17 ·
> PDF-18 · PDF-19 · PDF-20 · PDF-21 · PDF-22

Soit ~6 000 lignes de source. C'est la vague A.

---

## 3. Le plan de dispatch

### Vague A — recompter les 13, en parallèle intégral

**Un agent par document. Treize agents d'un coup.** Ils LISENT le dépôt et
ÉCRIVENT un seul fichier chacun, à un chemin qui n'appartient qu'à eux :

```
agent_docs/recomptages/PDF-09.md
agent_docs/recomptages/PDF-10.md
…
```

C'est ce qui rend les treize simultanés sans un seul conflit : **périmètres de
fichiers disjoints**. L'intégrateur concatène ensuite chaque fichier dans sa
section `§12.x` du tracker, une fois, à froid.

Chaque fichier porte **l'ancre que `mesure.py` cherche**, à recopier au caractère près :

```markdown
**Document mesuré : `PDF-09`**
```

⚠️ **L'ancre est le NOM du document, jamais un numéro de section.** Une section se
renumérote ; la mesure mourrait alors en silence, ce qui est le pire des deux
maux — un tableau qui affiche encore un chiffre faux.

Le fichier porte ensuite un tableau de statuts et **la phrase de contrôle** :

```
Clos = LIVRÉ + REFUSÉ + PÉRIMÉ = 78 / 94 = 83 %
```

`mesure.py` **recompte le tableau et le confronte à cette phrase** ; le moindre
écart pose `coherent: false` et `pct: null`. Un recomptage qui ne se recoupe pas
lui-même ne s'affiche pas.

Statuts autorisés, et la preuve exigée pour chacun : `references/croisement.md`.
Rappel des deux qui coûtent le plus cher quand on les confond :

- **`LIVRÉ`** exige un `fichier:ligne` **et un APPELANT réel**. Du code juste que
  personne n'appelle est le défaut n°1 de ce dépôt — cherche l'appelant, pas la
  fonction. Sans appelant : `NON PROUVÉ`.
- **`PÉRIMÉ`** est celui qui fait gagner le plus de temps : une source datée
  demande souvent ce qui a été tranché autrement depuis. Le §12.6 et le registre
  de doctrine (`packages/contracts/src/schemas/doctrine-registry.ts`) disent quoi.
  Ne recode jamais un trou périmé.

### Vague B — implémenter, en worktrees, par périmètre de code

Les 605 dus **ne se découpent pas par document** : deux PDF demandent la même
chose au même fichier. On découpe par **zone de code**, et chaque agent reçoit un
« NE TOUCHE PAS » explicite pour les zones des autres.

| agent | périmètre                                                | conflit à prévoir |
| ----- | -------------------------------------------------------- | ----------------- |
| B1    | `apps/web/src/features/<zone>` + ses routes              | i18n              |
| B2    | `apps/api/src/modules/<module>` + migrations             | contracts         |
| B3    | `apps/ia/app/{prompts,routers,services}`                 | contracts         |
| B4    | `packages/contracts` (zod → JSON Schema → miroir Python) | **le carrefour**  |
| B5    | `demo-dataset.ts` + `demo-coverage.ts` + leurs gardes    | —                 |

Deux conditions, jamais sautées : **`isolation: "worktree"`** sur tout agent qui
écrit, et un périmètre décrit **contre `origin/main`**, jamais contre la branche
d'un autre agent — vérifie avec `git show origin/main:<chemin>` avant d'écrire
« ceci existe déjà » dans un prompt. Le 27/08, un briefing faux là-dessus a
produit **sept fichiers en collision** et deux implémentations dont aucune
n'était un sur-ensemble de l'autre.

Les conflits se concentrent sur `packages/contracts` et les fichiers i18n. C'est
prévu, c'est le travail de l'intégrateur, pas celui des agents.

### La cadence des PR se DÉDUIT du débit de la CI

```sh
gh api repos/Bellum-AI/belllum-monorepo/actions/runners --paginate \
  --jq '.runners[]|"\(.status)\t\(.busy)"' | sort | uniq -c
gh run list --workflow=CI --limit 5 --json databaseId,createdAt,updatedAt,conclusion
```

**Nombre de PR × durée d'un cycle ≤ temps disponible.** Des PR courtes quand la
CI est rapide ; **une PR d'intégration quand elle ne l'est pas** — treize
branches fusionnées en une, c'est une file au lieu de treize.

⚠️ **Ne merge JAMAIS pendant qu'une autre CI tourne** : chaque merge redéploie le
runner et annule les autres. Signature du défaut : des durées RONDES (10m00s,
15m00s), `cancelled`, « log not found ». Ce n'est pas ton code.

⚠️ **La CI ne se déclenche que sur `pull_request`.** Un merge direct sur `main` ne
lance rien — c'est ce qui a laissé le dépôt sans filet du 25 au 27/08.

---

## 4. Ce qui est TRANCHÉ — ne le repose pas

Les 21 décisions du §6.10 et les huit neuves (D47 → D53 + la seconde moitié de
D34) sont toutes tranchées. La preuve n°5 du certificat est TENUE.

Plus, du 28-29/08 :

- **Les mots-clés n'agiront pas en mode Registre.** Le seul levier texte du
  registre est `q`, que les deux sources lisent comme un **nom d'entreprise** ; y
  router « aéronautique » rendrait les sociétés _nommées_ Aéronautique. Le dépôt
  refuse déjà cette falsification pour `city` sur Pappers.
- **`bellum_battlecard` et `bellum_rfp_analyse` restent sur Sonnet.** Battlecard :
  Luna 53,57 contre 100. RFP analyse : Luna **s'emballe** — 12 000 jetons de
  sortie contre 2 200, tronqué 1 tirage sur 3, pour un plafond de prod à 8 000.
- **L'organigramme garde sa tâche canonique** (`org`, séparée de `classify`) et
  reste hors de Luna : le banc le voit PERDRE (100 → 95,10, axe
  `chaine_de_decision`).
- **Le gain Luna n'est pas ÷20** mais **÷10 en entrée, ÷8,33 en sortie** — et
  **nul** quand l'entrée Sonnet est déjà en cache (0,1 × 2,00 $ = 0,20 $/M,
  exactement l'entrée pleine de Luna).

---

## 5. Ce qui n'a JAMAIS été vérifié — à nommer, jamais à compter comme fait

1. **Le cron des interventions de 06h10** (#1195). Jamais observé — la session
   d'origine a commencé à 23h04.
2. **Ce qui sectionne le flux SSE** de #1187. Prouvé : un EOF propre sans
   évènement terminal. Corrigé : pourquoi les relances étaient stériles. Non
   trouvé : ce qui coupe la connexion. Il faudrait les logs Railway du 28/08.
3. **Les affectations des 7 missions de la salle de démonstration.**
4. **Le bloc `raw_analysis.selfConsistency` n'a AUCUN lecteur** — vérifié :
   `bellum_advisor.py:85-88` cherche trois chemins, aucun n'est le bon
   (`account_data` est la ligne `accounts` entière, pas `raw_analysis`), et
   `grep` sur `apps/web/src` rend zéro. Calculé et payé à chaque analyse pour
   rien. **Trancher « brancher le lecteur ou éteindre la mesure » avant toute
   question de modèle.**

---

## 6. Les pièges d'outillage — ils se repaient à chaque session neuve

| piège                                   | ce qu'il faut faire                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `railway variables` rend du vide        | passer `--service belllum-backend-service` ou `--service bellum-ia-service`                                                |
| `GET /version`                          | `ia.commit` est **imbriqué** — parser le JSON, un grep ment                                                                |
| `ls` rend « (empty) » sur du plein      | interception RTK — seul un **code de sortie** prouve. Idem `prettier`, sorti à 1 avec « All files formatted correctly »    |
| `grep … \| head` rend le code de `head` | le faux zéro classique — mesurer `grep` seul, puis compter                                                                 |
| `git log` après un merge                | rend le commit PRÉCÉDENT — la vérité est `git rev-parse HEAD`                                                              |
| `Failed to resolve import "@bellum/…"`  | `pnpm install --frozen-lockfile`, ce n'est PAS une régression                                                              |
| `X is not a function` sur `contracts`   | `pnpm --filter @bellum/contracts build`                                                                                    |
| `python` nu                             | n'existe pas ici : `.venv/bin/python`                                                                                      |
| déploiement **preview** backend rouge   | **préexistant** sur toutes les PR — la production, elle, se déploie                                                        |
| le magasin du banc                      | `apps/ia/evals-out/model-bench.jsonl` est **gitignoré** : il n'existe que dans le dépôt principal, jamais dans un worktree |

---

## 7. La condition de sortie — le certificat, pas « j'ai livré quelque chose »

`references/epuisement.md`, dix preuves. Les deux qui recalent le plus souvent :

- **Aucune ligne d'inventaire ne reste blanche.** Sept croisements écrits et
  quarante-cinq lignes laissées vides, c'est ce qui a fait tomber le certificat la
  dernière fois. **Compter par script, ne pas relire** — une relecture confirme
  toujours à tort.
- **Un total de tracker est un ARGUMENT, pas un fait.** Six comptes faux en un
  jour. Recompter par script, et vérifier que `mesure.py` rend `coherent: true`
  sur **les 22** documents avant d'écrire `DONE`.

Et à chaque vague mergée, deux gestes de cinq minutes :

1. **republier le tableau d'avancement** — depuis le **dépôt principal** (la
   source est gitignorée, le programme refuse de produire depuis un worktree),
   puis l'outil Artifact sur le **même chemin de fichier** : même URL, celle que
   Louis a déjà ouverte ;
2. **réécrire le §9** — ce qui est tranché, ce qui est mergé sans être recetté, ce
   qui n'a jamais pu être vérifié, ce qui reste. Un §9 en retard est ce qui rend
   un `/clear` effrayant ; un §9 à jour le rend gratuit.
