"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { AnimatePresence, motion } from "framer-motion";
import { MotionButton } from "@/components/motion-button";

export type ImageCropEditorProps = {
  /** New upload from disk (optional if `cropImageSrc` is set — parent may own the object URL) */
  imageFile: File | null;
  /** Parent-created `URL.createObjectURL(file)` — preferred for new picks (avoids Strict Mode / double-revoke issues) */
  cropImageSrc?: string | null;
  /** Existing image URL (e.g. remote CDN) — use for Edit flow; do not use fetch for fresh file picks */
  imageUrl?: string | null;
  /** Passed through to react-easy-crop `aspect` (e.g. `1` avatar, `4` for 4:1 banner) */
  aspectRatio: number;
  /** Parent handles upload + close; return a Promise. Editor re-enables Apply after settle. */
  onComplete: (croppedImageBlob: Blob) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
  onChangePhoto?: () => void;
  /** Fullscreen overlay (default) vs embedded in a parent modal */
  variant?: "overlay" | "inline";
  /** Panel title; hidden when empty for inline banner-style modals */
  title?: string;
  /** Bottom action row layout */
  actionBarVariant?: "default" | "banner";
};

type Tab = "crop" | "filters" | "adjust";

export async function getCroppedBlob(
  imageSrc: string,
  cropPixels: Area,
  rotation: number,
  filter: string
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    if (imageSrc.startsWith("http://") || imageSrc.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;

  ctx.filter = filter;
  ctx.save();
  ctx.translate(-cropPixels.x, -cropPixels.y);
  ctx.translate(image.width / 2, image.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);
  ctx.restore();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Could not generate blob"));
      else resolve(blob);
    }, "image/jpeg", 0.92);
  });
}

export function ImageCropEditor({
  imageFile,
  cropImageSrc = null,
  imageUrl = null,
  aspectRatio,
  onComplete,
  onClose,
  onDelete,
  onChangePhoto,
  variant = "overlay",
  title = "Edit photo",
  actionBarVariant = "default",
}: ImageCropEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [tab, setTab] = useState<Tab>("crop");
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [preset, setPreset] = useState("normal");
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /** Internal blob URL only when parent did not pass `cropImageSrc` */
  const internalObjectUrl = useMemo(() => {
    if (cropImageSrc) return null;
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile, cropImageSrc]);

  const imageSrc = cropImageSrc || internalObjectUrl || imageUrl || null;

  useEffect(() => {
    return () => {
      if (internalObjectUrl) URL.revokeObjectURL(internalObjectUrl);
    };
  }, [internalObjectUrl]);

  useLayoutEffect(() => {
    if (imageSrc) {
      console.log("Image src being passed to cropper:", imageSrc.slice(0, 120) + (imageSrc.length > 120 ? "…" : ""));
    } else {
      console.log("Image src being passed to cropper: (empty)");
    }
  }, [imageSrc]);

  const presetFilter = useMemo(() => {
    if (preset === "bright") return "brightness(1.3)";
    if (preset === "contrast") return "contrast(1.4)";
    if (preset === "warm") return "sepia(0.3) saturate(1.4)";
    if (preset === "cool") return "hue-rotate(180deg) saturate(0.8)";
    return "none";
  }, [preset]);

  const fullFilter = `${presetFilter} brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;

  /** Banner cover: fixed 4:1 (LinkedIn-style) wide crop frame */
  const isBannerCoverCropArea = actionBarVariant === "banner";

  const applyCrop = async () => {
    if (!imageSrc || !cropPixels) return;
    setUploadError(null);
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageSrc, cropPixels, rotation, fullFilter);
      await onComplete(blob);
    } catch (err) {
      console.error("Crop / upload failed:", err);
      setUploadError("Upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const actionRow =
    actionBarVariant === "banner" ? (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10"
          onClick={onDelete}
        >
          Delete photo
        </button>
        <button
          type="button"
          className="rounded-full border border-white px-4 py-2 text-sm font-medium text-white bg-transparent hover:bg-white/5"
          onClick={onChangePhoto}
        >
          Change photo
        </button>
        <button
          type="button"
          disabled={!cropPixels || saving}
          className="inline-flex min-w-[104px] items-center justify-center rounded-full bg-[#22C55E] px-5 py-2 text-sm font-semibold text-black hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void applyCrop()}
        >
          {saving ? (
            <span
              className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-black border-t-transparent animate-spin"
              aria-hidden
            />
          ) : (
            "Apply"
          )}
        </button>
      </div>
    ) : (
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="bg-transparent border-0 p-0 text-sm text-red-400 hover:text-red-300 hover:underline"
            onClick={onDelete}
          >
            Delete photo
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-white px-4 py-2 text-sm font-medium text-white bg-transparent hover:bg-white/5"
              onClick={onChangePhoto}
            >
              Change photo
            </button>
            <button
              type="button"
              disabled={!cropPixels || saving}
              className="inline-flex min-w-[104px] items-center justify-center rounded-full bg-[#00FF88] px-5 py-2 text-sm font-semibold text-black hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void applyCrop()}
            >
              {saving ? (
                <span
                  className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-white border-t-transparent animate-spin"
                  aria-hidden
                />
              ) : (
                "Apply"
              )}
            </button>
          </div>
        </div>
        {uploadError ? <p className="text-sm text-red-400">{uploadError}</p> : null}
      </div>
    );

  const panelInner = (
    <>
      {title ? <div className="p-4 border-b border-white/10 text-lg font-medium">{title}</div> : null}
      <div className="p-4">
        <div
          className={
            isBannerCoverCropArea
              ? "relative w-full max-w-full rounded-xl overflow-hidden bg-[#0A0A0A] aspect-[4/1] max-h-[min(200px,40vw)] min-h-[88px]"
              : "relative w-full h-[360px] rounded-xl overflow-hidden bg-[#0A0A0A]"
          }
        >
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspectRatio}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_, pixels) => setCropPixels(pixels)}
              style={{ mediaStyle: { filter: fullFilter } }}
            />
          ) : (
            <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-[#888888]">
              No image loaded
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
            disabled={!imageSrc}
          />
          <label className="block text-sm">Straighten</label>
          <input
            type="range"
            min={-45}
            max={45}
            step={0.1}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="w-full"
            disabled={!imageSrc}
          />
        </div>

        <div className="mt-4 flex gap-2">
          {(["crop", "filters", "adjust"] as Tab[]).map((t) => (
            <MotionButton
              key={t}
              type="button"
              variant="plain"
              className={t === tab ? "" : "btn-pill-secondary"}
              onClick={() => setTab(t)}
              disabled={!imageSrc}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </MotionButton>
          ))}
        </div>

        {tab === "filters" ? (
          <div className="mt-3 flex gap-2 flex-wrap">
            {[
              ["normal", "Normal"],
              ["bright", "Bright"],
              ["contrast", "Contrast"],
              ["warm", "Warm"],
              ["cool", "Cool"],
            ].map(([id, label]) => (
              <MotionButton
                key={id}
                type="button"
                variant="plain"
                className={preset === id ? "" : "btn-pill-secondary"}
                onClick={() => setPreset(id)}
                disabled={!imageSrc}
              >
                {label}
              </MotionButton>
            ))}
          </div>
        ) : null}

        {tab === "adjust" ? (
          <div className="mt-3 space-y-3">
            <label className="block text-sm">Brightness</label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full"
              disabled={!imageSrc}
            />
            <label className="block text-sm">Contrast</label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              className="w-full"
              disabled={!imageSrc}
            />
            <label className="block text-sm">Saturation</label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={saturation}
              onChange={(e) => setSaturation(Number(e.target.value))}
              className="w-full"
              disabled={!imageSrc}
            />
          </div>
        ) : null}

        {actionBarVariant === "banner" ? (
          <>
            {actionRow}
            {uploadError ? <p className="mt-2 text-sm text-red-400">{uploadError}</p> : null}
          </>
        ) : (
          actionRow
        )}
      </div>
    </>
  );

  if (variant === "inline") {
    if (!imageSrc) return null;
    return (
      <div
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden border border-white/10 bg-[#141414] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {panelInner}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {imageSrc && (
        <motion.div
          key="image-crop-editor-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center p-4"
          role="presentation"
        >
          <div
            className="absolute inset-0 bg-black/80"
            aria-hidden
            onClick={() => onClose()}
          />
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative z-10 w-full max-w-3xl glass rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {panelInner}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
