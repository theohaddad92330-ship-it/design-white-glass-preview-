from typing import Literal

from pydantic import BaseModel, Field

from app.models.analysis_context import AnalysisContext
from app.models.progress import ProgressCallback


class ResearchRequest(BaseModel):
    company_name: str
    # Scope lock (Théo p.10) : SIREN de l'entité choisie par le commercial dans le
    # sélecteur de périmètre. Quand présent, la recherche Pappers s'ancre dessus
    # au lieu de re-résoudre le nom (ambigu pour un groupe : SG → ~100 SCI).
    siren: str | None = None
    # Périmètre d'analyse (Théo p.10/21) : groupe/france/filiales/it_digital/
    # startups/custom. Biaise la recherche (géo, familles, focus du prompt).
    scope_mode: str | None = None
    # #3820 — nom du site/ville QUAND `scope_mode == "site"` (lu sur
    # `scope_selection.geo_areas[0]`, `geo_perimeter == "city"` côté contrat —
    # le MÊME champ générique que #2163.12, jamais un second). Absent ⇒ la
    # consigne de périmètre reste générique (« un site précis, non nommé »).
    scope_city: str | None = None
    # #3288 — palier de profondeur (quick/verified/deep) choisi pour CE run ;
    # absent = verified, la collecte d'avant.
    depth: str | None = None
    # Cadrage analyse (15/10) — le cadrage confirmé du run (`scope_selection`, tel que
    # `graphScopeSelection` l'envoie) : postes à placer, priorités, entités ciblées /
    # exclues, thèmes exclus. Lu par `run_cadrage` ; absent ⇒ recherche inchangée.
    cadrage: dict | None = None
    # Pays cible (pack pays additif). Défaut "FR" = chemin français strictement
    # inchangé. Un pack (CH/BE/LU/US/CA) s'active dès que son pays est demandé
    # (country != FR) — zéro flag ; seules les sources à credential (Zefix CH)
    # restent no-op sans leurs clés. Liste :
    # app.services.country_packs.list_supported_countries().
    country: str = "FR"
    # Le site déjà connu du compte (tome 2 §13). Il ne sert qu'à dériver le slug
    # d'un board d'offres (Greenhouse, Lever) sans le deviner depuis le nom :
    # attribuer à un compte les offres du board d'un homonyme écrirait un signal
    # de recrutement FAUX. Absent (compte neuf) ⇒ seul Greenhouse est interrogé,
    # et uniquement s'il NOMME l'entreprise dans sa réponse.
    website: str | None = None
    profile_data: dict = {}
    user_context: AnalysisContext | str | None = None
    account_id: str = ""
    user_id: str = ""
    # Team scope (RAG grounding): the knowledge base is the ESN's, not the runner's.
    workspace_id: str = ""
    # Couche zéro (annexe méthodo p8) : résumé RÉEL de la présence de ce compte
    # dans le CRM connecté de l'ESN, rendu côté API. Non vide UNIQUEMENT quand le
    # CRM a matché quelque chose (contact ou deal ouvert) — c'est ce qui en fait
    # un booléen fiable pour ``salesContext.relationship`` (un compte déjà connu
    # n'est pas froid). Vide (défaut, et cas de tout workspace sans CRM connecté)
    # = SalesContext et prompts byte-identiques.
    crm_presence: str = ""
    # Couche zéro, hors CRM (annexe p8) : traces des autres outils internes de
    # l'ESN (Drive, notes, e-mails, ATS). Vide = aucune intégration connectée.
    internal_history: str = ""
    # #4070.1/.4 — les faits du compte (socle #4069, datés, sans provenance) et l'analyse
    # précédente en trace datée. [] / "" (défaut) = prompt byte-identique.
    account_facts: list[dict] = []
    previous_analysis: str = ""
    # #3753.3 — le ciblage que l'ESN a fait de CE compte (tier A/B/C, raison,
    # problématiques, projets IT), lu côté API sur la liste cible. Hypothèses du
    # VENDEUR : fournies, NON vérifiées — la phase 1 les injecte sous cette
    # étiquette (``seller_hypotheses.py``), jamais comme des faits collectés.
    # ``None`` (défaut, compte hors liste) = prompt byte-identique.
    seller_hypotheses: dict | None = None
    # Lot 14 (#1631.3/.4, #1606.2) — l'axe CHEMIN de l'adressabilité
    # (`_path_axis`, lot 13, `app.services.discover_scoring`). Le compte de
    # parcours AGRÉGÉ que la mémoire marché a observés vers ce compte, résolu
    # côté API par `MarketMemoryService.pathAxisFor` — la SEULE porte vers ses
    # tables partagées (GA-258). `None` (défaut) = aucun ingrédient transmis :
    # l'axe reste NON MESURÉ, byte-identique à avant ce lot.
    market_paths_observed: int | None = None
    # La société de services la PLUS observée sur ce compte, pour NOMMER la
    # preuve (« … relient ALTEN … ») plutôt que de rester anonyme. "" (défaut)
    # = l'axe reste vrai en désignant « des sociétés de services partenaires ».
    market_top_esn: str = ""
    # #2298.4 (décision Louis 19/09/2026) — les QUATRE sources ajoutées à
    # l'axe RELATION en plus du CRM (`crm_presence` ci-dessus), résolues côté
    # API et threadées jusqu'à `addressability_for_company` exactement comme
    # `crm_presence` l'est. Chacune n'ajoute rien tant que la donnée RÉELLE
    # n'existe pas en base — défauts `None`/vide = axe byte-identique à avant
    # ce lot. Market Memory et DataForge restent HORS de cette liste (voir le
    # docstring de `_relation_axis`, `app.services.discover_scoring`).
    relation_missions_count: int | None = None
    relation_last_meeting_at: str | None = None
    # MÉTADONNÉES seulement (une date) — jamais le corps d'un e-mail, doctrine
    # « le corps des messages ne sort jamais ».
    relation_last_email_at: str | None = None
    relation_human_correction: str | None = None
    declared_partners: list[str] | None = None
    # #3278.1 — "present" / "former" : lu sur les missions du compte côté API.
    consultant_history: Literal["present", "former"] | None = None
    # #3278.1 — un signal d'achat DÉCLARÉ (saisie ou import, #2634.1) existe sur
    # ce compte, lu côté API (`accounts.declared_signals`) : rend la route
    # « signal entrant » atteignable. `False` (défaut) = SalesContext byte-identique.
    declared_signal_present: bool = False
    # #2371.4 (#2887) — placements EN COURS sur la relation partenaire de même
    # SIREN (`partner_relations`, même espace), lus côté API. `None` (défaut) =
    # SalesContext byte-identique ; > 0 → stade « partenaire_actif ».
    partner_placements_active: int | None = Field(default=None, ge=0)
    # #3278.1 — signaux de route lus côté API (`watch_only`, `talent_from_account`,
    # `event_community`, `inbound_content`) : le plan asynchrone nomme les mêmes
    # routes que `/chat`. `None` (défaut) = SalesContext byte-identique.
    declared_route_signals: dict[str, bool] | None = None
    # Colonne du kanban commercial du compte (inbox / watching / opportunity /
    # customer / archived), telle que le commercial l'a posée côté API. C'est le
    # signal de relation le plus fiable qu'on possède après une déclaration
    # explicite : un compte « Client » ne doit pas être ouvert comme un compte
    # froid. Vide (défaut) ou `inbox` = relation inchangée → SalesContext
    # byte-identique. Une déclaration utilisateur (user_context) reste
    # prioritaire : le kanban n'est qu'une inférence.
    commercial_status: str = ""
    # LOT (15/10) DATA-A point 2 — vrai UNIQUEMENT pour le rafraîchissement quotidien de la veille
    # (watchlist) : la phase 1 reste servie par le cache 30 j, MAIS une recherche Brave News
    # ``freshness=pd`` (1 appel par compte, cache 1 j à part) y ajoute les nouveautés du jour.
    watch_refresh: bool = False
    progress_callback: ProgressCallback | None = None


class ResearchResponse(BaseModel):
    success: bool = True
    data: dict = {}
