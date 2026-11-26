"""#4113 — masquage PII des traces Langfuse (noms, via Presidio) et Sentry (regex).

Périmètre : ce qui part vers Langfuse / Sentry, JAMAIS l'affichage ni les
réponses d'API. Presidio est un COMPLÉMENT derrière ``TRACE_PII_NER_ENABLED``
(défaut : désactivé → chemin byte-identique, import paresseux).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from app import sentry_init
from app.services import langfuse_client as lf
from app.services import trace_pii_ner


@pytest.fixture(autouse=True)
def _reset_ner(monkeypatch):
    monkeypatch.delenv("TRACE_PII_NER_ENABLED", raising=False)
    trace_pii_ner._reset_for_tests()
    yield
    trace_pii_ner._reset_for_tests()


# ── Sentry : e-mail / téléphone / Bearer masqués ──────────────────────────────


def test_sentry_before_send_masque_email_telephone_bearer():
    event = {
        "message": "échec pour jean@acme.fr",
        "exception": {"values": [{"value": "tel 06 12 34 56 78 injoignable"}]},
        "extra": {"auth": "Bearer abcdefghij123456", "n": 3},
        "contexts": {"draft": {"to": "x@y.com"}},
        "request": {"data": {"note": "écrire à a.b@c.io"}, "headers": {"accept": "json"}},
        "breadcrumbs": {"values": [{"message": "sent to q@q.fr"}]},
    }
    out = str(sentry_init._before_send(event, {}))
    for leak in ("jean@acme.fr", "06 12 34 56 78", "abcdefghij123456", "x@y.com", "a.b@c.io", "q@q.fr"):
        assert leak not in out
    assert "json" in out


def test_sentry_before_breadcrumb_masque_message_et_data():
    crumb = sentry_init._before_breadcrumb({"message": "a@b.fr", "data": {"t": "06 12 34 56 78"}}, {})
    assert "a@b.fr" not in str(crumb)
    assert "06 12 34 56 78" not in str(crumb)


def test_sentry_laisse_passer_siren_ca_effectif_code_postal():
    event = {"message": "SIREN 552100554, CA 1250000000, effectif 12000, CP 75008"}
    assert sentry_init._before_send(event, {})["message"] == event["message"]


# ── Presidio : désactivé par défaut, jamais d'import ──────────────────────────


def test_flag_desactive_presidio_nest_pas_importe():
    code = (
        "import sys, os;"
        "os.environ.pop('TRACE_PII_NER_ENABLED', None);"
        "from app.services import langfuse_client as lf;"
        "out = lf._redact('Marie Durand écrit à marie@acme.fr');"
        "assert 'marie@acme.fr' not in out and 'Marie Durand' in out, out;"
        "assert 'presidio_analyzer' not in sys.modules"
    )
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=str(Path(__file__).resolve().parents[1]))
    assert result.returncode == 0, result.stderr


def test_flag_desactive_chemin_byte_identique():
    text = "Marie Durand, marie@acme.fr, 06 12 34 56 78"
    assert lf._redact(text) == lf._redact_regex(text)


# ── Presidio actif : noms masqués ; échec → repli regex, jamais d'exception ──


class _Span:
    def __init__(self, start: int, end: int) -> None:
        self.start, self.end, self.entity_type = start, end, "PERSON"


class _FakeAnalyzer:
    def analyze(self, text, language, entities):  # noqa: ANN001
        needle = "Marie Durand"
        i = text.find(needle)
        return [_Span(i, i + len(needle))] if i >= 0 else []


def test_flag_actif_masque_nom_et_email_dans_la_trace(monkeypatch):
    monkeypatch.setenv("TRACE_PII_NER_ENABLED", "true")
    monkeypatch.setattr(trace_pii_ner, "_get_analyzer", lambda: _FakeAnalyzer())
    out = lf._redact("Marie Durand écrit à marie@acme.fr")
    assert "Marie Durand" not in out
    assert "marie@acme.fr" not in out


def test_flag_actif_presidio_qui_plante_retombe_sur_le_regex(monkeypatch):
    monkeypatch.setenv("TRACE_PII_NER_ENABLED", "true")

    class _Boom:
        def analyze(self, *a, **k):  # noqa: ANN002, ANN003
            raise RuntimeError("modèle absent")

    monkeypatch.setattr(trace_pii_ner, "_get_analyzer", lambda: _Boom())
    out = lf._redact("Marie Durand écrit à marie@acme.fr")
    assert "marie@acme.fr" not in out  # le regex a tourné
    assert "Marie Durand" in out  # pas de nom masqué, pas d'exception


def test_flag_actif_presidio_introuvable_retombe_sur_le_regex(monkeypatch):
    monkeypatch.setenv("TRACE_PII_NER_ENABLED", "true")

    def _missing():
        raise ImportError("presidio_analyzer")

    monkeypatch.setattr(trace_pii_ner, "_build_analyzer", _missing)
    out = lf._redact("Marie Durand écrit à marie@acme.fr")
    assert "marie@acme.fr" not in out


def test_redact_personal_data_reste_regex_seul(monkeypatch):
    # Hors Langfuse (intention non routée) : pas de NER — périmètre = traces.
    monkeypatch.setenv("TRACE_PII_NER_ENABLED", "true")
    monkeypatch.setattr(trace_pii_ner, "_get_analyzer", lambda: _FakeAnalyzer())
    assert "Marie Durand" in lf.redact_personal_data("Marie Durand")


# ── #4113.4 — un masque qui plante rend le MASQUE, jamais le texte brut ────────


def test_regex_qui_plante_rend_le_masque_et_jamais_le_texte_brut(monkeypatch):
    # #4113.4 — l'exception vient du regex lui-même (moteur de masque cassé).
    class _Boom:
        def sub(self, *a, **k):  # noqa: ANN002, ANN003
            raise RuntimeError("regex cassé")

    monkeypatch.setattr(lf, "_EMAIL_RE", _Boom())
    brut = "Marie Durand écrit à marie@acme.fr au 06 12 34 56 78"
    for out in (lf._redact(brut), lf.redact_personal_data(brut)):
        assert out == lf._SECRET_MASK
        assert "marie@acme.fr" not in out
        assert "06 12 34 56 78" not in out


def test_sentry_masque_qui_plante_ne_laisse_pas_le_texte_brut(monkeypatch):
    # #4113.4 — Sentry réutilise le masque Langfuse : même garantie côté événement.
    class _Boom:
        def sub(self, *a, **k):  # noqa: ANN002, ANN003
            raise RuntimeError("regex cassé")

    monkeypatch.setattr(lf, "_EMAIL_RE", _Boom())
    out = str(sentry_init._before_send({"message": "échec pour jean@acme.fr"}, {}))
    assert "jean@acme.fr" not in out


def test_langfuse_laisse_passer_siren_ca_effectif_code_postal():
    # #4113.4 — on masque la personne, pas le dossier (principe 2 du fichier).
    texte = "SIREN 552100554, CA 1250000000, effectif 12000, CP 75008"
    assert lf._redact(texte) == texte
    assert lf.redact_personal_data(texte) == texte
