import {
  CanvasImage,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Stage } from "../Stage";
export const Outro = () => {
  const frame = useCurrentFrame();
  return (
    <Stage
      number="08 / 08"
      category="SPEECH COUNT PRO"
      title={
        <>
          More time
          <br />
          for progress.
        </>
      }
      caption="Explore the new student features."
    >
      <Interactive.Div
        name="App icon reveal"
        style={{
          position: "absolute",
          left: 280,
          top: 780,
          width: 520,
          height: 520,
          borderRadius: 110,
          overflow: "hidden",
          boxShadow: "0 30px 120px #0006",
          scale: interpolate(frame, [0, 65], [0.86, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          opacity: interpolate(frame, [10, 35], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <CanvasImage
          src={staticFile("app-icon.png")}
          style={{ width: 520, height: 520 }}
        />
      </Interactive.Div>
    </Stage>
  );
};
