"""Zones blanches — entités du groupe connues mais SANS aucun signal d'achat.

Demande Théo (Drive top-3). La structure du groupe est déjà cartographiée
(``entitiesExhaustive`` / ``meaningfulSubsidiaries`` : entités opérantes, tierées,
avec SIREN). Les signaux d'achat/activité sont déjà collectés (marchés attribués
DECP, appels d'offres BOAMP, recrutements IT, presse/budget). Ce service **croise
les deux** : une entité opérante KNOWN (registre = SIREN) qui n'apparaît dans
AUCUN signal = **zone blanche** = opportunité vierge (aucun concurrent identifié
en place → approche d'ouverture).

Règle d'honnêteté (Théo) : on ne prétend une zone blanche que si l'entité est
CONNUE (SIREN registre) ET sans le moindre signal. Une entité qu'on ne peut pas
confirmer (pas de SIREN) → ``unknown``, jamais « blanc ». Une entité couverte par
un signal → ``covered``. Rien n'est inventé ; sans structure de groupe → vide.

Le non-confirmé se sépare en DEUX natures (cf. ``entity_identity``), sans quoi le
bloc devient illisible — mesuré sur EDF : 6 entités toutes « non confirmées »,
donc zéro entité connue, donc zéro zone blanche calculable :

  - ``internalEntities`` — direction / département / équipe (DSIT, CSIRT) : pas
    une personne morale, donc PAS de SIREN par définition. Ce n'est pas un échec
    de confirmation et ça ne doit pas gonfler le compte des inconnues ;
  - ``unknownEntities`` — personne morale que le registre n'a pas tranchée, avec
    la raison exacte (homonymie non tranchée vs absence du registre).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from app.services.entity_identity import SIREN_INTERNAL, is_internal_unit, registry_query_name
from app.services.homonym_disambiguation import normalize_company_name
from app.services.text_norm import normalize_name

# Longueur mini du nom normalisé pour tenter un rapprochement entité ↔ signal :
# un nom trop court ("SG", "BU") sur-matcherait n'importe quel texte → on ne
# risque pas un faux « couvert » ni un faux « blanc », on le laisse évaluable.
_MIN_MATCH_LEN = 4

_TIER_RANK = {"p1": 1, "p2": 2, "p3": 3}


def _name_of(entity: object) -> str:
    if isinstance(entity, Mapping):
        return str(entity.get("name") or "").strip()
    return str(getattr(entity, "name", "") or "").strip()


def _siren_of(entity: object) -> str:
    if isinstance(entity, Mapping):
        return "".join(ch for ch in str(entity.get("siren") or "") if ch.isdigit())
    return ""


def _tier_rank(tier: object) -> int:
    return _TIER_RANK.get(str(tier or "").strip().lower(), 9)


def _text(*values: object) -> str:
    """Concatène + normalise des valeurs hétérogènes (str / dict / list) en un
    blob cherchable (accents/casse neutralisés)."""
    parts: list[str] = []

    def _walk(v: object) -> None:
        if v is None:
            return
        if isinstance(v, Mapping):
            for sub in v.values():
                _walk(sub)
        elif isinstance(v, (list, tuple, set)):
            for sub in v:
                _walk(sub)
        else:
            parts.append(str(v))

    for value in values:
        _walk(value)
    return normalize_name(" ".join(parts))


def _buyer_names(contracts: object) -> list[str]:
    out: list[str] = []
    for c in contracts if isinstance(contracts, list) else []:
        if isinstance(c, Mapping):
            b = str(c.get("buyer") or "").strip()
            if b:
                out.append(b)
    return out


def _covered_by(entity_norm: str, buyers_norm: list[str], blob: str) -> bool:
    """L'entité apparaît-elle dans ce faisceau de signaux ? Match précis : le nom
    complet de l'entité doit apparaître dans le texte (pas juste un token parent),
    OU coïncider avec un acheteur (dans un sens ou l'autre)."""
    if len(entity_norm) < _MIN_MATCH_LEN:
        return False
    if entity_norm in blob:
        return True
    return any(
        entity_norm in b or (len(b) >= _MIN_MATCH_LEN and b in entity_norm)
        for b in buyers_norm
    )


def build_white_spaces(
    entities: Iterable[Mapping] | None,
    *,
    awarded_contracts: object = None,
    tenders: object = None,
    job_signals: object = None,
    recent_signals: object = None,
    budget_signals: object = None,
    target_company: str | None = None,
) -> dict:
    """Croise les entités connues du groupe avec les signaux d'achat/activité.

    Retourne ``{whiteSpaces, coveredEntities, unknownEntities, summary}`` :
    - ``whiteSpaces`` — entités KNOWN (SIREN) opérantes sans aucun signal :
      opportunités vierges (name, siren, tier, type, reason) ;
    - ``coveredEntities`` — entités touchées par un signal (name, siren, signal) ;
    - ``unknownEntities`` — entités non confirmées (pas de SIREN) sans signal —
      couverture inconnue, PAS revendiquées comme blanches ;
    - ``summary`` — compteurs.

    Ne considère que les entités actionnables (``getsPlay`` != False) — le bruit
    (SCI/holdings) et le hors-secteur ne sont pas des opportunités. Exclut
    l'entité tête de groupe (le compte lui-même a toujours de la couverture web).
    Déterministe ; sans entités → tout vide.
    """
    awarded_buyers = _buyer_names(awarded_contracts)
    tender_buyers = _buyer_names(tenders)
    # Faisceaux ordonnés par force de preuve d'un ACHAT IT réel de cette entité.
    signal_sources: list[tuple[str, list[str], str]] = [
        ("marché IT attribué", [normalize_name(b) for b in awarded_buyers], _text(awarded_buyers)),
        ("appel d'offres IT", [normalize_name(b) for b in tender_buyers], _text(tender_buyers)),
        ("recrutement IT", [], _text(job_signals)),
        ("signal presse / budget", [], _text(recent_signals, budget_signals)),
    ]

    target_norm = normalize_name(target_company)
    target_key = normalize_company_name(registry_query_name(target_company)) if target_company else ""

    white: list[dict] = []
    covered: list[dict] = []
    unknown: list[dict] = []
    internal: list[dict] = []
    seen: set[str] = set()

    for entity in entities or []:
        if not isinstance(entity, Mapping):
            continue
        if entity.get("getsPlay") is False:
            continue  # bruit / hors-secteur — pas une opportunité
        name = _name_of(entity)
        if not name:
            continue
        entity_norm = normalize_name(name)
        # Tête de groupe = le compte lui-même : jamais une zone blanche. Comparé sur
        # le nom NETTOYÉ (gloses du LLM retirées, formes juridiques neutralisées) :
        # « EDF SA (maison mère) » est le compte « EDF », la comparaison brute le
        # ratait et le comptait comme une opportunité vierge.
        if entity_norm and (
            entity_norm == target_norm
            or (target_key and normalize_company_name(registry_query_name(name)) == target_key)
        ):
            continue
        dedup_key = _siren_of(entity) or entity_norm
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        matched_signal = next(
            (label for label, buyers_norm, blob in signal_sources if _covered_by(entity_norm, buyers_norm, blob)),
            None,
        )
        if matched_signal:
            covered.append({"name": name, "siren": _siren_of(entity) or None, "signal": matched_signal})
        elif _siren_of(entity):
            # KNOWN (registre) + zéro signal → zone blanche assumée.
            white.append(
                {
                    "name": name,
                    "siren": _siren_of(entity),
                    "tier": entity.get("tier"),
                    "type": entity.get("type"),
                    "reason": "aucun marché IT ni signal d'achat détecté — périmètre vierge",
                }
            )
        elif entity.get("sirenStatus") == SIREN_INTERNAL or is_internal_unit(
            name, structural_type=entity.get("type")
        ):
            # Une direction / un CSIRT n'aura JAMAIS de SIREN : ce n'est pas un
            # échec de confirmation, c'est une nature différente. La compter comme
            # « non confirmée » est trompeur.
            internal.append(
                {
                    "name": name,
                    "reason": entity.get("sirenReason")
                    or "direction interne — pas de personne morale (aucun SIREN par définition)",
                }
            )
        else:
            # Personne morale non rattachée : couverture INCONNUE, pas « blanche ».
            # On garde la raison EXACTE posée par l'étape de résolution (homonymie
            # non tranchée vs absence au registre) plutôt qu'un motif fourre-tout.
            unknown.append(
                {
                    "name": name,
                    "reason": entity.get("sirenReason")
                    or "entité non confirmée (pas de SIREN) — couverture inconnue",
                }
            )

    white.sort(key=lambda w: (_tier_rank(w.get("tier")), normalize_name(w.get("name"))))
    covered.sort(key=lambda c: normalize_name(c.get("name")))
    unknown.sort(key=lambda u: normalize_name(u.get("name")))
    internal.sort(key=lambda i: normalize_name(i.get("name")))

    return {
        "whiteSpaces": white,
        "coveredEntities": covered,
        "unknownEntities": unknown,
        "internalEntities": internal,
        "summary": {
            "knownEntities": len(white) + len(covered),
            "whiteSpaces": len(white),
            "covered": len(covered),
            "unknown": len(unknown),
            "internal": len(internal),
        },
    }


def render_white_spaces_block(white_spaces: object, *, max_items: int = 8) -> str:
    """Bloc directive compact des zones blanches pour le prompt de plan (Phase 4).

    Vide ("") quand il n'y a aucune zone blanche — le prompt ne grossit que sur
    du réel."""
    if not isinstance(white_spaces, dict):
        return ""
    ws = [w for w in (white_spaces.get("whiteSpaces") or []) if isinstance(w, dict)]
    if not ws:
        return ""
    lines = [
        "ZONES BLANCHES (entités du groupe CONNUES sans marché IT ni signal détecté — opportunités vierges) :",
    ]
    for w in ws[:max_items]:
        name = " ".join(str(w.get("name") or "").split())
        if not name:
            continue
        tier = str(w.get("tier") or "").strip()
        lines.append(f"- {name}" + (f" [{tier}]" if tier else ""))
    lines.append(
        "→ Ce sont des périmètres VIERGES : aucun concurrent titulaire identifié en place. "
        "Priorise une approche d'OUVERTURE directe (pas de déplacement d'incumbent) sur ces "
        "entités. Ne présente PAS ces zones comme certaines si l'entité n'a pas de contact identifié."
    )
    return "\n".join(lines).strip()
