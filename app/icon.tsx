import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

/** Node runtime required to read `public/favicon.png` at build/request time. */
export const runtime = "nodejs";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

/**
 * Dynamic favicon: same artwork as `/favicon.png` with rounded corners (equivalent to SVG `rx`/`ry` 20 on a 32×32 viewBox).
 * Next.js serves this at `/icon` and injects `<link rel="icon" />` automatically.
 */
export default async function Icon() {
  const buf = await readFile(join(process.cwd(), "public", "favicon.png"));
  const src = `data:image/png;base64,${buf.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires <img> */}
        <img
          alt=""
          src={src}
          width={32}
          height={32}
          style={{
            width: 32,
            height: 32,
            objectFit: "cover",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
