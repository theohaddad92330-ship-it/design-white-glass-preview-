"""Deterministic signal freshness (Théo restitution p.7 / p.12).

A commercial signal older than ~24 months is an ARCHIVE, not a live trigger:
"Signal 2021 à classer archive, pas 'à relancer'" / "Signal commercial par
défaut : 24 mois max. Plus ancien = archive." This module classifies each
``recentSignal`` by the age of its ``date`` so the front can badge it and the
plan can stop treating a 2021 press release as an immediate action.

Undated signals stay ``undated`` (honest — never assumed current). Same compute
philosophy as account_score / truth_status: rules over the output, no LLM call.
"""

from __future__ import annotations

import calendar
import re
import unicodedata
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime, timedelta

# ── Ce que `date` sait lire (#4647) ──────────────────────────────────────────
#
# ⚠️ JUMEAU TypeScript : `signalDateMs` (packages/contracts/src/schemas/account.ts) lit les MÊMES
# formes pour l'archivage de repli et le digest de veille — corriger l'une sans l'autre laisse
# l'autre mentir (#4647 côté Python, #4716 côté TS). Même règle d'ancrage des deux côtés, et
# depuis #4832 même ancrage de période : une date incomplète vaut la FIN de sa période (dernier
# jour du mois, 31/12 pour l'année seule). Cas partagés : `signal-date-ms.test.ts` ↔
# `tests/test_signal_freshness.py`.
#
# La PREMIÈRE année de la chaîne (19xx/20xx) ancre la lecture, et seules ces
# formes sont reconnues autour d'elle :
#   - numérique collé à l'année : "2026-10-23", "2026/10/23", "2026-10"  (jour / mois)
#   - en toutes lettres, mois FRANÇAIS : "23 octobre 2026", "1er octobre 2026",
#     "1 janv. 2026", "OCTOBRE 2026", accentué ou non, majuscules ou non, avec ou
#     sans le point de l'abréviation (jour optionnel → précision "jour" ou "mois")
#   - plage d'années : "2023-2024" → l'année de FIN
#   - année seule : "2024", "2024 (comptes déposés 2025-11)" → 2024, pas 2025-11
# Pas lus : les mois anglais ("October 23, 2026" ne rend que l'année — « à mesurer
# avant d'élargir », #4647), "23/10/2026" (jour/mois/année) et tout texte sans année
# ("Non daté précisément" → undated).
#
# Une date incomplète n'est JAMAIS ramenée au 1er janvier : année seule → 31
# décembre (précision "année"), mois + année → dernier jour du mois (précision
# "mois"). Le choix est conservateur : il ne vieillit pas un fait par défaut.
_YEAR = r"(?:19|20)\d{2}"
_NUMERIC_RE = re.compile(rf"(?P<y1>{_YEAR})[-–/](?P<y2>{_YEAR})(?!\d)|(?P<y>{_YEAR})(?:[-/](?P<m>\d{{1,2}})(?!\d)(?:[-/](?P<d>\d{{1,2}})(?!\d))?)?")
_TEXT_RE = re.compile(rf"(?<!\d)(?:(?P<d>\d{{1,2}})(?:er|ère)?\s+)?(?P<mon>[^\W\d_]{{3,9}})\.?\s+(?P<y>{_YEAR})(?!\d)")
_MONTHS_FR: dict[str, int] = {
    "janvier": 1, "janv": 1, "fevrier": 2, "fevr": 2, "fev": 2, "mars": 3, "avril": 4, "avr": 4,
    "mai": 5, "juin": 6, "juillet": 7, "juil": 7, "aout": 8, "septembre": 9, "sept": 9,
    "octobre": 10, "oct": 10, "novembre": 11, "nov": 11, "decembre": 12, "dec": 12,
}  # fmt: skip

PRECISION_DAY = "jour"
PRECISION_MONTH = "mois"
PRECISION_YEAR = "année"

# > ~24 months old = archive (Théo: "signal commercial par défaut : 24 mois max").
# C'est le défaut, appliqué à tout signal dont le type n'est pas reconnu.
_ARCHIVE_AFTER_DAYS = 730

# ── Fenêtres de fraîcheur PAR TYPE (PDF 2, items 90-97 — décision de Louis) ──
#
# La fenêtre unique de 24 mois faisait remonter des signaux morts comme s'ils
# étaient frais : une offre d'emploi de vingt mois est pourvue ou abandonnée, un
# incident de deux ans ne s'évoque plus, alors qu'une échéance réglementaire
# porte encore. Traiter les neuf types de la même façon rend le compteur de
# signaux à peu près inutile pour décider quoi faire aujourd'hui.
#
# Les types sont ceux que le prompt `bellum_signals` produit RÉELLEMENT, pas
# ceux d'un document — un type inventé ici ne matcherait jamais.
#
# ⚠️ La sûreté tient à une seule ligne : un type absent ou inconnu retombe sur
# les 730 jours historiques. Un signal non typé est donc classé EXACTEMENT
# comme avant, et rien ne bouge sur les dossiers qui n'ont pas de type.
_ARCHIVE_AFTER_DAYS_BY_TYPE: dict[str, int] = {
    # Un dirigeant nommé reste « nouveau » environ un an : c'est la fenêtre où
    # l'approche « je vous ai vu prendre le poste » a encore du sens.
    "nomination": 365,
    # Une offre d'emploi de plus de six mois est pourvue ou abandonnée. La citer
    # fait passer le commercial pour quelqu'un qui n'a pas regardé.
    "recrutement": 180,
    # Un budget voté se dépense sur l'exercice ; au-delà, il est engagé ailleurs.
    "budget": 365,
    # Un programme court longtemps — c'est même ce qui en fait un bon angle.
    "projet": 545,
    # Un incident s'évoque tant qu'il est dans les mémoires, pas au-delà.
    "incident": 180,
    # Une échéance réglementaire porte loin : on garde le défaut.
    "regulation": 730,
    # L'intégration post-acquisition dure, et c'est là que les besoins naissent.
    "acquisition": 545,
    "partenariat": 545,
    # Une restructuration se digère en un an ; ensuite, c'est l'organigramme
    # actuel qui parle, pas le mouvement qui l'a produit.
    "restructuration": 365,
    # LAU-FINAL-212 (#3206.6) — quatre types RÉELLEMENT émis par le prompt
    # (`bellum_signals.py`, champ `type`) tombaient sur le défaut générique de
    # 730 jours sans qu'aucune raison écrite ne le justifie : un signal APPELÉ
    # mais jamais COUVERT.
    # Un investissement annoncé s'engage sur l'exercice, même logique que budget.
    "investissement": 365,
    # Une transformation (SI, métier) court longtemps — même logique que projet.
    "transformation": 545,
    # Un déménagement est ponctuel, mais les besoins d'infrastructure qu'il
    # ouvre (réseau, postes, sécurité du nouveau site) restent d'actualité
    # environ un an, comme une nomination.
    "demenagement": 365,
    # Un changement d'organisation se digère en un an, même fenêtre que la
    # restructuration dont il est la même famille de signal.
    "organisation": 365,
    # Des fonds levés se déploient sur plusieurs trimestres, pas un exercice —
    # même fenêtre qu'un projet ou une intégration post-acquisition.
    "levee_fonds": 545,
    # Un appel d'offres est attribué ou classé sans suite en quelques mois ;
    # au-delà, l'approche "vous avez un appel d'offres en cours" est fausse.
    "appel_offres": 180,
    # Une techno observée reste une lecture valable de la stack en place
    # environ un an, comme une nomination reste "récente" un an.
    "technologie": 365,
    # Une personne mentionnée reste un contact "nouveau" dans l'orbite du
    # compte environ un an — même fenêtre que nomination.
    "contact": 365,
    # Un recours externe (sous-traitance, prestataire déjà en place) est une
    # intégration qui dure, comme un partenariat.
    "recours_externe": 545,
}


def archive_after_days(signal_type: object) -> int:
    """La fenêtre de fraîcheur d'un type de signal, en jours.

    Un type absent, vide ou inconnu rend le défaut historique — c'est ce qui
    garantit qu'aucun signal existant ne change de classement par surprise.
    """
    key = str(signal_type or "").strip().lower()
    return _ARCHIVE_AFTER_DAYS_BY_TYPE.get(key, _ARCHIVE_AFTER_DAYS)


FRESHNESS_CURRENT = "current"
FRESHNESS_ARCHIVE = "archive"
FRESHNESS_UNDATED = "undated"

# ── Statuts temporels nommés (#3206.3, épopée #3240) ──────────────────────────
#
# ADDITIF à `freshness` : un lecteur existant (web + API) qui compare
# littéralement à 'archive'/'current'/'undated' ne doit RIEN voir bouger — même
# geste que `evidence_origins` sur `accountPartnerSchema` (champ optionnel en
# plus, jamais un remplacement de `freshness`).
#
# Seuls 4 des 6 statuts nommés par #3206 sont émis : CURRENT_VERIFIED suppose
# un événement de vérification (`last_verified_at`) qu'aucun pipeline n'écrit
# aujourd'hui, SUPERSEDED suppose une détection de doublon inter-signaux qui
# n'existe pas non plus. Les deux ne sont pas devinés ici — ils restent "reste"
# (commentaire de clôture de #3240) tant que ces capacités n'existent pas.
TEMPORAL_RECENT = "RECENT"
TEMPORAL_HISTORICAL = "HISTORICAL"
TEMPORAL_STALE = "STALE"
TEMPORAL_UNDATED = "UNDATED"

# Types dont le signal, une fois périmé, reste un ÉTAT passé utile de contexte
# plutôt qu'une fenêtre d'action manquée — "une personne ayant travaillé chez
# le compte n'est pas un contact actuel" (#3206) n'en fait pas un fait sans
# valeur. Tout type absent de cet ensemble (y compris un type inconnu) est
# TIME-LIMITED : périmé, il ne soutient plus une décision actuelle (STALE).
#
# demenagement/organisation rejoignent restructuration (implantation/logique
# d'orga actuelles, encore vraies après la fenêtre) ; levee_fonds/contact
# rejoignent nomination/partenariat (fait biographique/relationnel qui reste
# vrai) ; recours_externe rejoint partenariat/acquisition (intégration qui
# dure) ; technologie décrit une stack en place, même lecture que nomination.
_STATE_SIGNAL_TYPES: frozenset[str] = frozenset(
    {
        "nomination",
        "partenariat",
        "restructuration",
        "acquisition",
        "demenagement",
        "organisation",
        "levee_fonds",
        "contact",
        "recours_externe",
        "technologie",
    }
)


def _month_number(word: str) -> int | None:
    plain = unicodedata.normalize("NFKD", word.lower()).encode("ascii", "ignore").decode()
    return _MONTHS_FR.get(plain)


def _read_parts(value: object) -> tuple[int, int | None, int | None] | None:
    """(année, mois, jour) tels que LUS dans la chaîne, ``None`` pour ce qui manque.

    Une seule lecture, deux lecteurs au-dessus (début / fin de période) : elles ne
    peuvent pas diverger sur ce qu'une chaîne contient (GA-26)."""
    text = str(value or "")
    first = _NUMERIC_RE.search(text)
    if not first:
        return None
    if first.group("y1"):
        return int(first.group("y2")), None, None
    # Une date en toutes lettres ne compte que si SON année est la première de la chaîne.
    for m in _TEXT_RE.finditer(text):
        if m.start("y") == first.start("y"):
            month = _month_number(m.group("mon"))
            if month is not None:
                return int(m.group("y")), month, int(m.group("d")) if m.group("d") else None
    month = int(first.group("m")) if first.group("m") else None
    day = int(first.group("d")) if first.group("d") else None
    return int(first.group("y")), month, day


def _build(year: int, month: int, day: int | None, *, end_of_period: bool) -> date | None:
    month = min(12, max(1, month))
    try:
        # Le jour se borne au dernier jour RÉEL du mois (31/04 → 30/04), jamais à 28 :
        # garde 0e4d70595c, `min(28, day)` reculait toute date de fin de mois (29-31).
        last_day = calendar.monthrange(year, month)[1]
        if day is None:
            day = last_day if end_of_period else 1
        return date(year, month, min(last_day, max(1, day)))
    except ValueError:
        return None


def read_signal_date(value: object) -> tuple[date, str] | None:
    """(date, précision) d'une date de signal, ``None`` si aucune année (→ undated).

    La précision (``jour`` / ``mois`` / ``année``) dit ce que la chaîne contenait
    VRAIMENT ; une date incomplète vaut la FIN de sa période (31/12, dernier jour
    du mois), jamais son début (#4647, tranché par Louis le 27/10)."""
    parts = _read_parts(value)
    if parts is None:
        return None
    year, month, day = parts
    if month is None:
        d = _build(year, 12, 31, end_of_period=True)
        return (d, PRECISION_YEAR) if d else None
    d = _build(year, month, day, end_of_period=True)
    return (d, PRECISION_DAY if day is not None else PRECISION_MONTH) if d else None


def _parse_signal_date(value: object) -> date | None:
    """Début de période de la date lue (mois/jour absents → 1), ou ``None`` sans année.

    Conservé pour ``source_judge`` (âge d'une source). Le CLASSEMENT de fraîcheur et
    ``valid_from`` passent par :func:`read_signal_date`, qui prend la FIN de période."""
    parts = _read_parts(value)
    if parts is None:
        return None
    year, month, day = parts
    return _build(year, month or 1, day, end_of_period=False)


def classify_signal_freshness(date_str: object, *, today: date | None = None, signal_type: object = None) -> str:
    """``current`` / ``archive`` / ``undated`` for one signal date.

    La fenêtre dépend du TYPE quand il est reconnu (une offre d'emploi vieillit
    plus vite qu'une échéance réglementaire) ; sinon elle vaut les ~24 mois
    historiques. Une date future ou absente n'est jamais une archive.
    """
    today = today or datetime.now(UTC).date()
    read = read_signal_date(date_str)
    if read is None:
        return FRESHNESS_UNDATED
    d = read[0]
    if d > today:
        return FRESHNESS_CURRENT  # future-dated (LLM slip) — not an archive
    return FRESHNESS_ARCHIVE if (today - d).days > archive_after_days(signal_type) else FRESHNESS_CURRENT


def classify_temporal_status(date_str: object, *, today: date | None = None, signal_type: object = None) -> str:
    """``RECENT`` / ``HISTORICAL`` / ``STALE`` / ``UNDATED`` for one signal date.

    Additif à :func:`classify_signal_freshness` : granularité plus fine sur le
    même calcul (jamais un second calcul divergent). ``CURRENT_VERIFIED`` et
    ``SUPERSEDED`` ne sont jamais renvoyés — voir la note au-dessus de
    ``TEMPORAL_RECENT``.
    """
    today = today or datetime.now(UTC).date()
    freshness = classify_signal_freshness(date_str, today=today, signal_type=signal_type)
    if freshness == FRESHNESS_UNDATED:
        return TEMPORAL_UNDATED
    if freshness == FRESHNESS_CURRENT:
        # Jamais CURRENT_VERIFIED : une observation n'est pas une vérification.
        return TEMPORAL_RECENT
    # FRESHNESS_ARCHIVE
    key = str(signal_type or "").strip().lower()
    return TEMPORAL_HISTORICAL if key in _STATE_SIGNAL_TYPES else TEMPORAL_STALE


def stamp_signals_freshness(signals: Iterable[Mapping[str, object]] | None, *, today: date | None = None) -> list[dict]:
    """Return the signals with a deterministic ``freshness`` stamped on each,
    derived from its ``date``. Non-mapping entries are dropped.

    Ajoute aussi, additivement (#3206.2/#3206.3, épopée #3240) :
    - ``temporal_status`` : granularité plus fine sur le même calcul.
    - ``freshness_window_days`` : la fenêtre (en jours) qui a servi à ce calcul
      pour CE type — déjà calculée en interne par :func:`archive_after_days`,
      simplement exposée : un ``freshness_window`` par signal (#3206.2) sans
      invention, puisque c'est exactement la valeur qui a décidé son statut.
    - ``valid_from`` / ``valid_to`` (#3206.2, reste du 30/09) : deux des neuf
      champs de métadonnées temporelles par affirmation nommés par l'issue.
      ``valid_from`` est la date du signal elle-même, ANALYSÉE puis reformatée
      en ISO — le fait devient valide le jour où il est observé, jamais une
      date inventée. ``valid_to`` est ``valid_from + freshness_window_days`` :
      exactement la frontière qui a déjà décidé ``current``/``archive`` pour ce
      type, exposée telle quelle plutôt que recalculée deux fois (GA-26).
      ``date_precision`` (#4647) : ``jour`` / ``mois`` / ``année``, ce que la date
      contenait vraiment ; une date incomplète vaut la FIN de sa période (garde
      #3206.2/#3240 : mêmes champs, seule la valeur est corrigée).
      Absents (jamais ``None`` explicite) sur un signal ``undated`` : sans
      date analysable, il n'y a rien à borner.
    """
    out: list[dict] = []
    for s in signals or []:
        if isinstance(s, Mapping):
            item = dict(s)
            signal_type = item.get("type")
            item["freshness"] = classify_signal_freshness(item.get("date"), today=today, signal_type=signal_type)
            item["temporal_status"] = classify_temporal_status(item.get("date"), today=today, signal_type=signal_type)
            item["freshness_window_days"] = archive_after_days(signal_type)
            read = read_signal_date(item.get("date"))
            if read is not None:
                parsed, item["date_precision"] = read
                item["valid_from"] = parsed.isoformat()
                item["valid_to"] = (parsed + timedelta(days=item["freshness_window_days"])).isoformat()
            out.append(item)
    return out


#: Le type d'une offre d'emploi pour la fenêtre de fraîcheur (180 jours) : les
#: collecteurs d'offres ne posent pas de ``type``, et un type absent retomberait
#: sur les 730 jours — une offre de dix-huit mois resterait « courante » (#4760).
JOB_OFFER_SIGNAL_TYPE = "recrutement"


def stamp_job_offers_freshness(offers: Iterable[Mapping[str, object]] | None, *, today: date | None = None) -> list[dict]:
    """Estampille les offres d'emploi (``itJobSignals``) comme les signaux.

    Avant #4760 seuls ``recentSignals`` passaient par :func:`stamp_signals_freshness` :
    la fenêtre de 180 jours du recrutement ne s'appliquait à aucune offre. Le
    ``type`` n'est posé que POUR le calcul : il n'apparaît pas en sortie si
    l'offre n'en portait pas (aucune clé inventée sur l'offre).
    """
    out: list[dict] = []
    for offer in offers or []:
        if not isinstance(offer, Mapping):
            continue
        typed = {**offer, "type": offer.get("type") or JOB_OFFER_SIGNAL_TYPE}
        stamped = stamp_signals_freshness([typed], today=today)[0]
        if not offer.get("type"):
            stamped.pop("type", None)
        out.append(stamped)
    return out
