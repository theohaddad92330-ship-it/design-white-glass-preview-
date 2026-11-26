"""#4070 — LE PIPELINE D'ANALYSE REÇOIT LES FAITS DU COMPTE (socle #4069) COMME INTRANT.

Décisions Louis 12/10 : toute la donnée accumulée est un intrant du TRAITEMENT ;
aucune coupure d'âge, un fait est toujours DATÉ (« il y a 14 mois »), un besoin
qui revient est un signal fort ; JAMAIS de provenance nommée ; aucune probabilité.

Chaque test NON prouve que la garde sait dire non (elle lit quelque chose)."""

from __future__ import annotations

import re

import pytest

from app.services.analysis_account_facts import (
    FACTS_BLOCK_MAX_CHARS,
    MAX_FACTS,
    account_facts_block,
    age_phrase,
    has_positive_rex_from_facts,
    known_contacts_block,
    normalize_account_facts,
    previous_analysis_block,
    sector_referential_block,
)

# Les noms qui ne doivent JAMAIS sortir d'un bloc comme provenance d'un fait.
_PROVENANCE = re.compile(
    r"dataforge|orion|mémoire marché|memoire marche|market memory|signal_history|crm_deal_facts|rag_documents|"
    r"hubspot|salesforce|pipedrive|apollo|pappers|firecrawl|brave|bodacc|boamp|france travail",
    re.IGNORECASE,
)


def _fact(kind: str, label: str, date: str, age_days: int) -> dict:
    return {"kind": kind, "label": label, "date": date, "age_days": age_days}


FACTS = [
    _fact("need", "Migration paie cloud", "2025-08-12", 426),
    _fact("need", "Migration paie cloud (second appel)", "2026-03-02", 224),
    _fact("deal_lost", "TMA SI RH", "2024-06-01", 863),
    _fact("deal_won", "Refonte portail achats", "2023-02-10", 1340),
    _fact("deal_dormant", "Renfort data platform", "2026-01-15", 270),
    _fact("mission", "Mission support N3 chez ce client", "2025-01-06", 644),
    _fact("hiring", "5 postes Java ouverts", "2026-10-01", 11),
    _fact("signal", "Annonce de levée de fonds", "2026-09-20", 22),
    _fact("correction", "Le directeur SI a quitté l'entreprise", "2026-08-01", 72),
    _fact("meeting", "RDV de cadrage avec la DSI", "2026-05-20", 145),
    _fact("market_observation", "prestataires observés : Alpha Conseil", "2026-06-30", 104),
]


# ── normalisation : un fait invalide ne fait aucune ligne, jamais une ligne devinée ──


def test_normalise_garde_l_ordre_recu_qui_est_celui_du_poids():
    out = normalize_account_facts(FACTS)
    assert [f["label"] for f in out][:2] == ["Migration paie cloud", "Migration paie cloud (second appel)"]


def test_NON_un_fait_sans_date_sans_libelle_ou_de_nature_inconnue_ne_fait_aucune_ligne():
    raw = [
        _fact("need", "ok", "2025-01-01", 10),
        {"kind": "need", "label": "sans date", "age_days": 3},
        _fact("need", "", "2025-01-01", 10),
        _fact("provider_feed", "nature inconnue", "2025-01-01", 10),
        _fact("need", "date devinée", "mars 2023", 10),
        {"kind": "need", "label": "âge négatif", "date": "2025-01-01", "age_days": -4},
        "pas un objet",
        None,
    ]
    assert [f["label"] for f in normalize_account_facts(raw)] == ["ok"]


def test_NON_normalise_ne_garde_aucune_cle_de_provenance():
    out = normalize_account_facts(
        [{**_fact("signal", "Levée", "2026-09-20", 22), "source": "pappers", "provider": "x"}]
    )
    assert set(out[0]) == {"kind", "label", "date", "age_days"}


def test_normalise_dedoublonne_et_borne():
    dup = [_fact("signal", "Même fait", "2026-09-20", 22)] * 3
    assert len(normalize_account_facts(dup)) == 1
    many = [_fact("signal", f"fait numéro {i}", "2026-09-20", 22) for i in range(MAX_FACTS + 25)]
    assert len(normalize_account_facts(many)) == MAX_FACTS


def test_normalise_rien_en_entree_rien_en_sortie():
    assert normalize_account_facts(None) == []
    assert normalize_account_facts([]) == []
    assert normalize_account_facts("pas une liste") == []


# ── l'âge se dit en mots, une seule fois, ici ──


@pytest.mark.parametrize(
    ("days", "phrase"),
    [(0, "aujourd'hui"), (1, "il y a 1 jour"), (22, "il y a 22 jours"), (426, "il y a 14 mois"), (863, "il y a 2 ans")],
)
def test_age_en_mots(days, phrase):
    assert age_phrase(days) == phrase


# ── .1 « pourquoi maintenant » : l'historique complet décoté, la récurrence = fort ──


def test_recherche_sans_fait_aucun_bloc():
    assert account_facts_block([], "research") == ""
    assert account_facts_block(None, "research") == ""


def test_recherche_lit_tout_l_historique_date_et_dit_que_la_recurrence_est_forte():
    block = account_facts_block(normalize_account_facts(FACTS), "research")
    assert "[2025-08-12 · il y a 14 mois] Besoin : Migration paie cloud" in block
    assert "[2026-10-01 · il y a 11 jours] Recrutement : 5 postes Java ouverts" in block
    lowered = block.lower()
    assert "pourquoi maintenant" in lowered
    assert "revient" in lowered and "signal fort" in lowered
    # Un fait ancien ne se présente jamais comme récent.
    assert "jamais" in lowered and "récent" in lowered


def test_recherche_ne_recoit_pas_les_notes_et_comptes_rendus_de_rdv():
    block = account_facts_block(normalize_account_facts(FACTS), "research")
    assert "RDV de cadrage" not in block


# ── .2 plan + messages : affaires gagnées / perdues / sommeil, missions passées ──


def test_plan_recoit_les_affaires_les_missions_et_leur_date():
    block = account_facts_block(normalize_account_facts(FACTS), "plan")
    assert "Affaire perdue : TMA SI RH" in block
    assert "Affaire gagnée : Refonte portail achats" in block
    assert "Affaire en sommeil : Renfort data platform" in block
    assert "Mission : Mission support N3 chez ce client" in block
    assert "il y a 2 ans" in block
    lowered = block.lower()
    assert "perdue" in lowered and "sommeil" in lowered and "gagnée" in lowered


def test_messages_recoivent_un_bloc_court_sans_notes():
    block = account_facts_block(normalize_account_facts(FACTS), "messages")
    assert "Affaire perdue : TMA SI RH" in block
    assert "RDV de cadrage" not in block


def test_la_correction_de_l_equipe_gagne_dans_chaque_phase():
    for phase in ("research", "plan", "messages"):
        block = account_facts_block(normalize_account_facts(FACTS), phase)
        assert "Correction de l'équipe : Le directeur SI a quitté l'entreprise" in block, phase
        assert "correction" in block.lower() and "prime" in block.lower(), phase


@pytest.mark.parametrize("phase", ["research", "plan", "messages"])
def test_NON_aucun_bloc_ne_nomme_une_source_ni_une_probabilite(phase):
    block = account_facts_block(normalize_account_facts(FACTS), phase)
    assert _PROVENANCE.search(block) is None
    lowered = block.lower()
    assert "provenance" in lowered and "jamais" in lowered
    assert "probabilit" in lowered
    assert "%" not in block


@pytest.mark.parametrize("phase", ["research", "plan", "messages"])
def test_NON_le_bloc_est_borne_en_caracteres(phase):
    many = [_fact("signal", "x" * 280 + str(i), "2026-09-20", 22) for i in range(200)]
    block = account_facts_block(normalize_account_facts(many), phase)
    assert len(block) <= FACTS_BLOCK_MAX_CHARS


def test_NON_phase_inconnue_ne_rend_rien():
    assert account_facts_block(normalize_account_facts(FACTS), "inconnue") == ""


def test_has_positive_rex_lit_les_faits_pas_un_drapeau():
    assert has_positive_rex_from_facts(normalize_account_facts(FACTS)) is True
    assert has_positive_rex_from_facts(normalize_account_facts([_fact("deal_lost", "TMA", "2024-06-01", 863)])) is False
    assert has_positive_rex_from_facts([]) is False
    assert has_positive_rex_from_facts(None) is False


# ── .2 DataForge du secteur : repères sectoriels, jamais le nom du référentiel ──


def test_repere_sectoriel_sans_nom_de_pack():
    chunks = [
        {
            "titre": "Achats IT dans la banque",
            "texte": "Les DSI bancaires consolident leurs prestataires.",
            "entreprise": None,
        },
        {"titre": "DORA", "texte": "Résilience opérationnelle.", "niveau_confiance": "HAUTE"},
    ]
    block = sector_referential_block(chunks)
    assert "Achats IT dans la banque" in block
    assert "repères" in block.lower() and "secteur" in block.lower()
    assert _PROVENANCE.search(block) is None


def test_repere_sectoriel_vide_rien():
    assert sector_referential_block([]) == ""
    assert sector_referential_block(None) == ""
    assert sector_referential_block([{"titre": "", "texte": ""}]) == ""


def test_NON_repere_sectoriel_borne():
    chunks = [{"titre": f"t{i}", "texte": "y" * 2000} for i in range(30)]
    assert len(sector_referential_block(chunks)) < 4000


# ── .3 priorisation des contacts : connus du CRM, interlocuteurs de missions passées ──


def test_contacts_connus_sans_contact_aucun_bloc():
    assert known_contacts_block([]) == ""
    assert known_contacts_block(None) == ""


def test_contacts_connus_dit_la_relation_la_date_et_ne_filtre_pas():
    block = known_contacts_block(
        [
            {"name": "Claire Martin", "role": "DSI", "relation": "crm", "last_seen": "2025-11-03"},
            {"name": "Paul Durand", "role": None, "relation": "mission", "last_seen": "2024-02-01"},
        ]
    )
    assert "Claire Martin" in block and "DSI" in block
    assert "Paul Durand" in block
    assert "votre CRM" in block
    assert "mission" in block.lower()
    lowered = block.lower()
    # Il départage, il n'écarte pas, et il n'invente personne.
    assert "départage" in lowered or "ordre" in lowered
    assert "n'ajoute" in lowered or "n'invente" in lowered
    assert _PROVENANCE.search(block) is None


def test_NON_contacts_connus_ignore_les_entrees_sans_nom_et_plafonne():
    contacts = [{"name": "", "relation": "crm"}, {"relation": "crm"}, "x", None] + [
        {"name": f"Personne {i}", "relation": "crm"} for i in range(60)
    ]
    block = known_contacts_block(contacts)
    assert "Personne 0" in block
    assert "Personne 59" not in block
    assert block.count("Personne ") <= 20


def test_NON_contacts_connus_une_relation_inconnue_n_est_pas_devinee():
    block = known_contacts_block([{"name": "Alex Roy", "relation": "cousin"}])
    assert "Alex Roy" not in block


# ── .4 une ré-analyse relit l'analyse précédente ; la correction gagne toujours ──


def test_analyse_precedente_vide_aucun_bloc():
    assert previous_analysis_block("") == ""
    assert previous_analysis_block(None) == ""
    assert previous_analysis_block("   ") == ""


def test_analyse_precedente_est_une_trace_datee_et_la_correction_gagne():
    text = (
        "Analyse du 2026-06-18 (il y a 4 mois)\n- Secteur : Banque\n- Siège : Lyon (corrigé par l'équipe le 2026-07-01)"
    )
    block = previous_analysis_block(text)
    assert "Siège : Lyon (corrigé par l'équipe" in block
    lowered = block.lower()
    assert "correction" in lowered and "gagne" in lowered
    assert "trace" in lowered
    assert "jamais" in lowered
    assert _PROVENANCE.search(block) is None


def test_NON_analyse_precedente_bornee():
    assert len(previous_analysis_block("ligne\n" * 5000)) < 6000
