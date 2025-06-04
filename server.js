const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

const app = express();

// Configure allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://shaadistoryfrontend.vercel.app',
  'https://your-frontend-app.vercel.app' // Add your actual frontend domain
];

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// OCR Function with improved error handling
async function extractTextFromImage(buffer) {
  const tempFilePath = path.join('/tmp', `ocr-${Date.now()}.png`);
  
  try {
    fs.writeFileSync(tempFilePath, buffer);
    
    const { data: { text } } = await Tesseract.recognize(
      tempFilePath,
      'eng',
      {
        logger: m => console.log(m),
        timeout: 20000 // 20 seconds timeout for OCR
      }
    );

    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    
    // Improved data extraction
    const profile = {
      name: lines[0] || "",
      bio: lines.slice(1, 4).join(" ") || "",
      followers: lines.find(l => l.toLowerCase().includes("followers")) || "",
      following: lines.find(l => l.toLowerCase().includes("following")) || "",
      guess_location: lines.find(l => 
        l.toLowerCase().includes("india") || 
        l.toLowerCase().includes("city") ||
        l.toLowerCase().includes("location")
      ) || "",
    };

    return profile;
  } catch (error) {
    console.error('OCR Processing Error:', error);
    throw new Error('Failed to process image with OCR');
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

// Upload endpoint with better error handling
app.post(['/upload', '/api/upload'], upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    // Validate file type
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        error: 'Only image files are allowed'
      });
    }

    const extractedData = await extractTextFromImage(req.file.buffer);

    res.json({
      success: true,
      data: extractedData
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to process image',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global Error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message
  });
});

// Server configuration
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle server timeouts
server.setTimeout(30000); // 30 seconds

module.exports = app;
