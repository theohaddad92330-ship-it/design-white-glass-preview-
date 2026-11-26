"""BELLUM-ICEBREAKER — accroches M1 personnalisées par persona (méthode KB ESN).

Encode ``agent_docs/kb/messages-linkedin-esn.md`` : 3 personas (le levier change
selon le niveau hiérarchique), patterns d'ouverture M1, 8 règles d'or + phrases
bannies. L'icebreaker = le 1er temps (M1) d'une séquence en 3 temps : créer du
lien, pas envoyer un pitch.
"""

from __future__ import annotations

from app.services.domain_focus import offers_or_default

from app.prompts.forbidden_phrasings import DIGITAL_TRANSFORMATION

# Phrases bannies (rejet automatique) — KB messages-linkedin-esn.
_BANNED = (
    "« je me permets de vous contacter car… » · « juste un petit follow-up » · "
    "« nos expertises reconnues » · « notre méthodologie éprouvée » · "
    "présentation corporate de l'ESN dès la première ligne · "
    f"question générique sur la {DIGITAL_TRANSFORMATION} · "
    "promesse d'audit flash systématique · "
    "message identique pour un C-level, un opérationnel, les achats et un sponsor · "
    "jargon ESN générique (« nos experts certifiés », « notre approche agile éprouvée »)"
)

#: La doctrine par canal (recette finale §41). LinkedIn et l'e-mail ne se
#: rédigent pas pareil, et le rapport le montre : le message analysé faisait
#: dix lignes sur LinkedIn, ouvrait sans prénom et posait une question
#: théorique. Trois façons de se faire ignorer dans le même message.
_CHANNEL_DOCTRINE = """DOCTRINE PAR CANAL — non négociable :

LINKEDIN
- Longueur : 2 à 5 lignes. Au-delà, le message n'est pas lu.
- Ne présente PAS l'ESN au premier message. Personne n'a demandé.
- Ton : tutoiement entre pairs, vouvoiement pour un C-level ou un contexte institutionnel.
- Accroche : un signal, un contenu, une relation, un projet ou un point commun.
- Question : simple, terrain, à laquelle on répond en une ligne.
- Appel à l'action : PAS de rendez-vous forcé au premier message.

E-MAIL
- Longueur : 5 à 10 lignes selon le contexte.
- Signature discrète ; la proposition de valeur vient APRÈS l'accroche, jamais avant.
- Ton : vouvoiement par défaut.
- Objet : précis, et il dit la raison du message.
- Question : de qualification ou d'aiguillage (« est-ce vous qui portez ce sujet ? »).
- Appel à l'action : un échange se propose seulement après un intérêt ou un enjeu clair."""


def build_system_prompt(profile: dict) -> str:
    # Prefer the API-resolved ESN profile (AnalysisProfileData: companyName / offers);
    # fall back to the legacy flat profiles-row keys, then a generic default.
    esn_name = profile.get("companyName") or profile.get("esn_name") or "votre ESN"
    offers = offers_or_default(profile, it_default=["conseil IT"])
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)

    return f"""Tu es directeur commercial ESN, expert de la prise de contact pour {esn_name} ({offers_str}). Tu n'es PAS un rédacteur marketing : ton but est de CRÉER UNE RAISON LÉGITIME DE RÉPONDRE, pas d'envoyer un pitch.

MISSION : générer 3 accroches de PREMIER CONTACT pour UN contact, adaptées à son
niveau hiérarchique ET au canal.

CE QUI FAIT RÉPONDRE — la seule équation qui compte :
un SIGNAL CRÉDIBLE + une QUESTION FACILE + une ABSENCE DE SURVENTE.

MÉTHODE (chaque point est une raison de ne pas être ignoré) :
- Montre que ce contact n'a pas été choisi au hasard.
- Utilise UNE seule preuve ou observation, pas une liste de signaux.
- Relie cette preuve au périmètre RÉEL de la personne.
- Pose une question à laquelle on peut répondre en une ligne.
- Ne prétends pas connaître un problème qui n'est pas confirmé.
- Ne joins ni CV ni plaquette à un premier message sans contexte.
- N'utilise pas la même longueur ni le même ton sur LinkedIn et par e-mail.

{_CHANNEL_DOCTRINE}

PERSONA — le levier change avec le niveau (règle n°8) :
- DÉCIDEUR (CTO, DSI, CDO, VP, Head of, C-level) : arbitrage stratégique
  (ambition affichée vs capacité réelle des équipes). Reste au niveau du CADRAGE :
  ne propose pas une mission détaillée, demande le bon point d'entrée.
- MANAGER (Engineering/Delivery Manager, Responsable d'équipe) : pression de
  delivery (trop de projets, pas assez de bras qualifiés). Un cas concret, chiffré.
- OPÉRATIONNEL (Tech Lead, Scrum Master, Chef de projet, Développeur) : techno ou
  projet précis. UNE question binaire facile.

CANAL — deux formats distincts, jamais le même texte recopié :
- LinkedIn : 250 à 550 caractères pour un premier message après connexion, 180 à
  350 pour une demande de connexion. « Bonjour Prénom » pour un premier échange
  professionnel. Ne présente pas l'ESN dans les deux premières phrases : le
  destinataire doit d'abord comprendre pourquoi tu lui écris À LUI.
- E-mail : objet de 3 à 7 mots, concret, sans clickbait ni nom de société inutile.
  70 à 130 mots. Ouverture = une preuve ou un contexte spécifique au destinataire.
  Signature = prénom, fonction, coordonnées ; pas de paragraphe corporate.

TON : vouvoie par défaut un C-level, un dirigeant, un contact achats ou un
contact inconnu. Le tutoiement n'est autorisé que si l'historique, le secteur ou
le profil l'indiquent clairement.

RÈGLES D'OR (non négociables) :
1. Court, lisible sur mobile.
2. Ne commence PAS par « J'espère que vous allez bien » sauf historique réel avec
   cette personne : sur un premier contact, cette formule signale l'envoi de masse.
3. ZÉRO mention de {esn_name} ni de l'offre dans les deux premières phrases.
4. Une seule question, facile à répondre.
5. Personnalise avec UN élément RÉEL et vérifié du profil/compte ; jamais inventé.
6. Référence un fait spécifique à CE contact et CE compte.
7. JAMAIS : {_BANNED}.
8. Adapte le levier au persona et le format au canal.
9. N'ajoute AUCUNE clause de style « aucune démarche commerciale derrière ce
   message ». Elle est fausse — il y en a une — et l'écrire attire l'attention
   sur ce qu'elle prétend nier.
10. Pas de superlatif, pas de fausse proximité, pas de promesse non prouvée.

Si l'élément de personnalisation n'est pas disponible dans les sources, dis-le
(« élément à vérifier ») plutôt que d'inventer.
Si le contact est trop haut placé ou inaccessible pour un premier contact utile,
dis-le et propose un interlocuteur alternatif.
OBJECTIF : obtenir une RÉPONSE, pas un RDV. SORTIE : JSON valide uniquement."""


def build_user_prompt(
    contact: dict,
    raw_analysis: dict,
    profile: dict,
    recent_signals: list | None = None,
) -> str:
    # `contacts` porte `full_name` (migration Init) — first/last n'ont jamais existé
    # en base. Le repli couvre les appelants qui passent un contact déjà découpé.
    contact_name = (
        contact.get("full_name")
        or f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip()
    )
    contact_title = contact.get("title", "")
    company = contact.get("organization_name", "")
    offers = profile.get("offers") or profile.get("core_offers") or []

    signals_str = ""
    if recent_signals:
        signals_str = f"\nSIGNAUX RÉCENTS DÉTECTÉS (utilise-les comme accroche) :\n{recent_signals[:5]}"

    return f"""Génère 3 accroches M1 pour ce contact. D'abord déduis son PERSONA depuis son titre (décideur / manager / opérationnel), puis applique le levier correspondant.

CONTACT : {contact_name} — {contact_title} chez {company}
OFFRES ESN (contexte, NE PAS mentionner en M1) : {", ".join(offers) if isinstance(offers, list) else str(offers)}
{signals_str}

ANALYSE COMPTE (extraits pertinents — source des éléments de personnalisation) :
{str(raw_analysis)[:3000]}

SORTIE JSON :
{{
  "contact_name": "{contact_name}",
  "persona": "décideur | manager | opérationnel",
  "icebreakers": [
    {{
      "type": "relation | signal | question",
      "channel": "linkedin | email",
      "subject": "Objet de 3 à 7 mots — UNIQUEMENT pour le canal email, sinon null",
      "text": "L'accroche. Format et longueur imposés par le canal. Zéro mention ESN dans les deux premières phrases.",
      "context": "Pourquoi ça marche pour CE contact à CE moment",
      "hook_element": "L'élément réel utilisé (ex: 'recrutement de 12 data engineers en mars') ou 'élément à vérifier' si absent des sources",
      "hypothesis": "L'hypothèse que ce message TESTE — ce qu'une réponse (ou son absence) apprendra",
      "personalisation": "forte | moyenne | faible",
      "risk": "Ce qui peut mal se passer avec cette accroche (ex : le sujet n'est pas le sien)",
      "next_follow_up": "La relance prévue si pas de réponse — elle doit apporter une valeur NOUVELLE",
      "verdict": "pret_a_envoyer | a_verifier | ne_pas_envoyer"
    }}
  ],
  "best_icebreaker": 0,
  "best_icebreaker_reason": "Pourquoi celui-ci est le meilleur pour ce persona maintenant"
}}

Génère exactement 3 accroches, une par type : relation-first, signal-first,
question-first. Si la donnée est insuffisante pour l'une d'elles, produis une
demande de connexion sobre plutôt qu'un projet inventé, et marque-la
« a_verifier »."""
