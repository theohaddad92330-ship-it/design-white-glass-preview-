"""#4115 — LA GRILLE DE SIGNAUX de Découvrir (décisions Louis 12/10 et 13/10/2026).

Un seul module décide, pour chaque TYPE de signal, s'il est GARDÉ ou REJETÉ,
dans quelle tranche il se range (FORT en haut, CONTEXTE dessous), et comment
signaux et comptes se classent. Les deux chemins de Découvrir l'appellent
(`routers/discover.py` — recherche registre ; `routers/discover_signals.py` —
mode Signaux) : une règle qui vit à un seul endroit (GA-26).

Règles tranchées (rien ici ne se re-litige) :

* **Type inconnu = rejeté.** Un type absent de `SIGNAL_GRID` n'a pas de décision
  écrite : il ne sort pas.
* **Offre de STAGE = rejet** (Louis 12/10, « pas d'offres de stages dans tous les
  signaux »). L'alternance / apprentissage reste visible mais
  n'est JAMAIS un signal fort : toujours en contexte (Louis 13/10).
* **Recrutement = secteur de l'ESN**, aucun filtre IT figé (Louis 09/10).
* **Rachat / fusion = fait FORT** (Louis 29/10, #4732) — acte légal (vente, cession, fusion, absorption, scission,
  rachat, apport partiel) ou actualité qui le nomme ; jamais sans date propre.
* **Bruit = rejet** : sans date, sans titre, résultats financiers génériques.
* **5 forts + ~10 de contexte au maximum** (Louis 13/10). Un fort en trop passe
  en contexte avant la coupe du contexte ; un fait repris par N sources = UNE ligne.
* **Classement** : adéquation › fraîcheur › force, comparateur LEXICOGRAPHIQUE
  PUR. Deux signaux INDÉPENDANTS (familles de source différentes) sur un même
  compte battent un seul signal, même fort. Aucun score probabiliste, aucun
  pourcentage : rien dans ce module n'est un nombre affiché.
* **Les sources ne se nomment jamais** : l'indépendance se lit sur la FAMILLE de
  source (emploi, commande publique, registre, presse, web), jamais sur un nom.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from app.services.data_sources.bodacc import classify_announcement_kind
from app.services.dated_signals import names_merger
from app.services.internship_posting import is_internship_posting
from app.services.signal_freshness import _parse_signal_date

STRONG = "strong"
CONTEXT = "context"

#: Plafonds de la carte (Louis 13/10/2026, codés par #4115). Arbitrage de l'intégration du 15/10 :
#: R17 (#4068) les passait à 4 forts — refusé, la décision « 5 forts + ~10 contexte » tient ;
#: les « quatre faits » de #4068 sont ceux de la CARTE web (`discover-card-facts`), pas ce plafond.
MAX_STRONG = 5
MAX_CONTEXT = 10


@dataclass(frozen=True)
class Rule:
    """La décision écrite pour UN type de signal."""

    keep: bool
    tier: str | None
    #: Famille de source : deux signaux de la MÊME famille ne sont pas
    #: indépendants. Jamais affichée.
    family: str
    reason: str


@dataclass(frozen=True)
class Decision:
    keep: bool
    tier: str | None
    reason: str


# La table commitée. Les types sont ceux que Découvrir émet RÉELLEMENT
# (`discoverSignalTypeSchema`) plus `nomination` et `headcount` (nomination d'un
# décideur, effectifs) que la grille nomme pour qu'ils aient une décision le jour
# où une source les émet.
SIGNAL_GRID: dict[str, Rule] = {
    # Recrutement : le besoin le plus direct d'une ESN.
    "hiring": Rule(True, STRONG, "emploi", "un recrutement dit un besoin actuel"),
    # Appel d'offres ouvert : un besoin daté, public.
    "tender": Rule(True, STRONG, "commande_publique", "un appel d'offres est un besoin daté"),
    # Marché attribué : un contrat (et le concurrent en place).
    "award": Rule(True, STRONG, "commande_publique", "un contrat attribué est un fait d'affaires"),
    # Levée : un budget qui se débloque.
    "funding": Rule(True, STRONG, "presse", "une levée débloque un budget"),
    # Nomination d'un décideur : la fenêtre « je vous ai vu prendre le poste ».
    "nomination": Rule(True, STRONG, "presse", "un décideur nommé ouvre une fenêtre d'approche"),
    # Actualité : contexte, sauf si son texte nomme un fait fort (voir `decide_signal`).
    "business": Rule(True, CONTEXT, "presse", "une actualité éclaire, elle ne déclenche pas seule"),
    # Stack technique observée : contexte.
    "tech": Rule(True, CONTEXT, "web", "la pile technique éclaire l'angle"),
    # Effectifs : contexte.
    "headcount": Rule(True, CONTEXT, "registre", "l'effectif éclaire la taille du besoin"),
    # Vie légale : contexte (l'administratif est déjà écarté à la source).
    "legal": Rule(True, CONTEXT, "registre", "la vie légale éclaire, elle ne déclenche pas seule"),
}

# Alternance / apprentissage : visible, JAMAIS un signal fort (Louis 13/10/2026, #4115).
_WORK_STUDY_RE = re.compile(r"alternan|apprenti|apprentissage|work[- ]?study", re.IGNORECASE)

# Un fait fort nommé dans le TEXTE d'une actualité : nomination, levée, contrat,
# projet / transformation (Louis 13/10).
_STRONG_FACT_RE = re.compile(
    r"nomm|nomination|l[eè]ve de fonds|lev[ée]e|contrat|march[ée] remport|projet|programme|transformation|migration"
    r"|d[ée]ploiement",
    re.IGNORECASE,
)

# #4732 (Louis 29/10/2026) — un RACHAT / une FUSION nommé dans le texte d'une actualité : fait fort, comme un
# contrat ou une levée. (L'acte légal passe par `names_merger` / le genre « vente », voir `decide_signal`.)
_TAKEOVER_RE = re.compile(
    r"rachat|rach[èe]te|rachet[ée]|acquisition|acqui[èe]re?\b|acquis\b|fusion|absorption|absorb[ée]",
    re.IGNORECASE,
)

# Résultats financiers génériques : du bruit pour « pourquoi appeler maintenant ».
_GENERIC_FINANCIAL_RE = re.compile(
    r"r[ée]sultats?\s+(financiers?|annuels?|semestriels?|trimestriels?)|chiffre d'affaires|comptes annuels"
    r"|d[ée]p[ôo]t des comptes|rapport financier|bilan (annuel|financier)",
    re.IGNORECASE,
)

_STRENGTH = {STRONG: 2, CONTEXT: 1}


def _text(signal: Mapping[str, Any], key: str) -> str:
    return str(signal.get(key) or "").strip()


def _date_ordinal(signal: Mapping[str, Any]) -> int:
    parsed = _parse_signal_date(signal.get("date"))
    return parsed.toordinal() if parsed else 0


def decide_signal(signal: Mapping[str, Any]) -> Decision:
    """Garder ou rejeter UN signal, et dans quelle tranche. Pure, sans réseau."""
    rule = SIGNAL_GRID.get(str(signal.get("type") or ""))
    if rule is None:
        return Decision(False, None, "unknown_type")
    if not rule.keep:
        return Decision(False, None, rule.reason)
    if _date_ordinal(signal) == 0:
        return Decision(False, None, "undated")
    label = _text(signal, "label")
    if not label:
        return Decision(False, None, "empty_title")

    tier = rule.tier
    kind = signal["type"]
    if kind == "hiring":
        text = " ".join(filter(None, (label, _text(signal, "detail"), _text(signal, "contractType"))))
        if is_internship_posting(text, _text(signal, "contractType")):  # prédicat unique : internship_posting.py
            return Decision(False, None, "internship")
        # Une offre publiée pour un client ne dit rien du besoin de l'employeur
        # nommé ; une offre probablement pourvue n'est plus un signal actuel.
        if signal.get("intermediated") or signal.get("stillOpen") is False:
            tier = CONTEXT
        # Alternance / apprentissage : toujours en contexte (Louis 13/10, #4115).
        if _WORK_STUDY_RE.search(text):
            tier = CONTEXT
    elif kind == "legal":
        # #4732 — comme sur la fiche compte (`dated_signals` : vente/cession → `acquisition`, fusion, absorption,
        # scission, rachat, apport partiel) : un rapprochement de sociétés est un fait FORT, pas du contexte.
        # Une modification administrative, une procédure collective, une création restent du contexte.
        if names_merger(label) or classify_announcement_kind(None, label) == "sale":
            tier = STRONG
    elif kind == "business":
        if _STRONG_FACT_RE.search(label) or _TAKEOVER_RE.search(label):
            tier = STRONG
        elif _GENERIC_FINANCIAL_RE.search(label):
            return Decision(False, None, "generic_financial")
    # « un signal sans date propre n'est pas un pourquoi-maintenant » (#3928.1).
    if signal.get("dateIsDetection"):
        tier = CONTEXT
    return Decision(True, tier, rule.reason)


def _adequation(signal: Mapping[str, Any]) -> int:
    """Ce signal recoupe-t-il ce que l'utilisateur CHERCHE ? La seule preuve
    d'adéquation est le drapeau `keywordMatch` posé par le serveur (un seul
    lexique, #4045.1). Un 0/1 de rang, jamais affiché, jamais une proba.
    Volontairement PAS la catégorie commerciale de l'offre : elle dépend du
    type de contrat observé (CDI ou non), pas de la recherche."""
    return 1 if signal.get("keywordMatch") else 0


def _fact_key(signal: Mapping[str, Any]) -> tuple[str, str]:
    return (_text(signal, "label").casefold(), _text(signal, "date")[:10])


def arrange_signals(signals: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Filtre (grille), dédoublonne, classe (adéquation › fraîcheur › force) et
    plafonne (5 forts + 10 contexte). Chaque signal rendu porte `tier`."""
    seen: set[tuple[str, str]] = set()
    kept: list[tuple[dict[str, Any], str]] = []
    for signal in signals:
        decision = decide_signal(signal)
        if not decision.keep or decision.tier is None:
            continue
        key = _fact_key(signal)
        if key in seen:
            continue
        seen.add(key)
        kept.append(({**signal}, decision.tier))

    kept.sort(key=lambda pair: (-_adequation(pair[0]), -_date_ordinal(pair[0]), -_STRENGTH[pair[1]]))

    # V4-CORRECTIFS-C 4284.23 — la VARIÉTÉ des natures passe avant le volume : le meilleur signal de chaque
    # nature (levée, marché, nomination…) prend sa place avant que des dizaines d'offres fraîches ne remplissent
    # le plafond. Le reste se remplit au rang ; l'ordre rendu reste celui du rang (rien n'est réordonné).
    first_of_nature: list[int] = []
    natures: set[str] = set()
    for index, (signal, _tier) in enumerate(kept):
        nature = str(signal.get("type") or "")
        if nature not in natures:
            natures.add(nature)
            first_of_nature.append(index)
    order = [*first_of_nature, *(i for i in range(len(kept)) if i not in set(first_of_nature))]

    placed: dict[int, str] = {}
    strong = context = 0
    for index in order:
        tier = kept[index][1]
        if tier == STRONG and strong < MAX_STRONG:
            strong += 1
        else:
            tier = CONTEXT  # un fort en trop descend en contexte, il n'est pas perdu
            if context >= MAX_CONTEXT:
                continue
            context += 1
        placed[index] = tier

    out: list[dict[str, Any]] = []
    for index, (signal, _tier) in enumerate(kept):
        if index in placed:
            signal["tier"] = placed[index]
            out.append(signal)
    return out


def candidate_rank_key(signals: Iterable[Mapping[str, Any]]) -> tuple[int, int, int, int, int]:
    """Clé de tri d'un COMPTE (plus petit = devant), lexicographique pur :
    adéquation › deux sources indépendantes › fraîcheur › force. Un compte sans
    signal passe derrière tous les autres."""
    items = list(signals)
    if not items:
        return (1, 0, 0, 0, 0)
    adequation = max(_adequation(s) for s in items)
    families = {SIGNAL_GRID[s["type"]].family for s in items if s.get("type") in SIGNAL_GRID}
    corroborated = 1 if len(families) >= 2 else 0
    freshest = max(_date_ordinal(s) for s in items)
    strength = max((_STRENGTH.get(str(s.get("tier")), 1) for s in items), default=1)
    return (0, -adequation, -corroborated, -freshest, -strength)
