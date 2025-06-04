const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(cors({
  origin: '*' // or specify your frontend URL
}));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// OCR Function
async function extractTextFromImage(buffer) {
  const tempFilePath = path.join('/tmp', `ocr-${Date.now()}.png`);
  fs.writeFileSync(tempFilePath, buffer);
  
  try {
    const { data: { text } } = await Tesseract.recognize(tempFilePath, "eng");
    fs.unlinkSync(tempFilePath);

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
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    throw error;
  }
}

// OCR Upload Route - Added both /upload and /api/upload for compatibility
app.post(['/upload', '/api/upload'], upload.single('screenshot'), async (req, res) => {
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
    res.status(500).json({ 
      error: 'Failed to process image',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('OCR API is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
