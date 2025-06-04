const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (replace with a proper database in production)
const conversations = {};
const messages = {};

// Configure multer for file uploads (using memory storage for Vercel)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// OCR Function
async function extractTextFromImage(buffer) {
  // Save buffer to temp file (required by Tesseract)
  const tempFilePath = path.join('/tmp', `ocr-${Date.now()}.png`);
  fs.writeFileSync(tempFilePath, buffer);
  
  try {
    const { data: { text } } = await Tesseract.recognize(tempFilePath, "eng");
    fs.unlinkSync(tempFilePath); // delete temp file

    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const profile = {
      name: lines[0] || "",
      bio: lines.slice(1, 4).join(" ") || "",
      followers: lines.find(l => l.toLowerCase().includes("followers")) || "",
      following: lines.find(l => l.toLowerCase().includes("following")) || "",
      guess_location: lines.find(l => l.toLowerCase().includes("india") || l.toLowerCase().includes("city")) || "",
    };

    return profile;
  } catch (error) {
    fs.unlinkSync(tempFilePath); // ensure temp file is deleted
    throw error;
  }
}

// Routes
app.post('/api/conversations', async (req, res) => {
  try {
    const conversation = {
      id: Date.now().toString(),
      startedAt: new Date(),
      status: 'in_progress',
      ...req.body
    };
    conversations[conversation.id] = conversation;
    res.status(201).send(conversation);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.put('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = conversations[req.params.id];
    if (!conversation) {
      return res.status(404).send('Conversation not found');
    }
    
    Object.assign(conversation, req.body);
    res.send(conversation);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const message = {
      id: Date.now().toString(),
      timestamp: new Date(),
      ...req.body
    };
    
    if (!messages[message.conversationId]) {
      messages[message.conversationId] = [];
    }
    
    messages[message.conversationId].push(message);
    res.status(201).send(message);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

// OCR Upload Route
app.post('/api/upload', upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const extractedData = await extractTextFromImage(req.file.buffer);

    res.json({
      success: true,
      data: extractedData
    });
  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Matchmaking API is running');
});

// Export the Express app as a serverless function
module.exports = app;
