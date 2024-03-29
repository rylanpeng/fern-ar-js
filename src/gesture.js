import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as tf from "@tensorflow/tfjs";
class Gesture {
  constructor() {
    this.lastVideoTime = -1;
    this.results = undefined;
    this.stopPredict = false;
  }
  async init() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });

      let modelFiles = [];
      let response = await fetch(
        "https://cdn.jsdelivr.net/npm/fern-ar@latest/model/model.json"
      );
      modelFiles.push(new File([await response.text()], "model.json"));
      response = await fetch(
        "https://cdn.jsdelivr.net/npm/fern-ar@latest/model/model.weights.bin"
      );
      modelFiles.push(
        new File(
          [new Uint8Array(await response.arrayBuffer())],
          "model.weights.bin"
        )
      );
      this.model = await tf.loadLayersModel(tf.io.browserFiles(modelFiles));
      console.log("Model loaded successfully:", this.model);
    } catch (error) {
      console.error("Error loading model:", error);
    }
  }
  predict(video) {
    if (!this.stopPredict) {
      this.videoWidth = video.width;
      this.videoHeight = video.height;

      let startTimeMs = performance.now();
      if (this.lastVideoTime !== video.currentTime) {
        this.lastVideoTime = video.currentTime;
        this.results = this.handLandmarker.detectForVideo(video, startTimeMs);
      }
      const resultHands = this.results.handedness;
      const resultLandmarks = this.results.landmarks;
      const resultGestures = [];
      const promises = [];
      for (let i = 0; i < this.results.landmarks.length; i++) {
        const preProcessedLandmarkList = this._preProcessedLandmark(
          this.results.landmarks[i]
        );
        if (preProcessedLandmarkList.length === 42) {
          promises.push(
            this._predict(preProcessedLandmarkList).then(({prediction, confidence}) => {
              resultGestures.push({prediction: prediction, confidence: confidence});
            })
          );
        }
      }
      Promise.all(promises)
        .then(() => {
          this.result({
            hands: resultHands,
            landmarks: resultLandmarks,
            gestures: resultGestures,
          });
        })
        .catch((error) => {
          console.error("Error occurred during prediction:", error);
        });
    }
    window.requestAnimationFrame(() => {
      this.predict(video);
    });
  }
  async updateModel(modelJson, modelBin, binModelPath) {
    this.stopPredict = true;
    try {
      let modelFiles = [];
      modelFiles.push(new File([modelJson], "model.json"));
      modelFiles.push(new File([new Uint8Array(modelBin)], binModelPath));
      this.model = await tf.loadLayersModel(tf.io.browserFiles(modelFiles));
      console.log("Model loaded successfully:", this.model);
    } catch (error) {
      console.error("Error loading model:", error);
    }
    this.stopPredict = false;
  }
  _preProcessedLandmark(landmarks) {
    // calc_landmark_list
    const landmark_list = [];
    for (const landmark of landmarks) {
      const landmark_x = Math.min(
        Math.floor(landmark.x * this.videoWidth),
        this.videoWidth - 1
      );
      const landmark_y = Math.min(
        Math.floor(landmark.y * this.videoHeight),
        this.videoHeight - 1
      );
      landmark_list.push([landmark_x, landmark_y]);
    }

    // pre_process_landmark
    const temp_landmark_list = JSON.parse(JSON.stringify(landmark_list));
    let base_x = 0;
    let base_y = 0;
    for (let index = 0; index < temp_landmark_list.length; index++) {
      const landmark_point = temp_landmark_list[index];
      if (index === 0) {
        base_x = landmark_point[0];
        base_y = landmark_point[1];
      }
      temp_landmark_list[index][0] -= base_x;
      temp_landmark_list[index][1] -= base_y;
    }
    const flatLandmarkList = temp_landmark_list.flat();
    const max_value = Math.max(...flatLandmarkList.map(Math.abs));
    const normalize_ = (n) => n / max_value;
    const normalized_landmark_list = flatLandmarkList.map(normalize_);
    return normalized_landmark_list;
  }
  async _predict(landmark_list) {
    const inputTensor = tf.tensor(
      [landmark_list],
      [1, landmark_list.length],
      "float32"
    );
    const result = this.model.predict(inputTensor);
    const resultData = await result.data();
    const maxProbability = Math.max(...resultData);
    const resultIndex = resultData.indexOf(maxProbability);
    return {prediction: resultIndex, confidence: maxProbability};
  }
}
export { Gesture };
