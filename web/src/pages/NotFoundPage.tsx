import { ButtonLink } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-display text-7xl font-extrabold text-leaf-200">404</p>
      <h1 className="mt-4 text-3xl font-extrabold">This page went out with the rubbish</h1>
      <p className="mt-2 text-ink-soft">The link may be old or mistyped.</p>
      <ButtonLink to="/" className="mt-8">
        Back to home
      </ButtonLink>
    </div>
  );
}
