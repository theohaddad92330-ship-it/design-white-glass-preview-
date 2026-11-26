"""#2297 — le catalogue des champs interdits, appliqué À LA COLLECTE de la phase 2.

Décision Louis 19/09/2026 (QCM, point 2) : le catalogue qui filtre
l'enrichissement (`packages/contracts/src/schemas/enrichment-compliance.ts`)
s'applique aussi aux contacts collectés pendant l'analyse. UN seul catalogue :
ce service ne peut pas importer du TypeScript, il en porte un MIROIR — et ce
fichier le RELIT pour faire rougir toute divergence (même garde que
`test_copilote_prompt_blocks.py` sur `tool-naming.ts`).
"""

from __future__ import annotations

import re
from pathlib import Path

from app.models.contacts import ApolloSearchHit
from app.routers.phase2_contacts import _apollo_hit_to_seed, _collected_contacts_payload
from app.services.enrichment_compliance import (
    ENRICHMENT_FORBIDDEN_KEYS,
    is_enrichment_forbidden_field,
    without_forbidden_enrichment_fields,
)

_CATALOGUE_TS = (
    Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "schemas" / "enrichment-compliance.ts"
)


def _catalogue_keys_from_contract() -> list[str]:
    """Les clés de `ENRICHMENT_FORBIDDEN_FIELDS`, dans l'ordre du contrat."""
    source = _CATALOGUE_TS.read_text(encoding="utf-8")
    start = source.index("export const ENRICHMENT_FORBIDDEN_FIELDS")
    block = source[start : source.index("] as const", start)]
    return [key for keys in re.findall(r"keys: \[([^\]]*)\]", block) for key in re.findall(r"'([^']+)'", keys)]


def test_le_miroir_porte_exactement_les_cles_du_contrat():
    contract = _catalogue_keys_from_contract()
    # La garde LIT quelque chose : un corpus vide la rendrait verte à tort.
    assert len(contract) >= 20
    assert "birth_date" in contract and "gender" in contract
    assert list(ENRICHMENT_FORBIDDEN_KEYS) == contract


def test_graphies_normalisees_comme_le_contrat():
    for key in ("birth_date", "birthDate", "BirthDate", "home-address", "Nationality"):
        assert is_enrichment_forbidden_field(key), key


def test_sait_dire_non_la_ville_le_pays_et_la_photo_restent_permis():
    # Ville et pays : plus grossiers que le code postal (c58). Photo : HORS
    # catalogue, décision Louis 19/09/2026.
    for key in ("city", "country", "photoUrl", "photo_url", "title", "fullName", "email"):
        assert not is_enrichment_forbidden_field(key), key


def test_retire_a_toute_profondeur_sans_muter_l_entree():
    payload = {
        "fullName": "Marc Dubois",
        "gender": "male",
        "apolloDetails": {
            "birthDate": "1970",
            "employmentHistory": [{"organization_name": "Acme", "nationality": "FR"}],
        },
    }
    assert without_forbidden_enrichment_fields(payload) == {
        "fullName": "Marc Dubois",
        "apolloDetails": {"employmentHistory": [{"organization_name": "Acme"}]},
    }
    assert payload["gender"] == "male"


def test_la_sortie_de_phase_2_ne_porte_aucun_champ_du_catalogue():
    # Le brut fournisseur recopié dans le parcours (la graine le transporte tel quel).
    hit = ApolloSearchHit(
        id="AP-1",
        first_name="Marc",
        last_name="Dubois",
        title="DSI",
        organization_name="Acme",
        employment_history=[{"organization_name": "Acme", "birth_date": "1970-01-01", "gender": "male"}],
    )
    # Ce qu'un modèle peut glisser dans une graine du repli web.
    web = {"fullName": "Anne Martin", "source": "brave_search", "civility": "Mme", "city": "Lyon"}
    reverse = [{"fullName": "Paul Roux", "nationality": "FR", "pastCompany": "Acme"}]

    payload = _collected_contacts_payload([_apollo_hit_to_seed(hit), web], reverse)

    assert payload["contacts"][0]["apolloDetails"]["employmentHistory"] == [{"organization_name": "Acme"}]
    assert payload["contacts"][1] == {"fullName": "Anne Martin", "source": "brave_search", "city": "Lyon"}
    assert payload["reverseProspects"] == [{"fullName": "Paul Roux", "pastCompany": "Acme"}]
    assert payload["count"] == 2


# #4178.1 — la nature d'un numéro : jamais « pro » par déduction (miroir de
# `phoneNatureFromProviderType`, @bellum/contracts).
def test_phone_nature_mobile_is_never_professional():
    from app.services.enrichment_compliance import phone_nature_from_provider_type

    assert phone_nature_from_provider_type("mobile") == "unknown"
    assert phone_nature_from_provider_type("MOBILE") == "unknown"
    assert phone_nature_from_provider_type(None) == "unknown"
    assert phone_nature_from_provider_type("") == "unknown"


def test_phone_nature_declared_and_personal_and_never_verified():
    from app.services.enrichment_compliance import phone_nature_from_provider_type

    assert phone_nature_from_provider_type("work_direct") == "professional_declared"
    assert phone_nature_from_provider_type("work_hq") == "professional_declared"
    assert phone_nature_from_provider_type("home") == "personal"
    for kind in ("mobile", "work_direct", "work_hq", "home", "other", None):
        assert phone_nature_from_provider_type(kind) != "professional_verified"
