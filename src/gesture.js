import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as tf from "@tensorflow/tfjs";
class Gesture {
  constructor() {
    this.lastVideoTime = -1;
    this.results = undefined;
  }
  async init(modelJson, modelBin) {
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
      if (modelJson == "") {
        let response = await fetch("../model/model.json");
        modelFiles.push(new File([await response.text()], "model.json"));
        response = await fetch("../model/model.weights.bin");
        modelFiles.push(
          new File(
            [new Uint8Array(await response.arrayBuffer())],
            "model.weights.bin"
          )
        );
      } else {
        modelFiles.push(new File([modelJson], "model.json"));
        modelFiles.push(
          new File(
            [new Uint8Array(modelBin)],
            JSON.parse(modelJson).weightsManifest[0].paths[0]
          )
        );
      }
      this.model = await tf.loadLayersModel(tf.io.browserFiles(modelFiles));
      console.log("Model loaded successfully:", this.model);
    } catch (error) {
      console.error("Error loading model:", error);
    }
  }
  predict(video) {
    this.videoWidth = video.offsetWidth;
    this.videoHeight = video.offsetHeight;

    let startTimeMs = performance.now();
    if (this.lastVideoTime !== video.currentTime) {
      this.lastVideoTime = video.currentTime;
      this.results = this.handLandmarker.detectForVideo(video, startTimeMs);
    }
    if (this.results.landmarks) {
      if (this.results.landmarks.length > 0) {
        const preProcessedLandmarkList = this._preProcessedLandmark();
        if (preProcessedLandmarkList.length === 42) {
          this._predict(preProcessedLandmarkList).then((prediction) => {
            console.log("Predicted class index:", prediction);
            this.result({
              landmarks: this.results.landmarks,
              gesture: prediction,
            });
          });
        }
      }
    }
    window.requestAnimationFrame(() => {
      this.predict(video);
    });
  }
  _preProcessedLandmark() {
    // calc_landmark_list
    const landmark_list = [];
    for (const landmarks of this.results.landmarks) {
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
    // console.log(`normalized_landmark_list: ${normalized_landmark_list}`);
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
    const resultIndex = resultData.indexOf(Math.max(...resultData));
    return resultIndex;
  }
}
export { Gesture };
