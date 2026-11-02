import json, sys
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

# usage: python make_cards.py [first] [last]   e.g. 12 12 to reprint card 12 (1-40)
CODES = json.load(open('card-codes.json'))
FIRST, LAST = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1, 40)
W, H = letter
M = 6.0 * inch                 # marker side, including its black border (6 x 6 cells)
u = M / 6
x0 = (W - M) / 2
y0 = (H - M) / 2 + 0.35 * inch  # sit a little above center to leave room for the footer
cx, cy = x0 + M / 2, y0 + M / 2
GAP = 0.55 * inch              # letters sit in the white margin, outside the marker

c = canvas.Canvas(f'STCS_Answer_Cards_{FIRST}-{LAST}.pdf', pagesize=letter)
c.setTitle(f'STCS Card Scan — Answer Cards {FIRST}–{LAST}')
for n in range(FIRST, LAST + 1):
    code = format(CODES[n - 1], '016b')
    c.setFillColorRGB(0, 0, 0)
    c.rect(x0, y0, M, M, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    for i in range(4):
        for j in range(4):
            if code[i * 4 + j] == '1':
                c.rect(x0 + (j + 1) * u, y0 + M - (i + 2) * u, u, u, stroke=0, fill=1)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.setFont('Helvetica-Bold', 20)
    # A top (reads normally), B right, C bottom, D left: each reads upright when its edge is on top
    for letter_, ang, (lx, ly) in [('A', 0, (cx, y0 + M + GAP)), ('B', -90, (x0 + M + GAP, cy)),
                                   ('C', 180, (cx, y0 - GAP)), ('D', 90, (x0 - GAP, cy))]:
        c.saveState(); c.translate(lx, ly); c.rotate(ang)
        c.drawCentredString(0, -7, letter_); c.restoreState()
    # card number, small, in the top-left corner of the white margin (reads with A up)
    c.setFont('Helvetica-Bold', 14)
    c.drawString(x0 - GAP + 4, y0 + M + GAP - 5, f'#{n}')
    c.setFont('Helvetica', 10); c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(W / 2, 0.55 * inch, f'STCS Card Scan  •  Card {n}  •  Hold your answer letter at the TOP')
    c.showPage()
c.save()
print('ok')
