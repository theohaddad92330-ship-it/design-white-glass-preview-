"""p26 — « Preuve / confiance : BLOQUANT si faible » + la relation dans le /100.

Deux trous fermés ici.

1. La grille p26 liste sept facteurs. Six étaient implémentés ; le septième —
   « Preuve / confiance » — était absent, et c'est le SEUL du tableau dont le
   poids n'est pas « élevé/moyen » mais **bloquant**. Aucun plancher de preuve ne
   pouvait donc faire tomber un contact : une reconstruction IA sans e-mail, sans
   LinkedIn et sans source vérifiable pouvait sortir « prioritaire maintenant ».
   C'est exactement le contact que le commercial appelle avant de découvrir qu'il
   n'existe pas.

2. p26 pèse « Accessibilité / RELATION » comme un facteur élevé, mais l'état de
   relation du compte n'entrait nulle part dans le /100.
"""

from __future__ import annotations

from app.services.contact_priority_score import (
    SellerContext,
    contact_priority_score,
    contact_reachability,
    priority_band,
)

# Un décideur parfait sur le papier : rôle economic, C-level, périmètre pile
# dessus. Seule sa PREUVE varie d'un test à l'autre.
_DECIDEUR = {
    "role": "economic",
    "hierarchyLevel": "c_level",
    "title": "Directeur des Systèmes d'Information",
    "perimeterMatch": True,
    "angleMatch": True,
}


class TestPlancherDePreuve:
    def test_un_contact_sans_aucune_preuve_ne_peut_pas_etre_prioritaire(self) -> None:
        """« Bloquant si faible » : quelle que soit la qualité du rôle, un contact
        qu'on ne peut pas prouver ne remonte pas en tête de liste."""
        fantome = {**_DECIDEUR, "source": "ia_reconstruction"}

        assert priority_band(contact_priority_score(fantome)) != "haute"

    def test_le_meme_contact_prouve_redevient_prioritaire(self) -> None:
        """TÉMOIN : on ajoute la SEULE chose qui manquait — une preuve. Si le
        plancher se mettait à bloquer tout le monde, ce témoin tomberait."""
        prouve = {**_DECIDEUR, "source": "apollo", "linkedin_url": "https://linkedin.com/in/x"}

        assert priority_band(contact_priority_score(prouve)) == "haute"

    def test_une_reconstruction_ia_avec_linkedin_verifiable_n_est_pas_bloquee(self) -> None:
        """Le plancher porte sur la PREUVE, pas sur le fournisseur : une piste
        reconstruite mais vérifiable (URL LinkedIn) n'est pas un fantôme."""
        verifiable = {
            **_DECIDEUR,
            "source": "ia_reconstruction",
            "linkedin_url": "https://linkedin.com/in/verifiable",
        }

        assert priority_band(contact_priority_score(verifiable)) == "haute"

    def test_un_email_professionnel_vaut_preuve(self) -> None:
        avec_email = {**_DECIDEUR, "source": "brave_search", "email": "prenom.nom@client.fr"}

        assert priority_band(contact_priority_score(avec_email)) == "haute"

    def test_le_plancher_ne_remonte_jamais_un_score(self) -> None:
        """Un plancher ne peut que BAISSER : un contact faible reste faible."""
        faible = {"role": "blocker", "hierarchyLevel": "operationnel", "source": "apollo"}

        assert priority_band(contact_priority_score(faible)) != "haute"


class TestLaRelationEntreDansLeScore:
    def test_un_client_actif_rend_ses_contacts_plus_accessibles(self) -> None:
        """p26 : « Accessibilité / relation » est un facteur ÉLEVÉ. Lot 758 (arbitrage
        Louis 31/10/2026) : l'accessibilité sort du score de PERTINENCE et devient une
        pastille — la relation y reste NOMMÉE, elle ne gonfle plus le score."""
        contact = {**_DECIDEUR, "source": "apollo", "email": "d@client.fr"}
        froid = contact_priority_score(contact, SellerContext(relationship_state="froid"))
        client = contact_priority_score(contact, SellerContext(relationship_state="client_actif"))

        assert client == froid
        pastille = contact_reachability(contact, SellerContext(relationship_state="client_actif"))
        assert pastille is not None and "porte déjà ouverte" in pastille["proof"]

    def test_temoin_sans_etat_de_relation_le_score_est_celui_d_avant(self) -> None:
        """SÛRETÉ : un appelant qui ne passe pas la relation obtient exactement le
        score historique — aucun compte existant ne bouge sans donnée nouvelle."""
        contact = {**_DECIDEUR, "source": "apollo"}

        assert contact_priority_score(contact, SellerContext()) == contact_priority_score(
            contact, SellerContext(relationship_state="froid")
        )

    def test_la_relation_est_reellement_lue_sur_le_chemin_live(self) -> None:
        """« Calculé sans consommateur » est le piège récurrent du projet : le
        boost ne vaut rien s'il n'atteint pas le tri réel. Sur le chemin
        on-demand, `profile_data` porte le raw_analysis du compte — donc son
        SalesContext. C'est là qu'on lit la relation."""
        from app.models.classify import ClassifyRequest
        from app.services.classification import account_relationship_state

        req = ClassifyRequest(
            account_id="a-1",
            profile_data={"salesContext": {"relationship": {"state": "client_actif"}}},
        )

        assert account_relationship_state(req) == "client_actif"

    def test_un_dossier_sans_sales_context_ne_change_rien(self) -> None:
        from app.models.classify import ClassifyRequest
        from app.services.classification import account_relationship_state

        assert account_relationship_state(ClassifyRequest(account_id="a-1")) == ""

    def test_la_relation_ne_peut_pas_faire_deborder_la_grille(self) -> None:
        contact = {**_DECIDEUR, "source": "apollo"}
        for state in ("froid", "connu", "linkedin", "dormant", "refere", "ancien_client",
                      "rang2", "client_actif", "besoin_ouvert", "etat_invente"):
            score = contact_priority_score(contact, SellerContext(relationship_state=state))
            assert 0 <= score <= 100, state
