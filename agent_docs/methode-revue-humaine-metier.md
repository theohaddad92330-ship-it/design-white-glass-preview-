# Méthode « humain métier » — #2443.4 (#2899)

La troisième des trois méthodes que #2443 demande pour juger un cas du corpus
chat (`tests/test_copilote_scenario_corpus.py::CORPUS`) : DÉTERMINISTE (les
assertions des sept suites `test_copilote_*_eval.py`) et LLM JUDGE (le banc
dossier, `app/eval/bench/judge.py` — jamais seul décideur) existaient déjà ;
HUMAIN MÉTIER ne l'était pas.

## Ce que c'est, et ce que ce n'est pas

Un **gabarit** (`app/eval/chat_human_review.py::HumanReview`) qu'un relecteur
métier remplit pour UN cas du corpus, et un **contrôleur**
(`validate_review`) qui refuse une soumission incohérente. Un document JSON
versionnable, relu au diff comme le corpus lui-même — jamais un écran, jamais
une base à administrer, jamais un stockage applicatif séparé.

## Qui relit — dérivé, jamais une seconde liste de rôles

#2443 nomme cinq personas relecteurs : « Sales, recruteur, manager, ADV,
dirigeant ». Ce sont, à l'orthographe près, les cinq familles que
`app/access/rights_matrix.Famille` porte déjà (#1920) :

| #2443       | `Famille`          |
| ----------- | ------------------ |
| Sales / ADV | `BUSINESS_MANAGER` |
| recruteur   | `RECRUTEUR`        |
| manager     | `DIRECTEUR_AGENCE` |
| dirigeant   | `DIRIGEANT`        |

`NOUVEL_ARRIVANT` n'est pas un rôle relecteur (#1920.6 : ce n'est pas un rôle
mais une ANCIENNETÉ) — il reste éligible en lecteur d'un cas qui le vise,
jamais recensé à part.

Le pool de relecteurs éligibles pour un cas donné, c'est **déjà**
`Meta.personas` (#1948.13, le champ que chaque cas du corpus porte depuis
#1948) — jamais une seconde table de rôles qui pourrait diverger (GA-26).

## Le gabarit

```python
@dataclass(frozen=True)
class HumanReview:
    case_identifiant: str
    reviewer_family: Famille
    verdict: HumanVerdict          # CONFORME / NON_CONFORME / NON_CONCERNE
    commentaire: str               # obligatoire, ≥ 10 caractères
    date_iso: str                  # AAAA-MM-JJ
```

Trois verdicts, jamais un score ni une probabilité (doctrine : aucune
PROBABILITÉ ne s'affiche, y compris dans une revue humaine) :

- **CONFORME** — le comportement attendu du cas est respecté.
- **NON_CONFORME** — un hard failure ou une déviation métier.
- **NON_CONCERNE** — ce persona n'est pas visé par ce cas (un relecteur qui
  n'a rien à en dire le déclare, plutôt que de forcer un verdict).

## Le contrôleur

`validate_review(review, case_identifiant=…, case_personas=…) -> tuple[str, ...]`
rend la liste des défauts d'une soumission (jamais une exception qui la
rejetterait en silence côté appelant) :

- le cas cité correspond au cas relu ;
- le persona du relecteur fait partie de `meta.personas` du cas — un
  relecteur hors périmètre soumet `NON_CONCERNE`, jamais un verdict sous un
  autre persona ;
- un commentaire est présent et dit quelque chose (≥ 10 caractères) ;
- la date est au format `AAAA-MM-JJ`.

## Ce qui reste hors de cette tranche

Le **gate CI dédié** qui bloquerait sur une revue `NON_CONFORME` reçue
(#2443.7) est un système séparé, documenté dans `agent_docs/eval-gate.md`
(section chat) — ce module fournit le gabarit qu'un tel gate pourra un jour
lire ; il ne le construit pas lui-même ici. Faire regagner une correction
humaine au corpus comme golden test (#2278.37), ou agréger les revues dans un
tableau de pilotage (#2443.11), sont deux autres systèmes séparés, non
construits par cette tranche.
