
import jsPDF from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
// import * as JSZip from 'jszip';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const jpgToPdfModeBtn = document.getElementById('jpgToPdfMode');
const pdfToJpgModeBtn = document.getElementById('pdfToJpgMode');
const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const previewArea = document.getElementById('preview-area');
const convertBtn = document.getElementById('convert-btn');
const clearBtn = document.getElementById('clear-btn');
const header = document.querySelector('header');

let selectedFiles = [];
let conversionMode = 'jpgToPdf';

jpgToPdfModeBtn.addEventListener('click', () => switchMode('jpgToPdf'));
pdfToJpgModeBtn.addEventListener('click', () => switchMode('pdfToJpg'));
fileInput.addEventListener('change', handleFileSelect);
fileLabel.addEventListener('dragover', handleDragOver);
fileLabel.addEventListener('dragleave', handleDragLeave);
fileLabel.addEventListener('drop', handleDrop);
convertBtn.addEventListener('click', convertFiles);
clearBtn.addEventListener('click', clearSelection);

function switchMode(mode) {
    conversionMode = mode;
    jpgToPdfModeBtn.classList.toggle('active', mode === 'jpgToPdf');
    pdfToJpgModeBtn.classList.toggle('active', mode === 'pdfToJpg');
    fileInput.accept = mode === 'jpgToPdf' ? 'image/jpeg' : 'application/pdf';
    header.querySelector('p').textContent = mode === 'jpgToPdf'
        ? 'Upload JPG file(s) to convert them into a single PDF document.'
        : 'Upload PDF file(s) to convert each page to a JPG image.';
    clearSelection();
}

function handleFileSelect(event) {
    const files = event.target.files;
    handleFiles(files);
}

function handleDragOver(event) {
    event.preventDefault();
    fileLabel.classList.add('dragging');
}

function handleDragLeave(event) {
    event.preventDefault();
    fileLabel.classList.remove('dragging');
}

function handleDrop(event) {
    event.preventDefault();
    fileLabel.classList.remove('dragging');
    const files = event.dataTransfer.files;
    handleFiles(files);
}

function handleFiles(files) {
    selectedFiles = Array.from(files).filter(file => {
        if (conversionMode === 'jpgToPdf') {
            return file.type === 'image/jpeg';
        } else {
            return file.type === 'application/pdf';
        }
    });
    renderPreviews();
}

function renderPreviews() {
    previewArea.innerHTML = '';
    selectedFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            if (conversionMode === 'jpgToPdf') {
                const img = document.createElement('img');
                img.src = event.target.result;
                previewItem.appendChild(img);
            } else {
                previewItem.textContent = file.name;
            }
            previewArea.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
    });
}

function clearSelection() {
    selectedFiles = [];
    previewArea.innerHTML = '';
    fileInput.value = '';
}

async function convertFiles() {
    if (selectedFiles.length === 0) {
        alert('Please select files first.');
        return;
    }

    if (conversionMode === 'jpgToPdf') {
        await convertToPdf();
    } else {
        await convertToJpg();
    }
}

async function convertToPdf() {
    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4'
    });
    const margin = 40;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const img = await loadImage(URL.createObjectURL(file));

        const imgWidth = img.width;
        const imgHeight = img.height;
        const imgRatio = imgWidth / imgHeight;
        const pageRatio = usableWidth / usableHeight;

        let newWidth, newHeight;
        if (imgRatio > pageRatio) {
            newWidth = usableWidth;
            newHeight = newWidth / imgRatio;
        } else {
            newHeight = usableHeight;
            newWidth = newHeight * imgRatio;
        }

        const x = (pageWidth - newWidth) / 2;
        const y = (pageHeight - newHeight) / 2;

        if (i > 0) {
            pdf.addPage();
        }
        pdf.addImage(img, 'JPEG', x, y, newWidth, newHeight);
    }

    pdf.save('converted.pdf');
}

async function convertToJpg() {
    const zip = new JSZip();
    for (const file of selectedFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const imageData = canvas.toDataURL('image/jpeg', 0.9);
            zip.file(`${file.name.replace('.pdf', '')}-page-${i}.jpg`, imageData.split(',')[1], { base64: true });
        }
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'converted_images.zip';
    link.click();
    URL.revokeObjectURL(link.href);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}
