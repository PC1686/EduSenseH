import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

// Set workerSrc for pdfjs-dist. This uses Vite's import.meta.url to resolve path.
try {
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
} catch {
  // fallback to CDN if URL resolution fails
  GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/legacy/build/pdf.worker.min.mjs';
}

const readArrayBuffer = async (blob) => {
  if (blob.arrayBuffer) return await blob.arrayBuffer();
  return await new Response(blob).arrayBuffer();
};

const fetchAsBlob = async (url, timeoutMs = 30000) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: '*/*' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.blob();
  } finally {
    clearTimeout(t);
  }
};

export const extractTextFromPDFArrayBuffer = async (arrayBuffer) => {
  try {
    const loadingTask = getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const maxPages = pdf.numPages || 0;
    let fullText = '';
    let extractedPages = 0;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => item.str || item.toString()).filter(str => str.trim());
        const pageText = strings.join(' ');
        
        if (pageText.trim()) {
          fullText += pageText + '\n\n';
          extractedPages++;
        }
      } catch (err) {
        console.warn(`Error extracting page ${pageNum}:`, err.message);
        // Continue with other pages instead of failing completely
      }
    }

    if (extractedPages === 0) {
      throw new Error('No text content could be extracted from any page');
    }

    return fullText.trim();
  } catch (err) {
    console.error('PDF extraction failed:', err);
    throw new Error(`PDF extraction failed: ${err.message}`);
  }
};

export const extractTextFromDocxArrayBuffer = async (arrayBuffer) => {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  } catch (err) {
    console.error('DOCX extraction failed', err);
    return '';
  }
};

export const extractTextFromFile = async (fileOrBlob) => {
  // Accept File / Blob / ArrayBuffer / URL string
  let blob = null;
  let fileName = '';
  let fileType = '';

  try {
    // Handle different input types
    if (fileOrBlob instanceof ArrayBuffer) {
      // For ArrayBuffer, we can't determine type, assume PDF as most common
      return await extractTextFromPDFArrayBuffer(fileOrBlob);
    } else if (fileOrBlob instanceof Blob) {
      blob = fileOrBlob;
      fileName = fileOrBlob.name || '';
      fileType = fileOrBlob.type || '';
    } else if (typeof fileOrBlob === 'string') {
      // Fetch URL (with timeout)
      blob = await fetchAsBlob(fileOrBlob, 30000);
      // Extract filename from URL if possible
      const urlParts = fileOrBlob.split('/');
      fileName = urlParts[urlParts.length - 1] || '';
      fileType = blob.type || '';
    } else {
      throw new Error('Unsupported input type. Expected File, Blob, ArrayBuffer, or URL string.');
    }

    // If we have a blob, determine file type and extract accordingly
    if (blob) {
      const extension = fileName.toLowerCase().split('.').pop() || '';
      
      // PDF files
      if (fileType === 'application/pdf' || extension === 'pdf') {
        try {
          const arrayBuffer = await readArrayBuffer(blob);
          return await extractTextFromPDFArrayBuffer(arrayBuffer);
        } catch (pdfError) {
          console.warn('PDF extraction failed, trying fallback:', pdfError.message);
          // For PDFs, blob.text() often produces binary garbage.
          // If pdf.js extraction fails (scanned/encrypted/corrupt), return a clean message.
          return `[PDF] Unable to extract selectable text from this PDF. It may be scanned (image-based), password-protected, or corrupted. File: ${fileName}`;
        }
      }

      // DOCX files
      if (
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        extension === 'docx'
      ) {
        try {
          const arrayBuffer = await readArrayBuffer(blob);
          const result = await extractTextFromDocxArrayBuffer(arrayBuffer);
          if (!result.trim()) {
            throw new Error('Extracted text is empty');
          }
          return result;
        } catch (docxError) {
          console.warn('DOCX extraction failed, trying fallback:', docxError.message);
          return await fallbackTextExtraction(blob, fileName, 'DOCX');
        }
      }

      // DOC files (legacy)
      if (fileType === 'application/msword' || extension === 'doc') {
        return await fallbackTextExtraction(blob, fileName, 'DOC (legacy format not fully supported)');
      }

      // TXT files
      if (fileType.startsWith('text/') || extension === 'txt') {
        return await fallbackTextExtraction(blob, fileName, 'Text file');
      }

      // RTF files
      if (fileType === 'application/rtf' || extension === 'rtf') {
        try {
          const text = await blob.text();
          // Basic RTF text extraction (remove RTF tags)
          const cleanText = text.replace(/\{\\[^}]+\}/g, '').replace(/\\[a-zA-Z]+\d*/g, '').replace(/[^\\}\{]+/g, ' ').trim();
          return cleanText || await fallbackTextExtraction(blob, fileName, 'RTF');
        } catch (rtfError) {
          return await fallbackTextExtraction(blob, fileName, 'RTF');
        }
      }

      // ODT files
      if (fileType === 'application/vnd.oasis.opendocument.text' || extension === 'odt') {
        return await fallbackTextExtraction(blob, fileName, 'ODT');
      }

      // PPT/PPTX files
      if (
        fileType === 'application/vnd.ms-powerpoint' ||
        fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        ['ppt', 'pptx'].includes(extension)
      ) {
        return await fallbackTextExtraction(blob, fileName, 'PowerPoint (text extraction limited)');
      }

      // XLS/XLSX files
      if (
        fileType === 'application/vnd.ms-excel' ||
        fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        ['xls', 'xlsx'].includes(extension)
      ) {
        return await fallbackTextExtraction(blob, fileName, 'Excel (text extraction limited)');
      }

      // Generic fallback for unknown file types
      return await fallbackTextExtraction(blob, fileName, 'Unknown file type');
    }

    return '';
  } catch (err) {
    console.error('extractTextFromFile error:', err);
    throw new Error(`Failed to extract text: ${err.message}`);
  }
};

// Helper function for fallback text extraction
const fallbackTextExtraction = async (blob, fileName, fileType) => {
  try {
    const text = await blob.text();
    
    // Check if the text looks like binary data (too many non-printable characters)
    const printableChars = text.replace(/[\x00-\x1F\x7F-\x9F]/g, '').length;
    const totalChars = text.length;
    const printableRatio = printableChars / totalChars;

    // Extra binary detection: replacement chars or lots of null bytes usually means binary
    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    const nullCount = (text.match(/\u0000/g) || []).length;
    if (nullCount > 0 || replacementCount / Math.max(1, totalChars) > 0.02) {
      return `[${fileType}] Binary file detected. Text extraction not supported for this format. File: ${fileName}`;
    }

    if (printableRatio < 0.3) {
      // Mostly binary data, can't extract meaningful text
      return `[${fileType}] Binary file detected. Text extraction not supported for this format. File: ${fileName}`;
    }

    if (text.trim().length === 0) {
      return `[${fileType}] Empty or unreadable file. File: ${fileName}`;
    }

    // Clean up the text
    const cleanText = text
      .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')  // Remove control characters
      .trim();

    if (cleanText.length > 50000) {
      // Limit text to prevent memory issues
      return `[${fileType}] Text extracted (first 50,000 characters):\n\n${cleanText.substring(0, 50000)}...\n\n[Text truncated due to length]`;
    }

    return `[${fileType}] Extracted text:\n\n${cleanText}`;
  } catch (fallbackError) {
    console.warn(`Fallback extraction failed for ${fileName}:`, fallbackError.message);
    return `[${fileType}] Unable to extract text from this file. The file may be corrupted, password-protected, or in a format that requires specialized software. File: ${fileName}`;
  }
};