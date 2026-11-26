"""#3222.2 (#3197) — LE CORPUS DES CINQ GROUPES DE COMPTES de l'éval commerciale.

#3197 (LAU-FINAL-203) demande un corpus de questions réelles sur cinq groupes de
comptes : Société Générale, Décathlon/Accor, Vinci, industrie, reverse market.
Ce fichier verse les scénarios dont la RÈGLE est ÉCRITE dans le prompt copilote
ou dans la description d'un outil — même patron que
`test_copilote_market_memory_eval.py`, dont il reprend la forme : zéro appel
modèle, zéro coût, un fragment de règle que le texte visé doit RÉELLEMENT
contenir (la garde lit le texte, elle ne croit pas le fichier).

─────────────────────────────────────────────────────────────────────────────
LOT X17 (02/10) — LES QUATRE POINTS QUI MANQUAIENT DE RÈGLE ONT MAINTENANT LA LEUR
─────────────────────────────────────────────────────────────────────────────
« Seulement en interne / contacts actuels », organisation centralisée /
décentralisée / hybride, exclusion BTP / pas de top management, profil avec
référence bancaire / consultant ex-groupe : la règle est écrite dans
`_BLOCK_ACCOUNT_REQUEST_SHAPES` (`app/prompts/bellum_advisor.py`) — des limites
de ce que Laura avance, aucune capacité neuve — et les huit scénarios `sg-*`,
`decathlon-*`, `accor-*` et `vinci-*` ajoutés en fin de liste la lisent.
Reste hors de ce fichier : l'évaluation humaine par profils nommés (protocole
opérationnel, `agent_docs/methode-revue-humaine-metier.md`).
"""

from __future__ import annotations

from typing import NamedTuple

from app.prompts.bellum_advisor import build_system_prompt
from app.services import chat_tools
from tests.copilote_scenario_metadata import (
    Action,
    Categorie,
    JamaisInventer,
    Meta,
    Moment,
    Nature,
    Objet,
    Recette1945,
)

PROMPT = build_system_prompt({}, {}, "", "")


def _tool(name: str) -> dict:
    return next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)


class FiveAccountsScenario(NamedTuple):
    name: str
    #: La question TELLE QU'UN COMMERCIAL LA POSE.
    question: str
    #: Morceaux de texte que la règle visée (outil, sinon prompt) doit contenir.
    fragments: tuple[str, ...]
    #: L'outil qui porte la règle ; `None` = un bloc du prompt copilote.
    tool: str | None
    meta: Meta


FIVE_ACCOUNTS_SCENARIOS: tuple[FiveAccountsScenario, ...] = (
    # ── 1. Société Générale ────────────────────────────────────────────────
    FiveAccountsScenario(
        "sg-sans-reference-bancaire",
        "Je n'ai aucune référence bancaire : comment j'entre chez la Société Générale ?",
        ("ne suppose JAMAIS un référencement qui n'est pas prouvé",),
        tool=None,
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    FiveAccountsScenario(
        "sg-par-quelle-filiale",
        "Par quelle filiale du groupe Société Générale je peux attaquer ?",
        ("filiales ou sites classés par facilité d'entrée", "JAMAIS que l'entrée"),
        tool="get_account_access",
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.COUT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    FiveAccountsScenario(
        "sg-partenaire-reference",
        "Un partenaire est référencé chez Société Générale : je peux passer par lui ?",
        ("passer par elle", "n'a PAS automatiquement une présence actuelle"),
        tool="get_esn_on_account",
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.PARTENAIRE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    FiveAccountsScenario(
        "sg-relation-interne-connue",
        "J'ai un ancien collègue chez Société Générale : je le réactive ?",
        ("à qui je pourrais réécrire cette semaine", "ont demandé à ne plus être contactées"),
        tool="search_dormant_network",
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.AUTORISATION,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    FiveAccountsScenario(
        "sg-les-autres-filiales",
        "Et les autres filiales ?",
        ("« Et les autres filiales ? » revient au périmètre ENTIER",),
        tool=None,
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.PERIMETRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── 2. Décathlon / Accor ───────────────────────────────────────────────
    FiveAccountsScenario(
        "decathlon-nomination-recente",
        "Décathlon vient de nommer un directeur data : ça change quelque chose pour nous ?",
        ("nomination, projet annoncé",),
        tool=None,
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    FiveAccountsScenario(
        "accor-bon-responsable",
        "Chez Accor, je commence par qui côté data ?",
        ("pas de dirigeant par défaut", "responsable applicatif"),
        tool=None,
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.IDENTITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── 3. Vinci ───────────────────────────────────────────────────────────
    FiveAccountsScenario(
        "vinci-energies-sans-btp",
        "Je cible Vinci Energies, pas le BTP : tu gardes ça pour la suite ?",
        ("Un critère déjà exclu ne se réintroduit jamais",),
        tool=None,
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.PERIMETRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── 4. Industrie ───────────────────────────────────────────────────────
    FiveAccountsScenario(
        "industrie-site-et-interlocuteur-local",
        "Je vends de l'automatisme : quel site du groupe, et quel interlocuteur local ?",
        ("assez proche du terrain pour qualifier le besoin",),
        tool=None,
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.IDENTITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── 5. Reverse market ──────────────────────────────────────────────────
    FiveAccountsScenario(
        "reverse-java-lyon",
        "J'ai un consultant Java disponible à Lyon : chez qui je le positionne ?",
        ("technology", "location"),
        tool="search_market_memory",
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            secondaires=(Categorie.DECOUVRIR,),
            objets=(Objet.CONSULTANT, Objet.OBSERVATION_MARCHE),
            page="/consultants/$id/reverse-market",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.CONSULTANT_DISPONIBLE,),
        ),
    ),
    FiveAccountsScenario(
        "reverse-cyber-besoin-confirme",
        "J'ai un consultant Cyber dispo : quels comptes ont un besoin confirmé ?",
        ("une observation seule ne suffit pas", "vérification fraîche et payante"),
        tool=None,
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.BESOIN),
            page="/consultants/$id/reverse-market",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.CONSULTANT_DISPONIBLE,),
        ),
    ),
    FiveAccountsScenario(
        "reverse-besoin-ou-compatibilite-passee",
        "Ce compte a un besoin confirmé ou seulement une compatibilité passée ?",
        ("Cela montre une compatibilité passée, pas un besoin actuel.",),
        tool=None,
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.OBSERVATION_MARCHE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.OBSERVATION_HISTORIQUE,),
        ),
    ),
    FiveAccountsScenario(
        "sg-seulement-en-interne",
        "Regarde chez Société Générale, mais seulement en interne.",
        ("n'appelles aucune recherche publique",),
        tool=None,
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.PERIMETRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    FiveAccountsScenario(
        "sg-contacts-actuels-seulement",
        "Donne-moi seulement les contacts actuels chez Société Générale.",
        ("reste « à vérifier », jamais un contact en poste",),
        tool=None,
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    FiveAccountsScenario(
        "sg-profil-avec-reference-bancaire",
        "J'ai une référence bancaire : on l'utilise pour entrer chez Société Générale ?",
        ("ne le déduis jamais d'un nom ni d'un CV entendu une fois", "non renseigné"),
        tool=None,
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    FiveAccountsScenario(
        "sg-consultant-ex-groupe",
        "Mon consultant a travaillé au groupe Société Générale : ça nous donne un lien ?",
        ("un passage dans le groupe n'est jamais un lien actuel",),
        tool=None,
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CONSULTANT),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    FiveAccountsScenario(
        "decathlon-organisation-centralisee",
        "Chez Décathlon, les achats IT sont centralisés ou par pays : je vise où ?",
        ("Centralisée, décentralisée ou hybride", "organisation non établie"),
        tool=None,
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    FiveAccountsScenario(
        "accor-organisation-hybride",
        "Accor, c'est une organisation hybride : j'entre par le groupe ou par la marque ?",
        ("si hybride",),
        tool=None,
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.PERIMETRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    FiveAccountsScenario(
        "vinci-exclusion-btp-portee-suite",
        "Pas le BTP chez Vinci : redonne-moi la liste de contacts.",
        ("« Pas le BTP »", "TOUTE la suite du fil"),
        tool=None,
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.PERIMETRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    FiveAccountsScenario(
        "vinci-pas-de-top-management",
        "Chez Vinci Energies, pas de top management : qui j'approche ?",
        ("pas de comité exécutif ni de direction générale", "interlocuteurs opérationnels"),
        tool=None,
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.IDENTITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    FiveAccountsScenario(
        "vinci-compte-absent-de-lespace",
        "Pas de top management chez Vinci Energies, qui j'approche ? (aucune fiche dans l'espace)",
        (
            "COMPTE SANS FICHE DANS L'ESPACE",
            "FAMILLES de rôles opérationnels",
            "tu ne nommes aucun individu sans source",
            "`plan_account_analysis` sur l'entité NOMMÉE",
        ),
        tool=None,
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/chat",
            jamais_inventer=(JamaisInventer.IDENTITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
)


def test_the_five_account_groups_are_all_represented() -> None:
    groups = {scenario.name.split("-")[0] for scenario in FIVE_ACCOUNTS_SCENARIOS}
    assert groups == {"sg", "decathlon", "accor", "vinci", "industrie", "reverse"}
    assert len(FIVE_ACCOUNTS_SCENARIOS) == 21
    names = [scenario.name for scenario in FIVE_ACCOUNTS_SCENARIOS]
    assert len(names) == len(set(names))


def test_each_scenario_documents_a_real_written_rule() -> None:
    """Chaque fragment existe RÉELLEMENT dans le texte visé — l'outil déclaré
    (description ET champs d'entrée) ou, sans outil, le prompt copilote."""
    for scenario in FIVE_ACCOUNTS_SCENARIOS:
        if scenario.tool is None:
            visible = PROMPT
        else:
            tool = _tool(scenario.tool)
            visible = str(tool["description"]) + " " + " ".join(tool["input_schema"]["properties"])
        for fragment in scenario.fragments:
            assert (
                fragment in visible
            ), f"{scenario.name} : « {fragment} » introuvable dans {scenario.tool or 'le prompt'}"


def test_the_rule_guard_knows_how_to_say_no() -> None:
    """Une garde qui ne sait pas dire NON est verte pour toujours."""
    assert "règle inventée pour occuper la case" not in PROMPT
    assert "règle inventée pour occuper la case" not in str(_tool("get_account_access")["description"])
