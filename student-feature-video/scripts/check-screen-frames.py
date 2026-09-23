"""Inspect the exposed phone tab bar for the reported blank-frame regression."""
import subprocess, json, sys

def inspect(video):
    # During the static CSV hold this crop lies entirely below the file card.
    raw = subprocess.check_output(['/opt/homebrew/bin/ffmpeg','-v','error','-ss','28','-t','1.5','-i',video,'-vf','crop=320:150:650:1530,format=gray','-f','rawvideo','pipe:1'])
    n=320*150
    samples=[]
    for i in range(len(raw)//n):
        frame=raw[i*n:(i+1)*n]
        bright=sum(p>100 for p in frame)/n
        samples.append({'frame':840+i,'bright_fraction':round(bright,5)})
    return {'file':video,'frames_checked':len(samples),'blank_screen_frames':[s['frame'] for s in samples if s['bright_fraction']<.01],'min_bright_fraction':min(s['bright_fraction'] for s in samples),'samples':samples}
results=[inspect(p) for p in sys.argv[1:]]
with open('out/review/flicker-regression.json','w') as f:json.dump(results,f,indent=2)
for r in results:print({k:v for k,v in r.items() if k!='samples'})
if results[-1]['blank_screen_frames']:raise SystemExit('Blank screen frames remain')
