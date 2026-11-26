from __future__ import annotations

from app.prompts.fencing import sources_block
from app.services.domain_focus import resolve_domain_focus
from app.prompts.style import FRENCH_STYLE_DIRECTIVE


def build_system_prompt(profile_data: dict) -> str:
    """BELLUM-FACTS — what the company IS.

    Sister to BELLUM-SIGNALS and BELLUM-STRATEGY (Phase 1, run in parallel).
    Stays narrow: structural / static info, no sales narrative. Output cap is
    deliberately small so Claude never trunces — see `phase1_research.py`.
    """
    p = profile_data
    # Domain lens (Drive #9) — IT strings for an IT ESN (or empty profile), the
    # ESN's own domain for a non-IT ESN.
    d = resolve_domain_focus(profile_data)
    return f"""{FRENCH_STYLE_DIRECTIVE}\n\nTu es BELLUM, agent d'intelligence commerciale specialise ESN.

===== PROFIL ESN CIBLE =====
- Nom : {p.get("companyName", "N/A")}, Taille : {p.get("size", "N/A")} consultants
- Offres : {", ".join(p.get("offers", []))}
- Secteurs : {", ".join(p.get("sectors", []))}
- Personas cibles : {", ".join(p.get("personas", []))}
- Defi principal : {p.get("mainChallenge", "N/A")}

===== MISSION =====
Extraire les FAITS structurels de l'entreprise cible (qui elle est, ce qu'elle fait, son organisation, son {d["system_label"]}). Tu ne produis PAS de signaux d'actualite (autre prompt) ni de strategie de vente (autre prompt). Reste factuel.{d["domain_brief"]}

===== CALIBRATION priorityScore (5 criteres terrain) =====
priorityScore (1-10) pondere 5 criteres du plan de compte ESN :
1. {d["budget_signal"]}
2. Accessibilite (contact interne direct, ancien consultant place)
3. Urgence business (transfo, croissance, pression reglementaire GDPR/DORA/NIS2, M&A)
4. Maturite ecosysteme (deja 5+ vendors, habitude de sous-traiter)
5. Alignement avec l'offre ESN (leur besoin = coeur de metier)
La taille de l'ESN ({p.get("size", "N/A")} consultants) borne le score : 1-20 -> grand compte CAC40 = 3-5 max, ETI regionale = 7-9 ; 20-100 -> grand compte = 5-7, ETI = 7-9 ; 100+ -> score normal selon fit.

===== REGLES =====
1. AUCUNE invention. Si une info n'est pas dans les sources, ecrire "Non identifie dans les sources".
2. ETIQUETAGE : distingue un FAIT verifie (present dans les sources) d'une donnee deduite (hypothese). Ne presente jamais une hypothese comme un fait.
2bis. DONNEES INTERDITES comme faits (Drive §8) — a formuler en HYPOTHESE a verifier, jamais affirmees sans source citee : budget/enveloppe exact, proprietaire/decideur final de la decision, organisation politique interne, fournisseur (vendor) en place, date de fin de contrat, intention d'achat, effectifs IT precis.
3. Les noms de programmes {d["label"]} doivent etre REELS et trouves dans les sources.
4. priorityScore reflete le match reel entre l'ESN et la cible (5 criteres ci-dessus). Justifie chaque point.
5. VOCABULAIRE : une valeur est lue par un commercial devant son prospect. N'y nomme jamais un outil de collecte ni un nom de champ technique ("revenue_latest", "naf_code"). Une donnee absente s'ecrit "Non identifie dans les sources" — pas "donnee <outil> <champ> non disponible". Citer une source PUBLIQUE (presse, rapport annuel, INSEE, BODACC) reste demande.
6. Reponds UNIQUEMENT en JSON valide, rien avant ni apres."""


def build_user_prompt(
    target_company: str,
    brave_results: str,
    scraped_content: str,
    pappers_data: str,
    user_context: str = "",
    profile_data: dict | None = None,
) -> str:
    # Domain lens (Drive #9, Phase 2) — IT strings for an IT ESN (or empty
    # profile), the ESN's own domain for a non-IT ESN. The
    # JSON KEYS (itAutonomy, it_implications_for_esn, programNames) are the data
    # contract and stay fixed — only their human-readable descriptions specialise.
    # #2636.1 — `entitiesExhaustive[].type` gagne factory/data office/lab : une
    # unite IA/Data nommee comme telle ne doit pas retomber sur le generique BU
    # (`org_graph_assembler._ENTITY_TYPE_TO_CONTRACT`), sinon elle reste
    # invisible comme branche propre de l'organigramme affiche.
    d = resolve_domain_focus(profile_data)
    return f"""Extrais les FAITS de "{target_company}".

===== SOURCES =====
{sources_block(brave_results, scraped_content, pappers_data, user_context)}

===== SCHEMA JSON ATTENDU =====
{{
  "businessDescription": "3-4 phrases denses : modele economique, strategie, maturite digitale, perspectives. Pas de remplissage.",
  "sector": "secteur principal (SIC/NAF si dispo)",
  "employees": "nombre exact ou fourchette",
  "revenue": "CA en euros",
  "headquarters": "adresse complete du siege",
  "website": "URL corporate",
  "isPublic": true,

  "subsidiaries": ["TOUTES les filiales identifiees, y compris celles dont le nom ne porte PAS la marque du groupe (nom commercial different de la raison sociale : ex. Fortuneo, Suravenir pour Arkea). Ne filtre jamais sur la marque du groupe."],

  "entitiesExhaustive": [
    "(MIN 4 elements) Pour chaque entite :",
    "Une entite est une ORGANISATION (filiale, BU, direction, site). JAMAIS une personne : ni 'Prenom Nom', ni 'Prenom Nom - Fonction'. Les personnes vont dans les contacts, pas ici.",
    "{d["tech_entity_directive"]}",
    "whatToSell / stack : SEULEMENT pour les entites operationnelles majeures (BU, filiales, hub IT) — [] pour la longue traine (holdings, directions support). Reste concis (max 4 items chacun) pour ne pas depasser la limite de tokens.",
    {{
      "name": "nom exact",
      "type": "filiale | BU | direction | departement | JV | GIE | GIE informatique | factory | data office | lab",
      "parent": "entite parente",
      "region": "zone geo",
      "estimatedHeadcount": "effectif estime",
      "itAutonomy": "autonome | partage | centralise",
      "whatToSell": ["(max 4) angles ESN concrets pour CETTE entite : {d["sell_examples"]}..."],
      "stack": ["(max 4) technos propres a CETTE BU si connues, ex: GBIS=Java/C++/quant, BoursoBank=mobile/data/anti-fraude ; [] si inconnu"],
      "isActive": "false UNIQUEMENT si une source dit explicitement cette entite cessee/radiee/fermee — omets le champ si non mentionne, ne devine JAMAIS",
      "hasTeam": "false UNIQUEMENT si les sources decrivent une adresse purement administrative/legale sans equipe operationnelle (ex: siege social sans effectif declare) — omets le champ si non mentionne, ne devine JAMAIS"
    }}
  ],

  "sitesFrance": [
    "(MIN 2 elements) Pour chaque site :",
    {{
      "city": "ville",
      "type": "siege | R&D | usine | datacenter | agence | bureau commercial",
      "importance": "strategique | haute | moyenne | basse",
      "estimatedHeadcount": "effectif sur le site",
      "notes": "particularites"
    }}
  ],

  "programNames": [
    "(MIN 2) Pour chaque programme {d["label"]} REEL identifie dans les sources :",
    {{
      "name": "nom exact du programme",
      "entity": "entite qui le porte (si connue, sinon vide)",
      "budget": "budget/enveloppe cite (si connue, sinon vide)",
      "description": "1-2 phrases sur le contenu du programme",
      "objective": "objectif du programme TEL QUE DIT par la source, vide si non precise",
      "scope": "perimetre documente (filiales, zones, population) TEL QUE DIT par la source, vide si non precise",
      "horizon": "horizon/echeance TEL QUE DIT par la source (ex: 2029), vide si non precise"
    }}
  ],

  "technologyStack": [
    "(MIN 5, viser 8) Pour chaque techno :",
    {{
      "name": "nom",
      "usage": "comment elle est utilisee (1-2 phrases)",
      "maturity": "legacy | mature | emerging | PoC",
      "opportunityForESN": "opportunite pour l'ESN (migration, expertise, integration, TMA)"
    }}
  ],

  "regulations": ["reglementations sectorielles applicables (RGPD, NIS2, DORA, LPM, sectoriel...)"],

  "concrete_activity": "Ce que fait l'entreprise en chiffres operationnels (2-3 phrases). Ex: 'opere 15 000 trains/jour, transporte 5M voyageurs'.",

  "it_implications_for_esn": "Besoins {d["label"]} NES de cette activite specifique. 2-3 phrases.",

  "data_freshness": {{
    "signals": "recent | old | undated",
    "financials": "recent | old | undated",
    "contacts": "recent | old | undated"
  }},

  "priorityScore": 7,
  "priorityJustification": "3 phrases concises couvrant : fit offres/besoins, accessibilite pour cette taille d'ESN, timing/potentiel CA.",
  "adjusted_score_factors": {{
    "offer_fit_raw": 0,
    "accessibility_raw": 0,
    "urgency_raw": 0,
    "cycle_fit_raw": 0
  }}
}}"""
