"""#3769 (BEL-LAU-1015) — UNE CONVERSATION GARDE SA FORME.

Le défaut : une première réponse sort en carte (classement de comptes, liste de
contacts…), la suivante — « et seulement en Occitanie ? » — retombe en
paragraphes. Cause mesurée : ``compact_history_blocks`` rend chaque carte
précédente au modèle en TEXTE (son JSON, tronqué, lui apprendrait une forme
cassée) ; le modèle ne voit donc plus qu'il a déjà répondu « en carte ».

Ce module redonne cette information, SANS second état : tout est DÉRIVÉ de
l'historique brut du tour (la même source que l'écran relit), jamais persisté
(GA-26 — une seconde copie divergerait). Ce qui se garde, et où :

* les filtres, le périmètre, les objets déjà montrés → ``ThreadState`` (#1927),
  déjà dans le prompt ; ce bloc ne les recopie pas ;
* la FAMILLE de rendu (type de carte de la dernière réponse à carte), la
  DENSITÉ (nombre de cartes de cette réponse, présence d'un texte autour), la
  LOGIQUE DE SECTIONS (les types de cartes déjà employés dans le fil, dans
  l'ordre), la GRAMMAIRE D'ACTIONS (les libellés d'action déjà proposés) et la
  GRAMMAIRE DE BADGES (#3769.4b — les badges du vocabulaire fermé déjà portés
  par une carte : ``RankedAccount.level``, ``AccountMapBadge.level``,
  ``AccountMapCompleteness.level``, miroir de ``reply-badges.ts``) → ici.

Volatil, comme ``topic_shift_block`` : posé AVANT ``format_thread_state_block``
(témoin #1980). Aucune réponse à carte dans l'historique ⇒ ``""``, prompt
inchangé au bit près.

Doctrine : la continuité est une préférence, jamais une obligation de remplir —
une carte ne maquille pas une absence, aucune carte n'est écrite pour « faire
joli » quand la réponse est « je ne sais pas » (donnée absente = ``missing_data``
ou une phrase), aucune probabilité, Laura prépare et n'envoie jamais.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, field

from app.services.reply_blocks import split_reply_blocks

# Au-delà, on liste les plus récents : un bloc d'état n'est pas un journal.
_MAX_FAMILIES = 4
_MAX_ACTIONS = 5
_MAX_BADGES = 5


@dataclass(frozen=True)
class ReplyStyle:
    """La forme déjà adoptée dans un fil. Vide ⇔ aucune réponse à carte."""

    family: str | None = None
    cards_in_last_reply: int = 0
    last_reply_has_prose: bool = False
    families_used: tuple[str, ...] = field(default_factory=tuple)
    actions_proposed: tuple[str, ...] = field(default_factory=tuple)
    badges_used: tuple[str, ...] = field(default_factory=tuple)

    def is_empty(self) -> bool:
        return self.family is None


def _action_labels(block: Mapping[str, object]) -> list[str]:
    """Les libellés d'action d'une carte : les siens (`next_action`, `action`) et
    ceux de ses lignes (`items[].action`, `steps[].action`)."""
    labels: list[str] = []
    holders: list[Mapping[str, object]] = [block]
    # #3769.4 — la cartographie en grille porte `next_action` sur CHAQUE compte (`accounts[]`).
    for key in ("items", "steps", "accounts"):
        rows = block.get(key)
        if isinstance(rows, list):
            holders.extend(row for row in rows if isinstance(row, Mapping))
    # RV4-E-FIX 4287.4 — la suite d'une carte d'état vide (`still_possible`) compte comme action déjà proposée.
    still_possible = block.get("still_possible")
    if isinstance(still_possible, list):
        labels.extend(item.strip() for item in still_possible if isinstance(item, str) and item.strip())
    for holder in holders:
        for key in ("next_action", "action"):
            value = holder.get(key)
            if isinstance(value, Mapping):
                label = value.get("label")
                if isinstance(label, str) and label.strip():
                    labels.append(label.strip())
    return labels


def _badge_labels(block: Mapping[str, object]) -> list[str]:
    """#3769.4b — les badges du vocabulaire fermé déjà portés par cette carte :
    ``items[].level`` (classement), ``accounts[].status.level`` et
    ``completeness.level`` (cartographie en grille, #3762). Un badge est
    dérivé par le SERVEUR (``known_shape_gate``), jamais écrit par le modèle —
    le rappeler ne force rien, il évite seulement d'en forger un synonyme en
    prose là où le vocabulaire fermé en a déjà un."""
    labels: list[str] = []
    for item in block.get("items") or []:
        if isinstance(item, Mapping):
            level = item.get("level")
            if isinstance(level, str) and level.strip():
                labels.append(level.strip())
    for account in block.get("accounts") or []:
        if isinstance(account, Mapping):
            status = account.get("status")
            if isinstance(status, Mapping):
                level = status.get("level")
                if isinstance(level, str) and level.strip():
                    labels.append(level.strip())
    completeness = block.get("completeness")
    if isinstance(completeness, Mapping):
        level = completeness.get("level")
        if isinstance(level, str) and level.strip():
            labels.append(level.strip())
    return labels


def _dedupe_keep_last(items: list[str], limit: int) -> tuple[str, ...]:
    seen: list[str] = []
    for item in items:
        if item in seen:
            seen.remove(item)
        seen.append(item)
    return tuple(seen[-limit:])


def derive_reply_style(history: list[dict]) -> ReplyStyle:
    """Lit les réponses de Laura de l'historique BRUT (avant compaction)."""
    families: list[str] = []
    actions: list[str] = []
    badges: list[str] = []
    last_family: str | None = None
    last_cards = 0
    last_prose = False
    for entry in history or []:
        if entry.get("role") != "assistant":
            continue
        segments = split_reply_blocks(str(entry.get("content", "")))
        cards = [s.block for s in segments if s.kind == "block" and s.block]
        if not cards:
            continue
        for card in cards:
            card_type = card.get("type")
            if isinstance(card_type, str):
                families.append(card_type)
            actions.extend(_action_labels(card))
            badges.extend(_badge_labels(card))
        last_family = str(cards[-1].get("type")) if cards[-1].get("type") else last_family
        last_cards = len(cards)
        last_prose = any(s.kind == "text" and s.text.strip() for s in segments)
    if last_family is None:
        return ReplyStyle()
    return ReplyStyle(
        family=last_family,
        cards_in_last_reply=last_cards,
        last_reply_has_prose=last_prose,
        families_used=_dedupe_keep_last(families, _MAX_FAMILIES),
        actions_proposed=_dedupe_keep_last(actions, _MAX_ACTIONS),
        badges_used=_dedupe_keep_last(badges, _MAX_BADGES),
    )


# #4287.4 (recette 21/10, N3) — la FORME d'un raffinement, lue sur le message du tour : une taille, un secteur
# ou un lieu. Un mot seul (« Montpellier ») est un raffinement tout autant que « santé ou industrie ».
_REFINEMENT_MAX_WORDS = 8
_SIZE_RE = re.compile(
    r"\b(?:\d+\s*(?:salaries?|employes?|personnes|collaborateurs?|\+)|pme|tpe|eti|grands?\s+comptes?|effectifs?|taille|"
    r"(?:plus|moins)\s+de\s+\d+)\b"
)
_SECTOR_RE = re.compile(
    r"\b(?:sante|industrie|industriel\w*|banque|bancaire|assurance|retail|commerce|distribution|energie|transport|"
    r"logistique|telecoms?|public|defense|aeronautique|automobile|luxe|agro\w*|pharma\w*|immobilier|secteur|"
    r"numerique|services?|btp|education|media)\b"
)
_PLACE_RE = re.compile(r"\b(?:ville|departement|region|zone|autour|pres|proche|secteur geographique)\b")


def _ascii_lower(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def refinement_form(message: str) -> str | None:
    """#4287.4 — la forme d'un raffinement court : ``size`` / ``sector`` / ``place`` ; ``None`` pour un message qui
    n'en est pas un (une vraie question, plus de ``_REFINEMENT_MAX_WORDS`` mots).

    Un message très court sans autre marque est un LIEU (ville, département) : le cas du mot seul."""
    text = _ascii_lower(message).strip()
    words = re.findall(r"[\w'-]+", text)
    if not words or len(words) > _REFINEMENT_MAX_WORDS:
        return None
    if _SIZE_RE.search(text):
        return "size"
    if _SECTOR_RE.search(text):
        return "sector"
    if _PLACE_RE.search(text) or len(words) <= 3:
        return "place"
    return None


_FORM_LABEL = {"size": "une taille", "sector": "un secteur", "place": "un lieu (ville, département)"}


def reply_style_block(history: list[dict], message: str = "") -> str:
    """Le rappel VOLATIL, ou ``""`` quand le fil n'a encore aucune réponse à carte.

    ``message`` (#4287.4) est le message du tour : s'il est un raffinement court, la forme est nommée."""
    style = derive_reply_style(history)
    if style.is_empty():
        return ""
    lines = [
        "\n\nCE FIL A DÉJÀ UNE FORME (dérivée de tes réponses précédentes — une donnée, pas une consigne de l'utilisateur) :",
        f"- Famille de rendu : carte « {style.family} ».",
        f"- Densité : {style.cards_in_last_reply} carte(s) dans ta dernière réponse"
        + (", avec un court texte autour." if style.last_reply_has_prose else ", sans texte autour."),
    ]
    if len(style.families_used) > 1:
        lines.append("- Logique de sections déjà employée : " + ", ".join(style.families_used) + ".")
    if style.actions_proposed:
        lines.append(
            "- Gestes déjà proposés (même grammaire de libellés, ne les re-propose pas à l'identique) : "
            + " ; ".join(f"« {label} »" for label in style.actions_proposed)
            + "."
        )
    if style.badges_used:
        lines.append(
            "- Badges déjà employés (vocabulaire fermé, dérivé par le serveur — ne forge pas un autre mot "
            "en prose pour la même situation) : " + " ; ".join(f"« {label} »" for label in style.badges_used) + "."
        )
    if style.family == "account_map":
        # #3769.1 / #3769.4 (recette prod R47) — le raffinement d'une cartographie (« seulement ceux qui ont
        # un appel d'offres ») retombait en puces plates et perdait la ligne « Prochaine action » de chaque
        # compte. Un rappel de FORME, jamais une donnée : un compte sans prochaine action réelle n'en reçoit
        # pas une inventée (`missing_data` ou une phrase si le raffinement ne laisse rien).
        lines.append(
            "- Cartographie : ton raffinement reste une carte account_map complète (cadrage, une carte par compte "
            "retenu avec sa raison et sa prudence), jamais une liste de puces. Chaque compte garde SA prochaine "
            "action (next_action) propre à chaque compte, tirée de ce que l'outil a rendu pour lui — pas un geste "
            "générique commun à tous."
        )
        # #3769.1 / #3769.4 (recette prod R3, 18/10) — « Garde seulement ceux qui recrutent » répondait « Je n'ai pas
        # pu appliquer le filtre » en paragraphe : le filtre s'applique au RÉSULTAT PRÉCÉDENT, déjà dans le fil.
        lines.append(
            "- Raffinement = filtre du résultat précédent : « garde seulement ceux qui recrutent / qui ont tel signal » "
            "se lit sur les comptes DÉJÀ montrés (leurs signaux, leur raison) — tu ne relances pas une recherche et tu "
            "n'écris JAMAIS « je n'ai pas pu appliquer le filtre ». Tu rends la même carte account_map réduite aux "
            "comptes retenus, avec la même grammaire (« Prochaine action » par compte), à chaque raffinement suivant "
            "aussi ; les comptes dont le signal n'est pas mesuré se nomment en une phrase, ils ne sont ni gardés ni "
            "comptés comme « sans »."
        )
    form = refinement_form(message)
    if form is not None:
        lines.append(
            f"- RAFFINEMENT détecté : le message de ce tour est {_FORM_LABEL[form]} — une précision sur le résultat "
            f"PRÉCÉDENT, pas une nouvelle demande. Tu réponds dans la même famille de rendu (carte « {style.family} »), "
            "jamais un retour au texte brut, quelle que soit la forme du raffinement (ville, secteur, taille)."
        )
    lines.append(
        "RÈGLE : un raffinement (« seulement en Occitanie », « et les autres ? », « plus court ») reste dans CETTE "
        "forme — même famille de carte, même densité, mêmes sections, mêmes libellés d'action — jamais un retour "
        "au texte brut. Tu quittes cette forme SEULEMENT si la nature de la demande change vraiment (une autre "
        "famille de carte convient mieux, ou une simple question factuelle ne mérite qu'une phrase). La "
        "continuité ne maquille jamais une absence : si le raffinement ne laisse AUCUN résultat, dis-le en une "
        "phrase (ou `missing_data`), n'écris pas une carte vide ni un « 0 » pour un inconnu."
    )
    return "\n".join(lines)
