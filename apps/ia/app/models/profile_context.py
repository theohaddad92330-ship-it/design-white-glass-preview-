"""Pydantic v2 models for the ProfileContext produced by the Profiler agent.

Field descriptions carry the interpretation rules. Instructor injects them
into the tool schema passed to Claude, so the system prompt stays minimal —
the LLM reads what to do straight from the structured-output contract.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.models.tutoiement_doctrine import employs_vouvoiement

# Wire shape is validated by ``OnboardingAnswers`` in the router; this alias
# keeps the agent helpers free of bare ``dict``.
ProfilerAnswers: TypeAlias = dict[str, Any]


# R16-1 (mesuré en production le 16/09/2026,
# `.claude/notes/defaut-R16-1-tutoiement-de-la-sortie.md`) : une consigne de
# prompt n'est pas un contrat — Instructor ne rejoue le tour du modèle que sur
# une ValidationError, jamais sur une consigne non suivie. Ce validateur EST le
# mécanisme qui transforme « tutoiement obligatoire » en contrat, câblé sur les
# champs `audience: "user"` du corpus
# `packages/contracts/src/schemas/profile-context-rendered-fields.json` (l'app
# parle À l'utilisateur BellumAI). Il ne touche PAS les champs
# `audience: "external"` (`messagingStyle.avoid`, `.valuePropositionAngle`,
# `.differentiationPoints`, les libellés) : ceux-là décrivent ce que le
# commercial écrit À SON PROSPECT, où le vouvoiement du prospect est l'usage
# B2B français normal — pas un défaut à refuser.
def _reject_commanded_vouvoiement(value: str) -> str:
    offenders = employs_vouvoiement(value)
    if offenders:
        raise ValueError(
            "vouvoiement employé au lieu du tutoiement obligatoire (tu/ta/tes/ton) : "
            f"{offenders!r} — jamais vous/votre/vos dans un texte adressé à l'utilisateur."
        )
    return value


class _CamelModel(BaseModel):
    """Base class — every nested model on `ProfileContext` serialises to
    camelCase so the wire shape matches the TS contracts in `@bellum/contracts`.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        use_enum_values=True,
    )


class EsnArchetype(str, Enum):
    SOLO_HUNTER = "soloHunter"
    BOUTIQUE_EXPERT = "boutiqueExpert"
    MID_MARKET_CHALLENGER = "midMarketChallenger"
    SCALE_UP = "scaleUp"
    ENTERPRISE_PLAYER = "enterprisePlayer"


class SellingPosture(str, Enum):
    EXPERTISE_RARE = "expertiseRare"
    VOLUME_FLEXIBLE = "volumeFlexible"
    STRATEGIC_CONSULTING = "strategicConsulting"
    NEARSHORE_COMPETITIVE = "nearshoreCompetitive"
    NICHE_VERTICALS = "nicheVerticals"


# Legacy → canonical mapping for ProfileContext enum values. Older Supabase
# rows + earlier Claude outputs carried snake_case values and one French
# value (``conseil_strategique``). We normalise before validation so old
# data still loads; remove these once a one-off backfill rewrites storage.
_ESN_ARCHETYPE_LEGACY: dict[str, str] = {
    "solo_hunter": EsnArchetype.SOLO_HUNTER.value,
    "boutique_expert": EsnArchetype.BOUTIQUE_EXPERT.value,
    "mid_market_challenger": EsnArchetype.MID_MARKET_CHALLENGER.value,
    "scale_up": EsnArchetype.SCALE_UP.value,
    "enterprise_player": EsnArchetype.ENTERPRISE_PLAYER.value,
}

_SELLING_POSTURE_LEGACY: dict[str, str] = {
    "expertise_rare": SellingPosture.EXPERTISE_RARE.value,
    "volume_flexible": SellingPosture.VOLUME_FLEXIBLE.value,
    "conseil_strategique": SellingPosture.STRATEGIC_CONSULTING.value,
    "strategic_consulting": SellingPosture.STRATEGIC_CONSULTING.value,
    "nearshore_competitive": SellingPosture.NEARSHORE_COMPETITIVE.value,
    "niche_verticals": SellingPosture.NICHE_VERTICALS.value,
}


class AccountSize(str, Enum):
    PME = "pme"
    ETI = "eti"
    GRAND_COMPTE = "grandCompte"
    ALL = "all"


class DecisionLevel(str, Enum):
    C_LEVEL = "cLevel"
    DIRECTOR = "director"
    MANAGER = "manager"
    OPERATIONAL = "operational"


class EntryStrategy(str, Enum):
    TOP_DOWN = "topDown"
    BOTTOM_UP = "bottomUp"
    MULTI_THREAD = "multiThread"
    REFERRAL = "referral"


class AnalysisDepth(str, Enum):
    LIGHT = "light"
    STANDARD = "standard"
    DEEP = "deep"


class MessagingTone(str, Enum):
    DIRECT_EXPERT = "directExpert"
    CONSULTATIVE = "consultative"
    RELATIONSHIP_FIRST = "relationshipFirst"
    CHALLENGER = "challenger"


class MessageLength(str, Enum):
    CONCISE = "concise"
    STANDARD = "standard"
    DETAILED = "detailed"


class IdealAccountProfile(_CamelModel):
    size: AccountSize = Field(
        description=(
            "Taille cible. Dérivée de `target_company_types`:\n"
            "- contient 'CAC40 / SBF120' → 'grandCompte'\n"
            "- 'ETI' dominant → 'eti'\n"
            "- 'PME' + 'Startups & Scale-ups' → 'pme'\n"
            "- 3+ catégories cochées → 'all'."
        ),
    )
    sectors_priority: list[str] = Field(
        description=(
            "Secteurs dans l'ordre de priorité, reprise verbatim de `target_sectors` "
            "(libellés du questionnaire conservés). Pas d'invention."
        ),
    )
    decision_level: DecisionLevel = Field(
        description=(
            "Niveau de décideur cible:\n"
            "- 'cLevel' si grandCompte ou positioning='Conseil & Delivery'\n"
            "- 'director' si eti ou 'Multi-compétences ciblées'\n"
            "- 'manager' si pme\n"
            "- 'operational' si régie pure."
        ),
    )
    entry_strategy: EntryStrategy = Field(
        description=(
            "Stratégie d'entrée:\n"
            "- 'topDown' si secteur public ou décideurs cLevel\n"
            "- 'bottomUp' si pme avec décideurs operational/manager\n"
            "- 'multiThread' si grandCompte ou main_sales_pain='Identifier les décideurs'\n"
            "- 'referral' si main_sales_pain='Fidéliser mes comptes existants' OU 1 seule région."
        ),
    )


class AnalysisParameters(_CamelModel):
    brave_queries_count: int = Field(
        ge=5,
        le=25,
        description=(
            "Nombre de requêtes web par analyse de compte. "
            "18-25 si main_sales_pain='Trouver les bons comptes à cibler'. "
            "12-18 par défaut. 5-10 pour soloHunter."
        ),
    )
    firecrawl_pages_count: int = Field(
        ge=3,
        le=15,
        description="Nombre de pages à scraper par analyse (3-15). Aligné sur analysis_depth.",
    )
    contacts_target: int = Field(
        ge=10,
        le=120,
        description=(
            "Nombre de contacts à identifier par compte:\n"
            "- 10-25: soloHunter, boutiqueExpert\n"
            "- 25-50: midMarketChallenger\n"
            "- 50-100: scaleUp, enterprisePlayer\n"
            "- 60-120 si main_sales_pain='Identifier les décideurs' (couverture stakeholders élargie)\n"
            "- 30-60 si entry_strategy='multiThread'."
        ),
    )
    analysis_depth: AnalysisDepth = Field(
        description=(
            "Profondeur d'analyse. 'deep' si main_sales_pain='Trouver les bons comptes à cibler'. "
            "'light' si soloHunter avec staffing_model='Uniquement freelances'. 'standard' sinon."
        ),
    )
    max_tokens_research: int = Field(
        ge=8000,
        le=20000,
        description="Budget tokens Claude pour Researcher. 16000-20000 si analysis_depth='deep'.",
    )
    focus_areas: list[str] = Field(
        description=(
            "Thèmes prioritaires pour la recherche, alimentés par expertise_areas + target_sectors:\n"
            "- Reprend les libellés d'`expertise_areas` verbatim (ex: 'Cloud & Infrastructure').\n"
            "- Ajoute les réglementations associées aux secteurs:\n"
            "  • Banque / Assurance → 'DORA', 'NIS2', 'conformité RGPD bancaire'\n"
            "  • Santé & Medtech → 'HDS', 'PHI', 'réglementation médicale'\n"
            "  • Secteur public → 'marchés publics', 'DGFiP', 'RGS'\n"
            "  • Industrie / Aéro / Défense → 'souveraineté', 'ITAR' (défense), 'Industrie 4.0'\n"
            "- Si 'International' ∈ geo_zones → ajouter 'expansion internationale'\n"
            "- Si main_sales_pain='Fidéliser mes comptes existants' → ajouter "
            "'account-based marketing', 'expansion'."
        ),
    )


class MessagingStyle(_CamelModel):
    tone: MessagingTone = Field(
        description=(
            "Ton de communication:\n"
            "- 'directExpert' si positioning='Expertise de niche'\n"
            "- 'consultative' si positioning='Conseil & Delivery'\n"
            "- 'relationshipFirst' si entry_strategy='referral' ou cible pme\n"
            "- 'challenger' si main_sales_pain='Me différencier des autres ESN sur les mêmes comptes'."
        ),
    )
    message_length: MessageLength = Field(
        description=(
            "Longueur. 'concise' pour cibles cLevel. 'detailed' pour ventes complexes "
            "(strategicConsulting). 'standard' par défaut."
        ),
    )
    value_proposition_angle: str = Field(
        description=(
            "Proposition de valeur en UNE phrase, construite à partir des 1-2 expertise_areas "
            "dominantes + positioning. PAS de généralité ESN ('expertise reconnue', 'sur-mesure'). "
            "Exemple: 'On staff vos équipes data en 48h avec des seniors qui ont déjà délivré "
            "des migrations cloud chez 3 ETI banque.'"
        ),
    )
    differentiation_points: list[str] = Field(
        min_length=3,
        max_length=5,
        description=(
            "3-5 points de différenciation CONCRETS reflétant ce que l'utilisateur a décrit "
            "(expertise_areas + positioning + target_sectors). Si main_sales_pain='Me différencier' "
            "ou 'Personnaliser mes messages' → creuser plus, citer des exemples métier précis."
        ),
    )
    avoid: list[str] = Field(
        description=(
            "Formulations à proscrire. Toujours inclure les généralités ESN si "
            "main_sales_pain='Me différencier': 'expertise reconnue', 'leader du marché', "
            "'sur-mesure', 'partenaire de confiance'. Si tone='challenger': ajouter 'à vos côtés', "
            "'main dans la main'."
        ),
    )


class CadenceRecommendation(_CamelModel):
    analyses_per_week: int = Field(
        description=(
            "Analyses de comptes par semaine. Conservative (2-3) pour soloHunter ou "
            "main_sales_pain='Gérer mon temps'. 5-10 pour midMarketChallenger+. "
            "10-20 pour scaleUp/enterprise."
        ),
    )
    messages_per_day: int = Field(
        description=(
            "Messages d'approche par jour. 5-10 pour solo. 10-20 pour boutique. "
            "20-40 pour midMarket+. Réaliste — pas de chiffres hors-sol."
        ),
    )
    follow_ups_per_week: int = Field(
        description="Relances par semaine. Typiquement 30-50% du volume messages_per_day × 5.",
    )


# #2067.2 — la cible partenaires suit l'archétype.
#
# D'OÙ VIENNENT CES PLAGES, HONNÊTEMENT : d'aucune mesure de marché — rien dans
# ce dépôt ne dit combien de partenaires une ESN travaille par mois. Elles sont
# DÉRIVÉES, et la dérivation est écrite ici pour qu'on puisse la contester :
#   (a) la bande `accounts_per_month` du même archétype, juste en dessous — la
#       même échelle de capacité commerciale, divisée par ~6 : un partenaire
#       est une relation DURABLE qu'on entretient, pas un compte qu'on ouvre ;
#       5-10 → 1-2, 10-20 → 2-4, 20-40 → 4-7, 40-80 → 7-14, 60-120 → 10-20 ;
#   (b) le catalogue `PARTNER_COUNT_BANDS` du questionnaire
#       (`packages/contracts/src/schemas/profile-questionnaire.ts`), qui
#       plafonne à « Plus de 10 » : au-delà, la personne elle-même ne les
#       compte plus.
# Plancher 1 dans toutes les bandes : au-dessous, ce n'est pas une cible, c'est
# une absence — et une absence se dit `None`, jamais 0 (GA-18 / GA-19).
#
# GA-26 — ces plages vivent ICI et nulle part ailleurs : la description lue par
# le modèle est RENDUE depuis cette table (voir `partners_per_month`), et
# `tests/test_golden_multi_persona.py` l'importe au lieu de la recopier.
PARTNERS_PER_MONTH_BY_ARCHETYPE: dict[str, tuple[int, int]] = {
    EsnArchetype.SOLO_HUNTER.value: (1, 2),
    EsnArchetype.BOUTIQUE_EXPERT.value: (2, 4),
    EsnArchetype.MID_MARKET_CHALLENGER.value: (4, 7),
    EsnArchetype.SCALE_UP.value: (7, 14),
    EsnArchetype.ENTERPRISE_PLAYER.value: (10, 20),
}

_PARTNERS_PER_MONTH_RANGES = "\n".join(
    f"- {archetype}: {basse}-{haute}" for archetype, (basse, haute) in PARTNERS_PER_MONTH_BY_ARCHETYPE.items()
)


class KpiTargets(_CamelModel):
    accounts_per_month: int = Field(
        description=(
            "Nouveaux comptes ouverts / mois, RÉALISTE selon archétype:\n"
            "- soloHunter: 5-10\n- boutiqueExpert: 10-20\n- midMarketChallenger: 20-40\n"
            "- scaleUp: 40-80\n- enterprisePlayer: 60-120."
        ),
    )
    rdv_per_month: int = Field(
        description=(
            "RDV qualifiés / mois. Conversion attendue 5-15% du volume comptes ouverts. "
            "Ne JAMAIS dépasser 1 RDV / jour ouvré pour un soloHunter."
        ),
    )
    conversion_rate_target: str = Field(
        description=(
            "Taux de conversion cible RDV → signature, en string (ex: '15-25%'). "
            "Calibré sur positioning: niche / Conseil ≥ 25%, régie 10-20%, généraliste 15-25%."
        ),
    )
    # #2067.2 — la cible partenaires suit l'archétype. TROISIÈME cible de ce
    # modèle, calculée par le moteur comme ses deux sœurs (arbitrage Louis du
    # 20/09/2026) : le questionnaire donne la BASE actuelle, jamais la cible.
    # OPTIONNELLE là où les sœurs sont requises, et c'est tout le point : les
    # comptes et les RDV existent toujours, les partenaires non.
    partners_per_month: int | None = Field(
        default=None,
        description=(
            "Partenaires à TRAVAILLER / mois (solliciter, relancer, co-construire une offre). "
            "JAMAIS un nombre de partenaires à signer : on ne promet pas la signature d'un tiers.\n"
            "OMETS CE CHAMP (absence, pas 0) dans CHACUN de ces cas :\n"
            "- aucune porte partenaire dans `go_to_market_channels` : une ESN qui ne passe pas "
            "par des partenaires n'a pas de cible partenaires ;\n"
            "- `partners_regular_count` non répondu, « Je ne sais pas », ou hors catalogue : "
            "on ne devine pas une base.\n"
            "Sinon, ANCRE la cible sur `partners_regular_count` (la base réelle, pas un souhait) "
            "et ramène-la dans la plage de l'archétype:\n"
            f"{_PARTNERS_PER_MONTH_RANGES}.\n"
            "Une base déclarée à « 0 » derrière une porte partenaire donne la borne BASSE de la "
            "plage — par où commencer. Jamais 0, jamais un nombre négatif : "
            "un axe non évaluable sort du dénominateur, il ne vaut pas zéro."
        ),
    )

    @field_validator("partners_per_month", mode="after")
    @classmethod
    def _absence_jamais_zero(cls, value: int | None) -> int | None:
        # #2067.2 — la cible partenaires suit l'archétype. R16-1 le dit déjà
        # pour le tutoiement : une consigne de prompt n'est pas un contrat —
        # Instructor ne rejoue le tour du modèle que sur une ValidationError.
        # Ce validateur EST le mécanisme qui transforme « absente, jamais 0 »
        # en contrat (gardes GA-18 / GA-19).
        if value is not None and value < 1:
            raise ValueError(
                f"partners_per_month={value} — une cible partenaires non établie s'OMET "
                "(null), elle ne vaut jamais 0 ni un nombre négatif."
            )
        return value


class CoachingInsights(_CamelModel):
    # R16-1 — `main_weakness` et `key_advice` sont `audience: "user"` : c'est
    # l'app qui coache directement l'utilisateur, jamais son prospect.
    main_weakness: str = Field(
        description=(
            "Principal point de fragilité identifié, DIRECTEMENT dérivé de `main_sales_pain`:\n"
            "- 'Trouver les bons comptes' → 'Ciblage / scoring de comptes'\n"
            "- 'Identifier les décideurs' → 'Couverture stakeholders'\n"
            "- 'Personnaliser les messages' → 'Personnalisation à l'échelle'\n"
            "- 'Me différencier' → 'Différenciation concurrentielle'\n"
            "- 'Gérer mon temps' → 'Time-blocking / discipline opérationnelle'\n"
            "- 'Convertir mes RDV' → 'Qualif amont (BANT/MEDDIC)'\n"
            "- 'Fidéliser' → 'Account-based / expansion'\n"
            "- 'Former mon équipe' → 'Rituels et playbooks équipe'\n"
            "- 'Je ne sais pas par où commencer' → 'Mise en place d'une routine commerciale'\n"
            "- 'Je manque de comptes qualifiés' → 'Qualification de comptes'\n"
            "- 'Mes comptes sont ouverts mais ne s'étendent pas' → 'Expansion de compte'\n"
            "- 'Je manque de profils quand un besoin arrive' → 'Staffing / disponibilité des profils'\n"
            "- 'Mes marges se dégradent' → 'Pression sur la marge'\n"
            "- 'Toute l'activité dépend de quelques personnes' → 'Dépendance à quelques personnes'\n"
            "- 'Je manque de visibilité sur ce qui fonctionne' → 'Pilotage / visibilité commerciale'.\n"
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )
    key_advice: str = Field(
        description=(
            "Conseil le plus important, en 2-3 phrases DIRECTES (Head of Sales senior, tutoiement "
            "OK). S'appuie sur main_weakness. PAS de jargon corporate. Tutoiement obligatoire "
            "(tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )
    cadence_recommendation: CadenceRecommendation
    kpi_targets: KpiTargets

    @field_validator("main_weakness", "key_advice", mode="after")
    @classmethod
    def _tutoiement_obligatoire(cls, value: str) -> str:
        return _reject_commanded_vouvoiement(value)


class BellumPhrases(_CamelModel):
    # R16-1 — les 5 champs de ce modèle sont `audience: "user"` dans
    # `packages/contracts/src/schemas/profile-context-rendered-fields.json` :
    # l'app (Laura/BellumAI) parle ICI À l'utilisateur, jamais à son prospect.
    welcome: str = Field(
        description=(
            "Message d'accueil en 1 phrase. Format : 'Bienvenue {first_name}, on va "
            "transformer ton expertise \"{expertise_areas[0]}\" en pipeline qualifié "
            "sur \"{target_sectors[0]}\".'. Entoure expertise + secteur de guillemets "
            "droits. NE JAMAIS mettre le prénom entre guillemets. Si first_name absent, "
            "écris 'Bienvenue, on va transformer...'. Tutoiement obligatoire "
            "(tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )
    first_analysis_cta: str = Field(
        description=(
            "CTA principal pour lancer la première analyse. Cite un type d'entreprise concret de "
            "`target_company_types` ET un secteur de `target_sectors`. "
            "Exemple: 'Lancer une analyse sur une ETI du secteur Industrie.' "
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )
    weekly_summary_intro: str = Field(
        description=(
            "Intro du résumé hebdo (1 phrase), ton aligné avec messaging_style.tone. "
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )
    empty_state: str = Field(
        description=(
            "Message quand le pipeline est vide. Doit motiver une action concrète. "
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )
    # L'interdit de probabilité doit voyager DANS le schéma : c'est lui que le
    # modèle lit, pas le prompt système. Formulation reprise mot pour mot de
    # `prompts/reply_formats.py:50` (c26_probabilite du registre de doctrine).
    score_context: str = Field(
        description=(
            "Explication courte du score de priorité, adaptée au profil. "
            "Pour soloHunter: insister sur le ratio effort/retour. "
            "Pour enterprise: sur la couverture stakeholders + signaux marché. "
            "AUCUNE PROBABILITÉ. Ni probabilité, ni chance de signer, ni "
            "pourcentage de réussite : le score se justifie par ses axes et ses "
            "raisons, jamais par une chance. Tutoiement obligatoire "
            "(tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )

    @field_validator("welcome", "first_analysis_cta", "weekly_summary_intro", "empty_state", "score_context", mode="after")
    @classmethod
    def _tutoiement_obligatoire(cls, value: str) -> str:
        return _reject_commanded_vouvoiement(value)


class FirstAnalysisSuggestion(_CamelModel):
    # #2069 — le modèle peut expliquer et classer ; il ne génère pas les noms.
    # Aucune valeur d'exemple ici : dans un champ qui NOMME, un exemple est une
    # invitation à inventer (« Exemples : 'Société Générale', 'Doctolib' »).
    company_name: str = Field(
        description=(
            "Nom de l'entreprise, repris VERBATIM du contexte fourni. Tu ne l'écris "
            "jamais depuis ta connaissance générale et tu n'en déduis aucun : un nom "
            "absent du contexte n'est pas une suggestion, c'est une invention."
        ),
    )
    sector: str = Field(
        description=(
            "Secteur d'activité de l'entreprise, repris d'un des `target_sectors` "
            "du profil. Exemples : 'Banque', 'Santé & Medtech', 'Industrie', 'Retail'."
        ),
    )
    # R16-1 — `reason` est `audience: "user"` : cette phrase explique le match
    # À l'utilisateur (« ton expertise »), contrairement à `company_name` et
    # `sector` (de simples reprises verbatim, sans destinataire grammatical).
    reason: str = Field(
        description=(
            "1 phrase qui explique pourquoi cette entreprise match l'ESN, en "
            "s'appuyant sur expertise_areas + target_sectors + target_company_types. "
            "Exemple : 'Migration cloud en cours côté DSI, ton expertise Kubernetes "
            "matche leur stack actuelle.' Tutoiement obligatoire (tu/ta/tes/ton) — "
            "jamais vous/votre/vos."
        ),
    )

    @field_validator("reason", mode="after")
    @classmethod
    def _tutoiement_obligatoire(cls, value: str) -> str:
        return _reject_commanded_vouvoiement(value)


class ProfileContradiction(_CamelModel):
    """#2088.34 — la tension que LAURA ELLE-MÊME repère entre deux réponses,
    distincte des huit détecteurs déterministes du front
    (`onboarding-contradictions.ts`, `buildQuestionnaireContradictions`).

    Doctrine tranchée le 18/09/2026 : une hypothèse du modèle peut sortir avec
    son `reasoning`, à condition d'être affichée COMME une hypothèse — jamais
    une relation établie —, et que le `reasoning` reste consultable. D'où deux
    champs OBLIGATOIRES ENSEMBLE (pas de tension sans sa raison), portés par un
    bloc lui-même OPTIONNEL sur `ProfileContext` (voir plus bas) : `None`
    quand aucune tension n'est repérée, jamais devinée pour remplir le champ.
    """

    statement: str = Field(
        description=(
            "La tension entre deux réponses, nommée sur un ton NON accusatoire, "
            "comme un point à vérifier — jamais une contre-affirmation qui invente "
            "le fait à la place de l'utilisateur (règle CONTRADICTIONS ci-dessus). "
            "Exemple : « Tu as sélectionné dix secteurs prioritaires alors que ton "
            "équipe commerciale compte deux personnes. C'est possible, mais cela "
            "risque de diluer les recommandations. » Tutoiement obligatoire "
            "(tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )
    reasoning: str = Field(
        description=(
            "Pourquoi cette tension est relevée — cite la ou les réponses dont elle "
            "vient, pour que l'utilisateur puisse la consulter et juger par "
            "lui-même. Une hypothèse à vérifier, jamais une affirmation. "
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos."
        ),
    )

    @field_validator("statement", "reasoning", mode="after")
    @classmethod
    def _tutoiement_obligatoire(cls, value: str) -> str:
        return _reject_commanded_vouvoiement(value)


class WelcomeSummary(_CamelModel):
    """French paragraphs rendered verbatim on the welcome screen."""

    # R15N-11 (mesuré en production le 15/09/2026, deux fois de part et d'autre
    # d'une régénération) : les cinq champs ci-dessous vouvoyaient — « vos
    # cibles », « vous parlez », « votre couverture » — alors que /welcome
    # tutoie 29 fois par ailleurs. Chacun porte maintenant la consigne
    # EXPLICITEMENT (« tutoiement obligatoire »), gardée par
    # tests/test_welcome_summary_tutoiement.py, qui relit ce même schéma.
    profile_recap: str = Field(
        description=(
            "2-3 phrases factuelles. Style direct, tutoiement OBLIGATOIRE "
            "(tu/ta/tes/ton) — jamais vous/votre/vos. "
            "PAS de jargon ESN. PAS de mot « archétype ». Aucune généralité — uniquement "
            "les valeurs concrètes des réponses.\n"
            "\n"
            "STRUCTURE :\n"
            "1. « Tu es une ESN » + domaine (expertise dominante) + taille "
            "(consultant_size) + zone (geo_zones[0]) + spécialités (expertise_areas listés) "
            "+ cibles (target_company_types[0] + target_sectors[:2]).\n"
            "2. Staffing : staffing_model + sales_team_size si pertinent.\n"
            "\n"
            "RÈGLE TYPO : guillemets droits \" \" autour des concepts métier "
            "(expertise_areas, target_sectors, target_company_types, geo_zones, "
            "staffing_model). PAS de guillemets autour de la taille (« 30 consultants »).\n"
            "\n"
            "Exemple :\n"
            "« Tu es une ESN \"Data & Cloud\" de 30 consultants, basée en "
            "\"Île-de-France\", spécialisée \"Python\", \"Spark\" et \"AWS\", qui cible "
            "les \"ETI\" \"Banque\" et \"Transport\". Tu travailles principalement avec "
            "des \"CDI\" et ton équipe commerciale est de 3 personnes. »"
        ),
    )
    searches_personalization: str = Field(
        description=(
            "1 phrase qui explique ce que les recherches cibleront en priorité. "
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos. "
            "DOIT commencer par « Les recherches cibleront en priorité ». Cite 2-3 thèmes "
            "concrets entre guillemets droits (ex : \"data\", \"cloud\", \"transformation "
            "digitale\")."
        ),
    )
    contacts_personalization: str = Field(
        description=(
            "1 phrase qui explique qui seront les contacts identifiés. "
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos. "
            "DOIT commencer par « Les contacts identifiés seront ». Cite 2-3 fonctions "
            "entre guillemets (ex : \"DSI\", \"CTO\", \"Head of Data\") + une exclusion "
            "en parenthèse si pertinent (ex : « (pas des opérationnels juniors) »)."
        ),
    )
    messages_personalization: str = Field(
        description=(
            "1 phrase qui explique comment les messages seront rédigés. "
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos. Aucun "
            "anglicisme (pas de « corporate », « consultative » : dis-le en français). "
            "DOIT commencer par « Les messages seront rédigés ». Cite le ton entre "
            "guillemets (ex : \"expert direct\") + ce qu'il faut éviter (ex : "
            "« pas trop institutionnel »)."
        ),
    )
    # Mesuré en production le 14/09/2026 sur /welcome : « Le scoring évaluera …
    # la probabilité d'un besoin urgent ». Le schéma ne l'interdisait nulle part.
    scoring_personalization: str = Field(
        description=(
            "1 phrase qui explique ce que le scoring évaluera. "
            "Tutoiement obligatoire (tu/ta/tes/ton) — jamais vous/votre/vos. "
            "DOIT commencer par « Le scoring évaluera ». Cite un critère métier précis aligné sur la taille "
            "de l'ESN (consultant_size) et son archétype. "
            "AUCUNE PROBABILITÉ. Ni probabilité, ni chance de signer, ni pourcentage "
            "de réussite : le scoring se justifie par ses axes et ses raisons, jamais "
            "par une chance."
        ),
    )
    # #2069 — les noms viennent de la mémoire marché, de DataForge, des comptes
    # de l'espace ou de la résolution d'entité, jamais du modèle. Tant que le
    # prompt utilisateur du Profiler n'injecte aucun compte réel, la liste sort
    # VIDE : on ne nomme rien et on le dit. Un `min_length` sur un champ dont la
    # source est absente du contexte EST la consigne d'inventer.
    first_analysis_suggestions: list[FirstAnalysisSuggestion] = Field(
        default_factory=list,
        max_length=4,
        description=(
            "Entreprises à analyser en premier. Tu ne PRODUIS aucun nom : tu ne "
            "reprends que des entreprises dont le nom figure déjà, tel quel, dans le "
            "contexte fourni (observation du marché, comptes de l'espace de travail, "
            "résolution d'entité, résultats de recherche). Aucun nom issu de ta "
            "connaissance générale, aucun nom déduit d'un secteur, d'une taille ou "
            "d'une zone. Si le contexte n'en fournit aucun, rends une liste VIDE : on "
            "ne nomme rien, et l'écran proposera une recherche. Chaque entrée reprise "
            "a `company_name`, `sector` (repris des target_sectors) et `reason` "
            "(1 phrase qui explique le match avec l'ESN)."
        ),
    )

    @field_validator(
        "profile_recap",
        "searches_personalization",
        "contacts_personalization",
        "messages_personalization",
        "scoring_personalization",
        mode="after",
    )
    @classmethod
    def _tutoiement_obligatoire(cls, value: str) -> str:
        return _reject_commanded_vouvoiement(value)


class ProfileContext(_CamelModel):
    esn_archetype: EsnArchetype = Field(
        description=(
            "Archétype de l'ESN, dérivé de `consultant_size` × `sales_team_size`:\n"
            "- '1-10' + 'Je suis seul' → soloHunter\n"
            "- '1-10' + '2-3 personnes' → boutiqueExpert (cas léger)\n"
            "- '10-30' + '2-3'/'4-8' → boutiqueExpert\n"
            "- '30-80' + '4-8'/'8-15' → midMarketChallenger\n"
            "- '80-200' + '8-15'/'15+' → scaleUp\n"
            "- '200-500' / '500+' + '15+' → enterprisePlayer\n"
            "Si 'Je n'ai pas d'équipe commerciale dédiée' → on dérive sur consultant_size seul."
        ),
    )
    selling_posture: SellingPosture = Field(
        description=(
            "Posture commerciale, dérivée principalement de `positioning`:\n"
            "- 'Expertise de niche' → expertiseRare (si IT/Tech) ou nicheVerticals "
            "(si liée à un secteur métier banque/santé)\n"
            "- 'Multi-compétences ciblées' → expertiseRare ou nicheVerticals selon expertise_areas\n"
            "- 'Généraliste' → volumeFlexible\n"
            "- 'Régie pure' → volumeFlexible\n"
            "- 'Conseil & Delivery' → strategicConsulting.\n"
            "nearshoreCompetitive: réservé aux ESN qui insistent sur prix/proximité — rare en "
            "Temps 1, ne pas forcer."
        ),
    )
    ideal_account_profile: IdealAccountProfile
    analysis_parameters: AnalysisParameters
    messaging_style: MessagingStyle
    coaching_insights: CoachingInsights
    bellum_phrases: BellumPhrases
    welcome_summary: WelcomeSummary = Field(
        description=(
            "Paragraphes prêts à afficher sur l'écran de transition post-Temps 1. "
            "Cinq champs : profile_recap (résumé du profil), searches_personalization, "
            "contacts_personalization, messages_personalization, scoring_personalization."
        ),
    )
    # #2088.34 — voir `ProfileContradiction` ci-dessus pour la doctrine complète.
    contradiction: ProfileContradiction | None = Field(
        default=None,
        description=(
            "La tension la PLUS UTILE entre deux réponses (règle CONTRADICTIONS "
            "ci-dessus), si — et SEULEMENT si — les réponses en contiennent une. "
            "`None` quand aucune tension n'est repérée : ne JAMAIS en inventer une "
            "pour remplir ce champ. Jamais plus d'une à la fois — la plus utile, "
            "pas une liste exhaustive."
        ),
    )

    @field_validator("esn_archetype", mode="before")
    @classmethod
    def _migrate_legacy_esn_archetype(cls, value: object) -> object:
        """Accept legacy snake_case values + remap to the canonical camelCase
        form. Drop the migration once Supabase rows are backfilled.
        """
        if isinstance(value, str) and value in _ESN_ARCHETYPE_LEGACY:
            return _ESN_ARCHETYPE_LEGACY[value]
        return value

    @field_validator("selling_posture", mode="before")
    @classmethod
    def _migrate_legacy_selling_posture(cls, value: object) -> object:
        """Accept legacy snake_case + French ``conseil_strategique`` values
        and remap to the canonical camelCase form.
        """
        if isinstance(value, str) and value in _SELLING_POSTURE_LEGACY:
            return _SELLING_POSTURE_LEGACY[value]
        return value
