"""#2301 (LAU-FINAL-042) — le compilateur PUR de la prélecture de compte.

Mesuré le 18/09 puis reconfirmé le 22/09 : les 17 SOURCES existent déjà
ailleurs dans le produit (fiche compte, entités Postgres), mais **aucune
commande `/chat` ne les assemble** en une prélecture conversationnelle — 0
résultat pour `prelecture`/`snapshot`/`account_preflight` dans
`chat_tools.py`. Ce fichier teste le compilateur qui comble ce trou,
indépendamment de l'I/O (aucun Supabase, aucun HTTP ici — voir
`test_chat_account_preflight_tool.py` pour l'appelant `/chat`).

Règles de doctrine vérifiées ici, point par point du registre
(`.claude/notes/registre-2026-09-18-chat-account-preflight.md`) :

* #2301.17 — la donnée d'ÉQUIPE/permission est nommée ABSENTE, jamais devinée
  (aucun modèle d'équipe n'existe dans ce produit — RLS mono-utilisateur).
* #2301.18/.19 — sections « identité » et « relation workspace » assemblées
  depuis les colonnes RÉELLES de `accounts` (pas de recalcul).
* #2301.21 — les contacts (déjà rendus par `get_account_contacts`) rejoignent
  la prélecture ; la COUVERTURE (`coverage.service.ts`) reste un pont absent,
  nommé comme tel.
* #2301.22/.23/.24 — besoins confirmés (absent, aucun pont), signaux actuels
  et observations structurelles (réels, colonnes `recent_signals` /
  `it_challenges`).
* #2301.27 — les inconnues qui changent la décision sont NOMMÉES (section 10),
  jamais silencieuses.
* #2301.29 — un même objet (signal, observation, contact) n'apparaît jamais
  deux fois.
* #2301.34-38 — les CTA proposés pointent tous vers un outil RÉEL et
  exécutable, jamais une action fantôme.
* #2301.39 — la préférence va à « répondre avec l'existant » quand ça suffit.
* #2301.40 (NO-GO) — jamais de CTA « lancer l'analyse complète » sans que les
  sections déjà connues voyagent dans LE MÊME résultat.
"""

from __future__ import annotations

from app.services.compilers.account_preflight import ACCOUNT_PREFLIGHT_TOOL, _build_ctas, compile_account_preflight


def _account(**overrides: object) -> dict:
    base: dict[str, object] = {
        "id": "acc-1",
        "company_name": "Client Test",
        "commercial_status": "watching",
    }
    base.update(overrides)
    return base


# ── Tool spec ────────────────────────────────────────────────────────────────


def test_tool_spec_declares_account_id_as_required() -> None:
    assert ACCOUNT_PREFLIGHT_TOOL["name"] == "get_account_preflight"
    assert ACCOUNT_PREFLIGHT_TOOL["input_schema"]["required"] == ["account_id"]


def test_tool_spec_tells_laura_to_lead_with_an_open_conflict() -> None:
    """#190.8 (épopée #3219) — `data_conflicts` traversait déjà la façade
    (commit précédent) mais AUCUN texte, nulle part dans les prompts, ne
    nommait cette clé : la donnée était de bout en bout, mais invisible pour
    l'utilisateur — Laura n'avait aucune raison de la lire dans le JSON de
    l'outil plutôt que de l'ignorer. `git grep -n "data_conflicts"` sur
    `apps/ia/app/prompts/` et `chat_tools.py` avant ce commit : 0 résultat."""
    assert "data_conflicts" in ACCOUNT_PREFLIGHT_TOOL["description"]


def test_tool_spec_asks_laura_to_give_the_recheck_date() -> None:
    """#190.1 (lot E1 30/09) — `nextCheck` traverse la façade (dict passthrough) ;
    sans consigne, Laura n'aurait aucune raison de le lire."""
    assert "nextCheck" in ACCOUNT_PREFLIGHT_TOOL["description"]


def test_tool_spec_tells_laura_to_list_the_unsourced_route_criteria_explicitly() -> None:
    """#3278.2 (recette prod 08/10) — `not_evaluable_criteria` (commercial_route)
    traverse déjà la façade (lot R10, 07/10 — `_commercial_route_section`) mais
    AUCUN texte, nulle part dans les prompts, ne nommait cette clé : même trou
    que `data_conflicts` avant #190.8. En recette, Laura annonçait la route
    puis évoquait en prose les RÔLES du comité d'achat (`budget`, `champion`…)
    plutôt que la LISTE des critères de route sans source — les deux listes
    existent dans le JSON de l'outil, rien ne disait laquelle citer pour
    laquelle. `git grep -n "not_evaluable_criteria" apps/ia/app/prompts/
    apps/ia/app/services/chat_tools.py` avant ce commit : 0 résultat."""
    description = ACCOUNT_PREFLIGHT_TOOL["description"]
    assert "not_evaluable_criteria" in description
    assert "liste" in description.lower()


def test_tool_spec_gives_a_verbatim_example_of_the_unsourced_criteria_list() -> None:
    """#3278 (recette prod 08/10, lot V12) — le KO du lot V03 : malgré
    l'instruction « une LISTE explicite, jamais une prose », Laura a répondu
    en prose ET avec des libellés INVENTÉS (« le référencement, l'achat
    externe... ») qui ne correspondent à AUCUN `label` réel de
    `STRATEGY_SELECTION_CRITERIA` (`opening_movement.py`) — ni les anciens
    libellés cités par les lots précédents (réseau existant, panel...), qui
    ne sont plus ceux du code depuis le refactor vers des noms métier
    (périmètre de la mission, objectifs du compte, rôles disponibles côté
    client, processus d'achat, partenaires déjà identifiés, historique de la
    relation, fenêtre de temps).

    Une instruction abstraite n'a pas suffi : un exemple CONCRET, avec les
    VRAIS libellés, réduit le risque qu'un prochain tour en invente d'autres
    ou retombe en prose. L'exemple cite le label EXACT, verbatim, jamais une
    paraphrase."""
    description = ACCOUNT_PREFLIGHT_TOOL["description"]
    assert "verbatim" in description.lower()
    for real_label in (
        "périmètre de la mission",
        "objectifs du compte",
        "rôles disponibles côté client",
        "processus d'achat",
        "partenaires déjà identifiés",
        "historique de la relation",
        "fenêtre de temps",
    ):
        assert real_label in description


# ── #2301.18 — identité et périmètres connus ────────────────────────────────


def test_identity_section_reads_real_columns_never_invents() -> None:
    account = _account(
        sector="IT",
        siren="123456789",
        group_role="filiale",
        group_head_siren="987654321",
        subsidiaries=["Filiale A", "Filiale B"],
        workspace_id="ws-1",
    )
    result = compile_account_preflight(account, crm_connected=True)
    identity = result["known_sections"]["identity"]
    assert identity["known"] is True
    assert identity["sector"] == "IT"
    assert identity["group_role"] == "filiale"
    assert identity["subsidiaries"] == ["Filiale A", "Filiale B"]
    assert identity["workspace_scoped"] is True
    assert identity["crm_known"] is True
    # Jamais inventé : un champ absent ne prend ni "" ni 0.
    assert "revenue" not in identity


def test_identity_never_fabricates_when_account_is_sparse() -> None:
    account = {"id": "acc-2", "company_name": "Sparse SAS"}
    result = compile_account_preflight(account)
    identity = result["known_sections"]["identity"]
    assert identity["known"] is True
    assert identity["crm_known"] is False
    assert identity["workspace_scoped"] is False
    assert "subsidiaries" not in identity
    assert "siren" not in identity


# ── #2285.2 (épopée #2786) — Laura ne recalcule plus localement sa vérité ───
#
# `company_name`/`sector`/`headquarters` avaient un SEUL candidat ici : la
# ligne `accounts` brute. La façade canonique (`AccountIntelligenceContextService`,
# la même que la fiche compte) en connaît d'autres — une correction humaine,
# DataForge — et gagne l'arbitrage quand la colonne brute est vide. Un champ
# blanc en base mais connu par DataForge restait donc invisible à Laura alors
# que l'écran le montrait : deux surfaces, deux réponses (#2285.23, NO-GO).


def test_identity_uses_the_canonical_facade_when_it_knows_more_than_the_raw_row() -> None:
    account = _account(sector=None)
    intelligence_context = {
        "sector": {
            "state": "known",
            "value": "Défense",
            "provenance": {"source": "dataforge", "observedAt": "2026-09-01T00:00:00.000Z"},
        },
        "headquarters": {"state": "unknown"},
    }
    result = compile_account_preflight(account, intelligence_context=intelligence_context)
    identity = result["known_sections"]["identity"]
    assert identity["sector"] == "Défense"
    assert "headquarters" not in identity


def test_identity_falls_back_to_the_raw_account_row_without_the_facade() -> None:
    """Pont éteint ou façade indisponible côté API : chemin identique à avant
    #2285.2 — jamais une vérité inventée à la place de la lecture brute."""
    account = _account(sector="IT")
    result = compile_account_preflight(account, intelligence_context=None)
    assert result["known_sections"]["identity"]["sector"] == "IT"


def test_identity_ignores_a_blank_canonical_value() -> None:
    """Le compilateur ne fait confiance à AUCUNE source aveuglément : une
    valeur canonique blanche ne remplace pas une lecture brute réelle."""
    account = _account(sector="IT")
    intelligence_context = {"sector": {"state": "known", "value": "   "}}
    result = compile_account_preflight(account, intelligence_context=intelligence_context)
    assert result["known_sections"]["identity"]["sector"] == "IT"


# ── #2301.19 — relation actuelle avec le workspace ──────────────────────────


def test_workspace_relationship_reads_commercial_status() -> None:
    account = _account(commercial_status="opportunity", priority_gate="prioritised")
    result = compile_account_preflight(account)
    relationship = result["known_sections"]["workspace_relationship"]
    assert relationship == {"known": True, "commercial_status": "opportunity", "priority_gate": "prioritised"}


def test_workspace_relationship_is_named_unknown_when_absent() -> None:
    account = {"id": "acc-3", "company_name": "Sans statut"}
    result = compile_account_preflight(account)
    relationship = result["known_sections"]["workspace_relationship"]
    assert relationship["known"] is False
    assert "reason" in relationship
    assert {"section": "workspace_relationship", "reason": relationship["reason"]} in result["unknowns"]


# ── #2301.17 — équipe/permissions : source absente, jamais devinée ─────────


def test_team_scope_is_named_absent_never_an_empty_list_pretending_to_be_known() -> None:
    result = compile_account_preflight(_account())
    team_scope = result["known_sections"]["team_scope"]
    assert team_scope["known"] is False
    assert "reason" in team_scope
    assert {"section": "team_scope", "reason": team_scope["reason"]} in result["unknowns"]


def test_team_scope_is_named_absent_on_a_bridge_error() -> None:
    result = compile_account_preflight(_account(), commercial_load={"error": "bridge_unreachable"})
    team_scope = result["known_sections"]["team_scope"]
    assert team_scope["known"] is False


# ── #3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale ») :
# modèle d'équipe MINIMAL — la charge DÉJÀ déclarée (Réglages › Charge
# commerciale), jamais un modèle d'équipe multi-utilisateur inventé ─────────


def test_team_scope_names_the_consultant_and_the_declared_capacity_when_the_bridge_answers() -> None:
    commercial_load = {
        "consultant": {"user_id": "u-1", "name": "Sarah Martin"},
        "maxTrackedAccounts": 40,
        "trackedAccountsCount": 12,
        "weeklyAvailableHours": 32,
    }
    result = compile_account_preflight(_account(), commercial_load=commercial_load)
    team_scope = result["known_sections"]["team_scope"]
    assert team_scope["known"] is True
    assert team_scope["consultant"] == {"user_id": "u-1", "name": "Sarah Martin"}
    assert team_scope["max_tracked_accounts"] == 40
    assert team_scope["tracked_accounts_count"] == 12
    assert team_scope["weekly_available_hours"] == 32
    assert team_scope["at_capacity"] is False
    assert "missing_prerequisite" not in team_scope
    unknown_sections = {u["section"] for u in result["unknowns"]}
    assert "team_scope" not in unknown_sections


def test_team_scope_names_a_missing_prerequisite_when_the_consultant_is_at_capacity() -> None:
    commercial_load = {
        "consultant": {"user_id": "u-1", "name": "Sarah Martin"},
        "maxTrackedAccounts": 10,
        "trackedAccountsCount": 10,
        "weeklyAvailableHours": None,
    }
    result = compile_account_preflight(_account(), commercial_load=commercial_load)
    team_scope = result["known_sections"]["team_scope"]
    assert team_scope["known"] is True
    assert team_scope["at_capacity"] is True
    assert "Sarah Martin" in team_scope["missing_prerequisite"]
    assert "10" in team_scope["missing_prerequisite"]


def test_team_scope_is_known_without_a_prerequisite_when_the_cap_is_not_configured() -> None:
    """Plafond NON RENSEIGNÉ : un FAIT connu (non renseigné), jamais un 0
    devinée qui bloquerait l'ouverture du compte (GA-18/GA-19)."""
    commercial_load = {
        "consultant": {"user_id": "u-1", "name": "Sarah Martin"},
        "maxTrackedAccounts": None,
        "trackedAccountsCount": 5,
        "weeklyAvailableHours": None,
    }
    result = compile_account_preflight(_account(), commercial_load=commercial_load)
    team_scope = result["known_sections"]["team_scope"]
    assert team_scope["known"] is True
    assert team_scope["max_tracked_accounts"] is None
    assert team_scope["at_capacity"] is False
    assert "missing_prerequisite" not in team_scope


# ── #2301.21 — contacts et couverture ───────────────────────────────────────


def test_contacts_known_when_bridge_answered_and_deduplicated() -> None:
    contacts = {
        "contacts": [
            {"contact_id": "c-1", "full_name": "A"},
            {"contact_id": "c-1", "full_name": "A"},  # doublon (#2301.29)
            {"contact_id": "c-2", "full_name": "B"},
        ],
        "total": 2,
        "truncated": False,
    }
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True)
    section = result["known_sections"]["contacts_and_coverage"]
    assert section["contacts"]["known"] is True
    assert [c["contact_id"] for c in section["contacts"]["contacts"]] == ["c-1", "c-2"]
    # La couverture n'a pas de pont /chat : nommée absente, jamais devinée.
    assert section["coverage"]["known"] is False
    assert "reason" in section["coverage"]


def test_contacts_unknown_when_bridge_not_configured() -> None:
    result = compile_account_preflight(_account(), contacts=None, contacts_available=False)
    section = result["known_sections"]["contacts_and_coverage"]
    assert section["contacts"]["known"] is False
    assert "reason" in section["contacts"]


def test_contacts_unknown_when_bridge_errors() -> None:
    result = compile_account_preflight(_account(), contacts={"error": "account_not_found"}, contacts_available=True)
    section = result["known_sections"]["contacts_and_coverage"]
    assert section["contacts"]["known"] is False


# ── #2301.22 — besoins confirmés : pont absent ──────────────────────────────


def test_confirmed_needs_is_named_absent() -> None:
    result = compile_account_preflight(_account())
    needs = result["known_sections"]["confirmed_needs"]
    assert needs["known"] is False
    assert "reason" in needs


# ── #2301.23 — signaux actuels (réel, colonne `recent_signals`) ────────────


def test_current_signals_reads_real_column_and_a_real_empty_list_is_known() -> None:
    result = compile_account_preflight(_account(recent_signals=[]))
    signals = result["known_sections"]["current_signals"]
    assert signals == {"known": True, "signals": [], "truncated": False}


def test_current_signals_deduplicates_by_id_never_counts_twice() -> None:
    raw = [
        {"id": "s1", "signal": "Recrutement DSI", "date": "2026-09-01"},
        {"id": "s1", "signal": "Recrutement DSI", "date": "2026-09-01"},
        {"id": "s2", "signal": "Appel d'offres", "date": "2026-09-10"},
    ]
    result = compile_account_preflight(_account(recent_signals=raw))
    signals = result["known_sections"]["current_signals"]["signals"]
    assert [s["id"] for s in signals] == ["s1", "s2"]


def test_current_signals_deduplicates_without_id_by_content() -> None:
    raw = [
        {"signal": "Recrutement DSI", "date": "2026-09-01", "source": "France Travail"},
        {"signal": "Recrutement DSI", "date": "2026-09-01", "source": "France Travail"},
    ]
    result = compile_account_preflight(_account(recent_signals=raw))
    assert len(result["known_sections"]["current_signals"]["signals"]) == 1


# #2547 (recette prod 07/10, ARQUUS) — la fiche affichait dix signaux, dont
# « Defence Procurement International » ; Laura n'en citait aucun (nature, date,
# source absentes). La fiche fusionne `raw_analysis.recentSignals` ET la colonne
# `recent_signals` (`watchData.ts`) : Laura lit les DEUX, comme l'écran.
def test_2547_arquus_like_signals_of_the_analysis_are_read_with_nature_date_source() -> None:
    analysis_signals = [
        {
            "id": f"s{i}",
            "type": "tender" if i == 1 else "news",
            "signal": "Defence Procurement International" if i == 1 else f"Signal {i}",
            "date": f"2026-09-{i:02d}",
            "source": "Registre public" if i == 1 else "Presse",
        }
        for i in range(1, 11)
    ]
    account = _account(recent_signals=[])
    account["raw_analysis"] = {"recentSignals": analysis_signals}
    signals = compile_account_preflight(account)["known_sections"]["current_signals"]["signals"]
    assert len(signals) == 10
    dpi = next(s for s in signals if s["signal"] == "Defence Procurement International")
    assert (dpi["type"], dpi["date"], dpi["source"]) == ("tender", "2026-09-01", "Registre public")


def test_2547_the_same_signal_in_both_sources_is_counted_once() -> None:
    same = {"id": "s1", "signal": "Recrutement DSI", "date": "2026-09-01", "source": "France Travail"}
    other_with_same_id = {"id": "s1", "signal": "Appel d'offres", "date": "2026-09-10", "source": "BOAMP"}
    account = _account(recent_signals=[same])
    account["raw_analysis"] = {"recentSignals": [dict(same), other_with_same_id]}
    signals = compile_account_preflight(account)["known_sections"]["current_signals"]["signals"]
    assert sorted(s["signal"] for s in signals) == ["Appel d'offres", "Recrutement DSI"]


# ── #2301.24 — observations structurelles (réel, colonne `it_challenges`) ──


def test_structural_observations_reads_real_column_and_deduplicates() -> None:
    raw = [
        {"title": "ERP vieillissant", "description": "SAP 2009"},
        {"title": "ERP vieillissant", "description": "SAP 2009"},
    ]
    result = compile_account_preflight(_account(it_challenges=raw))
    observations = result["known_sections"]["structural_observations"]
    assert observations["known"] is True
    assert len(observations["observations"]) == 1


# ── #2791 — sièges du comité d'achat propres au SECTEUR, sans contact ─────
#
# Recette écran 27/09 : « comité d'achat Roche » (pharma) ne nommait que des
# catégories génériques. La prélecture nomme désormais les sièges qu'un
# secteur CONNU impose — jamais un contact deviné, jamais un secteur non
# couvert nommé (liste vide, un FAIT, jamais une inconnue).


def test_sector_buying_roles_names_pharma_seats_without_any_contact() -> None:
    result = compile_account_preflight(_account(sector="Industrie pharmaceutique"))
    section = result["known_sections"]["sector_buying_roles"]
    assert section["known"] is True
    assert "Pharmacovigilance" in section["named_seats"]
    assert "Affaires réglementaires" in section["named_seats"]


def test_sector_buying_roles_names_automobile_seats_without_any_contact() -> None:
    result = compile_account_preflight(_account(sector="Équipementier automobile"))
    section = result["known_sections"]["sector_buying_roles"]
    assert "Direction de programme" in section["named_seats"]


def test_sector_buying_roles_is_an_empty_list_never_an_unknown_for_an_uncovered_sector() -> None:
    result = compile_account_preflight(_account(sector="Banque de détail"))
    section = result["known_sections"]["sector_buying_roles"]
    assert section == {"known": True, "named_seats": []}
    assert "sector_buying_roles" not in {u["section"] for u in result["unknowns"]}


# ── #2311.26 — Laura formule une sortie priorisée en langage naturel ───────
#
# Le comité d'achat (rôles + matrice Pouvoir/Intérêt) est assemblé et rendu en
# langage naturel depuis longtemps (`assemble_buying_committee`,
# `committee_prompt_block`) — mais seulement pour le PLAN async
# (`phase4_plan.py`). Aucun outil `/chat` ne l'appelait : Laura ne pouvait pas
# répondre « qui est au comité d'achat » avec la même matière que le dossier.
# Réutilise les deux fonctions pures et déjà testées, GA-26 (un calcul,
# jamais deux) — jamais un second moteur de classification.

_CONTACT_MEMBER = {"contact_id": "c-1", "full_name": "Jeanne Dupont", "title": "DSI"}


def test_buying_committee_narrative_appears_when_contacts_are_known() -> None:
    contacts = {"contacts": [_CONTACT_MEMBER], "total": 1, "truncated": False}
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True)
    section = result["known_sections"]["buying_committee"]
    assert section["known"] is True
    assert "Jeanne Dupont" in section["narrative"]
    assert section["summary"]


def test_buying_committee_is_named_absent_without_a_contacts_bridge() -> None:
    result = compile_account_preflight(_account(), contacts=None, contacts_available=False)
    section = result["known_sections"]["buying_committee"]
    assert section["known"] is False
    assert "reason" in section
    assert {"section": "buying_committee", "reason": section["reason"]} in result["unknowns"]


def test_buying_committee_narrative_reorders_by_objective_without_dropping_members() -> None:
    contacts = {
        "contacts": [
            _CONTACT_MEMBER,  # DSI → decider (« DÉCIDEURS À CONVAINCRE »)
            {"contact_id": "c-2", "full_name": "Marc Petit", "title": "Directeur de la Transformation"},  # champion
        ],
        "total": 2,
        "truncated": False,
    }
    default_result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True)
    sell_result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True, objective="vendre")
    default_narrative = default_result["known_sections"]["buying_committee"]["narrative"]
    sell_narrative = sell_result["known_sections"]["buying_committee"]["narrative"]
    assert default_narrative != sell_narrative
    assert "Jeanne Dupont" in sell_narrative and "Marc Petit" in sell_narrative
    assert sell_narrative.index("DÉCIDEURS À CONVAINCRE") < sell_narrative.index("CHAMPIONS")
    assert default_narrative.index("CHAMPIONS") < default_narrative.index("DÉCIDEURS À CONVAINCRE")


def test_buying_committee_is_a_known_fact_with_no_narrative_when_no_member_is_classifiable() -> None:
    contacts = {"contacts": [], "total": 0, "truncated": False}
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True)
    section = result["known_sections"]["buying_committee"]
    assert section["known"] is True
    assert "narrative" not in section


# ── #2311.27 — personnalisation par contexte ESN (taille/GTM) ──────────────
#
# `profile_data` (le profil ESN, déjà résolu pour CHAQUE tour de chat —
# `chat-context.service.ts`) porte `size` depuis longtemps ; jamais lu par le
# comité d'achat jusqu'ici. Doctrine c76 (« le rôle change l'ORDRE, jamais le
# CONTENU ») : `priority_focus` NOMME le membre par lequel commencer, il ne
# retire jamais un membre de `narrative`/`members`.


def test_priority_focus_names_the_top_quadrant_member_for_a_solo_esn() -> None:
    contacts = {"contacts": [_CONTACT_MEMBER], "total": 1, "truncated": False}
    result = compile_account_preflight(
        _account(), contacts=contacts, contacts_available=True, profile_data={"size": "1-5"}
    )
    section = result["known_sections"]["buying_committee"]
    assert section["priority_focus"]["fullName"] == "Jeanne Dupont"


def test_priority_focus_is_absent_for_a_larger_esn() -> None:
    contacts = {"contacts": [_CONTACT_MEMBER], "total": 1, "truncated": False}
    result = compile_account_preflight(
        _account(), contacts=contacts, contacts_available=True, profile_data={"size": "80-300"}
    )
    section = result["known_sections"]["buying_committee"]
    assert "priority_focus" not in section


def test_priority_focus_is_absent_without_a_declared_esn_size() -> None:
    contacts = {"contacts": [_CONTACT_MEMBER], "total": 1, "truncated": False}
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True, profile_data=None)
    section = result["known_sections"]["buying_committee"]
    assert "priority_focus" not in section


# ── #3263 (BEL-SC-234) — MULTITHREADING dans le préflight /chat ─────────────
#
# `evaluate_multithreading` existait déjà pour le comité (fils couverts/
# manquants/dépendance excessive) mais aucun appelant `/chat` ne le lisait —
# même trou que #2311.26 avait comblé pour `committee_prompt_block`. Réutilise
# le MÊME comité déjà assemblé (`assemble_buying_committee`), jamais un second
# calcul (GA-26).


def test_multithreading_section_appears_alongside_the_committee() -> None:
    contacts = {"contacts": [_CONTACT_MEMBER], "total": 1, "truncated": False}
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True)
    section = result["known_sections"]["buying_committee"]
    assert "technical_buyer" in section["multithreading"]["covered_threads"]
    assert "economic_buyer" in section["multithreading"]["missing_threads"]


def test_multithreading_flags_overreliance_on_a_single_named_contact() -> None:
    contacts = {
        "contacts": [
            _CONTACT_MEMBER,
            {"contact_id": "c-2", "full_name": "", "title": "Directeur Financier"},
        ],
        "total": 2,
        "truncated": False,
    }
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True)
    section = result["known_sections"]["buying_committee"]
    assert section["multithreading"]["overreliance"]["fullName"] == "Jeanne Dupont"


def test_multithreading_is_absent_without_a_contacts_bridge() -> None:
    result = compile_account_preflight(_account(), contacts=None, contacts_available=False)
    section = result["known_sections"]["buying_committee"]
    assert "multithreading" not in section


# ── #3263.27 (épopée #3282) — ORDRE D'APPROCHE dans le préflight /chat ─────
#
# Même geste que #3263 pour `multithreading` : `approach_order` existait déjà
# pour le comité (`buying_committee.py`) mais aucun appelant `/chat` ne le
# lisait. Réutilise le MÊME comité déjà assemblé, jamais un second calcul.


def test_approach_order_section_appears_alongside_the_committee() -> None:
    contacts = {
        "contacts": [
            _CONTACT_MEMBER,  # DSI → décideur
            {"contact_id": "c-2", "full_name": "Marc Petit", "title": "Directeur de la Transformation"},  # champion
        ],
        "total": 2,
        "truncated": False,
    }
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True)
    section = result["known_sections"]["buying_committee"]
    assert section["approach_order"][0]["full_name"] == "Marc Petit"
    assert section["approach_order"][0]["committee_role"] == "champion"


def test_approach_order_follows_the_objective_like_the_narrative() -> None:
    contacts = {
        "contacts": [
            _CONTACT_MEMBER,
            {"contact_id": "c-2", "full_name": "Marc Petit", "title": "Directeur de la Transformation"},
        ],
        "total": 2,
        "truncated": False,
    }
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True, objective="vendre")
    section = result["known_sections"]["buying_committee"]
    assert section["approach_order"][0]["full_name"] == "Jeanne Dupont"


def test_approach_order_is_absent_without_a_contacts_bridge() -> None:
    result = compile_account_preflight(_account(), contacts=None, contacts_available=False)
    section = result["known_sections"]["buying_committee"]
    assert "approach_order" not in section


def test_approach_order_is_absent_when_no_member_is_named() -> None:
    contacts = {"contacts": [{"contact_id": "c-1", "full_name": "", "title": "CTO"}], "total": 1, "truncated": False}
    result = compile_account_preflight(_account(), contacts=contacts, contacts_available=True)
    section = result["known_sections"]["buying_committee"]
    assert "approach_order" not in section


# ── #3278.2 — route commerciale et critères SANS source NOMMÉS ─────────────
#
# `strategy_criteria_from_context`/`route_recommendation_from_context`
# existaient déjà (`opening_movement.py`, lus par le PLAN) mais aucune
# commande `/chat` ne les assemblait pour Laura — même trou que #2311.26
# avait comblé pour le comité d'achat. Réutilise le MÊME SalesContext déjà
# persisté par l'analyse (`account.raw_analysis.salesContext`), jamais un
# second calcul.

_SALES_CONTEXT = {
    "esnProfile": {"stage": "etablie"},
    "account": {"archetype": "pme_eti"},
    "relationship": {"state": "froid"},
}


def test_commercial_route_section_names_the_route_and_the_unsourced_criteria() -> None:
    account = _account(raw_analysis={"salesContext": _SALES_CONTEXT})
    result = compile_account_preflight(account, contacts=None, contacts_available=False)
    section = result["known_sections"]["commercial_route"]
    assert section["known"] is True
    assert section["route"] == "direct_accessible"
    assert section["first_door"]
    labels = {c["label"] for c in section["not_evaluable_criteria"]}
    assert "périmètre de la mission" in labels
    assert "partenaires déjà identifiés" in labels
    for criterion in section["not_evaluable_criteria"]:
        assert criterion["reason"] in {"no_source", "not_collected"}


def test_commercial_route_section_relays_a_declared_panel_as_a_restricted_purchasing_criterion() -> None:
    """#3278.2 — le panel/référencement déclaré rend `purchasing` évaluable,
    sous un libellé qui NOMME la restriction ; sans lui, il reste non évaluable."""
    account = _account(raw_analysis={"salesContext": _SALES_CONTEXT})
    with_panel = compile_account_preflight(
        account, contacts=None, contacts_available=False, account_access={"purchasing_panel": "panel_ferme"}
    )["known_sections"]["commercial_route"]
    labels = {c["label"] for c in with_panel["not_evaluable_criteria"]}
    assert "processus d'achat" not in labels
    assert "processus d'achat — panel/référencement connu" not in labels
    assert with_panel["evaluated_purchasing"] == {
        "label": "processus d'achat — panel/référencement connu",
        "panel": "panel_ferme",
    }
    without = compile_account_preflight(account, contacts=None, contacts_available=False)["known_sections"][
        "commercial_route"
    ]
    assert "processus d'achat" in {c["label"] for c in without["not_evaluable_criteria"]}
    assert "evaluated_purchasing" not in without
    silent = compile_account_preflight(
        account, contacts=None, contacts_available=False, account_access={"purchasing_panel": None}
    )["known_sections"]["commercial_route"]
    assert "evaluated_purchasing" not in silent


def test_commercial_route_reaches_the_watch_and_talent_routes_from_the_access_bridge() -> None:
    """#3278.1 (lot M11) — les signaux `route_signals` du pont d'accès rendent
    « veille seule » et « depuis un talent » atteignables ; sans eux, ni l'une
    ni l'autre n'est jamais nommée (et une valeur non booléenne ne compte pas)."""
    account = _account(raw_analysis={"salesContext": _SALES_CONTEXT})

    def route(access):
        return compile_account_preflight(account, contacts=None, contacts_available=False, account_access=access)[
            "known_sections"
        ]["commercial_route"]["route"]

    assert route({"route_signals": {"watch_only": True}}) == "veille_seule"
    assert route({"route_signals": {"talent_from_account": True}}) == "depuis_talent"
    for silent in (None, {}, {"route_signals": {}}, {"route_signals": {"watch_only": "yes"}}):
        assert route(silent) not in {"veille_seule", "depuis_talent"}


def test_commercial_route_reaches_the_event_and_inbound_routes_and_cites_the_declared_fact() -> None:
    """#3278.1 (décision Louis 11/10/2026) — les faits DÉCLARÉS « événement ou communauté » et
    « contenu entrant » (pont d'accès) rendent les deux dernières routes atteignables, et Laura
    les cite tels quels. Sans eux, ni l'une ni l'autre n'est jamais nommée."""
    account = _account(raw_analysis={"salesContext": _SALES_CONTEXT})

    def section(access):
        return compile_account_preflight(account, contacts=None, contacts_available=False, account_access=access)[
            "known_sections"
        ]["commercial_route"]

    event = section({"route_signals": {"event_community": True}, "route_facts": {"event": "Salon Big Data, 12/09"}})
    assert event["route"] == "evenement_communaute"
    assert {"label": "Événement ou communauté", "value": "Salon Big Data, 12/09"} in event["declared_route_facts"]
    inbound = section({"route_signals": {"inbound_content": True}, "route_facts": {"inbound": "Livre blanc IA"}})
    assert inbound["route"] == "inbound_contenu"
    assert {"label": "Contenu entrant", "value": "Livre blanc IA"} in inbound["declared_route_facts"]
    for silent in (None, {}, {"route_signals": {"event_community": "yes"}}):
        got = section(silent)
        assert got["route"] not in {"evenement_communaute", "inbound_contenu"}
        assert "declared_route_facts" not in got


def test_commercial_route_section_reads_the_snake_case_alias() -> None:
    account = _account(raw_analysis={"sales_context": _SALES_CONTEXT})
    result = compile_account_preflight(account, contacts=None, contacts_available=False)
    assert result["known_sections"]["commercial_route"]["known"] is True


def test_commercial_route_is_named_absent_without_a_sales_context() -> None:
    result = compile_account_preflight(_account(), contacts=None, contacts_available=False)
    section = result["known_sections"]["commercial_route"]
    assert section["known"] is False
    assert "reason" in section
    assert {"section": "commercial_route", "reason": section["reason"]} in result["unknowns"]


def test_commercial_route_reaches_the_declared_signal_route() -> None:
    account = _account(raw_analysis={"salesContext": {**_SALES_CONTEXT, "declaredSignalPresent": True}})
    result = compile_account_preflight(account, contacts=None, contacts_available=False)
    section = result["known_sections"]["commercial_route"]
    assert section["route"] == "signal_entrant"


# ── #190.1/#190.8 (épopée #3219) — contradictions de champ OUVERTES ───────


def test_data_conflicts_is_named_absent_without_the_canonical_facade() -> None:
    """Pont /chat éteint ou façade indisponible côté API : l'inconnue est
    NOMMÉE, jamais une liste vide qui laisserait croire qu'on a vérifié."""
    result = compile_account_preflight(_account())
    section = result["known_sections"]["data_conflicts"]
    assert section["known"] is False
    assert {"section": "data_conflicts", "reason": section["reason"]} in result["unknowns"]


def test_data_conflicts_is_a_known_empty_list_when_the_facade_has_nothing_open() -> None:
    """`[]` est un FAIT (aucune contradiction ouverte aujourd'hui), jamais une
    inconnue — GA-18/GA-19."""
    result = compile_account_preflight(_account(), intelligence_context={"conflicts": []})
    section = result["known_sections"]["data_conflicts"]
    assert section == {"known": True, "conflicts": []}
    assert "data_conflicts" not in {u["section"] for u in result["unknowns"]}


def test_data_conflicts_relays_what_the_facade_rendered_never_a_second_computation() -> None:
    """La prélecture ne détecte RIEN elle-même (PDF 6 §5.3 vit dans
    `FieldConflictService`, apps/api) : elle relaie tel quel ce que la façade a
    déjà tranché comme ouvert."""
    conflict = {
        "field": "sector",
        "valueA": {"value": "Banque", "source": "pipeline", "at": "2026-08-14T00:00:00.000Z"},
        "valueB": {"value": "Assurance", "source": "pipeline", "at": "2026-08-18T00:00:00.000Z"},
        "conflictSince": "2026-08-18T00:00:00.000Z",
        "resolvedBy": "unresolved",
    }
    result = compile_account_preflight(_account(), intelligence_context={"conflicts": [conflict]})
    section = result["known_sections"]["data_conflicts"]
    assert section == {"known": True, "conflicts": [conflict]}


def test_data_conflicts_relays_authority_claims_entity_and_the_renamed_statuses() -> None:
    """#190.1/#190.2 (épopée #3219) — `authority`, `claims`, `sourceTypes`,
    `chosenValue`, `entity` et les statuts renommés (`resolved`/
    `workspace_override`/`authority_wins`) sont des champs neufs de la façade
    TS (`ConflictedField`, packages/contracts).
    Cette prélecture les relaie tels quels : elle ne connaît AUCUN de ces noms,
    donc rien ne peut les filtrer en silence — la même preuve « passthrough
    opaque » que le test ci-dessus, refaite avec la forme actuelle."""
    value_a = {"value": "Banque", "source": "pipeline", "at": "2026-08-14T00:00:00.000Z", "authority": 2}
    value_b = {"value": "Assurance", "source": "connector", "at": "2026-08-18T00:00:00.000Z", "authority": 3}
    conflict = {
        "field": "sector",
        "valueA": value_a,
        "valueB": value_b,
        "claims": [value_a, value_b],
        "sourceTypes": ["pipeline", "connector"],
        "conflictSince": "2026-08-18T00:00:00.000Z",
        "resolvedBy": "authority_wins",
        "chosenValue": "Assurance",
        "entity": {"type": "account", "id": "acc-1"},
    }
    result = compile_account_preflight(_account(), intelligence_context={"conflicts": [conflict]})
    section = result["known_sections"]["data_conflicts"]
    assert section == {"known": True, "conflicts": [conflict]}


# ── #2301.27 — inconnues qui changent la décision, section 10 ─────────────


def test_unknowns_names_every_section_without_a_bridge_never_silent() -> None:
    result = compile_account_preflight(_account())
    unknown_sections = {u["section"] for u in result["unknowns"]}
    assert unknown_sections == {
        "team_scope",
        "contacts",
        "coverage",
        "confirmed_needs",
        "buying_committee",
        "crm_match",
        "data_conflicts",
        "past_consultants",
        "commercial_route",
    }


def test_a_known_empty_list_never_becomes_an_unknown() -> None:
    """Un compte réellement sans signal n'est pas une inconnue : c'est un FAIT
    connu (liste vide), pas un pont manquant — GA-18/GA-19."""
    contacts = {"contacts": [], "total": 0, "truncated": False}
    result = compile_account_preflight(_account(recent_signals=[]), contacts=contacts, contacts_available=True)
    unknown_sections = {u["section"] for u in result["unknowns"]}
    assert "current_signals" not in unknown_sections
    assert "contacts" not in unknown_sections


# ── #3182.1/.2 (LAU-FINAL-188) — présence CRM, un prérequis « ouverture
# de compte » que Laura peut retrouver seule plutôt que de le demander ──────
#
# #3892.3 (ADD-SANOFI-06, retour bêta Sanofi 08/10/2026) — section et tests
# RENOMMÉS depuis `crm_referencement` : ce mot désigne PARTOUT ailleurs dans ce
# dépôt le référencement FOURNISSEUR (être un fournisseur approuvé), jamais
# mesuré ici — cette section ne dit qu'un RAPPROCHEMENT de compte dans le CRM.


def test_crm_match_is_named_absent_when_no_crm_is_connected() -> None:
    result = compile_account_preflight(_account())
    match = result["known_sections"]["crm_match"]
    assert match["known"] is False
    assert "reason" in match
    assert {"section": "crm_match", "reason": match["reason"]} in result["unknowns"]


def test_crm_match_is_named_absent_when_the_bridge_does_not_answer() -> None:
    result = compile_account_preflight(_account(), crm_connected=True, crm_presence=None)
    match = result["known_sections"]["crm_match"]
    assert match["known"] is False
    assert "reason" in match


def test_crm_match_names_the_exclusion_rather_than_not_connected_or_the_last_activity() -> None:
    """#3708 (recette prod 09/10) — CRM décoché pour ce fil : une réponse
    citait encore « dernière activité CRM… 31/08 » malgré l'exclusion. Un CRM
    exclu n'est ni « non branché » (c'est branché, juste écarté par un choix
    réversible de ce fil) ni muet sur `last_activity_at` — la raison nomme
    l'exclusion, jamais la donnée qu'elle doit justement taire."""
    presence = {"connected": True, "matched": True, "last_activity_at": "2026-08-31T10:00:00.000Z"}
    result = compile_account_preflight(_account(), crm_connected=True, crm_presence=presence, crm_excluded=True)
    match = result["known_sections"]["crm_match"]
    assert match["known"] is False
    assert "last_activity_at" not in match
    assert "exclu" in match["reason"].lower()
    assert (
        match["reason"]
        != "Aucun CRM branché sur cet espace — la présence de ce compte dans le CRM n'est pas mesurable."
    )


def test_crm_match_relays_the_bridge_unchanged_when_connected() -> None:
    presence = {
        "connected": True,
        "matched": True,
        "contacts_count": 3,
        "open_deals": [{"name": "Migration ERP", "stage": "negotiation", "amount": 45000}],
        "last_activity_at": "2026-09-20T10:00:00.000Z",
    }
    result = compile_account_preflight(_account(), crm_connected=True, crm_presence=presence)
    match = result["known_sections"]["crm_match"]
    assert match["known"] is True
    assert match["matched"] is True
    assert match["contacts_count"] == 3
    assert match["open_deals_count"] == 1
    assert match["last_activity_at"] == "2026-09-20T10:00:00.000Z"
    unknown_sections = {u["section"] for u in result["unknowns"]}
    assert "crm_match" not in unknown_sections


def test_crm_match_never_names_the_vendor() -> None:
    """Doctrine : « nos fournisseurs ne se nomment jamais » — même garde que
    `get_crm_presence` (`test_chat_crm_presence_tool.py`)."""
    presence = {"connected": True, "matched": False, "provider": "hubspot"}
    result = compile_account_preflight(_account(), crm_connected=True, crm_presence=presence)
    match = result["known_sections"]["crm_match"]
    assert "provider" not in match


def test_crm_match_never_claims_a_supplier_referencing_or_a_procurement_eligibility() -> None:
    """#3892.3 — un RAPPROCHEMENT de compte dans le CRM n'est NI un
    référencement fournisseur NI une éligibilité à un dispositif d'achat NI
    une relation commerciale : trois informations distinctes, qu'un compte
    « matched: True » ne prouve aucune des trois."""
    presence = {"connected": True, "matched": True, "contacts_count": 12}
    result = compile_account_preflight(_account(), crm_connected=True, crm_presence=presence)
    match = result["known_sections"]["crm_match"]
    assert set(match) <= {"known", "connected", "matched", "contacts_count", "open_deals_count", "last_activity_at"}


# ── #3182.2 (épopée #3248) — anciens consultants, un prérequis « ouverture
# de compte » : qui du vivier a déjà été positionné sur CE compte ──────────


def test_past_consultants_is_named_absent_when_the_bridge_does_not_answer() -> None:
    result = compile_account_preflight(_account(), staffing_history=None)
    past = result["known_sections"]["past_consultants"]
    assert past["known"] is False
    assert "reason" in past
    assert {"section": "past_consultants", "reason": past["reason"]} in result["unknowns"]


def test_past_consultants_is_named_absent_on_a_bridge_error() -> None:
    result = compile_account_preflight(_account(), staffing_history={"error": "account_not_found"})
    past = result["known_sections"]["past_consultants"]
    assert past["known"] is False


def test_past_consultants_relays_the_bridge_deduped() -> None:
    staffing_history = {
        "consultants": [
            {
                "consultant_id": "c-1",
                "full_name": "Marie Dupont",
                "mission_id": "m-1",
                "mission_label": "Refonte SI",
                "starts_on": "2026-01-01",
                "ends_on": "2026-06-30",
            },
            # Même consultant, une SECONDE mission : ne compte pas deux fois
            # (#2301.29, même garde que `contacts`/`current_signals`).
            {
                "consultant_id": "c-1",
                "full_name": "Marie Dupont",
                "mission_id": "m-2",
                "starts_on": "2025-01-01",
                "ends_on": "2025-06-30",
            },
        ]
    }
    result = compile_account_preflight(_account(), staffing_history=staffing_history)
    past = result["known_sections"]["past_consultants"]
    assert past["known"] is True
    assert len(past["consultants"]) == 1
    assert past["consultants"][0]["full_name"] == "Marie Dupont"
    unknown_sections = {u["section"] for u in result["unknowns"]}
    assert "past_consultants" not in unknown_sections


def test_past_consultants_a_real_empty_list_is_known_not_an_unknown() -> None:
    """Le pont a répondu, personne n'a jamais été positionné ici — un FAIT
    connu (GA-18/GA-19), jamais une inconnue."""
    result = compile_account_preflight(_account(), staffing_history={"consultants": []})
    past = result["known_sections"]["past_consultants"]
    assert past == {"known": True, "consultants": [], "truncated": False}
    unknown_sections = {u["section"] for u in result["unknowns"]}
    assert "past_consultants" not in unknown_sections


# ── #2301.34-38 — CTA proposés, tous exécutables ────────────────────────────


def test_ctas_all_point_to_a_real_tool_or_no_tool_at_all() -> None:
    result = compile_account_preflight(_account())
    for cta in result["suggested_ctas"]:
        assert "next_tool" in cta
        assert cta["next_tool"] in (
            None,
            "get_account_contacts",
            "get_account_preflight",
            "compare_accounts",
            "start_account_analysis",
        )


def test_compare_filiales_cta_only_offered_when_subsidiaries_exist() -> None:
    without = compile_account_preflight(_account())
    with_subs = compile_account_preflight(_account(subsidiaries=["Filiale A"]))
    ids_without = {c["id"] for c in without["suggested_ctas"]}
    ids_with = {c["id"] for c in with_subs["suggested_ctas"]}
    assert "compare_filiales" not in ids_without
    assert "compare_filiales" in ids_with


# ── #2301.39 — préférence : répondre avec l'existant quand ça suffit ──────


def test_recommends_respond_with_existing_when_analyzed_and_contacts_known() -> None:
    contacts = {"contacts": [{"contact_id": "c-1"}], "total": 1, "truncated": False}
    account = _account(priority_score=72)
    result = compile_account_preflight(account, contacts=contacts, contacts_available=True)
    assert result["recommended_cta"] == "respond_with_existing"


def test_recommends_refreshing_contacts_when_analyzed_but_contacts_unknown() -> None:
    account = _account(priority_score=72)
    result = compile_account_preflight(account, contacts=None, contacts_available=False)
    assert result["recommended_cta"] == "refresh_contacts_only"


def test_recommends_verifying_signals_when_unanalyzed_but_signals_exist() -> None:
    account = _account(recent_signals=[{"id": "s1", "signal": "Recrutement"}])
    result = compile_account_preflight(account, contacts=None, contacts_available=False)
    assert result["recommended_cta"] == "verify_recent_signals"


def test_recommends_full_analysis_only_as_a_last_resort() -> None:
    account = {"id": "acc-empty", "company_name": "Vide"}
    result = compile_account_preflight(account, contacts=None, contacts_available=False)
    assert result["recommended_cta"] == "launch_full_analysis"


# ── #2301.40 — NO-GO : jamais d'analyse complète proposée seule ───────────


def test_no_go_launch_full_analysis_never_appears_without_known_sections() -> None:
    result = compile_account_preflight({"id": "acc-empty", "company_name": "Vide"})
    ids = [c["id"] for c in result["suggested_ctas"]]
    if "launch_full_analysis" in ids:
        assert result["known_sections"]
        assert result["known_sections"]["identity"]["known"] is True


def test_the_cta_builder_itself_refuses_full_analysis_without_known_sections() -> None:
    """Le test qui sait dire NON : appelé avec un mapping de sections vide (le
    bug qu'on redoute), le bâtisseur de CTA n'émet PAS `launch_full_analysis`
    tout seul — c'est la garde structurelle du NO-GO #2301.40."""
    ctas = _build_ctas({}, subsidiaries_present=False)
    ids = [c["id"] for c in ctas]
    assert "launch_full_analysis" not in ids
