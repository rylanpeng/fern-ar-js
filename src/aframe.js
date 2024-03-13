import { Gesture } from "./gesture.js";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
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

  notify: function (gesture) {
    if (this.gestureEntityMap.has(+gesture)) {
      let entities = this.gestureEntityMap.get(+gesture);
      entities.forEach((entity, _) => {
        console.log(
          `emit fernar-gesture-event-${+gesture} to entity ${entity.name}`
        );
        entity.emit(`fernar-gesture-event-${+gesture}`);
      });
    }
  },
});

AFRAME.registerComponent("fernar-gesture", {
  dependencies: ["fernar-gesture-system"],
  schema: {
    modelJson: {
      type: "string",
      default: "",
    },
    modelBin: {
      type: "array",
      default: [],
    },
    drawLandmarker: { type: "boolean", default: true },
  },
  init: function () {
    console.log(`this.data.modelJson: ${this.data.modelJson}`);
    console.log(`this.data.modelBin: ${this.data.modelBin}`);
    this.gestureRecognizer = new Gesture();
    this.count = 0;

    this.canvasElement = document.createElement("canvas");
    this.canvasElement.setAttribute("class", "output_canvas");
    this.canvasElement.setAttribute(
      "style",
      "position: absolute; left: 0px; top: 0px;"
    );
    this.canvasCtx = this.canvasElement.getContext("2d");
    this.el.sceneEl.parentNode.appendChild(this.canvasElement);
    this.video = document.createElement("video");
    this.video.setAttribute("autoplay", "");
    this.video.setAttribute("muted", "");
    this.video.setAttribute("playsinline", "");
    this.video.setAttribute(
      "style",
      "position: absolute; top: 0px; left: 0px; width: 100%; height: 100%; z-index: -2; object-fit: cover;"
    );
    this.el.sceneEl.parentNode.appendChild(this.video);

    this.el.sceneEl.addEventListener("renderstart", () => {
      navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
        this.video.srcObject = stream;
        this.video.addEventListener("loadeddata", async () => {
          console.log(`loadeddata`);
          await this.gestureRecognizer.init(
            this.data.modelJson,
            this.data.modelBin
          );
          this.gestureRecognizer.predict(this.video);
        });
        this.gestureRecognizer.result = ({ landmarks, gesture }) => {
          if (this.data.drawLandmarker) {
            this._drawLandmarker(landmarks);
          }
          if (this.count == 10) {
            this.el.sceneEl.systems["fernar-gesture-system"].notify(gesture);
            this.count = 0;
          }
          this.count++;
        };
      });
    });
  },
  _drawLandmarker(landmarks) {
    this.canvasElement.style.width = this.video.offsetWidth;
    this.canvasElement.style.height = this.video.offsetHeight;
    this.canvasElement.width = this.video.offsetWidth;
    this.canvasElement.height = this.video.offsetHeight;
    this.canvasCtx.save();
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
    this.canvasCtx.restore();
  },
  tick: function () {},
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
