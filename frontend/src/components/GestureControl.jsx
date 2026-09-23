import { useRef, useState, useEffect } from "react";
import { gestureIntent } from "../gesture.js";
export default function GestureControl({ onIntent, overrideTarget }) {
  const [active, setActive] = useState(false),
    [status, setStatus] = useState("Off");
  const video = useRef(),
    worker = useRef(),
    stream = useRef(),
    timer = useRef(),
    previous = useRef(),
    busy = useRef(false),
    generation = useRef(0),
    last = useRef(0);
  const callback = useRef(onIntent);
  useEffect(() => {
    callback.current = onIntent;
  }, [onIntent]);
  const stop = () => {
    generation.current++;
    clearInterval(timer.current);
    worker.current?.terminate();
    worker.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    previous.current = null;
    busy.current = false;
    setActive(false);
    setStatus("Off");
    callback.current({ mode: null });
  };
  const stopResources = () => {
    generation.current++;
    clearInterval(timer.current);
    worker.current?.terminate();
    stream.current?.getTracks().forEach((t) => t.stop());
  };
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      stopResources();
    };
  }, []);
  useEffect(() => {
    const el = overrideTarget?.current;
    if (!el) return;
    const override = () => stop();
    el.addEventListener("pointerdown", override);
    el.addEventListener("wheel", override);
    return () => {
      el.removeEventListener("pointerdown", override);
      el.removeEventListener("wheel", override);
    };
  }, [overrideTarget]);
  const start = async () => {
    stop();
    const token = generation.current;
    setActive(true);
    setStatus("Requesting camera…");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      if (token !== generation.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      video.current.srcObject = s;
      await video.current.play();
      if (token !== generation.current) return;
      const w = new Worker(
        new URL("../workers/hands.worker.js", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      setStatus("Loading local hand tracker…");
      const fail = (message) => {
        stop();
        setStatus(message);
      };
      w.onerror = () => fail("Tracking unavailable. Use mouse or touch.");
      w.onmessage = ({ data }) => {
        if (token !== generation.current) return;
        if (data.type === "error") {
          fail(data.message);
          return;
        }
        if (data.type === "ready") {
          setStatus("Ready — pinch to rotate; two pinches to zoom");
          last.current = performance.now();
          timer.current = setInterval(async () => {
            if (performance.now() - last.current > 600) {
              previous.current = null;
              callback.current({ mode: null });
            }
            if (busy.current || !video.current || video.current.readyState < 2)
              return;
            busy.current = true;
            try {
              const bitmap = await createImageBitmap(video.current);
              if (token !== generation.current) {
                bitmap.close();
                return;
              }
              w.postMessage(
                { type: "frame", bitmap, timestamp: performance.now() },
                [bitmap],
              );
            } catch {
              fail("Video processing unavailable. Use mouse or touch.");
            }
          }, 66);
        }
        if (data.type === "hands") {
          busy.current = false;
          last.current = performance.now();
          const intent = gestureIntent(data.landmarks, previous.current);
          previous.current = intent;
          callback.current(intent);
          setStatus(
            intent.mode
              ? `Active: ${intent.mode}`
              : "Tracking — release stops motion",
          );
        }
      };
      w.postMessage({
        type: "init",
        wasm: new URL("/mediapipe", location.origin).href,
        model:
          import.meta.env.VITE_HAND_MODEL_URL ||
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      });
    } catch {
      if (token === generation.current) {
        stop();
        setStatus("Camera denied or unavailable. Mouse and touch still work.");
      }
    }
  };
  return (
    <div className="globe-tools">
      <button onClick={active ? stop : start}>
        {active ? "Stop camera / gestures" : "Enable gesture control"}
      </button>
      <video
        className="gesture-video"
        ref={video}
        muted
        playsInline
        hidden={!active}
      />
      <span role="status">{status}</span>
      <p className="muted">
        Optional experiment. Video stays in this browser. Release stops; Escape
        disables; mouse/touch overrides. Model assets load on first use.
      </p>
    </div>
  );
}
