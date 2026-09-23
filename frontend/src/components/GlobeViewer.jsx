import { useEffect, useRef, useState } from "react";
import {
  Viewer,
  UrlTemplateImageryProvider,
  ImageryLayer,
  Cartesian3,
  Cartographic,
  Math as CMath,
  Rectangle,
  SingleTileImageryProvider,
  GeoJsonDataSource,
  Color,
  ScreenSpaceEventType,
  HeadingPitchRange,
  Matrix4,
  Ion,
  Terrain,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import GestureControl from "./GestureControl";
import { boundsFor } from "../geo.js";
export default function GlobeViewer({ lat, lon, radius, onSelect, result }) {
  const host = useRef(),
    viewer = useRef(),
    select = useRef(onSelect),
    camera = useRef(),
    layer = useRef(),
    sequence = useRef(0);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [index, setIndex] = useState(0),
    [opacity, setOpacity] = useState(0.85);
  const opacityRef = useRef(opacity);
  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    let v;
    let alive = true;
    let removeRenderError;
    try {
      const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
      if (token) Ion.defaultAccessToken = token;
      v = new Viewer(host.current, {
        showRenderLoopErrors: false,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
        requestRenderMode: true,
        baseLayer: new ImageryLayer(
          new UrlTemplateImageryProvider({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            credit: "Navigation imagery © Esri, Maxar, Earthstar Geographics",
            maximumLevel: 18,
          }),
        ),
        ...(token ? { terrain: Terrain.fromWorldTerrain() } : {}),
      });
      v.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
      viewer.current = v;
      removeRenderError = v.scene.renderError.addEventListener(() => {
        if (!alive) return;
        setReady(false);
        setError("3D rendering stopped. Switch to the 2D map, or reload to retry.");
      });
      v.scene.screenSpaceCameraController.minimumZoomDistance = 100;
      v.screenSpaceEventHandler.setInputAction((e) => {
        const point = v.camera.pickEllipsoid(
          e.position,
          v.scene.globe.ellipsoid,
        );
        if (point) {
          const c = Cartographic.fromCartesian(point);
          const a = CMath.toDegrees(c.latitude),
            b = CMath.toDegrees(c.longitude);
          if (Math.abs(a) <= 80) select.current(a, b);
        }
      }, ScreenSpaceEventType.LEFT_CLICK);
      queueMicrotask(() => {
        if (alive) setReady(true);
      });
    } catch {
      queueMicrotask(() => {
        if (alive)
          setError("3D rendering is unavailable. Switch to the 2D map.");
      });
    }
    return () => {
      alive = false;
      removeRenderError?.();
      viewer.current = null;
      if (v && !v.isDestroyed()) v.destroy();
    };
  }, []);
  useEffect(() => {
    const v = viewer.current;
    if (!ready || !v) return;
    const [[south, west], [north, east]] = boundsFor(lat, lon, radius);
    const old = v.entities.getById("aoi");
    if (old) v.entities.remove(old);
    v.entities.add({
      id: "aoi",
      rectangle: {
        coordinates: Rectangle.fromDegrees(west, south, east, north),
        material: Color.AQUAMARINE.withAlpha(0.08),
        outline: true,
        outlineColor: Color.AQUAMARINE,
      },
    });
    v.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        lon,
        lat,
        Math.max(12000, radius * 8000),
      ),
      duration: 1,
    });
    camera.current = null;
  }, [lat, lon, radius, ready]);

  useEffect(() => {
    const v = viewer.current;
    if (!ready || !v) return;
    const id = ++sequence.current;
    let alive = true;
    if (layer.current) {
      v.imageryLayers.remove(layer.current, true);
      layer.current = null;
    }
    const image = result?.images[index] || result?.images[0];
    if (image)
      SingleTileImageryProvider.fromUrl(image.url, {
        rectangle: Rectangle.fromDegrees(...image.bbox),
        credit: `${image.sensor} ${image.date} · ${image.scene_id}`,
      })
        .then((provider) => {
          if (!alive || id !== sequence.current || v.isDestroyed()) return;
          layer.current = v.imageryLayers.addImageryProvider(provider);
          layer.current.alpha = opacityRef.current;
          v.scene.requestRender();
        })
        .catch(() => {
          if (alive && id === sequence.current)
            setError(
              "Evidence layer could not load. Its source may have expired.",
            );
        });
    v.scene.requestRender();
    return () => {
      alive = false;
    };
  }, [result, index, ready]);
  useEffect(() => {
    if (layer.current) {
      layer.current.alpha = opacity;
      viewer.current?.scene.requestRender();
    }
  }, [opacity]);
  useEffect(() => {
    const v = viewer.current;
    if (!ready || !v) return;
    let alive = true,
      source;
    if (result?.change_geojson)
      GeoJsonDataSource.load(result.change_geojson, {
        stroke: Color.CYAN,
        fill: Color.CYAN.withAlpha(0.3),
        clampToGround: true,
      })
        .then((s) => {
          if (!alive || v.isDestroyed()) return;
          source = s;
          v.dataSources.add(s);
          v.scene.requestRender();
        })
        .catch(() =>
          setError(
            "Change polygons could not be rendered. GeoJSON export remains available.",
          ),
        );
    return () => {
      alive = false;
      if (source && !v.isDestroyed()) v.dataSources.remove(source, true);
    };
  }, [result, ready]);
  const navigate = (intent) => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    if (!intent.mode) {
      camera.current = null;
      v.camera.lookAtTransform(Matrix4.IDENTITY);
      return;
    }
    v.camera.cancelFlight();
    const target = Cartesian3.fromDegrees(lon, lat);
    if (!camera.current)
      camera.current = {
        heading: v.camera.heading,
        pitch: Math.min(-0.15, v.camera.pitch),
        range: Cartesian3.distance(v.camera.positionWC, target),
      };
    const c = camera.current;
    c.heading -= (intent.dx || 0) * 3;
    c.pitch = CMath.clamp(c.pitch + (intent.dy || 0) * 2, -Math.PI / 2, -0.15);
    c.range = CMath.clamp(c.range * (1 + (intent.zoom || 0)), 200, 20000000);
    v.camera.lookAt(target, new HeadingPitchRange(c.heading, c.pitch, c.range));
    v.scene.requestRender();
  };
  return (
    <>
      <div className="globe" ref={host} />
      {error && <p role="alert">{error}</p>}
      {result?.images.length > 0 && (
        <div className="globe-tools">
          <label>
            Acquisition layer
            <select value={index} onChange={(e) => setIndex(+e.target.value)}>
              {result.images.map((im, i) => (
                <option key={im.id} value={i}>
                  {im.date} · {im.sensor} · {im.role}
                </option>
              ))}
            </select>
          </label>
          <label>
            Evidence opacity
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={opacity}
              onChange={(e) => setOpacity(+e.target.value)}
            />
          </label>
        </div>
      )}
      {ready && <GestureControl onIntent={navigate} overrideTarget={host} />}
      <p className="muted">
        Click Earth to select an area. Navigation basemap is separate from dated
        evidence.{" "}
        {import.meta.env.VITE_CESIUM_ION_TOKEN
          ? "Terrain enabled."
          : "Ellipsoid view; terrain requires a configured Cesium ion token."}
      </p>
    </>
  );
}
