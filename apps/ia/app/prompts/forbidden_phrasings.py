"""LA source UNIQUE des formulations interdites dans les prompts BELLUM (GA-26).

Pourquoi ce module existe (#1922, #1926) — le constat qui l'a déclenché :
« transformation digitale » était bannie dans ``bellum_linkedin_posts.py``,
``bellum_activity.py`` et ``bellum_icebreaker.py``, mais PAS dans
``bellum_advisor.py`` (le chat) ni dans ``bellum_outreach.py`` /
``bellum_messages.py`` (les messages commerciaux). Six prompts tenaient chacun
leur propre liste PARTIELLE, avec des formulations qui divergeaient déjà d'un
fichier à l'autre (« transformation digitale » nue ici, « question générique
sur la transformation digitale » là). Un réglage qui vit à six endroits ne
diverge pas un jour lointain : il a DÉJÀ divergé.

Cinq paniers, parce que ce qui trahit un moteur de conversation n'est pas ce
qui trahit un e-mail générique, et qu'un jargon commun aux deux mérite de
n'être écrit qu'une fois :

* ``SHARED_FORBIDDEN_PHRASINGS`` — ce qu'AUCUN texte produit par BELLUM ne dit,
  quel que soit l'usage (dossier, chat, message commercial).
* ``COPILOT_FORBIDDEN_PHRASINGS`` — ce que Laura (le chat) ne dit JAMAIS en
  plus des interdits partagés : les tics de méta qui trahissent un moteur de
  conversation plutôt qu'un collègue qui connaît déjà le dossier (#1922.15,
  .17, .18), et les formules figées de la posture après erreur (#2270.19, .20,
  .22).
* ``COPILOT_FORBIDDEN_BEHAVIOURS`` — ce que Laura ne FAIT jamais en plus des
  interdits secs (#2270.23) : un comportement ne se contrôle pas par
  sous-chaîne, même règle que ``MESSAGE_FORBIDDEN_BEHAVIOURS``.
* ``MESSAGE_FORBIDDEN_PHRASINGS`` — ce que les messages commerciaux (LinkedIn,
  e-mail, téléphone) ne disent JAMAIS en plus des interdits partagés (#1926.21,
  .25).
* ``MESSAGE_FORBIDDEN_BEHAVIOURS`` — ce que ces mêmes messages ne FONT jamais
  (#1926.22-.24) : un comportement ne se contrôle pas par sous-chaîne.

Chaque prompt compose SA propre phrase en important ces constantes — jamais en
les retapant. La forme de la phrase (bannissement sec, règle conditionnée à un
exemple manquant, liste à points) reste au prompt : ce module ne tient que
CE QUI est interdit, pas COMMENT chaque prompt le dit.

``tests/test_forbidden_phrasings.py`` (les ``test_*_keeps_every_original_ban``)
compare, phrase par phrase, ce que chaque prompt bannissait AVANT ce module et
ce qu'il bannit APRÈS : aucun prompt ne doit en avoir perdu une. Le même
fichier vérifie que les prompts IMPORTENT réellement ce module.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable

#: Ce qu'AUCUN texte produit par BELLUM ne dit, quel que soit l'usage. Un seul
#: item aujourd'hui — la liste reste un tuple (pas une constante isolée) pour
#: qu'un futur ajout n'oblige personne à changer la FORME de son import.
DIGITAL_TRANSFORMATION = "transformation digitale"
SHARED_FORBIDDEN_PHRASINGS: tuple[str, ...] = (DIGITAL_TRANSFORMATION,)

#: Ce que Laura (le chat/copilote) ne dit JAMAIS EN PLUS des interdits
#: partagés — les tics de « moteur » qui la font sonner comme un outil qui
#: vient de lire le dossier plutôt que comme quelqu'un qui le connaît déjà
#: (#1922.15 « je note », #1922.17 « voici une analyse exhaustive » ; les trois
#: premiers existaient déjà dans ``bellum_advisor.py`` avant ce module — ils
#: sont DÉPLACÉS ici, pas dupliqués). #2270.19, .20, .22 (posture après erreur,
#: épopée #2954) ajoutent les trois formules figées que le retour LAU-FINAL-013
#: nommait explicitement.
#: #3195.3 (LAU-FINAL-201) — trois refus nus qu'une donnée manquante ne doit
#: JAMAIS déclencher : aucun ne dit ce qui manque, ce qui est su, ni ce qui
#: reste possible (voir ``laura_data_unknown.BLOCK_DATA_UNKNOWN``, « LA
#: RÉPONSE EN CINQ GESTES »). Rendues par la MÊME ligne « PAS DE MÉTA » que
#: les huit ci-dessus — un seul endroit qui les cite (GA-26).
#: ⚠️ Intégration X2 (28/09) : la valeur d'origine de ``REDIRECT_TO_LINKEDIN``
#: nommait le fournisseur (« consulte linkedin »), rendu tel quel par « PAS DE
#: MÉTA » dans le prompt système — en contradiction directe avec
#: ``test_no_vendor_name_reaches_the_system_prompt`` (nos fournisseurs ne se
#: nomment jamais à l'écran, doctrine CLAUDE.md). Reformulée vendor-neutre,
#: même refus que ``COPILOT_MANUAL_REDIRECT_PHRASINGS`` juste en dessous.
CANNOT_ANSWER = "je ne peux pas répondre"
NO_INFO_AVAILABLE = "aucune information disponible"
REDIRECT_TO_LINKEDIN = "consulte un réseau professionnel"
#: #3346.1, .3, .5 (LAU-FINAL-256, retour bêta 29/09) — trois mots
#: d'ORGANISATION INTERNE du produit, jamais une réalité commerciale
#: compréhensible, et sans usage légitime nulle part (contrairement à
#: « ton espace », « matching » ou « source interne », qui restent corrects
#: quand ils sont aussitôt précisés — voir `laura_business_language.py`, qui
#: importe ces trois constantes plutôt que de les retaper).
INTERNAL_CATALOGUE = "catalogue interne"
WORKSPACE_ACCOUNT = "workspace account"
MEMORY_AVAILABLE = "mémoire disponible"
COPILOT_FORBIDDEN_PHRASINGS: tuple[str, ...] = (
    "d'après tes données",
    "je vois que",
    "selon mon analyse",
    "je note",
    "voici une analyse exhaustive",
    "tu as raison",
    "je comprends ta frustration",
    "je vais faire mieux",
    # #3191.3 (LAU-FINAL-197) — une phrase IMPERSONNELLE, sujet effacé derrière
    # un conditionnel : le symptôme exact du rapport généré plutôt que de la
    # collègue qui tranche. « il faudrait » reste légitime (une hypothèse
    # assumée par CELUI qui parle) ; « il conviendrait de » ne l'est jamais.
    "il conviendrait de",
    # #3195.3 (LAU-FINAL-201) — trois refus nus qu'une donnée manquante ne
    # doit JAMAIS déclencher (voir leur docstring ci-dessus).
    CANNOT_ANSWER,
    NO_INFO_AVAILABLE,
    REDIRECT_TO_LINKEDIN,
    # #3346.1, .3, .5 — voir le docstring des trois constantes ci-dessus.
    INTERNAL_CATALOGUE,
    WORKSPACE_ACCOUNT,
    MEMORY_AVAILABLE,
)

#: #3189.4 (LAU-FINAL-195, « DO THE WORK, DO NOT TEACH THE WORK ») — ce que
#: Laura ne dit JAMAIS quand elle-même dispose d'un outil capable de faire le
#: travail : une procédure MANUELLE (un site externe, ou « tu peux » suivi
#: d'un verbe de recherche) à la place du résultat que Bellum prétend
#: automatiser. Panier distinct de ``COPILOT_FORBIDDEN_PHRASINGS`` : celui-ci
#: bannit des TICS de moteur de conversation, celui-ci bannit une DÉLÉGATION
#: du travail à la personne — deux défauts différents, même s'ils se lisent
#: tous deux sur une réponse de Laura. ⚠️ Jamais un nom de fournisseur ici
#: (« nos fournisseurs ne se nomment jamais à l'écran » — LinkedIn en est un,
#: `test_no_vendor_name_reaches_the_system_prompt` le garde déjà) : on nomme
#: la CAPACITÉ (« un réseau professionnel », comme le fait déjà
#: `composer.connector.family.linkedin` côté web), jamais le produit.
GO_TO_A_PROFESSIONAL_NETWORK = "va sur un réseau professionnel"
SEARCH_ON_A_PROFESSIONAL_NETWORK = "cherche sur un réseau professionnel"
GO_TO_A_SEARCH_ENGINE = "va sur un moteur de recherche"
SEARCH_ON_A_SEARCH_ENGINE = "cherche sur un moteur de recherche"
YOU_CAN_SEARCH = "tu peux rechercher"
TRY_FILTERING_BY = "essaie de filtrer par"
# #3189.4 (rouvert, recette prod 29/09) — la réponse SNCF : « Tu trouveras … sur
# la page officielle Consultations fournisseurs » + une liste de sites. Aucune
# des formulations ci-dessus n'y figurait : le catalogue ne voyait pas le renvoi.
ON_THE_OFFICIAL_PAGE = "sur la page officielle"
ON_THE_OFFICIAL_SITE = "sur le site officiel"
CONSULT_THE_SITE = "consulte le site"
CONSULT_THE_PAGE = "consulte la page"
COPILOT_MANUAL_REDIRECT_PHRASINGS: tuple[str, ...] = (
    GO_TO_A_PROFESSIONAL_NETWORK,
    SEARCH_ON_A_PROFESSIONAL_NETWORK,
    GO_TO_A_SEARCH_ENGINE,
    SEARCH_ON_A_SEARCH_ENGINE,
    YOU_CAN_SEARCH,
    TRY_FILTERING_BY,
    ON_THE_OFFICIAL_PAGE,
    ON_THE_OFFICIAL_SITE,
    CONSULT_THE_SITE,
    CONSULT_THE_PAGE,
)

#: #2270.23 — un COMPORTEMENT, pas une formulation : aucune sous-chaîne ne
#: capture une auto-justification qui s'étend sur plusieurs phrases après une
#: erreur reconnue (même distinction que ``MESSAGE_FORBIDDEN_BEHAVIOURS``
#: ci-dessous).
LONG_SELF_JUSTIFICATION = "longue auto-justification après une erreur"
# #3191.3 (LAU-FINAL-197) — deux comportements de plus, ni l'un ni l'autre une
# sous-chaîne : un emoji se compte, il ne se cherche pas dans une comparaison de
# texte, et un titre de rappel nommant l'ESN varie avec chaque client (jamais
# la même chaîne deux fois) — la doctrine « le rôle change l'ordre, jamais le
# contenu » vaut ici pour la FORME : nommer l'ESN dans un intitulé de synthèse
# est le tic qui trahit le gabarit, pas le nom lui-même.
DECORATIVE_EMOJI = "emoji décoratif"
RECAP_TITLE_NAMES_THE_ESN = "titre de synthèse qui nomme l'ESN"
COPILOT_FORBIDDEN_BEHAVIOURS: tuple[str, ...] = (
    LONG_SELF_JUSTIFICATION,
    DECORATIVE_EMOJI,
    RECAP_TITLE_NAMES_THE_ESN,
)

#: #1922.19 — distincte des bannissements secs ci-dessus : ce n'est pas la
#: PHRASE qui est interdite dans l'absolu, c'est de la dire SANS agir dans le
#: même tour. Le copilote n'a aucun chemin d'écriture (doctrine « ce qui
#: n'écrit pas tout seul ») : « je vais m'en occuper » sans exécution réelle
#: promet un geste qu'aucune ligne de code ne peut tenir.
COPILOT_FALSE_PROMISE = "je vais m'en occuper"

#: #2304.28-.31 (épopée #2932, LAU-FINAL-045) — ce que le VERDICT de compte
#: (``dossier_read``, ``apps/ia/app/prompts/bellum_plan.py``) ne dit JAMAIS,
#: sur AUCUN de ses champs texte (``why_for_your_esn``, ``recommended_scope``,
#: ``best_entry_point``, ``obstacles``, ``anti_advice``, ``next_action``,
#: ``missing``). Une garde existait déjà pour ``why_for_your_esn`` seul
#: (« raison interchangeable... aucun gabarit ») mais aucune phrase nommée
#: n'y était bannie littéralement, et aucun autre champ n'en héritait. Les
#: quatre ci-dessous sont les généralités qui reviennent le plus sur un
#: verdict de compte — vraies pour n'importe quel compte, donc fausses pour
#: CE compte précisément.
DOSSIER_VERDICT_FORBIDDEN_PHRASINGS: tuple[str, ...] = (
    "compte à fort potentiel",
    "poursuivre les échanges",
    "identifier les décideurs",
    "capitaliser sur les signaux",
)

#: #3180 (LAU-FINAL-186, retour bêta 28/09/2026) — section INTERDIT du
#: retour : ce que le CHALLENGE commercial de Laura (``commercial_challenge
#: .py``) ne dit JAMAIS, en plus des interdits partagés. Un jugement de
#: valeur ou un refus sec transformeraient le droit de contredire en posture
#: paternaliste — exactement le NO-GO du retour inverse (« Laura obéit
#: poliment ») que cette politique corrige.
CHALLENGE_YOU_ARE_WRONG = "tu fais erreur"
CHALLENGE_BAD_IDEA = "mauvaise idée"
COPILOT_CHALLENGE_FORBIDDEN_PHRASINGS: tuple[str, ...] = (CHALLENGE_YOU_ARE_WRONG, CHALLENGE_BAD_IDEA)

#: Comportements du challenge, jamais des formulations — même distinction que
#: ``COPILOT_FORBIDDEN_BEHAVIOURS`` ci-dessus : un refus sec ou une posture
#: paternaliste ne se capturent pas par sous-chaîne.
VALUE_JUDGMENT = "jugement de valeur"
CURT_REFUSAL = "refus sec"
PATERNALISTIC_POSTURE = "posture paternaliste"
CHALLENGE_WITHOUT_ALTERNATIVE = "challenge sans alternative"
CHALLENGE_ON_UNVERIFIED_DATA = "challenge fondé sur une donnée non vérifiée"
# #3855 (BEL-LAU-1008-004, retour bêta 08/10) — section INTERDIT du retour :
# deux comportements nommés qui n'avaient pas encore leur propre constante
# dans ce panier — l'approbation réflexe (« excellente idée » sans analyse)
# et l'urgence fabriquée pour faire pencher une décision. Comportements, pas
# des formulations : même règle que les cinq autres (aucune sous-chaîne).
AUTOMATIC_FLATTERY = "flatterie automatique"
ARTIFICIAL_PRESSURE = "pression artificielle"
# #3855 (BEL-LAU-1008-004, recette prod 08/10, 2e passe) — volet 2 KO :
# après avoir donné son avis, Laura refusait ENCORE d'exécuter (« Je ne
# prépare pas un message... ») et reposait une question sur un choix que
# l'utilisateur venait de trancher (« fais-le quand même »). Comportement,
# pas une formulation : même règle que les sept autres (aucune sous-chaîne).
CHOICE_MAINTAINED_IGNORED = "choix maintenu ignoré (refus ou nouvelle question après qu'il a été tranché)"
COPILOT_CHALLENGE_FORBIDDEN_BEHAVIOURS: tuple[str, ...] = (
    VALUE_JUDGMENT,
    CURT_REFUSAL,
    PATERNALISTIC_POSTURE,
    CHALLENGE_WITHOUT_ALTERNATIVE,
    CHALLENGE_ON_UNVERIFIED_DATA,
    AUTOMATIC_FLATTERY,
    ARTIFICIAL_PRESSURE,
    CHOICE_MAINTAINED_IGNORED,
)

#: Ce que les messages commerciaux (LinkedIn, e-mail, téléphone) ne disent
#: JAMAIS en plus des interdits partagés (#1926.25 — un chiffre de baisse ou de
#: retard cité comme une alerte est une donnée PRIVÉE présentée comme un
#: signal marché, et la doctrine des observations structurelles l'interdit
#: déjà côté chat : les messages ne l'avaient pas).
HISTORICAL_DATA_ALARMIST = "donnée historique inquiétante"
#: #2374.10 — l'esprit était déjà couvert (« ne reproche jamais le silence »,
#: ``message_brief.py``) mais la phrase LITTÉRALE elle-même n'était bannie
#: nulle part : un contrôle avant envoi qui compare des sous-chaînes
#: (``no_banned_phrases``) ne voit que ce qui est écrit entre guillemets ici.
NO_MESSAGE_SEEN_REPROACH = "avez-vous vu mon message"
MESSAGE_FORBIDDEN_PHRASINGS: tuple[str, ...] = (
    HISTORICAL_DATA_ALARMIST,
    NO_MESSAGE_SEEN_REPROACH,
)

#: Ce que les messages commerciaux ne FONT jamais — des comportements, pas des
#: formulations. Panier distinct parce qu'il ne se rend ni entre guillemets ni
#: dans la règle d'or « JAMAIS : … », dont le contrôle avant envoi
#: (``no_esn_jargon``) compare des sous-chaînes et ne peut pas voir une fausse
#: urgence : ``bellum_messages`` le rend par sa propre règle d'or, sans
#: vérificateur.
# #1926.22 — le catalogue d'offres déroulé dans un premier message (la règle
# « à bannir : le catalogue d'offres » ne vivait que dans le script téléphone).
SERVICES_LIST = "liste de services"
# #1926.23 — une échéance ou une rareté que le contexte ne porte pas.
FALSE_URGENCY = "fausse urgence"
# #1926.24 — le rendez-vous demandé par réflexe, sans raison donnée.
SYSTEMATIC_MEETING_REQUEST = "demande de rendez-vous systématique"
MESSAGE_FORBIDDEN_BEHAVIOURS: tuple[str, ...] = (
    SERVICES_LIST,
    FALSE_URGENCY,
    SYSTEMATIC_MEETING_REQUEST,
)


#: #3382 (beta bêta 30/09, hiérarchie des sources méthodologiques, GA-26) — ces
#: trois formulations étaient bannies à la fois dans les messages commerciaux
#: (``bellum_messages._LOCAL_BANNED_PHRASES``) et dans la stratégie de rang 2
#: (``bellum_strategy.py``, § JAMAIS) : deux copies verbatim, jamais reliées —
#: exactement le risque de divergence que ce module existe pour fermer (voir
#: le constat en tête de fichier). ``bellum_strategy`` est rédigé SANS accents
#: pour une raison technique documentée dans son propre en-tête : {@link
#: ascii_fold} en dérive la forme ASCII une fois, plutôt que de la retaper à
#: la main dans le prompt (une seconde chaîne qui aurait pu diverger de
#: celle-ci à la première frappe).
GENERIC_CREDIBILITY_APPEAL = "je me permets de"
GENERIC_EXPERTISE_CLAIM = "nos expertises reconnues"
GENERIC_METHODOLOGY_CLAIM = "notre méthodologie éprouvée"
GENERIC_CREDIBILITY_PHRASINGS: tuple[str, ...] = (
    GENERIC_CREDIBILITY_APPEAL,
    GENERIC_EXPERTISE_CLAIM,
    GENERIC_METHODOLOGY_CLAIM,
)


def ascii_fold(phrase: str) -> str:
    """Translittère les accents (NFKD, marques combinantes retirées) — pour un
    prompt rédigé sans accents par contrainte technique documentée (ex.
    ``bellum_strategy.py``). Une forme DÉRIVÉE de la source unique, jamais une
    seconde chaîne retapée à la main."""
    return unicodedata.normalize("NFKD", phrase).encode("ascii", "ignore").decode("ascii")


def quoted_fr(phrasings: Iterable[str]) -> str:
    """Rend une liste de formulations interdites entre guillemets français,
    jointes par une virgule — le format déjà utilisé par ``bellum_advisor.py``
    avant ce module (« d'après tes données », « je vois que », …). Un seul
    endroit qui décide du séparateur : deux prompts qui le refont divergent au
    premier ajout, exactement le défaut que ce module corrige par ailleurs."""
    return ", ".join(f"« {p} »" for p in phrasings)
