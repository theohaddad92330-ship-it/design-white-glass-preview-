"""GA-272 — « un axe d'adressabilité NON MESURÉ sort du dénominateur, jamais un zéro ».

─────────────────────────────────────────────────────────────────────────────
CE QUE CE FICHIER TIENT, ET POURQUOI IL EXISTE MAINTENANT
─────────────────────────────────────────────────────────────────────────────
Le barème d'adressabilité a cinq axes (``ADDRESSABILITY_AXES``, 20 points) et
n'en calculait que DEUX : ``lock`` et ``proportion``. ``path``, ``relation`` et
``access_cost`` sortaient en permanence dans ``unmeasured``.

#1631.5 branche le troisième — la RELATION — sur la seule donnée qui la porte
honnêtement : le relevé de la couche zéro (``crm_presence``), c'est-à-dire le
CRM que l'ESN a elle-même connecté. Le corpus de la mémoire marché ne porte
AUCUN hash de personne (``market_person_path_hashes`` n'existe nulle part), donc
l'axe ne peut pas venir de là : il vient du CRM de l'utilisateur, et de nulle
part ailleurs.

Brancher un troisième axe, c'est exactement le geste qui casse l'invariant du
module. D'où cette garde, et ses TROIS preuves :

1. **elle sait dire NON** — chaque test ci-dessous tombe si on remplace
   ``if relation is not None: factors.append(relation)`` par un facteur à zéro,
   si on fait entrer ``access_cost`` dans le calcul, ou si on laisse un axe dans
   ``measured`` ET dans ``unmeasured`` ;
2. **elle LIT quelque chose** —
   :func:`test_GA_272_the_matrix_this_guard_reads_is_not_empty` prouve que la
   matrice d'entrées produit VRAIMENT des axes mesurés ET des axes non mesurés.
   Une garde dont le corpus est vide passe au vert sans rien regarder ;
3. **elle n'attrape pas ce qu'elle ne vise pas** —
   :func:`test_GA_272_a_genuinely_measured_zero_is_not_an_unmeasured_axis` est
   le témoin : ``proportion`` PEUT valoir 0 en toute légitimité (« BNP,
   190 000 personnes, avec 2 consultants tu n'ouvres pas ce compte en direct »).
   Ce zéro-là est MESURÉ : il reste dans ``factors`` et son plafond reste dans
   le dénominateur. Une garde qui interdirait tout zéro effacerait le seul
   message que le §6.2 tient à faire passer.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.discover_scoring import (
    _ADDRESSABILITY_AXES,
    _AXIS_RELATION,
    addressability_for_company,
)

# ── Entrées ─────────────────────────────────────────────────────────────────

SMALL_COMPANY: dict[str, Any] = {"headcountRange": "100 à 199 salariés"}
HUGE_COMPANY: dict[str, Any] = {"headcountRange": "10 000 salariés et plus"}
NO_HEADCOUNT: dict[str, Any] = {"headcountRange": None}

SMALL_ESN: dict[str, Any] = {"size": "1-10"}
NO_SIZE: dict[str, Any] = {}

OPEN_TENDER = [{"type": "tender", "label": "AO refonte SI", "date": "2026-06-01"}]

#: Le relevé tel que l'API le rend (``formatCrmPresence``) : il NOMME des
#: personnes. C'est précisément ce qui ne doit jamais ressortir dans
#: ``raw_analysis`` — voir le test RBAC plus bas.
CRM_PRESENCE_WITH_NAMES = (
    "Votre CRM consulté pour « ACME INDUSTRIE » :\n"
    "- 3 contact(s) déjà dans votre CRM chez ce groupe : Alice Martin (DSI), Bruno Peretti\n"
    "- 1 deal(s) ouvert(s) : Refonte SI (negotiation, 50000 €)\n"
    "- Dernière activité CRM : 2026-06-12"
)

ALL_AXES = {axis for axis, _cap in _ADDRESSABILITY_AXES}


def _axes(result: dict[str, Any]) -> set[str]:
    return {factor["axis"] for factor in result["factors"]}


def _factor(result: dict[str, Any], axis: str) -> dict[str, Any] | None:
    return next((f for f in result["factors"] if f["axis"] == axis), None)


#: La matrice que la garde LIT. Elle couvre les deux côtés de chaque axe
#: branché : avec / sans effectif, avec / sans taille d'ESN, avec / sans trace
#: de marché public, avec / sans relevé CRM.
MATRIX: tuple[tuple[str, dict[str, Any], dict[str, Any], list[dict[str, Any]], str | None], ...] = (
    ("tout mesurable + relation", SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, CRM_PRESENCE_WITH_NAMES),
    ("tout mesurable, sans CRM", SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None),
    ("CRM connecté sans match", SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, ""),
    ("relevé vide de blancs", SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, "   \n  "),
    ("proportion nulle mais MESURÉE", HUGE_COMPANY, SMALL_ESN, OPEN_TENDER, None),
    ("aucun effectif", NO_HEADCOUNT, SMALL_ESN, OPEN_TENDER, CRM_PRESENCE_WITH_NAMES),
    ("aucune taille d'ESN", SMALL_COMPANY, NO_SIZE, OPEN_TENDER, None),
    ("rien du tout", NO_HEADCOUNT, NO_SIZE, [], None),
    ("rien sauf la relation", NO_HEADCOUNT, NO_SIZE, [], CRM_PRESENCE_WITH_NAMES),
)


def _run(case: tuple[str, dict[str, Any], dict[str, Any], list[dict[str, Any]], str | None]) -> dict[str, Any]:
    _name, company, profile, signals, crm = case
    return addressability_for_company(company, profile, signals, None, crm_presence=crm)


# ── L'INVARIANT ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("case", MATRIX, ids=[c[0] for c in MATRIX])
def test_GA_272_an_unmeasured_axis_leaves_the_denominator_and_is_never_a_zero(
    case: tuple[str, dict[str, Any], dict[str, Any], list[dict[str, Any]], str | None],
) -> None:
    """Les quatre moitiés d'une seule règle, sur chaque entrée de la matrice.

    Un axe est SOIT mesuré (un facteur le porte, son plafond entre au
    dénominateur), SOIT non mesuré (nommé, hors dénominateur). Jamais les deux,
    jamais aucun des deux — sinon le score mesure la complétude de nos données
    plutôt que l'accessibilité du compte.
    """
    result = _run(case)
    measured = _axes(result)
    unmeasured = set(result["unmeasured"])

    # 1. La partition est complète et sans recouvrement : aucun axe ne disparaît,
    #    aucun ne compte deux fois.
    assert measured | unmeasured == ALL_AXES, result
    assert measured & unmeasured == set(), result

    # 2. Le dénominateur est la somme des plafonds des SEULS axes mesurés.
    assert result["max"] == sum(cap for axis, cap in _ADDRESSABILITY_AXES if axis in measured), result

    # 3. Le numérateur est la somme des facteurs — aucun résidu inexpliqué.
    expected = sum(f["points"] for f in result["factors"])
    assert result["score"] == (expected if result["max"] else None), result

    # 4. Aucun facteur ne dépasse le plafond de son axe.
    caps = dict(_ADDRESSABILITY_AXES)
    for factor in result["factors"]:
        assert 0 <= factor["points"] <= caps[factor["axis"]], factor


# ── LA RELATION (#1631.5) ───────────────────────────────────────────────────


def test_the_relation_axis_is_measured_only_when_the_zero_layer_actually_matched() -> None:
    """#1631.5 — « le nom vient TOUJOURS du CRM de l'utilisateur ».

    L'API ne renseigne ``crm_presence`` que sur un match RÉEL (au moins un
    contact ou un deal ouvert chez ce compte) : c'est le contrat que
    ``zero_layer.has_crm_history`` documente et lit déjà comme un booléen.
    """
    result = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=CRM_PRESENCE_WITH_NAMES
    )
    relation = _factor(result, "relation")
    assert relation is not None, result
    assert relation["points"] == _AXIS_RELATION
    assert "relation" not in result["unmeasured"]
    # Le plafond de l'axe est ENTRÉ au dénominateur — 6 (verrou) + 5 (proportion)
    # + 3 (relation).
    assert result["max"] == 14, result


@pytest.mark.parametrize("empty", [None, "", "   ", "\n\t "])
def test_an_absent_crm_reading_leaves_the_relation_unmeasured_never_zero(empty: str | None) -> None:
    """⚠️ Le cœur de la règle, et le piège qu'elle évite.

    Un relevé vide recouvre TROIS causes indiscernables : aucun CRM connecté,
    un CRM consulté sans match, une lecture en échec (``describeAccountHistory``
    rend ``undefined`` dans les trois cas). « Il n'y a pas de relation » n'est
    donc PAS ce qu'on sait — ce qu'on sait, c'est qu'on n'a pas pu regarder.
    Un ``0/3`` affirmerait le contraire.
    """
    result = addressability_for_company(SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=empty)
    assert _factor(result, "relation") is None, result
    assert "relation" in result["unmeasured"]
    # Le plafond de la relation est SORTI du dénominateur, il n'y est pas resté
    # à zéro : 6 + 5, pas 6 + 5 + 3.
    assert result["max"] == 11, result


def test_the_relation_axis_never_carries_the_name_of_a_colleagues_contact() -> None:
    """RBAC (#1606.3) — l'analyse est PERSISTÉE sur le compte et lue par tout
    l'espace, alors que le relevé CRM est lu avec les identifiants d'UNE
    personne. Recopier « Alice Martin (DSI) » dans ``raw_analysis`` publierait
    le carnet d'adresses d'un collègue à ses collègues.

    L'axe ne cite donc RIEN du relevé : il n'en lit que l'existence.
    """
    result = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=CRM_PRESENCE_WITH_NAMES
    )
    rendered = repr(result)
    for leaked in ("Alice", "Martin", "Bruno", "Peretti", "Refonte SI", "50000", "2026-06-12"):
        assert leaked not in rendered, f"« {leaked} » a fuité du relevé CRM vers l'adressabilité"


#: Un second relevé CRM, avec une identité TOTALEMENT différente du premier —
#: personne en commun, deal différent, date différente.
CRM_PRESENCE_WITH_OTHER_NAMES = (
    "Votre CRM consulté pour « ACME INDUSTRIE » :\n"
    "- 1 contact(s) déjà dans votre CRM chez ce groupe : Chloé Nguyen (RSSI)\n"
    "- 2 deal(s) ouvert(s) : Migration Cloud (qualification, 120000 €)\n"
    "- Dernière activité CRM : 2025-11-03"
)


def test_2298_6_the_relation_axis_says_a_path_exists_in_the_team_without_naming_who() -> None:
    """#2298.6 (LAU-039, registre `.claude/notes/registre-2026-09-17-lau-039-2298.md`)
    — « un chemin existe dans ton équipe », sans nom, et c'est au collègue
    concerné de se manifester, jamais à l'outil de le désigner.

    Le test ci-dessus (#1606.3) prouve qu'un nom PRÉCIS ne fuit pas. Celui-ci
    prouve la propriété plus forte que #2298.6 demande : le facteur RELATION
    rendu est BYTE-IDENTIQUE quelle que soit l'IDENTITÉ portée par le relevé
    CRM — deux collègues différents, deux deals différents, deux dates
    différentes produisent EXACTEMENT le même facteur. L'axe ne dit donc pas
    seulement « pas ce nom-là » : il ne dit jamais RIEN de qui, seulement
    qu'un chemin (une relation) existe.
    """
    with_alice = _factor(
        addressability_for_company(SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=CRM_PRESENCE_WITH_NAMES),
        "relation",
    )
    with_chloe = _factor(
        addressability_for_company(
            SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=CRM_PRESENCE_WITH_OTHER_NAMES
        ),
        "relation",
    )
    assert with_alice is not None and with_chloe is not None
    assert with_alice == with_chloe, "le facteur RELATION varie avec l'identité du relevé CRM — #2298.6 est rompu"


def test_the_default_call_is_byte_identical_to_before_the_relation_axis() -> None:
    """Découvrir n'a pas de couche zéro : ses candidats ne sont, par
    définition, pas dans le CRM. Le paramètre est donc DONNÉ EN DERNIER et
    optionnel — un appelant qui l'ignore obtient exactement ce qu'il obtenait.
    """
    without = addressability_for_company(SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None)
    explicit = addressability_for_company(SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=None)
    assert without == explicit
    assert "relation" in without["unmeasured"]


# ── LA RELATION, PLUSIEURS SOURCES (#2298.4, décision Louis 19/09/2026) ─────
#
# « sources multiples (CRM / e-mails / agenda / missions / Market Memory /
# DataForge…) », en commençant par le CRM (déjà là) puis, dans cet ordre :
# missions signées, agenda (rendez-vous PASSÉS), e-mails (MÉTADONNÉES —
# jamais le corps), corrections humaines. Chaque source apparaît NOMMÉE ;
# aucune ne fait bouger le plafond de l'axe (toujours binaire, `_AXIS_RELATION`
# — voir la section « POURQUOI BINAIRE » du docstring de `_relation_axis`) ;
# un axe sans AUCUNE source reste non mesuré, jamais 0.
#
# ⚠️ Market Memory est EXCLUE par écrit (docstring de `_relation_axis`, GA-263 :
# la mémoire marché élève un POTENTIEL, jamais une relation/urgence) et
# DataForge — un prior sectoriel/procurement tiers, pas un fait de relation
# propre à l'ESN — n'est PAS branché non plus : aucun des deux n'a de
# paramètre ici, et ce n'est pas un oubli.


def test_relation_axis_measures_a_signed_mission_alone() -> None:
    result = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=None, missions_count=2
    )
    relation = _factor(result, "relation")
    assert relation is not None, result
    assert relation["points"] == _AXIS_RELATION
    assert "mission" in relation["evidence"].lower()
    assert "2" in relation["evidence"]


def test_relation_axis_measures_a_past_meeting_alone() -> None:
    result = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=None, last_meeting_at="2026-06-01"
    )
    relation = _factor(result, "relation")
    assert relation is not None, result
    assert "2026-06-01" in relation["evidence"]
    assert "rendez-vous" in relation["evidence"].lower() or "rdv" in relation["evidence"].lower()


def test_relation_axis_measures_email_metadata_alone() -> None:
    result = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=None, last_email_at="2026-05-12"
    )
    relation = _factor(result, "relation")
    assert relation is not None, result
    assert "2026-05-12" in relation["evidence"]
    assert "e-mail" in relation["evidence"].lower() or "échange" in relation["evidence"].lower()


def test_relation_axis_measures_a_human_correction_alone() -> None:
    result = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=None, human_correction="ancien client"
    )
    relation = _factor(result, "relation")
    assert relation is not None, result
    assert "ancien client" in relation["evidence"]


@pytest.mark.parametrize(
    "kwargs",
    [
        {},
        {"missions_count": 0},
        {"missions_count": None},
        {"last_meeting_at": None},
        {"last_meeting_at": ""},
        {"last_meeting_at": "   "},
        {"last_email_at": None},
        {"last_email_at": ""},
        {"human_correction": None},
        {"human_correction": ""},
        {"human_correction": "   "},
    ],
)
def test_relation_axis_stays_unmeasured_when_every_source_is_absent(kwargs: dict[str, Any]) -> None:
    """Aucune source réelle (CRM compris) ⇒ non mesuré, jamais 0 — la même
    discipline que le CRM seul (`test_an_absent_crm_reading_leaves_the_relation_unmeasured_never_zero`),
    étendue aux quatre nouvelles sources.
    """
    result = addressability_for_company(SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=None, **kwargs)
    assert _factor(result, "relation") is None, result
    assert "relation" in result["unmeasured"]


def test_relation_axis_names_every_source_present_at_once() -> None:
    """Plusieurs sources RÉELLES à la fois : chacune se NOMME dans l'évidence
    (« relation : 2 missions, dernier rendez-vous le … ») — l'axe ne dit pas
    seulement « oui », il dit D'OÙ il le sait, pour CHAQUE source branchée.
    """
    result = addressability_for_company(
        SMALL_COMPANY,
        SMALL_ESN,
        OPEN_TENDER,
        None,
        crm_presence=CRM_PRESENCE_WITH_NAMES,
        missions_count=2,
        last_meeting_at="2026-06-01",
        last_email_at="2026-05-12",
        human_correction="ancien client",
    )
    relation = _factor(result, "relation")
    assert relation is not None, result
    evidence = relation["evidence"]
    # Une seule instance de l'axe, un seul plafond — jamais un facteur qui grossit
    # avec le nombre de sources (toujours binaire, voir docstring).
    assert relation["points"] == _AXIS_RELATION
    for needle in ("CRM", "mission", "2026-06-01", "2026-05-12", "ancien client"):
        assert needle in evidence, (needle, evidence)
    # Toujours RBAC (#1606.3) : le relevé CRM ne nomme personne, même entouré
    # des nouvelles sources.
    for leaked in ("Alice", "Martin", "Bruno", "Peretti"):
        assert leaked not in evidence


def test_relation_axis_evidence_never_carries_an_email_body() -> None:
    """Doctrine « le corps des messages ne sort jamais » : même avec un texte
    qui RESSEMBLE à un corps de mail glissé par erreur dans la date, l'évidence
    ne doit contenir QUE ce que la fonction a effectivement reçu — et la
    fonction elle-même ne peut PAS recevoir de corps, voir le test de
    signature ci-dessous.
    """
    result = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, OPEN_TENDER, None, crm_presence=None, last_email_at="2026-05-12"
    )
    relation = _factor(result, "relation")
    assert relation is not None, result
    # Aucune trace d'un objet ou d'un corps de message dans l'évidence — la
    # seule matière e-mail qui y entre est une DATE.
    assert "Objet" not in relation["evidence"]
    assert "Bonjour" not in relation["evidence"]


def test_relation_axis_signature_never_accepts_an_email_body() -> None:
    """Preuve la plus forte que le corps ne peut pas entrer : ni `_relation_axis`
    ni `addressability_for_company` n'ont de paramètre qui pourrait le porter.
    Un futur appelant qui ajouterait `email_body`/`last_email_subject` ferait
    tomber ce test AVANT de câbler quoi que ce soit — jamais après.
    """
    import inspect

    from app.services.discover_scoring import _relation_axis

    for fn in (_relation_axis, addressability_for_company):
        for name in inspect.signature(fn).parameters:
            assert "body" not in name.lower(), f"{fn.__name__} porte un paramètre suspect : {name}"
            assert "subject" not in name.lower(), f"{fn.__name__} porte un paramètre suspect : {name}"


# ── LES DEUX AXES QU'ON NE CALCULE TOUJOURS PAS, ET LEUR RAISON ─────────────


@pytest.mark.parametrize("case", MATRIX, ids=[c[0] for c in MATRIX])
def test_the_access_cost_is_declarative_and_is_never_estimated(
    case: tuple[str, dict[str, Any], dict[str, Any], list[dict[str, Any]], str | None],
) -> None:
    """D60 — le coût d'accès se DÉCLARE, il ne s'estime jamais.

    Ce n'est pas un oubli, c'est un refus : il se saisit dans l'onglet Accès,
    et il ne s'agrège jamais entre espaces (les espaces sont des ESN, donc des
    concurrents — ce serait un échange d'informations tarifaires,
    ``COMMUNITY_FORBIDDEN_KINDS.cost``, GA-43). Quelle que soit l'entrée, il
    reste NOMMÉ dans ``unmeasured``.
    """
    result = _run(case)
    assert _factor(result, "access_cost") is None, result
    assert "access_cost" in result["unmeasured"], result


@pytest.mark.parametrize("case", MATRIX, ids=[c[0] for c in MATRIX])
def test_the_path_axis_stays_unmeasured_because_no_aggregated_route_reaches_this_service(
    case: tuple[str, dict[str, Any], dict[str, Any], list[dict[str, Any]], str | None],
) -> None:
    """#1631.3/.4 — l'axe CHEMIN attend un ingrédient qui n'est pas de ce côté.

    Les routes partenaires agrégées vivent dans la mémoire marché, servie par
    ``MarketMemoryService`` (API TypeScript) ; le service IA n'en lit rien —
    aucun champ de ``ResearchRequest`` ne les transporte. Le déduire des
    marchés publics déjà en main serait un DOUBLE COMPTAGE : ``_lock_axis`` les
    consomme déjà.

    Ce test épingle donc un ÉTAT, et il est écrit pour être SUPPRIMÉ le jour où
    la donnée voyagera — pas contourné.
    """
    result = _run(case)
    assert _factor(result, "path") is None, result
    assert "path" in result["unmeasured"], result


# ── LES TROIS PREUVES DE LA GARDE ──────────────────────────────────────────


def test_GA_272_the_matrix_this_guard_reads_is_not_empty() -> None:
    """Preuve n°2 — la garde LIT quelque chose.

    Une matrice qui ne produirait que des cas vides passerait au vert sans rien
    vérifier. On exige donc les DEUX côtés : au moins un axe réellement mesuré
    quelque part, au moins un axe non mesuré quelque part, et les cinq axes du
    barème vus au moins une fois chacun.
    """
    assert len(_ADDRESSABILITY_AXES) == 5
    results = [_run(case) for case in MATRIX]
    measured_somewhere: set[str] = set()
    unmeasured_somewhere: set[str] = set()
    for result in results:
        measured_somewhere |= _axes(result)
        unmeasured_somewhere |= set(result["unmeasured"])
    assert measured_somewhere == {"lock", "proportion", "relation"}, measured_somewhere
    assert unmeasured_somewhere == ALL_AXES, unmeasured_somewhere
    # Et au moins un cas où RIEN n'est mesurable : le score y vaut None, jamais 0.
    nothing = [r for r in results if r["max"] == 0]
    assert nothing, "la matrice ne contient aucun cas entièrement non mesurable"
    assert all(r["score"] is None for r in nothing)


def test_GA_272_a_genuinely_measured_zero_is_not_an_unmeasured_axis() -> None:
    """Preuve n°3 — le témoin : la garde n'attrape pas ce qu'elle ne vise pas.

    « BNP, 190 000 personnes. Avec 2 consultants tu n'ouvres pas ce compte en
    direct. » Ce 0 est MESURÉ — les deux côtés de la comparaison existent — et
    c'est le seul message que le §6.2 tient à faire passer. Il reste donc un
    facteur, et son plafond reste au dénominateur.

    Interdire « tout zéro » effacerait ce message. La règle porte sur les axes
    qu'on n'a PAS pu regarder, pas sur les verdicts défavorables.
    """
    result = addressability_for_company(HUGE_COMPANY, SMALL_ESN, OPEN_TENDER, None)
    proportion = _factor(result, "proportion")
    assert proportion is not None, result
    assert proportion["points"] == 0
    assert "proportion" not in result["unmeasured"]
    assert result["max"] == 11, result  # 6 (verrou) + 5 (proportion), le zéro compris
