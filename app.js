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
const amountStatus = document.querySelector('#amount-status');
const amountSource = document.querySelector('#amount-source');
const amountCandidateList = document.querySelector('#amount-candidate-list');
const previewStatus = document.querySelector('#preview-status');
const previewCanvas = document.querySelector('#pdf-preview');
const previewPlaceholder = document.querySelector('#preview-placeholder');
const ocrStatus = document.querySelector('#ocr-status');
const ocrText = document.querySelector('#ocr-text');

const numberFormatter = new Intl.NumberFormat('ja-JP');
let currentReadId = 0;
let currentSourceTexts = {
  pdfText: '',
  ocrText: '',
  pdfTextResolved: false,
  ocrTextResolved: false,
};

const TESSERACT_VERSION = '5.1.1';
const TESSERACT_MODULE_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.esm.min.js`;
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

const renderEmptyAmountCandidate = (message) => {
  amountCandidateList.replaceChildren();

  const row = document.createElement('tr');
  row.className = 'amount-candidate-empty';

  const cell = document.createElement('td');
  cell.colSpan = 4;
  cell.textContent = message;

  row.append(cell);
  amountCandidateList.append(row);
};

const resetAmountCandidates = () => {
  currentSourceTexts = {
    pdfText: '',
    ocrText: '',
    pdfTextResolved: false,
    ocrTextResolved: false,
  };
  amountStatus.textContent = 'PDFを選択すると、数量・単価・金額候補を一覧表示します。';
  amountSource.textContent = '利用テキスト: 未選択';
  renderEmptyAmountCandidate('まだPDFが選択されていません。');
};

const resetExtractedText = () => {
  textStatus.textContent = 'PDFを選択すると、ブラウザ内で抽出したテキストを表示します。';
  extractedText.textContent = 'まだPDFが選択されていません。';
  resetAmountCandidates();
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

const getTextContentLines = (textContent) => textContent.items
  .map((item) => item.str.trim())
  .filter(Boolean);

const formatPageText = (pageNumber, lines) => {
  const pageText = lines.join('\n');

  return [`--- ${pageNumber}ページ ---`, pageText || '（テキストを抽出できませんでした）'].join('\n');
};

const normalizeAmountText = (text) => text
  .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
  .replace(/[，]/g, ',')
  .replace(/[￥]/g, '¥')
  .replace(/[−－]/g, '-');

const parseCandidateNumber = (rawValue) => {
  const normalized = normalizeAmountText(rawValue)
    .replace(/[¥円\s,]/g, '');
  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
};

const hasAnyKeyword = (line, keywords) => keywords.some((keyword) => line.includes(keyword));

const summaryLineKeywords = [
  '小計',
  '消費税',
  '税額',
  '税率',
  '内税',
  '外税',
  '合計',
  '総合計',
  '請求額',
  '請求金額',
  '今回請求',
  '税抜',
  '税込',
  '課税対象',
];

const shouldSkipSummaryLine = (line) => hasAnyKeyword(normalizeAmountText(line), summaryLineKeywords);

const classifyAmountCandidate = ({ line, tokenIndex, tokens, value, rawValue }) => {
  const normalizedLine = normalizeAmountText(line);

  if (tokens.length >= 3) {
    if (tokenIndex === 0 && Number.isInteger(value) && value > 0 && value <= 999) {
      return '数量候補';
    }

    if (tokenIndex === tokens.length - 2 && value >= 100) {
      return '単価候補';
    }

    if (tokenIndex === tokens.length - 1) {
      return '金額候補';
    }
  }

  if (hasAnyKeyword(normalizedLine, ['数量', '個数'])) {
    return '数量候補';
  }

  if (hasAnyKeyword(normalizedLine, ['単価', '@', '＠'])) {
    return '単価候補';
  }

  if (hasAnyKeyword(normalizedLine, ['金額'])) {
    return '金額候補';
  }

  if (tokens.length === 2 && tokenIndex === 0 && Number.isInteger(value) && value > 0 && value <= 999) {
    return '数量候補';
  }

  if (tokens.length === 2 && tokenIndex === 1) {
    return '金額候補';
  }

  if (Number.isInteger(value) && value > 0 && value <= 999 && !rawValue.includes('¥')) {
    return '数量候補';
  }

  if (rawValue.includes('¥') || rawValue.includes('円') || value >= 1000) {
    return '金額候補';
  }

  return '金額候補';
};

const extractAmountCandidates = (text) => {
  const numberPattern = /(?:[¥￥]\s*)?-?\d[\d,]*(?:\.\d+)?\s*円?/g;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.flatMap((line, lineIndex) => {
    if (shouldSkipSummaryLine(line)) {
      return [];
    }

    const normalizedLine = normalizeAmountText(line);
    const tokens = Array.from(normalizedLine.matchAll(numberPattern))
      .filter((match) => normalizedLine[match.index + match[0].length] !== '%')
      .map((match) => ({
        rawValue: match[0].trim(),
        value: parseCandidateNumber(match[0]),
      }))
      .filter((token) => token.value !== null);

    return tokens.map((token, tokenIndex) => ({
      type: classifyAmountCandidate({
        line,
        tokenIndex,
        tokens,
        value: token.value,
        rawValue: token.rawValue,
      }),
      value: token.value,
      rawValue: token.rawValue,
      line,
      lineNumber: lineIndex + 1,
    }));
  });
};

const getCandidateSet = (source, text) => ({
  source,
  text,
  candidates: extractAmountCandidates(text),
});

const selectProcessingText = ({ pdfText, ocrText, pdfTextResolved, ocrTextResolved }) => {
  const trimmedPdfText = pdfText.trim();
  const trimmedOcrText = ocrText.trim();

  if (trimmedPdfText) {
    const pdfCandidateSet = getCandidateSet('PDF.js', trimmedPdfText);

    if (pdfCandidateSet.candidates.length) {
      return pdfCandidateSet;
    }
  }

  if (!pdfTextResolved) {
    return {
      source: '',
      text: '',
      candidates: [],
      status: 'waiting-pdf',
    };
  }

  if (!ocrTextResolved) {
    return {
      source: '',
      text: '',
      candidates: [],
      status: 'waiting-ocr',
    };
  }

  if (trimmedOcrText) {
    return getCandidateSet('OCR', trimmedOcrText);
  }

  if (trimmedPdfText) {
    return getCandidateSet('PDF.js', trimmedPdfText);
  }

  return {
    source: '',
    text: '',
    candidates: [],
    status: 'empty',
  };
};

const renderAmountCandidates = (readId) => {
  if (readId !== currentReadId) {
    return;
  }

  const selectedText = selectProcessingText(currentSourceTexts);

  if (!selectedText.text) {
    amountSource.textContent = '利用テキスト: PDF.js優先、候補不足時のみOCR';
    if (selectedText.status === 'waiting-pdf') {
      amountStatus.textContent = 'PDF.jsのテキスト抽出結果を待っています。';
    } else if (selectedText.status === 'waiting-ocr') {
      amountStatus.textContent = 'PDF.jsでは数量・単価・金額候補が十分に取れないため、OCR結果を待っています。';
    } else {
      amountStatus.textContent = 'PDF.jsとOCRのどちらからも数量・単価・金額候補を抽出できませんでした。';
    }
    renderEmptyAmountCandidate('まだ数量・単価・金額候補を抽出できていません。');
    return;
  }

  const { candidates } = selectedText;
  const displayedCandidates = candidates.slice(0, 80);
  amountSource.textContent = `利用テキスト: ${selectedText.source}`;
  amountStatus.textContent = candidates.length
    ? `${numberFormatter.format(candidates.length)}件の数量・単価・金額候補を抽出しました。今回は整合性チェックは行いません。`
    : `${selectedText.source}のテキストから数量・単価・金額候補を抽出できませんでした。`;

  if (!candidates.length) {
    renderEmptyAmountCandidate('数量・単価・金額候補は見つかりませんでした。');
    return;
  }

  amountCandidateList.replaceChildren();

  displayedCandidates.forEach((candidate) => {
    const row = document.createElement('tr');

    [
      candidate.type,
      numberFormatter.format(candidate.value),
      `${numberFormatter.format(candidate.lineNumber)}行目`,
      candidate.line,
    ].forEach((text) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    });

    amountCandidateList.append(row);
  });

  if (displayedCandidates.length < candidates.length) {
    const row = document.createElement('tr');
    row.className = 'amount-candidate-empty';

    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = `表示は先頭${numberFormatter.format(displayedCandidates.length)}件までです。`;

    row.append(cell);
    amountCandidateList.append(row);
  }
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
    currentSourceTexts.ocrTextResolved = true;
    renderAmountCandidates(readId);
    return;
  }

  if (readId !== currentReadId) {
    return;
  }

  try {
    worker = await createWorker('jpn+eng', 1, tesseractWorkerOptions);
    const { data } = await worker.recognize(previewCanvas);

    if (readId !== currentReadId) {
      return;
    }

    ocrStatus.textContent = 'OCR読み取り完了';
    ocrText.textContent = data.text || 'OCRで文字を読み取れませんでした。';
    currentSourceTexts.ocrText = data.text || '';
    currentSourceTexts.ocrTextResolved = true;
    renderAmountCandidates(readId);
  } catch (error) {
    if (readId !== currentReadId) {
      return;
    }

    ocrStatus.textContent = 'OCR読み取り失敗';
    ocrText.textContent = `OCRエラー: ${getErrorMessage(error)}`;
    currentSourceTexts.ocrTextResolved = true;
    renderAmountCandidates(readId);
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
  const sourceTextLines = [];

  try {
    await renderFirstPagePreview(pdf, readId);
    void runOcrOnPreviewCanvas(readId);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = getTextContentLines(textContent);
      pageTexts.push(formatPageText(pageNumber, lines));
      sourceTextLines.push(...lines);
    }

    return {
      pages: pdf.numPages,
      text: pageTexts.join('\n\n'),
      sourceText: sourceTextLines.join('\n'),
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
  resetAmountCandidates();
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
    currentSourceTexts.pdfText = result.sourceText;
    currentSourceTexts.pdfTextResolved = true;
    renderAmountCandidates(readId);
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
    currentSourceTexts.pdfTextResolved = true;
    currentSourceTexts.ocrTextResolved = true;
    renderAmountCandidates(readId);
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
