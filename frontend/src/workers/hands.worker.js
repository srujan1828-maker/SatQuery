import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
let model;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const files = await FilesetResolver.forVisionTasks(data.wasm);
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.model, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame") {
      try {
        const result = model.detectForVideo(data.bitmap, data.timestamp);
        self.postMessage({ type: "hands", landmarks: result.landmarks });
      } finally {
        data.bitmap.close();
      }
    }
  } catch {
    self.postMessage({
      type: "error",
      message:
        "Hand tracking could not start on this browser. Use mouse or touch.",
    });
  }
};
