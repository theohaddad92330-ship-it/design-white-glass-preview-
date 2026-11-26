"""Quick wins et risques DATÉS et reliés à une preuve (Théo, restitution TF1 p28).

    « Quick wins et risques doivent être recalculés après chaque enrichissement,
      avec preuve et date. »

Aujourd'hui un quick win et un risque sont des phrases libres : le commercial ne
sait ni QUAND l'item a été (re)calculé, ni SUR QUOI il repose. Deux items
identiques — l'un déduit d'un signal sourcé de la semaine, l'autre d'une
intuition du modèle — s'affichent exactement pareil.

Ce module comble le trou **sans toucher aux prompts** (ils sont verrouillés par
des golden tests) : il post-traite la sortie du modèle de façon déterministe,
comme le fait déjà ``score_axes`` pour les facteurs du score.

Deux ajouts par item, tous deux ADDITIFS :

- ``computed_at`` — l'horodatage ISO-8601 UTC du calcul. La phase 4 tourne à
  chaque analyse ET à chaque replan (donc après chaque enrichissement), si bien
  que la date est celle du dernier recalcul, pas une date inventée.
- ``proof_type`` / ``proof`` / ``proof_date`` — la preuve à laquelle l'item est
  rattaché, dans la MÊME taxonomie que les facteurs de score
  (``score_axes.PROOF_TYPES`` = signal / source / contact / profile /
  business_rule). Rattachement déterministe aux données réelles du dossier :

    1. ``contact``  — l'item nomme un contact RÉELLEMENT présent au dossier ;
    2. ``signal``   — le texte de l'item recoupe un signal SOURCÉ de la recherche
                      (``recentSignals`` / ``budgetSignals`` portent ``source`` et
                      souvent ``date``) ;
    3. ``profile``  — l'item nomme une offre de l'ESN elle-même.

  Aucune correspondance ⇒ AUCUNE clé de preuve (§8 : jamais de citation
  fabriquée). L'écran affiche alors « preuve à qualifier », pas une preuve fausse.

Pur, sans I/O, sans LLM : deux runs sur les mêmes données produisent le même
objet.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from app.services.score_axes import PROOF_TYPES

__all__ = ["PROOF_TYPES", "stamp_dated_proof"]

# Mots trop courants pour discriminer quoi que ce soit : sans ce filtre, « pour »
# ou « avec » suffirait à relier n'importe quel quick win à n'importe quel signal.
_MIN_TOKEN_LEN = 5


def _tokens(text: object) -> set[str]:
    """Jeu de tokens comparables d'un texte : minuscules, accents aplatis, mots
    courts écartés. Assez grossier pour rester lisible, assez strict pour qu'un
    recoupement soit un vrai recoupement."""
    raw = str(text or "").lower()
    normalized = (
        raw.replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("â", "a")
        .replace("î", "i")
        .replace("ï", "i")
        .replace("ô", "o")
        .replace("û", "u")
        .replace("ù", "u")
        .replace("ç", "c")
    )
    cleaned = "".join(ch if ch.isalnum() else " " for ch in normalized)
    return {tok for tok in cleaned.split() if len(tok) >= _MIN_TOKEN_LEN}


def _contact_proof(item: Mapping[str, Any], contacts: Sequence[Any]) -> dict[str, Any] | None:
    """La preuve la plus forte : l'item vise une personne QUI EST au dossier.

    Cherche d'abord le champ ``contact`` du quick win (le modèle le remplit), puis
    le nom d'un contact cité dans le texte de l'item. Un nom que le dossier ne
    connaît pas ne devient JAMAIS une preuve — c'est justement le cas où le rep
    doit se méfier."""
    named = str(item.get("contact") or "").strip()
    item_tokens = _tokens(f"{item.get('action') or ''} {item.get('risk') or ''}")
    for contact in contacts:
        if not isinstance(contact, Mapping):
            continue
        full_name = str(contact.get("fullName") or contact.get("full_name") or "").strip()
        if not full_name:
            continue
        matches_named = bool(named) and _tokens(named) & _tokens(full_name)
        matches_text = bool(_tokens(full_name) & item_tokens)
        if not (matches_named or matches_text):
            continue
        title = str(contact.get("title") or "").strip()
        return {"proof_type": "contact", "proof": f"{full_name} — {title}" if title else full_name}
    return None


def _signal_proof(item: Mapping[str, Any], signals: Sequence[Mapping[str, Any]]) -> dict[str, Any] | None:
    """Preuve « signal » : le texte de l'item recoupe un signal SOURCÉ de la
    recherche. On garde le signal qui partage le plus de tokens (départage stable
    par ordre d'apparition) et on reprend SA date quand il en porte une —
    jamais la date du jour déguisée en date de preuve."""
    item_tokens = _tokens(f"{item.get('action') or ''} {item.get('risk') or ''} {item.get('mitigation') or ''}")
    if not item_tokens:
        return None
    best: Mapping[str, Any] | None = None
    best_score = 0
    for signal in signals:
        source = str(signal.get("source") or "").strip()
        if not source:
            continue  # un signal sans source n'est pas une preuve
        score = len(item_tokens & _tokens(signal.get("signal")))
        if score > best_score:
            best, best_score = signal, score
    if best is None:
        return None
    source = str(best.get("source") or "").strip()
    text = str(best.get("signal") or "").strip()
    # `budgetSignals` datent via `timeframe`, `recentSignals` via `date`.
    date = str(best.get("date") or best.get("timeframe") or "").strip()
    proof = f"{text} — {source}" if text else source
    result: dict[str, Any] = {"proof_type": "signal", "proof": proof}
    if date:
        result["proof_date"] = date
    return result


def _offer_proof(item: Mapping[str, Any], offers: Sequence[Any]) -> dict[str, Any] | None:
    """Preuve « profile » : l'item s'appuie sur une offre de l'ESN elle-même —
    la seule donnée du dossier qui vienne du vendeur et non de la cible."""
    item_tokens = _tokens(f"{item.get('action') or ''} {item.get('risk') or ''}")
    if not item_tokens:
        return None
    for offer in offers:
        label = str(offer or "").strip()
        if label and item_tokens & _tokens(label):
            return {"proof_type": "profile", "proof": label}
    return None


def _sourced_signals(account_data: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    """Les signaux de la recherche qui portent une source — les seuls citables."""
    out: list[Mapping[str, Any]] = []
    for key in ("recentSignals", "recent_signals", "budgetSignals", "budget_signals"):
        for signal in account_data.get(key) or []:
            if isinstance(signal, Mapping):
                out.append(signal)
    return out


def _esn_offers(account_data: Mapping[str, Any]) -> list[str]:
    rules = account_data.get("esnRules") or account_data.get("esn_rules") or {}
    offers = rules.get("offers") if isinstance(rules, Mapping) else None
    return [str(o).strip() for o in (offers or []) if str(o or "").strip()]


def stamp_dated_proof(
    items: Iterable[Any],
    *,
    account_data: Mapping[str, Any] | None = None,
    contacts: Sequence[Any] | None = None,
    computed_at: str | None = None,
) -> None:
    """Date chaque quick win / risque et lui rattache sa preuve, EN PLACE.

    ``computed_at`` par défaut = maintenant (UTC, ISO-8601) : la phase 4 rejoue à
    chaque analyse et à chaque replan, donc l'horodatage est bien celui du dernier
    recalcul demandé p28. Les clés de preuve ne sont posées QUE lorsqu'une preuve
    réelle a été trouvée — un item sans preuve reste sans preuve.

    Les items qui ne sont pas des objets (un ancien payload peut porter des
    chaînes) sont laissés strictement intacts."""
    stamp = computed_at or datetime.now(UTC).isoformat()
    signals = _sourced_signals(account_data or {})
    offers = _esn_offers(account_data or {})
    people = contacts or []
    for item in items:
        if not isinstance(item, dict):
            continue
        item["computed_at"] = stamp
        proof = _contact_proof(item, people) or _signal_proof(item, signals) or _offer_proof(item, offers)
        if proof:
            item.update(proof)
