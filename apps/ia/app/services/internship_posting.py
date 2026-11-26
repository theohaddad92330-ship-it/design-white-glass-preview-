"""#4044 — LE prédicat « cette offre est un stage » (jumeau de ``isInternshipPosting``).

Décision tranchée (Louis 12/10) : « pas d'offres de stages dans tous les signaux ».
Une offre de STAGE ne devient jamais un signal. L'ALTERNANCE n'est PAS tranchée :
elle ne passe pas ici. Les deux langues lisent le MÊME jeu de cas,
``packages/contracts/src/fixtures/internship-postings.json``.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from typing import Any

# « stage(s) »/« stagiaire(s) »/« intern(s) »/« internship(s) » comme MOT : ni « backstage »,
# « staging », « stagnation » (lettre accolée), ni « multi-stage » (composé à tiret) ;
# « BAC5Stage » passe (chiffre accolé).
_INTERNSHIP_WORD = re.compile(
    r"(?<![a-z]-)(?<![a-z])(?:stages?|stagiaires?|interns?|internships?)(?![a-z])(?!-[a-z]*stage)"
)
# Le théâtre n'est pas un contrat : « stage manager/hand/director ».
_STAGE_THEATRE = re.compile(r"(?<![a-z])stage\s+(?:manager|hand|director|technician)s?(?![a-z])")


_TITLE_WORDS = ("stages?", "stagiaires?", "interns?", "internships?")


def title_patterns_not() -> list[str]:
    """#4723.2 — le prédicat ci-dessus, en motifs d'intitulé pour ``job_title_pattern_not`` de TheirStack (1 crédit
    par offre RENDUE : un stage écarté dans la requête n'est pas payé). TheirStack n'accepte que du re2 PUR (E-013 le
    29/10 : lookahead/lookbehind refusés ⇒ 0 offre) : une LISTE de motifs simples, un par mot (le serveur écarte
    l'offre dès qu'UN motif colle). Les bornes sont consommées au lieu d'être regardées. Le serveur lit l'intitulé
    BRUT, casse ignorée par ``(?i)`` ; les lettres accentuées comptent comme lettres. Le « stage manager » (théâtre)
    est écarté aussi côté serveur — perte assumée, rare ; ``is_internship_posting`` reste le filtre fin en sortie
    (``drop_internship_postings``). L'alternance n'y est pas."""
    letters = "a-zà-öø-ÿ"
    return [f"(?i)(?:^|[^{letters}-]){word}(?:$|[^{letters}])" for word in _TITLE_WORDS]


def _fold(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c)).lower()


def is_internship_posting(title: Any, contract_type: Any = None) -> bool:
    """Vrai si l'intitulé OU le type de contrat dit « stage ». Valeur absente → ``False``."""
    for value in (title, contract_type):
        if not isinstance(value, str) or not value.strip():
            continue
        folded = _fold(value)
        if _STAGE_THEATRE.search(folded):
            continue
        if _INTERNSHIP_WORD.search(folded):
            return True
    return False


def drop_internship_postings(
    rows: Iterable[Any], *, title_keys: tuple[str, ...], contract_keys: tuple[str, ...] = ()
) -> list[Any]:
    """Écarte les lignes d'offres qui sont des stages ; les non-dict passent tels quels."""
    kept: list[Any] = []
    for row in rows:
        if isinstance(row, dict):
            title = next((row.get(k) for k in title_keys if isinstance(row.get(k), str) and row.get(k)), None)
            contract = next((row.get(k) for k in contract_keys if isinstance(row.get(k), str) and row.get(k)), None)
            if is_internship_posting(title, contract):
                continue
        kept.append(row)
    return kept


_JOB_TYPES = frozenset({"recrutement", "hiring", "recruitment"})


def drop_internship_signal_rows(rows: Any) -> Any:
    """#4044 — lecture d'un blob ``recent_signals`` DÉJÀ stocké : écarte les lignes de recrutement
    qui sont des stages (une actualité qui dit « stage » reste). Non-liste → rendue telle quelle."""
    if not isinstance(rows, list):
        return rows
    kept: list[Any] = []
    for row in rows:
        if isinstance(row, dict):
            kind = str(row.get("type") or "").lower()
            is_job = kind in _JOB_TYPES or (row.get("source_kind") or row.get("sourceKind")) == "job"
            if is_job:
                title = next(
                    (
                        row[k]
                        for k in ("signal", "title", "label", "name")
                        if isinstance(row.get(k), str) and row[k].strip()
                    ),
                    None,
                )
                contract = next(
                    (
                        row[k]
                        for k in ("contractType", "contract_type")
                        if isinstance(row.get(k), str) and row[k].strip()
                    ),
                    None,
                )
                if is_internship_posting(title, contract):
                    continue
        kept.append(row)
    return kept
