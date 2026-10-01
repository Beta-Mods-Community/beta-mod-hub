"use client";

/* eslint-disable @next/next/no-img-element -- Stable media routes enforce access before serving private files. */
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { galleryOrder, type GalleryImage } from "@lib/media-policy";

export default function ModGallery({ media, title }: { media: GalleryImage[]; title: string }) {
  const images = galleryOrder(media);
  const [selectedId, setSelectedId] = useState(images[0]?.id);
  const index = Math.max(0, images.findIndex((image) => image.id === selectedId));
  const current = images[index];
  const dialog = useRef<HTMLDialogElement>(null);
  const move = (amount: number) => setSelectedId(images[(index + amount + images.length) % images.length].id);
  if (!current) return null;
  const alt = current.caption || `${title}, screenshot ${index + 1}`;

  return <div className="min-w-0">
    <figure>
      <div className="overflow-hidden rounded-lg border border-line bg-surface-soft">
        <button type="button" onClick={() => dialog.current?.showModal()} className="focus-inset group relative block h-[clamp(13rem,46vw,28rem)] w-full bg-black/35" aria-label={`Enlarge ${alt}`}>
          <img src={`/media/${current.id}`} alt={alt} width={current.width} height={current.height} className="h-full w-full object-contain" fetchPriority="high" />
          <span className="absolute bottom-3 right-3 flex min-h-11 items-center gap-2 rounded-md border border-white/15 bg-black/75 px-3 py-2 text-xs font-medium text-white"><Expand size={14} aria-hidden="true" />View image</span>
        </button>
      </div>
      <figcaption className="flex items-start justify-between gap-4 py-3.5">
        <p className="min-w-0 break-words text-sm leading-6 text-text-soft" aria-live="polite">{current.caption || `Screenshot ${index + 1}`}</p>
        <span className="shrink-0 pt-0.5 text-xs leading-5 tabular-nums text-muted">{index + 1} / {images.length}</span>
      </figcaption>
    </figure>
    {images.length > 1 && <div className="flex gap-2.5 overflow-x-auto pb-1" role="group" aria-label="Choose screenshot">
      {images.map((image, imageIndex) => <button type="button" key={image.id} onClick={() => setSelectedId(image.id)} aria-label={`Show screenshot ${imageIndex + 1}${image.caption ? `: ${image.caption}` : ""}`} aria-pressed={image.id === current.id} className={`focus-inset h-16 w-28 shrink-0 overflow-hidden rounded-md border-2 transition-opacity ${image.id === current.id ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"}`}>
        <img src={`/media/${image.id}`} alt="" width={112} height={64} loading="lazy" className="h-full w-full object-cover" />
      </button>)}
    </div>}
    <dialog ref={dialog} className="m-auto max-h-[94dvh] w-[min(96vw,1440px)] max-w-none overflow-auto rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-0 text-[var(--text)] backdrop:bg-black/90" aria-label={`${title} screenshots`} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} onKeyDown={(event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    }}>
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
        <p className="min-w-0 break-words text-sm leading-6">{title} · {index + 1} / {images.length}</p>
        <button type="button" onClick={() => dialog.current?.close()} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-white/10" aria-label="Close gallery" autoFocus><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="relative flex min-h-48 items-center justify-center bg-black">
        <img src={`/media/${current.id}`} alt={alt} width={current.width} height={current.height} className="max-h-[72dvh] w-full object-contain" />
        {images.length > 1 && <>
          <button type="button" onClick={() => move(-1)} aria-label="Previous screenshot" className="absolute left-2 rounded-full border border-white/20 bg-black/70 p-3 hover:bg-black"><ChevronLeft size={22} aria-hidden="true" /></button>
          <button type="button" onClick={() => move(1)} aria-label="Next screenshot" className="absolute right-2 rounded-full border border-white/20 bg-black/70 p-3 hover:bg-black"><ChevronRight size={22} aria-hidden="true" /></button>
        </>}
      </div>
      <p className="break-words px-5 py-4 text-sm leading-6 text-text-soft" aria-live="polite">{current.caption || `Screenshot ${index + 1}`}</p>
    </dialog>
  </div>;
}
