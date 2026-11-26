"""#2796 — le corpus terrain RÉEL des 11 points de #1948 restés HORS LOT le
24/09 (registre `.claude/notes/registre-2026-09-12.md:866-921`) faute de
source : les deux PDF (`BellumAI_Meta_Analyse_Besoins_Utilisateurs_2026`,
`BellumAI_Meta_Analyse_Besoins_Workflows_Requetes`) viennent d'être extraits
du Drive de Louis et anonymisés (`agent_docs/sources/*.md`, gitignoré, lu par
chemin absolu — jamais commité). Ce fichier vérifie que ce que
`app/eval/terrain/*.json` importe correspond au CONTENU réel (comptages
exacts du document source, jamais un chiffre recopié sans les items), et
qu'un loader REFUSE une entrée malformée au lieu de la laisser passer en
silence — la même exigence que #1948 pose pour le corpus canonique lui-même
(« informations à ne jamais inventer »).
"""

from __future__ import annotations

import json

import pytest

from app.eval.terrain import loader


# ---------------------------------------------------------------------------
# #1948.2 — 100 sujets P1
# ---------------------------------------------------------------------------
# #1948.2
def test_besoins_p1_compte_100_items_repartis_par_outil():
    besoins = loader.load_besoins_p1()
    assert len(besoins) == 100
    par_outil: dict[str, int] = {}
    for b in besoins:
        assert b.outil, "chaque besoin P1 doit citer son outil"
        par_outil[b.outil] = par_outil.get(b.outil, 0) + 1
        assert 0 <= b.score <= 10
        assert b.besoin.strip() == b.besoin and b.besoin
    assert par_outil == {"Gmail": 35, "Agenda": 15, "HubSpot": 35, "BoondManager": 15}


# ---------------------------------------------------------------------------
# #1948.3 — 50 sujets P2
# ---------------------------------------------------------------------------
# #1948.3
def test_besoins_p2_compte_50_items():
    besoins = loader.load_besoins_p2()
    assert len(besoins) == 50
    rangs = [b.rang for b in besoins]
    assert rangs == list(range(1, 51))


# ---------------------------------------------------------------------------
# #1948.4 / #1948.15 / #1948.56 — 60 requêtes utilisateur (exécutables PRIO 1)
# ---------------------------------------------------------------------------
# #1948.4 #1948.15
def test_requetes_prio1_compte_60_et_verbatim_connu():
    requetes = loader.load_requetes_prio1()
    assert len(requetes) == 60
    assert [r.id for r in requetes] == list(range(1, 61))
    # Un verbatim connu, tel qu'il apparaît dans la source — preuve que rien
    # n'a été reformulé au passage (c'est exactement ce que #1948.15 exige).
    assert requetes[0].requete == (
        "Repondre en brouillon a tous mes emails non lus avec une reponse pro"
    )
    assert requetes[-1].requete == (
        "Apres reception d'un AO par email, creer brouillon de reponse et taches"
    )


# #1948.56
def test_requetes_conseil_compte_30():
    requetes = loader.load_requetes_conseil()
    assert len(requetes) == 30
    assert [r.id for r in requetes] == list(range(1, 31))


# ---------------------------------------------------------------------------
# #1948.5 — 25 triggers récurrents
# ---------------------------------------------------------------------------
# #1948.5 #1948.7
def test_triggers_compte_25_et_cible_le_meme_beta_testeur():
    triggers = loader.load_triggers()
    assert len(triggers) == 25
    assert [t.id for t in triggers] == list(range(1, 26))
    # Les messages produit s'adressent tous au même bêta-testeur nommé dans
    # la source (protocole de recette, section 12) — jamais un nom inventé.
    assert all(t.message_produit.startswith("Theo,") for t in triggers)


# ---------------------------------------------------------------------------
# #1948.1 — 604 réponses et besoins terrain
# ---------------------------------------------------------------------------
# #1948.1
def test_audit_terrain_604_reponses_et_58_repondants_numerotes():
    audit = loader.load_audit_terrain()
    assert audit.reponses_questionnaire == 604
    # 58 répondants numérotés, dont une paire fusionnée sur une seule ligne
    # d'audit ([répondant 40] / [répondant 41]) => 57 lignes.
    assert len(audit.respondants) == 57
    assert audit.respondants[-1].repondant == "[repondant 58]"
    fusionnes = [r for r in audit.respondants if " / " in r.repondant]
    assert len(fusionnes) == 1
    assert fusionnes[0].repondant == "[repondant 40] / [repondant 41]"
    # aucune donnée personnelle : jamais un nom propre, seulement le motif
    # [repondant N] posé par l'anonymisation de la source.
    for r in audit.respondants:
        assert "[repondant" in r.repondant


# ---------------------------------------------------------------------------
# #1948.10 — nouveaux parcours définis pour Laura
# ---------------------------------------------------------------------------
# #1948.10
def test_parcours_laura_compte_7_workflows_multi_outils():
    parcours = loader.load_parcours()
    assert len(parcours) == 7
    assert [p.id for p in parcours] == ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7"]
    for p in parcours:
        assert len(p.etapes) >= 4


# ---------------------------------------------------------------------------
# #1948.15 — formulation réelle (bibliothèque verbatim, second document)
# ---------------------------------------------------------------------------
# #1948.15
def test_verbatim_utilisateur_compte_42_reparties_en_7_categories():
    requetes = loader.load_verbatim_utilisateur()
    assert len(requetes) == 42
    categories = {r.categorie for r in requetes}
    assert len(categories) == 7
    assert all(r.requete.startswith("Ok Bellum,") for r in requetes)


# ---------------------------------------------------------------------------
# #1948.7 / #1948.8 — protocole de recette bêta (Theo) : format PASS/FAIL
# ---------------------------------------------------------------------------
# #1948.7 #1948.8
def test_protocole_recette_beta_8_champs_et_4_verdicts():
    protocole = loader.load_protocole_recette_beta()
    assert len(protocole.champs) == 8
    assert len(protocole.verdicts) == 4
    noms_verdicts = {v for v, _ in protocole.verdicts}
    assert noms_verdicts == {"PASS", "FAIL", "PARTIAL", "BLOCKED"}


# ---------------------------------------------------------------------------
# Une entrée malformée doit être REFUSÉE, jamais silencieusement acceptée.
# ---------------------------------------------------------------------------
def test_require_str_refuse_champ_absent():
    with pytest.raises(ValueError):
        loader._require_str({}, "requete", "test")


def test_require_str_refuse_chaine_vide():
    with pytest.raises(ValueError):
        loader._require_str({"requete": "   "}, "requete", "test")


def test_require_int_refuse_type_incorrect():
    with pytest.raises(ValueError):
        loader._require_int({"score": "10"}, "score", "test")


def test_load_besoins_p1_refuse_un_json_malforme(tmp_path, monkeypatch):
    malformed = {"besoins": [{"rang": 1, "score": 10}]}  # "besoin" manquant
    path = tmp_path / "besoins_p1_2026.json"
    path.write_text(json.dumps(malformed), encoding="utf-8")
    monkeypatch.setattr(loader, "_HERE", tmp_path)
    with pytest.raises(ValueError):
        loader.load_besoins_p1()


def test_load_parcours_refuse_des_etapes_vides(tmp_path, monkeypatch):
    malformed = {"parcours": [{"id": "7.1", "titre": "x", "etapes": []}]}
    path = tmp_path / "parcours_laura_2026.json"
    path.write_text(json.dumps(malformed), encoding="utf-8")
    monkeypatch.setattr(loader, "_HERE", tmp_path)
    with pytest.raises(ValueError):
        loader.load_parcours()


# #1948.56
def test_1948_56_recette_beta_queries_combinees_sans_reformulation():
    """#1948.56 — le corpus que Theo teste avec le protocole PASS/FAIL
    (`protocole_recette_beta_2026.json`, §12 de la source) est EXACTEMENT les
    60 requêtes exécutables + les 30 requêtes conseil + les 25 triggers —
    « Format à utiliser quand Theo teste les 60 + 30 requêtes et les 25
    triggers dans BellumAI » (verbatim de la source). On les combine ici tels
    quels, sans reformulation ni curation supplémentaire : c'est le jeu de
    recette bêta, la garde qui empêcherait un doublon ou une entrée vide d'y
    entrer silencieusement.
    """
    executables = [r.requete for r in loader.load_requetes_prio1()]
    conseil = [r.requete for r in loader.load_requetes_conseil()]
    triggers = [t.trigger for t in loader.load_triggers()]
    corpus_recette_beta = executables + conseil + triggers
    assert len(corpus_recette_beta) == 60 + 30 + 25
    assert len(set(corpus_recette_beta)) == len(corpus_recette_beta), "aucun doublon"
    assert all(q.strip() == q and q for q in corpus_recette_beta), "aucune entrée vide/mal-trimée"
    # Un verbatim connu par catégorie, preuve qu'aucune n'a été réécrite.
    assert "Analyse mes resultats Q3 2025 et cree plan d'action Q4" in corpus_recette_beta
    assert "Digest matin quotidien" in corpus_recette_beta


def test_load_audit_terrain_refuse_reponses_non_positif(tmp_path, monkeypatch):
    malformed = {
        "questionnaire_attente": {"reponses": 0, "repartition": []},
        "audit_terrain": [],
    }
    path = tmp_path / "audit_terrain_2026.json"
    path.write_text(json.dumps(malformed), encoding="utf-8")
    monkeypatch.setattr(loader, "_HERE", tmp_path)
    with pytest.raises(ValueError):
        loader.load_audit_terrain()
