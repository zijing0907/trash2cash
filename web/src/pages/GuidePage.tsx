import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";

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
    <div className="container app">
      <header className="app__head">
        <h1>What goes where</h1>
        <p className="lead">
          Malaysia’s recycling bins come in three colours: blue for paper, brown for glass and orange for plastic and
          cans. Batteries, clothes and food each have their own way out. Rules differ a little between councils, so
          when in doubt ask your local centre.
        </p>
      </header>

      <label className="search">
        <span className="visually-hidden">Search an item</span>
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an item, e.g. bottle, power bank, box"
          className="input"
        />
      </label>

      {bins.map(({ key, b, classes }) => (
        <section key={key} id={key} className={`guide-bin ${b.cls}`}>
          <div className="guide-bin__head">
            <h2>
              <span className="swatch" aria-hidden />
              {b.title}
            </h2>
            <p>
              <strong>{b.holds}.</strong> {b.where}
            </p>
          </div>
          <ul className="guide-items">
            {classes.map((c) => {
              const info = classInfo(c);
              return (
                <li key={c}>
                  <h3>
                    <info.icon size={20} aria-hidden />
                    {info.name}
                  </h3>
                  <ul>
                    {info.tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {bins.length === 0 && (
        <p className="guide-bin">
          Nothing matches “{query}”. The model knows 12 kinds of items; for anything else, ask your local centre.
        </p>
      )}
    </div>
  );
}
