import { Link } from "react-router";

export function Logo() {
  return (
    <Link to="/" className="wordmark" aria-label="Trash2Cash home" viewTransition>
      Trash2Cash
    </Link>
  );
}
