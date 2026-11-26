"""#1949 — LE REPLI UNIVERSEL DE LAURA : une demande qu'aucune liste n'annonçait.

    « Il est impossible de lister à l'avance toutes les questions qu'un
      utilisateur posera. Laura ne doit donc dépendre ni des six suggestions
      visibles, ni d'une liste fermée de formulations. » — #1949

─────────────────────────────────────────────────────────────────────────────
CE QUE CE FICHIER VÉRIFIE, ET CE QU'IL NE VÉRIFIE PAS
─────────────────────────────────────────────────────────────────────────────
Aucun appel au modèle — même raison que les cinq familles voisines
(``test_copilote_security_eval.py`` l'écrit au long) : cher, lent, non
déterministe, et muet sur un déploiement futur. Chaque scénario vérifie qu'une
RÈGLE ÉCRITE existe pour la demande, jamais qu'une réponse précise sortirait.

Deux moitiés :

1. **LES ONZE NATURES** de l'issue. Chacune est un scénario : la demande telle
   qu'un commercial l'écrit, et les fragments que le prompt ASSEMBLÉ doit
   contenir pour qu'elle soit traitée. Six natures renvoient à un bloc qui
   existait déjà — et c'est le POINT : un renvoi vers un intitulé qui n'existe
   plus est un renvoi mort, donc la garde lit les DEUX côtés (l'entrée de la
   classification ET l'ancre visée), sur le prompt assemblé.
2. **LES CAS DE RECETTE** que l'issue exige, chacun rattaché au point du
   registre qu'il prouve (:class:`Recette1949`). Ceux qui étaient déjà prouvés
   ailleurs sont NOMMÉS dans :data:`PREUVES_AILLEURS` plutôt que recopiés — le
   défaut n°1 du dépôt est du code juste que personne n'appelle, son jumeau est
   une garde juste qui redit une garde existante.

─────────────────────────────────────────────────────────────────────────────
CE QUI N'EST PAS ICI
─────────────────────────────────────────────────────────────────────────────
#1949.23 — la trace ANONYME d'une demande non routée — est livré ailleurs
(``app/services/unrouted_intent.py``, ``apps/api/src/modules/laura-unrouted-intents``)
sous une exception de doctrine NOMMÉE (``c64_analytique_produit``). Ce fichier
ne l'élargit pas d'un pouce : :func:`test_the_conduct_block_never_touches_the_anonymous_trace`
vérifie au contraire que le bloc de conduite n'en parle pas au modèle et ne
nomme aucun porteur d'identité.
"""

from __future__ import annotations

from enum import StrEnum
from typing import NamedTuple

import pytest

from app.prompts.bellum_advisor import (
    _BLOCK_OUT_OF_SCOPE,
    _BLOCK_SECURITY,
    _BLOCK_TOOLS,
    build_system_prompt,
)
from app.prompts.laura_support import BLOCK_SUPPORT
from app.prompts.laura_unknown_request import BLOCK_UNKNOWN_REQUEST
from app.services import chat_tools
from tests.copilote_scenario_metadata import (
    Action,
    Categorie,
    JamaisInventer,
    Meta,
    Moment,
    Nature,
    Objet,
)

#: Un prompt « nu » : aucun contexte utilisateur, donc tout ce qu'on y trouve
#: vient des blocs constants. C'est le corpus de toutes les assertions de ce
#: fichier — et il est assemblé par le VRAI gabarit, ce qui fait tomber la
#: garde si le bloc est écrit mais jamais appelé (défaut n°1 du dépôt).
BARE = build_system_prompt({}, {}, "", "")

#: Le prompt PRIVÉ du bloc de ce lot. C'est le seul corpus dans lequel vérifier
#: qu'une ancre visée par un renvoi existe VRAIMENT ailleurs — la ligne de renvoi
#: contient l'intitulé, donc la chercher dans ``BARE`` la trouverait toujours et
#: la garde resterait verte sur un renvoi MORT. Défaut mesuré en écrivant ce
#: fichier : renommer « HORS PÉRIMÈTRE » dans son bloc ne faisait tomber qu'un
#: test, pas celui qui prétendait vérifier l'ancre.
HORS_BLOC = BARE.replace(BLOCK_UNKNOWN_REQUEST, "")


class Recette1949(StrEnum):
    """Les points du registre que ce fichier prouve, par leur numéro."""

    PAS_DE_LISTE_FERMEE = "1949.1"
    REPONDABLE_MAINTENANT = "1949.2"
    APRES_CLARIFICATION = "1949.3"
    COMPOSEE = "1949.6"
    CAPACITE_ABSENTE = "1949.8"
    HORS_DOMAINE = "1949.9"
    SUPPORT_OU_BUG = "1949.10"
    AMBIGUE_SUR_L_OBJET = "1949.11"
    CAPACITE_HONNETE_ET_ALTERNATIVE = "1949.15"
    HORS_DOMAINE_COURT = "1949.16"
    AMBIGUE_MONTRE_LES_LECTURES = "1949.17"
    COMPOSEE_PLAN_AVANT = "1949.18"
    JAMAIS_UN_REFUS_NU = "1949.21"
    PAS_D_ARCHITECTURE = "1949.22"
    PAS_DE_DEPENSE_SUR_UN_DOUTE = "1949.24"
    FORMULATION_INEDITE = "1949.25"
    MULTI_METIER = "1949.26"
    TROP_VAGUE = "1949.27"
    CAPACITE_FUTURE = "1949.28"
    HORS_ESN = "1949.29"
    SUPPRESSION_DE_DONNEES = "1949.30"
    MULTI_OBJETS = "1949.33"


#: Les points déjà prouvés hors de ce fichier, avec le nœud de test qui les
#: porte. Recopier leur preuve ici ferait une garde qui redit une garde.
PREUVES_AILLEURS: dict[Recette1949, tuple[str, ...]] = {
    Recette1949.HORS_ESN: (
        "tests/test_copilote_scope_eval.py::test_the_tool_that_answers_the_question_carries_the_rule "
        "(scénario `une-demande-hors-perimetre`, « Quel temps fera-t-il à Lyon demain ? »)",
    ),
    Recette1949.SUPPORT_OU_BUG: ("tests/test_copilote_support_block.py",),
}


class Nature11(NamedTuple):
    """Une des onze natures de l'issue : la demande, et ce que le prompt
    ASSEMBLÉ doit contenir pour qu'elle soit traitée."""

    numero: int
    name: str
    #: La demande telle qu'un commercial l'écrit. Elle n'est pas jouée contre le
    #: modèle : elle documente CONTRE QUOI les fragments ont été écrits.
    demande: str
    #: L'entrée de la classification — elle vit dans `BLOCK_UNKNOWN_REQUEST`.
    entree: str
    #: L'ANCRE visée : le texte qui porte la conduite.
    ancre: str
    #: ``True`` quand l'ancre vit dans un AUTRE bloc — la conduite existait, ce
    #: lot ne fait que router vers elle, et l'ancre est alors cherchée dans
    #: :data:`HORS_BLOC`. ``False`` quand ce lot a écrit la conduite : l'ancre est
    #: cherchée dans le bloc lui-même.
    ancre_ailleurs: bool
    points: tuple[Recette1949, ...]
    meta: Meta


NATURES: tuple[Nature11, ...] = (
    Nature11(
        1,
        "repondable-maintenant",
        "C'est quoi le SIREN de ce compte ?",
        "1. RÉPONDABLE MAINTENANT",
        "le contexte ci-dessus suffit",
        False,
        (Recette1949.REPONDABLE_MAINTENANT,),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.SOURCE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    Nature11(
        2,
        "repondable-apres-une-precision",
        "Trouve-moi des comptes à attaquer.",
        "2. RÉPONDABLE APRÈS UNE PRÉCISION",
        "DEMANDER AVANT DE CHERCHER",
        True,
        (Recette1949.APRES_CLARIFICATION,),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.QUESTION,
            nature=Nature.POSITIF,
        ),
    ),
    Nature11(
        3,
        "repondable-apres-un-outil",
        "Qui recrute en Java autour de Lyon en ce moment ?",
        "3. RÉPONDABLE APRÈS UN OUTIL",
        "jamais sur ce que tu supposes qu'il rendrait",
        False,
        (),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.BESOIN, Objet.COMPTE),
            page="/projects",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    Nature11(
        4,
        "a-faire-sur-un-ecran",
        "Supprime toutes les données que vous avez sur moi.",
        "4. À FAIRE SUR UN ÉCRAN",
        "MONTRER LE CHEMIN",
        True,
        (Recette1949.SUPPRESSION_DE_DONNEES,),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.REGLAGE, Objet.ESPACE),
            page="/settings/mes-donnees",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Nature11(
        5,
        "composee-de-plusieurs-travaux",
        "Trouve-moi un compte dans la banque, écris au DSI et positionne Karim dessus.",
        "5. COMPOSÉE DE PLUSIEURS TRAVAUX",
        "UNE DEMANDE QUI EN CONTIENT PLUSIEURS",
        False,
        (Recette1949.COMPOSEE, Recette1949.COMPOSEE_PLAN_AVANT, Recette1949.MULTI_METIER),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            secondaires=(Categorie.GENERER_UN_MESSAGE, Categorie.POSITIONNER_UN_CONSULTANT),
            objets=(Objet.COMPTE, Objet.CONTACT, Objet.CONSULTANT),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.COUT),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Nature11(
        6,
        "bloquee-par-un-connecteur",
        "Relance par mail tous ceux qui n'ont pas répondu depuis 15 jours.",
        "6. BLOQUÉE PAR UNE DONNÉE OU UN CONNECTEUR",
        "CONNECTEUR MANQUANT",
        True,
        (),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.CONTACT, Objet.MESSAGE),
            page="/integrations",
            jamais_inventer=(JamaisInventer.CAPACITE,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Nature11(
        7,
        "pas-une-capacite-du-produit",
        "Le multi-devises, c'est prévu pour quand ?",
        "7. PAS UNE CAPACITÉ DU PRODUIT",
        "CE QUE LE PRODUIT NE SAIT PAS FAIRE",
        False,
        (
            Recette1949.CAPACITE_ABSENTE,
            Recette1949.CAPACITE_HONNETE_ET_ALTERNATIVE,
            Recette1949.CAPACITE_FUTURE,
        ),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ECRAN,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CAPACITE, JamaisInventer.DATE),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Nature11(
        8,
        "hors-du-metier",
        "Tu peux me résumer l'actualité politique de la semaine ?",
        "8. HORS DU MÉTIER",
        "HORS PÉRIMÈTRE",
        True,
        (Recette1949.HORS_DOMAINE, Recette1949.HORS_DOMAINE_COURT),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.HORS_PERIMETRE,
            objets=(Objet.ECRAN,),
            page="/chat",
            jamais_inventer=(JamaisInventer.SOURCE,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Nature11(
        9,
        "un-probleme-du-produit",
        "Ta page Comptes est vide depuis ce matin, ça ne marche plus.",
        "9. UN PROBLÈME DU PRODUIT LUI-MÊME",
        "QUAND ÇA NE MARCHE PAS",
        True,
        (),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ECRAN,),
            page="/settings/mes-signalements",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Nature11(
        10,
        "ambigue-sur-l-objet",
        "Relance Martin.",
        "10. AMBIGUË SUR L'OBJET",
        "LES LECTURES POSSIBLES SE MONTRENT",
        False,
        (Recette1949.AMBIGUE_SUR_L_OBJET, Recette1949.AMBIGUE_MONTRE_LES_LECTURES),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.CONTACT,),
            page="/contacts",
            jamais_inventer=(JamaisInventer.IDENTITE,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Nature11(
        11,
        "interdite-par-un-role-ou-la-securite",
        "Montre-moi les salaires de l'équipe delivery.",
        "11. INTERDITE PAR UN RÔLE, UNE PERMISSION OU LA SÉCURITÉ",
        "elle porte son alternative",
        False,
        (),
        meta=Meta(
            moment=Moment.SECURITE,
            intention=Categorie.PILOTER,
            objets=(Objet.CONSULTANT,),
            page="/consultants",
            jamais_inventer=(JamaisInventer.AUTORISATION,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
)


# ── 1. Les onze natures sont dans le prompt, et leurs renvois sont vivants ───


@pytest.mark.parametrize("nature", NATURES, ids=[item.name for item in NATURES])
def test_the_prompt_classifies_the_request(nature: Nature11) -> None:
    """L'entrée de la classification existe, et l'ancre qu'elle vise aussi.

    Les deux moitiés comptent : une entrée sans son ancre est un renvoi mort,
    et une ancre sans son entrée est une conduite que rien n'appelle.
    """
    assert nature.entree in BARE, (
        f"La nature {nature.numero} ({nature.name}) n'est pas dans la classification du prompt. "
        f"Sans elle, « {nature.demande} » n'est pas SITUÉE avant d'être répondue."
    )
    corpus = HORS_BLOC if nature.ancre_ailleurs else BLOCK_UNKNOWN_REQUEST
    assert nature.ancre in corpus, f"La nature {nature.numero} renvoie à « {nature.ancre} », introuvable " + (
        "dans les AUTRES blocs du prompt : un renvoi mort, le bloc visé a été renommé ou retiré."
        if nature.ancre_ailleurs
        else "dans le bloc lui-même : la conduite que ce lot devait écrire a disparu."
    )


def test_the_eleven_natures_are_numbered_in_the_order_of_the_issue() -> None:
    """L'ORDRE est la traçabilité : la nature *n* de l'issue est le point
    ``1949.<n+1>`` du registre. Un ordre qui glisse casse la lecture croisée."""
    positions = [BARE.index(nature.entree) for nature in NATURES]
    assert positions == sorted(positions), dict(zip([n.name for n in NATURES], positions, strict=True))
    assert [nature.numero for nature in NATURES] == list(range(1, 12))


def test_the_classification_refuses_to_depend_on_a_closed_list() -> None:
    """#1949.1 — le cœur du retour. Sans cette phrase, le repli lui-même se
    lirait comme une douzième énumération à compléter."""
    assert "tu ne disposes d'aucune liste de formulations attendues" in BARE
    assert "autrement que les suggestions affichées se traite exactement comme une demande prévue" in BARE
    assert "Une demande qui n'entre dans aucune est traitée comme la nature 10" in BARE


def test_a_composed_request_gets_a_plan_before_the_first_move() -> None:
    """#1949.6 / #1949.18 — « elle construit un plan avant d'agir ». La règle
    utile n'est pas « fais un plan », c'est ce que le plan CONTIENT et le fait
    qu'aucun travail ne part avant l'accord."""
    assert "Tu n'en lances aucune avant d'avoir posé le plan" in BARE
    assert "lequel dépend du résultat du précédent" in BARE
    assert "Jamais les quatre d'un coup, jamais un seul en taisant les autres" in BARE


def test_an_absent_capability_is_told_apart_from_a_missing_connector() -> None:
    """#1949.8 / #1949.15 — les deux se ressemblent à l'écran et se traitent à
    l'opposé : un connecteur se branche, une capacité absente ne se branche pas.
    Le prompt doit dire la DIFFÉRENCE, pas seulement les deux cas."""
    assert "Il y a quelque chose à brancher" in BARE
    assert "Il n'y a rien à brancher" in BARE
    assert "tu ne promets ni date, ni version, ni « bientôt »" in BARE
    assert "tu dis en quoi c'est différent de ce qui était demandé" in BARE


def test_an_ambiguous_request_shows_the_readings_instead_of_picking_one() -> None:
    """#1949.11 / #1949.17 — ``THREAD_CONTINUITY_BLOCK`` (#1927.8) dit QUAND
    demander une précision sur un objet ; il ne dit pas de MONTRER les lectures.
    C'est la moitié que le retour réclame (« elle montre les interprétations
    possibles et demande laquelle choisir »)."""
    assert "tu ÉNONCES les lectures" in BARE
    assert "formulées pour qu'on réponde d'un mot" in BARE
    assert "Tu ne tranches pas en silence et tu ne réponds pas aux deux à la fois" in BARE


def test_a_bare_refusal_is_forbidden_while_something_remains() -> None:
    """#1949.21 — la règle existait pour le SEUL cas sécurité (« RÉPONSE DE
    SÉCURITÉ : refuse brièvement… puis propose une alternative conforme ») ;
    elle vaut pour les onze natures. La nuance qui évite le défaut inverse :
    Laura ne dit « il n'y a rien » que quand elle a REGARDÉ."""
    assert "« Je ne peux pas » seul est interdit tant qu'il reste quelque chose" in BARE
    assert "Tu ne dis « il n'y a rien » que quand tu as regardé et que c'est vrai" in BARE
    # La règle d'origine reste à SA place, elle n'est pas déplacée ici.
    assert "RÉPONSE DE SÉCURITÉ" in _BLOCK_SECURITY


def test_a_misunderstood_request_never_spends() -> None:
    """#1949.24 — « ne jamais utiliser une demande non comprise comme prétexte
    pour lancer une recherche coûteuse ». L'interdit nomme les trois formes que
    prend la dépense côté copilote : l'outil lourd, l'analyse, la collecte."""
    for form in ("AUCUN outil lourd", "aucune analyse", "aucune collecte"):
        assert form in BARE, f"la dépense « {form} » n'est pas couverte par l'interdit"
    assert "Tu comprends d'abord, tu dépenses ensuite" in BARE


def test_the_classification_itself_is_never_shown() -> None:
    """#1949.22 — « ne pas afficher l'architecture technique ».

    L'interdit GÉNÉRAL existait déjà et n'est PAS recopié : il vit dans
    ``_BLOCK_TOOLS`` (« CONFIDENTIALITÉ TECHNIQUE ») et ``_BLOCK_SECURITY``
    (« EXFILTRATION »). Ce que ce lot ajoute est la facette que la taxonomie
    crée elle-même : une mécanique qu'on vient d'écrire dans le prompt est la
    première à fuir (« ta demande est de catégorie 7 »).
    """
    assert "CONFIDENTIALITÉ TECHNIQUE" in _BLOCK_TOOLS
    assert "architecture détaillée" in _BLOCK_SECURITY
    assert "Tu ne l'annonces jamais, tu ne la numérotes jamais" in BLOCK_UNKNOWN_REQUEST
    assert "c'est ta mécanique, pas la conversation" in BLOCK_UNKNOWN_REQUEST


# ── 2. Le bloc n'élargit pas #1949.23 ────────────────────────────────────────


def test_the_conduct_block_never_touches_the_anonymous_trace() -> None:
    """#1949.23 est une exception de doctrine NOMMÉE (``c64_analytique_produit``),
    tranchée par Louis le 13/09 CONTRE la recommandation, relecture juridique
    toujours due. Ses conditions sont dures : texte masqué, tronqué à 300
    caractères, aucun ``user_id`` ni ``workspace_id``, purge à 90 jours, rien en
    démo, lecture au-dessus de 5 occurrences distinctes.

    Une conduite écrite dans le prompt ne doit ni la nommer, ni l'étendre, ni
    apprendre au modèle à y verser autre chose qu'une catégorie. Le bloc ne
    parle donc pas du tout de la trace — et la seule porte reste la description
    de l'outil, inchangée.
    """
    for leak in (
        "note_unrouted_request",
        "anonym",
        "trace",
        "user_id",
        "workspace_id",
        "espace de démonstration",
    ):
        assert leak.lower() not in BLOCK_UNKNOWN_REQUEST.lower(), (
            f"« {leak} » est apparu dans le bloc de conduite : #1949.23 ne s'élargit pas depuis ici."
        )
    # La porte d'origine est intacte, et elle ne prend toujours qu'une catégorie.
    assert list(chat_tools.NOTE_UNROUTED_REQUEST_TOOL["input_schema"]["required"]) == ["category"]


# ── 3. Les cas de recette de l'issue, tous rattachés ─────────────────────────


def _points_prouves() -> set[Recette1949]:
    return {point for nature in NATURES for point in nature.points} | set(PREUVES_AILLEURS)


def test_every_retained_1949_point_is_proven_here_or_named_elsewhere() -> None:
    """Le cliquet du lot : un point du registre qui ne serait ni prouvé ici ni
    nommé ailleurs se serait perdu entre deux fichiers."""
    # Les points portés par une assertion nommée de ce fichier plutôt que par un
    # scénario : ils ne passent pas par `NATURES`, mais ils sont prouvés.
    par_assertion = {
        Recette1949.PAS_DE_LISTE_FERMEE,
        Recette1949.JAMAIS_UN_REFUS_NU,
        Recette1949.PAS_D_ARCHITECTURE,
        Recette1949.PAS_DE_DEPENSE_SUR_UN_DOUTE,
        Recette1949.FORMULATION_INEDITE,
        Recette1949.TROP_VAGUE,
        Recette1949.MULTI_OBJETS,
    }
    manquants = set(Recette1949) - _points_prouves() - par_assertion
    assert not manquants, f"points #1949 ni prouvés ni nommés : {sorted(manquants)}"


def test_a_known_case_written_differently_is_not_a_special_case() -> None:
    """#1949.25 — « demande proche d'un cas connu mais formulée autrement ».

    Il n'y a RIEN à écrire pour ce cas, et c'est la preuve : le prompt ne porte
    aucune table de formulations, donc aucune reformulation ne peut le manquer.
    Ce test tient ce constat en LISANT le registre d'outils — une table de
    phrases attendues y apparaîtrait comme une énumération fermée.
    """
    assert len(chat_tools.CHAT_TOOLS) >= 52, "le registre d'outils a fondu : la garde lirait du vide"
    formulations_figees = [
        tool["name"]
        for tool in chat_tools.CHAT_TOOLS
        if any(
            marqueur in str(tool.get("description", ""))
            for marqueur in ("formulations acceptées", "phrases reconnues", "uniquement si l'utilisateur écrit")
        )
    ]
    assert not formulations_figees, (
        f"ces outils attendent une formulation FERMÉE : {formulations_figees} — "
        "une demande écrite autrement les manquerait en silence (#1949.1)"
    )


def test_a_request_too_vague_is_answered_by_the_question_that_changes_the_answer() -> None:
    """#1949.27 — « question trop vague » (« aide-moi », « et maintenant ? »).

    La conduite existait (``_BLOCK_ASK_FIRST``) ; ce que ce lot ajoute, c'est
    qu'une demande vague est SITUÉE (nature 2) au lieu de recevoir une réponse
    générique. Les deux moitiés sont vérifiées ensemble, sinon la seconde reste
    verte sur un prompt qui a perdu la première.
    """
    assert "2. RÉPONDABLE APRÈS UNE PRÉCISION" in BARE
    assert "une seule chose manque et elle CHANGE la réponse" in BARE
    assert "Tu demandes ce qui CHANGERAIT ta réponse" in BARE


def test_a_request_carrying_several_objects_is_not_answered_on_one_of_them() -> None:
    """#1949.33 — « question contenant plusieurs objets ».

    Deux cas, et les confondre est le défaut : plusieurs objets de la MÊME
    nature pour UN seul travail (« entre Thales, Safran et Dassault, lequel
    j'attaque ? ») se répondent par un outil qui prend une LISTE — c'est du
    schéma, pas de la conduite, et ça se lit dans le registre. Plusieurs
    travaux, eux, relèvent de la nature 5 et reçoivent un plan.

    Le risque réel est celui de la famille « N sources concaténées puis
    tronquées » : répondre sur le premier objet et laisser les autres tomber
    sans le dire. C'est ce que les deux moitiés ci-dessous empêchent.
    """
    listes = {
        str(tool["name"]): champ
        for tool in chat_tools.CHAT_TOOLS
        for champ, forme in tool.get("input_schema", {}).get("properties", {}).items()
        if forme.get("type") == "array"
    }
    assert "compare_accounts" in listes, (
        f"aucun outil ne prend plusieurs objets d'un coup : {sorted(listes)} — une question qui en nomme "
        "trois ne pourrait être répondue que sur un seul"
    )
    # L'autre moitié : plusieurs TRAVAUX ne se répondent pas en un seul geste,
    # et ce qui reste en attente est DIT plutôt que perdu.
    assert "5. COMPOSÉE DE PLUSIEURS TRAVAUX" in BARE
    assert "tu traites la plus bloquante d'abord, et tu DIS ce qui reste en attente" in BARE


def test_a_deletion_request_names_the_screen_that_really_exists() -> None:
    """#1949.30 — « demande de suppression de données ».

    Laura n'a AUCUN outil qui supprime : la réponse honnête est l'écran où la
    personne le fait elle-même. L'écran est LU dans le catalogue, pas écrit en
    dur ici — un écran deviné serait une interface inventée.
    """
    ecrans = {str(entry["route"]): str(entry["description"]) for entry in chat_tools.SETTINGS_SCREENS}
    assert "/settings/mes-donnees" in ecrans, (
        f"l'écran de suppression des données a disparu du catalogue : {sorted(ecrans)}"
    )
    assert "suppression" in ecrans["/settings/mes-donnees"].lower()
    outils_qui_suppriment = [
        tool["name"]
        for tool in chat_tools.CHAT_TOOLS
        if str(tool["name"]).startswith(("delete_", "erase_", "purge_", "remove_"))
    ]
    assert not outils_qui_suppriment, (
        f"un outil de suppression est apparu : {outils_qui_suppriment} — la nature 4 promettrait un geste "
        "que Laura ferait elle-même, alors que la règle est que la personne le fait"
    )
    assert "exporter ou supprimer ses données" in BARE


# ── 4. Les trois preuves exigées de toute garde du dépôt ─────────────────────


def test_the_guard_reads_a_non_empty_corpus() -> None:
    """Preuve n°2 — une garde qui ne lit rien est verte pour toujours."""
    assert len(BARE) > 5000, f"le prompt nu est trop court ({len(BARE)}) : la garde ne lit rien"
    assert BLOCK_UNKNOWN_REQUEST in BARE, (
        "le bloc n'est pas DANS le prompt assemblé : écrit, testé, et appelé par personne — le défaut n°1 du dépôt"
    )
    assert len(NATURES) == 11
    assert len(_points_prouves()) >= 12
    # Cinq natures routent vers une conduite qui existait DÉJÀ ; six portent la
    # conduite que ce lot a écrite. Le compte se lit, il n'est pas recopié.
    assert sum(nature.ancre_ailleurs for nature in NATURES) == 5


def test_the_guard_knows_how_to_say_no() -> None:
    """Preuve n°1 — le bloc retiré, les onze natures tombent.

    Retirer le bloc du corpus imite exactement le défaut qu'on craint : un
    bloc écrit mais jamais assemblé. Si une entrée restait verte, c'est qu'elle
    serait satisfaite ailleurs dans le prompt et la garde serait borgne.
    """
    degrade = BARE.replace(BLOCK_UNKNOWN_REQUEST, "")
    assert BLOCK_UNKNOWN_REQUEST not in degrade
    survivantes = [nature.name for nature in NATURES if nature.entree in degrade]
    assert not survivantes, f"ces entrées survivent au retrait du bloc : {survivantes}"
    # Les six ancres d'un autre bloc, elles, DOIVENT survivre : ce sont des
    # renvois vers une conduite qui vit ailleurs, et le test le prouve dans les
    # deux sens (sinon l'assertion ci-dessus passerait pour la mauvaise raison).
    for ancre in ("DEMANDER AVANT DE CHERCHER", "MONTRER LE CHEMIN", "CONNECTEUR MANQUANT", "HORS PÉRIMÈTRE"):
        assert ancre in degrade, f"« {ancre} » n'est pas une ancre d'un autre bloc : le renvoi est faux"


def test_the_guard_spares_a_legitimate_edit_and_the_neighbouring_blocks() -> None:
    """Preuve n°3 — elle n'attrape pas ce qu'elle ne vise pas.

    Une reformulation qui ne touche AUCUNE ancre passe ; et les conduites
    voisines vers lesquelles le bloc route ne sont pas absorbées par lui — si
    elles l'étaient, on aurait dupliqué au lieu de router (loi 4 du tome 7).
    """
    retouche = BARE.replace(
        "une question posée coûte moins qu'une recherche à côté",
        "poser une question coûte moins cher que chercher à côté",
    )
    assert retouche != BARE, "la phrase témoin a changé : mets ce test à jour, ne le supprime pas"
    assert all(nature.entree in retouche for nature in NATURES)
    assert all(nature.ancre in retouche for nature in NATURES)
    assert all(nature.ancre in HORS_BLOC for nature in NATURES if nature.ancre_ailleurs)
    # Les blocs voisins gardent leur texte : rien n'a été recopié chez eux.
    for voisin in (_BLOCK_OUT_OF_SCOPE, BLOCK_SUPPORT):
        assert voisin not in BLOCK_UNKNOWN_REQUEST
        assert voisin in BARE


# ── 5. La place et le coût du bloc ───────────────────────────────────────────


def test_the_block_stays_in_the_invariant_segment() -> None:
    """GA-293 — le prompt est segmenté pour le cache ; un bloc constant posé
    après le profil ESN cesse d'être relu et se paie à chaque tour."""
    here = BARE.index("UNE DEMANDE QUE TU N'AS JAMAIS VUE")
    assert here < BARE.index("PROFIL ESN")
    assert here < BARE.index("COMPTE ANALYSÉ")
    # La classification précède les conduites vers lesquelles elle route.
    assert here < BARE.index("DEMANDER AVANT DE CHERCHER")


def test_the_block_stays_inside_its_token_budget() -> None:
    """Un tour a 90 s de budget et 105 s de plafond dur (``CHAT_TURN_BUDGET_S`` /
    ``CHAT_TURN_CEILING_S``). Une consigne se paie sur TOUS les tours, y compris
    ceux qui n'ont rien d'incertain à classer."""
    assert len(BLOCK_UNKNOWN_REQUEST) <= 3800, (
        f"Le bloc fait {len(BLOCK_UNKNOWN_REQUEST)} caractères. Au-delà, il se paie sur tous les tours."
    )
