/**
 * Controls Cesium camera focus and flight behavior for the loaded dataset while
 * keeping fallback client URL camera parameters in one place.
 */
export class FocusController {
  constructor({ webMapClientUrl, defaultBounds, selectedBounds, durationSeconds = 0.9 }) {
    this.webMapClientUrl = webMapClientUrl;
    this.defaultBounds = defaultBounds;
    this.selectedBounds = selectedBounds;
    this.durationSeconds = durationSeconds;
  }

  cameraForBounds(bounds) {
    const longitude = (bounds.minLon + bounds.maxLon) / 2;
    const latitude = (bounds.minLat + bounds.maxLat) / 2;
    const latSpanMeters = (bounds.maxLat - bounds.minLat) * 111320;
    const lonSpanMeters =
      (bounds.maxLon - bounds.minLon) *
      Math.max(111320 * Math.cos((latitude * Math.PI) / 180), 1);
    const height = Math.max(900, Math.min(Math.max(latSpanMeters, lonSpanMeters) * 1.8, 24000));

    return {
      longitude,
      latitude,
      height,
      heading: 0,
      pitch: -55,
      roll: 0,
    };
  }

  clientUrlWithCamera(camera) {
    const url = new URL(this.webMapClientUrl, window.location.origin);
    url.searchParams.set("longitude", camera.longitude.toFixed(8));
    url.searchParams.set("latitude", camera.latitude.toFixed(8));
    url.searchParams.set("height", Math.round(camera.height).toString());
    url.searchParams.set("heading", camera.heading.toString());
    url.searchParams.set("pitch", camera.pitch.toString());
    url.searchParams.set("roll", camera.roll.toString());
    return url;
  }

  setViewToBounds(frameWindow, bounds) {
    const Cesium = frameWindow?.Cesium;
    const cesiumViewer = frameWindow?.cesiumViewer;
    if (!Cesium?.Rectangle || !cesiumViewer?.camera || !bounds) return false;

    const lonPadding = Math.max((bounds.maxLon - bounds.minLon) * 0.18, 0.002);
    const latPadding = Math.max((bounds.maxLat - bounds.minLat) * 0.18, 0.002);
    const destination = Cesium.Rectangle.fromDegrees(
      bounds.minLon - lonPadding,
      bounds.minLat - latPadding,
      bounds.maxLon + lonPadding,
      bounds.maxLat + latPadding,
    );

    cesiumViewer.trackedEntity = undefined;
    cesiumViewer.camera.cancelFlight?.();
    cesiumViewer.camera.setView({ destination });
    cesiumViewer.scene?.requestRender?.();
    return true;
  }

  focusDataset(frameWindow, bounds = this.defaultBounds) {
    return this.setViewToBounds(frameWindow, bounds || this.selectedBounds() || this.defaultBounds);
  }

  scheduleDatasetFocus(frameWindow, signal, delays = [0]) {
    for (const delay of delays) {
      window.setTimeout(() => {
        if (signal?.aborted) return;
        this.focusDataset(frameWindow);
      }, delay);
    }
  }

  async flyToTileset(frameWindow, tileset, bounds) {
    const camera = this.cameraForBounds(bounds);
    const Cesium = frameWindow?.Cesium;
    const cesiumViewer = frameWindow?.cesiumViewer;

    if (Cesium && cesiumViewer?.camera && tileset) {
      await cesiumViewer.flyTo(tileset, {
        duration: this.durationSeconds,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(camera.heading),
          Cesium.Math.toRadians(camera.pitch),
          camera.height,
        ),
      });
      return null;
    }

    return this.clientUrlWithCamera(camera);
  }
}
