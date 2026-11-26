"""Laura parle à la bonne personne, du bon rôle, sans formules creuses.

#1920 (rôle), #1922 (objectifs et ton), #1923 (hypothèses), #1924.6/.7 (appels
à l'action), #1929.6 (hors périmètre) et #2547.1 (signal cité) — tout ce qui se
prouve SANS appeler le modèle : le prompt PORTE la consigne, chaque consigne
tient sur SA ligne, et le retrait du bloc fait tomber chacune d'elles (aucun
fragment n'est satisfait par un bloc voisin — la leçon de
``test_copilote_truth_levels_eval.py``).

Ce que ces tests ne prouvent PAS — que le modèle APPLIQUE la consigne — est une
éval en ligne, listée dans le rapport du lot.

Le mapping rôle → famille LIT l'énumération réelle (``user_role`` dans
``packages/contracts/src/schemas/profile-questionnaire.ts``) : un rôle ajouté au
questionnaire sans famille fait échouer la garde. Le service IA n'a pas le
paquet ``contracts`` à l'exécution (racine Railway = ``apps/ia``) : le test se
saute proprement dans une image de déploiement, et tourne en CI.
"""

from __future__ import annotations

import inspect
import re
from pathlib import Path
from typing import NamedTuple

import pytest

from app.prompts import bellum_advisor
from app.prompts.bellum_advisor import (
    _BLOCK_ASK_FIRST,
    _BLOCK_FORMAT,
    _BLOCK_LAURA,
    _BLOCK_OUT_OF_SCOPE,
    build_system_prompt,
)
from app.prompts.laura_role_and_voice import (
    BLOCK_ROLE_AND_VOICE,
    DECLARED_ROLE_FAMILY,
    NEWCOMER,
    ROLE_FAMILIES,
)
from app.services.claude_service import CACHE_SEGMENT_BREAK
from app.services.seller_context import esn_row_to_profile_data, merge_canonical_row

#: Un prompt « nu » : tout ce qu'on y trouve vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")

_QUESTIONNAIRE_TS = Path("packages/contracts/src/schemas/profile-questionnaire.ts")


def _lines_with(prompt: str, fragment: str) -> list[str]:
    return [line for line in prompt.splitlines() if fragment in line]


# ── 1. Le mapping rôle → famille lit l'énumération RÉELLE ────────────────────


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _strip_comments(source: str) -> str:
    """Un rôle cité dans un commentaire ne doit pas se lire comme un rôle
    (leçon GA-08 : la garde compare alors du bruit à du bruit)."""
    without_block = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
    return re.sub(r"//.*$", "", without_block, flags=re.MULTILINE)


def _declared_roles_in(source: str) -> list[str]:
    """Les valeurs du tableau ``user_role: [ … ]`` — guillemets simples OU
    doubles (« Consultant / Ingénieur d'affaires » est entre doubles)."""
    match = re.search(r"\buser_role:\s*\[(.*?)\]", _strip_comments(source), flags=re.DOTALL)
    if match is None:
        return []
    pairs = re.findall(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", match.group(1))
    return [single or double for single, double in pairs]


def _questionnaire_source() -> str:
    path = _monorepo_file(_QUESTIONNAIRE_TS)
    if path is None:
        pytest.skip("monorepo absent (image de déploiement) — la garde tourne en CI")
    return path.read_text(encoding="utf-8")


def _unmapped(roles: list[str]) -> list[str]:
    return [role for role in roles if role not in DECLARED_ROLE_FAMILY]


def test_the_role_guard_reads_the_real_questionnaire() -> None:
    roles = _declared_roles_in(_questionnaire_source())
    # Mesuré le 16/09/2026 (#2032.2-.8 — sept valeurs de PARCOURS ajoutées
    # après les onze titres du 15/09) : dix-huit rôles. Sous ce compte,
    # l'extracteur a raté.
    # BEL-SC-222 (#3251, 28/09/2026) — trois titres de plus (« Responsable
    # staffing », « ADV / Finance », « Freelance / activité individuelle »),
    # insérés après le bloc TITRES et avant les 7 PARCOURS : 18 + 3 = 21.
    # #3386.1 (beta #3386, 30/09/2026) — « Opérations commerciales » de plus :
    # 21 + 1 = 22.
    # Onboarding V23 (refonte, 23/10/2026) — cinq rôles de plus (« Responsable ADV »,
    # « Responsable delivery / opérations », « Responsable achats / partenariats »,
    # « Responsable marketing », « Responsable d’un bureau d’études ») : 22 + 5 = 27.
    # Le compte reste exact ; la garde « rôle sans famille » (test suivant) protège le fond.
    assert len(roles) == 27, roles
    assert len(set(roles)) == len(roles)


def test_every_declared_role_has_a_family_and_no_family_keeps_a_ghost_role() -> None:
    roles = _declared_roles_in(_questionnaire_source())
    assert _unmapped(roles) == [], "rôle du questionnaire sans famille : Laura le lirait sans savoir quoi en faire"
    ghosts = [role for role in DECLARED_ROLE_FAMILY if role not in roles]
    assert ghosts == [], f"rôle mappé qui n'existe plus dans le questionnaire : {ghosts}"


def test_the_role_guard_says_no_on_a_new_role_without_family() -> None:
    source = _questionnaire_source()
    fabricated = source.replace("user_role: [", "user_role: [\n    'Chargé de delivery',", 1)
    assert _unmapped(_declared_roles_in(fabricated)) == ["Chargé de delivery"]


def test_the_role_guard_does_not_read_a_neighbouring_catalogue_nor_a_comment() -> None:
    source = _questionnaire_source()
    roles = _declared_roles_in(source)
    # `role_tenure` suit immédiatement `user_role` : l'extracteur s'arrête au `]`.
    assert "Moins de 3 mois" not in roles
    commented = source.replace("user_role: [", "user_role: [\n    // 'Ancien rôle retiré',", 1)
    assert _declared_roles_in(commented) == roles


def test_the_five_families_are_the_five_the_issue_names() -> None:
    assert [family.label for family in ROLE_FAMILIES] == [
        "Business Manager",
        "Recruteur",
        "Directeur d'agence",
        "Dirigeant",
        "Nouvel arrivant",
    ]
    keys = {family.key for family in ROLE_FAMILIES}
    assert len(keys) == 5
    assert set(DECLARED_ROLE_FAMILY.values()) <= keys


def test_newcomer_is_never_deduced_from_a_declared_role() -> None:
    """#1920.6 / #1920.12 — « nouvel arrivant » est un ÉTAT, pas un rôle : aucun
    des dix rôles ne le désigne, et l'ancienneté dans le poste n'atteint pas le
    prompt (``role_tenure``, ticket séparé)."""
    assert NEWCOMER in {family.key for family in ROLE_FAMILIES}
    assert NEWCOMER not in DECLARED_ROLE_FAMILY.values()
    for family in ROLE_FAMILIES:
        if family.key != NEWCOMER:
            assert family.key in DECLARED_ROLE_FAMILY.values(), f"{family.label} : aucune personne n'y tombe"


@pytest.mark.parametrize(
    ("role", "label"),
    [
        ("Fondateur / CEO", "Dirigeant"),
        ("Directeur commercial", "Directeur d'agence"),
        ("Head of Sales", "Directeur d'agence"),
        ("Directeur de BU", "Directeur d'agence"),
        ("Directeur d'agence", "Directeur d'agence"),  # #1920.4
        ("Business Manager", "Business Manager"),
        ("Account Manager", "Business Manager"),
        ("Business Developer", "Business Manager"),
        ("SDR / BDR", "Business Manager"),
        ("Consultant / Ingénieur d'affaires", "Business Manager"),
        ("Talent Manager / Recruteur", "Recruteur"),
    ],
)
def test_the_mapping_is_pinned_role_by_role(role: str, label: str) -> None:
    by_key = {family.key: family.label for family in ROLE_FAMILIES}
    assert by_key[DECLARED_ROLE_FAMILY[role]] == label


# ── 2. Les cinq familles sont dans le prompt, chacune sur sa ligne ───────────

_FAMILY_FOCUS: dict[str, tuple[str, ...]] = {
    # #1920.2
    "Business Manager": ("comptes", "rendez-vous", "besoins", "consultants", "relances"),
    # #1920.3
    "Recruteur": ("besoins", "matching", "disponibilité", "retour du client"),
    # #1920.4 — la marge : la CIBLE déclarée seulement, le coût chargé ne sort
    # jamais vers le modèle (`chat_tools.py`, back-office §5.3).
    # « couverture » est le mot du point #1920.4, mais le vocabulaire de la
    # couverture est RÉSERVÉ dans le scope de Laura (c65,
    # `test_no_tool_answers_the_coverage_rate_question`) : on dit la chose.
    "Directeur d'agence": ("pipe", "équipes", "marge", "renouvellements", "que personne ne suit", "marge réalisée"),
    # #1920.5 — l'adoption du produit, jamais le suivi d'une personne.
    "Dirigeant": ("croissance", "activité", "risques", "adoption", "encaissements", "personne nommée"),
    # #1920.6 / #1920.12 — déclenché par ce qu'il a DIT, jamais par une date.
    "Nouvel arrivant": ("prise en main", "territoire", "premiers comptes", "méthode", "s'il te l'a dit"),
}


@pytest.mark.parametrize("label", list(_FAMILY_FOCUS))
def test_each_family_is_one_line_with_its_roles_and_its_focus(label: str) -> None:
    family = next(family for family in ROLE_FAMILIES if family.label == label)
    lines = [line for line in BARE.splitlines() if line.startswith(f"{label.upper()} (")]
    assert len(lines) == 1, f"famille {label} : {len(lines)} ligne(s) dans le prompt"
    line = lines[0]
    for role in (role for role, key in DECLARED_ROLE_FAMILY.items() if key == family.key):
        assert role in line, f"{role} absent de la ligne {label}"
    missing = [fragment for fragment in _FAMILY_FOCUS[label] if fragment not in line]
    assert not missing, f"{label} : manque {missing}"


def test_1920_1_two_members_of_the_same_esn_get_two_readings() -> None:
    """Le rôle est une colonne PERSONNELLE (``_PERSONAL_PROFILE_COLUMNS``) : deux
    membres d'une même ESN, un profil d'entreprise canonique, deux rôles — et
    deux familles distinctes dans le même segment invariant."""
    canonical = {
        "user_id": "fondateur",
        "esn_name": "Skaizen",
        "expertise_areas": ["Data"],
        "user_role": "Fondateur / CEO",
    }
    founder = esn_row_to_profile_data(merge_canonical_row(canonical, {}))
    manager = esn_row_to_profile_data(merge_canonical_row(canonical, {"user_role": "Business Manager"}))
    assert founder["companyName"] == manager["companyName"] == "Skaizen"
    assert (founder["sellerRole"], manager["sellerRole"]) == ("Fondateur / CEO", "Business Manager")

    founder_segments = build_system_prompt(founder, {}, "", "").split(CACHE_SEGMENT_BREAK)
    manager_segments = build_system_prompt(manager, {}, "", "").split(CACHE_SEGMENT_BREAK)
    assert founder_segments[0] == manager_segments[0], "le segment invariant ne dépend d'aucun utilisateur"
    assert "- Rôle : Business Manager" in manager_segments[1]
    assert "- Rôle : Fondateur / CEO" in founder_segments[1]
    assert DECLARED_ROLE_FAMILY["Fondateur / CEO"] != DECLARED_ROLE_FAMILY["Business Manager"]
    assert "DIRIGEANT (Fondateur / CEO" in founder_segments[0]
    assert "BUSINESS MANAGER (Business Manager" in manager_segments[0]


# ── 3. Chaque consigne est sur SA ligne ──────────────────────────────────────


class Consigne(NamedTuple):
    trace: str
    fragments: tuple[str, ...]


CONSIGNES: tuple[Consigne, ...] = (
    Consigne(
        "#1922.2-.5 objectifs",
        ("accélérer une décision", "lui faire gagner du temps", "prévenir une perte", "l'aider à se servir du produit"),
    ),
    Consigne("#1922.6 voix humaine", ("comme une collègue qui connaît le métier", "ton d'automate")),
    Consigne(
        "#1922.9 chaleureuse sans exagération",
        ("jamais d'enthousiasme de façade", "pas de compliment sur la question posée"),
    ),
    Consigne(
        "#1920.1 le rôle change le fond",
        ("LE RÔLE CHANGE LE FOND", "Deux personnes de la même ESN", "pas la même lecture"),
    ),
    Consigne(
        "#1920.13-.14 sans réciter",
        ("TU T'EN SERS SANS LE RÉCITER", "la liste des outils connectés", "ce qu'il a déjà fait"),
    ),
    Consigne(
        "#2206.49 l'écran ne se récite pas",
        (
            "CE QUE MONTRE L'ÉCRAN NE SE RÉCITE PAS",
            "tu dis pourquoi ça compte, quels dossiers ça concerne, et quelle décision ou quel geste ça appelle",
            "n'a rien ajouté",
        ),
    ),
    Consigne(
        "#1920.11-.12 équipe et ancienneté",
        ("tu ne vois pas le périmètre de son équipe", "ni depuis quand il occupe son poste"),
    ),
    Consigne(
        "#1920.16 personnalisation limitée",
        # « une seule fois dans la conversation » appartient déjà au scénario
        # « demande-trop-vague » de `test_copilote_scope_eval.py`.
        ("PERSONNALISATION LIMITÉE", "une fois par conversation et pas davantage", "sans deviner le rôle"),
    ),
    Consigne(
        "#1923 hypothèse",
        (
            "UNE HYPOTHÈSE, DEUX CONDUITES",
            # #2269.4 / #2269.5 — la légalité et la sécurité rejoignent les
            # critères qui déclenchent une clarification, à côté du classement,
            # du périmètre, du coût, de la personne ciblée et de l'action.
            "le classement, le périmètre, le coût, la légalité, la sécurité, la personne ciblée ou l'action recommandée",
            "une seule question sur cette hypothèse",
            "Tu peux corriger.",
        ),
    ),
    Consigne(
        "#1924.6-.7 appel à l'action",
        (
            "UN SEUL APPEL À L'ACTION PRINCIPAL",
            "deux gestes secondaires au plus",
            "tu choisis au lieu d'énumérer",
            "l'appel principal de la réponse reste celui du premier compte",
        ),
    ),
    Consigne(
        "#2547.1 signal cité",
        (
            "UN COMPTE OU UN INTERLOCUTEUR MIS EN AVANT SE PROUVE",
            "tu nommes le signal concret qui le justifie",
            "et sa date, tirés de ce qu'un outil t'a RÉELLEMENT rendu dans ce fil",
            "je n'ai pas de signal récent là-dessus",
        ),
    ),
)


@pytest.mark.parametrize("consigne", CONSIGNES, ids=[c.trace for c in CONSIGNES])
def test_each_consigne_is_carried_on_a_single_line(consigne: Consigne) -> None:
    lines = _lines_with(BARE, consigne.fragments[0])
    assert len(lines) == 1, f"{consigne.trace} : « {consigne.fragments[0]} » sur {len(lines)} ligne(s)"
    missing = [fragment for fragment in consigne.fragments[1:] if fragment not in lines[0]]
    assert not missing, f"{consigne.trace} : pas sur la même ligne — {missing}"


def test_each_consigne_has_its_own_line() -> None:
    lines = {_lines_with(BARE, consigne.fragments[0])[0] for consigne in CONSIGNES}
    assert len(lines) == len(CONSIGNES)


def test_the_block_reads_a_non_empty_corpus() -> None:
    assert BLOCK_ROLE_AND_VOICE.strip(), "bloc vide : le retirer ne changerait rien"
    assert len(CONSIGNES) == 11
    assert all(consigne.fragments for consigne in CONSIGNES)


def test_the_guard_knows_how_to_say_no() -> None:
    degraded = BARE.replace(BLOCK_ROLE_AND_VOICE, "")
    assert len(degraded) < len(BARE)
    still_green = [c.trace for c in CONSIGNES if all(fragment in degraded for fragment in c.fragments)]
    assert not still_green, f"consignes encore vertes sans leur bloc : {still_green}"


def test_no_fragment_survives_the_removal() -> None:
    degraded = BARE.replace(BLOCK_ROLE_AND_VOICE, "")
    survivors = {c.trace: [f for f in c.fragments if f in degraded] for c in CONSIGNES}
    survivors.update(
        {label: [f for f in _FAMILY_FOCUS[label] if f"{label.upper()} (" in degraded] for label in _FAMILY_FOCUS}
    )
    assert not any(survivors.values()), {k: v for k, v in survivors.items() if v}


# ── 4. Ce que le bloc désigne EXISTE, et il ne casse pas les gardes voisines ─


def test_1920_16_the_two_labels_it_names_are_the_real_seller_lines() -> None:
    line = _lines_with(BARE, "PERSONNALISATION LIMITÉE")[0]
    assert "« Rôle »" in line and "« Objectif du moment »" in line
    filled = build_system_prompt({"sellerRole": "Head of Sales", "sellerGoal": "Augmenter le CA"}, {}, "", "")
    assert "- Rôle : Head of Sales" in filled
    assert "- Objectif du moment : Augmenter le CA" in filled


def test_1923_the_block_it_defers_to_is_the_real_one() -> None:
    line = _lines_with(BARE, "UNE HYPOTHÈSE, DEUX CONDUITES")[0]
    assert "DEMANDER AVANT DE CHERCHER" in line
    assert _BLOCK_ASK_FIRST.startswith("DEMANDER AVANT DE CHERCHER")


def test_2271_13_no_plan_instead_of_acting() -> None:
    # #2271.13 — le contrat de réponse interdit d'ANNONCER un plan à venir
    # (« je peux le faire en 3 étapes ») au lieu d'agir ou de poser la
    # question qui bloque. La règle vit dans `_BLOCK_LAURA` (le ton de
    # Laura), pas dans `BLOCK_ROLE_AND_VOICE` — elle ne dépend pas du rôle,
    # donc elle n'appartient pas aux CONSIGNES ci-dessus.
    line = _lines_with(BARE, "PAS DE PLAN AU LIEU D'AGIR")[0]
    assert "je peux le faire en trois étapes" in line
    assert "tu FAIS la première maintenant" in line
    assert "un plan décrit n'est pas un livrable" in line
    assert line in _BLOCK_LAURA, "la règle doit vivre dans _BLOCK_LAURA"
    degraded = BARE.replace(_BLOCK_LAURA, "")
    assert "PAS DE PLAN AU LIEU D'AGIR" not in degraded, "retirer le bloc doit faire tomber la règle"


def test_1920_13_14_the_sources_it_names_reach_the_prompt_when_they_exist() -> None:
    filled = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=["On ne prend pas le secteur public."],
        not_consulted=["CRM"],
        tools_summary="- Enrichissement : 1 crédit",
        account_feedback="Le DSI est parti en juin.",
    )
    for heading in ("OUTILS CONNECTÉS", "SOURCES NON DISPONIBLES", "MÉMOIRE", "RETOURS UTILISATEUR"):
        assert heading in filled, heading


@pytest.mark.parametrize(
    "heading",
    ["MÉMOIRE", "OUTILS CONNECTÉS", "SOURCES NON DISPONIBLES", "RETOURS UTILISATEUR", "LA PERSONNE À QUI TU PARLES"],
)
def test_the_block_never_quotes_a_heading_whose_absence_other_guards_check(heading: str) -> None:
    """`test_advisor_memory.py`, `test_context_transparency.py`,
    `test_bellum_advisor.py` et `test_account_feedback.py` vérifient qu'un prompt
    NU ne porte pas ces intitulés : les citer ici rendrait ces gardes fausses."""
    assert heading not in BLOCK_ROLE_AND_VOICE


def test_the_block_holds_the_doctrine() -> None:
    lowered = BLOCK_ROLE_AND_VOICE.lower()
    # c26 — aucune probabilité.
    assert "%" not in BLOCK_ROLE_AND_VOICE and "chance" not in lowered and "probabilit" not in lowered
    # c58 — rien de protégé n'oriente la lecture (le rôle professionnel n'en est pas un).
    for word in ("âge", "jeune", "genre", "nationalit", "situation familiale", "photo"):
        assert word not in lowered, word
    # Tutoiement fixe dans l'application (décision du 12/09/2026). Témoin
    # voisin : « rendez-vous » n'est pas un vouvoiement — la première version
    # de cette garde (`\bvous\b`) l'attrapait.
    vouvoiement = re.compile(r"(?<![\w-])vous(?![\w-])")
    assert vouvoiement.search(lowered) is None
    assert "rendez-vous" in lowered and vouvoiement.search("pouvez-vous me dire") is None
    assert vouvoiement.search("je vous propose") is not None


def test_the_block_is_inserted_once_between_the_tone_and_the_format_in_the_cached_head() -> None:
    assert "app.prompts.laura_role_and_voice" in inspect.getsource(bellum_advisor)
    assert BLOCK_ROLE_AND_VOICE and BARE.count(BLOCK_ROLE_AND_VOICE) == 1
    assert BARE.index(_BLOCK_LAURA) < BARE.index(BLOCK_ROLE_AND_VOICE) < BARE.index(_BLOCK_FORMAT)
    assert BLOCK_ROLE_AND_VOICE in BARE.split(CACHE_SEGMENT_BREAK, 1)[0]


# ── 5. #1929.6 — hors périmètre : livré par la vague 2, sans garde de contenu ─

_OUT_OF_SCOPE_FRAGMENTS = (
    "HORS PÉRIMÈTRE.",
    "une réponse BRÈVE",
    "puis tu ramènes la conversation vers un usage du produit",
    "tu ne refuses JAMAIS sèchement",
)


def test_1929_6_out_of_scope_is_short_then_back_to_the_product_on_one_line() -> None:
    lines = _lines_with(BARE, _OUT_OF_SCOPE_FRAGMENTS[0])
    assert len(lines) == 1
    assert [f for f in _OUT_OF_SCOPE_FRAGMENTS if f not in lines[0]] == []


def test_1929_6_no_fragment_survives_the_removal_of_its_block() -> None:
    degraded = BARE.replace(_BLOCK_OUT_OF_SCOPE, "")
    assert len(degraded) < len(BARE)
    assert [f for f in _OUT_OF_SCOPE_FRAGMENTS if f in degraded] == []
