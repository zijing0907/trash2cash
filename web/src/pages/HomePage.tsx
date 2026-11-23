import { ArrowRight, Brain, Camera, CircleHelp, Eye, History, Recycle, ScanLine, Scale, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { ButtonLink, Card, Eyebrow } from "../components/ui";
import { BINS } from "../lib/recycling";

export function HomePage() {
  return (
    <>
      <Hero />
      <BinStrip />
      <Why />
      <HowItWorks />
      <Honest />
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-leaf-800 px-6 py-14 text-center text-white sm:px-12">
          <Recycle className="absolute -right-10 -top-10 size-56 text-white/5" aria-hidden />
          <h2 className="text-3xl font-extrabold sm:text-4xl">Got something in your hand right now?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">No account needed. Snap it and find out where it goes.</p>
          <ButtonLink to="/scan" size="lg" className="mt-8 bg-white !text-leaf-800 hover:bg-leaf-50">
            <ScanLine className="size-5" aria-hidden /> Scan an item
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-leaf-100),transparent_55%)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
        <div>
          <Eyebrow>SDG 11 · Sustainable cities & communities</Eyebrow>
          <h1 className="mt-4 text-5xl font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl">
            Snap it.
            <br />
            Sort it.
            <br />
            <span className="text-leaf-600">Recycle it right.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            Point your phone at a household item. A neural network we trained from scratch tells you which Malaysian
            recycling bin it belongs in and how to prepare it, and it says so when it isn't sure.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/scan" size="lg">
              <Camera className="size-5" aria-hidden /> Scan an item
            </ButtonLink>
            <ButtonLink to="/model" size="lg" variant="secondary">
              How the model works
            </ButtonLink>
          </div>
        </div>
        <PhoneMock />
      </div>
    </section>
  );
}

/** An illustration of the result screen (static, labelled as an example). */
function PhoneMock() {
  const b = BINS["orange bin"]!;
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden>
      <div className="absolute -left-6 top-10 h-24 w-24 rounded-3xl bg-bin-blue/90 shadow-card rotate-[-8deg]" />
      <div className="absolute -right-4 bottom-16 h-20 w-20 rounded-3xl bg-bin-brown/90 shadow-card rotate-[10deg]" />
      <div className="relative rotate-[2deg] rounded-[2.5rem] border-[10px] border-ink bg-white p-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-line" />
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-[#c9d8cf] to-[#a9bdb1]">
          <div className="absolute inset-[14%] rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgb(22_36_28/0.35)]" />
          <div className="absolute left-1/2 top-1/2 h-[46%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-t-[40%] rounded-b-xl bg-gradient-to-b from-sky-200/90 to-sky-400/80 shadow-inner">
            <div className="mx-auto -mt-[18%] h-[14%] w-[45%] rounded-t-md bg-sky-700" />
            <div className="mt-[35%] h-[22%] bg-white/70" />
          </div>
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold">
            Example
          </span>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl" style={{ backgroundColor: b.tint }}>
          <div className="flex items-center gap-3 p-4 text-white" style={{ backgroundColor: b.color }}>
            <span className="grid size-10 place-items-center rounded-xl bg-white/20">
              <b.icon className="size-5" />
            </span>
            <div>
              <p className="text-xs text-white/85">It's plastic · 93% sure. It goes in the</p>
              <p className="font-display text-xl font-extrabold">Orange bin</p>
            </div>
          </div>
          <p className="p-4 text-xs text-ink">Empty and rinse. Squash bottles to save space.</p>
        </div>
      </div>
    </div>
  );
}

function BinStrip() {
  return (
    <section className="border-y border-line/70 bg-white/60">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="mb-4 text-center text-sm font-medium text-ink-soft">12 kinds of items, 7 places to put them</p>
        <div className="flex flex-wrap justify-center gap-2">
          {Object.entries(BINS).map(([key, b]) => (
            <Link
              key={key}
              to={`/guide#${encodeURIComponent(key)}`}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:scale-[1.03]"
              style={{ backgroundColor: b.tint, color: b.color }}
            >
              <b.icon className="size-4" aria-hidden />
              {b.title}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div>
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-3 text-4xl font-extrabold">Recycling fails at the bin, not at the plant.</h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            Most people want to recycle but aren't sure what goes where. A wrong item or an unrinsed container
            contaminates a whole bag, and sorting it out by hand later costs money and lowers the value of the
            material. Getting it right at home is the cheapest fix there is.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            value="35.4%"
            label="Malaysia's national recycling rate in 2023, according to SWCorp."
            source="https://asianews.network/40-of-malaysias-trash-is-recyclable/"
          />
          <Stat
            value="40%"
            label="The national recycling-rate target set for 2025."
            source="https://www.thestar.com.my/news/focus/2021/10/24/malaysia-is-on-track-to-achieve-a-40-recycling-rate-by-2025"
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label, source }: { value: string; label: string; source: string }) {
  return (
    <Card className="p-6">
      <p className="font-display text-5xl font-extrabold text-leaf-600">{value}</p>
      <p className="mt-2 text-sm text-ink-soft">{label}</p>
      <a href={source} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-leaf-700 hover:underline">
        Source ↗
      </a>
    </Card>
  );
}

function HowItWorks() {
  const steps: { icon: ReactNode; title: string; text: string; soon?: boolean }[] = [
    {
      icon: <Camera className="size-6" />,
      title: "Snap",
      text: "Take a photo of one item. Works with any phone camera, including iPhone HEIC photos.",
    },
    {
      icon: <Brain className="size-6" />,
      title: "Sort",
      text: "A CNN recognises 12 kinds of household waste and maps them to the right bin, with tips to prepare the item.",
    },
    {
      icon: <Sprout className="size-6" />,
      title: "Teach",
      text: "Confirm or correct the answer. Your labels, and photos you choose to donate, train the next model.",
    },
    {
      icon: <Scale className="size-6" />,
      title: "Drop off & earn",
      text: "Operators weigh and verify deposits at drop-off points and you earn points. Admins see when each point needs a pickup.",
      soon: true,
    },
  ];
  return (
    <section className="bg-paper-deep/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 max-w-2xl text-4xl font-extrabold">From “where does this go?” to the right bin in seconds.</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Card className={"h-full p-6 " + (s.soon ? "border-dashed bg-white/60 shadow-none" : "")}>
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-leaf-100 text-leaf-700">{s.icon}</span>
                  <span className="font-display text-3xl font-extrabold text-line">{i + 1}</span>
                </div>
                {s.soon && (
                  <span className="mt-5 inline-block rounded-full bg-bin-orange/15 px-2 py-0.5 text-[11px] font-semibold text-bin-orange">
                    In development
                  </span>
                )}
                <h3 className={(s.soon ? "mt-2" : "mt-5") + " text-xl font-bold"}>{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Honest() {
  const points = [
    {
      icon: <Brain className="size-5" />,
      title: "Trained from scratch",
      text: "No pretrained weights: the CNN learned from random weights on thousands of labelled photos of household waste.",
    },
    {
      icon: <CircleHelp className="size-5" />,
      title: "Says “not sure”",
      text: "Below a confidence threshold chosen on validation data, it asks you instead of guessing.",
    },
    {
      icon: <Eye className="size-5" />,
      title: "Shows where it looked",
      text: "A Grad-CAM heat map shows which part of your photo drove the answer.",
    },
    {
      icon: <History className="size-5" />,
      title: "Learns from mistakes",
      text: "Every correction is stored with the exact model version that made the mistake, ready for retraining.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <Eyebrow>Built to be trusted</Eyebrow>
          <h2 className="mt-3 text-4xl font-extrabold">An AI that knows what it doesn't know.</h2>
          <p className="mt-4 text-ink-soft">
            A wrong answer with a confident face does more harm than no answer. So the model is measured honestly and
            explains itself.
          </p>
          <Link to="/model" className="mt-6 inline-flex items-center gap-1 font-semibold text-leaf-700 hover:underline">
            Read the model card <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {points.map((p) => (
            <div key={p.title} className="rounded-3xl border border-line/70 p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-ink text-white">{p.icon}</span>
              <h3 className="mt-4 text-lg font-bold">{p.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
