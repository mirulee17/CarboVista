# test_gee.py
from gee_utils import init_ee, extract_s2_features

init_ee()

# Small AOI in Kuala Lumpur (≈ 0.4 km²)
aoi_coords = [[
    [101.684, 3.138],
    [101.690, 3.138],
    [101.690, 3.134],
    [101.684, 3.134],
    [101.684, 3.138]
]]

features = extract_s2_features(
    aoi_coords,
    start_date="2022-01-01",
    end_date="2022-10-31"
)

print("Extracted Sentinel-2 features:")
print(features)