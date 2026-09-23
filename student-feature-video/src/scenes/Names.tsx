import { Screen, Stage } from "../Stage";
export const Names = () => (
  <Stage
    number="03 / 08"
    category="NAME SUGGESTIONS"
    title={
      <>
        Less typing.
        <br />
        More counting.
      </>
    }
    caption="Start a name. Choose from your roster."
    light
  >
    <Screen
      asset="names"
      top={740}
      height={620}
      imageWidth={1450}
      x={-55}
      y={-250}
      origin="15% 30%"
      zoom={1.05}
    />
  </Stage>
);
