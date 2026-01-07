# gee_utils.py
import ee

"""
Earth Engine feature extraction for CarboVista
Matches trained ML model EXACTLY
"""

# =========================================================
# 1. INITIALISE EARTH ENGINE
# =========================================================
def init_ee():
    try:
        ee.Initialize(project="fyp-2024947449")
    except Exception:
        ee.Authenticate()
        ee.Initialize(project="fyp-2024947449")


# =========================================================
# 2. CLOUD MASK (SCL-based)
# =========================================================
def mask_s2_clouds(img):
    scl = img.select("SCL")
    mask = (
        scl.neq(3)     # cloud shadow
        .And(scl.neq(8))   # cloud
        .And(scl.neq(9))   # cirrus
        .And(scl.neq(10))  # snow
    )
    return img.updateMask(mask).divide(10000)


# =========================================================
# 3. VEGETATION INDICES (MATCH TRAINING)
# =========================================================
def add_spectral_indices(img):
    ndvi = img.normalizedDifference(["B8", "B4"]).rename("NDVI")
    gndvi = img.normalizedDifference(["B8", "B3"]).rename("GNDVI")

    vari = img.expression(
        "(G - R) / (G + R - B)", {
            "G": img.select("B3"),
            "R": img.select("B4"),
            "B": img.select("B2")
        }
    ).rename("VARI")

    bsi = img.expression(
        "((SWIR + R) - (NIR + B)) / ((SWIR + R) + (NIR + B))", {
            "SWIR": img.select("B11"),
            "R": img.select("B4"),
            "NIR": img.select("B8"),
            "B": img.select("B2")
        }
    ).rename("BSI")

    ndbi = img.normalizedDifference(["B11", "B8"]).rename("NDBI")
    nbr = img.normalizedDifference(["B8", "B12"]).rename("NBR")

    return img.addBands([ndvi, gndvi, vari, bsi, ndbi, nbr])


# =========================================================
# 4. VEGETATION MASK
# =========================================================
def mask_non_vegetation(img, ndvi_threshold=0.25):
    return img.updateMask(img.select("NDVI").gte(ndvi_threshold))


# =========================================================
# 5. PIXEL-WISE EXTRACTION (SPATIAL DSS)
# =========================================================
def extract_s2_pixels(
    aoi_coords,
    start_date,
    end_date,
    scale=10,
    ndvi_threshold=0.25
):
    """
    Returns pixel-wise Sentinel-2 features for ML inference
    Each row = one pixel (geometry included)
    """

    aoi = ee.Geometry.Polygon(aoi_coords)

    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .map(mask_s2_clouds)
        .map(add_spectral_indices)
        .map(lambda img: mask_non_vegetation(img, ndvi_threshold))
    )

    composite = (
        s2.median()
        .select([
            "B2","B3","B4","B8","B11","B12",
            "GNDVI","VARI","BSI","NDBI","NBR","NDVI"
        ])
        .reproject(crs="EPSG:4326", scale=scale)
    )

    samples = composite.sample(
        region=aoi,
        scale=scale,
        geometries=True,
        numPixels=20000
    )

    return samples


# =========================================================
# 6. AOI MEAN FEATURES (DEBUG / BASELINE)
# =========================================================
def extract_s2_features(aoi_coords, start_date, end_date):
    """
    Returns ONE feature vector (AOI mean)
    """

    aoi = ee.Geometry.Polygon(aoi_coords)

    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterDate(start_date, end_date)
        .filterBounds(aoi)
        .map(mask_s2_clouds)
        .map(add_spectral_indices)
    )

    composite = s2.median().select([
        "B2","B3","B4","B8","B11","B12",
        "GNDVI","VARI","BSI","NDBI","NBR","NDVI"
    ])

    stats = composite.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=10,
        maxPixels=1e9
    )

    return stats.getInfo()