"""#3399 (V01, 01/10) — recette prod : la carte de priorisation (« Quel compte
attaquer en premier ? ») ne nommait ni la personne ni le périmètre.

Le tour rejoué : entrée « Quel compte attaquer en premier ? » → outil
`get_portfolio_priorities` → le modèle reçoit, à chaque appel du tour, un
gabarit dont l'ACTION PROPOSÉE nomme la personne et le périmètre — ou dit
qu'ils manquent. Question à poser en recette : « Quel compte attaquer en
premier ? » — attendu : l'action cite un interlocuteur (nom, rôle) et la BU /
filiale visée, ou écrit « Interlocuteur à identifier ».
"""

from app.prompts.bellum_advisor import build_system_prompt


def test_the_priority_template_names_person_and_scope() -> None:
    prompt = build_system_prompt({}, {}, "", "")
    assert "NOMME la personne à contacter" in prompt
    assert "périmètre visé" in prompt
    assert "Interlocuteur à identifier" in prompt


def test_the_template_reads_the_interlocutor_field_for_every_listed_account() -> None:
    """#3399 (Y1 01/10) — la source est branchée (`interlocutor` sur chaque compte rangé) : le
    gabarit la nomme, pour CHAQUE compte listé, et `null` donne « Interlocuteur à identifier ».
    Question à poser en recette : « Quel compte attaquer en premier ? » — attendu : chaque compte
    listé porte soit une personne (nom, rôle) soit « Interlocuteur à identifier »."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "`interlocutor`" in prompt
    assert "pour CHAQUE compte que tu listes" in prompt
    assert "est `null`" in prompt


def test_a_missing_role_is_said_never_a_bare_first_name() -> None:
    """#3399 (Y3 02/10) — « Antoine » seul, sans rôle, était rendu comme une personne identifiée.
    Question à poser en recette : « Quel compte attaquer en premier ? » — attendu : nom complet
    et rôle, ou « rôle non renseigné » écrit tel quel, jamais un prénom nu."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "rôle non renseigné" in prompt
    assert "jamais un prénom seul" in prompt


def test_the_interlocutor_opens_its_own_segment_never_buried_in_the_action_sentence() -> None:
    """VU (recette prod 09/10, lot H05) — « interlocuteur nommé en prose seulement (Danny Straten,
    Latecoere Aerostructures Canada) » : la personne se lisait fondue au milieu de la phrase
    d'action, jamais comme un champ identifiable à lui seul. Question à poser en recette : « Quel
    compte attaquer en premier ? » — attendu : chaque compte ouvre son geste par « Interlocuteur :
    … » avant l'action elle-même."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "Interlocuteur : <nom>" in prompt
    assert "avant le geste lui-même, jamais fondu dans sa phrase" in prompt
