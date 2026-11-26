"""#4421 — « trouve-moi des missions » sur un consultant : Laura AGIT, elle ne questionne pas.

Régression de #3816 (Louis, 21/10) : un consultant sélectionné, « trouve-moi des missions », et Laura
posait question sur question. Décision Louis 21/10 (renverse #3865.2, `c124`) : Laura ne s'arrête
JAMAIS — rien en interne, elle bascule SEULE en externe, sur toute recherche. Ce fichier tient :

* #4421.2 — `find_needs_for_talent` sans besoin ouvert POUSSE l'enchaînement vers
  `find_accounts_for_talent` dans le même tour (consigne ET résultat), jamais « demande à l'utilisateur » ;
* #4421.3 — `find_accounts_for_talent` lit seul la fiche (compétences, dispo, zone), rend N comptes
  (défaut 10) avec leurs offres relevées et leurs contacts à joindre, et propose le mail sans l'envoyer ;
* #4421.4 — le prompt système porte la règle « tu ne t'arrêtes jamais », et la consigne contraire a disparu.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.prompts.bellum_advisor import build_system_prompt
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool
from app.services.known_shape_gate import shape_read_from_tool

ACCOUNTS = "find_accounts_for_talent"
NEEDS = "find_needs_for_talent"
HUGO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
ALTEN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"


def _description(name: str) -> str:
    return next(str(t["description"]) for t in CHAT_TOOLS if t["name"] == name)


def _hugo_row() -> dict[str, Any]:
    # La fiche telle que le vivier la rend : compétences du CV lu, dispo, zones de mobilité.
    return {
        "id": HUGO,
        "fullName": "Hugo Houyez",
        "title": "Développeur full stack",
        "availability": "available",
        "availableFrom": "2026-11-02",
        "zones": ["Lille"],
        "topSkills": [{"label": "Java"}, {"label": "Vue"}, {"label": "C++"}],
    }


def _market() -> dict[str, Any]:
    return {
        "consultantId": HUGO,
        "zones": ["Lille"],
        "departments": ["59"],
        "unresolvedZones": [],
        "skillTerms": ["Java", "Vue", "C++"],
        "unavailableReason": "no_snapshot",
        "demand": [],
        "recruiters": [],
    }


def _offer(title: str, date: str, skill: str = "Java") -> dict[str, Any]:
    return {"title": title, "city": "Lille", "date": date, "url": None, "source": "ft", "skill": skill}


def _engine_rows(count: int = 2) -> Any:
    from app.services.discover_skill_offers import SkillAccounts

    names = ["Alten", "Decathlon Digital", *[f"Employeur {i}" for i in range(count)]][:count]
    rows = [
        {
            "siren": f"55200000{i}",
            "name": name,
            "department": "59",
            "city": "Lille",
            "skillEvidence": {
                "skill": "Java",
                "offerCount": 9 - i,
                "latestOffer": _offer("Développeur Java / Vue", "2026-10-14"),
            },
        }
        for i, name in enumerate(names)
    ]
    return SkillAccounts(accounts=rows, intermediaries=[], info={"emptyCause": None})


def _patch(
    monkeypatch: pytest.MonkeyPatch,
    *,
    engine: Any,
    workspace: dict[str, str] | None = None,
    contacts: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, list]:
    calls: dict[str, list] = {"search": [], "market": [], "workspace": [], "contacts": []}

    async def _search(user_id: str, **kwargs: Any) -> dict[str, Any]:
        calls["search"].append(kwargs)
        return {"items": [_hugo_row()], "total": 1}

    async def _reverse(user_id: str, **kwargs: Any) -> Any:
        calls["market"].append(kwargs)
        return {"found": True, "market": _market()}

    async def _engine(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        return engine

    async def _workspace(user_id: str, *, query: Any, sector: Any, limit: Any, **kw: Any) -> Any:
        calls["workspace"].append(query)
        rows = [
            {"account_id": aid, "company_name": name}
            for name, aid in (workspace or {}).items()
            if str(query or "").casefold() in name.casefold()
        ]
        return {"accounts": rows, "total": len(rows)}

    async def _contacts(user_id: str, account_id: str, **kw: Any) -> Any:
        calls["contacts"].append((account_id, kw))
        rows = (contacts or {}).get(account_id, [])
        return {"contacts": rows, "total": len(rows), "truncated": False}

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.search_talents", _search)
    monkeypatch.setattr("app.services.bellum_api.talent_reverse_market", _reverse)
    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _engine)
    monkeypatch.setattr("app.services.bellum_api.workspace_accounts", _workspace)
    monkeypatch.setattr("app.services.bellum_api.account_contacts", _contacts)
    return calls


def _alten_contacts() -> list[dict[str, Any]]:
    return [
        {
            "contact_id": "ct-1",
            "full_name": "Paul Martin",
            "title": "Directeur technique",
            "email": "paul.martin@alten.fr",
            "phone": "+33 6 00 00 00 01",
        },
        {
            "contact_id": "ct-2",
            "full_name": "Claire Petit",
            "title": "Responsable recrutement IT",
            "email": "claire.petit@alten.fr",
            "phone": None,
        },
    ]


# ── #4421.2 — sans besoin ouvert, l'enchaînement part dans le MÊME tour ──────────────────


def test_4421_2_la_consigne_n_interdit_plus_la_bascule() -> None:
    description = _description(NEEDS)
    assert "n'y bascule jamais seul" not in description
    assert "propose-le comme complément" not in description
    assert "find_accounts_for_talent" in description
    assert "MÊME TOUR" in description


async def test_4421_2_espace_sans_besoin_le_resultat_pousse_l_enchainement(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _search(user_id: str, **kwargs: Any) -> dict[str, Any]:
        return {"items": [_hugo_row()], "total": 1}

    async def _run(user_id: str, **kwargs: Any) -> dict[str, Any]:
        return {"needs": [], "evaluatedCount": 0}

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.search_talents", _search)
    monkeypatch.setattr("app.services.bellum_api.talent_needs_match", _run)
    out = await execute_chat_tool(NEEDS, {"consultant": "Hugo Houyez"}, user_id="u-1", profile_data=None)
    assert out["next"] == ACCOUNTS
    assert out["next_input"] == {"consultant": HUGO}
    message = out["message"].casefold()
    assert "demande à" not in message and "demande-lui" not in message and "?" not in message
    assert "enchaîne" in message and "sans rien demander" in message


# ── #4421.3 — UN appel : fiche lue, comptes + offres + contacts, aucune question ─────────


async def test_4421_3_consultant_java_vue_un_appel_comptes_offres_contacts(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(
        monkeypatch,
        engine=_engine_rows(2),
        workspace={"Alten": ALTEN_ID},
        contacts={ALTEN_ID: _alten_contacts()},
    )

    # #4421.10 — l'espace existe, mais aucune source de personnes ni d'offres fraîches n'est branchée ici.
    async def _space(user_id: str, *_: Any, **__: Any) -> str:
        return "33333333-3333-4333-8333-333333333333"

    async def _unconfigured(*_: Any, **__: Any) -> Any:
        from app.services.apollo import ApolloSearchStatus

        return [], ApolloSearchStatus.UNCONFIGURED, None

    async def _no_registry(*_: Any, **__: Any) -> Any:
        raise RuntimeError("collecte fraîche non branchée dans ce test")

    monkeypatch.setattr("app.services.workspace_scope.resolve_workspace_id", _space)
    monkeypatch.setattr("app.services.apollo.search_people_with_status", _unconfigured)
    monkeypatch.setattr("app.routers.discover.discover_registry", _no_registry)
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez"}, user_id="u-1", profile_data=None)
    assert out["status"] == "ok"
    assert "question" not in out and "homonyms" not in out
    # Ce qu'elle a retenu de la fiche, annoncé en une ligne : compétences, dispo, zone.
    retained = out["retained"]
    assert retained["skills"] == ["Java", "Vue", "C++"]
    assert retained["zones"] == ["59"]
    assert retained["available_from"] == "2026-11-02"
    alten, decathlon = out["accounts"]
    # Les besoins relevés : offre, date, compétence qui matche.
    assert alten["needs"] == [
        {"title": "Développeur Java / Vue", "date": "2026-10-14", "skill": "Java", "city": "Lille"}
    ]
    # Les contacts à joindre, en clair — le recruteur passe devant.
    assert [c["name"] for c in alten["contacts"]] == ["Claire Petit", "Paul Martin"]
    assert alten["contacts"][0]["email"] == "claire.petit@alten.fr"
    assert alten["contacts"][0]["contact_id"] == "ct-2"
    assert alten["account_id"] == ALTEN_ID
    # Rien d'inventé : un compte sans contact connu le DIT, avec le geste qui en trouve.
    assert decathlon["contacts"] == []
    assert decathlon["contacts_state"] == "not_in_workspace"  # #4421.3 : jamais analysé ≠ « aucun contact connu »
    assert decathlon["contacts_note"] == "Pas encore dans ton espace — aucun contact collecté, lancer l'analyse."
    # La suite : préparer le mail à chaque recruteur, jamais l'envoyer.
    assert "prepare_message_for_contact" in out["next_steps"]
    assert "start_account_analysis" in out["next_steps"]
    assert "jamais" in out["next_steps"] and "envo" in out["next_steps"]
    assert calls["contacts"] == [(ALTEN_ID, {"limit": 10})]


async def test_4421_3_le_volume_demande_est_rendu(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, engine=_engine_rows(14))
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez"}, user_id="u-1", profile_data=None)
    assert len(out["accounts"]) == 10  # défaut : ~10 comptes
    out = await execute_chat_tool(ACCOUNTS, {"consultant": "Hugo Houyez", "limit": 3}, user_id="u-1", profile_data=None)
    assert len(out["accounts"]) == 3
    out = await execute_chat_tool(
        ACCOUNTS, {"consultant": "Hugo Houyez", "limit": 12}, user_id="u-1", profile_data=None
    )
    assert len(out["accounts"]) == 12


def test_4421_3_les_offres_listees_par_le_moteur_vont_jusqu_a_dix() -> None:
    from app.services.compilers.talent_accounts import accounts_from_skill_search

    offers = [_offer(f"Offre {i}", f"2026-10-{10 + i:02d}") for i in range(12)]
    row = {
        "name": "Alten",
        "siren": "552000000",
        "department": "59",
        "skillEvidence": {"skill": "Java", "offerCount": 12, "latestOffer": offers[-1], "offers": offers},
    }
    (account,) = accounts_from_skill_search([row], departments=["59"])
    assert len(account["needs"]) == 10
    # La plus récente d'abord ; une offre sans date n'est pas un besoin daté.
    assert account["needs"][0]["date"] == "2026-10-21"


def test_4421_3_la_carte_porte_offres_contacts_et_le_mail_a_preparer() -> None:
    out = {
        "status": "ok",
        "consultant": {"id": HUGO, "name": "Hugo Houyez"},
        "accounts": [
            {
                "name": "Alten",
                "why": ["Alten publie 9 offres citant Java."],
                "observed_on": "2026-10-14",
                "needs": [{"title": "Développeur Java / Vue", "date": "2026-10-14", "skill": "Java"}],
                "contacts": [
                    {
                        "contact_id": "ct-2",
                        "name": "Claire Petit",
                        "title": "Responsable recrutement IT",
                        "email": "claire.petit@alten.fr",
                    }
                ],
            },
            {
                "name": "Decathlon Digital",
                "why": ["Decathlon Digital publie 8 offres citant Java."],
                "contacts": [],
                "contacts_note": "Aucun contact connu — lancer l'analyse.",
            },
        ],
        "limits": [],
    }
    card = shape_read_from_tool(ACCOUNTS, out, language="fr")["blocks"]["account_ranking"]
    alten, decathlon = card["items"]
    why = " ".join(alten["why"])
    assert "Développeur Java / Vue (2026-10-14)" in why
    assert "Claire Petit" in why and "claire.petit@alten.fr" in why
    assert [f["label"] for f in alten["follow_ups"]] == ["Préparer le mail à Claire Petit"]
    assert "ct-2" in alten["follow_ups"][0]["ask"] and "je l'enverrai moi-même" in alten["follow_ups"][0]["ask"]
    assert "Aucun contact connu — lancer l'analyse." in decathlon["why"]
    assert [f["label"] for f in decathlon["follow_ups"]][0] == "Lancer l'analyse"
    en = shape_read_from_tool(ACCOUNTS, out, language="en")["blocks"]["account_ranking"]
    assert [f["label"] for f in en["items"][0]["follow_ups"]] == ["Prepare the email to Claire Petit"]


# ── #4421.3 / #4421.4 — consignes : agir, ne pas questionner ─────────────────────────────


def test_4421_3_la_description_dit_d_agir_sans_question() -> None:
    description = _description(ACCOUNTS)
    assert "sans poser de question" in description
    assert "limit" in description
    assert "prepare_message_for_contact" in description


def test_4421_4_le_prompt_systeme_porte_la_regle_et_plus_la_consigne_contraire() -> None:
    bare = build_system_prompt({}, {}, "", "")
    assert "TU NE T'ARRÊTES JAMAIS (#4421)" in bare
    rule = bare[bare.index("TU NE T'ARRÊTES JAMAIS (#4421)") :][:1600]
    for search in ("missions", "comptes", "contacts"):
        assert search in rule
    assert "find_accounts_for_talent" in rule
    # La consigne contraire a disparu de TOUT ce que lit le modèle (prompt et outils).
    corpus = bare + " ".join(str(t["description"]) for t in CHAT_TOOLS)
    assert "n'y bascule jamais seul" not in corpus
