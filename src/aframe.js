import { Gesture } from "./gesture.js";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
let gestureRecognizer = null;
let finishMLInit = false;
AFRAME.registerSystem("fernar-gesture-system", {
  schema: {},
  init: function () {
    this.gestureEntityMap = new Map();
  },
  start: function () {},
  tick: function () {},
  pause: function () {},
  play: function () {},
  addGestures: function (gestures, entity) {
    gestures.forEach((gesture) => {
      console.log(`Adding gesture ${+gesture} to entity`);
      if (this.gestureEntityMap.has(+gesture)) {
        this.gestureEntityMap.get(+gesture).add(entity);
      } else {
        this.gestureEntityMap.set(+gesture, new Set([entity]));
      }
    });
  },

  notify: function (gesture, landmarks) {
    if (landmarks.length > 0 && landmarks[0].length > 20) {
      const sums = landmarks[0].reduce(
        (acc, { x, y, z }) => ({
          sumX: acc.sumX + x,
          sumY: acc.sumY + y,
          sumZ: acc.sumZ + z,
        }),
        { sumX: 0, sumY: 0, sumZ: 0 }
      );

      const totalElements = landmarks[0].length;
      const { sumX, sumY, sumZ } = sums;
      const averageX = sumX / totalElements;
      const averageY = sumY / totalElements;
      const averageZ = sumZ / totalElements;

      if (this.gestureEntityMap.has(+gesture)) {
        let entities = this.gestureEntityMap.get(+gesture);
        entities.forEach((entity, _) => {
          console.log(`emit fernar-gesture-event-${+gesture}`);
          entity.emit(`fernar-gesture-event-${+gesture}`, {
            position: [averageX, averageY, averageZ],
          });
        });
      }
    }
  },
});

AFRAME.registerComponent("update-plane-rotation", {
  tick: function () {
    const cameraRotation = this.el.sceneEl.camera.el.object3D.rotation.clone();
    this.el.object3D.rotation.copy(cameraRotation);
  },
});

AFRAME.registerComponent("fernar-gesture", {
  dependencies: ["fernar-gesture-system"],
  schema: {
    drawLandmarker: { type: "boolean", default: true },
  },
  init: function () {
    this.el.sceneEl.addEventListener("renderstart", () => {
      gestureRecognizer = new Gesture();
      this.count = 0;

      this.assetsElement = document.createElement("a-assets");
      this.el.sceneEl.appendChild(this.assetsElement);

      this.canvasElement = document.createElement("canvas");
      this.canvasElement.setAttribute("id", "fernar-canvas");
      this.assetsElement.appendChild(this.canvasElement);

      this.video = document.createElement("video");
      this.video.setAttribute("id", "fernar-video");
      this.video.setAttribute("autoplay", "");
      this.video.setAttribute("muted", "");
      this.video.setAttribute("playsinline", "");
      this.assetsElement.appendChild(this.video);

      this.APlaneElement = document.createElement("a-plane");
      this.APlaneElement.setAttribute("width", 5);
      this.APlaneElement.setAttribute("height", 5);
      this.APlaneElement.setAttribute("position", "-6 3 -7");

      this.AVideoElement = document.createElement("a-plane");
      this.AVideoElement.setAttribute("src", "#fernar-video");
      this.AVideoElement.setAttribute("width", 5);
      this.AVideoElement.setAttribute("height", 5);
      this.AVideoElement.setAttribute("position", "-6 3 -7");

      const camera = this.el.sceneEl.querySelector("a-camera");
      camera.appendChild(this.AVideoElement);
      camera.appendChild(this.APlaneElement);

      navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
        this.video.srcObject = stream;
        this.video.addEventListener("loadedmetadata", async () => {
          this.video.width = this.video.videoWidth;
          this.video.height = this.video.videoHeight;
          await gestureRecognizer.init();
          finishMLInit = true;
          gestureRecognizer.predict(this.video);
        });
        gestureRecognizer.result = ({ landmarks, gesture }) => {
          if (this.data.drawLandmarker) {
            this._drawLandmarker(landmarks);
          }
          if (this.count == 10) {
            this.el.sceneEl.systems["fernar-gesture-system"].notify(
              gesture,
              landmarks
            );
            this.count = 0;
          }
          this.count++;
        };
      });
    });
  },
  _drawLandmarker(landmarks) {
    this.canvasElement.width = this.video.width;
    this.canvasElement.height = this.video.height;
    this.canvasCtx = this.canvasElement.getContext("2d");
    this.canvasCtx.clearRect(
      0,
      0,
      this.canvasElement.width,
      this.canvasElement.height
    );
    const drawingUtils = new DrawingUtils(this.canvasCtx);
    for (const landmark of landmarks) {
      drawingUtils.drawConnectors(landmark, HandLandmarker.HAND_CONNECTIONS, {
        color: "#C273E5",
        lineWidth: 7,
      });
      drawingUtils.drawLandmarks(landmark, {
        color: "#7E369E",
        lineWidth: 1,
      });
    }
  },
  tick: function () {
    this.texture = new THREE.CanvasTexture(this.canvasElement);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.5,
    });
    this.APlaneElement.getObject3D("mesh").material = material;
    this.texture.needsUpdate = true;
  },
  pause: function () {},
  play: function () {},
});

AFRAME.registerComponent("fernar-gesture-target", {
  dependencies: ["fernar-gesture-system"],
  schema: {
    gesture: { type: "array" },
  },
  init: function () {
    this.el.sceneEl.systems["fernar-gesture-system"].addGestures(
      this.data.gesture,
      this.el
    );
  },
  start: function () {},
  tick: function () {},
  pause: function () {},
  play: function () {},
});

async function updateModel(modelJson, modelBin, binModelPath) {
  // TODO: Probably set a timeout here
  await new Promise((resolve) => {
    const checkFinish = () => {
      if (finishMLInit) {
        resolve();
      } else {
        setTimeout(checkFinish, 100);
      }
    };
    checkFinish();
  });
  await gestureRecognizer.updateModel(modelJson, modelBin, binModelPath);
}
export { updateModel };
