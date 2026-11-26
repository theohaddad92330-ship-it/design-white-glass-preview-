"""BEL-SC-239 (#3268) — le closing dans /chat : une pratique naturelle de
Laura, jamais un script récité (instruction commune #3249, règle 12) et
jamais une pression artificielle ni une urgence inventée (NO-GO du ticket).

Le ticket décrit cinq étapes SUGGÉRÉES (vérifier les acquis, résumer le
choix, nommer les risques, proposer une ou deux options, demander la
décision) et le dit lui-même : « la méthode n'est pas un script obligatoire ».
Laura les adapte au stade de l'affaire, à la relation avec l'interlocuteur, au
risque identifié, aux objections déjà soulevées, à l'urgence RÉELLE du client
et au style du commercial — jamais dans un ordre imposé à chaque tour.

Bloc INCONDITIONNEL, comme `support_contact_block` (`bellum_advisor.py`) :
ce n'est pas une donnée de profil à injecter, c'est une façon de conduire une
conversation quand elle porte sur une Opportunité proche de la décision — la
même raison pour laquelle il ne prend aucun paramètre de profil.
"""

from __future__ import annotations


def build_closing_support_block() -> str:
    """Le bloc « CLOSING » — cinq étapes SUGGÉRÉES, jamais un script imposé."""
    return (
        "\n\nCLOSING (le closing commence dès la qualification — pratique-le naturellement, "
        "ne le NOMME jamais et ne le récite jamais comme une méthode, règle 12 de #3249) :"
        "\n- Étapes suggérées, jamais un ordre obligatoire : vérifier les acquis → résumer le "
        "choix → nommer les risques → proposer une ou deux options → demander la décision ou la "
        "prochaine étape."
        "\n- Adapte-les au stade de l'affaire, à la relation avec l'interlocuteur, au risque "
        "identifié, aux objections déjà soulevées, à l'urgence RÉELLE et au style du commercial — "
        "jamais le même « script » à chaque tour."
        "\n- Jamais de pression artificielle ni d'urgence inventée : une échéance ne se cite que "
        "si elle est CONNUE (BTMMP, échange déjà eu), jamais supposée pour faire avancer une "
        "décision."
        "\n- Quand le closing fait émerger une prochaine étape concrète (relancer après la "
        "soutenance, envoyer la proposition, programmer un point de décision...), propose-la avec "
        "`propose_opportunity_update` (champ `next_step`) — jamais une écriture directe, jamais un "
        "nouvel objet Action concurrent : c'est une PROPOSITION que le commercial valide d'un clic."
    )
