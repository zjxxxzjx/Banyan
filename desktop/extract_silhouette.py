import json
from PIL import Image, ImageDraw

SRC = '/Users/zhoujingxuan/.qoder-cn/tmp/-Users-zhoujingxuan-Desktop-DocsHub-zjx-Programs-banyan/images/b6bfbe40-e19a-4efd-a8bd-41f37735a0a7/da08e1f6-bd40-4a14-b16b-2493fe9693c3.png'
OUT = '/Users/zhoujingxuan/Desktop/DocsHub/zjx/Programs/banyan/desktop/'

im = Image.open(SRC).convert('RGB')
w, h = im.size
px = im.load()

# 底部红灌木带起始行（树干基部被灌木遮挡），先算供分类窗使用
cut = h
for y in range(int(h * 0.6), h):
    cnt = sum(1 for x in range(w) if px[x, y][0] - px[x, y][1] > 35)
    if cnt > w * 0.05:
        cut = y
        break

mask = bytearray(w * h)
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        lum = (r + g + b) / 3
        sky = (b - r > 20) and b > 110
        red = r - g > 35
        green = g > b + 12
        trunk = (not sky) and (not green) and (not red) and lum < 200 and (r - b >= 6 or (lum >= 90 and r >= b - 2))
        # 干扇空间窗：银灰树皮反射天光偏冷，与路面同色域，只能靠位置分离；腿间上方为亮天空仍开敞
        if 165 <= x <= 275 and 195 <= y < cut and not sky and not red and 50 <= lum < 200:
            trunk = True
        dark = lum < 90 and not sky and b - r <= 20 and y < 210
        if green or trunk or dark:
            mask[y * w + x] = 1

# 裁剪线以下清零
for y in range(cut, h):
    for x in range(w):
        mask[y * w + x] = 0

# 基部只保留干扇窗内的根盘，窗外路面/干草清零
for y in range(240, cut):
    for x in range(w):
        if not (175 <= x <= 270):
            mask[y * w + x] = 0

# 最大连通域
seen = bytearray(w * h)
best = []
for i in range(w * h):
    if mask[i] and not seen[i]:
        comp = [i]
        seen[i] = 1
        stack = [i]
        while stack:
            c = stack.pop()
            cx, cy = c % w, c // w
            for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        comp.append(j)
                        stack.append(j)
        if len(comp) > len(best):
            best = comp
mask = bytearray(w * h)
for i in best:
    mask[i] = 1

# 填洞（冠内天空碎斑）
bg = bytearray(w * h)
stack = [i for i in range(w) if not mask[i]] + [i for i in range((h - 1) * w, h * w) if not mask[i]]
stack += [y * w for y in range(h) if not mask[y * w]] + [y * w + w - 1 for y in range(h) if not mask[y * w + w - 1]]
for i in stack:
    bg[i] = 1
while stack:
    c = stack.pop()
    cx, cy = c % w, c // w
    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
        if 0 <= nx < w and 0 <= ny < h:
            j = ny * w + nx
            if not mask[j] and not bg[j]:
                bg[j] = 1
                stack.append(j)
for i in range(w * h):
    if not mask[i] and not bg[i]:
        mask[i] = 1

# Moore 边界追踪
DIRS = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
start = next(i for i in range(w * h) if mask[i])
cur = start
prev_dir = 4
contour = [cur]
for _ in range(w * h * 4):
    for i in range(8):
        d = (prev_dir + 1 + i) % 8
        nx, ny = cur % w + DIRS[d][0], cur // w + DIRS[d][1]
        if 0 <= nx < w and 0 <= ny < h and mask[ny * w + nx]:
            prev_dir = (d + 4) % 8
            cur = ny * w + nx
            contour.append(cur)
            break
    else:
        break
    if cur == start and len(contour) > 2:
        break
pts = [(c % w, c // w) for c in contour[:-1]]

# RDP 简化
def rdp(points, eps):
    if len(points) < 3:
        return points
    x0, y0 = points[0]
    x1, y1 = points[-1]
    dmax, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        x, y = points[i]
        if x0 == x1 and y0 == y1:
            d = ((x - x0) ** 2 + (y - y0) ** 2) ** 0.5
        else:
            d = abs((y1 - y0) * x - (x1 - x0) * y + x1 * y0 - y1 * x0) / (((y1 - y0) ** 2 + (x1 - x0) ** 2) ** 0.5)
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(points[:idx + 1], eps)[:-1] + rdp(points[idx:], eps)
    return [points[0], points[-1]]

poly = rdp(pts, 1.3)
if poly[0] == poly[-1]:
    poly = poly[:-1]

# 映射到 30 viewBox：宽 27，纵向轻度拉伸 1.2 以撑满图标
minx = min(p[0] for p in poly)
maxx = max(p[0] for p in poly)
miny = min(p[1] for p in poly)
maxy = max(p[1] for p in poly)
s = 27.0 / (maxx - minx)
sy = s * 1.2
ph = (maxy - miny) * sy
top = 15 - ph / 2
mapped = [(round(1.5 + (x - minx) * s, 2), round(top + (y - miny) * sy, 2)) for x, y in poly]

d = 'M' + 'L'.join(f'{x} {y}' for x, y in mapped) + 'Z'
with open(OUT + 'silhouette_path.txt', 'w') as f:
    f.write(d)
with open(OUT + 'silhouette_poly.json', 'w') as f:
    json.dump(mapped, f)

BG = (11, 11, 12, 255)
FG = (237, 237, 232, 255)
img = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
dr = ImageDraw.Draw(img)
dr.rounded_rectangle([0, 0, 1023, 1023], radius=225, fill=BG)
sc = 1024 / 30.0
dr.polygon([(x * sc, y * sc) for x, y in mapped], fill=FG)
img.save(OUT + 'silhouette_preview.png')
img.resize((32, 32), Image.LANCZOS).save(OUT + 'silhouette_preview32.png')
print('points', len(mapped), 'cut', cut, 'bbox', (minx, miny, maxx, maxy), 'dlen', len(d))