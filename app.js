const fileInput = document.querySelector('#pdf-file');
const fileStatus = document.querySelector('#file-status');

fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  fileStatus.textContent = file ? `${file.name} を選択済み` : '未選択';
});
