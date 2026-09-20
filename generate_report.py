from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "reports" / "verifygem-compliance-report.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Brand", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, leading=29, textColor=colors.HexColor("#0b2f69"), spaceAfter=3))
styles.add(ParagraphStyle(name="Sub", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#5f718e")))
styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=colors.HexColor("#173a6d"), spaceBefore=15, spaceAfter=8))
styles.add(ParagraphStyle(name="Tiny", parent=styles["Normal"], fontSize=8, leading=10, textColor=colors.HexColor("#71819b")))
styles.add(ParagraphStyle(name="Cell", parent=styles["Normal"], fontSize=8, leading=10, textColor=colors.HexColor("#293b59")))

def p(text, style="Cell"):
    return Paragraph(text, styles[style])

def status(label):
    tone = {"Verified": "#197a54", "Needs review": "#a45e07", "Missing": "#c53d4e"}[label]
    return Paragraph(f'<font color="{tone}"><b>{label}</b></font>', styles["Cell"])

checks = [
    ("Valid GST registration certificate", "Clause 4.1 - Eligibility", "Verified", "98%", "GSTIN 29AABCT4812H1ZV; bidder identity aligned."),
    ("Average annual turnover >= INR 2 Cr", "Clause 4.3 - Financial capacity", "Verified", "94%", "INR 2.46 Cr average inferred from FY22-FY24 statements."),
    ("Completed 2 similar projects in last 3 years", "Clause 5.2 - Experience", "Needs review", "71%", "One project matches; second completion proof is absent."),
    ("ISO 27001:2022 certification", "Clause 6.1 - Information security", "Missing", "99%", "No valid supporting certificate located in the evidence bundle."),
    ("No blacklisting declaration", "Clause 7.4 - Declarations", "Verified", "91%", "Signed declaration dated 18 Sep 2026 located."),
]

doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=17*mm, leftMargin=17*mm, topMargin=15*mm, bottomMargin=14*mm)
story = []
story += [Paragraph("TENDRIX", styles["Brand"]), Paragraph("VerifyGEM - AI-Powered Bid Compliance Verification", styles["Sub"]), Spacer(1, 9)]

header = Table([[p("COMPLIANCE SCORE", "Tiny"), p("RISK LEVEL", "Tiny"), p("RECOMMENDATION", "Tiny")], [p("<b><font size=23 color='#173a6d'>78 / 100</font></b>"), p("<b><font color='#b17413'>Medium</font></b><br/>1 blocking requirement"), p("Eligible with review items<br/><font color='#63748d'>Final decision remains with the procurement officer.</font>")]], colWidths=[53*mm, 48*mm, 65*mm])
header.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#eff5ff")), ("BACKGROUND", (0,1), (-1,1), colors.HexColor("#f8fbff")), ("BOX", (0,0), (-1,-1), .6, colors.HexColor("#d5e2f4")), ("INNERGRID", (0,0), (-1,-1), .35, colors.HexColor("#dce7f4")), ("LEFTPADDING", (0,0), (-1,-1), 9), ("RIGHTPADDING", (0,0), (-1,-1), 9), ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7)]))
story += [header, Paragraph("Tender summary", styles["Section"])]

info = Table([[p("Tender"), p("Smart City IT Infrastructure")], [p("Tender ID"), p("GEM/2026/B/487192")], [p("Bidder"), p("Acme Systems Pvt. Ltd.")], [p("Report generated"), p("VerifyGEM demo report - evidence-first review")]], colWidths=[42*mm, 124*mm])
info.setStyle(TableStyle([("BACKGROUND", (0,0), (0,-1), colors.HexColor("#f5f8fc")), ("GRID", (0,0), (-1,-1), .35, colors.HexColor("#e2e9f3")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6)]))
story += [info, Paragraph("Evidence-backed compliance checks", styles["Section"])]

rows = [[p("Requirement", "Tiny"), p("Tender source", "Tiny"), p("Status", "Tiny"), p("Confidence", "Tiny"), p("Evidence and rationale", "Tiny")]]
for requirement, source, result, confidence, evidence in checks:
    rows.append([p(f"<b>{requirement}</b>"), p(source), status(result), p(confidence), p(evidence)])
table = Table(rows, colWidths=[38*mm, 30*mm, 27*mm, 20*mm, 51*mm], repeatRows=1)
table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#14396f")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .35, colors.HexColor("#dce5ef")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f9fbfe")]), ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7)]))
story += [table, Paragraph("Officer decision and auditability", styles["Section"]), p("VerifyGEM is a decision-support system. It records source evidence, AI confidence, and human overrides. Qualification or disqualification remains solely with the procurement officer.", "Sub"), Spacer(1, 10), Paragraph("TENDRIX VERIFYGEM  |  Transparent, compliant, trusted procurement", styles["Tiny"])]

doc.build(story)
print(OUTPUT)
