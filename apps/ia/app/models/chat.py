from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class PinnedMemoryItem(BaseModel):
    """Un élément de mémoire épinglé, avec sa NATURE et son ORIGINE (#1962).

    Miroir — restreint aux trois champs que le prompt lit réellement — du
    contrat TS `PinnedMemoryContextItem` (`packages/contracts/src/schemas/
    memory-item.ts`), lui-même un sous-ensemble de `MemoryItem`.

    ⚠️ `kind` / `origin` sont des `str` NUES, pas un `Literal` : un `Literal`
    REJETTERAIT toute la requête de chat (422) sur UN SEUL élément de mémoire
    portant une valeur inconnue — mesuré en écrivant ce modèle, avant tout
    déploiement. Un fait mal formé ne doit jamais faire tomber le TOUR entier.
    La validation tolérante (retombe sur `fact`/`manual`) vit dans
    `bellum_advisor._pinned_memory_fields`, seul lecteur de ce champ — « un
    champ illisible ne s'invente jamais, il redevient ce qu'il valait avant
    #1962 » s'applique à la LECTURE, pas à l'entrée.
    """

    fact: str
    kind: str = "fact"
    origin: str = "manual"
    # Q1 (décision de Louis du 13/09) — une note de Laura dont une PERSONNE a
    # réécrit le texte est confirmée : l'origine reste `copilot`, le rang devient
    # celui d'un fait déclaré. ⚠️ `Any`, pas `bool` : pydantic convertirait une
    # chaîne « true » d'un appelant mal formé en `True` et promouvrait la note ;
    # un `StrictBool` rejetterait tout le tour (422). La lecture STRICTE (seul un
    # vrai booléen confirme) vit dans `bellum_advisor._pinned_memory_fields`.
    # Absent (API d'avant) = non confirmée, le rang d'avant.
    confirmed: Any = False
    # #3892.1 (ADD-SANOFI-06, retour bêta 08/10/2026) — le NOM du compte auquel
    # CET élément est borné, résolu server-side
    # (`AccountsService.namesForAccounts`) — jamais un UUID, jamais deviné ici.
    # Absent = règle générale de l'ESN (aucun compte), ou compte que la
    # résolution n'a pas pu nommer : les deux se lisent alors SANS étiquette,
    # jamais une étiquette inventée.
    account_name: str | None = None


class ChatAttachedFile(BaseModel):
    """#2148.16 — une pièce jointe de CONVERSATION (cas a) : déjà extraite par
    `/rag/extract` côté client, transmise en clair pour CE tour, jamais
    persistée. Distincte d'un `document_ids` : celui-là pointe une ligne de
    `rag_documents` (cas b, geste explicite « base de connaissance »)."""

    name: str
    text: str


class ReplyTransform(BaseModel):
    """#3768 — miroir de `replyTransformRequestSchema` (packages/contracts)."""

    id: Literal[
        "deepen",
        "synthesize",
        "more_accounts",
        "less_detail",
        "justify",
        "priorities_only",
        "action_plan",
        "exportable_list",
    ]
    source_text: str = Field(min_length=1, max_length=12000)
    layout: Literal["table", "list", "plan", "prose"]
    account_ids: list[str] = Field(default_factory=list, max_length=25)
    reserves: list[str] = Field(default_factory=list, max_length=6)


class FollowUpRef(BaseModel):
    """#4397 (N1) — l'objet qu'une SUITE cliquée désigne, en métadonnée : le texte du message ne porte
    jamais d'identifiant. Miroir de ``followUpRefSchema`` (packages/contracts)."""

    talent_id: str = Field(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class ChatRequest(BaseModel):
    message: str
    user_id: str
    # Team scope (RAG grounding) — the copilot cites the team's documents.
    workspace_id: str = ""
    account_id: str = ""
    history: list[dict] = []
    # Documents que l'utilisateur a JOINTS à cette conversation (identifiants de
    # `rag_documents`). Vide par défaut : un appelant qui ne les envoie pas
    # obtient exactement le prompt d'avant. Le contenu est chargé ICI, scopé au
    # user/workspace — un identifiant venu du client ne lit pas le document d'un
    # autre.
    document_ids: list[str] = []
    # #2148.16 — la pièce jointe de CONVERSATION (cas a) : le texte est déjà là
    # (extrait par `/rag/extract`, jamais ingéré), lu pour CE tour seulement.
    # Vide par défaut : un appelant qui ne l'envoie pas obtient un prompt
    # byte-identique. Bornée par `rag_service.format_attached_documents` — le
    # même budget que les documents joints (`ATTACHED_DOC_MAX`/`_CHARS`).
    attached_files: list[ChatAttachedFile] = []
    # #1954.7 — le fil COURANT (Louis, 12/09/2026). Borne
    # `fetch_documents_by_ids` : un document JOINT `scope="conversation"` n'est
    # lu que par les tours de chat de ce fil — tous, pas seulement celui qui
    # l'a joint (#1954) — et par son AUTEUR : les identifiants de fil sont
    # déterministes (`general`, `account-<uuid>`), donc partagés entre collègues
    # (voir `rag_service.fetch_documents_by_ids`). "" (défaut) = pas de fil
    # lisible — la route MCP, ou un fil RANGÉ, que NestJS ne transmet pas
    # (`ia.client.ts::chatBody`, `ChatThreadDocumentsService.readableThread`) :
    # fail closed, aucun document `conversation` ne peut matcher.
    conversation_id: str = ""
    account_data: dict = {}
    contacts_summary: str = ""
    plan_summary: str = ""
    # Portfolio digest injected when no single account is active (Théo §13) so the
    # shared thread can reason about the workspace's accounts.
    accounts_summary: str = ""
    profile_data: dict = {}
    # Durable "long memory" (Théo P2) — resolved server-side by the NestJS
    # chat-context so the advisor remembers across sessions. Optional / defaulted
    # so existing callers keep working.
    #
    # #1962.8 — un élément est soit une chaîne NUE (un ancien appelant, ou une
    # fenêtre de déploiement où l'API tourne encore sur l'ancienne forme :
    # "front neuf sur API ancienne" payé ailleurs dans ce dépôt) — lue comme
    # kind="fact"/origin="manual", exactement ce qu'elle valait avant ce lot —
    # soit un `PinnedMemoryItem` structuré portant sa nature et son origine.
    # Aucun champ n'est retiré : c'est un ÉLARGISSEMENT, pas une migration.
    pinned_facts: list[PinnedMemoryItem | str] = []
    # #1962.8 — la MÊME mémoire avec sa nature et son origine, sous une clé
    # NEUVE. L'API d'après #1962 garde `pinned_facts` en chaînes nues (la forme
    # qu'un service IA pas encore redéployé valide) et envoie les objets ici ;
    # vide = une API d'avant, on relit `pinned_facts` (`routers/chat.py::
    # _pinned_memory`). Compatibilité de déploiement, dans les deux sens.
    pinned_memory: list[PinnedMemoryItem] = []
    user_preferences: dict = {}
    conversation_summary: str = ""
    # Mémoire de corrections du compte actif (feedback loop A2), résolue
    # server-side par le chat-context NestJS. Vide (défaut) = prompt inchangé.
    account_feedback: str = ""
    # #3272.6 — REX de perte du compte actif, condensés server-side (jamais le
    # REX mot pour mot). Vide (défaut) = bloc non injecté, prompt inchangé.
    lost_deal_rex_context: str = ""
    # #4071.1 — les faits du compte actif (socle #4069), datés, bornés, sans
    # provenance, rendus server-side. Vide (défaut) = bloc non injecté.
    account_facts_context: str = ""
    # #4071.3 — ce que l'ESPACE a gardé (recherches enregistrées, listes de cibles, conversations
    # passées de la personne), daté, borné, sans provenance, rendu server-side. Vide = bloc non injecté.
    workspace_recall_context: str = ""
    # #3390.10/.11 — la méthode commerciale retenue pour le besoin ouvert du compte
    # actif, rendue server-side par `renderLauraCommercialMethodContext`
    # (`@bellum/contracts`, GA-26). Vide (défaut) = bloc non injecté.
    commercial_method_context: str = ""
    # #3295 — règles APPRISES de l'espace (propositions adoptées puis activées),
    # condensées server-side. Vide (défaut) = bloc non injecté, prompt inchangé.
    workspace_learned_rules_context: str = ""
    # Real integration state, resolved server-side (crm_connections table) so the
    # transparency panel can say « CRM non connecté » truthfully. Defaulted to the
    # honest worst case (not connected) so a caller that omits them never claims a
    # connection that doesn't exist.
    crm_connected: bool = False
    crm_provider: str = ""
    # Les familles d'outils RÉELLEMENT opérationnelles chez cet utilisateur
    # (routeur, étape 3). `None` = « on ne sait pas » et rend tous les outils :
    # un appelant qui omet le champ ne doit pas se retrouver avec un copilote
    # amputé. L'inverse — tout couper par défaut — ferait disparaître des outils
    # sur une simple omission.
    connected_families: list[str] | None = None
    # Le copilote a-t-il DÉJÀ demandé une précision dans ce fil ?
    #
    # Le §9.4 est net : « jamais deux tours de clarification ». Deux questions
    # d'affilée transforment une demande en interrogatoire.
    #
    # Le drapeau vient du CLIENT et n'est pas déduit de l'historique : celui-ci
    # ne porte que `{role, content}`, et la carte de clarification vit dans les
    # `actions` du message, que seul l'écran conserve. Le déduire du texte
    # reviendrait à chercher une tournure de phrase — un détecteur qui rate
    # rouvrirait exactement le tour qu'on interdit.
    clarification_asked: bool = False
    # CRM presence read-back for the ACTIVE account (roadmap §8/§9), resolved
    # server-side from the CRM's own API (« X contacts déjà dans votre CRM chez ce
    # groupe, Y deals ouverts »). Empty = the CRM was NOT crossed for this reply —
    # the transparency panel keeps saying « non croisé ».
    crm_presence: str = ""
    # #1915.11 — la lecture a été TENTÉE et a ÉCHOUÉ (panne réseau, 500 du
    # fournisseur), résolu server-side (`resolveCrmPresenceRaw`). `False` par
    # défaut : un appelant qui ignore ce champ garde le panneau d'avant, au bit
    # près — « non croisé » plutôt que « indisponible ».
    crm_unavailable: bool = False
    # Connected-tools digest (Tool Registry v2, roadmap §8-9), resolved
    # server-side from the real tool registry: one compact line per CONNECTED
    # tool with its actions + cost (« Dropcontact … 1 crédit / enrichissement »).
    # Empty (default) = no tools block, prompt unchanged byte-for-byte.
    tools_summary: str = ""
    # #2261.21-32 — digest des HUIT capacités INTERNES du produit (comptes,
    # contacts, besoins, vivier, missions, mémoire marché, DataForge, routines),
    # résolu server-side. Le manifeste ci-dessus (`tools_summary`) ne couvre que
    # les outils TIERS ; Laura ne pouvait donc pas dire d'elle-même si une
    # fonction native du produit est utilisable MAINTENANT (ex. routines coupées
    # par le kill-switch opérateur). Même registre (GA-26), jamais un second
    # manifeste. Empty (default) = no block, prompt unchanged byte-for-byte.
    internal_capabilities_summary: str = ""
    # Le PRÉNOM de la personne, résolu server-side (tome 6 §5.7). Vide = le bloc
    # n'apparaît pas dans le prompt : une assistante qui dit « Bonjour  » est
    # pire qu'une assistante qui ne dit pas de prénom.
    first_name: str = ""
    # #2259.11 — LE NOM DE FAMILLE, résolu server-side (`profiles.last_name`),
    # jamais deviné. Vide = pas de ligne dans le bloc identité
    # (`identity_context_block`) : même contrat que `first_name` ci-dessus.
    last_name: str = ""
    # #2259.4 / #2259.13 — LE RÔLE D'ESPACE (RBAC : owner/admin/sales_ops/
    # sales/tech_admin/member/viewer), résolu server-side. C'est le seul signal
    # RÉEL de « fonction commerciale » (#2259.13) — aucun champ distinct
    # n'existe, l'inventer serait deviner. Vide = pas de ligne.
    workspace_role: str = ""
    # #2259.4 — VRAI quand cette personne est la propriétaire du compte Bellum
    # (`role == 'owner'`), résolu server-side. Ne dit PAS qu'elle dirige l'ESN
    # (#2259.5, non modélisé, resté `retenu`) : jamais promu au-delà de ce que
    # la donnée dit réellement.
    is_account_owner: bool = False
    # #2259.6 — un COLLÈGUE de l'espace cité par son prénom dans le message,
    # résolu server-side par le même rapprochement nom-dans-message que les
    # contacts (`contactsNamedIn`). Vide = personne citée, ou aucun collègue ne
    # correspond sans ambiguïté (deux homonymes ⇒ aucun).
    mentioned_colleague: str = ""
    # #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — DÉCISION Louis
    # 17/09 après-midi : la ou les BU que la personne PORTE (`perimetersOf`),
    # résolues server-side, avec ce que l'espace en sait (territoire,
    # spécialités, capacité et objectif du trimestre si renseignés, comptes /
    # consultants / références rattachés). C'est un CONTEXTE pour Laura
    # (prioriser, formuler), jamais un FILTRE. Vide = propriétaire sans BU
    # (`perimetersOf` rend `[]`) : aucune ligne, prompt inchangé.
    business_units: list[dict] = []
    # CE QUE LA PERSONNE A SOUS LES YEUX, rendu par l'API depuis la déclaration
    # de l'écran (`renderLauraPageContext`, packages/contracts).
    #
    # C'est ce qui sépare « un chat en bas à droite » d'un copilote qui sait où
    # l'on est : ouverte depuis la facturation de mars, Laura sait qu'on regarde
    # la facturation de mars.
    #
    # ⚠️ Vide (défaut) = **prompt byte-identique** à celui d'avant, donc golden
    # et empreinte du registre inchangés. Même contrat que `tools_summary`,
    # `account_feedback` et `first_name`.
    #
    # ⚠️ Le contenu vient du NAVIGATEUR : c'est une donnée d'affichage, jamais
    # une consigne, et le bloc le dit lui-même dans son en-tête.
    page_context: str = ""
    # #1960.20 — l'espace est-il en MARQUE BLANCHE ? Lu côté API (`resolveBrand`,
    # `isCustom`), jamais envoyé par le navigateur. Vrai = Laura ne donne aucune
    # adresse Bellum, seulement le signalement (décision de Louis du 13/09/2026).
    # Défaut `False` = marque du produit : un appelant qui omet la clé garde
    # l'adresse du support. ⚠️ Déclaré ICI : pydantic ignore une clé inconnue, et
    # un `white_label` non déclaré serait avalé sans erreur.
    white_label: bool = False
    # #1958.8 — LA LANGUE DE L'INTERFACE (décision de Louis, 12/09/2026 :
    # « langue de l'interface, tutoiement fixe »), résolue côté navigateur par
    # `i18n.language` et transmise ICI, jamais devinée depuis le texte du
    # message (#1958.9 : la langue vient de la REQUÊTE, elle ne change donc
    # pas au milieu d'un fil pour la seule raison qu'un message a été tapé
    # dans une autre langue).
    #
    # ⚠️ Champ INCONNU des clients d'avant ce lot — pydantic l'ignore
    # silencieusement à l'entrée (rien à faire côté serveur pour tolérer un
    # ancien front) — et son ABSENCE retombe sur "fr" : un appelant qui ne le
    # connaît pas encore obtient EXACTEMENT le comportement d'avant. Une
    # valeur qui n'est ni "fr" ni "en" (typo, futur canal, valeur corrompue)
    # retombe aussi sur "fr" côté `bellum_advisor.build_system_prompt` —
    # jamais une erreur, jamais une langue devinée.
    interface_language: str = "fr"
    # LE FUSEAU DE LA PERSONNE (décision de Louis, 14/09/2026 — « ajouter un
    # fuseau par utilisateur »), nom IANA lu sur son PROFIL par l'API
    # (`profiles.timezone` → `ChatContextService.resolveTimezone` →
    # `IaClient.chatBody`) — jamais envoyé par le navigateur, contrairement à
    # `interface_language` juste au-dessus : la langue est celle de l'INTERFACE
    # ouverte, le fuseau est un réglage de la PERSONNE, qui doit gagner même
    # depuis un autre appareil ou un autre pays.
    #
    # C'est lui qui décide de quel jour est « demain » : le bloc de date part en
    # queue du prompt et c'est le MODÈLE qui résout « relance-la demain à 9 h ».
    # Avant ce champ, « demain » était toujours le lendemain PARISIEN — à
    # Montréal ou à Singapour, autour de minuit, un jour entier d'écart.
    #
    # ⚠️ Déclaré ICI : pydantic ignore une clé inconnue, et un `timezone` non
    # déclaré serait avalé SANS ERREUR — le champ serait envoyé, payé et jamais
    # lu. Défaut `""` = inconnu : `current_time_block` retombe alors sur
    # `REFERENCE_TIMEZONE`, donc un appelant qui ne connaît pas ce champ (la
    # route MCP) obtient EXACTEMENT le comportement d'avant.
    timezone: str = ""
    # #1958.2 — LE FUSEAU DE L'ESPACE (l'ESN), nom IANA lu sur `workspaces.timezone`
    # (`ChatContextService.resolveWorkspaceTimezone` → `IaClient.chatBody`) —
    # jamais envoyé par le navigateur, même chemin que `timezone` ci-dessus.
    #
    # Jusqu'ici seuls existaient le fuseau de la PERSONNE et le défaut produit
    # nommé : aucun fuseau n'était porté par l'ESPACE, donc une équipe dont
    # personne n'avait rempli son fuseau personnel retombait directement sur
    # Paris — même basée à Montréal. `resolve_applicable_timezone`
    # (`app/prompts/current_time.py`) lit ce champ en DERNIER recours avant le
    # défaut nommé : personne → rendez-vous → espace → défaut produit.
    #
    # ⚠️ Déclaré ICI pour la même raison que `timezone` : pydantic ignore une
    # clé inconnue, et un champ non déclaré serait envoyé, payé et jamais lu.
    # Défaut `""` = inconnu ⇒ omis de l'escalier ⇒ comportement d'avant ce lot.
    workspace_timezone: str = ""
    # #2266.8 (épopée #2920) — DEPUIS QUAND cet espace utilise Bellum
    # (`workspaces.created_at`, `ChatContextService.resolveWorkspaceCreatedAt`
    # → `IaClient.chatBody`), en ISO 8601. Même chemin que `workspace_timezone`
    # ci-dessus : jamais envoyé par le navigateur.
    #
    # Sans lui, Laura ne pouvait distinguer « cet espace n'a jamais vu cette
    # donnée » de « cet espace vient d'être créé » — les deux se lisent pareil
    # sans une borne de départ. `temporal_grounding_block`
    # (`app/prompts/temporal_grounding.py`) le rend dans un bloc additif ;
    # sans lui, jamais de phrase sur l'ancienneté de l'espace.
    #
    # ⚠️ Déclaré ICI pour la même raison que `workspace_timezone` : pydantic
    # ignore une clé inconnue, et un champ non déclaré serait envoyé, payé et
    # jamais lu. Défaut `""` = inconnu ⇒ bloc absent, comportement d'avant ce lot.
    workspace_created_at: str = ""
    # #2266.10 (épopée #2920) — QUAND cet espace a vu sa dernière collecte de
    # données réussie (`ChatContextService.resolveWorkspaceLastSyncAt` →
    # `IaClient.chatBody`), en ISO 8601. Même chemin que `workspace_created_at`
    # ci-dessus : jamais envoyé par le navigateur.
    #
    # Aucun signal de fraîcheur n'existe à l'échelle du workspace ; ce champ
    # porte le plus récent de ce que chaque compte de l'espace a déjà collecté
    # (six colonnes `*_collected_at`, jamais une donnée inventée pour combler
    # l'absence). `temporal_grounding_block` le rend dans le même bloc additif
    # que `workspace_created_at` ; sans lui, jamais de phrase sur la fraîcheur
    # de l'espace.
    #
    # ⚠️ Déclaré ICI pour la même raison que `workspace_created_at` : pydantic
    # ignore une clé inconnue, et un champ non déclaré serait envoyé, payé et
    # jamais lu. Défaut `""` = inconnu ⇒ bloc absent, comportement d'avant ce lot.
    workspace_last_sync_at: str = ""
    # #1951.2 / #1951.3 — LE CONSULTANT OU LE BESOIN sur lequel la personne a
    # cadré le fil, RENDU EN TEXTE par l'API après relecture de la fiche dans
    # l'espace actif (`renderChatScopeObject`, apps/api). Jamais le texte du
    # navigateur. ⚠️ Déclaré ICI : pydantic ignore une clé inconnue, et un
    # `scope_object` non déclaré serait avalé sans erreur. Vide (défaut) = aucun
    # bloc, prompt byte-identique (`app/prompts/chat_scope_object.py`).
    scope_object: str = ""
    # #1950.17 — le plafond de coût AGRÉGÉ d'une réponse, en crédits, lu par l'API
    # dans la grille (`LAURA_REPLY_COST_CEILING_CREDITS`, packages/contracts) —
    # jamais par le navigateur. `None` (défaut) = aucun plafond, comportement
    # d'avant ce lot pour tout appelant qui ne le connaît pas (route MCP, API pas
    # encore redéployée).
    reply_cost_ceiling: int | None = None
    # #1927 — L'ÉTAT DU FIL : objets cités, dernière liste, dernière recherche
    # préparée, actions préparées, questions déjà posées — dérivé des appels
    # d'outils des tours PRÉCÉDENTS (`services/chat_thread_state.py`), stocké
    # par l'API avec le résumé de la conversation et renvoyé ici au tour suivant.
    #
    # ⚠️ Un `dict` et non un modèle strict, délibérément : un seul élément mal
    # formé dans un modèle pydantic rejetterait le tour ENTIER en 422 (même
    # leçon que `PinnedMemoryItem`). La lecture tolérante, entrée par entrée,
    # vit à UN endroit : `chat_thread_state.thread_state_from_wire`.
    #
    # ⚠️ Déclaré ICI pour ne pas être avalé : pydantic ignore une clé inconnue
    # du corps sans rien dire (`tests/test_chat_thread_state_turn.py` le
    # prouve). Absent ou vide = aucun bloc dans le prompt, aucune clé
    # `thread_state` dans la réponse : le tour d'avant #1927, à l'octet.
    thread_state: dict = {}
    # #1919.15 — les retours de CETTE personne sur les réponses de Laura, déjà
    # condensés en lignes déterministes par l'API (cloisonnés espace + auteur).
    # Vide (défaut) = aucun bloc, prompt byte-identique. Rendu dans le segment
    # VOLATIL (GA-293) par ``app.prompts.reply_feedback``.
    reply_feedback: str = ""
    # #2453 — LE MODE DE CONTEXTE choisi sous le composeur (« Contexte de
    # travail »), validé par l'API contre `LAURA_CONTEXT_MODES`
    # (packages/contracts). Un `Literal` DÉLIBÉRÉMENT strict, à l'inverse de
    # `PinnedMemoryItem` : un mode inconnu (« neutre ») retombé en silence sur
    # « Mon activité » rouvrirait le NO-GO du retour — l'utilisateur croirait
    # être en neutre pendant que son profil pèse. Mieux vaut un 422 franc.
    # `None` (défaut) = appelant d'avant #2453 : aucun bloc, aucune couche
    # retirée, prompt byte-identique. Appliqué par `services/context_mode.py`.
    context_mode: Literal["my_activity", "one_off_mission", "neutral"] | None = None
    # #3772.5 — L'EXCLUSION STRICTE des données de l'espace (« travailler sans le
    # portefeuille »), posée par l'API sur un geste explicite. `True` : les
    # couches portefeuille / CRM / historique commercial sont VIDÉES dans la copie
    # de la requête ET les outils qui lisent l'espace sont retirés du catalogue
    # (`services/context_mode.py`). `False` (défaut) = appelant d'avant : aucun
    # changement, prompt byte-identique.
    exclude_workspace_data: bool = False
    # #2450.1 (reste partiel, épopée #2882) — LE MODE DE RECHERCHE choisi sous
    # le composeur, validé par l'API contre `CHAT_RESEARCH_MODES`
    # (packages/contracts). Miroir de `RequestedMode`
    # (`services/chat_model_routing.py`) — même ordre, mêmes quatre valeurs.
    # `None`/`"auto"` (défaut) = l'heuristique habituelle décide, prompt
    # byte-identique à un appelant d'avant ce champ. Distinct de `context_mode`
    # juste au-dessus : QUELLE PROFONDEUR de recherche, pas QUELLES COUCHES
    # personnelles entrent dans le raisonnement.
    mode: Literal["auto", "rapide", "verifie", "approfondi"] | None = None
    # #3708 — « Outils et sources » : les familles que la personne a EXCLUES pour
    # ce fil (validées par l'API contre `toolFamilyValues`). L'exclusion est
    # appliquée ICI, en code : `connected_families` perd ces familles, donc
    # `tools_for` ne présente plus leurs outils. `None`/vide = corps d'avant.
    excluded_families: list[str] | None = None
    # #3708.fournisseur — les OUTILS décochés (identifiant de connecteur), déjà
    # recoupés par l'API avec le registre réel de la personne. Une exclusion par
    # outil ne vaut que là où le service LIT par outil : le CRM, dont
    # `crm_provider` est l'unique lien lu par le pont. Décocher CE lien équivaut à
    # exclure la famille `crm` ; décocher un autre CRM ne touche pas à la lecture.
    # #3973 — et la messagerie / l'agenda : le tour pose cette liste
    # (`set_turn_excluded_providers`), et `bellum_api` la relaie au pont, qui ne
    # lit jamais le backend décoché (l'autre, s'il est branché, l'est).
    # `None`/vide = corps d'avant.
    excluded_providers: list[str] | None = None

    # #3768 (BEL-LAU-1014) — LE GESTE « retravailler cette réponse » (approfondir,
    # synthétiser, plus de comptes…) : la réponse source et ce que le front en a
    # lu (forme, comptes cités, réserves déjà posées). `None` (défaut) = tour
    # ordinaire, prompt byte-identique. Un `id` inconnu est refusé (422), jamais
    # retombé en silence sur un tour ordinaire. Rendu par
    # `app.prompts.reply_transform.reply_transform_block`.
    reply_transform: ReplyTransform | None = None

    # #4397 (N1) — la SUITE cliquée sous une carte (« Lance l'analyse du compte X pour y placer Y ») :
    # l'identifiant du consultant voyage ICI, jamais dans le texte du message. ``None`` = tour ordinaire.
    follow_up_ref: FollowUpRef | None = None

    @model_validator(mode="after")
    def _apply_excluded_families(self) -> "ChatRequest":
        provider = (self.crm_provider or "").strip().lower()
        if provider and provider in {p.strip().lower() for p in (self.excluded_providers or [])}:
            self.excluded_families = sorted({*(self.excluded_families or []), "crm"})
        if not self.excluded_families:
            return self
        from app.services.chat_tools import TOOL_REQUIRED_FAMILIES

        # `None` = « on ne sait pas » rend tous les outils : l'exclusion ne doit pas s'y perdre.
        known = (
            set(self.connected_families)
            if self.connected_families is not None
            else {family for families in TOOL_REQUIRED_FAMILIES.values() for family in families}
        )
        self.connected_families = sorted(known - set(self.excluded_families))
        return self


class ChatResponse(BaseModel):
    success: bool = True
    data: dict = {}
