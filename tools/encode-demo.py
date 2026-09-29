"""Encode native RGBA captures into transparent WebM and animated WebP."""
from pathlib import Path
from PIL import Image
import subprocess
import os
import tempfile

root = Path(__file__).resolve().parent.parent
frames_root = Path(os.environ.get('DEMO_FRAMES', str(Path(tempfile.gettempdir()) / 'imburning-gallery-frames')))
out = root / 'assets' / 'demos'
out.mkdir(parents=True, exist_ok=True)
for name in ['burning-classic', 'burning-inferno', 'hide-row-smoke', 'remove-company-explosion']:
    manifest = frames_root / name / 'frames.txt'
    lines = manifest.read_text().splitlines()
    frames, durations = [], []
    for i in range(0, len(lines)-1, 2):
        frames.append(Image.open(lines[i][6:-1]).convert('RGBA'))
        durations.append(round(float(lines[i+1].split()[1])*1000))
    frames[0].save(out / (name + '.webp'), save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, quality=85, method=4)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0',
                    '-i',str(manifest),'-vf','fps=24','-c:v','libvpx-vp9','-pix_fmt','yuva420p',
                    '-b:v','0','-crf','28','-auto-alt-ref','0',str(out / (name + '.webm'))], check=True)
    print(name, len(frames), 'frames;', sum(durations), 'ms', flush=True)
