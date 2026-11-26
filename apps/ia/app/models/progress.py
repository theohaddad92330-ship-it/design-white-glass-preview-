from __future__ import annotations

from pydantic import BaseModel, Field


class ProgressCallback(BaseModel):
    url: str
    account_id: str = Field(alias="accountId")
    job_id: str = Field(alias="jobId")

    model_config = {"populate_by_name": True}


class ProfilerProgressCallback(BaseModel):
    url: str
    user_id: str = Field(alias="userId")

    model_config = {"populate_by_name": True}
