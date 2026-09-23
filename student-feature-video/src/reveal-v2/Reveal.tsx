import { AbsoluteFill, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { Phone, Tablet } from "./Device";
import { Background, Headlines, CsvPreview, CloseCta } from "./Overlays";
export const Reveal = () => (
  <AbsoluteFill style={{ fontFamily: "Inter", overflow: "hidden" }}>
    <Audio src={staticFile("audio/close-up-34s.wav")} />
    <Background />
    <Tablet />
    <Phone />
    <Headlines />
    <CsvPreview />
    <CloseCta />
  </AbsoluteFill>
);
