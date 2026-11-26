"""LA LECTURE AUTOMATIQUE D'UN JUSTIFICATIF DE NOTE DE FRAIS (#1827.2).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE LOT CORRIGE
─────────────────────────────────────────────────────────────────────────────
#1827.1 a livré le dépôt d'abord : un justificatif déposé ouvre une ligne VIDE
à compléter. C'était honnête (« aucune donnée n'est devinée depuis le fichier »
— voir l'ancien commentaire de tête de `ExpenseDepositStart.tsx`, maintenant
périmé), mais ça laissait Louis retaper chaque montant à la main : sa demande
du 10/09 est exactement l'inverse — « gagner du temps sur le temps de saisie »,
sans perdre le contrôle.

Le chemin, dans l'ordre : justificatif → texte (calque PDF direct, sinon OCR
`services/ocr.py`) → appel STRUCTURANT (ce module) qui propose montant, date,
catégorie, TVA. Chaque champ arrive avec sa confiance et sa citation — jamais
une écriture, toujours une proposition à valider par l'écran.

─────────────────────────────────────────────────────────────────────────────
LA RÈGLE QUI COMMANDE TOUT : UN CHAMP PEU SÛR RESTE VIDE
─────────────────────────────────────────────────────────────────────────────
« Un montant lu à 90 % de confiance n'est PAS un montant, c'est une
proposition. » En dessous de `_MIN_CONFIDENCE`, ou sans citation retrouvable
dans le texte source, le champ est rendu à `null` — jamais affiché comme lu.
C'est la MÊME garde que `bellum_cv_parse._validate_fields`, tenue ici côté
serveur et non confiée au jugement du modèle.

─────────────────────────────────────────────────────────────────────────────
SANS `OCR_API_KEY` : NO-OP STRICT, ET ÇA SE DISTINGUE D'UNE PANNE
─────────────────────────────────────────────────────────────────────────────
`STATUS_NOT_CONFIGURED` ne sort QUE quand l'extraction directe du texte a
échoué ET que l'OCR serait nécessaire pour continuer — jamais avant d'avoir lu
l'INTERRUPTEUR (`ocr.is_configured()`). Un PDF avec un vrai calque de texte
n'a jamais besoin d'OCR : il passe directement à l'appel structurant, clé ou
pas. `STATUS_UNREADABLE` est le cas distinct où l'interrupteur est sur ON mais
que la lecture échoue quand même (scan illisible, fournisseur muet) — c'est
une panne, pas un réglage.

─────────────────────────────────────────────────────────────────────────────
LE PLAFOND (#1827.2 — « pose un plafond au-delà duquel le lot est refusé »)
─────────────────────────────────────────────────────────────────────────────
`_MAX_TEXT_CHARS` reprend le principe déjà posé par `ocr._MAX_BYTES` : un
justificatif tient sur une page, et un texte extrait de plusieurs milliers de
caractères n'en est plus un (un PDF de plusieurs pages déposé par erreur,
notamment). Au-delà, on REFUSE l'appel plutôt que de payer un prompt qui ne
rendrait rien d'exploitable — `STATUS_TOO_LARGE`, avant tout appel de modèle.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any

from app.prompts import expense_receipt_prompt as prompt
from app.services import image_minimization, ocr, vision_regions
from app.services.claude_service import call_claude
from app.services.document_text import DocumentTextError, extract_document_text, image_media_type
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)

#: Nommé explicitement — c'est aussi la clé enregistrée dans `PROMPT_MODELS`
#: (`model_policy.py`) et lue par `test_every_prompt_is_registered`.
PROMPT_NAME = "expense_receipt_extract"

STATUS_OK = "ok"
STATUS_NOT_CONFIGURED = "not_configured"
STATUS_UNREADABLE = "unreadable"
STATUS_NOT_A_RECEIPT = "not_a_receipt"
STATUS_TOO_LARGE = "too_large"

#: Sous ce seuil, un champ lu reste VIDE — voir le commentaire de tête. Le même
#: palier que documente `bellum_cv_parse` (« moins de 0.6 : un humain doit
#: relire ») ; ici, sous le seuil, on ne montre même pas la proposition, parce
#: qu'une note de frais engage un remboursement réel.
_MIN_CONFIDENCE = 0.6

#: Voir « LE PLAFOND » ci-dessus.
_MAX_TEXT_CHARS = 6_000

FIELD_KEYS: tuple[str, ...] = ("amount_cents", "spent_on", "category", "vat_rate_bps")


@dataclass(frozen=True)
class ExtractedField:
    """Une proposition — jamais une valeur affirmée. `confidence` et
    `source_excerpt` restent à `0.0` / `""` quand `value` est `None`, pour
    qu'un appelant n'ait jamais à distinguer « pas lu » de « lu mais écarté »."""

    value: Any = None
    confidence: float = 0.0
    source_excerpt: str = ""
    #: #2433.4 — rectangle normalisé (0..1) où le champ a été lu, pour une IMAGE
    #: seulement ; `None` sinon (jamais une zone devinée).
    source_region: dict[str, float] | None = None

    def to_camel(self) -> dict[str, Any]:
        return {
            "value": self.value,
            "confidence": self.confidence,
            "sourceExcerpt": self.source_excerpt,
            "sourceRegion": self.source_region,
        }


def _absent() -> ExtractedField:
    return ExtractedField()


@dataclass(frozen=True)
class ExpenseExtractionResult:
    status: str
    ocr_used: bool = False
    #: `None` = aucun appel de modèle n'a eu lieu, OU son tarif est inconnu —
    #: jamais un coût à zéro qui se lirait « gratuit ».
    cost_usd: float | None = None
    fields: dict[str, ExtractedField] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        fields = {**_empty_fields(), **self.fields}
        return {
            "status": self.status,
            "ocrUsed": self.ocr_used,
            "costUsd": self.cost_usd,
            "fields": {
                "amountCents": fields["amount_cents"].to_camel(),
                "spentOn": fields["spent_on"].to_camel(),
                "category": fields["category"].to_camel(),
                "vatRateBps": fields["vat_rate_bps"].to_camel(),
            },
        }


def _empty_fields() -> dict[str, ExtractedField]:
    return {key: _absent() for key in FIELD_KEYS}


def _result(
    status: str,
    *,
    ocr_used: bool = False,
    cost_usd: float | None = None,
    fields: dict[str, ExtractedField] | None = None,
) -> ExpenseExtractionResult:
    return ExpenseExtractionResult(status=status, ocr_used=ocr_used, cost_usd=cost_usd, fields=fields or _empty_fields())


async def extract(data: bytes, filename: str | None = None) -> ExpenseExtractionResult:
    """Lit un justificatif et propose montant, date, catégorie, TVA — ou dit
    pourquoi elle ne peut pas.

    Ne lève JAMAIS pour un motif métier (les cinq statuts couvrent tout) ;
    seule une panne du modèle structurant (réseau, 5xx) remonte une exception —
    à l'appelant (le routeur) de la traduire en 502, comme `/cv/parse`.
    """
    if not data:
        return _result(STATUS_UNREADABLE)
    # #2433.12 — une photo prise de côté est lue (et localisée) à l'endroit ;
    # #2433.9 — et elle part au fournisseur sans ses métadonnées (GPS, appareil).
    data, _ = image_minimization.minimized(data)

    ocr_used = False
    try:
        text = extract_document_text(data, filename).text
    except DocumentTextError:
        # L'INTERRUPTEUR se lit ICI, et seulement ici : un document qui a son
        # propre calque de texte n'a jamais besoin d'OCR, clé posée ou pas.
        if not ocr.is_configured():
            return _result(STATUS_NOT_CONFIGURED)
        scanned = await ocr.extract_text(data, filename)
        if not scanned or not scanned.strip():
            return _result(STATUS_UNREADABLE)
        text = scanned
        ocr_used = True

    if not text.strip():
        return _result(STATUS_UNREADABLE, ocr_used=ocr_used)

    if len(text) > _MAX_TEXT_CHARS:
        logger.warning(
            "Lecture de justificatif refusée : %d caractères, au-delà de la borne de %d",
            len(text),
            _MAX_TEXT_CHARS,
        )
        return _result(STATUS_TOO_LARGE, ocr_used=ocr_used)

    result, usage = await call_claude(
        prompt.build_system_prompt(),
        prompt.build_user_prompt(text),
        response_model=dict,
        max_tokens=600,
        prompt_name=PROMPT_NAME,
        model=model_for(PROMPT_NAME),
    )
    # Un tarif inconnu ne se lit jamais « gratuit » (même discipline que
    # `claude_service._log_usage`).
    cost_usd = usage.cost_usd if usage is not None and usage.cost_known else None

    payload = result if isinstance(result, dict) else {}
    if payload.get("is_receipt") is False:
        return _result(STATUS_NOT_A_RECEIPT, ocr_used=ocr_used, cost_usd=cost_usd)

    fields = _validate_fields(payload, text)

    media_type = image_media_type(data, filename)
    if media_type is not None:
        regions, region_cost = await vision_regions.locate(
            data, media_type, {key: f.source_excerpt for key, f in fields.items() if f.value is not None}
        )
        fields = {key: replace(f, source_region=regions.get(key)) for key, f in fields.items()}
        if region_cost is not None:
            cost_usd = (cost_usd or 0.0) + region_cost
    return _result(STATUS_OK, ocr_used=ocr_used, cost_usd=cost_usd, fields=fields)


def _normalise(value: str) -> str:
    """Casse et espaces ne distinguent pas deux citations du même passage —
    identique à `bellum_cv_parse._normalise`."""
    return " ".join(value.split()).casefold()


def _validated(raw: dict[str, Any], text: str, key: str, checker: Any) -> ExtractedField:
    entry = raw.get(key)
    if not isinstance(entry, dict):
        return _absent()

    value = entry.get("value")
    confidence = entry.get("confidence")
    excerpt = entry.get("source_excerpt")
    excerpt = excerpt.strip() if isinstance(excerpt, str) else ""

    if value is None or value == "":
        return _absent()
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or confidence < _MIN_CONFIDENCE:
        return _absent()
    if not excerpt or _normalise(excerpt) not in _normalise(text):
        # Citer de mémoire est ce qu'un modèle fait quand il ne trouve pas.
        return _absent()

    checked = checker(value)
    if checked is None:
        return _absent()
    return ExtractedField(value=checked, confidence=float(confidence), source_excerpt=excerpt)


def _check_amount_cents(value: Any) -> int | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    cents = round(value)
    if cents <= 0 or cents > 100_000_000:  # même borne que `saveExpenseReportSchema.amountCents`
        return None
    return int(cents)


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _check_spent_on(value: Any) -> str | None:
    if not isinstance(value, str) or not _DATE_RE.match(value):
        return None
    year, month, day = (int(part) for part in value.split("-"))
    try:
        date(year, month, day)
    except ValueError:
        return None
    return value


def _check_category(value: Any) -> str | None:
    return value if value in prompt.EXPENSE_CATEGORIES else None


def _check_vat_rate_bps(value: Any) -> int | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    bps = round(value)
    if bps < 0 or bps > 10_000:  # même borne que `saveExpenseReportSchema.vatRateBps`
        return None
    return int(bps)


_CHECKERS: dict[str, Any] = {
    "amount_cents": _check_amount_cents,
    "spent_on": _check_spent_on,
    "category": _check_category,
    "vat_rate_bps": _check_vat_rate_bps,
}


def _validate_fields(raw: dict[str, Any], text: str) -> dict[str, ExtractedField]:
    return {key: _validated(raw, text, key, _CHECKERS[key]) for key in FIELD_KEYS}
