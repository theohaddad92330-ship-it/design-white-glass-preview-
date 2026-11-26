"""Le portefeuille d'offre, rendu en un bloc de prompt — construit UNE fois.

Addendum Stelya §17.1 : « Ce contexte est construit une fois par le
seller_context puis injecté de façon compacte dans Facts, Signals, Strategy,
Contacts, Organigramme, Discover, Copilote et Laura. Il ne doit pas être recopié
manuellement dans huit prompts divergents. »

C'est aussi la raison pour laquelle il n'y a PAS de nouvel objet « contexte de
domaine » ici : le prisme existe déjà (`domain_focus` + les packs), et un second
système de prisme aurait produit deux vérités possibles pour la même question.
Ce module ne fait qu'une chose — rendre ce que le PORTEFEUILLE ajoute, que le
pack ne sait pas : les secteurs visés, la politique de site et le lexique.

Trois règles d'honnêteté, toutes issues du retour bêta :

1. **Rien à dire ⇒ aucun bloc.** Un bloc « secteurs visés : (aucun) » se lit
   comme une contrainte alors qu'il énonce son absence.
2. **Le seuil de site est une PRÉFÉRENCE, pas une règle.** Le retour le dit en
   toutes lettres (« le seuil de 100 est une préférence Stelya, pas une règle
   universelle du produit ») : le bloc doit l'écrire, sinon un modèle écartera
   un site de 80 personnes qui était une bonne cible.
3. **Les termes interdits sont donnés AVEC leur remplacement.** Interdire sans
   proposer produit une paraphrase maladroite ; « ne dis pas ESN » sans « dis
   société de conseil en ingénierie » fait écrire « la société de services ».
"""

from __future__ import annotations

from typing import Any


def _clean(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(v).strip() for v in values if str(v or "").strip()]


def portfolio_context_block(profile_data: dict[str, Any] | None) -> str:
    """Le bloc à injecter, ou `""` quand le portefeuille ne dit rien."""
    context = (profile_data or {}).get("offerPortfolioContext")
    if not isinstance(context, dict) or not context:
        return ""

    lines: list[str] = []

    sectors = _clean(context.get("applicationSectors"))
    if sectors:
        lines.append(f"- Secteurs d'application visés : {', '.join(sectors)}.")

    site_types = _clean(context.get("siteTypes"))
    min_headcount = context.get("siteMinHeadcount")
    if site_types or isinstance(min_headcount, int):
        parts: list[str] = []
        if site_types:
            parts.append(f"types de site recherchés : {', '.join(site_types)}")
        if isinstance(min_headcount, int):
            parts.append(f"effectif SUR SITE d'au moins {min_headcount} personnes")
        lines.append(
            "- Politique de site (préférence de ce vendeur, PAS une règle absolue — "
            "un site en dessous du seuil reste recevable s'il porte un signal fort) : " + " ; ".join(parts) + "."
        )

    geographies = _clean(context.get("geographies"))
    if geographies:
        lines.append(f"- Zones de chasse déclarées : {', '.join(geographies)}.")

    forbidden = _clean(context.get("forbiddenTerms"))
    preferred = _clean(context.get("preferredTerms"))
    if forbidden or preferred:
        lexicon = []
        if forbidden:
            lexicon.append(f"n'emploie JAMAIS : {', '.join(forbidden)}")
        if preferred:
            lexicon.append(f"emploie plutôt : {', '.join(preferred)}")
        lines.append("- Vocabulaire imposé par ce vendeur — " + " ; ".join(lexicon) + ".")

    # Le lexique STRUCTURÉ (D17). Il dit ce que les deux listes ci-dessus ne
    # peuvent PAS dire : quel mot du produit chaque terme remplace. « Affaire »
    # seul ne dit pas qu'il remplace « Projet » — le modèle ne peut pas le
    # deviner, et l'interface, elle, le sait maintenant.
    #
    # C'est ce qui accorde la voix du copilote avec l'écran : sans lui, Laura
    # écrirait « ton besoin » à quelqu'un dont la navigation dit « Postes ».
    terms = context.get("lexiconTerms")
    if isinstance(terms, list) and terms:
        renamed = [
            f"« {entry['default']} » se dit « {entry['term']} »"
            for entry in terms
            if isinstance(entry, dict) and entry.get("default") and entry.get("term")
        ]
        if renamed:
            lines.append(
                "- Les objets du produit, nommés PAR CETTE ÉQUIPE (emploie ces mots-là, "
                "y compris quand tu cites un écran) : " + " ; ".join(renamed) + "."
            )

    if not lines:
        return ""

    return "\n\n===== PORTEFEUILLE D'OFFRE DU VENDEUR =====\n" + "\n".join(lines)
