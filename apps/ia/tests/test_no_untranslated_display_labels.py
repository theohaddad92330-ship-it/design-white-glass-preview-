"""Garde — un NOUVEAU libellé d'affichage français, hors du mécanisme de
traduction, ne doit plus pouvoir se glisser dans un facteur RENDU à l'écran.

Deux mécanismes distincts protégés ici, parce que ce lot en a introduit un et
réutilisé l'autre :

1. **`discover_scoring.py`** — chaque facteur/axe passe par `_factor()` ou
   `_axis()`. Le correctif leur a ajouté un kwarg `label_key` optionnel ;
   cette garde exige qu'il soit TOUJOURS posé. Un contributeur qui ajoute un
   neuvième bloc de score sans `label_key=` fait tomber ce test — c'est le
   point d'accroche qui l'oblige à passer par cet écran-ci plutôt que d'écrire
   une neuvième chaîne française muette.

2. **`access_scoring.py`** — n'utilise PAS `_factor`/`_axis` : ses deux
   libellés rendus (`_class_of` et la correction d'échéance) sont traduits
   côté web par un CODE déjà existant (`access_class`, `correction.key`), pas
   par `label_key`. La garde y vérifie que l'ensemble des libellés produits
   reste EXACTEMENT celui que les catalogues `discover.json` / `access.json`
   savent traduire — l'ajout d'une classe ou d'une correction sans mettre à
   jour cet ensemble (et les deux catalogues) fait tomber ce test.

Les TROIS preuves qu'une garde doit apporter (CLAUDE.md, « une garde protège
une règle, elle ne l'invente pas ») :

- **elle sait dire NON** — `test_the_scanner_flags_a_call_without_label_key`
  et `test_the_scanner_flags_an_unknown_access_scoring_label` le prouvent sur
  un extrait SYNTHÉTIQUE, sans casser le fichier réel ; le rapport du lot
  documente en plus la casse VOLONTAIRE du fichier réel et sa sortie rouge ;
- **elle LIT quelque chose** — `test_the_corpus_scanned_is_not_empty` prouve
  que le détecteur trouve RÉELLEMENT des appels `_factor`/`_axis` dans le
  fichier (pas un fichier vide, pas un motif qui ne matche jamais) ;
- **elle n'attrape pas ce qu'elle ne vise pas** —
  `test_an_internal_prompt_label_is_never_flagged` est le témoin : les
  libellés de `STAGE_PLAYBOOK` (`esn_stage.py`), français et JAMAIS rendus à
  un écran (ils descendent dans un prompt Claude), ne doivent PAS être
  signalés — le détecteur ne reconnaît que la FORME `_factor(...)`/`_axis(...)`,
  absente de ce fichier.

⚠️ Pas de `RegExp`/`re` avec le drapeau global réutilisé d'un appel à l'autre
ici — le détecteur est un walk `ast`, stateless par construction.
"""

from __future__ import annotations

import ast
from pathlib import Path

from app.services.access_scoring import CLASS_BOUNDS, correcting_signals
from datetime import date, timedelta

IA_ROOT = Path(__file__).resolve().parents[1]
DISCOVER_SCORING_PATH = IA_ROOT / "app" / "services" / "discover_scoring.py"
ESN_STAGE_PATH = IA_ROOT / "app" / "services" / "esn_stage.py"

TRACKED_CALLS = {"_factor", "_axis"}


def _calls_missing_label_key(source: str) -> list[tuple[str, int]]:
    """Chaque appel `_factor(...)`/`_axis(...)` sans kwarg `label_key=`.

    Rend `(nom_de_la_fonction, ligne)` pour chaque violation trouvée. Une
    fonction non-cible (un appel `_other_helper(...)`, un `dict(...)`) n'est
    jamais inspectée : la garde ne vise QUE la forme qui produit un facteur
    rendu à l'écran.
    """
    tree = ast.parse(source)
    violations: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue
        if node.func.id not in TRACKED_CALLS:
            continue
        if not any(keyword.arg == "label_key" for keyword in node.keywords):
            violations.append((node.func.id, node.lineno))
    return violations


# ── Preuve n°1 (partielle) : le détecteur sait dire NON ─────────────────────


def test_the_scanner_flags_a_call_without_label_key() -> None:
    snippet = 'x = _factor("Un neuvième bloc", 3, "preuve")\n'
    assert _calls_missing_label_key(snippet) == [("_factor", 1)]


def test_the_scanner_accepts_a_call_that_does_declare_its_key() -> None:
    snippet = 'x = _factor("NAF exact", 10, "preuve", label_key="factors.nafExact")\n'
    assert _calls_missing_label_key(snippet) == []


def test_the_scanner_flags_axis_calls_the_same_way() -> None:
    snippet = 'x = _axis("lock", "Nouvelle phrase", 5, "preuve")\n'
    assert _calls_missing_label_key(snippet) == [("_axis", 1)]


# ── La garde elle-même, sur le fichier RÉEL ─────────────────────────────────


def test_every_factor_and_axis_call_in_discover_scoring_names_a_label_key() -> None:
    """Le correctif de ce lot : les ~20 appels `_factor`/`_axis` de
    `discover_scoring.py` déclarent tous `label_key=`. Un futur appel qui
    l'omet — un nouveau bloc, un nouvel axe — fait tomber ce test, précisément
    au moment où il devrait : à la revue du lot qui l'ajoute, pas trois mois
    plus tard en repérant un « Relation » non traduit en recette anglaise.
    """
    source = DISCOVER_SCORING_PATH.read_text(encoding="utf-8")
    violations = _calls_missing_label_key(source)
    assert violations == [], "Appel(s) sans label_key= dans discover_scoring.py : " + ", ".join(
        f"{name}() ligne {line}" for name, line in violations
    )


# ── Preuve n°2 : elle LIT quelque chose ─────────────────────────────────────


def test_the_corpus_scanned_is_not_empty() -> None:
    """Une garde qui ne trouverait aucun appel `_factor`/`_axis` passerait au
    vert sans avoir rien vérifié — exactement le défaut des « six gardes
    borgnes » du 09/09. On exige un corpus réellement substantiel."""
    source = DISCOVER_SCORING_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in TRACKED_CALLS
    ]
    assert len(calls) >= 15, f"corpus trop petit ({len(calls)} appels) pour prouver quoi que ce soit"


# ── Preuve n°3 : elle n'attrape pas ce qu'elle ne vise pas ─────────────────


def test_an_internal_prompt_label_is_never_flagged() -> None:
    """Témoin — `esn_stage.STAGE_PLAYBOOK` porte des libellés français
    (« ESN établie », « petite ESN »…) qui descendent dans un prompt Claude et
    ne sont JAMAIS renvoyés au web (`agents.md`, `sales_context`/`esn_profiler`
    les consomment côté serveur). Le détecteur, pointé sur ce fichier, ne doit
    RIEN signaler : il ne reconnaît que la forme d'appel `_factor()`/`_axis()`,
    absente ici — un dict littéral `{"label": "ESN établie", ...}` n'est pas un
    appel de fonction.
    """
    source = ESN_STAGE_PATH.read_text(encoding="utf-8")
    assert "ESN établie" in source, "le témoin a changé de forme — réécrire ce test sur le nouveau texte"
    assert _calls_missing_label_key(source) == []


# ── Le second mécanisme : access_scoring.py, traduit par CODE ──────────────

#: Les QUATRE libellés de `_class_of` (tome 3 §5) — traduits côté web par
#: `access_class` (`card.barrierClass.*` dans discover.json,
#: `barrier.class.*` dans access.json), jamais par `label_key`. Une classe
#: ajoutée ou renommée sans toucher CET ensemble — et les deux catalogues —
#: redeviendrait française pour toujours dès qu'elle atteint CandidateScore.
KNOWN_CLASS_LABELS = {"Ouvert probable", "Ouvert par une entité", "Semi-ouvert", "Verrouillage probable"}

#: L'unique correction datée aujourd'hui (§7) — traduite côté web par
#: `correction.key` (`echeance_proche`), jamais par `label_key`.
KNOWN_CORRECTION_LABELS = {"Le marché en place arrive à échéance"}


def test_the_scanner_flags_an_unknown_access_scoring_label() -> None:
    """Preuve n°1 (second mécanisme) — sait dire NON, sur un ensemble
    synthétique : une classe/valeur qui n'est pas dans le catalogue connu."""
    labels = {"Ouvert probable", "Une classe encore jamais vue"}
    unknown = labels - KNOWN_CLASS_LABELS
    assert unknown == {"Une classe encore jamais vue"}


def test_class_of_labels_are_exactly_the_known_translated_set() -> None:
    """La garde elle-même : les quatre libellés RÉELS de `CLASS_BOUNDS`."""
    labels = {label for _bound, _klass, label in CLASS_BOUNDS}
    assert labels == KNOWN_CLASS_LABELS


def test_the_only_correction_label_today_is_the_known_translated_one() -> None:
    today = date(2026, 8, 22)
    result = correcting_signals(
        [{"type": "award", "endsOn": (today + timedelta(days=100)).isoformat()}], now=today
    )
    labels = {c["label"] for c in result}
    assert labels == KNOWN_CORRECTION_LABELS


def test_access_scoring_corpus_is_not_empty() -> None:
    """Preuve n°2 (second mécanisme) : les deux corpus vérifiés ci-dessus ne
    sont pas vides — quatre classes, une correction déclenchable."""
    assert len(CLASS_BOUNDS) == 4
    today = date(2026, 8, 22)
    triggered = correcting_signals(
        [{"type": "award", "endsOn": (today + timedelta(days=100)).isoformat()}], now=today
    )
    assert len(triggered) == 1


def test_proxy_evidence_text_is_out_of_this_guards_scope() -> None:
    """Preuve n°3 (second mécanisme) — témoin : le texte libre `evidence` d'un
    proxy (ex. « société cotée — gouvernance formalisée… ») n'est PAS un
    `label` de `_class_of` ni de correction — cette garde ne le vise pas, et
    ne doit donc jamais le comparer à `KNOWN_CLASS_LABELS`."""
    from app.services.access_scoring import access_barrier

    out = access_barrier(statut="scaleup", headcount=100, listed=True, now=date(2026, 8, 22))
    cotation = next(p for p in out["proxies"] if p["key"] == "cotation")
    assert "gouvernance" in cotation["evidence"]
    assert cotation["evidence"] not in KNOWN_CLASS_LABELS | KNOWN_CORRECTION_LABELS
