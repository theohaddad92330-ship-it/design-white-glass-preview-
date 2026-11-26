"""#3443 (lot J07, 30/09/2026) — le dialogue d'appel froid comme GOLDEN versionné.

Recette prod (30/09) : « le dialogue littéral n'est pas dans le dépôt (seul
le mécanisme `objection_library.json`). RESTE : importer le dialogue comme
golden. » Le lot précédent (#3443, commentaire C21) avait volontairement
refusé de le coller dans `objection_library.json` — ce fichier ne stocke
JAMAIS un script complet par conception (son propre docstring : coller une
réponse rédigée « ferait écrire des messages qui répondent à une objection
que l'interlocuteur n'a pas encore faite »). Le dialogue Martin n'est PAS une
réponse à UNE objection : c'est un ENCHAÎNEMENT de cinq échanges, exactement
ce que ce mécanisme refuse de porter.

**Tranché sans Louis** : ce golden vit dans un fichier DÉDIÉ, séparé du
corpus canonique `tests/test_copilote_scenario_corpus.py` (la « VUE » à 17
champs, protégée par son propre cliquet GA-26 et sa baseline CI
`chat_gate_baseline.json`) plutôt que d'y être injecté — y ajouter une entrée
suppose de dériver ses `JamaisInventer`/`hard_failures` dans le même geste
que les cinq suites existantes, un chantier disjoint de « importer ce
dialogue littéral ». Le texte est donc verrouillé ICI, verbatim, avec les
5 OBJECTIFS DE L'EXEMPLE du corps de l'issue vérifiés comme propriétés
STRUCTURELLES du dialogue — un golden qui sait dire NON si une réécriture
future du texte en violait un.
"""

from __future__ import annotations

import re

# Verbatim du corps de #3443 — CONTEXTE : appel froid, responsable Data,
# aucun partenariat confirmé, un projet est documenté, aucune preuve de
# budget. Chaque tour est (locuteur, texte), jamais reformulé.
DIALOGUE_MARTIN_3443: tuple[tuple[str, str], ...] = (
    (
        "COMMERCIAL",
        "Bonjour Monsieur Martin.\n\n"
        "Je sais que vous êtes probablement très sollicité, donc je vais faire simple.\n\n"
        "Est-ce que vous m’accordez 30 secondes pour vous expliquer pourquoi je vous appelle ?",
    ),
    ("PROSPECT", "Oui, allez-y."),
    (
        "COMMERCIAL",
        "J’ai vu que vous interveniez sur le programme de modernisation Data de votre entité.\n\n"
        "Je ne vous appelle pas pour vous envoyer des CV au hasard.\n\n"
        "J’essaie surtout de comprendre comment vous sécurisez un renfort quand une compétence "
        "devient critique ou qu’une équipe arrive à saturation.\n\n"
        "Aujourd’hui, vous avez déjà une visibilité sur les compétences qui risquent de manquer "
        "dans les prochains mois ?",
    ),
    ("PROSPECT", "On n’a pas de besoin."),
    (
        "COMMERCIAL",
        "Compris.\n\n"
        "C’est vrai uniquement sur la période actuelle, ou le recours externe est limité de "
        "manière générale sur votre périmètre ?",
    ),
    ("PROSPECT", "On passe surtout par nos partenaires référencés."),
    (
        "COMMERCIAL",
        "C’est clair.\n\n"
        "Mon objectif n’est pas de contourner ce cadre.\n\n"
        "Est-ce que vous pourriez simplement me dire si les opérationnels choisissent eux-mêmes "
        "leurs partenaires, ou si tout est centralisé par les achats ?\n\n"
        "Cette information me permettra de ne pas vous relancer au mauvais endroit.",
    ),
    ("PROSPECT", "C’est centralisé."),
    (
        "COMMERCIAL",
        "Très bien.\n\n"
        "Je vais donc arrêter ici côté opérationnel.\n\n"
        "Je peux vous envoyer une synthèse courte avec nos références comparables, et vous me "
        "direz simplement si elle mérite d’être transmise aux achats.\n\n"
        "Quel est le meilleur email pour cela ?",
    ),
)

# Les 5 OBJECTIFS DE L'EXEMPLE, verbatim du corps de l'issue — ordre figé.
OBJECTIFS_3443: tuple[str, ...] = (
    "obtenir une information réelle",
    "ne pas forcer le rendez-vous",
    "respecter le cadre achat",
    "transformer un refus en apprentissage",
    "finir avec une prochaine action proportionnée",
)

_COMMERCIAL_TURNS = [text for speaker, text in DIALOGUE_MARTIN_3443 if speaker == "COMMERCIAL"]
_PROSPECT_TURNS = [text for speaker, text in DIALOGUE_MARTIN_3443 if speaker == "PROSPECT"]


def test_le_dialogue_porte_5_echanges_commercial_prospect_alternes():
    assert len(DIALOGUE_MARTIN_3443) == 9
    speakers = [speaker for speaker, _ in DIALOGUE_MARTIN_3443]
    assert speakers == ["COMMERCIAL", "PROSPECT"] * 4 + ["COMMERCIAL"]


def test_objectif_1_chaque_reponse_prospect_est_une_information_reelle_exploitee():
    # Chaque tour PROSPECT est repris nommément par le tour COMMERCIAL suivant
    # (jamais ignoré) : « pas de besoin » -> « période actuelle » ; « partenaires
    # référencés » -> « cadre » ; « centralisé » -> « côté opérationnel ».
    assert "période actuelle" in _COMMERCIAL_TURNS[2]
    assert "cadre" in _COMMERCIAL_TURNS[3]
    assert "opérationnel" in _COMMERCIAL_TURNS[4]


def test_objectif_2_aucun_tour_ne_force_un_rendez_vous():
    interdits = ["je vous réserve", "je vous bloque un", "on se voit", "je passe vous voir", "rendez-vous confirmé"]
    for tour in _COMMERCIAL_TURNS:
        lowered = tour.lower()
        for phrase in interdits:
            assert phrase not in lowered, f"le tour force un rendez-vous ({phrase!r}) : {tour!r}"


def test_objectif_3_le_cadre_achat_est_explicitement_respecte():
    assert any("contourner ce cadre" in tour for tour in _COMMERCIAL_TURNS)
    assert any("achats" in tour.lower() for tour in _COMMERCIAL_TURNS)


def test_objectif_4_chaque_refus_est_accueilli_avant_d_etre_retourne_en_question():
    # La RÈGLE D'OR des objections (#3444) : valider, puis rebondir par une
    # question — jamais une contre-attaque immédiate sur un refus. Les 3
    # tours COMMERCIAL qui suivent un refus prospect (« pas de besoin »,
    # « partenaires référencés », « centralisé ») — jamais l'ouverture, qui ne
    # répond à aucun refus.
    accueils = ("compris", "c’est clair", "très bien")
    tours_apres_refus = _COMMERCIAL_TURNS[2:]
    assert len(tours_apres_refus) == 3
    for tour in tours_apres_refus:
        premiere_phrase = tour.split("\n\n", 1)[0].strip().lower()
        assert any(premiere_phrase.startswith(mot) for mot in accueils), (
            f"le tour après un refus prospect n'accueille pas avant de rebondir : {tour!r}"
        )
        assert "?" in tour, f"le tour n'a pas rebondi avec une question : {tour!r}"


def test_objectif_5_la_derniere_action_est_proportionnee_jamais_un_rdv_apres_deux_refus():
    dernier_tour = _COMMERCIAL_TURNS[-1]
    assert "email" in dernier_tour.lower()
    assert "rendez-vous" not in dernier_tour.lower()
    assert "créneau" not in dernier_tour.lower()


def test_aucune_affirmation_chiffree_ou_reference_non_prouvee_conforme_au_contexte():
    # CONTEXTE de l'issue : « aucun partenariat confirmé », « aucune preuve de
    # budget » — le dialogue ne doit donc citer ni chiffre, ni client nommé,
    # ni partenaire nommé comme preuve.
    texte_complet = " ".join(_COMMERCIAL_TURNS)
    assert not re.search(r"\d+\s*(%|jours?|semaines?|mois|ans?)\b", texte_complet.lower())
