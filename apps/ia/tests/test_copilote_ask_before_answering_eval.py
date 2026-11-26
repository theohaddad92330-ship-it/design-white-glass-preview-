"""DEMANDER AVANT DE CHERCHER — Laura pose la question qui change la réponse.

    « quand je demande à Laura de chercher une entreprise, un besoin, un
      contact, ben faut que si j'ai pas donné toutes les réponses possibles,
      Laura nous pose des questions. » — Louis, 29/08/2026.

C'est le prolongement du QUATRIÈME temps des cinq niveaux de vérité (« ce que
je ne sais pas ») : ce qu'elle ne sait pas et **qui changerait la réponse**,
elle le DEMANDE au lieu de le supposer.

─────────────────────────────────────────────────────────────────────────────
CE QUE CETTE RÈGLE N'EST PAS — écrit ici pour que personne ne la « corrige »
─────────────────────────────────────────────────────────────────────────────
**Ce n'est pas une interruption.** Le dépôt a un budget d'intervention (plafond
adaptatif, retrait après refus) qui gouverne ce que Laura déclenche D'ELLE-MÊME.
Poser une question de précision EN RÉPONSE à une demande est l'inverse : c'est
du travail demandé. Les deux mécanismes ne se touchent pas — rien ici ne lit ni
n'écrit le budget d'intervention.

**Ce n'est pas non plus une excuse pour ne pas répondre.** Le dépôt tient
« une réponse juste sans chemin » : demander trois précisions quand la réponse
est évidente est un refus déguisé. D'où le critère, qui est la moitié utile de
la règle : **on demande ce qui CHANGE la réponse**, pas ce qui la décore.

**Ce n'est pas la carte de clarification.** ``ask_clarification`` — la carte à
options cliquables qui ARRÊTE le tour — reste bornée à UNE par conversation
(§9.4, ``chat_orchestrator.py``). Ce bloc-ci gouverne la question posée DANS le
texte de la réponse, qui ne coûte pas un tour de plus et n'est donc pas bornée.

─────────────────────────────────────────────────────────────────────────────
LES DEUX MOITIÉS DE L'ÉVAL
─────────────────────────────────────────────────────────────────────────────
1. **Le prompt PORTE la règle.** Un scénario par cas que Louis cite — chercher
   une entreprise, un besoin, quelqu'un à contacter — plus le critère, la borne
   de nombre, et le CONTRÔLE INVERSE (une demande complète se répond). Les
   tests ``test_the_eval_knows_how_to_say_no`` et
   ``test_no_fragment_survives_the_removal`` retirent le bloc et vérifient que
   tout tombe : un fragment satisfait par un bloc voisin rendrait la garde
   verte pour une mauvaise raison — le défaut exact que la même paire de tests
   a attrapé sur les cinq niveaux de vérité (« ce que tu ne sais pas » était
   déjà écrit dans ``_BLOCK_FORMAT``).
2. **L'oracle SAIT reconnaître une mauvaise façon de demander.** Trois défauts
   déterministes : la SALVE (plus de trois questions), la question FOURRE-TOUT
   qui fait tout recommencer (« tu veux dire quoi ? »), et la réponse qui n'est
   QUE des questions — le refus déguisé. Deux corpus le prouvent dans les deux
   sens, et le second contient le contrôle inverse : une réponse complète, sans
   la moindre question, ne doit être attrapée par rien.
"""

from __future__ import annotations

import re
from typing import NamedTuple

import pytest

from app.prompts.bellum_advisor import _BLOCK_ASK_FIRST, build_system_prompt
from tests.copilote_scenario_metadata import (
    Action,
    Categorie,
    JamaisInventer,
    Meta,
    Moment,
    Nature,
    Objet,
    Recette1945,
)

#: Un prompt « nu » : aucun contexte utilisateur, donc tout ce qu'on y trouve
#: vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")


# ── 1. Le prompt porte la règle ──────────────────────────────────────────────


class Scenario(NamedTuple):
    """Une demande telle qu'un commercial la tape, et ce que le prompt doit
    contenir pour que Laura la traite bien."""

    name: str
    #: La demande réelle. Elle n'est pas jouée contre le modèle — elle documente
    #: CONTRE QUOI le fragment a été écrit (même convention que
    #: ``test_copilote_truth_levels_eval.py``).
    ask: str
    fragments: tuple[str, ...]
    # #1948.11 — les métadonnées du scénario, au schéma unique de
    # `copilote_scenario_metadata.py`.
    meta: Meta


SCENARIOS: tuple[Scenario, ...] = (
    Scenario(
        "CRITÈRE",
        "Trouve-moi des comptes à attaquer.",
        ("ce qui CHANGERAIT ta réponse", "jamais ce qui la décore", "refus déguisé"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE,),
            page="/discover",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Scenario(
        "COMBIEN",
        "Cherche un profil.",
        ("Deux précisions au plus", "d'un seul coup", "salve sans fin"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/consultants",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Scenario(
        "PENDANT",
        "Prépare-moi le compte Michelin pour jeudi.",
        ("Tu traites ce qui est déjà clair", "en otage d'un détail"),
        meta=Meta(
            moment=Moment.AVANT_RENDEZ_VOUS,
            intention=Categorie.PREPARER_UN_RENDEZ_VOUS,
            objets=(Objet.COMPTE, Objet.RENDEZ_VOUS),
            page="/accounts/$id",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.PREPARER_UN_RENDEZ_VOUS,),
        ),
    ),
    Scenario(
        "ENTREPRISE",
        "Trouve-moi des entreprises à Lyon.",
        (
            "UNE ENTREPRISE À TROUVER",
            "le territoire et le signal",
            "recrutement en cours, appel d'offres ouvert, marché attribué",
        ),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/discover",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Scenario(
        "BESOIN",
        "Quels besoins je peux couvrir ?",
        (
            "UN BESOIN À TROUVER",
            "sans compétence, sans compte et sans date de démarrage",
            "lequel des trois cadre la recherche",
        ),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Scenario(
        "CONTACT",
        "Écris un message à Marc.",
        (
            "QUELQU'UN À CONTACTER",
            "Tu ne choisis JAMAIS le canal à sa place",
            "mail, réseau professionnel ou appel",
        ),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.CONTACT, Objet.MESSAGE),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Scenario(
        # LE CONTRÔLE INVERSE. Sans lui, la règle serait « demande toujours »,
        # c'est-à-dire un refus déguisé industrialisé.
        "NE-PAS-DEMANDER",
        "Le SIREN de Michelin, c'est lequel ?",
        ("se RÉPOND tout de suite", "n'appellent aucune précision"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
)


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s.name for s in SCENARIOS])
def test_the_prompt_carries_the_scenario(scenario: Scenario) -> None:
    missing = [fragment for fragment in scenario.fragments if fragment not in BARE]
    assert not missing, (
        f"Le cas {scenario.name} n'est pas dans le prompt du copilote (manque : {missing}). "
        f"Sans lui, « {scenario.ask} » part en recherche au lieu de poser la question qui "
        "changerait la réponse."
    )


def test_the_rule_says_it_is_not_an_interruption() -> None:
    """La confusion à empêcher : le budget d'intervention gouverne ce que Laura
    déclenche d'ELLE-MÊME. Une question posée en réponse à une demande est du
    travail demandé — et un tour COURT, donc un gain de latence sur les 90 s de
    budget (``CHAT_TURN_BUDGET_S``) plutôt qu'une dépense."""
    assert "ce n'est pas une interruption" in BARE
    assert "une recherche à côté de la plaque" in BARE


def test_the_three_cases_louis_named_are_all_covered() -> None:
    """Louis en a cité trois, nommément : une entreprise, un besoin, un contact.
    Deux sur trois laisserait la troisième au hasard du modèle."""
    named = {s.name for s in SCENARIOS}
    assert {"ENTREPRISE", "BESOIN", "CONTACT"} <= named


def test_4055_3941_un_secteur_ou_profil_nomme_suffit_a_repondre() -> None:
    """Recette R7a (prod 429335a9c8) : « des entreprises télécom » (secteur nommé)
    et « trouve-moi des startups » (profil nommé) faisaient encore poser la
    question territoire/signal du bloc ENTREPRISE, au lieu de rendre le résultat
    que `find_accounts`/`run_account_search` peuvent déjà produire avec ce SEUL
    critère (ESN exclues et 3 niveaux d'appartenance pour #4055, préréglage
    startup pour #3941 — tous deux livrés le même jour). La phrase ENTREPRISE
    disait pourtant l'inverse sans exception : « un secteur seul rend une liste
    au hasard », donc toujours demander. Elle doit maintenant dire que ce
    critère SUFFIT, et ne réserver la question qu'à son absence."""
    assert "un secteur ou profil nommé suffit" in BARE
    assert "un secteur seul rend une liste au hasard" not in BARE


def test_the_block_states_a_hard_ceiling_on_the_number_of_questions() -> None:
    """« Bombarde de questions » sans borne redevient un formulaire. Deux, en
    une fois (#3394.4, recette prod 30/09/2026 — abaissé de trois à deux pour
    s'aligner sur le plafond déjà appliqué par `_BLOCK_SPONTANEOUS_ORCHESTRATION`
    et `_BLOCK_CONSULTANT_BRIEF`, qui portaient déjà « deux questions bloquantes
    au plus »)."""
    assert "Deux précisions au plus" in BARE


# ── 2. La place du bloc : le cache et le budget de tour ──────────────────────


def test_the_block_sits_in_the_constant_head_before_the_variable_context() -> None:
    """Mesuré, pas supposé (GA-293, « le cache de prompt de Laura, annulé par
    l'ordre des blocs ») : le prompt système part désormais en PLUSIEURS blocs
    ``cache_control: ephemeral`` (``claude_service._cached_system``,
    ``CACHE_SEGMENT_BREAK``) — un point de coupure APRÈS le segment invariant
    des 15 blocs ``_BLOCK_*``, un autre après le profil ESN (stable sur une
    session), et le reste (compte, contacts, plan…) jamais mis en cache.

    ⚠️ Avant ce lot, un SEUL point de coupe à la FIN faisait porter le cache
    sur tout le préfixe, donc la POSITION d'un ajout était neutre en coût.
    Ce n'est plus vrai : ``_BLOCK_ASK_FIRST`` (comme les 14 autres blocs
    invariants) doit maintenant précéder ``PROFIL ESN`` et ``COMPTE ANALYSÉ``
    pour rester DANS le segment mis en cache — sinon il repasse au tarif
    plein à chaque tour, exactement le défaut que ce lot corrige.
    """
    here = BARE.index("DEMANDER AVANT DE CHERCHER")
    assert here < BARE.index("PROFIL ESN")
    assert here < BARE.index("COMPTE ANALYSÉ")
    # Il prolonge le quatrième temps des cinq niveaux (« ce que je ne sais
    # pas ») : il se lit juste après, jamais avant — cette relation-là entre
    # deux blocs invariants n'a pas bougé, seul leur groupe s'est déplacé.
    assert here > BARE.index("LES CINQ NIVEAUX DE VÉRITÉ")


def test_the_block_stays_inside_its_character_budget() -> None:
    """Un tour a 90 s de budget et 105 s de plafond dur (``CHAT_TURN_BUDGET_S`` /
    ``CHAT_TURN_CEILING_S``). Une consigne se paie sur TOUS les tours, y compris
    ceux qui ne cherchent rien — d'où un plafond, et un cliquet : on ne le
    relève pas pour faire tenir une phrase de plus."""
    assert len(_BLOCK_ASK_FIRST) <= 1600, (
        f"Le bloc fait {len(_BLOCK_ASK_FIRST)} caractères. Au-delà, il se paie sur tous les "
        "tours — y compris « c'est quoi le SIREN ? »."
    )


# ── 3. L'oracle : reconnaître une MAUVAISE façon de demander ─────────────────

#: Deux questions, c'est la borne du bloc (#3394.4, 30/09/2026). La troisième
#: est une salve.
_MAX_QUESTIONS = 2

#: Une déclaration de moins de 25 caractères (« D'accord. », « Voici. ») ne
#: répond à rien : elle ne doit pas suffire à faire passer une réponse qui
#: n'est qu'un interrogatoire.
_STATEMENT_MIN_CHARS = 25

#: La question qui fait TOUT RECOMMENCER. Elle est volontairement ÉTROITE : une
#: question ciblée qui commence pareil (« peux-tu préciser le département ? »)
#: est exactement ce qu'on veut, et un filtre large l'interdirait.
_CATCH_ALL = re.compile(
    r"(?:tu\s+veux\s+dire\s+quoi"
    r"|que\s+veux-tu\s+(?:dire|exactement)"
    r"|peux-tu\s+pr[ée]ciser\s+ta\s+(?:demande|question)"
    r"|peux-tu\s+m'en\s+dire\s+(?:un\s+peu\s+)?plus"
    r"|de\s+quoi\s+(?:parles-tu|s'agit-il)\s*\?"
    r"|comment\s+puis-je\s+t'aider)",
    re.IGNORECASE,
)


def _sentences(text: str) -> list[str]:
    """Découpe en phrases : après un point final, ou à chaque retour à la ligne
    (une puce de liste est une phrase, même sans ponctuation finale)."""
    parts = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def ask_offences(text: str) -> list[str]:
    """Ce qu'on reproche à cette façon de demander. Vide = rien à reprocher."""
    sentences = _sentences(text)
    questions = [s for s in sentences if s.endswith("?")]
    statements = [s for s in sentences if not s.endswith("?") and len(s) >= _STATEMENT_MIN_CHARS]

    offences: list[str] = []
    if len(questions) > _MAX_QUESTIONS:
        offences.append("salve")
    if questions and not statements:
        # Une réponse qui n'est QUE des questions n'a rien traité de ce qui
        # était déjà clair : c'est le refus déguisé que « une réponse juste
        # sans chemin » interdit.
        offences.append("aucune-reponse")
    if _CATCH_ALL.search(text):
        offences.append("question-fourre-tout")
    return offences


#: Ce que Laura ne doit JAMAIS produire.
BAD_WAYS_TO_ASK: tuple[str, ...] = (
    "Sur quel département ? Quel effectif ? Quel secteur ? Quel signal ? "
    "Et sur quel horizon de temps ?",
    "Quelle compétence ? Chez quel compte ? À partir de quelle date ? "
    "Avec quel TJM cible ? Sur quelle durée de mission ? En régie ou au forfait ?",
    "Sur quel compte ?",
    "Tu veux dire quoi exactement ?",
    "Peux-tu préciser ta demande ?",
    "Bien reçu. Peux-tu m'en dire un peu plus ?",
    "Comment puis-je t'aider sur ce sujet ?",
    "De quoi s'agit-il ?",
)

#: Ce que Laura DOIT pouvoir dire. Les quatre dernières portent le CONTRÔLE
#: INVERSE : une demande complète se répond, sans la moindre question — un
#: oracle qui les attraperait aurait interdit de répondre.
GOOD_WAYS_TO_ASK: tuple[str, ...] = (
    "Avant de lancer la recherche, deux choses qui changent complètement la liste. "
    "Sur quel département veux-tu chercher ? "
    "Et quel signal t'intéresse : un recrutement en cours ou un appel d'offres ouvert ?",
    "J'ai onze besoins ouverts chez tes comptes, dont quatre sur des profils data. "
    "Pour te sortir la bonne shortlist, il me manque la compétence centrale. "
    "Tu vises plutôt data engineering, BI, ou de la data science ?",
    "Marc Dubois est DSI chez Sogeclair, dernier échange le 14 mars, resté sans réponse. "
    "Je te prépare l'approche. Sur quel canal veux-tu partir : un mail, un message sur son "
    "réseau professionnel, ou un script d'appel ?",
    "Deux précisions et je lance : quel territoire, et quel signal ? "
    "En attendant je te sors déjà les douze comptes de ton portefeuille qui correspondent "
    "au secteur industriel, ils te donneront un point de comparaison.",
    "Le SIREN de Michelin est le 855 200 507 (source : registre national, lecture du "
    "12 août 2026).",
    "Tu as quatre missions qui se terminent sous 30 jours : deux chez Sogeclair, une chez "
    "Vinci, une sans date de fin renseignée — c'est celle-là que je regarderais en premier, "
    "parce qu'aucune fenêtre de renouvellement ne l'attrape.",
    "Voici la shortlist du besoin « Data engineer chez ACME » : six profils classés, deux "
    "axes non évaluables sur trois d'entre eux, et les quatre écartés avec leur motif.",
    "Ton taux d'intercontrat est de 14 % sur mars, mesuré sur 21 consultants.",
)


@pytest.mark.parametrize("answer", BAD_WAYS_TO_ASK)
def test_the_oracle_catches_every_bad_way_to_ask(answer: str) -> None:
    assert ask_offences(answer), (
        f"« {answer} » passe l'oracle. Un interrogatoire à la place d'une réponse est le "
        "refus déguisé que « une réponse juste sans chemin » interdit."
    )


@pytest.mark.parametrize("answer", GOOD_WAYS_TO_ASK)
def test_the_oracle_leaves_every_good_answer_alone(answer: str) -> None:
    assert not ask_offences(answer), (
        f"« {answer} » est attrapée à tort ({ask_offences(answer)}). Un oracle qui interdit "
        "de poser une question ciblée — ou de répondre sans en poser — a interdit le produit."
    )


def test_every_rule_is_exercised_by_the_corpus() -> None:
    """Une règle qu'aucun cas ne déclenche est une règle qu'on ne saurait pas
    avoir cassée."""
    fired = {name for answer in BAD_WAYS_TO_ASK for name in ask_offences(answer)}
    assert fired == {"salve", "aucune-reponse", "question-fourre-tout"}, fired


def test_the_inverse_control_is_in_the_corpus() -> None:
    """Le contrôle inverse compte autant que la règle : sur une demande complète
    et sans ambiguïté, Laura RÉPOND. Quatre réponses du corpus légitime ne
    portent pas une seule question — si l'oracle les attrapait, il aurait
    transformé « demande ce qui change la réponse » en « ne réponds jamais »."""
    without_question = [answer for answer in GOOD_WAYS_TO_ASK if "?" not in answer]
    assert len(without_question) >= 4, without_question
    for answer in without_question:
        assert not ask_offences(answer)


# ── 4. Les deux preuves obligatoires : le corpus est LU, la garde dit NON ────


def test_the_eval_reads_a_non_empty_corpus() -> None:
    """Une garde qui ne lit rien est verte pour toujours."""
    assert BARE.strip(), "Le prompt système est vide : tous les `in` passeraient sur du néant."
    assert _BLOCK_ASK_FIRST.strip(), "Le bloc est vide : le retirer ne changerait rien."
    assert len(SCENARIOS) == 7
    assert all(scenario.fragments for scenario in SCENARIOS), "Un cas sans fragment passe toujours."
    assert all(scenario.ask for scenario in SCENARIOS)
    assert len(BAD_WAYS_TO_ASK) >= 8
    assert len(GOOD_WAYS_TO_ASK) >= 8
    # Quatre réponses légitimes POSENT des questions : c'est ce qui rend le
    # corpus capable de dire que l'oracle est trop large.
    assert sum(1 for answer in GOOD_WAYS_TO_ASK if "?" in answer) >= 4


def test_the_eval_knows_how_to_say_no() -> None:
    """On retire le bloc du prompt et on vérifie que les SEPT cas tombent.

    C'est le test anti-garde-borgne : si un seul cas restait vert sur le prompt
    dégradé, ses fragments seraient satisfaits par un AUTRE bloc et la garde ne
    protégerait rien.
    """
    degraded = BARE.replace(_BLOCK_ASK_FIRST, "")
    assert _BLOCK_ASK_FIRST not in degraded
    assert len(degraded) < len(BARE)

    still_green = [
        scenario.name
        for scenario in SCENARIOS
        if all(fragment in degraded for fragment in scenario.fragments)
    ]
    assert not still_green, (
        f"Ces cas passent encore sans leur bloc : {still_green}. Leurs fragments sont trouvés "
        "ailleurs dans le prompt — la garde est borgne."
    )


def test_no_fragment_survives_the_removal() -> None:
    """Le cran au-dessus : AUCUN fragment, pris seul, ne doit rester trouvable.

    Un cas peut tomber pour un seul de ses trois fragments pendant que les deux
    autres sont satisfaits par un bloc voisin — la garde serait alors verte par
    accident le jour où quelqu'un réécrit le troisième. C'est ce test qui a
    disqualifié « le canal » tout court (déjà écrit dans ``_BLOCK_TOOLS`` :
    « affiche les cibles, le canal, le contenu ») et « ce qui manque » (déjà
    dans ``_BLOCK_LAURA``).
    """
    degraded = BARE.replace(_BLOCK_ASK_FIRST, "")
    survivors = {
        scenario.name: [fragment for fragment in scenario.fragments if fragment in degraded]
        for scenario in SCENARIOS
    }
    assert not any(survivors.values()), (
        f"Fragments trouvés ailleurs que dans le bloc : { {k: v for k, v in survivors.items() if v} }. "
        "Choisis une formulation propre au bloc, sinon la garde protège une coïncidence."
    )
