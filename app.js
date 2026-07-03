import { GlobalWorkerOptions, getDocument } from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs';

GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';

const fileInput = document.querySelector('#pdf-file');
const dropZone = document.querySelector('.drop-zone');
const fileStatus = document.querySelector('#file-status');
const fileName = document.querySelector('#file-name');
const fileSize = document.querySelector('#file-size');
const filePages = document.querySelector('#file-pages');
const fileReady = document.querySelector('#file-ready');
const extractedText = document.querySelector('#extracted-text');
const textStatus = document.querySelector('#text-status');
const previewStatus = document.querySelector('#preview-status');
const previewCanvas = document.querySelector('#pdf-preview');
const previewPlaceholder = document.querySelector('#preview-placeholder');
const ocrStatus = document.querySelector('#ocr-status');
const ocrText = document.querySelector('#ocr-text');

const numberFormatter = new Intl.NumberFormat('ja-JP');
let currentReadId = 0;

const TESSERACT_VERSION = '5.1.1';
const TESSERACT_MODULE_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.esm.min.js`;
const OCR_IMAGE_SCALE = 2;
let tesseractLoader;

const tesseractWorkerOptions = {
  workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`,
  corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`,
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
};

const logTesseractModuleShape = (module) => {
  console.log('[Tesseract.js dynamic import] module keys:', Object.keys(module || {}));
  console.log('[Tesseract.js dynamic import] module:', module);
  console.log('[Tesseract.js dynamic import] default export:', module?.default);
  console.log('[Tesseract.js dynamic import] globalThis.Tesseract:', globalThis.Tesseract);
};

const resolveTesseractCreateWorker = (module) => {
  logTesseractModuleShape(module);

  const candidates = [
    ['named export', module?.createWorker],
    ['default export object', module?.default?.createWorker],
    ['default export function', module?.default],
    ['module.Tesseract', module?.Tesseract?.createWorker],
    ['nested default export object', module?.default?.default?.createWorker],
    ['globalThis.Tesseract', globalThis.Tesseract?.createWorker],
  ];
  const [source, createWorker] = candidates.find(([, candidate]) => typeof candidate === 'function') || [];

  if (typeof createWorker !== 'function') {
    console.error('[Tesseract.js dynamic import] createWorker was not found in module/default/global candidates.');
    throw new Error('Tesseract.jsのcreateWorkerを利用できません。');
  }

  console.log(`[Tesseract.js dynamic import] createWorker source: ${source}`);
  return createWorker;
};

const loadTesseractCreateWorker = async () => {
  tesseractLoader ??= import(TESSERACT_MODULE_URL)
    .then(resolveTesseractCreateWorker)
    .catch((error) => {
      tesseractLoader = undefined;
      throw error;
    });

  return tesseractLoader;
};

const getErrorMessage = (error) => error?.message || String(error) || '不明なエラー';

const createPreprocessedOcrCanvas = (sourceCanvas) => {
  const ocrCanvas = document.createElement('canvas');
  ocrCanvas.width = Math.max(1, Math.floor(sourceCanvas.width * OCR_IMAGE_SCALE));
  ocrCanvas.height = Math.max(1, Math.floor(sourceCanvas.height * OCR_IMAGE_SCALE));

  const context = ocrCanvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sourceCanvas, 0, 0, ocrCanvas.width, ocrCanvas.height);

  const imageData = context.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114);
    pixels[index] = gray;
    pixels[index + 1] = gray;
    pixels[index + 2] = gray;
  }

  context.putImageData(imageData, 0, 0);

  return ocrCanvas;
};

const resetExtractedText = () => {
  textStatus.textContent = 'PDFを選択すると、ブラウザ内で抽出したテキストを表示します。';
  extractedText.textContent = 'まだPDFが選択されていません。';
};

const resetOcr = () => {
  ocrStatus.textContent = 'PDFを選択すると、1ページ目の画像プレビューをブラウザ内OCRで読み取ります。';
  ocrText.textContent = 'まだPDFが選択されていません。';
};

const resetPreview = () => {
  previewStatus.textContent = 'PDFを選択すると、1ページ目をブラウザ内で画像化して表示します。';
  previewPlaceholder.textContent = 'まだPDFが選択されていません。';
  previewPlaceholder.hidden = false;
  previewCanvas.hidden = true;
  previewCanvas.removeAttribute('width');
  previewCanvas.removeAttribute('height');
};

const resetFileMeta = () => {
  fileStatus.textContent = '未選択';
  fileName.textContent = '未選択';
  fileSize.textContent = '-';
  filePages.textContent = '-';
  fileReady.textContent = 'PDFを選択すると読み取り準備を確認します';
  resetExtractedText();
  resetPreview();
  resetOcr();
};

const formatFileSize = (bytes) => {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** unitIndex;
  const digits = unitIndex === 0 ? 0 : 1;

  return `${numberFormatter.format(Number(size.toFixed(digits)))} ${units[unitIndex]}`;
};

const formatPageText = (pageNumber, textContent) => {
  const lines = textContent.items
    .map((item) => item.str.trim())
    .filter(Boolean);
  const pageText = lines.join('\n');

  return [`--- ${pageNumber}ページ ---`, pageText || '（テキストを抽出できませんでした）'].join('\n');
};

const runOcrOnPreviewCanvas = async (readId) => {
  ocrStatus.textContent = 'OCRで文字を読み取っています';
  ocrText.textContent = 'OCRで文字を読み取っています...';

  let createWorker;
  let worker;

  try {
    createWorker = await loadTesseractCreateWorker();
  } catch (error) {
    if (readId !== currentReadId) {
      return;
    }

    ocrStatus.textContent = 'OCRライブラリを読み込めません';
    ocrText.textContent = `OCRライブラリを読み込めません。PDFアップロード、ファイル情報、ページ数、画像プレビュー、PDFテキスト抽出は利用できます。詳細: ${getErrorMessage(error)}`;
    return;
  }

  if (readId !== currentReadId) {
    return;
  }

  try {
    worker = await createWorker('jpn+eng', 1, tesseractWorkerOptions);
    const ocrCanvas = createPreprocessedOcrCanvas(previewCanvas);
    const { data } = await worker.recognize(ocrCanvas);

    if (readId !== currentReadId) {
      return;
    }

    ocrStatus.textContent = 'OCR読み取り完了';
    ocrText.textContent = data.text || 'OCRで文字を読み取れませんでした。';
  } catch (error) {
    if (readId !== currentReadId) {
      return;
    }

    ocrStatus.textContent = 'OCR読み取り失敗';
    ocrText.textContent = `OCRエラー: ${getErrorMessage(error)}`;
  } finally {
    if (worker && typeof worker.terminate === 'function') {
      await worker.terminate();
    }
  }
};

const renderFirstPagePreview = async (pdf, readId) => {
  previewStatus.textContent = 'PDFページを画像化しています';
  previewPlaceholder.textContent = 'PDFページを画像化しています';
  ocrStatus.textContent = 'PDF画像プレビューの準備完了後にOCRを実行します。';
  ocrText.textContent = 'OCR待機中...';
  previewPlaceholder.hidden = false;
  previewCanvas.hidden = true;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const context = previewCanvas.getContext('2d');

  previewCanvas.width = Math.floor(viewport.width);
  previewCanvas.height = Math.floor(viewport.height);

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  previewCanvas.hidden = false;
  previewPlaceholder.hidden = true;
  previewStatus.textContent = 'PDF画像化完了';

};

const extractPdfTextAndRenderPreview = async (file, readId) => {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pageTexts = [];

  try {
    await renderFirstPagePreview(pdf, readId);
    void runOcrOnPreviewCanvas(readId);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pageTexts.push(formatPageText(pageNumber, textContent));
    }

    return {
      pages: pdf.numPages,
      text: pageTexts.join('\n\n'),
    };
  } finally {
    await pdf.destroy();
  }
};

const updateFileMeta = async (file) => {
  currentReadId += 1;
  const readId = currentReadId;

  if (!file) {
    resetFileMeta();
    return;
  }

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    resetFileMeta();
    fileStatus.textContent = '選択エラー';
    fileReady.textContent = 'PDFファイルを選択してください';
    textStatus.textContent = 'PDF以外のファイルは読み込めません。';
    previewStatus.textContent = 'PDF以外のファイルは画像化できません。';
    previewPlaceholder.textContent = 'PDFファイルを選択してください。';
    ocrStatus.textContent = 'PDF以外のファイルはOCRできません。';
    ocrText.textContent = 'PDFファイルを選択してください。';
    return;
  }

  resetPreview();
  fileStatus.textContent = '読み取り中';
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  filePages.textContent = '確認中...';
  fileReady.textContent = 'PDF.jsでブラウザ内読み取りを実行しています';
  textStatus.textContent = 'PDFをサーバへ送信せず、ブラウザ内でテキストを抽出しています。';
  extractedText.textContent = '抽出中...';
  previewStatus.textContent = 'PDFページを画像化しています';
  previewPlaceholder.textContent = 'PDFページを画像化しています';
  ocrStatus.textContent = 'PDF画像プレビューの準備完了後にOCRを実行します。';
  ocrText.textContent = 'OCR待機中...';

  try {
    const result = await extractPdfTextAndRenderPreview(file, readId);

    if (readId !== currentReadId) {
      return;
    }
    filePages.textContent = `${numberFormatter.format(result.pages)}ページ`;
    fileReady.textContent = '読み取り準備完了（ブラウザ内処理）';
    fileStatus.textContent = '選択済み';
    textStatus.textContent = `${numberFormatter.format(result.pages)}ページ分のテキストを抽出しました。`;
    extractedText.textContent = result.text || 'テキストを抽出できませんでした。画像PDFの場合はOCRが必要です。';
  } catch (error) {
    if (readId !== currentReadId) {
      return;
    }

    filePages.textContent = '取得できませんでした';
    fileReady.textContent = 'PDFを読み込めませんでした。別のファイルを選択してください';
    fileStatus.textContent = '読み取り失敗';
    textStatus.textContent = 'PDF.jsでのテキスト抽出に失敗しました。';
    extractedText.textContent = 'PDFの形式や保護設定により、テキストを抽出できませんでした。';
    previewStatus.textContent = `PDF画像化失敗: ${getErrorMessage(error)}`;
    previewPlaceholder.textContent = `エラー: ${getErrorMessage(error) || 'PDFを画像化できませんでした。'}`;
    ocrStatus.textContent = 'OCR読み取り失敗';
    ocrText.textContent = `OCRエラー: PDF画像プレビューを作成できなかったためOCRを実行できませんでした。${getErrorMessage(error)}`;
    previewPlaceholder.hidden = false;
    previewCanvas.hidden = true;
  }
};

const handleFiles = (fileList) => {
  const [file] = fileList;
  updateFileMeta(file);
};

fileInput.addEventListener('change', (event) => {
  handleFiles(event.target.files);
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('drop-zone--active');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('drop-zone--active');
  });
});

dropZone.addEventListener('drop', (event) => {
  handleFiles(event.dataTransfer.files);
});

resetFileMeta();
