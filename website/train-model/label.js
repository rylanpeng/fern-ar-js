import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

let handLandmarker = undefined;

const createHandLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });
};
createHandLandmarker();

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

document.addEventListener("DOMContentLoaded", function () {
  setTimeout(enableCam, 500);
});

function enableCam(event) {
  if (!handLandmarker) {
    console.log("Wait! objectDetector not loaded yet.");
    return;
  }

  const constraints = {
    video: true,
  };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
  });
}

let lastVideoTime = -1;
let results = undefined;
let storeGestureBool = false;
let csvData = null;

async function predictWebcam() {
  canvasElement.style.width = video.offsetWidth;
  canvasElement.style.height = video.offsetHeight;
  canvasElement.width = video.offsetWidth;
  canvasElement.height = video.offsetHeight;

  let startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    results = handLandmarker.detectForVideo(video, startTimeMs);
  }
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (results.landmarks) {
    if (results.landmarks.length > 0) {
      const preProcessedLandmarkList = preProcessedLandmark(results);
      if (preProcessedLandmarkList.length === 42) {
        if (storeGestureBool) {
          storeGestureBool = false;
          let gesture_id = document.getElementById("gesture_id").value;
          csvData += gesture_id + "," + preProcessedLandmarkList + "\n";
          addMessage("store gesture " + gesture_id);
          document.getElementById("messages").innerHTML +=
            "<span> store gesture " + gesture_id + "</span><br>";
        }
      }
    }

    for (const landmarks of results.landmarks) {
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
        color: "#C273E5",
        lineWidth: 7,
      });
      drawLandmarks(canvasCtx, landmarks, { color: "#7E369E", lineWidth: 1 });
    }
  }
  canvasCtx.restore();

  // Call this function again to keep predicting when the browser is ready.
  window.requestAnimationFrame(predictWebcam);
}

function preProcessedLandmark(results) {
  // calc_landmark_list
  const landmark_list = [];
  for (const landmarks of results.landmarks) {
    for (const landmark of landmarks) {
      const landmark_x = Math.min(
        Math.floor(landmark.x * canvasElement.width),
        canvasElement.width - 1
      );
      const landmark_y = Math.min(
        Math.floor(landmark.y * canvasElement.height),
        canvasElement.height - 1
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
  return normalized_landmark_list;
}

window.storeGesture = function storeGesture() {
  // TODO: Use mutex?
  storeGestureBool = true;
};

document
  .getElementById("training-csv")
  .addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) {
      alert("No file selected");
      return;
    }
    const reader = new FileReader();
    reader.onload = function (event) {
      csvData = event.target.result;
      addMessage('CSV file upload successfully');
    };
    reader.readAsText(file);
  });

window.downloadCsv = function downloadCsv() {
  const blob = new Blob([csvData], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "generated-file.csv";

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

window.startTraining = function startTraining() {
  const NUM_CLASSES = parseInt(
    document.getElementById("trainGestureNum").value
  );

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function shuffleData(X_dataset, y_dataset) {
    const indices = Array.from({ length: X_dataset.length }, (_, i) => i);
    shuffleArray(indices);

    const X_shuffled = indices.map((i) => X_dataset[i]);
    const y_shuffled = indices.map((i) => y_dataset[i]);

    return { X: X_shuffled, y: y_shuffled };
  }

  async function loadAndPreprocessData() {
    const data = csvData
      .split("\n")
      .slice(0, -1)
      .map((row) => row.split(","));
    const X_dataset = data.map((row) => row.slice(1).map(parseFloat));
    const y_dataset = data.map((row) => [parseInt(row[0])]);

    const shuffledData = shuffleData(X_dataset, y_dataset);

    const splitIndex = Math.floor(0.75 * shuffledData.X.length);
    const X_train = tf.tensor2d(shuffledData.X.slice(0, splitIndex));
    const X_test = tf.tensor2d(shuffledData.X.slice(splitIndex));
    const y_train = tf.tensor2d(shuffledData.y.slice(0, splitIndex));
    const y_test = tf.tensor2d(shuffledData.y.slice(splitIndex));
    return { X_train, X_test, y_train, y_test };
  }

  async function trainModel() {
    const progressBar = document.getElementById("progress-bar");
    const { X_train, X_test, y_train, y_test } = await loadAndPreprocessData();

    const model = tf.sequential();
    model.add(
      tf.layers.dense({ inputShape: [21 * 2], units: 20, activation: "relu" })
    );
    model.add(tf.layers.dropout(0.2));
    model.add(tf.layers.dense({ units: 10, activation: "relu" }));
    model.add(tf.layers.dropout(0.4));
    model.add(tf.layers.dense({ units: NUM_CLASSES, activation: "softmax" }));

    model.compile({
      optimizer: "adam",
      loss: "sparseCategoricalCrossentropy",
      metrics: ["accuracy"],
    });

    const epochs = 1000;
    const batchSize = 128;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const history = await model.fit(X_train, y_train, {
        epochs: 1,
        batchSize,
        validationData: [X_test, y_test],
      });

      const progress = ((epoch + 1) / epochs) * 100;
      progressBar.style.width = `${progress}%`;

      if (history.history.val_loss[0] < 0.1) {
        addMessage("Finished training early.");
        break;
      }
    }
    addMessage("Model trained successfully.");

    return model;
  }

  async function saveModel() {
    document.getElementById("progress-container").style.display = "block";
    const model = await trainModel();
    await model.save("downloads://model");
    document.getElementById("progress-container").style.display = "none";
  }
  saveModel();
};

function addMessage(message) {
  const messagesContainer = document.getElementById("messages");
  const span = document.createElement("span");
  span.textContent = message;
  messagesContainer.appendChild(span);

  messagesContainer.appendChild(document.createElement("br"));

  const maxMessages = 20; 
  const messages = messagesContainer.querySelectorAll("span");
  if (messages.length > maxMessages) {
    messages[0].remove(); 
    messagesContainer.querySelector("br").remove();
  }
  span.scrollIntoView({ behavior: "smooth", block: "end" });
}
