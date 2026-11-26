"""#2470 — le tour d'horizon s'EXÉCUTE dans la conversation.

Retour d'antoine.meyer@cyrah.fr le 16/09/2026 : « un GO devrait entraîner une
recherche directement et que ça alimente la conversation plutôt qu'à forcer à
aller sur la page découvrir ».

`find_accounts` prépare des CRITÈRES — c'est sa raison d'être, et elle ne change
pas. Ce qui manquait est l'outil qui LIT : `run_account_search` appelle le vrai
moteur (`POST /discover/registry`) et rend des candidats que Laura pose en carte
`account_ranking`, dans la bulle.

Ce que ce fichier tient :
  - l'outil existe et porte des LECTURES (le registre public) ;
  - il projette le registre sans rien inventer — un candidat sans nom sort ;
  - un score non mesuré n'est JAMAIS rendu « 0 » (GA-18/GA-19) ;
  - registre injoignable → message clair, aucun résultat inventé ;
  - le coût annoncé est celui du dépôt : 0 crédit, comme l'écran Découvrir, qui
    ne débite rien (aucun `credits.consume` sur `discover/registry`).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

TOOL_NAME = "run_account_search"


def _tool() -> dict[str, Any]:
    found = [tool for tool in CHAT_TOOLS if tool["name"] == TOOL_NAME]
    assert found, f"{TOOL_NAME} absent du catalogue d'outils"
    return found[0]


def _candidate(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "siren": "552032534",
        "name": "FREE SAS",
        "city": "Paris",
        "department": "75",
        "headcount": 1200,
        "nafLabel": "Télécommunications filaires",
        "score": 71,
        "scoreMax": 100,
        "scoreUnmeasured": ["Signaux d'intention"],
        "scoreFactors": [{"label": "Effectif dans la cible", "detail": "1 200 salariés"}],
        "addressability": {"score": 12, "scoreMax": 20},
        "qualification": {"verdict": "recommended", "reasons": ["Établissement actif"]},
        "sources": [{"name": "registre", "fetchedAt": "2026-09-16T15:26:00+00:00"}],
        "angle": "Refonte du socle réseau annoncée.",
    }
    base.update(overrides)
    return base


class _Response:
    def __init__(self, candidates: list[dict[str, Any]], degraded: list[dict[str, Any]] | None = None) -> None:
        self.candidates = candidates
        self.degraded = degraded or []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub_registry(monkeypatch: pytest.MonkeyPatch, response: Any) -> list[Any]:
    seen: list[Any] = []

    async def _fake(req: Any) -> Any:
        seen.append(req)
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    return seen


@pytest.mark.asyncio
class TestRunAccountSearch:
    async def test_l_outil_existe_et_annonce_qu_il_execute(self) -> None:
        tool = _tool()
        description = tool["description"]
        # Le modèle doit pouvoir distinguer les deux outils sur leur seule
        # description : l'un PRÉPARE, l'autre EXÉCUTE.
        assert "find_accounts" in description
        assert TOOL_NAME not in chat_tools.WRITE_TOOL_NAMES, "une lecture n'est pas une écriture"

    async def test_projette_le_registre_sans_rien_inventer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen = _stub_registry(
            monkeypatch,
            _Response([_candidate(), _candidate(siren="", name="")]),
        )
        out = await execute_chat_tool(
            TOOL_NAME,
            {"sectors": ["telecom"], "department": "75"},
            user_id="u-1",
            profile_data={"company_name": "Cyrah"},
        )
        assert seen, "le vrai moteur n'a pas été appelé"
        assert out.get("error") is None
        items = out["items"]
        # La ligne sans SIREN ni nom est ÉCARTÉE : un candidat sans identité est
        # un nom sorti d'un modèle, pas une entreprise.
        assert len(items) == 1
        assert items[0]["name"] == "FREE SAS"
        assert items[0]["score"] == 71
        assert items[0]["score_max"] == 100
        assert items[0]["not_evaluated"] == ["Signaux d'intention"]
        assert out["axes"], "un rang sans axes est un score nu"
        assert out["cost_credits"] == 0

    async def test_garde_exclu_un_compte_deja_ecarte_par_lutilisateur(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """#2299.63 — « garder exclu un résultat masqué ou rejeté par
        l'utilisateur ». Sans `excluded_sirens`, rien ne pouvait empêcher un
        compte déjà écarté PLUS TÔT dans la même conversation de revenir dans
        le tour d'horizon suivant : aucun paramètre ne portait cette mémoire.
        Le modèle la reçoit du fil (une phrase comme « pas cette boîte-là »),
        et ce paramètre est ce qui lui permet d'AGIR sur ce qu'il a lu — jamais
        une fusion ni une suppression côté registre, seulement un filtre sur CE
        rendu."""
        seen = _stub_registry(
            monkeypatch,
            _Response([_candidate(), _candidate(siren="999999999", name="SFR")]),
        )
        out = await execute_chat_tool(
            TOOL_NAME,
            {"department": "75", "excluded_sirens": ["552032534"]},
            user_id="u-1",
            profile_data=None,
        )
        assert seen, "le moteur reste appelé — le filtre s'applique après, jamais avant"
        assert [item["siren"] for item in out["items"]] == ["999999999"]

    async def test_sans_exclusion_rien_ne_change(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate(), _candidate(siren="999999999", name="SFR")]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert len(out["items"]) == 2

    async def test_un_score_absent_reste_absent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate(score=None, scoreMax=None)]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        item = out["items"][0]
        # GA-18/GA-19 : « non mesuré » n'est pas « mesuré à zéro ».
        assert "score" not in item
        assert "score_max" not in item

    async def test_3202_larchetype_esn_est_pose_sur_le_naf_deja_resolu(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """#3202 — `_search_item` pose `archetype`/`archetype_confidence` sur le
        SEUL signal NAF déjà résolu par `actor_typology.classify_actor_type`
        (GA-26 : jamais un second calcul). NAF 62.02A (conseil en systèmes et
        logiciels informatiques) est un NAF ESN reconnu."""
        _stub_registry(monkeypatch, _Response([_candidate(nafCode="6202A")]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        # #4434.3 — une ESN n'est jamais un compte cible : rangée à part, son archétype reste posé.
        item = out["competitors_aside"][0]
        assert item["archetype"] == "ESN"
        assert item["archetype_confidence"] == "confirmed"

    async def test_3202_sans_naf_larchetype_reste_absent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Un NAF absent ne devine jamais un archétype — le champ n'apparaît pas
        (une case vide, jamais une case fausse)."""
        _stub_registry(monkeypatch, _Response([_candidate(nafCode=None)]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        item = out["items"][0]
        assert "archetype" not in item
        assert "archetype_confidence" not in item

    async def test_registre_injoignable_dit_pourquoi(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, RuntimeError("registre HS"))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert "items" not in out
        assert "registre" in out["error"].lower()

    async def test_aucun_critere_exploitable(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen = _stub_registry(monkeypatch, _Response([]))
        out = await execute_chat_tool(TOOL_NAME, {}, user_id="u-1", profile_data=None)
        assert not seen, "on n'interroge pas le registre sans critère"
        assert "error" in out

    async def test_zero_correspondance_n_est_pas_une_erreur(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([], degraded=[{"source": "registre", "reason": "unavailable"}]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["items"] == []
        # Ce qui a dégradé la recherche est NOMMÉ, jamais avalé.
        assert out["degraded"]

    async def test_2264_43_source_non_couverte_distincte_dun_zero_reel(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """#2264.43 (épopée #2921) — un résultat vide doit distinguer « zéro
        résultat réellement trouvé » (une source a cherché, rien ne correspond)
        de « source non couverte » (une source ne sait pas exprimer ce critère
        du tout) : les deux se ressemblent à l'écran mais disent le contraire
        l'une de l'autre."""
        _stub_registry(
            monkeypatch,
            _Response([], degraded=[{"source": "pappers", "reason": "unsupported_filters", "kind": "capability"}]),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["items"] == []
        assert "source_not_covered_note" in out
        assert "ne couvre pas" in out["source_not_covered_note"]

    async def test_2264_43_zero_reel_ne_porte_pas_la_note_source_non_couverte(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_registry(
            monkeypatch,
            _Response([], degraded=[{"source": "pappers", "reason": "no_match", "kind": "no-match"}]),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert "source_not_covered_note" not in out

    async def test_2264_45_criteres_combines_trop_etroits_nomme(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """#2264.45 (épopée #2921) — trois critères ou plus combinés sans
        aucun problème de couverture : la combinaison elle-même est peut-être
        trop étroite, ce n'est pas une affirmation sur le marché."""
        _stub_registry(monkeypatch, _Response([]))
        out = await execute_chat_tool(
            TOOL_NAME,
            {"department": "75", "headcount": "1000+", "keywords": "cyber"},
            user_id="u-1",
            profile_data=None,
        )
        assert "narrow_criteria_note" in out
        assert "trop étroit" in out["narrow_criteria_note"]

    async def test_2264_45_un_seul_critere_ne_porte_pas_la_note(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert "narrow_criteria_note" not in out

    async def test_3202_startup_signaux_combines_et_couverture_french_tech(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """#3202.3/.5/.7 — par l'appelant réel : peu d'information (petit, IT,
        récent) ne ressort PAS startup ; un recrutement daté oui (possible) ;
        l'absence de source French Tech est DITE."""
        small_it = _candidate(
            siren="111111111", name="MINI IT", headcount=5, nafCode="6201Z", creationDate="2025-01-01"
        )
        hiring = _candidate(
            siren="222222222",
            name="RECRUTE SAS",
            signalsSearched=True,
            signals=[{"type": "hiring", "label": "Dev backend", "date": "2026-09-01"}],
        )
        _stub_registry(monkeypatch, _Response([small_it, hiring]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        # #4434.3 — « MINI IT » (NAF 62.01Z) est une ESN : rangée à part, son verdict se lit là.
        by_name = {i["name"]: i for i in [*out["items"], *out.get("competitors_aside", [])]}
        assert "startup_verdict" not in by_name["MINI IT"]
        assert by_name["RECRUTE SAS"]["startup_verdict"]["confidence"] == "possible"
        assert "French Tech" in out["french_tech_coverage_gap"]

    async def test_aucun_nom_de_fournisseur_ne_part_vers_le_modele(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """⚠️ « NOS fournisseurs ne se nomment JAMAIS — ni à l'écran, ni dans un
        prompt. » Les entrées `degraded` du registre portent le nom de la source
        (`{"source": "pappers", ...}`) : la sortie d'un outil ENTRE dans le
        contexte du modèle, donc c'est un nom de fournisseur dans un prompt. La
        RAISON survit, le fournisseur non."""
        _stub_registry(
            monkeypatch,
            _Response(
                [],
                degraded=[
                    {"source": "pappers", "reason": "timeout"},
                    {"source": "recherche-entreprises", "reason": "no_match", "kind": "no_match"},
                ],
            ),
        )
        out = await execute_chat_tool(
            TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None
        )
        rendu = repr(out).lower()
        for fournisseur in ("pappers", "recherche-entreprises", "insee", "apollo", "brave"):
            assert fournisseur not in rendu, f"« {fournisseur} » part vers le modèle"
        # Ce qui reste est la RAISON — sans elle, une liste courte se lirait
        # comme « le marché est petit ».
        raisons = [entry["reason"] for entry in out["degraded"]]
        assert "timeout" in raisons
        assert "no_match" in raisons

    async def test_3201_6_zero_resultat_nomme_le_critere_le_plus_restrictif(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """#3201.6 — RELAXATION CONTRÔLÉE : sur zéro résultat avec au moins
        deux critères combinés, `relaxation_suggestion` nomme LEQUEL relâcher,
        jamais un « élargis l'un d'eux » vague — et ne l'exécute pas seule."""
        _stub_registry(monkeypatch, _Response([]))
        out = await execute_chat_tool(
            TOOL_NAME, {"department": "75", "headcount": "1000+"}, user_id="u-1", profile_data=None
        )
        assert out["relaxation_suggestion"]["criterion"] == "headcount"
        assert "1000+" in out["relaxation_suggestion"]["message"]

    async def test_3201_6_un_seul_critere_ne_porte_pas_de_suggestion(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert "relaxation_suggestion" not in out

    async def test_3201_resultat_mince_mais_non_vide_previent_et_continue(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """#3201 COMPORTEMENT — « réduisent fortement » : prévenir puis
        CONTINUER avec le résultat, distinct de la relaxation (zéro résultat)."""
        _stub_registry(monkeypatch, _Response([_candidate(), _candidate(siren="552032535", name="AUTRE SAS")]))
        out = await execute_chat_tool(
            TOOL_NAME, {"department": "75", "headcount": "1000+"}, user_id="u-1", profile_data=None
        )
        assert len(out["items"]) == 2
        assert "narrow_result_note" in out
        assert "2 résultat" in out["narrow_result_note"]

    async def test_3201_beaucoup_de_resultats_ne_porte_pas_lavertissement(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        candidates = [_candidate(siren=str(552032534 + i), name=f"COMPTE {i}") for i in range(10)]
        _stub_registry(monkeypatch, _Response(candidates))
        out = await execute_chat_tool(
            TOOL_NAME, {"department": "75", "headcount": "1000+"}, user_id="u-1", profile_data=None
        )
        assert "narrow_result_note" not in out

    async def test_3202_archetype_esn_depuis_le_naf_deja_resolu(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """#3202 — l'archétype ESN se pose sur le NAF déjà résolu par
        `actor_typology`, jamais recalculé (GA-26)."""
        _stub_registry(monkeypatch, _Response([_candidate(nafCode="6202A")]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        # #4434.3 — l'ESN est rangée à part (`competitors_aside`), jamais dans `items`.
        assert out["items"] == []
        assert out["competitors_aside"][0]["archetype"] == "ESN"
        assert out["competitors_aside"][0]["archetype_confidence"] == "confirmed"

    async def test_3202_pas_de_naf_pas_darchetype_invente(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate(nafCode=None)]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert "archetype" not in out["items"][0]

    async def test_aucun_nom_de_fournisseur_ne_part_vers_le_modele(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """⚠️ « NOS fournisseurs ne se nomment JAMAIS — ni à l'écran, ni dans un
        prompt. » Les entrées `degraded` du registre portent le nom de la source
        (`{"source": "pappers", ...}`) : la sortie d'un outil ENTRE dans le
        contexte du modèle, donc c'est un nom de fournisseur dans un prompt. La
        RAISON survit, le fournisseur non."""
        _stub_registry(
            monkeypatch,
            _Response(
                [],
                degraded=[
                    {"source": "pappers", "reason": "timeout"},
                    {"source": "recherche-entreprises", "reason": "no_match", "kind": "no_match"},
                ],
            ),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        rendu = repr(out).lower()
        for fournisseur in ("pappers", "recherche-entreprises", "insee", "apollo", "brave"):
            assert fournisseur not in rendu, f"« {fournisseur} » part vers le modèle"
        # Ce qui reste est la RAISON — sans elle, une liste courte se lirait
        # comme « le marché est petit ».
        raisons = [entry["reason"] for entry in out["degraded"]]
        assert "timeout" in raisons
        assert "no_match" in raisons

    async def test_la_tranche_d_effectif_devient_des_bornes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen = _stub_registry(monkeypatch, _Response([_candidate()]))
        await execute_chat_tool(TOOL_NAME, {"department": "75", "headcount": "1000+"}, user_id="u-1", profile_data=None)
        filters = seen[0].filters
        assert filters.headcountMin == 1000
        # « 1000+ » n'a pas de borne haute : la poser inventerait un plafond.
        assert filters.headcountMax is None

    async def test_2547_1_un_bloc_signaux_non_mesure_est_nomme_sans_ambiguite(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """#2547.1 — mesuré en prod le 18/09 : FRANCE TELEVISIONS, BNP Paribas et
        LATECOERE portaient tous les trois la MÊME phrase invérifiable — « un
        signal a été indiqué dans les 7 derniers jours, mais sa nature et sa
        date exacte n'ont pas été rendues ». Le scoreur (`discover_scoring.py`)
        pose TOUJOURS le bloc `signals` en non mesuré pour ce chemin
        (`_signals_measurable([])` est `False` car `discover.py::
        _rank_and_angle` pose `signals: list[dict] = []`, ligne 1056) — et la
        clé technique brute `"signals"` voyageait telle quelle jusqu'au modèle
        dans `not_evaluated`. Lue seule, elle se lit comme « un signal existe,
        juste pas détaillé », au lieu de « aucun signal marché daté n'a été
        recherché ». Le libellé doit lever l'ambiguïté sans qu'on ait besoin
        du code pour la comprendre.
        """
        _stub_registry(monkeypatch, _Response([_candidate(scoreUnmeasured=["signals"])]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        not_evaluated = out["items"][0]["not_evaluated"]
        assert "signals" not in not_evaluated
        assert any("signal marché daté" in label for label in not_evaluated)

    # ── #2547.1 (suite, 18/09) — le transport réel est câblé ────────────────
    #
    # `_rank_and_angle` (`discover.py`) porte maintenant `signalsSearched` et
    # `signals` sur chaque candidat — comme le lot voisin qui a branché la
    # même mécanique dans Découvrir (`_start_signal_tasks` / `_finish_signal_
    # tasks`, top 3, budget 3s). Trois états, jamais deux (GA-18/GA-19) :
    # jamais cherché / cherché-rien-trouvé / cherché-trouvé.

    async def test_2547_1_suite_un_signal_reellement_trouve_porte_sa_date(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Un candidat réellement interrogé (`signalsSearched: True`) et dont
        un signal a été trouvé porte SA date propre et sa NATURE — jamais
        l'horodatage de lecture du registre (`fetchedAt`/`as_of`), jamais un
        nom de fournisseur (BOAMP/France Travail/BODACC)."""
        _stub_registry(
            monkeypatch,
            _Response(
                [
                    _candidate(
                        signalsSearched=True,
                        signals=[
                            {"type": "tender", "label": "AO refonte SI", "date": "2026-09-15", "detail": None},
                        ],
                    )
                ]
            ),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        item = out["items"][0]
        assert item["signals_searched"] is True
        assert item["signals"] == [{"type": "tender", "label": "AO refonte SI", "date": "2026-09-15"}]
        rendu = repr(item).lower()
        for fournisseur in ("boamp", "france_travail", "bodacc", "france travail"):
            assert fournisseur not in rendu, f"« {fournisseur} » part vers le modèle"

    async def test_3226_signal_avec_delivery_fit_a_verifier_porte_sa_note(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """#3226 (#3203.7) — un signal `potentially_compatible` porte une
        `delivery_fit_note` que Laura peut reformuler dans sa réponse,
        CONTRASTÉE avec `remoteWorkPolicy` quand ce fait est connu."""
        _stub_registry(
            monkeypatch,
            _Response(
                [
                    _candidate(
                        signalsSearched=True,
                        signals=[
                            {
                                "type": "hiring",
                                "label": "Dev Python",
                                "date": "2026-09-15",
                                "remoteWorkPolicy": "hybride",
                                "deliveryFit": "potentially_compatible",
                            }
                        ],
                    )
                ]
            ),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        note = out["items"][0]["signals"][0]["delivery_fit_note"]
        assert "hybride" in note
        assert "à vérifier" in note

    async def test_3226_signal_delivery_fit_unknown_ne_porte_aucune_note(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Laura n'annonce pas une absence de preuve à chaque signal muet.
        _stub_registry(
            monkeypatch,
            _Response(
                [
                    _candidate(
                        signalsSearched=True,
                        signals=[
                            {"type": "hiring", "label": "Dev Python", "date": "2026-09-15", "deliveryFit": "unknown"}
                        ],
                    )
                ]
            ),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert "delivery_fit_note" not in out["items"][0]["signals"][0]

    async def test_2547_1_suite_cherche_rien_trouve_est_une_mesure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """« Cherché, rien trouvé » est une mesure, pas une absence de donnée
        (GA-18/GA-19) — distincte de « jamais cherché »."""
        _stub_registry(monkeypatch, _Response([_candidate(signalsSearched=True, signals=[])]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        item = out["items"][0]
        assert item["signals_searched"] is True
        assert "signals" not in item

    async def test_2547_1_suite_candidat_non_cible_nest_pas_cherche(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """`_candidate()` de base ne porte pas `signalsSearched` — hors des
        premiers rangs interrogés, ou tâche non aboutie sous le budget : ni
        « rien trouvé » ni un signal inventé, « non recherché »."""
        _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        item = out["items"][0]
        assert item["signals_searched"] is False
        assert "signals" not in item


# ── #2299.3/.4/.6/.7 — le compilateur de blending est appliqué AVANT que les
# candidats du registre ne deviennent des lignes de la carte account_ranking.
# Logique unitaire complète dans test_blending.py ; ici, la preuve que
# `run_account_search` (l'APPELANT réel) l'utilise vraiment.
@pytest.mark.asyncio
class TestBlendingCoteRunAccountSearch:
    async def test_deux_candidats_meme_siren_ne_rendent_qu_une_ligne(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(
            monkeypatch,
            _Response([_candidate(city="Paris"), _candidate(city="Levallois-Perret")]),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert len(out["items"]) == 1

    async def test_une_hypothese_de_doublon_devient_une_limite_affichee(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Deux candidats seulement proches par le nom, SIREN différents,
        restent deux lignes (2299.3) et l'un comme l'autre porte
        l'hypothèse dans `limits` — le champ déjà rendu par
        `AccountRankingCard.tsx` (`LabeledLines label={limits}`)."""
        _stub_registry(
            monkeypatch,
            _Response(
                [
                    _candidate(siren="552032534", name="Bellum IT"),
                    _candidate(siren="999999999", name="Bellum-IT"),
                ]
            ),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert len(out["items"]) == 2
        for item in out["items"]:
            assert item["limits"]
            assert "reasoning" not in repr(item["limits"])  # texte déjà rédigé, pas la structure brute
            rendu = repr(item["limits"]).lower()
            assert any(str(v).replace(".", "", 1).isdigit() is False for v in item["limits"])

    async def test_deux_noms_sans_rapport_ne_portent_aucune_limite_fabriquee(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_registry(
            monkeypatch,
            _Response(
                [
                    _candidate(siren="552032534", name="Bellum IT"),
                    _candidate(siren="999999999", name="Capgemini"),
                ]
            ),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert all("limits" not in item for item in out["items"])


@pytest.mark.asyncio
class TestSignalsNotApplied:
    """#2892 — recette écran FAIL du 26/09 : « trouve-moi des comptes avec un
    signal de recrutement dans la fintech » a rendu 0 résultat dans le tour
    d'horizon, sans jamais dire pourquoi. Cause : `run_account_search` appelle
    le REGISTRE (`discover_registry`), qui n'a aucune notion de signal
    d'intention — contrairement à `find_accounts`, qui les route vers
    Découvrir. Le paramètre `signals` n'existait même pas dans son schéma :
    un signal demandé disparaissait en silence, exactement le défaut des
    « mots-clés orphelins » (#1180) déjà nommé un peu plus haut dans ce fichier.

    Le correctif NOMME ce qui n'est pas appliqué (même doctrine que
    `keywords_not_applied` sur `find_accounts`) plutôt que de rendre un faux
    zéro, et redirige vers l'outil qui sait vraiment le faire.
    """

    async def test_signal_combine_a_un_secteur_nomme_ce_qui_nest_pas_applique(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen = _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(
            TOOL_NAME,
            {"sectors": ["finance"], "signals": ["hiring"]},
            user_id="u-1",
            profile_data=None,
        )
        assert seen, "le registre est bien interrogé sur le reste des critères"
        assert out.get("error") is None
        assert len(out["items"]) == 1
        assert out["signals_not_applied"] == ["hiring"]
        assert "find_accounts" in out["signals_not_applied_reason"]
        # Le registre lui-même n'a jamais vu le signal (rien à filtrer dessus).
        assert not hasattr(seen[0].filters, "signals")

    async def test_signal_seul_sans_autre_critere_redirige_vers_find_accounts(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen = _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"signals": ["hiring"]}, user_id="u-1", profile_data=None)
        assert not seen, "aucun critère que le registre sait appliquer : pas d'appel"
        assert "error" in out
        assert "find_accounts" in out["error"]

    async def test_sans_signal_demande_rien_ne_change(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert "signals_not_applied" not in out


# ── #2852.6-53 (lot V22, suite) — enveloppe canonique de résultat d'outil,
# câblée sur le premier outil MULTI-SOURCES du catalogue (le registre public,
# distinct de `bellum_workspace`). `evidence`/`freshness`/`confidence`
# restent HORS de ce lot (doctrine : un score sans second axe serait nu) —
# seuls `status`/`result_type`/`sources_consulted` sont ajoutés, sur le
# signal de couverture qui existe DÉJÀ dans ce fichier (`degraded`/`kind`).
@pytest.mark.asyncio
class TestToolResultEnvelope:
    async def test_missing_criteria_names_invalid_input(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([]))
        out = await execute_chat_tool(TOOL_NAME, {}, user_id="u-1", profile_data=None)
        assert out["status"] == "invalid_input"
        assert out["error_code"] == "missing_search_criteria"

    async def test_signal_alone_names_not_covered(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"signals": ["hiring"]}, user_id="u-1", profile_data=None)
        assert out["status"] == "not_covered"
        assert out["error_code"] == "signals_not_supported"

    async def test_registry_failure_names_provider_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, RuntimeError("registre HS"))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["status"] == "provider_error"
        assert out["error_code"] == "registry_unavailable"

    async def test_a_real_zero_match_names_empty_never_not_covered(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([], degraded=[{"source": "registre", "reason": "unavailable"}]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["status"] == "empty"

    async def test_a_capability_gap_names_not_covered_never_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Le NO-GO de #2282 : une source qui ne sait pas EXPRIMER le critère
        n'a rien cherché, elle ne rend jamais `empty`."""
        _stub_registry(
            monkeypatch,
            _Response([], degraded=[{"source": "pappers", "reason": "unsupported_filters", "kind": "capability"}]),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["status"] == "not_covered"

    async def test_a_complete_search_names_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["status"] == "success"
        assert out["sources_consulted"] == ["registre_entreprises"]
        assert "partial_reason" not in out

    async def test_a_capped_search_names_partial_with_its_reason(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(
            monkeypatch,
            _Response([_candidate(), _candidate(siren="999999999", name="SFR")]),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75", "limit": 1}, user_id="u-1", profile_data=None)
        assert len(out["items"]) == 1
        assert out["status"] == "partial"
        assert out["partial_reason"]
        assert out["returned_count"] == 1

    async def test_no_vendor_name_leaks_through_the_envelope(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(
            monkeypatch,
            _Response([], degraded=[{"source": "pappers", "reason": "unsupported_filters", "kind": "capability"}]),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["sources_consulted"] == ["registre_entreprises"]


# ── #2852.11/.19/.20/.24/.36 (lot suivant) — couverture unifiée, caveats,
# unknowns, durée mesurée et statut `timeout` DISTINCT de `provider_error`,
# sur le même outil multi-sources.
@pytest.mark.asyncio
class TestToolResultEnvelopeCoverageAndTimeout:
    async def test_coverage_counts_by_kind_never_by_vendor_name(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(
            monkeypatch,
            _Response(
                [_candidate()],
                degraded=[
                    {"source": "pappers", "reason": "unsupported_filters", "kind": "capability"},
                    {"source": "societe_com", "reason": "unavailable"},
                ],
            ),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["coverage"] == {"capability_gap": 1, "failed": 1}
        assert "pappers" not in str(out) and "societe_com" not in str(out)

    async def test_coverage_absent_when_nothing_degraded(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert "coverage" not in out

    async def test_duration_ms_is_measured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert isinstance(out["duration_ms"], int)
        assert out["duration_ms"] >= 0

    async def test_narrow_criteria_becomes_a_caveat(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([]))
        out = await execute_chat_tool(
            TOOL_NAME,
            {"department": "75", "headcount": "1000+", "keywords": "aéronautique"},
            user_id="u-1",
            profile_data=None,
        )
        assert out["caveats"]
        assert "étroit" in out["caveats"][0]

    async def test_capability_gap_becomes_an_unknown(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(
            monkeypatch,
            _Response([], degraded=[{"source": "pappers", "reason": "unsupported_filters", "kind": "capability"}]),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["unknowns"]
        assert "pappers" not in str(out["unknowns"])

    async def test_real_source_failure_becomes_an_unknown_too(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, _Response([_candidate()], degraded=[{"source": "pappers", "reason": "down"}]))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["unknowns"]

    async def test_a_real_timeout_names_the_timeout_status_not_provider_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import asyncio

        async def _hangs(_req: Any) -> Any:
            await asyncio.sleep(10)
            return _Response([_candidate()])

        monkeypatch.setattr("app.routers.discover.discover_registry", _hangs)
        monkeypatch.setattr(chat_tools, "_account_search_budget_s", lambda: 0.01)
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["status"] == "timeout"
        assert out["error_code"] == "registry_timeout"
        assert "error" in out

    async def test_a_real_provider_error_still_names_provider_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, RuntimeError("registre HS"))
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        assert out["status"] == "provider_error"

    # #3759.3 (recette prod 09/10, « cartographie de Montpellier », ~70 s puis
    # « recherche interrompue », aucune carte account_map) — le budget EXTÉRIEUR
    # de cet outil valait EXACTEMENT `discover.DISCOVER_TIME_BUDGET_S` (20,0 s),
    # le budget INTÉRIEUR que `discover_registry` porte pour rendre un résultat
    # PARTIEL plutôt que d'échouer (« un résultat partiel se dit, il ne se
    # cache pas », `discover.py:101-118`). Deux budgets identiques et imbriqués
    # coupent l'intérieur AVANT qu'il ait fini son propre repli gracieux,
    # jetant les candidats déjà trouvés — jamais de carte partielle. SAIT DIRE
    # NON : si quelqu'un réaligne un jour les deux budgets sur la même valeur,
    # ce test échoue avant que la régression ne reparte en prod.
    def test_3759_3_le_budget_exterieur_reste_strictement_au_dessus_du_budget_interieur(self) -> None:
        from app.routers.discover import DISCOVER_TIME_BUDGET_S

        assert chat_tools._account_search_default_budget_s() > DISCOVER_TIME_BUDGET_S
        # La marge elle-même, nommée (GA-26) : pas une constante qui dérive en
        # silence du côté de `discover.py` sans que ce côté-ci ne la suive.
        assert chat_tools._account_search_default_budget_s() == (
            DISCOVER_TIME_BUDGET_S + chat_tools._ACCOUNT_SEARCH_BUDGET_MARGIN_S
        )

    def test_3759_3_une_valeur_reglee_a_la_main_reste_prioritaire_sur_le_defaut(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("ACCOUNT_SEARCH_BUDGET_S", "9")
        assert chat_tools._account_search_budget_s() == 9.0

    # #3866.1 (BEL-LAU-1008-015, recette bêta 08/10) — « L'adresse, l'ancienneté ou
    # l'existence juridique d'une société ne suffisent pas à la recommander ». Les
    # `axes` de ce tour d'horizon (`_search_axes`) sont des critères de recherche
    # ÉCHOÉS (secteur, département, effectif, raison sociale, établissement actif) —
    # jamais une preuve d'intérêt pour une demande précise. Sans note, rien n'empêche
    # le modèle de les présenter comme la raison métier d'une recommandation.
    async def test_3866_1_le_resultat_nomme_que_les_axes_sont_des_criteres_pas_une_preuve_dinteret(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"sectors": ["telecom"], "department": "75"}, user_id="u-1", profile_data=None)
        assert "commercial_fit_note" in out
        note = out["commercial_fit_note"]
        assert "secteur" in note.lower() or "critère" in note.lower()
        assert "ne prouve pas" in note.lower() or "ne suffit pas" in note.lower() or "ne constitue pas" in note.lower()

    # #3866 (décision Louis 10/10) — quatre types de relation, vérifiés AVANT de recommander :
    # client final · ESN concurrente/interne · partenaire · intermédiaire (portage, cabinet
    # de référencement). Le registre n'a pas cette taxonomie : la consigne la pose au modèle.
    async def test_relation_type_taxonomy_is_posed_with_the_four_types(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_registry(monkeypatch, _Response([_candidate()]))
        out = await execute_chat_tool(TOOL_NAME, {"sectors": ["telecom"], "department": "75"}, user_id="u-1", profile_data=None)
        assert out["relation_types"] == ["end_client", "competing_esn", "partner", "intermediary"]
        note = out["relation_type_note"].lower()
        for needle in ("client final", "esn", "partenaire", "intermédiaire", "portage", "référencement"):
            assert needle in note
        assert "avant" in note and "recommand" in note

    # #3866.1 — le type de relation est posé PAR LIGNE (forme + activité), « non déterminé »
    # nommé quand on ne sait pas : la consigne seule laissait le modèle deviner.
    async def test_3866_each_item_carries_its_relation_type(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(
            monkeypatch,
            _Response(
                [
                    _candidate(siren="111111111", name="Hyper Distribution SA", nafCode="47.11F"),
                    _candidate(siren="222222222", name="Alpha Conseil SAS", nafCode="62.02A"),
                    _candidate(
                        siren="333333333", name="Groupe Delta Systemes", nafCode="62.01Z", legalCategory="6540"
                    ),
                    _candidate(siren="444444444", name="Sans Code"),
                ]
            ),
        )
        out = await execute_chat_tool(TOOL_NAME, {"department": "75"}, user_id="u-1", profile_data=None)
        # #4434.3 — l'ESN concurrente (222…) sort de `items`, rangée dans `competitors_aside`.
        assert "222222222" not in {item["siren"] for item in out["items"]}
        by_siren = {item["siren"]: item for item in [*out["items"], *out["competitors_aside"]]}
        assert by_siren["111111111"]["relation_type"] == "end_client"
        assert by_siren["222222222"]["relation_type"] == "competing_esn"
        assert by_siren["333333333"]["relation_type"] == "undetermined"
        assert "groupe" in by_siren["333333333"]["relation_type_reason"].lower()
        assert by_siren["444444444"]["relation_type"] == "undetermined"
        assert by_siren["111111111"].get("relation_type_reason") is None

    # #3759.recette 09/10 — « cartographie de Montpellier » (~60 s) a fini en texte
    # libre AVEC des puces inventées, l'une en anglais (« territory ») — aucune
    # ligne de ce module ne produit « territory » : la porte de forme ne construit
    # jamais de carte sur une erreur (`shape_read_from_tool` rend `None` dès que
    # `output["error"]` est posé), donc le modèle improvisait librement son propre
    # texte de repli. La description de l'outil ne disait qu'un seul côté de la
    # règle (« dis-le si le registre n'a pas répondu ») sans jamais interdire d'y
    # AJOUTER quoi que ce soit — ouvrant la porte à une liste inventée, dans
    # n'importe quelle langue. SAIT DIRE NON : si cette consigne disparaît un
    # jour, ce test échoue avant que la régression ne reparte en prod.
    def test_3759_recette_09_10_la_description_interdit_d_enrichir_une_erreur(self) -> None:
        description = _tool()["description"]
        assert "le registre n'a pas répondu" in description
        lowered = description.lower()
        assert "tel quel" in lowered or "sans l'étoffer" in lowered
        assert "n'ajoute rien d'autre" in lowered or "jamais une liste" in lowered or "en français" in lowered


def test_les_tranches_d_effectif_disent_la_meme_chose_des_deux_cotes() -> None:
    """Le vocabulaire (`_DISCOVER_HEADCOUNTS`) et sa traduction en bornes
    (`_HEADCOUNT_BOUNDS`) portent les MÊMES clés. Une tranche ajoutée d'un seul
    côté produirait un critère annoncé au modèle que le registre ignorerait en
    silence — le défaut exact des mots-clés orphelins (#1180)."""
    assert set(chat_tools._DISCOVER_HEADCOUNTS) == set(chat_tools._HEADCOUNT_BOUNDS)
