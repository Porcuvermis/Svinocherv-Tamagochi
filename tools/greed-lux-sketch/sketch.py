# Эскизы кроя аппарата версии 2: плоско, свет нарисован. Поле 360×696, Y0 −57.
# Опорные места — из версии 1 (GreedJunk.SLOTS и соседи).
import math, sys

LAC, LAC_HI, LAC_LO = '#17110f', '#3b2b2c', '#070505'
BUR, BUR_HI, BUR_LO = '#6e1424', '#a32a3e', '#3a0912'
GOLD, GOLD_HI, GOLD_LO = '#c9a24a', '#f4dc94', '#6e4f18'
WOOD, WOOD_HI = '#5a1e10', '#a2492a'
RED, RED_DIM = '#ff3b2f', '#2a0605'
SCR = '#0b1020'

def defs():
    return f'''<defs>
<linearGradient id="lac" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="{LAC_HI}"/><stop offset="0.35" stop-color="{LAC}"/><stop offset="1" stop-color="{LAC_LO}"/></linearGradient>
<linearGradient id="lacH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{LAC_LO}"/><stop offset="0.25" stop-color="{LAC_HI}"/><stop offset="0.5" stop-color="{LAC}"/><stop offset="1" stop-color="{LAC_LO}"/></linearGradient>
<linearGradient id="bur" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="{BUR_HI}"/><stop offset="0.5" stop-color="{BUR}"/><stop offset="1" stop-color="{BUR_LO}"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="{GOLD_HI}"/><stop offset="0.5" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_LO}"/></linearGradient>
<linearGradient id="goldV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{GOLD_LO}"/><stop offset="0.35" stop-color="{GOLD_HI}"/><stop offset="1" stop-color="{GOLD_LO}"/></linearGradient>
<radialGradient id="ball" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#5a4a4c"/><stop offset="0.25" stop-color="{LAC}"/><stop offset="1" stop-color="#000"/></radialGradient>
<radialGradient id="jewel" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffd0b0"/><stop offset="0.3" stop-color="#e2382a"/><stop offset="1" stop-color="#4a0806"/></radialGradient>
<linearGradient id="scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16203a"/><stop offset="1" stop-color="{SCR}"/></linearGradient>
<linearGradient id="pach" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6ecd2"/><stop offset="1" stop-color="#b9a47c"/></linearGradient>
<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.3" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="liq" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c5a10"/><stop offset="0.4" stop-color="#ffdc84"/><stop offset="1" stop-color="#9c5a10"/></linearGradient>
<radialGradient id="trayglow" cx="0.5" cy="1" r="0.8"><stop offset="0" stop-color="#ff4030" stop-opacity="0.8"/><stop offset="1" stop-color="#ff4030" stop-opacity="0"/></radialGradient>
</defs>'''

def rr(x0, y0, x1, y1, r, fill, stroke=None, sw=1.2, extra=''):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" rx="{r}" fill="{fill}"{s} {extra}/>'

def inset(x0, y0, x1, y1, r=4):
    # бордовая утопленная вставка в золотом канте
    return (rr(x0, y0, x1, y1, r, 'url(#gold)') + rr(x0+1.6, y0+1.6, x1-1.6, y1-1.6, max(r-1, 1), LAC_LO) +
            rr(x0+2.6, y0+2.6, x1-2.6, y1-2.6, max(r-2, 1), 'url(#bur)'))

def belt(y, h=5, x0=0, x1=360):
    return rr(x0, y, x1, y+h, 1.5, 'url(#gold)') + f'<line x1="{x0}" y1="{y+0.8}" x2="{x1}" y2="{y+0.8}" stroke="{GOLD_HI}" stroke-width="0.6"/>'

# ---------- общие детали на опорных местах версии 1 ----------
def wheel(sockets=False):
    cx, cy, R = 22, 118, 150
    if sockets:
        return socket_round(cx, cy)
    out = f'<circle cx="{cx}" cy="{cy}" r="{R+13}" fill="url(#gold)"/><circle cx="{cx}" cy="{cy}" r="{R+9}" fill="{LAC_LO}"/>'
    n = 16
    for i in range(n):
        a0, a1 = 2*math.pi*i/n, 2*math.pi*(i+1)/n
        p = lambda a, r: f'{cx+math.cos(a)*r:.1f} {cy+math.sin(a)*r:.1f}'
        out += f'<path d="M{p(a0,0)} L{p(a0,R)} A{R} {R} 0 0 1 {p(a1,R)} Z" fill="{BUR if i%2 else LAC}"/>'
    for i in range(n):
        a = 2*math.pi*i/n
        out += f'<line x1="{cx}" y1="{cy}" x2="{cx+math.cos(a)*R:.1f}" y2="{cy+math.sin(a)*R:.1f}" stroke="{GOLD}" stroke-width="2"/>'
        out += f'<circle cx="{cx+math.cos(a)*(R+4.5):.1f}" cy="{cy+math.sin(a)*(R+4.5):.1f}" r="1.8" fill="{GOLD_HI}"/>'
    # значки секторов — цветные круги-заглушки
    icons = ['#e8b84a', '#c0503c', '#7fb35a', '#e8b84a', '#d9c7a0', '#c0503c', '#3fa38a', '#e8b84a']
    for i in range(n):
        a = 2*math.pi*(i+0.5)/n
        if math.cos(a) < 0.05: continue
        out += f'<circle cx="{cx+math.cos(a)*R*0.72:.1f}" cy="{cy+math.sin(a)*R*0.72:.1f}" r="9" fill="{icons[i%8]}" stroke="{LAC_LO}" stroke-width="1"/>'
    out += f'<circle cx="{cx}" cy="{cy}" r="22" fill="url(#gold)"/><circle cx="{cx}" cy="{cy}" r="9" fill="{GOLD_LO}"/>'
    # язычок на 3 часа
    out += f'<path d="M{cx+R+24} {cy-11} L{cx+R+24} {cy+11} L{cx+R-6} {cy} Z" fill="url(#gold)" stroke="{GOLD_LO}" stroke-width="1"/>'
    return out

def socket_round(cx, cy):
    # закрытое гнездо колеса (premium-empty): литая крышка с решёткой
    out = f'<circle cx="{cx}" cy="{cy}" r="120" fill="{LAC_LO}"/><circle cx="{cx}" cy="{cy}" r="116" fill="url(#lac)" stroke="{GOLD}" stroke-width="1.5"/>'
    for k in range(7):
        y = cy - 54 + k*18
        out += rr(cx+30, y, cx+96, y+7, 3.5, LAC_LO)
    out += rr(cx+24, cy-8, cx+60, cy+8, 3, '#000', GOLD, 1)
    return out

def pachinko(sockets=False):
    x0, y0, x1, y1 = 212, -46, 334, 274
    if sockets:
        out = rr(x0+6, y0+40, x1-6, y1-20, 8, LAC_LO) + rr(x0+9, y0+43, x1-9, y1-23, 7, 'url(#lac)', GOLD, 1.2)
        out += rr(x0+40, y0+120, x1-40, y0+150, 4, '#000', GOLD, 1)
        for k in range(4): out += rr(x0+24, y1-70+k*10, x1-24, y1-66+k*10, 2, LAC_LO)
        return out
    out = rr(x0, y0, x1, y1, 10, 'url(#lacH)') + rr(x0+3, y0+3, x1-3, y1-3, 8, 'none', GOLD, 1.4)
    gx0, gy0, gx1, gy1 = x0+10, y0+10, x1-10, y1-56
    out += f'<path d="M{gx0} {gy1} L{gx0} {gy0+50} A{(gx1-gx0)/2} 50 0 0 1 {gx1} {gy0+50} L{gx1} {gy1} Z" fill="url(#pach)" stroke="{GOLD}" stroke-width="2"/>'
    for r in range(11):
        for c in range(7):
            x = gx0+10+c*13+(6 if r%2 else 0); y = gy0+40+r*15
            if x < gx1-6 and y < gy1-8: out += f'<circle cx="{x}" cy="{y}" r="1.4" fill="{GOLD_LO}"/>'
    for k, col in enumerate(['#c0503c', '#3f74b8', '#7fb35a', '#8a5ad0']):
        out += rr(gx0+8+k*24, gy1-30, gx0+24+k*24, gy1-20, 2, col)
    out += f'<path d="M{gx0} {gy1} L{gx0} {gy0+50} A{(gx1-gx0)/2} 50 0 0 1 {gx1} {gy0+50} L{gx1} {gy1} Z" fill="url(#glass)"/>'
    out += rr(x0+8, y1-50, x1-8, y1-8, 6, 'url(#gold)')
    out += f'<circle cx="281" cy="{y1-29}" r="13" fill="{LAC_LO}"/><circle cx="281" cy="{y1-29}" r="11" fill="url(#jewel)"/>'
    return out

def screen():
    out = rr(90, 318, 290, 460, 10, 'url(#gold)') + rr(94, 322, 286, 456, 8, LAC_LO) + rr(99, 328, 281, 450, 4, 'url(#scr)')
    cols = [['#e8b84a', '#c0503c', '#d9c7a0'], ['#7fb35a', '#e8b84a', '#c0503c'], ['#d9c7a0', '#3fa38a', '#e8b84a']]
    for c in range(3):
        x = 104 + c*60
        out += rr(x, 334, x+54, 444, 3, '#141c33')
        for r in range(3):
            y = 344 + r*34
            # пиксельный значок: квадрат из клеток
            for i in range(5):
                for j in range(5):
                    if (i-2)**2 + (j-2)**2 <= 5:
                        out += f'<rect x="{x+15+i*5}" y="{y+j*5-2}" width="4.4" height="4.4" fill="{cols[c][r]}"/>'
    out += f'<line x1="101" y1="389" x2="279" y2="389" stroke="{RED}" stroke-width="1.6" opacity="0.85"/>'
    # сетка пикселей экрана — намёк
    out += f'<rect x="99" y="328" width="182" height="122" fill="url(#glass)" opacity="0.6"/>'
    return out

def dots(x0, y0, x1, y1, digits):
    # малый экран: чёрный, крупные красные точки
    out = rr(x0-2, y0-2, x1+2, y1+2, 3, 'url(#gold)') + rr(x0, y0, x1, y1, 2, '#050202')
    font = {'1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '0': ['111', '101', '101', '101', '111'],
            '×': ['000', '101', '010', '101', '000']}
    p = (y1 - y0 - 4) / 5
    x = x0 + 3
    for d in digits:
        g = font[d]
        for j, row in enumerate(g):
            for i, ch in enumerate(row):
                on = ch == '1'
                out += f'<circle cx="{x+i*p+p/2:.1f}" cy="{y0+2+j*p+p/2:.1f}" r="{p*0.38:.2f}" fill="{RED if on else RED_DIM}"/>'
        x += p*3.8
    return out

def lever():
    out = rr(300, 296, 328, 404, 14, LAC_LO) + rr(303, 300, 325, 400, 11, '#000', GOLD, 1.2)
    out += f'<rect x="311" y="304" width="6" height="88" fill="url(#goldV)"/>'
    out += f'<circle cx="314" cy="300" r="17" fill="url(#ball)" stroke="{GOLD}" stroke-width="1.2"/>'
    out += f'<path d="M297.5 300 A16.5 6 0 0 0 330.5 300 A16.5 3 0 0 1 297.5 300 Z" fill="{WOOD}"/>'
    out += f'<ellipse cx="308" cy="292" rx="5" ry="3" fill="#fff" opacity="0.45"/>'
    return out

def ready_lamp():
    return f'<circle cx="325" cy="449" r="9" fill="url(#gold)"/><circle cx="325" cy="449" r="6.5" fill="url(#jewel)"/>'

def meter(x0=54, x1=78, y0=318, y1=598):
    out = rr(x0-4, y0-4, x1+4, y1+4, 14, 'url(#gold)') + rr(x0, y0, x1, y1, 11, '#1a1414')
    lv = y1 - (y1-y0)*0.42
    out += rr(x0+3, lv, x1-3, y1-3, 9, 'url(#liq)')
    out += f'<rect x="{x0+4}" y="{y0+6}" width="3" height="{y1-y0-12}" rx="1.5" fill="#fff" opacity="0.25"/>'
    for k in range(1, 10):
        y = y0 + (y1-y0)*k/10
        out += f'<line x1="{x1+4}" y1="{y:.1f}" x2="{x1+8}" y2="{y:.1f}" stroke="{GOLD}" stroke-width="1"/>'
    return out

def coin_slot(style='oval'):
    cx, cy = 180, 516
    if style == 'snout':
        # пятак: слот — как ноздря копилки-свиньи
        out = f'<ellipse cx="{cx}" cy="{cy}" rx="30" ry="22" fill="url(#gold)"/><ellipse cx="{cx}" cy="{cy}" rx="25" ry="17.5" fill="url(#bur)"/>'
        out += rr(cx-2.5, cy-11, cx+2.5, cy+11, 2.5, '#000')
        out += f'<circle cx="{cx-13}" cy="{cy}" r="2.2" fill="{GOLD}"/><circle cx="{cx+13}" cy="{cy}" r="2.2" fill="{GOLD}"/>'
        return out
    if style == 'deco':
        out = f'<path d="M{cx-24} {cy+20} L{cx-24} {cy-6} L{cx} {cy-26} L{cx+24} {cy-6} L{cx+24} {cy+20} Z" fill="url(#gold)"/>'
        out += f'<path d="M{cx-19} {cy+16} L{cx-19} {cy-4} L{cx} {cy-20} L{cx+19} {cy-4} L{cx+19} {cy+16} Z" fill="url(#lac)"/>'
        out += rr(cx-2.5, cy-10, cx+2.5, cy+10, 2.5, '#000', GOLD, 0.8)
        return out
    out = f'<ellipse cx="{cx}" cy="{cy}" rx="22" ry="26" fill="url(#gold)"/><ellipse cx="{cx}" cy="{cy}" rx="17" ry="21" fill="url(#lac)"/>'
    out += rr(cx-2.5, cy-12, cx+2.5, cy+12, 2.5, '#000', GOLD, 0.8)
    return out

def tray():
    out = rr(120, 566, 240, 614, 8, 'url(#gold)') + rr(124, 570, 236, 610, 6, '#0a0404')
    out += rr(124, 590, 236, 610, 6, 'url(#trayglow)')
    for i, x in enumerate([150, 166, 186, 204, 172]):
        out += f'<ellipse cx="{x}" cy="{602 - (i==4)*4}" rx="7" ry="2.6" fill="url(#gold)"/>'
    return out

def piggy():
    out = rr(262, 514, 338, 614, 10, 'url(#gold)') + rr(266, 518, 334, 610, 8, '#120a08')
    import random; random.seed(3)
    for k in range(60):
        x = 270 + random.random()*60; y = 560 + random.random()*46
        out += f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="6" ry="2.4" fill="{GOLD if k%3 else GOLD_HI}" stroke="{GOLD_LO}" stroke-width="0.4"/>'
    out += rr(266, 518, 334, 610, 8, 'url(#glass)')
    return out

# ---------- варианты кроя ----------
def variant_A(sockets=False):
    """Ступени, как в референсе: три яруса, золотые пояса, вставки бордо."""
    o = rr(0, -57, 360, 640, 0, 'url(#lac)')
    # верхний ярус: крышка со скруглением, бордовые вставки по бокам
    o += rr(4, -55, 356, 288, 14, 'url(#lac)', LAC_HI, 1.2)
    o += inset(196, -40, 206, 278, 3)
    o += belt(286, 6)
    # средний ярус — уже на 10 с каждой стороны: ступень
    o += rr(0, 292, 360, 486, 0, LAC_LO)
    o += rr(12, 292, 348, 482, 10, 'url(#lac)', LAC_HI, 1)
    o += inset(92, 296, 268, 314, 3)
    o += inset(92, 462, 268, 478, 3)
    # консоль — выступ под экраном
    o += rr(4, 478, 356, 492, 4, 'url(#lacH)') + belt(490, 4)
    # цоколь
    o += rr(4, 494, 356, 628, 12, 'url(#lac)', LAC_HI, 1)
    o += inset(90, 498, 254, 562, 4)
    o += belt(626, 5)
    o += wheel(sockets) + pachinko(sockets) + screen() + lever() + ready_lamp() + meter()
    o += coin_slot('oval') + dots(104, 504, 146, 530, '1×') + tray() + piggy() + dots(270, 492, 332, 514, '200')
    return o

def variant_B(sockets=False):
    """Ар-деко фасад: две колонны во всю высоту (шкала слева, рычаг справа),
    ступенчатый венец, лучи веером под экраном, шевроны цоколя."""
    o = rr(0, -57, 360, 640, 0, 'url(#lac)')
    o += rr(4, -55, 356, 290, 4, 'url(#lac)')
    # ступенчатый венец над пачинко и колесом — уступы по краю крышки
    for k, (a, b) in enumerate([(190, 340), (200, 330)]):
        o += rr(a, -55 + k*6, b, -50 + k*6, 1, 'url(#gold)')
    o += belt(286, 5)
    # колонны: левая (шкала) и правая (рычаг) — во всю высоту табло и цоколя
    for x0, x1 in [(36, 96), (292, 344)]:
        o += rr(x0, 292, x1, 630, 6, 'url(#lacH)', GOLD, 1.4)
        for k in range(14):
            y = 300 + k*24
            o += f'<line x1="{x0+4}" y1="{y}" x2="{x1-4}" y2="{y}" stroke="{LAC_HI}" stroke-width="0.8"/>'
    # веер-солнце под экраном
    cx, cy = 180, 492
    for k in range(13):
        a = math.pi + math.pi*k/12
        o += f'<path d="M{cx} {cy} L{cx+math.cos(a-0.1)*90:.1f} {cy+math.sin(a-0.1)*30:.1f} L{cx+math.cos(a+0.1)*90:.1f} {cy+math.sin(a+0.1)*30:.1f} Z" fill="{BUR if k%2 else BUR_LO}"/>'
    o += rr(96, 482, 292, 492, 2, 'url(#gold)')
    # цоколь с шевронами
    o += rr(96, 494, 292, 630, 4, 'url(#lac)')
    for k in range(4):
        y = 618 - k*5
        o += f'<path d="M100 {y} L180 {y-10} L288 {y}" fill="none" stroke="{GOLD}" stroke-width="1.2" opacity="{1-k*0.2}"/>'
    o += wheel(sockets) + pachinko(sockets) + screen() + lever() + ready_lamp() + meter(58, 76, 312, 600)
    o += coin_slot('deco') + dots(104, 504, 146, 530, '1×') + tray() + piggy() + dots(270, 492, 332, 514, '200')
    return o

def variant_C(sockets=False):
    """Обтекаемый: всё скруглено, золотые «скоростные» полосы обегают
    корпус волной (червь), слот — пятак копилки-свиньи."""
    o = rr(0, -57, 360, 640, 0, 'url(#lac)')
    o += rr(6, -55, 354, 294, 34, 'url(#lac)', LAC_HI, 1.4)
    o += rr(8, 298, 352, 488, 28, 'url(#lac)', LAC_HI, 1.4)
    o += rr(8, 492, 352, 632, 28, 'url(#lac)', LAC_HI, 1.4)
    # волна-червь: три золотые полосы, обегающие корпус с изгибом
    for k in range(3):
        y = 470 + k*6
        o += f'<path d="M8 {y} C 90 {y-14} 130 {y+14} 180 {y} S 270 {y-14} 352 {y}" fill="none" stroke="{GOLD}" stroke-width="1.6"/>'
    for k in range(3):
        y = 280 + k*5
        o += f'<path d="M6 {y} C 120 {y+8} 240 {y-8} 354 {y}" fill="none" stroke="{GOLD}" stroke-width="1.4"/>'
    o += rr(96, 500, 254, 560, 24, 'url(#bur)', GOLD, 1.4)
    o += wheel(sockets) + pachinko(sockets) + screen() + lever() + ready_lamp() + meter()
    o += coin_slot('snout') + dots(104, 504, 146, 530, '1×') + tray() + piggy() + dots(270, 492, 332, 514, '200')
    return o

def frame():
    # видимая зона: всё вне неё — под монетами рамки (тёмная вуаль + край)
    return (f'<path d="M-10 -70 H370 V660 H-10 Z M21 -57 V639 H339 V-57 Z" fill="#2a2119" fill-rule="evenodd" opacity="0.82"/>'
            f'<rect x="21" y="-57" width="318" height="696" fill="none" stroke="{GOLD}" stroke-width="1" stroke-dasharray="4 3"/>')

def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -70 380 730" width="760" height="1460">{defs()}<rect x="-10" y="-70" width="380" height="730" fill="#2a2119"/>{body}{frame()}</svg>'

V = {'A': variant_A, 'B': variant_B, 'C': variant_C}
out = sys.argv[1]
for k, f in V.items():
    open(f'{out}{k}.svg', 'w').write(svg(f()))
    open(f'{out}{k}-empty.svg', 'w').write(svg(f(True)))

# ---------- сплав: ар-деко + обтекаемость (стримлайн модерн) ----------
def speed(x0, x1, y, n=3, gap=4.5, sw=1.4, r=0):
    o = ''
    for k in range(n):
        yy = y + k*gap
        o += f'<line x1="{x0}" y1="{yy}" x2="{x1}" y2="{yy}" stroke="{GOLD}" stroke-width="{sw}" stroke-linecap="round"/>'
    return o

def column(x0, x1, y0, y1):
    # колонна-капсула: скруглённые торцы, каннелюры (желобки), золотые капители
    w = x1 - x0
    o = rr(x0, y0, x1, y1, w/2, 'url(#lacH)', GOLD, 1.4)
    for k in range(1, 4):
        x = x0 + w*k/4
        o += f'<line x1="{x}" y1="{y0+w*0.6}" x2="{x}" y2="{y1-w*0.6}" stroke="{LAC_LO}" stroke-width="2"/>'
        o += f'<line x1="{x+1.2}" y1="{y0+w*0.6}" x2="{x+1.2}" y2="{y1-w*0.6}" stroke="{LAC_HI}" stroke-width="0.7"/>'
    for y in (y0 + w*0.45, y1 - w*0.45):
        o += speed(x0+2, x1-2, y-4, 3, 4, 1.2)
    return o

def fan(cx, cy, R, rays=11, a0=math.pi, a1=2*math.pi, cols=(BUR, BUR_LO)):
    o = ''
    for k in range(rays):
        a = a0 + (a1-a0)*k/rays; b = a0 + (a1-a0)*(k+1)/rays
        o += f'<path d="M{cx} {cy} L{cx+math.cos(a)*R:.1f} {cy+math.sin(a)*R:.1f} A{R} {R} 0 0 1 {cx+math.cos(b)*R:.1f} {cy+math.sin(b)*R:.1f} Z" fill="{cols[k%2]}"/>'
        o += f'<line x1="{cx}" y1="{cy}" x2="{cx+math.cos(a)*R:.1f}" y2="{cy+math.sin(a)*R:.1f}" stroke="{GOLD}" stroke-width="0.9"/>'
    return o

def variant_D(sockets=False):
    """Колонны-капсулы по бокам, скоростные полосы между ними, веер под
    экраном, скруглённые ярусы."""
    o = rr(0, -57, 360, 640, 0, LAC_LO)
    o += rr(4, -55, 356, 292, 30, 'url(#lac)', LAC_HI, 1.4)
    # ступенчатая корона: три скруглённых уступа над пачинко
    for k in range(3):
        o += rr(196 + k*8, -55 + k*5, 344 - k*8, -51 + k*5, 2, 'url(#gold)')
    o += speed(30, 330, 280, 3, 4.5)
    o += rr(6, 296, 354, 634, 30, 'url(#lac)', LAC_HI, 1.4)
    # веер-солнце над консолью, в полукруге
    o += f'<clipPath id="fd"><rect x="96" y="440" width="196" height="54" rx="27"/></clipPath>'
    o += f'<g clip-path="url(#fd)">{fan(194, 494, 120, 13)}</g>' + rr(96, 440, 292, 494, 27, 'none', GOLD, 1.6)
    o += speed(96, 292, 499, 3, 4.5)
    o += column(40, 92, 300, 626) + column(294, 340, 300, 474)
    o += speed(96, 252, 600, 3, 4.5)
    o += wheel(sockets) + pachinko(sockets) + screen() + lever() + ready_lamp() + meter(54, 78, 318, 598)
    o += coin_slot('snout') + dots(104, 520, 146, 546, '1×') + tray() + piggy() + dots(270, 492, 332, 514, '200')
    return o

def variant_E(sockets=False):
    """Обтекаемый корпус-капля: ярусы перетекают друг в друга скруглёнными
    уступами, полосы огибают углы; ар-деко — шевроны-ступени и лучи из-за
    колеса, ступенчатая рамка экрана."""
    o = rr(0, -57, 360, 640, 0, LAC_LO)
    o += rr(4, -55, 356, 300, 44, 'url(#lac)', LAC_HI, 1.4)
    # лучи ар-деко из-за колеса по верхнему ярусу
    o += f'<clipPath id="fe"><rect x="4" y="-55" width="200" height="355" rx="44"/></clipPath>'
    o += f'<g clip-path="url(#fe)" opacity="0.55">{fan(22, 118, 260, 24, -math.pi/2, math.pi/2, (LAC, BUR_LO))}</g>'
    # полосы огибают скруглённый угол яруса справа
    for k in range(3):
        r = 40 - k*5
        o += f'<path d="M{200} {300-4-k*5} H{356-44} A{r} {r} 0 0 0 {356-4-k*5} {300-44}" fill="none" stroke="{GOLD}" stroke-width="1.4"/>'
    o += rr(10, 304, 350, 500, 36, 'url(#lac)', LAC_HI, 1.4)
    # ступенчатая рамка экрана: три уступа-контура
    for k, c in enumerate([GOLD_LO, GOLD, GOLD_HI]):
        o += rr(84 - (2-k)*4, 312 - (2-k)*4, 296 + (2-k)*4, 466 + (2-k)*4, 14 + (2-k)*4, 'none', c, 1.3)
    o += rr(10, 504, 350, 634, 36, 'url(#lac)', LAC_HI, 1.4)
    # шевроны-ступени на цоколе
    for k in range(4):
        y = 624 - k*5
        o += f'<path d="M98 {y} L120 {y-6} L140 {y} L160 {y-6} L180 {y} L200 {y-6} L220 {y} L240 {y-6} L258 {y}" fill="none" stroke="{GOLD}" stroke-width="1" opacity="{1-k*0.22}"/>'
    o += speed(20, 340, 483, 3, 4.5)
    o += wheel(sockets) + pachinko(sockets) + screen() + lever() + ready_lamp() + meter(54, 78, 318, 598)
    o += coin_slot('snout') + dots(104, 520, 146, 546, '1×') + tray() + piggy() + dots(270, 492, 332, 514, '200')
    return o

V2 = {'D': variant_D, 'E': variant_E}
for k, f in V2.items():
    open(f'{out}{k}.svg', 'w').write(svg(f()))
    open(f'{out}{k}-empty.svg', 'w').write(svg(f(True)))

def variant_F(sockets=False):
    """Сплав D и E с ровным декором: каждый пояс несёт ОДИН мотив, и
    мотивы мягче. Верх — редкие лучи из-за колеса и корона-уступы над
    пачинко; стык ярусов — тройные полосы; середина — колонны с двумя
    желобками и двойная ступенчатая рамка экрана; под экраном — небольшой
    веер; низ — скруглённая вставка под щелью, шевроны под лотком, полосы."""
    o = rr(0, -57, 360, 640, 0, LAC_LO)
    # верхний ярус
    o += rr(4, -55, 356, 292, 34, 'url(#lac)', LAC_HI, 1.4)
    o += f'<clipPath id="ff"><rect x="4" y="-55" width="196" height="347" rx="34"/></clipPath>'
    o += f'<g clip-path="url(#ff)" opacity="0.35">{fan(22, 118, 240, 18, -math.pi/2, math.pi/2, (LAC, BUR_LO))}</g>'
    for k in range(2):
        o += rr(204 + k*10, -55 + k*5, 342 - k*10, -51 + k*5, 2, 'url(#gold)')
    for k in range(3):
        x = 199 + k*4
        o += f'<line x1="{x}" y1="-20" x2="{x}" y2="262" stroke="{GOLD}" stroke-width="1.1" opacity="0.8" stroke-linecap="round"/>'
    o += speed(34, 326, 280, 3, 4.2, 1.2)
    # средний ярус
    o += rr(6, 296, 354, 498, 30, 'url(#lac)', LAC_HI, 1.4)
    for x0, x1, y1 in [(42, 90, 492), (294, 338, 474)]:
        w = x1 - x0
        o += rr(x0, 300, x1, y1, w/2, 'url(#lacH)', GOLD, 1.2)
        o += speed(x0+4, x1-4, 300 + w*0.42, 2, 4, 1)
    for k, c in enumerate([GOLD_LO, GOLD]):
        d = (1-k)*5
        o += rr(90 - d, 318 - d, 290 + d, 460 + d, 12 + d, 'none', c, 1.2)
    o += f'<clipPath id="ff2"><rect x="128" y="470" width="104" height="26" rx="13"/></clipPath>'
    o += f'<g clip-path="url(#ff2)">{fan(180, 496, 70, 9)}</g>' + rr(128, 470, 232, 496, 13, 'none', GOLD, 1.2)
    # нижний ярус
    o += rr(6, 502, 354, 634, 30, 'url(#lac)', LAC_HI, 1.4)
    o += speed(34, 326, 506, 2, 4, 1)
    o += rr(96, 500 + 12, 256, 560, 22, 'url(#bur)', GOLD, 1.2)
    for k in range(3):
        y = 626 - k*5
        o += f'<path d="M110 {y} L130 {y-5} L150 {y} L170 {y-5} L190 {y} L210 {y-5} L230 {y} L250 {y-5}" fill="none" stroke="{GOLD}" stroke-width="1" opacity="{0.9-k*0.25}"/>'
    o += wheel(sockets) + pachinko(sockets) + screen() + lever() + ready_lamp() + meter(54, 78, 318, 598)
    o += coin_slot('snout') + dots(104, 520, 146, 546, '1×') + tray() + piggy() + dots(270, 492, 332, 514, '200')
    return o

for k, f in {'F': variant_F}.items():
    open(f'{out}{k}.svg', 'w').write(svg(f()))
    open(f'{out}{k}-empty.svg', 'w').write(svg(f(True)))
