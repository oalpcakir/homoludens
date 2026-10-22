"""Merge an art pack exported from ART-BRIEF*.html into art.js.
Usage: python3 merge_pack.py tulip7-art-pack-ui.html   (then python3 build.py)"""
import sys, re, json, base64, io
from PIL import Image
SIZES = {'ui_cardback':(360,540), 'ui_frame':(400,600), 'ui_logo':(640,420), 'ui_emblem':(256,256),
         'ui_table':(1280,854), 'ui_sign':(512,512), 'ui_seal':(256,256)}
src = open(sys.argv[1], encoding='utf8').read()
pack = json.loads(re.search(r'<script type="application/json" id="tulip7-art-pack">(.*?)</script>', src, re.S).group(1).replace('<\\/script', '</script'))
art = open('art.js').read(); A = json.loads(art[len('const ART='):-1])
for k, a in pack['assets'].items():
    im = Image.open(io.BytesIO(base64.b64decode(a['data'].split(',', 1)[1])))
    im = im.convert('RGBA' if a.get('alpha') else 'RGB')
    if k == 'ui_logo':                      # trim transparent margins of the wordmark
        bb = im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox(); im = im.crop(bb) if bb else im
    w, h = SIZES.get(k, (256, 256) if k.startswith('ach_') else (320, 320)); im.thumbnail((w, h), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=72 if k == 'ui_table' else 80, method=6)
    A[k] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode(); print(k, im.size, len(b.getvalue()) // 1024, 'KB')
open('art.js', 'w').write('const ART=' + json.dumps(A) + ';')
