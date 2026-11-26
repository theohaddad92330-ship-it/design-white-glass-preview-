"""Le vocabulaire de la mémoire marché — UN SEUL endroit (#1629.2).

Trois surfaces avaient chacune leur propre liste de mots interdits, légèrement
différente : l'évidence de l'axe CHEMIN (`discover_scoring._path_axis`,
`test_discover_scoring_path_axis.py` — "en place", "fournisseur actuel",
"travaille chez", "intervient chez"), la description de l'outil
`search_market_memory` (`test_copilote_prompt_blocks.py` — "en place",
"travaille actuellement", "est fournisseur", "recrute"), et le bloc « mémoire
structurelle » du prompt copilote (`bellum_advisor.py`). Trois listes qui se
recoupent aux trois quarts et divergent sur le reste, c'est exactement le
défaut que #1629.2 vise : rien ne tenait le vocabulaire sur le RESTE du
registre d'outils (`search_partners`, `get_territory_overview`, et le 4ᵉ bloc
du prompt d'analyse ajouté par #1590).

LA RÈGLE, telle que le retour la pose : une observation de parcours (mémoire
marché) ne prouve JAMAIS un fait ACTUEL. Le vocabulaire AUTORISÉ — observé,
affinité, environnement compatible, relation de parcours, à qualifier — décrit
une trace du passé agrégée. Le vocabulaire INTERDIT — est en place, travaille
actuellement, est fournisseur, recrute, et toute variante qui affirme un fait
présent à partir d'une observation passée — appartient à une source ACTUELLE
(une offre d'emploi datée, une déclaration humaine, un marché public attribué),
jamais à la mémoire marché.

⚠️ CE QUE CE MODULE NE FAIT PAS : il ne bannit ces mots NULLE PART dans le
produit — un titulaire de marché public EST en place (fait DECP daté), une ESN
DÉCLARÉE par le workspace EST en place (fait de première main), une offre
d'emploi dit qu'une entreprise RECRUTE (fait daté). L'interdit ne porte QUE sur
les surfaces qui parlent de mémoire marché — c'est `mentions_market_memory`
qui les repère, pas une interdiction globale.
"""

from __future__ import annotations

#: Un mot interdit se cherche à la LETTRE, jamais seulement en négation : une
#: phrase se lit hors contexte, la négation se perd à la relecture et le mot
#: reste (GA-259 documente déjà ce défaut pour le vocabulaire de couverture).
#: Union des trois listes préexistantes, sur la substring la plus INCLUSIVE de
#: chaque famille ("en place" plutôt que le seul "est en place" du retour :
#: elle attrape aussi "déjà en place", "encore en place").
MARKET_MEMORY_FORBIDDEN_WORDING: tuple[str, ...] = (
    "en place",
    "travaille actuellement",
    "travaille chez",
    "intervient chez",
    "est fournisseur",
    "fournisseur actuel",
    "recrute",
)

#: Le vocabulaire AUTORISÉ, tel que le retour le pose — documentation, pas une
#: liste que chaque bloc devrait cocher : un texte peut être conforme sans
#: utiliser tous ces mots.
MARKET_MEMORY_ALLOWED_WORDING: tuple[str, ...] = (
    "observé",
    "affinité",
    "environnement compatible",
    "relation de parcours",
    "à qualifier",
)

#: Ce qui identifie un texte comme parlant de mémoire marché — donc soumis au
#: vocabulaire ci-dessus. Volontairement ÉTROIT : "observation" seul attrape
#: aussi `get_capacity` (« sous son seuil d'observations », un échantillon
#: statistique sans rapport), ce que le premier essai de ce lot a mesuré avant
#: de resserrer sur "structurel"/"parcours observ"/"observées autour" — les
#: trois formes qui ne se lisent QUE dans un contexte de mémoire marché.
MARKET_MEMORY_SURFACE_INDICATORS: tuple[str, ...] = (
    "mémoire marché",
    "observation du marché",
    "observations du marché",
    "structurel",
    "parcours observ",
    "observées autour",
)


def mentions_market_memory(text: str) -> bool:
    """Ce texte parle-t-il de mémoire marché ? — la porte du vocabulaire."""
    low = text.lower()
    return any(indicator in low for indicator in MARKET_MEMORY_SURFACE_INDICATORS)


def market_memory_forbidden_hits(text: str) -> list[str]:
    """Les mots interdits RÉELLEMENT trouvés dans ``text`` (jamais une seule
    négation qui les efface — la lettre suffit à échouer, voir la doctrine du
    module)."""
    low = text.lower()
    return [word for word in MARKET_MEMORY_FORBIDDEN_WORDING if word in low]
