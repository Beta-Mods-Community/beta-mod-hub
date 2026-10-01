"use client";

/* eslint-disable @next/next/no-img-element -- Private media delivery uses stable app routes. */
import { useActionState, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2 } from "lucide-react";
import { manageModMedia, uploadModMedia, type MediaFormState } from "@lib/mod-media";
import { MAX_MOD_IMAGES, type GalleryImage } from "@lib/media-policy";
import { recoverMediaUpload } from "@/lib/media-upload-recovery";
import UploadStatus from "@/components/upload-status";

// Client wrapper keeps a rejected upload response inside this form. It requires
// hydration; the same Server Action still sends the original FormData once.
async function uploadScreenshot(previous: MediaFormState | undefined, data: FormData) {
  return recoverMediaUpload(uploadModMedia, previous, data, unstable_rethrow);
}

function MediaRow({ image, betaModId, first, last }: { image: GalleryImage; betaModId: string; first: boolean; last: boolean }) {
  const [state, action, pending] = useActionState(manageModMedia, undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <form action={action} className="grid gap-4 rounded-lg border border-[var(--line)] bg-surface-soft p-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:p-5">
    <input type="hidden" name="betaModId" value={betaModId} />
    <input type="hidden" name="mediaId" value={image.id} />
    <img src={`/media/${image.id}`} width={112} height={80} alt={image.caption || "Screenshot preview"} className="aspect-[7/5] w-28 rounded-md border border-line bg-black object-cover" loading="lazy" />
    <div className="min-w-0 space-y-3">
      <label className="block text-sm font-semibold text-[var(--text-soft)]" htmlFor={`caption-${image.id}`}>Caption{image.isHero && <span className="ml-2 text-xs text-[var(--accent)]">· Cover image</span>}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={`caption-${image.id}`} name="caption" className="field min-w-0" defaultValue={image.caption ?? ""} maxLength={200} placeholder="Describe what this image shows" />
        <button name="operation" value="caption" disabled={pending} className="button-secondary shrink-0 self-start">Save caption</button>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button name="operation" value="hero" disabled={pending || image.isHero} className="button-secondary text-xs"><Star size={13} />{image.isHero ? "Cover image" : "Use as cover"}</button>
        <button name="operation" value="up" disabled={pending || first} className="button-secondary" aria-label="Move screenshot earlier"><ArrowUp size={14} /></button>
        <button name="operation" value="down" disabled={pending || last} className="button-secondary" aria-label="Move screenshot later"><ArrowDown size={14} /></button>
        {!confirmDelete ? <button type="button" onClick={() => setConfirmDelete(true)} disabled={pending} className="button-secondary text-xs text-rose-300"><Trash2 size={13} />Remove</button> : <>
          <button name="operation" value="delete" disabled={pending} className="button-secondary text-xs text-rose-300">Confirm removal</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="button-secondary text-xs">Cancel</button>
        </>}
      </div>
      {state?.message && <p role="status" className={`notice ${state.ok ? "notice-success" : "notice-error"}`}>{state.message}</p>}
    </div>
  </form>;
}

export default function ModMediaManager({ betaModId, media, uploadPermission, cloudPilot = false }: {
  betaModId: string;
  media: GalleryImage[];
  cloudPilot?: boolean;
  uploadPermission?: { allowed: true } | { allowed: false; message: string };
}) {
  const [state, action, pending] = useActionState(uploadScreenshot, undefined);
  const [caption, setCaption] = useState("");
  const images = [...media].sort((a, b) => a.position - b.position);
  const canUpload = uploadPermission?.allowed !== false && images.length < MAX_MOD_IMAGES;
  return <section className="space-y-5" aria-labelledby="manage-screenshots-heading">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="manage-screenshots-heading" className="text-base font-semibold text-[var(--text)]">Manage screenshots</h3>
      <span className="text-xs tabular-nums text-[var(--muted)]">{images.length} / {MAX_MOD_IMAGES} images</span>
    </div>
    <p className="text-sm leading-6 text-[var(--muted)]">Choose a cover for Browse, then arrange the rest of your screenshots. Captions also describe images to screen readers.</p>
    {canUpload ? <form action={action} onSubmit={event => { if (pending) event.preventDefault(); }} className="space-y-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <input type="hidden" name="betaModId" value={betaModId} />
      <div>
        <label htmlFor="mod-image-file" className="mb-2 block text-sm font-semibold">Screenshot</label>
        <input id="mod-image-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" required disabled={pending} className="field" />
        <div className="mt-3 space-y-1 text-sm leading-6 text-[var(--muted)]">
          <p className="font-medium text-text-soft">PNG, JPEG or WebP · Up to {cloudPilot ? "8 MiB / 4 megapixels" : "10 MiB"}</p>
          <p>160–4096 pixels per side · Still images only{cloudPilot ? " · Privately scanned by Transloadit" : ""}</p>
        </div>
      </div>
      <div>
        <label htmlFor="mod-image-caption" className="mb-2 block text-sm font-semibold">Caption <span className="font-normal text-[var(--muted)]">(optional)</span></label>
        <input id="mod-image-caption" name="caption" maxLength={200} value={caption} onChange={event => setCaption(event.target.value)} className="field" placeholder="What should testers notice?" />
      </div>
      <div className="form-actions">
        <button className="button-primary w-full sm:w-auto" disabled={pending}>{pending ? "Upload in progress…" : <><ImagePlus size={16} aria-hidden="true" />Upload screenshot</>}</button>
      </div>
      <UploadStatus pending={pending} />
      {!pending && <p className="text-sm leading-6 text-[var(--muted)]">Images appear only after malware scanning. Location and camera metadata are removed.</p>}
    </form> : <p className="notice">{uploadPermission?.allowed === false ? uploadPermission.message : "The gallery is full. Remove an image to add another."}</p>}
    {!pending && state?.message && <p role="status" className={`notice ${state.ok ? "notice-success" : "notice-error"}`}>{state.message}</p>}
    <div className="space-y-3">{images.map((image, index) => <MediaRow key={image.id} betaModId={betaModId} image={image} first={index === 0} last={index === images.length - 1} />)}</div>
  </section>;
}
