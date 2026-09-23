import { Screen, Stage } from "../Stage";
export const Progress = () => (
  <Stage
    number="06 / 08"
    category="PROGRESS AT A GLANCE"
    title={
      <>
        See the story
        <br />
        in every session.
      </>
    }
    caption="Review dates, targets, and accuracy."
  >
    <Screen
      asset="history"
      top={650}
      height={850}
      imageWidth={952}
      y={-810}
      zoom={1.06}
    />
  </Stage>
);
