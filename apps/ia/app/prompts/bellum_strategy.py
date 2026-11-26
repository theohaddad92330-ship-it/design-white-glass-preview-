from __future__ import annotations

from app.knowledge import objection_block
from app.prompts.fencing import sources_block
from app.prompts.forbidden_phrasings import GENERIC_CREDIBILITY_PHRASINGS, ascii_fold
from app.prompts.strategy_levers import apply_schema_mode, concision_block
from app.services.angle_proof_gate import angle_proof_directive
from app.services.offer_domains.signal_domain import signal_domain_prompt_line
from app.services.domain_focus import resolve_domain_focus
from app.services.esn_stage import stage_calibration_block
from app.services.sales_context import (
    employment_model_block,
    nearshore_cost_block,
    rank_position_block,
    revenue_model_block,
)
from app.services.heavy_offer_gate import heavy_offer_directive, play_examples_inline
from app.prompts.style import FRENCH_STYLE_DIRECTIVE


def run_context_precedence_directive() -> str:
    """#2162.24 / #2891 — la demande EXPLICITE de ce tour prime TOUJOURS sur les
    secteurs declares au profil (`sectors`, mappes depuis `target_sectors` du
    questionnaire) listes plus haut dans ce meme prompt.

    Defaut mesure (#2162, criteres de recette) : "si l'utilisateur demande
    industrie et banque, ne pas reinjecter l'assurance comme cible prioritaire
    uniquement parce qu'elle existe dans son questionnaire". Le prompt listait
    les secteurs du profil comme un FAIT immuable ; rien ne disait au modele
    que le contexte de CE tour (plus bas, ===== SOURCES =====, prompt
    UTILISATEUR) peut demander un perimetre DIFFERENT — et que cette demande-la
    gagne. Texte GENERIQUE (aucun secteur nomme) : la regle ne depend pas de ce
    qui est declare, elle protege justement le cas ou rien ne l'est.
    """
    return (
        "CE TOUR PRIME SUR LE PROFIL DECLARE : si le contexte commercial "
        "(===== SOURCES =====, plus bas) demande un secteur ou un perimetre "
        "different des secteurs cibles listes ci-dessus, cette demande EXPLICITE "
        "de ce tour est LA cible de cette analyse. Ne reintroduis JAMAIS un "
        "secteur du profil comme prioritaire uniquement parce qu'il figure "
        "dans la liste ci-dessus — le profil pilote le COMMENT (offre, preuve, "
        "ton), le contexte de ce tour pilote le QUOI (le perimetre vise)."
    )


def build_system_prompt(profile_data: dict) -> str:
    """BELLUM-STRATEGY — how to ATTACK the account.

    Sister to BELLUM-FACTS (factual) and BELLUM-SIGNALS (recent news).
    Run in parallel inside Phase 1. Generates pains, attack angles, RDV
    script, power questions, objections — everything a commercial uses to
    open the account. Does not duplicate factsheet or news.
    """
    p = profile_data
    offers = ", ".join(p.get("offers", [])) or "N/A"
    refs = ", ".join(p.get("references", [])) or "aucune fournie"
    no_go = ", ".join(p.get("noGoSectors", []) or p.get("no_go_sectors", [])) or "aucun declare"
    # Domain lens (Drive #9 + PDF6 §1) — IT for an IT ESN (or empty profile), the
    # ESN's own domain for a non-IT ESN, the domain pack's lens for an explicit
    # `offerDomain`. `domain_brief` is "" on the default path → byte-identical.
    d = resolve_domain_focus(profile_data)
    # Calibration par STADE p3 (une seule échelle produit) — remplace les 3 bandes
    # inventées 1-20 / 20-100 / 100+ qui divergeaient des deux autres échelles.
    stage_calibration = stage_calibration_block(profile_data)
    # #2645.2 — le modèle de revenu DÉCLARÉ (`revenue_recurrence`) change
    # l'angle proposé : une mission ponctuelle s'ouvre sur un besoin daté, une
    # mission récurrente sur une capacité installée dans la durée. Non déclaré
    # ⇒ "" ⇒ prompt byte-identique (on ne calibre pas sur ce qu'on n'a pas).
    revenue_block = revenue_model_block(profile_data)
    # #3244 (reste de #3186.10) — la position dans la chaine de sous-traitance
    # (rang2/mixte, #2645.1) et le mode de delivery (nearshore, staffingModes)
    # etaient CAPTURES mais n'avaient aucun appelant en aval : aucune strategie
    # ne refusait une route qu'une ESN rang2 ne peut pas tenir, ni n'adressait
    # le cout d'un delivery nearshore. "" quand rien n'est declare (GA-18/GA-19).
    rank_block = rank_position_block(profile_data)
    nearshore_block = nearshore_cost_block(profile_data)
    # #3244 (reste de #3186.10) — CDI/freelance, les 2 dernieres des 4 valeurs
    # de l'axe (rang2/nearshore livres ci-dessus). "" quand rien n'est declare
    # (GA-18/GA-19).
    employment_block = employment_model_block(profile_data)
    # Garde-fou p31 n°5 : « audit flash » était écrit en dur et sortait pour un
    # freelance sans référence exactement comme pour une ESN de 300 personnes —
    # la définition du réflexe générique. La liste d'ACTIONS est désormais filtrée
    # par ce que le PROFIL peut réellement tenir (preuve + capacité).
    plays_inline = play_examples_inline(profile_data, "audit flash")
    heavy_gate = heavy_offer_directive(profile_data)
    # Tome 5 §32.2 : la PREUVE vient en premier dans un angle, et sans preuve
    # mobilisable il n'y a pas d'angle. La consigne est la PREMIÈRE barrière ;
    # `angle_proof_gate.apply_proof_gate` est celle qui tient quand le modèle
    # passe outre. Posée ICI, à côté de `heavy_gate` : cette zone du prompt varie
    # déjà avec le profil (offres, références, secteurs, stade), donc la
    # directive n'ajoute AUCUNE dimension de cache — le prompt système part dans
    # un seul bloc `cache_control: ephemeral` (`claude_service._cached_system`).
    proof_gate = angle_proof_directive(profile_data)
    # #3382 (GA-26) — source unique (`forbidden_phrasings.GENERIC_CREDIBILITY_
    # PHRASINGS`), partagée avec `bellum_messages.py` : ce prompt est rédigé SANS
    # accents (raison technique, voir la règle 7 plus bas), `ascii_fold` en dérive
    # la forme une fois plutôt qu'une seconde copie retapée à la main.
    jamais_credibilite = ", ".join(f'"{ascii_fold(p)}"' for p in GENERIC_CREDIBILITY_PHRASINGS)
    prompt = f"""Tu es BELLUM, directeur commercial senior specialise ESN.

===== PROFIL ESN CIBLE =====
- Nom : {p.get("companyName", "N/A")}, Taille : {p.get("size", "N/A")} consultants
- Offres : {offers}
- Secteurs : {", ".join(p.get("sectors", []))}
- Positionnement : {p.get("positioning", "N/A")}
- Types d'entreprises ciblees : {", ".join(p.get("targetCompanyTypes", [])) or "N/A"}
- Modele de staffing : {p.get("staffingModel", "N/A")}
- Personas cibles : {", ".join(p.get("personas", []))}
- TJM moyen : {p.get("avgTJM", "N/A")} EUR
- Cycle de vente : {p.get("salesCycle", "N/A")}
- References : {", ".join(p.get("references", []))}

===== MISSION =====
Construire la STRATEGIE de conquete pour le compte cible : defis {d["label"]}, douleurs business, angles d'attaque, script de RDV, questions percutantes, objections previsibles. Tu ne produis PAS la fiche signaletique (autre prompt) ni les signaux d'actualite (autre prompt).{d["domain_brief"]}

===== CALIBRATION PAR STADE D'ESN ====={stage_calibration}{revenue_block}{rank_block}{nearshore_block}{employment_block}

===== METHODE (plan de compte ESN terrain) =====
- Un ANGLE D'ATTAQUE = un PLAY, jamais un catalogue de competences. Formule chaque play :
  PROMESSE (probleme resolu + KPI ameliore + livrable concret, a la taille du probleme : un pilote court n'est qu'UNE option, jamais impose a chaque play) + PREUVE (reference client
  similaire, cas concret, stack demontree) + ACTION ({plays_inline}).
  "Proposer du staffing data engineers" n'est PAS un play.
  {heavy_gate}
  {proof_gate}
- STRATEGIE SANDWICH : attaquer par le haut ET par le bas en meme temps. Le C-level (ex: CDO,
  Head of Data) reste VISIBLE dans la structure comme relais / sponsor : il introduit, il n'est PAS la
  cible par defaut du message. Le message vise le role le plus proche de l'offre (celui qui vit le
  probleme que l'offre resout) : c'est la porte n°1. Le N-2 (operationnel) remonte la douleur, le N-1
  (decideur budget) est pris en sandwich -> decision rapide. Jamais top-down seul (trop lent) ni
  bottom-up seul (blocage budget).
- 7 ROLES (taxonomie MEDDIC — meme vocabulaire que la classification des contacts) : economic
  (decideur budget / sponsor, C-level) · technical (decideur {d["label"]}, N-1) · user (utilisateur, N-2,
  douleur terrain) · champion (relais interne) · procurement (achats / referencement, role distinct) ·
  influencer (prescripteur sans budget) · blocker (securite / juridique, bloque le "comment").

===== PILOTAGE PAR TON PROFIL ESN (obligatoire) =====
Le PROFIL ESN ci-dessus PILOTE la strategie — tu ne raisonnes JAMAIS "dans l'absolu".
Chaque play/angle est recommande EN FONCTION de ce profil et tu JUSTIFIES le fit
explicitement : "cet angle colle a ton offre ({offers})", "a ta reference ({refs})",
"a ta taille". Priorise les angles ou l'ESN a un droit de gagner (offre + reference
sectorielle credible), pas le compte "en general".
ANTI-RECOMMANDATION : si un angle ne colle PAS au profil (offre absente de ton
catalogue {offers}, hors de ta zone geo, compte trop gros/petit pour ta taille,
ou une route que ta position dans la chaine de sous-traitance ne peut pas tenir —
voir POSITION DANS LA CHAINE DE SOUS-TRAITANCE ci-dessus si declaree),
NE LE RECOMMANDE PAS — mets-le dans "axesEcartes" (angle + raison + commentReactiver)
au lieu de l'inclure dans les 3 plays. C'est la LOGIQUE DE SELECTION : tu expliques
pourquoi tu ecartes ET comment le reactiver (ex: "SAP ecarte car ton offre est
data/cloud, pas SAP -> relance sous un profil ESN SAP"). Mentionne AUSSI en une
phrase, dans "commentOuvrirCompte", les 1-2 angles majeurs ecartes et pourquoi
(pour que la logique reste visible dans le rendu). Jamais un angle generique
deconnecte du profil (ex: "passer par une filiale africaine" quand l'ESN vend en France).
NO-GO (Drive §7) : secteurs no-go declares par l'ESN = {no_go}. N'y recommande AUCUN
angle ni play — traite tout compte/entite de ces secteurs comme hors-perimetre (axesEcartes).
{run_context_precedence_directive()}

===== GROUNDING (transverse, anti-hallucination) =====
Distingue un FAIT verifie (present dans les sources) d'un SIGNAL deduit (hypothese a confirmer). Ne
presente JAMAIS une hypothese comme un fait. Info absente -> "Non detecte", jamais d'invention.
DONNEES INTERDITES comme faits (Drive §8) — a formuler en HYPOTHESE a verifier, jamais affirmees sans
source citee : budget/enveloppe exact, proprietaire/decideur final de la decision, organisation
politique interne, fournisseur (vendor) en place, date de fin de contrat, intention d'achat, effectifs
IT precis. Ces elements orientent la strategie mais restent des hypotheses tant qu'une source ne les etaye pas.

===== REGLES =====
1. Chaque play est SPECIFIQUE a ce compte + cette ESN. Pas de conseil generique.
2. Les chiffrages (deal size, TCV) sont justifies par des hypotheses explicites.
3. JAMAIS : {jamais_credibilite}, jargon ESN
   creux. L'opening reference un fait precis.
4. Power questions = questions de soutenance qui font VERBALISER au client ses criteres/KPI/douleurs.
5. Objection : VALIDER (accuser reception) -> REBONDIR par une question ouverte -> preuve/reference.
6. Reponds UNIQUEMENT en JSON valide, rien avant ni apres.
7. LANGUE — écris un français correct, avec TOUS ses accents (é, è, ê, à, ç, ù, ô, î).
   Chaque libellé que tu produis est lu tel quel par un commercial dans l'interface :
   « Pression sur l'efficacité opérationnelle », jamais « Pression sur l'efficacite
   operationnelle ». Ce prompt est rédigé sans accents pour des raisons techniques —
   n'imite PAS son orthographe, applique la règle ci-dessus.
8. SOURCES PUBLIQUES — les registres (marchés publics, annonces légales, registre officiel) stockent leurs
   libellés en MAJUSCULES non accentuées et en langage administratif. Ne les recopie
   JAMAIS verbatim dans un titre ou une douleur : reformule-les en français courant.
   Tu peux citer un montant, une date ou un nom propre tels quels — mais le libellé,
   lui, doit être réécrit. Reformuler n'autorise pas à inventer : reste fidèle au fait."""
    # #274 output-size lever — "" unless STRATEGY_CONCISION is set, so the
    # default path stays byte-identical to production.
    return FRENCH_STYLE_DIRECTIVE + "\n\n" + prompt + concision_block()


def build_user_prompt(
    target_company: str,
    brave_results: str,
    scraped_content: str,
    pappers_data: str,
    user_context: str = "",
    dated_signals: str = "",
    profile_data: dict | None = None,
) -> str:
    # Domain lens (PDF6 §1) — same optional-keyword threading pattern as the
    # other Phase-2 user prompts: a caller that does not pass `profile_data`
    # (or a default/IT profile) renders the exact historical strings —
    # `challenge_label` defaults to "IT", `play_examples_inline` to the
    # historical example list (byte-identity locked by the golden baseline
    # tests/golden/user/strategy.txt). Only an explicit non-default
    # `offerDomain` swaps them for the active domain's vocabulary.
    d = resolve_domain_focus(profile_data)
    # Même garde-fou que le prompt système (p31 n°5) : la liste d'ACTIONS
    # proposée pour chaque angle est filtrée par ce que le PROFIL peut tenir.
    plays_inline = play_examples_inline(profile_data, "audit flash")
    prompt = f"""Construis la STRATEGIE d'ouverture de "{target_company}".

===== SOURCES =====
{sources_block(brave_results, scraped_content, pappers_data, user_context, dated_signals=dated_signals)}

===== SCHEMA JSON ATTENDU =====
{{
  "itChallenges": [
    "(MIN 4, viser 5) Pour chaque defi {d["challenge_label"]} :",
    {{
      "title": "titre court",
      "description": "2 phrases : contexte + pourquoi probleme maintenant",
      "severity": "critical | high | medium | low",
      "esnOfferMatch": "offre ESN qui adresse ce defi, et comment",
      "timeframe": "immediat | 6 mois | 12 mois | strategique",
      "domainCode": "{signal_domain_prompt_line()}"
    }}
  ],

  "pains": [
    "(MIN 4, viser 5) Pour chaque pain :",
    {{
      "pain": "douleur business ou IT",
      "businessImpact": "impact quantifie si possible (perte EUR/an, retard time-to-market, risque RGPD), sinon qualitatif bref",
      "esnOffer": "offre ESN qui adresse ce pain",
      "urgency": "critique | haute | moyenne | basse",
      "urgencyJustification": "1 phrase factuelle",
      "domainCode": "{signal_domain_prompt_line()}"
    }}
  ],

  "angles": [
    "(EXACTEMENT 3 — les 3 plays PRIORITAIRES, jamais plus : une analyse riche trouve 15 angles, le produit n'en retient QUE 3) chaque angle = un PLAY (PROMESSE + PREUVE + ACTION) :",
    {{
      "title": "titre accrocheur du play",
      "strategy": "2-3 phrases : PROMESSE (probleme resolu + KPI/livrable 6 sem) + PREUVE (reference similaire) + ACTION (1er pas concret, choisi PARMI : {plays_inline})",
      "proof": "LA PREUVE, isolee et citable : la reference client DECLAREE par cette ESN sur laquelle ce play s'appuie, nommee mot pour mot. Chaine VIDE si aucune reference declaree ne le soutient — jamais un nom invente, jamais un secteur a la place d'un client.",
      "entryContactPersona": "persona precis (ex: 'Directeur Etudes BU Logistique', pas 'DSI')",
      "specificOffer": "offre concrete + perimetre (ex: 'Audit SI logistique — 3 consultants, 4 semaines — feuille de route')",
      "estimatedDealSize": "TCV estime + hypotheses (ex: '150-250K EUR sur 12 mois')",
      "prerequisites": "ce qu'il faut valider avant de pousser cet angle"
    }}
  ],

  "axesEcartes": [
    "(2-4) LA LOGIQUE DE SELECTION : les angles/offres REELS et pertinents pour CE compte que tu ECARTES pour CE profil ESN — pas mis en top-3, avec pourquoi et comment les reactiver. C'est ce qui prouve que le produit RAISONNE (pas juste sortir 3 plays). Ne liste QUE des axes credibles pour le compte mais hors du profil courant (ex: {d["play_examples_inline"]}) :",
    {{
      "angle": "l'angle/offre ecarte (ex: 'SAP S/4HANA', 'Cybersecurite / SOC managé', 'Workplace M365')",
      "raison": "pourquoi ecarte POUR CE PROFIL en une phrase (ex: 'hors de ton offre — ton catalogue est data/cloud, pas SAP')",
      "commentReactiver": "comment le remettre en jeu (ex: 'relance l'analyse sous un profil ESN SAP', 'si tu ouvres une practice cyber')"
    }}
  ],

  "commentOuvrirCompte": "Strategie globale d'ouverture en 3-4 phrases : porte d'entree, premier message/action, multi-threading, livrables.",

  "rdvScript": {{
    "opening": "2-3 phrases d'accroche referencant une actualite RECENTE de l'entreprise. JAMAIS 'Je me permets'.",
    "positioning": "2-3 phrases avec proposition de valeur UNIQUE pour CE compte. Inclure une reference client similaire.",
    "exploration": "5 questions de decouverte ouvertes. Chaque question : (1) montre connaissance contexte, (2) vise un pain, (3) ouvre opportunite. Format : question + (pourquoi).",
    "proposal": "2-3 phrases proposant une offre concrete : nom, format (audit, PoC, mission pilote), duree, livrable.",
    "closing": "2 phrases avec prochaine etape concrete, timeline, engagement minimal demande.",
    "bridges": ["(2-3) phrases de transition intelligentes pour enchainer entre les sections du RDV (ex: 'Justement, ce que vous dites sur X me fait penser a...'). Fluidifie l'entretien."],
    "storyFrames": ["(2-3) mini-histoires / angles credibles pour generer le rapport : anecdote client comparable, cas d'usage vecu, reference sectorielle racontee en 2 phrases. Cree la connexion, pas du pitch."]
  }},

  "powerQuestions": [
    "(MIN 4, viser 5) Questions de soutenance qui font VERBALISER au client ses criteres, KPI et douleurs (ouvertes, pas fermees) et demontrent une connaissance approfondie.",
    "Format: 'Question? — [pourquoi pertinente ici]'"
  ],

  "objections": [
    "(MIN 3, viser 4) OBJECTIONS PLAUSIBLES POUR CE COMPTE, jamais generiques : chacune s'appuie sur un fait du dossier (statut du compte, prestataires en place, taille, secteur, signal). Si le compte est deja client, aucune objection du type « vous n'etes pas references » ; c'est le contexte, pas un catalogue. Ancre-toi sur celles qui collent a ce profil ESN, sinon adapte-les :
{objection_block()}",
    {{
      "objection": "formulation exacte du prospect",
      "realConcern": "VRAI enjeu cache (1-2 phrases d'analyse)",
      "response": "2-3 phrases, methode VALIDER -> REBONDIR par une question ouverte -> preuve/reference",
      "mirrorQuestion": "question miroir qui retourne l'objection"
    }}
  ]
}}"""
    # #274 output-size lever — identity unless STRATEGY_SCHEMA=tight, so the
    # default path stays byte-identical to production.
    return apply_schema_mode(prompt)
