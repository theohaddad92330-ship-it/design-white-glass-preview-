"""#2778 — LA GARDE DE COUVERTURE OUTIL → CARTE (LECTURE).

Équivalent, côté LECTURE, de `chat-actions-cross-language.test.ts`
(`apps/web/src/architecture`) côté ÉCRITURE : celle-là garde qu'une action
ÉMISE par le service IA sait être RENDUE par le web (`pending_actions`) ;
celle-ci garde qu'un outil de LECTURE de `CHAT_TOOLS` (tout outil absent de
`WRITE_TOOL_NAMES`) est CLASSÉ — en carte structurée avec le bon type, ou en
texte libre avec une raison réelle — jamais silencieusement oublié.

Quatre lots (25-26/09/2026) ont câblé neuf outils sans registre : « ce qui
reste » se retrouvait par un `grep` manuel sur ~90 outils à chaque lot, sans
rien pour repérer qu'un futur outil de lecture pourrait rester des mois sans
carte ni raison écrite. Le registre est `chat_read_tool_card_coverage.py`
(GA-26 : un seul endroit) ; cette garde vérifie qu'il dit VRAI.
"""

from __future__ import annotations

from app.models.reply_blocks import REPLY_BLOCK_TYPES
from app.services.chat_read_tool_card_coverage import CHAT_READ_TOOL_CARD_COVERAGE, CardCoverage, TextCoverage
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES


def _read_tool_names() -> list[str]:
    return [t["name"] for t in CHAT_TOOLS if t["name"] not in WRITE_TOOL_NAMES]


def _descriptions() -> dict[str, str]:
    out: dict[str, str] = {}
    for tool in CHAT_TOOLS:
        description = tool["description"]
        out[tool["name"]] = "".join(description) if isinstance(description, tuple) else description
    return out


def test_lit_quelque_chose() -> None:
    """Sans ce témoin, un `CHAT_TOOLS` vidé ou un registre vidé rendrait la
    garde verte en comparant deux ensembles vides — exactement le défaut
    qu'elle traque."""
    assert len(CHAT_TOOLS) >= 80
    assert len(WRITE_TOOL_NAMES) >= 10
    assert len(_read_tool_names()) >= 60
    assert len(CHAT_READ_TOOL_CARD_COVERAGE) >= 60


def test_chaque_outil_de_lecture_est_classe_rien_que_les_outils_de_lecture() -> None:
    read = set(_read_tool_names())
    registered = set(CHAT_READ_TOOL_CARD_COVERAGE)
    non_classes = sorted(read - registered)
    assert non_classes == [], f"outils de lecture non classés : {non_classes}"
    orphelins = sorted(registered - read)
    assert orphelins == [], f"classés mais plus des outils de lecture (écriture, ou outil retiré) : {orphelins}"


def test_chaque_carte_declaree_est_un_type_reel_du_contrat() -> None:
    for name, coverage in CHAT_READ_TOOL_CARD_COVERAGE.items():
        if isinstance(coverage, CardCoverage):
            assert coverage.card_type in REPLY_BLOCK_TYPES, f"{name}: type de carte inconnu « {coverage.card_type} »"


def test_chaque_carte_declaree_est_reellement_instruite_dans_la_description() -> None:
    descriptions = _descriptions()
    for name, coverage in CHAT_READ_TOOL_CARD_COVERAGE.items():
        if isinstance(coverage, CardCoverage):
            literal = f"carte `{coverage.card_type}`"
            assert literal in descriptions[name], f"{name}: sa description ne mentionne pas « {literal} »"


def test_chaque_texte_libre_porte_une_raison_reelle_pas_un_alibi() -> None:
    forbidden = ("plusieurs jours", "hors lot", "trop risqué", "pas encore fait", "todo", "à trancher plus tard")
    for name, coverage in CHAT_READ_TOOL_CARD_COVERAGE.items():
        if isinstance(coverage, TextCoverage):
            assert len(coverage.reason) >= 40, f"{name}: raison trop courte pour être une vraie raison"
            lowered = coverage.reason.lower()
            for phrase in forbidden:
                assert phrase not in lowered, f"{name}: raison-alibi détectée ({phrase!r})"


def test_les_quatorze_cartes_ont_leur_etat_honnetement_dit() -> None:
    """Térmoin positif : `action_plan` et `approach` restent à ZÉRO instruction
    dans CE registre — un audit honnête n'a trouvé aucun outil de LECTURE de
    `CHAT_TOOLS` dont la forme colle sans forcer (`plan_laura_job` écarté :
    mécanisme `LauraJobService` propre ; `describe_plan` écarté : silencieux
    par construction, D§12, voyage par la barre de plan `CopilotCards`, jamais
    un `ReplyBlock`). Ce test échoue le jour où quelqu'un les câble sur UN
    outil (à mettre à jour), et RAPPELLE qu'ils existent tant que personne ne
    l'a fait — jamais un silence qui les oublie.

    Réaudité lot b (27/09/2026) : les deux restent HORS de ce registre par
    CONCEPTION, pas par oubli. `app/prompts/reply_formats.py:37-55` les
    instruit déjà — `action_plan` et `approach` sont des formats de réponse
    GÉNÉRAUX que le modèle compose lui-même (« une approche commerciale... se
    rend en carte approach », « action_plan s'y ajoute seulement quand il y a
    des étapes à enchaîner »), au même titre que `verdict`/`comparison`/etc. —
    jamais le résultat BRUT d'UN outil de lecture précis. Router l'un des deux
    sur un outil qui ne produit pas cette forme (ex. `get_account_preflight`,
    dont le CTA recommandé est UNE action, pas une approche à trois champs)
    forcerait une carte qui ne correspond pas — la doctrine que ce module
    porte lui-même (`_NEW_VARIANT`, ligne ~67) refuse nommément ce geste.

    Réaudité lot Q11 (30/09/2026) : `consultant_brief` (#3340) les rejoint pour
    la MÊME raison — le brief provisoire naît de ce que l'utilisateur DÉCRIT
    dans la conversation (jamais du résultat brut d'un outil de lecture précis),
    et `_BLOCK_CONSULTANT_BRIEF` l'instruit déjà comme forme de réponse GÉNÉRALE.
    Aucun outil de lecture existant ne rend « le brief provisoire d'un
    consultant » : le router de force sur `search_consultants` ou un outil
    voisin produirait une fiche VÉRIFIÉE, pas un brief PROVISOIRE — les deux
    natures que #3341 (`_BLOCK_CONSULTANT_QUALIFICATION_LEVELS`) distingue
    justement en niveaux.

    Réaudité lot ED (30/09/2026) : `count_contract` les rejoint, et l'état est
    dit honnêtement — la carte n'est routée sur AUCUN outil de ce registre
    parce qu'elle n'est pas le résultat d'UN outil : `reply_formats.py` ne
    l'instruit que « quand un résultat d'outil porte DÉJÀ un `count_contract` »
    (`chat_tools.py` le joint en champ aux résultats qui comptent, via
    `build_count_contract`), et le modèle en recopie les champs. Un routage de
    force sur un outil serait un second chemin pour un contrat qui n'en a
    qu'un."""
    covered_types = {c.card_type for c in CHAT_READ_TOOL_CARD_COVERAGE.values() if isinstance(c, CardCoverage)}
    assert covered_types == {
        "comparison",
        "account_card",
        "consultant_shortlist",
        "account_ranking",
        "timeline",
        "verdict",
        "contact_list",
        "missing_data",
        "meeting_brief",
        "file_export",
    }
    still_zero = set(REPLY_BLOCK_TYPES) - covered_types
    # #3392 / #3428 — `account_volume_sprint` les rejoint pour la MÊME raison :
    # le sprint naît d'une demande de VOLUME dans la conversation (jamais du
    # résultat brut d'un outil de lecture précis), instruit comme forme de
    # réponse GÉNÉRALE par `_BLOCK_ACCOUNT_VOLUME_SPRINT`.
    # #3758 (BEL-LAU-1001) — `account_map` les rejoint, état dit honnêtement : la
    # cartographie n'est le résultat BRUT d'aucun outil de lecture précis (elle
    # range par groupe ce que plusieurs outils ont rendu) ; c'est la FAMILLE de la
    # demande (`app/services/reply_family.py`) qui l'exige, par la consigne du tour.
    # #3762 — `account_map` aussi : la cartographie naît d'une demande d'ouvrir un
    # périmètre (jamais du résultat brut d'UN outil de lecture), instruite comme
    # forme de réponse GÉNÉRALE par `reply_formats.py` (CARTOGRAPHIE DE COMPTES).
    # #3758 (reste du lot J14) — `post_meeting_summary` les rejoint, mais pour
    # une raison DIFFÉRENTE des six ci-dessus : elle n'est PAS sans source.
    # `get_account_briefing` la lit réellement (`last_meeting_recap`,
    # `notes.meeting_recap_snapshot`), mais ce registre classe la forme
    # PRINCIPALE que chaque outil DÉCLARE dans sa description (ici
    # `account_card`, vérifié plus bas) — pas une lecture secondaire posée à
    # côté. La carte est bâtie par `known_shape_gate.meeting_recap_block_
    # from_account_briefing`, la MÊME famille de mécanisme que `verdict_block`
    # / `contact_block` (hors de ce registre, eux aussi), jamais câblée comme
    # le « card_type » d'un outil dans ce fichier.
    # #2985 (lot E07) — `manager_review` les rejoint, MÊME mécanisme : bâtie par
    # `known_shape_gate.manager_review_block_from_tool` du seul résultat de
    # `get_account_manager_review`, hors du registre générique.
    assert still_zero == {
        "action_plan",
        "approach",
        "consultant_brief",
        "account_volume_sprint",
        "count_contract",
        "account_map",
        "post_meeting_summary",
        "manager_review",
    }


def test_sait_dire_non_un_outil_non_classe_est_reproche() -> None:
    """SAIT DIRE NON — la logique de la garde, isolée de `CHAT_TOOLS` réel :
    un outil de lecture fictif absent du registre est bien repéré."""
    fake_read_tools = {"compare_accounts", "un_outil_jamais_classe"}
    fake_registry = {"compare_accounts": CardCoverage("comparison")}
    non_classes = sorted(fake_read_tools - set(fake_registry))
    assert non_classes == ["un_outil_jamais_classe"]


def test_sait_dire_non_une_carte_non_instruite_est_reprochee() -> None:
    """SAIT DIRE NON — un registre qui PRÉTEND une carte que la description ne
    porte pas encore est repéré, pas laissé passer parce que le nom du type
    existe dans le contrat."""
    fake_descriptions = {"un_outil": "Une description qui ne parle d'aucune carte."}
    fake_registry = {"un_outil": CardCoverage("verdict")}
    for name, coverage in fake_registry.items():
        literal = f"carte `{coverage.card_type}`"
        assert literal not in fake_descriptions[name]


def test_n_attrape_pas_ce_qu_elle_ne_vise_pas_un_outil_d_ecriture_reste_hors_registre() -> None:
    """Le sens est à SENS UNIQUE : un outil d'ÉCRITURE (dans `WRITE_TOOL_NAMES`)
    n'a pas à apparaître dans ce registre, et sa présence dans `CHAT_TOOLS`
    sans y être ne fait pas rougir la garde — les cartes d'action sont déjà
    couvertes ailleurs (`chat-actions-cross-language.test.ts`)."""
    write_tool_names = WRITE_TOOL_NAMES
    assert not (write_tool_names & set(CHAT_READ_TOOL_CARD_COVERAGE))
