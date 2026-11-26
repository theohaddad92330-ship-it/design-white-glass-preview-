"""#4711.1 / #4711.2 — la date de CONSTRUCTION du service, posée au build et relue.

``/version`` rendait l'heure de la RÉPONSE (``timestamp``), pas celle de la build : on pouvait dire « ce service sert
tel commit », jamais « depuis quand ». ``built_at`` se lit dans ``build-time.txt`` (écrit par la commande de build,
``.railway/railway.ts``) ou dans ``BUILD_TIME``. Sans l'un ni l'autre : ``None``, jamais une date devinée.
"""

from app.services.build_time import read_built_at


def test_la_variable_build_time_prime(tmp_path):
    (tmp_path / "build-time.txt").write_text("2026-11-01T09:30:00Z\n")
    assert read_built_at({"BUILD_TIME": "2026-11-01T08:00:00Z"}, tmp_path) == "2026-11-01T08:00:00Z"


def test_le_fichier_pose_au_build_est_relu(tmp_path):
    (tmp_path / "build-time.txt").write_text("2026-11-01T09:30:00Z\n")
    assert read_built_at({}, tmp_path) == "2026-11-01T09:30:00Z"


def test_ni_variable_ni_fichier_rend_none(tmp_path):
    assert read_built_at({}, tmp_path) is None


def test_une_valeur_qui_n_est_pas_une_date_est_refusee(tmp_path):
    (tmp_path / "build-time.txt").write_text("pas une date")
    assert read_built_at({}, tmp_path) is None
    assert read_built_at({"BUILD_TIME": "$(date)"}, tmp_path) is None


def test_relu_depuis_le_dossier_du_module_quand_le_dossier_courant_n_a_pas_le_fichier(tmp_path):
    (tmp_path / "build-time.txt").write_text("2026-11-02T10:00:00Z\n")
    nested = tmp_path / "app" / "services"
    nested.mkdir(parents=True)
    empty = tmp_path / "ailleurs"
    empty.mkdir()
    assert read_built_at({}, empty, nested) == "2026-11-02T10:00:00Z"
