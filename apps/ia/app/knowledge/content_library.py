"""#3441/#3442/#3444/#3445 (lot C20, 30/09/2026) — la bibliothèque de contenu
approuvé : emails, scripts d'appel, réponses aux objections, pitchs.

**La donnée vit dans** ``packages/contracts/src/knowledge/content-library.ts``
(``CONTENT_LIBRARY_ENTRIES``), un seul endroit (GA-26). Le service IA n'a pas
le paquet contracts à l'exécution : il en porte ce miroir JSON, et
``content-library.parity.test.ts`` le LIT et le compare EN ENTIER à la donnée
TS — une retouche d'un seul côté fait rougir la CI.

Ce contenu est un CONTENU consultable et citable tel quel, jamais une règle de
méthode : ``method_rules.py`` (le miroir de ``method-delta.ts``) refuse
justement « des gabarits de message recopiés mot pour mot » comme comportement
UNIVERSEL du modèle — un exemple externe élevé au rang d'instruction. Ici,
c'est l'inverse : Louis a écrit ce texte lui-même et veut le retrouver
VERBATIM, à la demande, jamais paraphrasé. ``retrieve_content_library`` ne
DÉCIDE rien : elle filtre par catégorie et par mot-clé, exactement ce que
``search_content_library`` (``chat_tools.py``) relaie.
"""

from __future__ import annotations

import json
import re
from typing import Any

# ⚠️ Ne pas éditer à la main sans éditer aussi ``content-library.ts`` : la
# garde de parité compare les deux.
_CONTENT_LIBRARY_JSON = r"""[
  {
    "id": "email-approche-initiale",
    "kind": "email_template",
    "title": "Email d'approche initiale",
    "sourceIssue": "#3441",
    "sourceLabel": "Modèle 1 — email d'approche initiale",
    "subject": "Renfort {{Métier}} pour {{Projet ou challenge identifié}}",
    "body": "Bonjour {{Prénom}},\n\nJe travaille actuellement avec plusieurs profils {{métier}} immédiatement disponibles, avec {{X}} années d'expérience sur {{technologie ou projet}}.\n\nSuite à ma veille sur votre entreprise, j'ai identifié que vous pourriez avoir des besoins sur ce périmètre.\n\nPuis-je vous partager rapidement un ou deux profils qui pourraient correspondre à vos enjeux actuels ?\n\n{{Signature}}",
    "conditions": [
      "le projet ou challenge est vérifié",
      "les profils existent réellement",
      "leur disponibilité est fraîche",
      "les années d'expérience sont vraies",
      "8 à 10 lignes maximum pour le modèle structuré",
      "aucune fausse félicitation",
      "aucune actualité inventée",
      "aucune disponibilité inventée",
      "aucun profil fictif",
      "une seule demande",
      "objet précis",
      "pas de plaquette ou PDF dès le premier message sauf demande explicite",
      "si le contexte est insuffisant, le brouillon reste à compléter"
    ]
  },
  {
    "id": "email-suivi-apres-appel",
    "kind": "email_template",
    "title": "Email de suivi après appel",
    "sourceIssue": "#3441",
    "sourceLabel": "Modèle 2 — email de suivi après appel",
    "subject": "Suite à notre échange — Profils {{Métier}}",
    "body": "Bonjour {{Prénom}},\n\nMerci pour notre échange de {{jour}}.\n\nComme promis, je vous transmets les profils des consultants que nous avons évoqués pour votre projet {{nom}}.\n\nLeur disponibilité est confirmée pour {{date}} et ils sont particulièrement intéressés par votre contexte.\n\nQuelles seraient vos disponibilités pour organiser un entretien cette semaine ?\n\n{{Signature}}",
    "conditions": [
      "le projet ou challenge est vérifié",
      "les profils existent réellement",
      "leur disponibilité est fraîche",
      "les années d'expérience sont vraies",
      "aucune fausse félicitation",
      "aucune actualité inventée",
      "aucune disponibilité inventée",
      "aucun profil fictif",
      "une seule demande",
      "objet précis",
      "pas de plaquette ou PDF dès le premier message sauf demande explicite",
      "si le contexte est insuffisant, le brouillon reste à compléter"
    ]
  },
  {
    "id": "email-structure-personnalisee",
    "kind": "email_template",
    "title": "Email à structure personnalisée",
    "sourceIssue": "#3441",
    "sourceLabel": "Modèle 3 — structure personnalisée",
    "subject": "{{Prénom}}, une idée pour renforcer votre équipe {{domaine}}",
    "body": "Bonjour {{Prénom}},\n\n{{Élément récent et vérifié sur l'entreprise ou le contact}}.\n\nNous aidons {{type d'entreprise comparable}} à {{résultat}} grâce à {{approche}}.\n\n{{Preuve vérifiée ou profil réel}}.\n\nSeriez-vous disponible pour un échange de 15 minutes {{créneau précis}} afin de voir si cet angle peut être pertinent pour votre équipe ?\n\n{{Signature}}",
    "conditions": [
      "le projet ou challenge est vérifié",
      "les profils existent réellement",
      "leur disponibilité est fraîche",
      "les années d'expérience sont vraies",
      "8 à 10 lignes maximum pour le modèle structuré",
      "aucune fausse félicitation",
      "aucune actualité inventée",
      "aucune disponibilité inventée",
      "aucun profil fictif",
      "une seule demande",
      "objet précis",
      "pas de plaquette ou PDF dès le premier message sauf demande explicite",
      "si le contexte est insuffisant, le brouillon reste à compléter"
    ]
  },
  {
    "id": "script-appel-variante-a-contexte-partenaire",
    "kind": "call_script",
    "title": "Script d'appel — variante avec contexte partenaire",
    "sourceIssue": "#3442",
    "sourceLabel": "Variante A — avec contexte partenaire",
    "body": "1. OUVERTURE\n\nBonjour {{Nom}}, c'est {{Prénom}} de {{Société}}.\n\nOn intervient déjà dans votre écosystème via {{Partenaire}}.\n\nEst-ce que je peux vous prendre 30 secondes pour vous expliquer ma démarche ?\n\nNous sommes {{référencés}}. Ma démarche n'est pas commerciale.\n\n2. CONTEXTE ET POSITIONNEMENT\n\nJe connais bien les sujets {{Domaine}} chez {{Compte ou groupe}}.\n\nNotamment {{Thème 1}}, {{Thème 2}} et les sujets {{Métier}} avec les équipes IT ou Data.\n\nOn évolue sur des sujets similaires avec des profils vraiment experts.\n\n3. QUESTIONS D'ENGAGEMENT\n\nVous avez déjà fixé votre roadmap sur les prochains mois ?\n\nDes projets qui demandent du renfort ou des profils à double compétence ?\n\nJe viens sur site le {{Jour}}. Un café serait l'idéal.\n\nUn besoin ouvert ou récurrent sur lequel me challenger ?\n\nPertinent que je me présente à votre manager ? C'est qui d'ailleurs ?\n\n4. CLÔTURE\n\nJe vous propose un créneau de principe pour {{Période}}.\n\nSouhaitez-vous que je partage les missions en cours par mail ?",
    "conditions": [
      "le partenaire est réel",
      "son nom peut être cité",
      "le référencement est réel",
      "le périmètre est confirmé",
      "la relation n'interdit pas la prise de contact",
      "aucune mission similaire ne peut être citée sans preuve",
      "aucun référencement ne peut être suggéré",
      "aucun partenaire ne peut être inventé",
      "si l'utilisateur n'a aucune preuve, le script doit rester prudent",
      "chaque appel doit se terminer par une prochaine action concrète ou une sortie claire"
    ]
  },
  {
    "id": "script-appel-variante-b-pure-chasse",
    "kind": "call_script",
    "title": "Script d'appel — variante pure chasse, sans contexte",
    "sourceIssue": "#3442",
    "sourceLabel": "Variante B — pure chasse, sans contexte",
    "body": "1. PRÉSENTATION ET ACCROCHE\n\nJe suis {{Prénom}} de {{Société}}.\n\nJ'imagine que je suis loin d'être le seul à vous solliciter.\n\n30 secondes pour vous expliquer le but de mon appel ?\n\n2. ARGUMENT D'AUTORITÉ\n\nJe vois les mêmes enjeux dans votre secteur : délais, contraintes, accélération.\n\nOn a mené des missions similaires dans des environnements comparables {{Secteur}}.\n\nL'objectif est juste de comprendre votre cadre, pas de vous vendre quelque chose.\n\n3. RETIRER LA VENTE\n\nL'idée n'est pas de savoir si vous achetez des prestations.\n\nC'est de comprendre vos sujets et comment vous sécurisez un renfort quand ça devient prioritaire.\n\n4. CADRE ACHAT ET ENGAGEMENT\n\nSi on doit travailler ensemble, c'est direct ou via achats, panel ou partenaires ?\n\nSur {{Année}}, vous avez une visibilité sur votre roadmap ? Des partenaires installés ?\n\n5. PROCHAINE ÉTAPE\n\nDonnez-moi un sujet récurrent ou un besoin type.\n\nJe vous envoie deux ou trois profils ciblés pour montrer le niveau, sans engagement.\n\nSi c'est hors sujet, on s'arrête.\n\nSinon : qui est le bon point d'entrée ?",
    "conditions": [
      "aucune mission similaire ne peut être citée sans preuve",
      "aucun référencement ne peut être suggéré",
      "aucun partenaire ne peut être inventé",
      "si l'utilisateur n'a aucune preuve, le script doit rester prudent",
      "chaque appel doit se terminer par une prochaine action concrète ou une sortie claire"
    ]
  },
  {
    "id": "objection-pas-decideur",
    "kind": "objection_response",
    "title": "Je ne suis pas décideur.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Je peux me permettre de vous demander qui gère ces sujets ? Mon objectif est de comprendre votre contexte, pas de vous vendre des profils.",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-numero",
    "kind": "objection_response",
    "title": "Où avez-vous trouvé mon numéro ?",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Je veux être transparent sur la provenance. Le numéro vient de {{source réelle}}. Si vous le souhaitez, je vous explique comment demander son retrait. Avant de vous laisser, est-ce que vous m'accordez 30 secondes pour vous expliquer la raison de mon appel ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
      "la source citée doit être réelle"
    ]
  },
  {
    "id": "objection-referencement",
    "kind": "objection_response",
    "title": "Êtes-vous référencés ?",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "SI RÉFÉRENCEMENT PROUVÉ : Oui, nous sommes référencés sur {{périmètre}} depuis {{date ou contexte}}.\n\nSI NON RÉFÉRENCÉ : Non, pas sur ce périmètre à ma connaissance. Je préfère être clair. Mon objectif est justement de comprendre si une route directe, partenaire ou achat peut être pertinente.",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente",
      "la branche « référencement prouvé » n'est utilisée que si le référencement est réel"
    ]
  },
  {
    "id": "objection-envoyez-moi-un-mail",
    "kind": "objection_response",
    "title": "Envoyez-moi un mail.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Bien sûr. Pour éviter de vous envoyer une plaquette générique : quel est le sujet sur lequel vous avez le plus de difficulté à staffer ou à sécuriser ? Je vous envoie quelque chose qui répond à ce point précis.",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-aucun-besoin",
    "kind": "objection_response",
    "title": "On n'a aucun besoin.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Uniquement sur cette période, ou le recours externe est limité de façon générale sur votre périmètre ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-pas-de-consultants",
    "kind": "objection_response",
    "title": "On ne travaille pas avec des consultants.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "C'est une règle groupe ou une règle propre à votre périmètre ? Quelles sont les raisons principales ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-deja-des-partenaires",
    "kind": "objection_response",
    "title": "On a déjà des partenaires.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Très bien. Qu'est-ce qui fonctionne le mieux avec eux aujourd'hui, et qu'est-ce qui pourrait encore être amélioré ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-regles-achats",
    "kind": "objection_response",
    "title": "Il y a des règles achats.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Mon objectif n'est pas d'outrepasser le cadre. Est-ce que des retours d'expérience ou un cas comparable seraient plus utiles qu'une présentation commerciale ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-pas-le-temps",
    "kind": "objection_response",
    "title": "Je n'ai pas le temps.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Je comprends. Deux minutes seulement : quel est aujourd'hui le sujet qui vous fait perdre le plus de temps sur votre périmètre ? Si je suis hors sujet, on s'arrête là.",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-gestion-interne",
    "kind": "objection_response",
    "title": "Nous gérons en interne.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "C'est une bonne chose. Vos clients ou équipes utilisent-ils parfois des renforts sur les compétences rares ou les pics d'activité, ou jamais ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-question-budget",
    "kind": "objection_response",
    "title": "C'est une question de budget.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Qu'est-ce qui vous fait penser que notre approche serait hors budget : le TJM, la durée, ou le modèle de collaboration ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-autres-priorites",
    "kind": "objection_response",
    "title": "Nous avons d'autres priorités.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Est-ce que le sujet que je vous présente pourrait accélérer l'une de ces priorités, ou il est complètement déconnecté de vos enjeux actuels ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-rappelez-plus-tard",
    "kind": "objection_response",
    "title": "Rappelez-moi plus tard.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Avec plaisir. À quelle date précise le sujet aura plus de sens ? Je préfère noter une vraie échéance plutôt que vous relancer au hasard.",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-mauvaises-experiences",
    "kind": "objection_response",
    "title": "On a eu de mauvaises expériences.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Qu'est-ce qui vous a le plus déçu : la qualité du profil, le suivi, la transparence ou le cadre commercial ?",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "objection-tjm-trop-eleve",
    "kind": "objection_response",
    "title": "Votre TJM est trop élevé.",
    "sourceIssue": "#3444",
    "sourceLabel": "Objection approuvée",
    "body": "Quel est votre budget cible et quel niveau d'expertise attendez-vous ? Je préfère vérifier si l'équation est réaliste plutôt que vous promettre un ajustement artificiel.",
    "conditions": [
      "la réponse n'est utilisée que si elle correspond réellement au contexte",
      "règle d'or : valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"
    ]
  },
  {
    "id": "pitch-structure-canonique",
    "kind": "pitch",
    "title": "Structure canonique du pitch",
    "sourceIssue": "#3445",
    "sourceLabel": "Structure canonique et détaillée",
    "body": "STRUCTURE CANONIQUE\n\nOn aide {{type d'équipe}} à {{résultat}} via {{approche}}.\n\nPreuve : {{référence ou fait réel}}.\n\nProchaine étape : {{action simple}}.\n\nSTRUCTURE DÉTAILLÉE\n\n1. Problème.\n2. Solution.\n3. Bénéfice.\n4. Preuve.\n5. Prochaine étape.",
    "conditions": [
      "aucun pitch ne doit prétendre être spécialiste de tout",
      "une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal",
      "aucune preuve inventée",
      "aucun résultat générique",
      "aucune référence fictive",
      "le pitch doit être résumé en moins de 20 secondes",
      "une version écrite et une version orale peuvent coexister",
      "la version orale reste naturelle, pas récitée mot pour mot"
    ]
  },
  {
    "id": "pitch-eti-industrielles",
    "kind": "pitch",
    "title": "ETI industrielles",
    "sourceIssue": "#3445",
    "sourceLabel": "Exemple 1 — ETI industrielles",
    "body": "Nous aidons les ETI industrielles d'Auvergne-Rhône-Alpes à renforcer leurs équipes Data et Cloud avec des consultants immédiatement opérationnels.\n\nNotre approche consiste à qualifier d'abord le périmètre, l'environnement technique et le résultat attendu, puis à présenter une shortlist réduite plutôt qu'un volume de CV.\n\nNous avons déjà accompagné {{référence vérifiée}} sur {{contexte réel}}.\n\nSi vous avez un sujet de renfort prévu dans les prochains mois, quinze minutes suffisent pour vérifier si notre vivier peut correspondre.",
    "conditions": [
      "aucun pitch ne doit prétendre être spécialiste de tout",
      "une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal",
      "aucune preuve inventée",
      "aucun résultat générique",
      "aucune référence fictive",
      "le pitch doit être résumé en moins de 20 secondes",
      "une version écrite et une version orale peuvent coexister",
      "la version orale reste naturelle, pas récitée mot pour mot"
    ]
  },
  {
    "id": "pitch-direction-data-grand-compte",
    "kind": "pitch",
    "title": "Direction Data grand compte",
    "sourceIssue": "#3445",
    "sourceLabel": "Exemple 2 — direction Data grand compte",
    "body": "Nous aidons les directions Data à sécuriser leurs projets quand les équipes internes arrivent à saturation ou qu'une compétence rare bloque la roadmap.\n\nNous partons du projet, du périmètre et des contraintes internes avant de sélectionner les profils.\n\nLa preuve que nous utilisons ici est {{référence ou mission vérifiée}}.\n\nLa prochaine étape n'est pas une présentation complète : c'est de qualifier ensemble un besoin type ou une compétence difficile à mobiliser.",
    "conditions": [
      "aucun pitch ne doit prétendre être spécialiste de tout",
      "une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal",
      "aucune preuve inventée",
      "aucun résultat générique",
      "aucune référence fictive",
      "le pitch doit être résumé en moins de 20 secondes",
      "une version écrite et une version orale peuvent coexister",
      "la version orale reste naturelle, pas récitée mot pour mot"
    ]
  },
  {
    "id": "pitch-pme-scale-up",
    "kind": "pitch",
    "title": "PME / scale-up",
    "sourceIssue": "#3445",
    "sourceLabel": "Exemple 3 — PME / scale-up",
    "body": "Nous aidons les équipes produit et techniques de PME en croissance à renforcer rapidement un projet sans alourdir leur processus de recrutement.\n\nNous mobilisons des consultants déjà qualifiés sur le contexte, le mode de travail et le niveau d'autonomie attendu.\n\nSur {{référence vérifiée}}, cette approche a permis {{résultat réel}}.\n\nJe vous propose simplement de prendre un besoin récent et de voir si nous serions capables d'y répondre proprement.",
    "conditions": [
      "aucun pitch ne doit prétendre être spécialiste de tout",
      "une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal",
      "aucune preuve inventée",
      "aucun résultat générique",
      "aucune référence fictive",
      "le pitch doit être résumé en moins de 20 secondes",
      "une version écrite et une version orale peuvent coexister",
      "la version orale reste naturelle, pas récitée mot pour mot"
    ]
  },
  {
    "id": "pitch-rang-2",
    "kind": "pitch",
    "title": "Rang 2 (ESN déjà référencée)",
    "sourceIssue": "#3445",
    "sourceLabel": "Exemple 4 — rang 2",
    "body": "Nous aidons des ESN déjà référencées à couvrir les besoins qu'elles ne peuvent pas staffer seules, sans perturber leur relation avec le client final.\n\nLe cadre est défini dès le départ : propriété de la relation, marge, non-contournement et règles de renouvellement.\n\nNous pouvons commencer par un besoin précis et vérifier notre capacité à fournir un profil réellement complémentaire.",
    "conditions": [
      "aucun pitch ne doit prétendre être spécialiste de tout",
      "une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal",
      "aucune preuve inventée",
      "aucun résultat générique",
      "aucune référence fictive",
      "le pitch doit être résumé en moins de 20 secondes",
      "une version écrite et une version orale peuvent coexister",
      "la version orale reste naturelle, pas récitée mot pour mot"
    ]
  },
  {
    "id": "pitch-talent-disponible",
    "kind": "pitch",
    "title": "Talent disponible",
    "sourceIssue": "#3445",
    "sourceLabel": "Exemple 5 — talent disponible",
    "body": "Nous accompagnons actuellement un consultant {{expertise}}, basé à {{ville}}, disponible à partir de {{date}}.\n\nSon intérêt ne réside pas uniquement dans sa stack : il a déjà travaillé dans {{contexte réel}} et sait {{preuve réelle}}.\n\nJe ne vous propose pas un CV générique. Je cherche à vérifier si ce type d'expérience répond à un problème actuel de votre équipe.",
    "conditions": [
      "aucun pitch ne doit prétendre être spécialiste de tout",
      "une verticale, deux ou trois expertises et un territoire maximum dans le pitch principal",
      "aucune preuve inventée",
      "aucun résultat générique",
      "aucune référence fictive",
      "le pitch doit être résumé en moins de 20 secondes",
      "une version écrite et une version orale peuvent coexister",
      "la version orale reste naturelle, pas récitée mot pour mot"
    ]
  }
]"""

CONTENT_LIBRARY_ENTRIES: list[dict[str, Any]] = json.loads(_CONTENT_LIBRARY_JSON)

CONTENT_LIBRARY_KINDS = ("email_template", "call_script", "objection_response", "pitch")


def retrieve_content_library(kind: str | None = None, query: str | None = None) -> list[dict[str, Any]]:
    """La recherche dans la bibliothèque — même discipline que
    ``method_knowledge.retrieve_method_chunks`` : jamais tout renvoyer sans
    qu'aucun filtre n'ait été demandé n'est un problème en soi (`search_proofs`
    fait déjà « bibliothèque entière si rien n'est précisé »), mais un filtre
    donné doit être appliqué, jamais deviné au-delà de ce qui est fourni.

    #3442 (recette prod, 30/09/2026) — la requête est tokenisée : chaque MOT
    doit être présent (ordre et ponctuation libres), jamais la phrase entière
    comme sous-chaîne littérale. Une requête naturelle du modèle (« pure
    chasse sans contexte ») ne contient quasiment jamais la ponctuation exacte
    du titre source (« pure chasse, sans contexte ») — l'ancienne recherche la
    ratait systématiquement. Chaque mot reste filtré, rien n'est deviné
    au-delà des mots fournis.
    """
    entries = CONTENT_LIBRARY_ENTRIES
    if kind:
        entries = [entry for entry in entries if entry["kind"] == kind]
    cleaned_query = (query or "").strip().lower()
    if not cleaned_query:
        return entries
    words = [word for word in re.findall(r"\w+", cleaned_query, flags=re.UNICODE) if word]
    if not words:
        return entries
    # #3444 (recette 02/10) — une PHRASE de prospect (« Je n'ai pas de budget »)
    # ne se retrouve pas par « chaque mot est dans le texte » : les mots vides
    # (je, n, ai, de, sur…) ne portent pas le sens et font échouer ou dérailler
    # la recherche. Les mots porteurs de sens, eux, se lisent par leur radical
    # (règle/règles), et un texte qui ne les porte pas tous reste proposé s'il
    # est le plus proche — jamais une liste vide pour une objection connue.
    words = [_SYNONYMS.get(word, word) for word in words]
    stems = [_stem(word) for word in words if word not in _STOPWORDS and len(word) > 1] or [_stem(w) for w in words]
    scored = [(entry, _score(entry, stems)) for entry in entries]
    complete = [(entry, score) for entry, score in scored if score[0] == len(stems) or _matches_all_words(entry, words)]
    if complete:
        complete.sort(key=lambda pair: pair[1], reverse=True)
        return [entry for entry, _ in complete]
    # Au moins la moitié des mots porteurs de sens, dont un dans le titre : en
    # dessous, « le plus proche » deviendrait une devinette (« zzzz… » → rien).
    partial = [(entry, score) for entry, score in scored if score[0] * 2 >= len(stems) and score[1] > 0]
    partial.sort(key=lambda pair: pair[1], reverse=True)
    return [entry for entry, _ in partial[:_CLOSEST_MAX]]


# Les mots qui ne portent pas le sens d'une objection ou d'un script.
_STOPWORDS = frozenset(
    ["je", "j", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "me", "moi", "te", "se", "ne", "n", "pas", "plus", "ai", "as", "a", "avons", "avez", "ont", "suis", "es", "est", "sommes", "êtes", "sont", "le", "la", "les", "l", "un", "une", "des", "du", "de", "d", "et", "ou", "en", "au", "aux", "à", "ce", "ces", "cet", "cette", "sur", "sous", "chez", "pour", "par", "avec", "sans", "dans", "que", "qu", "qui", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "notre", "nos", "votre", "vos", "leur", "leurs", "y", "m", "t", "s", "c", "si", "ça", "tout", "tous", "toute", "toutes", "très", "aussi", "mais", "donc", "plutôt", "déjà", "encore", "pour", "ici"]
)
_CLOSEST_MAX = 3
# Les mots qu'un prospect emploie pour ce que la bibliothèque appelle autrement.
_SYNONYMS = {
    "prestataire": "partenaire",
    "prestataires": "partenaires",
    "fournisseur": "partenaire",
    "fournisseurs": "partenaires",
}


def _stem(word: str) -> str:
    stem = word.rstrip("sxe") if len(word) > 4 else word
    return stem if len(stem) >= 3 else word


def _score(entry: dict[str, Any], stems: list[str]) -> tuple[int, int, int]:
    """(radicaux trouvés, dont dans le titre, 0) — le titre pèse plus que le corps."""
    title_tokens = re.findall(r"\w+", entry["title"].lower(), flags=re.UNICODE)
    body_tokens = re.findall(r"\w+", entry["body"].lower(), flags=re.UNICODE)
    in_title = sum(1 for stem in stems if any(token.startswith(stem) for token in title_tokens))
    in_body = sum(1 for stem in stems if any(token.startswith(stem) for token in body_tokens))
    found = sum(
        1
        for stem in stems
        if any(token.startswith(stem) for token in title_tokens) or any(token.startswith(stem) for token in body_tokens)
    )
    return (found, in_title, in_body)


def _matches_all_words(entry: dict[str, Any], words: list[str]) -> bool:
    haystack = f"{entry['title']} {entry['body']}".lower()
    return all(word in haystack for word in words)
