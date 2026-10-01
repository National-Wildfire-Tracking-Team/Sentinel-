"""
Weather-model providers. To add a model, subclass WeatherModelProvider in its
own module and register it here; the API, cache and frontend discover it from
/v1/models.
"""

from .base import (
    DatasetError,
    GridPoint,
    NoDataError,
    OutOfDomainError,
    ProviderError,
    RunIndex,
    WeatherModelProvider,
)
from .gfs import GFSProvider
from .hrrr import HRRRProvider

PROVIDER_CLASSES = {
    HRRRProvider.id: HRRRProvider,
    GFSProvider.id: GFSProvider,
}

__all__ = [
    'PROVIDER_CLASSES',
    'DatasetError',
    'GFSProvider',
    'GridPoint',
    'HRRRProvider',
    'NoDataError',
    'OutOfDomainError',
    'ProviderError',
    'RunIndex',
    'WeatherModelProvider',
]
