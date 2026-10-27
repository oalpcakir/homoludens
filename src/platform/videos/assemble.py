#!/usr/bin/env python3
"""Cut the recorded clips into the store videos: the cover still first, then the chosen frame ranges, joined with
short crossfades. H.264 (High, yuv420p, 30 fps), no audio track, +faststart.

python3 assemble.py <rec-dir> <cover-dir> <out-dir> [name ...]
<rec-dir>/<game>-<variant>/cN/00000.jpg … are the clips from t7.mjs / ka.mjs.
"""
import subprocess, sys, os

FPS = 30
XF = 0.25          # crossfade between clips, seconds
COVER = 0.6        # the static cover, held before the first crossfade

# (clip, first frame, last frame) at 30 fps; chosen by looking at the frames (ffmpeg -vf fps=2 …)
EDITS = {
    'tulip7-crazygames-1920x1080': ('t7-land', 'tulip7-cover-1920x1080.png', [
        ('c1', 0, 55), ('c1', 235, 400), ('c2', 75, 165), ('c3', 0, 85), ('c4', 5, 75), ('c5', 0, 110)]),
    'tulip7-crazygames-1080x1620': ('t7-port', 'tulip7-cover-1080x1620.png', [
        ('c1', 0, 55), ('c1', 235, 400), ('c2', 75, 165), ('c3', 0, 85), ('c4', 5, 75), ('c5', 0, 110)]),
    'kantar-crazygames-1920x1080': ('ka-land', 'kantar-cover-1920x1080.png', [
        ('c1', 0, 92), ('c1', 110, 205), ('c1', 225, 259), ('c2', 0, 90), ('c3', 30, 186)]),
    'kantar-crazygames-1080x1620': ('ka-port', 'kantar-cover-1080x1620.png', [
        ('c1', 0, 92), ('c1', 110, 205), ('c1', 225, 259), ('c2', 0, 90), ('c3', 30, 186)]),
}
FFMPEG = os.environ.get('FFMPEG', '/usr/local/bin/ffmpeg')


def build(name, rec, covers, out):
    src, cover, cuts = EDITS[name]
    w, h = name.rsplit('-', 1)[1].split('x')
    args, parts = [FFMPEG, '-v', 'error', '-y'], []
    args += ['-loop', '1', '-framerate', str(FPS), '-t', str(COVER + XF), '-i', os.path.join(covers, cover)]
    for clip, a, b in cuts:
        args += ['-framerate', str(FPS), '-start_number', str(a), '-i', os.path.join(rec, src, clip, '%05d.jpg')]
    fc, durs = [], [COVER + XF]
    fc.append(f'[0]scale={w}:{h},format=yuv420p,setsar=1,fps={FPS}[v0]')
    for i, (clip, a, b) in enumerate(cuts, 1):
        n = b - a + 1
        fc.append(f'[{i}]trim=end_frame={n},setpts=PTS-STARTPTS,scale={w}:{h},format=yuv420p,setsar=1,fps={FPS}[v{i}]')
        durs.append(n / FPS)
    last, t = 'v0', durs[0]
    for i in range(1, len(durs)):
        off = t - XF
        fc.append(f'[{last}][v{i}]xfade=transition=fade:duration={XF}:offset={off:.4f}[x{i}]')
        last, t = f'x{i}', off + durs[i]
    args += ['-filter_complex', ';'.join(fc), '-map', f'[{last}]', '-an',
             '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
             '-r', str(FPS), '-movflags', '+faststart', os.path.join(out, name + '.mp4')]
    subprocess.run(args, check=True)
    print(f'{name}.mp4  {t:.2f}s')


if __name__ == '__main__':
    rec, covers, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    for name in (sys.argv[4:] or EDITS):
        if EDITS[name][2]:
            build(name, rec, covers, out)
