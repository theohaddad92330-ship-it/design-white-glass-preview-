"""#2337 — le terrain de jeu multi-talents : chaque test sait dire NON."""

from __future__ import annotations

import json
from typing import Any

from app.services.compilers.territory_planner import (
    MAX_ACTIVE_ACCOUNTS_PER_TALENT,
    RANKING_AXES,
    compile_territory_plan,
)
from app.services.reply_blocks import split_reply_blocks

GRC, IAM, NET = "t-grc", "t-iam", "t-net"


def _talent(tid: str, name: str, **extra: Any) -> dict[str, Any]:
    return {
        "consultantId": tid,
        "fullName": name,
        "title": None,
        "zones": ["IDF"],
        "freeFrom": None,
        "declaredAvailability": "immediate",
        **extra,
    }


def _eval(tid: str, bucket: str = "recommended", pushable: int = 70, **extra: Any) -> dict[str, Any]:
    return {
        "consultantId": tid,
        "bucket": bucket,
        "correspondenceScore": pushable,
        "pushableScore": pushable,
        "matchedSkills": ["GRC"] if tid == GRC else ["IAM"],
        "notEvaluatedAxes": [],
        "flags": [],
        "availabilityDetail": None,
        "evidenceDetail": None,
        **extra,
    }


def _need(nid: str, evaluations: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {
        "needId": nid,
        "title": f"Besoin {nid}",
        "location": "Paris",
        "ownerId": "o1",
        "ownerName": "Léa Martin",
        "contactId": None,
        "evaluations": evaluations,
        **extra,
    }


def _account(aid: str, name: str, needs: list[dict[str, Any]], fit: int | None = 18, **extra: Any) -> dict[str, Any]:
    return {
        "accountId": aid,
        "accountName": name,
        "fitScore25": fit,
        "fitVerdict": "PRUDENT" if fit is not None else None,
        "presentedConsultantIds": [],
        "needs": needs,
        **extra,
    }


def _facts(accounts: list[dict[str, Any]], talents: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "talents": talents or [_talent(GRC, "Camille Roussel"), _talent(IAM, "Hakim Barreau")],
        "unknownTalentIds": [],
        "accounts": accounts,
        "evaluatedNeeds": sum(len(a["needs"]) for a in accounts),
        "truncated": False,
    }


def _block(fenced: str) -> dict[str, Any]:
    segments = split_reply_blocks(fenced)
    assert len(segments) == 1 and segments[0].kind == "block", segments
    return segments[0].block


def test_fusionne_un_compte_commun_en_une_seule_ligne_avec_un_seul_angle():
    facts = _facts(
        [
            _account(
                "a1",
                "Acme",
                [
                    _need("n1", [_eval(GRC, pushable=80), _eval(IAM, "excluded")]),
                    _need("n2", [_eval(IAM, pushable=60)]),
                ],
            )
        ]
    )
    plan = compile_territory_plan(facts)
    assert [a["name"] for a in plan["active_accounts"]] == ["Acme"]
    acme = plan["active_accounts"][0]
    assert acme["principal"] == "Camille Roussel"
    assert acme["alternate"] == "Hakim Barreau"
    assert "Un seul angle" in acme["first_move"] and "pas deux CV" in acme["first_move"]
    card = _block(plan["card"])
    assert card["type"] == "account_ranking"
    assert len(card["items"]) == 1
    assert card["axes"] == list(RANKING_AXES)


def test_un_compte_sans_talent_compatible_ne_fait_aucune_ligne():
    facts = _facts(
        [
            _account("a1", "Acme", [_need("n1", [_eval(GRC)])]),
            _account("a2", "Globex", [_need("n2", [_eval(GRC, "excluded"), _eval(IAM, "excluded")])]),
        ]
    )
    plan = compile_territory_plan(facts)
    names = [a["name"] for a in plan["active_accounts"] + plan["reserve_accounts"]]
    assert names == ["Acme"]


def test_la_capacite_declaree_borne_les_comptes_actifs_et_le_reste_est_compte():
    accounts = [
        _account(f"a{i}", f"Compte {i}", [_need(f"n{i}", [_eval(GRC if i % 2 else IAM, pushable=90 - i)])])
        for i in range(1, 10)
    ]
    plan = compile_territory_plan(_facts(accounts), capacity=2)
    assert plan["capacity"] == 2
    assert len(plan["active_accounts"]) == 2
    assert len(plan["reserve_accounts"]) == 5
    assert plan["beyond_capacity"] == 2
    assert "2 compte(s) actif(s) sur 2" in _block(plan["card"])["title"]


def test_un_talent_d_entree_ne_se_presente_pas_partout_a_la_fois():
    accounts = [_account(f"a{i}", f"Compte {i}", [_need(f"n{i}", [_eval(GRC, pushable=90 - i)])]) for i in range(4)]
    plan = compile_territory_plan(_facts(accounts), capacity=10)
    assert len(plan["active_accounts"]) == MAX_ACTIVE_ACCOUNTS_PER_TALENT
    assert len(plan["reserve_accounts"]) == 4 - MAX_ACTIVE_ACCOUNTS_PER_TALENT


def test_capacite_absente_ou_illisible_retombe_sur_un_petit_nombre_jamais_cinquante():
    accounts = [_account(f"a{i}", f"Compte {i}", [_need(f"n{i}", [_eval(GRC if i % 2 else IAM)])]) for i in range(20)]
    assert compile_territory_plan(_facts(accounts), capacity="beaucoup")["capacity"] == 5
    assert compile_territory_plan(_facts(accounts), capacity=50)["capacity"] == 10


def test_les_collisions_sont_nommees_avant_tout_message():
    facts = _facts(
        [
            _account(
                "a1",
                "Acme",
                [
                    _need("n1", [_eval(GRC, flags=["previously_rejected_by_client"])], contactId="c1"),
                    _need("n2", [_eval(IAM)], contactId="c1", ownerName="Paul Roy"),
                ],
                presentedConsultantIds=[IAM],
            )
        ]
    )
    acme = compile_territory_plan(facts)["active_accounts"][0]
    text = " ".join(acme["collisions"])
    assert "Même contact visé" in text
    assert "Plusieurs porteurs" in text and "Léa Martin" in text and "Paul Roy" in text
    assert "Hakim B. déjà présenté" in text
    assert "Camille R. déjà refusé par ce client" in text
    assert acme["owner"] is None


def test_ce_qui_n_a_pas_pu_etre_evalue_est_nomme_jamais_zero():
    facts = _facts(
        [
            _account(
                "a1",
                "Acme",
                [_need("n1", [_eval(GRC, notEvaluatedAxes=["rate", "sector"]), _eval(IAM, "not_evaluable")])],
                fit=None,
                ownerName=None,
            )
        ]
    )
    facts["accounts"][0]["needs"][0]["ownerName"] = None
    plan = compile_territory_plan(facts)
    acme = plan["active_accounts"][0]
    assert acme["not_evaluated"][:2] == ["Note du compte /25", "Porteur du besoin"]
    assert "Tarif" in acme["not_evaluated"] and "Secteur" in acme["not_evaluated"]
    assert "Hakim B. (fiche incomplète)" in acme["not_evaluated"]
    assert "0/25" not in plan["card"]


def test_un_compte_note_passe_devant_un_compte_non_note_a_complementarite_egale():
    facts = _facts(
        [
            _account("a1", "Sans note", [_need("n1", [_eval(GRC, pushable=95)])], fit=None),
            _account("a2", "Noté", [_need("n2", [_eval(IAM, pushable=50)])], fit=12),
            _account("a3", "Deux talents", [_need("n3", [_eval(GRC, pushable=40), _eval(IAM, pushable=40)])], fit=10),
        ]
    )
    plan = compile_territory_plan(facts)
    assert [a["name"] for a in plan["active_accounts"]] == ["Deux talents", "Noté", "Sans note"]


def test_le_territoire_declare_par_talent_filtre_ses_besoins():
    facts = _facts(
        [
            _account("a1", "Lyonnais", [_need("n1", [_eval(GRC)], location="Lyon")]),
            _account("a2", "Parisien", [_need("n2", [_eval(GRC)], location="Paris 8e")]),
            _account("a3", "Sans lieu", [_need("n3", [_eval(GRC)], location=None)]),
        ]
    )
    plan = compile_territory_plan(
        facts, talent_inputs=[{"consultant_id": GRC, "territory": "Paris", "conditions": "Pas de déplacement"}]
    )
    names = {a["name"] for a in plan["active_accounts"] + plan["reserve_accounts"]}
    assert names == {"Parisien", "Sans lieu"}
    sans_lieu = next(a for a in plan["active_accounts"] if a["name"] == "Sans lieu")
    assert "Territoire (besoin sans lieu)" in sans_lieu["not_evaluated"]


def test_chaque_talent_porte_ses_quatre_attributs_une_case_inconnue_reste_vide():
    talents = [
        _talent(GRC, "Camille Roussel", freeFrom="2026-10-01"),
        _talent(IAM, "Hakim Barreau", declaredAvailability="inconnu", zones=[]),
    ]
    facts = _facts(
        [_account("a1", "Acme", [_need("n1", [_eval(GRC, evidenceDetail="3 preuves de mission")])])], talents
    )
    plan = compile_territory_plan(facts, talent_inputs=[{"consultant_id": GRC, "conditions": "Télétravail 2 j"}])
    block = _block(plan["talents_card"])
    assert block["type"] == "comparison"
    assert block["columns"] == ["Camille R.", "Hakim B."]
    rows = {row["label"]: row["cells"] for row in block["rows"]}
    assert rows["Disponibilité"] == ["libre le 2026-10-01", None]  # `inconnu` n'est jamais une disponibilité
    assert rows["Conditions"] == ["Télétravail 2 j", None]
    assert rows["Preuves"] == ["3 preuves de mission", None]
    assert rows["Territoire"] == ["IDF", None]


def test_l_export_est_un_telechargement_local_et_rien_n_est_cree():
    facts = _facts([_account("a1", "Acme", [_need("n1", [_eval(GRC), _eval(IAM)])])])
    plan = compile_territory_plan(facts)
    export = _block(plan["download_card"])
    assert export["type"] == "file_export"
    assert export["rows"][0]["cells"][:2] == ["Acme", "actif"]
    # Aucune proposition d'écriture : pas de `_proposal`, pas de carte d'action.
    assert "proposal" not in json.dumps(plan)


def test_aucune_probabilite_dans_ce_qui_sort():
    facts = _facts([_account("a1", "Acme", [_need("n1", [_eval(GRC), _eval(IAM)])])])
    dumped = json.dumps(compile_territory_plan(facts), ensure_ascii=False).lower()
    assert "probabilit" not in dumped and "chance" not in dumped and "%" not in dumped


def test_moins_de_deux_talents_connus_est_une_erreur_claire_pas_un_terrain_vide():
    facts = _facts([], talents=[_talent(GRC, "Camille Roussel")])
    facts["unknownTalentIds"] = ["ghost"]
    result = compile_territory_plan(facts)
    assert "au moins deux talents" in result["error"]
    assert "1 introuvable" in result["error"]


def test_aucun_besoin_ne_recoit_ces_talents_le_dit_sans_inventer():
    plan = compile_territory_plan(_facts([]))
    assert plan["active_accounts"] == [] and "card" not in plan
    assert "je n'en invente pas" in plan["notice"]


def test_une_ligne_vide_pour_tous_les_talents_ne_fait_aucune_ligne():
    facts = _facts([_account("a1", "Acme", [_need("n1", [_eval(GRC), _eval(IAM)])])])
    rows = {row["label"] for row in _block(compile_territory_plan(facts)["talents_card"])["rows"]}
    # Personne n'a donné de conditions ni de preuves : ces deux lignes disparaissent.
    assert rows == {"Disponibilité", "Territoire"}


def test_un_troisieme_talent_compatible_est_nomme_sans_double_point():
    talents = [_talent(GRC, "Camille Roussel"), _talent(IAM, "Hakim Barreau"), _talent(NET, "Inès Kaczmarek")]
    evaluations = [_eval(GRC, pushable=90), _eval(IAM, pushable=80), _eval(NET, pushable=70)]
    facts = _facts([_account("a1", "Acme", [_need("n1", evaluations)])], talents)
    plan = compile_territory_plan(facts)
    assert plan["active_accounts"][0]["compatible"] == ["Camille Roussel", "Hakim Barreau", "Inès Kaczmarek"]
    assert "Aussi compatible : Inès K." in _block(plan["card"])["items"][0]["why"]
