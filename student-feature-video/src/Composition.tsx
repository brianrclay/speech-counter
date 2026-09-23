import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Intro } from "./scenes/Intro";
import { Roster } from "./scenes/Roster";
import { Names } from "./scenes/Names";
import { Tally } from "./scenes/Tally";
import { History } from "./scenes/History";
import { Progress } from "./scenes/Progress";
import { Export } from "./scenes/Export";
import { Outro } from "./scenes/Outro";
export const StudentFeatureReveal = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={150} name="Intro">
      <Intro />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 18 })}
    />
    <TransitionSeries.Sequence durationInFrames={150} name="Roster">
      <Roster />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 18 })}
    />
    <TransitionSeries.Sequence durationInFrames={150} name="Names">
      <Names />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 18 })}
    />
    <TransitionSeries.Sequence durationInFrames={150} name="Tally">
      <Tally />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 18 })}
    />
    <TransitionSeries.Sequence durationInFrames={150} name="History">
      <History />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 18 })}
    />
    <TransitionSeries.Sequence durationInFrames={150} name="Progress">
      <Progress />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 18 })}
    />
    <TransitionSeries.Sequence durationInFrames={150} name="Export">
      <Export />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 18 })}
    />
    <TransitionSeries.Sequence durationInFrames={150} name="Outro">
      <Outro />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
