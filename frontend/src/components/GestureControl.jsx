import { useRef, useState, useEffect } from "react";
import { gestureIntent } from "../gesture.js";

export default function GestureControl({ onIntent, overrideTarget }) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Off");
  const video = useRef(null);
  const session = useRef(null);
  const callback = useRef(onIntent);
  useEffect(() => { callback.current = onIntent; }, [onIntent]);

  const release = () => {
    const s = session.current;
    session.current = null;
    if (s) {
      s.cancelled = true;
      clearTimeout(s.timer);
      clearTimeout(s.deadline);
      s.stream?.getTracks().forEach(t => t.stop());
      s.model?.close();
    }
    if (video.current) video.current.srcObject = null;
    callback.current({ mode: null });
  };
  const stop = () => {
    release();
    setActive(false);
    setStatus("Off");
  };
  useEffect(() => {
    const key = e => { if (e.key === "Escape") stop(); };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", visibility);
      release();
    };
  }, []);
  useEffect(() => {
    const el = overrideTarget?.current;
    if (!el) return;
    el.addEventListener("pointerdown", stop);
    el.addEventListener("wheel", stop);
    return () => {
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("wheel", stop);
    };
  }, [overrideTarget]);

  const start = async () => {
    release();
    const s = { cancelled: false, previous: null, lastFrame: -1 };
    session.current = s;
    const fail = message => {
      if (s.cancelled) return;
      release();
      setActive(false);
      setStatus(message);
    };
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail("Camera requires HTTPS and a browser with camera support.");
      return;
    }
    setActive(true);
    setStatus("Requesting camera…");
    let stage = "camera";
    s.deadline = setTimeout(() => fail("Startup timed out. Check camera permission and model downloads, then retry."), 45000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 }, facingMode: "user" },
        audio: false,
      });
      if (s.cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      s.stream = stream;
      video.current.srcObject = stream;
      await video.current.play();
      if (s.cancelled) return;
      stage = "model";
      setStatus("Loading lightweight browser tracker…");
      // Use the document loader: MediaPipe's WASM loader may use importScripts,
      // which is unsupported inside the previous module Worker.
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      if (s.cancelled) return;
      const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`);
      if (s.cancelled) return;
      const model = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: import.meta.env.VITE_HAND_MODEL_URL || "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      if (s.cancelled) { model.close(); return; }
      s.model = model;
      clearTimeout(s.deadline);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      setStatus("Ready — pinch to rotate; two pinches to zoom");
      const tick = () => {
        if (s.cancelled) return;
        const started = performance.now();
        const v = video.current;
        try {
          if (v?.readyState >= 2 && v.currentTime !== s.lastFrame) {
            s.lastFrame = v.currentTime;
            canvas.width = 320;
            canvas.height = Math.max(1, Math.round(320 * v.videoHeight / v.videoWidth));
            context.drawImage(v, 0, 0, canvas.width, canvas.height);
            const { landmarks } = model.detectForVideo(canvas, started);
            const intent = gestureIntent(landmarks, s.previous);
            s.previous = intent;
            callback.current(intent);
            s.lastDetection = performance.now();
            setStatus(intent.mode ? `Active: ${intent.mode}` : "Tracking — pinch to move; release to stop");
          } else if (performance.now() - (s.lastDetection || 0) > 600) {
            s.previous = null;
            callback.current({ mode: null });
          }
          // No queued frames: cap at 12 fps and leave at least as much time
          // for globe interaction as inference used on slower devices.
          s.timer = setTimeout(tick, Math.max(83, performance.now() - started));
        } catch (error) {
          console.warn("Hand tracking inference failed", error);
          fail("Hand tracking failed while processing video. Stop other camera apps and retry.");
        }
      };
      tick();
    } catch (error) {
      if (s.cancelled) return;
      console.warn(`Hand tracking ${stage} failed`, error);
      fail(stage === "camera"
        ? (error.name === "NotAllowedError" ? "Camera permission denied. Allow camera access in site settings, then retry." : "Camera unavailable. Close other camera apps and retry.")
        : "Tracker model or WASM could not load. Check your connection or content blocker, then retry.");
    }
  };
  return <div className="globe-tools">
    <button onClick={active ? stop : start}>{active ? "Stop camera / gestures" : "Enable gesture control"}</button>
    <video className="gesture-video" ref={video} muted playsInline hidden={!active} />
    <span role="status">{status}</span>
    <p className="muted">Low-power browser tracking. Pinch to rotate; use two pinches to zoom. Release stops; Escape or mouse/touch disables. Video stays on this device. Model downloads on first use.</p>
  </div>;
}
