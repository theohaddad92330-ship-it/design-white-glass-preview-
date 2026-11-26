"""#3758 (BEL-LAU-1001) — LE ROUTEUR DE RENDU : une demande d'une famille connue
sort en carte, jamais en pavé de texte.

Retour bêta du 06/10 : « une cartographie de comptes ne sort plus en simple
texte libre ». Les cartes existaient déjà (`reply_blocks`) ; ce qui manquait,
c'est le CONTRAT : le choix de la forme dépendait de la bonne volonté du modèle
face à un prompt de 80 lignes. Trois gestes, tous déterministes (aucun appel de
modèle, aucun réseau) :

  * ``classify_reply_family`` — lit la demande sur des marqueurs DÉCLARÉS (FR et
    EN) et rend sa famille, ou ``None``. Une demande sans marqueur n'est pas
    routée : texte libre, comme avant (cas inconnu / conversationnel court).
    Une même demande produit TOUJOURS la même famille.
  * ``reply_family_directive`` — la consigne du tour, posée à côté de la demande
    (jamais dans le segment de prompt mis en cache) : la carte attendue, et la
    règle « donnée absente ⇒ carte PARTIELLE, jamais un faux complet ».
  * ``reply_family_outcome`` — ce que le tour a RÉELLEMENT produit : ``structured``
    (une carte attendue), ``text_fallback`` (une famille connue rendue sans
    aucune carte attendue). Le second est le défaut que le retour décrit : il
    est journalisé et voyage jusqu'à l'écran (``context.reply_family``), qui
    propose de relancer le tour en carte — le texte ne se déguise pas en carte.

Miroir TS : ``packages/contracts/src/schemas/reply-family.ts`` (même liste de
familles, même table famille → cartes ; parité tenue par test).

#3758 (reste du lot J14) — ``post_meeting_summary`` est désormais ROUTÉE : sa
source existe (``notes.meeting_recap_snapshot``, posé par ``MeetingNotesService``
à l'approbation du compte rendu), lue par ``get_account_briefing`` et bâtie en
carte par ``known_shape_gate`` — jamais le texte libre du modèle.

``generic_rich_answer`` reste la seule famille SANS carte (``cards == ()``) :
le repli, jamais exigé — n'importe quelle carte la satisfait, on ne force pas
une carte sur une question que rien ne reconnaît.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from app.services.reply_blocks import split_reply_blocks

ReplyFamilyOutcome = Literal["structured", "text_fallback"]


@dataclass(frozen=True)
class ReplyFamily:
    key: str
    #: Les cartes qui SATISFONT la famille (la première est celle que la consigne demande).
    cards: tuple[str, ...]
    #: Les marqueurs déclarés (normalisés : minuscules, sans accents).
    markers: tuple[str, ...]
    #: #4287.4 — une intention à DEUX volets : au moins un de ces marqueurs doit AUSSI être présent (vide : aucun).
    requires: tuple[str, ...] = ()


# ⚠️ L'ordre est l'ordre de départage d'une égalité — il ne se réordonne pas.
REPLY_FAMILIES: tuple[ReplyFamily, ...] = (
    ReplyFamily(
        "account_map",
        ("account_map", "account_ranking"),
        (
            "cartograph", "cartgograph", "cartograf", "cartgraph", "account map", "map of accounts",
            "mapping des comptes", "carte des comptes",
            # #3769 (recette prod nuit 08→09/10) — « ouvre mon périmètre à Montpellier et
            # périphérie » est l'exemple CANONIQUE de `reply_formats.py` (#3762) pour cette
            # carte ; sans marqueur dédié, cette phrase exacte restait non classée (`None`)
            # et retombait en texte libre, jamais en carte.
            "ouvre mon perimetre", "ouvre ton perimetre", "ouvre le perimetre", "ouvre un perimetre",
            "ouvrir mon perimetre", "ouvrir ton perimetre", "ouvrir le perimetre", "ouvrir un perimetre",
            "open my territory", "open my perimeter", "open a territory", "open a perimeter",
        ),
    ),
    ReplyFamily(
        "account_analysis",
        ("account_card", "verdict", "approach"),
        ("analyse du compte", "analyse de compte", "analyse complete du compte", "account analysis", "analyze the account", "analyse the account"),
    ),
    ReplyFamily(
        "contacts_list",
        ("contact_list",),
        ("liste de contacts", "liste des contacts", "qui contacter", "list of contacts", "contacts list", "who should i contact"),
    ),
    ReplyFamily(
        "action_plan",
        ("action_plan",),
        ("plan d'action", "plan d action", "action plan"),
    ),
    ReplyFamily(
        "meeting_brief",
        ("meeting_brief",),
        ("brief de rendez-vous", "prepare mon rendez-vous", "prepare ma reunion", "meeting brief", "prepare the meeting", "prepare my meeting"),
    ),
    ReplyFamily(
        "post_meeting_summary",
        ("post_meeting_summary",),
        (
            "compte rendu du rendez-vous",
            "compte rendu de la reunion",
            "compte rendu de rendez-vous",
            "decisions du rendez-vous",
            "relances du rendez-vous",
            "qu'est-ce qu'on a decide au rendez-vous",
            "post meeting summary",
            "meeting recap",
            "meeting notes summary",
        ),
    ),
    ReplyFamily(
        "market_memory_summary",
        ("account_volume_sprint", "count_contract", "account_map", "account_ranking"),
        # #4074 — « mémoire de marché » ne se dit plus à l'écran : on dit « observations du marché ».
        ("memoire de marche", "market memory", "observations du marche", "market observations"),
    ),
    ReplyFamily(
        "sequence_audience",
        ("contact_list",),
        ("audience de la sequence", "audience de ma sequence", "sequence audience"),
    ),
    ReplyFamily(
        "opportunity_review",
        ("account_ranking", "verdict", "comparison"),
        ("revue des opportunites", "point sur mes opportunites", "opportunity review", "review my opportunities"),
    ),
    ReplyFamily("generic_rich_answer", (), ()),
    # #3767 / #3771 (lot L1 07/10) — « Priorise mes comptes de la semaine » et « Classe-moi huit
    # comptes » restaient du texte : aucune famille ne les reconnaissait, donc aucune consigne de
    # carte, aucune mesure du repli, et aucune porte (`known_shape_gate`) ne savait quelle forme
    # rendre. Ajoutées APRÈS les dix familles du ticket #3758 : l'ordre de départage de celles-ci
    # ne bouge pas.
    ReplyFamily(
        "account_priorities",
        ("account_ranking", "file_export"),
        (
            "priorise",
            "prioriser",
            "priorisation",
            "par ou je commence",
            "par ou commencer",
            "prioritize",
            "prioritise",
            "where do i start",
            "where should i start",
        ),
    ),
    ReplyFamily(
        "account_ranking",
        ("account_ranking",),
        (
            "classe-moi",
            "classe moi",
            "classe mes comptes",
            "classer mes comptes",
            "classement de mes comptes",
            "classement des comptes",
            "rank my accounts",
            "rank these accounts",
            "rank the accounts",
        ),
    ),
    # #2985 (lot R22, 07/10) — « Fais-moi un point manager », sans compte nommé, rendait un
    # paragraphe mono-compte pendant que le contexte servi au modèle porte le PORTEFEUILLE entier
    # (aucun compte actif/nommé à résoudre, `chat-context.service.ts`). Même cartes que
    # `account_priorities` (même outil, même porte `known_shape_gate` — GA-26, jamais une seconde
    # dérivation) : un point manager SANS compte nommé est une revue DU PORTEFEUILLE, jamais d'un
    # seul compte choisi par jugement du modèle.
    #
    # #2985 (lot E07, 08/10, reste du lot R22) — « … sur Société Générale » (compte NOMMÉ) relève
    # de la MÊME famille (mêmes marqueurs) : `get_account_manager_review` est alors l'outil appelé,
    # et sa carte `manager_review` (`known_shape_gate.manager_review_block_from_tool`) satisfait
    # cette famille au même titre que `account_ranking` — jamais une seconde famille pour la même
    # phrase (GA-26). Avant ce lot, aucune carte ni aucun appelant `known_shape_gate` ne structurait
    # cette revue : le modèle l'écrivait encore en texte libre (recette 07/10).
    ReplyFamily(
        "account_manager_overview",
        ("account_ranking", "file_export", "manager_review"),
        (
            "point manager",
            "fais-moi un point manager",
            "fais moi un point manager",
            "revue manager",
            "manager review",
            "manager point",
        ),
    ),
    # #4287.4 (contrat Louis 29/10/2026) — « quelle est la prochaine action, et qu'est-ce qui manque ? » sur un
    # compte : sans famille, la forme dépendait de l'outil appelé par le modèle (`verdict` ou `account_card`) ou
    # de son humeur (gabarit texte CONSEIL) — trois formes le 26/10, deux le 28/10, « Ce qui manque » invisible
    # sur deux tours sur trois. UNE carte, `verdict` : elle porte les quatre sections du CONSEIL (conclusion,
    # pourquoi, ce qui manque, prochaine action) ; `known_shape_gate` y ramène toute autre forme. Les DEUX volets
    # sont exigés (`requires`) : « les comptes sans prochaine action » ou « ce qui manque » seul n'en sont pas.
    # Ajoutée en DERNIER : à égalité, une famille plus ancienne (plan d'action, classement…) garde la demande.
    ReplyFamily(
        "account_next_step",
        ("verdict",),
        ("prochaine action", "prochain geste", "prochaine etape", "next action", "next step"),
        requires=("manqu", "missing"),
    ),
)

REPLY_FAMILY_KEYS: tuple[str, ...] = tuple(family.key for family in REPLY_FAMILIES)
_BY_KEY: dict[str, ReplyFamily] = {family.key: family for family in REPLY_FAMILIES}


def _normalize(message: str) -> str:
    text = unicodedata.normalize("NFD", message or "")
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    for quote in ("‘", "’", "ʼ"):
        text = text.replace(quote, "'")
    return " ".join(text.lower().split())


def classify_reply_family(message: str) -> str | None:
    """La famille d'une demande, ou ``None`` (cas inconnu : texte libre).

    La famille qui cumule le plus de marqueurs gagne ; à égalité, la première de
    :data:`REPLY_FAMILIES`. Aucun marqueur ⇒ ``None``.
    """
    text = _normalize(message)
    best: tuple[int, str] | None = None
    for family in REPLY_FAMILIES:
        hits = sum(1 for marker in family.markers if marker in text)
        if family.requires and not any(marker in text for marker in family.requires):
            continue
        if hits and (best is None or hits > best[0]):
            best = (hits, family.key)
    return best[1] if best else None


def reply_family_cards(family: str | None) -> tuple[str, ...]:
    """Les cartes qui satisfont une famille (vide : famille inconnue ou sans carte)."""
    spec = _BY_KEY.get(family or "")
    return spec.cards if spec else ()


def reply_family_directive(family: str | None) -> str:
    """La consigne du tour — vide sans famille (prompt byte-identique)."""
    spec = _BY_KEY.get(family or "")
    if spec is None or not spec.cards:
        return ""
    if spec.key == "post_meeting_summary":
        # #3758 (reste du lot J14) — la carte `post_meeting_summary` vient du
        # SEUL compte rendu réellement enregistré (`known_shape_gate.py`),
        # jamais du modèle : lui demander de l'écrire l'inviterait à
        # réinventer des décisions, des actions ou une relance.
        return (
            "FAMILLE DE RÉPONSE : cette demande porte sur le compte rendu de rendez-vous ENREGISTRÉ. "
            "N'écris PAS toi-même de carte `post_meeting_summary` : le système l'attache depuis le compte "
            "rendu réellement enregistré, jamais depuis ton propre texte. Réponds brièvement en texte si "
            "besoin, sans reformuler ni inventer de décision, d'action ou de relance."
        )
    if spec.key == "account_next_step":
        # #4287.4 — une seule forme pour cette intention, quel que soit l'outil appelé ce tour.
        return (
            "FAMILLE DE RÉPONSE : cette demande relève de « account_next_step » (prochaine action et ce qui "
            "manque sur un compte). Rends-la en UNE carte `verdict` (bloc bellum-block) : `conclusion`, `reasons`, "
            "`limits` (« Ce qui manque », TOUJOURS rempli : chaque manque nommé, et si rien ne manque dis-le en "
            "une phrase), `next_action`. Jamais une carte `account_card` ni le gabarit texte CONSEIL pour cette "
            "demande, même après `get_account_briefing`. Une donnée que tu n'as pas se NOMME dans `limits`, "
            "jamais un faux complet."
        )
    return (
        f"FAMILLE DE RÉPONSE : cette demande relève de « {spec.key} ». Rends-la en carte "
        f"`{spec.cards[0]}` (bloc bellum-block, forme décrite plus haut), pas en paragraphes ni en puces. "
        "Une donnée que tu n'as pas est ABSENTE de la carte et se NOMME (couverture, not_covered, "
        "not_evaluated, limits selon la carte) : une réponse partielle reste une carte, jamais un faux complet."
    )


# #4397 — outils qui LANCENT une analyse asynchrone : leur résultat arrive plus tard sur la fiche.
_ANALYSIS_LAUNCH_TOOLS = frozenset({"start_account_analysis", "analyze_named_companies"})


def reply_family_outcome(
    family: str | None, reply: str, actions: Sequence[Mapping[str, Any]] | None = None
) -> ReplyFamilyOutcome | None:
    """Ce que le tour a produit pour sa famille — ``None`` sans famille exigée.

    ``structured`` : au moins une carte attendue dans la réponse. ``text_fallback`` :
    aucune (texte seul, ou une carte d'une autre forme). Lecture du MÊME découpage
    que l'écran (``split_reply_blocks``).
    """
    spec = _BY_KEY.get(family or "")
    if spec is None or not spec.cards:
        return None
    # #4397 — un tour qui a LANCÉ une analyse n'est pas un repli : la carte arrive plus tard sur la fiche,
    # le bandeau « Cette réponse est restée en texte » serait faux.
    if any(a.get("tool") in _ANALYSIS_LAUNCH_TOOLS for a in actions or ()):
        return None
    kinds = _block_kinds(reply)
    # Lot L1 07/10 — une absence NOMMÉE (`missing_data`, posée par `known_shape_gate` quand l'outil n'a rendu
    # aucun objet) est la forme honnête de la famille : la relancer « en carte » n'aurait rien à montrer.
    return "structured" if any(kind in spec.cards or kind == "missing_data" for kind in kinds) else "text_fallback"


def _block_kinds(reply: str) -> Sequence[str]:
    return [segment.block["type"] for segment in split_reply_blocks(reply) if segment.kind == "block" and segment.block]
