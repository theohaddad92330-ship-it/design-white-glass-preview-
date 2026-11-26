"""#3753.3 — le ciblage de l'ESN (tier A/B/C, raison, problématiques, projets IT)
comme HYPOTHÈSES DU VENDEUR dans le contexte de la phase 1.

Ce que dit le bloc, et ce qu'il refuse de dire :
- il vient de l'ESN, il n'a PAS été vérifié : c'est une piste à confirmer ou
  infirmer par la collecte, jamais un fait à recopier dans le dossier ;
- le tier est la LETTRE de l'ESN, pas une probabilité de closing (doctrine c26) ;
- un champ absent ne fait aucune ligne (« on n'affiche pas ce qu'on n'a pas »).

Sans donnée, le retour est vide : le prompt appelant est byte-identique.
"""

from __future__ import annotations

from typing import Any

_MAX_FIELD_CHARS = 1500
# #4642 — la première ligne que `describeDiscoverOriginCriteriaFr` (contracts) pose pour une demande de Laura.
_LAURA_REQUEST_PREFIX = "demande :"
# #4642 — la ligne « offres relevées » porte jusqu'à dix intitulés datés : 200 caractères les tronquaient.
_MAX_CRITERIA_LINE = 1200

_TIERS = ("A", "B", "C")


def _text(value: Any) -> str:
    return value.strip()[:_MAX_FIELD_CHARS] if isinstance(value, str) else ""


def seller_hypotheses_block(data: dict[str, Any] | None) -> str:
    """Bloc de prompt, ou ``""`` quand le vendeur n'a rien dit de ce compte."""
    if not data:
        return ""
    tier = _text(data.get("tier_label")).upper()
    reason = _text(data.get("selection_reason"))
    issues = _text(data.get("addressable_issues"))
    projects = _text(data.get("upcoming_it_projects"))
    lines: list[str] = []
    if tier in _TIERS:
        lines.append(f"- Classement de l'ESN : Tier {tier}")
    if reason:
        lines.append(f"- Raison du classement : {reason}")
    if issues:
        lines.append(f"- Problématiques adressables (selon votre ciblage) : {issues}")
    if projects:
        lines.append(f"- Projets IT à venir (selon votre ciblage) : {projects}")
    # #3819 (lot RBB, décision Louis 11/10) — un compte ajouté depuis Découvrir
    # garde SUR QUOI il a été sélectionné (critères posés) et POURQUOI (raison
    # calculée) : le run les reçoit pour cadrer l'analyse, comme une piste.
    criteria = _criteria(data.get("discover_origin_criteria"))
    discover_reason = _text(data.get("discover_origin_reason"))
    if criteria:
        lines.append(f"- Sélectionné dans Découvrir sur : {' ; '.join(criteria)}")
    if discover_reason:
        lines.append(f"- Raison de la sélection (Découvrir) : {discover_reason}")
    if not lines:
        return ""
    discover_note = (
        "\nUne sélection Découvrir dit pourquoi le commercial regarde ce compte : prends-la comme "
        "cadrage (vérifie d'abord ces critères et ce signal, dis s'ils tiennent), jamais comme une conclusion."
        if criteria or discover_reason
        else ""
    )
    # #4642 — une demande issue d'une conversation avec Laura (« placer ce consultant ») : elle ORDONNE le dossier,
    # elle ne le restreint pas. Les offres, signaux et interlocuteurs liés à la demande passent en tête et sont
    # nommés comme tels ; tout le reste reste analysé et listé, après.
    laura_note = (
        "\nCette sélection vient d'une demande posée à Laura : place EN TÊTE du dossier, et nomme comme tels "
        "(« lié à votre demande »), les offres, signaux et interlocuteurs qui s'y rattachent. Ne retire, ne masque "
        "et n'écarte AUCUN signal, contact ou offre à cause d'elle : tout le reste est analysé et listé, après."
        if any(line.startswith(_LAURA_REQUEST_PREFIX) for line in criteria)
        else ""
    )
    return (
        "===== HYPOTHÈSES DU VENDEUR (fournies par l'ESN, NON VÉRIFIÉES) =====\n"
        + "\n".join(lines)
        + "\nCe sont des pistes de l'ESN, pas des faits collectés : cherche ce qui les confirme ou "
        "les infirme dans les sources publiques, et ne les cite jamais comme des faits — dis « selon "
        "votre ciblage » si tu les reprends. Le Tier est le classement de l'ESN, pas une probabilité "
        "de closing : ne le convertis jamais en pourcentage ni en chance."
        + discover_note
        + laura_note
    )


def _criteria(value: Any) -> list[str]:
    """#3819 — les lignes de critères Découvrir, nettoyées ; vides écartées."""
    if not isinstance(value, list):
        return []
    return [text for text in (_text(item)[:_MAX_CRITERIA_LINE] for item in value[:10]) if text]


def append_seller_hypotheses(context: str, data: dict[str, Any] | None) -> str:
    """Ajoute le bloc à un contexte ; sans donnée, le contexte est inchangé."""
    block = seller_hypotheses_block(data)
    if not block:
        return context
    return f"{context}\n\n{block}" if (context or "").strip() else block
