import { Screen, Stage } from "../Stage";
export const Export = () => (
  <Stage
    number="07 / 08"
    category="CSV EXPORT"
    title={
      <>
        Your next report
        <br />
        starts here.
      </>
    }
    caption="Export student sessions to a spreadsheet."
    light
  >
    <Screen
      asset="export"
      top={870}
      height={220}
      imageWidth={952}
      origin="88% 5%"
      zoom={1.015}
    />
  </Stage>
);
