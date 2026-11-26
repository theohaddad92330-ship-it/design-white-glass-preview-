"""#3441/#3442/#3444/#3445 (lot C20 du 30/09/2026) — `search_content_library`.

Louis a demandé, dans quatre retours bêta, d'importer ses emails, scripts
d'appel, réponses aux objections et pitchs « pour qu'ils ne soient pas
recréés librement ». Ce test verrouille l'appelant de bout en bout : le
texte VERBATIM (placeholders et conditions compris) atteint bien le modèle
via `execute_chat_tool`, filtré par catégorie et par mot-clé — jamais
paraphrasé, jamais deviné au-delà du filtre donné.
"""

from __future__ import annotations

import asyncio

import pytest

from app.access.rights_matrix import READ_ONLY_TOOLS
from app.knowledge.content_library import CONTENT_LIBRARY_ENTRIES
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"


def _run(tool_input: dict) -> dict:
    return asyncio.run(execute_chat_tool("search_content_library", tool_input, user_id=USER, profile_data=None))


def test_loutil_est_declare_dans_le_catalogue_avant_push_profile():
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "search_content_library" in names
    # `push_profile` doit rester le DERNIER outil du catalogue (garde des lots
    # précédents) : le nouvel outil s'insère AU-DESSUS de lui.
    assert names[-1] == "push_profile"
    assert names.index("search_content_library") < names.index("push_profile")


def test_loutil_est_classe_lecture_seule():
    assert "search_content_library" in READ_ONLY_TOOLS


def test_sans_filtre_rend_la_bibliotheque_bornee_au_meme_plafond_que_le_reste_du_catalogue():
    # 26 entrées > `_LIST_TOOL_CAP` (20, même borne que tout le catalogue) :
    # sans filtre, la coupe s'applique et le drapeau le dit.
    result = _run({})
    assert result["truncated"] is True
    assert len(result["entries"]) == 20


def test_filtre_par_kind():
    result = _run({"kind": "pitch"})
    assert len(result["entries"]) == 6
    assert all(entry["kind"] == "pitch" for entry in result["entries"])


def test_filtre_par_query_insensible_a_la_casse():
    result = _run({"query": "tjm"})
    assert len(result["entries"]) >= 1
    assert all("tjm" in entry["title"].lower() or "tjm" in entry["body"].lower() for entry in result["entries"])


def test_le_texte_rendu_est_verbatim_et_porte_ses_conditions():
    result = _run({"kind": "call_script", "query": "variante A"[:0] or "partenaire"})
    entry = next(e for e in result["entries"] if e["id"] == "script-appel-variante-a-contexte-partenaire")
    assert entry["body"].startswith("1. OUVERTURE")
    assert "{{Partenaire}}" in entry["body"]
    assert "le partenaire est réel" in entry["conditions"]


def test_un_mot_cle_absent_rend_un_resultat_vide_jamais_devine():
    result = _run({"query": "zzzz-un-mot-qui-nexiste-nulle-part"})
    assert result["entries"] == []
    assert result["truncated"] is False


def test_requete_naturelle_multi_mots_retrouve_la_variante_b_recette_3442():
    # #3442 — recette prod (30/09) : Laura répondait « ne retrouve pas d'entrée »
    # pour la variante B. Cause : l'ancienne recherche exigeait la requête
    # ENTIÈRE comme sous-chaîne littérale. Le titre porte une virgule
    # (« variante pure chasse, sans contexte ») qu'une requête naturelle sans
    # virgule (« pure chasse sans contexte ») ne peut jamais matcher en mode
    # sous-chaîne. La recherche doit être tolérante : chaque MOT de la requête
    # doit être présent (ordre et ponctuation libres), pas la phrase entière.
    result = _run({"kind": "call_script", "query": "pure chasse sans contexte"})
    ids = {entry["id"] for entry in result["entries"]}
    assert "script-appel-variante-b-pure-chasse" in ids


def test_requete_naturelle_multi_mots_retrouve_la_variante_a_recette_3442():
    result = _run({"kind": "call_script", "query": "script d'appel contexte partenaire"})
    ids = {entry["id"] for entry in result["entries"]}
    assert "script-appel-variante-a-contexte-partenaire" in ids


@pytest.mark.parametrize(
    "objection_id",
    [
        "objection-pas-decideur",
        "objection-numero",
        "objection-referencement",
        "objection-envoyez-moi-un-mail",
        "objection-aucun-besoin",
        "objection-pas-de-consultants",
        "objection-deja-des-partenaires",
        "objection-regles-achats",
        "objection-pas-le-temps",
        "objection-gestion-interne",
        "objection-question-budget",
        "objection-autres-priorites",
        "objection-rappelez-plus-tard",
        "objection-mauvaises-experiences",
        "objection-tjm-trop-eleve",
    ],
)
def test_chacune_des_15_objections_3444_est_retrouvable_par_mot_cle(objection_id: str) -> None:
    # #3444 — recette prod : une seule objection ("Où avez-vous trouvé mon
    # numéro ?") avait été testée en live. Ce test couvre les 14 autres,
    # une à une, par le mot-clé le plus proche d'une vraie question d'un
    # commercial (jamais l'id technique).
    entry = next(e for e in CONTENT_LIBRARY_ENTRIES if e["id"] == objection_id)
    keyword = entry["title"].split()[-1].strip("?.,")
    result = _run({"kind": "objection_response", "query": keyword})
    ids = {e["id"] for e in result["entries"]}
    assert objection_id in ids, f"introuvable via le mot-clé {keyword!r} tiré du titre {entry['title']!r}"


@pytest.mark.parametrize("kind", ["email_template", "call_script", "objection_response", "pitch"])
def test_chaque_categorie_est_representee_dans_le_registre(kind: str):
    assert any(entry["kind"] == kind for entry in CONTENT_LIBRARY_ENTRIES)


def test_the_tool_tells_laura_how_to_say_a_closest_match_not_a_word_for_word_one():
    """#3444 (Y1 01/10) — « pas retrouvé exactement … la plus proche est approuvée » était ambigu.
    Question à poser en recette dans /chat : « Nous travaillons déjà avec un prestataire » —
    attendu : si l'entrée n'est pas mot pour mot, « n'est pas dans ta bibliothèque telle quelle ;
    la réponse approuvée la plus proche est celle-ci », puis le texte verbatim."""
    tool = next(t for t in CHAT_TOOLS if t["name"] == "search_content_library")
    assert "la réponse approuvée la plus proche est celle-ci" in tool["description"]
    assert "jamais « pas retrouvé exactement »" in tool["description"]


# #3444 (recette prod 02/10) — « reste ≈ 10 objections non rejouées ». Le modèle
# passe souvent la PHRASE du prospect telle quelle comme requête, pas un mot-clé :
# chaque objection de l'issue, dite comme un prospect la dit, doit ramener SA
# réponse approuvée en tête (jamais une liste vide, jamais une autre réponse).
SPOKEN_OBJECTIONS = [
    ("objection-pas-decideur", "Je ne suis pas décideur sur ces sujets"),
    ("objection-numero", "Où avez-vous trouvé mon numéro de téléphone ?"),
    ("objection-referencement", "Êtes-vous référencés chez nous ?"),
    ("objection-envoyez-moi-un-mail", "Envoyez-moi plutôt un mail"),
    ("objection-aucun-besoin", "On n'a aucun besoin pour l'instant"),
    ("objection-pas-de-consultants", "On ne travaille pas avec des consultants"),
    ("objection-deja-des-partenaires", "Nous travaillons déjà avec un prestataire"),
    ("objection-regles-achats", "Il y a des règles achats chez nous"),
    ("objection-pas-le-temps", "Je n'ai pas le temps"),
    ("objection-gestion-interne", "Nous gérons tout en interne"),
    ("objection-question-budget", "Je n'ai pas de budget"),
    ("objection-autres-priorites", "Nous avons d'autres priorités"),
    ("objection-rappelez-plus-tard", "Rappelez-moi plus tard"),
    ("objection-mauvaises-experiences", "On a déjà eu une mauvaise expérience avec une ESN"),
    ("objection-tjm-trop-eleve", "Votre TJM est trop élevé"),
]


@pytest.mark.parametrize(("objection_id", "spoken"), SPOKEN_OBJECTIONS)
def test_une_objection_dite_en_phrase_ramene_sa_reponse_approuvee_en_tete(objection_id: str, spoken: str) -> None:
    result = _run({"kind": "objection_response", "query": spoken})
    ids = [e["id"] for e in result["entries"]]
    assert ids, f"aucune réponse pour {spoken!r}"
    assert ids[0] == objection_id, f"{spoken!r} → {ids[0]!r}, attendu {objection_id!r}"
    verbatim = next(e for e in CONTENT_LIBRARY_ENTRIES if e["id"] == objection_id)["body"]
    assert result["entries"][0]["body"] == verbatim
