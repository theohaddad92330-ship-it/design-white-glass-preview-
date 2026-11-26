"""Deterministic Quality Judge (V1-vendable §9.8/§10.12)."""

from __future__ import annotations

from app.services.quality_judge import judge_quality, mark_former_leaders


def _good_research() -> dict:
    return {
        "siren": "552120222",
        "revenue": "35 Md€",
        "employees": "10000+",
        "headquarters": "Paris",
        "sector": "Banque",
        "sources": {"tags": {"siren": "PUBLIC", "revenue": "PUBLIC", "employees": "PUBLIC", "headquarters": "PUBLIC", "sector": "PUBLIC"}},
        "angles": [{"strategy": "Renfort MLOps 6 semaines sur le cas RAG documentaire déjà identifié."}],
        "qualified_hypotheses": [{"hypothesis": "Industrialise ses modèles ML (MLOps)"}],
        "confidence": {"score": 82},
    }


def _good_plan() -> dict:
    return {
        "actionPlan": {"phases": [{"name": "IMMEDIAT"}]},
        "contactMessages": [{"emailBody": "Bonjour, un point court sur votre chantier data.", "linkedinMessage": "Ref au recrutement data."}],
    }


def _good_contacts() -> list[dict]:
    # ≥6 named contacts spanning several roles → passes the multi-thread rule.
    roles = ["economic", "technical", "user", "champion", "sponsor", "influencer"]
    return [{"fullName": f"Contact {i}", "decision_role": role} for i, role in enumerate(roles)]


def test_clean_dossier_is_ok():
    r = judge_quality(research=_good_research(), contacts=_good_contacts(), plan=_good_plan())
    assert r["verdict"] == "ok"
    assert r["issues"] == []
    assert r["confidence"] == 82


def _plan_with_nba_status(status: str) -> dict:
    plan = _good_plan()
    plan["nextBestAction"] = {
        "action": "Contacter les décideurs IT.",
        "specificity": {"status": status, "count": 0, "minimum": 2, "elements": [], "unavailable": []},
    }
    return plan


def test_a_generic_next_best_action_is_flagged_interchangeable():
    # #1925 — « générique = échec » : le juge le nomme, sans plafonner le score
    # (a_corriger n'a pas de plafond dans `_QUALITY_SCORE_CAP`).
    r = judge_quality(research=_good_research(), contacts=_good_contacts(), plan=_plan_with_nba_status("generique"))
    assert r["verdict"] == "a_corriger"
    assert [i["type"] for i in r["issues"]] == ["recommandation_interchangeable"]


def test_a_specific_or_not_evaluable_next_best_action_is_not_flagged():
    # Témoins : spécifique = rien à dire ; non évaluable = le dossier n'offrait
    # rien à citer, ce n'est pas la faute de la recommandation.
    for status in ("specifique", "non_evaluable"):
        r = judge_quality(research=_good_research(), contacts=_good_contacts(), plan=_plan_with_nba_status(status))
        assert r["verdict"] == "ok", status


def test_too_few_contacts_flags_weak_multithreading():
    r = judge_quality(research=_good_research(), contacts=[{"fullName": "Seul"}], plan=_good_plan())
    assert r["verdict"] == "a_corriger"
    assert any(i["type"] == "contacts_insuffisants" for i in r["issues"])


def test_single_role_contacts_flag_champion_dependency():
    contacts = [{"fullName": f"C{i}", "decision_role": "champion"} for i in range(6)]
    r = judge_quality(research=_good_research(), contacts=contacts, plan=_good_plan())
    assert any(i["type"] == "multi_thread_faible" for i in r["issues"])


def test_unsourced_core_fact_is_hallucination():
    research = _good_research()
    research["sources"]["tags"]["revenue"] = "HYPOTHÈSE"  # revenue claimed but not sourced
    r = judge_quality(research=research, contacts=[{"fullName": "X"}], plan=_good_plan())
    assert r["verdict"] == "hallucination"
    assert "revenue" in r["factsMissingSource"]
    assert any(i["type"] == "fait_sans_source" for i in r["issues"])


def test_missing_deliverables_is_trop_faible():
    research = _good_research()
    research["angles"] = []
    r = judge_quality(research=research, contacts=[], plan={"actionPlan": {"phases": []}})
    assert r["verdict"] == "trop_faible"
    assert any(i["type"] == "livrables_manquants" for i in r["issues"])


def test_generic_and_overlong_messages_are_a_corriger():
    plan = {
        "actionPlan": {"phases": [{"name": "IMMEDIAT"}]},
        "contactMessages": [
            {"emailBody": "Je me permets de vous contacter, acteur majeur de votre secteur. " + "blabla " * 200},
        ],
    }
    r = judge_quality(research=_good_research(), contacts=[{"fullName": "X"}], plan=plan)
    assert r["verdict"] == "a_corriger"
    types = {i["type"] for i in r["issues"]}
    assert "generique" in types
    assert "message_trop_long" in types


def test_hypotheses_to_verify_collected():
    research = _good_research()
    research["sources"]["tags"]["businessDescription"] = "HYPOTHÈSE"
    r = judge_quality(research=research, contacts=[{"fullName": "X"}], plan=_good_plan())
    # Readable hypotheses come from qualified_hypotheses …
    assert "Industrialise ses modèles ML (MLOps)" in r["hypothesesToVerify"]
    # … but the raw field NAME must NOT leak in (meaningless to a salesperson).
    assert "businessDescription" not in r["hypothesesToVerify"]


# ── S4 factualité : dirigeant obsolète ──────────────────────────────────────
# Current Pappers registry (representants) — the snapshot of who's ACTUALLY in
# charge. Oudéa left SG in 2023, so he is NOT here.
_CURRENT_EXECS = [{"last_name": "Krupa", "first_name": "Slawomir", "role": "Directeur Général"}]


def test_stale_executive_hook_is_flagged():
    research = _good_research()
    research["executives"] = _CURRENT_EXECS
    research["peopleMentioned"] = [{"name": "Frédéric Oudéa", "title": "Directeur Général", "source": "Les Echos"}]
    r = judge_quality(research=research, contacts=[{"fullName": "X"}], plan=_good_plan())
    assert r["verdict"] == "a_corriger"
    assert any(i["type"] == "dirigeant_obsolete" for i in r["issues"])
    assert any("Oudéa" in c for c in r["staleExecutiveClaims"])


def test_current_executive_is_not_flagged():
    research = _good_research()
    research["executives"] = _CURRENT_EXECS
    research["peopleMentioned"] = [{"name": "Slawomir Krupa", "title": "Directeur Général"}]
    r = judge_quality(research=research, contacts=[{"fullName": "X"}], plan=_good_plan())
    assert r["staleExecutiveClaims"] == []
    assert not any(i["type"] == "dirigeant_obsolete" for i in r["issues"])


def test_former_labeled_executive_is_not_flagged():
    # Already honestly labelled as former → not a factuality defect.
    research = _good_research()
    research["executives"] = _CURRENT_EXECS
    research["peopleMentioned"] = [{"name": "Frédéric Oudéa", "title": "ancien Directeur Général"}]
    r = judge_quality(research=research, contacts=[{"fullName": "X"}], plan=_good_plan())
    assert r["staleExecutiveClaims"] == []


def test_non_leadership_person_is_not_flagged():
    # A DSI / manager isn't a governance claim — only current-leadership titles matter.
    research = _good_research()
    research["executives"] = _CURRENT_EXECS
    research["peopleMentioned"] = [{"name": "Jean Martin", "title": "Head of Data"}]
    r = judge_quality(research=research, contacts=[{"fullName": "X"}], plan=_good_plan())
    assert r["staleExecutiveClaims"] == []


# ── Leadership dating (Théo p.7) — mark_former_leaders ──────────────────────────


def test_mark_former_leaders_dates_obsolete_dg():
    research = {
        "executives": _CURRENT_EXECS,
        "peopleMentioned": [
            {"name": "Frédéric Oudéa", "title": "Directeur Général", "source": "Les Echos"},
            {"name": "Slawomir Krupa", "title": "Directeur Général"},  # current registry → untouched
            {"name": "Jean Martin", "title": "Head of Data"},  # not leadership → untouched
        ],
    }
    marked = mark_former_leaders(research)
    assert marked == 1
    oudea = research["peopleMentioned"][0]
    assert oudea["former"] is True
    assert "ancien" in oudea["title"].lower()
    # A genuinely current leader and a non-leader are left alone.
    assert research["peopleMentioned"][1].get("former") in (None, False)
    assert research["peopleMentioned"][2].get("former") in (None, False)
    # Once dated, the judge no longer flags it (title carries the "ancien" marker).
    r = judge_quality(research=research, contacts=[{"fullName": "X"}], plan=_good_plan())
    assert r["staleExecutiveClaims"] == []


def test_mark_former_leaders_noop_without_registry():
    research = {"peopleMentioned": [{"name": "Frédéric Oudéa", "title": "Directeur Général"}]}
    assert mark_former_leaders(research) == 0
    assert research["peopleMentioned"][0].get("former") in (None, False)


# ── S4 factualité : chiffre trop précis (RH / budget) ───────────────────────


def test_overspecific_jobs_figure_in_hook_is_flagged():
    plan = {
        "actionPlan": {"phases": [{"name": "IMMEDIAT"}]},
        "contactMessages": [{"linkedinMessage": "Vu les 900 postes IT supprimés au siège, parlons résilience."}],
    }
    r = judge_quality(research=_good_research(), contacts=[{"fullName": "X"}], plan=plan)
    assert r["verdict"] == "a_corriger"
    assert any(i["type"] == "chiffre_trop_precis" for i in r["issues"])
    assert r["overspecificFigures"]


def test_vague_jobs_claim_is_not_flagged():
    # No precise count → the honest, source-safe phrasing must pass.
    plan = {
        "actionPlan": {"phases": [{"name": "IMMEDIAT"}]},
        "contactMessages": [{"linkedinMessage": "Vu les suppressions de postes annoncées au siège, parlons résilience."}],
    }
    r = judge_quality(research=_good_research(), contacts=[{"fullName": "X"}], plan=plan)
    assert r["overspecificFigures"] == []


def test_precise_budget_in_hook_is_flagged():
    plan = {
        "actionPlan": {"phases": [{"name": "IMMEDIAT"}]},
        "contactMessages": [{"emailBody": "Avec un budget IT de 250 M€, votre programme cloud mérite un partenaire."}],
    }
    r = judge_quality(research=_good_research(), contacts=[{"fullName": "X"}], plan=plan)
    assert any(i["type"] == "chiffre_trop_precis" for i in r["issues"])


def test_esn_deal_size_is_not_mistaken_for_a_target_figure():
    # "3 consultants, 150-250K EUR" is the ESN's own offer sizing, not a claim
    # about the target's HR/budget — must NOT be flagged.
    plan = {
        "actionPlan": {"phases": [{"name": "IMMEDIAT"}]},
        "contactMessages": [{"emailBody": "Un squad de 3 consultants, 150-250K EUR sur 12 mois."}],
    }
    r = judge_quality(research=_good_research(), contacts=[{"fullName": "X"}], plan=plan)
    assert r["overspecificFigures"] == []


# ── LOT C-5b — LA RÈGLE POSITIVE, APPLIQUÉE PAR LE JUGE LUI-MÊME ─────────────
#
# #1925 avait livré la règle positive (« au moins 2 éléments spécifiques parmi
# les 11 », `recommendation_specificity`) et l'avait branchée sur DEUX sorties :
# `nextBestAction` (phase 4) et le message préparé (`routers/message.py`). Le
# juge, lui, ne faisait que RELIRE le verdict déjà calculé pour la prochaine
# action : côté juge la règle restait NÉGATIVE (une liste de formulations
# bannies, `_GENERIC_MARKERS`). Les ANGLES d'attaque — la recommandation que le
# commercial lit en premier dans le dossier — n'étaient tenus par rien : « Cibler
# la DSI avec une approche adaptée » passait le juge sans une remarque.
#
# Le juge ne reçoit pas le profil ESN : il construit donc son registre avec ce
# qu'il a — recherche + contacts enrichis. Trois familles y vivent (entité
# précise, contact précis, signal daté), soit assez pour le seuil de deux. Quand
# le dossier n'en offre pas deux, le verdict est `non_evaluable` et le juge se
# TAIT : « non mesuré » n'est pas « générique ».


def _research_with_two_citable_families() -> dict:
    r = _good_research()
    r["entitiesExhaustive"] = [{"name": "ITIM — Innovation, Technologies & IT"}, {"name": "BoursoBank"}]
    r["recentSignals"] = [{"signal": "Industrialisation des modèles ML", "date": "Mars 2026"}]
    return r


def test_an_interchangeable_angle_is_flagged_even_when_no_banned_phrase_appears():
    research = _research_with_two_citable_families()
    # Aucune formulation bannie : la règle NÉGATIVE laisse passer cet angle.
    research["angles"] = [{"title": "Ouvrir la DSI", "strategy": "Cibler les décideurs techniques."}]
    r = judge_quality(research=research, contacts=_good_contacts(), plan=_good_plan())
    assert r["verdict"] == "a_corriger"
    interchangeable = [i for i in r["issues"] if i["type"] == "recommandation_interchangeable"]
    assert len(interchangeable) == 1
    assert "angle" in interchangeable[0]["detail"].lower()


def test_an_angle_that_cites_two_specific_elements_is_not_flagged():
    """Le témoin du cas voisin LÉGITIME : le même dossier, un angle qui cite
    l'entité ET le signal daté. La garde ne doit pas attraper celui-là."""
    research = _research_with_two_citable_families()
    research["angles"] = [
        {
            "title": "ITIM — Innovation, Technologies & IT",
            "strategy": "Adosser le renfort à l'industrialisation des modèles ML annoncée en Mars 2026.",
        }
    ]
    r = judge_quality(research=research, contacts=_good_contacts(), plan=_good_plan())
    assert [i["type"] for i in r["issues"]] == []


def test_an_angle_is_never_condemned_on_a_dossier_that_offered_nothing_to_cite():
    """« Non mesuré » n'est pas « générique » — le dossier n'offre qu'UNE famille
    citable (les contacts), donc sous le seuil de deux : le juge se tait."""
    research = _good_research()
    research["angles"] = [{"title": "Ouvrir la DSI", "strategy": "Cibler les décideurs techniques."}]
    r = judge_quality(research=research, contacts=_good_contacts(), plan=_good_plan())
    assert [i["type"] for i in r["issues"]] == []
