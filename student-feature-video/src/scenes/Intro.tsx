import { Screen, Stage } from "../Stage";
export const Intro = () => (
  <Stage
    number="01 / 08"
    category="MEET YOUR NEW WORKFLOW"
    title={
      <>
        Every student.
        <br />
        Every step.
      </>
    }
    caption="A home for every student’s progress."
    light
  >
    <Screen
      asset="roster"
      top={640}
      height={900}
      imageWidth={952}
      zoom={1.02}
    />
  </Stage>
);
