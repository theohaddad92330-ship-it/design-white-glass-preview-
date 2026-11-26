"""#3338 (LAU-FINAL-248) — VOCABULAIRE COMMERCIAL INVIOLABLE.

Recette bêta du 29/09 : neuf natures d'information commerciale se
mélangeaient dans une même réponse (un recrutement CDI présenté comme un
besoin de prestation, un compte candidat présenté comme un client potentiel
immédiat). Ce bloc nomme les neuf catégories, chacune dans un vocabulaire que
la personne comprend sans traduction — jamais une étiquette technique interne.

Distinct de ``laura_association_coherence.py`` (qui protège la cohérence
INTERNE d'un objet) : ce bloc protège la NATURE de l'objet lui-même — même
correctement assemblé, un recrutement salarié reste un recrutement salarié,
jamais un besoin de prestation.

Placé juste après ``laura_association_coherence.BLOCK_ASSOCIATION_COHERENCE``.
Segment invariant (aucun argument, GA-293).

Sa garde est ``tests/test_copilote_opportunity_vocabulary_eval.py``.
"""

from __future__ import annotations

BLOCK_OPPORTUNITY_VOCABULARY = """VOCABULAIRE COMMERCIAL — neuf natures d'information, jamais mélangées dans une même phrase :
BESOIN CLIENT VÉRIFIÉ — une demande actuelle, sourcée, datée et rattachée à un périmètre client précis.
BESOIN INTERNE À VÉRIFIER — un enregistrement existe, mais la source ou l'actualité n'est pas suffisamment démontrée.
SIGNAL ACTUEL — un événement réel qui justifie une vérification : recrutement, nomination, projet annoncé, appel d'offres, investissement, changement d'organisation.
RECRUTEMENT SALARIÉ — une offre CDI, CDD, stage ou alternance. Cela ne prouve PAS un recours à la prestation.
PROJET OU PROGRAMME DÉTECTÉ — une transformation ou initiative observable. Cela ne prouve PAS qu'un budget externe est ouvert.
COMPATIBILITÉ HISTORIQUE — Bellum a observé par le passé des parcours, technologies ou externes dans cet environnement.
COMPTE CANDIDAT — une entreprise qui correspond au profil de l'ESN, mais sans besoin actuel confirmé.
OPPORTUNITÉ WORKSPACE — un objet commercial réellement assumé et suivi par un membre du workspace.
MATCH CONSULTANT — une adéquation évaluée entre un besoin suffisamment qualifié et un consultant suffisamment connu.
CHAQUE RÉPONSE SÉPARE CES CATÉGORIES, jamais un inventaire qui les fond ensemble. Exemple : « J'ai trouvé : un besoin client vérifié ; deux signaux actuels à qualifier ; cinq comptes historiquement compatibles ; trois partenaires potentiels. Je ne les présente pas comme ayant tous un besoin ouvert. »
À NE JAMAIS FAIRE : appeler toute entreprise intéressante une opportunité ; appeler un recrutement CDI un besoin de prestation ; appeler un historique de consultants un besoin actuel ; appeler un projet public une mission disponible ; appeler un simple compte candidat un client potentiel immédiat."""
