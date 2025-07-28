const socket = io();
let peerConnection;
let dataChannel;
let roomCode;
let isSender = false;
let receivedSize = 0;
let sending = false; // NEW FLAG to prevent overlapping sends
let offset = 0;
let arrayBuffer;
let totalSize = 0;
let chunkSize = 256 * 1024;
let senderProgress;
let isPaused = false;
let startTime;
let lastTimeEstimateUpdate = 0;



function selectRole(role) {
  document.getElementById("roleSelect").style.display = "none";
  if (role === "send") {
    isSender = true;
    roomCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit numeric
    document.getElementById("sendUI").style.display = "block";
    document.getElementById("generatedRoomCode").textContent = roomCode;
    socket.emit("create-room", roomCode);
    setupConnection();
  } else {
    isSender = false;
    document.getElementById("receiveUI").style.display = "block";
  }
}

function copyRoomCode() {
  if (!roomCode) return;

  const messageElement = document.getElementById("copyStatus");

  // Try Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(roomCode)
      .then(() => showCopyMessage("Room code copied ✅", messageElement))
      .catch(() => fallbackCopy(roomCode, messageElement));
  } else {
    fallbackCopy(roomCode, messageElement);
  }
}

function fallbackCopy(text, messageElement) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed"; // prevent scrolling
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
    showCopyMessage("Room code copied ✅", messageElement);
  } catch (err) {
    showCopyMessage("❌ Copy failed. Copy manually.", messageElement);
  }
  document.body.removeChild(textarea);
}

function showCopyMessage(msg, el) {
  el.innerText = msg;
  el.style.opacity = 1;

  setTimeout(() => {
    el.style.opacity = 0;
  }, 2000); // fade out after 2 seconds
}

function joinRoom() {
  roomCode = document.getElementById("roomReceive").value;
  socket.emit("join-room", roomCode);
}

function setupConnection() {
  
     peerConnection = new RTCPeerConnection({
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
});





  // ✅ ICE candidate handling
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate);
    }
  };

  // ✅ Connection state logging
  peerConnection.onconnectionstatechange = () => {
    console.log("Connection state:", peerConnection.connectionState);
    if (peerConnection.connectionState === "connected") {
      document.getElementById("status").innerText = "Connected ✅";
      document.getElementById("sendBtn").disabled = false;
    }
  };

  if (isSender) {
    // ✅ SENDER: create data channel
     dataChannel = peerConnection.createDataChannel("file");
    dataChannel.bufferedAmountLowThreshold = 8 * 1024 * 1024;
      dataChannel.addEventListener("bufferedamountlow", () => {
      console.log("🟢 Buffered amount low — resuming sendNextChunkStreaming");
      sendNextChunkStreaming(document.getElementById("fileInput").files[0]);
    });


    dataChannel.onopen = () => console.log("Data channel opened");
    dataChannel.onclose = () => console.log("Data channel closed");
    dataChannel.onerror = (e) => console.error("DataChannel error:", e);
  } else {
    // ✅ RECEIVER: wait for incoming data channel
    peerConnection.ondatachannel = (event) => {
      console.log("📡 ondatachannel triggered — setting up receiver");

      dataChannel = event.channel;

      dataChannel.onmessage = handleFileData;

      dataChannel.onopen = () => {
        console.log("✅ Data channel opened (receiver)");
        document.getElementById("status").innerText = "Data channel opened (receiver)";
      };

      dataChannel.onerror = (e) => {
        console.error("❌ DataChannel error (receiver):", e);
      };

      dataChannel.onclose = () => {
        console.log("🔒 Data channel closed (receiver)");
        document.getElementById("status").innerText = "Data channel closed (receiver)";
      };
    };
  }
}


socket.on("room-joined", async () => {
  document.getElementById("status").innerText = "Status: Receiver joined";
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", offer);
});

socket.on("offer", async (offer) => {
  await setupConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", answer);
  document.getElementById("status").innerText = "Status: Answer sent";
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async (candidate) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error("Error adding received ice candidate", e);
  }
});

socket.on("peer-disconnected", () => {
  document.getElementById("status").innerText = "Peer disconnected";
});

socket.on("room-error", (message) => {
  const errorMsg = document.getElementById("errorMsg");
  const roomInput = document.getElementById("roomReceive");

  errorMsg.textContent = `⚠️ ${message}`;
  errorMsg.style.display = "block";
  roomInput.classList.add("input-error");
});



function sendFile() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  const errorBox = document.getElementById("sendErrorMsg"); // ✅ Add this line



   // ❌ Show friendly styled error if no file or data channel not ready
  if (!file || !dataChannel || dataChannel.readyState !== "open") {
    errorBox.textContent = "⚠️ Data channel not ready or file missing.";
    errorBox.style.display = "block";
    return;
  }

   // ✅ Hide error if everything is good
  errorBox.style.display = "none";

  chunkSize = 64 * 1024;
  offset = 0;
  startTime = Date.now();
  lastTimeEstimateUpdate = 0;

  arrayBuffer = null;

  totalSize = file.size;
  senderProgress = document.createElement("p");
  senderProgress.id = "senderProgress";
  document.getElementById("status").after(senderProgress);

  // Send META first
  dataChannel.send("META:" + file.size + ":" + file.name);

  offset = 0;
  arrayBuffer = null;
  sending = true;
  document.getElementById("pauseBtn").style.display = "inline-block";
  sendNextChunkStreaming(file);


}


function sendNextChunkStreaming(file) {
  if (!dataChannel || dataChannel.readyState !== "open" || isPaused) {
    sending = false;
    return;
  }

  if (offset >= totalSize) {
    console.log("File sent completely");
    sending = false;
    document.getElementById("pauseBtn").style.display = "none";
    return;
  }

  // Initialize the worker if not already done
  if (!window.fileWorker) {
    window.fileWorker = new Worker("fileWorker.js");
  }

  // Handle the worker's response
  fileWorker.onmessage = function (e) {
    const { buffer, error } = e.data;
    if (error) {
      console.error("Worker error:", error);
      sending = false;
      return;
    }

    try {
      dataChannel.send(buffer);
    } catch (err) {
      console.error("DataChannel send failed:", err);
      sending = false;
      return;
    }

    offset += buffer.byteLength;

    const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
    const speed = offset / elapsedTime; // bytes/sec
    const remainingBytes = file.size - offset;
    const estimatedTime = remainingBytes / speed;

    if (Date.now() - lastTimeEstimateUpdate > 1000) { // update every second
      function formatTime(seconds) {
      if (seconds < 60) return `${Math.ceil(seconds)} sec`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${Math.ceil(seconds % 60)} sec`;
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hrs} hr ${mins} min`;
    }

    document.getElementById("timeEstimate").innerText =
      `⏳ Estimated time left: ${formatTime(estimatedTime)}`;

      lastTimeEstimateUpdate = Date.now();
    }


    const mbSent = (offset / (1024 * 1024)).toFixed(2);
    const mbTotal = (totalSize / (1024 * 1024)).toFixed(2);
    const mbRemaining = (mbTotal - mbSent).toFixed(2);
    senderProgress.innerText = `Sender: Sent ${mbSent} MB / ${mbTotal} MB (${mbRemaining} MB remaining)`;

    setTimeout(() => sendNextChunkStreaming(file), 0);
  };

  // Request next chunk
  fileWorker.postMessage({
    file,
    offset,
    chunkSize
  });
}


function sendNextChunk() {
  if (!arrayBuffer) {
    console.warn("⛔ arrayBuffer is not ready yet. Waiting...");
    return;
  }

  if (offset >= arrayBuffer.byteLength) {
    console.log("✅ File sent completely");
    return;
  }

  if (dataChannel.bufferedAmount > 16 * 1024 * 1024) {
    console.warn("⏸️ Paused: Buffer full at", dataChannel.bufferedAmount);
    return; // Wait for bufferedamountlow event to resume
  }

  const chunk = arrayBuffer.slice(offset, offset + chunkSize);
  try {
    dataChannel.send(chunk);
    offset += chunk.byteLength;

    const mbSent = (offset / (1024 * 1024)).toFixed(2);
    const mbTotal = (totalSize / (1024 * 1024)).toFixed(2);
    const mbRemaining = (mbTotal - mbSent).toFixed(2);
    senderProgress.innerText =
      `Sender: Sent ${mbSent} MB / ${mbTotal} MB (${mbRemaining} MB remaining)`;

    // Automatically queue the next chunk ONLY IF buffer is not too full
    if (dataChannel.bufferedAmount < 8 * 1024 * 1024) {
      setTimeout(sendNextChunk, 0);
    }

  } catch (err) {
    console.error("❌ send failed:", err);
  }
}


let receivedBuffers = [];
let totalBytes = 0;
let expectedSize = 0;
let receivedFilename = "received_file";

// Add this BEFORE handleFileData()
function updateReceiverProgress(current, total) {
  const progressBar = document.getElementById("progressBar");
  const progressEl = document.getElementById("receiverProgress");

  const mbReceived = (current / 1024 / 1024).toFixed(2);
  const mbTotal = (total / 1024 / 1024).toFixed(2);
  const mbRemaining = (mbTotal - mbReceived).toFixed(2);

  progressEl.innerText = `Receiver: Received ${mbReceived} MB / ${mbTotal} MB (${mbRemaining} MB remaining)`;
  progressBar.value = current;
}


function handleFileData(event) {
  if (typeof event.data === "string" && event.data.startsWith("META:")) {
    const parts = event.data.split(":");
    expectedSize = parseInt(parts[1]);
    receivedFilename = parts[2] || "received_file";
    console.log("📦 Expected size:", expectedSize, "| Filename:", receivedFilename);

    // Show progress bar
    const progressBar = document.getElementById("progressBar");
    progressBar.style.display = "block";
    progressBar.value = 0;
    progressBar.max = expectedSize;

    let progressEl = document.getElementById("receiverProgress");
    if (!progressEl) {
     progressEl = document.createElement("p");
      progressEl.id = "receiverProgress";
      document.getElementById("status").after(progressEl);
    }

    return;
  }

  // Handle binary chunk
  receivedBuffers.push(event.data);
  totalBytes += event.data.byteLength;
  const mbReceived = (totalBytes / (1024 * 1024)).toFixed(2);
  const mbTotal = (expectedSize / (1024 * 1024)).toFixed(2);
  const mbRemaining = (mbTotal - mbReceived).toFixed(2);
  updateReceiverProgress(totalBytes, expectedSize);

  // === Estimated Time Remaining (Receiver) ===
const now = Date.now();
if (!window.startTimeReceiver) {
  window.startTimeReceiver = now;
  window.startReceivedSize = totalBytes;
}

const timeElapsed = (now - window.startTimeReceiver) / 1000; // seconds
const dataReceived = totalBytes - window.startReceivedSize;
const speed = dataReceived / timeElapsed; // bytes/sec

const remainingBytes = expectedSize - totalBytes;
const estimatedTimeLeft = remainingBytes / speed;

function formatTime(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)} sec`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${Math.ceil(seconds % 60)} sec`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs} hr ${mins} min`;
}

document.getElementById("receiverTimeEstimate").innerText =
  `⏳ Time left: ${formatTime(estimatedTimeLeft)}`;




  const progressBar = document.getElementById("progressBar");
  progressBar.value = totalBytes;

  if (totalBytes >= expectedSize && expectedSize > 0) {

    const receivedBlob = new Blob(receivedBuffers);
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(receivedBlob);
    downloadLink.download = receivedFilename;
    downloadLink.click();

    console.log("✅ File downloaded:", receivedFilename);
    document.getElementById("receiverProgress").remove();


    // Reset
    receivedBuffers = [];
    totalBytes = 0;
    expectedSize = 0;
    receivedFilename = "received_file";
    window.startTimeReceiver = null;
    window.startReceivedSize = 0;
    document.getElementById("receiverTimeEstimate").innerText = "";
    progressBar.style.display = "none";
  }
}
const roomInput = document.getElementById("roomReceive");
const errorMsg = document.getElementById("errorMsg");

function validateRoomCode() {
  const roomCode = roomInput.value.trim();

  if (!/^\d{6}$/.test(roomCode)) {
    errorMsg.textContent = "⚠️ Enter a valid 6-digit room code.";
    errorMsg.style.display = "block";
    roomInput.classList.add("input-error");
    return false;
  }

  errorMsg.style.display = "none";
  roomInput.classList.remove("input-error");
  return true;
}

document.getElementById("roomReceive").addEventListener("input", () => {
  document.getElementById("errorMsg").style.display = "none";
  document.getElementById("roomReceive").classList.remove("input-error");
});

document.getElementById("fileInput").addEventListener("change", () => {
  document.getElementById("sendErrorMsg").style.display = "none";
});



// ✅ Pause and Resume handlers
document.getElementById("pauseBtn").addEventListener("click", () => {
  isPaused = true;
  document.getElementById("pauseBtn").style.display = "none";
  document.getElementById("resumeBtn").style.display = "inline-block";
  console.log("⏸️ Paused");
});

document.getElementById("resumeBtn").addEventListener("click", () => {
  if (!sending && isPaused) {
    isPaused = false;
    sending = true;
    sendNextChunkStreaming(document.getElementById("fileInput").files[0]);
    document.getElementById("resumeBtn").style.display = "none";
    document.getElementById("pauseBtn").style.display = "inline-block";
    console.log("▶️ Resumed");
  }
});
