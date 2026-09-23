import React from "react";
import {
  Img,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { phoneCamera, screens, touches } from "./timeline";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
export function camera(frame: number, column: number) {
  const index = phoneCamera.findIndex((pose) => pose[0] > frame);
  if (index < 0) return phoneCamera[phoneCamera.length - 1][column];
  if (index === 0) return phoneCamera[0][column];
  const from = phoneCamera[index - 1];
  const to = phoneCamera[index];
  // Faster travel into a gentle, roughly 2% overshoot and a soft settle.
  // The same spring drives all four properties so housing and content stay locked.
  const travel = spring({
    frame: frame - from[0],
    fps: 30,
    durationInFrames: to[0] - from[0],
    config: { mass: 1, stiffness: 145, damping: 19 },
    durationRestThreshold: 0.001,
  });
  return from[column] + (to[column] - from[column]) * travel;
}

export const Touch: React.FC<{
  frame: number;
  at: number;
  x: number;
  y: number;
}> = ({ frame, at, x, y }) => {
  if (frame < at - 10 || frame >= at) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 17,
        top: y - 17,
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: "#fff2",
        border: "2px solid #fff",
        boxShadow: "0 0 0 2px #b371ab44",
        pointerEvents: "none",
        scale: interpolate(
          frame,
          [at - 10, at - 2, at],
          [1.3, 0.85, 0.8],
          clamp,
        ),
        opacity: interpolate(
          frame,
          [at - 10, at - 6, at - 1, at],
          [0, 0.75, 0.6, 0],
          clamp,
        ),
      }}
    />
  );
};

export const Phone: React.FC = () => {
  const frame = useCurrentFrame();
  const index = screens.reduce((last, s, i) => (s.at <= frame ? i : last), 0);
  const shot = screens[index];
  const previous = screens[Math.max(0, index - 1)];
  const fade = "fade" in shot ? shot.fade || 0 : 0;
  return (
    <div
      style={{
        position: "absolute",
        width: 414,
        height: 840,
        left: camera(frame, 1),
        top: camera(frame, 2),
        scale: camera(frame, 3),
        rotate: `${camera(frame, 4)}deg`,
        transformOrigin: "0 0",
        borderRadius: 62,
        background:
          "linear-gradient(115deg,#928b9d 0%,#28252d 12%,#0e0c13 60%,#675e73 100%)",
        padding: 12,
        boxShadow: "0 22px 45px #08031188, inset 0 0 0 1px #d8d0e080",
        zIndex: 3,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -3,
          top: 165,
          width: 3,
          height: 62,
          background: "#645c70",
          borderRadius: "3px 0 0 3px",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -3,
          top: 207,
          width: 3,
          height: 92,
          background: "#645c70",
          borderRadius: "0 3px 3px 0",
        }}
      />
      <div
        style={{
          position: "relative",
          width: 390,
          height: 816,
          overflow: "hidden",
          borderRadius: 50,
          background: "#150e1e",
          boxShadow: "0 0 0 2px #09080d",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 54,
            left: 0,
            width: 390,
            height: 744,
            overflow: "hidden",
          }}
        >
          {fade > 0 && frame < shot.at + fade ? (
            <Img
              src={staticFile(`demo/${previous.file}.png`)}
              style={{ position: "absolute", width: 390, height: 744 }}
            />
          ) : null}
          {/* Native images participate in Remotion's image-load render lock.
              CanvasImage intermittently produced blank pixels in the CSV hold. */}
          <Img
            src={staticFile(`demo/${shot.file}.png`)}
            style={{
              position: "absolute",
              width: 390,
              height: 744,
              opacity: fade
                ? interpolate(frame, [shot.at, shot.at + fade], [0, 1], clamp)
                : 1,
            }}
          />
          {touches.map((t) => (
            <Touch key={t.at} frame={frame} {...t} />
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            top: 17,
            left: 29,
            color: "#f5eafa",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          10:00
        </div>
        <div
          style={{
            position: "absolute",
            top: 11,
            left: 141,
            width: 108,
            height: 29,
            borderRadius: 20,
            background: "#030305",
            boxShadow: "inset 0 1px 1px #ffffff10",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 11,
              top: 9,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 35%,#273347,#080911 65%)",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 29,
            width: 23,
            height: 11,
            borderRadius: 3,
            border: "1px solid #f5eafa99",
            padding: 2,
          }}
        >
          <div
            style={{
              height: "100%",
              width: "85%",
              background: "#f5eafa",
              borderRadius: 1,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 7,
            left: 139,
            width: 112,
            height: 4,
            borderRadius: 4,
            background: "#f4eafa",
          }}
        />
      </div>
    </div>
  );
};

export const Tablet: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 570 || frame > 755) return null;
  const shown = frame >= 638;
  return (
    <div
      style={{
        position: "absolute",
        left:
          frame < 721
            ? 1200 -
              810 *
                spring({
                  frame: frame - 570,
                  fps: 30,
                  durationInFrames: 35,
                  config: { mass: 1, stiffness: 145, damping: 19 },
                })
            : interpolate(frame, [721, 755], [390, 1200], {
                ...clamp,
                easing: Easing.bezier(0.7, 0, 0.84, 0),
              }),
        top: 632,
        width: 808,
        height: 1064,
        padding: 20,
        borderRadius: 38,
        background:
          "linear-gradient(130deg,#82798e,#151119 15%,#292330 85%,#8e829b)",
        boxShadow: "0 24px 70px #0008",
        scale: 0.8,
        transformOrigin: "0 0",
        zIndex: 2,
      }}
    >
      <div
        style={{
          width: 768,
          height: 1024,
          overflow: "hidden",
          borderRadius: 21,
          background: "#150e1e",
          position: "relative",
        }}
      >
        <Img
          src={staticFile(`demo/${shown ? "ipad-history" : "ipad-roster"}.png`)}
          style={{ position: "absolute", width: 768, height: 1024, top: 0 }}
        />
        <Touch frame={frame} at={638} x={375} y={214} />
      </div>
    </div>
  );
};
