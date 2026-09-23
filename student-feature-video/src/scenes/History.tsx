import { Screen, Stage } from "../Stage";
export const History = () => (
  <Stage
    number="05 / 08"
    category="AUTOMATIC SESSION HISTORY"
    title={
      <>
        Count it.
        <br />
        It’s saved.
      </>
    }
    caption="Student sessions save as you tally."
    light
  >
    <Screen
      asset="history"
      top={710}
      height={770}
      imageWidth={952}
      y={-70}
      zoom={1.015}
    />
  </Stage>
);
