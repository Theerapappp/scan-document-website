// Vercel Serverless Function - Gemini API Proxy
// API key จะถูกเก็บใน Vercel Environment Variables (ไม่ถูก expose ให้ client)

export default async function handler(req, res) {
    // อนุญาตเฉพาะ POST method
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set in environment variables.');
        return res.status(500).json({ error: 'Server configuration error: API key not found.' });
    }

    try {
        const { base64Image, mimeType } = req.body;

        if (!base64Image) {
            return res.status(400).json({ error: 'Missing base64Image in request body.' });
        }

        const prompt = `
      You are an expert OCR and document analysis AI.
      Analyze the provided document image carefully.
      
      Tasks:
      1. Perform Optical Character Recognition (OCR) to extract all visible text. Fully support and accurately transcribe the text exactly as it appears, whether it is in Thai (ภาษาไทย), English, or any other language present.
      2. Identify the logical sections or sections within the document based on its internal structure, visual formatting, and actual headings present in the image.
      3. Categorize the extracted text under these sections. CRITICAL INSTRUCTION: The "heading" for each section MUST be the exact text used as a header/title in the document itself, in the exact original language (e.g. if the document uses a Thai header "รายละเอียดสินค้า", use exactly that instead of "Item Details" or a generic category). If no explicit header exists for a section, deduce a highly accurate and concise descriptive title in the primary language of that section.
      4. Organize the text clearly under these headings.
      
      Output your response STRICTLY as a JSON object with this exact schema:
      {
        "document_type": "A brief string describing what kind of document this is in the primary language of the document (e.g., ใบเสร็จรับเงิน, Invoice, Letter)",
        "sections": [
          {
            "heading": "The exact heading text from the document (in its original language)",
            "content": "The extracted text belonging to this category. Preserve newlines where appropriate."
          }
        ]
      }
      Do not include any markdown formatting wrappers (like \`\`\`json) around the output. Just return the raw JSON string.
    `;

        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Image } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) {
            const errData = await response.json();
            return res.status(response.status).json({
                error: errData.error?.message || `Gemini API Error: ${response.status}`
            });
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
            return res.status(500).json({ error: "Empty response from AI model." });
        }

        try {
            const cleanJson = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
            const parsed = JSON.parse(cleanJson);
            return res.status(200).json(parsed);
        } catch (jsonError) {
            console.error("JSON Parsing failed. Raw response:", textResponse);
            return res.status(500).json({ error: "Failed to parse the structured data from the AI." });
        }

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error.' });
    }
}
