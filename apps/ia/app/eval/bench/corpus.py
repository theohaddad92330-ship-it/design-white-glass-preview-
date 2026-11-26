"""Le corpus d'entrées REJOUABLES du banc de comparaison de modèles.

Le manque que ce module comble
------------------------------
``raw_analysis``, les fixtures de ``tests/golden/`` et les enregistrements de
campagne (``app/eval/strategy/campaign.py``) sont tous des **SORTIES**. Nulle
part le dépôt ne conservait le couple ``(system prompt, user prompt)`` d'un
appel. Sans entrées identiques, comparer deux modèles revient à comparer deux
collectes : Brave n'a pas rendu les mêmes pages, Pappers n'a pas rendu la même
date, et l'écart mesuré n'est pas celui du modèle.

Ce que ce module conserve
-------------------------
Le **strict nécessaire pour rejouer un appel** : ``prompt_name``, la tâche
routée, le system, le user, le nom du ``response_model``, ``max_tokens``,
``max_retries``, et le modèle demandé au moment de la capture.

Une seule journalisation, deux usages
-------------------------------------
Le magasin est un JSONL **append-only**, une ligne par appel observé, flushée
immédiatement (même discipline que la campagne : un run payant ne se re-paie
pas après un ``Ctrl-C``). Une ligne porte à la fois l'ENTRÉE (rejouable) et
l'OBSERVATION du bras qui l'a produite :

* ``arm == "recorded"`` — la ligne de capture initiale. C'est elle qui définit
  le corpus.
* ``arm == "<nom du bras>"`` — un REJEU de la même entrée sur un autre modèle.

L'appariement entre deux bras se fait sur ``record_id``, qui est le condensé de
l'ENTRÉE seule : le modèle n'y entre pas, donc la même entrée rejouée sur cinq
modèles porte cinq lignes et un seul ``record_id``.

Une donnée de fichier n'est pas du code
---------------------------------------
``response_model`` est stocké sous la forme ``module:classe``. Le résoudre
suppose un import, et un import dont le nom vient d'un fichier de données est
une exécution de code écrite par le fichier. La résolution passe donc par une
liste blanche de modules (``ALLOWED_RESPONSE_MODEL_MODULES``) et refuse tout le
reste — bruyamment.

⚠️ **Vie privée.** Les prompts capturés contiennent les données réelles
collectées sur des entreprises réelles, et — pour ``bellum_contacts`` /
``bellum_organigramme`` — des NOMS DE PERSONNES et leurs fonctions. Le magasin
vit sous ``evals-out/``, qui est **gitignoré** (`.gitignore:172`). Ne pas le
committer sans décision explicite : voir ``agent_docs/banc-modeles.md``.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import logging
import time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Le bras de la capture initiale : l'entrée telle qu'elle est PARTIE en production.
ARM_RECORDED = "recorded"

STATUS_OK = "ok"
#: La sortie n'a pas validé le ``response_model`` — le risque n°1 d'un changement
#: de fournisseur, et la raison d'être de la 4ᵉ colonne du banc.
STATUS_SCHEMA_ERROR = "schema_error"
#: La génération a heurté son plafond. Ce n'est PAS un défaut de schéma : c'est un
#: réglage trop bas. Les confondre ferait accuser un modèle d'un défaut de config.
STATUS_TRUNCATED = "truncated"
#: Tout le reste (réseau, 429, indisponibilité).
STATUS_ERROR = "error"

#: ``response_model=None`` → texte brut.
RESPONSE_MODEL_TEXT = ""
#: ``response_model=dict`` → JSON libre.
RESPONSE_MODEL_DICT = "dict"

#: Les seuls modules dont le corpus peut faire importer une classe.
ALLOWED_RESPONSE_MODEL_MODULES: tuple[str, ...] = ("app.models.", "app.routers.", "app.agents.")


# ── nommer et re-résoudre un response_model ───────────────────────────────────


def describe_response_model(response_model: Any) -> str:
    """``ResearchStrategy`` → ``"app.models.outputs.research:ResearchStrategy"``."""
    if response_model is None:
        return RESPONSE_MODEL_TEXT
    if response_model is dict:
        return RESPONSE_MODEL_DICT
    module = getattr(response_model, "__module__", "")
    name = getattr(response_model, "__qualname__", None) or getattr(response_model, "__name__", "")
    return f"{module}:{name}" if module and name else str(response_model)


def resolve_response_model(name: str) -> Any:
    """L'inverse de :func:`describe_response_model`, sous liste blanche.

    Refuse un module hors périmètre plutôt que de l'importer : le corpus est une
    DONNÉE, et importer ce qu'une donnée nomme, c'est exécuter ce qu'elle veut.
    """
    raw = (name or "").strip()
    if raw == RESPONSE_MODEL_TEXT:
        return None
    if raw == RESPONSE_MODEL_DICT:
        return dict
    if ":" not in raw:
        raise ValueError(f"response_model illisible : {name!r} (attendu ``module:Classe``)")
    module_name, _, attr = raw.partition(":")
    if not any(module_name.startswith(p) or module_name == p.rstrip(".") for p in ALLOWED_RESPONSE_MODEL_MODULES):
        raise ValueError(
            f"response_model hors périmètre : {module_name!r} n'est pas dans "
            f"ALLOWED_RESPONSE_MODEL_MODULES ({', '.join(ALLOWED_RESPONSE_MODEL_MODULES)})"
        )
    module = importlib.import_module(module_name)
    target: Any = module
    for part in attr.split("."):
        target = getattr(target, part)
    return target


# ── l'identité d'une entrée ───────────────────────────────────────────────────


def compute_record_id(
    *, prompt_name: str, system: str, user: str, response_model: str, max_tokens: int
) -> str:
    """Le condensé de l'ENTRÉE — le modèle n'y entre pas, exprès.

    C'est ce qui permet d'apparier N bras sur la même entrée, exactement comme la
    campagne apparie compte par compte. Un octet de différence dans le user prompt
    donne un autre identifiant : deux collectes différentes ne s'apparient jamais
    par accident.
    """
    blob = "\x00".join([prompt_name, system, user, response_model, str(max_tokens)])
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:32]


# ── l'enregistrement ──────────────────────────────────────────────────────────


@dataclass
class CallRecord:
    """Un appel LLM : son entrée rejouable, et ce que le bras en a fait."""

    record_id: str
    corpus: str
    case: str
    prompt_name: str
    task: str
    system: str
    user: str
    response_model: str
    max_tokens: int
    max_retries: int
    model_requested: str
    # ── l'observation ─────────────────────────────────────────────────────────
    arm: str = ARM_RECORDED
    model: str = ""
    provider: str = ""
    status: str = STATUS_OK
    error: str = ""
    latency_s: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    #: La sortie, quand elle est sérialisable — pour re-noter gratuitement sans
    #: re-payer le run. ``None`` = non conservée, jamais « vide ».
    output: dict[str, Any] | None = None
    recorded_at: str = ""

    @property
    def ok(self) -> bool:
        return self.status == STATUS_OK

    @property
    def is_input_line(self) -> bool:
        """Cette ligne définit-elle une entrée du corpus (vs. une mesure de rejeu) ?"""
        return self.arm == ARM_RECORDED

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> CallRecord:
        known = {k: v for k, v in raw.items() if k in cls.__dataclass_fields__}
        return cls(**known)  # type: ignore[arg-type]


# ── le magasin ────────────────────────────────────────────────────────────────


def load_calls(path: Path) -> list[CallRecord]:
    """Lit un JSONL. Une dernière ligne tronquée (tuée en pleine écriture) est
    ignorée avec un log — pas une exception : le reste du corpus est bon."""
    if not path.exists():
        return []
    rows: list[CallRecord] = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(CallRecord.from_dict(json.loads(line)))
        except (json.JSONDecodeError, TypeError) as exc:
            logger.error("ligne illisible ignorée dans %s:%d — %s", path, i, exc)
    return rows


def append_call(path: Path, record: CallRecord) -> None:
    """Ajoute une ligne et flushe — c'est toute la sûreté au crash du banc."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if not record.recorded_at:
        record.recorded_at = time.strftime("%Y-%m-%dT%H:%M:%S")
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record.as_dict(), ensure_ascii=False) + "\n")
        fh.flush()


def corpus_inputs(records: Iterable[CallRecord]) -> list[CallRecord]:
    """Les entrées rejouables, dédupliquées, dans l'ordre de première capture.

    Ne retient que les lignes de CAPTURE : une ligne de rejeu porte la même
    entrée, la compter deux fois gonflerait le corpus sans rien ajouter.
    """
    seen: set[str] = set()
    out: list[CallRecord] = []
    for r in records:
        if not r.is_input_line or r.record_id in seen:
            continue
        seen.add(r.record_id)
        out.append(r)
    return out


def replayed_ok_ids(records: Iterable[CallRecord], arm: str) -> set[str]:
    """Les entrées déjà rejouées avec succès sur ce bras — la clé de reprise."""
    return {r.record_id for r in records if r.arm == arm and r.ok}


def arms_present(records: Iterable[CallRecord]) -> list[str]:
    return sorted({r.arm for r in records})


def cases_of(records: Iterable[CallRecord]) -> list[str]:
    return sorted({r.case for r in records if r.case})


@dataclass(frozen=True)
class CorpusStats:
    """Ce que le corpus contient — sans en révéler le contenu."""

    n_inputs: int
    n_lines: int
    cases: list[str] = field(default_factory=list)
    prompts: dict[str, int] = field(default_factory=dict)
    arms: list[str] = field(default_factory=list)
    input_chars: int = 0

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


def describe_corpus(records: Iterable[CallRecord]) -> CorpusStats:
    rows = list(records)
    inputs = corpus_inputs(rows)
    prompts: dict[str, int] = {}
    for r in inputs:
        prompts[r.prompt_name] = prompts.get(r.prompt_name, 0) + 1
    return CorpusStats(
        n_inputs=len(inputs),
        n_lines=len(rows),
        cases=cases_of(inputs),
        prompts=dict(sorted(prompts.items())),
        arms=arms_present(rows),
        input_chars=sum(len(r.system) + len(r.user) for r in inputs),
    )
