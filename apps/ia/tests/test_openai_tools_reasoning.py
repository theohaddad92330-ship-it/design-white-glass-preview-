"""Le raisonnement IMPLICITE d'OpenAI, refusé avec nos outils de fonction.

Mesuré en production le 28/08/2026 : les DIX prompts du chemin payant routés vers
``gpt-5.6-luna`` ont échoué, tous sur le même 400 :

    Function tools with reasoning_effort are not supported for gpt-5.6-luna in
    /v1/chat/completions. To use function tools, use /v1/responses or set
    reasoning_effort to 'none'.

⚠️ **CE QUE CE FICHIER FAIT AUTREMENT, ET POURQUOI IL EXISTE.** La passerelle
avait vingt-deux tests verts et n'a jamais réussi un seul appel structuré chez
OpenAI. Tous patchaient ``OPENAI_PROVIDER._invoke`` : ils mesuraient nos
intentions, pas la forme de l'appel. Un test qui se contenterait de relire les
kwargs ne prouverait rien de plus ici.

Alors ici **rien n'est patché du côté qui construit l'appel** : ``instructor`` est
le vrai ``instructor``, ``openai`` est le vrai SDK, et le seul double est le
RÉSEAU — un ``httpx.MockTransport`` qui applique la politique du serveur telle
qu'elle a été mesurée :

* un modèle de RAISONNEMENT applique un effort par défaut côté serveur ; il
  refuse en 400 dès qu'un appel porte des outils et que l'effort effectif n'est
  pas ``none`` ;
* un modèle CLASSIQUE ne connaît pas le paramètre et refuse en 400 s'il arrive.

Les deux moitiés comptent : la première dit que le correctif marche, la seconde
que ``gpt-4o`` et consorts ne sont pas cassés en passant.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
import openai
import pytest
from instructor.exceptions import InstructorRetryException
from pydantic import BaseModel

from app.services import llm_gateway

#: ⚠️ Mesuré, et contraire à ce que suggère la lecture rapide d'``instructor`` :
#: un 400 ne sort PAS en ``openai.BadRequestError`` des chemins outillés. Le
#: ``tenacity`` qu'``instructor`` configure n'a aucun prédicat ``retry=``, donc il
#: rejoue sur toute exception puis emballe la dernière dans
#: ``InstructorRetryException``. Le chemin TEXTE, lui, ne passe pas par
#: ``instructor`` et rend le ``BadRequestError`` brut. D'où ce couple.
_REFUSAL = (openai.BadRequestError, InstructorRetryException)

# ── Le serveur, tel que mesuré ────────────────────────────────────────────────

#: L'effort que l'API applique d'elle-même à un modèle de raisonnement quand
#: l'appelant n'envoie rien. C'est LUI le paramètre fautif : celui qu'on n'envoie
#: pas. La valeur exacte est sans importance — seul compte « ce n'est pas none ».
_SERVER_DEFAULT_EFFORT = "medium"

_REFUSAL_MESSAGE = (
    "Function tools with reasoning_effort are not supported for {model} in "
    "/v1/chat/completions. To use function tools, use /v1/responses or set "
    "reasoning_effort to 'none'."
)
_UNSUPPORTED_MESSAGE = "Unrecognized request argument supplied: reasoning_effort"


def _error_body(message: str, param: str | None) -> dict[str, Any]:
    return {"error": {"message": message, "type": "invalid_request_error", "param": param, "code": None}}


class _Server:
    """Un double du serveur OpenAI. ``seen`` est le corpus que les tests lisent."""

    def __init__(self, *, reasoning_model: bool) -> None:
        self.reasoning_model = reasoning_model
        self.seen: list[dict[str, Any]] = []
        #: Permet de simuler un TOUT AUTRE 400, pour prouver qu'on ne le rattrape pas.
        self.other_failure: str | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.seen.append(body)

        if self.other_failure is not None:
            return httpx.Response(400, json=_error_body(self.other_failure, "messages"))

        has_tools = bool(body.get("tools"))
        if self.reasoning_model:
            effective = body.get("reasoning_effort", _SERVER_DEFAULT_EFFORT)
            if has_tools and effective != "none":
                return httpx.Response(
                    400, json=_error_body(_REFUSAL_MESSAGE.format(model=body["model"]), "reasoning_effort")
                )
        elif "reasoning_effort" in body:
            return httpx.Response(400, json=_error_body(_UNSUPPORTED_MESSAGE, "reasoning_effort"))

        return httpx.Response(200, json=self._ok(body))

    @staticmethod
    def _ok(body: dict[str, Any]) -> dict[str, Any]:
        usage = {
            "prompt_tokens": 120,
            "completion_tokens": 30,
            "total_tokens": 150,
            "prompt_tokens_details": {"cached_tokens": 20},
        }
        if body.get("tools"):
            tool_name = body["tools"][0]["function"]["name"]
            arguments = json.dumps({"data": {"ok": True}} if tool_name == "_DictEnvelope" else {"verdict": "ok"})
            message = {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {"id": "call_1", "type": "function", "function": {"name": tool_name, "arguments": arguments}}
                ],
            }
            finish = "tool_calls"
        else:
            message = {"role": "assistant", "content": "texte libre"}
            finish = "stop"
        return {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 0,
            "model": body["model"],
            "choices": [{"index": 0, "finish_reason": finish, "message": message}],
            "usage": usage,
        }


class _Verdict(BaseModel):
    verdict: str


def _install(monkeypatch: pytest.MonkeyPatch, server: _Server) -> None:
    """Branche le vrai SDK OpenAI sur le faux réseau, sans toucher à instructor."""
    transport = httpx.MockTransport(server.handler)

    def _factory(**kwargs: Any) -> openai.AsyncOpenAI:
        # ``_invoke`` passe ``api_key`` et ``timeout`` ; on ignore le timeout, le
        # transport ne dort jamais. ``max_retries=0`` : le SDK ne rejoue pas un
        # 400, mais on l'écrit pour que le décompte des requêtes vues soit un fait
        # du test et non une propriété qu'on suppose au SDK.
        return openai.AsyncOpenAI(
            api_key=kwargs.get("api_key", "sk-test"),
            max_retries=0,
            http_client=httpx.AsyncClient(transport=transport),
        )

    fake_module = type("_FakeOpenAIModule", (), {"AsyncOpenAI": staticmethod(_factory)})
    monkeypatch.setattr(llm_gateway, "openai", fake_module)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch: pytest.MonkeyPatch):
    """Le jeu de modèles appris est un cache de PROCESSUS : sans remise à zéro, un
    test en apprendrait un autre et on ne mesurerait plus rien."""
    monkeypatch.delenv(llm_gateway._OPENAI_TOOLS_REASONING_ENV, raising=False)
    original = set(llm_gateway._openai_tools_reasoning_conflict)
    yield
    llm_gateway._openai_tools_reasoning_conflict.clear()
    llm_gateway._openai_tools_reasoning_conflict.update(original)


async def _structured(model: str, response_model: Any = _Verdict) -> Any:
    return await llm_gateway.OPENAI_PROVIDER._invoke(
        "sys", "usr", response_model=response_model, max_tokens=512, max_retries=1, model=model
    )


# ── 1. D'où vient le paramètre — la preuve, en test ───────────────────────────


class TestOriginOfReasoningEffort:
    """Ni nous, ni ``instructor==1.7.9``, ni ``openai==1.109.1`` ne le posent.

    Le SDK le déclare ``reasoning_effort: Optional[ReasoningEffort] | Omit = omit``
    (``openai/resources/chat/completions/completions.py:105``) et un ``omit`` est
    retiré du corps. Ce test le montre sur le FIL plutôt que sur parole.
    """

    @pytest.mark.asyncio
    async def test_un_appel_structure_ne_pose_pas_reasoning_effort(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        server = _Server(reasoning_model=False)
        _install(monkeypatch, server)

        await _structured("gpt-4o")

        assert server.seen, "le double n'a rien vu — la garde ne lit rien"
        body = server.seen[0]
        assert "reasoning_effort" not in body
        assert set(body) == {"model", "messages", "tools", "tool_choice", "max_completion_tokens", "temperature"}
        # …et c'est bien un appel OUTILLÉ : c'est cette combinaison que l'API refuse.
        assert body["tools"] and body["tool_choice"]


# ── 2. Le défaut mesuré, reproduit — puis corrigé ─────────────────────────────


class TestTheProductionFailure:
    @pytest.mark.asyncio
    async def test_sans_le_contournement_le_400_de_production_revient(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """L'interrupteur ``off`` rend le défaut à l'identique.

        C'est la preuve que le double dit NON : s'il acceptait tout, le reste du
        fichier ne mesurerait rien.
        """
        monkeypatch.setenv(llm_gateway._OPENAI_TOOLS_REASONING_ENV, "off")
        server = _Server(reasoning_model=True)
        _install(monkeypatch, server)

        with pytest.raises(_REFUSAL) as err:
            await _structured("gpt-5.6-luna")

        assert "reasoning_effort" in str(err.value)
        assert len(server.seen) == 1, "contournement coupé ⇒ aucune reprise"

    @pytest.mark.asyncio
    async def test_le_chemin_structure_aboutit_sur_un_modele_de_raisonnement(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        server = _Server(reasoning_model=True)
        _install(monkeypatch, server)

        result, usage = await _structured("gpt-5.6-luna")

        assert isinstance(result, _Verdict) and result.verdict == "ok"
        assert usage == llm_gateway._ProviderUsage(100, 30, 20)
        assert server.seen[-1]["reasoning_effort"] == "none"

    @pytest.mark.asyncio
    async def test_le_chemin_dict_aboutit_aussi(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Le défaut était présent sur les DEUX branches outillées.

        Une correction sur une seule laisserait ``bellum_facts`` et tous les
        prompts à enveloppe ``dict`` en 400 — c'est le motif « le correctif fait
        sur UN chemin ».
        """
        server = _Server(reasoning_model=True)
        _install(monkeypatch, server)

        result, _usage = await _structured("gpt-5.6-luna", response_model=dict)

        assert result == {"ok": True}
        assert server.seen[-1]["reasoning_effort"] == "none"


# ── 3. C'est l'API qui décide, pas une liste de préfixes ──────────────────────


class TestLearnedFromTheApiRefusal:
    @pytest.mark.asyncio
    async def test_un_modele_inconnu_apprend_au_premier_refus(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Le premier appel part nu, se fait refuser, et rejoue réglé. Le second
        part déjà réglé : on ne paie l'aller-retour qu'une fois par processus."""
        server = _Server(reasoning_model=True)
        _install(monkeypatch, server)
        assert not any(
            k in "gpt-9-brand-new" for k in llm_gateway._openai_tools_reasoning_conflict
        ), "le modèle doit être INCONNU au départ, sinon le test ne mesure pas l'apprentissage"

        with caplog.at_level(logging.WARNING, logger="app.services.llm_gateway"):
            result, _ = await _structured("gpt-9-brand-new")

        assert isinstance(result, _Verdict)
        assert len(server.seen) == 2, "un refus, puis une reprise"
        assert "reasoning_effort" not in server.seen[0]
        assert server.seen[1]["reasoning_effort"] == "none"
        assert any(
            "NE RAISONNE PLUS" in r.getMessage() for r in caplog.records
        ), "une perte de qualité ne doit jamais être silencieuse"

        await _structured("gpt-9-brand-new")
        assert len(server.seen) == 3, "le modèle est appris : plus de refus à payer"
        assert server.seen[2]["reasoning_effort"] == "none"

    @pytest.mark.asyncio
    async def test_le_modele_mesure_est_regle_des_le_premier_appel(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """``gpt-5.6-luna`` est le cache préchauffé avec la mesure du 28/08/2026."""
        server = _Server(reasoning_model=True)
        _install(monkeypatch, server)

        await _structured("gpt-5.6-luna")

        assert len(server.seen) == 1, "le modèle mesuré ne paie aucun aller-retour refusé"

    @pytest.mark.asyncio
    async def test_un_autre_400_remonte_intact_et_sans_reprise(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Un contournement qui rattraperait n'importe quelle erreur masquerait le
        prochain défaut au lieu de le montrer."""
        server = _Server(reasoning_model=True)
        server.other_failure = "Invalid value for 'messages[0].role'"
        _install(monkeypatch, server)

        with pytest.raises(_REFUSAL) as err:
            await _structured("gpt-9-also-brand-new")

        assert "messages[0].role" in str(err.value)
        assert len(server.seen) == 1, "pas de reprise sur un refus qui n'est pas le nôtre"
        assert "gpt-9-also-brand-new" not in llm_gateway._openai_tools_reasoning_conflict

    @pytest.mark.asyncio
    async def test_le_refus_arrive_emballe_par_instructor_et_deja_rejoue(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Ce que coûte l'apprentissage — mesuré, pas supposé.

        ⚠️ Le ``except`` d'``instructor/retry.py`` ne nomme que
        ``ValidationError``/``JSONDecodeError``, ce qui laisse croire qu'un 400
        remonte intact et sans reprise. C'est faux : son
        ``AsyncRetrying(stop=stop_after_attempt(max_retries))`` n'a aucun prédicat
        ``retry=``, donc il rejoue sur TOUTE exception, puis emballe la dernière
        dans ``InstructorRetryException`` — sans ``status_code``. Attraper
        ``openai.BadRequestError`` n'aurait rien attrapé du tout.

        Conséquence chiffrée : le premier appel d'un modèle inconnu paie N refus
        avant la reprise réglée, soit N+1 requêtes — une fois par modèle et par
        processus ; les 400 ne sont pas facturés, mais ils pèsent sur la latence
        mesurée autour de ``_invoke``.

        ⚠️ N dépend de la version d'instructor et N'EST PAS le sujet de ce test :
        avec 1.13 et ``max_retries=3``, mesuré 3 refus (4 requêtes) ; avec 1.17,
        mesuré 1 refus (2 requêtes). Ce qui est gardé ici, et qui ne doit jamais
        changer : la reprise a lieu, elle est la DERNIÈRE requête, elle seule
        porte ``reasoning_effort='none'``, et aucune tentative antérieure ne le
        porte. Figer le nombre d'appels transformerait un bump de dépendance en
        faux rouge, et le remplacer par le nouveau chiffre ne garderait rien.
        """
        server = _Server(reasoning_model=True)
        _install(monkeypatch, server)

        result, _ = await llm_gateway.OPENAI_PROVIDER._invoke(
            "sys", "usr", response_model=_Verdict, max_tokens=64, max_retries=3, model="gpt-9-yet-another"
        )

        assert isinstance(result, _Verdict)
        assert len(server.seen) >= 2, "au moins un refus emballé par instructor, puis la reprise réglée"
        assert all("reasoning_effort" not in body for body in server.seen[:-1])
        assert server.seen[-1]["reasoning_effort"] == "none"


# ── 4. Ne rien casser pour les modèles qui marchaient ─────────────────────────


class TestUntouchedModels:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("model", ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3", "o3-mini", "o4-mini"])
    async def test_aucun_modele_de_la_table_ne_recoit_reasoning_effort(
        self, model: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Le serveur ici REFUSE le paramètre : si on l'envoyait, le test rougirait.

        C'est la moitié « ne casse rien » de la garde, et elle est structurelle —
        rien n'est envoyé tant que l'API n'a pas dit qu'elle le voulait.
        """
        server = _Server(reasoning_model=False)
        _install(monkeypatch, server)

        result, _ = await _structured(model)

        assert isinstance(result, _Verdict)
        assert len(server.seen) == 1
        assert "reasoning_effort" not in server.seen[0]

    @pytest.mark.asyncio
    async def test_le_chemin_texte_garde_son_raisonnement(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Sans outils, pas de refus — donc pas de raison d'éteindre le raisonnement.

        C'est ce qui borne la perte de qualité aux seules sorties structurées.
        """
        server = _Server(reasoning_model=True)
        _install(monkeypatch, server)

        text, usage = await llm_gateway.OPENAI_PROVIDER._invoke(
            "sys", "usr", response_model=None, max_tokens=64, max_retries=1, model="gpt-5.6-luna"
        )

        assert text == "texte libre"
        assert usage.input_tokens == 100
        assert server.seen, "le double n'a rien vu — la garde ne lit rien"
        assert "reasoning_effort" not in server.seen[0]
        assert "tools" not in server.seen[0]


# ── 5. L'interrupteur, et la frontière entre ses deux mots ────────────────────


class TestTheSwitch:
    def test_le_defaut_est_nomme(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv(llm_gateway._OPENAI_TOOLS_REASONING_ENV, raising=False)
        assert llm_gateway._openai_tools_reasoning_effort() == "none"

    @pytest.mark.parametrize("raw", ["off", "OFF", "  off  ", "", "   "])
    def test_off_et_le_vide_coupent_le_contournement(
        self, raw: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv(llm_gateway._OPENAI_TOOLS_REASONING_ENV, raw)
        assert llm_gateway._openai_tools_reasoning_effort() is None
        assert llm_gateway._openai_tools_reasoning_kwargs("gpt-5.6-luna") == {}

    @pytest.mark.asyncio
    async def test_la_valeur_envoyee_est_pilotable(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Le jour où un modèle acceptera ``minimal`` avec des outils, on récupère
        du raisonnement sans redéploiement."""
        monkeypatch.setenv(llm_gateway._OPENAI_TOOLS_REASONING_ENV, "minimal")
        server = _Server(reasoning_model=True)
        # Ce serveur-ci n'accepte que ``none`` ; on ne mesure donc que ce qui part.
        _install(monkeypatch, server)

        with pytest.raises(_REFUSAL):
            await _structured("gpt-5.6-luna")

        assert server.seen[0]["reasoning_effort"] == "minimal"

    def test_seul_un_refus_qui_nomme_les_deux_choses_est_le_notre(self) -> None:
        def _exc(message: str, status: int = 400) -> Exception:
            err = Exception(message)
            err.status_code = status  # type: ignore[attr-defined]
            return err

        assert llm_gateway._is_tools_reasoning_refusal(_exc(_REFUSAL_MESSAGE.format(model="x")))
        assert not llm_gateway._is_tools_reasoning_refusal(_exc(_UNSUPPORTED_MESSAGE))
        assert not llm_gateway._is_tools_reasoning_refusal(_exc("tool call failed"))
        assert not llm_gateway._is_tools_reasoning_refusal(
            _exc(_REFUSAL_MESSAGE.format(model="x"), status=500)
        )


# ── 6. La garde LIT, et elle sait dire NON ───────────────────────────────────


class TestTheGuardReadsSomething:
    """Une garde borgne passe au vert. Ces deux tests-ci vérifient le corpus.

    « Elle sait dire NON » se prouve à la main, pas ici : réintroduire le défaut
    (retirer ``**reasoning`` des deux branches outillées de ``_invoke``) fait
    rougir ``TestTheProductionFailure`` et ``TestLearnedFromTheApiRefusal``.
    Restauré à l'identique après la mesure.
    """

    def test_le_jeu_seme_nest_pas_vide_et_porte_la_mesure(self) -> None:
        assert "gpt-5.6-luna" in llm_gateway._openai_tools_reasoning_conflict

    @pytest.mark.asyncio
    async def test_le_double_est_reellement_sollicite(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Sans cette vérification, un ``_invoke`` qui n'appellerait plus rien du
        tout laisserait passer toutes les assertions « pas de reasoning_effort »."""
        server = _Server(reasoning_model=False)
        _install(monkeypatch, server)

        await _structured("gpt-4o")

        assert len(server.seen) == 1
        assert server.seen[0]["model"] == "gpt-4o"
        assert server.seen[0]["messages"][1]["content"] == "usr"

    def test_les_deux_branches_outillees_passent_par_la_porte(self) -> None:
        """Le défaut d'origine venait de deux branches recopiées. Une correction
        sur une seule laisserait l'autre en 400 — et le chemin texte, lui, ne doit
        PAS y passer, sinon il perdrait son raisonnement pour rien."""
        import inspect

        source = inspect.getsource(llm_gateway.OpenAIProvider._invoke)
        assert source.count("await _send_with_tools(model,") == 2
        assert source.count("**reasoning,") == 2
