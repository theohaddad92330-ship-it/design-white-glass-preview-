from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.models.progress import ProgressCallback


class ClassifyRequest(BaseModel):
    account_id: str
    contacts: list[dict] = []
    profile_data: dict = {}
    # Profil de l'ESN QUI VEND (annexe méthodo p3-4 : « la stratégie suit le profil »).
    # ``profile_data`` porte le compte CIBLE — sur le chemin on-demand c'est son
    # ``raw_analysis`` en entier, et sur le chemin pipeline son ``companyName`` écrase
    # celui du vendeur. Le bloc « PROFIL ESN » des prompts système et le boost vendeur
    # du /100 doivent lire CE champ. Vide (défaut) = repli sur ``profile_data``, donc
    # prompts byte-identiques — voir app.services.classification.seller_profile_for.
    esn_profile: dict = {}
    # Mémoire de corrections du compte (feedback loop A2) : directives factuelles
    # condensées côté API (« contact Y signalé parti »…). Vide (défaut) = prompts
    # byte-identiques — voir app.services.account_feedback.
    account_feedback: str = ""
    # #4070.3 — interlocuteurs déjà connus de l'espace (CRM, missions passées) :
    # ``[{name, role, relation, last_seen}]``. Ils départagent la priorité, ne filtrent
    # jamais. [] (défaut) = prompts byte-identiques.
    known_contacts: list[dict] = []
    # SalesContext du compte CIBLE (annexe p6/p26). p26 pèse « Accessibilité /
    # relation » comme un facteur ÉLEVÉ du /100 contact : le même décideur est
    # plus atteignable chez un client actif que chez un inconnu. Sur le chemin
    # on-demand la donnée arrive déjà dans ``profile_data`` (raw_analysis du
    # compte) ; ce champ permet de la passer EXPLICITEMENT depuis un appelant qui
    # ne pousse pas tout le raw_analysis. Vide (défaut) = grille historique.
    account_sales_context: dict = {}
    # Mémoire du graphe d'organigramme (Annexe Organigramme §5) : la version
    # courante et l'ardoise des éléments écartés. Reconstruire le graphe à la
    # demande sans ces deux-là ferait revenir un contact que l'utilisateur a
    # signalé parti et ferait reculer la version. Défauts (1, vide) = graphe
    # assemblé exactement comme un premier run.
    org_graph_version: int = 1
    org_rejected_items: list[dict] = []
    # ── Les sept blocs de contexte de l'organigramme (OrgGraph FINAL) ────────
    # Tous OPTIONNELS et vides par defaut : sans eux le prompt ecrit « non
    # fourni », ce que ses garde-fous traitent explicitement. Chaque bloc, sa
    # raison et les verrous qui l'assainissent : `app/services/org_context_blocks.py`.
    #
    # ⚠️ `workspace_corrections` fait entrer des donnees de PERSONNES dans un
    # prompt qui classe des gens. Aucun critere protege n'y voyage — liste
    # blanche de cles, liste blanche de champs corrigibles, nettoyage en sortie,
    # et la raison ecrite par l'humain (texte libre, donc non bornable) reste
    # au ledger. Gardes : tests/test_org_context_blocks.py et
    # tests/test_protected_criteria_scoring.py.
    workspace_corrections: list[dict] = []
    #: La direction visee par CETTE vague, quand elle en vise une.
    direction_scope: str = ""
    #: Les besoins ouverts sur ce compte — ce autour de quoi la decision se joue.
    project_context: list[dict] = []
    #: Ce que le graphe DEJA stocke sait : comptes + noms deja connus.
    existing_graph_summary: dict = {}
    #: Les preuves deja connues d'un lien, pour ne pas les faire reinventer.
    relation_evidence: list[dict] = []
    #: Combien de personnes existent sur ce compte, quand l'appelant le sait.
    #: `None` = non mesure — le bloc l'ECRIT plutot que d'ecrire 0.
    discovered_people: int | None = None
    #: Combien ont deja ete classees par un passage precedent.
    already_classified_people: int | None = None
    #: #2543.5a — l'etat de la source Apollo + la population qu'elle ANNONCE,
    #: mesures par une phase 2 PRECEDENTE. Un rejeu de classification (bouton
    #: « Enrichir l'organigramme ») ne relance aucune recherche Apollo : sans ce
    #: repassage explicite par l'appelant, `coverage.sourceStatus` retomberait a
    #: `None` et effacerait ce qu'une recherche recente avait mesure. `None`
    #: (defaut) = non mesure, jamais un "ok" devine.
    apollo_source_status: str | None = None
    apollo_total_entries: int | None = None
    #: #2543.5b — meme convention : le repli web mesure par une phase 2
    #: precedente, repasse tel quel sur un rejeu de classification.
    apollo_fallback: dict[str, Any] | None = None
    #: #2543.5g — meme convention : la passe d'elargissement mesuree par une
    #: phase 2 precedente, repassee telle quelle sur un rejeu de classification.
    apollo_widened: dict[str, Any] | None = None
    #: #3820 — le cadrage structure du run (``AnalysisScopeSelection``, ville/site
    #: compris), repasse tel quel sur un rejeu de classification : ce bouton ne
    #: relance aucune collecte, il ne fait que reclasser — le cadrage du run
    #: d'origine doit continuer a filtrer le chemin recommande, pas disparaitre.
    scope_selection: dict[str, Any] | None = None
    progress_callback: ProgressCallback | None = None


class ClassifyResponse(BaseModel):
    success: bool = True
    data: dict = {}
