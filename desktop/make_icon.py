import zlib, struct, json, os

W = H = 1024
BG = (11, 11, 12)
FG = (237, 237, 232)
S = W / 30.0
R = 225

# 同源剪影：extract_silhouette.py 从用户提供的照片提取，输出 silhouette_poly.json（30 viewBox）
POLY = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'silhouette_poly.json')))
poly = [(x * S, y * S) for x, y in POLY]
edges = list(zip(poly, poly[1:] + poly[:1]))

rows = []
for y in range(H):
    ys = y + 0.5
    xs = []
    for (x0, y0), (x1, y1) in edges:
        if (y0 <= ys < y1) or (y1 <= ys < y0):
            xs.append(x0 + (ys - y0) * (x1 - x0) / (y1 - y0))
    xs.sort()
    spans = list(zip(xs[0::2], xs[1::2]))
    row = bytearray()
    for x in range(W):
        cx = min(max(x, R), W - R)
        cy = min(max(y, R), H - R)
        if (x - cx) ** 2 + (y - cy) ** 2 > R * R:
            row += bytes((0, 0, 0, 0))
            continue
        xf = x + 0.5
        col = FG if any(a <= xf < b for a, b in spans) else BG
        row += bytes((*col, 255))
    rows.append(row)

raw = b''.join(b'\x00' + bytes(r) for r in rows)

def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(raw, 9))
png += chunk(b'IEND', b'')

out = '/Users/zhoujingxuan/Desktop/DocsHub/zjx/Programs/banyan/desktop/app-icon.png'
with open(out, 'wb') as f:
    f.write(png)
print('written', out, len(png), 'bytes')