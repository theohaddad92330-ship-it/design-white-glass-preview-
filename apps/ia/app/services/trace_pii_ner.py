"""#4113 — noms de personnes dans les traces Langfuse, via Presidio (MIT).

COMPLÉMENT du masquage regex de ``langfuse_client._redact`` (e-mails,
téléphones, secrets), jamais un remplacement :

* derrière ``TRACE_PII_NER_ENABLED`` — absent/faux : ``mask_person_names``
  rend le texte tel quel, SANS importer Presidio (chemin byte-identique) ;
* **traces seulement** : seul ``langfuse_client._redact`` l'appelle. L'écran
  et les réponses d'API gardent noms, e-mails et téléphones en clair ;
* échec de Presidio (paquet absent, modèle absent, exception) → on rend le
  texte inchangé, donc le masquage regex déjà appliqué reste le plancher.
  Jamais d'exception remontée, jamais de texte brut posé à la place du masque.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_ENV_FLAG = "TRACE_PII_NER_ENABLED"
_PERSON_MASK = "[nom masqué]"
_LANGUAGE = "fr"
_SPACY_MODEL = "fr_core_news_md"

_analyzer: Any | None = None
_analyzer_failed = False


def _enabled() -> bool:
    return os.environ.get(_ENV_FLAG, "").strip().lower() in {"1", "true", "yes", "on"}


def _reset_for_tests() -> None:
    global _analyzer, _analyzer_failed
    _analyzer = None
    _analyzer_failed = False


def _build_analyzer() -> Any:
    # Import PARESSEUX : Presidio n'est chargé que si le flag est posé.
    from presidio_analyzer import AnalyzerEngine  # noqa: PLC0415
    from presidio_analyzer.nlp_engine import NlpEngineProvider  # noqa: PLC0415

    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": _LANGUAGE, "model_name": _SPACY_MODEL}],
        }
    )
    return AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=[_LANGUAGE])


def _get_analyzer() -> Any | None:
    """Construit l'analyseur une fois ; un échec est mémorisé (pas de retry par texte)."""
    global _analyzer, _analyzer_failed
    if _analyzer is not None:
        return _analyzer
    if _analyzer_failed:
        return None
    try:
        _analyzer = _build_analyzer()
    except Exception as exc:  # noqa: BLE001 — repli regex, jamais d'exception
        _analyzer_failed = True
        logger.warning("trace_pii_ner_unavailable", extra={"error_type": type(exc).__name__})
        return None
    return _analyzer


def mask_person_names(text: str) -> str:
    """Masque les noms de personnes d'un texte de TRACE. Ne lève jamais."""
    if not _enabled() or not text:
        return text
    try:
        analyzer = _get_analyzer()
        if analyzer is None:
            return text
        spans = analyzer.analyze(text=text, language=_LANGUAGE, entities=["PERSON"])
        out = text
        for span in sorted(spans, key=lambda s: s.start, reverse=True):
            out = out[: span.start] + _PERSON_MASK + out[span.end :]
        return out
    except Exception as exc:  # noqa: BLE001 — repli regex, jamais d'exception
        logger.warning("trace_pii_ner_failed", extra={"error_type": type(exc).__name__})
        return text
