"""Compteur d'appels Pappers — l'instrument qui manquait quand le quota a sauté.

Le quota Pappers s'est épuisé en production sans que personne le voie venir :
dossiers en erreur, entités non résolues, autocomplete vide, et aucun chiffre
pour dire d'où partait la consommation. ``run_metrics`` compte déjà les appels
par provider, mais deux angles morts lui échappent, et ce sont précisément ceux
qui ont vidé le quota :

* **le détail par endpoint** — ``run_metrics`` ne connaît que « pappers ». Or
  ``/v2/recherche`` (une requête par frappe d'autocomplete) et ``/v2/entreprise``
  (une par dossier, mise en cache 30 j) n'ont ni le même volume ni le même
  remède. Les confondre, c'est chercher la fuite au mauvais endroit ;
* **ce qui tourne HORS d'un run** — l'autocomplete et le préremplissage
  d'onboarding n'ont pas de ``correlation_id``. Leurs appels n'apparaissent dans
  aucune métrique de run, donc dans aucun tableau de bord. Ils sont pourtant le
  premier poste de consommation en volume.

D'où un compteur de PROCESSUS (cumulatif, tous chemins confondus) doublé d'un
compteur par run.

**C'est une mesure, pas un bridage.** Aucun appel n'est refusé ici : couper un
run au milieu parce qu'un seuil est franchi remplacerait une panne visible
(« plus de crédits ») par une panne silencieuse et arbitraire, ce qui est pire.
Franchir le seuil journalise un ``logger.warning`` — un humain arbitre.

Best-effort et en mémoire du processus : un redémarrage remet les compteurs à
zéro, ce qui est acceptable pour un instrument de tendance.
"""

from __future__ import annotations

import logging
import os
import time
from collections import OrderedDict

logger = logging.getLogger(__name__)

#: Endpoints facturés, nommés comme dans l'URL Pappers.
ENDPOINT_SEARCH = "recherche"
ENDPOINT_COMPANY = "entreprise"
ENDPOINT_CARTOGRAPHIE = "cartographie"

_MAX_TRACKED_RUNS = 256

#: Périodicité du récapitulatif cumulatif (appels). Assez fréquent pour voir une
#: dérive d'autocomplete le jour même, assez rare pour ne pas noyer les logs.
_LOG_EVERY = 25

#: Au-delà, un run consomme anormalement — on le DIT, on ne le coupe pas.
#: Un dossier normal coûte 1 à 3 appels (cf. rapport de consommation). 16 depuis
#: #3247 (décision Louis 10/10) : « filiale autonome » lit la cartographie de la
#: cible + des 8 candidats d'alternatives — un seul réglage, relevé ici.
_DEFAULT_RUN_WARN = 16

_totals: dict[str, int] = {}
_errors = 0
_saved = 0
_calls = 0
_started_at = time.time()
# correlation_id → {endpoint: n}
_runs: OrderedDict[str, dict[str, int]] = OrderedDict()
# correlation_id → nombre d'appels en échec (le taux d'échec par run distingue
# « ce run a beaucoup consommé » de « ce run s'est heurté au quota »).
_run_error_counts: dict[str, int] = {}
_warned_runs: set[str] = set()


def _run_warn_threshold() -> int:
    raw = os.getenv("PAPPERS_RUN_CALL_WARN", "").strip()
    if raw:
        try:
            return max(int(raw), 1)
        except ValueError:
            logger.warning("PAPPERS_RUN_CALL_WARN=%r invalide — seuil par défaut", raw)
    return _DEFAULT_RUN_WARN


def record(endpoint: str, *, correlation_id: str | None = None, ok: bool = True) -> None:
    """Compte UN appel réseau facturable vers Pappers. Ne lève jamais.

    À appeler au point de sortie HTTP, pas au point d'entrée de la fonction : un
    hit de cache ne doit rien compter, sinon le compteur mesure l'intention et
    non la facture. Un appel en erreur est compté ET marqué : un taux d'échec qui
    grimpe EST le signal « quota épuisé ».
    """
    global _calls, _errors
    name = (endpoint or "inconnu").strip() or "inconnu"
    _calls += 1
    _totals[name] = _totals.get(name, 0) + 1
    if not ok:
        _errors += 1

    cid = (correlation_id or "").strip()
    if cid:
        bucket = _runs.get(cid)
        if bucket is None:
            bucket = {}
            _runs[cid] = bucket
            while len(_runs) > _MAX_TRACKED_RUNS:
                evicted, _ = _runs.popitem(last=False)
                _warned_runs.discard(evicted)
                _run_error_counts.pop(evicted, None)
        else:
            _runs.move_to_end(cid)
        bucket[name] = bucket.get(name, 0) + 1
        if not ok:
            _run_error_counts[cid] = _run_error_counts.get(cid, 0) + 1
        _warn_if_run_is_greedy(cid, bucket)

    if _LOG_EVERY and _calls % _LOG_EVERY == 0:
        logger.info("Pappers budget (processus) : %s", summarise_process())


def record_cache_hit(endpoint: str = ENDPOINT_SEARCH) -> None:
    """Compte un appel ÉVITÉ par le cache — la contrepartie mesurable de
    ``record``. Sans ce chiffre, « le cache marche » reste une croyance."""
    global _saved
    _saved += 1


def _warn_if_run_is_greedy(correlation_id: str, bucket: dict[str, int]) -> None:
    """Un run au-dessus du seuil est signalé UNE fois. Aucun appel n'est refusé."""
    total = sum(bucket.values())
    threshold = _run_warn_threshold()
    if total < threshold or correlation_id in _warned_runs:
        return
    _warned_runs.add(correlation_id)
    logger.warning(
        "Consommation Pappers anormale pour le run %s : %s (seuil d'alerte %d, "
        "aucun appel bloqué — vérifier le cache et la résolution SIREN)",
        correlation_id,
        summarise_run(correlation_id),
        threshold,
    )


def run_calls(correlation_id: str) -> int:
    """Nombre d'appels Pappers facturés par ce run."""
    return sum(_runs.get((correlation_id or "").strip(), {}).values())


def run_metrics(correlation_id: str) -> dict[str, int]:
    """``{endpoint: appels}`` pour ce run (copie)."""
    return dict(_runs.get((correlation_id or "").strip(), {}))


def summarise_run(correlation_id: str) -> str:
    """Ligne de log lisible : « 3 appels Pappers (entreprise×1, …), 1 échec »."""
    bucket = _runs.get((correlation_id or "").strip(), {})
    if not bucket:
        return "0 appel Pappers"
    detail = ", ".join(f"{name}×{n}" for name, n in sorted(bucket.items()))
    total = sum(bucket.values())
    line = f"{total} appel{'s' if total > 1 else ''} Pappers ({detail})"
    errors = _run_errors(correlation_id)
    if errors:
        line += f", {errors} échec{'s' if errors > 1 else ''}"
    return line


def _run_errors(correlation_id: str) -> int:
    return _run_error_counts.get((correlation_id or "").strip(), 0)


def snapshot() -> dict:
    """État du compteur de processus — pour un log, un test ou un endpoint admin."""
    return {
        "total": _calls,
        "errors": _errors,
        "saved": _saved,
        "by_endpoint": dict(_totals),
        "uptime_s": int(time.time() - _started_at),
    }


def summarise_process() -> str:
    """Récapitulatif cumulatif du processus, endpoint le plus coûteux en tête."""
    if not _calls:
        return "0 appel"
    detail = ", ".join(f"{name}×{n}" for name, n in sorted(_totals.items(), key=lambda kv: -kv[1]))
    line = f"{_calls} appels facturés ({detail}), {_saved} évités par le cache"
    if _errors:
        line += f", {_errors} en échec"
    hours = max((time.time() - _started_at) / 3600, 1 / 60)
    line += f" — {_calls / hours:.1f} appels/h"
    return line


def reset() -> None:
    """Remise à zéro (tests uniquement)."""
    global _calls, _errors, _saved, _started_at
    _calls = 0
    _errors = 0
    _saved = 0
    _started_at = time.time()
    _totals.clear()
    _runs.clear()
    _warned_runs.clear()
    _run_error_counts.clear()


__all__ = [
    "ENDPOINT_CARTOGRAPHIE",
    "ENDPOINT_COMPANY",
    "ENDPOINT_SEARCH",
    "record",
    "record_cache_hit",
    "reset",
    "run_calls",
    "run_metrics",
    "snapshot",
    "summarise_process",
    "summarise_run",
]
