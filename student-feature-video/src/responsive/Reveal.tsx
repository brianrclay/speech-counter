import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Audio } from "@remotion/media";
import { Phone, Tablet } from "../reveal-v2/Device";
import { Background, CsvPreview } from "../reveal-v2/Overlays";
import { chapters } from "../reveal-v2/timeline";

// Compact portrait cameras fit above the purchase dock; landscape cameras reserve
// the left side for typography. Both use the same real app captures and timings.
const mobileCamera = [
  [0, 283, 470, 1.15, -3],
  [36, 316, 460, 1.08, 0],
  [90, 316, 460, 1.08, 0],
  [122, 105, 400, 2.1, 0],
  [333, 105, 400, 2.1, 0],
  [354, 300, 404, 1.16, 0],
  [390, 300, 404, 1.16, 0],
  [420, 105, 370, 2.1, 0],
  [560, 105, 370, 2.1, 0],
  [601, 65, 660, 0.8, 0],
  [714, 65, 660, 0.8, 0],
  [750, 300, 404, 1.16, 0],
  [777, 34, 425, 2.44, 0],
  [802, 34, 425, 2.44, 0],
  [829, 700, 505, 1.05, 3],
  [895, 700, 505, 1.05, 3],
  [938, 327, 405, 1.03, 0],
  [1019, 327, 400, 1.03, 0],
];
const desktopCamera = [
  [0, 1130, 160, 1.12, -3],
  [36, 1150, 105, 1.05, 0],
  [90, 1150, 105, 1.05, 0],
  [122, 935, 180, 2.08, 0],
  [333, 935, 180, 2.08, 0],
  [354, 1150, 105, 1.05, 0],
  [390, 1150, 105, 1.05, 0],
  [420, 935, 85, 2.08, 0],
  [560, 935, 85, 2.08, 0],
  [601, 880, 425, 0.67, 0],
  [714, 880, 425, 0.67, 0],
  [750, 1150, 105, 1.05, 0],
  [777, 920, 175, 2.1, 0],
  [802, 920, 175, 2.1, 0],
  [829, 1650, 160, 1.05, 3],
  [895, 1650, 160, 1.05, 3],
  [938, 1150, 105, 1.05, 0],
  [1019, 1150, 100, 1.05, 0],
];
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const Titles: React.FC<{ desktop: boolean }> = ({ desktop }) => {
  const frame = useCurrentFrame();
  const chapter = chapters.find((c) => frame >= c.start && frame < c.end)!;
  const local = frame - chapter.start;
  const entrance = spring({
    frame: local,
    fps: 30,
    config: { damping: 22, stiffness: 160 },
  });
  const softSubtitle = chapter.kind === "hook" || chapter.kind === "save";
  return (
    <div
      style={{
        position: "absolute",
        left: desktop ? 100 : 80,
        top: desktop ? 270 : 80,
        width: desktop ? 715 : 920,
        zIndex: 8,
        color: "#fff9ff",
        opacity: interpolate(
          local,
          chapter.kind === "close"
            ? [0, 9]
            : [
                0,
                9,
                chapter.end - chapter.start - 7,
                chapter.end - chapter.start,
              ],
          chapter.kind === "close" ? [0, 1] : [0, 1, 1, 0],
          clamp,
        ),
        translate: `0px ${24 * (1 - entrance)}px`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 17,
          marginBottom: desktop ? 38 : 25,
        }}
      >
        <Img
          src={staticFile("app-icon.png")}
          style={{ width: 44, height: 44, borderRadius: 11 }}
        />
        <span
          style={{
            fontSize: desktop ? 23 : 27,
            fontWeight: 500,
            letterSpacing: 2.7,
            color: "#e3aed8",
          }}
        >
          {chapter.label}
        </span>
      </div>
      <div
        style={{
          fontSize: desktop ? 92 : 88,
          fontWeight: 600,
          letterSpacing: -4,
          lineHeight: 1.07,
        }}
      >
        {chapter.kind === "hook" ? (
          <>
            More time
            <br />
            for students.
          </>
        ) : (
          <>
            {chapter.lines[0]}
            {!softSubtitle && (
              <>
                <br />
                {chapter.lines[1]}
              </>
            )}
          </>
        )}
      </div>
      {softSubtitle && (
        <div
          style={{
            fontSize: desktop ? 43 : 48,
            lineHeight: 1.2,
            color: "#e3aed8",
            marginTop: 20,
          }}
        >
          {chapter.lines[1]}
        </div>
      )}
    </div>
  );
};

const ResponsiveReveal: React.FC<{ desktop: boolean }> = ({ desktop }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: "Inter", overflow: "hidden" }}>
      <Audio src={staticFile("audio/close-up-34s.wav")} />
      <Background />
      <Tablet
        left={desktop ? 1120 : 410}
        top={desktop ? 135 : 475}
        scale={desktop ? 0.78 : 0.7}
      />
      <Phone poses={desktop ? desktopCamera : mobileCamera} />
      <Titles desktop={desktop} />
      <div
        style={{
          position: "absolute",
          left: desktop ? 820 : 36,
          top: desktop ? -430 : -190,
          width: 1080,
          height: 1920,
          scale: desktop ? 0.95 : 0.93,
          transformOrigin: "0 0",
          zIndex: 6,
          pointerEvents: "none",
        }}
      >
        <CsvPreview />
      </div>
      {frame >= 930 && (
        <div
          style={{
            position: "absolute",
            left: desktop ? 100 : 0,
            right: desktop ? "auto" : 0,
            top: desktop ? 745 : 1330,
            textAlign: desktop ? "left" : "center",
            color: "#f4d4ed",
            fontSize: desktop ? 38 : 40,
            fontWeight: 500,
            opacity: interpolate(frame, [930, 955], [0, 1], clamp),
            zIndex: 8,
          }}
        >
          speechcount.com
        </div>
      )}
    </AbsoluteFill>
  );
};
export const MobileReveal = () => <ResponsiveReveal desktop={false} />;
export const DesktopReveal = () => <ResponsiveReveal desktop />;
