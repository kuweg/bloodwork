from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class MeasurementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    canonical_name: str
    display_name: str
    raw_name: str
    value: float
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    taken_at: date | None


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_filename: str
    language: str | None
    collected_at: date | None
    uploaded_at: datetime
    measurements: list[MeasurementRead]


class AggregatedPoint(BaseModel):
    taken_at: date
    value: float
    unit: str | None


class AggregatedSeries(BaseModel):
    canonical_name: str
    unit: str | None
    points: list[AggregatedPoint]


class IngestError(BaseModel):
    file: str
    error: str


class IngestSummary(BaseModel):
    directory: str
    imported: int
    skipped: int
    errors: list[IngestError]


class DataDirectoryListing(BaseModel):
    directory: str
    files: list[str]


class IngestFileResult(BaseModel):
    filename: str
    skipped_duplicate: bool
    report: ReportRead


class AttentionItem(BaseModel):
    canonical_name: str
    display_name: str
    severity: str  # "low" | "medium" | "high"
    reason: str


class AttentionResult(BaseModel):
    reports_considered: int
    items: list[AttentionItem]


class AskRequest(BaseModel):
    question: str
    model: str | None = None
    last: int | None = Field(default=None, ge=1, le=20)


class AskResponse(BaseModel):
    answer: str
    reports_considered: int
    model: str | None


class ProviderInfo(BaseModel):
    configured: str | None
    default_model: str | None
    suggested_models: list[str]


class TestInfoResponse(BaseModel):
    canonical_name: str
    title: str
    description: str
    importance: str
    mentioned_as: list[str]


class AuthRegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=256)


class AuthLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    is_active: bool


class AuthResponse(BaseModel):
    user: UserRead
