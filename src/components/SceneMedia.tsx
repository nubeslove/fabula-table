import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** The media and its Token plane share the same contained rectangle. */
export function SceneMedia({
  url,
  video,
  children,
}: {
  url?: string;
  video?: boolean;
  children?: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [media, setMedia] = useState({ url: "", ratio: 0 });
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const ratio = url === media.url ? media.ratio : 0;
  const width = ratio ? Math.min(box.width, box.height * ratio) : box.width;
  const height = ratio ? width / ratio : box.height;
  return (
    <div ref={frame} className="scene-media">
      <div
        className="scene-media-plane"
        style={{ width: width || "100%", height: height || "100%" }}
      >
        {url &&
          (video ? (
            <video
              key={url}
              src={url}
              autoPlay
              muted
              loop
              playsInline
              onLoadedMetadata={(e) =>
                setMedia({
                  url,
                  ratio:
                    e.currentTarget.videoWidth / e.currentTarget.videoHeight,
                })
              }
            />
          ) : (
            <img
              key={url}
              src={url}
              alt="场景背景"
              draggable={false}
              onLoad={(e) =>
                setMedia({
                  url,
                  ratio:
                    e.currentTarget.naturalWidth /
                    e.currentTarget.naturalHeight,
                })
              }
            />
          ))}
        {children}
      </div>
    </div>
  );
}
