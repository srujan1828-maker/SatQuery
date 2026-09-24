from io import BytesIO
import numpy as np
from PIL import Image
from app import optical_views as views, crop_auto


def test_spectral_views_use_calibrated_bands_fixed_scale_and_masks(monkeypatch, tmp_path):
    monkeypatch.setattr(views, 'ARTIFACTS', tmp_path)
    monkeypatch.setattr(crop_auto, 'reflectance_calibration', lambda *a: {b: {'scale': .0001, 'offset': -.1} for b in ['B03', 'B04', 'B08']})
    monkeypatch.setattr(views, 'read_asset', lambda item, band, *a: np.ma.array(np.full((5, 5), {'B03': 2000, 'B04': 2000, 'B08': 4000}[band])))
    valid = np.ones((5, 5), bool); valid[0, 0] = False
    result, warnings = views.build_views({}, None, 5, np.ma.array(np.full((5, 5), 4)), valid)
    assert {v.kind for v in result} == {'scene_classes', 'ndvi', 'false_colour'}
    assert not warnings
    for v in result:
        pixels = np.array(Image.open(BytesIO((tmp_path / (v.sha256 + '.png')).read_bytes())))
        assert pixels[0, 0, 3] == 0 and pixels[1, 1, 3] == 255
    ndvi, mask = views.ndvi_values(np.ma.array([.1, -.1]), np.ma.array([.3, -.1]))
    assert abs(ndvi[0] - .5) < .0001 and list(mask) == [True, False]


def test_missing_spectral_data_preserves_scene_classes(monkeypatch, tmp_path):
    monkeypatch.setattr(views, 'ARTIFACTS', tmp_path)
    def unavailable(*args): raise ValueError('signed secret URL')
    monkeypatch.setattr(crop_auto, 'reflectance_calibration', unavailable)
    result, warnings = views.build_views({}, None, 5, np.ma.array(np.full((5, 5), 4)), np.ones((5, 5), bool))
    assert [v.kind for v in result] == ['scene_classes']
    assert warnings and 'secret' not in str(warnings)
