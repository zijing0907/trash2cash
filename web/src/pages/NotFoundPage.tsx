import { ButtonLink } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="container gone">
      <h1>This page went out with the rubbish</h1>
      <p className="lead">Error 404: the link may be old or mistyped.</p>
      <ButtonLink to="/">Back to home</ButtonLink>
    </div>
  );
}
