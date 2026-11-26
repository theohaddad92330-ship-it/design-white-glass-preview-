# Le banc de comparaison de modèles

> **À quoi ça sert** : répondre à « est-ce que ce modèle-là fait le travail, chez nous, sur nos
> comptes ? » — sans changer un seul défaut de production, et **sans avoir à me redemander**
> comment on s'y prend la prochaine fois. Le premier cas d'usage était `claude-haiku-4-5` contre
> `gpt-5.6-luna`. Le banc ne connaît ni l'un ni l'autre : un modèle candidat est un **argument de
> ligne de commande**, jamais une entrée de code.

## La commande, en entier

Depuis `apps/ia`, avec le venv du service.

```bash
# 0) — GRATUIT — ce que contient déjà le corpus
python -m app.eval.bench.run corpus

# 1) — PAYANT — capturer les prompts de comptes réels (~$0.70–1.10 par compte)
#    Lance le VRAI pipeline et enregistre chaque appel LLM qui en part.
python -m app.eval.bench.run record --company doctolib,lectra,societe-generale --yes-run-live

# 2) — GRATUIT — combien coûterait de rejouer ce corpus, par modèle
python -m app.eval.bench.run cost --model claude-haiku-4-5 --model openai:gpt-5.6-luna

# 3) — PAYANT — rejouer LE MÊME prompt sur chaque modèle (aucune collecte refaite)
python -m app.eval.bench.run replay --model claude-haiku-4-5     --yes-run-live
python -m app.eval.bench.run replay --model openai:gpt-5.6-luna  --yes-run-live

# 4) — le verdict, en quatre colonnes
python -m app.eval.bench.run compare \
    --arm claude-haiku-4-5 \
    --arm openai:gpt-5.6-luna \
    --judge claude-sonnet-5
```

Options utiles : `--limit 3` (essai à quelques centimes), `--prompt bellum_organigramme` (ne
rejouer qu'un prompt — pratique pour n'arbitrer QU'un poste), `--store <fichier.jsonl>`, `--json`, `--out rapport.json`,
`--no-judge-calls` (vérifier et enregistrer le juge sans le payer).

### Ce que `compare` affiche

```
═══ Banc de modèles — claude-haiku-4-5 vs openai:gpt-5.6-luna ═══
  corpus  : golden   commit : f861e37de7d2949db636cab3ea9c430bc6f7125b
  date    : 2026-08-28T14:13:48
  cas     : 3 (doctolib, lectra, societe-generale)
  entrées : 4 appariée(s)
  juge    : anthropic:claude-sonnet-5  (consultatif)

  bras                     modèle                          qualité    coût $  latence s   p95 s       schéma    juge
  ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  claude-haiku-4-5         anthropic:claude-haiku-4-5        98.75    0.4800       3.00    3.00          4/4    7.20
  openai:gpt-5.6-luna      openai:gpt-5.6-luna               74.36    0.0800       7.50    7.50          4/4    7.60

  Quatre colonnes, jamais fondues : un modèle 5× moins cher qui rate un
  organigramme sur trois n'est pas « moins bon de 12 % », il est inutilisable.

  Qualité par prompt (/100) — [claude-haiku-4-5]  [openai:gpt-5.6-luna]
  ────────────────────────────────────────────────────────────────────────
  bellum_contacts_batch_1_of_1              95.00        61.67
  bellum_facts                             100.00        83.33
  bellum_organigramme                      100.00        75.51
  bellum_signals                           100.00        76.92

  Qualité par axe (part 0-1) — [claude-haiku-4-5]  [openai:gpt-5.6-luna]
  ────────────────────────────────────────────────────────────────────────
  comite_couvert                            0.600        0.000
  contacts_tous_traites                     1.000        0.333
  decideurs_identifies                      1.000        0.400
  fraicheur_datee                           1.000   non mesuré
  personnes_reelles                         1.000        0.857
  priorite_posee                            1.000        0.000
  relations_retenues                        1.000        0.000
  signaux_dates                             1.000        0.500
  signaux_sources                           1.000        0.500
  siren_plausible                      non mesuré        0.000
  …                                             …            …
     · axes non mesurables sur au moins une sortie (hors dénominateur, NOMMÉS) :
       fraicheur_datee, siren_plausible
     · quality_by_prompt : la moyenne globale mélange des barèmes différents — pour
       décider d'un poste (organigramme, contacts…), lire la ligne de CE prompt.
     · juge anthropic:claude-sonnet-5 : sa note est une colonne CONSULTATIVE, à côté
       des mesures déterministes. Elle n'entre dans aucun verdict.
```

## Le manque que ce banc comble

`raw_analysis`, les fixtures de `tests/golden/` et les enregistrements de campagne sont tous des
**SORTIES**. Nulle part le dépôt ne conservait le couple `(system prompt, user prompt)` d'un appel.
**Sans entrées identiques, comparer deux modèles c'est comparer deux collectes** : Brave n'a pas
rendu les mêmes pages, Pappers n'a pas rendu la même date, et l'écart mesuré n'est pas celui du
modèle. C'est le corpus rejouable qui rend la comparaison honnête ; le reste s'appuie dessus.

## Les pièces

| Chemin                          | Rôle                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `app/eval/bench/corpus.py`      | Le magasin JSONL d'entrées **rejouables**, append-only, reprenable, dédupliqué par `record_id`.   |
| `app/eval/bench/recorder.py`    | L'enregistreur branché sur le goulot — **éteint par défaut, no-op prouvé par identité d'objet**.  |
| `app/eval/bench/replay.py`      | Le rejoueur : la même entrée, un autre modèle, **aucune collecte**.                               |
| `app/eval/bench/quality.py`     | La colonne qualité : elle route vers le barème du prompt, et AVOUE quand il n'y en a pas.         |
| `app/eval/bench/rubrics/`       | **Un barème par prompt**, chacun fait de critères qui existaient déjà (voir la section dédiée).   |
| `app/eval/bench/judge.py`       | Le juge choisissable, enregistré, non-candidat, **non décisionnaire**.                            |
| `app/eval/bench/compare.py`     | Les quatre colonnes + l'enveloppe (commit, date, cas, modèles, juge).                             |
| `app/eval/bench/cost.py`        | La projection de coût, depuis des jetons **mesurés**.                                             |
| `app/eval/bench/run.py`         | La CLI.                                                                                           |
| `app/eval/strategy/variants.py` | **L'axe « modèle »** : `ModelSpec`, `model_env`, `model_variant` — une fabrique, pas une bascule. |
| `tests/test_model_bench.py`     | 55 tests du banc, zéro réseau, zéro dépense.                                                      |
| `tests/test_bench_rubrics.py`   | 32 tests des barèmes — dont **une sortie fautive par barème**, qui doit être sanctionnée.         |

## Où l'enregistreur se branche, et pourquoi ça ne coûte rien

`claude_service.call_claude` délègue **tout** à `app.services.llm_gateway.complete`, et il le fait
par un import **local à la fonction** : l'attribut du module est relu à chaque appel. C'est le seul
point par lequel passent les cinq sites à `response_model` strict du chemin payant.

L'enregistreur **enveloppe** cet attribut au lieu d'ajouter un `if` dans la passerelle. La raison
est une preuve, pas une préférence : quand l'enregistreur n'est pas installé,
`llm_gateway.complete` est **le même objet fonction** qu'avant l'import du module. Il n'y a pas un
branchement de plus dans le chemin de production — il n'y a pas une ligne de plus. Le test le
vérifie par identité (`is`), pas par comportement.

Corollaire assumé : **rien ne s'auto-installe**. L'enregistrement est un geste explicite
(`with recording(...)`), fait par la CLI qui pilote elle-même le pipeline. Un enregistreur qu'un
`.env` de production pourrait allumer serait un chemin d'écriture de données personnelles
activable par mégarde.

## ⚠️ Ce que le corpus contient — et pourquoi il n'est pas commité

Un prompt capturé contient **tout le contexte réel** envoyé au modèle :

- pour `bellum_facts` / `bellum_signals` / `bellum_strategy` : les pages du site de l'entreprise,
  ses communiqués, ses offres d'emploi, ses données Pappers/INSEE — des **données d'entreprises
  réelles**, publiques mais agrégées par nous ;
- pour `bellum_contacts` / `bellum_organigramme` : des **noms de personnes**, leurs fonctions, leur
  entreprise, et selon les fournisseurs actifs leur e-mail professionnel — des **données à
  caractère personnel** au sens du RGPD.

**Décision prise ici** : le magasin vit sous `evals-out/`, qui est **gitignoré**
(`.gitignore:172`), exactement comme les mesures de campagne. Ce sont des mesures, pas du code.

**Ce qui n'est PAS décidé, et qui te revient** : faut-il committer un sous-ensemble pour que la
comparaison soit rejouable par quelqu'un d'autre ? Trois options, dans l'ordre où je les
recommanderais :

1. **Ne rien committer** (état actuel). Rejouer suppose de re-capturer, donc de re-payer une
   quinzaine d'euros. Zéro donnée personnelle au dépôt.
2. **Committer un MANIFESTE sans contenu** — `record_id`, `prompt_name`, `case`, tailles, condensés.
   Deux comparaisons deviennent vérifiablement faites sur les mêmes entrées, sans qu'un octet de
   donnée personnelle entre au dépôt. C'est le meilleur rapport garantie/risque, et c'est trivial à
   ajouter (`describe_corpus()` rend déjà exactement ça).
3. **Committer le corpus entier.** Rejouable par tous, volumineux (plusieurs Mo par compte), et
   **cela versionnerait des noms de personnes dans un dépôt Git à vie** — un `git filter-repo` est
   la seule façon d'en retirer un ensuite. Je ne l'ai pas fait et je ne le ferai pas sans ton
   arbitrage explicite.

## Les quatre colonnes, et ce qu'elles refusent de dire

| Colonne                  | Ce qu'elle mesure                                                                                  | Ce qu'elle ne dit pas                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Qualité**              | Un barème /100 **par prompt** (`app/eval/bench/rubrics/`), déterministe, DÉCOMPOSÉ en axes nommés. | La véracité. Chaque axe dit lui-même ce qu'il ne sait PAS voir — colonne « aveugle à » du tableau ci-dessous. |
| **Coût**                 | Le coût **mesuré** de l'appel, via la `TokenUsage` du fournisseur.                                 | Le prix d'un modèle absent de la table (voir « palier de repli » ci-dessous).                                 |
| **Latence**              | Moyenne **et p95** — la queue, pas seulement le centre.                                            | Rien sur la charge : ce sont des appels séquentiels, pas un pic de production.                                |
| **Conformité de schéma** | Combien d'appels rendent une sortie qui **valide** son `response_model`.                           | Si la sortie est JUSTE — seulement si elle est bien FORMÉE.                                                   |

Il n'y a **pas de score global**, et il n'y en aura pas. Un modèle cinq fois moins cher qui rate un
organigramme sur trois n'est pas « moins bon de 12 % », il est **inutilisable sur ce poste-là**. Le
payload JSON ne contient donc ni `score`, ni `winner`, ni `overall` — un test le vérifie.

**Un `truncated` n'est pas un `schema_error`.** Une génération qui heurte son plafond est un défaut
de **réglage**, pas de modèle ; les fondre ferait accuser un modèle d'une configuration. Les deux
compteurs sont séparés (`✗` / `⧗` dans le tableau).

**« Non mesuré » n'est jamais « 0 ».** Un prompt sans grille compte dans `quality_unmeasured` et
**sort du dénominateur**. Sinon la colonne qualité mesurerait la complétude de nos grilles.

**Un tarif inconnu s'annonce.** Les tables de prix cherchent leur clé en sous-chaîne et retombent
sur un palier moyen quand rien ne colle — un modèle qui vient de sortir tombe systématiquement dans
ce cas. `cost` imprime alors `⚠ palier de repli` et dit explicitement que le chiffre est le prix
d'un **autre** modèle. C'est le cas de `gpt-5.6-luna` aujourd'hui.

## La colonne « qualité » : un barème PAR PROMPT, fait de critères qui existaient déjà

Jusqu'au 28/08/2026 cette colonne ne savait noter qu'un seul prompt, `bellum_strategy`, et rendait
honnêtement « non mesuré » pour tous les autres. Sur `bellum_organigramme`, `bellum_contacts`,
`bellum_signals` et `bellum_facts` — l'essentiel du chemin payant — « le modèle X gagne » ne pouvait
donc vouloir dire que **« il rend un JSON valide, moins cher, plus vite »**. Jamais « il rend un
meilleur organigramme ».

**Aucun critère n'a été inventé pour combler ce trou.** Le dépôt portait déjà ses critères de
qualité — ils étaient simplement appliqués à un **dossier assemblé** (`app/eval/metrics.py` et ses
huit métriques), pas à la **sortie d'un prompt**. Chaque axe de `app/eval/bench/rubrics/` rebranche
une primitive déjà expédiée, et cite son `fichier:ligne` d'origine dans son champ `origin` ; un test
refuse un axe dont l'`origin` est vide, et vérifie que le fichier cité existe à la ligne citée.

Quand un critère n'avait **pas** de primitive, il n'est pas noté et l'axe le dit — voir « Ce qu'on a
refusé de noter » plus bas.

### Les quatre lois que ces barèmes tiennent

1. **Un score n'est jamais nu.** Un barème rend ses AXES ; `compare` les affiche
   (`quality_axes`), et `quality_by_prompt` dit sur quel POSTE un modèle est meilleur. La moyenne
   globale `quality_mean` mélange des barèmes différents : elle répond à « globalement ? », pas à
   « sur l'organigramme ? ».
2. **« Non mesuré » n'est jamais « 0 », et sort du DÉNOMINATEUR.** Un axe sans matière porte
   `ratio=None` + une raison écrite ; la moyenne pondérée l'ignore des deux côtés de la fraction.
   Sans cette règle, le barème mesurerait la complétude de nos sorties au lieu du modèle. Un test le
   prouve : on retire le champ qui nourrit un axe, et **aucun autre axe ne bouge d'un millième**.
3. **Sous trois axes mesurés, il n'y a pas de score.** `total` vaut alors `None` avec sa raison ;
   les axes mesurés restent lisibles, c'est l'agrégat qui manque.

4. **Une violation de doctrine est ÉLIMINATOIRE, une incomplétude est une part.** C'est la loi qui
   a failli manquer. Un axe noté en part dilue la faute dans le volume : un contact fabriqué parmi
   sept mentions vaut 0,857, soit **trois points sur cent** — le banc aurait dit qu'un modèle qui
   INVENTE UN CONTACT est « presque aussi bon » qu'un modèle honnête. Quatre axes sont donc des
   portes (0 ou 1) : `personnes_reelles`, `noms_conserves`, `sans_donnee_inventee`,
   `siren_plausible`. Ce n'est pas une invention : c'est la porte dure des métriques expédiées —
   `no_invented_data` gradue son `score` mais son `passed` vaut `not violations`
   (`app/eval/metrics.py:548`), et `judge._check_coherence` classe un contact absent du dossier
   `critical`, c'est-à-dire binaire.

   La frontière est tenue par un test, **dans les deux sens** : ce qui FABRIQUE est éliminatoire, ce
   qui MANQUE reste une part. Un signal non daté, une relation que l'assembleur jette, un contact
   non traité n'inventent rien — et le KPI expédié le dit lui-même, `KPI_MAX_NON_SOURCED_RATIO`
   tolérant 5 % de faits non sourcés : un seuil sur un RATIO n'est pas une porte.

Et la cinquième, héritée : **le juge ne décide de rien.** Sa note n'entre dans aucun axe, aucun
total, aucun `deterministic_dict()`. Un test nourrit deux jeux de notes opposés et vérifie que tous
les axes sont identiques au bit près.

### Le piège que ces barèmes évitent

Un barème qui note tout à 100 % passe tous les tests et ne sert à rien. `tests/test_bench_rubrics.py`
donne donc à **chaque** barème une sortie plausible mais **fautive**, et exige que l'axe concerné
tombe. Sans cela, on n'aurait pas mesuré : on aurait décoré.

| Barème                | La sortie fautive                                   | Note         | L'axe qui tombe                    |
| --------------------- | --------------------------------------------------- | ------------ | ---------------------------------- |
| `bellum_facts`        | un SIREN de filiale qui échoue à Luhn (`123456789`) | 100 → **83** | `siren_plausible` 1 → **0**        |
| `bellum_facts`        | « acme corp » + « john doe », schéma quasi vide     | 100 → **9**  | `sans_donnee_inventee` 1 → **0**   |
| `bellum_signals`      | 2 signaux sur 4 sans source (« Non source », vide)  | 100 → **90** | `signaux_sources` 1 → **0,5**      |
| `bellum_signals`      | un signal « Non datee » + une hypothèse à 1 signal  | 100 → **73** | `signaux_dates` 1 → **0,5**        |
| `bellum_contacts`     | un lot sans le moindre décideur                     | 95 → **76**  | `decideurs_identifies` 1 → **0,4** |
| `bellum_contacts`     | un nom inventé + un contact fourni jamais rendu     | 95 → **61**  | `noms_conserves` 1 → **0**         |
| `bellum_organigramme` | une personne qui n'a jamais été fournie             | 100 → **79** | `personnes_reelles` 1 → **0**      |
| `bellum_organigramme` | relation sans preuve + type que l'assembleur ignore | 100 → **71** | `relations_retenues` 1 → **0,33**  |
| `bellum_organigramme` | une zone blanche qui est une phrase, pas une lacune | 100 → **71** | `zones_relancables` 1 → **0**      |
| `bellum_strategy`     | 1 angle au lieu de 3 (grille historique, inchangée) | 100 → **95** | `angles` 1 → **0,857**             |

⚠️ La dernière ligne est une **faiblesse pré-existante de la grille `bellum_strategy`**, pas du
branchement : ses bandes moyennent par play, donc n'en produire qu'un seul au lieu de trois ne coûte
que 5 points. Je ne l'ai pas corrigée — le lot demandait de ne pas casser le barème existant, et le
changer aurait rendu incomparables les mesures déjà faites avec.

### Les axes, un par un — et ce que chacun ne sait PAS voir

La dernière colonne est la plus utile : elle dit où **ne pas** faire confiance au chiffre.

### `bellum_facts`

> Aucun axe ne mesure la VÉRACITÉ d'un fait : la sortie de bellum_facts ne porte pas ses sources (le bloc grounding est ajouté plus tard dans le dossier). Ce barème mesure la FORME exploitable, pas la véracité.

| Axe                                       | Poids | Primitive d'origine                                                                                                                          | Ce que l'axe ne sait PAS voir                                                                                                                                              |
| ----------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `faits_durs`                              |     3 | app/services/confidence.py:57 (\_KEY_FACTS) + app/eval/metrics.py:123 (\_present)                                                            | qu'un fait présent soit VRAI ou sourcé — le grounding se mesure sur le dossier assemblé (metrics.faithfulness), pas sur la sortie d'un prompt qui n'a pas de bloc sources. |
| `sans_donnee_inventee` **(éliminatoire)** |     3 | app/eval/metrics.py:\_FABRICATED_MARKERS + fabrication_violations (extrait de no_invented_data, dont la porte est `passed = not violations`) | une invention PLAUSIBLE : « Directeur du Digital » chez une société qui n'en a pas ne contient aucun marqueur. Le détecteur ne voit que le vocabulaire de remplissage.     |
| `siren_plausible`                         |     2 | app/eval/metrics.py:siren_violations                                                                                                         | tout, ici : l'axe n'a pas de matière.                                                                                                                                      |
| `entites_situees`                         |     2 | app/prompts/bellum_facts.py:85-90 (champs contractuels d'une entité) + app/models/outputs/research.py:22-40 (EntityExhaustive)               | que l'entité EXISTE. Une filiale inventée mais bien renseignée marque 1/1.                                                                                                 |
| `minima_du_schema`                        |     2 | app/prompts/bellum_facts.py:81,97,107,110 (les MIN que le prompt ÉNONCE) — même construction que app/eval/strategy/rubric.py:62-67           | la QUALITÉ de ce qui remplit le quota : dix technos génériques valent dix technos justes.                                                                                  |

### `bellum_signals`

> « Sourcé » ici veut dire « porte une citation », jamais « la citation est vraie » : vérifier la seconde demanderait les documents collectés, que l'enregistrement du banc ne conserve que dans le prompt d'entrée, sans lien machine vers chaque signal.

| Axe                                       | Poids | Primitive d'origine                                                                                                                                                  | Ce que l'axe ne sait PAS voir                                                                                                                                                       |
| ----------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signaux_sources`                         |     3 | app/prompts/bellum_signals.py:52,57-60 (règles 1 et 6) + app/services/grounding_citations.py:200 (KPI_MAX_NON_SOURCED_RATIO)                                         | que la source CITÉE existe vraiment dans les documents fournis. On mesure la présence d'une citation, pas sa véracité — cela demanderait les documents, que la sortie ne porte pas. |
| `signaux_dates`                           |     3 | app/prompts/bellum_signals.py:55 (règle 4 : « Si date absente : Non datee ») + app/models/outputs/research.py:84 (RecentSignal.freshness, estampillée depuis `date`) | qu'une date soit EXACTE. « 2024 » sur un fait de 2019 se lit comme daté.                                                                                                            |
| `fraicheur_datee`                         |     2 | app/services/confidence.py:49,133 (\_FRESHNESS_BY_AGE / \_real_date_freshness)                                                                                       | la fraîcheur de ce qui n'est pas daté en ISO — et elle bouge avec l'horloge, donc deux comparaisons faites à six mois d'écart ne sont pas comparables sur cet axe.                  |
| `personnes_sourcees`                      |     2 | app/graph/judge.py:98-118 (\_check_grounding : un fait affiché sans source est le signal n°1 d'hallucination) + app/prompts/bellum_signals.py:53                     | qu'une personne citée EXISTE, et qu'elle soit encore en poste — c'est `quality_judge.mark_former_leaders` qui le fait, avec le registre en main.                                    |
| `hypotheses_convergentes`                 |     2 | app/models/outputs/research.py:98-110 (\_cap_confidence_by_convergence : 1 signal → a_verifier, 2 → probable, 3+ → confirmee)                                        | que les signaux invoqués soient les BONS : on compte combien il y en a, on ne vérifie pas qu'ils fondent l'hypothèse.                                                               |
| `sans_donnee_inventee` **(éliminatoire)** |     3 | app/eval/metrics.py:\_FABRICATED_MARKERS + fabrication_violations (porte `passed = not violations`)                                                                  | un concurrent plausible mais absent du compte — le prompt l'interdit (règle 3), rien dans la sortie ne permet de le contredire.                                                     |

### `bellum_contacts_batch_*`

> Rien ici ne note le summary ni le whyContact, que le prompt veut « SPECIFIQUES » : aucune primitive du dépôt ne sait mesurer la spécificité d'un paragraphe. C'est exactement le trou que la colonne CONSULTATIVE du juge occupe — sans jamais entrer dans ce total.

| Axe                                       | Poids | Primitive d'origine                                                                                                                                                                                    | Ce que l'axe ne sait PAS voir                                                                                                                                                                                        |
| ----------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decideurs_identifies`                    |     3 | app/eval/metrics.py:319 (contacts_quality) → app/services/decision_role.py:283 (classify_decision_role) / :57 (is_it_decider)                                                                          | qu'un décideur identifié soit ACCESSIBLE, ou encore en poste. Le classifieur lit un titre, il ne lit pas un annuaire.                                                                                                |
| `comite_couvert`                          |     2 | app/eval/metrics.py:394 (buying_committee) → app/knowledge/buying_committee.py:397 (assemble_buying_committee)                                                                                         | qu'un LOT ne soit qu'un lot : bellum_contacts tourne par paquets de 50, et un paquet peut légitimement ne porter aucun acheteur. L'axe se lit d'un bras à l'autre sur les MÊMES lots, jamais dans l'absolu.          |
| `role_lisible`                            |     2 | app/models/outputs/contacts.py:25-54 (compute_contact_bucket) — le seau que le front lit ; « a_verifier » = aucune classification exploitable                                                          | qu'un rôle lisible soit JUSTE. Un DSI classé « economic » est lisible et faux.                                                                                                                                       |
| `priorite_posee`                          |     1 | app/models/outputs/contacts.py:76 (priority=0 = sentinelle « non classé », NULL en base)                                                                                                               | l'ORDRE : on compte les priorités posées, on ne juge pas laquelle est la bonne.                                                                                                                                      |
| `noms_conserves` **(éliminatoire)**       |     3 | app/graph/judge.py:195-202 (\_check_coherence : « le plan cible un contact absent de la liste enrichie » = CRITICAL, donc binaire) + app/prompts/bellum_contacts.py:34-35 (« JAMAIS inventer un nom ») | une faute d'orthographe VOLONTAIRE du modèle sur un nom fourni : la comparaison retire les accents et la casse, donc « Sebastien » passe pour « Sébastien » — alors que le prompt exige le caractère pour caractère. |
| `contacts_tous_traites`                   |     2 | app/prompts/bellum_contacts.py:102 (« Enrichir CHAQUE contact fourni »)                                                                                                                                | la PROFONDEUR du traitement : un contact rendu avec un summary vide compte comme traité.                                                                                                                             |
| `sans_donnee_inventee` **(éliminatoire)** |     3 | app/eval/metrics.py:\_FABRICATED_MARKERS / \_RESERVED_EMAIL_DOMAINS + fabrication_violations (porte `passed = not violations`)                                                                         | un nom inventé mais crédible — c'est noms_conserves qui l'attrape, et seulement quand l'entrée est lisible.                                                                                                          |

### `bellum_organigramme`

> Le comité d'achat n'est PAS noté ici : la sortie de bellum_organigramme ne porte que des NOMS, sans titre, et `assemble_buying_committee` classe par TITRE. C'est le barème de bellum_contacts qui le mesure, sur la sortie qui porte les titres.

| Axe                                    | Poids | Primitive d'origine                                                                                                                                                                                                           | Ce que l'axe ne sait PAS voir                                                                                                                                                                      |
| -------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personnes_reelles` **(éliminatoire)** |     3 | app/services/org_graph_assembler.py:582-587 (\_resolve_node : un nom qui ne résout ni vers une personne ni vers une entité ne fait pas d'arête) + app/graph/judge.py:195-202 (\_check_coherence, sévérité CRITICAL = binaire) | un nom fourni placé au MAUVAIS endroit : rattacher un vrai DSI à la mauvaise filiale passe l'axe. Seule l'invention pure est vue.                                                                  |
| `relations_retenues`                   |     3 | app/services/org_resolver.py:57 (HIERARCHY_RELATIONS) + app/services/org_graph_assembler.py:596-618 (les 3 conditions de conservation)                                                                                        | que la relation soit VRAIE. Une preuve citée suffit à la conserver ; le resolver la range ensuite en influence plafonnée à 49 précisément parce qu'une affirmation de modèle n'est jamais un fait. |
| `influences_retenues`                  |     2 | app/services/org_resolver.py:184-211 (resolve_influence_edge : un raisonnement vide rend None) + app/services/org_graph_assembler.py:632-642 (topic exigé)                                                                    | la PERTINENCE du sujet d'influence. « influence sur les sujets IT » passe.                                                                                                                         |
| `zones_relancables`                    |     2 | app/models/outputs/contacts.py:141-152 (« sans ces trois axes, la case n'est pas relançable — c'est une phrase, pas une lacune ») + app/services/org_graph_assembler.py:69 (\_CONTRACT_LEVELS)                                | qu'une zone déclarée couverte le soit vraiment : on note les zones ÉMISES, jamais celles que le modèle a oubliées.                                                                                 |
| `chemin_actionnable`                   |     2 | app/models/outputs/contacts.py:209-221 (ApproachStep — annexe p26 : contact, canal, résultat attendu, ce que ça débloque, FALLBACK)                                                                                           | l'ORDRE des étapes, qui est pourtant tout le sujet d'un « chemin ».                                                                                                                                |
| `chaine_de_decision`                   |     2 | app/models/outputs/contacts.py:125-137 (DecisionChain / DecisionStep)                                                                                                                                                         | la VRAISEMBLANCE du cycle annoncé : « 3 semaines » chez un grand compte public remplit la case aussi bien que « 9 mois ».                                                                          |

### `bellum_strategy`

> Barème inchangé : les six bandes de app/eval/strategy/rubric.py, à la virgule près. Ce module ne fait que les exposer comme des axes.

| Axe               | Poids | Primitive d'origine                                             | Ce que l'axe ne sait PAS voir                                                                                                          |
| ----------------- | ----: | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `angles`          |    35 | app/eval/strategy/rubric.py (bande « angles », 35 pts)          | que l'angle soit PERTINENT pour CE compte : on compte les champs, l'ACTION et l'offre chiffrée, jamais la justesse du pari commercial. |
| `rdv_script`      |    25 | app/eval/strategy/rubric.py (bande « rdv_script », 25 pts)      | le naturel du script. Un opening sans formule interdite peut rester creux.                                                             |
| `pains`           |    15 | app/eval/strategy/rubric.py (bande « pains », 15 pts)           | que la douleur soit RÉELLE — seulement qu'elle soit qualifiée (sévérité, impact, offre).                                               |
| `power_questions` |    10 | app/eval/strategy/rubric.py (bande « power_questions », 10 pts) | qu'une question ouverte fasse effectivement parler l'interlocuteur.                                                                    |
| `objections`      |    10 | app/eval/strategy/rubric.py (bande « objections », 10 pts)      | que l'objection anticipée soit celle que le client posera.                                                                             |
| `selection`       |     5 | app/eval/strategy/rubric.py (bande « selection », 5 pts)        | la justesse de l'arbitrage : on vérifie qu'il est ÉCRIT, pas qu'il est bon.                                                            |

### Ce qu'on a REFUSÉ de noter, et pourquoi

- **La qualité rédactionnelle** (`summary`, `whyContact`, `personalizedHook`, le naturel d'un
  script). Aucune primitive du dépôt ne sait mesurer la spécificité d'un paragraphe, et en écrire
  une serait inventer un barème. C'est exactement le trou qu'occupe la colonne **consultative** du
  juge — qui n'entre dans aucun total.
- **Le comité d'achat sur `bellum_organigramme`.** `assemble_buying_committee` classe par TITRE, et
  la sortie de ce prompt ne porte que des NOMS. L'axe existe donc sur `bellum_contacts`, dont la
  sortie porte les titres, et nulle part ailleurs.
- **La véracité d'une source citée.** Vérifier qu'une citation existe dans les documents collectés
  demanderait un lien machine entre chaque signal et le document, que ni la sortie ni
  l'enregistrement ne portent.
- **Le typage des entités de `bellum_facts` contre l'ontologie du contrat.**
  `_ENTITY_TYPE_TO_CONTRACT` ne connaît ni `JV` ni `GIE`, que le prompt autorise pourtant
  explicitement : l'axe aurait sanctionné un modèle qui SUIT la consigne. Un barème qui punit
  l'obéissance mesure notre incohérence, pas le modèle.
- **`bellum_facts` et le SIREN.** ⚠️ Contrairement à ce qu'on pourrait croire, **ce prompt ne
  produit aucun SIREN** : ni son schéma (`app/prompts/bellum_facts.py`) ni `ResearchFacts` ne le
  demandent — il vient du registre (Pappers / INSEE). Le contrôle de Luhn reste branché sur les
  SIREN que le modèle **s'autorise** à ajouter sur une filiale ; sinon l'axe est _non mesurable_,
  et le dit. C'est l'exemple type : « rien à vérifier » n'est pas « vérifié à zéro ».

## L'appariement — et ce qui est exclu

Comme la campagne apparie compte par compte, le banc apparie **entrée par entrée** : seuls les
`record_id` présents dans **tous** les bras entrent dans les moyennes. Un bras qui a planté sur les
trois plus gros comptes ne doit pas gagner la colonne « coût » par forfait. Les entrées non
appariées sont **exclues et comptées**, jamais moyennées.

Le `record_id` est le condensé de **l'entrée seule** — le modèle n'y entre pas. La même entrée
rejouée sur cinq modèles porte cinq lignes et un seul `record_id`. Un octet de différence dans le
user prompt donne un autre identifiant : deux collectes différentes ne s'apparient jamais par
accident.

## Le juge

- **Choisissable à chaque fois** : `--judge <modèle>`, éventuellement chez un autre fournisseur
  (`--judge openai:gpt-4o`). Le défaut est nommé à **un seul endroit**,
  `judge.DEFAULT_JUDGE_MODEL`, surchargeable par `BENCH_JUDGE_MODEL`.
- **Enregistré au résultat**, au même titre que les candidats : deux comparaisons jugées
  différemment ne se comparent pas entre elles, et sans ce champ on ne peut même pas s'en
  apercevoir.
- **Un candidat ne peut pas être son propre juge** : le banc **refuse le run** (code de sortie 2),
  il n'avertit pas.
- **Il passe par la passerelle**, sous une tâche à lui (`bench_judge`) qui n'existe dans aucune
  table de production — router le juge ne peut donc pas dérouter un appel du produit.
- **Sa note ne décide de rien.** `rubric.py` porte la doctrine : _« An LLM judge can be layered on
  top […] but it must never be the thing that decides "quality >= baseline" — it is not
  reproducible. »_ Ici elle est **exécutable** : `Comparison.deterministic_dict()` ne contient
  aucun champ de juge, et un test nourrit deux jeux de notes opposés en vérifiant que le
  déterministe est identique.
- **Notation indépendante, pas comparative** : chaque sortie est notée seule, ce qui évite un biais
  de position que le banc ne saurait pas mesurer.

## L'axe « modèle » dans la campagne A/B existante

`app/eval/strategy/campaign.py` sait déjà comparer deux bras sur les 15 comptes du golden set,
compte par compte, avec reprise après interruption. Il lui manquait seulement de savoir qu'un
**modèle** est un levier comme un autre. C'est fait dans `variants.py`, et c'est **une fabrique, pas
une bascule** — le registre livré (`baseline`, `cap-8k`, `concise`…) ne porte **aucune** surcharge
de modèle, et un test le vérifie.

```python
from app.eval.strategy.variants import ModelSpec, model_variant

# Change le FOURNISSEUR et le modèle d'une tâche de la passerelle
model_variant(ModelSpec.parse("openai:gpt-5.6-luna"), tasks=("strategy",))
# → {"LLM_ROUTE_STRATEGY": "openai:gpt-5.6-luna"}

# Change le modèle qu'un prompt demande, chez le même fournisseur
model_variant(ModelSpec.parse("claude-haiku-4-5"), prompts=("bellum_strategy",))
# → {"MODEL_BELLUM_STRATEGY": "claude-haiku-4-5"}
```

Un préfixe présent **doit** être un fournisseur connu de la passerelle : sans cette règle,
`"opnai:gpt-4o"` deviendrait silencieusement un modèle Anthropic nommé `opnai:gpt-4o`, et le banc
comparerait autre chose que ce qu'on lui a demandé.

## Banc de rejeu ou campagne complète ?

Deux instruments, deux questions. Ne pas les confondre.

|          | **Banc de rejeu** (`app.eval.bench`)                      | **Campagne A/B** (`app.eval.strategy`)            |
| -------- | --------------------------------------------------------- | ------------------------------------------------- |
| Question | « Ce modèle traite-t-il **le même prompt** aussi bien ? » | « Ce réglage change-t-il le **dossier livré** ? » |
| Entrées  | Identiques par construction                               | Recollectées à chaque run                         |
| Coût     | Les seuls appels LLM                                      | Le pipeline entier (Brave, Firecrawl, Apollo…)    |
| Durée    | Quelques minutes                                          | ~6 min par compte                                 |
| Isole    | Le **modèle**                                             | Le **produit**                                    |

Le rejeu est ce qu'il faut pour **choisir un modèle**. La campagne est ce qu'il faut pour
**valider un changement avant de le livrer**.

## Ce que le banc REFUSE de mesurer

Un banc qui prétend tout mesurer ment. Celui-ci ne mesure pas :

- **La justesse factuelle.** La conformité de schéma dit qu'une sortie est bien formée, pas qu'elle
  est vraie. Un modèle qui invente une filiale plausible passe toutes les colonnes.
- **Les appels qui ne passent PAS par la passerelle.** `call_claude_sync` (le Profiler →
  `ProfileContext`) et `call_claude_with_citations` appellent Anthropic en direct, sans passer par
  `llm_gateway.complete`. Le corpus ne les contient donc pas et le banc ne mesure pas leur
  conformité de schéma — **sur les six `response_model` stricts du produit, cinq sont couverts,
  `ProfileContext` ne l'est pas**. Un test vérifie cette frontière dans les deux sens : il rougit
  si un de ces deux chemins bascule un jour sur la passerelle (le banc pourrait alors l'enregistrer,
  et cette ligne serait à corriger).
- **La qualité d'un prompt sans barème** (`bellum_plan`, `bellum_messages`, le copilote…). C'est
  nommé (`quality_unmeasured`), jamais rempli par un zéro. Idem pour un AXE qui n'a pas de matière
  sur une sortie donnée : il sort du dénominateur avec sa raison écrite.
- **La véracité de ce que les barèmes notent.** « Sourcé » veut dire « porte une citation », jamais
  « la citation est vraie » ; « personne réelle » veut dire « présente dans la liste fournie »,
  jamais « existe et est en poste ». La colonne « aveugle à » de chaque axe le dit, axe par axe.
- **La latence sous charge.** Les appels sont séquentiels. Un modèle qui s'effondre à 50 requêtes
  parallèles ressort identique ici.
- **Le prix réel d'un modèle absent des tables de tarifs** (voir « palier de repli »).
- **La reproductibilité d'un même modèle avec lui-même.** Le banc rejoue une fois par bras :
  l'écart mesuré inclut la variance du modèle, qu'il ne sépare pas. Pour la mesurer, rejouer le
  même modèle sous deux noms de bras (`--arm a1`, `--arm a2`) et lire l'écart comme un plancher de
  bruit.
- **Le biais du juge.** La note du juge est consultative, et le banc ne mesure pas si le juge
  préfère systématiquement un style. C'est précisément pourquoi elle ne décide de rien.

## Ce qui reste à faire — et qui coûte de l'argent

Rien n'a encore tourné : **le corpus est vide**, exactement comme le golden set de la campagne, dont
les 15 comptes sont tous en `_capture_status: "not_captured"`. Les étapes payantes sont à décider
explicitement :

1. `record --company … --yes-run-live` → remplit le corpus (~$0.70–1.10 par compte).
2. `cost --model …` → le chiffre projeté, gratuit, avant de dépenser.
3. `replay --model … --yes-run-live` → une fois par modèle candidat.
4. `compare --arm … --arm … --judge …` → les quatre colonnes.
5. **Seulement si les colonnes le justifient** : promouvoir le modèle gagnant dans
   `app/services/model_policy.py`. Le banc **mesure**, il ne bascule rien.
