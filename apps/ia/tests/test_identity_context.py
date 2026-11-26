"""#2259.4 / #2259.6 / #2259.11 / #2259.13 — IDENTITÉ ET ENTOURAGE DE LA PERSONNE.

Bloc NEUF (jamais un ajout dans ``bellum_advisor.py``, édité par un autre lot en
ce moment) : nom de famille, fonction dans l'espace, qualité de propriétaire du
compte, collègue cité dans le message. Chaque ligne n'apparaît QUE si la donnée
existe réellement (jamais devinée) — même contrat que le bloc ``first_name``
voisin : absent ⇒ pas de ligne, jamais une valeur inventée.
"""

from __future__ import annotations

from app.prompts.identity_context import identity_context_block


def test_empty_when_nothing_known() -> None:
    # #2259.11/.4/.13/.6 — rien de connu ⇒ chaîne vide, prompt byte-identique.
    assert identity_context_block() == ""
    assert (
        identity_context_block(last_name="", workspace_role="", is_account_owner=False, mentioned_colleague="") == ""
    )


def test_last_name_line_only_when_present() -> None:
    # #2259.11 — le nom de famille, lu sur le profil, jamais deviné.
    block = identity_context_block(last_name="Bénard")
    assert "Bénard" in block
    assert "Nom de famille" in block


def test_workspace_role_is_labeled_in_french_not_raw_rbac_value() -> None:
    # #2259.13 — la fonction commerciale réelle n'existe pas comme champ à part :
    # le rôle RBAC (sales/sales_ops/tech_admin/...) est le meilleur signal
    # RÉEL, jamais inventé au-delà. Rendu en clair, pas la valeur brute.
    block = identity_context_block(workspace_role="sales_ops")
    assert "sales_ops" not in block
    assert "sales ops" in block.lower() or "commercial" in block.lower()


def test_unknown_role_falls_back_to_raw_value_never_invented() -> None:
    # Une valeur de rôle non reconnue s'affiche telle quelle plutôt que de
    # disparaître silencieusement (doctrine : jamais deviné, jamais 0 muet).
    block = identity_context_block(workspace_role="futur_role_inconnu")
    assert "futur_role_inconnu" in block


def test_account_owner_flag_names_the_capacity_not_a_guessed_title() -> None:
    # #2259.4 — « propriétaire du compte » est ce que la donnée dit RÉELLEMENT ;
    # jamais promu en « dirigeant » (#2259.5, non modélisé, resté retenu).
    block = identity_context_block(is_account_owner=True)
    assert "propriétaire" in block.lower()
    assert "dirigeant" not in block.lower()


def test_no_owner_line_when_flag_is_false() -> None:
    block = identity_context_block(is_account_owner=False)
    assert "propriétaire" not in block.lower()


def test_mentioned_colleague_line_names_them_as_a_colleague() -> None:
    # #2259.6 — un collègue cité dans le message n'est pas un contact externe.
    block = identity_context_block(mentioned_colleague="Théo")
    assert "Théo" in block
    assert "collègue" in block.lower()


def test_combines_all_known_fields_on_separate_lines() -> None:
    block = identity_context_block(
        last_name="Lorquin",
        workspace_role="owner",
        is_account_owner=True,
        mentioned_colleague="Sophie",
    )
    assert "Lorquin" in block
    assert "Sophie" in block
    assert "propriétaire" in block.lower()


# #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — DÉCISION Louis
# 17/09 après-midi : la BU sert de CONTEXTE à Laura (prioriser, formuler),
# elle ne filtre RIEN de ce que Laura voit.


def test_no_bu_line_when_nothing_is_ported() -> None:
    # Propriétaire sans BU (`perimetersOf` rend []) : rien n'est dit.
    assert identity_context_block(business_units=[]) == ""
    assert identity_context_block(business_units=None) == ""


def test_bu_block_names_what_the_workspace_knows() -> None:
    block = identity_context_block(
        business_units=[
            {
                "name": "Agence Lyon",
                "territory": "Auvergne-Rhône-Alpes",
                "specialties": ["Java", "Cloud"],
                "capacity": None,
                "quarter_objective": None,
                "account_count": 12,
                "consultant_count": None,
                "reference_count": None,
            }
        ]
    )
    assert "Agence Lyon" in block
    assert "Auvergne-Rhône-Alpes" in block
    assert "Java, Cloud" in block
    assert "12" in block
    # #2259.35 — capacité et objectif du trimestre : la colonne n'existe pas
    # encore sur cette base (lot CP2, autre branche) ⇒ jamais 0, jamais deviné.
    assert "non renseigné" in block


def test_bu_block_never_shows_zero_for_what_the_schema_cannot_link() -> None:
    # #2259.33 / #2259.34 — aucun rattachement BU n'existe pour les consultants
    # ni les références dans le schéma actuel : « non renseigné », jamais 0.
    block = identity_context_block(
        business_units=[
            {
                "name": "Agence Lyon",
                "territory": None,
                "specialties": [],
                "capacity": None,
                "quarter_objective": None,
                "account_count": 0,
                "consultant_count": None,
                "reference_count": None,
            }
        ]
    )
    # Un compte RÉELLEMENT nul (account_count=0) est un fait mesuré, il s'affiche.
    assert "comptes rattachés : 0" in block
    assert "consultants rattachés : non renseigné" in block
    assert "références rattachées : non renseigné" in block


def test_bu_block_instructs_to_prioritise_never_to_hide() -> None:
    block = identity_context_block(
        business_units=[{"name": "Agence Lyon", "territory": None, "specialties": []}]
    )
    assert "prioriser" in block.lower()
    assert "hors de ce périmètre" in block.lower() or "hors" in block.lower()


def test_bu_block_lists_several_business_units() -> None:
    block = identity_context_block(
        business_units=[
            {"name": "Agence Lyon", "territory": None, "specialties": []},
            {"name": "Agence Nantes", "territory": None, "specialties": []},
        ]
    )
    assert "Agence Lyon" in block
    assert "Agence Nantes" in block
