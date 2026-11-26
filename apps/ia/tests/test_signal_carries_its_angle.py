"""#2687 — un signal porte son angle : le LIEN hypothèse → signal est nommé.

RIEN, dans les données produites avant cette PR, ne relie une hypothèse
qualifiée à un signal :

  · ``basedOnSignals`` est du TEXTE LIBRE, et le prompt demande une
    reformulation (« les signaux concrets qui la fondent ») — pas une citation.
    ``test_signals_hypotheses`` en donne la preuve : ``["recrut. data",
    "plateforme"]`` en face de signaux rédigés « fait precis et date ».
  · aucun identifiant : ``RecentSignal`` n'avait pas d'``id``, et celui que le
    web fabrique à l'affichage est un index dans une liste dédupliquée.
  · aucune catégorie commune, aucun ordre garanti (MIN 4 signaux, MIN 3
    hypothèses).
  · ``basedOnSignals`` n'était d'ailleurs lu que comme un COMPTE
    (``_cap_confidence_by_convergence`` n'en fait qu'un ``len()``).

Apparier sur ce texte serait un rapprochement par proximité — pire que
l'absence, parce que ça a l'air d'une réponse. Le lien est donc **demandé au
modèle**, sous la forme la moins chère possible : le signal reçoit un ``id``
local à l'analyse, l'hypothèse cite ces ``id``. Le modèle ne fabrique aucune
information nouvelle — il NOMME un rattachement qu'il affirmait déjà en prose.

Et un défaut mesuré au passage : ``firstAction``, que le prompt réclame depuis
toujours, n'était PAS un champ de ``QualifiedHypothesis``. Pydantic l'ignorait,
et la persistance passant par ``model_dump(by_alias=True)``
(``phase1_research``), il n'atteignait jamais la base.
"""

from __future__ import annotations

from app.models.outputs.research import QualifiedHypothesis, RecentSignal, ResearchSignals
from app.prompts.bellum_signals import build_user_prompt


def test_prompt_asks_the_model_to_name_the_link():
    """Le prompt demande un `id` par signal ET la citation de ces `id`."""
    prompt = build_user_prompt("Société Générale", "", "", "")
    assert '"id"' in prompt
    assert "basedOnSignalIds" in prompt


def test_signal_carries_its_own_identifier():
    signal = RecentSignal.model_validate({"signal": "recrute 12 data engineers", "id": "s3"})
    assert signal.id == "s3"
    assert signal.model_dump(by_alias=True)["id"] == "s3"


def test_signal_without_identifier_stays_readable():
    """Additif seulement : des milliers d'analyses écrites avant cette PR n'ont
    pas d'`id`, et elles doivent continuer à se lire. Absent = chaîne vide,
    jamais un index deviné."""
    assert RecentSignal.model_validate({"signal": "x"}).id == ""


def test_hypothesis_cites_the_signals_it_rests_on_by_identifier():
    h = QualifiedHypothesis.model_validate(
        {
            "hypothesis": "industrialise ses modèles ML",
            "basedOnSignals": ["recrut. data", "plateforme"],
            "basedOnSignalIds": ["s1", "s4"],
            "esnAngle": "renfort MLOps",
            "firstAction": "cadrer le besoin MLOps avec le CDO",
        },
    )
    assert h.based_on_signal_ids == ["s1", "s4"]
    # La prose reste telle quelle : elle est lue ailleurs (dashboard-manager,
    # rubrique d'éval) et on ne change pas son sens.
    assert h.based_on_signals == ["recrut. data", "plateforme"]
    assert h.first_action == "cadrer le besoin MLOps avec le CDO"


def test_first_action_survives_the_production_dump():
    """Le chemin de production est `ResearchSignals.model_dump(by_alias=True)`.
    C'est LUI qui jetait `firstAction`."""
    dumped = ResearchSignals.model_validate(
        {
            "recentSignals": [{"signal": "recrute 12 data engineers", "id": "s1"}],
            "qualifiedHypotheses": [
                {
                    "hypothesis": "industrialise ses modèles ML",
                    "basedOnSignalIds": ["s1"],
                    "esnAngle": "renfort MLOps",
                    "firstAction": "cadrer le besoin avec le CDO",
                }
            ],
        },
    ).model_dump(by_alias=True)
    assert dumped["recentSignals"][0]["id"] == "s1"
    hypothesis = dumped["qualifiedHypotheses"][0]
    assert hypothesis["basedOnSignalIds"] == ["s1"]
    assert hypothesis["firstAction"] == "cadrer le besoin avec le CDO"


def test_convergence_counts_the_identifiers_when_the_model_gives_them():
    """Le plafond de convergence compte les signaux convergents. Les `id` en
    sont le décompte le PLUS précis ; la prose reste le repli. Sans ça, un
    modèle qui répond proprement en `id` et laisse la prose vide se ferait
    rétrograder à `a_verifier` — une régression introduite par le lien lui-même."""
    h = QualifiedHypothesis.model_validate(
        {"hypothesis": "anti-fraude temps réel", "confidence": "confirmee", "basedOnSignalIds": ["s1", "s2", "s5"]},
    )
    assert h.confidence == "confirmee"

    # Et le plafond continue de mordre : un seul signal ne confirme rien.
    solo = QualifiedHypothesis.model_validate(
        {"hypothesis": "migre vers le cloud", "confidence": "confirmee", "basedOnSignalIds": ["s1"]},
    )
    assert solo.confidence == "a_verifier"


def test_duplicate_identifiers_do_not_inflate_the_convergence():
    """Trois fois le même signal n'est pas une convergence de trois signaux."""
    h = QualifiedHypothesis.model_validate(
        {"hypothesis": "x", "confidence": "confirmee", "basedOnSignalIds": ["s1", "s1", "s1"]},
    )
    assert h.confidence == "a_verifier"
