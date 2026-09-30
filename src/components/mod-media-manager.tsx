"use client";

/* eslint-disable @next/next/no-img-element -- Private R2 delivery uses stable app routes. */
import { useActionState, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, LoaderCircle, Star, Trash2 } from "lucide-react";
import { manageModMedia, uploadModMedia } from "@lib/mod-media";
import { MAX_MOD_IMAGES, type GalleryImage } from "@lib/media-policy";

function MediaRow({ image, betaModId, first, last }: { image: GalleryImage; betaModId: string; first: boolean; last: boolean }) {
  const [state, action, pending] = useActionState(manageModMedia, undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <form action={action} className="grid gap-4 rounded-lg border border-[var(--line)] p-4 sm:grid-cols-[112px_1fr]">
    <input type="hidden" name="betaModId" value={betaModId} />
    <input type="hidden" name="mediaId" value={image.id} />
    <img src={`/media/${image.id}`} width={112} height={80} alt={image.caption || "Screenshot preview"} className="aspect-[7/5] w-28 rounded-md bg-black object-cover" loading="lazy" />
    <div className="min-w-0 space-y-3">
      <label className="block text-xs font-semibold text-[var(--text-soft)]" htmlFor={`caption-${image.id}`}>Caption{image.isHero && <span className="ml-2 text-[var(--accent)]">· Cover image</span>}</label>
      <div className="flex gap-2">
        <input id={`caption-${image.id}`} name="caption" className="field min-w-0" defaultValue={image.caption ?? ""} maxLength={200} placeholder="Describe what this image shows" />
        <button name="operation" value="caption" disabled={pending} className="button-secondary shrink-0">Save</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button name="operation" value="hero" disabled={pending || image.isHero} className="button-secondary text-xs"><Star size={13} />{image.isHero ? "Cover image" : "Use as cover"}</button>
        <button name="operation" value="up" disabled={pending || first} className="button-secondary" aria-label="Move screenshot earlier"><ArrowUp size={14} /></button>
        <button name="operation" value="down" disabled={pending || last} className="button-secondary" aria-label="Move screenshot later"><ArrowDown size={14} /></button>
        {!confirmDelete ? <button type="button" onClick={() => setConfirmDelete(true)} disabled={pending} className="button-secondary text-xs text-rose-300"><Trash2 size={13} />Remove</button> : <>
          <button name="operation" value="delete" disabled={pending} className="button-secondary text-xs text-rose-300">Confirm removal</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="button-secondary text-xs">Cancel</button>
        </>}
      </div>
      {state?.message && <p role="status" className={`text-xs ${state.ok ? "text-emerald-300" : "text-rose-300"}`}>{state.message}</p>}
    </div>
  </form>;
}

export default function ModMediaManager({ betaModId, media, uploadPermission, cloudPilot = false }: {
  betaModId: string;
  media: GalleryImage[];
  cloudPilot?: boolean;
  uploadPermission?: { allowed: true } | { allowed: false; message: string };
}) {
  const [state, action, pending] = useActionState(uploadModMedia, undefined);
  const [selectedName, setSelectedName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const images = [...media].sort((a, b) => a.position - b.position);
  const canUpload = uploadPermission?.allowed !== false && images.length < MAX_MOD_IMAGES;
  return <section className="space-y-5" aria-labelledby="manage-screenshots-heading">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="manage-screenshots-heading" className="text-base font-semibold text-[var(--text)]">Manage screenshots</h3>
      <span className="text-xs tabular-nums text-[var(--muted)]">{images.length} / {MAX_MOD_IMAGES} images</span>
    </div>
    <p className="text-sm text-[var(--muted)]">Choose a cover for Browse, then arrange the rest of your screenshots. Captions also describe images to screen readers.</p>
    {canUpload ? <form ref={formRef} action={action} className="space-y-4 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] p-5">
      <input type="hidden" name="betaModId" value={betaModId} />
      <div>
        <label htmlFor="mod-image-file" className="mb-2 block text-sm font-semibold">Screenshot</label>
        <input id="mod-image-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" required disabled={pending} className="field" onChange={(event) => setSelectedName(event.currentTarget.files?.[0]?.name ?? "")} />
        <p className="mt-2 text-xs text-[var(--muted)]">PNG, JPEG or WebP · Up to {cloudPilot ? "8 MiB / 4 megapixels" : "10 MiB"} · 160–4096 pixels per side · Still images only{cloudPilot ? " · Privately scanned by Transloadit" : ""}</p>
      </div>
      <div>
        <label htmlFor="mod-image-caption" className="mb-2 block text-sm font-semibold">Caption <span className="font-normal text-[var(--muted)]">(optional)</span></label>
        <input id="mod-image-caption" name="caption" maxLength={200} className="field" placeholder="What should testers notice?" />
      </div>
      <button className="button-primary" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin motion-reduce:animate-none" size={16} />Uploading and scanning…</> : <><ImagePlus size={16} />Upload screenshot</>}</button>
      <p role="status" className="text-xs text-[var(--muted)]">{pending ? `Processing ${selectedName || "your screenshot"}. Keep this page open while it is checked.` : "Images appear only after malware scanning. Location and camera metadata are removed."}</p>
      {state?.message && <p role="status" className={`text-sm ${state.ok ? "text-emerald-300" : "text-rose-300"}`}>{state.message}</p>}
    </form> : <p className="rounded-lg border border-[var(--line)] p-4 text-sm text-[var(--muted)]">{uploadPermission?.allowed === false ? uploadPermission.message : "The gallery is full. Remove an image to add another."}</p>}
    <div className="space-y-3">{images.map((image, index) => <MediaRow key={image.id} betaModId={betaModId} image={image} first={index === 0} last={index === images.length - 1} />)}</div>
  </section>;
}
