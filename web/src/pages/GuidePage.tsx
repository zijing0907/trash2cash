import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";

import { Eyebrow } from "../components/ui";
import { useModelInfo } from "../lib/hooks";
import { BINS, CLASSES, classInfo } from "../lib/recycling";

export function GuidePage() {
  const { data: model } = useModelInfo();
  const [query, setQuery] = useState("");
  const { hash } = useLocation();

  // class -> bin: the model's meta.json when available, otherwise the built-in mapping
  const binOf = useMemo(() => {
    if (model) return model.bins;
    return Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, v.bin]));
  }, [model]);

  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: "smooth" });
  }, [hash]);

  const q = query.trim().toLowerCase();
  const matches = (cls: string) => {
    if (!q) return true;
    const info = classInfo(cls);
    return `${cls} ${info.name} ${info.keywords ?? ""}`.toLowerCase().includes(q);
  };

  const bins = Object.entries(BINS)
    .map(([key, b]) => ({ key, b, classes: Object.keys(binOf).filter((c) => binOf[c] === key && matches(c)) }))
    .filter((x) => !q || x.classes.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Eyebrow>Bin guide</Eyebrow>
      <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">What goes where</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Malaysia's recycling bins come in three colours: blue for paper, brown for glass and orange for plastic and
        cans. Batteries, clothes and food each have their own way out. Rules differ a little between councils, so
        when in doubt ask your local centre.
      </p>

      <label className="relative mt-8 block max-w-md">
        <span className="sr-only">Search an item</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an item, e.g. bottle, power bank, box"
          className="w-full rounded-full border border-line bg-white py-3 pl-11 pr-4 text-sm shadow-sm outline-none focus:border-leaf-400 focus:ring-4 focus:ring-leaf-100"
        />
      </label>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {bins.map(({ key, b, classes }) => (
          <section
            key={key}
            id={key}
            className="scroll-mt-24 overflow-hidden rounded-3xl border border-line/70 bg-white shadow-card"
          >
            <header className="flex items-center gap-4 p-5 text-white" style={{ backgroundColor: b.color }}>
              <span className="grid size-12 place-items-center rounded-2xl bg-white/20">
                <b.icon className="size-6" aria-hidden />
              </span>
              <div>
                <h2 className="text-2xl font-extrabold">{b.title}</h2>
                <p className="text-sm text-white/85">{b.holds}</p>
              </div>
            </header>
            <div className="space-y-4 p-5">
              <p className="text-sm text-ink-soft">{b.where}</p>
              {classes.map((c) => {
                const info = classInfo(c);
                return (
                  <div key={c} className="rounded-2xl p-4" style={{ backgroundColor: b.tint }}>
                    <h3 className="flex items-center gap-2 font-sans text-sm font-bold">
                      <info.icon className="size-4" style={{ color: b.color }} aria-hidden />
                      {info.name}
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                      {info.tips.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {bins.length === 0 && (
          <p className="text-ink-soft">
            Nothing matches “{query}”. The model knows 12 kinds of items; for anything else, ask your local centre.
          </p>
        )}
      </div>
    </div>
  );
}
