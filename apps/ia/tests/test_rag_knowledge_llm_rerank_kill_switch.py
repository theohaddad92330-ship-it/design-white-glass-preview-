"""GA-304 — un interrupteur d'arrêt pour le reclassement LLM du RAG-knowledge.

LE CONSTAT (lot 8, cout-total) : ``_llm_rerank_enabled()`` rendait ``True`` en
dur (``app/services/rag_knowledge.py``). La cascade de ``rerank()`` — appelée à
CHAQUE tour de chat (``routers/chat.py:128``) et dans chaque phase d'analyse
(``phase1_research.py``, ``phase4_plan.py``) — tombait donc systématiquement
sur ``_llm_rerank``, un appel Claude Haiku (``prompt_name="rag_knowledge_rerank"``,
jusqu'à 12 candidats, ``max_tokens=200``), sans qu'aucun opérateur ne puisse
l'éteindre. Et ``CHAT_TOOLS_DISABLED`` ne le protège pas : ce bloc de contexte
RAG est construit AVANT l'orchestrateur d'outils, pas à travers lui — un
opérateur qui coupe les outils du copilote pendant un incident continue de
payer cet appel.

Un repli déterministe GRATUIT existe déjà (``_deterministic_rerank`` : fraîcheur
+ recouvrement lexical) — c'est lui que la cascade rejoint quand ce fichier
pose ``RAG_LLM_RERANK_DISABLED=true``.

Ce fichier prouve, dans l'ordre que la garde exige :
  1. ``TestSansVariableCheminInchange`` — SANS la variable, le chemin est
     BYTE-IDENTIQUE à avant qu'elle existe (un appel modèle, le même ordre).
  2. ``TestAvecVariablePoseeCheminDeterministeGratuit`` — AVEC la variable
     posée à une valeur truthy, ZÉRO appel modèle, la cascade rejoint le repli
     déterministe.
  3. ``TestNeCoupeQueCeChemin`` — la garde n'attrape rien d'autre : ni le
     flywheel entier (``is_enabled``), ni le cross-encoder (qui garde la
     priorité), ni le repli déterministe lui-même.

La preuve que la garde SAIT DIRE NON est jouée à la main (pas encodée en test
permanent, qui ne serait qu'un second ``_llm_rerank_enabled`` à maintenir) :
retirer la lecture de l'interrupteur dans ``_llm_rerank_enabled()`` fait
tomber en rouge ``test_linterrupteur_pose_ne_declenche_aucun_appel_modele`` —
voir le rapport du lot pour la sortie brute.
"""

from __future__ import annotations

from app.services import kill_switch, rag_knowledge
from app.services.rag_knowledge import _deterministic_rerank


def _docs() -> list[dict]:
    """Deux documents RÉELS, de contenu distinct — jamais une liste vide.

    ``rerank()`` court-circuite la cascade entière quand ``len(docs) <= 1`` :
    un compte de zéro appel y serait vrai pour la MAUVAISE raison, et c'est le
    défaut n°1 des gardes de ce dépôt (une garde qui ne lit rien). Le contenu
    des deux documents diffère assez pour qu'un tri LLM (``order=[1, 0]``) et
    le tri déterministe produisent des ordres qu'on peut distinguer sans
    ambiguïté.
    """
    return [
        {
            "id": "vieux",
            "title": "Support client",
            "content": "process de support et ticketing",
            "created_at": "2020-01-01T00:00:00Z",
        },
        {
            "id": "recent",
            "title": "Migration cloud AWS",
            "content": "migration cloud AWS Kubernetes",
            "created_at": "2026-09-01T00:00:00Z",
        },
    ]


def _spy_call_claude(monkeypatch, *, order: list[int]) -> list[str]:
    """Remplace l'appel modèle par un compteur — jamais de réseau en test.

    ``_llm_rerank`` importe ``call_claude`` EN LOCAL (``from
    app.services.claude_service import ... call_claude`` dans le corps de la
    fonction) : patcher l'attribut du module, lu à chaque appel, suffit.
    """
    calls: list[str] = []

    async def _fake(
        system_prompt,
        user_prompt,
        *,
        response_model=None,
        max_tokens=200,
        max_retries=2,
        model=None,
        metadata=None,
        prompt_name="unknown",
        correlation_id="",
        task=None,
        cache_system=True,
    ):
        calls.append(prompt_name)
        return {"order": order}, None

    monkeypatch.setattr("app.services.claude_service.call_claude", _fake)
    return calls


class TestSansVariableCheminInchange:
    """1 — sans ``RAG_LLM_RERANK_DISABLED``, rien ne change."""

    async def test_le_reclassement_llm_est_appele_une_fois(self, monkeypatch):
        monkeypatch.delenv("RAG_LLM_RERANK_DISABLED", raising=False)
        monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
        calls = _spy_call_claude(monkeypatch, order=[1, 0])

        ranked = await rag_knowledge.rerank("migration cloud", _docs())

        # Un compte : le bon prompt, une seule fois.
        assert calls == ["rag_knowledge_rerank"]
        # L'ordre LLM (inversé), pas celui du repli déterministe : la preuve
        # que ce test emprunte bien la porte LLM, pas un no-op accidentel.
        assert [d["id"] for d in ranked] == ["recent", "vieux"]

    async def test_byte_identique_a_avant_que_linterrupteur_existe(self, monkeypatch):
        """Le no-op strict : reconstruire à la main le comportement d'AVANT ce
        lot (``_llm_rerank_enabled`` rendait ``True`` en dur, donc la cascade
        appelait toujours ``_llm_rerank`` puis ``apply_recency_decay``) et
        vérifier que ``rerank()`` avec la variable absente rend EXACTEMENT le
        même résultat, avec le même nombre d'appels."""
        monkeypatch.delenv("RAG_LLM_RERANK_DISABLED", raising=False)
        monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
        docs = _docs()

        calls_via_cascade = _spy_call_claude(monkeypatch, order=[1, 0])
        via_cascade = await rag_knowledge.rerank("migration cloud", docs)

        calls_direct = _spy_call_claude(monkeypatch, order=[1, 0])
        llm_direct = await rag_knowledge._llm_rerank("migration cloud", docs)
        ancien_comportement = rag_knowledge.apply_recency_decay(llm_direct)

        assert len(calls_via_cascade) == len(calls_direct) == 1
        assert [d["id"] for d in via_cascade] == [d["id"] for d in ancien_comportement]


class TestAvecVariablePoseeCheminDeterministeGratuit:
    """2 — ``RAG_LLM_RERANK_DISABLED`` posé ⇒ zéro appel, repli déterministe."""

    async def test_linterrupteur_pose_ne_declenche_aucun_appel_modele(self, monkeypatch):
        monkeypatch.setenv("RAG_LLM_RERANK_DISABLED", "true")
        monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
        calls = _spy_call_claude(monkeypatch, order=[1, 0])
        docs = _docs()

        ranked = await rag_knowledge.rerank("migration cloud", docs)

        assert calls == []  # ZÉRO appel modèle
        attendu = _deterministic_rerank("migration cloud", docs, None)
        assert [d["id"] for d in ranked] == [d["id"] for d in attendu]

    async def test_valeurs_truthy_variees_coupent_toutes(self, monkeypatch):
        # La même table `_TRUTHY` que le reste du registre (`disabled()`) —
        # pas une redéfinition locale du vocabulaire truthy.
        for value in ("1", "true", "TRUE", "yes", "on"):
            monkeypatch.setenv("RAG_LLM_RERANK_DISABLED", value)
            monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
            calls = _spy_call_claude(monkeypatch, order=[1, 0])

            await rag_knowledge.rerank("migration cloud", _docs())

            assert calls == [], f"valeur {value!r} aurait dû couper l'appel modèle"

    async def test_valeurs_non_truthy_ne_coupent_pas(self, monkeypatch):
        # Témoin négatif : une valeur posée mais pas truthy laisse l'axe actif
        # — ``false``/``0``/n'importe quoi d'autre, comme les huit autres axes.
        for value in ("", "false", "0", "off", "banana"):
            monkeypatch.setenv("RAG_LLM_RERANK_DISABLED", value)
            monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
            calls = _spy_call_claude(monkeypatch, order=[1, 0])

            await rag_knowledge.rerank("migration cloud", _docs())

            assert calls == ["rag_knowledge_rerank"], f"valeur {value!r} n'aurait pas dû couper"


class TestNeCoupeQueCeChemin:
    """3 — la garde n'attrape rien qu'elle ne vise pas."""

    async def test_le_cross_encoder_garde_la_priorite_meme_interrupteur_pose(self, monkeypatch):
        """Le cross-encoder est essayé AVANT ce contrôle dans la cascade :
        l'interrupteur du LLM ne doit ni l'empêcher, ni être consulté quand le
        cross-encoder a déjà répondu."""
        monkeypatch.setenv("RAG_LLM_RERANK_DISABLED", "true")
        docs = _docs()
        ce_result = list(reversed(docs))
        monkeypatch.setattr(rag_knowledge, "_cross_encoder_rerank", lambda q, d: ce_result)
        calls = _spy_call_claude(monkeypatch, order=[1, 0])

        ranked = await rag_knowledge.rerank("migration cloud", docs)

        assert calls == []  # le CE a répondu ; le LLM n'était de toute façon pas dans le chemin
        attendu = rag_knowledge.apply_recency_decay(ce_result)
        assert [d["id"] for d in ranked] == [d["id"] for d in attendu]

    def test_le_flywheel_entier_reste_actif_interrupteur_pose(self, monkeypatch):
        """``is_enabled()`` (le flywheel RAG-knowledge tout entier) est un axe
        DIFFÉRENT : couper le reclassement LLM ne doit pas couper la
        récupération elle-même."""
        monkeypatch.setenv("RAG_LLM_RERANK_DISABLED", "true")
        assert rag_knowledge.is_enabled() is True

    def test_le_repli_deterministe_ne_lit_pas_linterrupteur(self, monkeypatch):
        """Le repli gratuit ne connaît pas l'interrupteur : il produit le même
        classement, variable posée ou non."""
        docs = _docs()
        monkeypatch.setenv("RAG_LLM_RERANK_DISABLED", "true")
        avec = _deterministic_rerank("migration cloud", docs, None)
        monkeypatch.delenv("RAG_LLM_RERANK_DISABLED", raising=False)
        sans = _deterministic_rerank("migration cloud", docs, None)
        assert [d["id"] for d in avec] == [d["id"] for d in sans]


class TestRegistreKillSwitch:
    """Le nom vit dans ``kill_switch.py`` — nulle part ailleurs (rien d'autre
    ne lit ces variables, CLAUDE.md)."""

    def test_la_constante_est_declaree_dans_le_registre(self):
        assert kill_switch.RAG_LLM_RERANK_ENV_VAR == "RAG_LLM_RERANK_DISABLED"

    def test_disabled_lit_bien_cette_constante(self, monkeypatch):
        monkeypatch.delenv(kill_switch.RAG_LLM_RERANK_ENV_VAR, raising=False)
        assert kill_switch.disabled(kill_switch.RAG_LLM_RERANK_ENV_VAR) is False
        monkeypatch.setenv(kill_switch.RAG_LLM_RERANK_ENV_VAR, "true")
        assert kill_switch.disabled(kill_switch.RAG_LLM_RERANK_ENV_VAR) is True


class TestSurfaceOperateurLot13:
    """LOT 13 (D169, GA-315/GA-316) — l'interrupteur existe et fonctionne
    depuis GA-304 (classe ``TestRegistreKillSwitch`` ci-dessus), mais restait
    HORS de ``CAPABILITY_KILL_SWITCHES`` : aucune surface opérateur
    (``GET internal/telemetry/kill-switches``, panneau « Capacités coupées »).

    Posé pendant un incident, ``RAG_LLM_RERANK_DISABLED=true`` ne se voyait
    nulle part — exactement le défaut que D169 nomme. Ce test prouve que la
    capacité est désormais au registre PARTAGÉ (celui que
    ``capability_states()`` sert, et sur lequel l'API joint son propre
    registre TypeScript — ``GA-84``/``GA-85`` gardent la parité et
    l'invariant « aucune variable ne traverse la route »)."""

    def test_la_capacite_est_au_registre_partage(self) -> None:
        assert kill_switch.CAPABILITY_KILL_SWITCHES.get("rag.llm_rerank") == kill_switch.RAG_LLM_RERANK_ENV_VAR

    def test_capability_states_la_rapporte_coupee_ou_non(self, monkeypatch) -> None:
        monkeypatch.delenv(kill_switch.RAG_LLM_RERANK_ENV_VAR, raising=False)
        assert kill_switch.capability_states()["rag.llm_rerank"] is False

        monkeypatch.setenv(kill_switch.RAG_LLM_RERANK_ENV_VAR, "true")
        assert kill_switch.capability_states()["rag.llm_rerank"] is True
