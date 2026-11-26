"""Extraction relevance-aware du contenu scrapé (#6).

`render_for_prompt` tronquait le markdown en tête (`[:cap]`) : sur une page
longue, on gardait l'intro/le menu/le boilerplate et on jetait le corps
actionnable (stack, projets IT, DSI, budgets, recrutements). On score plutôt
chaque paragraphe par densité de termes ESN/IT + signaux datés, on garde la tête
(le lede porte souvent le résumé) puis on remplit le budget avec les paragraphes
les plus pertinents, ré-émis dans l'ordre du document (lisibilité).
"""

from __future__ import annotations

import re
import unicodedata

# Vocabulaire de pertinence pour un commercial ESN : IT/digital + signaux business
# datables. Accent-insensible (le texte est normalisé avant le comptage).
_ESN_BODY_TERMS: tuple[str, ...] = (
    # IT / digital
    "cloud", "data", "devops", "cyber", "securite", "erp", "sap", "oracle",
    "salesforce", "infogerance", "migration", "transformation", "digital",
    "numerique", "systeme d'information", " si ", "dsi", "cto", "cio", "rssi",
    "appel d'offres", "plateforme", "infrastructure", "reseau", "applicatif",
    "developpement", "agile", "intelligence artificielle", " ia ", " ai ", "iot",
    "big data", "rgpd", "conformite", "modernisation", "refonte", "externalisation",
    "regie", "forfait", "esn", "prestataire", "editeur", "logiciel", "saas", "api",
    "kubernetes", "azure", "aws", "gcp", "microservices", "mainframe", "legacy",
    "datacenter", "cybersecurite", "mlops", "machine learning", "gouvernance",
    # signaux business datables
    "chiffre d'affaires", "resultat", "croissance", "acquisition", "fusion",
    "partenariat", "nomination", "recrutement", "investissement", "budget",
    "levee de fonds", "projet", "contrat", "strategie", "innovation",
)

_MONEY_RE = re.compile(r"\d[\d\s.,]*\s?(?:m€|md€|k€|€|millions?|milliards?|%)", re.IGNORECASE)
_YEAR_RE = re.compile(r"\b20\d{2}\b")


def _norm(text: str) -> str:
    stripped = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in stripped if unicodedata.category(c) != "Mn")
    return stripped.lower()


def _score_paragraph(paragraph: str) -> int:
    """Densité de pertinence : occurrences de termes ESN/IT + bonus signaux datés
    (montants, %, années). Un paragraphe purement boilerplate score 0."""
    norm = " " + _norm(paragraph) + " "
    score = sum(norm.count(term) for term in _ESN_BODY_TERMS)
    score += 2 * len(_MONEY_RE.findall(paragraph))
    score += len(_YEAR_RE.findall(paragraph))
    return score


def _split_paragraphs(text: str) -> list[str]:
    blocks = re.split(r"\n\s*\n", text)
    return [b.strip() for b in blocks if b.strip()]


def _shingles(text: str, k: int = 8, sample_chars: int = 4000) -> frozenset[str]:
    """k-shingles (word n-grams) of the normalized text, for near-dup detection.
    Bounded to the first ``sample_chars`` — mirror/print pages diverge mostly in
    boilerplate, so a prefix sample is enough and keeps it O(pages)."""
    tokens = _norm(text[:sample_chars]).split()
    if len(tokens) < k:
        return frozenset([" ".join(tokens)]) if tokens else frozenset()
    return frozenset(" ".join(tokens[i : i + k]) for i in range(len(tokens) - k + 1))


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


class ContentDeduper:
    """Flags scraped bodies that are near-duplicates of an already-seen one (#7).

    The scrape dedup is URL-only, so a press release mirrored across two URLs (or
    a print/AMP variant) passed through and filled the prompt budget twice. This
    fingerprints each body with k-shingles + Jaccard; a body ≥ ``threshold``
    similar to a prior one returns that prior's ref instead of being re-injected."""

    def __init__(self, threshold: float = 0.75) -> None:
        self.threshold = threshold
        self._seen: list[tuple[str, frozenset[str]]] = []

    def duplicate_of(self, text: str | None, ref: str) -> str | None:
        """Return the ref of a prior near-duplicate body, or ``None`` (and record
        this body) when it's new. Empty / tiny bodies are never flagged."""
        sh = _shingles(text or "")
        if not sh:
            return None
        for prev_ref, prev_sh in self._seen:
            if _jaccard(sh, prev_sh) >= self.threshold:
                return prev_ref
        self._seen.append((ref, sh))
        return None


def select_relevant_excerpt(markdown: str | None, budget: int) -> str:
    """Garde jusqu'à ``budget`` chars du markdown, en priorisant les paragraphes
    les plus pertinents pour un commercial ESN plutôt que les premiers.

    Toujours borné par ``budget``. Court-circuite (retourne tel quel) si le
    contenu tient déjà dans le budget — pas de réordonnancement inutile.
    """
    text = (markdown or "").strip()
    if budget <= 0:
        return ""
    if len(text) <= budget:
        return text
    paras = _split_paragraphs(text)
    if len(paras) <= 1:
        return text[:budget]

    # La tête (lede / résumé) est gardée d'office, jusqu'à ~30% du budget.
    head_budget = max(1, int(budget * 0.3))
    selected: set[int] = set()
    used = 0
    idx = 0
    while idx < len(paras) and used < head_budget:
        used += len(paras[idx]) + 2
        selected.add(idx)
        idx += 1

    # Le reste : par score décroissant (ordre du document en cas d'égalité), on
    # remplit le budget. `continue` (pas `break`) pour empaqueter des paragraphes
    # courts à fort score même après un gros qui ne rentre pas.
    remaining = sorted(
        ((i, paras[i]) for i in range(idx, len(paras))),
        key=lambda ip: (-_score_paragraph(ip[1]), ip[0]),
    )
    for orig_i, para in remaining:
        if used + len(para) + 2 > budget:
            continue
        selected.add(orig_i)
        used += len(para) + 2

    return "\n\n".join(paras[i] for i in sorted(selected))[:budget]
