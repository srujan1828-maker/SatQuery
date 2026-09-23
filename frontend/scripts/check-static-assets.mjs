import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Verify the exact public paths used by Cesium and MediaPipe, not just that
// the copy plugin reported success. An HTML fallback is not an image/WASM.
const root = new URL("../dist/", import.meta.url);
for (const name of ["px", "mx", "py", "my", "pz", "mz"]) {
  const bytes = await readFile(new URL(`cesium/Assets/Textures/SkyBox/tycho2t3_80_${name}.jpg`, root));
  assert.equal(bytes.readUInt16BE(0), 0xffd8, "Skybox must be a JPEG");
}
const logo = await readFile(new URL("cesium/Assets/Images/ion-credit.png", root));
assert.equal(logo.readUInt32BE(0), 0x89504e47, "Credit must be a PNG");
for (const folder of ["cesium/Workers/", "cesium/ThirdParty/", "cesium/Widgets/"]) {
  assert.ok((await readdir(new URL(folder, root))).length, `${folder} is empty`);
}
const wasmFiles = (await readdir(new URL("mediapipe/", root))).filter(name => name.endsWith(".wasm"));
assert.ok(wasmFiles.length, "MediaPipe WASM files missing");
for (const name of wasmFiles) {
  const bytes = await readFile(new URL(`mediapipe/${name}`, root));
  assert.equal(bytes.readUInt32BE(0), 0x0061736d, "Invalid WASM");
  await readFile(new URL(`mediapipe/${name.replace(/\.wasm$/, ".js")}`, root));
}
console.log("Cesium and MediaPipe public asset paths verified.");
