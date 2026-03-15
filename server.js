const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const Groq = require("groq-sdk");
const PDFParser = require("pdf2json");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ✅ Correctly uses pdf2json to extract text from a PDF file
function extractTextFromPDF(filePath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1); // second arg = raw text mode
    pdfParser.on("pdfParser_dataReady", () => {
      const text = pdfParser.getRawTextContent();
      resolve(text);
    });
    pdfParser.on("pdfParser_dataError", (err) => {
      reject(err.parserError || err);
    });
    pdfParser.loadPDF(filePath);
  });
}

app.use(cors());
app.use(express.json());

app.post("/analyze", upload.single("cv"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const cvText = await extractTextFromPDF(req.file.path);

    // Clean up uploaded file after reading
    fs.unlinkSync(req.file.path);

    if (!cvText || cvText.trim().length < 50) {
      return res.status(400).json({ error: "Could not extract text from PDF. Make sure it's not a scanned image." });
    }

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Analyze this CV and respond with ONLY a raw JSON object (no markdown, no explanation, no code blocks):
{
  "summary": "2-sentence candidate summary",
  "missingSkills": ["skill1", "skill2", "skill3"],
  "courses": [
    { "title": "Course Name", "platform": "Coursera", "price": "$49", "skill": "skill1" },
    { "title": "Course Name", "platform": "Udemy", "price": "$19", "skill": "skill2" }
  ],
  "jobs": [
    { "title": "Job Title", "match": "why they are a good fit" },
    { "title": "Job Title", "match": "why they are a good fit" }
  ]
}

CV Content:
${cvText}`,
        },
      ],
    });

    const text = response.choices[0].message.content;
    // Strip any accidental markdown code fences
    const clean = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(clean);
    res.json(data);

  } catch (err) {
    // Clean up file if something went wrong mid-process
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Analysis failed", details: err.message });
  }
});

app.listen(3001, () => console.log("✅ Backend running on http://localhost:3001"));