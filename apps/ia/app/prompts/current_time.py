"""#1995 — LA DATE COURANTE DU TOUR, avec son fuseau.

Mesuré en production le 14/09/2026 (api ET ia au SHA ``79666d36d``), dans
``/chat``, portée « tout le portefeuille » :

    Louis — Rappelle-moi de relancer Sandrine Pata chez THALES demain à 9 h 30
    Laura — […] la date exacte de « demain » — je n'ai pas accès à la date
            courante dans ce fil.

Elle disait vrai. Le prompt système du chat ne portait aucune date : la seule
invite du dépôt qui en avait une était le brief hebdomadaire
(``bellum_weekly.py`` — ``DATE : {today}``). Or la description de
``schedule_reminder_for_contact`` ORDONNE au modèle de faire le calcul —
« Résous toi-même les formulations relatives (« lundi », « dans 15 jours ») en
date absolue » — et ``_normalise_iso_utc`` REFUSE (à raison) tout ce qui n'est
pas une date absolue. Aucune demande datée relativement ne pouvait donc
aboutir, indépendamment du problème d'identifiant : « relance-le lundi »,
« dans 15 jours », « la semaine prochaine ».

⚠️ LE BLOC PART EN QUEUE DU PROMPT, dans le segment VOLATIL. Une date change à
chaque tour : posée dans un segment mis en cache, elle ferait rater le cache du
prompt système à CHAQUE message (GA-293). C'est la même raison qui met déjà
l'état du fil en queue (#1927.8) et le périmètre d'objet (#1951.2). Corollaire :
le golden ``tests/golden/system/advisor.txt`` ne bouge pas d'un octet — le bloc
ne passe pas par ``build_system_prompt``.

⚠️ AUCUN NOM DE MOIS NI DE JOUR VENU DE LA LOCALE. ``strftime('%A %d %B %Y')``
rend « Monday » ou « lundi » selon ``LC_TIME`` : un test qui en dépend est vert
en local et rouge en CI. Les deux tables ci-dessous sont explicites.
"""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

#: Le fuseau de RÉFÉRENCE du produit — LE DÉFAUT NOMMÉ, et pas « le fuseau ».
#:
#: Il l'était pour tout le monde jusqu'au 14/09/2026 : ``SMS_ALLOWED_COUNTRY_CODES``
#: vaut ``33`` par défaut, la console opérateur affiche tout en ``Europe/Paris``
#: (``apps/dashboard-manager/src/lib/dates.ts::FUSEAU_CONSOLE``), et le produit
#: s'adresse à des ESN françaises. Le décalage est ÉCRIT dans le bloc, donc le
#: modèle horodate de manière cohérente au lieu de deviner.
#:
#: Décision de Louis du 14/09/2026 — « ajouter un fuseau par utilisateur » : le
#: fuseau de la personne arrive maintenant du profil, par ``ChatRequest.timezone``
#: (API : ``profiles.timezone`` → ``ChatContextService.resolveTimezone`` →
#: ``IaClient.chatBody``). ⚠️ Cette constante RESTE le défaut quand il est
#: inconnu ou illisible : un fuseau absent ne vaut ni UTC ni une devinette, il
#: vaut ce nom-là, et le bloc annonce toujours le fuseau réellement utilisé.
REFERENCE_TIMEZONE = "Europe/Paris"

#: Le marqueur qui précède l'instant machine. C'est le contrat que lit le test
#: du chemin complet — l'unique endroit où cette chaîne est écrite.
CURRENT_TIME_ISO_MARKER = "instant ISO 8601 : "

_WEEKDAYS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
_MONTHS = (
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
)

# #1958.14/.15 — la LANGUE DE L'INTERFACE (#1958.8, jamais devinée depuis le
# message) décide de la FORME de ce bloc, pas seulement de la langue des
# blocs invariants du prompt. Écrites en dur, comme les tables françaises
# ci-dessus : `strftime`/`LC_TIME` rendrait un test vert en local et rouge en
# CI (voir l'avertissement du module).
_WEEKDAYS_EN = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
_MONTHS_EN = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

_READING_RULES = (
    "Résous contre CETTE date toute formulation relative — « demain », « lundi », "
    "« la semaine prochaine », « dans 15 jours » — et n'écris jamais qu'une date "
    "ABSOLUE au format ISO 8601, avec le décalage horaire ci-dessus. Ne demande "
    "JAMAIS la date du jour à la personne : tu l'as ici. Et ne déduis RIEN D'AUTRE "
    "de cet instant — il dit quand on est, jamais si une information est encore vraie. "
    # #1958.15 — LE FORMAT DE DURÉE n'avait aucune consigne : #1958.14 fixait
    # l'heure et la date, mais « dans 3 jours » (une DURÉE écrite en PROSE, pas
    # une date à résoudre en ISO) restait laissé au modèle, non testé. Même
    # porte que le reste du bloc : la langue de CETTE interface, jamais l'ISO
    # (qui n'est lu que par du code, jamais montré à la personne).
    "Quand tu exprimes une DURÉE en prose (« dans 3 jours », « il y a 2 semaines », "
    "« depuis 6 mois »), écris-la dans la langue de cette interface — jamais un "
    "calcul ou une formulation en anglais glissés dans une phrase française. "
    # #1958.18 — mesuré 17/09 : une date NUMÉRIQUE écrite par la personne
    # (« 03/04 ») est AMBIGUË — jour/mois en France, mois/jour dans un usage
    # anglo-saxon — et rien ne garantit que la personne écrive dans la
    # convention de SON interface (elle peut coller une date reçue d'un
    # client anglophone). La trancher en silence romprait #1958.7 (confirmer
    # avant d'agir) au moment précis où la confirmation compte le plus.
    "Une date écrite en chiffres avec des barres obliques ou des points "
    "(« 03/04 », « 03.04 ») est AMBIGUË : jour/mois en France, mois/jour dans "
    "un usage anglo-saxon. Ne choisis JAMAIS ce sens en silence — demande "
    "confirmation en donnant explicitement les deux lectures possibles "
    "(« le 3 avril, ou le 4 mars ? ») avant de la résoudre en date absolue. "
    # #2266.11/.12 (épopée #2920) — la personne peut affirmer un jour de
    # semaine FAUX par rapport à la date ci-dessus (« on est lundi » un
    # mardi). Corriger sans s'arrêter, et ne JAMAIS répéter l'erreur avant de
    # se corriger.
    "Si la personne affirme un jour de semaine qui NE correspond PAS à la "
    "date ci-dessus, corrige-la SANS interrompre ton travail : intègre la "
    "bonne date dans ta réponse (« Je te prépare la matinée de mardi 15 "
    "septembre ») plutôt que de t'arrêter pour la reprendre. Ne reproduis "
    "JAMAIS son erreur dans ta réponse avant de te corriger au tour "
    "suivant — la correction est immédiate, dans la MÊME réponse. "
    # #2266.14 — au-delà de la seule date numérique ambiguë ci-dessus :
    # toute action planifiée avec une ambiguïté réelle (fuseau non précisé
    # pour un horaire, formulation qui pourrait désigner deux dates) se
    # confirme AVANT d'agir.
    "Avant de planifier ou d'écrire une action à une date et une heure "
    "données par la personne de façon ambiguë, confirme EXPLICITEMENT date, "
    "heure ET fuseau avant d'agir (« Lundi 21 septembre à 9 h 30, heure de "
    "Paris — c'est bien cela ? ») plutôt que de deviner. "
    # #2266.16-.20 — CINQ dates distinctes, jamais confondues sous un mot
    # « date » unique.
    "Quand tu cites une date à propos d'un fait, NOMME de laquelle il "
    "s'agit — jamais une date nue : la date du FAIT rapporté (quand la "
    "chose s'est produite), la date de COLLECTE (quand cette information a "
    "été recueillie), la date de dernière VÉRIFICATION (quand elle a été "
    "recontrôlée), la date de l'ANALYSE (quand ce dossier a été calculé), "
    "la date de l'ACTION PRÉVUE (quand un geste est planifié). Deux dates "
    "différentes sur le même fait ne se confondent jamais sous un seul mot "
    "« date »."
)
_READING_RULES_EN = (
    "Resolve every relative wording against THIS date — “tomorrow”, “Monday”, "
    "“next week”, “in 15 days” — and only ever write an ABSOLUTE date in ISO 8601 "
    "format, with the offset above. NEVER ask the person for today's date: you "
    "have it here. And infer NOTHING ELSE from this instant — it says when we "
    "are, never whether a piece of information is still true. "
    # #1958.15 — same companion rule as the French block above, mirrored.
    "When you express a DURATION in prose (“in 3 days”, “2 weeks ago”, “for the "
    "past 6 months”), write it in the language of this interface — never a "
    "French phrasing slipped into an English sentence. "
    # #1958.18 — same rule, mirrored: an English interface does not guarantee
    # the person types in US date order (a French user may switch the
    # interface to English while still writing dates day/month).
    "A numeric date written with slashes or dots (“03/04”, “03.04”) is "
    "AMBIGUOUS: day/month in France, month/day in US usage. NEVER pick a "
    "reading silently — ask the person to confirm, spelling out both possible "
    "readings (“April 3rd, or March 4th?”), before resolving it into an "
    "absolute date. "
    # #2266.11/.12 — mirrored.
    "If the person states a weekday that does NOT match the date above, "
    "correct them WITHOUT stopping your work: fold the right date into your "
    "reply (“I'm preparing Tuesday 15 September's morning for you”) rather "
    "than pausing to redo it. NEVER repeat their mistake in your reply "
    "before correcting it next turn — the correction is immediate, in the "
    "SAME reply. "
    # #2266.14 — mirrored.
    "Before scheduling or writing an action at a date and time the person "
    "gave ambiguously, EXPLICITLY confirm date, time AND timezone before "
    "acting (“Monday 21 September at 9:30 AM, Paris time — is that right?”) "
    "rather than guessing. "
    # #2266.16-.20 — mirrored.
    "When you cite a date about a fact, NAME which one it is — never a bare "
    "date: the date of the reported FACT (when it happened), the COLLECTION "
    "date (when this information was gathered), the last VERIFICATION date "
    "(when it was last re-checked), the ANALYSIS date (when this record was "
    "computed), the PLANNED ACTION date (when a step is scheduled). Two "
    "different dates about the same fact are never collapsed under one "
    "bare word “date”."
)
_SUPPORTED_BLOCK_LANGUAGES = frozenset({"fr", "en"})


def now_in_reference_timezone(timezone: str | None = None) -> datetime:
    """L'instant courant dans le fuseau de la PERSONNE, à défaut de référence.

    ``timezone`` est le nom IANA lu sur le profil (décision de Louis du
    14/09/2026). Vide, ``None`` ou illisible ⇒ ``REFERENCE_TIMEZONE``. L'ordre
    est un ESCALIER, et jamais un choix : le fuseau de la personne, puis le
    défaut NOMMÉ du produit, puis UTC en tout dernier ressort.

    ⚠️ Pourquoi UTC reste la dernière marche même avec ``tzdata`` dans
    ``requirements.txt`` (corrigé le 14/09/2026 — CI ET PROD tournaient sur
    ``python:3.12-slim``, qui n'embarque PAS ``/usr/share/zoneinfo`` : sans le
    paquet, ``ZoneInfo("Europe/Paris")`` y levait ``ZoneInfoNotFoundError`` à
    CHAQUE tour, et le fuseau annoncé n'était jamais celui qu'il prétendait
    être — voir ``test_zoneinfo_resolves_from_the_tzdata_package_alone``) :
    un fuseau valide peut encore être absent d'une image future qui ré-épingle
    ses dépendances, ou d'un environnement qui n'a pas encore installé la
    dernière version de ce fichier. Un bloc de date ne doit jamais casser un
    tour de conversation — on retombe alors sur UTC, et le bloc ANNONCE le
    fuseau qu'il a réellement utilisé. Une heure fausse silencieusement
    étiquetée « Paris » serait pire que l'heure UTC étiquetée « UTC ».

    ⚠️ ``ValueError`` autant que ``ZoneInfoNotFoundError`` : ``ZoneInfo`` lève la
    première sur une clé MAL FORMÉE (chemin absolu, ``..``) et la seconde sur une
    clé inconnue. Le fuseau est validé à la porte de l'API
    (``updateProfileSchema``, ``packages/contracts``), mais une ligne écrite
    avant cette porte — ou à la main — ne doit pas pouvoir casser un tour.
    """
    for name in (timezone, REFERENCE_TIMEZONE):
        if not name:
            continue
        try:
            return datetime.now(ZoneInfo(name))
        except (ZoneInfoNotFoundError, ValueError):
            continue
    return datetime.now(UTC)


def resolve_applicable_timezone(
    *,
    person_timezone: str | None = None,
    contact_timezone: str | None = None,
    workspace_timezone: str | None = None,
) -> str | None:
    """#1958.2 / #1958.3 — L'ESCALIER, à UN seul endroit (GA-26).

    « Quel fuseau s'applique ICI ? » se posait déjà pour la personne seule
    (``now_in_reference_timezone`` : personne → défaut nommé → UTC). Deux
    marches manquaient :

    - #1958.2 — AUCUN fuseau n'était porté par l'ESPACE (l'ESN) : seuls
      existaient celui de la personne (#1958.1, ``profiles.timezone``) et le
      défaut produit nommé (``REFERENCE_TIMEZONE``). Une équipe dont personne
      n'a renseigné son fuseau personnel retombait directement sur Paris, même
      basée à Montréal.
    - #1958.3 — le champ ``timezone`` PAR CONTACT existait
      (``packages/contracts/src/schemas/contact.ts``) sans jamais être lu par
      le chat : aucune occurrence dans ``chat_tools.py``/``chat.py``, en
      particulier pas dans ``schedule_reminder_for_contact``.

    L'ORDRE complet, et c'est une DÉRIVATION UNIQUE plutôt que deux escaliers
    séparés qui pourraient diverger : **personne → rendez-vous → espace →
    défaut produit**. La personne gagne, parce que c'est ELLE qui tape « demain
    à 9 h » depuis SON instant présent. Le rendez-vous (le fuseau du contact
    visé par CETTE action) vient ensuite : à défaut de réglage personnel,
    mieux vaut le fuseau réel de la personne qu'on va relancer que celui, plus
    générique, de l'espace. L'espace ferme la marche avant le défaut produit
    nommé — ``now_in_reference_timezone`` reste le SEUL endroit qui sait
    convertir le nom choisi ici en instant réel (et retomber sur UTC si le nom
    est illisible) : cette fonction ne fait AUCUNE lecture d'horloge.

    Un candidat vide, ``None`` ou blanc ne compte pas — un espace qui n'a rien
    réglé (``workspaces.timezone IS NULL``) ne doit jamais gagner sur un
    candidat plus bas par accident de chaîne vide. Rien de renseigné nulle
    part ⇒ ``None``, exactement ce que ``now_in_reference_timezone`` lit déjà
    comme « rien de connu, prends le défaut nommé ».
    """
    for candidate in (person_timezone, contact_timezone, workspace_timezone):
        if candidate and candidate.strip():
            return candidate.strip()
    return None


def current_time_block(now: datetime | None = None, timezone: str | None = None, language: str | None = None) -> str:
    """Le bloc à ajouter en QUEUE du prompt système.

    ``now`` est fourni par l'appelant dans les tests (instant FIGÉ : on ne lit
    jamais l'horloge dans un test). En production, l'argument est absent.

    ``timezone`` est le fuseau de la personne (décision de Louis du
    14/09/2026) : c'est CE fuseau qui décide de quel jour est « demain » quand
    le modèle résout « relance-la demain à 9 h ». Absent ⇒ ``REFERENCE_TIMEZONE``,
    donc le comportement d'avant ce lot au bit près.

    ``language`` est la langue de l'INTERFACE (#1958.8/.14/.15), jamais devinée
    depuis le message. Absente, inconnue ou « fr » ⇒ le bloc français d'avant ce
    paramètre, au bit près — seul « en » rend un bloc en anglais (jour/mois en
    toutes lettres, heure 12h avec AM/PM). Le marqueur ISO reste INVARIANT : il
    n'est lu que par du code, jamais par la personne.
    """
    moment = now if now is not None else now_in_reference_timezone(timezone)
    # Le nom du fuseau tel que l'objet le PORTE — jamais la constante, qui
    # mentirait sur le chemin de repli.
    zone = moment.tzname() or moment.strftime("%z") or "UTC"
    iso = moment.isoformat(timespec="seconds")
    if language in _SUPPORTED_BLOCK_LANGUAGES and language == "en":
        day = f"{_WEEKDAYS_EN[moment.weekday()]} {moment.day} {_MONTHS_EN[moment.month - 1]} {moment.year}"
        hour_12 = moment.hour % 12 or 12
        period = "AM" if moment.hour < 12 else "PM"
        hour = f"{hour_12}:{moment.minute:02d} {period}"
        return (
            f"\n\nCURRENT DATE AND TIME — {day}, {hour} "
            f"(timezone {zone}, {CURRENT_TIME_ISO_MARKER}{iso}).\n{_READING_RULES_EN}"
        )
    day = f"{_WEEKDAYS[moment.weekday()]} {moment.day} {_MONTHS[moment.month - 1]} {moment.year}"
    hour = f"{moment.hour} h {moment.minute:02d}"
    return (
        f"\n\nDATE ET HEURE COURANTES — {day}, {hour} "
        f"(fuseau {zone}, {CURRENT_TIME_ISO_MARKER}{iso}).\n{_READING_RULES}"
    )
