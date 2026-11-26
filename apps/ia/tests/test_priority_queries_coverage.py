"""Les vingt requêtes prioritaires ont-elles un outil pour y répondre ?

Le PDF 9 §6.1 pose une exigence en tête de son premier lot : « JEU DE TESTS DE
ROUTAGE, AVANT TOUT OUTIL — les 20 requêtes prioritaires du PDF 6 §9.2 doivent
être routées vers le bon outil ».

CE QUE CE TEST FAIT, ET CE QU'IL NE FAIT PAS
--------------------------------------------
Il ne teste PAS le routage. Router demande d'appeler le modèle, donc une clé de
production dans les actions, vingt appels par poussée, et une garde qui rougit
parce qu'un modèle a tourné sa phrase autrement — c'est-à-dire une garde qu'on
finit par désactiver. Le dépôt a déjà tranché ce type d'arbitrage pour le jeu de
conversations de Laura Site : le rejeu live reste opt-in.

Il teste la moitié DÉTERMINISTE, et c'est celle qui a réellement échoué : au
21/08, le croisement du PDF 6 a mesuré que **quatorze des vingt requêtes** ne
pouvaient aboutir pour une seule raison — « API et écran existent, aucun outil
copilote ne les expose ». Un modèle ne route pas vers un outil qui n'existe pas.

Chaque requête déclare donc l'outil qui doit exister. Celles que le produit ne
sait toujours pas servir sont déclarées SANS outil, avec leur raison : un jeu de
recette qui n'énoncerait que ce qui marche ne serait pas un jeu de recette.
"""

from __future__ import annotations

from app.services.chat_tools import tools_for

#: Requête → outils dont AU MOINS UN doit exister pour qu'elle puisse aboutir.
#: Un tuple vide veut dire « le produit ne sait pas répondre », et la raison est
#: dans le commentaire qui suit.
PRIORITY_QUERIES: list[tuple[str, tuple[str, ...]]] = [
    ("Réponds en brouillon à tous mes non-lus", ("search_mailbox", "prepare_mail_draft")),
    ("Prépare mes relances pour les fils sans réponse depuis 7 jours", ("search_mailbox", "prepare_mail_draft")),
    ("Quels comptes prioriser cette semaine ?", ("compare_accounts", "list_accounts_to_act")),
    ("Quels comptes n'ont pas de prochaine action ?", ("list_accounts_to_act",)),
    ("Trouve les besoins actifs sur mes comptes", ("find_needs",)),
    ("Génère une shortlist pour ce besoin", ("run_matching",)),
    # Le studio de dossier de compétences existe côté API et écran ; le copilote
    # n'a aucun outil pour le déclencher, et lui en donner un ferait produire un
    # document envoyé à un client sans relecture.
    ("Crée un CV client pour ce consultant", ()),
    ("Compare ce consultant avec ce besoin", ("run_matching",)),
    ("Quels consultants repositionner ?", ("list_reactivation_pool", "search_talents")),
    ("Quelles missions finissent dans 30 jours ?", ("search_missions",)),
    ("Quelles missions sont à risque ?", ("get_mission_risks",)),
    ("Relance les CRA manquants", ("get_timesheets", "prepare_mail_draft")),
    ("Qu'est-ce qui bloque ma facturation ce mois-ci ?", ("get_invoice_blockers",)),
    # L'export existe (CSV), mais il rend un fichier à télécharger depuis
    # l'écran, pas un identifiant que le copilote pourrait joindre.
    ("Prépare les éléments de facturation à envoyer", ()),
    ("Prépare mon rendez-vous de demain", ("prepare_day_brief", "list_agenda")),
    # La création d'évènement est une ÉCRITURE. Le copilote n'a aucun chemin
    # d'écriture, par construction : ses outils proposent, le clic exécute.
    ("Crée un RDV « Société + Sujet » mardi 15 h avec visio", ()),
    ("Résume cet appel d'offres", ("search_rfps",)),
    ("Quelles références puis-je mobiliser ?", ("search_proofs",)),
    ("Où dois-je intervenir aujourd'hui ?", ("get_interventions", "prepare_day_brief")),
    # Aucune maille trimestrielle n'existe dans le produit, et aucun plan n'est
    # généré. C'est un chantier, pas un outil manquant.
    ("Analyse mon Q3 et propose un plan Q4", ()),
]

def catalogue() -> set[str]:
    """Le catalogue COMPLET, pas celui d'un espace particulier.

    ``tools_for(None)`` veut dire « on ne sait pas quels connecteurs sont
    branchés » et rend tout — c'est le repli du produit, et c'est exactement ce
    qu'on veut ici : filtrer par famille masquerait un outil réellement absent
    derrière un connecteur non branché.
    """
    return {tool["name"] for tool in tools_for(None)}


def test_le_catalogue_nest_pas_vide() -> None:
    """Sans quoi tout le reste passerait au vert sur zéro outil."""
    assert len(catalogue()) >= 25


def test_les_vingt_requetes_sont_declarees() -> None:
    assert len(PRIORITY_QUERIES) == 20
    assert len({query for query, _ in PRIORITY_QUERIES}) == 20


def test_chaque_requete_servable_a_son_outil() -> None:
    """L'outil déclaré existe RÉELLEMENT dans le catalogue.

    C'est ce qui a manqué : quatorze requêtes sur vingt échouaient parce que
    l'outil n'existait pas, quelle que soit la qualité du routage.
    """
    known = catalogue()
    missing: list[str] = []
    for query, tools in PRIORITY_QUERIES:
        for tool in tools:
            if tool not in known:
                missing.append(f"{query} → {tool}")
    assert missing == [], f"outils déclarés mais absents du catalogue : {missing}"


def test_le_jeu_dit_ce_quil_ne_sait_pas_servir() -> None:
    """Un jeu de recette qui n'énonce que ce qui marche n'est pas un jeu de recette.

    Quatre requêtes sur vingt restent sans outil, et chacune pour une raison
    écrite au-dessus d'elle : composer un dossier de compétences envoyé à un
    client sans relecture, rendre un identifiant de fichier que l'export ne
    produit pas, écrire dans un agenda (le copilote n'a aucun chemin
    d'écriture), et raisonner au trimestre (maille inexistante).
    """
    unserved = [query for query, tools in PRIORITY_QUERIES if not tools]
    assert len(unserved) == 4
    # Ce test tombe le jour où quelqu'un déclare tout servable sans avoir écrit
    # l'outil — c'est exactement la dérive qu'on veut voir arriver.
    assert len(unserved) < len(PRIORITY_QUERIES)


def test_la_couverture_ne_recule_pas() -> None:
    """Cliquet : seize requêtes sur vingt ont un outil. Le compte ne baisse pas."""
    served = [query for query, tools in PRIORITY_QUERIES if tools]
    assert len(served) >= 16
