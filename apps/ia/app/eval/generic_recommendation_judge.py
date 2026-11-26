"""#3223 (décision Louis 11/10/2026) — LE JUGE « RECOMMANDATION GÉNÉRIQUE », ÉVALUÉ.

─────────────────────────────────────────────────────────────────────────────
POURQUOI UN JUGE, ET POURQUOI IL N'EST PAS CRU SUR PAROLE
─────────────────────────────────────────────────────────────────────────────
Le taux de « recommandations génériques » du tableau de pilotage
(`apps/api/src/modules/analytics/reasoning-quality.ts`) restait NOMMÉ sans
détecteur : aucune règle déterministe ne dit qu'une réponse « pourrait être
envoyée à n'importe quelle ESN ou n'importe quel compte » (#1925), et en deviner
une par mots-clés aurait fabriqué une mesure. Décision Louis du 11/10 : un
DÉTECTEUR ÉVALUÉ — un juge IA (Claude, le modèle de raisonnement du dépôt,
`model_policy.REASONING`) sur un ÉCHANTILLON de réponses de Laura, avec :

* un JEU ÉTIQUETÉ de référence, versionné
  (`fixtures/generic_recommendation_labels.json`, sa version est l'empreinte
  du fichier) ;
* un TAUX D'ACCORD mesuré du juge contre ces étiquettes
  (`python -m app.eval.generic_recommendation_judge --calibrate`), écrit dans
  `packages/contracts/src/schemas/generic-recommendation-judge.ts` ;
* un SEUIL ÉCRIT (`GENERIC_JUDGE_AGREEMENT_THRESHOLD_PERCENT`, même fichier) :
  tant que l'accord ne l'atteint pas, la mesure s'affiche « non fiable »,
  jamais un chiffre nu.

La calibration est liée à une VERSION DU JUGE (empreinte du modèle et de la
consigne) et à une VERSION DU JEU : changer l'un ou l'autre sans re-mesurer
fait échouer `tests/test_generic_recommendation_judge.py` — un accord mesuré
sur un autre juge ne dit rien de celui-ci.

─────────────────────────────────────────────────────────────────────────────
CE QUE LE JUGE VOIT, ET CE QUI EN SORT
─────────────────────────────────────────────────────────────────────────────
La RÉPONSE de Laura seule, jamais la question du commercial ni aucun autre
message — la même forme en calibration et en production, sinon l'accord
mesuré ne vaudrait pas pour la production. Il en sort UN jeton fermé
(:data:`VERDICTS`) ; aucun texte, aucun motif libre n'est rendu ni journalisé.

─────────────────────────────────────────────────────────────────────────────
COÛT BORNÉ, ET LE RÉGLAGE QUI L'ALLUME
─────────────────────────────────────────────────────────────────────────────
Le juge de production ne court QUE si `CHAT_PROD_SAMPLING_ENABLED` est allumé
(`chat_prod_sampling.is_prod_sampling_enabled`) : éteint, la route rend
`disabled` avant toute lecture ou tout appel réseau. Le nombre de réponses
jugées par jour est l'UNIQUE réglage de coût, côté API
(`REASONING_JUDGE_DAILY_SAMPLE`, `reasoning-judge-sampling.service.ts`) ; ce
module ajoute seulement un plafond DUR par appel (:data:`MAX_BATCH`), qui
n'est pas un réglage.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

logger = logging.getLogger(__name__)

PROMPT_NAME = "bellum_generic_recommendation_judge"

VERDICT_GENERIC = "generique"
VERDICT_SPECIFIC = "specifique"
VERDICT_NONE = "sans_recommandation"
#: MIROIR de `GENERIC_JUDGE_VERDICTS` (packages/contracts) — comparé par le test.
VERDICTS: tuple[str, ...] = (VERDICT_GENERIC, VERDICT_SPECIFIC, VERDICT_NONE)

#: Plafond DUR d'un appel de la route — un garde-fou, pas un réglage : le
#: nombre quotidien vit côté API, à un seul endroit.
MAX_BATCH = 50
#: Une réponse plus longue est coupée : au-delà, le juge paie des jetons sans
#: que le verdict change (une recommandation se lit dans ses premiers écrans).
MAX_ANSWER_CHARS = 6000
#: Appels simultanés au modèle pendant un lot.
_CONCURRENCY = 4
_MAX_TOKENS = 200

LABELS_PATH = Path(__file__).resolve().parent / "fixtures" / "generic_recommendation_labels.json"


def calibration_ts_path() -> Path:
    """Le fichier qui porte la calibration (et le seuil) — relu par l'API.

    Une fonction, pas une constante : `packages/contracts` n'est pas dans l'image
    déployée du service IA (voir `market_memory_angle.py`) ; seuls la CLI et les
    tests, lancés depuis le dépôt, le lisent."""
    return (
        Path(__file__).resolve().parents[4]
        / "packages"
        / "contracts"
        / "src"
        / "schemas"
        / "generic-recommendation-judge.ts"
    )


_BLOCK_START = "// <generic-judge-calibration>"
_BLOCK_END = "// </generic-judge-calibration>"

_SYSTEM = (
    "Tu évalues UNE réponse d'un copilote commercial pour une ESN (société de services numériques). "
    "Classe-la dans exactement une catégorie :\n"
    "- generique : la réponse recommande quelque chose (une action, un angle, un message, un plan), "
    "mais cette recommandation pourrait être envoyée telle quelle à n'importe quelle ESN ou pour "
    "n'importe quel compte — aucun élément propre au compte, à l'ESN ou au commercial ne la fonde "
    "(conseils de méthode universels, formules toutes faites, gabarit sans fait précis).\n"
    "- specifique : la recommandation s'appuie sur au moins DEUX éléments propres à ce compte, "
    "cette ESN ou ce commercial : une personne nommée, une entité ou un site précis, un signal daté, "
    "une référence client de l'ESN, un consultant disponible, une voie d'accès, une contrainte connue, "
    "un territoire, un objectif déclaré.\n"
    "- sans_recommandation : la réponse ne recommande rien (une liste, un fait, un chiffre, une "
    "salutation, une absence de donnée dite honnêtement).\n"
    "Tu ne juges ni le style, ni la longueur, ni la véracité des faits. Rends uniquement la catégorie."
)


class _JudgeOutput(BaseModel):
    verdict: Literal["generique", "specifique", "sans_recommandation"]


def judge_model() -> str:
    """Le modèle du juge — une ligne de `model_policy.PROMPT_MODELS` (GA-26)."""
    from app.services.model_policy import model_for

    return model_for(PROMPT_NAME)


def judge_version(model: str | None = None) -> str:
    """L'empreinte du juge : modèle + consigne. Une calibration n'est valable
    que pour cette empreinte — un autre modèle ou une autre consigne est un
    autre juge."""
    resolved = model if model is not None else judge_model()
    return hashlib.sha256(f"{resolved}\n{_SYSTEM}".encode()).hexdigest()[:12]


@dataclass(frozen=True)
class LabelledCase:
    id: str
    answer: str
    label: str


def load_label_set(path: Path = LABELS_PATH) -> list[LabelledCase]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [LabelledCase(id=c["id"], answer=c["answer"], label=c["label"]) for c in data["cases"]]


def label_set_version(path: Path = LABELS_PATH) -> str:
    """L'empreinte du jeu étiqueté : toute modification la change."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def _user_prompt(answer: str) -> str:
    return f"Réponse du copilote à évaluer :\n<<<\n{answer[:MAX_ANSWER_CHARS]}\n>>>"


async def judge_answer(answer: str, *, model: str | None = None) -> str | None:
    """Le verdict du juge sur UNE réponse, ou ``None`` s'il n'a pas pu juger.

    ``None`` n'est jamais converti en un verdict : la réponse sort du
    dénominateur. Un échec ne journalise que la CLASSE de l'exception — le
    texte d'une erreur de fournisseur peut recopier la requête.
    """
    from app.services.claude_service import call_claude

    try:
        result, _usage = await call_claude(
            _SYSTEM,
            _user_prompt(answer),
            response_model=_JudgeOutput,
            max_tokens=_MAX_TOKENS,
            model=model if model is not None else judge_model(),
            prompt_name=PROMPT_NAME,
        )
    except Exception as exc:  # noqa: BLE001 — un verdict manqué sort du dénominateur
        logger.error("Juge « recommandation générique » : réponse non jugée (%s)", type(exc).__name__)
        return None
    verdict = getattr(result, "verdict", None)
    return verdict if verdict in VERDICTS else None


JudgeFn = Callable[[str], Awaitable[str | None]]


async def judge_many(answers: Sequence[str], judge: JudgeFn | None = None) -> list[str | None]:
    """Juge un lot, au plus :data:`_CONCURRENCY` appels à la fois, dans l'ordre."""
    run = judge or judge_answer
    gate = asyncio.Semaphore(_CONCURRENCY)

    async def one(answer: str) -> str | None:
        async with gate:
            return await run(answer)

    return list(await asyncio.gather(*(one(answer) for answer in answers)))


@dataclass(frozen=True)
class Agreement:
    """L'accord du juge avec le jeu étiqueté. ``failed`` : cas non jugés —
    une calibration incomplète n'est pas une calibration."""

    agreed: int
    judged: int
    failed: int


def measure_agreement(cases: Sequence[LabelledCase], verdicts: Mapping[str, str | None]) -> Agreement:
    agreed = judged = failed = 0
    for case in cases:
        verdict = verdicts.get(case.id)
        if verdict is None:
            failed += 1
            continue
        judged += 1
        if verdict == case.label:
            agreed += 1
    return Agreement(agreed=agreed, judged=judged, failed=failed)


def render_calibration_block(
    *, agreement: Agreement | None, model: str, measured_at: str | None, cases: int, judge: str, labels: str
) -> str:
    """Le bloc TypeScript écrit entre les deux marqueurs du fichier de contrat."""
    if agreement is None:
        measurement = "null"
    else:
        measurement = (
            "{\n"
            f"    agreed: {agreement.agreed},\n"
            f"    judged: {agreement.judged},\n"
            f"    failed: {agreement.failed},\n"
            f"    measuredAt: '{measured_at}',\n"
            f"    model: '{model}',\n"
            "  }"
        )
    return (
        f"{_BLOCK_START}\n"
        "export const GENERIC_JUDGE_CALIBRATION: GenericJudgeCalibration = {\n"
        f"  judgeVersion: '{judge}',\n"
        f"  labelSetVersion: '{labels}',\n"
        f"  labelledCases: {cases},\n"
        f"  measurement: {measurement},\n"
        "}\n"
        f"{_BLOCK_END}"
    )


def write_calibration(block: str, path: Path | None = None) -> None:
    """Remplace le bloc entre les marqueurs ; refuse un fichier sans marqueurs."""
    path = path or calibration_ts_path()
    source = path.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(_BLOCK_START) + r".*?" + re.escape(_BLOCK_END), re.DOTALL)
    if not pattern.search(source):
        raise ValueError(f"marqueurs de calibration absents de {path}")
    path.write_text(pattern.sub(lambda _m: block, source, count=1), encoding="utf-8")


async def calibrate(judge: JudgeFn | None = None) -> Agreement:
    """Fait juger TOUT le jeu étiqueté et rend l'accord. Payant : ~un appel par cas."""
    cases = load_label_set()
    verdicts = await judge_many([case.answer for case in cases], judge)
    return measure_agreement(cases, {case.id: verdict for case, verdict in zip(cases, verdicts, strict=True)})


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--calibrate",
        action="store_true",
        help="mesurer l'accord du juge sur le jeu étiqueté (payant) et l'écrire dans le contrat",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="réaligner les versions du contrat sur le juge courant SANS mesure (« non fiable »)",
    )
    args = parser.parse_args(argv)
    cases = load_label_set()
    model = judge_model()
    common = {"model": model, "cases": len(cases), "judge": judge_version(model), "labels": label_set_version()}
    if args.reset:
        write_calibration(render_calibration_block(agreement=None, measured_at=None, **common))
        print("Calibration remise à « non mesurée ».")
        return 0
    if not args.calibrate:
        parser.print_help()
        return 2
    agreement = asyncio.run(calibrate())
    measured_at = datetime.now(UTC).date().isoformat()
    write_calibration(render_calibration_block(agreement=agreement, measured_at=measured_at, **common))
    print(f"Accord : {agreement.agreed}/{agreement.judged} (non jugés : {agreement.failed}) — modèle {model}.")
    return 0


if __name__ == "__main__":  # pragma: no cover — point d'entrée CLI
    raise SystemExit(main())
