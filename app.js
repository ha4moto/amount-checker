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

const numberFormatter = new Intl.NumberFormat('ja-JP');
let currentReadId = 0;

const resetExtractedText = () => {
  textStatus.textContent = 'PDFを選択すると、ブラウザ内で抽出したテキストを表示します。';
  extractedText.textContent = 'まだPDFが選択されていません。';
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

const renderFirstPagePreview = async (pdf) => {
  previewStatus.textContent = 'PDFページを画像化しています';
  previewPlaceholder.textContent = 'PDFページを画像化しています';
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

const extractPdfTextAndRenderPreview = async (file) => {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pageTexts = [];

  try {
    await renderFirstPagePreview(pdf);

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

  try {
    const result = await extractPdfTextAndRenderPreview(file);

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
    previewStatus.textContent = `PDF画像化失敗: ${error.message || '不明なエラー'}`;
    previewPlaceholder.textContent = `エラー: ${error.message || 'PDFを画像化できませんでした。'}`;
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
