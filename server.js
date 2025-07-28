const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Or your frontend URL like: "https://flashdrop-t3v0.onrender.com"
    methods: ["GET", "POST"]
  }
});


// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});



// Socket.IO Logic
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-room", (room) => {
    socket.join(room);
    socket.roomCode = room;
    console.log("Room created:", room);
  });

  socket.on("join-room", (room) => {
    const roomInfo = io.sockets.adapter.rooms.get(room);
    const numClients = roomInfo ? roomInfo.size : 0;

    console.log(`Join attempt for room: ${room}, clients: ${numClients}`);

    if (numClients === 1) {
      socket.join(room);
      socket.roomCode = room;
      console.log("Receiver joined room:", room);
      socket.to(room).emit("room-joined");
    } else if (numClients === 0) {
      socket.emit("room-error", "Room does not exist. Ask sender to generate again.");
    } else {
      socket.emit("room-error", "Room already has a receiver.");
    }
  });

  socket.on("offer", (offer) => {
    socket.to(socket.roomCode).emit("offer", offer);
  });

  socket.on("answer", (answer) => {
    socket.to(socket.roomCode).emit("answer", answer);
  });

  socket.on("ice-candidate", (candidate) => {
    socket.to(socket.roomCode).emit("ice-candidate", candidate);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    if (socket.roomCode) {
      socket.to(socket.roomCode).emit("peer-disconnected");
    }
  });
});

// Helper: Get local network IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let iface in interfaces) {
    for (let alias of interfaces[iface]) {
      if (alias.family === "IPv4" && !alias.internal) {
        return alias.address;
      }
    }
  }
  return "localhost";
}

// Start Server
const PORT = process.env.PORT || 3000;
const localIP = getLocalIP();

server.listen(PORT, () => {
  console.log(`\n✅ Server running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://${localIP}:${PORT} (accessible on local network)\n`);
});
