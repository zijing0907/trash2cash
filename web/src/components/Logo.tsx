import { Recycle } from "lucide-react";
import { Link } from "react-router";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Trash2Cash home">
      <span className="grid size-9 place-items-center rounded-xl bg-leaf-600 text-white shadow-sm">
        <Recycle className="size-5" aria-hidden />
      </span>
      <span className="font-display text-xl font-bold tracking-tight">
        Trash<span className="text-leaf-500">2</span>Cash
      </span>
    </Link>
  );
}
