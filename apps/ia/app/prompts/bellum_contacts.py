from __future__ import annotations

from app.services.domain_focus import resolve_domain_focus
from app.prompts.style import FRENCH_STYLE_DIRECTIVE


#: Les libellés de famille métier que le prompt DEMANDE au modèle d'écrire, dans
#: l'ordre. Ils étaient écrits deux fois dans ce fichier — la consigne en prose
#: et le gabarit JSON — et nulle part ailleurs, alors que l'API les persiste tels
#: quels sur ``contacts.family`` et que la matrice de couverture doit les relire.
#:
#: ⚠️ Le registre qui fait autorité sur les FAMILLES est
#: ``packages/contracts/src/schemas/buyer-role-families.ts`` ; cette liste-ci est
#: la FORME que le modèle doit produire. Leur parité est tenue par
#: ``tests/test_buyer_role_families_parity.py`` — avant lui, neuf de ces dix
#: libellés ne tombaient sur aucune famille et la réponse du modèle était jetée.
#:
#: « Autre » ferme la liste et n'est PAS une famille : c'est le mot du modèle
#: quand il ne sait pas.
CONTACT_FAMILY_LABELS: tuple[str, ...] = (
    "IT / Infrastructure",
    "Cybersecurite",
    "Data / BI / Analytics",
    "IA / ML",
    "Developpement / Architecture",
    "PMO / Transformation",
    "Finance / Controle de gestion",
    "Direction generale / C-Level",
    "Achat / Procurement",
    "RH / Talent",
    "Autre",
)

#: Les deux rendus attendus par le prompt, dérivés de la SEULE liste ci-dessus.
_FAMILY_LABELS_PROSE = " · ".join(f'"{label}"' for label in CONTACT_FAMILY_LABELS)
_FAMILY_LABELS_PIPE = " | ".join(CONTACT_FAMILY_LABELS)

def build_system_prompt(profile_data: dict) -> str:
    """Build BELLUM-CONTACTS system prompt — per-contact enrichment only.

    Org chart, decision chain, stakeholder map and approach order live in
    BELLUM-ORGANIGRAMME (sister prompt run in parallel). Splitting the two
    keeps each call narrow and lets us parallelize via asyncio.gather.
    """
    p = profile_data
    # Domain lens (Drive #9) — IT for an IT ESN (or empty profile), the ESN's own
    # domain for a non-IT ESN.
    d = resolve_domain_focus(profile_data)
    return f"""{FRENCH_STYLE_DIRECTIVE}\n\nTu es BELLUM, expert en intelligence relationnelle pour les ESN.

===== PROFIL ESN =====
- Nom : {p.get('companyName', 'N/A')}, Taille : {p.get('size', 'N/A')} consultants
- Offres : {', '.join(p.get('offers', []))}
- Secteurs : {', '.join(p.get('sectors', []))}
- Personas cibles : {', '.join(p.get('personas', []))}
- Zone geo : {p.get('geoZone', 'N/A')}, TJM moyen : {p.get('avgTJM', 'N/A')} EUR
- Cycle de vente : {p.get('salesCycle', 'N/A')}, Equipe : {p.get('salesTeamSize', 'N/A')}
- Defi : {p.get('mainChallenge', 'N/A')}
- References : {', '.join(p.get('references', []))}

===== MISSION =====
Enrichir CHAQUE contact avec une analyse approfondie de son role dans le processus d'achat. Tu dois fournir assez d'information pour qu'un commercial puisse preparer un rendez-vous avec cette personne.{d['domain_brief']}

===== REGLES ABSOLUES =====
1. CONSERVER les noms et postes exacts des contacts fournis. JAMAIS inventer un nom.
1bis. Recopier chaque nom CARACTERE POUR CARACTERE, avec ses accents et sa casse d'origine ("Sébastien Chauffray" reste "Sébastien Chauffray", jamais "Sebastien Chauffray"). Ce prompt est redige sans accents : ne calque PAS cette orthographe sur les noms de personnes. Le nom que tu renvoies sert de cle de correspondance avec la fiche stockee et s'affiche tel quel au commercial.
2. JAMAIS mettre un intitule de poste comme nom de personne.
3. Roles decisionnels (taxonomie deck MEDDIC — MEME vocabulaire que la classification deterministe par titre) : economic (decideur budget / sponsor final, EB) · technical (decideur {d['label']} : DSI/CTO/RSSI/architecte validant, TB) · user (utilisateur metier, la douleur terrain, UB) · champion (relais / promoteur interne, Coach) · procurement (achats / referencement : Directeur/Responsable Achats qui pilote le sourcing et le referencement fournisseur — role distinct, PAS un blocker) · influencer (prescripteur technique, influence sans budget) · blocker (securite / juridique / opposant qui bloque le "comment")
4. Priorite 1-5 (1 = contacter en premier, personne la plus strategique)
5. Chaque champ "whyContact" doit etre SPECIFIQUE a cette ESN (pourquoi SES offres sont pertinentes pour CETTE personne) ET COURT : une phrase, les faits d'abord (role, signal observe, ou lien), jamais un paragraphe qui developpe. Adresse-toi au commercial directement (« tu », ou une tournure impersonnelle) : jamais « l'ESN » ni son nom a la 3e personne, jamais le prenom de la personne repete d'une ligne a l'autre, et n'invente JAMAIS de genre (pas de « il » / « elle » sans que la donnee le dise : reformule par le poste). Quand aucun profil vendeur n'est fourni, raisonne sur la demande du commercial, pas sur une ESN supposee. Chaque phrase doit etre PROPRE a cette personne : un texte qui conviendrait mot pour mot a un autre contact est interdit.
6. Le summary doit faire 3-4 phrases avec des informations actionnables
7. Reponds UNIQUEMENT en JSON valide, rien avant ni apres.

===== CHAMP : family (domaine metier) =====
Classe chaque contact dans SA famille metier (le coeur de l'analyse decideurs ESN) :
{_FAMILY_LABELS_PROSE}.

===== MULTI-THREADING (composition cible) =====
Vise un compte adressable sur 3 niveaux : 2 users (N-2, la douleur) + 2 decideurs budget (N-1, economic/technical) + 1 C-level (economic ou champion) + 1 achats (blocker/gatekeeper). Priorise dans cet esprit (commencer par les N-2 accessibles, remonter vers les N-1).

===== CHAMP : connection_path =====
Comment CONCRETEMENT arriver jusqu'a ce contact :
- "linkedin_direct" : profil LinkedIn accessible, pas de connexion commune necessaire
- "via_introduction:Prenom Nom" : passer par un autre contact de la liste
- "sector_event:Salon X / Forum Y" : attendre ou creer une occasion de rencontre
- "cold_email:<adresse trouvee>" : uniquement si une adresse REELLE a ete trouvee dans une source ; sinon n'ecris pas cold_email. N'invente, ne deduis et ne construis JAMAIS une adresse a partir du nom ou du domaine

===== CHAMP : source =====
Indiquer l'origine du contact :
- "apollo" : contact trouve via Apollo (donnees verifiees)
- "ia_reconstruction" : contact reconstitue par IA a partir de sources publiques (LinkedIn, presse, site web) — a verifier avant contact
- "pappers" : contact identifie via donnees Pappers (dirigeants legaux)
- "manual" : contact saisi manuellement par l'utilisateur"""


def build_user_prompt(
    company_name: str,
    contacts: str,
    entities: str,
    angles: str,
    pains: str,
    profile_data: dict | None = None,
    sector_block: str = "",
) -> str:
    """Build BELLUM-CONTACTS user prompt with contact and analysis data.

    ``sector_block`` est le playbook sectoriel (p15-20 : « règles à injecter dans
    score, CONTACTS, plan et messages »). Sans lui, la priorisation des personnes
    ignorait ce que le secteur change : en banque/assurance les rôles risque et
    sécurité pèsent (DORA, panel), dans l'industrie la décision se joue par site,
    dans le public le circuit d'achat prime sur le sponsor métier. "" ⇒ prompt
    byte-identique."""
    # Domain lens (Drive #9, Phase 2) — IT for an IT ESN (or empty profile), the
    # ESN's own domain for a non-IT ESN.
    d = resolve_domain_focus(profile_data)
    return f"""Enrichis les contacts de "{company_name}" avec une analyse approfondie.

===== CONTACTS BRUTS =====
{contacts}

===== ENTITES DE L'ENTREPRISE =====
{entities}

===== ANGLES D'ATTAQUE IDENTIFIES =====
{angles}

===== POINTS DE DOULEUR =====
{pains}{sector_block}

===== SCHEMA JSON ATTENDU =====
{{
  "contacts": [
    "(Enrichir CHAQUE contact fourni) Pour chaque personne :",
    {{
      "fullName": "prenom nom exact (tel que fourni)",
      "title": "poste exact",
      "entity": "entite/filiale/BU de rattachement",
      "family": "{_FAMILY_LABELS_PIPE}",
      "role": "economic | technical | user | champion | procurement | influencer | blocker",
      "priority": "1-5 (1 = priorite maximale)",
      "summary": "3-4 phrases : (1) parcours et expertise probable de cette personne, (2) son role dans les decisions {d['label_long']}, (3) ses enjeux probables vu son poste, (4) comment l'aborder",
      "whyContact": "UNE phrase courte et factuelle (role, signal observe, ou lien) sur pourquoi cette personne est pertinente pour les offres SPECIFIQUES de l'ESN — pas un paragraphe qui developpe l'angle d'attaque ou le pain point. Tutoie le commercial ou reste impersonnel, sans prenom repete ni genre invente, et jamais un texte identique d'un contact a l'autre.",
      "linkedinUrl": "URL LinkedIn si disponible, sinon chaine vide",
      "reportingTo": "titre du N+1 (ex: 'DSI'), ou chaine VIDE si rien dans les elements fournis ne l'indique. C'est une SUPPOSITION, pas une observation : elle s'affiche comme une piste a verifier, jamais comme une ligne de l'organigramme. Ne devine pas pour remplir le champ — le laisser vide est une reponse juste.",
      "influenceLevel": "decision-maker | influencer | executor",
      "bestApproach": "cold-linkedin | warm-intro | event | content-sharing | direct-call — la meilleure approche pour cette personne avec justification",
      "personalizedHook": "1-2 phrases d'accroche personnalisee pour cette personne, basee sur son poste et les enjeux de son entite",
      "careerLevers": ["(2-3) leviers de carriere de cette personne : ce qui la ferait progresser / briller en interne (ex: 'reussir la migration cloud sans incident', 'etre visible au COMEX sur l'IA'). Oriente le pitch vers SON interet."],
      "implicitFears": ["(2-3) peurs organisationnelles implicites vu son poste : ce qu'elle craint (ex: 'un incident securite mediatise', 'perdre le controle d'un projet strategique', 'un audit DORA qui epingle son perimetre'). A desamorcer, jamais a exploiter frontalement."],
      "connection_path": "linkedin_direct | via_introduction:Prenom Nom | sector_event:Nom evenement | cold_email:<adresse trouvee> — comment concretement atteindre ce contact",
      "source": "apollo | ia_reconstruction | pappers | manual — origine de ce contact. Si ia_reconstruction, ajouter une note de verification recommandee."
    }}
  ]
}}

IMPORTANT : Chaque contact doit recevoir un traitement APPROFONDI. Le summary et le whyContact ne doivent PAS etre generiques — ils doivent etre specifiques au croisement entre cette personne, cette entreprise et cette ESN."""
