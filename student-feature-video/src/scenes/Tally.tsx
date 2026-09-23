import { Screen, Stage } from "../Stage";
export const Tally = () => (
  <Stage
    number="04 / 08"
    category="THE COUNTING FLOW YOU KNOW"
    title={
      <>
        Name. Target.
        <br />
        Tap.
      </>
    }
    caption="Track correct and incorrect responses."
  >
    <Screen
      asset="tally"
      top={800}
      height={510}
      imageWidth={980}
      x={-14}
      y={-150}
      origin="75% 20%"
      zoom={1.035}
    />
  </Stage>
);
