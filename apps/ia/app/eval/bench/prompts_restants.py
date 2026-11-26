"""Le banc des quatre prompts RESTÉS sur Sonnet — et ce qu'il contourne.

Le trou que ce module comble
----------------------------
``bellum_rfp_analyse``, ``bellum_rfp_draft``, ``bellum_scorer`` et
``bellum_linkedin_posts`` n'ont **jamais été mesurés**. Ils portent depuis le
29/08/2026 un barème déterministe (``app/eval/bench/rubrics/rfp_analyse.py`` &
co.), et ces barèmes n'avaient aucun corpus à noter : ``run.py record`` pilote
``run_analysis_graph``, et le graphe d'analyse n'appelle ni ``/rfp/analyse``, ni
``/rfp/draft``, ni ``/scorer/recalculate``, ni ``/content/post-ideas``. Ce sont
quatre routes déclenchées par un geste d'utilisateur, bien après l'analyse — et
``/scorer/recalculate`` n'a même **aucun appelant** aujourd'hui (le commentaire
du routeur le dit lui-même, ``app/routers/scorer.py:84``).

Un barème qui n'a jamais vu une sortie réelle n'est pas un barème : c'est une
intention.

Contournement n°1 — le ROUTEUR et la BASE
------------------------------------------
``/scorer/recalculate`` lit Supabase (le compte, son ``raw_analysis``, le profil
de l'ESN) ; ``/rfp/analyse`` décode un fichier. Passer par ces routes
supposerait un espace, un compte analysé et un document déposé — donc mesurer,
en plus du modèle, la fraîcheur d'une base. Ce module appelle donc
``build_system_prompt()`` / ``build_user_prompt()`` **en direct**, avec une
matière relue du corpus déjà enregistré et du jeu de démonstration du dépôt.

Contournement n°2 — la PASSERELLE, et c'est le plus important
--------------------------------------------------------------
``llm_gateway.complete`` ne peut pas servir d'instrument, pour deux raisons
mesurées les 28-29/08/2026 :

* côté Anthropic, le chemin ``instructor`` a rendu un objet **entièrement vide**
  sur Sonnet, là où un appel d'outil direct rendait la sortie complète. La trace
  en est dans le magasin : la capture ``recorded`` de ``bellum_strategy`` fait
  273 caractères, tous champs vides ;
* côté OpenAI, la passerelle joint ``reasoning_effort='none'`` aux appels
  outillés (``llm_gateway._openai_tools_reasoning_kwargs``, contournement du 400
  mesuré le 28/08). Mesurer un modèle de raisonnement avec le raisonnement
  ÉTEINT ne mesure pas le modèle.

Ce module parle donc aux deux fournisseurs **en direct**, par un appel d'outil,
et ``--effort`` EXPOSE la seconde condition au lieu de la subir.

Ce que ce banc reprend de la production, et ce qu'il ne reprend pas
-------------------------------------------------------------------
Repris : les prompts (system + user, construits par les modules du dépôt), les
``response_model`` de production — et il y en a **deux formes ici**, là où les
quatre prompts de livrable n'en avaient qu'une :

* ``bellum_rfp_analyse`` et ``bellum_rfp_draft`` partent en
  ``response_model=dict`` (``app/routers/rfp.py:104,137``) : schéma d'outil =
  l'enveloppe ``{"data": {...}}`` de ``claude_service._call_dict``, et
  l'instruction d'enveloppe est jointe au system ;
* ``bellum_scorer`` et ``bellum_linkedin_posts`` partent sur un modèle Pydantic
  STRICT (``ScoringOutput``, ``LinkedInPostsOutput``) : schéma d'outil =
  ``model_json_schema()``, et la sortie est VALIDÉE puis ``model_dump``ée —
  exactement ce que l'enregistreur du banc écrit (``recorder._serialisable``).

Sont repris aussi : les deux tables de tarifs (``_compute_cost`` et
``_openai_compute_cost`` — un prix vit à un seul endroit), le magasin JSONL et
son identité d'entrée (``compute_record_id``), et les barèmes (``rubric_for``).

PAS repris, et nommé plutôt que tu :

1. **La reprise sur erreur de schéma d'``instructor``.** Un appel direct ne
   rejoue pas une sortie mal formée. Une sortie illisible est comptée
   ``schema_error`` là où la production aurait retenté ``max_retries`` fois.
   C'est plus SÉVÈRE que la production, également des deux côtés.
2. **Le plafond de jetons.** Le champ ``max_tokens`` du magasin porte le plafond
   de PRODUCTION (8000 / 2000 / 2000 / 1500 selon la route) — c'est lui qui
   définit l'identité de l'entrée. Les tirages partent, eux, à
   :data:`BENCH_MAX_TOKENS`, identique chez les deux fournisseurs, pour qu'une
   troncature ne soit jamais prise pour un défaut de modèle. ⚠️ Chez OpenAI ce
   plafond couvre AUSSI les jetons de raisonnement, que le plafond Anthropic ne
   compte pas : l'asymétrie est réelle, elle est dans ce sens-là, et elle
   grandit avec ``--effort``.
3. **La boucle de doublement sur troncature** de ``_call_dict``. Un tirage
   tronqué est rendu tel quel, et le rapport le NOMME.
4. **Le ``cache_control`` sur le system prompt** (``claude_service._cached_system``).
   Le coût Anthropic mesuré ici est donc un PLAFOND par rapport à la production —
   dans l'autre sens que le cache automatique d'OpenAI, qui fait du coût Luna un
   PLANCHER. Les deux biais sont nommés, aucun n'est corrigé en silence.

La matière
----------
Elle vient de deux sources, toutes deux déjà dans le dépôt, aucune inventée ici :

* le **dossier du corpus** — les sorties RÉELLES et payées de ``bellum_facts``,
  ``bellum_signals`` et ``bellum_strategy`` (la plus riche capture ``recorded``
  de chacun). Elles nourrissent ``bellum_scorer`` (qui reçoit ``raw_analysis``)
  et le bloc « signaux » de ``bellum_linkedin_posts`` ;
* le **jeu de démonstration du dépôt** — l'ESN « Bellum Conseil »
  (``apps/api/src/modules/demo/demo-dataset.ts``) et l'appel d'offres scripté de
  ``apps/api/src/modules/demo/demo-scripts.ts`` (``demoRfpAnalysis``). Cette ESN
  et ce donneur d'ordre sont FICTIFS, et le dépôt l'assume déjà là-bas : les
  sociétés analysées sont réelles, l'ESN qui les prospecte ne l'est pas. Le
  dépôt ne porte AUCUN appel d'offres réel, et en fabriquer un ferait entrer une
  donnée inventée dans un corpus de mesure.

⚠️ **Sans corpus, ce module ne s'arrête pas : il dit ce qu'il ne peut pas
faire.** ``evals-out/model-bench.jsonl`` est gitignoré (``.gitignore:172``) et
n'existe que sur la machine qui a payé une capture. Les trois cas d'appel
d'offres et de publication se construisent SANS lui (leur matière est celle du
jeu de démonstration) ; ``bellum_scorer``, lui, ne le peut pas — son entrée EST
un ``raw_analysis``. Il est alors SAUTÉ, avec sa raison écrite, jamais remplacé
par un dossier fabriqué.

⚠️ **Constantes en double, à fusionner à l'intégration.** :data:`ESN_PROFILE`
est le même objet que celui de ``app/eval/bench/livrables.py`` (branche
parallèle du 29/08) : les deux modules ont été écrits en même temps, dans deux
copies de travail, et aucun ne pouvait importer l'autre. Deux copies divergent —
l'intégrateur doit en garder UNE.

Usage
-----
::

    # sans réseau : montre les entrées, leur taille, ce qui manque
    python -m app.eval.bench.prompts_restants --store <chemin> --dry-run

    # PAYANT — 3 tirages par modèle et par cas, deux modèles
    railway run --service bellum-ia-service --environment production -- \\
      .venv/bin/python -m app.eval.bench.prompts_restants --store <chemin> \\
      --draws 3 --effort none --yes-run-live
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from app.eval.bench.corpus import (
    ARM_RECORDED,
    STATUS_ERROR,
    STATUS_OK,
    STATUS_SCHEMA_ERROR,
    STATUS_TRUNCATED,
    CallRecord,
    append_call,
    compute_record_id,
    describe_response_model,
    load_calls,
)
from app.eval.bench.livrables import ESN_PROFILE as _ESN_PROFILE_LIVRABLES
from app.eval.bench.rubrics import RubricResult, rubric_for
from app.models.outputs.linkedin_posts import LinkedInPostsOutput
from app.models.outputs.scorer import ScoringOutput
from app.prompts import bellum_linkedin_posts, bellum_rfp, bellum_scorer
from app.services import claude_service

#: Le plafond des tirages du banc — le MÊME des deux côtés, et volontairement
#: au-dessus de TOUS les plafonds de production (le plus haut est 8000, pour
#: ``bellum_rfp_analyse``), pour qu'une troncature ne puisse pas être lue comme
#: un défaut de modèle.
BENCH_MAX_TOKENS = 12000

_TOOL_NAME = "bellum_output"
_TOOL_DESCRIPTION = "Rends la réponse JSON demandée, entière, dans le champ `data`."
#: Le schéma de l'enveloppe ``response_model=dict`` — la forme de
#: ``claude_service._call_dict`` (un modèle pydantic à un seul champ ``data``).
_ENVELOPE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"data": {"type": "object", "description": "La réponse JSON demandée."}},
    "required": ["data"],
}

ARM_SONNET = "sonnet-restants"
ARM_LUNA = "luna-restants"

SONNET_MODEL = claude_service.CLAUDE_MODEL
LUNA_MODEL = "gpt-5.6-luna"

CORPUS_LABEL = "prompts-restants"

#: Les efforts de raisonnement exposés par ``--effort``.
#: ⚠️ La PRODUCTION vaut ``none`` : ``llm_gateway._openai_tools_reasoning_kwargs``
#: joint ``reasoning_effort='none'`` dès qu'il y a des outils, et les quatre
#: prompts en ont (``instructor`` les utilise pour toute sortie structurée).
EFFORTS: tuple[str, ...] = ("none", "low", "medium", "high")
DEFAULT_EFFORT = "medium"
PRODUCTION_EFFORT = "none"

#: ⚠️ **UNE seule définition** — celle de `livrables.py`, qui a atterri en
#: premier et sur laquelle une campagne est DÉJÀ enregistrée. La recopier ici la
#: ferait diverger en silence (GA-26 : un réglage vit à un seul endroit), et la
#: première version de ce module l'avait bien recopiée — avec une clé de plus.
#:
#: `geoZone` est ajoutée NOMMÉMENT. L'ajouter à la définition de base changerait
#: l'entrée d'une campagne déjà mesurée, donc la comparaison qu'elle porte.
ESN_PROFILE: dict[str, Any] = {**_ESN_PROFILE_LIVRABLES, "geoZone": "Île-de-France"}

#: L'appel d'offres du banc — recopié de l'analyse SCRIPTÉE de la salle de
#: démonstration (``apps/api/src/modules/demo/demo-scripts.ts``,
#: ``demoRfpAnalysis``) : ses cinq exigences, ses deux lots, ses cinq sections et
#: son échéance sont ceux du jeu fictif, mot pour mot, remis dans la forme d'un
#: cahier des charges.
#:
#: ⚠️ Pourquoi celui-là et pas un vrai : **le dépôt n'en porte aucun**, et un
#: appel d'offres fabriqué pour l'occasion serait une donnée inventée entrée dans
#: un corpus de mesure. Celui-ci est déjà dans le dépôt, déjà assumé fictif, et
#: le donneur d'ordre y est nommé « fictif » en toutes lettres — personne ne peut
#: le prendre pour une consultation réelle.
#:
#: ⚠️ Ce que ce choix COÛTE, et il faut le lire avant d'interpréter une note :
#: un document construit autour de cinq exigences déjà rédigées est plus FACILE
#: qu'un cahier des charges réel de quarante pages, où les exigences sont noyées
#: dans de la prose administrative. Les notes de ``exigences_citees`` sont donc
#: un PLAFOND. Ce que le banc mesure ici est un écart ENTRE DEUX MODÈLES sur la
#: même entrée, jamais une aptitude absolue.
RFP_DOCUMENT = """CONSULTATION — TIERCE MAINTENANCE APPLICATIVE ET SOCLE DE DONNÉES
Donneur d'ordre fictif (démonstration)
Référence : CONSULT-DEMO-2026-014

1. OBJET DE LA CONSULTATION
La présente consultation porte sur deux lots, attribuables séparément :
  Lot 1 — renfort d'exploitation (démo)
  Lot 2 — socle de données (démo)
Les candidats peuvent répondre à un seul lot ou aux deux. Une réponse partielle
sur un lot n'entraîne pas le rejet de la candidature sur l'autre.

2. CALENDRIER
Date limite de remise des offres : 2026-09-30.
Les questions doivent parvenir au pouvoir adjudicateur au plus tard quinze jours
avant la date limite de remise.

3. CADRE ADMINISTRATIF
Certification ISO 27001 en cours de validité

4. RÉFÉRENCES
Deux références de moins de trois ans dans le secteur

5. MOYENS HUMAINS
Équipe de 4 ETP dont un architecte, mobilisée sur trois ans

6. EXIGENCES TECHNIQUES
Stack React / Node.js / PostgreSQL pour la conception et le développement

7. CADRE CONTRACTUEL
Pénalités de retard et réversibilité en fin de marché
"""

#: Les sources APPROUVÉES fournies à ``bellum_rfp_draft`` — toutes tirées du
#: profil de l'ESN de démonstration ci-dessus, aucune ajoutée.
#:
#: ⚠️ Aucune ne parle de certification ISO 27001. C'est délibéré, et c'est ce qui
#: rend le second cas de rédaction MESURABLE : sur l'exigence de certification,
#: la seule réponse juste est ``to_produce``, et un modèle qui rédige quand même
#: fabrique un engagement contractuel — la faute que ce prompt existe pour
#: empêcher (``app/prompts/bellum_rfp.py:156-159``).
APPROVED_SOURCES: list[dict[str, Any]] = [
    {
        "kind": "reference_client",
        "title": "Exploitation d'une plateforme d'apprentissage automatique",
        "content": ESN_PROFILE["references"][0],
    },
    {
        "kind": "reference_client",
        "title": "Socle Kubernetes multi-région",
        "content": ESN_PROFILE["references"][1],
    },
    {
        "kind": "politique_interne",
        "title": "Méthode de cadrage",
        "content": ESN_PROFILE["differentiators"][0],
    },
    {
        "kind": "politique_interne",
        "title": "Règle de périmètre",
        "content": ESN_PROFILE["differentiators"][1],
    },
]

#: Les deux exigences rédigées par le banc, recopiées du même jeu scripté. La
#: première est COUVERTE par les sources ci-dessus, la seconde ne l'est pas.
REQUIREMENT_COVERED: dict[str, Any] = {
    "section": "Références",
    "text": "Deux références de moins de trois ans dans le secteur",
    "weight": "mandatory",
    "kind": "other",
    "ownerRole": "sales",
}
REQUIREMENT_UNCOVERED: dict[str, Any] = {
    "section": "Cadre administratif",
    "text": "Certification ISO 27001 en cours de validité",
    "weight": "mandatory",
    "kind": "security",
    "ownerRole": "security",
}

#: Le format imposé par le client, tel que le routeur le transmet
#: (``app/routers/rfp.py:130``).
CLIENT_FORMAT = "Une réponse par exigence, 10 lignes maximum, sans annexe."

#: Le compte de référence — le seul dont un corpus ``golden`` porte une analyse
#: RÉELLE et complète.
ACCOUNT_NAME = "Doctolib"


# ── la matière, relue du corpus ────────────────────────────────────────────────


def _richest_output(rows: list[CallRecord], prompt_name: str) -> dict[str, Any] | None:
    """La capture ``recorded`` la plus FOURNIE d'un prompt, ou ``None``.

    « La plus fournie », et pas « la première » : le magasin contient, pour
    ``bellum_strategy``, une capture de 273 caractères dont tous les tableaux
    sont vides — la sortie vide du chemin ``instructor`` que ce module existe
    pour contourner. La prendre pour matière ferait travailler ``bellum_scorer``
    sur un dossier sans angles ni douleurs, et le banc mesurerait alors la
    pauvreté de sa propre entrée.
    """
    candidates = [
        r.output
        for r in rows
        if r.prompt_name == prompt_name
        and r.arm == ARM_RECORDED
        and r.ok
        and isinstance(r.output, dict)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda o: len(json.dumps(o, ensure_ascii=False)))


@dataclass(frozen=True)
class Material:
    """Ce que les quatre prompts reçoivent — assemblé une fois, partagé par tous."""

    raw_analysis: dict[str, Any]
    #: ``True`` quand le corpus a fourni au moins une capture d'analyse. Sans
    #: elle, ``raw_analysis`` ne porte que le nom du compte — ce n'est pas un
    #: dossier, et ``bellum_scorer`` ne se mesure pas dessus.
    has_analysis: bool = False
    missing: list[str] = field(default_factory=list)


def build_material(rows: list[CallRecord]) -> Material:
    """Reconstitue le dossier depuis les captures du corpus.

    Ce que produit le graphe s'appelle ``raw_analysis`` : c'est la FUSION des
    sorties des trois prompts d'analyse. On la refait ici à l'identique, à une
    différence NOMMÉE près : les clés restent en ``snake_case``, telles que
    l'enregistreur les a écrites (``model_dump(mode="json")`` sans ``by_alias``),
    là où l'API range ``raw_analysis`` avec des alias mêlés. ``bellum_scorer``
    n'y lit aucune clé précise — il interpole le dictionnaire entier
    (``app/prompts/bellum_scorer.py:63``) — donc la divergence est bornée.
    """
    missing: list[str] = []
    payloads = [
        (name, _richest_output(rows, name))
        for name in ("bellum_facts", "bellum_signals", "bellum_strategy")
    ]
    for label, payload in payloads:
        if not payload:
            missing.append(f"aucune capture `recorded` exploitable pour {label}")

    raw: dict[str, Any] = {"company_name": ACCOUNT_NAME}
    found = False
    for _label, payload in payloads:
        if payload:
            raw.update(payload)
            found = True
    return Material(raw_analysis=raw, has_analysis=found, missing=missing)


def _signal_lines(material: Material) -> str:
    """Les signaux du dossier, un par ligne — la forme que le routeur
    ``/content/post-ideas`` reçoit (du texte libre, pas du JSON)."""
    lines: list[str] = []
    for signal in material.raw_analysis.get("recent_signals") or []:
        if not isinstance(signal, dict):
            continue
        label = str(signal.get("signal") or "").strip()
        if not label:
            continue
        date = str(signal.get("date") or "").strip()
        lines.append(f"- {label}" + (f" ({date})" if date else ""))
    return "\n".join(lines)


# ── les entrées ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Case:
    """Une entrée du corpus : le prompt, ses deux textes, son contrat de sortie.

    ⚠️ ``response_model`` porte DEUX formes, parce que la production en a deux :
    ``dict`` (les deux routes RFP — l'enveloppe ``{"data": {…}}``) et une classe
    Pydantic (le scorer, les sujets de publication). Les envoyer toutes les deux
    sous la même forme d'outil ferait mesurer un contrat que la production
    n'utilise pas.
    """

    prompt_name: str
    case: str
    system: str
    user: str
    #: Le plafond que le ROUTEUR envoie en production — l'identité de l'entrée.
    production_max_tokens: int
    #: ``dict`` ou une classe Pydantic — le ``response_model`` de production.
    response_model: Any = dict

    @property
    def key(self) -> str:
        """L'identité LISIBLE d'un cas.

        ⚠️ Pas ``prompt_name`` : ``bellum_rfp_draft`` a DEUX cas (une exigence
        couverte, une qui ne l'est pas) et les ranger sous le nom du prompt en
        écraserait un — le second serait mesuré, puis perdu.
        """
        return f"{self.prompt_name} · {self.case}"

    @property
    def is_envelope(self) -> bool:
        return self.response_model is dict

    @property
    def response_model_name(self) -> str:
        return describe_response_model(self.response_model)

    @property
    def system_sent(self) -> str:
        """Le system RÉELLEMENT envoyé — avec l'instruction d'enveloppe quand la
        production l'ajoute (``claude_service._call_dict``), sans elle sinon."""
        if self.is_envelope:
            return self.system + claude_service.DICT_ENVELOPE_INSTRUCTION
        return self.system

    @property
    def tool_schema(self) -> dict[str, Any]:
        if self.is_envelope:
            return _ENVELOPE_SCHEMA
        return self.response_model.model_json_schema()

    @property
    def record_id(self) -> str:
        return compute_record_id(
            prompt_name=self.prompt_name,
            system=self.system,
            user=self.user,
            response_model=self.response_model_name,
            max_tokens=self.production_max_tokens,
        )

    def read(self, payload: Any) -> tuple[dict[str, Any] | None, str]:
        """La sortie d'un tirage, lue comme la production la lirait.

        ``(None, pourquoi)`` quand elle n'a pas la forme attendue : c'est un
        ``schema_error``, pas un objet vide — les confondre ferait noter « 0 »
        une réponse qu'on n'a pas su lire, ce que la doctrine interdit.
        """
        if self.is_envelope:
            return _unwrap(payload)
        if not isinstance(payload, dict):
            return None, f"réponse hors objet ({type(payload).__name__})"
        try:
            model: BaseModel = self.response_model.model_validate(payload)
        except ValidationError as exc:
            return None, f"{self.response_model.__name__} refuse la sortie : {exc.errors()[:3]}"
        # Le ``model_dump(mode="json")`` de l'enregistreur (``recorder._serialisable``) :
        # ce que le barème note doit être ce que le magasin porte.
        return model.model_dump(mode="json"), ""


def _unwrap(payload: Any) -> tuple[dict[str, Any] | None, str]:
    """``{"data": {...}}`` → le dict intérieur. Sinon ``(None, pourquoi)``.

    ⚠️ ``coerce_serialized_object`` n'est PAS une commodité : c'est la différence
    entre mesurer un modèle et mesurer son lecteur. La production accepte un
    ``data`` arrivé en CHAÎNE JSON depuis le 10/08/2026
    (``claude_service._call_dict`` pose ce validateur sur son enveloppe, après
    l'avoir vu sur un run réel). Un banc plus sévère que la production compte des
    fautes qui n'en sont pas — et il les compte du seul côté qui a la manie, donc
    il fausse la comparaison dans un sens précis.
    """
    if not isinstance(payload, dict):
        return None, f"réponse hors enveloppe ({type(payload).__name__})"
    data = claude_service.coerce_serialized_object(payload.get("data", payload))
    if not isinstance(data, dict):
        return None, f"le champ `data` n'est pas un objet ({type(data).__name__})"
    return data, ""


@dataclass(frozen=True)
class Plan:
    """Ce que le banc peut mesurer, et ce qu'il ne peut pas — les deux écrits."""

    cases: list[Case]
    #: ``prompt · cas → pourquoi il n'est pas mesurable ici``. Jamais silencieux :
    #: un cas absent sans raison se lirait « ce prompt n'existe pas ».
    skipped: dict[str, str] = field(default_factory=dict)


def build_plan(material: Material) -> Plan:
    """Les entrées, construites par les modules de prompt du dépôt.

    Ce qui ne peut pas être construit est NOMMÉ, jamais remplacé : « aucune
    analyse dans le corpus » n'autorise pas à fabriquer un dossier.
    """
    cases: list[Case] = []
    skipped: dict[str, str] = {}

    # ── bellum_rfp_analyse — routeur app/routers/rfp.py:100-111 (8000) ────────
    cases.append(
        Case(
            prompt_name="bellum_rfp_analyse",
            case="consultation-demo",
            system=bellum_rfp.build_analysis_system_prompt(),
            user=bellum_rfp.build_analysis_user_prompt(
                RFP_DOCUMENT,
                profile_data=ESN_PROFILE,
                account_name="Donneur d'ordre fictif (démonstration)",
            ),
            production_max_tokens=8000,
        )
    )

    # ── bellum_rfp_draft — routeur app/routers/rfp.py:133-141 (2000) ──────────
    # DEUX cas, et c'est le cœur de ce prompt : le premier mesure la rédaction
    # sourcée, le second mesure le REFUS de rédiger. Un banc qui n'aurait que le
    # premier ne verrait jamais la faute qui coûte un client.
    for label, requirement in (
        ("exigence-couverte", REQUIREMENT_COVERED),
        ("exigence-non-couverte", REQUIREMENT_UNCOVERED),
    ):
        cases.append(
            Case(
                prompt_name="bellum_rfp_draft",
                case=label,
                system=bellum_rfp.build_drafting_system_prompt(),
                user=bellum_rfp.build_drafting_user_prompt(
                    requirement,
                    approved_sources=APPROVED_SOURCES,
                    client_format=CLIENT_FORMAT,
                ),
                production_max_tokens=2000,
            )
        )

    # ── bellum_scorer — routeur app/routers/scorer.py:53-61 (2000) ────────────
    if not material.has_analysis:
        skipped["bellum_scorer · " + ACCOUNT_NAME.lower()] = (
            "aucune analyse dans le corpus — l'entrée de ce prompt EST un `raw_analysis`, et le "
            "dépôt n'en porte aucun hors du magasin gitignoré. Fabriquer un dossier pour combler "
            "le trou ferait mesurer le modèle sur une donnée inventée : le cas est SAUTÉ. Le "
            "rétablir suppose une capture `record` payée au préalable."
        )
    else:
        cases.append(
            Case(
                prompt_name="bellum_scorer",
                case=ACCOUNT_NAME.lower(),
                system=bellum_scorer.build_system_prompt(ESN_PROFILE),
                user=bellum_scorer.build_user_prompt(
                    raw_analysis=material.raw_analysis,
                    profile=ESN_PROFILE,
                    company_name=ACCOUNT_NAME,
                ),
                production_max_tokens=2000,
                response_model=ScoringOutput,
            )
        )

    # ── bellum_linkedin_posts — routeur app/routers/content.py:31-43 (1500) ───
    signals = _signal_lines(material)
    if not signals:
        # Le prompt TOLÈRE un bloc absent (« un contexte vide doit produire moins
        # de sujets, pas des sujets inventés ») : le cas reste mesurable, mais
        # sur une matière plus mince — et ça se dit.
        skipped["bellum_linkedin_posts · bloc SIGNAUX"] = (
            "aucun signal dans le corpus — le bloc « SIGNAUX DE MARCHÉ OBSERVÉS » n'est pas "
            "injecté. Le cas RESTE mesuré (le prompt accepte un contexte partiel) mais sur une "
            "matière plus mince : les notes ne sont pas comparables à celles d'une campagne qui "
            "avait le corpus."
        )
    cases.append(
        Case(
            prompt_name="bellum_linkedin_posts",
            case=ACCOUNT_NAME.lower() if signals else "sans-signaux",
            system=bellum_linkedin_posts.build_system_prompt(),
            user=bellum_linkedin_posts.build_user_prompt(
                esn_offers="\n".join(f"- {o}" for o in ESN_PROFILE["offers"]),
                missions="\n".join(f"- {r}" for r in ESN_PROFILE["references"]),
                signals=signals,
                objective=(
                    f"Ouvrir un premier échange chez {ACCOUNT_NAME} sur "
                    f"{ESN_PROFILE['offers'][1].lower()}."
                    if material.has_analysis
                    else ""
                ),
            ),
            production_max_tokens=1500,
            response_model=LinkedInPostsOutput,
        )
    )

    return Plan(cases=cases, skipped=skipped)


# ── les deux appels directs ───────────────────────────────────────────────────


@dataclass(frozen=True)
class Draw:
    """Un tirage : ce qu'il a rendu, ou pourquoi il a échoué."""

    model: str
    status: str
    latency_s: float
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    #: ⚠️ Ce que le magasin ne sait PAS porter, et qui change la lecture du coût.
    #: N tirages du même cas sont N prompts IDENTIQUES : le fournisseur les met en
    #: cache tout seul et ne facture plus que le reliquat. En production, deux
    #: appels consécutifs portent deux dossiers différents et ne partagent presque
    #: rien. Le coût moyen d'un bras est donc un PLANCHER, pas une facture.
    cached_tokens: int = 0
    output: dict[str, Any] | None = None
    error: str = ""

    @property
    def ok(self) -> bool:
        return self.status == STATUS_OK


async def draw_anthropic(case: Case, model: str, *, timeout: float) -> Draw:
    """Un tirage Anthropic — appel d'outil DIRECT, sans ``instructor``."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=timeout)
    started = time.perf_counter()
    try:
        resp = await client.messages.create(
            model=model,
            max_tokens=BENCH_MAX_TOKENS,
            system=case.system_sent,
            messages=[{"role": "user", "content": case.user}],
            tools=[{
                "name": _TOOL_NAME,
                "description": _TOOL_DESCRIPTION,
                "input_schema": case.tool_schema,
            }],
            tool_choice={"type": "tool", "name": _TOOL_NAME},
        )
    except Exception as exc:  # noqa: BLE001 — un tirage raté se RAPPORTE, il ne s'efface pas
        return Draw(
            model=model, status=STATUS_ERROR,
            latency_s=round(time.perf_counter() - started, 3),
            error=f"{type(exc).__name__}: {exc}"[:2000],
        )
    latency = round(time.perf_counter() - started, 3)

    usage = resp.usage
    in_tok = int(getattr(usage, "input_tokens", 0) or 0)
    out_tok = int(getattr(usage, "output_tokens", 0) or 0)
    cached = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
    cost = claude_service._compute_cost(
        in_tok, out_tok, model, cached,
        int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
    )
    if resp.stop_reason == "max_tokens":
        return Draw(
            model=model, status=STATUS_TRUNCATED, latency_s=latency,
            input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached,
            error=f"stop_reason=max_tokens à {BENCH_MAX_TOKENS} jetons",
        )

    block = next((b for b in resp.content if getattr(b, "type", "") == "tool_use"), None)
    if block is None:
        return Draw(
            model=model, status=STATUS_SCHEMA_ERROR, latency_s=latency,
            input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached,
            error=f"aucun bloc tool_use (stop_reason={resp.stop_reason})",
        )
    data, why = case.read(block.input)
    if data is None:
        return Draw(
            model=model, status=STATUS_SCHEMA_ERROR, latency_s=latency,
            input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached,
            error=why,
        )
    return Draw(
        model=model, status=STATUS_OK, latency_s=latency,
        input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached, output=data,
    )


async def draw_openai(case: Case, model: str, *, timeout: float, effort: str = DEFAULT_EFFORT) -> Draw:
    """Un tirage OpenAI — ``/v1/responses``, effort de raisonnement EXPOSÉ.

    C'est le point qui distingue ce banc de la passerelle : celle-ci joint
    ``reasoning_effort='none'`` dès qu'il y a des outils
    (``llm_gateway._openai_tools_reasoning_kwargs``), parce qu'``instructor``
    n'a pas de mode Responses. Mesurer un modèle de raisonnement avec le
    raisonnement éteint ne mesure pas le modèle — mais mesurer en ``medium``
    ne dit pas ce que la passerelle d'AUJOURD'HUI rendrait. Les deux questions
    sont légitimes ; ``--effort`` dit laquelle on pose, et le nom du bras la
    porte.
    """
    import openai

    client = openai.AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=timeout)
    started = time.perf_counter()
    try:
        resp = await client.responses.create(
            model=model,
            instructions=case.system_sent,
            input=case.user,
            max_output_tokens=BENCH_MAX_TOKENS,
            reasoning={"effort": effort},
            tools=[{
                "type": "function",
                "name": _TOOL_NAME,
                "description": _TOOL_DESCRIPTION,
                "parameters": case.tool_schema,
            }],
            tool_choice={"type": "function", "name": _TOOL_NAME},
        )
    except Exception as exc:  # noqa: BLE001
        return Draw(
            model=model, status=STATUS_ERROR,
            latency_s=round(time.perf_counter() - started, 3),
            error=f"{type(exc).__name__}: {exc}"[:2000],
        )
    latency = round(time.perf_counter() - started, 3)

    usage = resp.usage
    prompt_tokens = int(getattr(usage, "input_tokens", 0) or 0)
    details = getattr(usage, "input_tokens_details", None)
    cached = int(getattr(details, "cached_tokens", 0) or 0) if details is not None else 0
    in_tok = max(prompt_tokens - cached, 0)
    out_tok = int(getattr(usage, "output_tokens", 0) or 0)
    from app.services.llm_gateway import _openai_compute_cost

    cost = _openai_compute_cost(in_tok, out_tok, model, cached)
    cost = 0.0 if cost is None else cost

    if getattr(resp, "status", "") == "incomplete":
        reason = getattr(getattr(resp, "incomplete_details", None), "reason", "")
        return Draw(
            model=model,
            status=STATUS_TRUNCATED if reason == "max_output_tokens" else STATUS_ERROR,
            latency_s=latency, input_tokens=in_tok, output_tokens=out_tok,
            cost_usd=cost, cached_tokens=cached,
            error=f"réponse incomplète ({reason or 'raison non donnée'}) à "
                  f"{BENCH_MAX_TOKENS} jetons, effort={effort}",
        )

    call = next((item for item in resp.output if getattr(item, "type", "") == "function_call"), None)
    if call is None:
        return Draw(
            model=model, status=STATUS_SCHEMA_ERROR, latency_s=latency,
            input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached,
            error=f"aucun function_call dans la réponse (status={getattr(resp, 'status', '?')})",
        )
    try:
        payload = json.loads(call.arguments)
    except (ValueError, TypeError) as exc:
        return Draw(
            model=model, status=STATUS_SCHEMA_ERROR, latency_s=latency,
            input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached,
            error=f"arguments illisibles : {exc}",
        )
    data, why = case.read(payload)
    if data is None:
        return Draw(
            model=model, status=STATUS_SCHEMA_ERROR, latency_s=latency,
            input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached,
            error=why,
        )
    return Draw(
        model=model, status=STATUS_OK, latency_s=latency,
        input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached, output=data,
    )


# ── le magasin ────────────────────────────────────────────────────────────────


def _record(case: Case, draw: Draw, *, arm: str, store_entry: bool) -> CallRecord:
    return CallRecord(
        record_id=case.record_id,
        corpus=CORPUS_LABEL,
        case=case.case,
        prompt_name=case.prompt_name,
        task=case.prompt_name,
        system=case.system,
        user=case.user,
        response_model=case.response_model_name,
        max_tokens=case.production_max_tokens,
        max_retries=claude_service.DEFAULT_MAX_RETRIES,
        model_requested=SONNET_MODEL,
        arm=ARM_RECORDED if store_entry else arm,
        model=draw.model,
        provider="anthropic" if draw.model == SONNET_MODEL else "openai",
        status=draw.status,
        error=draw.error,
        latency_s=draw.latency_s,
        input_tokens=draw.input_tokens,
        output_tokens=draw.output_tokens,
        cost_usd=draw.cost_usd,
        output=draw.output,
    )


def arm_label(arm: str, effort: str) -> str:
    """Le nom du bras ÉCRIT dans le magasin.

    ⚠️ Le bras Luna porte TOUJOURS son effort. Ces quatre prompts n'ont jamais
    été mesurés : il n'y a aucune campagne antérieure à ménager, donc rien qui
    justifie un nom de bras muet. Sans ce suffixe, une campagne ``--effort none``
    et une campagne ``medium`` s'écriraient sous le même bras et la moyenne
    mélangerait deux modèles de fait — le défaut déjà payé sur le bras
    ``recorded``, qui mêlait une capture vide de 273 caractères aux bonnes et
    écrasait la note de ``bellum_strategy``.
    """
    return arm if arm == ARM_SONNET else f"{arm}-{effort}"


# ── la mesure ─────────────────────────────────────────────────────────────────


@dataclass
class ArmResult:
    """Les tirages d'un bras sur un cas, et ce qu'ils ont donné."""

    arm: str
    model: str
    draws: list[Draw] = field(default_factory=list)
    rubrics: list[RubricResult] = field(default_factory=list)

    @property
    def totals(self) -> list[float]:
        return [t for r in self.rubrics if (t := r.total) is not None]

    @property
    def failures(self) -> list[Draw]:
        return [d for d in self.draws if not d.ok]

    def cost_mean(self) -> float | None:
        paid = [d.cost_usd for d in self.draws if d.cost_usd]
        return round(sum(paid) / len(paid), 6) if paid else None

    def cached_total(self) -> int:
        return sum(d.cached_tokens for d in self.draws)

    def axis_means(self) -> dict[str, float | None]:
        """Le ratio moyen par axe, sur les seuls tirages où il était MESURÉ."""
        seen: dict[str, list[float]] = {}
        for r in self.rubrics:
            for axis in r.axes:
                seen.setdefault(axis.name, [])
                if axis.ratio is not None:
                    seen[axis.name].append(axis.ratio)
        return {k: (round(statistics.mean(v), 4) if v else None) for k, v in seen.items()}

    def axis_unmeasured(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for r in self.rubrics:
            for axis in r.axes:
                if axis.ratio is None and axis.name not in out:
                    out[axis.name] = axis.reason
        return out


async def measure(
    cases: list[Case],
    store: Path,
    *,
    draws: int,
    timeout: float,
    arms: list[str],
    effort: str = DEFAULT_EFFORT,
    write_entry: bool = True,
) -> dict[str, dict[str, ArmResult]]:
    """Tire, note, et écrit chaque tirage dans le magasin au fil de l'eau.

    Au fil de l'eau, et pas à la fin : un ``Ctrl-C`` au milieu d'une campagne ne
    doit pas faire re-payer ce qui a déjà abouti (même discipline qu'``append_call``).

    ``write_entry=False`` sur un COMPLÉMENT : l'entrée du corpus existe déjà, la
    réécrire ferait croire à deux captures là où il n'y a qu'une campagne.
    """
    results: dict[str, dict[str, ArmResult]] = {}
    for case in cases:
        fn = rubric_for(case.prompt_name)
        per_arm: dict[str, ArmResult] = {}
        for arm in arms:
            model = SONNET_MODEL if arm == ARM_SONNET else LUNA_MODEL
            label = arm_label(arm, effort)
            res = ArmResult(arm=label, model=model)
            for i in range(draws):
                print(f"  · {case.key} · {label} · tirage {i + 1}/{draws}…", flush=True)
                draw = (
                    await draw_anthropic(case, model, timeout=timeout)
                    if arm == ARM_SONNET
                    else await draw_openai(case, model, timeout=timeout, effort=effort)
                )
                res.draws.append(draw)
                # L'entrée du corpus est écrite UNE fois, au premier tirage du
                # bras de PRODUCTION (Sonnet) : c'est elle qui manquait, et c'est
                # elle qu'un `replay` ultérieur rejouera. Le même tirage est
                # ensuite écrit sous son bras, pour que les deux bras aient le
                # même nombre de lignes appariables.
                if write_entry and arm == ARM_SONNET and i == 0:
                    append_call(store, _record(case, draw, arm=label, store_entry=True))
                append_call(store, _record(case, draw, arm=label, store_entry=False))
                if draw.ok and fn is not None and draw.output is not None:
                    res.rubrics.append(fn(draw.output, user_prompt=case.user))
            per_arm[label] = res
        results[case.key] = per_arm
    return results


# ── le rendu ──────────────────────────────────────────────────────────────────


def _fmt(value: float | None, spec: str = ".2f") -> str:
    return "non mesuré" if value is None else format(value, spec)


def report(cases: list[Case], results: dict[str, dict[str, ArmResult]]) -> None:
    for case in cases:
        per_arm = results.get(case.key) or {}
        print()
        print(f"═══ {case.key} ═══")
        print(f"{'bras':<24} {'médiane':>9} {'min':>7} {'max':>7} {'n':>3} "
              f"{'coût moyen $':>13} {'jetons en cache':>16}")
        for arm, res in per_arm.items():
            totals = res.totals
            med = round(statistics.median(totals), 2) if totals else None
            print(
                f"{arm:<24} {_fmt(med):>9} {_fmt(min(totals) if totals else None):>7} "
                f"{_fmt(max(totals) if totals else None):>7} {len(totals):>3} "
                f"{_fmt(res.cost_mean(), '.6f'):>13} {res.cached_total():>16}"
            )
            for d in res.failures:
                print(f"    ✗ ÉCHEC ({d.status}) : {d.error[:180]}")
            if res.cached_total():
                print("    ⓘ coût moyen = PLANCHER : le fournisseur a servi une partie de "
                      "l'entrée depuis son cache (tirages identiques). En production, deux "
                      "appels portent deux dossiers différents.")
        arms = list(per_arm)
        if len(arms) == 2:
            a, b = (per_arm[arms[0]].axis_means(), per_arm[arms[1]].axis_means())
            print(f"  {'axe':<32} {arms[0]:>18} {arms[1]:>18} {'écart':>9}")
            for name in sorted(set(a) | set(b)):
                va, vb = a.get(name), b.get(name)
                delta = None if (va is None or vb is None) else round(vb - va, 4)
                print(f"  {name:<32} {_fmt(va, '.3f'):>18} {_fmt(vb, '.3f'):>18} "
                      f"{_fmt(delta, '+.3f'):>9}")
        for arm, res in per_arm.items():
            for name, reason in res.axis_unmeasured().items():
                print(f"  ⓘ {arm} · {name} NON MESURÉ : {reason[:200]}")
        if per_arm:
            first = next(iter(per_arm.values()))
            if first.rubrics:
                print(f"  ⚠️ Ce que le barème NE voit PAS : {first.rubrics[0].caveat}")


# ── la CLI ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="python -m app.eval.bench.prompts_restants",
        description="Banc Sonnet vs Luna sur les quatre prompts RESTÉS sur Sonnet. "
                    "APPELS PAYANTS.",
    )
    p.add_argument("--store", default="evals-out/model-bench.jsonl")
    p.add_argument("--draws", type=int, default=3,
                   help="Tirages par modèle et par cas (défaut 3).")
    p.add_argument("--timeout", type=float, default=300.0)
    p.add_argument("--prompt", action="append", default=None,
                   help="Restreindre à un prompt_name (répétable).")
    p.add_argument("--case", action="append", default=None,
                   help="Restreindre à un cas (répétable) — p. ex. `exigence-non-couverte`.")
    p.add_argument("--arm", action="append", default=None, choices=(ARM_SONNET, ARM_LUNA),
                   help="Restreindre à un bras (répétable) — pour compléter des tirages "
                        "manquants sans re-payer ceux qui ont abouti.")
    p.add_argument(
        "--effort", default=DEFAULT_EFFORT, choices=EFFORTS,
        help=(
            f"Effort de raisonnement du bras OpenAI (défaut {DEFAULT_EFFORT}). "
            f"⚠️ La PRODUCTION vaut `{PRODUCTION_EFFORT}` : "
            "`llm_gateway._openai_tools_reasoning_kwargs` joint `reasoning_effort='none'` "
            f"dès qu'il y a des outils. Mesurer en `{DEFAULT_EFFORT}` répond à « Luna "
            "peut-elle ? », pas à « que rendrait la passerelle d'aujourd'hui ? ». Le bras "
            "porte toujours son effort dans son nom."
        ),
    )
    p.add_argument("--dry-run", action="store_true",
                   help="Construit les entrées, n'appelle rien. GRATUIT.")
    p.add_argument("--yes-run-live", action="store_true",
                   help="Confirme les appels RÉELS et PAYANTS.")
    args = p.parse_args(argv)

    store = Path(args.store)
    rows = load_calls(store)
    if not rows:
        # ⚠️ Pas un refus : ``evals-out/`` est gitignoré et n'existe que sur la
        # machine qui a payé une capture. Trois cas sur quatre se construisent
        # SANS corpus ; le quatrième est sauté, avec sa raison.
        print(f"⚠️ Corpus vide ou absent ({store}) — ce qui en dépend sera SAUTÉ, "
              "avec sa raison. Rien n'est fabriqué pour combler le trou.")

    material = build_material(rows)
    plan = build_plan(material)
    cases = plan.cases
    if args.prompt:
        cases = [c for c in cases if c.prompt_name in set(args.prompt)]
    if args.case:
        cases = [c for c in cases if c.case in set(args.case)]

    print(f"Matière : analyse du corpus = {'oui' if material.has_analysis else 'NON'}, "
          f"{len(json.dumps(material.raw_analysis, ensure_ascii=False))} caractères, "
          f"{len(APPROVED_SOURCES)} source(s) approuvée(s), "
          f"{len(RFP_DOCUMENT)} caractères d'appel d'offres.")
    for note in material.missing:
        print(f"  ⚠️ {note}")
    for key, reason in plan.skipped.items():
        print(f"  ⚠️ {key} : {reason}")
    for c in cases:
        print(f"  · {c.key:<44} système {len(c.system):>6} car · utilisateur {len(c.user):>7} car "
              f"· plafond prod {c.production_max_tokens:>5} · contrat "
              f"{c.response_model_name or 'texte'} · barème "
              f"{'oui' if rubric_for(c.prompt_name) else 'AUCUN'} · id {c.record_id[:12]}")
    if not cases:
        print("Aucun cas mesurable — rien à faire.", file=sys.stderr)
        return 2
    print(f"Clés présentes : ANTHROPIC_API_KEY={'oui' if os.getenv('ANTHROPIC_API_KEY') else 'NON'} · "
          f"OPENAI_API_KEY={'oui' if os.getenv('OPENAI_API_KEY') else 'NON'}")

    if args.dry_run:
        return 0
    if not args.yes_run_live:
        print("\nAppels RÉELS et PAYANTS. Relancer avec --yes-run-live pour confirmer.",
              file=sys.stderr)
        return 1

    arms = args.arm or [ARM_SONNET, ARM_LUNA]
    results = asyncio.run(measure(
        cases, store, draws=args.draws, timeout=args.timeout, arms=arms, effort=args.effort,
        write_entry=not (args.arm or args.prompt or args.case),
    ))
    report(cases, results)
    total = sum(d.cost_usd for per in results.values() for r in per.values() for d in r.draws)
    print(f"\nCoût total MESURÉ : ${total:.4f}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
