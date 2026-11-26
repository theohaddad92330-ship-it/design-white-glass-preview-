"""Les kwargs d'échantillonnage doivent être ACCEPTÉS par le SDK installé.

Né de la panne du 25/10/2026 (#4417) : la montée `anthropic` 0.52.0 → 2.1.0 a
retiré `temperature` de `Messages.create`. `_sampling_kwargs` continuait à le
produire, donc chaque appel levait un `TypeError` **avant** la requête HTTP —
146 ms, aucun appel réseau, et le brouillon de Laura restait vide en 502.

La garde lit la SIGNATURE RÉELLE du SDK installé, sans mock : un mock aurait
accepté n'importe quel kwarg et n'aurait rien vu. Elle dit donc NON aussi bien
si une montée retire un paramètre que si `_sampling_kwargs` en invente un.
"""

import inspect

import pytest
from anthropic.resources.messages import AsyncMessages, Messages

from app.services.claude_service import _SAMPLING_CAPABLE_MODELS, _sampling_kwargs


def _parametres_acceptes(methode) -> set[str]:
    signature = inspect.signature(methode)
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in signature.parameters.values()):
        pytest.fail(
            "%s accepte **kwargs : la signature ne garde plus rien, "
            "la garde doit être revue" % methode.__qualname__
        )
    return set(signature.parameters)


@pytest.mark.parametrize("methode", [Messages.create, AsyncMessages.create])
@pytest.mark.parametrize("modele", sorted(_SAMPLING_CAPABLE_MODELS))
def test_les_kwargs_dechantillonnage_existent_dans_le_sdk(modele, methode):
    kwargs = _sampling_kwargs(modele)
    inconnus = set(kwargs) - _parametres_acceptes(methode)
    assert not inconnus, (
        "%s ne connaît pas %s pour le modèle %s — l'appel lèverait un TypeError "
        "avant toute requête réseau (panne du 25/10, #4417). Soit la montée du SDK "
        "est à annuler, soit _sampling_kwargs doit cesser de produire ce paramètre."
        % (methode.__qualname__, sorted(inconnus), modele)
    )
