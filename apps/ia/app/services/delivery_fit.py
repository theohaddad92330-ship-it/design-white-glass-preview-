"""Le delivery fit d'un compte pour une prestation externe — #3203,
LAU-FINAL-209 (retour bêta 28/09/2026, Louis Schlegel).

> « Une entreprise autorisant le télétravail à ses salariés ne prouve pas
> qu'elle accepte des prestataires full remote, des consultants depuis
> l'étranger, du nearshore, un traitement de données hors du pays, ou une
> régie sans présence ponctuelle. »

`remote_policy.py::derive_remote_policy` lit la politique de télétravail des
SALARIÉS d'un employeur — un fait sur son PERSONNEL. Ce module répond à une
question différente : le compte accepte-t-il du delivery EXTERNE
(prestataire, nearshore, offshore) ? Les deux ne se déduisent JAMAIS l'un de
l'autre — c'est la distinction obligatoire de la spec. Le mot « remote » seul
dans un texte ne qualifie RIEN ici (NO-GO explicite : « le mot "remote"
présent sur une page suffit à qualifier le compte compatible nearshore »).

Zéro LLM, zéro appel réseau : lit un texte déjà en main (offre d'emploi, page
carrière) et cherche une mention EXPLICITE de l'acceptation ou du refus de
delivery externe. Sans mention explicite, le niveau est `unknown` — jamais
`compatible` par défaut (doctrine : un silence n'est jamais un fait).

`classify_delivery_fit` (ci-dessous, inchangée) ne couvre que la distinction
binaire acceptation/refus explicite du texte disponible — c'est le champ déjà
câblé sur `DiscoverSignal.deliveryFit`. `classify_delivery_fit_axes` et
`compose_delivery_fit_axes`, plus bas, couvrent la SUITE de l'épopée #3226/
#3203 : les TREIZE axes de la spec, ÉVALUÉS SÉPARÉMENT (§ DELIVERY FIT du
ticket), jamais moyennés — un axe `unknown` ne se promeut jamais en
`compatible`, un axe `incompatible` ne se cache jamais derrière une moyenne
(§ NIVEAUX, extension #3203.5).

Sur les treize, DOUZE ont une source réelle dans le texte déjà lu ici (même
patron zéro-LLM/zéro-réseau que ci-dessus, marqueurs EXPLICITES, une table par
axe) : `site_presence`, `authorized_countries`, `clearances`, `sensitive_data`,
`team_model`, `travel` (#3203.4), puis — décision de Louis du 30/09, « une
donnée absente à la source se BRANCHE » — `presence_frequency`, `languages`,
`timezones`, `security`, `mandated_equipment`, `contractual_status` (#3237).
`contractual_status` ne se déduit JAMAIS de `contractType` : un CDI est un
recrutement DIRECT, pas le régime attendu d'un prestataire. Le TREIZIÈME,
`source_freshness` (#3237, « source et fraîcheur »), a une source HORS TEXTE :
la fraîcheur déjà calculée par l'appelant (`signal_freshness.py`, GA-26) — voir
`classify_delivery_fit_axes(freshness=...)`. Un axe sans marqueur reste NOMMÉ et
`unknown` (`DELIVERY_FIT_AXES` liste les treize) — jamais omis en silence.
"""

from __future__ import annotations

from typing import Literal

from app.services.text_norm import normalize_name

DeliveryFitLevel = Literal["compatible", "potentially_compatible", "unknown", "incompatible"]

#: Les treize axes du § DELIVERY FIT (#3203), dans l'ORDRE du ticket.
DeliveryFitAxis = Literal[
    "site_presence",
    "presence_frequency",
    "authorized_countries",
    "languages",
    "timezones",
    "security",
    "sensitive_data",
    "mandated_equipment",
    "clearances",
    "contractual_status",
    "team_model",
    "travel",
    "source_freshness",
]

DELIVERY_FIT_AXES: tuple[DeliveryFitAxis, ...] = (
    "site_presence",
    "presence_frequency",
    "authorized_countries",
    "languages",
    "timezones",
    "security",
    "sensitive_data",
    "mandated_equipment",
    "clearances",
    "contractual_status",
    "team_model",
    "travel",
    "source_freshness",
)

# Contraintes EXPLICITES incompatibles avec du delivery externe — vérifiées
# EN PREMIER : une contrainte explicite prime toujours sur un indice
# convergent ou même un marqueur positif présent dans le même texte.
_INCOMPATIBLE_MARKERS = (
    "uniquement en france",
    "hors de france",
    "habilitation secret defense",
    "habilitation defense",
    "presence obligatoire sur site",
    "aucun sous-traitant",
    "pas de sous-traitance",
)
# Marqueurs EXPLICITES d'acceptation de delivery externe (prestataire — pas
# la politique de télétravail des salariés).
_COMPATIBLE_MARKERS = (
    "ouvert a la sous-traitance",
    "ouverts a la sous-traitance",
    "nearshore accepte",
    "delivery offshore accepte",
    "prestataires bienvenus",
    "consultants externes acceptes",
)
# Indices CONVERGENTS mais non probants seuls — appellent une vérification.
_POTENTIAL_MARKERS = (
    "prestataires",
    "sous-traitance",
    "equipe distribuee",
    "partenaires externes",
    "centre de services",
)


def classify_delivery_fit(*texts: str | None) -> DeliveryFitLevel:
    """Le niveau de compatibilité delivery externe d'un compte, à partir d'un
    texte déjà en main. Ne lit JAMAIS un `remote_policy` de salarié — voir le
    docblock de tête."""
    combined = normalize_name(" ".join(t for t in texts if isinstance(t, str) and t.strip()))
    if not combined:
        return "unknown"
    if any(marker in combined for marker in _INCOMPATIBLE_MARKERS):
        return "incompatible"
    if any(marker in combined for marker in _COMPATIBLE_MARKERS):
        return "compatible"
    if any(marker in combined for marker in _POTENTIAL_MARKERS):
        return "potentially_compatible"
    return "unknown"


# ── Les six axes avec une source réelle dans le texte (#3203.4) ────────────
# Chaque table est SCOPÉE à SON axe — un marqueur de `site_presence` ne
# qualifie jamais `authorized_countries`, même quand les deux textes se
# ressemblent (§ ticket : « évaluer séparément »).
_SITE_PRESENCE_INCOMPATIBLE = ("presence obligatoire sur site",)
_SITE_PRESENCE_COMPATIBLE = ("aucune presence sur site requise", "sans presence sur site")

_AUTHORIZED_COUNTRIES_INCOMPATIBLE = ("hors de france", "uniquement en france")
_AUTHORIZED_COUNTRIES_COMPATIBLE = (
    "nearshore accepte",
    "delivery offshore accepte",
    "consultants depuis l'etranger acceptes",
    "consultants depuis l etranger acceptes",
)

_CLEARANCES_INCOMPATIBLE = ("habilitation secret defense", "habilitation defense")

#: Une mention de données sensibles est un indice à VÉRIFIER, jamais une
#: incompatibilité affirmée seule — le texte ne dit ni le régime ni le pays
#: de traitement exigé.
_SENSITIVE_DATA_POTENTIAL = ("donnees sensibles", "traitement de donnees hors du pays")

_TEAM_MODEL_POTENTIAL = ("equipe distribuee", "centre de services")

_TRAVEL_POTENTIAL = ("deplacements frequents", "deplacements reguliers")

# ── #3237 (#3203.4, reste) — les six axes branchés sur le texte ─────────────
# Décision de Louis (30/09) : « donnée absente à la source » se BRANCHE, elle ne
# clôt pas. Même patron que les six premiers (zéro LLM, zéro réseau, marqueurs
# EXPLICITES, une table par axe, contrainte explicite qui prime) — un texte sans
# marqueur reste `unknown`. Les marqueurs n'ont ni apostrophe ni accent : le
# texte est normalisé (`normalize_name`) avant la recherche.
_PRESENCE_FREQUENCY_INCOMPATIBLE = (
    "5 jours par semaine sur site",
    "presence quotidienne sur site",
    "presence 5 jours",
)
_PRESENCE_FREQUENCY_COMPATIBLE = ("presence ponctuelle", "presence occasionnelle", "ponctuellement sur site")
#: Une fréquence partielle (« 3 jours sur site ») est un indice à VÉRIFIER : le
#: texte ne dit pas si elle s'applique à un prestataire.
_PRESENCE_FREQUENCY_POTENTIAL = ("jours sur site par semaine", "jours par semaine sur site", "jours sur site")

_LANGUAGES_INCOMPATIBLE = (
    "francais courant exige",
    "francais obligatoire",
    "francais natif",
    "francais langue maternelle",
    "maitrise du francais exigee",
)
_LANGUAGES_COMPATIBLE = (
    "langue de travail anglais",
    "travail en anglais",
    "anglais accepte",
    "english working language",
)

_TIMEZONES_INCOMPATIBLE = ("meme fuseau horaire", "fuseau horaire france obligatoire", "horaires de bureau france")
_TIMEZONES_COMPATIBLE = ("sans contrainte de fuseau", "fuseaux horaires flexibles", "fuseau horaire flexible")
_TIMEZONES_POTENTIAL = ("chevauchement horaire", "plage de recouvrement", "overlap horaire")

_SECURITY_INCOMPATIBLE = ("acces distant interdit", "pas d'acces distant", "vpn interdit", "environnement isole")
#: Une exigence de sécurité (certification, référentiel) n'interdit rien seule.
_SECURITY_POTENTIAL = ("iso 27001", "secnumcloud", "pssi", "exigences de securite")

_MANDATED_EQUIPMENT_INCOMPATIBLE = (
    "materiel du client obligatoire",
    "poste client obligatoire",
    "materiel client exclusivement",
)
_MANDATED_EQUIPMENT_COMPATIBLE = ("byod accepte", "materiel personnel accepte")
_MANDATED_EQUIPMENT_POTENTIAL = ("poste fourni", "materiel fourni")

#: Le statut attendu d'un PRESTATAIRE se lit dans une mention EXPLICITE — jamais
#: depuis `contractType` (un CDI signale un recrutement DIRECT, un autre fait).
_CONTRACTUAL_STATUS_INCOMPATIBLE = ("pas de freelance", "aucun freelance", "sans freelance", "pas de portage")
_CONTRACTUAL_STATUS_COMPATIBLE = (
    "freelances acceptes",
    "freelance accepte",
    "ouvert aux freelances",
    "portage salarial accepte",
)
_CONTRACTUAL_STATUS_POTENTIAL = ("mission en regie", "prestation en regie")


def _grade(
    text: str, incompatible: tuple[str, ...] = (), compatible: tuple[str, ...] = (), potential: tuple[str, ...] = ()
) -> DeliveryFitLevel:
    """Le niveau d'UN axe : contrainte explicite d'abord, puis marqueur positif,
    puis indice à vérifier, sinon `unknown` (un silence n'est jamais un fait)."""
    if any(m in text for m in incompatible):
        return "incompatible"
    if any(m in text for m in compatible):
        return "compatible"
    if any(m in text for m in potential):
        return "potentially_compatible"
    return "unknown"


def classify_delivery_fit_axes(*texts: str | None, freshness: str | None = None) -> dict[str, DeliveryFitLevel]:
    """#3226 (#3203.4) — les treize axes, ÉVALUÉS SÉPARÉMENT sur le MÊME texte
    déjà lu par `classify_delivery_fit` (zéro LLM, zéro réseau). Rend
    TOUJOURS les treize clés de `DELIVERY_FIT_AXES` — `unknown` pour un axe
    sans marqueur trouvé OU sans source dans ce module (voir le docblock de
    tête pour lesquels).

    ``freshness`` (#3237, reste de #3203.4 — « source et fraîcheur ») : le
    statut déjà calculé par l'appelant (`signal_freshness.classify_signal_freshness`,
    GA-26, jamais un second calcul de date ici). Un signal `"archive"` est un
    DOUTE sur la fiabilité de ce que CE signal affirme, jamais une preuve
    d'incompatibilité — `"incompatible"` ferait dominer tout le compte via
    `compose_delivery_fit_axes` pour une raison étrangère au delivery. Un
    signal `"current"` ne PROUVE rien de plus sur le delivery lui-même
    (silence, pas fait) : il reste `unknown`, comme `"undated"` ou l'absence
    d'argument (additif — byte-identique pour tout appelant existant)."""
    axes: dict[str, DeliveryFitLevel] = {axis: "unknown" for axis in DELIVERY_FIT_AXES}
    if freshness == "archive":
        axes["source_freshness"] = "potentially_compatible"
    combined = normalize_name(" ".join(t for t in texts if isinstance(t, str) and t.strip()))
    if not combined:
        return axes

    if any(m in combined for m in _SITE_PRESENCE_INCOMPATIBLE):
        axes["site_presence"] = "incompatible"
    elif any(m in combined for m in _SITE_PRESENCE_COMPATIBLE):
        axes["site_presence"] = "compatible"

    if any(m in combined for m in _AUTHORIZED_COUNTRIES_INCOMPATIBLE):
        axes["authorized_countries"] = "incompatible"
    elif any(m in combined for m in _AUTHORIZED_COUNTRIES_COMPATIBLE):
        axes["authorized_countries"] = "compatible"

    if any(m in combined for m in _CLEARANCES_INCOMPATIBLE):
        axes["clearances"] = "incompatible"

    if any(m in combined for m in _SENSITIVE_DATA_POTENTIAL):
        axes["sensitive_data"] = "potentially_compatible"

    if any(m in combined for m in _TEAM_MODEL_POTENTIAL):
        axes["team_model"] = "potentially_compatible"

    if any(m in combined for m in _TRAVEL_POTENTIAL):
        axes["travel"] = "potentially_compatible"

    axes["presence_frequency"] = _grade(
        combined, _PRESENCE_FREQUENCY_INCOMPATIBLE, _PRESENCE_FREQUENCY_COMPATIBLE, _PRESENCE_FREQUENCY_POTENTIAL
    )
    axes["languages"] = _grade(combined, _LANGUAGES_INCOMPATIBLE, _LANGUAGES_COMPATIBLE)
    axes["timezones"] = _grade(combined, _TIMEZONES_INCOMPATIBLE, _TIMEZONES_COMPATIBLE, _TIMEZONES_POTENTIAL)
    axes["security"] = _grade(combined, _SECURITY_INCOMPATIBLE, (), _SECURITY_POTENTIAL)
    axes["mandated_equipment"] = _grade(
        combined, _MANDATED_EQUIPMENT_INCOMPATIBLE, _MANDATED_EQUIPMENT_COMPATIBLE, _MANDATED_EQUIPMENT_POTENTIAL
    )
    axes["contractual_status"] = _grade(
        combined, _CONTRACTUAL_STATUS_INCOMPATIBLE, _CONTRACTUAL_STATUS_COMPATIBLE, _CONTRACTUAL_STATUS_POTENTIAL
    )

    return axes


def compose_delivery_fit_axes(axes: dict[str, DeliveryFitLevel]) -> DeliveryFitLevel:
    """#3226 (#3203.5) — le niveau GLOBAL, composé des axes SANS JAMAIS
    promouvoir un `unknown` en `compatible` ni masquer un `incompatible`
    derrière une moyenne (§ NIVEAUX du ticket, extension #3203.5) :

    * un seul axe `incompatible` suffit à rendre `incompatible` — il ne se
      dilue jamais dans les axes restants ;
    * sinon, un seul axe `potentially_compatible` suffit à rendre
      `potentially_compatible` — la prudence l'emporte sur l'optimisme ;
    * `compatible` seulement quand AU MOINS un axe est évalué et qu'AUCUN axe
      évalué n'est ni `incompatible` ni `potentially_compatible` ;
    * `unknown` quand AUCUN axe n'a pu être évalué — jamais promu en
      `compatible` faute de mieux."""
    evaluated = [level for level in axes.values() if level != "unknown"]
    if not evaluated:
        return "unknown"
    if "incompatible" in evaluated:
        return "incompatible"
    if "potentially_compatible" in evaluated:
        return "potentially_compatible"
    return "compatible"


_POLICY_CLAUSE_FR = {
    "sur_site": "Le compte recrute sur site pour ses salariés",
    "hybride": "Le compte recrute en hybride pour ses salariés",
    "full_remote": "Le compte recrute en full remote pour ses salariés",
}
_POLICY_CLAUSE_EN = {
    "sur_site": "The account hires on-site for its employees",
    "hybride": "The account hires hybrid for its employees",
    "full_remote": "The account hires full remote for its employees",
}


def delivery_fit_response_hint(
    level: DeliveryFitLevel,
    *,
    remote_work_policy: str | None = None,
    language: str | None = "fr",
) -> str | None:
    """#3226 (#3203.7) — LA FORMULATION du § RÉPONSE du ticket : « Le compte
    recrute en hybride, mais je n'ai aucune preuve qu'il accepte des
    prestataires depuis l'étranger… Je ne l'exclus pas, mais je le classe à
    vérifier avant prospection. » ``remote_work_policy`` est un fait DÉJÀ
    résolu par l'appelant (`remote_policy.py`, jamais recalculé ici, GA-26) —
    la phrase le CONTRASTE avec le delivery fit, elle ne le confond jamais
    avec lui (même distinction que le docblock de tête de ce module).

    ``None`` sur `"unknown"` : rien à dire de plus qu'un silence — Laura ne
    doit pas ANNONCER une absence de preuve à chaque signal muet, seulement
    quand un jugement (à vérifier / exclu / confirmé) a réellement une base."""
    lang = "fr" if (language or "fr").lower().startswith("fr") else "en"
    if level == "potentially_compatible":
        policy_clause = (_POLICY_CLAUSE_FR if lang == "fr" else _POLICY_CLAUSE_EN).get(remote_work_policy or "")
        if lang == "fr":
            prefix = f"{policy_clause}, mais " if policy_clause else ""
            return (
                f"{prefix}je n'ai aucune preuve qu'il accepte des prestataires depuis l'étranger. "
                "Je ne l'exclus pas, mais je le classe à vérifier avant prospection."
            )
        prefix = f"{policy_clause}, but " if policy_clause else ""
        return (
            f"{prefix}I have no evidence it accepts contractors from abroad. "
            "I'm not excluding it, but I'm marking it to verify before prospecting."
        )
    if level == "incompatible":
        if lang == "fr":
            return (
                "Ce compte exclut explicitement le delivery externe (prestataires, nearshore, offshore) : "
                "je l'écarte d'une approche nearshore."
            )
        return (
            "This account explicitly excludes external delivery (contractors, nearshore, offshore): "
            "I'm ruling it out for a nearshore approach."
        )
    if level == "compatible":
        if lang == "fr":
            return "Ce compte confirme explicitement son ouverture au delivery externe."
        return "This account explicitly confirms it is open to external delivery."
    return None


__all__ = [
    "DELIVERY_FIT_AXES",
    "DeliveryFitAxis",
    "DeliveryFitLevel",
    "classify_delivery_fit",
    "classify_delivery_fit_axes",
    "compose_delivery_fit_axes",
    "delivery_fit_response_hint",
]
