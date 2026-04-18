from app.llm.base import LlmExtraction, LlmMeasurement, LlmProvider

__all__ = ["LlmExtraction", "LlmMeasurement", "LlmProvider", "get_provider"]


def get_provider():
    # Lazy import keeps lightweight modules (e.g., extractor utils) importable
    # without requiring full provider/config dependencies at import time.
    from app.llm.factory import get_provider as _get_provider

    return _get_provider()
