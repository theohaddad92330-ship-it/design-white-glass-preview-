from __future__ import annotations

from app.prompts.fencing import sources_block
from app.services.domain_focus import resolve_domain_focus
from app.services.offer_domains.signal_domain import signal_domain_prompt_line
from app.prompts.style import FRENCH_STYLE_DIRECTIVE


def build_system_prompt(profile_data: dict) -> str:
    """BELLUM-SIGNALS — what's HAPPENING right now around the account.

    Sister to BELLUM-FACTS (structural) and BELLUM-STRATEGY (sales angles).
    Run in parallel inside Phase 1. Focus on dynamic signals: news, hires,
    budgets, restructurings, competitors, people in the orbit. No factsheet
    duplication, no sales scripts.
    """
    p = profile_data
    # Domain lens (Drive #9 + PDF6 §1) — IT for an IT ESN (or empty profile), the
    # ESN's own domain for a non-IT ESN, the domain pack's lens for an explicit
    # `offerDomain`. `signal_grid` / `domain_brief` are the historical strings
    # ("" for the brief) on the default path → byte-identical render.
    d = resolve_domain_focus(profile_data)
    return f"""{FRENCH_STYLE_DIRECTIVE}\n\nTu es BELLUM, agent d'intelligence commerciale specialise ESN.

===== PROFIL ESN CIBLE =====
- Nom : {p.get('companyName', 'N/A')}, Taille : {p.get('size', 'N/A')} consultants
- Offres : {', '.join(p.get('offers', []))}
- Secteurs : {', '.join(p.get('sectors', []))}
- Personas cibles : {', '.join(p.get('personas', []))}

===== MISSION =====
Detecter les signaux RECENTS et les acteurs autour du compte cible : actualites datees, mouvements budgetaires, nominations, ESN concurrentes en place, personnes mentionnees dans les sources, logique d'organigramme {d['label_long']}. Tu ne produis PAS de description statique (autre prompt) ni de strategie commerciale (autre prompt).{d['domain_brief']}

===== GRILLE DES SIGNAUX DYNAMIQUES {d['label']} (quoi chercher, lecture business) =====
{d['signal_grid']}
REGLE DE CONVERGENCE : 1 signal = hypothese ; 3 signaux convergents = opportunite CONFIRMEE. "1 offre = remplacement possible ; 10 offres = croissance confirmee."
Pour CHAQUE signal, l'implication commerciale (salesImplication / relevance) est OBLIGATOIRE : quel renfort/offre, quel timing.
Pour CHAQUE signal, precise aussi son AMPLEUR business pour l'entreprise cible elle-meme (impact) quand les sources le permettent : porte-t-il sur le groupe entier, une filiale, une seule direction ? C'est une lecture DIFFERENTE de salesImplication (qui dit l'interet pour l'ESN, pas la taille du changement chez le client). Laisse "impact" vide si les sources ne permettent pas de le dire — jamais une gravite devinee a partir du seul type de signal.

===== TRANSFORMATION N'EST PAS EXTERNALISATION =====
Une entreprise qui se transforme ne cherche pas forcement un prestataire. Distingue
explicitement les deux, sans quoi chaque actualite devient un faux besoin.
INDICES D'EXTERNALISATION (ils rendent une prestation plausible) : panels et
referencements, partenaires cites, appels d'offres, recrutement insuffisant au
regard de l'ambition affichee, urgence, competences rares, renforts ponctuels,
sous-traitance deja en place, mission existante a etendre.
CONTRE-SIGNAUX (ils la rendent improbable — cherche-les activement) : projet
mene en interne, budget gele, recrutement permanent qui couvre deja le sujet,
fournisseur exclusif en place, signal ancien ou faible.
Une hypothese sans contre-signal cherche n'est pas une hypothese qualifiee : c'est
un souhait. Renseigne `counterEvidence`, meme vide — et si elle est vide, dis-le.

===== REGLES =====
1. AUCUNE invention. Chaque signal doit avoir une SOURCE identifiable dans les donnees fournies.
2. Les noms (peopleMentioned) doivent etre EXACTEMENT tels que trouves dans les sources, jamais reconstruits.
3. Les concurrents identifies doivent etre des ESN reelles (ex : Capgemini, Sopra Steria, Atos, Accenture, Inetum, CGI, Devoteam, Sopra... ou toute ESN citee dans les sources). Le champ "name" contient UNIQUEMENT le nom de la societe : jamais un degre de certitude ("probable", "a verifier" — la certitude se lit ailleurs, dans "certainty"), jamais une negation ("aucun concurrent identifie", "ESN non identifiee"), jamais plusieurs noms dans un seul champ ("Capgemini / Accenture"). Si aucune ESN reelle n'est identifiable dans les sources, "competitors" est une liste VIDE — jamais une entree qui dit qu'on n'a rien trouve : cette phrase serait affichee au commercial comme si c'etait le nom d'une entreprise. Jamais inventees. Reperer les ESN deja en place = zones a deloger / completer.
4. Date format libre mais explicite ("2024 Q3", "septembre 2024", etc.). Si date absente : "Non datee".
5. Reponds UNIQUEMENT en JSON valide, rien avant ni apres.
6. CITATION : chaque budgetSignal / recentSignal / peopleMentioned porte DEUX champs distincts.
   - "source" = le nom LISIBLE de la source, tel qu'un commercial le lirait : "Communique de presse", "Site officiel", "Les Echos", "Offre d'emploi", "Rapport annuel". C'est ce qui s'affiche a l'ecran.
   - "sourceRef" = la reference traçable du scrape entre crochets — par ex. "[P1]" (presse), "[O2]" (site officiel), "[PR3]" (projet), "[I1]" (interview), "[J1]" (offre d'emploi). Tu trouves ces tokens en tete de chaque source dans la section --- SCRAPE (Firecrawl) ---. Les lignes du bloc de signaux dates portent les leurs : "[N1]" (presse), "[E1]" (offre d'emploi), "[B1]" (annonce BODACC), "[M1]" (marche public), "[D1]" (marche attribue) — recopie-les tels quels : c'est par eux que le lien de la source est retrouve.
   N'ecris JAMAIS le token dans "source" : un lecteur qui lit "[PR3]" n'apprend rien. Si l'info ne vient d'aucun scrape, "source" vaut "Non source" et "sourceRef" reste vide — JAMAIS d'URL inventee.
7. NE CONFONDS PAS un signal avec l'offre qu'il semble suggerer (garde-fous anti-conflation) :
   - Un recrutement en CDI n'est PAS un besoin freelance/regie : le poste est comble EN INTERNE.
   - Une nouvelle usine n'appelle PAS immediatement une ESN : c'est un fait industriel, pas un besoin IT/conseil constate.
   - Un budget annonce au niveau GROUPE n'est PAS un budget disponible dans une filiale precise.
   - La nomination d'un dirigeant n'est PAS un besoin d'achat : ca change un interlocuteur, ca ne formule aucune demande.
   Dans ces quatre cas, "salesImplication" le dit explicitement plutot que de sauter a une opportunite non prouvee.
8. SELECTION (ce qui change la decision, pas le volume) :
   - Un programme GENERAL (« Climat », « Ambition 2026-2030 ») est du CONTEXTE : il ne devient une piste que s'il porte un chantier nomme, un lien avec une expertise du vendeur, un interlocuteur ou une verification a mener — dis lequel dans "salesImplication".
   - Un budget global n'est NI un budget de prestation NI une enveloppe accessible au vendeur.
   - Priorite : projet nomme, evolution d'organisation, nomination utile, recrutement correspondant, changement d'achats, investissement documente. Un communique general sans consequence exploitable n'est pas un besoin confirme.
   - Un signal doit viser l'entreprise ET l'entite reellement concernees : jamais un homonyme, le secteur ou la maison mere sans le dire ; une demande sur une filiale ne recupere pas les projets du groupe entier.
   - GARDE les signaux defavorables utiles (reorganisation, gel documente, difficulte sectorielle). L'absence de besoin connu ne prouve PAS un gel.
   - Aucun signal trouve : ecris « Aucun signal recent trouve dans les sources consultees » — jamais « aucun projet dans cette entreprise »."""


def build_user_prompt(
    target_company: str,
    brave_results: str,
    scraped_content: str,
    pappers_data: str,
    dated_signals: str = "",
    profile_data: dict | None = None,
    internal_knowledge: str = "",
) -> str:
    # Domain lens (Drive #9, Phase 2) — IT for an IT ESN (or empty profile), the
    # ESN's own domain for a non-IT ESN.
    d = resolve_domain_focus(profile_data)
    # #3586 — savoir métier interne (bloc dédié) ; vide ⇒ prompt byte-identique.
    internal_block = f"\n\n{internal_knowledge}" if (internal_knowledge or "").strip() else ""
    return f"""Detecte les SIGNAUX recents autour de "{target_company}".

===== SOURCES =====
{sources_block(brave_results, scraped_content, pappers_data, dated_signals=dated_signals)}{internal_block}

===== SCHEMA JSON ATTENDU =====
{{
  "budgetSignals": [
    "(MIN 2) Pour chaque signal budgetaire :",
    {{
      "signal": "investissement IT, appel d'offres, recrutement DSI, etc.",
      "amount": "montant si identifie, sinon 'Non precise'",
      "source": "nom lisible de la source (ex: 'Rapport annuel', 'Les Echos')",
      "sourceRef": "token de scrape entre crochets, ex: '[P1]' — vide si hors scrape",
      "timeframe": "quand le budget est prevu/engage",
      "relevance": "pourquoi pertinent pour l'ESN"
    }}
  ],

  "recentSignals": [
    "(MIN 4, viser 6) Pour chaque signal :",
    {{
      "id": "identifiant COURT et UNIQUE de ce signal dans cette reponse : 's1', 's2', 's3'... Il ne sert qu'a etre cite par les hypotheses ci-dessous — ne le reutilise jamais pour deux signaux, ne saute pas de numero.",
      "signal": "fait precis et date",
      "source": "nom lisible de la source (ex: 'Communique de presse', 'Site officiel')",
      "sourceRef": "token de scrape entre crochets, ex: '[P1]' — vide si hors scrape",
      "type": "nomination | budget | projet | incident | regulation | acquisition | partenariat | restructuration | recrutement | transformation | demenagement | investissement | organisation | levee_fonds | appel_offres | technologie | contact | recours_externe",
      "date": "date exacte ou approximative",
      "salesImplication": "opportunite ou risque pour l'ESN",
      "impact": "ampleur business du signal POUR L'ENTREPRISE CIBLE (groupe entier / une filiale / une seule direction) — vide si non evaluable, jamais deduit du seul type",
      "domainCode": "{signal_domain_prompt_line()}"
    }}
  ],

  "qualifiedHypotheses": [
    "(MIN 3, viser 4) Transforme les signaux ci-dessus en hypotheses ACTIONNABLES orientees besoin {d['label']} (regle de convergence : 1 signal isole -> a_verifier ; 3 signaux convergents -> confirmee). Ex deck SG : signaux recrutement data science + plateforme -> hypothese 'industrialise ses modeles ML (MLOps)'.",
    {{
      "hypothesis": "hypothese qualifiee, orientee besoin {d['label']} (ce qu'ils cherchent a faire)",
      "basedOnSignals": ["les signaux concrets qui la fondent (2-4)"],
      "basedOnSignalIds": ["les 'id' des signaux de 'recentSignals' ci-dessus qui la fondent, ex: ['s1','s4'] — les MEMES signaux que 'basedOnSignals', par leur identifiant. N'invente aucun id : si un signal fondateur ne figure pas dans 'recentSignals', ne le cite pas ici."],
      "counterEvidence": ["les contre-signaux cherches (projet interne, budget gele, recrutement permanent, fournisseur exclusif) — [] si aucun trouve, jamais omis"],
      "confidence": "confirmee | probable | a_verifier",
      "esnAngle": "offre/renfort ESN concret a proposer sur cette hypothese",
      "decision": "activer | surveiller | approfondir | ecarter",
      "firstAction": "si la confiance n'est pas 'confirmee', la premiere action TESTE l'hypothese sans la presenter comme un fait"
    }}
  ],

  "competitors": [
    "Une entree PAR ESN REELLE identifiee dans les sources — [] si aucune n'est identifiable, jamais une entree de remplissage. 'name' ne contient QUE le nom de la societe (jamais 'probable', jamais une phrase, jamais plusieurs noms separes par '/') :",
    {{
      "name": "nom de l'ESN",
      "scope": "perimetre d'intervention",
      "contractType": "regie | forfait | TMA | centre de services | consulting | inconnu",
      "strengths": "forces sur ce compte (2-3 points)",
      "weaknesses": "faiblesses exploitables",
      "differentiationStrategy": "comment se differencier face a ce concurrent"
    }}
  ],

  "esnSynergies": [
    {{
      "name": "nom de la synergie (reference croisee, partenariat, expertise sectorielle)",
      "certainty": "forte | moyenne | faible",
      "type": "type de synergie",
      "advice": "comment exploiter concretement"
    }}
  ],

  "peopleMentioned": [
    "(TOUTES les personnes trouvees) Pour chaque personne :",
    {{
      "name": "nom complet exact",
      "title": "titre/poste exact",
      "entity": "entite de rattachement",
      "source": "nom lisible de la source",
      "sourceRef": "token de scrape entre crochets, ex: '[O2]' — vide si hors scrape",
      "context": "pourquoi cette personne apparait, dans quel cadre"
    }}
  ],

  "linkedinSearchKeywords": {{
    "generic": ["mots-cles pour rechercher des contacts sur LinkedIn"],
    "byEntity": {{ "nom_entite": ["mots-cles specifiques"] }}
  }},

  "organigrammeLogic": "3-4 phrases : qui est le DSI groupe, quelles entites ont leur propre DSI/CDO, centralise vs federe, qui pilote les achats {d['label']}. Inclure les noms reels."
}}"""
