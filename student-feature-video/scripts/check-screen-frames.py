"""Inspect the exposed phone tab bar for the reported blank-frame regression."""
import subprocess, json, sys
from pathlib import Path

def inspect(video):
    # Sample the exposed tab bar outside the CSV card for each camera layout.
    probe = json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', video]))['streams'][0]
    crops = {(1080, 1920): (320, 150, 650, 1530), (1080, 1440): (180, 40, 820, 1300), (1920, 1080): (90, 35, 1780, 958)}
    w, h, x, y = crops[(probe['width'], probe['height'])]
    raw = subprocess.check_output(['/opt/homebrew/bin/ffmpeg','-v','error','-ss','28','-t','1.5','-i',video,'-vf',f'crop={w}:{h}:{x}:{y},format=gray','-f','rawvideo','pipe:1'])
    n=w*h
    samples=[]
    for i in range(len(raw)//n):
        frame=raw[i*n:(i+1)*n]
        bright=sum(p>100 for p in frame)/n
        samples.append({'frame':840+i,'bright_fraction':round(bright,5)})
    return {'file':video,'frames_checked':len(samples),'blank_screen_frames':[s['frame'] for s in samples if s['bright_fraction']<.01],'min_bright_fraction':min(s['bright_fraction'] for s in samples),'samples':samples}
results=[inspect(p) for p in sys.argv[1:]]
Path('out/review').mkdir(parents=True, exist_ok=True)
with open('out/review/flicker-regression.json','w') as f:json.dump(results,f,indent=2)
for r in results:print({k:v for k,v in r.items() if k!='samples'})
if any(r['blank_screen_frames'] or r['frames_checked'] != 45 for r in results):raise SystemExit('Blank screen frames remain')
