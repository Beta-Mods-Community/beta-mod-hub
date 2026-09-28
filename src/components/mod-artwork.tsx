import { Gamepad2 } from "lucide-react";

const palettes = [
  { wash: "bg-cyan-400/10", orb: "bg-cyan-300/20", line: "border-cyan-300/40", label: "text-cyan-200" },
  { wash: "bg-sky-400/10", orb: "bg-sky-300/20", line: "border-sky-300/40", label: "text-sky-200" },
  { wash: "bg-violet-400/10", orb: "bg-violet-300/20", line: "border-violet-300/40", label: "text-violet-200" },
  { wash: "bg-emerald-400/10", orb: "bg-emerald-300/20", line: "border-emerald-300/40", label: "text-emerald-200" },
] as const;

function stableIndex(value: string) {
  return Array.from(value).reduce(
    (total, character) => (total + (character.codePointAt(0) ?? 0)) % palettes.length,
    0,
  );
}

function initials(value: string, fallback: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export default function ModArtwork({
  title,
  game,
  className = "",
}: {
  title: string;
  game: string;
  className?: string;
}) {
  const palette = palettes[stableIndex(game)];

  return (
    <div aria-hidden="true" className={`relative isolate overflow-hidden bg-zinc-950 ${className}`}>
      <div className={`absolute inset-0 ${palette.wash}`} />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
      <div className={`absolute -right-8 -top-12 h-40 w-40 rounded-full blur-2xl ${palette.orb}`} />
      <div className={`absolute left-[12%] top-[18%] h-[64%] w-[64%] rotate-[-8deg] border ${palette.line}`} />
      <div className="absolute left-[20%] top-[26%] h-[64%] w-[64%] rotate-[8deg] border border-white/10" />
      <div className="relative flex h-full min-h-36 flex-col justify-between p-5">
        <div className="flex items-center justify-end gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
          <Gamepad2 className="h-3.5 w-3.5" />
          {initials(game, "GM")}
        </div>
        <div className="flex items-end justify-between gap-4">
          <span className={`text-5xl font-black leading-none tracking-[-0.08em] ${palette.label}`}>
            {initials(title, "BM")}
          </span>
          <span className="max-w-[55%] text-right text-[10px] font-medium uppercase leading-4 tracking-[0.16em] text-zinc-500">
            Beta workspace
          </span>
        </div>
      </div>
    </div>
  );
}
