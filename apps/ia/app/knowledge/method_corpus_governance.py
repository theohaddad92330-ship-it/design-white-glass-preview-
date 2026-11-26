"""La gouvernance du corpus méthode, portée côté Python (#3274.3).

## Le défaut que ce module ferme

`packages/contracts/src/schemas/method-corpus.ts` porte un champ
`governance.enabled` (et `feature_flag_key`) par règle depuis la fondation
BEL-SC-221 — une porte de désactivation explicite, votée dès le premier jour.
Personne ne la consultait : `app/services/method_knowledge.py`
(`retrieve_method_chunks`) injectait TOUJOURS les dix règles gardées et les
sept interdits de `method_rules.py`, `enabled` valant vrai ou faux — la porte
n'existait que côté schéma TypeScript, jamais côté runtime qui sert
réellement Laura. `is_rule_active()` lui donne son premier appelant.

## Pourquoi une copie, et de quoi SEULEMENT

`packages/` n'est pas dans le contexte de build Railway de `apps/ia` (même
contrainte que `app/services/ingestion_guard.py`, documentée là-bas) : une
lecture directe du JSON depuis ce module casserait en production. La copie ne
porte QUE les identifiants que `app/knowledge/method_rules.py` connaît déjà —
les 18 règles de discipline (onze gardées, sept interdits). Les 162 règles
SalesConnect (#3250, catégories ADAPTIVE_POLICY/PLAYBOOK/CASE_STUDY/
COMMERCIAL_CLAIM) et l'exemple SUPERSEDED de la spec ne sont PAS dans le
corpus citable Python — aucun chunk ne les porte — donc leur gouvernance
n'aurait ici aucun appelant, et ne serait qu'une donnée morte de plus.

`packages/contracts/src/schemas/method-corpus.runtime-governance.json` est la
PHOTO de référence (générée depuis `METHOD_CORPUS_V1`, vérifiée par
`method-corpus.runtime-governance.test.ts`) ; `tests/test_method_corpus_governance.py`
lit ce JSON et fait rougir la CI dès que la valeur Python ci-dessous s'écarte,
pour les 18 identifiants qui nous concernent ici.

## `feature_flag_key` — pas câblé, et pourquoi ce n'est pas un manque

Les 18 entrées qui nous concernent portent toutes `feature_flag_key: null`
côté `METHOD_CORPUS_V1` (seules les 162 règles SalesConnect, hors du corpus
Python, en portent un). `apps/ia` n'a aujourd'hui AUCUNE source de feature
flags actifs — en inventer une pour ce lot afficherait un état de flag qui
n'existe nulle part ailleurs, ce que la doctrine interdit. `is_rule_active()`
ne gère donc que `enabled` ; un appelant qui voudra un jour le filtre par flag
passera un ensemble de flags actifs réel, sans changer le comportement de
ceux qui n'en passent pas (byte-identique).
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

#: Miroir de `METHOD_CORPUS_RUNTIME_GOVERNANCE`, restreint aux 18 identifiants
#: que `method_rules.py` porte réellement. `True` = la règle reste injectable ;
#: `False` = désactivée en gouvernance. Aucune des 18 n'est désactivée
#: aujourd'hui — ce module donne à `governance.enabled` son premier appelant,
#: il n'invente pas une désactivation qui n'a jamais été votée.
_ENABLED_BY_RULE_ID: dict[str, bool] = {
    "plan_de_compte_hebdomadaire": True,
    "haut_et_bas_en_parallele": True,
    "fil_achats_distinct_du_fil_metier": True,
    "action_avec_proprietaire_date_resultat": True,
    "couverture_multi_roles_niveaux_entites": True,
    "consultant_capteur_avec_consentement": True,
    "objection_validee_puis_exploree": True,
    "objection_contextuelle_et_sortie_respectee": True,
    "ouverture_construit_une_conversation": True,
    "non_resultat_est_un_resultat": True,
    "quotas_historiques_sont_des_exemples": True,
    "nombres_fixes_de_volumes": True,
    "ciblage_informatique_par_defaut": True,
    "gabarits_recopies_mot_pour_mot": True,
    "promesses_de_delai_sans_engagement": True,
    "automatisation_du_reseau_professionnel": True,
    "nom_de_fournisseur_technique_dans_l_app": True,
    "anciennes_statistiques_comme_reperes": True,
    # #3262.22/.29 — les deux règles de compte de BEL-SC-233 (`method_account_rules.py`).
    "cadence_de_revue_configurable": True,
    "logo_prestigieux_ne_justifie_jamais_la_priorite": True,
}


def is_rule_active(rule_id: str) -> bool:
    """Cette règle de discipline est-elle injectable dans le contexte du chat ?

    Une règle ABSENTE de cette gouvernance reste active par défaut (byte-
    identique au comportement d'avant ce module) — seule une désactivation
    EXPLICITE, votée côté `METHOD_CORPUS_V1`, l'exclut.
    """
    return _ENABLED_BY_RULE_ID.get(rule_id, True)


# ── #3274.1 — le classement règle par règle (KEEP / MERGE / SUPERSEDED / REMOVE) ──

#: Données versionnées, lues ici : une unité classée SUPERSEDED ou
#: REMOVE_AFTER_MIGRATION n'est plus servie au retrieval. Décision de Louis :
#: en cas de doute, KEEP avec la raison « à revoir » — jamais une suppression devinée.
_CLASSIFICATION_FILE = Path(__file__).with_name("method_corpus_classification.json")

_NOT_SERVED = frozenset({"SUPERSEDED", "REMOVE_AFTER_MIGRATION"})


def _slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_text.lower()).strip("_")


def objection_unit_id(entry: dict) -> str:
    side = "consultant" if str(entry.get("side") or "client") == "consultant" else "client"
    return f"objection:{side}:{_slug(str(entry.get('objection') or ''))}"


def all_unit_ids() -> list[str]:
    """Chaque unité des sources de méthode, dans l'ordre des sources : règles
    métier, objections, playbooks sectoriels, concurrents, discipline, packs."""
    from app.knowledge import _competitors, objection_library, sector_playbooks
    from app.knowledge.business_rules import all_rules
    from app.knowledge.method_packs import METHOD_PACK_RULES
    from app.knowledge.method_rules import METHOD_REFUSALS, METHOD_RULES

    ids = [f"business_rule:{rule.id}" for rule in all_rules()]
    ids += [objection_unit_id(e) for e in objection_library() if str(e.get("objection") or "").strip()]
    ids += [f"sector:{key}" for key in sector_playbooks()]
    ids += [f"competitor:{_slug(str(c.get('name') or ''))}" for c in _competitors()]
    ids += [f"discipline:{r.id}" for r in (*METHOD_REFUSALS, *METHOD_RULES)]
    ids += [f"pack:{r.rule_id}" for r in METHOD_PACK_RULES]
    return ids


@lru_cache(maxsize=1)
def _load_classification() -> dict[str, dict]:
    rows = json.loads(_CLASSIFICATION_FILE.read_text(encoding="utf-8"))
    return {row["id"]: row for row in rows}


def classification_table() -> dict[str, dict]:
    """id d'unité → {id, source, classification, reason[, merge_into]}."""
    return _load_classification()


def is_unit_served(unit_id: str) -> bool:
    """Une unité SUPERSEDED / REMOVE_AFTER_MIGRATION ne sort plus au retrieval.
    Non classée ⇒ servie (le test de couverture fait rougir la CI avant)."""
    entry = classification_table().get(unit_id)
    return not (entry and entry["classification"] in _NOT_SERVED)


def wired_rule_ids() -> list[str]:
    """#3274.5 — les identifiants que CE module consulte réellement (`is_rule_active`
    a un appelant dans `_corpus()`), pour la console d'opérations
    (`GET /config/method-corpus-governance`, relu par
    `internal/admin/method-corpus-governance`). Les 162 règles SalesConnect n'y sont PAS (les deux règles de compte BEL-SC-233, si :
    `method_account_rules.py`) : aucun chunk Python ne les porte, les nommer ici
    ferait croire à un branchement qui n'existe pas."""
    return list(_ENABLED_BY_RULE_ID.keys())


@dataclass(frozen=True)
class RuleGuard:
    """#3285.6 — les trois champs de garde d'une règle du corpus gouverné TS
    (`MethodRule.exceptions` / `stop_condition` / `user_override_allowed`),
    portés côté Python parce que `apps/ia` ne peut pas importer
    `packages/contracts`. Lus par `method_knowledge._corpus()` : ils sortent
    dans le chunk que Laura cite, au lieu de rester un champ de schéma."""

    exceptions: tuple[str, ...] = ()
    stop_condition: str | None = None
    user_override_allowed: bool = False


#: Les 18 règles de discipline sont des INVARIANTS côté TypeScript
#: (`deriveInvariantRule` : aucune exception, aucune condition d'arrêt,
#: override refusé). Une règle qui s'écarte de ce gabarit s'écrit ICI, et
#: `test_method_corpus_governance.py` compare chaque entrée à la photo JSON.
_GUARD_BY_RULE_ID: dict[str, RuleGuard] = {
    # `adaptive_policy` : réglable par l'espace. Le logo prestigieux, lui, reste un invariant.
    "cadence_de_revue_configurable": RuleGuard(user_override_allowed=True),
}


#: #3382.a — `MethodRule.applicable_channels` côté Python. Les 20 règles de
#: discipline portent `applicable_channels: []` (tous canaux). Les SEPT règles
#: SalesConnect bornées à LinkedIn / téléphone viennent de la photo JSON
#: `method_channel_rules.json`, GÉNÉRÉE depuis `salesconnect-corpus.ts` et gardée
#: par `salesconnect-channel-rules.parity.test.ts` (contrats) : un seul endroit
#: où le canal d'une règle s'écrit (GA-26) — jamais déduit d'un mot de son titre.
_CHANNEL_RULES_FILE = Path(__file__).with_name("method_channel_rules.json")


@lru_cache(maxsize=1)
def channel_rules() -> tuple[dict, ...]:
    """Les règles gouvernées bornées à un canal : rule_id, title, recommendation,
    source_document, applicable_channels."""
    return tuple(json.loads(_CHANNEL_RULES_FILE.read_text(encoding="utf-8")))


_CHANNELS_BY_RULE_ID: dict[str, tuple[str, ...]] = {
    rule["rule_id"]: tuple(rule["applicable_channels"]) for rule in channel_rules()
}


def rule_channels(rule_id: str) -> tuple[str, ...]:
    """Les canaux auxquels la règle est bornée ; `()` = tous canaux."""
    return _CHANNELS_BY_RULE_ID.get(rule_id, ())


def rule_guard(rule_id: str) -> RuleGuard:
    return _GUARD_BY_RULE_ID.get(rule_id, RuleGuard())


def guard_sentences(rule_id: str) -> list[str]:
    """Les phrases de garde d'une règle, vides quand il n'y a rien à dire.

    Tranché sans Louis : `user_override_allowed=False` ne s'écrit PAS dans le
    chunk. La doctrine dit « une correction humaine gagne toujours » ; écrire
    « non négociable » sur dix-huit règles qui le portent par défaut de gabarit
    rendrait Laura rigide sur ce que le commercial a le droit de corriger.
    Seul l'override explicitement permis est dit."""
    guard = rule_guard(rule_id)
    sentences: list[str] = []
    if guard.exceptions:
        sentences.append("Exceptions : " + " ; ".join(guard.exceptions) + ".")
    if guard.stop_condition:
        sentences.append(f"S'arrête si : {guard.stop_condition}")
    if guard.user_override_allowed:
        sentences.append("Une correction du commercial peut l'écarter.")
    return sentences
