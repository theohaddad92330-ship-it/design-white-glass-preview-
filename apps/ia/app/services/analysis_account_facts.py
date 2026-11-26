"""#4070 — LE PIPELINE D'ANALYSE REÇOIT LES FAITS DU COMPTE (socle #4069) COMME INTRANT.

Constat (#4068, carte du 12/10) : la recherche ne lisait le CRM que comme un
drapeau, les contacts n'avaient aucune source, le plan réduisait gagné/perdu à
``has_positive_rex``, les messages n'avaient pas de couche zéro, et une
ré-analyse ne relisait jamais la précédente. L'API (``AccountFactsService``,
#4069.1) lit désormais, pour UN compte, tout ce que l'espace sait de lui — déjà
daté, typé, pesé — et l'envoie ici au lancement de l'analyse.

Décisions Louis 12/10 (#4068) que ces blocs font tenir au modèle :

* **toujours daté** — aucune coupure d'âge ; un fait ancien se dit AVEC son âge
  (« il y a 14 mois »), jamais comme s'il était d'hier ;
* **un besoin qui revient est un signal fort** (la récurrence est déjà dans le
  rang reçu) ; un fait unique et ancien est une trace, pas une urgence ;
* **jamais nommé** — un fait se dit par sa nature et sa date, jamais par sa
  provenance (renverse #2291.3). « Votre CRM » reste permis : c'est l'outil
  branché par le client, pas un de nos fournisseurs ;
* **la correction de l'équipe gagne toujours**, quelle que soit sa date ;
* **aucune probabilité** : l'ordre des lignes est un rang, pas une chance ;
* **contexte borné** : les plus pertinents d'abord, un budget de caractères
  nommé (``FACTS_BLOCK_MAX_CHARS`` ≈ 2 000 tokens à 4 caractères par token),
  le reste se DIT (« N faits… ne sont pas listés »), il ne se tait pas.

Contrat commun : entrée vide → ``""`` et le prompt appelant reste **byte-
identique** à avant le lot (même discipline que ``feedback_directives_block``).
Runtime-only : n'affecte pas les prompts golden.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

#: Nombre de faits retenus à l'arrivée (l'API en envoie au plus autant).
MAX_FACTS = 40
#: Budget d'un bloc de faits : 8 000 caractères ≈ 2 000 tokens (4 caractères par token).
FACTS_BLOCK_MAX_CHARS = 8000
_LABEL_MAX = 280
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")

KIND_LABEL: dict[str, str] = {
    "hiring": "Recrutement",
    "need": "Besoin",
    "signal": "Signal",
    "deal_won": "Affaire gagnée",
    "deal_lost": "Affaire perdue",
    "deal_dormant": "Affaire en sommeil",
    "mission": "Mission",
    "note": "Note",
    "meeting": "Compte rendu de RDV",
    "correction": "Correction de l'équipe",
    "market_observation": "Observation de marché",
    "document": "Document",
}

#: Ce que chaque phase lit. La recherche voit ce qui crée (ou non) l'urgence ; le
#: plan voit tout ; les messages ne voient que de quoi accrocher et éviter la faute.
_PHASE_KINDS: dict[str, frozenset[str]] = {
    "research": frozenset({"hiring", "need", "signal", "market_observation", "correction"}),
    "plan": frozenset(KIND_LABEL),
    "messages": frozenset(
        {"hiring", "need", "signal", "deal_won", "deal_lost", "deal_dormant", "mission", "correction"}
    ),
}
#: Lignes au plus par phase : les messages n'ont besoin que de l'essentiel.
_PHASE_MAX_LINES: dict[str, int] = {"research": 25, "plan": MAX_FACTS, "messages": 12}


def age_phrase(age_days: int) -> str:
    """L'âge en mots — calculé ici une fois, le modèle ne refait pas l'arithmétique."""
    if age_days < 1:
        return "aujourd'hui"
    if age_days < 31:
        return f"il y a {age_days} jour{'s' if age_days > 1 else ''}"
    if age_days < 731:
        return f"il y a {max(1, round(age_days / 30.44))} mois"
    years = int(age_days / 365.25)
    return f"il y a {years} an{'s' if years > 1 else ''}"


def _one_line(text: Any) -> str:
    flat = " ".join(str(text or "").split())
    return flat if len(flat) <= _LABEL_MAX else flat[: _LABEL_MAX - 1] + "…"


def normalize_account_facts(raw: Any) -> list[dict[str, Any]]:
    """Faits reçus de l'API → liste propre ``{kind, label, date, age_days}``.

    Un fait sans date ISO, sans libellé, de nature inconnue ou d'âge négatif ne
    fait AUCUNE ligne : on n'affiche pas ce qu'on n'a pas et on ne devine jamais
    une date. Toute clé hors ces quatre (``source``, ``provider``…) est jetée :
    la provenance ne traverse pas. L'ordre reçu est celui du poids — conservé.
    """
    if not isinstance(raw, (list, tuple)):
        return []
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, Mapping):
            continue
        kind = item.get("kind")
        label = _one_line(item.get("label"))
        date = item.get("date")
        age = item.get("age_days")
        if kind not in KIND_LABEL or not label:
            continue
        if not isinstance(date, str) or not _ISO_DATE.match(date):
            continue
        if isinstance(age, bool) or not isinstance(age, int) or age < 0:
            continue
        key = (kind, date[:10], label.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append({"kind": kind, "label": label, "date": date[:10], "age_days": age})
        if len(out) >= MAX_FACTS:
            break
    return out


def _line(fact: Mapping[str, Any]) -> str:
    return f"- [{fact['date']} · {age_phrase(int(fact['age_days']))}] {KIND_LABEL[fact['kind']]} : {fact['label']}"


_COMMON_RULES = (
    "DATE tout fait ancien quand tu le cites, avec son âge tel qu'il est écrit entre crochets "
    "(« il y a 14 mois ») ; ne présente JAMAIS un fait ancien comme récent ou actuel. Dis un fait par sa "
    "NATURE et sa date, JAMAIS par sa provenance : ne nomme ni base, ni outil, ni fournisseur, ni système "
    "d'où il viendrait (seul « votre CRM » peut se dire, c'est l'outil du client). Une correction de "
    "l'équipe prime sur tout fait, plus ancien ou plus récent, qui la contredit. Aucune probabilité : "
    "l'ordre de ces lignes est un rang, pas une chance de gagner."
)

_PHASE_RULES: dict[str, str] = {
    "research": (
        "POURQUOI MAINTENANT : appuie-toi sur cet historique COMPLET, pas seulement sur ce qui est récent. "
        "Un besoin, un recrutement ou un signal de même nature qui REVIENT à plusieurs dates est un SIGNAL "
        "FORT ; un fait unique et ancien est une trace, pas une urgence. Quand rien de récent ne crée "
        "d'urgence, écris-le au lieu de grossir un vieux fait."
    ),
    "plan": (
        "Affaire PERDUE : ne propose pas la même route sans dire ce qui a changé depuis (sa date, et son "
        "motif quand il est écrit). Affaire GAGNÉE : une référence et un point d'appui pour étendre. "
        "Affaire en SOMMEIL : une réactivation, à dater. MISSION passée chez ce client : une preuve et un "
        "interlocuteur à rappeler. Un besoin qui REVIENT est un signal fort ; un fait unique et ancien est "
        "une trace. Ne cite un motif que s'il est écrit dans ces lignes : n'en invente pas."
    ),
    "messages": (
        "Accroche-toi sur un fait DATÉ de ces lignes, jamais sur une supposition ; ne ré-ouvre pas une "
        "affaire perdue comme si rien ne s'était passé, et n'écris pas à propos d'un fait qu'une correction "
        "de l'équipe contredit."
    ),
}

_TITLE: dict[str, str] = {
    "research": "HISTORIQUE DU COMPTE (tout ce que l'espace sait de ce compte, les plus pertinents d'abord)",
    "plan": "HISTORIQUE DU COMPTE : affaires, missions, besoins (les plus pertinents d'abord)",
    "messages": "FAITS DATÉS DU COMPTE (les plus pertinents d'abord)",
}


def account_facts_block(facts: Any, phase: str) -> str:
    """Bloc « faits du compte » pour la phase, ou ``""`` sans fait lisible."""
    kinds = _PHASE_KINDS.get(phase)
    if kinds is None:
        return ""
    selected = [f for f in normalize_account_facts(facts) if f["kind"] in kinds][: _PHASE_MAX_LINES[phase]]
    if not selected:
        return ""
    head = f"\n\n===== {_TITLE[phase]} =====\n"
    tail_rules = f"\nRègles : {_PHASE_RULES[phase]} {_COMMON_RULES}"
    omitted_slot = "\n(999 faits plus anciens ou moins pertinents ne sont pas listés ici.)"
    budget = FACTS_BLOCK_MAX_CHARS - len(head) - len(tail_rules) - len(omitted_slot)
    lines: list[str] = []
    used = 0
    for fact in selected:
        line = _line(fact)
        if used + len(line) + 1 > budget:
            break
        lines.append(line)
        used += len(line) + 1
    if not lines:
        return ""
    omitted = len([f for f in normalize_account_facts(facts) if f["kind"] in kinds]) - len(lines)
    note = f"\n({omitted} faits plus anciens ou moins pertinents ne sont pas listés ici.)" if omitted > 0 else ""
    return head + "\n".join(lines) + note + tail_rules


def has_positive_rex_from_facts(facts: Any) -> bool:
    """Le compte a-t-il un retour d'expérience POSITIF dans l'espace ?

    Remplace le seul drapeau ``_account_has_positive_rex`` (#4070.2) : une
    affaire gagnée ou une mission menée chez ce client est un REX positif, de
    tout âge (le prompt du plan la date). Une perte seule n'en est pas un.
    """
    return any(f["kind"] in {"deal_won", "mission"} for f in normalize_account_facts(facts))


# ── repères du secteur (référentiel Bellum) — jamais le nom du pack ───────────

_SECTOR_MAX_CHUNKS = 3
_SECTOR_CHUNK_CHARS = 500
_SECTOR_MAX_CHARS = 3000


def sector_referential_block(chunks: Any) -> str:
    """Repères du secteur du compte pour le plan, ou ``""`` sans repère lisible."""
    if not isinstance(chunks, (list, tuple)):
        return ""
    rows: list[str] = []
    for chunk in chunks:
        if not isinstance(chunk, Mapping):
            continue
        title = _one_line(chunk.get("titre"))
        text = " ".join(str(chunk.get("texte") or "").split())[:_SECTOR_CHUNK_CHARS]
        if not title and not text:
            continue
        rows.append(f"- {title} : {text}" if title else f"- {text}")
        if len(rows) >= _SECTOR_MAX_CHUNKS:
            break
    if not rows:
        return ""
    body = "\n".join(rows)[:_SECTOR_MAX_CHARS]
    return (
        "\n\n===== REPÈRES DU SECTEUR (référentiel sectoriel Bellum — des repères de marché, jamais des faits "
        "sur CE compte) =====\n"
        + body
        + "\nRègles : un repère de secteur éclaire l'angle, il ne prouve rien sur ce compte ; ne le présente "
        "jamais comme un fait observé chez lui, et ne nomme jamais d'où il vient. Aucune probabilité."
    )


# ── .2 motifs de perte déclarés ──────────────────────────────────────────────

_LOST_REX_MAX_CHARS = 1500


def lost_deal_motifs_block(rex: Any) -> str:
    """Motifs de perte DÉCLARÉS par l'équipe (REX de perte), datés, pour le plan."""
    text = str(rex or "").strip()[:_LOST_REX_MAX_CHARS]
    if not text:
        return ""
    return (
        "\n\n===== PERTES PASSÉES SUR CE COMPTE (motifs déclarés par l'équipe, datés) =====\n"
        + text
        + "\nRègles : ces motifs sont déclarés par l'équipe, pas établis : cite-les comme tels, avec leur date, "
        "et ne les transforme jamais en certitude. Ne ré-ouvre pas la même route sans dire ce qui a changé."
    )


# ── .3 priorisation des contacts ─────────────────────────────────────────────

_KNOWN_MAX = 20
_RELATION_LABEL = {
    "crm": "connu de votre CRM",
    "mission": "interlocuteur d'une mission passée chez ce client",
    # #4294.9 — le prescripteur d'un besoin passé (base commune), daté ou « à revalider ».
    "prescriber": "prescripteur d'un besoin passé chez ce client",
}


def known_contacts_block(contacts: Any) -> str:
    """Interlocuteurs déjà connus de l'espace (CRM, missions passées) pour la classification."""
    if not isinstance(contacts, (list, tuple)):
        return ""
    lines: list[str] = []
    for contact in contacts:
        if not isinstance(contact, Mapping):
            continue
        name = _one_line(contact.get("name"))
        relation = _RELATION_LABEL.get(str(contact.get("relation") or ""))
        if not name or relation is None:
            continue
        role = _one_line(contact.get("role"))
        seen = str(contact.get("last_seen") or "")
        when = f", dernier échange {seen[:10]}" if _ISO_DATE.match(seen) else ""
        if contact.get("to_revalidate"):
            when += " — à revalider avant d'être présenté comme relais"
        lines.append(f"- {name}{f' ({role})' if role else ''} : {relation}{when}")
        if len(lines) >= _KNOWN_MAX:
            break
    if not lines:
        return ""
    return (
        "\n\n===== INTERLOCUTEURS DÉJÀ CONNUS DE L'ESPACE =====\n"
        + "\n".join(lines)
        + "\nRègles : à compétence égale, un interlocuteur déjà connu départage l'ordre de priorité "
        "(un chemin chaud vaut mieux qu'un inconnu) ; il ne FILTRE jamais — un contact absent de cette "
        "liste reste classé selon son rôle. N'ajoute à la liste des contacts aucune personne qui n'y est "
        "pas déjà et n'invente aucun lien. Dis la relation par sa nature (« connu de votre CRM », "
        "« ancien interlocuteur de mission »), jamais par un outil ou une base. Aucune probabilité."
    )


# ── .4 une ré-analyse relit l'analyse précédente ─────────────────────────────

_PREVIOUS_MAX_CHARS = 5000


def previous_analysis_block(previous: Any) -> str:
    """L'analyse précédente du compte, datée, et ses corrections humaines."""
    text = str(previous or "").strip()[:_PREVIOUS_MAX_CHARS]
    if not text:
        return ""
    return (
        "\n\n===== ANALYSE PRÉCÉDENTE DE CE COMPTE (une trace datée, pas un fait actuel) =====\n"
        + text
        + "\nRègles : cette analyse est une TRACE, jamais une source à recopier — confirme-la ou corrige-la "
        "avec ce que tu trouves aujourd'hui, et dis ce qui a changé quand tu le sais. Tout ce qui est marqué "
        "« corrigé par l'équipe » est un FAIT : la correction gagne toujours, quelle que soit sa date, même "
        "si une donnée plus récente dit autre chose. Ne présente jamais un élément de l'analyse précédente "
        "comme récent ; ne nomme jamais d'où il vient. Aucune probabilité."
    )


def append_blocks(base: str, *blocks: str) -> str:
    """Ajoute les blocs non vides à ``base`` ; aucun bloc = ``base`` inchangé au byte près."""
    return base + "".join(b for b in blocks if b)


def iter_texts(value: Any, _skip: frozenset[str] = frozenset()) -> Iterable[str]:
    """Toutes les chaînes d'une structure imbriquée (utilisé par le juge)."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, Mapping):
        for key, item in value.items():
            if key in _skip:
                continue
            yield from iter_texts(item, _skip)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from iter_texts(item, _skip)
