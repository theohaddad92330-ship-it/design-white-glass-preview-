"""La barrière d'achat — six proxies observables, quatre classes (tome 3).

Le constat qui ouvre le tome : **près de 80 % des entreprises du numérique
peinent à entrer en contact avec les grands groupes, et moins de la moitié sont
référencées.** Un score d'intérêt qui ignore cela envoie un commercial de trois
personnes travailler huit mois un compte qui ne peut pas l'acheter.

LA PHRASE QUI TIENT TOUT LE MODULE
----------------------------------
**La barrière d'achat n'est pas mesurable. Elle est estimable.** Toute la
discipline consiste à ne jamais confondre les deux — d'où trois règles :

1. un proxy sans donnée **sort du calcul**, il n'est JAMAIS noté zéro ;
2. sous trois proxies mesurables, **aucune classe n'est produite** — la réponse
   est « non estimable », avec la liste de ce qui manque ;
3. le libellé dit « ouvert **probable** », jamais « ouvert », jamais « facile ».

CE QUE LE REGISTRE PROUVE, ET CE QU'IL NE DIT PAS
--------------------------------------------------
Le tome décrit six statuts capitalistiques (scale-up, ETI familiale, ETI sous
fonds, filiale étrangère, groupe coté, public). Le registre français n'en
distingue **aucun** directement : il publie une CATÉGORIE d'entreprise (PME /
ETI / GE) et des drapeaux de service public. On ne devine donc pas le statut —
on le déduit de ce qui est prouvé, et on garde l'échelle du tome pour ce qui est
DÉCLARÉ (par l'utilisateur, ou demain par la communauté).

Quand le registre ne dit qu'« ETI », le modèle retient la valeur de l'ETI **sous
fonds** (4,0), la plus fermée des deux : sur-estimer la capacité d'une ESN à
ouvrir un compte est l'erreur qui coûte huit mois, la sous-estimer suggère
seulement de viser une filiale. Les deux erreurs ne se paient pas le même prix.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
import unicodedata
from typing import Any, Literal, TypedDict

#: Les six proxies du §4. L'ordre est celui du tome, et il est stable : les
#: tests, l'écran et l'evidence s'y réfèrent par clé.
ACCESS_PROXIES: tuple[str, ...] = (
    "statut",
    "effectif",
    "cotation",
    "commande_publique",
    "decentralisation",
    "anciennete",
)

#: Les quatre classes. `None` est la cinquième valeur — « non estimable » — et
#: elle n'est PAS une classe : c'est l'absence de verdict.
AccessClass = Literal["A", "B", "C", "D"]

#: Barème de statut (§4.1), à la valeur près du tome. Deux entrées s'y ajoutent,
#: parce que le registre les prouve alors que le tome ne les nomme pas :
#: `grande_entreprise` (GE au sens officiel — la justification du groupe coté vaut
#: pour toute grande entreprise, cotée ou non) et `pme` / `eti`, les deux seules
#: catégories que le registre distingue vraiment.
STATUT_BARRIERE: dict[str, float] = {
    "scaleup": 1.0,
    "pme": 1.5,
    "eti_familiale": 3.0,
    "eti": 4.0,
    "eti_fonds": 4.0,
    "filiale_etrangere": 4.5,
    "groupe_cote": 7.0,
    "grande_entreprise": 7.0,
    "public_parapublic": 9.0,
}

#: Barème de taille (§4.2) — bornes basses incluses.
TAILLE_BARRIERE: tuple[tuple[int, float], ...] = (
    (30_000, 8.5),
    (10_000, 7.0),
    (3_000, 5.0),
    (1_000, 3.0),
    (250, 1.5),
    (0, 0.5),
)

#: Poids et bonus du §4.3.
POIDS_STATUT = 0.45
POIDS_TAILLE = 0.35
BONUS_COTATION = 1.2
BONUS_COMMANDE_PUBLIQUE = 1.5
MALUS_DECENTRALISATION = 0.8
#: La décentralisation compte DEUX fois : elle baisse la barrière (référencements
#: régionaux) et elle augmente l'accessibilité (une BU se prend en direct).
BONUS_ACCESSIBILITE_DECENTRALISATION = 0.7

#: Un compte devient « décentralisé » à partir de ce nombre d'établissements
#: OUVERTS. Le seuil n'est pas dans le tome : il est dérivé de ce que la
#: décentralisation veut dire — des implantations qui achètent localement. En
#: dessous, un siège et deux annexes ne font pas un référencement régional.
DECENTRALISATION_MIN_ETABLISSEMENTS = 10

#: Sous ce nombre de proxies mesurables, aucune classe n'est produite (§4.4).
MIN_PROXIES_MESURABLES = 3

#: Les bornes de classe (§5). Comparées à la barrière ARRONDIE au dixième, comme
#: la base de référence du tome.
CLASS_BOUNDS: tuple[tuple[float, AccessClass, str], ...] = (
    (3.0, "A", "Ouvert probable"),
    (5.0, "B", "Ouvert par une entité"),
    (7.0, "C", "Semi-ouvert"),
    (10.0, "D", "Verrouillage probable"),
)


class AccessProxy(TypedDict):
    key: str
    contribution: float
    evidence: str
    measurable: bool


class AccessBarrier(TypedDict):
    score: float | None
    accessibility: float | None
    access_class: AccessClass | None
    label: str | None
    proxies: list[AccessProxy]
    measurable: bool
    missing: list[str]
    #: Les corrections datées appliquées au score de base (§7). Vide quand aucun
    #: signal ne s'applique — jamais une correction « par défaut ».
    corrections: list[dict[str, Any]]
    #: Un AVERTISSEMENT, hors barème (§28). ``None`` quand il n'y en a pas.
    warning: dict[str, Any] | None
    #: Le STATUT retenu (`scaleup`, `eti`, `groupe_cote`…), ou ``None``.
    #:
    #: La preuve du proxy le dit en français ; la VALEUR est ce qui permet à un
    #: appelant de décider sans lire une phrase. L'interdit de circuit (« ne pas
    #: passer par les achats ») a besoin de savoir qu'on parle d'une scale-up,
    #: pas d'en déduire le mot depuis « scale-up — le décideur EST le
    #: prescripteur ».
    statut: str | None


def _fr_count(value: int) -> str:
    """Un entier lu par un humain : milliers groupés par l'espace fine
    insécable, comme l'écran (`formatCount`). « 2320 » ne se lit pas d'un coup."""
    return f"{value:,}".replace(",", "\u202f")


def _taille_value(headcount: int) -> float:
    for floor, value in TAILLE_BARRIERE:
        if headcount >= floor:
            return value
    return TAILLE_BARRIERE[-1][1]


def _headcount_of(value: Any) -> int | None:
    """« 250 à 499 salariés », « 500+ », 4200 → un entier, ou ``None``.

    On retient la borne HAUTE d'une tranche : une entreprise « 1 000 à 1 999 »
    a la structure d'achat d'une entreprise de 2 000, pas de 1 000 — et
    sous-estimer la barrière est l'erreur coûteuse.
    """
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    nums = [int(n) for n in re.findall(r"\d+", str(value or "").replace(" ", ""))]
    return max(nums) if nums else None


def _class_of(score: float) -> tuple[AccessClass, str]:
    for bound, klass, label in CLASS_BOUNDS:
        if score <= bound:
            return klass, label
    return "D", "Verrouillage probable"


def access_barrier(
    *,
    statut: str | None = None,
    statut_evidence: str | None = None,
    headcount: Any = None,
    listed: bool | None = None,
    public_procurement: bool | None = None,
    etablissements: int | None = None,
    creation_date: str | None = None,
    now: date | None = None,
) -> AccessBarrier:
    """La barrière d'achat estimée, ses proxies, et ce qui manque pour l'estimer.

    Chaque paramètre à ``None`` est un proxy NON MESURABLE : il sort du calcul et
    son absence est NOMMÉE dans ``missing``. Un `False` explicite, lui, est une
    mesure — « ce compte n'achète pas en commande publique » est un fait.

    L'ancienneté (P6) est intégrée au statut par le tome ; elle reste un proxy
    à part entière ici, pour que le compte « créé il y a huit mois » compte comme
    une mesure et non comme un trou.
    """
    today = now or datetime.now(UTC).date()
    proxies: list[AccessProxy] = []
    missing: list[str] = []
    base = 0.0

    if statut and statut in STATUT_BARRIERE:
        value = STATUT_BARRIERE[statut]
        contribution = value * POIDS_STATUT
        base += contribution
        proxies.append(
            {
                "key": "statut",
                "contribution": round(contribution, 3),
                "evidence": statut_evidence or f"statut retenu : {statut.replace('_', ' ')}",
                "measurable": True,
            }
        )
    else:
        missing.append("statut")
        proxies.append(
            {
                "key": "statut",
                "contribution": 0.0,
                # Nommer ce qui manque, et pourquoi personne ne peut le combler
                # depuis une source publique : c'est ce qui rend la déclaration
                # utilisateur utile plutôt que bureaucratique.
                "evidence": "le registre ne dit pas si cette entreprise est une scale-up, une ETI familiale, "
                "une ETI sous fonds ou la filiale d'un groupe",
                "measurable": False,
            }
        )

    parsed_headcount = _headcount_of(headcount)
    if parsed_headcount is not None:
        value = _taille_value(parsed_headcount)
        contribution = value * POIDS_TAILLE
        base += contribution
        proxies.append(
            {
                "key": "effectif",
                "contribution": round(contribution, 3),
                "evidence": f"effectif {parsed_headcount} salariés — la maturité achat croît par paliers",
                "measurable": True,
            }
        )
    else:
        missing.append("effectif")
        proxies.append(
            {"key": "effectif", "contribution": 0.0, "evidence": "effectif inconnu au registre", "measurable": False}
        )

    if listed is None:
        missing.append("cotation")
        proxies.append(
            {
                "key": "cotation",
                "contribution": 0.0,
                # Aucune source publique gratuite ne lie un SIREN à une cotation.
                # Le dire vaut mieux que de répondre « non coté » par défaut, ce
                # qui abaisserait la barrière de tous les groupes cotés.
                "evidence": "cotation inconnue — aucune source publique ne la lie au SIREN",
                "measurable": False,
            }
        )
    else:
        contribution = BONUS_COTATION if listed else 0.0
        base += contribution
        proxies.append(
            {
                "key": "cotation",
                "contribution": round(contribution, 3),
                "evidence": "société cotée — gouvernance formalisée, contrôle des dépenses"
                if listed
                else "société non cotée",
                "measurable": True,
            }
        )

    if public_procurement is None:
        missing.append("commande_publique")
        proxies.append(
            {
                "key": "commande_publique",
                "contribution": 0.0,
                "evidence": "exposition à la commande publique non vérifiée",
                "measurable": False,
            }
        )
    else:
        contribution = BONUS_COMMANDE_PUBLIQUE if public_procurement else 0.0
        base += contribution
        proxies.append(
            {
                "key": "commande_publique",
                "contribution": round(contribution, 3),
                "evidence": "achète en commande publique — service achats formé, procédures écrites"
                if public_procurement
                else "aucun marché public trouvé à son nom",
                "measurable": True,
            }
        )

    if etablissements is None:
        missing.append("decentralisation")
        proxies.append(
            {
                "key": "decentralisation",
                "contribution": 0.0,
                "evidence": "nombre d'établissements inconnu",
                "measurable": False,
            }
        )
    else:
        decentralise = etablissements >= DECENTRALISATION_MIN_ETABLISSEMENTS
        contribution = -MALUS_DECENTRALISATION if decentralise else 0.0
        base += contribution
        proxies.append(
            {
                "key": "decentralisation",
                "contribution": round(contribution, 3),
                "evidence": f"{_fr_count(etablissements)} établissements — référencements déconcentrés probables"
                if decentralise
                else f"{_fr_count(etablissements)} {'établissements' if etablissements >= 2 else 'établissement'}"
                " — achats vraisemblablement centralisés",
                "measurable": True,
            }
        )

    age_years = _age_years(creation_date, today)
    if age_years is None:
        missing.append("anciennete")
        proxies.append(
            {"key": "anciennete", "contribution": 0.0, "evidence": "date de création inconnue", "measurable": False}
        )
    else:
        # L'ancienneté est INTÉGRÉE au statut par le tome (§4, P6) : elle ne
        # pèse donc pas une seconde fois dans la somme. Elle reste une mesure —
        # « créée il y a huit mois » explique pourquoi la barrière est basse.
        proxies.append(
            {
                "key": "anciennete",
                "contribution": 0.0,
                "evidence": f"créée il y a {age_years} {'ans' if age_years >= 2 else 'an'} — "
                + (
                    "le temps de formaliser une direction achats"
                    if age_years >= 10
                    else "trop récente pour un panel formalisé"
                ),
                "measurable": True,
            }
        )

    measured = [p for p in proxies if p["measurable"]]
    if len(measured) < MIN_PROXIES_MESURABLES:
        return {
            "score": None,
            "accessibility": None,
            "access_class": None,
            "label": None,
            "proxies": proxies,
            "measurable": False,
            "missing": missing,
            "corrections": [],
            "warning": None,
            "statut": statut,
        }

    score = round(max(0.0, min(10.0, base)), 1)
    klass, label = _class_of(score)
    # L'accessibilité se calcule sur la barrière ARRONDIE, comme la base de
    # référence du tome — sinon 2,75 rend 7,95 là où la référence dit 7,9.
    accessibility = round(
        max(0.0, min(10.0, 10.0 - score + (BONUS_ACCESSIBILITE_DECENTRALISATION if _is_decentralised(proxies) else 0.0))),
        1,
    )
    return {
        "score": score,
        "accessibility": accessibility,
        "access_class": klass,
        "label": label,
        "proxies": proxies,
        "measurable": True,
        "missing": missing,
        "corrections": [],
        "warning": None,
        "statut": statut,
    }


def _is_decentralised(proxies: list[AccessProxy]) -> bool:
    for proxy in proxies:
        if proxy["key"] == "decentralisation":
            return proxy["measurable"] and proxy["contribution"] < 0
    return False


def _age_years(creation_date: str | None, today: date) -> int | None:
    raw = str(creation_date or "").strip()
    if not raw:
        return None
    try:
        created = date.fromisoformat(raw[:10])
    except ValueError:
        return None
    if created > today:
        return None
    return (today - created).days // 365


# ── Du registre au modèle ───────────────────────────────────────────────────
#
# Le tome décrit six statuts capitalistiques. Le registre français n'en publie
# aucun : il publie une CATÉGORIE (PME / ETI / GE) et des drapeaux de service
# public. On ne traduit donc que ce qui est PROUVÉ, et on nomme le reste.

#: Drapeaux `complements` de recherche-entreprises qui PROUVENT le secteur public.
PUBLIC_FLAGS: tuple[str, ...] = (
    "est_administration",
    "est_service_public",
    "collectivite_territoriale",
)

#: Catégories INSEE → statut du modèle. `GE` prend la valeur du groupe coté :
#: la justification du tome (direction achats, panel, RSE fournisseurs) vaut
#: pour toute grande entreprise, cotée ou non — mais on ne dit JAMAIS « cotée ».
CATEGORIE_TO_STATUT: dict[str, str] = {"PME": "pme", "ETI": "eti", "GE": "grande_entreprise"}

_STATUT_EVIDENCE: dict[str, str] = {
    "public_parapublic": "organisme public ou parapublic — code de la commande publique, seuils, publicité",
    "grande_entreprise": "grande entreprise au sens officiel — direction achats, panel fournisseurs, contrôle des dépenses",
    "eti": "ETI au sens officiel — le registre ne dit pas si elle est familiale ou sous fonds ; "
    "le modèle retient la valeur la plus fermée des deux",
    "pme": "PME au sens officiel — la décision d'achat reste proche du dirigeant",
}


def statut_from_registry(
    *, size_class: Any = None, naf_code: Any = None, flags: Any = None
) -> tuple[str | None, str | None]:
    """Le statut PROUVÉ par le registre, et son evidence — ou ``(None, None)``.

    L'ordre compte : un organisme public reste public quelle que soit sa taille.
    Une catégorie absente rend ``None``, et le proxy sort du calcul plutôt que
    de tomber sur une valeur par défaut qui pèserait 0,45 dans la somme.
    """
    marks = flags if isinstance(flags, dict) else {}
    if any(bool(marks.get(flag)) for flag in PUBLIC_FLAGS):
        return "public_parapublic", _STATUT_EVIDENCE["public_parapublic"]
    naf = str(naf_code or "").strip()
    # 84.xx = administration publique. C'est un FAIT du registre, pas une
    # ressemblance de libellé.
    if naf.startswith("84"):
        return "public_parapublic", _STATUT_EVIDENCE["public_parapublic"]
    statut = CATEGORIE_TO_STATUT.get(str(size_class or "").strip().upper())
    return (statut, _STATUT_EVIDENCE.get(statut or "")) if statut else (None, None)


#: Tranches d'effectif INSEE → borne HAUTE. Le libellé affiché par Découvrir
#: (« 250+ salariés ») perd l'information : lu tel quel, un groupe de 9 000
#: personnes compte pour 250 et sa barrière s'effondre. Le CODE, lui, est exact.
INSEE_TRANCHE_UPPER: dict[str, int] = {
    "00": 0, "01": 2, "02": 5, "03": 9, "11": 19, "12": 49, "21": 99, "22": 199,
    "31": 249, "32": 499, "41": 999, "42": 1999, "51": 4999, "52": 9999, "53": 20000,
}


def headcount_from_tranche(code: Any) -> int | None:
    """Borne haute d'une tranche INSEE, ou ``None`` si le code est inconnu.

    Borne HAUTE et non basse : une entreprise « 5 000 à 9 999 » a la structure
    d'achat d'une entreprise de 10 000, et sous-estimer la barrière est l'erreur
    qui envoie un commercial travailler huit mois un compte fermé.
    """
    key = str(code or "").strip()
    return INSEE_TRANCHE_UPPER.get(key.zfill(2) if key.isdigit() else key)


#: Les familles d'annonce BODACC qui désignent une procédure collective. La
#: comparaison est faite sur le texte MINUSCULE et sans accent : le miroir
#: Opendatasoft rend tantôt le code (``procedure_collective``), tantôt le
#: libellé (« Procédure collective »), et l'un des deux passerait à côté.
_PROCEDURE_TERMS = ("procedure collective", "procedure_collective", "redressement", "liquidation", "sauvegarde")
#: Au-delà, c'est de l'histoire. Annoncer comme un risque actuel une procédure
#: de 2019 ferait écarter un compte redressé depuis longtemps.
PROCEDURE_WINDOW_DAYS = 730


def _deaccent(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")


def collective_proceeding(legal_signals: Any, *, now: date | None = None) -> dict[str, Any] | None:
    """Une procédure collective RÉCENTE parmi les annonces légales, ou ``None``.

    ⚠️ Volontairement HORS du barème (§28). Une entreprise en redressement n'est
    pas « plus dure d'accès » — elle est souvent très joignable, et c'est
    exactement le piège : confondre l'accessibilité et la solvabilité ferait
    remonter en tête de liste un compte qui ne signera rien. On avertit, et la
    décision reste celle du commercial.

    Une annonce SANS date est rendue quand même : taire un risque faute de date
    est la pire des deux erreurs, et l'écran dit que la date est inconnue.
    """
    today = now or datetime.now(UTC).date()
    for row in legal_signals or []:
        if not isinstance(row, dict):
            continue
        kind = _deaccent(str(row.get("type") or "")).lower()
        if not any(term in kind for term in _PROCEDURE_TERMS):
            continue
        raw = str(row.get("date") or "").strip()
        published: date | None = None
        if raw:
            try:
                published = date.fromisoformat(raw[:10])
            except ValueError:
                published = None
            if published is not None and (today - published).days > PROCEDURE_WINDOW_DAYS:
                continue
        return {
            "kind": "procedure_collective",
            "date": published.isoformat() if published else None,
            "label": str(row.get("type") or "").strip() or "Procédure collective",
            # #3916.1 — le lien vers l'annonce BODACC, quand la ligne le porte
            # (posé par `data_sources.bodacc.legal_signals`) ; `None` sur une
            # ligne plus ancienne mise en cache avant ce lot, jamais deviné.
            "url": row.get("url") or None,
        }
    return None


def barrier_for_company(
    company: dict[str, Any],
    *,
    signals: Any = None,
    legal_signals: Any = None,
    now: date | None = None,
) -> AccessBarrier:
    """La barrière d'un candidat de Découvrir ou d'un compte analysé.

    `signals` sert UNIQUEMENT au proxy « commande publique » : un marché ou un
    appel d'offres à son nom prouve qu'il achète en public. Une absence de
    signal ne prouve rien — le proxy reste non mesuré, jamais « non exposé ».
    """
    rows = [s for s in (signals or []) if isinstance(s, dict)]
    public = True if any(str(s.get("type") or "") in {"award", "tender"} for s in rows) else None

    statut, evidence = statut_from_registry(
        size_class=company.get("sizeClass") or company.get("category"),
        naf_code=company.get("nafCode"),
        flags=company.get("registryFlags"),
    )
    etablissements = company.get("establishmentCount")
    if etablissements is None:
        etablissements = company.get("etablissementCount")
    try:
        etablissements = int(etablissements) if etablissements is not None else None
    except (TypeError, ValueError):
        etablissements = None

    # Le CODE de tranche d'abord — il est exact ; le libellé ensuite, qui ne
    # l'est pas (« 250+ salariés » se lit 250 alors que l'entreprise en a 9 000).
    headcount = headcount_from_tranche(company.get("headcountTranche"))
    if headcount is None:
        headcount = company.get("headcount") or company.get("headcountRange")

    base = access_barrier(
        statut=statut,
        statut_evidence=evidence,
        headcount=headcount,
        # La cotation n'est jamais mesurée : aucune source publique gratuite ne
        # la lie à un SIREN. Le proxy le DIT plutôt que de répondre « non cotée ».
        listed=None,
        public_procurement=public,
        etablissements=etablissements,
        creation_date=company.get("creationDate"),
        now=now,
    )
    corrected = apply_corrections(base, correcting_signals(rows, now=now))
    # L'avertissement se pose APRÈS les corrections et sur les deux chemins : ne
    # pas savoir estimer la barrière n'empêche pas de savoir qu'une procédure
    # est en cours, ce sont deux questions différentes.
    return {**corrected, "warning": collective_proceeding(legal_signals, now=now)}


def apply_corrections(barrier: AccessBarrier, corrections: list[dict[str, Any]]) -> AccessBarrier:
    """Applique les corrections datées APRÈS le score de base (§7).

    Un score non estimable le reste : corriger un score qui n'existe pas
    produirait une estimation à partir de rien. Et la classe est recalculée
    après correction — sinon un compte dont le marché se termine dans trois mois
    resterait affiché « verrouillé » alors que la porte s'ouvre.
    """
    if not corrections or not barrier["measurable"] or barrier["score"] is None:
        return barrier
    score = round(max(0.0, min(10.0, barrier["score"] + sum(float(c["delta"]) for c in corrections))), 1)
    klass, label = _class_of(score)
    accessibility = round(max(0.0, min(10.0, 10.0 - score + (BONUS_ACCESSIBILITE_DECENTRALISATION if _is_decentralised(barrier["proxies"]) else 0.0))), 1)
    return {
        **barrier,
        "score": score,
        "accessibility": accessibility,
        "access_class": klass,
        "label": label,
        "corrections": corrections,
    }


# ── Les six signaux correcteurs (§7) ────────────────────────────────────────
#
# Le score de base vient des proxies STRUCTURELS. Six signaux datés peuvent le
# corriger — deux seulement sont détectables aujourd'hui, et les quatre autres
# sont nommés plutôt que devinés.

#: Un marché qui se termine bientôt rouvre la porte : c'est la seule correction
#: qui transforme un « non » en rendez-vous daté.
CORRECTION_ECHEANCE_PROCHE = -1.5
#: Fenêtre du tome : douze mois avant l'échéance.
ECHEANCE_WINDOW_DAYS = 365


def correcting_signals(signals: Any, *, now: date | None = None) -> list[dict[str, Any]]:
    """Les corrections applicables, chacune avec sa date et sa raison.

    Rend une liste vide quand rien ne s'applique — jamais une correction « par
    défaut ». Chaque entrée porte `delta`, `label` et `evidence`, pour que
    l'écran puisse montrer POURQUOI la barrière a bougé.
    """
    today = now or datetime.now(UTC).date()
    out: list[dict[str, Any]] = []
    for signal in signals or []:
        if not isinstance(signal, dict) or str(signal.get("type") or "") != "award":
            continue
        ends = str(signal.get("endsOn") or signal.get("ends_on") or "").strip()
        if not ends:
            continue
        try:
            end = date.fromisoformat(ends[:10])
        except ValueError:
            continue
        remaining = (end - today).days
        if 0 <= remaining <= ECHEANCE_WINDOW_DAYS:
            out.append(
                {
                    "key": "echeance_proche",
                    "delta": CORRECTION_ECHEANCE_PROCHE,
                    "label": "Le marché en place arrive à échéance",
                    "evidence": f"marché public en cours jusqu'au {end.isoformat()} — "
                    "la consultation de renouvellement se prépare maintenant",
                }
            )
            break
    return out
