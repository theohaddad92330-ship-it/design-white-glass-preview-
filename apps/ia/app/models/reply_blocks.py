"""#1914 — les cartes d'une réponse de Laura, miroir pydantic du contrat.

Source : ``packages/contracts/src/schemas/reply-blocks.ts`` (zod). Le service IA
n'a pas le paquet contracts à l'exécution, donc il porte cette copie — et une
copie que rien ne vérifie finit par diverger. ``tests/test_reply_blocks.py``
traverse le MÊME jeu ``reply-blocks.fixtures.json`` que le test zod : chaque
bloc valide doit ressortir identique des deux côtés.

⚠️ POURQUOI L'ÉGALITÉ STRICTE ET PAS « ÇA VALIDE ». pydantic ignore les clés
inconnues (``extra="ignore"``, voulu ici : un score ou une probabilité glissés
par le modèle DOIVENT disparaître). Mais le même mécanisme avale en silence un
champ que le contrat déclare et que ce miroir aurait oublié : demandé par le
prompt, produit par le modèle, payé… et jamais affiché. Seule l'égalité avec le
jeu partagé le voit.

Ce que le miroir refuse, comme le contrat :
  - un type inconnu ou absent ;
  - un classement sans axes nommés, une liste vide ;
  - une ligne de comparaison qui n'a pas une cellule par colonne ;
  - un lien qui sort de l'application (``//``, ``https:``, ``..``) ;
  - une probabilité écrite en toutes lettres (``c26_probabilite``).
Et ce qu'il normalise : ``null`` redevient absent, une cellule vide redevient
``null`` (« non mesuré », jamais « 0 »).
"""

import re
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    TypeAdapter,
    ValidationError,
    model_validator,
)

REPLY_BLOCK_TYPES: tuple[str, ...] = (
    "verdict",
    "account_ranking",
    "contact_list",
    "comparison",
    "action_plan",
    "consultant_shortlist",
    "meeting_brief",
    # #3340 — le brief provisoire d'un consultant décrit par morceaux, ses
    # douze champs. Miroir de `reply-blocks.ts`.
    "consultant_brief",
    "missing_data",
    # #2271.16/.19/.20 — miroir de `reply-blocks.ts`. Mêmes trois sorties,
    # même raison : réutiliser une donnée déjà calculée (briefing de compte,
    # timeline de compte, une liste déjà produite), jamais un calcul neuf.
    "account_card",
    "timeline",
    "file_export",
    # #2429.13 — l'approche commerciale, en champs validés.
    "approach",
    # #3392 / #3428 (reste, recette prod 30/09) — le sprint 10 dont 3, chacun
    # avec pourquoi maintenant / porte d'entrée / premier mouvement. Miroir de
    # `reply-blocks.ts`.
    "account_volume_sprint",
    # #213.2 (#3207, épopée #3228) — le contrat de comptage, en carte. Miroir
    # de `reply-blocks.ts`.
    "count_contract",
    # #3758.2 (BEL-LAU-1001) — la cartographie de comptes d'un périmètre.
    # Miroir de `reply-blocks.ts`.
    # #3762 (BEL-LAU-1005) — le gabarit canonique d'une cartographie de
    # comptes. Miroir de `reply-blocks.ts`.
    "account_map",
    # #3758 (BEL-LAU-1001, reste du lot J14) — le compte rendu de rendez-vous
    # déjà ENREGISTRÉ (`notes.meeting_recap_snapshot`), jamais le texte libre
    # du modèle. Miroir de `reply-blocks.ts`.
    "post_meeting_summary",
    # #2985 (lot E07 08/10) — la revue de compte MANAGER sur UN compte NOMMÉ,
    # bâtie du seul résultat de `get_account_manager_review`. Miroir de
    # `reply-blocks.ts`.
    "manager_review",
)

# ⚠️ Même motif, mot pour mot, que `PROBABILITY_WORDING` dans reply-blocks.ts.
_PROBABILITY_WORDING = re.compile(
    r"probabilit|likelihood|chances?\s+de\s+(?:signer|signature|closing|conclure|gagner|succès|réussir|réussite|remporter)"
    r"|\bwin\s+rate\b",
    re.IGNORECASE,
)


def mentions_probability(text: str) -> bool:
    return bool(_PROBABILITY_WORDING.search(text))


def _text(max_length: int) -> type[str]:
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]  # type: ignore[return-value]


T40 = _text(40)
T60 = _text(60)
T80 = _text(80)
T120 = _text(120)
T160 = _text(160)
T200 = _text(200)
T300 = _text(300)
T400 = _text(400)
# #4424.4 — le pitch de réunion : cinq phrases au plus.
T600 = _text(600)


def _app_path(value: str) -> str:
    path = value.strip()
    if len(path) > 300 or ".." in path or not re.fullmatch(r"/(?![/\\])\S*", path):
        raise ValueError("un lien de carte reste un chemin de l'application")
    return path


def _web_url(value: str) -> str:
    """Théo B l1-laura — le lien d'une source : une page https de l'éditeur, jamais un schéma exécutable."""
    url = value.strip()
    if len(url) > 500 or not re.fullmatch(r"https://[^\s/$.?#][^\s]*", url, flags=re.IGNORECASE):
        raise ValueError("le lien d'une source est une page web https")
    return url


def _iso_date(value: str) -> str:
    date = value.strip()
    if not re.fullmatch(r"\d{4}(?:-\d{2}(?:-\d{2})?)?", date):
        raise ValueError("une date de source se relit : 2026, 2026-07 ou 2026-07-03")
    return date


def _iso_datetime(value: str) -> str:
    """Un horodatage RÉEL d'événement (#2271.19) — jamais une date devinée."""
    stamp = value.strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?", stamp):
        raise ValueError("un événement de timeline porte une date ISO 8601 complète")
    return stamp


def _file_name(value: str) -> str:
    """Un nom de fichier (#2271.20) — jamais un chemin."""
    name = value.strip()
    if not name or len(name) > 120 or "/" in name or "\\" in name or ".." in name:
        raise ValueError("un fichier exportable porte un NOM, jamais un chemin")
    return name


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        return value.strip() or None
    return value


AppPath = Annotated[str, AfterValidator(_app_path)]
WebUrl = Annotated[str, AfterValidator(_web_url)]
IsoDate = Annotated[str, AfterValidator(_iso_date)]
IsoDateTime = Annotated[str, AfterValidator(_iso_datetime)]
FileName = Annotated[str, AfterValidator(_file_name)]
# `null` = non mesuré. Une chaîne vide aussi : ce n'est jamais « 0 ».
Cell = Annotated[Annotated[str, StringConstraints(max_length=200)] | None, BeforeValidator(_blank_to_none)]


class _Card(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CardAction(_Card):
    label: T120
    href: AppPath | None = None


class CardSource(_Card):
    label: T80
    as_of: IsoDate | None = None
    # #3776.5 (lot K05, 07/10) — le FONDEMENT de la citation : `proof` (un fait
    # vérifié par un outil), `interpretation` (une lecture du modèle, jamais
    # une preuve indépendante) ou `history` (un fait daté, passé — jamais relu
    # comme un signal actuel). Miroir de `sourceSchema` (reply-blocks.ts) ;
    # absent = non qualifié, le prompt ne le remplit pas encore partout.
    basis: Literal["proof", "interpretation", "history"] | None = None
    # Théo B l1-laura — le lien vers la page de l'éditeur ; miroir de `webUrl` (reply-blocks.ts).
    url: WebUrl | None = None


# #3395.1 (recette prod 30/09/2026) — miroir de `verdictContactSchema`
# (reply-blocks.ts) : la personne utile MAINTENANT sur ce verdict, jamais
# devinée.
class VerdictContact(_Card):
    name: T120
    role: T120 | None = None
    href: AppPath | None = None


class VerdictBlock(_Card):
    type: Literal["verdict"]
    conclusion: T300
    reasons: Annotated[list[T400], Field(min_length=1, max_length=6)]
    limits: Annotated[list[T400], Field(max_length=6)] | None = None
    # #3395.1 — la route recommandée : une PHRASE (le périmètre d'approche,
    # l'ordre), jamais un chemin d'application — distincte de `conclusion`
    # (le verdict) et de `next_action` (le prochain geste).
    route: T300 | None = None
    contact: VerdictContact | None = None
    next_action: CardAction | None = None


# #3816.2 — miroir de `follow_ups` (reply-blocks.ts) : une SUITE de la conversation depuis un
# compte classé. Cliquer envoie `ask` à Laura ; rien n'est envoyé à un tiers.
class CardFollowUp(_Card):
    label: T120
    ask: T400
    # #4397 (N1) — l'identifiant du consultant du vivier, en MÉTADONNÉE : le texte `ask` n'en porte jamais.
    talent_id: (
        Annotated[str, Field(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
        | None
    ) = None


# #4421.15 — miroir de `outsidePersonRevealCardSchema` (outside-person-reveal.ts) : les personnes trouvées HORS de
# l'espace, révélables au clic. `person_ref` est la référence OPAQUE de la source, jamais affichée.
class RevealPerson(_Card):
    name: T120
    title: T120 | None = None
    person_ref: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    mail_to: bool | None = None


class RevealPeople(_Card):
    siren: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{9}$")] | None = None
    people: Annotated[list[RevealPerson], Field(min_length=1, max_length=3)]


class RankedOffer(_Card):
    """#4642 — miroir de `offers` (reply-blocks.ts) : une offre relevée, telle que la ligne l'affiche."""

    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    date: IsoDate | None = None


class RankedAccount(_Card):
    name: T120
    href: AppPath | None = None
    # #1914.13 — pas de `website` : le logo d'un compte vient de sa fiche
    # ENREGISTRÉE, jamais d'un domaine écrit par le modèle.
    verdict: T300 | None = None
    why: Annotated[list[T400], Field(min_length=1, max_length=5)]
    why_now: T400 | None = None
    limits: Annotated[list[T400], Field(max_length=5)] | None = None
    # #3247.r40 — T400 (était T80) : « aucun partenaire déclaré… » ne se tronque pas.
    not_evaluated: Annotated[list[T400], Field(max_length=6)] | None = None
    action: CardAction | None = None
    source: CardSource | None = None
    # #3764 (lot L1 07/10) — le NIVEAU d'un compte classé, trois badges du vocabulaire fermé
    # (`reply-badges.ts`) : dérivé par le SERVEUR de la catégorie que l'outil a rendue
    # (`known_shape_gate`), jamais deviné. Absent = aucun badge.
    level: Literal["priority", "to_watch", "to_qualify"] | None = None
    follow_ups: Annotated[list[CardFollowUp], Field(min_length=1, max_length=10)] | None = None  # #4421.3 : 10 contacts
    # #3704.2 — « déjà dans ton espace » vs « nouvelle cible » : calculé par
    # `chat_tools._run_account_search` (rapprochement SIREN), jamais deviné ici.
    # Absent = appartenance non vérifiée pour cette ligne.
    already_in_workspace: bool | None = None
    # #4432.3 — le palier de zone d'un compte élargi (« à 38 km de Toulouse »), posé par le serveur.
    zone_label: T80 | None = None
    # #4642 — les offres relevées qui ont fait sortir CE compte (intitulé + date), posées par le SERVEUR.
    offers: Annotated[list[RankedOffer], Field(max_length=10)] | None = None
    # #4421.15 — posé par le SERVEUR (`known_shape_gate`) depuis la sortie de l'outil, jamais par le modèle.
    reveal: RevealPeople | None = None


class SearchZone(_Card):
    """#4432.3 — la zone de la recherche (libellés) : elle voyage avec le nom vers le dossier."""

    city: T120 | None = None
    departments: Annotated[list[T60], Field(max_length=20)] | None = None
    regions: Annotated[list[T60], Field(max_length=18)] | None = None


class TalentContext(_Card):
    """#4642 — miroir de `talent_context` : la demande dont la carte est la réponse. Elle PRIORISE l'analyse,
    elle ne devient jamais un périmètre (la zone n'est qu'un libellé)."""

    talent_id: (
        Annotated[str, Field(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
        | None
    ) = None
    talent_name: T120 | None = None
    skills: Annotated[list[T60], Field(max_length=20)] | None = None
    zone: T120 | None = None


class AccountRankingBlock(_Card):
    type: Literal["account_ranking"]
    title: T120 | None = None
    # #3769 — l'identifiant STABLE de la carte : deux cartes de même `card_id` dans un fil sont la même
    # carte, la dernière remplace la précédente à l'écran. Miroir de `reply-blocks.ts`.
    card_id: T60 | None = None
    # Les critères qui ORDONNENT la liste. Sans eux, un rang est un score nu.
    axes: Annotated[list[T80], Field(min_length=1, max_length=6)]
    items: Annotated[list[RankedAccount], Field(min_length=1, max_length=20)]
    not_evaluated: Annotated[list[T400], Field(max_length=6)] | None = None
    search_zone: SearchZone | None = None
    talent_context: TalentContext | None = None


class ContactFollowUp(_Card):
    """#3894 — relance dans contact_list (Louis 16/10). Miroir de ``followUpSchema`` (reply-blocks.ts)."""

    kind: Literal["sent", "prepared"]
    channel: T40 | None = None
    as_of: IsoDate


class ListedContact(_Card):
    name: T120
    role: T160 | None = None
    company: T120 | None = None
    href: AppPath | None = None
    # #4610.7 — la fiche du COMPTE cité sur la ligne : posée par le serveur depuis l'`account_id` de l'outil.
    company_href: AppPath | None = None
    # r3a (recette prod 07/10) : coordonnées EN CLAIR sur la carte, jamais seulement « e-mail vérifié ».
    email: T160 | None = None
    phone: T80 | None = None
    reason: T400 | None = None
    source: CardSource | None = None
    # #3894 — relance dans contact_list (Louis 16/10) : dernier envoi / dernière relance préparée, lu dans
    # `outreach_messages`. Absent = rien de connu (jamais « 0 », jamais une ligne vide).
    follow_up: ContactFollowUp | None = None


# #AM.32 — miroir de `org_view` (reply-blocks.ts) : de quoi ouvrir l'organigramme du compte déjà filtré sur le
# périmètre demandé. Un geste (navigation), pas un contenu à lire.
class ContactListOrgView(_Card):
    account_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    perimeter: T120 | None = None


class ContactListBlock(_Card):
    type: Literal["contact_list"]
    title: T120 | None = None
    items: Annotated[list[ListedContact], Field(min_length=1, max_length=30)]
    missing: Annotated[list[T400], Field(max_length=6)] | None = None
    org_view: ContactListOrgView | None = None


class ComparisonRow(_Card):
    label: T80
    cells: list[Cell]


class ComparisonBlock(_Card):
    type: Literal["comparison"]
    title: T120 | None = None
    columns: Annotated[list[T80], Field(min_length=2, max_length=4)]
    rows: Annotated[list[ComparisonRow], Field(min_length=1, max_length=12)]
    note: T300 | None = None

    @model_validator(mode="after")
    def _one_cell_per_column(self) -> "ComparisonBlock":
        if any(len(row.cells) != len(self.columns) for row in self.rows):
            raise ValueError("une ligne porte une cellule par colonne")
        return self


class PlanStep(_Card):
    label: T200
    detail: T400 | None = None
    when: T80 | None = None
    owner: T80 | None = None
    href: AppPath | None = None


class ActionPlanBlock(_Card):
    type: Literal["action_plan"]
    title: T120 | None = None
    objective: T300 | None = None
    steps: Annotated[list[PlanStep], Field(min_length=1, max_length=10)]


class ShortlistedConsultant(_Card):
    name: T120
    headline: T160 | None = None
    href: AppPath | None = None
    fit: Annotated[list[T400], Field(min_length=1, max_length=5)]
    gaps: Annotated[list[T400], Field(max_length=5)] | None = None
    availability: T120 | None = None
    source: CardSource | None = None


class ConsultantShortlistBlock(_Card):
    type: Literal["consultant_shortlist"]
    title: T120 | None = None
    need: T300 | None = None
    items: Annotated[list[ShortlistedConsultant], Field(min_length=1, max_length=15)]
    not_evaluated: Annotated[list[T400], Field(max_length=6)] | None = None


class BriefAccount(_Card):
    name: T120
    href: AppPath | None = None


class BriefAttendee(_Card):
    name: T120
    role: T160 | None = None
    href: AppPath | None = None


class MeetingBriefBlock(_Card):
    type: Literal["meeting_brief"]
    title: T120 | None = None
    account: BriefAccount | None = None
    when: T80 | None = None
    objective: T300
    # #4424.4 — 3 à 5 phrases : l'offre de l'ESN × l'enjeu du compte. Facultatif :
    # sans profil d'offre, aucun pitch n'est inventé (le manque va dans `unknowns`).
    pitch: T600 | None = None
    attendees: Annotated[list[BriefAttendee], Field(max_length=10)] | None = None
    talking_points: Annotated[list[T400], Field(min_length=1, max_length=8)]
    questions: Annotated[list[T400], Field(max_length=8)] | None = None
    risks: Annotated[list[T400], Field(max_length=6)] | None = None
    unknowns: Annotated[list[T400], Field(max_length=6)] | None = None


class ConsultantBriefBlock(_Card):
    """#3340 — le brief provisoire d'un consultant décrit par morceaux (jamais
    un CV joint). Tous les champs sont facultatifs sauf ``unknowns`` : la carte
    existe précisément PARCE QU'il manque des choses — un champ non dit ne se
    devine jamais (doctrine « jamais de donnée fictive »)."""

    type: Literal["consultant_brief"]
    title: T120 | None = None
    role: T160 | None = None
    previous_roles: Annotated[list[T160], Field(max_length=5)] | None = None
    seniority: T120 | None = None
    tech_focus: T160 | None = None
    functional_focus: T160 | None = None
    technologies: Annotated[list[T80], Field(max_length=10)] | None = None
    sectors: Annotated[list[T80], Field(max_length=6)] | None = None
    contract_type: T80 | None = None
    availability: T120 | None = None
    mobility: T160 | None = None
    work_mode: T80 | None = None
    rate_target: T120 | None = None
    unknowns: Annotated[list[T400], Field(min_length=1, max_length=8)]


class MissingItem(_Card):
    what: T200
    why: T400 | None = None
    how: T400
    href: AppPath | None = None


class MissingDataBlock(_Card):
    type: Literal["missing_data"]
    title: T120 | None = None
    # Ce qui a ÉCHOUÉ pendant le tour — distinct de ce qui n'existe pas encore.
    failed: Annotated[list[T400], Field(max_length=6)] | None = None
    missing: Annotated[list[MissingItem], Field(min_length=1, max_length=8)]
    still_possible: Annotated[list[T400], Field(max_length=6)] | None = None


class AccountCardBlock(_Card):
    """#2271.16 — la fiche d'UN compte, dans la conversation. `href` OBLIGATOIRE :
    cette carte prétend être la fiche, elle doit y mener."""

    type: Literal["account_card"]
    name: T120
    href: AppPath
    verdict: T300 | None = None
    highlights: Annotated[list[T400], Field(min_length=1, max_length=6)]
    limits: Annotated[list[T400], Field(max_length=6)] | None = None
    not_evaluated: Annotated[list[T80], Field(max_length=6)] | None = None
    action: CardAction | None = None
    source: CardSource | None = None
    # #AM.46 — les SUITES possibles depuis ce compte (contacts, organigramme, signaux ; tour d'horizon et
    # analyse de fond quand il est cité avec ses filiales), sans ordre imposé. Posées par le serveur.
    follow_ups: Annotated[list[CardFollowUp], Field(min_length=1, max_length=10)] | None = None


class TimelineEventCard(_Card):
    label: T200
    detail: T400 | None = None
    at: IsoDateTime
    # Mêmes trois valeurs que `TIMELINE_EVENT_KINDS` côté TypeScript
    # (`packages/contracts/src/schemas/account-timeline.ts`) : ce miroir n'a pas
    # le paquet contracts à l'exécution, donc il les recopie.
    kind: Literal["action", "opportunity", "workflow"] | None = None


class TimelineBlock(_Card):
    """#2271.19 — l'historique d'UN compte. `events: []` = un compte réellement
    sans historique, rendu distinctement (GA-18/19), jamais masqué."""

    type: Literal["timeline"]
    title: T120 | None = None
    account: BriefAccount | None = None
    events: Annotated[list[TimelineEventCard], Field(max_length=50)]


class FileExportRow(_Card):
    cells: list[Cell]


class FileExportBlock(_Card):
    """#2271.20 — un fichier exportable, prêt à télécharger. Aucune destination
    réseau : le clic déclenche un téléchargement LOCAL (`downloadCSV`)."""

    type: Literal["file_export"]
    title: T120 | None = None
    filename: FileName
    columns: Annotated[list[T80], Field(min_length=1, max_length=8)]
    rows: Annotated[list[FileExportRow], Field(min_length=1, max_length=200)]
    note: T300 | None = None

    @model_validator(mode="after")
    def _one_cell_per_column(self) -> "FileExportBlock":
        if any(len(row.cells) != len(self.columns) for row in self.rows):
            raise ValueError("une ligne porte une cellule par colonne")
        return self


class ApproachBlock(_Card):
    """#2429.1 / #2429.13 — l'approche commerciale (Objectif / Angle d'accroche /
    Cas d'usage) en CHAMPS validés, plus en trois intitulés gras que l'écran
    devait reconnaître à la lettre. ``use_case`` facultatif : sans preuve
    concrète au dossier, le modèle ne l'écrit pas, et l'écran NOMME ce manque."""

    type: Literal["approach"]
    title: T120 | None = None
    objective: T300
    angle: T400
    use_case: T400 | None = None
    next_action: CardAction | None = None


class SprintAccount(_Card):
    """Un compte du sprint EXÉCUTABLE — juste ce qu'il faut pour le nommer et y
    mener (``account_ranking``/``find_accounts`` portent déjà le classement
    complet ; cette carte ajoute la segmentation, pas un second calcul)."""

    name: T120
    href: AppPath | None = None


class FocusAccount(_Card):
    """Un des trois comptes à travailler À FOND (#3392/#3428). Les trois champs
    sont OBLIGATOIRES : sans porte d'entrée VÉRIFIÉE, le compte n'a pas sa
    place ici (doctrine « jamais de donnée fictive » — une porte devinée est
    pire qu'une porte absente)."""

    name: T120
    href: AppPath | None = None
    why_now: T400
    entry_point: T300
    first_move: T400


class AccountVolumeSprintBlock(_Card):
    """#3392 / #3428 — le sprint exécutable quand le volume de comptes demandé
    dépasse la capacité réelle. Recette prod du 30/09 : `_BLOCK_ACCOUNT_VOLUME_
    SPRINT` demandait déjà en PROSE que Laura nomme, pour les trois comptes
    prioritaires, POURQUOI MAINTENANT / PAR QUELLE PORTE ENTRER / LE PREMIER
    MOUVEMENT — rien ne forçait leur présence dans la réponse. Même défaut,
    même correctif que `ConsultantBriefBlock` (#3340) : une carte, pas une
    promesse de prompt. `full_list_count` est le compte de la mémoire de
    marché COMPLÈTE, jamais recalculé ici (GA-26)."""

    type: Literal["account_volume_sprint"]
    title: T120 | None = None
    full_list_count: Annotated[int, Field(ge=0)]
    # #3428 — la liste COMPLÈTE est une sortie, pas un chiffre : lien Découvrir
    # copié du résultat de l'outil (jamais composé par le modèle).
    full_list_href: AppPath | None = None
    sprint: Annotated[list[SprintAccount], Field(min_length=1, max_length=10)]
    # #3392 / #3428 (lot Q02) — vide quand AUCUN compte n'a de porte d'entrée
    # vérifiée : l'écran le NOMME, la carte ne tombe pas en liste plate.
    focus: Annotated[list[FocusAccount], Field(max_length=3)]


class CountContractBlock(_Card):
    """#213.2 (#3207, épopée #3228) — le contrat de comptage, en carte. Miroir
    des quinze champs de ``count_contract.CountContract`` : cette carte ne
    recalcule rien, elle copie ce qu'un outil de chat a déjà mesuré.
    ``current_or_historical`` recopie ``count_contract.CURRENT_OR_HISTORICAL``
    (ce miroir n'a pas le service IA à l'exécution, même motif que
    ``TimelineEventCard.kind``)."""

    type: Literal["count_contract"]
    metric_name: T160
    object_type: T80
    unique_key: T200
    scope: T80
    entity_scope: T200
    period: T80 | None = None
    current_or_historical: Literal["current", "historical"]
    source_layers: Annotated[list[T80], Field(min_length=1, max_length=6)]
    raw_count: Annotated[int, Field(ge=0)]
    # « Non mesuré » n'est jamais 0 (doctrine) : absent tant qu'aucune couche ne
    # sait dédupliquer/résoudre, jamais recopié depuis `raw_count`.
    deduplicated_count: Annotated[int, Field(ge=0)] | None = None
    resolved_count: Annotated[int, Field(ge=0)] | None = None
    confidence: Annotated[int, Field(ge=0, le=100)] | None = None
    coverage: T160 | None = None
    suppression_threshold: Annotated[int, Field(ge=0)] | None = None
    caveats: Annotated[list[T400], Field(max_length=6)] = []


class AccountMapItem(_Card):
    name: T120
    href: AppPath | None = None
    detail: T200 | None = None


class AccountMapGroup(_Card):
    label: T120
    items: Annotated[list[AccountMapItem], Field(min_length=1, max_length=40)]


class AccountMapChip(_Card):
    kind: Literal["territory", "sector", "size", "filter"]
    label: T80


class AccountMapBadge(_Card):
    level: Literal["priority", "to_qualify", "watch", "to_document"]
    label: T40


class AccountMapCompleteness(_Card):
    level: Literal["complete", "partial", "sparse"]
    label: T60


class AccountMapFraming(_Card):
    origin: T300
    proves: T300
    not_proven: T300


class AccountMapSummary(_Card):
    retained_count: Annotated[int, Field(ge=1)]
    qualification: T200
    main_reserve: T300 | None = None


class AccountMapAccount(_Card):
    name: T120
    href: AppPath | None = None
    status: AccountMapBadge
    proof: _text(240)
    tags: Annotated[list[T40], Field(max_length=5)] | None = None
    caution: _text(240)
    next_action: CardAction


class AccountMapActions(_Card):
    validate: CardAction | None = None
    discover: CardAction | None = None
    enrich: CardAction | None = None
    save: CardAction | None = None


class AccountMapBlock(_Card):
    """#3758.2 (BEL-LAU-1001) + #3762 (BEL-LAU-1005) — la cartographie de comptes,
    miroir de ``accountMapBlock`` (``reply-blocks.ts``). Intégration 06/10 : UN
    schéma, union des champs, deux lectures du même concept :

    * GROUPES (#3758.2) — ``coverage`` (OBLIGATOIRE avec ``groups`` : jamais un
      faux complet), ``groups`` nommés sans rang ni score, ``not_covered`` (non
      vide : l'écran la lit « partielle »). Un groupe sans compte n'existe pas.
    * GRILLE canonique (#3762) — en-tête, cadrage (ce qu'elle prouve ET ne
      prouve pas), synthèse, grille de cartes homogènes (raison, prudence,
      prochaine action OBLIGATOIRES sur chacune), blocs secondaires, actions.
      Le badge de complétude est un niveau nommé, jamais un pourcentage (GA-259).

    Une carte porte au moins l'une des deux, et celle qu'elle porte est complète."""

    type: Literal["account_map"]
    title: T160 | None = None
    coverage: T300 | None = None
    groups: Annotated[list[AccountMapGroup], Field(min_length=1, max_length=8)] | None = None
    not_covered: Annotated[list[T300], Field(max_length=6)] | None = None
    source: CardSource | None = None
    completeness: AccountMapCompleteness | None = None
    context: Annotated[list[AccountMapChip], Field(min_length=1, max_length=8)] | None = None
    framing: AccountMapFraming | None = None
    summary: AccountMapSummary | None = None
    accounts: Annotated[list[AccountMapAccount], Field(min_length=1, max_length=12)] | None = None
    memory: Annotated[list[T400], Field(max_length=4)] | None = None
    to_document: Annotated[list[T400], Field(max_length=6)] | None = None
    method_limit: T400 | None = None
    actions: AccountMapActions | None = None

    @model_validator(mode="after")
    def _one_complete_reading(self) -> "AccountMapBlock":
        has_groups = self.groups is not None or self.coverage is not None
        has_grid = self.accounts is not None
        if not has_groups and not has_grid:
            raise ValueError("une cartographie porte des groupes (coverage + groups) ou une grille (accounts)")
        if has_groups and (self.groups is None or self.coverage is None):
            raise ValueError("une cartographie en groupes écrit sa couverture (coverage) et ses groupes (groups)")
        if has_grid:
            missing = [
                k for k in ("title", "completeness", "context", "framing", "summary") if getattr(self, k) is None
            ]
            if missing:
                raise ValueError("une cartographie en grille porte son squelette complet : " + ", ".join(missing))
        return self


class PostMeetingSummaryAction(_Card):
    what: T300
    owner: T120 | None = None
    due: T120 | None = None


class PostMeetingSummaryReminder(_Card):
    content: T400
    due_label: T120 | None = None


class PostMeetingSummaryBlock(_Card):
    """#3758 (BEL-LAU-1001, reste du lot J14) — miroir de ``postMeetingSummaryBlock``
    (``reply-blocks.ts``). ``as_of`` est la date d'ENREGISTREMENT de la note
    (``notes.meeting_recap_snapshot``), jamais celle de la réponse — jamais le
    texte libre du modèle. Les trois champs sont chacun optionnels, mais au
    moins l'un doit être présent : un compte rendu enregistré sans décision,
    sans action et sans relance n'a rien à montrer."""

    type: Literal["post_meeting_summary"]
    title: T160 | None = None
    as_of: IsoDateTime
    decisions: Annotated[list[T300], Field(max_length=12)] | None = None
    actions: Annotated[list[PostMeetingSummaryAction], Field(max_length=12)] | None = None
    reminder: PostMeetingSummaryReminder | None = None

    @model_validator(mode="after")
    def _at_least_one(self) -> "PostMeetingSummaryBlock":
        if not self.decisions and not self.actions and not self.reminder:
            raise ValueError("un compte rendu enregistré porte au moins une décision, une action ou une relance")
        return self


ManagerReviewReasonKind = Literal[
    "stalled_actions", "risks", "coverage_gaps", "decisions_pending", "arbitrations_pending"
]
ManagerReviewAxis = Literal["coverage", "plan", "change_digest", "signals"]


class ManagerReviewReason(_Card):
    kind: ManagerReviewReasonKind
    count: Annotated[int, Field(ge=1)]


class ManagerReviewVerdict(_Card):
    status: Literal["attention", "stable", "not_evaluable"]
    reasons: Annotated[list[ManagerReviewReason], Field(max_length=5)]
    not_evaluated: Annotated[list[ManagerReviewAxis], Field(max_length=4)]


class ManagerReviewAction(_Card):
    label: T200
    target: T160 | None = None
    owner: T120 | None = None


class ManagerReviewCompletedAction(ManagerReviewAction):
    completed_at: IsoDate | None = None


class ManagerReviewStalledAction(ManagerReviewAction):
    due_date: IsoDate


class ManagerReviewRisk(_Card):
    project: T160
    risks: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


class ManagerReviewCoverageGap(_Card):
    label: T120
    reason: T300


class ManagerReviewCoverage(_Card):
    gap_count: Annotated[int, Field(ge=0)]
    gaps: Annotated[list[ManagerReviewCoverageGap], Field(max_length=5)]


class ManagerReviewFact(_Card):
    label: T200
    date: IsoDate | None = None


class ManagerReviewArbitration(_Card):
    project: T160
    need: T160 | None = None
    consultant: T120
    account_owner: T120
    resource_owner: T120


class ManagerReviewChangeSummary(_Card):
    compared_at: IsoDate
    changed_count: Annotated[int, Field(ge=0)]
    appeared_count: Annotated[int, Field(ge=0)]
    disappeared_count: Annotated[int, Field(ge=0)]


class ManagerReviewBlock(_Card):
    """#2985 (lot E07 08/10) — miroir de ``managerReviewBlock`` (``reply-blocks.ts``).
    Reformage SANS second calcul du résultat de ``get_account_manager_review`` :
    voir ``known_shape_gate.manager_review_block_from_tool``."""

    type: Literal["manager_review"]
    account_name: T160
    href: AppPath
    verdict: ManagerReviewVerdict
    change_digest: ManagerReviewChangeSummary | None = None
    actions_completed: Annotated[list[ManagerReviewCompletedAction], Field(max_length=10)]
    actions_stalled: Annotated[list[ManagerReviewStalledAction], Field(max_length=10)]
    risks: Annotated[list[ManagerReviewRisk], Field(max_length=10)]
    coverage: ManagerReviewCoverage | None = None
    important_facts: Annotated[list[ManagerReviewFact], Field(max_length=10)]
    decisions_requested: Annotated[list[ManagerReviewAction], Field(max_length=10)]
    arbitrations_requested: Annotated[list[ManagerReviewArbitration], Field(max_length=10)]


ReplyBlock = Annotated[
    VerdictBlock
    | AccountRankingBlock
    | ContactListBlock
    | ComparisonBlock
    | ActionPlanBlock
    | ConsultantShortlistBlock
    | MeetingBriefBlock
    | ConsultantBriefBlock
    | MissingDataBlock
    | AccountCardBlock
    | TimelineBlock
    | FileExportBlock
    | ApproachBlock
    | AccountVolumeSprintBlock
    | CountContractBlock
    | AccountMapBlock
    | PostMeetingSummaryBlock
    | ManagerReviewBlock,
    Field(discriminator="type"),
]

_ADAPTER: TypeAdapter[ReplyBlock] = TypeAdapter(ReplyBlock)

# Les clés qui ne portent pas de texte à lire : la forme, et les liens.
# #3816.2 — `follow_ups` : des gestes (une phrase envoyée à Laura), pas un contenu à lire. Miroir de `NON_TEXT_KEYS`.
_NON_TEXT_KEYS = frozenset({"type", "href", "company_href", "website", "level", "follow_ups", "org_view"})


def reply_block_leaves(value: object) -> list[str]:
    """Les textes d'un bloc, dans leur ordre — le repli d'une carte illisible.
    Rien n'est inventé : seulement ce que le bloc écrivait déjà."""
    out: list[str] = []

    def walk(node: object) -> None:
        if isinstance(node, str):
            if node.strip():
                out.append(node.strip())
        elif isinstance(node, list):
            for child in node:
                walk(child)
        elif isinstance(node, dict):
            for key, child in node.items():
                if key not in _NON_TEXT_KEYS:
                    walk(child)

    walk(value)
    return out


# #3340.8 — recette prod du 30/09 : le modèle décrit parfois un champ inconnu
# par un texte sentinelle (« Non renseigné(e) », « Inconnu »…) au lieu de le
# laisser ABSENT — la carte entière échouait alors sa validation (un champ non
# vide mais aussi `unknowns` resté vide) et retombait en puces plates SANS
# libellé (`reply_block_leaves`). Un placeholder du modèle n'est pas une
# valeur : on le retire et on NOMME le champ dans `unknowns` — jamais une
# donnée inventée, seulement ce que le modèle avait déjà signalé comme manquant.
_UNKNOWN_SENTINEL = re.compile(
    r"^(?:non[\s-]+renseign\w*|non[\s-]+pr[ée]cis\w*|non[\s-]+communiqu\w*|"
    r"inconnu\w*|[àa][\s-]+d[ée]finir|n/?a)$",
    re.IGNORECASE,
)

_CONSULTANT_BRIEF_UNKNOWN_LABELS: dict[str, str] = {
    "role": "Le rôle principal",
    "previous_roles": "Les rôles précédents",
    "seniority": "Le niveau d'expérience",
    "tech_focus": "La dominante technique",
    "functional_focus": "La dominante fonctionnelle",
    "technologies": "Les technologies connues",
    "sectors": "Les secteurs connus",
    "contract_type": "Le type de contrat",
    "availability": "La disponibilité",
    "mobility": "La mobilité",
    "work_mode": "Remote ou présentiel",
    "rate_target": "Le TJM ou coût cible",
}


def _is_unknown_sentinel(text: str) -> bool:
    return bool(_UNKNOWN_SENTINEL.fullmatch(text.strip()))


# #3340 (recette 30/09, 2e brief du même fil) — bornes de `ConsultantBriefBlock`,
# recopiées ICI pour que la réparation les tienne : (longueur d'un texte,
# nombre d'éléments pour une liste). Un brief plus riche que la carte ne doit
# pas être REFUSÉ en bloc — c'est ce qui le faisait retomber en puces plates.
_CONSULTANT_BRIEF_TEXT_MAX: dict[str, int] = {
    "title": 120,
    "role": 160,
    "seniority": 120,
    "tech_focus": 160,
    "functional_focus": 160,
    "contract_type": 80,
    "availability": 120,
    "mobility": 160,
    "work_mode": 80,
    "rate_target": 120,
}
_CONSULTANT_BRIEF_LIST_MAX: dict[str, tuple[int, int]] = {
    "previous_roles": (5, 160),
    "technologies": (10, 80),
    "sectors": (6, 80),
}
_UNKNOWNS_MAX = 8
_UNKNOWN_ITEM_MAX = 400


def _clamp_text(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _clamp_consultant_brief(repaired: dict, named: list[str]) -> None:
    """Ramène les textes et listes trop longs dans les bornes de la carte.
    Une liste coupée est NOMMÉE dans `unknowns` : jamais une perte silencieuse."""
    for field, limit in _CONSULTANT_BRIEF_TEXT_MAX.items():
        current = repaired.get(field)
        if isinstance(current, str):
            repaired[field] = _clamp_text(current, limit) or None
    for field, (max_items, max_len) in _CONSULTANT_BRIEF_LIST_MAX.items():
        current = repaired.get(field)
        if not isinstance(current, list):
            continue
        items = [_clamp_text(item, max_len) for item in current if isinstance(item, str) and item.strip()]
        if len(items) > max_items:
            named.append(
                f"{_CONSULTANT_BRIEF_UNKNOWN_LABELS[field]} : {len(items) - max_items} de plus non affichées (la carte en tient {max_items})"
            )
            items = items[:max_items]
        repaired[field] = items or None


def _repair_consultant_brief(value: object) -> object:
    if not isinstance(value, dict) or value.get("type") != "consultant_brief":
        return value
    repaired = dict(value)
    named: list[str] = []
    for field, label in _CONSULTANT_BRIEF_UNKNOWN_LABELS.items():
        current = repaired.get(field)
        if isinstance(current, str) and _is_unknown_sentinel(current):
            repaired[field] = None
            named.append(label)
        elif isinstance(current, list):
            kept = [item for item in current if not (isinstance(item, str) and _is_unknown_sentinel(item))]
            if len(kept) != len(current):
                named.append(label)
            repaired[field] = kept or None
    _clamp_consultant_brief(repaired, named)
    existing = repaired.get("unknowns")
    existing_list = (
        [item.strip() for item in existing if isinstance(item, str) and item.strip()]
        if isinstance(existing, list)
        else []
    )
    seen = {item.casefold() for item in existing_list}
    for label in named:
        if label.casefold() not in seen:
            existing_list.append(label)
            seen.add(label.casefold())
    if existing_list:
        repaired["unknowns"] = [_clamp_text(item, _UNKNOWN_ITEM_MAX) for item in existing_list[:_UNKNOWNS_MAX]]
    return repaired


_VOLUME_SPRINT_MAX_SPRINT = 10
_VOLUME_SPRINT_MAX_FOCUS = 3
_VOLUME_SPRINT_FOCUS_FIELDS = (("why_now", 400), ("entry_point", 300), ("first_move", 400))


def _shorten(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _repair_volume_sprint_account(item: object) -> dict | None:
    """Un compte du sprint : nom seul (chaîne ou objet) ; un lien hors
    application est RETIRÉ (« sinon pas de href »), jamais deviné."""
    raw = {"name": item} if isinstance(item, str) else item
    if not isinstance(raw, dict):
        return None
    name = _shorten(raw.get("name"), 120)
    if name is None:
        return None
    account: dict = {"name": name}
    href = raw.get("href")
    if isinstance(href, str):
        try:
            account["href"] = _app_path(href)
        except ValueError:
            pass
    return account


def _repair_volume_sprint(value: object) -> object:
    """#3392 / #3428 (lot Q02, recette prod 30/09) — une carte REFUSÉE redevient
    une liste plate de puces. Un écart mineur du modèle (dixième compte en
    trop, texte trop long, lien hors application, compte donné en chaîne) ne
    fait plus tomber toute la carte. Ce qui ne se répare pas SANS INVENTER
    (un champ du focus manquant : pas de porte vérifiée) est ÉCARTÉ du focus ;
    le compte de la mémoire de marché absent n'est jamais deviné."""
    if not isinstance(value, dict) or value.get("type") != "account_volume_sprint":
        return value
    repaired = dict(value)
    count = repaired.get("full_list_count")
    if isinstance(count, str) and count.strip().isdigit():
        repaired["full_list_count"] = int(count.strip())
    full_list_href = repaired.get("full_list_href")
    if full_list_href is not None:
        try:
            repaired["full_list_href"] = _app_path(full_list_href) if isinstance(full_list_href, str) else None
        except ValueError:
            repaired.pop("full_list_href", None)
        if repaired.get("full_list_href") is None:
            repaired.pop("full_list_href", None)
    sprint = repaired.get("sprint")
    if isinstance(sprint, list):
        accounts = [a for a in (_repair_volume_sprint_account(item) for item in sprint) if a is not None]
        repaired["sprint"] = accounts[:_VOLUME_SPRINT_MAX_SPRINT]
    focus = repaired.get("focus")
    if isinstance(focus, list):
        kept: list[dict] = []
        for item in focus:
            account = _repair_volume_sprint_account(item)
            if account is None or not isinstance(item, dict):
                continue
            fields = {key: _shorten(item.get(key), limit) for key, limit in _VOLUME_SPRINT_FOCUS_FIELDS}
            if any(text is None for text in fields.values()):
                continue
            kept.append({**account, **fields})
        repaired["focus"] = kept[:_VOLUME_SPRINT_MAX_FOCUS]
    title = repaired.get("title")
    if isinstance(title, str):
        shortened = _shorten(title, 120)
        # #3422.1 — un intitulé qui annonce un nombre de comptes autre que
        # celui réellement rendu (« 100 comptes à explorer » sur 20 trouvés)
        # est retiré : l'écran retombe sur son intitulé neutre, la carte reste.
        real = repaired.get("full_list_count")
        if shortened and isinstance(real, int) and any(int(n) != real for n in re.findall(r"\d+", shortened)):
            shortened = None
        repaired["title"] = shortened
    return repaired


def _hoist_shared_item_limits(block: dict) -> dict:
    """KEVIN-FIX K.14 — une réserve (`limits`) que TOUS les comptes d'un classement portent à l'identique
    n'est pas calculée par compte : elle se dit UNE fois, sous la liste (`not_evaluated`), et quitte les
    lignes. Ce qui diffère d'un compte à l'autre reste sur sa ligne ; un seul compte n'a rien à partager."""
    items = block.get("items")
    if block.get("type") != "account_ranking" or not isinstance(items, list) or len(items) < 2:
        return block
    per_item = [set(item.get("limits") or []) for item in items]
    shared = [line for line in (items[0].get("limits") or []) if all(line in limits for limits in per_item)]
    shared = list(dict.fromkeys(shared))
    if not shared:
        return block
    moved = []
    for item in items:
        kept = [line for line in item.get("limits") or [] if line not in shared]
        rest = {k: v for k, v in item.items() if k != "limits"}
        moved.append({**rest, "limits": kept} if kept else rest)
    already = block.get("not_evaluated") or []
    not_evaluated = [*already, *(line for line in shared if line not in already)][:6]
    return {**block, "items": moved, "not_evaluated": not_evaluated}


def validate_reply_block(value: object) -> dict | None:
    """Le bloc VALIDÉ, dans sa forme canonique (absents retirés), ou ``None``."""
    try:
        block = _ADAPTER.validate_python(_repair_volume_sprint(_repair_consultant_brief(value)))
    except ValidationError:
        return None
    dumped = _hoist_shared_item_limits(block.model_dump(mode="json", exclude_none=True))
    if any(mentions_probability(leaf) for leaf in reply_block_leaves(dumped)):
        return None
    return dumped
