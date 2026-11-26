"""Masking AVANT export — ce qui part réellement dans une trace Langfuse.

Le garde-fou exigé par ``LANGFUSE_OBSERVABILITY_REQUIREMENTS.md`` (:22-29) tient
en trois lignes : **masking avant export**, **aucun secret/token**, **contenu
e-mail / téléphone masqué par défaut**.

Mesuré avant ce fichier : le contenu des prompts ne sortait pas par défaut
(``LANGFUSE_CAPTURE_CONTENT`` absent), ce qui satisfaisait la troisième ligne
*par omission*. Deux trous restaient :

1. dès que l'opérateur pose ``LANGFUSE_CAPTURE_CONTENT=true`` pour déboguer, les
   prompts partaient **bruts** — et les prompts de contacts / organigramme
   portent les e-mails et téléphones remontés par l'enrichissement ;
2. le ``statusMessage`` d'un span en échec est un ``str(exc)`` — il n'a JAMAIS
   été gouverné par ``LANGFUSE_CAPTURE_CONTENT``, et le message d'un fournisseur
   recopie régulièrement l'URL appelée, clé d'API comprise.

Le masquage est donc **inconditionnel** : il n'y a pas de variable pour
l'éteindre. Un garde-fou qu'on peut débrancher n'est pas un garde-fou — et
retirer le MOYEN vaut mieux que retirer la permission.
"""

from __future__ import annotations

import pytest

from app.services import langfuse_client as lf


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    for var in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_CAPTURE_CONTENT", "LANGFUSE_DISABLED"):
        monkeypatch.delenv(var, raising=False)
    lf._reset_for_tests()
    yield
    lf._reset_for_tests()


def _enable(monkeypatch, *, content: bool = True):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    if content:
        monkeypatch.setenv("LANGFUSE_CAPTURE_CONTENT", "true")


def _bodies(event_type: str) -> list[dict]:
    return [e["body"] for e in lf._pending_events() if e["type"] == event_type]


def _everything_queued() -> str:
    """Tout ce que la file s'apprête à envoyer, en un seul texte.

    C'est la seule façon honnête de poser la question « est-ce que ça SORT ? » :
    chercher champ par champ laisserait passer le champ auquel on n'a pas pensé.
    """
    import json

    return json.dumps(lf._pending_events(), ensure_ascii=False, default=str)


# ── e-mails et téléphones ─────────────────────────────────────────────────────


def test_un_email_ne_sort_jamais_meme_avec_la_capture_de_contenu(monkeypatch):
    _enable(monkeypatch)
    lf.record_generation(
        name="bellum_contacts",
        model="claude-sonnet-5",
        input_tokens=1,
        output_tokens=1,
        input_obj={"contact": "Marie Dupont <marie.dupont@acme-corp.fr>"},
        output_obj="écrire à marie.dupont@acme-corp.fr",
    )

    queued = _everything_queued()
    assert "marie.dupont@acme-corp.fr" not in queued
    assert "acme-corp.fr" not in queued
    assert "[email masqué]" in queued
    # Le RESTE du contenu survit : masquer ne veut pas dire rendre la trace
    # inutile — on doit encore pouvoir lire la forme du prompt.
    assert "Marie Dupont" in queued


def test_un_telephone_ne_sort_pas(monkeypatch):
    _enable(monkeypatch)
    lf.record_generation(
        name="bellum_contacts",
        model="claude-sonnet-5",
        input_tokens=1,
        output_tokens=1,
        input_obj={"fr": "01 42 68 53 00", "intl": "+33 6 12 34 56 78"},
    )

    queued = _everything_queued()
    assert "01 42 68 53 00" not in queued
    assert "+33 6 12 34 56 78" not in queued
    assert queued.count("[téléphone masqué]") == 2


def test_un_chiffre_d_affaires_n_est_pas_un_telephone(monkeypatch):
    # Le piège que ce test ferme : un masque trop gourmand avale les nombres
    # métier, et la trace ne sert plus à rien. Un SIREN, un effectif, un montant
    # et un code postal doivent PASSER.
    _enable(monkeypatch)
    lf.record_generation(
        name="bellum_facts",
        model="claude-sonnet-5",
        input_tokens=1,
        output_tokens=1,
        input_obj={"siren": "552100554", "ca": "1 234 567 euros", "effectif": 4200, "cp": "75008"},
    )

    queued = _everything_queued()
    assert "552100554" in queued
    assert "1 234 567" in queued
    assert "4200" in queued
    assert "75008" in queued
    assert "masqué" not in queued


# ── secrets et jetons ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "secret",
    [
        "Bearer abcdef0123456789ABCDEF",
        "sk-ant-api03-AAAABBBBCCCCDDDD",
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        'ANTHROPIC_API_KEY="sk-live-9f8e7d6c5b4a3210"',
    ],
)
def test_aucun_secret_ne_sort(monkeypatch, secret):
    _enable(monkeypatch)
    lf.record_generation(
        name="bellum_facts",
        model="claude-sonnet-5",
        input_tokens=1,
        output_tokens=1,
        input_obj={"trace": f"appel refusé — {secret}"},
    )

    queued = _everything_queued()
    # On cherche la partie SENSIBLE, pas la ligne entière : le nom de l'en-tête
    # peut rester, sa valeur non.
    for fragment in ("abcdef0123456789ABCDEF", "AAAABBBBCCCCDDDD", "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk", "9f8e7d6c5b4a3210"):
        assert fragment not in queued
    assert "[secret masqué]" in queued


# ── le chemin que personne ne gouvernait : le message d'erreur d'un span ──────


def test_le_message_d_erreur_d_un_span_est_masque_MEME_sans_capture_de_contenu(monkeypatch):
    # Ce chemin-là n'a jamais dépendu de LANGFUSE_CAPTURE_CONTENT : un span en
    # échec exporte `str(exc)` quoi qu'il arrive. Un fournisseur qui recopie
    # l'URL appelée y met sa clé d'API.
    _enable(monkeypatch, content=False)
    with lf.bind_trace("chat_turn"), pytest.raises(ValueError), lf.span("tool:enrich_contact"):
        raise ValueError("GET https://api.provider.com/v1/person?api_key=SUPERSECRET1234 pour jean@acme.fr")

    span = _bodies("span-create")[0]
    assert "SUPERSECRET1234" not in span["statusMessage"]
    assert "jean@acme.fr" not in span["statusMessage"]
    # Le span reste diagnostiquable : on sait TOUJOURS quel outil a échoué.
    assert span["level"] == "ERROR"
    assert span["name"] == "tool:enrich_contact"


def test_les_metadonnees_d_une_trace_sont_masquees(monkeypatch):
    _enable(monkeypatch, content=False)
    with lf.bind_trace("analysis_run", metadata={"thread_id": "t-1", "note": "contact: paul@acme.fr"}):
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)

    queued = _everything_queued()
    assert "paul@acme.fr" not in queued
    assert "t-1" in queued  # ce qui n'est pas sensible reste lisible


# ── le no-op reste un no-op ───────────────────────────────────────────────────


def test_sans_cles_le_masquage_ne_change_rien_car_rien_ne_part(monkeypatch):
    # Le masquage ne doit pas devenir une raison de faire du travail quand
    # l'observabilité est éteinte : sans clés, rien n'est construit, rien n'est
    # masqué, rien n'est mis en file.
    lf.record_generation(
        name="bellum_facts",
        model="m",
        input_tokens=1,
        output_tokens=1,
        input_obj={"contact": "marie@acme.fr"},
    )
    assert lf._pending_events() == []


# ── la garde sait dire NON ────────────────────────────────────────────────────


def test_le_masquage_lit_un_corpus_non_vide():
    # Une garde qui ne lit rien passe toujours. On vérifie ici que le masqueur
    # transforme VRAIMENT quelque chose — sinon les assertions ci-dessus
    # pourraient être vertes sur une fonction identité appliquée à du vide.
    assert lf._redact("écris à marie@acme.fr") != "écris à marie@acme.fr"
    assert lf._redact("rien à masquer ici") == "rien à masquer ici"
