"""#3393 — la demande EXPLICITE passe avant toute clarification.

Recette prod du 30/09 : sur « Qui est le DSI de Société Générale ? », Laura
posait une question de désambiguïsation (``ask_clarification``, 4 puces) au
lieu de répondre. Le bloc ``_BLOCK_HIDDEN_QUESTION`` dit « réponds d'abord »,
mais un outil disponible gagne sur une consigne : on retire donc l'outil
(même geste que ``clarification_already_asked``) pour les deux formes
canoniques qui NOMMENT déjà leur objet — « qui est le <poste> de <entité> »
et « qui est déjà chez <entité> ». Les deux autres formes (« écris-moi un
message », « trouve-moi des comptes Java ») peuvent légitimement demander une
précision : elles restent hors de ce garde.

Ce n'est PAS un détecteur de la question cachée (aucune devinette d'intention,
voir le commentaire de ``_BLOCK_HIDDEN_QUESTION``) : il ne lit que la forme
explicite de la demande.
"""

from __future__ import annotations

import re

_LOOKUP_ROLE = re.compile(
    r"\bqui\s+est\s+(?:le|la|l['’]|les)\s*[\w' ’-]{2,60}?\s+(?:de|du|des|d['’]|chez)\s*\S+",
    re.IGNORECASE,
)
_ALREADY_THERE = re.compile(r"\bqui\s+est\s+d[ée]j[àa]\s+chez\s+\S+", re.IGNORECASE)
#: « idéal », « à contacter » : une question de recommandation, pas une recherche nommée.
_NOT_A_LOOKUP = re.compile(r"\b(id[ée]al|meilleur|contacter)\b", re.IGNORECASE)


def is_explicit_lookup_form(message: str | None) -> bool:
    text = (message or "").strip()
    if not text or _NOT_A_LOOKUP.search(text):
        return False
    return bool(_LOOKUP_ROLE.search(text) or _ALREADY_THERE.search(text))


def answer_first_note() -> str:
    # R22-LG (recette prod 22/10) — plus de phrase « Et derrière ta question… » : la question
    # cachée se traite en AGISSANT (`_BLOCK_HIDDEN_QUESTION`), jamais par un gabarit.
    return (
        "\n\nCETTE DEMANDE NOMME DÉJÀ SON OBJET (#3393) : tu réponds d'abord, en entier, avec "
        "les outils de recherche — tu ne poses JAMAIS de question de désambiguïsation avant "
        "(l'outil de clarification t'est retiré pour ce tour)."
    )


# ── #3430 — « écris au CTO » ne t'envoie pas chercher LEQUEL ────────────────
#
# Recette prod : sur une demande qui NOMME déjà le niveau élevé, Laura demandait
# « Quel CTO ? » (`ask_clarification`) avant de proposer le rôle le plus proche
# du problème documenté. `_BLOCK_DECISION_LEVEL` le dit déjà ; un outil
# disponible gagne pourtant sur une consigne — on le retire, même geste.
_HIGH_LEVEL_TITLE = r"(?:cto|dsi|cio|dg|pdg|ceo|dsi groupe|directeur (?:g[ée]n[ée]ral|des syst[èe]mes d['’]information|technique)|directrice (?:g[ée]n[ée]rale|technique))"
_WRITE_VERB = r"(?:[ée]cris|[ée]cri(?:re|vez)|contacte|contactez|envoie|envoyez|pr[ée]pare)"
_HIGH_LEVEL_CONTACT = re.compile(
    rf"\b{_WRITE_VERB}\b[^.?!\n]{{0,40}}?\b(?:au|à la|à|le|la|un message au|un message à la)\s+{_HIGH_LEVEL_TITLE}\b",
    re.IGNORECASE,
)


def is_high_level_contact_request(message: str | None) -> bool:
    text = (message or "").strip()
    return bool(text) and bool(_HIGH_LEVEL_CONTACT.search(text))


def closest_role_first_note() -> str:
    return (
        "\n\nCETTE DEMANDE NOMME DÉJÀ UN NIVEAU ÉLEVÉ (#3430) : tu ne demandes JAMAIS « quel CTO / quel "
        "DSI ? » (l'outil de clarification t'est retiré pour ce tour). Tu réponds d'abord : « Je peux "
        "préparer le message, mais je ne commencerais pas par ce niveau. » Tu proposes le rôle le plus "
        "proche du problème documenté (responsable applicatif, manager opérationnel) et tu gardes le "
        "niveau élevé comme ROUTE SPONSOR en parallèle, jamais comme premier contact froid. Tu prépares "
        "le message, tu ne l'envoies jamais."
    )


# ── #3393 formes 2 et 3 (Y1 01/10, Y3 02/10) — RETIRÉ par R22-LG (recette prod 22/10, #4438) ──
#
# Le rappel au tour (`hidden_question_template_note`) et la phrase garantie en sortie
# (`ensure_hidden_question_sentence`) finissaient 2 réponses sur 3 par « Et derrière ta question… Je peux
# le qualifier avec toi » : une relance fixe, contraire à « Laura agit, parle peu » (c126). La sortie la
# RETIRE désormais (`laura_acts.strip_relaunch_tail`).


# X32 (02/10, recette Y11) — « Je te réponds. » est le début du gabarit que le
# modèle recopiait ; et un tour ne rend qu'UNE réponse. Retrait déterministe,
# jamais une réécriture : seules la phrase parasite et un paragraphe identique
# déjà dit sont retirés, tout autre texte revient à l'octet.
_STRAY_ACK = re.compile(r"(?:(?<=^)|(?<=\n)|(?<=\. ))Je te réponds\.[ \t]*\n?", re.IGNORECASE)
_MIN_REPEAT_CHARS = 60


def one_answer_per_turn(reply: str) -> str:
    text = _STRAY_ACK.sub("", reply or "")
    if "```" in text:
        return text
    paragraphs = [p for p in re.split(r"\n{2,}", text.strip()) if p.strip()]
    half = len(paragraphs) // 2
    if len(paragraphs) % 2 == 0 and half and paragraphs[:half] == paragraphs[half:]:
        if len(" ".join(paragraphs[:half])) >= _MIN_REPEAT_CHARS:
            paragraphs = paragraphs[:half]
    seen: set[str] = set()
    kept: list[str] = []
    for para in paragraphs:
        key = " ".join(para.split()).lower()
        if len(key) >= _MIN_REPEAT_CHARS and key in seen:
            continue
        seen.add(key)
        kept.append(para)
    joined = "\n\n".join(kept)
    return joined if joined != text.strip() else text
