"""Politique de désaccord commercial de Laura (#3180, LAU-FINAL-186, retour
bêta 28/09/2026, issue #3180).

Le retour décrit Laura obéissant poliment à une demande qu'un expert ESN
devrait immédiatement CHALLENGER — reproduit dans son propre journal
d'actions (issue #3179/#3180, même capture) : un commercial déclaré
« Paris/Grand Est » demande « toute la France », et Laura part sur le
périmètre national sans le nommer comme un écart. Ce module donne à Laura le
DROIT et le DEVOIR de contredire une mauvaise prémisse commerciale — jamais
en refusant, jamais en jugeant, toujours avec une alternative.

Onze cas nommés par le retour (section CAS DE CHALLENGE). Cinq ont une
source de données RÉELLE dans le produit aujourd'hui et sont DÉTECTÉS ici
(#3243, reste de #186.10 ; #3392.2, retour bêta 30/09) :

* ``detect_geographic_overreach`` — « recherche excessivement large » : le
  profil ESN déclare des zones précises (``geo_zones``, questionnaire Temps
  1) et la recherche ne porte AUCUNE contrainte géographique.
* ``detect_saturated_account`` — « compte déjà fortement saturé » : réutilise
  EXACTEMENT le même seuil que l'axe ``capacity`` de
  ``account_score_axes.py`` (≥3 ESN concurrentes déjà en place) — jamais un
  second calcul (GA-26).
* ``detect_closed_for_access_level`` (#3243, reste de #186.10) — « compte
  trop fermé pour le niveau d'accès actuel » : réutilise EXACTEMENT l'axe
  ``accessibility`` d'``account_score_axes.compute_axes`` (0 point = aucun
  interlocuteur JOIGNABLE identifié sur le compte) — jamais un second calcul.
* ``detect_recruitment_only_need`` (#3243, reste de #186.10) — « besoin
  supposé à partir d'un simple recrutement CDI » : réutilise EXACTEMENT les
  deux champs que lit déjà l'axe ``signal`` (``itJobSignals``/
  ``recentSignals``) — le déclenchement est le SEUL cas où une offre d'emploi
  IT est le seul signal vivant, sans aucun autre signal récent pour le
  corroborer.
* ``detect_capacity_overreach`` (#3392.2, retour bêta 30/09 — « Trouve-moi
  100 grands comptes » traité sans challenge) — « action dont le coût
  dépasse la valeur probable » : le volume EXPLICITEMENT demandé
  (``tool_input["limit"]`` d'un appel `run_account_search`) dépasse le
  plafond mesuré qu'une recherche rend réellement exploitable
  (``_ACCOUNT_SEARCH_MAX_ITEMS``, chat_tools.py — jamais un second seuil
  recalculé ici, GA-26). Ni le coût ni la valeur d'un COMPTE ne sont mesurés
  (ça reste vrai, et hors de portée) mais le volume EXPLICITEMENT demandé,
  lui, l'est — une liste plus longue que ce qu'on peut travailler est déjà,
  à elle seule, un coût qui dépasse la valeur probable de la traiter en
  entier.

Les trois autres (message trop agressif ou trop générique, consultant non
sécurisé, filiale hors périmètre) n'ont aucune source de données PAR COMPTE
assez fiable pour être détectées sans deviner — ``UNDETECTED_CASES`` les
nomme, avec leur raison, plutôt que de les simuler. (Interlocuteur beaucoup
trop haut, signal trop ancien et demande contraire aux exclusions du profil,
listés ici dans des lots antérieurs, ont depuis reçu un détecteur réel —
``detect_too_senior_contact``, ``detect_stale_signals``,
``detect_declared_exclusion`` ci-dessous ; cette liste n'avait pas été
remise à jour.) Vérifié pour ce lot (#3243), raison par raison :

* ⚠️ MIS À JOUR 10/10/2026 (#3243.2, Louis) : « filiale hors périmètre » a depuis
  ``detect_subsidiary_out_of_perimeter`` (type d'entité prouvé + code postal du siège contre des
  zones résolvables) et « 50 CV à froid » ``detect_mass_cold_submissions`` ; le texte ci-dessous
  est l'historique du refus d'alors. « consultant non sécurisé » (#3243.1) reste NON détecté.
* filiale hors périmètre — ``resolve_account_territory`` (chat_tools.py)
  EXISTE et ``account_qualification.py`` nomme ``OUT_OF_ZONE``/
  ``OUT_OF_SECTOR``, mais les deux opèrent au moment de la RECHERCHE
  (candidat contre filtres), jamais sur un compte déjà ouvert et nommément
  demandé — les brancher ici serait un rapprochement par proximité, pas une
  lecture directe.
* message trop agressif ou trop générique — reste NON DÉTECTÉ comme signal
  PAR COMPTE : ``forbidden_phrasings.py`` fournit le VOCABULAIRE interdit au
  PROMPT (avant l'écriture), aucune fonction n'y mesure un texte déjà
  rédigé — et ne pourrait pas le faire honnêtement même une fois écrit : le
  CORPS des messages ne sort jamais vers le modèle ni vers un humain
  (CLAUDE.md § Doctrine, « ce qu'on ne collecte pas »). Le volet AGRESSIF
  n'en reste pas moins couvert (#186.10, lot R25) — pas comme détecteur de
  CE module, mais comme POSTURE PERMANENTE : la DEMANDE d'un ton agressif
  est le tour de conversation courant, déjà lu par le modèle sans donnée à
  collecter (``commercial_challenge_policy_block``,
  ``commercial_challenge_policy.py``) — REFUS de ce ton précis, avec sa
  raison, jamais un simple challenge. Le volet GÉNÉRIQUE est DÉTECTÉ depuis
  le lot M09 (``detect_generic_mass_message``) sur la DEMANDE du tour — un
  message identique pour plusieurs personnes —, le texte rédigé restant
  mesuré après coup par le contrôle de masse #2204.73
  (``outreachDuplicateGroups``, appelé par ``TabMessages.tsx``).
* interlocuteur beaucoup trop haut — DÉTECTÉ depuis le 04/10
  (``detect_too_senior_contact``, voir plus bas) : la personne NOMMÉE dans
  le message, marquée par l'API, et son niveau lu par
  ``hierarchy_level.classify_hierarchy_level``.
* consultant non sécurisé — #3243.1 (décision Louis 11/10/2026,
  ``c95_consultant_toujours_poussable``) : ce cas n'aura JAMAIS de détecteur
  bloquant. Laura pousse TOUJOURS un consultant si l'utilisateur le veut ; au
  plus une mention informative, jamais un refus.
* demande contraire aux exclusions du profil — DÉTECTÉ (``detect_declared_exclusion``,
  voir plus bas) : les secteurs ``no_go_sectors`` déclarés à l'onboarding,
  confrontés au nom du compte.
* signal trop ancien — DÉTECTÉ (``detect_stale_signals``, voir plus bas) :
  le compte a des signaux ET ils sont tous archivés.

Trois niveaux de force (section POLITIQUE DE DÉSACCORD), TRAÇABLES : chaque
challenge rendu par ce module porte son ``strength`` — jamais un désaccord
non typé.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Literal, Mapping, TypedDict

from app.services.account_score_axes import compute_axes
from app.services.account_suitability import compute_account_suitability
from app.services.company_archetype import archetype_verdict_from_account_data
from app.services.company_archetype_playbook import is_partnership_candidate_archetype
from app.services.hierarchy_level import classify_hierarchy_level
from app.services.entities import _no_go_hit, derive_no_go_keywords

ChallengeStrength = Literal["soft", "firm", "blocking"]

#: Les trois niveaux, avec la définition EXACTE du retour — jamais reformulée
#: en un adjectif plus vague, pour que la force reste TRAÇABLE d'un bout à
#: l'autre (nom du niveau → définition → texte produit).
STRENGTH_DEFINITIONS: dict[ChallengeStrength, str] = {
    "soft": "Préférence stratégique.",
    "firm": "Risque commercial important.",
    "blocking": "Conformité, permission, sécurité, mensonge ou action irréversible.",
}

#: Les onze cas nommés par le retour, et s'ils sont DÉTECTÉS ici ou nommés
#: sans être mesurés (valeur ``None`` = pas de détecteur dans ce module).
CHALLENGE_CASES: dict[str, str | None] = {
    "compte trop fermé pour le niveau d'accès actuel": "detect_closed_for_access_level",
    "interlocuteur beaucoup trop haut": "detect_too_senior_contact",
    "besoin supposé à partir d'un simple recrutement CDI": "detect_recruitment_only_need",
    # #3243 (#186.10, lot M09) — volet GÉNÉRIQUE : la DEMANDE d'un envoi
    # identique à plusieurs personnes (le volet agressif est une posture,
    # `commercial_challenge_policy_block`).
    "message trop agressif ou trop générique": "detect_generic_mass_message",
    "consultant non sécurisé": None,
    # #3243.2 (Louis 10/10) — le type d'entité « filiale » PROUVÉ + le code postal du siège.
    "filiale hors périmètre": "detect_subsidiary_out_of_perimeter",
    "signal trop ancien": "detect_stale_signals",
    "compte déjà fortement saturé": "detect_saturated_account",
    "demande contraire aux exclusions du profil": "detect_declared_exclusion",
    "recherche excessivement large": "detect_geographic_overreach",
    "action dont le coût dépasse la valeur probable": "detect_capacity_overreach",
}

#: Raison nommée pour chacun des neuf cas non détectés — jamais une valeur
#: devinée (doctrine « on nomme ce qui n'a pas pu être évalué »).
UNDETECTED_CASES: dict[str, str] = {
    case: "aucune source de données par compte ne permet de le mesurer aujourd'hui — voir l'épopée."
    for case, detector in CHALLENGE_CASES.items()
    if detector is None
}

#: #186.9 — les six scénarios de recette du retour, recopiés VERBATIM (section
#: TESTS). Nommés ici pour que la couverture par cas ci-dessus se lise contre
#: EXACTEMENT ces intitulés, jamais une paraphrase.
RECIPE_SCENARIOS: tuple[str, ...] = (
    "attaquer le CEO mondial",
    "envoyer cinquante CV à froid",
    "contacter une personne partie",
    "prospecter un partenaire existant comme un client",
    "investir dans un compte sans accès",
    "présenter un besoin historique comme actuel",
)

#: #3243 (#186.9) — les scénarios de recette qui ont un détecteur RÉEL, et lequel.
#: Les six scénarios ont désormais un détecteur réel ; la recette reste à rejouer en prod.
RECIPE_DETECTORS: dict[str, str] = {
    "contacter une personne partie": "detect_departed_contact",
    "prospecter un partenaire existant comme un client": "detect_partner_prospected_as_client",
    "attaquer le CEO mondial": "detect_too_senior_contact",
    # #3243.3 (Louis 10/10) — la DEMANDE d'envoyer des dizaines de CV sans besoin derrière.
    "envoyer cinquante CV à froid": "detect_mass_cold_submissions",
    # #3243.4 — mêmes détecteurs que CHALLENGE_CASES (GA-26), relus sous l'angle de la recette.
    "investir dans un compte sans accès": "detect_closed_for_access_level",
    "présenter un besoin historique comme actuel": "detect_stale_signals",
}

#: La chaîne que `chat-context.service.ts` (apps/api, `DEPARTED_CONTACT_MARKER`)
#: écrit sur la ligne d'un contact NOMMÉ dans le message ET sorti du compte
#: (`lifecycle_state = 'historique'`) — une seule chaîne, des deux côtés.
DEPARTED_CONTACT_MARKER = "parti de l’entreprise"

#: Le marqueur que `chat-context.service.ts` (apps/api, `NAMED_CONTACT_MARKER`)
#: écrit sur la ligne d'un contact NOMMÉ dans le message — une seule chaîne, des deux côtés.
NAMED_CONTACT_MARKER = "nommé dans le message"

#: Direction GÉNÉRALE (CEO/PDG/DG/président) — pas la ligne fonctionnelle : un
#: DSI/DAF/RSSI reste un décideur d'ESN, jamais « trop haut ».
_GENERAL_MANAGEMENT_RE = re.compile(
    r"\b(ceo|pdg|chief executive|managing director|managing partner|"
    r"pr[ée]sident(?:e)?(?:[ -]directeur[ -]g[ée]n[ée]ral)?|"
    r"directeur(?:rice)? g[ée]n[ée]ral(?:e)?|dg)\b",
    re.IGNORECASE,
)

#: Valeurs de ``geo_zones`` (questionnaire Temps 1, ``onboarding.ts``) qui
#: ÉQUIVALENT à « aucune contrainte géographique » — une recherche nationale
#: n'est jamais un écart pour un profil qui a lui-même déclaré l'un de ceux-ci.
_NO_GEOGRAPHIC_CONSTRAINT = (
    "national",
    "national (toute la france)",
    "international",
    "full remote (pas de contrainte géo)",
    "full remote",
)


class Challenge(TypedDict, total=False):
    case: str
    strength: ChallengeStrength
    problem: str
    impact: str
    alternative: str


def _declared_geo_zones(profile: Mapping[str, Any] | None) -> list[str]:
    raw = (profile or {}).get("geo_zones")
    return [str(z).strip() for z in raw if isinstance(z, str) and str(z).strip()] if isinstance(raw, list) else []


def detect_geographic_overreach(
    *, department: str | None, profile: Mapping[str, Any] | None, region: list[str] | None = None
) -> Challenge | None:
    """« recherche excessivement large » (#186.3) — le profil déclare des
    zones précises et la recherche ne porte AUCUNE contrainte géographique.

    ``None`` dès que le profil ne déclare rien (absence ≠ restriction, même
    doctrine que ``laura_authority_scope.py``), déclare lui-même le national
    ou l'international, OU que la recherche porte déjà un département OU une
    région (#3392, reste de recette prod 30/09 — un territoire déjà cadré par
    code région ne doit pas être signalé comme trop large) — jamais un faux
    positif sur une recherche déjà cadrée."""
    if str(department or "").strip() or (region or []):
        return None
    zones = _declared_geo_zones(profile)
    if not zones:
        return None
    if any(zone.strip().lower() in _NO_GEOGRAPHIC_CONSTRAINT for zone in zones):
        return None
    zones_label = ", ".join(zones)
    return {
        "case": "recherche excessivement large",
        "strength": "soft",
        "problem": f"Cette recherche ne porte aucune contrainte géographique, alors que ton profil déclare : {zones_label}.",
        "impact": "Une partie des comptes trouvés seront hors de ta zone réelle — du temps de qualification perdu à les écarter un par un.",
        "alternative": f"Je peux cadrer la recherche sur {zones_label}. Si tu veux vraiment sortir de cette zone, dis-le et je pars sur le périmètre demandé.",
    }


def detect_saturated_account(analysis: Mapping[str, Any] | None) -> Challenge | None:
    """« compte déjà fortement saturé » (#186.3) — MÊME seuil que l'axe
    ``capacity`` de ``account_score_axes.py`` (≥3 ESN déjà en place), jamais
    un second calcul (GA-26) : ce détecteur ne fait que RELIRE le même
    signal brut sous l'angle du challenge plutôt que du score."""
    a = analysis or {}
    competitors = a.get("competitorsPresent") or a.get("esnPresence")
    count = len(competitors) if isinstance(competitors, (list, tuple)) else 0
    if count < 3:
        return None
    return {
        "case": "compte déjà fortement saturé",
        "strength": "soft",
        "problem": f"{count} ESN sont déjà identifiées sur ce compte.",
        "impact": "Le temps d'ouverture risque d'être long pour un résultat déjà disputé par plusieurs concurrents.",
        "alternative": "Je peux chercher un angle de différenciation avant d'investir du temps, ou te montrer des comptes moins disputés.",
    }


def detect_closed_for_access_level(
    analysis: Mapping[str, Any] | None, profile: Mapping[str, Any] | None = None
) -> Challenge | None:
    """« compte trop fermé pour le niveau d'accès actuel » (#3243, reste de
    #186.10) — MÊME axe ``accessibility`` qu'``account_score_axes.compute_axes``
    (GA-26, jamais un second calcul) : ``points == 0`` veut dire qu'AUCUN
    interlocuteur joignable (e-mail, téléphone, LinkedIn) n'est identifié sur
    ce compte — jamais une estimation, la même lecture que le score.

    Restreint aux ZÉRO interlocuteur (pas au seuil plus large
    ``limitedByData``, qui inclut aussi « des contacts identifiés mais aucun
    joignable ») : ce second cas a déjà une porte (des personnes sont
    connues, un enrichissement les rend joignables), le premier n'en a
    aucune — c'est lui, et lui seul, qu'un commercial devrait voir nommé
    avant de s'engager sur le compte.

    ``None`` sans ``analysis`` DU TOUT (aucun compte dans ce tour — absence
    ≠ restriction, même doctrine que ``detect_geographic_overreach``) :
    ``compute_axes(None, …)`` lirait une liste de contacts vide et
    déclencherait à tort sur un tour qui ne parle d'AUCUN compte."""
    if analysis is None:
        return None
    axes = compute_axes(analysis, profile)["axes"]
    accessibility = next((ax for ax in axes if ax.get("axis") == "accessibility"), None)
    if accessibility is None or accessibility.get("points"):
        return None
    return {
        "case": "compte trop fermé pour le niveau d'accès actuel",
        "strength": "firm",
        "problem": str(accessibility.get("evidence") or "Aucun interlocuteur identifié sur ce compte."),
        "impact": "Sans porte d'entrée connue, ce compte va mobiliser du temps de recherche avant même de pouvoir ouvrir une conversation.",
        # #3855 (recette prod 09/10) — sans cette invitation explicite, un
        # « fais-le quand même » retombait sur un second refus (« reste non
        # exécutable ») au lieu de lancer la recherche promise ici. Même
        # patron que `detect_geographic_overreach`/`detect_too_senior_contact` :
        # l'alternative NOMME le geste qu'une confirmation déclenche.
        "alternative": (
            "Je peux lancer une recherche de contacts sur ce compte, ou te montrer des comptes "
            "déjà accessibles. Si tu veux vraiment avancer sur ce compte tel quel, dis-le et je "
            "lance la recherche de contacts tout de suite."
        ),
    }


def detect_recruitment_only_need(analysis: Mapping[str, Any] | None) -> Challenge | None:
    """« besoin supposé à partir d'un simple recrutement CDI » (#3243, reste
    de #186.10) — MÊMES deux champs que l'axe ``signal``
    d'``account_score_axes.py`` (GA-26, jamais un second calcul) :
    ``itJobSignals`` compte les offres d'emploi IT, ``recentSignals`` les
    AUTRES signaux datés. Se déclenche SEULEMENT quand une offre d'emploi
    existe et qu'AUCUN autre signal vivant (non archivé) ne la corrobore —
    jamais sur un recrutement accompagné d'un autre signal, jamais sur
    l'absence totale de signal (ça, c'est l'axe ``signal`` à zéro, pas ce
    cas-ci)."""
    a = analysis or {}
    jobs_raw = a.get("itJobSignals") or a.get("it_job_signals")
    jobs = len(jobs_raw) if isinstance(jobs_raw, (list, tuple)) else 0
    if jobs < 1:
        return None
    signals = a.get("recentSignals") or a.get("recent_signals") or []
    live_other_signals = [s for s in signals if isinstance(s, Mapping) and s.get("freshness") != "archive"]
    if live_other_signals:
        return None
    return {
        "case": "besoin supposé à partir d'un simple recrutement CDI",
        "strength": "soft",
        "problem": f"{jobs} offre(s) d'emploi IT identifiée(s), aucun autre signal récent sur ce compte.",
        "impact": "Un recrutement isolé ne prouve pas un besoin externalisé — présenter ce compte comme un besoin corroboré risquerait un message hors cible.",
        "alternative": "Je peux chercher un second signal avant d'avancer, ou te dire clairement que ce compte reste une hypothèse à ce stade.",
    }


def detect_departed_contact(contacts_summary: str | None) -> Challenge | None:
    """« contacter une personne partie » (#3243, #186.9) — la source est le
    cycle de vie du contact (``historique``), relayé par l'API UNIQUEMENT pour
    une personne NOMMÉE dans le message : une partie non visée ne déclenche
    rien. Le premier mot de la ligne (avant `` - ``) est le nom."""
    departed = [
        line.split(" - ")[0].strip()
        for line in (contacts_summary or "").splitlines()
        if f" - {DEPARTED_CONTACT_MARKER}" in line
    ]
    names = [name for name in departed if name]
    if not names:
        return None
    return {
        "case": "contacter une personne partie",
        "strength": "firm",
        "problem": f"{', '.join(names)} a quitté l'entreprise (fiche marquée historique).",
        "impact": "Un message écrit comme à un contact actuel du compte tomberait à côté, et pourrait nuire à la relation.",
        "alternative": "Je peux l'aborder comme relation réseau, ou viser son nouvel employeur ; ou chercher son successeur sur ce compte.",
    }


def detect_too_senior_contact(contacts_summary: str | None) -> Challenge | None:
    """« interlocuteur beaucoup trop haut » (#3243, #186.10 / #186.9 « attaquer le
    CEO mondial ») — la cible est la personne NOMMÉE dans le message (marquée par
    l'API), et son niveau est lu par ``hierarchy_level.classify_hierarchy_level``
    (GA-26). Tranché sans Louis : « trop haut » = gouvernance, ou direction
    GÉNÉRALE (CEO/PDG/DG/président) ; un DSI/RSSI/DAF, décideur naturel d'une
    ESN, ne déclenche jamais, ni un titre absent (absence ≠ trop haut)."""
    names: list[str] = []
    for line in (contacts_summary or "").splitlines():
        if f" - {NAMED_CONTACT_MARKER}" not in line:
            continue
        parts = line.split(" - ")
        title = parts[1].strip() if len(parts) > 1 else ""
        if not title or title == "?":
            continue
        level = classify_hierarchy_level(title)
        if level == "governance" or (level == "c_level" and _GENERAL_MANAGEMENT_RE.search(title)):
            names.append(f"{parts[0].strip()} ({title})")
    if not names:
        return None
    return {
        "case": "interlocuteur beaucoup trop haut",
        "strength": "soft",
        "problem": f"{', '.join(names)} : un niveau de direction générale ou de gouvernance, rarement la porte d'entrée d'une ESN.",
        "impact": "Écrire à ce niveau sans relais ni recommandation a peu de chances d'aboutir et peut fermer la porte du compte.",
        "alternative": "Je peux viser le décideur opérationnel (DSI, directeur métier) et préparer de quoi remonter vers ce niveau. Si tu veux vraiment lui écrire, dis-le et je prépare le message.",
    }


def _deaccent_lower(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn").lower()


#: #3243 (#186.10) — une demande d'envoi IDENTIQUE : « même message »,
#: « message identique/unique/générique », « copier-coller », « template unique ».
_SAME_MESSAGE_RE = re.compile(
    r"\b(meme message|message (identique|unique|generique|type unique)|un seul message|"
    r"copier[- ]coller|copie[- ]colle|template unique|modele unique)\b"
)
#: … adressée à PLUSIEURS personnes : « à tous », « pour toutes », « 50 contacts »,
#: « en masse », « tout le monde », « toute la liste ».
_MANY_RECIPIENTS_RE = re.compile(
    r"\b((a|pour) (tous|toutes|tout le monde)|tout le monde|toute la liste|en masse|en nombre|"
    r"(\d{2,}|dix|vingt|trente|quarante|cinquante|cent) (personnes|contacts|prospects|decideurs|dsi|destinataires|comptes))\b"
)


def detect_generic_mass_message(request_text: str | None) -> Challenge | None:
    """« message trop générique » (#3243, #186.10, lot M09) — le volet que le
    contrôle de masse #2204.73 (`outreachDuplicateGroups`, contrats ; appelé par
    l'onglet Messages, `TabMessages.tsx`) mesure APRÈS rédaction, pris ici AVANT :
    la DEMANDE du tour d'écrire un message identique pour plusieurs personnes.

    Ne lit que la demande que le commercial vient d'écrire — jamais le corps
    d'un message déjà rédigé (doctrine : le corps ne sort pas vers le modèle).
    Deux conditions, toutes deux explicites : un message identique ET plusieurs
    destinataires ; « le même message que la semaine dernière » à UNE personne
    ne déclenche pas. Jamais un score de ressemblance (aucune probabilité)."""
    text = _deaccent_lower(request_text or "")
    if not text or not _SAME_MESSAGE_RE.search(text) or not _MANY_RECIPIENTS_RE.search(text):
        return None
    return {
        "case": "message trop agressif ou trop générique",
        "strength": "firm",
        "problem": "Un message identique pour plusieurs personnes se lit comme un envoi de masse : aucune accroche ne parle à CETTE personne.",
        "impact": "Le contrôle de masse de l'onglet Messages le signalerait comme doublon ; envoyé tel quel, il fait chuter les réponses et use la réputation de l'ESN auprès du compte.",
        "alternative": "Je garde la même trame si tu veux, mais je prépare une accroche propre à chaque personne (son poste, un signal du compte). Si tu tiens au message unique, dis-le et je le prépare.",
    }


#: #3243.3 (Louis, 10/10/2026) — « envoyer cinquante CV à froid » : un VOLUME de
#: CV/profils/dossiers (≥ 10, en chiffres ou en lettres) ET un envoi à FROID
#: (aucun besoin derrière). Les deux sont lus dans la DEMANDE du tour.
_MANY_CVS_RE = re.compile(
    r"\b(\d{2,}|dix|vingt|trente|quarante|cinquante|soixante|cent)\s+(cv|profils?|candidatures?|dossiers?|consultants?)\b"
)
_COLD_SEND_RE = re.compile(r"\b(a froid|sans besoin|en masse|au hasard|spontanement|candidatures? spontanees?)\b")


def detect_mass_cold_submissions(request_text: str | None) -> Challenge | None:
    """« envoyer cinquante CV à froid » (#3243.3, #186.9) — Laura conteste un envoi
    de masse de soumissions : des dizaines de profils proposés sans besoin client
    derrière. Ne lit que la DEMANDE du tour (jamais le corps d'un message). Un CV, ou
    quelques profils adossés à un besoin, ne déclenche pas ; « 50 contacts à froid »
    non plus (c'est une campagne de contacts, borne `_CAMPAIGN_MAX_CONTACTS`)."""
    text = _deaccent_lower(request_text or "")
    if not text or not _MANY_CVS_RE.search(text) or not _COLD_SEND_RE.search(text):
        return None
    return {
        "case": "envoyer cinquante CV à froid",
        "strength": "firm",
        "problem": "Des dizaines de CV envoyés sans besoin client derrière se lisent comme un envoi de masse, pas comme un positionnement.",
        "impact": "Chez le client, la pile de profils non demandés use la réputation de l'ESN et rend chaque CV suivant moins lu ; aucun ne répond à un besoin réel.",
        "alternative": "Je peux plutôt retenir les besoins ouverts et y positionner 2 ou 3 profils bien choisis chacun. Si tu tiens à l'envoi à froid, dis-le et je prépare le périmètre demandé.",
    }


def _zone_departments(zone: str) -> set[str] | None:
    """Les départements qu'une zone DÉCLARÉE couvre, ou ``None`` si elle n'est pas résolvable
    (ville, libellé libre) — on ne devine jamais. Table de régions = celle du scoring (GA-26)."""
    from app.services.discover_scoring import _REGION_ALIASES, _REGION_DEPARTMENTS, _normalize

    canonical = _normalize(zone)
    if not canonical:
        return None
    for alias, target in _REGION_ALIASES.items():
        if re.search(rf"\b{alias}\b", canonical):
            canonical = f"{canonical} {target}"
    for region, departments in _REGION_DEPARTMENTS.items():
        if region in canonical:
            return set(departments)
    if re.fullmatch(r"\d{2,3}", canonical):
        return {canonical}
    return None


def detect_subsidiary_out_of_perimeter(
    analysis: Mapping[str, Any] | None, profile: Mapping[str, Any] | None
) -> Challenge | None:
    """« filiale hors périmètre » (#3243.2, Louis 10/10/2026) — le compte ouvert est une
    FILIALE (type d'entité PROUVÉ par le résolveur, ``entity_resolution.kind``) dont le
    siège (code postal du registre) tombe hors des zones que le profil déclare.

    Aucune devinette : ``None`` si l'entité n'est pas établie filiale, si le code postal
    manque, si le profil ne déclare aucune zone, une zone ouverte (national…) OU une zone
    qu'on ne sait pas résoudre en départements (une ville : le rapprochement par proximité
    est exactement le faux positif que ce module s'interdit)."""
    a = analysis or {}
    resolution = a.get("entity_resolution")
    if not isinstance(resolution, Mapping) or resolution.get("kind") != "subsidiary":
        return None
    address = a.get("headquarters_address")
    postal = re.sub(r"\s+", "", str(address.get("postal_code") or "")) if isinstance(address, Mapping) else ""
    if not re.fullmatch(r"\d{5}", postal) or postal.startswith("20"):
        return None  # code postal absent/inconnu ; la Corse (2A/2B) n'est pas lue d'un code numérique
    department = postal[:3] if postal.startswith("97") else postal[:2]

    raw_zones = (profile or {}).get("geoZone")
    zones = _declared_geo_zones(profile) or (
        [z.strip() for z in raw_zones.split(",") if z.strip()] if isinstance(raw_zones, str) else []
    )
    restrictive = [z for z in zones if _deaccent_lower(z).strip() not in {_deaccent_lower(n) for n in _NO_GEOGRAPHIC_CONSTRAINT}]
    if not restrictive or len(restrictive) != len(zones):
        return None
    covered: set[str] = set()
    for zone in restrictive:
        departments = _zone_departments(zone)
        if departments is None:
            return None
        covered |= departments
    if department in covered:
        return None
    zones_label = ", ".join(restrictive)
    return {
        "case": "filiale hors périmètre",
        "strength": "soft",
        "problem": f"Cette filiale a son siège dans le {department}, hors de la zone que ton profil déclare : {zones_label}.",
        "impact": "Travailler une entité hors de ta zone réelle, c'est du temps de qualification et de déplacement que ton périmètre n'a pas prévu.",
        "alternative": f"Je peux te montrer les entités du groupe situées sur {zones_label}. Si ce site t'intéresse malgré tout, dis-le et je continue dessus.",
    }


def detect_declared_exclusion(company_name: str | None, profile: Mapping[str, Any] | None) -> Challenge | None:
    """« demande contraire aux exclusions du profil » (#3243, 30/09) — les
    secteurs no-go DÉCLARÉS par l'ESN à l'onboarding (``noGoSectors``, déjà
    lus par ``bellum_strategy.py``) contre le NOM du compte ouvert, avec
    EXACTEMENT la règle de traduction mot-clé de la porte de pertinence des
    filiales (``entities.derive_no_go_keywords`` / ``_no_go_hit``, GA-26 :
    jamais une table NAF→libellé recopiée ici). Jeton entier ou son
    pluriel, jamais un préfixe lâche. ``None`` sans exclusion déclarée, sans
    nom de compte ou sans correspondance — le nom seul est lu, jamais le
    texte libre du secteur (un objet social de banque dit « construction »).
    Tranché sans Louis : le nom, pas le NAF — la seule lecture déjà
    éprouvée contre les faux positifs."""
    name = str(company_name or "").strip()
    raw = (profile or {}).get("noGoSectors")
    declared = [str(x).strip() for x in raw if str(x).strip()] if isinstance(raw, list) else []
    if not name or not declared:
        return None
    hit = _no_go_hit(name, derive_no_go_keywords(declared))
    if hit is None:
        return None
    sector = next((d for d in declared if hit in derive_no_go_keywords([d])), declared[0])
    return {
        "case": "demande contraire aux exclusions du profil",
        "strength": "firm",
        "problem": f"{name} relève d'un secteur que ton profil déclare exclu : {sector}.",
        "impact": "Travailler ce compte irait contre un choix que tu as toi-même posé — du temps commercial sur un secteur que tu ne veux pas servir.",
        "alternative": "Je peux te proposer des comptes hors de tes secteurs exclus. Si l'exclusion a changé, dis-le et je continue sur ce compte.",
    }


def detect_stale_signals(analysis: Mapping[str, Any] | None) -> Challenge | None:
    """« signal trop ancien » (#3243, 30/09) — MÊME champ ``recentSignals`` et
    même notion d'``archive`` que l'axe ``signal`` (GA-26). Se déclenche
    quand le compte a des signaux ET qu'aucun n'est vivant : tout ce qui
    pourrait appuyer une action est périmé. ``None`` sans signal du tout
    (l'absence n'est pas l'ancienneté — c'est l'axe ``signal`` à zéro) et
    dès qu'un signal vivant existe. Tranché sans Louis : la citation
    précise d'un signal n'est pas tracée, donc la règle porte sur ce que
    le compte PEUT citer — jamais un signal archivé présenté comme actuel."""
    a = analysis or {}
    signals = a.get("recentSignals") or a.get("recent_signals") or []
    mappings = [s for s in signals if isinstance(s, Mapping)]
    if not mappings or any(s.get("freshness") != "archive" for s in mappings):
        return None
    # #3243 (recette R16) — un signal archivé est un besoin NOMMÉ et DATÉ, pas
    # une absence : la formule est « besoin à confirmer », jamais « pas de
    # besoin » ni « besoin non documenté ».
    named = _named_dated_signal(mappings)
    return {
        "case": "signal trop ancien",
        "strength": "soft",
        "problem": f"Les {len(mappings)} signaux connus sur ce compte sont tous archivés{named}.",
        "impact": "Présenter un besoin historique comme actuel ferait un message hors sujet — le besoin a pu être traité depuis.",
        "alternative": "Dis-le avec cette formule, MOT POUR MOT : « besoin à confirmer » — le besoin est nommé et daté, mais il n'est pas établi comme actuel. Jamais « aucun besoin confirmé » ni « pas de besoin ». Je peux chercher un signal récent avant d'avancer.",
    }


def _named_dated_signal(signals: list[Mapping[str, Any]]) -> str:
    """`` (besoin à confirmer : « titre », daté 2022-03-14)`` pour le signal archivé
    le plus récent ; chaîne vide si rien n'est nommable (jamais inventé)."""
    dated = sorted(signals, key=lambda s: str(s.get("date") or ""), reverse=True)
    top = dated[0] if dated else {}
    title = str(top.get("title") or top.get("signal") or top.get("description") or "").strip()
    day = str(top.get("date") or "").strip()
    if not title and not day:
        return " (besoin à confirmer)"
    parts = [f"« {title} »" if title else "", f"daté {day}" if day else ""]
    return f" (besoin à confirmer : {', '.join(p for p in parts if p)})"


def detect_unsuitable_account(
    analysis: Mapping[str, Any] | None, profile: Mapping[str, Any] | None = None, *, company: str | None = None
) -> Challenge | None:
    """Le verdict d'aptitude (#3242 / #185.13, 30/09) consulté à CHAQUE tour
    qui porte un compte ouvert, pas seulement quand Laura pense à appeler
    l'outil : un compte techniquement cohérent n'est pas une cible
    automatique. MÊME moteur que l'outil ``get_account_suitability_verdict``
    (``compute_account_suitability``, GA-26). ``GO_NOW`` ne challenge rien ;
    ``NOT_EVALUABLE`` ACCOMPAGNE d'un avertissement (tranché sans Louis :
    un compte sans analyse suffisante n'est pas bloqué, il est nommé non
    évaluable). ``None`` sans ``analysis`` — aucun compte dans le tour."""
    if analysis is None:
        return None
    res = compute_account_suitability(analysis, profile, company=company)
    verdict = str(res.get("verdict") or "")
    if not verdict or verdict == "GO_NOW":
        return None
    who = company or "ce compte"
    label = str(res.get("verdict_label") or verdict)
    reasons = [*(res.get("blocking_factors") or []), *(res.get("dominant_reasons") or [])]
    evidence = " ; ".join(f"{r['axis']} — {r['evidence']}" for r in reasons[:2] if r.get("evidence"))
    proof = res.get("proof_needed") or []
    return {
        "case": "compte pas encore une cible",
        "strength": "firm" if verdict == "NO_GO_NOW" else "soft",
        "problem": f"Verdict d'aptitude pour {who} ({verdict}) : {label}." + (f" {evidence}." if evidence else ""),
        "impact": "Transformer ce compte en action de prospection sans le dire reviendrait à traiter une entreprise demandée comme une cible acquise.",
        "alternative": (str(proof[0]) if proof else str(res.get("best_route") or ""))
        or "Je dis le verdict et ce qui manque avant d'engager du temps, et tu décides de continuer ou non.",
    }


def detect_partner_prospected_as_client(
    account_data: Mapping[str, Any] | None, *, company: str | None = None
) -> Challenge | None:
    """« prospecter un partenaire existant comme un client » (#3243, #186.9).

    Source : le type d'acteur DÉJÀ résolu sur preuve (NAF/intermédiation) par
    ``phase1_research`` et traduit en archétype par le point d'entrée unique
    ``archetype_verdict_from_account_data`` ; le sous-ensemble « partenaire
    potentiel » est celui de ``is_partnership_candidate_archetype`` (GA-26,
    aucune liste recopiée). Tranché : on ne sait pas qu'un partenariat EXISTE
    (aucune table ne relie un compte-ESN à l'espace) — le challenge nomme donc
    un partenaire POTENTIEL, jamais « votre partenaire ». ``None`` sans type
    d'acteur établi (absence ≠ client)."""
    if not is_partnership_candidate_archetype(archetype_verdict_from_account_data(dict(account_data or {}))):
        return None
    who = company or "Ce compte"
    return {
        "case": "prospecter un partenaire existant comme un client",
        "strength": "soft",
        "problem": f"{who} est identifié comme une ESN, un cabinet ou une agence : un partenaire potentiel plutôt qu'un client final.",
        "impact": "Lui dérouler un pitch de client brûle une porte qui vaut mieux en sous-traitance ou en co-traitance, et peut abîmer une relation existante.",
        "alternative": "Je prépare plutôt une approche partenariat (rang 2, co-traitance, échange de besoins). Si tu veux vraiment le traiter comme un client, dis-le et je pars là-dessus.",
    }


#: Segmentation proposée quand le volume demandé dépasse ce qu'une recherche
#: rend exploitable — les DEUX chiffres cités verbatim par l'issue #3392
#: elle-même (« une sélection de 10 comptes Sprint et 3 comptes Focus »),
#: jamais un seuil recalculé sur une donnée par compte qu'on n'a pas.
_CAPACITY_SPRINT_SEGMENT = 10
_CAPACITY_FOCUS_SEGMENT = 3


def detect_capacity_overreach(*, requested_limit: int | None, capped_limit: int) -> Challenge | None:
    """« action dont le coût dépasse la valeur probable » (#3392.2, retour
    bêta 30/09 — « Trouve-moi 100 grands comptes » traité sans challenge).

    Ne mesure ni le coût ni la valeur d'un COMPTE (ça reste hors de portée,
    voir le docstring du module) : mesure le volume EXPLICITEMENT demandé
    (``requested_limit``, lu tel quel depuis l'appel d'outil, jamais deviné)
    contre le plafond qu'une recherche rend RÉELLEMENT exploitable
    (``capped_limit`` — l'appelant passe ``_ACCOUNT_SEARCH_MAX_ITEMS``,
    jamais un second seuil recalculé ici, GA-26). ``None`` sans demande de
    volume EXPLICITE, ou déjà dans le plafond — jamais un faux positif sur
    une recherche par défaut."""
    if requested_limit is None or requested_limit <= capped_limit:
        return None
    return {
        "case": "action dont le coût dépasse la valeur probable",
        "strength": "soft",
        "problem": f"Tu demandes {requested_limit} comptes ; une recherche n'en rend jamais plus de {capped_limit} d'un coup.",
        "impact": "Une liste plus longue que ce qui se travaille devient une liste morte : personne ne va au bout.",
        "alternative": (
            f"Je te sors les {capped_limit}. Je peux aussi te proposer une sélection de "
            f"{_CAPACITY_SPRINT_SEGMENT} comptes Sprint et {_CAPACITY_FOCUS_SEGMENT} comptes Focus, "
            "pour prioriser plutôt que subir la liste entière."
        ),
    }
