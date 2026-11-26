"""#2069 — LES SUGGESTIONS DE `/welcome` VIENNENT DE COMPTES RÉELS, OU ELLES
N'EXISTENT PAS.

CE QUE CE FICHIER PROUVE
------------------------
Le lot doctrine #2069 a retiré du prompt la consigne « Privilégie des noms
français bien connus (CAC40/SBF120) » — une génération libre depuis la
connaissance générale du modèle, donc de la donnée fictive. Plus rien
n'injectait de comptes réels : la liste sortait VIDE.

Ce fichier suit une suggestion DE BOUT EN BOUT — de la mémoire marché
(`bellum_api.search_market_memory`, le corpus des parcours réels) jusqu'au champ
`welcomeSummary.firstAnalysisSuggestions` que `FirstAnalysisSuggestionsGrid.tsx`
affiche — et prouve qu'AUCUN nom n'apparaît quand la source est muette.

⚠️ LE PIÈGE PAYÉ AILLEURS ET ÉVITÉ ICI : « pydantic ignore les clés inconnues ».
Un champ ajouté au prompt, produit par le modèle, PAYÉ, et jamais stocké parce
que le modèle en aval ne le déclare pas. Les tests du prompt vérifiaient le
prompt ; ceux de l'écran montaient des données à la main ; personne ne voyait le
trou. `test_bout_en_bout_*` traverse les deux.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.agents.profiler import ProfilerAgent
from app.models.agent_envelope import AgentStatus, SourceHealth
from app.models.profile_context import (
    AnalysisParameters,
    BellumPhrases,
    CadenceRecommendation,
    CoachingInsights,
    EsnArchetype,
    FirstAnalysisSuggestion,
    IdealAccountProfile,
    KpiTargets,
    MessagingStyle,
    ProfileContext,
    SellingPosture,
    WelcomeSummary,
)
from app.services import welcome_account_suggestions as was
from app.services.claude_service import TokenUsage

ANSWERS: dict[str, Any] = {
    "user_id": "user-42",
    "esn_name": "DataCraft",
    "expertise_areas": ["Data & IA", "Cloud", "Cybersécurité"],
    "target_sectors": ["Banque", "Assurance"],
    "target_company_types": ["ETI"],
    "geo_zones": ["Île-de-France"],
}

_USAGE = TokenUsage(input_tokens=100, output_tokens=500, model="claude-haiku-4-5", cost_usd=0.0)


def _coverage(*, stack: list[str], paths: int = 12) -> dict[str, Any]:
    """Une couverture au format EXACT du pont (`marketMemoryCoverageSchema`,
    camelCase) — `esnObserved` et `marketPaths` compris, pour prouver qu'ils ne
    traversent PAS jusqu'au prompt."""
    return {
        "covered": True,
        "marketPaths": paths,
        "esnObserved": [{"esnName": "Capgemini", "persons": 7, "certainty": "forte"}],
        "observedStack": [{"techno": techno, "persons": 4} for techno in stack],
        "roleFamilies": [{"family": "Autre", "persons": 9}],
        "exEsnPresent": 3,
        "observedZone": None,
    }


def _match(name: str, *, stack: list[str] | None = None) -> dict[str, Any]:
    return {"companyName": name, "coverage": _coverage(stack=stack or ["Java"])}


def _ok(*names: str, stack: list[str] | None = None) -> dict[str, Any]:
    return {"status": "ok", "truncated": False, "matches": [_match(n, stack=stack) for n in names]}


class _Bridge:
    """Un pont scriptable : une réponse par `technology` demandée. Enregistre les
    charges utiles pour qu'un test puisse affirmer qu'aucun appel n'est parti."""

    def __init__(self, by_technology: dict[str, Any] | None = None, *, configured: bool = True):
        self.by_technology = by_technology or {}
        self.configured = configured
        self.calls: list[dict[str, Any]] = []

    def is_configured(self) -> bool:
        return self.configured

    async def search_market_memory(self, user_id: str, **kwargs: Any) -> Any:
        self.calls.append({"user_id": user_id, **kwargs})
        answer = self.by_technology.get(kwargs.get("technology"))
        if isinstance(answer, Exception):
            raise answer
        return answer


def _read(bridge: _Bridge, answers: dict[str, Any] | None = None, **kwargs: Any) -> was.RealAccountsRead:
    with patch.object(was, "bellum_api", bridge):
        return asyncio.run(was.real_accounts_for(answers if answers is not None else ANSWERS, **kwargs))


# ── 1. Le repli n'est PAS d'inventer ─────────────────────────────────────────


def test_sans_source_aucun_nom_et_le_bloc_est_vide():
    """Pont non configuré : `status` le DIT, et le bloc de prompt est vide.

    Un `""` ici est la traduction exacte de « on ne nomme rien » : le prompt ne
    porte plus aucune entreprise, donc le modèle n'a plus rien à reprendre."""
    read = _read(_Bridge(configured=False), user_id="user-42")
    assert read.status == "not_configured"
    assert read.companies == []
    assert was.prompt_block(read) == ""


def test_corpus_illisible_ne_se_lit_pas_comme_un_corpus_vide():
    """`unavailable` (on n'a pas pu LIRE) ≠ « aucune entreprise ne correspond ».

    Les deux rendent zéro nom, mais ils ne se NOMMENT pas pareil — c'est la même
    distinction que `MarketMemoryService` tient côté NestJS."""
    down = {"status": "unavailable", "reason": "corpus_down"}
    read = _read(_Bridge({"Data & IA": down, "Cloud": down, "Cybersécurité": down}), user_id="user-42")
    assert read.status == "unavailable"
    assert read.companies == []
    assert was.prompt_block(read) == ""

    vide = _read(
        _Bridge({"Data & IA": _ok(), "Cloud": _ok(), "Cybersécurité": _ok()}),
        user_id="user-42",
    )
    assert vide.status == "empty"
    assert was.prompt_block(vide) == ""

    # Une lecture PARTIELLE ne se dit pas « le corpus est vide » : tant qu'une
    # question n'a pas pu être lue, on ne sait pas ce qu'elle aurait rendu.
    partielle = _read(_Bridge({"Data & IA": _ok(), "Cloud": down, "Cybersécurité": down}), user_id="user-42")
    assert partielle.status == "unavailable"


def test_sans_user_id_aucun_appel_reseau():
    """L'identité de l'appelant est ce qui cloisonne la lecture. Sans elle, on ne
    lit rien — jamais un balayage du corpus partagé « au nom de personne ».

    ⚠️ Ce n'est PLUS l'état de production : `apps/ia/app/routers/profiler.py`
    passe désormais `user_id=answers.user_id` en argument nommé (le dict du
    prompt l'exclut toujours, et c'est voulu). Ce test reste le témoin du cas
    LÉGITIME voisin — un appel sans identité ne lit rien et le dit — et
    `test_le_routeur_passe_user_id_a_l_agent` tient l'autre moitié."""
    bridge = _Bridge({"Data & IA": _ok("Société Générale")})
    sans_identite = {k: v for k, v in ANSWERS.items() if k != "user_id"}
    read = _read(bridge, sans_identite, user_id=None)
    assert read.status == "no_caller"
    assert bridge.calls == []
    assert was.prompt_block(read) == ""


def test_sans_filtre_aucun_appel_reseau():
    """Un filtre est OBLIGATOIRE (refusé par `chat_tools` ET par NestJS). Sans
    expertise ni zone, la question ne se pose pas : on ne part pas."""
    bridge = _Bridge({})
    read = _read(bridge, {"user_id": "u", "expertise_areas": [], "geo_zones": []}, user_id="u")
    assert read.status == "no_filter"
    assert bridge.calls == []


# ── 2. La source réelle, et rien qu'elle ─────────────────────────────────────


def test_le_nom_vient_du_corpus_verbatim():
    bridge = _Bridge({"Data & IA": _ok("Société Générale")})
    read = _read(bridge, user_id="user-42")
    assert read.status == "ok"
    assert [c.name for c in read.companies] == ["Société Générale"]
    assert "Société Générale" in was.prompt_block(read)


def test_la_zone_declaree_part_comme_filtre():
    bridge = _Bridge({"Data & IA": _ok("Société Générale")})
    _read(bridge, user_id="user-42")
    assert bridge.calls, "corpus vide : le test ne prouverait rien"
    assert all(call["location"] == "Île-de-France" for call in bridge.calls)


def test_aucun_fait_de_memoire_marche_ne_traverse_jusquau_prompt():
    """Le bloc ne porte NI nom de société de services, NI compte de parcours, NI
    famille de rôles, NI probabilité — seulement le nom de l'entreprise et les
    expertises que l'ESN a DÉCLARÉES elle-même.

    Retirer le MOYEN, pas seulement la permission : la phrase « 12 parcours »
    n'existe nulle part dans ce qui est transmis.

    ⚠️ LES DEUX FORMES DE LIGNE SONT COUVERTES. Premier jet de ce test : une
    seule entreprise, dont la pile recoupait une expertise déclarée — la branche
    « sans expertise recoupée » n'était jamais rendue, et la casser volontairement
    laissait le test VERT. Une garde borgne de plus. « Orange », dont la pile ne
    recoupe rien, force l'autre branche."""
    bridge = _Bridge(
        {
            "Data & IA": {
                "status": "ok",
                "truncated": False,
                "matches": [
                    _match("Société Générale", stack=["Java", "Cloud"]),
                    _match("Orange", stack=["COBOL"]),
                ],
            }
        }
    )
    read = _read(bridge, user_id="user-42")
    block = was.prompt_block(read)
    assert block, "corpus vide : l'absence ne prouverait rien"  # la garde LIT quelque chose
    assert "Société Générale" in block and "Orange" in block
    assert [c.reinforced_expertises for c in read.companies] == [["Cloud"], []], "les deux branches de ligne"
    for interdit in ("Capgemini", "12", "parcours", "Autre", "%", "probabilit"):
        assert interdit not in block, f"« {interdit} » a traversé jusqu'au prompt"


def test_les_expertises_transmises_sont_celles_que_lesn_a_declarees():
    """`Cloud` est observé chez le compte ET déclaré par l'ESN → il remonte, sous
    le libellé de l'ESN. `Java`, observé mais jamais déclaré, ne remonte pas."""
    bridge = _Bridge({"Data & IA": _ok("Société Générale", stack=["Java", "Cloud"])})
    read = _read(bridge, user_id="user-42")
    assert read.companies[0].reinforced_expertises == ["Cloud"]


# ── 3. La diversité se PROUVE, elle ne se suppose pas ────────────────────────


def test_les_sources_sont_entrelacees_pas_concatenees():
    """⚠️ N sources concaténées puis TRONQUÉES : à scores égaux la PREMIÈRE
    occupe toutes les places. Ici trois expertises rendent chacune quatre
    entreprises : les quatre places retenues viennent de trois requêtes
    DIFFÉRENTES, jamais quatre fois de la première.

    Cette assertion sait dire NON : remplacer l'entrelacement par une
    concaténation la fait échouer (`['A1','A2','A3','A4']`)."""
    bridge = _Bridge(
        {
            "Data & IA": _ok("A1", "A2", "A3", "A4"),
            "Cloud": _ok("B1", "B2", "B3", "B4"),
            "Cybersécurité": _ok("C1", "C2", "C3", "C4"),
        }
    )
    read = _read(bridge, user_id="user-42")
    noms = [c.name for c in read.companies]
    assert noms == ["A1", "B1", "C1", "A2"]


def test_une_requete_en_echec_ne_tue_pas_les_autres():
    """⚠️ Borner ne suffit pas, il faut TOLÉRER. Une requête qui lève emporterait
    tout le fan-out sous un `gather` sans `return_exceptions`."""
    bridge = _Bridge(
        {
            "Data & IA": RuntimeError("réseau"),
            "Cloud": _ok("B1"),
            "Cybersécurité": _ok("C1"),
        }
    )
    read = _read(bridge, user_id="user-42")
    assert read.status == "ok"
    assert [c.name for c in read.companies] == ["B1", "C1"]


def test_le_meme_compte_ne_prend_pas_deux_places():
    """Dédoublonnage INTRA-référentiel : deux requêtes sur le MÊME corpus, donc
    le nom y est bien la clé. ⚠️ Ce n'est pas une jointure entre deux
    référentiels — celle-là ne se fait jamais par le nom.

    ⚠️ `ILIKE` plie la casse, pas les accents : le pli applique NFD, donc
    « SOCIETE GENERALE » et « Société Générale » sont le même compte."""
    bridge = _Bridge({"Data & IA": _ok("Société Générale"), "Cloud": _ok("SOCIETE GENERALE", "Orange")})
    read = _read(bridge, user_id="user-42")
    assert [c.name for c in read.companies] == ["Société Générale", "Orange"]


def test_le_nombre_de_requetes_est_borne():
    bridge = _Bridge({})
    answers = {**ANSWERS, "expertise_areas": [f"E{i}" for i in range(12)]}
    _read(bridge, answers, user_id="user-42")
    assert len(bridge.calls) == was.MAX_QUERIES


def test_la_liste_ne_depasse_jamais_le_plafond_du_contrat():
    """`firstAnalysisSuggestions` est borné à 4 par `welcomeSummarySchema`
    (`packages/contracts/src/schemas/profile-context.ts`) et par `max_length=4`
    côté pydantic : en proposer 12 au modèle l'inviterait à en rendre 12."""
    bridge = _Bridge({"Data & IA": _ok(*[f"A{i}" for i in range(12)])})
    read = _read(bridge, user_id="user-42")
    assert len(read.companies) == was.MAX_SUGGESTIONS == 4


# ── 4. Le témoin : la garde n'attrape pas ce qu'elle ne vise pas ─────────────


def test_un_bloc_legitime_nest_pas_confondu_avec_une_invention():
    """Témoin de cas voisin légitime : une entreprise dont le nom CONTIENT un
    chiffre (« Groupe 3SI ») n'est pas rejetée — l'interdit porte sur les faits
    de mémoire marché transmis, pas sur les chiffres d'un nom propre."""
    bridge = _Bridge({"Data & IA": _ok("Groupe 3SI")})
    read = _read(bridge, user_id="user-42")
    assert [c.name for c in read.companies] == ["Groupe 3SI"]
    assert "Groupe 3SI" in was.prompt_block(read)


# ── 5. Bout en bout : de la source réelle au champ que l'écran lit ───────────


def _profile(suggestions: list[FirstAnalysisSuggestion]) -> ProfileContext:
    return ProfileContext(
        esn_archetype=EsnArchetype.BOUTIQUE_EXPERT,
        selling_posture=SellingPosture.EXPERTISE_RARE,
        ideal_account_profile=IdealAccountProfile(
            size="eti", sectors_priority=["Banque"], decision_level="director", entry_strategy="bottomUp"
        ),
        analysis_parameters=AnalysisParameters(
            brave_queries_count=10,
            firecrawl_pages_count=5,
            contacts_target=30,
            analysis_depth="standard",
            max_tokens_research=12000,
            focus_areas=["data team", "CDO", "data projects", "modern data stack"],
        ),
        messaging_style=MessagingStyle(
            tone="directExpert",
            message_length="standard",
            value_proposition_angle="expertise rare en Data et IA",
            differentiation_points=["spécialisation", "expertise data", "agilité"],
            avoid=["offre globale"],
        ),
        coaching_insights=CoachingInsights(
            main_weakness="prospection irrégulière",
            key_advice="Concentre-toi sur 5 comptes par semaine.",
            cadence_recommendation=CadenceRecommendation(
                analyses_per_week=5, messages_per_day=10, follow_ups_per_week=20
            ),
            kpi_targets=KpiTargets(accounts_per_month=15, rdv_per_month=4, conversion_rate_target="20%"),
        ),
        bellum_phrases=BellumPhrases(
            welcome="Bienvenue !",
            first_analysis_cta="Commencez par une ETI dans la banque.",
            weekly_summary_intro="Cette semaine, focalise-toi sur tes ETI finance.",
            empty_state="Ton pipeline est vide.",
            score_context="Un score élevé se justifie par ses axes.",
        ),
        welcome_summary=WelcomeSummary(
            profile_recap="Tu es une ESN data.",
            searches_personalization="Les recherches cibleront la data.",
            contacts_personalization="Les contacts seront des DSI.",
            messages_personalization="Les messages seront directs.",
            scoring_personalization="Le scoring évaluera la maturité data.",
            first_analysis_suggestions=suggestions,
        ),
    )


def _run_agent(bridge: _Bridge, *, suggestions: list[FirstAnalysisSuggestion], answers: dict[str, Any] | None = None):
    """Fait tourner l'agent en capturant le prompt utilisateur réellement envoyé."""
    captured: dict[str, str] = {}

    def _fake_claude(system: str, user: str, **kwargs: Any):
        captured["user"] = user
        return _profile(suggestions), _USAGE

    # ⚠️ La vraie `asyncio.sleep` est capturée AVANT le patch : un remplaçant qui
    # appellerait `asyncio.sleep(0)` après coup s'appellerait LUI-MÊME, et
    # l'agent rendrait `terminal_failure` sur une `RecursionError` — un rouge qui
    # ne parle pas du code testé.
    _real_sleep = asyncio.sleep

    async def _no_pacing(*_args: Any, **_kwargs: Any) -> None:
        await _real_sleep(0)

    async def _go():
        with (
            patch.object(was, "bellum_api", bridge),
            patch("app.agents.profiler.call_claude_sync", side_effect=_fake_claude),
            patch("asyncio.sleep", new=_no_pacing),
        ):
            return await ProfilerAgent().run(answers if answers is not None else ANSWERS)

    return asyncio.run(_go()), captured


def test_bout_en_bout_une_suggestion_part_du_corpus_et_arrive_au_champ_que_lecran_lit():
    """DE LA SOURCE À L'ÉCRAN, en une seule assertion continue :

    1. le corpus rend « Société Générale » ;
    2. ce nom est DANS le prompt utilisateur envoyé au modèle ;
    3. le `ProfileContext` rendu le porte dans `first_analysis_suggestions` —
       pydantic ne l'avale pas ;
    4. la sérialisation par ALIAS porte `firstAnalysisSuggestions[].companyName`,
       la clé exacte que `FirstAnalysisSuggestionsGrid.tsx` lit.
    """
    bridge = _Bridge({"Data & IA": _ok("Société Générale")})
    envelope, captured = _run_agent(
        bridge,
        suggestions=[FirstAnalysisSuggestion(company_name="Société Générale", sector="Banque", reason="Pile cloud.")],
    )

    assert bridge.calls, "le corpus n'a jamais été interrogé"
    assert "Société Générale" in captured["user"]
    assert envelope.status == AgentStatus.SUCCESS
    assert envelope.data is not None
    assert [s.company_name for s in envelope.data.welcome_summary.first_analysis_suggestions] == ["Société Générale"]

    wire = envelope.data.model_dump(mode="json", by_alias=True)
    assert wire["welcomeSummary"]["firstAnalysisSuggestions"][0]["companyName"] == "Société Générale"


def test_bout_en_bout_sans_corpus_le_prompt_est_identique_a_celui_davant():
    """⚠️ LE CŒUR DU LOT : sans compte réel, le prompt utilisateur est BYTE-
    IDENTIQUE à celui qui ne connaît pas l'injection, et la liste sort vide.

    Une injection qui laisserait une en-tête vide (« Comptes réels : »)
    inviterait le modèle à la remplir. Ce test sait dire NON : écrire le bloc
    inconditionnellement le fait échouer."""
    from app.prompts.bellum_profiler import build_profiler_user_prompt

    bridge = _Bridge({"Data & IA": _ok()})
    _envelope, captured = _run_agent(bridge, suggestions=[])
    assert captured["user"] == build_profiler_user_prompt(ANSWERS)

    assert _envelope.data is not None
    assert _envelope.data.welcome_summary.first_analysis_suggestions == []


# ── #2012.12 / épopée #2776 — la source facultative se SIGNALE ──────────────


def test_bout_en_bout_corpus_illisible_continue_et_signale_la_couverture_reduite():
    """Le blocage nommé par l'épopée #2776 : `ProfilerEnvelope` ne portait
    AUCUN champ de provenance/échec pour cette source facultative — l'agent
    CONTINUAIT (liste vide, jamais un échec de tout le profil), mais rien ne
    le DISAIT. `meta.source_health["market_memory"]` porte maintenant ce
    signal, exactement comme les autres agents (`phase1_research.py`)."""
    down = {"status": "unavailable", "reason": "corpus_down"}
    bridge = _Bridge({"Data & IA": down, "Cloud": down, "Cybersécurité": down})
    envelope, _captured = _run_agent(bridge, suggestions=[])

    # Continue : l'échec d'une source facultative ne fait pas échouer l'audit.
    assert envelope.status == AgentStatus.SUCCESS
    assert envelope.meta.source_health == {"market_memory": SourceHealth.DOWN}


def test_bout_en_bout_corpus_lu_avec_succes_signale_ok():
    bridge = _Bridge({"Data & IA": _ok("Société Générale")})
    envelope, _captured = _run_agent(
        bridge,
        suggestions=[FirstAnalysisSuggestion(company_name="Société Générale", sector="Banque", reason="Pile cloud.")],
    )
    assert envelope.meta.source_health == {"market_memory": SourceHealth.OK}


def test_bout_en_bout_source_jamais_interrogee_nest_pas_confondue_avec_une_panne():
    """`not_configured` (le pont n'est pas branché dans cet environnement)
    n'est pas une DÉGRADATION — c'est un choix, pas une panne, donc `SKIPPED`
    et jamais `DOWN`."""
    bridge = _Bridge(configured=False)
    envelope, _captured = _run_agent(bridge, suggestions=[])
    assert envelope.meta.source_health == {"market_memory": SourceHealth.SKIPPED}


def test_une_liste_vide_reste_valide_cote_modele():
    """`min_length` est ABSENT de `first_analysis_suggestions` : une liste vide
    doit se construire sans lever. Un plancher ici SERAIT la consigne
    d'inventer."""
    profile = _profile([])
    assert profile.welcome_summary.first_analysis_suggestions == []
    with pytest.raises(ValidationError):
        WelcomeSummary(
            profile_recap="x",
            searches_personalization="x",
            contacts_personalization="x",
            messages_personalization="x",
            scoring_personalization="x",
            first_analysis_suggestions=[
                FirstAnalysisSuggestion(company_name=f"C{i}", sector="Banque", reason="r") for i in range(5)
            ],
        )


# ---------------------------------------------------------------------------
# #2069.1 — LE PROMPT N'EST PAS UNE GARDE.
#
# Mesuré EN PRODUCTION le 15/09/2026 sur `/welcome` : « BNP Paribas ·
# Stellantis · Airbus · LVMH », cliquables, chacun lançant une analyse — donc
# débitant un crédit sur un compte que rien ne dit pertinent. Le prompt dit
# pourtant « Tu REPRENDS leur nom VERBATIM, tu n'en ajoutes pas ». Une consigne
# obtient une obéissance, jamais une garantie, et « JAMAIS de donnée fictive »
# ne peut pas dépendre de l'obéissance d'un modèle.
#
# Ces tests décrivent la SORTIE du Profiler : un nom que la source n'a pas rendu
# ne sort pas. La liste vide est un résultat juste — l'écran tait alors sa
# section et « Analyser un compte » ouvre la recherche libre (#1921.11).
# ---------------------------------------------------------------------------


def test_un_nom_absent_de_la_source_est_ECARTE_et_le_nom_source_RESTE():
    """SAIT DIRE NON *et* n'attrape pas ce qu'elle ne vise pas, dans le MÊME
    appel : la même liste porte un nom inventé et un nom sourcé. Une garde qui
    ne verrait passer que des noms inventés pourrait être un `return []`."""
    read = was.RealAccountsRead(status="ok", companies=[was.RealAccount(name="Société Générale")])
    kept = was.keep_sourced(
        [
            FirstAnalysisSuggestion(company_name="BNP Paribas", sector="Banque", reason="Grand compte connu."),
            FirstAnalysisSuggestion(company_name="Société Générale", sector="Banque", reason="Pile cloud."),
        ],
        read,
    )
    assert [s.company_name for s in kept] == ["Société Générale"]
    assert kept[0].reason == "Pile cloud.", "le motif du modèle survit — on filtre des NOMS, pas des phrases"
    assert kept[0].sector == "Banque"


def test_le_corpus_du_filtre_nest_pas_vide():
    """LIT QUELQUE CHOSE : une garde qui itère sur une liste vide est verte et
    ne garde rien. On vérifie que la source examinée porte bien des noms et que
    le filtre les a réellement comparés — ici tout passe, rien ne tombe."""
    read = was.RealAccountsRead(
        status="ok",
        companies=[was.RealAccount(name="Société Générale"), was.RealAccount(name="Crédit Agricole")],
    )
    assert len(read.companies) == 2
    kept = was.keep_sourced(
        [
            FirstAnalysisSuggestion(company_name="Crédit Agricole", sector="Banque", reason="r1"),
            FirstAnalysisSuggestion(company_name="Société Générale", sector="Banque", reason="r2"),
        ],
        read,
    )
    assert [s.company_name for s in kept] == ["Crédit Agricole", "Société Générale"]


def test_lorthographe_de_la_SOURCE_gagne_sur_celle_du_modele():
    """Le modèle réécrit « societe generale » : c'est le nom du corpus qui est
    servi. Le clic ouvre `/search?company=<nom>` — une graphie approximative
    lancerait une analyse sur une chaîne que le résolveur ne retrouve pas."""
    read = was.RealAccountsRead(status="ok", companies=[was.RealAccount(name="Société Générale")])
    kept = was.keep_sourced(
        [FirstAnalysisSuggestion(company_name="societe generale", sector="Banque", reason="r")],
        read,
    )
    assert [s.company_name for s in kept] == ["Société Générale"]


@pytest.mark.parametrize("status", ["unavailable", "empty", "no_caller", "not_configured", "no_filter"])
def test_sans_source_lue_aucun_nom_ne_sort(status: str):
    """Les cinq « zéro nom » se valent ICI : sans nom lu, aucun nom ne se
    prouve. ⚠️ `unavailable` compris — ne pas avoir pu LIRE n'autorise pas à
    servir ce que le modèle a écrit de mémoire."""
    kept = was.keep_sourced(
        [FirstAnalysisSuggestion(company_name="Airbus", sector="Aéronautique", reason="r")],
        was.RealAccountsRead(status=status),
    )
    assert kept == []


def test_bout_en_bout_le_profiler_ECARTE_le_nom_que_le_corpus_na_pas_rendu():
    """⚠️ LA GARDE EST-ELLE BRANCHÉE ? Le défaut qui revient dans ce dépôt est
    du code juste que personne n'appelle. Ce test ne touche pas `keep_sourced` :
    il fait tourner l'agent complet et lit le champ que l'écran affiche."""
    bridge = _Bridge({"Data & IA": _ok("Société Générale")})
    envelope, captured = _run_agent(
        bridge,
        suggestions=[
            FirstAnalysisSuggestion(company_name="Société Générale", sector="Banque", reason="Pile cloud."),
            FirstAnalysisSuggestion(company_name="LVMH", sector="Luxe", reason="Grand compte français."),
        ],
    )
    assert "Société Générale" in captured["user"]
    assert envelope.data is not None
    names = [s.company_name for s in envelope.data.welcome_summary.first_analysis_suggestions]
    assert names == ["Société Générale"], "un nom que la mémoire marché n'a pas rendu est sorti du Profiler"
