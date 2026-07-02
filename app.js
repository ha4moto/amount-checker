const fileInput = document.querySelector('#pdf-file');
const fileStatus = document.querySelector('#file-status');
const fileName = document.querySelector('#file-name');
const fileSize = document.querySelector('#file-size');
const filePages = document.querySelector('#file-pages');
const fileReady = document.querySelector('#file-ready');

const numberFormatter = new Intl.NumberFormat('ja-JP');

const resetFileMeta = () => {
  fileStatus.textContent = '未選択';
  fileName.textContent = '未選択';
  fileSize.textContent = '-';
  filePages.textContent = '-';
  fileReady.textContent = 'PDFを選択すると読み取り準備を確認します';
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

const countPdfPages = async (file) => {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder('latin1').decode(buffer);
  const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);

  return pageMatches?.length ?? 0;
};

const updateFileMeta = async (file) => {
  if (!file) {
    resetFileMeta();
    return;
  }

  fileStatus.textContent = '読み取り準備中';
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  filePages.textContent = '確認中...';
  fileReady.textContent = 'PDF構造を確認しています';

  try {
    const pages = await countPdfPages(file);
    filePages.textContent = pages > 0 ? `${numberFormatter.format(pages)}ページ` : '取得できませんでした';
    fileReady.textContent = pages > 0 ? '読み取り準備完了' : 'ページ数を確認できません。PDFを再選択してください';
    fileStatus.textContent = pages > 0 ? '選択済み' : '確認が必要です';
  } catch (error) {
    filePages.textContent = '取得できませんでした';
    fileReady.textContent = 'PDFを読み込めませんでした。別のファイルを選択してください';
    fileStatus.textContent = '読み取り失敗';
  }
};

fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  updateFileMeta(file);
});

resetFileMeta();
