from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import A4
import io
import base64


def decode_image(data_url, width):
    header, encoded = data_url.split(",", 1)
    binary = base64.b64decode(encoded)
    img = Image(io.BytesIO(binary))
    img.drawWidth = width
    img.drawHeight = width * img.imageHeight / img.imageWidth
    return img


def build_pdf(stats, images):
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    elements = []

    # --------------------------------------------------
    # Title
    # --------------------------------------------------
    elements.append(Paragraph(
        "<b>CARBOVISTA — Spatial Tree Carbon Assessment</b>",
        styles["Title"]
    ))

    elements.append(Spacer(1, 12))

    # --------------------------------------------------
    # AOI metadata
    # --------------------------------------------------
    elements.append(Paragraph(
        f"<b>Location:</b> {stats['aoi_address']}",
        styles["Normal"]
    ))
    elements.append(Paragraph(
        f"<b>AOI Area:</b> {stats['aoi_area_km2']} km²",
        styles["Normal"]
    ))
    elements.append(Paragraph(
        f"<b>Analysis Period:</b> {stats['start_date']} → {stats['end_date']}",
        styles["Normal"]
    ))

    elements.append(Spacer(1, 16))

    # --------------------------------------------------
    # KPIs
    # --------------------------------------------------
    elements.append(Paragraph(
        f"<b>Mean Tree Carbon:</b> {stats['mean_acd']:.2f} kg C",
        styles["Normal"]
    ))
    elements.append(Paragraph(
        f"<b>Total Carbon (AOI):</b> {stats['total_carbon']:.2f} kg C",
        styles["Normal"]
    ))
    elements.append(Paragraph(
        f"<b>Analysed Pixels:</b> {stats['n_pixels']}",
        styles["Normal"]
    ))
    elements.append(Paragraph(
        f"<b>Prediction Confidence:</b> {stats['confidence_score']}",
        styles["Normal"]
    ))

    elements.append(Spacer(1, 22))

    # --------------------------------------------------
    # Figure 1 — Map
    # --------------------------------------------------
    elements.append(Paragraph(
        "<b>Spatial Carbon Distribution (GIS)</b>",
        styles["Heading2"]
    ))

    if "map" in images:
        elements.append(Spacer(1, 8))
        elements.append(decode_image(images["map"], 440))
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(
            "<i>Figure 1. Spatial distribution of predicted above-ground tree carbon "
            "within the selected area of interest (AOI). Each point represents a "
            "Sentinel-2 pixel coloured by predicted carbon magnitude.</i>",
            styles["Italic"]
        ))

    elements.append(Spacer(1, 18))

    # --------------------------------------------------
    # Figure 2 — Histogram
    # --------------------------------------------------
    elements.append(Paragraph(
        "<b>Tree Carbon Distribution</b>",
        styles["Heading2"]
    ))

    elements.append(Spacer(1, 8))
    elements.append(decode_image(images["histogram"], 360))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(
        "<i>Figure 2. Histogram showing the frequency distribution of predicted "
        "tree carbon values across all analysed pixels within the AOI.</i>",
        styles["Italic"]
    ))

    elements.append(Spacer(1, 18))

    # --------------------------------------------------
    # Figure 3 — Pie chart
    # --------------------------------------------------
    elements.append(Paragraph(
        "<b>Carbon Class Breakdown</b>",
        styles["Heading2"]
    ))

    elements.append(Spacer(1, 8))
    elements.append(decode_image(images["pie"], 260))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(
        "<i>Figure 3. Proportional breakdown of low, medium, and high tree carbon "
        "classes derived from pixel-level predictions.</i>",
        styles["Italic"]
    ))

    # --------------------------------------------------
    # Build document
    # --------------------------------------------------
    doc.build(elements)
    buffer.seek(0)

    return buffer
