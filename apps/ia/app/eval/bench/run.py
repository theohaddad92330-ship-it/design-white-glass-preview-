"""Le banc de comparaison de modèles — la ligne de commande.

Quatre gestes, dans l'ordre :

    python -m app.eval.bench.run corpus                                   # gratuit
    python -m app.eval.bench.run record --company doctolib --yes-run-live # PAYANT
    python -m app.eval.bench.run replay --model claude-haiku-4-5 --yes-run-live
    python -m app.eval.bench.run replay --model openai:gpt-5.6-luna --yes-run-live
    python -m app.eval.bench.run compare --arm claude-haiku-4-5 \\
                                         --arm openai:gpt-5.6-luna \\
                                         --judge claude-sonnet-5
    python -m app.eval.bench.run cost --model claude-haiku-4-5 --model openai:gpt-5.6-luna

``record`` et ``replay`` sont les seules sous-commandes qui appellent le réseau,
et elles **refusent de démarrer sans ``--yes-run-live``**. Les autres sont
hermétiques et gratuites.

Doc : ``agent_docs/banc-modeles.md``.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import uuid
from pathlib import Path
from typing import Any

from app.eval.bench.compare import Comparison, compare_arms
from app.eval.bench.corpus import (
    ARM_RECORDED,
    CallRecord,
    corpus_inputs,
    describe_corpus,
    load_calls,
)
from app.eval.bench.cost import project_replay_cost
from app.eval.bench.judge import (
    JudgeConflictError,
    assert_judge_is_not_a_candidate,
    judge_records,
    resolve_judge,
)
from app.eval.bench.recorder import recording
from app.eval.bench.replay import replay_corpus
from app.eval.strategy.catalog import list_companies
from app.eval.strategy.variants import ModelSpec

logger = logging.getLogger(__name__)

#: Le corpus et ses mesures vivent hors du paquet — ce sont des MESURES, pas du
#: code — et sous ``evals-out/``, qui est gitignoré (`.gitignore:172`). Voir le
#: paragraphe « vie privée » de ``corpus.py`` avant d'envisager de le committer.
DEFAULT_STORE = Path("evals-out") / "model-bench.jsonl"


# ── affichage ─────────────────────────────────────────────────────────────────


def _fmt(value: float | None, spec: str, absent: str = "non mesuré") -> str:
    return absent if value is None else format(value, spec)


def _print_corpus(store: Path) -> None:
    stats = describe_corpus(load_calls(store))
    if not stats.n_inputs:
        print(f"\nAucune entrée enregistrée dans {store}.")
        print("  → `record --company <slug> --yes-run-live` en produit (run RÉEL, payant).")
        return
    print(f"\nCorpus {store} — {stats.n_inputs} entrée(s) rejouable(s), "
          f"{stats.n_lines} ligne(s) au total")
    print(f"  cas      : {', '.join(stats.cases) or '—'}")
    print(f"  bras     : {', '.join(stats.arms)}")
    print(f"  taille   : {stats.input_chars:,} caractères de prompt")
    print(f"\n  {'prompt':<34} entrées")
    print("  " + "─" * 44)
    for name, n in stats.prompts.items():
        print(f"  {name:<34} {n:>7}")
    print("\n⚠ Ces prompts contiennent les données réelles collectées sur des entreprises")
    print("  réelles, et pour bellum_contacts / bellum_organigramme des NOMS DE PERSONNES.")
    print("  Le magasin est gitignoré — ne pas le committer sans décision explicite.")


def _print_comparison(c: Comparison) -> None:
    print(f"\n═══ Banc de modèles — {' vs '.join(c.arms)} ═══")
    print(f"  corpus  : {c.corpus or '—'}   commit : {c.repo_commit or 'inconnu'}")
    print(f"  date    : {c.generated_at}")
    print(f"  cas     : {len(c.cases)} ({', '.join(c.cases) or '—'})")
    print(f"  entrées : {len(c.record_ids)} appariée(s)")
    print(f"  juge    : {c.judge or 'aucun'}" + ("  (consultatif)" if c.judge else ""))
    print()
    print(f"  {'bras':<24} {'modèle':<28} {'qualité':>10} {'coût $':>9} "
          f"{'latence s':>10} {'p95 s':>7} {'schéma':>12} {'juge':>7}")
    print("  " + "─" * 116)
    for col in c.columns:
        quality = _fmt(col.quality_mean, ".2f", "—")
        schema = f"{col.schema_ok}/{col.schema_attempted}"
        if col.schema_failures or col.truncations:
            schema += f" (✗{col.schema_failures}/⧗{col.truncations})"
        print(f"  {col.arm:<24} {col.model_label:<28} {quality:>10} {col.cost_usd_total:>9.4f} "
              f"{col.latency_mean_s:>10.2f} {col.latency_p95_s:>7.2f} {schema:>12} "
              f"{_fmt(col.judge_mean, '.2f', '—'):>7}")
    print()
    print("  Quatre colonnes, jamais fondues : un modèle 5× moins cher qui rate un")
    print("  organigramme sur trois n'est pas « moins bon de 12 % », il est inutilisable.")
    _print_quality_breakdown(c)
    for note in c.notes:
        print(f"     · {note}")


def _print_quality_breakdown(c: Comparison) -> None:
    """La qualité, DÉCOMPOSÉE — par poste puis par axe.

    « Un score n'est jamais nu » : la moyenne de la table ci-dessus mélange les
    barèmes, et c'est ici qu'on lit « il fait un meilleur organigramme ». Un axe
    non mesurable est écrit « non mesuré (n) », jamais 0.
    """
    prompts = sorted({p for col in c.columns for p in col.quality_by_prompt})
    axes = sorted({a for col in c.columns for a in col.quality_axes})
    unmeasured = sorted({a for col in c.columns for a in col.quality_axes_unmeasured})
    if not prompts and not axes and not unmeasured:
        return

    if prompts:
        print(f"\n  Qualité par prompt (/100) — {'  '.join(f'[{a}]' for a in c.arms)}")
        print("  " + "─" * 72)
        for prompt in prompts:
            cells = " ".join(
                f"{_fmt(col.quality_by_prompt.get(prompt), '.2f', 'non mesuré'):>12}"
                for col in c.columns
            )
            print(f"  {prompt:<34} {cells}")

    if axes or unmeasured:
        print(f"\n  Qualité par axe (part 0-1) — {'  '.join(f'[{a}]' for a in c.arms)}")
        print("  " + "─" * 72)
        for axis in axes:
            cells = " ".join(
                f"{_fmt(col.quality_axes.get(axis), '.3f', 'non mesuré'):>12}" for col in c.columns
            )
            print(f"  {axis:<34} {cells}")
        for axis in (a for a in unmeasured if a not in axes):
            n = " ".join(f"{('non mesuré ×' + str(col.quality_axes_unmeasured.get(axis, 0))):>12}"
                         for col in c.columns)
            print(f"  {axis:<34} {n}")


# ── sous-commandes ────────────────────────────────────────────────────────────


def _live_run(company_name: str, thread_prefix: str) -> Any:
    """Le VRAI pipeline pour un compte. Coûte de l'argent ; importé tardivement."""
    from app.graph.builder import run_analysis_graph

    async def _go() -> Any:
        return await run_analysis_graph(
            {"company_name": company_name},
            thread_id=f"{thread_prefix}-{uuid.uuid4().hex[:6]}",
        )

    return asyncio.run(_go())


def _cmd_record(args: argparse.Namespace) -> int:
    slugs = [s.strip() for s in (args.company or "").split(",") if s.strip()]
    catalogue = {c.slug: c for c in list_companies()}
    unknown = [s for s in slugs if s not in catalogue]
    if not slugs:
        print("`record` exige --company <slug[,slug…]> (voir "
              "`python -m app.eval.strategy.run companies`).", file=sys.stderr)
        return 2
    if unknown:
        print(f"Compte(s) inconnu(s) du golden set : {', '.join(unknown)}", file=sys.stderr)
        return 2
    if not args.yes_run_live:
        print(
            f"\n⚠ `record` lance {len(slugs)} analyse(s) RÉELLE(S) pour capturer leurs prompts.\n"
            "  Cela appelle Claude / Brave / Firecrawl / Apollo et coûte de l'argent réel\n"
            "  (~$0.70–1.10 par compte, cf. agent_docs/strategy-token-eval.md).\n"
            "  Relancer avec --yes-run-live pour confirmer.",
            file=sys.stderr,
        )
        return 2

    store = Path(args.store)
    failures = 0
    for slug in slugs:
        company = catalogue[slug]
        with recording(store, corpus=args.corpus or "golden", case=slug,
                       arm=ARM_RECORDED, store_output=not args.no_store_output) as rec:
            try:
                _live_run(company.company, f"bench-{slug}")
            except Exception as exc:  # noqa: BLE001 — un compte qui casse n'arrête pas la capture
                failures += 1
                logger.error("capture %s en échec — %s", slug, exc)
                print(f"  ✗ {slug} : {exc}", file=sys.stderr)
        print(f"  {slug} : {len(rec.written)} appel(s) enregistré(s) → {store}")
    _print_corpus(store)
    return 1 if failures else 0


def _cmd_replay(args: argparse.Namespace) -> int:
    store = Path(args.store)
    inputs = corpus_inputs(load_calls(store))
    if not inputs:
        print(f"Corpus vide ({store}) — lancer `record --yes-run-live` d'abord.", file=sys.stderr)
        return 2
    if not args.model:
        print("`replay` exige --model <modèle | fournisseur:modèle>.", file=sys.stderr)
        return 2
    try:
        spec = ModelSpec.parse(args.model[0])
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    # ``--arm`` est ``action="append"`` — c'est ``compare`` qui en prend
    # plusieurs. Ici il en faut UN, et il faut le SORTIR de la liste : écrit
    # ``args.arm or args.model[0]``, une liste non vide est truthy, donc le bras
    # devenait ``["a1"]`` et partait tel quel dans le magasin. ``compare --arm
    # a1`` cherche ensuite ``r.arm == "a1"`` et ne trouve rien — ce qui rendait
    # inutilisable le seul moyen documenté de mesurer la VARIANCE d'un modèle
    # (« rejouer le même modèle sous deux noms de bras »).
    if len(args.arm) > 1:
        print(
            "`replay` n'écrit qu'un bras à la fois — un seul --arm. "
            f"Reçu : {args.arm}.",
            file=sys.stderr,
        )
        return 2
    arm = args.arm[0] if args.arm else args.model[0]

    if args.prompt:
        inputs = [r for r in inputs if r.prompt_name.startswith(args.prompt)]
    planned = len(inputs) if args.limit is None else min(len(inputs), args.limit)
    if not args.yes_run_live:
        print(
            f"\n⚠ `replay` rejoue {planned} prompt(s) sur {spec.label} — appels RÉELS et payants.\n"
            "  (Aucune collecte n'est refaite : seuls les appels LLM partent.)\n"
            "  Relancer avec --yes-run-live pour confirmer.\n"
            f"  Reprise automatique : ce qui est déjà mesuré `ok` pour le bras {arm!r} est sauté.",
            file=sys.stderr,
        )
        return 2

    produced = asyncio.run(replay_corpus(
        inputs, arm, spec, store=store,
        store_output=not args.no_store_output, limit=args.limit,
    ))
    n_ok = sum(1 for r in produced if r.ok)
    print(f"\n{len(produced)} rejeu(x) sur {spec.label} — {n_ok} ok, "
          f"{len(produced) - n_ok} en échec → {store}")
    return 0 if n_ok == len(produced) else 1


def _declared_models(args: argparse.Namespace, rows: list[CallRecord]) -> dict[str, ModelSpec]:
    """Le modèle de chaque bras : déclaré par ``--models``, sinon LU dans le magasin."""
    out: dict[str, ModelSpec] = {}
    for arm in args.arm:
        seen = {f"{r.provider}:{r.model}" if r.provider else r.model
                for r in rows if r.arm == arm and r.model}
        if len(seen) == 1:
            out[arm] = ModelSpec.parse(next(iter(seen)))
    for pair in args.models or []:
        name, _, raw = pair.partition("=")
        if raw:
            out[name.strip()] = ModelSpec.parse(raw.strip())
    return out


def _cmd_compare(args: argparse.Namespace) -> int:
    if len(args.arm) < 2:
        print("`compare` exige au moins deux --arm.", file=sys.stderr)
        return 2
    rows = load_calls(Path(args.store))
    try:
        models = _declared_models(args, rows)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    judge = None
    judge_scores: list = []
    if args.judge is not None:
        try:
            judge = resolve_judge(args.judge)
            assert_judge_is_not_a_candidate(judge, models.values())
        except (ValueError, JudgeConflictError) as exc:
            print(f"Refus : {exc}", file=sys.stderr)
            return 2
        if not args.no_judge_calls:
            paired = {r.record_id for r in rows if r.arm == args.arm[0]}
            for arm in args.arm[1:]:
                paired &= {r.record_id for r in rows if r.arm == arm}
            targets = [r for r in rows if r.arm in args.arm and r.record_id in paired]
            judge_scores = asyncio.run(judge_records(targets, judge))

    comparison = compare_arms(
        rows, args.arm, corpus=args.corpus or "",
        judge=judge, judge_scores=judge_scores,
        models={arm: spec.label for arm, spec in models.items()},
    )
    if args.as_json:
        print(json.dumps(comparison.as_dict(), ensure_ascii=False, indent=2))
    else:
        _print_comparison(comparison)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(
            json.dumps(comparison.as_dict(), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\n  → rapport écrit dans {args.out}")
    return 0


def _cmd_cost(args: argparse.Namespace) -> int:
    if not args.model:
        print("`cost` exige au moins un --model.", file=sys.stderr)
        return 2
    try:
        specs = [ModelSpec.parse(m) for m in args.model]
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    est = project_replay_cost(load_calls(Path(args.store)), specs)
    if args.as_json:
        print(json.dumps(est, ensure_ascii=False, indent=2))
        return 0
    if not est["measured"]:
        print(f"\nCoût du rejeu : non mesuré.\n  {est['note']}")
        return 0
    print(f"\nRejeu du corpus — {est['calls']} appel(s) mesuré(s) sur le bras "
          f"{est['source_arm']!r}")
    print(f"  jetons mesurés : {est['input_tokens']:,} entrée / {est['output_tokens']:,} sortie")
    print(f"  coût observé   : ${est['observed_cost_usd']:.4f}")
    fallback = set(est.get("fallback_priced") or [])
    unpriced = set(est.get("unpriced") or [])
    print(f"\n  {'modèle':<34} coût projeté")
    print("  " + "─" * 50)
    for label, usd in est["by_model"].items():
        # ⚠️ Trois états, pas deux. Un modèle que le fournisseur ne sait pas
        # tarifer n'a pas un coût de zéro : il n'en a pas. L'écrire « $0.0000 »
        # ferait lire « gratuit » là où il faut lire « on ne sait pas », et c'est
        # exactement la décision qu'on veut empêcher de prendre à l'aveugle.
        if usd is None:
            print(f"  {label:<34} non tarifé  ⚠ aucun prix connu")
            continue
        flag = "  ⚠ palier de repli" if label in fallback else ""
        print(f"  {label:<34} ${usd:.4f}{flag}")
    print(f"\n  Hypothèse : {est['assumption']}")
    if fallback:
        print(f"  ⚠ Tarif INCONNU pour {', '.join(sorted(fallback))} : le chiffre ci-dessus est")
        print("    celui du palier de repli de la passerelle, PAS le prix de ce modèle.")
        print("    Renseigner sa ligne dans la table du fournisseur avant d'en tirer une décision.")
    if unpriced:
        print(f"  ⚠ AUCUN prix connu pour {', '.join(sorted(unpriced))} — le banc ne projette")
        print("    rien plutôt que d'emprunter le tarif d'un autre modèle. Renseigner sa ligne")
        print("    (table du fournisseur, ou OPENAI_PRICE_<MODELE>_IN / _OUT) avant de décider.")
    return 0


# ── entrée ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="python -m app.eval.bench.run",
        description="Banc de comparaison de modèles — même prompt, N modèles, quatre colonnes.",
    )
    p.add_argument("command", choices=("corpus", "record", "replay", "compare", "cost"))
    p.add_argument("--store", default=str(DEFAULT_STORE),
                   help="Magasin JSONL du corpus et de ses mesures.")
    p.add_argument("--corpus", default=None, help="Étiquette du corpus.")
    p.add_argument("--company", default=None, help="record : slug(s) du golden set, séparés par des virgules.")
    p.add_argument("--model", action="append", default=None,
                   help="replay/cost : `modèle` ou `fournisseur:modèle`. Répétable pour `cost`.")
    p.add_argument("--arm", action="append", default=[],
                   help="Nom du bras (défaut : la valeur de --model). Répétable pour `compare`.")
    p.add_argument("--models", action="append", default=None,
                   help="compare : `bras=modèle`, pour déclarer un bras dont le magasin ne dit rien.")
    p.add_argument("--judge", default=None, nargs="?", const="",
                   help="compare : le juge (`` = le défaut). Un candidat ne peut pas être son juge.")
    p.add_argument("--no-judge-calls", action="store_true",
                   help="compare : vérifie le juge et l'enregistre, sans l'appeler (gratuit).")
    p.add_argument("--prompt", default=None, help="replay : ne rejouer qu'un préfixe de prompt_name.")
    p.add_argument("--limit", type=int, default=None, help="Plafonner le nombre d'appels.")
    p.add_argument("--no-store-output", action="store_true",
                   help="Ne pas conserver les sorties (re-noter exigera alors de re-payer).")
    p.add_argument("--out", default=None, help="compare : écrire le rapport JSON ici.")
    p.add_argument("--json", dest="as_json", action="store_true", help="Sortie machine.")
    p.add_argument("--yes-run-live", action="store_true",
                   help="Confirme des appels RÉELS et payants (record / replay).")
    args = p.parse_args(argv)

    if args.command == "corpus":
        _print_corpus(Path(args.store))
        return 0
    if args.command == "record":
        return _cmd_record(args)
    if args.command == "replay":
        return _cmd_replay(args)
    if args.command == "compare":
        return _cmd_compare(args)
    return _cmd_cost(args)


if __name__ == "__main__":
    raise SystemExit(main())
