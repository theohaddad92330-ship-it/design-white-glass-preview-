"""Garde de doctrine sur le TEXTE RÉELLEMENT ENVOYÉ AU MODÈLE par le Profiler.

Instructor n'envoie pas ce fichier ni le prompt système : il envoie le schéma
JSON dérivé des modèles pydantic de ``app.models.profile_context`` (la docstring
du module le dit, et ``_generate`` passe ``response_model=ProfileContext``).
Le corpus de cette garde est donc ``ProfileContext.model_json_schema()`` — pas
une constante voisine, pas un commentaire, pas une docstring de test : ces
trois-là ne partent jamais chez le modèle, et une garde qui les lirait resterait
verte pendant que le prompt dérive.

Deux violations mesurées en production le 14/09/2026 sur ``/welcome`` motivent
ces quatre refus (#2069, entrée ``c26_probabilite`` du registre de doctrine) :
le modèle a écrit « la probabilité d'un besoin urgent », et il a produit des
noms d'entreprises depuis sa connaissance générale.
"""

from __future__ import annotations

import re

from app.models.profile_context import ProfileContext
from app.models.reply_blocks import _PROBABILITY_WORDING

# ---------------------------------------------------------------------------
# Le corpus : ce que le modèle lit vraiment.
# ---------------------------------------------------------------------------


def schema_descriptions() -> list[tuple[str, str]]:
    """(chemin, texte) de chaque ``description`` du schéma envoyé au modèle."""

    found: list[tuple[str, str]] = []

    def walk(node: object, path: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "description" and isinstance(value, str):
                    found.append((path, value))
                else:
                    walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for index, item in enumerate(node):
                walk(item, f"{path}[{index}]")

    walk(ProfileContext.model_json_schema(), "$")
    return found


# Un segment = une phrase. On coupe sur la ponctuation forte uniquement : la
# virgule sépare « ni probabilité, ni chance de signer », qui est UN interdit.
_SEGMENT = re.compile(r"[.;\n]")

# Un mot de refus dans le MÊME segment : la phrase NOMME l'interdit au lieu de
# commander la chose. Sans cette nuance, une garde rougit sur le texte qui la
# protège — c'est le piège de ce dépôt.
_REFUSAL = re.compile(
    r"\bjamais\b|\baucune?\b|\bni\b|\bpas\b|\binterdit\w*\b|\bsans\b|\bexclus?\b",
    re.IGNORECASE,
)


def matching_segments(text: str, pattern: re.Pattern[str]) -> list[str]:
    """Segments où ``pattern`` apparaît, refus compris.

    ``re.Pattern.search`` est sans état en Python (contrairement à un
    ``RegExp`` JS porteur du drapeau ``g``), donc l'appel en boucle est sûr.
    """

    return [segment.strip() for segment in _SEGMENT.split(text) if pattern.search(segment)]


def commanding_segments(text: str, pattern: re.Pattern[str]) -> list[str]:
    """Segments où ``pattern`` est COMMANDÉ, pas interdit.

    ⚠️ Ne s'applique qu'aux motifs qu'une phrase peut CITER pour les refuser
    (« ni probabilité », « pas le CAC40 »). Un marqueur d'exemple, lui, ne se
    cite pas : « Exemples : … » commande toujours, même dans une phrase qui
    interdit par ailleurs — mesuré, un cassage volontaire passait au vert.
    """

    return [segment for segment in matching_segments(text, pattern) if not _REFUSAL.search(segment)]


# ---------------------------------------------------------------------------
# Les champs qui PORTENT un nom d'entité réelle, et ceux qui parlent d'un score.
# ---------------------------------------------------------------------------

_ENTITY_NAME_PROP = re.compile(
    r"(company|account|organi[sz]ation|entity|person|contact)_?name$", re.IGNORECASE
)
_SCORE_PROP = re.compile(r"scor", re.IGNORECASE)


def _defs() -> dict[str, dict]:
    return ProfileContext.model_json_schema().get("$defs", {})


def entity_name_fields() -> list[tuple[str, dict]]:
    """Champs qui portent un nom d'entité, ET les tableaux qui les contiennent."""

    defs = _defs()
    fields: list[tuple[str, dict]] = []
    for def_name, definition in defs.items():
        properties = definition.get("properties") or {}
        names = [p for p in properties if _ENTITY_NAME_PROP.search(p)]
        for prop in names:
            fields.append((f"{def_name}.{prop}", properties[prop]))
        if not names:
            continue
        # Le tableau qui référence cette définition commande lui aussi des noms.
        for holder_name, holder in defs.items():
            for prop, schema in (holder.get("properties") or {}).items():
                ref = (schema.get("items") or {}).get("$ref", "")
                if ref.rsplit("/", 1)[-1] == def_name:
                    fields.append((f"{holder_name}.{prop}", schema))
    return fields


def score_fields() -> list[tuple[str, dict]]:
    fields: list[tuple[str, dict]] = []
    for def_name, definition in _defs().items():
        for prop, schema in (definition.get("properties") or {}).items():
            if _SCORE_PROP.search(prop):
                fields.append((f"{def_name}.{prop}", schema))
    return fields


# ---------------------------------------------------------------------------
# Preuve n°2 : la garde LIT quelque chose.
# ---------------------------------------------------------------------------


def test_le_corpus_nest_pas_vide():
    descriptions = schema_descriptions()
    assert len(descriptions) >= 30, f"corpus ridicule : {len(descriptions)} descriptions"
    assert any("Le scoring évaluera" in text for _, text in descriptions)
    assert entity_name_fields(), "aucun champ porteur de nom d'entité trouvé"
    assert len(score_fields()) >= 2, score_fields()


# ---------------------------------------------------------------------------
# Refus n°1 et n°2 : la probabilité.
# ---------------------------------------------------------------------------


def test_aucune_description_ne_commande_une_probabilite():
    """Refus n°1 — le schéma ne demande JAMAIS une probabilité (c26_probabilite)."""

    offenders = [
        (path, segment)
        for path, text in schema_descriptions()
        for segment in commanding_segments(text, _PROBABILITY_WORDING)
    ]
    assert offenders == [], offenders


def test_un_champ_qui_parle_de_score_nomme_linterdit_de_probabilite():
    """Refus n°2 — l'ABSENCE de l'interdit est ce qui a cédé le 14/09 (#2069).

    Un champ qui commande une phrase libre sur un score doit porter l'interdit,
    et le porter comme un refus : le mot doit apparaître dans un segment de
    refus, jamais dans un segment qui le commande.
    """

    manquants = []
    for path, schema in score_fields():
        text = schema.get("description") or ""
        if not _PROBABILITY_WORDING.search(text):
            manquants.append(path)
    assert manquants == [], manquants


# ---------------------------------------------------------------------------
# Refus n°3 et n°4 : les noms d'entreprises produits par le modèle.
# ---------------------------------------------------------------------------

# Un indice ou un registre de notoriété désigné comme SOURCE de noms : c'est la
# connaissance générale du modèle, pas la mémoire marché (#2069).
_NOTORIETY_REGISTER = re.compile(
    r"CAC\s?-?\s?40|SBF\s?-?\s?120|Fortune\s?500|Euronext|FTSE|S&P\s?\d|Nasdaq", re.IGNORECASE
)

# Une valeur d'exemple dans un champ QUI NOMME est une invitation à inventer.
# ⚠️ On vise le MARQUEUR d'exemple, jamais le littéral entre quotes : en
# français l'apostrophe d'élision (« d'une entreprise ») ouvre et ferme une
# fausse citation, et une condition (« si target='Grand compte' ») n'est pas un
# exemple de nom. Une garde trop gourmande ne protège plus, elle bloque.
_EXAMPLE_VALUE = re.compile(r"exemples?\s*:|\bex\b\s*:|par exemple", re.IGNORECASE)


def test_un_champ_qui_nomme_ne_pointe_aucun_registre_de_notoriete():
    """Refus n°3 — pas d'indice boursier comme source de noms."""

    offenders = [
        (path, segment)
        for path, schema in entity_name_fields()
        for segment in commanding_segments(schema.get("description") or "", _NOTORIETY_REGISTER)
    ]
    assert offenders == [], offenders


def test_un_champ_qui_nomme_ne_porte_aucune_valeur_dexemple():
    """Refus n°4 — « Exemples : 'Doctolib' » est une consigne d'invention."""

    offenders = [
        (path, segment)
        for path, schema in entity_name_fields()
        for segment in matching_segments(schema.get("description") or "", _EXAMPLE_VALUE)
    ]
    assert offenders == [], offenders


def test_aucun_nom_dentite_nest_exige_par_le_schema():
    """Refus n°5 — un tableau de noms OBLIGATOIRE force l'invention.

    Sans compte réel dans le contexte, ``minItems: 3`` ne laisse au modèle
    aucune issue honnête. Le schéma doit accepter zéro : on ne nomme rien, et
    on le dit.
    """

    exiges = [
        (path, schema.get("minItems"))
        for path, schema in entity_name_fields()
        if schema.get("type") == "array" and (schema.get("minItems") or 0) > 0
    ]
    assert exiges == [], exiges


# ---------------------------------------------------------------------------
# Preuve n°3 : la garde n'attrape pas ce qu'elle ne vise pas.
# ---------------------------------------------------------------------------


def test_temoin_les_cas_legitimes_voisins_passent():
    """Témoins : chacun est un texte qu'on a le DROIT d'envoyer au modèle."""

    # a) L'interdit lui-même — le mot « probabilité » dans une phrase qui le refuse.
    interdit = (
        "AUCUNE PROBABILITÉ. Ni probabilité, ni chance de signer, ni pourcentage "
        "de réussite : le score se dit par ses axes."
    )
    assert commanding_segments(interdit, _PROBABILITY_WORDING) == []

    # b) Un taux MESURÉ reste une observation (bellum_advisor.py:401).
    mesure = "Cite le taux de transformation mesuré sur les affaires closes."
    assert commanding_segments(mesure, _PROBABILITY_WORDING) == []

    # c) 'CAC40 / SBF120' comme VALEUR D'ENTRÉE de target_company_types : c'est
    #    une réponse de l'utilisateur, pas une source de noms. Le champ n'est
    #    pas un champ qui nomme, donc il n'est pas scanné.
    tailles = [path for path, _ in entity_name_fields()]
    assert not any("IdealAccountProfile.size" in path for path in tailles), tailles

    # d) Les exemples restent LIBRES partout ailleurs (secteur, ton, fonctions).
    descriptions = dict(schema_descriptions())
    exemples_ailleurs = [
        path for path, text in descriptions.items() if _EXAMPLE_VALUE.search(text)
    ]  # ces champs-là ne nomment personne : leurs exemples ne sont pas scannés
    assert len(exemples_ailleurs) >= 5, exemples_ailleurs

    # e) L'apostrophe d'élision et une condition sur une valeur d'entrée ne sont
    #    pas des exemples de noms : la garde n°4 doit les laisser passer.
    assert matching_segments("Nom d'une entreprise de l'ESN", _EXAMPLE_VALUE) == []
    assert matching_segments("Retenu si target='Grand compte'", _EXAMPLE_VALUE) == []


def test_la_garde_sait_dire_non():
    """Preuve n°1, gardée en dur : chaque refus rougit sur le texte fautif réel."""

    # Le texte mesuré en production le 14/09 sur /welcome.
    assert commanding_segments(
        "Cite la probabilité d'un besoin urgent en Data/Cloud.", _PROBABILITY_WORDING
    )
    # Le texte du schéma avant correction (profile_context.py:428-431).
    assert commanding_segments(
        "Privilégie des noms français bien connus (CAC40 / SBF120 si target grand compte).",
        _NOTORIETY_REGISTER,
    )
    assert matching_segments(
        "Exemples : 'Société Générale', 'Doctolib', 'Saint-Gobain'.", _EXAMPLE_VALUE
    )
    # ... y compris collé à une phrase de refus : c'est le faux vert mesuré.
    assert matching_segments(
        "Tu n'inventes jamais un nom. Exemples : Doctolib, Saint-Gobain", _EXAMPLE_VALUE
    )
