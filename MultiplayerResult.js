const mongoose = require('mongoose');

const multiplayerResultSchema = new mongoose.Schema({
  roomCode: String,
  username: String,
  wpm: Number,
  accuracy: Number,
  errors: Number,
  totalTyped: Number,
  correctChars: Number,
  timeTaken: Number, // in seconds
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MultiplayerResult', multiplayerResultSchema);
