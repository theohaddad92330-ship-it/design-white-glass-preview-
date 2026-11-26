"""Typed Pappers v2 client.

Public surface:

- :func:`search_company` / :func:`search_company_suggestions`
- :func:`search_companies_filtered` — registry LIST-BUILDING for Découvrir v2
- :func:`get_company`
- Pydantic models in :mod:`pappers.models`
- Typed errors :class:`PappersError`, :class:`PappersAmbiguousMatchError`,
  :class:`PappersParsingError`, :class:`PappersNoResultError` (Pappers answered
  « je ne connais pas ») and :class:`PappersUnavailableError` (Pappers could not
  answer) — the last two are deliberately distinct, see their docstrings.
- :mod:`pappers.budget` — combien d'appels FACTURÉS ce run/ce processus a
  consommés, par endpoint. Instrument de mesure, jamais un bridage.
"""

from __future__ import annotations

from . import budget
from .detail import get_company
from .discovery import search_companies_filtered, to_pappers_search_params
from .models import (
    BeneficialOwner,
    BranchOffice,
    CompanyProfile,
    CompanySearchHit,
    CompanySearchParams,
    CorporateGraph,
    Executive,
    FinancialYear,
    GroupAffiliation,
    HeadquartersAddress,
    PappersAmbiguousMatchError,
    PappersError,
    PappersNoResultError,
    PappersParsingError,
    PappersUnavailableError,
    RelatedCompany,
    RelatedPerson,
    classify_pappers_failure,
)
from .search import search_company, search_company_suggestions

__all__ = [
    "BeneficialOwner",
    "BranchOffice",
    "CompanyProfile",
    "CompanySearchHit",
    "CompanySearchParams",
    "CorporateGraph",
    "Executive",
    "FinancialYear",
    "GroupAffiliation",
    "HeadquartersAddress",
    "PappersAmbiguousMatchError",
    "PappersError",
    "PappersNoResultError",
    "PappersParsingError",
    "PappersUnavailableError",
    "RelatedCompany",
    "RelatedPerson",
    "budget",
    "classify_pappers_failure",
    "get_company",
    "search_companies_filtered",
    "search_company",
    "search_company_suggestions",
    "to_pappers_search_params",
]
