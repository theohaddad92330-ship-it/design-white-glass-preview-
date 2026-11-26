"""#2371 — la matrice du message persona × stade relationnel × objectif (MIROIR).

**La donnée vit dans** ``packages/contracts/src/schemas/message-matrix.ts``
(``MESSAGE_MATRIX``), un seul endroit (GA-26). Le service IA n'a pas le paquet
contracts à l'exécution : il en porte ce miroir JSON, et
``message-matrix.test.ts`` le LIT et le compare EN ENTIER à la donnée TS — une
retouche d'un seul côté fait rougir la CI, et l'échec donne le JSON à recopier.

On ne DÉCIDE rien ici : on recopie. Les consommateurs (``relationship_playbook``
pour les stades, ``message_brief`` pour la prémisse d'un objectif) lisent
``MESSAGE_MATRIX``, jamais une copie de plus.

Aucun critère protégé n'entre dans la matrice (doctrine) : le persona vient du
poste, le stade de la relation du COMPTE, l'objectif de la demande du commercial.
"""

from __future__ import annotations

import json
from typing import Any

# ⚠️ Ne pas éditer à la main sans éditer ``message-matrix.ts`` : la garde de
# parité compare les deux.
_MATRIX_JSON = r"""{
  "personas": [
    "decideur",
    "gouvernance",
    "direction",
    "manager",
    "acheteur",
    "expert",
    "operationnel"
  ],
  "objectives": [
    "ouverture_compte",
    "relance",
    "reprise_relation",
    "demande_information",
    "recommandation",
    "positionnement_expertise",
    "nurturing",
    "suivi_rendez_vous",
    "renouvellement",
    "suivi_document",
    "introduction",
    "partenariat",
    "proposer_profil",
    "valider_contexte",
    "approche_directe"
  ],
  "stages": {
    "froid": null,
    "connu": {
      "label": "compte connu (présence dans l'historique / le CRM de l'ESN)",
      "must": "repartir de ce que l'ESN sait déjà du compte — un besoin passé, un interlocuteur, une trace — au lieu d'ouvrir comme sur un inconnu",
      "opening": "ancre le message sur cet élément d'historique s'il est fourni dans le contexte compte ; s'il ne l'est pas, écris comme à froid plutôt que de supposer une relation",
      "forbidden": "prétendre une relation personnelle avec CE contact — l'historique est au compte, pas forcément à lui",
      "liftsRule3": false
    },
    "linkedin": {
      "label": "connexion LinkedIn acceptée",
      "must": "écrire court et rattacher le message à l'interaction qui vient d'avoir lieu (la connexion, un post, un commentaire), sans aucune présentation générique",
      "opening": "une phrase liée à l'interaction, puis une seule question facile ; le message tient en quelques lignes",
      "forbidden": "la présentation générique de l'ESN, le pitch catalogue, le message long",
      "liftsRule3": false
    },
    "dormant": {
      "label": "compte dormant (relation existante, sans activité récente)",
      "must": "réactiver par un signal précis ou une valeur concrète, en rappelant l'historique EXACT (ce qui a été fait, avec qui, quand) — jamais un historique approximatif",
      "opening": "rappelle le fait d'historique fourni dans le contexte compte, puis apporte l'élément neuf qui justifie de reprendre contact",
      "forbidden": "« je reviens vers vous » sans rien de neuf ; un historique flou ou reconstitué",
      "liftsRule3": true
    },
    "refere": {
      "label": "compte référé (une recommandation ouvre la porte)",
      "must": "nommer le référent dès la première ligne et demander un aiguillage PRÉCIS (la bonne personne sur un sujet nommé)",
      "opening": "cite le référent tel qu'il est écrit dans le contexte compte, dis pourquoi il t'oriente vers ce contact, demande l'aiguillage",
      "forbidden": "inventer ou déduire un référent ; si aucun nom n'est fourni, ne pas prétendre en avoir un",
      "liftsRule3": true
    },
    "ancien_client": {
      "label": "ancien client / ancien besoin",
      "must": "capitaliser sur la preuve et sur la relation déjà construite, puis vérifier ce qui a CHANGÉ depuis (équipe, périmètre, priorités)",
      "opening": "rappelle la mission ou le besoin passé fourni dans le contexte, puis pose la question de ce qui a bougé",
      "forbidden": "se représenter comme un nouveau fournisseur ; supposer que le contexte d'alors tient encore",
      "liftsRule3": true
    },
    "rang2": {
      "label": "position rang 2 (sous-traitance derrière un partenaire déjà en place)",
      "must": "respecter le partenaire titulaire, identifier le client final et son manager, et construire une présence directe sans brûler la relation existante",
      "opening": "parle du travail réellement livré sur le périmètre, jamais du partenaire en creux",
      "forbidden": "toute formulation qui court-circuite ou dénigre le titulaire — c'est le contrat en cours qu'on perd",
      "liftsRule3": true
    },
    "client_actif": {
      "label": "client actif (l'ESN livre déjà sur ce compte)",
      "must": "jouer le foisonnement : BU et entités adjacentes, remontées des consultants en mission, renouvellement, retour d'expérience à réutiliser",
      "opening": "repars d'un fait de la collaboration en cours ; ce contact n'est pas un prospect à convertir mais un client à étendre",
      "forbidden": "écrire comme à un inconnu — une prise de contact, une présentation de l'ESN, un « je me permets de vous contacter »",
      "liftsRule3": true
    },
    "besoin_ouvert": {
      "label": "besoin ouvert (une demande qualifiée est sur la table)",
      "must": "faire avancer CE besoin : qualification (budget, timing, décideur, processus), sourcing, push d'un profil concret, soutenance, next step daté",
      "opening": "nomme le besoin tel qu'il est décrit dans le contexte compte et propose l'étape suivante, datée",
      "forbidden": "repartir en découverte générique alors que le besoin est déjà nommé ; promettre une disponibilité de profil non fournie",
      "liftsRule3": true
    },
    "partenaire_actif": {
      "label": "partenaire actif (des placements sont en cours avec cette ESN partenaire)",
      "must": "parler en PAIR : repartir de la collaboration en cours et proposer un échange concret de besoins ou de profils — jamais vendre une prestation à un partenaire",
      "opening": "repars d'un fait de la collaboration fourni dans le contexte (un placement, un besoin échangé) ; s'il n'y en a aucun, n'en invente pas et parle du prochain échange possible",
      "forbidden": "écrire comme à un prospect — présentation de l'ESN, pitch d'offre, « je me permets de vous contacter » ; toute approche directe d'un consultant placé via ce partenaire",
      "liftsRule3": true
    }
  },
  "unmeasuredStage": {
    "label": "relation non mesurée",
    "directive": "L'état de relation de ce compte n'est pas connu de Bellum — ce n'est PAS la preuve d'un compte froid. Écris avec prudence, mais n'affirme ni un premier contact (« nous ne nous connaissons pas »), ni une relation existante (« suite à notre collaboration »)."
  },
  "objectivePremises": {
    "ouverture_compte": [
      "froid",
      "connu",
      "linkedin",
      "refere"
    ],
    "relance": null,
    "reprise_relation": [
      "connu",
      "dormant",
      "ancien_client"
    ],
    "demande_information": null,
    "recommandation": null,
    "positionnement_expertise": null,
    "nurturing": null,
    "suivi_rendez_vous": [
      "connu",
      "linkedin",
      "dormant",
      "refere",
      "ancien_client",
      "rang2",
      "client_actif",
      "besoin_ouvert",
      "partenaire_actif"
    ],
    "renouvellement": [
      "rang2",
      "client_actif",
      "partenaire_actif"
    ],
    "suivi_document": [
      "connu",
      "linkedin",
      "dormant",
      "refere",
      "ancien_client",
      "rang2",
      "client_actif",
      "besoin_ouvert",
      "partenaire_actif"
    ],
    "introduction": null,
    "partenariat": null,
    "proposer_profil": null,
    "valider_contexte": null,
    "approche_directe": null
  }
}"""

MESSAGE_MATRIX: dict[str, Any] = json.loads(_MATRIX_JSON)
