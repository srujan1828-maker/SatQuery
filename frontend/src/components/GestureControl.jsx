import { useRef, useState, useEffect } from "react";
import { gestureIntent, trackingDelay } from "../gesture.js";

export default function GestureControl({ onIntent, overrideTarget }) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Off");
  const [controlMode, setControlMode] = useState("auto");
  const [sensitivity, setSensitivity] = useState(1);
  const settings = useRef({ mode: "auto", sensitivity: 1 });
  const video = useRef(null);
  const session = useRef(null);
  const callback = useRef(onIntent);
  const changeSettings = (mode, gain) => {
    settings.current = { mode, sensitivity: gain };
    setControlMode(mode);
    setSensitivity(gain);
    if (session.current) session.current.previous = null;
    callback.current({ mode: null });
  };
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
      setStatus("Ready — open hand to rotate; pinch and move up/down to zoom");
      const tick = () => {
        if (s.cancelled) return;
        const started = performance.now();
        const v = video.current;
        try {
          if (v?.readyState >= 2 && v.currentTime !== s.lastFrame) {
            s.lastFrame = v.currentTime;
            const height = Math.max(1, Math.round(320 * v.videoHeight / v.videoWidth));
            if (canvas.width !== 320) canvas.width = 320;
            if (canvas.height !== height) canvas.height = height;
            context.drawImage(v, 0, 0, canvas.width, canvas.height);
            const { landmarks } = model.detectForVideo(canvas, started);
            const intent = gestureIntent(landmarks, s.previous, settings.current);
            s.previous = intent;
            callback.current(intent);
            s.lastDetection = performance.now();
            s.moving = Boolean(intent.mode);
            const nextStatus = intent.mode === "zoom"
              ? (intent.zoom < 0 ? "Zooming in" : intent.zoom > 0 ? "Zooming out" : "Zoom ready")
              : intent.mode === "orbit" ? "Rotating Earth" : "Paused — show an open hand";
            if (nextStatus !== s.status && started - (s.statusAt || 0) >= 250) {
              s.status = nextStatus;
              s.statusAt = started;
              setStatus(nextStatus);
            }
          } else if (performance.now() - (s.lastDetection || 0) > 600) {
            s.previous = null;
            s.moving = false;
            callback.current({ mode: null });
          }
          // No queued frames: cap at 12 fps and leave at least as much time
          // for globe interaction as inference used on slower devices.
          s.timer = setTimeout(tick, trackingDelay(performance.now() - started, s.moving));
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
    <div className="gesture-modes" role="group" aria-label="Control mode">
      {[["auto", "Auto"], ["orbit", "Rotate"], ["zoom", "Zoom"]].map(([mode, label]) =>
        <button key={mode} type="button" aria-pressed={controlMode === mode}
          onClick={() => changeSettings(mode, sensitivity)}>{label}</button>)}
    </div>
    <button onClick={active ? stop : start}>{active ? "Stop camera / gestures" : "Enable gesture control"}</button>
    <video className="gesture-video" ref={video} muted playsInline hidden={!active} />
    <span role="status" className="gesture-status">{status}</span>
    <label>Zoom sensitivity: {sensitivity.toFixed(1)}×
      <input type="range" min="0.5" max="2" step="0.1" value={sensitivity}
        onChange={e => changeSettings(controlMode, Number(e.target.value))} />
    </label>
    {controlMode === "auto" ? <div className="gesture-guide" aria-label="Gesture guide">
      <div><strong>Rotate</strong><span>Show one open hand and move it gently.</span></div>
      <div><strong>Zoom</strong><span>Pinch thumb and index. Move up to zoom in, down to zoom out.</span></div>
      <div><strong>Pause</strong><span>Close your fist or lower your hand. Escape turns the camera off.</span></div>
    </div> : <div className="gesture-guide" aria-label="Gesture guide">
      <div><strong>↔ Zoom in</strong><span>Show two open palms and spread them apart.</span></div>
      <div><strong>→ ← Zoom out</strong><span>Bring your two open palms closer together.</span></div>
      <div><strong>↻ Rotate</strong><span>Open one hand and move it, or pinch and move.</span></div>
      <div><strong>↑ ↓ One-hand zoom</strong><span>Select Zoom only. Pinch and move up to zoom in, down to zoom out.</span></div>
      <div><strong>Pause</strong><span>Lower your hands or close both fists. Escape turns the camera off.</span></div>
    </div>}
    <p className="muted">Keep your hand facing the camera. Auto supports one-hand controls and two open palms for spread-to-zoom. Mouse/touch disables gestures. Video stays on this device. Model downloads on first use.</p>
  </div>;
}
