from __future__ import annotations

from app.prompts.forbidden_phrasings import DOSSIER_VERDICT_FORBIDDEN_PHRASINGS, quoted_fr
from app.prompts.style import FRENCH_STYLE_DIRECTIVE
from app.services.dossier_read import scoring_objectives
from app.services.domain_focus import resolve_domain_focus
from app.services.recommendation_specificity import specificity_directive_block  # #1925.1 — règle positive


def _declared(value: object, absent: str) -> str:
    """#2118.13/.14/.10/.15 — une donnée du profil ESN absente se DIT.

    « N/A consultants » ou « Zone geo : N/A » se lisaient comme des valeurs :
    le modèle notait l'axe capacité ou accessibilité sur un profil qu'il
    croyait connaître. Absent = « non renseigné », jamais une valeur devinée."""
    text = str(value).strip() if value is not None else ""
    return text or absent


def build_system_prompt(profile_data: dict) -> str:
    """Build BELLUM-PLAN system prompt from ESN profile data."""
    p = profile_data
    size = _declared(p.get("size"), "")
    size_line = f"{size} consultants" if size else "non renseignee"
    return f"""{FRENCH_STYLE_DIRECTIVE}\n\nTu es BELLUM, directeur commercial senior specialise dans la conquete de comptes pour les ESN.

===== PROFIL ESN =====
- Nom : {p.get("companyName", "N/A")}, Taille : {size_line}
- Offres principales : {", ".join(p.get("offers", []))}
- Secteurs cibles : {", ".join(p.get("sectors", []))}
- Positionnement : {p.get("positioning", "N/A")}
- Types d'entreprises ciblees : {", ".join(p.get("targetCompanyTypes", [])) or "N/A"}
- Modele de staffing : {p.get("staffingModel", "N/A")}
- Personas cibles : {", ".join(p.get("personas", []))}
- Territoire : {_declared(p.get("geoZone"), "non renseigne")}
- TJM moyen : {p.get("avgTJM", "N/A")} EUR
- Cycle de vente typique : {p.get("salesCycle", "N/A")}, Equipe commerciale : {p.get("salesTeamSize", "N/A")}
- Defi principal : {p.get("mainChallenge", "N/A")}
- References clients : {", ".join(p.get("references", []))}
- Role du commercial : {_declared(p.get("sellerRole"), "non renseigne")}
- Capacite de demarrage : {_declared(p.get("rampUpCapacity"), "non renseignee")}
- Consultants en mission : {_declared(p.get("consultantsOnMission"), "non renseigne")}
- Vivier actif : {_declared(p.get("consultantsInPipe"), "non renseigne")}

===== MISSION =====
Generer un plan d'action commercial COMPLET, DETAILLE et ACTIONNABLE pour conquérir ce compte. Le plan doit etre executable tel quel par un commercial. Chaque action doit nommer la personne cible, le canal, le message cle et le KPI de suivi.

===== STRUCTURE DU PLAN =====
5 phases temporelles obligatoires :
1. IMMEDIAT (Semaine 1) — Preparation et premiers contacts
2. MOIS 1 — Prise de contact et qualification
3. MOIS 2-3 — Engagement et POC/pilote
4. MOIS 3-6 — Negociation et closing
5. MOIS 6-12 — Expansion et up-sell

===== CALIBRATION PAR TAILLE D'ESN =====
- Petite ESN (1-20) : 3-4 contacts max, 1-2 actions par phase, cycle court, focus sur 1 angle
- Moyenne ESN (20-100) : 5-8 contacts, 3-4 actions par phase, multi-axes modere
- Grande ESN (100+) : 8-15 contacts, 4-6 actions par phase, strategie de referencement

===== METHODE (plan de compte ESN terrain) =====
- VOCABULAIRE : n'emploie JAMAIS l'anglicisme "thread". Dis "axe d'approche", "parcours" ou "ligne d'approche" (ex : "axe terrain", "axe budget", "axe achats").
- STRATEGIE SANDWICH : attaquer par le haut ET par le bas simultanement. C-level sponsorise/introduit, N-2 (operationnel) remonte la douleur, N-1 (decideur budget) pris en sandwich -> decision rapide. 2 axes d'approche actifs minimum.
- CADENCE 10 JOURS (phase IMMEDIAT) : J1 message initial (5 lignes, accroche perso + question d'aiguillage, pas de PJ ni presentation ESN) -> J3 relance courte (3 lignes, finir par une question) -> J6 message valeur (cas client chiffre, 1 asset) -> J9 close loop ("si pas pertinent, qui contacter ?"). Benchmarks reponse : C-level 10-15%, N-1 20-30%, N-2 30-40%.
- AXE ACHATS des la semaine 2 : identifier le process vendor (panel, MSA, securite) AVANT la validation metier, sinon le consultant demarre 10 semaines trop tard.
- OBJECTIF CHIFFRE 30/60/90 : "1 consultant place en 60 jours", pas "penetrer le compte".

===== METHODE SALESCONNECT (chaque reco = 6 champs, tracable) =====
Une reco/play n'est pas un beau texte generaliste : elle est TRACABLE et actionnable.
Chaque recommandation porte les 6 champs :
1. SIGNAL — le declencheur (recrutement, appel d'offres, nomination, incident, budget)
2. PREUVE — la SOURCE CITEE du signal (media, offre d'emploi, AO, rapport). JAMAIS inventee :
   si aucune source reelle n'existe, dis-le explicitement ("a qualifier") — pas de citation fabriquee.
3. CONTACT — l'interlocuteur cible, nomme (pas "le DSI")
4. ACTION — la prochaine etape concrete (verbe + canal)
5. MESSAGE — l'accroche prete a envoyer
6. RISQUE — l'objection ou le risque principal + comment le lever
Une reco sans preuve reelle est signalee comme FAIBLE / a qualifier, pas presentee comme un fait.
Meme exigence pour les OFFRES commerciales : TJM, taille d'equipe et duree sont des ESTIMATIONS
Bellum — des hypotheses derivees du contexte (taille du compte, perimetre du signal), JAMAIS des
faits. Chaque offre explicite son raisonnement d'estimation et cite les signaux reels qui la
justifient ; aucun tarif n'est presente comme la grille du client. Rien ne permet d'estimer ?
Laisse le champ vide — n'invente pas un chiffre.

{specificity_directive_block()}

===== REGLES =====
1. Chaque action commence par un VERBE d'action (Contacter, Envoyer, Organiser, Presenter, Proposer)
2. Chaque action nomme le contact cible par son NOM COMPLET (pas "le DSI")
3. Chaque action precise le canal (LinkedIn, email, telephone, evenement, rendez-vous)
4. Les deadlines sont relatives (J+3, S+1, M+1) pour etre replanifiables
5. Les KPIs sont mesurables (taux de reponse, nombre de RDV, signature POC)
6. Reponds UNIQUEMENT en JSON valide, rien avant ni apres.

===== PILOTAGE PAR TON PROFIL ESN (obligatoire) =====
Le PROFIL ESN ci-dessus PILOTE le plan. Chaque entite priorisee, offre proposee et
action est justifiee EN FONCTION de ce profil (offres : {", ".join(p.get("offers", []) or ["N/A"])}, taille : {size_line}).
ANTI-RECOMMANDATION : les entites/contacts qui NE collent PAS a ton profil (hors
secteur cible, hors zone geo, non actionnables a ta taille — ex: attaquer le board
groupe en 1ere approche, ou passer par une filiale hors de ton perimetre) ne
recoivent PAS de plan complet — tu expliques en une phrase pourquoi tu les ECARTES.

===== NOUVEAUX CHAMPS OBLIGATOIRES =====

quick_wins : 3 actions qui prennent moins de 15 minutes et ont un impact immediat.
Ex: "Envoyer un message LinkedIn a Jean-Pierre en mentionnant le recrutement en data detecte cette semaine."
Chaque quick win = verbe + destinataire + action + contexte.

if_no_response : Plan B si aucune reponse apres 3 semaines.
- Qui contacter en alternative ?
- Quel angle different essayer ?
- Quel pretexte de relance utiliser ?

action_id : Chaque action individuelle dans action_phases recoit un ID unique format "action_PHASE_INDEX"
(ex: "action_immediate_1", "action_month1_3"). Cet ID sera utilise pour tracker l'action en BDD."""


def build_user_prompt(
    company_name: str,
    account_analysis: str,
    contacts: str,
) -> str:
    """Build BELLUM-PLAN user prompt with analysis and contact data."""
    return f"""Genere un plan d'action commercial COMPLET et DETAILLE pour conquérir "{company_name}".

===== ANALYSE DU COMPTE =====
{account_analysis}

===== CONTACTS ENRICHIS =====
{contacts}

===== SCHEMA JSON ATTENDU =====
TOUS les champs sont OBLIGATOIRES. Chaque tableau doit contenir le nombre MINIMUM d'elements indique.

{{
  "actionPlan": {{
    "strategy": "Strategie globale en 2-3 phrases : angle d'attaque principal, differenciation face aux concurrents ESN, scenario de conquete ideal",
    "justification": "Pourquoi cette strategie est la meilleure pour CETTE ESN face a CE compte, en 2 phrases",
    "phases": [
      "(EXACTEMENT 5 phases) Pour chaque phase :",
      {{
        "name": "IMMEDIAT | MOIS 1 | MOIS 2-3 | MOIS 3-6 | MOIS 6-12",
        "title": "titre descriptif de l'objectif de cette phase",
        "objective": "objectif SMART (Specifique, Mesurable, Atteignable, Realiste, Temporel) de cette phase",
        "actions": [
          "(MINIMUM 2 actions par phase, viser 3 ; priorise les plus fortes) Pour chaque action :",
          {{
            "action_id": "ID unique format action_PHASE_INDEX, ex: action_immediate_1, action_month1_3 — utilise le nom de phase en snake_case et l'index 1-based",
            "action": "description de l'action en 1-2 phrases, commencant par un verbe",
            "owner": "qui execute cette action selon la structure de vente (toi le fondateur / ton alternant / ton SDR / ton AM) — pas 'l'equipe' en general",
            "contact": "nom complet du contact cible (doit correspondre a un contact enrichi)",
            "channel": "linkedin | email | phone | event | meeting | content",
            "reason": "pourquoi CETTE action maintenant : le signal / besoin / regle qui la declenche (pas 'pour avancer')",
            "deadline": "deadline relative (J+3, S+1, M+1, etc.)",
            "expectedOutcome": "resultat attendu concret",
            "kpi": "indicateur mesurable de succes"
          }}
        ]
      }}
    ]
  }},

  "offersToPropose": [
    "(MINIMUM 3 offres) Pour chaque offre :",
    {{
      "title": "nom commercial de l'offre",
      "pitch": "argumentaire de vente en 2-3 phrases, adapte au contexte de ce compte",
      "targetContact": "nom complet du contact a qui proposer cette offre",
      "painAddressed": "quel point de douleur specifique cette offre resout",
      "estimatedTJM": "TJM estime en euros — HYPOTHESE Bellum, jamais presente comme la grille tarifaire du client",
      "estimatedTeamSize": "nombre de consultants necessaires (hypothese ; vide si rien ne permet d'estimer)",
      "estimatedDuration": "duree estimee de la mission (hypothese ; vide si rien ne permet d'estimer)",
      "estimationHypothesis": "le raisonnement derriere ces estimations en 1-2 phrases (taille du compte, perimetre du signal) — obligatoire des qu'un chiffre est avance",
      "justifyingSignals": ["les signaux REELS de l'analyse qui justifient cette offre (recentSignals/budgetSignals)"],
      "differentiator": "pourquoi cette ESN est mieux placee qu'un concurrent pour cette offre"
    }}
  ],

  "quick_wins": [
    "(EXACTEMENT 3 quick wins, chacun realisable en moins de 15 minutes) Pour chaque quick win :",
    {{
      "action": "Verbe + destinataire + action + contexte. Ex: 'Envoyer un message LinkedIn a Jean-Pierre en mentionnant le recrutement en data detecte cette semaine.' Doit etre executable en < 15 minutes.",
      "contact": "nom complet du contact cible",
      "channel": "linkedin | email | phone",
      "time_required": "< 15 minutes",
      "expected_impact": "Impact immediat attendu (reponse probable, visibility, qualification)"
    }}
  ],

  "if_no_response": {{
    "trigger": "Apres 3 semaines sans reponse sur les contacts prioritaires",
    "alternative_contact": {{
      "name": "Nom du contact alternatif a approcher",
      "title": "Son poste",
      "reason": "Pourquoi cette personne est la meilleure alternative"
    }},
    "different_angle": "Quel angle radicalement different essayer (ex: passer par un evenement sectoriel, approcher par un partenaire commun, cibler une filiale plus accessible)",
    "reengagement_pretext": "Le pretexte de relance a utiliser (actualite recente, nouvel evenement, nouvelle offre) — doit sembler naturel et non insistant",
    "escalation_option": "Si toujours aucune reponse apres 6 semaines : que faire (marquer NO-GO temporaire, reessayer dans X mois, changer completement d'entite d'entree)"
  }},

  "evaluation": {{
    "scoreBreakdown": [
      "Note CHAQUE axe sur son max 5 (le total /25 et le verdict GO 20-25 / PRUDENT 14-19 / STOP <14 / EXPLORER (potentiel mais donnees a collecter) sont recalcules ensuite — ne les invente pas). Sois severe : un grand compte CAC40 est PLUS DUR pour une petite ESN.",
      {{"axis": "fit_offre", "points": "0-5 : Fit — problemes et offres compatibles (profileData + signaux + stack)"}},
      {{"axis": "timing", "points": "0-5 : Timing — signaux/besoins/budget maintenant (signaux dates, changement, recrutements, AO, programme)"}},
      {{"axis": "accessibilite", "points": "0-5 : Accessibilite — relation, BU, panel, geo, taille (contacts joignables, referencements, userContext)"}},
      {{"axis": "concurrence", "points": "0-5 : Concurrence — incumbents/prestataires en place, equipe interne, alternatives (5 = terrain ouvert, 0 = verrouille par un concurrent)"}},
      {{"axis": "capacite", "points": "0-5 : Capacite — TON aptitude a delivrer ce compte (delivery, references sectorielles, marge, delai) selon ton profil ESN"}}
    ],
    "justification": "3-4 phrases : pourquoi ce verdict, en citant les axes forts et faibles (fit, timing, accessibilite, concurrence, capacite)",
    "risks": [
      "(MINIMUM 3 risques) Pour chaque risque :",
      {{
        "risk": "description du risque",
        "probability": "haute | moyenne | basse",
        "impact": "critique | important | modere",
        "mitigation": "strategie d'attenuation"
      }}
    ],
    "quickWins": [
      "(MINIMUM 3 quick wins) Pour chaque quick win :",
      {{
        "action": "description de l'action rapide",
        "expectedImpact": "impact attendu",
        "timeline": "delai de realisation",
        "effort": "faible | moyen | important"
      }}
    ]
  }},

  "prioritySubAccounts": [
    "(2 a 4 sous-comptes MAX) Feuille de route 30j par zone de chasse. Construis-les EXCLUSIVEMENT a partir des `priorityPerimeters` fournis dans l'analyse (les 2-4 perimetres deja scores /20, tries P1/P2). N'invente PAS d'autres entites, ne pousse JAMAIS 'le groupe'. Reprends leur `name`, `tier`, `whatToSell`. Pour chaque :",
    "approachAngle (7 mouvements, choisis selon le MOUVEMENT RECOMMANDE deterministe fourni plus haut, l'accessibilite et les contacts) : bottom_up (N-2 accessible/douleur terrain, remonter) | middle_out (N-1 decideur/prescripteur) | top_down (C-level/sponsor, faire ruisseler — SEULEMENT si relation forte/reco) | sandwich (terrain + budget en parallele, grand compte complexe) | rang2 (par le delivery vers le client final sans bruler le partenaire) | prospection_inversee (partir d'un besoin/profil concret) | public (voie contractuelle : veille -> titulaire -> metier -> procedure).",
    {{
      "name": "nom de l'entite/filiale/BU",
      "why": "pourquoi cette entite est prioritaire POUR TON PROFIL ESN (fit offre/secteur/taille + budget, autonomie, besoin identifie) — pas 'en general'",
      "entryContact": "nom du contact d'entree dans cette entite",
      "suggestedOffer": "offre a proposer en priorite",
      "nextAction": "LA prochaine action concrete a 30 jours sur cette entite (qui contacter, comment, avec quel pretexte)",
      "approachAngle": "bottom_up | middle_out | top_down | sandwich | rang2 | prospection_inversee | public",
      "deadline": "echeance de la prochaine action (ex: J+7, J+15, J+30)"
    }}
  ],

  "competitiveStrategy": {{
    "positioningStatement": "comment se positionner face aux ESN concurrentes en 2-3 phrases",
    "vsCompetitors": [
      {{
        "competitor": "nom du concurrent",
        "differentiator": "comment se differencier specifiquement de ce concurrent",
        "talkingPoint": "argument cle a utiliser si le prospect mentionne ce concurrent"
      }}
    ]
  }},

  "messages": [
    "(1 message par contact priorite 1-3) Messages personnalises :",
    {{
      "contactName": "nom complet du contact",
      "linkedinMessage": "message LinkedIn de 3-4 phrases : (1) accroche personnalisee referençant un fait reel, (2) proposition de valeur adaptee, (3) call-to-action clair",
      "emailSubject": "objet d'email accrocheur et professionnel",
      "emailBody": "email de 5-8 phrases : contexte, proposition, benefices, prochaine etape",
      "phoneOpener": "phrase d'accroche telephone de 2-3 phrases"
    }}
  ]
}}

IMPORTANT : Le plan doit etre IMMEDIATEMENT executable. Pas de conseils generiques. Chaque action doit nommer une personne reelle et un canal precis."""


def build_plan_shared_context(
    company_name: str,
    account_analysis: str,
    contacts: str,
    relationship: str = "",
    knowledge_context: str = "",
    market_memory_block: str = "",
) -> str:
    """The account analysis + contacts (+ the ESN↔account relationship) shared by
    EVERY Phase-4 call.

    Appended to the (cached) system prompt so the 11 split calls read this big
    block from the prompt cache (~0.1× input) instead of re-sending it in each
    user prompt (×11 at full price — the live Phase-4 cost hog: 238k input on
    Doctolib). The first call (``meta``) warms the cache; see ``_plan``.

    The relationship block, when present, MUST steer the approach: a cold first
    touch, a re-engagement of a former account, an upsell to an existing client
    and a displacement of an incumbent are different plays.
    """
    block = f"## CONTEXTE COMPTE — {company_name}\nANALYSE COMPTE:\n{account_analysis}\n\nCONTACTS:\n{contacts}"
    if relationship and relationship.strip():
        block += (
            "\n\n## RELATION ESN ↔ COMPTE (ADAPTE L'APPROCHE EN CONSÉQUENCE)\n"
            f"{relationship.strip()}\n"
            "→ Le plan, les messages et la séquence DOIVENT refléter ce contexte de relation "
            "(prospection à froid vs réengagement vs upsell client existant vs déplacement d'un incumbent)."
        )
    if knowledge_context and knowledge_context.strip():
        block += (
            "\n\n## BASE DE CONNAISSANCE (documents de l'utilisateur — à utiliser en PRIORITÉ et à citer)\n"
            f"{knowledge_context.strip()}"
        )
    if market_memory_block and market_memory_block.strip():
        block += market_memory_block
    return block


def market_memory_directive_block(reinforced_expertises: list[str]) -> str:
    """#1611.4 — LE BLOC Observation du marché DU PLAN, et l'interdit qu'il porte.

    ``reinforced_expertises`` est déjà le résultat de
    ``app.services.market_memory_angle.reinforced_expertises`` : UNIQUEMENT des
    libellés que l'ESN a elle-même déclarés (``profile['offers']``). Aucun nom
    de société de services, aucun comptage de parcours, aucune famille de rôles
    n'entre dans ce bloc — l'observation du marché ne peut donc pas fuiter dans une
    action ou un message, PAR CONSTRUCTION, pas seulement par consigne.

    Vide ⇒ prompt byte-identique (même discipline que ``relationship``/
    ``knowledge_context`` juste au-dessus) : un compte non couvert, ou sans
    corroboration, ne change rien au plan d'avant ce lot.
    """
    if not reinforced_expertises:
        return ""
    labels = ", ".join(reinforced_expertises)
    example = reinforced_expertises[0]
    return (
        "\n\n## ENVIRONNEMENT TECHNIQUE OBSERVÉ (observation du marché — #1611)\n"
        f"Ces expertises que tu déclares ressortent aussi dans l'environnement technique observé de ce compte : {labels}.\n"
        "Deux sources indépendantes, PAS une preuve d'intervention actuelle : ça ne dit rien d'un prestataire "
        "en place aujourd'hui, seulement que l'environnement technique observé recoupe ce que tu vends.\n"
        "RÈGLE (interdit absolu, s'applique à TOUTES les sections — plan, quick wins, évaluation) :\n"
        "- Utilise ce signal UNIQUEMENT pour choisir ou renforcer un ANGLE (quelle expertise mettre en avant). "
        "Il ne prouve JAMAIS un besoin, une mission en cours, ni l'absence d'un concurrent. "
        "Il ne prouve non plus JAMAIS le TIMING (#2127.22) : une expertise recoupée par l'observation du marché "
        "n'est ni une urgence ni un budget disponible maintenant — ne fais JAMAIS monter la note de l'axe "
        "'timing' de l'évaluation sur la seule foi de ce signal.\n"
        "- Si le SEUL argument disponible pour une action est ce signal (aucune preuve actuelle : contact confirmé, "
        "appel d'offres, signal RH daté, échange client), cette action DOIT être une action de VÉRIFICATION — "
        f"ex. « Vérifier si l'équipe {example} travaille avec des prestataires externes aujourd'hui » — "
        "JAMAIS une action commerciale (proposition, offre, closing).\n"
        "- Ne cite JAMAIS ce signal, un nombre de personnes/parcours, ou un nom de société de services dans un "
        "message destiné à être envoyé : ces informations n'existent nulle part dans ce qu'on t'a transmis ici."
    )


# #2118.16 — les mots de l'AUDIT (`commercialAudit.json`, clés `strategy.*`) :
# le verdict cite la stratégie comme la personne l'a lue en la validant.
_ENTRY_STRATEGY_LABELS: dict[str, str] = {
    "topDown": "entrée par le haut",
    "bottomUp": "entrée par le terrain",
    "multiThread": "entrée sur plusieurs fils",
    "referral": "entrée par recommandation",
}

# #2118.9 — l'échelle déclarée d'une BU (`businessUnitKindValues`, contrat).
_BUSINESS_UNIT_KIND_LABELS: dict[str, str] = {
    "company": "toute l'entreprise",
    "business_unit": "BU",
    "agency": "agence",
    "sales_team": "équipe commerciale",
    "territory": "territoire",
    "new_venture": "nouvelle activité",
    "solo": "en solo",
}


def _business_unit_line(unit: object) -> str:
    """Une BU lisible, ou "" : un nom absent ne se remplace pas."""
    if not isinstance(unit, dict):
        return ""
    name = str(unit.get("name") or "").strip()
    if not name:
        return ""
    details = [_BUSINESS_UNIT_KIND_LABELS.get(str(unit.get("kind") or ""), "")]
    territory = str(unit.get("territory") or "").strip()
    if territory:
        details.append(f"territoire : {territory}")
    specialties = [str(s).strip() for s in (unit.get("specialties") or []) if str(s).strip()]
    if specialties:
        details.append(f"spécialités : {', '.join(specialties)}")
    shown = [d for d in details if d]
    return f"{name} ({' ; '.join(shown)})" if shown else name


def seller_scope_directive_block(profile_data: dict | None) -> str:
    """#2118.9 / #2118.16 — la BU du commercial et la stratégie validée à l'audit,
    à CITER dans le verdict de la Synthèse (décisions Louis 15/09).

    Les deux faits arrivent par `AnalysisProfileData` (`entryStrategy`,
    `businessUnits`, résolus par `EsnProfileWorkspaceResolver`). Sans l'un ni
    l'autre, le bloc est VIDE : le prompt reste byte-identique. Une stratégie
    hors catalogue ou une BU sans nom ne produit rien — jamais un fait deviné.
    ⚠️ Déclaratifs : ils orientent la lecture, jamais un point d'axe (GA-338).
    """
    p = profile_data or {}
    lines: list[str] = []
    units = p.get("businessUnits")
    unit_lines = [line for line in (_business_unit_line(u) for u in units) if line] if isinstance(units, list) else []
    if unit_lines:
        lines.append(f"- BU / agence du commercial : {' ; '.join(unit_lines)}")
    strategy = _ENTRY_STRATEGY_LABELS.get(str(p.get("entryStrategy") or ""))
    if strategy:
        lines.append(f"- Stratégie d'entrée validée à l'audit : {strategy}")
    if not lines:
        return ""
    return (
        "\n\nTON PÉRIMÈTRE ET TA STRATÉGIE (#2118.9 / #2118.16 — à citer) :\n"
        + "\n".join(lines)
        + "\nbellum_read.why : au moins UNE preuve relie ce compte à ce périmètre ou à cette stratégie et les "
        "CITE nommément (ex. « cohérent avec ton entrée par le haut validée à l'audit », « hors du territoire "
        "de l'agence Lyon »), ou dit en quoi le compte s'en écarte. verdict_line peut les nommer. "
        "Ils orientent la lecture ; ils ne changent aucun point d'axe."
    )


def esn_objectives_directive_block(profile_data: dict | None) -> str:
    """#2304.25 (épopée #2932, LAU-FINAL-045) — les OBJECTIFS commerciaux
    déclarés de l'ESN (`esn_objectives`, #2052), à CITER dans
    `dossier_read.why_for_your_esn` quand ils rendent CE compte pertinent.

    Réutilise `scoring_objectives` (`dossier_read.py`, #2306.16) — la MÊME
    dérivation qui conserve les objectifs actifs SUR le bloc une fois le
    score posé (GA-26, un seul endroit qui lit `profile_data['objectives']`).
    Ce bloc est le chaînon qui manquait : les objectifs étaient ARCHIVÉS a
    posteriori sans jamais avoir pesé sur la lecture qui les archive.

    DISTINCT de `recommended_scope` (le périmètre de CE plan) : ici c'est
    l'ambition déclarée de l'ESN elle-même (rendez-vous, nouveaux comptes,
    structuration…). Aucun objectif déclaré ⇒ bloc VIDE, prompt inchangé —
    jamais un objectif deviné."""
    objectives = scoring_objectives(profile_data)
    if not objectives:
        return ""
    return (
        "\n\nTES OBJECTIFS COMMERCIAUX ACTIFS (#2304.25 — à citer si pertinent) :\n"
        f"- {', '.join(objectives)}\n"
        "dossier_read.why_for_your_esn peut citer nommément l'objectif que CE compte sert (ex. « ce compte "
        "pèse sur ton objectif de structuration du portefeuille »), jamais un objectif que tu n'as pas reçu "
        "ici."
    )


def esn_relations_directive_block(profile_data: dict | None) -> str:
    """#2304.23 (clôture #2931/#2932, LAU-FINAL-045) — le RÉSEAU personnel
    déclaré de l'ESN (#2045 : anciens clients, anciens collègues, partenaires,
    apporteurs), à CITER dans `dossier_read.why_for_your_esn` quand il rend CE
    compte plus accessible.

    Quatre bandes déjà en base (`former_clients_count_band` et sœurs) et déjà
    lues par `bellum_profiler.py` (le prompt d'onboarding), jamais mappées
    vers CE profil avant #2304.23 : un branchement absent, pas une donnée à
    collecter (`esnAnswersToProfileData`, `analysis.ts`). Aucune bande
    déclarée ⇒ bloc VIDE, jamais un réseau deviné."""
    p = profile_data or {}
    labels = (
        ("formerClientsCountBand", "anciens clients"),
        ("formerColleaguesCountBand", "anciens collègues"),
        ("partnersCountBand", "partenaires"),
        ("referrersCountBand", "apporteurs d'affaires"),
    )
    lines = [f"- {label} : {p[key]}" for key, label in labels if p.get(key)]
    if not lines:
        return ""
    return (
        "\n\nTON RÉSEAU PERSONNEL DÉCLARÉ (#2304.23 — à citer si pertinent) :\n"
        + "\n".join(lines)
        + "\ndossier_read.why_for_your_esn peut citer nommément un accès potentiel via ce réseau (ex. « ton "
        "vivier d'anciens clients peut avoir un contact chez eux »), jamais une relation que tu n'as pas reçue "
        "ici."
    )


def esn_available_time_directive_block(profile_data: dict | None) -> str:
    """#2304.26 (clôture #2931/#2932, LAU-FINAL-045) — le temps hebdomadaire
    PROTÉGÉ pour la prospection (`weeklySalesTimeProtected`, #2050), à CITER
    dans `dossier_read.why_for_your_esn` pour calibrer l'AMBITION du plan sur
    CE compte — jamais pour justifier de ne pas prospecter.

    Bande déjà en base, jamais mappée vers CE profil avant #2304.26 — même
    branchement absent que `esn_relations_directive_block` ci-dessus. Absente
    ⇒ bloc VIDE."""
    time_available = (profile_data or {}).get("weeklySalesTimeProtected")
    if not time_available:
        return ""
    return (
        "\n\nTON TEMPS DE PROSPECTION PROTÉGÉ (#2304.26 — à citer si pertinent) :\n"
        f"- {time_available}\n"
        "dossier_read.why_for_your_esn et recommended_scope peuvent calibrer l'ambition du plan sur ce temps "
        "réel (ex. « avec ton temps protégé, vise d'abord UN décideur »), jamais un temps illimité supposé."
    )


def build_subsection_user_prompt(
    *,
    company_name: str,
    section: str,
    profile_data: dict | None = None,
) -> str:
    """Build a focused Phase-4 prompt for one output subsection.

    The account + contacts live in the (cached) system prompt, so this user
    prompt stays small and per-call-unique.
    """
    # Domain lens (Drive #9, Phase 2) — IT for an IT ESN (or empty profile), the
    # ESN's own domain for a non-IT ESN. Only the `evaluation` scoring note
    # carries the IT lens ("budget IT" / "signaux IT").
    d = resolve_domain_focus(profile_data)
    section_schemas: dict[str, str] = {
        "action_plan": '{"actionPlan":{"strategy":"...","justification":"...","phases":[{"name":"IMMEDIAT|MOIS 1|MOIS 2-3|MOIS 3-6|MOIS 6-12","title":"...","objective":"...","actions":[{"action_id":"action_immediate_1","action":"...","owner":"toi|alternant|SDR|AM","contact":"...","channel":"linkedin|email|phone|event|meeting|content","reason":"le signal/besoin/regle qui declenche","deadline":"J+3","expectedOutcome":"...","kpi":"..."}]}]}}',
        "offers": (
            '{"offersToPropose":[{"title":"...","pitch":"...","targetContact":"...","painAddressed":"...",'
            '"estimatedTJM":"...","estimatedTeamSize":"...","estimatedDuration":"...",'
            '"estimationHypothesis":"...","justifyingSignals":["..."],"differentiator":"..."}]}'
            "\n\nESTIMATIONS = HYPOTHESES (methode commerciale Bellum) : chaque estimation (TJM, taille d'equipe, duree) "
            "est une HYPOTHESE Bellum derivee du contexte (taille du compte, perimetre du signal), PAS un fait. "
            "'estimationHypothesis' explicite le raisonnement en 1-2 phrases "
            "(ex: 'compte >5k salaries, perimetre data sur 2 BUs -> 2 consultants pendant 6 mois'). "
            "'justifyingSignals' cite les signaux REELS de l'analyse qui justifient l'offre "
            "(recentSignals / budgetSignals — pas de signal invente). "
            "Rien ne permet d'estimer ? Laisse le champ vide (\"\") — n'invente JAMAIS un chiffre, "
            "et ne presente JAMAIS un tarif comme la grille du client (le TJM reste une hypothese "
            "a relier a ses tarifs reels)."
        ),
        "quick_wins": '{"quick_wins":[{"action":"...","contact":"...","channel":"linkedin|email|phone","time_required":"< 15 minutes","expected_impact":"..."}]}',
        "if_no_response": '{"if_no_response":{"trigger":"...","alternative_contact":{"name":"...","title":"...","reason":"..."},"different_angle":"...","reengagement_pretext":"...","escalation_option":"..."}}',
        "evaluation": (
            '{"evaluation":{"scoreBreakdown":['
            '{"axis":"fit_offre","points":0,"note":"Fit — problemes et offres compatibles (max 5)"},'
            '{"axis":"timing","points":0,"note":"Timing — signaux/besoins/budget maintenant (max 5)"},'
            '{"axis":"accessibilite","points":0,"note":"Accessibilite — relation, BU, panel, geo, taille (max 5)"},'
            '{"axis":"concurrence","points":0,"note":"Concurrence — incumbents, interne, alternatives (max 5)"},'
            '{"axis":"capacite","points":0,"note":"Capacite — ta delivery/references/marge/delai (max 5)"}'
            '],"justification":"3-4 phrases citant axes forts/faibles",'
            '"risks":[{"risk":"...","probability":"haute|moyenne|basse","impact":"critique|important|modere","mitigation":"..."}],'
            '"bellum_read":{"verdict_line":"...","why":["...","...","..."],"missing":"...","next_action":"..."},'
            '"dossier_read":{'
            '"axes":[{"key":"adequation_offre","state":"measured|partial|unknown","value":0,"impact":"...","lever":"..."},'
            '{"key":"potentiel_commercial","state":"...","value":0,"impact":"...","lever":"..."},'
            '{"key":"fraicheur","state":"...","value":0,"impact":"...","lever":"..."},'
            '{"key":"accessibilite","state":"...","value":0,"impact":"...","lever":"..."},'
            '{"key":"capacite_achat_externe","state":"...","value":0,"impact":"...","lever":"..."},'
            '{"key":"concurrence","state":"...","value":0,"impact":"...","lever":"..."},'
            '{"key":"qualite_preuves","state":"...","value":0,"impact":"...","lever":"..."}],'
            '"why_for_your_esn":"...","recommended_scope":"...",'
            '"best_entry_point":{"label":"...","target_profile":"...","why":"..."},'
            '"access_path":"...",'
            '"obstacles":[{"label":"...","why":"..."}],'
            '"anti_advice":{"what":"...","why":"..."},'
            '"next_action":{"label":"...","tab":"contacts|evaluation|overview|messages"},'
            '"reliability":{"quality":{"state":"...","value":0},"coverage":{"state":"...","value":0},'
            '"freshness":{"state":"...","value":0}},'
            '"no_go":{"context":"...","trigger":"..."},'
            '"missing":[{"label":"...","why":"..."}]}}}'
            "\n\nBELLUM READ (#1607.1, obligatoire — QUATRE BLOCS distincts, en plus de scoreBreakdown/justification/risks, "
            "pour le résumé affiché en tête de dossier) :\n"
            "- verdict_line : UNE phrase courte et directe, le verdict en clair (ex: « SNCF se travaille par entité, pas au "
            "niveau groupe. »). Jamais un chiffre nu, jamais une probabilité.\n"
            "- why : 1 à 3 PREUVES maximum qui justifient ce verdict — des faits du dossier (signal, contact, structure), "
            "jamais une reformulation du score.\n"
            "- missing : UNE ligne explicite sur ce qui MANQUE pour trancher plus fort (ex: « Pas de contact confirmé "
            "côté DSI Retail »).\n"
            "- next_action : UNE SEULE action. Si le seul argument disponible est l'environnement technique observé "
            "(bloc observation du marché ci-dessus, quand il est présent) sans aucune preuve actuelle, c'est une action de "
            "VÉRIFICATION (« Vérifier si... »), jamais une action commerciale. Sinon (preuve actuelle : contact "
            "confirmé, signal daté, appel d'offres, échange client), formule une action commerciale concrète.\n"
            "\n\nDOSSIER READ (#2118, obligatoire) — la lecture STRUCTURÉE du dossier, en plus de bellum_read :\n"
            "- axes : les SEPT axes ci-dessus, TOUS présents, dans cet ordre, aucun autre, aucun renommé. "
            "Chaque axe porte son `state` : `measured` (tu as de quoi le noter), `partial` (tu as de quoi le "
            "noter, sur des preuves minces), `unknown` (tu n'as PAS de quoi le noter). "
            "⚠️ Un axe `unknown` n'a PAS de `value` — retire la clé. Ne mets JAMAIS 0 pour dire « je ne sais "
            "pas » : un axe non évalué SORT du calcul, il ne fait pas baisser la note. Un axe `measured` ou "
            "`partial` porte une `value` de 0 à 5 sur les FAITS du contexte. "
            "`impact` = ce que cet axe fait au verdict, en une phrase. `lever` = ce qui le ferait monter, "
            "concrètement. Mieux vaut trois axes honnêtement notés que sept devinés. "
            "#2306.5 — `accessibilite` note AUSSI les CONDITIONS d'engagement (taille du compte, budget, "
            "localisation, modèle contractuel, TJM praticable pour ce profil), pas seulement l'accès à un "
            "décideur : ce ne sont pas des faits séparés, ce sont les conditions DE ce même accès.\n"
            # #2118.10/.14/.15 — le rôle, le territoire et la capacité de démarrage sont lus
            # ici ; un champ « non renseigne » se nomme, il ne se suppose pas.
            "- why_for_your_esn : pourquoi CE compte pour CETTE ESN — cite ses offres, ses références, sa "
            "taille, son territoire, ses secteurs, sa capacite de demarrage, son modèle (staffing) et le "
            "role du commercial (PROFIL ESN du contexte système). Un champ du PROFIL ESN « non renseigne » ne se suppose "
            "PAS : nomme-le dans `missing` s'il aurait changé la lecture. "
            "⚠️ Une raison INTERCHANGEABLE entre deux ESN est une raison FAUSSE : si ta phrase resterait vraie "
            "en changeant l'ESN, réécris-la. Aucun gabarit, aucune généralité sur le compte seul.\n"
            "- recommended_scope : la BU / l'entité / le programme à attaquer, jamais « le groupe ».\n"
            "- best_entry_point : la meilleure porte d'entrée — qui, quel profil, pourquoi lui.\n"
            "- access_path : la voie d'achat ou d'accès PLAUSIBLE sur ce compte — DISTINCTE de "
            "best_entry_point (qui contacter) : PAR OÙ entrer commercialement (un programme déjà lancé, "
            "un appel d'offres en cours, une porte partenaire, un panel fournisseur ouvert…). Absente si "
            "aucune voie plausible n'est identifiable — jamais une voie devinée.\n"
            "- obstacles : les freins réels, chacun avec sa raison.\n"
            "- anti_advice : ce qu'il ne faut PAS faire sur ce compte, et POURQUOI "
            "(ex. « ne commence pas par le CTO groupe : il ne décide pas du budget de la BU Retail »). "
            "Les deux champs ensemble ou rien.\n"
            "- next_action : le geste suivant et son onglet — DISTINCT de bellum_read.next_action, qui est la "
            "phrase du résumé.\n"
            f"⚠️ ANTI-GÉNÉRIQUE (#2304.28-.31) — SUR TOUS LES CHAMPS TEXTE de dossier_read ci-dessus "
            f"(why_for_your_esn, recommended_scope, best_entry_point, obstacles, anti_advice, next_action, "
            f"missing) : {quoted_fr(DOSSIER_VERDICT_FORBIDDEN_PHRASINGS)} sont INTERDITES. Ce sont des "
            "généralités vraies pour n'importe quel compte, donc fausses pour CELUI-CI — nomme le fait "
            "concret qu'elles maquillent (quelle offre, quel signal daté, quel contact nommé, quel échange "
            "précis) au lieu de les écrire.\n"
            "- reliability : la fiabilité du DOSSIER (qualité de la collecte, couverture, fraîcheur), 0-100 "
            "chacune. Elle ne dit RIEN du potentiel du compte. Même règle : `unknown` sans chiffre.\n"
            "- no_go : SEULEMENT si le compte est à écarter aujourd'hui — `context` (ce qui bloque maintenant) "
            "et `trigger` (l'événement qui rouvrirait le compte). Un no-go est toujours temporaire : "
            "s'il n'existe aucun déclencheur plausible, n'écris pas ce bloc.\n"
            "- missing : ce que tu n'as PAS pu évaluer, un élément par ligne, NOMMÉ, avec sa raison. "
            "C'est ce qui rend le reste crédible — ne le laisse pas vide par confort.\n"
            f"\n\nNote chaque axe sur son max, sur les FAITS du contexte (decideurs identifies -> axe accessibilite ; signaux/recrutements/budget {d['label']} -> axe timing ; prestataires en place/concurrents -> axe concurrence ; ton profil ESN (consultants en mission, vivier actif, capacite de demarrage — pas seulement la taille) vs le besoin -> axe capacite). "
            "Le total /25 et le verdict sont RECALCULES ensuite — ne les mets pas. "
            "Calibrage (repere) : STOP = mauvais compte, aucun fit / aucun signal / inaccessible, ne pas y perdre de temps. "
            "PRUDENT = potentiel reel mais avec freins (acces difficile, cycle long, achats structures) — c'est le cas le PLUS courant sur un grand groupe. "
            "GO = fort fit + accessible + signaux chauds. "
            "EXPLORER = potentiel mais donnees manquantes : l'action est d'aller collecter l'info, pas de conclure. "
            f"Un grand groupe bancaire avec signaux {d['label']}, decideurs identifies et budget, mais acces difficile et achats structures = PRUDENT (~15-18/25), PAS STOP. "
            "L'axe capacite penalise DEJA le grand compte pour une petite ESN (delivery/references limitees) — ne re-penalise pas les autres axes pour la meme raison."
        ),
        "competitive_strategy": '{"competitiveStrategy":{"positioningStatement":"...","vsCompetitors":[{"competitor":"...","differentiator":"...","talkingPoint":"..."}]}}',
    }

    if section not in section_schemas:
        raise ValueError(f"Unknown section: {section}")

    return (
        f"Genere UNIQUEMENT la section '{section}' pour le plan commercial final du compte "
        f"{company_name} (analyse compte + contacts fournis dans le contexte système).\n\n"
        "Contraintes:\n"
        "- Repondre uniquement en JSON valide\n"
        "- Sois CONCIS : 1-2 phrases par champ texte, du concret, pas de remplissage\n"
        "- Retourner exactement ce schema (aucun champ additionnel):\n"
        f"{section_schemas[section]}"
        # #2118.9 / #2118.16 — la section qui écrit le verdict reçoit la BU et la
        # stratégie validée ; "" sans elles (byte-identique).
        f"{seller_scope_directive_block(profile_data) if section == 'evaluation' else ''}"
        f"{esn_objectives_directive_block(profile_data) if section == 'evaluation' else ''}"
        f"{esn_relations_directive_block(profile_data) if section == 'evaluation' else ''}"
        f"{esn_available_time_directive_block(profile_data) if section == 'evaluation' else ''}"
    )


# The five temporal buckets of ``actionPlan.phases``. The single ``action_plan``
# section used to generate all five in one Claude call (~8600 output tokens),
# which truncated its budget and restarted at double — 339s, 100% of Phase-4
# wall time. Splitting one call per bucket lets them run concurrently
# (asyncio.gather, like the other sections) so the slowest single bucket — not
# their sum — sets the wall time (~30s).
ACTION_PLAN_PHASES: tuple[str, ...] = ("IMMEDIAT", "MOIS 1", "MOIS 2-3", "MOIS 3-6", "MOIS 6-12")

# Per-action schema, shared by every phase prompt.
_ACTION_SCHEMA = (
    '{"action_id":"action_immediate_1","action":"...","contact":"...",'
    '"channel":"linkedin|email|phone|event|meeting|content","deadline":"J+3",'
    '"expectedOutcome":"...","kpi":"..."}'
)


def build_action_plan_meta_prompt(*, company_name: str) -> str:
    """Prompt for the ``actionPlan`` header only — ``strategy`` + ``justification``.

    Account + contacts are in the (cached) system context. The temporal phases
    are generated separately (one call each).
    """
    return (
        f"Genere UNIQUEMENT la strategie globale du plan d'action pour {company_name} "
        "(champs 'strategy' et 'justification'), SANS les phases temporelles. "
        "Analyse compte + contacts dans le contexte système.\n\n"
        "Contraintes:\n"
        # #2501 — le découpage meta/phases a perdu la borne de longueur que
        # portait l'ancien schéma monolithique ("2-3 phrases" / "2 phrases").
        # Sans elle le modèle écrit parfois plus que ACTION_PLAN_META_MAX_TOKENS
        # ne permet, et la sortie est tronquée en plein JSON.
        "- 'strategy' en 2-3 phrases MAXIMUM : angle d'attaque, differenciation, scenario de conquete\n"
        "- 'justification' en 2 phrases MAXIMUM\n"
        "- Repondre uniquement en JSON valide\n"
        "- Retourner exactement ce schema (aucun champ additionnel):\n"
        '{"strategy":"...","justification":"..."}'
    )


def build_action_plan_phase_prompt(*, company_name: str, phase_name: str) -> str:
    """Prompt for a single temporal bucket of ``actionPlan.phases``.

    Account + contacts are in the (cached) system context, so each phase call
    stays small + per-call-unique.
    """
    if phase_name not in ACTION_PLAN_PHASES:
        raise ValueError(f"Unknown action-plan phase: {phase_name}")
    schema = (
        '{"phase":{"name":"' + phase_name + '","title":"...","objective":"...","actions":[' + _ACTION_SCHEMA + "]}}"
    )
    return (
        f"Genere UNIQUEMENT la phase temporelle '{phase_name}' du plan d'action commercial "
        f"pour {company_name} (analyse compte + contacts dans le contexte système).\n"
        "Liste 2 a 4 actions concretes et actionnables pour CETTE phase uniquement.\n\n"
        "Contraintes:\n"
        "- Repondre uniquement en JSON valide\n"
        "- Sois CONCIS : champ 'action' en 1 phrase (verbe + cible + canal), pas de remplissage\n"
        f"- Le champ 'name' DOIT valoir exactement '{phase_name}'\n"
        "- Retourner exactement ce schema (aucun champ additionnel):\n"
        f"{schema}"
    )
