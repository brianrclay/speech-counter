import "./index.css";
import {
  Composition,
  delayRender,
  continueRender,
  cancelRender,
  staticFile,
} from "remotion";
import { MobileReveal, DesktopReveal } from "./responsive/Reveal";
import { Reveal } from "./reveal-v2/Reveal";

const fontReady = delayRender("Load the app’s Inter fonts");
Promise.all(
  [400, 500, 600].map(async (weight) => {
    const font = new FontFace(
      "Inter",
      `url(${staticFile(`fonts/inter-latin-${weight}-normal.woff2`)})`,
      { weight: String(weight) },
    );
    await font.load();
    document.fonts.add(font);
  }),
)
  .then(() => continueRender(fontReady))
  .catch(cancelRender);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="StudentFeaturesMobile"
        component={MobileReveal}
        durationInFrames={1020}
        fps={30}
        width={1080}
        height={1440}
      />
      <Composition
        id="StudentFeaturesDesktop"
        component={DesktopReveal}
        durationInFrames={1020}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="StudentFeatureReveal"
        component={Reveal}
        durationInFrames={1020}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
