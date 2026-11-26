# #274 — Réduire la sortie `bellum_strategy` (golden-set eval)

> **DoD de l'issue** : « −X % tokens output strategy mesuré, qualité ≥ baseline sur
> le golden-set, harnais d'éval reproductible commité. »
> Ce document décrit le harnais. **Aucun levier de réduction n'est actif** :
> tant qu'un A/B n'a pas prouvé qualité ≥ baseline, la production est inchangée.

## Pourquoi

`bellum_strategy` est le plus gros poste de **tokens output** d'un run. Le
breakdown `by_phase` (`phase_token_usage()`, livré par la PR #418) permet enfin
de l'isoler dans la télémétrie de chaque run — c'est l'instrument de mesure.
Manquaient : un golden-set assez large pour que la mesure veuille dire quelque
chose, une définition **chiffrée** de « qualité commerciale », et un protocole
A/B. C'est ce que ce harnais ajoute.

## Ce qui est livré

| Chemin                               | Rôle                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `app/eval/strategy/companies/*.json` | Le golden-set : **15 comptes réels** (6 grands comptes / 5 ETI / 4 scale-ups). |
| `app/eval/strategy/catalog.py`       | Chargeur du golden-set.                                                        |
| `app/eval/strategy/rubric.py`        | La **grille qualité /100** — déterministe, publiée, testée.                    |
| `app/eval/strategy/variants.py`      | Les leviers A/B **en configuration** (jamais en dur).                          |
| `app/eval/strategy/campaign.py`      | Capture reprenable + verdict A/B.                                              |
| `app/eval/strategy/run.py`           | La CLI.                                                                        |
| `app/prompts/strategy_levers.py`     | Les leviers eux-mêmes — **no-op par défaut**.                                  |
| `tests/test_strategy_eval.py`        | 45 tests, runs **mockés**, zéro réseau, zéro dépense.                          |

## Le golden-set — 15 comptes, zéro donnée inventée

Chaque fichier porte un bloc `registry` dont **tous** les champs factuels
(SIREN, dénomination, NAF, tranche d'effectif, commune) proviennent de l'API
publique [`recherche-entreprises.api.gouv.fr`](https://recherche-entreprises.api.gouv.fr)
(Annuaire des Entreprises, DINUM, adossé à INSEE Sirene), avec la date de
collecte. Rien n'est saisi de mémoire.

| Segment      | Comptes                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Grand compte | Société Générale (banque), TotalEnergies (énergie), Carrefour (retail), Orange (télécom), Sanofi (pharma), Thales (aéro/défense) |
| ETI          | Bureau Veritas (certification), Somfy (industrie), Bonduelle (agro), Lectra (logiciel industriel), Manutan (distribution B2B)    |
| Scale-up     | Doctolib (healthtech), PayFit (HR tech), Dataiku (data/IA), Back Market (marketplace)                                            |

Trois précautions valent d'être connues :

1. **Homonymes.** Une recherche plein-texte renvoie très souvent la mauvaise
   entité juridique (« Carrefour » → une SCI du Cannet ; « Alan » → un garage).
   Chaque SIREN retenu a été désambiguïsé à la main sur la tête de groupe. C'est
   exactement le piège que le produit lui-même doit éviter.
2. **`tranche_effectif` = effectif de l'UNITÉ LÉGALE**, pas du groupe consolidé.
   Une holding de tête affiche donc une tranche basse — ce n'est pas la taille du
   groupe, et le fichier le dit explicitement.
3. **`expect` n'affirme que ce que la source prouve.** `isPublic` et
   `hasSubsidiaries` sont volontairement **absents** : l'API ne les établit pas.

### Pas de sortie de référence — et c'est voulu

Tous les comptes sont `_capture_status: "not_captured"`, `fixture: null`. Écrire
à la main un dossier de référence reviendrait à fabriquer des données métier
(angles, pains, scripts) sur des entreprises réelles — interdit. La référence
sera **produite par le run de baseline**, jamais saisie.

## La grille qualité — barème /100

Déterministe : une campagne de 15 comptes × N variantes doit être reproductible
et re-scorable gratuitement. Les critères ne sont pas inventés ici — ils
reprennent la méthode canonique in-repo (`agent_docs/kb/methode-plan-de-compte-esn.md`,
distillation du Drive Théo) et le schéma que `bellum_strategy` est contractuellement
chargé de remplir.

| Bande             | Pts | Ce qu'elle mesure                                                                                                                                                          |
| ----------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `angles`          | 35  | « Un ANGLE = un PLAY » : formule PROMESSE + PREUVE + ACTION, **exactement 3** plays, 6 champs renseignés, offre périmétrée et chiffrée.                                    |
| `rdv_script`      | 25  | **Actionnabilité** : 5 sections, opening sans formule creuse (« je me permets »), ≥5 questions d'exploration, closing avec prochaine étape concrète, ponts + story frames. |
| `pains`           | 15  | ≥4 défis + ≥4 pains, chacun qualifié (sévérité/urgence, impact business, offre ESN en face).                                                                               |
| `power_questions` | 10  | ≥4 questions **ouvertes** + justification.                                                                                                                                 |
| `objections`      | 10  | ≥3 objections avec vrai enjeu, réponse VALIDER→REBONDIR→preuve, question miroir.                                                                                           |
| `selection`       | 5   | La logique de sélection : `axesEcartes` (angle + raison + commentReactiver) + `commentOuvrirCompte`.                                                                       |

Un juge LLM (`evals/judge.py`) peut se superposer pour la plausibilité
sémantique, mais **il ne décide jamais** du verdict : il n'est pas reproductible.

## Les leviers — configuration, pas patch

Tous **OFF par défaut** (`app/prompts/strategy_levers.py`). Avec les valeurs par
défaut, les prompts rendus sont **byte-identiques** à la production — ce que
verrouillent `tests/golden/user/strategy.txt` et l'empreinte du registre de prompts.

| Env                   | Défaut (= prod)  | Effet                                                                                             |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `STRATEGY_MAX_TOKENS` | `12000`          | Plafond de génération.                                                                            |
| `STRATEGY_CONCISION`  | _(vide)_ → `off` | `on` / `strict` : bloc de concision dans le system prompt.                                        |
| `STRATEGY_SCHEMA`     | `full`           | `tight` : les compteurs « MIN 4, viser 5 » deviennent « EXACTEMENT 4 », budgets de prose réduits. |

Variantes livrées : `baseline`, `cap-8k`, `cap-6k`, `concise`, `concise-strict`,
`tight-schema`, `tight-concise`, `tight-concise-cap8k`
(`python -m app.eval.strategy.run variants`).

### L'axe « modèle » — une fabrique, pas une entrée du registre

Changer de modèle est le même genre de levier : le routage de la passerelle
(`LLM_ROUTE_<TÂCHE>`) et la table des modèles (`MODEL_<PROMPT_NAME>`) se pilotent
tous les deux par l'environnement. `variants.model_variant(ModelSpec.parse("openai:gpt-5.6-luna"),
tasks=("strategy",))` fabrique le bras à la demande — **rien n'est ajouté au registre livré**, qui
ne porte aucune surcharge de modèle (un test le verrouille).

Pour **choisir un modèle**, préférer cependant le banc de rejeu
(**[`agent_docs/banc-modeles.md`](banc-modeles.md)**) : il rejoue le MÊME prompt sur N modèles, donc
il isole le modèle. Cette campagne-ci recollecte à chaque run, donc elle mesure le **produit** — ce
qu'il faut pour valider un changement avant de le livrer, pas pour départager deux modèles.

> **Note sur `tight-schema`** : il ne raccourcit le prompt que de ~1 %. Ce n'est
> pas le but — il agit en **abaissant les quantités demandées**, donc la sortie.
> Ne pas juger ce levier à la taille de son prompt.

> **Note sur `cap-6k`** : un plafond trop bas ne raccourcit pas la sortie, il la
> **tronque** (`ClaudeError`). Le verdict A/B compte les erreurs pour cette
> raison — sinon une troncature massive ressemblerait à une économie superbe.

## Lancer la campagne

Depuis `apps/ia`. Les sous-commandes de lecture sont hermétiques et gratuites ;
seules `baseline` / `capture` appellent le réseau, et elles **refusent de
démarrer sans `--yes-run-live`**.

```bash
# — gratuit, hermétique —
python -m app.eval.strategy.run companies      # le golden-set
python -m app.eval.strategy.run variants       # les leviers
python -m app.eval.strategy.run report         # ce qui est déjà capturé
python -m app.eval.strategy.run cost           # coût projeté

# — 1) BASELINE (payant : 15 runs réels) —
python -m app.eval.strategy.run baseline --yes-run-live

# — 2) VARIANTE (payant : 15 runs réels) —
python -m app.eval.strategy.run capture --variant tight-concise --yes-run-live

# — 3) VERDICT (gratuit) —
python -m app.eval.strategy.run ab --variant tight-concise
python -m app.eval.strategy.run ab --variant tight-concise --json
```

Options utiles : `--company <slug>` (un seul compte, pour un essai à ~1 €),
`--segment eti`, `--limit 3`, `--store <fichier.jsonl>`.

### Reprise après interruption

Les mesures s'écrivent en **JSONL, une ligne par run, flushée immédiatement**.
Relancer la même commande :

- saute les comptes déjà capturés `ok` (ils ne sont **jamais re-facturés**) ;
- rejoue uniquement ceux qui ont échoué ;
- survit à un `Ctrl-C` ou un crash : la dernière ligne tronquée est ignorée.

Un run coûte de l'argent — commencer par `--limit 1` pour valider la plomberie
avant de lancer les 15.

## Lire le verdict

```
═══ A/B  tight-concise  vs  baseline ═══
  comptes appariés    : 15
  tokens output strat : 7265 → 4960 (-31.72 %)
  qualité (/100)      : 100.00 → 100.00 (Δ +0.00)
  pire compte         : back-market (Δ +0.00)

  ✓ tokens réduits
  ✓ qualité ≥ baseline

  → VERDICT : PASS — mergeable
```

`passed` exige **les deux** conditions, et la qualité tient à trois garde-fous :

| Garde-fou            | Seuil                                                              |
| -------------------- | ------------------------------------------------------------------ |
| Moyenne de la grille | ne perd pas plus de **1 pt /100** (`RUBRIC_MEAN_TOLERANCE`)        |
| Pire compte          | ne perd pas plus de **5 pts /100** (`RUBRIC_PER_ACCOUNT_MAX_DROP`) |
| Erreurs              | la variante n'échoue **pas plus souvent** que la baseline          |

Le garde-fou « pire compte » existe parce qu'une moyenne plate peut cacher un
compte effondré (+6 ici, −6 là) — et ce compte est le prospect réel de quelqu'un.

Les comptes présents dans un seul bras sont **exclus**, jamais moyennés : comparer
une moyenne sur 15 à une moyenne sur 11 récompenserait le bras qui a échoué sur
les comptes les plus verbeux.

`ab` sort en code 1 si le verdict est FAIL → utilisable comme gate CI.

## Coût d'une campagne

Télémétrie mesurée (voir la note mémoire _run-cost-optimisation_, 4 runs live sur
Société Générale = mega/CAC40, **le pire cas**) :

- run complet **$1.08** (après optimisation ; $1.50 avant) ;
- phase research $0.375–0.65 selon le modèle strategy ;
- durée 346–584 s/run, bruitée d'un run à l'autre.

Les ETI et scale-ups du set sont sensiblement moins chers (moins d'entités, moins
de pages scrapées). Hypothèse de planification : **$0.70–1.10 par run**.

| Campagne               | Runs | Coût estimé  | Temps séquentiel |
| ---------------------- | ---- | ------------ | ---------------- |
| Baseline seule         | 15   | **$11 – 17** | ~1 h 30 – 2 h 30 |
| Baseline + 1 variante  | 30   | **$21 – 33** | ~3 h – 5 h       |
| Baseline + 3 variantes | 60   | **$42 – 66** | ~6 h – 10 h      |

Recommandation : capturer la baseline **une fois**, puis n'acheter qu'une ou deux
variantes — la baseline se réutilise pour tous les A/B suivants.

Une fois des runs capturés, `run cost` remplace cette estimation par le coût réel
observé (`_api_metrics`), et n'invente rien tant qu'il n'a rien mesuré.

## Avant de fermer l'issue

Le harnais est mergeable tel quel (production inchangée), mais la DoD demande une
**mesure**. Restent les étapes payantes, à décider explicitement :

1. `baseline --yes-run-live` → 15 runs, remplit les tokens et la grille de référence.
2. Une ou deux variantes → `capture --variant …`.
3. `ab --variant …` → le « −X % » chiffré de la DoD.
4. Seulement si PASS : promouvoir le levier gagnant en défaut (changer la valeur
   par défaut dans `strategy_levers.py`) et committer le rapport A/B.

Tant que l'étape 3 n'a pas rendu PASS, **ne rien activer** — c'est explicitement
demandé dans l'issue (« Ne pas merger sans éval reproductible »).
