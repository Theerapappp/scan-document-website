import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud, Crop, CheckCircle, Loader2, FileText,
  AlertCircle, Download, Copy, RefreshCw, PlusCircle, Trash2
} from 'lucide-react';

const apiKey = "AIzaSyC2pm3fXg1DeWYmHy_0Xs2sDdzRS4tvBZY"; // ใส่ API Key ของตัวเอง

export default function App() {
  // สถานะของแอปพลิเคชัน
  const [imageSrc, setImageSrc] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [docType, setDocType] = useState('');

  //สถานะการครอบตัดรูปภาพ
  const [cropBox, setCropBox] = useState(null); // {เริ่มX,เริ่มY,สิ้นสุดX,สิ้นสุดY} ในรูปแบบเปอร์เซ็นต์
  const [isDrawing, setIsDrawing] = useState(false);
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  //การจัดการรูปภาพและการครอบตัด

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target.result);
        setCropBox(null);
        setResults(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const getCoordinates = (e) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // คำนวณตำแหน่งของเมาส์เทียบกับรูปภาพ
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    setIsDrawing(true);
    setCropBox({ startX: x, startY: y, endX: x, endY: y });
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    setCropBox(prev => ({ ...prev, endX: x, endY: y }));
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    // ถ้าขนาดของกรอบครอบตัดเล็กเกินไป ให้ลบกรอบครอบตัด
    if (cropBox) {
      const width = Math.abs(cropBox.endX - cropBox.startX);
      const height = Math.abs(cropBox.endY - cropBox.startY);
      if (width < 2 || height < 2) {
        setCropBox(null);
      }
    }
  };

  const getCroppedImageBase64 = () => {
    const img = imageRef.current;
    if (!img) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    if (!cropBox) {
      // คืนค่ารูปภาพเต็มถ้าไม่มีกรอบครอบตัด
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    }

    const xPercent = Math.min(cropBox.startX, cropBox.endX) / 100;
    const yPercent = Math.min(cropBox.startY, cropBox.endY) / 100;
    const wPercent = Math.abs(cropBox.endX - cropBox.startX) / 100;
    const hPercent = Math.abs(cropBox.endY - cropBox.startY) / 100;

    const pixelX = xPercent * naturalWidth;
    const pixelY = yPercent * naturalHeight;
    const pixelW = wPercent * naturalWidth;
    const pixelH = hPercent * naturalHeight;

    canvas.width = pixelW;
    canvas.height = pixelH;
    ctx.drawImage(img, pixelX, pixelY, pixelW, pixelH, 0, 0, pixelW, pixelH);

    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  };

  // การเรียกใช้งาน API

  const processDocument = async () => {
    try {
      setError(null);
      setIsProcessing(true);
      setProgressText('Extracting and analyzing image...');

      const base64Data = getCroppedImageBase64();
      if (!base64Data) throw new Error("Could not process image data.");

      const result = await callGeminiAPI(base64Data);

      setDocType(result.document_type || 'Unclassified Document');
      // เพิ่ม ID เฉพาะให้กับแต่ละส่วนสำหรับ React keys และการแก้ไข
      const sectionsWithIds = (result.sections || []).map(sec => ({
        ...sec,
        id: crypto.randomUUID()
      }));
      setResults(sectionsWithIds);

      setTimeout(() => {
        if (window.innerWidth < 1024) {
          document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);

    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred while processing the document.');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const callGeminiAPI = async (base64Image) => {
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
          { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    let retries = 5;
    let delay = 1000;

    while (retries > 0) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error?.message || `HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) throw new Error("Empty response from AI model.");

        try {
          // ตัดส่วน markdown ออก
          const cleanJson = textResponse.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
          return JSON.parse(cleanJson);
        } catch (jsonError) {
          console.error("JSON Parsing failed. Raw response:", textResponse);
          throw new Error("Failed to parse the structured data from the AI.");
        }

      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  // การแก้ไขผลลัพธ์

  const handleSectionChange = (id, field, value) => {
    setResults(prev => prev.map(sec =>
      sec.id === id ? { ...sec, [field]: value } : sec
    ));
  };

  const removeSection = (id) => {
    setResults(prev => prev.filter(sec => sec.id !== id));
  };

  const addSection = () => {
    setResults(prev => [...prev, { id: crypto.randomUUID(), heading: 'New Category', content: '' }]);
  };

  const copyToClipboard = () => {
    const textToCopy = `Document Type: ${docType}\n\n` + results.map(s => `[${s.heading}]\n${s.content}`).join('\n\n');
    document.execCommand('copy');

    // แสดงข้อความว่าคัดลอกแล้ว
    const btn = document.getElementById('copy-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="flex items-center gap-2"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!</span>';
    setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-gray-200">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-black p-2 rounded-lg text-white">
              <Crop size={20} />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-black truncate">
              Document image to text
            </h1>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 xl:gap-12">

          {/* คอลัมน์ซ้าย: อัปโหลดและครอบตัดรูปภาพ */}
          <div className="space-y-4 md:space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <UploadCloud size={18} className="text-black" />
                  1. Upload & Crop
                </h2>
                {imageSrc && (
                  <button
                    onClick={() => setImageSrc(null)}
                    className="text-sm text-gray-500 hover:text-black transition-colors"
                  >
                    Clear Image
                  </button>
                )}
              </div>

              <div className="p-4">
                {!imageSrc ? (
                  <label className="flex flex-col items-center justify-center w-full h-64 md:h-80 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-gray-500 group-hover:text-black transition-colors px-4 text-center">
                      <UploadCloud size={48} className="mb-4 opacity-70" />
                      <p className="mb-2 text-sm md:text-base font-semibold">Click to upload document image</p>
                      <p className="text-xs opacity-75">PNG, JPG, JPEG</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </label>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 flex items-center gap-2 bg-gray-50 text-gray-800 p-3 rounded-lg border border-gray-200">
                      <Crop size={16} />
                      Draw a box to crop the document area, or leave uncropped to process the whole image.
                    </p>

                    {/* พื้นที่แสดงภาพ */}
                    <div
                      className="relative w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200 select-none touch-none flex justify-center items-center cursor-crosshair min-h-[250px] md:min-h-[300px]"
                      ref={containerRef}
                      onMouseDown={handlePointerDown}
                      onMouseMove={handlePointerMove}
                      onMouseUp={handlePointerUp}
                      onMouseLeave={handlePointerUp}
                      onTouchStart={handlePointerDown}
                      onTouchMove={handlePointerMove}
                      onTouchEnd={handlePointerUp}
                    >
                      <img
                        ref={imageRef}
                        src={imageSrc}
                        alt="Document to process"
                        className="max-w-full max-h-[60vh] object-contain pointer-events-none"
                        draggable="false"
                      />

                      {cropBox && (
                        <div
                          className="absolute border-2 border-black bg-black/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] pointer-events-none transition-none"
                          style={{
                            left: `${Math.min(cropBox.startX, cropBox.endX)}%`,
                            top: `${Math.min(cropBox.startY, cropBox.endY)}%`,
                            width: `${Math.abs(cropBox.endX - cropBox.startX)}%`,
                            height: `${Math.abs(cropBox.endY - cropBox.startY)}%`,
                          }}
                        >
                          <div className="absolute top-0 left-0 w-2 h-2 bg-black -ml-1 -mt-1 rounded-full"></div>
                          <div className="absolute top-0 right-0 w-2 h-2 bg-black -mr-1 -mt-1 rounded-full"></div>
                          <div className="absolute bottom-0 left-0 w-2 h-2 bg-black -ml-1 -mb-1 rounded-full"></div>
                          <div className="absolute bottom-0 right-0 w-2 h-2 bg-black -mr-1 -mb-1 rounded-full"></div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={processDocument}
                      disabled={isProcessing}
                      className={`w-full py-3 px-4 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all ${isProcessing
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-black hover:bg-gray-800 shadow-md hover:shadow-lg active:scale-[0.98]'
                        }`}
                    >
                      {isProcessing ? (
                        <><Loader2 size={18} className="animate-spin" /> {progressText}</>
                      ) : (
                        <><CheckCircle size={18} /> Extract & Categorize Text</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="p-4 bg-gray-50 border border-gray-300 text-gray-700 rounded-xl flex items-start gap-3">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* คอลัมน์ขวา: ผลลัพธ์ที่แก้ไขได้ */}
          <div className="space-y-4 md:space-y-6" id="results-section">
            <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-opacity duration-500 ${results ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <FileText size={18} className="text-black" />
                  2. Review & Edit Results
                </h2>
                {results && (
                  <button
                    id="copy-btn"
                    onClick={copyToClipboard}
                    className="text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors shadow-sm"
                  >
                    <Copy size={14} /> Copy All
                  </button>
                )}
              </div>

              <div className="p-6">
                {!results ? (
                  <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-3">
                    <RefreshCw size={32} className="opacity-20" />
                    <p className="text-sm">Processed text will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Document Type</label>
                      <input
                        type="text"
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className="w-full text-lg font-semibold text-gray-800 border-b border-transparent hover:border-gray-200 focus:border-black focus:outline-none bg-transparent transition-colors py-1 px-0"
                      />
                    </div>

                    <div className="space-y-4">
                      {results.map((section, index) => (
                        <div key={section.id} className="group bg-gray-50 rounded-xl p-4 border border-gray-100 focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-gray-200 transition-all">
                          <div className="flex justify-between items-start mb-2">
                            <input
                              type="text"
                              value={section.heading}
                              onChange={(e) => handleSectionChange(section.id, 'heading', e.target.value)}
                              className="font-semibold text-black bg-transparent border-none focus:outline-none w-full"
                              placeholder="Category Heading"
                            />
                            <button
                              onClick={() => removeSection(section.id)}
                              className="text-gray-300 hover:text-black opacity-0 group-hover:opacity-100 transition-opacity p-1"
                              title="Remove section"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <textarea
                            value={section.content}
                            onChange={(e) => handleSectionChange(section.id, 'content', e.target.value)}
                            className="w-full min-h-[80px] text-gray-700 bg-white border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-gray-400 resize-y leading-relaxed"
                            placeholder="Extracted content..."
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={addSection}
                      className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:text-black hover:border-gray-400 hover:bg-gray-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <PlusCircle size={16} /> Add Custom Category
                    </button>

                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}