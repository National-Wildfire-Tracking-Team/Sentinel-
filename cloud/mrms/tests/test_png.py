import os

import numpy as np
from conftest import SERVICE_DIR
from PIL import Image
import io

from png import encode_png


def _code(path):
    text = open(path, encoding='utf-8').read()
    return text[text.index('"""', 3) + 3:]  # everything after the module docstring


def test_png_writer_matches_weather_models_copy():
    twin = os.path.join(SERVICE_DIR, '..', 'weather-models', 'fields', 'png.py')
    assert _code(os.path.join(SERVICE_DIR, 'png.py')) == _code(twin)


def test_png_round_trips():
    pixels = np.random.default_rng(1).integers(0, 256, (37, 53), dtype=np.uint8)
    assert np.array_equal(np.asarray(Image.open(io.BytesIO(encode_png(pixels)))), pixels)
