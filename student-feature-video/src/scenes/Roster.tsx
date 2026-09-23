import { Screen, Stage } from "../Stage";
export const Roster = () => (
  <Stage
    number="02 / 08"
    category="YOUR STUDENT ROSTER"
    title={
      <>
        Your students.
        <br />
        All together.
      </>
    }
    caption="Search your roster. Find their results."
  >
    <Screen
      asset="roster"
      top={650}
      height={820}
      imageWidth={1020}
      x={-34}
      y={-150}
      zoom={1.06}
    />
  </Stage>
);
