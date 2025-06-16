



























const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());



const FRONTEND_URL = "https://typing-frontend-kappa.vercel.app/"; // or render.app if hosted there

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true, // if you're using cookies or auth headers
}));






// mongoose.connect('mongodb://127.0.0.1:27017/TypingTest', {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
// });
// mongoose.connection.on('connected', () => console.log('MongoDB connected'));
// mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));


mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Atlas connected'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

const JWT_SECRET ="your_secret_key"; // Use environment variable in production






const resultSchema = new mongoose.Schema({
  speed: Number,
  accuracy: Number,
  errors: Number,
  category: String,
  subCategory: String,
  time: Number,
  date: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  roomCode: { type: String, unique: true },
  testResults: [resultSchema] // Store all typing test results here
});

const User = mongoose.model("User", userSchema);

function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// --- Your existing routes here (signup, login, authenticate, save-result, logout) ---

app.post('/signup', async (req, res) => {
  try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
          return res.status(400).json({ message: "All fields are required", success: false });
      }

      const existingUser = await User.findOne({ username });
      if (existingUser) {
          return res.status(400).json({ message: "Username already taken", success: false });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Generate a unique room code
      let roomCode;
      let codeExists = true;
      while (codeExists) {
          roomCode = generateRoomCode();
          const existingCode = await User.findOne({ roomCode });
          if (!existingCode) codeExists = false;
      }

      const newUser = new User({
          username,
          email,
          password: hashedPassword,
          roomCode,
      });

      await newUser.save();

      return res.status(201).json({ 
          message: "Signup successful", 
          success: true, 
          user: {
              username: newUser.username,
              email: newUser.email,
              roomCode: newUser.roomCode
          }
      });

  } catch (err) {
      console.error("Signup Error:", err);
      return res.status(500).json({ message: "Signup failed", success: false });
  }
});

app.post('/login', async (req, res) => {
  try {
      const { username, password } = req.body;
      const user = await User.findOne({ username });

      if (!user) {
          return res.status(403).json({ message: "Invalid credentials", success: false });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
          return res.status(403).json({ message: "Invalid credentials", success: false });
      }

      // Generate JWT token
      const jwttoken = jwt.sign(
          { username: user.username, _id: user._id }, 
          JWT_SECRET, 
          { expiresIn: '7d' }
      );

      // Send back userId in the response
      res.status(200).json({
          message: "Login successful",
          success: true,
          jwttoken,
          username: user.username,
          userId: user._id,
          profilePicture: user.profilePicture // If you have this field
      });
  } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Failed login", success: false });
  }
});

const authenticate = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid token." });
  }
};

app.post("/api/save-result", authenticate, async (req, res) => {
  try {
    const { speed, accuracy, errors, category, subCategory, time } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ error: "User not found." });

    user.testResults.push({
      speed,
      accuracy,
      errors,
      category,
      subCategory,
      time,
    });

    await user.save();

    res.status(200).json({ message: "Result saved successfully" });
  } catch (error) {
    console.error("Error saving result:", error);
    res.status(500).json({ error: "Failed to save result" });
  }
});

app.post('/logout', (req, res) => {
  res.clearCookie('token');  // For cookie-based JWT; adapt if using localStorage token
  return res.status(200).json({ message: "Logout successful", success: true });
});

// -------------- SOCKET.IO MULTIPLAYER SETUP -------------------

// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: "*", // Set your frontend origin here
//     methods: ["GET", "POST"]
//   }
// });

// const rooms = {}; // roomCode -> { users: [{ socketId, username, result }], started, paragraph }
// // roomCode -> { users: [{ socketId, username, result }], started, paragraph }
// const completedGames = []; // Add this line to store finished games

// io.on("connection", (socket) => {
//   console.log("User connected:", socket.id);

//   // Host creates room
//   socket.on("create-room", ({ username }, callback) => {
//     const roomCode = generateRoomCode();
//     rooms[roomCode] = {
//       users: [{ socketId: socket.id, username }],
//       started: false,
//       paragraph: ""
//     };
//     socket.join(roomCode);
//     callback({ roomCode });
//   });

//   // User joins room
//   socket.on("join-room", ({ username, roomCode }, callback) => {
//     const room = rooms[roomCode];
//     if (!room) return callback({ error: "Room not found" });
//     if (room.users.length >= 2) return callback({ error: "Room is full" });

//     room.users.push({ socketId: socket.id, username });
//     socket.join(roomCode);

//     io.to(roomCode).emit("room-update", room.users.map(u => u.username));
//     callback({ success: true });
//   });

//   // Host starts test with paragraph
//   // socket.on("start-test", ({ roomCode, paragraph }) => {
//   //   const room = rooms[roomCode];
//   //   if (room && room.users.length === 2) {
//   //     room.started = true;
//   //     room.paragraph = paragraph;
//   //     io.to(roomCode).emit("start-test", paragraph);
//   //   }
//   // });

// //   socket.on("start-test", ({ roomCode, paragraph }) => {
// //   const room = rooms[roomCode];
// //   if (room && room.users.length === 2) {
// //     room.started = true;
// //     room.paragraph = paragraph;

// //     // Set the start time to a few seconds in the future to allow syncing
// //     const startTime = Date.now() + 3000; // 3 seconds delay for sync

// //     io.to(roomCode).emit("start-test", {
// //       paragraph,
// //       startTime
// //     });
// //   }
// // });
// // socket.on("start-test", ({ roomCode, paragraph, duration }) => {
// //   const room = rooms[roomCode];
// //   if (room && room.users.length === 2) {
// //     room.started = true;
// //     room.paragraph = paragraph;

// //     // Set the start time to 3 seconds in the future to allow syncing
// //     const startTime = Date.now() + 3000; // 3 seconds delay for sync

// //     io.to(roomCode).emit("start-test", {
// //       paragraph,
// //       startTime,
// //       duration,  // Pass duration here so frontend can sync timer correctly
// //     });
// //   }
// // });

// socket.on("start-test", ({ roomCode, paragraph, duration }) => {
//     const room = rooms[roomCode];
//     if (room && room.users.length === 2) {
//       room.started = true;
//       room.paragraph = paragraph;

//       const startTime = Date.now() + 3000;

//       io.to(roomCode).emit("start-test", {
//         paragraph,
//         startTime,
//         duration
//       });

//       room.timeoutId = setTimeout(() => {
//         // Simulate basic random results for both users
//         room.users.forEach(u => {
//           u.result = {
//             username: u.username,
//             wpm: Math.floor(Math.random() * 40) + 20, // Example WPM
//             accuracy: Math.floor(Math.random() * 30) + 70, // Example %
//             completed: true
//           };
//         });

//         const results = room.users.map(u => u.result);
//         io.to(roomCode).emit("results", results);

//         // Save to history
//         completedGames.push({
//           roomCode,
//           paragraph,
//           users: results,
//           finishedAt: new Date().toISOString()
//         });

//         delete rooms[roomCode];
//       }, duration * 1000 + 3000);
//     }
//   });
//   // User submits typing result
//   socket.on("submit-result", ({ roomCode, username, result }) => {
//     const room = rooms[roomCode];
//     if (!room) return;

//     const user = room.users.find(u => u.socketId === socket.id);
//     if (user) {
//       user.result = { username, ...result };
//     }

//     const allSubmitted = room.users.every(u => u.result);
//     if (allSubmitted) {
//       io.to(roomCode).emit("results", room.users.map(u => u.result));
//       delete rooms[roomCode]; // Clean up after game ends
//     }
//   });


//   // Handle disconnects
//   socket.on("disconnect", () => {
//     for (const roomCode in rooms) {
//       const room = rooms[roomCode];
//       room.users = room.users.filter(u => u.socketId !== socket.id);
//       io.to(roomCode).emit("room-update", room.users.map(u => u.username));
//       if (room.users.length === 0) delete rooms[roomCode];
//     }
//     console.log("User disconnected:", socket.id);
//   });
// });

// // Use server.listen instead of app.listen
// const PORT = 4000;
// server.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });



const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Set your frontend origin here
    methods: ["GET", "POST"]
  }
});

const rooms = {}; // roomCode -> { users: [{ socketId, username, result }], started, paragraph }
// roomCode -> { users: [{ socketId, username, result }], started, paragraph }
const completedGames = []; // Add this line to store finished games

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Host creates room
  socket.on("create-room", ({ username }, callback) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      users: [{ socketId: socket.id, username }],
      started: false,
      paragraph: ""
    };
    socket.join(roomCode);
    callback({ roomCode });
  });

  // User joins room
  socket.on("join-room", ({ username, roomCode }, callback) => {
    const room = rooms[roomCode];
    if (!room) return callback({ error: "Room not found" });
    if (room.users.length >= 2) return callback({ error: "Room is full" });

    room.users.push({ socketId: socket.id, username });
    socket.join(roomCode);

    io.to(roomCode).emit("room-update", room.users.map(u => u.username));
    callback({ success: true });
  });

  

  socket.on("start-test", ({ roomCode, paragraph, duration }) => {
  const room = rooms[roomCode];
  if (room && room.users.length === 2) {
    room.started = true;
    room.paragraph = paragraph;
    room.duration = duration;
    room.startTime = Date.now();

    const startTime = Date.now() + 3000;

    io.to(roomCode).emit("start-test", {
      paragraph,
      startTime,
      duration
    });

    // IMPORTANT: Don't delete room immediately after duration
    // Instead, wait for all results or a longer timeout
    room.timeoutId = setTimeout(() => {
      const room = rooms[roomCode];
      if (!room) return;
      
      console.log(`⏰ Timer expired for room ${roomCode}`);
      
      // Check if we have any results
      const submittedResults = room.users.filter(u => u.result).map(u => u.result);
      
      if (submittedResults.length > 0) {
        console.log(`📊 Emitting ${submittedResults.length} results for room ${roomCode}`);
        io.to(roomCode).emit("results", submittedResults);
        
        completedGames.push({
          roomCode,
          paragraph,
          users: submittedResults,
          finishedAt: new Date().toISOString()
        });
      }

      // Extended cleanup - give users 15 seconds after test ends to submit
      setTimeout(() => {
        if (rooms[roomCode]) {
          console.log(`🧹 Final cleanup of room ${roomCode}`);
          delete rooms[roomCode];
        }
      }, 15000); // 15 second grace period
      
    }, duration * 1000 + 3000);
  }
});

 
  socket.on("submit-result", (data) => {
  console.log("\n=== SUBMIT RESULT ===");
  console.log("📥 Received from:", socket.id);
  console.log("📥 Raw data:", JSON.stringify(data, null, 2));
  
  const { roomCode, username, result } = data || {};
  
  console.log("📥 Room code:", `"${roomCode}"`);
  console.log("📥 Username:", username);
  
  if (!roomCode || roomCode.trim() === '') {
    console.log("❌ ERROR: Empty or null room code");
    console.log("🔍 Available data keys:", Object.keys(data || {}));
    socket.emit("submit-error", { message: "Invalid room code" });
    return;
  }
  
  const room = rooms[roomCode];
  if (!room) {
    console.log("❌ ERROR: Room not found:", roomCode);
    console.log("📋 Available rooms:", Object.keys(rooms));
    
    // Don't just return - let the user know
    socket.emit("submit-error", { 
      message: "Room expired or not found", 
      roomCode 
    });
    return;
  }

  console.log("📋 Room found with", room.users.length, "users");

  const user = room.users.find(u => u.socketId === socket.id);
  if (!user) {
    console.log("❌ ERROR: User not found in room");
    socket.emit("submit-error", { message: "User not found in room" });
    return;
  }

  // Store the result
  user.result = { username, ...result };
  console.log("✅ Result stored for:", username);

  // Check if all users have submitted
  const allSubmitted = room.users.every(u => u.result);
  console.log("🔍 All submitted?", allSubmitted);

  if (allSubmitted) {
    console.log("🎉 All results received!");
    
    // Clear the main timeout since we have all results
    if (room.timeoutId) {
      clearTimeout(room.timeoutId);
    }
    
    const results = room.users.map(u => u.result);
    io.to(roomCode).emit("results", results);
    
    completedGames.push({
      roomCode,
      paragraph: room.paragraph,
      users: results,
      finishedAt: new Date().toISOString()
    });
    
    // Small delay before cleanup to ensure results are received
    setTimeout(() => {
      if (rooms[roomCode]) {
        console.log("🧹 Cleaning up room after all results:", roomCode);
        delete rooms[roomCode];
      }
    }, 2000);
  } else {
    console.log("⏳ Waiting for more results...");
  }
  
  console.log("=== SUBMIT RESULT END ===\n");
});

  // Handle disconnects
  socket.on("disconnect", () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      room.users = room.users.filter(u => u.socketId !== socket.id);
      io.to(roomCode).emit("room-update", room.users.map(u => u.username));
      if (room.users.length === 0) {
        // Clear timeout if room becomes empty
        if (room.timeoutId) {
          clearTimeout(room.timeoutId);
        }
        delete rooms[roomCode];
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

// Use server.listen instead of app.listen

server.listen(PORT, () => {
  console.log("Server running");
});


