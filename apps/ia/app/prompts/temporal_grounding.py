"""#2920 (#2266.7/.8/.10) — CONTEXTE TEMPOREL PAR TOUR : jours fériés utiles,
période du workspace et dernière collecte connue.

``current_time.py`` porte déjà la date/l'heure/le fuseau/le jour de semaine
(#1995, #1958). Il manquait trois faits que #2266 nomme explicitement dans la
même liste (« CONTEXTE TEMPOREL PAR TOUR ») : le prochain jour férié qui
compte pour une prise de rendez-vous proche, depuis quand cet espace utilise
le produit, et quand sa dernière collecte de données a réussi — sans ces
trois faits, Laura peut proposer un créneau un jour férié, parler d'un
historique que l'espace n'a pas, ou sous-entendre une fraîcheur de données
qu'aucun compte de l'espace n'a jamais eue.

⚠️ MÊME DISCIPLINE que ``current_time.py`` : ce bloc part en QUEUE du prompt,
dans le segment VOLATIL (GA-293) — poser un jour férié dans le segment mis en
cache ferait rater le cache à chaque tour puisque le jour change. Vide (aucune
date de création d'espace connue, et aucun jour férié dans la fenêtre utile) ⇒
bloc byte-identique à une chaîne vide.

Jours fériés FRANÇAIS uniquement (calcul pur, Pâques par l'algorithme
grégorien anonyme — aucune dépendance, aucun appel réseau) : c'est le seul
calendrier que le produit connaît aujourd'hui (même défaut nommé que
``REFERENCE_TIMEZONE``, ``Europe/Paris``, dans ``current_time.py``).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from app.prompts.current_time import _MONTHS, _MONTHS_EN  # noqa: PLC2701 — même table, un seul endroit (GA-26)

#: Combien de jours à l'avance un jour férié devient « utile » à annoncer —
#: au-delà, il n'aide personne à planifier un rendez-vous cette semaine-ci ou
#: la suivante, et l'annoncer noierait le bloc dans du bruit lointain.
_USEFUL_HOLIDAY_WINDOW_DAYS = 45


def _easter_sunday(year: int) -> date:
    """Dimanche de Pâques — algorithme grégorien anonyme (pas de dépendance).

    Purement arithmétique, vérifiable à la main : aucune table figée à tenir
    à jour d'année en année, contrairement à une liste écrite en dur.
    """
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ll = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ll) // 451
    month = (h + ll - 7 * m + 114) // 31
    day = ((h + ll - 7 * m + 114) % 31) + 1
    return date(year, month, day)


#: Nom FR/EN de chaque jour férié — dans l'ordre de l'année, pour un test
#: lisible. Les jours mobiles (Pâques et dérivés) sont calculés séparément.
_FIXED_HOLIDAYS: tuple[tuple[int, int, str, str], ...] = (
    (1, 1, "Jour de l'an", "New Year's Day"),
    (5, 1, "Fête du travail", "Labour Day"),
    (5, 8, "Victoire 1945", "Victory in Europe Day"),
    (7, 14, "Fête nationale", "Bastille Day"),
    (8, 15, "Assomption", "Assumption Day"),
    (11, 1, "Toussaint", "All Saints' Day"),
    (11, 11, "Armistice 1918", "Armistice Day"),
    (12, 25, "Noël", "Christmas Day"),
)


def french_public_holidays(year: int) -> list[tuple[date, str, str]]:
    """Les onze jours fériés français de l'année, triés — (date, libellé FR, libellé EN)."""
    easter = _easter_sunday(year)
    mobile: list[tuple[date, str, str]] = [
        (easter + timedelta(days=1), "Lundi de Pâques", "Easter Monday"),
        (easter + timedelta(days=39), "Ascension", "Ascension Day"),
        (easter + timedelta(days=50), "Lundi de Pentecôte", "Whit Monday"),
    ]
    fixed = [(date(year, month, day), fr, en) for month, day, fr, en in _FIXED_HOLIDAYS]
    return sorted([*fixed, *mobile], key=lambda row: row[0])


def next_useful_holiday(
    moment: datetime, *, window_days: int = _USEFUL_HOLIDAY_WINDOW_DAYS
) -> tuple[date, str, str] | None:
    """Le prochain jour férié dans la fenêtre utile, ou `None`.

    Regarde l'année courante ET la suivante (un 20 décembre doit pouvoir
    trouver le 1er janvier suivant) ; ne rend JAMAIS un jour férié déjà passé.
    """
    today = moment.date()
    horizon = today + timedelta(days=window_days)
    candidates = [*french_public_holidays(today.year), *french_public_holidays(today.year + 1)]
    upcoming = [row for row in candidates if today <= row[0] <= horizon]
    return min(upcoming, key=lambda row: row[0]) if upcoming else None


def _format_day(d: date, *, language: str) -> str:
    months = _MONTHS_EN if language == "en" else _MONTHS
    return f"{d.day} {months[d.month - 1]} {d.year}"


def temporal_grounding_block(
    moment: datetime,
    *,
    workspace_created_at: str | None = None,
    workspace_last_sync_at: str | None = None,
    language: str = "fr",
) -> str:
    """Le bloc additif « jours fériés utiles + période du workspace » (#2266.7/.8/.10).

    Chaque fait est INDÉPENDANT : l'un peut manquer sans faire disparaître
    les autres. Tous absents ⇒ chaîne vide, prompt byte-identique.
    """
    lines: list[str] = []
    holiday = next_useful_holiday(moment)
    if holiday is not None:
        d, label_fr, label_en = holiday
        if language == "en":
            lines.append(f"Next public holiday: {label_en}, {_format_day(d, language='en')}.")
        else:
            lines.append(f"Prochain jour férié : {label_fr}, le {_format_day(d, language='fr')}.")

    if workspace_created_at:
        try:
            created = datetime.fromisoformat(workspace_created_at.replace("Z", "+00:00"))
        except ValueError:
            created = None
        if created is not None:
            if language == "en":
                lines.append(
                    f"This workspace has been using Bellum since {_format_day(created.date(), language='en')} "
                    "— never imply a longer history than that."
                )
            else:
                lines.append(
                    f"Cet espace utilise Bellum depuis le {_format_day(created.date(), language='fr')} "
                    "— ne sous-entends jamais un historique plus ancien que celui-ci."
                )

    if workspace_last_sync_at:
        try:
            synced = datetime.fromisoformat(workspace_last_sync_at.replace("Z", "+00:00"))
        except ValueError:
            synced = None
        if synced is not None:
            if language == "en":
                lines.append(
                    f"Last known successful data sync for this workspace: {_format_day(synced.date(), language='en')} "
                    "— accounts not re-synced since then still show their data as of that date."
                )
            else:
                lines.append(
                    f"Dernière collecte de données réussie connue pour cet espace : le "
                    f"{_format_day(synced.date(), language='fr')} — un compte non rejoué depuis reste sur "
                    "les données de cette date."
                )

    if not lines:
        return ""
    heading = "PÉRIODE ET JOURS FÉRIÉS" if language != "en" else "PERIOD AND PUBLIC HOLIDAYS"
    return "\n\n" + heading + " — " + " ".join(lines)
