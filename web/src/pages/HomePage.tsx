import { ScanLine } from "lucide-react";
import { Link } from "react-router";

import { ButtonLink } from "../components/ui";
import { useModelInfo } from "../lib/hooks";
import { BINS, CLASSES, classInfo } from "../lib/recycling";

/** Screens captured from the running app at 2x (public/captures); width and height are their CSS size.
 *  Retake them with the trained model: see web/README.md. */
const CAPTURES = {
  answer: { src: "/captures/answer.png", w: 635, h: 373 },
  notsure: { src: "/captures/notsure.png", w: 635, h: 512 },
  picker: { src: "/captures/picker.png", w: 1152, h: 420 },
  top3: { src: "/captures/top3.png", w: 635, h: 231 },
};

export function HomePage() {
  return (
    <>
      <Hero />
      <Snap />
      <Sort />
      <Prepare />
      <TeachAndDropOff />
      <AfterTheBin />
      <Why />
      <section className="container close">
        <h2>Got something in your hand right now?</h2>
        <div className="actions">
          <ButtonLink to="/scan">
            <ScanLine size={18} aria-hidden /> Scan an item
          </ButtonLink>
          <p className="muted">No account needed. Snap it and find out where it goes.</p>
        </div>
      </section>
    </>
  );
}

function Hero() {
  return (
    <section className="container hero">
      <figure className="hero__field" data-kind="product">
        <span className="capture capture--side">
          <img
            src={CAPTURES.notsure.src}
            width={CAPTURES.notsure.w}
            height={CAPTURES.notsure.h}
            alt="When the model is unsure, the scan screen asks which of its three guesses is right instead of naming a bin"
          />
        </span>
        <span className="capture capture--lead">
          <img
            src={CAPTURES.answer.src}
            width={CAPTURES.answer.w}
            height={CAPTURES.answer.h}
            alt="A confident answer on the scan screen: the orange bin, with tips to empty, rinse and squash the item"
            fetchPriority="high"
          />
        </span>
      </figure>
      <div className="hero__base">
        <h1>
          Snap it. Sort it.
          <br />
          Recycle it right.
        </h1>
        <div className="hero__act">
          <p className="lead">Point your phone at any item to find its Malaysian recycling bin.</p>
          <div className="actions">
            <ButtonLink to="/scan">
              <ScanLine size={18} aria-hidden /> Scan an item
            </ButtonLink>
            <ButtonLink to="/model" variant="secondary">
              How the model works
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function Snap() {
  return (
    <section className="container stage">
      <div className="stage__head opens">
        <h2>1. Snap one item</h2>
        <p>Take a photo of one item. Works with any phone camera, including iPhone HEIC photos.</p>
      </div>
      <figure className="showcase capture" data-kind="product">
        <img
          src={CAPTURES.picker.src}
          width={CAPTURES.picker.w}
          height={CAPTURES.picker.h}
          alt="The scan screen before a photo: take a photo or upload one, with three tips for the best answer"
          loading="lazy"
        />
        <figcaption>The model sees only the centre square, so the preview shows it before anything is sent.</figcaption>
      </figure>
    </section>
  );
}

function Sort() {
  return (
    <section className="container stage">
      <div className="stage__head opens">
        <h2>2. Read the answer</h2>
        <p>A CNN recognises 12 kinds of household waste and maps them to the right bin, with tips to prepare the item.</p>
      </div>
      <div className="margin-notes">
        <figure className="capture" data-kind="product">
          <img
            src={CAPTURES.top3.src}
            width={CAPTURES.top3.w}
            height={CAPTURES.top3.h}
            alt="The model's top three guesses as bars, with a green mark where “not sure” begins"
            loading="lazy"
          />
        </figure>
        <dl className="notes">
          <div>
            <dt>Says “not sure”</dt>
            <dd>Below a confidence threshold chosen on validation data, it asks you instead of guessing.</dd>
          </div>
          <div>
            <dt>Shows where it looked</dt>
            <dd>A Grad-CAM heat map shows which part of your photo drove the answer.</dd>
          </div>
          <div>
            <dt>Trained from scratch</dt>
            <dd>
              No pretrained weights: it learned from random weights on thousands of labelled photos.{" "}
              <Link to="/model" className="link">
                Read the model card
              </Link>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Prepare() {
  const { data: model } = useModelInfo();
  const binOf: Record<string, string> =
    model?.bins ?? Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, v.bin]));
  return (
    <section className="container stage">
      <div className="stage__head">
        <h2>3. Prepare it, then bin it</h2>
        <p>12 kinds of items, 7 places to put them.</p>
      </div>
      <ul className="rows binrows">
        {Object.entries(BINS).map(([key, b]) => (
          <li key={key}>
            <Link to={`/guide#${encodeURIComponent(key)}`} className={b.cls}>
              <h3>
                <span className="swatch" aria-hidden />
                {b.title}
              </h3>
              <p>{b.holds}</p>
              <span className="count">
                {Object.keys(binOf)
                  .filter((c) => binOf[c] === key)
                  .map((c) => classInfo(c).name)
                  .join(", ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeachAndDropOff() {
  return (
    <section className="well-band">
      <div className="container">
        <div className="statement-block">
          <h2>4. Put it right</h2>
          <p className="standfirst">
            Confirm or correct the answer. Your labels, and photos you choose to donate, train the next model.
          </p>
          <p>Every correction is stored with the exact model version that made the mistake, ready for retraining.</p>
        </div>
        <div className="stage__head">
          <h2>
            5. Drop off and earn
          </h2>
          <p>
            Staff weigh what you hand in at a drop-off point, and you earn points for every kilogram. Spend them on
            rewards.{" "}
            <Link to="/rewards" className="link">
              See the rewards
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

const AFTER = [
  {
    to: "/map",
    title: "Find a drop-off point",
    text: "Every point on a map, the nearest first, with how full each bin is and how the app knows it.",
  },
  {
    to: "/pickup",
    title: "Too much to carry?",
    text: "Book a collector for 5 kg or more. They weigh it at your door, and the points are for what they weigh.",
  },
  {
    to: "/map",
    title: "Full bins get reported",
    text: "Anyone can say a bin is full. When three people do, it goes on the day’s pickup run.",
  },
  {
    to: "/community",
    title: "Recycled together",
    text: "What everyone weighed in, week by week and place by place, and the items people find most confusing.",
  },
];

/** What happens after the bin: the parts of the app beyond the scan (Phases 4 to 7) */
function AfterTheBin() {
  return (
    <section className="container stage">
      <div className="stage__head">
        <h2>6. After the bin</h2>
        <p>
          Collectors take the day’s pickups like rides on Grab: they weigh what they take and photograph the empty
          bin, and those weights teach the forecast how full bins really get.
        </p>
      </div>
      <ul className="after">
        {AFTER.map((a) => (
          <li key={a.title}>
            <h3>
              <Link to={a.to} className="link" viewTransition>
                {a.title}
              </Link>
            </h3>
            <p>{a.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Why() {
  return (
    <section className="ink-band">
      <div className="container">
        <h2>Recycling fails at the bin, not at the plant.</h2>
        <p className="standfirst">
          Most people want to recycle but aren’t sure what goes where. One wrong item or unrinsed container spoils a
          whole bag, and sorting it by hand later costs money.
        </p>
        <dl className="figures">
          <div>
            <dt className="figure-num">35.4%</dt>
            <dd>
              Malaysia’s national recycling rate in 2023, according to SWCorp.{" "}
              <a href="https://asianews.network/40-of-malaysias-trash-is-recyclable/" target="_blank" rel="noreferrer">
                Asia News Network
              </a>
            </dd>
          </div>
          <div>
            <dt className="figure-num">40%</dt>
            <dd>
              The national recycling-rate target set for 2025.{" "}
              <a
                href="https://www.thestar.com.my/news/focus/2021/10/24/malaysia-is-on-track-to-achieve-a-40-recycling-rate-by-2025"
                target="_blank"
                rel="noreferrer"
              >
                The Star
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
