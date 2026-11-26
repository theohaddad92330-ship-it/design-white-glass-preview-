"""Le banc des quatre prompts de LIVRABLE — et pourquoi il contourne deux choses.

Le trou que ce module comble
----------------------------
``app/eval/bench/rubrics/`` porte depuis le 29/08/2026 un barème déterministe
pour ``bellum_cv``, ``bellum_need_play``, ``bellum_battlecard`` et
``bellum_compare``. Ces quatre barèmes n'avaient **aucun corpus à noter**, et
``run.py record`` ne pouvait pas leur en fabriquer : il pilote
``run_analysis_graph``, et le graphe d'analyse n'appelle ni ``/compare``, ni
``/battlecard``, ni ``/cv/rewrite``, ni ``/needs/play``. Ces quatre-là sont des
routes de LIVRABLE, déclenchées par un geste d'utilisateur bien après l'analyse.
Un barème qui n'a jamais vu une sortie réelle n'est pas un barème : c'est une
intention.

Contournement n°1 — le ROUTEUR et la BASE
------------------------------------------
Deux des quatre routeurs (``battlecard``, ``compare``) lisent Supabase pour
retrouver le compte, ses contacts et le profil de l'ESN. Passer par eux
supposerait un espace, un compte analysé et un jeu de contacts en base — donc
mesurer, en plus du modèle, la fraîcheur d'une base. Ce module appelle donc
``build_system_prompt()`` / ``build_user_prompt()`` **en direct**, avec une
matière relue du corpus déjà enregistré. La matière est identique d'un modèle à
l'autre par construction, ce qui est exactement ce que le corpus du banc existe
pour garantir (``corpus.py`` : « sans entrées identiques, comparer deux modèles
revient à comparer deux collectes »).

Contournement n°2 — la PASSERELLE, et c'est le plus important
--------------------------------------------------------------
Les mesures du 28-29/08/2026 ont montré que ``llm_gateway.complete`` ne peut pas
servir d'instrument :

* côté Anthropic, le chemin ``instructor`` a rendu un objet **entièrement vide**
  sur Sonnet à 12k, 24k et 32k ``max_tokens``, là où un appel d'outil direct
  rendait la sortie complète. La trace en est encore dans le magasin : la
  capture ``recorded`` de ``bellum_strategy`` fait 273 caractères, tous champs
  vides — ``tools/bench-sonnet-vs-luna.sh`` l'avait déjà nommée ;
* côté OpenAI, la passerelle joint ``reasoning_effort='none'`` aux appels
  outillés (``llm_gateway._openai_tools_reasoning_kwargs``, contournement du 400
  mesuré le 28/08). Sur un modèle de raisonnement, mesurer avec le raisonnement
  ÉTEINT ne mesure pas le modèle.

Ce module parle donc aux deux fournisseurs **en direct**, avec le MÊME schéma
JSON des deux côtés — l'enveloppe ``{"data": {...}}`` de ``_call_dict``, qui est
la forme de production de ces quatre prompts (``response_model=dict``).

Ce qui EST repris de la production, et ce qui ne l'est pas
-----------------------------------------------------------
Repris : les prompts (system + user, construits par les modules du dépôt),
l'instruction d'enveloppe (``claude_service.DICT_ENVELOPE_INSTRUCTION``), la
forme du schéma d'outil, les deux tables de tarifs (``_compute_cost`` et
``_openai_compute_cost`` — un prix vit à un seul endroit), le magasin JSONL et
son identité d'entrée (``compute_record_id``), et les barèmes (``rubric_for``).

PAS repris, et nommé plutôt que tu :

1. **La reprise sur erreur de schéma d'``instructor``.** Un appel direct ne
   rejoue pas une sortie mal formée. Une sortie illisible est donc comptée
   ``schema_error`` là où la production aurait retenté ``max_retries`` fois.
   C'est plus SÉVÈRE que la production, également des deux côtés.
2. **Le plafond de jetons.** Le champ ``max_tokens`` du magasin porte le plafond
   de PRODUCTION (3000 / 2500 selon la route) — c'est lui qui définit l'identité
   de l'entrée, et c'est lui qu'un rejeu ultérieur doit envoyer. Les tirages de
   ce banc partent, eux, à :data:`BENCH_MAX_TOKENS`, identique chez les deux
   fournisseurs, pour qu'une troncature ne soit jamais prise pour un défaut de
   modèle. ⚠️ Chez OpenAI ce plafond couvre AUSSI les jetons de raisonnement,
   que le plafond Anthropic ne compte pas : l'asymétrie est réelle, elle est
   dans ce sens-là, et elle est bornée par le fait que ces livrables tiennent en
   ~1 000 jetons de contenu.
3. **La boucle de doublement sur troncature** de ``_call_dict``. Un tirage
   tronqué est rendu tel quel, et le rapport le NOMME. Un échec ne se moyenne
   pas à zéro.

La matière
----------
Elle vient de trois sources, toutes déjà dans le dépôt, aucune inventée ici :

* le **dossier Doctolib** du corpus ``golden`` — les sorties RÉELLES et payées
  de ``bellum_facts``, ``bellum_signals``, ``bellum_strategy`` et des cinq lots
  de ``bellum_contacts`` (la plus riche capture ``recorded`` de chacun) ;
* le **dossier Société Générale** de ``app/eval/fixtures/`` — pour que
  ``bellum_compare`` ait un portefeuille de DEUX comptes plutôt qu'un seul, où
  la règle « le total fait 100 % » serait tenue par construction. Le dépôt ne
  porte que deux analyses non piégées : le portefeuille est donc de deux, et le
  rapport le dit ;
* l'**ESN de démonstration** (« Bellum Conseil ») et l'un de ses consultants,
  recopiés de ``apps/api/src/modules/demo/demo-dataset.ts``. Cette ESN et ces
  personnes sont FICTIVES, et le dépôt l'assume déjà là-bas : les sociétés
  analysées sont réelles, l'ESN qui les prospecte ne l'est pas. Aucun CV réel
  n'existe dans le dépôt, et en fabriquer un serait une donnée inventée sur une
  personne — exactement ce que ``bellum_cv`` existe pour empêcher.

⚠️ **Les clés de la matière restent celles que l'enregistreur a écrites**
(``snake_case``, ``model_dump(mode="json")`` sans ``by_alias``), là où l'API
range ``raw_analysis`` avec des alias mêlés. Aucun des quatre prompts ne lit une
clé précise de ``raw_analysis`` — ``bellum_battlecard`` l'interpole telle quelle,
``bellum_compare`` la sérialise — sauf ``competitors``, que ce module passe
explicitement. La divergence est donc bornée, et elle est écrite ici plutôt que
corrigée en silence.

Usage
-----
::

    # sans réseau : montre les quatre entrées, leur taille, ce qui manque
    python -m app.eval.bench.livrables --store <chemin> --dry-run

    # PAYANT — 3 tirages par modèle et par prompt, deux modèles
    railway run --service bellum-ia-service --environment production -- \\
      .venv/bin/python -m app.eval.bench.livrables --store <chemin> \\
      --draws 3 --yes-run-live
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

from app.eval.bench.corpus import (
    ARM_RECORDED,
    RESPONSE_MODEL_DICT,
    STATUS_ERROR,
    STATUS_OK,
    STATUS_SCHEMA_ERROR,
    STATUS_TRUNCATED,
    CallRecord,
    append_call,
    compute_record_id,
    load_calls,
)
from app.eval.bench.rubrics import RubricResult, rubric_for
from app.prompts import bellum_battlecard, bellum_compare, bellum_cv, bellum_need_play
from app.services import claude_service

#: Le plafond des tirages du banc — le MÊME des deux côtés, et volontairement
#: au-dessus de tous les plafonds de production (3000 / 2500), pour qu'une
#: troncature ne puisse pas être lue comme un défaut de modèle. Voir le §2 de
#: « ce qui n'est pas repris ».
BENCH_MAX_TOKENS = 8000

#: Le nom de l'outil. Sa forme reproduit l'enveloppe d'``instructor`` sur le
#: chemin ``response_model=dict`` (``claude_service._call_dict`` : un modèle
#: pydantic à un seul champ ``data: dict``).
_TOOL_NAME = "bellum_output"
_TOOL_DESCRIPTION = "Rends la réponse JSON demandée, entière, dans le champ `data`."
_TOOL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"data": {"type": "object", "description": "La réponse JSON demandée."}},
    "required": ["data"],
}

#: Les deux bras mesurés. Les étiquettes suivent celles déjà posées dans le
#: magasin pour le banc du plan (``sonnet-plan`` / ``luna-plan``).
ARM_SONNET = "sonnet-livrables"
ARM_LUNA = "luna-livrables"

SONNET_MODEL = claude_service.CLAUDE_MODEL
LUNA_MODEL = "gpt-5.6-luna"

CORPUS_LABEL = "livrables"

#: L'ESN de démonstration du dépôt (``apps/api/src/modules/demo/demo-dataset.ts``).
#: FICTIVE et assumée telle : le dépôt ne contient aucun profil d'ESN réelle, et
#: la capture ``recorded`` du plan Doctolib a tourné avec un profil VIDE (« Nom :
#: N/A »), donc inutilisable comme matière citable. Les preuves de
#: ``bellum_need_play`` doivent citer ce bloc : sans matière, l'axe qui compte le
#: plus ne serait pas mesurable.
ESN_PROFILE: dict[str, Any] = {
    "companyName": "Bellum Conseil",
    "esn_name": "Bellum Conseil",
    "archetype": "boutique_expert",
    "size": "PME",
    "esn_size": "PME",
    "offers": [
        "Exploitation de plateforme et observabilité",
        "Industrialisation de l'apprentissage automatique",
        "Sécurité applicative",
        "Systèmes d'information industriels",
    ],
    "core_offers": [
        "Exploitation de plateforme et observabilité",
        "Industrialisation de l'apprentissage automatique",
        "Sécurité applicative",
    ],
    "sectors": ["Plateformes numériques", "Banque", "Industrie", "Transport"],
    "references": [
        "Client : plateforme numérique française, 700 salariés. Contexte : plateforme "
        "d'apprentissage automatique fraîchement migrée, exploitation retenant les équipes "
        "de construction. Mission : deux ingénieurs sur l'exploitation, sans toucher à la "
        "conception des modèles. Résultat : délai moyen de détection d'incident divisé par "
        "quatre en quatre mois.",
        "Socle Kubernetes multi-région pour un opérateur d'énergie.",
        "Réduction du délai de détection d'incident sur une plateforme à fort trafic.",
    ],
    "differentiators": [
        "Cadrage en six semaines : atelier de 45 minutes en semaine 1, périmètre écrit et "
        "critère d'arrêt convenu, restitution et plan de suite chiffré en semaine 6.",
        "Règle : le périmètre ne s'élargit jamais en cours de route. Ce qui apparaît est "
        "noté pour la suite.",
        "Un périmètre qui s'arrête explicitement à la porte de la conception.",
    ],
}

#: Un consultant du vivier de démonstration, recopié verbatim
#: (``DEMO_CONSULTANTS[0]``). Personne fictive, CV fictif : c'est la seule
#: matière de CV que le dépôt porte, et la seule qu'on ait le droit d'envoyer à
#: un fournisseur.
DEMO_CONSULTANT: dict[str, Any] = {
    "full_name": "Camille Roussel",
    "title": "Architecte de plateforme — conteneurs et infrastructure as code",
    "seniority": "senior",
    "stack": ["Kubernetes", "Terraform", "Observabilité", "AWS", "CI/CD"],
    "sectors": ["Plateformes numériques", "Énergie"],
    "references": ["Socle Kubernetes multi-région pour un opérateur d'énergie"],
    "cv_text": "\n".join(
        [
            "CAMILLE ROUSSEL — Architecte de plateforme (9 ans)",
            "",
            "EXPÉRIENCE",
            "2022-2026 — Architecte plateforme, opérateur d'énergie. Conception et "
            "exploitation d'un socle Kubernetes multi-région, industrialisé en Terraform. "
            "Observabilité de bout en bout, budget d'erreur tenu deux ans de suite.",
            "2019-2022 — Ingénieure infrastructure, plateforme numérique. Migration d'un "
            "parc de machines virtuelles vers des conteneurs, chaînes CI/CD refaites.",
            "2017-2019 — Administratrice systèmes et réseaux.",
            "",
            "COMPÉTENCES",
            "Kubernetes, Terraform, AWS, observabilité, CI/CD.",
        ]
    ),
}

#: Le compte de référence : c'est le seul dont le corpus porte une analyse
#: RÉELLE et complète.
ACCOUNT_NAME = "Doctolib"
GOLDEN_CASE = "doctolib"

_FIXTURES = Path(__file__).resolve().parents[2] / "eval" / "fixtures"


# ── la matière, relue du corpus ────────────────────────────────────────────────


def _richest_output(rows: list[CallRecord], prompt_name: str) -> dict[str, Any] | None:
    """La capture ``recorded`` la plus FOURNIE d'un prompt, ou ``None``.

    « La plus fournie », et pas « la première » : le magasin contient, pour
    ``bellum_strategy``, une capture de 273 caractères dont tous les tableaux
    sont vides — la sortie vide du chemin ``instructor`` que ce module existe
    pour contourner. La prendre pour matière ferait travailler les quatre
    prompts sur un dossier sans angles ni douleurs, et le banc mesurerait alors
    la pauvreté de sa propre entrée.
    """
    candidates = [
        r.output
        for r in rows
        if r.prompt_name == prompt_name and r.arm == ARM_RECORDED and r.ok and isinstance(r.output, dict)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda o: len(json.dumps(o, ensure_ascii=False)))


def _recorded_contacts(rows: list[CallRecord]) -> list[dict[str, Any]]:
    """Les contacts classés du dossier Doctolib, tous lots confondus."""
    names = sorted({r.prompt_name for r in rows if r.prompt_name.startswith("bellum_contacts_batch")})
    out: list[dict[str, Any]] = []
    for name in names:
        payload = _richest_output(rows, name) or {}
        for c in payload.get("contacts") or []:
            if isinstance(c, dict):
                out.append(dict(c))
    return out


@dataclass(frozen=True)
class Material:
    """Ce que les quatre prompts reçoivent — assemblé une fois, partagé par tous."""

    raw_analysis: dict[str, Any]
    contacts: list[dict[str, Any]]
    competitors: list[dict[str, Any]]
    missing: list[str] = field(default_factory=list)


def build_material(rows: list[CallRecord]) -> Material:
    """Reconstitue le dossier Doctolib depuis les captures du corpus.

    Ce que produit le graphe s'appelle ``raw_analysis`` : c'est la FUSION des
    sorties des trois prompts d'analyse. On la refait ici à l'identique, avec la
    seule différence nommée en tête de module (les clés restent en
    ``snake_case``, telles que l'enregistreur les a écrites).
    """
    missing: list[str] = []
    facts = _richest_output(rows, "bellum_facts")
    signals = _richest_output(rows, "bellum_signals")
    strategy = _richest_output(rows, "bellum_strategy")
    for label, payload in (("bellum_facts", facts), ("bellum_signals", signals), ("bellum_strategy", strategy)):
        if not payload:
            missing.append(f"aucune capture `recorded` exploitable pour {label}")

    raw: dict[str, Any] = {"company_name": ACCOUNT_NAME}
    for payload in (facts, signals, strategy):
        if payload:
            raw.update(payload)

    contacts = _recorded_contacts(rows)
    if not contacts:
        missing.append("aucun contact classé dans le corpus (bellum_contacts_batch_*)")

    competitors = [c for c in (raw.get("competitors") or []) if isinstance(c, dict)]
    if not competitors:
        missing.append(
            "aucun concurrent dans l'analyse — l'axe `concurrents_fournis` de la battle "
            "card deviendra NON MESURABLE (et c'est le contrat, pas un manque)"
        )
    return Material(raw_analysis=raw, contacts=contacts, competitors=competitors, missing=missing)


def _societe_generale_analysis() -> dict[str, Any] | None:
    """La seconde analyse du portefeuille de ``bellum_compare``.

    ``None`` quand la fixture manque : le banc comparera alors UN compte, et le
    dira. Il ne fabrique pas un second dossier — un compte inventé est
    exactement ce que l'axe ``comptes_fournis`` existe pour attraper.
    """
    path = _FIXTURES / "societe-generale.analysis.json"
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    research = payload.get("research") or {}
    return {
        "company_name": research.get("companyName") or payload.get("company") or "Société Générale",
        "priority_score": None,
        "status": "analysed",
        "raw_analysis": research,
    }


def _need_from(material: Material) -> dict[str, Any]:
    """Le besoin que ``bellum_need_play`` doit attaquer.

    Il est DÉRIVÉ de l'analyse, jamais écrit à la main : on prend la première
    hypothèse qualifiée que ``bellum_signals`` a produite, à défaut le premier
    défi IT de ``bellum_strategy``. Les deux sont de la matière payée.
    """
    hypotheses = [h for h in (material.raw_analysis.get("qualified_hypotheses") or []) if isinstance(h, dict)]
    if hypotheses:
        h = hypotheses[0]
        return {
            "label": str(h.get("hypothesis") or "").strip(),
            "kind": "hypothèse qualifiée",
            "detail": str(h.get("esn_angle") or h.get("esnAngle") or "").strip(),
            "offer": "Industrialisation de l'apprentissage automatique",
            "urgency": str(h.get("confidence") or h.get("certainty") or "").strip(),
        }
    challenges = [c for c in (material.raw_analysis.get("it_challenges") or []) if isinstance(c, dict)]
    if challenges:
        c = challenges[0]
        return {
            "label": str(c.get("title") or c.get("challenge") or "").strip(),
            "kind": "défi IT",
            "detail": str(c.get("description") or c.get("detail") or "").strip(),
            "offer": "Exploitation de plateforme et observabilité",
            "urgency": str(c.get("severity") or "").strip(),
        }
    return {}


def _mission_from(material: Material) -> dict[str, Any]:
    """La mission visée par la réécriture de CV — dérivée du même dossier."""
    need = _need_from(material)
    return {
        "label": need.get("label", ""),
        "detail": need.get("detail", ""),
        "offer": "Exploitation de plateforme et observabilité",
        "sector": str(material.raw_analysis.get("sector") or ""),
        "zone": "IDF",
    }


def _need_play_contacts(material: Material) -> list[dict[str, Any]]:
    """Les personnes du dossier, dans le vocabulaire de ``bellum_need_play``.

    ⚠️ Le mot ``role`` désigne deux choses selon le prompt : chez
    ``bellum_contacts`` c'est le rôle de DÉCISION (« champion », « sponsor »),
    chez ``bellum_need_play`` c'est la FONCTION (« DSI »). On mappe donc
    ``title`` → ``role`` et ``entity`` → ``scope``. Recopier ``role`` tel quel
    aurait donné une liste de cibles dont la « fonction » serait « champion ».
    """
    return [
        {
            "full_name": str(c.get("full_name") or ""),
            "role": str(c.get("title") or ""),
            "scope": str(c.get("entity") or ""),
        }
        for c in material.contacts
        if str(c.get("full_name") or "").strip()
    ]


def _battlecard_contacts(material: Material) -> list[dict[str, Any]]:
    """Les contacts dans la forme que le routeur ``battlecard`` sélectionne
    (``full_name, title, decision_role, linkedin_url, account_id``)."""
    return [
        {
            "full_name": str(c.get("full_name") or ""),
            "title": str(c.get("title") or ""),
            "decision_role": str(c.get("role") or ""),
            "linkedin_url": c.get("linkedin_url") or None,
            "account_id": None,
        }
        for c in material.contacts
    ]


# ── les quatre entrées ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Case:
    """Une entrée du corpus : le prompt, ses deux textes, son plafond de prod."""

    prompt_name: str
    case: str
    system: str
    user: str
    #: Le plafond que le ROUTEUR envoie en production — l'identité de l'entrée.
    production_max_tokens: int

    @property
    def record_id(self) -> str:
        return compute_record_id(
            prompt_name=self.prompt_name,
            system=self.system,
            user=self.user,
            response_model=RESPONSE_MODEL_DICT,
            max_tokens=self.production_max_tokens,
        )


def build_cases(material: Material) -> list[Case]:
    """Les quatre entrées, construites par les modules de prompt du dépôt."""
    cases: list[Case] = []

    # ── bellum_cv — routeur app/routers/cv.py:52 (max_tokens=3000) ────────────
    cases.append(
        Case(
            prompt_name="bellum_cv",
            case="consultant-demo",
            system=bellum_cv.build_system_prompt(),
            user=bellum_cv.build_user_prompt(DEMO_CONSULTANT, _mission_from(material)),
            production_max_tokens=3000,
        )
    )

    # ── bellum_need_play — routeur app/routers/need_play.py:51 (2500) ─────────
    account = {
        "company_name": ACCOUNT_NAME,
        "sector": str(material.raw_analysis.get("sector") or ""),
        "signals": [s for s in (material.raw_analysis.get("recent_signals") or []) if isinstance(s, dict)],
        "context": str(material.raw_analysis.get("it_implications_for_esn") or "")
        + "\n"
        + str(material.raw_analysis.get("concrete_activity") or ""),
        "vocabulary": material.raw_analysis.get("program_names") or [],
    }
    cases.append(
        Case(
            prompt_name="bellum_need_play",
            case=GOLDEN_CASE,
            system=bellum_need_play.build_system_prompt(),
            user=bellum_need_play.build_user_prompt(
                _need_from(material), account, ESN_PROFILE, _need_play_contacts(material)
            ),
            production_max_tokens=2500,
        )
    )

    # ── bellum_battlecard — routeur app/routers/battlecard.py:70 (3000) ───────
    cases.append(
        Case(
            prompt_name="bellum_battlecard",
            case=GOLDEN_CASE,
            system=bellum_battlecard.build_system_prompt(ESN_PROFILE),
            user=bellum_battlecard.build_user_prompt(
                raw_analysis=material.raw_analysis,
                contacts=_battlecard_contacts(material),
                profile=ESN_PROFILE,
                company_name=ACCOUNT_NAME,
                competitors=material.competitors,
            ),
            production_max_tokens=3000,
        )
    )

    # ── bellum_compare — routeur app/routers/compare.py:78 (3000) ─────────────
    analyses: list[dict[str, Any]] = [
        {
            "company_name": ACCOUNT_NAME,
            "priority_score": material.raw_analysis.get("priority_score"),
            "status": "analysed",
            "raw_analysis": material.raw_analysis,
        }
    ]
    if (second := _societe_generale_analysis()) is not None:
        analyses.append(second)
    cases.append(
        Case(
            prompt_name="bellum_compare",
            case="+".join(str(a["company_name"]) for a in analyses),
            system=bellum_compare.build_system_prompt(ESN_PROFILE),
            user=bellum_compare.build_user_prompt(analyses=analyses, profile=ESN_PROFILE),
            production_max_tokens=3000,
        )
    )
    return cases


# ── les deux appels directs ───────────────────────────────────────────────────


@dataclass(frozen=True)
class Draw:
    """Un tirage : ce qu'il a rendu, ou pourquoi il a échoué."""

    model: str
    status: str
    latency_s: float
    #: Le RELIQUAT non caché, comme partout ailleurs dans le dépôt
    #: (``llm_gateway._usage_from_openai``).
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    #: ⚠️ Ce que le magasin ne sait PAS porter, et qui change la lecture du coût.
    #: Trois tirages du même prompt sont trois prompts IDENTIQUES : OpenAI les
    #: met en cache tout seul, et le deuxième ne facture plus que le reliquat
    #: (mesuré : 2 671 jetons au 1ᵉʳ tirage, 131 aux suivants, le reste à
    #: 0,02 $/M au lieu de 0,20). En production, deux appels consécutifs portent
    #: DEUX comptes différents et ne partagent presque rien. Le coût moyen d'un
    #: bras est donc un PLANCHER, pas une facture — le rapport doit le dire, et
    #: c'est pour ça que cette colonne existe.
    cached_tokens: int = 0
    output: dict[str, Any] | None = None
    error: str = ""

    @property
    def ok(self) -> bool:
        return self.status == STATUS_OK


def _unwrap(payload: Any) -> tuple[dict[str, Any] | None, str]:
    """``{"data": {...}}`` → le dict intérieur. Sinon ``(None, pourquoi)``.

    Une sortie qui n'a pas la forme attendue est un ``schema_error``, pas un
    objet vide : les confondre ferait noter « 0 » une réponse qu'on n'a pas su
    lire, ce que la doctrine interdit.

    ⚠️ ``coerce_serialized_object`` n'est PAS une commodité : c'est la
    différence entre mesurer un modèle et mesurer son lecteur. Première version
    de ce banc, 29/08/2026 : deux tirages Sonnet sur douze ont été comptés
    ``schema_error`` parce que le modèle avait rendu ``data`` en CHAÎNE JSON
    (``'{"company_activity": …}'``) au lieu d'un objet. Le contenu était juste ;
    seule sa mise en forme variait. La production, elle, l'accepte depuis le
    10/08/2026 — ``claude_service._call_dict`` pose exactement ce validateur sur
    son enveloppe, après l'avoir vu sur un run réel. Un banc plus sévère que la
    production ne mesure plus la production : il compte des fautes qui n'en sont
    pas, et il les compte du seul côté qui a la manie. On réutilise donc la
    primitive du dépôt plutôt que d'en écrire une seconde.
    """
    if not isinstance(payload, dict):
        return None, f"réponse hors enveloppe ({type(payload).__name__})"
    data = claude_service.coerce_serialized_object(payload.get("data", payload))
    if not isinstance(data, dict):
        return None, f"le champ `data` n'est pas un objet ({type(data).__name__})"
    return data, ""


async def draw_anthropic(case: Case, model: str, *, timeout: float) -> Draw:
    """Un tirage Anthropic — appel d'outil DIRECT, sans ``instructor``."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=timeout)
    started = time.perf_counter()
    try:
        resp = await client.messages.create(
            model=model,
            max_tokens=BENCH_MAX_TOKENS,
            system=case.system + claude_service.DICT_ENVELOPE_INSTRUCTION,
            messages=[{"role": "user", "content": case.user}],
            tools=[
                {"name": _TOOL_NAME, "description": _TOOL_DESCRIPTION, "input_schema": _TOOL_SCHEMA}
            ],
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
    # ⚠️ Ce banc ne pose PAS de ``cache_control`` sur le system prompt, là où la
    # production le fait (``claude_service._cached_system``). Le coût Anthropic
    # mesuré ici est donc un PLAFOND par rapport à la production — dans l'autre
    # sens que le cache automatique d'OpenAI. Les deux biais sont nommés ; aucun
    # n'est corrigé en silence.
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
    data, why = _unwrap(block.input)
    if data is None:
        return Draw(
            model=model, status=STATUS_SCHEMA_ERROR, latency_s=latency,
            input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached, error=why,
        )
    return Draw(
        model=model, status=STATUS_OK, latency_s=latency,
        input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached, output=data,
    )


async def draw_openai(case: Case, model: str, *, timeout: float, effort: str = "medium") -> Draw:
    """Un tirage OpenAI — ``/v1/responses``, raisonnement ALLUMÉ.

    C'est le point qui distingue ce banc de la passerelle : celle-ci joint
    ``reasoning_effort='none'`` dès qu'il y a des outils
    (``llm_gateway._openai_tools_reasoning_kwargs``), parce qu'``instructor``
    1.7.9 n'a pas de mode Responses. Mesurer un modèle de raisonnement avec le
    raisonnement éteint ne mesure pas le modèle.
    """
    import openai

    client = openai.AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=timeout)
    started = time.perf_counter()
    try:
        resp = await client.responses.create(
            model=model,
            instructions=case.system + claude_service.DICT_ENVELOPE_INSTRUCTION,
            input=case.user,
            max_output_tokens=BENCH_MAX_TOKENS,
            reasoning={"effort": effort},
            tools=[
                {
                    "type": "function",
                    "name": _TOOL_NAME,
                    "description": _TOOL_DESCRIPTION,
                    "parameters": _TOOL_SCHEMA,
                }
            ],
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
            latency_s=latency, input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached,
            error=f"réponse incomplète ({reason or 'raison non donnée'}) à {BENCH_MAX_TOKENS} jetons",
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
    data, why = _unwrap(payload)
    if data is None:
        return Draw(
            model=model, status=STATUS_SCHEMA_ERROR, latency_s=latency,
            input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost, cached_tokens=cached, error=why,
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
        response_model=RESPONSE_MODEL_DICT,
        max_tokens=case.production_max_tokens,
        max_retries=claude_service.DEFAULT_MAX_RETRIES,
        model_requested=SONNET_MODEL,
        arm=ARM_RECORDED if store_entry else arm,
        model=draw.model,
        provider="anthropic" if arm == ARM_SONNET else "openai",
        status=draw.status,
        error=draw.error,
        latency_s=draw.latency_s,
        input_tokens=draw.input_tokens,
        output_tokens=draw.output_tokens,
        cost_usd=draw.cost_usd,
        output=draw.output,
    )


# ── la mesure ─────────────────────────────────────────────────────────────────


@dataclass
class ArmResult:
    """Les tirages d'un bras sur un prompt, et ce qu'ils ont donné."""

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
        """Les jetons d'entrée que le fournisseur a servis DE SON CACHE.

        Non nul ⇒ le coût moyen du bras est un plancher : trois tirages du même
        prompt ne se paient pas comme trois comptes différents."""
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
    effort: str = "medium",
    write_entry: bool = True,
) -> dict[str, dict[str, ArmResult]]:
    """Tire, note, et écrit chaque tirage dans le magasin au fil de l'eau.

    ``write_entry=False`` sur un COMPLÉMENT : l'entrée du corpus existe déjà, la
    réécrire ferait croire à deux captures là où il n'y a qu'une campagne.
    """
    results: dict[str, dict[str, ArmResult]] = {}
    for case in cases:
        fn = rubric_for(case.prompt_name)
        per_arm: dict[str, ArmResult] = {}
        for arm in arms:
            model = SONNET_MODEL if arm == ARM_SONNET else LUNA_MODEL
            # ⚠️ Le bras porte l'EFFORT dans son nom dès qu'il n'est pas celui
            # de la campagne d'origine. Sans ça, une campagne `--effort none` et
            # une campagne `medium` s'écrivent sous le même bras et la moyenne
            # mélange deux modèles de fait — le défaut déjà payé sur le bras
            # `recorded`, qui contenait une capture vide et écrasait la mesure.
            arm_label = arm if (arm == ARM_SONNET or effort == "medium") else f"{arm}-{effort}"
            res = ArmResult(arm=arm_label, model=model)
            for i in range(draws):
                print(f"  · {case.prompt_name} · {arm} · tirage {i + 1}/{draws}…", flush=True)
                draw = (
                    await draw_anthropic(case, model, timeout=timeout)
                    if arm == ARM_SONNET
                    else await draw_openai(case, model, timeout=timeout, effort=effort)
                )
                res.draws.append(draw)
                # L'entrée du corpus est écrite UNE fois, au premier tirage du
                # bras de PRODUCTION (Sonnet) : c'est elle qui manquait, et
                # c'est elle qu'un `replay` ultérieur rejouera. Le même tirage
                # est ensuite écrit sous son bras, pour que les deux bras aient
                # le même nombre de lignes appariables.
                if write_entry and arm == ARM_SONNET and i == 0:
                    append_call(store, _record(case, draw, arm=arm_label, store_entry=True))
                append_call(store, _record(case, draw, arm=arm_label, store_entry=False))
                if draw.ok and fn is not None and draw.output is not None:
                    res.rubrics.append(fn(draw.output, user_prompt=case.user))
            per_arm[arm_label] = res
        results[case.prompt_name] = per_arm
    return results


# ── le rendu ──────────────────────────────────────────────────────────────────


def _fmt(value: float | None, spec: str = ".2f") -> str:
    return "non mesuré" if value is None else format(value, spec)


def report(cases: list[Case], results: dict[str, dict[str, ArmResult]]) -> None:
    for case in cases:
        per_arm = results.get(case.prompt_name) or {}
        print()
        print(f"═══ {case.prompt_name} · cas « {case.case} » ═══")
        print(f"{'bras':<20} {'médiane':>9} {'min':>7} {'max':>7} {'n':>3} {'coût moyen $':>13} "
              f"{'jetons en cache':>16}")
        for arm, res in per_arm.items():
            totals = res.totals
            med = round(statistics.median(totals), 2) if totals else None
            print(
                f"{arm:<20} {_fmt(med):>9} {_fmt(min(totals) if totals else None):>7} "
                f"{_fmt(max(totals) if totals else None):>7} {len(totals):>3} "
                f"{_fmt(res.cost_mean(), '.6f'):>13} {res.cached_total():>16}"
            )
            for d in res.failures:
                print(f"    ✗ ÉCHEC ({d.status}) : {d.error[:180]}")
            if res.cached_total():
                print("    ⓘ coût moyen = PLANCHER : le fournisseur a servi une partie de l'entrée "
                      "depuis son cache (tirages identiques). En production, deux appels portent "
                      "deux comptes différents.")
        arms = list(per_arm)
        if len(arms) == 2:
            a, b = (per_arm[arms[0]].axis_means(), per_arm[arms[1]].axis_means())
            print(f"  {'axe':<28} {arms[0]:>16} {arms[1]:>16} {'écart':>9}")
            for name in sorted(set(a) | set(b)):
                va, vb = a.get(name), b.get(name)
                delta = None if (va is None or vb is None) else round(vb - va, 4)
                print(f"  {name:<28} {_fmt(va, '.3f'):>16} {_fmt(vb, '.3f'):>16} {_fmt(delta, '+.3f'):>9}")
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
        prog="python -m app.eval.bench.livrables",
        description="Banc Sonnet vs Luna sur les quatre prompts de LIVRABLE. APPELS PAYANTS.",
    )
    p.add_argument("--store", default="evals-out/model-bench.jsonl")
    p.add_argument("--draws", type=int, default=3, help="Tirages par modèle et par prompt (défaut 3).")
    p.add_argument("--timeout", type=float, default=300.0)
    p.add_argument("--prompt", action="append", default=None, help="Restreindre à un prompt (répétable).")
    p.add_argument(
        "--arm", action="append", default=None,
        choices=(ARM_SONNET, ARM_LUNA),
        help="Restreindre à un bras (répétable) — pour compléter des tirages manquants sans "
             "re-payer ceux qui ont abouti.",
    )
    p.add_argument(
        "--effort",
        default="medium",
        choices=("none", "low", "medium", "high"),
        help=(
            "Effort de raisonnement du bras OpenAI. ⚠️ La PRODUCTION vaut `none` : "
            "`llm_gateway._openai_tools_reasoning_kwargs` joint `reasoning_effort='none'` "
            "dès qu'il y a des outils. Mesurer en `medium` répond à « Luna peut-elle ? », "
            "pas à « que rendrait la passerelle d'aujourd'hui ? »."
        ),
    )
    p.add_argument("--dry-run", action="store_true", help="Construit les entrées, n'appelle rien.")
    p.add_argument("--yes-run-live", action="store_true", help="Confirme les appels RÉELS et PAYANTS.")
    args = p.parse_args(argv)

    store = Path(args.store)
    rows = load_calls(store)
    if not rows:
        print(f"Corpus vide ({store}).", file=sys.stderr)
        return 2

    material = build_material(rows)
    cases = build_cases(material)
    if args.prompt:
        cases = [c for c in cases if c.prompt_name in set(args.prompt)]

    print(f"Matière : {len(material.contacts)} contact(s), {len(material.competitors)} concurrent(s), "
          f"{len(json.dumps(material.raw_analysis, ensure_ascii=False))} caractères d'analyse.")
    for note in material.missing:
        print(f"  ⚠️ {note}")
    for c in cases:
        print(f"  · {c.prompt_name:<20} système {len(c.system):>6} car · utilisateur {len(c.user):>7} car "
              f"· plafond prod {c.production_max_tokens} · barème "
              f"{'oui' if rubric_for(c.prompt_name) else 'AUCUN'} · id {c.record_id[:12]}")
    print(f"Clés présentes : ANTHROPIC_API_KEY={'oui' if os.getenv('ANTHROPIC_API_KEY') else 'NON'} · "
          f"OPENAI_API_KEY={'oui' if os.getenv('OPENAI_API_KEY') else 'NON'}")

    if args.dry_run:
        return 0
    if not args.yes_run_live:
        print("\nAppels RÉELS et PAYANTS. Relancer avec --yes-run-live pour confirmer.", file=sys.stderr)
        return 1

    # ⚠️ Le bras `recorded` n'est écrit qu'au premier tirage Sonnet d'un `case`.
    # Un complément (`--arm`) ne le réécrit donc pas : le corpus garde l'entrée
    # de la campagne d'origine, avec l'observation qu'elle a réellement eue.
    arms = args.arm or [ARM_SONNET, ARM_LUNA]
    results = asyncio.run(measure(
        cases, store, draws=args.draws, timeout=args.timeout, arms=arms, effort=args.effort,
        write_entry=not (args.arm or args.prompt),
    ))
    report(cases, results)
    total = sum(d.cost_usd for per in results.values() for r in per.values() for d in r.draws)
    print(f"\nCoût total MESURÉ : ${total:.4f}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
