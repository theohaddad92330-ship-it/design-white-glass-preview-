"""#3178.5 (#3227, LAU-FINAL-184) — LE CORPUS D'ÉVALUATION DES CINQ SCÉNARIOS.

Le corps de l'issue #3178 NOMME cinq scénarios précis :

    Société Générale → SG CIB → BoursoBank → « les autres filiales »
    Groupe BPCE → BPCE SI → banques régionales
    Vinci → Vinci Energies → filiales françaises
    Airbus → Airbus Atlantic → groupe
    La Poste → Docaposte → autres entités numériques

`test_chat_thread_group_scope.py` (lot précédent, #3178.1/#3178.2) prouve déjà
le mécanisme GÉNÉRIQUE du NO-GO sur UN cas (Société Générale/BoursoBank) ; ce
fichier verse les CINQ scénarios nommés par la spec, chacun un vrai parcours
MULTI-TOURS (citer le groupe, puis une filiale de premier niveau, puis une
filiale de second niveau, puis vérifier que le périmètre n'a toujours pas
bougé) plutôt qu'un unique appel.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE FICHIER VÉRIFIE, ET CE QU'IL NE VÉRIFIE PAS
─────────────────────────────────────────────────────────────────────────────
Comme `test_copilote_scope_eval.py` (jeu de référence voisin) et pour la MÊME
raison qu'il documente en tête : aucun appel au modèle — cher, lent, non
déterministe. Chaque scénario rejoue le COLLECTEUR déterministe
(`ThreadStateCollector`, la même traversée que `chat_orchestrator.py` prend
réellement) avec les sorties d'outils que le modèle produirait dans ce
scénario, et vérifie que `persistent_scope` en ressort correct. C'est un
scénario « contre le modèle » au sens où il rejoue LA CONVERSATION exacte du
tableau TESTS — mais contre le MÉCANISME qui applique la règle, pas contre un
appel réseau au modèle lui-même : c'est délibéré (voir
`test_copilote_scope_eval.py`, § « CE QU'UNE ENTRÉE VÉRIFIE »), et c'est ce
qui rend ce corpus reproductible en CI plutôt que non déterministe et payant.
"""

from __future__ import annotations

from app.services.chat_thread_state import ThreadState, ThreadStateCollector


def _collector() -> ThreadStateCollector:
    return ThreadStateCollector(ThreadState())


def _set_group_scope(collector: ThreadStateCollector, *, root_id: str, root_label: str) -> None:
    """Le modèle NOMME le périmètre via `note_thread_context`, jamais extrait
    d'une phrase — même geste que le tour 1 de chaque scénario réel."""
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "group_scope_root": {"id": root_id, "label": root_label}},
    )


def _cite_as_focus(collector: ThreadStateCollector, *, account_id: str, company_name: str) -> None:
    """Laura cite une entité comme SUJET de ce tour (`get_account_briefing`,
    #1927.1) — bascule `focus`, jamais `persistent_scope`."""
    collector.record(
        "get_account_briefing",
        {"account_id": account_id},
        {"account_id": account_id, "company_name": company_name},
    )


def _assert_scope_untouched(collector: ThreadStateCollector, *, root_id: str, root_label: str) -> None:
    scope = collector.state.persistent_scope
    assert scope is not None
    assert scope.root_entity.id == root_id
    assert scope.root_entity.label == root_label


# ── 1. Société Générale → SG CIB → BoursoBank → « les autres filiales » ─────


def test_societe_generale_sg_cib_boursobank_the_other_subsidiaries() -> None:
    collector = _collector()
    _set_group_scope(collector, root_id="acc-sg", root_label="Groupe Société Générale")

    # « Tu as des projets, filiales ou clients internes où les consultants ont
    # été observés ? » — Laura cite SG CIB.
    _cite_as_focus(collector, account_id="acc-sgcib", company_name="SG CIB")
    _assert_scope_untouched(collector, root_id="acc-sg", root_label="Groupe Société Générale")

    # Laura cite ensuite BoursoBank (le cas exact du retour bêta #3178).
    _cite_as_focus(collector, account_id="acc-bb", company_name="BoursoBank")
    _assert_scope_untouched(collector, root_id="acc-sg", root_label="Groupe Société Générale")

    # « Et les autres filiales ? » — le NO-GO exact : la question doit se
    # résoudre sur le GROUPE entier, pas sur les seules filiales de
    # BoursoBank. Le périmètre que Laura relit pour y répondre est toujours
    # Société Générale, jamais réduit silencieusement à BoursoBank.
    assert collector.state.focus_of("account").label == "BoursoBank"
    _assert_scope_untouched(collector, root_id="acc-sg", root_label="Groupe Société Générale")


# ── 2. Groupe BPCE → BPCE SI → banques régionales ───────────────────────────


def test_groupe_bpce_bpce_si_regional_banks() -> None:
    collector = _collector()
    _set_group_scope(collector, root_id="acc-bpce", root_label="Groupe BPCE")

    _cite_as_focus(collector, account_id="acc-bpce-si", company_name="BPCE SI")
    _assert_scope_untouched(collector, root_id="acc-bpce", root_label="Groupe BPCE")

    # « Et les banques régionales ? » — une famille de filiales, pas une
    # entité unique : la question doit rester posée sur le groupe entier.
    _cite_as_focus(collector, account_id="acc-caisse-epargne", company_name="Caisse d'Épargne Île-de-France")
    _assert_scope_untouched(collector, root_id="acc-bpce", root_label="Groupe BPCE")


# ── 3. Vinci → Vinci Energies → filiales françaises ─────────────────────────


def test_vinci_vinci_energies_french_subsidiaries() -> None:
    collector = _collector()
    _set_group_scope(collector, root_id="acc-vinci", root_label="Vinci")

    _cite_as_focus(collector, account_id="acc-vinci-energies", company_name="Vinci Energies")
    _assert_scope_untouched(collector, root_id="acc-vinci", root_label="Vinci")

    _cite_as_focus(collector, account_id="acc-vinci-construction", company_name="Vinci Construction France")
    _assert_scope_untouched(collector, root_id="acc-vinci", root_label="Vinci")


# ── 4. Airbus → Airbus Atlantic → groupe ────────────────────────────────────


def test_airbus_airbus_atlantic_back_to_the_group() -> None:
    collector = _collector()
    _set_group_scope(collector, root_id="acc-airbus", root_label="Airbus")

    _cite_as_focus(collector, account_id="acc-airbus-atlantic", company_name="Airbus Atlantic")
    _assert_scope_untouched(collector, root_id="acc-airbus", root_label="Airbus")

    # « Reviens sur le groupe entier » — un retour explicite au groupe : le
    # périmètre n'a jamais bougé, il n'y a donc rien à restaurer, seulement à
    # confirmer qu'il tient toujours après la citation d'Airbus Atlantic.
    assert collector.state.focus_of("account").label == "Airbus Atlantic"
    _assert_scope_untouched(collector, root_id="acc-airbus", root_label="Airbus")


# ── 5. La Poste → Docaposte → autres entités numériques ─────────────────────


def test_la_poste_docaposte_other_digital_entities() -> None:
    collector = _collector()
    _set_group_scope(collector, root_id="acc-laposte", root_label="La Poste")

    _cite_as_focus(collector, account_id="acc-docaposte", company_name="Docaposte")
    _assert_scope_untouched(collector, root_id="acc-laposte", root_label="La Poste")

    # « Et les autres entités numériques du groupe ? » — même famille de
    # question que le scénario 1 (Société Générale/BoursoBank), sur un groupe
    # différent : le périmètre reste La Poste, jamais réduit à Docaposte.
    _cite_as_focus(collector, account_id="acc-docaposte-agility", company_name="Docaposte Agility")
    _assert_scope_untouched(collector, root_id="acc-laposte", root_label="La Poste")
