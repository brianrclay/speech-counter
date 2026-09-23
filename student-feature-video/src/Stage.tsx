import React from "react";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
export const Stage: React.FC<{
  number: string;
  category: string;
  title: React.ReactNode;
  caption: string;
  children: React.ReactNode;
  light?: boolean;
}> = ({ number, category, title, caption, children, light = false }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: light ? "#eee8fd" : "#190f26",
        color: light ? "#211d30" : "#faf8ff",
        fontFamily: "Inter",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          left: 200,
          top: 550,
          borderRadius: "50%",
          background: light ? "#d9cef8" : "#51306b",
          filter: "blur(160px)",
          opacity: 0.35,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          top: 112,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 28,
          letterSpacing: 4,
          fontWeight: 500,
          color: light ? "#6448d6" : "#d0bdf2",
        }}
      >
        <span>SPEECH COUNT PRO</span>
        <span>{number}</span>
      </div>
      <Interactive.Div
        name="Feature heading"
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          top: 244,
          opacity: interpolate(frame, [8, 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [8, 32], ["0px 32px", "0px 0px"], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            fontSize: 29,
            letterSpacing: 5,
            color: light ? "#6448d6" : "#c9b3f0",
            marginBottom: 28,
          }}
        >
          {category}
        </div>
        <div
          style={{
            fontSize: 96,
            lineHeight: 1.06,
            letterSpacing: -5,
            fontWeight: 600,
          }}
        >
          {title}
        </div>
      </Interactive.Div>
      {children}
      <Interactive.Div
        name="Supporting overlay"
        style={{
          position: "absolute",
          left: 84,
          right: 100,
          top: 1570,
          fontSize: 44,
          lineHeight: 1.35,
          color: light ? "#5e526e" : "#d2c4e2",
          opacity: interpolate(frame, [28, 46], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {caption}
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 105,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 24,
          color: light ? "#756589" : "#9f8bb2",
        }}
      >
        <span>NEW STUDENT FEATURES</span>
        <span>Speech Count</span>
      </div>
    </AbsoluteFill>
  );
};
// The application pixels are unmodified browser captures; this window only crops them.
export const Screen: React.FC<{
  asset: string;
  top?: number;
  height?: number;
  imageWidth?: number;
  x?: number;
  y?: number;
  origin?: string;
  zoom?: number;
}> = ({
  asset,
  top = 650,
  height = 820,
  imageWidth = 920,
  x = 0,
  y = 0,
  origin = "50% 35%",
  zoom = 1.08,
}) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Real app close-up"
      style={{
        position: "absolute",
        left: 64,
        top,
        width: 952,
        height,
        overflow: "hidden",
        borderRadius: 36,
        background: "#faf9fc",
        boxShadow: "0 32px 100px #00000038",
        border: "1px solid #ffffff55",
        translate: interpolate(frame, [0, 35], ["0px 55px", "0px 0px"], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        opacity: interpolate(frame, [0, 20], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: origin,
          scale: interpolate(frame, [25, 145], [1, zoom], {
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <CanvasImage
          name="Actual application screenshot"
          src={staticFile("captures/" + asset + ".png")}
          style={{
            position: "absolute",
            width: imageWidth,
            height: (imageWidth * 850) / 430,
            left: x,
            top: y,
          }}
        />
      </div>
    </Interactive.Div>
  );
};
