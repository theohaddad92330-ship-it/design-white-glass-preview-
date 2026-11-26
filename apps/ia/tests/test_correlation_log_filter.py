"""Le fil de corrélation dans les logs du service IA.

L'identifiant vivait déjà dans le ContextVar et dans Sentry ; il manquait là où on
le cherche vraiment en incident : les lignes de log du run.
"""

from __future__ import annotations

import logging

import pytest

from app.middleware.correlation_id import (
    CorrelationIdLogFilter,
    _correlation_id,
    install_correlation_log_filter,
)


@pytest.fixture
def record() -> logging.LogRecord:
    return logging.LogRecord("app.test", logging.INFO, __file__, 1, "message", None, None)


def test_filter_pose_l_identifiant_courant(record: logging.LogRecord) -> None:
    token = _correlation_id.set("cid-42")
    try:
        assert CorrelationIdLogFilter().filter(record) is True
        assert record.correlation_id == "cid-42"
    finally:
        _correlation_id.reset(token)


def test_hors_requete_la_colonne_reste_lisible(record: logging.LogRecord) -> None:
    # Démarrage, tâche de fond : pas d'identifiant. Un tiret se lit ; une chaîne
    # vide décale toutes les colonnes de la ligne.
    assert CorrelationIdLogFilter().filter(record) is True
    assert record.correlation_id == "-"


def test_respecte_un_identifiant_deja_pose(record: logging.LogRecord) -> None:
    # Le log d'accès HTTP tourne EN DEHORS du contexte (pour qu'une requête
    # rejetée laisse quand même une ligne) : il pose l'identifiant lui-même
    # depuis l'en-tête. L'écraser remettrait `-` sur la ligne lue en premier.
    record.correlation_id = "venu-de-l-entete"
    assert CorrelationIdLogFilter().filter(record) is True
    assert record.correlation_id == "venu-de-l-entete"


def test_remplace_un_tiret_par_le_contexte_quand_il_y_en_a_un(record: logging.LogRecord) -> None:
    record.correlation_id = "-"
    token = _correlation_id.set("cid-7")
    try:
        CorrelationIdLogFilter().filter(record)
        assert record.correlation_id == "cid-7"
    finally:
        _correlation_id.reset(token)


def test_le_filtre_ne_jette_jamais_la_ligne(record: logging.LogRecord) -> None:
    # Un filtre qui rend False supprimerait le log : celui-ci enrichit, il ne trie pas.
    for _ in range(3):
        assert CorrelationIdLogFilter().filter(record) is True


def test_installation_idempotente() -> None:
    logger = logging.getLogger("app.test.install")
    handler = logging.StreamHandler()
    logger.addHandler(handler)
    try:
        install_correlation_log_filter(logger)
        install_correlation_log_filter(logger)
        posed = [f for f in handler.filters if isinstance(f, CorrelationIdLogFilter)]
        assert len(posed) == 1
    finally:
        logger.removeHandler(handler)


def test_le_format_racine_reclame_le_champ() -> None:
    """Le format exige `correlation_id` : sans filtre sur le HANDLER, la ligne est perdue.

    Ce test verrouille l'appariement des deux — changer l'un sans l'autre casse
    silencieusement la journalisation, ce qui ne se voit qu'en incident.
    """
    formatter = logging.Formatter("%(levelname)s [%(correlation_id)s] %(message)s")
    unfiltered = logging.LogRecord("app.test", logging.INFO, __file__, 1, "sans filtre", None, None)
    with pytest.raises(ValueError):
        formatter.format(unfiltered)

    CorrelationIdLogFilter().filter(unfiltered)
    assert "[-]" in formatter.format(unfiltered)
