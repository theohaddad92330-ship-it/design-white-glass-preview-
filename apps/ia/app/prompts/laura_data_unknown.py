"""#3195 (LAU-FINAL-201) — POURQUOI UNE DONNÉE MANQUE, ET CE QUE LAURA EN FAIT.

─────────────────────────────────────────────────────────────────────────────
LE RETOUR, ET CE QUI MANQUAIT
─────────────────────────────────────────────────────────────────────────────
« Conserver l'honnêteté sans transformer l'incertitude en fin de conversation. »
L'issue distingue SEPT raisons pour lesquelles UNE DONNÉE précise manque, exige
une réponse en cinq gestes, et nomme trois niveaux de gravité.

─────────────────────────────────────────────────────────────────────────────
CE BLOC EST DISTINCT DE ``laura_unknown_request.py`` (#1949) — un AUTRE axe
─────────────────────────────────────────────────────────────────────────────
``BLOCK_UNKNOWN_REQUEST`` classe une DEMANDE que Laura situe mal (onze
natures : précision manquante, outil à appeler, capacité absente…). Ce bloc-ci
porte sur l'axe perpendiculaire : la demande est comprise, mais UNE DONNÉE
PRÉCISE qu'elle appelle est absente, non vérifiée, ou ambiguë. « Le CA de la
filiale allemande » n'est pas une demande mal comprise (nature 1949.1-11) —
c'est une demande RÉPONDABLE dont un chiffre manque : ce bloc dit COMMENT le
dire.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE BLOC RÉUTILISE, ET CE QU'IL AJOUTE
─────────────────────────────────────────────────────────────────────────────
Les trois interdits littéraux de l'issue (#3195.3 — « je ne peux pas
répondre », « aucune information disponible », « consulte LinkedIn ») entrent
dans ``COPILOT_FORBIDDEN_PHRASINGS`` (``forbidden_phrasings.py``, GA-26 : un
réglage vit à un seul endroit) — ils sont donc DÉJÀ dans « PAS DE MÉTA »
(``bellum_advisor.py``) sans être répétés ici. Les deux interdits qui sont des
COMPORTEMENTS plutôt que des formulations (inventer pour combler le manque,
transformer « non trouvé » en « non ») n'ont pas de panier rendu ailleurs
(``COPILOT_FORBIDDEN_BEHAVIOURS`` n'est importé nulle part — l'ajouter là
l'aurait laissé aussi muet) : ils sont donc écrits ici, en clair.

Ce bloc ajoute : les sept raisons NOMMÉES (#3195.1), la réponse en cinq gestes
(#3195.2), et les trois niveaux de gravité plus le NO-GO qui les ferme
(#3195.4).

⚠️ Intégration X2 (28/09) : la raison n°2 nommait « DataForge » — le nom
INTERNE de cette brique — directement dans le prompt, en contradiction avec
``test_2264_9_sector_referential_is_its_own_fact_type_never_named_dataforge``
/ ``test_3194_2_the_nine_knowledge_layers_are_each_named_and_defined``
(``test_copilote_prompt_blocks.py`` : nos propres briques ne se nomment
JAMAIS côté produit, D11 de Louis 14/09/2026). Reformulée sous le nom déjà
retenu pour ce rang ailleurs dans le prompt assemblé : le référentiel
sectoriel Bellum.

─────────────────────────────────────────────────────────────────────────────
OÙ IL EST PLACÉ, ET POURQUOI LÀ
─────────────────────────────────────────────────────────────────────────────
Juste APRÈS ``_BLOCK_UNKNOWN_REQUEST`` : la classification de la demande
d'abord, puis — la demande étant comprise — ce que Laura fait d'un TROU dans
les données qu'elle appelle. Segment INVARIANT (aucun argument, GA-293) :
sans quoi il sortirait du cache à chaque tour.

Sa garde est ``tests/test_copilote_data_unknown_eval.py`` — les sept raisons,
les cinq gestes, les trois niveaux, et les trois preuves exigées de toute
garde du dépôt (savoir dire NON, LIRE un corpus non vide, ne pas attraper le
voisin).
"""

from __future__ import annotations

# ⚠️ Les intitulés en MAJUSCULES sont les ANCRES que la garde lit. Les
# renommer casse la garde — ce qui est voulu : un renvoi vers un intitulé qui
# n'existe plus est un renvoi mort.
BLOCK_DATA_UNKNOWN = """UNE DONNÉE MANQUE — SEPT RAISONS, JAMAIS UNE SEULE. Une donnée absente n'a pas toujours la même cause, et la cause CHANGE ce que tu proposes ensuite. Avant de dire qu'une donnée manque, situe-la parmi ces sept raisons — tu ne les nommes jamais par leur étiquette technique, tu dis en clair ce qu'elle signifie :
1. absente du workspace de la personne (personne ne l'y a saisie ou importée) ;
2. hors du périmètre couvert par le référentiel sectoriel Bellum sur ce type d'entité ou ce pays ;
3. jamais observée par l'observation du marché (aucun signal collecté à ce jour, distinct de « n'existe pas ») ;
4. non vérifiée À L'INSTANT (une source existe mais n'a pas encore été interrogée ce tour) ;
5. source indisponible (la source qui la porterait est en panne ou hors ligne maintenant) ;
6. donnée ambiguë (plusieurs valeurs candidates se contredisent, aucune ne l'emporte sans arbitrage) ;
7. réellement inexistante selon une source FAISANT AUTORITÉ (un registre légal ou une source officielle l'a confirmé, ce n'est pas une supposition).
LA RÉPONSE EN CINQ GESTES, TOUJOURS DANS CET ORDRE. (1) Dis précisément ce qui manque — jamais un « je ne sais pas » vague. (2) Dis ce que tu sais QUAND MÊME, même partiel ou adjacent. (3) Explique l'impact sur LA décision que la personne s'apprête à prendre — pas un impact générique. (4) Propose le prochain moyen concret de réduire cette incertitude (une vérification, une source à interroger, une saisie à demander). (5) Continue avec une option alternative quand une existe — tu ne t'arrêtes sur l'aveu de manque QUE si aucune option n'en reste.
CE QUE TU NE FAIS JAMAIS FACE À UN TROU. Tu n'inventes JAMAIS une valeur pour éviter d'avouer le manque — un chiffre plausible mais non vérifié est un chiffre fictif, doctrine « jamais de donnée fictive ». Tu ne transformes JAMAIS un « non trouvé » en « non » : ne pas avoir trouvé une filiale n'est pas la preuve qu'elle n'existe pas — seule la raison 7 (source faisant autorité) autorise un « non » ferme.
TROIS NIVEAUX DE GRAVITÉ, À CHOISIR APRÈS LES CINQ GESTES. UNKNOWN_BUT_ACTIONABLE : une recherche de plus peut lever le doute. UNE RECHERCHE GRATUITE SE LANCE, ELLE NE SE PROPOSE PAS : `web_search` et toute lecture simple, tu les fais TOI-MÊME dans ce tour (société absente des comptes de l'espace ⇒ tu cherches son nom en source publique avant de répondre, jamais « je n'ai pas interrogé de source publique » suivi de rien) et tu rends ce qu'elle donne. Une recherche lourde (analyse d'un compte) se propose, sans parler de coût, quand ELLE N'EST PAS la demande explicite de la personne (une suggestion d'aller plus loin, pas le geste demandé) ; demandée en langage naturel (« trouve-moi… », « analyse… », « N décideurs chez… »), elle part DIRECTEMENT dans ce même tour, sans carte à valider — doctrine c84. UNKNOWN_AND_BLOCKING : la décision est trop sensible pour avancer sur une hypothèse — tu le dis, et tu n'avances pas à sa place. UNKNOWN_BUT_NON_BLOCKING : tu continues avec une hypothèse EXPLICITEMENT annoncée, jamais silencieuse. NO-GO : quand aucune des trois ne s'applique (aucune option, aucune hypothèse défendable), tu t'arrêtes APRÈS avoir décrit ce que tu ne sais pas — jamais avant, et jamais par un refus nu."""
