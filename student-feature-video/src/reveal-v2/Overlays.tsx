import {
  AbsoluteFill,
  Img,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { chapters } from "./timeline";
import rows from "./export-data.json";
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const Headlines = () => {
  const frame = useCurrentFrame();
  const chapter = chapters.find((c) => frame >= c.start && frame < c.end)!;
  const local = frame - chapter.start;
  return (
    <div
      style={{
        position: "absolute",
        left: 82,
        top: 116,
        width: 916,
        zIndex: 8,
        color: "#fff9ff",
        opacity:
          chapter.kind === "close"
            ? interpolate(local, [0, 9], [0, 1], clamp)
            : interpolate(
                local,
                [
                  0,
                  9,
                  chapter.end - chapter.start - 7,
                  chapter.end - chapter.start,
                ],
                [0, 1, 1, 0],
                clamp,
              ),
        translate: interpolate(local, [0, 17], ["0px 22px", "0px 0px"], {
          ...clamp,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 19,
          marginBottom: 32,
        }}
      >
        <Img
          src={staticFile("app-icon.png")}
          style={{ width: 48, height: 48, borderRadius: 12 }}
        />
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: 3,
            color: "#e3aed8",
          }}
        >
          {chapter.label}
        </div>
      </div>
      {chapter.kind === "hook" ? (
        <>
          <div
            style={{
              fontSize: 94,
              fontWeight: 600,
              letterSpacing: -4.5,
              lineHeight: 1.05,
            }}
          >
            More time
            <br />
            for students.
          </div>
          <div style={{ fontSize: 49, color: "#e3aed8", marginTop: 20 }}>
            Less time tracking.
          </div>
        </>
      ) : chapter.kind === "save" ? (
        <>
          <div
            style={{
              fontSize: 92,
              fontWeight: 600,
              letterSpacing: -4,
              lineHeight: 1.1,
            }}
          >
            Your students.
          </div>
          <div
            style={{
              fontSize: 53,
              color: "#e3aed8",
              marginTop: 18,
              lineHeight: 1.2,
            }}
          >
            Ready for every session.
          </div>
        </>
      ) : (
        <div
          style={{
            fontSize: chapter.kind === "close" ? 87 : 98,
            fontWeight: 600,
            lineHeight: 1.06,
            letterSpacing: -4.5,
          }}
        >
          {chapter.lines[0]}
          <br />
          {chapter.lines[1]}
        </div>
      )}
    </div>
  );
};

export const CsvPreview = () => {
  const frame = useCurrentFrame();
  if (frame < 807 || frame > 924) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        top: 665,
        width: 900,
        padding: "46px 38px 40px",
        borderRadius: 28,
        background: "#fcf9ff",
        color: "#251e30",
        zIndex: 6,
        boxShadow: "0 30px 100px #0007",
        opacity: interpolate(frame, [807, 820, 895, 918], [0, 1, 1, 0], clamp),
        translate: interpolate(
          frame,
          [807, 837, 900, 924],
          ["0px 95px", "0px 0px", "0px 0px", "0px -45px"],
          { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) },
        ),
        scale: interpolate(frame, [807, 840], [0.94, 1], {
          ...clamp,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: 3,
          color: "#6448d6",
          marginBottom: 22,
        }}
      >
        EXPORTED CSV · FILE PREVIEW
      </div>
      <div
        style={{
          fontSize: 30,
          fontFamily: "monospace",
          marginBottom: 42,
          color: "#6b6275",
        }}
      >
        speech-count-2026-09-22.csv
      </div>
      <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: -1.5 }}>
        {rows[0].Student}
      </div>
      <div
        style={{
          fontSize: 33,
          marginTop: 12,
          marginBottom: 40,
          color: "#6b6275",
        }}
      >
        {rows[0].Target}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          fontFamily: "monospace",
          fontSize: 26,
          color: "#76698a",
          padding: "0 0 20px",
          borderBottom: "2px solid #ddd3e9",
        }}
      >
        <span>Date</span>
        <span>Correct</span>
        <span>Incorrect</span>
        <span>Percent</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.Date}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            padding: "24px 0",
            borderBottom: "1px solid #e5dfee",
            fontSize: 33,
            fontFamily: "monospace",
            background: i === 0 ? "#eae1f766" : "transparent",
            opacity: interpolate(
              frame,
              [816 + i * 4, 827 + i * 4],
              [0, 1],
              clamp,
            ),
          }}
        >
          <span>{r.Date.slice(0, 10)}</span>
          <span>{r.Correct}</span>
          <span>{r.Incorrect}</span>
          <span style={{ color: "#0b7f5e", fontWeight: 600 }}>{r.Percent}</span>
        </div>
      ))}
      <div style={{ fontSize: 26, color: "#83748f", marginTop: 24 }}>
        Selected columns from the actual export
      </div>
    </div>
  );
};

export const Background = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#201229" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 85% 45%,#69467277,transparent 65%),linear-gradient(165deg,#271830,#190f22)",
          opacity: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -250,
          top: 1000,
          width: 1550,
          height: 1000,
          borderRadius: "50%",
          background: "#815594",
          filter: "blur(220px)",
          opacity: interpolate(
            frame,
            [0, 240, 570, 750, 1020],
            [0.25, 0.16, 0.35, 0.18, 0.3],
          ),
        }}
      />
    </AbsoluteFill>
  );
};

export const CloseCta = () => {
  const frame = useCurrentFrame();
  if (frame < 930) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 1705,
        textAlign: "center",
        zIndex: 8,
        color: "#f4d4ed",
        fontSize: 43,
        fontWeight: 500,
        letterSpacing: 0.5,
        opacity: interpolate(frame, [930, 955], [0, 1], clamp),
      }}
    >
      speechcount.com
    </div>
  );
};
