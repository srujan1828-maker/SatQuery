

import { useEffect, useRef, useState } from "react";
import "./ImageViewer.css";

function ImageViewer({ image, boxes = [] }) {
  const imageRef = useRef(null);
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [loadError, setLoadError] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(image.url);

  if (image.url !== currentUrl) {
    setCurrentUrl(image.url);
    setLoadError(false);
  }

  useEffect(() => {
    const element = imageRef.current;

    if (!element) {
      return undefined;
    }

    const updateDimensions = () => {
      const rect = element.getBoundingClientRect();

      setDimensions({
        width: rect.width,
        height: rect.height,
      });
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(element);

    window.addEventListener("resize", updateDimensions);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, [image.url]);

  const imageBoxes = boxes.filter(
    (box) => box.image_id === image.id,
  );

  return (
    <figure className="image-viewer">
      <div className="image-viewer__canvas">
        {loadError ? (
          <div className="image-viewer__error-state">
            <p><strong>Satellite scene image tile unavailable</strong></p>
            <p className="image-viewer__error-sub">
              The public tile endpoint did not return valid raster data.
            </p>
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="image-viewer__error-link"
            >
              Inspect upstream URL
            </a>
          </div>
        ) : (
          <img
            ref={imageRef}
            className="image-viewer__image"
            src={image.url}
            alt={`${image.role} satellite observation`}
            onError={() => setLoadError(true)}
            onLoad={() => {
              const rect = imageRef.current?.getBoundingClientRect();
              if (rect) {
                setDimensions({
                  width: rect.width,
                  height: rect.height,
                });
              }
            }}
          />
        )}

        <div className="image-viewer__overlay" aria-hidden="true">
          {imageBoxes.map((box) => {
            const left = box.x_min * dimensions.width;
            const top = box.y_min * dimensions.height;
            const width =
              (box.x_max - box.x_min) * dimensions.width;
            const height =
              (box.y_max - box.y_min) * dimensions.height;
            const isNearTop = box.y_min < 0.08;

            return (
              <div
                className={`bounding-box ${
                  isNearTop ? "bounding-box--top-edge" : ""
                }`}
                key={`${box.image_id}-${box.label}-${box.x_min}-${box.y_min}`}
                style={{
                  left,
                  top,
                  width,
                  height,
                }}
              >
                <span className="bounding-box__label">
                  {box.label}
                  {typeof box.confidence === "number"
                    ? ` · ${(box.confidence * 100).toFixed(0)}%`
                    : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <figcaption className="image-viewer__caption">
        <span>{image.role}</span>
        <span>{image.sensor}</span>
        <span>{image.date}</span>
      </figcaption>
    </figure>
  );
}

export default ImageViewer;