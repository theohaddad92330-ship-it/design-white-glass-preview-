"""#3708 — LES SOURCES QUE LA PERSONNE A EXCLUES pour ce fil (« Outils et sources »).

L'exclusion est appliquée EN CODE (``models/chat.py`` retire la famille de
``connected_families``, donc ``chat_tools.tools_for`` ne présente pas ses outils).
Ce bloc ne fait que LE DIRE : sans lui, ``missing_capabilities`` raconterait
« non connecté » — faux, la personne n'a rien déconnecté. Désélection ≠
déconnexion ; elle ne vaut que pour les NOUVELLES lectures de ce tour (ce qui
est déjà dans l'historique reste lisible, aucune promesse rétroactive).

VOLATIL, ajouté en queue du prompt par ``routers/chat.py`` (garde GA-293).
Vide sans exclusion : prompt byte-identique.
"""

from __future__ import annotations

# Libellés métier : la capacité, jamais un éditeur (doctrine D354).
_LABELS_FR = {
    "crm": "ton CRM",
    "email": "ta messagerie",
    "calendar": "ton agenda",
    "linkedin": "ton réseau professionnel",
    "documents": "tes documents",
    "communication": "ta messagerie d'équipe",
    "ats": "ton ATS",
    "telephony": "ton outil d'appel",
    "admin_docs": "ta signature et ta facturation",
    "finance": "ta finance",
    "jobs": "les offres d'emploi",
    "tenders": "les appels d'offres",
    "prospection": "ta prospection",
    "data": "tes données",
    "mcp": "tes outils externes",
}
_LABELS_EN = {
    "crm": "your CRM",
    "email": "your mailbox",
    "calendar": "your calendar",
    "linkedin": "your professional network",
    "documents": "your documents",
    "communication": "your team chat",
    "ats": "your ATS",
    "telephony": "your calling tool",
    "admin_docs": "your e-signature and invoicing",
    "finance": "your finance tool",
    "jobs": "job postings",
    "tenders": "public tenders",
    "prospection": "your prospecting tool",
    "data": "your data",
    "mcp": "your external tools",
}


def _labels(families: list[str], table: dict[str, str]) -> str:
    return ", ".join(table.get(family, family) for family in dict.fromkeys(families))


def excluded_sources_block(excluded_families: list[str] | None, language: str = "fr") -> str:
    if not excluded_families:
        return ""
    if language == "en":
        return (
            f"\n\nSOURCES EXCLUDED BY THE USER FOR THIS CONVERSATION: {_labels(excluded_families, _LABELS_EN)}. "
            "Their tools are not offered to you this turn. This is a choice, NOT a disconnection: never say "
            "they are not connected. Never read them through another route. If the request needs them, do what "
            "is possible without them and say once that the source is excluded; what is already in the "
            "conversation stays usable. Preparing is never sending."
        )
    return (
        f"\n\nSOURCES EXCLUES PAR LA PERSONNE POUR CE FIL : {_labels(excluded_families, _LABELS_FR)}. "
        "Leurs outils ne te sont pas proposés ce tour. C'est un CHOIX, PAS une déconnexion : ne dis jamais "
        "qu'ils ne sont pas connectés. Ne les lis par aucun autre chemin. Si la demande en a besoin, fais ce "
        "qui est possible sans eux et dis UNE fois que la source est exclue ; ce qui figure déjà dans la "
        "conversation reste utilisable. Préparer n'est jamais envoyer."
    )


__all__ = ["excluded_sources_block"]
